// Pagamentos com checkout externo, webhooks, verificação de registro por IA,
// uploads, avaliação do app e fila de e-mails (provedores externos simulados).
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { AddressInfo } from 'node:net';

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://spacehour:spacehour@localhost:5432/spacehour_test';
process.env.NODE_ENV = 'test';
process.env.LAUNCH_COUNTRIES ??= 'all'; // testes cobrem todos os países configurados
if (!/_test(\?|$)/.test(new URL(process.env.DATABASE_URL).pathname)) throw new Error('Banco de testes precisa terminar em _test');

const { dropAll, migrate, one, pool } = await import('../src/db.js');
const { seed } = await import('../src/seed.js');
const repo = await import('../src/repo.js');
const B = await import('../src/bookings.js');
const P = await import('../src/payments/index.js');
const V = await import('../src/verification.js');
const M = await import('../src/mailer.js');
const { mercadoPagoGateway } = await import('../src/payments/mercadopago.js');
const { createApp } = await import('../src/app.js');
const { signToken } = await import('../src/auth.js');
const { addDays, todayInZone, weekdayOf } = await import('../../shared/rules.js');
import type { Gateway } from '../src/payments/index.js';
import type { Listing, User } from '../../shared/types.js';
import type Anthropic from '@anthropic-ai/sdk';
import type { LicenseAiResult } from '../src/verification.js';

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

