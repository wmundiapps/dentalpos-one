// API da AlignSystem — uma única função serverless com roteador interno.
import { db, logEvent } from './db.js';
import { createRouter, send, fail, readJson, readRaw, clientIp, HttpError } from './http.js';
import {
  hashPassword, verifyPassword, passwordProblem, sessionCookie, clearCookie,
  currentUser, requireUser, createPasswordToken, consumePasswordToken,
} from './auth.js';
import { token, sha256, clean, digits, isEmail, appUrl, brl, validCpf, validCpfCnpj } from './util.js';
import { sendMail, notifyAddress, layout, button, para, table } from './mail.js';
import * as asaas from './asaas.js';
import { patientContract, partnerContract, contractsReviewed, PARTNER_DEFAULTS } from './contracts.js';
import {
  CASE_STATUS, DENTIST_STATUS, ASSESSMENT, MILESTONES, PHOTO_SLOTS, MAX_PHOTO_BYTES, MAX_PHOTOS_PER_CASE,
} from './constants.js';

const router = createRouter();
const r = router.add;

// ------------------------------------------------------------------ helpers

async function rateLimit(sql, key, max, minutes) {
  const [{ n }] = await sql`select count(*)::int as n from rate_hits where key = ${key} and at > now() - ${minutes + ' minutes'}::interval`;
  if (n >= max) fail(429, 'Muitas tentativas. Aguarde alguns minutos e tente de novo.');
  await sql`insert into rate_hits (key) values (${key})`;
  if (Math.random() < 0.02) await sql`delete from rate_hits where at < now() - interval '1 day'`;
}

function imageMime(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (buf.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buf.toString('ascii', 8, 12);
    if (/^(heic|heix|hevc|hevx|mif1|msf1)$/.test(brand)) return 'image/heic';
  }
  if (buf.toString('ascii', 0, 5) === '%PDF-') return 'application/pdf';
  return null;
}

const portalUrl = (t) => `${appUrl()}/minha-avaliacao?t=${t}`;
const contractUrl = (t) => `${appUrl()}/contrato?t=${t}`;
const money = (v) => (v === '' || v == null ? null : Math.round(Number(String(v).replace(',', '.')) * 100) / 100);

async function caseByToken(sql, t) {
  if (!t || String(t).length < 20) fail(404, 'Link inválido.');
  const [c] = await sql`select * from cases where token = ${String(t)}`;
  if (!c) fail(404, 'Link inválido ou expirado.');
  return c;
}

async function photoMeta(sql, caseId) {
  return sql`select id, slot, kind, mime, size, evidence_id, uploaded_by, created_at
             from photos where case_id = ${caseId} order by kind, slot nulls last, created_at`;
}

async function saveImage(sql, req, { caseId, kind, slot = null, evidenceId = null, uploadedBy, userId = null, allowPdf = false }) {
  const buf = await readRaw(req, MAX_PHOTO_BYTES);
  if (!buf.length) fail(400, 'Arquivo vazio.');
  const mime = imageMime(buf);
  if (!mime || (mime === 'application/pdf' && !allowPdf)) fail(415, 'Envie uma foto em JPG, PNG, WEBP ou HEIC.');
  const [{ n }] = await sql`select count(*)::int as n from photos where case_id = ${caseId}`;
  if (n >= MAX_PHOTOS_PER_CASE * (uploadedBy === 'paciente' ? 1 : 4)) fail(409, 'Limite de arquivos deste caso atingido.');
  return sql.begin(async (tx) => {
    if (kind === 'avaliacao' && slot) await tx`delete from photos where case_id = ${caseId} and kind = 'avaliacao' and slot = ${slot}`;
    const [p] = await tx`insert into photos (case_id, evidence_id, slot, kind, mime, size, data, uploaded_by, user_id)
      values (${caseId}, ${evidenceId}, ${slot}, ${kind}, ${mime}, ${buf.length}, ${buf}, ${uploadedBy}, ${userId})
      returning id, slot, kind, mime, size, created_at`;
    return p;
  });
}

async function sendPhoto(sql, res, where) {
  const [p] = await where;
  if (!p) fail(404, 'Foto não encontrada.');
  const [row] = await sql`select mime, data from photos where id = ${p.id}`;
  send(res, 200, Buffer.from(row.data), {
    'Content-Type': row.mime,
    'Cache-Control': 'private, max-age=600',
    'Content-Disposition': 'inline',
  });
}

function publicCase(c) {
  const published = Boolean(c.assessment_published_at);
  return {
    code: c.code,
    name: c.name,
    firstName: c.name.split(' ')[0],
    status: c.status,
    statusLabel: CASE_STATUS[c.status],
    photosSubmittedAt: c.photos_submitted_at,
    assessment: published ? c.assessment : null,
    assessmentLabel: published ? ASSESSMENT[c.assessment] : null,
    assessmentNotes: published ? c.assessment_notes : null,
  };
}

async function dentistById(sql, id) {
  if (!id) return null;
  const [d] = await sql`select * from dentists where id = ${id}`;
  return d || null;
}

async function createPartnerContract(sql, dentist, terms, userId) {
  const { title, body } = partnerContract(dentist, terms);
  await sql`update contracts set status = 'cancelado' where dentist_id = ${dentist.id} and kind = 'parceiro' and status = 'enviado'`;
  const t = token(24);
  const [ct] = await sql`insert into contracts (kind, dentist_id, token, title, body, body_hash, created_by)
    values ('parceiro', ${dentist.id}, ${t}, ${title}, ${body}, ${sha256(body)}, ${userId}) returning id, token`;
  return ct;
}

// ------------------------------------------------------------------ público

r('GET', '/api/health', async (req, res) => {
  const sql = db();
  await sql`select 1`;
  send(res, 200, { ok: true });
});

r('GET', '/api/config', async (req, res) => {
  send(res, 200, {
    whatsapp: digits(process.env.PUBLIC_WHATSAPP || ''),
    contactEmail: process.env.PUBLIC_CONTACT_EMAIL || 'contato@alignsystem.com.br',
    supportEmail: process.env.PUBLIC_SUPPORT_EMAIL || 'suporte@alignsystem.com.br',
    responsavelTecnico: process.env.PUBLIC_RESPONSAVEL_TECNICO || '',
    razaoSocial: process.env.PUBLIC_RAZAO_SOCIAL || '',
    metaPixelId: digits(process.env.META_PIXEL_ID || ''),
    googleTagId: clean(process.env.GOOGLE_TAG_ID || '', 40).replace(/[^A-Za-z0-9-]/g, ''),
    photoSlots: PHOTO_SLOTS,
  }, { 'Cache-Control': 'public, max-age=300' });
});

// Captação — paciente
r('POST', '/api/leads/paciente', async (req, res) => {
  const sql = db();
  const b = await readJson(req);
  if (b.website) return send(res, 200, { ok: true }); // honeypot
  const name = clean(b.name, 120);
  const whatsapp = digits(b.whatsapp);
  const city = clean(b.city, 80);
  const email = clean(b.email, 160).toLowerCase();
  const age = Number(b.age);
  if (name.length < 3) fail(400, 'Informe seu nome completo.');
  if (whatsapp.length < 10 || whatsapp.length > 13) fail(400, 'Informe um WhatsApp válido com DDD.');
  if (!city) fail(400, 'Informe sua cidade.');
  if (email && !isEmail(email)) fail(400, 'E-mail inválido.');
  if (!(age >= 10 && age <= 99)) fail(400, 'Informe uma idade válida.');
  if (!b.consent) fail(400, 'É preciso autorizar o contato para continuar.');
  const ip = clientIp(req);
  await rateLimit(sql, `lead:${ip}`, 8, 60);
  const t = token(24);
  const source = {};
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'fbclid', 'page']) {
    if (b.source?.[k]) source[k] = clean(b.source[k], 200);
  }
  const [c] = await sql`insert into cases (token, name, age, whatsapp, email, city, reason, referred_by, consent_at, consent_ip, source)
    values (${t}, ${name}, ${age}, ${whatsapp}, ${email || null}, ${city}, ${clean(b.reason, 200)}, ${clean(b.referredBy, 120) || null},
            now(), ${ip}, ${sql.json(source)})
    returning id, code, token`;
  await logEvent(sql, { caseId: c.id, actor: 'paciente', type: 'lead_criado', data: { city } });
  await sendMail({
    to: notifyAddress(),
    subject: `Novo paciente #${c.code}: ${name} (${city})`,
    html: layout('Novo contato de paciente', table([
      ['Nome', name], ['Idade', age], ['WhatsApp', whatsapp], ['E-mail', email], ['Cidade', city],
      ['Motivo', clean(b.reason, 200)], ['Indicado por', clean(b.referredBy, 120)], ['Origem', source.utm_source],
    ]) + button(`${appUrl()}/painel#/caso/${c.id}`, 'Abrir no painel')),
  });
  if (email) {
    await sendMail({
      to: email,
      subject: 'Sua pré-avaliação AlignSystem — envie suas fotos',
      html: layout(`Olá, ${name.split(' ')[0]}!`, para('Recebemos seu contato. Pelo link abaixo você envia as 7 fotos do seu sorriso, acompanha o parecer da nossa equipe, agenda uma teleorientação e vê os próximos passos.') +
        button(portalUrl(t), 'Enviar minhas fotos') + para('Guarde este e-mail: o link é pessoal e dá acesso à sua avaliação.')),
    });
  }
  send(res, 201, { ok: true, token: t, portalUrl: `/minha-avaliacao?t=${t}`, code: c.code });
});

