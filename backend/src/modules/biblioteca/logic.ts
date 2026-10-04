// Funções PURAS do módulo biblioteca (sem acesso a banco) — testadas em __selftest__.ts

const DAY = 86_400_000

export type Perfil = 'ALUNO' | 'PROFESSOR' | 'FUNCIONARIO' | 'EXTERNO'

export interface PoliticaCirc {
  prazoDias: number
  limiteEmprestimos: number
  maxRenovacoes: number
  diasRenovacao?: number | null
  multaDia: number
  multaMaxima?: number | null
  limiteReservas: number
  diasRetiradaReserva: number
  bloqueioDiasPorAtraso: number
}

export const POLITICAS_PADRAO: Record<Perfil, PoliticaCirc> = {
  ALUNO: { prazoDias: 7, limiteEmprestimos: 3, maxRenovacoes: 2, diasRenovacao: 7, multaDia: 1, multaMaxima: null, limiteReservas: 2, diasRetiradaReserva: 3, bloqueioDiasPorAtraso: 1 },
  PROFESSOR: { prazoDias: 15, limiteEmprestimos: 6, maxRenovacoes: 3, diasRenovacao: 15, multaDia: 1, multaMaxima: null, limiteReservas: 4, diasRetiradaReserva: 3, bloqueioDiasPorAtraso: 0 },
  FUNCIONARIO: { prazoDias: 10, limiteEmprestimos: 3, maxRenovacoes: 2, diasRenovacao: 10, multaDia: 1, multaMaxima: null, limiteReservas: 2, diasRetiradaReserva: 3, bloqueioDiasPorAtraso: 0 },
  EXTERNO: { prazoDias: 7, limiteEmprestimos: 2, maxRenovacoes: 1, diasRenovacao: 7, multaDia: 2, multaMaxima: null, limiteReservas: 1, diasRetiradaReserva: 2, bloqueioDiasPorAtraso: 1 },
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export function isoDay(d: Date) {
  return d.toISOString().slice(0, 10)
}

function isDiaUtil(d: Date, feriados: Set<string>) {
  const w = d.getUTCDay()
  return w !== 0 && w !== 6 && !feriados.has(isoDay(d))
}

// Soma `dias` ao dia; se somenteUteis, avança só em dias úteis (seg-sex, exceto feriados).
// Se o resultado cair em dia não útil (modo útil), empurra para o próximo útil.
export function somarDias(inicio: Date, dias: number, opts: { somenteUteis?: boolean; feriados?: string[] } = {}): Date {
  const fer = new Set(opts.feriados ?? [])
  if (!opts.somenteUteis) return new Date(inicio.getTime() + dias * DAY)
  let d = new Date(inicio.getTime())
  let restantes = Math.max(0, dias)
  while (restantes > 0) {
    d = new Date(d.getTime() + DAY)
    if (isDiaUtil(d, fer)) restantes--
  }
  while (!isDiaUtil(d, fer)) d = new Date(d.getTime() + DAY)
  return d
}

// Dias de atraso: conta dias corridos (ou úteis) após o prazo, descontada a tolerância.
export function diasDeAtraso(
  prevista: Date,
  referencia: Date,
  opts: { tolerancia?: number; somenteUteis?: boolean; feriados?: string[] } = {},
): number {
  if (referencia.getTime() <= prevista.getTime()) return 0
  const fer = new Set(opts.feriados ?? [])
  // normaliza para o dia UTC (a devolução no mesmo dia do vencimento não é atraso)
  const p = Date.UTC(prevista.getUTCFullYear(), prevista.getUTCMonth(), prevista.getUTCDate())
  const r = Date.UTC(referencia.getUTCFullYear(), referencia.getUTCMonth(), referencia.getUTCDate())
  let n = 0
  if (!opts.somenteUteis) n = Math.max(0, Math.round((r - p) / DAY))
  else {
    for (let t = p + DAY; t <= r; t += DAY) if (isDiaUtil(new Date(t), fer)) n++
  }
  return Math.max(0, n - (opts.tolerancia ?? 0))
}

export interface MultaCalc {
  diasAtraso: number
  valor: number
  limitada: boolean
}

// Multa por atraso: dias * valorDia, com teto opcional por empréstimo.
export function calcularMulta(
  prevista: Date,
  devolucao: Date,
  p: { multaDia: number; multaMaxima?: number | null },
  opts: { tolerancia?: number; somenteUteis?: boolean; feriados?: string[] } = {},
): MultaCalc {
  const dias = diasDeAtraso(prevista, devolucao, opts)
  let valor = round2(dias * Math.max(0, p.multaDia))
  let limitada = false
  if (p.multaMaxima != null && p.multaMaxima >= 0 && valor > p.multaMaxima) {
    valor = round2(p.multaMaxima)
    limitada = true
  }
  return { diasAtraso: dias, valor, limitada }
}

export interface ElegibilidadeInput {
  politica: PoliticaCirc
  leitor: { ativo: boolean; bloqueadoAte?: Date | null; validadeAte?: Date | null }
  emprestimosAtivos: number
  atrasados: number
  multasAbertasValor: number
  valorMaxMultaAberta: number
  agora?: Date
}

// Bloqueio por pendência: devolve lista de motivos (vazia = pode emprestar).
export function verificarElegibilidade(i: ElegibilidadeInput): string[] {
  const agora = i.agora ?? new Date()
  const m: string[] = []
  if (!i.leitor.ativo) m.push('Cadastro de leitor inativo.')
  if (i.leitor.validadeAte && i.leitor.validadeAte < agora) m.push('Cadastro de leitor com validade expirada.')
  if (i.leitor.bloqueadoAte && i.leitor.bloqueadoAte > agora) m.push(`Leitor suspenso até ${i.leitor.bloqueadoAte.toLocaleDateString('pt-BR')}.`)
  if (i.atrasados > 0) m.push(`Possui ${i.atrasados} empréstimo(s) em atraso.`)
  if (i.multasAbertasValor > i.valorMaxMultaAberta) m.push(`Possui multas em aberto (R$ ${i.multasAbertasValor.toFixed(2)}).`)
  if (i.emprestimosAtivos >= i.politica.limiteEmprestimos) m.push(`Limite de ${i.politica.limiteEmprestimos} empréstimo(s) simultâneo(s) atingido.`)
  return m
}

export interface RenovacaoInput {
  renovacoes: number
  maxRenovacoes: number
  status: string
  prevista: Date
  agora?: Date
  reservasAguardando: number
  leitorBloqueado?: boolean
}

export function podeRenovar(i: RenovacaoInput): { ok: boolean; motivo?: string } {
  const agora = i.agora ?? new Date()
  if (i.status !== 'ATIVO') return { ok: false, motivo: 'Empréstimo não está ativo.' }
  if (i.leitorBloqueado) return { ok: false, motivo: 'Leitor com pendências/bloqueio.' }
  if (i.prevista.getTime() < agora.getTime() - DAY) return { ok: false, motivo: 'Empréstimo em atraso: devolva a obra antes de renovar.' }
  if (i.renovacoes >= i.maxRenovacoes) return { ok: false, motivo: `Limite de ${i.maxRenovacoes} renovação(ões) atingido.` }
  if (i.reservasAguardando > 0) return { ok: false, motivo: 'Há reserva(s) na fila para esta obra.' }
  return { ok: true }
}

// Nova data prevista de uma renovação: a partir de hoje (ou do vencimento, o que for maior).
export function novaDataRenovacao(prevista: Date, agora: Date, dias: number, opts: { somenteUteis?: boolean; feriados?: string[] } = {}) {
  const base = prevista.getTime() > agora.getTime() ? prevista : agora
  return somarDias(base, dias, opts)
}

// Posição na fila de reservas (1 = próximo). Ordena por data de criação.
export function posicaoNaFila(reservas: Array<{ id: string; createdAt: Date }>, id: string): number {
  const ord = [...reservas].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
  const i = ord.findIndex((r) => r.id === id)
  return i < 0 ? 0 : i + 1
}

// Distribui exemplares livres para a fila (FIFO). Retorna pares reserva->exemplar.
export function distribuirFila(
  reservas: Array<{ id: string; createdAt: Date }>,
  exemplaresLivres: string[],
): Array<{ reservaId: string; exemplarId: string }> {
  const ord = [...reservas].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
  const out: Array<{ reservaId: string; exemplarId: string }> = []
  for (let i = 0; i < Math.min(ord.length, exemplaresLivres.length); i++) out.push({ reservaId: ord[i].id, exemplarId: exemplaresLivres[i] })
  return out
}

// ---------- ISBN ----------
export function normalizarIsbn(s?: string | null): string | null {
  if (!s) return null
  const v = String(s).replace(/[^0-9Xx]/g, '').toUpperCase()
  return v.length ? v : null
}

export function validarIsbn(s?: string | null): boolean {
  const v = normalizarIsbn(s)
  if (!v) return false
  if (v.length === 10) {
    if (/X/.test(v.slice(0, 9))) return false
    let sum = 0
    for (let i = 0; i < 10; i++) sum += (v[i] === 'X' ? 10 : Number(v[i])) * (10 - i)
    return sum % 11 === 0
  }
  if (v.length === 13) {
    if (/X/.test(v)) return false
    let sum = 0
    for (let i = 0; i < 12; i++) sum += Number(v[i]) * (i % 2 === 0 ? 1 : 3)
    return (10 - (sum % 10)) % 10 === Number(v[12])
  }
  return false
}

// ---------- CSV ----------
// Parser simples: separador ; ou , (autodetectado), aspas duplas, quebras de linha.
export function parseCsv(texto: string): Array<Record<string, string>> {
  const src = texto.replace(/^﻿/, '')
  const firstLine = src.split(/\r?\n/, 1)[0] ?? ''
  const sep = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : ','
  const rows: string[][] = []
  let cur: string[] = []
  let cell = ''
  let q = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (q) {
      if (c === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++ } else q = false
      } else cell += c
    } else if (c === '"') q = true
    else if (c === sep) { cur.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      cur.push(cell); cell = ''
      if (cur.some((x) => x.trim() !== '')) rows.push(cur)
      cur = []
    } else cell += c
  }
  cur.push(cell)
  if (cur.some((x) => x.trim() !== '')) rows.push(cur)
  if (rows.length < 2) return []
  const head = rows[0].map((h) => chaveColuna(h))
  return rows.slice(1).map((r) => {
    const o: Record<string, string> = {}
    head.forEach((h, i) => { if (h) o[h] = (r[i] ?? '').trim() })
    return o
  })
}

