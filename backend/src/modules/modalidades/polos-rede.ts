import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { mountCrud, parseBody, dateISO } from '../core/crud'
import { audit, notify } from '../core/notify'
import { registerEduJob } from '../core/jobs'
import { avaliarAluno, confirmarRematricula } from '../admissoes/rematricula'
import { calcularRetencao } from '../admissoes/logic'
import { sincronizarConcluintes } from '../apoio/egressos'
import { MANAGE, TEACH } from './common'
import {
  calcularRepasse, competenciaValida, coordenadaCidade, DIA_MS, escolherAlvoAfim, intervaloCompetencia, marcoAviso, nivelPolo, pct, proximaJanela, r2,
} from './polos-logic'

// Submódulo "Polos EAD" — montado em /api/edu/modalidades/polos-ead. Estende o cadastro de polos já existente
// (ModPolo / ModPoloOferta / ModPoloAluno em polos.ts) com a gestão por polo: cobrança e repasse, provas presenciais
// com aviso ao aluno, rematrícula, estágios, ENADE, egressos, ofertas automáticas e painéis do polo e da rede.
const router = Router()
const BASE = '/polos-ead'
const FIN = ['COORDINATOR', 'SECRETARY', 'FINANCE'] as const
const err = (status: number, message: string) => Object.assign(new Error(message), { status })
const ATIVOS_ALUNO: Array<'ATIVO' | 'TRANCADO'> = ['ATIVO', 'TRANCADO']

// ---------------------------------------------------------------- utilidades
async function poloOr404(tenantId: string, id: string) {
  const p = await prisma.modPolo.findFirst({ where: { id, tenantId } })
  if (!p) throw err(404, 'Polo não encontrado.')
  return p
}
/** Vínculos aluno-polo (por padrão só os ativos). */
async function vinculos(tenantId: string, poloId: string, todos = false) {
  return prisma.modPoloAluno.findMany({ where: { tenantId, poloId, ...(todos ? {} : { ativo: true }) }, select: { studentId: true, programId: true, ativo: true } })
}
async function nomesAlunos(tenantId: string, ids: string[]) {
  const sts = ids.length ? await prisma.student.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, nomeCompleto: true, ra: true, status: true, userId: true } }) : []
  return new Map(sts.map((s) => [s.id, s]))
}
const vencida = (r: { status: string; dataVencimento: Date }, agora = new Date()) => (r.status === 'PENDENTE' || r.status === 'ATRASADO') && r.dataVencimento < agora

// ---------------------------------------------------------------- KPIs do polo
export async function kpisPolo(tenantId: string, poloId: string) {
  const agora = new Date()
  const polo = await poloOr404(tenantId, poloId)
  const todos = await vinculos(tenantId, poloId, true)
  const ids = todos.map((v) => v.studentId)
  const idsAtivosVinculo = todos.filter((v) => v.ativo).map((v) => v.studentId)
  const sts = ids.length ? await prisma.student.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, status: true } }) : []
  const stMap = new Map(sts.map((s) => [s.id, s.status as string]))
  const alunosAtivos = idsAtivosVinculo.filter((i) => stMap.get(i) === 'ATIVO').length
  const evadidos = ids.filter((i) => ['CANCELADO', 'DESISTENTE'].includes(stMap.get(i) ?? '')).length
  const trancados = ids.filter((i) => stMap.get(i) === 'TRANCADO').length
  const formados = ids.filter((i) => ['FORMADO', 'CONCLUIDO'].includes(stMap.get(i) ?? '')).length

  const rec = ids.length ? await prisma.accountReceivable.findMany({ where: { tenantId, studentId: { in: ids }, status: { not: 'CANCELADO' } }, select: { studentId: true, valor: true, status: true, dataVencimento: true, gatewayId: true } }) : []
  const venc = rec.filter((r) => vencida(r, agora))
  const inadAlunos = new Set(venc.filter((r) => stMap.get(r.studentId) === 'ATIVO').map((r) => r.studentId))
  const valorVencido = r2(venc.reduce((s, r) => s + r.valor, 0))
  const totalEmitido = rec.filter((r) => r.dataVencimento < agora).reduce((s, r) => s + r.valor, 0)

  const [camp, provas, estagios, enade, egressos, repasse, ofertasN] = await Promise.all([
    prisma.polRematriculaCampanha.findFirst({ where: { tenantId, poloId }, orderBy: { createdAt: 'desc' } }),
    prisma.polProva.findMany({ where: { tenantId, poloId, status: 'AGENDADA', dataHora: { gte: agora, lte: new Date(agora.getTime() + 30 * DIA_MS) } }, orderBy: { dataHora: 'asc' }, select: { id: true, titulo: true, dataHora: true } }),
    ids.length ? prisma.modEstagio.groupBy({ by: ['status'], where: { tenantId, studentId: { in: ids } }, _count: true }) : Promise.resolve([] as any[]),
    prisma.polEnadeParticipacao.findMany({ where: { tenantId, poloId, ano: new Date().getFullYear() }, select: { situacao: true } }),
    ids.length ? prisma.apoEgresso.count({ where: { tenantId, studentId: { in: ids } } }) : Promise.resolve(0),
    prisma.polRepasse.findFirst({ where: { tenantId, poloId }, orderBy: { competencia: 'desc' } }),
    prisma.polOferta.groupBy({ by: ['status'], where: { tenantId, poloId }, _count: true }),
  ])
  let rematricula: any = null
  if (camp) {
    const itens = await prisma.admRematricula.findMany({ where: { tenantId, campanhaId: camp.campanhaId, studentId: { in: ids } }, select: { status: true } })
    rematricula = { campanhaId: camp.campanhaId, ...calcularRetencao(itens) }
  }
  const inadimplenciaPct = pct(inadAlunos.size, alunosAtivos)
  const evasaoPct = pct(evadidos, ids.length)
  const kpi = {
    polo: { id: polo.id, codigo: polo.codigo, nome: polo.nome, cidade: polo.cidade, uf: polo.uf, status: polo.statusCredenciamento, responsavelNome: polo.responsavelNome },
    alunosAtivos, alunosTotal: ids.length, trancados, evadidos, formados, evasaoPct,
    inadimplentes: inadAlunos.size, inadimplenciaPct, valorVencido, inadimplenciaValorPct: pct(valorVencido, totalEmitido),
    boletosEmitidos: rec.filter((r) => r.gatewayId).length,
    rematricula, rematriculaPct: rematricula?.taxaRetencao ?? null,
    provasProximas: provas.length, proximaProva: provas[0] ?? null,
    estagios: Object.fromEntries((estagios as any[]).map((e) => [e.status, e._count])),
    enade: { ano: new Date().getFullYear(), total: enade.length, participaram: enade.filter((e) => e.situacao === 'PARTICIPOU').length, inscritos: enade.filter((e) => e.situacao === 'INSCRITO').length },
    egressos, ultimoRepasse: repasse ? { competencia: repasse.competencia, valor: repasse.valorRepasse, status: repasse.status } : null,
    ofertas: Object.fromEntries(ofertasN.map((o) => [o.status, o._count])),
  }
  return { ...kpi, nivel: nivelPolo({ inadimplenciaPct, evasaoPct, rematriculaPct: kpi.rematriculaPct }) }
}

// ---------------------------------------------------------------- painéis
router.get(`${BASE}/rede`, requireRole(...FIN), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const polos = await prisma.modPolo.findMany({ where: { tenantId, ativo: true }, select: { id: true }, orderBy: { nome: 'asc' } })
  const items: any[] = []
  for (const p of polos) items.push(await kpisPolo(tenantId, p.id))
  const soma = (f: (k: any) => number) => items.reduce((s, k) => s + f(k), 0)
  const alunos = soma((k) => k.alunosAtivos)
  const totais = {
    polos: items.length, alunosAtivos: alunos, alunosTotal: soma((k) => k.alunosTotal), inadimplentes: soma((k) => k.inadimplentes),
    inadimplenciaPct: pct(soma((k) => k.inadimplentes), alunos), valorVencido: r2(soma((k) => k.valorVencido)),
    evadidos: soma((k) => k.evadidos), evasaoPct: pct(soma((k) => k.evadidos), soma((k) => k.alunosTotal)),
    provasProximas: soma((k) => k.provasProximas), egressos: soma((k) => k.egressos),
    rematriculaBase: soma((k) => k.rematricula?.base ?? 0), rematriculaConfirmadas: soma((k) => k.rematricula?.confirmadas ?? 0),
    enadeParticiparam: soma((k) => k.enade.participaram), enadeTotal: soma((k) => k.enade.total),
  }
  const funil = await funilOfertas(tenantId, {})
  res.json({ totais: { ...totais, rematriculaPct: totais.rematriculaBase ? pct(totais.rematriculaConfirmadas, totais.rematriculaBase) : null, enadePct: pct(totais.enadeParticiparam, totais.enadeTotal) }, polos: items, funilOfertas: funil.total, ranking: { maiorInadimplencia: [...items].sort((a, b) => b.inadimplenciaPct - a.inadimplenciaPct).slice(0, 3).map((k) => ({ id: k.polo.id, nome: k.polo.nome, pct: k.inadimplenciaPct })), maiorEvasao: [...items].sort((a, b) => b.evasaoPct - a.evasaoPct).slice(0, 3).map((k) => ({ id: k.polo.id, nome: k.polo.nome, pct: k.evasaoPct })) } })
}))

