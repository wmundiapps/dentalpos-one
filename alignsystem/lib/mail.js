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
<div style="margin-bottom:18px"><img src="${escapeHtml(appUrl())}/assets/logo-email.png" alt="AlignSystem" width="210" style="display:block;height:auto;border:0"></div>
<div style="background:#fff;border:1px solid #E1D8C5;border-radius:14px;padding:24px">
<h1 style="font-family:Georgia,serif;font-size:20px;margin:0 0 14px">${escapeHtml(title)}</h1>
${bodyHtml}
</div>
<p style="font-size:12px;color:#7a8595;margin-top:18px">AlignSystem · ${escapeHtml(appUrl().replace(/^https?:\/\//, ''))}</p>
</div></body></html>`;
}

// Cashbacksmart (app parceiro): CASHBACKSMART_URL=off desliga a divulgação.
export const cashbackUrl = () => {
  const u = (process.env.CASHBACKSMART_URL || 'https://cashbacksmart.com.br').trim();
  return /^https:\/\//i.test(u) ? u.replace(/\/+$/, '') : '';
};

export function cashbackPromo(path = '/cadastro') {
  const base = cashbackUrl();
  if (!base) return '';
  const href = `${base}${path}?origem=alignsystem&utm_source=alignsystem&utm_medium=email&utm_campaign=confirmacao`;
  return `<div style="margin-top:22px;background:#12233A;border-radius:14px;padding:20px 22px;color:#F7F2E8">
<p style="margin:0 0 4px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#E8B65A;font-weight:700">Presente para você</p>
<p style="margin:0 0 8px;font-family:Georgia,serif;font-size:19px;line-height:1.3;color:#fff">💰 Ganhe dinheiro de volta nas suas compras</p>
<p style="margin:0 0 14px;font-size:14px;line-height:1.5;color:#E5DECF">Participe de graça do <b>Cashbacksmart</b> e receba cashback nas lojas parceiras da sua cidade.</p>
<a href="${escapeHtml(href)}" style="background:#E8B65A;color:#1B1408;text-decoration:none;font-weight:700;padding:11px 22px;border-radius:999px;display:inline-block">Quero participar</a>
<p style="margin:12px 0 0;font-size:11px;color:#A9B2BF">Programa independente do seu tratamento odontológico.</p>
</div>`;
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
