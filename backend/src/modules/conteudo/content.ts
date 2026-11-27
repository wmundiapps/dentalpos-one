import { Router, Response } from 'express';
import { prisma } from '../../lib/prisma'; // AJUSTE: caminho real do seu cliente Prisma
import {
  AuthenticatedRequest,
  asyncHandler,
  requireAuth,
  requireRole,
  getTenantId,
} from '../academico/middleware';
import { validate, createContentItemSchema, updateProgressSchema } from './validators';

const router = Router();

router.post(
  '/content',
  requireAuth,
  requireRole('ADMIN', 'COORDINATOR', 'TEACHER'),
  validate(createContentItemSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req);
    const disc = await prisma.discipline.findFirst({ where: { id: req.body.disciplineId, tenantId }, select: { id: true } });
    if (!disc) return res.status(404).json({ error: 'Disciplina não encontrada.' });
    const contentItem = await prisma.contentItem.create({ data: req.body });
    res.status(201).json(contentItem);
  }),
);

// Lista o conteúdo de uma disciplina — o aluno usa para estudar
router.get(
  '/disciplines/:disciplineId/content',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { disciplineId } = req.params as Record<string, string>;
    const { tipo } = req.query as Record<string, string>;
    const tenantId = getTenantId(req);
    if (tipo && !['PDF', 'VIDEO', 'RESUMO', 'MATERIAL_COMPLEMENTAR', 'BIBLIOTECA'].includes(tipo)) {
      return res.status(400).json({ error: 'Tipo de conteúdo inválido.' });
    }

    const items = await prisma.contentItem.findMany({
      where: { disciplineId, discipline: { tenantId }, ...(tipo ? { tipo: tipo as any } : {}) },
      orderBy: { createdAt: 'desc' },
    });

    // se for aluno logado, já traz o progresso dele junto, pra não precisar de 2 chamadas
    if (req.user!.studentId) {
      const progresso = await prisma.contentProgress.findMany({
        where: { studentId: req.user!.studentId, contentItemId: { in: items.map((i) => i.id) } },
      });
      const progressoPorId = new Map(progresso.map((p) => [p.contentItemId, p]));
      return res.json(
        items.map((item) => ({ ...item, progresso: progressoPorId.get(item.id) ?? null })),
      );
    }

    res.json(items);
  }),
);

router.delete(
  '/content/:id',
  requireAuth,
  requireRole('ADMIN', 'COORDINATOR', 'TEACHER'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const item = await prisma.contentItem.findFirst({
      where: { id: String(req.params.id), discipline: { tenantId: getTenantId(req) } },
      select: { id: true },
    });
    if (!item) return res.status(404).json({ error: 'Conteúdo não encontrado.' });
    // remove dependentes (flashcards, estados de revisão, progresso) para não violar FKs
    const cardIds = (await prisma.flashcard.findMany({ where: { contentItemId: item.id }, select: { id: true } })).map((f) => f.id);
    await prisma.$transaction([
      prisma.studentFlashcardState.deleteMany({ where: { flashcardId: { in: cardIds } } }),
      prisma.flashcard.deleteMany({ where: { contentItemId: item.id } }),
      prisma.contentProgress.deleteMany({ where: { contentItemId: item.id } }),
      prisma.contentItem.delete({ where: { id: item.id } }),
    ]);
    res.status(204).send();
  }),
);

// Aluno marca progresso (ex: vídeo assistido até 80%, ou PDF concluído)
router.post(
  '/content/:id/progress',
  requireAuth,
  requireRole('STUDENT'),
  validate(updateProgressSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user!.studentId) {
      return res.status(400).json({ error: 'Usuário logado não está vinculado a um aluno.' });
    }
    const contentItemId = String(req.params.id);
    const item = await prisma.contentItem.findFirst({
      where: { id: contentItemId, discipline: { tenantId: getTenantId(req) } },
      select: { id: true },
    });
    if (!item) return res.status(404).json({ error: 'Conteúdo não encontrado.' });

    const progress = await prisma.contentProgress.upsert({
      where: { studentId_contentItemId: { studentId: req.user!.studentId, contentItemId } },
      create: {
        studentId: req.user!.studentId,
        contentItemId,
        percentualAssistido: req.body.percentualAssistido ?? 0,
        concluido: req.body.concluido ?? false,
      },
      update: {
        ...(req.body.percentualAssistido != null && { percentualAssistido: req.body.percentualAssistido }),
        ...(req.body.concluido != null && { concluido: req.body.concluido }),
        ultimaVisualizacao: new Date(),
      },
    });
    res.json(progress);
  }),
);

// Coordenação acompanha o desempenho/engajamento de uma turma com o conteúdo
router.get(
  '/disciplines/:disciplineId/content/progress-resumo',
  requireAuth,
  requireRole('ADMIN', 'COORDINATOR', 'TEACHER'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { disciplineId } = req.params as Record<string, string>;

    const items = await prisma.contentItem.findMany({
      where: { disciplineId, discipline: { tenantId: getTenantId(req) } },
      select: { id: true, titulo: true },
    });
    const resumo = await Promise.all(
      items.map(async (item) => {
        const [total, concluidos] = await Promise.all([
          prisma.contentProgress.count({ where: { contentItemId: item.id } }),
          prisma.contentProgress.count({ where: { contentItemId: item.id, concluido: true } }),
        ]);
        return { ...item, totalAlunosComProgresso: total, concluidos };
      }),
    );

    res.json(resumo);
  }),
);

export default router;
