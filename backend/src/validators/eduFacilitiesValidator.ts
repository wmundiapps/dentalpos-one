import { z } from 'zod'

export const assetSchema = z.object({
  code: z.string().trim().min(1).max(60),
  name: z.string().trim().min(2).max(300),
  category: z.enum(['MOBILIARIO', 'EQUIPAMENTO', 'VEICULO', 'IMOVEL', 'TI', 'OUTRO']).default('OUTRO'),
  location: z.string().trim().max(300).optional(),
  acquisitionDate: z.string().datetime().optional(),
  acquisitionValue: z.number().min(0).max(100000000).optional(),
  notes: z.string().trim().max(4000).optional()
}).strict()

export const assetStatusSchema = z.object({
  status: z.enum(['ATIVO', 'MANUTENCAO', 'BAIXADO'])
}).strict()

export const maintenanceOrderSchema = z.object({
  assetId: z.string().trim().min(1).optional(),
  location: z.string().trim().max(300).optional(),
  title: z.string().trim().min(2).max(300),
  description: z.string().trim().max(4000).optional(),
  priority: z.enum(['BAIXA', 'MEDIA', 'ALTA', 'URGENTE']).default('MEDIA'),
  assignedTo: z.string().trim().max(200).optional()
}).strict()

export const maintenanceStatusSchema = z.object({
  status: z.enum(['ABERTA', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA']),
  assignedTo: z.string().trim().max(200).optional()
}).strict()

export const parkingSpotSchema = z.object({
  code: z.string().trim().min(1).max(40),
  type: z.enum(['ALUNO', 'PROFESSOR', 'VISITANTE', 'PCD']).default('ALUNO'),
  notes: z.string().trim().max(1000).optional()
}).strict()

export const parkingAssignSchema = z.object({
  assignedToStudentId: z.string().trim().min(1).optional(),
  assignedToUserId: z.string().trim().min(1).optional()
}).strict()

export const expiringItemSchema = z.object({
  category: z.enum(['DOCUMENTO', 'EXTINTOR', 'LICENCA', 'CONTRATO', 'ATO_REGULATORIO', 'MATERIAL', 'OUTRO']).default('OUTRO'),
  title: z.string().trim().min(2).max(300),
  relatedAssetId: z.string().trim().min(1).optional(),
  expiresAt: z.string().datetime(),
  preparationDays: z.number().int().min(0).max(365).default(0),
  safetyMarginDays: z.number().int().min(0).max(90).default(0),
  responsibleUserId: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(2000).optional()
}).strict()
