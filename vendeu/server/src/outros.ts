// "Outros" aprende com o que as pessoas anunciam: termos que se repetem em vários anúncios viram
// um grupo (ex.: "bicicleta"). A moderação pode aprovar, esconder ou renomear cada grupo.
import { config } from './config.js';
import { many, pool, type Db } from './db.js';
import { norm } from './risk.js';

const STOP = new Set(('para com sem uma uns umas dos das nos nas por pelo pela como mais muito pouco novo nova novos novas usado usada usados usadas ' +
  'otimo otima bom boa estado perfeito perfeita urgente barato barata vendo aluguel alugo troco aceito oportunidade completo completa original ' +
  'grande pequeno pequena medio media preto preta branco branca azul verde vermelho vermelha cinza cor tamanho marca modelo ano pouco uso ' +
  'excelente conservado conservada impecavel semi funcionando funciona nunca usei unidade unidades kit conjunto promocao oferta preco valor').split(' '));

/** Termos significativos do título: sem acento, sem números, sem plural simples. */
export function tokensOf(title: string): string[] {
  const out = new Set<string>();
  for (const raw of norm(title).split(/[^a-z]+/)) {
    if (raw.length < 4 || STOP.has(raw)) continue;
    const t = raw.length > 5 && raw.endsWith('s') && !raw.endsWith('ss') ? raw.slice(0, -1) : raw;
    if (!STOP.has(t)) out.add(t);
  }
  return [...out];
}

export async function refreshOutrosGroups(db: Db = pool): Promise<{ groups: number; assigned: number }> {
  const rows = await many<{ id: string; title: string; status: string }>(db,
    `SELECT id, title, status FROM listings WHERE category = 'outros' AND status IN ('active','paused','pending_checkout','sold') AND created_at > now() - make_interval(days => $1)`,
    [config.outrosGroupWindowDays]);
  const byToken = new Map<string, { id: string; status: string }[]>();
  const perListing = new Map<string, string[]>();
  for (const r of rows) {
    const toks = tokensOf(r.title);
    perListing.set(r.id, toks);
    for (const t of toks) byToken.set(t, [...(byToken.get(t) ?? []), r]);
  }
  const hidden = new Set((await many<{ token: string }>(db, "SELECT token FROM category_groups WHERE status = 'hidden'")).map((r) => r.token));
  const eligible = new Map<string, number>();
  for (const [token, list] of byToken) {
    if (list.length < config.outrosGroupMin || hidden.has(token)) continue;
    eligible.set(token, list.length);
    const active = list.filter((l) => l.status === 'active').length;
    await db.query(
      `INSERT INTO category_groups (token, label, total_count, active_count) VALUES ($1,$2,$3,$4)
       ON CONFLICT (token) DO UPDATE SET total_count = $3, active_count = $4, updated_at = now()`,
      [token, token.charAt(0).toUpperCase() + token.slice(1), list.length, active]);
  }
  // quem deixou de atingir o mínimo continua cadastrado, mas com contagem atual
  await db.query(`UPDATE category_groups SET total_count = 0, active_count = 0 WHERE token <> ALL($1::text[]) AND status = 'auto'`, [[...eligible.keys()]]);
  let assigned = 0;
  for (const [listingId, toks] of perListing) {
    const best = toks.filter((t) => eligible.has(t)).sort((a, b) => eligible.get(b)! - eligible.get(a)! || a.localeCompare(b))[0] ?? null;
    const r = await db.query('UPDATE listings SET group_token = $2 WHERE id = $1 AND group_token IS DISTINCT FROM $2', [listingId, best]);
    assigned += r.rowCount ?? 0;
  }
  return { groups: eligible.size, assigned };
}

/** Estatística do que mais aparece em "Outros" (inclusive o que ainda não virou grupo). */
export async function outrosStats(db: Db = pool, limit = 30) {
  const rows = await many<{ id: string; title: string }>(db,
    `SELECT id, title FROM listings WHERE category = 'outros' AND status IN ('active','paused','pending_checkout','sold') AND created_at > now() - make_interval(days => $1)`,
    [config.outrosGroupWindowDays]);
  const count = new Map<string, number>();
  for (const r of rows) for (const t of tokensOf(r.title)) count.set(t, (count.get(t) ?? 0) + 1);
  const groups = new Set((await many<{ token: string }>(db, "SELECT token FROM category_groups WHERE status <> 'hidden' AND total_count > 0")).map((g) => g.token));
  return {
    windowDays: config.outrosGroupWindowDays,
    minToGroup: config.outrosGroupMin,
    totalListings: rows.length,
    terms: [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit)
      .map(([term, n]) => ({ term, count: n, isGroup: groups.has(term) })),
  };
}
