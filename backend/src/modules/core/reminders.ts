import { prisma } from '../../lib/prisma'

// API interna que TODO módulo usa para não deixar nada cair no esquecimento.

export interface ReminderInput {
  tenantId: string
  modulo: string
  titulo: string
  dueAt: Date
  remindAt?: Date          // padrão: 3 dias antes do prazo (ou agora, se já passou)
  antecedenciaDias?: number
  descricao?: string
  refType?: string
  refId?: string
  severity?: 'INFO' | 'ATENCAO' | 'CRITICO'
  assigneeUserId?: string
  assigneeRole?: string
  assigneeStudentId?: string
  canal?: string
  recorrenciaDias?: number
  dedupeKey?: string       // evita duplicar o mesmo lembrete
}

const DAY = 86_400_000

export async function scheduleReminder(input: ReminderInput) {
  const remindAt =
    input.remindAt ?? new Date(Math.min(input.dueAt.getTime(), Math.max(Date.now(), input.dueAt.getTime() - (input.antecedenciaDias ?? 3) * DAY)))
  const data = {
    tenantId: input.tenantId,
    modulo: input.modulo,
    titulo: input.titulo,
    descricao: input.descricao,
    dueAt: input.dueAt,
    remindAt,
    refType: input.refType,
    refId: input.refId,
    severity: input.severity ?? 'INFO',
    assigneeUserId: input.assigneeUserId,
    assigneeRole: input.assigneeRole,
    assigneeStudentId: input.assigneeStudentId,
    canal: input.canal ?? 'IN_APP',
    recorrenciaDias: input.recorrenciaDias,
    dedupeKey: input.dedupeKey,
  }
  if (input.dedupeKey) {
    return prisma.eduReminder.upsert({
      where: { tenantId_dedupeKey: { tenantId: input.tenantId, dedupeKey: input.dedupeKey } },
      create: data,
      update: { titulo: data.titulo, descricao: data.descricao, dueAt: data.dueAt, remindAt: data.remindAt, severity: data.severity },
    })
  }
  return prisma.eduReminder.create({ data })
}

// Conclui lembretes ligados a um registro (ex.: processo MEC protocolado).
export async function completeReminders(params: { tenantId: string; refType: string; refId: string; userId?: string }) {
  return prisma.eduReminder.updateMany({
    where: { tenantId: params.tenantId, refType: params.refType, refId: params.refId, status: { in: ['PENDENTE', 'NOTIFICADO', 'ADIADO'] } },
    data: { status: 'CONCLUIDO', concluidoEm: new Date(), concluidoPorId: params.userId },
  })
}

export async function cancelReminders(params: { tenantId: string; refType: string; refId: string }) {
  return prisma.eduReminder.updateMany({
    where: { tenantId: params.tenantId, refType: params.refType, refId: params.refId, status: { in: ['PENDENTE', 'NOTIFICADO', 'ADIADO'] } },
    data: { status: 'CANCELADO' },
  })
}

// Processa lembretes vencidos: gera notificação na caixa de saída, repete os
// recorrentes e escala os atrasados para CRITICO. Chamado pelo cron.
export async function processDueReminders(now = new Date(), limit = 500) {
  const due = await prisma.eduReminder.findMany({
    where: { status: { in: ['PENDENTE', 'NOTIFICADO'] }, remindAt: { lte: now } },
    orderBy: { remindAt: 'asc' },
    take: limit,
  })
  let notificados = 0
  let escalonados = 0
  for (const r of due) {
    const atrasado = r.dueAt.getTime() < now.getTime()
    const jaNotificado = r.status === 'NOTIFICADO'
    if (jaNotificado && !(atrasado && !r.escalonadoEm) && !r.recorrenciaDias) continue

    const destinos: Array<{ userId?: string; studentId?: string }> = []
    if (r.assigneeUserId) destinos.push({ userId: r.assigneeUserId })
    if (r.assigneeStudentId) destinos.push({ studentId: r.assigneeStudentId })
    if (r.assigneeRole) {
      const users = await prisma.user.findMany({ where: { tenantId: r.tenantId, role: r.assigneeRole, isActive: true }, select: { id: true }, take: 200 })
      for (const u of users) destinos.push({ userId: u.id })
    }
    if (destinos.length === 0) destinos.push({})

    const prefixo = atrasado ? '⚠ ATRASADO: ' : '⏰ Lembrete: '
    await prisma.eduNotification.createMany({
      data: destinos.map((d) => ({
        tenantId: r.tenantId,
        canal: r.canal,
        userId: d.userId,
        studentId: d.studentId,
        assunto: prefixo + r.titulo,
        mensagem: `${prefixo}${r.titulo}${r.descricao ? ' — ' + r.descricao : ''} (prazo: ${r.dueAt.toLocaleDateString('pt-BR')})`,
        refType: 'EduReminder',
        refId: r.id,
      })),
    })
    notificados++

    const patch: any = { status: 'NOTIFICADO' }
    if (atrasado && !r.escalonadoEm) {
      patch.severity = 'CRITICO'
      patch.escalonadoEm = now
      escalonados++
    }
    if (r.recorrenciaDias) patch.remindAt = new Date(now.getTime() + r.recorrenciaDias * DAY)
    await prisma.eduReminder.update({ where: { id: r.id }, data: patch })
  }
  return { avaliados: due.length, notificados, escalonados }
}
