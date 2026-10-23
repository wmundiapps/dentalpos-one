import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import { PoolClient } from 'pg';
import { one, q, tx, UserError, Db } from '../db';
import { config, CATEGORIES, STATES } from '../config';
import { isValidCNPJ, isValidCPF, onlyDigits } from '../format';
import { passwordProblem } from '../security';
import { BCRYPT_COST } from './security';
import { nextMonthStart } from './billing';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function randomCode(len: number) {
  const bytes = crypto.randomBytes(len);
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  return s;
}

const SMALL = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
/** "SÃO josé dos campos" -> "São José dos Campos" */
export function titleCity(v: string) {
  return v
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('pt-BR')
    .split(' ')
    .map((w, i) => (i > 0 && SMALL.has(w) ? w : w.charAt(0).toLocaleUpperCase('pt-BR') + w.slice(1)))
    .join(' ');
}

const base = {
  name: z.string().trim().min(2, 'Informe seu nome'),
  email: z.string().trim().toLowerCase().email('E-mail inválido'),
  phone: z.string().trim().transform(onlyDigits).refine((v) => v.length >= 10 && v.length <= 11, 'Celular com DDD inválido'),
  password: z.string().min(8, 'A senha precisa ter pelo menos 8 caracteres'),
  city: z.string().trim().min(2, 'Informe a cidade').transform(titleCity),
  state: z.string().trim().toUpperCase().refine((v) => STATES.includes(v), 'UF inválida'),
};

export const consumerSchema = z.object({
  ...base,
  cpf: z.string().transform(onlyDigits).refine(isValidCPF, 'CPF inválido'),
  referral: z.string().trim().toUpperCase().optional().or(z.literal('')),
  acceptAds: z.literal(true, { message: 'Para participar, é preciso aceitar receber ofertas das empresas participantes' }),
});

export const businessSchema = z.object({
  ...base,
  businessName: z.string().trim().min(2, 'Informe o nome da empresa'),
  cnpj: z.string().optional().transform((v) => (v ? onlyDigits(v) : '')).refine((v) => isValidCNPJ(v), 'Informe um CNPJ válido (usado para reconhecer as notas fiscais da loja)'),
  category: z.string().refine((v) => CATEGORIES.includes(v), 'Escolha uma categoria'),
  address: z.string().trim().optional().default(''),
  neighborhood: z.string().trim().optional().default(''),
  cashbackKind: z.enum(['fixed', 'percent']),
  cashbackValue: z.number().int().positive('Informe o valor do cashback'),
  welcome: z
    .object({ kind: z.enum(['fixed', 'percent']), value: z.number().int().positive('Informe o valor da promoção de boas-vindas'), windowDays: z.number().int().min(1).max(365).nullable() })
    .nullable()
    .optional(),
  acceptAds: z.literal(true, { message: 'É preciso aceitar os termos de participação' }),
});

export type ConsumerInput = z.input<typeof consumerSchema>;
export type BusinessInput = z.input<typeof businessSchema>;

function firstError(e: z.ZodError) {
  return e.issues[0]?.message || 'Dados inválidos';
}

async function uniqueCode(c: Db, column: 'member_code' | 'referral_code', len: number) {
  for (let i = 0; i < 10; i++) {
    const code = randomCode(len);
    const exists = await one(`select 1 from users where ${column} = $1`, [code], c);
    if (!exists) return code;
  }
  throw new Error('Não foi possível gerar código único');
}

function addDays(d: Date, days: number) {
  return new Date(d.getTime() + days * 86400000);
}

async function insertUser(c: PoolClient, role: string, d: { name: string; email: string; phone: string; password: string; city: string; state: string; cpf?: string | null; referredBy?: string | null }) {
  const dup = await one('select 1 from users where lower(email) = lower($1)', [d.email], c);
  if (dup) throw new UserError('Já existe uma conta com este e-mail');
  if (d.cpf) {
    const dupCpf = await one('select 1 from users where cpf = $1', [d.cpf], c);
    if (dupCpf) throw new UserError('Já existe uma conta com este CPF');
  }
  const prob = passwordProblem(d.password, d.email);
  if (prob) throw new UserError(prob);
  const hash = await bcrypt.hash(d.password, BCRYPT_COST);
  const member = await uniqueCode(c, 'member_code', 8);
  const referral = await uniqueCode(c, 'referral_code', 6);
  const u = await one<{ id: string }>(
    `insert into users (role, name, email, phone, cpf, password_hash, city, state, member_code, referral_code, referred_by, ads_accepted_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now()) returning id`,
    [role, d.name, d.email, d.phone, d.cpf || null, hash, d.city, d.state, member, referral, d.referredBy || null],
    c,
  );
  return u!.id;
}

