// Lógica PURA de matriz curricular: grafo de pré-requisitos, ciclos, caminho crítico e simulador de integralização.

export interface NoMatriz { id: string; disciplineId: string; periodoOrdem: number; tipo: string; cargaHoraria: number; creditos: number; grupoOptativas?: string | null }
export interface ArestaMatriz { itemId: string; requisitoItemId: string | null; tipo: 'PRE' | 'CO' | 'CARGA_MIN'; cargaMinima?: number | null }

const OBRIGATORIOS = new Set(['OBRIGATORIA', 'ESTAGIO', 'TCC'])
export const contaNaIntegralizacao = (n: NoMatriz) => OBRIGATORIOS.has(n.tipo)

/** Detecta ciclo em PRE/CO. Retorna a lista de ids do ciclo ou null. */
export function acharCiclo(nos: NoMatriz[], arestas: ArestaMatriz[]): string[] | null {
  const adj = new Map<string, string[]>()
  for (const a of arestas) if (a.requisitoItemId && a.tipo === 'PRE') adj.set(a.itemId, [...(adj.get(a.itemId) ?? []), a.requisitoItemId])
  const estado = new Map<string, 0 | 1 | 2>()
  const pilha: string[] = []
  let achado: string[] | null = null
  const dfs = (u: string): boolean => {
    estado.set(u, 1); pilha.push(u)
    for (const v of adj.get(u) ?? []) {
      if (estado.get(v) === 1) { achado = [...pilha.slice(pilha.indexOf(v)), v]; return true }
      if (!estado.get(v) && dfs(v)) return true
    }
    estado.set(u, 2); pilha.pop()
    return false
  }
  for (const n of nos) if (!estado.get(n.id) && dfs(n.id)) break
  return achado
}

/** Caminho crítico: a maior cadeia de pré-requisitos (em número de disciplinas), do início ao fim. */
export function caminhoCritico(nos: NoMatriz[], arestas: ArestaMatriz[]): string[] {
  const pre = new Map<string, string[]>()
  for (const a of arestas) if (a.requisitoItemId && a.tipo === 'PRE') pre.set(a.itemId, [...(pre.get(a.itemId) ?? []), a.requisitoItemId])
  const memo = new Map<string, string[]>()
  const visitando = new Set<string>()
  const best = (id: string): string[] => {
    if (memo.has(id)) return memo.get(id)!
    if (visitando.has(id)) return [id]
    visitando.add(id)
    let b: string[] = []
    for (const p of pre.get(id) ?? []) { const c = best(p); if (c.length > b.length) b = c }
    visitando.delete(id)
    const r = [...b, id]
    memo.set(id, r)
    return r
  }
  let top: string[] = []
  for (const n of nos) { const c = best(n.id); if (c.length > top.length) top = c }
  return top
}

export interface EstadoAluno {
  aprovadas: Set<string>        // disciplineId aprovadas (já com equivalências aplicadas)
  emCurso: Set<string>          // disciplineId cursando
  horasComplementares: number
}

export type StatusItem = 'CONCLUIDA' | 'EM_CURSO' | 'DISPONIVEL' | 'BLOQUEADA'
export interface ItemSimulado { id: string; disciplineId: string; periodoOrdem: number; tipo: string; cargaHoraria: number; status: StatusItem; faltam: string[] }

export interface Simulacao {
  itens: ItemSimulado[]
  chObrigatoria: number; chConcluida: number; percentual: number; chRestante: number
  creditosConcluidos: number
  optativasChExigida: number; optativasChConcluida: number
  complementaresMin: number; complementaresValidadas: number; complementaresFaltam: number
  periodosRestantes: number; plano: Array<{ periodo: number; itens: string[]; ch: number }>
  pendenciasFormatura: string[]
}

