import { prisma } from '../../lib/prisma'
import { FAIXAS, FAIXA_ROTULO, Faixa, diaBRT, round2, toCsv } from './calculo'
import { LinhaDevedor, infoAlunos, montarCarteira } from './carteira'
import { DIA_MS } from './calculo'

const db = prisma as any

export async function painel(tenantId: string, now = new Date()) {
  const cart = await montarCarteira(tenantId, now)
  const t = cart.totais
  const d30 = new Date(now.getTime() - 30 * DIA_MS)
  const hoje0 = new Date(Math.floor((now.getTime() - 3 * 3_600_000) / DIA_MS) * DIA_MS + 3 * 3_600_000)
  const [rec30, ar30, acordosPorStatus, acordosAtivos, parcelasAtrasadas, parcelasProx, promAbertas, promVenc, promQuebradas, contatosHoje, contatos30, casosPorStatus, encPend, jurEnv, quebrados30] = await Promise.all([
    prisma.cobRecebimento.aggregate({ where: { tenantId, status: 'ATIVO', dataPagamento: { gte: d30 } }, _sum: { valor: true, encargos: true }, _count: { _all: true } }),
    db.accountReceivable.findMany({ where: { tenantId, status: 'PAGO', dataPagamento: { gte: d30 } }, select: { valor: true, dataVencimento: true, dataPagamento: true } }),
    prisma.cobAcordo.groupBy({ by: ['status'], where: { tenantId }, _count: { _all: true } }),
    prisma.cobAcordo.aggregate({ where: { tenantId, status: 'ATIVO' }, _sum: { valorNegociado: true } }),
    prisma.cobParcela.aggregate({ where: { tenantId, status: 'ABERTA', vencimento: { lt: hoje0 }, acordoId: { in: (await prisma.cobAcordo.findMany({ where: { tenantId, status: 'ATIVO' }, select: { id: true } })).map((a) => a.id) } }, _sum: { valor: true }, _count: { _all: true } }),
    prisma.cobParcela.count({ where: { tenantId, status: 'ABERTA', vencimento: { gte: hoje0, lt: new Date(hoje0.getTime() + 7 * DIA_MS) }, acordoId: { in: (await prisma.cobAcordo.findMany({ where: { tenantId, status: 'ATIVO' }, select: { id: true } })).map((a) => a.id) } } }),
    prisma.cobPromessa.aggregate({ where: { tenantId, status: 'ABERTA' }, _sum: { valor: true }, _count: { _all: true } }),
    prisma.cobPromessa.count({ where: { tenantId, status: 'ABERTA', dataPrometida: { lt: hoje0 } } }),
    prisma.cobPromessa.count({ where: { tenantId, status: 'QUEBRADA', resolvidaEm: { gte: d30 } } }),
    prisma.cobContato.count({ where: { tenantId, direcao: 'SAIDA', createdAt: { gte: hoje0 }, NOT: [{ resultado: { startsWith: 'BLOQUEADO' } }] } }),
    prisma.cobContato.groupBy({ by: ['resultado'], where: { tenantId, createdAt: { gte: d30 } }, _count: { _all: true } }),
    prisma.cobCaso.groupBy({ by: ['status'], where: { tenantId }, _count: { _all: true } }),
    prisma.cobEncaminhamento.count({ where: { tenantId, status: 'AGUARDANDO_APROVACAO' } }),
    prisma.cobEncaminhamento.count({ where: { tenantId, tipo: 'JURIDICO', status: { in: ['ENVIADO', 'ACEITO'] } } }),
    prisma.cobAcordo.count({ where: { tenantId, status: 'QUEBRADO', quebradoEm: { gte: d30 } } }),
  ])
  const atrasados30 = ar30.filter((r: any) => r.dataPagamento && diaBRT(r.dataPagamento) > diaBRT(r.dataVencimento))
  const carteiraAberta = round2(t.principal + t.aVencer)
  const porStatus = (rows: Array<{ status: string; _count: { _all: number } }>) => Object.fromEntries(rows.map((r) => [r.status, r._count._all]))
  const ct: Record<string, number> = Object.fromEntries(contatos30.map((r) => [r.resultado, r._count._all]))
  return {
    geradoEm: now,
    devedores: t.devedores,
    saldoVencido: t.saldo,
    principalVencido: t.principal,
    encargos: t.encargos,
    aVencer: t.aVencer,
    emAcordo: t.emAcordo,
    taxaInadimplencia: carteiraAberta > 0 ? round2((t.principal / carteiraAberta) * 100) : 0,
    aging: FAIXAS.map((f) => ({ faixa: f, rotulo: FAIXA_ROTULO[f], ...t.aging[f] })),
    recebido30d: round2(rec30._sum.valor ?? 0),
    encargosRecebidos30d: round2(rec30._sum.encargos ?? 0),
    recebimentos30d: rec30._count._all,
    recuperadoAtrasados30d: round2(atrasados30.reduce((a: number, r: any) => a + r.valor, 0)),
    titulosRecuperados30d: atrasados30.length,
    acordos: { porStatus: porStatus(acordosPorStatus as any), valorAtivos: round2(acordosAtivos._sum.valorNegociado ?? 0), parcelasAtrasadas: parcelasAtrasadas._count._all, valorParcelasAtrasadas: round2(parcelasAtrasadas._sum.valor ?? 0), parcelasProximos7d: parcelasProx, quebrados30d: quebrados30 },
    promessas: { abertas: promAbertas._count._all, valorAbertas: round2(promAbertas._sum.valor ?? 0), vencidasNaoBaixadas: promVenc, quebradas30d: promQuebradas },
    contatos: { hoje: contatosHoje, ultimos30d: ct, bloqueadosOptout30d: ct.BLOQUEADO_OPTOUT ?? 0, bloqueadosJanela30d: ct.BLOQUEADO_JANELA ?? 0, bloqueadosLimite30d: ct.BLOQUEADO_LIMITE ?? 0 },
    casos: porStatus(casosPorStatus as any),
    escalonamento: { aguardandoAprovacao: encPend, juridicoEmAndamento: jurEnv },
  }
}

