// Salão piloto completo (dados fictícios) + salão "HQ" da plataforma (funil comercial da própria Studio Beauty Barber).
// Uso: npm run seed   (variáveis: PILOT_OWNER_EMAIL, PILOT_OWNER_PASSWORD, HQ_OWNER_EMAIL, HQ_OWNER_PASSWORD)
import { pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import { db, initDb } from './db.js';
import { cfg } from './config.js';
import { uid, nowIso, zonedToUtc, addDays, localDate, localWeekday } from './util.js';
import { hashPassword } from './security.js';
import { DEFAULT_HOURS } from './availability.js';
import { settleSale } from './domain.js';
import { handleInbound } from './bot.js';

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export async function ensureHq() {
  const hq = await db.get('SELECT id FROM salons WHERE slug = ?', [cfg.hqSlug]);
  if (hq) return hq.id;
  const id = uid();
  await db.run(
    `INSERT INTO salons (id, slug, name, email, city, hours_json, brand_json, plan, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [id, cfg.hqSlug, 'Studio Beauty Barber (comercial)', 'contato@studiobeautybarber.com', 'Maringá - PR', JSON.stringify(DEFAULT_HOURS), JSON.stringify({ automations: { reminders: true } }), 'rede', 'active', nowIso()]);
  return id;
}

async function createUser(salonId, { name, email, role, password }) {
  const exists = await db.get('SELECT id FROM users WHERE email = ?', [email]);
  if (exists) return { id: exists.id, created: false };
  const pw = password || randomBytes(9).toString('base64url') + '7a';
  const id = uid();
  await db.run('INSERT INTO users (id, salon_id, name, email, password_hash, role, created_at) VALUES (?,?,?,?,?,?,?)',
    [id, salonId, name, email.toLowerCase(), await hashPassword(pw), role, nowIso()]);
  return { id, created: true, password: pw };
}

const FIRST = ['Ana', 'Bruno', 'Carla', 'Daniel', 'Eduarda', 'Felipe', 'Gabriela', 'Henrique', 'Isabela', 'João', 'Karina', 'Lucas', 'Mariana', 'Nicolas', 'Olívia', 'Pedro', 'Quésia', 'Rafaela', 'Samuel', 'Tatiane', 'Ulisses', 'Vitória', 'Wesley', 'Yasmin', 'Zeca', 'Amanda', 'Bernardo', 'Camila', 'Diego', 'Elisa'];
const LAST = ['Almeida', 'Barbosa', 'Cardoso', 'Dias', 'Esteves', 'Ferreira', 'Gomes', 'Henriques', 'Ibrahim', 'Junqueira', 'Lima', 'Machado', 'Nogueira', 'Oliveira', 'Pereira', 'Queiroz', 'Ramos', 'Santos', 'Teixeira', 'Vieira'];

export async function seedPilot({ ownerEmail = 'piloto@studiobeautybarber.com', ownerPassword } = {}) {
  const existing = await db.get('SELECT id FROM salons WHERE slug = ?', ['studio-beauty-barber-piloto']);
  if (existing) return { salonId: existing.id, created: false };
  const R = rng(20261017);
  const pick = (a) => a[Math.floor(R() * a.length)];
  const salonId = uid();
  const tz = 'America/Sao_Paulo';
  const today = localDate(new Date(), tz);

  await db.run(
    `INSERT INTO salons (id, slug, name, phone, email, address, city, timezone, hours_json, brand_json, plan, status, trial_ends_at, bot_enabled, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [salonId, 'studio-beauty-barber-piloto', 'Studio Beauty Barber · Piloto', '5511900000000', 'piloto@studiobeautybarber.com',
      'Av. Exemplo, 1000 — Centro (endereço fictício do piloto)', 'Maringá - PR', tz,
      JSON.stringify({ 0: null, 1: ['09:00', '19:00'], 2: ['09:00', '20:00'], 3: ['09:00', '20:00'], 4: ['09:00', '20:00'], 5: ['09:00', '20:00'], 6: ['08:00', '17:00'] }),
      JSON.stringify({ automations: { reminders: true, birthday: true, reactivation: true, reactivationDays: 45 } }),
      'medio', 'trial', new Date(Date.now() + 14 * 86400_000).toISOString(), 1, nowIso()]);

  const pw = ownerPassword || randomBytes(9).toString('base64url') + '7a';
  const owner = await createUser(salonId, { name: 'Proprietária Piloto', email: ownerEmail, role: 'owner', password: pw });
  await createUser(salonId, { name: 'Recepção Piloto', email: 'recepcao.piloto@studiobeautybarber.com', role: 'reception', password: pw });

  // Equipe
  const staffDefs = [
    { name: 'Rafael Moura', role: 'Barbeiro', color: '#C9A66B', cats: ['Barbearia'], comm: 45 },
    { name: 'Thiago Pires', role: 'Barbeiro', color: '#8E6F4E', cats: ['Barbearia'], comm: 45, hours: { 0: null, 1: null, 2: ['10:00', '20:00'], 3: ['10:00', '20:00'], 4: ['10:00', '20:00'], 5: ['10:00', '20:00'], 6: ['08:00', '17:00'] } },
    { name: 'Camila Rocha', role: 'Cabeleireira', color: '#B85C5C', cats: ['Cabelo'], comm: 40 },
    { name: 'Bianca Lopes', role: 'Manicure e pedicure', color: '#5C7F8E', cats: ['Unhas'], comm: 50 },
    { name: 'Larissa Prado', role: 'Esteticista', color: '#8E5C7A', cats: ['Estética'], comm: 40 },
  ];
  const services = [
    ['Corte masculino', 'Barbearia', 30, 5500], ['Barba completa', 'Barbearia', 30, 4000], ['Corte + barba', 'Barbearia', 60, 8500], ['Pezinho e acabamento', 'Barbearia', 15, 2000],
    ['Corte feminino', 'Cabelo', 60, 12000], ['Escova modelada', 'Cabelo', 45, 7000], ['Coloração', 'Cabelo', 120, 22000], ['Mechas', 'Cabelo', 180, 38000], ['Hidratação profunda', 'Cabelo', 45, 9000],
    ['Manicure', 'Unhas', 45, 4500], ['Pedicure', 'Unhas', 60, 5500], ['Esmaltação em gel', 'Unhas', 60, 9000],
    ['Design de sobrancelha', 'Estética', 30, 5000], ['Limpeza de pele', 'Estética', 60, 13000],
  ].map(([name, category, dur, price]) => ({ id: uid(), name, category, dur, price }));
  for (const s of services) {
    await db.run('INSERT INTO services (id, salon_id, name, category, duration_min, price_cents, active) VALUES (?,?,?,?,?,?,1)', [s.id, salonId, s.name, s.category, s.dur, s.price]);
  }
  const staff = [];
  for (const d of staffDefs) {
    const id = uid();
    staff.push({ id, ...d });
    await db.run('INSERT INTO staff (id, salon_id, name, role, commission_pct, color, hours_json, active) VALUES (?,?,?,?,?,?,?,1)', [id, salonId, d.name, d.role, d.comm, d.color, d.hours ? JSON.stringify(d.hours) : null]);
    for (const s of services.filter((x) => d.cats.includes(x.category))) await db.run('INSERT INTO staff_services (staff_id, service_id) VALUES (?,?)', [id, s.id]);
  }

  // Produtos
  const products = [['Pomada modeladora', 4500, 2200, 14, 4], ['Óleo para barba', 5900, 2800, 9, 3], ['Shampoo profissional', 6900, 3500, 11, 3], ['Máscara de reconstrução', 8900, 4200, 2, 3], ['Esmalte premium', 1800, 700, 30, 8], ['Cera modeladora', 3900, 1800, 1, 3]];
  const prodRows = [];
  for (const [name, price, cost, stock, min] of products) {
    const id = uid(); prodRows.push({ id, name, price });
    await db.run('INSERT INTO products (id, salon_id, name, price_cents, cost_cents, stock, min_stock, active) VALUES (?,?,?,?,?,?,?,1)', [id, salonId, name, price, cost, stock, min]);
  }

  // Clientes (telefones fictícios; o piloto roda em modo simulado e nunca envia mensagens reais)
  const clients = [];
  const month = today.slice(5, 7);
  for (let i = 0; i < 48; i++) {
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    const id = uid();
    const phone = `5511900000${String(i).padStart(3, '0')}`;
    const consent = R() < 0.72 ? 1 : 0;
    const bday = `${1985 + Math.floor(R() * 20)}-${i % 6 === 0 ? month : String(1 + Math.floor(R() * 12)).padStart(2, '0')}-${String(1 + Math.floor(R() * 28)).padStart(2, '0')}`;
    await db.run(
      `INSERT INTO clients (id, salon_id, name, phone, email, birthday, tags, consent_marketing, consent_at, source, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [id, salonId, name, phone, i % 3 === 0 ? `cliente${i}@exemplo.com.br` : null, bday, i % 7 === 0 ? 'vip' : null, consent, consent ? nowIso() : null, pick(['indicação', 'instagram', 'google', 'passou na porta']), new Date(Date.now() - R() * 150 * 86400_000).toISOString()]);
    clients.push({ id, name, phone });
  }

  // Agenda: últimos 30 dias (concluídos, faltas, cancelados) e próximos 7 dias
  const busy = new Map();
  const inRange = (st, dayStr, hhmm, dur) => {
    const k = `${st.id}|${dayStr}`;
    const [h, m] = hhmm.split(':').map(Number); const start = h * 60 + m;
    const list = busy.get(k) || [];
    if (list.some(([a, b]) => start < b && start + dur > a)) return false;
    list.push([start, start + dur]); busy.set(k, list); return true;
  };
  const salonHours = JSON.parse((await db.get('SELECT hours_json FROM salons WHERE id = ?', [salonId])).hours_json);
  let apptCount = 0;
  for (let off = -30; off <= 7; off++) {
    const day = addDays(today, off);
    const wd = localWeekday(day);
    if (!salonHours[wd]) continue;
    const perDay = off < 0 ? 7 + Math.floor(R() * 6) : 4 + Math.floor(R() * 5);
    for (let k = 0; k < perDay * 3 && apptCount >= 0; k++) {
      if (k >= perDay * 3) break;
      const st = pick(staff);
      const svcs = services.filter((s) => st.cats.includes(s.category));
      const svc = pick(svcs);
      const win = (st.hours || salonHours)[wd];
      if (!win) continue;
      const [oh] = win[0].split(':').map(Number); const [ch] = win[1].split(':').map(Number);
      const slotCount = (ch - oh) * 2;
      const t = oh * 60 + 30 * Math.floor(R() * slotCount);
      if (t + svc.dur > ch * 60) continue;
      const hhmm = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
      if (!inRange(st, day, hhmm, svc.dur)) continue;
      const startsAt = zonedToUtc(day, hhmm, tz);
      if (off === 0 && startsAt < nowIso()) { /* mantém: aparece como concluído hoje */ }
      const endsAt = new Date(new Date(startsAt).getTime() + svc.dur * 60000).toISOString();
      const past = endsAt < nowIso();
      const roll = R();
      const status = past ? (roll < 0.84 ? 'done' : roll < 0.92 ? 'noshow' : 'cancelled') : (roll < 0.45 ? 'confirmed' : 'scheduled');
      const c = pick(clients);
      const id = uid();
      await db.run(
        `INSERT INTO appointments (id, salon_id, client_id, staff_id, service_id, starts_at, ends_at, status, price_cents, source, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [id, salonId, c.id, st.id, svc.id, startsAt, endsAt, status === 'done' ? 'scheduled' : status, svc.price, pick(['painel', 'pagina-agendamento', 'robô:whatsapp']), nowIso()]);
      apptCount++;
      if (status === 'done') {
        const saleId = uid();
        const withProduct = R() < 0.18;
        const prod = pick(prodRows);
        const total = svc.price + (withProduct ? prod.price : 0);
        await db.run('INSERT INTO sales (id, salon_id, client_id, appointment_id, staff_id, total_cents, discount_cents, payment_method, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
          [saleId, salonId, c.id, id, st.id, total, 0, pick(['pix', 'pix', 'card', 'card', 'cash']), 'open', endsAt]);
        await db.run('INSERT INTO sale_items (id, sale_id, kind, ref_id, name, qty, unit_cents) VALUES (?,?,?,?,?,?,?)', [uid(), saleId, 'service', svc.id, svc.name, 1, svc.price]);
        if (withProduct) await db.run('INSERT INTO sale_items (id, sale_id, kind, ref_id, name, qty, unit_cents) VALUES (?,?,?,?,?,?,?)', [uid(), saleId, 'product', prod.id, prod.name, 1, prod.price]);
        await settleSale(saleId, { paidAt: endsAt });
      }
    }
  }
  // estoque não deve zerar por causa do histórico simulado
  for (const [i, p] of prodRows.entries()) await db.run('UPDATE products SET stock = ? WHERE id = ?', [products[i][3], p.id]);

  // Leads do próprio salão (quem chamou e ainda não virou cliente)
  const leadDefs = [
    ['Marcos Vidal', 'new', 'instagram'], ['Paula Mendes', 'new', 'google'], ['Renata Alves', 'contacted', 'indicação'], ['Sérgio Lacerda', 'contacted', 'instagram'],
    ['Jéssica Duarte', 'scheduled', 'robô:whatsapp'], ['Otávio Brandão', 'scheduled', 'google'], ['Fernanda Cruz', 'won', 'indicação'], ['Caio Medeiros', 'lost', 'instagram'],
  ];
  for (const [i, [name, stage, source]] of leadDefs.entries()) {
    const now = new Date(Date.now() - i * 86400_000).toISOString();
    await db.run(
      `INSERT INTO leads (id, salon_id, name, phone, source, stage, value_cents, consent, consent_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [uid(), salonId, name, `5511911000${String(i).padStart(3, '0')}`, source, stage, 5000 + i * 3000, i % 2 === 0 ? 1 : 0, i % 2 === 0 ? now : null, now, now]);
  }

  // Campanhas de exemplo
  await db.run(
    `INSERT INTO campaigns (id, salon_id, name, channel, body, segment_json, status, total, sent, failed, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [uid(), salonId, 'Volte para o seu horário', 'whatsapp', 'Oi, {{nome}}! Sentimos sua falta no {{salao}}. Que tal reservar seu horário? Responda "agendar".\n\nPara não receber mais mensagens, responda PARAR.', JSON.stringify({ audience: 'clients', inactiveDays: 45 }), 'done', 14, 14, 0, new Date(Date.now() - 6 * 86400_000).toISOString()]);
  await db.run(
    `INSERT INTO campaigns (id, salon_id, name, channel, body, segment_json, status, created_at) VALUES (?,?,?,?,?,?,?,?)`,
    [uid(), salonId, 'Dia de beleza em casal', 'whatsapp', 'Oi, {{nome}}! Neste mês, traga alguém para cortar com você no {{salao}} e ganhe uma hidratação. Responda "agendar". \n\nPara não receber mais mensagens, responda PARAR.', JSON.stringify({ audience: 'clients', activeWithinDays: 90 }), 'draft', nowIso()]);

  // Conversas de demonstração, passando pelo robô de verdade
  const salon = await db.get('SELECT * FROM salons WHERE id = ?', [salonId]);
  const talk = async (channel, ext, name, lines) => { for (const l of lines) await handleInbound(salon, { channel, externalId: ext, name, text: l }); };
  await talk('whatsapp', '5511988880001', 'Lucas Ferraz', ['oi', 'quanto custa um corte e barba?', 'quero agendar']);
  await talk('instagram', 'ig_demo_1001', 'Amanda (Instagram)', ['Vocês fazem mechas?', 'atendente']);
  await talk('whatsapp', '5511988880002', 'Patrícia Nunes', ['onde fica o salão?']);

  return { salonId, created: true, ownerEmail, ownerPassword: pw };
}

async function main() {
  await initDb();
  await ensureHq();
  const out = [];
  if (process.env.HQ_OWNER_EMAIL) {
    const hq = await db.get('SELECT id FROM salons WHERE slug = ?', [cfg.hqSlug]);
    const u = await createUser(hq.id, { name: 'Comercial WMundi', email: process.env.HQ_OWNER_EMAIL, role: 'owner', password: process.env.HQ_OWNER_PASSWORD });
    if (u.created) out.push(`HQ  ${process.env.HQ_OWNER_EMAIL}  senha: ${u.password}`);
  }
  const r = await seedPilot({ ownerEmail: process.env.PILOT_OWNER_EMAIL, ownerPassword: process.env.PILOT_OWNER_PASSWORD });
  if (r.created) out.push(`Piloto  ${r.ownerEmail}  senha: ${r.ownerPassword}`);
  console.log(out.length ? '\nCredenciais geradas (anote agora, não ficam salvas em lugar nenhum):\n' + out.join('\n') : 'Nada novo para criar (já existe).');
  await db.close();
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(e); process.exit(1); });
