import { describe, it, expect, afterAll } from 'vitest';
import { pool, one, q } from '../lib/db';
import { registerConsumer, createAdmin } from '../lib/services/accounts';
import { totpAt, verifyTotp, encrypt, decrypt, passwordProblem, rateLimit, verifyCaptcha, base32Encode, base32Decode } from '../lib/security';
import { passwordLogin, verifySecondFactor, startTotpSetup, confirmTotp, disableTotp, requestPasswordReset, resetPassword, changePassword, logoutEverywhere, sessionVersionOf } from '../lib/services/security';
import { healthCheck, monitorTick } from '../lib/services/monitor';
import { activeNotices } from '../lib/services/security';

const PW = 'Forte#Senha2026';
let seq = 500;
function cpf(seed: number) {
  const d = String(200000000 + seed * 104729).slice(0, 9).split('').map(Number);
  const dv = (a: number[]) => { const s = a.reduce((acc, n, i) => acc + n * (a.length + 1 - i), 0); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  d.push(dv(d)); d.push(dv(d));
  return d.join('');
}
const user = (email: string) => registerConsumer({ name: 'Seg ' + email, email, phone: '4391' + String(1000000 + seq).slice(-7), password: PW, city: 'Londrina', state: 'PR', cpf: cpf(seq++), acceptAds: true });

afterAll(async () => {
  await pool().end();
});

describe('primitivas', () => {
  it('TOTP confere com o vetor oficial da RFC 6238', () => {
    const secret = base32Encode(Buffer.from('12345678901234567890'));
    expect(secret).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(base32Decode(secret).toString()).toBe('12345678901234567890');
    expect(totpAt(secret, 59_000)).toBe('287082');
    expect(totpAt(secret, 1111111109_000)).toBe('081804');
    expect(verifyTotp(secret, '287082', 59_000)).toBe(true);
    expect(verifyTotp(secret, '287082', 59_000 + 30_000)).toBe(true); // tolerância de 30 s
    expect(verifyTotp(secret, '287082', 59_000 + 120_000)).toBe(false);
    expect(verifyTotp(secret, 'abc', 59_000)).toBe(false);
  });
  it('criptografia de segredos ida e volta, com detecção de adulteração', () => {
    const e = encrypt('segredo');
    expect(e).not.toContain('segredo');
    expect(decrypt(e)).toBe('segredo');
    const parts = e.split('.');
    parts[2] = Buffer.from('xxxxxxx').toString('base64url');
    expect(() => decrypt(parts.join('.'))).toThrow();
  });
  it('recusa senhas fracas', () => {
    expect(passwordProblem('123')).toMatch(/8 caracteres/);
    expect(passwordProblem('12345678')).toMatch(/comum/);
    expect(passwordProblem('aaaaaaaaaa')).toMatch(/fácil/);
    expect(passwordProblem('joaosilva99', 'joaosilva@x.com')).toMatch(/e-mail/);
    expect(passwordProblem(PW)).toBeNull();
  });
  it('limite de tentativas bloqueia o excesso', async () => {
    for (let i = 0; i < 3; i++) await rateLimit('t:rl', 3, 60);
    await expect(rateLimit('t:rl', 3, 60)).rejects.toThrow('Muitas tentativas');
  });
  it('captcha: passa sem chave; com chave exige token válido', async () => {
    expect(await verifyCaptcha(null)).toBe(true);
    process.env.TURNSTILE_SECRET_KEY = 'x';
    await expect(verifyCaptcha(null)).rejects.toThrow('robô');
    const ok = (async () => new Response(JSON.stringify({ success: true }))) as any;
    const bad = (async () => new Response(JSON.stringify({ success: false }))) as any;
    expect(await verifyCaptcha('tok', '1.1.1.1', ok)).toBe(true);
    await expect(verifyCaptcha('tok', '1.1.1.1', bad)).rejects.toThrow();
    delete process.env.TURNSTILE_SECRET_KEY;
  });
});

describe('login protegido', () => {
  it('bloqueia a conta por 15 minutos após 5 senhas erradas e avisa por e-mail', async () => {
    await user('lock@s.com');
    for (let i = 0; i < 5; i++) await expect(passwordLogin('lock@s.com', 'errada!!', { ip: '9.9.9.' + i })).rejects.toThrow('incorretos');
    await expect(passwordLogin('lock@s.com', PW, { ip: '9.9.9.9' })).rejects.toThrow('bloqueada');
    expect((await q(`select 1 from email_outbox where kind='security' and to_email='lock@s.com'`)).length).toBe(1);
    const ev = await q(`select ok from login_events where email='lock@s.com'`);
    expect(ev.length).toBe(5);
  });

  it('2FA: ativa com código do app, exige no login, aceita código de recuperação uma vez', async () => {
    const u = await user('2fa@s.com');
    const { secret, uri } = await startTotpSetup(u.id);
    expect(uri).toContain('otpauth://totp/Cashbacksmart');
    const stored = await one<any>('select totp_secret from users where id=$1', [u.id]);
    expect(stored.totp_secret).not.toContain(secret); // guardado criptografado
    await expect(confirmTotp(u.id, '000000')).rejects.toThrow('inválido');
    const codes = await confirmTotp(u.id, totpAt(secret));
    expect(codes).toHaveLength(8);
    const step1 = await passwordLogin('2fa@s.com', PW, { ip: '1.2.3.4' });
    expect(step1.needs2fa).toBe(true);
    await expect(verifySecondFactor(u.id, '123456')).rejects.toThrow('inválido');
    expect((await verifySecondFactor(u.id, totpAt(secret))).usedRecovery).toBe(false);
    expect((await verifySecondFactor(u.id, codes[0])).usedRecovery).toBe(true);
    await expect(verifySecondFactor(u.id, codes[0])).rejects.toThrow('inválido');
    await expect(disableTotp(u.id, 'errada')).rejects.toThrow('Senha');
    await disableTotp(u.id, PW);
    expect((await passwordLogin('2fa@s.com', PW)).needs2fa).toBe(false);
  });

  it('admin não pode desativar o 2FA', async () => {
    const id = await createAdmin('Adm', 'adm2fa@s.com', PW);
    const { secret } = await startTotpSetup(id);
    await confirmTotp(id, totpAt(secret));
    await expect(disableTotp(id, PW)).rejects.toThrow('Administradores');
  });
});

describe('recuperação e troca de senha', () => {
  it('link único, vence, troca a senha e derruba sessões antigas', async () => {
    const u = await user('reset@s.com');
    expect(await requestPasswordReset('naoexiste@s.com')).toBeNull(); // não revela se o e-mail existe
    const token = (await requestPasswordReset('reset@s.com'))!;
    const sv0 = await sessionVersionOf(u.id);
    await expect(resetPassword(token, '12345678')).rejects.toThrow('comum');
    await resetPassword(token, 'NovaSenha#99');
    expect(await sessionVersionOf(u.id)).toBe(sv0! + 1);
    await expect(resetPassword(token, 'OutraSenha#99')).rejects.toThrow('inválido');
    await expect(passwordLogin('reset@s.com', PW)).rejects.toThrow();
    expect((await passwordLogin('reset@s.com', 'NovaSenha#99')).id).toBe(u.id);
    // link vencido
    const t2 = (await requestPasswordReset('reset@s.com'))!;
    await q(`update password_resets set expires_at = now() - interval '1 minute' where used_at is null`);
    await expect(resetPassword(t2, 'Mais#Uma2026')).rejects.toThrow('vencido');
  });
  it('troca de senha exige a atual e sair de todos os aparelhos invalida sessões', async () => {
    const u = await user('troca@s.com');
    await expect(changePassword(u.id, 'errada', 'Nova#Senha77')).rejects.toThrow('atual');
    const sv = await changePassword(u.id, PW, 'Nova#Senha77');
    expect(await logoutEverywhere(u.id)).toBe(sv + 1);
  });
});

describe('monitoramento', () => {
  it('relata saúde e publica/retira aviso automático', async () => {
    const h = await healthCheck();
    expect(h.db).toBe(true);
    for (let i = 0; i < 12; i++) await q(`insert into audit_log (action, data) values ('charge_error', '{}')`);
    const t = await monitorTick();
    expect(t.ok).toBe(false);
    expect((await activeNotices('consumer')).some((n) => n.message.includes('Pagamentos com instabilidade'))).toBe(true);
    await q(`delete from audit_log where action='charge_error'`);
    await monitorTick();
    expect((await activeNotices('consumer')).some((n) => n.message.startsWith('[auto]'))).toBe(false);
  });
});
