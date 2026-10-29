import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { dateISO, pageParams, parseBody, qs } from '../core/crud'
import { audit } from '../core/notify'
import { scheduleReminder } from '../core/reminders'
import { DAY, addDias, delegateOpcional, enviarCsv, fail, soDigitos, somar, toCsv } from './util2'

// Acordos e convênios (cadastro executivo): vigência, alertas, aditivos/renovações e integração
// com o módulo Jurídico (JurContrato) e com estágios (ApoEmpresa), sem depender deles.

const TIPOS = ['CONVENIO', 'ACORDO_COOPERACAO', 'TERMO_PARCERIA', 'CONTRATO', 'ESTAGIO', 'INTERNACIONAL', 'OUTRO'] as const
const STATUS = ['RASCUNHO', 'EM_NEGOCIACAO', 'VIGENTE', 'SUSPENSO', 'ENCERRADO', 'RESCINDIDO'] as const
const LEITURA = ['COORDINATOR', 'SECRETARY'] as const

export type SituacaoConvenio = 'VIGENTE' | 'VENCENDO' | 'VENCIDO' | 'SEM_PRAZO' | 'INATIVO'

/** Situação de vigência (pura). `faixa` indica a urgência do alerta: 30/60/90 dias (ou configurados). */
export function situacaoConvenio(c: { status: string; fim: Date | null; vigenciaIndeterminada: boolean; avisoDias: number[] }, now = new Date()): { situacao: SituacaoConvenio; diasRestantes: number | null; faixa: 'CRITICO' | 'ATENCAO' | 'INFO' | null } {
  if (c.status !== 'VIGENTE') return { situacao: 'INATIVO', diasRestantes: null, faixa: null }
  if (c.vigenciaIndeterminada || !c.fim) return { situacao: 'SEM_PRAZO', diasRestantes: null, faixa: null }
  const dias = Math.ceil((c.fim.getTime() - now.getTime()) / DAY)
  if (dias < 0) return { situacao: 'VENCIDO', diasRestantes: dias, faixa: 'CRITICO' }
  const avisos = [...(c.avisoDias?.length ? c.avisoDias : [90, 60, 30])].sort((a, b) => a - b)
  if (dias > avisos[avisos.length - 1]) return { situacao: 'VIGENTE', diasRestantes: dias, faixa: null }
  const menor = avisos[0]
  return { situacao: 'VENCENDO', diasRestantes: dias, faixa: dias <= menor ? 'CRITICO' : dias <= (avisos[1] ?? menor) ? 'ATENCAO' : 'INFO' }
}

const enriquecer = (c: any, now = new Date()) => ({ ...c, ...situacaoConvenio(c, now) })

const schemaBase = z.object({
  numero: z.string().trim().min(1).max(60),
  tipo: z.enum(TIPOS).default('CONVENIO'),
  titulo: z.string().trim().min(2).max(300),
  objeto: z.string().max(5000).optional(),
  parteNome: z.string().trim().min(2).max(300),
  parteCnpj: z.string().max(30).optional(),
  parteTipo: z.enum(['EMPRESA', 'IES', 'ORGAO_PUBLICO', 'ONG', 'OUTRO']).default('EMPRESA'),
  abrangencia: z.enum(['NACIONAL', 'INTERNACIONAL']).default('NACIONAL'),
  pais: z.string().max(80).optional(),
  area: z.string().max(120).optional(),
  programId: z.string().optional(),
  responsavelUserId: z.string().optional(),
  responsavelNome: z.string().max(200).optional(),
  assinadoEm: dateISO().optional(),
  inicio: dateISO(),
  fim: dateISO().optional(),
  vigenciaIndeterminada: z.boolean().optional(),
  renovacaoAutomatica: z.boolean().optional(),
  avisoDias: z.array(z.number().int().min(1).max(730)).min(1).max(6).optional(),
  valor: z.number().min(0).max(1e12).optional(),
  status: z.enum(STATUS).optional(),
  juridicoRef: z.string().max(100).optional(),
  apoEmpresaId: z.string().optional(),
  observacoes: z.string().max(5000).optional(),
})

