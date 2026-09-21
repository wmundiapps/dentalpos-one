import { Request, Response } from "express"
import { AuthRequest } from "../middleware/auth"
import { prisma } from "../lib/prisma"
import { createCreditPurchase, handlePlatformWebhook } from "../services/platformBillingService"

const ctx = (req: AuthRequest) => ({ clinicId: req.user!.clinicId, tenantId: req.user!.tenantId })

export async function packages(req: AuthRequest, res: Response) {
  try {
    const kind = req.query.kind ? String(req.query.kind).toUpperCase() : undefined
    const rows = await prisma.creditPackage.findMany({
      where: { active: true, ...(kind ? { kind } : {}) },
      orderBy: [{ kind: "asc" }, { sortOrder: "asc" }],
    })
    return res.json(rows.map((r) => ({ ...r, units: Number(r.units), priceAmount: Number(r.priceAmount) })))
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: "Erro ao carregar os pacotes." })
  }
}

export async function purchase(req: AuthRequest, res: Response) {
  try {
    const c = ctx(req)
    const packageId = String(req.body?.packageId || "")
    const method = String(req.body?.method || "PIX")
    if (!packageId) return res.status(400).json({ error: "Escolha um pacote." })
    const r = await createCreditPurchase({ ...c, packageId, method })
    return res.status(201).json(r)
  } catch (error) {
    console.error(error)
    return res.status(502).json({ error: error instanceof Error ? error.message : "Nao foi possivel gerar a cobranca." })
  }
}

export async function purchases(req: AuthRequest, res: Response) {
  try {
    const c = ctx(req)
    const rows = await prisma.creditPurchase.findMany({ where: c, orderBy: { createdAt: "desc" }, take: 50 })
    return res.json(rows.map((r) => ({ ...r, units: Number(r.units), priceAmount: Number(r.priceAmount) })))
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: "Erro ao carregar as compras." })
  }
}

// Publico. Protegido pelo token que o Asaas envia no cabecalho asaas-access-token.
export async function webhook(req: Request, res: Response) {
  const esperado = String(process.env.ASAAS_WEBHOOK_TOKEN || "").trim()
  const recebido = String(req.get("asaas-access-token") || "").trim()
  if (esperado && recebido !== esperado) return res.status(401).json({ error: "Token invalido." })
  try {
    const r = await handlePlatformWebhook(req.body)
    return res.json(r)
  } catch (error) {
    console.error("Erro no webhook da plataforma:", error)
    return res.status(500).json({ error: "Erro ao processar o evento." })
  }
}