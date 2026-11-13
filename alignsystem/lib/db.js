// Conexão com o Postgres. Todas as tabelas ficam no schema DATABASE_SCHEMA (padrão "alignsystem").
import postgres from 'postgres';

export const SCHEMA = process.env.DATABASE_SCHEMA || 'alignsystem';
if (!/^[a-z_][a-z0-9_]*$/.test(SCHEMA)) throw new Error('DATABASE_SCHEMA inválido');

let client;

// DATABASE_URL tem prioridade. Da integração Neon da Vercel usamos a conexão direta (sem pooler),
// porque o pooler ignora o search_path enviado na conexão.
export const databaseUrl = () =>
  process.env.DATABASE_URL || process.env.NEON_DATABASE_URL_UNPOOLED || process.env.NEON_DATABASE_URL || '';

export function db() {
  if (!client) {
    const url = databaseUrl();
    if (!url) throw new Error('DATABASE_URL não configurada');
    const local = /localhost|127\.0\.0\.1/.test(url);
    client = postgres(url, {
      // pooler do Supabase em modo transação não aceita prepared statements
      prepare: false,
      max: Number(process.env.DATABASE_POOL_SIZE || 3),
      idle_timeout: 20,
      connect_timeout: 15,
      ssl: local ? false : 'require',
      connection: { search_path: SCHEMA },
      transform: { undefined: null },
      onnotice: () => {},
    });
  }
  return client;
}

export async function logEvent(sql, { caseId = null, dentistId = null, actor, type, data = {} }) {
  await sql`insert into events (case_id, dentist_id, actor, type, data)
            values (${caseId}, ${dentistId}, ${actor}, ${type}, ${sql.json(data)})`;
}
