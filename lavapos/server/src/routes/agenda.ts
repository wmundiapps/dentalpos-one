import { Router } from 'express';
import { z } from 'zod';
import { pool, withTx } from '../db.js';
import { tenantOf, type AuthedRequest } from '../auth.js';
import { HttpError } from '../security.js';
import { getRec, patchRec } from '../repo.js';
import { loadSettings, getTenant } from '../tenant.js';
import { appointmentsBetween, createAppointment, durationOf, slotsFor } from '../agenda.js';
import { notifyCustomer, render } from '../notify.js';
import { isoDate, isoDateTime, text, uuid } from '../validators.js';
import { addDays } from '../time.js';

export const agendaRouter = Router();

agendaRouter.get('/slots', async (req: AuthedRequest, res) => {
  const q = z.object({ date: isoDate, serviceIds: z.string().min(36) }).parse(req.query);
  const tenantId = tenantOf(req);
  const ids = q.serviceIds.split(',').map((s) => uuid.parse(s));
  const s = await loadSettings(pool, tenantId);
  const dur = await durationOf(pool, tenantId, ids, s.slotMinutes);
  res.json({ durationMin: dur, slots: await slotsFor(pool, tenantId, s, q.date, dur) });
});

agendaRouter.get('/', async (req: AuthedRequest, res) => {
  const q = z.object({ from: isoDate, to: isoDate.optional() }).parse(req.query);
  const rowsOut = await appointmentsBetween(pool, tenantOf(req), q.from, addDays(q.to ?? q.from, 1));
  res.json(rowsOut.map((r) => ({ id: r.id, ...r.data })));
});

export function apptVars(a: any, c: any, v: any, lavacar: string) {
  return { nome: String(c.name).split(' ')[0]!, veiculo: `${v.brand} ${v.model}`, placa: v.plate, lavacar, data: a.start.slice(8, 10) + '/' + a.start.slice(5, 7), hora: a.start.slice(11, 16), link: '' };
}

agendaRouter.post('/', async (req: AuthedRequest, res) => {
  const tenantId = tenantOf(req);
  const b = z.object({ customerId: uuid, vehicleId: uuid, serviceIds: z.array(uuid).min(1).max(15), start: isoDateTime, notes: text(300).default(''), subscriptionId: uuid.optional() }).parse(req.body);
  const c = await getRec(pool, tenantId, 'customer', b.customerId);
  const v = await getRec(pool, tenantId, 'vehicle', b.vehicleId);
  if (!c || !v || v.data.customerId !== c.id) throw new HttpError(400, 'Cliente ou veículo inválido.', 'invalido');
  const s = await loadSettings(pool, tenantId);
  const a = await withTx((tx) => createAppointment(tx, tenantId, s, { ...b, source: b.subscriptionId ? 'assinatura' : 'painel' }));
  const t = await getTenant(pool, tenantId);
  await notifyCustomer(pool, tenantId, s.reminders.bookingConfirmation, c.data as any, 'agenda', `Agendamento confirmado — ${t.name}`, render(s.templates.confirmacao, apptVars(a.data, c.data, v.data, t.name)), { dedupe: `conf:${a.id}` });
  res.status(201).json({ id: a.id, ...a.data });
});

agendaRouter.post('/:id/status', async (req: AuthedRequest, res) => {
  const tenantId = tenantOf(req);
  const { status } = z.object({ status: z.enum(['confirmado', 'cancelado', 'faltou']) }).parse(req.body);
  const a = await getRec(pool, tenantId, 'appointment', req.params.id as string);
  if (!a) throw new HttpError(404, 'Agendamento não encontrado.', 'nao_encontrado');
  if (!['agendado', 'confirmado'].includes(a.data.status)) throw new HttpError(409, 'Esse agendamento já foi encerrado.', 'estado_invalido');
  const u = await patchRec(pool, tenantId, 'appointment', a.id, { status });
  res.json({ id: u!.id, ...u!.data });
});
