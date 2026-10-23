/**
 * Nota fiscal enviada pelo cliente (quando a loja esquece de lançar).
 * A chave de acesso de 44 números da NFC-e/NF-e identifica a nota no Brasil inteiro:
 * cada chave gera cashback uma única vez, venha da loja ou do cliente.
 */
import { one, q, tx, UserError } from '../db';
import { config } from '../config';
import { onlyDigits } from '../format';
import { approveClaimTx, bestRule, customerStatus, Rule, subscriptionState } from './cashback';
import { queueEmail } from './notify';
import { notifyCustomer } from './messages';
import crypto from 'crypto';

export type NfceKey = { key: string; uf: string; yymm: string; cnpj: string; model: string; number: string };

/** Dígito verificador da chave (módulo 11, pesos 2 a 9 da direita para a esquerda) */
export function keyCheckDigit(first43: string) {
  let sum = 0, w = 2;
  for (let i = first43.length - 1; i >= 0; i--) {
    sum += Number(first43[i]) * w;
    w = w === 9 ? 2 : w + 1;
  }
  const r = sum % 11;
  return r < 2 ? 0 : 11 - r;
}

/** Aceita o texto do QR da nota (URL da Sefaz) ou a chave digitada */
export function parseNfce(text: string): NfceKey | null {
  const raw = String(text || '');
  const fromParam = raw.match(/(?:[?&](?:p|chNFe)=)(\d{44})/i)?.[1];
  const key = fromParam || raw.replace(/\s/g, '').match(/\d{44}/)?.[0] || (onlyDigits(raw).length === 44 ? onlyDigits(raw) : null);
  if (!key) return null;
  if (keyCheckDigit(key.slice(0, 43)) !== Number(key[43])) return null;
  const model = key.slice(20, 22);
  if (model !== '65' && model !== '55') return null;
  return { key, uf: key.slice(0, 2), yymm: key.slice(2, 6), cnpj: key.slice(6, 20), model, number: key.slice(25, 34) };
}

function spYymm(d: Date) {
  const s = d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); // AAAA-MM-DD
  return s.slice(2, 4) + s.slice(5, 7);
}
function prevYymm(d: Date) {
  const x = new Date(d.getTime());
  x.setUTCDate(1);
  x.setUTCMonth(x.getUTCMonth() - 1);
  return spYymm(x);
}

/** Travas contra abuso do cliente (valem para nota por QR e por foto) */
async function claimGuards(c: any, consumerId: string, now: Date) {
    const u = await one<{ phone_verified_at: Date | null; role: string }>('select phone_verified_at, role from users where id=$1', [consumerId], c);
    if (!u || u.role !== 'consumer') throw new UserError('Só clientes podem enviar notas');
    if (config.requirePhoneVerification && !u.phone_verified_at) throw new UserError('Confirme seu celular antes de enviar notas.');

    // Travas contra abuso do cliente
    const rejected = await one<{ n: string }>(
      `select count(*) n from purchases where consumer_id=$1 and source='customer' and status='rejected' and created_at > $2`,
      [consumerId, new Date(now.getTime() - 30 * 86400000)],
      c,
    );
    if (Number(rejected!.n) >= config.claimRejectBlock) throw new UserError('Envio de notas pausado: várias notas suas foram recusadas pelas lojas nos últimos 30 dias.');
    const counts = await one<{ d: string; m: string }>(
      `select count(*) filter (where created_at > $2) d, count(*) filter (where created_at > $3) m
       from purchases where consumer_id=$1 and source='customer'`,
      [consumerId, new Date(now.getTime() - 86400000), new Date(now.getTime() - 30 * 86400000)],
      c,
    );
    if (Number(counts!.d) >= config.claimMaxPerDay) throw new UserError(`Limite de ${config.claimMaxPerDay} notas por dia atingido.`);
    if (Number(counts!.m) >= config.claimMaxPerMonth) throw new UserError(`Limite de ${config.claimMaxPerMonth} notas por mês atingido.`);

}