// ---------------------------------------------------------------- planilha de inadimplentes
export interface FiltroInad {
  q?: string
  faixa?: string
  status?: string
  responsavelId?: string
  cursoId?: string
  turmaId?: string
  poloId?: string
  segmento?: string
  min?: number
  max?: number
  semResponsavel?: boolean
  comPromessa?: boolean
  comAcordo?: boolean
  sort?: string
  dir?: 'asc' | 'desc'
}

export const COLUNAS_INAD = [
  { key: 'nome', label: 'Aluno' }, { key: 'ra', label: 'RA' }, { key: 'curso', label: 'Curso' }, { key: 'turma', label: 'Turma' }, { key: 'polo', label: 'Polo' }, { key: 'segmento', label: 'Segmento' },
  { key: 'titulosVencidos', label: 'Títulos vencidos' }, { key: 'vencimentoMaisAntigo', label: 'Vencimento mais antigo' }, { key: 'maiorAtraso', label: 'Maior atraso (dias)' }, { key: 'faixa', label: 'Faixa' },
  { key: 'aVencer', label: 'A vencer' }, { key: 'aging_D1_30', label: '1-30 dias' }, { key: 'aging_D31_60', label: '31-60 dias' }, { key: 'aging_D61_90', label: '61-90 dias' }, { key: 'aging_D90_MAIS', label: '90+ dias' },
  { key: 'principal', label: 'Principal vencido' }, { key: 'multa', label: 'Multa' }, { key: 'juros', label: 'Juros' }, { key: 'correcao', label: 'Correção' }, { key: 'saldo', label: 'Saldo atualizado' },
  { key: 'ultimoContatoEm', label: 'Último contato' }, { key: 'ultimoContatoCanal', label: 'Canal' }, { key: 'promessaData', label: 'Promessa (data)' }, { key: 'promessaValor', label: 'Promessa (valor)' },
  { key: 'responsavel', label: 'Responsável' }, { key: 'status', label: 'Status' }, { key: 'acordoNumero', label: 'Acordo' },
]

const SORTS = new Set(['nome', 'ra', 'curso', 'turma', 'polo', 'segmento', 'titulosVencidos', 'vencimentoMaisAntigo', 'maiorAtraso', 'aVencer', 'principal', 'multa', 'juros', 'correcao', 'encargos', 'saldo', 'ultimoContatoEm', 'promessaData', 'status', 'faixa', 'emAcordoValor'])

