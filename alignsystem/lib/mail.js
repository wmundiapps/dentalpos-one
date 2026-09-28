// Envio de e-mail: SMTP (nodemailer) ou Resend. Sem configuração, apenas registra no log.
import nodemailer from 'nodemailer';
import { escapeHtml, appUrl } from './util.js';

let transport;

function from() {
  return process.env.MAIL_FROM || 'AlignSystem <contato@alignsystem.com.br>';
}

export const notifyAddress = () => process.env.NOTIFY_EMAIL || process.env.PUBLIC_CONTACT_EMAIL || 'contato@alignsystem.com.br';

export function layout(title, bodyHtml) {
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#FAF6EF;font-family:Inter,Arial,sans-serif;color:#12233A">
<div style="max-width:560px;margin:0 auto;padding:28px 20px">
<div style="font-family:Georgia,serif;font-size:22px;font-weight:600;margin-bottom:18px">Align<span style="color:#157A6E">System</span></div>
<div style="background:#fff;border:1px solid #E1D8C5;border-radius:14px;padding:24px">
<h1 style="font-family:Georgia,serif;font-size:20px;margin:0 0 14px">${escapeHtml(title)}</h1>
${bodyHtml}
</div>
<p style="font-size:12px;color:#7a8595;margin-top:18px">AlignSystem · ${escapeHtml(appUrl().replace(/^https?:\/\//, ''))}</p>
</div></body></html>`;
}

export const button = (href, label) =>
  `<p style="margin:22px 0"><a href="${escapeHtml(href)}" style="background:#C98A2C;color:#2A1B04;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:999px;display:inline-block">${escapeHtml(label)}</a></p>`;

export const para = (t) => `<p style="font-size:15px;line-height:1.55;margin:0 0 12px">${escapeHtml(t)}</p>`;

export function table(rows) {
  return `<table style="font-size:14px;border-collapse:collapse;width:100%">${rows
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `<tr><td style="padding:6px 10px 6px 0;color:#5b6676;vertical-align:top;white-space:nowrap">${escapeHtml(k)}</td><td style="padding:6px 0">${escapeHtml(v)}</td></tr>`)
    .join('')}</table>`;
}

export async function sendMail({ to, subject, html, replyTo }) {
  if (!to) return { skipped: true };
  try {
    if (process.env.SMTP_HOST) {
      transport ||= nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 465),
        secure: String(process.env.SMTP_SECURE ?? 'true') !== 'false',
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      });
      await transport.sendMail({ from: from(), to, subject, html, replyTo: replyTo || process.env.PUBLIC_SUPPORT_EMAIL });
      return { sent: true };
    }
    if (process.env.RESEND_API_KEY) {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: from(), to: [].concat(to), subject, html, reply_to: replyTo || process.env.PUBLIC_SUPPORT_EMAIL || undefined }),
      });
      if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
      return { sent: true };
    }
    console.log('[mail] sem SMTP/Resend configurado — e-mail não enviado:', subject, '→', to);
    return { skipped: true };
  } catch (e) {
    // Falha de e-mail nunca derruba o fluxo principal
    console.error('[mail] falha ao enviar', subject, e.message);
    return { error: e.message };
  }
}
