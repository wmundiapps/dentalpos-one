// Tipos do núcleo de agentes da WMundi. Só sintaxe "apagável" (sem enum), para rodar direto no Node 22+
// com --experimental-strip-types e também ser importado por TypeScript nos apps.

export type Canal = 'whatsapp' | 'email' | 'voz' | 'site' | 'app'

export type Vertical =
  | 'odonto'
  | 'saude'
  | 'escola'
  | 'comercio'
  | 'servicos'
  | 'mobilidade'
  | 'financeiro'
  | 'marketing'
  | 'carreira'

export type Mensagem = { de: 'cliente' | 'agente' | 'humano'; texto: string; em?: string }

export type FerramentaDef = {
  nome: string
  descricao: string
  /** Se verdadeiro, a ação não roda sozinha: vai para a fila de aprovação humana. */
  exigeAprovacao?: boolean
}

export type AgenteId = 'atendente' | 'agenda' | 'cobranca-atraso' | 'pos-atendimento' | 'resumo-diario'

export type AgenteDef = {
  id: AgenteId
  nome: string
  resumo: string
  categoria: string
  /** Instruções-base em português. O perfil do negócio e as barreiras são acrescentados pelo motor. */
  instrucoes: string
  ferramentas: FerramentaDef[]
  canais: Canal[]
  /** Agentes "ativos" escrevem para o cliente final; "interno" fala com o dono do negócio. */
  publico: 'cliente-final' | 'interno'
  /** Se envia mensagens por iniciativa própria (precisa respeitar horário e opt-out). */
  proativo: boolean
  custoCreditos: number
  exemplo: Mensagem[]
}

export type PerfilNegocio = {
  nome: string
  vertical: Vertical
  horario?: string
  endereco?: string
  servicos?: string[]
  politicas?: string
  tom?: 'formal' | 'cordial' | 'descontraido'
  /** Preços que o agente pode citar, por nome do serviço. Qualquer outro valor é bloqueado. */
  precosPermitidos?: Record<string, string>
  linkAvaliacao?: string
}

export type ChamadaFerramenta = { ferramenta: string; args: Record<string, unknown> }

export type RespostaLlm = {
  texto: string
  chamadas?: ChamadaFerramenta[]
  uso?: { entrada: number; saida: number }
}

/** Qualquer provedor de IA (OpenAI, Anthropic, outro) entra por aqui: o motor não conhece o provedor. */
export interface LlmAdapter {
  completar(req: {
    sistema: string
    mensagens: { papel: 'user' | 'assistant'; conteudo: string }[]
    maxTokens?: number
  }): Promise<RespostaLlm>
}

export type Ferramentas = Record<string, (args: Record<string, unknown>) => Promise<unknown>>

export interface Creditos {
  saldo(): Promise<number>
  debitar(quantidade: number, motivo: string): Promise<boolean>
}

export type EventoAuditoria = {
  quando: string
  agente: AgenteId
  canal: Canal
  entrada: string
  acoes: string[]
  transferirParaHumano: boolean
  motivo?: string
  creditos: number
}

export interface Auditoria {
  registrar(evento: EventoAuditoria): Promise<void>
}

export interface FilaAprovacao {
  pedir(pedido: { agente: AgenteId; ferramenta: string; args: Record<string, unknown>; motivo: string }): Promise<string>
}

export type EntradaExecucao = {
  agente: AgenteDef
  perfil: PerfilNegocio
  historico: Mensagem[]
  entrada: string
  canal: Canal
  llm: LlmAdapter
  ferramentas?: Ferramentas
  creditos?: Creditos
  auditoria?: Auditoria
  aprovacao?: FilaAprovacao
  agora?: Date
}

export type Resultado = {
  resposta: string | null
  acoes: string[]
  transferirParaHumano: boolean
  motivo?: string
  optOut: boolean
  creditosUsados: number
  aprovacoesPendentes: string[]
}
