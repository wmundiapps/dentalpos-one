// Parceiros (corretor e zelador): cadastro, aprovação, vínculo com consentimento das duas partes,
// taxas na reserva, troca de contatos, repasse e cancelamento.
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
const P = await import('../src/partners.js');
const { addDays, feesAt, todayInZone, weekdayOf } = await import('../../shared/rules.js');
import type { Listing, User } from '../../shared/types.js';

let guest: User;
let partner: User;
let host: User;
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

const nextDate = (weekday: number) => {
  for (let i = 3; i < 17; i++) {
    const date = addDays(todayInZone(listing.timezone), i);
    if (weekdayOf(date) === weekday) return date;
  }
  throw new Error('no date');
};

test('cadastro: CPF válido, celular, CRECI obrigatório para corretor e aceite dos termos', async () => {
  const base = { roles: ['broker', 'caretaker'] as const, taxId: '529.982.247-25', phone: '(44) 99999-1234', creci: 'F12345', creciUf: 'PR', pixKey: 'lucas@pix.com', cities: 'Maringá', acceptTerms: true };
  await assert.rejects(P.registerPartner(partner, { ...base, roles: [...base.roles], taxId: '111.111.111-11' }), /partner_invalid_tax_id/);
  await assert.rejects(P.registerPartner(partner, { ...base, roles: [...base.roles], creci: '' }), /partner_creci_required/);
  await assert.rejects(P.registerPartner(partner, { ...base, roles: [...base.roles], phone: '4433334444' }), /partner_invalid_phone/);
  const p = await P.registerPartner(partner, { ...base, roles: [...base.roles] }, '1.2.3.4');
  assert.equal(p.status, 'pending');
  assert.equal(p.phone, '44999991234');
  // pendente não pode ser convidado
  await assert.rejects(P.hostInvite(host, listing.id, { email: partner.email, role: 'broker' }), /partner_not_found/);
  assert.equal((await P.decidePartner(host, partner.id, 'approved')).status, 'approved');
});

test('vínculo: anfitrião convida, parceiro aceita; taxa do zelador com limites; um por papel', async () => {
  await assert.rejects(P.hostInvite(guest, listing.id, { email: partner.email, role: 'broker' }), /forbidden/);
  await assert.rejects(P.hostInvite(host, listing.id, { email: partner.email, role: 'caretaker', caretakerFee: 5 }), /partner_invalid_fee/);
  const broker = await P.hostInvite(host, listing.id, { email: partner.email, role: 'broker' });
  await assert.rejects(P.hostInvite(host, listing.id, { email: partner.email, role: 'broker' }), /partner_role_taken/);
  await assert.rejects(P.respondLink(host, broker.id, true), /forbidden/, 'quem responde é o parceiro');
  await P.respondLink(partner, broker.id, true);
  // zelador pedido pelo parceiro, aceito pelo anfitrião
  const care = await P.partnerRequest(partner, listing.id, { role: 'caretaker', caretakerFee: 60 });
  assert.equal(care.status, 'pending_host');
  await P.respondLink(host, care.id, true);
  const l = (await repo.getListing(pool, listing.id))!;
  assert.equal(l.brokerId, partner.id);
  assert.equal(l.caretakerId, partner.id);
  assert.equal(l.caretakerFee, 60);
});

