import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, requireRole } from '../academico/middleware'
import { parseBody } from '../core/crud'
import { GESTAO_COM } from './roles'

const router = Router()

const regraSchema = z.object({
  departamento: z.string().min(2).max(80),
  palavrasChave: z.array(z.string().min(1).max(60)).min(1),
  prioridade: z.number().int().min(0).max(100).optional(),
  ativa: z.boolean().optional(),
})

router.get(
  '/regras-departamento',
  requireRole(...GESTAO_COM),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const rows = await prisma.comRegraDepartamento.findMany({ where: { tenantId: getTenantId(req) }, orderBy: [{ prioridade: 'desc' }, { departamento: 'asc' }] })
    res.json({ items: rows, total: rows.length })
  }),
)

router.post(
  '/regras-departamento',
  requireRole(...GESTAO_COM),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const b = parseBody(regraSchema, req.body)
    const row = await prisma.comRegraDepartamento.create({ data: { tenantId: getTenantId(req), departamento: b.departamento, palavrasChave: b.palavrasChave.map((p) => p.toLowerCase()), prioridade: b.prioridade ?? 0, ativa: b.ativa ?? true } })
    res.status(201).json(row)
  }),
)

router.patch(
  '/regras-departamento/:id',
  requireRole(...GESTAO_COM),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const atual = await prisma.comRegraDepartamento.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!atual) return res.status(404).json({ error: 'Regra não encontrada.' })
    const b = parseBody(regraSchema.partial(), req.body)
    const data: any = { ...b }
    if (b.palavrasChave) data.palavrasChave = b.palavrasChave.map((p) => p.toLowerCase())
    res.json(await prisma.comRegraDepartamento.update({ where: { id: atual.id }, data }))
  }),
)

router.delete(
  '/regras-departamento/:id',
  requireRole(...GESTAO_COM),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const r = await prisma.comRegraDepartamento.deleteMany({ where: { id: String(req.params.id), tenantId: getTenantId(req) } })
    if (!r.count) return res.status(404).json({ error: 'Regra não encontrada.' })
    res.status(204).end()
  }),
)

export default router
