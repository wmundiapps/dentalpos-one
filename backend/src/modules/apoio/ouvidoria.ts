import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getUserId, requireRole } from '../academico/middleware'
import { Branding, brandHeaderHtml, escapeHtml as esc, getBranding } from '../core/branding'
import { mountCrud, pageParams, parseBody, qs } from '../core/crud'
import { audit, notify } from '../core/notify'
import { cancelReminders, completeReminders } from '../core/reminders'
import { MODULO, REF, andamento, hasRole, httpError, isSuper, limitar, nomesUsuarios, proximoSeq, resolverTenantPublico, tid, scheduleReminder } from './common'
import { PRAZO_OUVIDORIA_DIAS, PRORROGACAO_OUVIDORIA_DIAS, addBusinessDays, addDays, agregarManifestacoes, estadoSla, gerarProtocolo, gerarSenhaAcompanhamento, hashSenha, protocoloValido, verificarSenha, round1 } from './logic'

const OUV: any[] = ['SUPPORT']          // ouvidoria (a administração/reitoria tem acesso total automático)
const OUV_LEIT: any[] = ['SUPPORT', 'COORDINATOR']
const TIPOS = ['RECLAMACAO', 'SUGESTAO', 'ELOGIO', 'DENUNCIA', 'SOLICITACAO'] as const

const manifestacaoSchema = z.object({
  tipo: z.enum(TIPOS), assunto: z.string().min(5).max(200), descricao: z.string().min(20).max(10000), categoria: z.string().max(80).optional(),
  anonima: z.boolean().default(false), nome: z.string().max(150).optional(), email: z.string().email().max(150).optional(), telefone: z.string().max(30).optional(),
  vinculo: z.enum(['ALUNO', 'PROFESSOR', 'FUNCIONARIO', 'EGRESSO', 'COMUNIDADE']).optional(), setorId: z.string().optional(),
})

async function criarManifestacao(tenantId: string, d: z.infer<typeof manifestacaoSchema>, ctx: { canal: string; userId?: string; studentId?: string }) {
  const anonima = d.anonima
  if (!anonima && ctx.canal === 'PUBLICO' && (!d.nome || (!d.email && !d.telefone))) throw httpError(422, 'Manifestação identificada exige nome e e-mail ou telefone (ou marque como anônima).')
  const ano = new Date().getFullYear()
  const seq = await proximoSeq(tenantId, `OUV-${ano}`)
  const protocolo = gerarProtocolo(ano, seq)
  const senha = gerarSenhaAcompanhamento()
  const { hash, salt } = hashSenha(senha)
  const setor = d.setorId ? await prisma.apoSetorOuvidoria.findFirst({ where: { id: d.setorId, tenantId, ativo: true } }) : null
  const prazoEm = addDays(new Date(), PRAZO_OUVIDORIA_DIAS)
  const prioridade = d.tipo === 'DENUNCIA' ? 'ALTA' : 'NORMAL'
  const m = await prisma.apoManifestacao.create({
    data: {
      tenantId, protocolo, senhaHash: hash, senhaSalt: salt, tipo: d.tipo, categoria: d.categoria, assunto: d.assunto, descricao: d.descricao, anonima, prioridade, canal: ctx.canal, prazoEm, setorId: setor?.id,
      ...(anonima ? {} : { nome: d.nome, email: d.email, telefone: d.telefone, vinculo: d.vinculo, userId: ctx.userId, studentId: ctx.studentId }),
    },
  })
  await andamento({ tenantId, refType: REF.manifestacao, refId: m.id, tipo: 'STATUS', texto: 'Manifestação recebida pela Ouvidoria.', publico: true })
  await scheduleReminder({ tenantId, modulo: MODULO, titulo: `Triar manifestação ${protocolo} (${d.tipo})`, dueAt: addBusinessDays(new Date(), 2), assigneeRole: 'SUPPORT', refType: REF.manifestacao, refId: m.id, severity: d.tipo === 'DENUNCIA' ? 'CRITICO' : 'ATENCAO', dedupeKey: `apo-ouv-triar-${m.id}` })
  await scheduleReminder({ tenantId, modulo: MODULO, titulo: `Prazo final de resposta: manifestação ${protocolo}`, dueAt: prazoEm, antecedenciaDias: 5, assigneeRole: 'SUPPORT', refType: REF.manifestacao, refId: m.id, severity: 'ATENCAO', dedupeKey: `apo-ouv-prazo-${m.id}` })
  return { m, senha }
}

// Notifica o manifestante pelos canais disponíveis (nunca para anônimas).
async function notificarManifestante(m: any, assunto: string, mensagem: string) {
  if (m.anonima) return
  if (m.studentId) await notify({ tenantId: m.tenantId, studentId: m.studentId, assunto, mensagem, refType: REF.manifestacao, refId: m.id })
  else if (m.userId) await notify({ tenantId: m.tenantId, userId: m.userId, assunto, mensagem, refType: REF.manifestacao, refId: m.id })
  if (m.email) await notify({ tenantId: m.tenantId, canal: 'EMAIL', destino: m.email, assunto, mensagem, refType: REF.manifestacao, refId: m.id })
  else if (m.telefone) await notify({ tenantId: m.tenantId, canal: 'WHATSAPP', destino: m.telefone, assunto, mensagem, refType: REF.manifestacao, refId: m.id })
}

// Identificação do manifestante: oculta para quem não é da ouvidoria; denúncias identificadas ficam restritas.
function visao(m: any, req: AuthenticatedRequest) {
  const { senhaHash, senhaSalt, consultaFalhas, consultaBloqueadaAte, ...r } = m
  const ouv = isSuper(req) || req.user?.role === 'SUPPORT'
  if (!ouv || (m.tipo === 'DENUNCIA' && !isSuper(req) && req.user?.role !== 'SUPPORT')) { const { nome, email, telefone, userId, studentId, vinculo, ...resto } = r; return { ...resto, identificacaoOculta: true } }
  return { ...r, sla: estadoSla(m.createdAt, m.prazoEm) }
}

