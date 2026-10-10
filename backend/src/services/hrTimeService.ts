import { randomUUID } from 'crypto'
import { prisma } from '../lib/prisma'
import { comparePassword } from './userService'
import { writeAudit } from './auditService'

// Ponto eletrônico: batida com senha, IP e localização; resumo mensal, banco de horas e justificativas de falta.
// Datas e horas são calculadas no horário de Brasília (UTC-3, sem horário de verão).

export type TimeCtx = { clinicId: string; tenantId: string; userId: string; email: string }

const FLAG_KEY = 'HR_TIMECLOCK'
const BRT_MS = 3 * 60 * 60 * 1000
export const KINDS = ['ENTRADA', 'SAIDA_ALMOCO', 'VOLTA_ALMOCO', 'SAIDA'] as const
const KIND_LABEL: Record<string, string> = { ENTRADA: 'Entrada', SAIDA_ALMOCO: 'Saída para o almoço', VOLTA_ALMOCO: 'Volta do almoço', SAIDA: 'Saída' }
const JUSTIFIED_STATUS = ['atestado', 'férias', 'ferias', 'folga', 'falta abonada', 'abonada', 'home office']
const ATTACH_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

export class HrError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}

export type TimeSettings = {
  dailyHours: number
  saturdayHours: number
  startTime: string
  toleranceMinutes: number
  requireLocation: boolean
  blockOutside: boolean
  allowedIps: string[]
  latitude: number | null
  longitude: number | null
  radiusMeters: number
  assiduityBonus: number
}

const DEFAULTS: TimeSettings = {
  dailyHours: 8, saturdayHours: 0, startTime: '08:00', toleranceMinutes: 10, requireLocation: true, blockOutside: false,
  allowedIps: [], latitude: null, longitude: null, radiusMeters: 150, assiduityBonus: 0,
}

const num = (v: unknown, fallback: number, min = 0, max = 1e9) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback }

export async function getTimeSettings(clinicId: string): Promise<TimeSettings> {
  const row = await prisma.tenantFeatureFlag.findUnique({ where: { clinicId_key: { clinicId, key: FLAG_KEY } } })
  const m = (row?.metadata || {}) as Partial<TimeSettings>
  return {
    dailyHours: num(m.dailyHours, DEFAULTS.dailyHours, 0, 24),
    saturdayHours: num(m.saturdayHours, DEFAULTS.saturdayHours, 0, 24),
    startTime: /^\d{2}:\d{2}$/.test(String(m.startTime)) ? String(m.startTime) : DEFAULTS.startTime,
    toleranceMinutes: num(m.toleranceMinutes, DEFAULTS.toleranceMinutes, 0, 120),
    requireLocation: m.requireLocation === undefined ? DEFAULTS.requireLocation : Boolean(m.requireLocation),
    blockOutside: Boolean(m.blockOutside),
    allowedIps: Array.isArray(m.allowedIps) ? m.allowedIps.map((x) => String(x).trim()).filter(Boolean).slice(0, 20) : [],
    latitude: m.latitude === null || m.latitude === undefined ? null : num(m.latitude, 0, -90, 90),
    longitude: m.longitude === null || m.longitude === undefined ? null : num(m.longitude, 0, -180, 180),
    radiusMeters: num(m.radiusMeters, DEFAULTS.radiusMeters, 20, 5000),
    assiduityBonus: num(m.assiduityBonus, 0, 0, 100000),
  }
}

