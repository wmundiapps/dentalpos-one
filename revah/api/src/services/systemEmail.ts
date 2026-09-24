import { config } from '../config'

// E-mails do próprio REVAH (recuperação de senha, convites).
export async function sendSystemEmail(to: string, subject: string, text: string) {
  if (!config.systemEmail.resendKey) {
    console.warn(`[revah] REVAH_SYSTEM_RESEND_KEY ausente — e-mail não enviado para ${to}: ${subject}`)
    return false
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.systemEmail.resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: config.systemEmail.from, to: [to], subject, text }),
  })
  return res.ok
}
