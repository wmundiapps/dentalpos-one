import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { dateISO, mountCrud, pageParams, parseBody, qs } from '../core/crud'
import { audit } from '../core/notify'
import { calcularFunil, calcularMetricasCampanha, gerarProtocolo, normalizarCpf, validarCpf, type StatusCandidato } from './logic'
import { agendarFollowUp, gerarCobrancaInscricao, httpErr, mudarStatusCandidato } from './services'

const router = Router()
const GESTAO = ['ADMISSIONS', 'MARKETING', 'COORDINATOR', 'SECRETARY'] as const
const LEITURA = [...GESTAO, 'FINANCE'] as const
const statusEnum = z.enum(['LEAD', 'INSCRITO', 'PROVA', 'APROVADO', 'CONVOCADO', 'MATRICULADO', 'DESISTENTE', 'REPROVADO'])

// ---------- Campanhas ----------

const campanhaSchema = z.object({
  nome: z.string().min(2),
  nivel: z.enum(['GRADUACAO', 'POS_LATO', 'POS_STRICTO']).optional(),
  canal: z.string().min(2),
  utmSource: z.string().optional().nullable(),
  utmMedium: z.string().optional().nullable(),
  utmCampaign: z.string().optional().nullable(),
  processoId: z.string().optional().nullable(),
  status: z.enum(['PLANEJADA', 'ATIVA', 'PAUSADA', 'ENCERRADA']).optional(),
  orcamento: z.number().min(0).optional(),
  metaInscritos: z.number().int().min(0).optional(),
  metaMatriculas: z.number().int().min(0).optional(),
  inicio: dateISO(),
  fim: dateISO(),
  observacoes: z.string().optional().nullable(),
})

mountCrud(router, {
  model: 'admCampanha', path: '/campanhas', read: [...LEITURA], write: [...GESTAO],
  create: campanhaSchema, update: campanhaSchema.partial(), search: ['nome', 'canal', 'utmCampaign'],
  filters: ['status', 'canal', 'nivel', 'processoId'], orderBy: { inicio: 'desc' }, modulo: 'admissoes',
  beforeCreate: async (d, req) => {
    if (d.fim < d.inicio) throw httpErr(400, 'Fim da campanha anterior ao início.')
    if (d.processoId && !(await prisma.admProcessoSeletivo.findFirst({ where: { id: d.processoId, tenantId: getTenantId(req) }, select: { id: true } }))) throw httpErr(404, 'Processo não encontrado.')
    return d
  },
  beforeUpdate: (d, _req, cur) => {
    if ((d.fim ?? cur.fim) < (d.inicio ?? cur.inicio)) throw httpErr(400, 'Fim da campanha anterior ao início.')
    return d
  },
})

mountCrud(router, {
  model: 'admCampanhaGasto', path: '/campanhas-gastos', read: [...LEITURA], write: [...GESTAO],
  create: z.object({ campanhaId: z.string(), data: dateISO().optional(), valor: z.number().positive(), descricao: z.string().optional() }),
  filters: ['campanhaId'], orderBy: { data: 'desc' }, modulo: 'admissoes',
  beforeCreate: async (d, req) => {
    if (!(await prisma.admCampanha.findFirst({ where: { id: d.campanhaId, tenantId: getTenantId(req) }, select: { id: true } }))) throw httpErr(404, 'Campanha não encontrada.')
    return d
  },
})

