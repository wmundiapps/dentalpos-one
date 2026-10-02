import assert from 'node:assert/strict'
import { gerarCronograma, verificarResultado, dividirBlocos, GenInput, GenCelula } from './scheduler'
import { detectSlotConflicts, conflictsForCandidate, calcOcupacao, janelasLivres } from './conflicts'
import { feriadosNacionais, pascoa } from './holidays'
import { expandRecorrencia, fromLocal, isoWeekday, localDateKey, hhmmToMin, minToHHMM } from './time'
import { buildIcs, icsFold, rruleSemanal } from './ical'
import { prazoEfetivo, situacaoPrazo, agendaLembretes, nivelEscalonamento } from './deadlines'
import { conflitosExame, conflitosReserva } from './rules'
import { calcularDiasLetivos } from './diasLetivos'

let n = 0
const t = (nome: string, fn: () => void) => {
  fn()
  n++
  console.log('ok -', nome)
}

// malha: seg-sex, noite 4 aulas (19:00, 19:50, 20:40*, 21:30) ; manhã 2 aulas
function malha(dias = [1, 2, 3, 4, 5]): GenCelula[] {
  const out: GenCelula[] = []
  for (const d of dias) {
    ;['19:00', '19:50', '20:50', '21:40'].forEach((h, i) => {
      const ini = hhmmToMin(h)
      out.push({ id: `d${d}n${i + 1}`, dia: d, inicio: ini, fim: ini + 50, turno: 'NOITE' })
    })
    ;['08:00', '08:50'].forEach((h, i) => {
      const ini = hhmmToMin(h)
      out.push({ id: `d${d}m${i + 1}`, dia: d, inicio: ini, fim: ini + 50, turno: 'MANHA' })
    })
  }
  return out
}

t('datas e feriados', () => {
  assert.deepEqual(pascoa(2026), { y: 2026, m: 4, d: 5 })
  const f = feriadosNacionais(2026)
  assert.ok(f.find((x) => x.data === '2026-04-03' && x.nome === 'Sexta-feira Santa'))
  assert.ok(f.find((x) => x.data === '2026-02-17' && x.nome.startsWith('Carnaval')))
  assert.ok(f.find((x) => x.data === '2026-06-04' && x.nome === 'Corpus Christi'))
  assert.ok(f.find((x) => x.data === '2026-11-20'))
  assert.equal(isoWeekday(fromLocal(2026, 9, 2, 600)), 5) // 02/10/2026 é sexta
  assert.equal(localDateKey(fromLocal(2026, 0, 1, 23 * 60 + 30)), '2026-01-01')
  assert.equal(minToHHMM(1140), '19:00')
})