export function filtrarLinhas(linhas: LinhaDevedor[], f: FiltroInad): LinhaDevedor[] {
  const q = f.q?.trim().toLowerCase()
  let r = linhas.filter((l) => {
    if (q && !(l.nome.toLowerCase().includes(q) || l.ra.toLowerCase().includes(q) || (l.curso ?? '').toLowerCase().includes(q))) return false
    if (f.faixa && l.faixa !== f.faixa && !(l.aging[f.faixa as Faixa] > 0)) return false
    if (f.status && l.status !== f.status) return false
    if (f.responsavelId && l.responsavelUserId !== f.responsavelId) return false
    if (f.semResponsavel && l.responsavelUserId) return false
    if (f.cursoId && l.cursoId !== f.cursoId) return false
    if (f.turmaId && l.turmaId !== f.turmaId) return false
    if (f.poloId && l.poloId !== f.poloId) return false
    if (f.segmento && l.segmento !== f.segmento) return false
    if (f.min != null && l.saldo < f.min) return false
    if (f.max != null && l.saldo > f.max) return false
    if (f.comPromessa && !l.promessaData) return false
    if (f.comAcordo && !l.acordoId) return false
    return true
  })
  const key = f.sort && SORTS.has(f.sort) ? f.sort : 'saldo'
  const dir = f.dir === 'asc' ? 1 : -1
  r = r.sort((a: any, b: any) => {
    const x = a[key], y = b[key]
    if (x == null && y == null) return 0
    if (x == null) return 1
    if (y == null) return -1
    const c = typeof x === 'string' ? x.localeCompare(y, 'pt-BR') : x instanceof Date ? x.getTime() - y.getTime() : x - y
    return c * dir || a.nome.localeCompare(b.nome, 'pt-BR')
  })
  return r
}

export async function nomesDeUsuarios(tenantId: string, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const uniq = [...new Set(ids.filter(Boolean))]
  if (!uniq.length) return out
  const us = await prisma.user.findMany({ where: { tenantId, id: { in: uniq } }, select: { id: true, firstName: true, lastName: true } })
  for (const u of us) out.set(u.id, `${u.firstName} ${u.lastName}`.trim())
  return out
}

export function linhaParaCsv(l: LinhaDevedor, resp: Map<string, string>): Record<string, unknown> {
  return {
    ...l,
    responsavel: l.responsavelUserId ? (resp.get(l.responsavelUserId) ?? l.responsavelUserId) : '',
    faixa: FAIXA_ROTULO[l.faixa], aging_D1_30: l.aging.D1_30, aging_D31_60: l.aging.D31_60, aging_D61_90: l.aging.D61_90, aging_D90_MAIS: l.aging.D90_MAIS,
    ultimoContatoEm: l.ultimoContatoEm ? l.ultimoContatoEm.toISOString().slice(0, 16).replace('T', ' ') : '',
  }
}
export const csvInadimplentes = (linhas: LinhaDevedor[], resp: Map<string, string>) => toCsv(COLUNAS_INAD, linhas.map((l) => linhaParaCsv(l, resp)))

// ---------------------------------------------------------------- ranking
export async function ranking(tenantId: string, dimensao: 'curso' | 'turma' | 'polo' | 'segmento', now = new Date()) {
  const cart = await montarCarteira(tenantId, now)
  const desde = new Date(now.getTime() - 365 * DIA_MS)
  // carteira dos últimos 12 meses (qualquer status exceto cancelado) por aluno -> base da taxa
  const grupos = await db.accountReceivable.groupBy({ by: ['studentId'], where: { tenantId, status: { not: 'CANCELADO' }, dataVencimento: { gte: desde, lte: new Date(now.getTime() + 30 * DIA_MS) } }, _sum: { valor: true }, _count: { _all: true } })
  const info = await infoAlunos(tenantId, grupos.map((g: any) => g.studentId), now)
  const chave = (id: string) => {
    const i = info.get(id)
    if (!i) return { k: '—', nome: '(sem cadastro)' }
    if (dimensao === 'curso') return { k: i.cursoId ?? '—', nome: i.curso ?? '(sem curso)' }
    if (dimensao === 'turma') return { k: i.turmaId ?? '—', nome: i.turma ?? '(sem turma)' }
    if (dimensao === 'polo') return { k: i.poloId ?? '—', nome: i.polo ?? '(sem polo / presencial)' }
    return { k: i.segmento, nome: i.segmento }
  }
  const m = new Map<string, { id: string; nome: string; carteira: number; alunosNaCarteira: number; alunosInadimplentes: number; principal: number; encargos: number; saldo: number; maiorAtraso: number; mais90: number }>()
  const get = (id: string) => {
    const { k, nome } = chave(id)
    let r = m.get(k)
    if (!r) m.set(k, (r = { id: k, nome, carteira: 0, alunosNaCarteira: 0, alunosInadimplentes: 0, principal: 0, encargos: 0, saldo: 0, maiorAtraso: 0, mais90: 0 }))
    return r
  }
  for (const g of grupos) {
    const r = get(g.studentId)
    r.carteira = round2(r.carteira + (g._sum.valor ?? 0))
    r.alunosNaCarteira++
  }
  for (const l of cart.linhas) {
    if (l.titulosVencidos === 0) continue
    const r = get(l.studentId)
    r.alunosInadimplentes++
    r.principal = round2(r.principal + l.principal)
    r.encargos = round2(r.encargos + l.encargos)
    r.saldo = round2(r.saldo + l.saldo)
    r.maiorAtraso = Math.max(r.maiorAtraso, l.maiorAtraso)
    r.mais90 = round2(r.mais90 + l.aging.D90_MAIS)
  }
  const rows = [...m.values()].map((r) => ({ ...r, taxaInadimplencia: r.carteira > 0 ? round2((r.principal / r.carteira) * 100) : 0, pctAlunos: r.alunosNaCarteira > 0 ? round2((r.alunosInadimplentes / r.alunosNaCarteira) * 100) : 0 }))
  rows.sort((a, b) => b.taxaInadimplencia - a.taxaInadimplencia || b.saldo - a.saldo)
  return { dimensao, base: 'Carteira = títulos (não cancelados) com vencimento nos últimos 12 meses; taxa = principal vencido em aberto / carteira.', rows: rows.map((r, i) => ({ posicao: i + 1, ...r })) }
}

