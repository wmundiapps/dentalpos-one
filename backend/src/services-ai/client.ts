import { runAiTask } from '../services/aiService'

// ============================================================
// SERVIÇO DE IA COMPARTILHADO (EduMaster Pro)
// Único ponto de acesso à IA para os módulos acadêmicos.
//  1) ANTHROPIC_API_KEY definida  -> API Messages da Anthropic (fetch direto).
//  2) caso contrário              -> adaptador já existente do DentalPos One
//     (services/aiService.ts, OpenAI, com débito de créditos por clínica).
// Sem nenhuma chave configurada, lança AiUnavailableError e o módulo que
// chamou cai no fallback manual.
// ============================================================

export class AiUnavailableError extends Error {
  status = 503
  constructor(message = 'IA não configurada neste ambiente.') {
    super(message)
  }
}

export interface AiContext {
  clinicId?: string
  tenantId: string
  actorId?: string
  referenceType?: string
  referenceId?: string
}

export const AI_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5'

export function aiConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY)
}

async function callText(params: { system: string; user: string; maxTokens: number; ctx?: AiContext }): Promise<string> {
  const key = String(process.env.ANTHROPIC_API_KEY || '').trim()
  if (key) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: params.maxTokens,
        system: params.system,
        messages: [{ role: 'user', content: params.user }],
      }),
    })
    const data: any = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(`Falha na IA: ${data?.error?.message || r.status}`)
    const block = (data.content || []).find((b: any) => b.type === 'text')
    if (!block?.text) throw new Error('Resposta da IA não retornou texto.')
    return String(block.text)
  }

  if (!process.env.OPENAI_API_KEY) throw new AiUnavailableError()
  const ctx = params.ctx
  if (!ctx?.clinicId) throw new AiUnavailableError('Contexto da instituição ausente para a chamada de IA.')
  const res = await runAiTask({
    clinicId: ctx.clinicId,
    tenantId: ctx.tenantId,
    actorId: ctx.actorId,
    task: 'ANALISE',
    system: params.system,
    prompt: params.user,
    maxTokens: params.maxTokens,
    referenceType: ctx.referenceType,
    referenceId: ctx.referenceId,
  })
  if (!res.ok || !res.text) throw new AiUnavailableError(`IA indisponível: ${res.reason || 'erro desconhecido'}`)
  return res.text
}

export function extractJson(raw: string): string {
  const t = raw.trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) return fence[1].trim()
  const first = t.search(/[\[{]/)
  const last = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'))
  return first >= 0 && last > first ? t.slice(first, last + 1) : t
}

export async function callAIForJSON<T>(params: { system: string; user: string; maxTokens?: number; ctx?: AiContext }): Promise<T> {
  const raw = await callText({ system: params.system, user: params.user, maxTokens: params.maxTokens ?? 2000, ctx: params.ctx })
  const cleaned = extractJson(raw)
  try {
    return JSON.parse(cleaned) as T
  } catch {
    throw new Error(`IA retornou um JSON inválido: ${cleaned.slice(0, 300)}`)
  }
}

export async function callAIForText(params: { system: string; user: string; maxTokens?: number; ctx?: AiContext }): Promise<string> {
  return callText({ system: params.system, user: params.user, maxTokens: params.maxTokens ?? 2000, ctx: params.ctx })
}
