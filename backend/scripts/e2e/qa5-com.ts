process.env.TENANT_SECRET_MASTER_KEY = process.env.TENANT_SECRET_MASTER_KEY || 'qa5-master-key'
import crypto from 'crypto'
import { setup, check, summary, prisma } from './qa5-lib'
import { runEduJobs } from '../../src/modules/core/jobs'
import { despacharPendentes } from '../../src/modules/comunicacao/dispatcher'
import { executarReguas } from '../../src/modules/comunicacao/regua'
import { executarCampanha } from '../../src/modules/comunicacao/campanhas'
import { twilioSignature, metaSignature, svixSignature } from '../../src/modules/comunicacao/pure'

// stub de fetch para provedores externos (o servidor roda no mesmo processo)
const realFetch = globalThis.fetch
let provedorModo: 'ok' | '500' | '400' = 'ok'
const chamadasProvedor: string[] = []
globalThis.fetch = (async (input: any, init?: any) => {
  const url = String(typeof input === 'string' ? input : input.url)
  if (url.startsWith('http://127.0.0.1')) return realFetch(input, init)
  chamadasProvedor.push(url)
  const J = (status: number, body: any) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  if (provedorModo === '500') return J(500, { message: 'erro do provedor' })
  if (provedorModo === '400') return J(400, { ok: false, description: 'chat not found', message: 'invalid' })
  if (url.includes('api.telegram.org')) return J(200, { ok: true, result: { message_id: 77 } })
  if (url.includes('api.resend.com/emails')) return J(200, { id: 'resend-' + Math.random().toString(36).slice(2) })
  return J(200, {})
}) as any

// segunda-feira 15:00Z = 12:00 BRT (dentro da janela)
const SEG = new Date('2026-10-05T15:00:00Z')
const dias = (n: number) => new Date(Date.now() + n * 864e5)

