// Armazena credenciais de integrações por salão, sempre criptografadas (AES-256-GCM).
import { db } from '../db.js';
import { uid, nowIso, json } from '../util.js';
import { encryptSecret, decryptSecret } from '../security.js';

export const KINDS = {
  whatsapp: { label: 'WhatsApp Business (API oficial)', fields: ['phoneNumberId', 'accessToken', 'wabaId', 'templateReminder', 'templateMarketing'], extKey: 'phoneNumberId' },
  facebook: { label: 'Facebook Messenger', fields: ['pageId', 'pageAccessToken'], extKey: 'pageId' },
  instagram: { label: 'Instagram Direct', fields: ['igUserId', 'pageAccessToken'], extKey: 'igUserId' },
  email: { label: 'E-mail (Resend)', fields: ['apiKey', 'from'], extKey: null },
  sms: { label: 'SMS (Twilio)', fields: ['accountSid', 'authToken', 'from'], extKey: null },
  asaas: { label: 'Asaas (cobrança Pix/boleto/cartão)', fields: ['apiKey', 'sandbox', 'webhookToken'], extKey: null },
};

export async function getIntegration(salonId, kind) {
  const row = await db.get('SELECT config_enc, status FROM integrations WHERE salon_id = ? AND kind = ?', [salonId, kind]);
  if (!row) return null;
  try { return { ...json(decryptSecret(row.config_enc), {}), _status: row.status }; } catch { return null; }
}

export async function saveIntegration(salonId, kind, conf) {
  const def = KINDS[kind];
  const clean = {};
  for (const f of def.fields) if (conf[f] !== undefined && conf[f] !== '') clean[f] = String(conf[f]).slice(0, 600);
  const enc = encryptSecret(JSON.stringify(clean));
  const ext = def.extKey ? clean[def.extKey] ?? null : null;
  const existing = await db.get('SELECT id FROM integrations WHERE salon_id = ? AND kind = ?', [salonId, kind]);
  if (existing) {
    await db.run('UPDATE integrations SET config_enc = ?, ext_key = ?, status = ?, updated_at = ? WHERE id = ?', [enc, ext, 'configured', nowIso(), existing.id]);
  } else {
    await db.run('INSERT INTO integrations (id, salon_id, kind, config_enc, ext_key, status, updated_at) VALUES (?,?,?,?,?,?,?)', [uid(), salonId, kind, enc, ext, 'configured', nowIso()]);
  }
}

export async function removeIntegration(salonId, kind) {
  await db.run('DELETE FROM integrations WHERE salon_id = ? AND kind = ?', [salonId, kind]);
}

// Lista sem expor segredos: só diz quais campos estão preenchidos.
export async function listIntegrations(salonId) {
  const out = [];
  for (const [kind, def] of Object.entries(KINDS)) {
    const conf = await getIntegration(salonId, kind);
    out.push({
      kind, label: def.label, fields: def.fields,
      connected: !!conf,
      filled: conf ? def.fields.filter((f) => conf[f]) : [],
      // mostra só os 4 últimos caracteres de identificadores (nunca tokens inteiros)
      hint: conf && def.extKey && conf[def.extKey] ? `…${String(conf[def.extKey]).slice(-4)}` : null,
    });
  }
  return out;
}

// Descobre o salão dono de um identificador externo (ex.: phone_number_id do WhatsApp).
export async function salonByExtKey(kind, extKey) {
  const row = await db.get('SELECT salon_id FROM integrations WHERE kind = ? AND ext_key = ?', [kind, String(extKey)]);
  return row?.salon_id ?? null;
}