export async function registerConsumer(input: ConsumerInput, now = new Date()) {
  const p = consumerSchema.safeParse(input);
  if (!p.success) throw new UserError(firstError(p.error));
  const d = p.data;
  return tx(async (c) => {
    let referredBy: string | null = null;
    if (d.referral) {
      const r = await one<{ id: string }>('select id from users where referral_code = $1', [d.referral], c);
      if (!r) throw new UserError('Código de indicação não encontrado');
      referredBy = r.id;
    }
    const id = await insertUser(c, 'consumer', { ...d, referredBy });
    // Cliente é grátis: o registro de assinatura existe, mas nunca gera cobrança
    await c.query(
      `insert into subscriptions (user_id, plan, price_cents, billing_cycle, status, trial_ends_at, current_period_end)
       values ($1,'consumer',0,'yearly','active',$2,'2999-12-31')`,
      [id, now],
    );
    // Indicação: o indicado ganha 30 dias de Premium; quem indicou ganha +30 dias (até 12 por ano)
    if (referredBy) {
      await c.query(`update users set premium_until = $2 where id=$1`, [id, addDays(now, config.referralBonusDays)]);
      await rewardReferrer(c, referredBy, now);
    }
    return { id, role: 'consumer' as const };
  });
}

async function rewardReferrer(c: PoolClient, referrerId: string, now: Date) {
  const n = await one<{ n: string }>(`select count(*) n from users where referred_by=$1 and created_at > $2`, [referrerId, addDays(now, -365)], c);
  if (Number(n!.n) > config.referralMaxPerYear) return; // conta o recém-criado
  await c.query(
    `update users set premium_until = greatest(coalesce(premium_until, $2), $2) + make_interval(days => $3) where id=$1`,
    [referrerId, now, config.referralBonusDays],
  );
}

export type WelcomeInput = { kind: 'fixed' | 'percent'; value: number; windowDays: number | null } | null | undefined;

