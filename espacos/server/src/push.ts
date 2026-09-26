// Notificações push do aplicativo. Android pelo Firebase Cloud Messaging (API
// HTTP v1) e iPhone direto pelo APNs. Sem as variáveis, a fila é só marcada.
//
// Env:
//   FIREBASE_SERVICE_ACCOUNT  JSON da conta de serviço do Firebase (Android)
//   APNS_KEY                  conteúdo do arquivo .p8 da Apple (iOS)
//   APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID (padrão com.spacehour.app)
//   APNS_SANDBOX=true         para builds de desenvolvimento (TestFlight usa produção)
import http2 from 'node:http2';
import jwt from 'jsonwebtoken';
import { one, pool, rows, withTx } from './db.js';

export interface PushMessage { title: string; body: string; link?: string }
type Result = 'sent' | 'invalid_token' | 'error';

// ───────────── Android (FCM HTTP v1) ─────────────
let fcmAuth: { token: string; exp: number } | undefined;

function serviceAccount(): { project_id: string; client_email: string; private_key: string } | undefined {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return undefined;
  try { return JSON.parse(raw); } catch { console.error('[push] FIREBASE_SERVICE_ACCOUNT não é um JSON válido'); return undefined; }
}

async function fcmAccessToken(sa: NonNullable<ReturnType<typeof serviceAccount>>) {
  if (fcmAuth && fcmAuth.exp > Date.now() + 60_000) return fcmAuth.token;
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }, sa.private_key, { algorithm: 'RS256' });
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }) });
  if (!r.ok) throw new Error(`FCM auth ${r.status}`);
  const data = await r.json() as { access_token: string; expires_in: number };
  fcmAuth = { token: data.access_token, exp: Date.now() + data.expires_in * 1000 };
  return fcmAuth.token;
}

async function sendAndroid(token: string, m: PushMessage): Promise<Result> {
  const sa = serviceAccount();
  if (!sa) return 'error';
  const r = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: 'POST', headers: { Authorization: `Bearer ${await fcmAccessToken(sa)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { token, notification: { title: m.title, body: m.body }, data: m.link ? { link: m.link } : {},
      android: { priority: 'high', notification: { channel_id: 'default' } } } }),
  });
  if (r.ok) return 'sent';
  if (r.status === 404 || r.status === 400) {
    const text = await r.text();
    if (/UNREGISTERED|INVALID_ARGUMENT.*registration|not a valid FCM registration token/i.test(text)) return 'invalid_token';
  }
  return 'error';
}

// ───────────── iPhone (APNs) ─────────────
let apnsJwt: { token: string; at: number } | undefined;

function apnsToken() {
  // A Apple aceita o mesmo token por até 1 h; renovamos a cada 50 min.
  if (apnsJwt && Date.now() - apnsJwt.at < 50 * 60_000) return apnsJwt.token;
  const key = process.env.APNS_KEY!.replace(/\\n/g, '\n');
  const token = jwt.sign({ iss: process.env.APNS_TEAM_ID, iat: Math.floor(Date.now() / 1000) }, key,
    { algorithm: 'ES256', header: { alg: 'ES256', kid: process.env.APNS_KEY_ID! } });
  apnsJwt = { token, at: Date.now() };
  return token;
}

function sendIos(token: string, m: PushMessage): Promise<Result> {
  if (!process.env.APNS_KEY || !process.env.APNS_KEY_ID || !process.env.APNS_TEAM_ID) return Promise.resolve('error');
  const host = process.env.APNS_SANDBOX === 'true' ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com';
  return new Promise((resolve) => {
    const client = http2.connect(host);
    client.on('error', () => resolve('error'));
    const req = client.request({
      ':method': 'POST', ':path': `/3/device/${token}`, authorization: `bearer ${apnsToken()}`,
      'apns-topic': process.env.APNS_BUNDLE_ID ?? 'com.spacehour.app', 'apns-push-type': 'alert', 'apns-priority': '10',
    });
    let status = 0; let body = '';
    req.on('response', (h) => { status = Number(h[':status']); });
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      client.close();
      if (status === 200) resolve('sent');
      else if (status === 410 || /BadDeviceToken|Unregistered|DeviceTokenNotForTopic/.test(body)) resolve('invalid_token');
      else resolve('error');
    });
    req.on('error', () => { client.close(); resolve('error'); });
    req.end(JSON.stringify({ aps: { alert: { title: m.title, body: m.body }, sound: 'default' }, link: m.link }));
  });
}

export const pushConfigured = () => !!(process.env.FIREBASE_SERVICE_ACCOUNT || process.env.APNS_KEY);

/** Envia para todos os aparelhos do usuário; remove tokens que não valem mais. */
export async function pushToUser(userId: string, m: PushMessage) {
  const tokens = await rows<{ token: string; platform: 'android' | 'ios' }>(pool, 'SELECT token, platform FROM push_tokens WHERE user_id = $1', [userId]);
  let sent = 0;
  for (const t of tokens) {
    const r = await (t.platform === 'ios' ? sendIos(t.token, m) : sendAndroid(t.token, m)).catch(() => 'error' as const);
    if (r === 'sent') sent++;
    if (r === 'invalid_token') await pool.query('DELETE FROM push_tokens WHERE token = $1', [t.token]);
  }
  return sent;
}

// Texto da notificação → título curto + corpo.
export function toPush(text: string, link?: string | null): PushMessage {
  const firstLine = text.split('\n')[0].trim();
  const rest = text.slice(text.indexOf('\n') + 1).trim();
  const body = (rest && rest !== text ? rest : firstLine).replace(/\s+/g, ' ');
  return { title: firstLine.length <= 60 ? firstLine : 'SpaceHour', body: body.length > 180 ? `${body.slice(0, 177)}…` : body, link: link ?? undefined };
}

/** Processa a fila de push (rotina periódica e logo após cada ação). Uma instância por vez. */
export async function flushPushQueue(limit = 50) {
  if (!pushConfigured()) {
    await pool.query("UPDATE notifications SET push_status = 'skipped' WHERE push_status = 'pending'");
    return 0;
  }
  return withTx(async (tx) => {
    const got = await one<{ ok: boolean }>(tx, 'SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS ok', ['push-queue']);
    if (!got?.ok) return 0;
    const pending = await rows<{ id: string; user_id: string | null; text: string; link: string | null }>(tx,
      `SELECT id, user_id, text, link FROM notifications WHERE push_status = 'pending' ORDER BY created_at LIMIT $1`, [limit]);
    let sent = 0;
    for (const n of pending) {
      const ok = n.user_id ? await pushToUser(n.user_id, toPush(n.text, n.link)) : 0;
      sent += ok;
      await tx.query('UPDATE notifications SET push_status = $2 WHERE id = $1', [n.id, ok ? 'sent' : 'skipped']);
    }
    return sent;
  });
}
