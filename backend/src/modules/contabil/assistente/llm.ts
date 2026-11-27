import { redigirPii } from '../util'
import type { Artigo } from './conhecimento'

// PONTO DE EXTENSÃO para LLM externo (opcional). NADA é gravado no código: tudo vem de variáveis de ambiente.
//   CONTABIL_LLM_URL      endpoint compatível com a API "chat completions" (ex.: https://<provedor>/v1/chat/completions)
//   CONTABIL_LLM_API_KEY  chave do provedor (somente no ambiente do servidor)
//   CONTABIL_LLM_MODEL    nome do modelo
//   CONTABIL_LLM_TIMEOUT_MS  (opcional, padrão 15000)
// Só é usado quando (a) as variáveis existem, (b) o tenant ativou `usarLlmExterno` e (c) a pergunta NÃO é sensível.
// O texto enviado é minimizado (CPF/CNPJ/e-mail/telefone mascarados) e a resposta final continua carregando os avisos obrigatórios.

export interface ProvedorLlm { nome: string; responder(p: { pergunta: string; contexto: string; artigos: Artigo[] }): Promise<string | null> }

let custom: ProvedorLlm | null = null
/** Permite plugar outro provedor (por código) sem alterar o motor. */
export const registrarProvedorLlm = (p: ProvedorLlm | null) => { custom = p }

export const llmConfigurado = () => !!custom || !!(String(process.env.CONTABIL_LLM_URL || '').trim() && String(process.env.CONTABIL_LLM_API_KEY || '').trim() && String(process.env.CONTABIL_LLM_MODEL || '').trim())

const SISTEMA = 'Você é um assistente contábil brasileiro. Responda em português, de forma objetiva, SOMENTE com base nos trechos fornecidos e em conhecimento geral prudente. Nunca incentive sonegação ou fraude. Se não tiver segurança, diga que é preciso consultar o contador. Não invente valores, prazos ou artigos de lei.'

export async function consultarLlm(p: { pergunta: string; contexto: string; artigos: Artigo[] }): Promise<{ texto: string; provedor: string } | null> {
  if (!llmConfigurado()) return null
  const entrada = { pergunta: redigirPii(p.pergunta).texto, contexto: redigirPii(p.contexto).texto, artigos: p.artigos }
  try {
    if (custom) { const t = await custom.responder(entrada); return t ? { texto: t, provedor: custom.nome } : null }
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), Number(process.env.CONTABIL_LLM_TIMEOUT_MS) || 15000)
    try {
      const r = await fetch(String(process.env.CONTABIL_LLM_URL), {
        method: 'POST', signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.CONTABIL_LLM_API_KEY}` },
        body: JSON.stringify({ model: process.env.CONTABIL_LLM_MODEL, temperature: 0.2, max_tokens: 700, messages: [{ role: 'system', content: SISTEMA }, { role: 'user', content: `Trechos de apoio:\n${entrada.artigos.map((a) => `# ${a.titulo}\n${a.conteudo}`).join('\n\n')}\n\nDados (minimizados):\n${entrada.contexto || '(nenhum)'}\n\nPergunta: ${entrada.pergunta}` }] }),
      })
      if (!r.ok) return null
      const j: any = await r.json()
      const t = j?.choices?.[0]?.message?.content
      return typeof t === 'string' && t.trim() ? { texto: t.trim(), provedor: 'LLM_EXTERNO' } : null
    } finally { clearTimeout(timer) }
  } catch (e) {
    console.error('[ctb2-llm]', (e as any)?.name || 'erro')   // sem logar prompt nem chave
    return null
  }
}
