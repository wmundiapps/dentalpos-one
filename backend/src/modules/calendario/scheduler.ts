import { overlap, minToHHMM, DIAS_SEMANA } from './time'

// ============================================================
// GERADOR AUTOMÁTICO DE CRONOGRAMA (PURO — sem acesso a banco).
//
// Entrada: malha de horários, grupos (coortes), professores (disponibilidade,
// preferências, limites), espaços (tipo/capacidade/recursos) e demandas (disciplina de
// um grupo com N aulas/semana). Saída: alocações sem choques + pendências com motivo.
//
// Estratégia: cada demanda vira "blocos" de aulas consecutivas (geminadas). Os blocos
// são ordenados do mais restrito ao menos restrito (MRV) e alocados por busca em
// profundidade com backtracking: candidatos ordenados por pontuação (preferências,
// compactação, folga de capacidade, espalhamento) e, quando nada cabe, o bloco é
// "pulado" (vira pendência). Após a 1ª solução (gulosa), a busca continua tentando
// reduzir as pendências dentro de um orçamento de nós/tempo.
// ============================================================

export interface Faixa {
  dia: number      // 1..7
  inicio: number   // minutos
  fim: number
}

export interface GenCelula {
  id: string
  dia: number
  inicio: number
  fim: number
  turno?: string | null
}

export interface GenGrupo {
  id: string
  nome?: string
  alunos: number
  turno?: string | null
  diasPermitidos?: number[] | null
}

export interface GenProfessor {
  id: string
  nome?: string
  disponivel?: Faixa[]       // se não vazio: só leciona dentro delas
  indisponivel?: Faixa[]
  preferencias?: Faixa[]
  maxAulasDia?: number | null
  maxAulasSemana?: number | null
}

export interface GenEspaco {
  id: string
  nome?: string
  tipo: string
  capacidade: number
  recursos?: string[]
  indisponivel?: Faixa[]     // bloqueios semanais (manutenção, reservas fixas)
}

export interface GenDemanda {
  id: string
  grupoId: string
  disciplinaId: string
  rotulo?: string
  professorId?: string | null
  aulasSemana: number
  blocoMax?: number          // máx. de aulas geminadas (padrão 2)
  pratica?: boolean
  online?: boolean
  tiposEspaco?: string[]     // padrão: prática=LABORATORIO; teórica=SALA_AULA/AUDITORIO
  recursos?: string[]
  capacidadeMin?: number
  espacoFixoId?: string | null
}

export interface GenOcupado {
  grupoId?: string | null
  professorId?: string | null
  espacoId?: string | null
  dia: number
  inicio: number
  fim: number
}

export interface GenPesos {
  preferenciaProfessor: number
  diaDoProfessor: number
  adjacenteGrupo: number
  buracoGrupo: number
  folgaCapacidade: number
  espacoFixo: number
  mesmoDiaDemanda: number
  espalhamento: number
}

export interface GenOpcoes {
  maxNos?: number
  maxMs?: number
  beam?: number
  gapMaxMin?: number
  maxAulasGrupoDia?: number
  pesos?: Partial<GenPesos>
}

export interface GenInput {
  grade: GenCelula[]
  grupos: GenGrupo[]
  professores: GenProfessor[]
  espacos: GenEspaco[]
  demandas: GenDemanda[]
  ocupados?: GenOcupado[]
  opcoes?: GenOpcoes
}

export interface GenAlocacao {
  demandaId: string
  grupoId: string
  disciplinaId: string
  professorId: string | null
  espacoId: string | null
  dia: number
  inicio: number
  fim: number
  aulas: number
  celulas: string[]
  pratica: boolean
}

export type MotivoPendencia =
  | 'SEM_ESPACO_COMPATIVEL'
  | 'ESPACO_INDISPONIVEL'
  | 'ESPACOS_OCUPADOS'
  | 'PROFESSOR_INDISPONIVEL'
  | 'PROFESSOR_OCUPADO'
  | 'LIMITE_PROFESSOR'
  | 'TURMA_OCUPADA'
  | 'LIMITE_DIARIO_TURMA'
  | 'FORA_DO_TURNO'
  | 'SEM_BLOCO_CONSECUTIVO'
  | 'GRUPO_INEXISTENTE'
  | 'SEM_HORARIOS'