export function mountOuvidoria(router: Router) {
  mountCrud(router, { model: 'apoSetorOuvidoria', path: '/ouvidoria/setores', read: OUV_LEIT, write: OUV, readAll: true, create: z.object({ codigo: z.string().min(2).max(30).transform((s) => s.toUpperCase()), nome: z.string().min(2).max(150), email: z.string().email().optional(), responsavelUserId: z.string().optional(), slaDias: z.number().int().min(1).max(60).default(10), escalaParaUserId: z.string().optional(), ativo: z.boolean().default(true) }), orderBy: { nome: 'asc' }, modulo: MODULO })

  // Registro interno (portal logado ou balcão/telefone pela equipe)
  router.post('/ouvidoria/manifestacoes', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(manifestacaoSchema.extend({ canal: z.enum(['PORTAL', 'PRESENCIAL', 'TELEFONE', 'EMAIL']).optional() }), req.body)
    const equipe = isSuper(req) || req.user?.role === 'SUPPORT'
    const canal = equipe && b.canal ? b.canal : 'PORTAL'
    const { m, senha } = await criarManifestacao(tenantId, b, { canal, userId: b.anonima ? undefined : getUserId(req), studentId: req.user?.studentId })
    res.status(201).json({ id: m.id, protocolo: m.protocolo, senhaAcompanhamento: senha, prazoEm: m.prazoEm, aviso: 'Guarde o protocolo e a senha: a senha não pode ser recuperada.' })
  }))

  router.get('/ouvidoria/minhas', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const or: any[] = [{ userId: getUserId(req) }]
    if (req.user?.studentId) or.push({ studentId: req.user.studentId })
    const items = await prisma.apoManifestacao.findMany({ where: { tenantId, OR: or, anonima: false }, orderBy: { createdAt: 'desc' }, take: 100 })
    const ands = await prisma.apoAndamento.findMany({ where: { tenantId, refType: REF.manifestacao, refId: { in: items.map((i) => i.id) }, publico: true }, orderBy: { createdAt: 'asc' } })
    res.json(items.map((m) => ({ id: m.id, protocolo: m.protocolo, tipo: m.tipo, assunto: m.assunto, status: m.status, prazoEm: m.prazoEm, respostaFinal: m.respostaFinal, avaliacaoNota: m.avaliacaoNota, andamentos: ands.filter((a) => a.refId === m.id) })))
  }))

  router.post('/ouvidoria/manifestacoes/:id/avaliar', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const m = await prisma.apoManifestacao.findFirst({ where: { id: String(req.params.id), tenantId, anonima: false } })
    const meu = m && (m.userId === getUserId(req) || (req.user?.studentId && m.studentId === req.user.studentId))
    if (!m || !meu) throw httpError(404, 'Manifestação não encontrada.')
    const b = parseBody(z.object({ nota: z.number().int().min(1).max(5), comentario: z.string().max(2000).optional() }), req.body)
    res.json(await avaliarEncerrar(m, b.nota, b.comentario))
  }))

  router.get('/ouvidoria/manifestacoes', requireRole(...OUV_LEIT), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    for (const f of ['status', 'tipo', 'setorId', 'prioridade']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    if (qs(req.query.vencidas) === 'true') { where.prazoEm = { lt: new Date() }; where.status = { in: ['RECEBIDA', 'EM_ANALISE', 'ENCAMINHADA'] } }
    const q = qs(req.query.q)
    if (q) where.OR = [{ protocolo: { contains: q, mode: 'insensitive' } }, { assunto: { contains: q, mode: 'insensitive' } }]
    const [items, total] = await Promise.all([prisma.apoManifestacao.findMany({ where, orderBy: [{ prazoEm: 'asc' }], skip, take }), prisma.apoManifestacao.count({ where })])
    res.json({ items: items.map((m) => ({ ...visao(m, req), descricao: undefined })), total, page, pageSize })
  }))

  router.get('/ouvidoria/manifestacoes/:id', requireRole(...OUV_LEIT), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const m = await prisma.apoManifestacao.findFirst({ where: { id: String(req.params.id), tenantId }, include: { encaminhamentos: { orderBy: { createdAt: 'asc' } } } })
    if (!m) throw httpError(404, 'Manifestação não encontrada.')
    const hist = await prisma.apoAndamento.findMany({ where: { tenantId, refType: REF.manifestacao, refId: m.id }, orderBy: { createdAt: 'asc' } })
    if (m.tipo === 'DENUNCIA') await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'DENUNCIA_LIDA', refType: REF.manifestacao, refId: m.id })
    res.json({ ...visao(m, req), andamentos: hist })
  }))

  router.post('/ouvidoria/manifestacoes/:id/triar', requireRole(...OUV), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const m = await prisma.apoManifestacao.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!m) throw httpError(404, 'Manifestação não encontrada.')
    if (m.status !== 'RECEBIDA') throw httpError(409, `Manifestação ${m.status}.`)
    const b = parseBody(z.object({ prioridade: z.enum(['BAIXA', 'NORMAL', 'ALTA', 'URGENTE']).optional(), categoria: z.string().max(80).optional(), setorId: z.string().optional(), responsavelUserId: z.string().optional() }), req.body ?? {})
    const upd = await prisma.apoManifestacao.update({ where: { id: m.id }, data: { ...b, status: 'EM_ANALISE', responsavelUserId: b.responsavelUserId ?? getUserId(req) } })
    await completeReminders({ tenantId, refType: REF.manifestacao, refId: m.id, userId: getUserId(req) }) // conclui triagem (lembrete do prazo final é recriado abaixo)
    await scheduleReminder({ tenantId, modulo: MODULO, titulo: `Prazo final de resposta: manifestação ${m.protocolo}`, dueAt: m.prazoEm, antecedenciaDias: 5, assigneeUserId: upd.responsavelUserId ?? undefined, assigneeRole: upd.responsavelUserId ? undefined : 'SUPPORT', refType: REF.manifestacao, refId: m.id, severity: 'ATENCAO', dedupeKey: `apo-ouv-prazo-${m.id}` })
    await andamento({ tenantId, refType: REF.manifestacao, refId: m.id, tipo: 'STATUS', texto: 'Manifestação em análise.', publico: true, userId: getUserId(req) })
    await notificarManifestante(m, `Manifestação ${m.protocolo} em análise`, 'Sua manifestação foi triada e está em análise pela Ouvidoria.')
    res.json(visao(upd, req))
  }))

  router.post('/ouvidoria/manifestacoes/:id/encaminhar', requireRole(...OUV), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const m = await prisma.apoManifestacao.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!m) throw httpError(404, 'Manifestação não encontrada.')
    if (['RESPONDIDA', 'ENCERRADA', 'ARQUIVADA'].includes(m.status)) throw httpError(409, `Manifestação ${m.status}.`)
    const b = parseBody(z.object({ setorId: z.string(), solicitacao: z.string().min(10).max(3000), prazoDias: z.number().int().min(1).max(60).optional() }), req.body)
    const setor = await prisma.apoSetorOuvidoria.findFirst({ where: { id: b.setorId, tenantId, ativo: true } })
    if (!setor) throw httpError(404, 'Setor não encontrado.')
    let prazo = addBusinessDays(new Date(), b.prazoDias ?? setor.slaDias)
    if (prazo > m.prazoEm) prazo = new Date(m.prazoEm.getTime() - 2 * 86_400_000) // deixa folga para a resposta final
    if (prazo <= new Date()) throw httpError(422, 'Prazo da manifestação insuficiente para novo encaminhamento (prorrogue antes).')
    const enc = await prisma.apoEncaminhamento.create({ data: { tenantId, manifestacaoId: m.id, setorId: setor.id, solicitacao: b.solicitacao, prazoEm: prazo } })
    await prisma.apoManifestacao.update({ where: { id: m.id }, data: { status: 'ENCAMINHADA', setorId: setor.id } })
    // setor não recebe identificação de denunciante/manifestante: apenas conteúdo
    if (setor.responsavelUserId) await notify({ tenantId, userId: setor.responsavelUserId, assunto: `Ouvidoria: manifestação ${m.protocolo} encaminhada ao seu setor`, mensagem: `${b.solicitacao}\nPrazo de resposta: ${prazo.toLocaleDateString('pt-BR')}.`, refType: REF.encaminhamento, refId: enc.id })
    await scheduleReminder({ tenantId, modulo: MODULO, titulo: `Responder à Ouvidoria: ${m.protocolo} (${setor.nome})`, dueAt: prazo, antecedenciaDias: 2, assigneeUserId: setor.responsavelUserId ?? undefined, assigneeRole: setor.responsavelUserId ? undefined : 'SUPPORT', refType: REF.encaminhamento, refId: enc.id, severity: 'ATENCAO', dedupeKey: `apo-ouv-enc-${enc.id}` })
    await andamento({ tenantId, refType: REF.manifestacao, refId: m.id, tipo: 'ENCAMINHAMENTO', texto: `Encaminhada ao setor ${setor.nome} (prazo ${prazo.toLocaleDateString('pt-BR')}).`, publico: true, userId: getUserId(req) })
    await notificarManifestante(m, `Manifestação ${m.protocolo} encaminhada`, `Sua manifestação foi encaminhada ao setor responsável (${setor.nome}).`)
    res.status(201).json(enc)
  }))

  router.get('/ouvidoria/encaminhamentos/meus', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const setores = await prisma.apoSetorOuvidoria.findMany({ where: { tenantId, OR: [{ responsavelUserId: getUserId(req) }, { escalaParaUserId: getUserId(req) }] }, select: { id: true } })
    const items = await prisma.apoEncaminhamento.findMany({ where: { tenantId, setorId: { in: setores.map((s) => s.id) }, ...(qs(req.query.status) ? { status: qs(req.query.status) } : {}) }, include: { manifestacao: { select: { protocolo: true, tipo: true, assunto: true, descricao: true } } }, orderBy: { prazoEm: 'asc' }, take: 200 })
    res.json(items)
  }))

  router.post('/ouvidoria/encaminhamentos/:id/responder', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const enc = await prisma.apoEncaminhamento.findFirst({ where: { id: String(req.params.id), tenantId }, include: { manifestacao: true } })
    if (!enc) throw httpError(404, 'Encaminhamento não encontrado.')
    const setor = await prisma.apoSetorOuvidoria.findFirst({ where: { id: enc.setorId, tenantId } })
    const autorizado = isSuper(req) || req.user?.role === 'SUPPORT' || setor?.responsavelUserId === getUserId(req) || setor?.escalaParaUserId === getUserId(req)
    if (!autorizado) throw httpError(403, 'Somente o responsável do setor responde.')
    if (enc.status === 'RESPONDIDO') throw httpError(409, 'Encaminhamento já respondido.')
    const b = parseBody(z.object({ resposta: z.string().min(10).max(8000) }), req.body)
    await prisma.apoEncaminhamento.update({ where: { id: enc.id }, data: { status: 'RESPONDIDO', resposta: b.resposta, respondidoEm: new Date(), respondidoPorId: getUserId(req) } })
    await completeReminders({ tenantId, refType: REF.encaminhamento, refId: enc.id, userId: getUserId(req) })
    await andamento({ tenantId, refType: REF.manifestacao, refId: enc.manifestacaoId, tipo: 'RESPOSTA', texto: `Resposta do setor ${setor?.nome ?? ''}: ${b.resposta}`, publico: false, userId: getUserId(req) })
    const pend = await prisma.apoEncaminhamento.count({ where: { tenantId, manifestacaoId: enc.manifestacaoId, status: { not: 'RESPONDIDO' } } })
    if (pend === 0 && enc.manifestacao.status === 'ENCAMINHADA') {
      await prisma.apoManifestacao.update({ where: { id: enc.manifestacaoId }, data: { status: 'EM_ANALISE' } })
      await scheduleReminder({ tenantId, modulo: MODULO, titulo: `Setor respondeu: elaborar resposta final (${enc.manifestacao.protocolo})`, dueAt: addBusinessDays(new Date(), 3), assigneeUserId: enc.manifestacao.responsavelUserId ?? undefined, assigneeRole: enc.manifestacao.responsavelUserId ? undefined : 'SUPPORT', refType: REF.manifestacao, refId: enc.manifestacaoId, severity: 'ATENCAO', dedupeKey: `apo-ouv-final-${enc.manifestacaoId}` })
    }
    res.json({ ok: true })
  }))

  // Resposta conclusiva ao cidadão
  router.post('/ouvidoria/manifestacoes/:id/responder', requireRole(...OUV), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const m = await prisma.apoManifestacao.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!m) throw httpError(404, 'Manifestação não encontrada.')
    if (!['RECEBIDA', 'EM_ANALISE', 'ENCAMINHADA'].includes(m.status)) throw httpError(409, `Manifestação ${m.status}.`)
    const b = parseBody(z.object({ resposta: z.string().min(20).max(10000), forcar: z.boolean().optional() }), req.body)
    const pend = await prisma.apoEncaminhamento.count({ where: { tenantId, manifestacaoId: m.id, status: { not: 'RESPONDIDO' } } })
    if (pend > 0 && !b.forcar) throw httpError(422, `Há ${pend} encaminhamento(s) sem resposta do setor.`)
    const upd = await prisma.apoManifestacao.update({ where: { id: m.id }, data: { status: 'RESPONDIDA', respostaFinal: b.resposta, respondidaEm: new Date() } })
    await completeReminders({ tenantId, refType: REF.manifestacao, refId: m.id, userId: getUserId(req) })
    await andamento({ tenantId, refType: REF.manifestacao, refId: m.id, tipo: 'RESPOSTA', texto: b.resposta, publico: true, userId: getUserId(req) })
    await notificarManifestante(m, `Manifestação ${m.protocolo} respondida`, 'Sua manifestação foi respondida. Consulte com seu protocolo e senha e avalie o atendimento.')
    // Avaliação do atendimento: lembrete em 10 dias → encerramento automático pelo job
    await scheduleReminder({ tenantId, modulo: MODULO, titulo: `Encerrar manifestação ${m.protocolo} (sem avaliação do cidadão)`, dueAt: addDays(new Date(), 10), assigneeRole: 'SUPPORT', refType: REF.manifestacao, refId: m.id, dedupeKey: `apo-ouv-enc-auto-${m.id}` })
    await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'OUVIDORIA_RESPONDIDA', refType: REF.manifestacao, refId: m.id })
    res.json(visao(upd, req))
  }))

  router.post('/ouvidoria/manifestacoes/:id/prorrogar', requireRole(...OUV), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const m = await prisma.apoManifestacao.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!m) throw httpError(404, 'Manifestação não encontrada.')
    if (m.prorrogadoEm) throw httpError(409, 'Prazo já prorrogado (Lei 13.460/2017: uma única prorrogação).')
    if (!['RECEBIDA', 'EM_ANALISE', 'ENCAMINHADA'].includes(m.status)) throw httpError(409, `Manifestação ${m.status}.`)
    const b = parseBody(z.object({ justificativa: z.string().min(15).max(2000) }), req.body)
    const novo = addDays(m.prazoEm, PRORROGACAO_OUVIDORIA_DIAS)
    const upd = await prisma.apoManifestacao.update({ where: { id: m.id }, data: { prazoEm: novo, prorrogadoEm: new Date() } })
    await scheduleReminder({ tenantId, modulo: MODULO, titulo: `Prazo final de resposta: manifestação ${m.protocolo}`, dueAt: novo, antecedenciaDias: 5, assigneeUserId: m.responsavelUserId ?? undefined, assigneeRole: m.responsavelUserId ? undefined : 'SUPPORT', refType: REF.manifestacao, refId: m.id, dedupeKey: `apo-ouv-prazo-${m.id}` })
    await andamento({ tenantId, refType: REF.manifestacao, refId: m.id, tipo: 'STATUS', texto: `Prazo prorrogado até ${novo.toLocaleDateString('pt-BR')}: ${b.justificativa}`, publico: true, userId: getUserId(req) })
    await notificarManifestante(m, `Prazo prorrogado: ${m.protocolo}`, `O prazo de resposta foi prorrogado até ${novo.toLocaleDateString('pt-BR')}. Motivo: ${b.justificativa}`)
    res.json(visao(upd, req))
  }))

  router.post('/ouvidoria/manifestacoes/:id/arquivar', requireRole(...OUV), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const m = await prisma.apoManifestacao.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!m) throw httpError(404, 'Manifestação não encontrada.')
    if (['ENCERRADA', 'ARQUIVADA'].includes(m.status)) throw httpError(409, `Manifestação ${m.status}.`)
    const b = parseBody(z.object({ motivo: z.string().min(15).max(2000) }), req.body)
    await cancelReminders({ tenantId, refType: REF.manifestacao, refId: m.id })
    const encs = await prisma.apoEncaminhamento.findMany({ where: { tenantId, manifestacaoId: m.id }, select: { id: true } })
    for (const e of encs) await cancelReminders({ tenantId, refType: REF.encaminhamento, refId: e.id })
    await andamento({ tenantId, refType: REF.manifestacao, refId: m.id, tipo: 'STATUS', texto: `Arquivada: ${b.motivo}`, publico: true, userId: getUserId(req) })
    await notificarManifestante(m, `Manifestação ${m.protocolo} arquivada`, `Motivo: ${b.motivo}`)
    res.json(visao(await prisma.apoManifestacao.update({ where: { id: m.id }, data: { status: 'ARQUIVADA', encerradaEm: new Date(), respostaFinal: b.motivo } }), req))
  }))

  router.post('/ouvidoria/manifestacoes/:id/reabrir', requireRole(...OUV), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const m = await prisma.apoManifestacao.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!m || !['RESPONDIDA', 'ENCERRADA'].includes(m.status)) throw httpError(409, 'Somente manifestações respondidas/encerradas podem ser reabertas.')
    if (m.encerradaEm && m.encerradaEm < addDays(new Date(), -30)) throw httpError(422, 'Prazo para reabertura (30 dias) expirou: abra nova manifestação.')
    const b = parseBody(z.object({ motivo: z.string().min(10).max(1000) }), req.body)
    const prazo = addDays(new Date(), 10)
    const upd = await prisma.apoManifestacao.update({ where: { id: m.id }, data: { status: 'EM_ANALISE', prazoEm: prazo, encerradaEm: null, respondidaEm: null } })
    await scheduleReminder({ tenantId, modulo: MODULO, titulo: `Manifestação REABERTA ${m.protocolo}`, dueAt: prazo, assigneeRole: 'SUPPORT', refType: REF.manifestacao, refId: m.id, severity: 'ATENCAO', dedupeKey: `apo-ouv-prazo-${m.id}` })
    await andamento({ tenantId, refType: REF.manifestacao, refId: m.id, tipo: 'STATUS', texto: `Reaberta: ${b.motivo}`, publico: true, userId: getUserId(req) })
    res.json(visao(upd, req))
  }))

  router.post('/ouvidoria/manifestacoes/:id/nota-interna', requireRole(...OUV_LEIT), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const m = await prisma.apoManifestacao.findFirst({ where: { id: String(req.params.id), tenantId }, select: { id: true } })
    if (!m) throw httpError(404, 'Manifestação não encontrada.')
    const b = parseBody(z.object({ texto: z.string().min(2).max(4000) }), req.body)
    res.status(201).json(await andamento({ tenantId, refType: REF.manifestacao, refId: m.id, tipo: 'NOTA', texto: b.texto, publico: false, userId: getUserId(req) }))
  }))

  // ---------- relatórios ----------
  router.get('/ouvidoria/relatorio', requireRole(...OUV_LEIT), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const ano = Number(qs(req.query.ano)) || new Date().getFullYear()
    res.json(await montarRelatorio(tenantId, ano))
  }))

  router.get('/ouvidoria/relatorio-anual', requireRole(...OUV_LEIT), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const ano = Number(qs(req.query.ano)) || new Date().getFullYear()
    const [dados, b] = await Promise.all([montarRelatorio(tenantId, ano), getBranding(tenantId)])
    res.type('html').send(renderRelatorioAnual(b, ano, dados))
  }))
}