/** Cliente envia a nota. Fica pendente até a loja confirmar (ou é aprovada sozinha em 48 h, se for de valor baixo). */
export async function submitClaim(consumerId: string, qrText: string, amountCents: number, now = new Date()) {
  const k = parseNfce(qrText);
  if (!k) throw new UserError('Não reconhecemos esta nota. Leia o QR do cupom fiscal ou digite a chave de 44 números.');
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new UserError('Informe o valor total da nota');
  if (amountCents > config.claimMaxCents) throw new UserError('Valor acima do limite para envio pelo app. Peça para a loja lançar no caixa.');
  if (k.yymm !== spYymm(now) && k.yymm !== prevYymm(now)) throw new UserError('Esta nota é antiga. Só valem notas deste mês e do mês passado.');

  return tx(async (c) => {
    await claimGuards(c, consumerId, now);

    const biz = await one<{ id: string; name: string; owner_id: string; status: string }>('select id, name, owner_id, status from businesses where cnpj=$1', [k.cnpj], c);
    if (!biz) throw new UserError('Esta loja ainda não participa do Cashbacksmart. Indique o Cashbacksmart para ela!');
    if (biz.status !== 'active') throw new UserError('Esta loja está com o cashback pausado.');
    const bSub = await subscriptionState(c, { businessId: biz.id }, now);
    if (!bSub.ok) throw new UserError('Esta loja está com o cashback pausado.');

    // Mesma nota não entra duas vezes
    const dup = await one<{ id: string }>(`select id from purchases where (nfce_key=$1 or (business_id=$2 and nf_number=$3)) and status <> 'rejected'`, [k.key, biz.id, String(Number(k.number))], c);
    if (dup) throw new UserError('Esta nota já foi lançada.');

    // A loja já lançou essa compra sem ler a nota: junta em vez de duplicar
    const launched = await one<{ id: string }>(
      `select id from purchases where consumer_id=$1 and business_id=$2 and amount_cents=$3 and status='confirmed' and nfce_key is null
       and source='store' and created_at > $4 order by created_at desc limit 1 for update`,
      [consumerId, biz.id, amountCents, new Date(now.getTime() - config.claimMergeHours * 3600000)],
      c,
    );
    if (launched) {
      await c.query('update purchases set nfce_key=$2, nf_number=coalesce(nf_number,$3) where id=$1', [launched.id, k.key, String(Number(k.number))]);
      return { status: 'merged' as const, business: biz.name, cashbackCents: 0, purchaseId: launched.id };
    }

    // Calcula o cashback agora (regras de hoje); credita quando a loja confirmar
    const rules = await q<Rule>('select * from cashback_rules where business_id=$1 and active', [biz.id], c);
    const st = await customerStatus(c, consumerId, biz.id);
    const best = bestRule(rules, amountCents, now, st);
    const p = await one<{ id: string }>(
      `insert into purchases (business_id, consumer_id, rule_id, amount_cents, cashback_cents, fee_cents, created_by, created_at, status, source, nfce_key, receipt, nf_number, claim_method)
       values ($1,$2,$3,$4,$5,0,$2,$6,'pending','customer',$7,$8,$9,'qr') returning id`,
      [biz.id, consumerId, best?.rule.id || null, amountCents, best?.cents || 0, now, k.key, `NFC-e ${Number(k.number)}`, String(Number(k.number))],
      c,
    );
    const owner = await one<{ id: string; email: string }>('select id, email from users where id=$1', [biz.owner_id], c);
    if (owner)
      await queueEmail(owner.id, owner.email, 'Um cliente enviou uma nota fiscal para cashback', `Um cliente enviou a nota nº ${Number(k.number)} de R$ ${(amountCents / 100).toFixed(2).replace('.', ',')} da ${biz.name}.\n\nConfirme ou recuse no painel em até ${config.claimAutoApproveHours} horas. Notas de até R$ ${(config.claimAutoApproveMaxCents / 100).toFixed(0)} sem resposta são aprovadas automaticamente.`, 'claim', { label: 'Abrir painel', url: `${config.appUrl}/painel` }, c);
    return { status: 'pending' as const, business: biz.name, cashbackCents: best?.cents || 0, purchaseId: p!.id };
  });
}

async function assertStore(c: any, purchaseId: string, actorId: string) {
  const p = await one<{ business_id: string; status: string }>('select business_id, status from purchases where id=$1', [purchaseId], c);
  if (!p) throw new UserError('Compra não encontrada');
  const m = await one('select 1 from business_members where business_id=$1 and user_id=$2', [p.business_id, actorId], c);
  if (!m) throw new UserError('Sem permissão para esta empresa');
  return p;
}

