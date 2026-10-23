import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { one, q, tx, UserError } from '../db';
import { rateLimit } from '../security';

/** Tudo o que o Cashbacksmart guarda sobre o cliente, em formato legível (LGPD art. 18) */
export async function exportUserData(userId: string) {
  const user = await one<any>(
    `select id, role, name, email, phone, cpf, city, state, member_code, referral_code, email_optin, notify_channel,
            phone_verified_at, premium_until, totp_enabled, created_at
     from users where id=$1`,
    [userId],
  );
  if (!user) throw new UserError('Conta não encontrada');
  const [wallet, purchases, invoices, messages, logins, leads] = await Promise.all([
    q<any>(
      `select b.name loja, w.kind tipo, w.amount_cents valor_centavos, w.remaining_cents restante_centavos, w.available_at liberado_em, w.expires_at vence_em, w.created_at
       from wallet_entries w join businesses b on b.id=w.business_id where w.consumer_id=$1 order by w.created_at`,
      [userId],
    ),
    q<any>(
      `select b.name loja, p.amount_cents valor_centavos, p.cashback_cents cashback_centavos, p.redeemed_cents usado_centavos, p.status, p.source origem, p.nf_number numero_nota, p.created_at
       from purchases p join businesses b on b.id=p.business_id where p.consumer_id=$1 order by p.created_at`,
      [userId],
    ),
    q<any>(`select amount_cents valor_centavos, status, due_date vencimento, paid_at pago_em, created_at from invoices where user_id=$1 order by created_at`, [userId]),
    q<any>(`select channel canal, role autor, content texto, created_at from bot_messages where user_id=$1 order by created_at`, [userId]),
    q<any>(`select ip, user_agent, ok, created_at from login_events where user_id=$1 order by created_at desc limit 200`, [userId]),
    q<any>(`select l.name nome, l.phone celular, l.email, p.title pagina, l.created_at from leads l join lead_pages p on p.id=l.page_id where l.user_id=$1 or ($2::text <> '' and regexp_replace(l.phone,'\\D','','g') = regexp_replace($2::text,'\\D','','g'))`, [userId, user.phone || '']),
  ]);
  return { geradoEm: new Date().toISOString(), conta: user, carteira: wallet, compras: purchases, faturas: invoices, atendimento: messages, acessos: logins, contatosDeOfertas: leads };
}

/**
 * Exclusão de conta do cliente (exigida pela Apple e pela LGPD).
 * Os dados pessoais são apagados e a conta fica anonimizada; o histórico financeiro das lojas (compras e razão) permanece sem identificar a pessoa.
 * O saldo de cashback é encerrado: ele não é dinheiro e não pode ser sacado.
 */
export async function deleteConsumerAccount(userId: string, password: string, now = new Date()) {
  await rateLimit(`delacct:${userId}`, 5, 900, 'Muitas tentativas. Aguarde alguns minutos.');
  const u = await one<{ role: string; password_hash: string; phone: string | null }>('select role, password_hash, phone from users where id=$1', [userId]);
  if (!u) throw new UserError('Conta não encontrada');
  if (u.role !== 'consumer') throw new UserError('Para encerrar a conta de uma empresa, cancele a assinatura no painel e escreva para privacidade@cashbacksmart.com.br');
  if (!(await bcrypt.compare(password || '', u.password_hash))) throw new UserError('Senha incorreta');

  const phoneDigits = (u.phone || '').replace(/\D/g, '');
  await tx(async (c) => {
    // notas enviadas e ainda não decididas: recusadas, e as fotos (podem ter CPF) apagadas
    await c.query(`update purchases set status='rejected', reject_reason='Conta excluída pelo cliente', decided_at=$2 where consumer_id=$1 and status='pending'`, [userId, now]);
    await c.query(`delete from claim_photos where purchase_id in (select id from purchases where consumer_id=$1)`, [userId]);
    // saldo encerrado, mantendo o livro-razão equilibrado
    const open = await q<{ id: string; business_id: string; remaining_cents: string }>(`select id, business_id, remaining_cents from wallet_entries where consumer_id=$1 and kind='credit' and remaining_cents>0 for update`, [userId], c);
    for (const r of open) {
      await c.query('update wallet_entries set remaining_cents=0 where id=$1', [r.id]);
      await c.query(`insert into wallet_entries (consumer_id, business_id, kind, amount_cents, available_at) values ($1,$2,'expire',$3,$4)`, [userId, r.business_id, -Number(r.remaining_cents), now]);
    }
    await c.query(`update invoices set status='canceled' where user_id=$1 and status='pending'`, [userId]);
    await c.query(`delete from leads where user_id=$1 or ($2::text <> '' and regexp_replace(phone,'\\D','','g') = $2::text)`, [userId, phoneDigits]);
    await c.query(`delete from redemption_codes where consumer_id=$1 and used_at is null`, [userId]);
    for (const t of ['push_tokens', 'phone_codes', 'password_resets', 'message_outbox', 'bot_messages', 'login_events']) await c.query(`delete from ${t} where user_id=$1`, [userId]);
    await c.query('delete from email_outbox where user_id=$1', [userId]);
    await c.query(
      `update users set name='Conta excluída', email=$2, phone=null, cpf=null, phone_verified_at=null, password_hash=$3,
         totp_secret=null, totp_enabled=false, recovery_codes=null, email_optin=false, notify_channel='none',
         premium_until=null, failed_logins=0, locked_until=null, session_version=session_version+1
       where id=$1`,
      [userId, `excluida-${userId}@excluida.invalid`, '!' + crypto.randomBytes(24).toString('hex')],
    );
    await c.query(`insert into audit_log (actor_id, action, data) values ($1,'account_deleted',$2)`, [userId, { at: now.toISOString() }]);
  });
}