async function register(email: string, verified = true) {
  const r = await fetch(`${base}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Dr. Teste', email, password: 'senha-forte-1', countryCode: 'BR', locale: 'pt-BR', acceptTerms: true, confirmAge: true }) });
  const u = (await r.json()) as { token: string; user: User };
  if (verified) await pool.query('UPDATE users SET email_verified_at = now() WHERE id = $1', [u.user.id]);
  return u;
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
  assert.deepEqual(Object.keys(await r.json()).sort(), ['assistant', 'bookings', 'cart', 'documents', 'email', 'mp_tokens', 'push', 'verifications']);
  delete process.env.CRON_SECRET;
});

test('lançamento só no Brasil: busca e reservas restritas aos países liberados', async () => {
  const prev = process.env.LAUNCH_COUNTRIES;
  process.env.LAUNCH_COUNTRIES = 'BR';
  try {
    const all = await (await fetch(`${base}/listings`)).json() as Listing[];
    assert.ok(all.length > 0 && all.every((l) => l.countryCode === 'BR'));
    assert.deepEqual(await (await fetch(`${base}/listings?country=DE`)).json(), []);
    const de = listings.find((l) => l.countryCode === 'DE')!;
    await assert.rejects(B.createBooking(guest, { listingId: de.id, occurrences: [{ date: nextDateWith(de, 2), start: '10:00', end: '11:00' }], guests: 1, purpose: 'x', paymentMethod: 'card', acceptRules: true }), /country_not_supported/);
  } finally {
    process.env.LAUNCH_COUNTRIES = prev;
  }
});

test('documentos de registro: cifrados no banco, acesso registrado e apagados após o prazo', async () => {
  process.env.LICENSE_VERIFY_SYNC = 'true';
  V.setAnthropicClient(fakeClaude({}));
  try {
    const u = await register('medico-seg@example.com');
    const r = await sendLicense(u.token);
    const { verificationId } = await r.json() as { verificationId: string };
    const raw = await one<{ document: Buffer }>(pool, 'SELECT document FROM license_verifications WHERE id = $1', [verificationId]);
    assert.ok(!raw!.document.includes(PNG.subarray(0, 8)), 'arquivo não fica legível no banco');
    assert.equal(raw!.document.subarray(0, 4).toString(), 'SHE1');

    const adminTok = signToken(admin);
    const doc = await fetch(`${base}/admin/verifications/${verificationId}/document`, { headers: { Authorization: `Bearer ${adminTok}` } });
    assert.deepEqual(Buffer.from(await doc.arrayBuffer()), PNG, 'equipe vê o original');
    const log = await (await fetch(`${base}/admin/verifications/${verificationId}/access-log`, { headers: { Authorization: `Bearer ${adminTok}` } })).json() as { action: string; email: string | null }[];
    assert.ok(log.some((l) => l.action === 'view' && l.email === admin.email));
    assert.ok(log.some((l) => l.action === 'ai_analysis'));

    // antes do prazo nada é apagado; depois, só o arquivo some (o resultado fica)
    assert.equal(await V.purgeExpiredDocuments(), 0);
    assert.ok(await V.purgeExpiredDocuments(new Date(Date.now() + (V.DOCUMENT_RETENTION_DAYS() + 1) * 86400000)) >= 1);
    const gone = await fetch(`${base}/admin/verifications/${verificationId}/document`, { headers: { Authorization: `Bearer ${adminTok}` } });
    assert.equal(gone.status, 410);
    assert.equal((await repo.getUser(pool, u.user.id))!.licenseStatus, 'approved');
    const after = await one<{ n: number }>(pool, "SELECT count(*)::int AS n FROM document_access_log WHERE verification_id = $1 AND action = 'deleted'", [verificationId]);
    assert.equal(after!.n, 1);

    // documento antigo, gravado sem criptografia, é cifrado pela rotina
    const legacy = await one<{ id: string }>(pool, "SELECT id FROM license_verifications WHERE document IS NOT NULL LIMIT 1");
    await pool.query('UPDATE license_verifications SET document = $2 WHERE id = $1', [legacy!.id, PNG]);
    assert.ok(await V.encryptLegacyDocuments() >= 1);
    const enc = await one<{ document: Buffer }>(pool, 'SELECT document FROM license_verifications WHERE id = $1', [legacy!.id]);
    assert.equal(enc!.document.subarray(0, 4).toString(), 'SHE1');
  } finally {
    delete process.env.LICENSE_VERIFY_SYNC;
    V.setAnthropicClient();
  }
});

test('split Mercado Pago: anfitrião conecta a conta; pagamento criado em nome dele com a comissão da plataforma', async () => {
  const M = await import('../src/payments/mpAccounts.js');
  process.env.MP_CLIENT_ID = 'app123'; process.env.MP_CLIENT_SECRET = 'sec'; process.env.MP_WEBHOOK_SECRET = 'whsec';
  process.env.LAUNCH_COUNTRIES = 'BR';
  const prefs: { token: string; body: Record<string, unknown> }[] = [];
  const realFetch = globalThis.fetch;
  const fakeMp = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (!u.startsWith('https://api.mercadopago.com')) return realFetch(url as string, init);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (u.endsWith('/oauth/token')) {
      return new Response(JSON.stringify({ access_token: `SELLER-${body.grant_type}`, refresh_token: 'RT', expires_in: 15552000, user_id: 777, public_key: 'PK' }), { status: 200 });
    }
    if (u.endsWith('/checkout/preferences')) {
      prefs.push({ token: String((init?.headers as Record<string, string>).Authorization), body });
      return new Response(JSON.stringify({ id: 'pref1', init_point: 'https://mp/checkout', sandbox_init_point: 'https://mp/sandbox' }), { status: 201 });
    }
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
  globalThis.fetch = fakeMp;
  M.setMpHttp(fakeMp);
  try {
    const l = byTitle('Sala de psicologia');
    const host = (await repo.getUser(pool, l.hostId))!;
    const date = nextDateWith(l, 1);
    const input = { listingId: l.id, occurrences: [{ date, start: '15:00', end: '16:00' }], guests: 1, purpose: 'Sessão', paymentMethod: 'pix', acceptRules: true };
    process.env.MP_ACCESS_TOKEN_BR = 'PLATFORM';
    delete process.env.PAYMENTS_PROVIDER;
    // sem conta conectada: anúncio aparece como "em breve" (depois dos reserváveis) e não aceita reserva
    const before = await (await fetch(`${base}/listings`)).json() as (Listing & { bookable: boolean })[];
    const mine = before.filter((x) => x.hostId === host.id);
    assert.ok(mine.length > 0 && mine.every((x) => x.bookable === false));
    assert.ok(before.findIndex((x) => !x.bookable) > before.map((x) => x.bookable).lastIndexOf(true), 'reserváveis primeiro');
    assert.ok(!(await (await fetch(`${base}/listings?bookable=1`)).json() as Listing[]).some((x) => x.hostId === host.id));
    await assert.rejects(B.createBooking(guest, input), /host_payment_not_connected/);

    // anfitrião autoriza no Mercado Pago
    const hostTok = signToken(host);
    const { url } = await (await fetch(`${base}/me/payout-account/connect`, { method: 'POST', headers: { Authorization: `Bearer ${hostTok}` } })).json() as { url: string };
    assert.match(url, /^https:\/\/auth\.mercadopago\.com\.br\/authorization\?client_id=app123/);
    const state = new URL(url).searchParams.get('state')!;
    const cb = await fetch(`${base}/mp/oauth/callback?code=abc&state=${encodeURIComponent(state)}`, { redirect: 'manual' });
    assert.equal(cb.status, 302);
    assert.match(cb.headers.get('location')!, /mp=conectado/);
    const bad = await fetch(`${base}/mp/oauth/callback?code=abc&state=forjado`, { redirect: 'manual' });
    assert.match(bad.headers.get('location')!, /mp=erro/);
    const st = await (await fetch(`${base}/me/payout-account`, { headers: { Authorization: `Bearer ${hostTok}` } })).json() as { connected: boolean; mpUserId: string };
    assert.deepEqual([st.connected, st.mpUserId], [true, '777']);
    const stored = await one<{ access_token_enc: Buffer }>(pool, 'SELECT access_token_enc FROM mp_accounts WHERE user_id = $1', [host.id]);
    assert.ok(!stored!.access_token_enc.toString('latin1').includes('SELLER'), 'token guardado cifrado');

    // reserva: preferência criada com o token do anfitrião e comissão da plataforma
    const b = await B.createBooking(guest, input);
    assert.equal(b.status, 'pending_payment');
    const pref = prefs.at(-1)!;
    assert.equal(pref.token, 'Bearer SELLER-authorization_code');
    assert.equal(pref.body.marketplace_fee, Math.round((b.price.total - b.price.hostPayout) * 100) / 100);
    assert.equal((await repo.getPayment(pool, b.paymentId))!.sellerRef, '777');
    const after = await (await fetch(`${base}/listings`)).json() as Listing[];
    assert.ok(after.some((x) => x.hostId === host.id));
  } finally {
    globalThis.fetch = realFetch;
    M.setMpHttp();
    for (const k of ['MP_CLIENT_ID', 'MP_CLIENT_SECRET', 'MP_WEBHOOK_SECRET', 'MP_ACCESS_TOKEN_BR']) delete process.env[k];
    process.env.LAUNCH_COUNTRIES = 'all';
  }
});

test('anúncio no Brasil: estado + município do IBGE; e-mail de publicação com convite do SpaceHour ADS', async () => {
  const host = (await repo.getUserByEmail(pool, 'anfitriao@spacehour.demo'))!;
  const tok = signToken(host);
  const base0 = byTitle('Sala de psicologia');
  const body = {
    title: 'Consultório em Maringá', description: 'Consultório equipado para atendimentos por hora no centro de Maringá.', category: 'dental',
    countryCode: 'BR', state: 'PR', city: 'maringa', address: 'Av. XV de Novembro, 100', capacity: 3, amenities: ['wifi'], equipment: '',
    photos: [], pricePerHour: 80, minHours: 1, cleaningFee: 0, securityDeposit: 0, instantBook: true, cancellationPolicy: 'moderate',
    guarantorPolicy: 'none', requiresLicense: false, houseRules: 'Deixar a sala organizada.', bufferMinutes: 30,
    weeklyAvailability: base0.weeklyAvailability, blockedDates: [], active: true,
  };
  const post = (b: unknown) => fetch(`${base}/listings`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` }, body: JSON.stringify(b) });
  const r = await post(body);
  assert.equal(r.status, 201, await r.clone().text());
  const l = await r.json() as Listing;
  assert.deepEqual([l.state, l.city, l.timezone], ['PR', 'Maringá', 'America/Sao_Paulo'], 'nome oficial do município');
  assert.equal((await post({ ...body, state: undefined })).status, 422);
  assert.equal((await post({ ...body, city: 'Cidade Inventada' })).status, 422);
  const ac = await (await post({ ...body, state: 'AC', city: 'Rio Branco' })).json() as Listing;
  assert.equal(ac.timezone, 'America/Rio_Branco', 'fuso do município');
  const n = await one<{ text: string; link: string }>(pool, "SELECT text, link FROM notifications WHERE user_id = $1 AND kind = 'listing_published' ORDER BY created_at DESC LIMIT 1", [host.id]);
  assert.match(n!.text, /SpaceHour ADS/);
  assert.match(n!.link, /^\/anfitriao\/ads\?anuncio=/);
  const team = await one<{ email: string; text: string }>(pool, "SELECT email, text FROM notifications WHERE kind = 'admin_listing_published' AND text LIKE '%Rio Branco%' ORDER BY created_at DESC LIMIT 1");
  assert.equal(team!.email, 'support@space-hour.com', 'equipe avisada do novo anúncio');
  assert.match(team!.text, /Anfitrião: .*anfitriao@spacehour\.demo/);
  const found = await (await fetch(`${base}/listings?country=BR&state=PR&city=${encodeURIComponent('Maringá')}`)).json() as Listing[];
  assert.ok(found.some((x) => x.id === l.id));
});