export async function saveTimeSettings(c: { clinicId: string; tenantId: string; actorId?: string }, body: any) {
  const lat = body?.latitude === '' || body?.latitude === null || body?.latitude === undefined ? null : Number(body.latitude)
  const lng = body?.longitude === '' || body?.longitude === null || body?.longitude === undefined ? null : Number(body.longitude)
  const ips = (Array.isArray(body?.allowedIps) ? body.allowedIps : String(body?.allowedIps || '').split(/[\s,;]+/)).map((x: unknown) => String(x).trim()).filter(Boolean)
  const next = await (async () => {
    const cur = await getTimeSettings(c.clinicId)
    return {
      ...cur,
      dailyHours: num(body?.dailyHours, cur.dailyHours, 0, 24),
      saturdayHours: num(body?.saturdayHours, cur.saturdayHours, 0, 24),
      startTime: /^\d{2}:\d{2}$/.test(String(body?.startTime)) ? String(body.startTime) : cur.startTime,
      toleranceMinutes: num(body?.toleranceMinutes, cur.toleranceMinutes, 0, 120),
      requireLocation: body?.requireLocation === undefined ? cur.requireLocation : Boolean(body.requireLocation),
      blockOutside: body?.blockOutside === undefined ? cur.blockOutside : Boolean(body.blockOutside),
      allowedIps: ips.slice(0, 20),
      latitude: lat !== null && Number.isFinite(lat) ? Math.min(90, Math.max(-90, lat)) : null,
      longitude: lng !== null && Number.isFinite(lng) ? Math.min(180, Math.max(-180, lng)) : null,
      radiusMeters: num(body?.radiusMeters, cur.radiusMeters, 20, 5000),
      assiduityBonus: num(body?.assiduityBonus, cur.assiduityBonus, 0, 100000),
    } as TimeSettings
  })()
  await prisma.tenantFeatureFlag.upsert({
    where: { clinicId_key: { clinicId: c.clinicId, key: FLAG_KEY } },
    update: { enabled: true, metadata: next as any },
    create: { clinicId: c.clinicId, tenantId: c.tenantId, key: FLAG_KEY, enabled: true, rolloutStage: 'GA', metadata: next as any },
  })
  await writeAudit({ clinicId: c.clinicId, tenantId: c.tenantId, actorId: c.actorId, module: 'hr', action: 'TIMECLOCK_SETTINGS', summary: 'Regras do ponto eletrônico atualizadas.' }).catch(() => undefined)
  return next
}

// ---------- datas (Brasília) ----------
export const dayKey = (d: Date) => new Date(d.getTime() - BRT_MS).toISOString().slice(0, 10)
const dayStartUtc = (key: string) => new Date(`${key}T03:00:00.000Z`)
const minutesOfDay = (d: Date) => { const b = new Date(d.getTime() - BRT_MS); return b.getUTCHours() * 60 + b.getUTCMinutes() }
const hhmm = (d: Date) => { const b = new Date(d.getTime() - BRT_MS); return `${String(b.getUTCHours()).padStart(2, '0')}:${String(b.getUTCMinutes()).padStart(2, '0')}` }
const toMin = (t?: string | null) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(t || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null }
const weekday = (key: string) => new Date(`${key}T12:00:00Z`).getUTCDay()

function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000, rad = (x: number) => (x * Math.PI) / 180
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

// ---------- vínculo usuário -> colaborador (pelo e-mail de login) ----------
export async function employeeForUser(c: TimeCtx) {
  const rows = await prisma.hREmployee.findMany({ where: { clinicId: c.clinicId, tenantId: c.tenantId, email: { equals: c.email, mode: 'insensitive' } } })
  return rows.find((e) => !['TERMINATED', 'Desligado'].includes(e.status)) || null
}

async function mustEmployee(c: TimeCtx) {
  const emp = await employeeForUser(c)
  if (!emp) throw new HrError(404, 'Seu e-mail de login ainda não está cadastrado no RH. Peça ao RH para cadastrar o colaborador com o mesmo e-mail que você usa para entrar.')
  return emp
}

// ---------- batida ----------
const failures = new Map<string, { count: number; until: number }>()

