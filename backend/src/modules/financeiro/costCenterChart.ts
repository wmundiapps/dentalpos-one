import { Router, Response } from 'express';
import { prisma } from '../../lib/prisma'; // AJUSTE: caminho real do seu cliente Prisma
import {
  AuthenticatedRequest,
  asyncHandler,
  requireAuth,
  requireRole,
  getTenantId,
} from '../academico/middleware'; // reaproveita auth/RBAC já definido no Núcleo Acadêmico
import { validate, createCostCenterSchema, createChartOfAccountSchema } from './validators';

const router = Router();

// ---------- Centros de custo ----------

router.post(
  '/cost-centers',
  requireAuth,
  requireRole('ADMIN', 'FINANCE', 'BOARD'),
  validate(createCostCenterSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req);
    const costCenter = await prisma.eduCostCenter.create({ data: { tenantId, ...req.body } });
    res.status(201).json(costCenter);
  }),
);

router.get(
  '/cost-centers',
  requireAuth,
  requireRole('ADMIN', 'FINANCE', 'BOARD'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req);
    const costCenters = await prisma.eduCostCenter.findMany({ where: { tenantId }, orderBy: { nome: 'asc' } });
    res.json(costCenters);
  }),
);

// ---------- Plano de contas ----------

router.post(
  '/chart-of-accounts',
  requireAuth,
  requireRole('ADMIN', 'FINANCE', 'BOARD'),
  validate(createChartOfAccountSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req);
    const account = await prisma.chartOfAccount.create({ data: { tenantId, ...req.body } });
    res.status(201).json(account);
  }),
);

router.get(
  '/chart-of-accounts',
  requireAuth,
  requireRole('ADMIN', 'FINANCE', 'BOARD'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req);
    const accounts = await prisma.chartOfAccount.findMany({ where: { tenantId }, orderBy: { codigo: 'asc' } });
    res.json(accounts);
  }),
);

export default router;
