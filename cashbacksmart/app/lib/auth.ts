import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { SignJWT, jwtVerify } from 'jose';
import { businessesForUser } from './services/accounts';
import { sessionVersionOf } from './services/security';

const COOKIE = 'ct_session';
const PENDING = 'ct_2fa';
const BIZ = 'ct_biz';
export type Role = 'consumer' | 'business' | 'admin';
export type Session = { userId: string; role: Role };

function key() {
  const s = process.env.AUTH_SECRET;
  if ((!s || s.length < 32) && process.env.NODE_ENV === 'production') throw new Error('AUTH_SECRET ausente ou curto (mínimo 32 caracteres)');
  return new TextEncoder().encode(s || 'dev-secret-change-me');
}
const secure = () => process.env.NODE_ENV === 'production';

export async function createSession(userId: string, role: Role, sessionVersion = 1) {
  const token = await new SignJWT({ role, sv: sessionVersion }).setProtectedHeader({ alg: 'HS256' }).setSubject(userId).setIssuedAt().setExpirationTime('30d').sign(key());
  const c = await cookies();
  c.set(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: secure(), path: '/', maxAge: 30 * 86400 });
  c.delete(PENDING);
}

/** Login com senha certo, aguardando o código de 2 etapas (vale 10 minutos) */
export async function createPending2fa(userId: string) {
  const token = await new SignJWT({ stage: '2fa' }).setProtectedHeader({ alg: 'HS256' }).setSubject(userId).setIssuedAt().setExpirationTime('10m').sign(key());
  (await cookies()).set(PENDING, token, { httpOnly: true, sameSite: 'lax', secure: secure(), path: '/', maxAge: 600 });
}
export async function getPending2fa() {
  const t = (await cookies()).get(PENDING)?.value;
  if (!t) return null;
  try {
    const { payload } = await jwtVerify(t, key());
    return payload.stage === '2fa' ? String(payload.sub) : null;
  } catch {
    return null;
  }
}

export async function destroySession() {
  const c = await cookies();
  c.delete(COOKIE);
  c.delete(BIZ);
  c.delete(PENDING);
}

export async function getSession(): Promise<Session | null> {
  const t = (await cookies()).get(COOKIE)?.value;
  if (!t) return null;
  try {
    const { payload } = await jwtVerify(t, key());
    // senha trocada ou "sair de todos os aparelhos" invalida sessões antigas
    const sv = await sessionVersionOf(String(payload.sub));
    if (sv == null || Number(payload.sv || 1) !== sv) return null;
    return { userId: String(payload.sub), role: payload.role as Role };
  } catch {
    return null;
  }
}

export async function clientMeta() {
  const h = await headers();
  return { ip: (h.get('x-forwarded-for') || h.get('x-real-ip') || '').split(',')[0].trim() || null, ua: h.get('user-agent') };
}

export function homeFor(role: Role) {
  return role === 'consumer' ? '/app' : role === 'business' ? '/painel' : '/admin';
}

export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect('/entrar');
  return s;
}

export async function requireRole(role: Role): Promise<Session> {
  const s = await requireSession();
  if (s.role !== role) redirect(homeFor(s.role));
  return s;
}

/** Empresa selecionada no painel (o usuário pode ter várias) */
export async function requireBusiness() {
  const s = await requireRole('business');
  const list = await businessesForUser(s.userId);
  if (!list.length) redirect('/entrar');
  const chosen = (await cookies()).get(BIZ)?.value;
  const current = list.find((b) => b.id === chosen) || list[0];
  return { session: s, business: current, businesses: list, isOwner: current.role === 'owner' };
}

export async function selectBusiness(id: string) {
  (await cookies()).set(BIZ, id, { httpOnly: true, sameSite: 'lax', secure: secure(), path: '/', maxAge: 365 * 86400 });
}
