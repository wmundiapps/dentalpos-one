// Carteira de crédito dos clientes — painel do salão.
import { db } from '../db.js';
import { HttpError, validate, zonedToUtc, localDate } from '../util.js';
import { auth, audit } from '../auth.js';
import { getIntegration } from '../integrations/store.js';
import * as asaas from '../integrations/asaas.js';
import { createTopup, creditTopup, adjust, reverseSale, getBalance, summary, discountPct, MIN_TOPUP_CENTS, MAX_TOPUP_CENTS, COUNTER_LIMIT_CENTS } from '../wallet.js';

async function dropCharge(salonId, topup) {
  if (!topup.asaas_payment_id) return;
  try { const conf = await getIntegration(salonId, 'asaas'); if (conf?.apiKey) await asaas.deletePayment(conf, topup.asaas_payment_id); } catch { /* já vencido ou removido */ }
}

export default function register(r) {
  r.get('/api/wallet', auth('reception'), async (ctx) => {
    const s = ctx.salon;
    const monthStart = localDate(new Date(), s.timezone).slice(0, 8) + '01';
    const accounts = await db.all(
      `SELECT a.client_id, c.name, c.phone, a.balance_cents, a.updated_at FROM wallet_accounts a JOIN clients c ON c.id = a.client_id
        WHERE a.salon_id = ? ORDER BY a.balance_cents DESC, c.name LIMIT 300`, [s.id]);
    const pending = await db.all(
      `SELECT t.id, t.client_id, c.name AS client_name, t.amount_cents, t.method, t.pix_payload, t.created_at FROM wallet_topups t JOIN clients c ON c.id = t.client_id
        WHERE t.salon_id = ? AND t.status = 'pending' ORDER BY t.created_at DESC LIMIT 100`, [s.id]);
    return {
      enabled: !!s.wallet_enabled, discount_pct: discountPct(s),
      limits: { min_cents: MIN_TOPUP_CENTS, max_cents: MAX_TOPUP_CENTS, counter_cents: COUNTER_LIMIT_CENTS },
      summary: await summary(s, zonedToUtc(monthStart, '00:00', s.timezone)), accounts, pending,
    };
  });

  // Saldo e extrato de um cliente (também usado na comanda para mostrar saldo e desconto).
  r.get('/api/wallet/clients/:id', auth('reception'), async (ctx) => {
    const c = await db.get('SELECT id, name, phone FROM clients WHERE id = ? AND salon_id = ? AND deleted_at IS NULL', [ctx.params.id, ctx.salon.id]);
    if (!c) throw new HttpError(404, 'Cliente não encontrado.');
    const ledger = await db.all(
      'SELECT id, kind, amount_cents, balance_after, note, created_at FROM wallet_ledger WHERE salon_id = ? AND client_id = ? ORDER BY created_at DESC, id LIMIT 100', [ctx.salon.id, c.id]);
    return { client: c, balance_cents: await getBalance(ctx.salon.id, c.id), discount_pct: discountPct(ctx.salon), ledger };
  });

  r.post('/api/wallet/topups', auth('reception'), async (ctx) => {
    const d = validate(ctx.body, { client_id: 'str:1:60', amount_cents: `int:${MIN_TOPUP_CENTS}:${MAX_TOPUP_CENTS}`, method: 'enum:pix,cash,card,pix_manual', cpf_cnpj: 'str?:11:18', send: 'bool?' });
    const out = await createTopup(ctx.salon, ctx.user, { clientId: d.client_id, amountCents: d.amount_cents, method: d.method, cpfCnpj: d.cpf_cnpj, send: !!d.send });
    await audit(ctx, 'wallet_topup', 'wallet_topup', out.id, { cents: d.amount_cents, method: d.method, status: out.status });
    return out;
  });

  // Pix recebido fora do Asaas (ou em teste): só gerente/dono confirma. Se havia cobrança no Asaas, ela é cancelada para não cobrar duas vezes.
  r.post('/api/wallet/topups/:id/confirm', auth('manager'), async (ctx) => {
    const tp = await db.get("SELECT * FROM wallet_topups WHERE id = ? AND salon_id = ? AND status = 'pending'", [ctx.params.id, ctx.salon.id]);
    if (!tp) throw new HttpError(404, 'Recarga pendente não encontrada.');
    const ok = await creditTopup(ctx.salon, tp.id, { userId: ctx.user.id });
    if (ok) await dropCharge(ctx.salon.id, tp);
    await audit(ctx, 'wallet_topup_confirmed', 'wallet_topup', tp.id, { cents: tp.amount_cents });
    return { ok: true, credited: ok };
  });

  r.post('/api/wallet/topups/:id/cancel', auth('reception'), async (ctx) => {
    const tp = await db.get("SELECT * FROM wallet_topups WHERE id = ? AND salon_id = ? AND status = 'pending'", [ctx.params.id, ctx.salon.id]);
    if (!tp) throw new HttpError(404, 'Recarga pendente não encontrada.');
    const claim = await db.run("UPDATE wallet_topups SET status = 'cancelled' WHERE id = ? AND status = 'pending'", [tp.id]);
    if (claim.changes) await dropCharge(ctx.salon.id, tp);
    await audit(ctx, 'wallet_topup_cancelled', 'wallet_topup', tp.id);
    return { ok: true };
  });

  r.post('/api/wallet/adjust', auth('manager'), async (ctx) => {
    const d = validate(ctx.body, { client_id: 'str:1:60', amount_cents: 'int:-1000000:1000000', note: 'str:5:200' });
    const out = await adjust(ctx.salon, ctx.user, { clientId: d.client_id, amountCents: d.amount_cents, note: d.note });
    await audit(ctx, 'wallet_adjust', 'client', d.client_id, { cents: d.amount_cents, note: d.note });
    return out;
  });

  r.post('/api/wallet/sales/:id/reverse', auth('manager'), async (ctx) => {
    const d = validate(ctx.body, { note: 'str?:0:200' });
    const out = await reverseSale(ctx.salon, ctx.params.id, { userId: ctx.user.id, note: d.note });
    await audit(ctx, 'wallet_sale_reversed', 'sale', ctx.params.id, out);
    return { ok: true, ...out };
  });
}
