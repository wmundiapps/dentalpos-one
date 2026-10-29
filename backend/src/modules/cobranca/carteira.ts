import { CobPolitica } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { FAIXAS, Faixa, agingVazio, faixaDeAtraso, round2, saldoDoTitulo } from './calculo'

const db = prisma as any

export type PoliticaCob = Omit<CobPolitica, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'> & { id: string | null }

export const POLITICA_DEFAULT: PoliticaCob = {
  id: null,
  nome: 'Padrão (nenhuma política cadastrada)',
  segmento: 'TODOS',
  ativa: true,
  multaPct: 2,
  jurosTipo: 'MENSAL',
  jurosPct: 1,
  jurosComposto: false,
  correcaoPctAnual: 0,
  correcaoIndice: 'NENHUM',
  toleranciaDias: 0,
  descontoQuitacaoEncargosPct: 0,
  descontoQuitacaoPrincipalPct: 0,
  descontoMaxPct: 30,
  bloqueiaDescontoComBolsa: true,
  entradaMinPct: 10,
  parcelasMax: 12,
  parcelaMinima: 50,
  jurosParcelamentoPct: 0,
  validadePropostaDias: 7,
  toleranciaQuebraDias: 5,
  aplicarEncargosAcordo: true,
  pausaComPromessa: true,
  baseLegal: 'EXECUCAO_CONTRATO',
  janelaInicio: '08:00',
  janelaFim: '20:00',
  diasContato: [1, 2, 3, 4, 5],
  bloqueiaFeriados: true,
  limiteContatosDia: 1,
  limiteContatosSemana: 4,
  diasAvisoPrevio: 10,
  valorMinimoExecucao: 200,
}

export async function carregarPoliticas(tenantId: string): Promise<PoliticaCob[]> {
  return (await prisma.cobPolitica.findMany({ where: { tenantId, ativa: true }, orderBy: { updatedAt: 'desc' } })) as PoliticaCob[]
}

/** Política do segmento; senão a de TODOS; senão o padrão embutido. */
export function politicaPara(politicas: PoliticaCob[], segmento: string): PoliticaCob {
  return politicas.find((p) => p.segmento === segmento) ?? politicas.find((p) => p.segmento === 'TODOS') ?? POLITICA_DEFAULT
}

export interface InfoAluno {
  id: string
  nome: string
  ra: string
  statusAluno: string
  cursoId: string | null
  curso: string | null
  turmaId: string | null
  turma: string | null
  poloId: string | null
  polo: string | null
  segmento: 'GRADUACAO' | 'POS' | 'EAD'
  temBolsa: boolean
}

const quebra = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, (i + 1) * n))

