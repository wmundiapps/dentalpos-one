// Clube de assinatura: planos semanal, quinzenal, trisemanal e mensal. Cobrança mensal automática (jobs.ts) e uma lavagem por intervalo.
import { Router } from 'express';
import { z } from 'zod';
import { pool, rows } from '../db.js';
import { tenantOf, type AuthedRequest } from '../auth.js';
import { HttpError } from '../security.js';
import { getRec, insertRec, listRecs, patchRec } from '../repo.js';
import { nowLocal } from '../time.js';
import { uuid } from '../validators.js';

export const clubRouter = Router();

clubRouter.get('/subscriptions', async (req: AuthedRequest, res) => {
  const tenantId = tenantOf(req);
  const [subs, plans, customers, vehicles] = await Promise.all(['subscription', 'plan', 'customer', 'vehicle'].map((k) => listRecs(pool, tenantId, k, { archived: true, limit: 5000 })));
  const by = (a: typeof subs) => new Map(a.map((r) => [r.id, r]));
  const [P, C, V] = [by(plans!), by(customers!), by(vehicles!)];
  res.json(subs!.map((s) => ({ id: s.id, ...s.data, planName: P.get(s.data.planId)?.data.name, frequency: P.get(s.data.planId)?.data.frequency, customerName: C.get(s.data.customerId)?.data.name, plate: V.get(s.data.vehicleId)?.data.plate })));
});

clubRouter.post('/subscriptions', async (req: AuthedRequest, res) => {
  const tenantId = tenantOf(req);
  const b = z.object({ customerId: uuid, vehicleId: uuid, planId: uuid }).parse(req.body);
  const [c, v, p] = [await getRec(pool, tenantId, 'customer', b.customerId), await getRec(pool, tenantId, 'vehicle', b.vehicleId), await getRec(pool, tenantId, 'plan', b.planId)];
  if (!c || !v || !p || v.data.customerId !== c.id || p.data.active === false) throw new HttpError(400, 'Cliente, veículo ou plano inválido.', 'invalido');
  const dup = (await listRecs(pool, tenantId, 'subscription', { where: `data->>'vehicleId' = $3 AND data->>'status' IN ('ativa','pausada','inadimplente')`, params: [v.id] })).length;
  if (dup) throw new HttpError(409, 'Esse veículo já tem uma assinatura em andamento.', 'duplicado');
  const today = nowLocal().date;
  const price = p.data.prices[v.data.categoryKey] as number;
  const rec = await insertRec(pool, tenantId, 'subscription', { ...b, status: 'ativa', priceCents: price, categoryKey: v.data.categoryKey, startDate: today, nextWashDate: today, nextBillingDate: today, lastWashAt: null });
  res.status(201).json({ id: rec.id, ...rec.data });
});

clubRouter.post('/subscriptions/:id/status', async (req: AuthedRequest, res) => {
  const { status } = z.object({ status: z.enum(['ativa', 'pausada', 'cancelada']) }).parse(req.body);
  const u = await patchRec(pool, tenantOf(req), 'subscription', req.params.id as string, { status });
  if (!u) throw new HttpError(404, 'Assinatura não encontrada.', 'nao_encontrado');
  res.json({ id: u.id, ...u.data });
});

/** Visão do clube: assinantes ativos, receita mensal recorrente e quantos devem lavar nos próximos dias. */
clubRouter.get('/summary', async (req: AuthedRequest, res) => {
  const r = (await rows(pool, `SELECT count(*) FILTER (WHERE data->>'status'='ativa')::int AS ativas, COALESCE(SUM((data->>'priceCents')::int) FILTER (WHERE data->>'status'='ativa'),0)::int AS mrr,
    count(*) FILTER (WHERE data->>'status'='inadimplente')::int AS inadimplentes FROM records WHERE tenant_id=$1 AND kind='subscription'`, [tenantOf(req)]))[0];
  res.json(r);
});

/** Saldo e extrato de cashback de um cliente. */
clubRouter.get('/cashback/:customerId', async (req: AuthedRequest, res) => {
  const tenantId = tenantOf(req);
  const ledger = await listRecs(pool, tenantId, 'cashback', { where: `data->>'customerId' = $3`, params: [req.params.customerId], limit: 200 });
  res.json({ balanceCents: ledger.reduce((a, l) => a + (l.data.deltaCents as number), 0), ledger: ledger.map((l) => ({ id: l.id, createdAt: l.createdAt, ...l.data })) });
});
