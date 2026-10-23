import bcrypt from 'bcryptjs';
import { one, q, tx, UserError } from '../db';
import { config } from '../config';
import { decrypt, encrypt, newRecoveryCodes, newTotpSecret, otpauthUri, passwordProblem, randomToken, rateLimit, sha256, verifyTotp } from '../security';
import { queueEmail } from './notify';
import { processOutbox } from './campaigns';

export const BCRYPT_COST = process.env.NODE_ENV === 'test' ? 4 : 12;
const LOCK_AFTER = 5;
const LOCK_MINUTES = 15;

type LoginUser = { id: string; role: 'consumer' | 'business' | 'admin'; email: string; name: string; password_hash: string; totp_enabled: boolean; failed_logins: number; locked_until: Date | null; session_version: number };

/** Etapa 1 do login: senha. Bloqueia por 15 min após 5 erros e registra cada tentativa. */
export async function passwordLogin(email: string, password: string, meta: { ip?: string | null; ua?: string | null } = {}) {
  const em = String(email || '').trim().toLowerCase();
  await rateLimit(`login:ip:${meta.ip || 'x'}`, 30, 900);
  await rateLimit(`login:email:${em}`, 10, 900);
  const u = await one<LoginUser>('select id, role, email, name, password_hash, totp_enabled, failed_logins, locked_until, session_version from users where lower(email)=$1', [em]);
  if (u?.locked_until && new Date(u.locked_until) > new Date()) {
    throw new UserError(`Conta bloqueada temporariamente por tentativas erradas. Tente de novo em ${Math.ceil((new Date(u.locked_until).getTime() - Date.now()) / 60000)} minutos ou recupere a senha.`);
  }
  const ok = !!u && (await bcrypt.compare(String(password || ''), u.password_hash));
  await q('insert into login_events (user_id, email, ip, user_agent, ok) values ($1,$2,$3,$4,$5)', [u?.id || null, em, meta.ip || null, (meta.ua || '').slice(0, 300), ok]);
  if (!u || !ok) {
    if (u) {
      const fails = u.failed_logins + 1;
      await q(`update users set failed_logins=$2::int, locked_until = case when $2::int >= $3::int then now() + make_interval(mins => $4::int) else locked_until end where id=$1`, [u.id, fails, LOCK_AFTER, LOCK_MINUTES]);
      if (fails === LOCK_AFTER) await queueEmail(u.id, u.email, 'Tentativas de acesso à sua conta', `Bloqueamos o acesso à sua conta por ${LOCK_MINUTES} minutos depois de ${LOCK_AFTER} tentativas com senha errada.\n\nSe não foi você, troque sua senha agora.`, 'security', { label: 'Trocar senha', url: `${config.appUrl}/recuperar-senha` });
    }
    throw new UserError('E-mail ou senha incorretos');
  }
  await q('update users set failed_logins=0, locked_until=null where id=$1', [u.id]);
  return { id: u.id, role: u.role, needs2fa: u.totp_enabled, sessionVersion: u.session_version };
}

/** Avisa por e-mail quando entra de um endereço novo */
export async function newDeviceAlert(userId: string, ip?: string | null, ua?: string | null) {
  if (!ip) return;
  const seen = await one(`select 1 from login_events where user_id=$1 and ok and ip=$2 and created_at < now() - interval '1 minute' and created_at > now() - interval '180 days' limit 1`, [userId, ip]);
  const any = await one(`select 1 from login_events where user_id=$1 and ok and created_at < now() - interval '1 minute' limit 1`, [userId]);
  if (seen || !any) return;
  const u = await one<{ email: string; name: string }>('select email, name from users where id=$1', [userId]);
  if (!u) return;
  await queueEmail(userId, u.email, 'Novo acesso à sua conta Cashbacksmart', `Olá, ${u.name.split(' ')[0]}.\n\nSua conta foi acessada agora de um aparelho ou rede nova (${(ua || 'navegador').slice(0, 80)}).\n\nSe foi você, pode ignorar. Se não foi, troque a senha e ative a verificação em duas etapas.`, 'security', { label: 'Proteger minha conta', url: `${config.appUrl}/seguranca` });
}

