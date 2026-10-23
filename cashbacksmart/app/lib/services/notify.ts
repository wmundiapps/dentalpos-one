/**
 * Robô de avisos: boas-vindas, fatura emitida, fim do teste grátis e atraso.
 * Os e-mails entram na mesma fila das campanhas (email_outbox) e saem pelo agendador.
 */
import { one, q, Db, pool } from '../db';
import { config } from '../config';
import { brl, dateBR, escapeHtml } from '../format';

const DAY = 86400000;

export function plainHtml(title: string, text: string, cta?: { label: string; url: string }) {
  const body = escapeHtml(text)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;line-height:1.55">${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#EEF3FF;font-family:Arial,Helvetica,sans-serif;color:#1B2A6B">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden">
<tr><td style="background:#1B2A6B;padding:18px 24px;color:#fff;font-size:20px;font-weight:bold">cashback<span style="color:#FFB627">smart</span></td></tr>
<tr><td style="padding:24px"><h1 style="margin:0 0 16px;font-size:22px">${escapeHtml(title)}</h1>${body}
${cta ? `<p style="margin:18px 0 0"><a href="${cta.url}" style="display:inline-block;background:#12A150;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:bold">${escapeHtml(cta.label)}</a></p>` : ''}
</td></tr></table></td></tr></table></body></html>`;
}

export async function queueEmail(userId: string, to: string, subject: string, text: string, kind = 'notice', cta?: { label: string; url: string }, db: Pick<Db, 'query'> = pool()) {
  await db.query(`insert into email_outbox (to_email, user_id, subject, html, kind) values ($1,$2,$3,$4,$5)`, [to, userId, subject, plainHtml(subject, text, cta), kind]);
}

/** Garante que cada aviso saia uma vez só */
async function once(kind: string, ref: string) {
  const r = await pool().query(`insert into notifications_sent (kind, ref) values ($1,$2) on conflict do nothing`, [kind, ref]);
  return (r.rowCount || 0) > 0;
}

export async function welcome(userId: string, role: 'consumer' | 'business') {
  const u = await one<{ name: string; email: string; member_code: string }>('select name, email, member_code from users where id=$1', [userId]);
  if (!u || !(await once('welcome', userId))) return;
  const first = u.name.split(' ')[0];
  if (role === 'consumer') {
    const { queueMessage } = await import('./messages');
    await queueMessage(userId, `bem-vindo(a), ${first}! Sua conta é grátis. No caixa, mostre seu código ${u.member_code} ou informe seu CPF e ganhe cashback. Lojas perto de você: ${config.appUrl}/app/lojas`, 'welcome');
  }
  if (role === 'consumer')
    await queueEmail(userId, u.email, `Bem-vindo ao Cashbacksmart, ${first}!`, `Sua conta é grátis.\n\nNo caixa das lojas participantes, mostre seu código ${u.member_code} ou informe seu CPF. O cashback cai na hora na sua carteira. Se a loja esquecer, envie a nota fiscal pelo app.\n\nQuer que seu saldo nunca vença? Assine o Premium por ${brl(config.premiumMonthlyCents)} por mês.`, 'welcome', { label: 'Ver lojas perto de mim', url: `${config.appUrl}/app/lojas` });
  else
    await queueEmail(userId, u.email, `Sua loja está no Cashbacksmart, ${first}!`, `Seus ${Math.round(config.businessTrialDays / 30)} meses sem mensalidade começaram.\n\nPara começar:\n1. Crie uma promoção de boas-vindas para clientes novos (ex.: 30% na primeira compra).\n2. Lance as compras em "Lançar compra" com o QR ou CPF do cliente.\n3. Envie uma campanha para os clientes da sua cidade (4 por mês inclusas).\n\nVocê paga ${config.cashbackFeeBps / 100}% só do cashback que o cliente usar. Depois de ${Math.round(config.businessTrialDays / 30)} meses, a mensalidade é ${brl(config.businessMonthlyCents)}.`, 'welcome', { label: 'Abrir meu painel', url: `${config.appUrl}/painel` });
}

/** Avisa faturas novas (chamado pela rotina de cobrança) */
export async function invoiceNotices(invoiceIds: string[]) {
  for (const id of invoiceIds) {
    const i = await one<any>(
      `select i.id, i.amount_cents, i.due_date, i.payment_url, coalesce(u.id, ou.id) uid, coalesce(u.email, ou.email) email, coalesce(u.name, ou.name) name
       from invoices i left join users u on u.id=i.user_id left join businesses b on b.id=i.business_id left join users ou on ou.id=b.owner_id where i.id=$1`,
      [id],
    );
    if (!i || !(await once('invoice', id))) continue;
    await queueEmail(i.uid, i.email, `Sua fatura Cashbacksmart de ${brl(i.amount_cents)}`, `Olá, ${i.name.split(' ')[0]}.\n\nSua fatura de ${brl(i.amount_cents)} vence em ${dateBR(i.due_date)}. Pague com Pix, boleto ou cartão.`, 'invoice', { label: 'Pagar fatura', url: i.payment_url || `${config.appUrl}/entrar` });
  }
}

/** Lembretes diários: fim do teste em 3 dias e faturas atrasadas */
export async function dailyReminders(now = new Date()) {
  let sent = 0;
  const ending = await q<any>(
    `select s.id, s.trial_ends_at, coalesce(u.id, ou.id) uid, coalesce(u.email, ou.email) email, coalesce(u.name, ou.name) name, s.plan
     from subscriptions s left join users u on u.id=s.user_id left join businesses b on b.id=s.business_id left join users ou on ou.id=b.owner_id
     where s.status='trialing' and s.trial_ends_at > $1 and s.trial_ends_at <= $2`,
    [now, new Date(now.getTime() + 3 * DAY)],
  );
  for (const s of ending) {
    if (!(await once('trial_ending', s.id))) continue;
    if (s.plan !== 'business') continue;
    const price = `${brl(config.businessMonthlyCents)}/mês + ${config.cashbackFeeBps / 100}% do cashback que o cliente usar`;
    await queueEmail(s.uid, s.email, 'Seu período sem mensalidade termina em breve', `Olá, ${s.name.split(' ')[0]}.\n\nSeu período sem mensalidade termina em ${dateBR(s.trial_ends_at)}. Depois, a assinatura fica em ${price}. Se não quiser continuar, cancele pelo painel antes dessa data.`, 'trial');
    sent++;
  }
  const overdue = await q<any>(
    `select i.id, i.amount_cents, i.payment_url, coalesce(u.id, ou.id) uid, coalesce(u.email, ou.email) email, coalesce(u.name, ou.name) name
     from invoices i left join users u on u.id=i.user_id left join businesses b on b.id=i.business_id left join users ou on ou.id=b.owner_id
     where i.status='pending' and i.due_date < $1::date`,
    [now.toISOString().slice(0, 10)],
  );
  for (const i of overdue) {
    if (!(await once('overdue', i.id))) continue;
    await queueEmail(i.uid, i.email, 'Fatura Cashbacksmart em atraso', `Olá, ${i.name.split(' ')[0]}.\n\nSua fatura de ${brl(i.amount_cents)} venceu. Enquanto ela estiver em aberto, o cashback fica pausado. Pague em um minuto pelo link.`, 'overdue', { label: 'Pagar agora', url: i.payment_url || `${config.appUrl}/entrar` });
    sent++;
  }
  return sent;
}
