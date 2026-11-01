import { processAbsenceRecalls } from '../services/absenceRecallService'
import type { Request, Response } from 'express'
import crypto from 'crypto'
import { processDueAppointmentReminders } from '../services/appointmentReminderService'
import { processDunning } from '../services/dunningService'
import { processDailyLabRisk, processDueLabNotifications } from '../services/labNotificationService'
import { processFollowUps } from '../services/followUpService'
import { processDueReminders } from '../services/dueRemindersService'
import { processSubscriptionJobs } from '../services/subscriptionService'
import { verifyGithubToken } from '../services/githubOidc'

// Aceita o segredo do cron ou o token OIDC do GitHub Actions (workflow clinic-routines.yml), que não guarda senha nenhuma.
async function authorized(req: Request) {
  const header = req.header('authorization') || ''
  const provided = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!provided) return false
  const expected = process.env.CRON_SECRET || ''
  if (expected && provided.length === expected.length && crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) return true
  return verifyGithubToken(provided, 'clinic-routines.yml', 'dentalpos-routines').catch(() => false)
}

export async function reminders(req: Request, res: Response) {
  if (!(await authorized(req))) return res.status(401).json({ error: 'N\u00e3o autorizado.' })
  const started = Date.now()
  try {
    await processDueAppointmentReminders()
    await processDailyLabRisk().then(() => processDueLabNotifications()).catch((e) => console.error('Avisos do laboratório:', e))
    await processDunning().catch((e) => console.error('Régua de cobrança:', e))
    await processAbsenceRecalls().catch((e) => console.error('Retorno de pacientes ausentes:', e))
    await processDueReminders().catch((e) => console.error('Lembretes de vencimento:', e))
    await processSubscriptionJobs().catch((e) => console.error('Assinaturas:', e))
    await processFollowUps().catch((e) => console.error('Acompanhamento de pacientes:', e))
    return res.json({ ok: true, ms: Date.now() - started })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Falha ao processar lembretes.' })
  }
}