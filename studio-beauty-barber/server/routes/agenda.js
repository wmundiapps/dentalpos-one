// Agenda, disponibilidade e vendas/comandas.
import { db } from '../db.js';
import { HttpError, validate, uid, nowIso, zonedToUtc, addDays, localDate, normalizePhone } from '../util.js';
import { auth, audit } from '../auth.js';
import { getSlots } from '../availability.js';
import { createAppointment, findOrCreateClient, settleSale } from '../domain.js';
import { getIntegration } from '../integrations/store.js';
import * as asaas from '../integrations/asaas.js';
import { settleApptMoney } from '../payments.js';

const STATUSES = 'scheduled,confirmed,done,cancelled,noshow,pending_payment';

function rangeUtc(salon, from, to) {
  const f = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : localDate(new Date(), salon.timezone);
  const t = to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : f;
  return { from: f, to: t, fromUtc: zonedToUtc(f, '00:00', salon.timezone), toUtc: zonedToUtc(addDays(t, 1), '00:00', salon.timezone) };
}

export default function register(r) {
  r.get('/api/availability', auth(), async (ctx) => {
    const { service_id, date, staff_id } = ctx.query;
    if (!service_id || !date) throw new HttpError(422, 'Informe service_id e date.');
    const slots = await getSlots(ctx.salon, { serviceId: service_id, staffId: staff_id || null, date });
    return { slots };
  });

  r.get('/api/appointments', auth(), async (ctx) => {
    const { fromUtc, toUtc, from, to } = rangeUtc(ctx.salon, ctx.query.from, ctx.query.to);
    const rows = await db.all(
      `SELECT a.*, c.name AS client_name, c.phone AS client_phone, s.name AS service_name, s.duration_min, st.name AS staff_name, st.color AS staff_color
         FROM appointments a
         JOIN clients c ON c.id = a.client_id JOIN services s ON s.id = a.service_id JOIN staff st ON st.id = a.staff_id
        WHERE a.salon_id = ? AND a.starts_at >= ? AND a.starts_at < ? ORDER BY a.starts_at`,
      [ctx.salon.id, fromUtc, toUtc]);
    return { from, to, appointments: rows };
  });

  r.post('/api/appointments', auth('reception'), async (ctx) => {
    const d = validate(ctx.body, { client_id: 'str?:0:60', staff_id: 'str:1:60', service_id: 'str:1:60', starts_at: 'iso', notes: 'str?:0:500' });
    let clientId = d.client_id;
    if (!clientId) {
      const nc = validate(ctx.body?.new_client, { name: 'str:2:80', phone: 'phone?' });
      clientId = (await db.tx((t) => findOrCreateClient(t, ctx.salon.id, { ...nc, source: 'painel' }))).id;
    }
    const appt = await createAppointment(ctx.salon, { clientId, staffId: d.staff_id, serviceId: d.service_id, startsAt: d.starts_at, source: 'painel', notes: d.notes });
    await audit(ctx, 'appointment_created', 'appointment', appt.id);
    return { appointment: appt };
  });

  r.patch('/api/appointments/:id', auth('reception'), async (ctx) => {
    const d = validate(ctx.body, { status: `enum?:${STATUSES}`, starts_at: 'iso?', staff_id: 'str?:1:60', notes: 'str?:0:500' });
    const cur = await db.get('SELECT * FROM appointments WHERE id = ? AND salon_id = ?', [ctx.params.id, ctx.salon.id]);
    if (!cur) throw new HttpError(404, 'Agendamento não encontrado.');
    if (d.starts_at || d.staff_id) {
      await db.tx(async (t) => {
        const svc = await t.get('SELECT duration_min FROM services WHERE id = ?', [cur.service_id]);
        const start = new Date(d.starts_at || cur.starts_at);
        const s = start.toISOString(), e = new Date(start.getTime() + svc.duration_min * 60000).toISOString();
        const staffId = d.staff_id || cur.staff_id;
        if (d.staff_id) {
          const st = await t.get('SELECT 1 AS x FROM staff WHERE id = ? AND salon_id = ? AND active = 1', [staffId, ctx.salon.id]);
          const ok = await t.get('SELECT 1 AS x FROM staff_services WHERE staff_id = ? AND service_id = ?', [staffId, cur.service_id]);
          if (!st || !ok) throw new HttpError(422, 'Este profissional não realiza o serviço.');
        }
        const clash = await t.get(
          `SELECT id FROM appointments WHERE salon_id = ? AND staff_id = ? AND id <> ? AND status NOT IN ('cancelled','noshow') AND starts_at < ? AND ends_at > ?`,
          [ctx.salon.id, staffId, cur.id, e, s]);
        if (clash) throw new HttpError(409, 'Conflito: o profissional já tem outro atendimento nesse horário.');
        await t.run('UPDATE appointments SET starts_at = ?, ends_at = ?, staff_id = ?, reminder_24h_sent = 0, reminder_2h_sent = 0 WHERE id = ?', [s, e, staffId, cur.id]);
      });
    }
    let money = null;
    if (d.status || d.notes) {
      // Cancelamento ou falta de reserva paga: aplica a política (estorno total no prazo, parcial com retenção).
      if ((d.status === 'cancelled' || d.status === 'noshow') && !['cancelled', 'noshow'].includes(cur.status)) {
        try {
          money = await settleApptMoney(ctx.salon, cur, d.status === 'noshow' ? 'noshow' : 'cancel');
        } catch (e) {
          throw new HttpError(502, `Não foi possível devolver o pagamento agora: ${e.message}. O agendamento não foi alterado.`);
        }
      }
      await db.run('UPDATE appointments SET status = COALESCE(?, status), notes = COALESCE(?, notes) WHERE id = ?', [d.status, d.notes, cur.id]);
    }
    await audit(ctx, 'appointment_updated', 'appointment', cur.id, { ...d, money });
    return { ok: true, money };
  });

  // ---------- Vendas / comandas ----------
  r.get('/api/sales', auth('reception'), async (ctx) => {
    const { fromUtc, toUtc } = rangeUtc(ctx.salon, ctx.query.from, ctx.query.to);
    const rows = await db.all(
      `SELECT s.*, c.name AS client_name, st.name AS staff_name FROM sales s
         LEFT JOIN clients c ON c.id = s.client_id LEFT JOIN staff st ON st.id = s.staff_id
        WHERE s.salon_id = ? AND s.created_at >= ? AND s.created_at < ? ORDER BY s.created_at DESC LIMIT 300`,
      [ctx.salon.id, fromUtc, toUtc]);
    return { sales: rows };
  });

  r.post('/api/sales', auth('reception'), async (ctx) => {
    const d = validate(ctx.body, {
      client_id: 'str?:0:60', appointment_id: 'str?:0:60', staff_id: 'str?:0:60',
      payment_method: 'enum:cash,card,pix,pix_asaas,other', discount_cents: 'int?:0:10000000',
    });
    const itemsIn = Array.isArray(ctx.body?.items) ? ctx.body.items.slice(0, 40) : [];
    if (!itemsIn.length) throw new HttpError(422, 'Adicione pelo menos um item.');

    const items = [];
    for (const it of itemsIn) {
      const qty = Math.max(1, Math.min(99, Number(it.qty) || 1));
      if (it.kind === 'service') {
        const s = await db.get('SELECT * FROM services WHERE id = ? AND salon_id = ?', [it.ref_id, ctx.salon.id]);
        if (!s) throw new HttpError(404, 'Serviço não encontrado.');
        items.push({ kind: 'service', ref_id: s.id, name: s.name, qty, unit_cents: s.price_cents });
      } else if (it.kind === 'product') {
        const p = await db.get('SELECT * FROM products WHERE id = ? AND salon_id = ? AND active = 1', [it.ref_id, ctx.salon.id]);
        if (!p) throw new HttpError(404, 'Produto não encontrado.');
        if (p.stock < qty) throw new HttpError(409, `Estoque insuficiente de ${p.name} (restam ${p.stock}).`);
        items.push({ kind: 'product', ref_id: p.id, name: p.name, qty, unit_cents: p.price_cents });
      } else throw new HttpError(422, 'Tipo de item inválido.');
    }
    const subtotal = items.reduce((a, i) => a + i.qty * i.unit_cents, 0);
    const discount = Math.min(d.discount_cents ?? 0, subtotal);
    if (discount > 0 && !['owner', 'manager'].includes(ctx.user.role) && discount > subtotal * 0.1) {
      throw new HttpError(403, 'Descontos acima de 10% precisam de um gerente.');
    }
    const total = subtotal - discount;

    let clientId = d.client_id, staffId = d.staff_id;
    if (d.appointment_id) {
      const a = await db.get('SELECT * FROM appointments WHERE id = ? AND salon_id = ?', [d.appointment_id, ctx.salon.id]);
      if (!a) throw new HttpError(404, 'Agendamento não encontrado.');
      clientId = clientId || a.client_id; staffId = staffId || a.staff_id;
    }
    if (clientId && !(await db.get('SELECT 1 AS x FROM clients WHERE id = ? AND salon_id = ?', [clientId, ctx.salon.id]))) throw new HttpError(404, 'Cliente não encontrado.');

    const id = uid();
    await db.tx(async (t) => {
      await t.run(
        `INSERT INTO sales (id, salon_id, client_id, appointment_id, staff_id, total_cents, discount_cents, payment_method, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [id, ctx.salon.id, clientId, d.appointment_id, staffId, total, discount, d.payment_method, 'open', nowIso()]);
      for (const it of items) {
        await t.run('INSERT INTO sale_items (id, sale_id, kind, ref_id, name, qty, unit_cents) VALUES (?,?,?,?,?,?,?)', [uid(), id, it.kind, it.ref_id, it.name, it.qty, it.unit_cents]);
      }
    });

    let pix = null;
    if (d.payment_method === 'pix_asaas') {
      const conf = await getIntegration(ctx.salon.id, 'asaas');
      if (!conf) {
        pix = { simulated: true, payload: `SIMULADO-${id.slice(0, 8)}`, note: 'Conecte o Asaas em Integrações para gerar o Pix real.' };
      } else {
        const client = clientId ? await db.get('SELECT * FROM clients WHERE id = ?', [clientId]) : null;
        const cust = await asaas.createCustomer(conf, { name: client?.name || 'Cliente balcão', email: client?.email, cpfCnpj: ctx.body?.cpf_cnpj, phone: client?.phone });
        const pay = await asaas.createPayment(conf, {
          customer: cust.id, billingType: 'PIX', valueCents: total, dueDate: localDate(new Date(), ctx.salon.timezone),
          description: `${ctx.salon.name} — comanda ${id.slice(0, 8)}`, externalReference: id,
        });
        const qr = await asaas.getPixQr(conf, pay.id);
        await db.run('UPDATE sales SET asaas_payment_id = ?, pix_payload = ?, invoice_url = ?, status = ? WHERE id = ?', [pay.id, qr.payload, pay.invoiceUrl ?? null, 'pending', id]);
        pix = { payload: qr.payload, image: qr.encodedImage, expires: qr.expirationDate };
      }
      if (pix.simulated) await db.run("UPDATE sales SET status = 'pending', pix_payload = ? WHERE id = ?", [pix.payload, id]);
    } else {
      await settleSale(id, { method: d.payment_method });
    }
    await audit(ctx, 'sale_created', 'sale', id, { total, method: d.payment_method });
    return { id, total_cents: total, status: pix ? 'pending' : 'paid', pix };
  });

  // Confirmação manual (ex.: Pix recebido fora do Asaas / simulação no piloto)
  r.post('/api/sales/:id/pay', auth('reception'), async (ctx) => {
    const s = await db.get('SELECT * FROM sales WHERE id = ? AND salon_id = ?', [ctx.params.id, ctx.salon.id]);
    if (!s) throw new HttpError(404, 'Venda não encontrada.');
    const done = await settleSale(s.id, { method: s.payment_method === 'pix_asaas' ? 'pix' : s.payment_method });
    await audit(ctx, 'sale_marked_paid', 'sale', s.id);
    return { ok: true, settled: done };
  });

  r.post('/api/sales/:id/cancel', auth('manager'), async (ctx) => {
    const res = await db.run("UPDATE sales SET status = 'cancelled' WHERE id = ? AND salon_id = ? AND status <> 'paid'", [ctx.params.id, ctx.salon.id]);
    if (!res.changes) throw new HttpError(409, 'Venda não encontrada ou já paga.');
    await audit(ctx, 'sale_cancelled', 'sale', ctx.params.id);
    return { ok: true };
  });

  // ---------- Relatórios e painel ----------
  r.get('/api/dashboard', auth(), async (ctx) => {
    const tz = ctx.salon.timezone;
    const today = localDate(new Date(), tz);
    const monthStart = today.slice(0, 8) + '01';
    const [dayFrom, dayTo] = [zonedToUtc(today, '00:00', tz), zonedToUtc(addDays(today, 1), '00:00', tz)];
    const monthFrom = zonedToUtc(monthStart, '00:00', tz);
    const sid = ctx.salon.id;

    const todayAppts = await db.all(
      `SELECT a.id, a.starts_at, a.status, c.name AS client_name, s.name AS service_name, st.name AS staff_name
         FROM appointments a JOIN clients c ON c.id = a.client_id JOIN services s ON s.id = a.service_id JOIN staff st ON st.id = a.staff_id
        WHERE a.salon_id = ? AND a.starts_at >= ? AND a.starts_at < ? AND a.status <> 'cancelled' ORDER BY a.starts_at`, [sid, dayFrom, dayTo]);
    const rev = await db.get("SELECT COALESCE(SUM(total_cents),0) AS v, COUNT(*) AS n FROM sales WHERE salon_id = ? AND status = 'paid' AND paid_at >= ?", [sid, monthFrom]);
    const revToday = await db.get("SELECT COALESCE(SUM(total_cents),0) AS v FROM sales WHERE salon_id = ? AND status = 'paid' AND paid_at >= ? AND paid_at < ?", [sid, dayFrom, dayTo]);
    const newLeads = await db.get('SELECT COUNT(*) AS n FROM leads WHERE salon_id = ? AND created_at >= ?', [sid, monthFrom]);
    const newClients = await db.get('SELECT COUNT(*) AS n FROM clients WHERE salon_id = ? AND created_at >= ? AND deleted_at IS NULL', [sid, monthFrom]);
    const stats = await db.get(
      `SELECT SUM(CASE WHEN status = 'noshow' THEN 1 ELSE 0 END) AS noshow, SUM(CASE WHEN status IN ('done','noshow','confirmed','scheduled') THEN 1 ELSE 0 END) AS total
         FROM appointments WHERE salon_id = ? AND starts_at >= ? AND starts_at < ?`, [sid, monthFrom, dayTo]);
    const unread = await db.get('SELECT COUNT(*) AS n FROM conversations WHERE salon_id = ? AND unread > 0', [sid]);
    const lowStock = await db.all('SELECT name, stock, min_stock FROM products WHERE salon_id = ? AND active = 1 AND stock <= min_stock ORDER BY stock LIMIT 8', [sid]);
    // faturamento dos últimos 14 dias
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const day = addDays(today, -i);
      const row = await db.get("SELECT COALESCE(SUM(total_cents),0) AS v FROM sales WHERE salon_id = ? AND status = 'paid' AND paid_at >= ? AND paid_at < ?",
        [sid, zonedToUtc(day, '00:00', tz), zonedToUtc(addDays(day, 1), '00:00', tz)]);
      days.push({ date: day, cents: Number(row.v) });
    }
    return {
      today, today_appointments: todayAppts,
      revenue_month_cents: Number(rev.v), sales_month: Number(rev.n), revenue_today_cents: Number(revToday.v),
      ticket_cents: Number(rev.n) ? Math.round(Number(rev.v) / Number(rev.n)) : 0,
      new_leads_month: Number(newLeads.n), new_clients_month: Number(newClients.n),
      noshow_rate: Number(stats.total) ? Number(stats.noshow || 0) / Number(stats.total) : 0,
      unread_conversations: Number(unread.n), low_stock: lowStock, revenue_14d: days,
    };
  });

  r.get('/api/reports/commissions', auth('manager'), async (ctx) => {
    const { fromUtc, toUtc, from, to } = rangeUtc(ctx.salon, ctx.query.from || (localDate(new Date(), ctx.salon.timezone).slice(0, 8) + '01'), ctx.query.to);
    const rows = await db.all(
      `SELECT st.id, st.name, st.commission_pct, COUNT(s.id) AS sales, COALESCE(SUM(s.total_cents),0) AS revenue_cents
         FROM staff st LEFT JOIN sales s ON s.staff_id = st.id AND s.status = 'paid' AND s.paid_at >= ? AND s.paid_at < ?
        WHERE st.salon_id = ? GROUP BY st.id, st.name, st.commission_pct ORDER BY revenue_cents DESC`,
      [fromUtc, toUtc, ctx.salon.id]);
    return { from, to, rows: rows.map((x) => ({ ...x, sales: Number(x.sales), revenue_cents: Number(x.revenue_cents), commission_cents: Math.round(Number(x.revenue_cents) * x.commission_pct / 100) })) };
  });
}
