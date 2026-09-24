// Fluxos ponta a ponta contra um Postgres real (DATABASE_URL de teste).
process.env.NODE_ENV = 'test'
process.env.DENTALPOS_SHARED_SECRET = 'segredo-dentalpos-teste'
process.env.STRIPE_PRICE_START = 'price_start_test'
process.env.STRIPE_PRICE_PRO = 'price_pro_test'
process.env.STRIPE_PRICE_LEADS = 'price_leads_test'
process.env.ANTHROPIC_API_KEY = ''
process.env.REVAH_SUPERADMIN_EMAILS = 'admin@wmundi.com'
process.env.CAMPAIGN_THROTTLE_MS = '0'
process.env.ASAAS_API_KEY = 'asaas-test'
process.env.ASAAS_BASE_URL = 'http://asaas.mock/v3'
process.env.ASAAS_WEBHOOK_TOKEN = 'asaas-webhook-token'

// Asaas simulado (sem rede).
const realFetch = globalThis.fetch
const asaasCalls: { url: string; body: any }[] = []
globalThis.fetch = (async (input: any, init: any = {}) => {
  const url = String(input)
  if (!url.startsWith('http://asaas.mock')) return realFetch(input, init)
  const body = init.body ? JSON.parse(init.body) : null
  asaasCalls.push({ url, body })
  const json = (d: unknown) => new Response(JSON.stringify(d), { status: 200, headers: { 'Content-Type': 'application/json' } })
  if (url.endsWith('/customers')) return json({ id: 'cus_asaas_1' })
  if (url.endsWith('/subscriptions')) return json({ id: `sub_asaas_${asaasCalls.length}` })
  if (url.includes('/payments')) return json({ data: [{ invoiceUrl: 'https://asaas.mock/fatura', status: 'PENDING' }] })
  return json({ deleted: true })
}) as typeof fetch

import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'

let app: any
let prisma: any
let processDueJobs: any

before(async () => {
  app = (await import('../src/app')).default
  prisma = (await import('../src/lib/prisma')).prisma
  processDueJobs = (await import('../src/services/jobs')).processDueJobs
})

async function register(email: string, extra: Record<string, unknown> = {}) {
  const res = await request(app).post('/auth/register').send({ name: 'Dono', email, password: 'senha-forte-1', company: 'Empresa ' + email, ...extra })
  assert.equal(res.status, 201, JSON.stringify(res.body))
  return res.body as { token: string; tenant: { id: string } }
}

const auth = (t: string) => ({ Authorization: `Bearer ${t}` })

async function simulatedZapi(token: string) {
  const denied = await request(app).post('/channels').set(auth(token)).send({ channel: 'WHATSAPP', provider: 'ZAPI', label: 'Zap', address: '44999990000', credentials: { simulated: true } })
  assert.equal(denied.status, 400, 'provedor não oficial exige aceite de risco')
  const ok = await request(app)
    .post('/channels')
    .set(auth(token))
    .send({ channel: 'WHATSAPP', provider: 'ZAPI', label: 'Zap', address: '44999990000', credentials: { simulated: true }, acknowledgeRisk: true })
  assert.equal(ok.status, 201, JSON.stringify(ok.body))
  return ok.body.account
}

const manual = (n: number, offset = 0) => Array.from({ length: n }, (_, i) => ({ name: `Pessoa ${i + offset}`, destination: `4498${String(1000000 + i + offset).padStart(7, '0')}` }))

