import { r2, soDigitos } from './common'

// ============================================================
// Geração de arquivo de remessa de pagamentos.
//  - CNAB 240 (padrão Febraban de Pagamentos, v10.x): header de arquivo/lote, segmentos A (+B Pix), J (boletos), trailers.
//  - Pix em lote: CSV genérico.
// MODELO: cada banco tem particularidades (convênio, versão de layout, códigos de finalidade). O arquivo gerado deve
// ser homologado com o banco antes do uso em produção. Funções puras (sem I/O).
// ============================================================

export interface PagadorCnab { bancoCodigo: string; agencia: string; digitoAgencia?: string; conta: string; digitoConta?: string; nome: string; documento: string; convenio?: string }
export interface ItemCnab {
  idPagamento: string          // até 20 posições
  formaPagamento: 'PIX' | 'TED' | 'CREDITO_CONTA' | 'BOLETO'
  favorecidoNome: string
  favorecidoDocumento?: string | null
  bancoFavorecido?: string | null
  agenciaFavorecido?: string | null
  contaFavorecido?: string | null
  tipoContaFavorecido?: string | null
  chavePix?: string | null
  tipoChavePix?: string | null
  codigoBarras?: string | null
  valor: number
  vencimento: Date
}

const SEM_ACENTO = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
export const alfa = (v: unknown, n: number) => SEM_ACENTO(String(v ?? '')).toUpperCase().replace(/[^A-Z0-9 .,\-/&@_:;+()%$#*]/g, ' ').slice(0, n).padEnd(n, ' ')
export const numero = (v: unknown, n: number) => soDigitos(String(v ?? '')).slice(-n).padStart(n, '0')
export const centavos = (v: number, n: number) => String(Math.round(r2(v) * 100)).padStart(n, '0').slice(-n)
export const ddmmaaaa = (d: Date) => `${String(d.getUTCDate()).padStart(2, '0')}${String(d.getUTCMonth() + 1).padStart(2, '0')}${d.getUTCFullYear()}`
const hhmmss = (d: Date) => `${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}${String(d.getUTCSeconds()).padStart(2, '0')}`
const tipoInsc = (doc: string) => (soDigitos(doc).length > 11 ? '2' : '1')
const L = (s: string) => {
  if (s.length !== 240) throw new Error(`Registro CNAB com ${s.length} posições (esperado 240): ${s.slice(0, 20)}...`)
  return s
}

/** Converte linha digitável (47 dígitos) em código de barras (44). 44 dígitos retornam sem alteração. */
export function linhaParaCodigoBarras(v: string): string {
  const d = soDigitos(v)
  if (d.length === 44) return d
  if (d.length !== 47) throw new Error('Linha digitável de boleto bancário deve ter 44 ou 47 dígitos.')
  return d.slice(0, 4) + d[32] + d.slice(33, 47) + d.slice(4, 9) + d.slice(10, 20) + d.slice(21, 31)
}

const FORMA_LANC: Record<string, string> = { CREDITO_CONTA: '01', TED: '03', PIX: '45', BOLETO: '31' }
const CAMARA: Record<string, string> = { CREDITO_CONTA: '000', TED: '018', PIX: '009' }

function headerArquivo(p: PagadorCnab, seq: number, agora: Date) {
  return L(
    numero(p.bancoCodigo, 3) + '0000' + '0' + ' '.repeat(9) + tipoInsc(p.documento) + numero(p.documento, 14) + alfa(p.convenio ?? '', 20) +
    numero(p.agencia, 5) + alfa(p.digitoAgencia ?? '', 1) + numero(p.conta, 12) + alfa(p.digitoConta ?? '', 1) + ' ' + alfa(p.nome, 30) + alfa('BANCO', 30) +
    ' '.repeat(10) + '1' + ddmmaaaa(agora) + hhmmss(agora) + numero(seq, 6) + '103' + '01600' + ' '.repeat(20) + ' '.repeat(20) + ' '.repeat(29),
  )
}

function headerLote(p: PagadorCnab, lote: number, forma: string) {
  return L(
    numero(p.bancoCodigo, 3) + numero(lote, 4) + '1' + 'C' + '20' + FORMA_LANC[forma] + '045' + ' ' + tipoInsc(p.documento) + numero(p.documento, 14) + alfa(p.convenio ?? '', 20) +
    numero(p.agencia, 5) + alfa(p.digitoAgencia ?? '', 1) + numero(p.conta, 12) + alfa(p.digitoConta ?? '', 1) + ' ' + alfa(p.nome, 30) + ' '.repeat(40) + ' '.repeat(30) + '00000' + ' '.repeat(15) + ' '.repeat(20) +
    '00000000' + '  ' + ' '.repeat(8) + ' '.repeat(10),
  )
}

function segmentoA(p: PagadorCnab, lote: number, seq: number, it: ItemCnab, dataPgto: Date) {
  const doc = numero(it.idPagamento.replace(/\D/g, '') || '0', 0)
  void doc
  const camara = CAMARA[it.formaPagamento]
  return L(
    numero(p.bancoCodigo, 3) + numero(lote, 4) + '3' + numero(seq, 5) + 'A' + '0' + '00' + camara + numero(it.bancoFavorecido ?? '', 3) +
    numero(it.agenciaFavorecido ?? '', 5) + ' ' + numero(String(it.contaFavorecido ?? '').replace(/\D/g, '').slice(0, -1) || it.contaFavorecido, 12) + String(it.contaFavorecido ?? '').replace(/\D/g, '').slice(-1).padStart(1, '0') + ' ' +
    alfa(it.favorecidoNome, 30) + alfa(it.idPagamento, 20) + ddmmaaaa(dataPgto) + 'BRL' + '0'.repeat(15) + centavos(it.valor, 15) + ' '.repeat(20) + '0'.repeat(8) + '0'.repeat(15) +
    ' '.repeat(40) + '  ' + ' '.repeat(5) + '  ' + ' '.repeat(3) + '0' + ' '.repeat(10),
  )
}

function segmentoB(p: PagadorCnab, lote: number, seq: number, it: ItemCnab) {
  const pix = it.formaPagamento === 'PIX'
  return L(
    numero(p.bancoCodigo, 3) + numero(lote, 4) + '3' + numero(seq, 5) + 'B' + (pix ? '01 ' : '   ') + tipoInsc(it.favorecidoDocumento ?? '') + numero(it.favorecidoDocumento ?? '', 14) +
    ' '.repeat(35) + ' '.repeat(60) + alfa(pix ? it.chavePix ?? '' : '', 100) + ' '.repeat(13),
  )
}

function segmentoJ(p: PagadorCnab, lote: number, seq: number, it: ItemCnab, dataPgto: Date) {
  const barras = linhaParaCodigoBarras(it.codigoBarras ?? '')
  return L(
    numero(p.bancoCodigo, 3) + numero(lote, 4) + '3' + numero(seq, 5) + 'J' + '0' + '00' + barras + alfa(it.favorecidoNome, 30) + ddmmaaaa(it.vencimento) +
    centavos(it.valor, 15) + '0'.repeat(15) + '0'.repeat(15) + ddmmaaaa(dataPgto) + centavos(it.valor, 15) + '0'.repeat(15) + alfa(it.idPagamento, 20) + ' '.repeat(20) + '09' + ' '.repeat(6) + ' '.repeat(10),
  )
}

function trailerLote(p: PagadorCnab, lote: number, qtdRegistros: number, soma: number) {
  return L(numero(p.bancoCodigo, 3) + numero(lote, 4) + '5' + ' '.repeat(9) + numero(qtdRegistros, 6) + centavos(soma, 18) + '0'.repeat(18) + '0'.repeat(6) + ' '.repeat(165) + ' '.repeat(10))
}

function trailerArquivo(p: PagadorCnab, qtdLotes: number, qtdRegistros: number) {
  return L(numero(p.bancoCodigo, 3) + '9999' + '9' + ' '.repeat(9) + numero(qtdLotes, 6) + numero(qtdRegistros, 6) + '0'.repeat(6) + ' '.repeat(205))
}

export function gerarCnab240(p: PagadorCnab, itens: ItemCnab[], dataPagamento: Date, seqArquivo: number, agora = new Date()): { conteudo: string; qtdRegistros: number; lotes: number } {
  if (!itens.length) throw new Error('Nenhum item para a remessa.')
  const linhas: string[] = [headerArquivo(p, seqArquivo, agora)]
  const grupos = new Map<string, ItemCnab[]>()
  for (const it of itens) {
    if (!FORMA_LANC[it.formaPagamento]) throw new Error(`Forma de pagamento ${it.formaPagamento} não suportada em CNAB 240.`)
    ;(grupos.get(it.formaPagamento) ?? grupos.set(it.formaPagamento, []).get(it.formaPagamento)!).push(it)
  }
  let lote = 0
  for (const [forma, lista] of grupos) {
    lote++
    const ini = linhas.length
    linhas.push(headerLote(p, lote, forma))
    let seq = 0, soma = 0
    for (const it of lista) {
      if (forma === 'BOLETO') { seq++; linhas.push(segmentoJ(p, lote, seq, it, dataPagamento)) }
      else { seq++; linhas.push(segmentoA(p, lote, seq, it, dataPagamento)); seq++; linhas.push(segmentoB(p, lote, seq, it)) }
      soma += it.valor
    }
    linhas.push(trailerLote(p, lote, linhas.length - ini + 1, soma))
  }
  linhas.push(trailerArquivo(p, lote, linhas.length + 1))
  return { conteudo: linhas.join('\r\n') + '\r\n', qtdRegistros: linhas.length, lotes: lote }
}

const csvCel = (v: unknown) => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }

export function gerarPixLote(p: PagadorCnab, itens: ItemCnab[], dataPagamento: Date): { conteudo: string } {
  if (!itens.length) throw new Error('Nenhum item para a remessa.')
  const cab = ['idPagamento', 'tipoChave', 'chave', 'favorecido', 'documento', 'valor', 'dataPagamento', 'pagadorBanco', 'pagadorAgencia', 'pagadorConta']
  const rows = itens.map((i) => {
    if (i.formaPagamento !== 'PIX') throw new Error(`Pix em lote só aceita pagamentos PIX (item ${i.idPagamento} é ${i.formaPagamento}).`)
    return [i.idPagamento, i.tipoChavePix ?? '', i.chavePix ?? '', i.favorecidoNome, soDigitos(i.favorecidoDocumento ?? ''), i.valor.toFixed(2), dataPagamento.toISOString().slice(0, 10), p.bancoCodigo, p.agencia, p.conta].map(csvCel).join(';')
  })
  return { conteudo: [cab.join(';'), ...rows].join('\r\n') + '\r\n' }
}

// ---------- retorno ----------
export interface RetornoItem { idPagamento: string; status: 'PAGO' | 'REJEITADO'; motivo?: string }

const OCORRENCIAS: Record<string, string> = { '00': 'Crédito ou débito efetuado', AG: 'Agência/conta do favorecido inválida', AI: 'Inconsistência de CPF/CNPJ', AA: 'Controle inválido', BD: 'Pagamento agendado', ZK: 'Boleto já liquidado', HA: 'Lote não aceito' }

/** Interpreta retorno CNAB 240 (segmentos A/J, ocorrências nas posições 231-240) ou CSV simples `idPagamento;status;motivo`. */
export function parseRetorno(texto: string): RetornoItem[] {
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim().length)
  const out: RetornoItem[] = []
  for (const l of linhas) {
    if (l.length >= 240 && l[7] === '3' && (l[13] === 'A' || l[13] === 'J')) {
      const id = (l[13] === 'A' ? l.slice(73, 93) : l.slice(182, 202)).trim()
      const oc = l.slice(230, 240).trim().slice(0, 2)
      const ok = oc === '00' || oc === 'BD' || oc === ''
      out.push({ idPagamento: id, status: ok && oc !== '' ? 'PAGO' : 'REJEITADO', motivo: ok ? undefined : OCORRENCIAS[oc] ?? `Ocorrência ${oc}` })
    } else if (l.includes(';')) {
      const [id, st, motivo] = l.split(';').map((s) => s.trim())
      if (!id || /^idpagamento$/i.test(id)) continue
      out.push({ idPagamento: id, status: /^(PAGO|OK|00|LIQUIDADO)$/i.test(st) ? 'PAGO' : 'REJEITADO', motivo: motivo || undefined })
    }
  }
  return out
}

export function montarRetornoCnabSimulado(remessaConteudo: string, resultados: Record<string, { ok: boolean; codigo?: string }>): string {
  return remessaConteudo.split(/\r?\n/).filter(Boolean).map((l) => {
    if (l.length === 240 && l[7] === '3' && (l[13] === 'A' || l[13] === 'J')) {
      const id = (l[13] === 'A' ? l.slice(73, 93) : l.slice(182, 202)).trim()
      const r = resultados[id]
      return l.slice(0, 230) + (r ? (r.ok ? '00' : r.codigo ?? 'AG') : '00').padEnd(10, ' ')
    }
    return l
  }).join('\r\n') + '\r\n'
}
