// Lógica PURA da reitoria (sem banco): semáforos, variações, OKRs, urgência da
// central de pendências, cache, resumo heurístico e CSV. Teste: __selftest__.ts

export type Semaforo = 'VERDE' | 'AMARELO' | 'VERMELHO' | 'CINZA'
export type Sentido = 'MAIOR_MELHOR' | 'MENOR_MELHOR' | 'NEUTRO'
export type Perfil =
  | 'reitoria' | 'administracao' | 'coordenacao' | 'secretaria'
  | 'professor' | 'biblioteca' | 'infraestrutura' | 'admissoes'

export const PERFIS: Perfil[] = ['reitoria', 'administracao', 'coordenacao', 'secretaria', 'professor', 'biblioteca', 'infraestrutura', 'admissoes']

export interface Indicador {
  chave: string
  titulo: string
  categoria: string
  valor: number | null
  unidade: string                 // '', '%', 'R$', 'dias', 'pts'
  anterior?: number | null
  anteriorFonte?: 'PERIODO' | 'SNAPSHOT' | null
  variacaoAbs?: number | null
  variacaoPct?: number | null
  tendencia?: 'SOBE' | 'DESCE' | 'ESTAVEL' | null
  favoravel?: boolean | null      // a variação é boa para a instituição?
  sentido: Sentido
  semaforo: Semaforo
  meta?: number | null
  rota: string                    // rota do frontend para detalhar
  detalhe?: Record<string, unknown>
  perfis: Perfil[]
  erro?: string
}

export const round1 = (n: number) => Math.round(n * 10) / 10
export const round2 = (n: number) => Math.round(n * 100) / 100
export const pct = (a: number, b: number) => (b > 0 ? round1((a / b) * 100) : 0)

// ---------------- semáforo e variação ----------------

export function semaforoPorLimites(valor: number | null | undefined, o: { sentido: Sentido; verde: number; amarelo: number }): Semaforo {
  if (valor == null || Number.isNaN(valor) || o.sentido === 'NEUTRO') return 'CINZA'
  if (o.sentido === 'MAIOR_MELHOR') return valor >= o.verde ? 'VERDE' : valor >= o.amarelo ? 'AMARELO' : 'VERMELHO'
  return valor <= o.verde ? 'VERDE' : valor <= o.amarelo ? 'AMARELO' : 'VERMELHO'
}

// Contagem de pendências: 0 = verde; até `amarelo` = amarelo; acima = vermelho.
export const semaforoContagem = (n: number | null | undefined, amarelo = 5): Semaforo =>
  semaforoPorLimites(n, { sentido: 'MENOR_MELHOR', verde: 0, amarelo })

export function variacao(atual: number | null | undefined, anterior: number | null | undefined) {
  if (atual == null || anterior == null) return { abs: null, pct: null, tendencia: null as Indicador['tendencia'] }
  const abs = round2(atual - anterior)
  const p = anterior === 0 ? (atual === 0 ? 0 : null) : round1(((atual - anterior) / Math.abs(anterior)) * 100)
  const tendencia: Indicador['tendencia'] = Math.abs(p ?? abs) < 0.5 ? 'ESTAVEL' : abs > 0 ? 'SOBE' : 'DESCE'
  return { abs, pct: p, tendencia }
}

export function variacaoFavoravel(tendencia: Indicador['tendencia'], sentido: Sentido): boolean | null {
  if (!tendencia || sentido === 'NEUTRO') return null
  if (tendencia === 'ESTAVEL') return null
  return sentido === 'MAIOR_MELHOR' ? tendencia === 'SOBE' : tendencia === 'DESCE'
}

