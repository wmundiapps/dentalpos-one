// Verificação de identidade: documento (frente e verso), selfie segurando o documento, comprovante de endereço
// e, para CNPJ, o cartão CNPJ. Tudo cifrado; só a moderação enxerga, e cada acesso fica no log de auditoria.
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { requireAuth } from '../auth.js';
import { id, many, one, pool } from '../db.js';
import { HttpError, parse, wrap } from '../http.js';
import { processDocument } from '../images.js';
import { limit } from '../ratelimit.js';
import { recordOrigin } from '../origin.js';
import { encryptBuffer } from '../secure.js';

export const kycRouter = Router();
kycRouter.use(requireAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 } });
const KINDS = ['doc_front', 'doc_back', 'selfie', 'address_proof', 'cnpj_card'] as const;

async function status(userId: string) {
  const u = await one(pool, 'SELECT doc_type, kyc_status, kyc_reject_reason FROM users WHERE id = $1', [userId]);
  const docs = await many(pool, `SELECT DISTINCT ON (kind) kind, created_at FROM kyc_documents WHERE user_id = $1 ORDER BY kind, created_at DESC`, [userId]);
  const required = ['doc_front', 'doc_back', 'selfie', 'address_proof', ...(u.doc_type === 'cnpj' ? ['cnpj_card'] : [])];
  const have = new Set(docs.map((d) => d.kind));
  return { status: u.kyc_status, rejectReason: u.kyc_reject_reason, required, uploaded: [...have], missing: required.filter((k) => !have.has(k)) };
}

kycRouter.get('/', wrap(async (req, res) => { res.json(await status(req.user!.id)); }));

kycRouter.post('/documents', limit('kyc-upload', 30, 3600, (r) => r.user!.id), upload.single('file'), wrap(async (req, res) => {
  const { kind } = parse(z.object({ kind: z.enum(KINDS) }), req.body);
  if (!req.file) throw new HttpError(400, 'file_required');
  const u = await one(pool, 'SELECT doc_type, kyc_status FROM users WHERE id = $1', [req.user!.id]);
  if (!u.doc_type) throw new HttpError(422, 'identity_required');
  if (u.kyc_status === 'pending') throw new HttpError(409, 'kyc_under_review');
  if (kind === 'cnpj_card' && u.doc_type !== 'cnpj') throw new HttpError(422, 'not_a_company');
  const doc = await processDocument(req.file.buffer);
  await pool.query('INSERT INTO kyc_documents (id, user_id, kind, mime, size, data) VALUES ($1,$2,$3,$4,$5,$6)',
    [id('kyc'), req.user!.id, kind, doc.mime, doc.data.length, encryptBuffer(doc.data)]);
  res.status(201).json(await status(req.user!.id));
}));

kycRouter.post('/submit', wrap(async (req, res) => {
  const s = await status(req.user!.id);
  if (s.status === 'pending') throw new HttpError(409, 'kyc_under_review');
  if (s.status === 'verified') throw new HttpError(409, 'already_verified');
  if (s.missing.length) throw new HttpError(422, 'documents_missing', s.missing);
  const u = await one(pool, 'SELECT email, phone, email_verified_at, phone_verified_at FROM users WHERE id = $1', [req.user!.id]);
  if (!u.email_verified_at || !u.phone_verified_at) throw new HttpError(422, 'contact_not_verified');
  await pool.query(`UPDATE users SET kyc_status = 'pending', kyc_submitted_at = now(), kyc_reject_reason = NULL WHERE id = $1`, [req.user!.id]);
  await recordOrigin(req, 'kyc_submit', { userId: req.user!.id, email: u.email, phone: u.phone });
  res.json(await status(req.user!.id));
}));
