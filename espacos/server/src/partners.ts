// Parceiros do SpaceHour: Corretor Parceiro (capta o espaço e recebe a chancela do anúncio) e Zelador
// Parceiro (entrega o acesso, vistoria a entrada e a saída com fotos e atende durante a reserva).
// Regras (shared/rules.ts PARTNER_RULES e docs/legal/pt-BR/partner-*.md):
// - só empresas (CNPJ, PJ–PJ); cadastro aprovado pela equipe; corretor só com CRECI; aceite dos termos com data, IP e versão;
// - vínculo com o anúncio sempre com o "sim" das duas partes (anfitrião e parceiro);
// - taxas pagas pelo locatário, uma por reserva; o SpaceHour repassa até o dia 10 do mês seguinte ao check-out,
//   descontado o que voltou ao locatário em cancelamento;
// - o parceiro só vê dados do locatário das reservas pagas em que é parceiro, até 90 dias após o check-out.
import { HttpError, adminEmails } from './auth.js';
import { id, nowIso, one, pool, rows, token, withTx, type Db } from './db.js';
import { notify } from './notify.js';
import { queueInstant, telegramStartLink } from './messaging.js';
import { SUPPORT_EMAIL } from './mailer.js';
import * as repo from './repo.js';
import { PARTNER_RULES, RULES_VERSION, occurrenceEndUtc } from '../../shared/rules.js';
import type { Booking, Listing, PartnerRole, User } from '../../shared/types.js';

export const PARTNER_TERMS_VERSION = '2026-11-20';
const APP_URL = () => (process.env.APP_URL ?? 'https://space-hour.com').replace(/\/$/, '');
const ROLE_LABEL: Record<PartnerRole, string> = { broker: 'Corretor Parceiro', caretaker: 'Zelador Parceiro' };
const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const digits = (s?: string | null) => (s ?? '').replace(/\D/g, '');

export interface PartnerRow {
  user_id: string; roles: PartnerRole[]; status: 'pending' | 'approved' | 'rejected' | 'suspended'; tax_id: string; phone: string;
  creci: string | null; creci_uf: string | null; pix_key: string; cities: string; about: string | null; ref_code: string;
  telegram_chat_id: string | null; telegram_link_token: string | null; terms_version: string; terms_accepted_at: Date;
  decided_at: Date | null; decision_note: string | null; created_at: Date;
}
export interface LinkRow {
  id: string; listing_id: string; user_id: string; role: PartnerRole; status: 'pending_host' | 'pending_partner' | 'active' | 'ended' | 'declined';
  caretaker_fee: number | null; can_edit: boolean; origin: string; created_by: string; created_at: Date; accepted_at: Date | null;
  end_requested_at: Date | null; ends_at: Date | null; ended_at: Date | null; end_reason: string | null;
}

/** CPF/CNPJ com dígitos verificadores corretos. */
export function validTaxId(v: string) {
  const d = digits(v);
  if (/^(\d)\1+$/.test(d)) return false;
  const calc = (base: string, weights: number[]) => {
    const s = base.split('').reduce((acc, n, i) => acc + Number(n) * weights[i], 0) % 11;
    return s < 2 ? 0 : 11 - s;
  };
  if (d.length === 11) {
    const w = (n: number) => Array.from({ length: n }, (_, i) => n + 1 - i);
    return calc(d.slice(0, 9), w(9)) === Number(d[9]) && calc(d.slice(0, 10), w(10)) === Number(d[10]);
  }
  if (d.length === 14) {
    const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const w2 = [6, ...w1];
    return calc(d.slice(0, 12), w1) === Number(d[12]) && calc(d.slice(0, 13), w2) === Number(d[13]);
  }
  return false;
}

export const getPartner = (db: Db, userId: string) => one<PartnerRow>(db, 'SELECT * FROM partners WHERE user_id = $1', [userId]);
const isApproved = (p: PartnerRow | undefined, role: PartnerRole) => !!p && p.status === 'approved' && p.roles.includes(role);

async function tellAdmins(db: Db, kind: string, text: string, link: string) {
  const team = adminEmails().length ? adminEmails() : [SUPPORT_EMAIL()];
  for (const email of team) await notify(db, { email }, kind, text, link);
}

// ───────────── Cadastro ─────────────
export interface PartnerInput {
  roles: PartnerRole[]; taxId: string; phone: string; creci?: string; creciUf?: string; pixKey: string; cities: string; about?: string;
  acceptTerms: boolean;
}

