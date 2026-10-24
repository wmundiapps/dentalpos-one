import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool, rows } from '../db.js';
import { requireOwner, tenantOf, type AuthedRequest } from '../auth.js';
import { HttpError, audit, clientIp, rateLimit } from '../security.js';
import { getTenant, loadSettings, parseSettings, setSecret } from '../tenant.js';
import { settingsSchema } from '../settings.js';
import { validateKey } from '../asaas.js';
import { passwordProblem, text } from '../validators.js';
import { decrypt } from '../secure.js';
import { TERMS_VERSION } from '../legal.js';
import { cashbacksmartUrl } from '../notify.js';
import { insertRec } from '../repo.js';

export const settingsRouter = Router();

settingsRouter.get('/', async (req: AuthedRequest, res) => {
  const t = await getTenant(pool, tenantOf(req));
  res.json({ settings: parseSettings(t.settings), asaasConnected: !!t.secrets && (() => { try { return !!JSON.parse(decrypt(t.secrets!)).asaasApiKey; } catch { return false; } })(), cashbacksmart: { urlConfigured: !!cashbacksmartUrl() }, slug: t.slug, termsVersion: t.terms_version, currentTermsVersion: TERMS_VERSION });
});

settingsRouter.put('/', requireOwner, async (req: AuthedRequest, res) => {
  const tenantId = tenantOf(req);
  const current = await loadSettings(pool, tenantId);
  const next = settingsSchema.parse({ ...current, ...req.body });
  await pool.query('UPDATE tenants SET settings = $2 WHERE id = $1', [tenantId, JSON.stringify(next)]);
  await audit(pool, 'configuracao_alterada', { tenantId, userId: req.user!.id, ip: clientIp(req) });
  res.json(next);
});

/** A chave do Asaas é digitada aqui (nunca no chat), validada e guardada cifrada. Nunca volta para a tela. */
settingsRouter.put('/asaas', requireOwner, rateLimit('asaas-key', 10, 3600, true), async (req: AuthedRequest, res) => {
  const tenantId = tenantOf(req);
  const b = z.object({ apiKey: z.string().min(20).max(300).regex(/^[\w$.\-]+$/), sandbox: z.boolean() }).parse(req.body);
  if (!(await validateKey({ apiKey: b.apiKey, sandbox: b.sandbox }))) throw new HttpError(400, 'O Asaas não aceitou essa chave. Confira se ela é do ambiente certo (teste ou produção).', 'chave_invalida');
  await setSecret(tenantId, 'asaasApiKey', b.apiKey);
  const s = await loadSettings(pool, tenantId);
  await pool.query('UPDATE tenants SET settings = $2 WHERE id = $1', [tenantId, JSON.stringify({ ...s, asaas: { ...s.asaas, sandbox: b.sandbox } })]);
  await audit(pool, 'asaas_conectado', { tenantId, userId: req.user!.id, ip: clientIp(req) });
  res.json({ ok: true });
});

settingsRouter.get('/team', requireOwner, async (req: AuthedRequest, res) => {
  res.json(await rows(pool, 'SELECT id, name, email, role, created_at AS "createdAt" FROM users WHERE tenant_id = $1 ORDER BY created_at', [tenantOf(req)]));
});

settingsRouter.post('/team', requireOwner, rateLimit('team', 20, 3600, true), async (req: AuthedRequest, res) => {
  const tenantId = tenantOf(req);
  const b = z.object({ name: text(100).pipe(z.string().min(2)), email: z.string().email().max(160).transform((s) => s.toLowerCase()), password: z.string().max(128) }).parse(req.body);
  const pw = passwordProblem(b.password);
  if (pw) throw new HttpError(400, pw, 'senha_fraca');
  if ((await pool.query('SELECT 1 FROM users WHERE email = $1', [b.email])).rowCount) throw new HttpError(409, 'Esse e-mail já tem conta.', 'email_em_uso');
  await pool.query("INSERT INTO users (tenant_id, name, email, password_hash, role) VALUES ($1,$2,$3,$4,'staff')", [tenantId, b.name, b.email, await bcrypt.hash(b.password, 12)]);
  await audit(pool, 'funcionario_criado', { tenantId, userId: req.user!.id, ip: clientIp(req) }, { email: b.email });
  res.status(201).json({ ok: true });
});

