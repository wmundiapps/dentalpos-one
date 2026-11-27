import { Router, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId } from '../academico/middleware'
import { AiUnavailableError, callAIForText } from '../../services-ai/client'
import { requireWmundiStaff } from '../../middleware/permission'

// Central de ajuda com IA — tira dúvidas de uso do sistema para a equipe.
// Tela não identifica o modelo/fornecedor de IA por trás (nome genérico "Central de ajuda").
// Modo demonstrativo: cota mensal por instituição; acima dela, aviso amigável com a data
// da próxima atualização em vez de erro. Cada pergunta grava uma estimativa de custo
// (tokens aproximados por caracteres) para orçar a assinatura real quando o contrato fechar.
const router = Router()

const LIMITE_MENSAL = Math.max(1, Number(process.env.AJUDA_IA_LIMITE_MENSAL || 60))
// Preço aproximado (USD por 1M tokens) só para estimativa interna de custo — não é cobrança real.
const PRECO_ENTRADA_1M = Number(process.env.AJUDA_IA_PRECO_ENTRADA_1M || 3)
const PRECO_SAIDA_1M = Number(process.env.AJUDA_IA_PRECO_SAIDA_1M || 15)

function inicioMes(d = new Date()) { return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)) }
function proximaAtualizacao(d = new Date()) {
  const proximo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
  return { iso: proximo.toISOString(), texto: proximo.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' }) }
}

async function usoDoMes(tenantId: string) {
  return prisma.ajuPergunta.count({ where: { tenantId, createdAt: { gte: inicioMes() }, status: { not: 'LIMITE_ATINGIDO' } } })
}

const estimarTokens = (texto: string) => Math.ceil(texto.length / 4)

router.get('/status', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const usados = await usoDoMes(tenantId)
  const prox = proximaAtualizacao()
  res.json({ usados, limite: LIMITE_MENSAL, restantes: Math.max(0, LIMITE_MENSAL - usados), proximaAtualizacao: prox.texto, proximaAtualizacaoIso: prox.iso })
}))

router.post('/perguntar', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const userId = getUserId(req)
  const pergunta = String(req.body?.pergunta || '').trim().slice(0, 1500)
  const pagina = String(req.body?.pagina || '').trim().slice(0, 200) || null
  const modulo = String(req.body?.modulo || '').trim().slice(0, 120) || null
  if (pergunta.length < 3) return res.status(400).json({ error: 'Escreva sua pergunta.' })

  const usados = await usoDoMes(tenantId)
  const prox = proximaAtualizacao()
  if (usados >= LIMITE_MENSAL) {
    await prisma.ajuPergunta.create({ data: { tenantId, clinicId: req.user?.clinicId, userId, userName: req.user?.email, pagina, modulo, pergunta, status: 'LIMITE_ATINGIDO' } })
    return res.json({
      limite: true,
      resposta: `Neste modo demonstrativo, as ajudas da central de IA são limitadas (já usamos as ${LIMITE_MENSAL} perguntas deste mês). A memória será atualizada em ${prox.texto}, liberando novas perguntas. Até lá, use a busca do Assistente de treinamento ou fale com o suporte.`,
      proximaAtualizacao: prox.texto,
      usados, limiteMes: LIMITE_MENSAL,
    })
  }

  const system = [
    'Você é a Central de ajuda do EduMaster Pro, sistema de gestão acadêmica brasileiro.',
    'Nunca diga qual empresa, modelo ou tecnologia de IA está por trás: se perguntarem, responda apenas "sou a central de ajuda do sistema".',
    'Responda em português, de forma curta, prática e gentil, como se explicasse para alguém que nunca usou o sistema antes.',
    'Ajude com dúvidas de uso, navegação, significado de telas e termos do sistema, e dê o caminho (menu/tela) quando souber.',
    'Nunca invente valores, prazos, políticas internas da instituição ou dados de alunos/pessoas: se não souber, diga que a pessoa deve confirmar com o setor responsável ou com o suporte.',
    'Nunca peça nem repita senha, CPF, cartão ou outro dado sensível.',
    modulo ? `O usuário está na tela/área: ${modulo}.` : '',
  ].filter(Boolean).join(' ')

  try {
    const resposta = await callAIForText({ system, user: pergunta, maxTokens: 500, ctx: { tenantId, actorId: userId } })
    const tokensEntradaEst = estimarTokens(system) + estimarTokens(pergunta)
    const tokensSaidaEst = estimarTokens(resposta)
    const custoEstimadoUsd = (tokensEntradaEst / 1e6) * PRECO_ENTRADA_1M + (tokensSaidaEst / 1e6) * PRECO_SAIDA_1M
    await prisma.ajuPergunta.create({ data: { tenantId, clinicId: req.user?.clinicId, userId, userName: req.user?.email, pagina, modulo, pergunta, resposta, tokensEntradaEst, tokensSaidaEst, custoEstimadoUsd, status: 'OK' } })
    return res.json({ limite: false, resposta, usados: usados + 1, limiteMes: LIMITE_MENSAL })
  } catch (e) {
    await prisma.ajuPergunta.create({ data: { tenantId, clinicId: req.user?.clinicId, userId, userName: req.user?.email, pagina, modulo, pergunta, status: 'ERRO' } })
    if (e instanceof AiUnavailableError) {
      return res.json({ limite: true, resposta: `Neste modo demonstrativo, a central de ajuda com IA ainda não está configurada neste ambiente. A memória será atualizada em ${prox.texto}.`, proximaAtualizacao: prox.texto })
    }
    console.error('[ajuda-ia]', (e as any)?.message)
    return res.status(500).json({ error: 'Não foi possível responder agora. Tente novamente em instantes.' })
  }
}))

// Só WMundi (equipe interna): estimativa de uso para orçar a assinatura real quando o contrato fechar.
router.get('/resumo-uso', requireWmundiStaff, asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  const porInstituicao = await prisma.ajuPergunta.groupBy({
    by: ['tenantId'], where: { status: 'OK' },
    _count: { _all: true },
    _sum: { tokensEntradaEst: true, tokensSaidaEst: true, custoEstimadoUsd: true },
  })
  const desdeMes = await prisma.ajuPergunta.groupBy({
    by: ['tenantId'], where: { status: 'OK', createdAt: { gte: inicioMes() } },
    _count: { _all: true },
    _sum: { custoEstimadoUsd: true },
  })
  const mesPorTenant = new Map(desdeMes.map((m) => [m.tenantId, { perguntas: m._count._all, custoEstimadoUsd: m._sum.custoEstimadoUsd || 0 }]))
  res.json({
    limiteMensal: LIMITE_MENSAL,
    instituicoes: porInstituicao.map((p) => ({
      tenantId: p.tenantId,
      perguntasTotal: p._count._all,
      custoEstimadoUsdTotal: p._sum.custoEstimadoUsd || 0,
      esteMes: mesPorTenant.get(p.tenantId) || { perguntas: 0, custoEstimadoUsd: 0 },
    })),
  })
}))

export default router
