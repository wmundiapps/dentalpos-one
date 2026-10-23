/**
 * Robô de avisos ao cliente: e-mail sempre + WhatsApp ou SMS (o canal que o cliente escolheu; padrão: MESSAGE_CHANNEL).
 * As mensagens entram na fila message_outbox e saem pelo agendador, com limite diário por pessoa para controlar custo.
 * WhatsApp: API oficial da Meta (modelo aprovado WHATSAPP_TEMPLATE_NOTICE com 1 variável). SMS: Twilio.
 */
import { one, q, Db, pool } from '../db';
import { config } from '../config';
import { brl, dateBR } from '../format';
import { queueEmail } from './notify';

export type Channel = 'whatsapp' | 'sms';
export interface MessageSender {
  name: string;
  send(channel: Channel, to: string, body: string): Promise<{ ok: boolean; id?: string; error?: string }>;
}

export function defaultChannel(): Channel {
  return process.env.MESSAGE_CHANNEL === 'sms' ? 'sms' : 'whatsapp';
}

const intl = (phone: string) => '55' + phone.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');

export const liveSender: MessageSender = {
  name: 'live',
  async send(channel, to, body) {
    if (channel === 'whatsapp') {
      const token = process.env.WHATSAPP_TOKEN, phoneId = process.env.WHATSAPP_PHONE_ID;
      if (!token || !phoneId) return { ok: false, error: 'whatsapp_off' };
      const tpl = process.env.WHATSAPP_TEMPLATE_NOTICE;
      const payload = tpl
        ? { messaging_product: 'whatsapp', to: intl(to), type: 'template', template: { name: tpl, language: { code: 'pt_BR' }, components: [{ type: 'body', parameters: [{ type: 'text', text: body.slice(0, 1000) }] }] } }
        : { messaging_product: 'whatsapp', to: intl(to), type: 'text', text: { body: body.slice(0, 4000) } };
      const r = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const j: any = await r.json().catch(() => ({}));
      return r.ok ? { ok: true, id: j?.messages?.[0]?.id } : { ok: false, error: j?.error?.message || `HTTP ${r.status}` };
    }
    const sid = process.env.TWILIO_ACCOUNT_SID, token = process.env.TWILIO_AUTH_TOKEN, from = process.env.TWILIO_FROM;
    if (!sid || !token || !from) return { ok: false, error: 'sms_off' };
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: '+' + intl(to), From: from, Body: body.slice(0, 600) }),
    });
    const j: any = await r.json().catch(() => ({}));
    return r.ok ? { ok: true, id: j?.sid } : { ok: false, error: j?.message || `HTTP ${r.status}` };
  },
};

/** Sem chaves configuradas: só registra no log (desenvolvimento) */
export const logMessageSender: MessageSender = {
  name: 'log',
  async send(channel, to, body) {
    console.log(`[${channel}] para=${to} ${body.slice(0, 80)}`);
    return { ok: true, id: 'log' };
  },
};

export function messageSender(): MessageSender {
  const live = (process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID) || process.env.TWILIO_ACCOUNT_SID;
  return live ? liveSender : logMessageSender;
}

const DAILY_LIMIT = 3;

/** Coloca um aviso na fila do canal do cliente (WhatsApp ou SMS). Respeita o limite diário e a escolha do cliente. */
export async function queueMessage(userId: string, text: string, kind = 'notice', db: Pick<Db, 'query'> = pool()) {
  const u = (await db.query(`select phone, notify_channel from users where id=$1`, [userId])).rows[0] as { phone: string | null; notify_channel: string } | undefined;
  if (!u?.phone || u.notify_channel === 'none') return false;
  const channel: Channel = u.notify_channel === 'sms' ? 'sms' : u.notify_channel === 'whatsapp' ? 'whatsapp' : defaultChannel();
  const today = (await db.query(`select count(*) n from message_outbox where user_id=$1 and created_at > now() - interval '1 day' and kind <> 'security'`, [userId])).rows[0];
  if (kind !== 'security' && Number(today.n) >= DAILY_LIMIT) return false;
  await db.query(`insert into message_outbox (user_id, channel, to_phone, body, kind) values ($1,$2,$3,$4,$5)`, [userId, channel, u.phone, `${config.appName}: ${text}`, kind]);
  return true;
}

