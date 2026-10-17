import { Router } from 'express';
import { pool, one, rows } from '../db.js';
import { tenantOf, type AuthedRequest } from '../auth.js';
import { listRecs } from '../repo.js';
import { appointmentsBetween } from '../agenda.js';
import { addDays, daysBetween, nowLocal } from '../time.js';
import { getTenant } from '../tenant.js';

export const dashboardRouter = Router();

export async function complianceAlerts(tenantId: string) {
  const today = nowLocal().date;
  const items = await listRecs(pool, tenantId, 'compliance', { limit: 500 });
  return items.filter((c) => !c.data.done).map((c) => ({ id: c.id, title: c.data.title, type: c.data.type, dueDate: c.data.dueDate, daysLeft: daysBetween(today, c.data.dueDate), alertDays: c.data.alertDays }))
    .filter((c) => c.daysLeft <= c.alertDays).sort((a, b) => a.daysLeft - b.daysLeft);
}

dashboardRouter.get('/', async (req: AuthedRequest, res) => {
  const tenantId = tenantOf(req);
  const today = nowLocal().date;
  const month = today.slice(0, 7);
  const [t, apps, open, stock, alerts, expensesDue, subs, rev, cust] = await Promise.all([
    getTenant(pool, tenantId),
    appointmentsBetween(pool, tenantId, today, addDays(today, 1)),
    listRecs(pool, tenantId, 'order', { where: `data->>'status' IN ('em_servico','pronto')`, limit: 200 }),
    listRecs(pool, tenantId, 'stockItem', {}),
    complianceAlerts(tenantId),
    listRecs(pool, tenantId, 'expense', { where: `data->>'paid' <> 'true' AND data->>'dueDate' <= $3`, params: [addDays(today, 7)], limit: 50 }),
    one(pool, `SELECT count(*) FILTER (WHERE data->>'status'='ativa')::int AS n, COALESCE(SUM((data->>'priceCents')::int) FILTER (WHERE data->>'status'='ativa'),0)::int AS mrr FROM records WHERE tenant_id=$1 AND kind='subscription'`, [tenantId]),
    one(pool, `SELECT COALESCE(SUM((data->>'amountCents')::int) FILTER (WHERE COALESCE(data->>'paidAt','') LIKE $2),0)::int AS month, COALESCE(SUM((data->>'amountCents')::int) FILTER (WHERE COALESCE(data->>'paidAt','') LIKE $3),0)::int AS today
      FROM records WHERE tenant_id=$1 AND kind='payment' AND data->>'status'='pago'`, [tenantId, month + '%', today + '%']),
    one(pool, `SELECT count(*)::int AS n FROM records WHERE tenant_id=$1 AND kind='customer' AND COALESCE(data->>'archived','false')<>'true'`, [tenantId]),
  ]);
  const [custAll, vehAll] = await Promise.all([listRecs(pool, tenantId, 'customer', { archived: true, limit: 5000 }), listRecs(pool, tenantId, 'vehicle', { archived: true, limit: 5000 })]);
  const names = new Map(custAll.map((c) => [c.id, c.data.name as string])); const plates = new Map(vehAll.map((v) => [v.id, v.data.plate as string]));
  const trialDaysLeft = t.billing_status === 'trial' ? Math.max(0, Math.ceil((new Date(t.trial_ends_at).getTime() - Date.now()) / 86400000)) : null;
  res.json({
    today, trialDaysLeft, billingStatus: t.billing_status,
    appointmentsToday: apps.map((a) => ({ id: a.id, ...a.data, customerName: names.get(a.data.customerId) ?? '', plate: plates.get(a.data.vehicleId) ?? '' })),
    inService: open.filter((o) => o.data.status === 'em_servico').length, ready: open.filter((o) => o.data.status === 'pronto').length,
    openOrders: open.map((o) => ({ id: o.id, number: o.data.number, status: o.data.status, plate: o.data.plate, customerName: o.data.customerName, vehicleLabel: o.data.vehicleLabel })),
    revenueTodayCents: rev!.today, revenueMonthCents: rev!.month, customers: cust!.n, subscribers: subs!.n, mrrCents: subs!.mrr,
    lowStock: stock.filter((i) => i.data.qty <= i.data.minQty).map((i) => ({ id: i.id, name: i.data.name, qty: i.data.qty, minQty: i.data.minQty, unit: i.data.unit })),
    complianceAlerts: alerts,
    expensesDue: expensesDue.map((e) => ({ id: e.id, description: e.data.description, amountCents: e.data.amountCents, dueDate: e.data.dueDate })),
  });
});

dashboardRouter.get('/compliance', async (req: AuthedRequest, res) => res.json(await complianceAlerts(tenantOf(req))));
dashboardRouter.get('/outbox', async (req: AuthedRequest, res) => {
  res.json(await rows(pool, `SELECT id, channel, to_addr AS "to", subject, body, topic, status, error, scheduled_at AS "scheduledAt", sent_at AS "sentAt" FROM outbox WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 200`, [tenantOf(req)]));
});
