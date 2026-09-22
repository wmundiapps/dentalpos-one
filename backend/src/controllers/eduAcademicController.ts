import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'
import {
  attendanceBulkSchema,
  classEnrollmentSchema,
  classSchema,
  curriculumSchema,
  curriculumSubjectSchema,
  enrollmentSchema,
  programSchema,
  sessionBookingSchema,
  sessionSchema,
  studentSchema,
  subjectSchema,
  termSchema
} from '../validators/eduAcademicValidator'

function ctx(req: AuthRequest) {
  if (!req.user) throw new Error('Usuário não autenticado')
  return { clinicId: req.user.clinicId, tenantId: req.user.tenantId, actorId: req.user.id }
}

async function myStudent(req: AuthRequest) {
  const { clinicId, tenantId } = ctx(req)
  if (!req.user) return null
  return prisma.eduStudent.findFirst({ where: { clinicId, tenantId, userId: req.user.id } })
}

function audit(input: { clinicId: string; tenantId: string; actorId: string; action: string; entityType: string; entityId: string; summary?: string }) {
  return writeAudit({ ...input, module: 'edu' })
}

// ---------------------------------------------------------------
// PROGRAMAS
// ---------------------------------------------------------------

export async function listPrograms(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const rows = await prisma.eduProgram.findMany({ where: { clinicId, tenantId }, orderBy: { name: 'asc' } })
    return res.json(rows)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao listar programas.' })
  }
}

export async function createProgram(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const parsed = programSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados do programa inválidos.', details: parsed.error.flatten() })

    const duplicate = await prisma.eduProgram.findFirst({ where: { clinicId, code: parsed.data.code } })
    if (duplicate) return res.status(409).json({ error: 'Já existe um programa com este código.' })

    const row = await prisma.eduProgram.create({ data: { clinicId, tenantId, ...parsed.data } })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_PROGRAM_CREATE', entityType: 'EduProgram', entityId: row.id, summary: `Programa ${row.name} criado.` })
    return res.status(201).json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao criar programa.' })
  }
}

export async function updateProgram(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const id = String(req.params.id)
    const existing = await prisma.eduProgram.findFirst({ where: { id, clinicId, tenantId } })
    if (!existing) return res.status(404).json({ error: 'Programa não encontrado.' })

    const parsed = programSchema.partial().safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados do programa inválidos.', details: parsed.error.flatten() })

    const row = await prisma.eduProgram.update({ where: { id }, data: parsed.data })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_PROGRAM_UPDATE', entityType: 'EduProgram', entityId: row.id, summary: `Programa ${row.name} atualizado.` })
    return res.json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao atualizar programa.' })
  }
}

// ---------------------------------------------------------------
// DISCIPLINAS (catálogo)
// ---------------------------------------------------------------

export async function listSubjects(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const rows = await prisma.eduSubject.findMany({ where: { clinicId, tenantId }, orderBy: { name: 'asc' } })
    return res.json(rows)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao listar disciplinas.' })
  }
}

export async function createSubject(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const parsed = subjectSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados da disciplina inválidos.', details: parsed.error.flatten() })

    const duplicate = await prisma.eduSubject.findFirst({ where: { clinicId, code: parsed.data.code } })
    if (duplicate) return res.status(409).json({ error: 'Já existe uma disciplina com este código.' })

    const row = await prisma.eduSubject.create({ data: { clinicId, tenantId, ...parsed.data } })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_SUBJECT_CREATE', entityType: 'EduSubject', entityId: row.id, summary: `Disciplina ${row.name} criada.` })
    return res.status(201).json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao criar disciplina.' })
  }
}

// ---------------------------------------------------------------
// MATRIZ CURRICULAR
// ---------------------------------------------------------------

export async function listCurriculums(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const programId = typeof req.query.programId === 'string' ? req.query.programId : undefined
    const rows = await prisma.eduCurriculum.findMany({
      where: { clinicId, tenantId, ...(programId ? { programId } : {}) },
      include: { subjects: { include: { subject: true }, orderBy: { termNumber: 'asc' } } },
      orderBy: { version: 'desc' }
    })
    return res.json(rows)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao listar matrizes curriculares.' })
  }
}