router.get(`${BASE}/mapa`, requireRole(...TEACH, 'FINANCE'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const polos = await prisma.modPolo.findMany({ where: { tenantId, ativo: true }, include: { ofertas: { where: { ativo: true } }, _count: { select: { alunos: { where: { ativo: true } } } } }, orderBy: [{ uf: 'asc' }, { cidade: 'asc' }] })
  const progs = await prisma.academicProgram.findMany({ where: { tenantId }, select: { id: true, nome: true } })
  const nomeCurso = new Map(progs.map((p) => [p.id, p.nome]))
  const pontos = polos.map((p) => {
    const c = p.latitude != null && p.longitude != null ? ([p.latitude, p.longitude] as [number, number]) : coordenadaCidade(p.cidade, p.uf)
    return {
      id: p.id, codigo: p.codigo, nome: p.nome, cidade: p.cidade, uf: p.uf, status: p.statusCredenciamento, responsavel: p.responsavelNome, telefone: p.responsavelTelefone,
      latitude: c?.[0] ?? null, longitude: c?.[1] ?? null, alunos: p._count.alunos, capacidade: p.capacidade,
      cursos: p.ofertas.map((o) => ({ programId: o.programId, nome: nomeCurso.get(o.programId) ?? o.programId, vagas: o.vagas, turnos: o.turnos ? o.turnos.split(',') : [] })),
    }
  })
  const porCidade = new Map<string, any>()
  for (const p of pontos) {
    const k = `${p.cidade ?? 'Sem cidade'}/${p.uf ?? '--'}`
    const g = porCidade.get(k) ?? { cidade: p.cidade, uf: p.uf, polos: 0, alunos: 0, cursos: new Set<string>(), latitude: p.latitude, longitude: p.longitude, itens: [] as any[] }
    g.polos++; g.alunos += p.alunos; p.cursos.forEach((c: any) => g.cursos.add(c.nome)); g.itens.push(p)
    porCidade.set(k, g)
  }
  const cidades = [...porCidade.values()].map((g) => ({ ...g, cursos: [...g.cursos] }))
  const porUf = Object.entries(cidades.reduce((a: Record<string, number>, c) => { a[c.uf ?? '--'] = (a[c.uf ?? '--'] ?? 0) + c.polos; return a }, {})).map(([uf, polos]) => ({ uf, polos }))
  res.json({ pontos, cidades, porUf })
}))

router.get(`${BASE}/polo/:id/painel`, requireRole(...FIN), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  res.json(await kpisPolo(getTenantId(req), String(req.params.id)))
}))

// ---------------------------------------------------------------- cursos do polo (vagas e turnos) — complementa /polo-ofertas
router.get(`${BASE}/polo/:id/cursos`, requireRole(...TEACH, 'FINANCE'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  await poloOr404(tenantId, String(req.params.id))
  const [ofertas, vincs] = await Promise.all([
    prisma.modPoloOferta.findMany({ where: { tenantId, poloId: String(req.params.id) }, orderBy: { createdAt: 'asc' } }),
    prisma.modPoloAluno.groupBy({ by: ['programId'], where: { tenantId, poloId: String(req.params.id), ativo: true }, _count: true }),
  ])
  const progs = await prisma.academicProgram.findMany({ where: { tenantId, id: { in: ofertas.map((o) => o.programId) } }, select: { id: true, nome: true, modalidade: true } })
  const pm = new Map(progs.map((p) => [p.id, p]))
  const ocup = new Map(vincs.map((v) => [v.programId, v._count]))
  res.json(ofertas.map((o) => ({ ...o, curso: pm.get(o.programId)?.nome ?? null, modalidade: pm.get(o.programId)?.modalidade ?? null, turnosLista: o.turnos ? o.turnos.split(',') : [], matriculados: ocup.get(o.programId) ?? 0, vagasLivres: Math.max(0, o.vagas - (ocup.get(o.programId) ?? 0)) })))
}))

// ---------------------------------------------------------------- alunos / matrículas / estágios
router.get(`${BASE}/polo/:id/alunos`, requireRole(...FIN, 'TEACHER'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const poloId = String(req.params.id)
  await poloOr404(tenantId, poloId)
  const v = await vinculos(tenantId, poloId, true)
  const ids = v.map((x) => x.studentId)
  const [nomes, rec, enr, progs] = await Promise.all([
    nomesAlunos(tenantId, ids),
    ids.length ? prisma.accountReceivable.findMany({ where: { tenantId, studentId: { in: ids }, status: { in: ['PENDENTE', 'ATRASADO'] }, dataVencimento: { lt: new Date() } }, select: { studentId: true, valor: true } }) : [],
    ids.length ? prisma.enrollment.findMany({ where: { studentId: { in: ids }, status: 'ATIVA' }, select: { studentId: true, programId: true } }) : [],
    prisma.academicProgram.findMany({ where: { tenantId }, select: { id: true, nome: true } }),
  ])
  const pn = new Map(progs.map((p) => [p.id, p.nome]))
  const venc = new Map<string, number>()
  for (const r of rec) venc.set(r.studentId, r2((venc.get(r.studentId) ?? 0) + r.valor))
  const q = String(req.query.q ?? '').toLowerCase()
  const out = v.map((x) => {
    const s = nomes.get(x.studentId)
    const progId = x.programId ?? enr.find((e) => e.studentId === x.studentId)?.programId ?? null
    return { studentId: x.studentId, nome: s?.nomeCompleto ?? '—', ra: s?.ra, status: s?.status, vinculoAtivo: x.ativo, programId: progId, curso: progId ? pn.get(progId) ?? null : null, valorVencido: venc.get(x.studentId) ?? 0, inadimplente: (venc.get(x.studentId) ?? 0) > 0 }
  }).filter((a) => !q || a.nome.toLowerCase().includes(q) || String(a.ra ?? '').toLowerCase().includes(q)).sort((a, b) => a.nome.localeCompare(b.nome))
  res.json({ items: out, total: out.length })
}))

router.get(`${BASE}/polo/:id/matriculas`, requireRole(...FIN, 'TEACHER'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const poloId = String(req.params.id)
  await poloOr404(tenantId, poloId)
  const ids = (await vinculos(tenantId, poloId, true)).map((v) => v.studentId)
  const enr = ids.length ? await prisma.enrollment.findMany({ where: { studentId: { in: ids } }, include: { program: { select: { nome: true } }, term: { select: { codigo: true } } }, orderBy: { dataMatricula: 'desc' }, take: 1000 }) : []
  const nomes = await nomesAlunos(tenantId, ids)
  const porCurso: Record<string, { ATIVA: number; TRANCADA: number; CANCELADA: number; CONCLUIDA: number }> = {}
  for (const e of enr) { const c = (porCurso[e.program.nome] ??= { ATIVA: 0, TRANCADA: 0, CANCELADA: 0, CONCLUIDA: 0 }); c[e.status as 'ATIVA']++ }
  res.json({ resumo: porCurso, items: enr.map((e) => ({ id: e.id, studentId: e.studentId, aluno: nomes.get(e.studentId)?.nomeCompleto ?? '—', curso: e.program.nome, periodo: e.term.codigo, status: e.status, dataMatricula: e.dataMatricula })), total: enr.length })
}))

router.get(`${BASE}/polo/:id/estagios`, requireRole(...TEACH, 'FINANCE'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const poloId = String(req.params.id)
  await poloOr404(tenantId, poloId)
  const ids = (await vinculos(tenantId, poloId, true)).map((v) => v.studentId)
  const est = ids.length ? await prisma.modEstagio.findMany({ where: { tenantId, studentId: { in: ids } }, orderBy: { inicio: 'desc' }, take: 500 }) : []
  const nomes = await nomesAlunos(tenantId, ids)
  const resumo = { total: est.length, emAndamento: est.filter((e) => e.status === 'EM_ANDAMENTO').length, concluidos: est.filter((e) => e.status === 'CONCLUIDO').length, horasCumpridas: r2(est.reduce((s, e) => s + e.horasCumpridas, 0)), horasExigidas: r2(est.reduce((s, e) => s + e.horasExigidas, 0)) }
  res.json({ resumo, items: est.map((e) => ({ ...e, aluno: nomes.get(e.studentId)?.nomeCompleto ?? '—', percentual: pct(e.horasCumpridas, e.horasExigidas) })) })
}))

