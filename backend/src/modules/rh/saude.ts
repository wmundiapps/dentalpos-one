import { Response, Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler } from '../academico/middleware'
import { dateISO, pageParams, parseBody, qs } from '../core/crud'
import { scheduleReminder } from '../core/reminders'
import { notify } from '../core/notify'
import { addDiasStr, diaLocal } from './calculo'
import { HR, auditar, carregarColaborador, dia, diaDate, equipeIds, exigirAcesso, exigirRh, getConfig, httpError, isRh, logSensivel, meuColaborador, podeVer, proteger, revelar, tid, uid } from './common'
import { addMeses } from './calculo'

export const LICENCA_DIAS: Record<string, number | null> = { MATERNIDADE: 120, PATERNIDADE: 5, NOJO: 2, GALA: 3, MEDICA: null, SEM_VENCIMENTO: null, OUTRA: null }
export const RESULTADOS_EXAME = ['APTO', 'INAPTO', 'APTO_COM_RESTRICAO'] as const
const CID_RE = /^[A-TV-Z]\d{2}(\.\d{1,2})?$/i

const ehGestorSemRh = (req: AuthenticatedRequest) => !isRh(req)
async function escopoColab(req: AuthenticatedRequest): Promise<string[] | null> {
  if (isRh(req)) return null
  const me = await meuColaborador(req)
  const eq = String(req.user?.role).toUpperCase() === 'COORDINATOR' ? await equipeIds(req) : []
  return [...eq, ...(me ? [me.id] : [])]
}

/** Mantém o status do colaborador (AFASTADO/FERIAS/ATIVO) coerente com atestados longos, licenças e férias em curso. */
export async function sincronizarStatus(tenantId: string, colaboradorId: string, hoje = new Date()) {
  const c = await prisma.rheColaborador.findFirst({ where: { id: colaboradorId, tenantId } })
  if (!c || c.status === 'DESLIGADO' || c.status === 'EM_ADMISSAO') return
  const h = diaDate(diaLocal(hoje))
  const [at, lic, fer] = await Promise.all([
    prisma.rheAtestado.count({ where: { tenantId, colaboradorId, afastamento: true, status: { not: 'REJEITADO' }, dataInicio: { lte: h }, dataFim: { gte: h } } }),
    prisma.rheLicenca.count({ where: { tenantId, colaboradorId, status: 'APROVADA', inicio: { lte: h }, fim: { gte: h } } }),
    prisma.rheFeriasProg.count({ where: { tenantId, colaboradorId, status: { in: ['APROVADA', 'EM_GOZO'] }, inicio: { lte: h }, fim: { gte: h } } }),
  ])
  const novo = fer ? 'FERIAS' : at || lic ? 'AFASTADO' : 'ATIVO'
  if (novo !== c.status) await prisma.rheColaborador.update({ where: { id: c.id }, data: { status: novo } })
}

function visaoAtestado(a: any, req: AuthenticatedRequest, rh: boolean, proprio: boolean) {
  const { cidCifrado, crmCifrado, ...r } = a
  if (rh || proprio) return { ...r, cid: revelar(cidCifrado), crm: revelar(crmCifrado) }
  const { medico, anexoUrl, observacao, cidGrupo, ...resto } = r
  return { ...resto, dadosDeSaudeRestritos: true }
}