// Captação — dentista parceiro
r('POST', '/api/leads/parceiro', async (req, res) => {
  const sql = db();
  const b = await readJson(req);
  if (b.website) return send(res, 200, { ok: true });
  const name = clean(b.name, 120);
  const phone = digits(b.whatsapp);
  const email = clean(b.email, 160).toLowerCase();
  const croRaw = clean(b.cro, 40);
  const [croNum, croUf] = croRaw.split('/').map((s) => s.trim());
  const city = clean(b.city, 80);
  if (name.length < 3) fail(400, 'Informe seu nome completo.');
  if (!digits(croNum)) fail(400, 'Informe seu número de CRO.');
  if (phone.length < 10) fail(400, 'Informe um WhatsApp válido com DDD.');
  if (!isEmail(email)) fail(400, 'Informe um e-mail válido.');
  if (!city) fail(400, 'Informe a cidade onde atende.');
  if (!b.consent) fail(400, 'É preciso autorizar o contato para continuar.');
  const ip = clientIp(req);
  await rateLimit(sql, `partner:${ip}`, 6, 60);
  const source = {};
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'gclid', 'fbclid']) if (b.source?.[k]) source[k] = clean(b.source[k], 200);
  const [d] = await sql`insert into dentists (name, cro, cro_uf, email, phone, city, state, experience, consent_at, consent_ip, source)
    values (${name}, ${digits(croNum)}, ${clean(croUf || b.uf, 2).toUpperCase() || null}, ${email}, ${phone}, ${city},
            ${clean(b.uf || croUf, 2).toUpperCase() || null}, ${clean(b.experience, 200)}, now(), ${ip}, ${sql.json(source)})
    returning id`;
  await logEvent(sql, { dentistId: d.id, actor: 'parceiro', type: 'lead_parceiro' });
  await sendMail({
    to: notifyAddress(),
    subject: `Novo dentista interessado: ${name} (${city})`,
    html: layout('Novo interessado em ser parceiro', table([
      ['Nome', name], ['CRO', `${digits(croNum)}/${croUf || ''}`], ['WhatsApp', phone], ['E-mail', email], ['Cidade', city],
      ['Experiência', clean(b.experience, 200)],
    ]) + button(`${appUrl()}/painel#/parceiro/${d.id}`, 'Abrir no painel')),
  });
  await sendMail({
    to: email,
    subject: 'Recebemos seu interesse na rede AlignSystem',
    html: layout(`Olá, ${name.split(' ')[0]}!`, para('Obrigado pelo interesse em fazer parte da rede AlignSystem. Nossa equipe vai conferir seu registro no CRO e entrar em contato pelo WhatsApp com os Termos de Adesão e as condições da parceria.')),
  });
  send(res, 201, { ok: true });
});

// ------------------------------------------------------------------ portal do paciente (link com token)

r('GET', '/api/portal/:token', async (req, res, { token: t }) => {
  const sql = db();
  const c = await caseByToken(sql, t);
  const photos = (await photoMeta(sql, c.id)).filter((p) => p.uploaded_by === 'paciente');
  const appts = await sql`select a.id, a.kind, a.starts_at, a.duration_min, a.room_url, a.location, a.status, d.name as dentist_name
    from appointments a left join dentists d on d.id = a.dentist_id
    where a.case_id = ${c.id} and a.status <> 'cancelado' order by a.starts_at`;
  const contracts = await sql`select token, title, status, accepted_at from contracts
    where case_id = ${c.id} and kind = 'paciente' and status <> 'cancelado' order by created_at desc`;
  const charges = await sql`select id, kind, description, value, installment_count, invoice_url, status, due_date
    from charges where case_id = ${c.id} and status <> 'cancelado' order by created_at`;
  const payments = await sql`select asaas_payment_id, charge_id, value, due_date, status, invoice_url from payments
    where case_id = ${c.id} order by due_date`;
  const dentist = c.dentist_id ? await dentistById(sql, c.dentist_id) : null;
  send(res, 200, {
    case: publicCase(c),
    dentist: dentist ? { name: dentist.name, cro: dentist.cro, croUf: dentist.cro_uf, city: dentist.city } : null,
    slots: PHOTO_SLOTS,
    photos: photos.map((p) => ({ id: p.id, slot: p.slot, kind: p.kind })),
    appointments: appts,
    contracts: contracts.map((x) => ({ ...x, url: `/contrato?t=${x.token}`, token: undefined })),
    charges: charges.map((ch) => ({
      ...ch,
      statusLabel: asaas.STATUS_PT[ch.status] || ch.status,
      payments: payments.filter((p) => p.charge_id === ch.id).map((p) => ({ ...p, statusLabel: asaas.STATUS_PT[p.status] || p.status })),
    })),
  }, { 'Cache-Control': 'no-store' });
});

r('POST', '/api/portal/:token/photos', async (req, res, { token: t }) => {
  const sql = db();
  const c = await caseByToken(sql, t);
  await rateLimit(sql, `upload:${c.id}`, 60, 60);
  const url = new URL(req.url, 'http://x');
  const slot = Number(url.searchParams.get('slot')) || null;
  if (slot && !(slot >= 1 && slot <= 7)) fail(400, 'Foto inválida.');
  const p = await saveImage(sql, req, { caseId: c.id, kind: slot ? 'avaliacao' : 'extra', slot, uploadedBy: 'paciente' });
  send(res, 201, { id: p.id, slot: p.slot, kind: p.kind });
});

r('GET', '/api/portal/:token/photos/:id', async (req, res, { token: t, id }) => {
  const sql = db();
  const c = await caseByToken(sql, t);
  await sendPhoto(sql, res, sql`select id from photos where id = ${id} and case_id = ${c.id} and uploaded_by = 'paciente'`);
});

r('DELETE', '/api/portal/:token/photos/:id', async (req, res, { token: t, id }) => {
  const sql = db();
  const c = await caseByToken(sql, t);
  if (c.assessment_published_at) fail(409, 'O parecer já foi emitido; fale com a equipe para trocar fotos.');
  await sql`delete from photos where id = ${id} and case_id = ${c.id} and uploaded_by = 'paciente'`;
  send(res, 200, { ok: true });
});

r('POST', '/api/portal/:token/submit', async (req, res, { token: t }) => {
  const sql = db();
  const c = await caseByToken(sql, t);
  const [{ n }] = await sql`select count(distinct slot)::int as n from photos where case_id = ${c.id} and kind = 'avaliacao'`;
  if (n < 7) fail(400, `Faltam ${7 - n} foto(s) para completar a pré-avaliação.`);
  const first = !c.photos_submitted_at;
  await sql`update cases set photos_submitted_at = now(), updated_at = now(),
            status = case when status = 'novo' then 'fotos_enviadas' else status end where id = ${c.id}`;
  await logEvent(sql, { caseId: c.id, actor: 'paciente', type: 'fotos_enviadas' });
  if (first) {
    await sendMail({
      to: notifyAddress(),
      subject: `Fotos recebidas — caso #${c.code} (${c.name})`,
      html: layout('Fotos da pré-avaliação recebidas', para(`${c.name} (${c.city}) enviou as 7 fotos.`) + button(`${appUrl()}/painel#/caso/${c.id}`, 'Avaliar agora')),
    });
  }
  send(res, 200, { ok: true });
});

// Paciente pede teleorientação
r('POST', '/api/portal/:token/teleorientacao', async (req, res, { token: t }) => {
  const sql = db();
  const c = await caseByToken(sql, t);
  const b = await readJson(req);
  await rateLimit(sql, `tele:${c.id}`, 3, 60 * 24);
  const pref = clean(b.preference, 300);
  await logEvent(sql, { caseId: c.id, actor: 'paciente', type: 'pedido_teleorientacao', data: { pref } });
  await sendMail({
    to: notifyAddress(),
    subject: `Pedido de teleorientação — caso #${c.code}`,
    html: layout('Paciente pediu teleorientação', table([['Paciente', c.name], ['WhatsApp', c.whatsapp], ['Preferência de horário', pref]]) + button(`${appUrl()}/painel#/caso/${c.id}`, 'Agendar no painel')),
  });
  send(res, 200, { ok: true });
});

