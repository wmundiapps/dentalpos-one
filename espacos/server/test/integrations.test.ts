// Pagamentos com checkout externo, webhooks, verificação de registro por IA,
// uploads, avaliação do app e fila de e-mails (provedores externos simulados).
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { AddressInfo } from 'node:net';

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://spacehour:spacehour@localhost:5432/spacehour_test';
process.env.NODE_ENV = 'test';
if (!/_test(\?|$)/.test(new URL(process.env.DATABASE_URL).pathname)) throw new Error('Banco de testes precisa terminar em _test');

const { dropAll, migrate, one, pool } = await import('../src/db');
const { seed } = await import('../src/seed');
const repo = await import('../src/repo');
const B = await import('../src/bookings');
const P = await import('../src/payments');
const V = await import('../src/verification');
const M = await import('../src/mailer');
const { mercadoPagoGateway } = await import('../src/payments/mercadopago');
const { createApp } = await import('../src/app');
const { signToken } = await import('../src/auth');
const { addDays, todayInZone, weekdayOf } = await import('../../shared/rules');
import type { Gateway } from '../src/payments';
import type { Listing, User } from '../../shared/types';
import type Anthropic from '@anthropic-ai/sdk';
import type { LicenseAiResult } from '../src/verification';

let guest: User;
let admin: User;
let listings: Listing[];
let server: ReturnType<ReturnType<typeof createApp>['listen']>;
let base = '';

