// Funções PURAS do motor de jornadas (sem banco): validação do grafo,
// avaliação de condições, roteamento, checklist, prazos e permissões.

export type NoTipo = 'INICIO' | 'TAREFA' | 'APROVACAO' | 'ESPERA_EVENTO' | 'GATEWAY' | 'MARCO' | 'FIM'

export interface ItemChecklist { chave: string; titulo: string; obrigatorio?: boolean }
export interface LembreteConfig {
  antecedenciaDias?: number
  recorrenciaDias?: number
  escalarPara?: string          // papel do gestor (nível 1)
  escalarAposDias?: number      // dias de atraso para o nível 2
  escalarPara2?: string         // papel do nível 2
  severity?: 'INFO' | 'ATENCAO' | 'CRITICO'
}
export interface NoDef {
  chave: string
  titulo: string
  descricao?: string | null
  tipo: NoTipo
  papel?: string | null
  slaDias?: number | null
  checklist?: ItemChecklist[] | null
  documentos?: ItemChecklist[] | null
  modulo?: string | null
  rota?: string | null
  evento?: string | null
  lembrete?: LembreteConfig | null
  fase?: string | null
  ordem?: number
}
export type Condicao =
  | { campo: string; op: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'nin' | 'exists' | 'truthy'; valor?: unknown }
  | { and: Condicao[] }
  | { or: Condicao[] }
  | { not: Condicao }
export interface TransDef { deChave: string; paraChave: string; rotulo?: string | null; condicao?: Condicao | null; prioridade?: number }
export interface Grafo { nos: NoDef[]; transicoes: TransDef[] }

const TIPOS: NoTipo[] = ['INICIO', 'TAREFA', 'APROVACAO', 'ESPERA_EVENTO', 'GATEWAY', 'MARCO', 'FIM']

// ---------------- Condições ----------------
function getPath(ctx: any, path: string): unknown {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), ctx)
}

export function avaliarCondicao(c: Condicao | null | undefined, ctx: Record<string, unknown>): boolean {
  if (!c) return true
  if ('and' in c) return c.and.every((x) => avaliarCondicao(x, ctx))
  if ('or' in c) return c.or.some((x) => avaliarCondicao(x, ctx))
  if ('not' in c) return !avaliarCondicao(c.not, ctx)
  const v = getPath(ctx, c.campo)
  const a: any = v
  const b: any = c.valor
  switch (c.op) {
    case 'eq': return a === b || (a != null && b != null && String(a) === String(b))
    case 'ne': return !(a === b || (a != null && b != null && String(a) === String(b)))
    case 'gt': return Number(a) > Number(b)
    case 'gte': return Number(a) >= Number(b)
    case 'lt': return Number(a) < Number(b)
    case 'lte': return Number(a) <= Number(b)
    case 'in': return Array.isArray(b) && b.some((x) => String(x) === String(a))
    case 'nin': return Array.isArray(b) && !b.some((x) => String(x) === String(a))
    case 'exists': return a !== undefined && a !== null
    case 'truthy': return !!a && a !== 'false' && a !== 0
    default: return false
  }
}

