import { PoolClient } from 'pg';
import { one, q, tx, pool, UserError } from '../db';
import { config, premiumPriceCents } from '../config';
import { brl, dateBR } from '../format';
import { PaymentProvider, paymentProvider } from '../payments';
import { invoiceNotices } from './notify';

const DAY = 86400000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

const BRT = 3 * 3600000; // horário de Brasília (UTC-3)

/** 1º dia do mês (00:00 de Brasília) que contém a data */
export function monthStart(d: Date) {
  const b = new Date(d.getTime() - BRT);
  return new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), 1) + BRT);
}
/** 1º dia do mês seguinte (00:00 de Brasília): dia da cobrança */
export function nextMonthStart(d: Date) {
  const b = new Date(d.getTime() - BRT);
  return new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth() + 1, 1) + BRT);
}
function addPeriod(d: Date, cycle: 'monthly' | 'yearly') {
  if (cycle === 'monthly') return nextMonthStart(d);
  const n = new Date(d);
  n.setUTCFullYear(n.getUTCFullYear() + 1);
  return n;
}

type Sub = { id: string; user_id: string | null; business_id: string | null; plan: string; price_cents: string; billing_cycle: 'monthly' | 'yearly'; status: string; current_period_end: Date; trial_ends_at: Date; created_at: Date; canceled_at: Date | null };

/**
 * Fatura de um mês já usado (cobrada no dia 1º do mês seguinte):
 * mensalidade do mês (proporcional só no mês em que acaba o período grátis) + taxa do cashback usado no mês.
 */
