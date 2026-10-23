/**
 * Acesso ao modelo de IA (API da Anthropic). Sem ANTHROPIC_API_KEY, as funções devolvem null
 * e os robôs usam as regras locais.
 */
export type LlmTool = { name: string; description: string; input_schema: Record<string, unknown> };
export type LlmMessage = { role: 'user' | 'assistant'; content: any };

type Fetch = typeof fetch;
let fetchImpl: Fetch = (...a) => fetch(...a);
export function _setLlmFetch(f: Fetch) {
  fetchImpl = f;
}

export function llmEnabled() {
  return !!process.env.ANTHROPIC_API_KEY;
}

const model = () => process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5';

export async function llmCall(system: string, messages: LlmMessage[], tools: LlmTool[] = [], maxTokens = 700) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const r = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: model(), max_tokens: maxTokens, system, messages, ...(tools.length ? { tools } : {}) }),
  });
  if (!r.ok) throw new Error(`IA ${r.status}: ${await r.text().catch(() => '')}`);
  return (await r.json()) as { content: any[]; stop_reason: string };
}

export async function llmText(system: string, user: string, maxTokens = 300) {
  const r = await llmCall(system, [{ role: 'user', content: user }], [], maxTokens);
  if (!r) return null;
  return r.content.filter((c) => c.type === 'text').map((c) => c.text).join('').trim();
}
