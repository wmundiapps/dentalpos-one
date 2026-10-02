#!/usr/bin/env node
// Monta o bloco EduMaster Pro dentro de prisma/schema.prisma a partir dos
// fragmentos em prisma/edu/*.prisma (fonte da verdade). Idempotente.
// Uso: node scripts/merge-edu-schema.js
const fs = require('fs')
const path = require('path')

const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma')
const eduDir = path.join(__dirname, '..', 'prisma', 'edu')
const BEGIN = '// ==== EDUMASTER:BEGIN (gerado por scripts/merge-edu-schema.js - edite prisma/edu/*.prisma) ===='
const END = '// ==== EDUMASTER:END ===='

const order = ['academico', 'financeiro', 'conteudo', 'provas-ia']
const files = fs.readdirSync(eduDir).filter((f) => f.endsWith('.prisma')).map((f) => f.replace(/\.prisma$/, ''))
files.sort((a, b) => {
  const ia = order.indexOf(a), ib = order.indexOf(b)
  if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
  return a.localeCompare(b)
})

const body = files.map((f) => `// ---- edu/${f}.prisma ----\n` + fs.readFileSync(path.join(eduDir, f + '.prisma'), 'utf8').trim() + '\n').join('\n')
let schema = fs.readFileSync(schemaPath, 'utf8')
const block = `${BEGIN}\n\n${body}\n${END}\n`
const re = new RegExp(`${BEGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n?`)
schema = re.test(schema) ? schema.replace(re, block) : schema.trimEnd() + '\n\n' + block
fs.writeFileSync(schemaPath, schema)
console.log(`EduMaster: ${files.length} fragmentos mesclados (${files.join(', ')})`)