/** Etapa 2: código do aplicativo autenticador ou código de recuperação */
export async function verifySecondFactor(userId: string, code: string) {
  await rateLimit(`2fa:${userId}`, 8, 900);
  const u = await one<{ totp_secret: string | null; recovery_codes: string[] | null; session_version: number; role: string }>('select totp_secret, recovery_codes, session_version, role from users where id=$1', [userId]);
  if (!u?.totp_secret) throw new UserError('Verificação em duas etapas não está ativa');
  const raw = String(code || '').trim().toUpperCase();
  if (/^\d{6}$/.test(raw.replace(/\s/g, '')) && verifyTotp(decrypt(u.totp_secret), raw)) return { sessionVersion: u.session_version, role: u.role, usedRecovery: false };
  const h = sha256(raw.replace(/\s/g, ''));
  if (u.recovery_codes?.includes(h)) {
    await q('update users set recovery_codes = array_remove(recovery_codes, $2) where id=$1', [userId, h]);
    return { sessionVersion: u.session_version, role: u.role, usedRecovery: true };
  }
  throw new UserError('Código inválido. Confira o horário do celular e tente de novo.');
}

export async function startTotpSetup(userId: string) {
  const u = await one<{ email: string; totp_enabled: boolean }>('select email, totp_enabled from users where id=$1', [userId]);
  if (!u) throw new UserError('Usuário não encontrado');
  if (u.totp_enabled) throw new UserError('A verificação em duas etapas já está ativa');
  const secret = newTotpSecret();
  await q('update users set totp_secret=$2 where id=$1', [userId, encrypt(secret)]);
  return { secret, uri: otpauthUri(secret, u.email) };
}

export async function confirmTotp(userId: string, code: string) {
  await rateLimit(`2fa-setup:${userId}`, 10, 900);
  const u = await one<{ totp_secret: string | null; email: string }>('select totp_secret, email from users where id=$1', [userId]);
  if (!u?.totp_secret) throw new UserError('Comece a configuração de novo');
  if (!verifyTotp(decrypt(u.totp_secret), code)) throw new UserError('Código inválido. Digite o código de 6 números que aparece no aplicativo.');
  const codes = newRecoveryCodes();
  await q('update users set totp_enabled=true, recovery_codes=$2 where id=$1', [userId, codes.map((c) => sha256(c))]);
  await queueEmail(userId, u.email, 'Verificação em duas etapas ativada', 'A verificação em duas etapas foi ativada na sua conta Cashbacksmart. Se não foi você, recupere sua senha agora.', 'security');
  return codes;
}

export async function disableTotp(userId: string, password: string) {
  const u = await one<{ password_hash: string; role: string; email: string }>('select password_hash, role, email from users where id=$1', [userId]);
  if (!u || !(await bcrypt.compare(password || '', u.password_hash))) throw new UserError('Senha incorreta');
  if (u.role === 'admin') throw new UserError('Administradores precisam manter a verificação em duas etapas');
  await q('update users set totp_enabled=false, totp_secret=null, recovery_codes=null where id=$1', [userId]);
  await queueEmail(userId, u.email, 'Verificação em duas etapas desativada', 'A verificação em duas etapas foi desativada na sua conta. Se não foi você, troque sua senha agora.', 'security');
}

/** Recuperação de senha: sempre responde igual, exista ou não a conta (não revela e-mails cadastrados) */
export async function requestPasswordReset(email: string, ip?: string | null) {
  const em = String(email || '').trim().toLowerCase();
  await rateLimit(`reset:ip:${ip || 'x'}`, 10, 3600);
  await rateLimit(`reset:email:${em}`, 3, 900);
  const u = await one<{ id: string; name: string; email: string }>('select id, name, email from users where lower(email)=$1', [em]);
  if (!u) return null;
  const token = randomToken();
  await q('insert into password_resets (user_id, token_hash, expires_at) values ($1,$2, now() + interval \'30 minutes\')', [u.id, sha256(token)]);
  await queueEmail(u.id, u.email, 'Redefinir sua senha do Cashbacksmart', `Olá, ${u.name.split(' ')[0]}.\n\nRecebemos um pedido para redefinir sua senha. O link vale por 30 minutos e só pode ser usado uma vez.\n\nSe você não pediu, ignore este e-mail: sua senha continua a mesma.`, 'reset', { label: 'Criar nova senha', url: `${config.appUrl}/redefinir-senha?t=${token}` });
  await processOutbox(20).catch(() => null);
  return token; // devolvido só para testes; a tela nunca mostra
}

