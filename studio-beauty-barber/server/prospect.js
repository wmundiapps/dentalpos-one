// Captação de empresas pelos dados abertos de CNPJ da Receita Federal (portado do REVAH Leads).
// Regras: só fontes públicas e oficiais; nunca guardamos a lista de contatos no repositório; quem pede para sair fica bloqueado para sempre (hash).
import { createHash } from 'node:crypto';
import { db } from './db.js';
import { HttpError, uid, nowIso, normalizePhone, json } from './util.js';

export const TERMS_VERSION = '2026-10-v1';
export const TERMS_TEXT = `TERMO DE RESPONSABILIDADE — CAPTAÇÃO DE EMPRESAS

1. O usuário declara que usará os contatos obtidos exclusivamente para finalidades legítimas, compatíveis com a Lei nº 13.709/2018 (LGPD), o Código de Defesa do Consumidor e as regras de autorregulação de telemarketing.
2. O usuário é o controlador dos dados que decidir salvar e usar, e assume a responsabilidade pela base legal adotada (por exemplo, legítimo interesse avaliado para contato comercial entre empresas), pela transparência com os titulares e pelo atendimento aos seus direitos.
3. É proibido usar os contatos para spam, envio em massa sem base legal, práticas enganosas ou ilícitas, ou revendê-los a terceiros.
4. Todo pedido para não receber mais contato deve ser respeitado de imediato. O sistema registra esses pedidos em uma lista de bloqueio e impede novos envios automáticos.
5. A WMundi Technologies & Co fornece a ferramenta e não garante a exatidão, a atualidade ou a disponibilidade dos dados, nem resultados comerciais.
6. O acesso pode ser suspenso em caso de indício de uso irregular, denúncias de titulares ou determinação de autoridade.
7. Foro da Comarca de Maringá/PR.`;
export const termsHash = () => createHash('sha256').update(`${TERMS_VERSION}\n${TERMS_TEXT}`).digest('hex');

// Segmentos (CNAE da subclasse, 7 dígitos) mais úteis para vender o sistema.
export const SEGMENTS = [
  { code: '9602501', name: 'Cabeleireiros, manicure e pedicure (salões e barbearias)' },
  { code: '9602502', name: 'Estética e outros cuidados com a beleza' },
  { code: '4772500', name: 'Comércio de cosméticos, perfumaria e higiene pessoal' },
  { code: '9609299', name: 'Outras atividades de serviços pessoais' },
  { code: '8630504', name: 'Atividade odontológica (clínicas e dentistas para harmonização)' },
];

export const digits = (v) => String(v ?? '').replace(/\D/g, '');
export const searchText = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
export const blockHash = (kind, value) => createHash('sha256').update(`lead-block:${kind}:${String(value).trim().toLowerCase()}`).digest('hex');

const hashesOf = (r) => [r.document && blockHash('cnpj', r.document), r.phone && blockHash('phone', r.phone), r.email && blockHash('email', r.email)].filter(Boolean);

export async function termsAccepted(salon) {
  const t = json(salon.brand_json, {}).prospect_terms;
  return !!t && t.version === TERMS_VERSION;
}

export async function baseStatus() {
  const last = await db.get("SELECT ref_month, finished_at FROM company_imports WHERE status = 'DONE' ORDER BY finished_at DESC LIMIT 1");
  const n = await db.get('SELECT COUNT(*) AS n FROM company_base');
  return { available: Number(n.n) > 0, total: Number(n.n), ref_month: last?.ref_month || null, updated_at: last?.finished_at || null };
}

// Tira da lista quem pediu para sair.
export async function withoutBlocked(salonId, rows) {
  if (!rows.length) return rows;
  const all = [...new Set(rows.flatMap(hashesOf))];
  const blocked = new Set();
  for (let i = 0; i < all.length; i += 500) {
    const chunk = all.slice(i, i + 500);
    const found = await db.all(`SELECT hash FROM lead_blocks WHERE salon_id = ? AND hash IN (${chunk.map(() => '?').join(',')})`, [salonId, ...chunk]);
    found.forEach((f) => blocked.add(f.hash));
  }
  return rows.filter((r) => !hashesOf(r).some((h) => blocked.has(h)));
}

const toLead = (c, segName) => ({
  name: c.trade_name || c.legal_name || c.cnpj, company: c.legal_name || c.trade_name, document: c.cnpj, phone: c.phone, email: c.email,
  address: c.address, city: c.city, state: c.uf, category: segName(c.cnae), is_mei: !!c.is_mei, opened_at: c.opened_at,
});
const segNameOf = (code) => SEGMENTS.find((s) => s.code === code)?.name || code;