// Monta um Indicador completo: calcula semáforo e variação.
export function montarIndicador(
  base: Omit<Indicador, 'semaforo' | 'variacaoAbs' | 'variacaoPct' | 'tendencia' | 'favoravel'> & {
    semaforo?: Semaforo
    limites?: { verde: number; amarelo: number }
  },
): Indicador {
  const { limites, ...rest } = base
  const v = variacao(rest.valor, rest.anterior)
  const semaforo = rest.semaforo ?? (limites ? semaforoPorLimites(rest.valor, { sentido: rest.sentido, ...limites }) : 'CINZA')
  return {
    ...rest,
    semaforo,
    anteriorFonte: rest.anterior == null ? null : rest.anteriorFonte ?? 'PERIODO',
    variacaoAbs: v.abs,
    variacaoPct: v.pct,
    tendencia: v.tendencia,
    favoravel: variacaoFavoravel(v.tendencia, rest.sentido),
  }
}

export function resumoSemaforos(inds: Indicador[]) {
  const r = { VERDE: 0, AMARELO: 0, VERMELHO: 0, CINZA: 0 } as Record<Semaforo, number>
  for (const i of inds) r[i.semaforo]++
  // saúde 0..100: verde=1, amarelo=0.5, vermelho=0 (cinza ignorado)
  const base = r.VERDE + r.AMARELO + r.VERMELHO
  const saude = base ? round1(((r.VERDE + r.AMARELO * 0.5) / base) * 100) : null
  return { ...r, saude }
}

export const ordemSemaforo: Record<Semaforo, number> = { VERMELHO: 0, AMARELO: 1, VERDE: 2, CINZA: 3 }

export function alertas(inds: Indicador[], max = 10) {
  return inds
    .filter((i) => i.semaforo === 'VERMELHO' || (i.semaforo === 'AMARELO' && i.favoravel === false))
    .sort((a, b) => ordemSemaforo[a.semaforo] - ordemSemaforo[b.semaforo] || Math.abs(b.variacaoPct ?? 0) - Math.abs(a.variacaoPct ?? 0))
    .slice(0, max)
}

// ---------------- NPS ----------------

export function calcularNps(notas: number[]) {
  const v = notas.filter((n) => Number.isFinite(n) && n >= 0 && n <= 10)
  if (!v.length) return { nps: null as number | null, promotores: 0, neutros: 0, detratores: 0, total: 0 }
  const prom = v.filter((n) => n >= 9).length
  const det = v.filter((n) => n <= 6).length
  return { nps: Math.round(((prom - det) / v.length) * 100), promotores: prom, neutros: v.length - prom - det, detratores: det, total: v.length }
}

// ---------------- OKRs ----------------

export function progressoKR(k: { valorInicial: number; valorMeta: number; valorAtual: number; sentido?: 'MAIOR_MELHOR' | 'MENOR_MELHOR' }): number {
  const { valorInicial: i, valorMeta: m, valorAtual: a } = k
  if (m === i) return a === m ? 100 : (k.sentido === 'MENOR_MELHOR' ? (a <= m ? 100 : 0) : a >= m ? 100 : 0)
  const p = ((a - i) / (m - i)) * 100 // funciona para ambos os sentidos: meta<inicial => (a-i)/(m-i)
  return round1(Math.max(0, Math.min(100, p)))
}

export function progressoObjetivo(krs: Array<{ progresso: number; peso: number }>): number {
  const pesoTotal = krs.reduce((s, k) => s + (k.peso > 0 ? k.peso : 0), 0)
  if (!pesoTotal) return 0
  return round1(krs.reduce((s, k) => s + k.progresso * (k.peso > 0 ? k.peso : 0), 0) / pesoTotal)
}

export function fracaoTempo(inicio: Date, fim: Date, now = new Date()): number {
  const t = fim.getTime() - inicio.getTime()
  if (t <= 0) return 1
  return Math.max(0, Math.min(1, (now.getTime() - inicio.getTime()) / t))
}

export type StatusKR = 'CONCLUIDO' | 'NO_PRAZO' | 'EM_RISCO' | 'ATRASADO' | 'NAO_INICIADO'
export function statusKR(progresso: number, inicio: Date, fim: Date, now = new Date()): StatusKR {
  if (progresso >= 100) return 'CONCLUIDO'
  const esperado = fracaoTempo(inicio, fim, now) * 100
  if (now < inicio) return 'NAO_INICIADO'
  if (progresso >= esperado - 10) return 'NO_PRAZO'
  if (progresso >= esperado - 30) return 'EM_RISCO'
  return 'ATRASADO'
}