test('outros países: estado/província + cidade da base; cidade fora da lista aceita com o fuso do estado', async () => {
  const host = (await repo.getUserByEmail(pool, 'anfitriao@spacehour.demo'))!;
  const tok = signToken(host);
  const base0 = byTitle('Sala de psicologia');
  const body = {
    title: 'Therapy office in Los Angeles', description: 'Quiet therapy office available by the hour in Los Angeles.', category: 'psychology',
    countryCode: 'US', state: 'CA', city: 'los angeles', address: '100 Main St', capacity: 3, amenities: ['wifi'], equipment: '',
    photos: [], pricePerHour: 50, minHours: 1, cleaningFee: 0, securityDeposit: 0, instantBook: true, cancellationPolicy: 'moderate',
    guarantorPolicy: 'none', requiresLicense: false, houseRules: 'Leave the room tidy.', bufferMinutes: 30,
    weeklyAvailability: base0.weeklyAvailability, blockedDates: [], active: true,
  };
  const post = (b: unknown) => fetch(`${base}/listings`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` }, body: JSON.stringify(b) });
  const la = await (await post(body)).json() as Listing & { stateName?: string };
  assert.deepEqual([la.state, la.city, la.timezone], ['CA', 'Los Angeles', 'America/Los_Angeles']);
  const ny = await (await post({ ...body, state: 'NY', city: 'Pequena Vila Inexistente' })).json() as Listing;
  assert.deepEqual([ny.city, ny.timezone], ['Pequena Vila Inexistente', 'America/New_York']);
  assert.equal((await post({ ...body, state: 'XX' })).status, 422);
  const geo = await fetch(`${base}/geo/US`);
  assert.equal(geo.status, 200);
  const g = await geo.json() as { label: string; states: { code: string }[] };
  assert.equal(g.label, 'state');
  assert.ok(g.states.some((s) => s.code === 'CA'));
  const view = await (await fetch(`${base}/listings/${la.id}`)).json() as { listing: { stateName?: string } };
  assert.equal(view.listing.stateName, 'California');
});

test('ADMIN_EMAILS promove a conta a administrador no próximo acesso (só com e-mail confirmado)', async () => {
  const fake = await register('falso-dono@example.com', false);
  process.env.ADMIN_EMAILS = 'falso-dono@example.com';
  try {
    const me = await (await fetch(`${base}/me`, { headers: { Authorization: `Bearer ${fake.token}` } })).json() as { roles: string[] };
    assert.ok(!me.roles.includes('admin'), 'e-mail não confirmado não vira admin');
    assert.equal((await sendLicense(fake.token)).status, 403);
  } finally {
    delete process.env.ADMIN_EMAILS;
  }
  const u = await register('dono@example.com');
  const tok = u.token;
  assert.equal((await fetch(`${base}/admin/feedback`, { headers: { Authorization: `Bearer ${tok}` } })).status, 403);
  process.env.ADMIN_EMAILS = ' outro@example.com , DONO@example.com ';
  try {
    const me = await (await fetch(`${base}/me`, { headers: { Authorization: `Bearer ${tok}` } })).json() as { roles: string[] };
    assert.ok(me.roles.includes('admin'));
    assert.equal((await fetch(`${base}/admin/feedback`, { headers: { Authorization: `Bearer ${tok}` } })).status, 200);
  } finally {
    delete process.env.ADMIN_EMAILS;
  }
});

test('ADMIN_EMAILS: conta Gmail vira admin já no login, mesmo com pontos, "+algo" ou aspas na Vercel', async () => {
  await register('robson.teste+site@gmail.com');
  process.env.ADMIN_EMAILS = '"RobsonTeste@googlemail.com"; outro@example.com';
  try {
    const r = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'robson.teste+site@gmail.com', password: 'senha-forte-1' }) });
    const { user } = await r.json() as { user: { roles: string[] } };
    assert.ok(user.roles.includes('admin'), 'login já devolve o papel de admin');
  } finally {
    delete process.env.ADMIN_EMAILS;
  }
  // Fora do Gmail, pontos continuam fazendo diferença
  const other = await register('ana.souza@example.com');
  process.env.ADMIN_EMAILS = 'anasouza@example.com';
  try {
    const me = await (await fetch(`${base}/me`, { headers: { Authorization: `Bearer ${other.token}` } })).json() as { roles: string[] };
    assert.ok(!me.roles.includes('admin'));
  } finally {
    delete process.env.ADMIN_EMAILS;
  }
});

test('origem do cadastro (UTM) aparece no relatório de campanha do admin', async () => {
  const r = await fetch(`${base}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Dra. Campanha', email: 'campanha@example.com', password: 'senha-forte-1', countryCode: 'BR', locale: 'pt-BR', acceptTerms: true, confirmAge: true, source: 'meta/paid/lancamento-anfitrioes' }) });
  assert.equal(r.status, 201);
  const u = (await r.json()) as { token: string };
  assert.equal((await fetch(`${base}/admin/signups`, { headers: { Authorization: `Bearer ${u.token}` } })).status, 403);
  const rep = await (await fetch(`${base}/admin/signups?days=7`, { headers: { Authorization: `Bearer ${signToken(admin)}` } })).json() as { bySource: { source: string; signups: number }[] };
  assert.equal(rep.bySource.find((s) => s.source === 'meta/paid/lancamento-anfitrioes')?.signups, 1);

  // Suporte: consulta de usuário pelo e-mail
  assert.equal((await fetch(`${base}/admin/users?email=campanha`, { headers: { Authorization: `Bearer ${u.token}` } })).status, 403);
  const found = await (await fetch(`${base}/admin/users?email=CAMPANHA@`, { headers: { Authorization: `Bearer ${signToken(admin)}` } })).json() as { email: string; email_verified_at: string | null; mp_connected_at: string | null; listings: unknown[]; emails: { kind: string }[] }[];
  assert.equal(found.length, 1);
  assert.equal(found[0].email, 'campanha@example.com');
  assert.equal(found[0].email_verified_at, null);
  assert.equal(found[0].mp_connected_at, null);
  assert.deepEqual(found[0].listings, []);
});

test('app: token de push registrado, fila envia pelo FCM e token inválido é removido', async () => {
  const u = await register('push@example.com');
  const auth = { Authorization: `Bearer ${u.token}`, 'Content-Type': 'application/json' };
  const tok = 'fcm-token-'.padEnd(40, 'x');
  assert.equal((await fetch(`${base}/me/push-token`, { method: 'POST', headers: auth, body: JSON.stringify({ token: tok, platform: 'android' }) })).status, 204);
  assert.equal((await fetch(`${base}/me/push-token`, { method: 'POST', headers: auth, body: JSON.stringify({ token: 'curto', platform: 'android' }) })).status, 422);

  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ project_id: 'spacehour-test', client_email: 'sa@test.iam', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) });
  const realFetch = globalThis.fetch;
  const calls: { url: string; body?: string }[] = [];
  let unregistered = false;
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const s = String(url);
    if (!s.includes('googleapis.com')) return realFetch(url, init);
    calls.push({ url: s, body: init?.body as string });
    if (s.includes('oauth2')) return new Response(JSON.stringify({ access_token: 'at', expires_in: 3600 }));
    return unregistered ? new Response('{"error":{"status":"NOT_FOUND","details":[{"errorCode":"UNREGISTERED"}]}}', { status: 404 }) : new Response('{}');
  }) as typeof fetch;
  try {
    const P = await import('../src/push.js');
    const N = await import('../src/notify.js');
    await pool.query("UPDATE notifications SET push_status = 'skipped'");
    await N.notify(pool, { userId: u.user.id }, 'test', 'Nova reserva confirmada!\nSala 2, amanhã às 10h.', '/reservas/1');
    assert.equal(await P.flushPushQueue(), 1);
    const msg = JSON.parse(calls.find((c) => c.url.includes('messages:send'))!.body!).message;
    assert.equal(msg.token, tok);
    assert.equal(msg.notification.title, 'Nova reserva confirmada!');
    assert.equal(msg.data.link, '/reservas/1');
    unregistered = true;
    await N.notify(pool, { userId: u.user.id }, 'test', 'Outra', '/');
    await P.flushPushQueue();
    assert.equal((await one(pool, 'SELECT 1 FROM push_tokens WHERE token = $1', [tok])), undefined, 'token inválido removido');
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.FIREBASE_SERVICE_ACCOUNT;
  }
});

