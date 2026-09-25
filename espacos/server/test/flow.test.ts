// Testes de integração contra PostgreSQL real (banco separado de testes).
// TEST_DATABASE_URL padrão: postgresql://spacehour:spacehour@localhost:5432/spacehour_test
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://spacehour:spacehour@localhost:5432/spacehour_test';
process.env.NODE_ENV = 'test';
process.env.LAUNCH_COUNTRIES ??= 'all'; // testes cobrem todos os países configurados
// os testes apagam o banco: só rodam num banco cujo nome termine em _test
if (!/_test(\?|$)/.test(new URL(process.env.DATABASE_URL).pathname + new URL(process.env.DATABASE_URL).search)) {
  throw new Error(`Banco de testes precisa terminar em _test: ${process.env.DATABASE_URL}`);
}

const { dropAll, migrate, one, pool } = await import('../src/db.js');
const { seed } = await import('../src/seed.js');
const repo = await import('../src/repo.js');
const B = await import('../src/bookings.js');
const { createApp } = await import('../src/app.js');
const { addDays, todayInZone, weekdayOf } = await import('../../shared/rules.js');
import type { Listing, User } from '../../shared/types.js';

let guest: User;
let guest2: User;
let listings: Listing[];

before(async () => {
  await dropAll();
  await migrate(false);
  await seed();
  guest = (await repo.getUserByEmail(pool, 'locatario@spacehour.demo'))!;
  guest2 = (await repo.getUserByEmail(pool, 'lucas@spacehour.demo'))!;
  listings = await repo.searchListings(pool, {});
});
after(() => pool.end());

const byTitle = (prefix: string) => listings.find((l) => l.title.startsWith(prefix))!;

function nextDateWith(listing: Listing, weekday: number, from = 3) {
  for (let i = from; i < from + 14; i++) {
    const date = addDays(todayInZone(listing.timezone), i);
    if (weekdayOf(date) === weekday) return date;
  }
  throw new Error('no date');
}

test('migrações: todas aplicadas e idempotentes', async () => {
  assert.deepEqual(await migrate(false), []);
  const r = await one<{ n: number }>(pool, 'SELECT count(*)::int AS n FROM schema_migrations');
  assert.ok(r!.n >= 1);
});

test('reserva instantânea confirma e captura; cancelamento devolve conforme política', async () => {
  const l = byTitle('Sala de psicologia');
  const date = nextDateWith(l, 2);
  const b = await B.createBooking(guest, { listingId: l.id, occurrences: [{ date, start: '09:00', end: '11:00' }], guests: 1, purpose: 'Psicoterapia', paymentMethod: 'pix', acceptRules: true, isConsumer: false });
  assert.equal(b.status, 'confirmed');
  const stored = await repo.getBooking(pool, b.id);
  assert.deepEqual(stored!.occurrences, [{ date, start: '09:00', end: '11:00' }]);
  assert.equal((await repo.getPayment(pool, b.paymentId))!.status, 'captured');
  // o mesmo horário não pode ser reservado de novo
  await assert.rejects(B.createBooking(guest2, { listingId: l.id, occurrences: [{ date, start: '10:00', end: '12:00' }], guests: 1, purpose: 'x', paymentMethod: 'pix', acceptRules: true }), /invalid_occurrences/);
  const c = await B.guestCancel(guest, b.id, 'mudança de agenda');
  assert.equal(c.status, 'cancelled_guest');
  assert.ok((c.refundAmount ?? 0) > 0);
  const events = await repo.getPayment(pool, b.paymentId);
  assert.ok(events!.history.some((e) => e.event.startsWith('refund:')), 'trilha de auditoria registra o estorno');
});

