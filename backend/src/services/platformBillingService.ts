import { randomUUID } from "crypto"
import { prisma } from "../lib/prisma"
import { credit, type CreditKind } from "./creditService"

// Cobranca da PROPRIA WMundi (pacotes de credito e assinatura), com a chave da plataforma.
// Nao confundir com a cobranca que a clinica faz ao paciente (paymentAdapterService).

function asaas() {
  const apiKey = String(process.env.ASAAS_API_KEY || "").trim()
  if (!apiKey) throw new Error("ASAAS_API_KEY nao configurada.")
  const prod = String(process.env.ASAAS_ENV || "SANDBOX").toUpperCase() === "PRODUCTION"
  return {
    base: prod ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3",
    headers: { "Content-Type": "application/json", access_token: apiKey, "User-Agent": "DentalPosOne" },
  }
}

async function call(path: string, init: RequestInit = {}) {
  const { base, headers } = asaas()
  const r = await fetch(`${base}${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } })
  const t = await r.text()
  let d: any
  try { d = t ? JSON.parse(t) : {} } catch { d = { raw: t } }
  if (!r.ok) throw new Error(d?.errors?.[0]?.description || d?.message || `Asaas HTTP ${r.status}`)
  return d
}

const digits = (v: string) => String(v || "").replace(/\D/g, "")

// Um cliente Asaas por clinica, reaproveitado pela referencia externa.
async function ensureCustomer(clinicId: string) {
  const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { id: true, name: true, email: true, phone: true, cnpj: true } })
  if (!clinic) throw new Error("Clinica nao encontrada.")
  const found = await call(`/customers?externalReference=${encodeURIComponent(clinic.id)}`)
  if (found?.data?.[0]?.id) return found.data[0].id as string
  const created = await call("/customers", {
    method: "POST",
    body: JSON.stringify({ name: clinic.name, email: clinic.email, mobilePhone: digits(clinic.phone), cpfCnpj: digits(clinic.cnpj), externalReference: clinic.id }),
  })
  return created.id as string
}

const METODOS: Record<string, string> = { PIX: "PIX", BOLETO: "BOLETO", CARTAO: "CREDIT_CARD" }

export async function createCreditPurchase(input: { clinicId: string; tenantId: string; packageId: string; method: string }) {
  const pkg = await prisma.creditPackage.findFirst({ where: { id: input.packageId, active: true } })
  if (!pkg) throw new Error("Pacote indisponivel.")
  const billingType = METODOS[String(input.method || "PIX").toUpperCase()] || "PIX"

  const purchase = await prisma.creditPurchase.create({
    data: {
      id: randomUUID(),
      clinicId: input.clinicId,
      tenantId: input.tenantId,
      packageId: pkg.id,
      kind: pkg.kind,
      units: pkg.units,
      priceAmount: pkg.priceAmount,
      paymentMethod: billingType,
      status: "PENDENTE",
    },
  })

  const customer = await ensureCustomer(input.clinicId)
  const due = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10)
  const payment = await call("/payments", {
    method: "POST",
    body: JSON.stringify({
      customer,
      billingType,
      value: Number(pkg.priceAmount),
      dueDate: due,
      description: `DentalPos One - ${pkg.name}`,
      externalReference: `credit:${purchase.id}`,
    }),
  })

  let pix: any = null
  if (billingType === "PIX") { try { pix = await call(`/payments/${payment.id}/pixQrCode`) } catch {} }

  await prisma.creditPurchase.update({
    where: { id: purchase.id },
    data: { externalChargeId: payment.id, invoiceUrl: payment.invoiceUrl || null, updatedAt: new Date() },
  })

  return { purchaseId: purchase.id, invoiceUrl: payment.invoiceUrl, pixQrCode: pix?.encodedImage, pixCopyPaste: pix?.payload }
}

// Webhook do Asaas. Credita a carteira uma unica vez por compra (idempotente).
export async function handlePlatformWebhook(body: any) {
  const event = String(body?.event || "")
  const payment = body?.payment || {}
  const ref = String(payment?.externalReference || "")
  if (!ref.startsWith("credit:")) return { handled: false, reason: "NAO_E_CREDITO" }

  const purchase = await prisma.creditPurchase.findFirst({ where: { id: ref.slice(7) } })
  if (!purchase) return { handled: false, reason: "COMPRA_NAO_ENCONTRADA" }

  if (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") {
    if (purchase.status === "PAGA") return { handled: true, repetido: true }
    await credit({
      clinicId: purchase.clinicId,
      tenantId: purchase.tenantId,
      kind: purchase.kind as CreditKind,
      units: Number(purchase.units),
      description: "Compra de pacote de creditos",
      movement: "COMPRA",
      referenceType: "CreditPurchase",
      referenceId: purchase.id,
      idempotencyKey: `purchase:${purchase.id}`,
    })
    await prisma.creditPurchase.update({ where: { id: purchase.id }, data: { status: "PAGA", creditedAt: new Date(), updatedAt: new Date() } })
    return { handled: true }
  }

  if (event === "PAYMENT_DELETED" || event === "PAYMENT_OVERDUE") {
    if (purchase.status === "PENDENTE") await prisma.creditPurchase.update({ where: { id: purchase.id }, data: { status: "CANCELADA", updatedAt: new Date() } })
    return { handled: true }
  }

  return { handled: false, reason: `EVENTO_IGNORADO:${event}` }
}