test('exclusão de conta: exige senha, bloqueia com reserva em aberto e anonimiza', async () => {
  const u = await register('excluir@example.com');
  const del = (password: string, token = u.token) => fetch(`${base}/me`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
  assert.equal((await del('errada')).status, 401);
  assert.equal((await del('senha-forte-1')).status, 204);
  const row = await one<{ email: string; name: string; deleted_at: Date | null }>(pool, 'SELECT email, name, deleted_at FROM users WHERE id = $1', [u.user.id]);
  assert.equal(row!.name, 'Conta excluída');
  assert.ok(row!.deleted_at && !row!.email.includes('excluir@'));
  assert.equal((await fetch(`${base}/me`, { headers: { Authorization: `Bearer ${u.token}` } })).status, 403);
  const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'excluir@example.com', password: 'senha-forte-1' }) });
  assert.equal(login.status, 401);
  // o e-mail fica livre para um novo cadastro
  assert.equal((await fetch(`${base}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'De Novo', email: 'excluir@example.com', password: 'senha-forte-1', countryCode: 'BR', locale: 'pt-BR', acceptTerms: true, confirmAge: true }) })).status, 201);

  const open = await one<{ guest_id: string }>(pool, "SELECT guest_id FROM bookings WHERE status = 'confirmed' LIMIT 1");
  const guest = (await repo.getUser(pool, open!.guest_id))!;
  const r = await fetch(`${base}/me`, { method: 'DELETE', headers: { Authorization: `Bearer ${signToken(guest)}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'demo12345' }) });
  assert.equal(r.status, 409);
});

test('assistente de dúvidas: responde com a IA, grava a conversa e envia a transcrição à equipe', async () => {
  const A = await import('../src/assistant.js');
  const seen: { system: string; messages: { role: string; content: unknown }[] }[] = [];
  A.setAssistantClient({ messages: { create: async (req: { system: { text: string }[]; messages: { role: string; content: unknown }[] }) => {
    seen.push({ system: req.system[0].text, messages: req.messages });
    return { stop_reason: 'end_turn', content: [{ type: 'text', text: `Resposta ${seen.length}` }] };
  } } } as unknown as Anthropic);
  try {
    const u = await register('duvidas@example.com');
    const post = (body: unknown, tok?: string) => fetch(`${base}/assistant`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) }, body: JSON.stringify(body) });
    const r1 = await (await post({ message: 'Quanto custa anunciar?', page: '/anuncie' }, u.token)).json() as { conversationId: string; reply: string };
    assert.equal(r1.reply, 'Resposta 1');
    assert.match(seen[0].system, /Anunciar não custa nada/);
    assert.match(seen[0].system, /DOCUMENTO OFICIAL: Normas de Conduta/);
    const r2 = await (await post({ conversationId: r1.conversationId, message: 'E no cartão?' }, u.token)).json() as { conversationId: string; reply: string };
    assert.equal(r2.conversationId, r1.conversationId);
    assert.deepEqual(seen[1].messages.map((m) => m.role), ['user', 'assistant', 'user'], 'histórico vem do banco');
    assert.equal((await post({ message: '' })).status, 422);

    // transcrição por e-mail depois de 20 min parada
    await pool.query("UPDATE assistant_conversations SET updated_at = now() - interval '30 minutes' WHERE id = $1", [r1.conversationId]);
    assert.ok(await A.emailIdleConversations() >= 1);
    const n = await one<{ email: string; text: string }>(pool, "SELECT email, text FROM notifications WHERE kind = 'assistant_transcript' ORDER BY created_at DESC LIMIT 1");
    assert.equal(n!.email, 'support@space-hour.com');
    assert.match(n!.text, /duvidas@example\.com/);
    assert.match(n!.text, /🧑 Pessoa: Quanto custa anunciar\?\n🤖 Assistente: Resposta 1/);

    // equipe vê as conversas no admin; usuário comum não
    assert.equal((await fetch(`${base}/admin/assistant`, { headers: { Authorization: `Bearer ${u.token}` } })).status, 403);
    const list = await (await fetch(`${base}/admin/assistant`, { headers: { Authorization: `Bearer ${signToken(admin)}` } })).json() as { id: string; messages: unknown[] }[];
    assert.equal(list.find((c) => c.id === r1.conversationId)?.messages.length, 4);
  } finally {
    A.setAssistantClient();
  }
});

test('esqueci minha senha: link por e-mail (1 h, uso único), não revela contas e derruba sessões antigas', async () => {
  const sent: { to: string; text: string }[] = [];
  M.setMailSender(async (m) => { sent.push(m); });
  try {
    const u = await register('esqueci@example.com', false);
    const post = (path: string, body: unknown) => fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    // resposta igual para e-mail com e sem conta
    const a = await post('/auth/forgot-password', { email: 'ESQUECI@example.com' });
    const b = await post('/auth/forgot-password', { email: 'ninguem@example.com' });
    assert.deepEqual([a.status, await a.json()], [b.status, await b.json()]);
    const mail = sent.find((m) => m.to === 'esqueci@example.com' && m.text.includes('redefinir-senha'))!;
    assert.ok(mail); assert.ok(sent.every((m) => m.to !== 'ninguem@example.com'));
    const t = /token=([\w-]+)/.exec(mail.text)![1];

    assert.equal((await post('/auth/reset-password', { token: t, password: 'curta' })).status, 422);
    const ok = await post('/auth/reset-password', { token: t, password: 'nova-senha-123' });
    assert.equal(ok.status, 200);
    const fresh = await ok.json() as { token: string; user: { emailVerifiedAt?: string } };
    assert.ok(fresh.user.emailVerifiedAt, 'e-mail confirmado ao redefinir');
    assert.equal((await post('/auth/reset-password', { token: t, password: 'outra-senha-123' })).status, 400, 'uso único');
    assert.equal((await post('/auth/login', { email: 'esqueci@example.com', password: 'senha-forte-1' })).status, 401);
    assert.equal((await post('/auth/login', { email: 'esqueci@example.com', password: 'nova-senha-123' })).status, 200);
    assert.equal((await fetch(`${base}/me`, { headers: { Authorization: `Bearer ${fresh.token}` } })).status, 200);
    // sessão emitida antes da troca (simula a troca 10 s depois do login antigo)
    await pool.query("UPDATE users SET password_changed_at = password_changed_at + interval '10 seconds' WHERE lower(email) = 'esqueci@example.com'");
    assert.equal((await fetch(`${base}/me`, { headers: { Authorization: `Bearer ${u.token}` } })).status, 401, 'sessão antiga derrubada');
    // link vencido (mais de 1 h)
    await pool.query("UPDATE users SET password_reset_sent_at = NULL WHERE lower(email) = 'esqueci@example.com'");
    await post('/auth/forgot-password', { email: 'esqueci@example.com' });
    const t2 = /token=([\w-]+)/.exec(sent.filter((m) => m.text.includes('redefinir-senha')).at(-1)!.text)![1];
    await pool.query("UPDATE users SET password_reset_sent_at = now() - interval '2 hours' WHERE lower(email) = 'esqueci@example.com'");
    assert.equal((await post('/auth/reset-password', { token: t2, password: 'outra-senha-123' })).status, 400);
  } finally {
    M.setMailSender();
  }
});

