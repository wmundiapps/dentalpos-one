// Envio de e-mails (fila na tabela notifications). SMTP configurável; com a
// hospedagem de e-mail da GoDaddy (Microsoft 365 / Professional Email):
//   SMTP_HOST=smtpout.secureserver.net SMTP_PORT=465 SMTP_SECURE=true
//   SMTP_USER=noreply@space-hour.com SMTP_PASS=...
// Sem SMTP_HOST (desenvolvimento/testes) o e-mail é só registrado no console.
import nodemailer, { type Transporter } from 'nodemailer';
import { one, rows, withTx } from './db.js';

const APP_URL = () => process.env.APP_URL ?? 'http://localhost:5173';
export const MAIL_FROM = () => process.env.MAIL_FROM ?? 'SpaceHour <noreply@space-hour.com>';
export const SUPPORT_EMAIL = () => process.env.SUPPORT_EMAIL ?? 'support@space-hour.com';

export interface OutgoingMail { to: string; subject: string; text: string; html?: string; replyTo?: string; headers?: Record<string, string> }
type Sender = (m: OutgoingMail) => Promise<void>;

let transporter: Transporter | undefined;
let override: Sender | undefined;
/** Para testes: captura os e-mails em vez de enviar. */
export function setMailSender(fn?: Sender) { override = fn; }

function smtpSender(): Sender | undefined {
  if (!process.env.SMTP_HOST) return undefined;
  transporter ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: (process.env.SMTP_SECURE ?? 'true') === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return async (m) => {
    await transporter!.sendMail({ from: MAIL_FROM(), replyTo: m.replyTo ?? SUPPORT_EMAIL(), ...m });
  };
}

// ───────────── Caixa própria de convites (captação) ─────────────
// Convite sai por outra conta (ex.: convites@space-hour.com), nunca pela conta dos e-mails do sistema
// (código, senha, pagamento): se alguém denunciar um convite como spam, os e-mails do sistema continuam chegando.
//   INVITE_SMTP_USER=convites@space-hour.com INVITE_SMTP_PASS=...  (servidor e porta: os mesmos do SMTP_HOST,
//   ou INVITE_SMTP_HOST / INVITE_SMTP_PORT / INVITE_SMTP_SECURE)  INVITE_MAIL_FROM="SpaceHour <convites@space-hour.com>"
let inviteTransporter: Transporter | undefined;
export const INVITE_MAILBOX = () => process.env.INVITE_SMTP_USER?.trim().toLowerCase() || null;
/** null = pronto; senão o motivo de não poder enviar convites. */
export function inviteMailProblem(): string | null {
  if (override) return null;
  const user = INVITE_MAILBOX();
  if (!user || !process.env.INVITE_SMTP_PASS) return 'Falta a caixa de convites (INVITE_SMTP_USER e INVITE_SMTP_PASS).';
  if (!(process.env.INVITE_SMTP_HOST || process.env.SMTP_HOST)) return 'Falta o servidor SMTP (INVITE_SMTP_HOST).';
  if (user === process.env.SMTP_USER?.trim().toLowerCase()) return 'A caixa de convites tem de ser diferente da caixa do sistema (SMTP_USER).';
  return null;
}
export async function sendInviteMail(m: OutgoingMail) {
  if (override) return override(m);
  const problem = inviteMailProblem();
  if (problem) throw new Error(problem);
  inviteTransporter ??= nodemailer.createTransport({
    host: process.env.INVITE_SMTP_HOST || process.env.SMTP_HOST,
    port: Number(process.env.INVITE_SMTP_PORT ?? process.env.SMTP_PORT ?? 465),
    secure: (process.env.INVITE_SMTP_SECURE ?? process.env.SMTP_SECURE ?? 'true') === 'true',
    auth: { user: process.env.INVITE_SMTP_USER!, pass: process.env.INVITE_SMTP_PASS! },
  });
  const from = process.env.INVITE_MAIL_FROM || `SpaceHour <${INVITE_MAILBOX()}>`;
  await inviteTransporter.sendMail({ from, replyTo: m.replyTo ?? INVITE_MAILBOX()!, ...m });
}

