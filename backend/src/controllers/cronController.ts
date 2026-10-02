import type { Request, Response } from 'express'
import crypto from 'crypto'
import { processDueAppointmentReminders } from '../services/appointmentReminderService'
import { processDunning } from '../services/dunningService'
import { processDailyLabRisk, processDueLabNotifications } from '../services/labNotificationService'

function authorized(req: Request) {
  const expected = process.env.CRON_SECRET || ''
  const header = req.header('authorization') || ''
  const provided = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!expected || provided.length !== expected.length) return false
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
}

export async function reminders(req: Request, res: Response) {
  if (!authorized(req)) return res.status(401).json({ error: 'N\u00e3o autorizado.' })
  const started = Date.now()
  try {
    await processDueAppointmentReminders()
    await processDailyLabRisk().then(() => processDueLabNotifications()).catch((e) => console.error('Avisos do laboratório:', e))
    await processDunning().catch((e) => console.error('Régua de cobrança:', e))
    return res.json({ ok: true, ms: Date.now() - started })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Falha ao processar lembretes.' })
  }
}