test('reserva abandonada: até 2 lembretes por e-mail, para ao reservar ou descadastrar; lembrete de confirmação; base de contatos', async () => {
  const C = await import('../src/cartRecovery.js');
  const mails: { to: string; subject: string; text: string; headers?: Record<string, string> }[] = [];
  M.setMailSender(async (m) => { mails.push(m); });
  const later = (min: number) => new Date(Date.now() + min * 60000);
  try {
    const l = byTitle('Sala de psicologia');
    const date = nextDateWith(l, 2);
    const query = new URLSearchParams({ o: JSON.stringify([{ date, start: '09:00', end: '10:00' }]), g: '1' }).toString();
    const u = await register('carrinho@example.com');
    const auth = { Authorization: `Bearer ${u.token}`, 'Content-Type': 'application/json' };
    assert.equal((await fetch(`${base}/checkout-intents`, { method: 'POST', headers: auth, body: JSON.stringify({ listingId: l.id, query }) })).status, 204);
    const reminders = () => mails.filter((m) => m.headers?.['List-Unsubscribe']);
    const mine = () => reminders().filter((m) => m.to === 'carrinho@example.com');

    await C.sendCartReminders(later(30));
    assert.equal(mine().length, 0, 'antes de 1 h não lembra');
    await C.sendCartReminders(later(61));
    assert.equal(mine().length, 1);
    assert.match(mine()[0].subject, /ficou pela metade/);
    assert.ok(mine()[0].text.includes(`/reservar/${l.id}?`) && mine()[0].text.includes(date.split('-').reverse().join('/')));
    assert.match(mine()[0].headers?.['List-Unsubscribe'] ?? '', /email\/unsubscribe/);
    await C.sendCartReminders(later(120));
    assert.equal(mine().length, 1, 'segundo só depois de 24 h');
    await C.sendCartReminders(later(61 + 24 * 60 + 1));
    assert.equal(mine().length, 2);
    await C.sendCartReminders(later(61 + 72 * 60));
    assert.equal(mine().length, 2, 'no máximo 2');

    // reservou: não lembra; checkout não pago que expira volta a lembrar com os mesmos horários
    const fake = fakeGateway();
    P.setGatewayOverride(() => fake);
    const gAuth = { Authorization: `Bearer ${signToken(guest)}`, 'Content-Type': 'application/json' };
    const gDate = nextDateWith(l, 5);
    await fetch(`${base}/checkout-intents`, { method: 'POST', headers: gAuth, body: JSON.stringify({ listingId: l.id, query: '' }) });
    const b = await B.createBooking(guest, { listingId: l.id, occurrences: [{ date: gDate, start: '16:00', end: '17:00' }], guests: 1, purpose: 'Sessão', paymentMethod: 'card', acceptRules: true });
    const toGuest = () => reminders().filter((m) => m.to === guest.email);
    await C.sendCartReminders(later(61));
    assert.equal(toGuest().length, 0, 'reservou: sem lembrete');
    await B.tick(later(B.PAYMENT_WINDOW_MINUTES + 1));
    assert.equal((await repo.getBooking(pool, b.id))!.status, 'expired');
    P.setGatewayOverride();
    await C.sendCartReminders(later(61));
    assert.equal(toGuest().length, 1, 'não pagou: lembra');
    assert.ok(toGuest()[0].text.includes(gDate.split('-').reverse().join('/')));

    // descadastro pelo link: não recebe mais
    const link = mine()[0].text.match(/https?:\/\/\S+email\/unsubscribe\S+/)![0];
    const unsub = new URL(link);
    assert.equal((await fetch(`${base}/email/unsubscribe${unsub.search.replace(/t=[^&]+/, 't=errado')}`)).status, 400);
    assert.equal((await fetch(`${base}/email/unsubscribe${unsub.search}`)).status, 200);
    const l2 = byTitle('Sala de aula');
    await fetch(`${base}/checkout-intents`, { method: 'POST', headers: auth, body: JSON.stringify({ listingId: l2.id, query }) });
    await C.sendCartReminders(later(61));
    assert.equal(mine().length, 2);
    assert.deepEqual(await (await fetch(`${base}/me/marketing`, { headers: auth })).json(), { optIn: false, unsubscribed: true });

    // quem não confirmou o e-mail recebe 1 lembrete depois de 24 h
    const pend = await register('semconfirmar@example.com', false);
    await C.sendVerifyReminders();
    assert.equal(mails.filter((m) => m.to === 'semconfirmar@example.com' && /falta só confirmar/.test(m.subject)).length, 0);
    await pool.query("UPDATE users SET created_at = now() - interval '25 hours' WHERE id = $1", [pend.user.id]);
    await C.sendVerifyReminders();
    await C.sendVerifyReminders();
    assert.equal(mails.filter((m) => m.to === 'semconfirmar@example.com' && /falta só confirmar/.test(m.subject)).length, 1);

    // base de contatos: consentimento no cadastro, filtros e CSV
    const r = await fetch(`${base}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Dra. Novidades', email: 'novidades@example.com', password: 'senha-forte-1', countryCode: 'BR', locale: 'pt-BR', acceptTerms: true, confirmAge: true, marketingOptIn: true }) });
    assert.equal(r.status, 201);
    const adm = { Authorization: `Bearer ${signToken(admin)}` };
    assert.equal((await fetch(`${base}/admin/contacts`, { headers: { Authorization: `Bearer ${u.token}` } })).status, 403);
    type Rep = { summary: { total: number; verified: number; unverified: number; opt_in: number }; contacts: { email: string; email_verified: boolean }[] };
    const all = await (await fetch(`${base}/admin/contacts`, { headers: adm })).json() as Rep;
    assert.equal(all.summary.total, all.summary.verified + all.summary.unverified);
    assert.ok(!all.contacts.some((c) => c.email === admin.email), 'sem a equipe');
    const unv = await (await fetch(`${base}/admin/contacts?status=unverified`, { headers: adm })).json() as Rep;
    assert.ok(unv.contacts.some((c) => c.email === 'semconfirmar@example.com') && unv.contacts.every((c) => !c.email_verified));
    const opt = await (await fetch(`${base}/admin/contacts?consent=yes`, { headers: adm })).json() as Rep;
    assert.deepEqual(opt.contacts.map((c) => c.email), ['novidades@example.com']);
    const csv = await (await fetch(`${base}/admin/contacts?format=csv&status=verified`, { headers: adm })).text();
    assert.match(csv, /^﻿?"?nome"?;/);
    assert.ok(csv.includes('carrinho@example.com') && !csv.includes('semconfirmar@example.com'));
  } finally {
    M.setMailSender();
    P.setGatewayOverride();
  }
});

test('cadastro fácil e seguro: código de 6 dígitos, anúncio salvo até confirmar, IP/aparelho registrados, e-mail descartável recusado', async () => {
  const mails: { to: string; subject: string; text: string }[] = [];
  M.setMailSender(async (m) => { mails.push(m); });
  try {
    const reg = (email: string) => fetch(`${base}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'TesteUA/1.0' },
      body: JSON.stringify({ name: 'Dra. Código', email, password: 'senha-forte-1', countryCode: 'BR', locale: 'pt-BR', acceptTerms: true, confirmAge: true }) });
    assert.equal((await reg('alguem@mailinator.com')).status, 422);
    const r = await reg('codigo@example.com');
    assert.equal(r.status, 201);
    const u = await r.json() as { token: string; user: User };
    const auth = { Authorization: `Bearer ${u.token}`, 'Content-Type': 'application/json' };
    const mail = mails.find((m) => m.to === 'codigo@example.com')!;
    const code = /Seu código: (\d{6})/.exec(mail.text)![1];
    assert.match(mail.subject, new RegExp(code));

    // anúncio antes de confirmar: fica salvo e fora do ar
    const base0 = byTitle('Sala de psicologia');
    const body = {
      title: 'Sala salva antes de confirmar', description: 'Sala equipada para atendimentos por hora, anunciada antes de confirmar o e-mail.', category: 'psychology',
      countryCode: 'BR', state: 'PR', city: 'Maringá', address: 'Av. Brasil, 200', capacity: 2, amenities: ['wifi'], equipment: '',
      photos: [], pricePerHour: 60, minHours: 1, cleaningFee: 0, securityDeposit: 0, instantBook: true, cancellationPolicy: 'moderate',
      guarantorPolicy: 'none', requiresLicense: false, houseRules: 'Deixar a sala organizada.', bufferMinutes: 30,
      weeklyAvailability: base0.weeklyAvailability, blockedDates: [], active: true,
    };
    const lr = await fetch(`${base}/listings`, { method: 'POST', headers: auth, body: JSON.stringify(body) });
    assert.equal(lr.status, 201, await lr.clone().text());
    const saved = await lr.json() as Listing & { pendingEmail: boolean };
    assert.equal(saved.pendingEmail, true);
    assert.equal(saved.active, false);
    const search = async () => (await (await fetch(`${base}/listings?country=BR`)).json() as Listing[]).some((x) => x.id === saved.id);
    assert.equal(await search(), false);

    // código errado conta tentativa; certo confirma e publica o anúncio
    const wrong = await fetch(`${base}/me/verify-code`, { method: 'POST', headers: auth, body: JSON.stringify({ code: code === '000000' ? '111111' : '000000' }) });
    assert.equal(wrong.status, 400);
    assert.equal(((await wrong.json()) as { params: { left: number } }).params.left, 4);
    assert.equal((await fetch(`${base}/me/verify-code`, { method: 'POST', headers: auth, body: JSON.stringify({ code }) })).status, 200);
    assert.ok(((await (await fetch(`${base}/me`, { headers: auth })).json()) as User).emailVerifiedAt);
    assert.equal(await search(), true, 'anúncio entrou no ar na confirmação');
    const sec = await one<{ signup_ip: string; signup_user_agent: string; email_verified_ip: string }>(pool,
      'SELECT signup_ip, signup_user_agent, email_verified_ip FROM users WHERE id = $1', [u.user.id]);
    assert.ok(sec!.signup_ip && sec!.email_verified_ip);
    assert.equal(sec!.signup_user_agent, 'TesteUA/1.0');
    const adm = await (await fetch(`${base}/admin/users?email=codigo@`, { headers: { Authorization: `Bearer ${signToken(admin)}` } })).json() as { emailProvider: { domain: string; kind: string }; signup_ip: string }[];
    assert.deepEqual(adm[0].emailProvider, { domain: 'example.com', kind: 'own_domain' });

    // 5 erros: precisa pedir um novo código
    const r2 = await reg('codigo2@example.com');
    const u2 = await r2.json() as { token: string };
    const auth2 = { Authorization: `Bearer ${u2.token}`, 'Content-Type': 'application/json' };
    const code2 = /Seu código: (\d{6})/.exec(mails.find((m) => m.to === 'codigo2@example.com')!.text)![1];
    const bad = code2 === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) await fetch(`${base}/me/verify-code`, { method: 'POST', headers: auth2, body: JSON.stringify({ code: bad }) });
    assert.equal((await fetch(`${base}/me/verify-code`, { method: 'POST', headers: auth2, body: JSON.stringify({ code: code2 }) })).status, 429);
  } finally {
    M.setMailSender();
  }
});

