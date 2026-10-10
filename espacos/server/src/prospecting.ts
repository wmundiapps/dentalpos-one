// Captação de anfitriões (equipe SpaceHour): busca empresas na base pública da Receita
// Federal (carregada pelo importador do REVAH) e no Google Maps (Places API oficial),
// monta a lista e envia uma sequência de 3 e-mails B2B com clique rastreado e
// descadastro em um clique (LGPD: legítimo interesse, dados públicos de CNPJ, opt-out).
// Env: GOOGLE_PLACES_API_KEY (busca no Maps), APP_URL, ADMIN_EMAILS (aviso de lead quente).
import { createHash } from 'node:crypto';
import ExcelJS from 'exceljs';
import { id, one, pool, rows, token } from './db.js';
import { HttpError, adminEmails } from './auth.js';
import { SUPPORT_EMAIL, sendMail } from './mailer.js';

// ───────────── Segmentos (CNAE) de quem costuma ter sala ou horário ocioso ─────────────
export const SEGMENTS: Array<{ id: string; label: string; cnaes: string[]; maps: string }> = [
  { id: 'odonto', label: 'Clínicas odontológicas', cnaes: ['8630504'], maps: 'clínica odontológica' },
  { id: 'medico', label: 'Clínicas médicas', cnaes: ['8630501', '8630502', '8630503'], maps: 'clínica médica' },
  { id: 'psico', label: 'Psicologia', cnaes: ['8650003'], maps: 'consultório de psicologia' },
  { id: 'fisio', label: 'Fisioterapia', cnaes: ['8650004'], maps: 'clínica de fisioterapia' },
  { id: 'nutri', label: 'Nutrição', cnaes: ['8650002'], maps: 'consultório de nutrição' },
  { id: 'fono', label: 'Fonoaudiologia e terapia ocupacional', cnaes: ['8650006', '8650005'], maps: 'fonoaudiologia' },
  { id: 'estetica', label: 'Estética', cnaes: ['9602502'], maps: 'clínica de estética' },
  { id: 'coworking', label: 'Coworking e escritórios compartilhados', cnaes: ['8211300'], maps: 'coworking' },
  { id: 'imobiliaria', label: 'Imobiliárias e administradoras (salas vagas)', cnaes: ['6821802', '6822600'], maps: 'imobiliária salas comerciais' },
  { id: 'advocacia', label: 'Escritórios de advocacia', cnaes: ['6911701'], maps: 'escritório de advocacia' },
];

const WEBMAIL = /@(gmail|googlemail|hotmail|outlook|live|msn|yahoo|ymail|icloud|me|uol|bol|terra|ig|globo|r7|zipmail)\.(com|com\.br)$/i;
export const isWebmail = (email?: string | null) => !!email && WEBMAIL.test(email.trim());
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const cleanEmail = (e?: string | null) => {
  const v = e?.trim().toLowerCase();
  return v && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null;
};

// ───────────── Telefone e "não quero receber" (bloqueio permanente por hash) ─────────────
/** Só dígitos, sem o 55 do país. */
export function normPhone(phone?: string | null) {
  let d = (phone ?? '').replace(/\D/g, '');
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
  return d.length >= 10 && d.length <= 11 ? fixOldMobile(d) : null;
}
/** A Receita guarda muito celular antigo sem o 9 (DDD + 8 dígitos começando em 6 a 9). */
export function fixOldMobile(d: string) {
  return d.length === 10 && '6789'.includes(d[2]) ? `${d.slice(0, 2)}9${d.slice(2)}` : d;
}
export const isMobile = (d?: string | null) => !!d && d.length === 11 && d[2] === '9';

