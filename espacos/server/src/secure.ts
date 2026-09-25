// Criptografia de documentos sensíveis em repouso (AES-256-GCM). Mesmo que o
// banco ou um backup vaze, os arquivos ficam ilegíveis sem a chave, que fica
// só nas variáveis de ambiente (DOCUMENT_ENCRYPTION_KEY: 32 bytes em base64,
// gere com `openssl rand -base64 32`).
import crypto from 'node:crypto';

const MAGIC = Buffer.from('SHE1'); // formato: MAGIC | iv (12) | tag (16) | conteúdo cifrado

function parseKey(raw: string, name: string): Buffer {
  const k = Buffer.from(raw, 'base64');
  if (k.length !== 32) throw new Error(`${name} deve ter 32 bytes em base64`);
  return k;
}

// Rotação de chave: com DOCUMENT_ENCRYPTION_KEY_V2 definida, ela passa a ser a
// chave atual e DOCUMENT_ENCRYPTION_KEY vira a anterior (só para ler e
// recifrar). Quando a rotina de rotação indicar "restantes: 0", a anterior
// pode ser removida das variáveis de ambiente.
function keys(): { current: Buffer; previous: Buffer | null } {
  const v2 = process.env.DOCUMENT_ENCRYPTION_KEY_V2;
  const v1 = process.env.DOCUMENT_ENCRYPTION_KEY;
  if (v2) return { current: parseKey(v2, 'DOCUMENT_ENCRYPTION_KEY_V2'), previous: v1 ? parseKey(v1, 'DOCUMENT_ENCRYPTION_KEY') : null };
  if (v1) return { current: parseKey(v1, 'DOCUMENT_ENCRYPTION_KEY'), previous: null };
  if (process.env.NODE_ENV === 'production') throw new Error('DOCUMENT_ENCRYPTION_KEY ausente');
  return { current: crypto.createHash('sha256').update('spacehour-dev-only-document-key').digest(), previous: null }; // só desenvolvimento/testes
}

const key = () => keys().current;

export const hasDocumentKey = () => !!(process.env.DOCUMENT_ENCRYPTION_KEY_V2 || process.env.DOCUMENT_ENCRYPTION_KEY);
export const keyRotationActive = () => !!(process.env.DOCUMENT_ENCRYPTION_KEY_V2 && process.env.DOCUMENT_ENCRYPTION_KEY);

export const isEncrypted = (data: Buffer) => data.length > 32 && data.subarray(0, 4).equals(MAGIC);

export function encryptDocument(plain: Buffer): Buffer {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), body]);
}

function decryptWith(k: Buffer, data: Buffer): Buffer {
  const decipher = crypto.createDecipheriv('aes-256-gcm', k, data.subarray(4, 16));
  decipher.setAuthTag(data.subarray(16, 32));
  return Buffer.concat([decipher.update(data.subarray(32)), decipher.final()]);
}

/** Decifra (documentos antigos, gravados antes da criptografia, passam direto). Durante a rotação, tenta a chave anterior. */
export function decryptDocument(data: Buffer): Buffer {
  if (!isEncrypted(data)) return data;
  const { current, previous } = keys();
  try {
    return decryptWith(current, data);
  } catch (err) {
    if (!previous) throw err;
    return decryptWith(previous, data);
  }
}

/** Rotação: se o dado estava cifrado com a chave anterior, devolve-o recifrado com a atual; senão, null. */
export function reencryptIfPrevious(data: Buffer): Buffer | null {
  if (!isEncrypted(data)) return null;
  const { current, previous } = keys();
  if (!previous) return null;
  try {
    decryptWith(current, data);
    return null;
  } catch {
    return encryptDocument(decryptWith(previous, data));
  }
}

export const encryptText = (text: string) => encryptDocument(Buffer.from(text, 'utf8'));
export const decryptText = (data: Buffer) => decryptDocument(data).toString('utf8');
