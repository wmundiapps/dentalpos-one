import assert from 'node:assert/strict'
import { DEFAULT_CONFIG } from '../src/security/config'
import { hostAllowed, originAllowed } from '../src/security/guard'
import { sniffDangerous, sniffImage } from '../src/security/files'
import { imageFromDataUrl, safeJsonParse, sanitizeProject } from '../src/security/sanitize'
import { judge } from '../src/security/nsfw'
import { createProject } from '../src/core/project'

const cfg = DEFAULT_CONFIG
// domínio
for (const h of ['localhost', '127.0.0.1', 'dentalpos.com.br', 'app.dentalpos.com.br', 'dentalpos-one.vercel.app', 'dentalpos-one-git-x-robsonraveloliveira-7222.vercel.app']) assert.ok(hostAllowed(h, cfg), h)
for (const h of ['evil.com', 'dentalpos.com.br.evil.com', 'xdentalpos.com.br', 'dentalpos-one.vercel.app.evil.io', 'evil.com/dentalpos.com.br']) assert.ok(!hostAllowed(h, cfg), h)
assert.ok(originAllowed('https://app.dentalpos.com.br', cfg))
assert.ok(originAllowed('http://localhost:5173', cfg))
assert.ok(!originAllowed('https://evil.com', cfg))
assert.ok(!originAllowed('https://dentalpos.com.br.evil.com', cfg))
assert.ok(!originAllowed('http://dentalpos.com.br@evil.com', cfg))

// assinaturas
const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])
assert.equal(sniffImage(jpg), 'jpeg')
assert.ok(sniffDangerous(new Uint8Array([0x4d, 0x5a, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])))
assert.ok(sniffDangerous(new TextEncoder().encode('<svg xmlns="..."><script>')))
assert.ok(sniffDangerous(new TextEncoder().encode('#!/bin/sh\nrm -rf')))
assert.equal(sniffDangerous(jpg), null)

// NSFW (regras de decisão)
const n = cfg.nsfw
assert.ok(judge([{ className: 'Porn', probability: 0.9 }, { className: 'Neutral', probability: 0.1 }], n).blocked)
assert.ok(judge([{ className: 'Hentai', probability: 0.85 }], n).blocked)
assert.ok(judge([{ className: 'Porn', probability: 0.5 }, { className: 'Hentai', probability: 0.3 }, { className: 'Sexy', probability: 0.2 }], n).blocked)
assert.ok(!judge([{ className: 'Neutral', probability: 0.95 }, { className: 'Sexy', probability: 0.03 }, { className: 'Porn', probability: 0.02 }], n).blocked)

// import .dpd
assert.throws(() => safeJsonParse('{"a":{"__proto__":{"x":1}}}'))
assert.throws(() => safeJsonParse('{"constructor":{"prototype":{"x":1}}}'))
const evil = safeJsonParse(JSON.stringify({ ...createProject('t'), name: 'x'.repeat(5000), variants: [{ id: '<img onerror=1>', name: '<script>', params: { upperTo: 999, centralWidth: 1e12, shape: 'hack', mode: 'veneers' }, teeth: { 11: { status: 'rm -rf', dx: 'abc', w: 1e99 } } }], photos: Array.from({ length: 500 }, (_, i) => ({ id: 'p' + i, kind: 'x', name: 'n', width: 1, height: 1 })) }))
const p = sanitizeProject(evil)
assert.ok(p.name.length <= 200)
assert.ok(p.photos.length <= 40)
assert.match(p.variants[0].id, /^[A-Za-z0-9_\-.]+$/)
assert.equal(p.variants[0].params.upperTo, 8)
assert.ok(p.variants[0].params.centralWidth <= 1e4)
assert.equal(p.variants[0].params.shape, 'natural')
assert.equal(p.variants[0].teeth[11].status, 'natural')
assert.ok(Number.isFinite(p.variants[0].teeth[11].dx))
assert.equal(({} as Record<string, unknown>).polluted, undefined)

// data-URL de imagem
assert.equal(imageFromDataUrl('data:text/html;base64,PHNjcmlwdD4=', cfg), null)
assert.equal(imageFromDataUrl('javascript:alert(1)', cfg), null)
assert.equal(imageFromDataUrl('data:image/png;base64,' + Buffer.from('<html>').toString('base64'), cfg), null, 'assinatura falsa')
assert.ok(imageFromDataUrl('data:image/jpeg;base64,' + Buffer.from(jpg).toString('base64'), cfg))
console.log('segurança (unit) OK')
