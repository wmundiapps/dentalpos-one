// Criptografia de documentos sensíveis em repouso (AES-256-GCM). Mesmo que o
// banco ou um backup vaze, os arquivos ficam ilegíveis sem a chave, que fica
// só nas variáveis de ambiente (DOCUMENT_ENCRYPTION_KEY: 32 bytes em base64,
// gere com `openssl rand -base64 32`).
import crypto from 'node:crypto';

const MAGIC = Buffer.from('SHE1'); // formato: MAGIC | iv (12) | tag (16) | conteúdo cifrado

function key(): Buffer {
  const raw = process.env.DOCUMENT_ENCRYPTION_KEY;
  if (raw) {
    const k = Buffer.from(raw, 'base64');
    if (k.length !== 32) throw new Error('DOCUMENT_ENCRYPTION_KEY deve ter 32 bytes em base64');
    return k;
  }
  if (process.env.NODE_ENV === 'production') throw new Error('DOCUMENT_ENCRYPTION_KEY ausente');
  return crypto.createHash('sha256').update('spacehour-dev-only-document-key').digest(); // só desenvolvimento/testes
}

export const isEncrypted = (data: Buffer) => data.length > 32 && data.subarray(0, 4).equals(MAGIC);

export function encryptDocument(plain: Buffer): Buffer {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), body]);
}

/** Decifra (documentos antigos, gravados antes da criptografia, passam direto). */
export function decryptDocument(data: Buffer): Buffer {
  if (!isEncrypted(data)) return data;
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), data.subarray(4, 16));
  decipher.setAuthTag(data.subarray(16, 32));
  return Buffer.concat([decipher.update(data.subarray(32)), decipher.final()]);
}

export const encryptText = (text: string) => encryptDocument(Buffer.from(text, 'utf8'));
export const decryptText = (data: Buffer) => decryptDocument(data).toString('utf8');
