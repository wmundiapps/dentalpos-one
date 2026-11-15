import { createHash } from 'crypto'

// PROVEDOR FISCAL — ponto de extensão para emissão real de NF-e/NFS-e/NFC-e.
// Nesta versão só existe o provedor SIMULADO: nada é transmitido à SEFAZ, à prefeitura ou ao Ambiente Nacional da NFS-e.
// Para integração real implemente `ProvedorFiscal` (certificado digital A1, assinatura XML, webservices, contingência, eventos
// de cancelamento/CC-e, consulta de situação) e registre-o com `definirProvedorFiscal`. Nunca guarde o certificado/senha no código.

export interface NotaParaEmitir { tenantId: string; empresaId: string; documentoEmitente: string; tipo: 'NFE' | 'NFSE' | 'NFCE'; serie: string; numero: number; valorTotal: number; uf: string | null; emitidaEm: Date }
export interface ResultadoEmissao { chaveAcesso: string | null; protocolo: string; codigoVerificacao?: string; xml: string | null; simulado: boolean; avisos: string[] }
export interface ProvedorFiscal {
  nome: string
  simulado: boolean
  emitir(n: NotaParaEmitir): Promise<ResultadoEmissao>
  cancelar(n: { chaveAcesso: string | null; protocolo: string | null; motivo: string }): Promise<{ protocolo: string; simulado: boolean }>
}

const UF_COD: Record<string, string> = { AC: '12', AL: '27', AP: '16', AM: '13', BA: '29', CE: '23', DF: '53', ES: '32', GO: '52', MA: '21', MT: '51', MS: '50', MG: '31', PA: '15', PB: '25', PR: '41', PE: '26', PI: '22', RJ: '33', RN: '24', RS: '43', RO: '11', RR: '14', SC: '42', SP: '35', SE: '28', TO: '17' }
const dig = (s: string, n: number) => BigInt('0x' + createHash('sha256').update(s).digest('hex')).toString().padEnd(n, '0').slice(0, n)

export const provedorFiscalSimulado: ProvedorFiscal = {
  nome: 'SIMULADO',
  simulado: true,
  async emitir(n) {
    const aamm = n.emitidaEm.toISOString().slice(2, 4) + n.emitidaEm.toISOString().slice(5, 7)
    const modelo = n.tipo === 'NFE' ? '55' : n.tipo === 'NFCE' ? '65' : '99'
    // Chave FICTÍCIA de 44 dígitos (UF + AAMM + CNPJ + modelo + série + número + aleatório) — o DV não é calculado de propósito: não valida em nenhuma consulta oficial.
    const base = (UF_COD[n.uf ?? ''] ?? '99') + aamm + n.documentoEmitente.padStart(14, '0') + modelo + n.serie.padStart(3, '0').slice(-3) + String(n.numero).padStart(9, '0').slice(-9) + '1' + dig(`${n.tenantId}|${n.empresaId}|${n.numero}`, 8)
    const chave = n.tipo === 'NFSE' ? null : base.slice(0, 43) + '0'
    return {
      chaveAcesso: chave, protocolo: 'SIM' + dig(`prot|${n.tenantId}|${n.empresaId}|${n.tipo}|${n.numero}`, 12), codigoVerificacao: n.tipo === 'NFSE' ? dig(`cod|${n.empresaId}|${n.numero}`, 8) : undefined,
      xml: null, simulado: true, avisos: ['Nota SIMULADA: não foi transmitida à SEFAZ/prefeitura e não tem valor fiscal.'],
    }
  },
  async cancelar(n) { return { protocolo: 'SIMCANC' + dig(`canc|${n.protocolo}|${n.motivo}`, 10), simulado: true } },
}

let atual: ProvedorFiscal = provedorFiscalSimulado
export const definirProvedorFiscal = (p: ProvedorFiscal) => { atual = p }
export const provedorFiscal = () => atual