export async function resetPassword(token: string, newPassword: string) {
  const r = await one<{ id: string; user_id: string; email: string }>(
    `select pr.id, pr.user_id, u.email from password_resets pr join users u on u.id=pr.user_id
     where pr.token_hash=$1 and pr.used_at is null and pr.expires_at > now()`,
    [sha256(String(token || ''))],
  );
  if (!r) throw new UserError('Link inválido ou vencido. Peça um novo.');
  const prob = passwordProblem(newPassword, r.email);
  if (prob) throw new UserError(prob);
  const hash = await bcrypt.hash(newPassword, BCRYPT_COST);
  await tx(async (c) => {
    await c.query('update password_resets set used_at=now() where user_id=$1 and used_at is null', [r.user_id]);
    await c.query('update users set password_hash=$2, session_version=session_version+1, failed_logins=0, locked_until=null where id=$1', [r.user_id, hash]);
  });
  await queueEmail(r.user_id, r.email, 'Sua senha foi alterada', 'A senha da sua conta Cashbacksmart foi alterada e todos os aparelhos foram desconectados. Se não foi você, recupere a senha imediatamente.', 'security');
  return r.user_id;
}

export async function changePassword(userId: string, current: string, next: string) {
  await rateLimit(`chpw:${userId}`, 10, 900);
  const u = await one<{ password_hash: string; email: string }>('select password_hash, email from users where id=$1', [userId]);
  if (!u || !(await bcrypt.compare(current || '', u.password_hash))) throw new UserError('Senha atual incorreta');
  const prob = passwordProblem(next, u.email);
  if (prob) throw new UserError(prob);
  await q('update users set password_hash=$2, session_version=session_version+1 where id=$1', [userId, await bcrypt.hash(next, BCRYPT_COST)]);
  await queueEmail(userId, u.email, 'Sua senha foi alterada', 'A senha da sua conta Cashbacksmart foi alterada. Se não foi você, recupere a senha imediatamente.', 'security');
  return (await one<{ session_version: number }>('select session_version from users where id=$1', [userId]))!.session_version;
}

export async function logoutEverywhere(userId: string) {
  const r = await one<{ session_version: number }>('update users set session_version=session_version+1 where id=$1 returning session_version', [userId]);
  return r!.session_version;
}

export async function sessionVersionOf(userId: string) {
  const r = await one<{ session_version: number }>('select session_version from users where id=$1', [userId]);
  return r?.session_version ?? null;
}

export async function securityStatus(userId: string) {
  return one<{ totp_enabled: boolean; recovery_left: number; role: string }>(
    `select totp_enabled, coalesce(array_length(recovery_codes,1),0) recovery_left, role from users where id=$1`,
    [userId],
  );
}

export async function recentLogins(userId: string) {
  return q<{ ip: string; user_agent: string; ok: boolean; created_at: Date }>('select ip, user_agent, ok, created_at from login_events where user_id=$1 order by id desc limit 10', [userId]);
}

// ---------- Avisos do sistema (manutenção, atualização, instabilidade) ----------
export async function activeNotices(audience: 'consumer' | 'business' | 'admin') {
  return q<{ id: string; kind: string; message: string }>(`select id, kind, message from system_notices where active and (audience='all' or audience=$1) order by id desc limit 3`, [audience]);
}
export async function createNotice(kind: string, message: string, audience: string) {
  if (!['info', 'maintenance', 'update', 'incident'].includes(kind)) throw new UserError('Tipo inválido');
  if (!message || message.trim().length < 5) throw new UserError('Escreva o aviso');
  await q('insert into system_notices (kind, message, audience) values ($1,$2,$3)', [kind, message.trim().slice(0, 300), ['all', 'consumer', 'business'].includes(audience) ? audience : 'all']);
}
export async function endNotice(id: string) {
  await q('update system_notices set active=false where id=$1', [id]);
}
export async function allNotices() {
  return q<any>('select * from system_notices order by id desc limit 20');
}
