// Indicadores por pessoa da Infraestrutura para a AVALIAÇÃO DO FUNCIONÁRIO no módulo RH (contrato documentado no README).
// Funções exportadas (consumo direto, sem HTTP):  indicadoresPessoaInfra(tenantId, ref, de, ate)  e  indicadoresInfraLote(tenantId, de, ate)
// HTTP (RH/administração; o próprio funcionário vê só os seus em /meus):
//   GET /api/edu/infraestrutura/rh/indicadores?userId=|colaboradorId=&de=&ate=
//   GET /api/edu/infraestrutura/rh/indicadores/lote?de=&ate=&perfil=
//   GET /api/edu/infraestrutura/rh/indicadores/meus
// O índice é apenas um subsídio objetivo; a decisão avaliativa é do RH/gestor (LGPD art. 20: revisão humana).
import { Router } from 'express'
import {
  AuthenticatedRequest, Response, addDias, asyncHandler, audit, fail, getTenantId, getUserId, isRh, MOD2, money, nomeUsuario, parseBody, prisma, qs, z,
} from './common'
import { pct } from '../seguranca-patrimonial/calc'

export interface RefPessoa { userId?: string | null; colaboradorId?: string | null }
const media = (xs: number[]) => (xs.length ? money(xs.reduce((a, b) => a + b, 0) / xs.length) : null)
const taxa = (a: number, b: number) => pct(a, b)

async function resolver(tenantId: string, ref: RefPessoa) {
  let userId = ref.userId ?? null
  let colaboradorId = ref.colaboradorId ?? null
  let colab: any = null
  const del = (prisma as any).rheColaborador
  if (del) {
    colab = colaboradorId ? await del.findFirst({ where: { id: colaboradorId, tenantId } }) : userId ? await del.findFirst({ where: { tenantId, userId } }) : null
    if (colab) { colaboradorId = colab.id; userId = userId ?? colab.userId ?? null }
  }
  if (!userId && !colaboradorId) fail(400, 'Informe userId ou colaboradorId.')
  const user = userId ? await prisma.user.findFirst({ where: { id: userId, tenantId }, select: { id: true, role: true } }) : null
  if (userId && !user && !colab) fail(404, 'Pessoa não encontrada neste tenant.')
  const nome = colab?.nome ?? (await nomeUsuario(tenantId, userId))
  return { userId, colaboradorId, nome, perfil: colab?.tipo ?? (user?.role ? String(user.role) : null), cargoRh: colab?.cargoId ?? null }
}

