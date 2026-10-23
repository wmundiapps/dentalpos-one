import { PoolClient } from 'pg';
import { one, q, tx, UserError, Db } from '../db';
import { config } from '../config';
import { onlyDigits } from '../format';
import { cashbackNotice } from './messages';

export type Rule = {
  id: string;
  title: string;
  kind: 'fixed' | 'percent';
  value: number;
  min_purchase_cents: number | string;
  max_cashback_cents: number | string | null;
  weekdays: number[] | null;
  release_days: number;
  expires_days: number;
  active: boolean;
  starts_at: string | Date | null;
  ends_at: string | Date | null;
  audience?: 'all' | 'new_customer';
  new_window_days?: number | null;
};

/** Situação do cliente nesta loja, para as promoções de boas-vindas */
export type CustomerStatus = { firstPurchaseAt: Date | null; welcomeAllowed: boolean };

/** A regra vale para este cliente? (promoções de boas-vindas só para clientes novos da loja) */
export function ruleAppliesTo(rule: Rule, st: CustomerStatus, when: Date) {
  if ((rule.audience || 'all') === 'all') return true;
  if (!st.welcomeAllowed) return false;
  if (!st.firstPurchaseAt) return true; // primeira compra
  if (!rule.new_window_days) return false; // promoção só da primeira compra
  return when.getTime() - st.firstPurchaseAt.getTime() <= rule.new_window_days * 86400000;
}

/** Dia da semana e data (AAAA-MM-DD) no fuso de São Paulo */
export function spDateParts(d: Date) {
  const s = d.toLocaleString('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' });
  // ex.: "Thu, 2026-10-15"
  const m = s.match(/(\w{3}),?\s*(\d{4}-\d{2}-\d{2})/);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  if (m) return { weekday: days.indexOf(m[1]), date: m[2] };
  const alt = d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const wd = new Date(alt + 'T12:00:00Z').getUTCDay();
  return { weekday: wd, date: alt };
}

const isoDate = (v: string | Date | null) => (v == null ? null : typeof v === 'string' ? v.slice(0, 10) : v.toISOString().slice(0, 10));

/** Cashback de uma regra para um valor pago (centavos). 0 se a regra não se aplica. */
export function cashbackFor(rule: Rule, paidCents: number, when: Date): number {
  if (!rule.active || paidCents <= 0) return 0;
  if (paidCents < Number(rule.min_purchase_cents || 0)) return 0;
  const { weekday, date } = spDateParts(when);
  if (rule.weekdays && rule.weekdays.length && !rule.weekdays.includes(weekday)) return 0;
  const s = isoDate(rule.starts_at), e = isoDate(rule.ends_at);
  if (s && date < s) return 0;
  if (e && date > e) return 0;
  let cb = rule.kind === 'fixed' ? rule.value : Math.floor((paidCents * rule.value) / 10000);
  if (rule.max_cashback_cents != null) cb = Math.min(cb, Number(rule.max_cashback_cents));
  return Math.max(0, Math.min(cb, paidCents));
}

/** Escolhe a regra que dá mais cashback ao cliente */
export function bestRule(rules: Rule[], paidCents: number, when: Date, st: CustomerStatus = { firstPurchaseAt: null, welcomeAllowed: false }) {
  let best: { rule: Rule; cents: number } | null = null;
  for (const r of rules) {
    if (!ruleAppliesTo(r, st, when)) continue;
    const cents = cashbackFor(r, paidCents, when);
    if (cents > 0 && (!best || cents > best.cents)) best = { rule: r, cents };
  }
  return best;
}

/** Taxa da plataforma: 20% do cashback usado pelo cliente (ou do concedido, se configurado) */
export function feeFor(cashbackCents: number, redeemedCents: number, inTrial: boolean) {
  if (inTrial && !config.feeDuringTrial) return 0;
  const base = config.feeBase === 'redeemed' ? redeemedCents : cashbackCents;
  return Math.round((base * config.cashbackFeeBps) / 10000);
}

