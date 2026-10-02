import { Router, Response } from 'express';
import { prisma } from '../../lib/prisma'; // AJUSTE: caminho real do seu cliente Prisma
import {
  AuthenticatedRequest,
  asyncHandler,
  requireAuth,
  requireRole,
} from '../academico/middleware';
import { validate, submitAnswerSchema } from './validators';
import { gradeEssayAnswer } from '../../services-ai/gradeEssayAnswer';

const router = Router();

router.post(
  '/assessments/:id/attempts',
  requireAuth,
  requireRole('STUDENT'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user!.studentId) {
      return res.status(400).json({ error: 'Usuário logado não está vinculado a um aluno.' });
    }
    const assessmentId = String(req.params.id);
    const studentId = req.user!.studentId;

    const assessment = await prisma.assessment.findUnique({ where: { id: assessmentId } });
    if (!assessment) return res.status(404).json({ error: 'Avaliação não encontrada.' });

    const agora = new Date();
    if (assessment.dataAbertura && agora < assessment.dataAbertura) {
      return res.status(409).json({ error: 'Esta avaliação ainda não está aberta.' });
    }
    if (assessment.dataFechamento && agora > assessment.dataFechamento) {
      return res.status(409).json({ error: 'O prazo desta avaliação já encerrou.' });
    }

    const existente = await prisma.assessmentAttempt.findFirst({
      where: { assessmentId, studentId, finalizadoEm: null },
    });
    if (existente) return res.status(200).json(existente); // retoma tentativa em andamento

    const attempt = await prisma.assessmentAttempt.create({ data: { assessmentId, studentId } });
    res.status(201).json(attempt);
  }),
);

router.post(
  '/attempts/:id/submit',
  requireAuth,
  requireRole('STUDENT'),
  validate(submitAnswerSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const attemptId = String(req.params.id);
    const { respostas } = req.body as { respostas: { questionId: string; respostaTexto: string }[] };

    const attempt = await prisma.assessmentAttempt.findUnique({
      where: { id: attemptId },
      include: { assessment: true },
    });
    if (!attempt) return res.status(404).json({ error: 'Tentativa não encontrada.' });
    if (attempt.studentId !== req.user!.studentId) {
      return res.status(403).json({ error: 'Esta tentativa não pertence a você.' });
    }
    if (attempt.finalizadoEm) {
      return res.status(409).json({ error: 'Esta tentativa já foi finalizada.' });
    }

    const questionIds = respostas.map((r) => r.questionId);
    const questions = await prisma.question.findMany({
      where: { id: { in: questionIds } },
      include: { assessment: false },
    });
    const questionById = new Map(questions.map((q) => [q.id, q]));

    let usouIA = false;

    // processa cada resposta: correção imediata para objetiva, IA para dissertativa
    const processadas = await Promise.all(
      respostas.map(async (r) => {
        const question = questionById.get(r.questionId);
        if (!question) return null;

        let notaObtida: number | null = null;
        let feedbackIA: string | null = null;

        if (question.tipo === 'MULTIPLA_ESCOLHA' || question.tipo === 'VERDADEIRO_FALSO') {
          notaObtida = r.respostaTexto === question.respostaCorreta ? 10 : 0;
        } else if (question.tipo === 'DISSERTATIVA' && attempt.assessment.correcaoPorIA) {
          const rubrica = await prisma.gradingRubric.findUnique({
            where: { questionId: question.id },
          });
          if (rubrica) {
            usouIA = true;
            const resultado = await gradeEssayAnswer({
              enunciado: question.enunciado,
              criteriosRubrica: rubrica.criterios,
              notaMaxima: rubrica.notaMaxima,
              respostaAluno: r.respostaTexto,
              ctx: { clinicId: req.user!.clinicId, tenantId: req.user!.tenantId, actorId: req.user!.id, referenceType: 'ATTEMPT', referenceId: attemptId },
            });
            notaObtida = (resultado.nota / rubrica.notaMaxima) * 10; // normaliza pra escala 0-10
            feedbackIA = [
              resultado.feedback,
              resultado.pontosFortes.length ? `Pontos fortes: ${resultado.pontosFortes.join('; ')}.` : '',
              resultado.pontosAMelhorar.length
                ? `A melhorar: ${resultado.pontosAMelhorar.join('; ')}.`
                : '',
            ]
              .filter(Boolean)
              .join(' ');
          }
        }
        // dissertativa sem correcaoPorIA fica com notaObtida null — aguarda correção manual do professor

        return prisma.answerSubmission.upsert({
          where: { attemptId_questionId: { attemptId, questionId: r.questionId } },
          create: { attemptId, questionId: r.questionId, respostaTexto: r.respostaTexto, notaObtida, feedbackIA },
          update: { respostaTexto: r.respostaTexto, notaObtida, feedbackIA },
        });
      }),
    );

    const respostasValidas = processadas.filter(Boolean) as NonNullable<(typeof processadas)[number]>[];
    const pendenteCorrecaoManual = respostasValidas.some((r) => r.notaObtida == null);

    let notaFinal: number | null = null;
    if (!pendenteCorrecaoManual) {
      const todasRespostas = await prisma.answerSubmission.findMany({
        where: { attemptId },
        include: { question: true },
      });
      const somaPesos = todasRespostas.reduce((acc, r) => acc + r.question.peso, 0);
      const somaPonderada = todasRespostas.reduce(
        (acc, r) => acc + (r.notaObtida ?? 0) * r.question.peso,
        0,
      );
      notaFinal = somaPesos > 0 ? somaPonderada / somaPesos : 0;
    }

    const updated = await prisma.assessmentAttempt.update({
      where: { id: attemptId },
      data: {
        finalizadoEm: pendenteCorrecaoManual ? null : new Date(),
        notaFinal,
        corrigidoPorIA: usouIA,
      },
    });

    res.json({
      attempt: updated,
      aguardandoCorrecaoManual: pendenteCorrecaoManual,
      respostas: respostasValidas,
    });
  }),
);