test('identidade: CPF/CNPJ + documento + selfie com checagem automática; equipe revê o resto; CEP do anúncio conferido', async () => {
  const I = await import('../src/identity.js');
  assert.equal(I.validCpf('529.982.247-25'), true);
  assert.equal(I.validCpf('111.111.111-11'), false);
  assert.equal(I.validCpf('529.982.247-24'), false);
  assert.equal(I.validCnpj('11.222.333/0001-81'), true);
  assert.equal(I.validCnpj('11.222.333/0001-80'), false);
  assert.equal(I.sameName('JOSÉ CARLOS DA SILVA', 'Jose da Silva'), true);
  assert.equal(I.sameName('Maria Souza', 'Mariana Souza'), false);

  const aiResult = (over: Record<string, unknown> = {}) => ({
    is_identity_document: true, document_kind: 'CNH', legible: true, signs_of_tampering: false, extracted_name: 'Ana Paula Ribeiro',
    extracted_cpf: '52998224725', extracted_birth_date: '1990-01-01', name_matches: true, cpf_matches: true, selfie_is_live_person: true,
    confidence: 'high', reasons: [], ...over,
  });
  const fakeAi = (over?: Record<string, unknown>) => ({ beta: { messages: { create: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(aiResult(over)) }] }) } } }) as unknown as Anthropic;
  const cnpjApi = (partner: string, status = 'ATIVA') => (async (url: string | URL | Request) => {
    const u = String(url);
    if (u.includes('/cnpj/')) return new Response(JSON.stringify({ razao_social: 'CLINICA RIBEIRO LTDA', descricao_situacao_cadastral: status, qsa: [{ nome_socio: partner }] }), { status: 200 });
    if (u.includes('/cep/v1/01310100')) return new Response(JSON.stringify({ city: 'São Paulo', state: 'SP' }), { status: 200 });
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
  const newUser = async (email: string) => {
    const r = await fetch(`${base}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Ana Paula Ribeiro', email, password: 'senha-forte-1', countryCode: 'BR', locale: 'pt-BR', acceptTerms: true, confirmAge: true }) });
    return r.json() as Promise<{ token: string; user: User }>;
  };
  const send = (token: string, taxId: string) => {
    const form = new FormData();
    form.set('taxId', taxId);
    form.set('document', new Blob([PNG], { type: 'image/png' }), 'doc.png');
    form.set('selfie', new Blob([PNG], { type: 'image/png' }), 'selfie.png');
    return fetch(`${base}/me/identity`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  };
  process.env.LICENSE_VERIFY_SYNC = 'true';
  try {
    // CPF inválido é recusado na hora
    const a = await newUser('id1@example.com');
    assert.equal((await send(a.token, '111.111.111-11')).status, 422);
    // tudo batendo: aprovado sozinho
    V.setAnthropicClient(fakeAi());
    assert.equal((await send(a.token, '529.982.247-25')).status, 202);
    const ua = (await repo.getUser(pool, a.user.id))!;
    assert.equal(ua.identityVerified, true);
    assert.equal(ua.documentNumber, '52998224725');
    const me = await (await fetch(`${base}/me/identity`, { headers: { Authorization: `Bearer ${a.token}` } })).json() as { verified: boolean; status: string };
    assert.deepEqual([me.verified, me.status], [true, 'approved']);

    // CNPJ: pessoa no quadro de sócios e empresa ativa → aprovado; fora do quadro → equipe
    I.setIdentityHttp(cnpjApi('ANA PAULA RIBEIRO'));
    const b = await newUser('id2@example.com');
    await send(b.token, '11.222.333/0001-81');
    assert.equal((await repo.getUser(pool, b.user.id))!.identityVerified, true);
    I.setIdentityHttp(cnpjApi('OUTRA PESSOA QUALQUER'));
    const c = await newUser('id3@example.com');
    await send(c.token, '11222333000181');
    assert.equal((await repo.getUser(pool, c.user.id))!.identityVerified, false);

    // selfie que não é foto real → equipe; documento adulterado → recusado
    V.setAnthropicClient(fakeAi({ selfie_is_live_person: false }));
    const d = await newUser('id4@example.com');
    await send(d.token, '52998224725');
    assert.equal((await I.latestIdentity(d.user.id))!.status, 'needs_review');
    V.setAnthropicClient(fakeAi({ signs_of_tampering: true }));
    const e = await newUser('id5@example.com');
    await send(e.token, '52998224725');
    assert.equal((await I.latestIdentity(e.user.id))!.status, 'rejected');

    // equipe: lista, abre a selfie (registrado) e aprova
    const adm = { Authorization: `Bearer ${signToken(admin)}` };
    assert.equal((await fetch(`${base}/admin/identities`, { headers: { Authorization: `Bearer ${a.token}` } })).status, 403);
    const open = await (await fetch(`${base}/admin/identities`, { headers: adm })).json() as { id: string; email: string }[];
    const cv = open.find((x) => x.email === 'id3@example.com')!;
    assert.ok(cv && open.some((x) => x.email === 'id4@example.com'));
    const selfie = await fetch(`${base}/admin/identities/${cv.id}/selfie`, { headers: adm });
    assert.equal(selfie.status, 200);
    assert.ok(Buffer.from(await selfie.arrayBuffer()).equals(PNG), 'arquivo decifrado para a equipe');
    const stored = await one<{ selfie: Buffer }>(pool, 'SELECT selfie FROM identity_verifications WHERE id = $1', [cv.id]);
    assert.ok(!stored!.selfie.equals(PNG), 'guardado cifrado');
    assert.equal((await one<{ n: number }>(pool, "SELECT count(*)::int AS n FROM identity_access_log WHERE verification_id = $1 AND action = 'view'", [cv.id]))!.n, 1);
    await fetch(`${base}/admin/identities/${cv.id}/decision`, { method: 'POST', headers: { ...adm, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'approved' }) });
    assert.equal((await repo.getUser(pool, c.user.id))!.identityVerified, true);

    // CEP do anúncio precisa ser da cidade informada
    const host = (await repo.getUserByEmail(pool, 'anfitriao@spacehour.demo'))!;
    const base0 = byTitle('Sala de psicologia');
    const body = {
      title: 'Sala com CEP conferido', description: 'Sala equipada para atendimentos por hora com CEP conferido pela plataforma.', category: 'psychology',
      countryCode: 'BR', state: 'PR', city: 'Maringá', address: 'Av. Paulista, 1000 - CEP 01310-100', capacity: 2, amenities: ['wifi'], equipment: '',
      photos: [], pricePerHour: 60, minHours: 1, cleaningFee: 0, securityDeposit: 0, instantBook: true, cancellationPolicy: 'moderate',
      guarantorPolicy: 'none', requiresLicense: false, houseRules: 'Deixar a sala organizada.', bufferMinutes: 30,
      weeklyAvailability: base0.weeklyAvailability, blockedDates: [], active: true,
    };
    const post = (b0: unknown) => fetch(`${base}/listings`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${signToken(host)}` }, body: JSON.stringify(b0) });
    const wrongCity = await post(body);
    assert.equal(wrongCity.status, 422);
    assert.equal(((await wrongCity.json()) as { error: string }).error, 'cep_city_mismatch');
    assert.equal((await post({ ...body, state: 'SP', city: 'São Paulo' })).status, 201);
    assert.equal(((await (await post({ ...body, address: 'Rua X, 1 - 99999-999' })).json()) as { error: string }).error, 'cep_not_found');
  } finally {
    delete process.env.LICENSE_VERIFY_SYNC;
    V.setAnthropicClient();
    I.setIdentityHttp();
  }
});

