// Indicador de profissionais: o cliente informa nome, WhatsApp e o serviço que procura, escolhe UMA cidade e só então vê
// os profissionais dela. O contato com o profissional acontece só pelo sistema (mensagem automática); nenhum telefone,
// e-mail ou endereço do profissional é devolvido por esta API.
import { db } from '../db.js';
import { cfg } from '../config.js';
import { HttpError, validate, nowIso, json, uid, normalizePhone } from '../util.js';
import { rateLimit, verifyTurnstile, newToken, sha256 } from '../security.js';
import { upsertLead } from '../domain.js';
import { sendPlatformEmail } from '../integrations/channels.js';
import { sendOut } from '../messaging.js';

const REQUEST_TTL_MS = 24 * 3600_000;
const MAX_CONTACTS = 3;
const MAX_PROS = 20;

export const SERVICE_CHOICES = ['Corte', 'Barba', 'Coloração', 'Hidratação e escova', 'Manicure e pedicure', 'Sobrancelha', 'Maquiagem', 'Outro'];

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
// "Maringá - PR", "Maringá/PR", "Maringá, PR" → "maringa"
const cityKey = (c) => norm(String(c ?? '').split(/\s*[-/,]\s*/)[0]);
const stems = (q) => norm(q).split(' ').filter((w) => w.length >= 4).map((w) => w.slice(0, 5));

async function optedInSalons() {
  const rows = await db.all(
    `SELECT id, name, city, email, phone, brand_json FROM salons
     WHERE city IS NOT NULL AND city <> '' AND brand_json LIKE '%"finder"%' AND status NOT IN ('suspended', 'cancelled', 'trial_expired')`);
  return rows.filter((s) => json(s.brand_json, {}).finder?.enabled === true && cityKey(s.city));
}

// Serviços do salão que combinam com o que o cliente procura (só nomes e preços públicos).
async function matchingServices(salonId, query) {
  const st = stems(query);
  if (!st.length) return [];
  const svcs = await db.all('SELECT name, category, price_cents FROM services WHERE salon_id = ? AND active = 1 ORDER BY name', [salonId]);
  return svcs.filter((x) => { const t = norm(`${x.name} ${x.category ?? ''}`); return st.some((k) => t.includes(k)); });
}

async function loadRequest(id, token) {
  const q = await db.get('SELECT * FROM finder_requests WHERE id = ?', [String(id ?? '')]);
  if (!q || q.token_hash !== sha256(String(token ?? ''))) throw new HttpError(404, 'Busca não encontrada. Comece de novo.');
  if (Date.now() - Date.parse(q.created_at) > REQUEST_TTL_MS) throw new HttpError(410, 'Esta busca expirou. Faça uma nova.');
  return q;
}

// Identificador opaco do profissional dentro de UMA busca (não é o id do salão nem o endereço da página dele).
const refFor = (q, salonId) => sha256(`${q.token_hash}:${salonId}`).slice(0, 20);