/** Primeira compra do cliente na loja e se ele pode receber promoção de boas-vindas */
export async function customerStatus(c: Db, consumerId: string, businessId: string): Promise<CustomerStatus> {
  const r = await one<{ first: Date | null; verified: Date | null }>(
    `select (select min(created_at) from purchases where consumer_id=$1 and business_id=$2 and status='confirmed') first,
            (select phone_verified_at from users where id=$1) verified`,
    [consumerId, businessId],
    c,
  );
  return { firstPurchaseAt: r?.first ? new Date(r.first) : null, welcomeAllowed: !config.requirePhoneVerification || !!r?.verified };
}

export async function isPremium(c: Db, consumerId: string, now = new Date()) {
  const r = await one<{ premium_until: Date | null }>('select premium_until from users where id=$1', [consumerId], c);
  return !!r?.premium_until && new Date(r.premium_until) > now;
}

/** Credita o cashback na carteira. Premium: o saldo nunca vence. */
export async function creditWallet(c: PoolClient, p: { consumerId: string; businessId: string; purchaseId: string; cents: number; rule: Pick<Rule, 'release_days' | 'expires_days'> }, now: Date) {
  const availableAt = new Date(now.getTime() + (p.rule.release_days || 0) * 86400000);
  const premium = await isPremium(c, p.consumerId, now);
  const expiresAt = premium ? null : new Date(availableAt.getTime() + Math.max(config.minExpiresDays, p.rule.expires_days) * 86400000);
  await c.query(
    `insert into wallet_entries (consumer_id, business_id, purchase_id, kind, amount_cents, remaining_cents, available_at, expires_at, created_at)
     values ($1,$2,$3,'credit',$4,$4,$5,$6,$7)`,
    [p.consumerId, p.businessId, p.purchaseId, p.cents, availableAt, expiresAt, now],
  );
  return { availableAt, expiresAt };
}

export async function findConsumer(identifier: string, db: Db) {
  const raw = String(identifier || '').trim();
  const digits = onlyDigits(raw);
  return one<{ id: string; name: string; email: string; member_code: string }>(
    `select id, name, email, member_code from users where role='consumer' and (
       member_code = upper($1) or ($2 <> '' and (cpf = $2 or phone = $2)) or lower(email) = lower($1)
     ) limit 1`,
    [raw, digits.length >= 10 ? digits : ''],
    db,
  );
}

/** Assinatura ativa = em teste, ativa, ou cancelada mas ainda dentro do período pago */
export async function subscriptionState(db: Db, where: { userId?: string; businessId?: string }, now = new Date()) {
  const s = await one<{ status: string; trial_ends_at: Date; current_period_end: Date }>(
    `select status, trial_ends_at, current_period_end from subscriptions where ${where.userId ? 'user_id' : 'business_id'} = $1`,
    [where.userId || where.businessId],
    db,
  );
  if (!s) return { ok: false, trial: false, status: 'none' };
  const trial = s.status === 'trialing' && new Date(s.trial_ends_at) > now;
  const ok = s.status === 'trialing' || s.status === 'active' || (s.status === 'canceled' && new Date(s.current_period_end) > now);
  return { ok, trial, status: s.status };
}

async function availableBalance(c: Db, consumerId: string, businessId: string, now: Date) {
  const r = await one<{ v: string }>(
    `select coalesce(sum(remaining_cents),0) v from wallet_entries
     where consumer_id=$1 and business_id=$2 and kind='credit' and remaining_cents > 0 and available_at <= $3 and (expires_at is null or expires_at > $3)`,
    [consumerId, businessId, now],
    c,
  );
  return Number(r!.v);
}

/** Debita saldo usando os créditos que vencem primeiro */
async function debitFifo(c: PoolClient, consumerId: string, businessId: string, cents: number, purchaseId: string, now: Date) {
  const credits = await q<{ id: string; remaining_cents: string }>(
    `select id, remaining_cents from wallet_entries
     where consumer_id=$1 and business_id=$2 and kind='credit' and remaining_cents > 0 and available_at <= $3 and (expires_at is null or expires_at > $3)
     order by expires_at nulls last, created_at for update`,
    [consumerId, businessId, now],
    c,
  );
  let left = cents;
  for (const cr of credits) {
    if (left <= 0) break;
    const take = Math.min(left, Number(cr.remaining_cents));
    await c.query('update wallet_entries set remaining_cents = remaining_cents - $2 where id=$1', [cr.id, take]);
    left -= take;
  }
  if (left > 0) throw new UserError('Saldo insuficiente');
  await c.query(
    `insert into wallet_entries (consumer_id, business_id, purchase_id, kind, amount_cents, available_at) values ($1,$2,$3,'debit',$4,$5)`,
    [consumerId, businessId, purchaseId, -cents, now],
  );
}

