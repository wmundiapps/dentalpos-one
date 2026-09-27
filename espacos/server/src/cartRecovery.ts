// Recuperação de reserva abandonada ("carrinho"): quem abriu a tela de reserva e não
// concluiu, ou criou a reserva e não pagou no checkout, recebe até 2 lembretes por
// e-mail (1 h e 24 h depois). Para quando a pessoa reserva, se descadastra ou o
// anúncio sai do ar. Também lembra, uma vez, quem não confirmou o e-mail.
import crypto from 'node:crypto';
import { id, pool, rows, type Db } from './db.js';
import * as repo from './repo.js';
import { SUPPORT_EMAIL, sendMail } from './mailer.js';
import { sendVerificationEmail } from './emailVerification.js';
import type { Occurrence } from '../../shared/types.js';

const APP_URL = () => process.env.APP_URL ?? 'http://localhost:5173';
const SECRET = () => process.env.JWT_SECRET ?? 'dev-only-secret-change-me';
export const CART_REMINDERS = { firstAfterMinutes: 60, secondAfterHours: 24, max: 2, staleDays: 7 };

// ───────────── Descadastro ─────────────
export const unsubscribeToken = (userId: string) =>
  crypto.createHmac('sha256', SECRET()).update(`unsub:${userId}`).digest('base64url').slice(0, 32);
export const unsubscribeUrl = (userId: string) =>
  `${APP_URL()}/api/email/unsubscribe?u=${encodeURIComponent(userId)}&t=${unsubscribeToken(userId)}`;

export async function unsubscribe(userId: string, t: string) {
  const expected = unsubscribeToken(userId);
  if (t.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(t), Buffer.from(expected))) return false;
  await pool.query('UPDATE users SET email_unsubscribed_at = coalesce(email_unsubscribed_at, now()), marketing_opt_in_at = NULL WHERE id = $1', [userId]);
  return true;
}

// ───────────── Intenções de reserva ─────────────
/** Tela de reserva aberta. Uma nova visita reabre o ciclo de lembretes (no máximo 1 ciclo por semana). */
export async function recordIntent(userId: string, listingId: string, query: string) {
  await pool.query(
    `INSERT INTO checkout_intents (user_id, listing_id, query) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, listing_id) DO UPDATE SET query = $3, updated_at = now(), converted_at = NULL,
       reminders_sent = CASE WHEN checkout_intents.last_reminded_at < now() - interval '7 days' THEN 0 ELSE checkout_intents.reminders_sent END`,
    [userId, listingId, query.slice(0, 2000)]);
}

/** Reserva criada: não lembra mais. */
export async function markConverted(db: Db, userId: string, listingId: string) {
  await db.query('UPDATE checkout_intents SET converted_at = now() WHERE user_id = $1 AND listing_id = $2', [userId, listingId]);
}

/** Checkout expirou sem pagamento: volta a lembrar, com os mesmos horários. */
export async function reopenAfterUnpaid(db: Db, b: { guestId: string; listingId: string; occurrences: Occurrence[]; guests: number }) {
  const query = new URLSearchParams({ o: JSON.stringify(b.occurrences.map(({ date, start, end }) => ({ date, start, end }))), g: String(b.guests) }).toString();
  await db.query(
    `INSERT INTO checkout_intents (user_id, listing_id, query) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, listing_id) DO UPDATE SET query = $3, updated_at = now(), converted_at = NULL`,
    [b.guestId, b.listingId, query]);
}

function parseQuery(query: string): { first?: Occurrence; count: number } {
  try {
    const o = JSON.parse(new URLSearchParams(query).get('o') ?? '[]') as Occurrence[];
    const valid = Array.isArray(o) ? o.filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x?.date) && /^\d{2}:\d{2}$/.test(x?.start) && /^\d{2}:\d{2}$/.test(x?.end)) : [];
    valid.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
    return { first: valid[0], count: valid.length };
  } catch { return { count: 0 }; }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const brDate = (d: string) => d.split('-').reverse().join('/');

export function renderCartReminder(p: { userId: string; name: string; title: string; place: string; query: string; listingId: string; nth: number; today: string }) {
  const { first, count } = parseQuery(p.query);
  const upcoming = first && first.date >= p.today;
  const url = upcoming ? `${APP_URL()}/reservar/${p.listingId}?${p.query}` : `${APP_URL()}/espacos/${p.listingId}`;
  const when = upcoming ? ` para ${brDate(first.date)}, das ${first.start} às ${first.end}${count > 1 ? ` (e mais ${count - 1} data${count > 2 ? 's' : ''})` : ''}` : '';
  const firstName = p.name.split(' ')[0];
  const subject = p.nth === 1
    ? `${firstName}, sua reserva em "${p.title}" ficou pela metade`
    : `Ainda quer reservar "${p.title}"? Os horários podem acabar`;
  const lead = p.nth === 1
    ? `Você começou a reservar <strong>${esc(p.title)}</strong> (${esc(p.place)})${when} e não concluiu.`
    : `Passando para lembrar: <strong>${esc(p.title)}</strong> (${esc(p.place)}) continua esperando por você${when}.`;
  const tail = upcoming
    ? 'O horário só fica garantido depois do pagamento. Conclua agora para não perder.'
    : 'A data escolhida já passou, mas você pode escolher um novo horário.';
  const button = upcoming ? 'Concluir minha reserva' : 'Escolher novo horário';
  const unsub = unsubscribeUrl(p.userId);
  const leadText = lead.replace(/<[^>]+>/g, '');
  return {
    subject,
    text: `Olá, ${firstName}!\n\n${leadText}\n${tail}\n\n${button}: ${url}\n\nDúvidas? Responda este e-mail ou escreva para ${SUPPORT_EMAIL()}.\n\nNão quer mais receber lembretes: ${unsub}\n— SpaceHour`,
    html: `<div style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#1f2937">
<h2 style="color:#0f766e;margin:0 0 16px">SpaceHour</h2>
<p style="font-size:16px;line-height:1.5">Olá, ${esc(firstName)}!<br><br>${lead}<br>${tail}</p>
<p><a href="${esc(url)}" style="display:inline-block;background:#0f766e;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">${button}</a></p>
<p style="font-size:13px;color:#6b7280">Dúvidas? Responda este e-mail ou escreva para <a href="mailto:${SUPPORT_EMAIL()}">${SUPPORT_EMAIL()}</a>.</p>
<p style="font-size:12px;color:#9ca3af">Você recebeu este lembrete porque iniciou uma reserva no SpaceHour. <a href="${esc(unsub)}" style="color:#9ca3af">Não quero mais receber lembretes</a>.</p></div>`,
    headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  };
}

