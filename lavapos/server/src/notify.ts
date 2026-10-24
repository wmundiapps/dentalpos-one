// Fila de mensagens (WhatsApp, SMS, e-mail). Enfileira respeitando consentimento e lista de bloqueio; o envio roda em flushOutbox.
// Anti-phishing: o texto das mensagens vem de modelos fixos; nomes digitados pelo cliente passam por stripLinks; o único link é o do próprio sistema.
import nodemailer from 'nodemailer';
import { one, rows, pool, type Db } from './db.js';
import { contactHash, signLink } from './secure.js';
import { stripLinks } from './security.js';
import { normalizePhone } from './validators.js';
import { nowLocal } from './time.js';
import type { Settings } from './settings.js';

export type Channel = 'whatsapp' | 'sms' | 'email';
export const appUrl = () => (process.env.APP_URL ?? 'http://localhost:5173').replace(/\/$/, '');

export function render(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => stripLinks(vars[k] ?? ''));
}

export function optoutLink(tenantId: string, contact: string): string {
  const h = contactHash(contact);
  return `${appUrl()}/sair?t=${tenantId}.${h}.${signLink(`${tenantId}.${h}`)}`;
}

export async function isOptedOut(db: Db, tenantId: string, contact: string) {
  return !!(await one(db, 'SELECT 1 FROM optouts WHERE tenant_id = $1 AND contact_hash = $2', [tenantId, contactHash(contact)]));
}

interface Enqueue { tenantId: string; channel: Channel; to: string; subject?: string; body: string; html?: string; topic: string; dedupeKey?: string; scheduledAt?: Date; marketing?: boolean }

/** Mensagens de marketing (WhatsApp/SMS) só saem entre 8h e 21h; fora disso, ficam para as 8h. */
function respectQuietHours(at: Date, channel: Channel, marketing: boolean): Date {
  if (!marketing || channel === 'email') return at;
  const l = nowLocal(at);
  const h = Number(l.time.slice(0, 2));
  if (h >= 8 && h < 21) return at;
  const next = new Date(at);
  const add = h >= 21 ? 24 - h + 8 : 8 - h;
  next.setHours(next.getHours() + add, 0, 0, 0);
  return next;
}

export async function enqueue(db: Db, m: Enqueue): Promise<boolean> {
  const to = m.channel === 'email' ? m.to.trim().toLowerCase() : normalizePhone(m.to);
  if (!to) return false;
  if (await isOptedOut(db, m.tenantId, to)) return false;
  const body = m.marketing ? `${m.body}\n\nPara não receber mais mensagens: ${optoutLink(m.tenantId, to)}` : m.body;
  const at = respectQuietHours(m.scheduledAt ?? new Date(), m.channel, !!m.marketing);
  const r = await db.query(
    `INSERT INTO outbox (tenant_id, channel, to_addr, subject, body, html, topic, dedupe_key, scheduled_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING`, [m.tenantId, m.channel, to, m.subject ?? null, body, m.channel === 'email' ? m.html ?? null : null, m.topic, m.dedupeKey ?? null, at]);
  return (r.rowCount ?? 0) > 0;
}

const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Convite do Cashbacksmart no rodapé das confirmações. Só existe se o link da Cashbacksmart estiver configurado (CASHBACKSMART_URL),
 *  o lava-rápido tiver aderido e deixado o convite ligado. O link passa pelo nosso endereço (anti-phishing) e é contado sem dados pessoais. */
