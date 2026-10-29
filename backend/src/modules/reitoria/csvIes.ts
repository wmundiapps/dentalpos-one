import { normalizar, soDigitos } from './util2'

// Parser PURO de CSV dos microdados/indicadores públicos do INEP (CPC, IGC, Censo da Educação Superior...).
// Aceita separador ; , ou tab, aspas, vírgula decimal e cabeçalhos com nomes do INEP ou nomes livres.

export const INDICADORES = ['CPC', 'CC', 'IGC', 'ENADE', 'IDD', 'MENSALIDADE', 'NUM_CURSOS', 'NUM_ALUNOS', 'NUM_DOCENTES', 'PCT_DOUTORES', 'INGRESSANTES', 'CONCLUINTES'] as const
export type Indicador = (typeof INDICADORES)[number]

/** Sentido para ranking: MAIOR (maior é melhor), MENOR (menor é melhor), NEUTRO (apenas informativo). */
export const SENTIDO: Record<Indicador, 'MAIOR' | 'MENOR' | 'NEUTRO'> = {
  CPC: 'MAIOR', CC: 'MAIOR', IGC: 'MAIOR', ENADE: 'MAIOR', IDD: 'MAIOR', MENSALIDADE: 'NEUTRO', NUM_CURSOS: 'NEUTRO', NUM_ALUNOS: 'NEUTRO', NUM_DOCENTES: 'NEUTRO', PCT_DOUTORES: 'MAIOR', INGRESSANTES: 'NEUTRO', CONCLUINTES: 'NEUTRO',
}
export const UNIDADE: Record<Indicador, string> = { CPC: 'faixa/contínuo', CC: 'faixa/contínuo', IGC: 'faixa/contínuo', ENADE: 'faixa/contínuo', IDD: 'faixa/contínuo', MENSALIDADE: 'R$', NUM_CURSOS: 'cursos', NUM_ALUNOS: 'alunos', NUM_DOCENTES: 'docentes', PCT_DOUTORES: '%', INGRESSANTES: 'alunos', CONCLUINTES: 'alunos' }

const ALIAS: Record<string, string[]> = {
  codigo: ['co_ies', 'codigo_ies', 'cod_ies', 'codigo_emec', 'codigo_e_mec', 'cod_emec', 'codigo_da_ies', 'codigo_da_instituicao', 'emec'],
  nome: ['no_ies', 'nome_ies', 'nome_da_ies', 'instituicao', 'nome_instituicao', 'nome_da_instituicao', 'ies', 'nome'],
  sigla: ['sg_ies', 'sigla', 'sigla_ies'],
  uf: ['sg_uf', 'uf', 'sg_uf_ies', 'sigla_uf'],
  municipio: ['no_municipio', 'municipio', 'no_municipio_ies', 'cidade'],
  cnpj: ['cnpj', 'nu_cnpj', 'nu_cnpj_ies'],
  categoria: ['categoria', 'categoria_administrativa', 'tp_categoria_administrativa', 'no_categoria'],
  organizacao: ['organizacao', 'organizacao_academica', 'tp_organizacao_academica'],
  ano: ['nu_ano', 'ano', 'ano_censo', 'nu_ano_censo', 'ano_referencia', 'ciclo'],
  curso: ['no_curso', 'curso', 'nome_curso', 'nome_do_curso'],
  indicador: ['indicador', 'tp_indicador', 'metrica'],
  valor: ['valor', 'vl_indicador', 'resultado'],
}
const WIDE: Record<Indicador, string[]> = {
  CPC: ['cpc_continuo', 'cpc', 'cpc_cont', 'conceito_preliminar_de_curso', 'nota_cpc_continuo'],
  CC: ['cc', 'conceito_de_curso', 'conceito_curso', 'cc_continuo'],
  IGC: ['igc_continuo', 'igc', 'igc_cont', 'indice_geral_de_cursos', 'nota_igc_continuo'],
  ENADE: ['enade_continuo', 'enade', 'conceito_enade', 'nota_enade', 'enade_cont'],
  IDD: ['idd_continuo', 'idd', 'indicador_de_diferenca_entre_os_desempenhos', 'idd_cont'],
  MENSALIDADE: ['mensalidade', 'valor_mensalidade', 'mensalidade_media', 'vl_mensalidade'],
  NUM_CURSOS: ['qt_curso', 'qt_cursos', 'num_cursos', 'nu_cursos', 'numero_de_cursos', 'quantidade_de_cursos'],
  NUM_ALUNOS: ['qt_mat', 'qt_matricula', 'qt_matriculas', 'num_alunos', 'nu_alunos', 'numero_de_alunos', 'qt_alunos', 'qt_mat_total'],
  NUM_DOCENTES: ['qt_doc', 'qt_docentes', 'num_docentes', 'nu_docentes', 'qt_doc_total'],
  PCT_DOUTORES: ['pct_doutores', 'percentual_doutores', 'pc_doutores', 'perc_doutores'],
  INGRESSANTES: ['qt_ing', 'qt_ingressantes', 'ingressantes', 'nu_ingressantes'],
  CONCLUINTES: ['qt_conc', 'qt_concluintes', 'concluintes', 'nu_concluintes'],
}