export async function indicadoresPessoaInfra(tenantId: string, ref: RefPessoa, de: Date, ate: Date) {
  const p = await resolver(tenantId, ref)
  const uid = p.userId ?? '__none__'
  const periodo = { gte: de, lte: ate }

  const [solResp, solSolic, oss, agenda, motoristas, agentes] = await Promise.all([
    prisma.inf2Solicitacao.findMany({ where: { tenantId, responsavelUserId: uid, createdAt: periodo } }),
    prisma.inf2Solicitacao.findMany({ where: { tenantId, solicitanteUserId: uid, createdAt: periodo } }),
    prisma.inf2OrdemServico.findMany({ where: { tenantId, responsavelUserId: uid, createdAt: periodo } }),
    prisma.inf2AgendaItem.findMany({ where: { tenantId, responsavelUserId: uid, inicio: periodo, status: { not: 'CANCELADO' } } }),
    prisma.inf2Motorista.findMany({ where: { tenantId, OR: [{ userId: uid }, ...(p.colaboradorId ? [{ colaboradorId: p.colaboradorId }] : [])] } }),
    prisma.inf2Agente.findMany({ where: { tenantId, OR: [{ userId: uid }, ...(p.colaboradorId ? [{ colaboradorId: p.colaboradorId }] : [])] } }),
  ])
  const agora = new Date()

  // --- manutenção / solicitações / OS / agenda (cumprimento de prazos)
  const solRes = solResp.filter((s) => s.resolvidoEm)
  const solNoPrazo = solRes.filter((s) => s.prazo && s.resolvidoEm! <= s.prazo).length
  const solComPrazo = solRes.filter((s) => s.prazo).length
  const solVencidas = solResp.filter((s) => ['NOVA', 'EM_TRIAGEM', 'OS_GERADA', 'EM_ANDAMENTO', 'AGUARDANDO'].includes(s.status) && s.prazo && s.prazo < agora).length
  const notas = solResp.filter((s) => s.avaliacaoNota != null).map((s) => s.avaliacaoNota!)
  const osConc = oss.filter((o) => o.status === 'CONCLUIDA')
  const osNoPrazo = osConc.filter((o) => o.noPrazo === true).length
  const osComPrazo = osConc.filter((o) => o.noPrazo !== null).length
  const osAtrasadas = oss.filter((o) => ['ABERTA', 'EM_EXECUCAO', 'AGUARDANDO_MATERIAL'].includes(o.status) && o.prazo && o.prazo < agora).length
  const agConc = agenda.filter((a) => a.status === 'CONCLUIDO')
  const agNoPrazo = agConc.filter((a) => a.concluidoEm && a.concluidoEm <= addDias(a.fim ?? a.inicio, 1)).length
  const agAtrasados = agenda.filter((a) => ['PLANEJADO', 'EM_ANDAMENTO'].includes(a.status) && (a.fim ?? a.inicio) < agora).length

  // --- frota (como condutor ou responsável por multa)
  const motIds = motoristas.map((m) => m.id)
  const [viagens, multas, regs] = await Promise.all([
    motIds.length ? prisma.inf2Reserva.findMany({ where: { tenantId, motoristaId: { in: motIds }, status: 'CONCLUIDA', retornoReal: periodo } }) : Promise.resolve([]),
    prisma.inf2Multa.findMany({ where: { tenantId, dataInfracao: periodo, OR: [{ responsavelUserId: uid }, ...(motIds.length ? [{ motoristaId: { in: motIds } }] : [])] } }),
    motIds.length ? prisma.inf2FrotaRegistro.count({ where: { tenantId, motoristaId: { in: motIds }, data: periodo } }) : Promise.resolve(0),
  ])
  const multasVal = multas.filter((m) => m.status !== 'CANCELADA')
  const kmViagens = viagens.reduce((s, v) => s + Math.max(0, (v.kmChegada ?? 0) - (v.kmSaida ?? 0)), 0)

  // --- segurança patrimonial (agente/coordenador)
  const agIds = agentes.map((a) => a.id)
  const [escs, rondas, ocs, passagens] = agIds.length ? await Promise.all([
    prisma.inf2Escala.findMany({ where: { tenantId, agenteId: { in: agIds }, data: periodo, status: { notIn: ['TROCA'] } } }),
    prisma.inf2Ronda.findMany({ where: { tenantId, agenteId: { in: agIds }, inicio: periodo, status: { not: 'EM_ANDAMENTO' } } }),
    prisma.inf2OcorrenciaSeg.findMany({ where: { tenantId, agenteId: { in: agIds }, ocorridaEm: periodo } }),
    prisma.inf2Passagem.findMany({ where: { tenantId, deAgenteId: { in: agIds }, createdAt: periodo } }),
  ]) : [[], [], [], []] as any[]
  const escRealizaveis = escs.filter((e: any) => e.status !== 'PREVISTA' || e.data < agora)
  const escOk = escs.filter((e: any) => ['CUMPRIDA', 'ATRASO'].includes(e.status)).length

  // --- componentes do índice (0-100), apenas os que têm base de cálculo
  const noPrazoTot = solNoPrazo + osNoPrazo + agNoPrazo
  const comPrazoTot = solComPrazo + osComPrazo + agConc.length
  const comp = {
    pontualidadePct: taxa(noPrazoTot, comPrazoTot),
    satisfacaoPct: notas.length ? money((notas.reduce((a, b) => a + b, 0) / notas.length) * 20) : null,
    assiduidadePct: escRealizaveis.length ? taxa(escOk, escRealizaveis.length) : null,
    rondasPct: rondas.length ? taxa(rondas.filter((r: any) => r.status === 'CONCLUIDA').length, rondas.length) : null,
    conformidadeFrotaPct: motIds.length || multas.length ? Math.max(0, 100 - multasVal.length * 20 - multasVal.reduce((s, m) => s + m.pontos, 0) * 2) : null,
  }
  const vals = Object.values(comp).filter((v): v is number => typeof v === 'number')
  const temDados = solResp.length + solSolic.length + oss.length + agenda.length + viagens.length + multas.length + escs.length + rondas.length + ocs.length > 0

  return {
    contrato: 'infra-rh-v1', periodo: { de, ate }, geradoEm: agora,
    pessoa: p,
    finalidade: 'Subsídio à avaliação de desempenho (RH). Indicadores objetivos; a decisão avaliativa é humana.',
    temDados,
    manutencao: {
      solicitacoesAtribuidas: solResp.length, resolvidas: solRes.length, noPrazo: solNoPrazo, vencidasAbertas: solVencidas,
      cumprimentoPrazoPct: taxa(solNoPrazo, solComPrazo), avaliacaoMediaDosSolicitantes: media(notas),
      osAtribuidas: oss.length, osConcluidas: osConc.length, osNoPrazo, osAtrasadas, osCumprimentoPrazoPct: taxa(osNoPrazo, osComPrazo), custoOs: money(osConc.reduce((s, o) => s + (o.custoReal ?? 0), 0)),
      agendaItens: agenda.length, agendaConcluidos: agConc.length, agendaNoPrazo: agNoPrazo, agendaAtrasados: agAtrasados,
    },
    solicitante: { abertas: solSolic.length, avaliou: solSolic.filter((s) => s.avaliacaoNota != null).length },
    frota: {
      ehMotorista: motIds.length > 0, viagensConcluidas: viagens.length, kmEmViagens: money(kmViagens), registrosKmAbastecimento: regs,
      multas: multasVal.length, multasValor: money(multasVal.reduce((s, m) => s + m.valor, 0)), pontosCnh: multasVal.reduce((s, m) => s + m.pontos, 0),
      multasEmAberto: multasVal.filter((m) => ['REGISTRADA', 'EM_RECURSO'].includes(m.status)).length,
      cnhValidade: motoristas.map((m) => m.cnhValidade).filter(Boolean).sort().pop() ?? null,
    },
    segurancaPatrimonial: {
      ehAgente: agIds.length > 0, cargos: agentes.map((a) => a.cargo),
      escalas: escs.length, cumpridas: escOk, faltas: escs.filter((e: any) => e.status === 'FALTA').length, atrasos: escs.filter((e: any) => e.status === 'ATRASO').length, assiduidadePct: comp.assiduidadePct,
      rondas: rondas.length, rondasCompletas: rondas.filter((r: any) => r.status === 'CONCLUIDA').length, rondasPct: comp.rondasPct, ocorrenciasRegistradas: ocs.length, passagensDeServico: passagens.length,
    },
    componentes: comp,
    indiceInfra: vals.length ? money(vals.reduce((a, b) => a + b, 0) / vals.length) : null,
  }
}