test('teste de 14 dias: forma de pagamento (Asaas), 20 contatos por campanha, cobrança e atraso', async () => {
  const { token, tenant } = await register('trial@revah.test', { phone: '44911112222' })
  await simulatedZapi(token)

  const c0 = await request(app).post('/campaigns').set(auth(token)).send({ name: 'Antes', channel: 'WHATSAPP', template: 'Oi', audience: { manual: manual(2) } })
  const blocked0 = await request(app).post(`/campaigns/${c0.body.id}/launch`).set(auth(token))
  assert.equal(blocked0.status, 402)
  assert.equal(blocked0.body.code, 'PAYMENT_METHOD_REQUIRED')

  const noDoc = await request(app).post('/billing/checkout').set(auth(token)).send({ plan: 'START', provider: 'ASAAS' })
  assert.equal(noDoc.status, 400)
  const co = await request(app).post('/billing/checkout').set(auth(token)).send({ plan: 'START', provider: 'ASAAS', cpfCnpj: '123.456.789-09' })
  assert.equal(co.status, 200, JSON.stringify(co.body))
  const subCall = asaasCalls.find((c) => c.url.endsWith('/subscriptions'))!
  assert.equal(subCall.body.value, 247)
  assert.equal(subCall.body.billingType, 'UNDEFINED')
  const t1 = await prisma.tenant.findUnique({ where: { id: tenant.id } })
  assert.equal(t1.status, 'TRIAL')
  assert.equal(t1.plan, 'START')
  assert.ok(Math.abs(t1.trialEndsAt.getTime() - Date.now() - 14 * 86_400_000) < 60_000)

  const big = await request(app).post('/campaigns').set(auth(token)).send({ name: 'Grande', channel: 'WHATSAPP', template: 'Oi {{primeiro_nome}}', audience: { manual: manual(21) } })
  const tooMany = await request(app).post(`/campaigns/${big.body.id}/launch`).set(auth(token))
  assert.equal(tooMany.status, 402)
  assert.equal(tooMany.body.code, 'TRIAL_RECIPIENT_LIMIT')
  for (let k = 0; k < 3; k++) {
    const c = await request(app).post('/campaigns').set(auth(token)).send({ name: `C${k}`, channel: 'WHATSAPP', template: 'Oi {{primeiro_nome}}', audience: { manual: manual(20, k * 100) } })
    const l = await request(app).post(`/campaigns/${c.body.id}/launch`).set(auth(token))
    assert.equal(l.status, 200, JSON.stringify(l.body))
  }
  await processDueJobs({ maxMs: 20_000 })
  const msgs = await prisma.message.findMany({ where: { tenantId: tenant.id, direction: 'OUT' } })
  assert.equal(msgs.length, 60)
  assert.ok(msgs.every((m: any) => m.status === 'SIMULATED'))

  // START: CSV é recurso do PRO.
  const csv = await request(app).post('/contacts/import').set(auth(token)).send({ csv: 'nome,telefone\nA,44999990001' })
  assert.equal(csv.status, 402)

  // Webhooks do Asaas: pagamento confirmado -> ativo; atraso -> bloqueia.
  const subId = (await prisma.subscription.findUnique({ where: { tenantId: tenant.id } })).asaasSubscriptionId
  const denied = await request(app).post('/webhooks/asaas').send({ id: 'e0', event: 'PAYMENT_CONFIRMED', payment: { subscription: subId } })
  assert.equal(denied.status, 401)
  await request(app).post('/webhooks/asaas').set('asaas-access-token', 'asaas-webhook-token').send({ id: 'e1', event: 'PAYMENT_CONFIRMED', payment: { subscription: subId, dueDate: '2026-10-08' } })
  assert.equal((await prisma.tenant.findUnique({ where: { id: tenant.id } })).status, 'ACTIVE')
  await request(app).post('/webhooks/asaas').set('asaas-access-token', 'asaas-webhook-token').send({ id: 'e2', event: 'PAYMENT_OVERDUE', payment: { subscription: subId } })
  assert.equal((await prisma.tenant.findUnique({ where: { id: tenant.id } })).status, 'PAST_DUE')

  // Mesmo telefone não ganha novos 14 dias.
  const again = await register('trial2@revah.test', { phone: '(44) 91111-2222' })
  const st = await request(app).get('/trial/status').set(auth(again.token))
  assert.equal(st.body.trialAvailable, false)
  assert.equal(st.body.paymentMethodRequired, true)
})

async function activate(tenantId: string, plan = 'PRO') {
  await prisma.tenant.update({ where: { id: tenantId }, data: { plan, status: 'ACTIVE' } })
}