function validar(d: { inicio?: Date; fim?: Date | null; vigenciaIndeterminada?: boolean | null; status?: string; parteCnpj?: string | null; abrangencia?: string | null }) {
  if (d.inicio && d.fim && d.fim < d.inicio) fail(400, 'O fim da vigência deve ser posterior ao início.')
  if (!d.vigenciaIndeterminada && !d.fim && (d.status === undefined || d.status === 'VIGENTE')) fail(400, 'Informe o fim da vigência ou marque "vigência indeterminada".')
  if (d.parteCnpj && d.abrangencia !== 'INTERNACIONAL' && soDigitos(d.parteCnpj).length !== 14) fail(400, 'CNPJ da parte deve ter 14 dígitos.')
}

export async function agendarAlertasConvenio(c: any) {
  const tenantId = c.tenantId
  // cancela alertas anteriores se não está mais vigente
  if (c.status !== 'VIGENTE' || !c.fim || c.vigenciaIndeterminada) {
    await prisma.eduReminder.updateMany({ where: { tenantId, refType: 'ReiConvenio', refId: c.id, status: { in: ['PENDENTE', 'NOTIFICADO', 'ADIADO'] } }, data: { status: 'CANCELADO' } })
    return 0
  }
  let n = 0
  const avisos = (c.avisoDias?.length ? c.avisoDias : [90, 60, 30]) as number[]
  const chaves = avisos.map((d) => `rei-conv:${c.id}:${d}:${c.fim.toISOString().slice(0, 10)}`)
  // alertas de vigências antigas (antes de renovação/aditivo) deixam de valer
  await prisma.eduReminder.updateMany({ where: { tenantId, refType: 'ReiConvenio', refId: c.id, status: { in: ['PENDENTE', 'NOTIFICADO', 'ADIADO'] }, NOT: { dedupeKey: { in: chaves } } }, data: { status: 'CANCELADO' } })
  for (const d of avisos) {
    const remindAt = addDias(c.fim, -d)
    await scheduleReminder({
      tenantId, modulo: 'reitoria', titulo: `Convênio ${c.numero} vence em ${d} dias`, descricao: `${c.titulo} — ${c.parteNome}`, dueAt: c.fim, remindAt: remindAt < new Date() ? new Date() : remindAt,
      severity: d <= 30 ? 'CRITICO' : d <= 60 ? 'ATENCAO' : 'INFO', refType: 'ReiConvenio', refId: c.id, assigneeUserId: c.responsavelUserId ?? undefined, assigneeRole: c.responsavelUserId ? undefined : 'RECTOR',
      dedupeKey: `rei-conv:${c.id}:${d}:${c.fim.toISOString().slice(0, 10)}`,
    })
    n++
  }
  return n
}

export async function painelConvenios(tenantId: string, now = new Date()) {
  const rows = await prisma.reiConvenio.findMany({ where: { tenantId }, orderBy: { fim: 'asc' }, take: 5000 })
  const e = rows.map((c) => enriquecer(c, now))
  const contar = (f: (c: any) => string) => e.reduce<Record<string, number>>((m, c) => { const k = f(c); m[k] = (m[k] ?? 0) + 1; return m }, {})
  const vigentes = e.filter((c) => c.status === 'VIGENTE')
  const dentro = (d: number) => vigentes.filter((c) => c.diasRestantes != null && c.diasRestantes >= 0 && c.diasRestantes <= d).length
  return {
    total: e.length, vigentes: vigentes.length, vencidosNaoEncerrados: vigentes.filter((c) => c.situacao === 'VENCIDO').length,
    vencendoEm30: dentro(30), vencendoEm60: dentro(60), vencendoEm90: dentro(90), semPrazo: vigentes.filter((c) => c.situacao === 'SEM_PRAZO').length,
    valorVigente: somar(vigentes.map((c) => c.valor)), internacionais: vigentes.filter((c) => c.abrangencia === 'INTERNACIONAL').length,
    porTipo: contar((c) => c.tipo), porStatus: contar((c) => c.status), porSituacao: contar((c) => c.situacao),
    alertas: vigentes.filter((c) => ['VENCIDO', 'VENCENDO'].includes(c.situacao)).sort((a, b) => (a.diasRestantes ?? 0) - (b.diasRestantes ?? 0)).slice(0, 30)
      .map((c) => ({ id: c.id, numero: c.numero, titulo: c.titulo, parteNome: c.parteNome, fim: c.fim, diasRestantes: c.diasRestantes, situacao: c.situacao, faixa: c.faixa })),
  }
}

