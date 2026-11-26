// Páginas públicas do convite do REVAH Leads: o clique no número da planilha e o "não quero receber".
import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { prisma } from '../lib/prisma'
import { ah } from '../lib/errors'
import { optOutLeads } from '../services/leads'
import { openInvite } from '../services/leads/invites'

const r = Router()
r.use('/c', rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false }))

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

function page(title: string, body: string) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(title)}</title><style>body{font-family:system-ui,sans-serif;background:#07110c;color:#e7efe9;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px}
main{max-width:440px;background:#0d1a13;border:1px solid #1f3a2b;border-radius:16px;padding:28px}h1{font-size:20px;margin:0 0 12px;color:#5fd19a}p{line-height:1.5;color:#b9c9be}
button{background:#3aa676;color:#fff;border:0;border-radius:999px;padding:12px 22px;font-size:15px;cursor:pointer}</style></head><body><main>${body}</main></body></html>`
}

r.get(
  '/c/w/:token',
  ah(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Referrer-Policy', 'no-referrer')
    const out = await openInvite(String(req.params.token))
    if (out.ok) return res.redirect(302, out.url)
    res.status(409).send(page(out.title, `<h1>${esc(out.title)}</h1><p>${esc(out.message)}</p>`))
  }),
)

async function leadByToken(token: string) {
  return /^[0-9a-f]{32}$/.test(token) ? prisma.lead.findUnique({ where: { inviteToken: token }, include: { tenant: true } }) : null
}

r.get(
  '/c/sair/:token',
  ah(async (req, res) => {
    const lead = await leadByToken(String(req.params.token))
    if (!lead) return res.status(404).send(page('Link inválido', '<h1>Link inválido</h1><p>Este link não existe mais.</p>'))
    if (lead.status === 'OPTED_OUT') return res.send(page('Pronto', `<h1>Pronto</h1><p>Você não vai receber mais mensagens de ${esc(lead.tenant.name)}.</p>`))
    res.send(
      page(
        'Não quero receber',
        `<h1>Não quero receber</h1><p>Confirme para não receber mais mensagens de <strong>${esc(lead.tenant.name)}</strong>.</p><form method="post"><button type="submit">Confirmar</button></form>`,
      ),
    )
  }),
)

// Também atende o "cancelar inscrição" de um clique (List-Unsubscribe-Post, RFC 8058).
r.post(
  '/c/sair/:token',
  ah(async (req, res) => {
    const lead = await leadByToken(String(req.params.token))
    if (!lead) return res.status(404).send(page('Link inválido', '<h1>Link inválido</h1><p>Este link não existe mais.</p>'))
    if (lead.status !== 'OPTED_OUT') {
      await optOutLeads(lead.tenant, [lead.id])
      await prisma.auditLog.create({ data: { tenantId: lead.tenantId, action: 'LEADS_OPT_OUT', entity: 'Lead', entityId: lead.id, data: { by: 'link' } } })
    }
    res.send(page('Pronto', `<h1>Pronto</h1><p>Você não vai receber mais mensagens de ${esc(lead.tenant.name)}.</p>`))
  }),
)

export default r
