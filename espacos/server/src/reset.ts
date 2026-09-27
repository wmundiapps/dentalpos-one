// Limpeza total dos dados (fase de testes, antes do lançamento): apaga todos os usuários,
// anúncios, reservas, pagamentos registrados, mensagens, fotos e documentos. O aplicativo,
// as tabelas e as migrações continuam; é como começar do zero com o site no ar.
// Protegido: só admin, com senha e frase de confirmação, e só com poucos cadastros.
import { list, del } from '@vercel/blob';
import { one, pool, rows } from './db.js';

export const RESET_MAX_USERS = 50;
export const RESET_PHRASE = 'APAGAR TUDO';

async function deleteBlobPhotos() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return 0;
  let cursor: string | undefined;
  let n = 0;
  do {
    const page = await list({ prefix: 'listings/', cursor, limit: 1000, token });
    if (page.blobs.length) await del(page.blobs.map((b) => b.url), { token });
    n += page.blobs.length;
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return n;
}

export async function resetAllData() {
  const before = await one<{ users: number; listings: number; uploads: number }>(pool,
    `SELECT (SELECT count(*) FROM users)::int AS users, (SELECT count(*) FROM listings)::int AS listings, (SELECT count(*) FROM uploads)::int AS uploads`);
  const blobs = await deleteBlobPhotos();
  // Todas as tabelas de dados, menos o controle de migrações
  const tables = (await rows<{ tablename: string }>(pool,
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migrations'")).map((t) => `"${t.tablename}"`);
  if (tables.length) await pool.query(`TRUNCATE ${tables.join(', ')} RESTART IDENTITY CASCADE`);
  return { users: before!.users, listings: before!.listings, photos: Math.max(before!.uploads, blobs), tables: tables.length };
}