export async function infoAlunos(tenantId: string, ids: string[], now = new Date()): Promise<Map<string, InfoAluno>> {
  const out = new Map<string, InfoAluno>()
  for (const lote of quebra([...new Set(ids)], 2000)) {
    const alunos = await prisma.student.findMany({ where: { tenantId, id: { in: lote } }, select: { id: true, nomeCompleto: true, ra: true, status: true } })
    const enr = new Map<string, any>()
    const turmaPorMat = new Map<string, { id: string; nome: string }>()
    const polos = new Map<string, any>()
    const pos = new Set<string>()
    const bolsa = new Set<string>()
    try {
      const mats = await db.enrollment.findMany({ where: { studentId: { in: lote } }, include: { program: { select: { id: true, nome: true, modalidade: true } } }, orderBy: { dataMatricula: 'desc' } })
      for (const m of mats) {
        const cur = enr.get(m.studentId)
        if (!cur || (cur.status !== 'ATIVA' && m.status === 'ATIVA')) enr.set(m.studentId, m)
      }
      const cse = await db.classSectionEnrollment.findMany({ where: { enrollmentId: { in: [...enr.values()].map((m) => m.id) } }, include: { classSection: { select: { id: true, nome: true } } } })
      for (const c of cse) {
        const cur = turmaPorMat.get(c.enrollmentId)
        if (c.classSection && (!cur || c.classSection.nome < cur.nome)) turmaPorMat.set(c.enrollmentId, c.classSection)
      }
    } catch { /* acadêmico indisponível */ }
    try {
      for (const p of await db.modPoloAluno.findMany({ where: { tenantId, studentId: { in: lote }, ativo: true }, include: { polo: { select: { id: true, nome: true } } } })) polos.set(p.studentId, p.polo)
    } catch { /* modalidades indisponível */ }
    try {
      for (const p of await db.modPosAluno.findMany({ where: { tenantId, studentId: { in: lote } }, select: { studentId: true } })) pos.add(p.studentId)
    } catch { /* pós indisponível */ }
    try {
      for (const b of await db.apoConcessaoBolsa.findMany({ where: { tenantId, studentId: { in: lote }, status: 'ATIVA', inicio: { lte: now }, fim: { gte: now } }, select: { studentId: true } })) bolsa.add(b.studentId)
    } catch { /* apoio indisponível */ }
    for (const a of alunos) {
      const m = enr.get(a.id)
      const polo = polos.get(a.id)
      const t = m ? turmaPorMat.get(m.id) : undefined
      const segmento = pos.has(a.id) ? 'POS' : m?.program?.modalidade === 'EAD' || polo ? 'EAD' : 'GRADUACAO'
      out.set(a.id, { id: a.id, nome: a.nomeCompleto, ra: a.ra, statusAluno: a.status, cursoId: m?.program?.id ?? null, curso: m?.program?.nome ?? null, turmaId: t?.id ?? null, turma: t?.nome ?? null, poloId: polo?.id ?? null, polo: polo?.nome ?? null, segmento, temBolsa: bolsa.has(a.id) })
    }
  }
  return out
}

export interface TituloCalc {
  id: string
  studentId: string
  descricao: string
  parcela: number | null
  valor: number
  vencimento: Date
  diasAtraso: number
  faixa: Faixa
  principalRestante: number
  multa: number
  juros: number
  correcao: number
  encargos: number
  saldo: number
  emAcordo: boolean
  acordoId: string | null
  status: string
}

export interface LinhaDevedor {
  studentId: string
  nome: string
  ra: string
  statusAluno: string
  cursoId: string | null
  curso: string | null
  turmaId: string | null
  turma: string | null
  poloId: string | null
  polo: string | null
  segmento: string
  temBolsa: boolean
  politicaId: string | null
  titulosVencidos: number
  titulosAVencer: number
  vencimentoMaisAntigo: Date | null
  maiorAtraso: number
  faixa: Faixa
  principal: number
  multa: number
  juros: number
  correcao: number
  encargos: number
  saldo: number // vencido (principal + encargos) fora de acordo
  aVencer: number
  emAcordoValor: number
  aging: Record<Faixa, number>
  casoId: string | null
  status: string
  responsavelUserId: string | null
  ultimoContatoEm: Date | null
  ultimoContatoCanal: string | null
  ultimoContatoResultado: string | null
  naoContatar: boolean
  promessaData: Date | null
  promessaValor: number | null
  acordoId: string | null
  acordoNumero: string | null
}

export interface Carteira {
  /** studentId quando a carteira foi montada só para um aluno (a sincronização de casos fica restrita a ele) */
  escopo?: string
  linhas: LinhaDevedor[]
  titulos: Map<string, TituloCalc[]>
  politicas: PoliticaCob[]
  info: Map<string, InfoAluno>
  totais: { devedores: number; principal: number; encargos: number; saldo: number; aVencer: number; emAcordo: number; aging: Record<Faixa, { valor: number; titulos: number; alunos: number }> }
}

const ABERTOS = ['PENDENTE', 'ATRASADO']