type BlockKind = 'cnpj' | 'phone' | 'email';
/** Mesmo cálculo da migração 018 (sha256 de 'tipo:valor'): bloqueia sem guardar o dado. */
export function blockHash(kind: BlockKind, value: string) {
  const v = kind === 'email' ? value.trim().toLowerCase() : value.replace(/\D/g, '');
  return createHash('sha256').update(`${kind}:${v}`).digest('hex');
}
function hashesOf(c: { cnpj?: string | null; phone?: string | null; email?: string | null }) {
  const out: Array<{ kind: BlockKind; hash: string }> = [];
  if (c.cnpj && /^\d{14}$/.test(c.cnpj.replace(/\D/g, ''))) out.push({ kind: 'cnpj', hash: blockHash('cnpj', c.cnpj) });
  const ph = normPhone(c.phone);
  if (ph) out.push({ kind: 'phone', hash: blockHash('phone', ph) });
  if (c.email?.trim()) out.push({ kind: 'email', hash: blockHash('email', c.email) });
  return out;
}
async function blockedHashes(hashes: string[]) {
  if (!hashes.length) return new Set<string>();
  return new Set((await rows<{ hash: string }>(pool, 'SELECT hash FROM prospect_blocklist WHERE hash = ANY($1)', [hashes])).map((r) => r.hash));
}
const cnpjOf = (c: { source: string; sourceRef?: string | null; source_ref?: string | null }) => (c.source === 'receita' ? (c.sourceRef ?? c.source_ref ?? null) : null);

/** "Não quero receber": bloqueia para sempre (hash de CNPJ, telefone e e-mail) e apaga telefone e e-mail do registro. */
export async function optOut(prospectId: string, reason = 'unsubscribe') {
  const p = await one<{ id: string; source: string; source_ref: string | null; email: string | null; phone: string | null }>(pool,
    'SELECT id, source, source_ref, email, phone FROM prospects WHERE id = $1', [prospectId]);
  if (!p) return null;
  for (const h of hashesOf({ cnpj: cnpjOf(p), phone: p.phone, email: p.email })) {
    await pool.query('INSERT INTO prospect_blocklist (hash, kind, reason) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [h.hash, h.kind, reason]);
  }
  await pool.query("UPDATE prospects SET status = 'unsubscribed', email = NULL, phone = NULL WHERE id = $1", [p.id]);
  await event(p.id, 'unsubscribe', undefined, reason);
  return p;
}

export type Candidate = {
  source: 'receita' | 'maps' | 'csv' | 'manual'; sourceRef?: string; name: string; segment?: string;
  email?: string | null; phone?: string | null; website?: string | null; address?: string | null; city?: string | null; uf?: string | null;
  openedAt?: string | null; alreadyAdded?: boolean; webmail?: boolean;
};

// ───────────── Busca: Receita Federal ─────────────
export async function baseStatus() {
  const r = await one<{ n: number; month: string | null; with_email: number }>(pool,
    `SELECT count(*)::int AS n, max("refMonth") AS month, count(*) FILTER (WHERE "email" IS NOT NULL)::int AS with_email FROM "CompanyRecord"`);
  const last = await one<{ status: string; finished: Date | null; rows: number }>(pool,
    `SELECT "status" AS status, "finishedAt" AS finished, "rows" AS rows FROM "CompanyImport" ORDER BY "startedAt" DESC LIMIT 1`);
  return { companies: r?.n ?? 0, withEmail: r?.with_email ?? 0, refMonth: r?.month ?? null, lastImport: last ?? null };
}

export async function searchReceita(q: { segment?: string; cnaes?: string[]; city?: string; uf?: string; onlyWithEmail?: boolean; limit?: number }) {
  const cnaes = (q.cnaes?.length ? q.cnaes : SEGMENTS.find((s) => s.id === q.segment)?.cnaes ?? []).map((c) => c.replace(/\D/g, '')).filter(Boolean);
  if (!cnaes.length) throw new HttpError(422, 'prospect_segment_required');
  const where: string[] = [`(${cnaes.map((_, i) => `c."cnae" LIKE $${i + 1} || '%' OR c."cnaeSecondary" LIKE '%' || $${i + 1} || '%'`).join(' OR ')})`];
  const params: unknown[] = [...cnaes];
  if (q.uf) { params.push(q.uf.toUpperCase()); where.push(`c."uf" = $${params.length}`); }
  if (q.city) { params.push(norm(q.city)); where.push(`c."cityNorm" = $${params.length}`); }
  if (q.onlyWithEmail) where.push(`c."email" IS NOT NULL`);
  params.push(Math.min(Math.max(q.limit ?? 100, 1), 500));
  const list = await rows<Record<string, string | null>>(pool,
    `SELECT c.*, EXISTS (SELECT 1 FROM prospects p WHERE p.source = 'receita' AND p.source_ref = c."cnpj") AS added
       FROM "CompanyRecord" c WHERE ${where.join(' AND ')}
      ORDER BY (c."email" IS NULL), c."openedAt" DESC NULLS LAST LIMIT $${params.length}`, params);
  const segment = q.segment ? SEGMENTS.find((s) => s.id === q.segment)?.label : undefined;
  const blocked = await blockedHashes(list.flatMap((c) => hashesOf({ cnpj: c.cnpj, phone: c.phone, email: c.email }).map((h) => h.hash)));
  return list.filter((c) => !hashesOf({ cnpj: c.cnpj, phone: c.phone, email: c.email }).some((h) => blocked.has(h.hash))).map<Candidate>((c) => ({
    source: 'receita', sourceRef: c.cnpj!, name: c.tradeName || c.legalName || `CNPJ ${c.cnpj}`, segment,
    email: cleanEmail(c.email), phone: normPhone(c.phone) ?? c.phone, address: [c.address, c.district].filter(Boolean).join(', ') || null,
    city: c.city, uf: c.uf, openedAt: c.openedAt, alreadyAdded: !!(c as unknown as { added: boolean }).added, webmail: isWebmail(c.email),
  }));
}

// ───────────── Busca: Google Maps (Places API oficial) ─────────────
type Place = { id: string; displayName?: { text: string }; formattedAddress?: string; nationalPhoneNumber?: string; internationalPhoneNumber?: string; websiteUri?: string; primaryTypeDisplayName?: { text: string } };
let placesFetch: typeof fetch = (...a) => fetch(...a);
export function setPlacesFetch(f?: typeof fetch) { placesFetch = f ?? ((...a) => fetch(...a)); }

export async function searchMaps(q: { query?: string; segment?: string; city: string; limit?: number }) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new HttpError(503, 'maps_not_configured');
  const what = q.query?.trim() || SEGMENTS.find((s) => s.id === q.segment)?.maps;
  if (!what || !q.city?.trim()) throw new HttpError(422, 'prospect_query_required');
  const max = Math.min(Math.max(q.limit ?? 60, 1), 60);
  const out: Place[] = [];
  let pageToken: string | undefined;
  do {
    const res = await placesFetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', 'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.primaryTypeDisplayName,nextPageToken',
      },
      body: JSON.stringify({ textQuery: `${what} em ${q.city}`, languageCode: 'pt-BR', regionCode: 'BR', pageSize: 20, ...(pageToken ? { pageToken } : {}) }),
    });
    if (!res.ok) throw new HttpError(502, 'maps_error', { status: res.status });
    const body = await res.json() as { places?: Place[]; nextPageToken?: string };
    out.push(...(body.places ?? []));
    pageToken = body.nextPageToken;
  } while (pageToken && out.length < max);
  const ids = out.map((p) => p.id);
  const added = new Set((await rows<{ source_ref: string }>(pool, "SELECT source_ref FROM prospects WHERE source = 'maps' AND source_ref = ANY($1)", [ids])).map((r) => r.source_ref));
  return out.slice(0, max).map<Candidate>((p) => ({
    source: 'maps', sourceRef: p.id, name: p.displayName?.text ?? 'Sem nome', segment: p.primaryTypeDisplayName?.text ?? what,
    phone: p.nationalPhoneNumber ?? p.internationalPhoneNumber ?? null, website: p.websiteUri ?? null, address: p.formattedAddress ?? null,
    city: q.city, alreadyAdded: added.has(p.id), email: null,
  }));
}