// ---------------------------------------------------------------- recebimentos do período
export async function recebimentos(tenantId: string, de: Date, ate: Date) {
  const [recs, pagos, trans] = await Promise.all([
    prisma.cobRecebimento.findMany({ where: { tenantId, status: 'ATIVO', dataPagamento: { gte: de, lte: ate } }, orderBy: { dataPagamento: 'desc' }, take: 2000 }),
    db.accountReceivable.findMany({ where: { tenantId, status: 'PAGO', dataPagamento: { gte: de, lte: ate } }, orderBy: { dataPagamento: 'desc' }, take: 5000 }),
    db.paymentTransaction.findMany({ where: { tenantId, tipo: 'RECEITA', dataTransacao: { gte: de, lte: ate } }, select: { valor: true, formaPagamento: true, dataTransacao: true } }),
  ])
  const ids = [...new Set([...recs.map((r) => r.studentId), ...pagos.map((p: any) => p.studentId)])]
  const alunos = ids.length ? await prisma.student.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, nomeCompleto: true, ra: true } }) : []
  const aMap = new Map(alunos.map((a) => [a.id, a]))
  const titulos = pagos.map((p: any) => {
    const atraso = p.dataPagamento ? Math.max(0, diaBRT(p.dataPagamento) - diaBRT(p.dataVencimento)) : 0
    return { id: p.id, studentId: p.studentId, aluno: aMap.get(p.studentId)?.nomeCompleto ?? '', ra: aMap.get(p.studentId)?.ra ?? '', descricao: p.descricao, parcela: p.numeroParcela, valor: p.valor, vencimento: p.dataVencimento, pagoEm: p.dataPagamento, diasAtraso: atraso, viaAcordo: p.gatewayStatus === 'QUITADO_POR_ACORDO' || p.gatewayStatus === 'QUITADO_POR_CREDITO' }
  })
  const soma = (a: Array<{ valor: number }>) => round2(a.reduce((s, x) => s + x.valor, 0))
  const porDiaM = new Map<string, number>()
  for (const t of trans) {
    const k = new Date(t.dataTransacao.getTime() - 3 * 3_600_000).toISOString().slice(0, 10)
    porDiaM.set(k, round2((porDiaM.get(k) ?? 0) + t.valor))
  }
  const porForma: Record<string, number> = {}
  for (const t of trans) porForma[t.formaPagamento] = round2((porForma[t.formaPagamento] ?? 0) + t.valor)
  const porOrigem: Record<string, number> = {}
  for (const r of recs) porOrigem[r.origem] = round2((porOrigem[r.origem] ?? 0) + r.valor)
  return {
    periodo: { de, ate },
    totais: {
      caixaTotal: soma(trans),
      titulosPagos: titulos.length,
      valorTitulosPagos: soma(titulos),
      recuperadoEmAtraso: soma(titulos.filter((t: any) => t.diasAtraso > 0)),
      pagosNoPrazo: soma(titulos.filter((t: any) => t.diasAtraso === 0)),
      viaCobranca: round2(recs.reduce((s, r) => s + r.valor, 0)),
      encargosArrecadados: round2(recs.reduce((s, r) => s + r.encargos, 0)),
      descontosConcedidos: round2(recs.reduce((s, r) => s + r.desconto, 0)),
      porOrigem,
      porForma,
    },
    porDia: [...porDiaM.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([dia, valor]) => ({ dia, valor })),
    recebimentos: recs.map((r) => ({ ...r, aluno: aMap.get(r.studentId)?.nomeCompleto ?? '', ra: aMap.get(r.studentId)?.ra ?? '' })),
    titulos,
  }
}