/** Todas as pessoas com atividade no período (para a avaliação em lote do RH). */
export async function indicadoresInfraLote(tenantId: string, de: Date, ate: Date) {
  const periodo = { gte: de, lte: ate }
  const [a, b, c, d, e, f] = await Promise.all([
    prisma.inf2Solicitacao.findMany({ where: { tenantId, createdAt: periodo }, select: { responsavelUserId: true, solicitanteUserId: true } }),
    prisma.inf2OrdemServico.findMany({ where: { tenantId, createdAt: periodo }, select: { responsavelUserId: true } }),
    prisma.inf2AgendaItem.findMany({ where: { tenantId, inicio: periodo }, select: { responsavelUserId: true } }),
    prisma.inf2Motorista.findMany({ where: { tenantId }, select: { userId: true, colaboradorId: true } }),
    prisma.inf2Agente.findMany({ where: { tenantId }, select: { userId: true, colaboradorId: true } }),
    prisma.inf2Multa.findMany({ where: { tenantId, dataInfracao: periodo }, select: { responsavelUserId: true } }),
  ])
  const users = new Set<string>(); const colabs = new Set<string>()
  const addU = (x?: string | null) => { if (x) users.add(x) }
  a.forEach((s) => { addU(s.responsavelUserId) }); b.forEach((s) => addU(s.responsavelUserId)); c.forEach((s) => addU(s.responsavelUserId)); f.forEach((s) => addU(s.responsavelUserId))
  ;[...d, ...e].forEach((m) => { addU(m.userId); if (!m.userId && m.colaboradorId) colabs.add(m.colaboradorId) })
  const out: Array<Awaited<ReturnType<typeof indicadoresPessoaInfra>> | null> = []
  for (const userId of users) out.push(await indicadoresPessoaInfra(tenantId, { userId }, de, ate).catch(() => null))
  for (const colaboradorId of colabs) out.push(await indicadoresPessoaInfra(tenantId, { colaboradorId }, de, ate).catch(() => null))
  return out.filter((x): x is NonNullable<typeof x> => !!x && x.temDados)
}