// ───────────── Lista ─────────────
export async function addProspects(items: Candidate[], userId?: string) {
  let added = 0;
  let blocked = 0;
  const hashes = items.map((c) => hashesOf({ cnpj: cnpjOf(c), phone: c.phone, email: c.email }));
  const isBlocked = await blockedHashes(hashes.flat().map((h) => h.hash));
  for (const [i, c] of items.entries()) {
    if (hashes[i].some((h) => isBlocked.has(h.hash))) { blocked++; continue; } // pediu para sair: nunca volta
    const phone = normPhone(c.phone) ?? c.phone?.trim() ?? null;
    const r = await pool.query(
      `INSERT INTO prospects (id, source, source_ref, name, segment, email, phone, website, address, city, uf, token, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT DO NOTHING`,
      [id('prs'), c.source, c.sourceRef ?? null, c.name.slice(0, 200), c.segment?.slice(0, 120) ?? null, cleanEmail(c.email),
        phone?.slice(0, 40) ?? null, c.website?.slice(0, 300) ?? null, c.address?.slice(0, 300) ?? null, c.city?.slice(0, 120) ?? null,
        c.uf?.slice(0, 2).toUpperCase() ?? null, token(), userId ?? null]);
    added += r.rowCount ?? 0;
  }
  return { added, skipped: items.length - added - blocked, blocked };
}

