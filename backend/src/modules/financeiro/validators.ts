import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';

export function validate(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Dados inválidos.',
        details: result.error.flatten().fieldErrors,
      });
    }
    req.body = result.data;
    next();
  };
}

// ---------- Plano de contas / centro de custo ----------

export const createCostCenterSchema = z.object({
  nome: z.string().min(2),
  descricao: z.string().optional(),
});

export const createChartOfAccountSchema = z.object({
  codigo: z.string().min(1),
  nome: z.string().min(2),
  tipo: z.enum(['ATIVO', 'PASSIVO', 'PATRIMONIO_LIQUIDO', 'RECEITA', 'DESPESA']),
});

// ---------- Contas a pagar ----------

export const createPayableSchema = z.object({
  costCenterId: z.string().uuid().optional(),
  descricao: z.string().min(2),
  fornecedor: z.string().optional(),
  categoria: z.string().optional(),
  valor: z.number().positive(),
  dataVencimento: z.coerce.date(),
});

export const payPayableSchema = z.object({
  formaPagamento: z.enum(['PIX', 'BOLETO', 'CARTAO', 'DINHEIRO', 'TRANSFERENCIA']),
  dataPagamento: z.coerce.date().optional(),
});

// ---------- Contas a receber ----------

export const createReceivableSchema = z.object({
  studentId: z.string().uuid(),
  enrollmentId: z.string().uuid().optional(),
  descricao: z.string().min(2),
  numeroParcela: z.number().int().positive().optional(),
  valor: z.number().positive(),
  dataVencimento: z.coerce.date(),
});

export const generateMensalidadesSchema = z.object({
  studentId: z.string().uuid(),
  enrollmentId: z.string().uuid(),
  valorParcela: z.number().positive(),
  quantidadeParcelas: z.number().int().positive().max(60),
  diaVencimento: z.number().int().min(1).max(28),
  primeiroVencimento: z.coerce.date(),
  descricaoBase: z.string().min(2).default('Mensalidade'),
});

export const receivePayableSchema = z.object({
  formaPagamento: z.enum(['PIX', 'BOLETO', 'CARTAO', 'DINHEIRO', 'TRANSFERENCIA']),
  dataPagamento: z.coerce.date().optional(),
  gatewayId: z.string().optional(),
  gatewayStatus: z.string().optional(),
});

// ---------- Nota fiscal ----------

export const emitInvoiceSchema = z.object({
  accountReceivableId: z.string().uuid().optional(),
  tipo: z.enum(['NFSE', 'NFE', 'RECIBO']),
  valor: z.number().positive(),
});

export const webhookSchema = z.object({
  gatewayId: z.string().min(1),
  formaPagamento: z.enum(['PIX', 'BOLETO', 'CARTAO', 'DINHEIRO', 'TRANSFERENCIA']),
  gatewayStatus: z.string().min(1),
});