export interface GenPendencia {
  demandaId: string
  grupoId: string
  disciplinaId: string
  professorId: string | null
  aulasFaltantes: number
  motivo: MotivoPendencia
  detalhe: string
  sugestao: string
  contagem: Record<string, number>
}

export interface GenResultado {
  alocacoes: GenAlocacao[]
  pendencias: GenPendencia[]
  metricas: {
    totalAulas: number
    alocadas: number
    pendentes: number
    nos: number
    ms: number
    pontuacao: number
    completo: boolean
    orcamentoEsgotado: boolean
  }
}

const PESOS: GenPesos = {
  preferenciaProfessor: 10,
  diaDoProfessor: 6,
  adjacenteGrupo: 8,
  buracoGrupo: -5,
  folgaCapacidade: -0.15,
  espacoFixo: 20,
  mesmoDiaDemanda: -40,
  espalhamento: 3,
}

interface Bloco {
  demanda: GenDemanda
  n: number                 // índice do bloco dentro da demanda
  tam: number
  dificuldade: number
}

interface Cand {
  i: number
  espacoId: string | null
  score: number
}

export function dividirBlocos(aulas: number, blocoMax: number): number[] {
  const max = Math.max(1, blocoMax)
  const partes = Math.ceil(aulas / max)
  const base = Math.floor(aulas / partes)
  const extra = aulas % partes
  return Array.from({ length: partes }, (_, k) => base + (k < extra ? 1 : 0))
}

// Ordem de desempate (mais específico/acionável primeiro)
const REASON_ORDER: MotivoPendencia[] = [
  'SEM_BLOCO_CONSECUTIVO',
  'FORA_DO_TURNO',
  'PROFESSOR_INDISPONIVEL',
  'LIMITE_PROFESSOR',
  'PROFESSOR_OCUPADO',
  'ESPACO_INDISPONIVEL',
  'ESPACOS_OCUPADOS',
  'LIMITE_DIARIO_TURMA',
  'TURMA_OCUPADA',
]

const SUGESTOES: Record<MotivoPendencia, string> = {
  SEM_ESPACO_COMPATIVEL: 'Cadastre/libere um espaço do tipo exigido com capacidade e recursos suficientes, ou relaxe os requisitos da disciplina.',
  ESPACO_INDISPONIVEL: 'Os espaços compatíveis estão bloqueados (manutenção/reservas fixas) nos horários possíveis; libere bloqueios ou inclua outro espaço.',
  ESPACOS_OCUPADOS: 'Todos os espaços compatíveis já estão ocupados nos horários em que turma e professor estão livres; amplie a malha de horários ou o parque de espaços.',
  PROFESSOR_INDISPONIVEL: 'Amplie a disponibilidade do professor ou redistribua a disciplina para outro docente.',
  PROFESSOR_OCUPADO: 'O professor já está alocado nos horários em que a turma está livre; redistribua a carga ou amplie a malha.',
  LIMITE_PROFESSOR: 'Os limites de aulas por dia/semana do professor impedem a alocação; ajuste os limites ou a atribuição.',
  TURMA_OCUPADA: 'O grupo/turma não tem horário livre suficiente na malha; reduza a carga semanal ou inclua horários.',
  LIMITE_DIARIO_TURMA: 'O limite diário de aulas do grupo foi atingido; aumente o limite ou inclua mais dias.',
  FORA_DO_TURNO: 'O turno/dias permitidos do grupo não possuem horários na malha.',
  SEM_BLOCO_CONSECUTIVO: 'A malha não tem aulas consecutivas suficientes para o bloco; reduza o bloco máximo da disciplina.',
  GRUPO_INEXISTENTE: 'Grupo da demanda não foi informado.',
  SEM_HORARIOS: 'A malha de horários está vazia.',
}

