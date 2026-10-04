// Funções PURAS do módulo Desempenho (sem acesso a banco) — testadas em __selftest__.ts

export type Nivel = 'FACIL' | 'MEDIO' | 'DIFICIL'
const DAY = 86_400_000

// PRNG determinístico (mulberry32) para montagens reprodutíveis
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
export const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d

// ---------- Distribuição por peso (maior resto) ----------
export function distribuirPorPeso(total: number, itens: Array<{ id: string; peso: number }>): Record<string, number> {
  const out: Record<string, number> = {}
  const soma = itens.reduce((s, i) => s + Math.max(0, i.peso), 0)
  if (!itens.length || total <= 0) return out
  if (soma <= 0) {
    itens.forEach((i, k) => (out[i.id] = Math.floor(total / itens.length) + (k < total % itens.length ? 1 : 0)))
    return out
  }
  const base = itens.map((i) => {
    const exato = (Math.max(0, i.peso) / soma) * total
    return { id: i.id, n: Math.floor(exato), resto: exato - Math.floor(exato) }
  })
  let faltam = total - base.reduce((s, b) => s + b.n, 0)
  for (const b of [...base].sort((x, y) => y.resto - x.resto)) {
    if (faltam <= 0) break
    b.n++
    faltam--
  }
  base.forEach((b) => (out[b.id] = b.n))
  return out
}

// ---------- Montagem de simulado ----------
export interface QuestaoPool { id: string; eixoId?: string | null; nivel: Nivel; usos?: number }
export interface LinhaMatriz { eixoId: string; quantidade: number; niveis?: Partial<Record<Nivel, number>> } // niveis: proporções
export interface MontagemResultado {
  selecionadas: Array<{ questaoId: string; eixoId: string }>
  faltantes: Array<{ eixoId: string; pedido: number; obtido: number }>
}

export function montarSimulado(pool: QuestaoPool[], matriz: LinhaMatriz[], seed = 1): MontagemResultado {
  const rand = rng(seed)
  const usados = new Set<string>()
  const selecionadas: MontagemResultado['selecionadas'] = []
  const faltantes: MontagemResultado['faltantes'] = []
  for (const linha of matriz) {
    const doEixo = shuffle(pool.filter((q) => q.eixoId === linha.eixoId && !usados.has(q.id)), rand)
      .sort((a, b) => (a.usos ?? 0) - (b.usos ?? 0)) // sort estável: prioriza as menos usadas
    const alvoNiveis: Partial<Record<Nivel, number>> = {}
    if (linha.niveis) {
      const soma = Object.values(linha.niveis).reduce((s, v) => s + (v || 0), 0) || 1
      const dist = distribuirPorPeso(linha.quantidade, (['FACIL', 'MEDIO', 'DIFICIL'] as Nivel[]).map((n) => ({ id: n, peso: (linha.niveis![n] || 0) / soma })))
      for (const n of ['FACIL', 'MEDIO', 'DIFICIL'] as Nivel[]) alvoNiveis[n] = dist[n]
    }
    const escolhidas: QuestaoPool[] = []
    if (linha.niveis) {
      for (const n of ['FACIL', 'MEDIO', 'DIFICIL'] as Nivel[]) {
        escolhidas.push(...doEixo.filter((q) => q.nivel === n && !escolhidas.includes(q)).slice(0, alvoNiveis[n] || 0))
      }
    }
    // completa com o que sobrar até a quantidade pedida
    for (const q of doEixo) {
      if (escolhidas.length >= linha.quantidade) break
      if (!escolhidas.includes(q)) escolhidas.push(q)
    }
    const final = escolhidas.slice(0, linha.quantidade)
    final.forEach((q) => { usados.add(q.id); selecionadas.push({ questaoId: q.id, eixoId: linha.eixoId }) })
    if (final.length < linha.quantidade) faltantes.push({ eixoId: linha.eixoId, pedido: linha.quantidade, obtido: final.length })
  }
  return { selecionadas, faltantes }
}

