import { Router, Response } from 'express';
import { prisma } from '../../lib/prisma'; // AJUSTE: caminho real do seu cliente Prisma
import {
  AuthenticatedRequest,
  asyncHandler,
  requireAuth,
  requireRole,
  getTenantId,
} from './middleware';
import { validate, createClassSectionSchema } from './validators';

const router = Router();

router.post(
  '/class-sections',
  requireAuth,
  requireRole('ADMIN', 'COORDINATOR'),
  validate(createClassSectionSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req);
    const { disciplineId, termId } = req.body;

    const [discipline, term] = await Promise.all([
      prisma.discipline.findFirst({ where: { id: disciplineId, tenantId } }),
      prisma.academicTerm.findFirst({ where: { id: termId, tenantId } }),
    ]);
    if (!discipline || !term) {
      return res.status(404).json({ error: 'Disciplina ou período não encontrado.' });
    }

    const classSection = await prisma.classSection.create({
      data: { tenantId, ...req.body },
    });
    res.status(201).json(classSection);
  }),
);

router.get(
  '/class-sections',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req);
    const { termId, disciplineId, professorUserId } = req.query as Record<string, string>;

    const where: any = { tenantId };
    if (termId) where.termId = termId;
    if (disciplineId) where.disciplineId = disciplineId;
    if (professorUserId) where.professorUserId = professorUserId;

    // professor só vê as próprias turmas por padrão, salvo staff administrativo
    if (req.user!.role === 'TEACHER' && !professorUserId) {
      where.professorUserId = req.user!.id;
    }

    const classSections = await prisma.classSection.findMany({
      where,
      include: {
        discipline: true,
        term: true,
        _count: { select: { matriculados: true, sessoes: true } },
      },
      orderBy: { nome: 'asc' },
    });
    res.json(classSections);
  }),
);

router.get(
  '/class-sections/:id',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req);
    const classSection = await prisma.classSection.findFirst({
      where: { id: String(req.params.id), tenantId },
      include: {
        discipline: true,
        term: true,
        campus: true,
        matriculados: { include: { enrollment: { include: { student: true } } } },
        sessoes: { orderBy: { dataHoraInicio: 'asc' } },
      },
    });
    if (!classSection) return res.status(404).json({ error: 'Turma não encontrada.' });
    res.json(classSection);
  }),
);

export default router;