export async function registerPartner(user: User, input: PartnerInput, ip?: string) {
  if (!input.acceptTerms) throw new HttpError(422, 'partner_terms_required');
  const roles = [...new Set(input.roles)].filter((r): r is PartnerRole => r === 'broker' || r === 'caretaker');
  if (!roles.length) throw new HttpError(422, 'partner_role_required');
  // Parceria sempre entre empresas (PJ–PJ): só CNPJ (empresa ou MEI), mesmo para corretor
  if (digits(input.taxId).length !== 14) throw new HttpError(422, 'partner_cnpj_required');
  if (!validTaxId(input.taxId)) throw new HttpError(422, 'partner_invalid_tax_id');
  const phone = digits(input.phone).replace(/^55(?=\d{10,11}$)/, '');
  if (phone.length !== 11 || phone[2] !== '9') throw new HttpError(422, 'partner_invalid_phone');
  // Intermediação imobiliária é privativa de corretor inscrito no CRECI (Lei 6.530/78, art. 3º)
  const creci = input.creci?.trim().toUpperCase().replace(/[^0-9A-Z-]/g, '') || null;
  const creciUf = input.creciUf?.trim().toUpperCase().slice(0, 2) || null;
  if (roles.includes('broker') && (!creci || !creciUf || creci.replace(/\D/g, '').length < 3)) throw new HttpError(422, 'partner_creci_required');
  if (input.pixKey.trim().length < 5) throw new HttpError(422, 'partner_pix_required');
  return withTx(async (tx) => {
    const cur = await getPartner(tx, user.id);
    if (cur?.status === 'suspended' || cur?.status === 'rejected') throw new HttpError(409, 'partner_not_allowed');
    // Mudou o CPF/CNPJ, a chave Pix, o CRECI ou pediu um papel novo: volta para análise
    const review = !cur || roles.some((r) => !cur.roles.includes(r)) || cur.tax_id !== digits(input.taxId) || cur.pix_key !== input.pixKey.trim() || cur.creci !== creci;
    const status = review ? 'pending' : cur!.status;
    await tx.query(
      `INSERT INTO partners (user_id, roles, status, tax_id, phone, creci, creci_uf, pix_key, cities, about, ref_code, terms_version, terms_accepted_at, terms_ip)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now(),$13)
       ON CONFLICT (user_id) DO UPDATE SET roles = $2, status = $3, tax_id = $4, phone = $5, creci = $6, creci_uf = $7, pix_key = $8,
         cities = $9, about = $10, terms_version = $12, terms_accepted_at = now(), terms_ip = $13`,
      [user.id, roles, status, digits(input.taxId), phone, creci, creciUf, input.pixKey.trim().slice(0, 140), input.cities.trim().slice(0, 300),
        input.about?.trim().slice(0, 1000) || null, token().slice(0, 10).replace(/[-_]/g, 'x'), PARTNER_TERMS_VERSION, ip ?? null]);
    if (review) {
      await notify(tx, { userId: user.id }, 'partner_received',
        'Recebemos seu cadastro de parceiro SpaceHour. A equipe confere os dados (e o CRECI, se for corretor) em até 2 dias úteis e avisa você por e-mail.', '/parceiro');
      await tellAdmins(tx, 'admin_partner_signup',
        `Novo cadastro de parceiro: ${user.name} <${user.email}> — ${roles.map((r) => ROLE_LABEL[r]).join(' e ')}${creci ? ` · CRECI ${creci}/${creciUf}` : ''} · ${input.cities}.`, '/admin/parceiros');
    }
    if (status !== 'approved') await syncPartnerListings(tx, user.id);
    return (await getPartner(tx, user.id))!;
  });
}

export async function decidePartner(admin: User, userId: string, decision: 'approved' | 'rejected' | 'suspended', note?: string) {
  return withTx(async (tx) => {
    const p = await getPartner(tx, userId);
    if (!p) throw new HttpError(404, 'not_found');
    await tx.query('UPDATE partners SET status = $2, decided_by = $3, decided_at = now(), decision_note = $4 WHERE user_id = $1', [userId, decision, admin.id, note?.slice(0, 500) ?? null]);
    if (decision === 'suspended') {
      // Suspenso: sai dos anúncios na hora e os valores ainda não pagos ficam retidos para análise
      await tx.query("UPDATE listing_partners SET status = 'ended', ended_at = now(), end_reason = 'partner_suspended' WHERE user_id = $1 AND status IN ('pending_host','pending_partner','active')", [userId]);
      await tx.query("UPDATE partner_earnings SET status = 'blocked', note = 'parceiro suspenso' WHERE user_id = $1 AND status IN ('held','due')", [userId]);
    }
    await syncPartnerListings(tx, userId);
    const text = decision === 'approved'
      ? 'Seu cadastro de parceiro SpaceHour foi aprovado! 🎉 No Painel do parceiro você encontra seu link de indicação, liga os avisos pelo Telegram e pede vínculo com os espaços que você atende.'
      : decision === 'rejected'
        ? `Seu cadastro de parceiro SpaceHour não foi aprovado${note ? `: ${note}` : '.'} Dúvidas: ${SUPPORT_EMAIL()}.`
        : `Seu cadastro de parceiro SpaceHour foi suspenso${note ? `: ${note}` : '.'} Você tem 48 h para apresentar sua defesa pelo e-mail ${SUPPORT_EMAIL()}.`;
    await notify(tx, { userId }, `partner_${decision}`, text, '/parceiro');
    return (await getPartner(tx, userId))!;
  });
}