export async function listProspects(q: { status?: string; q?: string; limit?: number }) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (q.status) { params.push(q.status); where.push(`status = $${params.length}`); }
  if (q.q) { params.push(`%${q.q.trim().toLowerCase()}%`); where.push(`(lower(name) LIKE $${params.length} OR lower(coalesce(email,'')) LIKE $${params.length} OR lower(coalesce(city,'')) LIKE $${params.length})`); }
  params.push(Math.min(q.limit ?? 300, 1000));
  return rows(pool, `SELECT * FROM prospects ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY (status = 'hot') DESC, created_at DESC LIMIT $${params.length}`, params);
}

export async function stats() {
  const byStatus = await rows<{ status: string; n: number }>(pool, 'SELECT status, count(*)::int AS n FROM prospects GROUP BY status');
  const ev = await one<{ sent_today: number; sent_7d: number; clicks_7d: number }>(pool,
    `SELECT count(*) FILTER (WHERE type = 'sent' AND (created_at AT TIME ZONE 'America/Sao_Paulo')::date = (now() AT TIME ZONE 'America/Sao_Paulo')::date)::int AS sent_today,
            count(*) FILTER (WHERE type = 'sent' AND created_at > now() - interval '7 days')::int AS sent_7d,
            count(*) FILTER (WHERE type = 'click' AND created_at > now() - interval '7 days')::int AS clicks_7d
       FROM prospect_events`);
  return { byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r.n])), ...ev };
}

export type ProspectConfig = { sending_enabled: boolean; daily_limit: number; step2_after_days: number; step3_after_days: number; send_to_webmail: boolean };
export const getConfig = async () => (await one<ProspectConfig>(pool, 'SELECT sending_enabled, daily_limit, step2_after_days, step3_after_days, send_to_webmail FROM prospect_config WHERE id = 1'))!;
export async function setConfig(c: Partial<ProspectConfig>) {
  const cur = await getConfig();
  const n = { ...cur, ...c };
  await pool.query(`UPDATE prospect_config SET sending_enabled=$1, daily_limit=$2, step2_after_days=$3, step3_after_days=$4, send_to_webmail=$5, updated_at=now() WHERE id = 1`,
    [n.sending_enabled, n.daily_limit, n.step2_after_days, n.step3_after_days, n.send_to_webmail]);
  return getConfig();
}

async function event(prospectId: string, type: string, step?: number, detail?: string) {
  await pool.query('INSERT INTO prospect_events (id, prospect_id, type, step, detail) VALUES ($1,$2,$3,$4,$5)', [id('pev'), prospectId, type, step ?? null, detail?.slice(0, 500) ?? null]);
}

// ───────────── E-mails da sequência ─────────────
const OPERATOR = 'SpaceHour é operado pelo Instituto Ravel, CNPJ 03.162.275/0001-10';
const COMPANY = /\b(ltda|eireli|s\/?s|s\.?a\.?|me|epp|clinica|clínica|odonto\w*|centro|instituto|consult\w*|sociedade|servi[cç]os|sorriso|dental)\b/i;
const title = (s: string) => s.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
/** "Olá, Dr(a). Ana!" para pessoa; "Olá, equipe Clínica X!" para empresa. */
export function greeting(name: string) {
  const n = name.replace(/\s+/g, ' ').trim();
  return COMPANY.test(n) || !n ? `Olá, equipe ${title(n) || 'do consultório'}!` : `Olá, Dr(a). ${title(n.split(' ')[0])}!`;
}
const area = (segment: string | null) => (segment && !/odonto/i.test(segment) ? segment.toLowerCase() : 'odontologia');
const APP_URL = () => (process.env.APP_URL ?? 'https://space-hour.com').replace(/\/$/, '');
const API_URL = () => `${APP_URL()}/api`;
type P = { id: string; name: string; email: string; token: string; city: string | null; segment: string | null };