// ------------------------------------------------------------------ contratos (link com token)

r('GET', '/api/contracts/:token', async (req, res, { token: t }) => {
  const sql = db();
  const [ct] = await sql`select id, kind, title, body, body_hash, status, accepted_at, accepted_name, accepted_doc, case_id, dentist_id
    from contracts where token = ${String(t)}`;
  if (!ct || ct.status === 'cancelado') fail(404, 'Contrato não encontrado ou substituído por uma versão mais nova.');
  let signer = {};
  if (ct.kind === 'paciente') {
    const [c] = await sql`select name, cpf from cases where id = ${ct.case_id}`;
    signer = { name: c?.name, doc: c?.cpf, docLabel: 'CPF' };
  } else {
    const d = await dentistById(sql, ct.dentist_id);
    signer = { name: d?.name, doc: d?.cpf_cnpj, docLabel: 'CPF ou CNPJ' };
  }
  send(res, 200, {
    kind: ct.kind, title: ct.title, body: ct.body, hash: ct.body_hash, status: ct.status,
    acceptedAt: ct.accepted_at, acceptedName: ct.accepted_name, acceptedDoc: ct.accepted_doc ? ct.accepted_doc.replace(/\d(?=\d{2})/g, '•') : null,
    signer: { name: signer.name, docLabel: signer.docLabel, hasDoc: Boolean(signer.doc) },
    draft: !contractsReviewed(),
  }, { 'Cache-Control': 'no-store' });
});

r('POST', '/api/contracts/:token/accept', async (req, res, { token: t }) => {
  const sql = db();
  const b = await readJson(req);
  const [ct] = await sql`select * from contracts where token = ${String(t)}`;
  if (!ct || ct.status === 'cancelado') fail(404, 'Contrato não encontrado.');
  if (ct.status === 'aceito') fail(409, 'Este contrato já foi aceito.');
  if (!b.agree) fail(400, 'Marque a caixa de concordância para aceitar.');
  if (b.hash !== ct.body_hash) fail(409, 'O contrato foi atualizado. Recarregue a página e leia a versão nova.');
  const name = clean(b.name, 120);
  const doc = digits(b.doc);
  if (name.length < 3) fail(400, 'Digite seu nome completo.');
  await rateLimit(sql, `accept:${ct.id}`, 10, 60);
  let expectedName = '';
  if (ct.kind === 'paciente') {
    if (!validCpf(doc)) fail(400, 'CPF inválido.');
    const [c] = await sql`select * from cases where id = ${ct.case_id}`;
    if (c.cpf && digits(c.cpf) !== doc) fail(400, 'O CPF não confere com o informado no contrato.');
    expectedName = c.name;
  } else {
    if (!validCpfCnpj(doc)) fail(400, 'CPF ou CNPJ inválido.');
    const d = await dentistById(sql, ct.dentist_id);
    if (d.cpf_cnpj && digits(d.cpf_cnpj) !== doc) fail(400, 'O documento não confere com o informado no termo.');
    expectedName = d.name;
  }
  const ip = clientIp(req);
  const ua = clean(req.headers['user-agent'], 300);
  await sql.begin(async (tx) => {
    await tx`update contracts set status = 'aceito', accepted_at = now(), accepted_name = ${name}, accepted_doc = ${doc},
             accepted_ip = ${ip}, accepted_ua = ${ua} where id = ${ct.id}`;
    if (ct.kind === 'paciente') {
      await tx`update cases set status = 'contrato_assinado', cpf = coalesce(cpf, ${doc}), updated_at = now()
               where id = ${ct.case_id} and status in ('novo','fotos_enviadas','parecer_enviado','documentacao_agendada','documentacao_realizada','plano_apresentado','contrato_enviado')`;
      await logEvent(tx, { caseId: ct.case_id, actor: 'paciente', type: 'contrato_aceito', data: { ip, hash: ct.body_hash } });
    } else {
      await tx`update dentists set status = 'ativo', cpf_cnpj = coalesce(cpf_cnpj, ${doc}), updated_at = now() where id = ${ct.dentist_id}`;
      await logEvent(tx, { dentistId: ct.dentist_id, actor: 'parceiro', type: 'termo_aceito', data: { ip, hash: ct.body_hash } });
    }
  });
  await sendMail({
    to: notifyAddress(),
    subject: `${ct.kind === 'paciente' ? 'Contrato do paciente' : 'Termo de Adesão'} aceito — ${name}`,
    html: layout('Contrato aceito eletronicamente', table([
      ['Documento', ct.title], ['Nome digitado', name], ['Nome no cadastro', expectedName], ['CPF/CNPJ', doc], ['IP', ip], ['Hash SHA-256', ct.body_hash],
    ]) + button(contractUrl(t), 'Ver contrato')),
  });
  send(res, 200, { ok: true });
});

// ------------------------------------------------------------------ autenticação

r('POST', '/api/auth/login', async (req, res) => {
  const sql = db();
  const b = await readJson(req);
  const email = clean(b.email, 160).toLowerCase();
  await rateLimit(sql, `login:${clientIp(req)}`, 20, 15);
  const [u] = await sql`select * from users where email = ${email}`;
  if (u?.locked_until && new Date(u.locked_until) > new Date()) fail(429, 'Conta bloqueada temporariamente por tentativas erradas. Tente em 15 minutos.');
  const ok = u && u.active && (await verifyPassword(String(b.password || ''), u.password_hash));
  if (!ok) {
    if (u) await sql`update users set failed_logins = failed_logins + 1,
      locked_until = case when failed_logins + 1 >= 5 then now() + interval '15 minutes' else null end where id = ${u.id}`;
    fail(401, 'E-mail ou senha incorretos.');
  }
  await sql`update users set failed_logins = 0, locked_until = null, last_login_at = now() where id = ${u.id}`;
  send(res, 200, { ok: true, role: u.role }, { 'Set-Cookie': sessionCookie(u) });
});

r('POST', '/api/auth/logout', async (req, res) => send(res, 200, { ok: true }, { 'Set-Cookie': clearCookie() }));

r('GET', '/api/auth/me', async (req, res) => {
  const sql = db();
  const u = await currentUser(sql, req);
  if (!u) return send(res, 200, { user: null });
  let dentist = null;
  if (u.dentist_id) {
    const d = await dentistById(sql, u.dentist_id);
    dentist = d && { id: d.id, name: d.name, status: d.status, cro: d.cro, croUf: d.cro_uf, hasWallet: Boolean(d.asaas_wallet_id) };
  }
  send(res, 200, { user: { id: u.id, email: u.email, name: u.name, role: u.role }, dentist });
});

r('POST', '/api/auth/password', async (req, res) => {
  const sql = db();
  const u = await requireUser(sql, req);
  const b = await readJson(req);
  const [row] = await sql`select password_hash from users where id = ${u.id}`;
  if (!(await verifyPassword(String(b.current || ''), row.password_hash))) fail(400, 'Senha atual incorreta.');
  const problem = passwordProblem(b.password);
  if (problem) fail(400, problem);
  await sql`update users set password_hash = ${await hashPassword(b.password)} where id = ${u.id}`;
  send(res, 200, { ok: true });
});

r('POST', '/api/auth/set-password', async (req, res) => {
  const sql = db();
  const b = await readJson(req);
  const problem = passwordProblem(b.password);
  if (problem) fail(400, problem);
  await rateLimit(sql, `setpw:${clientIp(req)}`, 10, 60);
  const userId = await consumePasswordToken(sql, b.token);
  if (!userId) fail(400, 'Link inválido ou expirado. Peça um novo à equipe AlignSystem.');
  const [u] = await sql`update users set password_hash = ${await hashPassword(b.password)}, failed_logins = 0, locked_until = null
    where id = ${userId} returning *`;
  send(res, 200, { ok: true, role: u.role }, { 'Set-Cookie': sessionCookie(u) });
});

// Primeiro administrador: só funciona com ADMIN_BOOTSTRAP_TOKEN definido e enquanto não houver admin.
r('POST', '/api/auth/bootstrap', async (req, res) => {
  const sql = db();
  const expected = process.env.ADMIN_BOOTSTRAP_TOKEN;
  const got = String(req.headers['x-bootstrap-token'] || '');
  if (!expected || expected.length < 24 || got !== expected) fail(404, 'Rota não encontrada.');
  const [{ n }] = await sql`select count(*)::int as n from users where role = 'admin'`;
  if (n > 0) fail(409, 'Já existe administrador.');
  const b = await readJson(req);
  const email = clean(b.email, 160).toLowerCase();
  if (!isEmail(email)) fail(400, 'E-mail inválido.');
  const [u] = await sql`insert into users (email, name, role) values (${email}, ${clean(b.name, 120) || email}, 'admin') returning id`;
  const t = await createPasswordToken(sql, u.id, 72);
  send(res, 201, { setPasswordUrl: `${appUrl()}/definir-senha?t=${t}` });
});

