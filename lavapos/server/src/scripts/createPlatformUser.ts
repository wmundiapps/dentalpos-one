// Cria (ou atualiza a senha de) um usuário da plataforma. A senha vem de variável de ambiente, nunca do chat:
//   PLATFORM_EMAIL=voce@wmundi.com.br PLATFORM_PASSWORD='...' npm run create-platform-user --workspace server
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { passwordProblem } from '../validators.js';

const email = process.env.PLATFORM_EMAIL?.toLowerCase();
const pw = process.env.PLATFORM_PASSWORD ?? '';
if (!email || passwordProblem(pw)) { console.error('Informe PLATFORM_EMAIL e PLATFORM_PASSWORD (10+ caracteres, letras e números).'); process.exit(1); }
const hash = await bcrypt.hash(pw, 12);
await pool.query(`INSERT INTO users (tenant_id, name, email, password_hash, role) VALUES (NULL,'Plataforma',$1,$2,'platform')
  ON CONFLICT (email) DO UPDATE SET password_hash = $2, password_changed_at = now(), failed_logins = 0, locked_until = NULL`, [email, hash]);
console.log('Usuário da plataforma pronto:', email);
await pool.end();
