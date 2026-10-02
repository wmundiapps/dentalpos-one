import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getUserId, requireRole } from '../academico/middleware'
import { dateISO, mountCrud, pageParams, parseBody, qs } from '../core/crud'
import { audit, notify } from '../core/notify'
import { MODULO, hasRole, httpError, limitar, resolverTenantPublico, scheduleReminder, tid } from './common'
import { addDays, calcularIndicadoresEgressos } from './logic'
import { dadosPesquisaEgresso, responderPesquisaEgresso } from './pesquisa'

const GEST: any[] = ['SUPPORT', 'COORDINATOR', 'MARKETING']
const SITUACOES = ['EMPREGADO', 'AUTONOMO', 'EMPREENDEDOR', 'DESEMPREGADO', 'ESTUDANDO', 'CONCURSO', 'NAO_INFORMADO'] as const
const FAIXAS = ['ate_2sm', '2_5sm', '5_10sm', 'acima_10sm'] as const

const egressoSchema = z.object({
  studentId: z.string().optional(), nome: z.string().min(2).max(200), email: z.string().email().optional(), telefone: z.string().max(30).optional(), cpf: z.string().max(14).optional(),
  programId: z.string().optional(), programaNome: z.string().max(200).optional(), anoIngresso: z.number().int().min(1950).max(2100).optional(), anoConclusao: z.number().int().min(1950).max(2100).optional(),
  cidade: z.string().max(100).optional(), uf: z.string().length(2).optional(), consenteContato: z.boolean().default(true),
  situacaoProfissional: z.enum(SITUACOES).default('NAO_INFORMADO'), empregadorAtual: z.string().max(200).optional(), cargoAtual: z.string().max(150).optional(),
  atuaNaArea: z.boolean().optional(), cursandoPos: z.boolean().default(false), faixaSalarial: z.enum(FAIXAS).optional(), linkedin: z.string().url().max(300).optional(), primeiroEmpregoEm: dateISO().optional(),
})
const perfilSchema = egressoSchema.pick({ telefone: true, email: true, cidade: true, uf: true, consenteContato: true, situacaoProfissional: true, empregadorAtual: true, cargoAtual: true, atuaNaArea: true, cursandoPos: true, faixaSalarial: true, linkedin: true, primeiroEmpregoEm: true }).partial()

export interface FiltroCampanha { programId?: string; anoConclusaoDe?: number; anoConclusaoAte?: number; situacao?: string; uf?: string; semAtualizacaoDias?: number; canal?: 'EMAIL' | 'TELEFONE'; limite?: number }

// Lista para campanhas (recall) — consumida pelo módulo comunicacao. Respeita o consentimento (LGPD).
export async function listarEgressosParaCampanha(tenantId: string, f: FiltroCampanha = {}) {
  const where: any = { tenantId, consenteContato: true }
  if (f.programId) where.programId = f.programId
  if (f.anoConclusaoDe || f.anoConclusaoAte) where.anoConclusao = { ...(f.anoConclusaoDe ? { gte: f.anoConclusaoDe } : {}), ...(f.anoConclusaoAte ? { lte: f.anoConclusaoAte } : {}) }
  if (f.situacao) where.situacaoProfissional = f.situacao
  if (f.uf) where.uf = f.uf.toUpperCase()
  if (f.semAtualizacaoDias) where.OR = [{ ultimaAtualizacaoEm: null }, { ultimaAtualizacaoEm: { lt: addDays(new Date(), -f.semAtualizacaoDias) } }]
  if (f.canal === 'EMAIL') where.email = { not: null }
  else if (f.canal === 'TELEFONE') where.telefone = { not: null }
  else where.AND = [{ OR: [{ email: { not: null } }, { telefone: { not: null } }] }]
  const eg = await prisma.apoEgresso.findMany({ where, orderBy: { nome: 'asc' }, take: Math.min(f.limite ?? 5000, 20000), select: { id: true, nome: true, email: true, telefone: true, programId: true, programaNome: true, anoConclusao: true, situacaoProfissional: true, cidade: true, uf: true, ultimaAtualizacaoEm: true } })
  return eg
}

