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

// ---------- Conteúdo ----------

export const createContentItemSchema = z.object({
  disciplineId: z.string().uuid(),
  tipo: z.enum(['PDF', 'VIDEO', 'RESUMO', 'MATERIAL_COMPLEMENTAR', 'BIBLIOTECA']),
  titulo: z.string().min(2),
  urlArquivo: z.string().url().optional(),
  resumoTexto: z.string().optional(),
});

export const updateProgressSchema = z.object({
  percentualAssistido: z.number().min(0).max(100).optional(),
  concluido: z.boolean().optional(),
});

// ---------- Flashcards ----------

export const createFlashcardSchema = z.object({
  contentItemId: z.string().uuid(),
  pergunta: z.string().min(2),
  resposta: z.string().min(1),
});

export const reviewFlashcardSchema = z.object({
  qualidade: z.number().int().min(0).max(5), // escala SM-2: 0 (errou tudo) a 5 (acertou fácil)
});

// ---------- Biblioteca ----------

export const createLibraryProviderSchema = z.object({
  nome: z.string().min(2),
  tipoAcesso: z.enum(['ASSINATURA_INSTITUCIONAL', 'ADESAO_INDIVIDUAL']),
  urlAcesso: z.string().url().optional(),
  custoMensal: z.number().positive().optional(),
});

export const subscribeLibrarySchema = z.object({
  libraryProviderId: z.string().uuid(),
});