export async function punch(c: TimeCtx, meta: { ip: string; userAgent: string }, body: any) {
  const emp = await mustEmployee(c)
  const lock = failures.get(c.userId)
  if (lock && lock.until > Date.now()) throw new HrError(429, 'Muitas tentativas de senha. Aguarde alguns minutos.')
  const user = await prisma.user.findUnique({ where: { id: c.userId }, select: { password: true } })
  if (!user || !(await comparePassword(String(body?.password || ''), user.password))) {
    const f = failures.get(c.userId) || { count: 0, until: 0 }
    f.count += 1
    if (f.count >= 5) { f.until = Date.now() + 10 * 60 * 1000; f.count = 0 }
    failures.set(c.userId, f)
    throw new HrError(401, 'Senha incorreta.')
  }
  failures.delete(c.userId)

  const s = await getTimeSettings(c.clinicId)
  const lat = body?.latitude === undefined || body?.latitude === null ? null : Number(body.latitude)
  const lng = body?.longitude === undefined || body?.longitude === null ? null : Number(body.longitude)
  const hasGeo = lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng)
  if (s.requireLocation && !hasGeo) throw new HrError(400, 'Ative a localização do aparelho para registrar o ponto.')

  const ipOk = s.allowedIps.length ? s.allowedIps.includes(meta.ip) : null
  let geoOk: boolean | null = null
  let distance: number | null = null
  if (s.latitude !== null && s.longitude !== null && hasGeo) {
    distance = haversine(s.latitude, s.longitude, lat as number, lng as number)
    geoOk = distance <= s.radiusMeters
  }
  const checks = [ipOk, geoOk].filter((x) => x !== null) as boolean[]
  const inside: boolean | null = checks.length ? checks.some(Boolean) : null
  const note = [
    ipOk === null ? null : `IP ${ipOk ? 'autorizado' : 'fora da lista'}`,
    geoOk === null ? (s.latitude === null ? null : 'sem localização') : `${Math.round(distance as number)} m do local (${geoOk ? 'dentro' : 'fora'} do raio)`,
  ].filter(Boolean).join(' · ') || null
  if (s.blockOutside && inside === false) throw new HrError(403, 'O ponto só pode ser registrado no ambiente de trabalho.')

  const now = new Date()
  const today = dayKey(now)
  const todays = await prisma.hRTimePunch.findMany({ where: { employeeId: emp.id, punchedAt: { gte: dayStartUtc(today), lt: new Date(dayStartUtc(today).getTime() + 86400000) } }, orderBy: { punchedAt: 'asc' } })
  if (todays.length >= KINDS.length) throw new HrError(409, 'As 4 batidas de hoje já foram registradas. Para corrigir, peça ajuste ao RH.')
  const last = todays[todays.length - 1]
  if (last && now.getTime() - last.punchedAt.getTime() < 60000) throw new HrError(409, 'Ponto registrado há instantes. Aguarde 1 minuto.')
  const kind = KINDS[todays.length]
  const row = await prisma.hRTimePunch.create({
    data: { id: randomUUID(), clinicId: c.clinicId, tenantId: c.tenantId, employeeId: emp.id, userId: c.userId, kind, punchedAt: now, ip: meta.ip || null, latitude: hasGeo ? lat : null, longitude: hasGeo ? lng : null, accuracyMeters: body?.accuracy !== undefined && Number.isFinite(Number(body.accuracy)) ? Number(body.accuracy) : null, insideWorkplace: inside, workplaceNote: note, method: 'PASSWORD', userAgent: meta.userAgent.slice(0, 200) },
  })
  await writeAudit({ clinicId: c.clinicId, tenantId: c.tenantId, actorId: c.userId, module: 'hr', action: 'TIME_PUNCH', entityType: 'HRTimePunch', entityId: row.id, summary: `${emp.name}: ${KIND_LABEL[kind]} às ${hhmm(now)}${inside === false ? ' (fora do local)' : ''}.` }).catch(() => undefined)
  return { id: row.id, kind, label: KIND_LABEL[kind], time: hhmm(now), insideWorkplace: inside, note }
}

export async function myToday(c: TimeCtx) {
  const emp = await employeeForUser(c)
  if (!emp) return { linked: false as const }
  const today = dayKey(new Date())
  const start = dayStartUtc(today)
  const rows = await prisma.hRTimePunch.findMany({ where: { employeeId: emp.id, punchedAt: { gte: start, lt: new Date(start.getTime() + 86400000) } }, orderBy: { punchedAt: 'asc' } })
  return {
    linked: true as const,
    employee: { id: emp.id, name: emp.name, position: emp.position },
    today,
    punches: rows.map((r) => ({ id: r.id, kind: r.kind, label: KIND_LABEL[r.kind] || r.kind, time: hhmm(r.punchedAt), insideWorkplace: r.insideWorkplace })),
    nextKind: rows.length < KINDS.length ? KINDS[rows.length] : null,
    nextLabel: rows.length < KINDS.length ? KIND_LABEL[KINDS[rows.length]] : null,
  }
}

