// Conta de recebimento do anfitrião (Mercado Pago, split de pagamento).
import { Router } from 'express';
import { HttpError, requireAuth, type AuthedRequest } from '../auth.js';
import { accountStatus, authorizeUrl, completeAuthorization, disconnect, marketplaceEnabled } from '../payments/mpAccounts.js';

export const payoutsRouter = Router();
const APP_URL = () => process.env.APP_URL ?? 'http://localhost:5173';

payoutsRouter.get('/me/payout-account', requireAuth, async (req: AuthedRequest, res) => {
  res.json({ required: marketplaceEnabled(), provider: 'mercadopago', ...(await accountStatus(req.user!.id)) });
});

payoutsRouter.post('/me/payout-account/connect', requireAuth, (req: AuthedRequest, res) => {
  res.json({ url: authorizeUrl(req.user!.id) });
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
    await completeAuthorization(code, state);
    res.redirect(`${APP_URL()}/anfitriao?mp=conectado`);
  } catch (e) {
    const code = e instanceof HttpError ? e.code : 'mp_connect_failed';
    console.error('[mp oauth]', (e as Error).message);
    res.redirect(`${APP_URL()}/anfitriao?mp=erro&motivo=${encodeURIComponent(code)}`);
  }
});
