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
  createClassSessionSchema,
  createBookingSchema,
  markAttendanceSchema,
} from './validators';

const router = Router();

// ============================================================
// SESSÕES DE AULA (agenda concreta: teórica ou prática)
// ============================================================

router.post(
  '/class-sessions',
  requireAuth,
  requireRole('ADMIN', 'COORDINATOR', 'TEACHER'),
  validate(createClassSessionSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { classSectionId } = req.body;
    const tenantId = getTenantId(req);

    const classSection = await prisma.classSection.findFirst({ where: { id: classSectionId, tenantId } });
    if (!classSection) return res.status(404).json({ error: 'Turma não encontrada.' });

    // professor só cria aula na própria turma
    if (req.user!.role === 'TEACHER' && classSection.professorUserId !== req.user!.id) {
      return res.status(403).json({ error: 'Você não leciona esta turma.' });
    }

    const session = await prisma.classSession.create({ data: req.body });
    res.status(201).json(session);
  }),
);

// Lista sessões de uma turma — é essa lista que o aluno usa para escolher dia/horário
router.get(
  '/class-sections/:classSectionId/sessions',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { classSectionId } = req.params as Record<string, string>;
    const { apenasDisponiveis } = req.query as Record<string, string>;
    const tenantId = getTenantId(req);

    const sessions = await prisma.classSession.findMany({
      where: {
        classSectionId,
        classSection: { tenantId },
        ...(apenasDisponiveis === 'true'
          ? { status: 'AGENDADA', dataHoraInicio: { gt: new Date() } }
          : {}),
      },
      include: { _count: { select: { agendamentos: { where: { status: { not: 'CANCELADO' } } } } } },
      orderBy: { dataHoraInicio: 'asc' },
    });

    const withVagas = sessions.map((s) => ({
      ...s,
      vagasRestantes:
        s.vagasPratica != null ? Math.max(s.vagasPratica - s._count.agendamentos, 0) : null,
    }));

    res.json(withVagas);
  }),
);

router.get(
  '/class-sessions/:id',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const session = await prisma.classSession.findFirst({
      where: { id: String(req.params.id), classSection: { tenantId: getTenantId(req) } },
      include: {
        classSection: { include: { discipline: true } },
        agendamentos: { include: { student: true } },
        frequencias: true,
      },
    });
    if (!session) return res.status(404).json({ error: 'Sessão não encontrada.' });
    res.json(session);
  }),
);

// ============================================================
// AGENDAMENTO PELO ALUNO (o fluxo central pedido)
// ============================================================

router.post(
  '/class-sessions/:id/bookings',
  requireAuth,
  validate(createBookingSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const sessionId = String(req.params.id);
    const studentId = req.body.studentId ?? req.user!.studentId;

    if (!studentId) {
      return res.status(400).json({ error: 'studentId é obrigatório.' });
    }
    // aluno só agenda para si mesmo; staff pode agendar para qualquer aluno
    const isStaff = ['ADMIN', 'COORDINATOR', 'TEACHER'].includes(req.user!.role);
    if (!isStaff && req.user!.studentId !== studentId) {
      return res.status(403).json({ error: 'Você só pode agendar para si mesmo.' });
    }

    const tenantId = getTenantId(req);
    const session = await prisma.classSession.findFirst({
      where: { id: sessionId, classSection: { tenantId } },
    });
    if (!session) return res.status(404).json({ error: 'Sessão não encontrada.' });
    if (session.status !== 'AGENDADA') {
      return res.status(409).json({ error: 'Esta sessão não está mais disponível para agendamento.' });
    }
    if (session.dataHoraInicio <= new Date()) {
      return res.status(409).json({ error: 'Não é possível agendar uma aula que já começou.' });
    }

    const student = await prisma.student.findFirst({ where: { id: studentId, tenantId }, select: { id: true } });
    if (!student) return res.status(404).json({ error: 'Aluno não encontrado.' });

    // aluno precisa estar matriculado (matrícula ativa) na turma da sessão
    const matriculado = await prisma.classSectionEnrollment.findFirst({
      where: {
        classSectionId: session.classSectionId,
        enrollment: { studentId, status: 'ATIVA' },
      },
    });
    if (!matriculado) {
      return res.status(403).json({ error: 'Aluno não está matriculado na turma desta aula.' });
    }

    // vagas + criação sob lock da sessão (evita overbooking em concorrência)
    const out = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ClassSession" WHERE id = ${sessionId} FOR UPDATE`;
      const existing = await tx.classSessionBooking.findUnique({
        where: { classSessionId_studentId: { classSessionId: sessionId, studentId } },
      });
      if (existing && existing.status !== 'CANCELADO') {
        return { error: 'Você já tem um agendamento para esta aula.' };
      }
      if (session.vagasPratica != null) {
        const ocupadas = await tx.classSessionBooking.count({
          where: { classSessionId: sessionId, status: { not: 'CANCELADO' } },
        });
        if (ocupadas >= session.vagasPratica) return { error: 'Não há mais vagas neste horário.' };
      }
      const booking = existing
        ? await tx.classSessionBooking.update({ where: { id: existing.id }, data: { status: 'CONFIRMADO' } })
        : await tx.classSessionBooking.create({ data: { classSessionId: sessionId, studentId } });
      return { booking };
    });
    if ('error' in out) return res.status(409).json({ error: out.error });
    res.status(201).json(out.booking);
  }),
);