before(async () => {
  await dropAll();
  await migrate(false);
  await seed();
  guest = (await repo.getUserByEmail(pool, 'locatario@spacehour.demo'))!;
  admin = (await repo.getUserByEmail(pool, 'admin@spacehour.demo'))!;
  listings = await repo.searchListings(pool, {});
  server = createApp().listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
after(async () => {
  server.close();
  P.setGatewayOverride();
  V.setAnthropicClient();
  M.setMailSender();
  await pool.end();
});

const byTitle = (prefix: string) => listings.find((l) => l.title.startsWith(prefix))!;
function nextDateWith(listing: Listing, weekday: number, from = 3) {
  for (let i = from; i < from + 14; i++) {
    const date = addDays(todayInZone(listing.timezone), i);
    if (weekdayOf(date) === weekday) return date;
  }
  throw new Error('no date');
}

/** Provedor falso com checkout hospedado (como Stripe/Mercado Pago). */
function fakeGateway(): Gateway & { calls: string[] } {
  const calls: string[] = [];
  return {
    id: 'stripe', instant: false, supportsOffSession: true, calls,
    async createCheckout(p) { calls.push('checkout'); return { checkoutRef: `cs_${p.id}`, checkoutUrl: `https://checkout.test/${p.id}` }; },
    async capture() { calls.push('capture'); }, async cancel() { calls.push('cancel'); }, async refund() { calls.push('refund'); },
    async chargeExtra() { calls.push('extra'); return {}; },
    async holdDeposit(p) { calls.push('hold'); return `dep_${p.id}`; }, async captureDeposit() {}, async releaseDeposit() { calls.push('release'); },
    async parseWebhook() { return { eventId: 'x', updates: [] }; },
  };
}

test('checkout externo: reserva aguarda pagamento, webhook confirma (idempotente); falha libera o horário', async () => {
  const fake = fakeGateway();
  P.setGatewayOverride(() => fake);
  try {
    const l = byTitle('Sala de psicologia');
    const date = nextDateWith(l, 4);
    const b = await B.createBooking(guest, { listingId: l.id, occurrences: [{ date, start: '09:00', end: '10:00' }], guests: 1, purpose: 'Sessão', paymentMethod: 'card', acceptRules: true });
    assert.equal(b.status, 'pending_payment');
    assert.ok(b.paymentDeadline);
    const p = (await repo.getPayment(pool, b.paymentId))!;
    assert.equal(p.status, 'pending');
    assert.equal(p.checkoutUrl, `https://checkout.test/${p.id}`);

    await B.applyPaymentUpdate({ paymentId: p.id, outcome: 'authorized', providerRef: 'pi_1', customerRef: 'cus_1', paymentMethodRef: 'pm_1' });
    await B.applyPaymentUpdate({ paymentId: p.id, outcome: 'authorized', providerRef: 'pi_1' }); // repetido
    const confirmed = (await repo.getBooking(pool, b.id))!;
    assert.equal(confirmed.status, 'confirmed');
    const paid = (await repo.getPayment(pool, b.paymentId))!;
    assert.equal(paid.providerRef, 'pi_1');
    assert.equal(paid.history.filter((h) => h.event === 'authorized').length, 1);

    const b2 = await B.createBooking(guest, { listingId: l.id, occurrences: [{ date, start: '11:00', end: '12:00' }], guests: 1, purpose: 'Sessão', paymentMethod: 'card', acceptRules: true });
    await B.applyPaymentUpdate({ paymentId: b2.paymentId!, outcome: 'failed' });
    assert.equal((await repo.getBooking(pool, b2.id))!.status, 'expired');

    // checkout abandonado: a rotina expira depois do prazo
    const b3 = await B.createBooking(guest, { listingId: l.id, occurrences: [{ date, start: '14:00', end: '15:00' }], guests: 1, purpose: 'Sessão', paymentMethod: 'card', acceptRules: true });
    await B.tick(new Date(Date.now() + (B.PAYMENT_WINDOW_MINUTES + 1) * 60000));
    assert.equal((await repo.getBooking(pool, b3.id))!.status, 'expired');

    // pagamento que chega depois de expirar é devolvido
    await B.applyPaymentUpdate({ paymentId: b3.paymentId!, outcome: 'captured', providerRef: 'pi_late' });
    const late = (await repo.getPayment(pool, b3.paymentId))!;
    assert.ok(['refunded', 'voided'].includes(late.status), late.status);
  } finally {
    P.setGatewayOverride();
  }
});

test('anfitrião precisa confirmar que conferiu o registro profissional', async () => {
  const l = byTitle('Consultório odontológico completo');
  await repo.updateListing(pool, { ...l, instantBook: false, hostLicenseResponsibility: false });
  const host = (await repo.getUser(pool, l.hostId))!;
  const b = await B.createBooking(guest, { listingId: l.id, occurrences: [{ date: nextDateWith(l, 6), start: '09:00', end: '11:00' }], guests: 1, purpose: 'Atendimento', paymentMethod: 'card', acceptRules: true });
  assert.equal(b.status, 'pending_host');
  await assert.rejects(B.hostDecision(host, b.id, true), /host_license_check_required/);
  const ok = await B.hostDecision(host, b.id, true, undefined, true);
  assert.equal(ok.status, 'confirmed');
  assert.ok(ok.hostLicenseCheckAt);
  await repo.updateListing(pool, l);
});

test('Mercado Pago: webhook com assinatura válida consulta o pagamento; inválida é recusada', async () => {
  const secret = 'mp-secret';
  const http = (async (url: string) => {
    assert.match(String(url), /\/v1\/payments\/123$/);
    return new Response(JSON.stringify({ id: 123, status: 'approved', external_reference: 'pay_abc', transaction_amount: 90 }), { status: 200 });
  }) as typeof fetch;
  const gw = mercadoPagoGateway('BR', 'TEST-token', secret, http);
  const ts = '1700000000';
  const manifest = `id:123;request-id:req-1;ts:${ts};`;
  const v1 = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  const body = Buffer.from(JSON.stringify({ type: 'payment', data: { id: '123' } }));
  const r = await gw.parseWebhook(body, { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': 'req-1' }, {});
  assert.deepEqual(r.updates, [{ paymentId: 'pay_abc', outcome: 'captured', providerRef: '123', amount: 90 }]);
  await assert.rejects(gw.parseWebhook(body, { 'x-signature': `ts=${ts},v1=${'0'.repeat(64)}`, 'x-request-id': 'req-1' }, {}), /assinatura/);
});

// Cliente Anthropic falso que devolve o JSON pedido
function fakeClaude(result: Partial<LicenseAiResult>): Anthropic {
  const full: LicenseAiResult = {
    decision: 'approved', confidence: 'high', document_is_professional_license: true, name_matches: true, number_matches: true,
    regulator_matches_country: true, public_registry_checked: true, public_registry_found_active: true, signs_of_tampering: false, expired: false,
    extracted: { name: 'Dr. Teste', number: '999', regulator: 'CRM', profession: 'médico', expiry_date: null }, reasons: ['ok'], ...result,
  };
  return { beta: { messages: { create: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(full) }] }) } } } as unknown as Anthropic;
}

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