test('reserva paga: taxas por fora da divisão, valor do parceiro retido até o check-out, contatos trocados', async () => {
  const date = nextDate(1);
  const b = await B.createBooking(guest, { listingId: listing.id, occurrences: [{ date, start: '09:00', end: '11:00' }], guests: 1, purpose: 'Psicoterapia', paymentMethod: 'pix', acceptRules: true, isConsumer: false });
  assert.equal(b.status, 'confirmed');
  assert.equal(b.price.brokerFee, 50);
  assert.equal(b.price.caretakerFee, 60);
  assert.equal(b.price.total, Math.round((b.price.baseAmount + b.price.cleaningFee + b.price.guestServiceFee + b.price.taxOnServiceFee + 110) * 100) / 100);
  assert.equal(b.price.hostPayout, Math.round((b.price.baseAmount + b.price.cleaningFee) * (1 - feesAt().hostServiceFeeRate) * 100) / 100);
  const earn = await rows<{ role: string; amount: number; status: string }>(pool, 'SELECT role, amount, status FROM partner_earnings WHERE booking_id = $1 ORDER BY role', [b.id]);
  assert.deepEqual(earn, [{ role: 'broker', amount: 50, status: 'held' }, { role: 'caretaker', amount: 60, status: 'held' }]);
  const toPartner = await one<{ text: string }>(pool, "SELECT text FROM notifications WHERE user_id = $1 AND kind = 'partner_booking' ORDER BY created_at DESC LIMIT 1", [partner.id]);
  assert.match(toPartner!.text, new RegExp(guest.name));
  const toGuest = await one<{ text: string }>(pool, "SELECT text FROM notifications WHERE user_id = $1 AND kind = 'booking_contacts' ORDER BY created_at DESC LIMIT 1", [guest.id]);
  assert.match(toGuest!.text, /Zelador Parceiro/);
  assert.match(toGuest!.text, /wa\.me\/5544999991234/);
  assert.ok((await one<{ n: number }>(pool, 'SELECT count(*)::int AS n FROM instant_messages WHERE user_id = $1', [partner.id]))!.n >= 1);
  // painel do parceiro mostra a reserva com os dados do locatário
  const dash = await P.partnerDashboard(partner);
  assert.equal(dash.bookings!.find((x) => x.id === b.id)!.guest!.email, guest.email);
  // cancelamento pelo anfitrião: tudo devolvido, parceiros não recebem
  await B.hostCancel(host, b.id, 'imprevisto', true);
  const after = await rows<{ status: string; amount: number }>(pool, 'SELECT status, amount FROM partner_earnings WHERE booking_id = $1', [b.id]);
  assert.ok(after.every((e) => e.status === 'void' && e.amount === 0));
});

test('vistoria: mínimo de fotos para parceiro; locatário de fora não vê', async () => {
  const date = nextDate(3);
  const b = await B.createBooking(guest, { listingId: listing.id, occurrences: [{ date, start: '09:00', end: '11:00' }], guests: 1, purpose: 'Psicoterapia', paymentMethod: 'pix', acceptRules: true, isConsumer: false });
  const photo = (n: number) => `/api/uploads/img_${String(n).padStart(16, '0')}`;
  await assert.rejects(P.createInspection(partner, { bookingId: b.id, kind: 'check_in', photos: [photo(1)] }), /inspection_photos_required/);
  await P.createInspection(partner, { bookingId: b.id, kind: 'check_in', photos: [1, 2, 3, 4].map(photo), checklist: { limpeza: true }, notes: 'Tudo em ordem' });
  assert.equal((await P.listInspections(guest, { bookingId: b.id })).length, 1, 'o locatário vê a vistoria da própria reserva');
  const ids = (await rows<{ id: string }>(pool, 'SELECT id FROM users WHERE id NOT IN ($1,$2,$3)', [guest.id, partner.id, host.id])).map((r) => r.id);
  const other = [...(await repo.getUsers(pool, ids)).values()].find((u) => !u.roles.includes('admin'))!;
  await assert.rejects(P.listInspections(other, { bookingId: b.id }), /forbidden/);
  // check-out conclui e libera o valor para o repasse do mês
  await pool.query("UPDATE bookings SET status = 'completed', completed_at = now() WHERE id = $1", [b.id]);
  await P.onBookingCompleted(pool, (await repo.getBooking(pool, b.id))!);
  const due = await P.payoutReport();
  const mine = due.find((d) => d.user_id === partner.id)!;
  assert.equal(mine.amount, 110);
  await P.markPaid(host, mine.ids as string[], 'Pix E2E123');
  assert.equal((await P.payoutReport()).length, 0);
});

test('encerrar: aviso prévio de 30 dias; justa causa na hora com motivo', async () => {
  const links = await P.listingLinks(listing.id);
  const care = links.find((l) => l.role === 'caretaker')!;
  await assert.rejects(P.endLink(host, care.id, { reason: 'curto', immediate: true }), /partner_end_reason_required/);
  await P.endLink(host, care.id, { reason: 'não apareceu para entregar a chave', immediate: true });
  assert.equal((await repo.getListing(pool, listing.id))!.caretakerId, undefined);
  const broker = links.find((l) => l.role === 'broker')!;
  await P.endLink(host, broker.id, { reason: 'vou anunciar sozinho' });
  assert.equal((await repo.getListing(pool, listing.id))!.brokerId, partner.id, 'segue ativo durante o aviso');
  await P.partnerJobs(new Date(Date.now() + 31 * 86400000));
  assert.equal((await repo.getListing(pool, listing.id))!.brokerId, undefined);
});