// ---------------------------------------------------------------- cobrança por polo
router.get(`${BASE}/polo/:id/cobranca`, requireRole(...FIN), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const poloId = String(req.params.id)
  await poloOr404(tenantId, poloId)
  const agora = new Date()
  const ids = (await vinculos(tenantId, poloId, true)).map((v) => v.studentId)
  const rec = ids.length ? await prisma.accountReceivable.findMany({ where: { tenantId, studentId: { in: ids }, status: { not: 'CANCELADO' } }, orderBy: { dataVencimento: 'asc' }, take: 3000 }) : []
  const nomes = await nomesAlunos(tenantId, ids)
  const soma = (a: typeof rec) => r2(a.reduce((s, r) => s + r.valor, 0))
  const pagas = rec.filter((r) => r.status === 'PAGO'), venc = rec.filter((r) => vencida(r, agora)), aVencer = rec.filter((r) => r.status !== 'PAGO' && r.dataVencimento >= agora)
  const emitidoVencido = soma(rec.filter((r) => r.dataVencimento < agora))
  const filtro = String(req.query.situacao ?? '')
  const linhas = rec.filter((r) => (filtro === 'VENCIDAS' ? vencida(r, agora) : filtro === 'PAGAS' ? r.status === 'PAGO' : filtro === 'A_VENCER' ? r.status !== 'PAGO' && r.dataVencimento >= agora : true))
  const inad = new Map<string, { studentId: string; parcelas: number; valor: number; maisAntiga: Date }>()
  for (const r of venc) { const x = inad.get(r.studentId) ?? { studentId: r.studentId, parcelas: 0, valor: 0, maisAntiga: r.dataVencimento }; x.parcelas++; x.valor = r2(x.valor + r.valor); if (r.dataVencimento < x.maisAntiga) x.maisAntiga = r.dataVencimento; inad.set(r.studentId, x) }
  res.json({
    resumo: { parcelas: rec.length, recebido: soma(pagas), vencido: soma(venc), aVencer: soma(aVencer), inadimplenciaValorPct: pct(soma(venc), emitidoVencido), alunosInadimplentes: inad.size, boletosEmitidos: rec.filter((r) => r.gatewayId).length, vencidasSemBoleto: venc.filter((r) => !r.gatewayId).length },
    inadimplentes: [...inad.values()].sort((a, b) => b.valor - a.valor).map((x) => ({ ...x, nome: nomes.get(x.studentId)?.nomeCompleto ?? '—', diasAtraso: Math.floor((agora.getTime() - x.maisAntiga.getTime()) / DIA_MS) })),
    parcelas: linhas.slice(0, 300).map((r) => ({ id: r.id, studentId: r.studentId, aluno: nomes.get(r.studentId)?.nomeCompleto ?? '—', descricao: r.descricao, valor: r.valor, vencimento: r.dataVencimento, status: vencida(r, agora) ? 'VENCIDA' : r.status, boleto: r.gatewayId ?? null, boletoStatus: r.gatewayStatus ?? null })),
  })
}))

// Emite boletos (SIMULADO: sem gateway configurado, grava um código de cobrança de demonstração) das parcelas vencidas/a vencer sem boleto.
router.post(`${BASE}/polo/:id/cobranca/boletos`, requireRole(...FIN), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const poloId = String(req.params.id)
  await poloOr404(tenantId, poloId)
  const b = parseBody(z.object({ apenasVencidas: z.boolean().default(true), ate: dateISO().optional() }), req.body ?? {})
  const ids = (await vinculos(tenantId, poloId, true)).map((v) => v.studentId)
  const agora = new Date()
  const alvo = ids.length ? await prisma.accountReceivable.findMany({ where: { tenantId, studentId: { in: ids }, gatewayId: null, status: { in: ['PENDENTE', 'ATRASADO'] }, ...(b.apenasVencidas ? { dataVencimento: { lt: agora } } : b.ate ? { dataVencimento: { lte: b.ate } } : {}) }, take: 500 }) : []
  let n = 0
  for (const r of alvo) {
    await prisma.accountReceivable.update({ where: { id: r.id }, data: { gatewayId: `SIM-BOL-${r.id.slice(0, 8).toUpperCase()}`, gatewayStatus: 'BOLETO_EMITIDO_SIMULADO' } })
    n++
  }
  await audit({ tenantId, userId: getUserId(req), modulo: 'modalidades', acao: 'POLO_EMITIR_BOLETOS', refType: 'ModPolo', refId: poloId, detalhes: { emitidos: n, simulado: true } })
  res.json({ emitidos: n, simulado: true, aviso: 'Gateway de pagamento não configurado: boletos gerados em modo de demonstração.' })
}))

// Lembrete de cobrança (mensagem transacional/contratual — não é marketing) aos inadimplentes do polo.
router.post(`${BASE}/polo/:id/cobranca/lembrar`, requireRole(...FIN), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const poloId = String(req.params.id)
  await poloOr404(tenantId, poloId)
  const ids = (await vinculos(tenantId, poloId, false)).map((v) => v.studentId)
  const venc = ids.length ? await prisma.accountReceivable.findMany({ where: { tenantId, studentId: { in: ids }, status: { in: ['PENDENTE', 'ATRASADO'] }, dataVencimento: { lt: new Date() } }, select: { studentId: true, valor: true } }) : []
  const por = new Map<string, number>()
  for (const r of venc) por.set(r.studentId, r2((por.get(r.studentId) ?? 0) + r.valor))
  for (const [studentId, valor] of por) {
    await notify({ tenantId, canal: 'IN_APP', studentId, assunto: 'Mensalidade em atraso', mensagem: `Identificamos mensalidade(s) em atraso no valor de R$ ${valor.toFixed(2)}. Procure o seu polo ou acesse o portal para emitir a segunda via do boleto.`, templateKey: 'polos.cobranca.atraso', refType: 'ModPolo', refId: poloId })
  }
  res.json({ notificados: por.size })
}))

// ---------------------------------------------------------------- repasse / receita do polo
router.get(`${BASE}/polo/:id/repasse-config`, requireRole(...FIN), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  await poloOr404(tenantId, String(req.params.id))
  res.json((await prisma.polRepasseConfig.findUnique({ where: { poloId: String(req.params.id) } })) ?? { poloId: String(req.params.id), percentualRepasse: 30, valorFixoAluno: 0, ativo: true, padrao: true })
}))
router.put(`${BASE}/polo/:id/repasse-config`, requireRole(...MANAGE, 'FINANCE'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const poloId = String(req.params.id)
  await poloOr404(tenantId, poloId)
  const b = parseBody(z.object({ percentualRepasse: z.number().min(0).max(100), valorFixoAluno: z.number().min(0).max(100000).default(0), ativo: z.boolean().default(true) }), req.body)
  const row = await prisma.polRepasseConfig.upsert({ where: { poloId }, create: { tenantId, poloId, ...b }, update: b })
  await audit({ tenantId, userId: getUserId(req), modulo: 'modalidades', acao: 'POLO_REPASSE_CONFIG', refType: 'ModPolo', refId: poloId, detalhes: b })
  res.json(row)
}))
router.post(`${BASE}/polo/:id/repasses/apurar`, requireRole(...MANAGE, 'FINANCE'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const poloId = String(req.params.id)
  await poloOr404(tenantId, poloId)
  const b = parseBody(z.object({ competencia: z.string() }), req.body)
  if (!competenciaValida(b.competencia)) throw err(400, 'Competência inválida (use AAAA-MM).')
  const exist = await prisma.polRepasse.findUnique({ where: { poloId_competencia: { poloId, competencia: b.competencia } } })
  if (exist && exist.status === 'PAGO') throw err(409, 'Repasse desta competência já foi pago; não pode ser recalculado.')
  const cfg = (await prisma.polRepasseConfig.findUnique({ where: { poloId } })) ?? { percentualRepasse: 30, valorFixoAluno: 0 }
  const ids = (await vinculos(tenantId, poloId, false)).map((v) => v.studentId)
  const { ini, fim } = intervaloCompetencia(b.competencia)
  const rec = ids.length ? await prisma.accountReceivable.findMany({ where: { tenantId, studentId: { in: ids }, status: { not: 'CANCELADO' }, dataVencimento: { gte: ini, lt: fim } }, select: { valor: true, status: true } }) : []
  const previsto = r2(rec.reduce((s, r) => s + r.valor, 0))
  const recebido = r2(rec.filter((r) => r.status === 'PAGO').reduce((s, r) => s + r.valor, 0))
  const sts = ids.length ? await prisma.student.count({ where: { tenantId, id: { in: ids }, status: 'ATIVO' } }) : 0
  const c = calcularRepasse(recebido, sts, cfg.percentualRepasse, cfg.valorFixoAluno)
  const data = { alunosAtivos: sts, receitaPrevista: previsto, receitaRecebida: recebido, inadimplencia: r2(previsto - recebido), percentual: cfg.percentualRepasse, valorFixo: c.fixo, valorRepasse: c.total, status: 'CALCULADO' }
  const row = await prisma.polRepasse.upsert({ where: { poloId_competencia: { poloId, competencia: b.competencia } }, create: { tenantId, poloId, competencia: b.competencia, ...data }, update: data })
  await audit({ tenantId, userId: getUserId(req), modulo: 'modalidades', acao: 'POLO_REPASSE_APURADO', refType: 'PolRepasse', refId: row.id, detalhes: { competencia: b.competencia, valor: c.total } })
  res.status(exist ? 200 : 201).json(row)
}))
router.get(`${BASE}/polo/:id/repasses`, requireRole(...FIN), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  await poloOr404(tenantId, String(req.params.id))
  const items = await prisma.polRepasse.findMany({ where: { tenantId, poloId: String(req.params.id) }, orderBy: { competencia: 'desc' }, take: 36 })
  res.json({ items, totalRepassado: r2(items.filter((i) => i.status === 'PAGO').reduce((s, i) => s + i.valorRepasse, 0)), totalReceita: r2(items.reduce((s, i) => s + i.receitaRecebida, 0)) })
}))
for (const [acao, de, para] of [['aprovar', 'CALCULADO', 'APROVADO'], ['pagar', 'APROVADO', 'PAGO']] as const) {
  router.post(`${BASE}/repasses/:rid/${acao}`, requireRole(...MANAGE, 'FINANCE'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const r = await prisma.polRepasse.findFirst({ where: { id: String(req.params.rid), tenantId } })
    if (!r) throw err(404, 'Repasse não encontrado.')
    if (r.status !== de) throw err(409, `Só é possível ${acao} repasse em situação ${de} (atual: ${r.status}).`)
    const row = await prisma.polRepasse.update({ where: { id: r.id }, data: { status: para, ...(para === 'APROVADO' ? { aprovadoPorId: getUserId(req) } : { pagoEm: new Date() }) } })
    await audit({ tenantId, userId: getUserId(req), modulo: 'modalidades', acao: `POLO_REPASSE_${para}`, refType: 'PolRepasse', refId: r.id })
    res.json(row)
  }))
}
router.get(`${BASE}/repasses-rede`, requireRole(...FIN), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const competencia = String(req.query.competencia ?? '')
  const items = await prisma.polRepasse.findMany({ where: { tenantId, ...(competencia ? { competencia } : {}) }, orderBy: [{ competencia: 'desc' }], take: 500 })
  const polos = await prisma.modPolo.findMany({ where: { tenantId }, select: { id: true, nome: true, cidade: true, uf: true } })
  const pn = new Map(polos.map((p) => [p.id, p]))
  res.json({ items: items.map((i) => ({ ...i, polo: pn.get(i.poloId)?.nome, cidade: pn.get(i.poloId)?.cidade, uf: pn.get(i.poloId)?.uf })), total: r2(items.reduce((s, i) => s + i.valorRepasse, 0)) })
}))