export const confiancaDoStatus = (s: StatusKR): 'VERDE' | 'AMARELO' | 'VERMELHO' =>
  s === 'ATRASADO' ? 'VERMELHO' : s === 'EM_RISCO' ? 'AMARELO' : 'VERDE'

// Check-in desatualizado: passou de 1,5x a frequência desde o último (ou da criação).
export function checkinDesatualizado(ultimo: Date | null, criado: Date, freqDias: number, now = new Date()): boolean {
  const ref = ultimo ?? criado
  return now.getTime() - ref.getTime() > freqDias * 1.5 * 86_400_000
}

export const addDias = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000)

// ---------------- Central de pendências ----------------

export type SeveridadeMesa = 'INFO' | 'ATENCAO' | 'CRITICO'
export interface ItemMesa {
  id: string
  tipo: 'LEMBRETE' | 'APROVACAO' | 'ETAPA_JORNADA' | 'NOTIFICACAO' | 'TAREFA'
  origem: string            // tabela/fonte (EduReminder, SupAprovacao...)
  modulo: string
  titulo: string
  descricao?: string | null
  prazo?: Date | string | null
  severidade: SeveridadeMesa
  atrasadoDias: number
  urgencia: number
  rota?: string | null
  ref?: { type: string; id: string } | null
  acoes?: string[]
}

export function diasAtraso(prazo: Date | string | null | undefined, now = new Date()): number {
  if (!prazo) return 0
  const t = new Date(prazo).getTime() - now.getTime()
  return t < 0 ? Math.max(1, Math.ceil(-t / 86_400_000)) : 0
}

export function urgenciaScore(o: { severidade: SeveridadeMesa; prazo?: Date | string | null; tipo: ItemMesa['tipo']; now?: Date }): number {
  const now = o.now ?? new Date()
  let s = o.severidade === 'CRITICO' ? 60 : o.severidade === 'ATENCAO' ? 30 : 10
  if (o.prazo) {
    const dias = (new Date(o.prazo).getTime() - now.getTime()) / 86_400_000
    if (dias < 0) s += Math.min(40, 10 + Math.ceil(-dias) * 2)
    else if (dias <= 1) s += 25
    else if (dias <= 3) s += 15
    else if (dias <= 7) s += 5
  }
  if (o.tipo === 'APROVACAO') s += 10
  if (o.tipo === 'ETAPA_JORNADA') s += 5
  if (o.tipo === 'NOTIFICACAO') s -= 5
  return s
}

export function mesaItem(i: Omit<ItemMesa, 'urgencia' | 'atrasadoDias'>, now = new Date()): ItemMesa {
  return { ...i, atrasadoDias: diasAtraso(i.prazo, now), urgencia: urgenciaScore({ severidade: i.severidade, prazo: i.prazo, tipo: i.tipo, now }) }
}

export function ordenarMesa(items: ItemMesa[]): ItemMesa[] {
  const t = (i: ItemMesa) => (i.prazo ? new Date(i.prazo).getTime() : Number.MAX_SAFE_INTEGER)
  return [...items].sort((a, b) => b.urgencia - a.urgencia || t(a) - t(b) || a.titulo.localeCompare(b.titulo, 'pt-BR'))
}

export function resumirMesa(items: ItemMesa[]) {
  const porTipo: Record<string, number> = {}
  const porModulo: Record<string, number> = {}
  for (const i of items) {
    porTipo[i.tipo] = (porTipo[i.tipo] ?? 0) + 1
    porModulo[i.modulo] = (porModulo[i.modulo] ?? 0) + 1
  }
  return {
    total: items.length,
    atrasados: items.filter((i) => i.atrasadoDias > 0).length,
    criticos: items.filter((i) => i.severidade === 'CRITICO').length,
    aprovacoes: items.filter((i) => i.tipo === 'APROVACAO').length,
    porTipo,
    porModulo,
  }
}