test('inbound: opt-out vai para a suppression list, bot atende e registra pedido de agendamento', async () => {
  const { token, tenant } = await register('inbox@revah.test')
  const account = await simulatedZapi(token)
  const full = await prisma.channelAccount.findUnique({ where: { id: account.id } })
  const url = `/webhooks/zapi/${full.id}/${full.webhookSecret}`

  const r1 = await request(app).post(url).send({ phone: '5544977776666', senderName: 'Carla', text: { message: 'Oi, quero agendar uma consulta' }, messageId: 'm1' })
  assert.equal(r1.status, 200)
  const note = await prisma.note.findFirst({ where: { tenantId: tenant.id, kind: 'APPOINTMENT_REQUEST' } })
  assert.ok(note, 'pedido de agendamento registrado no CRM')
  const botReply = await prisma.message.findFirst({ where: { tenantId: tenant.id, direction: 'OUT', aiGenerated: true } })
  assert.ok(botReply)

  // Duplicado é ignorado.
  await request(app).post(url).send({ phone: '5544977776666', text: { message: 'Oi, quero agendar uma consulta' }, messageId: 'm1' })
  assert.equal(await prisma.message.count({ where: { tenantId: tenant.id, direction: 'IN' } }), 1)

  await request(app).post(url).send({ phone: '5544977776666', text: { message: 'SAIR' }, messageId: 'm2' })
  const sup = await prisma.suppression.findFirst({ where: { tenantId: tenant.id, channel: 'WHATSAPP', value: '5544977776666' } })
  assert.ok(sup)
  const send = await request(app).post('/conversations').set(auth(token)).send({ contactId: sup.contactId, channel: 'WHATSAPP', text: 'Promoção!' })
  assert.equal(send.status, 422)
  assert.equal(send.body.code, 'SUPPRESSED')

  const inbox = await request(app).get('/conversations').set(auth(token))
  assert.equal(inbox.status, 200)
  assert.equal(inbox.body[0].contact.name, 'Carla')

  const timeline = await request(app).get(`/contacts/${sup.contactId}/timeline`).set(auth(token))
  assert.ok(timeline.body.length >= 4)
})

test('CRM: importação CSV com etiquetas e deduplicação', async () => {
  const { token, tenant } = await register('crm@revah.test')
  await activate(tenant.id)
  const csv = 'nome,telefone,email,tags\nAna,(44) 99999-0001,ana@x.com,VIP|Recall\nAna Duplicada,44999990001,,\nSem contato,,,\n'
  const res = await request(app).post('/contacts/import').set(auth(token)).send({ csv, tags: ['Importados'] })
  assert.equal(res.status, 200)
  assert.equal(res.body.created, 1)
  assert.equal(res.body.updated, 1)
  assert.equal(res.body.invalid.length, 1)
  const tags = await request(app).get('/tags').set(auth(token))
  assert.deepEqual(tags.body.map((t: any) => t.name).sort(), ['Importados', 'Recall', 'VIP'])
})

test('REVAH Voice: fila, horário permitido, opt-out verbal na ligação', async () => {
  const { token, tenant } = await register('voz@revah.test')
  await prisma.tenant.update({ where: { id: tenant.id }, data: { plan: 'PRO', status: 'ACTIVE' } })
  const ch = await request(app).post('/channels').set(auth(token)).send({ channel: 'VOICE', provider: 'TWILIO', label: 'Número', address: '4430001000', credentials: { simulated: true } })
  assert.equal(ch.status, 201)
  const s = await request(app)
    .put('/voice/settings')
    .set(auth(token))
    .send({ enabled: true, skipHolidays: false, allowedWindows: [{ days: [0, 1, 2, 3, 4, 5, 6], start: '00:00', end: '23:59' }] })
  assert.equal(s.status, 200, JSON.stringify(s.body))
  const c = await request(app).post('/contacts').set(auth(token)).send({ name: 'Paulo', phone: '44988880000' })
  const q = await request(app).post('/voice/calls').set(auth(token)).send({ contactId: c.body.contact.id, purpose: 'Confirmar consulta', script: 'Consulta amanhã às 10h.' })
  assert.equal(q.status, 201)
  await processDueJobs({ maxMs: 10_000 })
  const done = await prisma.call.findUnique({ where: { id: q.body.id } })
  assert.equal(done.status, 'COMPLETED')

  // Fluxo TwiML: abertura + pedido verbal de opt-out.
  const { answerTwiml, turnTwiml } = await import('../src/services/voice/engine')
  const call = await prisma.call.create({ data: { tenantId: tenant.id, contactId: c.body.contact.id, direction: 'OUTBOUND', to: '5544988880000', status: 'RINGING', purpose: 'Teste' } })
  const open = await answerTwiml(call.id)
  assert.ok(open.includes('<Gather') && open.includes('tecle 9'))
  const bye = await turnTwiml(call.id, { SpeechResult: 'não quero mais receber ligações' })
  assert.ok(bye.includes('<Hangup/>'))
  assert.ok(await prisma.suppression.findFirst({ where: { tenantId: tenant.id, channel: 'VOICE', value: '5544988880000' } }))
  const again = await request(app).post('/voice/calls').set(auth(token)).send({ contactId: c.body.contact.id, purpose: 'Outra' })
  assert.equal(again.body.status, 'BLOCKED')
})

