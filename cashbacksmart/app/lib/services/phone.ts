/**
 * Verificação de celular por SMS (Twilio). Um celular só pode ser verificado em uma conta de cliente:
 * trava contra criar várias contas para pegar promoções de boas-vindas.
 * Sem Twilio configurado, o código aparece na tela (modo de teste).
 */
import crypto from 'crypto';
import { one, q, UserError } from '../db';
import { rateLimit, sha256 } from '../security';

export function smsEnabled() {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM);
}

async function sendSms(to: string, body: string) {
  const sid = process.env.TWILIO_ACCOUNT_SID!, token = process.env.TWILIO_AUTH_TOKEN!, from = process.env.TWILIO_FROM!;
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: '+55' + to, From: from, Body: body }),
  });
  if (!r.ok) throw new UserError('Não conseguimos enviar o SMS agora. Tente de novo em alguns minutos.');
}

export async function sendPhoneCode(userId: string) {
  const u = await one<{ phone: string; phone_verified_at: Date | null }>('select phone, phone_verified_at from users where id=$1', [userId]);
  if (!u?.phone) throw new UserError('Cadastre um celular na sua conta');
  if (u.phone_verified_at) throw new UserError('Seu celular já está confirmado');
  await rateLimit(`sms:${userId}`, 3, 900, 'Você pediu muitos códigos. Aguarde 15 minutos.');
  await rateLimit(`sms-phone:${u.phone}`, 5, 3600, 'Muitos códigos para este número. Aguarde 1 hora.');
  const taken = await one(`select 1 from users where phone=$1 and phone_verified_at is not null and role='consumer' and id<>$2`, [u.phone, userId]);
  if (taken) throw new UserError('Este celular já está confirmado em outra conta.');
  const code = String(crypto.randomInt(100000, 1000000));
  await q(
    `insert into phone_codes (user_id, phone, code_hash, expires_at, attempts) values ($1,$2,$3, now() + interval '10 minutes', 0)
     on conflict (user_id) do update set phone=excluded.phone, code_hash=excluded.code_hash, expires_at=excluded.expires_at, attempts=0`,
    [userId, u.phone, sha256(userId + code)],
  );
  if (smsEnabled()) {
    await sendSms(u.phone, `Cashbacksmart: seu código é ${code}. Não compartilhe com ninguém.`);
    return { sent: true, devCode: null as string | null };
  }
  return { sent: false, devCode: code };
}

export async function verifyPhoneCode(userId: string, code: string) {
  const r = await one<{ phone: string; code_hash: string; expires_at: Date; attempts: number }>('select * from phone_codes where user_id=$1', [userId]);
  if (!r || new Date(r.expires_at) < new Date()) throw new UserError('Código vencido. Peça outro.');
  if (r.attempts >= 5) throw new UserError('Muitas tentativas. Peça outro código.');
  await q('update phone_codes set attempts=attempts+1 where user_id=$1', [userId]);
  const a = Buffer.from(r.code_hash), b = Buffer.from(sha256(userId + String(code || '').replace(/\D/g, '')));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new UserError('Código incorreto');
  const taken = await one(`select 1 from users where phone=$1 and phone_verified_at is not null and role='consumer' and id<>$2`, [r.phone, userId]);
  if (taken) throw new UserError('Este celular já está confirmado em outra conta.');
  await q('update users set phone_verified_at=now() where id=$1 and phone=$2', [userId, r.phone]);
  await q('delete from phone_codes where user_id=$1', [userId]);
}
