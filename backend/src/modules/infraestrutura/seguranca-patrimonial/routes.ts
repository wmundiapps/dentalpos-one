import { Router } from 'express'
import { randomBytes } from 'crypto'
import { mountCrud } from '../../core/crud'
import {
  AuthenticatedRequest, GESTAO, LEITURA, MOD2, OPERACAO, Response, asyncHandler, audit, dateISO, fail, getTenantId, getUserId, idParam, isGestao, nextNum, nomeDe, notify, pageParams,
  parseBody, prisma, qs, requireRole, usuariosComPapel, z,
} from '../inf2/common'
import { HHMM, atrasoMin, dias12x36, diasEntre, pct, statusRonda, turnosSobrepoem } from './calc'

export const CARGOS = ['SEGURANCA', 'COORDENADOR_SALAS', 'COORDENADOR_PATIO', 'COORDENADOR_ESTACIONAMENTO', 'PORTEIRO', 'COORDENADOR_PORTARIA'] as const
export const TIPOS_POSTO = ['PORTARIA', 'PATIO', 'ESTACIONAMENTO', 'SALAS', 'RONDA_MOVEL'] as const
const TURNOS = ['MANHA', 'TARDE', 'NOITE', 'INTEGRAL', 'PLANTAO_12X36'] as const
const hhmm = z.string().regex(HHMM, 'Use HH:MM.')
const dia = (s: string | Date) => new Date((typeof s === 'string' ? s : s.toISOString()).slice(0, 10) + 'T00:00:00Z')

async function agenteDoUsuario(tenantId: string, userId: string) {
  return prisma.inf2Agente.findFirst({ where: { tenantId, userId, ativo: true } })
}
async function agenteReq(req: AuthenticatedRequest, agenteId?: string | null) {
  const tenantId = getTenantId(req)
  if (agenteId && (isGestao(req) || String(req.user?.role).toUpperCase() === 'COORDINATOR')) {
    const a = await prisma.inf2Agente.findFirst({ where: { id: agenteId, tenantId } })
    if (!a) fail(400, 'Agente não encontrado.')
    return a
  }
  const a = await agenteDoUsuario(tenantId, getUserId(req))
  if (!a) fail(403, 'Seu usuário não está cadastrado como agente de segurança/coordenação.')
  if (agenteId && agenteId !== a.id) fail(403, 'Você só pode agir em seu próprio nome.')
  return a
}

