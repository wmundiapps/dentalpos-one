import assert from 'node:assert/strict'
import {
  BotDef, backoffMs, calcularAlvosRegua, decidirRetentativa, dentroDaJanela, detectarOptOut, extractVars, formatBRL, normalizePhone, passoBot, pickDestino, podeEnviar, podeTransicionarPost,
  proximaJanela, pontuarGatilhos, rankFaq, renderTemplate, svixSignature, twilioSignature, validarBotDef, validarPostParaRede, verificarCpfPrefixo, verifyMeta, metaSignature, verifySvix, verifyTwilio,
  verifyTelegram, twimlUra, statusSla, triarTexto, escolherOpcao,
} from './pure'
import { parseResend, parseTelegram, parseTwilioInbound, parseWhatsAppMeta, faltandoCampos } from './adapters'

let n = 0
const t = (nome: string, fn: () => void) => {
  fn()
  n++
  console.log('ok -', nome)
}

t('normalizePhone', () => {
  assert.equal(normalizePhone('(11) 99999-8888'), '+5511999998888')
  assert.equal(normalizePhone('5511999998888'), '+5511999998888')
  assert.equal(normalizePhone('+55 11 3333-4444'), '+551133334444')
  assert.equal(normalizePhone('123'), null)
})

t('templates', () => {
  const r = renderTemplate('Olá {{nome}}, vence {{ vencimento }} {{x}}', { nome: 'Ana', vencimento: '10/12/2026' })
  assert.equal(r.texto, 'Olá Ana, vence 10/12/2026 ')
  assert.deepEqual(r.faltantes, ['x'])
  assert.deepEqual(extractVars('{{a}} {{b}} {{a}}'), ['a', 'b'])
  assert.equal(formatBRL(1250.5), 'R$ 1.250,50')
})

const cfg = { horarioInicio: '08:00', horarioFim: '20:00', diasUteis: [1, 2, 3, 4, 5, 6] }
t('janela comercial (BRT)', () => {
  // 2026-10-02 é sexta. 12:00 UTC = 09:00 BRT -> dentro
  assert.equal(dentroDaJanela(new Date('2026-10-02T12:00:00Z'), cfg), true)
  // 03:00 UTC = 00:00 BRT -> fora
  assert.equal(dentroDaJanela(new Date('2026-10-02T03:00:00Z'), cfg), false)
  // 23:30 UTC = 20:30 BRT -> fora; próxima = sábado 08:00 BRT = 11:00 UTC
  const p = proximaJanela(new Date('2026-10-02T23:30:00Z'), cfg)
  assert.equal(p.toISOString(), '2026-10-03T11:00:00.000Z')
  // sábado 20:30 BRT, domingo fechado -> segunda 08:00 BRT
  const p2 = proximaJanela(new Date('2026-10-03T23:30:00Z'), cfg)
  assert.equal(p2.toISOString(), '2026-10-05T11:00:00.000Z')
  // domingo é fechado
  assert.equal(dentroDaJanela(new Date('2026-10-04T15:00:00Z'), cfg), false)
})

t('retentativas com backoff', () => {
  assert.equal(backoffMs(1, [5, 15, 60]), 5 * 60_000)
  assert.equal(backoffMs(3, [5, 15, 60]), 60 * 60_000)
  assert.equal(backoffMs(9, [5, 15, 60]), 60 * 60_000)
  const now = new Date('2026-01-01T00:00:00Z')
  assert.equal(decidirRetentativa({ tentativas: 1, maxTentativas: 4, retryable: true, now, backoff: [5, 15] }).acao, 'RETENTAR')
  assert.equal(decidirRetentativa({ tentativas: 4, maxTentativas: 4, retryable: true, now, backoff: [5, 15] }).acao, 'FALHAR')
  assert.equal(decidirRetentativa({ tentativas: 1, maxTentativas: 4, retryable: false, now, backoff: [5] }).acao, 'FALHAR')
})