r('POST', '/api/auth/forgot', async (req, res) => {
  const sql = db();
  const b = await readJson(req);
  const email = clean(b.email, 160).toLowerCase();
  await rateLimit(sql, `forgot:${clientIp(req)}`, 5, 60);
  const [u] = await sql`select id, name, email from users where email = ${email} and active`;
  if (u) {
    const t = await createPasswordToken(sql, u.id, 2);
    await sendMail({
      to: u.email,
      subject: 'Redefinir sua senha — AlignSystem',
      html: layout('Redefinição de senha', para('Use o botão abaixo para criar uma nova senha. O link vale por 2 horas.') + button(`${appUrl()}/definir-senha?t=${t}`, 'Criar nova senha')),
    });
  }
  send(res, 200, { ok: true });
});

// ------------------------------------------------------------------ fotos (equipe)

r('GET', '/api/photos/:id', async (req, res, { id }) => {
  const sql = db();
  const u = await requireUser(sql, req);
  if (u.role === 'admin') return sendPhoto(sql, res, sql`select id from photos where id = ${id}`);
  await sendPhoto(sql, res, sql`select p.id from photos p join cases c on c.id = p.case_id
    where p.id = ${id} and c.dentist_id = ${u.dentist_id}`);
});

// ------------------------------------------------------------------ admin

r('GET', '/api/admin/overview', async (req, res) => {
  const sql = db();
  await requireUser(sql, req, 'admin');
  const cases = await sql`select status, count(*)::int as n from cases group by status`;
  const dentists = await sql`select status, count(*)::int as n from dentists group by status`;
  const [paid] = await sql`select coalesce(sum(value),0)::float as total, count(*)::int as n from payments
    where status in ('RECEIVED','CONFIRMED','RECEIVED_IN_CASH') and paid_at > now() - interval '30 days'`;
  send(res, 200, {
    cases: Object.fromEntries(cases.map((x) => [x.status, x.n])),
    dentists: Object.fromEntries(dentists.map((x) => [x.status, x.n])),
    paid30: paid,
    labels: { CASE_STATUS, DENTIST_STATUS, ASSESSMENT, MILESTONES },
    integrations: {
      asaas: asaas.asaasConfigured() ? asaas.asaasEnv() : null,
      email: process.env.SMTP_HOST ? 'smtp' : process.env.RESEND_API_KEY ? 'resend' : null,
      whatsapp: Boolean(digits(process.env.PUBLIC_WHATSAPP || '')) && !/^5544900000000$/.test(digits(process.env.PUBLIC_WHATSAPP || '')),
      contractsReviewed: contractsReviewed(),
    },
  });
});

r('GET', '/api/admin/cases', async (req, res) => {
  const sql = db();
  await requireUser(sql, req, 'admin');
  const url = new URL(req.url, 'http://x');
  const status = url.searchParams.get('status') || '';
  const q = clean(url.searchParams.get('q'), 80);
  const qDigits = digits(q) || '__nenhum__';
  const rows = await sql`select c.id, c.code, c.name, c.city, c.whatsapp, c.status, c.assessment, c.created_at, c.photos_submitted_at,
      d.name as dentist_name,
      (select count(*)::int from photos p where p.case_id = c.id and p.kind = 'avaliacao') as photo_count
    from cases c left join dentists d on d.id = c.dentist_id
    where (${status} = '' or c.status = ${status})
      and (${q} = '' or c.name ilike ${'%' + q + '%'} or c.city ilike ${'%' + q + '%'} or c.whatsapp like ${'%' + qDigits + '%'} or c.code::text = ${q})
    order by c.created_at desc limit 300`;
  send(res, 200, { cases: rows, labels: CASE_STATUS });
});

async function caseDetail(sql, id) {
  const [c] = await sql`select * from cases where id = ${id}`;
  if (!c) fail(404, 'Caso não encontrado.');
  const [photos, appts, contracts, charges, payments, evidences, events] = await Promise.all([
    photoMeta(sql, id),
    sql`select a.*, d.name as dentist_name from appointments a left join dentists d on d.id = a.dentist_id where case_id = ${id} order by starts_at desc`,
    sql`select id, kind, token, title, status, accepted_at, accepted_name, accepted_ip, body_hash, created_at from contracts where case_id = ${id} order by created_at desc`,
    sql`select * from charges where case_id = ${id} order by created_at desc`,
    sql`select * from payments where case_id = ${id} order by due_date`,
    sql`select e.*, d.name as dentist_name from evidences e left join dentists d on d.id = e.dentist_id where case_id = ${id} order by performed_at desc, created_at desc`,
    sql`select actor, type, data, created_at from events where case_id = ${id} order by created_at desc limit 100`,
  ]);
  return { c, photos, appts, contracts, charges, payments, evidences, events };
}

r('GET', '/api/admin/cases/:id', async (req, res, { id }) => {
  const sql = db();
  await requireUser(sql, req, 'admin');
  const d = await caseDetail(sql, id);
  send(res, 200, {
    case: { ...d.c, portalUrl: portalUrl(d.c.token) },
    photos: d.photos, appointments: d.appts,
    contracts: d.contracts.map((x) => ({ ...x, url: contractUrl(x.token) })),
    charges: d.charges.map((x) => ({ ...x, statusLabel: asaas.STATUS_PT[x.status] || x.status })),
    payments: d.payments.map((x) => ({ ...x, statusLabel: asaas.STATUS_PT[x.status] || x.status })),
    evidences: d.evidences, events: d.events,
    labels: { CASE_STATUS, ASSESSMENT, MILESTONES },
    slots: PHOTO_SLOTS,
  });
});

r('PATCH', '/api/admin/cases/:id', async (req, res, { id }) => {
  const sql = db();
  const u = await requireUser(sql, req, 'admin');
  const b = await readJson(req);
  const [c] = await sql`select * from cases where id = ${id}`;
  if (!c) fail(404, 'Caso não encontrado.');
  const up = {};
  if (b.status !== undefined) { if (!CASE_STATUS[b.status]) fail(400, 'Status inválido.'); up.status = b.status; }
  if (b.assessment !== undefined) { if (b.assessment && !ASSESSMENT[b.assessment]) fail(400, 'Parecer inválido.'); up.assessment = b.assessment || null; }
  if (b.assessment_notes !== undefined) up.assessment_notes = clean(b.assessment_notes, 3000) || null;
  if (b.dentist_id !== undefined) up.dentist_id = b.dentist_id || null;
  for (const k of ['name', 'city', 'reason', 'referred_by', 'address', 'internal_notes']) if (b[k] !== undefined) up[k] = clean(b[k], k === 'internal_notes' ? 5000 : 300) || null;
  if (b.email !== undefined) { const em = clean(b.email, 160).toLowerCase(); if (em && !isEmail(em)) fail(400, 'E-mail inválido.'); up.email = em || null; }
  if (b.whatsapp !== undefined) up.whatsapp = digits(b.whatsapp);
  if (b.cpf !== undefined) { const cpf = digits(b.cpf); if (cpf && !validCpf(cpf)) fail(400, 'CPF inválido.'); up.cpf = cpf || null; }
  if (b.postal_code !== undefined) up.postal_code = digits(b.postal_code) || null;
  if (b.plan !== undefined) {
    const p = b.plan || {};
    up.plan = sql.json({
      brand: clean(p.brand, 60), months: Number(p.months) || null, total: money(p.total), entry: money(p.entry),
      entryInstallments: Number(p.entryInstallments) || 18, monthlyCount: Number(p.monthlyCount) || null,
      monthlyValue: money(p.monthlyValue), dueDay: Number(p.dueDay) || null, replacementValue: money(p.replacementValue),
      treatmentNotes: clean(p.treatmentNotes, 4000),
    });
  }
  if (b.publish_assessment) {
    if (!(up.assessment || c.assessment)) fail(400, 'Escolha o parecer antes de publicar.');
    up.assessment_published_at = new Date();
    if (['novo', 'fotos_enviadas'].includes(up.status || c.status)) up.status = 'parecer_enviado';
  }
  if (!Object.keys(up).length) return send(res, 200, { ok: true });
  up.updated_at = new Date();
  await sql`update cases set ${sql(up)} where id = ${id}`;
  await logEvent(sql, { caseId: id, actor: u.email, type: 'caso_atualizado', data: { campos: Object.keys(up).filter((k) => k !== 'updated_at') } });
  if (b.publish_assessment && (up.email ?? c.email)) {
    await sendMail({
      to: up.email ?? c.email,
      subject: 'Seu parecer AlignSystem está pronto',
      html: layout(`Olá, ${c.name.split(' ')[0]}!`, para('A equipe AlignSystem analisou suas fotos. Veja o parecer e os próximos passos no seu link pessoal.') + button(portalUrl(c.token), 'Ver meu parecer')),
    });
  }
  if (b.dentist_id && b.dentist_id !== c.dentist_id) {
    const d = await dentistById(sql, b.dentist_id);
    if (d?.email) await sendMail({
      to: d.email,
      subject: `Novo caso direcionado a você — #${c.code}`,
      html: layout('Novo caso na sua agenda', para(`O caso #${c.code} (${c.city}) foi direcionado a você pela rede AlignSystem.`) + button(`${appUrl()}/painel#/caso/${c.id}`, 'Abrir caso')),
    });
  }
  send(res, 200, { ok: true });
});