test('Mercado Pago: diagnóstico para a equipe e PKCE quando ligado', async () => {
  const MP = await import('../src/payments/mpAccounts.js');
  process.env.MP_CLIENT_ID = 'app123'; process.env.MP_CLIENT_SECRET = 'sec';
  process.env.MP_PKCE = 'true';
  try {
    const cfg = await (await fetch(`${base}/admin/mp-config`, { headers: { Authorization: `Bearer ${signToken(admin)}` } })).json() as { configured: boolean; redirectUri: string; pkce: boolean };
    assert.deepEqual([cfg.configured, cfg.pkce], [true, true]);
    assert.match(cfg.redirectUri, /\/api\/mp\/oauth\/callback$/);
    const url = new URL(MP.authorizeUrl(guest.id));
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    const challenge = url.searchParams.get('code_challenge')!;
    let sent: Record<string, string> = {};
    MP.setMpHttp((async (_u: unknown, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ access_token: 'APP_USR-x', refresh_token: 'r', expires_in: 3600, user_id: 777001 }), { status: 200 });
    }) as typeof fetch);
    await MP.completeAuthorization('code-1', url.searchParams.get('state')!);
    assert.ok(sent.code_verifier, 'envia o verificador na troca do código');
    assert.equal(crypto.createHash('sha256').update(sent.code_verifier).digest('base64url'), challenge);
    assert.ok(!url.searchParams.get('state')!.includes(sent.code_verifier), 'verificador não vai legível no state');
    await MP.disconnect(guest.id);
  } finally {
    MP.setMpHttp();
    delete process.env.MP_CLIENT_ID; delete process.env.MP_CLIENT_SECRET; delete process.env.MP_PKCE;
  }
});

