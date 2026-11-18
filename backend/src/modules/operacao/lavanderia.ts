import { Router, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { Req, asyncHandler, audit, DIA, erro, getTenantId, getUserId, num, pick, requireRole, txt } from './util'

// Lavanderia: rol de rouparia enviada por departamento e jornada completa (coleta, transporte, lavagem, retorno, entrega, conferência).
// Montado em /api/edu/lavanderia.
const router = Router()
const operacao = requireRole('FACILITIES', 'STAFF', 'SUPPORT')
export const ETAPAS = ['SOLICITADA', 'COLETADA', 'EM_TRANSPORTE', 'NA_LAVANDERIA', 'LAVADA', 'EM_RETORNO', 'ENTREGUE', 'CONFERIDA'] as const
const ROTULO: Record<string, string> = { SOLICITADA: 'Solicitada', COLETADA: 'Coletada no setor', EM_TRANSPORTE: 'Em transporte (ida)', NA_LAVANDERIA: 'Recebida na lavanderia', LAVADA: 'Lavada e passada', EM_RETORNO: 'Em transporte (volta)', ENTREGUE: 'Entregue ao setor', CONFERIDA: 'Conferida pelo setor' }

router.get('/rotas', asyncHandler(async (req: Req, res: Response) => res.json(await prisma.lavRota.findMany({ where: { tenantId: getTenantId(req) }, orderBy: [{ departamento: 'asc' }, { diaSemana: 'asc' }] }))))
router.post('/rotas', operacao, asyncHandler(async (req: Req, res: Response) => {
  const d = pick(req.body, { nome: 'str', departamento: 'str', poloId: 'str', diaSemana: 'num', horaColeta: 'str', horaEntrega: 'str', prazoRetornoDias: 'num', responsavelColeta: 'str', transportador: 'str', responsavelEntrega: 'str', ativo: 'bool' })
  if (!d.nome || !d.departamento) erro(400, 'Informe o nome da rota e o departamento.')
  res.status(201).json(await prisma.lavRota.create({ data: { tenantId: getTenantId(req), ...d, diaSemana: num(d.diaSemana, 1) } }))
}))
router.delete('/rotas/:id', operacao, asyncHandler(async (req: Req, res: Response) => res.json({ ok: (await prisma.lavRota.deleteMany({ where: { id: String(req.params.id), tenantId: getTenantId(req) } })).count > 0 })))

router.get('/painel', asyncHandler(async (req: Req, res: Response) => {
  const tenantId = getTenantId(req), agora = new Date()
  const rem = await prisma.lavRemessa.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 500 })
  const abertas = rem.filter((r) => r.status !== 'CONFERIDA')
  const porStatus = Object.fromEntries(ETAPAS.map((e) => [e, rem.filter((r) => r.status === e).length]))
  const porDepto = new Map<string, { enviadas: number; pecas: number; abertas: number }>()
  for (const r of rem) { const x = porDepto.get(r.departamento) ?? { enviadas: 0, pecas: 0, abertas: 0 }; x.enviadas++; x.pecas += r.totalPecas; if (r.status !== 'CONFERIDA') x.abertas++; porDepto.set(r.departamento, x) }
  res.json({
    etapas: ETAPAS.map((e) => ({ etapa: e, rotulo: ROTULO[e] })), porStatus,
    abertas: abertas.length, atrasadas: abertas.filter((r) => r.previsaoRetornoEm && r.previsaoRetornoEm < agora).length,
    divergencias: rem.filter((r) => r.divergencia).length, pecasEmProcesso: abertas.reduce((s, r) => s + r.totalPecas, 0),
    porDepartamento: [...porDepto.entries()].map(([departamento, v]) => ({ departamento, ...v })).sort((a, b) => b.pecas - a.pecas),
  })
}))
router.get('/remessas', asyncHandler(async (req: Req, res: Response) => {
  const tenantId = getTenantId(req), depto = txt(req.query.departamento, 120), status = txt(req.query.status, 30)
  const rem = await prisma.lavRemessa.findMany({ where: { tenantId, ...(depto ? { departamento: depto } : {}), ...(status ? { status } : {}) }, orderBy: { createdAt: 'desc' }, take: 300 })
  const ult = await prisma.lavEtapa.findMany({ where: { tenantId, remessaId: { in: rem.map((r) => r.id) } }, orderBy: { em: 'desc' } })
  res.json(rem.map((r) => { const u = ult.find((e) => e.remessaId === r.id); return { ...r, ultimaEtapa: u ? { responsavel: u.responsavel, em: u.em } : null, atrasada: Boolean(r.status !== 'CONFERIDA' && r.previsaoRetornoEm && r.previsaoRetornoEm < new Date()) } }))
}))
router.get('/remessas/:id', asyncHandler(async (req: Req, res: Response) => {
  const tenantId = getTenantId(req)
  const r = await prisma.lavRemessa.findFirst({ where: { id: String(req.params.id), tenantId } }) ?? erro(404, 'Remessa não encontrada.')
  const etapas = await prisma.lavEtapa.findMany({ where: { tenantId, remessaId: r.id }, orderBy: { em: 'asc' } })
  const rota = r.rotaId ? await prisma.lavRota.findFirst({ where: { id: r.rotaId, tenantId } }) : null
  res.json({ ...r, rota, etapas, jornada: ETAPAS.map((e) => ({ etapa: e, rotulo: ROTULO[e], registro: etapas.find((x) => x.etapa === e) ?? null })) })
}))
router.post('/remessas', asyncHandler(async (req: Req, res: Response) => {
  const tenantId = getTenantId(req), b = req.body ?? {}
  const itens = (Array.isArray(b.itens) ? b.itens : []).map((i: any) => ({ peca: txt(i.peca, 80), qtd: Math.max(0, Math.floor(num(i.qtd))) })).filter((i: any) => i.peca && i.qtd > 0)
  if (!itens.length) erro(400, 'Informe ao menos uma peça com quantidade.')
  const departamento = txt(b.departamento, 120) || erro(400, 'Informe o departamento de origem.')
  const rota = (b.rotaId ? await prisma.lavRota.findFirst({ where: { id: txt(b.rotaId, 60), tenantId } }) : await prisma.lavRota.findFirst({ where: { tenantId, departamento, ativo: true } })) ?? null
  const n = (await prisma.lavRemessa.count({ where: { tenantId } })) + 1
  const total = itens.reduce((s: number, i: any) => s + i.qtd, 0)
  const r = await prisma.lavRemessa.create({ data: { tenantId, codigo: `LAV-${String(n).padStart(5, '0')}`, departamento, poloId: txt(b.poloId, 60) || rota?.poloId || null, tipo: ['UNIFORME', 'JALECO', 'ENXOVAL', 'CAMPO_CIRURGICO', 'OUTRO'].includes(b.tipo) ? b.tipo : 'UNIFORME', itens, totalPecas: total, rotaId: rota?.id, previsaoRetornoEm: new Date(Date.now() + (rota?.prazoRetornoDias ?? 3) * DIA), solicitante: txt(b.solicitante, 120) || null } })
  await prisma.lavEtapa.create({ data: { tenantId, remessaId: r.id, etapa: 'SOLICITADA', responsavel: r.solicitante || 'Setor solicitante', qtdPecas: total } })
  await audit({ tenantId, userId: getUserId(req), modulo: 'lavanderia', acao: 'REMESSA', refType: 'LavRemessa', refId: r.id })
  res.status(201).json(r)
}))
// Avança para a próxima etapa da jornada, registrando quem fez e quantas peças conferiu.
router.post('/remessas/:id/avancar', operacao, asyncHandler(async (req: Req, res: Response) => {
  const tenantId = getTenantId(req)
  const r = await prisma.lavRemessa.findFirst({ where: { id: String(req.params.id), tenantId } }) ?? erro(404, 'Remessa não encontrada.')
  const i = ETAPAS.indexOf(r.status as any)
  if (i < 0 || i >= ETAPAS.length - 1) erro(409, 'Esta remessa já está concluída.')
  const proxima = ETAPAS[i + 1]
  const responsavel = txt(req.body?.responsavel, 120) || erro(400, 'Informe o responsável por esta etapa.')
  const qtd = req.body?.qtdPecas === undefined || req.body?.qtdPecas === '' ? null : Math.max(0, Math.floor(num(req.body.qtdPecas)))
  const conferencia = ['NA_LAVANDERIA', 'ENTREGUE', 'CONFERIDA'].includes(proxima) && qtd !== null && qtd !== r.totalPecas
  const diverg = conferencia ? `${ROTULO[proxima]}: esperado ${r.totalPecas} peças, conferido ${qtd}.` : null
  await prisma.lavEtapa.create({ data: { tenantId, remessaId: r.id, etapa: proxima, responsavel, qtdPecas: qtd, observacao: txt(req.body?.observacao, 400) || null } })
  res.json(await prisma.lavRemessa.update({ where: { id: r.id }, data: { status: proxima, ...(diverg ? { divergencia: [r.divergencia, diverg].filter(Boolean).join(' | ') } : {}) } }))
}))
export default router
