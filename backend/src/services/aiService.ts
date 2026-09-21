import { randomUUID } from 'crypto'
import { checkBalance, debit } from './creditService'

// Adaptador de IA. Provedor definido em 20/09/2026: OpenAI.
// Toda tarefa passa por aqui: confere saldo, limita tamanho, chama o modelo e debita.

export type AiTask =
  | 'TUTORIAL_META'
  | 'SUGESTAO_TEXTO'
  | 'RESUMO'
  | 'CLASSIFICACAO'
  | 'ANALISE'

// Custo em creditos por tipo de tarefa. Ajustavel sem mexer no resto do sistema.
const CUSTO: Record<AiTask, number> = {
  TUTORIAL_META: 1,
  SUGESTAO_TEXTO: 1,
  RESUMO: 1,
  CLASSIFICACAO: 1,
  ANALISE: 3,
}

const MODELO_PADRAO = process.env.OPENAI_MODEL || 'gpt-5.6-luna'
const LIMITE_ENTRADA = Number(process.env.AI_MAX_INPUT_CHARS || 12000)

export type AiResult = {
  ok: boolean
  text?: string
  reason?: string
  inputTokens?: number
  outputTokens?: number
  model?: string
}

export async function runAiTask(input: {
  clinicId: string
  tenantId: string
  actorId?: string
  task: AiTask
  system: string
  prompt: string
  maxTokens?: number
  referenceType?: string
  referenceId?: string
}): Promise<AiResult> {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim()
  if (!apiKey) return { ok: false, reason: 'IA_NAO_CONFIGURADA' }

  const units = CUSTO[input.task] ?? 1
  const saldo = await checkBalance(input.clinicId, input.tenantId, 'IA', units)
  if (!saldo.allowed) return { ok: false, reason: saldo.reason }

  const prompt = String(input.prompt || '').slice(0, LIMITE_ENTRADA)
  const teto = Math.min(Number(input.maxTokens || 0) || 800, saldo.maxPerTask || 2000)

  let data: any
  try {
    const resposta = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODELO_PADRAO,
        max_completion_tokens: teto,
        messages: [
          { role: 'system', content: input.system },
          { role: 'user', content: prompt },
        ],
      }),
    })
    const texto = await resposta.text()
    data = texto ? JSON.parse(texto) : {}
    if (!resposta.ok) {
      console.error('Falha na OpenAI:', data?.error?.message || resposta.status)
      return { ok: false, reason: 'FALHA_PROVEDOR' }
    }
  } catch (erro) {
    console.error('Erro ao chamar a OpenAI:', erro)
    return { ok: false, reason: 'FALHA_PROVEDOR' }
  }

  const text = String(data?.choices?.[0]?.message?.content || '')
  const inputTokens = Number(data?.usage?.prompt_tokens || 0)
  const outputTokens = Number(data?.usage?.completion_tokens || 0)

  // So debita depois da resposta entregue. Falha do provedor nao custa credito ao cliente.
  await debit({
    clinicId: input.clinicId,
    tenantId: input.tenantId,
    kind: 'IA',
    units,
    description: `IA: ${input.task}`,
    provider: 'OPENAI',
    model: MODELO_PADRAO,
    inputTokens,
    outputTokens,
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    actorId: input.actorId,
    idempotencyKey: randomUUID(),
  })

  return { ok: true, text, inputTokens, outputTokens, model: MODELO_PADRAO }
}