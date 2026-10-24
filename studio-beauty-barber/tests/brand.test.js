// Identidade visual e contato do salão: tipo de espaço, cores, validação e página pública.
process.env.NODE_ENV = 'test';
process.env.LOG_REQUESTS = 'false';
process.env.TRUST_PROXY = 'false';

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const { initDb, db } = await import('../server/db.js');
const { createApp } = await import('../server/index.js');
const { ensureHq, seedPilot } = await import('../server/seed.js');
const sec = await import('../server/security.js');
const { defaultsFor, mergeProfile } = await import('../server/brand.js');

const PW = 'Piloto-Forte-2026';
const SLUG = 'studio-beauty-barber-piloto';
let server, base, cookie;

async function call(method, path, body) {
  const h = {};
  if (cookie && !path.startsWith('/api/public')) h.cookie = cookie;
  if (method !== 'GET') h['x-requested-with'] = 'sbb';
  if (body !== undefined) h['content-type'] = 'application/json';
  const r = await fetch(base + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let data = t; try { data = JSON.parse(t); } catch { /* texto */ }
  return { status: r.status, data };
}

before(async () => {
  await (await import('./_db.js')).openTestDb(initDb);
  await ensureHq();
  await seedPilot({ ownerPassword: PW });
  server = createApp({ awaitWebhooks: true });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  const l = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'sbb' }, body: JSON.stringify({ email: 'piloto@studiobeautybarber.com', password: PW }) });
  cookie = l.headers.getSetCookie()[0].split(';')[0];
});
after(async () => { server.close(); await db.close(); });
beforeEach(() => sec.resetRateLimits());

test('cores padrão: barbearia preto e ouro, feminino rosa claro', () => {
  assert.equal(defaultsFor('masc').menu, '#14110f');
  assert.match(defaultsFor('masc').accent, /^#c9a66b$/);
  assert.equal(defaultsFor('fem').menu, '#f8dbe4');
});

test('trocar o tipo volta às cores do tipo; cores personalizadas são mantidas', async () => {
  let r = await call('PATCH', '/api/settings', { brand: { mode: 'fem' } });
  assert.equal(r.status, 200);
  let s = (await call('GET', '/api/settings')).data.salon.brand;
  assert.equal(s.mode, 'fem'); assert.equal(s.colors.menu, '#f8dbe4'); assert.equal(s.custom_colors, false);
  r = await call('PATCH', '/api/settings', { brand: { colors: { accent: '#AA3366' } } });
  s = (await call('GET', '/api/settings')).data.salon.brand;
  assert.equal(s.colors.accent, '#aa3366'); assert.equal(s.colors.bg, '#fdf3f6'); assert.equal(s.custom_colors, true);
});

test('validação: cor, tipo, WhatsApp, redes e site', async () => {
  assert.equal((await call('PATCH', '/api/settings', { brand: { colors: { accent: 'vermelho' } } })).status, 422);
  assert.equal((await call('PATCH', '/api/settings', { brand: { colors: { bg: 'url(javascript:alert(1))' } } })).status, 422);
  assert.equal((await call('PATCH', '/api/settings', { brand: { mode: 'hacker' } })).status, 422);
  assert.equal((await call('PATCH', '/api/settings', { brand: { whatsapp: '123' } })).status, 422);
  assert.equal((await call('PATCH', '/api/settings', { brand: { instagram: 'a b"><script>' } })).status, 422);
  assert.equal((await call('PATCH', '/api/settings', { brand: { website: 'javascript:alert(1)' } })).status, 422);
  const ok = await call('PATCH', '/api/settings', { brand: { whatsapp: '(44) 99123-4567', instagram: 'https://instagram.com/meusalao/', facebook: '@meusalao', website: 'meusalao.com.br', tagline: 'Estilo com hora marcada', about: 'Texto' } });
  assert.equal(ok.status, 200);
  const b = (await call('GET', '/api/settings')).data.salon.brand;
  assert.equal(b.whatsapp, '5544991234567'); assert.equal(b.instagram, 'meusalao'); assert.equal(b.facebook, 'meusalao'); assert.equal(b.website, 'https://meusalao.com.br/');
});

test('página pública mostra identidade e contato; /me leva o tema para o painel', async () => {
  const pub = (await call('GET', `/api/public/salons/${SLUG}`)).data.salon;
  assert.equal(pub.brand.mode, 'fem'); assert.equal(pub.brand.contact.whatsapp, '5544991234567'); assert.equal(pub.brand.tagline, 'Estilo com hora marcada');
  assert.ok(pub.brand.contact.address);
  const me = (await call('GET', '/api/auth/me')).data.salon;
  assert.equal(me.brand.mode, 'fem'); assert.match(me.brand.colors.accent, /^#[0-9a-f]{6}$/);
});

test('serviços sugeridos: cadastra só os que faltam, ligados à equipe', async () => {
  const before = (await call('GET', '/api/services')).data.services.length;
  const r = await call('POST', '/api/settings/starter-services', { mode: 'masc' });
  assert.equal(r.status, 200);
  const mid = (await call('GET', '/api/services')).data.services.length;
  assert.equal(mid, before + r.data.added);
  const again = await call('POST', '/api/settings/starter-services', { mode: 'masc' });
  assert.equal(again.data.added, 0);
  assert.equal((await call('POST', '/api/settings/starter-services', { mode: 'x' })).status, 422);
  const svc = (await db.get("SELECT id FROM services WHERE name = 'Pigmentação e camuflagem'"));
  if (svc) assert.ok((await db.get('SELECT COUNT(*) AS n FROM staff_services WHERE service_id = ?', [svc.id])).n > 0);
});

test('mergeProfile ignora nada perigoso: cores só em #rrggbb', () => {
  assert.throws(() => mergeProfile({ brand_json: '{}' }, { colors: { menu: '#12345' } }));
  assert.equal(mergeProfile({ brand_json: '{}' }, { colors: { menu: '#ABCDEF' } }).colors.menu, '#abcdef');
});