async function avaliarEncerrar(m: any, nota: number, comentario?: string) {
  if (m.status !== 'RESPONDIDA') throw httpError(409, 'A avaliação só é possível após a resposta conclusiva.')
  if (m.avaliacaoNota != null) throw httpError(409, 'Atendimento já avaliado.')
  const upd = await prisma.apoManifestacao.update({ where: { id: m.id }, data: { avaliacaoNota: nota, avaliacaoComentario: comentario, status: 'ENCERRADA', encerradaEm: new Date() } })
  await completeReminders({ tenantId: m.tenantId, refType: REF.manifestacao, refId: m.id })
  await andamento({ tenantId: m.tenantId, refType: REF.manifestacao, refId: m.id, tipo: 'STATUS', texto: `Atendimento avaliado (${nota}/5). Manifestação encerrada.`, publico: true })
  if (nota <= 2) await scheduleReminder({ tenantId: m.tenantId, modulo: MODULO, titulo: `Avaliação baixa na Ouvidoria (${m.protocolo}): analisar causa`, dueAt: addDays(new Date(), 5), assigneeRole: 'SUPPORT', refType: REF.manifestacao, refId: m.id, severity: 'ATENCAO', dedupeKey: `apo-ouv-nota-baixa-${m.id}` })
  return { id: upd.id, status: upd.status }
}