export function gerarCronograma(input: GenInput): GenResultado {
  const t0 = Date.now()
  const op = input.opcoes ?? {}
  const W: GenPesos = { ...PESOS, ...(op.pesos ?? {}) }
  const maxNos = op.maxNos ?? 40_000
  const maxMs = op.maxMs ?? 5_000
  const beam = Math.max(1, op.beam ?? 12)
  const gapMax = op.gapMaxMin ?? 30
  const maxGrupoDia = op.maxAulasGrupoDia ?? 8

  const cells = [...input.grade].sort((a, b) => a.dia - b.dia || a.inicio - b.inicio || a.id.localeCompare(b.id))
  const N = cells.length
  const adj: boolean[] = cells.map((c, i) => i + 1 < N && cells[i + 1].dia === c.dia && cells[i + 1].inicio - c.fim <= gapMax && cells[i + 1].inicio >= c.fim)
  const canBlock = (i: number, k: number) => {
    if (i + k > N) return false
    for (let t = 0; t < k - 1; t++) if (!adj[i + t]) return false
    return true
  }

  const grupos = new Map(input.grupos.map((g) => [g.id, g]))
  const profs = new Map(input.professores.map((p) => [p.id, p]))
  const espacos = new Map(input.espacos.map((e) => [e.id, e]))

  const marcar = (arr: Uint8Array, f: Faixa) => {
    for (let i = 0; i < N; i++) if (cells[i].dia === f.dia && overlap(cells[i].inicio, cells[i].fim, f.inicio, f.fim)) arr[i] = 1
  }
  const mk = () => new Uint8Array(N)

  // Bloqueios estáticos (indisponibilidade) e ocupação dinâmica
  const bloqG = new Map<string, Uint8Array>()
  const bloqP = new Map<string, Uint8Array>()
  const bloqE = new Map<string, Uint8Array>()
  const occG = new Map<string, Uint8Array>()
  const occP = new Map<string, Uint8Array>()
  const occE = new Map<string, Uint8Array>()
  const get = (m: Map<string, Uint8Array>, k: string) => {
    let a = m.get(k)
    if (!a) {
      a = mk()
      m.set(k, a)
    }
    return a
  }

  for (const g of input.grupos) {
    const b = get(bloqG, g.id)
    for (let i = 0; i < N; i++) {
      const turnoOk = !g.turno || !cells[i].turno || cells[i].turno === g.turno
      const diaOk = !g.diasPermitidos || g.diasPermitidos.length === 0 || g.diasPermitidos.includes(cells[i].dia)
      if (!turnoOk || !diaOk) b[i] = 1
    }
  }
  for (const p of input.professores) {
    const b = get(bloqP, p.id)
    if (p.disponivel && p.disponivel.length) {
      for (let i = 0; i < N; i++) {
        const dentro = p.disponivel.some((f) => f.dia === cells[i].dia && cells[i].inicio >= f.inicio && cells[i].fim <= f.fim)
        if (!dentro) b[i] = 1
      }
    }
    for (const f of p.indisponivel ?? []) marcar(b, f)
  }
  for (const e of input.espacos) {
    const b = get(bloqE, e.id)
    for (const f of e.indisponivel ?? []) marcar(b, f)
  }
  for (const o of input.ocupados ?? []) {
    const f = { dia: o.dia, inicio: o.inicio, fim: o.fim }
    if (o.grupoId) marcar(get(occG, o.grupoId), f)
    if (o.professorId) marcar(get(occP, o.professorId), f)
    if (o.espacoId) marcar(get(occE, o.espacoId), f)
  }

  const profDia = new Map<string, number[]>()
  const profSem = new Map<string, number>()
  const grpDia = new Map<string, number[]>()
  const demDias = new Map<string, number[]>() // demandaId -> dias já usados
  const dd = (m: Map<string, number[]>, k: string) => {
    let a = m.get(k)
    if (!a) {
      a = [0, 0, 0, 0, 0, 0, 0, 0]
      m.set(k, a)
    }
    return a
  }
  // aulas já ocupadas contam nos limites diários
  for (const o of input.ocupados ?? []) {
    for (let i = 0; i < N; i++) {
      if (cells[i].dia === o.dia && overlap(cells[i].inicio, cells[i].fim, o.inicio, o.fim)) {
        if (o.professorId) {
          dd(profDia, o.professorId)[o.dia]++
          profSem.set(o.professorId, (profSem.get(o.professorId) ?? 0) + 1)
        }
        if (o.grupoId) dd(grpDia, o.grupoId)[o.dia]++
      }
    }
  }

  // Espaços compatíveis por demanda
  const compat = new Map<string, GenEspaco[]>()
  const tiposPadrao = (d: GenDemanda) => (d.tiposEspaco && d.tiposEspaco.length ? d.tiposEspaco : d.pratica ? ['LABORATORIO'] : ['SALA_AULA', 'AUDITORIO'])
  for (const d of input.demandas) {
    if (d.online) {
      compat.set(d.id, [])
      continue
    }
    const alunos = Math.max(grupos.get(d.grupoId)?.alunos ?? 0, d.capacidadeMin ?? 0)
    const tipos = tiposPadrao(d)
    const lista = input.espacos
      .filter((e) => {
        if (d.espacoFixoId) return e.id === d.espacoFixoId
        if (!tipos.includes(e.tipo)) return false
        if (e.capacidade < alunos) return false
        const rec = new Set((e.recursos ?? []).map((r) => r.toLowerCase()))
        return (d.recursos ?? []).every((r) => rec.has(r.toLowerCase()))
      })
      .sort((a, b) => a.capacidade - b.capacidade || a.id.localeCompare(b.id))
    compat.set(d.id, lista)
  }

  const livre = (arr: Uint8Array | undefined, i: number, k: number) => {
    if (!arr) return true
    for (let t = 0; t < k; t++) if (arr[i + t]) return false
    return true
  }

  // Verificação dura de professor/grupo; devolve motivo da falha ou null
  function falhaGrupoProf(d: GenDemanda, i: number, k: number): MotivoPendencia | null {
    if (!livre(bloqG.get(d.grupoId), i, k)) return 'FORA_DO_TURNO'
    if (!livre(occG.get(d.grupoId), i, k)) return 'TURMA_OCUPADA'
    if (dd(grpDia, d.grupoId)[cells[i].dia] + k > maxGrupoDia) return 'LIMITE_DIARIO_TURMA'
    if (d.professorId) {
      if (!livre(bloqP.get(d.professorId), i, k)) return 'PROFESSOR_INDISPONIVEL'
      if (!livre(occP.get(d.professorId), i, k)) return 'PROFESSOR_OCUPADO'
      const p = profs.get(d.professorId)
      if (p?.maxAulasDia && dd(profDia, d.professorId)[cells[i].dia] + k > p.maxAulasDia) return 'LIMITE_PROFESSOR'
      if (p?.maxAulasSemana && (profSem.get(d.professorId) ?? 0) + k > p.maxAulasSemana) return 'LIMITE_PROFESSOR'
    }
    return null
  }

  // Todas as razões que impedem um início (usado só no diagnóstico das pendências)
  function falhasTodas(d: GenDemanda, i: number, k: number): MotivoPendencia[] {
    const r: MotivoPendencia[] = []
    const dia = cells[i].dia
    if (!livre(bloqG.get(d.grupoId), i, k)) r.push('FORA_DO_TURNO')
    if (!livre(occG.get(d.grupoId), i, k)) r.push('TURMA_OCUPADA')
    if (dd(grpDia, d.grupoId)[dia] + k > maxGrupoDia) r.push('LIMITE_DIARIO_TURMA')
    if (d.professorId) {
      if (!livre(bloqP.get(d.professorId), i, k)) r.push('PROFESSOR_INDISPONIVEL')
      if (!livre(occP.get(d.professorId), i, k)) r.push('PROFESSOR_OCUPADO')
      const p = profs.get(d.professorId)
      if ((p?.maxAulasDia && dd(profDia, d.professorId)[dia] + k > p.maxAulasDia) || (p?.maxAulasSemana && (profSem.get(d.professorId) ?? 0) + k > p.maxAulasSemana)) r.push('LIMITE_PROFESSOR')
    }
    return r
  }

  function candidatos(b: Bloco): Cand[] {
    const d = b.demanda
    const k = b.tam
    const out: Cand[] = []
    const g = grupos.get(d.grupoId)
    const alunos = g?.alunos ?? 0
    const prof = d.professorId ? profs.get(d.professorId) : undefined
    const usados = demDias.get(d.id)
    for (let i = 0; i < N; i++) {
      if (!canBlock(i, k)) continue
      if (falhaGrupoProf(d, i, k)) continue
      const dia = cells[i].dia
      // pontuação independente do espaço
      let base = 0
      if (prof?.preferencias?.length) {
        for (let t = 0; t < k; t++) if (prof.preferencias.some((f) => f.dia === dia && cells[i + t].inicio >= f.inicio && cells[i + t].fim <= f.fim)) base += W.preferenciaProfessor
      }
      if (d.professorId && dd(profDia, d.professorId)[dia] > 0) base += W.diaDoProfessor
      const gd = dd(grpDia, d.grupoId)[dia]
      if (gd > 0) {
        const og = occG.get(d.grupoId)
        const vizinho = (i > 0 && adj[i - 1] && og?.[i - 1]) || (adj[i + k - 1] && i + k < N && og?.[i + k])
        base += vizinho ? W.adjacenteGrupo : W.buracoGrupo
      }
      if (usados) {
        if (usados[dia] > 0) base += W.mesmoDiaDemanda
        else {
          const dist = Math.min(...usados.map((u, di) => (u > 0 ? Math.abs(di - dia) : 99)))
          if (dist >= 2 && dist < 99) base += W.espalhamento
        }
      }
      if (d.online) {
        out.push({ i, espacoId: null, score: base })
        continue
      }
      const spaces: Array<{ id: string; s: number }> = []
      for (const e of compat.get(d.id) ?? []) {
        if (!livre(bloqE.get(e.id), i, k)) continue
        if (!livre(occE.get(e.id), i, k)) continue
        let s = base + Math.max(-8, (e.capacidade - alunos) * W.folgaCapacidade)
        if (d.espacoFixoId === e.id) s += W.espacoFixo
        spaces.push({ id: e.id, s })
        if (spaces.length >= 2) break // compat já ordenado por menor capacidade
      }
      for (const sp of spaces) out.push({ i, espacoId: sp.id, score: sp.s })
    }
    out.sort((a, b) => b.score - a.score || a.i - b.i || String(a.espacoId).localeCompare(String(b.espacoId)))
    return out
  }

  function aplicar(b: Bloco, c: Cand, delta: 1 | 0) {
    const d = b.demanda
    const k = b.tam
    const dia = cells[c.i].dia
    const v = delta
    const set = (m: Map<string, Uint8Array>, key: string) => {
      const a = get(m, key)
      for (let t = 0; t < k; t++) a[c.i + t] = v
    }
    set(occG, d.grupoId)
    if (d.professorId) set(occP, d.professorId)
    if (c.espacoId) set(occE, c.espacoId)
    const s = v ? 1 : -1
    dd(grpDia, d.grupoId)[dia] += s * k
    if (d.professorId) {
      dd(profDia, d.professorId)[dia] += s * k
      profSem.set(d.professorId, (profSem.get(d.professorId) ?? 0) + s * k)
    }
    dd(demDias, d.id)[dia] += s
  }

  // Monta blocos
  const blocos: Bloco[] = []
  const pendPre: Array<{ b: Bloco; motivo: MotivoPendencia; detalhe: string }> = []
  for (const d of input.demandas) {
    if (!grupos.has(d.grupoId)) {
      pendPre.push({ b: { demanda: d, n: 0, tam: d.aulasSemana, dificuldade: 0 }, motivo: 'GRUPO_INEXISTENTE', detalhe: 'Grupo não encontrado.' })
      continue
    }
    const tamanhos = dividirBlocos(Math.max(0, d.aulasSemana), d.blocoMax ?? 2)
    tamanhos.forEach((tam, n) => blocos.push({ demanda: d, n, tam, dificuldade: 0 }))
  }
  if (N === 0) {
    for (const b of blocos) pendPre.push({ b, motivo: 'SEM_HORARIOS', detalhe: SUGESTOES.SEM_HORARIOS })
    blocos.length = 0
  }

  // Dificuldade (nº de candidatos no estado inicial) -> MRV; sem candidato = pendência certa
  const ativos: Bloco[] = []
  for (const b of blocos) {
    b.dificuldade = candidatos(b).length
    if (b.dificuldade === 0) pendPre.push({ b, motivo: 'SEM_HORARIOS', detalhe: '' })
    else ativos.push(b)
  }
  ativos.sort(
    (a, b) =>
      a.dificuldade - b.dificuldade ||
      b.tam - a.tam ||
      Number(!!b.demanda.pratica) - Number(!!a.demanda.pratica) ||
      a.demanda.id.localeCompare(b.demanda.id) ||
      a.n - b.n,
  )

  // Busca
  let nos = 0
  let esgotado = false
  let skipped = 0
  let score = 0
  let best: { skipped: number; score: number; escolha: Array<Cand | null> } | null = null
  const escolha: Array<Cand | null> = new Array(ativos.length).fill(null)
  let done = false

  function dfs(idx: number) {
    if (done) return
    if (best && skipped >= best.skipped) return
    if (idx === ativos.length) {
      if (!best || skipped < best.skipped || (skipped === best.skipped && score > best.score)) best = { skipped, score, escolha: escolha.slice() }
      if (skipped === 0) done = true
      return
    }
    nos++
    if (best && (nos > maxNos || ((nos & 127) === 0 && Date.now() - t0 > maxMs))) {
      esgotado = true
      done = true
      return
    }
    const b = ativos[idx]
    const cands = candidatos(b).slice(0, beam)
    for (const c of cands) {
      aplicar(b, c, 1)
      escolha[idx] = c
      score += c.score
      dfs(idx + 1)
      score -= c.score
      escolha[idx] = null
      aplicar(b, c, 0)
      if (done) return
    }
    // opção de pular o bloco (vira pendência)
    skipped += b.tam
    dfs(idx + 1)
    skipped -= b.tam
  }
  dfs(0)

  // Resultado
  const alocacoes: GenAlocacao[] = []
  const pendMap = new Map<string, GenPendencia>()
  const addPend = (b: Bloco, motivo: MotivoPendencia, detalhe: string, contagem: Record<string, number> = {}) => {
    const d = b.demanda
    const ex = pendMap.get(d.id)
    if (ex) {
      ex.aulasFaltantes += b.tam
      for (const [k, v] of Object.entries(contagem)) ex.contagem[k] = (ex.contagem[k] ?? 0) + v
      return
    }
    pendMap.set(d.id, {
      demandaId: d.id,
      grupoId: d.grupoId,
      disciplinaId: d.disciplinaId,
      professorId: d.professorId ?? null,
      aulasFaltantes: b.tam,
      motivo,
      detalhe,
      sugestao: SUGESTOES[motivo],
      contagem: { ...contagem },
    })
  }

  const finalBest = best as { skipped: number; score: number; escolha: Array<Cand | null> } | null
  const escolhaFinal = finalBest ? finalBest.escolha : new Array(ativos.length).fill(null)
  // reconstrói estado final para diagnóstico e saída
  ativos.forEach((b, idx) => {
    const c = escolhaFinal[idx]
    if (c) aplicar(b, c, 1)
  })
  ativos.forEach((b, idx) => {
    const c = escolhaFinal[idx]
    if (!c) return
    const d = b.demanda
    alocacoes.push({
      demandaId: d.id,
      grupoId: d.grupoId,
      disciplinaId: d.disciplinaId,
      professorId: d.professorId ?? null,
      espacoId: c.espacoId,
      dia: cells[c.i].dia,
      inicio: cells[c.i].inicio,
      fim: cells[c.i + b.tam - 1].fim,
      aulas: b.tam,
      celulas: cells.slice(c.i, c.i + b.tam).map((x) => x.id),
      pratica: !!d.pratica,
    })
  })
  ativos.forEach((b, idx) => {
    if (escolhaFinal[idx]) return
    const dg = diagnosticar(b)
    addPend(b, dg.motivo, dg.detalhe, dg.contagem)
  })
  for (const p of pendPre) {
    if (p.motivo === 'SEM_HORARIOS' && p.b.demanda && grupos.has(p.b.demanda.grupoId) && N > 0) {
      const dg = diagnosticar(p.b)
      addPend(p.b, dg.motivo, dg.detalhe, dg.contagem)
    } else addPend(p.b, p.motivo, p.detalhe || SUGESTOES[p.motivo])
  }

  function diagnosticar(b: Bloco): { motivo: MotivoPendencia; detalhe: string; contagem: Record<string, number> } {
    const d = b.demanda
    const k = b.tam
    const g = grupos.get(d.grupoId)
    const lista = compat.get(d.id) ?? []
    if (!d.online && lista.length === 0) {
      const alunos = Math.max(g?.alunos ?? 0, d.capacidadeMin ?? 0)
      return {
        motivo: 'SEM_ESPACO_COMPATIVEL',
        detalhe: `Nenhum espaço do tipo ${tiposPadrao(d).join('/')} com capacidade ≥ ${alunos}${d.recursos?.length ? ' e recursos [' + d.recursos.join(', ') + ']' : ''}${d.espacoFixoId ? ' (espaço fixo ' + d.espacoFixoId + ')' : ''}.`,
        contagem: {},
      }
    }
    const cont: Record<string, number> = {}
    const inc = (m: MotivoPendencia) => (cont[m] = (cont[m] ?? 0) + 1)
    let estrutural = 0
    for (let i = 0; i < N; i++) {
      if (!canBlock(i, k)) continue
      estrutural++
      for (const f of falhasTodas(d, i, k)) inc(f)
      if (!d.online) {
        const algumLivreBloq = lista.some((e) => livre(bloqE.get(e.id), i, k))
        const algumLivre = lista.some((e) => livre(bloqE.get(e.id), i, k) && livre(occE.get(e.id), i, k))
        if (!algumLivre) inc(algumLivreBloq ? 'ESPACOS_OCUPADOS' : 'ESPACO_INDISPONIVEL')
      }
    }
    if (estrutural === 0) {
      return { motivo: 'SEM_BLOCO_CONSECUTIVO', detalhe: `${d.rotulo ?? d.disciplinaId}: a malha não tem ${k} aulas consecutivas.`, contagem: cont }
    }
    let motivo: MotivoPendencia = 'TURMA_OCUPADA'
    let max = -1
    const outros = Object.keys(cont).some((m) => m !== 'FORA_DO_TURNO')
    for (const m of REASON_ORDER) {
      if (outros && m === 'FORA_DO_TURNO') continue
      if ((cont[m] ?? 0) > max) {
        max = cont[m] ?? 0
        motivo = m
      }
    }
    const nome = g?.nome ?? d.grupoId
    return { motivo, detalhe: `${d.rotulo ?? d.disciplinaId} (${nome}): bloco de ${k} aula(s) sem horário viável — ${Object.entries(cont).map(([m, v]) => `${m}=${v}`).join(', ')}.`, contagem: cont }
  }

  const totalAulas = input.demandas.reduce((s, d) => s + Math.max(0, d.aulasSemana), 0)
  const alocadas = alocacoes.reduce((s, a) => s + a.aulas, 0)
  const pendencias = [...pendMap.values()].sort((a, b) => b.aulasFaltantes - a.aulasFaltantes || a.demandaId.localeCompare(b.demandaId))
  alocacoes.sort((a, b) => a.dia - b.dia || a.inicio - b.inicio || a.demandaId.localeCompare(b.demandaId))
  return {
    alocacoes,
    pendencias,
    metricas: {
      totalAulas,
      alocadas,
      pendentes: totalAulas - alocadas,
      nos,
      ms: Date.now() - t0,
      pontuacao: finalBest ? Math.round(finalBest.score * 100) / 100 : 0,
      completo: totalAulas === alocadas,
      orcamentoEsgotado: esgotado,
    },
  }
}

