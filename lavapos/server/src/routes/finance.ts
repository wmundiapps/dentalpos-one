import { Router } from 'express';
import { z } from 'zod';
import { pool, one, rows, withTx } from '../db.js';
import { tenantOf, type AuthedRequest } from '../auth.js';
import { HttpError, audit, clientIp } from '../security.js';
import { getRec, insertRec, listRecs, patchRec } from '../repo.js';
import { loadSettings } from '../tenant.js';
import { computePricing, type Cat } from '../pricing.js';
import { platformFeePct } from '../asaas.js';
import { nowLocal, addMonths } from '../time.js';
import { text, uuid } from '../validators.js';

export const financeRouter = Router();
const monthRe = /^\d{4}-(0[1-9]|1[0-2])$/;

financeRouter.get('/payments', async (req: AuthedRequest, res) => {
  const m = z.string().regex(monthRe).default(nowLocal().date.slice(0, 7)).parse(req.query.month);
  res.json(await listRecs(pool, tenantOf(req), 'payment', { where: `COALESCE(data->>'paidAt', created_at::text) LIKE $3`, params: [m + '%'], limit: 2000 }));
});

/** Baixa manual de pagamento pendente (ex.: boleto pago por fora). */
financeRouter.post('/payments/:id/paid', async (req: AuthedRequest, res) => {
  const tenantId = tenantOf(req);
  const p = await getRec(pool, tenantId, 'payment', req.params.id as string);
  if (!p) throw new HttpError(404, 'Pagamento não encontrado.', 'nao_encontrado');
  if (p.data.status === 'pago') return void res.json(p);
  await audit(pool, 'pagamento_baixado', { tenantId, userId: req.user!.id, ip: clientIp(req) }, { paymentId: p.id });
  res.json(await patchRec(pool, tenantId, 'payment', p.id, { status: 'pago', paidAt: new Date().toISOString(), manual: true }));
});

financeRouter.get('/summary', async (req: AuthedRequest, res) => {
  const tenantId = tenantOf(req);
  const m = z.string().regex(monthRe).default(nowLocal().date.slice(0, 7)).parse(req.query.month);
  const pay = await one(pool, `SELECT COALESCE(SUM((data->>'amountCents')::int) FILTER (WHERE data->>'status'='pago'),0)::int AS received,
      COALESCE(SUM((data->>'amountCents')::int) FILTER (WHERE data->>'status'='pendente'),0)::int AS pending,
      COALESCE(SUM((data->>'platformFeeCents')::int) FILTER (WHERE data->>'status'='pago'),0)::int AS fee,
      COALESCE(SUM((data->>'platformFeeCents')::int) FILTER (WHERE data->>'status'='pago' AND data->>'feeMode'='a_repassar'),0)::int AS fee_due
    FROM records WHERE tenant_id=$1 AND kind='payment' AND COALESCE(data->>'paidAt', created_at::text) LIKE $2`, [tenantId, m + '%']);
  const exp = await one(pool, `SELECT COALESCE(SUM((data->>'amountCents')::int),0)::int AS total,
      COALESCE(SUM((data->>'amountCents')::int) FILTER (WHERE data->>'kind'='fixa'),0)::int AS fixed,
      COALESCE(SUM((data->>'amountCents')::int) FILTER (WHERE data->>'paid'='true'),0)::int AS paid
    FROM records WHERE tenant_id=$1 AND kind='expense' AND COALESCE(data->>'archived','false')<>'true' AND data->>'dueDate' LIKE $2`, [tenantId, m + '%']);
  const orders = await one(pool, `SELECT count(*)::int AS n FROM records WHERE tenant_id=$1 AND kind='order' AND data->>'status'='entregue' AND data->>'deliveredAt' LIKE $2`, [tenantId, m + '%']);
  const byMethod = await rows(pool, `SELECT data->>'method' AS method, SUM((data->>'amountCents')::int)::int AS total FROM records WHERE tenant_id=$1 AND kind='payment' AND data->>'status'='pago' AND COALESCE(data->>'paidAt','') LIKE $2 GROUP BY 1 ORDER BY 2 DESC`, [tenantId, m + '%']);
  const grossProfit = pay!.received - pay!.fee - exp!.total;
  res.json({ month: m, receivedCents: pay!.received, pendingCents: pay!.pending, platformFeeCents: pay!.fee, platformFeeDueCents: pay!.fee_due, expensesCents: exp!.total, expensesPaidCents: exp!.paid, fixedExpensesCents: exp!.fixed, profitCents: grossProfit, ordersDelivered: orders!.n, byMethod });
});

