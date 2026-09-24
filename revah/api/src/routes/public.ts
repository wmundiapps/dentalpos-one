import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { verifyPayload } from '../lib/crypto'
import { ah } from '../lib/errors'
import { isChannel } from '../lib/normalize'
import { suppress } from '../services/suppression'

const r = Router()

function page(title: string, body: string) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font-family:system-ui,Arial,sans-serif;background:#f5f5f7;color:#1d1d1f;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:16px}main{background:#fff;border-radius:16px;padding:32px;max-width:420px;box-shadow:0 8px 30px rgba(0,0,0,.06)}button{background:#4f46e5;color:#fff;border:0;border-radius:10px;padding:12px 20px;font-size:15px;cursor:pointer}</style></head><body><main>${body}</main></body></html>`
}

// Descadastro de e-mail (link presente em todo e-mail enviado).
r.get('/public/unsubscribe/:token', (req, res) => {
  const data = verifyPayload<{ t: string; c: string; v: string }>(req.params.token)
  if (!data) return res.status(400).send(page('Link inválido', '<h2>Link inválido</h2><p>Este link de descadastro não é válido.</p>'))
  res.send(
    page(
      'Descadastrar',
      `<h2>Não quer mais receber?</h2><p>Confirme para parar de receber mensagens automáticas em <b>${data.v.replace(/[<>&"]/g, '')}</b>.</p><form method="post"><button type="submit">Confirmar descadastro</button></form>`,
    ),
  )
})

const unsubscribe = ah(async (req, res) => {
  const data = verifyPayload<{ t: string; c: string; v: string }>(req.params.token)
  if (!data || !isChannel(data.c)) return res.status(400).send(page('Link inválido', '<h2>Link inválido</h2>'))
  const contact = await prisma.contact.findFirst({ where: { tenantId: data.t, email: data.v } })
  await suppress(data.t, data.c, data.v, 'UNSUBSCRIBE_LINK', { contactId: contact?.id, detail: 'Link de descadastro' })
  res.send(page('Pronto', '<h2>Pronto!</h2><p>Você não receberá mais mensagens automáticas por este canal.</p>'))
})
r.post('/public/unsubscribe/:token', unsubscribe)

r.get('/health', ah(async (_req, res) => {
  let db = 'ok'
  try {
    await prisma.$queryRaw`SELECT 1`
  } catch {
    db = 'erro'
  }
  res.status(db === 'ok' ? 200 : 503).json({ service: 'revah-api', status: db === 'ok' ? 'ok' : 'degradado', db, time: new Date().toISOString() })
}))

export default r