function signed(body: object) {
  const raw = JSON.stringify(body)
  const ts = Math.floor(Date.now() / 1000).toString()
  const sig = crypto.createHmac('sha256', process.env.DENTALPOS_SHARED_SECRET!).update(`${ts}.${raw}`).digest('hex')
  return { raw, ts, sig }
}

test('DentalPos One: provisionamento, SSO, eventos e licença', async () => {
  const body = { clinicId: 'clin-42', clinicName: 'Clínica Sorriso', ownerEmail: 'dono@sorriso.test', ownerName: 'Dra. Ana', plan: 'PRO' }
  const s = signed(body)
  const bad = await request(app).post('/integrations/dentalpos/provision').set('Content-Type', 'application/json').set('X-Revah-Timestamp', s.ts).set('X-Revah-Signature', 'x').send(s.raw)
  assert.equal(bad.status, 401)
  const prov = await request(app).post('/integrations/dentalpos/provision').set('Content-Type', 'application/json').set('X-Revah-Timestamp', s.ts).set('X-Revah-Signature', s.sig).send(s.raw)
  assert.equal(prov.status, 200, JSON.stringify(prov.body))
  assert.ok(prov.body.apiKey.startsWith('rvh_'))

  const ssoToken = jwt.sign({ clinicId: 'clin-42', email: 'recepcao@sorriso.test', name: 'Gestora', role: 'ADMIN', jti: 'j1' }, process.env.DENTALPOS_SHARED_SECRET!, {
    audience: 'revah',
    issuer: 'dentalpos-one',
    expiresIn: '2m',
  })
  const sso = await request(app).post('/auth/sso/dentalpos').send({ token: ssoToken })
  assert.equal(sso.status, 200, JSON.stringify(sso.body))
  assert.equal(sso.body.embedded, true)
  const replay = await request(app).post('/auth/sso/dentalpos').send({ token: ssoToken })
  assert.equal(replay.status, 401)

  // Token gerado pelo próprio adaptador usado no DentalPos One.
  const { createSsoToken } = await import('../../packages/dentalpos-one-adapter/src/index')
  const viaAdapter = await request(app).post('/auth/sso/dentalpos').send({ token: createSsoToken(process.env.DENTALPOS_SHARED_SECRET!, { clinicId: 'clin-42', email: 'gestora2@sorriso.test', role: 'ADMIN' }) })
  assert.equal(viaAdapter.status, 200, JSON.stringify(viaAdapter.body))

  const t = sso.body.token
  await request(app)
    .post('/channels')
    .set(auth(t))
    .send({ channel: 'WHATSAPP', provider: 'ZAPI', label: 'Clínica', address: '44930000000', credentials: { simulated: true }, acknowledgeRisk: true })
  const inst = await request(app).post('/automations/templates/dentalpos').set(auth(t))
  assert.equal(inst.body.created, 7)
  assert.equal(await prisma.automation.count({ where: { tenantId: prov.body.tenantId, isActive: true } }), 0)
  await prisma.automation.updateMany({ where: { tenantId: prov.body.tenantId }, data: { isActive: true } })

  const ev = { id: 'appt-1-created', type: 'appointment.scheduled', patient: { id: 'p1', name: 'João Lima', phone: '44991234567' }, data: { data: '25/09/2026', hora: '14:30', profissional: 'Dra. Ana' } }
  const e1 = await request(app).post('/integrations/dentalpos/events').set('X-Api-Key', prov.body.apiKey).send(ev)
  assert.equal(e1.status, 200, JSON.stringify(e1.body))
  assert.equal(e1.body.actionsScheduled, 1)
  const dup = await request(app).post('/integrations/dentalpos/events').set('X-Api-Key', prov.body.apiKey).send(ev)
  assert.equal(dup.body.duplicate, true)
  await processDueJobs({ maxMs: 10_000 })
  const msg = await prisma.message.findFirst({ where: { tenantId: prov.body.tenantId, direction: 'OUT' } })
  assert.equal(msg.content, 'Olá, João! Sua consulta está agendada para 25/09/2026 às 14:30 com Dra. Ana. Qualquer dúvida, é só responder esta mensagem.')

  const lic = signed({ clinicId: 'clin-42', active: false })
  const off = await request(app).post('/integrations/dentalpos/license').set('Content-Type', 'application/json').set('X-Revah-Timestamp', lic.ts).set('X-Revah-Signature', lic.sig).send(lic.raw)
  assert.equal(off.body.status, 'SUSPENDED')
  const t2 = jwt.sign({ clinicId: 'clin-42', email: 'recepcao@sorriso.test', jti: 'j2' }, process.env.DENTALPOS_SHARED_SECRET!, { audience: 'revah', issuer: 'dentalpos-one', expiresIn: '2m' })
  const denied = await request(app).post('/auth/sso/dentalpos').send({ token: t2 })
  assert.equal(denied.status, 403)
})

