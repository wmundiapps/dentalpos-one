import crypto from 'crypto';
import { one, q, tx, UserError } from '../db';
import { config, STATES } from '../config';
import { campaignHtml, MailSender, mailSender } from '../email';
import { pct, brl } from '../format';
import { subscriptionState } from './cashback';
import { moderateCampaign } from '../moderation';

function secret() {
  return process.env.AUTH_SECRET || 'dev-secret-change-me';
}
export function unsubscribeToken(userId: string) {
  const sig = crypto.createHmac('sha256', secret()).update('unsub:' + userId).digest('base64url').slice(0, 22);
  return `${userId}.${sig}`;
}
export function verifyUnsubscribeToken(token: string) {
  const [id, sig] = String(token || '').split('.');
  if (!id || !sig) return null;
  const good = unsubscribeToken(id).split('.')[1];
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  return id;
}

export type CampaignInput = {
  businessId: string;
  actorId: string;
  scope: 'local' | 'national';
  subject: string;
  body: string;
  targetState?: string | null; // nacional: UF opcional (vazio = Brasil todo)
};

async function offerLine(businessId: string) {
  const r = await one<{ kind: string; value: number }>(
    `select kind, value from cashback_rules where business_id=$1 and active order by case when kind='percent' then value*100 else value end desc limit 1`,
    [businessId],
  );
  if (!r) return null;
  return r.kind === 'percent' ? `${pct(r.value)} de cashback nas suas compras` : `${brl(r.value)} de cashback por compra`;
}

export async function localCampaignsThisMonth(businessId: string, now = new Date()) {
  const r = await one<{ n: string }>(
    `select count(*) n from campaigns where business_id=$1 and scope='local' and status <> 'draft'
     and date_trunc('month', created_at at time zone 'America/Sao_Paulo') = date_trunc('month', $2::timestamptz at time zone 'America/Sao_Paulo')`,
    [businessId, now],
  );
  return Number(r!.n);
}

/** Cria a campanha e coloca os e-mails na fila de envio */
export async function createCampaign(input: CampaignInput, now = new Date()) {
  const subject = (input.subject || '').trim();
  const body = (input.body || '').trim();
  if (subject.length < 4 || subject.length > 120) throw new UserError('O assunto deve ter entre 4 e 120 caracteres');
  if (body.length < 10 || body.length > 4000) throw new UserError('A mensagem deve ter entre 10 e 4.000 caracteres');
  if (input.scope === 'national' && input.targetState && !STATES.includes(input.targetState)) throw new UserError('UF inválida');
  const offer = await offerLine(input.businessId);
  // Robô moderador: bloqueia golpe, conteúdo proibido e texto com cara de spam
  const verdict = await moderateCampaign(subject, body);
  if (!verdict.ok) throw new UserError(`Campanha não enviada: ${verdict.reason}`);

  return tx(async (c) => {
    const m = await one<{ role: string }>('select role from business_members where business_id=$1 and user_id=$2', [input.businessId, input.actorId], c);
    if (!m || m.role !== 'owner') throw new UserError('Só o dono pode enviar campanhas');
    const biz = await one<{ id: string; name: string; city: string; state: string }>('select id, name, city, state from businesses where id=$1 for update', [input.businessId], c);
    const sub = await subscriptionState(c, { businessId: input.businessId }, now);
    if (!sub.ok) throw new UserError('A assinatura da empresa está vencida. Regularize para enviar campanhas.');

    let where: string;
    let params: unknown[];
    let limit: number | null = null;
    if (input.scope === 'local') {
      const used = await localCampaignsThisMonth(input.businessId, now);
      if (used >= config.localCampaignsPerMonth) throw new UserError(`Você já usou as ${config.localCampaignsPerMonth} campanhas locais inclusas deste mês. Para mais alcance, use um pacote nacional.`);
      where = `role='consumer' and email_optin and state=$1 and lower(city)=lower($2)`;
      params = [biz!.state, biz!.city];
    } else {
      const cr = await one<{ national_emails: number }>('select national_emails from business_email_credits where business_id=$1 for update', [input.businessId], c);
      limit = cr?.national_emails || 0;
      if (limit <= 0) throw new UserError('Sem saldo de e-mails nacionais. Compre um pacote para enviar.');
      where = input.targetState ? `role='consumer' and email_optin and state=$1` : `role='consumer' and email_optin`;
      params = input.targetState ? [input.targetState] : [];
    }

    const camp = await one<{ id: string }>(
      `insert into campaigns (business_id, scope, subject, body, target_state, target_city, status, created_at, moderation)
       values ($1,$2,$3,$4,$5,$6,'queued',$7,$8) returning id`,
      [input.businessId, input.scope, subject, body, input.scope === 'local' ? biz!.state : input.targetState || null, input.scope === 'local' ? biz!.city : null, now, verdict],
      c,
    );
    const html = campaignHtml({ businessName: biz!.name, city: `${biz!.city}/${biz!.state}`, subject, body, offer, unsubscribeUrl: '{{UNSUB}}' });
    const n = params.length;
    const res = await c.query(
      `insert into email_outbox (campaign_id, to_email, user_id, subject, html)
       select $${n + 1}, email, id, $${n + 2}, $${n + 3} from users where ${where}
       order by created_at ${limit != null ? `limit ${Math.floor(limit)}` : ''}`,
      [...params, camp!.id, subject, html],
    );
    const recipients = res.rowCount || 0;
    await c.query('update campaigns set recipients=$2 where id=$1', [camp!.id, recipients]);
    if (input.scope === 'national') {
      await c.query('update business_email_credits set national_emails = national_emails - $2 where business_id=$1', [input.businessId, recipients]);
    }
    if (recipients === 0) await c.query(`update campaigns set status='sent', sent_at=$2 where id=$1`, [camp!.id, now]);
    return { campaignId: camp!.id, recipients };
  });
}