// ---------------------------------------------------------------- provas presenciais no polo + avisos (7 dias e 1 dia antes)
const provaSchema = z.object({
  poloId: z.string(), programId: z.string().optional().nullable(), titulo: z.string().min(3).max(200), disciplina: z.string().max(200).optional().nullable(),
  dataHora: dateISO(), duracaoMin: z.number().int().min(15).max(480).optional(), local: z.string().max(200).optional().nullable(), observacao: z.string().max(1000).optional().nullable(),
})
mountCrud(router, {
  model: 'polProva', path: `${BASE}/provas`, read: [...TEACH, 'FINANCE'], write: [...MANAGE], create: provaSchema, search: ['titulo', 'disciplina'], filters: ['poloId', 'status', 'programId'],
  orderBy: { dataHora: 'asc' }, modulo: 'modalidades',
  beforeCreate: async (d, req) => {
    await poloOr404(getTenantId(req), d.poloId)
    if (d.programId && !(await prisma.academicProgram.findFirst({ where: { id: d.programId, tenantId: getTenantId(req) }, select: { id: true } }))) throw err(404, 'Curso não encontrado.')
    return d
  },
  beforeUpdate: (d, _req, cur) => { if (d.poloId && d.poloId !== cur.poloId) throw err(422, 'Não é possível trocar o polo da prova.'); return d },
})
router.post(`${BASE}/provas/:pid/cancelar`, requireRole(...MANAGE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const p = await prisma.polProva.findFirst({ where: { id: String(req.params.pid), tenantId } })
  if (!p) throw err(404, 'Prova não encontrada.')
  if (p.status !== 'AGENDADA') throw err(409, 'Só provas agendadas podem ser canceladas.')
  const row = await prisma.polProva.update({ where: { id: p.id }, data: { status: 'CANCELADA' } })
  const ids = (await vinculos(tenantId, p.poloId)).map((v) => v.studentId)
  for (const studentId of ids) await notify({ tenantId, canal: 'IN_APP', studentId, assunto: 'Prova presencial cancelada', mensagem: `A prova "${p.titulo}" do dia ${p.dataHora.toLocaleDateString('pt-BR')} foi cancelada. Aguarde nova data.`, templateKey: 'polos.prova.cancelada', refType: 'PolProva', refId: p.id })
  await audit({ tenantId, userId: getUserId(req), modulo: 'modalidades', acao: 'POLO_PROVA_CANCELADA', refType: 'PolProva', refId: p.id })
  res.json(row)
}))
router.post(`${BASE}/provas/:pid/realizar`, requireRole(...MANAGE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const p = await prisma.polProva.findFirst({ where: { id: String(req.params.pid), tenantId } })
  if (!p) throw err(404, 'Prova não encontrada.')
  if (p.status !== 'AGENDADA') throw err(409, 'Só provas agendadas podem ser marcadas como realizadas.')
  res.json(await prisma.polProva.update({ where: { id: p.id }, data: { status: 'REALIZADA' } }))
}))

/** Alunos convocados para a prova: vínculo ativo no polo, ativos e (se a prova tiver curso) do curso. */
async function convocados(tenantId: string, prova: { poloId: string; programId: string | null }) {
  const v = await vinculos(tenantId, prova.poloId)
  const sts = v.length ? await prisma.student.findMany({ where: { tenantId, id: { in: v.map((x) => x.studentId) }, status: 'ATIVO' }, select: { id: true, userId: true } }) : []
  let ok = new Set(sts.map((s) => s.id))
  if (prova.programId) {
    const enr = await prisma.enrollment.findMany({ where: { studentId: { in: [...ok] }, programId: prova.programId, status: 'ATIVA' }, select: { studentId: true } })
    const viaEnr = new Set(enr.map((e) => e.studentId))
    ok = new Set([...ok].filter((i) => viaEnr.has(i) || v.find((x) => x.studentId === i)?.programId === prova.programId))
  }
  return sts.filter((s) => ok.has(s.id))
}

/** Envia os avisos devidos (D7 / D1) de uma prova; idempotente por (prova, aluno, marco). */
export async function enviarAvisosProva(prova: { id: string; tenantId: string; poloId: string; programId: string | null; titulo: string; dataHora: Date; local: string | null }, agora = new Date()) {
  const marco = marcoAviso(prova.dataHora, agora)
  if (!marco) return { marco: null, enviados: 0, jaEnviados: 0 }
  const polo = await prisma.modPolo.findUnique({ where: { id: prova.poloId }, select: { nome: true, cidade: true } })
  const alvo = await convocados(prova.tenantId, prova)
  const quando = prova.dataHora.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'full', timeStyle: 'short' })
  let enviados = 0, ja = 0
  for (const s of alvo) {
    const ex = await prisma.polProvaAviso.findUnique({ where: { provaId_studentId_marco: { provaId: prova.id, studentId: s.id, marco } } })
    if (ex) { ja++; continue }
    const n = await notify({
      tenantId: prova.tenantId, canal: 'IN_APP', studentId: s.id,
      assunto: marco === 'D1' ? 'Sua prova presencial é amanhã' : 'Lembrete: prova presencial em 7 dias',
      mensagem: `${marco === 'D1' ? 'Amanhã' : 'Em até 7 dias'} você tem a prova presencial "${prova.titulo}" no ${/^polo\b/i.test(polo?.nome ?? '') ? polo?.nome : `polo ${polo?.nome ?? ''}`}${polo?.cidade ? ` (${polo.cidade})` : ''}${prova.local ? `, local: ${prova.local}` : ''}. Data e hora: ${quando}. Leve documento oficial com foto.`,
      templateKey: `polos.prova.${marco.toLowerCase()}`, refType: 'PolProva', refId: prova.id,
    })
    try { await prisma.polProvaAviso.create({ data: { tenantId: prova.tenantId, provaId: prova.id, studentId: s.id, marco, notificacaoId: n.id } }); enviados++ } catch (e: any) { if (e?.code === 'P2002') ja++; else throw e }
  }
  return { marco, enviados, jaEnviados: ja, convocados: alvo.length }
}
export async function processarAvisosProvas(tenantId?: string, agora = new Date()) {
  const provas = await prisma.polProva.findMany({ where: { ...(tenantId ? { tenantId } : {}), status: 'AGENDADA', dataHora: { gt: agora, lte: new Date(agora.getTime() + 7 * DIA_MS) } }, take: 2000 })
  let enviados = 0
  for (const p of provas) enviados += (await enviarAvisosProva(p, agora)).enviados
  return { provas: provas.length, avisosEnviados: enviados }
}
router.post(`${BASE}/provas/avisos/processar`, requireRole(...MANAGE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  res.json(await processarAvisosProvas(getTenantId(req)))
}))
router.post(`${BASE}/provas/:pid/avisos`, requireRole(...MANAGE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const p = await prisma.polProva.findFirst({ where: { id: String(req.params.pid), tenantId } })
  if (!p) throw err(404, 'Prova não encontrada.')
  if (p.status !== 'AGENDADA') throw err(409, 'Prova não está agendada.')
  res.json(await enviarAvisosProva(p))
}))
router.get(`${BASE}/provas/:pid/avisos`, requireRole(...TEACH), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const p = await prisma.polProva.findFirst({ where: { id: String(req.params.pid), tenantId } })
  if (!p) throw err(404, 'Prova não encontrada.')
  const av = await prisma.polProvaAviso.findMany({ where: { tenantId, provaId: p.id }, orderBy: { enviadoEm: 'desc' }, take: 1000 })
  res.json({ prova: p, porMarco: { D7: av.filter((a) => a.marco === 'D7').length, D1: av.filter((a) => a.marco === 'D1').length }, convocados: (await convocados(tenantId, p)).length, items: av })
}))
router.get(`${BASE}/minhas-provas`, requireRole('STUDENT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const sid = req.user?.studentId
  if (!sid) return res.json([])
  const v = await prisma.modPoloAluno.findMany({ where: { tenantId, studentId: sid, ativo: true }, select: { poloId: true } })
  const provas = await prisma.polProva.findMany({ where: { tenantId, poloId: { in: v.map((x) => x.poloId) }, status: 'AGENDADA', dataHora: { gte: new Date() } }, orderBy: { dataHora: 'asc' }, take: 50 })
  res.json(provas)
}))