const SINONIMOS: Record<string, string> = {
  title: 'titulo', titulo: 'titulo', subtitulo: 'subtitulo', autor: 'autores', autores: 'autores', author: 'autores',
  editora: 'editora', publisher: 'editora', edicao: 'edicao', ano: 'ano', year: 'ano', isbn: 'isbn', issn: 'issn',
  cdd: 'cdd', cdu: 'cdu', assunto: 'assuntos', assuntos: 'assuntos', idioma: 'idioma', tipo: 'tipo', paginas: 'paginas',
  exemplares: 'exemplares', qtd: 'exemplares', quantidade: 'exemplares', tombo: 'tombo', estante: 'estante',
  prateleira: 'prateleira', localizacao: 'estante', valor: 'valor', fornecedor: 'fornecedor', resumo: 'resumo',
}

export function chaveColuna(h: string): string {
  const k = h.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '')
  return SINONIMOS[k] ?? k
}

export function listaDeTexto(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean)
  if (typeof v === 'string') return v.split(/[;|]/).map((x) => x.trim()).filter(Boolean)
  return []
}

// ---------- Adequação do acervo à matriz curricular ----------
export interface AdequacaoParams {
  minTitulosBasicos: number
  minTitulosComplementares: number
  vagasPorExemplar: number     // 1 exemplar a cada N vagas
}

