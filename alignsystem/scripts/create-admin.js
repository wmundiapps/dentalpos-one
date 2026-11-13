// Cria (ou reativa) um administrador e imprime um link para definir a senha.
// Uso: node scripts/create-admin.js email@dominio "Nome"
import { db } from '../lib/db.js';
import { createPasswordToken } from '../lib/auth.js';
import { appUrl } from '../lib/util.js';
import { migrate } from './migrate.js';

const [email, name] = process.argv.slice(2);
if (!email) { console.error('uso: node scripts/create-admin.js email "Nome"'); process.exit(1); }
await migrate();
const sql = db();
const [u] = await sql`insert into users (email, name, role) values (${email.toLowerCase()}, ${name || email}, 'admin')
  on conflict (email) do update set active = true, role = 'admin' returning id`;
const t = await createPasswordToken(sql, u.id, 72);
console.log(`Link para criar a senha (vale 72h): ${appUrl()}/definir-senha?t=${t}`);
process.exit(0);