// ---------------- Perfis ----------------

export function perfilDoPapel(role: string): Perfil {
  switch (String(role).toUpperCase()) {
    case 'ADMIN': case 'OWNER': case 'RECTOR': case 'BOARD': return 'reitoria'
    case 'FINANCE': return 'administracao'
    case 'COORDINATOR': return 'coordenacao'
    case 'SECRETARY': return 'secretaria'
    case 'TEACHER': return 'professor'
    case 'LIBRARIAN': return 'biblioteca'
    case 'FACILITIES': case 'SUPPLIES': return 'infraestrutura'
    case 'MARKETING': case 'ADMISSIONS': return 'admissoes'
    default: return 'secretaria'
  }
}

const SUPER = ['ADMIN', 'OWNER', 'RECTOR', 'BOARD']
export function podeVerPerfil(role: string, perfil: Perfil): boolean {
  const r = String(role).toUpperCase()
  if (SUPER.includes(r)) return true
  if (perfil === 'reitoria') return false
  return perfilDoPapel(r) === perfil
}

// ---------------- Cache TTL ----------------

export class TTLCache<T> {
  private m = new Map<string, { at: number; v: T }>()
  constructor(private ttlMs: number, private max = 2000) {}
  get(k: string, now = Date.now()): T | undefined {
    const e = this.m.get(k)
    if (!e) return undefined
    if (now - e.at > this.ttlMs) { this.m.delete(k); return undefined }
    return e.v
  }
  set(k: string, v: T, now = Date.now()) {
    if (this.m.size >= this.max) {
      const first = this.m.keys().next().value
      if (first !== undefined) this.m.delete(first)
    }
    this.m.set(k, { at: now, v })
  }
  clearPrefix(prefix: string) { for (const k of [...this.m.keys()]) if (k.startsWith(prefix)) this.m.delete(k) }
  get size() { return this.m.size }
}

// ---------------- Formatação / CSV / texto ----------------

export function fmtValor(i: Pick<Indicador, 'valor' | 'unidade'>): string {
  if (i.valor == null) return 'sem dados'
  const n = i.valor
  if (i.unidade === 'R$') return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const s = Number.isInteger(n) ? n.toLocaleString('pt-BR') : n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
  return i.unidade ? (i.unidade === '%' ? `${s}%` : `${s} ${i.unidade}`) : s
}

export function fmtVariacao(i: Pick<Indicador, 'variacaoPct' | 'variacaoAbs' | 'tendencia'>): string {
  if (i.tendencia == null) return '—'
  const seta = i.tendencia === 'SOBE' ? '▲' : i.tendencia === 'DESCE' ? '▼' : '■'
  const v = i.variacaoPct != null ? `${i.variacaoPct > 0 ? '+' : ''}${i.variacaoPct.toLocaleString('pt-BR')}%` : `${(i.variacaoAbs ?? 0) > 0 ? '+' : ''}${i.variacaoAbs}`
  return `${seta} ${v}`
}