/** Monta a carteira (títulos em aberto -> linhas por aluno) com encargos calculados "ao vivo" na data informada. */
export async function montarCarteira(tenantId: string, now = new Date(), opts: { studentId?: string; politicas?: PoliticaCob[] } = {}): Promise<Carteira> {
  const politicas = opts.politicas ?? (await carregarPoliticas(tenantId))
  const titulosDb: any[] = await db.accountReceivable.findMany({
    where: { tenantId, status: { in: ABERTOS }, dataPagamento: null, ...(opts.studentId ? { studentId: opts.studentId } : {}) },
    orderBy: { dataVencimento: 'asc' },
    take: 60000,
  })
  const ids = [...new Set(titulosDb.map((t) => t.studentId as string))]
  const info = await infoAlunos(tenantId, ids, now)
  const rids = titulosDb.map((t) => t.id as string)
  const [cobertos, aloc, casos, promessas] = await Promise.all([
    rids.length ? prisma.cobAcordoTitulo.findMany({ where: { tenantId, receivableId: { in: rids } } }) : [],
    rids.length ? prisma.cobAlocacao.findMany({ where: { tenantId, receivableId: { in: rids } } }) : [],
    ids.length ? prisma.cobCaso.findMany({ where: { tenantId, studentId: { in: ids } } }) : [],
    ids.length ? prisma.cobPromessa.findMany({ where: { tenantId, studentId: { in: ids }, status: 'ABERTA' }, orderBy: { dataPrometida: 'asc' } }) : [],
  ])
  const acordoIds = [...new Set(cobertos.map((c) => c.acordoId))]
  const acordosAtivos = acordoIds.length ? await prisma.cobAcordo.findMany({ where: { tenantId, id: { in: acordoIds }, status: 'ATIVO' } }) : []
  const ativoPorId = new Map(acordosAtivos.map((a) => [a.id, a]))
  const cobertura = new Map<string, string>() // receivableId -> acordoId ATIVO
  for (const c of cobertos) if (ativoPorId.has(c.acordoId)) cobertura.set(c.receivableId, c.acordoId)
  const alocPor = new Map<string, typeof aloc>()
  for (const a of aloc) alocPor.set(a.receivableId, [...(alocPor.get(a.receivableId) ?? []), a])
  const casoPor = new Map(casos.map((c) => [c.studentId, c] as const))
  const promPor = new Map<string, (typeof promessas)[number]>()
  for (const p of promessas) if (!promPor.has(p.studentId)) promPor.set(p.studentId, p)
  const acordoPorAluno = new Map<string, (typeof acordosAtivos)[number]>()
  for (const a of acordosAtivos) acordoPorAluno.set(a.studentId, a)

  const titulos = new Map<string, TituloCalc[]>()
  const linhasMap = new Map<string, LinhaDevedor>()
  const totais: Carteira['totais'] = { devedores: 0, principal: 0, encargos: 0, saldo: 0, aVencer: 0, emAcordo: 0, aging: Object.fromEntries(FAIXAS.map((f) => [f, { valor: 0, titulos: 0, alunos: 0 }])) as any }
  const alunosPorFaixa = new Map<Faixa, Set<string>>(FAIXAS.map((f) => [f, new Set()]))

  for (const t of titulosDb) {
    const sid = t.studentId as string
    const ia = info.get(sid)
    const pol = politicaPara(politicas, ia?.segmento ?? 'GRADUACAO')
    const s = saldoDoTitulo(t.valor, t.dataVencimento, now, pol, alocPor.get(t.id) ?? [])
    if (s.principalRestante <= 0) continue
    const f = s.encargosBrutos > 0 ? s.encargosDevidos / s.encargosBrutos : 0
    const acordoId = cobertura.get(t.id) ?? null
    const tc: TituloCalc = {
      id: t.id, studentId: sid, descricao: t.descricao, parcela: t.numeroParcela, valor: t.valor, vencimento: t.dataVencimento,
      diasAtraso: s.enc.diasAtraso, faixa: faixaDeAtraso(s.enc.diasAtraso), principalRestante: s.principalRestante,
      multa: round2(s.enc.multa * f), juros: round2(s.enc.juros * f), correcao: round2(s.enc.correcao * f), encargos: s.encargosDevidos, saldo: s.saldo,
      emAcordo: !!acordoId, acordoId, status: t.status,
    }
    titulos.set(sid, [...(titulos.get(sid) ?? []), tc])
    let l = linhasMap.get(sid)
    if (!l) {
      const caso = casoPor.get(sid)
      const prom = promPor.get(sid)
      const ac = acordoPorAluno.get(sid)
      l = {
        studentId: sid, nome: ia?.nome ?? '(aluno removido)', ra: ia?.ra ?? '', statusAluno: ia?.statusAluno ?? '', cursoId: ia?.cursoId ?? null, curso: ia?.curso ?? null,
        turmaId: ia?.turmaId ?? null, turma: ia?.turma ?? null, poloId: ia?.poloId ?? null, polo: ia?.polo ?? null, segmento: ia?.segmento ?? 'GRADUACAO', temBolsa: ia?.temBolsa ?? false,
        politicaId: pol.id, titulosVencidos: 0, titulosAVencer: 0, vencimentoMaisAntigo: null, maiorAtraso: 0, faixa: 'A_VENCER', principal: 0, multa: 0, juros: 0, correcao: 0,
        encargos: 0, saldo: 0, aVencer: 0, emAcordoValor: 0, aging: agingVazio(), casoId: caso?.id ?? null, status: caso?.status ?? 'NOVO', responsavelUserId: caso?.responsavelUserId ?? null,
        ultimoContatoEm: caso?.ultimoContatoEm ?? null, ultimoContatoCanal: caso?.ultimoContatoCanal ?? null, ultimoContatoResultado: caso?.ultimoContatoResultado ?? null, naoContatar: caso?.naoContatar ?? false,
        promessaData: prom?.dataPrometida ?? null, promessaValor: prom?.valor ?? null, acordoId: ac?.id ?? null, acordoNumero: ac?.numero ?? null,
      }
      linhasMap.set(sid, l)
    }
    if (tc.diasAtraso <= 0) {
      l.titulosAVencer++
      l.aVencer = round2(l.aVencer + tc.principalRestante)
      l.aging.A_VENCER = round2(l.aging.A_VENCER + tc.principalRestante)
      continue
    }
    if (tc.emAcordo) {
      l.emAcordoValor = round2(l.emAcordoValor + tc.saldo)
      continue
    }
    l.titulosVencidos++
    l.principal = round2(l.principal + tc.principalRestante)
    l.multa = round2(l.multa + tc.multa)
    l.juros = round2(l.juros + tc.juros)
    l.correcao = round2(l.correcao + tc.correcao)
    l.encargos = round2(l.encargos + tc.encargos)
    l.saldo = round2(l.saldo + tc.saldo)
    l.aging[tc.faixa] = round2(l.aging[tc.faixa] + tc.saldo)
    if (!l.vencimentoMaisAntigo || tc.vencimento < l.vencimentoMaisAntigo) l.vencimentoMaisAntigo = tc.vencimento
    l.maiorAtraso = Math.max(l.maiorAtraso, tc.diasAtraso)
  }

  const linhas = [...linhasMap.values()]
  for (const l of linhas) {
    l.faixa = faixaDeAtraso(l.maiorAtraso)
    if (l.titulosVencidos === 0 && !l.acordoId && l.emAcordoValor === 0) continue
    if (l.titulosVencidos > 0) {
      totais.devedores++
      totais.principal = round2(totais.principal + l.principal)
      totais.encargos = round2(totais.encargos + l.encargos)
      totais.saldo = round2(totais.saldo + l.saldo)
    }
    totais.emAcordo = round2(totais.emAcordo + l.emAcordoValor)
  }
  for (const [sid, ts] of titulos) {
    for (const t of ts) {
      const a = totais.aging[t.faixa]
      if (t.emAcordo && t.diasAtraso > 0) continue
      a.valor = round2(a.valor + (t.diasAtraso <= 0 ? t.principalRestante : t.saldo))
      a.titulos++
      alunosPorFaixa.get(t.faixa)!.add(sid)
    }
    totais.aVencer = round2(totais.aVencer + ts.filter((t) => t.diasAtraso <= 0).reduce((a, t) => a + t.principalRestante, 0))
  }
  for (const f of FAIXAS) totais.aging[f].alunos = alunosPorFaixa.get(f)!.size
  // só entra na planilha quem tem algo vencido (fora ou dentro de acordo)
  const planilha = linhas.filter((l) => l.titulosVencidos > 0 || l.emAcordoValor > 0)
  return { escopo: opts.studentId, linhas: planilha, titulos, politicas, info, totais }
}