// ---------- Correção ----------
export interface GabaritoItem { questaoId: string; eixoId?: string | null; gabarito?: string | null }
export interface ResultadoEixo { eixoId: string; acertos: number; total: number; percentual: number }
export function corrigir(itens: GabaritoItem[], respostas: Record<string, string | null | undefined>) {
  let acertos = 0
  const eixos = new Map<string, { acertos: number; total: number }>()
  const detalhe: Array<{ questaoId: string; correta: boolean; marcada: string | null }> = []
  for (const it of itens) {
    const marcada = (respostas[it.questaoId] ?? null) as string | null
    const correta = !!it.gabarito && !!marcada && marcada.trim().toUpperCase() === it.gabarito.trim().toUpperCase()
    if (correta) acertos++
    detalhe.push({ questaoId: it.questaoId, correta, marcada })
    const k = it.eixoId || 'SEM_EIXO'
    const e = eixos.get(k) ?? { acertos: 0, total: 0 }
    e.total++
    if (correta) e.acertos++
    eixos.set(k, e)
  }
  const total = itens.length
  const porEixo: ResultadoEixo[] = [...eixos.entries()].map(([eixoId, e]) => ({ eixoId, acertos: e.acertos, total: e.total, percentual: e.total ? round((e.acertos / e.total) * 100) : 0 }))
  return { acertos, total, percentual: total ? round((acertos / total) * 100) : 0, porEixo, detalhe }
}

// ---------- Estatística de questão ----------
export const taxaAcerto = (acertos: number, total: number) => (total > 0 ? round((acertos / total) * 100) : null)
export function classificarDificuldade(taxa: number | null): Nivel | null {
  if (taxa == null) return null
  return taxa >= 70 ? 'FACIL' : taxa >= 40 ? 'MEDIO' : 'DIFICIL'
}

// Índice de discriminação simples: D = (acertos grupo superior - acertos grupo inferior) / n do grupo (27%).
export function indiceDiscriminacao(participantes: Array<{ nota: number; acertou: boolean }>): number | null {
  if (participantes.length < 6) return null
  const ord = participantes.slice().sort((a, b) => b.nota - a.nota)
  const n = Math.max(1, Math.round(ord.length * 0.27))
  const sup = ord.slice(0, n).filter((p) => p.acertou).length / n
  const inf = ord.slice(-n).filter((p) => p.acertou).length / n
  return round(sup - inf, 2)
}
export function avaliarDiscriminacao(d: number | null): string {
  if (d == null) return 'DADOS_INSUFICIENTES'
  if (d >= 0.4) return 'EXCELENTE'
  if (d >= 0.3) return 'BOA'
  if (d >= 0.2) return 'REGULAR'
  if (d >= 0) return 'FRACA'
  return 'REVISAR_GABARITO' // negativa: quem vai pior acerta mais — gabarito/enunciado suspeito
}

// ---------- Projeção (ESTIMATIVA) ----------
// Conceito ENADE 1-5 estimado a partir da proporção média de acertos. NÃO é o cálculo oficial do INEP
// (que usa a distribuição nacional, padronizada por curso); serve apenas como termômetro interno.
export function estimarConceitoEnade(percentualAcertos: number): { conceito: number; estimativa: true; observacao: string } {
  const p = percentualAcertos
  const conceito = p >= 70 ? 5 : p >= 58 ? 4 : p >= 45 ? 3 : p >= 30 ? 2 : 1
  return { conceito, estimativa: true, observacao: 'Estimativa interna por proporção de acertos; o conceito oficial depende da distribuição nacional (INEP).' }
}
export function projecaoOAB(percentual: number, corte = 50) {
  const margem = round(percentual - corte)
  return { aprovadoProvavel: margem >= 0, margem, risco: margem >= 10 ? 'BAIXO' : margem >= 0 ? 'MEDIO' : margem >= -10 ? 'ALTO' : 'CRITICO', estimativa: true }
}
export function projetarTendencia(serie: number[], passosAdiante = 1): number | null {
  // regressão linear simples sobre a série cronológica de percentuais
  const n = serie.length
  if (n < 2) return n === 1 ? serie[0] : null
  const xs = serie.map((_, i) => i)
  const mx = (n - 1) / 2
  const my = serie.reduce((s, v) => s + v, 0) / n
  const num = xs.reduce((s, x, i) => s + (x - mx) * (serie[i] - my), 0)
  const den = xs.reduce((s, x) => s + (x - mx) ** 2, 0) || 1
  const b = num / den
  const a = my - b * mx
  return round(Math.max(0, Math.min(100, a + b * (n - 1 + passosAdiante))))
}