r('DELETE', '/api/admin/cases/:id', async (req, res, { id }) => {
  const sql = db();
  const u = await requireUser(sql, req, 'admin');
  const [c] = await sql`select code, name from cases where id = ${id}`;
  if (!c) fail(404, 'Caso não encontrado.');
  const [{ n }] = await sql`select count(*)::int as n from charges where case_id = ${id} and status <> 'cancelado'`;
  if (n) fail(409, 'Há cobranças ativas neste caso. Cancele-as antes de excluir.');
  await sql`delete from cases where id = ${id}`;
  await logEvent(sql, { actor: u.email, type: 'caso_excluido', data: { code: c.code } });
  send(res, 200, { ok: true });
});

r('POST', '/api/admin/cases/:id/photos', async (req, res, { id }) => {
  const sql = db();
  const u = await requireUser(sql, req, 'admin');
  const url = new URL(req.url, 'http://x');
  const slot = Number(url.searchParams.get('slot')) || null;
  const p = await saveImage(sql, req, { caseId: id, kind: slot ? 'avaliacao' : 'documento', slot, uploadedBy: 'admin', userId: u.id, allowPdf: !slot });
  send(res, 201, p);
});

r('DELETE', '/api/admin/photos/:id', async (req, res, { id }) => {
  const sql = db();
  await requireUser(sql, req, 'admin');
  await sql`delete from photos where id = ${id}`;
  send(res, 200, { ok: true });
});

async function addAppointment(sql, u, caseId, b, dentistIdForced) {
  const [c] = await sql`select * from cases where id = ${caseId}`;
  if (!c) fail(404, 'Caso não encontrado.');
  const kind = ['teleorientacao', 'documentacao', 'consulta'].includes(b.kind) ? b.kind : 'teleorientacao';
  const starts = new Date(b.starts_at);
  if (Number.isNaN(starts.getTime())) fail(400, 'Data e hora inválidas.');
  const roomUrl = kind === 'teleorientacao' ? `https://meet.jit.si/AlignSystem-${c.code}-${token(9).replace(/[^A-Za-z0-9]/g, '')}` : null;
  const dentistId = dentistIdForced || b.dentist_id || c.dentist_id || null;
  const [a] = await sql`insert into appointments (case_id, dentist_id, kind, starts_at, duration_min, room_url, location, notes)
    values (${caseId}, ${dentistId}, ${kind}, ${starts}, ${Number(b.duration_min) || 30}, ${roomUrl}, ${clean(b.location, 300) || null}, ${clean(b.notes, 1000) || null})
    returning *`;
  if (kind === 'documentacao') await sql`update cases set status = 'documentacao_agendada', updated_at = now() where id = ${caseId} and status in ('novo','fotos_enviadas','parecer_enviado')`;
  await logEvent(sql, { caseId, actor: u.email, type: 'agendamento', data: { kind, starts_at: starts } });
  const when = starts.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'full', timeStyle: 'short' });
  if (c.email) {
    await sendMail({
      to: c.email,
      subject: kind === 'teleorientacao' ? 'Sua teleorientação AlignSystem está agendada' : 'Seu atendimento AlignSystem está agendado',
      html: layout('Agendamento confirmado', table([['Quando', when], ['Tipo', kind === 'teleorientacao' ? 'Teleorientação por vídeo' : kind === 'documentacao' ? 'Documentação (presencial)' : 'Consulta (presencial)'], ['Local', a.location]]) +
        (roomUrl ? para('No horário marcado, entre pela sua página da avaliação — o botão da chamada de vídeo aparece lá.') : '') + button(portalUrl(c.token), 'Abrir minha avaliação')),
    });
  }
  if (dentistId) {
    const d = await dentistById(sql, dentistId);
    if (d?.email) await sendMail({ to: d.email, subject: `Agendamento — caso #${c.code}`, html: layout('Novo agendamento', table([['Paciente', c.name], ['Quando', when], ['Tipo', kind], ['Sala de vídeo', roomUrl], ['Local', a.location]]) + button(`${appUrl()}/painel#/caso/${c.id}`, 'Abrir caso')) });
  }
  return a;
}

r('POST', '/api/admin/cases/:id/appointments', async (req, res, { id }) => {
  const sql = db();
  const u = await requireUser(sql, req, 'admin');
  send(res, 201, await addAppointment(sql, u, id, await readJson(req)));
});

r('PATCH', '/api/admin/appointments/:id', async (req, res, { id }) => {
  const sql = db();
  await requireUser(sql, req, 'admin');
  const b = await readJson(req);
  if (!['agendado', 'realizado', 'cancelado', 'faltou'].includes(b.status)) fail(400, 'Status inválido.');
  await sql`update appointments set status = ${b.status} where id = ${id}`;
  send(res, 200, { ok: true });
});

r('POST', '/api/admin/cases/:id/contract', async (req, res, { id }) => {
  const sql = db();
  const u = await requireUser(sql, req, 'admin');
  const [c] = await sql`select * from cases where id = ${id}`;
  if (!c) fail(404, 'Caso não encontrado.');
  const plan = c.plan || {};
  const missing = [];
  if (!c.cpf) missing.push('CPF do paciente');
  if (!c.address) missing.push('endereço do paciente');
  if (!c.dentist_id) missing.push('dentista responsável');
  if (!plan.brand) missing.push('marca do alinhador');
  if (!plan.total) missing.push('valor total');
  if (!plan.entry) missing.push('valor da entrada');
  if (!plan.monthlyCount || !plan.monthlyValue) missing.push('mensalidades');
  if (missing.length) fail(400, `Preencha antes de gerar o contrato: ${missing.join(', ')}.`);
  const dentist = await dentistById(sql, c.dentist_id);
  const { title, body } = patientContract(c, dentist);
  await sql`update contracts set status = 'cancelado' where case_id = ${id} and kind = 'paciente' and status = 'enviado'`;
  const t = token(24);
  await sql`insert into contracts (kind, case_id, token, title, body, body_hash, created_by)
    values ('paciente', ${id}, ${t}, ${title}, ${body}, ${sha256(body)}, ${u.id})`;
  await sql`update cases set status = 'contrato_enviado', updated_at = now()
    where id = ${id} and status in ('novo','fotos_enviadas','parecer_enviado','documentacao_agendada','documentacao_realizada','plano_apresentado')`;
  await logEvent(sql, { caseId: id, actor: u.email, type: 'contrato_gerado' });
  if (c.email) await sendMail({
    to: c.email, subject: 'Seu contrato AlignSystem',
    html: layout(`Olá, ${c.name.split(' ')[0]}!`, para('Seu contrato de tratamento está pronto para leitura e aceite eletrônico.') + button(contractUrl(t), 'Ler e aceitar o contrato')),
  });
  send(res, 201, { url: contractUrl(t) });
});

