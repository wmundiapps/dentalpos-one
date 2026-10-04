import assert from 'node:assert/strict'
import { validatePassword } from '../utils/passwordPolicy'
import { checkUploadMeta } from '../utils/uploadPolicy'
import { lockMinutes } from '../services/userSecurityService'
import { generateBackupCodes, hashBackupCode } from '../services/totpService'

// senha
assert.ok(validatePassword('curta1A!'))
assert.ok(validatePassword('semnumeroousimbolo'))
assert.ok(validatePassword('Dentalpos1234!'), 'comum')
assert.ok(validatePassword('Robson#2026xx', ['robson@x.com']), 'contém nome')
assert.equal(validatePassword('Tr0ca-Tudo!Agora'), null)

// upload
assert.equal(checkUploadMeta('foto.jpg', 'jpg', 'image/jpeg'), null)
assert.equal(checkUploadMeta('modelo.stl', 'stl', 'model/stl'), null)
assert.ok(checkUploadMeta('virus.exe', 'exe', 'application/octet-stream'))
assert.ok(checkUploadMeta('foto.php.jpg', 'jpg', 'image/jpeg'), 'dupla extensão')
assert.ok(checkUploadMeta('a.svg', 'svg', 'image/svg+xml'))
assert.ok(checkUploadMeta('a.jpg', 'jpg', 'text/html'))
assert.ok(checkUploadMeta('x.pdf', 'pdf', 'application/pdf', 'http://exemplo.com/x.pdf'), 'http bloqueado')
assert.ok(checkUploadMeta('x.pdf', 'pdf', 'application/pdf', 'https://127.0.0.1/x.pdf'), 'ip interno')
assert.equal(checkUploadMeta('x.pdf', 'pdf', 'application/pdf', 'https://exemplo.com/x.pdf'), null)

// bloqueio progressivo
assert.equal(lockMinutes(4), 0)
assert.equal(lockMinutes(5), 5)
assert.equal(lockMinutes(10), 10)
assert.equal(lockMinutes(100), 60)

// recuperação
const codes = generateBackupCodes()
assert.equal(codes.length, 8)
assert.equal(hashBackupCode(codes[0]), hashBackupCode(codes[0].replace(/-/g, '').toUpperCase()))
console.log('policies OK')
