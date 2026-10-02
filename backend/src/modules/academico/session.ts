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

    const classSection = await prisma.classSection.findUnique({ where: { id: classSectionId } });
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

    const sessions = await prisma.classSession.findMany({
      where: {
        classSectionId,
        ...(apenasDisponiveis === 'true'
          ? { status: 'AGENDADA', dataHoraInicio: { gt: new Date() } }
          : {}),
      },
      include: { _count: { select: { agendamentos: true } } },
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
    const session = await prisma.classSession.findUnique({
      where: { id: String(req.params.id) },
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

    const session = await prisma.classSession.findUnique({
      where: { id: sessionId },
      include: { _count: { select: { agendamentos: true } } },
    });
    if (!session) return res.status(404).json({ error: 'Sessão não encontrada.' });
    if (session.status !== 'AGENDADA') {
      return res.status(409).json({ error: 'Esta sessão não está mais disponível para agendamento.' });
    }
    if (session.dataHoraInicio <= new Date()) {
      return res.status(409).json({ error: 'Não é possível agendar uma aula que já começou.' });
    }

    // aluno precisa estar matriculado na turma da sessão
    const matriculado = await prisma.classSectionEnrollment.findFirst({
      where: {
        classSectionId: session.classSectionId,
        enrollment: { studentId },
      },
    });
    if (!matriculado) {
      return res.status(403).json({ error: 'Aluno não está matriculado na turma desta aula.' });
    }

    if (session.vagasPratica != null && session._count.agendamentos >= session.vagasPratica) {
      return res.status(409).json({ error: 'Não há mais vagas neste horário.' });
    }

    try {
      const booking = await prisma.classSessionBooking.create({
        data: { classSessionId: sessionId, studentId },
      });
      res.status(201).json(booking);
    } catch (err: any) {
      if (err.code === 'P2002') {
        return res.status(409).json({ error: 'Você já tem um agendamento para esta aula.' });
      }
      throw err;
    }
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

    const session = await prisma.classSession.findUnique({ where: { id: sessionId } });
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

    const session = await prisma.classSection.findFirst({
      where: { sessoes: { some: { id: sessionId } } },
    });
    if (!session) return res.status(404).json({ error: 'Sessão não encontrada.' });
    if (req.user!.role === 'TEACHER' && session.professorUserId !== req.user!.id) {
      return res.status(403).json({ error: 'Você não leciona esta turma.' });
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
