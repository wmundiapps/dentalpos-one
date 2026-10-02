import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getUserId, requireRole } from '../academico/middleware'
import { dateISO, pageParams, parseBody, qs } from '../core/crud'
import { audit, notify } from '../core/notify'
import { completeReminders, scheduleReminder } from '../core/reminders'
import { ALUNO, MODULO, REF, andamento, carregarAluno, hasRole, httpError, nomesAlunos, numeroAnual, tid } from './common'
import { StatusOcorrencia, addBusinessDays, validarSancao, validarTransicaoOcorrencia } from './logic'

const PRAZO_DEFESA_DIAS_UTEIS = 5
const PRAZO_RECURSO_DIAS_UTEIS = 5

const COORD: any[] = ['COORDINATOR', 'SUPPORT']
const REGISTRAR: any[] = ['COORDINATOR', 'SUPPORT', 'TEACHER', 'SECRETARY']

// Aluno vê a própria ocorrência (sem comissão); testemunhas ocultas.
function paraAluno(o: any) {
  const { testemunhas, comissao, relatorId, ...r } = o
  return r
}

export function mountOcorrencias(router: Router) {
  router.post('/ocorrencias', requireRole(...REGISTRAR), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({
      studentId: z.string(), gravidade: z.enum(['LEVE', 'MEDIA', 'GRAVE', 'GRAVISSIMA']).default('LEVE'),
      categoria: z.enum(['CONDUTA', 'FRAUDE_ACADEMICA', 'VIOLENCIA', 'DANO_PATRIMONIO', 'ASSEDIO', 'OUTRO']).default('CONDUTA'),
      descricao: z.string().min(20).max(8000), dataFato: dateISO(), local: z.string().max(200).optional(), testemunhas: z.array(z.string().max(150)).max(20).optional(),
    }), req.body)
    await carregarAluno(tenantId, b.studentId)
    if (b.dataFato > new Date()) throw httpError(422, 'Data do fato no futuro.')
    const { numero } = await numeroAnual(tenantId, 'OCD')
    const o = await prisma.apoOcorrencia.create({ data: { ...b, tenantId, numero, relatorId: getUserId(req) } })
    await andamento({ tenantId, refType: REF.ocorrencia, refId: o.id, tipo: 'STATUS', texto: 'Ocorrência registrada.', userId: getUserId(req) })
    await scheduleReminder({ tenantId, modulo: MODULO, titulo: `Notificar aluno e abrir prazo de defesa (${numero})`, dueAt: addBusinessDays(new Date(), 3), assigneeRole: 'COORDINATOR', refType: REF.ocorrencia, refId: o.id, severity: b.gravidade === 'GRAVISSIMA' || b.gravidade === 'GRAVE' ? 'CRITICO' : 'ATENCAO', dedupeKey: `apo-ocd-notificar-${o.id}` })
    await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'OCORRENCIA_REGISTRADA', refType: REF.ocorrencia, refId: o.id })
    res.status(201).json(o)
  }))

  router.get('/ocorrencias', requireRole(...COORD, ...ALUNO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    for (const f of ['status', 'gravidade', 'studentId', 'categoria']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    if (req.user?.role === 'STUDENT') { where.studentId = req.user.studentId; where.status = { not: 'REGISTRADA' } }
    const [items, total] = await Promise.all([prisma.apoOcorrencia.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }), prisma.apoOcorrencia.count({ where })])
    const al = await nomesAlunos(tenantId, items.map((i) => i.studentId))
    res.json({ items: items.map((i) => (req.user?.role === 'STUDENT' ? paraAluno(i) : { ...i, aluno: al[i.studentId] })), total, page, pageSize })
  }))

  router.get('/ocorrencias/:id', requireRole(...COORD, ...ALUNO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const o = await prisma.apoOcorrencia.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!o) throw httpError(404, 'Ocorrência não encontrada.')
    if (req.user?.role === 'STUDENT' && (o.studentId !== req.user.studentId || o.status === 'REGISTRADA')) throw httpError(404, 'Ocorrência não encontrada.')
    const hist = await prisma.apoAndamento.findMany({ where: { tenantId, refType: REF.ocorrencia, refId: o.id }, orderBy: { createdAt: 'asc' } })
    res.json({ ...(req.user?.role === 'STUDENT' ? paraAluno(o) : o), andamentos: req.user?.role === 'STUDENT' ? hist.filter((h) => h.publico) : hist })
  }))

  // 1) Notificação formal ao aluno: abre o prazo de defesa (contraditório).
  router.post('/ocorrencias/:id/notificar', requireRole(...COORD), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const o = await prisma.apoOcorrencia.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!o) throw httpError(404, 'Ocorrência não encontrada.')
    const erro = validarTransicaoOcorrencia('NOTIFICADA', { status: o.status as StatusOcorrencia, gravidade: o.gravidade })
    if (erro) throw httpError(409, erro)
    const prazo = addBusinessDays(new Date(), PRAZO_DEFESA_DIAS_UTEIS)
    const upd = await prisma.apoOcorrencia.update({ where: { id: o.id }, data: { status: 'NOTIFICADA', notificadaEm: new Date(), prazoDefesaEm: prazo } })
    await completeReminders({ tenantId, refType: REF.ocorrencia, refId: o.id, userId: getUserId(req) })
    await notify({ tenantId, studentId: o.studentId, canal: 'EMAIL', assunto: `Notificação de ocorrência ${o.numero}`, mensagem: `Foi registrada ocorrência disciplinar em seu nome (${o.categoria}). Você tem direito ao contraditório e à ampla defesa: apresente sua defesa até ${prazo.toLocaleDateString('pt-BR')} pelo portal.`, refType: REF.ocorrencia, refId: o.id, templateKey: 'apoio.ocorrencia.notificacao' })
    await scheduleReminder({ tenantId, modulo: MODULO, titulo: `Prazo de defesa vencendo (${o.numero})`, dueAt: prazo, antecedenciaDias: 1, assigneeStudentId: o.studentId, assigneeRole: 'COORDINATOR', refType: REF.ocorrencia, refId: o.id, severity: 'ATENCAO', dedupeKey: `apo-ocd-defesa-${o.id}` })
    await andamento({ tenantId, refType: REF.ocorrencia, refId: o.id, tipo: 'STATUS', texto: `Aluno notificado. Prazo de defesa até ${prazo.toLocaleDateString('pt-BR')}.`, publico: true, userId: getUserId(req) })
    await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'OCORRENCIA_NOTIFICADA', refType: REF.ocorrencia, refId: o.id })
    res.json(upd)
  }))

  // 2) Defesa do aluno (dentro do prazo)
  router.post('/ocorrencias/:id/defesa', requireRole(...ALUNO, ...COORD), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const o = await prisma.apoOcorrencia.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!o) throw httpError(404, 'Ocorrência não encontrada.')
    if (req.user?.role === 'STUDENT' && o.studentId !== req.user.studentId) throw httpError(404, 'Ocorrência não encontrada.')
    if (o.status !== 'NOTIFICADA') throw httpError(409, 'A defesa só pode ser apresentada após a notificação e antes do julgamento.')
    const quemSecretaria = req.user?.role !== 'STUDENT'
    if (!quemSecretaria && o.prazoDefesaEm && new Date() > o.prazoDefesaEm) throw httpError(422, 'Prazo de defesa encerrado.')
    const b = parseBody(z.object({ defesa: z.string().min(20).max(10000) }), req.body)
    const upd = await prisma.apoOcorrencia.update({ where: { id: o.id }, data: { status: 'DEFESA_RECEBIDA', defesa: b.defesa, defesaEm: new Date() } })
    await completeReminders({ tenantId, refType: REF.ocorrencia, refId: o.id })
    await scheduleReminder({ tenantId, modulo: MODULO, titulo: `Defesa recebida: julgar ocorrência ${o.numero}`, dueAt: addBusinessDays(new Date(), 10), assigneeRole: 'COORDINATOR', refType: REF.ocorrencia, refId: o.id, severity: 'ATENCAO', dedupeKey: `apo-ocd-julgar-${o.id}` })
    await andamento({ tenantId, refType: REF.ocorrencia, refId: o.id, tipo: 'DEFESA', texto: 'Defesa apresentada pelo aluno.', publico: true, userId: getUserId(req) })
    res.json(upd)
  }))

  // 3) Instaurar julgamento (defesa recebida OU prazo expirado sem defesa)
  router.post('/ocorrencias/:id/julgamento', requireRole(...COORD), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const o = await prisma.apoOcorrencia.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!o) throw httpError(404, 'Ocorrência não encontrada.')
    const erro = validarTransicaoOcorrencia('EM_JULGAMENTO', { status: o.status as StatusOcorrencia, gravidade: o.gravidade, prazoDefesaEm: o.prazoDefesaEm })
    if (erro) throw httpError(409, erro)
    const b = parseBody(z.object({ comissao: z.array(z.object({ nome: z.string().max(150), cargo: z.string().max(100).optional(), userId: z.string().optional() })).min(1).max(7) }), req.body)
    if ((o.gravidade === 'GRAVE' || o.gravidade === 'GRAVISSIMA') && b.comissao.length < 3) throw httpError(422, 'Ocorrências graves exigem comissão com no mínimo 3 membros.')
    const upd = await prisma.apoOcorrencia.update({ where: { id: o.id }, data: { status: 'EM_JULGAMENTO', comissao: b.comissao as any } })
    await completeReminders({ tenantId, refType: REF.ocorrencia, refId: o.id })
    for (const m of b.comissao) if (m.userId) await notify({ tenantId, userId: m.userId, assunto: `Comissão disciplinar: ocorrência ${o.numero}`, mensagem: 'Você foi designado(a) para a comissão de julgamento.', refType: REF.ocorrencia, refId: o.id })
    await scheduleReminder({ tenantId, modulo: MODULO, titulo: `Decidir ocorrência ${o.numero}`, dueAt: addBusinessDays(new Date(), 15), assigneeRole: 'COORDINATOR', refType: REF.ocorrencia, refId: o.id, severity: 'ATENCAO', dedupeKey: `apo-ocd-decidir-${o.id}` })
    await andamento({ tenantId, refType: REF.ocorrencia, refId: o.id, tipo: 'STATUS', texto: 'Julgamento instaurado.', publico: true, userId: getUserId(req) })
    res.json(upd)
  }))

  // 4) Decisão (sanção proporcional + fundamentação); abre prazo de recurso.
  router.post('/ocorrencias/:id/decidir', requireRole('COORDINATOR'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const o = await prisma.apoOcorrencia.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!o) throw httpError(404, 'Ocorrência não encontrada.')
    const erro = validarTransicaoOcorrencia('DECIDIDA', { status: o.status as StatusOcorrencia, gravidade: o.gravidade })
    if (erro) throw httpError(409, erro)
    const b = parseBody(z.object({ sancao: z.enum(['ADVERTENCIA_VERBAL', 'ADVERTENCIA_ESCRITA', 'SUSPENSAO', 'DESLIGAMENTO', 'ARQUIVAMENTO']), sancaoDias: z.number().int().min(1).max(30).optional(), fundamentacao: z.string().max(10000).optional() }), req.body)
    const e2 = validarSancao(o.gravidade, b.sancao, b.sancaoDias, b.fundamentacao)
    if (e2) throw httpError(422, e2)
    const prazoRec = addBusinessDays(new Date(), PRAZO_RECURSO_DIAS_UTEIS)
    const upd = await prisma.apoOcorrencia.update({ where: { id: o.id }, data: { status: 'DECIDIDA', ...b, decididaEm: new Date(), decididaPorId: getUserId(req), prazoRecursoEm: prazoRec } })
    await completeReminders({ tenantId, refType: REF.ocorrencia, refId: o.id })
    await notify({ tenantId, studentId: o.studentId, canal: 'EMAIL', assunto: `Decisão da ocorrência ${o.numero}`, mensagem: `Decisão: ${b.sancao.replace(/_/g, ' ').toLowerCase()}${b.sancaoDias ? ` por ${b.sancaoDias} dia(s)` : ''}. Você pode interpor recurso até ${prazoRec.toLocaleDateString('pt-BR')}.`, refType: REF.ocorrencia, refId: o.id, templateKey: 'apoio.ocorrencia.decisao' })
    await scheduleReminder({ tenantId, modulo: MODULO, titulo: `Prazo de recurso termina: concluir ocorrência ${o.numero}`, dueAt: prazoRec, antecedenciaDias: 0, assigneeRole: 'COORDINATOR', refType: REF.ocorrencia, refId: o.id, dedupeKey: `apo-ocd-conclusao-${o.id}` })
    await andamento({ tenantId, refType: REF.ocorrencia, refId: o.id, tipo: 'DECISAO', texto: `Decisão: ${b.sancao}${b.sancaoDias ? ' (' + b.sancaoDias + ' dias)' : ''}.`, publico: true, userId: getUserId(req) })
    await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'OCORRENCIA_DECIDIDA', refType: REF.ocorrencia, refId: o.id, detalhes: { sancao: b.sancao } })
    res.json(upd)
  }))

  // 5) Recurso do aluno
  router.post('/ocorrencias/:id/recurso', requireRole(...ALUNO, ...COORD), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const o = await prisma.apoOcorrencia.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!o) throw httpError(404, 'Ocorrência não encontrada.')
    if (req.user?.role === 'STUDENT' && o.studentId !== req.user.studentId) throw httpError(404, 'Ocorrência não encontrada.')
    const erro = validarTransicaoOcorrencia('EM_RECURSO', { status: o.status as StatusOcorrencia, gravidade: o.gravidade, prazoRecursoEm: o.prazoRecursoEm })
    if (erro) throw httpError(409, erro)
    if (o.sancao === 'ARQUIVAMENTO') throw httpError(422, 'Decisão de arquivamento não comporta recurso.')
    const b = parseBody(z.object({ recurso: z.string().min(20).max(10000) }), req.body)
    const upd = await prisma.apoOcorrencia.update({ where: { id: o.id }, data: { status: 'EM_RECURSO', recurso: b.recurso, recursoEm: new Date() } })
    await completeReminders({ tenantId, refType: REF.ocorrencia, refId: o.id })
    await scheduleReminder({ tenantId, modulo: MODULO, titulo: `Julgar recurso da ocorrência ${o.numero}`, dueAt: addBusinessDays(new Date(), 10), assigneeRole: 'RECTOR', refType: REF.ocorrencia, refId: o.id, severity: 'ATENCAO', dedupeKey: `apo-ocd-recurso-${o.id}` })
    await andamento({ tenantId, refType: REF.ocorrencia, refId: o.id, tipo: 'RECURSO', texto: 'Recurso interposto.', publico: true, userId: getUserId(req) })
    res.json(upd)
  }))

  // 6) Conclusão (após prazo de recurso ou julgamento do recurso por instância superior)
  router.post('/ocorrencias/:id/concluir', requireRole('COORDINATOR'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const o = await prisma.apoOcorrencia.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!o) throw httpError(404, 'Ocorrência não encontrada.')
    const erro = validarTransicaoOcorrencia('CONCLUIDA', { status: o.status as StatusOcorrencia, gravidade: o.gravidade, prazoRecursoEm: o.prazoRecursoEm })
    if (erro) throw httpError(409, erro)
    const data: any = { status: 'CONCLUIDA' }
    if (o.status === 'EM_RECURSO') {
      const b = parseBody(z.object({ recursoDecisao: z.enum(['MANTIDA', 'REFORMADA', 'ANULADA']), recursoFundamentacao: z.string().min(20).max(10000), novaSancao: z.enum(['ADVERTENCIA_VERBAL', 'ADVERTENCIA_ESCRITA', 'SUSPENSAO', 'ARQUIVAMENTO']).optional(), novaSancaoDias: z.number().int().min(1).max(30).optional() }), req.body)
      Object.assign(data, { recursoDecisao: b.recursoDecisao, recursoFundamentacao: b.recursoFundamentacao })
      if (b.recursoDecisao === 'REFORMADA') {
        if (!b.novaSancao) throw httpError(400, 'Informe a nova sanção ao reformar.')
        const e2 = validarSancao(o.gravidade, b.novaSancao, b.novaSancaoDias, b.recursoFundamentacao)
        if (e2) throw httpError(422, e2)
        Object.assign(data, { sancao: b.novaSancao, sancaoDias: b.novaSancaoDias ?? null })
      }
      if (b.recursoDecisao === 'ANULADA') Object.assign(data, { sancao: 'ARQUIVAMENTO', sancaoDias: null })
    }
    const upd = await prisma.apoOcorrencia.update({ where: { id: o.id }, data })
    await completeReminders({ tenantId, refType: REF.ocorrencia, refId: o.id })
    await notify({ tenantId, studentId: o.studentId, assunto: `Ocorrência ${o.numero} concluída`, mensagem: `Processo concluído${upd.recursoDecisao ? ` (recurso ${upd.recursoDecisao.toLowerCase()})` : ''}. Sanção final: ${(upd.sancao ?? '').replace(/_/g, ' ').toLowerCase()}.`, refType: REF.ocorrencia, refId: o.id })
    await andamento({ tenantId, refType: REF.ocorrencia, refId: o.id, tipo: 'STATUS', texto: 'Processo concluído.', publico: true, userId: getUserId(req) })
    // Suspensão/desligamento: avisa secretaria para efeitos acadêmicos
    if (upd.sancao === 'SUSPENSAO' || upd.sancao === 'DESLIGAMENTO') await scheduleReminder({ tenantId, modulo: MODULO, titulo: `Efetivar ${upd.sancao === 'DESLIGAMENTO' ? 'desligamento' : 'suspensão'} na secretaria (${o.numero})`, dueAt: addBusinessDays(new Date(), 2), assigneeRole: 'SECRETARY', refType: REF.ocorrencia, refId: o.id, severity: 'CRITICO', dedupeKey: `apo-ocd-efeito-${o.id}` })
    res.json(upd)
  }))

  router.post('/ocorrencias/:id/arquivar', requireRole('COORDINATOR'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const o = await prisma.apoOcorrencia.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!o) throw httpError(404, 'Ocorrência não encontrada.')
    const erro = validarTransicaoOcorrencia('ARQUIVADA', { status: o.status as StatusOcorrencia, gravidade: o.gravidade })
    if (erro) throw httpError(409, erro)
    const b = parseBody(z.object({ motivo: z.string().min(10).max(2000) }), req.body)
    await completeReminders({ tenantId, refType: REF.ocorrencia, refId: o.id })
    await andamento({ tenantId, refType: REF.ocorrencia, refId: o.id, tipo: 'STATUS', texto: `Arquivada: ${b.motivo}`, publico: o.status !== 'REGISTRADA', userId: getUserId(req) })
    res.json(await prisma.apoOcorrencia.update({ where: { id: o.id }, data: { status: 'ARQUIVADA', fundamentacao: b.motivo, sancao: 'ARQUIVAMENTO' } }))
  }))
}