export const listPartners = (status?: string) => rows(pool,
  `SELECT p.*, u.name, u.email, (SELECT count(*)::int FROM listing_partners lp WHERE lp.user_id = p.user_id AND lp.status = 'active') AS active_links
     FROM partners p JOIN users u ON u.id = p.user_id ${status ? 'WHERE p.status = $1' : ''} ORDER BY (p.status = 'pending') DESC, p.created_at DESC LIMIT 500`,
  status ? [status] : []);

/** Indicação: guarda quem indicou o anfitrião (link /parceiros?ref=CODE ou /entrar?ref=CODE). */
export async function setReferral(db: Db, userId: string, refCode?: string) {
  if (!refCode || !/^[A-Za-z0-9]{6,12}$/.test(refCode)) return;
  const p = await one<{ user_id: string }>(db, "SELECT user_id FROM partners WHERE ref_code = $1 AND status = 'approved' AND 'broker' = ANY(roles)", [refCode]);
  if (p && p.user_id !== userId) await db.query('UPDATE users SET referred_by_partner = $2 WHERE id = $1 AND referred_by_partner IS NULL', [userId, p.user_id]);
}

// ───────────── Vínculo com o anúncio ─────────────
/** Copia no anúncio os parceiros ativos (o preço usa essas colunas). */
export async function syncListing(db: Db, listingId: string) {
  const active = await rows<{ role: PartnerRole; user_id: string; caretaker_fee: number | null }>(db,
    `SELECT lp.role, lp.user_id, lp.caretaker_fee FROM listing_partners lp JOIN partners p ON p.user_id = lp.user_id
      WHERE lp.listing_id = $1 AND lp.status = 'active' AND p.status = 'approved' AND lp.role = ANY(p.roles)`, [listingId]);
  const broker = active.find((a) => a.role === 'broker');
  const caretaker = active.find((a) => a.role === 'caretaker' && a.caretaker_fee);
  await db.query('UPDATE listings SET broker_id = $2, caretaker_id = $3, caretaker_fee = $4 WHERE id = $1',
    [listingId, broker?.user_id ?? null, caretaker?.user_id ?? null, caretaker?.caretaker_fee ?? null]);
}
async function syncPartnerListings(db: Db, userId: string) {
  const ids = await rows<{ listing_id: string }>(db,
    'SELECT DISTINCT listing_id FROM listing_partners WHERE user_id = $1 UNION SELECT id FROM listings WHERE broker_id = $1 OR caretaker_id = $1', [userId]);
  for (const r of ids) await syncListing(db, r.listing_id);
}

function checkFee(role: PartnerRole, fee?: number) {
  if (role !== 'caretaker') return null;
  if (fee == null || !Number.isFinite(fee) || fee < PARTNER_RULES.caretakerMinFee || fee > PARTNER_RULES.caretakerMaxFee) {
    throw new HttpError(422, 'partner_invalid_fee', { min: PARTNER_RULES.caretakerMinFee, max: PARTNER_RULES.caretakerMaxFee });
  }
  return Math.round(fee * 100) / 100;
}

/** Anfitrião convida um parceiro aprovado (pelo e-mail) para o anúncio. */
export async function hostInvite(host: User, listingId: string, input: { email: string; role: PartnerRole; caretakerFee?: number; canEdit?: boolean }) {
  return withTx(async (tx) => {
    const l = await repo.getListing(tx, listingId, true);
    if (!l || l.hostId !== host.id) throw new HttpError(403, 'forbidden');
    const target = await repo.getUserByEmail(tx, input.email);
    const p = target && (await getPartner(tx, target.id));
    if (!target || !isApproved(p, input.role)) throw new HttpError(404, 'partner_not_found');
    if (target.id === host.id) throw new HttpError(422, 'partner_self');
    const fee = checkFee(input.role, input.caretakerFee);
    const link: LinkRow = await insertLink(tx, { listingId, userId: target.id, role: input.role, status: 'pending_partner', fee, canEdit: !!input.canEdit, origin: 'host_invite', by: host.id });
    const msg = `${host.name} convidou você para ser ${ROLE_LABEL[input.role]} do espaço "${l.title}" (${l.city})${fee ? `, com taxa de atendimento de ${brl(fee)} por reserva` : ''}. Aceite ou recuse no Painel do parceiro.`;
    await notify(tx, { userId: target.id }, 'partner_invite', msg, '/parceiro');
    await queueInstant(tx, target.id, `SpaceHour: ${msg} ${APP_URL()}/parceiro`);
    return link;
  });
}

