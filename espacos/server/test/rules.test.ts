import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, computeGuestRefund, computePrice, overstayCharge, todayInZone, validateOccurrences, zonedToUtc } from '../../shared/rules.js';
import type { Listing } from '../../shared/types.js';

const tz = 'America/Sao_Paulo';
const listing: Listing = {
  id: 'l', hostId: 'h', title: 't', description: 'd', category: 'dental', countryCode: 'BR', city: 'São Paulo', timezone: tz,
  address: 'x', capacity: 3, amenities: [], equipment: '', photos: [], currency: 'BRL', pricePerHour: 100, minHours: 1,
  cleaningFee: 20, securityDeposit: 0, instantBook: true, cancellationPolicy: 'moderate', guarantorPolicy: 'none',
  requiresLicense: false, hostLicenseResponsibility: false, houseRules: 'regras', bufferMinutes: 30,
  weeklyAvailability: { 0: [{ start: '06:00', end: '23:00' }], 1: [{ start: '06:00', end: '23:00' }], 2: [{ start: '06:00', end: '23:00' }], 3: [{ start: '06:00', end: '23:00' }], 4: [{ start: '06:00', end: '23:00' }], 5: [{ start: '06:00', end: '23:00' }], 6: [{ start: '06:00', end: '23:00' }] },
  blockedDates: [], active: true, createdAt: '',
};
const ctx = { existing: [], guestHoursLast30Days: 0, guestActiveSeries: 0 };
const d = (n: number) => addDays(todayInZone(tz), n);

test('fuso horário: São Paulo UTC-3', () => {
  assert.equal(zonedToUtc('2026-03-10', '09:00', tz).toISOString(), '2026-03-10T12:00:00.000Z');
});

test('preço: base + limpeza + taxa de serviço 15% + ISS 5% sobre a taxa', () => {
  const p = computePrice(listing, [{ date: d(10), start: '09:00', end: '11:00' }]);
  assert.equal(p.baseAmount, 200);
  assert.equal(p.cleaningFee, 20);
  assert.equal(p.guestServiceFee, 33);
  assert.equal(p.taxOnServiceFee, 1.65);
  assert.equal(p.total, 254.65);
  assert.equal(p.hostPayout, 209);
});

test('limites: sem pernoite, máx 12 h, granularidade 30 min', () => {
  const codes = (o: { date: string; start: string; end: string }) => validateOccurrences(listing, [o], ctx).map((e) => e.code);
  assert.ok(codes({ date: d(3), start: '06:00', end: '19:00' }).includes('max_duration'));
  assert.ok(codes({ date: d(3), start: '09:15', end: '11:00' }).includes('slot_granularity'));
  assert.ok(codes({ date: d(200), start: '09:00', end: '11:00' }).includes('too_far_ahead'));
  assert.deepEqual(codes({ date: d(3), start: '09:00', end: '11:00' }), []);
});

test('anti longo prazo: máx 5 dias seguidos e 12 semanas', () => {
  const six = [1, 2, 3, 4, 5, 6].map((n) => ({ date: d(n), start: '09:00', end: '10:00' }));
  assert.ok(validateOccurrences(listing, six, ctx).some((e) => e.code === 'max_consecutive_days'));
  const weeks = Array.from({ length: 13 }, (_, i) => ({ date: d(1 + i * 7), start: '09:00', end: '10:00' }));
  const codes = validateOccurrences(listing, weeks, ctx).map((e) => e.code);
  assert.ok(codes.includes('max_recurring_weeks') || codes.includes('too_many_occurrences'));
  const irregular = [d(1), d(3)].map((date) => ({ date, start: '09:00', end: '10:00' }));
  assert.ok(validateOccurrences(listing, irregular, ctx).some((e) => e.code === 'invalid_pattern'));
  assert.ok(validateOccurrences(listing, [{ date: d(2), start: '09:00', end: '19:00' }], { ...ctx, guestHoursLast30Days: 115 }).some((e) => e.code === 'monthly_cap'));
});

test('conflito considera intervalo de limpeza', () => {
  const existing = [{ occurrences: [{ date: d(4), start: '09:00', end: '11:00' }] }];
  const errs = validateOccurrences(listing, [{ date: d(4), start: '11:00', end: '12:00' }], { ...ctx, existing });
  assert.ok(errs.some((e) => e.code === 'conflict'));
  assert.equal(validateOccurrences(listing, [{ date: d(4), start: '11:30', end: '12:30' }], { ...ctx, existing }).length, 0);
});

test('reembolso: política moderada e janela de cortesia', () => {
  const occ = [{ date: '2026-10-20', start: '10:00', end: '12:00' }];
  const price = computePrice({ ...listing, countryCode: 'US', currency: 'USD', timezone: 'America/New_York' }, occ);
  const l = { timezone: 'America/New_York', countryCode: 'US', currency: 'USD' };
  const start = zonedToUtc('2026-10-20', '10:00', 'America/New_York').getTime();
  const bookedAt = new Date(start - 30 * 86400000);
  // 48 h antes → 50% do valor base + limpeza, sem taxa de serviço
  const r = computeGuestRefund({ listing: l, policy: 'moderate', occurrences: occ, price, bookedAt, now: new Date(start - 48 * 3600000) });
  assert.equal(r.rule, 'policy');
  assert.equal(r.refundBase, 100);
  assert.equal(r.refundServiceFee, 0);
  // 12 h antes → 0 do valor base
  assert.equal(computeGuestRefund({ listing: l, policy: 'moderate', occurrences: occ, price, bookedAt, now: new Date(start - 12 * 3600000) }).refundBase, 0);
  // cortesia: cancelou 2 h após reservar com 30 dias de antecedência
  const g = computeGuestRefund({ listing: l, policy: 'strict', occurrences: occ, price, bookedAt, now: new Date(bookedAt.getTime() + 2 * 3600000) });
  assert.equal(g.rule, 'grace');
  assert.equal(g.total, price.total);
});

test('direito de arrependimento no Brasil (7 dias) para consumidor', () => {
  const occ = [{ date: '2026-10-20', start: '10:00', end: '12:00' }];
  const price = computePrice(listing, occ);
  const start = zonedToUtc('2026-10-20', '10:00', tz).getTime();
  const bookedAt = new Date(start - 40 * 3600000); // reservou com menos de 48 h: sem cortesia
  const now = new Date(start - 20 * 3600000);
  const consumer = computeGuestRefund({ listing, policy: 'strict', occurrences: occ, price, bookedAt, now, isConsumer: true });
  assert.equal(consumer.rule, 'withdrawal');
  const pro = computeGuestRefund({ listing, policy: 'strict', occurrences: occ, price, bookedAt, now, isConsumer: false });
  assert.equal(pro.refundBase, 0);
});

test('atraso na saída: tolerância 10 min, depois blocos de 15 min', () => {
  assert.equal(overstayCharge(8, 100, 'BRL'), 0);
  assert.equal(overstayCharge(20, 100, 'BRL'), 75); // 2 blocos × 0,25 h × 100 × 1,5
  assert.equal(overstayCharge(40, 100, 'BRL'), 150); // 3 blocos × 0,25 h × 100 × 2
});
