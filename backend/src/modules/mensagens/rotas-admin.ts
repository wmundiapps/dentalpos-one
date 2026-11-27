import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { normalizeText } from '../comunicacao/pure'
import { transferirAtendimento } from '../atendimento/atendimentos'
import { ATENDE, AuthenticatedRequest, MOD, Response, SUPER, asyncHandler, audit, fail, getConfig, isGestor, isSuper, nomesUsuarios, parseBody, qs, requireRole, tid, uid } from './common'
import { acessoCanal, garantirCanais, notificarUsuarios, resolverContexto, usuariosDoSetor } from './base'
import { INCLUDE_MSG, postarMensagem, serializarMensagens } from './servico'
import { buscarFaq, encerrarPedidos, inserirMensagemAuto, processarLembretesPedidos } from './auto'
import { pedidosVisiveis } from './rotas-conversas'
import { descreverHorario, horarioValido } from './logic'

// Administração do Mensageiro: resposta automática por departamento, FAQ, pedidos de "falar com uma pessoa", encaminhamento de
// atendimento, configuração/retenção, exportação restrita e trilha de auditoria.

const autoSchema = z.object({
  ativa: z.boolean(), ausenciaAtiva: z.boolean(), mensagemAusencia: z.string().max(1000).nullable(), horarioInicio: z.string().max(5), horarioFim: z.string().max(5), diasSemana: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  respostaAutomatica: z.boolean(), confiancaMinima: z.number().min(0.3).max(0.98), usarConhecimento: z.boolean(), usarFaqGeral: z.boolean(), mensagemSemResposta: z.string().max(1000).nullable(),
}).partial()

async function canalDepartamentoAdmin(req: AuthenticatedRequest) {
  const ac = await acessoCanal(req, String(req.params.id))
  if (ac.canal.tipo !== 'DEPARTAMENTO') fail(400, 'Resposta automática existe só nos canais de departamento.')
  if (!(isGestor(req) || ac.membro?.papel === 'ADMIN')) fail(403, 'Somente a gestão ou o administrador do canal configura a resposta automática.')
  return ac
}

