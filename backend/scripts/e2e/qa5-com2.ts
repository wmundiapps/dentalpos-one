process.env.TENANT_SECRET_MASTER_KEY = process.env.TENANT_SECRET_MASTER_KEY || 'qa5-master-key'
import { setup, check, summary, prisma } from './qa5-lib'
import { twilioSignature } from '../../src/modules/comunicacao/pure'
import { lerCfg } from '../../src/modules/comunicacao/store'

const realFetch = globalThis.fetch
globalThis.fetch = (async (input: any, init?: any) => {
  const url = String(typeof input === 'string' ? input : input.url)
  if (url.startsWith('http://127.0.0.1')) return realFetch(input, init)
  const J = (status: number, body: any) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  if (url.includes('api.telegram.org')) return J(200, { ok: true, result: { message_id: 1 } })
  if (url.includes('twilio.com')) return J(201, { sid: 'SM' + Math.random().toString(36).slice(2) })
  return J(200, {})
}) as any

async function main() {
  const { call, t1, t2, close, base } = await setup()
  const admin = await t1.mk('ADMIN'), sup = await t1.mk('SUPPORT'), mkt = await t1.mk('MARKETING')
  const stu = await t1.mk('STUDENT', true)
  await prisma.student.update({ where: { id: stu.studentId }, data: { cpf: '123.456.789-09' } })
  const C = '/edu/comunicacao'
  await call(sup, 'POST', C + '/bootstrap', {})
  let r = await call(admin, 'POST', C + '/canais', { tipo: 'TELEGRAM', nome: 'Bot', provedor: 'TELEGRAM_BOT', config: { botToken: '123:ABCDEF' } }); const tg = r.json
  const tgCfg = lerCfg((await prisma.comCanal.findUnique({ where: { id: tg.id } }))!).cfg!
  r = await call(admin, 'POST', C + '/canais', { tipo: 'SMS', nome: 'SMS', provedor: 'TWILIO', config: { accountSid: 'ACxxx', authToken: 'twilio-token', from: '+5511999990000' } }); const sms = r.json
  r = await call(admin, 'POST', C + '/canais', { tipo: 'VOZ', nome: 'Voz', provedor: 'TWILIO', config: { accountSid: 'ACxxx', authToken: 'twilio-token', from: '+5511999990000' } }); const voz = r.json
  const H = { 'x-telegram-bot-api-secret-token': tgCfg.webhookSecret }
  const W = (id: string, suf = '') => `/public/edu/comunicacao/webhook/${id}${suf}`
  r = await call(sup, 'POST', C + '/contatos', { nome: 'Aluno Bot', telegramChatId: '4242', studentId: stu.studentId, telefone: '11977776666' }); check('contato aluno', r.status === 201, r.text); const ct = r.json
  const ar = (prisma as any).accountReceivable
  await ar.create({ data: { tenantId: t1.tenantId, studentId: stu.studentId, descricao: 'Mensalidade', valor: 700, dataVencimento: new Date(Date.now() - 864e5), status: 'ATRASADO', gatewayId: 'COB123' } })
  let id = 100
  const say = async (t: string) => { const x = await call(null, 'POST', W(tg.id), { message: { chat: { id: 4242 }, text: t, message_id: ++id } }, H); check('tg ' + t, x.status === 200, x.text); const out = await prisma.eduNotification.findMany({ where: { tenantId: t1.tenantId, canal: 'TELEGRAM' }, orderBy: { createdAt: 'desc' }, take: 1 }); return out[0]?.mensagem ?? '' }
  let m = await say('menu'); check('menu', /Boletos/.test(m), m)
  m = await say('1'); check('pede CPF antes de consultar', /CPF/.test(m) && !/COB123/.test(m), m)
  m = await say('0000'); check('CPF errado', /Não confere/.test(m) && !/COB123/.test(m), m)
  m = await say('1234'); check('CPF certo => boleto', /COB123|Mensalidade/.test(m), m)
  m = await say('SAIR'); check('opt-out por mensagem', /não receberá/.test(m), m)
  const pref = await prisma.comPreferencia.findFirst({ where: { contatoId: ct.id } }); check('preferencia registrada', pref?.consentimento === false && pref.finalidade === 'MARKETING', pref)
  m = await say('VOLTAR'); check('opt-in', /voltará/.test(m), m)
  // 3 CPFs errados => handoff
  await prisma.comConversa.updateMany({ where: { contatoId: ct.id }, data: { botEstado: null as any } }).catch(() => undefined)
  m = await say('menu'); m = await say('1'); m = await say('1'); m = await say('2'); m = await say('3')
  const conv = await prisma.comConversa.findFirst({ where: { tenantId: t1.tenantId, contatoId: ct.id, status: { notIn: ['RESOLVIDA'] } } })
  check('3 falhas de CPF => handoff', conv?.botAtivo === false, conv)
  // twilio válido
  const smsHost = new URL(base).host
  const urlSms = `http://${smsHost}/api/public/edu/comunicacao/webhook/${sms.id}`
  const params = { From: '+5511977776666', Body: 'ola quero ajuda', MessageSid: 'SMX1', To: '+5511999990000' }
  const sig = twilioSignature('twilio-token', urlSms, params)
  r = await call(null, 'POST', W(sms.id), new URLSearchParams(params).toString(), { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': sig }); check('twilio assinatura valida', r.status === 200, r.text)
  r = await call(null, 'POST', W(sms.id), new URLSearchParams({ ...params, Body: 'adulterado' }).toString(), { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': sig }); check('twilio corpo adulterado 401', r.status === 401, r.text)
  const urlVoz = `http://${smsHost}/api/public/edu/comunicacao/webhook/${voz.id}/voz/ura`
  const vp = { CallSid: 'CA1', From: '+5511977776666', To: '+5511999990000' }
  r = await call(null, 'POST', W(voz.id, '/voz/ura'), new URLSearchParams(vp).toString(), { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': twilioSignature('twilio-token', urlVoz, vp) }); check('URA twiml', r.status === 200 && /<Response>/.test(r.text) && /Gather/.test(r.text), r.text)
  const urlD = `http://${smsHost}/api/public/edu/comunicacao/webhook/${voz.id}/voz/digito`
  const dp = { CallSid: 'CA1', Digits: '1' }
  r = await call(null, 'POST', W(voz.id, '/voz/digito'), new URLSearchParams(dp).toString(), { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': twilioSignature('twilio-token', urlD, dp) }); check('URA digito', r.status === 200, r.text)
  r = await call(null, 'POST', W(voz.id, '/voz/digito'), new URLSearchParams(dp).toString(), { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': twilioSignature('twilio-token', urlD, { ...dp, Digits: '9' }) }); check('URA digito assinatura invalida 401', r.status === 401)
  // voz: ligar
  r = await call(sup, 'POST', C + '/voz/chamadas', { para: '11977776666', mensagem: 'Lembrete de pagamento' }); check('ligar', r.status === 201, r.text)
  await prisma.comCanal.update({ where: { id: voz.id }, data: { ativo: false } })
  r = await call(sup, 'POST', C + '/voz/chamadas', { para: '11977776666', mensagem: 'Lembrete de pagamento' }); check('ligar sem canal => 409 explicativo', r.status === 409 && /NÃO realizada/.test(r.text), r.text)
  r = await call(sup, 'PUT', C + '/voz/ura', { saudacao: 'Olá', opcoes: [{ digito: '1', rotulo: 'a', acao: 'ATENDENTE' }, { digito: '1', rotulo: 'b', acao: 'ATENDENTE' }] }); check('URA digitos repetidos 400', r.status === 400, r.text)
  // FAQ / fluxos
  r = await call(mkt, 'POST', C + '/bot/faq', { pergunta: 'Qual o prazo de trancamento?', resposta: 'Até 30 dias após o início.', palavrasChave: ['trancamento', 'prazo'] }); check('faq', r.status === 201, r.text)
  r = await call(mkt, 'POST', C + '/bot/fluxos', { nome: 'Quebrado', intencao: 'X', definicao: { inicio: 'a', nos: { a: { texto: 'oi', opcoes: [{ rotulo: 'x', proximo: 'zzz' }] } } } }); check('fluxo invalido 400', r.status === 400, r.text)
  r = await call(sup, 'POST', C + '/bot/simular', { texto: 'qual o prazo de trancamento' }); check('simular faq', r.status === 200 && r.json.origem === 'FAQ', r.text)
  r = await call(admin, 'POST', C + '/canais/' + tg.id + '/telegram/webhook', {}); check('registrar webhook telegram (stub)', r.status === 200, r.text)
  await close(); summary()
}
main().catch((e) => { console.error(e); process.exit(2) })