export async function metricasPorCampanha(tenantId: string, filtros: { campanhaId?: string; processoId?: string } = {}) {
  const campanhas = await prisma.admCampanha.findMany({ where: { tenantId, ...(filtros.campanhaId ? { id: filtros.campanhaId } : {}), ...(filtros.processoId ? { processoId: filtros.processoId } : {}) } })
  const ids = campanhas.map((c) => c.id)
  const [gastos, cands] = await Promise.all([
    prisma.admCampanhaGasto.groupBy({ by: ['campanhaId'], where: { tenantId, campanhaId: { in: ids } }, _sum: { valor: true } }),
    prisma.admCandidato.findMany({ where: { tenantId, campanhaId: { in: ids } }, select: { campanhaId: true, status: true, etapaMaxima: true, ofertaId: true, ofertaAlocadaId: true } }),
  ])
  const ofertas = await prisma.admOferta.findMany({ where: { tenantId, id: { in: [...new Set(cands.flatMap((c) => [c.ofertaAlocadaId ?? c.ofertaId]).filter(Boolean) as string[])] } } })
  const receitaOferta = new Map(ofertas.map((o) => [o.id, o.valorMensalidade * o.parcelas]))
  return campanhas.map((c) => {
    const mine = cands.filter((x) => x.campanhaId === c.id)
    const matric = mine.filter((x) => x.status === 'MATRICULADO')
    const receita = matric.reduce((s, x) => s + (receitaOferta.get((x.ofertaAlocadaId ?? x.ofertaId) as string) ?? 0), 0)
    const custo = gastos.find((g) => g.campanhaId === c.id)?._sum.valor ?? 0
    const m = calcularMetricasCampanha({
      custo, leads: mine.length, inscritos: mine.filter((x) => x.etapaMaxima >= 1).length, matriculas: matric.length,
      receitaPorMatricula: matric.length ? receita / matric.length : 0, metaInscritos: c.metaInscritos, metaMatriculas: c.metaMatriculas, orcamento: c.orcamento,
    })
    return { campanhaId: c.id, nome: c.nome, canal: c.canal, status: c.status, ...m }
  })
}

router.get('/campanhas/:id/metricas', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const r = await metricasPorCampanha(getTenantId(req), { campanhaId: String(req.params.id) })
  if (!r.length) return res.status(404).json({ error: 'Campanha não encontrada.' })
  res.json(r[0])
}))

// ROI/CPL/custo por matrícula consolidados por canal
router.get('/marketing/por-canal', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const lista = await metricasPorCampanha(getTenantId(req), { processoId: qs(req.query.processoId) })
  const canais = new Map<string, { custo: number; leads: number; inscritos: number; matriculas: number; receita: number; campanhas: number }>()
  for (const c of lista) {
    const a = canais.get(c.canal) ?? { custo: 0, leads: 0, inscritos: 0, matriculas: 0, receita: 0, campanhas: 0 }
    a.custo += c.custo; a.leads += c.leads; a.inscritos += c.inscritos; a.matriculas += c.matriculas; a.receita += c.receitaEstimada; a.campanhas++
    canais.set(c.canal, a)
  }
  res.json({
    campanhas: lista,
    canais: [...canais.entries()].map(([canal, a]) => ({ canal, campanhas: a.campanhas, ...calcularMetricasCampanha({ custo: a.custo, leads: a.leads, inscritos: a.inscritos, matriculas: a.matriculas, receitaPorMatricula: a.matriculas ? a.receita / a.matriculas : 0 }) })),
  })
}))

// ---------- Candidatos / leads ----------

const dadosOpc = z.record(z.string(), z.any()).optional().nullable()
const candidatoSchema = z.object({
  processoId: z.string().optional().nullable(),
  ofertaId: z.string().optional().nullable(),
  ofertaId2: z.string().optional().nullable(),
  campanhaId: z.string().optional().nullable(),
  nome: z.string().min(3),
  cpf: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  telefone: z.string().optional().nullable(),
  dataNascimento: dateISO().optional().nullable(),
  origem: z.string().optional().nullable(),
  utmSource: z.string().optional().nullable(),
  utmMedium: z.string().optional().nullable(),
  utmCampaign: z.string().optional().nullable(),
  consentimentoLgpd: z.boolean().optional(),
  cota: z.string().optional().nullable(),
  responsavelId: z.string().optional().nullable(),
  bolsaId: z.string().optional().nullable(),
  dados: dadosOpc,
})

