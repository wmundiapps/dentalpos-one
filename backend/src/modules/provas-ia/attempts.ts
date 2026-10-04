import { Router, Response } from 'express';
import { prisma } from '../../lib/prisma'; // AJUSTE: caminho real do seu cliente Prisma
import {
  AuthenticatedRequest,
  asyncHandler,
  requireAuth,
  requireRole,
  getTenantId,
} from '../academico/middleware';
import { validate, submitAnswerSchema, gradeAnswerSchema } from './validators';
import { STAFF } from './assessments';
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

    const tenantId = getTenantId(req);
    const assessment = await prisma.assessment.findFirst({
      where: { id: assessmentId, discipline: { tenantId } },
    });
    if (!assessment) return res.status(404).json({ error: 'Avaliação não encontrada.' });

    // o aluno precisa estar matriculado (matrícula ativa) na turma/disciplina da avaliação
    const matriculado = await prisma.classSectionEnrollment.findFirst({
      where: {
        enrollment: { studentId, status: 'ATIVA' },
        classSection: {
          tenantId,
          ...(assessment.classSectionId ? { id: assessment.classSectionId } : { disciplineId: assessment.disciplineId }),
        },
      },
      select: { id: true },
    });
    if (!matriculado) return res.status(403).json({ error: 'Você não está matriculado nesta turma/disciplina.' });

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

    const attempt = await prisma.assessmentAttempt.findFirst({
      where: { id: attemptId, assessment: { discipline: { tenantId: getTenantId(req) } } },
      include: { assessment: true },
    });
    if (!attempt) return res.status(404).json({ error: 'Tentativa não encontrada.' });
    if (attempt.studentId !== req.user!.studentId) {
      return res.status(403).json({ error: 'Esta tentativa não pertence a você.' });
    }
    if (attempt.finalizadoEm) {
      return res.status(409).json({ error: 'Esta tentativa já foi finalizada.' });
    }
    if (attempt.assessment.dataFechamento && new Date() > attempt.assessment.dataFechamento) {
      return res.status(409).json({ error: 'O prazo desta avaliação já encerrou.' });
    }
    // envio único: uma tentativa que já recebeu respostas aguarda a correção manual, não pode ser reenviada
    const jaEnviada = await prisma.answerSubmission.count({ where: { attemptId } });
    if (jaEnviada > 0) {
      return res.status(409).json({ error: 'Esta tentativa já foi enviada e aguarda correção manual.' });
    }

    // somente questões desta avaliação (ignora ids de outras provas) e sem repetição
    const todasQuestoes = await prisma.question.findMany({ where: { assessmentId: attempt.assessmentId } });
    const questionById = new Map(todasQuestoes.map((q) => [q.id, q]));
    const vistos = new Set<string>();
    const respostasUnicas = respostas.filter((r) => {
      if (!questionById.has(r.questionId) || vistos.has(r.questionId)) return false;
      vistos.add(r.questionId);
      return true;
    });
    if (!respostasUnicas.length) {
      return res.status(400).json({ error: 'Nenhuma resposta corresponde às questões desta avaliação.' });
    }

    let usouIA = false;

    // processa cada resposta: correção imediata para objetiva, IA para dissertativa
    const processadas = await Promise.all(
      respostasUnicas.map(async (r) => {
        const question = questionById.get(r.questionId)!;

        let notaObtida: number | null = null;
        let feedbackIA: string | null = null;

        if (question.tipo === 'MULTIPLA_ESCOLHA' || question.tipo === 'VERDADEIRO_FALSO') {
          notaObtida = r.respostaTexto === question.respostaCorreta ? 10 : 0;
        } else if (question.tipo === 'DISSERTATIVA' && attempt.assessment.correcaoPorIA) {
          const rubrica = await prisma.gradingRubric.findUnique({
            where: { questionId: question.id },
          });
          if (rubrica) {
            try {
              const resultado = await gradeEssayAnswer({
                enunciado: question.enunciado,
                criteriosRubrica: rubrica.criterios,
                notaMaxima: rubrica.notaMaxima,
                respostaAluno: r.respostaTexto,
                ctx: { clinicId: req.user!.clinicId, tenantId: req.user!.tenantId, actorId: req.user!.id, referenceType: 'ATTEMPT', referenceId: attemptId },
              });
              const nota = Number(resultado?.nota);
              if (!Number.isFinite(nota)) throw new Error('Resposta da IA sem nota válida.');
              usouIA = true;
              notaObtida = (Math.min(Math.max(nota, 0), rubrica.notaMaxima) / rubrica.notaMaxima) * 10; // normaliza pra escala 0-10
              feedbackIA = [
                resultado.feedback,
                resultado.pontosFortes?.length ? `Pontos fortes: ${resultado.pontosFortes.join('; ')}.` : '',
                resultado.pontosAMelhorar?.length
                  ? `A melhorar: ${resultado.pontosAMelhorar.join('; ')}.`
                  : '',
              ]
                .filter(Boolean)
                .join(' ');
            } catch (e: any) {
              // IA indisponível/não configurada ou resposta inválida: fallback para correção manual do professor
              console.warn('[provas-ia] correção por IA indisponível, resposta ficará para correção manual:', e?.message);
              notaObtida = null;
              feedbackIA = null;
            }
          }
        }
        // dissertativa sem correcaoPorIA (ou sem IA disponível) fica com notaObtida null — aguarda correção manual do professor

        return prisma.answerSubmission.upsert({
          where: { attemptId_questionId: { attemptId, questionId: r.questionId } },
          create: { attemptId, questionId: r.questionId, respostaTexto: r.respostaTexto, notaObtida, feedbackIA },
          update: { respostaTexto: r.respostaTexto, notaObtida, feedbackIA },
        });
      }),
    );

    const respostasValidas = processadas;
    const pendenteCorrecaoManual = respostasValidas.some((r) => r.notaObtida == null);

    let notaFinal: number | null = null;
    if (!pendenteCorrecaoManual) {
      // questões não respondidas valem zero (a nota é sobre o total de pesos da prova)
      const porQuestao = new Map(respostasValidas.map((r) => [r.questionId, r.notaObtida ?? 0]));
      const somaPesos = todasQuestoes.reduce((acc, q) => acc + q.peso, 0);
      const somaPonderada = todasQuestoes.reduce((acc, q) => acc + (porQuestao.get(q.id) ?? 0) * q.peso, 0);
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
    const attempt = await prisma.assessmentAttempt.findFirst({
      where: { id: String(req.params.id), assessment: { discipline: { tenantId: getTenantId(req) } } },
      include: {
        respostas: { include: { question: true } },
        assessment: true,
      },
    });
    if (!attempt) return res.status(404).json({ error: 'Tentativa não encontrada.' });

    const isStaff = STAFF.includes(req.user!.role);
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
      where: { assessmentId: String(req.params.id), assessment: { discipline: { tenantId: getTenantId(req) } } },
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
    const parsed = gradeAnswerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten().fieldErrors });
    }
    const { nota, feedback } = parsed.data;

    const attempt = await prisma.assessmentAttempt.findFirst({
      where: { id: attemptId, assessment: { discipline: { tenantId: getTenantId(req) } } },
      select: { id: true },
    });
    if (!attempt) return res.status(404).json({ error: 'Tentativa não encontrada.' });

    const updated = await prisma.answerSubmission.update({
      where: { attemptId_questionId: { attemptId, questionId } },
      data: { notaObtida: nota, ...(feedback !== undefined && { feedbackIA: feedback }) },
    });

    // recalcula a nota final se todas as respostas já tiverem nota
    const [todasRespostas, todasQuestoes] = await Promise.all([
      prisma.answerSubmission.findMany({ where: { attemptId } }),
      prisma.question.findMany({ where: { assessment: { tentativas: { some: { id: attemptId } } } } }),
    ]);
    const aindaPendente = todasRespostas.some((r) => r.notaObtida == null);
    if (!aindaPendente) {
      const porQuestao = new Map(todasRespostas.map((r) => [r.questionId, r.notaObtida ?? 0]));
      const somaPesos = todasQuestoes.reduce((acc, q) => acc + q.peso, 0);
      const somaPonderada = todasQuestoes.reduce((acc, q) => acc + (porQuestao.get(q.id) ?? 0) * q.peso, 0);
      const atual = await prisma.assessmentAttempt.findUnique({ where: { id: attemptId }, select: { finalizadoEm: true } });
      await prisma.assessmentAttempt.update({
        where: { id: attemptId },
        data: { notaFinal: somaPesos > 0 ? somaPonderada / somaPesos : 0, finalizadoEm: atual?.finalizadoEm ?? new Date() },
      });
    }

    res.json(updated);
  }),
);

export default router;