// ---------- Lacunas e plano de reforço ----------
export interface EixoDesempenho { eixoId: string; nome?: string; peso: number; meta: number; atual: number | null }
export interface Lacuna { eixoId: string; nome?: string; atual: number | null; meta: number; gap: number; peso: number; prioridade: number }
// prioridade = gap × peso normalizado (0-100). Sem dado (atual null) => assume 0% (diagnóstico pendente é lacuna máxima).
export function priorizarLacunas(eixos: EixoDesempenho[]): Lacuna[] {
  const somaPeso = eixos.reduce((s, e) => s + Math.max(0, e.peso), 0) || 1
  const lac = eixos.map((e) => {
    const atual = e.atual ?? 0
    const gap = Math.max(0, e.meta - atual)
    const pesoN = Math.max(0, e.peso) / somaPeso
    return { eixoId: e.eixoId, nome: e.nome, atual: e.atual, meta: e.meta, gap: round(gap), peso: e.peso, prioridade: gap * pesoN }
  })
  const max = Math.max(...lac.map((l) => l.prioridade), 0)
  return lac.map((l) => ({ ...l, prioridade: max ? round((l.prioridade / max) * 100) : 0 })).sort((a, b) => b.prioridade - a.prioridade)
}

export const INTERVALOS_REVISAO = [1, 3, 7, 15, 30]
export function revisoesEspacadas(base: Date, ate?: Date, intervalos = INTERVALOS_REVISAO) {
  return intervalos.map((d, i) => ({ n: i + 1, data: new Date(base.getTime() + d * DAY) })).filter((r) => !ate || r.data <= ate)
}

export interface ItemPlano {
  semana: number
  eixoId: string
  tipo: 'ESTUDO' | 'QUESTOES' | 'REVISAO' | 'SIMULADO'
  titulo: string
  minutos: number
  dataPrevista: Date
  revisaoN: number
}
// Gera plano semanal: horas/semana distribuídas proporcionalmente à prioridade (só eixos com gap),
// 1 bloco de ESTUDO + 1 de QUESTOES por eixo/semana, revisões espaçadas do estudo, simulado na última semana.
export function gerarPlanoSemanal(lacunas: Lacuna[], opts: { inicio: Date; semanas: number; horasSemana: number; eixoNome?: (id: string) => string }): ItemPlano[] {
  const itens: ItemPlano[] = []
  const alvo = lacunas.filter((l) => l.gap > 0 && l.prioridade > 0)
  const semanas = Math.max(1, Math.min(52, opts.semanas))
  const nome = (id: string) => opts.eixoNome?.(id) ?? id
  const fim = new Date(opts.inicio.getTime() + semanas * 7 * DAY)
  if (!alvo.length) {
    return [{ semana: semanas, eixoId: '', tipo: 'SIMULADO', titulo: 'Simulado de manutenção', minutos: 180, dataPrevista: new Date(opts.inicio.getTime() + (semanas * 7 - 1) * DAY), revisaoN: 0 }]
  }
  for (let s = 1; s <= semanas; s++) {
    const ini = new Date(opts.inicio.getTime() + (s - 1) * 7 * DAY)
    // rotação: semanas pares priorizam o 2º grupo para dar variedade quando há muitos eixos
    const cap = Math.max(2, Math.min(alvo.length, Math.floor((opts.horasSemana * 60) / 90)))
    const rot = alvo.length > cap ? ((s - 1) * Math.ceil(cap / 2)) % alvo.length : 0
    const foco = alvo.length > cap ? [...alvo.slice(rot), ...alvo.slice(0, rot)].slice(0, cap) : alvo
    const dist = distribuirPorPeso(Math.round(opts.horasSemana * 60), foco.map((l) => ({ id: l.eixoId, peso: l.prioridade })))
    foco.forEach((l, k) => {
      const min = Math.max(30, dist[l.eixoId] || 0)
      const estudo = Math.round(min * 0.45)
      const dia = new Date(ini.getTime() + (k % 5) * DAY)
      itens.push({ semana: s, eixoId: l.eixoId, tipo: 'ESTUDO', titulo: `Estudo dirigido: ${nome(l.eixoId)}`, minutos: estudo, dataPrevista: dia, revisaoN: 0 })
      itens.push({ semana: s, eixoId: l.eixoId, tipo: 'QUESTOES', titulo: `Bateria de questões: ${nome(l.eixoId)}`, minutos: min - estudo, dataPrevista: new Date(dia.getTime() + DAY), revisaoN: 0 })
      for (const r of revisoesEspacadas(dia, fim).slice(0, 3)) {
        itens.push({ semana: s + Math.floor((r.data.getTime() - ini.getTime()) / (7 * DAY)), eixoId: l.eixoId, tipo: 'REVISAO', titulo: `Revisão ${r.n}: ${nome(l.eixoId)}`, minutos: 20, dataPrevista: r.data, revisaoN: r.n })
      }
    })
  }
  itens.push({ semana: semanas, eixoId: '', tipo: 'SIMULADO', titulo: 'Simulado de checagem (reavaliar lacunas)', minutos: 180, dataPrevista: new Date(fim.getTime() + 1000), revisaoN: 0 })
  return itens.sort((a, b) => a.dataPrevista.getTime() - b.dataPrevista.getTime())
}

