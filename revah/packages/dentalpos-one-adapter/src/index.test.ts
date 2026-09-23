import { test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'crypto'
import { createSsoToken, verifyRevahWebhook, hmacHex } from './index'

test('token SSO HS256 com aud/iss e jti', () => {
  const t = createSsoToken('s3cr3t', { clinicId: 7, email: 'a@b.com', role: 'ADMIN' })
  const [h, p, s] = t.split('.')
  assert.equal(crypto.createHmac('sha256', 's3cr3t').update(`${h}.${p}`).digest('base64url'), s)
  const claims = JSON.parse(Buffer.from(p, 'base64url').toString())
  assert.equal(claims.aud, 'revah')
  assert.equal(claims.iss, 'dentalpos-one')
  assert.equal(claims.clinicId, '7')
  assert.ok(claims.jti && claims.exp - claims.iat <= 300)
})

test('valida webhook do REVAH', () => {
  const body = JSON.stringify({ type: 'revah.opt_out' })
  const ts = Math.floor(Date.now() / 1000).toString()
  const sig = hmacHex('k', `${ts}.${body}`)
  assert.ok(verifyRevahWebhook(body, ts, sig, 'k'))
  assert.ok(!verifyRevahWebhook(body, ts, sig, 'outro'))
  assert.ok(!verifyRevahWebhook(body, '1000', hmacHex('k', `1000.${body}`), 'k'))
})