export default function register(r) {
  r.get('/api/public/finder/services', async () => ({ services: SERVICE_CHOICES }));

  // 1) Cadastro da busca → devolve só as CIDADES que têm profissionais para o serviço (sem nomes).
  r.post('/api/public/finder/search', async (ctx) => {
    rateLimit(`finder:${ctx.ip}`, 8, 3600_000);
    if (ctx.body?.website) return { ok: true, cities: [] }; // honeypot
    if (!(await verifyTurnstile(ctx.body?.turnstile, ctx.ip))) throw new HttpError(400, 'Falha na verificação anti-robô. Tente novamente.');
    const d = validate(ctx.body, { name: 'str:2:80', phone: 'phone', service: 'str:2:60', consent: 'bool' });
    if (!d.consent) throw new HttpError(422, 'Precisamos da sua autorização para usar seus dados e conectar você aos profissionais (LGPD).');
    rateLimit(`finder-phone:${d.phone}`, 5, 24 * 3600_000);
    const salons = await optedInSalons();
    const byCity = new Map();
    for (const s of salons) {
      if (!(await matchingServices(s.id, d.service)).length) continue;
      const k = cityKey(s.city);
      const e = byCity.get(k) || { key: k, label: String(s.city).split(/\s*[-/,]\s*/)[0].trim(), count: 0 };
      e.count += 1; byCity.set(k, e);
    }
    const token = newToken(24), id = uid();
    await db.run('INSERT INTO finder_requests (id, token_hash, name, phone, service, consent_at, ip, created_at) VALUES (?,?,?,?,?,?,?,?)',
      [id, sha256(token), d.name, normalizePhone(d.phone), d.service, nowIso(), ctx.ip ?? null, nowIso()]);
    return { ok: true, request_id: id, token, cities: [...byCity.values()].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')) };
  });

  // 2) O cliente clica numa cidade → só ela é aberta (uma por busca).
  r.post('/api/public/finder/open', async (ctx) => {
    rateLimit(`finder-open:${ctx.ip}`, 30, 3600_000);
    const q = await loadRequest(ctx.body?.request_id, ctx.body?.token);
    const key = norm(ctx.body?.city);
    if (!key) throw new HttpError(422, 'Escolha uma cidade.');
    if (q.city_key && q.city_key !== key) throw new HttpError(403, 'Você já abriu uma cidade nesta busca. Para ver outra, faça uma nova busca.');
    const salons = (await optedInSalons()).filter((s) => cityKey(s.city) === key).slice(0, MAX_PROS * 3);
    const pros = [];
    for (const s of salons) {
      const services = await matchingServices(s.id, q.service);
      if (!services.length) continue;
      pros.push({ ref: refFor(q, s.id), name: s.name, city: String(s.city).split(/\s*[-/,]\s*/)[0].trim(), services: services.slice(0, 6).map((x) => ({ name: x.name, price_cents: x.price_cents })) });
      if (pros.length >= MAX_PROS) break;
    }
    if (!q.city_key) await db.run('UPDATE finder_requests SET city_key = ?, city_label = ? WHERE id = ? AND city_key IS NULL', [key, pros[0]?.city ?? String(ctx.body.city).slice(0, 60), q.id]);
    const sent = await db.all('SELECT salon_id FROM finder_contacts WHERE request_id = ?', [q.id]);
    const sentRefs = new Set(sent.map((x) => refFor(q, x.salon_id)));
    return { ok: true, pros: pros.map((p) => ({ ...p, contacted: sentRefs.has(p.ref) })), remaining: MAX_CONTACTS - sent.length };
  });

  // 3) Pedido de contato: o sistema avisa o profissional. Nada do profissional volta para o cliente.
  r.post('/api/public/finder/contact', async (ctx) => {
    rateLimit(`finder-contact:${ctx.ip}`, 10, 3600_000);
    const q = await loadRequest(ctx.body?.request_id, ctx.body?.token);
    if (!q.city_key) throw new HttpError(422, 'Escolha uma cidade primeiro.');
    const salon = (await optedInSalons()).find((s) => cityKey(s.city) === q.city_key && refFor(q, s.id) === String(ctx.body?.ref ?? ''));
    if (!salon) throw new HttpError(404, 'Profissional não encontrado.');
    const done = await db.all('SELECT salon_id FROM finder_contacts WHERE request_id = ?', [q.id]);
    if (done.some((x) => x.salon_id === salon.id)) return { ok: true, already: true };
    if (done.length >= MAX_CONTACTS) throw new HttpError(429, `Você já pediu contato com ${MAX_CONTACTS} profissionais nesta busca.`);

    const { lead } = await upsertLead(salon.id, {
      name: q.name, phone: q.phone, city: q.city_label, source: 'indicador', consent: true, consentIp: q.ip,
      notes: `Procura: ${q.service} em ${q.city_label}. Pediu contato pelo indicador de profissionais.`,
    });
    const claim = await db.run('INSERT INTO finder_contacts (id, request_id, salon_id, lead_id, notified, created_at) VALUES (?,?,?,?,?,?) ON CONFLICT (request_id, salon_id) DO NOTHING',
      [uid(), q.id, salon.id, lead.id, '', nowIso()]);
    if (!claim.changes) return { ok: true, already: true };

    // Aviso automático ao profissional: o contato do cliente fica no painel (Leads), não no corpo da mensagem.
    const first = q.name.split(' ')[0];
    const text = `Novo cliente procurando ${q.service} em ${q.city_label}: ${first}. Ele pediu contato pelo indicador de profissionais do Studio Beauty Barber.\nVeja o contato e responda pelo painel, em Leads: ${cfg.appUrl}/#/leads`;
    const channels = [];
    if (salon.email) {
      try { const x = await sendPlatformEmail(salon.email, 'Novo cliente pediu contato com você', text); channels.push(`email:${x.status}`); } catch (e) { channels.push('email:failed'); }
    }
    if (salon.phone) {
      for (const ch of ['whatsapp', 'sms']) {
        try { const x = await sendOut(salon, { channel: ch, to: salon.phone, body: text, kind: 'transactional', sender: 'system' }); channels.push(`${ch}:${x.status}`); } catch { channels.push(`${ch}:failed`); }
      }
    }
    await db.run('UPDATE finder_contacts SET notified = ? WHERE request_id = ? AND salon_id = ?', [channels.join(','), q.id, salon.id]);

    // Confirmação ao cliente, sem nenhum dado de contato do profissional.
    try {
      const hq = await db.get('SELECT * FROM salons WHERE slug = ?', [cfg.hqSlug]);
      if (hq) await sendOut(hq, { channel: 'whatsapp', to: q.phone, body: `Olá, ${first}! Avisamos o profissional que você escolheu. Ele vai falar com você pelo sistema do Studio Beauty Barber.`, kind: 'transactional', sender: 'system', templateVars: [first] });
    } catch { /* confirmação é opcional */ }
    return { ok: true, remaining: MAX_CONTACTS - done.length - 1 };
  });
}