export async function createCurriculum(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const parsed = curriculumSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados da matriz curricular inválidos.', details: parsed.error.flatten() })

    const program = await prisma.eduProgram.findFirst({ where: { id: parsed.data.programId, clinicId, tenantId } })
    if (!program) return res.status(400).json({ error: 'Programa inválido.' })

    const row = await prisma.eduCurriculum.create({
      data: {
        clinicId, tenantId, programId: parsed.data.programId, version: parsed.data.version, name: parsed.data.name,
        isActive: parsed.data.isActive, effectiveFrom: parsed.data.effectiveFrom ? new Date(parsed.data.effectiveFrom) : undefined
      }
    })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_CURRICULUM_CREATE', entityType: 'EduCurriculum', entityId: row.id, summary: `Matriz ${row.name} v${row.version} criada.` })
    return res.status(201).json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao criar matriz curricular.' })
  }
}

export async function addCurriculumSubject(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const curriculumId = String(req.params.curriculumId)
    const curriculum = await prisma.eduCurriculum.findFirst({ where: { id: curriculumId, clinicId, tenantId } })
    if (!curriculum) return res.status(404).json({ error: 'Matriz curricular não encontrada.' })

    const parsed = curriculumSubjectSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const subject = await prisma.eduSubject.findFirst({ where: { id: parsed.data.subjectId, clinicId, tenantId } })
    if (!subject) return res.status(400).json({ error: 'Disciplina inválida.' })

    const duplicate = await prisma.eduCurriculumSubject.findFirst({ where: { curriculumId, subjectId: parsed.data.subjectId } })
    if (duplicate) return res.status(409).json({ error: 'Disciplina já está nesta matriz curricular.' })

    const row = await prisma.eduCurriculumSubject.create({ data: { curriculumId, ...parsed.data } })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_CURRICULUM_SUBJECT_ADD', entityType: 'EduCurriculumSubject', entityId: row.id, summary: `Disciplina ${subject.name} incluída na matriz.` })
    return res.status(201).json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao incluir disciplina na matriz.' })
  }
}

// ---------------------------------------------------------------
// PERÍODOS LETIVOS
// ---------------------------------------------------------------

export async function listTerms(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const programId = typeof req.query.programId === 'string' ? req.query.programId : undefined
    const rows = await prisma.eduTerm.findMany({
      where: { clinicId, tenantId, ...(programId ? { programId } : {}) },
      orderBy: { startDate: 'desc' }
    })
    return res.json(rows)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao listar períodos letivos.' })
  }
}

export async function createTerm(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const parsed = termSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados do período letivo inválidos.', details: parsed.error.flatten() })

    const program = await prisma.eduProgram.findFirst({ where: { id: parsed.data.programId, clinicId, tenantId } })
    if (!program) return res.status(400).json({ error: 'Programa inválido.' })
    if (new Date(parsed.data.endDate) <= new Date(parsed.data.startDate)) {
      return res.status(400).json({ error: 'Data de término deve ser posterior à data de início.' })
    }

    const row = await prisma.eduTerm.create({
      data: {
        clinicId, tenantId, programId: parsed.data.programId, name: parsed.data.name, type: parsed.data.type,
        startDate: new Date(parsed.data.startDate), endDate: new Date(parsed.data.endDate),
        enrollmentStart: parsed.data.enrollmentStart ? new Date(parsed.data.enrollmentStart) : undefined,
        enrollmentEnd: parsed.data.enrollmentEnd ? new Date(parsed.data.enrollmentEnd) : undefined,
        isActive: parsed.data.isActive
      }
    })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_TERM_CREATE', entityType: 'EduTerm', entityId: row.id, summary: `Período letivo ${row.name} criado.` })
    return res.status(201).json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao criar período letivo.' })
  }
}

// ---------------------------------------------------------------
// ALUNOS
// ---------------------------------------------------------------