// ---------- resumo do mês ----------
type DayRow = { date: string; status: string; punches: Array<{ kind: string; time: string; inside: boolean | null }>; workedMin: number; expectedMin: number; diffMin: number; lateMin: number; note?: string }

function monthRange(ref: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(ref)
  if (!m) throw new HrError(400, 'Mês inválido. Use AAAA-MM.')
  const y = Number(m[1]), mo = Number(m[2])
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate()
  return { y, mo, last }
}

export function currentRef() { return dayKey(new Date()).slice(0, 7) }

async function buildMonth(emp: { id: string; admissionDate: Date; terminationDate: Date | null }, ref: string, s: TimeSettings, clinicId: string) {
  const { last } = monthRange(ref)
  const first = `${ref}-01`
  const from = dayStartUtc(first)
  const to = new Date(dayStartUtc(`${ref}-${String(last).padStart(2, '0')}`).getTime() + 86400000)
  const [punches, attendance, requests] = await Promise.all([
    prisma.hRTimePunch.findMany({ where: { employeeId: emp.id, punchedAt: { gte: from, lt: to } }, orderBy: { punchedAt: 'asc' } }),
    prisma.hRAttendance.findMany({ where: { employeeId: emp.id, clinicId, date: { gte: new Date(from.getTime() - 86400000), lt: to } } }),
    prisma.hRAbsenceRequest.findMany({ where: { employeeId: emp.id, absenceDate: { startsWith: ref }, status: 'ABONADA' } }),
  ])
  const byDay = new Map<string, typeof punches>()
  for (const p of punches) { const k = dayKey(p.punchedAt); byDay.set(k, [...(byDay.get(k) || []), p]) }
  const attByDay = new Map<string, (typeof attendance)[number]>()
  for (const a of attendance) { const k = a.date.toISOString().slice(0, 10); if (k.startsWith(ref)) attByDay.set(k, a) }
  const abonados = new Set(requests.map((r) => r.absenceDate))

  const now = new Date()
  const today = dayKey(now)
  const nowMin = minutesOfDay(now)
  const startMin = toMin(s.startTime) ?? 480
  const admission = dayKey(emp.admissionDate)
  const termination = emp.terminationDate ? dayKey(emp.terminationDate) : null
  const days: DayRow[] = []
  const t = { workedMin: 0, expectedMin: 0, balanceMin: 0, overtimeMin: 0, faltas: 0, atrasos: 0, lateMin: 0, incompletos: 0, abonadas: 0 }

  for (let d = 1; d <= last; d++) {
    const key = `${ref}-${String(d).padStart(2, '0')}`
    if (key > today) break
    const wd = weekday(key)
    let expected = wd === 0 ? 0 : wd === 6 ? Math.round(s.saturdayHours * 60) : Math.round(s.dailyHours * 60)
    if (key < admission || (termination && key > termination)) expected = 0
    const ps = byDay.get(key) || []
    const att = attByDay.get(key)
    const attStatus = String(att?.status || '').toLowerCase()
    const justified = abonados.has(key) || JUSTIFIED_STATUS.includes(attStatus)
    const row: DayRow = { date: key, status: 'OK', punches: ps.map((p) => ({ kind: p.kind, time: hhmm(p.punchedAt), inside: p.insideWorkplace })), workedMin: 0, expectedMin: expected, diffMin: 0, lateMin: 0 }

    if (ps.length) {
      const m = ps.map((p) => minutesOfDay(p.punchedAt))
      let worked = 0
      if (ps.length >= 4) worked = (m[1] - m[0]) + (m[3] - m[2])
      else if (ps.length === 2) worked = m[1] - m[0]
      else if (ps.length === 3) worked = m[1] - m[0]
      row.workedMin = Math.max(0, worked)
      if (ps.length % 2 === 1 && !(key === today)) { row.status = 'INCOMPLETO'; t.incompletos++ }
      const firstEntry = ps.find((p) => p.kind === 'ENTRADA')
      if (firstEntry && expected > 0 && !justified) {
        const late = minutesOfDay(firstEntry.punchedAt) - startMin
        if (late > s.toleranceMinutes) { row.lateMin = late; if (row.status === 'OK') row.status = 'ATRASO'; t.atrasos++; t.lateMin += late }
      }
    } else if (att && toMin(att.clockIn) !== null && toMin(att.clockOut) !== null && !JUSTIFIED_STATUS.includes(attStatus) && attStatus !== 'falta') {
      row.workedMin = Math.max(0, (toMin(att.clockOut) as number) - (toMin(att.clockIn) as number))
      row.note = 'Lançamento manual do RH'
    } else if (expected > 0) {
      if (justified) { row.status = 'ABONADA'; row.workedMin = expected; t.abonadas++ }
      else if (key < today || (key === today && nowMin > startMin + 12 * 60)) { row.status = 'FALTA'; t.faltas++ }
      else row.status = 'AGUARDANDO'
    } else if (justified) row.status = 'ABONADA'
    else row.status = wd === 0 || wd === 6 ? 'FOLGA' : 'OK'

    if (row.status !== 'FALTA' && row.status !== 'AGUARDANDO') {
      row.diffMin = row.workedMin - expected
      t.workedMin += row.workedMin
      t.expectedMin += expected
      t.balanceMin += row.diffMin
      if (row.diffMin > 0) t.overtimeMin += row.diffMin
    } else if (row.status === 'FALTA') t.expectedMin += 0
    days.push(row)
  }
  return { days, totals: t }
}

