import { Router } from 'express';
import { z } from 'zod';
import { HttpError, requireAuth, type AuthedRequest } from '../auth.js';
import { buyPlan, cancelPlan, financeOverview, getPixAccount, hostPayoutsOf, myPlans, payHostPayout, refundPreview, setPixAccount } from '../plans.js';
import { autoPixEnabled } from '../pix.js';
import { PLAN_RULES, planQuote } from '../../../shared/rules.js';

export const plansRouter = Router();
const requireAdmin = (req: AuthedRequest) => { if (!req.user!.roles.includes('admin')) throw new HttpError(403, 'forbidden'); };

// Simulação pública (sem login)
plansRouter.get('/plans/quote', (req, res) => {
  const monthly = Number(req.query.monthly ?? 0);
  const months = Number(req.query.months ?? 12);
  res.json({ ...planQuote(monthly, months), rules: PLAN_RULES });
});

plansRouter.get('/me/plans', requireAuth, async (req: AuthedRequest, res) => res.json(await myPlans(req.user!)));

plansRouter.post('/me/plans', requireAuth, async (req: AuthedRequest, res) => {
  const data = z.object({ months: z.number().int(), monthly: z.number().positive(), method: z.enum(['pix', 'card']), acceptTerms: z.literal(true) }).parse(req.body);
  res.status(201).json(await buyPlan(req.user!, data, req.ip));
});

plansRouter.get('/me/plans/:id/refund', requireAuth, async (req: AuthedRequest, res) => res.json(await refundPreview(req.user!, req.params.id)));

plansRouter.post('/me/plans/:id/cancel', requireAuth, async (req: AuthedRequest, res) => {
  z.object({ confirm: z.literal(true) }).parse(req.body);
  res.json(await cancelPlan(req.params.id, { userId: req.user!.id, reason: 'customer' }));
});

// Anfitrião: chave Pix para receber as reservas do plano
plansRouter.get('/me/pix', requireAuth, async (req: AuthedRequest, res) => {
  res.json({ account: (await getPixAccount(req.user!.id)) ?? null, payouts: await hostPayoutsOf(req.user!.id) });
});
plansRouter.put('/me/pix', requireAuth, async (req: AuthedRequest, res) => {
  const data = z.object({ pixKey: z.string().min(5).max(140), holderName: z.string().min(3).max(140), holderTaxId: z.string().max(20) }).parse(req.body);
  res.json(await setPixAccount(req.user!, data));
});

// Equipe: financeiro
plansRouter.get('/admin/finance', requireAuth, async (req: AuthedRequest, res) => { requireAdmin(req); res.json(await financeOverview()); });
plansRouter.post('/admin/host-payouts/:id/pay', requireAuth, async (req: AuthedRequest, res) => {
  requireAdmin(req);
  const { ref } = z.object({ ref: z.string().min(3).max(200).optional() }).parse(req.body);
  if (!ref && !autoPixEnabled()) throw new HttpError(422, 'pix_manual_ref_required');
  res.json(await payHostPayout(req.params.id, ref));
});