export function renderStep(p: P, step: 1 | 2 | 3) {
  const link = `${API_URL()}/p/c/${p.token}?s=${step}`;
  const out = `${API_URL()}/p/u/${p.token}`;
  const where = p.city ? ` em ${p.city}` : '';
  const copy = {
    1: {
      subject: `Seu consultório vazio pode gerar renda, ${p.name}`,
      body: `${greeting(p.name)}\n\nNotamos que a ${p.name} atua em ${area(p.segment)}${where}.\n\nNo SpaceHour, dentistas alugam consultórios equipados por hora, dia ou pacote mensal (até 3x por semana). Se você tem horários ociosos, cadastre o seu espaço de graça. Se precisa de um consultório sem montar o seu, encontre um perto de você.`,
      cta: 'Conhecer o SpaceHour',
    },
    2: {
      subject: `Quanto rende uma sala parada, ${p.name}?`,
      body: `Olá de novo!\n\nUma conta rápida: 12 horas vagas por semana a R$ 60/h são cerca de R$ 2.880 por mês que hoje ficam na mesa.\n\nNo SpaceHour vocês escolhem quais horários liberar, aprovam (ou não) cada reserva e recebem automaticamente. Também dá para oferecer pacotes de até 3 dias por semana para quem atende com frequência.`,
      cta: 'Simular e anunciar grátis',
    },
    3: {
      subject: 'Último contato do SpaceHour',
      body: `Olá!\n\nEste é o nosso último e-mail. Se em algum momento fizer sentido transformar horários ociosos em renda, o SpaceHour estará aqui: anúncio grátis, sem mensalidade e com profissionais verificados.\n\nSe quiser conversar, é só responder este e-mail.`,
      cta: 'Ver o SpaceHour',
    },
  }[step];
  const why = `${OPERATOR}. Você recebeu este e-mail porque o contato da empresa consta em cadastro público (dados abertos de CNPJ da Receita Federal ou perfil comercial) e oferecemos um serviço B2B relacionado à atividade de vocês.`;
  const text = `${copy.body}\n\n${copy.cta}: ${link}\n\n— Equipe SpaceHour · ${SUPPORT_EMAIL()}\n\n${why}\nNão quer mais receber? ${out}`;
  const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#1f2937">
<h2 style="color:#0f766e;margin:0 0 16px">SpaceHour</h2>
${copy.body.split('\n\n').map((par) => `<p style="font-size:15px;line-height:1.55;margin:0 0 14px">${esc(par).replace(/\n/g, '<br>')}</p>`).join('')}
<p style="margin:20px 0"><a href="${link}" style="display:inline-block;background:#0f766e;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">${copy.cta}</a></p>
<p style="font-size:14px;color:#374151">Equipe SpaceHour · <a href="mailto:${SUPPORT_EMAIL()}">${SUPPORT_EMAIL()}</a></p>
<p style="font-size:12px;color:#6b7280;margin-top:24px">${esc(why)}<br><a href="${out}" style="color:#6b7280">Não quero mais receber</a></p></div>`;
  return { subject: copy.subject, text, html, unsubscribe: out };
}

async function sendStep(p: P, step: 1 | 2 | 3, to = p.email) {
  const m = renderStep(p, step);
  await sendMail({
    to, subject: m.subject, text: m.text, html: m.html,
    headers: { 'List-Unsubscribe': `<${m.unsubscribe}>, <mailto:${SUPPORT_EMAIL()}?subject=descadastrar>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  });
}

export async function sendTest(to: string, step: 1 | 2 | 3) {
  await sendStep({ id: 'teste', name: 'Clínica Exemplo', email: to, token: 'teste', city: 'Maringá', segment: null }, step, to);
}

/** Quem virou cadastro no SpaceHour sai da sequência como "convertido". */
async function markConversions() {
  const r = await pool.query(`UPDATE prospects p SET status = 'converted' FROM users u
     WHERE p.email IS NOT NULL AND lower(u.email) = lower(p.email) AND p.status NOT IN ('converted','unsubscribed','bounced','excluded')`);
  return r.rowCount ?? 0;
}

