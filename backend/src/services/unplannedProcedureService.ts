import { prisma } from '../lib/prisma'
import { dispatchRevah } from './revahProviderService'
import { writeAudit } from './auditService'

// Procedimento lançado como feito sem estar no plano de tratamento/orçamento: o gestor é avisado por e-mail
// e a pendência "novo procedimento para orçar" aparece nas pendências até haver um orçamento novo do paciente.
export const UNPLANNED_ORIGIN = 'ODONTOGRAM_NAO_PLANEJADO'

export async function notifyManagersUnplanned(opts: { clinicId: string; tenantId: string; actorId: string; patientName: string; patientId: string; professional: string; items: Array<{ tooth: number; procedure: string }> }) {
  const lines = opts.items.map(i => `• Dente ${i.tooth}: ${i.procedure}`)
  await writeAudit({ clinicId: opts.clinicId, tenantId: opts.tenantId, actorId: opts.actorId, module: 'clinical', action: 'UNPLANNED_PROCEDURE', entityType: 'Patient', entityId: opts.patientId, summary: `Procedimento fora do plano em ${opts.patientName}: ${opts.items.map(i => `${i.tooth} ${i.procedure}`).join('; ')}` }).catch((e: unknown) => console.error(e))
  const apiKey = String(process.env.RESEND_API_KEY || '').trim()
  if (!apiKey) return { sent: 0 }
  const managers = await prisma.user.findMany({
    where: { clinicId: opts.clinicId, tenantId: opts.tenantId, isActive: true, OR: [{ role: 'ADMIN' }, { accessProfiles: { some: { profile: { code: 'GESTOR', isActive: true } } } }] },
    select: { email: true }, take: 10
  })
  const to = [...new Set(managers.map(m => m.email).filter(Boolean))]
  const message = `Novo procedimento lançado fora do plano de tratamento.\n\nPaciente: ${opts.patientName}\nProfissional: ${opts.professional || 'não informado'}\n${lines.join('\n')}\n\nPasse o orçamento deste procedimento ao paciente: abra Plano e orçamento na ficha do paciente.`
  let sent = 0
  for (const address of to) {
    await dispatchRevah('EMAIL', address, message, { apiKey, subject: `Novo procedimento para orçar — ${opts.patientName}` }, 'CompletoDonto <contato@dentalpos.com.br>')
      .then(() => { sent++ }).catch((e: unknown) => console.error('Aviso de procedimento fora do plano falhou:', e))
  }
  return { sent }
}