router.delete(
  '/class-sessions/:id/bookings/:studentId',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id: sessionId, studentId } = req.params as Record<string, string>;

    const isStaff = ['ADMIN', 'COORDINATOR', 'TEACHER'].includes(req.user!.role);
    if (!isStaff && req.user!.studentId !== studentId) {
      return res.status(403).json({ error: 'Você só pode cancelar o próprio agendamento.' });
    }

    const session = await prisma.classSession.findFirst({
      where: { id: sessionId, classSection: { tenantId: getTenantId(req) } },
    });
    if (!session) return res.status(404).json({ error: 'Sessão não encontrada.' });
    if (session.status === 'REALIZADA') {
      return res.status(409).json({ error: 'Não é possível cancelar: a aula já foi realizada.' });
    }

    await prisma.classSessionBooking.update({
      where: { classSessionId_studentId: { classSessionId: sessionId, studentId } },
      data: { status: 'CANCELADO' },
    });
    res.status(204).send();
  }),
);

// ============================================================
// FREQUÊNCIA
// ============================================================

router.post(
  '/class-sessions/:id/attendance',
  requireAuth,
  requireRole('ADMIN', 'COORDINATOR', 'TEACHER'),
  validate(markAttendanceSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const sessionId = String(req.params.id);
    const { registros } = req.body as {
      registros: { studentId: string; presente: boolean; justificativa?: string }[];
    };

    const tenantId = getTenantId(req);
    const section = await prisma.classSection.findFirst({
      where: { tenantId, sessoes: { some: { id: sessionId } } },
      include: { sessoes: { where: { id: sessionId }, select: { status: true } } },
    });
    if (!section) return res.status(404).json({ error: 'Sessão não encontrada.' });
    if (req.user!.role === 'TEACHER' && section.professorUserId !== req.user!.id) {
      return res.status(403).json({ error: 'Você não leciona esta turma.' });
    }
    if (section.sessoes[0]?.status === 'CANCELADA') {
      return res.status(409).json({ error: 'Sessão cancelada: não é possível lançar frequência.' });
    }
    const ids = [...new Set(registros.map((r) => r.studentId))];
    const validos = await prisma.classSectionEnrollment.findMany({
      where: { classSectionId: section.id, enrollment: { studentId: { in: ids } } },
      select: { enrollment: { select: { studentId: true } } },
    });
    const okSet = new Set(validos.map((v) => v.enrollment.studentId));
    const invalidos = ids.filter((i) => !okSet.has(i));
    if (invalidos.length) {
      return res.status(400).json({ error: 'Alunos não matriculados nesta turma.', studentIds: invalidos });
    }

    const results = await prisma.$transaction(
      registros.flatMap((r) => [
        prisma.attendance.upsert({
          where: { classSessionId_studentId: { classSessionId: sessionId, studentId: r.studentId } },
          create: {
            classSessionId: sessionId,
            studentId: r.studentId,
            presente: r.presente,
            justificativa: r.justificativa,
          },
          update: { presente: r.presente, justificativa: r.justificativa },
        }),
        prisma.classSessionBooking.updateMany({
          where: { classSessionId: sessionId, studentId: r.studentId },
          data: { status: r.presente ? 'PRESENTE' : 'FALTOU' },
        }),
      ]),
    );

    await prisma.classSession.update({ where: { id: sessionId }, data: { status: 'REALIZADA' } });

    res.json({ registrosProcessados: registros.length, results });
  }),
);

export default router;