export async function myMonth(c: TimeCtx, ref: string) {
  const emp = await mustEmployee(c)
  const s = await getTimeSettings(c.clinicId)
  return { ref, ...(await buildMonth(emp, ref, s, c.clinicId)) }
}

export async function timesheet(c: { clinicId: string; tenantId: string }, ref: string) {
  const s = await getTimeSettings(c.clinicId)
  const emps = await prisma.hREmployee.findMany({ where: { clinicId: c.clinicId, tenantId: c.tenantId, status: { notIn: ['TERMINATED', 'Desligado'] } }, orderBy: { name: 'asc' } })
  const rows: Array<{ employeeId: string; name: string; position: string; department: string; email: string | null; linkedLogin: boolean; totals: Awaited<ReturnType<typeof buildMonth>>['totals'] }> = []
  for (const e of emps) {
    const m = await buildMonth(e, ref, s, c.clinicId)
    rows.push({ employeeId: e.id, name: e.name, position: e.position, department: e.department, email: e.email, linkedLogin: Boolean(e.email), totals: m.totals })
  }
  return { ref, settings: s, employees: rows }
}

export async function employeeMonth(c: { clinicId: string; tenantId: string }, employeeId: string, ref: string) {
  const emp = await prisma.hREmployee.findFirst({ where: { id: employeeId, clinicId: c.clinicId, tenantId: c.tenantId } })
  if (!emp) throw new HrError(404, 'Colaborador não encontrado.')
  const s = await getTimeSettings(c.clinicId)
  const m = await buildMonth(emp, ref, s, c.clinicId)
  const punches = await prisma.hRTimePunch.findMany({
    where: { employeeId, punchedAt: { gte: dayStartUtc(`${ref}-01`), lt: new Date(dayStartUtc(`${ref}-${String(monthRange(ref).last).padStart(2, '0')}`).getTime() + 86400000) } },
    orderBy: { punchedAt: 'asc' },
  })
  return { ref, employee: { id: emp.id, name: emp.name, position: emp.position }, ...m, audit: punches.map((p) => ({ date: dayKey(p.punchedAt), time: hhmm(p.punchedAt), kind: KIND_LABEL[p.kind] || p.kind, ip: p.ip, inside: p.insideWorkplace, note: p.workplaceNote, latitude: p.latitude, longitude: p.longitude })) }
}

