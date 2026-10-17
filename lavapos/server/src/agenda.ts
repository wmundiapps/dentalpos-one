// Agenda inteligente: cruza dias/horários de funcionamento, duração dos serviços e o número de boxes livres.
import { lockKey, rows, type Db } from './db.js';
import { insertRec, listRecs, getRec } from './repo.js';
import { HttpError } from './security.js';
import type { Settings } from './settings.js';
import { addMinutesIso, dowOf, fromMin, nowLocal, toMin } from './time.js';

const BUSY = ['agendado', 'confirmado', 'em_atendimento'];

export interface Slot { time: string; start: string; free: number }

/** Soma a duração dos serviços escolhidos (mínimo = um intervalo da agenda). */
export async function durationOf(db: Db, tenantId: string, serviceIds: string[], fallback = 30): Promise<number> {
  let total = 0;
  for (const id of serviceIds) {
    const s = await getRec(db, tenantId, 'service', id);
    if (!s || s.data.archived) throw new HttpError(400, 'Serviço inválido.', 'invalido');
    total += s.data.durationMin ?? 30;
  }
  return Math.max(total, fallback);
}

async function busyOn(db: Db, tenantId: string, date: string) {
  const apps = await listRecs(db, tenantId, 'appointment', { where: `data->>'start' LIKE $3`, params: [date + '%'], limit: 2000 });
  return apps.filter((a) => BUSY.includes(a.data.status)).map((a) => ({ from: toMin(a.data.start.slice(11, 16)), to: toMin(a.data.start.slice(11, 16)) + (a.data.durationMin ?? 30) }));
}

function overlapCount(busy: { from: number; to: number }[], from: number, to: number) {
  return busy.filter((b) => b.from < to && b.to > from).length;
}

export async function slotsFor(db: Db, tenantId: string, s: Settings, date: string, durationMin: number, opts: { publicView?: boolean } = {}): Promise<Slot[]> {
  const day = s.hours[dowOf(date)];
  if (!day || day.closed) return [];
  const open = toMin(day.open), close = toMin(day.close);
  const busy = await busyOn(db, tenantId, date);
  const now = nowLocal();
  const minStart = opts.publicView ? toMin(now.time) + s.publicBooking.minNoticeHours * 60 : toMin(now.time);
  const out: Slot[] = [];
  for (let t = open; t + durationMin <= close; t += s.slotMinutes) {
    if (date < now.date || (date === now.date && t < minStart)) continue;
    const free = s.bays - overlapCount(busy, t, t + durationMin);
    if (free > 0) out.push({ time: fromMin(t), start: `${date}T${fromMin(t)}`, free });
  }
  return out;
}

export interface NewAppointment {
  customerId: string; vehicleId: string; serviceIds: string[]; start: string;
  source: 'painel' | 'online' | 'assinatura'; notes?: string; subscriptionId?: string; status?: 'agendado' | 'confirmado';
}

/** Cria o agendamento dentro de uma transação com trava por lava-rápido: dois pedidos simultâneos não estouram os boxes. */
export async function createAppointment(tx: Db, tenantId: string, s: Settings, a: NewAppointment) {
  await lockKey(tx, `agenda:${tenantId}`);
  const date = a.start.slice(0, 10);
  const durationMin = await durationOf(tx, tenantId, a.serviceIds, s.slotMinutes);
  const day = s.hours[dowOf(date)];
  const startMin = toMin(a.start.slice(11, 16));
  if (!day || day.closed || startMin < toMin(day.open) || startMin + durationMin > toMin(day.close)) throw new HttpError(409, 'Esse horário está fora do funcionamento do lava-rápido.', 'fora_do_horario');
  const now = nowLocal();
  if (a.start < now.iso && a.source !== 'painel') throw new HttpError(409, 'Esse horário já passou.', 'passado');
  const busy = await busyOn(tx, tenantId, date);
  if (overlapCount(busy, startMin, startMin + durationMin) >= s.bays) throw new HttpError(409, 'Esse horário acabou de ser ocupado. Escolha outro.', 'sem_vaga');
  return insertRec(tx, tenantId, 'appointment', {
    customerId: a.customerId, vehicleId: a.vehicleId, serviceIds: a.serviceIds, start: a.start, endsAt: addMinutesIso(a.start, durationMin),
    durationMin, status: a.status ?? 'agendado', source: a.source, notes: a.notes ?? '', subscriptionId: a.subscriptionId ?? null, reminderSent: false,
  });
}

export async function appointmentsBetween(db: Db, tenantId: string, from: string, to: string) {
  return rows(db, `SELECT * FROM records WHERE tenant_id = $1 AND kind = 'appointment' AND data->>'start' >= $2 AND data->>'start' < $3 ORDER BY data->>'start'`, [tenantId, from, to]);
}
