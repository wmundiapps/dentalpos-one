import { Router } from 'express'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, GESTAO, MOD, Response, asyncHandler, audit, fail, isGestor, isSuper, nomesUsuarios, parseBody, qs, requireRole, tid, uid } from './common'
import { acessoCanal, buscarContexto, canalAberto, podeVincular, contarNaoLidas, garantirCanais, garantirMembro, resolverContexto, sincronizarMembrosDoSetor, sincronizarUsuario } from './base'
import { INCLUDE_MSG, listarConversas, postarMensagem, serializarMensagens } from './servico'
import { processarLembretesPedidos } from './auto'
import { TIPOS_CONTEXTO, chaveDireta, limparTexto, trecho } from './logic'

// Conversas (canais de departamento, grupos, diretas), mensagens, busca, diretório de pessoas e resumo para o alerta.

const ctxSchema = z.object({ tipo: z.enum(TIPOS_CONTEXTO), id: z.string().min(1).max(80) })
const anexoSchema = z.object({ nome: z.string().min(1).max(200), mime: z.string().max(120).optional(), dataUrl: z.string().max(4_500_000).optional(), url: z.string().url().max(2000).optional() })
const mensagemSchema = z.object({
  texto: z.string().max(5000).optional(), anexos: z.array(anexoSchema).max(5).optional(), respostaAId: z.string().max(80).optional(),
  mencoesUsuarios: z.array(z.string().max(80)).max(30).optional(), mencoesSetores: z.array(z.string().max(80)).max(10).optional(), contexto: ctxSchema.optional(),
})

// limite simples de envio por usuário (anti-flood): 90 mensagens por minuto
const janela = new Map<string, number[]>()
function limitar(userId: string) {
  const agora = Date.now()
  const l = (janela.get(userId) ?? []).filter((t) => agora - t < 60_000)
  if (l.length >= 90) fail(429, 'Muitas mensagens em pouco tempo. Aguarde um instante.')
  l.push(agora); janela.set(userId, l)
}

