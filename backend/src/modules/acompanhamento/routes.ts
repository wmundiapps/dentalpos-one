import { Router, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, academicErrorHandler, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { audit } from '../core/notify'
import { registerEduJob } from '../core/jobs'
import { ATENDE, GESTAO_COM } from '../comunicacao/roles'
import { TIPOS, executarAcompanhamento, garantirRegrasPadrao } from './engine'

// Módulo "acompanhamento" — acompanhamento virtual do aluno por e-mail (incentivo e lembretes automáticos).
// Montado em /api/edu/acompanhamento. Reaproveita a caixa de saída e as preferências (LGPD) da Comunicação.
const router = Router()
const DIA = 86_400_000

registerEduJob('acompanhamento.regua', () => executarAcompanhamento({}))

function erro(status: number, msg: string): never { throw Object.assign(new Error(msg), { status }) }

router.get('/painel', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const desde = new Date(Date.now() - 30 * DIA)
  const [config, regras, envios, porResultado, porRegra, ultimos] = await Promise.all([
    prisma.acpConfig.findUnique({ where: { tenantId } }),
    prisma.acpRegra.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } }),
    prisma.acpEnvio.count({ where: { tenantId, createdAt: { gte: desde } } }),
    prisma.acpEnvio.groupBy({ by: ['resultado'], where: { tenantId, createdAt: { gte: desde } }, _count: true }),
    prisma.acpEnvio.groupBy({ by: ['regraId'], where: { tenantId, createdAt: { gte: desde } }, _count: true }),
    prisma.acpEnvio.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 30, include: { regra: { select: { nome: true, tipo: true } } } }),
  ])
  const alunos = await prisma.student.findMany({ where: { tenantId, id: { in: ultimos.map((u) => u.studentId) } }, select: { id: true, nomeCompleto: true } })
  const nomes = new Map(alunos.map((a) => [a.id, a.nomeCompleto]))
  const cont = new Map(porRegra.map((p) => [p.regraId, p._count]))
  res.json({
    config,
    regras: regras.map((r) => ({ ...r, enviados30d: cont.get(r.id) ?? 0 })),
    resumo30d: { total: envios, porResultado: Object.fromEntries(porResultado.map((p) => [p.resultado, p._count])) },
    ultimos: ultimos.map((u) => ({ id: u.id, em: u.createdAt, aluno: nomes.get(u.studentId) ?? '—', regra: u.regra.nome, tipo: u.regra.tipo, assunto: u.assunto, resumo: u.resumo, resultado: u.resultado })),
    tipos: TIPOS,
  })
}))

router.post('/bootstrap', requireRole(...GESTAO_COM), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const r = await garantirRegrasPadrao(tenantId)
  await audit({ tenantId, userId: getUserId(req), modulo: 'acompanhamento', acao: 'BOOTSTRAP', detalhes: { criadas: r.criadas } })
  res.json(r)
}))

router.put('/config', requireRole(...GESTAO_COM), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = req.body ?? {}
  const data: any = {}
  if (typeof b.ativo === 'boolean') data.ativo = b.ativo
  if (b.maxPorAlunoDia !== undefined) data.maxPorAlunoDia = Math.min(10, Math.max(1, Number(b.maxPorAlunoDia) || 2))
  if (b.maxPorAlunoSemana !== undefined) data.maxPorAlunoSemana = Math.min(30, Math.max(1, Number(b.maxPorAlunoSemana) || 5))
  if (b.remetenteNome !== undefined) data.remetenteNome = String(b.remetenteNome).slice(0, 120) || null
  res.json(await prisma.acpConfig.upsert({ where: { tenantId }, update: data, create: { tenantId, ...data } }))
}))

router.post('/regras', requireRole(...GESTAO_COM), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = req.body ?? {}
  if (!(TIPOS as readonly string[]).includes(b.tipo)) erro(400, 'Tipo de regra inválido.')
  if (!b.nome || !b.assunto || !b.corpo) erro(400, 'Informe nome, assunto e texto do e-mail.')
  const r = await prisma.acpRegra.create({ data: { tenantId, tipo: b.tipo, nome: String(b.nome), descricao: b.descricao || null, canal: b.canal || 'EMAIL', ativa: b.ativa ?? true, antecedenciaDias: Number(b.antecedenciaDias ?? 3), limiarDias: b.limiarDias != null ? Number(b.limiarDias) : null, cooldownDias: Number(b.cooldownDias ?? 7), eventoTipo: b.eventoTipo || null, tituloContem: b.tituloContem || null, assunto: String(b.assunto), corpo: String(b.corpo) } })
  await audit({ tenantId, userId: getUserId(req), modulo: 'acompanhamento', acao: 'REGRA_CRIADA', refType: 'AcpRegra', refId: r.id })
  res.status(201).json(r)
}))

router.patch('/regras/:id', requireRole(...GESTAO_COM), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const atual = await prisma.acpRegra.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!atual) erro(404, 'Regra não encontrada.')
  const b = req.body ?? {}
  const data: any = {}
  for (const k of ['nome', 'descricao', 'canal', 'eventoTipo', 'tituloContem', 'assunto', 'corpo']) if (b[k] !== undefined) data[k] = b[k] === '' ? null : String(b[k])
  if (data.nome === null || data.assunto === null || data.corpo === null) erro(400, 'Nome, assunto e texto são obrigatórios.')
  for (const k of ['antecedenciaDias', 'cooldownDias']) if (b[k] !== undefined) data[k] = Math.max(0, Number(b[k]) || 0)
  if (b.limiarDias !== undefined) data.limiarDias = b.limiarDias === null || b.limiarDias === '' ? null : Math.max(1, Number(b.limiarDias))
  if (typeof b.ativa === 'boolean') data.ativa = b.ativa
  const r = await prisma.acpRegra.update({ where: { id: atual.id }, data })
  await audit({ tenantId, userId: getUserId(req), modulo: 'acompanhamento', acao: 'REGRA_ALTERADA', refType: 'AcpRegra', refId: r.id })
  res.json(r)
}))

router.delete('/regras/:id', requireRole(...GESTAO_COM), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const r = await prisma.acpRegra.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!r) erro(404, 'Regra não encontrada.')
  await prisma.acpRegra.delete({ where: { id: r.id } })
  res.json({ ok: true })
}))

// Simula (sem enviar nada): mostra quem receberia e o texto final de cada e-mail.
router.post('/simular', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const r = await executarAcompanhamento({ tenantId: getTenantId(req), regraId: req.body?.regraId || undefined, dryRun: true })
  res.json({ ...r, simulacao: r.simulacao.slice(0, 100) })
}))

router.post('/executar', requireRole(...GESTAO_COM), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const r = await executarAcompanhamento({ tenantId, regraId: req.body?.regraId || undefined })
  await audit({ tenantId, userId: getUserId(req), modulo: 'acompanhamento', acao: 'EXECUCAO_MANUAL', detalhes: { enfileiradas: r.enfileiradas } })
  res.json({ ...r, simulacao: [] })
}))

router.get('/envios', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const take = Math.min(200, Number(req.query.limit) || 50)
  const where: any = { tenantId, ...(req.query.studentId ? { studentId: String(req.query.studentId) } : {}), ...(req.query.regraId ? { regraId: String(req.query.regraId) } : {}) }
  res.json(await prisma.acpEnvio.findMany({ where, orderBy: { createdAt: 'desc' }, take, include: { regra: { select: { nome: true, tipo: true } } } }))
}))

router.use(academicErrorHandler)
export default router
