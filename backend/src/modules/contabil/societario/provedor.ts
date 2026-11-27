import { gerarCnpjSimulado, protocoloSim } from '../util'

// Interface de provedor para os órgãos de registro. Só existe o provedor SIMULADO: NÃO há integração real com Receita Federal,
// Junta Comercial, SEFAZ, prefeituras, Corpo de Bombeiros ou vigilância sanitária. Para integrar de verdade, implemente
// `ProvedorRegistro` e registre em `registrarProvedorRegistro` (ver README do módulo).

export type Orgao = 'RECEITA_FEDERAL' | 'JUNTA_COMERCIAL' | 'SEFAZ_ESTADUAL' | 'PREFEITURA' | 'BOMBEIROS' | 'VIGILANCIA_SANITARIA' | 'MEIO_AMBIENTE'
export type TipoProtocolo = 'VIABILIDADE' | 'JUNTA' | 'CNPJ' | 'IE' | 'IM' | 'ALVARA_FUNCIONAMENTO' | 'ALVARA_BOMBEIROS' | 'ALVARA_VIGILANCIA' | 'ALVARA_AMBIENTAL'
export const TIPOS_PROTOCOLO: TipoProtocolo[] = ['VIABILIDADE', 'JUNTA', 'CNPJ', 'IE', 'IM', 'ALVARA_FUNCIONAMENTO', 'ALVARA_BOMBEIROS', 'ALVARA_VIGILANCIA', 'ALVARA_AMBIENTAL']
export const ORGAO_DO_TIPO: Record<TipoProtocolo, Orgao> = {
  VIABILIDADE: 'PREFEITURA', JUNTA: 'JUNTA_COMERCIAL', CNPJ: 'RECEITA_FEDERAL', IE: 'SEFAZ_ESTADUAL', IM: 'PREFEITURA',
  ALVARA_FUNCIONAMENTO: 'PREFEITURA', ALVARA_BOMBEIROS: 'BOMBEIROS', ALVARA_VIGILANCIA: 'VIGILANCIA_SANITARIA', ALVARA_AMBIENTAL: 'MEIO_AMBIENTE',
}
export const FLUXO_STATUS = ['ENVIADO', 'EM_ANALISE', 'DEFERIDO'] as const

export interface SolicitacaoProtocolo { tipo: TipoProtocolo; chave: string; nomeEmpresarial: string }
export interface RespostaProtocolo { protocolo: string; status: string; numeroEmitido?: string | null; mensagem: string }
export interface ProvedorRegistro {
  nome: string
  simulado: boolean
  abrir(s: SolicitacaoProtocolo): Promise<RespostaProtocolo>
  /** Próximo estado do protocolo (no real: consulta o órgão; no simulado: avança o fluxo). */
  avancar(atual: { tipo: TipoProtocolo; status: string; chave: string; nomeEmpresarial: string }): Promise<{ status: string; numeroEmitido?: string | null; mensagem: string }>
}

const num = (seed: string, dig: number) => { let h = 17; for (const c of seed) h = (h * 33 + c.charCodeAt(0)) >>> 0; return String(h).padStart(dig, '0').slice(-dig) }

export const provedorSimulado: ProvedorRegistro = {
  nome: 'SIMULADO',
  simulado: true,
  async abrir(s) {
    return { protocolo: protocoloSim(s.tipo.slice(0, 4), s.chave), status: 'ENVIADO', numeroEmitido: null, mensagem: 'Protocolo SIMULADO registrado. Nenhum órgão real foi acionado.' }
  },
  async avancar(a) {
    if (a.status === 'DEFERIDO' || a.status === 'INDEFERIDO') return { status: a.status, mensagem: 'Protocolo já finalizado.' }
    if (a.status === 'ENVIADO') return { status: 'EM_ANALISE', mensagem: 'Em análise (simulado).' }
    if (a.status === 'EXIGENCIA') return { status: 'EM_ANALISE', mensagem: 'Exigência cumprida (simulado); voltou para análise.' }
    // EM_ANALISE -> deferido; o nome contendo "INDEFERIR" força indeferimento nos testes/treino
    if (/indeferir/i.test(a.nomeEmpresarial)) return { status: 'INDEFERIDO', mensagem: 'Indeferido (simulado).' }
    let numero: string | null = null
    if (a.tipo === 'CNPJ') numero = gerarCnpjSimulado(a.chave)
    else if (a.tipo === 'IE') numero = `IE-SIM-${num(a.chave, 9)}`
    else if (a.tipo === 'IM') numero = `IM-SIM-${num(a.chave, 7)}`
    else if (a.tipo === 'JUNTA') numero = `NIRE-SIM-${num(a.chave, 11)}`
    else if (a.tipo.startsWith('ALVARA')) numero = `ALV-SIM-${new Date().getUTCFullYear()}-${num(a.chave + a.tipo, 6)}`
    return { status: 'DEFERIDO', numeroEmitido: numero, mensagem: numero ? `Deferido (simulado). Número fictício: ${numero}.` : 'Deferido (simulado).' }
  },
}

let registrado: ProvedorRegistro | null = null
/** Ponto de extensão: registre um provedor real (nunca grave credenciais no código — use variáveis de ambiente). */
export const registrarProvedorRegistro = (p: ProvedorRegistro | null) => { registrado = p }
export function obterProvedorRegistro(): ProvedorRegistro {
  if (registrado) return registrado
  const pedido = String(process.env.CONTABIL_PROVEDOR_REGISTRO || 'SIMULADO').toUpperCase()
  if (pedido !== 'SIMULADO') console.warn(`[contabil] provedor de registro "${pedido}" não implementado: usando SIMULADO.`)
  return provedorSimulado
}
export const provedoresRegistro = () => [{ nome: 'SIMULADO', simulado: true, descricao: 'Fluxo fictício para treino e acompanhamento interno. Não consulta nem envia nada a órgãos públicos.' }]