/** Calcula status por item, integralização e um plano de períodos (guloso, respeitando pré-requisitos e carga máxima por período). */
export function simularIntegralizacao(
  nos: NoMatriz[], arestas: ArestaMatriz[], estado: EstadoAluno, opts: { complementaresMin?: number; cargaMaxPeriodo?: number; optativasChExigida?: number } = {},
): Simulacao {
  const porId = new Map(nos.map((n) => [n.id, n]))
  const concluidoItem = (n: NoMatriz) => estado.aprovadas.has(n.disciplineId)
  const concluidos = new Set(nos.filter(concluidoItem).map((n) => n.id))
  const chConcluidaTotal = () => nos.filter((n) => concluidos.has(n.id)).reduce((s, n) => s + n.cargaHoraria, 0)

  const faltas = (n: NoMatriz, feitos: Set<string>, ch: number, simultaneos: Set<string> = new Set()): string[] => {
    const f: string[] = []
    for (const a of arestas.filter((x) => x.itemId === n.id)) {
      if (a.tipo === 'CARGA_MIN') { if (ch < (a.cargaMinima ?? 0)) f.push(`carga mínima ${a.cargaMinima}h (integralizadas ${ch}h)`) }
      else if (a.requisitoItemId) {
        const r = porId.get(a.requisitoItemId)
        if (!r) continue
        if (a.tipo === 'PRE' && !feitos.has(r.id)) f.push(`pré-requisito: ${r.disciplineId}`)
        if (a.tipo === 'CO' && !feitos.has(r.id) && !simultaneos.has(r.id) && !estado.emCurso.has(r.disciplineId)) f.push(`co-requisito: ${r.disciplineId}`)
      }
    }
    return f
  }

  const itens: ItemSimulado[] = nos.slice().sort((a, b) => a.periodoOrdem - b.periodoOrdem).map((n) => {
    if (concluidos.has(n.id)) return { id: n.id, disciplineId: n.disciplineId, periodoOrdem: n.periodoOrdem, tipo: n.tipo, cargaHoraria: n.cargaHoraria, status: 'CONCLUIDA' as const, faltam: [] }
    const falta = faltas(n, concluidos, chConcluidaTotal())
    const st: StatusItem = estado.emCurso.has(n.disciplineId) ? 'EM_CURSO' : falta.length ? 'BLOQUEADA' : 'DISPONIVEL'
    return { id: n.id, disciplineId: n.disciplineId, periodoOrdem: n.periodoOrdem, tipo: n.tipo, cargaHoraria: n.cargaHoraria, status: st, faltam: falta }
  })

  const obrig = nos.filter(contaNaIntegralizacao)
  const chObrigatoria = obrig.reduce((s, n) => s + n.cargaHoraria, 0)
  const chConcluida = obrig.filter((n) => concluidos.has(n.id)).reduce((s, n) => s + n.cargaHoraria, 0)
  const optativas = nos.filter((n) => !contaNaIntegralizacao(n) && n.tipo !== 'ATIVIDADE_COMPLEMENTAR')
  const optativasChConcluida = optativas.filter((n) => concluidos.has(n.id)).reduce((s, n) => s + n.cargaHoraria, 0)
  const optExigida = opts.optativasChExigida ?? 0

  // plano guloso para as obrigatórias ainda não concluídas
  const maxCh = opts.cargaMaxPeriodo && opts.cargaMaxPeriodo > 0 ? opts.cargaMaxPeriodo : Math.max(60, Math.ceil(chObrigatoria / Math.max(1, new Set(obrig.map((n) => n.periodoOrdem)).size)))
  const feitos = new Set(concluidos)
  let pendentes = obrig.filter((n) => !feitos.has(n.id)).sort((a, b) => a.periodoOrdem - b.periodoOrdem)
  const plano: Simulacao['plano'] = []
  let guarda = 0
  while (pendentes.length && guarda++ < 80) {
    const ch0 = nos.filter((n) => feitos.has(n.id)).reduce((s, n) => s + n.cargaHoraria, 0)
    const escolhidos: NoMatriz[] = []
    let ch = 0
    const simult = new Set<string>()
    for (const n of pendentes) {
      if (faltas(n, feitos, ch0, new Set([...simult])).length) continue
      if (ch + n.cargaHoraria > maxCh && escolhidos.length) continue
      escolhidos.push(n); simult.add(n.id); ch += n.cargaHoraria
    }
    if (!escolhidos.length) break
    // co-requisitos exigem que o par esteja junto: se algum escolhido depende de CO não escolhido, retira-o
    for (const n of [...escolhidos]) if (faltas(n, feitos, ch0, simult).length) { escolhidos.splice(escolhidos.indexOf(n), 1); simult.delete(n.id); ch -= n.cargaHoraria }
    if (!escolhidos.length) break
    escolhidos.forEach((n) => feitos.add(n.id))
    plano.push({ periodo: plano.length + 1, itens: escolhidos.map((n) => n.id), ch })
    pendentes = pendentes.filter((n) => !feitos.has(n.id))
  }
  const compMin = opts.complementaresMin ?? 0
  const pend: string[] = []
  if (chObrigatoria - chConcluida > 0) pend.push(`Faltam ${chObrigatoria - chConcluida}h de disciplinas obrigatórias.`)
  if (optExigida > optativasChConcluida) pend.push(`Faltam ${optExigida - optativasChConcluida}h de optativas/eletivas.`)
  if (compMin > estado.horasComplementares) pend.push(`Faltam ${compMin - estado.horasComplementares}h de atividades complementares.`)
  if (pendentes.length) pend.push('Há disciplinas obrigatórias que não puderam ser planejadas (verifique pré-requisitos).')
  return {
    itens, chObrigatoria, chConcluida, percentual: chObrigatoria ? Math.round((chConcluida / chObrigatoria) * 1000) / 10 : 0, chRestante: Math.max(0, chObrigatoria - chConcluida),
    creditosConcluidos: nos.filter((n) => concluidos.has(n.id)).reduce((s, n) => s + n.creditos, 0),
    optativasChExigida: optExigida, optativasChConcluida, complementaresMin: compMin, complementaresValidadas: estado.horasComplementares, complementaresFaltam: Math.max(0, compMin - estado.horasComplementares),
    periodosRestantes: plano.length, plano, pendenciasFormatura: pend,
  }
}

/** Expande aprovações usando equivalências (disciplina aprovada vale pelas equivalentes, com percentual >= minimo). */
export function aplicarEquivalencias(aprovadas: Set<string>, equivalencias: Array<{ disciplineId: string; equivalenteId: string; bidirecional: boolean; percentual: number }>, minimo = 75): Set<string> {
  const out = new Set(aprovadas)
  let mudou = true
  while (mudou) {
    mudou = false
    for (const e of equivalencias) {
      if (e.percentual < minimo) continue
      if (out.has(e.disciplineId) && !out.has(e.equivalenteId)) { out.add(e.equivalenteId); mudou = true }
      if (e.bidirecional && out.has(e.equivalenteId) && !out.has(e.disciplineId)) { out.add(e.disciplineId); mudou = true }
    }
  }
  return out
}
