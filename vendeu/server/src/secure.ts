// Criptografia em repouso (AES-256-GCM) e hashes com pepper. Chaves só em variáveis de ambiente.
import crypto from 'node:crypto';

const MAGIC = Buffer.from('VND1'); // MAGIC | iv (12) | tag (16) | conteúdo

function key(): Buffer {
  const raw = process.env.DOCUMENT_ENCRYPTION_KEY;
  if (raw) {
    const k = Buffer.from(raw, 'base64');
    if (k.length !== 32) throw new Error('DOCUMENT_ENCRYPTION_KEY deve ter 32 bytes em base64 (openssl rand -base64 32)');
    return k;
  }
  if (process.env.NODE_ENV === 'production') throw new Error('DOCUMENT_ENCRYPTION_KEY ausente');
  return crypto.createHash('sha256').update('vendeu-dev-only-document-key').digest(); // só desenvolvimento/testes
}

export function encryptBuffer(plain: Buffer): Buffer {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([MAGIC, iv, c.getAuthTag(), body]);
}
export function decryptBuffer(data: Buffer): Buffer {
  if (data.length < 33 || !data.subarray(0, 4).equals(MAGIC)) throw new Error('conteúdo não cifrado');
  const d = crypto.createDecipheriv('aes-256-gcm', key(), data.subarray(4, 16));
  d.setAuthTag(data.subarray(16, 32));
  return Buffer.concat([d.update(data.subarray(32)), d.final()]);
}
export const encryptText = (t: string) => encryptBuffer(Buffer.from(t, 'utf8'));
export const decryptText = (b: Buffer) => decryptBuffer(b).toString('utf8');

function pepper(): string {
  if (process.env.HASH_PEPPER) return process.env.HASH_PEPPER;
  if (process.env.NODE_ENV === 'production') throw new Error('HASH_PEPPER ausente');
  return 'vendeu-dev-only-pepper';
}
/** HMAC determinístico (CPF/CNPJ para checar duplicidade, códigos de verificação, dispositivo). */
export const hmac = (value: string) => crypto.createHmac('sha256', pepper()).update(value).digest('hex');
export const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