t('consentimento LGPD', () => {
  assert.equal(podeEnviar([], 'WHATSAPP', 'COBRANCA').ok, true)
  assert.equal(podeEnviar([], 'WHATSAPP', 'MARKETING', { exigirOptInMarketing: true }).ok, false)
  // opt-out de marketing não bloqueia cobrança
  const p = [{ canal: '*', finalidade: 'MARKETING', consentimento: false }]
  assert.equal(podeEnviar(p, 'EMAIL', 'MARKETING').ok, false)
  assert.equal(podeEnviar(p, 'EMAIL', 'COBRANCA').ok, true)
  // TODAS bloqueia tudo; exceção específica vence
  const q = [{ canal: '*', finalidade: 'TODAS', consentimento: false }, { canal: 'EMAIL', finalidade: 'COBRANCA', consentimento: true }]
  assert.equal(podeEnviar(q, 'WHATSAPP', 'ACADEMICO').ok, false)
  assert.equal(podeEnviar(q, 'EMAIL', 'COBRANCA').ok, true)
  assert.equal(detectarOptOut('SAIR'), 'OPT_OUT')
  assert.equal(detectarOptOut(' Parar! '), 'OPT_OUT')
  assert.equal(detectarOptOut('quero'), 'OPT_IN')
  assert.equal(detectarOptOut('quero saber o valor'), null)
})

t('destino por canal', () => {
  const c = { email: 'A@B.com', telefone: '+5511999998888', telegramChatId: '123' }
  assert.equal(pickDestino('EMAIL', c), 'a@b.com')
  assert.equal(pickDestino('WHATSAPP', c), '+5511999998888')
  assert.equal(pickDestino('TELEGRAM', c), '123')
  assert.equal(pickDestino('EMAIL', { email: 'ruim' }), null)
})

t('régua de cobrança: gatilhos, tolerância e dedupe', () => {
  const etapas = [
    { id: 'e-3', offsetDias: -3, ativa: true },
    { id: 'e0', offsetDias: 0, ativa: true },
    { id: 'e3', offsetDias: 3, ativa: true },
    { id: 'e10', offsetDias: 10, ativa: true },
  ]
  const now = new Date('2026-10-10T15:00:00Z') // 12:00 BRT
  const venc = (d: string) => new Date(d + 'T03:00:00Z') // 00:00 BRT
  // vence em 3 dias -> e-3
  let r = calcularAlvosRegua([{ id: 't1', vencimento: venc('2026-10-13'), status: 'PENDENTE' }], etapas, new Set(), now, 2)
  assert.deepEqual(r.map((x) => x.etapaId), ['e-3'])
  // vence hoje -> e0
  r = calcularAlvosRegua([{ id: 't2', vencimento: venc('2026-10-10'), status: 'PENDENTE' }], etapas, new Set(), now, 2)
  assert.deepEqual(r.map((x) => x.etapaId), ['e0'])
  // venceu há 3 dias -> e3 (e não e0: fora da tolerância 0..2)
  r = calcularAlvosRegua([{ id: 't3', vencimento: venc('2026-10-07'), status: 'ATRASADO' }], etapas, new Set(), now, 2)
  assert.deepEqual(r.map((x) => x.etapaId), ['e3'])
  // catch-up: job parou, venceu há 4 dias -> ainda e3 (tolerância 2 => dias 3..5)
  r = calcularAlvosRegua([{ id: 't4', vencimento: venc('2026-10-06'), status: 'ATRASADO' }], etapas, new Set(), now, 2)
  assert.deepEqual(r.map((x) => x.etapaId), ['e3'])
  // já executada -> nada (sem duplicar)
  r = calcularAlvosRegua([{ id: 't4', vencimento: venc('2026-10-06'), status: 'ATRASADO' }], etapas, new Set(['e3|t4']), now, 2)
  assert.equal(r.length, 0)
  // atraso de 30 dias: nenhuma etapa antiga dispara (não bombardeia)
  r = calcularAlvosRegua([{ id: 't5', vencimento: venc('2026-09-10'), status: 'ATRASADO' }], etapas, new Set(), now, 2)
  assert.equal(r.length, 0)
  // pago/cancelado nunca
  r = calcularAlvosRegua([{ id: 't6', vencimento: venc('2026-10-10'), status: 'PAGO' }, { id: 't7', vencimento: venc('2026-10-10'), status: 'CANCELADO' }], etapas, new Set(), now, 2)
  assert.equal(r.length, 0)
  // etapas sobrepostas no catch-up: só a mais recente
  const et2 = [{ id: 'a', offsetDias: 0, ativa: true }, { id: 'b', offsetDias: 1, ativa: true }]
  r = calcularAlvosRegua([{ id: 't8', vencimento: venc('2026-10-09'), status: 'ATRASADO' }], et2, new Set(), now, 2)
  assert.deepEqual(r.map((x) => x.etapaId), ['b'])
})

