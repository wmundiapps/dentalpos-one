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

// ---------- Currículo ----------

export const createProgramSchema = z.object({
  nome: z.string().min(2),
  modalidade: z.enum(['EAD', 'PRESENCIAL', 'SEMIPRESENCIAL']),
  cargaHorariaTotal: z.number().int().positive(),
});

export const createDisciplineSchema = z.object({
  nome: z.string().min(2),
  cargaHoraria: z.number().int().positive(),
  ementa: z.string().optional(),
});

export const linkCurriculumSchema = z.object({
  programId: z.string().uuid(),
  disciplineId: z.string().uuid(),
  periodo: z.number().int().positive(),
  obrigatoria: z.boolean().optional().default(true),
});

export const createTermSchema = z.object({
  codigo: z.string().min(3), // ex: "2026/2"
  dataInicio: z.coerce.date(),
  dataFim: z.coerce.date(),
});

// ---------- Aluno / Matrícula ----------

export const createStudentSchema = z.object({
  userId: z.string().uuid(),
  ra: z.string().min(3),
  nomeCompleto: z.string().min(3),
  cpf: z.string().optional(),
  dataNascimento: z.coerce.date().optional(),
});

export const createEnrollmentSchema = z.object({
  studentId: z.string().uuid(),
  programId: z.string().uuid(),
  termId: z.string().uuid(),
});

export const enrollInClassSectionSchema = z.object({
  enrollmentId: z.string().uuid(),
  classSectionId: z.string().uuid(),
});

// ---------- Turma ----------

export const createClassSectionSchema = z.object({
  campusId: z.string().uuid().optional(),
  disciplineId: z.string().uuid(),
  termId: z.string().uuid(),
  professorUserId: z.string().uuid(),
  nome: z.string().min(2),
  vagas: z.number().int().positive().optional(),
});

// ---------- Sessão de aula / agendamento ----------

export const createClassSessionSchema = z
  .object({
    classSectionId: z.string().uuid(),
    tipo: z.enum(['TEORICA', 'PRATICA']),
    titulo: z.string().min(2),
    dataHoraInicio: z.coerce.date(),
    dataHoraFim: z.coerce.date(),
    local: z.string().optional(),
    vagasPratica: z.number().int().positive().optional(),
  })
  .refine((data) => data.dataHoraFim > data.dataHoraInicio, {
    message: 'dataHoraFim deve ser posterior a dataHoraInicio.',
    path: ['dataHoraFim'],
  });

export const createBookingSchema = z.object({
  studentId: z.string().uuid().optional(), // opcional: se ausente, usa req.user.studentId
});

export const markAttendanceSchema = z.object({
  registros: z
    .array(
      z.object({
        studentId: z.string().uuid(),
        presente: z.boolean(),
        justificativa: z.string().optional(),
      }),
    )
    .min(1),
});
