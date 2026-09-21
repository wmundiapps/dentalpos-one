import { Response } from "express"
import { AuthRequest } from "../middleware/auth"
import { prisma } from "../lib/prisma"
import * as fiscal from "../services/fiscalService"

const ctx = (req: AuthRequest) => ({ clinicId: req.user!.clinicId, tenantId: req.user!.tenantId, actorId: req.user!.id })

function falha(res: Response, error: unknown, msg: string) {
  console.error(error)
  const texto = error instanceof Error ? error.message : msg
  return res.status(400).json({ error: texto || msg })
}

export async function summary(req: AuthRequest, res: Response) {
  try { return res.json(await fiscal.summary(ctx(req))) } catch (e) { return falha(res, e, "Erro ao carregar o resumo fiscal.") }
}

// Lista com filtro por status, para os numeros do resumo levarem a origem.
export async function documents(req: AuthRequest, res: Response) {
  try {
    const c = ctx(req)
    const grupo = String(req.query.grupo || "").toUpperCase()
    const grupos: Record<string, string[]> = {
      PENDENTES: ["AGUARDANDO_EMISSAO", "PROGRAMADO", "AGUARDANDO_RECEITA_SAUDE", "FALHA"],
      EMITIDOS: ["EMITIDO", "ENVIADO", "CONCLUIDO"],
    }
    const status = grupos[grupo]
    const rows = await prisma.fiscalDocument.findMany({
      where: { clinicId: c.clinicId, ...(status ? { status: { in: status } } : { status: { not: "CANCELADO" } }) },
      orderBy: { paymentDate: "desc" },
      take: 300,
    })
    return res.json(rows.map((r) => ({ ...r, amount: Number(r.amount) })))
  } catch (e) { return falha(res, e, "Erro ao carregar os documentos.") }
}

export async function alerts(req: AuthRequest, res: Response) {
  try {
    const c = ctx(req)
    const rows = await prisma.fiscalAlert.findMany({ where: { clinicId: c.clinicId }, orderBy: [{ resolved: "asc" }, { createdAt: "desc" }], take: 100 })
    return res.json(rows)
  } catch (e) { return falha(res, e, "Erro ao carregar os alertas.") }
}

export async function sends(req: AuthRequest, res: Response) {
  try {
    const c = ctx(req)
    const somenteFalhas = String(req.query.status || "").toUpperCase() === "FALHOU"
    const rows = await prisma.fiscalSendRecord.findMany({ where: { clinicId: c.clinicId, ...(somenteFalhas ? { status: "FALHOU" } : {}) }, orderBy: { createdAt: "desc" }, take: 100 })
    return res.json(rows)
  } catch (e) { return falha(res, e, "Erro ao carregar o historico de envios.") }
}

export async function sync(req: AuthRequest, res: Response) {
  try { return res.json(await fiscal.syncFromFinance(ctx(req))) } catch (e) { return falha(res, e, "Erro ao processar os pagamentos.") }
}

export async function processAll(req: AuthRequest, res: Response) {
  try { return res.json(await fiscal.processPending(ctx(req))) } catch (e) { return falha(res, e, "Erro ao processar as pendencias.") }
}

export async function update(req: AuthRequest, res: Response) {
  try { return res.json(await fiscal.updateDocument(ctx(req), String(req.params.id), req.body)) } catch (e) { return falha(res, e, "Erro ao atualizar o documento.") }
}

export async function issue(req: AuthRequest, res: Response) {
  try { return res.json(await fiscal.registerIssue(ctx(req), String(req.params.id), req.body)) } catch (e) { return falha(res, e, "Erro ao registrar a emissao.") }
}

export async function send(req: AuthRequest, res: Response) {
  try { return res.json(await fiscal.sendDocument(ctx(req), String(req.params.id))) } catch (e) { return falha(res, e, "Erro ao enviar o documento.") }
}

export async function conclude(req: AuthRequest, res: Response) {
  try { return res.json(await fiscal.concludeDocument(ctx(req), String(req.params.id))) } catch (e) { return falha(res, e, "Erro ao concluir o documento.") }
}

export async function getRules(req: AuthRequest, res: Response) {
  try { const r = await fiscal.getRule(ctx(req)); return res.json({ ...r, issRate: r.issRate === null ? null : Number(r.issRate) }) } catch (e) { return falha(res, e, "Erro ao carregar as regras.") }
}

export async function saveRules(req: AuthRequest, res: Response) {
  try { const r = await fiscal.saveRule(ctx(req), req.body); return res.json({ ...r, issRate: r.issRate === null ? null : Number(r.issRate) }) } catch (e) { return falha(res, e, "Erro ao salvar as regras.") }
}