/** Parceiro pede vínculo com um anúncio (o anfitrião aceita ou recusa). */
export async function partnerRequest(user: User, listingId: string, input: { role: PartnerRole; caretakerFee?: number }) {
  return withTx(async (tx) => {
    const p = await getPartner(tx, user.id);
    if (!isApproved(p, input.role)) throw new HttpError(403, 'partner_not_approved');
    const l = await repo.getListing(tx, listingId);
    if (!l) throw new HttpError(404, 'listing_not_found');
    if (l.hostId === user.id) throw new HttpError(422, 'partner_self');
    const fee = checkFee(input.role, input.caretakerFee);
    const link = await insertLink(tx, { listingId, userId: user.id, role: input.role, status: 'pending_host', fee, canEdit: false, origin: 'partner_request', by: user.id });
    await notify(tx, { userId: l.hostId }, 'partner_request',
      `${user.name} (${ROLE_LABEL[input.role]}${p!.creci ? `, CRECI ${p!.creci}/${p!.creci_uf}` : ''}) pediu para ser parceiro do seu espaço "${l.title}"${fee ? ` com taxa de atendimento de ${brl(fee)} por reserva, paga pelo locatário` : ''}. Aceite ou recuse em Painel do anfitrião → Meus anúncios → Parceiros.`,
      `/anfitriao/espacos/${l.id}#parceiros`);
    return link;
  });
}

/** Anúncio novo de quem veio pelo link de um corretor: o vínculo fica esperando o "sim" do anfitrião. */
export async function onListingCreated(db: Db, host: User, listing: Listing) {
  const r = await one<{ ref: string | null }>(db, 'SELECT referred_by_partner AS ref FROM users WHERE id = $1', [host.id]);
  if (!r?.ref) return;
  const p = await getPartner(db, r.ref);
  if (!isApproved(p, 'broker')) return;
  await insertLink(db, { listingId: listing.id, userId: r.ref, role: 'broker', status: 'pending_host', fee: null, canEdit: false, origin: 'referral', by: r.ref }).catch(() => {});
  await notify(db, { userId: host.id }, 'partner_request',
    `Você chegou ao SpaceHour pela indicação de um Corretor Parceiro. Confirme se ele será o corretor do espaço "${listing.title}" em Meus anúncios → Parceiros. A taxa do corretor é paga pelo locatário e não sai da sua parte.`,
    `/anfitriao/espacos/${listing.id}#parceiros`);
}