async function validarRefs(tenantId: string, d: any) {
  if (d.cpf) {
    d.cpf = normalizarCpf(d.cpf)
    if (!validarCpf(d.cpf)) throw httpErr(400, 'CPF inválido.')
  }
  if (d.processoId && !(await prisma.admProcessoSeletivo.findFirst({ where: { id: d.processoId, tenantId }, select: { id: true } }))) throw httpErr(404, 'Processo não encontrado.')
  for (const k of ['ofertaId', 'ofertaId2']) {
    if (d[k]) {
      const o = await prisma.admOferta.findFirst({ where: { id: d[k], tenantId } })
      if (!o) throw httpErr(404, 'Oferta não encontrada.')
      if (d.processoId && o.processoId !== d.processoId) throw httpErr(400, 'A oferta não pertence ao processo seletivo informado.')
    }
  }
  if (d.ofertaId && d.ofertaId === d.ofertaId2) throw httpErr(400, 'Segunda opção deve ser diferente da primeira.')
  if (d.campanhaId && !(await prisma.admCampanha.findFirst({ where: { id: d.campanhaId, tenantId }, select: { id: true } }))) throw httpErr(404, 'Campanha não encontrada.')
}

router.get('/candidatos', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const { skip, take, page, pageSize } = pageParams(req.query)
  const where: any = { tenantId }
  for (const f of ['status', 'processoId', 'ofertaId', 'campanhaId', 'origem', 'responsavelId', 'situacaoClassificacao']) {
    const v = qs((req.query as any)[f]); if (v) where[f] = v
  }
  const q = qs(req.query.q)
  if (q) where.OR = [{ nome: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }, { protocolo: { contains: q, mode: 'insensitive' } }, { cpf: { contains: normalizarCpf(q) || '__x__' } }]
  if (qs(req.query.followUpVencido) === 'true') where.proximoContatoEm = { lte: new Date() }
  const [items, total] = await Promise.all([
    prisma.admCandidato.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
    prisma.admCandidato.count({ where }),
  ])
  res.json({ items, total, page, pageSize })
}))

router.get('/candidatos/:id', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const c = await prisma.admCandidato.findFirst({
    where: { id: String(req.params.id), tenantId: getTenantId(req) },
    include: { interacoes: { orderBy: { createdAt: 'desc' }, take: 100 }, notas: true, documentos: true, convocacoes: true, matricula: true, processo: { select: { id: true, nome: true, tipo: true } } },
  })
  if (!c) return res.status(404).json({ error: 'Candidato não encontrado.' })
  res.json(c)
}))

