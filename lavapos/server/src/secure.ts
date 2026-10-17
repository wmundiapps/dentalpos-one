// Criptografia em repouso (AES-256-GCM) para dados sensíveis: CPF dos clientes e chaves de cobrança.
// LAVAPOS_ENCRYPTION_KEY: 32 bytes em base64 (`openssl rand -base64 32`). Guarde uma cópia: sem ela os dados cifrados não voltam.
import crypto from 'node:crypto';

function key(): Buffer {
  const raw = process.env.LAVAPOS_ENCRYPTION_KEY;
  if (raw) {
    const k = Buffer.from(raw, 'base64');
    if (k.length !== 32) throw new Error('LAVAPOS_ENCRYPTION_KEY deve ter 32 bytes em base64');
    return k;
  }
  if (process.env.NODE_ENV === 'production') throw new Error('LAVAPOS_ENCRYPTION_KEY ausente');
  return crypto.createHash('sha256').update('lavapos-dev-only-key').digest(); // só desenvolvimento/testes
}

export const hasEncryptionKey = () => !!process.env.LAVAPOS_ENCRYPTION_KEY;

/** Formato: v1.<iv>.<tag>.<conteúdo>, tudo em base64url. */
export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), body.toString('base64url')].join('.');
}

export function decrypt(token: string): string {
  const [v, iv, tag, body] = token.split('.');
  if (v !== 'v1' || !iv || !tag || !body) throw new Error('formato cifrado inválido');
  const d = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(body, 'base64url')), d.final()]).toString('utf8');
}

/** Hash estável de um contato (e-mail/telefone) para lista de bloqueio sem guardar o contato. */
export function contactHash(value: string): string {
  const norm = value.trim().toLowerCase().replace(/[^a-z0-9@.+]/g, '');
  return crypto.createHmac('sha256', key()).update(norm).digest('hex');
}

/** Comparação em tempo constante (tokens de webhook, assinaturas). */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/** Assina "payload" para links (cancelar mensagens, confirmar agendamento) que não podem ser forjados. */
export function signLink(payload: string): string {
  return crypto.createHmac('sha256', key()).update(payload).digest('base64url').slice(0, 32);
}
export const verifyLink = (payload: string, sig: string) => safeEqual(signLink(payload), sig);
