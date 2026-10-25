// Testes de ponta a ponta contra PostgreSQL real (banco *_test). Sobe a API numa porta efêmera.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { AddressInfo } from 'node:net';
import sharp from 'sharp';

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://vendeu:vendeu@localhost:5432/vendeu_test';
process.env.NODE_ENV = 'test';
process.env.RATE_LIMIT_DISABLED = 'true';
process.env.OUTROS_GROUP_MIN = '3';
if (!/_test(\?|$)/.test(new URL(process.env.DATABASE_URL).pathname)) throw new Error('Banco de testes precisa terminar em _test');

const { dropAll, migrate, pool, one } = await import('../src/db.js');
const { createApp } = await import('../src/app.js');
const { outbox, smsOutbox } = await import('../src/mailer.js');
const { getLegal } = await import('../src/legal.js');
const { hashPassword } = await import('../src/auth.js');
const { runDaily } = await import('../src/jobs.js');

let base = '';
let server: import('node:http').Server;
before(async () => {
  await dropAll();
  await migrate(false);
  server = createApp().listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => { server.close(); await pool.end(); });

class Client {
  cookie = '';
  constructor(public ip = '203.0.113.10') {}
  async call(method: string, path: string, body?: unknown, extra: Record<string, string> = {}) {
    const isForm = body instanceof FormData;
    const res = await fetch(base + path, {
      method,
      headers: { Origin: 'http://localhost:5173', 'x-real-ip': this.ip, 'User-Agent': 'teste/1.0', 'x-device-id': `dev-${this.ip}-abcdef`, ...(this.cookie ? { Cookie: this.cookie } : {}), ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}), ...extra },
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0];
    const type = res.headers.get('content-type') ?? '';
    const data = type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer());
    return { status: res.status, data: data as any, headers: res.headers };
  }
  get = (p: string) => this.call('GET', p);
  post = (p: string, b?: unknown) => this.call('POST', p, b ?? {});
  put = (p: string, b?: unknown) => this.call('PUT', p, b ?? {});
}

const terms = () => ({ 'termos-de-uso': getLegal('termos-de-uso').version, 'politica-de-privacidade': getLegal('politica-de-privacidade').version });
const address = { cep: '01310-100', street: 'Avenida Paulista', number: '1000', district: 'Bela Vista', city: 'São Paulo', state: 'SP' };
async function photo(seed = crypto.randomBytes(8).toString('hex')) {
  const raw = crypto.createHash('sha512').update(seed).digest();
  const px = Buffer.alloc(300 * 300 * 3);
  for (let i = 0; i < px.length; i++) px[i] = raw[i % raw.length] ^ (i >> 5);
  return sharp(px, { raw: { width: 300, height: 300, channels: 3 } }).jpeg().toBuffer();
}
const form = (name: string, buf: Buffer, fields: Record<string, string> = {}) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  f.append('file', new Blob([new Uint8Array(buf)], { type: 'image/jpeg' }), name);
  return f;
};
const lastCode = (channel: 'email' | 'phone') => {
  const t = channel === 'email' ? outbox.at(-1)!.text : smsOutbox.at(-1)!.text;
  return t.match(/\b(\d{6})\b/)![1];
};