/** Precificação com margem: usa o custo real cadastrado (estoque, despesas fixas) e o volume dos últimos 30 dias. */
financeRouter.get('/pricing', async (req: AuthedRequest, res) => {
  const tenantId = tenantOf(req);
  const s = await loadSettings(pool, tenantId);
  const q = z.object({ washesPerMonth: z.coerce.number().int().min(1).max(20000).optional(), marginPct: z.coerce.number().min(0).max(90).optional() }).parse(req.query);
  const [services, stock, expenses] = await Promise.all([listRecs(pool, tenantId, 'service', {}), listRecs(pool, tenantId, 'stockItem', {}), listRecs(pool, tenantId, 'expense', {})]);
  const cost = new Map(stock.map((i) => [i.id, i.data.costCents as number]));
  const month = nowLocal().date.slice(0, 7);
  // Despesas fixas do mês corrente; se vazio, usa as recorrentes
  const fixed = expenses.filter((e) => e.data.kind === 'fixa' && (e.data.dueDate.startsWith(month) || e.data.recurring === 'mensal'));
  const fixedMonthly = fixed.reduce((a, e) => a + e.data.amountCents, 0);
  const real = await one<{ n: number; f: number }>(pool, `SELECT count(*)::int AS n, COALESCE(AVG(CASE data->>'categoryKey' WHEN 'carro' THEN 1 WHEN 'suv' THEN 1.3 WHEN 'utilitario' THEN 1.4 WHEN 'van' THEN 1.8 ELSE 3 END),1)::float AS f
    FROM records WHERE tenant_id=$1 AND kind='order' AND data->>'status'='entregue' AND data->>'deliveredAt' >= $2`, [tenantId, addMonths(nowLocal().date, -1)]);
  const washes = q.washesPerMonth ?? Math.max(real?.n ?? 0, 1);
  const out = computePricing({
    services: services.filter((x) => x.data.active !== false).map((x) => ({ id: x.id, name: x.data.name, prices: x.data.prices as Record<Cat, number>, materialCents: Math.round((x.data.recipe ?? []).reduce((a: number, r: any) => a + (cost.get(r.itemId) ?? 0) * r.qty, 0)), otherCostCents: x.data.otherCostCents ?? 0 })),
    fixedMonthlyCents: fixedMonthly, washesPerMonth: washes, avgFactor: real?.f ?? 1,
    marginPct: q.marginPct ?? s.pricing.desiredMarginPct, taxPct: s.pricing.taxPct, cardFeePct: s.pricing.cardFeePct, platformFeePct: platformFeePct(), targetProfitCents: s.pricing.targetProfitCents,
  });
  res.json({ ...out, inputs: { fixedMonthlyCents: fixedMonthly, washesPerMonth: washes, realWashesLast30d: real?.n ?? 0, marginPct: q.marginPct ?? s.pricing.desiredMarginPct, taxPct: s.pricing.taxPct, cardFeePct: s.pricing.cardFeePct, platformFeePct: platformFeePct() } });
});

financeRouter.get('/invoices', async (req: AuthedRequest, res) => res.json(await listRecs(pool, tenantOf(req), 'invoice', { limit: 500 })));
financeRouter.post('/invoices/:id/issued', async (req: AuthedRequest, res) => {
  const b = z.object({ number: text(30).pipe(z.string().min(1)) }).parse(req.body);
  const u = await patchRec(pool, tenantOf(req), 'invoice', req.params.id as string, { status: 'emitida', number: b.number, issuedAt: new Date().toISOString() });
  if (!u) throw new HttpError(404, 'Nota não encontrada.', 'nao_encontrado');
  res.json(u);
});

// ---- Estoque
financeRouter.post('/stock/move', async (req: AuthedRequest, res) => {
  const tenantId = tenantOf(req);
  const b = z.object({ itemId: uuid, delta: z.number().min(-1_000_000).max(1_000_000).refine((n) => n !== 0, 'quantidade zero'), reason: z.enum(['compra', 'ajuste', 'perda']), costCents: z.number().int().min(0).optional(), note: text(200).default('') }).parse(req.body);
  const out = await withTx(async (tx) => {
    const it = await getRec(tx, tenantId, 'stockItem', b.itemId);
    if (!it) throw new HttpError(404, 'Item não encontrado.', 'nao_encontrado');
    const qty = Math.max(0, (it.data.qty as number) + b.delta);
    await insertRec(tx, tenantId, 'stockMove', { itemId: b.itemId, delta: b.delta, reason: b.reason, note: b.note, costCents: b.costCents ?? null });
    return patchRec(tx, tenantId, 'stockItem', b.itemId, { qty, ...(b.reason === 'compra' && b.costCents ? { costCents: b.costCents } : {}) });
  });
  res.json(out);
});
financeRouter.get('/stock/moves', async (req: AuthedRequest, res) => res.json(await listRecs(pool, tenantOf(req), 'stockMove', { limit: 300 })));
