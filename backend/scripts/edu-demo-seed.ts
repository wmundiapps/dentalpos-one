/**
 * Seed de demonstração do EduMaster Pro (usa a API REAL com token ADMIN; contas via Prisma).
 * Uso:  DATABASE_URL=... npx tsx scripts/edu-demo-seed.ts   (backend rodando em API_URL, padrão http://localhost:3000/api)
 * Etapas: SEED_STEPS=contas,bootstrap,marca,... (padrão: todas; "marca" envia a logomarca e deve ser a última se quiser ver o estado sem logo).
 * Login: admin@ravel.edu.br / Ravel@2026  ·  aluno: aluno@ravel.edu.br / Aluno@2026 (clinicId impresso ao final).
 */
import bcrypt from 'bcryptjs'
import { prisma } from '../src/lib/prisma'

const API = process.env.API_URL || 'http://localhost:3000/api'
const TENANT = 'ravel-ies'
export const ADMIN = { email: 'admin@ravel.edu.br', password: 'Ravel@2026' }
export const ALUNO = { email: 'aluno@ravel.edu.br', password: 'Aluno@2026' }

async function contas() {
  let clinic = await prisma.clinic.findFirst({ where: { tenantId: TENANT } })
  if (!clinic) {
    clinic = await prisma.clinic.create({
      data: { tenantId: TENANT, name: 'Instituto Ravel de Ensino Superior', displayName: 'Instituto Ravel de Ensino Superior', email: 'contato@ravel.edu.br', phone: '(11) 4002-8922', cnpj: '12.345.678/0001-90', plan: 'ENTERPRISE' } as any,
    })
  }
  const mk = async (email: string, password: string, firstName: string, lastName: string, role: string) => {
    const ex = await prisma.user.findFirst({ where: { clinicId: clinic!.id, email } })
    if (ex) return ex
    return prisma.user.create({ data: { clinicId: clinic!.id, tenantId: TENANT, email, password: await bcrypt.hash(password, 10), firstName, lastName, role, isActive: true } as any })
  }
  const admin = await mk(ADMIN.email, ADMIN.password, 'Helena', 'Ravel', 'ADMIN')
  return { clinic, admin, mk }
}

async function login(clinicId: string, cred: { email: string; password: string }) {
  const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clinicId, ...cred }) })
  const j: any = await r.json()
  if (!r.ok) throw new Error('login: ' + JSON.stringify(j))
  return j.token as string
}

type Ctx = {
  api: (m: string, p: string, b?: any) => Promise<any>
  tenantId: string
  clinicId: string
  mk: (email: string, password: string, firstName: string, lastName: string, role: string) => Promise<any>
  loginAs: (c: { email: string; password: string }) => Promise<string>
  failures: string[]
}

const MODULOS = ['admissoes', 'secretaria', 'calendario', 'notas', 'infraestrutura', 'suprimentos', 'regulatorio', 'governanca', 'desempenho', 'pesquisa', 'apoio', 'comunicacao', 'biblioteca', 'jornadas', 'modalidades', 'reitoria']

const STEPS: [string, (c: Ctx) => Promise<void>][] = [
  ['bootstrap', async (c) => { for (const m of MODULOS) await c.api('POST', `/edu/${m}/bootstrap`, {}) }],
]

async function main() {
  const { clinic, mk } = await contas()
  const token = await login(clinic.id, ADMIN)
  const failures: string[] = []
  const api = async (method: string, path: string, body?: any): Promise<any> => {
    const r = await fetch(`${API}${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body !== undefined ? JSON.stringify(body) : undefined })
    const t = await r.text()
    let j: any = null
    try { j = JSON.parse(t) } catch { /* texto */ }
    if (!r.ok) { failures.push(`${method} ${path} -> ${r.status} ${t.slice(0, 160)}`); return null }
    return j
  }
  const steps = (process.env.SEED_STEPS || '').split(',').filter(Boolean)
  const ctx: Ctx = { api, tenantId: TENANT, clinicId: clinic.id, mk, loginAs: (c) => login(clinic.id, c), failures }
  for (const [name, fn] of STEPS) {
    if (steps.length && !steps.includes(name)) continue
    console.log('>> etapa', name)
    await fn(ctx)
  }
  console.log(`\nclinicId=${clinic.id}\nadmin=${ADMIN.email} / ${ADMIN.password}\naluno=${ALUNO.email} / ${ALUNO.password}`)
  if (failures.length) { console.log(`\n${failures.length} chamadas falharam:`); failures.forEach((f) => console.log(' -', f)) }
  await prisma.$disconnect()
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
