import { Router, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { Req, asyncHandler, audit, erro, getTenantId, getUserId, requireRole, isSuper, txt } from './util'

// Acesso por polo: cada gestor pode ter um ou mais polos. Sem nenhum polo atribuído = vê todos (comportamento anterior).
// Administração/reitoria sempre veem todos. Montado em /api/edu/acesso-polos.
const router = Router()

/** Polos que o usuário pode ver; null = sem restrição. */
export async function polosPermitidos(req: Req): Promise<string[] | null> {
  if (!req.user || isSuper(req)) return null
  const rows = await prisma.acsPoloGestor.findMany({ where: { tenantId: req.user.tenantId, userId: req.user.id }, select: { poloId: true } })
  return rows.length ? rows.map((r) => r.poloId) : null
}
/** Filtro pronto para `where` de ModPolo (ou `poloId: { in }` nas demais tabelas via campo). */
export async function escopoPolos(req: Req, campo = 'id'): Promise<Record<string, unknown>> {
  const ids = await polosPermitidos(req)
  return ids ? { [campo]: { in: ids } } : {}
}

router.get('/meus', asyncHandler(async (req: Req, res: Response) => res.json({ restrito: (await polosPermitidos(req)) !== null, poloIds: await polosPermitidos(req) })))

router.get('/', requireRole(), asyncHandler(async (req: Req, res: Response) => {
  const tenantId = getTenantId(req)
  const [polos, usuarios, atrib] = await Promise.all([
    prisma.modPolo.findMany({ where: { tenantId, ativo: true }, select: { id: true, codigo: true, nome: true, cidade: true, uf: true }, orderBy: { nome: 'asc' } }),
    prisma.user.findMany({ where: { tenantId, isActive: true, role: { notIn: ['STUDENT', 'TEACHER', 'CLIENTE_CONTABIL'] } }, select: { id: true, firstName: true, lastName: true, email: true, role: true }, orderBy: { firstName: 'asc' }, take: 500 }),
    prisma.acsPoloGestor.findMany({ where: { tenantId } }),
  ])
  res.json({ polos, usuarios: usuarios.map((u) => ({ id: u.id, nome: `${u.firstName} ${u.lastName}`.trim(), email: u.email, cargo: u.role, poloIds: atrib.filter((a) => a.userId === u.id).map((a) => a.poloId) })) })
}))

router.put('/usuarios/:userId', requireRole(), asyncHandler(async (req: Req, res: Response) => {
  const tenantId = getTenantId(req), userId = String(req.params.userId)
  await prisma.user.findFirst({ where: { id: userId, tenantId } }) ?? erro(404, 'Usuário não encontrado.')
  const pedidos: string[] = Array.isArray(req.body?.poloIds) ? req.body.poloIds.map((p: unknown) => txt(p, 60)) : []
  const validos = (await prisma.modPolo.findMany({ where: { tenantId, id: { in: pedidos } }, select: { id: true } })).map((p) => p.id)
  await prisma.$transaction([
    prisma.acsPoloGestor.deleteMany({ where: { tenantId, userId } }),
    ...validos.map((poloId) => prisma.acsPoloGestor.create({ data: { tenantId, userId, poloId } })),
  ])
  await audit({ tenantId, userId: getUserId(req), modulo: 'acesso-polos', acao: 'POLOS_DEFINIDOS', refType: 'User', refId: userId, detalhes: { polos: validos.length } })
  res.json({ userId, poloIds: validos })
}))
export default router
