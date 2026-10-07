import { prisma } from '../lib/prisma'
import { decryptSecret } from './secretVault'
import { dispatchRevah } from './revahProviderService'

// Envia ao paciente, por e-mail, a cobrança gerada (link de pagamento, Pix copia e cola e linha digitável do boleto).
// Usa o remetente de e-mail da clínica ou, se não houver, a conta da plataforma (mesmo caminho da régua de cobrança).
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const brDate = (d: Date) => new Date(d.getTime()).toLocaleDateString('pt-BR', { timeZone: 'UTC' })
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export type ChargeEmailResult = { sent: boolean; to: string | null; reason?: string }

export async function sendChargeEmail(input: {
  clinicId: string; tenantId: string; patientName: string; email: string | null | undefined
  charge: { value: number; dueDate: Date; billingType: string; invoiceUrl: string | null; pixCopyPaste: string | null; digitableLine: string | null }
}): Promise<ChargeEmailResult> {
  const email = String(input.email || '').trim().toLowerCase()
  if (!email) return { sent: false, to: null, reason: 'O paciente não tem e-mail cadastrado.' }
  if (!EMAIL_RE.test(email)) return { sent: false, to: email, reason: 'E-mail inválido.' }
  const clinic = await prisma.clinic.findFirst({ where: { id: input.clinicId }, select: { name: true, displayName: true } })
  const clinicName = clinic?.displayName || clinic?.name || 'sua clínica'
  const first = input.patientName.trim().split(/\s+/)[0] || 'paciente'
  const kind = input.charge.billingType === 'BOLETO' ? 'boleto' : input.charge.billingType === 'PIX' ? 'Pix' : input.charge.billingType === 'CREDIT_CARD' ? 'pagamento no cartão' : 'forma de pagamento'
  const lines = [
    `Olá, ${first}!`,
    '',
    `A ${clinicName} gerou uma cobrança no valor de ${brl(input.charge.value)}, com vencimento em ${brDate(input.charge.dueDate)}.`,
    '',
    ...(input.charge.invoiceUrl ? [`Para pagar (${kind}), acesse: ${input.charge.invoiceUrl}`, ''] : []),
    ...(input.charge.pixCopyPaste ? [`Pix copia e cola:`, input.charge.pixCopyPaste, ''] : []),
    ...(input.charge.digitableLine ? [`Linha digitável do boleto:`, input.charge.digitableLine, ''] : []),
    'Em caso de dúvida, responda este e-mail ou fale com a clínica.',
  ]
  const message = lines.join('\n')

  const sender = await prisma.revahSender.findFirst({ where: { clinicId: input.clinicId, tenantId: input.tenantId, channel: 'EMAIL', isDefault: true, isActive: true } })
  const platformKey = !sender ? String(process.env.RESEND_API_KEY || '').trim() : ''
  if (!sender && !platformKey) return { sent: false, to: email, reason: 'Nenhum remetente de e-mail configurado.' }
  let credentials: Record<string, unknown> = {}
  if (sender) {
    try { credentials = decryptSecret<Record<string, unknown>>(sender.encryptedCredentials) || {} } catch { return { sent: false, to: email, reason: 'Credenciais do e-mail não puderam ser abertas.' } }
  } else credentials = { apiKey: platformKey }
  if (!Object.keys(credentials).length || credentials.simulated === true) return { sent: false, to: email, reason: 'Canal de e-mail ainda sem credenciais reais.' }
  const address = sender ? sender.address : `${clinicName} <contato@dentalpos.com.br>`
  try {
    const result = await dispatchRevah('EMAIL', email, message, { ...credentials, subject: `Cobrança de ${clinicName}: ${brl(input.charge.value)} com vencimento em ${brDate(input.charge.dueDate)}` }, address)
    if (result.simulated) return { sent: false, to: email, reason: `Provedor ${result.provider} em modo simulado.` }
    await prisma.revahMessage.create({ data: { clinicId: input.clinicId, tenantId: input.tenantId, senderId: sender?.id ?? null, channel: 'EMAIL', destination: email, content: message, contactName: input.patientName, provider: result.provider, providerMessageId: result.providerMessageId, status: 'SENT', sentAt: new Date() } })
    return { sent: true, to: email }
  } catch (error) {
    return { sent: false, to: email, reason: error instanceof Error ? error.message : 'Falha no envio.' }
  }
}
