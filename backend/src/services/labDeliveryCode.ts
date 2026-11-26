import { createHmac, timingSafeEqual } from 'crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { writeAudit } from './auditService'

// Código de entrega: gerado por quem RECEBE o serviço (dentista, recepção, gestor ou admin) e entregue ao laboratório,
// que o digita para dar baixa. Contém obrigatoriamente o nome de quem recebeu e a data/hora do recebimento, assinados
// pelo servidor (não dá para forjar nem trocar o nome/horário).
const MAX_AGE_MS = 30 * 24 * 3600 * 1000

function secret() {
  const s = process.env.JWT_SECRET
  if (!s) throw new Error('JWT_SECRET não configurado')
  return s
}
const sign = (clinicId: string, payload: string) => createHmac('sha256', secret()).update(`lab-delivery.${clinicId}.${payload}`).digest('hex').slice(0, 12)

export function formatBrt(d: Date) {
  const b = new Date(d.getTime() - 3 * 3600000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(b.getUTCDate())}/${p(b.getUTCMonth() + 1)}/${b.getUTCFullYear()} ${p(b.getUTCHours())}:${p(b.getUTCMinutes())}`
}

export function createDeliveryCode(clinicId: string, localId: string, receivedBy: string, at = new Date()) {
  const payload = Buffer.from(JSON.stringify({ v: 1, o: localId, n: receivedBy, t: at.toISOString() })).toString('base64url')
  return `${payload}.${sign(clinicId, payload)}`
}

export type DeliveryCodeData = { localId: string; receivedBy: string; receivedAt: Date }

export function parseDeliveryCode(clinicId: string, raw: string): { ok: true; data: DeliveryCodeData } | { ok: false; reason: string } {
  const code = String(raw || '').replace(/\s+/g, '')
  const [payload, sig] = code.split('.')
  if (!payload || !sig) return { ok: false, reason: 'Código de entrega inválido.' }
  const expected = sign(clinicId, payload)
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return { ok: false, reason: 'Código de entrega inválido.' }
  try {
    const o = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { o?: string; n?: string; t?: string }
    const receivedAt = new Date(String(o.t))
    const receivedBy = String(o.n || '').trim()
    if (!o.o || receivedBy.length < 3 || Number.isNaN(receivedAt.getTime())) return { ok: false, reason: 'Código de entrega incompleto.' }
    if (receivedAt.getTime() > Date.now() + 10 * 60000) return { ok: false, reason: 'Código com data no futuro.' }
    if (Date.now() - receivedAt.getTime() > MAX_AGE_MS) return { ok: false, reason: 'Código de entrega expirado (mais de 30 dias). Gere um novo.' }
    return { ok: true, data: { localId: String(o.o), receivedBy, receivedAt } }
  } catch {
    return { ok: false, reason: 'Código de entrega inválido.' }
  }
}

export function deliveryMessage(workType: string, patientName: string, receivedBy: string, receivedAt: Date, code: string) {
  return `Entrega confirmada: ${workType} — ${patientName}.\nRecebido por: ${receivedBy}\nData/hora: ${formatBrt(receivedAt)}\nCódigo de entrega (informe ao laboratório para dar baixa):\n${code}`
}

// Dá baixa na ordem a partir de um código válido. Idempotente.
export async function deliverWithCode(input: { clinicId: string; tenantId: string; actorId: string; localId: string; code: string; via: string }) {
  const parsed = parseDeliveryCode(input.clinicId, input.code)
  if (!parsed.ok) return { ok: false as const, status: 400, error: parsed.reason }
  if (parsed.data.localId !== input.localId) return { ok: false as const, status: 400, error: 'Este código pertence a outro trabalho.' }
  const order = await prisma.labOrder.findUnique({ where: { clinicId_localId: { clinicId: input.clinicId, localId: input.localId } } })
  if (!order || order.tenantId !== input.tenantId || order.deletedAt) return { ok: false as const, status: 404, error: 'Trabalho não encontrado.' }
  if (order.deliveredAt) return { ok: true as const, alreadyDelivered: true as const }
  const now = new Date()
  const prev = (order.data && typeof order.data === 'object' ? order.data : {}) as Record<string, unknown>
  const proof = { receivedBy: parsed.data.receivedBy, receivedAt: parsed.data.receivedAt.toISOString(), confirmedBy: input.actorId, confirmedAt: now.toISOString(), via: input.via }
  const data = { ...prev, status: 'Entregue', updatedAtISO: now.toISOString(), deliveryProof: proof }
  await prisma.labOrder.update({ where: { id: order.id }, data: { status: 'Entregue', deliveredAt: now, data: data as Prisma.InputJsonValue } })
  await prisma.labNotification.updateMany({ where: { clinicId: input.clinicId, workRef: input.localId, status: 'PENDING' }, data: { status: 'CANCELLED', errorMessage: 'Trabalho entregue.' } }).catch(() => undefined)
  await writeAudit({ clinicId: input.clinicId, tenantId: input.tenantId, actorId: input.actorId, module: 'laboratory', action: 'LAB_DELIVERY_CODE', entityType: 'LabOrder', entityId: order.id, beforeData: { status: order.status }, afterData: { status: 'Entregue', receivedBy: proof.receivedBy, receivedAt: proof.receivedAt }, summary: `Baixa com código de entrega: ${order.workType} — ${order.patientName} (recebido por ${proof.receivedBy} em ${formatBrt(parsed.data.receivedAt)}).` }).catch((e: unknown) => console.error(e))
  return { ok: true as const, alreadyDelivered: false as const, proof }
}
