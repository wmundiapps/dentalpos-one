import { z } from 'zod'

export const documentUploadSchema = z.object({
  type: z.enum(['RG', 'CPF', 'COMPROVANTE_RESIDENCIA', 'HISTORICO_ESCOLAR', 'DIPLOMA_ANTERIOR', 'FOTO', 'OUTRO']).default('OUTRO'),
  title: z.string().trim().min(2).max(300),
  url: z.string().trim().url().max(2000)
}).strict()

export const documentRequestSchema = z.object({
  type: z.enum(['HISTORICO', 'DECLARACAO_MATRICULA', 'DECLARACAO_CONCLUSAO', 'CERTIFICADO', 'DIPLOMA', 'OUTRO']).default('DECLARACAO_MATRICULA'),
  deliveryMethod: z.enum(['DIGITAL', 'PRESENCIAL']).default('DIGITAL'),
  notes: z.string().trim().max(2000).optional()
}).strict()

export const documentRequestStatusSchema = z.object({
  status: z.enum(['SOLICITADO', 'EM_ANALISE', 'PRONTO', 'ENTREGUE', 'RECUSADO']),
  fileUrl: z.string().trim().url().max(2000).optional(),
  notes: z.string().trim().max(2000).optional()
}).strict()

export const certificateSchema = z.object({
  studentId: z.string().trim().min(1),
  enrollmentId: z.string().trim().min(1).optional(),
  type: z.enum(['CERTIFICADO_CONCLUSAO', 'DIPLOMA', 'CERTIFICADO_PARTICIPACAO']).default('CERTIFICADO_CONCLUSAO'),
  title: z.string().trim().min(2).max(300),
  registryCode: z.string().trim().max(200).optional()
}).strict()