t('recorrência', () => {
  const i = fromLocal(2026, 1, 2, 19 * 60) // seg 02/02/2026
  const f = new Date(i.getTime() + 100 * 60000)
  const sem = expandRecorrencia({ inicio: i, fim: f, recorrencia: 'SEMANAL', ate: fromLocal(2026, 1, 28, 0) })
  assert.equal(sem.length, 4)
  const dias = expandRecorrencia({ inicio: i, fim: f, recorrencia: 'SEMANAL', diasSemana: [1, 3], ate: fromLocal(2026, 1, 15, 0) })
  assert.deepEqual(dias.map((x) => localDateKey(x.inicio)), ['2026-02-02', '2026-02-04', '2026-02-09', '2026-02-11'])
  const mensal = expandRecorrencia({ inicio: fromLocal(2026, 0, 31, 600), fim: fromLocal(2026, 0, 31, 660), recorrencia: 'MENSAL', ate: fromLocal(2026, 3, 30, 23 * 60) })
  assert.deepEqual(mensal.map((x) => localDateKey(x.inicio)), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'])
  const anual = expandRecorrencia({ inicio: fromLocal(2026, 8, 7, 0), fim: fromLocal(2026, 8, 8, 0), recorrencia: 'ANUAL', janelaDe: fromLocal(2028, 0, 1), janelaAte: fromLocal(2028, 11, 31) })
  assert.equal(anual.length, 1)
  assert.equal(localDateKey(anual[0].inicio), '2028-09-07')
})

t('detecção de choques', () => {
  const slots = [
    { id: 'a', diaSemana: 1, inicioMin: 1140, fimMin: 1240, grupo: 'G1', professorUserId: 'p1', spaceId: 's1', disciplineId: 'd1' },
    { id: 'b', diaSemana: 1, inicioMin: 1190, fimMin: 1290, grupo: 'G2', professorUserId: 'p1', spaceId: 's2', disciplineId: 'd2' }, // professor
    { id: 'c', diaSemana: 1, inicioMin: 1200, fimMin: 1260, grupo: 'G1', professorUserId: 'p2', spaceId: 's3', disciplineId: 'd3' }, // turma
    { id: 'd', diaSemana: 1, inicioMin: 1200, fimMin: 1260, grupo: 'G3', professorUserId: 'p3', spaceId: 's1', disciplineId: 'd4' }, // espaço
    { id: 'e', diaSemana: 2, inicioMin: 1200, fimMin: 1260, grupo: 'G3', professorUserId: 'p1', spaceId: 's1', disciplineId: 'd4' }, // outro dia
  ]
  const c = detectSlotConflicts(slots)
  assert.equal(c.filter((x) => x.tipo === 'PROFESSOR').length, 1)
  assert.equal(c.filter((x) => x.tipo === 'TURMA').length, 1)
  assert.equal(c.filter((x) => x.tipo === 'ESPACO').length, 1)
  // turma conjunta: mesma disciplina+professor+espaço
  const conj = detectSlotConflicts([
    { id: 'x', diaSemana: 1, inicioMin: 600, fimMin: 700, grupo: 'A', professorUserId: 'p', spaceId: 's', disciplineId: 'd' },
    { id: 'y', diaSemana: 1, inicioMin: 600, fimMin: 700, grupo: 'B', professorUserId: 'p', spaceId: 's', disciplineId: 'd' },
  ])
  assert.equal(conj.length, 0)
  const cand = { id: 'new', diaSemana: 1, inicioMin: 1150, fimMin: 1180, grupo: 'G9', professorUserId: 'p1', spaceId: 's9' }
  assert.equal(conflictsForCandidate(cand, slots).length, 1)
  assert.equal(conflictsForCandidate({ ...cand, inicioMin: 1500, fimMin: 1560 }, slots).length, 0)
})

t('ocupação e janelas livres', () => {
  const mal = [{ dia: 1, inicio: 1140, fim: 1340 }]
  const oc = calcOcupacao([{ id: 's', diaSemana: 1, inicioMin: 1140, fimMin: 1240, spaceId: 'S1' }], [{ id: 'S1' }, { id: 'S2' }], mal)
  assert.equal(oc[0].taxa, 0.5)
  assert.equal(oc[1].taxa, 0)
  assert.deepEqual(janelasLivres([[600, 700], [650, 720]], 480, 900), [[480, 600], [720, 900]])
})

t('dividir blocos', () => {
  assert.deepEqual(dividirBlocos(4, 2), [2, 2])
  assert.deepEqual(dividirBlocos(3, 2), [2, 1])
  assert.deepEqual(dividirBlocos(6, 4), [3, 3])
  assert.deepEqual(dividirBlocos(1, 2), [1])
})

t('gerador: cenário feliz, sem choques, prática em laboratório', () => {
  const input: GenInput = {
    grade: malha(),
    grupos: [
      { id: 'G1', alunos: 40, turno: 'NOITE' },
      { id: 'G2', alunos: 35, turno: 'NOITE' },
    ],
    professores: [{ id: 'P1' }, { id: 'P2' }, { id: 'P3' }],
    espacos: [
      { id: 'SALA1', tipo: 'SALA_AULA', capacidade: 45 },
      { id: 'SALA2', tipo: 'SALA_AULA', capacidade: 40 },
      { id: 'LAB1', tipo: 'LABORATORIO', capacidade: 20, recursos: ['bancadas'] },
      { id: 'LAB2', tipo: 'LABORATORIO', capacidade: 40, recursos: ['bancadas', 'autoclave'] },
    ],
    demandas: [
      { id: 'D1', grupoId: 'G1', disciplinaId: 'ANAT', professorId: 'P1', aulasSemana: 4 },
      { id: 'D2', grupoId: 'G1', disciplinaId: 'FISIO', professorId: 'P2', aulasSemana: 4, pratica: true, recursos: ['bancadas'] },
      { id: 'D3', grupoId: 'G2', disciplinaId: 'ANAT', professorId: 'P1', aulasSemana: 4 },
      { id: 'D4', grupoId: 'G2', disciplinaId: 'BIOQ', professorId: 'P3', aulasSemana: 4, pratica: true },
    ],
  }
  const r = gerarCronograma(input)
  assert.equal(r.pendencias.length, 0, JSON.stringify(r.pendencias))
  assert.equal(r.metricas.alocadas, 16)
  assert.deepEqual(verificarResultado(input, r.alocacoes), [])
  for (const a of r.alocacoes.filter((x) => x.pratica)) assert.ok(a.espacoId!.startsWith('LAB'), 'prática em lab')
  // capacidade: LAB1 (20) não comporta grupos de 35/40
  assert.ok(r.alocacoes.filter((x) => x.pratica).every((x) => x.espacoId === 'LAB2'))
  // aulas teóricas não ocupam laboratório
  assert.ok(r.alocacoes.filter((x) => !x.pratica).every((x) => x.espacoId!.startsWith('SALA')))
  // blocos de no máximo 2 aulas geminadas
  assert.ok(r.alocacoes.every((x) => x.aulas <= 2))
})

t('gerador: professor compartilhado em dois grupos nunca choca', () => {
  const input: GenInput = {
    grade: malha([1, 2]),
    grupos: [
      { id: 'G1', alunos: 30, turno: 'NOITE' },
      { id: 'G2', alunos: 30, turno: 'NOITE' },
    ],
    professores: [{ id: 'P1' }],
    espacos: [{ id: 'S1', tipo: 'SALA_AULA', capacidade: 40 }, { id: 'S2', tipo: 'SALA_AULA', capacidade: 40 }],
    demandas: [
      { id: 'D1', grupoId: 'G1', disciplinaId: 'X', professorId: 'P1', aulasSemana: 4 },
      { id: 'D2', grupoId: 'G2', disciplinaId: 'Y', professorId: 'P1', aulasSemana: 4 },
    ],
  }
  const r = gerarCronograma(input)
  assert.equal(r.metricas.alocadas, 8)
  assert.deepEqual(verificarResultado(input, r.alocacoes), [])
})

t('gerador: indisponibilidade/disponibilidade do professor é respeitada', () => {
  const input: GenInput = {
    grade: malha([1, 2, 3]),
    grupos: [{ id: 'G1', alunos: 20, turno: 'NOITE' }],
    professores: [{ id: 'P1', disponivel: [{ dia: 2, inicio: 1140, fim: 1350 }], indisponivel: [{ dia: 2, inicio: 1140, fim: 1190 }] }],
    espacos: [{ id: 'S1', tipo: 'SALA_AULA', capacidade: 30 }],
    demandas: [{ id: 'D1', grupoId: 'G1', disciplinaId: 'X', professorId: 'P1', aulasSemana: 3 }],
  }
  const r = gerarCronograma(input)
  // terça: 19:50, 20:50, 21:40 -> 3 aulas possíveis, sendo só 2 consecutivas+1 isolada (gap 20/0 min) — todas na terça
  assert.equal(r.metricas.alocadas, 3)
  assert.ok(r.alocacoes.every((a) => a.dia === 2 && a.inicio >= 1190))
  assert.deepEqual(verificarResultado(input, r.alocacoes), [])
})

t('gerador: pendências com motivo (sem laboratório compatível)', () => {
  const input: GenInput = {
    grade: malha([1]),
    grupos: [{ id: 'G1', alunos: 50, turno: 'NOITE' }],
    professores: [{ id: 'P1' }],
    espacos: [{ id: 'S1', tipo: 'SALA_AULA', capacidade: 60 }, { id: 'LAB1', tipo: 'LABORATORIO', capacidade: 25 }],
    demandas: [
      { id: 'D1', grupoId: 'G1', disciplinaId: 'PRAT', professorId: 'P1', aulasSemana: 2, pratica: true },
      { id: 'D2', grupoId: 'G1', disciplinaId: 'TEO', professorId: 'P1', aulasSemana: 2 },
    ],
  }
  const r = gerarCronograma(input)
  assert.equal(r.metricas.alocadas, 2)
  assert.equal(r.pendencias.length, 1)
  assert.equal(r.pendencias[0].demandaId, 'D1')
  assert.equal(r.pendencias[0].motivo, 'SEM_ESPACO_COMPATIVEL')
  assert.equal(r.pendencias[0].aulasFaltantes, 2)
})

t('gerador: excesso de carga vira pendência de turma/professor ocupado', () => {
  const input: GenInput = {
    grade: malha([1]), // 4 aulas noturnas na segunda
    grupos: [{ id: 'G1', alunos: 20, turno: 'NOITE' }],
    professores: [{ id: 'P1' }, { id: 'P2' }],
    espacos: [{ id: 'S1', tipo: 'SALA_AULA', capacidade: 30 }, { id: 'S2', tipo: 'SALA_AULA', capacidade: 30 }],
    demandas: [
      { id: 'D1', grupoId: 'G1', disciplinaId: 'A', professorId: 'P1', aulasSemana: 3, blocoMax: 3 },
      { id: 'D2', grupoId: 'G1', disciplinaId: 'B', professorId: 'P2', aulasSemana: 3, blocoMax: 3 },
    ],
  }
  const r = gerarCronograma(input)
  assert.equal(r.metricas.alocadas, 3)
  assert.equal(r.pendencias.length, 1)
  assert.equal(r.pendencias[0].motivo, 'TURMA_OCUPADA')
  assert.deepEqual(verificarResultado(input, r.alocacoes), [])
})

t('gerador: compromissos fixos (grade manual) são respeitados; limites diários', () => {
  const input: GenInput = {
    grade: malha([1, 2]),
    grupos: [{ id: 'G1', alunos: 20, turno: 'NOITE' }],
    professores: [{ id: 'P1' }],
    espacos: [{ id: 'S1', tipo: 'SALA_AULA', capacidade: 30 }],
    ocupados: [{ espacoId: 'S1', dia: 1, inicio: 1140, fim: 1340 }], // segunda inteira ocupada na S1
    demandas: [{ id: 'D1', grupoId: 'G1', disciplinaId: 'A', professorId: 'P1', aulasSemana: 4 }],
  }
  const r = gerarCronograma(input)
  assert.equal(r.metricas.alocadas, 4)
  assert.ok(r.alocacoes.every((a) => a.dia === 2))
  assert.ok(r.alocacoes.every((a) => a.aulas <= 2))
  assert.deepEqual(verificarResultado(input, r.alocacoes), [])
  // segunda inteira ocupada na única sala: tudo vai para a terça
  assert.equal(r.alocacoes.filter((a) => a.dia === 2).reduce((s, a) => s + a.aulas, 0), 4)
})

t('gerador: limite diário do professor gera pendência LIMITE_PROFESSOR', () => {
  const input: GenInput = {
    grade: malha([1]),
    grupos: [{ id: 'G1', alunos: 20, turno: 'NOITE' }],
    professores: [{ id: 'P1', maxAulasDia: 2 }],
    espacos: [{ id: 'S1', tipo: 'SALA_AULA', capacidade: 30 }],
    demandas: [{ id: 'D1', grupoId: 'G1', disciplinaId: 'A', professorId: 'P1', aulasSemana: 4 }],
  }
  const r = gerarCronograma(input)
  assert.equal(r.metricas.alocadas, 2)
  assert.equal(r.pendencias[0].motivo, 'LIMITE_PROFESSOR')
})

t('gerador: escala (20 grupos x 6 disciplinas) conclui rápido e sem choques', () => {
  const grupos = Array.from({ length: 20 }, (_, i) => ({ id: `G${i}`, alunos: 30 + (i % 10), turno: 'NOITE' as string }))
  const professores = Array.from({ length: 30 }, (_, i) => ({ id: `P${i}`, maxAulasDia: 6 }))
  const espacos = [
    ...Array.from({ length: 14 }, (_, i) => ({ id: `S${i}`, tipo: 'SALA_AULA', capacidade: 40 + (i % 3) * 5 })),
    ...Array.from({ length: 4 }, (_, i) => ({ id: `L${i}`, tipo: 'LABORATORIO', capacidade: 40 })),
  ]
  const demandas = grupos.flatMap((g, gi) =>
    Array.from({ length: 6 }, (_, k) => ({
      id: `D${gi}_${k}`,
      grupoId: g.id,
      disciplinaId: `X${k}`,
      professorId: `P${(gi * 3 + k) % 30}`,
      aulasSemana: k === 5 ? 2 : 3,
      pratica: k === 5,
    })),
  )
  const input: GenInput = { grade: malha(), grupos, professores, espacos, demandas, opcoes: { maxMs: 3000 } }
  const r = gerarCronograma(input)
  assert.deepEqual(verificarResultado(input, r.alocacoes), [])
  assert.ok(r.metricas.alocadas >= 0.9 * r.metricas.totalAulas, `alocadas ${r.metricas.alocadas}/${r.metricas.totalAulas}`)
  assert.ok(r.metricas.ms < 8000)
})

t('determinismo', () => {
  const input: GenInput = {
    grade: malha([1, 2, 3]),
    grupos: [{ id: 'G1', alunos: 20, turno: 'NOITE' }],
    professores: [{ id: 'P1' }],
    espacos: [{ id: 'S1', tipo: 'SALA_AULA', capacidade: 30 }],
    demandas: [{ id: 'D1', grupoId: 'G1', disciplinaId: 'A', professorId: 'P1', aulasSemana: 4 }],
  }
  assert.deepEqual(gerarCronograma(input).alocacoes, gerarCronograma(input).alocacoes)
})

t('iCal', () => {
  const ics = buildIcs(
    [
      { uid: 'a@x', titulo: 'Anatomia; "Teórica", sala 1', inicio: fromLocal(2026, 1, 2, 1140), fim: fromLocal(2026, 1, 2, 1240), rrule: rruleSemanal(fromLocal(2026, 5, 30, 0)), exdates: [fromLocal(2026, 3, 20, 1140)] },
      { uid: 'b@x', titulo: 'Feriado', inicio: fromLocal(2026, 3, 21, 0), fim: fromLocal(2026, 3, 22, 0), diaInteiro: true },
    ],
    { nome: 'Turma X' },
  )
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'))
  assert.ok(ics.includes('SUMMARY:Anatomia\; "Teórica"\\, sala 1'))
  assert.ok(ics.includes('DTSTART:20260202T220000Z'))
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20260421'))
  assert.ok(ics.includes('DTEND;VALUE=DATE:20260422'))
  assert.ok(ics.includes('RRULE:FREQ=WEEKLY;INTERVAL=1;UNTIL='))
  for (const l of ics.split('\r\n')) assert.ok(Buffer.byteLength(l) <= 75, l)
  assert.ok(icsFold('x'.repeat(200)).split('\r\n').every((l) => l.length <= 75))
})

t('prazos de notas', () => {
  const now = new Date('2026-06-10T12:00:00Z')
  const p = { prazo: new Date('2026-06-12T12:00:00Z'), abertura: new Date('2026-06-01T00:00:00Z') }
  assert.equal(situacaoPrazo(p, now).situacao, 'VENCE_EM_BREVE')
  assert.equal(situacaoPrazo({ ...p, prazo: new Date('2026-06-30T00:00:00Z') }, now).situacao, 'ABERTO')
  assert.equal(situacaoPrazo({ ...p, abertura: new Date('2026-06-11T00:00:00Z') }, now).situacao, 'NAO_ABERTO')
  assert.equal(situacaoPrazo({ ...p, prazo: new Date('2026-06-09T00:00:00Z') }, now).situacao, 'ENCERRADO')
  const exc = new Date('2026-06-20T00:00:00Z')
  assert.equal(prazoEfetivo({ prazo: new Date('2026-06-09T00:00:00Z') }, exc).getTime(), exc.getTime())
  assert.equal(situacaoPrazo({ ...p, prazo: new Date('2026-06-09T00:00:00Z') }, now, exc).aberto, true)
  assert.deepEqual(agendaLembretes(new Date('2026-06-30T12:00:00Z'), now).map((x) => x.dias), [7, 3, 1])
  assert.deepEqual(agendaLembretes(new Date('2026-06-12T12:00:00Z'), now).map((x) => x.dias), [1])
  assert.equal(nivelEscalonamento(new Date('2026-06-12T00:00:00Z'), now), 0)
  assert.equal(nivelEscalonamento(new Date('2026-06-09T00:00:00Z'), now), 1)
  assert.equal(nivelEscalonamento(new Date('2026-06-05T00:00:00Z'), now), 2)
})

t('regras de prova e reserva', () => {
  const base = { id: 'e1', classSectionId: 'cs1', grupo: 'G1', spaceId: 'S1', professorUserId: 'P1', fiscais: ['F1'], inicio: fromLocal(2026, 5, 10, 8 * 60), fim: fromLocal(2026, 5, 10, 10 * 60) }
  const mesmoDia = { id: 'e2', classSectionId: 'cs2', grupo: 'G1', spaceId: 'S2', inicio: fromLocal(2026, 5, 10, 14 * 60), fim: fromLocal(2026, 5, 10, 16 * 60) }
  assert.deepEqual(conflitosExame(mesmoDia, [base]).map((c) => c.tipo), ['PROVA'])
  const sala = { id: 'e3', classSectionId: 'cs9', grupo: 'G9', spaceId: 'S1', fiscais: ['F1'], inicio: fromLocal(2026, 5, 10, 9 * 60), fim: fromLocal(2026, 5, 10, 11 * 60) }
  assert.deepEqual(conflitosExame(sala, [base]).map((c) => c.tipo).sort(), ['ESPACO', 'FISCAL'])
  assert.equal(conflitosExame(sala, [{ ...base, status: 'CANCELADA' }]).length, 0)
  const r = { id: 'r', spaceId: 'S1', inicio: base.inicio, fim: base.fim }
  assert.equal(conflitosReserva(r, [{ id: 'x', spaceId: 'S1', inicio: fromLocal(2026, 5, 10, 9 * 60), fim: fromLocal(2026, 5, 10, 9 * 60 + 30), status: 'APROVADA' }, { id: 'y', spaceId: 'S1', inicio: base.inicio, fim: base.fim, status: 'PENDENTE' }]).length, 1)
})

t('dias letivos', () => {
  const r = calcularDiasLetivos({
    inicio: fromLocal(2026, 1, 2, 0), // seg 02/02
    fim: fromLocal(2026, 1, 15, 0),   // dom 15/02
    bloqueios: [{ inicio: fromLocal(2026, 1, 4, 0), fim: fromLocal(2026, 1, 6, 0), titulo: 'Recesso' }],
    extras: [{ inicio: fromLocal(2026, 1, 7, 0), fim: fromLocal(2026, 1, 8, 0), titulo: 'Sábado letivo' }],
  })
  // 10 dias úteis - 2 (qua 04 e qui 05) + 1 sábado extra
  assert.equal(r.totalDias, 9)
  assert.equal(r.naoLetivos.length, 2)
  assert.deepEqual(r.extras, ['2026-02-07'])
  assert.equal(r.semanasLetivas, 2)
  assert.equal(r.porDiaSemana[6], 1)
})

console.log(`\n${n} grupos de testes passaram`)
