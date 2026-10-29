import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { ALUNO, ATENDE, AuthenticatedRequest, GESTAO, MOD, Response, asyncHandler, assertTenant, audit, fail, pageParams, parseBody, qs, requireRole, tid, uid } from './common'
import { getIaConfig, responder } from './ia'
import { contemSensivel, normalizeText, redigirParaIa } from './logic'

const kbSchema = z.object({ categoria: z.string().min(2).max(40).default('GERAL'), titulo: z.string().min(3).max(160), pergunta: z.string().min(5).max(400), resposta: z.string().min(5).max(3000), palavrasChave: z.array(z.string().min(2).max(40)).max(30).default([]), setorId: z.string().nullish(), servicoId: z.string().nullish(), publico: z.boolean().default(true), ativo: z.boolean().optional() })

export function mountConhecimento(router: Router) {
  router.get('/conhecimento', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    const c = qs(req.query.categoria); if (c) where.categoria = c
    const a = qs(req.query.ativo); if (a) where.ativo = a === '1'
    const q = qs(req.query.q); if (q) where.OR = [{ titulo: { contains: q, mode: 'insensitive' } }, { pergunta: { contains: q, mode: 'insensitive' } }, { resposta: { contains: q, mode: 'insensitive' } }, { palavrasChave: { has: normalizeText(q) } }]
    const [items, total] = await Promise.all([prisma.atdConhecimento.findMany({ where, orderBy: [{ usos: 'desc' }, { titulo: 'asc' }], skip, take }), prisma.atdConhecimento.count({ where })])
    res.json({ items, total, page, pageSize })
  }))
  router.post('/conhecimento', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(kbSchema, req.body)
    await assertTenant(tenantId, 'atdSetor', b.setorId, 'Setor'); await assertTenant(tenantId, 'atdServico', b.servicoId, 'Serviço')
    const k = await prisma.atdConhecimento.create({ data: { tenantId, ...b, setorId: b.setorId ?? undefined, servicoId: b.servicoId ?? undefined, palavrasChave: b.palavrasChave.map(normalizeText) } })
    await audit({ tenantId, userId: uid(req), modulo: `${MOD}.ia`, acao: 'CONHECIMENTO_CRIADO', refType: 'AtdConhecimento', refId: k.id })
    res.status(201).json(k)
  }))
  router.put('/conhecimento/:id', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const k = await prisma.atdConhecimento.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!k) fail(404, 'Artigo não encontrado.')
    const b = parseBody(kbSchema.partial(), req.body)
    await assertTenant(tenantId, 'atdSetor', b.setorId, 'Setor'); await assertTenant(tenantId, 'atdServico', b.servicoId, 'Serviço')
    res.json(await prisma.atdConhecimento.update({ where: { id: k.id }, data: { ...b, setorId: b.setorId ?? undefined, servicoId: b.servicoId ?? undefined, ...(b.palavrasChave ? { palavrasChave: b.palavrasChave.map(normalizeText) } : {}) } }))
  }))
  router.delete('/conhecimento/:id', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const r = await prisma.atdConhecimento.deleteMany({ where: { id: String(req.params.id), tenantId: tid(req) } })
    if (!r.count) fail(404, 'Artigo não encontrado.')
    res.json({ ok: true })
  }))
  router.post('/conhecimento/:id/feedback', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const b = parseBody(z.object({ util: z.boolean() }), req.body)
    const r = await prisma.atdConhecimento.updateMany({ where: { id: String(req.params.id), tenantId: tid(req) }, data: b.util ? { util: { increment: 1 } } : { naoUtil: { increment: 1 } } })
    if (!r.count) fail(404, 'Artigo não encontrado.')
    res.json({ ok: true })
  }))
  // reaproveita as perguntas frequentes da Comunicação (ComFaq) sem duplicar
  router.post('/conhecimento/importar-faq', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const faqs = await prisma.comFaq.findMany({ where: { tenantId, ativo: true } })
    const existentes = new Set((await prisma.atdConhecimento.findMany({ where: { tenantId }, select: { pergunta: true } })).map((k) => normalizeText(k.pergunta)))
    let criados = 0
    for (const f of faqs) {
      if (existentes.has(normalizeText(f.pergunta))) continue
      await prisma.atdConhecimento.create({ data: { tenantId, categoria: f.categoria, titulo: f.pergunta.slice(0, 160), pergunta: f.pergunta, resposta: f.resposta, palavrasChave: f.palavrasChave.map(normalizeText) } })
      criados++
    }
    res.json({ criados, ignorados: faqs.length - criados })
  }))

  router.get('/ia/config', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    res.json({ ...(await getIaConfig(tid(req))), provedor: String(process.env.ANTHROPIC_API_KEY || '').trim() ? 'ANTHROPIC' : process.env.OPENAI_API_KEY ? 'OPENAI' : 'SIMULADO' })
  }))
  router.put('/ia/config', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    await getIaConfig(tenantId)
    const b = parseBody(z.object({ iaAtiva: z.boolean(), respostaAutomatica: z.boolean(), confiancaMinima: z.number().min(0.3).max(0.99), canaisAutomaticos: z.array(z.enum(['BALCAO', 'TELEFONE', 'WHATSAPP', 'EMAIL', 'CHAT_PORTAL', 'INSTAGRAM', 'FACEBOOK'])), enviarDadosPessoais: z.boolean(), limiteDiarioAuto: z.number().int().min(0).max(10000), baseLegal: z.string().min(5).max(300) }).partial(), req.body)
    const n = await prisma.atdIaConfig.update({ where: { tenantId }, data: b })
    await audit({ tenantId, userId: uid(req), modulo: `${MOD}.ia`, acao: 'IA_CONFIG_ATUALIZADA', detalhes: b })
    res.json(n)
  }))
  router.get('/ia/uso', requireRole(...GESTAO, 'COORDINATOR'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const dias = Math.min(90, Math.max(1, Number(qs(req.query.dias)) || 30))
    const desde = new Date(Date.now() - dias * 86_400_000)
    const [porTipo, recentes, totais] = await Promise.all([
      prisma.atdIaUso.groupBy({ by: ['tipo', 'provedor'], where: { tenantId, createdAt: { gte: desde } }, _count: true, _avg: { confianca: true } }),
      prisma.atdIaUso.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 50 }),
      prisma.atdIaUso.aggregate({ where: { tenantId, createdAt: { gte: desde } }, _count: true, _sum: { campoRedigidos: true } }),
    ])
    const bloq = await prisma.atdIaUso.count({ where: { tenantId, createdAt: { gte: desde }, bloqueadoSensivel: true } })
    const esc = await prisma.atdIaUso.count({ where: { tenantId, createdAt: { gte: desde }, escalonado: true } })
    res.json({ periodoDias: dias, total: totais._count, camposRedigidos: totais._sum.campoRedigidos ?? 0, bloqueadosPorDadoSensivel: bloq, escalonados: esc, porTipo: porTipo.map((x) => ({ tipo: x.tipo, provedor: x.provedor, qtd: x._count, confiancaMedia: x._avg.confianca })), recentes })
  }))
  router.get('/ia/lgpd', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const cfg = await getIaConfig(tid(req))
    res.json({
      baseLegal: cfg.baseLegal,
      controles: ['Identificadores (CPF, CNPJ, e-mail, telefone, cartão, RA) são substituídos por marcadores antes de qualquer envio a provedor de IA.', 'Textos com dado sensível (saúde, deficiência, menores, biometria, religião etc.) não são enviados ao provedor e são encaminhados a atendente humano.', 'O registro de uso guarda apenas hash, tamanhos e contagens — nunca o conteúdo da conversa.', 'Sem chave de IA configurada, o assistente usa somente a base de conhecimento local (modo simulado).', 'Respostas automáticas exigem confiança mínima configurável; abaixo disso há escalonamento humano.'],
      enviarDadosPessoais: cfg.enviarDadosPessoais,
    })
  }))
  router.post('/ia/testar', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ texto: z.string().min(2).max(1000) }), req.body)
    const r = await responder({ tenantId, texto: b.texto, tipo: 'RESPOSTA_AUTOMATICA', userId: uid(req) })
    res.json({ ...r, textoEnviadoAoProvedor: r.bloqueadoSensivel ? null : redigirParaIa(b.texto).texto, sensivel: contemSensivel(b.texto) })
  }))

  // ------------------------------------------------------------ portal
  router.post('/portal/assistente', requireRole(...ALUNO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ pergunta: z.string().min(3).max(500) }), req.body)
    const st = req.user?.studentId ? await prisma.student.findFirst({ where: { id: req.user.studentId, tenantId }, select: { nomeCompleto: true } }) : null
    const r = await responder({ tenantId, texto: b.pergunta, tipo: 'CONSULTA_PORTAL', nomes: st ? [st.nomeCompleto] : [], nomeSolicitante: st?.nomeCompleto, userId: uid(req) })
    const servico = r.servicoId ? await prisma.atdServico.findFirst({ where: { id: r.servicoId, tenantId, ativo: true, autoatendimento: true }, select: { id: true, nome: true } }) : null
    res.json({ resposta: r.escalonar ? null : r.resposta, confianca: r.confianca, escalonar: r.escalonar, motivo: r.bloqueadoSensivel ? r.motivo : undefined, servicoSugerido: servico, conhecimentoId: r.escalonar ? undefined : r.conhecimentoId, sugestao: r.escalonar ? 'Não encontrei uma resposta segura. Fale com um atendente pelo chat.' : undefined })
  }))
}
