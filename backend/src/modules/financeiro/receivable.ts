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
  webhookSchema,
} from './validators';
import { registrarBaixaComLancamento } from './accounting.helpers';

const router = Router();

// Aluno e matrícula precisam pertencer ao tenant (e a matrícula, ao aluno informado).
async function validarAlunoMatricula(tenantId: string, studentId: string, enrollmentId?: string): Promise<string | null> {
  const student = await prisma.student.findFirst({ where: { id: studentId, tenantId }, select: { id: true } });
  if (!student) return 'Aluno não encontrado.';
  if (enrollmentId) {
    const enrollment = await prisma.enrollment.findFirst({ where: { id: enrollmentId, studentId }, select: { id: true } });
    if (!enrollment) return 'Matrícula não encontrada para este aluno.';
  }
  return null;
}

router.post(
  '/receivables',
  requireAuth,
  requireRole('ADMIN', 'FINANCE'),
  validate(createReceivableSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req);
    const erro = await validarAlunoMatricula(tenantId, req.body.studentId, req.body.enrollmentId);
    if (erro) return res.status(404).json({ error: erro });
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

    const erro = await validarAlunoMatricula(tenantId, studentId, enrollmentId);
    if (erro) return res.status(404).json({ error: erro });

    // evita gerar o carnê duas vezes para a mesma matrícula/descrição
    const jaGeradas = await prisma.accountReceivable.count({
      where: { tenantId, enrollmentId, status: { not: 'CANCELADO' }, descricao: { startsWith: `${descricaoBase} ` }, numeroParcela: { not: null } },
    });
    if (jaGeradas > 0) {
      return res.status(409).json({ error: `Já existem ${jaGeradas} parcela(s) "${descricaoBase}" para esta matrícula.` });
    }

    // vencimento = dia fixo de cada mês (sem estouro de mês: 31/01 + 1 mês não pode virar março)
    const base = new Date(primeiroVencimento);
    const parcelas = Array.from({ length: quantidadeParcelas }).map((_, index) => {
      const vencimento = new Date(base);
      vencimento.setUTCDate(1);
      vencimento.setUTCMonth(base.getUTCMonth() + index);
      vencimento.setUTCDate(diaVencimento);
      vencimento.setUTCHours(12, 0, 0, 0); // meio-dia UTC: o dia não muda ao exibir no fuso do Brasil

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
      where: { tenantId: getTenantId(req), studentId: req.user!.studentId },
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
    if (receivable.status === 'CANCELADO') {
      return res.status(409).json({ error: 'Esta conta está cancelada.' });
    }

    // "claim" atômico: só uma requisição consegue passar de pendente para pago (evita baixa em dobro)
    const claim = await prisma.accountReceivable.updateMany({
      where: { id, tenantId, status: { in: ['PENDENTE', 'ATRASADO'] } },
      data: { status: 'PAGO', dataPagamento: dataPagamento ?? new Date(), gatewayId: gatewayId ?? undefined, gatewayStatus: gatewayStatus ?? undefined },
    });
    if (claim.count === 0) return res.status(409).json({ error: 'Esta conta já foi baixada.' });

    let baixa;
    try {
      baixa = await registrarBaixaComLancamento({
        tenantId,
        tipo: 'RECEITA',
        valor: receivable.valor,
        formaPagamento,
        historico: `Recebimento — ${receivable.descricao}`,
        accountReceivableId: receivable.id,
        dataTransacao: dataPagamento,
      });
    } catch (e) {
      await prisma.accountReceivable.update({ where: { id }, data: { status: receivable.status, dataPagamento: null } });
      throw e;
    }
    const { transacao, lancamento } = baixa;
    const updated = await prisma.accountReceivable.findUniqueOrThrow({ where: { id } });

    res.json({ receivable: updated, transacao, lancamento });
  }),
);

// Endpoint pensado para ser chamado pelo webhook do Asaas/Stripe já
// existente no DentalPos One quando uma cobrança é confirmada — evita
// reimplementar a integração com o gateway, só conecta o resultado dela
// à baixa da conta a receber correspondente.
router.post(
  '/receivables/webhook-gateway-confirmacao',
  requireAuth,
  requireRole('ADMIN', 'FINANCE'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req);
    const parsed = webhookSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten().fieldErrors });
    }
    const { gatewayId, formaPagamento, gatewayStatus } = parsed.data;

    const receivable = await prisma.accountReceivable.findFirst({ where: { gatewayId, tenantId } });
    if (!receivable) return res.status(404).json({ error: 'Cobrança não vinculada a nenhuma conta a receber.' });
    if (receivable.status === 'PAGO') return res.status(200).json({ ok: true, jaProcessado: true });
    if (receivable.status === 'CANCELADO') return res.status(409).json({ error: 'Esta conta está cancelada.' });

    const claim = await prisma.accountReceivable.updateMany({
      where: { id: receivable.id, status: { in: ['PENDENTE', 'ATRASADO'] } },
      data: { status: 'PAGO', dataPagamento: new Date(), gatewayStatus },
    });
    if (claim.count === 0) return res.status(200).json({ ok: true, jaProcessado: true });

    let baixa;
    try {
      baixa = await registrarBaixaComLancamento({
        tenantId: receivable.tenantId,
        tipo: 'RECEITA',
        valor: receivable.valor,
        formaPagamento,
        historico: `Recebimento via gateway — ${receivable.descricao}`,
        accountReceivableId: receivable.id,
      });
    } catch (e) {
      await prisma.accountReceivable.update({ where: { id: receivable.id }, data: { status: receivable.status, dataPagamento: null } });
      throw e;
    }
    const updated = await prisma.accountReceivable.findUniqueOrThrow({ where: { id: receivable.id } });

    res.json({ receivable: updated, transacao: baixa.transacao, lancamento: baixa.lancamento });
  }),
);

export default router;
