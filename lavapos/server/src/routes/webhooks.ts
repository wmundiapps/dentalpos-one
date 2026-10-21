// Retorno do Asaas: confirma pagamentos (Pix/cartão/boleto).
// O Asaas não assina o corpo da mensagem (não há HMAC): ele envia um token secreto no cabeçalho `asaas-access-token`.
// Por isso a proteção tem 3 camadas, nesta ordem:
//   1) o token é conferido ANTES de ler o corpo (comparação em tempo constante; sem token configurado, tudo é recusado com 401);
//   2) o corpo é validado (zod) e limitado a 100 KB;
//   3) nenhum pagamento vira "pago" só porque a mensagem diz: o servidor pergunta ao Asaas se aquele pagamento existe, está
//      recebido e tem o mesmo valor. Mensagem forjada, adulterada ou repetida não muda nada.
import express, { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { pool, one } from '../db.js';
import { safeEqual } from '../secure.js';
import { HttpError, audit, clientIp, rateLimit } from '../security.js';
import { getPayment, type AsaasPayment } from '../asaas.js';
import { getAsaasCreds } from '../tenant.js';

export const webhooksRouter = Router();

/** Pergunta ao Asaas pelo pagamento, com a chave de quem o criou (lava-rápido ou plataforma). Trocável nos testes. */
export const webhookDeps = {
  async fetchPayment(tenantId: string | null, asaasId: string): Promise<AsaasPayment | null> {
    if (tenantId) { const c = await getAsaasCreds(tenantId); return c ? getPayment(c, asaasId) : null; }
    const key = process.env.PLATFORM_ASAAS_API_KEY;
    return key ? getPayment({ apiKey: key, sandbox: process.env.ASAAS_SANDBOX !== 'false' }, asaasId) : null;
  },
};

const PAID = new Set(['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH']);

function requireWebhookToken(req: Request, _res: Response, next: NextFunction) {
  const expected = process.env.ASAAS_WEBHOOK_TOKEN;
  const got = String(req.headers['asaas-access-token'] ?? '');
  if (!expected || !got || !safeEqual(got, expected)) return next(new HttpError(401, 'Não autorizado.', 'sem_permissao'));
  next();
}

// A ordem importa: limite de uso → token → só então o corpo é lido.
webhooksRouter.post('/asaas', rateLimit('webhook', 300, 60), requireWebhookToken, express.json({ limit: '100kb' }), async (req, res) => {
  const ev = z.object({ event: z.string().max(60), payment: z.object({ id: z.string().max(80), externalReference: z.string().max(200).nullish() }).optional() }).parse(req.body);
  const id = ev.payment?.id;
  if (!id) return void res.json({ ok: true });
  const ref = ev.payment?.externalReference ?? '';
  const ip = clientIp(req);

  if (['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'].includes(ev.event)) {
    if (ref.startsWith('tenant:')) { // mensalidade do próprio LavaPos (conta Asaas da plataforma)
      const tenantId = ref.slice(7);
      if (!/^[0-9a-f-]{36}$/i.test(tenantId)) return void res.json({ ok: true });
      const real = await webhookDeps.fetchPayment(null, id).catch(() => null);
      const t = await one<{ monthly_fee_cents: number }>(pool, 'SELECT monthly_fee_cents FROM tenants WHERE id = $1', [tenantId]);
      if (!real || !t || !PAID.has(real.status) || Math.round(real.value * 100) !== t.monthly_fee_cents) {
        await audit(pool, 'webhook_recusado', { ip, tenantId }, { motivo: 'mensalidade não confere no Asaas', asaasId: id });
        return void res.status(202).json({ ok: false, verified: false });
      }
      await pool.query("UPDATE tenants SET billing_status = 'ativa' WHERE id = $1 AND billing_status <> 'cancelada'", [tenantId]);
      return void res.json({ ok: true });
    }
    const p = await one<{ id: string; tenant_id: string; data: any }>(pool, "SELECT id, tenant_id, data FROM records WHERE kind = 'payment' AND data->>'asaasId' = $1", [id]);
    if (!p) return void res.json({ ok: true }); // pagamento desconhecido: nada a fazer
    if (p.data.status === 'pago') return void res.json({ ok: true }); // já processado (idempotente)
    const real = await webhookDeps.fetchPayment(p.tenant_id, id).catch(() => null);
    if (!real || !PAID.has(real.status) || Math.round(real.value * 100) !== p.data.amountCents) {
      await audit(pool, 'webhook_recusado', { ip, tenantId: p.tenant_id }, { motivo: 'pagamento não confere no Asaas', asaasId: id });
      return void res.status(202).json({ ok: false, verified: false }); // o Asaas tenta de novo; nada foi marcado como pago
    }
    await pool.query(`UPDATE records SET data = data || jsonb_build_object('status','pago','paidAt',to_char(now(),'YYYY-MM-DD"T"HH24:MI:SS"Z"')), updated_at = now() WHERE id = $1 AND data->>'status' <> 'pago'`, [p.id]);
    return void res.json({ ok: true });
  }

  // Eventos que só podem piorar a situação (atraso/estorno): também exigem que o pagamento seja conhecido por nós
  if (ev.event === 'PAYMENT_OVERDUE') {
    if (ref.startsWith('tenant:') && /^[0-9a-f-]{36}$/i.test(ref.slice(7))) { await pool.query("UPDATE tenants SET billing_status = 'inadimplente' WHERE id = $1 AND billing_status = 'ativa'", [ref.slice(7)]); return void res.json({ ok: true }); }
    const p = await one(pool, "SELECT data FROM records WHERE kind = 'payment' AND data->>'asaasId' = $1", [id]);
    if (p?.data.subscriptionId) await pool.query("UPDATE records SET data = data || '{\"status\":\"inadimplente\"}'::jsonb WHERE id = $1 AND kind = 'subscription' AND data->>'status' = 'ativa'", [p.data.subscriptionId]);
  } else if (['PAYMENT_REFUNDED', 'PAYMENT_DELETED'].includes(ev.event)) {
    await pool.query(`UPDATE records SET data = data || '{"status":"estornado"}'::jsonb, updated_at = now() WHERE kind = 'payment' AND data->>'asaasId' = $1`, [id]);
  }
  res.json({ ok: true });
});