router.get(
  '/attempts/:id',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const attempt = await prisma.assessmentAttempt.findUnique({
      where: { id: String(req.params.id) },
      include: {
        respostas: { include: { question: true } },
        assessment: true,
      },
    });
    if (!attempt) return res.status(404).json({ error: 'Tentativa não encontrada.' });

    const isStaff = ['ADMIN', 'COORDINATOR', 'TEACHER'].includes(req.user!.role);
    if (!isStaff && attempt.studentId !== req.user!.studentId) {
      return res.status(403).json({ error: 'Sem permissão para ver esta tentativa.' });
    }
    res.json(attempt);
  }),
);

// Professor/coordenação vê todas as tentativas de uma prova — inclusive
// as que ficaram pendentes de correção manual (dissertativa sem IA)
router.get(
  '/assessments/:id/attempts',
  requireAuth,
  requireRole('ADMIN', 'COORDINATOR', 'TEACHER'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const attempts = await prisma.assessmentAttempt.findMany({
      where: { assessmentId: String(req.params.id) },
      include: { student: true },
      orderBy: { iniciadoEm: 'desc' },
    });
    res.json(attempts);
  }),
);

// Correção manual — professor sobrescreve/lança nota de uma resposta
// dissertativa que não teve correcaoPorIA habilitada
router.post(
  '/attempts/:attemptId/answers/:questionId/grade',
  requireAuth,
  requireRole('ADMIN', 'COORDINATOR', 'TEACHER'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { attemptId, questionId } = req.params as Record<string, string>;
    const { nota, feedback } = req.body as { nota: number; feedback?: string };

    const updated = await prisma.answerSubmission.update({
      where: { attemptId_questionId: { attemptId, questionId } },
      data: { notaObtida: nota, feedbackIA: feedback },
    });

    // recalcula a nota final se todas as respostas já tiverem nota
    const todasRespostas = await prisma.answerSubmission.findMany({
      where: { attemptId },
      include: { question: true },
    });
    const aindaPendente = todasRespostas.some((r) => r.notaObtida == null);
    if (!aindaPendente) {
      const somaPesos = todasRespostas.reduce((acc, r) => acc + r.question.peso, 0);
      const somaPonderada = todasRespostas.reduce((acc, r) => acc + (r.notaObtida ?? 0) * r.question.peso, 0);
      await prisma.assessmentAttempt.update({
        where: { id: attemptId },
        data: { notaFinal: somaPesos > 0 ? somaPonderada / somaPesos : 0, finalizadoEm: new Date() },
      });
    }

    res.json(updated);
  }),
);

export default router;
