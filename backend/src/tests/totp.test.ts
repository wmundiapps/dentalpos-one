import assert from 'node:assert/strict'
import { base32Decode, base32Encode, hotp, verifyTotp, totpAt, generateSecret } from '../services/totpService'

// Vetores RFC 4226 (secret "12345678901234567890")
const sec = Buffer.from('12345678901234567890')
const expected = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489']
expected.forEach((e, i) => assert.equal(hotp(sec, i), e, `HOTP ${i}`))

// Vetores RFC 6238 SHA1 (8 dígitos)
const r6238: [number, string][] = [[59, '94287082'], [1111111109, '07081804'], [1111111111, '14050471'], [1234567890, '89005924'], [2000000000, '69279037'], [20000000000, '65353130']]
for (const [t, e] of r6238) assert.equal(hotp(sec, Math.floor(t / 30), 8), e, `TOTP ${t}`)

// base32 ida e volta
const s = generateSecret()
assert.equal(base32Encode(base32Decode(s)), s)
assert.equal(base32Encode(Buffer.from('foobar')), 'MZXW6YTBOI')

// janela e replay
const now = 1_700_000_000_000
const code = totpAt(s, now)
const c = verifyTotp(s, code, { now })
assert.ok(c !== null)
assert.equal(verifyTotp(s, code, { now, lastCounter: c }), null, 'replay bloqueado')
assert.ok(verifyTotp(s, totpAt(s, now - 30_000), { now }) !== null, 'janela -1')
assert.equal(verifyTotp(s, totpAt(s, now - 120_000), { now }), null, 'fora da janela')
assert.equal(verifyTotp(s, '12345', { now }), null)
assert.equal(verifyTotp(s, 'abcdef', { now }), null)
console.log('totp OK')
