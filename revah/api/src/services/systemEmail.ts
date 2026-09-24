import { config } from '../config'

// E-mails do próprio REVAH (recuperação de senha, convites).
export async function sendSystemEmail(to: string, subject: string, text: string) {
  if (!config.systemEmail.resendKey) {
    console.warn(`[revah] REVAH_SYSTEM_RESEND_KEY ausente — e-mail não enviado para ${to}: ${subject}`)
    return false
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.systemEmail.resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: config.systemEmail.from, to: [to], subject, text }),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) console.error('[revah] Resend recusou e-mail', res.status, (await res.text()).slice(0, 300))
    return res.ok
  } catch (e) {
    console.error('[revah] falha ao enviar e-mail', (e as Error).message)
    return false
  }
}