/** Auditoria independente de um resultado: devolve descrições de choques (deve ser vazio). */
export function verificarResultado(input: GenInput, alocacoes: GenAlocacao[]): string[] {
  const erros: string[] = []
  const esp = new Map(input.espacos.map((e) => [e.id, e]))
  const grp = new Map(input.grupos.map((g) => [g.id, g]))
  const dem = new Map(input.demandas.map((d) => [d.id, d]))
  const all = alocacoes.map((a, i) => ({ ...a, idx: i }))
  for (let i = 0; i < all.length; i++) {
    const a = all[i]
    const d = dem.get(a.demandaId)
    if (a.espacoId) {
      const e = esp.get(a.espacoId)
      if (!e) erros.push(`espaço inexistente ${a.espacoId}`)
      else {
        if (e.capacidade < (grp.get(a.grupoId)?.alunos ?? 0)) erros.push(`capacidade insuficiente em ${e.id}`)
        if (d?.pratica && !(d.tiposEspaco?.length) && e.tipo !== 'LABORATORIO') erros.push(`prática fora de laboratório (${a.demandaId})`)
      }
    }
    for (let j = i + 1; j < all.length; j++) {
      const b = all[j]
      if (a.dia !== b.dia || !overlap(a.inicio, a.fim, b.inicio, b.fim)) continue
      const quando = `${DIAS_SEMANA[a.dia]} ${minToHHMM(a.inicio)}`
      if (a.grupoId === b.grupoId) erros.push(`grupo ${a.grupoId} em choque ${quando}`)
      if (a.professorId && a.professorId === b.professorId) erros.push(`professor ${a.professorId} em choque ${quando}`)
      if (a.espacoId && a.espacoId === b.espacoId) erros.push(`espaço ${a.espacoId} em choque ${quando}`)
    }
    for (const o of input.ocupados ?? []) {
      if (o.dia !== a.dia || !overlap(o.inicio, o.fim, a.inicio, a.fim)) continue
      if ((o.grupoId && o.grupoId === a.grupoId) || (o.professorId && o.professorId === a.professorId) || (o.espacoId && o.espacoId === a.espacoId))
        erros.push(`choque com compromisso fixo (${DIAS_SEMANA[a.dia]} ${minToHHMM(a.inicio)})`)
    }
    const p = a.professorId ? input.professores.find((x) => x.id === a.professorId) : undefined
    if (p) {
      for (const f of p.indisponivel ?? []) if (f.dia === a.dia && overlap(f.inicio, f.fim, a.inicio, a.fim)) erros.push(`professor ${p.id} indisponível (${DIAS_SEMANA[a.dia]} ${minToHHMM(a.inicio)})`)
      if (p.disponivel?.length && !p.disponivel.some((f) => f.dia === a.dia && a.inicio >= f.inicio && a.fim <= f.fim)) erros.push(`professor ${p.id} fora da disponibilidade`)
    }
    const e = a.espacoId ? esp.get(a.espacoId) : undefined
    if (e) for (const f of e.indisponivel ?? []) if (f.dia === a.dia && overlap(f.inicio, f.fim, a.inicio, a.fim)) erros.push(`espaço ${e.id} bloqueado`)
  }
  return erros
}
