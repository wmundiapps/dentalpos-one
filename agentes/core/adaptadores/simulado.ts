// Provedor de IA "de mentira" para testes e demonstrações: responde por regras, sem chave e sem custo.
// Os apps trocam por um adaptador real (OpenAI, Anthropic) sem mudar o motor.

import type { LlmAdapter, RespostaLlm } from '../types.ts'

export type RoteiroSimulado = (req: {
  sistema: string
  mensagens: { papel: 'user' | 'assistant'; conteudo: string }[]
}) => RespostaLlm | string

export function llmSimulado(roteiro: RoteiroSimulado): LlmAdapter & { chamadas: number } {
  const obj = {
    chamadas: 0,
    async completar(req: Parameters<LlmAdapter['completar']>[0]): Promise<RespostaLlm> {
      obj.chamadas++
      const r = roteiro(req)
      return typeof r === 'string' ? { texto: r } : r
    },
  }
  return obj
}

export function creditosEmMemoria(inicial: number) {
  let saldo = inicial
  return {
    saldo: async () => saldo,
    debitar: async (q: number) => {
      if (saldo < q) return false
      saldo -= q
      return true
    },
    atual: () => saldo,
  }
}