export async function montarRelatorio(tenantId: string, ano: number) {
  const ini = new Date(ano, 0, 1), fim = new Date(ano + 1, 0, 1)
  const [lista, anterior, setores, encs] = await Promise.all([
    prisma.apoManifestacao.findMany({ where: { tenantId, createdAt: { gte: ini, lt: fim } }, select: { tipo: true, status: true, setorId: true, createdAt: true, prazoEm: true, respondidaEm: true, encerradaEm: true, anonima: true, avaliacaoNota: true, categoria: true, escalonamentos: true, prorrogadoEm: true } }),
    prisma.apoManifestacao.count({ where: { tenantId, createdAt: { gte: new Date(ano - 1, 0, 1), lt: ini } } }),
    prisma.apoSetorOuvidoria.findMany({ where: { tenantId } }),
    prisma.apoEncaminhamento.findMany({ where: { tenantId, createdAt: { gte: ini, lt: fim } }, select: { setorId: true, status: true, prazoEm: true, respondidoEm: true, createdAt: true } }),
  ])
  const agg = agregarManifestacoes(lista.map((m) => ({ ...m, criadoEm: m.createdAt })))
  const nomeSetor = Object.fromEntries(setores.map((s) => [s.id, s.nome]))
  const porSetor = Object.entries(agg.porSetor).map(([id, n]) => ({ setor: nomeSetor[id] ?? 'Sem setor definido', total: n }))
  const porSetorDesempenho = setores.map((s) => {
    const e = encs.filter((x) => x.setorId === s.id)
    const resp = e.filter((x) => x.respondidoEm)
    return { setor: s.nome, encaminhamentos: e.length, respondidos: resp.length, noPrazo: resp.filter((x) => x.respondidoEm! <= x.prazoEm).length, tempoMedioDias: resp.length ? round1(resp.reduce((a, x) => a + (x.respondidoEm!.getTime() - x.createdAt.getTime()) / 86_400_000, 0) / resp.length) : null }
  }).filter((x) => x.encaminhamentos > 0)
  const porMes = Array.from({ length: 12 }, (_, i) => ({ mes: i + 1, total: lista.filter((m) => m.createdAt.getMonth() === i).length }))
  const recomendacoes: string[] = []
  if (agg.percentualNoPrazo != null && agg.percentualNoPrazo < 80) recomendacoes.push(`Apenas ${agg.percentualNoPrazo}% das manifestações foram respondidas no prazo: reforçar o acompanhamento de SLA e a capacidade dos setores.`)
  if (agg.satisfacaoMedia != null && agg.satisfacaoMedia < 3.5) recomendacoes.push(`Satisfação média com o atendimento da Ouvidoria é ${agg.satisfacaoMedia}/5: revisar qualidade e clareza das respostas.`)
  const maiorSetor = [...porSetor].sort((a, b) => b.total - a.total)[0]
  if (maiorSetor && agg.total >= 10 && maiorSetor.total / agg.total > 0.35) recomendacoes.push(`O setor "${maiorSetor.setor}" concentra ${Math.round((maiorSetor.total / agg.total) * 100)}% das manifestações: priorizar plano de melhoria.`)
  if (agg.escalonadas > 0) recomendacoes.push(`${agg.escalonadas} manifestação(ões) precisaram de escalonamento por atraso.`)
  if ((agg.porTipo.DENUNCIA ?? 0) > 0) recomendacoes.push('Garantir apuração e retorno das denúncias, preservando o sigilo do denunciante.')
  return { ano, ...agg, anoAnteriorTotal: anterior, variacaoPercentual: anterior ? round1(((agg.total - anterior) / anterior) * 100) : null, porSetorNomeado: porSetor, desempenhoSetores: porSetorDesempenho, porMes, prorrogadas: lista.filter((m) => m.prorrogadoEm).length, recomendacoes }
}

