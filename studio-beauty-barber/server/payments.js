// Reserva paga: cobrança antecipada, política de não comparecimento (retenção) e estornos pelo Asaas do próprio salão.
import { db } from './db.js';
import { HttpError, nowIso, localDate, fmtDateTimeBR } from './util.js';
import { getIntegration } from './integrations/store.js';
import * as asaas from './integrations/asaas.js';
import { ensureConversation, sendOut } from './messaging.js';

export const fmtBRL = (cents) => `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;

export function policyText(salon) {
  const pct = salon.noshow_retention_pct ?? 30;
  const h = salon.free_cancel_hours ?? 24;
  return `Para garantir o seu horário, o pagamento é antecipado. Cancelando com pelo menos ${h}h de antecedência, devolvemos 100% do valor. Se você não comparecer sem avisar, retemos ${pct}% do valor pela reserva do horário e devolvemos ${100 - pct}%.`;
}

// Regra pura (testável): quanto devolver e quanto reter.
export function refundAmounts({ paidCents, reason, hoursLeft, retentionPct, freeHours }) {
  if (!paidCents) return { refund: 0, retained: 0 };
  const full = reason === 'cancel' && hoursLeft >= freeHours;
  const retained = full ? 0 : Math.round((paidCents * retentionPct) / 100);
  return { refund: paidCents - retained, retained };
}

export async function chargeConf(salonId) {
  const conf = await getIntegration(salonId, 'asaas');
  if (!conf?.apiKey) throw new HttpError(409, 'Este salão ainda não conectou a conta Asaas para receber pagamentos.');
  return conf;
}

// Cria cliente + cobrança no Asaas do salão e grava a referência no agendamento.
export async function createApptCharge(salon, appt, client, { cpfCnpj, billingType = 'PIX' }) {
  const conf = await chargeConf(salon.id);
  const customer = await asaas.createCustomer(conf, { name: client.name, email: client.email || undefined, cpfCnpj, phone: client.phone });
  const pay = await asaas.createPayment(conf, {
    customer: customer.id, billingType, valueCents: appt.price_cents, dueDate: localDate(new Date(), salon.timezone),
    description: `Reserva em ${salon.name}: ${fmtDateTimeBR(appt.starts_at, salon.timezone)} (não comparecer retém ${salon.noshow_retention_pct}%)`,
    externalReference: `appt:${appt.id}`,
  });
  await db.run("UPDATE appointments SET pay_ref = ?, pay_status = 'pending' WHERE id = ?", [pay.id, appt.id]);
  let pix = null;
  if (billingType === 'PIX') {
    try { const q = await asaas.getPixQr(conf, pay.id); pix = { copy_paste: q.payload, qr_base64: q.encodedImage }; } catch { /* o link da fatura continua valendo */ }
  }
  return { payment_id: pay.id, invoice_url: pay.invoiceUrl, pix };
}

async function notifyClient(salon, appt, body, subject) {
  const c = await db.get('SELECT * FROM clients WHERE id = ?', [appt.client_id]);
  if (!c) return;
  const channel = c.phone ? 'whatsapp' : c.email ? 'email' : null;
  if (!channel) return;
  const to = channel === 'whatsapp' ? c.phone : c.email;
  const conv = channel === 'whatsapp' ? await ensureConversation(salon.id, 'whatsapp', to, { name: c.name, clientId: c.id }) : null;
  await sendOut(salon, { channel, to, body, subject, kind: 'transactional', conversation: conv, sender: 'system', templateVars: [c.name.split(' ')[0]] });
}

// Pagamento confirmado (webhook do Asaas): idempotente.
export async function confirmApptPayment(salon, apptId, paidCents) {
  const r = await db.run(
    "UPDATE appointments SET status = CASE WHEN status = 'pending_payment' THEN 'scheduled' ELSE status END, pay_status = 'paid', paid_cents = ? WHERE id = ? AND salon_id = ? AND pay_status <> 'paid' AND status NOT IN ('cancelled','noshow')",
    [paidCents, apptId, salon.id]);
  if (!r.changes) return false;
  const appt = await db.get('SELECT * FROM appointments WHERE id = ?', [apptId]);
  await notifyClient(salon, appt,
    `Reserva confirmada em ${salon.name}: ${fmtDateTimeBR(appt.starts_at, salon.timezone)}. Pagamento de ${fmtBRL(paidCents)} recebido. Cancelando com ${salon.free_cancel_hours}h de antecedência você recebe 100% de volta; faltar sem avisar retém ${salon.noshow_retention_pct}%.`,
    'Reserva confirmada');
  return true;
}

// Cancelamento ou falta: aplica a política e devolve o que for devido. Retorna { refunded, retained, note }.
export async function settleApptMoney(salon, appt, reason, now = new Date()) {
  const result = { refunded: 0, retained: 0, note: null };
  if (appt.pay_status === 'pending' && appt.pay_ref) {
    try { await asaas.deletePayment(await chargeConf(salon.id), appt.pay_ref); } catch { /* cobrança já vencida ou removida */ }
    await db.run("UPDATE appointments SET pay_status = 'none' WHERE id = ?", [appt.id]);
    return result;
  }
  if (appt.pay_status !== 'paid' || !appt.pay_ref) return result;
  const hoursLeft = (Date.parse(appt.starts_at) - now.getTime()) / 3600_000;
  const { refund, retained } = refundAmounts({
    paidCents: appt.paid_cents, reason, hoursLeft, retentionPct: salon.noshow_retention_pct ?? 30, freeHours: salon.free_cancel_hours ?? 24,
  });
  if (refund > 0) {
    await asaas.refundPayment(await chargeConf(salon.id), appt.pay_ref, {
      valueCents: refund, description: retained ? `Não comparecimento/cancelamento tardio: retido ${salon.noshow_retention_pct}%` : 'Cancelamento dentro do prazo',
    });
  }
  await db.run('UPDATE appointments SET refunded_cents = ?, pay_status = ? WHERE id = ?', [refund, retained ? 'partial_refund' : 'refunded', appt.id]);
  result.refunded = refund; result.retained = retained;
  result.note = retained ? `Retido ${fmtBRL(retained)} e devolvido ${fmtBRL(refund)}.` : `Devolvido ${fmtBRL(refund)}.`;
  await notifyClient(salon, appt, retained
    ? `Sua reserva em ${salon.name} foi encerrada. Conforme a política aceita, retivemos ${fmtBRL(retained)} e devolvemos ${fmtBRL(refund)} ao seu meio de pagamento.`
    : `Sua reserva em ${salon.name} foi cancelada. Devolvemos ${fmtBRL(refund)} ao seu meio de pagamento.`, 'Reserva encerrada');
  return result;
}

// Reservas que ficaram sem pagamento por mais de 15 min liberam o horário.
export async function expirePendingPayments(now = new Date()) {
  const cutoff = new Date(now.getTime() - 15 * 60_000).toISOString();
  const rows = await db.all("SELECT * FROM appointments WHERE status = 'pending_payment' AND club_id IS NULL AND created_at < ?", [cutoff]);
  for (const a of rows) {
    const claim = await db.run("UPDATE appointments SET status = 'cancelled' WHERE id = ? AND status = 'pending_payment'", [a.id]);
    if (claim.changes && a.pay_ref) {
      try { await asaas.deletePayment(await chargeConf(a.salon_id), a.pay_ref); } catch { /* ignora */ }
    }
  }
  return rows.length;
}
