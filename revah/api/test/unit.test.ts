import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizePhone, normalizeEmail, renderTemplate, contactVars } from '../src/lib/normalize'
import { parseCsv, pickField } from '../src/lib/csv'
import { detectOptOut } from '../src/services/suppression'
import { isWithinWindows, nextAllowedTime, DEFAULT_WINDOWS, zonedToUtc } from '../src/services/voice/windows'
import { twilioSignature, TwiML } from '../src/services/voice/twilio'
import { encryptJson, decryptJson, signPayload, verifyPayload } from '../src/lib/crypto'

test('normaliza telefones brasileiros', () => {
  assert.equal(normalizePhone('(44) 99999-1111'), '5544999991111')
  assert.equal(normalizePhone('+55 11 3333-4444'), '551133334444')
  assert.equal(normalizePhone('44999991111'), '5544999991111')
  assert.equal(normalizePhone('123'), null)
  assert.equal(normalizeEmail(' Fulano@Email.COM '), 'fulano@email.com')
  assert.equal(normalizeEmail('invalido@'), null)
})

test('detecta pedidos de opt-out', () => {
  for (const t of ['SAIR', 'parar', 'Stop!', 'não quero mais receber mensagens', 'para de me mandar mensagem', 'nao me ligue mais', 'me tire da lista']) assert.ok(detectOptOut(t), t)
  for (const t of ['quero agendar', 'saiu o resultado?', 'bom dia', 'pode parar na recepção?']) assert.ok(!detectOptOut(t), t)
})

test('templates e CSV', () => {
  assert.equal(renderTemplate('Olá {{primeiro_nome}} da {{empresa}}{{x}}', contactVars({ name: 'Ana Souza', company: 'ACME' })), 'Olá Ana da ACME')
  const rows = parseCsv('Nome;Telefone;E-mail\n"Silva, Ana";(44) 99999-1111;ana@x.com\n;;\nBruno;44988887777;')
  assert.equal(rows.length, 2)
  assert.equal(pickField(rows[0], 'name'), 'Silva, Ana')
  assert.equal(pickField(rows[1], 'phone'), '44988887777')
})

test('janelas de horário para ligações (America/Sao_Paulo)', () => {
  const tz = 'America/Sao_Paulo'
  const wedNoon = zonedToUtc(2026, 9, 23, 12, 0, tz) // quarta
  assert.ok(isWithinWindows(wedNoon, DEFAULT_WINDOWS, tz))
  const wedNight = zonedToUtc(2026, 9, 23, 22, 30, tz)
  assert.ok(!isWithinWindows(wedNight, DEFAULT_WINDOWS, tz))
  const next = nextAllowedTime(wedNight, DEFAULT_WINDOWS, tz)!
  assert.equal(next.toISOString(), zonedToUtc(2026, 9, 24, 9, 0, tz).toISOString())
  const sunday = zonedToUtc(2026, 9, 27, 10, 0, tz)
  assert.equal(nextAllowedTime(sunday, DEFAULT_WINDOWS, tz)!.toISOString(), zonedToUtc(2026, 9, 28, 9, 0, tz).toISOString())
  // Feriado de 12/10 (segunda) é pulado.
  const holiday = zonedToUtc(2026, 10, 12, 10, 0, tz)
  assert.ok(!isWithinWindows(holiday, DEFAULT_WINDOWS, tz))
  assert.equal(nextAllowedTime(holiday, DEFAULT_WINDOWS, tz)!.toISOString(), zonedToUtc(2026, 10, 13, 9, 0, tz).toISOString())
})

test('assinatura Twilio (exemplo oficial) e TwiML escapado', () => {
  const sig = twilioSignature('12345', 'https://mycompany.com/myapp.php?foo=1&bar=2', {
    CallSid: 'CA1234567890ABCDE',
    Caller: '+12349013030',
    Digits: '1234',
    From: '+12349013030',
    To: '+18005551212',
  })
  assert.equal(sig, '0/KCTR6DLpKmkAf8muzZqo1nDgQ=')
  const xml = new TwiML().say('A & B <ok>').hangup().toString()
  assert.ok(xml.includes('A &amp; B &lt;ok&gt;'))
})