export function mountSegurancaPatrimonial(router: Router) {
  const B = '/seguranca-patrimonial'

  mountCrud(router, {
    model: 'inf2Posto', path: `${B}/postos`, read: LEITURA, write: GESTAO, modulo: MOD2, search: ['nome', 'codigo'], filters: ['tipo', 'ativo'], orderBy: { codigo: 'asc' },
    create: z.object({ codigo: z.string().min(2).max(20).transform((s) => s.toUpperCase()), nome: z.string().min(2).max(120), tipo: z.enum(TIPOS_POSTO), spaceId: z.string().optional().nullable(), efetivoMinimo: z.number().int().min(1).max(50).default(1), ativo: z.boolean().default(true) }),
    beforeCreate: async (d, req) => { if (await prisma.inf2Posto.findFirst({ where: { tenantId: getTenantId(req), codigo: d.codigo } })) fail(409, 'Já existe posto com este código.'); return d },
  })

  // agentes: vínculo com o colaborador do RH por id (RheColaborador) quando o módulo RH existe
  mountCrud(router, {
    model: 'inf2Agente', path: `${B}/agentes`, read: LEITURA, write: GESTAO, modulo: MOD2, search: ['nome', 'matricula'], filters: ['cargo', 'ativo', 'userId', 'colaboradorId'], orderBy: { nome: 'asc' },
    create: z.object({ nome: z.string().min(3).max(160), cargo: z.enum(CARGOS), userId: z.string().optional().nullable(), colaboradorId: z.string().optional().nullable(), matricula: z.string().max(40).optional().nullable(), terceirizado: z.boolean().default(false), empresa: z.string().max(160).optional().nullable(), telefone: z.string().max(30).optional().nullable(), ativo: z.boolean().default(true) }),
    beforeCreate: validarAgente, beforeUpdate: (d, req, cur) => validarAgente(d, req, cur),
  })

  // ------------------------------------------------------------ escalas
  const checarEscala = async (tenantId: string, d: { data: Date; agenteId: string; inicio: string; fim: string; turno: string; postoId: string }, ignorar?: string) => {
    const posto = await prisma.inf2Posto.findFirst({ where: { id: d.postoId, tenantId, ativo: true } }); if (!posto) fail(400, 'Posto não encontrado ou inativo.')
    const ag = await prisma.inf2Agente.findFirst({ where: { id: d.agenteId, tenantId, ativo: true } }); if (!ag) fail(400, 'Agente não encontrado ou inativo.')
    const vizinhas = await prisma.inf2Escala.findMany({ where: { tenantId, agenteId: d.agenteId, status: { not: 'TROCA' }, data: { gte: new Date(d.data.getTime() - 86_400_000), lte: new Date(d.data.getTime() + 86_400_000) }, ...(ignorar ? { id: { not: ignorar } } : {}) } })
    for (const o of vizinhas) if (turnosSobrepoem({ inicio: d.inicio, fim: d.fim }, { inicio: o.inicio, fim: o.fim }, Math.round((o.data.getTime() - d.data.getTime()) / 86_400_000))) fail(409, `Conflito de escala: o agente já está escalado em ${o.data.toISOString().slice(0, 10)} ${o.inicio}-${o.fim}.`)
    return { posto, ag }
  }
  const escalaSchema = z.object({ data: dateISO(), postoId: z.string(), agenteId: z.string(), turno: z.enum(TURNOS), inicio: hhmm, fim: hhmm, observacoes: z.string().max(300).optional().nullable() })
  router.post(`${B}/escalas`, requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d = parseBody(escalaSchema, req.body)
    const data = dia(d.data)
    await checarEscala(tenantId, { ...d, data })
    const e = await prisma.inf2Escala.create({ data: { ...d, data, tenantId } })
    res.status(201).json(e)
  }))
  router.post(`${B}/escalas/lote`, requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d = parseBody(z.object({ de: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), postoId: z.string(), agenteId: z.string(), turno: z.enum(TURNOS), inicio: hhmm, fim: hhmm, diasSemana: z.array(z.number().int().min(0).max(6)).optional() }), req.body)
    if (d.ate < d.de) fail(400, 'ate anterior a de.')
    const dias = d.turno === 'PLANTAO_12X36' ? dias12x36(d.de, d.ate) : diasEntre(d.de, d.ate, d.diasSemana)
    const criadas: any[] = [], conflitos: any[] = []
    for (const s of dias) {
      try { await checarEscala(tenantId, { data: dia(s), postoId: d.postoId, agenteId: d.agenteId, inicio: d.inicio, fim: d.fim, turno: d.turno }); criadas.push(await prisma.inf2Escala.create({ data: { tenantId, data: dia(s), postoId: d.postoId, agenteId: d.agenteId, turno: d.turno, inicio: d.inicio, fim: d.fim } })) }
      catch (e: any) { if (e.status === 409 || e.status === 400) conflitos.push({ data: s, motivo: e.message }); else throw e }
    }
    res.status(201).json({ criadas: criadas.length, conflitos })
  }))
  router.get(`${B}/escalas`, requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId: getTenantId(req) }
    for (const f of ['postoId', 'agenteId', 'status', 'turno']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    const de = qs(req.query.de), ate = qs(req.query.ate)
    if (de || ate) where.data = { ...(de ? { gte: dia(de) } : {}), ...(ate ? { lte: dia(ate) } : {}) }
    const [rows, total] = await Promise.all([prisma.inf2Escala.findMany({ where, orderBy: [{ data: 'asc' }, { inicio: 'asc' }], skip, take }), prisma.inf2Escala.count({ where })])
    const ags = Object.fromEntries((await prisma.inf2Agente.findMany({ where: { tenantId: where.tenantId, id: { in: [...new Set(rows.map((r) => r.agenteId))] } } })).map((a) => [a.id, a]))
    const pts = Object.fromEntries((await prisma.inf2Posto.findMany({ where: { tenantId: where.tenantId } })).map((p) => [p.id, p]))
    res.json({ items: rows.map((r) => ({ ...r, agenteNome: ags[r.agenteId]?.nome, cargo: ags[r.agenteId]?.cargo, postoNome: pts[r.postoId]?.nome })), total, page, pageSize })
  }))
  router.get(`${B}/escalas/cobertura`, requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d = dia(qs(req.query.data) ?? new Date().toISOString())
    const [postos, escs] = await Promise.all([prisma.inf2Posto.findMany({ where: { tenantId, ativo: true } }), prisma.inf2Escala.findMany({ where: { tenantId, data: d, status: { notIn: ['FALTA', 'TROCA'] } } })])
    res.json({ data: d.toISOString().slice(0, 10), postos: postos.map((p) => { const n = new Set(escs.filter((e) => e.postoId === p.id).map((e) => e.agenteId)).size; return { postoId: p.id, nome: p.nome, efetivoMinimo: p.efetivoMinimo, escalados: n, descoberto: n < p.efetivoMinimo } }) })
  }))
  router.post(`${B}/escalas/:id/ponto`, requireRole(...OPERACAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const e = await prisma.inf2Escala.findFirst({ where: { id: idParam(req), tenantId } })
    if (!e) return res.status(404).json({ error: 'Escala não encontrada.' })
    const b = parseBody(z.object({ acao: z.enum(['ENTRADA', 'SAIDA']) }), req.body)
    const ag = await prisma.inf2Agente.findFirst({ where: { id: e.agenteId, tenantId } })
    if (!isGestao(req) && ag?.userId !== getUserId(req)) fail(403, 'Só o próprio agente registra seu ponto.')
    if (b.acao === 'ENTRADA') {
      if (e.entradaEm) fail(409, 'Entrada já registrada.')
      const agora = new Date()
      const atraso = atrasoMin(e.inicio, agora, e.data)
      return res.json(await prisma.inf2Escala.update({ where: { id: e.id }, data: { entradaEm: agora, status: atraso > 0 ? 'ATRASO' : 'CUMPRIDA' } }))
    }
    if (!e.entradaEm) fail(409, 'Registre a entrada antes da saída.')
    if (e.saidaEm) fail(409, 'Saída já registrada.')
    res.json(await prisma.inf2Escala.update({ where: { id: e.id }, data: { saidaEm: new Date(), status: e.status === 'PREVISTA' ? 'CUMPRIDA' : e.status } }))
  }))
  router.post(`${B}/escalas/:id/falta`, requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const e = await prisma.inf2Escala.findFirst({ where: { id: idParam(req), tenantId: getTenantId(req) } })
    if (!e) return res.status(404).json({ error: 'Escala não encontrada.' })
    if (e.entradaEm) fail(409, 'O agente já registrou entrada.')
    res.json(await prisma.inf2Escala.update({ where: { id: e.id }, data: { status: 'FALTA', observacoes: parseBody(z.object({ motivo: z.string().max(300).optional() }), req.body ?? {}).motivo ?? e.observacoes } }))
  }))
  router.post(`${B}/escalas/:id/troca`, requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const e = await prisma.inf2Escala.findFirst({ where: { id: idParam(req), tenantId } })
    if (!e) return res.status(404).json({ error: 'Escala não encontrada.' })
    const b = parseBody(z.object({ novoAgenteId: z.string() }), req.body)
    if (b.novoAgenteId === e.agenteId) fail(400, 'O novo agente é o mesmo.')
    await checarEscala(tenantId, { data: e.data, postoId: e.postoId, agenteId: b.novoAgenteId, inicio: e.inicio, fim: e.fim, turno: e.turno })
    await prisma.inf2Escala.update({ where: { id: e.id }, data: { status: 'TROCA' } })
    res.status(201).json(await prisma.inf2Escala.create({ data: { tenantId, data: e.data, postoId: e.postoId, agenteId: b.novoAgenteId, turno: e.turno, inicio: e.inicio, fim: e.fim, observacoes: `Troca (substitui ${e.agenteId})` } }))
  }))

  // ------------------------------------------------------------ checkpoints QR e rondas
  router.post(`${B}/checkpoints`, requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d = parseBody(z.object({ nome: z.string().min(2).max(120), postoId: z.string().optional().nullable(), spaceId: z.string().optional().nullable(), ordem: z.number().int().min(1).max(500).default(1) }), req.body)
    if (d.postoId && !(await prisma.inf2Posto.findFirst({ where: { id: d.postoId, tenantId } }))) fail(400, 'Posto não encontrado.')
    const c = await prisma.inf2Checkpoint.create({ data: { ...d, tenantId, token: 'CK' + randomBytes(9).toString('base64url') } })
    res.status(201).json(c)
  }))
  router.get(`${B}/checkpoints`, requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const where: any = { tenantId: getTenantId(req) }
    if (qs(req.query.postoId)) where.postoId = qs(req.query.postoId)
    const rows = await prisma.inf2Checkpoint.findMany({ where, orderBy: [{ ordem: 'asc' }, { nome: 'asc' }], take: 500 })
    res.json({ items: rows, total: rows.length })
  }))
  router.patch(`${B}/checkpoints/:id`, requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const c = await prisma.inf2Checkpoint.findFirst({ where: { id: idParam(req), tenantId } })
    if (!c) return res.status(404).json({ error: 'Checkpoint não encontrado.' })
    res.json(await prisma.inf2Checkpoint.update({ where: { id: c.id }, data: parseBody(z.object({ nome: z.string().min(2).max(120), ordem: z.number().int().min(1), ativo: z.boolean() }).partial(), req.body) }))
  }))

  router.post(`${B}/rondas`, requireRole(...OPERACAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(z.object({ postoId: z.string().optional().nullable(), agenteId: z.string().optional().nullable() }), req.body ?? {})
    const ag = await agenteReq(req, b.agenteId)
    if (await prisma.inf2Ronda.findFirst({ where: { tenantId, agenteId: ag.id, status: 'EM_ANDAMENTO' } })) fail(409, 'Já existe uma ronda em andamento para este agente.')
    const cks = await prisma.inf2Checkpoint.count({ where: { tenantId, ativo: true, ...(b.postoId ? { postoId: b.postoId } : {}) } })
    if (!cks) fail(400, 'Não há checkpoints ativos para esta ronda.')
    res.status(201).json(await prisma.inf2Ronda.create({ data: { tenantId, agenteId: ag.id, postoId: b.postoId ?? null, esperados: cks } }))
  }))
  router.post(`${B}/rondas/:id/leitura`, requireRole(...OPERACAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const r = await prisma.inf2Ronda.findFirst({ where: { id: idParam(req), tenantId } })
    if (!r) return res.status(404).json({ error: 'Ronda não encontrada.' })
    const ag = await agenteReq(req, r.agenteId)
    if (r.status !== 'EM_ANDAMENTO') fail(409, 'Ronda já encerrada.')
    const b = parseBody(z.object({ token: z.string().min(4).max(60), observacao: z.string().max(500).optional(), anormalidade: z.boolean().default(false) }), req.body)
    const ck = await prisma.inf2Checkpoint.findFirst({ where: { tenantId, token: b.token, ativo: true } })
    if (!ck) fail(404, 'QR de checkpoint inválido.')
    if (r.postoId && ck.postoId && ck.postoId !== r.postoId) fail(400, 'Este checkpoint pertence a outro posto.')
    if (await prisma.inf2RondaLeitura.findFirst({ where: { rondaId: r.id, checkpointId: ck.id } })) fail(409, 'Checkpoint já lido nesta ronda.')
    const l = await prisma.inf2RondaLeitura.create({ data: { tenantId, rondaId: r.id, checkpointId: ck.id, observacao: b.observacao, anormalidade: b.anormalidade } })
    await prisma.inf2Ronda.update({ where: { id: r.id }, data: { lidos: { increment: 1 } } })
    let ocorrenciaId: string | undefined
    if (b.anormalidade) ocorrenciaId = (await registrarOcorrencia(tenantId, getUserId(req), { tipo: 'OUTRO', gravidade: 'ALTA', descricao: `Anormalidade na ronda em "${ck.nome}": ${b.observacao ?? 'sem detalhes'}`, local: ck.nome, spaceId: ck.spaceId ?? undefined, postoId: ck.postoId ?? undefined, agenteId: ag.id })).id
    res.status(201).json({ ...l, checkpoint: ck.nome, ocorrenciaId })
  }))
  router.post(`${B}/rondas/:id/encerrar`, requireRole(...OPERACAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const r = await prisma.inf2Ronda.findFirst({ where: { id: idParam(req), tenantId } })
    if (!r) return res.status(404).json({ error: 'Ronda não encontrada.' })
    await agenteReq(req, r.agenteId)
    if (r.status !== 'EM_ANDAMENTO') fail(409, 'Ronda já encerrada.')
    const lidos = await prisma.inf2RondaLeitura.count({ where: { rondaId: r.id } })
    res.json(await prisma.inf2Ronda.update({ where: { id: r.id }, data: { fim: new Date(), lidos, status: statusRonda(r.esperados, lidos), observacoes: parseBody(z.object({ observacoes: z.string().max(500).optional() }), req.body ?? {}).observacoes } }))
  }))
  router.get(`${B}/rondas`, requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId: getTenantId(req) }
    for (const f of ['agenteId', 'postoId', 'status']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    const [rows, total] = await Promise.all([prisma.inf2Ronda.findMany({ where, orderBy: { inicio: 'desc' }, skip, take }), prisma.inf2Ronda.count({ where })])
    res.json({ items: rows, total, page, pageSize })
  }))
  router.get(`${B}/rondas/:id`, requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const r = await prisma.inf2Ronda.findFirst({ where: { id: idParam(req), tenantId: getTenantId(req) }, include: { leituras: { orderBy: { lidoEm: 'asc' } } } })
    if (!r) return res.status(404).json({ error: 'Ronda não encontrada.' })
    res.json(r)
  }))

  // ------------------------------------------------------------ ocorrências de segurança
  const ocSchema = z.object({
    tipo: z.enum(['FURTO', 'DANO', 'ACESSO_INDEVIDO', 'BRIGA', 'INCENDIO', 'ACIDENTE', 'VEICULO', 'ALARME', 'OUTRO']), gravidade: z.enum(['BAIXA', 'MEDIA', 'ALTA', 'CRITICA']).default('MEDIA'),
    descricao: z.string().min(5).max(4000), local: z.string().max(200).optional(), spaceId: z.string().optional(), postoId: z.string().optional(), agenteId: z.string().optional(), ocorridaEm: dateISO().optional(),
  })
  router.post(`${B}/ocorrencias`, requireRole(...OPERACAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d = parseBody(ocSchema, req.body)
    if (d.postoId && !(await prisma.inf2Posto.findFirst({ where: { id: d.postoId, tenantId } }))) fail(400, 'Posto não encontrado.')
    if (d.spaceId && !(await prisma.eduSpace.findFirst({ where: { id: d.spaceId, tenantId } }))) fail(400, 'Espaço não encontrado.')
    let agenteId = d.agenteId
    if (!agenteId) agenteId = (await agenteDoUsuario(tenantId, getUserId(req)))?.id
    else if (!(await prisma.inf2Agente.findFirst({ where: { id: agenteId, tenantId } }))) fail(400, 'Agente não encontrado.')
    res.status(201).json(await registrarOcorrencia(tenantId, getUserId(req), { ...d, agenteId }))
  }))
  router.get(`${B}/ocorrencias`, requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId: getTenantId(req) }
    for (const f of ['tipo', 'gravidade', 'status', 'postoId', 'agenteId']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    const [rows, total] = await Promise.all([prisma.inf2OcorrenciaSeg.findMany({ where, orderBy: { ocorridaEm: 'desc' }, skip, take }), prisma.inf2OcorrenciaSeg.count({ where })])
    res.json({ items: rows, total, page, pageSize })
  }))
  router.post(`${B}/ocorrencias/:id/status`, requireRole(...GESTAO, 'COORDINATOR'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const o = await prisma.inf2OcorrenciaSeg.findFirst({ where: { id: idParam(req), tenantId } })
    if (!o) return res.status(404).json({ error: 'Ocorrência não encontrada.' })
    if (o.status === 'ENCERRADA') fail(409, 'Ocorrência já encerrada.')
    const b = parseBody(z.object({ status: z.enum(['EM_APURACAO', 'ENCAMINHADA', 'ENCERRADA']), encaminhamento: z.string().max(2000).optional() }), req.body)
    if (b.status === 'ENCERRADA' && !(b.encaminhamento ?? o.encaminhamento)) fail(400, 'Informe o encaminhamento para encerrar.')
    res.json(await prisma.inf2OcorrenciaSeg.update({ where: { id: o.id }, data: { status: b.status, encaminhamento: b.encaminhamento ?? o.encaminhamento, encerradaEm: b.status === 'ENCERRADA' ? new Date() : null } }))
  }))

  // ------------------------------------------------------------ passagem de serviço
  router.post(`${B}/passagens`, requireRole(...OPERACAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(z.object({ postoId: z.string(), deAgenteId: z.string().optional(), paraAgenteId: z.string(), resumo: z.string().min(5).max(4000), pendencias: z.string().max(2000).optional(), chaves: z.string().max(500).optional() }), req.body)
    if (!(await prisma.inf2Posto.findFirst({ where: { id: b.postoId, tenantId } }))) fail(400, 'Posto não encontrado.')
    const de = await agenteReq(req, b.deAgenteId)
    const para = await prisma.inf2Agente.findFirst({ where: { id: b.paraAgenteId, tenantId, ativo: true } })
    if (!para) fail(400, 'Agente de destino não encontrado.')
    if (para.id === de.id) fail(400, 'O agente de destino deve ser diferente.')
    const abertas = await prisma.inf2OcorrenciaSeg.count({ where: { tenantId, postoId: b.postoId, status: { not: 'ENCERRADA' } } })
    const p = await prisma.inf2Passagem.create({ data: { tenantId, postoId: b.postoId, deAgenteId: de.id, paraAgenteId: para.id, resumo: b.resumo, pendencias: b.pendencias, chaves: b.chaves } })
    if (para.userId) await notify({ tenantId, userId: para.userId, assunto: 'Passagem de serviço', mensagem: `${de.nome} passou o posto para você. Confirme o recebimento.`, refType: 'Inf2Passagem', refId: p.id }).catch(() => null)
    res.status(201).json({ ...p, ocorrenciasAbertasNoPosto: abertas })
  }))
  router.post(`${B}/passagens/:id/ciencia`, requireRole(...OPERACAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const p = await prisma.inf2Passagem.findFirst({ where: { id: idParam(req), tenantId } })
    if (!p) return res.status(404).json({ error: 'Passagem não encontrada.' })
    const para = await prisma.inf2Agente.findFirst({ where: { id: p.paraAgenteId, tenantId } })
    if (!isGestao(req) && para?.userId !== getUserId(req)) fail(403, 'Somente o agente que assume o posto dá ciência.')
    if (p.status === 'RECEBIDA') fail(409, 'Ciência já registrada.')
    res.json(await prisma.inf2Passagem.update({ where: { id: p.id }, data: { status: 'RECEBIDA', cienteEm: new Date(), cienteObs: parseBody(z.object({ obs: z.string().max(500).optional() }), req.body ?? {}).obs } }))
  }))
  router.get(`${B}/passagens`, requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId: getTenantId(req) }
    for (const f of ['postoId', 'status', 'deAgenteId', 'paraAgenteId']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    const [rows, total] = await Promise.all([prisma.inf2Passagem.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }), prisma.inf2Passagem.count({ where })])
    res.json({ items: rows, total, page, pageSize })
  }))

  router.get(`${B}/eu`, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const a = await agenteDoUsuario(getTenantId(req), getUserId(req))
    res.json({ agente: a, rondaEmAndamento: a ? await prisma.inf2Ronda.findFirst({ where: { tenantId: getTenantId(req), agenteId: a.id, status: 'EM_ANDAMENTO' } }) : null })
  }))

  router.get(`${B}/painel`, requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const desde = new Date(Date.now() - 30 * 86_400_000)
    const [agentes, postos, escs, rondas, ocs, pass] = await Promise.all([
      prisma.inf2Agente.count({ where: { tenantId, ativo: true } }), prisma.inf2Posto.count({ where: { tenantId, ativo: true } }),
      prisma.inf2Escala.findMany({ where: { tenantId, data: { gte: desde, lte: new Date() } } }), prisma.inf2Ronda.findMany({ where: { tenantId, inicio: { gte: desde } } }),
      prisma.inf2OcorrenciaSeg.findMany({ where: { tenantId, ocorridaEm: { gte: desde } } }), prisma.inf2Passagem.count({ where: { tenantId, status: 'AGUARDANDO_CIENCIA' } }),
    ])
    const feitos = escs.filter((e) => ['CUMPRIDA', 'ATRASO'].includes(e.status)).length
    res.json({
      agentesAtivos: agentes, postosAtivos: postos, ultimos30Dias: {
        escalas: escs.length, cumpridas: feitos, faltas: escs.filter((e) => e.status === 'FALTA').length, atrasos: escs.filter((e) => e.status === 'ATRASO').length, assiduidadePct: pct(feitos, escs.filter((e) => e.status !== 'PREVISTA' && e.status !== 'TROCA').length),
        rondas: rondas.length, rondasCompletas: rondas.filter((r) => r.status === 'CONCLUIDA').length, rondasIncompletas: rondas.filter((r) => r.status === 'INCOMPLETA').length,
        ocorrencias: ocs.length, ocorrenciasAbertas: ocs.filter((o) => o.status !== 'ENCERRADA').length, criticas: ocs.filter((o) => o.gravidade === 'CRITICA').length,
      }, passagensPendentesCiencia: pass,
    })
  }))
}