// Busca na base carregada: segmento + estado/cidade, sem repetir quem já virou lead e sem quem pediu para sair.
export async function searchCompanies(salonId, { cnaes, uf, city, mei = 'ALL', limit = 50 }) {
  const codes = (cnaes || []).map(digits).filter((c) => c.length >= 4).slice(0, 10);
  if (!codes.length) throw new HttpError(422, 'Escolha ao menos um segmento.');
  if (!uf && !city) throw new HttpError(422, 'Informe o estado ou a cidade.');
  const where = [`(${codes.map(() => 'cnae LIKE ?').join(' OR ')})`];
  const params = codes.map((c) => `${c}%`);
  if (uf) { where.push('uf = ?'); params.push(String(uf).toUpperCase().slice(0, 2)); }
  if (city) { where.push('city_norm = ?'); params.push(searchText(city)); }
  if (mei === 'ONLY') where.push('is_mei = 1'); else if (mei === 'EXCLUDE') where.push('is_mei = 0');
  where.push('(phone IS NOT NULL OR email IS NOT NULL)');
  where.push('cnpj NOT IN (SELECT document FROM leads WHERE salon_id = ? AND document IS NOT NULL)');
  params.push(salonId);
  const want = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const rows = await db.all(`SELECT * FROM company_base WHERE ${where.join(' AND ')} ORDER BY opened_at DESC LIMIT ?`, [...params, Math.ceil(want * 1.3) + 10]);
  return (await withoutBlocked(salonId, rows.map((r) => ({ ...r, document: r.cnpj })))).slice(0, want).map((r) => toLead(r, segNameOf));
}

// Consulta de um CNPJ avulso (BrasilAPI, dados públicos da Receita).
export async function lookupCompany(cnpjRaw) {
  const cnpj = digits(cnpjRaw);
  if (cnpj.length !== 14) throw new HttpError(422, 'CNPJ inválido.');
  const local = await db.get('SELECT * FROM company_base WHERE cnpj = ?', [cnpj]);
  if (local) return toLead(local, segNameOf);
  const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, { signal: AbortSignal.timeout(12000) }).catch(() => null);
  if (!r) throw new HttpError(502, 'Consulta de CNPJ indisponível agora. Tente em instantes.');
  if (r.status === 404) throw new HttpError(404, 'CNPJ não encontrado.');
  if (!r.ok) throw new HttpError(502, 'Consulta de CNPJ indisponível agora.');
  const d = await r.json();
  return {
    name: d.nome_fantasia || d.razao_social, company: d.razao_social, document: cnpj, phone: normalizePhone(d.ddd_telefone_1 || d.ddd_telefone_2),
    email: String(d.email || '').toLowerCase() || null, address: [d.descricao_tipo_de_logradouro, d.logradouro, d.numero, d.bairro].filter(Boolean).join(', ') || null,
    city: d.municipio || null, state: d.uf || null, category: d.cnae_fiscal_descricao || null, is_mei: !!d.opcao_pelo_mei, opened_at: d.data_inicio_atividade || null,
  };
}

// Salva empresas escolhidas como leads do funil (sem consentimento: contato comercial B2B; só envio manual ou convite com opção de sair).
export async function saveAsLeads(salonId, companies) {
  const clean = await withoutBlocked(salonId, companies);
  let saved = 0;
  for (const c of clean) {
    const exists = await db.get('SELECT 1 AS x FROM leads WHERE salon_id = ? AND document = ?', [salonId, c.document]);
    if (exists) continue;
    const now = nowIso();
    await db.run(
      `INSERT INTO leads (id, salon_id, name, phone, email, company, city, state, address, document, category, source, stage, consent, notes, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [uid(), salonId, String(c.name).slice(0, 120), c.phone || null, c.email || null, c.company || null, c.city || null, c.state || null, c.address || null, c.document, c.category || null, 'cnpj_public', 'new', 0,
        `CNPJ ${c.document}${c.is_mei ? ' (MEI)' : ''}. Dados públicos da Receita Federal.`, now, now]);
    saved++;
  }
  return { saved, skipped: companies.length - saved };
}

// "Não quero receber": bloqueia para sempre (hash do CNPJ, telefone e e-mail) e apaga o contato do lead.
export async function optOutLeads(salonId, leadIds) {
  let n = 0;
  for (const id of leadIds) {
    const l = await db.get('SELECT * FROM leads WHERE id = ? AND salon_id = ?', [id, salonId]);
    if (!l) continue;
    for (const h of hashesOf(l)) await db.run('INSERT INTO lead_blocks (salon_id, hash, created_at) VALUES (?,?,?) ON CONFLICT DO NOTHING', [salonId, h, nowIso()]);
    await db.run("UPDATE leads SET phone = NULL, email = NULL, stage = 'lost', notes = 'Pediu para não receber contato.', updated_at = ? WHERE id = ?", [nowIso(), l.id]);
    await db.run("UPDATE prospect_invites SET status = 'cancelled' WHERE lead_id = ? AND status = 'scheduled'", [l.id]);
    n++;
  }
  return n;
}

// CSV (Excel) com link de WhatsApp. Células que começam com = + - @ ganham aspas simples (evita fórmula maliciosa no Excel).
const cell = (v) => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return `"${s.replace(/"/g, '""')}"`; };
export function leadsCsv(rows) {
  const head = ['Empresa', 'Nome fantasia', 'CNPJ', 'Segmento', 'Cidade', 'UF', 'Telefone', 'WhatsApp (link)', 'E-mail', 'Endereço'];
  const lines = rows.map((l) => [l.company, l.name, l.document, l.category, l.city, l.state, l.phone, l.phone ? `https://wa.me/${digits(l.phone)}` : '', l.email, l.address].map(cell).join(';'));
  return '﻿' + [head.map(cell).join(';'), ...lines].join('\r\n');
}