// ---------------- Validação do grafo ----------------
export function validarGrafo(g: Grafo): { erros: string[]; avisos: string[] } {
  const erros: string[] = []
  const avisos: string[] = []
  const chaves = new Set<string>()
  for (const n of g.nos) {
    if (!n.chave?.trim()) erros.push('Nó sem chave.')
    if (chaves.has(n.chave)) erros.push(`Chave de nó duplicada: ${n.chave}`)
    chaves.add(n.chave)
    if (!TIPOS.includes(n.tipo)) erros.push(`Tipo inválido no nó ${n.chave}: ${n.tipo}`)
    if (['TAREFA', 'APROVACAO', 'ESPERA_EVENTO'].includes(n.tipo)) {
      if (!n.papel) erros.push(`Nó ${n.chave} (${n.tipo}) precisa de responsável (papel).`)
      if (n.slaDias == null) avisos.push(`Nó ${n.chave} sem SLA: não gerará prazo/lembrete.`)
    }
    if (n.tipo === 'ESPERA_EVENTO' && !n.evento) erros.push(`Nó ${n.chave} (ESPERA_EVENTO) precisa informar o evento.`)
    if (n.slaDias != null && n.slaDias < 0) erros.push(`SLA negativo no nó ${n.chave}.`)
  }
  const inicios = g.nos.filter((n) => n.tipo === 'INICIO')
  if (inicios.length !== 1) erros.push(`O grafo deve ter exatamente 1 nó INICIO (encontrados ${inicios.length}).`)
  if (!g.nos.some((n) => n.tipo === 'FIM')) erros.push('O grafo deve ter ao menos 1 nó FIM.')
  const saidas = new Map<string, TransDef[]>()
  for (const t of g.transicoes) {
    if (!chaves.has(t.deChave)) erros.push(`Transição parte de nó inexistente: ${t.deChave}`)
    if (!chaves.has(t.paraChave)) erros.push(`Transição chega em nó inexistente: ${t.paraChave}`)
    if (t.deChave === t.paraChave) erros.push(`Laço direto no nó ${t.deChave}.`)
    saidas.set(t.deChave, [...(saidas.get(t.deChave) ?? []), t])
  }
  for (const n of g.nos) {
    const out = saidas.get(n.chave) ?? []
    if (n.tipo === 'FIM' && out.length) erros.push(`Nó FIM ${n.chave} não pode ter saídas.`)
    if (n.tipo !== 'FIM' && out.length === 0) erros.push(`Nó ${n.chave} é beco sem saída (sem transições).`)
    if (n.tipo === 'GATEWAY') {
      if (out.length < 2) erros.push(`Gateway ${n.chave} precisa de ao menos 2 saídas.`)
      if (!out.some((t) => !t.condicao)) erros.push(`Gateway ${n.chave} precisa de uma saída padrão (sem condição).`)
    }
    if (n.tipo === 'APROVACAO' && out.length > 1 && !out.some((t) => t.condicao)) {
      avisos.push(`Aprovação ${n.chave} tem várias saídas sem condição: todas serão ativadas em paralelo.`)
    }
  }
  // alcançabilidade a partir do INICIO e capacidade de chegar a um FIM
  if (inicios.length === 1) {
    const vis = alcancaveis(g, inicios[0].chave)
    for (const n of g.nos) if (!vis.has(n.chave)) erros.push(`Nó inalcançável a partir do INICIO: ${n.chave}`)
    const rev = new Map<string, string[]>()
    for (const t of g.transicoes) rev.set(t.paraChave, [...(rev.get(t.paraChave) ?? []), t.deChave])
    const fins = g.nos.filter((n) => n.tipo === 'FIM').map((n) => n.chave)
    const ok = new Set<string>(fins)
    const fila = [...fins]
    while (fila.length) {
      const x = fila.pop()!
      for (const p of rev.get(x) ?? []) if (!ok.has(p)) { ok.add(p); fila.push(p) }
    }
    for (const n of g.nos) if (vis.has(n.chave) && !ok.has(n.chave)) erros.push(`Nó ${n.chave} não leva a nenhum FIM.`)
  }
  return { erros, avisos }
}

export function alcancaveis(g: Grafo, de: string): Set<string> {
  const adj = new Map<string, string[]>()
  for (const t of g.transicoes) adj.set(t.deChave, [...(adj.get(t.deChave) ?? []), t.paraChave])
  const vis = new Set<string>([de])
  const fila = [de]
  while (fila.length) {
    const x = fila.pop()!
    for (const y of adj.get(x) ?? []) if (!vis.has(y)) { vis.add(y); fila.push(y) }
  }
  return vis
}