export async function listStudents(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined
    const rows = await prisma.eduStudent.findMany({
      where: {
        clinicId, tenantId,
        ...(search ? { OR: [{ fullName: { contains: search, mode: 'insensitive' } }, { email: { contains: search, mode: 'insensitive' } }] } : {})
      },
      orderBy: { fullName: 'asc' }
    })
    return res.json(rows)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao listar alunos.' })
  }
}

export async function showStudent(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const id = String(req.params.id)
    const row = await prisma.eduStudent.findFirst({
      where: { id, clinicId, tenantId },
      include: { enrollments: { include: { program: true, term: true } } }
    })
    if (!row) return res.status(404).json({ error: 'Aluno não encontrado.' })
    return res.json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao buscar aluno.' })
  }
}

export async function createStudent(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const parsed = studentSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados do aluno inválidos.', details: parsed.error.flatten() })

    const duplicate = await prisma.eduStudent.findFirst({ where: { clinicId, email: parsed.data.email } })
    if (duplicate) return res.status(409).json({ error: 'Já existe um aluno com este e-mail.' })

    const row = await prisma.eduStudent.create({
      data: { clinicId, tenantId, ...parsed.data, birthDate: parsed.data.birthDate ? new Date(parsed.data.birthDate) : undefined }
    })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_STUDENT_CREATE', entityType: 'EduStudent', entityId: row.id, summary: `Aluno ${row.fullName} cadastrado.` })
    return res.status(201).json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao cadastrar aluno.' })
  }
}

export async function updateStudent(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const id = String(req.params.id)
    const existing = await prisma.eduStudent.findFirst({ where: { id, clinicId, tenantId } })
    if (!existing) return res.status(404).json({ error: 'Aluno não encontrado.' })

    const parsed = studentSchema.partial().safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados do aluno inválidos.', details: parsed.error.flatten() })

    const row = await prisma.eduStudent.update({
      where: { id },
      data: { ...parsed.data, birthDate: parsed.data.birthDate ? new Date(parsed.data.birthDate) : undefined }
    })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_STUDENT_UPDATE', entityType: 'EduStudent', entityId: row.id, summary: `Cadastro de ${row.fullName} atualizado.` })
    return res.json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao atualizar aluno.' })
  }
}

// ---------------------------------------------------------------
// MATRÍCULA (programa)
// ---------------------------------------------------------------

export async function listEnrollments(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const studentId = typeof req.query.studentId === 'string' ? req.query.studentId : undefined
    const programId = typeof req.query.programId === 'string' ? req.query.programId : undefined
    const rows = await prisma.eduEnrollment.findMany({
      where: { clinicId, tenantId, ...(studentId ? { studentId } : {}), ...(programId ? { programId } : {}) },
      include: { student: true, program: true, term: true },
      orderBy: { enrolledAt: 'desc' }
    })
    return res.json(rows)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao listar matrículas.' })
  }
}

