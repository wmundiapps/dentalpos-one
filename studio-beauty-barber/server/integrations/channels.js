// Provedores de envio: WhatsApp Cloud API (oficial), Messenger/Instagram (Graph API), e-mail (Resend), SMS (Twilio).
// Sem credenciais configuradas, o envio é SIMULADO (status "simulated") para o piloto rodar de ponta a ponta.
import { cfg } from '../config.js';

const T = () => AbortSignal.timeout(12000);
// Modelo de custos: o assinante conecta a PRÓPRIA conta (WhatsApp/SMS/e-mail) e paga os créditos direto à operadora.
// A plataforma nunca envia mensagens de salões com credenciais próprias. Sem credencial: simula (dev/piloto) ou falha (produção).
const sim = (canal) => {
  if (!cfg.simulate) throw new Error(`${canal} não conectado. Conecte a sua conta em Integrações (os créditos são pagos direto à operadora).`);
  return { status: 'simulated', providerId: 'sim_' + Math.random().toString(36).slice(2, 10) };
};

async function graph(path, token, body) {
  const r = await fetch(`https://graph.facebook.com/${cfg.meta.graphVersion}/${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: T(),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error?.message || `Meta HTTP ${r.status}`);
  return d;
}

export async function sendWhatsAppText(conf, to, body) {
  if (!conf?.accessToken || !conf?.phoneNumberId) return sim('WhatsApp');
  const d = await graph(`${conf.phoneNumberId}/messages`, conf.accessToken, {
    messaging_product: 'whatsapp', to, type: 'text', text: { body: body.slice(0, 4096), preview_url: false },
  });
  return { status: 'sent', providerId: d?.messages?.[0]?.id };
}

// Mensagem iniciada pela empresa fora da janela de 24h só pode ser template aprovado pela Meta.
export async function sendWhatsAppTemplate(conf, to, name, vars = [], lang = 'pt_BR') {
  if (!conf?.accessToken || !conf?.phoneNumberId) return sim('WhatsApp');
  const d = await graph(`${conf.phoneNumberId}/messages`, conf.accessToken, {
    messaging_product: 'whatsapp', to, type: 'template',
    template: {
      name, language: { code: lang },
      components: vars.length ? [{ type: 'body', parameters: vars.map((v) => ({ type: 'text', text: String(v).slice(0, 200) })) }] : [],
    },
  });
  return { status: 'sent', providerId: d?.messages?.[0]?.id };
}

export async function sendMessenger(conf, recipientId, body, { instagram = false } = {}) {
  if (!conf?.pageAccessToken) return sim(instagram ? 'Instagram' : 'Facebook');
  const path = instagram ? `${conf.igUserId || 'me'}/messages` : 'me/messages';
  const d = await graph(path, conf.pageAccessToken, {
    recipient: { id: recipientId }, messaging_type: 'RESPONSE', message: { text: body.slice(0, 1000) },
  });
  return { status: 'sent', providerId: d?.message_id };
}

export async function sendEmail(conf, to, subject, body) {
  if (!conf?.apiKey) return sim('E-mail');
  return resend(conf.apiKey, conf.from || cfg.email.from, to, subject, body);
}

// E-mails da própria plataforma (boas-vindas, cobrança da assinatura): usam a chave da WMundi.
export async function sendPlatformEmail(to, subject, body) {
  if (!cfg.email.resendKey) return sim('E-mail da plataforma');
  return resend(cfg.email.resendKey, cfg.email.from, to, subject, body);
}

async function resend(key, from, to, subject, body) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, text: body }),
    signal: T(),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.message || `Resend HTTP ${r.status}`);
  return { status: 'sent', providerId: d.id };
}

export async function sendSms(conf, to, body) {
  const sid = conf?.accountSid, token = conf?.authToken, from = conf?.from;
  if (!sid || !token || !from) return sim('SMS');
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: { authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'), 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: '+' + to.replace(/^\+/, ''), From: from, Body: body.slice(0, 1000) }),
    signal: T(),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.message || `Twilio HTTP ${r.status}`);
  return { status: 'sent', providerId: d.sid };
}
