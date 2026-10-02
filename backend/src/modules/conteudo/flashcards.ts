import { Router, Response } from 'express';
import { prisma } from '../../lib/prisma'; // AJUSTE: caminho real do seu cliente Prisma
import {
  AuthenticatedRequest,
  asyncHandler,
  requireAuth,
  requireRole,
} from '../academico/middleware';
import { validate, createFlashcardSchema, reviewFlashcardSchema } from './validators';

const router = Router();

// ============================================================
// Algoritmo SM-2 (SuperMemo 2) — o mesmo princípio usado no AllCollege.
// qualidade: 0-2 = errou (reseta), 3-5 = acertou (aumenta intervalo).
// ============================================================
function calcularProximaRevisaoSM2(
  qualidade: number,
  estadoAtual: { intervalo: number; fatorFacilidade: number; repeticoes: number },
) {
  let { intervalo, fatorFacilidade, repeticoes } = estadoAtual;

  if (qualidade < 3) {
    repeticoes = 0;
    intervalo = 1;
  } else {
    repeticoes += 1;
    if (repeticoes === 1) intervalo = 1;
    else if (repeticoes === 2) intervalo = 6;
    else intervalo = Math.round(intervalo * fatorFacilidade);

    fatorFacilidade =
      fatorFacilidade + (0.1 - (5 - qualidade) * (0.08 + (5 - qualidade) * 0.02));
    if (fatorFacilidade < 1.3) fatorFacilidade = 1.3;
  }

  const proximaRevisao = new Date();
  proximaRevisao.setDate(proximaRevisao.getDate() + intervalo);

  return { intervalo, fatorFacilidade, repeticoes, proximaRevisao };
}

router.post(
  '/flashcards',
  requireAuth,
  requireRole('ADMIN', 'COORDINATOR', 'TEACHER'),
  validate(createFlashcardSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const flashcard = await prisma.flashcard.create({ data: req.body });
    res.status(201).json(flashcard);
  }),
);

router.get(
  '/content/:contentItemId/flashcards',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const flashcards = await prisma.flashcard.findMany({
      where: { contentItemId: String(req.params.contentItemId) },
    });
    res.json(flashcards);
  }),
);

// Cartões que o aluno precisa revisar HOJE (nunca revisados + vencidos)
router.get(
  '/flashcards/due',
  requireAuth,
  requireRole('STUDENT'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user!.studentId) {
      return res.status(400).json({ error: 'Usuário logado não está vinculado a um aluno.' });
    }
    const { disciplineId } = req.query as Record<string, string>;
    const studentId = req.user!.studentId;

    const flashcards = await prisma.flashcard.findMany({
      where: disciplineId ? { contentItem: { disciplineId } } : {},
      include: { contentItem: true },
    });

    const estados = await prisma.studentFlashcardState.findMany({
      where: { studentId, flashcardId: { in: flashcards.map((f) => f.id) } },
    });
    const estadoPorCartao = new Map(estados.map((e) => [e.flashcardId, e]));
    const agora = new Date();

    const devidos = flashcards.filter((f) => {
      const estado = estadoPorCartao.get(f.id);
      return !estado || estado.proximaRevisao <= agora;
    });

    res.json(devidos);
  }),
);

// Aluno responde e o algoritmo recalcula quando esse cartão volta a aparecer
router.post(
  '/flashcards/:id/review',
  requireAuth,
  requireRole('STUDENT'),
  validate(reviewFlashcardSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user!.studentId) {
      return res.status(400).json({ error: 'Usuário logado não está vinculado a um aluno.' });
    }
    const studentId = req.user!.studentId;
    const flashcardId = String(req.params.id);
    const { qualidade } = req.body;

    const flashcard = await prisma.flashcard.findUnique({ where: { id: flashcardId } });
    if (!flashcard) return res.status(404).json({ error: 'Flashcard não encontrado.' });

    const estadoAtual = await prisma.studentFlashcardState.findUnique({
      where: { studentId_flashcardId: { studentId, flashcardId } },
    });

    const base = {
      intervalo: estadoAtual?.intervalo ?? 1,
      fatorFacilidade: estadoAtual?.fatorFacilidade ?? 2.5,
      repeticoes: estadoAtual?.repeticoes ?? 0,
    };

    const novoEstado = calcularProximaRevisaoSM2(qualidade, base);

    const salvo = await prisma.studentFlashcardState.upsert({
      where: { studentId_flashcardId: { studentId, flashcardId } },
      create: { studentId, flashcardId, ...novoEstado, ultimaRevisao: new Date() },
      update: { ...novoEstado, ultimaRevisao: new Date() },
    });

    res.json(salvo);
  }),
);

export default router;
