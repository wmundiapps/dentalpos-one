import { Router, Response } from 'express';
import { prisma } from '../../lib/prisma'; // AJUSTE: caminho real do seu cliente Prisma
import {
  AuthenticatedRequest,
  asyncHandler,
  requireAuth,
  requireRole,
  getTenantId,
} from '../academico/middleware';
import { validate, generateQuestionsSchema } from './validators';
import { generateQuestions } from '../../services-ai/generateQuestions';

const router = Router();

router.post(
  '/assessments/:id/generate-questions',
  requireAuth,
  requireRole('ADMIN', 'COORDINATOR', 'TEACHER'),
  validate(generateQuestionsSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req);
    const assessmentId = String(req.params.id);
    const {
      contentItemId,
      quantidadeMultiplaEscolha,
      quantidadeDissertativas,
      focoEnade,
      focoResidencia,
      nivelDificuldade,
    } = req.body;

    const [assessment, contentItem] = await Promise.all([
      prisma.assessment.findUnique({ where: { id: assessmentId } }),
      prisma.contentItem.findUnique({ where: { id: contentItemId } }),
    ]);
    if (!assessment) return res.status(404).json({ error: 'Avaliação não encontrada.' });
    if (!contentItem) return res.status(404).json({ error: 'Conteúdo não encontrado.' });

    const textoBase = contentItem.resumoTexto;
    if (!textoBase) {
      return res.status(400).json({
        error:
          'Este conteúdo não tem texto associado (resumoTexto vazio). Geração por IA precisa de um resumo de aula, não de um PDF/vídeo bruto ainda sem transcrição.',
      });
    }

    const geradas = await generateQuestions({
      textoBase,
      quantidadeMultiplaEscolha,
      quantidadeDissertativas,
      focoEnade,
      focoResidencia,
      nivelDificuldade,
      ctx: { clinicId: req.user!.clinicId, tenantId: req.user!.tenantId, actorId: req.user!.id, referenceType: 'ASSESSMENT', referenceId: assessmentId },
    });

    const questoesCriadas = await prisma.$transaction(
      geradas.map((q) =>
        prisma.question.create({
          data: {
            assessmentId,
            enunciado: q.enunciado,
            tipo: q.tipo,
            peso: q.peso,
            ...(q.tipo === 'MULTIPLA_ESCOLHA' && {
              alternativas: q.alternativas,
              respostaCorreta: q.alternativas?.find((a) => a.correta)?.texto,
            }),
          },
        }),
      ),
    );

    // cria a rubrica de cada dissertativa gerada
    await prisma.$transaction(
      geradas
        .map((q, i) => ({ q, criado: questoesCriadas[i] }))
        .filter(({ q }) => q.tipo === 'DISSERTATIVA' && q.criteriosRubrica)
        .map(({ q, criado }) =>
          prisma.gradingRubric.create({
            data: { questionId: criado.id, criterios: q.criteriosRubrica!, notaMaxima: 10 },
          }),
        ),
    );

    await prisma.aIGenerationLog.create({
      data: {
        tenantId,
        contentItemId,
        assessmentId,
        prompt: `${quantidadeMultiplaEscolha} MC + ${quantidadeDissertativas} dissertativas, foco: ${focoEnade ? 'ENADE' : focoResidencia ? 'residência' : 'padrão'}`,
        respostaBruta: JSON.stringify(geradas),
        criadoPorUserId: req.user!.id,
      },
    });

    res.status(201).json({ questoesGeradas: questoesCriadas.length, questoes: questoesCriadas });
  }),
);

export default router;