async function insertLink(db: Db, a: { listingId: string; userId: string; role: PartnerRole; status: LinkRow['status']; fee: number | null; canEdit: boolean; origin: string; by: string }) {
  try {
    return (await one<LinkRow>(db,
      `INSERT INTO listing_partners (id, listing_id, user_id, role, status, caretaker_fee, can_edit, origin, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [id('lpt'), a.listingId, a.userId, a.role, a.status, a.fee, a.canEdit, a.origin, a.by]))!;
  } catch (e) {
    if ((e as { code?: string }).code === '23505') throw new HttpError(409, 'partner_role_taken');
    throw e;
  }
}

async function linkForUpdate(db: Db, linkId: string) {
  const link = await one<LinkRow>(db, 'SELECT * FROM listing_partners WHERE id = $1 FOR UPDATE', [linkId]);
  if (!link) throw new HttpError(404, 'not_found');
  const l = (await repo.getListing(db, link.listing_id))!;
  return { link, l };
}

/** Aceite ou recusa do vínculo pela parte que ainda não respondeu. */
export async function respondLink(user: User, linkId: string, accept: boolean) {
  return withTx(async (tx) => {
    const { link, l } = await linkForUpdate(tx, linkId);
    const answerer = link.status === 'pending_partner' ? link.user_id : link.status === 'pending_host' ? l.hostId : null;
    if (!answerer) throw new HttpError(409, 'invalid_status');
    if (answerer !== user.id) throw new HttpError(403, 'forbidden');
    if (accept && !isApproved(await getPartner(tx, link.user_id), link.role)) throw new HttpError(409, 'partner_not_approved');
    await tx.query('UPDATE listing_partners SET status = $2, accepted_at = CASE WHEN $3 THEN now() END WHERE id = $1', [link.id, accept ? 'active' : 'declined', accept]);
    await syncListing(tx, l.id);
    const other = answerer === l.hostId ? link.user_id : l.hostId;
    await notify(tx, { userId: other }, accept ? 'partner_link_active' : 'partner_link_declined',
      accept ? `Parceria ativa: ${ROLE_LABEL[link.role]} no espaço "${l.title}". A partir de agora, cada reserva paga avisa os parceiros por e-mail e Telegram/WhatsApp.`
        : `O convite de parceria (${ROLE_LABEL[link.role]}) no espaço "${l.title}" foi recusado.`,
      other === l.hostId ? `/anfitriao/espacos/${l.id}#parceiros` : '/parceiro');
    return (await one<LinkRow>(tx, 'SELECT * FROM listing_partners WHERE id = $1', [link.id]))!;
  });
}

/**
 * Encerrar a parceria. Regra: aviso prévio de 30 dias (o parceiro segue atendendo e recebendo nesse período).
 * Justa causa (faltou ao atendimento, cobrou por fora, quebrou o sigilo...): o anfitrião encerra na hora, com o motivo
 * registrado; a equipe confere. Convite ainda pendente é cancelado na hora.
 */
export async function endLink(user: User, linkId: string, input: { reason: string; immediate?: boolean }) {
  return withTx(async (tx) => {
    const { link, l } = await linkForUpdate(tx, linkId);
    const isAdmin = user.roles.includes('admin');
    if (user.id !== l.hostId && user.id !== link.user_id && !isAdmin) throw new HttpError(403, 'forbidden');
    const reason = input.reason.trim().slice(0, 500);
    if (link.status === 'pending_host' || link.status === 'pending_partner') {
      await tx.query("UPDATE listing_partners SET status = 'ended', ended_at = now(), end_reason = $2 WHERE id = $1", [link.id, reason || 'cancelled']);
      return;
    }
    if (link.status !== 'active') throw new HttpError(409, 'invalid_status');
    const immediate = isAdmin || (!!input.immediate && user.id === l.hostId);
    if (immediate && reason.length < 10) throw new HttpError(422, 'partner_end_reason_required');
    if (immediate) {
      await tx.query("UPDATE listing_partners SET status = 'ended', end_requested_at = now(), ended_at = now(), end_reason = $2 WHERE id = $1", [link.id, `just_cause: ${reason}`]);
      await syncListing(tx, l.id);
      await tellAdmins(tx, 'admin_partner_just_cause', `Parceria encerrada por justa causa no espaço "${l.title}" (${ROLE_LABEL[link.role]}). Motivo: ${reason}`, '/admin/parceiros');
    } else {
      await tx.query(`UPDATE listing_partners SET end_requested_at = now(), ends_at = now() + make_interval(days => $3), end_reason = $2 WHERE id = $1`,
        [link.id, reason || 'notice', PARTNER_RULES.hostEndNoticeDays]);
    }
    const other = user.id === link.user_id ? l.hostId : link.user_id;
    await notify(tx, { userId: other }, 'partner_link_ending', immediate
      ? `A parceria (${ROLE_LABEL[link.role]}) no espaço "${l.title}" foi encerrada agora, por justa causa. Motivo: ${reason}. Você tem 48 h para responder pelo e-mail ${SUPPORT_EMAIL()}.`
      : `A parceria (${ROLE_LABEL[link.role]}) no espaço "${l.title}" termina em ${PARTNER_RULES.hostEndNoticeDays} dias. Até lá, as reservas seguem normalmente.`,
    other === l.hostId ? `/anfitriao/espacos/${l.id}#parceiros` : '/parceiro');
  });
}

/** Equipe ajusta a taxa do zelador (varia por cidade e tamanho do espaço). */
export async function setCaretakerFee(linkId: string, fee: number) {
  return withTx(async (tx) => {
    const { link, l } = await linkForUpdate(tx, linkId);
    if (link.role !== 'caretaker') throw new HttpError(422, 'invalid_role');
    await tx.query('UPDATE listing_partners SET caretaker_fee = $2 WHERE id = $1', [link.id, checkFee('caretaker', fee)]);
    await syncListing(tx, l.id);
  });
}

export async function setCanEdit(host: User, linkId: string, canEdit: boolean) {
  return withTx(async (tx) => {
    const { link, l } = await linkForUpdate(tx, linkId);
    if (l.hostId !== host.id) throw new HttpError(403, 'forbidden');
    await tx.query('UPDATE listing_partners SET can_edit = $2 WHERE id = $1', [link.id, canEdit]);
  });
}

/** Parceiro ativo autorizado pelo anfitrião a editar o anúncio. */
export async function canEditListing(db: Db, userId: string, listingId: string) {
  return !!(await one(db, `SELECT 1 FROM listing_partners lp JOIN partners p ON p.user_id = lp.user_id
     WHERE lp.listing_id = $1 AND lp.user_id = $2 AND lp.status = 'active' AND lp.can_edit AND p.status = 'approved'`, [listingId, userId]));
}

export const listingLinks = (listingId: string) => rows(pool,
  `SELECT lp.*, u.name, u.email, p.creci, p.creci_uf, p.phone, p.status AS partner_status
     FROM listing_partners lp JOIN users u ON u.id = lp.user_id LEFT JOIN partners p ON p.user_id = lp.user_id
    WHERE lp.listing_id = $1 AND lp.status IN ('pending_host','pending_partner','active') ORDER BY lp.created_at`, [listingId]);

// ───────────── Reservas ─────────────
const phoneLink = (phone?: string | null) => (phone && digits(phone).length >= 10 ? `https://wa.me/55${digits(phone).replace(/^55(?=\d{10,11}$)/, '')}` : null);
const when = (b: Pick<Booking, 'occurrences'>) => b.occurrences.map((o) => `${o.date.split('-').reverse().join('/')} ${o.start}–${o.end}`).join(', ');

/** Reserva paga e confirmada: grava o valor de cada parceiro e troca os contatos entre locatário, anfitrião e parceiros. */
export async function onBookingConfirmed(db: Db, b: Booking, l: Listing) {
  const partners = b.price.partners ?? [];
  if (!partners.length) return;
  const guest = (await repo.getUser(db, b.guestId))!;
  const host = (await repo.getUser(db, b.hostId))!;
  const contacts: string[] = [`Anfitrião: ${host.name}${host.phone ? ` · ${host.phone}` : ''} · ${host.email}`];
  for (const part of partners) {
    await db.query(
      `INSERT INTO partner_earnings (id, booking_id, user_id, role, gross, amount, currency, status) VALUES ($1,$2,$3,$4,$5,$5,$6,'held')
       ON CONFLICT (booking_id, role) DO NOTHING`, [id('ern'), b.id, part.userId, part.role, part.amount, b.price.currency]);
    const u = await repo.getUser(db, part.userId);
    const p = await getPartner(db, part.userId);
    if (!u) continue;
    contacts.push(`${ROLE_LABEL[part.role]}: ${u.name} · ${p?.phone ?? u.phone ?? ''} · ${u.email}${phoneLink(p?.phone) ? ` · WhatsApp: ${phoneLink(p?.phone)}` : ''}`);
    const lines = [
      `Nova reserva paga em "${l.title}" (${l.city}) — você é ${ROLE_LABEL[part.role]}.`,
      `Quando: ${when(b)}`,
      `Locatário: ${guest.name}${guest.phone ? ` · ${guest.phone}` : ''} · ${guest.email}`,
      `Pessoas: ${b.guests} · Finalidade: ${b.purpose}`,
      `Sua taxa: ${brl(part.amount)} (repasse até o dia ${PARTNER_RULES.payoutDay} do mês seguinte ao check-out).`,
      part.role === 'caretaker'
        ? `Entregue o acesso com no máximo ${PARTNER_RULES.checkInToleranceMinutes} min de tolerância e registre a vistoria de entrada e de saída (mín. ${PARTNER_RULES.inspectionMinPhotos} fotos, só do espaço) em até ${PARTNER_RULES.inspectionDeadlineHours} h.`
        : 'Acompanhe a reserva e ajude o anfitrião e o locatário no que precisarem.',
      'Dados do locatário só para atender esta reserva (Termo de Confidencialidade). Nada de cobrança ou contato por fora da plataforma.',
    ];
    await notify(db, { userId: part.userId }, 'partner_booking', lines.join('\n'), `/parceiro/reservas/${b.id}`);
    await queueInstant(db, part.userId, `SpaceHour — ${lines.slice(0, 5).join('\n')}\n${APP_URL()}/parceiro/reservas/${b.id}`);
  }
  const text = [
    `Sua reserva em "${l.title}" (${when(b)}) tem atendimento dos parceiros SpaceHour. Contatos para a sua jornada:`,
    ...contacts,
    'Fale com eles pelo celular ou WhatsApp para combinar a entrega do acesso. Pagamento é só pela plataforma: ninguém pode cobrar nada por fora.',
  ].join('\n');
  await notify(db, { userId: b.guestId }, 'booking_contacts', text, `/reservas/${b.id}`);
  await queueInstant(db, b.guestId, text);
}

/**
 * Cancelamento: o parceiro fica com a parte da taxa que não voltou ao locatário (mesma proporção do valor base).
 * refundedPartnerFees = quanto das taxas de parceiros foi devolvido.
 */
export async function onBookingCancelled(db: Db, b: Booking, refundedPartnerFees: number) {
  const list = await rows<{ id: string; user_id: string; gross: number; status: string }>(db,
    "SELECT id, user_id, gross, status FROM partner_earnings WHERE booking_id = $1 AND status IN ('held','due')", [b.id]);
  if (!list.length) return;
  const totalGross = list.reduce((s, e) => s + e.gross, 0);
  const keepRate = totalGross ? Math.max(0, 1 - refundedPartnerFees / totalGross) : 0;
  const l = await repo.getListing(db, b.listingId);
  const month = monthOf(new Date());
  for (const e of list) {
    const amount = Math.round(e.gross * keepRate * 100) / 100;
    await db.query("UPDATE partner_earnings SET amount = $2, status = $3, due_month = $4, note = 'reserva cancelada' WHERE id = $1",
      [e.id, amount, amount > 0 ? 'due' : 'void', amount > 0 ? month : null]);
    await notify(db, { userId: e.user_id }, 'partner_booking_cancelled',
      `A reserva de ${when(b)} em "${l?.title ?? ''}" foi cancelada.${amount > 0 ? ` Pela regra de cancelamento, você recebe ${brl(amount)}.` : ''}`, '/parceiro');
    await queueInstant(db, e.user_id, `SpaceHour: a reserva de ${when(b)} em "${l?.title ?? ''}" foi cancelada.`);
  }
}

const monthOf = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 7);

