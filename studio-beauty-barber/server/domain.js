// Regras de negócio compartilhadas entre painel, página pública e robô.
import { db } from './db.js';
import { HttpError, uid, nowIso, normalizePhone } from './util.js';

export async function findOrCreateClient(t, salonId, { name, phone, email, source, birthday }) {
  const p = phone ? normalizePhone(phone) : null;
  if (p) {
    const hit = await t.get('SELECT * FROM clients WHERE salon_id = ? AND phone = ? AND deleted_at IS NULL', [salonId, p]);
    if (hit) return hit;
  }
  const id = uid();
  await t.run(
    `INSERT INTO clients (id, salon_id, name, phone, email, birthday, source, created_at) VALUES (?,?,?,?,?,?,?,?)`,
    [id, salonId, name, p, email ?? null, birthday ?? null, source ?? null, nowIso()]);
  return t.get('SELECT * FROM clients WHERE id = ?', [id]);
}

// Cria o agendamento garantindo (dentro de transação) que o profissional está livre.
export async function createAppointment(salon, { clientId, staffId, serviceId, startsAt, source = 'painel', notes = null, priceCents = null, status = 'scheduled', clubId = null, policyAcceptedAt = null }) {
  return db.tx(async (t) => {
    const service = await t.get('SELECT * FROM services WHERE id = ? AND salon_id = ?', [serviceId, salon.id]);
    const staff = await t.get('SELECT * FROM staff WHERE id = ? AND salon_id = ? AND active = 1', [staffId, salon.id]);
    const client = await t.get('SELECT id FROM clients WHERE id = ? AND salon_id = ? AND deleted_at IS NULL', [clientId, salon.id]);
    if (!service || !staff || !client) throw new HttpError(404, 'Cliente, serviço ou profissional não encontrado.');
    const ok = await t.get('SELECT 1 AS x FROM staff_services WHERE staff_id = ? AND service_id = ?', [staffId, serviceId]);
    if (!ok) throw new HttpError(422, `${staff.name} não realiza o serviço ${service.name}.`);
    const start = new Date(startsAt);
    if (Number.isNaN(start.getTime())) throw new HttpError(422, 'Horário inválido.');
    const s = start.toISOString();
    const e = new Date(start.getTime() + service.duration_min * 60000).toISOString();
    const clash = await t.get(
      `SELECT id FROM appointments WHERE salon_id = ? AND staff_id = ? AND status NOT IN ('cancelled','noshow') AND starts_at < ? AND ends_at > ?`,
      [salon.id, staffId, e, s]);
    if (clash) throw new HttpError(409, 'Esse horário acabou de ser ocupado. Escolha outro.');
    const id = uid();
    await t.run(
      `INSERT INTO appointments (id, salon_id, client_id, staff_id, service_id, starts_at, ends_at, status, price_cents, source, notes, club_id, policy_accepted_at, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, salon.id, clientId, staffId, serviceId, s, e, status, priceCents ?? service.price_cents, source, notes, clubId, policyAcceptedAt, nowIso()]);
    return t.get('SELECT * FROM appointments WHERE id = ?', [id]);
  });
}

export async function setAppointmentStatus(salonId, id, status) {
  const r = await db.run('UPDATE appointments SET status = ? WHERE id = ? AND salon_id = ?', [status, id, salonId]);
  if (!r.changes) throw new HttpError(404, 'Agendamento não encontrado.');
}

// Lead criado/atualizado a partir de qualquer contato (formulário, robô, anúncio).
export async function upsertLead(salonId, { name, phone, email, company, city, source, utm, consent, consentIp, notes }) {
  const p = phone ? normalizePhone(phone) : null;
  let lead = p ? await db.get('SELECT * FROM leads WHERE salon_id = ? AND phone = ?', [salonId, p]) : null;
  if (!lead && email) lead = await db.get('SELECT * FROM leads WHERE salon_id = ? AND email = ?', [salonId, email]);
  const now = nowIso();
  if (lead) {
    await db.run('UPDATE leads SET updated_at = ?, notes = COALESCE(?, notes) WHERE id = ?', [now, notes ?? null, lead.id]);
    return { lead, created: false };
  }
  const id = uid();
  await db.run(
    `INSERT INTO leads (id, salon_id, name, phone, email, company, city, source, utm_json, stage, consent, consent_at, consent_ip, notes, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, salonId, name, p, email ?? null, company ?? null, city ?? null, source ?? 'direto', utm ? JSON.stringify(utm).slice(0, 1000) : null,
      'new', consent ? 1 : 0, consent ? now : null, consent ? consentIp ?? null : null, notes ?? null, now, now]);
  return { lead: await db.get('SELECT * FROM leads WHERE id = ?', [id]), created: true };
}

export async function creditClientVisit(t, clientId, cents, whenIso) {
  await t.run(
    `UPDATE clients SET visits = visits + 1, total_spent_cents = total_spent_cents + ?, last_visit_at = ? WHERE id = ?`,
    [cents, whenIso, clientId]);
}

// Quita uma venda (idempotente): marca como paga, conclui o atendimento, credita o cliente e baixa o estoque.
export async function settleSale(saleId, { method = null, paidAt = nowIso() } = {}) {
  return db.tx(async (t) => {
    const claim = await t.run("UPDATE sales SET status = 'paid', paid_at = ?, payment_method = COALESCE(?, payment_method) WHERE id = ? AND status <> 'paid' AND status <> 'cancelled'", [paidAt, method, saleId]);
    if (!claim.changes) return false; // já quitada (webhook repetido) ou cancelada
    const sale = await t.get('SELECT * FROM sales WHERE id = ?', [saleId]);
    if (sale.appointment_id) await t.run("UPDATE appointments SET status = 'done' WHERE id = ? AND salon_id = ?", [sale.appointment_id, sale.salon_id]);
    if (sale.client_id) await creditClientVisit(t, sale.client_id, sale.total_cents, paidAt);
    const items = await t.all("SELECT * FROM sale_items WHERE sale_id = ? AND kind = 'product'", [saleId]);
    for (const it of items) await t.run('UPDATE products SET stock = CASE WHEN stock >= ? THEN stock - ? ELSE 0 END WHERE id = ? AND salon_id = ?', [it.qty, it.qty, it.ref_id, sale.salon_id]);
    return true;
  });
}