test('diagnóstico da configuração: sem segredos, mostra admins, e-mail e Mercado Pago', async () => {
  process.env.ADMIN_EMAILS = 'a@example.com, b@example.com';
  try {
    const r = await (await fetch(`${base}/health/config`)).json() as Record<string, unknown>;
    assert.equal(r.adminEmailsConfigured, 2);
    assert.equal(r.emailSending, false);
    assert.equal(r.smtpLogin, 'SMTP_HOST ausente');
    assert.equal(r.mercadoPago, false);
    assert.ok(!JSON.stringify(r).includes('a@example.com'), 'não expõe os e-mails');
  } finally {
    delete process.env.ADMIN_EMAILS;
  }
});

test('Asaas: anfitrião cria a carteira; locatário escolhe onde pagar (Pix sem conta), split para o anfitrião e aviso confirma', async () => {
  const A = await import('../src/payments/asaas.js');
  process.env.ASAAS_API_KEY = 'PLATFORM_KEY'; process.env.ASAAS_ENV = 'sandbox';
  process.env.LAUNCH_COUNTRIES = 'BR';
  delete process.env.PAYMENTS_PROVIDER;
  const calls: { method: string; path: string; key: string; body: Record<string, unknown> }[] = [];
  A.setAsaasHttp((async (url: string | URL | Request, init?: RequestInit) => {
    const path = String(url).replace('https://api-sandbox.asaas.com/v3', '');
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push({ method: init?.method ?? 'GET', path, key: String((init?.headers as Record<string, string>).access_token), body });
    if (path === '/accounts') return new Response(JSON.stringify({ id: 'acc_1', walletId: '0b6a5e2c-1111-4222-8333-944455556666', apiKey: 'SUBKEY' }), { status: 200 });
    if (path.startsWith('/customers?')) return new Response(JSON.stringify({ data: [] }), { status: 200 });
    if (path === '/customers') return new Response(JSON.stringify({ id: 'cus_1' }), { status: 200 });
    if (path === '/payments') return new Response(JSON.stringify({ id: 'pay_asaas_1', invoiceUrl: 'https://sandbox.asaas.com/i/abc' }), { status: 200 });
    if (path.startsWith('/webhooks')) return new Response(JSON.stringify({ data: [], id: 'wh1' }), { status: 200 });
    return new Response('{}', { status: 404 });
  }) as typeof fetch);
  try {
    const l = byTitle('Sala de advocacia');
    const host = (await repo.getUser(pool, l.hostId))!;
    const hostTok = signToken(host);
    const listed = async () => ((await (await fetch(`${base}/listings`)).json()) as (Listing & { bookable: boolean; payProviders?: string[] })[]).find((x) => x.id === l.id)!;
    assert.equal((await listed()).bookable, false, 'sem carteira: em breve');

    // CPF inválido é recusado; com dados certos a subconta é criada na conta da plataforma
    const form = { taxId: '111.111.111-11', birthDate: '1980-05-10', phone: '(44) 99999-0000', incomeValue: 5000, postalCode: '87013-230', address: 'Av. XV de Novembro', addressNumber: '255', province: 'Centro' };
    const bad = await fetch(`${base}/me/asaas-account`, { method: 'POST', headers: { Authorization: `Bearer ${hostTok}`, 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    assert.equal(bad.status, 422);
    const ok = await fetch(`${base}/me/asaas-account`, { method: 'POST', headers: { Authorization: `Bearer ${hostTok}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, taxId: '529.982.247-25' }) });
    assert.equal(ok.status, 200, await ok.clone().text());
    const acc = calls.find((c) => c.path === '/accounts')!;
    assert.equal(acc.key, 'PLATFORM_KEY');
    assert.equal(acc.body.cpfCnpj, '52998224725');
    const stored = await one<{ api_key_enc: Buffer }>(pool, 'SELECT api_key_enc FROM asaas_accounts WHERE user_id = $1', [host.id]);
    assert.ok(!stored!.api_key_enc.toString('latin1').includes('SUBKEY'), 'chave da subconta cifrada');
    const st = await (await fetch(`${base}/me/payout-account`, { headers: { Authorization: `Bearer ${hostTok}` } })).json() as { anyConnected: boolean; asaas: { connected: boolean } };
    assert.deepEqual([st.anyConnected, st.asaas.connected], [true, true]);
    const now = await listed();
    assert.deepEqual([now.bookable, now.payProviders], [true, ['asaas']]);

    // reserva: sem CPF de quem paga não dá; com CPF vai para a fatura do Asaas com split percentual
    const date = nextDateWith(l, 2);
    const input = { listingId: l.id, occurrences: [{ date, start: '10:00', end: '11:00' }], guests: 1, purpose: 'Reunião', paymentMethod: 'pix', acceptRules: true, provider: 'asaas' };
    await assert.rejects(B.createBooking({ ...guest, documentNumber: undefined }, input), /payer_tax_id_required/);
    const b = await B.createBooking({ ...guest, documentNumber: undefined }, { ...input, payerTaxId: '529.982.247-25' });
    assert.equal(b.status, 'pending_payment');
    const pay = calls.filter((c) => c.path === '/payments').at(-1)!;
    assert.equal(pay.body.billingType, 'PIX');
    assert.equal(pay.body.value, b.price.total);
    const split = (pay.body.split as { walletId: string; percentualValue: number }[])[0];
    assert.equal(split.walletId, '0b6a5e2c-1111-4222-8333-944455556666');
    assert.ok(split.percentualValue > 0 && split.percentualValue < 100);
    assert.equal(calls.find((c) => c.path === '/customers')!.body.cpfCnpj, '52998224725');
    const p = (await repo.getPayment(pool, b.paymentId))!;
    assert.deepEqual([p.provider, p.checkoutUrl], ['asaas', 'https://sandbox.asaas.com/i/abc']);

    // aviso do Asaas: token errado recusado; certo confirma a reserva (uma vez só)
    const hook = (token: string) => fetch(`${base}/webhooks/asaas`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'asaas-access-token': token },
      body: JSON.stringify({ id: 'evt_1', event: 'PAYMENT_RECEIVED', payment: { id: 'pay_asaas_1', status: 'RECEIVED', externalReference: p.id, value: p.amount } }),
    });
    assert.equal((await hook('errado')).status, 400);
    assert.equal((await hook(A.asaasWebhookToken())).status, 200);
    assert.equal((await hook(A.asaasWebhookToken())).status, 200);
    const paid = (await repo.getPayment(pool, b.paymentId))!;
    assert.equal(paid.status, 'captured');
    assert.notEqual((await repo.getBooking(pool, b.id))!.status, 'pending_payment');

    // equipe liga o aviso de pagamentos com um clique
    const setup = await fetch(`${base}/admin/asaas/setup`, { method: 'POST', headers: { Authorization: `Bearer ${signToken(admin)}` } });
    assert.equal(setup.status, 200);
    const wh = calls.find((c) => c.path === '/webhooks' && c.method === 'POST')!;
    assert.equal(wh.body.authToken, A.asaasWebhookToken());
  } finally {
    A.setAsaasHttp();
    for (const k of ['ASAAS_API_KEY', 'ASAAS_ENV']) delete process.env[k];
    process.env.LAUNCH_COUNTRIES = 'all';
  }
});
