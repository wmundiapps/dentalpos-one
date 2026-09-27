import { Router } from 'express';
import { z } from 'zod';
import { pool, rows } from '../db.js';
import { HttpError, requireAuth, type AuthedRequest } from '../auth.js';
import { recordIntent, unsubscribe } from '../cartRecovery.js';

export const marketingRouter = Router();

// Tela de reserva aberta (base do lembrete de reserva abandonada)
marketingRouter.post('/checkout-intents', requireAuth, async (req: AuthedRequest, res) => {
  const { listingId, query } = z.object({ listingId: z.string().min(1).max(80), query: z.string().max(2000) }).parse(req.body);
  const l = await rows<{ host_id: string }>(pool, 'SELECT host_id FROM listings WHERE id = $1 AND active', [listingId]);
  if (l.length && l[0].host_id !== req.user!.id) await recordIntent(req.user!.id, listingId, query);
  res.status(204).end();
});

// Descadastro pelo link do e-mail (GET abre a página; POST é o "one-click" do Gmail/Outlook)
async function unsubscribeHandler(req: { query: Record<string, unknown> }, res: import('express').Response) {
  const ok = await unsubscribe(String(req.query.u ?? ''), String(req.query.t ?? ''));
  res.status(ok ? 200 : 400).type('html').send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SpaceHour</title><div style="font-family:system-ui,Arial,sans-serif;max-width:480px;margin:60px auto;padding:0 16px;color:#1f2937">
<h2 style="color:#0f766e">SpaceHour</h2><p>${ok ? 'Pronto! Você não vai mais receber lembretes nem novidades por e-mail. Os avisos das suas reservas continuam chegando normalmente.' : 'Link inválido.'}</p>
<p><a href="/" style="color:#0f766e">Voltar ao SpaceHour</a></p></div>`);
}
marketingRouter.get('/email/unsubscribe', unsubscribeHandler);
marketingRouter.post('/email/unsubscribe', unsubscribeHandler);

// Preferência de novidades por e-mail/WhatsApp (perfil)
marketingRouter.get('/me/marketing', requireAuth, async (req: AuthedRequest, res) => {
  const [u] = await rows<{ marketing_opt_in_at: Date | null; email_unsubscribed_at: Date | null }>(pool,
    'SELECT marketing_opt_in_at, email_unsubscribed_at FROM users WHERE id = $1', [req.user!.id]);
  res.json({ optIn: !!u?.marketing_opt_in_at, unsubscribed: !!u?.email_unsubscribed_at });
});
marketingRouter.put('/me/marketing', requireAuth, async (req: AuthedRequest, res) => {
  const { optIn } = z.object({ optIn: z.boolean() }).parse(req.body);
  await pool.query(optIn
    ? 'UPDATE users SET marketing_opt_in_at = coalesce(marketing_opt_in_at, now()), email_unsubscribed_at = NULL WHERE id = $1'
    : 'UPDATE users SET marketing_opt_in_at = NULL WHERE id = $1', [req.user!.id]);
  res.json({ optIn });
});

// ───────────── Base de contatos (Admin → Contatos) ─────────────
type Contact = {
  name: string; email: string; phone: string | null; country_code: string; locale: string; created_at: Date; source: string | null;
  email_verified: boolean; marketing_opt_in: boolean; unsubscribed: boolean; is_host: boolean; listings: number; bookings: number; abandoned_checkouts: number;
};
const contactFilter = z.object({
  status: z.enum(['all', 'verified', 'unverified']).default('all'),
  consent: z.enum(['all', 'yes']).default('all'),
  role: z.enum(['all', 'host', 'guest']).default('all'),
  days: z.coerce.number().int().min(0).max(3650).default(0),
  format: z.enum(['json', 'csv']).default('json'),
});

marketingRouter.get('/admin/contacts', requireAuth, async (req: AuthedRequest, res) => {
  if (!req.user!.roles.includes('admin')) throw new HttpError(403, 'forbidden');
  const f = contactFilter.parse(req.query);
  const list = await rows<Contact>(pool,
    `SELECT * FROM (
       SELECT u.name, u.email, u.phone, u.country_code, u.locale, u.created_at, u.signup_source AS source,
              u.email_verified_at IS NOT NULL AS email_verified,
              u.marketing_opt_in_at IS NOT NULL AS marketing_opt_in,
              u.email_unsubscribed_at IS NOT NULL AS unsubscribed,
              (SELECT count(*) FROM listings l WHERE l.host_id = u.id)::int AS listings,
              (SELECT count(*) FROM bookings b WHERE b.guest_id = u.id AND b.status NOT IN ('expired'))::int AS bookings,
              (SELECT count(*) FROM checkout_intents c WHERE c.user_id = u.id AND c.converted_at IS NULL)::int AS abandoned_checkouts
         FROM users u
        WHERE u.deleted_at IS NULL AND NOT u.banned AND NOT ('admin' = ANY(u.roles))
          AND ($1 = 0 OR u.created_at > now() - make_interval(days => $1))
     ) x
     WHERE ($2 = 'all' OR ($2 = 'verified') = x.email_verified)
       AND ($3 = 'all' OR (x.marketing_opt_in AND NOT x.unsubscribed))
       AND ($4 = 'all' OR ($4 = 'host') = (x.listings > 0))
     ORDER BY x.created_at DESC`, [f.days, f.status, f.consent, f.role]);
  const contacts = list.map((c) => ({ ...c, is_host: c.listings > 0 }));
  if (f.format === 'csv') {
    const cols: [keyof Contact, string][] = [['name', 'nome'], ['email', 'email'], ['phone', 'telefone'], ['country_code', 'pais'], ['locale', 'idioma'],
      ['created_at', 'cadastro'], ['source', 'origem'], ['email_verified', 'email_confirmado'], ['marketing_opt_in', 'aceita_novidades'],
      ['unsubscribed', 'descadastrado'], ['is_host', 'anfitriao'], ['listings', 'anuncios'], ['bookings', 'reservas'], ['abandoned_checkouts', 'reservas_abandonadas']];
    const cell = (v: unknown) => {
      const s = v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === 'boolean' ? (v ? 'sim' : 'nao') : v == null ? '' : String(v);
      // aspas + proteção contra fórmulas ao abrir no Excel/Planilhas
      return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
    };
    const csv = [cols.map(([, h]) => h).join(';'), ...contacts.map((c) => cols.map(([k]) => cell(c[k])).join(';'))].join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="spacehour-contatos-${new Date().toISOString().slice(0, 10)}.csv"`);
    return res.send(`﻿${csv}`);
  }
  const all = await rows<{ total: number; verified: number; unverified: number; opt_in: number; hosts: number; abandoned: number }>(pool,
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE email_verified_at IS NOT NULL)::int AS verified,
            count(*) FILTER (WHERE email_verified_at IS NULL)::int AS unverified,
            count(*) FILTER (WHERE marketing_opt_in_at IS NOT NULL AND email_unsubscribed_at IS NULL)::int AS opt_in,
            count(*) FILTER (WHERE EXISTS (SELECT 1 FROM listings l WHERE l.host_id = users.id))::int AS hosts,
            count(*) FILTER (WHERE EXISTS (SELECT 1 FROM checkout_intents c WHERE c.user_id = users.id AND c.converted_at IS NULL))::int AS abandoned
       FROM users WHERE deleted_at IS NULL AND NOT banned AND NOT ('admin' = ANY(roles))`);
  res.json({ summary: all[0], contacts: contacts.slice(0, 200), count: contacts.length });
});
