// Contas Mercado Pago dos anfitriões (OAuth do marketplace). O anfitrião
// autoriza a aplicação SpaceHour; guardamos o token dele cifrado e criamos os
// pagamentos em nome dele, com a comissão da plataforma em marketplace_fee.
// Env: MP_CLIENT_ID, MP_CLIENT_SECRET (credenciais de produção da aplicação).
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { one, pool, rows } from '../db.js';
import { HttpError } from '../auth.js';
import { decryptText, encryptText } from '../secure.js';
import { PaymentProviderError } from './gateway.js';

const API = 'https://api.mercadopago.com';
const AUTH = 'https://auth.mercadopago.com.br/authorization';

type Fetch = typeof fetch;
let http: Fetch = (...a) => fetch(...a);
/** Para testes: substitui as chamadas HTTP ao Mercado Pago. */
export function setMpHttp(fn?: Fetch) { http = fn ?? ((...a) => fetch(...a)); }

/** Split ligado quando a aplicação tem credenciais OAuth. */
export const marketplaceEnabled = () => !!(process.env.MP_CLIENT_ID && process.env.MP_CLIENT_SECRET);

const redirectUri = () => `${process.env.PUBLIC_API_URL ?? process.env.APP_URL ?? 'http://localhost:4000'}/api/mp/oauth/callback`;
const stateSecret = () => process.env.JWT_SECRET ?? 'dev-secret-change-me';

export function authorizeUrl(userId: string) {
  if (!marketplaceEnabled()) throw new HttpError(503, 'marketplace_not_configured');
  const state = jwt.sign({ sub: userId, n: crypto.randomBytes(8).toString('hex') }, stateSecret(), { expiresIn: '30m' });
  const q = new URLSearchParams({ client_id: process.env.MP_CLIENT_ID!, response_type: 'code', platform_id: 'mp', state, redirect_uri: redirectUri() });
  return `${AUTH}?${q}`;
}

interface TokenResponse { access_token: string; refresh_token: string; expires_in: number; user_id: number | string; public_key?: string; live_mode?: boolean }

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await http(`${API}/oauth/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: process.env.MP_CLIENT_ID, client_secret: process.env.MP_CLIENT_SECRET, ...body }),
  });
  const data = (await res.json().catch(() => ({}))) as TokenResponse & { message?: string };
  if (!res.ok || !data.access_token) throw new PaymentProviderError('mercadopago', `oauth ${res.status} ${data.message ?? ''}`.trim());
  return data;
}

async function save(userId: string, t: TokenResponse) {
  const expires = new Date(Date.now() + (t.expires_in ?? 15552000) * 1000);
  await pool.query(
    `INSERT INTO mp_accounts (user_id, mp_user_id, access_token_enc, refresh_token_enc, public_key, live_mode, expires_at, connected_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,now(),now())
     ON CONFLICT (user_id) DO UPDATE SET mp_user_id=EXCLUDED.mp_user_id, access_token_enc=EXCLUDED.access_token_enc,
       refresh_token_enc=EXCLUDED.refresh_token_enc, public_key=EXCLUDED.public_key, live_mode=EXCLUDED.live_mode,
       expires_at=EXCLUDED.expires_at, updated_at=now()`,
    [userId, String(t.user_id), encryptText(t.access_token), encryptText(t.refresh_token), t.public_key ?? null, t.live_mode ?? true, expires]);
}

/** Retorno do OAuth: troca o código pelo token do anfitrião. */
export async function completeAuthorization(code: string, state: string): Promise<string> {
  let userId: string;
  try { userId = (jwt.verify(state, stateSecret()) as { sub: string }).sub; } catch { throw new HttpError(400, 'invalid_state'); }
  const t = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri() });
  // uma conta Mercado Pago não pode ficar ligada a dois anfitriões
  const other = await one<{ user_id: string }>(pool, 'SELECT user_id FROM mp_accounts WHERE mp_user_id = $1 AND user_id <> $2', [String(t.user_id), userId]);
  if (other) throw new HttpError(409, 'mp_account_in_use');
  await save(userId, t);
  return userId;
}

export async function accountStatus(userId: string) {
  const a = await one<{ mp_user_id: string; connected_at: Date; live_mode: boolean }>(pool,
    'SELECT mp_user_id, connected_at, live_mode FROM mp_accounts WHERE user_id = $1', [userId]);
  return a ? { connected: true, mpUserId: a.mp_user_id, connectedAt: a.connected_at.toISOString(), liveMode: a.live_mode } : { connected: false };
}

export async function disconnect(userId: string) {
  await pool.query('DELETE FROM mp_accounts WHERE user_id = $1', [userId]);
}

export async function connectedHostIds(hostIds: string[]): Promise<Set<string>> {
  if (!hostIds.length) return new Set();
  return new Set((await rows<{ user_id: string }>(pool, 'SELECT user_id FROM mp_accounts WHERE user_id = ANY($1)', [hostIds])).map((r) => r.user_id));
}

async function refresh(userId: string, refreshTokenEnc: Buffer) {
  const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: decryptText(refreshTokenEnc) });
  await save(userId, t);
  return t.access_token;
}

/** Token do anfitrião (vendedor) pelo id do usuário na plataforma ou pelo id da conta no Mercado Pago. */
export async function sellerToken(by: { userId?: string; mpUserId?: string }): Promise<{ token: string; mpUserId: string } | undefined> {
  const a = await one<{ user_id: string; mp_user_id: string; access_token_enc: Buffer; refresh_token_enc: Buffer; expires_at: Date }>(pool,
    by.userId ? 'SELECT * FROM mp_accounts WHERE user_id = $1' : 'SELECT * FROM mp_accounts WHERE mp_user_id = $1', [by.userId ?? by.mpUserId]);
  if (!a) return undefined;
  const token = a.expires_at.getTime() < Date.now() + 86400000 ? await refresh(a.user_id, a.refresh_token_enc) : decryptText(a.access_token_enc);
  return { token, mpUserId: a.mp_user_id };
}

/** Renova tokens que vencem nos próximos 30 dias (rotina periódica). */
export async function refreshExpiringTokens(limit = 20) {
  const due = await rows<{ user_id: string; refresh_token_enc: Buffer }>(pool,
    "SELECT user_id, refresh_token_enc FROM mp_accounts WHERE expires_at < now() + interval '30 days' ORDER BY expires_at LIMIT $1", [limit]);
  for (const a of due) await refresh(a.user_id, a.refresh_token_enc).catch((e) => console.error('[mp oauth refresh]', (e as Error).message));
  return due.length;
}