// ---------------------------------------------------------------- rematrícula por polo (reutiliza AdmRematricula do módulo admissoes)
const campanhaPoloSchema = z.object({
  nome: z.string().min(3).max(150), termDestinoId: z.string(), termOrigemId: z.string().optional().nullable(), janelaInicio: dateISO(), janelaFim: dateISO(),
  descontoAntecipacaoPct: z.number().min(0).max(100).optional(), dataLimiteDesconto: dateISO().optional().nullable(), valorTaxa: z.number().min(0).optional(),
  bloqueiaInadimplente: z.boolean().optional(), abrir: z.boolean().default(true), notificar: z.boolean().default(true),
})
async function valorBase(tenantId: string, studentId: string) {
  const u = await prisma.accountReceivable.findFirst({ where: { tenantId, studentId, status: { not: 'CANCELADO' }, descricao: { startsWith: 'Mensalidade' } }, orderBy: { dataVencimento: 'desc' }, select: { valor: true } })
  return u?.valor ?? 0
}
router.post(`${BASE}/polo/:id/rematricula/campanhas`, requireRole(...MANAGE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const poloId = String(req.params.id)
  const polo = await poloOr404(tenantId, poloId)
  const b = parseBody(campanhaPoloSchema, req.body)
  if (b.janelaFim < b.janelaInicio) throw err(400, 'Fim da janela anterior ao início.')
  if ((b.descontoAntecipacaoPct ?? 0) > 0 && !b.dataLimiteDesconto) throw err(400, 'Informe a data limite do desconto de antecipação.')
  const term = await prisma.academicTerm.findFirst({ where: { id: b.termDestinoId, tenantId } })
  if (!term) throw err(404, 'Período letivo de destino não encontrado.')
  if (b.termOrigemId && !(await prisma.academicTerm.findFirst({ where: { id: b.termOrigemId, tenantId }, select: { id: true } }))) throw err(404, 'Período letivo de origem não encontrado.')
  const { abrir, notificar, ...dados } = b
  const camp = await prisma.admRematriculaCampanha.create({ data: { tenantId, ...dados, status: abrir ? 'ABERTA' : 'RASCUNHO' } as any })
  await prisma.polRematriculaCampanha.create({ data: { tenantId, poloId, campanhaId: camp.id } })
  const v = await vinculos(tenantId, poloId)
  const ids = v.map((x) => x.studentId)
  const sts = ids.length ? await prisma.student.findMany({ where: { tenantId, id: { in: ids }, status: { in: ATIVOS_ALUNO } }, select: { id: true } }) : []
  const jaDestino = new Set((await prisma.enrollment.findMany({ where: { termId: term.id, studentId: { in: sts.map((s) => s.id) } }, select: { studentId: true } })).map((e) => e.studentId))
  const out = { elegiveis: 0, pendenciaFinanceira: 0, pendenciaAcademica: 0, trancadas: 0, jaConfirmadas: 0, notificados: 0 }
  for (const s of sts) {
    const enr = await prisma.enrollment.findFirst({ where: { studentId: s.id, status: 'ATIVA', termId: { not: term.id } }, select: { programId: true }, orderBy: { dataMatricula: 'desc' } })
    if (jaDestino.has(s.id)) { await prisma.admRematricula.create({ data: { tenantId, campanhaId: camp.id, studentId: s.id, programId: enr?.programId, status: 'CONFIRMADA', confirmadaEm: new Date() } }); out.jaConfirmadas++; continue }
    const av = await avaliarAluno(tenantId, s.id, camp.bloqueiaInadimplente)
    const base = await valorBase(tenantId, s.id)
    const desc = camp.descontoAntecipacaoPct > 0 ? r2((base * camp.descontoAntecipacaoPct) / 100) : 0
    await prisma.admRematricula.create({ data: { tenantId, campanhaId: camp.id, studentId: s.id, programId: enr?.programId ?? v.find((x) => x.studentId === s.id)?.programId, status: av.status, pendencias: av.pendencias as any, valorBase: base, desconto: desc, valorFinal: r2(base - desc) } })
    if (av.status === 'ELEGIVEL') out.elegiveis++; else if (av.status === 'PENDENTE_FINANCEIRO') out.pendenciaFinanceira++; else if (av.status === 'TRANCADA') out.trancadas++; else out.pendenciaAcademica++
    if (notificar && abrir) {
      const pend = av.pendencias.length ? ` Pendências para regularizar: ${av.pendencias.join('; ')}.` : ''
      await notify({ tenantId, canal: 'IN_APP', studentId: s.id, assunto: `Rematrícula ${term.codigo} aberta no polo ${polo.nome}`, mensagem: `A rematrícula para ${term.codigo} está aberta até ${b.janelaFim.toLocaleDateString('pt-BR')}.${pend}`, templateKey: 'polos.rematricula.aberta', refType: 'AdmRematriculaCampanha', refId: camp.id })
      out.notificados++
    }
  }
  await audit({ tenantId, userId: getUserId(req), modulo: 'modalidades', acao: 'POLO_REMATRICULA_CAMPANHA', refType: 'AdmRematriculaCampanha', refId: camp.id, detalhes: { poloId, ...out } })
  res.status(201).json({ campanha: camp, ...out })
}))

