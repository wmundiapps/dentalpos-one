/**
 * Captação de leads: páginas de oferta que coletam contatos (nome + WhatsApp, com consentimento LGPD)
 * e entregam automaticamente para os lojistas.
 *  - Página da loja: o lead vai só para aquela loja.
 *  - Página da plataforma (por categoria e cidade): o lead vai para até 3 lojas daquela categoria/cidade,
 *    priorizando quem recebeu menos leads nos últimos 30 dias (rodízio justo).
 */
import crypto from 'crypto';
import { one, q, tx, UserError } from '../db';
import { config } from '../config';
import { onlyDigits } from '../format';
import { queueEmail } from './notify';

const MAX_PAGES_PER_STORE = 10;
const PLATFORM_SPLIT = 3;

function slugify(text: string) {
  const base = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `${base || 'oferta'}-${crypto.randomBytes(3).toString('hex')}`;
}

export type LeadPageInput = { title: string; offer: string; question?: string | null };

function checkPage(d: LeadPageInput) {
  const title = String(d.title || '').trim();
  const offer = String(d.offer || '').trim();
  if (title.length < 5 || title.length > 80) throw new UserError('O título precisa ter de 5 a 80 letras');
  if (offer.length < 10 || offer.length > 400) throw new UserError('Descreva a oferta em 10 a 400 letras');
  const question = String(d.question || '').trim().slice(0, 120) || null;
  return { title, offer, question };
}

export async function createLeadPage(businessId: string, actorId: string, d: LeadPageInput) {
  const v = checkPage(d);
  const { moderateCampaign } = await import('../moderation');
  const m = await moderateCampaign(v.title, v.offer);
  if (!m.ok) throw new UserError(m.reason || 'Conteúdo não permitido');
  return tx(async (c) => {
    const own = await one(`select 1 from business_members where business_id=$1 and user_id=$2 and role='owner'`, [businessId, actorId], c);
    if (!own) throw new UserError('Só o dono pode criar páginas de captação');
    const n = await one<{ n: string }>(`select count(*) n from lead_pages where business_id=$1 and active`, [businessId], c);
    if (Number(n!.n) >= MAX_PAGES_PER_STORE) throw new UserError(`Limite de ${MAX_PAGES_PER_STORE} páginas ativas. Desative uma antes.`);
    const b = await one<{ category: string; city: string; state: string }>('select category, city, state from businesses where id=$1', [businessId], c);
    const p = await one<{ id: string; slug: string }>(
      `insert into lead_pages (slug, business_id, title, offer, question, category, city, state, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id, slug`,
      [slugify(v.title), businessId, v.title, v.offer, v.question, b!.category, b!.city, b!.state, actorId],
      c,
    );
    return p!;
  });
}

/** Página da plataforma (admin): leads de uma categoria/cidade divididos entre lojas participantes */
export async function createPlatformLeadPage(actorId: string, d: LeadPageInput & { category: string; city?: string | null; state?: string | null }) {
  const v = checkPage(d);
  if (!d.category) throw new UserError('Escolha a categoria');
  const p = await one<{ id: string; slug: string }>(
    `insert into lead_pages (slug, business_id, title, offer, question, category, city, state, created_by) values ($1,null,$2,$3,$4,$5,$6,$7,$8) returning id, slug`,
    [slugify(v.title), v.title, v.offer, v.question, d.category, d.city || null, d.state ? d.state.toUpperCase() : null, actorId],
  );
  return p!;
}

export async function setLeadPageActive(pageId: string, actorId: string, active: boolean, isAdmin = false) {
  const r = await q(
    `update lead_pages p set active=$3 where p.id=$1 and ($4 or exists (select 1 from business_members m where m.business_id=p.business_id and m.user_id=$2 and m.role='owner')) returning p.id`,
    [pageId, actorId, active, isAdmin],
  );
  return r.length;
}

export async function leadPage(slug: string, countView = false) {
  const p = await one<any>(
    `select p.*, b.name business_name, b.address, b.neighborhood, b.kit_code from lead_pages p left join businesses b on b.id=p.business_id where p.slug=$1`,
    [String(slug || '').slice(0, 80)],
  );
  if (p && countView) await q('update lead_pages set views = views + 1 where id=$1', [p.id]);
  return p;
}

export type LeadInput = { name: string; phone: string; email?: string | null; city?: string | null; state?: string | null; answer?: string | null; consent: boolean; ipHash?: string | null };

