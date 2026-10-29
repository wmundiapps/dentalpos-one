import { createHash } from 'crypto'
import { httpError } from './common'
import { RetornoItem, montarRetornoCnabSimulado } from './cnab'

// ============================================================
// Provedor bancário: interface de integração com o banco (API/host-to-host).
// Só existe a implementação SIMULADA (sem credenciais reais, sem rede). Para um banco real,
// implemente `ProvedorBancario` (OAuth/mTLS, certificado ICP-Brasil, homologação) e registre com `registrarProvedor`.
// ============================================================

export interface ItemEnvio { idPagamento: string; valor: number; favorecidoNome: string; formaPagamento: string; favorecidoConta?: string | null; chavePix?: string | null; codigoBarras?: string | null }
export interface EnvioRemessa { remessaId: string; numero: number; tipo: 'CNAB240' | 'PIX_LOTE'; nomeArquivo: string; conteudo: string; hash: string; itens: ItemEnvio[]; conta: { id: string; bancoCodigo?: string | null; numeroConta?: string | null } }
export interface RespostaEnvio { aceito: boolean; protocolo: string; mensagem?: string }
export interface RespostaRetorno { processado: boolean; itens: RetornoItem[]; retornoConteudo?: string }

export interface ProvedorBancario {
  nome: string
  /** true quando não fala com banco algum (nada é pago de verdade). */
  simulado: boolean
  enviarRemessa(e: EnvioRemessa): Promise<RespostaEnvio>
  consultarRetorno(e: EnvioRemessa, protocolo: string): Promise<RespostaRetorno>
}

/**
 * Regras do simulador (determinísticas, para testes e demonstração):
 *  - rejeita o item se a conta do favorecido termina em "0000", a chave Pix contém "rejeitar" ou o valor passa de R$ 1.000.000;
 *  - rejeita o arquivo inteiro se o nome do arquivo contiver "REJEITAR".
 */
export class ProvedorSimulado implements ProvedorBancario {
  nome = 'SIMULADO'
  simulado = true

  async enviarRemessa(e: EnvioRemessa): Promise<RespostaEnvio> {
    if (/REJEITAR/i.test(e.nomeArquivo)) return { aceito: false, protocolo: '', mensagem: 'Arquivo rejeitado pelo banco simulado (nome contém REJEITAR).' }
    const protocolo = 'SIM-' + createHash('sha256').update(e.hash + e.numero).digest('hex').slice(0, 12).toUpperCase()
    return { aceito: true, protocolo, mensagem: 'Remessa recebida pelo banco simulado. Nenhum pagamento real foi efetuado.' }
  }

  async consultarRetorno(e: EnvioRemessa, protocolo: string): Promise<RespostaRetorno> {
    if (!protocolo.startsWith('SIM-')) throw httpError(409, 'Protocolo não pertence ao provedor simulado.')
    const res: Record<string, { ok: boolean; codigo?: string }> = {}
    const itens: RetornoItem[] = e.itens.map((i) => {
      const rej = /0000$/.test(String(i.favorecidoConta ?? '').replace(/\D/g, '')) || /rejeitar/i.test(i.chavePix ?? '') || i.valor > 1_000_000
      res[i.idPagamento] = { ok: !rej, codigo: 'AG' }
      return rej ? { idPagamento: i.idPagamento, status: 'REJEITADO' as const, motivo: 'Conta/chave do favorecido inválida (simulado)' } : { idPagamento: i.idPagamento, status: 'PAGO' as const }
    })
    const retornoConteudo = e.tipo === 'CNAB240' ? montarRetornoCnabSimulado(e.conteudo, res) : itens.map((i) => `${i.idPagamento};${i.status};${i.motivo ?? ''}`).join('\r\n') + '\r\n'
    return { processado: true, itens, retornoConteudo }
  }
}

const registro = new Map<string, ProvedorBancario>([['SIMULADO', new ProvedorSimulado()]])

export function registrarProvedor(p: ProvedorBancario) { registro.set(p.nome.toUpperCase(), p) }

export function obterProvedor(nome: string | null | undefined): ProvedorBancario {
  const p = registro.get(String(nome || 'SIMULADO').toUpperCase())
  if (!p) throw httpError(501, `Provedor bancário "${nome}" não está configurado. Integrações reais exigem credenciais, certificado e homologação com o banco; use SIMULADO ou baixe o arquivo CNAB e envie pelo internet banking.`, { code: 'PROVEDOR_NAO_CONFIGURADO' })
  return p
}