export function mountSaude(router: Router) {
  // ---------------------------------------------------------------- atestados
  router.post('/atestados', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({
      colaboradorId: z.string().optional(), tipo: z.enum(['MEDICO', 'COMPARECIMENTO', 'ACOMPANHAMENTO_FAMILIAR', 'ODONTOLOGICO']).default('MEDICO'), dataInicio: dateISO(), dias: z.number().int().min(1).max(730),
      cid: z.string().max(10).optional(), medico: z.string().max(150).optional(), crm: z.string().max(30).optional(), abonaPonto: z.boolean().default(true), anexoUrl: z.string().url().max(500).optional(), observacao: z.string().max(500).optional(),
    }), req.body)
    const me = await meuColaborador(req)
    const colaboradorId = b.colaboradorId ?? me?.id
    if (!colaboradorId) throw httpError(400, 'Informe colaboradorId.')
    await exigirAcesso(req, colaboradorId)
    await carregarColaborador(tenantId, colaboradorId)
    if (b.cid && !CID_RE.test(b.cid.trim())) throw httpError(422, 'CID inválido (ex.: J11 ou M54.5).')
    const ini = diaDate(dia(b.dataInicio)); const fim = diaDate(addDiasStr(dia(b.dataInicio), b.dias - 1))
    const sobre = await prisma.rheAtestado.findFirst({ where: { tenantId, colaboradorId, status: { not: 'REJEITADO' }, dataInicio: { lte: fim }, dataFim: { gte: ini } }, select: { id: true } })
    if (sobre) throw httpError(409, 'Já existe atestado neste período.')
    const cid = b.cid?.trim().toUpperCase()
    const a = await prisma.rheAtestado.create({ data: { tenantId, colaboradorId, tipo: b.tipo, dataInicio: ini, dias: b.dias, dataFim: fim, cidCifrado: proteger(cid), cidGrupo: cid ? cid[0] : null, medico: b.medico, crmCifrado: proteger(b.crm), afastamento: b.dias > 15, abonaPonto: b.abonaPonto, anexoUrl: b.anexoUrl, observacao: b.observacao, registradoPorId: uid(req) } })
    await logSensivel(req, 'atestados', 'SAUDE', colaboradorId, a.id)
    await auditar(req, 'REGISTRAR_ATESTADO', 'RheAtestado', a.id, { dias: b.dias, comCid: !!cid })
    if (a.afastamento) await sincronizarStatus(tenantId, colaboradorId)
    res.status(201).json(visaoAtestado(a, req, isRh(req), me?.id === colaboradorId))
  }))

  router.get('/atestados', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const { skip, take, page, pageSize } = pageParams(req.query)
    const esc = await escopoColab(req)
    const where: any = { tenantId }
    const c = qs(req.query.colaboradorId)
    if (esc) where.colaboradorId = { in: c ? esc.filter((x) => x === c) : esc }
    else if (c) where.colaboradorId = c
    const st = qs(req.query.status); if (st) where.status = st
    const [items, total] = await Promise.all([prisma.rheAtestado.findMany({ where, orderBy: { dataInicio: 'desc' }, skip, take }), prisma.rheAtestado.count({ where })])
    const me = await meuColaborador(req)
    const rh = isRh(req)
    if (rh && items.length) await logSensivel(req, 'atestados', 'SAUDE', c)
    const nomes = Object.fromEntries((await prisma.rheColaborador.findMany({ where: { tenantId, id: { in: items.map((i) => i.colaboradorId) } }, select: { id: true, nome: true } })).map((x) => [x.id, x.nome]))
    res.json({ items: items.map((a) => ({ ...visaoAtestado(a, req, rh, me?.id === a.colaboradorId), colaboradorNome: nomes[a.colaboradorId] })), total, page, pageSize })
  }))

  router.get('/atestados/estatisticas', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const at = await prisma.rheAtestado.findMany({ where: { tenantId, status: { not: 'REJEITADO' } }, select: { colaboradorId: true, dias: true, cidGrupo: true, dataInicio: true } })
    const cols = await prisma.rheColaborador.findMany({ where: { tenantId }, select: { id: true, departamentoId: true } })
    const dep = Object.fromEntries(cols.map((c) => [c.id, c.departamentoId ?? 'SEM_DEPARTAMENTO']))
    const porGrupo: Record<string, number> = {}, porDep: Record<string, number> = {}
    for (const a of at) { porGrupo[a.cidGrupo ?? 'NAO_INFORMADO'] = (porGrupo[a.cidGrupo ?? 'NAO_INFORMADO'] ?? 0) + 1; porDep[dep[a.colaboradorId]] = (porDep[dep[a.colaboradorId]] ?? 0) + a.dias }
    res.json({ total: at.length, diasPerdidos: at.reduce((s, a) => s + a.dias, 0), porGrupoCid: porGrupo, diasPorDepartamento: porDep, aviso: 'Dados agregados, sem identificação.' })
  }))

  router.get('/atestados/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const a = await prisma.rheAtestado.findFirst({ where: { id: String(req.params.id), tenantId: tid(req) } })
    if (!a) throw httpError(404, 'Atestado não encontrado.')
    await exigirAcesso(req, a.colaboradorId)
    const me = await meuColaborador(req)
    if (isRh(req)) await logSensivel(req, 'atestados', 'SAUDE', a.colaboradorId, a.id)
    res.json(visaoAtestado(a, req, isRh(req), me?.id === a.colaboradorId))
  }))

  router.post('/atestados/:id/validar', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ aceitar: z.boolean(), observacao: z.string().max(500).optional() }), req.body)
    const a = await prisma.rheAtestado.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!a) throw httpError(404, 'Atestado não encontrado.')
    if (a.status !== 'REGISTRADO') throw httpError(409, 'Atestado já analisado.')
    const r = await prisma.rheAtestado.update({ where: { id: a.id }, data: { status: b.aceitar ? 'VALIDADO' : 'REJEITADO', validadoPorId: uid(req), validadoEm: new Date(), observacao: b.observacao ?? a.observacao } })
    await logSensivel(req, 'atestados/validar', 'SAUDE', a.colaboradorId, a.id)
    await auditar(req, b.aceitar ? 'VALIDAR_ATESTADO' : 'REJEITAR_ATESTADO', 'RheAtestado', a.id)
    await sincronizarStatus(tenantId, a.colaboradorId)
    res.json(visaoAtestado(r, req, true, false))
  }))

  // ---------------------------------------------------------------- licenças
  router.post('/licencas', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({
      colaboradorId: z.string().optional(), tipo: z.enum(['MATERNIDADE', 'PATERNIDADE', 'MEDICA', 'NOJO', 'GALA', 'SEM_VENCIMENTO', 'OUTRA']), inicio: dateISO(), dias: z.number().int().min(1).max(730).optional(),
      empresaCidada: z.boolean().default(false), observacao: z.string().max(500).optional(),
    }), req.body)
    const me = await meuColaborador(req)
    const colaboradorId = b.colaboradorId ?? me?.id
    if (!colaboradorId) throw httpError(400, 'Informe colaboradorId.')
    await exigirAcesso(req, colaboradorId)
    await carregarColaborador(tenantId, colaboradorId)
    let dias = b.dias
    const padrao = LICENCA_DIAS[b.tipo]
    if (padrao !== null) {
      dias = b.tipo === 'MATERNIDADE' && b.empresaCidada ? 180 : b.tipo === 'PATERNIDADE' && b.empresaCidada ? 20 : padrao
      if (b.dias && b.dias !== dias) throw httpError(422, `Licença ${b.tipo} tem duração fixa de ${dias} dias${b.empresaCidada ? ' (Empresa Cidadã)' : ''}.`)
    } else if (!dias) throw httpError(422, 'Informe a quantidade de dias.')
    const ini = diaDate(dia(b.inicio)); const fim = diaDate(addDiasStr(dia(b.inicio), (dias as number) - 1))
    const sobre = await prisma.rheLicenca.findFirst({ where: { tenantId, colaboradorId, status: { in: ['SOLICITADA', 'APROVADA'] }, inicio: { lte: fim }, fim: { gte: ini } }, select: { id: true } })
    if (sobre) throw httpError(409, 'Já existe licença neste período.')
    const l = await prisma.rheLicenca.create({ data: { tenantId, colaboradorId, tipo: b.tipo, inicio: ini, fim, dias: dias as number, remunerada: b.tipo !== 'SEM_VENCIMENTO', empresaCidada: b.empresaCidada, observacao: b.observacao } })
    if (b.tipo === 'MEDICA' || b.tipo === 'MATERNIDADE') await logSensivel(req, 'licencas', 'SAUDE', colaboradorId, l.id)
    await auditar(req, 'SOLICITAR_LICENCA', 'RheLicenca', l.id, { tipo: b.tipo })
    res.status(201).json(l)
  }))

  router.get('/licencas', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const { skip, take, page, pageSize } = pageParams(req.query)
    const esc = await escopoColab(req); const where: any = { tenantId }
    const c = qs(req.query.colaboradorId)
    if (esc) where.colaboradorId = { in: c ? esc.filter((x) => x === c) : esc }
    else if (c) where.colaboradorId = c
    for (const f of ['status', 'tipo'] as const) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    const [items, total] = await Promise.all([prisma.rheLicenca.findMany({ where, orderBy: { inicio: 'desc' }, skip, take }), prisma.rheLicenca.count({ where })])
    const nomes = Object.fromEntries((await prisma.rheColaborador.findMany({ where: { tenantId, id: { in: items.map((i) => i.colaboradorId) } }, select: { id: true, nome: true } })).map((x) => [x.id, x.nome]))
    // gestor não vê o tipo de licença de saúde (apenas "AFASTAMENTO")
    const saude = new Set(['MEDICA', 'MATERNIDADE'])
    res.json({ items: items.map((l) => ({ ...(ehGestorSemRh(req) && saude.has(l.tipo) ? { ...l, tipo: 'AFASTAMENTO', observacao: null } : l), colaboradorNome: nomes[l.colaboradorId] })), total, page, pageSize })
  }))

  router.post('/licencas/:id/decidir', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ aprovar: z.boolean(), motivo: z.string().min(3).max(500) }), req.body)
    const l = await prisma.rheLicenca.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!l) throw httpError(404, 'Licença não encontrada.')
    if (l.status !== 'SOLICITADA') throw httpError(409, 'Licença já decidida.')
    if (!(await podeVer(req, l.colaboradorId)) || (!isRh(req) && String(req.user?.role).toUpperCase() !== 'COORDINATOR')) throw httpError(403, 'Sem permissão para decidir esta licença.')
    const me = await meuColaborador(req)
    if (me?.id === l.colaboradorId) throw httpError(403, 'Você não pode decidir sua própria licença.')
    const r = await prisma.rheLicenca.update({ where: { id: l.id }, data: { status: b.aprovar ? 'APROVADA' : 'REJEITADA', motivoDecisao: b.motivo, decididoPorId: uid(req), decididoEm: new Date() } })
    await sincronizarStatus(tenantId, l.colaboradorId)
    await auditar(req, b.aprovar ? 'APROVAR_LICENCA' : 'REJEITAR_LICENCA', 'RheLicenca', l.id)
    res.json(r)
  }))

  router.post('/licencas/:id/cancelar', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const l = await prisma.rheLicenca.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!l) throw httpError(404, 'Licença não encontrada.')
    await exigirAcesso(req, l.colaboradorId)
    if (!['SOLICITADA', 'APROVADA'].includes(l.status)) throw httpError(409, 'Licença não pode ser cancelada.')
    const r = await prisma.rheLicenca.update({ where: { id: l.id }, data: { status: 'CANCELADA' } })
    await sincronizarStatus(tenantId, l.colaboradorId)
    res.json(r)
  }))

  // ---------------------------------------------------------------- exames ocupacionais (ASO)
  router.post('/exames', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const cfg = await getConfig(tenantId)
    const b = parseBody(z.object({
      colaboradorId: z.string(), tipo: z.enum(['ADMISSIONAL', 'PERIODICO', 'RETORNO_TRABALHO', 'MUDANCA_FUNCAO', 'DEMISSIONAL']), agendadoPara: dateISO().optional(), realizadoEm: dateISO().optional(),
      resultado: z.enum(RESULTADOS_EXAME).optional(), restricoes: z.string().max(500).optional(), medico: z.string().max(150).optional(), clinica: z.string().max(150).optional(), anexoUrl: z.string().url().max(500).optional(),
      periodicidadeMeses: z.number().int().min(1).max(36).optional(),
    }), req.body)
    await carregarColaborador(tenantId, b.colaboradorId)
    if (b.realizadoEm && !b.resultado) throw httpError(422, 'Informe o resultado do exame realizado.')
    if (b.resultado && !b.realizadoEm) throw httpError(422, 'Informe a data de realização.')
    const realizado = !!b.realizadoEm
    const venceEm = realizado && b.tipo !== 'DEMISSIONAL' ? addMeses(b.realizadoEm!, b.periodicidadeMeses ?? cfg.periodicidadeExameMeses) : null
    const e = await prisma.rheExame.create({ data: { tenantId, colaboradorId: b.colaboradorId, tipo: b.tipo, status: realizado ? 'REALIZADO' : 'AGENDADO', agendadoPara: b.agendadoPara, realizadoEm: b.realizadoEm, venceEm, resultado: b.resultado, restricoesCifradas: proteger(b.restricoes), medico: b.medico, clinica: b.clinica, anexoUrl: b.anexoUrl } })
    await logSensivel(req, 'exames', 'SAUDE', b.colaboradorId, e.id)
    await auditar(req, 'REGISTRAR_EXAME', 'RheExame', e.id, { tipo: b.tipo })
    res.status(201).json(visaoExame(e, true))
  }))

  router.post('/exames/:id/resultado', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const cfg = await getConfig(tenantId)
    const b = parseBody(z.object({ realizadoEm: dateISO(), resultado: z.enum(RESULTADOS_EXAME), restricoes: z.string().max(500).optional(), medico: z.string().max(150).optional(), anexoUrl: z.string().url().max(500).optional(), periodicidadeMeses: z.number().int().min(1).max(36).optional() }), req.body)
    const e = await prisma.rheExame.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!e) throw httpError(404, 'Exame não encontrado.')
    if (e.status === 'CANCELADO') throw httpError(409, 'Exame cancelado.')
    if (b.resultado === 'APTO_COM_RESTRICAO' && !b.restricoes) throw httpError(422, 'Informe as restrições.')
    const venceEm = e.tipo === 'DEMISSIONAL' ? null : addMeses(b.realizadoEm, b.periodicidadeMeses ?? cfg.periodicidadeExameMeses)
    const r = await prisma.rheExame.update({ where: { id: e.id }, data: { status: 'REALIZADO', realizadoEm: b.realizadoEm, resultado: b.resultado, restricoesCifradas: proteger(b.restricoes), medico: b.medico ?? e.medico, anexoUrl: b.anexoUrl ?? e.anexoUrl, venceEm } })
    await logSensivel(req, 'exames/resultado', 'SAUDE', e.colaboradorId, e.id)
    await auditar(req, 'RESULTADO_EXAME', 'RheExame', e.id, { resultado: b.resultado })
    res.json(visaoExame(r, true))
  }))

  router.get('/exames', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const { skip, take, page, pageSize } = pageParams(req.query)
    const esc = await escopoColab(req); const where: any = { tenantId }
    const c = qs(req.query.colaboradorId)
    if (esc) where.colaboradorId = { in: c ? esc.filter((x) => x === c) : esc }
    else if (c) where.colaboradorId = c
    for (const f of ['tipo', 'status'] as const) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    const [items, total] = await Promise.all([prisma.rheExame.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }), prisma.rheExame.count({ where })])
    const me = await meuColaborador(req); const rh = isRh(req)
    if (rh && items.length) await logSensivel(req, 'exames', 'SAUDE', c)
    const nomes = Object.fromEntries((await prisma.rheColaborador.findMany({ where: { tenantId, id: { in: items.map((i) => i.colaboradorId) } }, select: { id: true, nome: true } })).map((x) => [x.id, x.nome]))
    res.json({ items: items.map((e) => ({ ...visaoExame(e, rh || me?.id === e.colaboradorId), colaboradorNome: nomes[e.colaboradorId] })), total, page, pageSize })
  }))

  router.get('/exames/vencimentos', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const cfg = await getConfig(tenantId)
    const dias = Math.min(365, parseInt(qs(req.query.dias) ?? String(cfg.alertaExameDias), 10) || cfg.alertaExameDias)
    res.json({ dias, items: await examesVencimento(tenantId, dias) })
  }))
}