test('concorrência: duas reservas simultâneas do mesmo horário → só uma é aceita', async () => {
  const l = byTitle('Sala de psicologia');
  const date = nextDateWith(l, 3);
  const attempt = (u: User) => B.createBooking(u, { listingId: l.id, occurrences: [{ date, start: '14:00', end: '16:00' }], guests: 1, purpose: 'Atendimento', paymentMethod: 'card', acceptRules: true });
  const results = await Promise.allSettled([attempt(guest), attempt(guest2), attempt(guest), attempt(guest2)]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const n = await one<{ n: number }>(pool, "SELECT count(*)::int AS n FROM booking_occurrences o JOIN bookings b ON b.id = o.booking_id WHERE o.listing_id = $1 AND o.date = $2 AND b.status <> 'cancelled_guest'", [l.id, date]);
  assert.equal(n!.n, 1);
});

test('falha no meio da operação desfaz tudo (transação)', async () => {
  const l = byTitle('Sala de psicologia');
  const before = await one<{ n: number }>(pool, 'SELECT count(*)::int AS n FROM bookings');
  await assert.rejects(B.createBooking(guest, { listingId: l.id, occurrences: [{ date: nextDateWith(l, 4), start: '09:00', end: '10:00' }], guests: 1, purpose: 'x', paymentMethod: 'metodo_inexistente', acceptRules: true }), /payment_method_unavailable/);
  const after = await one<{ n: number }>(pool, 'SELECT count(*)::int AS n FROM bookings');
  assert.equal(after!.n, before!.n);
});

test('solicitação com avalista: avalista aceita → anfitrião aprova → anfitrião cancela', async () => {
  const l = byTitle('Auditório para 120');
  const host = (await repo.getUser(pool, l.hostId))!;
  const date = nextDateWith(l, 6);
  await assert.rejects(B.createBooking(guest, { listingId: l.id, occurrences: [{ date, start: '09:00', end: '13:00' }], guests: 80, purpose: 'Congresso', paymentMethod: 'card', acceptRules: true }), /guarantor_required/);
  let b = await B.createBooking(guest, { listingId: l.id, occurrences: [{ date, start: '09:00', end: '13:00' }], guests: 80, purpose: 'Congresso', paymentMethod: 'card', acceptRules: true, guarantor: { name: 'João Avalista', email: 'joao@example.com', documentNumber: '123.456.789-00' } });
  assert.equal(b.status, 'pending_guarantor');
  b = await B.respondGuarantor(b.guarantor!.token, true);
  assert.equal(b.status, 'pending_host');
  b = await B.hostDecision(host, b.id, true);
  assert.equal(b.status, 'confirmed');
  assert.equal((await repo.getPayment(pool, b.paymentId))!.depositStatus, 'held');
  b = await B.hostCancel(host, b.id, 'manutenção');
  assert.equal(b.status, 'cancelled_host');
  assert.equal(b.refundAmount, b.price.total);
  assert.equal((await repo.getUser(pool, host.id))!.strikes.length, 1);
  assert.ok((await repo.getListing(pool, l.id))!.blockedDates.includes(date), 'data bloqueada após cancelamento do anfitrião');
});

test('exige registro profissional quando o anúncio pede', async () => {
  const l = listings.find((x) => x.requiresLicense && x.countryCode === 'BR')!;
  const noLicense = (await repo.getUserByEmail(pool, 'mente@spacehour.demo'))!;
  await assert.rejects(B.createBooking(noLicense, { listingId: l.id, occurrences: [{ date: nextDateWith(l, 6), start: '09:00', end: '11:00' }], guests: 1, purpose: 'x', paymentMethod: 'card', acceptRules: true }), /license_required/);
});

test('incidente: anfitrião relata, locatário aceita → cobrança e advertência', async () => {
  const [past] = await repo.findBookings(pool, "status = 'completed' AND guest_id = $1", [guest.id]);
  const host = (await repo.getUser(pool, past.hostId))!;
  const soonAfter = new Date(Date.parse(past.attendance[0].checkOutAt!) + 3600000);
  const inc = await B.reportIncident(host, past.id, { type: 'rule_violation', description: 'Deixou a sala desorganizada e usou armário do anfitrião.' }, soonAfter);
  await assert.rejects(B.reportIncident(host, past.id, { type: 'rule_violation', description: 'Relato fora do prazo de 72 horas.' }), /report_window_closed/);
  assert.equal(inc.requestedAmount, Math.round(past.price.baseAmount * 0.2 * 100) / 100);
  const res = await B.respondIncident(guest, inc.id, true, 'Aceito, peço desculpas.');
  assert.equal(res.status, 'resolved');
  assert.equal((await repo.getUser(pool, guest.id))!.strikes.length, 1);
  const p = await repo.getPayment(pool, past.paymentId);
  assert.equal(p!.extraCharges.length, 1);
});

test('rotina periódica expira solicitação sem resposta e libera o pagamento', async () => {
  const l = byTitle('Sala de aula para 30');
  const b = await B.createBooking(guest2, { listingId: l.id, occurrences: [{ date: nextDateWith(l, 6), start: '09:00', end: '12:00' }], guests: 10, purpose: 'Curso', paymentMethod: 'card', acceptRules: true });
  assert.equal(b.status, 'pending_host');
  await B.tick(new Date(Date.parse(b.hostDecisionDeadline!) + 60000));
  const after = await repo.getBooking(pool, b.id);
  assert.equal(after!.status, 'expired');
  assert.equal((await repo.getPayment(pool, b.paymentId))!.status, 'voided');
});

test('API HTTP: cadastro, login, busca, reserva, mensagens e avaliação pelo link do cliente', async () => {
  const server = createApp().listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const call = async (path: string, opts: { method?: string; body?: unknown; token?: string } = {}) => {
    const r = await fetch(base + path, {
      method: opts.method ?? (opts.body ? 'POST' : 'GET'),
      headers: { 'Content-Type': 'application/json', ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    return { status: r.status, body: r.status === 204 ? null : await r.json() };
  };
  try {
    const reg = await call('/auth/register', { body: { name: 'Teste API', email: 'Api@Example.com', password: 'senha-forte-1', countryCode: 'PT', locale: 'pt-BR', acceptTerms: true, confirmAge: true } });
    assert.equal(reg.status, 201);
    assert.equal((await call('/auth/register', { body: { name: 'Outro', email: 'api@example.com', password: 'senha-forte-1', countryCode: 'PT', locale: 'pt-BR', acceptTerms: true, confirmAge: true } })).status, 409);
    const login = await call('/auth/login', { body: { email: 'api@example.com', password: 'senha-forte-1' } });
    assert.equal(login.status, 200);
    const tok = login.body.token as string;

    const search = await call('/listings?country=DE');
    assert.equal(search.status, 200);
    assert.ok(search.body.length >= 1 && search.body.every((l: Listing) => l.countryCode === 'DE' && l.address === undefined));
    const l = search.body[0] as Listing;
    const date = nextDateWith(l, 2);
    const booked = await call('/bookings', { token: tok, body: { listingId: l.id, occurrences: [{ date, start: '10:00', end: '12:00' }], guests: 1, purpose: 'Sessão de coaching', paymentMethod: 'sepa_debit', acceptRules: true } });
    assert.equal(booked.status, 201, JSON.stringify(booked.body));
    assert.equal(booked.body.status, 'confirmed');
    assert.ok(booked.body.listing.address, 'endereço liberado após confirmação');

    const busy = await call(`/listings/${l.id}/busy?date=${date}`);
    assert.deepEqual(busy.body.busy, [{ start: '10:00', end: '12:00' }]);

    assert.equal((await call(`/bookings/${booked.body.id}/messages`, { token: tok, body: { text: 'Olá! Chego 5 min antes.' } })).status, 201);
    assert.equal((await call(`/bookings/${booked.body.id}/messages`, { token: tok })).body.length, 1);
    assert.equal((await call(`/bookings/${booked.body.id}`)).status, 401);

    // link de avaliação de cliente final: uso único
    const inv = (await repo.findBookings(pool, "status = 'completed' AND client_reviews_enabled")).at(0)!;
    const tokRow = await one<{ token: string }>(pool, 'SELECT token FROM client_invites WHERE booking_id = $1 LIMIT 1', [inv.id]);
    const used = await call(`/client-review/${tokRow!.token}`, { body: { rating: 5, categories: { comfort: 5, cleanliness: 5, accessibility: 5, location: 5 }, comment: 'Muito bom atendimento', consent: true } });
    assert.equal(used.status, 409);
  } finally {
    server.close();
  }
});
