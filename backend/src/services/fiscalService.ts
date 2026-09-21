import { randomUUID } from "crypto"
import { prisma } from "../lib/prisma"
import { decryptSecret } from "./secretVault"
import { dispatchRevah, type RevahChannel } from "./revahProviderService"

// Automacao fiscal real. Origem: lancamentos de receita PAGOS no financeiro.
// Receita Saude nao tem API publica: o protocolo e registrado manualmente.
// NFS-e: emitida fora ou pela conta Asaas da clinica; o numero e registrado aqui.

type Ctx = { clinicId: string; tenantId: string; actorId?: string }
const PENDENTES = ["AGUARDANDO_EMISSAO", "PROGRAMADO", "AGUARDANDO_RECEITA_SAUDE", "FALHA"]
const EMITIDOS = ["EMITIDO", "ENVIADO", "CONCLUIDO"]
const digits = (v?: string | null) => String(v || "").replace(/\D/g, "")

export async function getRule(c: Ctx) {
  const found = await prisma.fiscalRule.findUnique({ where: { clinicId: c.clinicId } })
  if (found) return found
  return prisma.fiscalRule.create({ data: { id: randomUUID(), clinicId: c.clinicId, tenantId: c.tenantId } })
}

export async function saveRule(c: Ctx, body: any) {
  await getRule(c)
  const canais = String(body?.sendChannels || "EMAIL").split(",").map((s) => s.trim().toUpperCase()).filter((s) => ["EMAIL", "WHATSAPP", "SMS", "TELEGRAM"].includes(s))
  return prisma.fiscalRule.update({
    where: { clinicId: c.clinicId },
    data: {
      autoProcess: Boolean(body?.autoProcess),
      issueDelayMinutes: Math.max(0, Math.min(10080, Number(body?.issueDelayMinutes ?? 60))),
      defaultKindPJ: ["NFSE", "RECIBO"].includes(String(body?.defaultKindPJ)) ? String(body.defaultKindPJ) : "NFSE",
      defaultKindPF: ["RECEITA_SAUDE", "RECIBO"].includes(String(body?.defaultKindPF)) ? String(body.defaultKindPF) : "RECEITA_SAUDE",
      sendChannels: (canais.length ? canais : ["EMAIL"]).join(","),
      requireAccountantApproval: Boolean(body?.requireAccountantApproval),
      serviceCode: body?.serviceCode ? String(body.serviceCode) : null,
      issRate: body?.issRate !== undefined && body?.issRate !== null && body?.issRate !== "" ? Number(body.issRate) : null,
      updatedAt: new Date(),
    },
  })
}

async function upsertAlert(c: Ctx, docId: string, code: string, title: string, description: string, priority: string, active: boolean) {
  const found = await prisma.fiscalAlert.findFirst({ where: { fiscalDocumentId: docId, code } })
  if (active && !found) {
    await prisma.fiscalAlert.create({ data: { id: randomUUID(), clinicId: c.clinicId, tenantId: c.tenantId, fiscalDocumentId: docId, code, title, description, priority } })
  } else if (active && found?.resolved) {
    await prisma.fiscalAlert.update({ where: { id: found.id }, data: { resolved: false, resolvedAt: null, resolvedBy: null } })
  } else if (!active && found && !found.resolved) {
    await prisma.fiscalAlert.update({ where: { id: found.id }, data: { resolved: true, resolvedAt: new Date(), resolvedBy: c.actorId || "SISTEMA" } })
  }
}

export async function refreshAlerts(c: Ctx, docId: string) {
  const d = await prisma.fiscalDocument.findFirst({ where: { id: docId, clinicId: c.clinicId } })
  if (!d) return
  const pendente = PENDENTES.includes(d.status)
  const doc = digits(d.payerDocument)
  await upsertAlert(c, d.id, "SEM_DOCUMENTO", "CPF/CNPJ do pagador ausente", `${d.payerName}: o documento fiscal nao pode ser concluido sem CPF ou CNPJ do pagador.`, "CRITICA", pendente && doc.length !== 11 && doc.length !== 14)
  await upsertAlert(c, d.id, "RECEITA_SAUDE", "Receita Saude pendente", `${d.payerName}: pagamento confirmado sem protocolo da Receita Saude registrado.`, "ALTA", d.status === "AGUARDANDO_RECEITA_SAUDE")
  await upsertAlert(c, d.id, "FALHA", "Falha na emissao", `${d.payerName}: ${d.failureReason || "revisar os dados e tentar novamente."}`, "CRITICA", d.status === "FALHA")
  await upsertAlert(c, d.id, "SEM_CONTATO", "Pagador sem e-mail ou telefone", `${d.payerName}: o documento nao podera ser enviado automaticamente.`, "MEDIA", EMITIDOS.includes(d.status) && !d.payerEmail && !d.payerPhone)
}