export async function approveClaim(purchaseId: string, actorId: string, now = new Date()) {
  return tx(async (c) => {
    await assertStore(c, purchaseId, actorId);
    return approveClaimTx(c, purchaseId, actorId, now);
  });
}

export async function rejectClaim(purchaseId: string, actorId: string, reason: string, now = new Date()) {
  const why = String(reason || '').trim();
  if (why.length < 3) throw new UserError('Diga o motivo da recusa (o cliente vai ver)');
  return tx(async (c) => {
    const p = await assertStore(c, purchaseId, actorId);
    if (p.status !== 'pending') throw new UserError('Esta compra já foi decidida');
    await c.query(`update purchases set status='rejected', decided_at=$2, decided_by=$3, reject_reason=$4 where id=$1`, [purchaseId, now, actorId, why.slice(0, 200)]);
    const info = await one<{ consumer_id: string; bname: string; amount_cents: string }>(`select p.consumer_id, b.name bname, p.amount_cents from purchases p join businesses b on b.id=p.business_id where p.id=$1`, [purchaseId], c);
    if (info)
      await notifyCustomer(info.consumer_id, `Sua nota da ${info.bname} não foi aprovada`, `A ${info.bname} não confirmou a nota de R$ ${(Number(info.amount_cents) / 100).toFixed(2).replace('.', ',')}.\n\nMotivo: ${why.slice(0, 200)}\n\nSe achar que é engano, fale com a loja.`, `a ${info.bname} não confirmou sua nota. Motivo: ${why.slice(0, 120)}`, 'claim', undefined, c);
  });
}

/** Agendador: aprova sozinho notas pequenas que a loja não respondeu em 48 h */
export async function autoApproveClaims(now = new Date()) {
  const due = await q<{ id: string }>(
    `select id from purchases where status='pending' and source='customer' and coalesce(claim_method,'qr')='qr' and amount_cents <= $1 and created_at <= $2 order by created_at limit 2000`,
    [config.claimAutoApproveMaxCents, new Date(now.getTime() - config.claimAutoApproveHours * 3600000)],
  );
  let n = 0;
  for (const d of due) {
    await tx((c) => approveClaimTx(c, d.id, null, now)).then(() => n++).catch(() => null);
  }
  return n;
}

export async function pendingClaims(businessId: string) {
  return q<any>(
    `select p.id, p.amount_cents, p.cashback_cents, p.created_at, p.receipt, p.claim_method, p.nf_number, u.name customer, u.member_code,
       exists (select 1 from claim_photos ph where ph.purchase_id=p.id) has_photo
     from purchases p join users u on u.id=p.consumer_id where p.business_id=$1 and p.status='pending' order by p.created_at`,
    [businessId],
  );
}

export async function myClaims(consumerId: string) {
  return q<any>(
    `select p.id, p.amount_cents, p.cashback_cents, p.status, p.reject_reason, p.created_at, b.name business
     from purchases p join businesses b on b.id=p.business_id where p.consumer_id=$1 and p.source='customer' order by p.created_at desc limit 30`,
    [consumerId],
  );
}

/** Confere o tipo real do arquivo pelos primeiros bytes (não confia na extensão) */
export function sniffImage(b: Buffer): string | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  const brand = b.subarray(4, 12).toString('latin1');
  if (/^ftyp(heic|heix|mif1|msf1|hevc)/.test(brand)) return 'image/heic';
  return null;
}

export const MAX_PHOTO_BYTES = 6 * 1024 * 1024;

/**
 * Nota sem QR (ou QR ilegível): o cliente, no caixa, aponta para o QR da loja (kit impresso),
 * tira foto da nota e informa valor e número. Sempre depende da confirmação da loja.
 */