async function register(email: string) {
  const r = await fetch(`${base}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Dr. Teste', email, password: 'senha-forte-1', countryCode: 'BR', locale: 'pt-BR', acceptTerms: true, confirmAge: true }) });
  return (await r.json()) as { token: string; user: User };
}

async function sendLicense(token: string) {
  const form = new FormData();
  form.set('fullName', 'Dr. Teste'); form.set('body', 'CRM'); form.set('number', '999'); form.set('region', 'SP'); form.set('category', 'medical');
  form.set('document', new Blob([PNG], { type: 'image/png' }), 'crm.png');
  return fetch(`${base}/me/license`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
}

test('registro profissional: IA aprova só com alta confiança; o resto vai para a equipe', async () => {
  process.env.LICENSE_VERIFY_SYNC = 'true';
  try {
    V.setAnthropicClient(fakeClaude({}));
    const a = await register('medico1@example.com');
    const r1 = await sendLicense(a.token);
    assert.equal(r1.status, 202);
    assert.equal((await repo.getUser(pool, a.user.id))!.licenseStatus, 'approved');
    assert.equal((await repo.getUser(pool, a.user.id))!.professionalLicense?.verified, true);

    V.setAnthropicClient(fakeClaude({ confidence: 'medium' }));
    const b = await register('medico2@example.com');
    await sendLicense(b.token);
    assert.equal((await repo.getUser(pool, b.user.id))!.licenseStatus, 'needs_review');

    V.setAnthropicClient(fakeClaude({ decision: 'approved', signs_of_tampering: true }));
    const c = await register('medico3@example.com');
    await sendLicense(c.token);
    assert.equal((await repo.getUser(pool, c.user.id))!.licenseStatus, 'needs_review', 'indício de adulteração nunca aprova sozinho');

    // equipe revê e decide
    const adminTok = signToken(admin);
    const queue = await (await fetch(`${base}/admin/verifications`, { headers: { Authorization: `Bearer ${adminTok}` } })).json() as { id: string; user_id: string }[];
    const item = queue.find((q) => q.user_id === b.user.id)!;
    const doc = await fetch(`${base}/admin/verifications/${item.id}/document`, { headers: { Authorization: `Bearer ${adminTok}` } });
    assert.equal(doc.headers.get('content-type'), 'image/png');
    assert.equal((await fetch(`${base}/admin/verifications/${item.id}/document`, { headers: { Authorization: `Bearer ${b.token}` } })).status, 403);
    const d = await fetch(`${base}/admin/verifications/${item.id}/decision`, { method: 'POST', headers: { Authorization: `Bearer ${adminTok}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'rejected', note: 'ilegível' }) });
    assert.equal(d.status, 200);
    assert.equal((await repo.getUser(pool, b.user.id))!.licenseStatus, 'rejected');

    // sem chave da API: revisão manual
    V.setAnthropicClient();
    delete process.env.ANTHROPIC_API_KEY;
    const e = await register('medico4@example.com');
    await sendLicense(e.token);
    assert.equal((await repo.getUser(pool, e.user.id))!.licenseStatus, 'needs_review');

    // arquivo que não é imagem/PDF
    const form = new FormData();
    form.set('fullName', 'X Y Z'); form.set('body', 'CRM'); form.set('number', '1');
    form.set('document', new Blob(['oi'], { type: 'text/plain' }), 'a.txt');
    assert.equal((await fetch(`${base}/me/license`, { method: 'POST', headers: { Authorization: `Bearer ${e.token}` }, body: form })).status, 422);
  } finally {
    delete process.env.LICENSE_VERIFY_SYNC;
    V.setAnthropicClient();
  }
});