export function mountConversas(router: Router) {
  // ------------------------------------------------------------ resumo (polling leve: contador, alerta e pedidos)
  router.get('/resumo', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req), userId = uid(req)
    await garantirCanais(tenantId).catch(() => undefined)
    await sincronizarUsuario(tenantId, userId)
    await processarLembretesPedidos(tenantId).catch(() => undefined)
    const [cont, meus] = await Promise.all([contarNaoLidas(tenantId, userId), prisma.msgMembro.findMany({ where: { tenantId, userId }, select: { canalId: true, silenciado: true, canal: { select: { arquivado: true } } } })])
    const ativos = new Map(meus.filter((m) => !m.canal.arquivado).map((m) => [m.canalId, m]))
    const validos = cont.filter((c) => ativos.has(c.canalId))
    const naoSilenciados = validos.filter((c) => !ativos.get(c.canalId)!.silenciado)
    const pedidos = await pedidosVisiveis(req, 'PENDENTE', 20)
    res.json({
      naoLidas: naoSilenciados.reduce((a, c) => a + c.naoLidas, 0), mencoes: validos.reduce((a, c) => a + c.mencoes, 0), conversasComNaoLidas: naoSilenciados.length,
      pedidos: { total: pedidos.total, itens: pedidos.items }, agora: new Date().toISOString(),
    })
  }))

  router.get('/canais', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    await garantirCanais(tid(req)).catch(() => undefined)
    const escopo = (['meus', 'diretorio', 'todos'] as const).find((e) => e === qs(req.query.escopo)) ?? 'meus'
    const tipo = qs(req.query.tipo)
    if (tipo && !['DEPARTAMENTO', 'GRUPO', 'DIRETA'].includes(tipo)) fail(400, 'Tipo inválido.')
    const ct = qs(req.query.contextoTipo)
    if (ct && !(TIPOS_CONTEXTO as readonly string[]).includes(ct)) fail(400, 'Tipo de contexto inválido.')
    const itens = await listarConversas(req, escopo, { q: qs(req.query.q), tipo, contextoTipo: ct, contextoId: qs(req.query.contextoId), arquivados: qs(req.query.arquivados) === '1' })
    res.json({ items: itens, total: itens.length })
  }))

  router.post('/canais', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req), userId = uid(req)
    const b = parseBody(z.object({
      tipo: z.enum(['DEPARTAMENTO', 'GRUPO', 'DIRETA']), nome: z.string().min(2).max(80).optional(), descricao: z.string().max(300).optional(), userId: z.string().max(80).optional(), membros: z.array(z.string().max(80)).max(100).optional(),
      setorId: z.string().max(80).optional(), restrito: z.boolean().optional(), contexto: ctxSchema.optional(), mensagem: z.string().max(5000).optional(),
    }), req.body)
    const ctx = b.contexto ? await resolverContexto(tenantId, b.contexto, String(req.user?.role)) : null
    const ctxData = ctx ? { contextoTipo: ctx.tipo, contextoId: ctx.id, contextoRotulo: ctx.rotulo, contextoLink: ctx.link } : {}

    if (b.tipo === 'DIRETA') {
      if (!b.userId) fail(400, 'Informe o usuário da conversa direta.')
      if (b.userId === userId) fail(400, 'Escolha outra pessoa para conversar.')
      const outro = await prisma.user.findFirst({ where: { id: b.userId, tenantId, isActive: true, role: { not: 'STUDENT' as any } }, select: { id: true } })
      if (!outro) fail(400, 'Usuário não encontrado nesta instituição.')
      const chave = chaveDireta(userId, b.userId)
      let canal = await prisma.msgCanal.findFirst({ where: { tenantId, chaveDireta: chave } })
      let novo = false
      if (!canal) {
        canal = await prisma.msgCanal.create({ data: { tenantId, tipo: 'DIRETA', nome: 'Conversa direta', chaveDireta: chave, restrito: true, criadoPorId: userId, ...ctxData } })
        await prisma.msgMembro.createMany({ data: [userId, b.userId].map((u) => ({ tenantId, canalId: canal!.id, userId: u, origem: 'MANUAL' })), skipDuplicates: true })
        novo = true
      } else await garantirMembro(tenantId, canal.id, userId, 'MANUAL')
      if (ctx && !canal.contextoTipo) canal = await prisma.msgCanal.update({ where: { id: canal.id }, data: ctxData })
      return void res.status(novo ? 201 : 200).json({ id: canal.id, tipo: canal.tipo, novo })
    }

    if (b.tipo === 'DEPARTAMENTO') {
      if (!isGestor(req)) fail(403, 'Somente a gestão cria canais de departamento.')
      if (!b.setorId) fail(400, 'Informe o departamento (setor do atendimento).')
      const setor = await prisma.atdSetor.findFirst({ where: { id: b.setorId, tenantId, ativo: true } })
      if (!setor) fail(400, 'Departamento não encontrado nesta instituição.')
      if (await prisma.msgCanal.count({ where: { tenantId, tipo: 'DEPARTAMENTO', setorId: setor.id } })) fail(409, 'Este departamento já tem um canal.')
      const canal = await prisma.msgCanal.create({ data: { tenantId, tipo: 'DEPARTAMENTO', nome: b.nome ?? setor.nome, descricao: b.descricao ?? setor.descricao ?? undefined, setorId: setor.id, restrito: !!b.restrito, criadoPorId: userId } })
      await prisma.msgAuto.create({ data: { tenantId, canalId: canal.id } })
      await sincronizarMembrosDoSetor(tenantId, canal.id)
      await audit({ tenantId, userId, modulo: MOD, acao: 'CANAL_CRIADO', refType: 'MsgCanal', refId: canal.id, detalhes: { tipo: 'DEPARTAMENTO', setorId: setor.id } })
      return void res.status(201).json({ id: canal.id, tipo: canal.tipo })
    }

    // GRUPO
    if (!b.nome) fail(400, 'Informe o nome do grupo.')
    const restrito = b.restrito ?? true
    if (!restrito && !isGestor(req)) fail(403, 'Somente a gestão cria grupos abertos a toda a equipe.')
    const ids = [...new Set((b.membros ?? []).filter((m) => m !== userId))]
    const validos = ids.length ? await prisma.user.findMany({ where: { tenantId, id: { in: ids }, isActive: true, role: { not: 'STUDENT' as any } }, select: { id: true } }) : []
    if (validos.length !== ids.length) fail(400, 'Algum participante não foi encontrado nesta instituição.')
    const canal = await prisma.msgCanal.create({ data: { tenantId, tipo: 'GRUPO', nome: b.nome, descricao: b.descricao, restrito, criadoPorId: userId, ...ctxData } })
    await prisma.msgMembro.createMany({ data: [{ tenantId, canalId: canal.id, userId, papel: 'ADMIN', origem: 'MANUAL' }, ...ids.map((u) => ({ tenantId, canalId: canal.id, userId: u, origem: 'MANUAL' }))], skipDuplicates: true })
    await audit({ tenantId, userId, modulo: MOD, acao: 'CANAL_CRIADO', refType: 'MsgCanal', refId: canal.id, detalhes: { tipo: 'GRUPO', membros: ids.length + 1, restrito } })
    if (b.mensagem) { const ac = await acessoCanal(req, canal.id); await postarMensagem(req, ac, { texto: b.mensagem }) }
    res.status(201).json({ id: canal.id, tipo: canal.tipo })
  }))

  router.get('/canais/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req), userId = uid(req)
    const ac = await acessoCanal(req, String(req.params.id))
    const c = ac.canal
    if (c.tipo === 'DEPARTAMENTO') await sincronizarMembrosDoSetor(tenantId, c.id)
    const [membros, setor, auto, fixadas] = await Promise.all([
      prisma.msgMembro.findMany({ where: { canalId: c.id }, orderBy: { createdAt: 'asc' }, take: 300 }),
      c.setorId ? prisma.atdSetor.findFirst({ where: { id: c.setorId, tenantId }, select: { id: true, codigo: true, nome: true } }) : null,
      c.tipo === 'DEPARTAMENTO' ? prisma.msgAuto.findUnique({ where: { canalId: c.id } }) : null,
      prisma.msgMensagem.count({ where: { canalId: c.id, fixadaEm: { not: null }, removidaEm: null } }),
    ])
    const nomes = await nomesUsuarios(tenantId, membros.map((m) => m.userId))
    const outro = c.tipo === 'DIRETA' ? membros.find((m) => m.userId !== userId) : null
    const podeConfigurar = isGestor(req) || ac.membro?.papel === 'ADMIN'
    res.json({
      id: c.id, tipo: c.tipo, nome: c.tipo === 'DIRETA' ? (outro ? nomes[outro.userId]?.nome ?? 'Conversa direta' : 'Conversa direta') : c.nome, descricao: c.descricao, restrito: c.restrito, arquivado: c.arquivado, setor,
      contexto: c.contextoTipo ? { tipo: c.contextoTipo, id: c.contextoId, rotulo: c.contextoRotulo, link: c.contextoLink } : null,
      participante: !!ac.membro, fixado: !!ac.membro?.fixado, silenciado: !!ac.membro?.silenciado, podeConfigurar, fixadas, versao: c.updatedAt,
      membros: membros.map((m) => ({ userId: m.userId, nome: nomes[m.userId]?.nome ?? 'Usuário', role: nomes[m.userId]?.role, papel: m.papel, origem: m.origem })),
      respostaAutomatica: auto ? { ativa: auto.ativa, ausenciaAtiva: auto.ausenciaAtiva } : null,
    })
  }))

  router.patch('/canais/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const ac = await acessoCanal(req, String(req.params.id))
    if (ac.canal.tipo === 'DIRETA') fail(400, 'Conversa direta não pode ser alterada.')
    if (!(isGestor(req) || ac.membro?.papel === 'ADMIN')) fail(403, 'Somente administradores do canal podem alterá-lo.')
    const b = parseBody(z.object({ nome: z.string().min(2).max(80).optional(), descricao: z.string().max(300).nullable().optional(), restrito: z.boolean().optional(), arquivado: z.boolean().optional() }), req.body)
    if (b.restrito === false && !isGestor(req)) fail(403, 'Somente a gestão abre um canal a toda a equipe.')
    const n = await prisma.msgCanal.update({ where: { id: ac.canal.id }, data: { ...(b.nome ? { nome: b.nome } : {}), ...(b.descricao !== undefined ? { descricao: b.descricao } : {}), ...(b.restrito !== undefined ? { restrito: b.restrito } : {}), ...(b.arquivado !== undefined ? { arquivado: b.arquivado } : {}) } })
    await audit({ tenantId, userId: uid(req), modulo: MOD, acao: 'CANAL_ALTERADO', refType: 'MsgCanal', refId: n.id, detalhes: b })
    res.json({ id: n.id, nome: n.nome, restrito: n.restrito, arquivado: n.arquivado })
  }))

  router.put('/canais/:id/contexto', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const ac = await acessoCanal(req, String(req.params.id), { exigirMembro: true })
    if (ac.canal.tipo === 'DEPARTAMENTO') fail(400, 'Canal de departamento não é vinculado a um registro: vincule a mensagem.')
    const b = parseBody(z.object({ contexto: ctxSchema.nullable() }), req.body)
    const ctx = b.contexto ? await resolverContexto(tenantId, b.contexto, String(req.user?.role)) : null
    await prisma.msgCanal.update({ where: { id: ac.canal.id }, data: { contextoTipo: ctx?.tipo ?? null, contextoId: ctx?.id ?? null, contextoRotulo: ctx?.rotulo ?? null, contextoLink: ctx?.link ?? null } })
    await audit({ tenantId, userId: uid(req), modulo: MOD, acao: ctx ? 'CONTEXTO_VINCULADO' : 'CONTEXTO_REMOVIDO', refType: 'MsgCanal', refId: ac.canal.id, detalhes: ctx ? { tipo: ctx.tipo, id: ctx.id } : undefined })
    res.json({ ok: true, contexto: ctx })
  }))

  router.post('/canais/:id/entrar', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const ac = await acessoCanal(req, String(req.params.id))
    if (!canalAberto(ac.canal)) fail(403, 'Conversa privada.')
    await garantirMembro(tid(req), ac.canal.id, uid(req), 'ENTROU')
    res.json({ ok: true })
  }))

  router.post('/canais/:id/sair', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const ac = await acessoCanal(req, String(req.params.id), { exigirMembro: true })
    if (ac.canal.tipo === 'DIRETA') fail(400, 'Conversa direta não tem saída: arquive-a ou silencie.')
    if (ac.membro!.origem === 'SETOR') fail(400, 'Integrantes do departamento acompanham o setor. Silencie o canal se preferir.')
    await prisma.msgMembro.delete({ where: { id: ac.membro!.id } })
    res.json({ ok: true })
  }))

  router.post('/canais/:id/membros', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const ac = await acessoCanal(req, String(req.params.id))
    if (ac.canal.tipo === 'DIRETA') fail(400, 'Conversa direta tem só duas pessoas.')
    if (!(isGestor(req) || ac.membro?.papel === 'ADMIN')) fail(403, 'Somente administradores do canal adicionam participantes.')
    const b = parseBody(z.object({ userIds: z.array(z.string().max(80)).min(1).max(100), papel: z.enum(['ADMIN', 'MEMBRO']).optional() }), req.body)
    const ids = [...new Set(b.userIds)]
    const validos = await prisma.user.findMany({ where: { tenantId, id: { in: ids }, isActive: true, role: { not: 'STUDENT' as any } }, select: { id: true } })
    if (validos.length !== ids.length) fail(400, 'Algum participante não foi encontrado nesta instituição.')
    for (const u of ids) {
      const ex = await prisma.msgMembro.findUnique({ where: { canalId_userId: { canalId: ac.canal.id, userId: u } } })
      if (ex) { if (b.papel && ex.papel !== b.papel) await prisma.msgMembro.update({ where: { id: ex.id }, data: { papel: b.papel } }) }
      else await prisma.msgMembro.create({ data: { tenantId, canalId: ac.canal.id, userId: u, papel: b.papel ?? 'MEMBRO', origem: 'MANUAL' } })
    }
    await audit({ tenantId, userId: uid(req), modulo: MOD, acao: 'MEMBROS_ADICIONADOS', refType: 'MsgCanal', refId: ac.canal.id, detalhes: { quantidade: ids.length, papel: b.papel } })
    res.json({ ok: true, adicionados: ids.length })
  }))

  router.delete('/canais/:id/membros/:userId', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const ac = await acessoCanal(req, String(req.params.id))
    if (ac.canal.tipo === 'DIRETA') fail(400, 'Conversa direta tem só duas pessoas.')
    if (!(isGestor(req) || ac.membro?.papel === 'ADMIN')) fail(403, 'Somente administradores do canal removem participantes.')
    const alvo = await prisma.msgMembro.findUnique({ where: { canalId_userId: { canalId: ac.canal.id, userId: String(req.params.userId) } } })
    if (!alvo) fail(404, 'Participante não encontrado.')
    if (alvo.origem === 'SETOR') fail(400, 'Integrante do setor: altere os membros do departamento na Central de Atendimento.')
    await prisma.msgMembro.delete({ where: { id: alvo.id } })
    await audit({ tenantId, userId: uid(req), modulo: MOD, acao: 'MEMBRO_REMOVIDO', refType: 'MsgCanal', refId: ac.canal.id, detalhes: { userId: alvo.userId } })
    res.json({ ok: true })
  }))

  router.patch('/canais/:id/preferencias', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const ac = await acessoCanal(req, String(req.params.id), { exigirMembro: true })
    const b = parseBody(z.object({ fixado: z.boolean().optional(), silenciado: z.boolean().optional() }), req.body)
    const m = await prisma.msgMembro.update({ where: { id: ac.membro!.id }, data: b })
    res.json({ fixado: m.fixado, silenciado: m.silenciado })
  }))

  router.post('/canais/:id/lido', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const ac = await acessoCanal(req, String(req.params.id), { exigirMembro: true })
    await prisma.msgMembro.update({ where: { id: ac.membro!.id }, data: { ultimaLeituraEm: new Date() } })
    res.json({ ok: true })
  }))

  // ------------------------------------------------------------ mensagens
  router.get('/canais/:id/mensagens', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req), userId = uid(req)
    const ac = await acessoCanal(req, String(req.params.id))
    const limite = Math.min(100, Math.max(1, parseInt(qs(req.query.limite) ?? '50', 10) || 50))
    const antes = qs(req.query.antes)
    const so = qs(req.query.fixadas) === '1'
    if (antes && isNaN(new Date(antes).getTime())) fail(400, 'Parâmetro "antes" inválido.')
    const rows = await prisma.msgMensagem.findMany({ where: { tenantId, canalId: ac.canal.id, ...(antes ? { createdAt: { lt: new Date(antes) } } : {}), ...(so ? { fixadaEm: { not: null }, removidaEm: null } : {}) }, orderBy: { createdAt: 'desc' }, take: limite + 1, include: INCLUDE_MSG })
    const temMais = rows.length > limite
    const itens = await serializarMensagens(tenantId, userId, ac.canal.id, rows.slice(0, limite).reverse())
    res.json({ items: itens, temMais, versao: ac.canal.updatedAt, naoLidasAte: ac.membro?.ultimaLeituraEm ?? null })
  }))

  router.post('/canais/:id/mensagens', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    limitar(uid(req))
    const ac = await acessoCanal(req, String(req.params.id))
    const b = parseBody(mensagemSchema, req.body)
    const r = await postarMensagem(req, ac, b)
    res.status(201).json(r)
  }))

  router.patch('/mensagens/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req), userId = uid(req)
    const m = await prisma.msgMensagem.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!m) fail(404, 'Mensagem não encontrada.')
    await acessoCanal(req, m.canalId)
    if (m.autorId !== userId) fail(403, 'Só o autor edita a mensagem.')
    if (m.removidaEm) fail(409, 'Mensagem removida.')
    if (m.tipo !== 'TEXTO') fail(400, 'Esta mensagem não pode ser editada.')
    if (Date.now() - m.createdAt.getTime() > 24 * 3_600_000) fail(409, 'Prazo de edição (24 horas) encerrado.')
    const b = parseBody(z.object({ texto: z.string().min(1).max(5000) }), req.body)
    const texto = limparTexto(b.texto)
    if (!texto) fail(400, 'Texto vazio.')
    await prisma.msgMensagem.update({ where: { id: m.id }, data: { conteudo: texto, editadaEm: new Date() } })
    await prisma.msgCanal.update({ where: { id: m.canalId }, data: { updatedAt: new Date() } })
    res.json({ ok: true })
  }))

  router.delete('/mensagens/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req), userId = uid(req)
    const m = await prisma.msgMensagem.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!m) fail(404, 'Mensagem não encontrada.')
    const ac = await acessoCanal(req, m.canalId)
    const moderador = ac.canal.tipo !== 'DIRETA' && ((isGestor(req) && canalAberto(ac.canal)) || ac.membro?.papel === 'ADMIN')
    if (m.autorId !== userId && !moderador) fail(403, 'Só o autor ou um administrador do canal remove a mensagem.')
    if (m.removidaEm) return void res.json({ ok: true })
    await prisma.msgAnexo.deleteMany({ where: { tenantId, mensagemId: m.id } })
    await prisma.msgMensagem.update({ where: { id: m.id }, data: { removidaEm: new Date(), removidaPorId: userId, conteudo: '', fixadaEm: null, fixadaPorId: null, metadados: Prisma.DbNull } })
    await prisma.msgCanal.update({ where: { id: m.canalId }, data: { updatedAt: new Date() } })
    await audit({ tenantId, userId, modulo: MOD, acao: m.autorId === userId ? 'MENSAGEM_REMOVIDA' : 'MENSAGEM_MODERADA', refType: 'MsgMensagem', refId: m.id, detalhes: { canalId: m.canalId } })
    res.json({ ok: true })
  }))

  const fixar = (fixa: boolean) => asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const m = await prisma.msgMensagem.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!m) fail(404, 'Mensagem não encontrada.')
    await acessoCanal(req, m.canalId, { exigirMembro: true })
    if (m.removidaEm) fail(409, 'Mensagem removida.')
    await prisma.msgMensagem.update({ where: { id: m.id }, data: fixa ? { fixadaEm: new Date(), fixadaPorId: uid(req) } : { fixadaEm: null, fixadaPorId: null } })
    await prisma.msgCanal.update({ where: { id: m.canalId }, data: { updatedAt: new Date() } })
    await audit({ tenantId, userId: uid(req), modulo: MOD, acao: fixa ? 'MENSAGEM_FIXADA' : 'MENSAGEM_DESAFIXADA', refType: 'MsgMensagem', refId: m.id })
    res.json({ ok: true })
  })
  router.post('/mensagens/:id/fixar', fixar(true))
  router.delete('/mensagens/:id/fixar', fixar(false))

  router.get('/anexos/:id/download', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const a = await prisma.msgAnexo.findFirst({ where: { id: String(req.params.id), tenantId }, include: { mensagem: { select: { canalId: true, removidaEm: true } } } })
    if (!a || a.mensagem.removidaEm) fail(404, 'Anexo não encontrado.')
    await acessoCanal(req, a.mensagem.canalId)
    await audit({ tenantId, userId: uid(req), modulo: MOD, acao: 'ANEXO_BAIXADO', refType: 'MsgAnexo', refId: a.id, detalhes: { canalId: a.mensagem.canalId } })
    if (!a.dataUrl) return void res.json({ url: a.url })
    const i = a.dataUrl.indexOf(',')
    const buf = Buffer.from(a.dataUrl.slice(i + 1), 'base64')
    const mime = /^[\w.+-]+\/[\w.+-]+$/.test(a.mime ?? '') ? a.mime! : 'application/octet-stream'
    res.setHeader('Content-Type', mime)
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(a.nome)}`)
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Cache-Control', 'private, no-store')
    res.send(buf)
  }))

  // ------------------------------------------------------------ busca e diretório
  router.get('/busca', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req), userId = uid(req)
    const q = (qs(req.query.q) ?? '').trim()
    if (q.length < 2) fail(400, 'Digite ao menos 2 caracteres para buscar.')
    const canalId = qs(req.query.canalId)
    if (canalId) await acessoCanal(req, canalId)
    const meus = await prisma.msgMembro.findMany({ where: { tenantId, userId }, select: { canalId: true } })
    const rows = await prisma.msgMensagem.findMany({
      where: { tenantId, removidaEm: null, conteudo: { contains: q, mode: 'insensitive' }, ...(canalId ? { canalId } : { canal: { OR: [{ id: { in: meus.map((m) => m.canalId) } }, { tipo: { in: ['DEPARTAMENTO', 'GRUPO'] }, restrito: false }] } }) },
      orderBy: { createdAt: 'desc' }, take: 40, include: { canal: { select: { id: true, nome: true, tipo: true } } },
    })
    const nomes = await nomesUsuarios(tenantId, rows.map((r) => r.autorId))
    res.json({ items: rows.map((r) => ({ id: r.id, canalId: r.canalId, canalNome: r.canal.tipo === 'DIRETA' ? 'Conversa direta' : r.canal.nome, canalTipo: r.canal.tipo, autor: r.autorId ? nomes[r.autorId]?.nome ?? null : 'Automático', trecho: trecho(r.conteudo, q), createdAt: r.createdAt })), total: rows.length })
  }))

  router.get('/usuarios', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req), userId = uid(req)
    const q = (qs(req.query.q) ?? '').trim()
    const us = await prisma.user.findMany({
      where: { tenantId, isActive: true, id: { not: userId }, role: { not: 'STUDENT' as any }, ...(q ? { OR: [{ firstName: { contains: q, mode: 'insensitive' } }, { lastName: { contains: q, mode: 'insensitive' } }] } : {}) },
      select: { id: true, firstName: true, lastName: true, role: true }, orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }], take: 60,
    })
    const ms = await prisma.atdSetorMembro.findMany({ where: { tenantId, userId: { in: us.map((u) => u.id) }, ativo: true }, include: { setor: { select: { codigo: true, nome: true } } } })
    res.json({ items: us.map((u) => ({ id: u.id, nome: `${u.firstName} ${u.lastName}`.trim(), role: String(u.role), departamentos: ms.filter((m) => m.userId === u.id).map((m) => ({ codigo: m.setor.codigo, nome: m.setor.nome })) })) })
  }))

  router.get('/contexto/buscar', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tipo = qs(req.query.tipo)
    if (!tipo || !(TIPOS_CONTEXTO as readonly string[]).includes(tipo)) fail(400, 'Tipo de contexto inválido.')
    if (!podeVincular(String(req.user?.role))) fail(403, 'Seu perfil não vincula registros do sistema a conversas.')
    res.json({ items: await buscarContexto(tid(req), tipo as any, (qs(req.query.q) ?? '').trim().slice(0, 60)) })
  }))

  router.get('/setores', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    await garantirCanais(tid(req)).catch(() => undefined)
    const s = await prisma.atdSetor.findMany({ where: { tenantId: tid(req), ativo: true }, select: { id: true, codigo: true, nome: true }, orderBy: { nome: 'asc' } })
    const canais = await prisma.msgCanal.findMany({ where: { tenantId: tid(req), tipo: 'DEPARTAMENTO', setorId: { in: s.map((x) => x.id) } }, select: { id: true, setorId: true } })
    res.json({ items: s.map((x) => ({ ...x, canalId: canais.find((c) => c.setorId === x.id)?.id ?? null })) })
  }))
}

/** Pedidos de "falar com uma pessoa" que o usuário pode ver: gestão vê todos; os demais, os dos canais de que participam. */
export async function pedidosVisiveis(req: AuthenticatedRequest, status: string | undefined, take = 50) {
  const tenantId = tid(req), userId = uid(req)
  let canalFiltro: any = {}
  if (!isGestor(req)) {
    const meus = await prisma.msgMembro.findMany({ where: { tenantId, userId, canal: { tipo: 'DEPARTAMENTO' }, OR: [{ origem: 'SETOR' }, { papel: 'ADMIN' }] }, select: { canalId: true } })
    canalFiltro = { canalId: { in: meus.map((m) => m.canalId) } }
  }
  const where = { tenantId, ...canalFiltro, ...(status && status !== 'TODOS' ? { status } : {}) }
  const [rows, total] = await Promise.all([prisma.msgPedidoHumano.findMany({ where, orderBy: { createdAt: 'desc' }, take }), prisma.msgPedidoHumano.count({ where })])
  const canais = await prisma.msgCanal.findMany({ where: { tenantId, id: { in: rows.map((r) => r.canalId) } }, select: { id: true, nome: true } })
  const nomes = await nomesUsuarios(tenantId, rows.flatMap((r) => [r.solicitanteId, r.assumidoPorId]))
  return {
    total,
    items: rows.map((r) => ({
      id: r.id, canalId: r.canalId, canalNome: canais.find((c) => c.id === r.canalId)?.nome ?? '—', motivo: r.motivo, status: r.status, confianca: r.confianca, createdAt: r.createdAt, lembretes: r.lembretes,
      solicitante: { id: r.solicitanteId, nome: nomes[r.solicitanteId]?.nome ?? 'Usuário' }, assumidoPor: r.assumidoPorId ? nomes[r.assumidoPorId]?.nome ?? null : null, assumidoEm: r.assumidoEm, resolvidoEm: r.resolvidoEm,
    })),
  }
}
export { GESTAO, isSuper, requireRole }
