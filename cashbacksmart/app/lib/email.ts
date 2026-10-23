import { config } from './config';
import { escapeHtml } from './format';

export type OutMail = { to: string; subject: string; html: string; headers?: Record<string, string> };
export interface MailSender {
  name: string;
  sendBatch(mails: OutMail[]): Promise<{ ok: boolean; id?: string; error?: string }[]>;
}

/** Sem RESEND_API_KEY: só registra no log (útil em desenvolvimento) */
export const logSender: MailSender = {
  name: 'log',
  async sendBatch(mails) {
    for (const m of mails) console.log(`[email] para=${m.to} assunto="${m.subject}"`);
    return mails.map(() => ({ ok: true, id: 'log' }));
  },
};

export function resendSender(apiKey: string, from: string, fetchFn: typeof fetch = fetch): MailSender {
  return {
    name: 'resend',
    async sendBatch(mails) {
      const r = await fetchFn('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(mails.map((m) => ({ from, to: [m.to], subject: m.subject, html: m.html, headers: m.headers }))),
      });
      const body: any = await r.json().catch(() => ({}));
      if (!r.ok) return mails.map(() => ({ ok: false, error: body?.message || `HTTP ${r.status}` }));
      const data: any[] = body?.data || [];
      return mails.map((_, i) => ({ ok: true, id: data[i]?.id }));
    },
  };
}

export function mailSender(): MailSender {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM || `${config.appName} <ofertas@cashbacksmart.com.br>`;
  return key ? resendSender(key, from) : logSender;
}

export function campaignHtml(opts: { businessName: string; city: string; subject: string; body: string; unsubscribeUrl: string; offer?: string | null }) {
  const paragraphs = escapeHtml(opts.body)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;line-height:1.55">${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#EEF3FF;font-family:Arial,Helvetica,sans-serif;color:#1B2A6B">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden">
<tr><td style="background:#1B2A6B;padding:18px 24px;color:#fff;font-size:20px;font-weight:bold">cashback<span style="color:#FFB627">smart</span></td></tr>
<tr><td style="padding:24px">
<p style="margin:0 0 6px;font-size:13px;color:#5A6699">${escapeHtml(opts.businessName)} · ${escapeHtml(opts.city)}</p>
<h1 style="margin:0 0 16px;font-size:22px">${escapeHtml(opts.subject)}</h1>
${paragraphs}
${opts.offer ? `<p style="margin:18px 0 0;padding:14px 16px;background:#E8F7EE;border-radius:12px;color:#0B6B35;font-weight:bold">${escapeHtml(opts.offer)}</p>` : ''}
<p style="margin:22px 0 0"><a href="${config.appUrl}/app" style="display:inline-block;background:#12A150;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:bold">Ver meu saldo</a></p>
</td></tr>
<tr><td style="padding:16px 24px;font-size:12px;color:#7B86B3;border-top:1px solid #E3E8F7">
Você recebe este e-mail porque participa do ${config.appName}. <a href="${opts.unsubscribeUrl}" style="color:#7B86B3">Parar de receber e-mails</a> (as ofertas continuam no app).
</td></tr></table></td></tr></table></body></html>`;
}
