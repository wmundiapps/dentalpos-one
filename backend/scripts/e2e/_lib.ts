import jwt from 'jsonwebtoken'
import http from 'http'
import { prisma } from '../../src/lib/prisma'

process.env.JWT_SECRET = process.env.JWT_SECRET || 'smoke-secret'
process.env.NODE_ENV = 'test'

export const fails: string[] = []
let n = 0
export function check(name: string, cond: any, extra?: any) {
  n++
  if (!cond) { fails.push(name); console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : '') }
  else console.log('ok  ', name)
}

export async function setup() {
  const { default: app } = await import('../../src/app')
  const suffix = Math.random().toString(36).slice(2, 7)
  async function tenant(label: string) {
    const tenantId = `qa2-${label}-${suffix}`
    const clinic = await prisma.clinic.create({ data: { tenantId, name: 'Inst ' + label, email: `${label}${suffix}@q.com`, phone: '1', cnpj: '00.000.000/0001-0' + (label === 'a' ? 1 : 2) } as any })
    const users: Record<string, { id: string; token: string }> = {}
    for (const role of ['ADMIN', 'COORDINATOR', 'TEACHER', 'TEACHER2', 'STUDENT', 'STUDENT2', 'FINANCE', 'SECRETARY']) {
      const r = role.replace(/2$/, '')
      const u = await prisma.user.create({ data: { clinicId: clinic.id, tenantId, email: `${role.toLowerCase()}@${label}${suffix}.com`, password: 'x', firstName: role, lastName: label, role: r as any } as any })
      users[role] = { id: u.id, token: jwt.sign({ id: u.id, email: u.email, clinicId: clinic.id, tenantId, role: r }, process.env.JWT_SECRET!) }
    }
    return { tenantId, clinic, users }
  }
  const A = await tenant('a')
  const B = await tenant('b')
  const server = http.createServer(app).listen(0)
  const port = (server.address() as any).port
  const base = `http://127.0.0.1:${port}/api`
  const api = (token: string) => async (method: string, path: string, body?: any) => {
    const r = await fetch(base + path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body !== undefined ? JSON.stringify(body) : undefined })
    const text = await r.text()
    let json: any = null
    try { json = JSON.parse(text) } catch {}
    if (r.status >= 500 && r.status !== 503) { fails.push(`5xx ${method} ${path}: ${text.slice(0, 200)}`); console.log('5XX', method, path, text.slice(0, 300)) }
    return { status: r.status, json, text }
  }
  const close = async () => {
    server.close()
    console.log(`\n${n} checks, ${fails.length} falhas`)
    fails.forEach((f) => console.log(' -', f))
    await prisma.$disconnect()
    process.exit(fails.length ? 1 : 0)
  }
  return { A, B, api, close, prisma, base }
}

export async function seedAcademic(T: { tenantId: string; users: Record<string, { id: string }> }, opts: { n?: number; vagas?: number } = {}) {
  const tenantId = T.tenantId
  const rnd = Math.random().toString(36).slice(2, 6)
  const program = await prisma.academicProgram.create({ data: { tenantId, nome: 'Odontologia ' + rnd, modalidade: 'PRESENCIAL', cargaHorariaTotal: 4000 } })
  const term = await prisma.academicTerm.create({ data: { tenantId, codigo: '2026/2-' + rnd, dataInicio: new Date('2026-08-03T03:00:00Z'), dataFim: new Date('2026-12-18T03:00:00Z') } })
  const discs = [] as any[]
  for (const [i, nome] of ['Anatomia', 'Histologia', 'Bioquimica'].entries()) {
    const d = await prisma.discipline.create({ data: { tenantId, nome: nome + rnd, cargaHoraria: 60 + i * 20 } })
    await prisma.curriculumDiscipline.create({ data: { programId: program.id, disciplineId: d.id, periodo: 1 } })
    discs.push(d)
  }
  const profs = [T.users.TEACHER.id, T.users.TEACHER2.id, T.users.TEACHER.id]
  const sections = [] as any[]
  for (const [i, d] of discs.entries()) sections.push(await prisma.classSection.create({ data: { tenantId, disciplineId: d.id, termId: term.id, professorUserId: profs[i], nome: `T${i + 1}-${rnd}`, vagas: opts.vagas ?? 40 } }))
  const students = [] as any[]
  const stUsers = [T.users.STUDENT.id, T.users.STUDENT2.id]
  for (let i = 0; i < (opts.n ?? 2); i++) {
    const s = await prisma.student.create({ data: { tenantId, userId: stUsers[i] ?? `fake-${rnd}-${i}`, ra: `RA${rnd}${i}`, nomeCompleto: `Aluno ${i} ${rnd}` } })
    const e = await prisma.enrollment.create({ data: { studentId: s.id, programId: program.id, termId: term.id } })
    for (const sec of sections) await prisma.classSectionEnrollment.create({ data: { enrollmentId: e.id, classSectionId: sec.id } })
    students.push({ ...s, enrollmentId: e.id })
  }
  return { program, term, discs, sections, students }
}
