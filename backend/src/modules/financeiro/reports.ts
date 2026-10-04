import { Router, Response } from 'express';
import { prisma } from '../../lib/prisma'; // AJUSTE: caminho real do seu cliente Prisma
import {
  AuthenticatedRequest,
  asyncHandler,
  requireAuth,
  requireRole,
  getTenantId,
} from '../academico/middleware';

const router = Router();

function parsePeriodo(req: AuthenticatedRequest) {
  const { de, ate } = req.query as Record<string, string>;
  const dataInicio = de ? new Date(de) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  let dataFim = ate ? new Date(ate) : new Date();
  if (isNaN(dataInicio.getTime()) || isNaN(dataFim.getTime())) {
    throw Object.assign(new Error('Datas inválidas (use AAAA-MM-DD ou ISO 8601).'), { status: 400 });
  }
  // "ate" só com a data (AAAA-MM-DD) inclui o dia inteiro
  if (ate && /^\d{4}-\d{2}-\d{2}$/.test(ate)) dataFim = new Date(dataFim.getTime() + 86_400_000 - 1);
  if (dataFim < dataInicio) throw Object.assign(new Error('"ate" deve ser posterior a "de".'), { status: 400 });
  return { dataInicio, dataFim };
}

// DRE simplificado: receitas realizadas - despesas realizadas, no período
router.get(
  '/reports/dre',
  requireAuth,
  requireRole('ADMIN', 'FINANCE', 'BOARD'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req);
    const { dataInicio, dataFim } = parsePeriodo(req);

    const transacoes = await prisma.paymentTransaction.groupBy({
      by: ['tipo'],
      where: { tenantId, dataTransacao: { gte: dataInicio, lte: dataFim } },
      _sum: { valor: true },
    });

    const receita = transacoes.find((t) => t.tipo === 'RECEITA')?._sum.valor ?? 0;
    const despesa = transacoes.find((t) => t.tipo === 'DESPESA')?._sum.valor ?? 0;

    res.json({
      periodo: { dataInicio, dataFim },
      receitaTotal: receita,
      despesaTotal: despesa,
      resultado: receita - despesa,
    });
  }),
);

// Fluxo de caixa: o que já entrou/saiu vs. o que está previsto para o período
router.get(
  '/reports/fluxo-de-caixa',
  requireAuth,
  requireRole('ADMIN', 'FINANCE', 'BOARD'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req);
    const { dataInicio, dataFim } = parsePeriodo(req);

    const [recebidoRealizado, pagoRealizado, aReceberPrevisto, aPagarPrevisto] = await Promise.all([
      prisma.paymentTransaction.aggregate({
        where: { tenantId, tipo: 'RECEITA', dataTransacao: { gte: dataInicio, lte: dataFim } },
        _sum: { valor: true },
      }),
      prisma.paymentTransaction.aggregate({
        where: { tenantId, tipo: 'DESPESA', dataTransacao: { gte: dataInicio, lte: dataFim } },
        _sum: { valor: true },
      }),
      prisma.accountReceivable.aggregate({
        where: {
          tenantId,
          status: { in: ['PENDENTE', 'ATRASADO'] },
          dataVencimento: { gte: dataInicio, lte: dataFim },
        },
        _sum: { valor: true },
      }),
      prisma.accountPayable.aggregate({
        where: {
          tenantId,
          status: { in: ['PENDENTE', 'ATRASADO'] },
          dataVencimento: { gte: dataInicio, lte: dataFim },
        },
        _sum: { valor: true },
      }),
    ]);

    res.json({
      periodo: { dataInicio, dataFim },
      realizado: {
        recebido: recebidoRealizado._sum.valor ?? 0,
        pago: pagoRealizado._sum.valor ?? 0,
        saldo: (recebidoRealizado._sum.valor ?? 0) - (pagoRealizado._sum.valor ?? 0),
      },
      previsto: {
        aReceber: aReceberPrevisto._sum.valor ?? 0,
        aPagar: aPagarPrevisto._sum.valor ?? 0,
        saldoProjetado: (aReceberPrevisto._sum.valor ?? 0) - (aPagarPrevisto._sum.valor ?? 0),
      },
    });
  }),
);

export default router;