/** Rotina: envia os próximos e-mails respeitando o limite diário (horário de Brasília). */
export async function runSequence({ dryRun = false, now = new Date() } = {}) {
  const cfg = await getConfig();
  const converted = await markConversions();
  if (!cfg.sending_enabled && !dryRun) return { enabled: false, sent: 0, converted };
  // Só em horário comercial (seg a sex, 9h às 18h de Brasília) e aos poucos (até 5 por rodada de 5 min)
  const brt = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const business = brt.getDay() >= 1 && brt.getDay() <= 5 && brt.getHours() >= 9 && brt.getHours() < 18;
  if (!business && !dryRun) return { enabled: true, sent: 0, converted, outsideHours: true };
  const sentToday = (await one<{ n: number }>(pool,
    `SELECT count(*)::int AS n FROM prospect_events WHERE type = 'sent'
       AND (created_at AT TIME ZONE 'America/Sao_Paulo')::date = ($1::timestamptz AT TIME ZONE 'America/Sao_Paulo')::date`, [now]))!.n;
  const room = Math.max(0, Math.min(cfg.daily_limit - sentToday, dryRun ? 60 : 5));
  if (!room) return { enabled: true, sent: 0, converted, room: 0 };
  // Prioridade: terminar quem já começou (passo 3, depois 2), depois os novos
  const due = await rows<P & { last_step: number }>(pool,
    `SELECT p.id, p.name, p.email, p.token, p.city, p.segment, p.last_step FROM prospects p
      WHERE p.email IS NOT NULL AND ($2 OR NOT (p.email ~* $3))
        AND NOT EXISTS (SELECT 1 FROM prospect_blocklist b WHERE b.hash = encode(sha256(convert_to('email:' || lower(trim(p.email)), 'UTF8')), 'hex'))
        AND ((p.status = 'new' AND p.last_step = 0)
          OR (p.status = 'in_sequence' AND p.last_step = 1 AND p.last_sent_at <= $1::timestamptz - make_interval(days => $4))
          OR (p.status = 'in_sequence' AND p.last_step = 2 AND p.last_sent_at <= $1::timestamptz - make_interval(days => $5)))
      ORDER BY p.last_step DESC, p.created_at LIMIT $6`,
    [now, cfg.send_to_webmail, WEBMAIL.source, cfg.step2_after_days, cfg.step3_after_days, room]);
  if (dryRun) return { enabled: cfg.sending_enabled, dryRun: true, wouldSend: due.map((p) => ({ id: p.id, name: p.name, email: p.email, step: p.last_step + 1 })), converted, room };
  let sent = 0;
  for (const p of due) {
    const step = (p.last_step + 1) as 1 | 2 | 3;
    try {
      await sendStep(p, step);
      await pool.query(`UPDATE prospects SET last_step = $2, last_sent_at = $3, first_sent_at = coalesce(first_sent_at, $3),
          status = CASE WHEN status = 'hot' THEN status WHEN $2 >= 3 THEN 'done' ELSE 'in_sequence' END WHERE id = $1`, [p.id, step, now]);
      await event(p.id, 'sent', step);
      sent++;
    } catch (e) {
      await event(p.id, 'error', step, (e as Error).message);
    }
  }
  return { enabled: true, sent, converted, room };
}

// ───────────── Clique e descadastro (públicos) ─────────────
export async function handleClick(tok: string, step?: number) {
  const p = await one<{ id: string; name: string; email: string | null; phone: string | null; city: string | null; status: string }>(pool,
    'SELECT id, name, email, phone, city, status FROM prospects WHERE token = $1', [tok]);
  const dest = step === 0
    ? `${APP_URL()}/anuncie?utm_source=prospeccao&utm_medium=whatsapp&utm_campaign=convite`
    : `${APP_URL()}/anuncie?utm_source=prospeccao&utm_medium=email&utm_campaign=passo${step ?? 1}`;
  if (!p) return dest;
  await event(p.id, 'click', step);
  if (!['converted', 'unsubscribed', 'hot'].includes(p.status)) {
    await pool.query("UPDATE prospects SET status = 'hot', hot_at = now() WHERE id = $1", [p.id]);
    const to = adminEmails()[0];
    if (to) await sendMail({
      to, subject: `🔥 Lead quente na captação: ${p.name}`,
      text: `${p.name}${p.city ? ` (${p.city})` : ''} clicou no ${step === 0 ? 'convite de WhatsApp' : `e-mail da captação (passo ${step ?? 1})`}.\nE-mail: ${p.email ?? '—'}\nTelefone: ${p.phone ?? '—'}\n\nVale um contato hoje: ${APP_URL()}/admin`,
    }).catch(() => undefined);
  }
  return dest;
}