/** Testa o login no servidor SMTP sem enviar e-mail (página de diagnóstico). */
let smtpCheck: { at: number; result: string } | undefined;
export async function verifySmtp(): Promise<string> {
  if (!process.env.SMTP_HOST) return 'SMTP_HOST ausente';
  if (smtpCheck && Date.now() - smtpCheck.at < 60000) return smtpCheck.result; // no máximo 1 teste por minuto
  smtpSender(); // cria o transporter
  let result = 'ok';
  try {
    await Promise.race([transporter!.verify(), new Promise((_, rej) => setTimeout(() => rej(new Error('tempo esgotado')), 8000))]);
  } catch (e) {
    result = (e as Error).message.slice(0, 160);
  }
  smtpCheck = { at: Date.now(), result };
  return result;
}

export async function sendMail(m: OutgoingMail): Promise<boolean> {
  const send = override ?? smtpSender();
  if (!send) {
    if (process.env.NODE_ENV !== 'test') console.log(`[email] para=${m.to} :: ${m.subject}`);
    return false;
  }
  await send(m);
  return true;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function renderNotification(text: string, link?: string) {
  const url = link ? (link.startsWith('http') ? link : `${APP_URL()}${link}`) : APP_URL();
  const firstLine = text.split(/[.!?]\s|\n/)[0].slice(0, 90);
  return {
    subject: `SpaceHour — ${firstLine}`,
    text: `${text}\n\n${url}\n\n— SpaceHour · ${SUPPORT_EMAIL()}`,
    html: `<div style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#1f2937">
<h2 style="color:#0f766e;margin:0 0 16px">SpaceHour</h2><p style="font-size:16px;line-height:1.5">${escapeHtml(text).replace(/\n/g, '<br>')}</p>
<p><a href="${escapeHtml(url)}" style="display:inline-block;background:#0f766e;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Abrir / Open</a></p>
<p style="font-size:12px;color:#6b7280">SpaceHour · <a href="mailto:${SUPPORT_EMAIL()}">${SUPPORT_EMAIL()}</a></p></div>`,
  };
}

/** Processa a fila de e-mails pendentes (chamado pela rotina periódica). Uma instância por vez. */
export async function flushEmailQueue(limit = 50) {
  return withTx(async (tx) => {
    const got = await one<{ ok: boolean }>(tx, 'SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS ok', ['email-queue']);
    if (!got?.ok) return 0;
    const pending = await rows<{ id: string; to: string | null; text: string; link: string | null; email_attempts: number }>(tx,
      `SELECT n.id, COALESCE(n.email, u.email) AS to, n.text, n.link, n.email_attempts
       FROM notifications n LEFT JOIN users u ON u.id = n.user_id
       WHERE n.email_status = 'pending' ORDER BY n.created_at LIMIT $1`, [limit]);
    let sent = 0;
    for (const n of pending) {
      if (!n.to) { await tx.query("UPDATE notifications SET email_status = 'skipped' WHERE id = $1", [n.id]); continue; }
      try {
        const ok = await sendMail({ to: n.to, ...renderNotification(n.text, n.link ?? undefined) });
        await tx.query(`UPDATE notifications SET email_status = $2, email_attempts = email_attempts + 1,
          email_sent_at = CASE WHEN $2 = 'sent' THEN now() END, email_error = NULL WHERE id = $1`, [n.id, ok ? 'sent' : 'skipped']);
        if (ok) sent++;
      } catch (e) {
        await tx.query('UPDATE notifications SET email_status = $2, email_attempts = email_attempts + 1, email_error = $3 WHERE id = $1',
          [n.id, n.email_attempts + 1 >= 5 ? 'failed' : 'pending', (e as Error).message.slice(0, 500)]);
      }
    }
    return sent;
  });
}
