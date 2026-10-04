import jwt from 'jsonwebtoken'
import http from 'http'
process.env.JWT_SECRET = process.env.JWT_SECRET || 'smoke-secret'
process.env.NODE_ENV = 'test'
import { prisma } from '../../src/lib/prisma'

export const fails: string[] = []
export function check(name: string, cond: any, extra?: any) {
  if (cond) console.log('  ok  ', name)
  else { console.log('  FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ''); fails.push(name) }
}
export async function setup() {
  const { default: app } = await import('../../src/app')
  const server = http.createServer(app).listen(0)
  const port = (server.address() as any).port
  const base = `http://127.0.0.1:${port}/api`
  const tenants: Record<string, any> = {}
  async function mkTenant(tenantId: string) {
    let clinic = await prisma.clinic.findFirst({ where: { tenantId } })
    if (!clinic) clinic = await prisma.clinic.create({ data: { tenantId, name: 'Inst ' + tenantId, email: tenantId + '@x.com', phone: '1', cnpj: '00.000.000/0001-00' } })
    const users: Record<string, any> = {}
    const roles = ['ADMIN', 'RECTOR', 'COORDINATOR', 'TEACHER', 'STUDENT', 'FINANCE', 'SECRETARY', 'STAFF', 'BOARD']
    for (const role of roles) {
      const email = `${role.toLowerCase()}@${tenantId}.com`
      let u = await prisma.user.findFirst({ where: { clinicId: clinic.id, email } })
      if (!u) u = await prisma.user.create({ data: { clinicId: clinic.id, tenantId, email, password: 'x', firstName: role, lastName: 'QA', role } })
      users[role] = { id: u.id, token: jwt.sign({ id: u.id, email, clinicId: clinic.id, tenantId, role }, process.env.JWT_SECRET!) }
    }
    tenants[tenantId] = { clinic, users }
    return tenants[tenantId]
  }
  const RUN = Date.now().toString(36)
  const A = await mkTenant('qa3-a-' + RUN)
  const B = await mkTenant('qa3-b-' + RUN)
  const mk = (t: any) => (role: string) => async (method: string, path: string, body?: any) => {
    const r = await fetch(base + path, { method, headers: { Authorization: `Bearer ${t.users[role].token}`, 'Content-Type': 'application/json' }, body: body !== undefined ? JSON.stringify(body) : undefined })
    const text = await r.text()
    let json: any; try { json = JSON.parse(text) } catch { json = text }
    if (r.status >= 500) { console.log('  5XX', method, path, r.status, text.slice(0, 200)); fails.push(`5xx ${method} ${path}`) }
    return { status: r.status, body: json, text }
  }
  const pub = async (method: string, path: string, body?: any) => {
    const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body !== undefined ? JSON.stringify(body) : undefined })
    const text = await r.text(); let json: any; try { json = JSON.parse(text) } catch { json = text }
    if (r.status >= 500) { console.log('  5XX', method, path, r.status, text.slice(0, 200)); fails.push(`5xx ${method} ${path}`) }
    return { status: r.status, body: json, text }
  }
  return { A, B, as: mk(A), asB: mk(B), pub, close: async () => { server.close(); await prisma.$disconnect() }, tenantA: 'qa3-a-' + RUN, tenantB: 'qa3-b-' + RUN }
}
export function finish(ctx: any) {
  return ctx.close().then(() => { console.log(fails.length ? `\nFALHAS (${fails.length}):\n` + fails.join('\n') : '\nTUDO OK'); process.exit(fails.length ? 1 : 0) })
}