export async function unsubscribe(tok: string) {
  const p = await one<{ id: string }>(pool, 'SELECT id FROM prospects WHERE token = $1', [tok]);
  if (!p) return null;
  return (await optOut(p.id, 'unsubscribe'))?.email ?? null;
}

export function esc(s: string) {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
}

// ───────────── Convite por WhatsApp (link controlado) e planilha Excel ─────────────
export const WA_DAILY_LIMIT = () => Number(process.env.WA_DAILY_LIMIT ?? 30);
/** Convites só entre 8h e 21h (horário de Brasília). */
export function insideWhatsAppWindow(now = new Date()) {
  const h = Number(new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hourCycle: 'h23' }).format(now));
  return h >= 8 && h < 21;
}
export function whatsappText(p: { name: string; token: string }) {
  return [
    `${greeting(p.name)} Sou do SpaceHour, plataforma brasileira de aluguel de consultórios por hora.`,
    'Se o seu consultório fica com horários vagos, dá para alugar esses horários para outros dentistas, com pagamento garantido e sem exclusividade.',
    `Cadastro gratuito: ${API_URL()}/p/c/${p.token}?s=0`,
    '',
    `Se não quiser mais receber, responda SAIR ou acesse ${API_URL()}/p/u/${p.token}`,
  ].join('\n');
}
export const waLink = (tok: string) => `${API_URL()}/p/w/${tok}`;

/**
 * Clique no número (lista ou Excel): confere horário, limite do dia, "não quero receber" e um convite
 * por pessoa; só então devolve o wa.me com o texto pronto. Até um Excel antigo respeita quem saiu.
 */
export async function whatsappInvite(tok: string, now = new Date()): Promise<{ url: string } | { error: string }> {
  if (!insideWhatsAppWindow(now)) return { error: 'Convites só entre 8h e 21h (horário de Brasília).' };
  const p = await one<{ id: string; name: string; phone: string | null; token: string; status: string; wa_invited_at: Date | null; source: string; source_ref: string | null; email: string | null }>(pool,
    'SELECT id, name, phone, token, status, wa_invited_at, source, source_ref, email FROM prospects WHERE token = $1', [tok]);
  if (!p || ['unsubscribed', 'excluded'].includes(p.status)) return { error: 'Este contato pediu para não receber mensagens.' };
  const phone = normPhone(p.phone);
  if (!isMobile(phone)) return { error: 'Este contato não tem celular (WhatsApp).' };
  const blocked = await blockedHashes(hashesOf({ cnpj: cnpjOf(p), phone, email: p.email }).map((h) => h.hash));
  if (blocked.size) { await optOut(p.id, 'blocklist'); return { error: 'Este contato pediu para não receber mensagens.' }; }
  if (p.wa_invited_at) return { error: `Este contato já foi convidado em ${p.wa_invited_at.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}. Um convite por pessoa.` };
  const today = (await one<{ n: number }>(pool,
    `SELECT count(*)::int AS n FROM prospects WHERE (wa_invited_at AT TIME ZONE 'America/Sao_Paulo')::date = ($1::timestamptz AT TIME ZONE 'America/Sao_Paulo')::date`, [now]))!.n;
  if (today >= WA_DAILY_LIMIT()) return { error: `Limite de ${WA_DAILY_LIMIT()} convites por dia atingido. Muitos convites seguidos fazem o WhatsApp bloquear o número.` };
  // Trava contra clique duplo: só um convite passa
  const claimed = await pool.query('UPDATE prospects SET wa_invited_at = $2 WHERE id = $1 AND wa_invited_at IS NULL', [p.id, now]);
  if (claimed.rowCount !== 1) return { error: 'Este contato acabou de ser convidado.' };
  await event(p.id, 'wa_invite');
  return { url: `https://wa.me/55${phone}?text=${encodeURIComponent(whatsappText(p))}` };
}

