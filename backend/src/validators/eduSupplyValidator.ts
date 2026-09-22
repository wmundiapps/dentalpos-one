import { z } from 'zod'

export const supplyItemSchema = z.object({
  code: z.string().trim().min(1).max(60),
  name: z.string().trim().min(2).max(300),
  category: z.string().trim().max(100).default('OUTRO'),
  unit: z.string().trim().max(20).default('UN'),
  minQuantity: z.number().min(0).max(1000000).default(0),
  salePrice: z.number().min(0).max(1000000).optional(),
  isActive: z.boolean().optional()
}).strict()

export const stockAdjustmentSchema = z.object({
  type: z.enum(['ENTRADA', 'SAIDA', 'AJUSTE']),
  quantity: z.number().refine(v => v !== 0, 'Quantidade não pode ser zero.'),
  reason: z.string().trim().max(500).optional()
}).strict()

const purchaseOrderItemSchema = z.object({
  itemId: z.string().trim().min(1).optional(),
  description: z.string().trim().min(2).max(300),
  quantity: z.number().min(0.01).max(1000000),
  unitPrice: z.number().min(0).max(1000000)
}).strict()

export const purchaseOrderSchema = z.object({
  supplierName: z.string().trim().min(2).max(300),
  notes: z.string().trim().max(2000).optional(),
  items: z.array(purchaseOrderItemSchema).min(1).max(200)
}).strict()

const saleItemSchema = z.object({
  itemId: z.string().trim().min(1).optional(),
  description: z.string().trim().min(2).max(300),
  quantity: z.number().min(0.01).max(1000000),
  unitPrice: z.number().min(0).max(1000000)
}).strict()

export const saleSchema = z.object({
  studentId: z.string().trim().min(1).optional(),
  buyerName: z.string().trim().min(2).max(300),
  paymentMethod: z.string().trim().max(50).optional(),
  items: z.array(saleItemSchema).min(1).max(200)
}).strict()
