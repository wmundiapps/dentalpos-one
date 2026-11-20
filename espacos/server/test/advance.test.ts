// Reserva antecipada parcelada: até 18 meses, até 10 parcelas, 7% de desconto, corretor/zelador na última,
// desistência (7 dias = tudo; depois, pago − desconto), atraso de 5 dias cancela.
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
const A = await import('../src/advance.js');
const P = await import('../src/partners.js');
const R = await import('../../shared/rules.js');
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

const dateAhead = (days: number, weekday = 2) => {
  for (let i = days; i < days + 7; i++) {
    const d = R.addDays(R.todayInZone(listing.timezone), i);
    if (R.weekdayOf(d) === weekday) return d;
  }
  throw new Error('no date');
};
const book = (date: string, extra: Record<string, unknown> = {}) => B.createBooking(guest, {
  listingId: listing.id, occurrences: [{ date, start: '09:00', end: '11:00' }], guests: 1, purpose: 'Psicoterapia',
  paymentMethod: 'pix', acceptRules: true, isConsumer: true, ...extra,
});

test('regras: parcelas, desconto de 7% e desistência', () => {
  const now = new Date('2026-11-20T12:00:00Z');
  assert.equal(R.advanceMaxInstallments(new Date('2027-12-10T12:00:00Z'), now), 10);
  assert.equal(R.advanceMaxInstallments(new Date('2027-01-25T12:00:00Z'), now), 2);
  const price = { currency: 'BRL', hours: 0, days: 0, occurrences: 1, baseAmount: 2000, cleaningFee: 0, guestServiceFee: 0, taxOnServiceFee: 0, taxName: '', total: 2350, hostServiceFee: 400, hostPayout: 1600, securityDeposit: 0, brokerFee: 200, caretakerFee: 150 };
  const p = R.applyAdvanceDiscount(price);
  assert.equal(p.advanceDiscount, 140);
  assert.equal(p.total, 2210);
  assert.equal(p.hostPayout, 1488);
  const s = R.advanceSchedule(p, 10, '2026-11-20');
  assert.equal(s.length, 10);
  assert.equal(s[0].amount, 186);
  assert.equal(s[9].amount, 536, '186 + corretor 200 + zelador 150');
  assert.equal(s[9].dueDate, '2027-08-17');
  assert.equal(Math.round(s.reduce((x, y) => x + y.amount, 0) * 100) / 100, 2210);
  const first = new Date('2026-11-20T12:00:00Z');
  assert.equal(R.advanceRefund({ paid: 744, discount: 140, firstPaidAt: first, policyRate: 1 }, new Date('2026-11-25T12:00:00Z')).amount, 744);
  assert.deepEqual(R.advanceRefund({ paid: 744, discount: 140, firstPaidAt: first, policyRate: 1 }, new Date('2027-03-01T12:00:00Z')), { amount: 604, rule: 'early_exit' });
  assert.equal(R.advanceRefund({ paid: 1860, discount: 140, firstPaidAt: first, policyRate: 0.5 }, new Date('2027-10-01T12:00:00Z')).amount, 930);
});

test('reserva a 11 meses: só antecipada; 1ª parcela paga confirma; parcelas seguintes em ordem; quitação avisa parceiros', async () => {
  await P.registerPartner(partner, { roles: ['caretaker'], taxId: '11.222.333/0001-81', phone: '44999991234', pixKey: '11222333000181', cities: 'Maringá', acceptTerms: true });
  await P.decidePartner(host, partner.id, 'approved');
  const link = await P.hostInvite(host, listing.id, { email: partner.email, role: 'caretaker', caretakerFee: 80 });
  await P.respondLink(partner, link.id, true);
  listing = (await repo.getListing(pool, listing.id))!;
  const date = dateAhead(330);
  await assert.rejects(book(date), /invalid_occurrences/, 'sem antecipada, passa de 180 dias');
  await assert.rejects(book(date, { advance: true, paymentMethod: 'boleto' }), /advance_pix_or_card/);
  const b = await book(date, { advance: true, installments: 10 });
  assert.equal(b.status, 'confirmed');
  const rental = b.price.baseAmount + b.price.cleaningFee;
  assert.equal(b.price.advanceDiscount, Math.round(rental * 0.07 * 100) / 100);
  let inst = await A.installmentsOf(pool, b.id);
  assert.equal(inst.length, 10);
  assert.equal(inst[0].status, 'paid');
  assert.equal(inst[9].partner_fees, 80, 'zelador só na última');
  assert.equal((await repo.getPayment(pool, b.paymentId))!.amount, inst[0].amount);
  assert.equal((await one<{ n: number }>(pool, "SELECT count(*)::int AS n FROM partner_earnings WHERE booking_id = $1", [b.id]))!.n, 0, 'parceiro só depois de quitar');
  for (let i = 2; i <= 10; i++) await A.payInstallment(guest, b.id, 'pix');
  inst = await A.installmentsOf(pool, b.id);
  assert.ok(inst.every((x) => x.status === 'paid'));
  await assert.rejects(A.payInstallment(guest, b.id, 'pix'), /installments_paid/);
  assert.equal((await one<{ amount: number }>(pool, "SELECT amount FROM partner_earnings WHERE booking_id = $1", [b.id]))!.amount, 80);
});

test('desistência depois de 7 dias: devolve o pago menos o desconto, parcela a parcela', async () => {
  const date = dateAhead(300, 3);
  const b = await book(date, { advance: true, installments: 10 });
  for (let i = 2; i <= 4; i++) await A.payInstallment(guest, b.id, 'pix');
  const paid = (await A.installmentsOf(pool, b.id)).filter((x) => x.status === 'paid').reduce((s, x) => s + x.amount, 0);
  await pool.query("UPDATE booking_installments SET paid_at = now() - interval '30 days' WHERE booking_id = $1", [b.id]);
  const c = await B.guestCancel(guest, b.id, 'mudei de cidade');
  assert.equal(c.refundAmount, Math.round((paid - b.price.advanceDiscount!) * 100) / 100);
  const st = await rows<{ status: string }>(pool, 'SELECT status FROM booking_installments WHERE booking_id = $1 ORDER BY seq', [b.id]);
  assert.ok(st.slice(0, 4).every((x) => x.status === 'refunded') && st.slice(4).every((x) => x.status === 'void'));
});

test('parcela com mais de 5 dias de atraso cancela a reserva e libera a data', async () => {
  const date = dateAhead(200, 4);
  const b = await book(date, { advance: true, installments: 5 });
  await pool.query("UPDATE booking_installments SET due_date = current_date - 10 WHERE booking_id = $1 AND seq = 2", [b.id]);
  await A.advanceJobs();
  const after = (await repo.getBooking(pool, b.id))!;
  assert.equal(after.status, 'cancelled_guest');
  assert.equal(after.cancellationReason, 'installment_overdue');
  assert.equal(after.refundAmount, (await A.installmentsOf(pool, b.id))[0].amount, 'dentro de 7 dias do 1º pagamento: devolve tudo');
});