// Novo processamento: cria um documento fiscal para cada receita paga que ainda nao tem.
export async function syncFromFinance(c: Ctx) {
  const rule = await getRule(c)
  const desde = new Date(Date.now() - 180 * 86400000)
  const pagos = await prisma.financialEntry.findMany({
    where: { clinicId: c.clinicId, tenantId: c.tenantId, type: "INCOME", status: "PAID", paidAt: { gte: desde } },
    orderBy: { paidAt: "desc" },
    take: 500,
  })
  const ja = await prisma.fiscalDocument.findMany({ where: { clinicId: c.clinicId, financialEntryId: { in: pagos.map((p) => p.id) } }, select: { financialEntryId: true } })
  const existentes = new Set(ja.map((j) => j.financialEntryId))
  const clinic = await prisma.clinic.findUnique({ where: { id: c.clinicId }, select: { name: true, cnpj: true } })
  let criados = 0
  for (const e of pagos) {
    if (existentes.has(e.id)) continue
    const pac = e.patientId ? await prisma.patient.findFirst({ where: { id: e.patientId, clinicId: c.clinicId }, select: { fullName: true, cpf: true, email: true, phone: true } }) : null
    const kind = rule.defaultKindPJ
    const agora = new Date()
    const status = kind === "RECEITA_SAUDE" ? "AGUARDANDO_RECEITA_SAUDE" : rule.autoProcess ? "PROGRAMADO" : "AGUARDANDO_EMISSAO"
    const doc = await prisma.fiscalDocument.create({
      data: {
        id: randomUUID(),
        clinicId: c.clinicId,
        tenantId: c.tenantId,
        financialEntryId: e.id,
        patientId: e.patientId || null,
        issuerType: "PJ",
        issuerName: clinic?.name || null,
        issuerDocument: clinic?.cnpj || null,
        payerName: pac?.fullName || e.personName || "Pagador",
        payerDocument: pac?.cpf || null,
        payerEmail: pac?.email || null,
        payerPhone: pac?.phone || null,
        description: e.description,
        amount: Number(e.netAmount ?? e.amount),
        competence: (e.competenceDate || e.paidAt || agora).toISOString().slice(0, 7),
        paymentDate: e.paidAt || agora,
        paymentMethod: e.paymentMethod || null,
        kind,
        status,
        scheduledAt: status === "PROGRAMADO" ? new Date(agora.getTime() + rule.issueDelayMinutes * 60000) : null,
      },
    })
    await refreshAlerts(c, doc.id)
    criados++
  }
  return { encontrados: pagos.length, criados }
}

export async function summary(c: Ctx) {
  const [confirmados, pendentes, emitidos, falhasEnvio, valorPendente] = await Promise.all([
    prisma.fiscalDocument.count({ where: { clinicId: c.clinicId, status: { not: "CANCELADO" } } }),
    prisma.fiscalDocument.count({ where: { clinicId: c.clinicId, status: { in: PENDENTES } } }),
    prisma.fiscalDocument.count({ where: { clinicId: c.clinicId, status: { in: EMITIDOS } } }),
    prisma.fiscalSendRecord.count({ where: { clinicId: c.clinicId, status: "FALHOU" } }),
    prisma.fiscalDocument.aggregate({ where: { clinicId: c.clinicId, status: { in: PENDENTES } }, _sum: { amount: true } }),
  ])
  return { confirmedPayments: confirmados, pendingDocuments: pendentes, issuedDocuments: emitidos, deliveryFailures: falhasEnvio, pendingTaxValue: Number(valorPendente._sum.amount || 0) }
}

