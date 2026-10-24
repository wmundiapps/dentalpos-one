// Clube de assinatura com horário recorrente: semanal, 15/15, 30/30, 45/45 ou 60/60 dias.
// Mantém sempre as próximas visitas reservadas no mesmo profissional e perto do mesmo horário.
import { db } from './db.js';
import { HttpError, uid, nowIso, addDays, localDate } from './util.js';
import { getSlots } from './availability.js';
import { createAppointment } from './domain.js';
import { createApptCharge, chargeConf, settleApptMoney } from './payments.js';
import * as asaas from './integrations/asaas.js';

export const INTERVALS = [7, 15, 30, 45, 60];
export const VISITS_AHEAD = 6;

const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

export const visitPriceCents = (service, discountPct) => Math.round(service.price_cents * (1 - discountPct / 100));

// Gera visitas futuras até VISITS_AHEAD. Se a data cair em dia sem horário, tenta até 3 dias depois.
export async function generateVisits(salon, m, { now = new Date() } = {}) {
  const service = await db.get('SELECT * FROM services WHERE id = ? AND salon_id = ?', [m.service_id, salon.id]);
  if (!service) throw new HttpError(404, 'Serviço não encontrado.');
  const today = localDate(now, salon.timezone);
  const future = await db.get("SELECT COUNT(*) AS n FROM appointments WHERE club_id = ? AND status NOT IN ('cancelled','noshow') AND starts_at > ?", [m.id, now.toISOString()]);
  let need = VISITS_AHEAD - Number(future.n);
  let base = m.last_date || today;
  const made = [];
  let guard = 0;
  while (need > 0 && guard++ < 24) {
    base = addDays(base, m.interval_days);
    let placed = null;
    for (let shift = 0; shift <= 3 && !placed; shift++) {
      const date = addDays(base, shift);
      if (date < today) continue;
      const slots = await getSlots(salon, { serviceId: m.service_id, staffId: m.staff_id, date, now });
      if (!slots.length) continue;
      const want = toMin(m.preferred_time);
      slots.sort((a, b) => Math.abs(toMin(a.time) - want) - Math.abs(toMin(b.time) - want));
      try {
        placed = await createAppointment(salon, {
          clientId: m.client_id, staffId: m.staff_id, serviceId: m.service_id, startsAt: slots[0].startsAt,
          source: 'clube', clubId: m.id, priceCents: visitPriceCents(service, m.discount_pct),
        });
      } catch (e) { if (e.status !== 409) throw e; }
    }
    await db.run('UPDATE club_memberships SET last_date = ? WHERE id = ?', [base, m.id]);
    if (placed) { made.push(placed); need--; }
  }
  return made;
}

// Cobra cada visita 7 dias antes (a fatura do Asaas deixa o cliente escolher Pix ou cartão).
// Sem pagamento até o prazo de cancelamento do salão, o horário é liberado.
export async function chargeClubVisits(salon, now = new Date()) {
  const horizon = new Date(now.getTime() + 7 * 86400_000).toISOString();
  const due = await db.all(
    `SELECT a.*, c.name AS cname, c.phone AS cphone, c.email AS cemail, m.cpf_cnpj FROM appointments a
       JOIN clients c ON c.id = a.client_id JOIN club_memberships m ON m.id = a.club_id
      WHERE a.salon_id = ? AND a.club_id IS NOT NULL AND a.pay_status = 'none' AND a.status = 'scheduled' AND a.starts_at > ? AND a.starts_at <= ? AND m.status = 'active' AND m.charge = 1`,
    [salon.id, now.toISOString(), horizon]);
  let n = 0;
  for (const a of due) {
    const claim = await db.run("UPDATE appointments SET pay_status = 'pending' WHERE id = ? AND pay_status = 'none'", [a.id]);
    if (!claim.changes) continue;
    try {
      await createApptCharge(salon, a, { name: a.cname, phone: a.cphone, email: a.cemail }, { cpfCnpj: a.cpf_cnpj, billingType: 'UNDEFINED' });
      n++;
    } catch { await db.run("UPDATE appointments SET pay_status = 'none' WHERE id = ?", [a.id]); } // tenta de novo no próximo ciclo
  }
  const cutoff = new Date(now.getTime() + (salon.free_cancel_hours ?? 24) * 3600_000).toISOString();
  const unpaid = await db.all("SELECT * FROM appointments WHERE salon_id = ? AND club_id IS NOT NULL AND pay_status = 'pending' AND status = 'scheduled' AND starts_at <= ?", [salon.id, cutoff]);
  for (const a of unpaid) {
    const claim = await db.run("UPDATE appointments SET status = 'cancelled' WHERE id = ? AND status = 'scheduled'", [a.id]);
    if (claim.changes) await settleApptMoney(salon, a, 'cancel', now).catch(() => {});
  }
  return n;
}

export async function rollClub(salon, now = new Date()) {
  const list = await db.all("SELECT * FROM club_memberships WHERE salon_id = ? AND status = 'active'", [salon.id]);
  let n = 0;
  for (const m of list) n += (await generateVisits(salon, m, { now })).length;
  return n;
}

export async function cancelMembership(salon, m, now = new Date()) {
  await db.run("UPDATE club_memberships SET status = 'cancelled', cancelled_at = ? WHERE id = ?", [nowIso(), m.id]);
  // visitas futuras ainda não pagas são liberadas; as já pagas ficam (o salão decide o estorno pelo agendamento)
  const rows = await db.all("SELECT * FROM appointments WHERE club_id = ? AND status = 'scheduled' AND pay_status IN ('none','pending') AND starts_at > ?", [m.id, now.toISOString()]);
  for (const a of rows) {
    await db.run("UPDATE appointments SET status = 'cancelled' WHERE id = ?", [a.id]);
    if (a.pay_status === 'pending' && a.pay_ref) {
      try { await asaas.deletePayment(await chargeConf(salon.id), a.pay_ref); } catch { /* ignora */ }
    }
  }
  return rows.length;
}

export { uid };
