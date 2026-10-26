import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { prisma } from '../lib/prisma'
import { runAiTask, type AiTask } from '../services/aiService'
import { getWallet } from '../services/creditService'
import { HELP_SYSTEM } from '../services/helpKnowledge'

const ctx = (req: AuthRequest) => ({ clinicId: req.user!.clinicId, tenantId: req.user!.tenantId })

const MOTIVOS: Record<string, string> = {
  IA_NAO_CONFIGURADA: 'A inteligencia artificial ainda nao foi configurada na plataforma.',
  SEM_SALDO: 'A franquia de IA do mes acabou. Compre um pacote de creditos para continuar.',
  CARTEIRA_SUSPENSA: 'O uso de IA esta suspenso nesta clinica.',
  RESPOSTA_VAZIA: 'A IA nao devolveu resposta. Nenhum credito foi cobrado. Tente de novo.',
  FALHA_PROVEDOR: 'Nao foi possivel falar com a IA agora. Tente de novo em instantes.',
}

// Saldo e franquia da clinica, para a tela mostrar antes de gastar.
export async function balance(req: AuthRequest, res: Response) {
  try {
    const c = ctx(req)
    const { wallet, plan, maxPerTask } = await getWallet(c.clinicId, c.tenantId, 'IA')
    const franquiaRestante = Math.max(0, Number(wallet.freeAllowance) - Number(wallet.freeUsed))
    return res.json({
      plano: plan,
      franquiaMensal: Number(wallet.freeAllowance),
      franquiaUsada: Number(wallet.freeUsed),
      franquiaRestante,
      saldoComprado: Number(wallet.balance),
      disponivel: franquiaRestante + Number(wallet.balance),
      tetoPorTarefa: maxPerTask,
      status: wallet.status,
    })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao consultar o saldo de IA.' })
  }
}

// Extrato de consumo, para a clinica ver onde gastou.
export async function statement(req: AuthRequest, res: Response) {
  try {
    const c = ctx(req)
    const linhas = await prisma.creditLedger.findMany({
      where: { clinicId: c.clinicId, tenantId: c.tenantId, kind: 'IA' },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, movement: true, amount: true, balanceAfter: true, description: true, createdAt: true },
    })
    return res.json(linhas)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao carregar o extrato.' })
  }
}

export async function run(req: AuthRequest, res: Response) {
  try {
    const c = ctx(req)
    const task = String(req.body?.task || '').toUpperCase() as AiTask
    const system = String(req.body?.system || 'Voce e um assistente do CompletoDonto. Responda em portugues do Brasil, de forma curta e pratica.')
    const prompt = String(req.body?.prompt || '').trim()

    if (!prompt) return res.status(400).json({ error: 'Informe o que voce precisa.' })

    const r = await runAiTask({
      clinicId: c.clinicId,
      tenantId: c.tenantId,
      actorId: req.user!.id,
      task: task || 'SUGESTAO_TEXTO',
      system,
      prompt,
      maxTokens: Number(req.body?.maxTokens || 0) || undefined,
      referenceType: req.body?.referenceType ? String(req.body.referenceType) : undefined,
      referenceId: req.body?.referenceId ? String(req.body.referenceId) : undefined,
    })

    if (!r.ok) {
      const status = r.reason === 'SEM_SALDO' ? 402 : 409
      return res.status(status).json({ error: MOTIVOS[r.reason || ''] || 'Nao foi possivel usar a IA agora.', code: r.reason })
    }

    return res.json({ texto: r.text, modelo: r.model })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao executar a tarefa de IA.' })
  }
}

// Chat de ajuda: instruções fixas no servidor; o navegador só manda a pergunta e as últimas mensagens da conversa.
const helpUse = new Map<string, number[]>()

export async function help(req: AuthRequest, res: Response) {
  try {
    const c = ctx(req)
    const message = String(req.body?.message || '').trim().slice(0, 800)
    if (!message) return res.status(400).json({ error: 'Escreva a sua dúvida.' })

    const now = Date.now()
    const recent = (helpUse.get(req.user!.id) || []).filter((t) => now - t < 3600000)
    if (recent.length >= 30) return res.status(429).json({ error: 'Muitas perguntas seguidas. Aguarde alguns minutos e tente de novo.' })
    helpUse.set(req.user!.id, [...recent, now])

    const raw = Array.isArray(req.body?.history) ? req.body.history : []
    const history = raw
      .filter((m: any) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-8)
      .map((m: any) => ({ role: m.role as 'user' | 'assistant', content: String(m.content).slice(0, 1500) }))
    const page = String(req.body?.page || '').slice(0, 80)

    const r = await runAiTask({
      clinicId: c.clinicId,
      tenantId: c.tenantId,
      actorId: req.user!.id,
      task: 'AJUDA',
      system: `${HELP_SYSTEM}${page ? `\n\nO usuário está agora na tela: ${page}.` : ''}`,
      prompt: message,
      history,
      maxTokens: 600,
    })
    if (!r.ok) {
      const status = r.reason === 'SEM_SALDO' ? 402 : 409
      return res.status(status).json({ error: MOTIVOS[r.reason || ''] || 'Não foi possível usar a ajuda agora.', code: r.reason })
    }
    return res.json({ texto: r.text })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao consultar a ajuda.' })
  }
}