test('Stripe: webhook de assinatura ativa plano e add-on de leads; leads escondem a origem', async () => {
  const { token, tenant } = await register('stripe@revah.test')
  const { handleStripeEvent } = await import('../src/services/billing')
  const sub = {
    id: 'sub_1',
    object: 'subscription',
    customer: 'cus_1',
    status: 'active',
    cancel_at_period_end: false,
    metadata: { tenantId: tenant.id, plan: 'PRO' },
    items: { data: [{ price: { id: 'price_pro_test' }, current_period_end: 1893456000 }, { price: { id: 'price_leads_test' }, current_period_end: 1893456000 }] },
  }
  const st = await handleStripeEvent({ id: 'evt_1', type: 'customer.subscription.updated', data: { object: sub } } as any)
  assert.equal(st, 'PROCESSED')
  assert.equal(await handleStripeEvent({ id: 'evt_1', type: 'customer.subscription.updated', data: { object: sub } } as any), 'PROCESSED')
  const t = await prisma.tenant.findUnique({ where: { id: tenant.id } })
  assert.equal(t.plan, 'PRO')
  assert.equal(t.status, 'ACTIVE')
  assert.equal(t.leadsAddonActive, true)

  const needTerms = await request(app).post('/leads/search').set(auth(token)).send({ kind: 'LOCAL', query: 'dentista' })
  assert.equal(needTerms.body.code, 'LEADS_TERMS_REQUIRED')
  const acc = await request(app).post('/leads/terms/accept').set(auth(token)).send({ signerName: 'Dono Teste', signerDocument: '12345678901', agree: true })
  assert.equal(acc.status, 201)
  await prisma.lead.create({ data: { tenantId: tenant.id, name: 'Lead X', phone: '5544999998888', origin: 'places', originRef: 'abc' } })
  const list = await request(app).get('/leads').set(auth(token))
  assert.equal(list.body.length, 1)
  assert.equal(list.body[0].origin, undefined)
  assert.equal(list.body[0].originRef, undefined)
  const imp = await request(app).post('/leads/import').set(auth(token)).send({ ids: [list.body[0].id] })
  assert.equal(imp.body.imported, 1)

  // Falha de pagamento bloqueia disparos.
  await handleStripeEvent({ id: 'evt_2', type: 'customer.subscription.updated', data: { object: { ...sub, status: 'past_due' } } } as any)
  await simulatedZapi(token)
  const c = await request(app).post('/campaigns').set(auth(token)).send({ name: 'X', channel: 'WHATSAPP', template: 'Oi', audience: { manual: manual(1) } })
  const l = await request(app).post(`/campaigns/${c.body.id}/launch`).set(auth(token))
  assert.equal(l.status, 402)
  assert.equal(l.body.code, 'PAYMENT_PAST_DUE')
})

test('descadastro por link de e-mail', async () => {
  const { tenant } = await register('email@revah.test')
  const { unsubscribeUrl } = await import('../src/services/messaging')
  const url = unsubscribeUrl(tenant.id, 'EMAIL', 'cliente@x.com')
  const path = new URL(url).pathname
  assert.equal((await request(app).get(path)).status, 200)
  assert.equal((await request(app).post(path)).status, 200)
  assert.ok(await prisma.suppression.findFirst({ where: { tenantId: tenant.id, channel: 'EMAIL', value: 'cliente@x.com' } }))
})