// Cobrança pelo Asaas, com split opcional para o dentista do caso
r('POST', '/api/admin/cases/:id/charges', async (req, res, { id }) => {
  const sql = db();
  const u = await requireUser(sql, req, 'admin');
  const b = await readJson(req);
  const [c] = await sql`select * from cases where id = ${id}`;
  if (!c) fail(404, 'Caso não encontrado.');
  if (!c.cpf) fail(400, 'Cadastre o CPF do paciente antes de cobrar.');
  const kind = ['avulsa', 'parcelada', 'assinatura'].includes(b.kind) ? b.kind : 'avulsa';
  const billingType = ['UNDEFINED', 'PIX', 'CREDIT_CARD', 'BOLETO'].includes(b.billingType) ? b.billingType : 'UNDEFINED';
  const value = money(b.value);
  if (!(value > 0)) fail(400, 'Informe o valor.');
  const installments = kind === 'parcelada' ? Math.min(Math.max(Number(b.installmentCount) || 1, 2), billingType === 'CREDIT_CARD' ? 18 : 36) : 1;
  const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(b.dueDate || '') ? b.dueDate : new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10);
  const description = clean(b.description, 200) || `AlignSystem — caso #${c.code}`;
  let split = null;
  if (b.split?.value && Number(b.split.value) > 0) {
    const d = await dentistById(sql, c.dentist_id);
    if (!d) fail(400, 'Defina o dentista do caso para dividir o pagamento.');
    if (!d.asaas_wallet_id) fail(400, `${d.name} ainda não tem conta de recebimento (walletId) cadastrada.`);
    const type = b.split.type === 'percent' ? 'percent' : 'fixed';
    const sv = money(b.split.value);
    if (type === 'percent' && sv >= 100) fail(400, 'Percentual de repasse inválido.');
    if (type === 'fixed' && sv >= value) fail(400, 'O repasse precisa ser menor que o valor cobrado.');
    split = { walletId: d.asaas_wallet_id, type, value: sv, dentistId: d.id };
  }
  const customer = c.asaas_customer_id || (await asaas.ensureCustomer({
    name: c.name, cpfCnpj: digits(c.cpf), email: c.email, mobilePhone: c.whatsapp.replace(/^55/, ''), externalReference: c.id,
  }));
  if (!c.asaas_customer_id) await sql`update cases set asaas_customer_id = ${customer} where id = ${id}`;
  const [ch] = await sql`insert into charges (case_id, dentist_id, kind, description, billing_type, value, installment_count, due_date, split, created_by)
    values (${id}, ${split?.dentistId || null}, ${kind}, ${description}, ${billingType}, ${value}, ${kind === 'assinatura' ? Number(b.maxPayments) || null : installments},
            ${dueDate}, ${split ? sql.json(split) : null}, ${u.id}) returning id`;
  try {
    if (kind === 'assinatura') {
      const s = await asaas.createSubscription({
        customer, billingType, value, nextDueDate: dueDate, description, maxPayments: b.maxPayments, split, externalReference: ch.id,
      });
      await sql`update charges set asaas_subscription_id = ${s.id}, status = ${s.status || 'ACTIVE'} where id = ${ch.id}`;
    } else {
      const p = await asaas.createPayment({ customer, billingType, value, dueDate, description, installmentCount: installments, split, externalReference: ch.id });
      await sql`update charges set asaas_payment_id = ${p.id}, asaas_installment_id = ${p.installment || null},
               invoice_url = ${p.invoiceUrl}, status = ${p.status} where id = ${ch.id}`;
    }
  } catch (e) {
    await sql`update charges set status = 'erro' where id = ${ch.id}`;
    throw e;
  }
  await syncCharge(sql, ch.id);
  await logEvent(sql, { caseId: id, actor: u.email, type: 'cobranca_criada', data: { kind, value, installments, split: split && { type: split.type, value: split.value } } });
  const [out] = await sql`select * from charges where id = ${ch.id}`;
  if (c.email && out.invoice_url) await sendMail({
    to: c.email, subject: `Cobrança AlignSystem — ${description}`,
    html: layout('Sua cobrança está disponível', table([['Descrição', description], ['Valor', brl(value)], ['Parcelas', installments > 1 ? `${installments}x` : '']]) + button(out.invoice_url, 'Pagar agora')),
  });
  send(res, 201, out);
});

// Busca os pagamentos individuais no Asaas e grava/atualiza localmente
async function syncCharge(sql, chargeId) {
  const [ch] = await sql`select * from charges where id = ${chargeId}`;
  if (!ch || !asaas.asaasConfigured()) return;
  let list = [];
  if (ch.asaas_subscription_id) list = (await asaas.listSubscriptionPayments(ch.asaas_subscription_id)).data || [];
  else if (ch.asaas_installment_id) list = (await asaas.listInstallmentPayments(ch.asaas_installment_id)).data || [];
  else if (ch.asaas_payment_id) list = [await asaas.getPayment(ch.asaas_payment_id)];
  for (const p of list) await upsertPayment(sql, p, ch);
  if (list.length && !ch.invoice_url) await sql`update charges set invoice_url = ${list[0].invoiceUrl} where id = ${ch.id}`;
}

async function upsertPayment(sql, p, ch) {
  const paidAt = asaas.PAID.has(p.status) ? (p.clientPaymentDate || p.paymentDate || p.confirmedDate || new Date().toISOString()) : null;
  await sql`insert into payments (asaas_payment_id, charge_id, case_id, value, net_value, due_date, status, billing_type, invoice_url, paid_at, updated_at)
    values (${p.id}, ${ch?.id || null}, ${ch?.case_id || null}, ${p.value}, ${p.netValue ?? null}, ${p.dueDate}, ${p.status}, ${p.billingType}, ${p.invoiceUrl}, ${paidAt}, now())
    on conflict (asaas_payment_id) do update set status = excluded.status, value = excluded.value, net_value = excluded.net_value,
      due_date = excluded.due_date, billing_type = excluded.billing_type, invoice_url = excluded.invoice_url,
      paid_at = coalesce(excluded.paid_at, payments.paid_at), updated_at = now(),
      charge_id = coalesce(payments.charge_id, excluded.charge_id), case_id = coalesce(payments.case_id, excluded.case_id)`;
  if (ch && !ch.asaas_subscription_id && !ch.asaas_installment_id) await sql`update charges set status = ${p.status}, updated_at = now() where id = ${ch.id}`;
}

r('POST', '/api/admin/charges/:id/sync', async (req, res, { id }) => {
  const sql = db();
  await requireUser(sql, req, 'admin');
  await syncCharge(sql, id);
  send(res, 200, { ok: true });
});

r('POST', '/api/admin/charges/:id/cancel', async (req, res, { id }) => {
  const sql = db();
  const u = await requireUser(sql, req, 'admin');
  const [ch] = await sql`select * from charges where id = ${id}`;
  if (!ch) fail(404, 'Cobrança não encontrada.');
  if (ch.asaas_subscription_id) await asaas.cancelSubscription(ch.asaas_subscription_id);
  else if (ch.asaas_payment_id && !ch.asaas_installment_id) await asaas.cancelPayment(ch.asaas_payment_id);
  else if (ch.asaas_installment_id) {
    const pend = await sql`select asaas_payment_id from payments where charge_id = ${id} and status in ('PENDING','OVERDUE')`;
    for (const p of pend) await asaas.cancelPayment(p.asaas_payment_id);
  }
  await sql`update charges set status = 'cancelado', updated_at = now() where id = ${id}`;
  await logEvent(sql, { caseId: ch.case_id, actor: u.email, type: 'cobranca_cancelada', data: { id } });
  send(res, 200, { ok: true });
});

r('POST', '/api/admin/evidences/:id/validate', async (req, res, { id }) => {
  const sql = db();
  const u = await requireUser(sql, req, 'admin');
  const [e] = await sql`update evidences set validated_at = now(), validated_by = ${u.id} where id = ${id} and validated_at is null returning *`;
  if (e) {
    await logEvent(sql, { caseId: e.case_id, dentistId: e.dentist_id, actor: u.email, type: 'evidencia_validada', data: { milestone: e.milestone } });
    const d = await dentistById(sql, e.dentist_id);
    if (d?.email) await sendMail({ to: d.email, subject: 'Atendimento validado — AlignSystem', html: layout('Atendimento validado', para(`O registro "${MILESTONES[e.milestone]}" foi validado pela equipe. O repasse segue o prazo do seu Termo de Adesão.`)) });
  }
  send(res, 200, { ok: true });
});

// Parceiros
r('GET', '/api/admin/dentists', async (req, res) => {
  const sql = db();
  await requireUser(sql, req, 'admin');
  const rows = await sql`select d.id, d.name, d.cro, d.cro_uf, d.city, d.phone, d.email, d.status, d.created_at, d.asaas_wallet_id is not null as has_wallet,
      (select count(*)::int from cases c where c.dentist_id = d.id) as case_count,
      (select status from contracts ct where ct.dentist_id = d.id and ct.kind = 'parceiro' and ct.status <> 'cancelado' order by created_at desc limit 1) as term_status
    from dentists d order by d.created_at desc limit 500`;
  send(res, 200, { dentists: rows, labels: DENTIST_STATUS });
});

r('GET', '/api/admin/dentists/:id', async (req, res, { id }) => {
  const sql = db();
  await requireUser(sql, req, 'admin');
  const d = await dentistById(sql, id);
  if (!d) fail(404, 'Parceiro não encontrado.');
  const [contracts, cases, users, events, evidences] = await Promise.all([
    sql`select id, token, title, status, accepted_at, accepted_ip, body_hash, created_at from contracts where dentist_id = ${id} order by created_at desc`,
    sql`select id, code, name, city, status from cases where dentist_id = ${id} order by created_at desc`,
    sql`select id, email, active, last_login_at, password_hash is not null as has_password from users where dentist_id = ${id}`,
    sql`select actor, type, data, created_at from events where dentist_id = ${id} order by created_at desc limit 50`,
    sql`select e.*, c.code from evidences e join cases c on c.id = e.case_id where e.dentist_id = ${id} order by e.created_at desc limit 100`,
  ]);
  send(res, 200, {
    dentist: d,
    contracts: contracts.map((x) => ({ ...x, url: contractUrl(x.token) })),
    cases, users, events, evidences,
    labels: { DENTIST_STATUS, CASE_STATUS, MILESTONES },
    partnerDefaults: PARTNER_DEFAULTS,
    asaas: asaas.asaasConfigured() ? asaas.asaasEnv() : null,
  });
});