async function createInvoice(c: PoolClient, sub: Sub, periodEnd: Date, now: Date) {
  const items: { kind: string; description: string; amount: number }[] = [];
  const mStart = monthStart(new Date(periodEnd.getTime() - DAY));
  const periodStart = new Date(Math.max(mStart.getTime(), new Date(sub.created_at).getTime()));
  const trialEnd = new Date(sub.trial_ends_at);
  const billFrom = Math.max(periodStart.getTime(), trialEnd.getTime());
  const price = Number(sub.price_cents);
  if (price > 0 && billFrom < periodEnd.getTime()) {
    const days = Math.round((periodEnd.getTime() - billFrom) / DAY);
    const monthDays = Math.round((periodEnd.getTime() - mStart.getTime()) / DAY);
    const amount = days >= monthDays ? price : Math.round((price * days) / monthDays);
    const label = new Date(mStart.getTime() - BRT).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    if (amount > 0)
      items.push({ kind: 'subscription', description: `Mensalidade ${config.appName} de ${label}${amount < price ? ` (${days} de ${monthDays} dias)` : ''}`, amount });
  }

  let feePurchaseIds: string[] = [];
  if (sub.business_id) {
    const fees = await q<{ id: string; fee_cents: string }>(
      `select id, fee_cents from purchases where business_id=$1 and fee_invoice_id is null and status='confirmed' and fee_cents > 0 and created_at < $2 for update`,
      [sub.business_id, periodEnd],
      c,
    );
    const total = fees.reduce((s, f) => s + Number(f.fee_cents), 0);
    if (total > 0) {
      items.push({ kind: 'cashback_fee', description: `Taxa de ${config.cashbackFeeBps / 100}% sobre o cashback ${config.feeBase === 'redeemed' ? 'usado pelos clientes' : 'concedido'} (${fees.length} compras)`, amount: total });
      feePurchaseIds = fees.map((f) => f.id);
    }
  }
  const amount = items.reduce((s, i) => s + i.amount, 0);
  if (amount <= 0) return null; // nada a cobrar neste mês
  const inv = await one<{ id: string }>(
    `insert into invoices (user_id, business_id, subscription_id, amount_cents, due_date, period_start, period_end, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
    [sub.user_id, sub.business_id, sub.id, amount, iso(new Date(Math.max(now.getTime(), periodEnd.getTime()) + config.invoiceDueDays * DAY)), iso(new Date(periodStart.getTime() - BRT)), iso(new Date(periodEnd.getTime() - BRT - DAY)), now],
    c,
  );
  for (const it of items) {
    await c.query('insert into invoice_items (invoice_id, kind, description, amount_cents) values ($1,$2,$3,$4)', [inv!.id, it.kind, it.description, it.amount]);
  }
  if (feePurchaseIds.length) await c.query('update purchases set fee_invoice_id=$1 where id = any($2)', [inv!.id, feePurchaseIds]);
  return inv!.id;
}

async function attachCharge(invoiceId: string, provider: PaymentProvider) {
  if (provider.name === 'manual') return;
  const inv = await one<any>(
    `select i.id, i.amount_cents, i.due_date, i.user_id, i.business_id,
       coalesce(u.name, b.name) cname, coalesce(u.email, ou.email) cemail, coalesce(u.cpf, b.cnpj, ou.cpf) doc, coalesce(u.phone, b.phone, ou.phone) phone
     from invoices i left join users u on u.id=i.user_id left join businesses b on b.id=i.business_id left join users ou on ou.id=b.owner_id
     where i.id=$1`,
    [invoiceId],
  );
  const items = await q<{ description: string }>('select description from invoice_items where invoice_id=$1', [invoiceId]);
  try {
    const r = await provider.createCharge({
      invoiceId,
      amountCents: Number(inv.amount_cents),
      dueDate: typeof inv.due_date === 'string' ? inv.due_date : iso(inv.due_date),
      description: items.map((i) => i.description).join(' + ').slice(0, 480),
      customer: { name: inv.cname, email: inv.cemail, cpfCnpj: inv.doc, phone: inv.phone, externalId: inv.user_id || inv.business_id },
    });
    await q('update invoices set provider=$2, provider_ref=$3, payment_url=$4 where id=$1', [invoiceId, r.provider, r.ref, r.url]);
  } catch (e) {
    await q(`insert into audit_log (action, data) values ('charge_error', $1)`, [{ invoiceId, error: (e as Error).message }]);
  }
}

/**
 * Rotina diária de cobrança (roda todo dia; fatura no dia 1º):
 * 1) para cada loja cujo mês terminou, emite a fatura do mês usado (mensalidade + taxa do cashback usado)
 * 2) loja cancelada recebe só a última fatura do mês em uso, sem multa
 * 3) marca como inadimplente quem passou da carência sem pagar
 */
export async function runBilling(now = new Date(), provider: PaymentProvider = paymentProvider()) {
  const created: string[] = [];
  for (;;) {
    const batch = await tx(async (c) => {
      const subs = await q<Sub>(
        `select * from subscriptions
          where current_period_end <= $1 and current_period_end < '2999-01-01'
            and (status in ('trialing','active','past_due') or (status='canceled' and final_billed_at is null))
          order by current_period_end limit 200 for update skip locked`,
        [now],
        c,
      );
      const ids: string[] = [];
      for (const s of subs) {
        const end = new Date(s.current_period_end);
        const id = await createInvoice(c, s, end, now);
        if (id) ids.push(id);
        if (s.status === 'canceled') {
          await c.query(`update subscriptions set final_billed_at=$2 where id=$1`, [s.id, now]);
        } else {
          const next = addPeriod(end, s.billing_cycle);
          const status = new Date(s.trial_ends_at) > next ? 'trialing' : s.status === 'past_due' ? 'past_due' : 'active';
          await c.query(`update subscriptions set status=$3, current_period_end=$2 where id=$1`, [s.id, next, status]);
        }
      }
      return { ids, n: subs.length };
    });
    created.push(...batch.ids);
    if (batch.n === 0) break;
  }
  for (const id of created) await attachCharge(id, provider);
  await invoiceNotices(created);

  const overdue = await q<{ id: string }>(
    `update subscriptions s set status='past_due'
     where s.status in ('active','trialing') and exists (
       select 1 from invoices i where i.subscription_id = s.id and i.status='pending' and i.due_date < ($1::date - $2::int)
     ) returning s.id`,
    [iso(now), config.graceDays],
  );
  return { invoicesCreated: created.length, markedPastDue: overdue.length };
}

export async function markInvoicePaid(invoiceId: string, now = new Date(), actorId: string | null = null) {
  return tx(async (c) => {
    const inv = await one<{ id: string; status: string; subscription_id: string | null; business_id: string | null }>('select * from invoices where id=$1 for update', [invoiceId], c);
    if (!inv) throw new UserError('Fatura não encontrada');
    if (inv.status === 'paid') return { already: true };
    if (inv.status === 'canceled') throw new UserError('Fatura cancelada');
    await c.query(`update invoices set status='paid', paid_at=$2 where id=$1`, [invoiceId, now]);
    if (inv.subscription_id) {
      const stillOpen = await one(`select 1 from invoices where subscription_id=$1 and status='pending' and id<>$2 and due_date < $3::date`, [inv.subscription_id, invoiceId, iso(now)], c);
      if (!stillOpen) await c.query(`update subscriptions set status = case when trial_ends_at > $2 then 'trialing' else 'active' end where id=$1 and status='past_due'`, [inv.subscription_id, now]);
    }
    // Premium do cliente: +1 ano de saldo que nunca vence
    const prem = await one<{ n: string }>(`select count(*) n from invoice_items where invoice_id=$1 and kind='premium'`, [invoiceId], c);
    if (Number(prem!.n) > 0) {
      const inv2 = await one<{ user_id: string }>('select user_id from invoices where id=$1', [invoiceId], c);
      await c.query(`update users set premium_until = greatest(coalesce(premium_until, $2), $2) + interval '1 year' where id=$1`, [inv2!.user_id, now]);
      await c.query(`update wallet_entries set expires_at = null where consumer_id=$1 and kind='credit' and remaining_cents > 0`, [inv2!.user_id]);
    }
    // Pacotes de e-mail nacionais: credita ao pagar
    const orders = await q<{ id: string; business_id: string; emails: number }>(
      `select o.id, o.business_id, p.emails from package_orders o join campaign_packages p on p.id=o.package_id where o.invoice_id=$1 and o.credited_at is null for update of o`,
      [invoiceId],
      c,
    );
    for (const o of orders) {
      await c.query(
        `insert into business_email_credits (business_id, national_emails) values ($1,$2)
         on conflict (business_id) do update set national_emails = business_email_credits.national_emails + excluded.national_emails`,
        [o.business_id, o.emails],
      );
      await c.query('update package_orders set credited_at=$2 where id=$1', [o.id, now]);
    }
    await c.query(`insert into audit_log (actor_id, action, data) values ($1,'invoice_paid',$2)`, [actorId, { invoiceId }]);
    return { already: false };
  });
}

export async function markPaidByProviderRef(provider: string, ref: string, externalRef?: string | null) {
  let inv = await one<{ id: string }>('select id from invoices where provider=$1 and provider_ref=$2', [provider, ref]);
  if (!inv && externalRef && /^[0-9a-f-]{36}$/i.test(externalRef)) inv = await one<{ id: string }>('select id from invoices where id=$1', [externalRef]);
  if (!inv) return null;
  await markInvoicePaid(inv.id);
  return inv.id;
}

export async function buyPackage(businessId: string, actorId: string, packageId: string, now = new Date(), provider: PaymentProvider = paymentProvider()) {
  const invoiceId = await tx(async (c) => {
    const own = await one(`select 1 from business_members where business_id=$1 and user_id=$2 and role='owner'`, [businessId, actorId], c);
    if (!own) throw new UserError('Só o dono pode comprar pacotes');
    const pkg = await one<{ id: string; name: string; price_cents: string }>('select * from campaign_packages where id=$1 and active', [packageId], c);
    if (!pkg) throw new UserError('Pacote não encontrado');
    const inv = await one<{ id: string }>(
      `insert into invoices (business_id, amount_cents, due_date, created_at) values ($1,$2,$3,$4) returning id`,
      [businessId, pkg.price_cents, iso(new Date(now.getTime() + config.invoiceDueDays * DAY)), now],
      c,
    );
    await c.query(`insert into invoice_items (invoice_id, kind, description, amount_cents, ref_id) values ($1,'campaign_package',$2,$3,$4)`, [inv!.id, pkg.name, pkg.price_cents, pkg.id]);
    await c.query('insert into package_orders (business_id, package_id, invoice_id) values ($1,$2,$3)', [businessId, pkg.id, inv!.id]);
    return inv!.id;
  });
  await attachCharge(invoiceId, provider);
  await invoiceNotices([invoiceId]);
  return invoiceId;
}

/** Cliente assina o Premium: fatura anual; ativa quando paga */
export async function buyPremium(userId: string, now = new Date(), provider: PaymentProvider = paymentProvider()) {
  const invoiceId = await tx(async (c) => {
    const u = await one<{ role: string }>('select role from users where id=$1', [userId], c);
    if (u?.role !== 'consumer') throw new UserError('Só clientes podem assinar o Premium');
    const open = await one<{ id: string }>(
      `select i.id from invoices i join invoice_items it on it.invoice_id=i.id where i.user_id=$1 and i.status='pending' and it.kind='premium' limit 1`,
      [userId],
      c,
    );
    if (open) return open.id;
    const inv = await one<{ id: string }>(
      `insert into invoices (user_id, amount_cents, due_date, created_at) values ($1,$2,$3,$4) returning id`,
      [userId, premiumPriceCents(), iso(new Date(now.getTime() + config.invoiceDueDays * DAY)), now],
      c,
    );
    await c.query(`insert into invoice_items (invoice_id, kind, description, amount_cents) values ($1,'premium',$2,$3)`, [inv!.id, `${config.appName} Premium por 1 ano (saldo que nunca vence)`, premiumPriceCents()]);
    return inv!.id;
  });
  await attachCharge(invoiceId, provider);
  await invoiceNotices([invoiceId]);
  return invoiceId;
}

/** Cancelamento sem multa e sem perguntas: usa até o fim do mês e paga só o mês em uso */
export async function cancelSubscription(where: { userId?: string; businessId?: string }, now = new Date()) {
  await q(
    `update subscriptions set status='canceled', canceled_at=$2 where ${where.userId ? 'user_id' : 'business_id'}=$1 and status in ('trialing','active','past_due')`,
    [where.userId || where.businessId, now],
  );
  if (where.businessId)
    await q(`insert into audit_log (action, data) values ('business_canceled', $1)`, [{ businessId: where.businessId }]);
}

export async function reactivateSubscription(where: { userId?: string; businessId?: string }, now = new Date()) {
  // Antes do fim do mês: segue como estava. Depois da última fatura: recomeça no mês atual.
  await q(
    `update subscriptions set status = case when trial_ends_at > $2 then 'trialing' else 'active' end,
       canceled_at = null,
       current_period_end = case when final_billed_at is null then current_period_end else $3 end,
       final_billed_at = null
     where ${where.userId ? 'user_id' : 'business_id'}=$1 and status='canceled'`,
    [where.userId || where.businessId, now, nextMonthStart(now)],
  );
}

export async function subscriptionOf(where: { userId?: string; businessId?: string }) {
  return one<{ id: string; status: string; price_cents: string; billing_cycle: string; trial_ends_at: Date; current_period_end: Date }>(
    `select * from subscriptions where ${where.userId ? 'user_id' : 'business_id'}=$1`,
    [where.userId || where.businessId],
  );
}

export async function invoicesOf(where: { userId?: string; businessId?: string }) {
  const rows = await q<any>(
    `select i.*, coalesce(json_agg(json_build_object('description', it.description, 'amount_cents', it.amount_cents, 'kind', it.kind)) filter (where it.id is not null), '[]') items
     from invoices i left join invoice_items it on it.invoice_id=i.id
     where i.${where.userId ? 'user_id' : 'business_id'}=$1 group by i.id order by i.created_at desc limit 50`,
    [where.userId || where.businessId],
  );
  return rows;
}

export function describeSubscription(s: { status: string; trial_ends_at: Date; current_period_end: Date } | null, now = new Date()) {
  if (!s) return 'Sem assinatura';
  if (new Date(s.current_period_end).getUTCFullYear() >= 2999) return 'Grátis';
  if (s.status === 'trialing') return `Sem mensalidade até ${dateBR(s.trial_ends_at)}`;
  if (s.status === 'active') return `Ativa · próxima fatura em ${dateBR(s.current_period_end)}`;
  if (s.status === 'past_due') return 'Pagamento pendente';
  if (s.status === 'canceled') return new Date(s.current_period_end) > now ? `Cancelada sem multa: funciona até ${dateBR(new Date(new Date(s.current_period_end).getTime() - DAY))}` : 'Cancelada';
  return s.status;
}

export { brl };
export const _pool = pool;