// Sugestões para a folha. O RH confere e lança; nada é lançado sozinho.
export async function payrollSuggestions(c: { clinicId: string; tenantId: string }, ref: string) {
  const s = await getTimeSettings(c.clinicId)
  const emps = await prisma.hREmployee.findMany({ where: { clinicId: c.clinicId, tenantId: c.tenantId, status: { notIn: ['TERMINATED', 'Desligado'] } }, orderBy: { name: 'asc' } })
  const out: Array<{ key: string; employeeId: string; employeeName: string; type: 'Provento' | 'Desconto'; description: string; value: number }> = []
  const r2 = (v: number) => Math.round(v * 100) / 100
  for (const e of emps) {
    const base = Number(e.baseSalary)
    if (!(base > 0)) continue
    const hourly = base / Math.max(1, e.monthlyWorkload || 220)
    const { totals } = await buildMonth(e, ref, s, c.clinicId)
    if (totals.faltas > 0) out.push({ key: `${e.id}:falta`, employeeId: e.id, employeeName: e.name, type: 'Desconto', description: `Faltas não justificadas (${totals.faltas} dia(s)) — ${ref}`, value: r2((base / 30) * totals.faltas) })
    if (totals.lateMin > 0) out.push({ key: `${e.id}:atraso`, employeeId: e.id, employeeName: e.name, type: 'Desconto', description: `Atrasos (${Math.round(totals.lateMin)} min) — ${ref}`, value: r2(hourly * (totals.lateMin / 60)) })
    if (totals.overtimeMin > 0) out.push({ key: `${e.id}:extra`, employeeId: e.id, employeeName: e.name, type: 'Provento', description: `Horas extras 50% (${(totals.overtimeMin / 60).toFixed(1)} h) — ${ref}`, value: r2(hourly * 1.5 * (totals.overtimeMin / 60)) })
    if (totals.faltas === 0 && totals.lateMin === 0 && s.assiduityBonus > 0) out.push({ key: `${e.id}:assiduidade`, employeeId: e.id, employeeName: e.name, type: 'Provento', description: `Prêmio de assiduidade — ${ref}`, value: r2(s.assiduityBonus) })
  }
  return out
}

// ---------- justificativas ----------
type Attachment = { name: string; mime: string; dataUrl: string }

function cleanAttachments(input: unknown): Attachment[] {
  if (!Array.isArray(input)) return []
  const list = input.slice(0, 3).map((a: any) => ({ name: String(a?.name || 'arquivo').slice(0, 120), mime: String(a?.mime || ''), dataUrl: String(a?.dataUrl || '') }))
  let total = 0
  for (const a of list) {
    if (!ATTACH_MIME.includes(a.mime)) throw new HrError(400, 'Anexe apenas foto (JPG, PNG, WEBP) ou PDF.')
    if (!a.dataUrl.startsWith(`data:${a.mime};base64,`)) throw new HrError(400, 'Anexo inválido.')
    total += a.dataUrl.length
  }
  if (total > 1_500_000) throw new HrError(400, 'Os anexos estão grandes demais. Envie fotos menores ou um PDF mais leve (até 1 MB no total).')
  return list
}

export async function createAbsenceRequest(c: TimeCtx, body: any) {
  const emp = await mustEmployee(c)
  const date = String(body?.date || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HrError(400, 'Informe a data da falta.')
  if (date > dayKey(new Date())) { /* aviso antecipado de falta é permitido */ }
  const type = ['FALTA', 'ATRASO', 'ATESTADO', 'OUTRO'].includes(String(body?.type)) ? String(body.type) : 'FALTA'
  const reason = String(body?.reason || '').trim()
  if (reason.length < 5) throw new HrError(400, 'Explique o motivo em poucas palavras.')
  const attachments = cleanAttachments(body?.attachments)
  const row = await prisma.hRAbsenceRequest.create({ data: { id: randomUUID(), clinicId: c.clinicId, tenantId: c.tenantId, employeeId: emp.id, userId: c.userId, absenceDate: date, type, reason: reason.slice(0, 2000), attachments: attachments as any, status: 'PENDENTE' } })
  await writeAudit({ clinicId: c.clinicId, tenantId: c.tenantId, actorId: c.userId, module: 'hr', action: 'ABSENCE_REQUEST', entityType: 'HRAbsenceRequest', entityId: row.id, summary: `${emp.name} enviou justificativa (${type}) para ${date}.` }).catch(() => undefined)
  return { id: row.id }
}

const publicRequest = (r: any, withFiles: boolean) => ({
  id: r.id, employeeId: r.employeeId, employeeName: r.employee?.name, absenceDate: r.absenceDate, type: r.type, reason: r.reason, status: r.status,
  decisionNote: r.decisionNote, decidedAt: r.decidedAt, createdAt: r.createdAt,
  attachmentCount: Array.isArray(r.attachments) ? r.attachments.length : 0,
  ...(withFiles ? { attachments: Array.isArray(r.attachments) ? r.attachments : [] } : {}),
})

export async function myRequests(c: TimeCtx) {
  const emp = await employeeForUser(c)
  if (!emp) return []
  const rows = await prisma.hRAbsenceRequest.findMany({ where: { employeeId: emp.id }, orderBy: { createdAt: 'desc' }, take: 50, include: { employee: { select: { name: true } } } })
  return rows.map((r) => publicRequest(r, false))
}

export async function myRequest(c: TimeCtx, id: string) {
  const emp = await mustEmployee(c)
  const r = await prisma.hRAbsenceRequest.findFirst({ where: { id, employeeId: emp.id }, include: { employee: { select: { name: true } } } })
  if (!r) throw new HrError(404, 'Justificativa não encontrada.')
  return publicRequest(r, true)
}

export async function listRequests(c: { clinicId: string; tenantId: string }, status?: string) {
  const rows = await prisma.hRAbsenceRequest.findMany({
    where: { clinicId: c.clinicId, tenantId: c.tenantId, ...(status ? { status } : {}) },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], take: 200, include: { employee: { select: { name: true } } },
  })
  return rows.map((r) => publicRequest(r, false))
}

