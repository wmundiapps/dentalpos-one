// Regras de conta compartilhadas pelas rotas: perfil público, identidade (CPF/CNPJ + endereço) e aceite de termos.
import { z } from 'zod';
import { id, one, pool, type Db } from './db.js';
import { HttpError } from './http.js';
import { encryptText, hmac } from './secure.js';
import { getLegal, type LegalKey } from './legal.js';
import { isValidCnpj, isValidCpf, isValidCep, maskDoc, onlyDigits } from '../../shared/documents.js';
import type { Request } from 'express';
import { clientIp } from './http.js';

export const addressSchema = z.object({
  cep: z.string().refine(isValidCep, 'CEP inválido'),
  street: z.string().trim().min(3).max(150),
  number: z.string().trim().min(1).max(20),
  complement: z.string().trim().max(80).optional().or(z.literal('')),
  district: z.string().trim().min(2).max(80),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().length(2).transform((s) => s.toUpperCase()),
});
export type Address = z.infer<typeof addressSchema>;

export const identitySchema = z.object({
  docType: z.enum(['cpf', 'cnpj']),
  docNumber: z.string(),
  companyName: z.string().trim().min(2).max(150).optional(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  address: addressSchema,
}).superRefine((v, ctx) => {
  if (v.docType === 'cpf' && !isValidCpf(v.docNumber)) ctx.addIssue({ code: 'custom', path: ['docNumber'], message: 'CPF inválido' });
  if (v.docType === 'cnpj' && !isValidCnpj(v.docNumber)) ctx.addIssue({ code: 'custom', path: ['docNumber'], message: 'CNPJ inválido' });
  if (v.docType === 'cnpj' && !v.companyName) ctx.addIssue({ code: 'custom', path: ['companyName'], message: 'Informe a razão social' });
  if (v.docType === 'cpf' && !v.birthDate) ctx.addIssue({ code: 'custom', path: ['birthDate'], message: 'Informe a data de nascimento' });
  if (v.birthDate) {
    const age = (Date.now() - new Date(v.birthDate).getTime()) / (365.25 * 24 * 3600 * 1000);
    if (!(age >= 18 && age < 120)) ctx.addIssue({ code: 'custom', path: ['birthDate'], message: 'Anunciante precisa ter 18 anos ou mais' });
  }
});
export type Identity = z.infer<typeof identitySchema>;

/** Grava identidade e endereço. Número aberto só cifrado; hash serve para barrar contas duplicadas. */
export async function applyIdentity(db: Db, userId: string, i: Identity) {
  const digits = onlyDigits(i.docNumber);
  const clash = await one(db, 'SELECT id FROM users WHERE doc_hash = $1 AND id <> $2 AND anonymized_at IS NULL', [hmac(digits), userId]);
  if (clash) throw new HttpError(409, 'doc_in_use');
  await db.query(
    `UPDATE users SET doc_type=$2, doc_hash=$3, doc_enc=$4, doc_masked=$5, company_name=$6, birth_date=$7,
       cep=$8, street=$9, street_number=$10, complement=$11, district=$12, city=$13, state=$14,
       account_type='anunciante', kyc_status = CASE WHEN kyc_status = 'verified' THEN 'none' ELSE kyc_status END, updated_at=now()
     WHERE id=$1`,
    [userId, i.docType, hmac(digits), encryptText(digits), maskDoc(digits), i.companyName ?? null, i.birthDate ?? null,
      onlyDigits(i.address.cep), i.address.street, i.address.number, i.address.complement || null, i.address.district, i.address.city, i.address.state]);
}

/** Grava o aceite com a versão e o hash do texto exato vigente. */
export async function recordAcceptance(db: Db, req: Request, userId: string, keys: LegalKey[], accepted: Record<string, string>) {
  for (const key of keys) {
    const doc = getLegal(key);
    if (accepted[key] !== doc.version) throw new HttpError(422, 'terms_not_accepted', { key, currentVersion: doc.version });
    await db.query('INSERT INTO term_acceptances (id, user_id, doc_key, version, text_hash, ip, user_agent) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [id('acc'), userId, key, doc.version, doc.hash, clientIp(req), String(req.headers['user-agent'] ?? '').slice(0, 400)]);
  }
}

export async function hasAccepted(userId: string, keys: LegalKey[]): Promise<boolean> {
  for (const key of keys) {
    const doc = getLegal(key);
    const r = await one(pool, 'SELECT 1 FROM term_acceptances WHERE user_id=$1 AND doc_key=$2 AND version=$3', [userId, key, doc.version]);
    if (!r) return false;
  }
  return true;
}

export function profileOf(u: any) {
  return {
    id: u.id, role: u.role, accountType: u.account_type, fullName: u.full_name, email: u.email, phone: u.phone,
    emailVerified: !!u.email_verified_at, phoneVerified: !!u.phone_verified_at,
    docType: u.doc_type, docMasked: u.doc_masked, companyName: u.company_name,
    address: u.cep ? { cep: u.cep, street: u.street, number: u.street_number, complement: u.complement, district: u.district, city: u.city, state: u.state } : null,
    kycStatus: u.kyc_status, kycRejectReason: u.kyc_reject_reason, feeBlocked: !!u.fee_blocked_at,
    marketingOptIn: u.marketing_opt_in, createdAt: u.created_at,
  };
}
