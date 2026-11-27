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
import { aiConfigured, AiUnavailableError } from '../../services-ai/client';

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
      prisma.assessment.findFirst({ where: { id: assessmentId, discipline: { tenantId } } }),
      prisma.contentItem.findFirst({ where: { id: contentItemId, discipline: { tenantId } } }),
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

    if (!aiConfigured()) {
      // fallback: sem IA configurada o professor monta a prova manualmente
      return res.status(503).json({
        error: 'IA não configurada neste ambiente. Adicione as questões manualmente em POST /assessments/:id/questions.',
        fallback: 'MANUAL',
      });
    }

    let geradasBrutas: Awaited<ReturnType<typeof generateQuestions>>;
    try {
      geradasBrutas = await generateQuestions({
        textoBase,
        quantidadeMultiplaEscolha,
        quantidadeDissertativas,
        focoEnade,
        focoResidencia,
        nivelDificuldade,
        ctx: { clinicId: req.user!.clinicId, tenantId: req.user!.tenantId, actorId: req.user!.id, referenceType: 'ASSESSMENT', referenceId: assessmentId },
      });
    } catch (e: any) {
      return res.status(e instanceof AiUnavailableError ? 503 : 502).json({
        error: `Não foi possível gerar as questões por IA: ${e?.message || 'erro desconhecido'}. Adicione-as manualmente em POST /assessments/:id/questions.`,
        fallback: 'MANUAL',
      });
    }
    // descarta itens malformados devolvidos pela IA (nunca confiar cegamente no JSON)
    const geradas = (Array.isArray(geradasBrutas) ? geradasBrutas : [])
      .filter((q) => q && typeof q.enunciado === 'string' && q.enunciado.trim().length >= 3)
      .filter((q) => {
        if (q.tipo === 'DISSERTATIVA') return true;
        if (q.tipo === 'MULTIPLA_ESCOLHA') {
          return Array.isArray(q.alternativas) && q.alternativas.length >= 2 && q.alternativas.filter((a) => a?.correta).length === 1 && q.alternativas.every((a) => typeof a?.texto === 'string');
        }
        return false;
      })
      .map((q) => ({ ...q, peso: Number.isFinite(Number(q.peso)) && Number(q.peso) > 0 ? Number(q.peso) : 1 }));
    if (!geradas.length) {
      return res.status(502).json({ error: 'A IA não retornou questões válidas. Tente novamente ou adicione-as manualmente.', fallback: 'MANUAL' });
    }

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
