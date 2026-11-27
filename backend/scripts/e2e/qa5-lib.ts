// Harness compartilhado dos testes e2e do QA5 (pesquisa/apoio/comunicacao/modalidades).
import jwt from 'jsonwebtoken'
import http from 'http'
import { prisma } from '../../src/lib/prisma'

process.env.JWT_SECRET = process.env.JWT_SECRET || 'smoke-secret'
process.env.NODE_ENV = 'test'

export const S = Math.random().toString(36).slice(2, 7)
export type Actor = { id: string; token: string; role: string; studentId?: string; tenantId: string }
export const fails: string[] = []
let okc = 0
export function check(name: string, cond: any, extra?: any) {
  if (cond) okc++
  else { fails.push(name + (extra !== undefined ? ' :: ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 300) : '')); console.log('  FAIL', name, extra !== undefined ? (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 300) : '') }
}
export const summary = () => { console.log(`\nOK=${okc} FAIL=${fails.length}`); fails.forEach((f) => console.log(' -', f)) }

export async function setup() {
  const { default: app } = await import('../../src/app')
  const server = http.createServer(app).listen(0)
  const port = (server.address() as any).port
  const base = `http://127.0.0.1:${port}/api`
  const mkTenant = async (tag: string) => {
    const tenantId = `qa5-${tag}-${S}`
    const clinic = await prisma.clinic.create({ data: { tenantId, name: 'Instituto ' + tag, email: `${tag}${S}@q.com`, phone: '1', cnpj: '00.000.000/0001-' + Math.floor(10 + Math.random() * 89) } })
    const mk = async (role: string, withStudent = false): Promise<Actor> => {
      const email = `${role.toLowerCase()}.${tag}.${Math.random().toString(36).slice(2, 6)}@q.com`
      const u = await prisma.user.create({ data: { clinicId: clinic.id, tenantId, email, password: 'x', firstName: role, lastName: 'Teste ' + tag + ' ' + Math.random().toString(36).slice(2, 6), role: role as any } })
      let studentId: string | undefined
      if (withStudent) {
        const st = await prisma.student.create({ data: { tenantId, userId: u.id, ra: `RA${Math.random().toString(36).slice(2, 9)}`, nomeCompleto: 'Aluno ' + tag + ' ' + email } })
        studentId = st.id
      }
      return { id: u.id, role, studentId, tenantId, token: jwt.sign({ id: u.id, email, clinicId: clinic.id, tenantId, role }, process.env.JWT_SECRET!) }
    }
    return { tenantId, clinic, mk }
  }
  const call = async (a: Actor | null, method: string, path: string, body?: any, headers: Record<string, string> = {}) => {
    const hd: Record<string, string> = { ...(a ? { authorization: `Bearer ${a.token}` } : {}), 'content-type': 'application/json' }
    for (const [k, v] of Object.entries(headers)) hd[k.toLowerCase()] = v
    const r = await fetch(base + path, { method, headers: hd, body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined })
    const text = await r.text()
    let json: any = null
    try { json = JSON.parse(text) } catch {}
    if (r.status >= 500) { fails.push(`5xx ${method} ${path} -> ${r.status} ${text.slice(0, 200)}`); console.log('  5XX', method, path, text.slice(0, 200)) }
    return { status: r.status, json, text }
  }
  const t1 = await mkTenant('a')
  const t2 = await mkTenant('b')
  return { app, server, call, t1, t2, base, close: async () => { server.close(); await prisma.$disconnect() } }
}
export { prisma }