// Cadastro interno (balcão/telefone). Sem processoId = LEAD; com processoId = INSCRITO + cobrança da taxa.
router.post('/candidatos', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const d: any = parseBody(candidatoSchema, req.body)
  await validarRefs(tenantId, d)
  if (d.processoId) {
    const p = await prisma.admProcessoSeletivo.findFirst({ where: { id: d.processoId, tenantId } })
    if (p!.status !== 'ABERTO') throw httpErr(409, 'O processo seletivo não está aberto para inscrições.')
    if (!d.cpf) throw httpErr(400, 'CPF obrigatório para inscrição.')
    if (!d.ofertaId) throw httpErr(400, 'Informe a oferta (curso) pretendida.')
  }
  const c = await prisma.$transaction(async (tx) => {
    // trava por processo+CPF: o schema não tem unique e envios simultâneos duplicariam a inscrição
    if (d.processoId) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`adm-insc:${tenantId}:${d.processoId}:${d.cpf}`}))`
      if (await tx.admCandidato.findFirst({ where: { tenantId, processoId: d.processoId, cpf: d.cpf } })) throw httpErr(409, 'Já existe inscrição deste CPF neste processo.')
    }
    return tx.admCandidato.create({
      data: {
        ...d, tenantId, protocolo: gerarProtocolo(), status: d.processoId ? 'INSCRITO' : 'LEAD', etapaMaxima: d.processoId ? 1 : 0,
        origem: d.origem ?? 'BALCAO', consentimentoEm: d.consentimentoLgpd ? new Date() : null, responsavelId: d.responsavelId ?? getUserId(req),
      },
    })
  }, { timeout: 15_000 })
  if (d.processoId) await gerarCobrancaInscricao({ tenantId, candidatoId: c.id })
  await prisma.admInteracao.create({ data: { tenantId, candidatoId: c.id, tipo: 'SISTEMA', descricao: `Cadastro interno (${c.status})`, userId: getUserId(req) } })
  await audit({ tenantId, userId: getUserId(req), modulo: 'admissoes', acao: 'CRIAR', refType: 'AdmCandidato', refId: c.id })
  res.status(201).json(await prisma.admCandidato.findUnique({ where: { id: c.id } }))
}))

router.patch('/candidatos/:id', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const cur = await prisma.admCandidato.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!cur) return res.status(404).json({ error: 'Candidato não encontrado.' })
  const d: any = parseBody(candidatoSchema.partial(), req.body)
  await validarRefs(tenantId, { processoId: cur.processoId, ...d })
  delete d.processoId // processo não muda por aqui
  if (d.consentimentoLgpd && !cur.consentimentoLgpd) d.consentimentoEm = new Date()
  const upd = await prisma.admCandidato.update({ where: { id: cur.id }, data: d })
  await audit({ tenantId, userId: getUserId(req), modulo: 'admissoes', acao: 'ATUALIZAR', refType: 'AdmCandidato', refId: cur.id })
  res.json(upd)
}))

// Mudança manual de etapa do funil (valida a máquina de estados)
router.post('/candidatos/:id/status', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const b = parseBody(z.object({ status: statusEnum, motivo: z.string().optional() }), req.body)
  if (['CONVOCADO', 'MATRICULADO'].includes(b.status)) throw httpErr(400, 'CONVOCADO/MATRICULADO são definidos pelos fluxos de chamada e matrícula.')
  res.json(await mudarStatusCandidato({ tenantId: getTenantId(req), candidatoId: String(req.params.id), para: b.status as StatusCandidato, motivo: b.motivo, userId: getUserId(req) }))
}))

router.post('/candidatos/:id/gerar-cobranca', requireRole(...GESTAO, 'FINANCE'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  res.json({ cobranca: await gerarCobrancaInscricao({ tenantId: getTenantId(req), candidatoId: String(req.params.id) }) })
}))

// Isenção de taxa (concedida pela gestão): cancela a cobrança e libera o candidato
router.post('/candidatos/:id/isentar-taxa', requireRole('ADMISSIONS', 'COORDINATOR', 'FINANCE'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const motivo = parseBody(z.object({ motivo: z.string().min(3) }), req.body).motivo
  const c = await prisma.admCandidato.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!c) return res.status(404).json({ error: 'Candidato não encontrado.' })
  if (c.taxaReceivableId) await prisma.accountReceivable.updateMany({ where: { id: c.taxaReceivableId, tenantId, status: { in: ['PENDENTE', 'ATRASADO'] } }, data: { status: 'CANCELADO' } })
  await prisma.admCandidato.update({ where: { id: c.id }, data: { taxaPaga: true } })
  await prisma.admInteracao.create({ data: { tenantId, candidatoId: c.id, tipo: 'SISTEMA', descricao: `Taxa isenta: ${motivo}`, userId: getUserId(req) } })
  await audit({ tenantId, userId: getUserId(req), modulo: 'admissoes', acao: 'ISENTAR_TAXA', refType: 'AdmCandidato', refId: c.id, detalhes: { motivo } })
  res.json({ ok: true })
}))

// ---------- Interações e follow-up ----------

router.get('/candidatos/:id/interacoes', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  res.json(await prisma.admInteracao.findMany({ where: { tenantId: getTenantId(req), candidatoId: String(req.params.id) }, orderBy: { createdAt: 'desc' } }))
}))

router.post('/candidatos/:id/interacoes', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(z.object({ tipo: z.enum(['LIGACAO', 'WHATSAPP', 'EMAIL', 'VISITA', 'NOTA']).default('NOTA'), descricao: z.string().min(2), proximoContatoEm: dateISO().optional() }), req.body)
  const c = await prisma.admCandidato.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!c) return res.status(404).json({ error: 'Candidato não encontrado.' })
  if (b.proximoContatoEm && b.proximoContatoEm.getTime() < Date.now() - 60_000) throw httpErr(400, 'A data do próximo contato deve ser futura.')
  const i = await prisma.admInteracao.create({ data: { tenantId, candidatoId: c.id, tipo: b.tipo, descricao: b.descricao, userId: getUserId(req), proximoContatoEm: b.proximoContatoEm } })
  if (b.proximoContatoEm) await agendarFollowUp({ tenantId, candidatoId: c.id, nome: c.nome, quando: b.proximoContatoEm, responsavelId: c.responsavelId ?? getUserId(req), descricao: b.descricao })
  else if (c.proximoContatoEm) await prisma.admCandidato.update({ where: { id: c.id }, data: { proximoContatoEm: null } }) // contato realizado: zera pendência
  res.status(201).json(i)
}))

router.post('/candidatos/:id/follow-up', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(z.object({ quando: dateISO(), descricao: z.string().optional(), responsavelId: z.string().optional() }), req.body)
  const c = await prisma.admCandidato.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!c) return res.status(404).json({ error: 'Candidato não encontrado.' })
  res.status(201).json(await agendarFollowUp({ tenantId, candidatoId: c.id, nome: c.nome, quando: b.quando, responsavelId: b.responsavelId ?? c.responsavelId ?? getUserId(req), descricao: b.descricao }))
}))

// Fila de follow-ups do consultor logado (ou de todos, para coordenação)
router.get('/follow-ups', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const todos = qs(req.query.todos) === 'true' && ['COORDINATOR', 'ADMIN', 'OWNER', 'RECTOR', 'BOARD'].includes(String(req.user!.role))
  res.json(await prisma.admCandidato.findMany({
    where: { tenantId, proximoContatoEm: { not: null }, status: { notIn: ['MATRICULADO', 'DESISTENTE', 'REPROVADO'] }, ...(todos ? {} : { responsavelId: getUserId(req) }) },
    orderBy: { proximoContatoEm: 'asc' }, take: 200,
  }))
}))

// ---------- Importação de leads (planilha/RD Station/Meta Lead Ads) ----------

router.post('/leads/importar', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(z.object({ campanhaId: z.string().optional(), origem: z.string().optional(), leads: z.array(z.object({ nome: z.string().min(2), email: z.string().email().optional(), telefone: z.string().optional(), cpf: z.string().optional() })).min(1).max(1000) }), req.body)
  const camp = b.campanhaId ? await prisma.admCampanha.findFirst({ where: { id: b.campanhaId, tenantId } }) : null
  if (b.campanhaId && !camp) throw httpErr(404, 'Campanha não encontrada.')
  let criados = 0, duplicados = 0
  for (const l of b.leads) {
    const cpf = l.cpf ? normalizarCpf(l.cpf) : undefined
    const dup = await prisma.admCandidato.findFirst({ where: { tenantId, processoId: null, OR: [...(l.email ? [{ email: l.email }] : []), ...(cpf ? [{ cpf }] : [])] }, select: { id: true } })
    if (dup || (l.email == null && !l.telefone && !cpf)) { duplicados++; continue }
    await prisma.admCandidato.create({ data: { tenantId, protocolo: gerarProtocolo(), nome: l.nome, email: l.email, telefone: l.telefone, cpf: cpf && validarCpf(cpf) ? cpf : undefined, status: 'LEAD', origem: b.origem ?? camp?.canal ?? 'IMPORTACAO', campanhaId: camp?.id, utmSource: camp?.utmSource, utmMedium: camp?.utmMedium, utmCampaign: camp?.utmCampaign, responsavelId: getUserId(req) } })
    criados++
  }
  res.status(201).json({ criados, duplicados })
}))

// ---------- Funil ----------

router.get('/funil', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const where: any = { tenantId }
  for (const f of ['processoId', 'campanhaId', 'ofertaId']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
  const cands = await prisma.admCandidato.findMany({ where, select: { status: true, etapaMaxima: true } })
  res.json(calcularFunil(cands.map((c) => ({ status: c.status as StatusCandidato, etapaMaxima: c.etapaMaxima }))))
}))

export default router
