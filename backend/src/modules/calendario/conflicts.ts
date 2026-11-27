import { overlap, DIAS_SEMANA, minToHHMM } from './time'

// Detecção PURA de choques na grade semanal e cálculo de ocupação de espaços.

export interface SlotLike {
  id: string
  diaSemana: number
  inicioMin: number
  fimMin: number
  classSectionId?: string | null
  disciplineId?: string | null
  grupo?: string | null
  professorUserId?: string | null
  spaceId?: string | null
}

export type TipoChoque = 'PROFESSOR' | 'TURMA' | 'ESPACO'

export interface Choque {
  tipo: TipoChoque
  ref: string                 // id do professor/grupo/espaço em choque
  slotIds: string[]
  diaSemana: number
  inicioMin: number
  fimMin: number
  chave: string               // estável (para upsert em CalConflito)
  descricao: string
}

const grupoKey = (s: SlotLike) => s.grupo || s.classSectionId || s.id

/** Turma conjunta: mesma disciplina + professor + espaço no mesmo horário NÃO é choque de professor/espaço. */
function conjunta(a: SlotLike, b: SlotLike) {
  return (
    !!a.disciplineId &&
    a.disciplineId === b.disciplineId &&
    !!a.professorUserId &&
    a.professorUserId === b.professorUserId &&
    !!a.spaceId &&
    a.spaceId === b.spaceId
  )
}

function pair(tipo: TipoChoque, ref: string, a: SlotLike, b: SlotLike): Choque {
  const inicio = Math.max(a.inicioMin, b.inicioMin)
  const fim = Math.min(a.fimMin, b.fimMin)
  const [x, y] = [a.id, b.id].sort()
  const nome = tipo === 'PROFESSOR' ? 'Professor' : tipo === 'TURMA' ? 'Turma/grupo' : 'Espaço'
  return {
    tipo,
    ref,
    slotIds: [x, y],
    diaSemana: a.diaSemana,
    inicioMin: inicio,
    fimMin: fim,
    chave: `slot:${tipo}:${x}:${y}`,
    descricao: `${nome} em duplicidade na ${DIAS_SEMANA[a.diaSemana]} ${minToHHMM(inicio)}–${minToHHMM(fim)}`,
  }
}

/** Todos os choques de professor, turma(grupo) e espaço entre slots. */
export function detectSlotConflicts(slots: SlotLike[]): Choque[] {
  const out: Choque[] = []
  const defs: Array<[TipoChoque, (s: SlotLike) => string | null | undefined]> = [
    ['PROFESSOR', (s) => s.professorUserId],
    ['TURMA', grupoKey],
    ['ESPACO', (s) => s.spaceId],
  ]
  for (const [tipo, keyFn] of defs) {
    const groups = new Map<string, SlotLike[]>()
    for (const s of slots) {
      const k = keyFn(s)
      if (!k) continue
      const gk = `${k}|${s.diaSemana}`
      const arr = groups.get(gk)
      if (arr) arr.push(s)
      else groups.set(gk, [s])
    }
    for (const [gk, arr] of groups) {
      if (arr.length < 2) continue
      arr.sort((a, b) => a.inicioMin - b.inicioMin || a.id.localeCompare(b.id))
      const ref = gk.split('|')[0]
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          if (arr[j].inicioMin >= arr[i].fimMin) break
          if (!overlap(arr[i].inicioMin, arr[i].fimMin, arr[j].inicioMin, arr[j].fimMin)) continue
          if ((tipo === 'PROFESSOR' || tipo === 'ESPACO') && conjunta(arr[i], arr[j])) continue
          out.push(pair(tipo, ref, arr[i], arr[j]))
        }
      }
    }
  }
  return out
}

/** Choques de um slot candidato contra a grade existente (ignora `candidate.id`). */
export function conflictsForCandidate(candidate: SlotLike, slots: SlotLike[]): Choque[] {
  const base = slots.filter((s) => s.id !== candidate.id && s.diaSemana === candidate.diaSemana && overlap(s.inicioMin, s.fimMin, candidate.inicioMin, candidate.fimMin))
  if (!base.length) return []
  return detectSlotConflicts([candidate, ...base]).filter((c) => c.slotIds.includes(candidate.id))
}

