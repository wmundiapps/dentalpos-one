// Utilitários compartilhados dos testes E2E do QA1 (admissões + secretaria).
import jwt from 'jsonwebtoken'
import http from 'http'
import { prisma } from '../../src/lib/prisma'

process.env.JWT_SECRET = process.env.JWT_SECRET || 'qa1-secret'
process.env.NODE_ENV = 'test'
process.env.PUBLIC_APP_URL = process.env.PUBLIC_APP_URL || 'http://localhost:3000'

export const SUF = Math.random().toString(36).slice(2, 8)
export const fails: string[] = []
let okCount = 0
export function check(nome: string, cond: any, detalhe?: any) {
  if (cond) { okCount++; return true }
  const msg = `FALHA: ${nome}${detalhe !== undefined ? ' -> ' + (typeof detalhe === 'string' ? detalhe : JSON.stringify(detalhe)).slice(0, 400) : ''}`
  fails.push(msg)
  console.log(msg)
  return false
}
export const resumo = () => console.log(`\nOK=${okCount} FALHAS=${fails.length}`)

export interface Ctx { tenantId: string; clinicId: string; users: Record<string, { id: string; token: string; studentId?: string }> }

export async function criarTenant(tag: string, roles: string[]): Promise<Ctx> {
  const tenantId = `qa1-${tag}-${SUF}`
  const clinic = await prisma.clinic.create({ data: { tenantId, name: `Instituto ${tag}`, email: `c-${tag}-${SUF}@q.com`, phone: '1', cnpj: '00.000.000/0001-00' } })
  const users: Ctx['users'] = {}
  for (const role of roles) {
    const u = await prisma.user.create({ data: { clinicId: clinic.id, tenantId, email: `${role.toLowerCase()}-${tag}-${SUF}@q.com`, password: 'x', firstName: role, lastName: 'Teste', role } })
    users[role] = { id: u.id, token: jwt.sign({ id: u.id, email: u.email, clinicId: clinic.id, tenantId, role }, process.env.JWT_SECRET!) }
  }
  return { tenantId, clinicId: clinic.id, users }
}

export async function criarAluno(ctx: Ctx, nome: string, key = 'STUDENT') {
  const u = await prisma.user.create({ data: { clinicId: ctx.clinicId, tenantId: ctx.tenantId, email: `al-${key}-${Math.random().toString(36).slice(2, 7)}@q.com`, password: 'x', firstName: nome.split(' ')[0], lastName: 'Aluno', role: 'STUDENT' } })
  const ra = `9${Math.floor(Math.random() * 1e8).toString().padStart(8, '0')}`
  const s = await prisma.student.create({ data: { tenantId: ctx.tenantId, userId: u.id, ra, nomeCompleto: nome, cpf: '52998224725' } })
  ctx.users[key] = { id: u.id, studentId: s.id, token: jwt.sign({ id: u.id, email: u.email, clinicId: ctx.clinicId, tenantId: ctx.tenantId, role: 'STUDENT' }, process.env.JWT_SECRET!) }
  return s
}

export async function subirApp() {
  const { default: app } = await import('../../src/app')
  const server = http.createServer(app).listen(0)
  const port = (server.address() as any).port
  const base = `http://127.0.0.1:${port}/api`
  let ipSeq = 1
  const call = async (token: string | null, method: string, path: string, body?: any, headers: Record<string, string> = {}) => {
    const r = await fetch(base + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json', 'x-forwarded-for': `10.0.${Math.floor(ipSeq / 250)}.${ipSeq++ % 250}`, ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined })
    const text = await r.text()
    let json: any = null
    try { json = JSON.parse(text) } catch { /* html */ }
    if (r.status >= 500) check(`5xx em ${method} ${path}`, false, text.slice(0, 300))
    return { status: r.status, json, text }
  }
  return { server, call, base }
}

export const CPFS = ['52998224725', '11144477735', '39053344705', '16899535009', '86288366757', '71428793860', '12345678909']
export const futuro = (dias: number) => new Date(Date.now() + dias * 86_400_000).toISOString()