export interface TituloVinculado {
  obraId: string
  titulo: string
  tipo: 'BASICA' | 'COMPLEMENTAR'
  exemplares: number           // exemplares físicos disponíveis no acervo (não baixados)
  virtual: boolean             // existe recurso virtual ativo equivalente
}

export interface AdequacaoDisciplina {
  basicos: number
  complementares: number
  vagas: number
  exemplaresNecessariosPorTitulo: number
  lacunas: Array<{ codigo: string; mensagem: string; faltam?: number; obraId?: string }>
  status: 'ADEQUADA' | 'PARCIAL' | 'INADEQUADA'
  indice: number               // 0..100
}

// Regra: (1) >= minTitulosBasicos títulos básicos; (2) >= minTitulosComplementares complementares;
// (3) exemplares totais da básica >= ceil(vagas/vagasPorExemplar), distribuídos por título
// (título com acesso virtual ativo conta como atendido). Status: sem lacunas = ADEQUADA;
// índice >= 60 = PARCIAL; senão INADEQUADA.
export function avaliarAdequacao(titulos: TituloVinculado[], vagas: number, p: AdequacaoParams): AdequacaoDisciplina {
  const basicos = titulos.filter((t) => t.tipo === 'BASICA')
  const compl = titulos.filter((t) => t.tipo === 'COMPLEMENTAR')
  const lacunas: AdequacaoDisciplina['lacunas'] = []
  const totalNecessario = vagas > 0 && p.vagasPorExemplar > 0 ? Math.ceil(vagas / p.vagasPorExemplar) : 0
  const base = Math.max(basicos.length, p.minTitulosBasicos, 1)
  const porTitulo = totalNecessario > 0 ? Math.ceil(totalNecessario / base) : 0

  if (basicos.length < p.minTitulosBasicos)
    lacunas.push({ codigo: 'TITULOS_BASICOS', mensagem: `Faltam ${p.minTitulosBasicos - basicos.length} título(s) na bibliografia básica.`, faltam: p.minTitulosBasicos - basicos.length })
  if (compl.length < p.minTitulosComplementares)
    lacunas.push({ codigo: 'TITULOS_COMPLEMENTARES', mensagem: `Faltam ${p.minTitulosComplementares - compl.length} título(s) na bibliografia complementar.`, faltam: p.minTitulosComplementares - compl.length })

  let atendidos = 0
  for (const t of basicos) {
    if (t.virtual || porTitulo === 0 || t.exemplares >= porTitulo) atendidos++
    else lacunas.push({ codigo: 'EXEMPLARES', mensagem: `"${t.titulo}": ${t.exemplares} exemplar(es) para ${porTitulo} necessário(s) (${vagas} vagas, 1/${p.vagasPorExemplar}).`, faltam: porTitulo - t.exemplares, obraId: t.obraId })
  }
  const sem = [...basicos, ...compl].filter((t) => !t.virtual && t.exemplares === 0)
  for (const t of compl) if (!t.virtual && t.exemplares === 0) lacunas.push({ codigo: 'SEM_EXEMPLAR', mensagem: `"${t.titulo}" (complementar) sem exemplar no acervo.`, faltam: 1, obraId: t.obraId })
  void sem

  const fTb = Math.min(1, basicos.length / Math.max(1, p.minTitulosBasicos))
  const fTc = Math.min(1, compl.length / Math.max(1, p.minTitulosComplementares))
  const fEx = basicos.length ? atendidos / basicos.length : 0
  const indice = Math.round((fTb * 0.4 + fEx * 0.4 + fTc * 0.2) * 100)
  const status = lacunas.length === 0 ? 'ADEQUADA' : indice >= 60 ? 'PARCIAL' : 'INADEQUADA'
  return { basicos: basicos.length, complementares: compl.length, vagas, exemplaresNecessariosPorTitulo: porTitulo, lacunas, status, indice }
}