r('PATCH', '/api/admin/dentists/:id', async (req, res, { id }) => {
  const sql = db();
  const u = await requireUser(sql, req, 'admin');
  const b = await readJson(req);
  const up = {};
  for (const k of ['name', 'city', 'state', 'experience', 'address', 'address_number', 'province', 'notes', 'company_type', 'cro_uf']) {
    if (b[k] !== undefined) up[k] = clean(b[k], k === 'notes' ? 5000 : 200) || null;
  }
  if (b.cro !== undefined) up.cro = digits(b.cro);
  if (b.phone !== undefined) up.phone = digits(b.phone);
  if (b.postal_code !== undefined) up.postal_code = digits(b.postal_code) || null;
  if (b.email !== undefined) { const em = clean(b.email, 160).toLowerCase(); if (em && !isEmail(em)) fail(400, 'E-mail inválido.'); up.email = em || null; }
  if (b.cpf_cnpj !== undefined) { const doc = digits(b.cpf_cnpj); if (doc && !validCpfCnpj(doc)) fail(400, 'CPF/CNPJ inválido.'); up.cpf_cnpj = doc || null; }
  if (b.birth_date !== undefined) up.birth_date = b.birth_date || null;
  if (b.income_value !== undefined) up.income_value = money(b.income_value);
  if (b.asaas_wallet_id !== undefined) up.asaas_wallet_id = clean(b.asaas_wallet_id, 80) || null;
  if (b.status !== undefined) { if (!DENTIST_STATUS[b.status]) fail(400, 'Status inválido.'); up.status = b.status; }
  if (!Object.keys(up).length) return send(res, 200, { ok: true });
  up.updated_at = new Date();
  await sql`update dentists set ${sql(up)} where id = ${id}`;
  if (up.status === 'inativo' || up.status === 'recusado') await sql`update users set active = false where dentist_id = ${id}`;
  if (up.status === 'ativo' || up.status === 'aprovado') await sql`update users set active = true where dentist_id = ${id}`;
  if (up.email) await sql`update users set email = ${up.email} where dentist_id = ${id}`;
  await logEvent(sql, { dentistId: id, actor: u.email, type: 'parceiro_atualizado', data: { campos: Object.keys(up).filter((k) => k !== 'updated_at') } });
  send(res, 200, { ok: true });
});

// Aprovar credenciamento: cria acesso ao painel + Termo de Adesão para aceite
r('POST', '/api/admin/dentists/:id/approve', async (req, res, { id }) => {
  const sql = db();
  const u = await requireUser(sql, req, 'admin');
  const b = await readJson(req);
  const d = await dentistById(sql, id);
  if (!d) fail(404, 'Parceiro não encontrado.');
  if (!d.email) fail(400, 'Cadastre o e-mail do dentista.');
  const terms = {};
  for (const k of Object.keys(PARTNER_DEFAULTS)) if (b.terms?.[k] !== undefined && b.terms[k] !== '') terms[k] = money(b.terms[k]);
  if ((terms.pctInstall ?? PARTNER_DEFAULTS.pctInstall) + (terms.pctStart ?? PARTNER_DEFAULTS.pctStart) + (terms.pctFinish ?? PARTNER_DEFAULTS.pctFinish) !== 100) {
    fail(400, 'Os percentuais dos marcos precisam somar 100%.');
  }
  let [user] = await sql`select * from users where dentist_id = ${id} or email = ${d.email}`;
  if (user && user.role === 'admin') fail(409, 'Este e-mail já pertence a um administrador.');
  if (!user) [user] = await sql`insert into users (email, name, role, dentist_id) values (${d.email}, ${d.name}, 'dentist', ${id}) returning *`;
  else await sql`update users set dentist_id = ${id}, active = true where id = ${user.id}`;
  const ct = await createPartnerContract(sql, d, terms, u.id);
  if (d.status === 'lead' || d.status === 'em_analise') await sql`update dentists set status = 'aprovado', updated_at = now() where id = ${id}`;
  const pw = await createPasswordToken(sql, user.id, 24 * 7);
  const setUrl = `${appUrl()}/definir-senha?t=${pw}`;
  await logEvent(sql, { dentistId: id, actor: u.email, type: 'parceiro_aprovado', data: { terms } });
  const mail = await sendMail({
    to: d.email, subject: 'Bem-vindo(a) à rede AlignSystem — próximos passos',
    html: layout(`Olá, ${d.name.split(' ')[0]}!`, para('Seu credenciamento foi aprovado. São dois passos:') +
      para('1) Leia e aceite o Termo de Adesão:') + button(contractUrl(ct.token), 'Ler o Termo de Adesão') +
      para('2) Crie sua senha de acesso ao painel do parceiro (o link vale 7 dias):') + button(setUrl, 'Criar minha senha')),
  });
  send(res, 200, { contractUrl: contractUrl(ct.token), setPasswordUrl: setUrl, emailed: Boolean(mail.sent) });
});

r('POST', '/api/admin/dentists/:id/access-link', async (req, res, { id }) => {
  const sql = db();
  await requireUser(sql, req, 'admin');
  const [user] = await sql`select id from users where dentist_id = ${id}`;
  if (!user) fail(400, 'Aprove o parceiro primeiro.');
  const t = await createPasswordToken(sql, user.id, 24 * 7);
  send(res, 200, { setPasswordUrl: `${appUrl()}/definir-senha?t=${t}` });
});

r('POST', '/api/admin/dentists/:id/asaas-account', async (req, res, { id }) => {
  const sql = db();
  const u = await requireUser(sql, req, 'admin');
  const d = await dentistById(sql, id);
  if (!d) fail(404, 'Parceiro não encontrado.');
  if (d.asaas_wallet_id) fail(409, 'Este parceiro já tem conta de recebimento.');
  const missing = [];
  if (!d.cpf_cnpj) missing.push('CPF/CNPJ');
  if (!d.email) missing.push('e-mail');
  if (d.cpf_cnpj && digits(d.cpf_cnpj).length === 11 && !d.birth_date) missing.push('data de nascimento');
  if (!d.address || !d.address_number || !d.province || !d.postal_code) missing.push('endereço completo (rua, número, bairro, CEP)');
  if (missing.length) fail(400, `Preencha antes: ${missing.join(', ')}.`);
  const birth = d.birth_date ? new Date(d.birth_date).toISOString().slice(0, 10) : undefined;
  const acc = await asaas.createSubaccount({ ...d, birth_date: birth });
  await sql`update dentists set asaas_account_id = ${acc.id}, asaas_wallet_id = ${acc.walletId}, updated_at = now() where id = ${id}`;
  await logEvent(sql, { dentistId: id, actor: u.email, type: 'subconta_asaas_criada', data: { account: acc.id } });
  send(res, 201, { walletId: acc.walletId });
});

// Usuários administradores
r('GET', '/api/admin/users', async (req, res) => {
  const sql = db();
  await requireUser(sql, req, 'admin');
  send(res, 200, { users: await sql`select id, email, name, role, active, last_login_at, created_at from users where role = 'admin' order by created_at` });
});

r('POST', '/api/admin/users', async (req, res) => {
  const sql = db();
  const u = await requireUser(sql, req, 'admin');
  const b = await readJson(req);
  const email = clean(b.email, 160).toLowerCase();
  if (!isEmail(email)) fail(400, 'E-mail inválido.');
  const name = clean(b.name, 120) || email;
  const [exists] = await sql`select id from users where email = ${email}`;
  if (exists) fail(409, 'Já existe um usuário com este e-mail.');
  const [nu] = await sql`insert into users (email, name, role) values (${email}, ${name}, 'admin') returning id`;
  const t = await createPasswordToken(sql, nu.id, 72);
  const url = `${appUrl()}/definir-senha?t=${t}`;
  await sendMail({ to: email, subject: 'Acesso ao painel AlignSystem', html: layout('Você recebeu acesso ao painel', para(`${u.name} criou seu acesso de administrador.`) + button(url, 'Criar minha senha')) });
  send(res, 201, { setPasswordUrl: url });
});

r('PATCH', '/api/admin/users/:id', async (req, res, { id }) => {
  const sql = db();
  const u = await requireUser(sql, req, 'admin');
  const b = await readJson(req);
  if (id === u.id) fail(400, 'Você não pode desativar o próprio acesso.');
  await sql`update users set active = ${Boolean(b.active)} where id = ${id} and role = 'admin'`;
  send(res, 200, { ok: true });
});

// ------------------------------------------------------------------ dentista parceiro

