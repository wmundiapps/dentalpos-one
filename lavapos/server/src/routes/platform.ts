// Painel da plataforma (WMundi): lava-rápidos cadastrados, testes grátis, mensalidades e comissão de 10%.
import { Router } from 'express';
import { z } from 'zod';
import { pool, rows } from '../db.js';
import { HttpError, audit, clientIp } from '../security.js';
import type { AuthedRequest } from '../auth.js';
import { nowLocal } from '../time.js';

export const platformRouter = Router();

platformRouter.get('/tenants', async (req: AuthedRequest, res) => {
  const month = nowLocal().date.slice(0, 7);
  res.json(await rows(pool, `SELECT t.id, t.name, t.slug, t.owner_name AS "ownerName", t.email, t.phone, t.billing_status AS "billingStatus", t.trial_ends_at AS "trialEndsAt", t.monthly_fee_cents AS "monthlyFeeCents", t.created_at AS "createdAt",
      COALESCE(SUM((r.data->>'amountCents')::int) FILTER (WHERE r.data->>'status'='pago'),0)::int AS "gmvMonthCents",
      COALESCE(SUM((r.data->>'platformFeeCents')::int) FILTER (WHERE r.data->>'status'='pago'),0)::int AS "feeMonthCents",
      COALESCE(SUM((r.data->>'platformFeeCents')::int) FILTER (WHERE r.data->>'status'='pago' AND r.data->>'feeMode'='a_repassar'),0)::int AS "feeToCollectCents"
    FROM tenants t LEFT JOIN records r ON r.tenant_id = t.id AND r.kind = 'payment' AND COALESCE(r.data->>'paidAt','') LIKE $1
    GROUP BY t.id ORDER BY t.created_at DESC LIMIT 2000`, [month + '%']));
});

platformRouter.post('/tenants/:id/billing', async (req: AuthedRequest, res) => {
  const { status } = z.object({ status: z.enum(['trial', 'ativa', 'inadimplente', 'cancelada']) }).parse(req.body);
  const r = await pool.query('UPDATE tenants SET billing_status = $2 WHERE id = $1', [req.params.id, status]).catch(() => null);
  if (!r?.rowCount) throw new HttpError(404, 'Não encontrado.', 'nao_encontrado');
  await audit(pool, 'plataforma_status', { userId: req.user!.id, ip: clientIp(req), tenantId: req.params.id as string }, { status });
  res.json({ ok: true });
});

platformRouter.get('/audit', async (_req, res) => res.json(await rows(pool, 'SELECT id, tenant_id AS "tenantId", user_id AS "userId", action, detail, ip, created_at AS "createdAt" FROM audit_log ORDER BY id DESC LIMIT 300')));

/** Lava-rápidos que pediram para participar do Cashbacksmart (para a equipe acompanhar a adesão). */
platformRouter.get('/cashbacksmart', async (_req, res) => {
  res.json(await rows(pool, `SELECT r.created_at AS "createdAt", r.data->>'lavacar' AS lavacar, r.data->>'responsavel' AS responsavel, r.data->>'email' AS email, r.data->>'telefone' AS telefone, r.data->>'status' AS status,
    (SELECT count(*)::int FROM records c WHERE c.tenant_id = r.tenant_id AND c.kind = 'cashbacksmartClick') AS cliques
    FROM records r WHERE r.kind = 'cashbacksmartLead' ORDER BY r.created_at DESC LIMIT 1000`));
});