export async function submitPhotoClaim(consumerId: string, input: { kitCode: string; amountCents: number; nfNumber: string; photo: Buffer }, now = new Date()) {
  const nf = onlyDigits(input.nfNumber).replace(/^0+/, '');
  if (!nf || nf.length > 9) throw new UserError('Informe o número da nota (está no cupom, perto de "Nº" ou "NFC-e")');
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new UserError('Informe o valor total da nota');
  if (input.amountCents > config.claimMaxCents) throw new UserError('Valor acima do limite para envio pelo app. Peça para a loja lançar no caixa.');
  if (!input.photo?.length) throw new UserError('Tire uma foto da nota fiscal');
  if (input.photo.length > MAX_PHOTO_BYTES) throw new UserError('Foto muito grande (máximo 6 MB)');
  const mime = sniffImage(input.photo);
  if (!mime) throw new UserError('Envie uma foto (JPG, PNG, WEBP ou HEIC)');
  const sha = crypto.createHash('sha256').update(input.photo).digest('hex');

  return tx(async (c) => {
    await claimGuards(c, consumerId, now);
    const biz = await one<{ id: string; name: string; owner_id: string; status: string }>('select id, name, owner_id, status from businesses where kit_code=$1', [String(input.kitCode || '').toUpperCase()], c);
    if (!biz) throw new UserError('Loja não encontrada. Aponte a câmera para o QR do Cashbacksmart no caixa.');
    if (biz.status !== 'active') throw new UserError('Esta loja está com o cashback pausado.');
    const bSub = await subscriptionState(c, { businessId: biz.id }, now);
    if (!bSub.ok) throw new UserError('Esta loja está com o cashback pausado.');
    const dup = await one(`select 1 from purchases where business_id=$1 and nf_number=$2 and status <> 'rejected'`, [biz.id, nf], c);
    if (dup) throw new UserError('Esta nota já foi lançada.');
    const samePhoto = await one(`select 1 from claim_photos where sha256=$1`, [sha], c);
    if (samePhoto) throw new UserError('Esta foto já foi enviada antes.');

    const launched = await one<{ id: string }>(
      `select id from purchases where consumer_id=$1 and business_id=$2 and amount_cents=$3 and status='confirmed' and nf_number is null and nfce_key is null
       and source='store' and created_at > $4 order by created_at desc limit 1 for update`,
      [consumerId, biz.id, input.amountCents, new Date(now.getTime() - config.claimMergeHours * 3600000)],
      c,
    );
    if (launched) {
      await c.query('update purchases set nf_number=$2 where id=$1', [launched.id, nf]);
      return { status: 'merged' as const, business: biz.name, cashbackCents: 0, purchaseId: launched.id };
    }

    const rules = await q<Rule>('select * from cashback_rules where business_id=$1 and active', [biz.id], c);
    const st = await customerStatus(c, consumerId, biz.id);
    const best = bestRule(rules, input.amountCents, now, st);
    const p = await one<{ id: string }>(
      `insert into purchases (business_id, consumer_id, rule_id, amount_cents, cashback_cents, fee_cents, created_by, created_at, status, source, nf_number, claim_method, receipt)
       values ($1,$2,$3,$4,$5,0,$2,$6,'pending','customer',$7,'photo',$8) returning id`,
      [biz.id, consumerId, best?.rule.id || null, input.amountCents, best?.cents || 0, now, nf, `Nota nº ${nf} (foto)`],
      c,
    );
    await c.query('insert into claim_photos (purchase_id, mime, bytes, sha256) values ($1,$2,$3,$4)', [p!.id, mime, input.photo, sha]);
    const owner = await one<{ id: string; email: string }>('select id, email from users where id=$1', [biz.owner_id], c);
    if (owner)
      await queueEmail(owner.id, owner.email, 'Um cliente enviou a foto de uma nota para cashback', `Um cliente enviou a foto da nota nº ${nf} de R$ ${(input.amountCents / 100).toFixed(2).replace('.', ',')} da ${biz.name}.\n\nConfira a foto e confirme ou recuse no painel.`, 'claim', { label: 'Abrir painel', url: `${config.appUrl}/painel` }, c);
    return { status: 'pending' as const, business: biz.name, cashbackCents: best?.cents || 0, purchaseId: p!.id };
  });
}

/** Foto da nota: só a loja dona da compra (ou o cliente que enviou) pode ver */
export async function claimPhoto(purchaseId: string, userId: string) {
  return one<{ mime: string; bytes: Buffer }>(
    `select ph.mime, ph.bytes from claim_photos ph join purchases p on p.id=ph.purchase_id
     where ph.purchase_id=$1 and (p.consumer_id=$2 or exists (select 1 from business_members m where m.business_id=p.business_id and m.user_id=$2))`,
    [purchaseId, userId],
  );
}

export async function businessByKit(code: string) {
  return one<{ id: string; name: string; city: string; state: string; category: string; kit_code: string }>(
    `select id, name, city, state, category, kit_code from businesses where kit_code=$1 and status='active'`,
    [String(code || '').toUpperCase().slice(0, 12)],
  );
}