test('criptografia de credenciais e tokens assinados', () => {
  const enc = encryptJson({ token: 'segredo' })
  assert.ok(!enc.includes('segredo'))
  assert.deepEqual(decryptJson(enc), { token: 'segredo' })
  const t = signPayload({ t: 'x', c: 'EMAIL', v: 'a@b.com' })
  assert.deepEqual(verifyPayload(t), { t: 'x', c: 'EMAIL', v: 'a@b.com' })
  assert.equal(verifyPayload(t.slice(0, -2) + 'aa'), null)
})

test('base empresarial: leitura das linhas de estabelecimentos', async () => {
  const { splitRow, establishmentRecord, shareInfo, latestMonth } = await import('../src/scripts/receitaImport')
  const line = '"12345678";"0001";"90";"1";"CLINICA";"02";"20200101";"00";"";"";"20100101";"8630504";"8630502";"RUA";"FLORES";"100";"";"CENTRO";"87010000";"PR";"7691";"44";"30301010";"";"";"";"";"a@b.com.br";"";""'
  const opts = { ufs: ['PR'], cnaes: ['863'], requireContact: true, cities: new Map([['7691', 'MARINGÁ']]), month: '2026-09' }
  const rec = establishmentRecord(splitRow(line), opts)
  assert.equal(rec?.cnpj, '12345678000190')
  assert.equal(rec?.cityNorm, 'maringa')
  assert.equal(rec?.phone, '554430301010')
  assert.equal(establishmentRecord(splitRow(line.replace('"02"', '"08"')), opts), null)
  assert.equal(establishmentRecord(splitRow(line), { ...opts, ufs: ['SP'] }), null)
  assert.equal(shareInfo('https://arquivos.receitafederal.gov.br/index.php/s/YggdBLfdninEJX9').token, 'YggdBLfdninEJX9')
  assert.equal(latestMonth(['2026-08', '2026-09', 'leiame.pdf']), '2026-09')
})

test('LinkedIn: respostas do formulário viram lead', async () => {
  const { linkedinLeadFromResponse } = await import('../src/services/leads/linkedin')
  const form = { content: { questions: [{ questionId: 1, predefinedField: 'FIRST_NAME' }, { questionId: 2, predefinedField: 'LAST_NAME' }, { questionId: 3, predefinedField: 'EMAIL' }, { questionId: 4, predefinedField: 'PHONE_NUMBER' }] } }
  const el = { id: 'abc', formResponse: { answers: [1, 2, 3, 4].map((q, i) => ({ questionId: q, answerDetails: { textQuestionAnswer: { answer: ['Ana', 'Lima', 'ANA@X.COM', '(44) 99999-8888'][i] } } })) } }
  const lead = linkedinLeadFromResponse(el, form)
  assert.equal(lead.name, 'Ana Lima')
  assert.equal(lead.email, 'ana@x.com')
  assert.equal(lead.phone, '5544999998888')
  assert.equal(lead.originRef, 'abc')
})

test('2 etapas: TOTP confere com o vetor do RFC 6238', async () => {
  const { hotp, base32Encode, base32Decode, matchStep } = await import('../src/services/twoFactor')
  const secret = Buffer.from('12345678901234567890')
  assert.equal(hotp(secret, 1), '287082') // T=59s → 94287082 (8 dígitos)
  assert.deepEqual(base32Decode(base32Encode(secret)), secret)
  assert.equal(matchStep(secret, '287082', 59_000), 1)
  assert.equal(matchStep(secret, '000000', 59_000), null)
})

test('captação: celular antigo sem o 9 e MEI', async () => {
  const { fixOldMobile, isMeiNature } = await import('../src/scripts/receitaImport')
  assert.equal(fixOldMobile('4499998888'), '44999998888') // celular antigo (começa em 9)
  assert.equal(fixOldMobile('4488887777'), '44988887777') // celular antigo (começa em 8)
  assert.equal(fixOldMobile('4430301010'), '4430301010') // fixo fica como está
  assert.equal(fixOldMobile('44999998888'), '44999998888') // já com o 9
  assert.equal(isMeiNature('213-5'), true)
  assert.equal(isMeiNature('2062'), false)
})