/** Portabilidade (LGPD): o dono baixa todos os dados do lava-rápido. Registrado na auditoria. */
settingsRouter.get('/export', requireOwner, rateLimit('export', 5, 3600, true), async (req: AuthedRequest, res) => {
  const tenantId = tenantOf(req);
  const recs = await rows(pool, 'SELECT id, kind, data, created_at FROM records WHERE tenant_id = $1 ORDER BY created_at', [tenantId]);
  const data = recs.map((r) => { const d = { ...r.data }; if (d.cpfEnc) { try { d.cpf = decrypt(d.cpfEnc); } catch { /* ignora */ } delete d.cpfEnc; } return { id: r.id, kind: r.kind, createdAt: r.created_at, data: d }; });
  await audit(pool, 'exportacao_dados', { tenantId, userId: req.user!.id, ip: clientIp(req) }, { registros: data.length });
  res.set('Content-Disposition', 'attachment; filename="lavapos-dados.json"').json({ geradoEm: new Date().toISOString(), registros: data });
});

/** Pedido de encerramento (exigido pela Apple/Google): cancela a conta; os dados ficam 30 dias para exportação e depois são anonimizados. */
settingsRouter.post('/close-account', requireOwner, rateLimit('close', 3, 3600, true), async (req: AuthedRequest, res) => {
  const tenantId = tenantOf(req);
  z.object({ confirm: z.literal('ENCERRAR') }).parse(req.body);
  await pool.query("UPDATE tenants SET billing_status = 'cancelada', settings = jsonb_set(settings, '{closeRequestedAt}', to_jsonb(now()::text)) WHERE id = $1", [tenantId]);
  await audit(pool, 'encerramento_solicitado', { tenantId, userId: req.user!.id, ip: clientIp(req) });
  res.json({ ok: true, message: 'Conta encerrada. Seus dados ficam disponíveis para exportação por 30 dias e depois são anonimizados.' });
});

/** Gestor adere ao Cashbacksmart: liga a opção, registra o interesse (a plataforma vê e acompanha) e devolve o link de cadastro, se já houver. */
settingsRouter.post('/cashbacksmart/join', requireOwner, rateLimit('cs-join', 10, 3600, true), async (req: AuthedRequest, res) => {
  const tenantId = tenantOf(req);
  const [s, t] = [await loadSettings(pool, tenantId), await getTenant(pool, tenantId)];
  const next = settingsSchema.parse({ ...s, loyalty: { ...s.loyalty, enabled: true, cashbacksmart: { ...s.loyalty.cashbacksmart, enabled: true } } });
  await pool.query('UPDATE tenants SET settings = $2 WHERE id = $1', [tenantId, JSON.stringify(next)]);
  const jaTem = await pool.query("SELECT 1 FROM records WHERE tenant_id = $1 AND kind = 'cashbacksmartLead' LIMIT 1", [tenantId]);
  if (!jaTem.rowCount) await insertRec(pool, tenantId, 'cashbacksmartLead', { lavacar: t.name, responsavel: t.owner_name, email: t.email, telefone: t.phone ?? '', status: 'interesse' });
  await audit(pool, 'cashbacksmart_adesao', { tenantId, userId: req.user!.id, ip: clientIp(req) });
  const base = cashbacksmartUrl();
  let joinUrl: string | null = null;
  if (base) { const u = new URL(base); u.searchParams.set('utm_source', 'lavapos'); u.searchParams.set('utm_medium', 'gestor'); u.searchParams.set('utm_campaign', t.slug); joinUrl = u.toString(); }
  res.json({ ok: true, joinUrl });
});