export async function createBusinessFor(c: PoolClient, ownerId: string, d: { businessName: string; cnpj?: string; category: string; address?: string; neighborhood?: string; city: string; state: string; phone?: string; cashbackKind: 'fixed' | 'percent'; cashbackValue: number; welcome?: WelcomeInput }, now = new Date()) {
  if (!d.cnpj || !isValidCNPJ(d.cnpj)) throw new UserError('Informe um CNPJ válido (usado para reconhecer as notas fiscais da loja)');
  const dup = await one('select 1 from businesses where cnpj = $1', [d.cnpj], c);
  if (dup) throw new UserError('Já existe uma empresa com este CNPJ');
  if (d.cashbackKind === 'percent' && d.cashbackValue > 10000) throw new UserError('O percentual não pode passar de 100%');
  if (d.welcome && d.welcome.kind === 'percent' && d.welcome.value > 10000) throw new UserError('A promoção não pode passar de 100%');
  const b = await one<{ id: string }>(
    `insert into businesses (owner_id, name, cnpj, category, address, neighborhood, city, state, phone)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
    [ownerId, d.businessName, d.cnpj || null, d.category, d.address || '', d.neighborhood || '', d.city, d.state, d.phone || null],
    c,
  );
  const businessId = b!.id;
  await c.query(`insert into business_members (business_id, user_id, role) values ($1,$2,'owner')`, [businessId, ownerId]);
  await c.query(
    `insert into cashback_rules (business_id, title, kind, value) values ($1,$2,$3,$4)`,
    [businessId, d.cashbackKind === 'percent' ? 'Cashback em todas as compras' : 'Cashback fixo por compra', d.cashbackKind, d.cashbackValue],
  );
  if (d.welcome) {
    const title = d.welcome.windowDays ? `Boas-vindas: primeiros ${d.welcome.windowDays} dias` : 'Boas-vindas: primeira compra';
    await c.query(
      `insert into cashback_rules (business_id, title, kind, value, audience, new_window_days) values ($1,$2,$3,$4,'new_customer',$5)`,
      [businessId, title, d.welcome.kind, d.welcome.value, d.welcome.windowDays],
    );
  }
  // Fatura mensal desde o início (só a taxa sobre o cashback usado); a mensalidade começa após o período grátis
  const trialEnd = addDays(now, config.businessTrialDays);
  const firstPeriodEnd = nextMonthStart(now); // a fatura sai sempre no dia 1º do mês seguinte
  await c.query(
    `insert into subscriptions (business_id, plan, price_cents, billing_cycle, status, trial_ends_at, current_period_end, created_at)
     values ($1,'business',$2,'monthly','trialing',$3,$4,$5)`,
    [businessId, config.businessMonthlyCents, trialEnd, firstPeriodEnd, now],
  );
  await c.query(`insert into business_email_credits (business_id) values ($1)`, [businessId]);
  return businessId;
}

export async function registerBusiness(input: BusinessInput, now = new Date()) {
  const p = businessSchema.safeParse(input);
  if (!p.success) throw new UserError(firstError(p.error));
  const d = p.data;
  return tx(async (c) => {
    const id = await insertUser(c, 'business', d);
    const businessId = await createBusinessFor(c, id, d, now);
    return { id, role: 'business' as const, businessId };
  });
}

export async function addStaff(ownerId: string, businessId: string, input: { name: string; email: string; password: string; phone?: string }) {
  return tx(async (c) => {
    const own = await one(`select 1 from business_members where business_id=$1 and user_id=$2 and role='owner'`, [businessId, ownerId], c);
    if (!own) throw new UserError('Só o dono pode adicionar operadores');
    const b = await one<{ city: string; state: string }>('select city, state from businesses where id=$1', [businessId], c);
    const s = z.object({ name: base.name, email: base.email, password: base.password }).safeParse(input);
    if (!s.success) throw new UserError(firstError(s.error));
    const id = await insertUser(c, 'business', { ...s.data, phone: onlyDigits(input.phone), city: b!.city, state: b!.state });
    await c.query(`insert into business_members (business_id, user_id, role) values ($1,$2,'staff')`, [businessId, id]);
    return id;
  });
}

export async function createAdmin(name: string, email: string, password: string) {
  return tx(async (c) => {
    const existing = await one<{ id: string }>('select id from users where lower(email)=lower($1)', [email], c);
    if (existing) return existing.id;
    return insertUser(c, 'admin', { name, email, phone: '', password, city: '—', state: 'SP' });
  });
}

export async function authenticate(email: string, password: string) {
  const u = await one<{ id: string; role: string; password_hash: string }>(
    'select id, role, password_hash from users where lower(email) = lower($1)',
    [String(email || '').trim()],
  );
  if (!u || !(await bcrypt.compare(password || '', u.password_hash))) throw new UserError('E-mail ou senha incorretos');
  return { id: u.id, role: u.role as 'consumer' | 'business' | 'admin' };
}

export async function businessesForUser(userId: string) {
  return q<{ id: string; name: string; role: string; city: string; state: string }>(
    `select b.id, b.name, m.role, b.city, b.state from business_members m join businesses b on b.id = m.business_id
     where m.user_id = $1 order by b.created_at`,
    [userId],
  );
}

export async function getUser(id: string) {
  return one<{ id: string; role: string; name: string; email: string; phone: string; cpf: string; city: string; state: string; member_code: string; referral_code: string; email_optin: boolean; created_at: string }>(
    'select id, role, name, email, phone, cpf, city, state, member_code, referral_code, email_optin, created_at from users where id=$1',
    [id],
  );
}

export async function setEmailOptin(userId: string, optin: boolean) {
  await q('update users set email_optin=$2 where id=$1', [userId, optin]);
}
