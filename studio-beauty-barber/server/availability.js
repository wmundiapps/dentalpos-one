// Cálculo de horários livres: expediente do salão/profissional x agendamentos existentes.
import { db } from './db.js';
import { json, zonedToUtc, localWeekday, addDays, localDate } from './util.js';

export const DEFAULT_HOURS = {
  0: null,
  1: ['09:00', '19:00'], 2: ['09:00', '19:00'], 3: ['09:00', '19:00'],
  4: ['09:00', '19:00'], 5: ['09:00', '19:00'], 6: ['09:00', '17:00'],
};

export const SLOT_STEP_MIN = 30;
export const MIN_LEAD_MIN = 30; // antecedência mínima para reservar

const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const pad = (n) => String(n).padStart(2, '0');
const fromMin = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

export function hoursFor(salon, staffRow) {
  const salonH = json(salon.hours_json, DEFAULT_HOURS);
  const staffH = staffRow ? json(staffRow.hours_json, null) : null;
  return { salonH, staffH };
}

export function hoursText(salon) {
  const h = json(salon.hours_json, DEFAULT_HOURS);
  const names = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const parts = [];
  for (let d = 1; d <= 7; d++) {
    const i = d % 7;
    parts.push(h[i] ? `${names[i]} ${h[i][0]}–${h[i][1]}` : `${names[i]} fechado`);
  }
  return parts.join(', ');
}

// Retorna [{ time:'09:00', startsAt, endsAt, staffId, staffName }] para a data local (AAAA-MM-DD).
export async function getSlots(salon, { serviceId, staffId = null, date, now = new Date() }) {
  const service = await db.get('SELECT * FROM services WHERE id = ? AND salon_id = ? AND active = 1', [serviceId, salon.id]);
  if (!service) return [];
  const tz = salon.timezone;

  let staffList = await db.all(
    `SELECT st.* FROM staff st JOIN staff_services ss ON ss.staff_id = st.id
      WHERE st.salon_id = ? AND st.active = 1 AND ss.service_id = ? ${staffId ? 'AND st.id = ?' : ''} ORDER BY st.name`,
    staffId ? [salon.id, serviceId, staffId] : [salon.id, serviceId]);
  if (!staffList.length) return [];

  const dayStartUtc = zonedToUtc(date, '00:00', tz);
  const dayEndUtc = zonedToUtc(addDays(date, 1), '00:00', tz);
  const booked = await db.all(
    `SELECT staff_id, starts_at, ends_at FROM appointments
      WHERE salon_id = ? AND starts_at < ? AND ends_at > ? AND status NOT IN ('cancelled','noshow')`,
    [salon.id, dayEndUtc, dayStartUtc]);

  const wd = localWeekday(date);
  const minStart = new Date(now.getTime() + MIN_LEAD_MIN * 60000).toISOString();
  const slots = [];
  for (const st of staffList) {
    const { salonH, staffH } = hoursFor(salon, st);
    const win = (staffH ?? salonH)[wd];
    if (!win) continue;
    const [open, close] = [toMin(win[0]), toMin(win[1])];
    const mine = booked.filter((b) => b.staff_id === st.id);
    for (let t = open; t + service.duration_min <= close; t += SLOT_STEP_MIN) {
      const startsAt = zonedToUtc(date, fromMin(t), tz);
      const endsAt = new Date(new Date(startsAt).getTime() + service.duration_min * 60000).toISOString();
      if (startsAt < minStart) continue;
      if (mine.some((b) => b.starts_at < endsAt && b.ends_at > startsAt)) continue;
      slots.push({ time: fromMin(t), startsAt, endsAt, staffId: st.id, staffName: st.name });
    }
  }
  slots.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : a.staffName.localeCompare(b.staffName)));
  if (!staffId) {
    // um horário por vez (primeiro profissional livre), a escolha do profissional fica nos "options"
    const byTime = new Map();
    for (const s of slots) {
      if (!byTime.has(s.time)) byTime.set(s.time, { ...s, options: [] });
      byTime.get(s.time).options.push({ staffId: s.staffId, staffName: s.staffName });
    }
    return [...byTime.values()];
  }
  return slots;
}

// Próximos dias com pelo menos um horário livre.
export async function nextAvailableDays(salon, { serviceId, staffId = null, fromDate = null, count = 5, scanDays = 21, now = new Date() }) {
  const start = fromDate || localDate(now, salon.timezone);
  const days = [];
  for (let i = 0; i < scanDays && days.length < count; i++) {
    const d = addDays(start, i);
    const s = await getSlots(salon, { serviceId, staffId, date: d, now });
    if (s.length) days.push({ date: d, slots: s.length });
  }
  return days;
}