/** Envia e-mails pendentes da fila em lotes de 100 */
export async function processOutbox(maxEmails = 1000, sender: MailSender = mailSender(), now = new Date()) {
  let sent = 0, failed = 0;
  while (sent + failed < maxEmails) {
    const batch = await tx(async (c) => {
      const rows = await q<{ id: string; to_email: string; user_id: string; subject: string; html: string; campaign_id: string }>(
        `select id, to_email, user_id, subject, html, campaign_id from email_outbox where status='pending' and attempts < 3
         order by id limit 100 for update skip locked`,
        [],
        c,
      );
      if (!rows.length) return [];
      const mails = rows.map((r) => {
        const unsub = `${config.appUrl}/api/descadastrar?t=${unsubscribeToken(r.user_id)}`;
        return {
          to: r.to_email,
          subject: r.subject,
          html: r.html.replace('{{UNSUB}}', unsub),
          headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
        };
      });
      const results = await sender.sendBatch(mails);
      for (let i = 0; i < rows.length; i++) {
        const ok = results[i]?.ok;
        await c.query(
          `update email_outbox set attempts=attempts+1, status=case when $2 then 'sent' when attempts+1 >= 3 then 'failed' else 'pending' end,
             provider_id=$3, sent_at=case when $2 then $4::timestamptz else null end where id=$1`,
          [rows[i].id, !!ok, results[i]?.id || null, now],
        );
      }
      return rows.map((r, i) => ({ campaign: r.campaign_id, ok: !!results[i]?.ok }));
    });
    if (!batch.length) break;
    sent += batch.filter((b) => b.ok).length;
    failed += batch.filter((b) => !b.ok).length;
    if (batch.length < 100) break;
  }
  // Atualiza o status das campanhas
  await q(
    `update campaigns c set sent_count = s.sent, status = case when s.pending = 0 then 'sent' else 'sending' end,
       sent_at = case when s.pending = 0 then coalesce(c.sent_at, $1) else c.sent_at end
     from (select campaign_id, count(*) filter (where status='sent') sent, count(*) filter (where status='pending') pending
           from email_outbox where campaign_id in (select id from campaigns where status in ('queued','sending')) group by campaign_id) s
     where c.id = s.campaign_id`,
    [now],
  );
  return { sent, failed };
}

export async function campaignsOf(businessId: string) {
  return q<any>('select * from campaigns where business_id=$1 order by created_at desc limit 50', [businessId]);
}

export async function emailCredits(businessId: string) {
  const r = await one<{ national_emails: number }>('select national_emails from business_email_credits where business_id=$1', [businessId]);
  return r?.national_emails || 0;
}

export async function packages() {
  return q<{ id: string; name: string; emails: number; price_cents: string }>('select * from campaign_packages where active order by price_cents');
}

export async function audienceSize(businessId: string) {
  const b = await one<{ city: string; state: string }>('select city, state from businesses where id=$1', [businessId]);
  if (!b) return 0;
  const r = await one<{ n: string }>(`select count(*) n from users where role='consumer' and email_optin and state=$1 and lower(city)=lower($2)`, [b.state, b.city]);
  return Number(r!.n);
}

/** Ofertas no app: campanhas da cidade + nacionais recentes */
export async function feedFor(state: string, city: string, limit = 20) {
  return q<any>(
    `select c.id, c.subject, c.body, c.scope, c.created_at, b.id business_id, b.name business, b.category, b.neighborhood
     from campaigns c join businesses b on b.id=c.business_id
     where c.status in ('sending','sent') and b.status='active' and (
       (c.scope='local' and c.target_state=$1 and lower(c.target_city)=lower($2))
       or (c.scope='national' and (c.target_state is null or c.target_state=$1))
     ) order by c.created_at desc limit $3`,
    [state, city, limit],
  );
}
