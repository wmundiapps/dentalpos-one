// Despacho único de mensagens: aplica anti-phishing, opt-out, janela de 24h do WhatsApp e registra no histórico.
import { db } from './db.js';
import { uid, nowIso, json } from './util.js';
import { assertSafeOutbound } from './security.js';
import { getIntegration } from './integrations/store.js';
import { sendWhatsAppText, sendWhatsAppTemplate, sendMessenger, sendEmail, sendSms } from './integrations/channels.js';

export const CHANNELS = ['whatsapp', 'instagram', 'facebook', 'email', 'sms', 'web'];

export async function ensureConversation(salonId, channel, externalId, { name = null, clientId = null, leadId = null } = {}) {
  let c = await db.get('SELECT * FROM conversations WHERE salon_id = ? AND channel = ? AND external_id = ?', [salonId, channel, externalId]);
  if (c) {
    if ((clientId && !c.client_id) || (leadId && !c.lead_id) || (name && !c.display_name)) {
      await db.run('UPDATE conversations SET client_id = COALESCE(client_id, ?), lead_id = COALESCE(lead_id, ?), display_name = COALESCE(display_name, ?) WHERE id = ?',
        [clientId, leadId, name, c.id]);
      c = await db.get('SELECT * FROM conversations WHERE id = ?', [c.id]);
    }
    return c;
  }
  const id = uid();
  await db.run(
    `INSERT INTO conversations (id, salon_id, channel, external_id, display_name, client_id, lead_id, mode, status, unread, flagged, created_at, last_message_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, salonId, channel, externalId, name, clientId, leadId, 'bot', 'open', 0, 0, nowIso(), nowIso()]);
  return db.get('SELECT * FROM conversations WHERE id = ?', [id]);
}

export async function storeMessage(salonId, conversationId, { direction, sender, body, status = 'sent', providerId = null, error = null }) {
  const id = uid();
  await db.run(
    `INSERT INTO messages (id, salon_id, conversation_id, direction, sender, body, status, provider_id, error, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [id, salonId, conversationId, direction, sender, body.slice(0, 4000), status, providerId, error, nowIso()]);
  await db.run('UPDATE conversations SET last_message_at = ? WHERE id = ?', [nowIso(), conversationId]);
  return id;
}

export async function isOptedOut(salonId, channel, address) {
  const r = await db.get('SELECT 1 AS x FROM optouts WHERE salon_id = ? AND channel = ? AND address = ?', [salonId, channel, address]);
  return !!r;
}

export async function addOptOut(salonId, channel, address) {
  await db.run('INSERT INTO optouts (id, salon_id, channel, address, created_at) VALUES (?,?,?,?,?) ON CONFLICT (salon_id, channel, address) DO NOTHING',
    [uid(), salonId, channel, address, nowIso()]);
}

export function allowedDomains(salon) {
  return String(salon.allowed_domains || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

/**
 * kind: 'reply' (resposta dentro de conversa iniciada pelo cliente) | 'transactional' (lembrete) | 'marketing' (campanha)
 * Retorna { status: 'sent'|'simulated'|'failed'|'blocked', providerId?, error? } — nunca lança por falha de provedor.
 */
export async function sendOut(salon, { channel, to, body, subject = null, kind = 'reply', conversation = null, sender = 'bot', templateVars = [] }) {
  try {
    assertSafeOutbound(body, allowedDomains(salon));
  } catch (e) {
    if (conversation) await storeMessage(salon.id, conversation.id, { direction: 'out', sender, body, status: 'blocked', error: e.message });
    return { status: 'blocked', error: e.message };
  }
  if (kind !== 'reply' && (await isOptedOut(salon.id, channel, to))) {
    return { status: 'blocked', error: 'Contato pediu para não receber mensagens (opt-out).' };
  }

  let result;
  try {
    if (channel === 'whatsapp') {
      const conf = await getIntegration(salon.id, 'whatsapp');
      const inWindow = kind === 'reply' || (conversation?.last_inbound_at && Date.now() - Date.parse(conversation.last_inbound_at) < 24 * 3600_000);
      if (!conf || inWindow) result = await sendWhatsAppText(conf, to, body);
      else {
        const tpl = kind === 'marketing' ? conf.templateMarketing : conf.templateReminder;
        if (!tpl) throw new Error('Fora da janela de 24h do WhatsApp: cadastre um template aprovado pela Meta em Integrações.');
        result = await sendWhatsAppTemplate(conf, to, tpl, templateVars.length ? templateVars : [body]);
      }
    } else if (channel === 'facebook' || channel === 'instagram') {
      const conf = await getIntegration(salon.id, channel);
      result = await sendMessenger(conf, to, body, { instagram: channel === 'instagram' });
    } else if (channel === 'email') {
      result = await sendEmail(await getIntegration(salon.id, 'email'), to, subject || `Mensagem de ${salon.name}`, body);
    } else if (channel === 'sms') {
      result = await sendSms(await getIntegration(salon.id, 'sms'), to, body);
    } else if (channel === 'web') {
      result = { status: 'sent', providerId: null };
    } else {
      throw new Error(`Canal desconhecido: ${channel}`);
    }
  } catch (e) {
    result = { status: 'failed', error: String(e.message || e).slice(0, 300) };
  }
  if (conversation) {
    await storeMessage(salon.id, conversation.id, { direction: 'out', sender, body, status: result.status, providerId: result.providerId, error: result.error });
  }
  return result;
}

export const parseState = (conv) => json(conv?.state_json, {});
export async function saveState(convId, state) {
  await db.run('UPDATE conversations SET state_json = ? WHERE id = ?', [JSON.stringify(state ?? {}), convId]);
}