const def: BotDef = {
  inicio: 'raiz',
  nos: {
    raiz: { texto: 'Menu', opcoes: [{ rotulo: 'Boletos e pagamentos', gatilhos: ['mensalidade'], acao: 'BOLETO' }, { rotulo: 'Cursos', proximo: 'cursos' }, { rotulo: 'Sair', acao: 'FIM' }] },
    cursos: { texto: 'Cursos disponíveis', opcoes: [{ rotulo: 'Voltar', proximo: 'raiz' }, { rotulo: 'Atendente', acao: 'HANDOFF' }] },
  },
}
t('chatbot: árvore de menu', () => {
  assert.deepEqual(validarBotDef(def), [])
  assert.ok(validarBotDef({ inicio: 'x', nos: { a: { texto: 'a', opcoes: [{ rotulo: 'r', proximo: 'zzz' }] } } }).length >= 2)
  let p = passoBot(def, {}, 'oi')
  assert.equal(p.tipo, 'MENSAGEM')
  assert.match((p as any).texto, /1 - Boletos/)
  p = passoBot(def, p.estado, '2')
  assert.equal(p.tipo, 'MENSAGEM')
  assert.equal(p.estado.no, 'cursos')
  p = passoBot(def, p.estado, 'quero falar com atendente')
  assert.equal(p.tipo, 'HANDOFF')
  // opção por palavra
  p = passoBot(def, { no: 'raiz' }, 'minha mensalidade')
  assert.equal(p.tipo, 'ACAO')
  assert.equal((p as any).acao, 'BOLETO')
  // 3 entradas inválidas => handoff
  let e: any = { no: 'raiz' }
  let q = passoBot(def, e, 'blablabla')
  assert.equal(q.tipo, 'MENSAGEM')
  q = passoBot(def, q.estado, 'blablabla')
  q = passoBot(def, q.estado, 'blablabla')
  assert.equal(q.tipo, 'HANDOFF')
  assert.equal(passoBot(def, { no: 'raiz' }, '3').tipo, 'FIM')
  assert.equal(escolherOpcao(def.nos.raiz, '9'), null)
  assert.equal(pontuarGatilhos(['segunda via', 'boleto'], 'preciso da segunda via do boleto'), 3)
  assert.equal(pontuarGatilhos(['nota'], 'anotação'), 0)
})

t('FAQ ranking e verificação de CPF', () => {
  const faqs = [
    { id: '1', pergunta: 'Como emitir a segunda via do boleto?', resposta: 'r1', palavrasChave: ['boleto'] },
    { id: '2', pergunta: 'Qual o horário de atendimento?', resposta: 'r2', palavrasChave: ['horario'] },
  ]
  const r = rankFaq(faqs, 'preciso do boleto de novo')
  assert.equal(r[0].faq.id, '1')
  assert.equal(rankFaq(faqs, 'xyz qwe').length, 0)
  assert.equal(verificarCpfPrefixo('123.456.789-09', '1234'), true)
  assert.equal(verificarCpfPrefixo('12345678909', '1235'), false)
  assert.equal(verificarCpfPrefixo('12345678909', '12'), false)
  assert.equal(verificarCpfPrefixo(null, '1234'), false)
})

t('SLA e triagem', () => {
  const now = new Date('2026-10-02T12:00:00Z')
  assert.equal(statusSla({ status: 'ABERTA', slaPrimeiraRespostaEm: new Date('2026-10-02T12:30:00Z'), slaResolucaoEm: null }, now), 'OK')
  assert.equal(statusSla({ status: 'ABERTA', slaPrimeiraRespostaEm: new Date('2026-10-02T12:10:00Z'), slaResolucaoEm: null }, now), 'ATENCAO')
  assert.equal(statusSla({ status: 'ABERTA', slaPrimeiraRespostaEm: new Date('2026-10-02T11:00:00Z'), slaResolucaoEm: null }, now), 'ESTOURADO')
  assert.equal(statusSla({ status: 'RESOLVIDA' }, now), 'ENCERRADA')
  assert.equal(triarTexto('Vou ao Procon, isso é golpe').alerta, 'golpe')
  assert.equal(triarTexto('Ganhe dinheiro rápido clique aqui').spam, true)
  assert.equal(triarTexto('Parabéns pela formatura!').spam, false)
})

