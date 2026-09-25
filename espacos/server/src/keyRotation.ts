// Rotação da DOCUMENT_ENCRYPTION_KEY: recifra, aos poucos, o que ainda está na
// chave anterior (documentos de registro e tokens Mercado Pago dos anfitriões).
// Roda na rotina periódica enquanto as duas chaves estiverem definidas.
import { pool, rows } from './db.js';
import { keyRotationActive, reencryptIfPrevious } from './secure.js';

export async function rotateDocumentKey(limit = 100) {
  if (!keyRotationActive()) return null;
  let done = 0;
  let remaining = 0;

  // Um documento por vez, para não carregar todos os arquivos na memória
  const docs = await rows<{ id: string }>(pool, 'SELECT id FROM license_verifications WHERE document IS NOT NULL ORDER BY created_at');
  for (const { id } of docs) {
    const [v] = await rows<{ document: Buffer | null }>(pool, 'SELECT document FROM license_verifications WHERE id = $1', [id]);
    if (!v?.document) continue;
    const next = reencryptIfPrevious(v.document);
    if (!next) continue;
    if (done >= limit) { remaining++; continue; }
    await pool.query('UPDATE license_verifications SET document = $2 WHERE id = $1 AND document = $3', [id, next, v.document]);
    done++;
  }

  const accounts = await rows<{ user_id: string; access_token_enc: Buffer; refresh_token_enc: Buffer }>(pool,
    'SELECT user_id, access_token_enc, refresh_token_enc FROM mp_accounts');
  for (const a of accounts) {
    const access = reencryptIfPrevious(a.access_token_enc);
    const refresh = reencryptIfPrevious(a.refresh_token_enc);
    if (!access && !refresh) continue;
    if (done >= limit) { remaining++; continue; }
    await pool.query(
      `UPDATE mp_accounts SET access_token_enc = $2, refresh_token_enc = $3
       WHERE user_id = $1 AND access_token_enc = $4 AND refresh_token_enc = $5`,
      [a.user_id, access ?? a.access_token_enc, refresh ?? a.refresh_token_enc, a.access_token_enc, a.refresh_token_enc]);
    done++;
  }

  console.log(`[rotação de chave] recifrados: ${done}, restantes: ${remaining}`);
  return { done, remaining };
}
