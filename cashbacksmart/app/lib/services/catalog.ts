import { one, q, UserError } from '../db';

export async function businessesIn(state: string, city: string, opts: { category?: string; search?: string; limit?: number; offset?: number } = {}) {
  const params: unknown[] = [state, city];
  let extra = '';
  if (opts.category) {
    params.push(opts.category);
    extra += ` and b.category = $${params.length}`;
  }
  if (opts.search) {
    params.push('%' + opts.search.toLowerCase() + '%');
    extra += ` and (lower(b.name) like $${params.length} or lower(b.neighborhood) like $${params.length})`;
  }
  params.push(opts.limit || 30, opts.offset || 0);
  return q<any>(
    `select b.id, b.name, b.category, b.neighborhood, b.address, b.city, b.state,
       (select json_build_object('kind', r.kind, 'value', r.value, 'title', r.title, 'restricted', (r.weekdays is not null or r.min_purchase_cents > 0 or r.ends_at is not null)) from cashback_rules r
         where r.business_id=b.id and r.active order by case when r.kind='percent' then r.value*100 else r.value end desc limit 1) best_rule
     from businesses b
     where b.status='active' and b.state=$1 and lower(b.city)=lower($2) ${extra}
       and exists (select 1 from subscriptions s where s.business_id=b.id and (s.status in ('trialing','active') or (s.status='canceled' and s.current_period_end > now())))
     order by b.created_at desc limit $${params.length - 1} offset $${params.length}`,
    params,
  );
}

export async function businessPublic(id: string) {
  const b = await one<any>('select id, name, category, description, address, neighborhood, city, state, phone from businesses where id=$1 and status=$2', [id, 'active']);
  if (!b) throw new UserError('Loja não encontrada');
  const rules = await q<any>('select * from cashback_rules where business_id=$1 and active order by created_at', [id]);
  return { ...b, rules };
}

export async function updateBusiness(businessId: string, actorId: string, d: { name: string; description: string; address: string; neighborhood: string; phone: string; category: string }) {
  const own = await one(`select 1 from business_members where business_id=$1 and user_id=$2 and role='owner'`, [businessId, actorId]);
  if (!own) throw new UserError('Só o dono pode editar a empresa');
  if (!d.name || d.name.trim().length < 2) throw new UserError('Informe o nome da empresa');
  await q('update businesses set name=$2, description=$3, address=$4, neighborhood=$5, phone=$6, category=$7 where id=$1', [businessId, d.name.trim(), d.description.trim(), d.address.trim(), d.neighborhood.trim(), d.phone.trim(), d.category]);
}

export async function businessDashboard(businessId: string, now = new Date()) {
  const s = await one<any>(
    `select
       count(*) filter (where status='confirmed' and created_at >= date_trunc('month', $2::timestamptz)) purchases_month,
       coalesce(sum(amount_cents) filter (where status='confirmed' and created_at >= date_trunc('month', $2::timestamptz)),0) sales_month,
       coalesce(sum(cashback_cents) filter (where status='confirmed' and created_at >= date_trunc('month', $2::timestamptz)),0) cashback_month,
       coalesce(sum(redeemed_cents) filter (where status='confirmed' and created_at >= date_trunc('month', $2::timestamptz)),0) redeemed_month,
       coalesce(sum(fee_cents) filter (where status='confirmed' and fee_invoice_id is null),0) fee_open,
       count(distinct consumer_id) filter (where status='confirmed') customers,
       count(distinct consumer_id) filter (where status='confirmed' and created_at >= date_trunc('month', $2::timestamptz)) customers_month
     from purchases where business_id=$1`,
    [businessId, now],
  );
  const returning = await one<{ n: string }>(
    `select count(*) n from (select consumer_id from purchases where business_id=$1 and status='confirmed' group by consumer_id having count(*) > 1) t`,
    [businessId],
  );
  const leads = await one<{ n: string }>(`select count(*) n from lead_deliveries where business_id=$1 and status='new'`, [businessId]);
  return { ...s, returning_customers: Number(returning!.n), leads_new: Number(leads!.n) };
}

export async function recentPurchases(businessId: string, limit = 30) {
  return q<any>(
    `select p.*, u.name customer, u.member_code from purchases p join users u on u.id=p.consumer_id where p.business_id=$1 order by p.created_at desc limit $2`,
    [businessId, limit],
  );
}

export async function consumerPurchases(consumerId: string, limit = 30) {
  return q<any>(
    `select p.*, b.name business from purchases p join businesses b on b.id=p.business_id where p.consumer_id=$1 order by p.created_at desc limit $2`,
    [consumerId, limit],
  );
}

export async function staffOf(businessId: string) {
  return q<any>(`select u.id, u.name, u.email, m.role from business_members m join users u on u.id=m.user_id where m.business_id=$1 order by m.role, u.name`, [businessId]);
}

export async function adminStats() {
  return one<any>(
    `select
      (select count(*) from users where role='consumer') consumers,
      (select count(*) from businesses) businesses,
      (select count(*) from subscriptions where status='trialing') trialing,
      (select count(*) from subscriptions where status='active') active,
      (select count(*) from subscriptions where status='past_due') past_due,
      (select coalesce(sum(amount_cents),0) from invoices where status='paid' and paid_at >= date_trunc('month', now())) paid_month,
      (select coalesce(sum(amount_cents),0) from invoices where status='pending') pending_total,
      (select coalesce(sum(cashback_cents),0) from purchases where status='confirmed') cashback_total,
      (select count(*) from purchases where status='confirmed') purchases,
      (select count(*) from email_outbox where status='sent') emails_sent`,
  );
}

export async function adminList(kind: 'businesses' | 'consumers' | 'invoices', search = '', limit = 50) {
  const s = '%' + search.toLowerCase() + '%';
  if (kind === 'businesses')
    return q<any>(
      `select b.id, b.name, b.category, b.city, b.state, b.status, b.created_at, s.status sub_status, u.email owner_email
       from businesses b join users u on u.id=b.owner_id left join subscriptions s on s.business_id=b.id
       where lower(b.name) like $1 or lower(u.email) like $1 or lower(b.city) like $1 order by b.created_at desc limit $2`,
      [s, limit],
    );
  if (kind === 'consumers')
    return q<any>(
      `select u.id, u.name, u.email, u.city, u.state, u.created_at, s.status sub_status
       from users u left join subscriptions s on s.user_id=u.id
       where u.role='consumer' and (lower(u.name) like $1 or lower(u.email) like $1 or lower(u.city) like $1) order by u.created_at desc limit $2`,
      [s, limit],
    );
  return q<any>(
    `select i.*, coalesce(b.name, u.name) who, case when i.business_id is not null then 'Empresa' else 'Pessoa física' end who_kind
     from invoices i left join businesses b on b.id=i.business_id left join users u on u.id=i.user_id
     where lower(coalesce(b.name, u.name)) like $1 order by (i.status='pending') desc, i.created_at desc limit $2`,
    [s, limit],
  );
}

export async function setBusinessStatus(id: string, status: 'active' | 'blocked') {
  await q('update businesses set status=$2 where id=$1', [id, status]);
}