/** Envia a fila de WhatsApp/SMS */
export async function processMessages(limit = 1000, sender: MessageSender = messageSender()) {
  const rows = await q<{ id: string; channel: Channel; to_phone: string; body: string; attempts: number }>(
    `update message_outbox set attempts = attempts + 1 where id in (
       select id from message_outbox where status='pending' order by id limit $1 for update skip locked
     ) returning id, channel, to_phone, body, attempts`,
    [limit],
  );
  let sent = 0;
  for (const m of rows) {
    const r = await sender.send(m.channel, m.to_phone, m.body).catch((e) => ({ ok: false, error: String(e?.message || e) }) as { ok: boolean; id?: string; error?: string });
    if (r.ok) {
      sent++;
      await q(`update message_outbox set status='sent', sent_at=now(), provider_id=$2 where id=$1`, [m.id, r.id || null]);
    } else {
      const final = m.attempts >= 3 || /_off$/.test(r.error || '');
      await q(`update message_outbox set status=$2, error=$3 where id=$1`, [m.id, final ? 'failed' : 'pending', r.error || null]);
    }
  }
  return { sent, processed: rows.length };
}

/** E-mail + mensagem: o aviso automático completo ao cliente */
export async function notifyCustomer(userId: string, subject: string, text: string, short: string, kind: string, cta?: { label: string; url: string }, db: Pick<Db, 'query'> = pool()) {
  const u = (await db.query(`select email from users where id=$1`, [userId])).rows[0] as { email: string } | undefined;
  if (!u) return;
  await queueEmail(userId, u.email, subject, text, kind, cta, db);
  await queueMessage(userId, short, kind, db);
}

/** Avisos de cashback creditado (chamado depois de cada compra confirmada) */
export async function cashbackNotice(purchaseId: string, db: Pick<Db, 'query'> = pool()) {
  const p = (await db.query(
    `select p.consumer_id, p.cashback_cents, b.name bname, u.name from purchases p join businesses b on b.id=p.business_id join users u on u.id=p.consumer_id where p.id=$1`,
    [purchaseId],
  )).rows[0] as any;
  if (!p || Number(p.cashback_cents) <= 0) return;
  const first = String(p.name).split(' ')[0];
  await notifyCustomer(
    p.consumer_id,
    `Você ganhou ${brl(p.cashback_cents)} de cashback na ${p.bname}`,
    `Oi, ${first}!\n\nCaiu ${brl(p.cashback_cents)} de cashback na sua carteira pela compra na ${p.bname}. Use o saldo na próxima compra nessa loja: no caixa, gere o código de resgate no app.`,
    `você ganhou ${brl(p.cashback_cents)} de cashback na ${p.bname}. Veja seu saldo: ${config.appUrl}/app`,
    'cashback',
    { label: 'Ver minha carteira', url: `${config.appUrl}/app/carteira` },
    db,
  );
}

/** Saldo vencendo em 7 dias: um aviso por crédito */
export async function expiringNotices(now = new Date()) {
  const rows = await q<any>(
    `select w.consumer_id, w.business_id, b.name bname, sum(w.remaining_cents) cents, min(w.expires_at) exp
       from wallet_entries w join businesses b on b.id=w.business_id
      where w.kind='credit' and w.remaining_cents > 0 and w.expires_at > $1 and w.expires_at <= $1::timestamptz + interval '7 days'
      group by w.consumer_id, w.business_id, b.name`,
    [now],
  );
  let n = 0;
  for (const r of rows) {
    const ref = `${r.consumer_id}:${r.business_id}:${new Date(r.exp).toISOString().slice(0, 10)}`;
    const ok = await pool().query(`insert into notifications_sent (kind, ref) values ('expiring',$1) on conflict do nothing`, [ref]);
    if (!ok.rowCount) continue;
    await notifyCustomer(
      r.consumer_id,
      `Seu cashback de ${brl(r.cents)} na ${r.bname} vence em breve`,
      `Seu saldo de ${brl(r.cents)} na ${r.bname} vence em ${dateBR(r.exp)}. Passe lá e use na compra.\n\nCom o Premium (${brl(config.premiumMonthlyCents)}/mês) seu saldo nunca vence.`,
      `seu cashback de ${brl(r.cents)} na ${r.bname} vence em ${dateBR(r.exp)}. Use antes!`,
      'expiring',
      { label: 'Ver minha carteira', url: `${config.appUrl}/app/carteira` },
    );
    n++;
  }
  return n;
}

export async function setNotifyChannel(userId: string, channel: string) {
  if (!['whatsapp', 'sms', 'none'].includes(channel)) return;
  await q('update users set notify_channel=$2 where id=$1', [userId, channel]);
}

export async function messageStats() {
  return one<{ pending: string; sent_today: string }>(
    `select count(*) filter (where status='pending') pending, count(*) filter (where status='sent' and sent_at > now() - interval '1 day') sent_today from message_outbox`,
  );
}