t('posts: máquina de estados e validação por rede', () => {
  assert.equal(podeTransicionarPost('RASCUNHO', 'EM_APROVACAO'), true)
  assert.equal(podeTransicionarPost('RASCUNHO', 'APROVADO'), false)
  assert.equal(podeTransicionarPost('EM_APROVACAO', 'APROVADO'), true)
  assert.equal(podeTransicionarPost('PUBLICADO', 'RASCUNHO'), false)
  assert.equal(podeTransicionarPost('APROVADO', 'MANUAL'), true)
  assert.equal(validarPostParaRede('X', 'a'.repeat(281), []).length, 1)
  assert.equal(validarPostParaRede('INSTAGRAM', 'legenda', []).length, 1)
  assert.equal(validarPostParaRede('FACEBOOK', 'texto', []).length, 0)
})

t('assinaturas de webhook', () => {
  // Twilio (vetor da documentação oficial)
  const url = 'https://mycompany.com/myapp.php?foo=1&bar=2'
  const params = { CallSid: 'CA1234567890ABCDE', Caller: '+14158675310', Digits: '1234', From: '+14158675310', To: '+18005551212' }
  const sig = twilioSignature('12345', url, params)
  assert.equal(sig, 'GvWf1cFY/Q7PnoempGyD5oXAezc=')
  assert.equal(verifyTwilio('12345', url, params, sig), true)
  assert.equal(verifyTwilio('12345', url, { ...params, Digits: '9' }, sig), false)
  assert.equal(verifyTwilio('', url, params, sig), false)
  // Meta
  const body = Buffer.from('{"a":1}')
  const ms = metaSignature('segredo', body)
  assert.equal(verifyMeta('segredo', body, ms), true)
  assert.equal(verifyMeta('outro', body, ms), false)
  assert.equal(verifyMeta('segredo', body, undefined), false)
  // Telegram
  assert.equal(verifyTelegram('abc', 'abc'), true)
  assert.equal(verifyTelegram('abc', 'abd'), false)
  assert.equal(verifyTelegram('', ''), false)
  // Svix/Resend
  const secret = 'whsec_' + Buffer.from('chave-super-secreta').toString('base64')
  const ts = String(Math.floor(Date.now() / 1000))
  const s = svixSignature(secret, 'msg_1', ts, '{"x":1}')
  assert.equal(verifySvix(secret, '{"x":1}', { id: 'msg_1', timestamp: ts, signature: `v1,${s}` }), true)
  assert.equal(verifySvix(secret, '{"x":2}', { id: 'msg_1', timestamp: ts, signature: `v1,${s}` }), false)
  assert.equal(verifySvix(secret, '{"x":1}', { id: 'msg_1', timestamp: String(Number(ts) - 4000), signature: `v1,${s}` }), false)
})

t('parsers inbound', () => {
  const tg = parseTelegram({ message: { message_id: 7, chat: { id: 99 }, from: { first_name: 'Ana', last_name: 'B' }, text: 'oi' } })
  assert.deepEqual([tg?.chaveExterna, tg?.nome, tg?.texto, tg?.externalId], ['99', 'Ana B', 'oi', '7'])
  const wa = parseWhatsAppMeta({ entry: [{ changes: [{ value: { contacts: [{ wa_id: '5511999998888', profile: { name: 'Zé' } }], messages: [{ from: '5511999998888', id: 'wamid.1', type: 'text', text: { body: 'olá' } }], statuses: [{ id: 'wamid.0', status: 'read' }] } }] }] })
  assert.equal(wa.mensagens[0].telefone, '+5511999998888')
  assert.equal(wa.status[0].status, 'LIDA')
  const tw = parseTwilioInbound({ From: 'whatsapp:+5511999998888', Body: 'oi', MessageSid: 'SM1' })
  assert.equal(tw?.telefone, '+5511999998888')
  const rs = parseResend({ type: 'email.delivered', data: { email_id: 'e1' } })
  assert.equal(rs.status?.status, 'ENTREGUE')
  assert.deepEqual(faltandoCampos('TELEGRAM', 'TELEGRAM_BOT', {}), ['botToken'])
  assert.deepEqual(faltandoCampos('EMAIL', 'RESEND', { apiKey: 'k', from: 'a@b.c' }), [])
})

t('TwiML', () => {
  const x = twimlUra({ saudacao: 'Olá & bem-vindo', opcoes: [{ digito: '1', rotulo: 'secretaria', acao: 'ATENDENTE' }] }, 'https://x/y?a=1&b=2')
  assert.match(x, /<Gather/)
  assert.match(x, /Olá &amp; bem-vindo/)
  assert.match(x, /a=1&amp;b=2/)
})

console.log(`\n${n} grupos de testes OK`)
