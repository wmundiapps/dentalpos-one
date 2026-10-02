// Harness compartilhado dos testes E2E do QA4 (infraestrutura, suprimentos, biblioteca, desempenho).
import jwt from 'jsonwebtoken'
import http from 'http'
import { prisma } from '../../src/lib/prisma'

process.env.JWT_SECRET = process.env.JWT_SECRET || 'qa4-secret'
process.env.NODE_ENV = 'test'

export const failures: string[] = []
let passed = 0
export function check(cond: any, msg: string, extra?: any) {
  if (cond) { passed++; return }
  failures.push(msg)
  console.log('  FAIL:', msg, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : '')
}
export const summary = () => { console.log(`\n${passed} ok, ${failures.length} falhas`); failures.forEach((f) => console.log(' -', f)) }

export const ROLES = ['ADMIN', 'COORDINATOR', 'TEACHER', 'STUDENT', 'FINANCE', 'SECRETARY', 'LIBRARIAN', 'FACILITIES', 'SUPPLIES', 'STAFF'] as const
export type Role = (typeof ROLES)[number]

export interface Ctx {
  base: string
  server: http.Server
  tenantId: string
  tenant2: string
  users: Record<string, { id: string; token: string }>
  users2: Record<string, { id: string; token: string }>
  clinicId: string
  call: (role: Role | string, method: string, path: string, body?: any, t2?: boolean) => Promise<{ status: number; json: any; text: string }>
  close: () => Promise<void>
}

async function mkTenant(tenantId: string, secret: string) {
  let clinic = await prisma.clinic.findFirst({ where: { tenantId } })
  if (!clinic) clinic = await prisma.clinic.create({ data: { tenantId, name: 'Inst ' + tenantId, email: tenantId + '@s.com', phone: '1', cnpj: '00.000.000/0001-00' } })
  const users: Ctx['users'] = {}
  for (const role of ROLES) {
    const email = `${role.toLowerCase()}@${tenantId}.com`
    let u = await prisma.user.findFirst({ where: { clinicId: clinic.id, email } })
    if (!u) u = await prisma.user.create({ data: { clinicId: clinic.id, tenantId, email, password: 'x', firstName: role, lastName: 'QA', role } })
    users[role] = { id: u.id, token: jwt.sign({ id: u.id, email, clinicId: clinic.id, tenantId, role }, secret) }
  }
  return { clinic, users }
}

export async function setup(tag = 'q' + Date.now().toString(36)): Promise<Ctx> {
  const { default: app } = await import('../../src/app')
  const tenantId = `${tag}-t1`, tenant2 = `${tag}-t2`
  const t1 = await mkTenant(tenantId, process.env.JWT_SECRET!)
  const t2 = await mkTenant(tenant2, process.env.JWT_SECRET!)
  const server = http.createServer(app).listen(0)
  const port = (server.address() as any).port
  const base = `http://127.0.0.1:${port}/api`
  const call = async (role: string, method: string, path: string, body?: any, useT2 = false) => {
    const u = (useT2 ? t2.users : t1.users)[role]
    const r = await fetch(base + path, { method, headers: { ...(u ? { Authorization: `Bearer ${u.token}` } : {}), 'Content-Type': 'application/json' }, body: body !== undefined ? JSON.stringify(body) : undefined })
    const text = await r.text()
    let json: any = null
    try { json = JSON.parse(text) } catch { /* */ }
    if (r.status >= 500) { failures.push(`5xx ${method} ${path} -> ${r.status} ${text.slice(0, 200)}`); console.log('  5XX:', method, path, r.status, text.slice(0, 300)) }
    return { status: r.status, json, text }
  }
  return { base, server, tenantId, tenant2, users: t1.users, users2: t2.users, clinicId: t1.clinic.id, call, close: async () => { server.close(); await prisma.$disconnect() } }
}

// Fixture acadêmico: curso, 2 disciplinas, período, turma (com o TEACHER), 3 alunos matriculados (o 1º é o usuário STUDENT).
export async function acadFixture(c: Ctx) {
  const tenantId = c.tenantId
  const program = await prisma.academicProgram.create({ data: { tenantId, nome: 'Farmácia QA', modalidade: 'PRESENCIAL', cargaHorariaTotal: 4000 } })
  const d1 = await prisma.discipline.create({ data: { tenantId, nome: 'Anatomia', cargaHoraria: 60 } })
  const d2 = await prisma.discipline.create({ data: { tenantId, nome: 'Farmacologia', cargaHoraria: 60 } })
  await prisma.curriculumDiscipline.createMany({ data: [{ programId: program.id, disciplineId: d1.id, periodo: 1 }, { programId: program.id, disciplineId: d2.id, periodo: 2 }] })
  const term = await prisma.academicTerm.create({ data: { tenantId, codigo: '2026/2', dataInicio: new Date(Date.now() - 60 * 86400000), dataFim: new Date(Date.now() + 90 * 86400000) } })
  const section = await prisma.classSection.create({ data: { tenantId, disciplineId: d1.id, termId: term.id, professorUserId: c.users.TEACHER.id, nome: 'ANAT-QA', vagas: 40 } })
  const clinic = await prisma.clinic.findFirst({ where: { tenantId } })
  const students: Array<{ id: string; userId: string; token: string }> = []
  for (let i = 0; i < 3; i++) {
    let userId = c.users.STUDENT.id
    let token = c.users.STUDENT.token
    if (i > 0) {
      const email = `aluno${i}@${tenantId}.com`
      const u = await prisma.user.create({ data: { clinicId: clinic!.id, tenantId, email, password: 'x', firstName: 'Aluno' + i, lastName: 'QA', role: 'STUDENT' } })
      userId = u.id
      token = jwt.sign({ id: u.id, email, clinicId: clinic!.id, tenantId, role: 'STUDENT' }, process.env.JWT_SECRET!)
    }
    const st = await prisma.student.create({ data: { tenantId, userId, ra: `RA-${tenantId}-${i}`, nomeCompleto: `Aluno ${i} QA` } })
    const en = await prisma.enrollment.create({ data: { studentId: st.id, programId: program.id, termId: term.id } })
    await prisma.classSectionEnrollment.create({ data: { enrollmentId: en.id, classSectionId: section.id } })
    students.push({ id: st.id, userId, token })
  }
  return { program, d1, d2, term, section, students }
}
export const tokenCall = async (c: Ctx, token: string, method: string, path: string, body?: any) => {
  const r = await fetch(c.base + path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body !== undefined ? JSON.stringify(body) : undefined })
  const text = await r.text()
  let json: any = null
  try { json = JSON.parse(text) } catch { /* */ }
  if (r.status >= 500) { failures.push(`5xx ${method} ${path} -> ${r.status} ${text.slice(0, 200)}`); console.log('  5XX:', method, path, r.status, text.slice(0, 300)) }
  return { status: r.status, json, text }
}
export const pub = async (c: Ctx, path: string) => {
  const r = await fetch(c.base + path)
  const text = await r.text()
  let json: any = null
  try { json = JSON.parse(text) } catch { /* */ }
  if (r.status >= 500) { failures.push(`5xx GET ${path} -> ${r.status}`); console.log('  5XX:', path, r.status, text.slice(0, 300)) }
  return { status: r.status, json, text, headers: r.headers }
}
