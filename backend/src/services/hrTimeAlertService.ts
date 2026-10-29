import { prisma } from '../lib/prisma'
import { dispatchRevah } from './revahProviderService'
import { dayKey, getTimeSettings } from './hrTimeService'

// Esqueceu de bater a entrada: depois do horário de entrada + tolerância + 30 min, o gestor recebe um único e-mail com a lista.
const ALERT_KEY = 'HR_TIMECLOCK_ALERTS'
const BRT_MS = 3 * 3600000
const JUSTIFIED = ['atestado', 'férias', 'ferias', 'folga', 'falta abonada', 'abonada', 'home office', 'falta']
const toMin = (t: string) => { const m = /^(\d{1,2}):(\d{2})/.exec(t); return m ? Number(m[1]) * 60 + Number(m[2]) : 480 }

export async function sendMissingPunchAlerts(c: { id: string; tenantId: string; name: string }, opts: { now?: Date } = {}) {
  const now = opts.now || new Date()
  const s = await getTimeSettings(c.id)
  const today = dayKey(now)
  const wd = new Date(`${today}T12:00:00Z`).getUTCDay()
  const expectedToday = wd === 0 ? 0 : wd === 6 ? s.saturdayHours : s.dailyHours
  if (!(expectedToday > 0)) return { skipped: 'dia sem expediente' }
  const brt = new Date(now.getTime() - BRT_MS)
  const nowMin = brt.getUTCHours() * 60 + brt.getUTCMinutes()
  if (nowMin > 20 * 60) return { skipped: 'fora da janela' }

  const dayStart = new Date(`${today}T03:00:00.000Z`)
  const dayEnd = new Date(dayStart.getTime() + 86400000)
  const emps = await prisma.hREmployee.findMany({
    where: { clinicId: c.id, tenantId: c.tenantId, status: { notIn: ['TERMINATED', 'Desligado'] }, admissionDate: { lt: dayEnd }, OR: [{ terminationDate: null }, { terminationDate: { gte: dayStart } }] },
    select: { id: true, name: true, workStart: true },
  })
  if (!emps.length) return { skipped: 'sem colaboradores' }
  const ids = emps.map((e) => e.id)
  const [punches, attendance, requests] = await Promise.all([
    prisma.hRTimePunch.findMany({ where: { employeeId: { in: ids }, punchedAt: { gte: dayStart, lt: dayEnd } }, select: { employeeId: true } }),
    prisma.hRAttendance.findMany({ where: { employeeId: { in: ids }, clinicId: c.id, date: { gte: new Date(dayStart.getTime() - 86400000), lt: dayEnd } }, select: { employeeId: true, date: true, status: true, clockIn: true } }),
    prisma.hRAbsenceRequest.findMany({ where: { employeeId: { in: ids }, absenceDate: today, status: { not: 'RECUSADA' } }, select: { employeeId: true } }),
  ])
  const punched = new Set(punches.map((p) => p.employeeId))
  const handled = new Set<string>()
  for (const a of attendance) if (a.date.toISOString().slice(0, 10) === today && (a.clockIn || JUSTIFIED.includes(String(a.status).toLowerCase()))) handled.add(a.employeeId)
  for (const r of requests) handled.add(r.employeeId)
  // Cada colaborador tem o seu horário de entrada (ou o da clínica): só entra na lista depois da entrada + tolerância + 30 min.
  const due = (e: { workStart: string | null }) => (e.workStart ? toMin(e.workStart) : toMin(s.startTime)) + s.toleranceMinutes + 30
  const missing = emps.filter((e) => nowMin >= due(e) && !punched.has(e.id) && !handled.has(e.id))
  if (!missing.length) return { skipped: 'ninguém faltando' }

  const row = await prisma.tenantFeatureFlag.findUnique({ where: { clinicId_key: { clinicId: c.id, key: ALERT_KEY } } })
  const meta = (row?.metadata || {}) as { day?: string; ids?: string[] }
  const already = new Set(meta.day === today ? meta.ids || [] : [])
  const fresh = missing.filter((e) => !already.has(e.id))
  if (!fresh.length) return { skipped: 'já avisado' }

  const apiKey = String(process.env.RESEND_API_KEY || '').trim()
  let sent = 0
  if (apiKey) {
    const managers = await prisma.user.findMany({
      where: { clinicId: c.id, tenantId: c.tenantId, isActive: true, OR: [{ role: 'ADMIN' }, { accessProfiles: { some: { profile: { code: { in: ['GESTOR', 'RH'] }, isActive: true } } } }] },
      select: { email: true }, take: 10,
    })
    const message = `Sem entrada registrada no ponto hoje (${today.split('-').reverse().join('/')}), depois das ${s.startTime} (tolerância de ${s.toleranceMinutes} min):\n\n${fresh.map((e) => `• ${e.name}`).join('\n')}\n\nConfira se a pessoa esqueceu de bater, está de folga/atestado ou faltou. O RH pode lançar a justificativa em Recursos humanos → Ponto.`
    for (const to of [...new Set(managers.map((m) => m.email).filter(Boolean))]) {
      await dispatchRevah('EMAIL', to, message, { apiKey, subject: `Ponto: ${fresh.length} colaborador(es) sem entrada — ${c.name}` }, 'CompletoDonto <contato@dentalpos.com.br>').then(() => { sent++ }).catch((e: unknown) => console.error('Aviso de ponto falhou:', e))
    }
  }
  const metadata = { day: today, ids: [...already, ...fresh.map((e) => e.id)] }
  await prisma.tenantFeatureFlag.upsert({
    where: { clinicId_key: { clinicId: c.id, key: ALERT_KEY } },
    update: { enabled: true, metadata },
    create: { clinicId: c.id, tenantId: c.tenantId, key: ALERT_KEY, enabled: true, rolloutStage: 'GA', metadata },
  })
  return { sent, missing: fresh.length }
}
