// Tipos de registro editáveis pela tela (CRUD genérico) e suas regras de validação.
// Tipos controlados pelo servidor (order, payment, cashback, stockMove, invoice, appointment) têm rotas próprias.
import { z } from 'zod';
import { isoDate, money, normalizePlate, text, uuid, validPlate } from './validators.js';

const catKey = z.enum(['carro', 'suv', 'utilitario', 'van', 'caminhao']);
const prices = z.object({ carro: money, suv: money, utilitario: money, van: money, caminhao: money });

export const categorySchema = z.object({ key: catKey, name: text(40).pipe(z.string().min(1)), order: z.number().int().min(1).max(20), active: z.boolean().default(true) });

export const serviceSchema = z.object({
  name: text(80).pipe(z.string().min(2)),
  group: z.enum(['lavagem', 'estetica', 'protecao', 'filme', 'outro']).default('outro'),
  description: text(300).default(''),
  durationMin: z.number().int().min(5).max(600).default(30),
  prices,                                   // valor por categoria de veículo
  recipe: z.array(z.object({ itemId: uuid, qty: z.number().min(0).max(100000) })).max(30).default([]), // consumo de estoque
  otherCostCents: money.default(0),         // mão de obra/energia/água diretas por serviço (para precificação)
  active: z.boolean().default(true),
});

export const checklistItemSchema = z.object({
  name: text(60).pipe(z.string().min(2)),
  area: z.enum(['exterior', 'interior', 'pertences', 'mecanica']),
  order: z.number().int().min(0).max(1000).default(0),
  active: z.boolean().default(true),
});

export const customerSchema = z.object({
  name: text(120).pipe(z.string().min(2)),
  whatsapp: text(20).default(''),
  email: z.string().email().max(160).transform((s) => s.toLowerCase()).or(z.literal('')).default(''),
  cpf: z.string().max(20).default(''),      // cifrado antes de gravar
  notes: text(500).default(''),
  consentMarketing: z.boolean().default(false), // LGPD: lembretes e ofertas só com consentimento
  cashbackOptIn: z.boolean().default(false),
  lastWashAt: z.string().optional(),
});

export const vehicleSchema = z.object({
  customerId: uuid,
  plate: text(10).transform(normalizePlate).refine(validPlate, 'placa inválida'),
  brand: text(40).pipe(z.string().min(1)),
  model: text(60).pipe(z.string().min(1)),
  year: z.number().int().min(1950).max(new Date().getFullYear() + 2),
  color: text(30).default(''),
  categoryKey: catKey,
});

export const planSchema = z.object({
  name: text(80).pipe(z.string().min(2)),
  frequency: z.enum(['semanal', 'quinzenal', 'trisemanal', 'mensal']),
  serviceIds: z.array(uuid).min(1).max(10),
  prices,                                   // mensalidade por categoria
  active: z.boolean().default(true),
});

export const supplierSchema = z.object({
  name: text(120).pipe(z.string().min(2)),
  cnpj: text(20).default(''), phone: text(20).default(''), email: z.string().email().max(160).or(z.literal('')).default(''),
  contact: text(80).default(''), products: text(300).default(''), notes: text(500).default(''),
});

export const stockItemSchema = z.object({
  name: text(100).pipe(z.string().min(2)),
  unit: z.enum(['un', 'L', 'mL', 'kg', 'g', 'm', 'pç']).default('un'),
  qty: z.number().min(0).max(1_000_000).default(0),
  minQty: z.number().min(0).max(1_000_000).default(0),
  costCents: money.default(0),              // custo por unidade
  supplierId: uuid.optional(),
});

export const expenseSchema = z.object({
  description: text(120).pipe(z.string().min(2)),
  kind: z.enum(['fixa', 'variavel']),
  category: z.enum(['aluguel', 'salarios', 'energia', 'agua', 'impostos', 'marketing', 'manutencao', 'materiais', 'outros']).default('outros'),
  amountCents: money,
  dueDate: isoDate,
  paid: z.boolean().default(false),
  paidAt: isoDate.optional(),
  recurring: z.enum(['nenhuma', 'mensal']).default('nenhuma'),
  supplierId: uuid.optional(),
});

export const complianceSchema = z.object({
  title: text(120).pipe(z.string().min(2)),
  type: z.enum(['licenca_ambiental', 'alvara', 'bombeiros', 'aluguel', 'contrato', 'seguro', 'outorga_agua', 'outro']),
  dueDate: isoDate,
  alertDays: z.number().int().min(0).max(365).default(30),
  recurrenceMonths: z.number().int().min(0).max(120).default(0), // 0 = não repete
  notes: text(500).default(''),
  done: z.boolean().default(false),
});

export const subscriptionSchema = z.object({
  customerId: uuid, vehicleId: uuid, planId: uuid,
  status: z.enum(['ativa', 'pausada', 'cancelada', 'inadimplente']).default('ativa'),
});

export interface KindDef { schema: z.ZodObject<any>; label: string }
export const KINDS: Record<string, KindDef> = {
  category: { schema: categorySchema, label: 'categoria' },
  service: { schema: serviceSchema, label: 'serviço' },
  checklistItem: { schema: checklistItemSchema, label: 'item do checklist' },
  customer: { schema: customerSchema, label: 'cliente' },
  vehicle: { schema: vehicleSchema, label: 'veículo' },
  plan: { schema: planSchema, label: 'plano' },
  supplier: { schema: supplierSchema, label: 'fornecedor' },
  stockItem: { schema: stockItemSchema, label: 'item de estoque' },
  expense: { schema: expenseSchema, label: 'despesa' },
  compliance: { schema: complianceSchema, label: 'lembrete' },
};