export function mountAdmin(router: Router) {
  router.get('/meta', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    await garantirCanais(tenantId).catch(() => undefined)
    const cfg = await getConfig(tenantId)
    res.json({ usuarioId: uid(req), papel: req.user?.role, gestor: isGestor(req), gestaoSuperior: isSuper(req), podeEncaminhar: isSuper(req) || (ATENDE as string[]).includes(String(req.user?.role)), config: { retencaoDias: cfg.retencaoDias, exportacaoAtiva: cfg.exportacaoAtiva, anexoMaxKb: cfg.anexoMaxKb, lembretePedidoMin: cfg.lembretePedidoMin }, tempoReal: { modo: 'polling', resumoSegundos: 12, conversaSegundos: 4 } })
  }))
  router.post('/bootstrap', requireRole('SUPPORT', 'SECRETARY'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const criados = await garantirCanais(tid(req), uid(req))
    res.json({ ok: true, canaisCriados: criados })
  }))

  // ------------------------------------------------------------ resposta automática por departamento
  router.get('/canais/:id/auto', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const ac = await acessoCanal(req, String(req.params.id))
    if (ac.canal.tipo !== 'DEPARTAMENTO') fail(400, 'Resposta automática existe só nos canais de departamento.')
    const a = await prisma.msgAuto.upsert({ where: { canalId: ac.canal.id }, create: { tenantId: tid(req), canalId: ac.canal.id }, update: {} })
    res.json({ ...a, horarioDescrito: descreverHorario(a), podeEditar: isGestor(req) || ac.membro?.papel === 'ADMIN' })
  }))
  router.put('/canais/:id/auto', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const ac = await canalDepartamentoAdmin(req)
    const b = parseBody(autoSchema, req.body)
    const atual = await prisma.msgAuto.upsert({ where: { canalId: ac.canal.id }, create: { tenantId, canalId: ac.canal.id }, update: {} })
    const novo = { ...atual, ...b }
    const erro = horarioValido({ diasSemana: novo.diasSemana, horarioInicio: novo.horarioInicio, horarioFim: novo.horarioFim })
    if (erro) fail(400, erro)
    const a = await prisma.msgAuto.update({ where: { id: atual.id }, data: { ...b, mensagemAusencia: b.mensagemAusencia === undefined ? undefined : b.mensagemAusencia?.trim() || null, mensagemSemResposta: b.mensagemSemResposta === undefined ? undefined : b.mensagemSemResposta?.trim() || null } })
    await audit({ tenantId, userId: uid(req), modulo: MOD, acao: 'AUTO_CONFIGURADA', refType: 'MsgAuto', refId: a.id, detalhes: { ativa: a.ativa, respostaAutomatica: a.respostaAutomatica, confiancaMinima: a.confiancaMinima } })
    res.json({ ...a, horarioDescrito: descreverHorario(a) })
  }))
  /** Simulação: mostra o que a resposta automática faria com um texto, sem postar nada. */
  router.post('/canais/:id/auto/testar', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const ac = await canalDepartamentoAdmin(req)
    const b = parseBody(z.object({ texto: z.string().min(2).max(1000) }), req.body)
    const auto = await prisma.msgAuto.upsert({ where: { canalId: ac.canal.id }, create: { tenantId, canalId: ac.canal.id }, update: {} })
    const { pedePessoa } = await import('./logic')
    const { contemSensivel } = await import('../atendimento/logic')
    if (contemSensivel(b.texto)) return void res.json({ acao: 'PEDIDO_PESSOA', motivo: 'SENSIVEL', confianca: 0, resposta: null })
    if (pedePessoa(b.texto)) return void res.json({ acao: 'PEDIDO_PESSOA', motivo: 'PEDIDO_EXPLICITO', confianca: 0, resposta: null })
    const m = await buscarFaq(tenantId, ac.canal, auto, b.texto)
    const ok = !!m.faq && m.confianca >= auto.confiancaMinima
    res.json({ acao: ok ? 'FAQ' : 'PEDIDO_PESSOA', motivo: ok ? 'FAQ' : 'SEM_RESPOSTA', confianca: m.confianca, minimo: auto.confiancaMinima, resposta: ok ? m.faq!.resposta : null, fonte: m.faq?.origem ?? null, candidata: m.faq ? m.faq.pergunta : null })
  }))

  // FAQ do departamento = artigos da base de conhecimento do atendimento (AtdConhecimento) ligados ao setor
  router.get('/canais/:id/faq', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const ac = await acessoCanal(req, String(req.params.id))
    if (ac.canal.tipo !== 'DEPARTAMENTO' || !ac.canal.setorId) fail(400, 'FAQ existe só nos canais de departamento.')
    const items = await prisma.atdConhecimento.findMany({ where: { tenantId: tid(req), setorId: ac.canal.setorId, ativo: true }, orderBy: [{ usos: 'desc' }, { titulo: 'asc' }], take: 200, select: { id: true, titulo: true, pergunta: true, resposta: true, palavrasChave: true, usos: true } })
    res.json({ items, total: items.length })
  }))
  router.post('/canais/:id/faq', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const ac = await canalDepartamentoAdmin(req)
    if (!ac.canal.setorId) fail(400, 'Canal sem departamento.')
    const b = parseBody(z.object({ titulo: z.string().min(3).max(160).optional(), pergunta: z.string().min(5).max(400), resposta: z.string().min(5).max(3000), palavrasChave: z.array(z.string().min(2).max(40)).max(30).default([]) }), req.body)
    const k = await prisma.atdConhecimento.create({ data: { tenantId, categoria: 'DEPARTAMENTO', titulo: b.titulo ?? b.pergunta.slice(0, 80), pergunta: b.pergunta, resposta: b.resposta, palavrasChave: b.palavrasChave.map(normalizeText), setorId: ac.canal.setorId, publico: false } })
    await audit({ tenantId, userId: uid(req), modulo: MOD, acao: 'FAQ_DEPARTAMENTO_CRIADA', refType: 'AtdConhecimento', refId: k.id, detalhes: { canalId: ac.canal.id } })
    res.status(201).json(k)
  }))
  router.delete('/canais/:id/faq/:faqId', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const ac = await canalDepartamentoAdmin(req)
    const r = await prisma.atdConhecimento.updateMany({ where: { id: String(req.params.faqId), tenantId: tid(req), setorId: ac.canal.setorId }, data: { ativo: false } })
    if (!r.count) fail(404, 'Pergunta não encontrada neste departamento.')
    await audit({ tenantId: tid(req), userId: uid(req), modulo: MOD, acao: 'FAQ_DEPARTAMENTO_REMOVIDA', refType: 'AtdConhecimento', refId: String(req.params.faqId) })
    res.json({ ok: true })
  }))

  // ------------------------------------------------------------ pedidos de "falar com uma pessoa"
  router.get('/pedidos', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const st = qs(req.query.status) ?? 'PENDENTE'
    if (!['PENDENTE', 'ASSUMIDO', 'RESOLVIDO', 'TODOS'].includes(st)) fail(400, 'Status inválido.')
    await processarLembretesPedidos(tid(req)).catch(() => undefined)
    res.json(await pedidosVisiveis(req, st, 100))
  }))
  const acaoPedido = (acao: 'ASSUMIDO' | 'RESOLVIDO') => asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req), userId = uid(req)
    const p = await prisma.msgPedidoHumano.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!p) fail(404, 'Pedido não encontrado.')
    const vis = await pedidosVisiveis(req, 'TODOS', 200)
    if (!vis.items.some((x) => x.id === p.id)) fail(404, 'Pedido não encontrado.')
    if (p.status === 'RESOLVIDO') fail(409, 'Pedido já resolvido.')
    if (acao === 'ASSUMIDO' && p.status !== 'PENDENTE') fail(409, 'Pedido já foi assumido.')
    await encerrarPedidos(tenantId, [p.id], acao, userId)
    const nomes = await nomesUsuarios(tenantId, [userId])
    await inserirMensagemAuto(tenantId, p.canalId, { tipo: 'SISTEMA', conteudo: acao === 'ASSUMIDO' ? `${nomes[userId]?.nome ?? 'Um atendente'} assumiu o pedido para falar com uma pessoa.` : `${nomes[userId]?.nome ?? 'Um atendente'} marcou o pedido como resolvido.`, respostaAId: p.mensagemId })
    res.json({ ok: true, status: acao })
  })
  router.post('/pedidos/:id/assumir', acaoPedido('ASSUMIDO'))
  router.post('/pedidos/:id/resolver', acaoPedido('RESOLVIDO'))
  router.post('/pedidos/lembretes/executar', requireRole(...(['SUPPORT', 'SECRETARY'] as any)), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    res.json({ lembretesEnviados: await processarLembretesPedidos(tid(req), true) })
  }))

  // ------------------------------------------------------------ encaminhar atendimento ao departamento (reaproveita a transferência da Central)
  router.post('/canais/:id/encaminhar-atendimento', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req), userId = uid(req)
    const ac = await acessoCanal(req, String(req.params.id))
    const b = parseBody(z.object({ atendimentoId: z.string().min(1).max(80), setorId: z.string().max(80).optional(), userId: z.string().max(80).optional(), motivo: z.string().min(3).max(500), mensagem: z.string().max(1000).optional() }), req.body)
    const setorId = ac.canal.tipo === 'DEPARTAMENTO' ? ac.canal.setorId! : b.setorId
    if (!setorId) fail(400, 'Informe o departamento de destino (ou use o canal do departamento).')
    const a = await prisma.atdAtendimento.findFirst({ where: { id: b.atendimentoId, tenantId } })
    if (!a) fail(404, 'Atendimento não encontrado.')
    const atualizado = await transferirAtendimento(tenantId, a, { setorId, userId: b.userId, motivo: b.motivo }, userId)
    let destino = ac.canal
    if (ac.canal.tipo !== 'DEPARTAMENTO') {
      await garantirCanais(tenantId)
      const d = await prisma.msgCanal.findFirst({ where: { tenantId, tipo: 'DEPARTAMENTO', setorId } })
      if (!d) fail(409, 'O departamento de destino não tem canal no Mensageiro.')
      destino = d
    }
    const ctx = await resolverContexto(tenantId, { tipo: 'ATENDIMENTO', id: a.id }, String(req.user?.role))
    const setor = await prisma.atdSetor.findFirst({ where: { id: setorId, tenantId }, select: { nome: true } })
    const acDestino = await acessoCanal(req, destino.id)
    const r = await postarMensagem(req, acDestino, { tipo: 'ENCAMINHAMENTO', texto: `${ctx.rotulo} encaminhado para ${setor?.nome ?? 'este departamento'}. Motivo: ${b.motivo}${b.mensagem ? `\n${b.mensagem}` : ''}`, contexto: { tipo: 'ATENDIMENTO', id: a.id }, metadados: { transferencia: { de: a.setorId, para: setorId, status: atualizado.status } } })
    const dest = await usuariosDoSetor(tenantId, setorId)
    await notificarUsuarios(tenantId, dest.filter((x) => x !== userId), 'ENCAMINHAMENTO', destino, { refType: 'AtdAtendimento', refId: a.id })
    await audit({ tenantId, userId, modulo: MOD, acao: 'ATENDIMENTO_ENCAMINHADO', refType: 'AtdAtendimento', refId: a.id, detalhes: { canalId: destino.id, setorId } })
    res.json({ ok: true, canalId: destino.id, mensagem: r.mensagem, atendimento: { id: atualizado.id, numero: atualizado.numero, status: atualizado.status, setorId: atualizado.setorId } })
  }))

  // ------------------------------------------------------------ configuração, retenção, exportação, auditoria
  router.get('/config', requireRole(...(['SUPPORT', 'SECRETARY'] as any)), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const c = await getConfig(tid(req))
    res.json({ retencaoDias: c.retencaoDias, exportacaoAtiva: c.exportacaoAtiva, anexoMaxKb: c.anexoMaxKb, lembretePedidoMin: c.lembretePedidoMin, podeEditar: isSuper(req) })
  }))
  router.put('/config', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!isSuper(req)) fail(403, 'Somente a gestão superior altera a configuração do Mensageiro.')
    const tenantId = tid(req)
    const b = parseBody(z.object({ retencaoDias: z.number().int().min(30).max(3650).nullable().optional(), exportacaoAtiva: z.boolean().optional(), anexoMaxKb: z.number().int().min(64).max(4096).optional(), lembretePedidoMin: z.number().int().min(1).max(240).optional() }), req.body)
    await getConfig(tenantId)
    const c = await prisma.msgConfig.update({ where: { tenantId }, data: b })
    await audit({ tenantId, userId: uid(req), modulo: MOD, acao: 'CONFIG_ALTERADA', refType: 'MsgConfig', refId: c.id, detalhes: b })
    res.json({ retencaoDias: c.retencaoDias, exportacaoAtiva: c.exportacaoAtiva, anexoMaxKb: c.anexoMaxKb, lembretePedidoMin: c.lembretePedidoMin })
  }))

  /** Retenção: apaga mensagens (e anexos) mais antigas que o prazo configurado. Mensagens fixadas ficam. Dry-run por padrão. */
  router.post('/retencao/executar', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!isSuper(req)) fail(403, 'Somente a gestão superior executa a política de retenção.')
    const tenantId = tid(req)
    const b = parseBody(z.object({ dryRun: z.boolean().default(true), confirmar: z.boolean().optional() }), req.body ?? {})
    const cfg = await getConfig(tenantId)
    if (!cfg.retencaoDias) fail(409, 'Retenção não configurada (defina o prazo em dias).')
    if (!b.dryRun && !b.confirmar) fail(400, 'Confirme a eliminação com confirmar:true.')
    const corte = new Date(Date.now() - cfg.retencaoDias * 86_400_000)
    const where = { tenantId, createdAt: { lt: corte }, fixadaEm: null }
    const afetados = await prisma.msgMensagem.count({ where })
    const anexos = await prisma.msgAnexo.count({ where: { tenantId, mensagem: where } })
    if (!b.dryRun && afetados) await prisma.msgMensagem.deleteMany({ where })
    await audit({ tenantId, userId: uid(req), modulo: MOD, acao: b.dryRun ? 'RETENCAO_SIMULADA' : 'RETENCAO_EXECUTADA', refType: 'MsgConfig', refId: cfg.id, detalhes: { corte: corte.toISOString(), mensagens: afetados, anexos, retencaoDias: cfg.retencaoDias } })
    res.json({ dryRun: b.dryRun, corte, retencaoDias: cfg.retencaoDias, mensagens: afetados, anexos })
  }))

  /** Exportação de uma conversa de canal/grupo: só gestão superior, com justificativa, auditada. Conversas diretas nunca saem por aqui. */
  router.get('/exportar', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req), userId = uid(req)
    if (!isSuper(req)) fail(403, 'Somente a gestão superior exporta conversas.')
    const cfg = await getConfig(tenantId)
    if (!cfg.exportacaoAtiva) fail(403, 'A exportação está desativada na configuração.')
    const canalId = qs(req.query.canalId)
    const just = (qs(req.query.justificativa) ?? '').trim()
    if (!canalId) fail(400, 'Informe o canal.')
    if (just.length < 10) fail(400, 'Informe a justificativa da exportação (mínimo 10 caracteres).')
    const canal = await prisma.msgCanal.findFirst({ where: { id: canalId, tenantId } })
    if (!canal) fail(404, 'Conversa não encontrada.')
    if (canal.tipo === 'DIRETA') fail(403, 'Conversas diretas não podem ser exportadas pela gestão. O próprio participante exporta os seus dados.')
    const rows = await prisma.msgMensagem.findMany({ where: { tenantId, canalId, removidaEm: null }, orderBy: { createdAt: 'asc' }, take: 5000, include: { anexos: { select: { nome: true, mime: true, tamanho: true } } } })
    const nomes = await nomesUsuarios(tenantId, rows.map((r) => r.autorId))
    await audit({ tenantId, userId, modulo: MOD, acao: 'CONVERSA_EXPORTADA', refType: 'MsgCanal', refId: canalId, detalhes: { mensagens: rows.length, justificativa: just.slice(0, 200) } })
    res.setHeader('Cache-Control', 'private, no-store')
    res.json({ canal: { id: canal.id, nome: canal.nome, tipo: canal.tipo }, geradoEm: new Date().toISOString(), geradoPor: userId, justificativa: just, aviso: 'Exportação restrita e auditada (LGPD). Anexos não acompanham: apenas nome e tipo.', mensagens: rows.map((r) => ({ em: r.createdAt, autor: r.autorId ? nomes[r.autorId]?.nome ?? r.autorId : 'Automático', tipo: r.tipo, conteudo: r.conteudo, anexos: r.anexos })) })
  }))

  /** Direito de acesso (LGPD art. 18): o usuário exporta as mensagens que ele mesmo escreveu. */
  router.get('/meus-dados/exportar', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req), userId = uid(req)
    const rows = await prisma.msgMensagem.findMany({ where: { tenantId, autorId: userId, removidaEm: null }, orderBy: { createdAt: 'asc' }, take: 5000, include: { canal: { select: { nome: true, tipo: true } }, anexos: { select: { nome: true, tamanho: true } } } })
    await audit({ tenantId, userId, modulo: MOD, acao: 'DADOS_PROPRIOS_EXPORTADOS', detalhes: { mensagens: rows.length } })
    res.setHeader('Cache-Control', 'private, no-store')
    res.json({ geradoEm: new Date().toISOString(), mensagens: rows.map((r) => ({ em: r.createdAt, conversa: r.canal.tipo === 'DIRETA' ? 'Conversa direta' : r.canal.nome, conteudo: r.conteudo, anexos: r.anexos })) })
  }))

  router.get('/auditoria', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!isSuper(req)) fail(403, 'Somente a gestão superior consulta a auditoria do Mensageiro.')
    const limite = Math.min(200, Math.max(1, parseInt(qs(req.query.limite) ?? '50', 10) || 50))
    const acao = qs(req.query.acao)
    const rows = await prisma.eduAuditEvent.findMany({ where: { tenantId: tid(req), modulo: MOD, ...(acao ? { acao } : {}) }, orderBy: { createdAt: 'desc' }, take: limite })
    const nomes = await nomesUsuarios(tid(req), rows.map((r) => r.userId))
    res.json({ items: rows.map((r) => ({ id: r.id, acao: r.acao, em: r.createdAt, usuario: r.userId ? nomes[r.userId]?.nome ?? r.userId : null, refType: r.refType, refId: r.refId, detalhes: r.detalhes })) })
  }))
}
export { SUPER, INCLUDE_MSG, serializarMensagens }