// ---------- Repositório / catalogação ----------
export type AcessoRepositorio = 'ABERTO' | 'RESTRITO' | 'EMBARGADO' | 'INDISPONIVEL'

export function situacaoAcesso(i: { status: string; embargoAte?: Date | null; restrito?: boolean }, agora = new Date()): AcessoRepositorio {
  if (i.status !== 'PUBLICADO') return 'INDISPONIVEL'
  if (i.embargoAte && i.embargoAte.getTime() > agora.getTime()) return 'EMBARGADO'
  if (i.restrito) return 'RESTRITO'
  return 'ABERTO'
}

// Código Cutter simplificado (aproximação da tabela Cutter-Sanborn de 3 algarismos).
export function cutterSimplificado(sobrenome: string): string {
  const s = sobrenome.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z]/g, '')
  if (!s) return ''
  const mapa = (c: string) => {
    if ('AEIOU'.includes(c)) return 1
    if ('BP'.includes(c)) return 2
    if ('CKQ'.includes(c)) return 3
    if ('DT'.includes(c)) return 4
    if ('GJ'.includes(c)) return 5
    if ('LMN'.includes(c)) return 6
    if ('RS'.includes(c)) return 7
    return 8 // F H V W X Y Z
  }
  const d2 = s[1] ? mapa(s[1]) : 1
  const d3 = s[2] ? mapa(s[2]) : 1
  return `${s[0]}${d2}${d3}`
}

