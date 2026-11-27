import { Router, Response } from 'express';
import { prisma } from '../../lib/prisma'; // AJUSTE: caminho real do seu cliente Prisma
import {
  AuthenticatedRequest,
  asyncHandler,
  requireAuth,
  requireRole,
  getTenantId,
} from '../academico/middleware';
import { validate, createAssessmentSchema, createQuestionSchema } from './validators';

const router = Router();
export const STAFF = ['ADMIN', 'OWNER', 'RECTOR', 'BOARD', 'COORDINATOR', 'TEACHER'];

router.post(
  '/assessments',
  requireAuth,
  requireRole('ADMIN', 'COORDINATOR', 'TEACHER'),
  validate(createAssessmentSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req);
    const discipline = await prisma.discipline.findFirst({ where: { id: req.body.disciplineId, tenantId }, select: { id: true } });
    if (!discipline) return res.status(404).json({ error: 'Disciplina não encontrada.' });
    if (req.body.classSectionId) {
      const section = await prisma.classSection.findFirst({
        where: { id: req.body.classSectionId, tenantId, disciplineId: req.body.disciplineId },
        select: { id: true, professorUserId: true },
      });
      if (!section) return res.status(404).json({ error: 'Turma não encontrada para esta disciplina.' });
      if (req.user!.role === 'TEACHER' && section.professorUserId !== req.user!.id) {
        return res.status(403).json({ error: 'Você não leciona esta turma.' });
      }
    }
    const assessment = await prisma.assessment.create({ data: req.body });
    res.status(201).json(assessment);
  }),
);

router.get(
  '/assessments/:id',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const isStaff = STAFF.includes(req.user!.role);

    const assessment = await prisma.assessment.findFirst({
      where: { id: String(req.params.id), discipline: { tenantId: getTenantId(req) } },
      include: {
        questoes: {
          select: {
            id: true,
            enunciado: true,
            tipo: true,
            peso: true,
            alternativas: true,
            ...(isStaff && { respostaCorreta: true }),
          },
        },
      },
    });
    if (!assessment) return res.status(404).json({ error: 'Avaliação não encontrada.' });
    if (!isStaff) {
      // aluno: não vê questões antes da abertura e nunca recebe o gabarito (flag "correta" das alternativas)
      if (assessment.dataAbertura && assessment.dataAbertura > new Date()) {
        return res.json({ ...assessment, questoes: [] });
      }
      return res.json({
        ...assessment,
        questoes: assessment.questoes.map((q) => ({
          ...q,
          alternativas: Array.isArray(q.alternativas)
            ? (q.alternativas as any[]).map((a) => ({ texto: a?.texto }))
            : q.alternativas,
        })),
      });
    }
    res.json(assessment);
  }),
);

router.get(
  '/disciplines/:disciplineId/assessments',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const assessments = await prisma.assessment.findMany({
      where: { disciplineId: String(req.params.disciplineId), discipline: { tenantId: getTenantId(req) } },
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

    const assessment = await prisma.assessment.findFirst({
      where: { id: assessmentId, discipline: { tenantId: getTenantId(req) } },
      select: { id: true },
    });
    if (!assessment) return res.status(404).json({ error: 'Avaliação não encontrada.' });
    // gabarito derivado das alternativas quando não informado explicitamente
    if (questionData.tipo === 'MULTIPLA_ESCOLHA' && !questionData.respostaCorreta) {
      questionData.respostaCorreta = questionData.alternativas?.find((a: any) => a.correta)?.texto;
    }

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
