// Webhooks dos provedores de pagamento. Precisam do corpo bruto (assinatura),
// por isso são montados antes do express.json().
import express, { Router } from 'express';
import { pool } from '../db';
import { applyPaymentUpdate } from '../bookings';
import { stripeGateway } from '../payments/stripe';
import { mercadoPagoGateway, mercadoPagoToken, MERCADOPAGO_COUNTRIES } from '../payments/mercadopago';
import type { Gateway } from '../payments';

export const webhooksRouter = Router();
const raw = express.raw({ type: '*/*', limit: '1mb' });

async function handle(provider: string, gateways: Gateway[], req: express.Request, res: express.Response) {
  let parsed: Awaited<ReturnType<Gateway['parseWebhook']>> | undefined;
  let lastError: unknown;
  for (const g of gateways) {
    try {
      parsed = await g.parseWebhook(req.body as Buffer, req.headers, req.query as Record<string, unknown>);
      break;
    } catch (e) {
      lastError = e;
    }
  }
  if (!parsed) {
    console.error(`[webhook ${provider}]`, (lastError as Error)?.message);
    return res.status(400).json({ error: 'invalid_webhook' });
  }
  // Idempotência: cada evento é processado uma única vez
  const fresh = await pool.query('INSERT INTO webhook_events (provider, event_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [provider, parsed.eventId]);
  if (fresh.rowCount) {
    try {
      for (const u of parsed.updates) await applyPaymentUpdate(u);
    } catch (e) {
      // libera o evento para o provedor reenviar
      await pool.query('DELETE FROM webhook_events WHERE provider = $1 AND event_id = $2', [provider, parsed.eventId]);
      throw e;
    }
  }
  res.json({ received: true });
}

webhooksRouter.post('/webhooks/stripe', raw, async (req, res) => {
  if (!process.env.STRIPE_SECRET_KEY) return res.status(404).end();
  await handle('stripe', [stripeGateway(process.env.STRIPE_SECRET_KEY, process.env.STRIPE_WEBHOOK_SECRET)], req, res);
});

webhooksRouter.post('/webhooks/mercadopago', raw, async (req, res) => {
  // Um token por país: tenta cada conta configurada até uma reconhecer o pagamento
  const gateways = MERCADOPAGO_COUNTRIES
    .map((c) => ({ c, token: mercadoPagoToken(c) }))
    .filter((x): x is { c: (typeof MERCADOPAGO_COUNTRIES)[number]; token: string } => !!x.token)
    .map(({ c, token }) => mercadoPagoGateway(c, token, process.env.MP_WEBHOOK_SECRET));
  if (!gateways.length) return res.status(404).end();
  await handle('mercadopago', gateways, req, res);
});
