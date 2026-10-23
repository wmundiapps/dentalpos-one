-- Modelo C: cliente grátis (Premium opcional), loja 6 meses grátis + R$ 49,90/mês + 20% do cashback usado.
-- Promoção de boas-vindas, nota fiscal enviada pelo cliente, verificação de celular.

-- Promoções para clientes novos
alter table cashback_rules add column audience text not null default 'all' check (audience in ('all','new_customer'));
alter table cashback_rules add column new_window_days int; -- null = só na primeira compra; N = primeiros N dias desde a primeira compra

-- Compras lançadas pelo cliente (nota fiscal) aguardando a loja
alter table purchases drop constraint purchases_status_check;
alter table purchases add constraint purchases_status_check check (status in ('confirmed','canceled','pending','rejected'));
alter table purchases add column source text not null default 'store' check (source in ('store','customer'));
alter table purchases add column nfce_key text;
alter table purchases add column decided_at timestamptz;
alter table purchases add column decided_by uuid references users(id);
alter table purchases add column reject_reason text;
create unique index purchases_nfce_uq on purchases (nfce_key) where nfce_key is not null and status <> 'rejected';
create index purchases_pending_idx on purchases (business_id, created_at) where status = 'pending';
create index purchases_claims_idx on purchases (consumer_id, created_at) where source = 'customer';

-- Celular verificado e Premium
alter table users add column phone_verified_at timestamptz;
alter table users add column premium_until timestamptz;
create unique index users_phone_verified_uq on users (phone) where phone_verified_at is not null and role = 'consumer';

create table phone_codes (
  user_id uuid primary key references users(id) on delete cascade,
  phone text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0
);

alter table invoice_items drop constraint invoice_items_kind_check;
alter table invoice_items add constraint invoice_items_kind_check check (kind in ('subscription','cashback_fee','campaign_package','premium'));

-- Clientes passam a ser grátis: a assinatura vira um registro sem cobrança
update subscriptions set price_cents = 0, status = 'active', current_period_end = '2999-12-31'
 where plan = 'consumer';
