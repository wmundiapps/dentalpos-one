import { Router, Response } from 'express';
import { prisma } from '../../lib/prisma'; // AJUSTE: caminho real do seu cliente Prisma
import {
  AuthenticatedRequest,
  asyncHandler,
  requireAuth,
  requireRole,
  getTenantId,
} from '../academico/middleware';
import { validate, createLibraryProviderSchema, subscribeLibrarySchema } from './validators';

const router = Router();

router.post(
  '/library/providers',
  requireAuth,
  requireRole('ADMIN', 'FINANCE'),
  validate(createLibraryProviderSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req);
    const provider = await prisma.libraryProvider.create({ data: { tenantId, ...req.body } });
    res.status(201).json(provider);
  }),
);

router.get(
  '/library/providers',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req);
    const providers = await prisma.libraryProvider.findMany({
      where: { tenantId, ativo: true },
      orderBy: { nome: 'asc' },
    });
    res.json(providers);
  }),
);

// Aluno adere a um provedor de biblioteca
router.post(
  '/library/subscribe',
  requireAuth,
  requireRole('STUDENT'),
  validate(subscribeLibrarySchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user!.studentId) {
      return res.status(400).json({ error: 'Usuário logado não está vinculado a um aluno.' });
    }
    const studentId = req.user!.studentId;
    const { libraryProviderId } = req.body;
    const tenantId = getTenantId(req);

    const provider = await prisma.libraryProvider.findFirst({
      where: { id: libraryProviderId, tenantId, ativo: true },
    });
    if (!provider) return res.status(404).json({ error: 'Provedor de biblioteca não encontrado.' });

    const jaAssina = await prisma.studentLibraryAccess.findUnique({
      where: { studentId_libraryProviderId: { studentId, libraryProviderId } },
    });
    if (jaAssina && jaAssina.status !== 'CANCELADA') {
      return res.status(409).json({ error: 'Aluno já possui acesso a este provedor.' });
    }

    // assinatura institucional = acesso automático, sem cobrança individual;
    // adesão individual = ativa o acesso e, se houver custo, gera a cobrança
    // no módulo financeiro (mesma base de dados, sem reimplementar nada lá).
    const status = provider.tipoAcesso === 'ASSINATURA_INSTITUCIONAL' ? 'ATIVA' : 'ATIVA';

    const [access] = await prisma.$transaction([
      prisma.studentLibraryAccess.upsert({
        where: { studentId_libraryProviderId: { studentId, libraryProviderId } },
        create: { studentId, libraryProviderId, status },
        update: { status, dataAdesao: new Date(), dataCancelamento: null },
      }),
      ...(provider.tipoAcesso === 'ADESAO_INDIVIDUAL' && provider.custoMensal
        ? [
            prisma.accountReceivable.create({
              data: {
                tenantId,
                studentId,
                descricao: `Assinatura biblioteca — ${provider.nome}`,
                valor: provider.custoMensal,
                dataVencimento: new Date(new Date().setDate(new Date().getDate() + 7)),
              },
            }),
          ]
        : []),
    ]);

    res.status(201).json(access);
  }),
);

router.post(
  '/library/providers/:id/cancel',
  requireAuth,
  requireRole('STUDENT', 'ADMIN', 'FINANCE'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const libraryProviderId = String(req.params.id);
    const studentId =
      req.user!.role === 'STUDENT' ? req.user!.studentId : (req.query.studentId as string);

    if (!studentId) {
      return res.status(400).json({ error: 'studentId é obrigatório.' });
    }

    const access = await prisma.studentLibraryAccess.update({
      where: { studentId_libraryProviderId: { studentId, libraryProviderId } },
      data: { status: 'CANCELADA', dataCancelamento: new Date() },
    });
    res.json(access);
  }),
);

// Aluno vê as próprias assinaturas de biblioteca
router.get(
  '/library/my',
  requireAuth,
  requireRole('STUDENT'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user!.studentId) {
      return res.status(400).json({ error: 'Usuário logado não está vinculado a um aluno.' });
    }
    const accesses = await prisma.studentLibraryAccess.findMany({
      where: { studentId: req.user!.studentId },
      include: { libraryProvider: true },
    });
    res.json(accesses);
  }),
);

export default router;