export async function generateRedemptionCode(consumerId: string, businessId: string, now = new Date()) {
  return tx(async (c) => {
    const bal = await availableBalance(c, consumerId, businessId, now);
    if (bal <= 0) throw new UserError('Você ainda não tem saldo liberado nesta loja');
    await c.query('delete from redemption_codes where consumer_id=$1 and business_id=$2 and used_at is null', [consumerId, businessId]);
    let code = '';
    for (let i = 0; i < 10; i++) {
      code = String(Math.floor(100000 + Math.random() * 900000));
      const ex = await one('select 1 from redemption_codes where code=$1', [code], c);
      if (!ex) break;
    }
    const expires = new Date(now.getTime() + config.redemptionCodeMinutes * 60000);
    await c.query('insert into redemption_codes (code, consumer_id, business_id, max_cents, expires_at) values ($1,$2,$3,$4,$5)', [code, consumerId, businessId, bal, expires]);
    return { code, maxCents: bal, expiresAt: expires };
  });
}

export type PurchaseInput = {
  businessId: string;
  actorId: string;
  customer: string; // código de membro, CPF, celular ou e-mail
  amountCents: number;
  redemptionCode?: string;
  receipt?: string;
  nfceKey?: string | null; // chave da NFC-e lida no caixa (evita lançamento em dobro)
};

export async function registerPurchase(input: PurchaseInput, now = new Date()) {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new UserError('Informe o valor da compra');
  if (input.amountCents > 100_000_00) throw new UserError('Valor acima do limite por compra (R$ 100.000)');
  return tx(async (c) => {
    const member = await one(`select role from business_members where business_id=$1 and user_id=$2`, [input.businessId, input.actorId], c);
    if (!member) throw new UserError('Você não tem acesso a esta empresa');
    const biz = await one<{ id: string; status: string }>('select id, status from businesses where id=$1 for update', [input.businessId], c);
    if (!biz || biz.status !== 'active') throw new UserError('Empresa bloqueada');
    const bSub = await subscriptionState(c, { businessId: input.businessId }, now);
    if (!bSub.ok) throw new UserError('A assinatura da empresa está vencida. Regularize a fatura para voltar a lançar compras.');

    const consumer = await findConsumer(input.customer, c);
    if (!consumer) throw new UserError('Cliente não encontrado. Confira o código, CPF, celular ou e-mail.');

    // Evita lançamento em dobro: mesma nota, ou nota que o cliente já enviou
    const nfceKey = input.nfceKey || null;
    const nfceNumber = nfceKey ? String(Number(nfceKey.slice(25, 34))) : null;
    if (nfceKey) {
      const same = await one<{ id: string; status: string; consumer_id: string; business_id: string }>(
        `select id, status, consumer_id, business_id from purchases where nfce_key=$1 and status <> 'rejected' for update`,
        [nfceKey],
        c,
      );
      if (same && same.status === 'pending' && same.consumer_id === consumer.id && same.business_id === input.businessId) {
        return { ...(await approveClaimTx(c, same.id, input.actorId, now)), merged: true };
      }
      if (same) throw new UserError('Esta nota fiscal já foi lançada.');
    }
    if (!input.redemptionCode) {
      const pending = await one<{ id: string }>(
        `select id from purchases where status='pending' and consumer_id=$1 and business_id=$2 and amount_cents=$3
         and created_at > $4 order by created_at desc limit 1 for update`,
        [consumer.id, input.businessId, input.amountCents, new Date(now.getTime() - config.claimMergeHours * 3600000)],
        c,
      );
      if (pending) return { ...(await approveClaimTx(c, pending.id, input.actorId, now)), merged: true };
    }

    // Resgate de saldo
    let redeemed = 0;
    let code: { code: string; max_cents: string } | null = null;
    if (input.redemptionCode) {
      code = await one(
        `select code, max_cents from redemption_codes where code=$1 and consumer_id=$2 and business_id=$3 and used_at is null and expires_at > $4 for update`,
        [onlyDigits(input.redemptionCode), consumer.id, input.businessId, now],
        c,
      );
      if (!code) throw new UserError('Código de resgate inválido ou vencido. Peça ao cliente para gerar outro no app.');
      const bal = await availableBalance(c, consumer.id, input.businessId, now);
      redeemed = Math.min(Number(code.max_cents), bal, input.amountCents);
    }
    const paid = input.amountCents - redeemed;

    const cSub = await subscriptionState(c, { userId: consumer.id }, now);
    let cashback = 0;
    let rule: Rule | null = null;
    let warning: string | null = null;
    if (cSub.ok) {
      const rules = await q<Rule>('select * from cashback_rules where business_id=$1 and active', [input.businessId], c);
      const st = await customerStatus(c, consumer.id, input.businessId);
      const best = bestRule(rules, paid, now, st);
      if (best) {
        cashback = best.cents;
        rule = best.rule;
      }
    } else {
      warning = 'A assinatura do cliente está vencida: a compra foi registrada sem cashback.';
    }
    const fee = feeFor(cashback, redeemed, bSub.trial);

    const p = await one<{ id: string }>(
      `insert into purchases (business_id, consumer_id, rule_id, amount_cents, redeemed_cents, cashback_cents, fee_cents, receipt, created_by, created_at, nfce_key, nf_number)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id`,
      [input.businessId, consumer.id, rule?.id || null, input.amountCents, redeemed, cashback, fee, input.receipt || null, input.actorId, now, nfceKey, nfceNumber],
      c,
    );
    if (redeemed > 0) {
      await debitFifo(c, consumer.id, input.businessId, redeemed, p!.id, now);
      await c.query('update redemption_codes set used_at=$2 where code=$1', [code!.code, now]);
    }
    let availableAt = now;
    if (cashback > 0) {
      availableAt = (await creditWallet(c, { consumerId: consumer.id, businessId: input.businessId, purchaseId: p!.id, cents: cashback, rule: rule! }, now)).availableAt;
      await cashbackNotice(p!.id, c);
    }
    return {
      merged: false,
      purchaseId: p!.id,
      consumerId: consumer.id,
      customerName: consumer.name,
      amountCents: input.amountCents,
      redeemedCents: redeemed,
      paidCents: paid,
      cashbackCents: cashback,
      feeCents: fee,
      availableAt,
      ruleTitle: rule?.title || null,
      warning,
    };
  });
}