/** Mantém CobCaso coerente com a carteira (abre, reabre, quita). Idempotente. */
export async function sincronizarCasos(tenantId: string, cart: Carteira, now = new Date()) {
  const r = { abertos: 0, reabertos: 0, quitados: 0, retomados: 0 }
  const casos = await prisma.cobCaso.findMany({ where: { tenantId, ...(cart.escopo ? { studentId: cart.escopo } : {}) } })
  const porAluno = new Map(casos.map((c) => [c.studentId, c]))
  const comDivida = new Set<string>()
  for (const l of cart.linhas) {
    const emAberto = l.titulosVencidos > 0
    const temAcordo = !!l.acordoId
    if (!emAberto && !temAcordo) continue
    comDivida.add(l.studentId)
    const c = porAluno.get(l.studentId)
    if (!c) {
      const novo = await prisma.cobCaso.create({ data: { tenantId, studentId: l.studentId, status: temAcordo ? 'EM_ACORDO' : 'EM_COBRANCA', abertoEm: now } })
      porAluno.set(l.studentId, novo)
      l.casoId = novo.id
      l.status = novo.status
      r.abertos++
      continue
    }
    l.casoId = c.id
    if (['QUITADO', 'ENCERRADO'].includes(c.status)) {
      const u = await prisma.cobCaso.update({ where: { id: c.id }, data: { status: temAcordo ? 'EM_ACORDO' : 'EM_COBRANCA', ciclo: c.ciclo + 1, resolvidoEm: null, abertoEm: now, pausadoAte: null, pausaMotivo: null } })
      l.status = u.status
      r.reabertos++
    } else if (c.status === 'EM_ACORDO' && !temAcordo) {
      const u = await prisma.cobCaso.update({ where: { id: c.id }, data: { status: 'EM_COBRANCA' } })
      l.status = u.status
      r.retomados++
    } else if (c.status !== 'EM_ACORDO' && temAcordo) {
      const u = await prisma.cobCaso.update({ where: { id: c.id }, data: { status: 'EM_ACORDO' } })
      l.status = u.status
    } else if (c.status === 'PROMESSA' && !l.promessaData) {
      const u = await prisma.cobCaso.update({ where: { id: c.id }, data: { status: 'EM_COBRANCA' } })
      l.status = u.status
    }
  }
  for (const c of casos) {
    if (!comDivida.has(c.studentId) && !['QUITADO', 'ENCERRADO'].includes(c.status)) {
      await prisma.cobCaso.update({ where: { id: c.id }, data: { status: 'QUITADO', resolvidoEm: now } })
      await prisma.cobExecucao.updateMany({ where: { tenantId, casoId: c.id, ciclo: c.ciclo }, data: { encerrada: true } })
      await prisma.cobPromessa.updateMany({ where: { tenantId, casoId: c.id, status: 'ABERTA' }, data: { status: 'CUMPRIDA', resolvidaEm: now } })
      r.quitados++
    }
  }
  return r
}
