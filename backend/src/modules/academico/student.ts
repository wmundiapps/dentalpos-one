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

    const classSection = await prisma.classSection.findUnique({
      where: { id: classSectionId },
      include: { _count: { select: { matriculados: true } } },
    });
    if (!classSection) return res.status(404).json({ error: 'Turma não encontrada.' });

    if (classSection.vagas != null && classSection._count.matriculados >= classSection.vagas) {
      return res.status(409).json({ error: 'Turma sem vagas disponíveis.' });
    }

    const already = await prisma.classSectionEnrollment.findUnique({
      where: { enrollmentId_classSectionId: { enrollmentId, classSectionId } },
    });
    if (already) {
      return res.status(409).json({ error: 'Aluno já matriculado nesta turma.' });
    }

    const link = await prisma.classSectionEnrollment.create({
      data: { enrollmentId, classSectionId },
    });
    res.status(201).json(link);
  }),
);

export default router;
