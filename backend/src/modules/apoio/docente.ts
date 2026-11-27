import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, AcademicRole, asyncHandler, getUserId, requireRole } from '../academico/middleware'
import { dateISO, mountCrud, pageParams, parseBody, qs } from '../core/crud'
import { Branding, brandHeaderHtml, escapeHtml as esc, getBranding } from '../core/branding'
import { audit, notify } from '../core/notify'
import { cancelReminders, completeReminders } from '../core/reminders'
import { MODULO, REF, andamento, hasRole, httpError, isSuper, nomesUsuarios, numeroAnual, tid, scheduleReminder } from './common'
import { addDays } from './logic'
import { createHmac } from 'crypto'

const EQ: AcademicRole[] = ['SUPPORT', 'COORDINATOR']
const TODOS_STAFF: AcademicRole[] = ['SUPPORT', 'COORDINATOR', 'TEACHER', 'SECRETARY', 'FACILITIES', 'SUPPLIES', 'LIBRARIAN', 'STAFF', 'FINANCE', 'MARKETING', 'ADMISSIONS']

// =============== FORMAÇÃO CONTINUADA ===============
const formacaoSchema = z.object({
  titulo: z.string().min(3).max(200), tipo: z.enum(['OFICINA', 'CURSO', 'PALESTRA', 'WORKSHOP', 'SEMINARIO']).default('OFICINA'), ementa: z.string().max(5000).optional(),
  cargaHoraria: z.number().int().min(1).max(400).default(4), vagas: z.number().int().min(1).max(2000).default(30), inicio: dateISO(), fim: dateISO(),
  modalidade: z.enum(['PRESENCIAL', 'EAD', 'HIBRIDO']).default('PRESENCIAL'), local: z.string().max(200).optional(), instrutor: z.string().max(200).optional(),
  status: z.enum(['PLANEJADA', 'INSCRICOES', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA']).default('INSCRICOES'), emiteCertificado: z.boolean().default(true), frequenciaMinima: z.number().min(0).max(100).default(75),
})

function segredo() { return process.env.EDU_CERT_SECRET || process.env.JWT_SECRET || 'edumaster-apoio' }
export function codigoCertificadoFormacao(tenantId: string, inscricaoId: string) {
  const h = createHmac('sha256', segredo()).update(`${tenantId}:${inscricaoId}`).digest('hex').slice(0, 12).toUpperCase()
  return `${h.slice(0, 4)}-${h.slice(4, 8)}-${h.slice(8, 12)}`
}

export function renderCertificadoFormacao(b: Branding, p: { nome: string; titulo: string; cargaHoraria: number; inicio: Date; fim: Date; codigo: string; emitidoEm: Date; instrutor?: string | null }) {
  const periodo = p.inicio.toDateString() === p.fim.toDateString() ? p.inicio.toLocaleDateString('pt-BR') : `${p.inicio.toLocaleDateString('pt-BR')} a ${p.fim.toLocaleDateString('pt-BR')}`
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Certificado — ${esc(p.nome)}</title><style>@page{size:A4 landscape;margin:12mm}body{font-family:Georgia,serif;margin:0;color:#0f172a}.box{border:10px double ${esc(b.cores.primaria)};margin:8px;padding:6px}.corpo{padding:32px 60px;text-align:center}h1{letter-spacing:.2em;color:${esc(b.cores.primaria)};font-size:34px;margin:12px 0}p{font-size:18px;line-height:1.7}.nome{font-size:30px;font-weight:700;border-bottom:1px solid #94a3b8;display:inline-block;padding:0 24px}.rod{display:flex;justify-content:space-between;align-items:flex-end;padding:0 60px 24px;font-size:12px;color:#475569}.ass{border-top:1px solid #334155;padding-top:4px;min-width:240px;text-align:center}</style></head><body><div class="box">${brandHeaderHtml(b, { titulo: 'Certificado de Formação Docente' })}<div class="corpo"><h1>CERTIFICADO</h1><p>Certificamos que</p><p><span class="nome">${esc(p.nome)}</span></p><p>concluiu a atividade de formação continuada <strong>${esc(p.titulo)}</strong>, com carga horária de <strong>${p.cargaHoraria} horas</strong>, realizada em ${periodo}${p.instrutor ? `, ministrada por ${esc(p.instrutor)}` : ''}.</p><p style="font-size:14px">Emitido em ${p.emitidoEm.toLocaleDateString('pt-BR')}</p></div><div class="rod"><div>Código de verificação: <strong>${esc(p.codigo)}</strong></div><div class="ass">${esc(b.reitorNome || 'Coordenação de Formação Docente')}<br/>${esc(b.reitorCargo || '')}</div></div></div></body></html>`
}

export function mountDocente(router: Router) {
  mountCrud(router, { model: 'apoFormacao', path: '/formacoes', read: TODOS_STAFF, write: EQ, readAll: true, create: formacaoSchema, filters: ['status', 'tipo'], search: ['titulo'], orderBy: { inicio: 'desc' }, modulo: MODULO,
    beforeCreate: (d: any) => { if (d.fim < d.inicio) throw httpError(400, 'Fim anterior ao início.'); return d },
    afterCreate: async (row: any) => { if (row.status === 'INSCRICOES') await scheduleReminder({ tenantId: row.tenantId, modulo: MODULO, titulo: `Formação "${row.titulo}" próxima: confirmar inscritos`, dueAt: row.inicio, antecedenciaDias: 3, assigneeRole: 'SUPPORT', refType: REF.formacao, refId: row.id, dedupeKey: `apo-form-${row.id}` }) },
  })

  router.post('/formacoes/:id/inscrever', requireRole(...TODOS_STAFF), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const userId = hasRole(req, ...EQ) && req.body?.userId ? String(req.body.userId) : getUserId(req)
    const f = await prisma.apoFormacao.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!f) throw httpError(404, 'Formação não encontrada.')
    if (!['INSCRICOES', 'PLANEJADA'].includes(f.status) || f.inicio < new Date()) throw httpError(422, 'Inscrições encerradas.')
    const dup = await prisma.apoFormacaoInscricao.findFirst({ where: { tenantId, formacaoId: f.id, userId } })
    if (dup && dup.status !== 'CANCELADO') throw httpError(409, 'Já inscrito.')
    // conflito de horário com outra formação inscrita
    const conflito = await prisma.apoFormacaoInscricao.findFirst({ where: { tenantId, userId, status: { in: ['INSCRITO'] }, formacao: { id: { not: f.id }, inicio: { lt: f.fim }, fim: { gt: f.inicio } } }, include: { formacao: { select: { titulo: true } } } })
    if (conflito) throw httpError(409, `Conflito de horário com "${conflito.formacao.titulo}".`)
    const ocupadas = await prisma.apoFormacaoInscricao.count({ where: { tenantId, formacaoId: f.id, status: 'INSCRITO' } })
    const status = ocupadas >= f.vagas ? 'LISTA_ESPERA' : 'INSCRITO'
    const ins = dup ? await prisma.apoFormacaoInscricao.update({ where: { id: dup.id }, data: { status } }) : await prisma.apoFormacaoInscricao.create({ data: { tenantId, formacaoId: f.id, userId, status } })
    await notify({ tenantId, userId, assunto: `${f.titulo}: ${status === 'INSCRITO' ? 'inscrição confirmada' : 'lista de espera'}`, mensagem: status === 'INSCRITO' ? `Inscrição confirmada para ${f.inicio.toLocaleString('pt-BR')}${f.local ? ' — ' + f.local : ''}.` : 'Turma lotada. Você será avisado se surgir vaga.', refType: REF.formacao, refId: f.id })
    if (status === 'INSCRITO') await scheduleReminder({ tenantId, modulo: MODULO, titulo: `Formação: ${f.titulo}`, dueAt: f.inicio, antecedenciaDias: 1, assigneeUserId: userId, refType: 'ApoFormacaoInscricao', refId: ins.id, dedupeKey: `apo-form-ins-${ins.id}` })
    res.status(201).json(ins)
  }))

  router.post('/formacoes/:id/cancelar-inscricao', requireRole(...TODOS_STAFF), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const userId = hasRole(req, ...EQ) && req.body?.userId ? String(req.body.userId) : getUserId(req)
    const ins = await prisma.apoFormacaoInscricao.findFirst({ where: { tenantId, formacaoId: String(req.params.id), userId, status: { in: ['INSCRITO', 'LISTA_ESPERA'] } } })
    if (!ins) throw httpError(404, 'Inscrição não encontrada.')
    await prisma.apoFormacaoInscricao.update({ where: { id: ins.id }, data: { status: 'CANCELADO' } })
    await cancelReminders({ tenantId, refType: 'ApoFormacaoInscricao', refId: ins.id })
    let promovido: string | null = null
    if (ins.status === 'INSCRITO') {
      const prox = await prisma.apoFormacaoInscricao.findFirst({ where: { tenantId, formacaoId: ins.formacaoId, status: 'LISTA_ESPERA' }, orderBy: { createdAt: 'asc' } })
      if (prox) { await prisma.apoFormacaoInscricao.update({ where: { id: prox.id }, data: { status: 'INSCRITO' } }); promovido = prox.userId; await notify({ tenantId, userId: prox.userId, assunto: 'Vaga liberada na formação', mensagem: 'Surgiu uma vaga e sua inscrição foi confirmada.', refType: REF.formacao, refId: ins.formacaoId }) }
    }
    res.json({ ok: true, promovido })
  }))

  router.get('/formacoes/:id/inscricoes', requireRole(...EQ), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const items = await prisma.apoFormacaoInscricao.findMany({ where: { tenantId, formacaoId: String(req.params.id) }, orderBy: { createdAt: 'asc' } })
    const nomes = await nomesUsuarios(tenantId, items.map((i) => i.userId))
    res.json(items.map((i) => ({ ...i, nome: nomes[i.userId] })))
  }))

  router.get('/formacoes-minhas', requireRole(...TODOS_STAFF), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const items = await prisma.apoFormacaoInscricao.findMany({ where: { tenantId: tid(req), userId: getUserId(req) }, include: { formacao: true }, orderBy: { createdAt: 'desc' }, take: 100 })
    res.json(items)
  }))

  router.post('/formacoes/:id/concluir', requireRole(...EQ), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const f = await prisma.apoFormacao.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!f) throw httpError(404, 'Formação não encontrada.')
    if (f.status === 'CANCELADA') throw httpError(409, 'Formação cancelada.')
    const b = parseBody(z.object({ presencas: z.array(z.object({ userId: z.string(), frequenciaPercent: z.number().min(0).max(100) })).min(1) }), req.body)
    let concluidos = 0, reprovados = 0
    for (const p of b.presencas) {
      const ins = await prisma.apoFormacaoInscricao.findFirst({ where: { tenantId, formacaoId: f.id, userId: p.userId, status: 'INSCRITO' } })
      if (!ins) continue
      const ok = p.frequenciaPercent >= f.frequenciaMinima
      const emite = ok && f.emiteCertificado
      await prisma.apoFormacaoInscricao.update({ where: { id: ins.id }, data: { status: ok ? 'CONCLUIDO' : 'REPROVADO', frequenciaPercent: p.frequenciaPercent, ...(emite ? { certificadoEmitidoEm: new Date(), certificadoCodigo: codigoCertificadoFormacao(tenantId, ins.id) } : {}) } })
      ok ? concluidos++ : reprovados++
      await notify({ tenantId, userId: p.userId, assunto: `${f.titulo}: ${ok ? 'concluída' : 'frequência insuficiente'}`, mensagem: ok ? `Formação concluída (${p.frequenciaPercent}%).${emite ? ' Seu certificado está disponível em Minhas formações.' : ''}` : `Frequência ${p.frequenciaPercent}% abaixo do mínimo de ${f.frequenciaMinima}%.`, refType: REF.formacao, refId: f.id })
    }
    await prisma.apoFormacao.update({ where: { id: f.id }, data: { status: 'CONCLUIDA' } })
    await completeReminders({ tenantId, refType: REF.formacao, refId: f.id })
    await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'FORMACAO_CONCLUIDA', refType: REF.formacao, refId: f.id })
    res.json({ concluidos, reprovados })
  }))

  // Certificado em HTML com logomarca (próprio do módulo; a secretaria pode emitir versão registrada à parte).
  router.get('/formacoes/inscricoes/:id/certificado', requireRole(...TODOS_STAFF), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const ins = await prisma.apoFormacaoInscricao.findFirst({ where: { id: String(req.params.id), tenantId }, include: { formacao: true } })
    if (!ins || ins.status !== 'CONCLUIDO' || !ins.certificadoCodigo) throw httpError(404, 'Certificado não disponível.')
    if (ins.userId !== getUserId(req) && !hasRole(req, ...EQ)) throw httpError(403, 'Sem acesso a este certificado.')
    const [b, nome] = await Promise.all([getBranding(tenantId), nomesUsuarios(tenantId, [ins.userId])])
    res.type('html').send(renderCertificadoFormacao(b, { nome: nome[ins.userId] ?? 'Participante', titulo: ins.formacao.titulo, cargaHoraria: ins.formacao.cargaHoraria, inicio: ins.formacao.inicio, fim: ins.formacao.fim, codigo: ins.certificadoCodigo, emitidoEm: ins.certificadoEmitidoEm ?? new Date(), instrutor: ins.formacao.instrutor }))
  }))

  // =============== BANCO DE MATERIAIS ===============
  router.get('/materiais', requireRole(...TODOS_STAFF), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    const staff = hasRole(req, ...EQ)
    where.status = staff && qs(req.query.status) ? qs(req.query.status) : 'APROVADO'
    if (!staff) where.OR = [{ status: 'APROVADO' }, { autorUserId: getUserId(req) }], delete where.status
    for (const f of ['disciplineId', 'programId', 'tipo']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    const q = qs(req.query.q)
    if (q) where.AND = [{ OR: [{ titulo: { contains: q, mode: 'insensitive' } }, { descricao: { contains: q, mode: 'insensitive' } }] }]
    const [items, total] = await Promise.all([prisma.apoMaterial.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }), prisma.apoMaterial.count({ where })])
    res.json({ items: items.map((m) => ({ ...m, avaliacaoMedia: m.avaliacaoQtd ? Math.round((m.avaliacaoSoma / m.avaliacaoQtd) * 10) / 10 : null })), total, page, pageSize })
  }))

  router.post('/materiais', requireRole(...TODOS_STAFF), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ titulo: z.string().min(3).max(200), tipo: z.enum(['DOCUMENTO', 'SLIDES', 'VIDEO', 'ROTEIRO', 'MODELO_AVALIACAO', 'LINK', 'OUTRO']).default('DOCUMENTO'), descricao: z.string().max(3000).optional(), url: z.string().url().max(1000).optional(), disciplineId: z.string().optional(), programId: z.string().optional(), tags: z.array(z.string().max(40)).max(15).optional() }), req.body)
    if (!b.url) throw httpError(400, 'Informe a URL do material.')
    const auto = hasRole(req, ...EQ)
    const m = await prisma.apoMaterial.create({ data: { ...b, tenantId, autorUserId: getUserId(req), status: auto ? 'APROVADO' : 'PENDENTE' } as any })
    if (!auto) await scheduleReminder({ tenantId, modulo: MODULO, titulo: 'Material docente aguardando aprovação', dueAt: addDays(new Date(), 5), assigneeRole: 'SUPPORT', refType: 'ApoMaterial', refId: m.id, dedupeKey: `apo-mat-aprov-${m.id}` })
    res.status(201).json(m)
  }))

  router.post('/materiais/:id/moderar', requireRole(...EQ), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const m = await prisma.apoMaterial.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!m) throw httpError(404, 'Material não encontrado.')
    const b = parseBody(z.object({ aprovado: z.boolean(), motivo: z.string().max(500).optional() }), req.body)
    if (!b.aprovado && !b.motivo) throw httpError(400, 'Informe o motivo da rejeição.')
    await completeReminders({ tenantId, refType: 'ApoMaterial', refId: m.id })
    await notify({ tenantId, userId: m.autorUserId, assunto: `Material ${b.aprovado ? 'aprovado' : 'rejeitado'}`, mensagem: b.aprovado ? `"${m.titulo}" foi publicado no banco de materiais.` : `"${m.titulo}" não foi aprovado: ${b.motivo}`, refType: 'ApoMaterial', refId: m.id })
    res.json(await prisma.apoMaterial.update({ where: { id: m.id }, data: { status: b.aprovado ? 'APROVADO' : 'REJEITADO' } }))
  }))

  router.post('/materiais/:id/acessar', requireRole(...TODOS_STAFF), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const m = await prisma.apoMaterial.findFirst({ where: { id: String(req.params.id), tenantId: tid(req), status: 'APROVADO' } })
    if (!m) throw httpError(404, 'Material não encontrado.')
    await prisma.apoMaterial.update({ where: { id: m.id }, data: { downloads: { increment: 1 } } })
    res.json({ url: m.url })
  }))

  router.post('/materiais/:id/avaliar', requireRole(...TODOS_STAFF), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const b = parseBody(z.object({ nota: z.number().int().min(1).max(5) }), req.body)
    const m = await prisma.apoMaterial.findFirst({ where: { id: String(req.params.id), tenantId: tid(req), status: 'APROVADO' } })
    if (!m) throw httpError(404, 'Material não encontrado.')
    if (m.autorUserId === getUserId(req)) throw httpError(422, 'O autor não pode avaliar o próprio material.')
    await prisma.apoMaterial.update({ where: { id: m.id }, data: { avaliacaoSoma: { increment: b.nota }, avaliacaoQtd: { increment: 1 } } })
    res.json({ ok: true })
  }))

  router.delete('/materiais/:id', requireRole(...TODOS_STAFF), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const m = await prisma.apoMaterial.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!m) throw httpError(404, 'Material não encontrado.')
    if (m.autorUserId !== getUserId(req) && !hasRole(req, ...EQ)) throw httpError(403, 'Somente o autor ou a coordenação removem.')
    await prisma.apoMaterial.delete({ where: { id: m.id } })
    res.status(204).end()
  }))

  mountChamados(router)
}