function visaoExame(e: any, completo: boolean) {
  const { restricoesCifradas, ...r } = e
  const hoje = Date.now()
  const situacao = !e.venceEm ? (e.status === 'REALIZADO' ? 'SEM_VENCIMENTO' : 'PENDENTE') : e.venceEm.getTime() < hoje ? 'VENCIDO' : e.venceEm.getTime() < hoje + 30 * 86400000 ? 'A_VENCER' : 'EM_DIA'
  if (completo) return { ...r, restricoes: revelar(restricoesCifradas), situacao }
  const { resultado, medico, clinica, anexoUrl, ...resto } = r
  return { ...resto, situacao, dadosDeSaudeRestritos: true }
}

/** Colaboradores ativos CLT/horista sem ASO periódico/admissional em dia. */
export async function examesVencimento(tenantId: string, dias: number) {
  const cols = await prisma.rheColaborador.findMany({ where: { tenantId, status: { in: ['ATIVO', 'AFASTADO', 'FERIAS'] }, vinculo: { in: ['CLT', 'PROFESSOR_HORISTA'] } }, select: { id: true, nome: true, matricula: true } })
  const ex = await prisma.rheExame.findMany({ where: { tenantId, status: 'REALIZADO', tipo: { in: ['ADMISSIONAL', 'PERIODICO', 'RETORNO_TRABALHO', 'MUDANCA_FUNCAO'] } }, orderBy: { realizadoEm: 'desc' } })
  const ultimo = new Map<string, (typeof ex)[number]>()
  for (const e of ex) if (!ultimo.has(e.colaboradorId)) ultimo.set(e.colaboradorId, e)
  const lim = Date.now() + dias * 86400000
  const out: any[] = []
  for (const c of cols) {
    const e = ultimo.get(c.id)
    if (!e) out.push({ colaboradorId: c.id, nome: c.nome, matricula: c.matricula, situacao: 'SEM_EXAME', venceEm: null })
    else if (e.venceEm && e.venceEm.getTime() < Date.now()) out.push({ colaboradorId: c.id, nome: c.nome, matricula: c.matricula, situacao: 'VENCIDO', venceEm: e.venceEm })
    else if (e.venceEm && e.venceEm.getTime() <= lim) out.push({ colaboradorId: c.id, nome: c.nome, matricula: c.matricula, situacao: 'A_VENCER', venceEm: e.venceEm })
  }
  return out
}

export async function jobSaude() {
  const tenants = await prisma.rheColaborador.findMany({ distinct: ['tenantId'], select: { tenantId: true } })
  let avisos = 0
  for (const { tenantId } of tenants) {
    const cfg = await getConfig(tenantId)
    for (const x of await examesVencimento(tenantId, cfg.alertaExameDias)) {
      await scheduleReminder({ tenantId, modulo: 'rh', titulo: `Exame ocupacional ${x.situacao === 'VENCIDO' ? 'vencido' : x.situacao === 'SEM_EXAME' ? 'inexistente' : 'a vencer'}: ${x.nome}`, dueAt: x.venceEm ?? new Date(), assigneeRole: HR as string, refType: 'RheColaborador', refId: x.colaboradorId, severity: x.situacao === 'A_VENCER' ? 'ATENCAO' : 'CRITICO', dedupeKey: `rhe-exame-${x.colaboradorId}` })
      avisos++
    }
    const cols = await prisma.rheColaborador.findMany({ where: { tenantId, status: { in: ['ATIVO', 'AFASTADO', 'FERIAS'] } }, select: { id: true } })
    for (const c of cols) await sincronizarStatus(tenantId, c.id)
  }
  return { avisos }
}
void notify