export function detectarDelimitador(texto: string): string {
  const cab = texto.split(/\r?\n/, 1)[0] ?? ''
  const cont = (c: string) => (cab.match(new RegExp(c === '\t' ? '\\t' : `\\${c}`, 'g')) || []).length
  const cand = [';', ',', '\t'].map((c) => [c, cont(c)] as const).sort((a, b) => b[1] - a[1])
  return cand[0][1] > 0 ? cand[0][0] : ';'
}

export function parseCsv(texto: string, delim?: string): string[][] {
  const t = texto.replace(/^﻿/, '')
  const d = delim ?? detectarDelimitador(t)
  const linhas: string[][] = []
  let cel = '', linha: string[] = [], aspas = false
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (aspas) {
      if (c === '"') { if (t[i + 1] === '"') { cel += '"'; i++ } else aspas = false } else cel += c
    } else if (c === '"') aspas = true
    else if (c === d) { linha.push(cel); cel = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++
      linha.push(cel); cel = ''
      if (linha.some((x) => x.trim() !== '')) linhas.push(linha)
      linha = []
    } else cel += c
  }
  linha.push(cel)
  if (linha.some((x) => x.trim() !== '')) linhas.push(linha)
  return linhas
}

export function parseNumero(s: string | undefined | null): number | null {
  if (s == null) return null
  let t = String(s).trim().replace(/[R$\s%]/g, '')
  if (!t || /^(nd|n\/a|na|sc|s\/c|-|--|\*+)$/i.test(t)) return null
  if (/,/.test(t) && /\./.test(t)) t = t.replace(/\./g, '').replace(',', '.')   // 1.234,56
  else if (/,/.test(t)) t = t.replace(',', '.')
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '')               // 1.234 (milhar)
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

const chave = (h: string) => normalizar(h).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

export interface LinhaIes {
  linha: number
  codigo?: string; nome?: string; sigla?: string; uf?: string; municipio?: string; cnpj?: string; categoria?: string; organizacao?: string
  ano?: number; curso: string
  medidas: Array<{ indicador: Indicador; valor: number }>
}
export interface ResultadoCsv { delimitador: string; cabecalhos: string[]; formato: 'LARGO' | 'LONGO'; linhas: LinhaIes[]; ignoradas: Array<{ linha: number; motivo: string }> }