type ExportRow = { id: string; name: string; segment: string | null; city: string | null; uf: string | null; phone: string | null; email: string | null; source: string; source_ref: string | null; status: string; token: string; wa_invited_at: Date | null; last_step: number };
const STATUS_PT: Record<string, string> = { new: 'Nova', in_sequence: 'Em contato', done: 'Sequência concluída', hot: 'Quente', replied: 'Respondeu', converted: 'Cadastrou', bounced: 'E-mail inválido' };

/** Excel da captação (nunca inclui quem saiu); ?amostra=N traz até N por segmento, ainda não convidados e com celular. Grava auditoria. */
export async function exportXlsx(q: { status?: string; sample?: number; userId: string; ip?: string }) {
  const where = [`status NOT IN ('unsubscribed','excluded')`];
  const params: unknown[] = [];
  if (q.status) { params.push(q.status); where.push(`status = $${params.length}`); }
  let list = await rows<ExportRow>(pool,
    `SELECT id, name, segment, city, uf, phone, email, source, source_ref, status, token, wa_invited_at, last_step FROM prospects
      WHERE ${where.join(' AND ')} ORDER BY segment NULLS LAST, city NULLS LAST, name LIMIT 5000`, params);
  if (q.sample) {
    const bySeg = new Map<string, ExportRow[]>();
    for (const r of list.filter((r) => !r.wa_invited_at && isMobile(normPhone(r.phone)))) bySeg.set(r.segment ?? '', [...(bySeg.get(r.segment ?? '') ?? []), r]);
    list = [...bySeg.values()].flatMap((l) => l.map((r) => ({ r, k: Math.random() })).sort((a, b) => a.k - b.k).slice(0, q.sample).map((x) => x.r));
  }
  await pool.query('INSERT INTO prospect_exports (id, user_id, format, filters, rows, ip) VALUES ($1,$2,$3,$4,$5,$6)',
    [id('pex'), q.userId, 'xlsx', JSON.stringify({ status: q.status ?? null, sample: q.sample ?? null }), list.length, q.ip?.slice(0, 80) ?? null]);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'SpaceHour';
  const ws = wb.addWorksheet('Captação', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'Nome', key: 'name', width: 38 }, { header: 'Segmento', key: 'segment', width: 24 }, { header: 'Cidade', key: 'city', width: 18 },
    { header: 'UF', key: 'uf', width: 5 }, { header: 'WhatsApp (clique para convidar)', key: 'wa', width: 30 }, { header: 'Situação', key: 'status', width: 16 },
    { header: 'Convidado em', key: 'invited', width: 14 }, { header: 'E-mail', key: 'email', width: 30 }, { header: 'CNPJ', key: 'cnpj', width: 20 },
  ];
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
  for (const r of list) {
    const cnpj = cnpjOf(r);
    const row = ws.addRow({
      name: r.name, segment: r.segment ?? '', city: r.city ?? '', uf: r.uf ?? '', status: STATUS_PT[r.status] ?? r.status,
      invited: r.wa_invited_at ?? null, email: r.email ?? '', cnpj: cnpj ? cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : '',
    });
    const cell = row.getCell('wa');
    const ph = normPhone(r.phone);
    if (isMobile(ph)) {
      cell.value = { text: ph!.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3'), hyperlink: waLink(r.token) };
      cell.font = { color: { argb: 'FF0F766E' }, underline: true, bold: true };
    } else {
      cell.value = ph ? `${ph.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3')} (fixo)` : 'sem telefone';
      cell.font = { color: { argb: 'FF888888' } };
    }
    row.getCell('invited').numFmt = 'dd/mm/yyyy';
  }
  ws.autoFilter = { from: 'A1', to: 'I1' };
  const info = wb.addWorksheet('Como usar');
  info.getColumn(1).width = 110;
  for (const line of [
    'Clique no número (coluna WhatsApp). Abre a conversa com o convite já escrito: confira e toque em enviar.',
    'Um convite por pessoa. Os links só funcionam entre 8h e 21h (horário de Brasília).',
    `Quem responder SAIR: marque "Não quer" na aba Captação do admin. O contato nunca mais recebe mensagem.`,
    `Envie no máximo ${WA_DAILY_LIMIT()} por dia, de um número só para convites: muitos envios seguidos fazem o WhatsApp bloquear o número.`,
    'Números marcados como (fixo) não têm WhatsApp. Esta planilha tem dados de contato: não repasse e apague depois de usar.',
  ]) info.addRow([line]);
  return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), rows: list.length };
}