async function dentistUser(sql, req) {
  const u = await requireUser(sql, req, 'dentist');
  if (!u.dentist_id) fail(403, 'Conta sem cadastro de parceiro.');
  return u;
}

async function dentistCase(sql, u, id) {
  const [c] = await sql`select * from cases where id = ${id} and dentist_id = ${u.dentist_id}`;
  if (!c) fail(404, 'Caso não encontrado.');
  return c;
}

r('GET', '/api/dentist/overview', async (req, res) => {
  const sql = db();
  const u = await dentistUser(sql, req);
  const d = await dentistById(sql, u.dentist_id);
  const cases = await sql`select id, code, name, city, status, updated_at from cases where dentist_id = ${u.dentist_id} order by updated_at desc`;
  const appts = await sql`select a.id, a.kind, a.starts_at, a.room_url, a.location, a.status, c.code, c.name, c.id as case_id
    from appointments a join cases c on c.id = a.case_id where a.dentist_id = ${u.dentist_id} and a.starts_at > now() - interval '1 day' and a.status = 'agendado' order by a.starts_at limit 30`;
  const [term] = await sql`select token, status, accepted_at from contracts where dentist_id = ${u.dentist_id} and kind = 'parceiro' and status <> 'cancelado' order by created_at desc limit 1`;
  const evidences = await sql`select e.id, e.milestone, e.performed_at, e.validated_at, c.code from evidences e join cases c on c.id = e.case_id
    where e.dentist_id = ${u.dentist_id} order by e.created_at desc limit 50`;
  send(res, 200, {
    dentist: { name: d.name, cro: d.cro, croUf: d.cro_uf, status: d.status, hasWallet: Boolean(d.asaas_wallet_id) },
    term: term ? { status: term.status, acceptedAt: term.accepted_at, url: `/contrato?t=${term.token}` } : null,
    cases, appointments: appts, evidences,
    labels: { CASE_STATUS, MILESTONES },
  });
});

r('GET', '/api/dentist/cases/:id', async (req, res, { id }) => {
  const sql = db();
  const u = await dentistUser(sql, req);
  const c = await dentistCase(sql, u, id);
  const [photos, appts, evidences] = await Promise.all([
    photoMeta(sql, id),
    sql`select * from appointments where case_id = ${id} order by starts_at desc`,
    sql`select * from evidences where case_id = ${id} order by performed_at desc, created_at desc`,
  ]);
  send(res, 200, {
    case: {
      id: c.id, code: c.code, name: c.name, age: c.age, city: c.city, whatsapp: c.whatsapp, reason: c.reason, status: c.status,
      assessment: c.assessment, assessment_notes: c.assessment_notes, plan: { brand: c.plan?.brand, months: c.plan?.months, treatmentNotes: c.plan?.treatmentNotes },
    },
    photos, appointments: appts, evidences,
    labels: { CASE_STATUS, ASSESSMENT, MILESTONES },
    slots: PHOTO_SLOTS,
  });
});

r('POST', '/api/dentist/cases/:id/evidences', async (req, res, { id }) => {
  const sql = db();
  const u = await dentistUser(sql, req);
  const c = await dentistCase(sql, u, id);
  const b = await readJson(req);
  if (!MILESTONES[b.milestone]) fail(400, 'Escolha o tipo de atendimento.');
  const performed = /^\d{4}-\d{2}-\d{2}$/.test(b.performed_at || '') ? b.performed_at : new Date().toISOString().slice(0, 10);
  const [e] = await sql`insert into evidences (case_id, dentist_id, milestone, notes, performed_at)
    values (${id}, ${u.dentist_id}, ${b.milestone}, ${clean(b.notes, 3000) || null}, ${performed}) returning *`;
  if (b.milestone === 'instalacao' || b.milestone === 'inicio_alinhadores') {
    await sql`update cases set status = 'em_tratamento', updated_at = now() where id = ${id} and status in ('contrato_assinado','documentacao_realizada','plano_apresentado')`;
  }
  if (b.milestone === 'documentacao') await sql`update cases set status = 'documentacao_realizada', updated_at = now() where id = ${id} and status in ('documentacao_agendada','parecer_enviado','fotos_enviadas','novo')`;
  if (b.milestone === 'finalizacao') await sql`update cases set status = 'finalizado', updated_at = now() where id = ${id} and status = 'em_tratamento'`;
  await logEvent(sql, { caseId: id, dentistId: u.dentist_id, actor: u.email, type: 'evidencia_registrada', data: { milestone: b.milestone } });
  await sendMail({
    to: notifyAddress(), subject: `Atendimento registrado — caso #${c.code} (${MILESTONES[b.milestone]})`,
    html: layout('Novo registro de atendimento', table([['Dentista', u.name], ['Caso', `#${c.code} — ${c.name}`], ['Tipo', MILESTONES[b.milestone]], ['Data', performed]]) + button(`${appUrl()}/painel#/caso/${c.id}`, 'Validar no painel')),
  });
  send(res, 201, e);
});

r('POST', '/api/dentist/evidences/:id/photos', async (req, res, { id }) => {
  const sql = db();
  const u = await dentistUser(sql, req);
  const [e] = await sql`select * from evidences where id = ${id} and dentist_id = ${u.dentist_id}`;
  if (!e) fail(404, 'Registro não encontrado.');
  if (e.validated_at) fail(409, 'Registro já validado; crie um novo para mais fotos.');
  const p = await saveImage(sql, req, { caseId: e.case_id, evidenceId: id, kind: 'evidencia', uploadedBy: 'dentista', userId: u.id, allowPdf: true });
  send(res, 201, p);
});

r('POST', '/api/dentist/cases/:id/appointments', async (req, res, { id }) => {
  const sql = db();
  const u = await dentistUser(sql, req);
  await dentistCase(sql, u, id);
  send(res, 201, await addAppointment(sql, u, id, await readJson(req), u.dentist_id));
});

r('PATCH', '/api/dentist/appointments/:id', async (req, res, { id }) => {
  const sql = db();
  const u = await dentistUser(sql, req);
  const b = await readJson(req);
  if (!['agendado', 'realizado', 'cancelado', 'faltou'].includes(b.status)) fail(400, 'Status inválido.');
  await sql`update appointments set status = ${b.status} where id = ${id} and dentist_id = ${u.dentist_id}`;
  send(res, 200, { ok: true });
});

// ------------------------------------------------------------------ webhook Asaas

r('POST', '/api/webhooks/asaas', async (req, res) => {
  const sql = db();
  const expected = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!expected || req.headers['asaas-access-token'] !== expected) fail(401, 'token inválido');
  const b = await readJson(req);
  await sql`insert into webhook_events (provider, event, payload) values ('asaas', ${clean(b.event, 80)}, ${sql.json(b)})`;
  const p = b.payment;
  if (p?.id) {
    const ref = p.externalReference;
    let [ch] = ref && /^[0-9a-f-]{36}$/i.test(ref) ? await sql`select * from charges where id = ${ref}` : [];
    if (!ch) [ch] = await sql`select * from charges where asaas_payment_id = ${p.id}
      or (${p.installment || ''} <> '' and asaas_installment_id = ${p.installment || ''})
      or (${p.subscription || ''} <> '' and asaas_subscription_id = ${p.subscription || ''}) limit 1`;
    await upsertPayment(sql, p, ch);
    if (ch && asaas.PAID.has(p.status)) {
      const [c] = await sql`select id, code, name from cases where id = ${ch.case_id}`;
      await logEvent(sql, { caseId: ch.case_id, actor: 'asaas', type: 'pagamento_confirmado', data: { value: p.value, id: p.id } });
      if (b.event === 'PAYMENT_RECEIVED' || b.event === 'PAYMENT_CONFIRMED') {
        await sendMail({
          to: notifyAddress(), subject: `Pagamento confirmado — caso #${c?.code} (${brl(p.value)})`,
          html: layout('Pagamento confirmado', table([['Paciente', c?.name], ['Valor', brl(p.value)], ['Descrição', p.description], ['Forma', p.billingType]])),
        });
      }
    }
  }
  send(res, 200, { received: true });
});

// ------------------------------------------------------------------ entrada

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const m = router.match(req.method, url.pathname);
  try {
    if (!m) fail(404, 'Rota não encontrada.');
    if (m.methodNotAllowed) fail(405, 'Método não permitido.');
    // Proteção CSRF básica para rotas com sessão: exige mesma origem nos métodos de escrita
    if (req.method !== 'GET' && !url.pathname.startsWith('/api/webhooks/')) {
      const origin = req.headers.origin;
      let host = null;
      try { host = origin ? new URL(origin).host : null; } catch { host = 'inválida'; }
      if (origin && host !== req.headers.host) fail(403, 'Origem não permitida.');
    }
    await m.handler(req, res, m.params);
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { error: e.message });
    console.error(e);
    send(res, 500, { error: 'Erro interno. Tente novamente em instantes.' });
  }
}
