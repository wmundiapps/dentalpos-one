#!/usr/bin/env node
// Monta o bloco EduMaster Pro dentro de prisma/schema.prisma a partir dos
// fragmentos em prisma/edu/*.prisma (fonte da verdade). Idempotente.
// Cada fragmento é validado isoladamente: se um quebrar o schema, ele é
// PULADO (e o erro é mostrado) para não derrubar os demais módulos.
// Uso: node scripts/merge-edu-schema.js [--strict]   (strict: falha se algum for pulado)
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma')
const eduDir = path.join(__dirname, '..', 'prisma', 'edu')
const BEGIN = '// ==== EDUMASTER:BEGIN (gerado por scripts/merge-edu-schema.js - edite prisma/edu/*.prisma) ===='
const END = '// ==== EDUMASTER:END ===='
const strict = process.argv.includes('--strict')

const base = ['core', 'academico', 'financeiro', 'conteudo', 'provas-ia']
const all = fs.readdirSync(eduDir).filter((f) => f.endsWith('.prisma')).map((f) => f.replace(/\.prisma$/, ''))
const files = [...base.filter((b) => all.includes(b)), ...all.filter((f) => !base.includes(f)).sort()]

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const re = new RegExp(`${escRe(BEGIN)}[\\s\\S]*?${escRe(END)}\\n?`)
let schema = fs.readFileSync(schemaPath, 'utf8')
const rest = schema.replace(re, '').trimEnd() + '\n'

const prisma = path.join(__dirname, '..', 'node_modules', '.bin', 'prisma')
const env = { ...process.env, DATABASE_URL: process.env.DATABASE_URL || 'postgresql://u:p@localhost:5432/db' }
const tmp = path.join(require('os').tmpdir(), `edu-merge-${process.pid}.prisma`)

function frag(f) {
  return `// ---- edu/${f}.prisma ----\n` + fs.readFileSync(path.join(eduDir, f + '.prisma'), 'utf8').trim() + '\n'
}
function valid(text) {
  fs.writeFileSync(tmp, text)
  const r = spawnSync(prisma, ['validate', '--schema', tmp], { env, encoding: 'utf8' })
  return { ok: r.status === 0, out: (r.stdout || '') + (r.stderr || '') }
}
const wrap = (body) => `${rest}\n${BEGIN}\n\n${body}\n${END}\n`

let body = ''
const merged = []
const skipped = []
for (const f of files) {
  const candidate = body + (body ? '\n' : '') + frag(f)
  const v = valid(wrap(candidate))
  if (v.ok) { body = candidate; merged.push(f) }
  else {
    skipped.push(f)
    const msg = v.out.split('\n').filter((l) => /error|-->|\|/.test(l)).slice(0, 14).join('\n')
    console.error(`\n✖ fragmento "${f}" ignorado (schema inválido):\n${msg}\n`)
  }
}
try { fs.unlinkSync(tmp) } catch {}
fs.writeFileSync(schemaPath, wrap(body))
console.log(`EduMaster: ${merged.length} fragmentos mesclados (${merged.join(', ')})` + (skipped.length ? ` | IGNORADOS: ${skipped.join(', ')}` : ''))
if (strict && skipped.length) process.exit(1)
