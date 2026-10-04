import { setup, check } from './_lib'
async function main() {
  const { A, B, api, close, prisma } = await setup()
  const adm = api(A.users.ADMIN.token), coord = api(A.users.COORDINATOR.token), teacher = api(A.users.TEACHER.token), st = api(A.users.STUDENT.token), st2 = api(A.users.STUDENT2.token), admB = api(B.users.ADMIN.token)
  let r: any
  r = await adm('POST', '/edu/academico/programs', { nome: 'Odonto', modalidade: 'PRESENCIAL', cargaHorariaTotal: 4000 }); check('program 201', r.status === 201, r); const prog = r.json
  r = await adm('POST', '/edu/academico/programs', { nome: 'x' }); check('program 400', r.status === 400)
  r = await st('POST', '/edu/academico/programs', { nome: 'Odonto', modalidade: 'PRESENCIAL', cargaHorariaTotal: 4000 }); check('program student 403', r.status === 403)
  r = await adm('POST', '/edu/academico/disciplines', { nome: 'Anatomia', cargaHoraria: 80 }); check('disc 201', r.status === 201, r); const disc = r.json
  r = await adm('POST', '/edu/academico/curriculum-links', { programId: prog.id, disciplineId: disc.id, periodo: 1 }); check('link 201', r.status === 201, r)
  r = await adm('POST', '/edu/academico/curriculum-links', { programId: prog.id, disciplineId: disc.id, periodo: 1 }); check('link dup 409', r.status === 409, r)
  r = await admB('POST', '/edu/academico/curriculum-links', { programId: prog.id, disciplineId: disc.id, periodo: 1 }); check('link other tenant 404', r.status === 404, r)
  r = await adm('POST', '/edu/academico/terms', { codigo: '2026/2', dataInicio: '2026-08-01', dataFim: '2026-12-15' }); check('term 201', r.status === 201, r); const term = r.json
  r = await adm('POST', '/edu/academico/terms', { codigo: '2026/3', dataInicio: '2026-08-01', dataFim: '2026-07-15' }); check('term bad dates 400', r.status === 400)
  r = await adm('POST', '/edu/academico/students', { userId: A.users.STUDENT.id, ra: 'RA' + Date.now(), nomeCompleto: 'Aluno Um' }); check('student 201', r.status === 201, r); const s1 = r.json
  const ra2 = 'RB' + Date.now()
  r = await adm('POST', '/edu/academico/students', { userId: A.users.STUDENT2.id, ra: ra2, nomeCompleto: 'Aluno Dois' }); check('student2 201', r.status === 201, r); const s2 = r.json
  r = await adm('POST', '/edu/academico/students', { userId: A.users.STUDENT2.id, ra: ra2 + 'x', nomeCompleto: 'Aluno Dois' }); check('student dup user 409', r.status === 409, r)
  r = await admB('POST', '/edu/academico/students', { userId: A.users.TEACHER.id, ra: 'RZ' + Date.now(), nomeCompleto: 'Invasor' }); check('student cross-tenant user 404', r.status === 404, r)
  r = await adm('POST', '/edu/academico/enrollments', { studentId: s1.id, programId: prog.id, termId: term.id }); check('enroll 201', r.status === 201, r); const e1 = r.json
  r = await adm('POST', '/edu/academico/enrollments', { studentId: s1.id, programId: prog.id, termId: term.id }); check('enroll dup 409', r.status === 409, r)
  r = await adm('POST', '/edu/academico/enrollments', { studentId: s2.id, programId: prog.id, termId: term.id }); const e2 = r.json
  r = await admB('POST', '/edu/academico/enrollments', { studentId: s1.id, programId: prog.id, termId: term.id }); check('enroll other tenant 404', r.status === 404)
  r = await adm('POST', '/edu/academico/class-sections', { disciplineId: disc.id, termId: term.id, professorUserId: A.users.TEACHER.id, nome: 'T1', vagas: 1 }); check('section 201', r.status === 201, r); const sec = r.json
  r = await admB('POST', '/edu/academico/class-sections', { disciplineId: disc.id, termId: term.id, professorUserId: B.users.TEACHER.id, nome: 'T1' }); check('section other tenant 404', r.status === 404)
  r = await adm('POST', '/edu/academico/class-sections', { disciplineId: disc.id, termId: term.id, professorUserId: B.users.TEACHER.id, nome: 'T1' }); check('section foreign prof 404', r.status === 404, r)
  r = await adm('POST', '/edu/academico/enrollments/class-sections', { enrollmentId: e1.id, classSectionId: sec.id }); check('enroll sec 201', r.status === 201, r)
  r = await adm('POST', '/edu/academico/enrollments/class-sections', { enrollmentId: e1.id, classSectionId: sec.id }); check('enroll sec dup 409', r.status === 409, r)
  r = await adm('POST', '/edu/academico/enrollments/class-sections', { enrollmentId: e2.id, classSectionId: sec.id }); check('enroll sec full 409', r.status === 409, r)
  r = await admB('POST', '/edu/academico/enrollments/class-sections', { enrollmentId: e2.id, classSectionId: sec.id }); check('enroll sec xtenant 404', r.status === 404, r)
  await prisma.classSection.update({ where: { id: sec.id }, data: { vagas: 5 } })
  r = await adm('POST', '/edu/academico/enrollments/class-sections', { enrollmentId: e2.id, classSectionId: sec.id }); check('enroll sec2 201', r.status === 201, r)
  const future = new Date(Date.now() + 86400000 * 3)
  r = await teacher('POST', '/edu/academico/class-sessions', { classSectionId: sec.id, tipo: 'PRATICA', titulo: 'Lab 1', dataHoraInicio: future, dataHoraFim: new Date(+future + 3600000), vagasPratica: 1 }); check('session 201', r.status === 201, r); const ses = r.json
  r = await api(A.users.TEACHER2.token)('POST', '/edu/academico/class-sessions', { classSectionId: sec.id, tipo: 'PRATICA', titulo: 'Lab 1', dataHoraInicio: future, dataHoraFim: new Date(+future + 3600000) }); check('session other teacher 403', r.status === 403)
  r = await admB('POST', '/edu/academico/class-sessions', { classSectionId: sec.id, tipo: 'PRATICA', titulo: 'Lab 1', dataHoraInicio: future, dataHoraFim: new Date(+future + 3600000) }); check('session xtenant 404', r.status === 404)
  r = await adm('POST', '/edu/academico/class-sessions', { classSectionId: sec.id, tipo: 'PRATICA', titulo: 'Lab 1', dataHoraInicio: future, dataHoraFim: new Date(+future - 3600000) }); check('session bad time 400', r.status === 400)
  r = await admB('GET', `/edu/academico/class-sessions/${ses.id}`); check('session get xtenant 404', r.status === 404)
  // concurrent bookings, 1 vaga
  const rs = await Promise.all([st('POST', `/edu/academico/class-sessions/${ses.id}/bookings`, {}), st2('POST', `/edu/academico/class-sessions/${ses.id}/bookings`, {})])
  check('booking concurrency exactly one 201', rs.filter((x) => x.status === 201).length === 1 && rs.filter((x) => x.status === 409).length === 1, rs.map((x) => x.status))
  const winner = rs[0].status === 201 ? st : st2, wid = rs[0].status === 201 ? s1.id : s2.id
  r = await winner('DELETE', `/edu/academico/class-sessions/${ses.id}/bookings/${wid}`); check('cancel booking 204', r.status === 204, r)
  r = await winner('POST', `/edu/academico/class-sessions/${ses.id}/bookings`, {}); check('rebook after cancel 201', r.status === 201, r)
  r = await st('POST', `/edu/academico/class-sessions/${ses.id}/bookings`, { studentId: s2.id }); check('student books for other 403', r.status === 403)
  r = await st('GET', `/edu/academico/students/${s2.id}`); check('student views other 403', r.status === 403)
  r = await st('GET', `/edu/academico/students/${s1.id}`); check('student views self 200', r.status === 200)
  r = await admB('GET', `/edu/academico/students/${s1.id}`); check('student xtenant 404', r.status === 404)
  r = await teacher('POST', `/edu/academico/class-sessions/${ses.id}/attendance`, { registros: [{ studentId: s1.id, presente: true }, { studentId: s2.id, presente: false, justificativa: 'x' }] }); check('attendance 200', r.status === 200, r)
  r = await teacher('POST', `/edu/academico/class-sessions/${ses.id}/attendance`, { registros: [{ studentId: '00000000-0000-0000-0000-000000000000', presente: true }] }); check('attendance unknown student 400', r.status === 400, r)
  r = await winner('DELETE', `/edu/academico/class-sessions/${ses.id}/bookings/${wid}`); check('cancel after realizada 409', r.status === 409, r)
  r = await coord('GET', '/edu/academico/students?q=Aluno'); check('students list', r.status === 200 && r.json.total >= 2)
  r = await admB('GET', '/edu/academico/students'); check('students list isolated', r.status === 200 && r.json.total === 0, r.json)
  r = await teacher('GET', '/edu/academico/class-sections'); check('teacher own sections', r.status === 200 && r.json.length === 1)
  await close()
}
main().catch((e) => { console.error(e); process.exit(2) })