export async function getRequest(c: { clinicId: string; tenantId: string }, id: string) {
  const r = await prisma.hRAbsenceRequest.findFirst({ where: { id, clinicId: c.clinicId, tenantId: c.tenantId }, include: { employee: { select: { name: true } } } })
  if (!r) throw new HrError(404, 'Justificativa não encontrada.')
  return publicRequest(r, true)
}

export async function decideRequest(c: { clinicId: string; tenantId: string; actorId: string }, id: string, body: any) {
  const r = await prisma.hRAbsenceRequest.findFirst({ where: { id, clinicId: c.clinicId, tenantId: c.tenantId } })
  if (!r) throw new HrError(404, 'Justificativa não encontrada.')
  const decision = String(body?.decision || '')
  if (!['ABONAR', 'NAO_ABONAR', 'SANCIONAR'].includes(decision)) throw new HrError(400, 'Escolha: abonar, não abonar ou aplicar sanção.')
  const note = String(body?.note || '').trim().slice(0, 1000)
  if (decision !== 'ABONAR' && note.length < 3) throw new HrError(400, 'Registre o motivo da decisão.')
  const status = decision === 'ABONAR' ? 'ABONADA' : decision === 'SANCIONAR' ? 'SANCIONADA' : 'NAO_ABONADA'
  await prisma.hRAbsenceRequest.update({ where: { id }, data: { status, decisionNote: note || null, decidedBy: c.actorId, decidedAt: new Date(), updatedAt: new Date() } })
  const date = new Date(`${r.absenceDate}T12:00:00.000Z`)
  if (decision === 'ABONAR') {
    await prisma.hRAttendance.create({ data: { id: randomUUID(), clinicId: c.clinicId, tenantId: c.tenantId, employeeId: r.employeeId, date, status: r.type === 'ATESTADO' ? 'Atestado' : 'Falta abonada', observation: note || 'Justificativa aceita pelo RH.' } })
  }
  if (decision === 'SANCIONAR') {
    const type = ['Advertência verbal', 'Advertência escrita', 'Suspensão', 'Orientação'].includes(String(body?.sanctionType)) ? String(body.sanctionType) : 'Advertência verbal'
    const days = type === 'Suspensão' ? Math.max(1, Math.min(30, Number(body?.daysSuspended) || 1)) : null
    await prisma.hRDisciplinaryAction.create({ data: { id: randomUUID(), clinicId: c.clinicId, tenantId: c.tenantId, employeeId: r.employeeId, type, date: new Date(), reason: `Falta de ${r.absenceDate}: ${note}`, daysSuspended: days, status: 'APPLIED' } })
  }
  await writeAudit({ clinicId: c.clinicId, tenantId: c.tenantId, actorId: c.actorId, module: 'hr', action: `ABSENCE_${decision}`, entityType: 'HRAbsenceRequest', entityId: id, summary: `Justificativa de ${r.absenceDate}: ${status}.` }).catch(() => undefined)
  return { ok: true, status }
}