router.get(`${BASE}/polo/:id/rematricula`, requireRole(...FIN, 'TEACHER'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const poloId = String(req.params.id)
  await poloOr404(tenantId, poloId)
  const links = await prisma.polRematriculaCampanha.findMany({ where: { tenantId, poloId }, orderBy: { createdAt: 'desc' } })
  const camps = await prisma.admRematriculaCampanha.findMany({ where: { tenantId, id: { in: links.map((l) => l.campanhaId) } }, orderBy: { janelaInicio: 'desc' } })
  const out: any[] = []
  const ids = (await vinculos(tenantId, poloId, true)).map((v) => v.studentId)
  const nomes = await nomesAlunos(tenantId, ids)
  for (const c of camps) {
    const itens = await prisma.admRematricula.findMany({ where: { tenantId, campanhaId: c.id, studentId: { in: ids } }, orderBy: { updatedAt: 'desc' } })
    out.push({
      campanha: c, retencao: calcularRetencao(itens),
      porStatus: itens.reduce((a: Record<string, number>, i) => { a[i.status] = (a[i.status] ?? 0) + 1; return a }, {}),
      itens: itens.map((i) => ({ id: i.id, studentId: i.studentId, aluno: nomes.get(i.studentId)?.nomeCompleto ?? '—', status: i.status, pendencias: i.pendencias, valorFinal: i.valorFinal, confirmadaEm: i.confirmadaEm })),
    })
  }
  res.json(out)
}))
async function itemDoPolo(tenantId: string, poloId: string, itemId: string) {
  const it = await prisma.admRematricula.findFirst({ where: { id: itemId, tenantId } })
  if (!it) throw err(404, 'Item de rematrícula não encontrado.')
  const link = await prisma.polRematriculaCampanha.findFirst({ where: { tenantId, poloId, campanhaId: it.campanhaId } })
  if (!link) throw err(404, 'Item não pertence a uma campanha deste polo.')
  return it
}
router.post(`${BASE}/polo/:id/rematricula/itens/:iid/confirmar`, requireRole(...MANAGE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  await itemDoPolo(tenantId, String(req.params.id), String(req.params.iid))
  const b = parseBody(z.object({ ignorarJanela: z.boolean().optional() }), req.body ?? {})
  res.json(await confirmarRematricula({ tenantId, itemId: String(req.params.iid), userId: getUserId(req), ignorarJanela: b.ignorarJanela }))
}))
router.post(`${BASE}/polo/:id/rematricula/itens/:iid/recalcular`, requireRole(...MANAGE, 'FINANCE'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const it = await itemDoPolo(tenantId, String(req.params.id), String(req.params.iid))
  if (it.status === 'CONFIRMADA' || it.status === 'NAO_RENOVOU') throw err(409, 'Item já finalizado.')
  const camp = await prisma.admRematriculaCampanha.findFirst({ where: { id: it.campanhaId, tenantId } })
  const av = await avaliarAluno(tenantId, it.studentId, camp?.bloqueiaInadimplente ?? true)
  res.json(await prisma.admRematricula.update({ where: { id: it.id }, data: { status: av.status, pendencias: av.pendencias as any } }))
}))
router.post(`${BASE}/polo/:id/rematricula/itens/:iid/nao-renovou`, requireRole(...MANAGE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const it = await itemDoPolo(tenantId, String(req.params.id), String(req.params.iid))
  if (it.status === 'CONFIRMADA') throw err(409, 'Rematrícula já confirmada.')
  res.json(await prisma.admRematricula.update({ where: { id: it.id }, data: { status: 'NAO_RENOVOU' } }))
}))
router.post(`${BASE}/polo/:id/rematricula/campanhas/:cid/lembrar`, requireRole(...MANAGE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const poloId = String(req.params.id)
  const link = await prisma.polRematriculaCampanha.findFirst({ where: { tenantId, poloId, campanhaId: String(req.params.cid) } })
  if (!link) throw err(404, 'Campanha não pertence a este polo.')
  const camp = await prisma.admRematriculaCampanha.findFirst({ where: { id: link.campanhaId, tenantId } })
  if (!camp || camp.status !== 'ABERTA') throw err(409, 'Campanha não está aberta.')
  const pend = await prisma.admRematricula.findMany({ where: { tenantId, campanhaId: camp.id, status: { in: ['ELEGIVEL', 'PENDENTE_FINANCEIRO', 'PENDENTE_ACADEMICO'] } } })
  for (const i of pend) await notify({ tenantId, canal: 'IN_APP', studentId: i.studentId, assunto: 'Lembrete de rematrícula', mensagem: `Sua rematrícula ainda não foi concluída. Prazo: ${camp.janelaFim.toLocaleDateString('pt-BR')}.${Array.isArray(i.pendencias) && (i.pendencias as any[]).length ? ` Pendências: ${(i.pendencias as any[]).join('; ')}.` : ''}`, templateKey: 'polos.rematricula.lembrete', refType: 'AdmRematricula', refId: i.id })
  res.json({ notificados: pend.length })
}))

// ---------------------------------------------------------------- ENADE por polo (preparatório e participação; exames ficam em outro módulo)
const LINKS_EXAMES = { rotaTela: '/edu/exames', apiBase: '/api/edu/exames', nota: 'Questões, simulados e edições do ENADE são geridos no módulo de Exames; aqui ficam a participação e o preparatório por polo.' }
router.get(`${BASE}/polo/:id/enade`, requireRole(...TEACH, 'FINANCE'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const poloId = String(req.params.id)
  await poloOr404(tenantId, poloId)
  const ano = Number(req.query.ano) || new Date().getFullYear()
  const rows = await prisma.polEnadeParticipacao.findMany({ where: { tenantId, poloId, ano }, orderBy: { createdAt: 'asc' } })
  const nomes = await nomesAlunos(tenantId, rows.map((r) => r.studentId))
  const notas = rows.filter((r) => r.simuladoNota != null).map((r) => r.simuladoNota as number)
  res.json({ ano, links: LINKS_EXAMES, indicadores: indicadoresEnade(rows), mediaSimulado: notas.length ? r2(notas.reduce((a, b) => a + b, 0) / notas.length) : null, items: rows.map((r) => ({ ...r, aluno: nomes.get(r.studentId)?.nomeCompleto ?? '—' })) })
}))
function indicadoresEnade(rows: Array<{ situacao: string; preparatorio: boolean }>) {
  const n = (s: string) => rows.filter((r) => r.situacao === s).length
  const base = rows.length - n('DISPENSADO')
  return { total: rows.length, pendentes: n('PENDENTE'), inscritos: n('INSCRITO'), participaram: n('PARTICIPOU'), ausentes: n('AUSENTE'), dispensados: n('DISPENSADO'), emPreparatorio: rows.filter((r) => r.preparatorio).length, participacaoPct: pct(n('PARTICIPOU'), base), preparatorioPct: pct(rows.filter((r) => r.preparatorio).length, rows.length) }
}
router.post(`${BASE}/polo/:id/enade/gerar`, requireRole(...MANAGE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const poloId = String(req.params.id)
  await poloOr404(tenantId, poloId)
  const b = parseBody(z.object({ ano: z.number().int().min(2004).max(2100) }), req.body)
  const ids = (await vinculos(tenantId, poloId)).map((v) => v.studentId)
  const sts = ids.length ? await prisma.student.findMany({ where: { tenantId, id: { in: ids }, status: { in: ['ATIVO', 'CONCLUIDO'] } }, select: { id: true } }) : []
  const r = await prisma.polEnadeParticipacao.createMany({ data: sts.map((s) => ({ tenantId, poloId, studentId: s.id, ano: b.ano })), skipDuplicates: true })
  res.status(201).json({ ano: b.ano, criados: r.count, ...LINKS_EXAMES })
}))
router.put(`${BASE}/polo/:id/enade/:studentId`, requireRole(...MANAGE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const poloId = String(req.params.id)
  await poloOr404(tenantId, poloId)
  const b = parseBody(z.object({ ano: z.number().int().min(2004).max(2100), situacao: z.enum(['PENDENTE', 'INSCRITO', 'PARTICIPOU', 'AUSENTE', 'DISPENSADO']).optional(), preparatorio: z.boolean().optional(), simuladoNota: z.number().min(0).max(100).nullable().optional() }), req.body)
  const v = await prisma.modPoloAluno.findFirst({ where: { tenantId, poloId, studentId: String(req.params.studentId) } })
  if (!v) throw err(404, 'Aluno não vinculado a este polo.')
  const { ano, ...d } = b
  const row = await prisma.polEnadeParticipacao.upsert({ where: { tenantId_studentId_ano: { tenantId, studentId: v.studentId, ano } }, create: { tenantId, poloId, studentId: v.studentId, ano, ...d, atualizadoPorId: getUserId(req) }, update: { ...d, poloId, atualizadoPorId: getUserId(req) } })
  res.json(row)
}))
router.get(`${BASE}/enade-rede`, requireRole(...FIN), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const ano = Number(req.query.ano) || new Date().getFullYear()
  const rows = await prisma.polEnadeParticipacao.findMany({ where: { tenantId, ano }, select: { poloId: true, situacao: true, preparatorio: true, simuladoNota: true } })
  const polos = await prisma.modPolo.findMany({ where: { tenantId, ativo: true }, select: { id: true, nome: true, cidade: true, uf: true }, orderBy: { nome: 'asc' } })
  res.json({ ano, links: LINKS_EXAMES, rede: indicadoresEnade(rows), polos: polos.map((p) => { const r = rows.filter((x) => x.poloId === p.id); const notas = r.filter((x) => x.simuladoNota != null).map((x) => x.simuladoNota as number); return { polo: p, ...indicadoresEnade(r), mediaSimulado: notas.length ? r2(notas.reduce((a, b2) => a + b2, 0) / notas.length) : null } }) })
}))

// ---------------------------------------------------------------- egressos por polo (reutiliza ApoEgresso)
router.get(`${BASE}/polo/:id/egressos`, requireRole('COORDINATOR', 'SECRETARY', 'SUPPORT', 'MARKETING'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const poloId = String(req.params.id)
  await poloOr404(tenantId, poloId)
  const ids = (await vinculos(tenantId, poloId, true)).map((v) => v.studentId)
  const eg = ids.length ? await prisma.apoEgresso.findMany({ where: { tenantId, studentId: { in: ids } }, orderBy: { nome: 'asc' }, take: 1000, select: { id: true, studentId: true, nome: true, programaNome: true, anoConclusao: true, situacaoProfissional: true, empregadorAtual: true, cargoAtual: true, atuaNaArea: true, cursandoPos: true, consenteContato: true, ultimaAtualizacaoEm: true, cidade: true, uf: true } }) : []
  const ano1 = new Date(Date.now() - 365 * DIA_MS)
  const empreg = eg.filter((e) => ['EMPREGADO', 'AUTONOMO', 'EMPREENDEDOR'].includes(e.situacaoProfissional)).length
  res.json({
    indicadores: { total: eg.length, empregados: empreg, empregabilidadePct: pct(empreg, eg.length), atuamNaAreaPct: pct(eg.filter((e) => e.atuaNaArea).length, eg.length), cursandoPos: eg.filter((e) => e.cursandoPos).length, comConsentimentoContato: eg.filter((e) => e.consenteContato).length, desatualizados: eg.filter((e) => !e.ultimaAtualizacaoEm || e.ultimaAtualizacaoEm < ano1).length },
    items: eg,
  })
}))
router.post(`${BASE}/polo/:id/egressos/sincronizar`, requireRole('COORDINATOR', 'SECRETARY', 'SUPPORT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const poloId = String(req.params.id)
  await poloOr404(tenantId, poloId)
  const r = await sincronizarConcluintes(tenantId)
  const ids = (await vinculos(tenantId, poloId, true)).map((v) => v.studentId)
  res.json({ ...r, egressosDoPolo: ids.length ? await prisma.apoEgresso.count({ where: { tenantId, studentId: { in: ids } } }) : 0 })
}))