// ---------------- Roteamento ----------------
// GATEWAY/APROVACAO com condições: primeira transição cuja condição vale (por prioridade),
// senão as sem condição. Demais nós: TODAS as saídas cujas condições valem (paralelismo).
export function proximosNos(g: Grafo, noChave: string, ctx: Record<string, unknown>): string[] {
  const no = g.nos.find((n) => n.chave === noChave)
  const out = g.transicoes.filter((t) => t.deChave === noChave).sort((a, b) => (a.prioridade ?? 0) - (b.prioridade ?? 0))
  if (!no) return []
  const comCond = out.filter((t) => t.condicao)
  const semCond = out.filter((t) => !t.condicao)
  if (no.tipo === 'GATEWAY' || (no.tipo === 'APROVACAO' && comCond.length)) {
    const hit = comCond.find((t) => avaliarCondicao(t.condicao, ctx))
    if (hit) return [hit.paraChave]
    return semCond.length ? [semCond[0].paraChave] : []
  }
  const alvo = out.filter((t) => avaliarCondicao(t.condicao, ctx)).map((t) => t.paraChave)
  return [...new Set(alvo)]
}

// ---------------- Checklist ----------------
export type ChecklistEstado = Record<string, { feito: boolean; porId?: string; em?: string }>

export function checklistPendente(def: ItemChecklist[] | null | undefined, estado: ChecklistEstado | null | undefined): ItemChecklist[] {
  return (def ?? []).filter((i) => i.obrigatorio !== false && !estado?.[i.chave]?.feito)
}
export function aplicarChecklist(estado: ChecklistEstado | null | undefined, marcas: Record<string, boolean>, userId: string | undefined, agora: Date, def: ItemChecklist[] | null | undefined): ChecklistEstado {
  const novo: ChecklistEstado = { ...(estado ?? {}) }
  const validas = new Set((def ?? []).map((i) => i.chave))
  for (const [k, v] of Object.entries(marcas)) {
    if (!validas.has(k)) throw Object.assign(new Error(`Item de checklist inexistente: ${k}`), { status: 400 })
    novo[k] = v ? { feito: true, porId: userId, em: agora.toISOString() } : { feito: false }
  }
  return novo
}

// ---------------- Prazos ----------------
const DIA = 86_400_000
export function addDiasUteis(inicio: Date, dias: number): Date {
  const d = new Date(inicio.getTime())
  let falta = dias
  while (falta > 0) {
    d.setTime(d.getTime() + DIA)
    const w = d.getUTCDay()
    if (w !== 0 && w !== 6) falta--
  }
  return d
}
export function calcularPrazo(inicio: Date, slaDias: number | null | undefined, uteis = false): Date | null {
  if (slaDias == null) return null
  return uteis ? addDiasUteis(inicio, slaDias) : new Date(inicio.getTime() + slaDias * DIA)
}
export function diasDeAtraso(prazo: Date | null | undefined, agora: Date): number {
  if (!prazo || agora.getTime() <= prazo.getTime()) return 0
  return Math.max(1, Math.floor((agora.getTime() - prazo.getTime()) / DIA))
}
export interface PlanoEscalonamento { nivel: 0 | 1 | 2; destinoPapel?: string; severity: 'INFO' | 'ATENCAO' | 'CRITICO' }
export function planoEscalonamento(cfg: LembreteConfig | null | undefined, diasAtraso: number, nivelAtual: number): PlanoEscalonamento {
  if (diasAtraso <= 0) return { nivel: 0, severity: 'INFO' }
  const apos = cfg?.escalarAposDias ?? 7
  const n2 = diasAtraso >= apos
  const nivel: 1 | 2 = n2 ? 2 : 1
  if (nivel <= nivelAtual) return { nivel: nivelAtual as any, severity: 'CRITICO' }
  return {
    nivel,
    destinoPapel: nivel === 2 ? cfg?.escalarPara2 ?? 'RECTOR' : cfg?.escalarPara ?? 'COORDINATOR',
    severity: 'CRITICO',
  }
}

// ---------------- Permissões ----------------
const SUPER = ['ADMIN', 'OWNER', 'RECTOR', 'BOARD']
export function podeAtuar(user: { id: string; role: string }, etapa: { papel?: string | null; responsavelUserId?: string | null }): boolean {
  const role = String(user.role).toUpperCase()
  if (SUPER.includes(role)) return true
  if (etapa.responsavelUserId) return etapa.responsavelUserId === user.id
  return !etapa.papel || etapa.papel === role
}

