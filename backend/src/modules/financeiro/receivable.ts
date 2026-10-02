import { Router, Response } from 'express';
import { prisma } from '../../lib/prisma'; // AJUSTE: caminho real do seu cliente Prisma
import {
  AuthenticatedRequest,
  asyncHandler,
  requireAuth,
  requireRole,
  getTenantId,
} from '../academico/middleware';
import {
  validate,
  createReceivableSchema,
  generateMensalidadesSchema,
  receivePayableSchema,
} from './validators';
import { registrarBaixaComLancamento } from './accounting.helpers';

const router = Router();

router.post(
  '/receivables',
  requireAuth,
  requireRole('ADMIN', 'FINANCE'),
  validate(createReceivableSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req);
    const receivable = await prisma.accountReceivable.create({ data: { tenantId, ...req.body } });
    res.status(201).json(receivable);
  }),
);

// Gera N parcelas de mensalidade automaticamente a partir da matrícula do aluno
router.post(
  '/receivables/generate-mensalidades',
  requireAuth,
  requireRole('ADMIN', 'FINANCE'),
  validate(generateMensalidadesSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req);
    const {
      studentId,
      enrollmentId,
      valorParcela,
      quantidadeParcelas,
      diaVencimento,
      primeiroVencimento,
      descricaoBase,
    } = req.body;

    const parcelas = Array.from({ length: quantidadeParcelas }).map((_, index) => {
      const vencimento = new Date(primeiroVencimento);
      vencimento.setMonth(vencimento.getMonth() + index);
      vencimento.setDate(diaVencimento);

      return {
        tenantId,
        studentId,
        enrollmentId,
        descricao: `${descricaoBase} ${index + 1}/${quantidadeParcelas}`,
        numeroParcela: index + 1,
        valor: valorParcela,
        dataVencimento: vencimento,
      };
    });

    const created = await prisma.$transaction(
      parcelas.map((p) => prisma.accountReceivable.create({ data: p })),
    );

    res.status(201).json({ parcelasGeradas: created.length, parcelas: created });
  }),
);

router.get(
  '/receivables',
  requireAuth,
  requireRole('ADMIN', 'FINANCE', 'BOARD'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req);
    const { status, studentId } = req.query as Record<string, string>;

    const where: any = { tenantId };
    if (status) where.status = status;
    if (studentId) where.studentId = studentId;

    const receivables = await prisma.accountReceivable.findMany({
      where,
      orderBy: { dataVencimento: 'asc' },
    });

    const now = new Date();
    const withComputedStatus = receivables.map((r) => ({
      ...r,
      status: r.status === 'PENDENTE' && r.dataVencimento < now ? 'ATRASADO' : r.status,
    }));

    res.json(withComputedStatus);
  }),
);

// Aluno vê as próprias mensalidades (boletos em aberto e histórico)
router.get(
  '/receivables/my',
  requireAuth,
  requireRole('STUDENT'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user!.studentId) {
      return res.status(400).json({ error: 'Usuário logado não está vinculado a um aluno.' });
    }
    const receivables = await prisma.accountReceivable.findMany({
      where: { studentId: req.user!.studentId },
      orderBy: { dataVencimento: 'asc' },
    });
    res.json(receivables);
  }),
);

router.post(
  '/receivables/:id/receive',
  requireAuth,
  requireRole('ADMIN', 'FINANCE'),
  validate(receivePayableSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req);
    const { id } = req.params as Record<string, string>;
    const { formaPagamento, dataPagamento, gatewayId, gatewayStatus } = req.body;

    const receivable = await prisma.accountReceivable.findFirst({ where: { id, tenantId } });
    if (!receivable) return res.status(404).json({ error: 'Conta a receber não encontrada.' });
    if (receivable.status === 'PAGO') {
      return res.status(409).json({ error: 'Esta conta já está paga.' });
    }

    const { transacao, lancamento } = await registrarBaixaComLancamento({
      tenantId,
      tipo: 'RECEITA',
      valor: receivable.valor,
      formaPagamento,
      historico: `Recebimento — ${receivable.descricao}`,
      accountReceivableId: receivable.id,
      dataTransacao: dataPagamento,
    });

    const updated = await prisma.accountReceivable.update({
      where: { id },
      data: {
        status: 'PAGO',
        dataPagamento: dataPagamento ?? new Date(),
        gatewayId,
        gatewayStatus,
      },
    });

    res.json({ receivable: updated, transacao, lancamento });
  }),
);

// Endpoint pensado para ser chamado pelo webhook do Asaas/Stripe já
// existente no DentalPos One quando uma cobrança é confirmada — evita
// reimplementar a integração com o gateway, só conecta o resultado dela
// à baixa da conta a receber correspondente.
router.post(
  '/receivables/webhook-gateway-confirmacao',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { gatewayId, formaPagamento, gatewayStatus } = req.body as {
      gatewayId: string;
      formaPagamento: 'PIX' | 'BOLETO' | 'CARTAO' | 'DINHEIRO' | 'TRANSFERENCIA';
      gatewayStatus: string;
    };

    const receivable = await prisma.accountReceivable.findFirst({ where: { gatewayId } });
    if (!receivable) return res.status(404).json({ error: 'Cobrança não vinculada a nenhuma conta a receber.' });
    if (receivable.status === 'PAGO') return res.status(200).json({ ok: true, jaProcessado: true });

    const { transacao, lancamento } = await registrarBaixaComLancamento({
      tenantId: receivable.tenantId,
      tipo: 'RECEITA',
      valor: receivable.valor,
      formaPagamento,
      historico: `Recebimento via gateway — ${receivable.descricao}`,
      accountReceivableId: receivable.id,
    });

    const updated = await prisma.accountReceivable.update({
      where: { id: receivable.id },
      data: { status: 'PAGO', dataPagamento: new Date(), gatewayStatus },
    });

    res.json({ receivable: updated, transacao, lancamento });
  }),
);

export default router;
