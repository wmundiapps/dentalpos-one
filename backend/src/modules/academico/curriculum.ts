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
  createProgramSchema,
  createDisciplineSchema,
  linkCurriculumSchema,
  createTermSchema,
} from './validators';

const router = Router();

// ---------- Cursos (AcademicProgram) ----------

router.post(
  '/programs',
  requireAuth,
  requireRole('ADMIN', 'COORDINATOR'),
  validate(createProgramSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req);
    const program = await prisma.academicProgram.create({
      data: { tenantId, ...req.body },
    });
    res.status(201).json(program);
  }),
);

router.get(
  '/programs',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req);
    const programs = await prisma.academicProgram.findMany({
      where: { tenantId },
      include: { disciplinas: { include: { discipline: true } } },
      orderBy: { nome: 'asc' },
    });
    res.json(programs);
  }),
);

router.get(
  '/programs/:id',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req);
    const program = await prisma.academicProgram.findFirst({
      where: { id: String(req.params.id), tenantId },
      include: { disciplinas: { include: { discipline: true }, orderBy: { periodo: 'asc' } } },
    });
    if (!program) return res.status(404).json({ error: 'Curso não encontrado.' });
    res.json(program);
  }),
);

// ---------- Disciplinas ----------

router.post(
  '/disciplines',
  requireAuth,
  requireRole('ADMIN', 'COORDINATOR'),
  validate(createDisciplineSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req);
    const discipline = await prisma.discipline.create({
      data: { tenantId, ...req.body },
    });
    res.status(201).json(discipline);
  }),
);

router.get(
  '/disciplines',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req);
    const disciplines = await prisma.discipline.findMany({
      where: { tenantId },
      orderBy: { nome: 'asc' },
    });
    res.json(disciplines);
  }),
);

// ---------- Vínculo curricular (qual disciplina pertence a qual curso/período) ----------

router.post(
  '/curriculum-links',
  requireAuth,
  requireRole('ADMIN', 'COORDINATOR'),
  validate(linkCurriculumSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { programId, disciplineId } = req.body;

    const tenantId = getTenantId(req);
    const [program, discipline] = await Promise.all([
      prisma.academicProgram.findFirst({ where: { id: programId, tenantId } }),
      prisma.discipline.findFirst({ where: { id: disciplineId, tenantId } }),
    ]);
    if (!program || !discipline) {
      return res.status(404).json({ error: 'Curso ou disciplina não encontrado neste tenant.' });
    }

    const link = await prisma.curriculumDiscipline.create({ data: req.body });
    res.status(201).json(link);
  }),
);

// ---------- Períodos letivos ----------

router.post(
  '/terms',
  requireAuth,
  requireRole('ADMIN', 'COORDINATOR'),
  validate(createTermSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req);
    if (req.body.dataFim <= req.body.dataInicio) {
      return res.status(400).json({ error: 'dataFim deve ser posterior a dataInicio.' });
    }
    const term = await prisma.academicTerm.create({ data: { tenantId, ...req.body } });
    res.status(201).json(term);
  }),
);

router.get(
  '/terms',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req);
    const terms = await prisma.academicTerm.findMany({
      where: { tenantId },
      orderBy: { dataInicio: 'desc' },
    });
    res.json(terms);
  }),
);

export default router;