/** Envia os lembretes devidos (rotina periódica). */
export async function sendCartReminders(now = new Date()) {
  const due = await rows<{ user_id: string; listing_id: string; query: string; reminders_sent: number; name: string; email: string; title: string; city: string; state: string | null; neighborhood: string | null; timezone: string }>(pool,
    `SELECT c.user_id, c.listing_id, c.query, c.reminders_sent, u.name, u.email, l.title, l.city, l.state, l.neighborhood, l.timezone
       FROM checkout_intents c JOIN users u ON u.id = c.user_id JOIN listings l ON l.id = c.listing_id
      WHERE c.converted_at IS NULL AND c.reminders_sent < $2
        AND c.updated_at > $1::timestamptz - make_interval(days => $5)
        AND ((c.reminders_sent = 0 AND c.updated_at < $1::timestamptz - make_interval(mins => $3))
          OR (c.reminders_sent > 0 AND c.last_reminded_at < $1::timestamptz - make_interval(hours => $4)))
        AND l.active AND u.deleted_at IS NULL AND NOT u.banned AND u.email_verified_at IS NOT NULL AND u.email_unsubscribed_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.guest_id = c.user_id AND b.listing_id = c.listing_id
                         AND b.created_at > c.updated_at AND b.status <> 'expired')
      ORDER BY c.updated_at LIMIT 50`,
    [now.toISOString(), CART_REMINDERS.max, CART_REMINDERS.firstAfterMinutes, CART_REMINDERS.secondAfterHours, CART_REMINDERS.staleDays]);
  let sent = 0;
  for (const c of due) {
    // Marca antes de enviar: nunca manda o mesmo lembrete duas vezes, mesmo com falha no SMTP
    const claimed = await pool.query(
      `UPDATE checkout_intents SET reminders_sent = reminders_sent + 1, last_reminded_at = $4
        WHERE user_id = $1 AND listing_id = $2 AND reminders_sent = $3 AND converted_at IS NULL`,
      [c.user_id, c.listing_id, c.reminders_sent, now.toISOString()]);
    if (!claimed.rowCount) continue;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: c.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    const place = [c.neighborhood, c.state ? `${c.city} - ${c.state}` : c.city].filter(Boolean).join(', ');
    const mail = renderCartReminder({ userId: c.user_id, name: c.name, title: c.title, place, query: c.query, listingId: c.listing_id, nth: c.reminders_sent + 1, today });
    let status = 'sent'; let error: string | null = null;
    try { if (!(await sendMail({ to: c.email, ...mail }))) status = 'skipped'; else sent++; } catch (e) { status = 'failed'; error = (e as Error).message.slice(0, 500); }
    // Registro (aparece em Admin → Usuários), já com o status: a fila de e-mails não reenvia
    await pool.query(
      `INSERT INTO notifications (id, user_id, kind, text, link, created_at, read, email_status, email_error, email_attempts, email_sent_at)
       VALUES ($1, $2, 'cart_reminder', $3, $4, now(), true, $5, $6, 1, CASE WHEN $5 = 'sent' THEN now() END)`,
      [id('ntf'), c.user_id, mail.subject, `/espacos/${c.listing_id}`, status, error]);
  }
  return sent;
}

/** Um lembrete, 24 h após o cadastro, para quem ainda não confirmou o e-mail. */
export async function sendVerifyReminders(now = new Date()) {
  const due = await rows<{ id: string }>(pool,
    `UPDATE users SET verify_reminder_sent_at = $1 WHERE id IN (
       SELECT id FROM users WHERE email_verified_at IS NULL AND verify_reminder_sent_at IS NULL AND deleted_at IS NULL AND NOT banned
          AND email_unsubscribed_at IS NULL
          AND created_at < $1::timestamptz - interval '24 hours' AND created_at > $1::timestamptz - interval '6 days'
        ORDER BY created_at LIMIT 50)
     RETURNING id`, [now.toISOString()]);
  for (const { id: userId } of due) {
    const u = await repo.getUser(pool, userId);
    if (u) await sendVerificationEmail(u, { reminder: true }).catch((e) => console.error('[email] lembrete de confirmação', (e as Error).message));
  }
  return due.length;
}
