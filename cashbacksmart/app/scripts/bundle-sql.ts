/**
 * Junta todas as migrações em um único arquivo para colar no editor SQL do Supabase: npm run bundle-sql
 * O arquivo também registra as migrações em schema_migrations, para o `npm run migrate` não repetir nada depois.
 */
import fs from 'fs';
import path from 'path';

const dir = path.join(process.cwd(), 'db', 'migrations');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
let out = `-- Cashbacksmart: banco completo (${files.length} migrações). Cole no SQL Editor do projeto Supabase CERTO e clique em Run.\n-- Gerado por: npm run bundle-sql. Roda tudo numa transação: se algo falhar, nada fica pela metade.\nbegin;\n\n`;
out += `create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now());\n\n`;
for (const f of files) {
  out += `-- ===== ${f} =====\n${fs.readFileSync(path.join(dir, f), 'utf8').trim()}\n\ninsert into schema_migrations (name) values ('${f}') on conflict do nothing;\n\n`;
}
out += 'commit;\n';
const target = path.join(process.cwd(), 'db', 'cashbacksmart-banco-completo.sql');
fs.writeFileSync(target, out);
console.log(`Gerado: ${target} (${files.join(', ')})`);
