import { prisma } from '../lib/prisma'
import { dispatchRevah } from './revahProviderService'
import { loadSettings } from './followUpService'
import { writeAudit } from './auditService'
import type { HoldInfo } from './financialHoldService'

// Paciente com pendência financeira que foi agendado: avisa o gestor por e-mail dizendo se a pendência foi regularizada ou não.
// Nunca derruba o agendamento: qualquer falha aqui só vai para o log.
const SENDER = 'CompletoDonto <contato@dentalpos.com.br>'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const when = (d: Date) => d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })

export async function managerRecipients(clinicId: string, tenantId: string): Promise<string[]> {
  const configured = (await loadSettings(clinicId).catch(() => null))?.emails || []
  const managers = await prisma.user.findMany({
    where: { clinicId, tenantId, isActive: true, OR: [{ role: 'ADMIN' }, { accessProfiles: { some: { profile: { code: 'GESTOR', isActive: true } } } }] },
    select: { email: true }, take: 10,
  })
  return [...new Set([...configured, ...managers.map(m => String(m.email || '').trim().toLowerCase())].filter(e => EMAIL_RE.test(e)))].slice(0, 12)
}

export function holdScheduleBody(p: { patient: string; phone?: string | null; doctor: string; procedure: string; scheduledAt: Date; actor: string; regularized: boolean; hold: HoldInfo | null; overridden: boolean }) {
  const lines = [
    `O paciente ${p.patient}${p.phone ? ` (${p.phone})` : ''}, que estava com pendência financeira, foi agendado.`,
    '',
    `Situação da pendência: ${p.regularized ? 'REGULARIZOU a pendência antes de agendar.' : 'NÃO REGULARIZOU a pendência.'}`,
  ]
  if (!p.regularized && p.hold?.hasPending) {
    const oldest = p.hold.entries.reduce((m, e) => Math.max(m, e.daysOverdue), 0)
    lines.push(`Em aberto: ${brl(p.hold.total)} em ${p.hold.entries.length} lançamento(s), o mais antigo vencido há ${oldest} dia(s).`)
    if (p.overridden) lines.push('Este agendamento foi feito mesmo com a pendência, pela opção "Agendar mesmo assim" (o paciente já tinha outro horário marcado).')
  }
  lines.push('', `Agendamento: ${when(p.scheduledAt)} com ${p.doctor} — ${p.procedure}.`, `Agendado por: ${p.actor}.`)
  if (!p.regularized) lines.push('', 'Você pode acompanhar a cobrança em Contas a Receber e na agenda do paciente.')
  return lines.join('\n')
}

export async function notifyHoldScheduled(args: { clinicId: string; tenantId: string; actorId: string; patientId: string; doctorId: string; procedure: string; scheduledAt: Date; regularized: boolean; hold: HoldInfo | null; overridden: boolean }) {
  try {
    const apiKey = String(process.env.RESEND_API_KEY || '').trim()
    if (!apiKey) return
    const [patient, doctor, actor, to] = await Promise.all([
      prisma.patient.findUnique({ where: { id: args.patientId }, select: { fullName: true, phone: true } }),
      prisma.doctor.findUnique({ where: { id: args.doctorId }, include: { user: { select: { firstName: true, lastName: true } } } }),
      prisma.user.findUnique({ where: { id: args.actorId }, select: { firstName: true, lastName: true, email: true } }),
      managerRecipients(args.clinicId, args.tenantId),
    ])
    if (!patient || !to.length) return
    const doctorName = doctor?.user ? `${doctor.user.firstName} ${doctor.user.lastName}`.trim() : 'o profissional'
    const actorName = actor ? `${actor.firstName} ${actor.lastName}`.trim() || actor.email : 'a equipe'
    const body = holdScheduleBody({ patient: patient.fullName, phone: patient.phone, doctor: doctorName, procedure: args.procedure, scheduledAt: args.scheduledAt, actor: actorName, regularized: args.regularized, hold: args.hold, overridden: args.overridden })
    const subject = `${args.regularized ? 'Pendência regularizada' : 'Pendência NÃO regularizada'}: ${patient.fullName} foi agendado(a)`
    for (const address of to) await dispatchRevah('EMAIL', address, body, { apiKey, subject }, SENDER).catch((e: unknown) => console.error('Aviso de agendamento com pendência falhou:', e))
    await writeAudit({ clinicId: args.clinicId, tenantId: args.tenantId, actorId: args.actorId, module: 'agenda', action: 'FINANCIAL_HOLD_SCHEDULED_NOTICE', entityType: 'Patient', entityId: args.patientId, summary: `Gestor avisado: paciente agendado, pendência ${args.regularized ? 'regularizada' : 'não regularizada'}.` }).catch(() => undefined)
  } catch (error) {
    console.error('Aviso de agendamento com pendência:', error instanceof Error ? error.message : error)
  }
}