// ---------- Risco e painel ----------
export function calcularRisco(p: { percentual: number | null; meta: number; tendencia?: number | null; entregasAtrasadas?: number; semSimulado?: boolean }) {
  let score = 0
  const motivos: string[] = []
  if (p.percentual == null) { score += 35; motivos.push('Sem simulado realizado') }
  else {
    const gap = p.meta - p.percentual
    if (gap > 0) { score += Math.min(55, gap * 1.4); motivos.push(`${round(gap)} p.p. abaixo da meta`) }
  }
  if (p.tendencia != null && p.tendencia < -3) { score += 15; motivos.push('Tendência de queda') }
  if ((p.entregasAtrasadas ?? 0) > 0) { score += Math.min(20, (p.entregasAtrasadas ?? 0) * 7); motivos.push(`${p.entregasAtrasadas} atividade(s) atrasada(s)`) }
  score = Math.min(100, round(score))
  const nivel = score >= 60 ? 'CRITICO' : score >= 40 ? 'ALTO' : score >= 20 ? 'MEDIO' : 'BAIXO'
  return { score, nivel, motivos }
}

export interface PontoMapa { linha: string; eixoId: string; acertos: number; total: number }
export function mapaCalor(pontos: PontoMapa[]) {
  const m = new Map<string, Map<string, { a: number; t: number }>>()
  for (const p of pontos) {
    const l = m.get(p.linha) ?? new Map()
    const c = l.get(p.eixoId) ?? { a: 0, t: 0 }
    c.a += p.acertos; c.t += p.total
    l.set(p.eixoId, c); m.set(p.linha, l)
  }
  return [...m.entries()].map(([linha, cols]) => ({ linha, celulas: Object.fromEntries([...cols.entries()].map(([k, v]) => [k, v.t ? round((v.a / v.t) * 100) : null])) }))
}

// Sugere tipos de atividade conforme eixo/exame e gap da turma.
export function sugerirAtividades(lacunasTurma: Lacuna[], kits: Array<{ id: string; eixoId?: string | null; disciplineId?: string | null; tipo: string; titulo: string; usos: number }>, limite = 5) {
  const out: Array<{ kitId: string; titulo: string; eixoId: string; motivo: string; score: number }> = []
  for (const l of lacunasTurma.filter((x) => x.gap > 0).slice(0, 8)) {
    for (const k of kits.filter((k) => k.eixoId === l.eixoId)) {
      out.push({ kitId: k.id, titulo: k.titulo, eixoId: l.eixoId, motivo: `Turma ${l.atual ?? 0}% no eixo (meta ${l.meta}%)`, score: round(l.prioridade + Math.min(10, k.usos)) })
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limite)
}

// Estado de entrega conforme prazo
export function estadoEntrega(prazo: Date, entregueEm: Date | null, agora = new Date()): 'PENDENTE' | 'ENTREGUE' | 'ATRASADA' {
  if (entregueEm) return 'ENTREGUE'
  return agora.getTime() > prazo.getTime() ? 'ATRASADA' : 'PENDENTE'
}
export const letraValida = (l: string, n: number) => /^[A-Z]$/.test(l) && l.charCodeAt(0) - 65 < n