const periodoQ = (req: AuthenticatedRequest) => {
  const ate = qs(req.query.ate) ? new Date(qs(req.query.ate)! + (qs(req.query.ate)!.length <= 10 ? 'T23:59:59Z' : '')) : new Date()
  const de = qs(req.query.de) ? new Date(qs(req.query.de)!) : addDias(ate, -365)
  if (isNaN(de.getTime()) || isNaN(ate.getTime())) fail(400, 'Período inválido.')
  if (de > ate) fail(400, 'de posterior a ate.')
  return { de, ate }
}

export function mountIndicadoresPessoas(router: Router) {
  const exigirRh = (req: AuthenticatedRequest, res: Response, next: () => void) => (isRh(req) ? next() : (res.status(403).json({ error: 'Somente RH ou administração acessam os indicadores de pessoas.' }) as any))
  router.get('/rh/indicadores/meus', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { de, ate } = periodoQ(req)
    res.json(await indicadoresPessoaInfra(getTenantId(req), { userId: getUserId(req) }, de, ate))
  }))
  router.get('/rh/indicadores/lote', exigirRh as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { de, ate } = periodoQ(req)
    const itens = await indicadoresInfraLote(getTenantId(req), de, ate)
    const perfil = qs(req.query.perfil)
    const filtrados = perfil ? itens.filter((i) => i.pessoa.perfil === perfil) : itens
    await audit({ tenantId: getTenantId(req), userId: getUserId(req), modulo: MOD2, acao: 'INDICADORES_LOTE_CONSULTADO', detalhes: { pessoas: filtrados.length } })
    res.json({ contrato: 'infra-rh-v1', periodo: { de, ate }, total: filtrados.length, items: filtrados })
  }))
  router.get('/rh/indicadores', exigirRh as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { de, ate } = periodoQ(req)
    const ref = parseBody(z.object({ userId: z.string().optional(), colaboradorId: z.string().optional() }), { userId: qs(req.query.userId), colaboradorId: qs(req.query.colaboradorId) })
    const r = await indicadoresPessoaInfra(getTenantId(req), ref, de, ate)
    await audit({ tenantId: getTenantId(req), userId: getUserId(req), modulo: MOD2, acao: 'INDICADORES_PESSOA_CONSULTADO', refType: 'User', refId: r.pessoa.userId ?? r.pessoa.colaboradorId ?? undefined })
    res.json(r)
  }))
}
