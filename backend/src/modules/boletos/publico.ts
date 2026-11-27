import { NextFunction, Request, Response, Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { scanUpload } from '../seguranca/uploads'
import { auditar, enderecoEmail, processarEmail, tokenConfere } from './servico'
import { verificarRecorrencias } from './recorrencias'

// Webhook PÚBLICO de entrada de e-mail da Caixa de boletos. Montado em /api/public/edu/boletos.
// Autenticação por segredo POR TENANT: cabeçalho `Authorization: Bearer <token>` (ou `x-boletos-token`); o tenant vai na URL e o
// token só existe em forma de hash no banco (mostrado uma única vez ao gerar/rotacionar). Anexos passam pelo scanUpload (o corpo
// do webhook fica fora do uploadGuard global, como os demais webhooks, por isso a varredura é feita aqui, anexo a anexo).
const router = Router()

const schema = z.object({
  messageId: z.string().max(200).optional(),
  from: z.string().max(300).optional(), to: z.string().max(300).optional(), subject: z.string().max(300).optional(),
  text: z.string().max(100_000).optional(), html: z.string().max(300_000).optional(),
  attachments: z.array(z.object({ filename: z.string().min(1).max(200), contentType: z.string().max(120).optional(), contentBase64: z.string().max(4_000_000) })).max(10).default([]),
})

router.post('/webhook/email/:tenantId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = String(req.params.tenantId)
    const header = String(req.header('authorization') || '')
    const token = header.startsWith('Bearer ') ? header.slice(7) : String(req.header('x-boletos-token') || '')
    const cfg = await prisma.bolConfig.findUnique({ where: { tenantId } })
    // resposta única para tenant inexistente / token errado / canal desligado (não revela qual)
    if (!cfg || !cfg.emailAtivo || !tokenConfere(cfg, token)) return res.status(401).json({ error: 'Não autorizado.' })
    const p = schema.safeParse(req.body)
    if (!p.success) return res.status(400).json({ error: 'Payload inválido: ' + p.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') })
    const d = p.data
    const anexos: Array<{ nome: string; mime?: string; conteudo: Buffer }> = []
    const bloqueados: Array<{ nome: string; motivo: string }> = []
    for (const a of d.attachments) {
      const buf = Buffer.from(a.contentBase64.replace(/^data:[^,]*,/, ''), 'base64')
      const r = await scanUpload({ filename: a.filename, declaredMime: a.contentType, data: buf, contexto: { tenantId, origem: 'POST boletos/webhook/email' } })
      if (!r.ok) bloqueados.push({ nome: a.filename, motivo: `Anexo bloqueado pela varredura de segurança: ${r.motivo || 'tipo não permitido'}` })
      else anexos.push({ nome: a.filename, mime: r.mime || a.contentType, conteudo: buf })
    }
    const r = await processarEmail(tenantId, { messageId: d.messageId, remetente: d.from, destinatario: d.to || enderecoEmail(cfg), assunto: d.subject, texto: d.text, html: d.html, anexos }, { origem: 'WEBHOOK', bloqueados })
    await auditar(tenantId, undefined, 'WEBHOOK_EMAIL', 'BolEmail', r.email.id, { boletos: r.boletos.length, bloqueados: bloqueados.length, duplicado: r.duplicadoEmail })
    try { await verificarRecorrencias(tenantId) } catch { /* melhor esforço */ }
    res.status(r.duplicadoEmail ? 200 : 202).json({ ok: true, emailId: r.email.id, status: r.email.status, boletos: r.boletos.length, duplicado: r.duplicadoEmail, bloqueados: bloqueados.length })
  } catch (e) { next(e) }
})

export default router
