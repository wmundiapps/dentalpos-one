import { Router, Response } from 'express'
import { z } from 'zod'
import { AuthenticatedRequest, asyncHandler, requireRole } from '../academico/middleware'
import { prisma } from '../../lib/prisma'
import { mountCrud, parseBody } from '../core/crud'
import { getTenantId } from '../academico/middleware'
import { ATENDE, GESTAO_COM } from './roles'
import { BotDef, passoBot, pontuarGatilhos, rankFaq, renderNo, validarBotDef } from './pure'

const router = Router()

const defCheck = (d: any) => {
  if (d.definicao !== undefined) {
    const erros = validarBotDef(d.definicao)
    if (erros.length) throw Object.assign(new Error(`Fluxo inválido — ${erros.join('; ')}`), { status: 400 })
  }
  return d
}

router.post(
  '/bot/validar',
  requireRole(...ATENDE),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const erros = validarBotDef(req.body?.definicao)
    res.json({ valido: erros.length === 0, erros })
  }),
)

// Simulador: executa o bot SEM enviar nada nem gravar conversa (para testar fluxos/FAQ).
router.post(
  '/bot/simular',
  requireRole(...ATENDE),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(z.object({ texto: z.string().min(1), estado: z.any().optional() }), req.body)
    const fluxos = await prisma.comBotFluxo.findMany({ where: { tenantId, ativo: true }, orderBy: [{ prioridade: 'desc' }] })
    const estado = b.estado ?? {}
    if (estado.fluxoId && estado.no) {
      const f = fluxos.find((x) => x.id === estado.fluxoId)
      if (f) return res.json({ origem: 'FLUXO', fluxo: f.nome, passo: passoBot(f.definicao as unknown as BotDef, estado, b.texto) })
    }
    let melhor: { f: (typeof fluxos)[number]; s: number } | null = null
    for (const f of fluxos) {
      const s = pontuarGatilhos(f.gatilhos, b.texto)
      if (s > 0 && (!melhor || s > melhor.s)) melhor = { f, s }
    }
    if (melhor) {
      const def = melhor.f.definicao as unknown as BotDef
      return res.json({ origem: 'FLUXO', fluxo: melhor.f.nome, resposta: renderNo(def.nos[def.inicio]), estado: { fluxoId: melhor.f.id, no: def.inicio } })
    }
    const faqs = await prisma.comFaq.findMany({ where: { tenantId, ativo: true }, take: 300 })
    const rank = rankFaq(faqs, b.texto, 3)
    if (rank[0] && rank[0].score >= 1.5) return res.json({ origem: 'FAQ', resposta: rank[0].faq.resposta, candidatas: rank.map((r) => ({ pergunta: r.faq.pergunta, score: r.score })) })
    res.json({ origem: 'IA_OU_HANDOFF', observacao: 'Nenhum fluxo/FAQ casou; em produção segue para a IA (se configurada e dentro do limite) ou transfere para atendente.', candidatas: rank.map((r) => ({ pergunta: r.faq.pergunta, score: r.score })) })
  }),
)

const fluxoSchema = z.object({ nome: z.string().min(2), intencao: z.string().min(2), gatilhos: z.array(z.string()).optional(), definicao: z.any(), prioridade: z.number().int().optional(), ativo: z.boolean().optional() })
mountCrud(router, { model: 'comBotFluxo', path: '/bot/fluxos', read: ATENDE, write: GESTAO_COM, create: fluxoSchema, search: ['nome', 'intencao'], filters: ['intencao', 'ativo'], orderBy: { prioridade: 'desc' }, modulo: 'comunicacao', beforeCreate: defCheck, beforeUpdate: defCheck })

const faqSchema = z.object({ categoria: z.string().default('GERAL'), pergunta: z.string().min(5), resposta: z.string().min(3), palavrasChave: z.array(z.string()).optional(), ativo: z.boolean().optional() })
mountCrud(router, { model: 'comFaq', path: '/bot/faq', read: ATENDE, write: GESTAO_COM, create: faqSchema, search: ['pergunta', 'resposta'], filters: ['categoria', 'ativo'], orderBy: { categoria: 'asc' }, modulo: 'comunicacao' })

export default router