// ---------------------------------------------------------------- ofertas automáticas de segunda graduação / pós-graduação
const hhmm = z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, 'Use HH:MM.')
const politicaSchema = z.object({
  poloId: z.string().optional().nullable(), nome: z.string().min(3).max(150), tipo: z.enum(['SEGUNDA_GRADUACAO', 'POS_GRADUACAO']),
  gatilho: z.enum(['CONCLUINTE', 'EGRESSO', 'AMBOS']).optional(), descontoPct: z.number().min(0).max(100).optional(), prazoDias: z.number().int().min(1).max(180).optional(),
  canal: z.enum(['EMAIL', 'WHATSAPP', 'SMS', 'IN_APP']).optional(), limiteContatos: z.number().int().min(1).max(10).optional(),
  janelaInicio: hhmm.optional(), janelaFim: hhmm.optional(), areaAfim: z.record(z.string(), z.array(z.string().min(2).max(60)).max(20)).optional().nullable(),
  cursoAlvoId: z.string().optional().nullable(), exigeConsentimento: z.literal(true, { message: 'O consentimento de marketing (LGPD) é obrigatório para ofertas automáticas.' }).optional(), ativo: z.boolean().optional(),
})
mountCrud(router, {
  model: 'polOfertaPolitica', path: `${BASE}/ofertas-auto/politicas`, read: [...TEACH, 'MARKETING', 'FINANCE'], write: [...MANAGE, 'MARKETING'], create: politicaSchema, search: ['nome'], filters: ['tipo', 'ativo', 'poloId'],
  orderBy: { createdAt: 'desc' }, modulo: 'modalidades',
  beforeCreate: async (d, req) => { if (d.poloId) await poloOr404(getTenantId(req), d.poloId); return d },
  beforeUpdate: async (d, req) => { if (d.poloId) await poloOr404(getTenantId(req), d.poloId); return d },
})

/** Consentimento de marketing vigente: Central LGPD (COMUNICACAO_MARKETING ativo) e sem opt-out no módulo de comunicação. */
export async function consentimentoMarketing(tenantId: string, p: { ids: string[]; email?: string | null }): Promise<boolean> {
  const or: any[] = p.ids.length ? [{ titularId: { in: p.ids } }] : []
  if (p.email) or.push({ titularEmail: { equals: p.email, mode: 'insensitive' } })
  if (!or.length) return false
  const c = await prisma.lgpConsentimento.findFirst({ where: { tenantId, finalidade: 'COMUNICACAO_MARKETING', status: 'ATIVO', concedido: true, OR: or }, select: { id: true } })
  if (!c) return false
  if (p.email) {
    const optOut = await prisma.comPreferencia.findFirst({ where: { tenantId, finalidade: 'MARKETING', consentimento: false, contato: { email: { equals: p.email, mode: 'insensitive' } } }, select: { id: true } }).catch(() => null)
    if (optOut) return false
  }
  return true
}

interface Candidato { chaveId: string; studentId?: string; egressoId?: string; nome: string; programaOrigem: string | null; email: string | null; telefone: string | null; ids: string[]; poloId: string | null; consenteEgresso: boolean }

async function candidatosPolitica(tenantId: string, pol: { poloId: string | null; gatilho: string }): Promise<Candidato[]> {
  const out: Candidato[] = []
  const vistos = new Set<string>()
  const polosAluno = new Map<string, string>()
  for (const v of await prisma.modPoloAluno.findMany({ where: { tenantId, ...(pol.poloId ? { poloId: pol.poloId } : {}) }, select: { studentId: true, poloId: true } })) polosAluno.set(v.studentId, v.poloId)
  const permitido = (sid: string | null | undefined) => (pol.poloId ? !!sid && polosAluno.get(sid) === pol.poloId : true)
  if (pol.gatilho === 'EGRESSO' || pol.gatilho === 'AMBOS') {
    const eg = await prisma.apoEgresso.findMany({ where: { tenantId }, take: 5000 })
    for (const e of eg) {
      if (!permitido(e.studentId)) continue
      if (e.studentId) vistos.add(e.studentId)
      out.push({ chaveId: `e${e.id}`, egressoId: e.id, studentId: e.studentId ?? undefined, nome: e.nome, programaOrigem: e.programaNome ?? null, email: e.email, telefone: e.telefone, ids: [e.id, ...(e.studentId ? [e.studentId] : [])], poloId: e.studentId ? polosAluno.get(e.studentId) ?? null : null, consenteEgresso: e.consenteContato })
    }
  }
  if (pol.gatilho === 'CONCLUINTE' || pol.gatilho === 'AMBOS') {
    const sts = await prisma.student.findMany({ where: { tenantId, status: 'CONCLUIDO' }, select: { id: true, nomeCompleto: true, userId: true }, take: 5000 })
    for (const s of sts) {
      if (vistos.has(s.id) || !permitido(s.id)) continue
      const [u, enr] = await Promise.all([
        prisma.user.findFirst({ where: { id: s.userId, tenantId }, select: { email: true, phone: true } }),
        prisma.enrollment.findFirst({ where: { studentId: s.id }, include: { program: { select: { nome: true } } }, orderBy: { dataMatricula: 'desc' } }),
      ])
      out.push({ chaveId: `s${s.id}`, studentId: s.id, nome: s.nomeCompleto, programaOrigem: enr?.program.nome ?? null, email: u?.email ?? null, telefone: u?.phone ?? null, ids: [s.id], poloId: polosAluno.get(s.id) ?? null, consenteEgresso: true })
    }
  }
  return out
}

async function alvosDisponiveis(tenantId: string, tipo: string, cursoAlvoId?: string | null): Promise<Array<{ id: string; nome: string; tipo: 'POS' | 'PROGRAMA' }>> {
  if (tipo === 'POS_GRADUACAO') {
    const l = await prisma.modPosPrograma.findMany({ where: { tenantId, status: 'ATIVO', ...(cursoAlvoId ? { id: cursoAlvoId } : {}) }, select: { id: true, nome: true } })
    return l.map((x) => ({ id: x.id, nome: x.nome, tipo: 'POS' as const }))
  }
  const l = await prisma.academicProgram.findMany({ where: { tenantId, ...(cursoAlvoId ? { id: cursoAlvoId } : {}) }, select: { id: true, nome: true } })
  return l.map((x) => ({ id: x.id, nome: x.nome, tipo: 'PROGRAMA' as const }))
}

export async function expirarOfertas(tenantId?: string) {
  const r = await prisma.polOferta.updateMany({ where: { ...(tenantId ? { tenantId } : {}), status: 'OFERTADA', expiraEm: { lt: new Date() } }, data: { status: 'EXPIRADA' } })
  return { expiradas: r.count }
}