/** Reserva concluída (check-out): o valor do parceiro entra no repasse do mês. */
export async function onBookingCompleted(db: Db, b: Booking) {
  const at = b.completedAt ? new Date(b.completedAt) : new Date();
  await db.query("UPDATE partner_earnings SET status = 'due', due_month = $2 WHERE booking_id = $1 AND status = 'held'", [b.id, monthOf(at)]);
}

/** Fim do aviso prévio: encerra os vínculos vencidos. */
export async function partnerJobs(now = new Date()) {
  const due = await rows<{ id: string; listing_id: string }>(pool, "SELECT id, listing_id FROM listing_partners WHERE status = 'active' AND ends_at IS NOT NULL AND ends_at <= $1", [now]);
  for (const d of due) {
    await withTx(async (tx) => {
      await tx.query("UPDATE listing_partners SET status = 'ended', ended_at = now() WHERE id = $1 AND status = 'active'", [d.id]);
      await syncListing(tx, d.listing_id);
    });
  }
  return due.length;
}

// ───────────── Painel do parceiro ─────────────
export async function partnerDashboard(user: User) {
  const p = await getPartner(pool, user.id);
  if (!p) return { partner: null };
  const links = await rows(pool,
    `SELECT lp.*, l.title, l.city, l.state, l.host_id, h.name AS host_name
       FROM listing_partners lp JOIN listings l ON l.id = lp.listing_id JOIN users h ON h.id = l.host_id
      WHERE lp.user_id = $1 AND lp.status IN ('pending_host','pending_partner','active') ORDER BY lp.created_at DESC`, [user.id]);
  const bookings = await partnerBookings(user.id);
  const earnings = await rows(pool,
    `SELECT e.*, l.title FROM partner_earnings e JOIN bookings b ON b.id = e.booking_id JOIN listings l ON l.id = b.listing_id
      WHERE e.user_id = $1 ORDER BY e.created_at DESC LIMIT 200`, [user.id]);
  const totals = await one(pool,
    `SELECT coalesce(sum(amount) FILTER (WHERE status = 'held'),0)::float AS held, coalesce(sum(amount) FILTER (WHERE status = 'due'),0)::float AS due,
            coalesce(sum(amount) FILTER (WHERE status = 'paid'),0)::float AS paid FROM partner_earnings WHERE user_id = $1`, [user.id]);
  const { telegram_link_token: _t, ...safe } = p;
  return {
    partner: { ...safe, telegramLinked: !!p.telegram_chat_id, referralLink: `${APP_URL()}/parceiros?ref=${p.ref_code}` },
    links, bookings, earnings, totals,
  };
}

