// Serviços, equipe, produtos e clientes.
import { cfg } from '../config.js';
import { db } from '../db.js';
import { HttpError, validate, uid, nowIso, json } from '../util.js';
import { auth, audit } from '../auth.js';

const COLORS = ['#C9A66B', '#8E6F4E', '#B85C5C', '#5C7F8E', '#7A8E5C', '#8E5C7A', '#5C6B8E'];

export default function register(r) {
  // ---------- Serviços ----------
  r.get('/api/services', auth(), async (ctx) => ({
    services: await db.all('SELECT * FROM services WHERE salon_id = ? ORDER BY active DESC, category, name', [ctx.salon.id]),
  }));
  r.post('/api/services', auth('manager'), async (ctx) => {
    const d = validate(ctx.body, { name: 'str:2:80', category: 'str?:0:40', description: 'str?:0:300', duration_min: 'int:5:480', price_cents: 'int:0:10000000' });
    const id = uid();
    await db.run('INSERT INTO services (id, salon_id, name, category, description, duration_min, price_cents, active) VALUES (?,?,?,?,?,?,?,1)',
      [id, ctx.salon.id, d.name, d.category, d.description, d.duration_min, d.price_cents]);
    // por padrão, todos os profissionais ativos realizam o novo serviço
    const staff = await db.all('SELECT id FROM staff WHERE salon_id = ? AND active = 1', [ctx.salon.id]);
    for (const s of staff) await db.run('INSERT INTO staff_services (staff_id, service_id) VALUES (?,?) ON CONFLICT DO NOTHING', [s.id, id]);
    await audit(ctx, 'service_created', 'service', id);
    return { id };
  });
  r.patch('/api/services/:id', auth('manager'), async (ctx) => {
    const d = validate(ctx.body, { name: 'str?:2:80', category: 'str?:0:40', description: 'str?:0:300', duration_min: 'int?:5:480', price_cents: 'int?:0:10000000', active: 'bool?' });
    const res = await db.run(
      `UPDATE services SET name = COALESCE(?, name), category = COALESCE(?, category), description = COALESCE(?, description),
         duration_min = COALESCE(?, duration_min), price_cents = COALESCE(?, price_cents), active = COALESCE(?, active)
       WHERE id = ? AND salon_id = ?`,
      [d.name, d.category, d.description, d.duration_min, d.price_cents, d.active, ctx.params.id, ctx.salon.id]);
    if (!res.changes) throw new HttpError(404, 'Serviço não encontrado.');
    await audit(ctx, 'service_updated', 'service', ctx.params.id);
    return { ok: true };
  });

  // ---------- Equipe ----------
  r.get('/api/staff', auth(), async (ctx) => {
    const rows = await db.all('SELECT * FROM staff WHERE salon_id = ? ORDER BY active DESC, name', [ctx.salon.id]);
    const links = await db.all('SELECT ss.* FROM staff_services ss JOIN staff s ON s.id = ss.staff_id WHERE s.salon_id = ?', [ctx.salon.id]);
    return { staff: rows.map((s) => ({ ...s, hours: json(s.hours_json, null), service_ids: links.filter((l) => l.staff_id === s.id).map((l) => l.service_id) })) };
  });
  r.post('/api/staff', auth('manager'), async (ctx) => {
    const d = validate(ctx.body, { name: 'str:2:80', role: 'str?:0:60', phone: 'phone?', commission_pct: 'int?:0:100' });
    const active = await db.get('SELECT COUNT(*) AS n FROM staff WHERE salon_id = ? AND active = 1', [ctx.salon.id]);
    // Teste grátis libera o limite do plano Médio; depois vale o limite do plano contratado.
    const limit = ctx.salon.status === 'trial' ? cfg.plans.medio.staff : (cfg.plans[ctx.salon.plan]?.staff ?? 1);
    if (Number(active.n) >= limit) throw new HttpError(402, `Seu plano permite até ${limit} profissional(is) ativo(s). Faça upgrade em Assinatura para adicionar mais.`);
    const id = uid();
    const count = await db.get('SELECT COUNT(*) AS n FROM staff WHERE salon_id = ?', [ctx.salon.id]);
    await db.run('INSERT INTO staff (id, salon_id, name, role, phone, commission_pct, color, active) VALUES (?,?,?,?,?,?,?,1)',
      [id, ctx.salon.id, d.name, d.role, d.phone, d.commission_pct ?? 40, COLORS[Number(count.n) % COLORS.length]]);
    const services = Array.isArray(ctx.body?.service_ids) ? ctx.body.service_ids : (await db.all('SELECT id FROM services WHERE salon_id = ?', [ctx.salon.id])).map((s) => s.id);
    for (const sid of services) {
      const ok = await db.get('SELECT 1 AS x FROM services WHERE id = ? AND salon_id = ?', [sid, ctx.salon.id]);
      if (ok) await db.run('INSERT INTO staff_services (staff_id, service_id) VALUES (?,?) ON CONFLICT DO NOTHING', [id, sid]);
    }
    await audit(ctx, 'staff_created', 'staff', id);
    return { id };
  });
  r.patch('/api/staff/:id', auth('manager'), async (ctx) => {
    const d = validate(ctx.body, { name: 'str?:2:80', role: 'str?:0:60', phone: 'phone?', commission_pct: 'int?:0:100', active: 'bool?' });
    const res = await db.run(
      `UPDATE staff SET name = COALESCE(?, name), role = COALESCE(?, role), phone = COALESCE(?, phone),
         commission_pct = COALESCE(?, commission_pct), active = COALESCE(?, active) WHERE id = ? AND salon_id = ?`,
      [d.name, d.role, d.phone, d.commission_pct, d.active, ctx.params.id, ctx.salon.id]);
    if (!res.changes) throw new HttpError(404, 'Profissional não encontrado.');
    if (Array.isArray(ctx.body?.service_ids)) {
      await db.run('DELETE FROM staff_services WHERE staff_id = ?', [ctx.params.id]);
      for (const sid of ctx.body.service_ids) {
        const ok = await db.get('SELECT 1 AS x FROM services WHERE id = ? AND salon_id = ?', [sid, ctx.salon.id]);
        if (ok) await db.run('INSERT INTO staff_services (staff_id, service_id) VALUES (?,?) ON CONFLICT DO NOTHING', [ctx.params.id, sid]);
      }
    }
    if (ctx.body?.hours && typeof ctx.body.hours === 'object') {
      await db.run('UPDATE staff SET hours_json = ? WHERE id = ? AND salon_id = ?', [JSON.stringify(ctx.body.hours).slice(0, 1000), ctx.params.id, ctx.salon.id]);
    }
    await audit(ctx, 'staff_updated', 'staff', ctx.params.id);
    return { ok: true };
  });

  // ---------- Produtos / estoque ----------
  r.get('/api/products', auth(), async (ctx) => ({
    products: await db.all('SELECT * FROM products WHERE salon_id = ? ORDER BY active DESC, name', [ctx.salon.id]),
  }));
  r.post('/api/products', auth('manager'), async (ctx) => {
    const d = validate(ctx.body, { name: 'str:2:80', price_cents: 'int:0:10000000', cost_cents: 'int?:0:10000000', stock: 'int:0:100000', min_stock: 'int?:0:100000' });
    const id = uid();
    await db.run('INSERT INTO products (id, salon_id, name, price_cents, cost_cents, stock, min_stock, active) VALUES (?,?,?,?,?,?,?,1)',
      [id, ctx.salon.id, d.name, d.price_cents, d.cost_cents ?? 0, d.stock, d.min_stock ?? 2]);
    return { id };
  });
  r.patch('/api/products/:id', auth('manager'), async (ctx) => {
    const d = validate(ctx.body, { name: 'str?:2:80', price_cents: 'int?:0:10000000', cost_cents: 'int?:0:10000000', stock: 'int?:0:100000', min_stock: 'int?:0:100000', active: 'bool?' });
    const res = await db.run(
      `UPDATE products SET name = COALESCE(?, name), price_cents = COALESCE(?, price_cents), cost_cents = COALESCE(?, cost_cents),
         stock = COALESCE(?, stock), min_stock = COALESCE(?, min_stock), active = COALESCE(?, active) WHERE id = ? AND salon_id = ?`,
      [d.name, d.price_cents, d.cost_cents, d.stock, d.min_stock, d.active, ctx.params.id, ctx.salon.id]);
    if (!res.changes) throw new HttpError(404, 'Produto não encontrado.');
    return { ok: true };
  });

  // ---------- Clientes ----------
  r.get('/api/clients', auth(), async (ctx) => {
    const q = String(ctx.query.q || '').trim().toLowerCase().slice(0, 60);
    const limit = Math.min(Number(ctx.query.limit) || 100, 300);
    let rows;
    if (q) {
      const like = `%${q.replace(/[%_]/g, '')}%`;
      const digits = q.replace(/\D/g, '');
      rows = await db.all(
        `SELECT * FROM clients WHERE salon_id = ? AND deleted_at IS NULL AND (LOWER(name) LIKE ? OR LOWER(COALESCE(email,'')) LIKE ? ${digits.length >= 4 ? 'OR phone LIKE ?' : ''})
         ORDER BY name LIMIT ?`,
        digits.length >= 4 ? [ctx.salon.id, like, like, `%${digits}%`, limit] : [ctx.salon.id, like, like, limit]);
    } else {
      rows = await db.all('SELECT * FROM clients WHERE salon_id = ? AND deleted_at IS NULL ORDER BY name LIMIT ?', [ctx.salon.id, limit]);
    }
    return { clients: rows };
  });
  r.get('/api/clients/:id', auth(), async (ctx) => {
    const c = await db.get('SELECT * FROM clients WHERE id = ? AND salon_id = ? AND deleted_at IS NULL', [ctx.params.id, ctx.salon.id]);
    if (!c) throw new HttpError(404, 'Cliente não encontrado.');
    const history = await db.all(
      `SELECT a.id, a.starts_at, a.status, a.price_cents, s.name AS service_name, st.name AS staff_name
         FROM appointments a JOIN services s ON s.id = a.service_id JOIN staff st ON st.id = a.staff_id
        WHERE a.client_id = ? AND a.salon_id = ? ORDER BY a.starts_at DESC LIMIT 30`, [c.id, ctx.salon.id]);
    return { client: c, history };
  });
  r.post('/api/clients', auth('reception'), async (ctx) => {
    const d = validate(ctx.body, { name: 'str:2:80', phone: 'phone?', email: 'email?', birthday: 'date?', notes: 'str?:0:1000', tags: 'str?:0:200', consent_marketing: 'bool?' });
    if (d.phone && (await db.get('SELECT 1 AS x FROM clients WHERE salon_id = ? AND phone = ? AND deleted_at IS NULL', [ctx.salon.id, d.phone]))) {
      throw new HttpError(409, 'Já existe um cliente com este telefone.');
    }
    const id = uid();
    await db.run(
      `INSERT INTO clients (id, salon_id, name, phone, email, birthday, notes, tags, consent_marketing, consent_at, source, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, ctx.salon.id, d.name, d.phone, d.email, d.birthday, d.notes, d.tags, d.consent_marketing ?? 0, d.consent_marketing ? nowIso() : null, 'painel', nowIso()]);
    await audit(ctx, 'client_created', 'client', id);
    return { id };
  });
  r.patch('/api/clients/:id', auth('reception'), async (ctx) => {
    const d = validate(ctx.body, { name: 'str?:2:80', phone: 'phone?', email: 'email?', birthday: 'date?', notes: 'str?:0:1000', tags: 'str?:0:200', consent_marketing: 'bool?' });
    const cur = await db.get('SELECT * FROM clients WHERE id = ? AND salon_id = ? AND deleted_at IS NULL', [ctx.params.id, ctx.salon.id]);
    if (!cur) throw new HttpError(404, 'Cliente não encontrado.');
    const consentChanged = d.consent_marketing !== null && d.consent_marketing !== undefined && d.consent_marketing !== cur.consent_marketing;
    await db.run(
      `UPDATE clients SET name = COALESCE(?, name), phone = COALESCE(?, phone), email = COALESCE(?, email), birthday = COALESCE(?, birthday),
         notes = COALESCE(?, notes), tags = COALESCE(?, tags), consent_marketing = COALESCE(?, consent_marketing),
         consent_at = CASE WHEN ? = 1 THEN ? ELSE consent_at END WHERE id = ?`,
      [d.name, d.phone, d.email, d.birthday, d.notes, d.tags, d.consent_marketing, consentChanged ? 1 : 0, nowIso(), cur.id]);
    if (consentChanged) await audit(ctx, d.consent_marketing ? 'consent_given' : 'consent_revoked', 'client', cur.id);
    return { ok: true };
  });
  // LGPD: exclusão (anonimiza e preserva o histórico financeiro)
  r.delete('/api/clients/:id', auth('manager'), async (ctx) => {
    const res = await db.run(
      "UPDATE clients SET deleted_at = ?, name = 'Cliente removido', phone = NULL, email = NULL, birthday = NULL, notes = NULL, consent_marketing = 0 WHERE id = ? AND salon_id = ? AND deleted_at IS NULL",
      [nowIso(), ctx.params.id, ctx.salon.id]);
    if (!res.changes) throw new HttpError(404, 'Cliente não encontrado.');
    await audit(ctx, 'client_erased', 'client', ctx.params.id);
    return { ok: true };
  });
  // LGPD: exportação dos dados de um titular
  r.get('/api/clients/:id/export', auth('manager'), async (ctx) => {
    const c = await db.get('SELECT * FROM clients WHERE id = ? AND salon_id = ?', [ctx.params.id, ctx.salon.id]);
    if (!c) throw new HttpError(404, 'Cliente não encontrado.');
    const appts = await db.all('SELECT starts_at, status, price_cents FROM appointments WHERE client_id = ?', [c.id]);
    await audit(ctx, 'client_exported', 'client', c.id);
    return { exported_at: nowIso(), client: c, appointments: appts };
  });
}