export async function updateDocument(c: Ctx, id: string, body: any) {
  const d = await prisma.fiscalDocument.findFirst({ where: { id, clinicId: c.clinicId } })
  if (!d) throw new Error("Documento nao encontrado.")
  const kind = ["NFSE", "RECEITA_SAUDE", "RECIBO"].includes(String(body?.kind)) ? String(body.kind) : d.kind
  const issuerType = ["PJ", "PF"].includes(String(body?.issuerType)) ? String(body.issuerType) : d.issuerType
  let status = d.status
  if (PENDENTES.includes(d.status)) status = kind === "RECEITA_SAUDE" ? "AGUARDANDO_RECEITA_SAUDE" : "AGUARDANDO_EMISSAO"
  await prisma.fiscalDocument.update({
    where: { id },
    data: {
      kind, issuerType, status,
      payerName: body?.payerName ? String(body.payerName) : d.payerName,
      payerDocument: body?.payerDocument !== undefined ? digits(body.payerDocument) || null : d.payerDocument,
      payerEmail: body?.payerEmail !== undefined ? String(body.payerEmail).trim() || null : d.payerEmail,
      payerPhone: body?.payerPhone !== undefined ? digits(body.payerPhone) || null : d.payerPhone,
      notes: body?.notes !== undefined ? String(body.notes) : d.notes,
      failureReason: status === "FALHA" ? d.failureReason : null,
      updatedAt: new Date(),
    },
  })
  await refreshAlerts(c, id)
  return prisma.fiscalDocument.findFirst({ where: { id } })
}

// Registra a emissao (NFS-e emitida, protocolo da Receita Saude ou recibo) e envia ao pagador.
export async function registerIssue(c: Ctx, id: string, body: any) {
  const d = await prisma.fiscalDocument.findFirst({ where: { id, clinicId: c.clinicId } })
  if (!d) throw new Error("Documento nao encontrado.")
  const numero = String(body?.documentNumber || "").trim()
  const protocolo = String(body?.protocolNumber || "").trim()
  if (!numero && !protocolo) throw new Error("Informe o numero do documento ou o protocolo.")
  const doc = digits(d.payerDocument)
  if (d.kind !== "RECIBO" && doc.length !== 11 && doc.length !== 14) throw new Error("Informe o CPF ou CNPJ do pagador antes de registrar a emissao.")
  await prisma.fiscalDocument.update({
    where: { id },
    data: { status: "EMITIDO", issuedAt: new Date(), documentNumber: numero || null, protocolNumber: protocolo || null, documentUrl: body?.documentUrl ? String(body.documentUrl) : d.documentUrl, failureReason: null, updatedAt: new Date() },
  })
  await refreshAlerts(c, id)
  const envio = body?.send === false ? null : await sendDocument(c, id)
  return { ok: true, envio }
}

async function senderFor(c: Ctx, channel: string) {
  return prisma.revahSender.findFirst({ where: { clinicId: c.clinicId, tenantId: c.tenantId, channel, isActive: true, isDefault: true } })
}

