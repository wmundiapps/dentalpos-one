import { httpError } from '../tesouraria/common'
import { barrasParaLinha47, montarBarrasBancario } from './linha'

// ============================================================
// Provedor de DDA (Débito Direto Autorizado).
//
// PONTO DE EXTENSÃO: para ligar a um banco/CIP reais, implemente `ProvedorDda` (consulta dos boletos emitidos contra o CNPJ da
// instituição na Câmara Interbancária de Pagamentos, em geral via API do banco com certificado/mTLS ou via agregador) e registre
// com `registrarProvedorDda('NOME', instancia)`. Depois selecione o nome em Configurações (BolConfig.ddaProvedor).
// Hoje existe SOMENTE o provedor SIMULADO: não usa rede nem credenciais e gera boletos fictícios coerentes.
// ============================================================

export interface BoletoDda {
  idExterno: string
  linhaDigitavel: string
  valor: number
  vencimento: string            // AAAA-MM-DD
  beneficiarioNome: string
  beneficiarioDocumento: string
  numeroDocumento?: string
  bancoEmissor?: string
  nossoNumero?: string
}

export interface ContextoDda {
  tenantId: string
  documentoPagador?: string | null
  desde?: Date | null
  /** Fornecedores do tenant (o simulado os usa para gerar boletos coerentes com o cadastro). */
  fornecedores: Array<{ razaoSocial: string; cnpj?: string | null; banco?: string | null }>
  hoje?: Date
}

export interface ProvedorDda {
  nome: string
  simulado: boolean
  descricao: string
  listarBoletos(ctx: ContextoDda): Promise<BoletoDda[]>
}

const registro = new Map<string, ProvedorDda>()
export const registrarProvedorDda = (nome: string, p: ProvedorDda) => { registro.set(nome.toUpperCase(), p) }
export const provedoresDda = () => Array.from(registro.values()).map((p) => ({ nome: p.nome, simulado: p.simulado, descricao: p.descricao }))
export function obterProvedorDda(nome: string): ProvedorDda {
  const p = registro.get(String(nome || '').toUpperCase())
  if (!p) throw httpError(424, `Provedor DDA "${nome}" não está configurado. Disponíveis: ${Array.from(registro.keys()).join(', ') || 'nenhum'}.`, { code: 'PROVEDOR_NAO_CONFIGURADO' })
  return p
}

// ---------- utilitários (CNPJ fictício válido, dígitos determinísticos) ----------
export function cnpjComDv(base12: string): string {
  const b = base12.replace(/\D/g, '').padStart(12, '0').slice(0, 12)
  const dv = (s: string) => {
    const pesos = s.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const soma = s.split('').reduce((t, c, i) => t + Number(c) * pesos[i], 0)
    const r = soma % 11
    return r < 2 ? 0 : 11 - r
  }
  const d1 = dv(b)
  const d2 = dv(b + d1)
  return b + d1 + d2
}

function digitos(seed: number, n: number): string {
  let x = (seed >>> 0) || 7
  let out = ''
  while (out.length < n) { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; out += String(x % 10) }
  return out
}
const yyyymmdd = (d: Date) => Number(d.toISOString().slice(0, 10).replace(/-/g, ''))
const somaDias = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n, 12))
const iso = (d: Date) => d.toISOString().slice(0, 10)

const FICTICIOS = [
  { razaoSocial: 'Papelaria Central Ltda', cnpj: cnpjComDv('100200300001'), banco: '341' },
  { razaoSocial: 'TechCampus Informática Ltda', cnpj: cnpjComDv('200300400001'), banco: '237' },
  { razaoSocial: 'Limpeza Total Serviços Ltda', cnpj: cnpjComDv('300400500001'), banco: '001' },
]

/** Corrompe um dígito verificador de campo (demonstra "DV inválido"). */
export function corromperDv(linha47: string): string {
  const d = linha47.replace(/\D/g, '')
  const i = 20 // DV do campo 2
  return d.slice(0, i) + String((Number(d[i]) + 3) % 10) + d.slice(i + 1)
}

export const provedorDdaSimulado: ProvedorDda = {
  nome: 'SIMULADO',
  simulado: true,
  descricao: 'Boletos fictícios gerados localmente (sem rede/credenciais): normais, um duplicado, um suspeito (CNPJ parecido) e um com dígito verificador inválido.',
  async listarBoletos(ctx) {
    const hoje = ctx.hoje ?? new Date()
    const dia = yyyymmdd(hoje)
    const base = ctx.fornecedores.filter((f) => f.cnpj && f.cnpj.replace(/\D/g, '').length === 14 && /^\d{3}$/.test((f.banco || '').trim())).sort((a, b) => String(a.cnpj).localeCompare(String(b.cnpj))).slice(0, 3)
    const forn = [...base, ...FICTICIOS.filter((f) => !base.some((b) => b.cnpj?.replace(/\D/g, '') === f.cnpj))].slice(0, 3)
    const bancoDe = (f: { banco?: string | null }, i: number) => (f.banco && /^\d{3}$/.test(f.banco.trim()) ? f.banco.trim() : ['341', '237', '001'][i])
    const valores = [1850 + (dia % 5) * 10, 2430.5 + (dia % 7), 980.9 + (dia % 3)]
    const out: BoletoDda[] = []
    const mk = (id: string, f: { razaoSocial: string; cnpj?: string | null }, banco: string, valor: number, dias: number, salt: number, doc?: string): BoletoDda => {
      const venc = somaDias(hoje, dias)
      const barras = montarBarrasBancario({ banco, vencimento: venc, valor, campoLivre: digitos(dia * 31 + salt, 25) })
      return {
        idExterno: id, linhaDigitavel: barrasParaLinha47(barras), valor, vencimento: iso(venc), beneficiarioNome: f.razaoSocial,
        beneficiarioDocumento: (doc ?? f.cnpj ?? '').replace(/\D/g, ''), numeroDocumento: `DDA-${dia % 100000}-${salt}`, bancoEmissor: banco, nossoNumero: digitos(dia + salt, 11),
      }
    }
    forn.forEach((f, i) => out.push(mk(`SIM-${dia}-N${i + 1}`, f, bancoDe(f, i), valores[i], 8 + i * 6, i + 1)))
    // duplicado: o mesmo boleto chegando duas vezes (outro id externo)
    out.push({ ...out[0], idExterno: `SIM-${dia}-DUP1` })
    // suspeito: nome parecido com um fornecedor, CNPJ diferente e banco incomum
    const alvo = forn[2]
    out.push(mk(`SIM-${dia}-SUSP1`, { razaoSocial: alvo.razaoSocial.replace(/Ltda$/i, 'ME'), cnpj: null }, '033', 4890, 5, 9, cnpjComDv('900800700001')))
    // dígito verificador inválido
    const ruim = mk(`SIM-${dia}-DV1`, forn[1], bancoDe(forn[1], 1), 615.4, 12, 11)
    out.push({ ...ruim, linhaDigitavel: corromperDv(ruim.linhaDigitavel) })
    return out
  },
}
registrarProvedorDda('SIMULADO', provedorDdaSimulado)
