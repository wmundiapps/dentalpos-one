// Utilidades comuns de Compras e Patrimônio (modelos auxiliares Cpp*): numeração, política e erros.
import { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'

export const CPP_SUPER = ['ADMIN', 'OWNER', 'RECTOR', 'BOARD']
export const httpErr = (status: number, msg: string, extra?: Record<string, unknown>) => Object.assign(new Error(msg), { status, ...(extra ?? {}) })

type Db = Prisma.TransactionClient | typeof prisma

/** Número sequencial atômico por tenant/ano, ex.: CMP-2026-0001. */
export async function cppNumero(db: Db, tenantId: string, prefixo: string): Promise<string> {
  const ano = new Date().getFullYear()
  const r = await db.cppSequencia.upsert({
    where: { tenantId_chave: { tenantId, chave: `${prefixo}-${ano}` } },
    create: { tenantId, chave: `${prefixo}-${ano}`, valor: 1 },
    update: { valor: { increment: 1 } },
  })
  return `${prefixo}-${ano}-${String(r.valor).padStart(4, '0')}`
}

export interface PoliticaCompras {
  minCotacoes: number
  valorDispensaCotacao: number
  exigirAprovacaoCompra: boolean
  exigirConferencia: boolean
  toleranciaPrecoPct: number
  exigirAceiteTransferencia: boolean
  prazoAceiteDias: number
}

export const POLITICA_PADRAO: PoliticaCompras = {
  minCotacoes: 3,
  valorDispensaCotacao: 1000,
  exigirAprovacaoCompra: true,
  exigirConferencia: false,
  toleranciaPrecoPct: 1,
  exigirAceiteTransferencia: true,
  prazoAceiteDias: 7,
}

export async function getPolitica(tenantId: string, db: Db = prisma): Promise<PoliticaCompras> {
  const p = await db.cppPolitica.findUnique({ where: { tenantId } })
  if (!p) return { ...POLITICA_PADRAO }
  return {
    minCotacoes: p.minCotacoes, valorDispensaCotacao: p.valorDispensaCotacao, exigirAprovacaoCompra: p.exigirAprovacaoCompra,
    exigirConferencia: p.exigirConferencia, toleranciaPrecoPct: p.toleranciaPrecoPct, exigirAceiteTransferencia: p.exigirAceiteTransferencia, prazoAceiteDias: p.prazoAceiteDias,
  }
}

export const FORMAS_PAGAMENTO = ['A_VISTA', 'PARCELADO', 'BOLETO', 'PIX', 'CARTAO', 'PRAZO'] as const
export type FormaPagamento = (typeof FORMAS_PAGAMENTO)[number]
export const FORMA_LABEL: Record<FormaPagamento, string> = { A_VISTA: 'À vista', PARCELADO: 'Parcelado', BOLETO: 'Boleto', PIX: 'Pix', CARTAO: 'Cartão', PRAZO: 'A prazo' }

/** Normaliza parcelas/intervalo conforme a forma de pagamento (valida combinações inválidas). */
export function normalizarCondicao(forma: FormaPagamento, parcelas: number | undefined, intervalo: number | undefined, prazoFornecedorDias: number) {
  let n = Math.max(1, Math.floor(parcelas ?? 1))
  let dias = intervalo ?? 30
  switch (forma) {
    case 'A_VISTA':
    case 'PIX':
      if (n !== 1 && parcelas !== undefined) throw httpErr(400, `Pagamento ${FORMA_LABEL[forma]} não admite parcelamento.`)
      n = 1; dias = 0
      break
    case 'PRAZO':
      if (n !== 1 && parcelas !== undefined) throw httpErr(400, 'Pagamento a prazo é em parcela única; use "Parcelado" ou "Boleto" para várias parcelas.')
      n = 1; dias = intervalo ?? Math.max(1, prazoFornecedorDias || 30)
      break
    case 'PARCELADO':
      if (n < 2) throw httpErr(400, 'Pagamento parcelado exige ao menos 2 parcelas.')
      break
    case 'CARTAO':
      if (n > 12) throw httpErr(400, 'Cartão: no máximo 12 parcelas.')
      break
    case 'BOLETO':
      break
  }
  return { parcelas: n, intervaloParcelasDias: dias }
}