export function interpretarCsvIes(texto: string, o: { anoPadrao?: number; delimitador?: string } = {}): ResultadoCsv {
  const delim = o.delimitador ?? detectarDelimitador(texto)
  const rows = parseCsv(texto, delim)
  if (rows.length < 2) return { delimitador: delim, cabecalhos: rows[0] ?? [], formato: 'LARGO', linhas: [], ignoradas: [{ linha: 1, motivo: 'Arquivo sem linhas de dados.' }] }
  const cab = rows[0].map(chave)
  const idx = (campo: string) => cab.findIndex((h) => ALIAS[campo].includes(h))
  const col = Object.fromEntries(Object.keys(ALIAS).map((k) => [k, idx(k)])) as Record<string, number>
  const wide = (Object.keys(WIDE) as Indicador[]).map((ind) => {
    // prioriza a ordem de aliases (ex.: contínuo antes do faixa)
    for (const a of WIDE[ind]) { const i = cab.indexOf(a); if (i >= 0) return [ind, i] as const }
    return null
  }).filter((x): x is readonly [Indicador, number] => !!x)
  const longo = col.indicador >= 0 && col.valor >= 0
  const linhas: LinhaIes[] = []
  const ignoradas: Array<{ linha: number; motivo: string }> = []
  for (let r = 1; r < rows.length; r++) {
    const f = rows[r]
    const get = (c: string) => (col[c] >= 0 ? (f[col[c]] ?? '').trim() : '')
    const nLinha = r + 1
    const ano = parseNumero(get('ano')) ?? o.anoPadrao
    if (!ano || ano < 1990 || ano > 2100) { ignoradas.push({ linha: nLinha, motivo: 'Ano ausente ou inválido.' }); continue }
    const codigo = soDigitos(get('codigo')) || undefined
    const cnpj = soDigitos(get('cnpj')) || undefined
    const nome = get('nome') || undefined
    if (!codigo && !cnpj && !nome) { ignoradas.push({ linha: nLinha, motivo: 'Linha sem identificação da IES (código, CNPJ ou nome).' }); continue }
    const medidas: LinhaIes['medidas'] = []
    if (longo) {
      const nome2 = chave(get('indicador')).toUpperCase()
      const ind = (INDICADORES as readonly string[]).includes(nome2) ? (nome2 as Indicador) : (Object.keys(WIDE) as Indicador[]).find((k) => WIDE[k].includes(chave(get('indicador'))))
      const v = parseNumero(get('valor'))
      if (!ind) { ignoradas.push({ linha: nLinha, motivo: `Indicador desconhecido: "${get('indicador')}".` }); continue }
      if (v == null) { ignoradas.push({ linha: nLinha, motivo: 'Valor ausente ou não numérico.' }); continue }
      medidas.push({ indicador: ind, valor: v })
    } else {
      for (const [ind, i] of wide) { const v = parseNumero(f[i]); if (v != null) medidas.push({ indicador: ind, valor: v }) }
      if (!medidas.length) { ignoradas.push({ linha: nLinha, motivo: 'Nenhum indicador numérico reconhecido na linha.' }); continue }
    }
    const ok = medidas.filter((m) => {
      if (m.valor < 0) { ignoradas.push({ linha: nLinha, motivo: `Valor negativo para ${m.indicador}.` }); return false }
      if (['CPC', 'CC', 'IGC', 'ENADE', 'IDD'].includes(m.indicador) && m.valor > 5) { ignoradas.push({ linha: nLinha, motivo: `${m.indicador} acima de 5 (use a escala contínua 0 a 5).` }); return false }
      if (m.indicador === 'PCT_DOUTORES' && m.valor > 100) { ignoradas.push({ linha: nLinha, motivo: 'PCT_DOUTORES acima de 100.' }); return false }
      return true
    })
    if (!ok.length) continue
    linhas.push({ linha: nLinha, codigo, nome, sigla: get('sigla') || undefined, uf: get('uf').toUpperCase().slice(0, 2) || undefined, municipio: get('municipio') || undefined, cnpj, categoria: get('categoria') || undefined, organizacao: get('organizacao') || undefined, ano: Math.round(ano), curso: get('curso'), medidas: ok })
  }
  return { delimitador: delim, cabecalhos: rows[0], formato: longo ? 'LONGO' : 'LARGO', linhas, ignoradas }
}

/** Ranking (1 = melhor) para um conjunto de valores; empates compartilham posição. */
export function ranquear<T extends { valor: number }>(itens: T[], sentido: 'MAIOR' | 'MENOR' | 'NEUTRO'): Array<T & { posicao: number }> {
  const ord = [...itens].sort((a, b) => (sentido === 'MENOR' ? a.valor - b.valor : b.valor - a.valor))
  let pos = 0, prev: number | null = null
  return ord.map((x, i) => { if (prev === null || x.valor !== prev) pos = i + 1; prev = x.valor; return { ...x, posicao: pos } })
}