// "João da Silva" -> "Silva, João da"
export function entradaAutor(nome: string): string {
  const n = nome.trim()
  if (!n || n.includes(',')) return n
  const partes = n.split(/\s+/)
  if (partes.length === 1) return n
  const particulas = new Set(['da', 'de', 'do', 'das', 'dos', 'e'])
  let i = partes.length - 1
  const sufixos = new Set(['junior', 'júnior', 'filho', 'neto', 'sobrinho'])
  if (sufixos.has(partes[i].toLowerCase()) && i > 0) i--
  const sobrenome = partes.slice(i).join(' ')
  const resto = partes.slice(0, i)
  void particulas
  return `${sobrenome}, ${resto.join(' ')}`
}

const escH = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

export interface FichaInput {
  titulo: string
  criadores: string[]
  ano?: number | null
  paginas?: number | null
  ilustrado?: boolean
  orientador?: string | null
  coorientador?: string | null
  tipo: string
  curso?: string | null
  instituicao: string
  assuntos: string[]
  cdd?: string | null
  cutter?: string | null
  bibliotecarioNome?: string | null
  bibliotecarioCrb?: string | null
}

const NATUREZA: Record<string, string> = {
  TCC: 'Trabalho de Conclusão de Curso',
  DISSERTACAO: 'Dissertação (Mestrado)',
  TESE: 'Tese (Doutorado)',
  ARTIGO: 'Artigo científico',
  RELATORIO: 'Relatório técnico',
}

// Corpo da ficha catalográfica (AACR2/ABNT) — o cabeçalho com logomarca é adicionado pela rota.
export function fichaCatalograficaTexto(f: FichaInput): { linhas: string[]; cutter: string } {
  const principal = f.criadores[0] ? entradaAutor(f.criadores[0]) : ''
  const cutter = f.cutter || cutterSimplificado(principal.split(',')[0] || f.titulo)
  const chamada = [f.cdd, cutter ? `${cutter}` : ''].filter(Boolean).join(' ')
  const nome = f.criadores.join('; ')
  const linhas: string[] = []
  linhas.push(`${chamada ? chamada + '    ' : ''}${principal}`)
  linhas.push(`      ${f.titulo} / ${nome}. — ${f.ano ?? 's.d.'}.`)
  const fis = [f.paginas ? `${f.paginas} f.` : '', f.ilustrado ? 'il.' : ''].filter(Boolean).join(' : ')
  if (fis) linhas.push(`      ${fis}`)
  const ori = [f.orientador ? `Orientador: ${f.orientador}` : '', f.coorientador ? `Coorientador: ${f.coorientador}` : ''].filter(Boolean).join('. ')
  if (ori) linhas.push(`      ${ori}.`)
  linhas.push(`      ${NATUREZA[f.tipo] ?? 'Documento'} — ${f.instituicao}${f.curso ? ', ' + f.curso : ''}, ${f.ano ?? 's.d.'}.`)
  const ass = f.assuntos.map((a, i) => `${i + 1}. ${a}`).join(' ')
  const romanos = ['I', 'II', 'III', 'IV', 'V']
  const entradas: string[] = []
  let idx = 0
  if (f.orientador) entradas.push(`${romanos[idx++]}. ${entradaAutor(f.orientador)}`)
  entradas.push(`${romanos[idx++] ?? idx}. Título`)
  linhas.push(`      ${[ass, entradas.join(' ')].filter(Boolean).join(' ')}${f.cdd ? '    CDD ' + f.cdd : ''}`)
  return { linhas, cutter }
}

