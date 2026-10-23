/**
 * Envio de push pelo Firebase Cloud Messaging (HTTP v1). Configure FIREBASE_SERVICE_ACCOUNT (JSON da conta de serviço).
 * Sem configuração, não faz nada.
 */
import { SignJWT, importPKCS8 } from 'jose';
import { q } from './db';

let cached: { token: string; exp: number } | null = null;

async function accessToken(sa: { client_email: string; private_key: string }) {
  if (cached && cached.exp > Date.now() + 60000) return cached.token;
  const key = await importPKCS8(sa.private_key, 'RS256');
  const now = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT({ scope: 'https://www.googleapis.com/auth/firebase.messaging' })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(sa.client_email)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const j: any = await r.json();
  cached = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return cached.token;
}

export async function registerPushToken(userId: string, token: string, platform: string) {
  if (!token || token.length > 4096) return;
  const p = ['ios', 'android'].includes(platform) ? platform : 'web';
  await q(
    `insert into push_tokens (token, user_id, platform) values ($1,$2,$3)
     on conflict (token) do update set user_id=excluded.user_id, last_seen_at=now()`,
    [token, userId, p],
  );
}

export async function pushToUser(userId: string, title: string, body: string, url = '/app') {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return 0;
  const sa = JSON.parse(raw);
  const tokens = await q<{ token: string }>('select token from push_tokens where user_id=$1', [userId]);
  if (!tokens.length) return 0;
  const at = await accessToken(sa);
  let sent = 0;
  for (const t of tokens) {
    const r = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: { token: t.token, notification: { title, body }, data: { url } } }),
    });
    if (r.ok) sent++;
    else if (r.status === 404 || r.status === 400) await q('delete from push_tokens where token=$1', [t.token]);
  }
  return sent;
}