// Cria egressos a partir de alunos formados/concluídos (idempotente).
export async function sincronizarConcluintes(tenantId: string, limite = 1000) {
  const alunos = await prisma.student.findMany({ where: { tenantId, status: { in: ['FORMADO', 'CONCLUIDO'] } }, select: { id: true, nomeCompleto: true, cpf: true, userId: true }, take: limite })
  const existentes = new Set((await prisma.apoEgresso.findMany({ where: { tenantId, studentId: { in: alunos.map((a) => a.id) } }, select: { studentId: true } })).map((e) => e.studentId))
  const novos = alunos.filter((a) => !existentes.has(a.id))
  let criados = 0
  for (const a of novos) {
    const [u, mats] = await Promise.all([
      prisma.user.findFirst({ where: { id: a.userId, tenantId }, select: { email: true, phone: true } }),
      prisma.enrollment.findMany({ where: { studentId: a.id }, include: { program: { select: { id: true, nome: true } }, term: { select: { dataFim: true } } }, orderBy: { dataMatricula: 'asc' } }),
    ])
    const ult = [...mats].reverse().find((m) => m.status === 'CONCLUIDA') ?? mats[mats.length - 1]
    try {
      await prisma.apoEgresso.create({ data: { tenantId, studentId: a.id, nome: a.nomeCompleto, cpf: a.cpf ?? undefined, email: u?.email, telefone: u?.phone ?? undefined, programId: ult?.program.id, programaNome: ult?.program.nome, anoIngresso: mats[0]?.dataMatricula.getFullYear(), anoConclusao: (ult?.term.dataFim ?? new Date()).getFullYear() } })
      criados++
    } catch (e: any) { if (e?.code !== 'P2002') throw e }
  }
  return { analisados: alunos.length, criados }
}

