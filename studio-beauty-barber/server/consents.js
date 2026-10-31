// Base central de autorizações de contato. Cada registro prova: quem autorizou, quais canais, qual texto foi mostrado, quando e de onde.
// Serve a LGPD (Brasil) e, por ser por canal e com texto/versão/IP guardados, também a prova de consentimento exigida nos EUA.
import { db } from './db.js';
import { uid, nowIso, normalizePhone, json } from './util.js';

export const CHANNELS = ['whatsapp', 'sms', 'email', 'phone', 'telegram', 'social_ads'];
export const CHANNEL_LABEL = { whatsapp: 'WhatsApp', sms: 'SMS', email: 'E-mail', phone: 'Telefone', telegram: 'Telegram', social_ads: 'Anúncios (Meta, TikTok, LinkedIn)' };

// TEXTO PROVISÓRIO — precisa de aprovação do Robson e revisão da Dra. Roberta antes de uso comercial.
export const CONSENT_TEXT = {
  version: 'v1-2026-10-provisorio',
  pt: 'Autorizo a WMundi Technologies e seus sistemas (Studio Beauty Barber e demais) a entrar em contato comigo pelos canais marcados abaixo, com ofertas, novidades e avisos. Posso retirar a autorização quando quiser, pelo mesmo canal ou pelo e-mail contato@studiobeautybarber.com.',
  en: 'I authorize WMundi Technologies and its systems to contact me through the channels checked below with offers, news and notices, including by automated text message or call. Consent is not a condition of any purchase. I can withdraw it at any time by replying STOP or emailing contato@studiobeautybarber.com.',
};

export const cleanChannels = (c) => {
  const src = Array.isArray(c) ? Object.fromEntries(c.map((x) => [x, true])) : (c && typeof c === 'object' ? c : {});
  return CHANNELS.filter((k) => src[k] === true);
};

// Grava uma autorização. Sem nenhum canal marcado não grava nada (não existe consentimento "em branco").
export async function recordConsent({ company, source, name, phone, email, channels, textVersion, text, lang, ip, userAgent, consentAt }) {
  const ch = cleanChannels(channels);
  if (!ch.length) return null;
  const p = phone ? normalizePhone(phone) : null;
  const mail = email ? String(email).trim().toLowerCase().slice(0, 160) : null;
  if (!p && !mail) return null;
  const id = uid();
  await db.run(
    `INSERT INTO contact_consents (id, company, source, name, phone, email, channels_json, text_version, text_shown, lang, ip, user_agent, consent_at, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, String(company).slice(0, 80), source ? String(source).slice(0, 40) : null, name ? String(name).slice(0, 100) : null, p, mail, JSON.stringify(ch),
      textVersion ? String(textVersion).slice(0, 60) : null, text ? String(text).slice(0, 1500) : null, lang ? String(lang).slice(0, 5) : null,
      ip ?? null, userAgent ? String(userAgent).slice(0, 200) : null, consentAt || nowIso(), nowIso()]);
  return id;
}

const cell = (v) => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return `"${s.replace(/"/g, '""')}"`; };
export function consentsCsv(rows) {
  const head = ['Empresa', 'Nome', 'Telefone', 'WhatsApp (link)', 'E-mail', ...CHANNELS.map((c) => CHANNEL_LABEL[c]), 'Origem', 'Data da autorização', 'Versão do texto', 'IP', 'Revogada em'];
  const lines = rows.map((r) => { const ch = json(r.channels_json, []); return [r.company, r.name, r.phone, r.phone ? `https://wa.me/${r.phone}` : '', r.email, ...CHANNELS.map((c) => (ch.includes(c) ? 'SIM' : '')), r.source, r.consent_at, r.text_version, r.ip, r.revoked_at].map(cell).join(';'); });
  return '﻿' + [head.map(cell).join(';'), ...lines].join('\r\n');
}
