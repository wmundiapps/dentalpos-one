import { Router, Response } from 'express';
import { prisma } from '../../lib/prisma'; // AJUSTE: caminho real do seu cliente Prisma
import {
  AuthenticatedRequest,
  asyncHandler,
  requireAuth,
  requireRole,
  getTenantId,
} from '../academico/middleware';
import { validate, emitInvoiceSchema } from './validators';

const router = Router();

// ============================================================
// Este endpoint registra a intenção/status de emissão fiscal.
// A emissão real (comunicação com a SEFAZ/prefeitura) depende de
// qual emissor seu contador já usa (ex: NFE.io, Focus NFe, PlugNotas).
// O ponto de integração é o bloco marcado abaixo — quando você
// escolher o provedor, essa é a única função que precisa mudar.
// ============================================================

router.post(
  '/invoices',
  requireAuth,
  requireRole('ADMIN', 'FINANCE'),
  validate(emitInvoiceSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req);

    if (req.body.accountReceivableId) {
      const ar = await prisma.accountReceivable.findFirst({ where: { id: req.body.accountReceivableId, tenantId }, select: { id: true } });
      if (!ar) return res.status(404).json({ error: 'Conta a receber não encontrada.' });
    }
    const invoice = await prisma.fiscalInvoice.create({
      data: { tenantId, ...req.body, status: 'PENDENTE' },
    });

    // ---- PONTO DE INTEGRAÇÃO COM O EMISSOR FISCAL REAL ----
    // const resultado = await emissorFiscal.emitir(invoice);
    // await prisma.fiscalInvoice.update({
    //   where: { id: invoice.id },
    //   data: { status: 'EMITIDA', numero: resultado.numero, urlPdf: resultado.pdf, urlXml: resultado.xml, emitidoEm: new Date() },
    // });
    // ---------------------------------------------------------

    res.status(201).json(invoice);
  }),
);

router.get(
  '/invoices',
  requireAuth,
  requireRole('ADMIN', 'FINANCE', 'BOARD'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req);
    const { status } = req.query as Record<string, string>;

    const invoices = await prisma.fiscalInvoice.findMany({
      where: { tenantId, ...(status ? { status: status as any } : {}) },
      orderBy: { createdAt: 'desc' },
    });
    res.json(invoices);
  }),
);

export default router;