/** Confirma uma nota enviada pelo cliente: credita o cashback calculado no envio */
export async function approveClaimTx(c: PoolClient, purchaseId: string, actorId: string | null, now: Date) {
  const p = await one<any>(
    `select p.*, u.name customer_name, r.release_days, r.expires_days, r.title rule_title
     from purchases p join users u on u.id=p.consumer_id left join cashback_rules r on r.id=p.rule_id
     where p.id=$1 for update of p`,
    [purchaseId],
    c,
  );
  if (!p) throw new UserError('Compra não encontrada');
  if (p.status !== 'pending') throw new UserError('Esta compra já foi decidida');
  await c.query(`update purchases set status='confirmed', decided_at=$2, decided_by=$3 where id=$1`, [p.id, now, actorId]);
  let availableAt = now;
  const cents = Number(p.cashback_cents);
  if (cents > 0) {
    availableAt = (await creditWallet(c, { consumerId: p.consumer_id, businessId: p.business_id, purchaseId: p.id, cents, rule: { release_days: p.release_days ?? 0, expires_days: p.expires_days ?? 180 } }, now)).availableAt;
    await cashbackNotice(p.id, c);
  }
  return {
    purchaseId: p.id as string,
    consumerId: p.consumer_id as string,
    customerName: p.customer_name as string,
    amountCents: Number(p.amount_cents),
    redeemedCents: 0,
    paidCents: Number(p.amount_cents),
    cashbackCents: cents,
    feeCents: 0,
    availableAt,
    ruleTitle: (p.rule_title as string) || null,
    warning: null as string | null,
  };
}