export function mountEgressos(router: Router) {
  router.get('/egressos', requireRole(...GEST), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    for (const f of ['programId', 'situacaoProfissional', 'uf']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    if (qs(req.query.anoConclusao)) where.anoConclusao = Number(qs(req.query.anoConclusao))
    const q = qs(req.query.q)
    if (q) where.OR = [{ nome: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }, { empregadorAtual: { contains: q, mode: 'insensitive' } }]
    const [items, total] = await Promise.all([prisma.apoEgresso.findMany({ where, orderBy: { nome: 'asc' }, skip, take }), prisma.apoEgresso.count({ where })])
    res.json({ items, total, page, pageSize })
  }))

  router.post('/egressos', requireRole(...GEST), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(egressoSchema, req.body)
    if (b.studentId && !(await prisma.student.findFirst({ where: { id: b.studentId, tenantId }, select: { id: true } }))) throw httpError(404, 'Aluno não encontrado.')
    if (b.email && (await prisma.apoEgresso.findFirst({ where: { tenantId, email: b.email }, select: { id: true } }))) throw httpError(409, 'Já existe egresso com este e-mail.')
    const e = await prisma.apoEgresso.create({ data: { ...b, tenantId, ultimaAtualizacaoEm: b.situacaoProfissional !== 'NAO_INFORMADO' ? new Date() : null } })
    await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'EGRESSO_CRIADO', refType: 'ApoEgresso', refId: e.id })
    res.status(201).json(e)
  }))

  router.post('/egressos/importar-concluintes', requireRole(...GEST), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    res.json(await sincronizarConcluintes(tid(req), Math.min(5000, Number(req.body?.limite) || 1000)))
  }))

  // Autoatendimento do egresso (ainda com login de aluno)
  router.get('/egressos/meu-perfil', requireRole('STUDENT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const e = await prisma.apoEgresso.findFirst({ where: { tenantId: tid(req), studentId: req.user?.studentId ?? '__' }, include: { trajetoria: { orderBy: { inicio: 'desc' } } } })
    if (!e) throw httpError(404, 'Perfil de egresso não encontrado.')
    res.json(e)
  }))
  router.put('/egressos/meu-perfil', requireRole('STUDENT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const e = await prisma.apoEgresso.findFirst({ where: { tenantId, studentId: req.user?.studentId ?? '__' } })
    if (!e) throw httpError(404, 'Perfil de egresso não encontrado.')
    const b = parseBody(perfilSchema, req.body)
    res.json(await prisma.apoEgresso.update({ where: { id: e.id }, data: { ...b, ultimaAtualizacaoEm: new Date() } }))
  }))

  router.get('/egressos/indicadores', requireRole(...GEST), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const where: any = { tenantId }
    if (qs(req.query.programId)) where.programId = qs(req.query.programId)
    if (qs(req.query.anoConclusao)) where.anoConclusao = Number(qs(req.query.anoConclusao))
    const lista = await prisma.apoEgresso.findMany({ where, select: { situacaoProfissional: true, atuaNaArea: true, cursandoPos: true, faixaSalarial: true, anoConclusao: true, primeiroEmpregoEm: true, ultimaAtualizacaoEm: true, programId: true, programaNome: true } })
    const geral = calcularIndicadoresEgressos(lista)
    const porCurso: any[] = []
    if (!qs(req.query.programId)) {
      const grupos = new Map<string, typeof lista>()
      for (const e of lista) { const k = e.programaNome ?? e.programId ?? 'Sem curso'; grupos.set(k, [...(grupos.get(k) ?? []), e]) }
      for (const [curso, l] of grupos) { const i = calcularIndicadoresEgressos(l); porCurso.push({ curso, total: i.total, taxaInsercao: i.taxaInsercao, taxaAtuacaoNaArea: i.taxaAtuacaoNaArea, taxaInformacao: i.taxaInformacao }) }
    }
    res.json({ geral, porCurso: porCurso.sort((a, b) => b.total - a.total) })
  }))

  router.get('/egressos/recall', requireRole(...GEST), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const f: FiltroCampanha = { programId: qs(req.query.programId), situacao: qs(req.query.situacao), uf: qs(req.query.uf), canal: qs(req.query.canal) as any, anoConclusaoDe: Number(qs(req.query.anoConclusaoDe)) || undefined, anoConclusaoAte: Number(qs(req.query.anoConclusaoAte)) || undefined, semAtualizacaoDias: Number(qs(req.query.semAtualizacaoDias)) || undefined }
    const lista = await listarEgressosParaCampanha(tid(req), f)
    res.json({ total: lista.length, items: lista })
  }))

  // Solicita atualização de cadastro (usa a caixa de saída; o módulo comunicacao despacha).
  router.post('/egressos/recall/solicitar-atualizacao', requireRole(...GEST), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const lista = await listarEgressosParaCampanha(tenantId, { semAtualizacaoDias: Number(req.body?.semAtualizacaoDias) || 365, programId: req.body?.programId, limite: 2000 })
    let enviados = 0
    for (const e of lista) {
      const canal = e.email ? 'EMAIL' : 'WHATSAPP'
      await notify({ tenantId, canal, destino: e.email ?? e.telefone ?? undefined, assunto: 'Conte como está sua carreira!', mensagem: `Olá, ${e.nome}! Queremos acompanhar sua trajetória profissional e convidá-lo(a) para nossas ações com egressos. Atualize seu cadastro no portal.`, templateKey: 'apoio.egresso.atualizacao', refType: 'ApoEgresso', refId: e.id })
      enviados++
    }
    await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'EGRESSOS_RECALL', detalhes: { enviados } })
    res.json({ enviados })
  }))

  router.get('/egressos/:id', requireRole(...GEST), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const e = await prisma.apoEgresso.findFirst({ where: { id: String(req.params.id), tenantId: tid(req) }, include: { trajetoria: { orderBy: { inicio: 'desc' } }, participacoes: { include: { evento: { select: { titulo: true, dataHora: true } } } } } })
    if (!e) throw httpError(404, 'Egresso não encontrado.')
    res.json(e)
  }))

  router.patch('/egressos/:id', requireRole(...GEST), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const e = await prisma.apoEgresso.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!e) throw httpError(404, 'Egresso não encontrado.')
    const b = parseBody(egressoSchema.partial(), req.body)
    delete (b as any).studentId
    res.json(await prisma.apoEgresso.update({ where: { id: e.id }, data: { ...b, ultimaAtualizacaoEm: new Date() } }))
  }))

  // Direito ao esquecimento (LGPD): remove dados pessoais mantendo o registro estatístico.
  router.post('/egressos/:id/anonimizar', requireRole('SUPPORT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const e = await prisma.apoEgresso.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!e) throw httpError(404, 'Egresso não encontrado.')
    await prisma.apoEgresso.update({ where: { id: e.id }, data: { nome: 'ANONIMIZADO', email: null, telefone: null, cpf: null, linkedin: null, empregadorAtual: null, cargoAtual: null, consenteContato: false, studentId: null } })
    await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'EGRESSO_ANONIMIZADO', refType: 'ApoEgresso', refId: e.id })
    res.json({ ok: true })
  }))

  router.post('/egressos/:id/trajetoria', requireRole(...GEST, 'STUDENT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const e = await prisma.apoEgresso.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!e) throw httpError(404, 'Egresso não encontrado.')
    if (req.user?.role === 'STUDENT' && e.studentId !== req.user.studentId) throw httpError(404, 'Egresso não encontrado.')
    const b = parseBody(z.object({ tipo: z.enum(['EMPREGO', 'POS_GRADUACAO', 'EMPREENDEDORISMO', 'CONCURSO', 'OUTRO']).default('EMPREGO'), organizacao: z.string().min(2).max(200), cargo: z.string().max(150).optional(), inicio: dateISO(), fim: dateISO().optional(), atuaNaArea: z.boolean().optional(), faixaSalarial: z.enum(FAIXAS).optional() }), req.body)
    if (b.fim && b.fim < b.inicio) throw httpError(400, 'Fim anterior ao início.')
    const t = await prisma.apoEgressoTrajetoria.create({ data: { ...b, tenantId, egressoId: e.id } })
    const aberta = !b.fim
    const data: any = { ultimaAtualizacaoEm: new Date() }
    if (aberta) {
      if (b.tipo === 'EMPREGO') Object.assign(data, { situacaoProfissional: 'EMPREGADO', empregadorAtual: b.organizacao, cargoAtual: b.cargo, atuaNaArea: b.atuaNaArea ?? e.atuaNaArea, faixaSalarial: b.faixaSalarial ?? e.faixaSalarial })
      if (b.tipo === 'EMPREENDEDORISMO') Object.assign(data, { situacaoProfissional: 'EMPREENDEDOR', empregadorAtual: b.organizacao, cargoAtual: b.cargo })
      if (b.tipo === 'POS_GRADUACAO') data.cursandoPos = true
      if (b.tipo === 'CONCURSO') data.situacaoProfissional = 'CONCURSO'
    }
    if (['EMPREGO', 'EMPREENDEDORISMO'].includes(b.tipo) && !e.primeiroEmpregoEm) data.primeiroEmpregoEm = b.inicio
    await prisma.apoEgresso.update({ where: { id: e.id }, data })
    res.status(201).json(t)
  }))

  // ---------- eventos de relacionamento ----------
  mountCrud(router, { model: 'apoEventoEgresso', path: '/egressos-eventos', read: GEST, write: GEST, readAll: true, create: z.object({ titulo: z.string().min(3).max(200), tipo: z.enum(['ENCONTRO', 'PALESTRA', 'NETWORKING', 'CURSO', 'HOMECOMING', 'FEIRA_CARREIRAS']).default('ENCONTRO'), descricao: z.string().max(4000).optional(), dataHora: dateISO(), local: z.string().max(200).optional(), vagas: z.number().int().min(1).optional(), programId: z.string().optional(), status: z.enum(['PLANEJADO', 'ABERTO', 'REALIZADO', 'CANCELADO']).default('ABERTO') }), filters: ['status', 'tipo'], orderBy: { dataHora: 'desc' }, modulo: MODULO,
    afterCreate: async (row: any) => { await scheduleReminder({ tenantId: row.tenantId, modulo: MODULO, titulo: `Evento de egressos: ${row.titulo}`, dueAt: row.dataHora, antecedenciaDias: 7, assigneeRole: 'SUPPORT', refType: 'ApoEventoEgresso', refId: row.id, dedupeKey: `apo-evento-eg-${row.id}` }) } })

  router.post('/egressos-eventos/:id/participantes', requireRole(...GEST), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const ev = await prisma.apoEventoEgresso.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!ev) throw httpError(404, 'Evento não encontrado.')
    if (ev.status !== 'ABERTO') throw httpError(422, `Evento ${ev.status}.`)
    const b = parseBody(z.object({ egressoId: z.string() }), req.body)
    const eg = await prisma.apoEgresso.findFirst({ where: { id: b.egressoId, tenantId } })
    if (!eg) throw httpError(404, 'Egresso não encontrado.')
    if (ev.vagas) { const n = await prisma.apoEventoParticipante.count({ where: { tenantId, eventoId: ev.id, status: { not: 'CANCELADO' } } }); if (n >= ev.vagas) throw httpError(409, 'Evento lotado.') }
    const p = await prisma.apoEventoParticipante.create({ data: { tenantId, eventoId: ev.id, egressoId: eg.id } })
    if (eg.consenteContato && (eg.email || eg.telefone)) await notify({ tenantId, canal: eg.email ? 'EMAIL' : 'WHATSAPP', destino: eg.email ?? eg.telefone ?? undefined, assunto: `Presença confirmada: ${ev.titulo}`, mensagem: `Sua presença em "${ev.titulo}" (${ev.dataHora.toLocaleString('pt-BR')}${ev.local ? ', ' + ev.local : ''}) está confirmada.`, refType: 'ApoEventoEgresso', refId: ev.id })
    res.status(201).json(p)
  }))

  router.post('/egressos-eventos/:id/presenca', requireRole(...GEST), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ presentes: z.array(z.string()), encerrar: z.boolean().optional() }), req.body)
    const ev = await prisma.apoEventoEgresso.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!ev) throw httpError(404, 'Evento não encontrado.')
    await prisma.apoEventoParticipante.updateMany({ where: { tenantId, eventoId: ev.id, egressoId: { in: b.presentes } }, data: { status: 'PRESENTE' } })
    if (b.encerrar) { await prisma.apoEventoParticipante.updateMany({ where: { tenantId, eventoId: ev.id, status: 'CONFIRMADO' }, data: { status: 'FALTOU' } }); await prisma.apoEventoEgresso.update({ where: { id: ev.id }, data: { status: 'REALIZADO' } }) }
    res.json({ ok: true })
  }))
}