// ---------------- Ocupação ----------------

export interface Faixa {
  dia: number
  inicio: number
  fim: number
}

export interface EspacoOcup {
  id: string
  nome?: string
  tipo?: string
  capacidade?: number
}

export interface OcupacaoEspaco {
  spaceId: string
  nome?: string
  tipo?: string
  minutosDisponiveis: number
  minutosOcupados: number
  taxa: number                       // 0..1
  ociosidade: number                 // 1 - taxa
  porDia: Record<number, { ocupados: number; disponiveis: number; taxa: number }>
  mapa: Array<{ dia: number; inicio: number; fim: number; ocupado: boolean }>   // por faixa da malha
}

function mergeIntervals(iv: Array<[number, number]>): Array<[number, number]> {
  const s = [...iv].sort((a, b) => a[0] - b[0])
  const out: Array<[number, number]> = []
  for (const x of s) {
    const last = out[out.length - 1]
    if (last && x[0] <= last[1]) last[1] = Math.max(last[1], x[1])
    else out.push([x[0], x[1]])
  }
  return out
}

/** Taxa de ocupação semanal por espaço frente à malha de horários (janelas de aula). */
export function calcOcupacao(slots: SlotLike[], espacos: EspacoOcup[], malha: Faixa[]): OcupacaoEspaco[] {
  const dispPorDia = new Map<number, number>()
  for (const f of malha) dispPorDia.set(f.dia, (dispPorDia.get(f.dia) ?? 0) + (f.fim - f.inicio))
  const totalDisp = [...dispPorDia.values()].reduce((a, b) => a + b, 0)
  return espacos.map((e) => {
    const mine = slots.filter((s) => s.spaceId === e.id)
    const porDia: OcupacaoEspaco['porDia'] = {}
    let ocupados = 0
    for (const dia of dispPorDia.keys()) {
      const janelas = malha.filter((f) => f.dia === dia)
      const iv = mergeIntervals(mine.filter((s) => s.diaSemana === dia).map((s) => [s.inicioMin, s.fimMin] as [number, number]))
      let oc = 0
      for (const [a, b] of iv) for (const j of janelas) oc += Math.max(0, Math.min(b, j.fim) - Math.max(a, j.inicio))
      porDia[dia] = { ocupados: oc, disponiveis: dispPorDia.get(dia)!, taxa: dispPorDia.get(dia)! ? oc / dispPorDia.get(dia)! : 0 }
      ocupados += oc
    }
    const mapa = malha.map((f) => ({
      dia: f.dia,
      inicio: f.inicio,
      fim: f.fim,
      ocupado: mine.some((s) => s.diaSemana === f.dia && overlap(s.inicioMin, s.fimMin, f.inicio, f.fim)),
    }))
    const taxa = totalDisp ? ocupados / totalDisp : 0
    return { spaceId: e.id, nome: e.nome, tipo: e.tipo, minutosDisponiveis: totalDisp, minutosOcupados: ocupados, taxa, ociosidade: 1 - taxa, porDia, mapa }
  })
}

/** Janelas livres de um espaço num dia dado intervalos ocupados e a janela de funcionamento. */
export function janelasLivres(ocupados: Array<[number, number]>, abre: number, fecha: number, minDuracao = 30): Array<[number, number]> {
  const merged = mergeIntervals(ocupados.map(([a, b]) => [Math.max(a, abre), Math.min(b, fecha)] as [number, number]).filter(([a, b]) => b > a))
  const out: Array<[number, number]> = []
  let cur = abre
  for (const [a, b] of merged) {
    if (a - cur >= minDuracao) out.push([cur, a])
    cur = Math.max(cur, b)
  }
  if (fecha - cur >= minDuracao) out.push([cur, fecha])
  return out
}
