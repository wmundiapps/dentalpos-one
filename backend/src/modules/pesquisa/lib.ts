// Funções PURAS do módulo de pesquisa (sem acesso a banco) — testadas em __selftest__.ts.

const DAY = 86_400_000
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY)
export const diffDays = (a: Date, b: Date) => (a.getTime() - b.getTime()) / DAY
const round = (n: number, c = 2) => Math.round(n * 10 ** c) / 10 ** c

import { randomBytes } from 'crypto'

// ---------- identificadores ----------
// ORCID: 16 caracteres, último é dígito verificador ISO 7064 MOD 11-2.
export function validarOrcid(v?: string | null): boolean {
  if (!v) return false
  const id = v.replace(/^https?:\/\/orcid\.org\//i, '').replace(/-/g, '').toUpperCase()
  if (!/^\d{15}[\dX]$/.test(id)) return false
  let total = 0
  for (let i = 0; i < 15; i++) total = (total + Number(id[i])) * 2
  const r = (12 - (total % 11)) % 11
  return id[15] === (r === 10 ? 'X' : String(r))
}

export function normalizarOrcid(v?: string | null): string | null {
  if (!v) return null
  const id = v.replace(/^https?:\/\/orcid\.org\//i, '').replace(/-/g, '').toUpperCase()
  if (id.length !== 16) return null
  return `${id.slice(0, 4)}-${id.slice(4, 8)}-${id.slice(8, 12)}-${id.slice(12)}`
}

export function validarIssn(v?: string | null): boolean {
  if (!v) return false
  const s = v.replace('-', '').toUpperCase()
  if (!/^\d{7}[\dX]$/.test(s)) return false
  let sum = 0
  for (let i = 0; i < 7; i++) sum += Number(s[i]) * (8 - i)
  const r = (11 - (sum % 11)) % 11
  return s[7] === (r === 10 ? 'X' : String(r))
}

export function normalizarDoi(v?: string | null): string | null {
  if (!v) return null
  const d = v.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '').toLowerCase()
  return /^10\.\d{4,9}\/\S+$/.test(d) ? d : null
}

export function normalizarTexto(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function hashDedupe(tipo: string, titulo: string, ano: number, doi?: string | null): string {
  const d = normalizarDoi(doi)
  return d ? `doi:${d}` : `${tipo}:${ano}:${normalizarTexto(titulo).slice(0, 160)}`
}

export function gerarCodigo(prefixo: string, ano: number, seq: number, largura = 4) {
  return `${prefixo}-${ano}-${String(seq).padStart(largura, '0')}`
}

// ---------- BibTeX simples ----------
export interface BibItem {
  tipo: 'ARTIGO' | 'LIVRO' | 'CAPITULO' | 'TRABALHO_EVENTO' | 'SOFTWARE' | 'PATENTE' | 'OUTRO'
  titulo: string
  ano: number
  autores: string[]
  veiculo?: string
  volume?: string
  numero?: string
  paginas?: string
  doi?: string
  issn?: string
  isbn?: string
  url?: string
  resumo?: string
  palavrasChave: string[]
  idioma?: string
}

const BIB_TIPOS: Record<string, BibItem['tipo']> = {
  article: 'ARTIGO',
  book: 'LIVRO',
  inbook: 'CAPITULO',
  incollection: 'CAPITULO',
  inproceedings: 'TRABALHO_EVENTO',
  conference: 'TRABALHO_EVENTO',
  proceedings: 'TRABALHO_EVENTO',
  patent: 'PATENTE',
  software: 'SOFTWARE',
}

function limparBib(v: string) {
  return v.replace(/[{}]/g, '').replace(/\\&/g, '&').replace(/\s+/g, ' ').trim()
}

// "Silva, João and Maria Souza" -> ["João Silva", "Maria Souza"]
export function parseAutoresBib(s: string): string[] {
  return limparBib(s)
    .split(/\s+and\s+/i)
    .map((a) => {
      const p = a.split(',').map((x) => x.trim())
      return p.length >= 2 ? `${p.slice(1).join(' ')} ${p[0]}`.trim() : a.trim()
    })
    .filter(Boolean)
}

export function parseBibtex(texto: string): { itens: BibItem[]; erros: string[] } {
  const itens: BibItem[] = []
  const erros: string[] = []
  const re = /@(\w+)\s*\{/g
  let m: RegExpExecArray | null
  while ((m = re.exec(texto))) {
    const tipoRaw = m[1].toLowerCase()
    if (['comment', 'string', 'preamble'].includes(tipoRaw)) continue
    // encontra o fim balanceado da entrada
    let depth = 1
    let i = re.lastIndex
    while (i < texto.length && depth > 0) {
      const c = texto[i]
      if (c === '{') depth++
      else if (c === '}') depth--
      i++
    }
    const corpo = texto.slice(re.lastIndex, i - 1)
    re.lastIndex = i
    const campos: Record<string, string> = {}
    const fr = /(\w+)\s*=\s*/g
    let f: RegExpExecArray | null
    while ((f = fr.exec(corpo))) {
      let j = fr.lastIndex
      let valor = ''
      if (corpo[j] === '{') {
        let d = 1
        j++
        const ini = j
        while (j < corpo.length && d > 0) {
          if (corpo[j] === '{') d++
          else if (corpo[j] === '}') d--
          j++
        }
        valor = corpo.slice(ini, j - 1)
      } else if (corpo[j] === '"') {
        const fim = corpo.indexOf('"', j + 1)
        valor = corpo.slice(j + 1, fim < 0 ? corpo.length : fim)
        j = fim < 0 ? corpo.length : fim + 1
      } else {
        const fim = corpo.slice(j).search(/[,\n]/)
        valor = corpo.slice(j, fim < 0 ? corpo.length : j + fim)
        j = fim < 0 ? corpo.length : j + fim
      }
      campos[f[1].toLowerCase()] = valor
      fr.lastIndex = j
    }
    const titulo = limparBib(campos.title || '')
    const ano = parseInt(campos.year || '', 10)
    if (!titulo || !ano) {
      erros.push(`Entrada @${tipoRaw} sem título/ano ignorada.`)
      continue
    }
    itens.push({
      tipo: BIB_TIPOS[tipoRaw] ?? 'OUTRO',
      titulo,
      ano,
      autores: campos.author ? parseAutoresBib(campos.author) : [],
      veiculo: limparBib(campos.journal || campos.booktitle || campos.publisher || campos.howpublished || '') || undefined,
      volume: limparBib(campos.volume || '') || undefined,
      numero: limparBib(campos.number || '') || undefined,
      paginas: limparBib(campos.pages || '').replace(/--/g, '-') || undefined,
      doi: normalizarDoi(limparBib(campos.doi || '')) ?? undefined,
      issn: limparBib(campos.issn || '') || undefined,
      isbn: limparBib(campos.isbn || '') || undefined,
      url: limparBib(campos.url || '') || undefined,
      resumo: limparBib(campos.abstract || '') || undefined,
      palavrasChave: limparBib(campos.keywords || '').split(/[,;]/).map((s) => s.trim()).filter(Boolean),
      idioma: limparBib(campos.language || '') || undefined,
    })
  }
  return { itens, erros }
}

// ---------- indicadores de produção ----------
export const QUALIS_PONTOS: Record<string, number> = { A1: 100, A2: 85, A3: 70, A4: 55, B1: 40, B2: 25, B3: 10, B4: 5, C: 0 }
const PESO_TIPO: Record<string, number> = { ARTIGO: 1, LIVRO: 1.5, CAPITULO: 0.5, TRABALHO_EVENTO: 0.3, PATENTE: 1.2, SOFTWARE: 0.8, OUTRO: 0.1 }

export function normalizarQualis(q?: string | null): string | null {
  if (!q) return null
  const s = q.trim().toUpperCase()
  return s in QUALIS_PONTOS ? s : null
}

export interface PubIn {
  tipo: string
  ano: number
  qualis?: string | null
  jcr?: number | null
  doi?: string | null
  programId?: string | null
  grupoId?: string | null
  autores: Array<{ tipo: string; userId?: string | null; nome?: string }>
}

// Pontuação de uma publicação para plano de carreira: Qualis (artigos) ou peso por tipo,
// dividida entre os autores internos quando `fracionada`.
export function pontuacaoPublicacao(p: PubIn): number {
  const q = normalizarQualis(p.qualis)
  let base = (PESO_TIPO[p.tipo] ?? 0.1) * 10
  if (p.tipo === 'ARTIGO' || p.tipo === 'TRABALHO_EVENTO') base = q ? QUALIS_PONTOS[q] * (p.tipo === 'ARTIGO' ? 1 : 0.3) : base
  if (p.jcr && p.jcr > 0) base += Math.min(30, p.jcr * 5)
  return round(base)
}

export interface Indicadores {
  total: number
  porTipo: Record<string, number>
  porAno: Record<string, number>
  porQualis: Record<string, number>
  pontuacaoTotal: number
  percentualQualisAlto: number     // A1-A4 entre artigos
  percentualComDoi: number
  mediaJcr: number | null
  comDiscentes: number             // publicações com coautoria discente
  docentesAtivos: number
  mediaPorDocente: number
  porDocente: Array<{ userId: string; nome?: string; total: number; artigos: number; pontuacao: number; pontuacaoFracionada: number }>
}

export function indicadoresProducao(pubs: PubIn[], filtro: { anoInicio?: number; anoFim?: number; programId?: string; grupoId?: string; userId?: string } = {}): Indicadores {
  const lista = pubs.filter(
    (p) =>
      (filtro.anoInicio == null || p.ano >= filtro.anoInicio) &&
      (filtro.anoFim == null || p.ano <= filtro.anoFim) &&
      (!filtro.programId || p.programId === filtro.programId) &&
      (!filtro.grupoId || p.grupoId === filtro.grupoId) &&
      (!filtro.userId || p.autores.some((a) => a.userId === filtro.userId)),
  )
  const porTipo: Record<string, number> = {}
  const porAno: Record<string, number> = {}
  const porQualis: Record<string, number> = {}
  const docentes = new Map<string, { userId: string; nome?: string; total: number; artigos: number; pontuacao: number; pontuacaoFracionada: number }>()
  let pontuacaoTotal = 0
  let artigos = 0
  let altos = 0
  let comDoi = 0
  let comDiscentes = 0
  const jcrs: number[] = []
  for (const p of lista) {
    porTipo[p.tipo] = (porTipo[p.tipo] ?? 0) + 1
    porAno[p.ano] = (porAno[p.ano] ?? 0) + 1
    const q = normalizarQualis(p.qualis)
    if (q) porQualis[q] = (porQualis[q] ?? 0) + 1
    if (p.tipo === 'ARTIGO') {
      artigos++
      if (q && ['A1', 'A2', 'A3', 'A4'].includes(q)) altos++
    }
    if (p.doi) comDoi++
    if (p.jcr && p.jcr > 0) jcrs.push(p.jcr)
    if (p.autores.some((a) => a.tipo === 'ALUNO')) comDiscentes++
    const pts = pontuacaoPublicacao(p)
    pontuacaoTotal += pts
    const internos = p.autores.filter((a) => a.tipo === 'DOCENTE' && a.userId)
    const vistos = new Set<string>()
    for (const a of internos) {
      if (!a.userId || vistos.has(a.userId)) continue
      vistos.add(a.userId)
      const d = docentes.get(a.userId) ?? { userId: a.userId, nome: a.nome, total: 0, artigos: 0, pontuacao: 0, pontuacaoFracionada: 0 }
      d.total++
      if (p.tipo === 'ARTIGO') d.artigos++
      d.pontuacao += pts
      d.pontuacaoFracionada += pts / Math.max(1, internos.length)
      docentes.set(a.userId, d)
    }
  }
  const porDocente = [...docentes.values()]
    .map((d) => ({ ...d, pontuacao: round(d.pontuacao), pontuacaoFracionada: round(d.pontuacaoFracionada) }))
    .sort((a, b) => b.pontuacao - a.pontuacao)
  return {
    total: lista.length,
    porTipo,
    porAno,
    porQualis,
    pontuacaoTotal: round(pontuacaoTotal),
    percentualQualisAlto: artigos ? round((altos / artigos) * 100, 1) : 0,
    percentualComDoi: lista.length ? round((comDoi / lista.length) * 100, 1) : 0,
    mediaJcr: jcrs.length ? round(jcrs.reduce((a, b) => a + b, 0) / jcrs.length) : null,
    comDiscentes,
    docentesAtivos: porDocente.length,
    mediaPorDocente: porDocente.length ? round(lista.length / porDocente.length) : 0,
    porDocente,
  }
}

// ---------- máquinas de estado ----------
export type Transicoes<S extends string> = Record<S, S[]>

export function podeTransicionar<S extends string>(mapa: Transicoes<S>, de: S, para: S): boolean {
  return (mapa[de] ?? []).includes(para)
}

export const TRANSICOES_SUBMISSAO: Transicoes<string> = {
  SUBMETIDO: ['TRIAGEM', 'REJEITADO', 'RETIRADO'],
  TRIAGEM: ['EM_REVISAO', 'ACEITO', 'REJEITADO', 'SUBMETIDO', 'RETIRADO'],
  EM_REVISAO: ['REVISOES_SOLICITADAS', 'ACEITO', 'REJEITADO', 'RETIRADO'],
  REVISOES_SOLICITADAS: ['EM_REVISAO', 'ACEITO', 'REJEITADO', 'RETIRADO'],
  ACEITO: ['EDITORACAO', 'RETIRADO'],
  REJEITADO: [],
  EDITORACAO: ['PUBLICADO', 'ACEITO'],
  PUBLICADO: [],
  RETIRADO: [],
}

export const TRANSICOES_TRABALHO: Transicoes<string> = {
  TEMA: ['ORIENTACAO', 'CANCELADO'],
  ORIENTACAO: ['PROJETO', 'TEMA', 'CANCELADO'],
  PROJETO: ['QUALIFICACAO', 'BANCA_AGENDADA', 'CANCELADO'],
  QUALIFICACAO: ['PROJETO', 'BANCA_AGENDADA', 'CANCELADO'],
  BANCA_AGENDADA: ['DEFESA', 'PROJETO', 'CANCELADO'],
  DEFESA: ['VERSAO_FINAL', 'REPROVADO', 'BANCA_AGENDADA'],
  VERSAO_FINAL: ['DEPOSITADO', 'DEFESA'],
  DEPOSITADO: [],
  REPROVADO: ['TEMA'],
  CANCELADO: [],
}

export const TRANSICOES_PROJETO: Transicoes<string> = {
  RASCUNHO: ['SUBMETIDO', 'CANCELADO'],
  SUBMETIDO: ['EM_AVALIACAO', 'RASCUNHO', 'CANCELADO'],
  EM_AVALIACAO: ['APROVADO', 'REPROVADO', 'SUBMETIDO'],
  APROVADO: ['EM_EXECUCAO', 'CANCELADO'],
  EM_EXECUCAO: ['SUSPENSO', 'CONCLUIDO', 'CANCELADO'],
  SUSPENSO: ['EM_EXECUCAO', 'CANCELADO'],
  CONCLUIDO: [],
  CANCELADO: [],
  REPROVADO: ['RASCUNHO'],
}

export const TRANSICOES_EDITAL: Transicoes<string> = {
  RASCUNHO: ['ABERTO'],
  ABERTO: ['EM_AVALIACAO', 'RASCUNHO'],
  EM_AVALIACAO: ['RESULTADO_PUBLICADO', 'ABERTO'],
  RESULTADO_PUBLICADO: ['ENCERRADO'],
  ENCERRADO: [],
}

export const TRANSICOES_EVENTO_TRABALHO: Transicoes<string> = {
  SUBMETIDO: ['EM_AVALIACAO', 'RETIRADO'],
  EM_AVALIACAO: ['APROVADO', 'APROVADO_COM_AJUSTES', 'REPROVADO', 'RETIRADO'],
  APROVADO: ['CAMERA_READY', 'RETIRADO'],
  APROVADO_COM_AJUSTES: ['CAMERA_READY', 'RETIRADO'],
  REPROVADO: [],
  CAMERA_READY: ['PUBLICADO_ANAIS', 'RETIRADO'],
  PUBLICADO_ANAIS: [],
  RETIRADO: [],
}

// Pendências para avançar o ciclo do TCC/dissertação/tese.
export interface TrabalhoEstado {
  tipo: string
  status: string
  orientadorUserId?: string | null
  dataDefesa?: Date | null
  similaridadeStatus?: string
  resultado?: string | null
  autorizaPublicacao?: boolean
  repositorioUrl?: string | null
  versoes: Array<{ tipo: string }>
  banca: Array<{ fase: string; papel: string; convite: string; nota?: number | null }>
  exigeQualificacao: boolean
}

export function pendenciasTrabalho(t: TrabalhoEstado, para: string): string[] {
  const p: string[] = []
  const bancaDefesa = t.banca.filter((b) => b.fase === 'DEFESA' && b.papel !== 'SUPLENTE')
  const minBanca = t.tipo === 'TESE' ? 5 : t.tipo === 'DISSERTACAO' ? 3 : 2
  if (para === 'PROJETO' && !t.orientadorUserId) p.push('Definir o orientador.')
  if (para === 'ORIENTACAO' && !t.orientadorUserId) p.push('Definir o orientador antes de iniciar a orientação.')
  if (para === 'QUALIFICACAO' && !t.versoes.some((v) => v.tipo === 'PROJETO' || v.tipo === 'QUALIFICACAO')) p.push('Anexar a versão do projeto/texto para qualificação.')
  if (para === 'BANCA_AGENDADA') {
    if (t.exigeQualificacao && t.status !== 'QUALIFICACAO' && !t.versoes.some((v) => v.tipo === 'QUALIFICACAO')) p.push('Qualificação obrigatória para este nível.')
    if (!t.dataDefesa) p.push('Informar data da defesa.')
    if (bancaDefesa.length < minBanca) p.push(`Banca de defesa precisa de ao menos ${minBanca} membros titulares.`)
    if (!bancaDefesa.some((b) => b.papel === 'PRESIDENTE')) p.push('Banca sem presidente (orientador).')
    if (t.tipo === 'DISSERTACAO' || t.tipo === 'TESE') {
      if (!bancaDefesa.some((b) => b.papel === 'EXAMINADOR_EXTERNO')) p.push('Pós stricto sensu exige examinador externo.')
    }
    if (!t.versoes.some((v) => v.tipo === 'DEFESA')) p.push('Anexar versão do texto para defesa.')
  }
  if (para === 'DEFESA') {
    if (bancaDefesa.some((b) => b.convite === 'RECUSADO')) p.push('Há membro de banca que recusou o convite — substituir.')
    if (bancaDefesa.some((b) => b.convite === 'PENDENTE')) p.push('Há convites de banca ainda pendentes.')
    if (t.similaridadeStatus === 'NAO_VERIFICADA') p.push('Verificação de similaridade não realizada.')
    if (t.similaridadeStatus === 'REPROVADA') p.push('Similaridade acima do limite — justificar ou revisar o texto.')
  }
  if (para === 'VERSAO_FINAL' && !(t.resultado === 'APROVADO' || t.resultado === 'APROVADO_COM_RESSALVAS')) p.push('Registrar o resultado da defesa (aprovado).')
  if (para === 'DEPOSITADO') {
    if (!t.versoes.some((v) => v.tipo === 'FINAL')) p.push('Anexar a versão final corrigida.')
    if (t.similaridadeStatus === 'REPROVADA') p.push('Similaridade pendente de justificativa.')
    if (!t.repositorioUrl) p.push('Informar o link/handle do repositório institucional.')
    if (t.autorizaPublicacao === undefined) p.push('Registrar a autorização de publicação.')
  }
  return p
}

export function calcularResultadoBanca(
  membros: Array<{ papel: string; nota?: number | null }>,
  opts: { notaMinima?: number; pesoPresidente?: number } = {},
): { media: number | null; resultado: 'APROVADO' | 'REPROVADO' | null; avaliadores: number; pendentes: number } {
  const titulares = membros.filter((m) => m.papel !== 'SUPLENTE')
  const com = titulares.filter((m) => typeof m.nota === 'number')
  const pendentes = titulares.length - com.length
  if (!com.length || pendentes > 0) return { media: null, resultado: null, avaliadores: com.length, pendentes }
  const pesoP = opts.pesoPresidente ?? 1
  let soma = 0
  let pesos = 0
  for (const m of com) {
    const w = m.papel === 'PRESIDENTE' ? pesoP : 1
    soma += (m.nota as number) * w
    pesos += w
  }
  const media = round(soma / pesos)
  return { media, resultado: media >= (opts.notaMinima ?? 7) ? 'APROVADO' : 'REPROVADO', avaliadores: com.length, pendentes: 0 }
}

// ---------- similaridade (trechos repetidos) ----------
function tokens(s: string) {
  return normalizarTexto(s).split(' ').filter(Boolean)
}

export function shingles(texto: string, n = 6): Set<string> {
  const t = tokens(texto)
  const out = new Set<string>()
  for (let i = 0; i + n <= t.length; i++) out.add(t.slice(i, i + n).join(' '))
  return out
}

// Percentual do texto A coberto por trechos (n-gramas) presentes em algum texto-fonte.
export function similaridadeTexto(texto: string, fontes: Array<{ id: string; texto: string }>, n = 6) {
  const alvo = tokens(texto)
  if (alvo.length < n) return { percentual: 0, porFonte: [] as Array<{ id: string; percentual: number }>, trechos: [] as string[] }
  const sh = alvo.map((_, i) => (i + n <= alvo.length ? alvo.slice(i, i + n).join(' ') : null))
  const cobertas = new Set<number>()
  const porFonte: Array<{ id: string; percentual: number }> = []
  const trechosSet = new Set<number>()
  for (const f of fontes) {
    const fs = shingles(f.texto, n)
    const cob = new Set<number>()
    sh.forEach((s, i) => {
      if (s && fs.has(s)) {
        for (let k = i; k < i + n; k++) cob.add(k)
        trechosSet.add(i)
      }
    })
    cob.forEach((k) => cobertas.add(k))
    if (cob.size) porFonte.push({ id: f.id, percentual: round((cob.size / alvo.length) * 100, 1) })
  }
  // junta janelas consecutivas em trechos legíveis
  const idx = [...trechosSet].sort((a, b) => a - b)
  const trechos: string[] = []
  let ini = -1
  let fim = -1
  for (const i of idx) {
    if (ini < 0) { ini = i; fim = i + n; continue }
    if (i <= fim) fim = Math.max(fim, i + n)
    else { trechos.push(alvo.slice(ini, fim).join(' ')); ini = i; fim = i + n }
  }
  if (ini >= 0) trechos.push(alvo.slice(ini, fim).join(' '))
  return { percentual: round((cobertas.size / alvo.length) * 100, 1), porFonte: porFonte.sort((a, b) => b.percentual - a.percentual), trechos: trechos.slice(0, 50) }
}

export function statusSimilaridade(pct: number, limite: number): 'APROVADA' | 'REPROVADA' {
  return pct > limite ? 'REPROVADA' : 'APROVADA'
}

// ---------- prazos escalonados (TCC) ----------
export interface PrazoEscalonado { chave: string; titulo: string; dueAt: Date; severity: 'INFO' | 'ATENCAO' | 'CRITICO'; papel: 'ALUNO' | 'ORIENTADOR' | 'BANCA' | 'COORDENACAO'; antecedenciaDias: number }

export function prazosDefesa(dataDefesa: Date, opts: { posDefesaVersaoFinalDias?: number; posDefesaDepositoDias?: number } = {}): PrazoEscalonado[] {
  const vf = opts.posDefesaVersaoFinalDias ?? 30
  const dep = opts.posDefesaDepositoDias ?? 45
  return [
    { chave: 'convites', titulo: 'Confirmar convites da banca de defesa', dueAt: addDays(dataDefesa, -30), severity: 'ATENCAO', papel: 'ORIENTADOR', antecedenciaDias: 7 },
    { chave: 'texto-banca', titulo: 'Entregar o texto à banca examinadora', dueAt: addDays(dataDefesa, -15), severity: 'CRITICO', papel: 'ALUNO', antecedenciaDias: 5 },
    { chave: 'similaridade', titulo: 'Concluir verificação de similaridade', dueAt: addDays(dataDefesa, -10), severity: 'ATENCAO', papel: 'ORIENTADOR', antecedenciaDias: 3 },
    { chave: 'confirmacao', titulo: 'Confirmação final de presença da banca', dueAt: addDays(dataDefesa, -7), severity: 'ATENCAO', papel: 'COORDENACAO', antecedenciaDias: 2 },
    { chave: 'vespera', titulo: 'Defesa amanhã — confirmar sala/link e equipamentos', dueAt: addDays(dataDefesa, -1), severity: 'CRITICO', papel: 'COORDENACAO', antecedenciaDias: 1 },
    { chave: 'versao-final', titulo: 'Entregar a versão final corrigida', dueAt: addDays(dataDefesa, vf), severity: 'CRITICO', papel: 'ALUNO', antecedenciaDias: 10 },
    { chave: 'deposito', titulo: 'Depositar o trabalho no repositório institucional', dueAt: addDays(dataDefesa, dep), severity: 'CRITICO', papel: 'ALUNO', antecedenciaDias: 10 },
  ]
}

// ---------- editais ----------
export interface CriterioEdital { nome: string; peso: number; notaMax?: number }

// Nota ponderada normalizada para 0..10.
export function calcularNotaAvaliacao(notas: Record<string, number>, criterios: CriterioEdital[]): { total: number; faltando: string[]; invalidas: string[] } {
  if (!criterios.length) {
    const v = Object.values(notas)
    return { total: v.length ? round(v.reduce((a, b) => a + b, 0) / v.length) : 0, faltando: [], invalidas: [] }
  }
  let soma = 0
  let pesos = 0
  const faltando: string[] = []
  const invalidas: string[] = []
  for (const c of criterios) {
    const max = c.notaMax ?? 10
    const n = notas[c.nome]
    if (typeof n !== 'number') { faltando.push(c.nome); continue }
    if (n < 0 || n > max) { invalidas.push(c.nome); continue }
    soma += (n / max) * 10 * c.peso
    pesos += c.peso
  }
  return { total: pesos ? round(soma / pesos) : 0, faltando, invalidas }
}

export interface InscricaoRank { id: string; notaFinal: number | null; status: string; primeiroCriterio?: number; createdAt: Date }

export function classificarInscricoes(insc: InscricaoRank[], cfg: { vagas: number; vagasSuplentes: number; notaMinima: number }) {
  const aptas = insc.filter((i) => i.notaFinal != null && i.status !== 'INDEFERIDA')
  aptas.sort((a, b) => (b.notaFinal! - a.notaFinal!) || ((b.primeiroCriterio ?? 0) - (a.primeiroCriterio ?? 0)) || a.createdAt.getTime() - b.createdAt.getTime())
  const out: Array<{ id: string; classificacao: number | null; status: 'CONTEMPLADA' | 'SUPLENTE' | 'NAO_CONTEMPLADA' }> = []
  let pos = 0
  for (const i of aptas) {
    pos++
    if ((i.notaFinal as number) < cfg.notaMinima) out.push({ id: i.id, classificacao: pos, status: 'NAO_CONTEMPLADA' })
    else if (pos <= cfg.vagas) out.push({ id: i.id, classificacao: pos, status: 'CONTEMPLADA' })
    else if (pos <= cfg.vagas + cfg.vagasSuplentes) out.push({ id: i.id, classificacao: pos, status: 'SUPLENTE' })
    else out.push({ id: i.id, classificacao: pos, status: 'NAO_CONTEMPLADA' })
  }
  return out
}

// ---------- bolsas ----------
export function competenciasBolsa(inicio: Date, fim: Date): string[] {
  const out: string[] = []
  let y = inicio.getUTCFullYear()
  let m = inicio.getUTCMonth()
  const yf = fim.getUTCFullYear()
  const mf = fim.getUTCMonth()
  while (y < yf || (y === yf && m <= mf)) {
    out.push(`${y}-${String(m + 1).padStart(2, '0')}`)
    m++
    if (m > 11) { m = 0; y++ }
  }
  return out
}

// ---------- projetos: cronograma e orçamento ----------
export function situacaoEtapa(e: { fimPrevisto: Date; status: string; percentual: number }, agora = new Date()): string {
  if (e.status === 'CONCLUIDA' || e.percentual >= 100) return 'CONCLUIDA'
  if (e.fimPrevisto.getTime() < agora.getTime()) return 'ATRASADA'
  return e.percentual > 0 || e.status === 'EM_ANDAMENTO' ? 'EM_ANDAMENTO' : 'PLANEJADA'
}

// Progresso ponderado pela duração planejada de cada etapa.
export function progressoProjeto(etapas: Array<{ inicioPrevisto: Date; fimPrevisto: Date; percentual: number }>): number {
  if (!etapas.length) return 0
  let tot = 0
  let acc = 0
  for (const e of etapas) {
    const dur = Math.max(1, diffDays(e.fimPrevisto, e.inicioPrevisto))
    tot += dur
    acc += dur * Math.min(100, Math.max(0, e.percentual))
  }
  return round(acc / tot, 1)
}

export function resumoOrcamento(rubricas: Array<{ id: string; categoria: string; descricao: string; valorPrevisto: number }>, lancamentos: Array<{ rubricaId: string; valor: number }>, orcamentoTotal?: number) {
  const gasto = new Map<string, number>()
  for (const l of lancamentos) gasto.set(l.rubricaId, (gasto.get(l.rubricaId) ?? 0) + l.valor)
  const linhas = rubricas.map((r) => {
    const exec = round(gasto.get(r.id) ?? 0)
    return { ...r, executado: exec, saldo: round(r.valorPrevisto - exec), percentual: r.valorPrevisto ? round((exec / r.valorPrevisto) * 100, 1) : exec > 0 ? 100 : 0, estourou: exec > r.valorPrevisto + 0.005 }
  })
  const previsto = round(rubricas.reduce((a, r) => a + r.valorPrevisto, 0))
  const executado = round(linhas.reduce((a, r) => a + r.executado, 0))
  const alertas: string[] = []
  if (orcamentoTotal != null && previsto > orcamentoTotal + 0.005) alertas.push(`Soma das rubricas (${previsto.toFixed(2)}) excede o orçamento aprovado (${orcamentoTotal.toFixed(2)}).`)
  for (const l of linhas) if (l.estourou) alertas.push(`Rubrica "${l.descricao}" estourou em ${(-l.saldo).toFixed(2)}.`)
  return { previsto, executado, saldo: round(previsto - executado), percentualExecutado: previsto ? round((executado / previsto) * 100, 1) : 0, linhas, alertas }
}

// Gera os relatórios obrigatórios: parcial a cada 6 meses e final 30 dias após o término.
export function relatoriosObrigatorios(inicio: Date, fim: Date, opts: { intervaloMeses?: number; diasFinal?: number } = {}) {
  const intervalo = opts.intervaloMeses ?? 6
  const out: Array<{ tipo: 'PARCIAL' | 'FINAL'; referencia: string; prazo: Date }> = []
  let n = 1
  const d = new Date(inicio)
  while (true) {
    d.setUTCMonth(d.getUTCMonth() + intervalo)
    if (d.getTime() >= fim.getTime()) break
    out.push({ tipo: 'PARCIAL', referencia: `Parcial ${n}`, prazo: new Date(d) })
    n++
  }
  out.push({ tipo: 'FINAL', referencia: 'Final', prazo: addDays(fim, opts.diasFinal ?? 30) })
  return out
}

// ---------- periódico ----------
export interface SubEstat {
  status: string
  dataSubmissao: Date
  dataDecisao?: Date | null
  dataPublicacao?: Date | null
  rodada?: number
  motivoRejeicao?: string | null
  edicaoAno?: number
}

export function estatisticasPeriodico(subs: SubEstat[]) {
  const porStatus: Record<string, number> = {}
  for (const s of subs) porStatus[s.status] = (porStatus[s.status] ?? 0) + 1
  const aceitosSet = ['ACEITO', 'EDITORACAO', 'PUBLICADO']
  const aceitos = subs.filter((s) => aceitosSet.includes(s.status)).length
  const rejeitados = subs.filter((s) => s.status === 'REJEITADO').length
  const decididos = aceitos + rejeitados
  const tempos = subs.filter((s) => s.dataDecisao).map((s) => diffDays(s.dataDecisao as Date, s.dataSubmissao))
  const temposPub = subs.filter((s) => s.dataPublicacao).map((s) => diffDays(s.dataPublicacao as Date, s.dataSubmissao))
  const med = (a: number[]) => (a.length ? round(a.reduce((x, y) => x + y, 0) / a.length, 1) : null)
  const sorted = [...tempos].sort((a, b) => a - b)
  const mediana = sorted.length ? round(sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2, 1) : null
  return {
    total: subs.length,
    porStatus,
    decididos,
    aceitos,
    rejeitados,
    taxaAceitacao: decididos ? round((aceitos / decididos) * 100, 1) : null,
    taxaRejeicao: decididos ? round((rejeitados / decididos) * 100, 1) : null,
    tempoMedioDecisaoDias: med(tempos),
    tempoMedianoDecisaoDias: mediana,
    tempoMedioAtePublicacaoDias: med(temposPub),
    emAndamento: subs.filter((s) => ['SUBMETIDO', 'TRIAGEM', 'EM_REVISAO', 'REVISOES_SOLICITADAS'].includes(s.status)).length,
  }
}

export interface CandidatoRevisor { id: string; nome: string; email?: string | null; instituicao?: string | null; areas: string[]; cargaAtual: number; userId?: string | null; jaAtribuido?: boolean }

const norm = (s?: string | null) => normalizarTexto(s ?? '')

// Ranqueia pareceristas e descarta conflitos de interesse (autor, mesma instituição de algum autor).
export function sugerirRevisores(
  candidatos: CandidatoRevisor[],
  sub: { areas: string[]; autores: Array<{ nome?: string; email?: string; afiliacao?: string }>; submissorUserId?: string | null },
  opts: { cargaMax?: number } = {},
) {
  const cargaMax = opts.cargaMax ?? 5
  const nomes = sub.autores.map((a) => norm(a.nome)).filter(Boolean)
  const emails = sub.autores.map((a) => norm(a.email)).filter(Boolean)
  const afil = sub.autores.map((a) => norm(a.afiliacao)).filter(Boolean)
  const areasSub = sub.areas.map(norm)
  const out = candidatos.map((c) => {
    const motivos: string[] = []
    if (c.jaAtribuido) motivos.push('já atribuído nesta rodada')
    if (nomes.includes(norm(c.nome))) motivos.push('é autor do manuscrito')
    if (c.email && emails.includes(norm(c.email))) motivos.push('e-mail coincide com autor')
    if (c.userId && sub.submissorUserId && c.userId === sub.submissorUserId) motivos.push('é o submissor')
    const inst = norm(c.instituicao)
    if (inst && afil.some((a) => a === inst)) motivos.push('mesma instituição de um autor (conflito potencial)')
    if (c.cargaAtual >= cargaMax) motivos.push(`carga máxima (${cargaMax}) atingida`)
    const afinidade = c.areas.map(norm).filter((a) => areasSub.some((s) => s && (a.includes(s) || s.includes(a)))).length
    const score = afinidade * 10 - c.cargaAtual * 2
    return { ...c, afinidade, score, bloqueado: motivos.length > 0, motivos }
  })
  return out.sort((a, b) => Number(a.bloqueado) - Number(b.bloqueado) || b.score - a.score)
}

export const CRITERIOS_PARECER = ['originalidade', 'metodologia', 'relevancia', 'clareza', 'referencias'] as const

export function mediaParecer(notas?: Record<string, number> | null): number | null {
  if (!notas) return null
  const v = CRITERIOS_PARECER.map((c) => notas[c]).filter((n) => typeof n === 'number')
  return v.length ? round(v.reduce((a, b) => a + b, 0) / v.length) : null
}

export function validarNotasParecer(notas: Record<string, number>): string[] {
  const erros: string[] = []
  for (const c of CRITERIOS_PARECER) {
    const n = notas[c]
    if (typeof n !== 'number') erros.push(`Nota "${c}" ausente.`)
    else if (n < 1 || n > 5) erros.push(`Nota "${c}" deve estar entre 1 e 5.`)
  }
  return erros
}

type Rec = 'ACEITAR' | 'REVISOES_MENORES' | 'REVISOES_MAIORES' | 'REJEITAR'
const SEVERIDADE: Record<Rec, number> = { ACEITAR: 0, REVISOES_MENORES: 1, REVISOES_MAIORES: 2, REJEITAR: 3 }

// Sugere a decisão do editor a partir dos pareceres concluídos (o editor decide).
export function consolidarRecomendacoes(recs: Rec[]): { sugestao: Rec | null; divergente: boolean; contagem: Record<string, number>; motivo: string } {
  const contagem: Record<string, number> = {}
  for (const r of recs) contagem[r] = (contagem[r] ?? 0) + 1
  if (!recs.length) return { sugestao: null, divergente: false, contagem, motivo: 'Sem pareceres concluídos.' }
  const niveis = recs.map((r) => SEVERIDADE[r])
  const divergente = Math.max(...niveis) - Math.min(...niveis) >= 2
  if (divergente && recs.length < 3) return { sugestao: null, divergente, contagem, motivo: 'Pareceres divergentes: convidar um terceiro parecerista.' }
  const media = niveis.reduce((a, b) => a + b, 0) / niveis.length
  const alvo = (Object.keys(SEVERIDADE) as Rec[]).reduce((best, r) => (Math.abs(SEVERIDADE[r] - media) < Math.abs(SEVERIDADE[best] - media) ? r : best), 'ACEITAR' as Rec)
  // a maioria rejeitando prevalece
  const rej = recs.filter((r) => r === 'REJEITAR').length
  const sugestao: Rec = rej > recs.length / 2 ? 'REJEITAR' : alvo
  return { sugestao, divergente, contagem, motivo: divergente ? 'Pareceres divergentes; sugestão pela média ponderada.' : 'Pareceres consistentes.' }
}

export const DECISAO_PARA_STATUS: Record<string, string> = {
  ACEITAR: 'ACEITO',
  REVISOES_MENORES: 'REVISOES_SOLICITADAS',
  REVISOES_MAIORES: 'REVISOES_SOLICITADAS',
  REJEITAR: 'REJEITADO',
  REJEITAR_TRIAGEM: 'REJEITADO',
}

// Remove identidade dos autores/revisores para visão duplo-cego.
export function anonimizarSubmissao<T extends { autores?: any; submissorUserId?: any; submissorStudentId?: any; conflitoInteresse?: any; financiamento?: any }>(s: T): Omit<T, 'autores' | 'submissorUserId' | 'submissorStudentId' | 'financiamento'> & { autores: null } {
  const { autores: _a, submissorUserId: _u, submissorStudentId: _s, financiamento: _f, ...resto } = s as any
  return { ...resto, autores: null }
}

export function citarArtigo(a: { autores: string[]; titulo: string; periodico: string; volume?: number | null; numero?: string | null; paginas?: string | null; ano: number; doi?: string | null }): string {
  const aut = a.autores.map((n) => {
    const p = n.trim().split(/\s+/)
    return p.length > 1 ? `${p[p.length - 1].toUpperCase()}, ${p.slice(0, -1).map((x) => x[0] + '.').join(' ')}` : n.toUpperCase()
  })
  const autStr = aut.length > 3 ? `${aut[0]} et al.` : aut.join('; ')
  return `${autStr}. ${a.titulo}. ${a.periodico}, ${a.volume ? 'v. ' + a.volume + ', ' : ''}${a.numero ? 'n. ' + a.numero + ', ' : ''}${a.paginas ? 'p. ' + a.paginas + ', ' : ''}${a.ano}.${a.doi ? ' DOI: ' + a.doi + '.' : ''}`
}

// ---------- eventos ----------
export function decidirTrabalhoEvento(notas: number[], minimo: number, avaliadoresEsperados: number): { media: number | null; decisao: 'APROVADO' | 'APROVADO_COM_AJUSTES' | 'REPROVADO' | null } {
  if (notas.length < avaliadoresEsperados || !notas.length) return { media: null, decisao: null }
  const media = round(notas.reduce((a, b) => a + b, 0) / notas.length)
  if (media >= minimo + 1.5) return { media, decisao: 'APROVADO' }
  if (media >= minimo) return { media, decisao: 'APROVADO_COM_AJUSTES' }
  return { media, decisao: 'REPROVADO' }
}

// Distribui trabalhos entre avaliadores em round-robin balanceado, evitando conflitos (autor = avaliador).
export function distribuirAvaliacoes(
  trabalhos: Array<{ id: string; autoresUserIds: string[]; trilha?: string | null }>,
  avaliadores: Array<{ userId: string; nome?: string; trilhas?: string[]; cargaAtual?: number }>,
  porTrabalho: number,
): { atribuicoes: Array<{ trabalhoId: string; avaliadorUserId: string }>; semAvaliadores: string[] } {
  const carga = new Map(avaliadores.map((a) => [a.userId, a.cargaAtual ?? 0]))
  const atribuicoes: Array<{ trabalhoId: string; avaliadorUserId: string }> = []
  const sem: string[] = []
  for (const t of trabalhos) {
    const aptos = avaliadores
      .filter((a) => !t.autoresUserIds.includes(a.userId) && (!a.trilhas?.length || !t.trilha || a.trilhas.includes(t.trilha)))
      .sort((a, b) => (carga.get(a.userId) as number) - (carga.get(b.userId) as number))
      .slice(0, porTrabalho)
    if (aptos.length < porTrabalho) sem.push(t.id)
    for (const a of aptos) {
      atribuicoes.push({ trabalhoId: t.id, avaliadorUserId: a.userId })
      carga.set(a.userId, (carga.get(a.userId) as number) + 1)
    }
  }
  return { atribuicoes, semAvaliadores: sem }
}

export function novoToken(): string {
  return randomBytes(24).toString('hex')
}
