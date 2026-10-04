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

export const createAssessmentSchema = z
  .object({
    disciplineId: z.string().uuid(),
    classSectionId: z.string().uuid().optional(),
    titulo: z.string().min(2),
    tipo: z.enum(['PROVA', 'ATIVIDADE', 'AUTOAVALIACAO', 'SIMULADO_ENADE', 'SIMULADO_RESIDENCIA']),
    dataAbertura: z.coerce.date().optional(),
    dataFechamento: z.coerce.date().optional(),
    correcaoPorIA: z.boolean().optional().default(false),
    focoEnade: z.boolean().optional().default(false),
  })
  .refine((d) => !d.dataAbertura || !d.dataFechamento || d.dataFechamento > d.dataAbertura, {
    message: 'dataFechamento deve ser posterior a dataAbertura.',
    path: ['dataFechamento'],
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
  )
  .refine(
    (data) =>
      data.tipo !== 'MULTIPLA_ESCOLHA' ||
      !data.alternativas ||
      data.alternativas.filter((a) => a.correta).length === 1 ||
      (!!data.respostaCorreta && data.alternativas.some((a) => a.texto === data.respostaCorreta)),
    { message: 'Marque exatamente uma alternativa como correta (ou informe respostaCorreta igual ao texto de uma alternativa).', path: ['alternativas'] },
  )
  .refine((data) => data.tipo !== 'VERDADEIRO_FALSO' || data.respostaCorreta === 'true' || data.respostaCorreta === 'false', {
    message: 'Questão verdadeiro/falso exige respostaCorreta "true" ou "false".',
    path: ['respostaCorreta'],
  });

// ---------- Geração por IA ----------

export const generateQuestionsSchema = z.object({
  contentItemId: z.string().uuid(),
  quantidadeMultiplaEscolha: z.number().int().min(0).max(20).default(5),
  quantidadeDissertativas: z.number().int().min(0).max(10).default(0),
  focoEnade: z.boolean().optional().default(false),
  focoResidencia: z.boolean().optional().default(false),
  nivelDificuldade: z.enum(['BASICO', 'INTERMEDIARIO', 'AVANCADO']).optional(),
}).refine((d) => d.quantidadeMultiplaEscolha + d.quantidadeDissertativas > 0, {
  message: 'Informe ao menos uma questão a gerar.',
  path: ['quantidadeMultiplaEscolha'],
});

// ---------- Tentativa do aluno ----------

export const gradeAnswerSchema = z.object({
  nota: z.number().min(0).max(10), // escala 0-10, a mesma de AnswerSubmission.notaObtida
  feedback: z.string().max(4000).optional(),
});

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