export async function cancelPurchase(purchaseId: string, actorId: string, now = new Date()) {
  return tx(async (c) => {
    const p = await one<{ id: string; business_id: string; consumer_id: string; status: string; created_at: Date; redeemed_cents: string; fee_invoice_id: string | null }>(
      'select * from purchases where id=$1 for update',
      [purchaseId],
      c,
    );
    if (!p) throw new UserError('Compra não encontrada');
    const member = await one('select 1 from business_members where business_id=$1 and user_id=$2', [p.business_id, actorId], c);
    if (!member) throw new UserError('Você não tem acesso a esta empresa');
    if (p.status === 'canceled') throw new UserError('Compra já cancelada');
    if (now.getTime() - new Date(p.created_at).getTime() > config.cancelWindowDays * 86400000)
      throw new UserError(`Só é possível cancelar compras dos últimos ${config.cancelWindowDays} dias`);
    if (p.fee_invoice_id) throw new UserError('A taxa desta compra já foi faturada; fale com o suporte para estornar');

    // Estorna o cashback ainda não usado
    const credit = await one<{ id: string; remaining_cents: string }>(
      `select id, remaining_cents from wallet_entries where purchase_id=$1 and kind='credit' for update`,
      [p.id],
      c,
    );
    let reversed = 0;
    if (credit && Number(credit.remaining_cents) > 0) {
      reversed = Number(credit.remaining_cents);
      await c.query('update wallet_entries set remaining_cents=0 where id=$1', [credit.id]);
      await c.query(
        `insert into wallet_entries (consumer_id, business_id, purchase_id, kind, amount_cents, available_at) values ($1,$2,$3,'reversal',$4,$5)`,
        [p.consumer_id, p.business_id, p.id, -reversed, now],
      );
    }
    // Devolve o saldo que foi usado nesta compra
    const redeemed = Number(p.redeemed_cents);
    if (redeemed > 0) {
      await c.query(
        `insert into wallet_entries (consumer_id, business_id, purchase_id, kind, amount_cents, remaining_cents, available_at, expires_at)
         values ($1,$2,$3,'credit',$4,$4,$5,$6)`,
        [p.consumer_id, p.business_id, p.id, redeemed, now, new Date(now.getTime() + 90 * 86400000)],
      );
    }
    await c.query(`update purchases set status='canceled', fee_cents=0 where id=$1`, [p.id]);
    return { reversedCents: reversed, restoredCents: redeemed };
  });
}

/** Zera créditos vencidos (rodado pelo agendador diário) */
export async function expireCredits(now = new Date()) {
  return tx(async (c) => {
    const rows = await q<{ id: string; consumer_id: string; business_id: string; remaining_cents: string }>(
      `select id, consumer_id, business_id, remaining_cents from wallet_entries
       where kind='credit' and remaining_cents > 0 and expires_at <= $1 for update skip locked limit 5000`,
      [now],
      c,
    );
    for (const r of rows) {
      await c.query('update wallet_entries set remaining_cents=0 where id=$1', [r.id]);
      await c.query(
        `insert into wallet_entries (consumer_id, business_id, kind, amount_cents, available_at) values ($1,$2,'expire',$3,$4)`,
        [r.consumer_id, r.business_id, -Number(r.remaining_cents), now],
      );
    }
    return rows.length;
  });
}

export async function walletSummary(consumerId: string, now = new Date()) {
  return q<{ business_id: string; name: string; category: string; city: string; available: string; pending: string; next_expiry: Date | null }>(
    `select b.id business_id, b.name, b.category, b.city,
       coalesce(sum(w.remaining_cents) filter (where w.available_at <= $2 and (w.expires_at is null or w.expires_at > $2)),0) available,
       coalesce(sum(w.remaining_cents) filter (where w.available_at > $2),0) pending,
       min(w.expires_at) filter (where w.remaining_cents > 0 and w.expires_at > $2) next_expiry
     from wallet_entries w join businesses b on b.id = w.business_id
     where w.consumer_id = $1 and w.kind='credit'
     group by b.id having sum(w.remaining_cents) > 0
     order by available desc`,
    [consumerId, now],
  );
}

