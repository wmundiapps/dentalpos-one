import { Router, Response } from 'express';
import { prisma } from '../../lib/prisma'; // AJUSTE: caminho real do seu cliente Prisma
import {
  AuthenticatedRequest,
  asyncHandler,
  requireAuth,
  requireRole,
} from '../academico/middleware';
import { validate, createAssessmentSchema, createQuestionSchema } from './validators';

const router = Router();

router.post(
  '/assessments',
  requireAuth,
  requireRole('ADMIN', 'COORDINATOR', 'TEACHER'),
  validate(createAssessmentSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const assessment = await prisma.assessment.create({ data: req.body });
    res.status(201).json(assessment);
  }),
);

router.get(
  '/assessments/:id',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const isStaff = ['ADMIN', 'COORDINATOR', 'TEACHER'].includes(req.user!.role);

    const assessment = await prisma.assessment.findUnique({
      where: { id: String(req.params.id) },
      include: {
        questoes: {
          select: {
            id: true,
            enunciado: true,
            tipo: true,
            peso: true,
            // aluno não recebe a resposta correta nem a rubrica junto da prova
            ...(isStaff && { alternativas: true, respostaCorreta: true }),
          },
        },
      },
    });
    if (!assessment) return res.status(404).json({ error: 'Avaliação não encontrada.' });
    res.json(assessment);
  }),
);

router.get(
  '/disciplines/:disciplineId/assessments',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const assessments = await prisma.assessment.findMany({
      where: { disciplineId: String(req.params.disciplineId) },
      orderBy: { dataAbertura: 'desc' },
    });
    res.json(assessments);
  }),
);

// Adiciona uma questão manualmente (o professor pode misturar questões
// manuais com questões geradas por IA na mesma prova)
router.post(
  '/assessments/:id/questions',
  requireAuth,
  requireRole('ADMIN', 'COORDINATOR', 'TEACHER'),
  validate(createQuestionSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const assessmentId = String(req.params.id);
    const { criteriosRubrica, notaMaximaRubrica, ...questionData } = req.body;

    const question = await prisma.question.create({
      data: { assessmentId, ...questionData },
    });

    if (question.tipo === 'DISSERTATIVA' && criteriosRubrica) {
      await prisma.gradingRubric.create({
        data: {
          questionId: question.id,
          criterios: criteriosRubrica,
          notaMaxima: notaMaximaRubrica ?? 10,
        },
      });
    }

    res.status(201).json(question);
  }),
);

export default router;