export async function sendDocument(c: Ctx, id: string) {
  const d = await prisma.fiscalDocument.findFirst({ where: { id, clinicId: c.clinicId } })
  if (!d) throw new Error("Documento nao encontrado.")
  if (!EMITIDOS.includes(d.status)) throw new Error("O documento precisa estar emitido antes do envio.")
  const rule = await getRule(c)
  const nomes: Record<string, string> = { NFSE: "Nota fiscal de servico", RECEITA_SAUDE: "Recibo Receita Saude", RECIBO: "Recibo" }
  const texto = [
    `Ola, ${d.payerName}.`,
    `Segue o seu documento fiscal: ${nomes[d.kind] || "Documento"}${d.documentNumber ? ` n. ${d.documentNumber}` : ""}${d.protocolNumber ? ` (protocolo ${d.protocolNumber})` : ""}.`,
    `Valor: R$ ${Number(d.amount).toFixed(2).replace(".", ",")}.`,
    d.documentUrl ? `Acesse: ${d.documentUrl}` : "",
    d.issuerName ? `Emitido por ${d.issuerName}.` : "",
  ].filter(Boolean).join("\n")
  const resultados: any[] = []
  for (const canal of rule.sendChannels.split(",")) {
    const destino = canal === "EMAIL" ? d.payerEmail : canal === "TELEGRAM" ? null : d.payerPhone
    const base = { id: randomUUID(), clinicId: c.clinicId, tenantId: c.tenantId, fiscalDocumentId: d.id, channel: canal, recipientName: d.payerName }
    if (!destino) {
      resultados.push(await prisma.fiscalSendRecord.create({ data: { ...base, destination: "-", status: "NAO_ENVIADO", failureReason: "Pagador sem contato cadastrado para este canal." } }))
      continue
    }
    try {
      const sender = await senderFor(c, canal)
      let creds: any = sender ? decryptSecret<any>(sender.encryptedCredentials) || {} : null
      let remetente = sender?.address
      // E-mail de documento fiscal nao pode depender de canal configurado: usa a conta da plataforma.
      if (!creds && canal === "EMAIL" && process.env.RESEND_API_KEY) { creds = { apiKey: process.env.RESEND_API_KEY }; remetente = `${d.issuerName || "DentalPos One"} <contato@dentalpos.com.br>` }
      if (!creds) throw new Error(`Canal ${canal} nao configurado em Canais de Envio.`)
      const r = await dispatchRevah(canal as RevahChannel, destino, texto, { ...creds, subject: `${nomes[d.kind] || "Documento fiscal"} - ${d.issuerName || "DentalPos One"}` }, remetente)
      resultados.push(await prisma.fiscalSendRecord.create({ data: { ...base, destination: destino, status: r.simulated ? "NAO_ENVIADO" : "ENVIADO", sentAt: new Date(), providerMessageId: r.providerMessageId || null, failureReason: r.simulated ? "Envio simulado: canal sem credenciais." : null } }))
    } catch (erro) {
      resultados.push(await prisma.fiscalSendRecord.create({ data: { ...base, destination: destino, status: "FALHOU", failureReason: erro instanceof Error ? erro.message : "Falha no envio." } }))
    }
  }
  if (resultados.some((r) => r.status === "ENVIADO")) await prisma.fiscalDocument.update({ where: { id: d.id }, data: { status: "ENVIADO", updatedAt: new Date() } })
  await refreshAlerts(c, d.id)
  return resultados
}

export async function concludeDocument(c: Ctx, id: string) {
  const d = await prisma.fiscalDocument.findFirst({ where: { id, clinicId: c.clinicId } })
  if (!d) throw new Error("Documento nao encontrado.")
  if (!EMITIDOS.includes(d.status)) throw new Error("So e possivel concluir um documento emitido.")
  await prisma.fiscalDocument.update({ where: { id }, data: { status: "CONCLUIDO", updatedAt: new Date() } })
  await refreshAlerts(c, id)
  return { ok: true }
}

// Processar pendencias: importa pagamentos novos, libera programados vencidos,
// reenvia emitidos que nao foram entregues e recalcula todos os alertas.
export async function processPending(c: Ctx) {
  const sync = await syncFromFinance(c)
  const agora = new Date()
  const liberados = await prisma.fiscalDocument.updateMany({ where: { clinicId: c.clinicId, status: "PROGRAMADO", scheduledAt: { lte: agora } }, data: { status: "AGUARDANDO_EMISSAO", updatedAt: agora } })
  const emitidos = await prisma.fiscalDocument.findMany({ where: { clinicId: c.clinicId, status: "EMITIDO" }, select: { id: true }, take: 100 })
  let enviados = 0
  for (const e of emitidos) { const r = await sendDocument(c, e.id); if (r.some((x: any) => x.status === "ENVIADO")) enviados++ }
  const todos = await prisma.fiscalDocument.findMany({ where: { clinicId: c.clinicId, status: { not: "CANCELADO" } }, select: { id: true }, take: 500 })
  for (const t of todos) await refreshAlerts(c, t.id)
  const aguardando = await prisma.fiscalDocument.count({ where: { clinicId: c.clinicId, status: { in: PENDENTES } } })
  return { importados: sync.criados, liberados: liberados.count, enviados, aguardandoEmissao: aguardando }
}