export async function executarPolitica(tenantId: string, politicaId: string, opt: { dryRun?: boolean; limite?: number; agora?: Date; userId?: string } = {}) {
  const agora = opt.agora ?? new Date()
  const pol = await prisma.polOfertaPolitica.findFirst({ where: { id: politicaId, tenantId } })
  if (!pol) throw err(404, 'Política não encontrada.')
  if (!pol.ativo) throw err(409, 'Política inativa.')
  await expirarOfertas(tenantId)
  const alvos = await alvosDisponiveis(tenantId, pol.tipo, pol.cursoAlvoId)
  const cands = await candidatosPolitica(tenantId, pol)
  const ign = { semConsentimento: 0, semCursoAfim: 0, jaOfertada: 0, limiteContatos: 0, semContato: 0, jaMatriculadaOuRecusada: 0 }
  const itens: any[] = []
  const janela = proximaJanela(agora, pol.janelaInicio, pol.janelaFim)
  const limite = opt.limite ?? 500
  let geradas = 0, reforcos = 0
  for (const c of cands) {
    if (geradas + reforcos >= limite) break
    if (!c.consenteEgresso || !(await consentimentoMarketing(tenantId, { ids: c.ids, email: c.email }))) { ign.semConsentimento++; continue }
    const destino = pol.canal === 'EMAIL' ? c.email : pol.canal === 'IN_APP' ? 'app' : c.telefone
    if (!destino || (pol.canal === 'IN_APP' && !c.studentId)) { ign.semContato++; continue }
    const alvo = pol.cursoAlvoId && alvos[0] ? alvos[0] : escolherAlvoAfim(c.programaOrigem, alvos, (pol.areaAfim as Record<string, string[]> | null) ?? undefined)
    if (!alvo) { ign.semCursoAfim++; continue }
    const chave = `${pol.id}:${c.chaveId}`
    const ex = await prisma.polOferta.findUnique({ where: { chave } })
    if (ex) {
      if (['ACEITA', 'MATRICULADA', 'RECUSADA'].includes(ex.status)) { ign.jaMatriculadaOuRecusada++; continue }
      if (ex.status === 'EXPIRADA' || ex.contatos >= pol.limiteContatos) { ign.limiteContatos++; continue }
      if (ex.ultimoContatoEm && agora.getTime() - ex.ultimoContatoEm.getTime() < 3 * DIA_MS) { ign.jaOfertada++; continue }
    }
    const item = { pessoa: c.nome, origem: c.programaOrigem, alvo: alvo.nome, alvoTipo: alvo.tipo, descontoPct: pol.descontoPct, canal: pol.canal, envioEm: janela.quando, reforco: !!ex }
    if (opt.dryRun) { itens.push(item); ex ? reforcos++ : geradas++; continue }
    const expiraEm = ex?.expiraEm ?? new Date(agora.getTime() + pol.prazoDias * DIA_MS)
    const oferta = ex ?? (await prisma.polOferta.create({ data: { tenantId, politicaId: pol.id, poloId: c.poloId, studentId: c.studentId, egressoId: c.egressoId, chave, nome: c.nome, programaOrigem: c.programaOrigem, alvoTipo: alvo.tipo, alvoId: alvo.id, alvoNome: alvo.nome, descontoPct: pol.descontoPct, expiraEm, canal: pol.canal } }))
    const msg = `Olá, ${c.nome.split(' ')[0]}! ${pol.tipo === 'POS_GRADUACAO' ? 'Sua trajetória combina com a pós-graduação' : 'Que tal uma segunda graduação'} em ${alvo.nome}?${pol.descontoPct > 0 ? ` Condição especial de ${pol.descontoPct}% de desconto` : ' Condição especial'} para quem já é da nossa comunidade, válida até ${expiraEm.toLocaleDateString('pt-BR')}. Para não receber mais ofertas, responda SAIR ou revogue o consentimento na Central de Privacidade.`
    const n = await notify({
      tenantId, canal: pol.canal as any, studentId: c.studentId, destino: pol.canal === 'IN_APP' ? undefined : destino, assunto: `${pol.tipo === 'POS_GRADUACAO' ? 'Pós-graduação' : 'Segunda graduação'}: condição exclusiva para você`, mensagem: msg,
      templateKey: `polos.oferta.${pol.tipo === 'POS_GRADUACAO' ? 'pos' : 'segunda-graduacao'}`, refType: 'PolOferta', refId: oferta.id, agendadoPara: janela.quando,
    })
    await prisma.polOferta.update({ where: { id: oferta.id }, data: { contatos: { increment: 1 }, ultimoContatoEm: agora, notificacaoId: n.id } })
    itens.push(item); ex ? reforcos++ : geradas++
  }
  const res = { dryRun: !!opt.dryRun, candidatos: cands.length, geradas, reforcos, ignorados: ign, janela: { dentro: janela.dentro, proximoEnvio: janela.quando }, itens: itens.slice(0, 100) }
  if (!opt.dryRun) await audit({ tenantId, userId: opt.userId, modulo: 'modalidades', acao: 'POLO_OFERTAS_AUTO_EXECUTAR', refType: 'PolOfertaPolitica', refId: pol.id, detalhes: { candidatos: res.candidatos, geradas, reforcos, ignorados: ign } })
  return res
}
router.post(`${BASE}/ofertas-auto/politicas/:pid/executar`, requireRole(...MANAGE, 'MARKETING'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const b = parseBody(z.object({ dryRun: z.boolean().optional(), limite: z.number().int().min(1).max(2000).optional() }), req.body ?? {})
  res.json(await executarPolitica(getTenantId(req), String(req.params.pid), { ...b, userId: getUserId(req) }))
}))

async function funilOfertas(tenantId: string, f: { poloId?: string; politicaId?: string }) {
  const where: any = { tenantId, ...(f.poloId ? { poloId: f.poloId } : {}), ...(f.politicaId ? { politicaId: f.politicaId } : {}) }
  const g = await prisma.polOferta.groupBy({ by: ['status'], where, _count: true })
  const n = (s: string) => g.find((x) => x.status === s)?._count ?? 0
  const total = g.reduce((s, x) => s + x._count, 0)
  const aceitas = n('ACEITA') + n('MATRICULADA')
  return { total, ofertadas: total, aceitas, matriculadas: n('MATRICULADA'), recusadas: n('RECUSADA'), expiradas: n('EXPIRADA'), emAberto: n('OFERTADA'), taxaAceite: pct(aceitas, total), taxaMatricula: pct(n('MATRICULADA'), total), conversaoAceiteMatricula: pct(n('MATRICULADA'), aceitas) }
}
router.get(`${BASE}/ofertas-auto/funil`, requireRole(...TEACH, 'MARKETING', 'FINANCE'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const poloId = req.query.poloId ? String(req.query.poloId) : undefined
  const politicaId = req.query.politicaId ? String(req.query.politicaId) : undefined
  const geral = await funilOfertas(tenantId, { poloId, politicaId })
  const polos = await prisma.modPolo.findMany({ where: { tenantId, ativo: true }, select: { id: true, nome: true, cidade: true, uf: true } })
  const porPolo: any[] = []
  if (!poloId) for (const p of polos) { const f = await funilOfertas(tenantId, { poloId: p.id, politicaId }); if (f.total) porPolo.push({ polo: p, ...f }) }
  res.json({ ...geral, porPolo })
}))
router.get(`${BASE}/ofertas-auto`, requireRole(...TEACH, 'MARKETING', 'FINANCE'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const where: any = { tenantId }
  for (const k of ['status', 'poloId', 'politicaId', 'alvoTipo']) if (req.query[k]) where[k] = String(req.query[k])
  const items = await prisma.polOferta.findMany({ where, orderBy: { ofertadaEm: 'desc' }, take: Math.min(500, Number(req.query.pageSize) || 100), include: { politica: { select: { nome: true, tipo: true } } } })
  res.json({ items, total: items.length })
}))
const TRANSICOES: Record<string, { de: string[]; para: string; campo: string }> = {
  aceitar: { de: ['OFERTADA'], para: 'ACEITA', campo: 'aceitaEm' }, recusar: { de: ['OFERTADA', 'ACEITA'], para: 'RECUSADA', campo: 'recusadaEm' }, matricular: { de: ['ACEITA'], para: 'MATRICULADA', campo: 'matriculadaEm' },
}
for (const [acao, t] of Object.entries(TRANSICOES)) {
  router.post(`${BASE}/ofertas-auto/:oid/${acao}`, requireRole(...MANAGE, 'MARKETING', 'SUPPORT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const o = await prisma.polOferta.findFirst({ where: { id: String(req.params.oid), tenantId } })
    if (!o) throw err(404, 'Oferta não encontrada.')
    if (!t.de.includes(o.status)) throw err(409, `Oferta em situação ${o.status} não pode ser ${acao === 'aceitar' ? 'aceita' : acao === 'recusar' ? 'recusada' : 'matriculada'}.`)
    if (acao === 'aceitar' && o.expiraEm < new Date()) { await prisma.polOferta.update({ where: { id: o.id }, data: { status: 'EXPIRADA' } }); throw err(410, 'Oferta expirada.') }
    let matricula: any = null
    if (acao === 'matricular' && o.alvoTipo === 'PROGRAMA' && o.studentId && o.alvoId) {
      const term = await prisma.academicTerm.findFirst({ where: { tenantId, dataFim: { gte: new Date() } }, orderBy: { dataInicio: 'asc' } })
      if (term) {
        const ex = await prisma.enrollment.findFirst({ where: { studentId: o.studentId, programId: o.alvoId, termId: term.id } })
        matricula = ex ?? (await prisma.enrollment.create({ data: { studentId: o.studentId, programId: o.alvoId, termId: term.id } }))
      }
    }
    const row = await prisma.polOferta.update({ where: { id: o.id }, data: { status: t.para, [t.campo]: new Date() } })
    await audit({ tenantId, userId: getUserId(req), modulo: 'modalidades', acao: `POLO_OFERTA_${t.para}`, refType: 'PolOferta', refId: o.id, detalhes: { alvo: o.alvoNome, matriculaId: matricula?.id } })
    res.json({ ...row, matriculaGerada: !!matricula, matriculaId: matricula?.id ?? null })
  }))
}

// ---------------------------------------------------------------- jobs
registerEduJob('polos.avisos-provas', () => processarAvisosProvas())
registerEduJob('polos.expirar-ofertas', () => expirarOfertas())

export default router