// =============== HELPDESK DOCENTE ===============
export const SLA_HORAS: Record<string, number> = { URGENTE: 4, ALTA: 8, NORMAL: 24, BAIXA: 72 }
export const ROLE_POR_CATEGORIA: Record<string, string> = { TECNOLOGIA: 'SUPPORT', SALA_AULA: 'FACILITIES', MATERIAL: 'SUPPLIES', SISTEMA_ACADEMICO: 'SECRETARY', RH: 'STAFF', BIBLIOTECA: 'LIBRARIAN', OUTRO: 'SUPPORT' }
const ATENDENTES: AcademicRole[] = ['SUPPORT', 'FACILITIES', 'SUPPLIES', 'SECRETARY', 'LIBRARIAN', 'STAFF', 'COORDINATOR']
const TRANS_CHAMADO: Record<string, string[]> = { ABERTO: ['EM_ATENDIMENTO', 'RESOLVIDO'], EM_ATENDIMENTO: ['AGUARDANDO_SOLICITANTE', 'RESOLVIDO'], AGUARDANDO_SOLICITANTE: ['EM_ATENDIMENTO', 'RESOLVIDO'], RESOLVIDO: ['ABERTO', 'FECHADO'], FECHADO: [] }
export const transicaoChamadoValida = (de: string, para: string) => (TRANS_CHAMADO[de] ?? []).includes(para)