export async function walletHistory(consumerId: string, limit = 50) {
  return q<{ id: string; kind: string; amount_cents: string; created_at: Date; available_at: Date; business: string }>(
    `select w.id, w.kind, w.amount_cents, w.created_at, w.available_at, b.name business
     from wallet_entries w join businesses b on b.id=w.business_id where w.consumer_id=$1 order by w.created_at desc limit $2`,
    [consumerId, limit],
  );
}

export async function rulesFor(businessId: string) {
  return q<Rule & { business_id: string }>('select * from cashback_rules where business_id=$1 order by active desc, created_at', [businessId]);
}

export type RuleInput = {
  title: string;
  kind: 'fixed' | 'percent';
  value: number;
  minPurchaseCents?: number;
  maxCashbackCents?: number | null;
  weekdays?: number[] | null;
  releaseDays?: number;
  expiresDays?: number;
  startsAt?: string | null;
  endsAt?: string | null;
  audience?: 'all' | 'new_customer';
  newWindowDays?: number | null;
};

function validateRule(r: RuleInput) {
  if (!r.title || r.title.trim().length < 2) throw new UserError('Dê um nome para a regra');
  if (!['fixed', 'percent'].includes(r.kind)) throw new UserError('Tipo de cashback inválido');
  if (!Number.isInteger(r.value) || r.value <= 0) throw new UserError('Informe o valor do cashback');
  if (r.kind === 'percent' && r.value > 10000) throw new UserError('O percentual não pode passar de 100%');
  if ((r.releaseDays ?? 0) < 0 || (r.releaseDays ?? 0) > 60) throw new UserError('Carência deve ser de 0 a 60 dias');
  if ((r.expiresDays ?? 180) < config.minExpiresDays || (r.expiresDays ?? 180) > 730) throw new UserError(`A validade do saldo deve ser de ${config.minExpiresDays} a 730 dias`);
  if (r.audience && !['all', 'new_customer'].includes(r.audience)) throw new UserError('Público inválido');
  if (r.newWindowDays != null && (!Number.isInteger(r.newWindowDays) || r.newWindowDays < 1 || r.newWindowDays > 365)) throw new UserError('O período da promoção deve ser de 1 a 365 dias');
  if (r.startsAt && r.endsAt && r.endsAt < r.startsAt) throw new UserError('A data final é anterior à inicial');
}

async function assertMember(c: Db, businessId: string, userId: string, ownerOnly = false) {
  const m = await one<{ role: string }>('select role from business_members where business_id=$1 and user_id=$2', [businessId, userId], c);
  if (!m || (ownerOnly && m.role !== 'owner')) throw new UserError('Sem permissão para esta empresa');
}

export async function saveRule(businessId: string, actorId: string, r: RuleInput, ruleId?: string) {
  validateRule(r);
  return tx(async (c) => {
    await assertMember(c, businessId, actorId, true);
    const audience = r.audience || 'all';
    const vals = [r.title.trim(), r.kind, r.value, r.minPurchaseCents || 0, r.maxCashbackCents ?? null, r.weekdays && r.weekdays.length ? r.weekdays : null, r.releaseDays ?? 0, r.expiresDays ?? 180, r.startsAt || null, r.endsAt || null, audience, audience === 'new_customer' ? r.newWindowDays ?? null : null];
    if (ruleId) {
      const row = await one<{ id: string }>(
        `update cashback_rules set title=$1, kind=$2, value=$3, min_purchase_cents=$4, max_cashback_cents=$5, weekdays=$6, release_days=$7, expires_days=$8, starts_at=$9, ends_at=$10, audience=$11, new_window_days=$12
         where id=$13 and business_id=$14 returning id`,
        [...vals, ruleId, businessId],
        c,
      );
      if (!row) throw new UserError('Regra não encontrada');
      return row.id;
    }
    const row = await one<{ id: string }>(
      `insert into cashback_rules (title, kind, value, min_purchase_cents, max_cashback_cents, weekdays, release_days, expires_days, starts_at, ends_at, audience, new_window_days, business_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning id`,
      [...vals, businessId],
      c,
    );
    return row!.id;
  });
}

export async function toggleRule(businessId: string, actorId: string, ruleId: string, active: boolean) {
  return tx(async (c) => {
    await assertMember(c, businessId, actorId, true);
    await c.query('update cashback_rules set active=$3 where id=$1 and business_id=$2', [ruleId, businessId, active]);
  });
}