async function validarAgente(d: any, req: AuthenticatedRequest, cur?: any) {
  const tenantId = getTenantId(req)
  if (d.userId && !(await prisma.user.findFirst({ where: { id: d.userId, tenantId } }))) fail(400, 'Usuário (userId) não encontrado neste tenant.')
  if (d.colaboradorId) {
    const del = (prisma as any).rheColaborador
    // sem módulo RH disponível, o id é guardado como referência (documentado no README)
    if (del) { const c = await del.findFirst({ where: { id: d.colaboradorId, tenantId } }); if (!c) fail(400, 'Colaborador (colaboradorId) não encontrado no RH.') }
  }
  return d
}

async function registrarOcorrencia(tenantId: string, userId: string, d: { tipo: any; gravidade: any; descricao: string; local?: string; spaceId?: string; postoId?: string; agenteId?: string; ocorridaEm?: Date }) {
  const o = await prisma.inf2OcorrenciaSeg.create({ data: { ...d, tenantId, ocorridaEm: d.ocorridaEm ?? new Date(), numero: await nextNum(tenantId, 'OSG', 'SEG'), registradoPorId: userId } })
  if (['ALTA', 'CRITICA'].includes(o.gravidade)) for (const u of await usuariosComPapel(tenantId, ['FACILITIES', 'ADMIN', 'OWNER'])) await notify({ tenantId, userId: u.id, assunto: `Ocorrência de segurança ${o.gravidade} ${o.numero}`, mensagem: `${o.tipo}: ${o.descricao.slice(0, 140)}`, refType: 'Inf2OcorrenciaSeg', refId: o.id }).catch(() => null)
  await audit({ tenantId, userId, modulo: MOD2, acao: 'OCORRENCIA_SEG', refType: 'Inf2OcorrenciaSeg', refId: o.id })
  return o
}