export function csvEscape(v: unknown): string {
  const s = v == null ? '' : String(v)
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(rows: Array<Record<string, unknown>>, cols?: string[]): string {
  if (!rows.length) return ''
  const c = cols ?? Object.keys(rows[0])
  return '﻿' + [c.join(';'), ...rows.map((r) => c.map((k) => csvEscape(r[k])).join(';'))].join('\r\n')
}

const TEMAS: Array<{ re: RegExp; categoria: string }> = [
  { re: /inadimpl|financ|receita|despesa|caixa|fluxo|mensalidade|cobran|pagar|receber/i, categoria: 'Financeiro' },
  { re: /matr[ií]cula|aluno|evas|trancament|curso|modalidade|reten/i, categoria: 'Acadêmico' },
  { re: /admiss|candidat|vestibular|lead|funil|capta|marketing|ingress/i, categoria: 'Admissões' },
  { re: /nota|di[aá]rio|reprova|aprova|professor|docente|turma/i, categoria: 'Notas e diários' },
  { re: /requerimento|secretaria|protocolo|sla|diploma|hist[oó]rico/i, categoria: 'Secretaria' },
  { re: /mec|regulat|pdi|ato|reconhecimento|credenciamento|dilig|e-?mec|prontid/i, categoria: 'Regulatório e governança' },
  { re: /nps|ouvidoria|satisf|reclama|risco|apoio|egress/i, categoria: 'Experiência e apoio' },
  { re: /pesquisa|publica|cient[ií]fic|projeto|inicia/i, categoria: 'Pesquisa' },
  { re: /manuten|infra|ordem de servi|estoque|suprimento|almoxarif|chamado/i, categoria: 'Infraestrutura e suprimentos' },
  { re: /biblioteca|acervo|empr[eé]stimo|livro/i, categoria: 'Biblioteca' },
  { re: /enade|oab|enamed|desempenho|exame/i, categoria: 'Desempenho em exames' },
  { re: /calend|espa[cç]o|sala|ocupa|conflito|reserva|hor[aá]rio/i, categoria: 'Calendário e espaços' },
  { re: /jornada|lembrete|pend[eê]ncia|atrasad/i, categoria: 'Processos e pendências' },
]

export function categoriasDaPergunta(pergunta: string): string[] {
  return [...new Set(TEMAS.filter((t) => t.re.test(pergunta)).map((t) => t.categoria))]
}

// Resumo textual sem IA: destaca alertas e responde por tema quando a pergunta o identifica.
export function resumoHeuristico(inds: Indicador[], pergunta?: string): string {
  const ok = inds.filter((i) => i.valor != null && !i.erro)
  if (!ok.length) return 'Ainda não há dados suficientes nos módulos para gerar um resumo executivo. Cadastre matrículas, lançamentos financeiros e demais registros para habilitar os indicadores.'
  const linhas: string[] = []
  const temas = pergunta ? categoriasDaPergunta(pergunta) : []
  const foco = temas.length ? ok.filter((i) => temas.includes(i.categoria)) : []
  const fraseInd = (i: Indicador) => `${i.titulo}: ${fmtValor(i)}${i.tendencia && i.tendencia !== 'ESTAVEL' ? ` (${fmtVariacao(i)} vs. período anterior)` : ''} [${i.semaforo.toLowerCase()}]`
  if (foco.length) {
    linhas.push(`Sobre ${temas.join(' e ')}:`)
    for (const i of foco.slice(0, 8)) linhas.push(`- ${fraseInd(i)}`)
  } else if (pergunta && pergunta.trim()) {
    linhas.push('Não identifiquei um tema específico na pergunta; segue o panorama geral.')
  }
  const sem = resumoSemaforos(ok)
  linhas.push(`Panorama: ${ok.length} indicadores com dados — ${sem.VERDE} verdes, ${sem.AMARELO} amarelos e ${sem.VERMELHO} vermelhos${sem.saude != null ? ` (saúde institucional ${sem.saude}%)` : ''}.`)
  const al = alertas(ok, 6)
  if (al.length) {
    linhas.push('Pontos de atenção:')
    for (const i of al) linhas.push(`- ${fraseInd(i)}`)
  } else linhas.push('Nenhum indicador em estado crítico no momento.')
  const bons = ok.filter((i) => i.semaforo === 'VERDE' && i.favoravel === true).slice(0, 3)
  if (bons.length) linhas.push('Destaques positivos: ' + bons.map((i) => `${i.titulo} (${fmtVariacao(i)})`).join('; ') + '.')
  linhas.push('(Resumo automático por regras — IA não configurada ou indisponível.)')
  return linhas.join('\n')
}

export function indicadoresParaPrompt(inds: Indicador[]) {
  return inds.filter((i) => i.valor != null).map((i) => ({
    chave: i.chave, titulo: i.titulo, categoria: i.categoria, valor: i.valor, unidade: i.unidade,
    anterior: i.anterior ?? null, variacaoPct: i.variacaoPct ?? null, semaforo: i.semaforo, meta: i.meta ?? null,
    detalhe: i.detalhe ?? null,
  }))
}
