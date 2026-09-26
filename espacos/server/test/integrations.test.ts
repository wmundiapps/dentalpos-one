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
  assert.deepEqual(Object.keys(await r.json()).sort(), ['bookings', 'documents', 'email', 'mp_tokens', 'verifications']);
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
    // sem conta conectada: anúncio some da busca e não aceita reserva
    const before = await (await fetch(`${base}/listings`)).json() as Listing[];
    assert.ok(!before.some((x) => x.hostId === host.id));
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

test('ADMIN_EMAILS promove a conta a administrador no próximo acesso', async () => {
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