export async function createEnrollment(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const parsed = enrollmentSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados da matrícula inválidos.', details: parsed.error.flatten() })

    const [student, program, curriculum, term] = await Promise.all([
      prisma.eduStudent.findFirst({ where: { id: parsed.data.studentId, clinicId, tenantId } }),
      prisma.eduProgram.findFirst({ where: { id: parsed.data.programId, clinicId, tenantId } }),
      prisma.eduCurriculum.findFirst({ where: { id: parsed.data.curriculumId, clinicId, tenantId, programId: parsed.data.programId } }),
      prisma.eduTerm.findFirst({ where: { id: parsed.data.termId, clinicId, tenantId, programId: parsed.data.programId } })
    ])
    if (!student) return res.status(400).json({ error: 'Aluno inválido.' })
    if (!program) return res.status(400).json({ error: 'Programa inválido.' })
    if (!curriculum) return res.status(400).json({ error: 'Matriz curricular não pertence ao programa informado.' })
    if (!term) return res.status(400).json({ error: 'Período letivo não pertence ao programa informado.' })

    const duplicate = await prisma.eduEnrollment.findFirst({ where: { studentId: student.id, programId: program.id } })
    if (duplicate) return res.status(409).json({ error: 'Aluno já matriculado neste programa.' })

    const sequence = (await prisma.eduEnrollment.count({ where: { clinicId } })) + 1
    const enrollmentNumber = `${program.code}-${term.name}-${String(sequence).padStart(5, '0')}`

    const row = await prisma.eduEnrollment.create({
      data: {
        clinicId, tenantId, studentId: student.id, programId: program.id, curriculumId: curriculum.id, termId: term.id,
        enrollmentNumber, monthlyFee: parsed.data.monthlyFee
      }
    })

    // Mensalidade gerada automaticamente no Financeiro compartilhado (RecurringBill), sem alterar esse model.
    let finalRow = row
    if (parsed.data.monthlyFee && parsed.data.monthlyFee > 0) {
      const bill = await prisma.recurringBill.create({
        data: {
          clinicId, tenantId, type: 'INCOME', description: `Mensalidade — ${program.name} — ${student.fullName}`,
          category: 'EDUMASTER_MENSALIDADE', personName: student.fullName, amount: parsed.data.monthlyFee,
          frequency: 'MONTHLY', dueDay: parsed.data.tuitionDueDay, startDate: new Date(), createdById: actorId
        }
      })
      finalRow = await prisma.eduEnrollment.update({ where: { id: row.id }, data: { tuitionBillId: bill.id } })
    }

    await audit({ clinicId, tenantId, actorId, action: 'EDU_ENROLLMENT_CREATE', entityType: 'EduEnrollment', entityId: row.id, summary: `Matrícula ${enrollmentNumber} de ${student.fullName} em ${program.name}.` })
    return res.status(201).json(finalRow)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao efetivar matrícula.' })
  }
}

// ---------------------------------------------------------------
// TURMAS
// ---------------------------------------------------------------

export async function listClasses(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const termId = typeof req.query.termId === 'string' ? req.query.termId : undefined
    const rows = await prisma.eduClass.findMany({
      where: { clinicId, tenantId, ...(termId ? { termId } : {}) },
      include: {
        curriculumSubject: { include: { subject: true } },
        term: true,
        _count: { select: { classEnrollments: true } }
      },
      orderBy: { code: 'asc' }
    })
    return res.json(rows.map(row => ({ ...row, enrolledCount: row._count.classEnrollments, vacancies: Math.max(row.capacity - row._count.classEnrollments, 0) })))
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao listar turmas.' })
  }
}

export async function createClass(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const parsed = classSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados da turma inválidos.', details: parsed.error.flatten() })

    const [program, curriculumSubject, term] = await Promise.all([
      prisma.eduProgram.findFirst({ where: { id: parsed.data.programId, clinicId, tenantId } }),
      prisma.eduCurriculumSubject.findFirst({ where: { id: parsed.data.curriculumSubjectId, curriculum: { clinicId, tenantId, programId: parsed.data.programId } } }),
      prisma.eduTerm.findFirst({ where: { id: parsed.data.termId, clinicId, tenantId, programId: parsed.data.programId } })
    ])
    if (!program) return res.status(400).json({ error: 'Programa inválido.' })
    if (!curriculumSubject) return res.status(400).json({ error: 'Disciplina da matriz inválida para este programa.' })
    if (!term) return res.status(400).json({ error: 'Período letivo inválido para este programa.' })

    const row = await prisma.eduClass.create({ data: { clinicId, tenantId, ...parsed.data } })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_CLASS_CREATE', entityType: 'EduClass', entityId: row.id, summary: `Turma ${row.code} criada.` })
    return res.status(201).json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao criar turma.' })
  }
}