/** Reservas pagas em que o usuário é parceiro (dados do locatário só até 90 dias após o fim). */
export async function partnerBookings(userId: string) {
  const list = await repo.findBookings(pool,
    `status IN ('confirmed','checked_in','completed','cancelled_guest','cancelled_host') AND price->'partners' @> $1::jsonb`,
    [JSON.stringify([{ userId }])]);
  const listings = await repo.getListings(pool, [...new Set(list.map((b) => b.listingId))]);
  const out = [];
  for (const b of list) {
    const l = listings.get(b.listingId);
    if (!l) continue;
    const end = Math.max(...b.occurrences.map((o) => occurrenceEndUtc(l, o).getTime()));
    const visible = Date.now() < end + PARTNER_RULES.dataRetentionDays * 86400000 && ['confirmed', 'checked_in', 'completed'].includes(b.status);
    const guest = visible ? await repo.getUser(pool, b.guestId) : undefined;
    out.push({
      id: b.id, status: b.status, occurrences: b.occurrences, guests: b.guests, purpose: b.purpose, attendance: b.attendance,
      listing: { id: l.id, title: l.title, city: l.city, address: visible ? l.address : undefined },
      role: b.price.partners!.find((x) => x.userId === userId)!.role, fee: b.price.partners!.find((x) => x.userId === userId)!.amount,
      guest: guest ? { name: guest.name, phone: guest.phone, email: guest.email } : undefined,
      end: new Date(end).toISOString(),
    });
  }
  return out.sort((a, b) => a.occurrences[0].date.localeCompare(b.occurrences[0].date));
}

/** Parceiros e contatos de uma reserva (para o locatário e o anfitrião). */
export async function bookingPartnerContacts(db: Db, b: Booking) {
  const out = [];
  for (const part of b.price.partners ?? []) {
    const u = await repo.getUser(db, part.userId);
    const p = await getPartner(db, part.userId);
    if (u) out.push({ role: part.role, name: u.name, email: u.email, phone: p?.phone ?? u.phone, whatsapp: phoneLink(p?.phone ?? u.phone), creci: p?.creci ? `${p.creci}/${p.creci_uf}` : undefined });
  }
  return out;
}

export async function telegramLink(user: User) {
  const t = token().slice(0, 24).replace(/[^A-Za-z0-9_-]/g, 'x');
  const r = await pool.query('UPDATE partners SET telegram_link_token = $2 WHERE user_id = $1', [user.id, t]);
  if (!r.rowCount) throw new HttpError(404, 'partner_not_found');
  const link = telegramStartLink(t);
  if (!link) throw new HttpError(503, 'telegram_not_configured');
  return { link };
}

// ───────────── Vistoria e manutenção ─────────────
const PHOTO = /^(https:\/\/[a-z0-9.-]+\.public\.blob\.vercel-storage\.com\/|\/api\/uploads\/)[A-Za-z0-9/_.-]+$/;

/** Quem pode registrar e ver a vistoria: anfitrião, parceiros da reserva/anúncio, o locatário da reserva e a equipe. */
async function inspectionAccess(db: Db, user: User, listing: Listing, b?: Booking) {
  if (user.roles.includes('admin') || listing.hostId === user.id) return 'host';
  if (b && b.guestId === user.id) return 'guest';
  if (b?.price.partners?.some((p) => p.userId === user.id)) return 'partner';
  if (await one(db, "SELECT 1 FROM listing_partners WHERE listing_id = $1 AND user_id = $2 AND status = 'active'", [listing.id, user.id])) return 'partner';
  return null;
}