// ---------------- Etapas abertas / estado ----------------
export const ETAPA_ABERTA = ['ABERTA', 'AGUARDANDO_EVENTO', 'ATRASADA'] as const
export const ehAberta = (s: string) => (ETAPA_ABERTA as readonly string[]).includes(s)

// ---------------- Analytics ----------------
export interface EtapaFato { noChave: string; titulo: string; papel?: string | null; status: string; iniciadaEm: Date; concluidaEm?: Date | null; prazoEm?: Date | null; diasAtraso?: number }

export function calcGargalos(etapas: EtapaFato[], agora = new Date()) {
  const m = new Map<string, { noChave: string; titulo: string; papel?: string | null; concluidas: number; somaDias: number; abertas: number; atrasadas: number; maxDias: number }>()
  for (const e of etapas) {
    const x = m.get(e.noChave) ?? { noChave: e.noChave, titulo: e.titulo, papel: e.papel, concluidas: 0, somaDias: 0, abertas: 0, atrasadas: 0, maxDias: 0 }
    const fim = e.concluidaEm ?? agora
    const dias = Math.max(0, (fim.getTime() - e.iniciadaEm.getTime()) / DIA)
    if (e.status === 'CONCLUIDA') { x.concluidas++; x.somaDias += dias }
    else if (ehAberta(e.status)) { x.abertas++; x.maxDias = Math.max(x.maxDias, dias); if (e.status === 'ATRASADA') x.atrasadas++ }
    m.set(e.noChave, x)
  }
  return [...m.values()]
    .map((x) => ({ ...x, tempoMedioDias: x.concluidas ? +(x.somaDias / x.concluidas).toFixed(2) : null, maxDias: +x.maxDias.toFixed(1) }))
    .sort((a, b) => b.atrasadas - a.atrasadas || b.abertas - a.abertas || (b.tempoMedioDias ?? 0) - (a.tempoMedioDias ?? 0))
}

export function calcAtrasosPorResponsavel(etapas: Array<{ papel?: string | null; responsavelUserId?: string | null; status: string; diasAtraso?: number }>) {
  const m = new Map<string, { papel: string; responsavelUserId: string | null; abertas: number; atrasadas: number; somaDiasAtraso: number; maxDiasAtraso: number }>()
  for (const e of etapas) {
    if (!ehAberta(e.status)) continue
    const k = `${e.papel ?? '-'}|${e.responsavelUserId ?? ''}`
    const x = m.get(k) ?? { papel: e.papel ?? '-', responsavelUserId: e.responsavelUserId ?? null, abertas: 0, atrasadas: 0, somaDiasAtraso: 0, maxDiasAtraso: 0 }
    x.abertas++
    if (e.status === 'ATRASADA') { x.atrasadas++; x.somaDiasAtraso += e.diasAtraso ?? 0; x.maxDiasAtraso = Math.max(x.maxDiasAtraso, e.diasAtraso ?? 0) }
    m.set(k, x)
  }
  return [...m.values()].sort((a, b) => b.atrasadas - a.atrasadas || b.somaDiasAtraso - a.somaDiasAtraso)
}

// Funil: quantas instâncias já passaram/estão em cada nó (ordem do template).
export function calcFunil(nos: Array<{ chave: string; titulo: string; ordem: number }>, etapas: Array<{ instanciaId: string; noChave: string; status: string }>) {
  const passou = new Map<string, Set<string>>()
  const atual = new Map<string, Set<string>>()
  for (const e of etapas) {
    if (e.status === 'CANCELADA') continue
    if (!passou.has(e.noChave)) passou.set(e.noChave, new Set())
    passou.get(e.noChave)!.add(e.instanciaId)
    if (ehAberta(e.status)) {
      if (!atual.has(e.noChave)) atual.set(e.noChave, new Set())
      atual.get(e.noChave)!.add(e.instanciaId)
    }
  }
  return [...nos]
    .sort((a, b) => a.ordem - b.ordem)
    .map((n) => ({ noChave: n.chave, titulo: n.titulo, alcancaram: passou.get(n.chave)?.size ?? 0, agoraAqui: atual.get(n.chave)?.size ?? 0 }))
}