export async function enrollInClass(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const classId = String(req.params.classId)
    const eduClass = await prisma.eduClass.findFirst({ where: { id: classId, clinicId, tenantId }, include: { _count: { select: { classEnrollments: true } } } })
    if (!eduClass) return res.status(404).json({ error: 'Turma não encontrada.' })

    const parsed = classEnrollmentSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const [student, enrollment] = await Promise.all([
      prisma.eduStudent.findFirst({ where: { id: parsed.data.studentId, clinicId, tenantId } }),
      prisma.eduEnrollment.findFirst({ where: { id: parsed.data.enrollmentId, clinicId, tenantId, studentId: parsed.data.studentId } })
    ])
    if (!student) return res.status(400).json({ error: 'Aluno inválido.' })
    if (!enrollment) return res.status(400).json({ error: 'Matrícula inválida para este aluno.' })

    if (eduClass._count.classEnrollments >= eduClass.capacity) {
      return res.status(409).json({ error: 'Turma sem vagas disponíveis.' })
    }

    const duplicate = await prisma.eduClassEnrollment.findFirst({ where: { classId, studentId: student.id } })
    if (duplicate) return res.status(409).json({ error: 'Aluno já matriculado nesta turma.' })

    const row = await prisma.eduClassEnrollment.create({
      data: { classId, studentId: student.id, enrollmentId: enrollment.id }
    })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_CLASS_ENROLLMENT_CREATE', entityType: 'EduClassEnrollment', entityId: row.id, summary: `${student.fullName} matriculado na turma ${eduClass.code}.` })
    return res.status(201).json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao matricular aluno na turma.' })
  }
}

export async function listClassRoster(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const classId = String(req.params.classId)
    const eduClass = await prisma.eduClass.findFirst({ where: { id: classId, clinicId, tenantId } })
    if (!eduClass) return res.status(404).json({ error: 'Turma não encontrada.' })

    const rows = await prisma.eduClassEnrollment.findMany({ where: { classId }, include: { student: true }, orderBy: { student: { fullName: 'asc' } } })
    return res.json(rows)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao listar alunos da turma.' })
  }
}

// ---------------------------------------------------------------
// SESSÕES (teóricas e práticas)
// ---------------------------------------------------------------

export async function listClassSessions(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const classId = String(req.params.classId)
    const eduClass = await prisma.eduClass.findFirst({ where: { id: classId, clinicId, tenantId } })
    if (!eduClass) return res.status(404).json({ error: 'Turma não encontrada.' })

    const rows = await prisma.eduSession.findMany({
      where: { classId },
      include: { _count: { select: { bookings: { where: { status: 'CONFIRMADO' } } } } },
      orderBy: { scheduledAt: 'asc' }
    })
    return res.json(rows.map(row => {
      const capacity = row.capacity ?? eduClass.capacity
      return { ...row, bookedCount: row._count.bookings, vacancies: Math.max(capacity - row._count.bookings, 0) }
    }))
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao listar sessões da turma.' })
  }
}

export async function createSession(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const classId = String(req.params.classId)
    const eduClass = await prisma.eduClass.findFirst({ where: { id: classId, clinicId, tenantId } })
    if (!eduClass) return res.status(404).json({ error: 'Turma não encontrada.' })

    const parsed = sessionSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados da sessão inválidos.', details: parsed.error.flatten() })

    const row = await prisma.eduSession.create({
      data: { clinicId, tenantId, classId, ...parsed.data, scheduledAt: new Date(parsed.data.scheduledAt) }
    })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_SESSION_CREATE', entityType: 'EduSession', entityId: row.id, summary: `Sessão ${row.title} agendada para a turma ${eduClass.code}.` })
    return res.status(201).json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao agendar sessão.' })
  }
}

type BookSessionResult =
  | { ok: false; status: number; error: string }
  | { ok: true; booking: Awaited<ReturnType<typeof prisma.eduSessionBooking.create>>; session: Awaited<ReturnType<typeof prisma.eduSession.findFirstOrThrow<{ include: { class: true } }>>> }