export const cashbacksmartUrl = (): string | null => { try { const u = new URL(process.env.CASHBACKSMART_URL ?? ''); return u.protocol === 'https:' ? u.toString() : null; } catch { return null; } };
export const cashbacksmartLink = (slug: string, origem: string) => `${appUrl()}/api/public/l/${slug}/cashbacksmart?o=${origem}`;
export interface Promo { text: string; html: string }
export function confirmationPromo(slug: string, s: Settings): Promo | null {
  const c = s.loyalty.cashbacksmart;
  if (!cashbacksmartUrl() || !c.enabled || !c.promoInConfirmation || !s.loyalty.enabled) return null;
  const link = cashbacksmartLink(slug, 'confirmacao');
  return {
    text: `💚 Ganhe cashback nas suas lavagens com a Cashbacksmart. Participe: ${link}`,
    html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:22px"><tr><td style="background:linear-gradient(135deg,#0f9d58,#14b8a6);background-color:#0f9d58;border-radius:14px;padding:18px 20px;color:#ffffff;font-family:Arial,Helvetica,sans-serif">
<div style="font-size:12px;letter-spacing:1.5px;font-weight:bold;opacity:.9">💚 CASHBACKSMART</div>
<div style="font-size:19px;font-weight:bold;margin:6px 0 4px">Ganhe dinheiro de volta nas suas lavagens</div>
<div style="font-size:14px;line-height:1.5;opacity:.95;margin-bottom:12px">Participe do programa de cashback e acumule a cada serviço.</div>
<a href="${esc(link)}" style="background:#ffffff;color:#0b6b3a;font-weight:bold;text-decoration:none;padding:11px 20px;border-radius:10px;display:inline-block;font-size:15px">Quero participar →</a></td></tr></table>`,
  };
}

/** E-mail em HTML com o texto da mensagem (escapado) e, se houver, o convite no rodapé. */
function emailHtml(body: string, promo?: Promo | null) {
  const paras = esc(body).split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px;line-height:1.6;font-size:16px">${p.replace(/\n/g, '<br>')}</p>`).join('');
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f3f6fa"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px 10px"><table role="presentation" width="560" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;border:1px solid #dde4ec"><tr><td style="padding:24px;font-family:Arial,Helvetica,sans-serif;color:#0f2238">${paras}${promo?.html ?? ''}<p style="margin:18px 0 0;font-size:12px;color:#5b6b7e">Enviado pelo LavaPos em nome do seu lava-rápido. Nunca pedimos senha por mensagem.</p></td></tr></table></td></tr></table></body></html>`;
}

interface Person { name: string; whatsapp?: string; email?: string }
/** Avisa o cliente pelos canais ligados nas configurações. `ch` = {whatsapp,sms,email}. */
export async function notifyCustomer(db: Db, tenantId: string, ch: Settings['reminders']['readyNotice'], person: Person, topic: string, subject: string, body: string, opts: { dedupe?: string; marketing?: boolean; scheduledAt?: Date; promo?: Promo | null } = {}) {
  let n = 0;
  for (const channel of ['whatsapp', 'sms', 'email'] as Channel[]) {
    if (!ch[channel]) continue;
    const to = channel === 'email' ? person.email : person.whatsapp;
    if (!to) continue;
    const full = opts.promo ? `${body}\n\n${opts.promo.text}` : body;
    if (await enqueue(db, { tenantId, channel, to, subject, body: full, html: channel === 'email' && opts.promo ? emailHtml(body, opts.promo) : undefined, topic, marketing: opts.marketing, scheduledAt: opts.scheduledAt, dedupeKey: opts.dedupe ? `${opts.dedupe}:${channel}` : undefined })) n++;
  }
  return n;
}

let transport: nodemailer.Transporter | null | undefined;
function mailer() {
  if (transport !== undefined) return transport;
  transport = process.env.SMTP_URL ? nodemailer.createTransport(process.env.SMTP_URL) : null;
  return transport;
}

async function deliver(m: { channel: Channel; to_addr: string; subject: string | null; body: string; html?: string | null }): Promise<'enviada' | 'manual'> {
  if (m.channel === 'email') {
    const t = mailer();
    if (!t) return 'manual';
    await t.sendMail({ from: process.env.MAIL_FROM ?? 'LavaPos <nao-responda@lavapos.com.br>', to: m.to_addr, subject: m.subject ?? 'Aviso', text: m.body, ...(m.html ? { html: m.html } : {}) });
    return 'enviada';
  }
  // WhatsApp/SMS: provedor de mensagens plugado por webhook (ex.: Z-API, Twilio, Zenvia). Sem provedor, a equipe envia pelo link wa.me.
  const url = process.env.MESSAGING_WEBHOOK_URL;
  if (!url) return 'manual';
  const resp = await fetch(url, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.MESSAGING_WEBHOOK_TOKEN ?? ''}` },
    body: JSON.stringify({ channel: m.channel, to: m.to_addr, body: m.body }), signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) throw new Error(`provedor respondeu ${resp.status}`);
  return 'enviada';
}

export async function flushOutbox(limit = 100) {
  const due = await rows(pool, `SELECT * FROM outbox WHERE status = 'pendente' AND scheduled_at <= now() ORDER BY scheduled_at LIMIT ${limit} FOR UPDATE SKIP LOCKED`);
  let sent = 0, failed = 0;
  for (const m of due) {
    try {
      const st = await deliver(m as Parameters<typeof deliver>[0]);
      await pool.query('UPDATE outbox SET status = $2, sent_at = CASE WHEN $2 = \'enviada\' THEN now() END WHERE id = $1', [m.id, st]);
      if (st === 'enviada') sent++;
    } catch (e) {
      failed++;
      await pool.query("UPDATE outbox SET status = 'falhou', error = $2 WHERE id = $1", [m.id, (e as Error).message.slice(0, 300)]);
    }
  }
  return { sent, failed, pending: due.length };
}