export async function createInspection(user: User, input: { bookingId?: string; listingId?: string; kind: 'check_in' | 'check_out' | 'maintenance'; checklist?: Record<string, boolean>; notes?: string; photos: string[] }) {
  return withTx(async (tx) => {
    const b = input.bookingId ? await repo.getBooking(tx, input.bookingId) : undefined;
    if (input.bookingId && !b) throw new HttpError(404, 'booking_not_found');
    const l = await repo.getListing(tx, b?.listingId ?? input.listingId ?? '');
    if (!l) throw new HttpError(404, 'listing_not_found');
    const who = await inspectionAccess(tx, user, l, b);
    if (!who) throw new HttpError(403, 'forbidden');
    if (input.kind !== 'maintenance' && !b) throw new HttpError(422, 'booking_required');
    const photos = input.photos.filter((u) => PHOTO.test(u)).slice(0, 30);
    // Vistoria do anfitrião/parceiro vale como prova: mínimo de fotos; o locatário pode registrar a dele com 1 foto ou mais
    const min = who === 'guest' ? 1 : input.kind === 'maintenance' ? 1 : PARTNER_RULES.inspectionMinPhotos;
    if (photos.length < min) throw new HttpError(422, 'inspection_photos_required', { min });
    const row = (await one(tx,
      `INSERT INTO inspections (id, booking_id, listing_id, kind, author_id, checklist, notes, photos) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [id('isp'), b?.id ?? null, l.id, input.kind, user.id, JSON.stringify(input.checklist ?? {}), input.notes?.trim().slice(0, 3000) || null, photos]))!;
    const label = input.kind === 'check_in' ? 'Vistoria de entrada' : input.kind === 'check_out' ? 'Vistoria de saída' : 'Registro de manutenção';
    if (l.hostId !== user.id) {
      await notify(tx, { userId: l.hostId }, 'inspection_created', `${label} registrada por ${user.name} em "${l.title}"${input.notes ? `: ${input.notes.slice(0, 300)}` : '.'}`,
        b ? `/anfitriao/reservas/${b.id}` : `/anfitriao/espacos/${l.id}#parceiros`);
      if (input.kind === 'maintenance') await queueInstant(tx, l.hostId, `SpaceHour: ${label} em "${l.title}": ${input.notes?.slice(0, 300) ?? ''}`);
    }
    return row;
  });
}

export async function listInspections(user: User, q: { bookingId?: string; listingId?: string }) {
  const b = q.bookingId ? await repo.getBooking(pool, q.bookingId) : undefined;
  const l = await repo.getListing(pool, b?.listingId ?? q.listingId ?? '');
  if (!l) throw new HttpError(404, 'not_found');
  if (!(await inspectionAccess(pool, user, l, b))) throw new HttpError(403, 'forbidden');
  return rows(pool,
    `SELECT i.*, u.name AS author_name FROM inspections i JOIN users u ON u.id = i.author_id
      WHERE ${b ? 'i.booking_id = $1' : 'i.listing_id = $1'} ORDER BY i.created_at DESC LIMIT 200`, [b?.id ?? l.id]);
}

// ───────────── Repasse aos parceiros (equipe) ─────────────
export const payoutReport = (month?: string) => rows(pool,
  `SELECT e.user_id, u.name, u.email, p.pix_key, p.tax_id, e.due_month, count(*)::int AS bookings, sum(e.amount)::float AS amount,
          array_agg(e.id) AS ids
     FROM partner_earnings e JOIN users u ON u.id = e.user_id JOIN partners p ON p.user_id = e.user_id
    WHERE e.status = 'due' ${month ? 'AND e.due_month <= $1' : ''}
    GROUP BY e.user_id, u.name, u.email, p.pix_key, p.tax_id, e.due_month ORDER BY e.due_month, u.name`, month ? [month] : []);

export async function markPaid(admin: User, ids: string[], ref: string) {
  return withTx(async (tx) => {
    const r = await rows<{ user_id: string; amount: number }>(tx,
      "UPDATE partner_earnings SET status = 'paid', paid_at = now(), paid_ref = $2 WHERE id = ANY($1) AND status = 'due' RETURNING user_id, amount", [ids, ref.slice(0, 200)]);
    const byUser = new Map<string, number>();
    for (const e of r) byUser.set(e.user_id, (byUser.get(e.user_id) ?? 0) + e.amount);
    for (const [userId, amount] of byUser) {
      await notify(tx, { userId }, 'partner_paid', `Repasse SpaceHour enviado: ${brl(amount)} por Pix (${ref}). Obrigado pela parceria!`, '/parceiro');
    }
    void admin;
    return { paid: r.length };
  });
}

export const partnerRulesVersion = () => `${PARTNER_TERMS_VERSION} (regras ${RULES_VERSION})`;
export { nowIso };