test('upload de fotos: imagens do celular/PC aceitas, outros arquivos recusados', async () => {
  const tok = signToken(guest);
  const form = new FormData();
  form.append('files', new Blob([PNG], { type: 'image/png' }), 'foto.png');
  form.append('files', new Blob([PNG], { type: 'application/octet-stream' }), 'IMG_0001.PNG');
  const r = await fetch(`${base}/uploads`, { method: 'POST', headers: { Authorization: `Bearer ${tok}` }, body: form });
  assert.equal(r.status, 201);
  const { files } = await r.json() as { files: { url: string; mime: string }[] };
  assert.equal(files.length, 2);
  assert.ok(files.every((f) => f.mime === 'image/png' && f.url.startsWith('/api/uploads/')));
  const img = await fetch(`${base}${files[0].url.slice(4)}`);
  assert.equal(img.status, 200);
  assert.deepEqual(Buffer.from(await img.arrayBuffer()), PNG);

  const bad = new FormData();
  bad.append('files', new Blob(['<script>alert(1)</script>'], { type: 'image/png' }), 'x.png');
  assert.equal((await fetch(`${base}/uploads`, { method: 'POST', headers: { Authorization: `Bearer ${tok}` }, body: bad })).status, 422);
  assert.equal((await fetch(`${base}/uploads`, { method: 'POST', body: form })).status, 401);
});

test('avaliação do app, sugestões e erros + fila de e-mails', async () => {
  const sent: { to: string; subject: string }[] = [];
  M.setMailSender(async (m) => { sent.push(m); });
  try {
    const post = (body: unknown, token?: string) => fetch(`${base}/feedback`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    assert.equal((await post({ kind: 'rating', rating: 5, message: 'Excelente!' }, signToken(guest))).status, 201);
    assert.equal((await post({ kind: 'bug', message: 'Botão de pagar não abre no iPhone', page: '/reservas/x', email: 'anon@example.com' })).status, 201);
    assert.equal((await post({ kind: 'suggestion', message: '' })).status, 422);
    assert.equal((await post({ kind: 'rating', rating: 9 })).status, 422);
    await new Promise((r) => setTimeout(r, 20));
    assert.ok(sent.some((m) => m.to === 'support@space-hour.com' && m.subject.includes('bug')));

    const list = await (await fetch(`${base}/admin/feedback`, { headers: { Authorization: `Bearer ${signToken(admin)}` } })).json() as { summary: { total: number; average: number; open_bugs: number } };
    assert.equal(list.summary.total, 2);
    assert.equal(list.summary.average, 5);
    assert.equal(list.summary.open_bugs, 1);
    assert.equal((await fetch(`${base}/admin/feedback`, { headers: { Authorization: `Bearer ${signToken(guest)}` } })).status, 403);

    // notificações viram e-mails pela fila
    sent.length = 0;
    const pending = await one<{ n: number }>(pool, "SELECT count(*)::int AS n FROM notifications WHERE email_status = 'pending'");
    assert.ok(pending!.n > 0);
    await M.flushEmailQueue(1000);
    assert.equal(sent.length, pending!.n);
    assert.equal((await one<{ n: number }>(pool, "SELECT count(*)::int AS n FROM notifications WHERE email_status = 'pending'"))!.n, 0);
  } finally {
    M.setMailSender();
  }
});

test('cron protegido por segredo', async () => {
  assert.equal((await fetch(`${base}/cron/tick`)).status, 401);
  process.env.CRON_SECRET = 's3cret';
  const r = await fetch(`${base}/cron/tick`, { headers: { Authorization: 'Bearer s3cret' } });
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(await r.json()).sort(), ['bookings', 'email', 'verifications']);
  delete process.env.CRON_SECRET;
});
