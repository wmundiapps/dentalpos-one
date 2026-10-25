import nodemailer from 'nodemailer';
import { config } from './config.js';

export interface Mail { to: string; subject: string; text: string }
/** Em teste/desenvolvimento sem SMTP, os envios ficam aqui (e no console fora dos testes). */
export const outbox: Mail[] = [];
export const smsOutbox: { to: string; text: string }[] = [];

let transport: nodemailer.Transporter | null = null;
export async function sendMail(m: Mail) {
  if (!config.smtp.host) {
    outbox.push(m);
    if (!config.isTest) console.log(`[e-mail simulado] para ${m.to}: ${m.subject}\n${m.text}\n`);
    return;
  }
  transport ??= nodemailer.createTransport({ host: config.smtp.host, port: config.smtp.port, secure: config.smtp.port === 465, auth: { user: config.smtp.user, pass: config.smtp.pass } });
  await transport.sendMail({ from: config.smtp.from, to: m.to, subject: m.subject, text: `${m.text}\n\n— Vendeu\nNão responda este e-mail. Suporte: suporte@vendeu.app` });
}

/** SMS via Twilio (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM). Sem eles, simulado. */
export async function sendSms(to: string, text: string) {
  const sid = process.env.TWILIO_ACCOUNT_SID, token = process.env.TWILIO_AUTH_TOKEN, from = process.env.TWILIO_FROM;
  if (!sid || !token || !from) {
    smsOutbox.push({ to, text });
    if (!config.isTest) console.log(`[SMS simulado] para +${to}: ${text}`);
    return;
  }
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: `+${to}`, From: from, Body: text }),
  });
  if (!res.ok) throw new Error(`Falha ao enviar SMS (${res.status})`);
}
