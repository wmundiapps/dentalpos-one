import { Router, Response } from 'express';
import { prisma } from '../../lib/prisma'; // AJUSTE: caminho real do seu cliente Prisma
import {
  AuthenticatedRequest,
  asyncHandler,
  requireAuth,
  requireRole,
  getTenantId,
} from '../academico/middleware';
import { validate, createPayableSchema, payPayableSchema } from './validators';
import { registrarBaixaComLancamento } from './accounting.helpers';

const router = Router();

router.post(
  '/payables',
  requireAuth,
  requireRole('ADMIN', 'FINANCE'),
  validate(createPayableSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req);
    const payable = await prisma.accountPayable.create({ data: { tenantId, ...req.body } });
    res.status(201).json(payable);
  }),
);

router.get(
  '/payables',
  requireAuth,
  requireRole('ADMIN', 'FINANCE', 'BOARD'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req);
    const { status, costCenterId } = req.query as Record<string, string>;

    const where: any = { tenantId };
    if (status) where.status = status;
    if (costCenterId) where.costCenterId = costCenterId;

    // marca como ATRASADO em tempo de leitura quem passou do vencimento e ainda está PENDENTE
    const payables = await prisma.accountPayable.findMany({
      where,
      include: { costCenter: true },
      orderBy: { dataVencimento: 'asc' },
    });

    const now = new Date();
    const withComputedStatus = payables.map((p) => ({
      ...p,
      status: p.status === 'PENDENTE' && p.dataVencimento < now ? 'ATRASADO' : p.status,
    }));

    res.json(withComputedStatus);
  }),
);

router.post(
  '/payables/:id/pay',
  requireAuth,
  requireRole('ADMIN', 'FINANCE'),
  validate(payPayableSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req);
    const { id } = req.params as Record<string, string>;
    const { formaPagamento, dataPagamento } = req.body;

    const payable = await prisma.accountPayable.findFirst({ where: { id, tenantId } });
    if (!payable) return res.status(404).json({ error: 'Conta a pagar não encontrada.' });
    if (payable.status === 'PAGO') {
      return res.status(409).json({ error: 'Esta conta já está paga.' });
    }

    const { transacao, lancamento } = await registrarBaixaComLancamento({
      tenantId,
      tipo: 'DESPESA',
      valor: payable.valor,
      formaPagamento,
      historico: `Pagamento — ${payable.descricao}`,
      accountPayableId: payable.id,
      dataTransacao: dataPagamento,
    });

    const updated = await prisma.accountPayable.update({
      where: { id },
      data: { status: 'PAGO', dataPagamento: dataPagamento ?? new Date() },
    });

    res.json({ payable: updated, transacao, lancamento });
  }),
);

export default router;