function mountChamados(router: Router) {
  router.post('/chamados', requireRole(...TODOS_STAFF), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ categoria: z.enum(['TECNOLOGIA', 'SALA_AULA', 'MATERIAL', 'SISTEMA_ACADEMICO', 'RH', 'BIBLIOTECA', 'OUTRO']).default('OUTRO'), prioridade: z.enum(['BAIXA', 'NORMAL', 'ALTA', 'URGENTE']).default('NORMAL'), titulo: z.string().min(5).max(200), descricao: z.string().min(10).max(8000) }), req.body)
    const { numero } = await numeroAnual(tenantId, 'CHD')
    const slaHoras = SLA_HORAS[b.prioridade]
    const prazoEm = new Date(Date.now() + slaHoras * 3_600_000)
    const role = ROLE_POR_CATEGORIA[b.categoria]
    const c = await prisma.apoChamado.create({ data: { ...b, tenantId, numero, solicitanteUserId: getUserId(req), slaHoras, prazoEm, responsavelRole: role } })
    await scheduleReminder({ tenantId, modulo: MODULO, titulo: `Chamado ${numero} (${b.prioridade}): ${b.titulo}`, dueAt: prazoEm, remindAt: new Date(Date.now() + slaHoras * 3_600_000 * 0.5), assigneeRole: role, refType: REF.chamado, refId: c.id, severity: b.prioridade === 'URGENTE' ? 'CRITICO' : 'ATENCAO', dedupeKey: `apo-chd-sla-${c.id}` })
    await andamento({ tenantId, refType: REF.chamado, refId: c.id, tipo: 'STATUS', texto: 'Chamado aberto.', publico: true, userId: getUserId(req) })
    res.status(201).json(c)
  }))

  router.get('/chamados', requireRole(...TODOS_STAFF), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    const atendente = hasRole(req, ...ATENDENTES) && req.user?.role !== 'TEACHER'
    if (!atendente || qs(req.query.meus) === 'true') where.solicitanteUserId = getUserId(req)
    else if (!isSuper(req) && req.user?.role !== 'COORDINATOR' && req.user?.role !== 'SUPPORT') where.OR = [{ responsavelRole: req.user?.role }, { responsavelUserId: getUserId(req) }, { solicitanteUserId: getUserId(req) }]
    for (const f of ['status', 'categoria', 'prioridade', 'responsavelUserId']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    if (qs(req.query.vencidos) === 'true') { where.prazoEm = { lt: new Date() }; where.status = { in: ['ABERTO', 'EM_ATENDIMENTO'] } }
    const [items, total] = await Promise.all([prisma.apoChamado.findMany({ where, orderBy: [{ prazoEm: 'asc' }], skip, take }), prisma.apoChamado.count({ where })])
    const nomes = await nomesUsuarios(tenantId, items.flatMap((i) => [i.solicitanteUserId, i.responsavelUserId]))
    res.json({ items: items.map((i) => ({ ...i, solicitante: nomes[i.solicitanteUserId], responsavel: i.responsavelUserId ? nomes[i.responsavelUserId] : null })), total, page, pageSize })
  }))

  async function carregar(req: AuthenticatedRequest) {
    const tenantId = tid(req)
    const c = await prisma.apoChamado.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!c) throw httpError(404, 'Chamado não encontrado.')
    const ehSolicitante = c.solicitanteUserId === getUserId(req)
    const ehAtendente = hasRole(req, ...ATENDENTES) && req.user?.role !== 'TEACHER' && (isSuper(req) || ['SUPPORT', 'COORDINATOR'].includes(String(req.user?.role)) || c.responsavelRole === req.user?.role || c.responsavelUserId === getUserId(req))
    if (!ehSolicitante && !ehAtendente) throw httpError(404, 'Chamado não encontrado.')
    return { c, tenantId, ehSolicitante, ehAtendente }
  }

  router.get('/chamados/:id', requireRole(...TODOS_STAFF), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { c, tenantId, ehAtendente } = await carregar(req)
    const hist = await prisma.apoAndamento.findMany({ where: { tenantId, refType: REF.chamado, refId: c.id }, orderBy: { createdAt: 'asc' } })
    res.json({ ...c, andamentos: ehAtendente ? hist : hist.filter((h) => h.publico) })
  }))

  router.post('/chamados/:id/comentar', requireRole(...TODOS_STAFF), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { c, tenantId, ehAtendente } = await carregar(req)
    if (c.status === 'FECHADO') throw httpError(409, 'Chamado fechado.')
    const b = parseBody(z.object({ texto: z.string().min(1).max(5000), interno: z.boolean().optional() }), req.body)
    const interno = !!b.interno && ehAtendente
    const a = await andamento({ tenantId, refType: REF.chamado, refId: c.id, tipo: 'RESPOSTA', texto: b.texto, publico: !interno, userId: getUserId(req) })
    if (ehAtendente && !c.primeiraRespostaEm && !interno) await prisma.apoChamado.update({ where: { id: c.id }, data: { primeiraRespostaEm: new Date(), status: c.status === 'ABERTO' ? 'EM_ATENDIMENTO' : c.status } })
    if (!interno) {
      if (ehAtendente) await notify({ tenantId, userId: c.solicitanteUserId, assunto: `Chamado ${c.numero}: nova resposta`, mensagem: b.texto.slice(0, 300), refType: REF.chamado, refId: c.id })
      else if (c.responsavelUserId) await notify({ tenantId, userId: c.responsavelUserId, assunto: `Chamado ${c.numero}: resposta do solicitante`, mensagem: b.texto.slice(0, 300), refType: REF.chamado, refId: c.id })
      if (!ehAtendente && c.status === 'AGUARDANDO_SOLICITANTE') await prisma.apoChamado.update({ where: { id: c.id }, data: { status: 'EM_ATENDIMENTO' } })
    }
    res.status(201).json(a)
  }))

  router.post('/chamados/:id/atribuir', requireRole(...ATENDENTES), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { c, tenantId, ehAtendente } = await carregar(req)
    if (!ehAtendente) throw httpError(403, 'Sem permissão.')
    const b = parseBody(z.object({ responsavelUserId: z.string().optional() }), req.body ?? {})
    const resp = b.responsavelUserId ?? getUserId(req)
    if (!(await prisma.user.findFirst({ where: { id: resp, tenantId, isActive: true }, select: { id: true } }))) throw httpError(404, 'Usuário não encontrado.')
    const upd = await prisma.apoChamado.update({ where: { id: c.id }, data: { responsavelUserId: resp, status: c.status === 'ABERTO' ? 'EM_ATENDIMENTO' : c.status } })
    await andamento({ tenantId, refType: REF.chamado, refId: c.id, tipo: 'STATUS', texto: 'Chamado atribuído.', publico: true, userId: getUserId(req) })
    if (resp !== getUserId(req)) await notify({ tenantId, userId: resp, assunto: `Chamado ${c.numero} atribuído a você`, mensagem: c.titulo, refType: REF.chamado, refId: c.id })
    res.json(upd)
  }))

  router.post('/chamados/:id/status', requireRole(...TODOS_STAFF), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { c, tenantId, ehSolicitante, ehAtendente } = await carregar(req)
    const b = parseBody(z.object({ status: z.enum(['ABERTO', 'EM_ATENDIMENTO', 'AGUARDANDO_SOLICITANTE', 'RESOLVIDO', 'FECHADO']), nota: z.string().max(2000).optional() }), req.body)
    if (!transicaoChamadoValida(c.status, b.status)) throw httpError(409, `Transição inválida: ${c.status} → ${b.status}.`)
    // solicitante só reabre/fecha; atendente conduz
    if (!ehAtendente && !(ehSolicitante && ['ABERTO', 'FECHADO'].includes(b.status))) throw httpError(403, 'Sem permissão para esta transição.')
    if (b.status === 'RESOLVIDO' && !b.nota) throw httpError(400, 'Informe a solução aplicada em `nota`.')
    const data: any = { status: b.status }
    if (b.status === 'RESOLVIDO') data.resolvidoEm = new Date()
    if (b.status === 'ABERTO') { data.resolvidoEm = null; data.prazoEm = new Date(Date.now() + c.slaHoras * 3_600_000) }
    const upd = await prisma.apoChamado.update({ where: { id: c.id }, data })
    if (['RESOLVIDO', 'FECHADO'].includes(b.status)) await completeReminders({ tenantId, refType: REF.chamado, refId: c.id })
    if (b.status === 'ABERTO') await scheduleReminder({ tenantId, modulo: MODULO, titulo: `Chamado ${c.numero} REABERTO`, dueAt: data.prazoEm, assigneeRole: c.responsavelRole ?? 'SUPPORT', assigneeUserId: c.responsavelUserId ?? undefined, refType: REF.chamado, refId: c.id, severity: 'ATENCAO', dedupeKey: `apo-chd-sla-${c.id}` })
    await andamento({ tenantId, refType: REF.chamado, refId: c.id, tipo: 'STATUS', texto: `${b.status}${b.nota ? ': ' + b.nota : ''}`, publico: true, userId: getUserId(req) })
    if (b.status === 'RESOLVIDO') await notify({ tenantId, userId: c.solicitanteUserId, assunto: `Chamado ${c.numero} resolvido`, mensagem: `${b.nota}. Confirme (fechar) ou reabra em até 7 dias.`, refType: REF.chamado, refId: c.id })
    res.json(upd)
  }))

  router.post('/chamados/:id/avaliar', requireRole(...TODOS_STAFF), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { c, ehSolicitante } = await carregar(req)
    if (!ehSolicitante) throw httpError(403, 'Somente o solicitante avalia.')
    if (!['RESOLVIDO', 'FECHADO'].includes(c.status)) throw httpError(409, 'Avalie após a resolução.')
    const b = parseBody(z.object({ nota: z.number().int().min(1).max(5), comentario: z.string().max(1000).optional() }), req.body)
    res.json(await prisma.apoChamado.update({ where: { id: c.id }, data: { avaliacaoNota: b.nota, avaliacaoComentario: b.comentario } }))
  }))

  router.get('/chamados-relatorio', requireRole(...EQ), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const desde = qs(req.query.desde) ? new Date(String(qs(req.query.desde))) : addDays(new Date(), -90)
    const cs = await prisma.apoChamado.findMany({ where: { tenantId, createdAt: { gte: desde } }, select: { categoria: true, prioridade: true, status: true, prazoEm: true, resolvidoEm: true, createdAt: true, primeiraRespostaEm: true, avaliacaoNota: true } })
    const resolv = cs.filter((c) => c.resolvidoEm)
    const noPrazo = resolv.filter((c) => c.resolvidoEm! <= c.prazoEm).length
    const cont = (f: (c: (typeof cs)[number]) => string) => cs.reduce<Record<string, number>>((o, c) => ((o[f(c)] = (o[f(c)] ?? 0) + 1), o), {})
    const notas = cs.map((c) => c.avaliacaoNota).filter((n): n is number => n != null)
    res.json({ total: cs.length, porCategoria: cont((c) => c.categoria), porStatus: cont((c) => c.status), percentualNoPrazo: resolv.length ? Math.round((noPrazo / resolv.length) * 1000) / 10 : null, tempoMedioResolucaoHoras: resolv.length ? Math.round(resolv.reduce((s, c) => s + (c.resolvidoEm!.getTime() - c.createdAt.getTime()) / 3_600_000, 0) / resolv.length * 10) / 10 : null, satisfacaoMedia: notas.length ? Math.round((notas.reduce((a, b) => a + b, 0) / notas.length) * 100) / 100 : null, vencidosAbertos: cs.filter((c) => ['ABERTO', 'EM_ATENDIMENTO'].includes(c.status) && c.prazoEm < new Date()).length })
  }))
}

// Job: fecha automaticamente chamados resolvidos há mais de 7 dias.
export async function jobChamados() {
  const r = await prisma.apoChamado.updateMany({ where: { status: 'RESOLVIDO', resolvidoEm: { lt: addDays(new Date(), -7) } }, data: { status: 'FECHADO' } })
  return { fechados: r.count }
}
