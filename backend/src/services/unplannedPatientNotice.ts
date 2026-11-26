import { prisma } from '../lib/prisma'
import { dispatchRevah } from './revahProviderService'
import { writeAudit } from './auditService'
import { UNPLANNED_ORIGIN } from './unplannedProcedureService'

// Aviso ao paciente sobre procedimento identificado fora do orçamento inicial. Só sai depois que o gestor/proprietário autoriza
// (o lançamento ou o orçamento inicial pode ter erro de preenchimento). O texto pede que o paciente confira com a clínica.
const SENDER = 'CompletoDonto <contato@dentalpos.com.br>'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type NoticeItem = { id: string; tooth: number | null; procedure: string; planningData: unknown }

export function noticeText(patientName: string, clinicName: string, items: Array<{ tooth: number | null; procedure: string }>, clinicPhone?: string | null) {
  const list = [...new Set(items.map(i => `${i.procedure}${i.tooth ? ` (dente ${i.tooth})` : ''}`))].join('; ')
  const first = String(patientName || '').trim().split(' ')[0] || 'paciente'
  return [
    `Olá, ${first}.`,
    '',
    `No seu último atendimento foi identificado o procedimento: ${list}.`,
    '',
    'Confira com a clínica se este procedimento já está incluído no orçamento inicial ou se precisa de alguma nova combinação financeira.',
    'Caso já esteja incluído no orçamento inicial, favor desconsiderar este lembrete.',
    '',
    `${clinicName}${clinicPhone ? ` — ${clinicPhone}` : ''}`,
  ].join('\n')
}

export async function pendingNoticeItems(clinicId: string, tenantId: string, patientId: string): Promise<NoticeItem[]> {
  const rows = await prisma.treatmentItem.findMany({
    where: { clinicId, tenantId, patientId, origin: UNPLANNED_ORIGIN, createdAt: { gte: new Date(Date.now() - 90 * 86400000) } },
    select: { id: true, tooth: true, procedure: true, planningData: true }, orderBy: { createdAt: 'desc' }, take: 40,
  })
  return rows.filter(r => !((r.planningData || {}) as { noticeSentAt?: string }).noticeSentAt)
}

// Gestor/proprietário autorizou: envia o aviso ao paciente por e-mail (se houver) e marca os itens para não repetir.
export async function sendUnplannedNotice(opts: { clinicId: string; tenantId: string; actorId: string; patientId: string }) {
  const { clinicId, tenantId, actorId, patientId } = opts
  const [patient, clinic, items] = await Promise.all([
    prisma.patient.findFirst({ where: { id: patientId, clinicId, tenantId }, select: { fullName: true, email: true } }),
    prisma.clinic.findFirst({ where: { id: clinicId }, select: { name: true, displayName: true, phone: true } }),
    pendingNoticeItems(clinicId, tenantId, patientId),
  ])
  if (!patient) return { ok: false as const, status: 404, error: 'Paciente não encontrado.' }
  if (!items.length) return { ok: false as const, status: 409, error: 'Não há procedimento novo aguardando aviso para este paciente.' }
  const text = noticeText(patient.fullName, clinic?.displayName || clinic?.name || 'Clínica', items, clinic?.phone)
  const email = String(patient.email || '').trim()
  let sent = false
  const apiKey = String(process.env.RESEND_API_KEY || '').trim()
  if (EMAIL_RE.test(email) && apiKey) {
    try { const r = await dispatchRevah('EMAIL', email, text, { apiKey, subject: `Mensagem da ${clinic?.displayName || clinic?.name || 'clínica'}: confira seu orçamento` }, SENDER); sent = !r.simulated } catch (e) { console.error('Aviso de procedimento novo ao paciente falhou:', e instanceof Error ? e.message : e) }
  }
  if (sent) {
    const at = new Date().toISOString()
    for (const it of items) await prisma.treatmentItem.update({ where: { id: it.id }, data: { planningData: { ...((it.planningData || {}) as object), noticeSentAt: at, noticeSentBy: actorId } as never } }).catch(() => undefined)
  }
  await writeAudit({ clinicId, tenantId, actorId, module: 'clinical', action: sent ? 'UNPLANNED_NOTICE_SENT' : 'UNPLANNED_NOTICE_AUTHORIZED', entityType: 'Patient', entityId: patientId, summary: sent ? `Gestor autorizou e o aviso de procedimento novo foi enviado ao paciente (${items.length} item(ns)).` : `Gestor autorizou o aviso, mas o paciente não tem e-mail válido: texto devolvido para envio manual.` }).catch(() => undefined)
  return { ok: true as const, sent, hasEmail: EMAIL_RE.test(email), text, items: items.length }
}