// Job: prazo de defesa vencido sem defesa => avisa coordenação para instaurar julgamento; concluir quando recurso expirou.
export async function jobOcorrencias() {
  const agora = new Date()
  const semDefesa = await prisma.apoOcorrencia.findMany({ where: { status: 'NOTIFICADA', prazoDefesaEm: { lt: agora } }, take: 500 })
  for (const o of semDefesa) await scheduleReminder({ tenantId: o.tenantId, modulo: MODULO, titulo: `Prazo de defesa expirou sem manifestação (${o.numero}): instaurar julgamento`, dueAt: addBusinessDays(agora, 3), assigneeRole: 'COORDINATOR', refType: REF.ocorrencia, refId: o.id, severity: 'ATENCAO', dedupeKey: `apo-ocd-semdefesa-${o.id}` })
  const recExp = await prisma.apoOcorrencia.findMany({ where: { status: 'DECIDIDA', prazoRecursoEm: { lt: agora } }, take: 500 })
  for (const o of recExp) await scheduleReminder({ tenantId: o.tenantId, modulo: MODULO, titulo: `Prazo de recurso expirou: concluir ocorrência ${o.numero}`, dueAt: addBusinessDays(agora, 2), assigneeRole: 'COORDINATOR', refType: REF.ocorrencia, refId: o.id, dedupeKey: `apo-ocd-recexp-${o.id}` })
  return { semDefesa: semDefesa.length, recursoExpirado: recExp.length }
}