export async function submitLead(slug: string, d: LeadInput, now = new Date()) {
  const name = String(d.name || '').trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 80) throw new UserError('Informe seu nome');
  let phone = onlyDigits(d.phone);
  if (phone.length === 13 && phone.startsWith('55')) phone = phone.slice(2);
  if (!/^[1-9]{2}9?\d{8}$/.test(phone)) throw new UserError('Informe um celular com DDD');
  const email = String(d.email || '').trim().toLowerCase() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new UserError('E-mail inválido');
  if (!d.consent) throw new UserError('Marque a autorização de contato para receber a oferta');

  return tx(async (c) => {
    const page = await one<any>(`select * from lead_pages where slug=$1 for update`, [slug], c);
    if (!page || !page.active) throw new UserError('Esta oferta não está mais disponível');
    if (d.ipHash) {
      const recent = await one<{ n: string }>(`select count(*) n from leads where ip_hash=$1 and created_at > $2`, [d.ipHash, new Date(now.getTime() - 3600000)], c);
      if (Number(recent!.n) >= 10) throw new UserError('Muitos cadastros deste aparelho. Tente mais tarde.');
    }
    const exists = await one<{ id: string }>('select id from leads where page_id=$1 and phone=$2', [page.id, phone], c);
    if (exists) return { leadId: exists.id, delivered: 0, duplicate: true };
    const user = await one<{ id: string }>(`select id from users where phone=$1 and role='consumer' limit 1`, [phone], c);
    const lead = await one<{ id: string }>(
      `insert into leads (page_id, name, phone, email, city, state, answer, consent_at, ip_hash, user_id, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$8) returning id`,
      [page.id, name, phone, email, d.city || page.city, (d.state || page.state || null)?.toUpperCase() || null, String(d.answer || '').slice(0, 300) || null, now, d.ipHash || null, user?.id || null],
      c,
    );

    // Para quem vai o lead
    let targets: { id: string; name: string; owner_id: string }[];
    if (page.business_id) {
      targets = await q(`select id, name, owner_id from businesses where id=$1 and status='active'`, [page.business_id], c);
    } else {
      targets = await q(
        `select b.id, b.name, b.owner_id from businesses b
          where b.status='active' and b.category=$1 and ($2::text is null or lower(b.city)=lower($2)) and ($3::text is null or b.state=$3)
            and exists (select 1 from subscriptions s where s.business_id=b.id and (s.status in ('trialing','active') or (s.status='canceled' and s.current_period_end > $4)))
          order by (select count(*) from lead_deliveries d where d.business_id=b.id and d.delivered_at > $4::timestamptz - interval '30 days'), random()
          limit $5`,
        [page.category, page.city, page.state, now, PLATFORM_SPLIT],
        c,
      );
    }
    for (const t of targets) {
      await c.query(`insert into lead_deliveries (lead_id, business_id, delivered_at) values ($1,$2,$3) on conflict do nothing`, [lead!.id, t.id, now]);
      const owner = await one<{ id: string; email: string }>('select id, email from users where id=$1', [t.owner_id], c);
      if (owner)
        await queueEmail(owner.id, owner.email, `Novo cliente interessado: ${name}`, `${name} quer a oferta "${page.title}".\n\nWhatsApp: (${phone.slice(0, 2)}) ${phone.slice(2)}${email ? `\nE-mail: ${email}` : ''}${d.answer ? `\nResposta: ${String(d.answer).slice(0, 300)}` : ''}\n\nResponda rápido: quem chama em até 5 minutos fecha muito mais.`, 'lead', { label: 'Ver meus leads', url: `${config.appUrl}/painel/leads` }, c);
    }
    return { leadId: lead!.id, delivered: targets.length, duplicate: false };
  });
}

export async function leadsFor(businessId: string, limit = 200) {
  return q<any>(
    `select l.id, l.name, l.phone, l.email, l.answer, l.created_at, d.status, p.title page_title, l.user_id is not null is_member
       from lead_deliveries d join leads l on l.id=d.lead_id join lead_pages p on p.id=l.page_id
      where d.business_id=$1 order by d.delivered_at desc limit $2`,
    [businessId, limit],
  );
}

export async function leadPagesFor(businessId: string) {
  return q<any>(
    `select p.*, (select count(*) from leads l where l.page_id=p.id) leads from lead_pages p where p.business_id=$1 order by p.created_at desc`,
    [businessId],
  );
}

export async function setLeadStatus(businessId: string, actorId: string, leadId: string, status: string) {
  if (!['new', 'contacted', 'converted', 'lost'].includes(status)) throw new UserError('Situação inválida');
  const m = await one('select 1 from business_members where business_id=$1 and user_id=$2', [businessId, actorId]);
  if (!m) throw new UserError('Sem permissão');
  await q(`update lead_deliveries set status=$3, updated_at=now() where lead_id=$1 and business_id=$2`, [leadId, businessId, status]);
}

export async function platformLeadPages() {
  return q<any>(
    `select p.*, (select count(*) from leads l where l.page_id=p.id) leads,
       (select count(*) from leads l where l.page_id=p.id and not exists (select 1 from lead_deliveries d where d.lead_id=l.id)) undelivered
     from lead_pages p where p.business_id is null order by p.created_at desc limit 100`,
  );
}

/** Link do WhatsApp para o lojista chamar o lead com 1 toque */
export function whatsappLink(phone: string, text: string) {
  return `https://wa.me/55${onlyDigits(phone)}?text=${encodeURIComponent(text)}`;
}
