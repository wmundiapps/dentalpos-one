import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';

export function validate(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Dados inválidos.',
        details: result.error.flatten().fieldErrors,
      });
    }
    req.body = result.data;
    next();
  };
}

// ---------- Avaliação ----------

export const createAssessmentSchema = z.object({
  disciplineId: z.string().uuid(),
  classSectionId: z.string().uuid().optional(),
  titulo: z.string().min(2),
  tipo: z.enum(['PROVA', 'ATIVIDADE', 'AUTOAVALIACAO', 'SIMULADO_ENADE', 'SIMULADO_RESIDENCIA']),
  dataAbertura: z.coerce.date().optional(),
  dataFechamento: z.coerce.date().optional(),
  correcaoPorIA: z.boolean().optional().default(false),
  focoEnade: z.boolean().optional().default(false),
});

export const createQuestionSchema = z
  .object({
    enunciado: z.string().min(3),
    tipo: z.enum(['MULTIPLA_ESCOLHA', 'DISSERTATIVA', 'VERDADEIRO_FALSO']),
    alternativas: z
      .array(z.object({ texto: z.string(), correta: z.boolean() }))
      .optional(),
    respostaCorreta: z.string().optional(),
    peso: z.number().positive().default(1),
    criteriosRubrica: z.string().optional(), // se DISSERTATIVA + correcaoPorIA
    notaMaximaRubrica: z.number().positive().optional(),
  })
  .refine(
    (data) =>
      data.tipo !== 'MULTIPLA_ESCOLHA' || (data.alternativas && data.alternativas.length >= 2),
    { message: 'Questão de múltipla escolha precisa de ao menos 2 alternativas.', path: ['alternativas'] },
  );

// ---------- Geração por IA ----------

export const generateQuestionsSchema = z.object({
  contentItemId: z.string().uuid(),
  quantidadeMultiplaEscolha: z.number().int().min(0).max(20).default(5),
  quantidadeDissertativas: z.number().int().min(0).max(10).default(0),
  focoEnade: z.boolean().optional().default(false),
  focoResidencia: z.boolean().optional().default(false),
  nivelDificuldade: z.enum(['BASICO', 'INTERMEDIARIO', 'AVANCADO']).optional(),
});

// ---------- Tentativa do aluno ----------

export const submitAnswerSchema = z.object({
  respostas: z
    .array(
      z.object({
        questionId: z.string().uuid(),
        respostaTexto: z.string(), // id da alternativa escolhida, "true"/"false", ou texto dissertativo
      }),
    )
    .min(1),
});