/** Job diário: reagenda alertas dos convênios vigentes e marca a situação. */
export async function jobConvenios() {
  const rows = await prisma.reiConvenio.findMany({ where: { status: 'VIGENTE', vigenciaIndeterminada: false, fim: { not: null } }, take: 10_000 })
  let alertas = 0
  for (const c of rows) { try { alertas += await agendarAlertasConvenio(c) } catch { /* isolado */ } }
  return { convenios: rows.length, alertas }
}

export function registerConvenios(router: Router) {
  router.get('/convenios', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const where: any = { tenantId }
    for (const k of ['tipo', 'status', 'abrangencia', 'parteTipo']) { const v = qs((req.query as any)[k]); if (v) where[k] = v }
    if (where.tipo && !(TIPOS as readonly string[]).includes(where.tipo)) fail(400, 'Tipo inválido.')
    if (where.status && !(STATUS as readonly string[]).includes(where.status)) fail(400, 'Status inválido.')
    const q = qs(req.query.q)
    if (q) where.OR = [{ titulo: { contains: q, mode: 'insensitive' } }, { parteNome: { contains: q, mode: 'insensitive' } }, { numero: { contains: q, mode: 'insensitive' } }, { objeto: { contains: q, mode: 'insensitive' } }]
    const sit = qs(req.query.situacao)
    const todos = (await prisma.reiConvenio.findMany({ where, orderBy: [{ fim: 'asc' }, { createdAt: 'desc' }], take: 5000 })).map((c) => enriquecer(c))
    const filtrados = sit ? todos.filter((c) => c.situacao === sit) : todos
    if (qs(req.query.formato) === 'csv') {
      return enviarCsv(res, 'convenios', toCsv(
        [{ key: 'numero', label: 'Número' }, { key: 'tipo', label: 'Tipo' }, { key: 'titulo', label: 'Título' }, { key: 'parteNome', label: 'Parte' }, { key: 'parteCnpj', label: 'CNPJ' }, { key: 'inicio', label: 'Início' }, { key: 'fim', label: 'Fim' }, { key: 'situacao', label: 'Situação' }, { key: 'diasRestantes', label: 'Dias restantes' }, { key: 'valor', label: 'Valor' }, { key: 'status', label: 'Status' }, { key: 'responsavelNome', label: 'Responsável' }],
        filtrados.map((c) => ({ ...c, inicio: c.inicio.toISOString().slice(0, 10), fim: c.fim?.toISOString().slice(0, 10) })),
      ))
    }
    const { skip, take, page, pageSize } = pageParams(req.query)
    res.json({ items: filtrados.slice(skip, skip + take), total: filtrados.length, page, pageSize })
  }))

  router.get('/convenios/painel', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    res.json(await painelConvenios(getTenantId(req)))
  }))

  // Candidatos do Jurídico (JurContrato de tipo convênio/parceria/cooperação) ainda não cadastrados aqui.
  router.get('/convenios/juridico', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d = delegateOpcional('jurContrato')
    if (!d) return res.json({ disponivel: false, itens: [] })
    const rows = await d.findMany({ where: { tenantId, tipo: { in: ['CONVENIO', 'COOPERACAO', 'PARCERIA'] } }, take: 500 })
    const ja = new Set((await prisma.reiConvenio.findMany({ where: { tenantId, juridicoRef: { not: null } }, select: { juridicoRef: true } })).map((c) => c.juridicoRef))
    res.json({ disponivel: true, itens: rows.map((r: any) => ({ id: r.id, codigo: r.codigo, tipo: r.tipo, contraparteNome: r.contraparteNome, vigenciaInicio: r.vigenciaInicio, vigenciaFim: r.vigenciaFim, status: r.status, jaImportado: ja.has(r.id) })) })
  }))

  router.post('/convenios/importar-juridico', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d = delegateOpcional('jurContrato')
    if (!d) return res.json({ disponivel: false, importados: 0, ignorados: 0 })
    const rows = await d.findMany({ where: { tenantId, tipo: { in: ['CONVENIO', 'COOPERACAO', 'PARCERIA'] }, status: { in: ['VIGENTE', 'ENCERRADO', 'RESCINDIDO'] } }, take: 1000 })
    let importados = 0, ignorados = 0
    for (const r of rows) {
      const numero = `JUR-${r.codigo}`
      if (await prisma.reiConvenio.findFirst({ where: { tenantId, OR: [{ juridicoRef: r.id }, { numero }] }, select: { id: true } })) { ignorados++; continue }
      const c = await prisma.reiConvenio.create({
        data: {
          tenantId, numero, tipo: r.tipo === 'COOPERACAO' ? 'ACORDO_COOPERACAO' : r.tipo === 'PARCERIA' ? 'TERMO_PARCERIA' : 'CONVENIO', titulo: String(r.objeto).slice(0, 300), objeto: r.objeto, parteNome: r.contraparteNome, parteCnpj: r.contraparteDoc ?? undefined,
          inicio: r.vigenciaInicio, fim: r.vigenciaFim ?? undefined, vigenciaIndeterminada: !r.vigenciaFim, renovacaoAutomatica: !!r.renovacaoAutomatica, valor: r.valor ?? undefined,
          status: r.status === 'RESCINDIDO' ? 'RESCINDIDO' : r.status === 'ENCERRADO' ? 'ENCERRADO' : 'VIGENTE', juridicoRef: r.id, responsavelUserId: r.responsavelUserId ?? undefined, responsavelNome: r.responsavelNome ?? undefined,
        },
      })
      await agendarAlertasConvenio(c)
      importados++
    }
    res.json({ disponivel: true, importados, ignorados })
  }))

  // Convênios de estágio (ApoEmpresa com convenioFim) -> cadastro executivo.
  router.post('/convenios/importar-estagio', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const emps = await prisma.apoEmpresa.findMany({ where: { tenantId, convenioNumero: { not: null }, convenioInicio: { not: null } }, take: 2000 })
    let importados = 0, ignorados = 0
    for (const e of emps) {
      const numero = e.convenioNumero!
      if (await prisma.reiConvenio.findFirst({ where: { tenantId, OR: [{ apoEmpresaId: e.id }, { numero }] }, select: { id: true } })) { ignorados++; continue }
      const c = await prisma.reiConvenio.create({
        data: {
          tenantId, numero, tipo: 'ESTAGIO', titulo: `Convênio de estágio — ${e.nomeFantasia ?? e.razaoSocial}`, parteNome: e.razaoSocial, parteCnpj: e.cnpj ?? undefined, parteTipo: 'EMPRESA', area: 'Estágio',
          inicio: e.convenioInicio!, fim: e.convenioFim ?? undefined, vigenciaIndeterminada: !e.convenioFim, status: e.status === 'ATIVA' ? 'VIGENTE' : 'ENCERRADO', apoEmpresaId: e.id,
        },
      })
      await agendarAlertasConvenio(c)
      importados++
    }
    res.json({ importados, ignorados })
  }))

  router.get('/convenios/:id', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const c = await prisma.reiConvenio.findFirst({ where: { id: String(req.params.id), tenantId: getTenantId(req) }, include: { eventos: { orderBy: { data: 'desc' } } } })
    if (!c) return res.status(404).json({ error: 'Convênio não encontrado.' })
    res.json(enriquecer(c))
  }))

  router.post('/convenios', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(schemaBase, req.body)
    validar({ ...b, vigenciaIndeterminada: b.vigenciaIndeterminada })
    if (await prisma.reiConvenio.findUnique({ where: { tenantId_numero: { tenantId, numero: b.numero } } })) fail(409, 'Já existe convênio com este número.')
    const row = await prisma.reiConvenio.create({ data: { ...b, tenantId, parteCnpj: b.parteCnpj ? soDigitos(b.parteCnpj) || b.parteCnpj : undefined } })
    await agendarAlertasConvenio(row)
    await audit({ tenantId, userId: getUserId(req), modulo: 'reitoria', acao: 'CONVENIO_CRIAR', refType: 'ReiConvenio', refId: row.id })
    res.status(201).json(enriquecer(row))
  }))

  router.patch('/convenios/:id', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const cur = await prisma.reiConvenio.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!cur) return res.status(404).json({ error: 'Convênio não encontrado.' })
    const b = parseBody(schemaBase.partial(), req.body)
    validar({ inicio: b.inicio ?? cur.inicio, fim: b.fim === undefined ? cur.fim : b.fim, vigenciaIndeterminada: b.vigenciaIndeterminada ?? cur.vigenciaIndeterminada, status: b.status ?? cur.status, parteCnpj: b.parteCnpj, abrangencia: b.abrangencia ?? cur.abrangencia })
    if (b.numero && b.numero !== cur.numero && (await prisma.reiConvenio.findUnique({ where: { tenantId_numero: { tenantId, numero: b.numero } } }))) fail(409, 'Já existe convênio com este número.')
    const row = await prisma.reiConvenio.update({ where: { id: cur.id }, data: b })
    await agendarAlertasConvenio(row)
    await audit({ tenantId, userId: getUserId(req), modulo: 'reitoria', acao: 'CONVENIO_ATUALIZAR', refType: 'ReiConvenio', refId: cur.id })
    res.json(enriquecer(row))
  }))

  router.delete('/convenios/:id', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const cur = await prisma.reiConvenio.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!cur) return res.status(404).json({ error: 'Convênio não encontrado.' })
    if (cur.status === 'VIGENTE') fail(409, 'Convênio vigente não pode ser excluído: encerre ou rescinda antes.')
    await prisma.eduReminder.updateMany({ where: { tenantId, refType: 'ReiConvenio', refId: cur.id, status: { in: ['PENDENTE', 'NOTIFICADO', 'ADIADO'] } }, data: { status: 'CANCELADO' } })
    await prisma.reiConvenio.delete({ where: { id: cur.id } })
    await audit({ tenantId, userId: getUserId(req), modulo: 'reitoria', acao: 'CONVENIO_REMOVER', refType: 'ReiConvenio', refId: cur.id })
    res.status(204).end()
  }))

  // aditivo / renovação / rescisão / nota (histórico)
  router.post('/convenios/:id/eventos', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const cur = await prisma.reiConvenio.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!cur) return res.status(404).json({ error: 'Convênio não encontrado.' })
    const b = parseBody(z.object({ tipo: z.enum(['ADITIVO', 'RENOVACAO', 'ALTERACAO', 'RESCISAO', 'NOTA']), descricao: z.string().trim().min(2).max(2000), novoFim: dateISO().optional(), valor: z.number().min(0).optional(), data: dateISO().optional() }), req.body)
    if (['ENCERRADO', 'RESCINDIDO'].includes(cur.status) && b.tipo !== 'NOTA') fail(409, 'Convênio encerrado/rescindido: só é possível registrar notas.')
    if (['ADITIVO', 'RENOVACAO'].includes(b.tipo) && b.tipo === 'RENOVACAO' && !b.novoFim) fail(400, 'Informe o novo fim da vigência para a renovação.')
    if (b.novoFim && cur.fim && b.novoFim <= cur.fim && b.tipo === 'RENOVACAO') fail(400, 'A renovação deve estender a vigência.')
    const ev = await prisma.reiConvenioEvento.create({ data: { tenantId, convenioId: cur.id, tipo: b.tipo, descricao: b.descricao, novoFim: b.novoFim, valor: b.valor, data: b.data ?? new Date(), userId: getUserId(req) } })
    const upd: any = {}
    if (b.novoFim && ['ADITIVO', 'RENOVACAO'].includes(b.tipo)) { upd.fim = b.novoFim; upd.vigenciaIndeterminada = false }
    if (b.tipo === 'ADITIVO' && b.valor != null) upd.valor = (cur.valor ?? 0) + b.valor
    if (b.tipo === 'RESCISAO') upd.status = 'RESCINDIDO'
    const row = Object.keys(upd).length ? await prisma.reiConvenio.update({ where: { id: cur.id }, data: upd }) : cur
    if (Object.keys(upd).length) await agendarAlertasConvenio(row)
    res.status(201).json({ evento: ev, convenio: enriquecer(row) })
  }))

  router.post('/convenios/:id/encerrar', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const cur = await prisma.reiConvenio.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!cur) return res.status(404).json({ error: 'Convênio não encontrado.' })
    if (['ENCERRADO', 'RESCINDIDO'].includes(cur.status)) fail(409, 'Convênio já encerrado.')
    const row = await prisma.reiConvenio.update({ where: { id: cur.id }, data: { status: 'ENCERRADO' } })
    await agendarAlertasConvenio(row)
    await prisma.reiConvenioEvento.create({ data: { tenantId, convenioId: cur.id, tipo: 'NOTA', descricao: 'Convênio encerrado.', userId: getUserId(req) } })
    res.json(enriquecer(row))
  }))
}