const TIPO_ROT: Record<string, string> = { RECLAMACAO: 'Reclamações', SUGESTAO: 'Sugestões', ELOGIO: 'Elogios', DENUNCIA: 'Denúncias', SOLICITACAO: 'Solicitações' }
const STATUS_ROT: Record<string, string> = { RECEBIDA: 'Recebidas', EM_ANALISE: 'Em análise', ENCAMINHADA: 'Encaminhadas', RESPONDIDA: 'Respondidas', ENCERRADA: 'Encerradas', ARQUIVADA: 'Arquivadas' }
const MES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

export function renderRelatorioAnual(b: Branding, ano: number, d: Awaited<ReturnType<typeof montarRelatorio>>) {
  const tabela = (rows: Array<[string, string | number]>, cab: [string, string]) => `<table><thead><tr><th>${cab[0]}</th><th style="text-align:right">${cab[1]}</th></tr></thead><tbody>${rows.map(([a, v]) => `<tr><td>${esc(a)}</td><td style="text-align:right">${esc(v)}</td></tr>`).join('') || '<tr><td colspan="2">Sem registros</td></tr>'}</tbody></table>`
  const max = Math.max(1, ...d.porMes.map((m) => m.total))
  const barras = d.porMes.map((m) => `<div style="flex:1;text-align:center"><div style="height:${Math.round((m.total / max) * 90)}px;background:${esc(b.cores.primaria)};border-radius:4px 4px 0 0;margin:0 3px;min-height:2px"></div><div style="font-size:10px;color:#475569">${MES[m.mes - 1]}<br/>${m.total}</div></div>`).join('')
  const kpi = (r: string, v: string) => `<div class="kpi"><div class="v">${esc(v)}</div><div class="r">${esc(r)}</div></div>`
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório Anual da Ouvidoria ${ano}</title><style>
body{font-family:Arial,Helvetica,sans-serif;color:#0f172a;margin:0;padding:0 0 40px}main{max-width:900px;margin:0 auto;padding:0 24px}h2{color:${esc(b.cores.secundaria)};border-bottom:2px solid ${esc(b.cores.primaria)};padding-bottom:4px;margin-top:28px}
table{width:100%;border-collapse:collapse;font-size:13px;margin:8px 0}th,td{border-bottom:1px solid #e2e8f0;padding:6px 8px;text-align:left}th{background:#f1f5f9}.kpis{display:flex;gap:12px;flex-wrap:wrap}.kpi{flex:1;min-width:150px;border:1px solid #e2e8f0;border-radius:10px;padding:12px;text-align:center}.kpi .v{font-size:26px;font-weight:700;color:${esc(b.cores.primaria)}}.kpi .r{font-size:12px;color:#475569}
.graf{display:flex;align-items:flex-end;height:120px;border-bottom:1px solid #94a3b8;margin:12px 0}li{margin:6px 0;font-size:14px}@media print{@page{margin:14mm}}</style></head><body>
${brandHeaderHtml(b, { titulo: `Relatório Anual da Ouvidoria — ${ano}`, subtitulo: 'Lei nº 13.460/2017 · acompanhamento de manifestações' })}
<main>
<h2>1. Panorama</h2>
<div class="kpis">${kpi('Manifestações recebidas', String(d.total))}${kpi('Variação vs. ano anterior', d.variacaoPercentual == null ? '—' : (d.variacaoPercentual > 0 ? '+' : '') + d.variacaoPercentual + '%')}${kpi('Respondidas no prazo', d.percentualNoPrazo == null ? '—' : d.percentualNoPrazo + '%')}${kpi('Tempo médio de resposta', d.tempoMedioRespostaDias == null ? '—' : d.tempoMedioRespostaDias + ' dias')}${kpi('Satisfação média', d.satisfacaoMedia == null ? '—' : d.satisfacaoMedia + ' / 5')}</div>
<div class="graf">${barras}</div>
<h2>2. Por tipo</h2>${tabela(Object.entries(d.porTipo).map(([k, v]) => [TIPO_ROT[k] ?? k, v]), ['Tipo', 'Quantidade'])}
<h2>3. Situação atual</h2>${tabela(Object.entries(d.porStatus).map(([k, v]) => [STATUS_ROT[k] ?? k, v]), ['Situação', 'Quantidade'])}
<h2>4. Por setor</h2>${tabela(d.porSetorNomeado.map((s) => [s.setor, s.total]), ['Setor', 'Manifestações'])}
${d.desempenhoSetores.length ? `<table><thead><tr><th>Setor</th><th>Encaminhamentos</th><th>Respondidos</th><th>No prazo</th><th>Tempo médio (dias)</th></tr></thead><tbody>${d.desempenhoSetores.map((s) => `<tr><td>${esc(s.setor)}</td><td>${s.encaminhamentos}</td><td>${s.respondidos}</td><td>${s.noPrazo}</td><td>${s.tempoMedioDias ?? '—'}</td></tr>`).join('')}</tbody></table>` : ''}
<h2>5. Indicadores de gestão</h2>
<ul><li>Manifestações anônimas: <strong>${d.anonimas}</strong></li><li>Prazos prorrogados: <strong>${d.prorrogadas}</strong></li><li>Escalonadas por atraso: <strong>${d.escalonadas}</strong></li><li>Em aberto e vencidas: <strong>${d.abertasVencidas}</strong></li><li>Avaliações do atendimento recebidas: <strong>${d.avaliacoes}</strong></li></ul>
<h2>6. Recomendações</h2>${d.recomendacoes.length ? `<ul>${d.recomendacoes.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : '<p>Nenhuma recomendação crítica identificada para o período.</p>'}
<p style="margin-top:40px;font-size:12px;color:#64748b">Documento gerado em ${new Date().toLocaleDateString('pt-BR')}. Dados pessoais de manifestantes e denunciantes não são divulgados neste relatório (LGPD).</p>
<div style="margin-top:48px;text-align:center"><div style="display:inline-block;border-top:1px solid #334155;padding-top:4px;min-width:280px">Ouvidor(a)<br/>${esc(b.nome)}</div></div>
</main></body></html>`
}

// ---------- rotas PÚBLICAS (sem login) ----------
const ip = (req: Request) => String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'ip').split(',')[0].trim()
const ERRO_CONSULTA = 'Protocolo ou senha inválidos.'

export function mountOuvidoriaPublic(pub: Router) {
  pub.post('/ouvidoria/:tenant/manifestacoes', asyncHandler(async (req: Request, res: Response) => {
    if (!limitar(`ouv-novo:${ip(req)}`, 8, 3_600_000)) throw httpError(429, 'Muitas manifestações em pouco tempo. Tente mais tarde.')
    const tenantId = await resolverTenantPublico(String(req.params.tenant))
    if (!tenantId) throw httpError(404, 'Instituição não encontrada.')
    if (req.body?.website) return res.status(201).json({ ok: true }) // honeypot anti-bot
    const b = parseBody(manifestacaoSchema, req.body)
    const { m, senha } = await criarManifestacao(tenantId, { ...b, setorId: undefined }, { canal: 'PUBLICO' })
    res.status(201).json({ protocolo: m.protocolo, senhaAcompanhamento: senha, prazoEm: m.prazoEm, anonima: m.anonima, aviso: 'Guarde o protocolo e a senha para acompanhar o andamento. A senha não pode ser recuperada.' })
  }))

  async function autenticar(req: Request): Promise<any> {
    const tenantId = await resolverTenantPublico(String(req.params.tenant))
    if (!tenantId) throw httpError(404, ERRO_CONSULTA)
    if (!limitar(`ouv-consulta:${ip(req)}`, 30, 600_000)) throw httpError(429, 'Muitas tentativas. Aguarde alguns minutos.')
    const protocolo = String(req.body?.protocolo ?? '').trim().toUpperCase()
    const senha = String(req.body?.senha ?? '')
    if (!protocoloValido(protocolo) || !senha) throw httpError(404, ERRO_CONSULTA)
    const m = await prisma.apoManifestacao.findFirst({ where: { tenantId, protocolo } })
    if (!m) throw httpError(404, ERRO_CONSULTA)
    if (m.consultaBloqueadaAte && m.consultaBloqueadaAte > new Date()) throw httpError(429, 'Consulta temporariamente bloqueada por excesso de tentativas. Tente em alguns minutos.')
    if (!verificarSenha(senha, m.senhaHash, m.senhaSalt)) {
      const falhas = m.consultaFalhas + 1
      await prisma.apoManifestacao.update({ where: { id: m.id }, data: { consultaFalhas: falhas >= 5 ? 0 : falhas, ...(falhas >= 5 ? { consultaBloqueadaAte: new Date(Date.now() + 15 * 60_000) } : {}) } })
      throw httpError(404, ERRO_CONSULTA)
    }
    if (m.consultaFalhas > 0) await prisma.apoManifestacao.update({ where: { id: m.id }, data: { consultaFalhas: 0 } })
    return m
  }

  pub.post('/ouvidoria/:tenant/consulta', asyncHandler(async (req: Request, res: Response) => {
    const m = await autenticar(req)
    const and = await prisma.apoAndamento.findMany({ where: { tenantId: m.tenantId, refType: REF.manifestacao, refId: m.id, publico: true }, orderBy: { createdAt: 'asc' }, select: { tipo: true, texto: true, createdAt: true } })
    res.json({ protocolo: m.protocolo, tipo: m.tipo, assunto: m.assunto, status: m.status, abertaEm: m.createdAt, prazoEm: m.prazoEm, prorrogada: !!m.prorrogadoEm, respostaFinal: ['RESPONDIDA', 'ENCERRADA', 'ARQUIVADA'].includes(m.status) ? m.respostaFinal : null, podeAvaliar: m.status === 'RESPONDIDA' && m.avaliacaoNota == null, avaliacaoNota: m.avaliacaoNota, andamentos: and })
  }))

  pub.post('/ouvidoria/:tenant/avaliar', asyncHandler(async (req: Request, res: Response) => {
    const m = await autenticar(req)
    const b = parseBody(z.object({ nota: z.number().int().min(1).max(5), comentario: z.string().max(2000).optional() }), req.body)
    res.json(await avaliarEncerrar(m, b.nota, b.comentario))
  }))

  pub.post('/ouvidoria/:tenant/complementar', asyncHandler(async (req: Request, res: Response) => {
    const m = await autenticar(req)
    if (['ENCERRADA', 'ARQUIVADA'].includes(m.status)) throw httpError(409, 'Manifestação encerrada: abra uma nova.')
    const b = parseBody(z.object({ texto: z.string().min(5).max(5000) }), req.body)
    await andamento({ tenantId: m.tenantId, refType: REF.manifestacao, refId: m.id, tipo: 'COMPLEMENTO', texto: b.texto, publico: true })
    if (m.status === 'RESPONDIDA') await prisma.apoManifestacao.update({ where: { id: m.id }, data: { status: 'EM_ANALISE' } })
    await scheduleReminder({ tenantId: m.tenantId, modulo: MODULO, titulo: `Cidadão complementou a manifestação ${m.protocolo}`, dueAt: addBusinessDays(new Date(), 3), assigneeRole: 'SUPPORT', refType: REF.manifestacao, refId: m.id, dedupeKey: `apo-ouv-compl-${m.id}-${Date.now()}` })
    res.status(201).json({ ok: true })
  }))
}

// Job SLA: encaminhamentos atrasados, escalonamento em níveis e encerramento automático de respondidas sem avaliação.
export async function jobOuvidoria() {
  const agora = new Date()
  let atrasados = 0, escalonados = 0, encerradas = 0
  const encs = await prisma.apoEncaminhamento.findMany({ where: { status: { in: ['PENDENTE', 'ATRASADO'] }, prazoEm: { lt: agora } }, include: { manifestacao: true }, take: 1000 })
  for (const e of encs) {
    if (e.status === 'PENDENTE') { await prisma.apoEncaminhamento.update({ where: { id: e.id }, data: { status: 'ATRASADO' } }); atrasados++ }
    const sla = estadoSla(e.createdAt, e.prazoEm, agora)
    if (sla.nivelEscalonamento > 0) {
      const setor = await prisma.apoSetorOuvidoria.findFirst({ where: { id: e.setorId, tenantId: e.tenantId } })
      const role = sla.nivelEscalonamento >= 3 ? 'ADMIN' : sla.nivelEscalonamento === 2 ? 'RECTOR' : 'SUPPORT'
      await scheduleReminder({ tenantId: e.tenantId, modulo: MODULO, titulo: `ESCALONAMENTO nível ${sla.nivelEscalonamento}: setor ${setor?.nome ?? ''} não respondeu à Ouvidoria (${e.manifestacao.protocolo})`, dueAt: agora, assigneeRole: role, assigneeUserId: sla.nivelEscalonamento === 1 ? setor?.escalaParaUserId ?? undefined : undefined, refType: REF.encaminhamento, refId: e.id, severity: 'CRITICO', dedupeKey: `apo-ouv-esc-${e.id}-${sla.nivelEscalonamento}` })
      if (sla.nivelEscalonamento > e.manifestacao.escalonamentos) {
        await prisma.apoManifestacao.update({ where: { id: e.manifestacaoId }, data: { escalonamentos: sla.nivelEscalonamento } })
        await prisma.apoEncaminhamento.update({ where: { id: e.id }, data: { escalonadoEm: agora } })
        await andamento({ tenantId: e.tenantId, refType: REF.manifestacao, refId: e.manifestacaoId, tipo: 'ESCALONAMENTO', texto: `Escalonado ao nível ${sla.nivelEscalonamento} por atraso do setor.`, publico: false })
        escalonados++
      }
    }
  }
  // Manifestações vencidas (prazo final) sem resposta
  const venc = await prisma.apoManifestacao.findMany({ where: { status: { in: ['RECEBIDA', 'EM_ANALISE', 'ENCAMINHADA'] }, prazoEm: { lt: agora } }, take: 1000 })
  for (const m of venc) {
    const nivel = Math.max(1, estadoSla(m.createdAt, m.prazoEm, agora).nivelEscalonamento)
    await scheduleReminder({ tenantId: m.tenantId, modulo: MODULO, titulo: `PRAZO LEGAL VENCIDO: manifestação ${m.protocolo}`, dueAt: agora, assigneeRole: nivel >= 2 ? 'RECTOR' : 'SUPPORT', refType: REF.manifestacao, refId: m.id, severity: 'CRITICO', dedupeKey: `apo-ouv-venc-${m.id}-${nivel}` })
  }
  // Encerramento automático: respondida há >10 dias sem avaliação
  const resp = await prisma.apoManifestacao.findMany({ where: { status: 'RESPONDIDA', respondidaEm: { lt: addDays(agora, -10) } }, take: 1000 })
  for (const m of resp) {
    await prisma.apoManifestacao.update({ where: { id: m.id }, data: { status: 'ENCERRADA', encerradaEm: agora } })
    await completeReminders({ tenantId: m.tenantId, refType: REF.manifestacao, refId: m.id })
    await andamento({ tenantId: m.tenantId, refType: REF.manifestacao, refId: m.id, tipo: 'STATUS', texto: 'Encerrada automaticamente (sem avaliação do manifestante em 10 dias).', publico: true })
    encerradas++
  }
  return { atrasados, escalonados, vencidas: venc.length, encerradasAuto: encerradas }
}