export function fichaCatalograficaHtmlCorpo(f: FichaInput): string {
  const { linhas } = fichaCatalograficaTexto(f)
  const cat = f.bibliotecarioNome ? `Ficha catalográfica elaborada por ${escH(f.bibliotecarioNome)}${f.bibliotecarioCrb ? ' — ' + escH(f.bibliotecarioCrb) : ''}` : 'Ficha catalográfica (pendente de validação pelo bibliotecário)'
  return `<div style="width:12.5cm;height:7.5cm;border:1px solid #111;margin:24px auto;padding:12px 16px;font:12px/1.5 'Times New Roman',serif;box-sizing:border-box;position:relative">
<pre style="white-space:pre-wrap;font:inherit;margin:0">${linhas.map(escH).join('\n')}</pre>
<div style="position:absolute;left:16px;bottom:8px;font-size:9px;color:#475569">${cat}</div></div>`
}

// Dublin Core (oai_dc) de um item.
export function dublinCoreXml(i: {
  titulo: string; criadores: string[]; assuntos: string[]; descricao?: string | null; editor?: string | null
  colaboradores: string[]; data?: Date | null; tipo: string; formato?: string | null; identificador: string
  fonte?: string | null; idioma?: string | null; relacao?: string | null; cobertura?: string | null; direitos?: string | null
}): string {
  const tag = (n: string, v?: string | null) => (v ? `  <dc:${n}>${escH(v)}</dc:${n}>\n` : '')
  const many = (n: string, vs: string[]) => vs.map((v) => tag(n, v)).join('')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<oai_dc:dc xmlns:oai_dc="http://www.openarchives.org/OAI/2.0/oai_dc/" xmlns:dc="http://purl.org/dc/elements/1.1/">\n` +
    tag('title', i.titulo) + many('creator', i.criadores) + many('subject', i.assuntos) + tag('description', i.descricao) +
    tag('publisher', i.editor) + many('contributor', i.colaboradores) + tag('date', i.data ? isoDay(i.data) : null) +
    tag('type', i.tipo) + tag('format', i.formato) + tag('identifier', i.identificador) + tag('source', i.fonte) +
    tag('language', i.idioma) + tag('relation', i.relacao) + tag('coverage', i.cobertura) + tag('rights', i.direitos) +
    `</oai_dc:dc>\n`
}

export function textoBusca(parts: Array<string | string[] | null | undefined>): string {
  return parts
    .flatMap((p) => (Array.isArray(p) ? p : [p]))
    .filter(Boolean)
    .join(' ')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

export function normalizarBusca(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

// Giro do acervo: empréstimos por exemplar no período.
export function giroAcervo(emprestimos: number, exemplares: number) {
  return exemplares > 0 ? round2(emprestimos / exemplares) : 0
}

// Resultado da conferência de inventário.
export function resumirInventario(itens: Array<{ situacao: string }>) {
  const r: Record<string, number> = { PENDENTE: 0, CONFERIDO: 0, NAO_ENCONTRADO: 0, EMPRESTADO: 0, LOCAL_DIVERGENTE: 0 }
  for (const i of itens) r[i.situacao] = (r[i.situacao] ?? 0) + 1
  const total = itens.length
  const conferidos = r.CONFERIDO + r.EMPRESTADO
  return { total, ...r, percentualConferido: total ? round2((conferidos / total) * 100) : 100 }
}
