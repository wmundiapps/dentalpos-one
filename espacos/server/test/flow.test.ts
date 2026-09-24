import test from 'node:test';
import assert from 'node:assert/strict';
process.env.SPACEHOUR_DB = ':memory:';
process.env.NODE_ENV = 'test';

const { db } = await import('../src/db');
const { seed } = await import('../src/seed');
const B = await import('../src/bookings');
const { addDays, todayInZone, weekdayOf } = await import('../../shared/rules');

seed();
const guest = db.users.find((u) => u.email === 'locatario@spacehour.demo')!;
const guest2 = db.users.find((u) => u.email === 'lucas@spacehour.demo')!;

function nextDateWith(listing: (typeof db.listings)[number], weekday: number) {
  for (let i = 3; i < 20; i++) {
    const date = addDays(todayInZone(listing.timezone), i);
    if (weekdayOf(date) === weekday) return date;
  }
  throw new Error('no date');
}

test('reserva instantânea confirma e captura; cancelamento devolve conforme política', () => {
  const l = db.listings.find((x) => x.title.startsWith('Sala de psicologia'))!;
  const date = nextDateWith(l, 2);
  const b = B.createBooking(guest, { listingId: l.id, occurrences: [{ date, start: '09:00', end: '11:00' }], guests: 1, purpose: 'Psicoterapia', paymentMethod: 'pix', acceptRules: true, isConsumer: false });
  assert.equal(b.status, 'confirmed');
  assert.equal(B.paymentOf(b)!.status, 'captured');
  // o mesmo horário não pode ser reservado de novo
  assert.throws(() => B.createBooking(guest2, { listingId: l.id, occurrences: [{ date, start: '10:00', end: '12:00' }], guests: 1, purpose: 'x', paymentMethod: 'pix', acceptRules: true }), /invalid_occurrences/);
  const c = B.guestCancel(guest, b.id, 'mudança de agenda');
  assert.equal(c.status, 'cancelled_guest');
  assert.ok((c.refundAmount ?? 0) > 0);
});

test('solicitação com avalista: avalista aceita → anfitrião aprova', () => {
  const l = db.listings.find((x) => x.title.startsWith('Auditório para 120'))!;
  const host = db.users.find((u) => u.id === l.hostId)!;
  const date = nextDateWith(l, 6);
  assert.throws(() => B.createBooking(guest, { listingId: l.id, occurrences: [{ date, start: '09:00', end: '13:00' }], guests: 80, purpose: 'Congresso', paymentMethod: 'card', acceptRules: true }), /guarantor_required/);
  const b = B.createBooking(guest, { listingId: l.id, occurrences: [{ date, start: '09:00', end: '13:00' }], guests: 80, purpose: 'Congresso', paymentMethod: 'card', acceptRules: true, guarantor: { name: 'João Avalista', email: 'joao@example.com', documentNumber: '123.456.789-00' } });
  assert.equal(b.status, 'pending_guarantor');
  B.respondGuarantor(b.guarantor!.token, true);
  assert.equal(b.status, 'pending_host');
  B.hostDecision(host, b.id, true);
  assert.equal(b.status, 'confirmed');
  assert.equal(B.paymentOf(b)!.depositStatus, 'held');
  // anfitrião cancela: reembolso integral + advertência
  B.hostCancel(host, b.id, 'manutenção');
  assert.equal(b.status, 'cancelled_host');
  assert.equal(b.refundAmount, b.price.total);
  assert.equal(host.strikes.length, 1);
});

test('exige registro profissional quando o anúncio pede', () => {
  const l = db.listings.find((x) => x.requiresLicense && x.countryCode === 'BR')!;
  const noLicense = db.users.find((u) => u.email === 'mente@spacehour.demo')!;
  const date = nextDateWith(l, 6);
  assert.throws(() => B.createBooking(noLicense, { listingId: l.id, occurrences: [{ date, start: '09:00', end: '11:00' }], guests: 1, purpose: 'x', paymentMethod: 'card', acceptRules: true }), /license_required/);
});

test('ocorrência: anfitrião reporta, locatário aceita → cobrança e advertência', () => {
  const past = db.bookings.find((b) => b.status === 'completed' && b.guestId === guest.id)!;
  const host = db.users.find((u) => u.id === past.hostId)!;
  const soonAfter = new Date(Date.parse(past.attendance[0].checkOutAt!) + 3600000);
  const inc = B.reportIncident(host, past.id, { type: 'rule_violation', description: 'Deixou a sala desorganizada e usou armário do anfitrião.' }, soonAfter);
  assert.throws(() => B.reportIncident(host, past.id, { type: 'rule_violation', description: 'Relato fora do prazo de 72 horas.' }), /report_window_closed/);
  assert.equal(inc.requestedAmount, Math.round(past.price.baseAmount * 0.2 * 100) / 100);
  B.respondIncident(guest, inc.id, true, 'Aceito, peço desculpas.');
  assert.equal(inc.status, 'resolved');
  assert.equal(guest.strikes.length, 1);
});
