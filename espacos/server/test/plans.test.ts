// Plano SpaceHour: compra com 10% de desconto, crédito na locação, taxas de parceiros à parte,
// devolução de crédito no cancelamento, Pix ao anfitrião e política de reembolso.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://spacehour:spacehour@localhost:5432/spacehour_test';
process.env.NODE_ENV = 'test';
process.env.RATE_LIMIT_DISABLED ??= 'true';
process.env.LAUNCH_COUNTRIES ??= 'all';
if (!/_test(\?|$)/.test(new URL(process.env.DATABASE_URL).pathname)) throw new Error('Banco de testes precisa terminar em _test');

const { dropAll, migrate, one, pool, rows } = await import('../src/db.js');
const { seed } = await import('../src/seed.js');
const repo = await import('../src/repo.js');
const B = await import('../src/bookings.js');
const PL = await import('../src/plans.js');
const P = await import('../src/partners.js');
const { addDays, planRefund, todayInZone, weekdayOf } = await import('../../shared/rules.js');
import type { Listing, User } from '../../shared/types.js';

let guest: User;
let host: User;
let partner: User;
let listing: Listing;

before(async () => {
  await dropAll();
  await migrate(false);
  await seed();
  guest = (await repo.getUserByEmail(pool, 'locatario@spacehour.demo'))!;
  partner = (await repo.getUserByEmail(pool, 'lucas@spacehour.demo'))!;
  listing = (await repo.searchListings(pool, {})).find((l) => l.title.startsWith('Sala de psicologia'))!;
  host = (await repo.getUser(pool, listing.hostId))!;
});
after(() => pool.end());

const nextDate = (weekday: number, from = 3) => {
  for (let i = from; i < from + 14; i++) {
    const date = addDays(todayInZone(listing.timezone), i);
    if (weekdayOf(date) === weekday) return date;
  }
  throw new Error('no date');
};
const book = (date: string, extra: Record<string, unknown> = {}) => B.createBooking(guest, {
  listingId: listing.id, occurrences: [{ date, start: '09:00', end: '11:00' }], guests: 1, purpose: 'Psicoterapia',
  paymentMethod: 'plan', acceptRules: true, isConsumer: true, ...extra,
});

test('regra de reembolso: 7 dias devolve tudo menos o uso com desconto; depois, pago menos o uso a preço cheio', () => {
  const paidAt = new Date('2026-11-01T12:00:00Z');
  assert.deepEqual(planRefund({ pricePaid: 10800, creditUsed: 0, paidAt }, new Date('2026-11-05T12:00:00Z')), { amount: 10800, rule: 'withdrawal' });
  assert.equal(planRefund({ pricePaid: 10800, creditUsed: 1000, paidAt }, new Date('2026-11-05T12:00:00Z')).amount, 9900);
  assert.deepEqual(planRefund({ pricePaid: 10800, creditUsed: 3000, paidAt }, new Date('2026-12-20T12:00:00Z')), { amount: 7800, rule: 'early_exit' });
  assert.equal(planRefund({ pricePaid: 1080, creditUsed: 1200, paidAt }, new Date('2026-12-20T12:00:00Z')).amount, 0);
});

test('compra: 12 meses × R$ 1.000 = crédito de R$ 12.000 pagando R$ 10.800', async () => {
  await assert.rejects(PL.buyPlan(guest, { months: 3, monthly: 1000, method: 'pix', acceptTerms: true }), /plan_invalid_months/);
  await assert.rejects(PL.buyPlan(guest, { months: 12, monthly: 50, method: 'pix', acceptTerms: true }), /plan_invalid_amount/);
  const p = await PL.buyPlan(guest, { months: 12, monthly: 1000, method: 'pix', acceptTerms: true });
  assert.equal(p.status, 'active');
  assert.equal(p.credit_total, 12000);
  assert.equal(p.price_paid, 10800);
  const mine = await PL.myPlans(guest);
  assert.equal(mine.balance, 12000);
});