// Rotas públicas: pesquisa de egressos por convite (código HMAC).
export function mountEgressosPublic(pub: Router) {
  const ip = (req: Request) => String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'ip').split(',')[0].trim()
  pub.get('/pesquisa-egresso/:tenant/:aplicacaoId', asyncHandler(async (req: Request, res: Response) => {
    if (!limitar(`pesq-eg:${ip(req)}`, 40, 600_000)) throw httpError(429, 'Muitas tentativas.')
    const tenantId = await resolverTenantPublico(String(req.params.tenant))
    if (!tenantId) throw httpError(404, 'Pesquisa não encontrada.')
    res.json(await dadosPesquisaEgresso(tenantId, String(req.params.aplicacaoId), String(req.query.egressoId ?? ''), String(req.query.codigo ?? '')))
  }))
  pub.post('/pesquisa-egresso/:tenant/:aplicacaoId', asyncHandler(async (req: Request, res: Response) => {
    if (!limitar(`pesq-eg-p:${ip(req)}`, 20, 600_000)) throw httpError(429, 'Muitas tentativas.')
    const tenantId = await resolverTenantPublico(String(req.params.tenant))
    if (!tenantId) throw httpError(404, 'Pesquisa não encontrada.')
    await responderPesquisaEgresso(tenantId, String(req.params.aplicacaoId), String(req.body?.egressoId ?? ''), String(req.body?.codigo ?? ''), { respostas: req.body?.respostas ?? {}, nps: req.body?.nps, comentario: req.body?.comentario })
    res.status(201).json({ ok: true, mensagem: 'Obrigado por responder!' })
  }))
}

export async function jobEgressos() {
  const tenants = await prisma.student.findMany({ where: { status: { in: ['FORMADO', 'CONCLUIDO'] } }, distinct: ['tenantId'], select: { tenantId: true }, take: 200 })
  const out: Record<string, unknown> = {}
  for (const t of tenants) out[t.tenantId] = await sincronizarConcluintes(t.tenantId, 2000)
  return out
}