async function bookSessionForStudent(sessionId: string, studentId: string, clinicId: string, tenantId: string): Promise<BookSessionResult> {
  const session = await prisma.eduSession.findFirst({ where: { id: sessionId, clinicId, tenantId }, include: { class: true } })
  if (!session) return { ok: false, status: 404, error: 'Sessão não encontrada.' }

  const enrolled = await prisma.eduClassEnrollment.findFirst({ where: { classId: session.classId, studentId } })
  if (!enrolled) return { ok: false, status: 400, error: 'Aluno não está matriculado na turma desta sessão.' }

  const existingBooking = await prisma.eduSessionBooking.findFirst({ where: { sessionId, studentId } })
  if (existingBooking && existingBooking.status === 'CONFIRMADO') return { ok: false, status: 409, error: 'Aluno já possui agendamento confirmado para esta sessão.' }

  const capacity = session.capacity ?? session.class.capacity
  const confirmedCount = await prisma.eduSessionBooking.count({ where: { sessionId, status: 'CONFIRMADO' } })
  if (confirmedCount >= capacity) return { ok: false, status: 409, error: 'Não há vagas disponíveis para este horário.' }

  const booking = existingBooking
    ? await prisma.eduSessionBooking.update({ where: { id: existingBooking.id }, data: { status: 'CONFIRMADO' } })
    : await prisma.eduSessionBooking.create({ data: { sessionId, studentId, status: 'CONFIRMADO' } })

  return { ok: true, booking, session }
}

export async function bookSession(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const sessionId = String(req.params.sessionId)
    const parsed = sessionBookingSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const result = await bookSessionForStudent(sessionId, parsed.data.studentId, clinicId, tenantId)
    if (!result.ok) return res.status(result.status).json({ error: result.error })

    await audit({ clinicId, tenantId, actorId, action: 'EDU_SESSION_BOOKING_CREATE', entityType: 'EduSessionBooking', entityId: result.booking.id, summary: `Vaga confirmada em ${result.session.title}.` })
    return res.status(201).json(result.booking)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao agendar vaga na sessão.' })
  }
}

export async function bookSessionSelf(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const sessionId = String(req.params.sessionId)
    const student = await myStudent(req)
    if (!student) return res.status(403).json({ error: 'Usuário não está vinculado a um cadastro de aluno.' })

    const result = await bookSessionForStudent(sessionId, student.id, clinicId, tenantId)
    if (!result.ok) return res.status(result.status).json({ error: result.error })

    await audit({ clinicId, tenantId, actorId, action: 'EDU_SESSION_BOOKING_SELF', entityType: 'EduSessionBooking', entityId: result.booking.id, summary: `${student.fullName} agendou vaga em ${result.session.title}.` })
    return res.status(201).json(result.booking)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao agendar vaga na sessão.' })
  }
}

export async function cancelSessionBookingSelf(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const sessionId = String(req.params.sessionId)
    const student = await myStudent(req)
    if (!student) return res.status(403).json({ error: 'Usuário não está vinculado a um cadastro de aluno.' })

    const booking = await prisma.eduSessionBooking.findFirst({ where: { sessionId, studentId: student.id } })
    if (!booking) return res.status(404).json({ error: 'Agendamento não encontrado.' })

    const row = await prisma.eduSessionBooking.update({ where: { id: booking.id }, data: { status: 'CANCELADO' } })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_SESSION_BOOKING_CANCEL', entityType: 'EduSessionBooking', entityId: row.id, summary: `${student.fullName} cancelou agendamento.` })
    return res.json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao cancelar agendamento.' })
  }
}

// ---------------------------------------------------------------
// FREQUÊNCIA — lançamento atualiza o status da sessão automaticamente
// ---------------------------------------------------------------