test('reserva com o plano: exige Pix do anfitrião; crédito paga a locação; anfitrião recebe 80% do valor pago, por Pix', async () => {
  const date = nextDate(2);
  await assert.rejects(book(date), /plan_not_accepted/, 'anfitrião sem chave Pix');
  await PL.setPixAccount(host, { pixKey: 'anfitriao@pix.com', holderName: host.name, holderTaxId: '529.982.247-25' });
  const b = await book(date);
  assert.equal(b.status, 'confirmed');
  const credit = b.price.baseAmount + b.price.cleaningFee;
  assert.equal(b.price.planCredit, credit);
  assert.equal(b.price.planCash, Math.round(credit * 0.9 * 100) / 100);
  assert.equal(b.price.hostPayout, Math.round(credit * 0.9 * 0.8 * 100) / 100);
  assert.equal((await repo.getPayment(pool, b.paymentId))!.amount, 0, 'nada a cobrar no Pix/cartão');
  assert.equal((await PL.myPlans(guest)).balance, 12000 - credit);
  const hp = await one<{ amount: number; status: string }>(pool, 'SELECT amount, status FROM host_payouts WHERE booking_id = $1', [b.id]);
  assert.deepEqual(hp, { amount: b.price.hostPayout, status: 'scheduled' });
  // cancelamento pelo anfitrião: crédito volta inteiro e o Pix é cancelado
  await B.hostCancel(host, b.id, 'imprevisto', true);
  assert.equal((await PL.myPlans(guest)).balance, 12000);
  assert.equal((await one<{ status: string }>(pool, 'SELECT status FROM host_payouts WHERE booking_id = $1', [b.id]))!.status, 'void');
});

test('corretor e zelador nunca saem do crédito: cobrança à parte; Pix liberado 24 h após o início e pago', async () => {
  await P.registerPartner(partner, { roles: ['broker', 'caretaker'], taxId: '11.222.333/0001-81', phone: '44999991234', creci: 'J1234', creciUf: 'PR', pixKey: '11222333000181', cities: 'Maringá', acceptTerms: true });
  await P.decidePartner(host, partner.id, 'approved');
  const link = await P.hostInvite(host, listing.id, { email: partner.email, role: 'caretaker', caretakerFee: 80 });
  await P.respondLink(partner, link.id, true);
  listing = (await repo.getListing(pool, listing.id))!;
  const date = nextDate(4);
  await assert.rejects(book(date), /plan_fees_method_required/);
  const b = await book(date, { feesMethod: 'pix' });
  const pay = (await repo.getPayment(pool, b.paymentId))!;
  assert.equal(pay.amount, 80, 'só a taxa do zelador é cobrada no Pix');
  const before = (await PL.myPlans(guest)).balance;
  assert.equal(before, 12000 - (b.price.baseAmount + b.price.cleaningFee), 'o crédito pagou só a locação');
  // Pix do anfitrião: 24 h após o início
  await PL.planJobs(new Date(Date.now() + 30 * 86400000));
  const hp = (await rows<{ id: string; status: string }>(pool, 'SELECT id, status FROM host_payouts WHERE booking_id = $1', [b.id]))[0];
  assert.equal(hp.status, 'due');
  await assert.rejects(PL.payHostPayout(hp.id), /pix_manual_ref_required/, 'sem Asaas, a equipe informa o Pix feito');
  await PL.payHostPayout(hp.id, 'E2E-PIX-1');
  assert.equal((await one<{ status: string }>(pool, 'SELECT status FROM host_payouts WHERE id = $1', [hp.id]))!.status, 'paid');
});

test('cancelar o plano devolve pela regra; o saldo some e as reservas feitas continuam', async () => {
  const plan = (await PL.myPlans(guest)).plans.find((p) => p.status === 'active')!;
  const prev = await PL.refundPreview(guest, plan.id);
  assert.equal(prev.rule, 'withdrawal');
  const r = await PL.cancelPlan(plan.id, { userId: guest.id, reason: 'customer' });
  assert.equal(r.refund, Math.round((10800 - plan.creditUsed * 0.9) * 100) / 100);
  assert.equal((await PL.myPlans(guest)).balance, 0);
  await assert.rejects(book(nextDate(5), { feesMethod: 'pix' }), /plan_insufficient_credit/);
});
