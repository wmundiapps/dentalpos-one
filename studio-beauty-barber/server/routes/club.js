// Clube de assinatura (horário recorrente) — painel do salão.
import { db } from '../db.js';
import { HttpError, validate, uid, nowIso } from '../util.js';
import { auth, audit } from '../auth.js';
import { INTERVALS, generateVisits, cancelMembership, visitPriceCents } from '../club.js';

export default function register(r) {
  r.get('/api/club', auth('reception'), async (ctx) => {
    const rows = await db.all(
      `SELECT m.*, c.name AS client_name, c.phone AS client_phone, s.name AS service_name, s.price_cents AS service_price_cents, st.name AS staff_name
         FROM club_memberships m JOIN clients c ON c.id = m.client_id JOIN services s ON s.id = m.service_id JOIN staff st ON st.id = m.staff_id
        WHERE m.salon_id = ? ORDER BY m.status, c.name`, [ctx.salon.id]);
    const out = [];
    for (const m of rows) {
      const next = await db.all(
        "SELECT starts_at, status, pay_status FROM appointments WHERE club_id = ? AND status NOT IN ('cancelled','noshow') AND starts_at > ? ORDER BY starts_at LIMIT 6",
        [m.id, nowIso()]);
      out.push({ ...m, visit_cents: Math.round(m.service_price_cents * (1 - m.discount_pct / 100)), next_visits: next });
    }
    return { memberships: out, intervals: INTERVALS };
  });

  r.post('/api/club', auth('manager'), async (ctx) => {
    const d = validate(ctx.body, {
      client_id: 'str:1:60', service_id: 'str:1:60', staff_id: 'str:1:60', interval_days: 'int:7:60',
      preferred_time: 'str:5:5', discount_pct: 'int?:0:50', cpf_cnpj: 'str?:11:18', charge: 'bool?',
    });
    if (!INTERVALS.includes(d.interval_days)) throw new HttpError(422, 'Intervalo permitido: 7, 15, 30, 45 ou 60 dias.');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(d.preferred_time)) throw new HttpError(422, 'Horário preferido inválido (use HH:MM).');
    const client = await db.get('SELECT id FROM clients WHERE id = ? AND salon_id = ? AND deleted_at IS NULL', [d.client_id, ctx.salon.id]);
    const service = await db.get('SELECT * FROM services WHERE id = ? AND salon_id = ? AND active = 1', [d.service_id, ctx.salon.id]);
    const link = await db.get('SELECT 1 AS x FROM staff_services ss JOIN staff st ON st.id = ss.staff_id WHERE ss.staff_id = ? AND ss.service_id = ? AND st.salon_id = ? AND st.active = 1', [d.staff_id, d.service_id, ctx.salon.id]);
    if (!client || !service || !link) throw new HttpError(404, 'Cliente, serviço ou profissional inválido.');
    const doc = String(d.cpf_cnpj || '').replace(/\D/g, '');
    if (doc && doc.length !== 11 && doc.length !== 14) throw new HttpError(422, 'CPF/CNPJ inválido.');
    const id = uid();
    await db.run(
      `INSERT INTO club_memberships (id, salon_id, client_id, service_id, staff_id, interval_days, preferred_time, discount_pct, cpf_cnpj, charge, status, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, ctx.salon.id, d.client_id, d.service_id, d.staff_id, d.interval_days, d.preferred_time, d.discount_pct ?? 0, doc || null, d.charge === false || d.charge === 0 ? 0 : 1, 'active', nowIso()]);
    const m = await db.get('SELECT * FROM club_memberships WHERE id = ?', [id]);
    const made = await generateVisits(ctx.salon, m);
    await audit(ctx, 'club_created', 'club', id, { interval: d.interval_days });
    return { id, visit_cents: visitPriceCents(service, d.discount_pct ?? 0), visits: made.map((a) => a.starts_at) };
  });

  r.post('/api/club/:id/cancel', auth('manager'), async (ctx) => {
    const m = await db.get('SELECT * FROM club_memberships WHERE id = ? AND salon_id = ?', [ctx.params.id, ctx.salon.id]);
    if (!m) throw new HttpError(404, 'Assinatura não encontrada.');
    const released = await cancelMembership(ctx.salon, m);
    await audit(ctx, 'club_cancelled', 'club', m.id);
    return { ok: true, released };
  });
}