export async function recordAttendance(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const sessionId = String(req.params.sessionId)
    const session = await prisma.eduSession.findFirst({ where: { id: sessionId, clinicId, tenantId } })
    if (!session) return res.status(404).json({ error: 'Sessão não encontrada.' })

    const parsed = attendanceBulkSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados de frequência inválidos.', details: parsed.error.flatten() })

    const studentIds = parsed.data.records.map(record => record.studentId)
    const enrolledCount = await prisma.eduClassEnrollment.count({ where: { classId: session.classId, studentId: { in: studentIds } } })
    if (enrolledCount !== studentIds.length) return res.status(400).json({ error: 'Há alunos fora da turma desta sessão.' })

    await prisma.$transaction([
      ...parsed.data.records.map(record => prisma.eduAttendance.upsert({
        where: { sessionId_studentId: { sessionId, studentId: record.studentId } },
        create: { clinicId, tenantId, sessionId, studentId: record.studentId, present: record.present, justified: record.justified, notes: record.notes, recordedById: actorId },
        update: { present: record.present, justified: record.justified, notes: record.notes, recordedById: actorId, recordedAt: new Date() }
      })),
      prisma.eduSession.update({ where: { id: sessionId }, data: { status: 'REALIZADA' } })
    ])

    await audit({ clinicId, tenantId, actorId, action: 'EDU_ATTENDANCE_RECORD', entityType: 'EduSession', entityId: sessionId, summary: `Frequência lançada para ${parsed.data.records.length} aluno(s); sessão marcada como REALIZADA.` })

    const rows = await prisma.eduAttendance.findMany({ where: { sessionId }, include: { student: true } })
    return res.status(201).json(rows)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao lançar frequência.' })
  }
}

export async function listSessionAttendance(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const sessionId = String(req.params.sessionId)
    const session = await prisma.eduSession.findFirst({ where: { id: sessionId, clinicId, tenantId } })
    if (!session) return res.status(404).json({ error: 'Sessão não encontrada.' })

    const rows = await prisma.eduAttendance.findMany({ where: { sessionId }, include: { student: true } })
    return res.json(rows)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao listar frequência da sessão.' })
  }
}

// ---------------------------------------------------------------
// PORTAL DO ALUNO (self-service)
// ---------------------------------------------------------------

export async function myProfile(req: AuthRequest, res: Response) {
  try {
    const student = await myStudent(req)
    if (!student) return res.status(404).json({ error: 'Cadastro de aluno não encontrado para este usuário.' })
    return res.json(student)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao carregar perfil do aluno.' })
  }
}

export async function myEnrollments(req: AuthRequest, res: Response) {
  try {
    const student = await myStudent(req)
    if (!student) return res.status(404).json({ error: 'Cadastro de aluno não encontrado para este usuário.' })

    const rows = await prisma.eduEnrollment.findMany({
      where: { studentId: student.id },
      include: { program: true, term: true, classEnrollments: { include: { class: { include: { curriculumSubject: { include: { subject: true } } } } } } }
    })
    return res.json(rows)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao carregar matrículas do aluno.' })
  }
}

export async function myAvailableSessions(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const student = await myStudent(req)
    if (!student) return res.status(404).json({ error: 'Cadastro de aluno não encontrado para este usuário.' })

    const classIds = (await prisma.eduClassEnrollment.findMany({ where: { studentId: student.id }, select: { classId: true } })).map(row => row.classId)
    const rows = await prisma.eduSession.findMany({
      where: { clinicId, tenantId, classId: { in: classIds }, status: { in: ['AGENDADA', 'CONFIRMADA'] }, scheduledAt: { gte: new Date() } },
      include: {
        class: { include: { curriculumSubject: { include: { subject: true } } } },
        bookings: { where: { studentId: student.id } },
        _count: { select: { bookings: { where: { status: 'CONFIRMADO' } } } }
      },
      orderBy: { scheduledAt: 'asc' }
    })
    return res.json(rows.map(row => {
      const capacity = row.capacity ?? row.class.capacity
      return { ...row, bookedCount: row._count.bookings, vacancies: Math.max(capacity - row._count.bookings, 0), myBookingStatus: row.bookings[0]?.status ?? null }
    }))
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao carregar sessões disponíveis.' })
  }
}

export async function myAttendance(req: AuthRequest, res: Response) {
  try {
    const student = await myStudent(req)
    if (!student) return res.status(404).json({ error: 'Cadastro de aluno não encontrado para este usuário.' })

    const rows = await prisma.eduAttendance.findMany({
      where: { studentId: student.id },
      include: { session: { include: { class: { include: { curriculumSubject: { include: { subject: true } } } } } } },
      orderBy: { recordedAt: 'desc' }
    })
    return res.json(rows)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao carregar frequência do aluno.' })
  }
}
