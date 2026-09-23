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