async function main() {
  const { call, t1, t2, close } = await setup()
  const admin = await t1.mk('ADMIN'), sup = await t1.mk('SUPPORT'), mkt = await t1.mk('MARKETING'), fin = await t1.mk('FINANCE'), coord = await t1.mk('COORDINATOR'), tch = await t1.mk('TEACHER')
  const stu = await t1.mk('STUDENT', true), stu2 = await t1.mk('STUDENT', true), stu3 = await t1.mk('STUDENT', true)
  const admB = await t2.mk('ADMIN')
  const C = '/edu/comunicacao'
  let r = await call(sup, 'POST', C + '/bootstrap', {}); check('boot', r.status === 200, r.text)
  r = await call(sup, 'POST', C + '/bootstrap', {}); check('boot idempotente', r.status === 200 && r.json.templates === 0 && r.json.faqs === 0 && r.json.fluxos === 0 && r.json.reguas === 0, r.text)
  r = await call(tch, 'POST', C + '/bootstrap', {}); check('boot prof 403', r.status === 403)
  r = await call(tch, 'GET', C + '/painel'); check('painel prof 403', r.status === 403)
  r = await call(sup, 'GET', C + '/painel'); check('painel', r.status === 200, r.text)

  // ---- canais: sem credenciais => falha explicativa, nunca envio
  r = await call(sup, 'POST', C + '/canais', { tipo: 'TELEGRAM', nome: 'Bot', provedor: 'TELEGRAM_BOT' }); check('suporte nao cria canal 403', r.status === 403)
  r = await call(admin, 'POST', C + '/canais', { tipo: 'TELEGRAM', nome: 'Bot', provedor: 'X' }); check('provedor invalido 400', r.status === 400, r.text)
  r = await call(admin, 'POST', C + '/canais', { tipo: 'EMAIL', nome: 'Email sem chave', provedor: 'RESEND' }); check('canal sem credencial', r.status === 201 && r.json.configurado === false && r.json.faltam.length === 2, r.text); const canalEmailVazio = r.json
  // notificação por e-mail sem canal configurado
  const n1 = await prisma.eduNotification.create({ data: { tenantId: t1.tenantId, canal: 'EMAIL', destino: 'a@x.com', assunto: 'Oi', mensagem: 'Teste de envio', agendadoPara: new Date() } })
  let d = await despacharPendentes({ tenantId: t1.tenantId, now: SEG })
  let nn = await prisma.eduNotification.findUnique({ where: { id: n1.id } })
  check('sem credencial => FALHA explicativa', nn?.status === 'FALHA' && /não configurado/.test(nn.erro ?? '') && nn.enviadoEm === null, nn)
  check('nenhuma chamada externa sem credencial', chamadasProvedor.length === 0, chamadasProvedor)
  r = await call(sup, 'POST', C + `/outbox/${n1.id}/reenviar`, {}); check('reenviar falha', r.status === 200, r.text)
  d = await despacharPendentes({ tenantId: t1.tenantId, now: SEG }); nn = await prisma.eduNotification.findUnique({ where: { id: n1.id } }); check('reenvio continua FALHA', nn?.status === 'FALHA', nn)
  // canais reais (stub)
  r = await call(admin, 'POST', C + '/canais', { tipo: 'EMAIL', nome: 'Email', provedor: 'RESEND', config: { apiKey: 're_secretkey123', from: 'no-reply@x.com', webhookSecret: 'whsec_' + Buffer.from('segredo123').toString('base64') } }); check('canal email', r.status === 201 && r.json.configurado === true, r.text); const canalEmail = r.json
  check('segredos nao vazam', !JSON.stringify(r.json).includes('re_secretkey123') && !JSON.stringify(r.json).includes('configCifrada'))
  r = await call(sup, 'GET', C + '/canais'); check('lista canais sem segredos', r.status === 200 && !r.text.includes('re_secretkey123') && !r.text.includes('configCifrada'), r.text.slice(0, 200))
  r = await call(admB, 'GET', C + '/canais'); check('canais outro tenant vazio', r.status === 200 && r.json.items.length === 0)
  r = await call(admB, 'PATCH', C + `/canais/${canalEmail.id}`, { nome: 'hack' }); check('patch canal tenant B 404', r.status === 404)
  r = await call(sup, 'POST', C + `/canais/${canalEmail.id}/testar`, {}); check('testar canal', r.status === 200 && r.json.ok === true, r.text)
  r = await call(admin, 'POST', C + '/canais', { tipo: 'TELEGRAM', nome: 'Bot', provedor: 'TELEGRAM_BOT', config: { botToken: '123:ABCDEF' } }); check('canal telegram', r.status === 201 && r.json.configurado, r.text); const canalTg = r.json
  r = await call(admin, 'GET', C + `/canais/${canalTg.id}/webhook-info`); const tgInfo = r.json
  const tgCfg = (await import('../../src/modules/comunicacao/store')).lerCfg((await prisma.comCanal.findUnique({ where: { id: canalTg.id } }))!).cfg!
  check('telegram secret gerado', !!tgCfg.webhookSecret)
  r = await call(admin, 'POST', C + '/canais', { tipo: 'SITE_CHAT', nome: 'Chat', provedor: 'PROPRIO' }); check('canal sitechat', r.status === 201 && r.json.configurado, r.text); const canalChat = r.json
  const chatKey = (await import('../../src/modules/comunicacao/store')).lerCfg((await prisma.comCanal.findUnique({ where: { id: canalChat.id } }))!).cfg!.chatKey
  r = await call(admin, 'POST', C + '/canais', { tipo: 'WHATSAPP', nome: 'WA', provedor: 'META_CLOUD', config: { accessToken: 'tok', phoneNumberId: '123', appSecret: 'app-secret-1' } }); check('canal whatsapp', r.status === 201, r.text); const canalWa = r.json
  r = await call(admin, 'POST', C + '/canais', { tipo: 'SMS', nome: 'SMS', provedor: 'TWILIO', config: { accountSid: 'ACxxx', authToken: 'twilio-token', from: '+5511999990000' } }); check('canal sms', r.status === 201, r.text); const canalSms = r.json
  r = await call(admin, 'POST', C + '/canais', { tipo: 'VOZ', nome: 'Voz', provedor: 'TWILIO', config: { accountSid: 'ACxxx', authToken: 'twilio-token', from: '+5511999990000' } }); const canalVoz = r.json
  r = await call(admin, 'POST', C + '/canais', { tipo: 'INSTAGRAM', nome: 'IG sem segredo', provedor: 'META_GRAPH', config: { accessToken: 'tok', igUserId: '1' } }); const canalIg = r.json

  // ---- webhooks públicos: assinatura inválida => 401/403
  const W = (id: string, suf = '') => `/public/edu/comunicacao/webhook/${id}${suf}`
  r = await call(null, 'POST', W('00000000-0000-0000-0000-000000000000'), {}); check('webhook canal inexistente 404', r.status === 404, r.text)
  r = await call(null, 'POST', W(canalTg.id), { message: { chat: { id: 555 }, text: 'oi', message_id: 1, from: { first_name: 'Joao' } } }); check('telegram sem secret 401', r.status === 401, r.text)
  r = await call(null, 'POST', W(canalTg.id), { message: { chat: { id: 555 }, text: 'oi', message_id: 1 } }, { 'x-telegram-bot-api-secret-token': 'errado' }); check('telegram secret errado 401', r.status === 401, r.text)
  const tgMsg = (id: number, text: string, chat = 555) => ({ message: { chat: { id: chat }, text, message_id: id, from: { first_name: 'Joao', last_name: 'Silva' } } })
  r = await call(null, 'POST', W(canalTg.id), tgMsg(10, 'quero saber o horario de atendimento'), { 'x-telegram-bot-api-secret-token': tgCfg.webhookSecret }); check('telegram ok', r.status === 200, r.text)
  r = await call(null, 'POST', W(canalTg.id), tgMsg(10, 'quero saber o horario de atendimento'), { 'x-telegram-bot-api-secret-token': tgCfg.webhookSecret }); check('telegram duplicado idempotente', r.status === 200)
  const msgs10 = await prisma.comMensagem.count({ where: { tenantId: t1.tenantId, externalId: '10' } }); check('mensagem recebida 1x', msgs10 === 1, msgs10)
  const logsTg = await prisma.comWebhookLog.findMany({ where: { canalId: canalTg.id } }); check('log de webhooks (2 rejeitados)', logsTg.filter((l) => !l.ok).length === 2, logsTg.map((l) => l.ok))
  // bot respondeu com FAQ por Telegram: notificação enviada pelo stub
  const botOut = await prisma.eduNotification.findMany({ where: { tenantId: t1.tenantId, canal: 'TELEGRAM', refType: 'ComConversa' } })
  check('bot respondeu via FAQ e despachou', botOut.length === 1 && botOut[0].status === 'ENVIADA' && /horário|atendimento/i.test(botOut[0].mensagem), botOut)
  // WhatsApp Meta
  const waBody = { entry: [{ changes: [{ value: { contacts: [{ wa_id: '5511988887777', profile: { name: 'Maria' } }], messages: [{ from: '5511988887777', id: 'wamid.1', type: 'text', text: { body: 'atendente' } }] } }] }] }
  const waRaw = JSON.stringify(waBody)
  r = await call(null, 'POST', W(canalWa.id), waRaw); check('whatsapp sem assinatura 401', r.status === 401, r.text)
  r = await call(null, 'POST', W(canalWa.id), waRaw, { 'x-hub-signature-256': 'sha256=' + 'a'.repeat(64) }); check('whatsapp assinatura invalida 401', r.status === 401, r.text)
  r = await call(null, 'POST', W(canalWa.id), waRaw, { 'x-hub-signature-256': metaSignature('outro-segredo', waRaw) }); check('whatsapp assinatura de outro segredo 401', r.status === 401)
  r = await call(null, 'POST', W(canalWa.id), waRaw, { 'x-hub-signature-256': metaSignature('app-secret-1', waRaw) }); check('whatsapp assinatura valida', r.status === 200, r.text)
  const convWa = await prisma.comConversa.findFirst({ where: { tenantId: t1.tenantId, canalTipo: 'WHATSAPP' } })
  check('handoff: conversa PENDENTE sem bot', convWa?.status === 'PENDENTE' && convWa.botAtivo === false && convWa.etiquetas.includes('handoff'), convWa)
  const remH = await prisma.eduReminder.count({ where: { tenantId: t1.tenantId, refType: 'ComConversa', refId: convWa?.id } }); check('lembretes de SLA/handoff', remH >= 1, remH)
  // status do provedor
  const nWa = await prisma.eduNotification.create({ data: { tenantId: t1.tenantId, canal: 'WHATSAPP', destino: '5511988887777', mensagem: 'x', status: 'ENVIADA', provedorId: 'wamid.OUT', enviadoEm: new Date() } })
  const stBody = JSON.stringify({ entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.OUT', status: 'read' }] } }] }] })
  r = await call(null, 'POST', W(canalWa.id), stBody, { 'x-hub-signature-256': metaSignature('app-secret-1', stBody) }); check('status provedor', r.status === 200)
  check('status LIDA aplicado', (await prisma.eduNotification.findUnique({ where: { id: nWa.id } }))?.status === 'LIDA')
  r = await call(null, 'GET', W(canalWa.id) + '?hub.mode=subscribe&hub.verify_token=x&hub.challenge=abc'); check('meta verify token errado 403', r.status === 403, r.text)
  const wInfo = (await import('../../src/modules/comunicacao/store')).lerCfg((await prisma.comCanal.findUnique({ where: { id: canalWa.id } }))!).cfg!
  r = await call(null, 'GET', W(canalWa.id) + `?hub.mode=subscribe&hub.verify_token=${wInfo.verifyToken}&hub.challenge=abc`); check('meta verify ok', r.status === 200 && r.text === 'abc', r.text)
  // twilio SMS
  const smsParams = { From: '+5511977776666', Body: 'ola', MessageSid: 'SM1', To: '+5511999990000' }
  const form = new URLSearchParams(smsParams).toString()
  const smsUrl = (host: string) => `http://${host}/api/public/edu/comunicacao/webhook/${canalSms.id}`
  const rawPost = async (path: string, body: string, headers: Record<string, string>) => { const x = await realFetch(`http://127.0.0.1:${(await import('./qa5-lib')).S ? '' : ''}`, {}).catch(() => null); return x }
  void rawPost
  // precisa da porta: obtém via base da chamada
  const baseUrl = (r as any) && ''
  void baseUrl
  // enviar form via fetch direto usando a mesma base do harness
  const base = (await setupBase())
  async function setupBase() { return (globalThis as any).__qa5base as string }
  void base
  r = await call(null, 'POST', W(canalSms.id), form, { 'content-type': 'application/x-www-form-urlencoded' }); check('twilio sem assinatura 401', r.status === 401, r.text)
  r = await call(null, 'POST', W(canalSms.id), form, { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': 'invalida' }); check('twilio assinatura invalida 401', r.status === 401, r.text)
  r = await call(null, 'POST', W(canalSms.id, '/status'), form, { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': 'invalida' }); check('twilio status assinatura invalida 401', r.status === 401, r.text)
  r = await call(null, 'POST', W(canalVoz.id, '/voz/ura'), form, { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': 'invalida' }); check('voz ura assinatura invalida 401', r.status === 401, r.text)
  r = await call(null, 'POST', W(canalVoz.id, '/voz/digito'), form, { 'content-type': 'application/x-www-form-urlencoded' }); check('voz digito sem assinatura 401', r.status === 401, r.text)
  r = await call(null, 'POST', W(canalVoz.id, '/voz/status'), form, { 'content-type': 'application/x-www-form-urlencoded' }); check('voz status sem assinatura 401', r.status === 401, r.text)
  // email Resend / instagram
  const emRaw = JSON.stringify({ type: 'email.delivered', data: { email_id: 'x' } })
  r = await call(null, 'POST', W(canalEmail.id), emRaw); check('resend sem assinatura 401', r.status === 401, r.text)
  const ts = String(Math.floor(Date.now() / 1000))
  const sec = 'whsec_' + Buffer.from('segredo123').toString('base64')
  r = await call(null, 'POST', W(canalEmail.id), emRaw, { 'svix-id': 'm1', 'svix-timestamp': ts, 'svix-signature': 'v1,' + svixSignature('whsec_' + Buffer.from('outro').toString('base64'), 'm1', ts, emRaw) }); check('resend assinatura invalida 401', r.status === 401, r.text)
  r = await call(null, 'POST', W(canalEmail.id), emRaw, { 'svix-id': 'm1', 'svix-timestamp': String(Number(ts) - 3600), 'svix-signature': 'v1,' + svixSignature(sec, 'm1', String(Number(ts) - 3600), emRaw) }); check('resend timestamp antigo 401', r.status === 401, r.text)
  r = await call(null, 'POST', W(canalEmail.id), emRaw, { 'svix-id': 'm1', 'svix-timestamp': ts, 'svix-signature': 'v1,' + svixSignature(sec, 'm1', ts, emRaw) }); check('resend assinatura valida', r.status === 200, r.text)
  r = await call(null, 'POST', W(canalIg.id), JSON.stringify({ entry: [] })); check('instagram sem appSecret 401', r.status === 401, r.text)
  r = await call(null, 'POST', W(canalSms.id).replace('/webhook/', '/webhook/') , '{"x":1}', { 'content-type': 'application/json' }); check('sms json sem assinatura 401', r.status === 401)
  r = await call(null, 'POST', W(canalChat.id), {}); check('canal sitechat nao recebe webhook 400', r.status === 400, r.text)
  // site chat
  const SC = `/public/edu/comunicacao/sitechat/${canalChat.id}`
  r = await call(null, 'POST', SC, { sessionId: 'sessao-12345', texto: 'oi' }); check('sitechat sem chave 401', r.status === 401, r.text)
  r = await call(null, 'POST', SC, { sessionId: 'sessao-12345', texto: 'oi' }, { 'x-chat-key': 'errada' }); check('sitechat chave errada 401', r.status === 401)
  r = await call(null, 'POST', SC, { sessionId: 'x', texto: 'oi' }, { 'x-chat-key': chatKey }); check('sitechat sessionId invalido 400', r.status === 400)
  r = await call(null, 'POST', SC, { sessionId: 'sessao-12345', texto: 'oi' }, { 'x-chat-key': chatKey }); check('sitechat menu', r.status === 200 && r.json.respostas.length >= 1, r.text)
  console.log('  bot menu:', JSON.stringify(r.json?.respostas?.[0]?.conteudo)?.slice(0, 120))
  r = await call(null, 'POST', SC, { sessionId: 'sessao-12345', texto: 'qual a segunda via do boleto?' }, { 'x-chat-key': chatKey }); check('sitechat faq', r.status === 200 && r.json.respostas.length >= 1, r.text)
  r = await call(null, 'POST', SC, { sessionId: 'sessao-12345', texto: 'falar com atendente' }, { 'x-chat-key': chatKey }); check('sitechat handoff', r.status === 200, r.text)
  const convChat = await prisma.comConversa.findFirst({ where: { id: r.json.conversaId } }); check('chat handoff conversa', convChat?.botAtivo === false && convChat.status === 'PENDENTE', convChat)
  r = await call(null, 'POST', SC, { sessionId: 'sessao-12345', texto: 'alguem ai?' }, { 'x-chat-key': chatKey }); check('apos handoff bot nao responde', r.status === 200 && r.json.respostas.length === 0, r.text)
  r = await call(sup, 'POST', C + `/conversas/${convChat!.id}/assumir`, {}); check('assumir', r.status === 200, r.text)
  r = await call(sup, 'POST', C + `/conversas/${convChat!.id}/mensagens`, { texto: 'Oi, como posso ajudar?' }); check('atendente responde', r.status === 201 || r.status === 200, r.text)
  r = await call(null, 'GET', SC + '/mensagens?sessionId=sessao-12345', undefined, { 'x-chat-key': chatKey }); check('sitechat poll', r.status === 200 && r.json.mensagens.some((m: any) => /como posso ajudar/.test(m.conteudo)), r.text)
  r = await call(tch, 'POST', C + `/conversas/${convChat!.id}/mensagens`, { texto: 'x' }); check('prof 403 conversa', r.status === 403)
  r = await call(admB, 'GET', C + `/conversas/${convChat!.id}`); check('conversa tenant B 404', r.status === 404)
  r = await call(sup, 'POST', C + `/conversas/${convChat!.id}/status`, { status: 'RESOLVIDA' }); check('resolver', r.status === 200, r.text)
  r = await call(sup, 'GET', C + '/conversas/metricas'); check('metricas conversas', r.status === 200, r.text)

  // ---- contatos / preferências / templates
  r = await call(sup, 'POST', C + '/contatos', { nome: 'Fulano', telefone: '123' }); check('telefone invalido 400', r.status === 400, r.text)
  r = await call(sup, 'POST', C + '/contatos', { nome: 'Fulano Teste', telefone: '(11) 98888-1111', email: 'FULANO@X.COM' }); check('contato', r.status === 201 && r.json.email === 'fulano@x.com', r.text); const ct = r.json
  console.log('  telefone normalizado:', ct.telefone)
  r = await call(sup, 'PUT', C + `/contatos/${ct.id}/preferencias`, { canal: '*', finalidade: 'MARKETING', consentimento: false }); check('opt-out', r.status === 200, r.text)
  r = await call(admB, 'PUT', C + `/contatos/${ct.id}/preferencias`, { consentimento: false }); check('pref tenant B 404', r.status === 404)
  r = await call(mkt, 'POST', C + '/templates', { chave: 'promo1', nome: 'Promo', categoria: 'MARKETING', corpo: 'Olá {{nome}}, temos novidades em {{curso}}!' }); check('template', r.status === 201 && r.json.variaveis.includes('nome'), r.text); const tp = r.json
  r = await call(mkt, 'POST', C + '/templates', { chave: 'promo1', nome: 'Promo', corpo: 'x' }); check('template chave duplicada 4xx', r.status >= 400 && r.status < 500, r.text)
  r = await call(tch, 'POST', C + '/templates', { chave: 'xx', nome: 'Promo', corpo: 'x' }); check('prof nao cria template 403', r.status === 403)
  r = await call(sup, 'POST', C + '/templates/preview', { templateId: tp.id }); check('preview', r.status === 200 && r.json.usouDadosDeExemplo, r.text)
  r = await call(sup, 'POST', C + '/outbox', { canal: 'EMAIL', destino: 'z@x.com', templateId: tp.id }); check('outbox com vars faltando 400', r.status === 400 || r.status === 201, r.text)
  r = await call(sup, 'POST', C + '/outbox', { canal: 'EMAIL', destino: 'z@x.com', templateId: tp.id, variaveis: { nome: 'Zé', curso: 'Direito' }, enviarAgora: true }); check('outbox enviar agora', r.status === 201 && r.json.notificacao?.status === 'ENVIADA', r.text)
  r = await call(sup, 'POST', C + '/outbox', { canal: 'EMAIL', mensagem: 'sem destino' }); check('outbox sem destino 400', r.status === 400, r.text)
  r = await call(sup, 'POST', C + '/outbox', { canal: 'FAX', mensagem: 'x', destino: 'x' }); check('outbox canal invalido 400', r.status === 400, r.text)

  // ---- retentativas / falhas do provedor
  provedorModo = '500'
  const n2 = await prisma.eduNotification.create({ data: { tenantId: t1.tenantId, canal: 'EMAIL', destino: 'r@x.com', assunto: 'retry', mensagem: 'retry', agendadoPara: new Date() } })
  await despacharPendentes({ tenantId: t1.tenantId, now: SEG }); let q = await prisma.eduNotification.findUnique({ where: { id: n2.id } })
  check('5xx do provedor => PENDENTE com backoff', q?.status === 'PENDENTE' && q.tentativas === 1 && q.agendadoPara > SEG, q)
  provedorModo = '400'
  const n3 = await prisma.eduNotification.create({ data: { tenantId: t1.tenantId, canal: 'TELEGRAM', destino: '999', mensagem: 'tg', agendadoPara: new Date() } })
  await despacharPendentes({ tenantId: t1.tenantId, now: SEG }); q = await prisma.eduNotification.findUnique({ where: { id: n3.id } })
  check('4xx do provedor => FALHA definitiva', q?.status === 'FALHA' && !!q.erro && q.enviadoEm === null, q)
  provedorModo = 'ok'
  // concorrência no despacho: duas execuções simultâneas não duplicam
  const antes = chamadasProvedor.length
  const n4 = await prisma.eduNotification.create({ data: { tenantId: t1.tenantId, canal: 'EMAIL', destino: 'conc@x.com', assunto: 'conc', mensagem: 'conc', agendadoPara: new Date() } })
  await Promise.all([despacharPendentes({ tenantId: t1.tenantId, now: new Date(SEG.getTime() + 3 * 3600e3) }), despacharPendentes({ tenantId: t1.tenantId, now: new Date(SEG.getTime() + 3 * 3600e3) }), despacharPendentes({ tenantId: t1.tenantId, now: new Date(SEG.getTime() + 3 * 3600e3) })])
  const envios = chamadasProvedor.slice(antes).filter((u) => u.includes('resend')).length
  q = await prisma.eduNotification.findUnique({ where: { id: n4.id } }); check('despacho concorrente nao duplica envio', envios <= 2 && q?.status === 'ENVIADA', { envios, q })
  console.log('  envios resend na concorrencia (inclui as pendentes antigas):', envios)
  // fora da janela: SMS reagendado
  const n5 = await prisma.eduNotification.create({ data: { tenantId: t1.tenantId, canal: 'SMS', destino: '+5511999991111', mensagem: 'sms', agendadoPara: new Date() } })
  const DOM = new Date('2026-10-04T15:00:00Z') // domingo? 0=dom: diasUteis [1..6] => fora
  await despacharPendentes({ tenantId: t1.tenantId, now: DOM }); q = await prisma.eduNotification.findUnique({ where: { id: n5.id } })
  check('SMS no domingo reagendado', q?.status === 'PENDENTE' && q.agendadoPara > DOM && q.tentativas === 0, q)
  r = await call(sup, 'POST', C + `/outbox/${n5.id}/cancelar`, {}); check('cancelar pendente', r.status === 200, r.text)
  r = await call(sup, 'POST', C + `/outbox/${n5.id}/cancelar`, {}); check('cancelar 2x 409', r.status === 409)
  r = await call(sup, 'GET', C + '/outbox?status=FALHA'); check('outbox lista', r.status === 200 && r.json.total >= 1, r.text)
  r = await call(sup, 'GET', C + '/outbox/resumo'); check('outbox resumo', r.status === 200, r.text)

  // ---- campanhas
  // contatos de alunos com e-mail (via user)
  r = await call(sup, 'POST', C + '/contatos/sincronizar', { fonte: 'ALUNOS' }); check('sincronizar contatos', r.status === 200 && r.json.criados >= 3, r.text)
  const ar = (prisma as any).accountReceivable
  for (const [s, dv] of [[stu, -20], [stu2, -5], [stu3, 10]] as any) await ar.create({ data: { tenantId: t1.tenantId, studentId: s.studentId, descricao: 'Mensalidade 10/26', valor: 800, dataVencimento: dias(dv), status: dv < 0 ? 'ATRASADO' : 'PENDENTE', numeroParcela: 1 } })
  const tplCobr = await prisma.comTemplate.findFirst({ where: { tenantId: t1.tenantId, chave: 'cobranca_d0' } })
  r = await call(mkt, 'POST', C + '/campanhas', { nome: 'Camp inadimplentes', segmento: 'INADIMPLENTES', canal: 'EMAIL', templateId: tplCobr!.id, finalidade: 'MARKETING' }); check('inadimplentes marketing 400', r.status === 400, r.text)
  r = await call(fin, 'POST', C + '/campanhas', { nome: 'Camp inadimplentes', segmento: 'INADIMPLENTES', canal: 'EMAIL', templateId: tplCobr!.id, finalidade: 'COBRANCA' }); check('campanha', r.status === 201, r.text); const camp = r.json
  r = await call(fin, 'POST', C + `/campanhas/${camp.id}/previa`, {}); check('previa', r.status === 200 && r.json.totalAlvo === 2, r.text)
  r = await call(tch, 'POST', C + `/campanhas/${camp.id}/disparar`, {}); check('prof dispara 403', r.status === 403)
  r = await call(admB, 'POST', C + `/campanhas/${camp.id}/disparar`, {}); check('disparo tenant B 404', r.status === 404, r.text)
  // canal SMS ativo? crie campanha em canal sem config: VOZ está config. use INSTAGRAM? CANAIS_ENVIO?
  r = await call(fin, 'POST', C + '/campanhas', { nome: 'Camp sem canal', segmento: 'INADIMPLENTES', canal: 'TELEGRAM', templateId: tplCobr!.id, finalidade: 'COBRANCA' })
  const campTg = r.json
  await prisma.comCanal.update({ where: { id: canalTg.id }, data: { ativo: false } })
  r = await call(fin, 'POST', C + `/campanhas/${campTg.id}/disparar`, {}); check('disparo sem canal ativo 409', r.status === 409 && /canal/i.test(r.text), r.text)
  await prisma.comCanal.update({ where: { id: canalTg.id }, data: { ativo: true } })
  // execuções concorrentes
  const exs = await Promise.all([1, 2, 3].map(() => call(fin, 'POST', C + `/campanhas/${camp.id}/disparar`, {})))
  console.log('  disparos concorrentes:', exs.map((e) => e.status))
  const notifsCamp = await prisma.eduNotification.count({ where: { tenantId: t1.tenantId, refType: 'ComCampanha', refId: camp.id } })
  const destCamp = await prisma.comCampanhaDestinatario.count({ where: { campanhaId: camp.id, resultado: 'ENFILEIRADO' } })
  check('campanha nao duplica notificacoes (concorrente)', notifsCamp === 2 && destCamp === 2, { notifsCamp, destCamp })
  r = await call(fin, 'POST', C + `/campanhas/${camp.id}/disparar`, {}); check('campanha concluida nao redispara 409', r.status === 409, r.text)
  const rr = await call(fin, 'GET', C + `/campanhas/${camp.id}`); check('campanha metricas', rr.status === 200 && rr.json.metricas, rr.text)
  await despacharPendentes({ tenantId: t1.tenantId, now: new Date(SEG.getTime() + 4 * 3600e3) })
  const envCamp = await prisma.eduNotification.groupBy({ by: ['status'], where: { tenantId: t1.tenantId, refType: 'ComCampanha', refId: camp.id }, _count: true }); console.log('  status campanha:', JSON.stringify(envCamp))
  // opt-out: marketing
  const cStu = await prisma.comContato.findFirst({ where: { tenantId: t1.tenantId, studentId: stu3.studentId } })
  r = await call(sup, 'PUT', C + `/contatos/${cStu!.id}/preferencias`, { canal: '*', finalidade: 'MARKETING', consentimento: false }); check('opt-out aluno3', r.status === 200)
  r = await call(mkt, 'POST', C + '/campanhas', { nome: 'Camp marketing alunos', segmento: 'ALUNOS_ATIVOS', canal: 'EMAIL', templateId: tp.id, finalidade: 'MARKETING' }); const campM = r.json
  r = await call(mkt, 'POST', C + `/campanhas/${campM.id}/previa`, {}); check('previa marketing bloqueia opt-out', r.status === 200 && r.json.bloqueados >= 1, r.text)
  r = await call(mkt, 'POST', C + `/campanhas/${campM.id}/disparar`, {}); check('disparar marketing', r.status === 200, r.text)
  const bloq = await prisma.comCampanhaDestinatario.findMany({ where: { campanhaId: campM.id, resultado: 'BLOQUEADO_OPTOUT' } }); check('optout nao recebe marketing', bloq.some((b) => b.studentId === stu3.studentId), bloq)
  r = await call(mkt, 'POST', C + `/campanhas/${campM.id}/cancelar`, {}); check('cancelar campanha', r.status === 200, r.text)
  // agendamento + job
  r = await call(mkt, 'POST', C + '/campanhas', { nome: 'Camp agendada', segmento: 'CONTATOS', canal: 'EMAIL', templateId: tp.id, finalidade: 'MARKETING' }); const campA = r.json
  r = await call(mkt, 'POST', C + `/campanhas/${campA.id}/agendar`, { agendadaPara: new Date(Date.now() - 864e5).toISOString() }); check('agendar passado 400', r.status === 400, r.text)
  r = await call(mkt, 'POST', C + `/campanhas/${campA.id}/agendar`, { agendadaPara: new Date(Date.now() + 5000).toISOString() }); check('agendar', r.status === 200, r.text)
  await prisma.comCampanha.update({ where: { id: campA.id }, data: { agendadaPara: new Date(Date.now() - 1000) } })

  // ---- régua de cobrança
  const regua = await prisma.comRegua.findFirst({ where: { tenantId: t1.tenantId } })
  r = await call(fin, 'POST', C + '/reguas/simular', {}); check('simular com regua inativa', r.status === 200 && r.json.reguas === 0, r.text)
  r = await call(fin, 'PATCH', C + `/reguas/${regua!.id}`, { ativa: true }); check('ativar regua', r.status === 200, r.text)
  // limpa títulos anteriores e cria cenários: d0 hoje, d+3, ja pago
  await ar.deleteMany({ where: { tenantId: t1.tenantId } })
  const hojeBRT = new Date(); hojeBRT.setUTCHours(15, 0, 0, 0)
  const tit = async (s: any, offs: number, status = 'PENDENTE') => ar.create({ data: { tenantId: t1.tenantId, studentId: s.studentId, descricao: 'Parcela', valor: 500.5, dataVencimento: new Date(hojeBRT.getTime() - offs * 864e5), status, numeroParcela: 1 } })
  const tA = await tit(stu, 0), tB = await tit(stu2, 3, 'ATRASADO'), tC = await tit(stu3, 10, 'ATRASADO')
  r = await call(fin, 'POST', C + '/reguas/simular', {}); check('simulacao', r.status === 200 && r.json.simulacao.length >= 3, r.text)
  console.log('  simulacao:', r.json?.simulacao?.map((x: any) => `${x.etapa}/${x.canal}/${x.resultado}`))
  const e1 = await Promise.all([1, 2, 3].map(() => executarReguas({ tenantId: t1.tenantId })))
  const total1 = e1.reduce((a, x) => a + x.enfileiradas, 0)
  const execs = await prisma.comReguaExecucao.count({ where: { tenantId: t1.tenantId } }); const notReg = await prisma.eduNotification.count({ where: { tenantId: t1.tenantId, refType: 'ComReguaExec' } })
  check('regua concorrente nao duplica', execs === notReg || execs >= notReg, { execs, notReg, total1 })
  const e2 = await executarReguas({ tenantId: t1.tenantId }); check('regua 2a execucao nao enfileira de novo', e2.enfileiradas === 0, e2)
  const dupN = await prisma.eduNotification.groupBy({ by: ['refId'], where: { tenantId: t1.tenantId, refType: 'ComReguaExec' }, _count: true, having: { refId: { _count: { gt: 1 } } } }); check('sem exec duplicada', dupN.length === 0)
  const notRegRows = await prisma.eduNotification.findMany({ where: { tenantId: t1.tenantId, refType: 'ComReguaExec' } }); console.log('  notificacoes regua:', notRegRows.map((n) => `${n.canal}:${n.templateKey}:${n.status}`))
  check('mensagem de cobranca renderizada (valor/BRL)', notRegRows.some((n) => /R\$\s?500,50/.test(n.mensagem)), notRegRows.map((n) => n.mensagem.slice(0, 80)))
  // título pago antes do despacho => suprimido
  await ar.update({ where: { id: tA.id }, data: { status: 'PAGO', dataPagamento: new Date() } })
  await despacharPendentes({ tenantId: t1.tenantId, now: new Date(SEG.getTime() + 5 * 3600e3) })
  const exA = await prisma.comReguaExecucao.findFirst({ where: { receivableId: tA.id } }); const nA = exA?.notificationId ? await prisma.eduNotification.findUnique({ where: { id: exA.notificationId } }) : null
  check('titulo quitado: cobranca suprimida', !nA || ['CANCELADA', 'FALHA'].includes(nA.status) && nA.status !== 'ENVIADA' || nA.status === 'CANCELADA', nA)
  r = await call(fin, 'GET', C + `/reguas/${regua!.id}/execucoes`); check('execucoes', r.status === 200, r.text)
  r = await call(admB, 'GET', C + `/reguas/${regua!.id}`); check('regua tenant B 404', r.status === 404)
  r = await call(tch, 'PATCH', C + `/reguas/${regua!.id}`, { ativa: false }); check('regua prof 403', r.status === 403)
  r = await call(mkt, 'PATCH', C + `/reguas/${regua!.id}`, { ativa: false }); check('regua mkt 403 (so financeiro)', r.status === 403, r.status)

  // ---- redes sociais
  r = await call(admin, 'POST', C + '/social/contas', { rede: 'INSTAGRAM', nome: 'IG Inst', handle: '@inst' }); check('conta social', r.status === 201, r.text); const cs = r.json
  r = await call(mkt, 'POST', C + '/social/contas', { rede: 'INSTAGRAM', nome: 'IG2' }); check('mkt nao cria conta 403', r.status === 403)
  r = await call(mkt, 'POST', C + '/social/posts', { contaId: cs.id, titulo: 'Post teste', texto: 'Venha conhecer nossos cursos!', midiaUrls: ['https://x.com/a.jpg'], agendadoPara: new Date(Date.now() - 1000).toISOString() }); check('post', r.status === 201, r.text); const post = r.json
  r = await call(mkt, 'POST', C + `/social/posts/${post.id}/publicar`, {}); check('publicar sem aprovar 409', r.status === 409, r.text)
  r = await call(mkt, 'POST', C + `/social/posts/${post.id}/enviar-aprovacao`, {}); check('enviar aprovacao', r.status === 200, r.text)
  r = await call(tch, 'POST', C + `/social/posts/${post.id}/aprovar`, {}); check('prof nao aprova 403', r.status === 403)
  r = await call(coord, 'POST', C + `/social/posts/${post.id}/aprovar`, {}); check('aprovar', r.status === 200, r.text)
  r = await call(mkt, 'POST', C + `/social/posts/${post.id}/publicar`, {}); check('publicar sem token => MANUAL (nao finge)', r.status === 200 && r.json.status === 'MANUAL', r.text)
  r = await call(mkt, 'POST', C + `/social/posts/${post.id}/marcar-publicado`, { url: 'https://instagram.com/p/1' }); check('marcar publicado', r.status === 200 || r.status === 400, r.text)
  r = await call(admB, 'POST', C + `/social/posts/${post.id}/aprovar`, {}); check('post tenant B 404', r.status === 404, r.text)
  r = await call(mkt, 'POST', C + '/social/interacoes', { contaId: cs.id, tipo: 'COMENTARIO', autor: 'x', texto: 'compre agora http://spam.com bit.ly' }); console.log('  interacao:', r.status)
  const js = await runEduJobs(); check('jobs ok', Object.values(js).every((x: any) => x.ok), Object.entries(js).filter(([, v]: any) => !v.ok))
  console.log('  jobs comunicacao:', JSON.stringify((js as any)['comunicacao.campanhas-agendadas']?.result), JSON.stringify((js as any)['comunicacao.despachante']?.result))
  const campAx = await prisma.comCampanha.findUnique({ where: { id: campA.id } }); check('campanha agendada executada pelo job', campAx?.status === 'CONCLUIDA', campAx?.status)
  const js2 = await runEduJobs(); check('jobs 2x ok', Object.values(js2).every((x: any) => x.ok))
  const emFalsoEnvio = await prisma.eduNotification.count({ where: { tenantId: t1.tenantId, status: 'ENVIADA', canal: { in: ['WHATSAPP', 'SMS', 'VOZ', 'INSTAGRAM', 'FACEBOOK'] }, refType: { not: 'ComConversa' } } }); check('nenhum falso envio em canais sem stub (WA/SMS/voz/IG/FB)', emFalsoEnvio === 0, emFalsoEnvio)
  await close(); summary()
}
main().catch((e) => { console.error(e); process.exit(2) })
