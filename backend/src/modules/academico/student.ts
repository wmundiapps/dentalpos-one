import { Router, Response } from 'express';
import { prisma } from '../../lib/prisma'; // AJUSTE: caminho real do seu cliente Prisma
import {
  AuthenticatedRequest,
  asyncHandler,
  requireAuth,
  requireRole,
  getTenantId,
} from './middleware';
import {
  validate,
  createStudentSchema,
  createEnrollmentSchema,
  enrollInClassSectionSchema,
} from './validators';

const router = Router();

// ---------- Cadastro de aluno ----------

router.post(
  '/students',
  requireAuth,
  requireRole('ADMIN', 'COORDINATOR'),
  validate(createStudentSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req);

    const existing = await prisma.student.findUnique({ where: { ra: req.body.ra } });
    if (existing) {
      return res.status(409).json({ error: 'Já existe um aluno com este RA.' });
    }
    // o usuário de login precisa pertencer ao mesmo tenant
    const loginUser = await prisma.user.findFirst({ where: { id: req.body.userId, tenantId }, select: { id: true } });
    if (!loginUser) return res.status(404).json({ error: 'Usuário não encontrado neste tenant.' });
    const userTaken = await prisma.student.findUnique({ where: { userId: req.body.userId } });
    if (userTaken) return res.status(409).json({ error: 'Este usuário já está vinculado a outro aluno.' });

    const student = await prisma.student.create({ data: { tenantId, ...req.body } });
    res.status(201).json(student);
  }),
);

router.get(
  '/students/:id',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req);

    // um aluno só pode ver o próprio perfil; staff pode ver qualquer um
    const isStaff = ['ADMIN', 'COORDINATOR', 'TEACHER', 'FINANCE', 'BOARD'].includes(
      req.user!.role,
    );
    if (!isStaff && req.user!.studentId !== String(req.params.id)) {
      return res.status(403).json({ error: 'Sem permissão para ver este aluno.' });
    }

    const student = await prisma.student.findFirst({
      where: { id: String(req.params.id), tenantId },
      include: {
        matriculas: {
          include: { program: true, term: true, turmas: { include: { classSection: true } } },
        },
        certificados: true,
      },
    });
    if (!student) return res.status(404).json({ error: 'Aluno não encontrado.' });
    res.json(student);
  }),
);

router.get(
  '/students',
  requireAuth,
  requireRole('ADMIN', 'COORDINATOR', 'FINANCE', 'BOARD'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req);
    const { status, q, page = '1', pageSize = '25' } = req.query as Record<string, string>;

    const where: any = { tenantId };
    if (status) where.status = status;
    if (q) {
      where.OR = [
        { nomeCompleto: { contains: q, mode: 'insensitive' } },
        { ra: { contains: q, mode: 'insensitive' } },
      ];
    }

    const take = Math.min(parseInt(pageSize, 10) || 25, 100);
    const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * take;

    const [items, total] = await Promise.all([
      prisma.student.findMany({ where, take, skip, orderBy: { nomeCompleto: 'asc' } }),
      prisma.student.count({ where }),
    ]);

    res.json({ items, total, page: Number(page), pageSize: take });
  }),
);

// ---------- Matrícula em curso/período ----------

router.post(
  '/enrollments',
  requireAuth,
  requireRole('ADMIN', 'COORDINATOR'),
  validate(createEnrollmentSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req);
    const { studentId, programId, termId } = req.body;

    const [student, program, term] = await Promise.all([
      prisma.student.findFirst({ where: { id: studentId, tenantId } }),
      prisma.academicProgram.findFirst({ where: { id: programId, tenantId } }),
      prisma.academicTerm.findFirst({ where: { id: termId, tenantId } }),
    ]);
    if (!student || !program || !term) {
      return res.status(404).json({ error: 'Aluno, curso ou período não encontrado.' });
    }

    if (student.status !== 'ATIVO') {
      return res.status(409).json({ error: 'Aluno não está ativo; não é possível matricular.' });
    }
    const dup = await prisma.enrollment.findFirst({
      where: { studentId, programId, termId, status: { in: ['ATIVA', 'TRANCADA'] } },
    });
    if (dup) return res.status(409).json({ error: 'Aluno já matriculado neste curso/período.' });

    const enrollment = await prisma.enrollment.create({
      data: { studentId, programId, termId },
    });
    res.status(201).json(enrollment);
  }),
);

// ---------- Matrícula em turma específica (dentro de uma matrícula de curso) ----------

router.post(
  '/enrollments/class-sections',
  requireAuth,
  requireRole('ADMIN', 'COORDINATOR'),
  validate(enrollInClassSectionSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { enrollmentId, classSectionId } = req.body;
    const tenantId = getTenantId(req);

    const classSection = await prisma.classSection.findFirst({ where: { id: classSectionId, tenantId } });
    if (!classSection) return res.status(404).json({ error: 'Turma não encontrada.' });
    const enrollment = await prisma.enrollment.findFirst({
      where: { id: enrollmentId, student: { tenantId } },
    });
    if (!enrollment) return res.status(404).json({ error: 'Matrícula não encontrada.' });
    if (enrollment.status !== 'ATIVA') {
      return res.status(409).json({ error: 'Matrícula não está ativa.' });
    }
    if (enrollment.termId !== classSection.termId) {
      return res.status(409).json({ error: 'Turma pertence a outro período letivo.' });
    }

    // checagem de vagas + inserção sob lock da turma (evita estourar vagas em concorrência)
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ClassSection" WHERE id = ${classSectionId} FOR UPDATE`;
      const already = await tx.classSectionEnrollment.findUnique({
        where: { enrollmentId_classSectionId: { enrollmentId, classSectionId } },
      });
      if (already) return { error: 'Aluno já matriculado nesta turma.' };
      const count = await tx.classSectionEnrollment.count({ where: { classSectionId } });
      if (classSection.vagas != null && count >= classSection.vagas) {
        return { error: 'Turma sem vagas disponíveis.' };
      }
      return { link: await tx.classSectionEnrollment.create({ data: { enrollmentId, classSectionId } }) };
    });
    if ('error' in result) return res.status(409).json({ error: result.error });
    const link = result.link;
    res.status(201).json(link);
  }),
);

export default router;