async function registerSeller(c: Client, n: number, name: string, cpf: string) {
  const email = `vendedor${n}@teste.com`;
  const r = await c.post('/api/auth/register', {
    fullName: name, email, password: 'Senha1234', phone: `(11) 98765-43${String(n).padStart(2, '0')}`, accountType: 'anunciante',
    identity: { docType: 'cpf', docNumber: cpf, birthDate: '1985-05-20', address }, accepted: terms(), marketingOptIn: false,
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return { email, id: r.data.id as string };
}
async function verifyContacts(c: Client) {
  // os códigos ficam nas caixas simuladas; o último de cada canal é o do cadastro mais recente
  const email = outbox.findLast((m) => /verificação/i.test(m.subject))!;
  const sms = smsOutbox.at(-1)!;
  assert.equal((await c.post('/api/auth/verify-email', { code: email.text.match(/\b(\d{6})\b/)![1] })).status, 200);
  assert.equal((await c.post('/api/auth/verify-phone', { code: sms.text.match(/\b(\d{6})\b/)![1] })).status, 200);
}
async function makeAdmin() {
  await pool.query("INSERT INTO users (id, role, email, email_verified_at, password_hash, full_name) VALUES ('usr_admin','admin','admin@teste.com',now(),$1,'Admin Teste')", [await hashPassword('AdminSenha123')]);
  const a = new Client('198.51.100.1');
  assert.equal((await a.post('/api/auth/login', { email: 'admin@teste.com', password: 'AdminSenha123' })).status, 200);
  return a;
}
async function verifiedSeller(n: number, name: string, cpf: string, admin: Client, ip: string) {
  const c = new Client(ip);
  const { id } = await registerSeller(c, n, name, cpf);
  await verifyContacts(c);
  for (const kind of ['doc_front', 'doc_back', 'selfie', 'address_proof']) {
    const r = await c.call('POST', '/api/kyc/documents', form(`${kind}.jpg`, await photo(`${kind}${n}`), { kind }));
    assert.equal(r.status, 201, JSON.stringify(r.data));
  }
  assert.equal((await c.post('/api/kyc/submit')).data.status, 'pending');
  assert.equal((await admin.post(`/api/admin/kyc/${id}/decision`, { approve: true })).status, 200);
  return { c, id };
}
const listingBody = (over: Record<string, unknown> = {}) => ({
  operation: 'venda', category: 'moveis', condition: 'usado', title: 'Sofá retrátil 3 lugares cinza', priceCents: 80000,
  description: 'Sofá retrátil em ótimo estado, tecido suede cinza, 3 lugares. Retirada no local, aceito visita.', city: 'São Paulo', state: 'SP', ...over,
});
async function publish(c: Client, body: Record<string, unknown>, name: string, opts: { photos?: Buffer[]; assetRef?: string } = {}) {
  const created = await c.post('/api/listings', body);
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const lid = created.data.id as string;
  for (const p of opts.photos ?? [await photo()]) assert.equal((await c.call('POST', `/api/listings/${lid}/photos`, form('f.jpg', p))).status, 201);
  const pub = await c.post(`/api/listings/${lid}/publish`, { originKind: 'uso_proprio', signerName: name, confirm: true, assetRef: opts.assetRef, accepted: Object.fromEntries(['regras-de-anuncio', 'termo-de-responsabilidade-origem', 'politica-de-taxas'].map((k) => [k, getLegal(k).version])) });
  return { lid, pub };
}

let admin: Client;
let seller: { c: Client; id: string };
let sellerListing = '';

test('cadastro exige termos vigentes, CPF válido e e-mail único', async () => {
  const c = new Client();
  const bad = await c.post('/api/auth/register', { fullName: 'Ana Souza', email: 'ana@teste.com', password: 'Senha1234', phone: '11987654300', accountType: 'comprador', accepted: { 'termos-de-uso': '1999' } });
  assert.equal(bad.status, 422);
  const badCpf = await c.post('/api/auth/register', { fullName: 'Ana Souza', email: 'ana@teste.com', password: 'Senha1234', phone: '11987654300', accountType: 'anunciante', accepted: terms(), identity: { docType: 'cpf', docNumber: '111.111.111-11', birthDate: '1990-01-01', address } });
  assert.equal(badCpf.status, 400);
  const weak = await c.post('/api/auth/register', { fullName: 'Ana Souza', email: 'ana@teste.com', password: 'abc', phone: '11987654300', accountType: 'comprador', accepted: terms() });
  assert.equal(weak.status, 400);
  const ok = await c.post('/api/auth/register', { fullName: 'Ana Souza', email: 'ana@teste.com', password: 'Senha1234', phone: '11987654300', accountType: 'comprador', accepted: terms() });
  assert.equal(ok.status, 201);
  assert.equal((await new Client().post('/api/auth/register', { fullName: 'Outra Ana', email: 'ANA@teste.com', password: 'Senha1234', phone: '11987654301', accountType: 'comprador', accepted: terms() })).status, 409);
  const acc = await pool.query('SELECT count(*)::int AS n FROM term_acceptances WHERE user_id = $1', [ok.data.id]);
  assert.equal(acc.rows[0].n, 2);
  const org = await one(pool, "SELECT * FROM origin_records WHERE user_id = $1 AND event = 'signup'", [ok.data.id]);
  assert.equal(org.ip, '203.0.113.10'); assert.equal(org.email, 'ana@teste.com'); assert.equal(org.phone, '5511987654300');
});

test('CSRF: pedido de origem desconhecida é recusado; login protegido por bloqueio', async () => {
  const c = new Client();
  assert.equal((await c.call('POST', '/api/auth/logout', {}, { Origin: 'https://evil.example' })).status, 403);
  for (let i = 0; i < 5; i++) assert.equal((await c.post('/api/auth/login', { email: 'ana@teste.com', password: 'errada123' })).status, 401);
  assert.equal((await c.post('/api/auth/login', { email: 'ana@teste.com', password: 'Senha1234' })).status, 429);
  await pool.query("UPDATE users SET locked_until = NULL, failed_logins = 0 WHERE email = 'ana@teste.com'");
  assert.equal((await c.post('/api/auth/login', { email: 'ana@teste.com', password: 'Senha1234' })).status, 200);
});

test('verificação de identidade: anunciante sem verificação não publica; com verificação publica', async () => {
  admin = await makeAdmin();
  const c = new Client('198.51.100.20');
  const { id } = await registerSeller(c, 1, 'Carlos Mendes Silva', '529.982.247-25');
  await verifyContacts(c);
  const l = await c.post('/api/listings', listingBody());
  assert.equal(l.status, 201);
  await c.call('POST', `/api/listings/${l.data.id}/photos`, form('a.jpg', await photo('x1')));
  const early = await c.post(`/api/listings/${l.data.id}/publish`, { originKind: 'uso_proprio', signerName: 'Carlos Mendes Silva', confirm: true, accepted: {} });
  assert.equal(early.status, 403);
  assert.equal(early.data.error, 'kyc_required');
  // documentos faltando
  assert.equal((await c.post('/api/kyc/submit')).status, 422);
  // arquivo que não é imagem é recusado
  const evil = await c.call('POST', '/api/kyc/documents', form('x.jpg', Buffer.from('<?php echo 1; ?> não sou imagem aqui dentro'), { kind: 'selfie' }));
  assert.equal(evil.status, 422);
  seller = { c, id };
});

test('documentos de verificação ficam cifrados no banco e só o admin lê', async () => {
  const c = seller.c;
  for (const kind of ['doc_front', 'doc_back', 'selfie', 'address_proof']) {
    const r = await c.call('POST', '/api/kyc/documents', form(`${kind}.jpg`, await photo(`kyc-${kind}`), { kind }));
    assert.equal(r.status, 201, JSON.stringify(r.data));
  }
  const raw = await one(pool, "SELECT data FROM kyc_documents WHERE user_id = $1 LIMIT 1", [seller.id]);
  assert.equal(raw.data.subarray(0, 4).toString(), 'VND1');
  const sub = await c.post('/api/kyc/submit');
  assert.equal(sub.data.status, 'pending');
  const doc = await one(pool, "SELECT id FROM kyc_documents WHERE user_id = $1 AND kind = 'selfie'", [seller.id]);
  assert.equal((await c.get(`/api/admin/kyc/${seller.id}/documents/${doc.id}`)).status, 403);
  const view = await admin.get(`/api/admin/kyc/${seller.id}/documents/${doc.id}`);
  assert.equal(view.status, 200);
  assert.match(view.headers.get('content-security-policy')!, /sandbox/);
  const detail = await admin.get(`/api/admin/kyc/${seller.id}`);
  assert.equal(detail.data.docNumber, '52998224725');
  assert.ok((await one(pool, "SELECT 1 FROM audit_log WHERE action = 'admin.kyc.document'")));
  assert.equal((await admin.post(`/api/admin/kyc/${seller.id}/decision`, { approve: false })).status, 422);
  assert.equal((await admin.post(`/api/admin/kyc/${seller.id}/decision`, { approve: true })).status, 200);
});

test('CPF repetido em outra conta é barrado', async () => {
  const c = new Client('198.51.100.21');
  const r = await c.post('/api/auth/register', { fullName: 'Clone Da Silva', email: 'clone@teste.com', password: 'Senha1234', phone: '11987654377', accountType: 'anunciante', accepted: terms(), identity: { docType: 'cpf', docNumber: '52998224725', birthDate: '1985-05-20', address } });
  assert.equal(r.status, 409);
  assert.equal(r.data.error, 'doc_in_use');
});

test('publicar exige declaração assinada com o nome do cadastro; registra origem, termos e declaração', async () => {
  const c = seller.c;
  const l = await c.post('/api/listings', listingBody());
  sellerListing = l.data.id;
  await c.call('POST', `/api/listings/${sellerListing}/photos`, form('a.jpg', await photo('sofa')));
  const wrongName = await c.post(`/api/listings/${sellerListing}/publish`, { originKind: 'uso_proprio', signerName: 'Outra Pessoa Qualquer', confirm: true, accepted: {} });
  assert.equal(wrongName.data.error, 'signer_name_mismatch');
  const noConfirm = await c.post(`/api/listings/${sellerListing}/publish`, { originKind: 'uso_proprio', signerName: 'Carlos Mendes Silva', confirm: false, accepted: {} });
  assert.equal(noConfirm.status, 400);
  const noTerms = await c.post(`/api/listings/${sellerListing}/publish`, { originKind: 'uso_proprio', signerName: 'carlos mendes silva', confirm: true, accepted: {} });
  assert.equal(noTerms.data.error, 'terms_not_accepted');
  const accepted = Object.fromEntries(['regras-de-anuncio', 'termo-de-responsabilidade-origem', 'politica-de-taxas'].map((k) => [k, getLegal(k).version]));
  const ok = await c.post(`/api/listings/${sellerListing}/publish`, { originKind: 'uso_proprio', signerName: 'Carlos Mendes Silva', confirm: true, accepted });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(ok.data.status, 'active');
  assert.match(ok.data.declaration, /origem do bem/);
  const decl = await one(pool, 'SELECT * FROM listing_declarations WHERE listing_id = $1', [sellerListing]);
  assert.equal(decl.ip, '198.51.100.20'); assert.equal(decl.signer_name, 'Carlos Mendes Silva'); assert.equal(decl.text_hash.length, 64);
  const org = await pool.query("SELECT event, ip, email, phone, device_hash FROM origin_records WHERE listing_id = $1 ORDER BY created_at", [sellerListing]);
  assert.deepEqual(org.rows.map((r) => r.event), ['listing_create', 'listing_publish']);
  assert.equal(org.rows[1].ip, '198.51.100.20'); assert.ok(org.rows[1].email && org.rows[1].phone && org.rows[1].device_hash);
});

test('registro de origem é imutável', async () => {
  await assert.rejects(pool.query("UPDATE origin_records SET ip = '1.1.1.1'"), /imutável/);
  await assert.rejects(pool.query('DELETE FROM origin_records'), /imutável/);
});

test('vitrine: novos e usados nunca se misturam; busca e filtros', async () => {
  const c = seller.c;
  const novo = await publish(c, listingBody({ condition: 'novo', title: 'Mesa de jantar nova 6 cadeiras', priceCents: 120000, description: 'Mesa de jantar nova na caixa, com 6 cadeiras, madeira maciça, nota fiscal.' }), 'Carlos Mendes Silva');
  assert.equal(novo.pub.status, 200);
  const guest = new Client('192.0.2.50');
  const usados = await guest.get('/api/listings?operation=venda&condition=usado');
  const novos = await guest.get('/api/listings?operation=venda&condition=novo');
  assert.deepEqual(usados.data.items.map((i: any) => i.title), ['Sofá retrátil 3 lugares cinza']);
  assert.deepEqual(novos.data.items.map((i: any) => i.title), ['Mesa de jantar nova 6 cadeiras']);
  assert.ok(usados.data.items.every((i: any) => i.condition === 'usado'));
  assert.equal((await guest.get('/api/listings?operation=venda')).status, 400); // condição é obrigatória
  assert.equal((await guest.get('/api/listings?operation=locacao&condition=usado')).data.total, 0);
  assert.equal((await guest.get('/api/listings?operation=venda&condition=usado&q=sofa')).data.total, 1); // sem acento
  assert.equal((await guest.get('/api/listings?operation=venda&condition=usado&q=geladeira')).data.total, 0);
  assert.equal((await guest.get('/api/listings?operation=venda&condition=usado&max=50000')).data.total, 0);
  const detail = await guest.get(`/api/listings/${sellerListing}`);
  assert.equal(detail.data.seller.name, 'Carlos');           // só o primeiro nome
  assert.equal(detail.data.seller.verified, true);
  assert.equal(detail.data.addressPrivate, undefined);
  assert.equal(JSON.stringify(detail.data).includes('52998224725'), false);
  const photoUrl = detail.data.photos[0].url;
  const img = await guest.get(photoUrl);
  assert.equal(img.status, 200); assert.equal(img.headers.get('content-type'), 'image/webp');
  const meta = await sharp(img.data).metadata();
  assert.equal(meta.exif, undefined);                         // sem metadados
});

test('locação: exige período; aparece só na aba de locação', async () => {
  const c = seller.c;
  assert.equal((await c.post('/api/listings', listingBody({ operation: 'locacao', title: 'Apartamento 2 quartos Centro', category: 'imoveis', priceCents: 180000 }))).status, 400);
  const r = await publish(c, listingBody({ operation: 'locacao', rentPeriod: 'mes', category: 'imoveis', title: 'Apartamento 2 quartos Centro', priceCents: 180000, description: 'Apartamento de 2 quartos no centro, 60m², vaga de garagem, condomínio incluso. Contrato de 30 meses.' }), 'Carlos Mendes Silva');
  assert.equal(r.pub.data.error, 'asset_ref_required'); // imóvel exige matrícula
  const ok = await c.post(`/api/listings/${r.lid}/publish`, { originKind: 'uso_proprio', signerName: 'Carlos Mendes Silva', confirm: true, assetRef: 'Matrícula 12345 - 4º RI', accepted: {} });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  const guest = new Client();
  assert.equal((await guest.get('/api/listings?operation=locacao&condition=usado&category=imoveis')).data.total, 1);
  assert.equal((await guest.get('/api/listings?operation=venda&condition=usado&category=imoveis')).data.total, 0);
});

test('conteúdo ilícito é recusado e golpe vai para revisão', async () => {
  const c = seller.c;
  const bad = await publish(c, listingBody({ title: 'Pistola com munição para venda', description: 'Arma de fogo calibre 9mm, nunca usada, com munição inclusa na caixa original.' }), 'Carlos Mendes Silva');
  assert.equal(bad.pub.status, 422);
  assert.equal(bad.pub.data.error, 'listing_blocked');
  const sus = await publish(c, listingBody({ title: 'Geladeira nova promoção', description: 'Geladeira nova, pix antecipado para reservar, me chama no whatsapp 11 98765-4321 ou no www.golpe.com' }), 'Carlos Mendes Silva');
  assert.equal(sus.pub.status, 200);
  assert.equal(sus.pub.data.status, 'pending_review');
  assert.equal((await new Client().get(`/api/listings/${sus.lid}`)).status, 404);   // fora da vitrine
  const queue = await admin.get('/api/admin/listings');
  assert.ok(queue.data.items.some((i: any) => i.id === sus.lid));
  assert.equal((await admin.post(`/api/admin/listings/${sus.lid}/decision`, { approve: false, note: 'Pede pagamento antecipado' })).status, 200);
});

test('foto copiada de outro anunciante gera alerta', async () => {
  const other = await verifiedSeller(2, 'Marina Costa Lima', '390.533.447-05', admin, '198.51.100.30');
  const shared = await photo('mesma-foto');
  const first = await publish(seller.c, listingBody({ title: 'Cadeira gamer reclinável preta', description: 'Cadeira gamer reclinável, encosto de cabeça, apoio de braço 3D. Pouco uso, sem arranhões.' }), 'Carlos Mendes Silva', { photos: [shared] });
  assert.equal(first.pub.data.status, 'active');
  const dup = await publish(other.c, listingBody({ title: 'Cadeira gamer reclinável preta', description: 'Cadeira gamer reclinável, encosto de cabeça, apoio de braço 3D. Pouco uso, sem arranhões.' }), 'Marina Costa Lima', { photos: [shared] });
  assert.equal(dup.pub.data.status, 'pending_review');
  assert.ok(dup.pub.data.riskFlags.includes('foto_repetida'));
});

test('mensagens com alerta anti-golpe e sem exposição de contato', async () => {
  const buyer = new Client('192.0.2.77');
  const reg = await buyer.post('/api/auth/register', { fullName: 'Paulo Comprador', email: 'paulo@teste.com', password: 'Senha1234', phone: '11999990000', accountType: 'comprador', accepted: terms() });
  assert.equal(reg.status, 201);
  assert.equal((await buyer.post(`/api/messages/start/${sellerListing}`, { body: 'Olá' })).status, 403); // e-mail ainda não verificado
  await verifyContacts(buyer);
  const start = await buyer.post(`/api/messages/start/${sellerListing}`, { body: 'Posso fazer um pix antecipado para reservar?' });
  assert.equal(start.status, 201);
  assert.ok(start.data.warnings.length > 0);
  const own = await seller.c.post(`/api/messages/start/${sellerListing}`, { body: 'oi' });
  assert.equal(own.data.error, 'own_listing');
  const thread = await seller.c.get(`/api/messages/${start.data.conversationId}`);
  assert.equal(thread.data.messages.length, 1);
  assert.ok(thread.data.messages[0].warning);
  assert.equal((await new Client().get(`/api/messages/${start.data.conversationId}`)).status, 401);
  assert.equal((await buyer.post(`/api/messages/${start.data.conversationId}`, { body: 'Ainda disponível? Posso ver amanhã.' })).status, 201);
  (globalThis as any).buyerCtx = { buyer, buyerId: reg.data.id, conv: start.data.conversationId };
});

test('checkout: vendeu → anúncio sai do ar → paga a taxa pela tabela → vendido; retirar sem vender é grátis', async () => {
  const { buyer, buyerId } = (globalThis as any).buyerCtx;
  const c = seller.c;
  // sub-declaração sem justificativa
  const low = await c.post(`/api/listings/${sellerListing}/close`, { sold: true, declaredPriceCents: 10000 });
  assert.equal(low.data.error, 'under_declared_needs_note');
  const close = await c.post(`/api/listings/${sellerListing}/close`, { sold: true, declaredPriceCents: 75000, buyerId });
  assert.equal(close.status, 201, JSON.stringify(close.data));
  assert.equal(close.data.feeCents, 3000);            // R$ 750 → faixa 501–1000 = R$ 30
  assert.equal(close.data.flagged, false);
  assert.equal((await new Client().get(`/api/listings/${sellerListing}`)).status, 404); // já saiu da vitrine
  assert.equal((await c.post(`/api/listings/${sellerListing}/close`, { sold: true, declaredPriceCents: 75000 })).status, 409); // sem cobrança em duplicidade
  const pay = await c.post(`/api/sales/${close.data.saleId}/pay`, { method: 'pix' });
  assert.equal(pay.status, 200);
  assert.ok(pay.data.pix.copyPaste);
  assert.equal(pay.data.status, 'awaiting_payment');
  const me = await c.get('/api/me');
  assert.equal(me.data.feesDueCents, 3000);
  // comprador confirma
  assert.equal((await buyer.post(`/api/purchases/${close.data.saleId}/confirm`, { confirm: true })).status, 200);
  const stranger = new Client('192.0.2.99');
  assert.equal((await stranger.post(`/api/sales/${close.data.saleId}/simulate-payment`)).status, 401);
  const paid = await c.post(`/api/sales/${close.data.saleId}/simulate-payment`);
  assert.equal(paid.data.status, 'paid');
  assert.ok(paid.data.receiptNumber >= 1000);
  const l = await one(pool, 'SELECT status FROM listings WHERE id = $1', [sellerListing]);
  assert.equal(l.status, 'sold');
  assert.equal((await c.post(`/api/sales/${close.data.saleId}/simulate-payment`)).status, 200); // idempotente
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM payments WHERE status = 'approved'")).rows[0].n, 1);

  // retirar sem vender não cobra nada
  const free = await publish(c, listingBody({ title: 'Estante de livros usada 5 prateleiras', priceCents: 15000, description: 'Estante de madeira com 5 prateleiras, pequenos riscos. Retirar no local sem frete.' }), 'Carlos Mendes Silva');
  const removed = await c.post(`/api/listings/${free.lid}/close`, { sold: false, reason: 'desisti' });
  assert.equal(removed.data.feeCents, 0);
  assert.equal((await one(pool, "SELECT count(*)::int AS n FROM sales WHERE listing_id = $1", [free.lid])).n, 0);
});

test('sub-declaração exige justificativa e vai para análise; comprador pode contestar', async () => {
  const c = seller.c;
  const l = await publish(c, listingBody({ title: 'Guarda-roupa casal 6 portas', priceCents: 100000, description: 'Guarda-roupa de casal com 6 portas e espelho, ótimo estado de conservação, desmontado.' }), 'Carlos Mendes Silva');
  const close = await c.post(`/api/listings/${l.lid}/close`, { sold: true, declaredPriceCents: 40000, note: 'Vendi com defeito na porta, desconto grande' });
  assert.equal(close.status, 201); assert.equal(close.data.flagged, true);
  assert.equal(close.data.feeCents, 2000);
  const flagged = await admin.get('/api/admin/sales?flagged=true');
  assert.ok(flagged.data.items.some((s: any) => s.id === close.data.saleId));
  assert.equal((await admin.post(`/api/admin/sales/${close.data.saleId}/waive`, { reason: 'x' })).status, 400);
  // desistência devolve o anúncio, mas é limitada
  assert.equal((await c.post(`/api/sales/${close.data.saleId}/cancel`)).status, 200);
  assert.equal((await one(pool, 'SELECT status FROM listings WHERE id = $1', [l.lid])).status, 'active');
});

test('taxa vencida trava novos anúncios; pagar libera', async () => {
  const c = seller.c;
  const l = await publish(c, listingBody({ title: 'Mesa de escritório pequena', priceCents: 20000, description: 'Mesa de escritório pequena, com gaveta, madeira clara. Pouco uso, retirar no local.' }), 'Carlos Mendes Silva');
  const close = await c.post(`/api/listings/${l.lid}/close`, { sold: true, declaredPriceCents: 20000 });
  assert.equal(close.data.feeCents, 2000);
  await pool.query("UPDATE sales SET due_at = now() - interval '10 days' WHERE id = $1", [close.data.saleId]);
  const job = await runDaily();
  assert.equal(job.newlyBlocked, 1);
  const created = await c.post('/api/listings', listingBody({ title: 'Outro anúncio qualquer aqui' }));
  assert.equal(created.status, 402);
  assert.equal(created.data.error, 'fee_overdue');
  await c.post(`/api/sales/${close.data.saleId}/pay`, { method: 'cartao' });
  await c.post(`/api/sales/${close.data.saleId}/simulate-payment`);
  assert.equal((await c.post('/api/listings', listingBody({ title: 'Anúncio depois de pagar' }))).status, 201);
});

test('taxa acima de R$ 3.000 sobe R$ 50 a cada R$ 1.000', async () => {
  const c = seller.c;
  const l = await publish(c, listingBody({ category: 'automoveis', condition: 'usado', title: 'Fiat Uno 2012 completo', priceCents: 2_850_000, description: 'Fiat Uno 2012, 4 portas, ar condicionado, direção hidráulica, documentação em dia, único dono.' }), 'Carlos Mendes Silva', { assetRef: 'ABC1D23' });
  assert.equal(l.pub.status, 200, JSON.stringify(l.pub.data));
  const close = await c.post(`/api/listings/${l.lid}/close`, { sold: true, declaredPriceCents: 3_550_000 });
  assert.equal(close.data.feeCents, 100_00 + 50_00 * 33); // R$ 35.500 → 100 + 33 × 50 = R$ 1.750
});

test('Outros: termos recorrentes viram grupo automaticamente', async () => {
  const c = seller.c;
  for (let i = 0; i < 3; i++) {
    const r = await publish(c, listingBody({ category: 'outros', condition: 'usado', title: `Bicicleta aro ${26 + i} usada`, priceCents: 40000 + i, description: 'Bicicleta em bom estado de uso, freios revisados, pneus novos. Retirar no local.' }), 'Carlos Mendes Silva');
    assert.equal(r.pub.status, 200);
  }
  const guest = new Client();
  const groups = await guest.get('/api/outros/groups?condition=usado');
  assert.deepEqual(groups.data.groups.map((g: any) => g.token), ['bicicleta']);
  assert.equal((await guest.get('/api/listings?operation=venda&condition=usado&category=outros&group=bicicleta')).data.total, 3);
  assert.equal((await guest.get('/api/outros/groups?condition=novo')).data.groups.length, 0); // novos e usados separados também nos grupos
  const stats = await guest.get('/api/outros/stats');
  assert.equal(stats.data.terms[0].term, 'bicicleta'); assert.equal(stats.data.terms[0].isGroup, true);
  assert.equal((await admin.post('/api/admin/outros/groups/bicicleta', { status: 'hidden' })).status, 200);
  assert.equal((await guest.get('/api/outros/groups?condition=usado')).data.groups.length, 0);
});

test('denúncias: 3 denúncias tiram o anúncio do ar; moderação decide', async () => {
  const l = await publish(seller.c, listingBody({ title: 'Tapete sala grande 2x3m', priceCents: 30000, description: 'Tapete grande para sala 2x3 metros, cor bege, muito bonito e conservado. Retirar.' }), 'Carlos Mendes Silva');
  for (let i = 0; i < 3; i++) assert.equal((await new Client(`192.0.2.${150 + i}`).post('/api/reports', { listingId: l.lid, reason: 'golpe', details: 'suspeito' })).status, 201);
  assert.equal((await one(pool, 'SELECT status FROM listings WHERE id = $1', [l.lid])).status, 'pending_review');
  const rep = await admin.get('/api/admin/reports');
  assert.equal(rep.data.items.length, 3);
  assert.equal((await admin.post(`/api/admin/reports/${rep.data.items[0].id}/decision`, { uphold: true, note: 'Confirmado golpe' })).status, 200);
  assert.equal((await one(pool, 'SELECT status FROM listings WHERE id = $1', [l.lid])).status, 'removed');
});

test('admin: consulta de origem por IP/e-mail e áreas restritas', async () => {
  const q = await admin.get('/api/admin/origin?ip=198.51.100.20');
  assert.ok(q.data.items.length >= 3);
  assert.equal((await admin.get('/api/admin/origin')).status, 422);
  assert.equal((await seller.c.get('/api/admin/dashboard')).status, 403);
  assert.equal((await new Client().get('/api/admin/dashboard')).status, 401);
  const dash = await admin.get('/api/admin/dashboard');
  assert.ok(dash.data.feesPaidCents > 0);
});

test('LGPD: exportar dados, pedidos do titular e eliminar a conta (com taxa pendente não elimina)', async () => {
  const { buyer } = (globalThis as any).buyerCtx;
  const exp = await buyer.get('/api/me/lgpd/export');
  assert.equal(exp.status, 200);
  assert.equal(exp.data.conta.email, 'paulo@teste.com');
  assert.equal(exp.data.conta.password_hash, undefined);
  assert.ok(exp.data.aceitesDeTermos.length === 2 && exp.data.registrosDeOrigem.length >= 1 && exp.data.mensagens.length >= 1);
  assert.equal((await buyer.post('/api/me/lgpd/requests', { kind: 'info', details: 'com quem compartilham?' })).status, 201);
  assert.equal((await buyer.post('/api/me/lgpd/delete-account', { password: 'errada', confirm: 'ELIMINAR' })).status, 401);
  assert.equal((await buyer.post('/api/me/lgpd/delete-account', { password: 'Senha1234', confirm: 'ELIMINAR' })).status, 200);
  const u = await one(pool, "SELECT * FROM users WHERE email LIKE 'excluido+%' LIMIT 1");
  assert.equal(u.full_name, 'Conta eliminada'); assert.equal(u.phone, null); assert.ok(u.anonymized_at);
  assert.equal((await buyer.get('/api/me')).status, 401);
  assert.ok((await one(pool, 'SELECT count(*)::int AS n FROM origin_records WHERE user_id = $1', [u.id])).n >= 1); // retenção legal
  // vendedor com taxa em aberto
  const l = await publish(seller.c, listingBody({ title: 'Banqueta alta de madeira', priceCents: 9000, description: 'Banqueta alta de madeira maciça, 70 cm, ótimo estado. Retirar no local sem frete.' }), 'Carlos Mendes Silva');
  await seller.c.post(`/api/listings/${l.lid}/close`, { sold: true, declaredPriceCents: 9000 });
  const del = await seller.c.post('/api/me/lgpd/delete-account', { password: 'Senha1234', confirm: 'ELIMINAR' });
  assert.equal(del.status, 409); assert.equal(del.data.error, 'pending_fees');
});

test('API pública: tabela de taxas e calculadora; documentos legais versionados', async () => {
  const g = new Client();
  const calc = await g.get('/api/fees/calc?priceCents=150000');
  assert.equal(calc.data.feeCents, 5000);
  assert.equal(calc.data.youReceiveCents, 145000);
  assert.equal((await g.get('/api/fees')).data.table.length, 7);
  const legal = await g.get('/api/legal');
  assert.equal(legal.data.documents.length, 7);
  assert.match((await g.get('/api/legal/termos-de-uso')).data.markdown, /Vendeu/);
  assert.equal((await g.get('/api/legal/inexistente')).status, 404);
  assert.equal((await g.get('/api/cron/daily')).status, 401);
});

test('login: e-mail inexistente igual a senha errada; redefinir senha derruba sessões antigas', async () => {
  const c = new Client();
  assert.equal((await c.post('/api/auth/login', { email: 'ninguem@teste.com', password: 'Senha1234' })).status, 401);
  const u = new Client('192.0.2.200');
  assert.equal((await u.post('/api/auth/login', { email: 'ana@teste.com', password: 'Senha1234' })).status, 200);
  assert.equal((await u.get('/api/me')).status, 200);
  const before = outbox.length;
  assert.equal((await c.post('/api/auth/forgot', { email: 'ninguem@teste.com' })).status, 200); // não revela se existe
  assert.equal(outbox.length, before);
  assert.equal((await c.post('/api/auth/forgot', { email: 'ana@teste.com' })).status, 200);
  const code = lastCode('email');
  assert.equal((await c.post('/api/auth/reset', { email: 'ana@teste.com', code: '000000', password: 'NovaSenha123' })).status, 400);
  assert.equal((await c.post('/api/auth/reset', { email: 'ana@teste.com', code, password: 'NovaSenha123' })).status, 200);
  assert.equal((await u.get('/api/me')).status, 401);   // sessão anterior caiu
  assert.equal((await c.post('/api/auth/login', { email: 'ana@teste.com', password: 'NovaSenha123' })).status, 200);
});

test('webhook do Mercado Pago: confirma consultando o provedor e confere o valor', async () => {
  const { config } = await import('../src/config.js');
  const l = await publish(seller.c, listingBody({ title: 'Poltrona de leitura estofada', priceCents: 45000, description: 'Poltrona de leitura estofada em linho, muito confortável, sem manchas. Retirada no local.' }), 'Carlos Mendes Silva');
  const close = await seller.c.post(`/api/listings/${l.lid}/close`, { sold: true, declaredPriceCents: 45000 });
  assert.equal(close.data.feeCents, 2000);
  const realFetch = globalThis.fetch;
  let amount = 1000; // primeiro: valor menor que a taxa
  config.payments.provider = 'mercadopago'; config.payments.mpToken = 'tok';
  globalThis.fetch = (async (url: any, init?: any) => String(url).startsWith('https://api.mercadopago.com/v1/payments/')
    ? new Response(JSON.stringify({ status: 'approved', external_reference: close.data.saleId, transaction_amount: amount / 100 }), { status: 200, headers: { 'content-type': 'application/json' } })
    : realFetch(url, init)) as typeof fetch;
  try {
    const hook = new Client('34.0.0.1');
    const bad = await hook.call('POST', '/api/webhooks/mercadopago?type=payment&data.id=999', {}, { Origin: '' });
    assert.equal(bad.status, 422);
    assert.equal((await one(pool, 'SELECT status FROM sales WHERE id = $1', [close.data.saleId])).status, 'awaiting_payment');
    amount = 2000;
    assert.equal((await hook.call('POST', '/api/webhooks/mercadopago?type=payment&data.id=999', {}, { Origin: '' })).status, 200);
    assert.equal((await one(pool, 'SELECT status FROM sales WHERE id = $1', [close.data.saleId])).status, 'paid');
    assert.equal((await hook.call('POST', '/api/webhooks/mercadopago?type=payment&data.id=999', {}, { Origin: '' })).status, 200); // repetido: sem efeito
    assert.equal((await one(pool, "SELECT count(*)::int AS n FROM payments WHERE sale_id = $1 AND status = 'approved'", [close.data.saleId])).n, 1);
  } finally {
    globalThis.fetch = realFetch; config.payments.provider = 'mock'; config.payments.mpToken = '';
  }
});

test('limite de tentativas funciona (ligado) e vitrine informa vendedor verificado', async () => {
  const { hit } = await import('../src/ratelimit.js');
  process.env.RATE_LIMIT_DISABLED = 'false';
  try {
    for (let i = 0; i < 3; i++) await hit('teste-limite', 3, 60);
    await assert.rejects(hit('teste-limite', 3, 60), /too_many_requests/);
  } finally { process.env.RATE_LIMIT_DISABLED = 'true'; }
  const items = (await new Client().get('/api/listings?operation=venda&condition=novo')).data.items;
  assert.ok(items.length && items.every((i: any) => i.sellerVerified === true));
});
