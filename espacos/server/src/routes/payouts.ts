// Conta de recebimento do anfitrião (Mercado Pago, split de pagamento).
import { Router } from 'express';
import { pool } from '../db.js';
import { notify } from '../notify.js';
import { HttpError, requireAuth, type AuthedRequest } from '../auth.js';
import { assertEmailVerified } from '../emailVerification.js';
import { MERCADOPAGO_COUNTRIES } from '../payments/mercadopago.js';
import { z } from 'zod';
import { asaasEnabled, registerAsaasWebhook } from '../payments/asaas.js';
import { asaasStatus, createSubaccount, disconnectAsaas, linkWallet } from '../payments/asaasAccounts.js';
import { accountStatus, authorizeUrl, completeAuthorization, disconnect, marketplaceEnabled, pkceEnabled, redirectUri } from '../payments/mpAccounts.js';

export const payoutsRouter = Router();
const APP_URL = () => process.env.APP_URL ?? 'http://localhost:5173';

payoutsRouter.get('/me/payout-account', requireAuth, async (req: AuthedRequest, res) => {
  // needed: anfitrião de país atendido pelo Mercado Pago precisa conectar a conta (mostra a barra fixa no site);
  // configured: a plataforma já tem as credenciais da aplicação (MP_CLIENT_ID/MP_CLIENT_SECRET)
  const needed = (MERCADOPAGO_COUNTRIES as readonly string[]).includes(req.user!.countryCode);
  const mp = await accountStatus(req.user!.id);
  const asaas = await asaasStatus(req.user!.id);
  res.json({
    required: marketplaceEnabled() || asaasEnabled(), configured: marketplaceEnabled(), needed, provider: 'mercadopago', ...mp,
    // connected: recebe por pelo menos um dos dois
    mercadopago: { enabled: marketplaceEnabled(), ...mp },
    asaas: { enabled: asaasEnabled(), ...asaas },
    anyConnected: mp.connected || asaas.connected,
  });
});

payoutsRouter.post('/me/payout-account/connect', requireAuth, (req: AuthedRequest, res) => {
  assertEmailVerified(req.user!);
  res.json({ url: authorizeUrl(req.user!.id) });
});

// Diagnóstico para a equipe: o que precisa estar igual no painel do Mercado Pago (Suas integrações → aplicação)
payoutsRouter.get('/admin/mp-config', requireAuth, (req: AuthedRequest, res) => {
  if (!req.user!.roles.includes('admin')) throw new HttpError(403, 'forbidden');
  res.json({ configured: marketplaceEnabled(), redirectUri: redirectUri(), pkce: pkceEnabled(), appUrl: APP_URL() });
});

payoutsRouter.delete('/me/payout-account', requireAuth, async (req: AuthedRequest, res) => {
  await disconnect(req.user!.id);
  res.json({ connected: false });
});

// Retorno do Mercado Pago após o anfitrião autorizar
payoutsRouter.get('/mp/oauth/callback', async (req, res) => {
  const { code, state, error } = req.query as Record<string, string | undefined>;
  try {
    if (error || !code || !state) throw new HttpError(400, 'mp_authorization_denied');
    const userId = await completeAuthorization(code, state);
    await notify(pool, { userId }, 'mp_pix_key',
      'Mercado Pago conectado! Falta um detalhe para seus clientes pagarem com Pix: cadastre uma chave Pix na sua conta Mercado Pago.\n\nNo app do Mercado Pago: toque em Pix → Minhas chaves → Cadastrar chave (pode ser CPF, CNPJ, celular ou e-mail). Leva 1 minuto.\n\nSem a chave Pix, o cliente só consegue pagar com cartão.',
      '/anfitriao#receber').catch(() => {});
    res.redirect(`${APP_URL()}/anfitriao?mp=conectado`);
  } catch (e) {
    const code = e instanceof HttpError ? e.code : 'mp_connect_failed';
    console.error('[mp oauth]', (e as Error).message, req.query.error ?? '', req.query.error_description ?? '');
    res.redirect(`${APP_URL()}/anfitriao?mp=erro&motivo=${encodeURIComponent(code)}`);
  }
});

// Asaas: cria a subconta do anfitrião (ele recebe um e-mail do Asaas para criar a senha)
payoutsRouter.post('/me/asaas-account', requireAuth, async (req: AuthedRequest, res) => {
  assertEmailVerified(req.user!);
  const data = z.object({
    taxId: z.string().min(11).max(20), birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    companyType: z.enum(['MEI', 'LIMITED', 'INDIVIDUAL', 'ASSOCIATION']).optional(),
    phone: z.string().min(10).max(20), incomeValue: z.number().positive().max(100000000),
    postalCode: z.string().min(8).max(10), address: z.string().min(2).max(200), addressNumber: z.string().min(1).max(20),
    complement: z.string().max(100).optional(), province: z.string().min(2).max(100),
  }).parse(req.body);
  res.json(await createSubaccount(req.user!, data));
});

// Asaas: anfitrião que já tem conta informa o Wallet ID
payoutsRouter.post('/me/asaas-account/wallet', requireAuth, async (req: AuthedRequest, res) => {
  assertEmailVerified(req.user!);
  const { walletId } = z.object({ walletId: z.string().min(30).max(60) }).parse(req.body);
  res.json(await linkWallet(req.user!.id, walletId));
});

payoutsRouter.delete('/me/asaas-account', requireAuth, async (req: AuthedRequest, res) => {
  await disconnectAsaas(req.user!.id);
  res.json({ connected: false });
});

// Equipe: liga o aviso de pagamentos do Asaas (um clique, depois de colocar ASAAS_API_KEY na Vercel)
payoutsRouter.post('/admin/asaas/setup', requireAuth, async (req: AuthedRequest, res) => {
  if (!req.user!.roles.includes('admin')) throw new HttpError(403, 'forbidden');
  if (!asaasEnabled()) throw new HttpError(503, 'asaas_not_configured');
  const base = process.env.PUBLIC_API_URL ?? process.env.APP_URL ?? 'http://localhost:4000';
  const url = `${base}/api/webhooks/asaas`;
  try {
    await registerAsaasWebhook(url, req.user!.email);
  } catch (e) {
    throw new HttpError(502, 'asaas_rejected', { reason: (e as Error).message });
  }
  res.json({ ok: true, webhookUrl: url });
});
