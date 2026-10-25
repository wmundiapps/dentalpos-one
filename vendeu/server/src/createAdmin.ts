// Cria (ou promove) um administrador. A senha vem da variável ADMIN_PASSWORD no momento de rodar — nunca no chat:
//   ADMIN_EMAIL=voce@empresa.com ADMIN_NAME="Seu Nome" ADMIN_PASSWORD='...' npm run create-admin
import { hashPassword, validPassword } from './auth.js';
import { id, migrate, one, pool } from './db.js';

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
const name = process.env.ADMIN_NAME?.trim() || 'Administrador Vendeu';
if (!email || !password) { console.error('Defina ADMIN_EMAIL e ADMIN_PASSWORD.'); process.exit(1); }
if (!validPassword(password) || password.length < 12) { console.error('Use uma senha de 12+ caracteres com letras e números.'); process.exit(1); }
await migrate(false);
const existing = await one(pool, 'SELECT id FROM users WHERE lower(email) = $1', [email]);
if (existing) {
  await pool.query("UPDATE users SET role = 'admin', password_hash = $2, email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1", [existing.id, await hashPassword(password)]);
} else {
  await pool.query("INSERT INTO users (id, role, email, email_verified_at, password_hash, full_name) VALUES ($1,'admin',$2,now(),$3,$4)", [id('usr'), email, await hashPassword(password), name]);
}
console.log(`Administrador pronto: ${email}`);
await pool.end();
