// Upload de fotos (galeria do celular, câmera, arquivos do computador) e do
// documento do registro profissional.
import { Router, type NextFunction, type RequestHandler, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { HttpError, requireAuth, toSelf, type AuthedRequest } from '../auth.js';
import { assertEmailVerified } from '../emailVerification.js';
import { IMAGE_MAX_BYTES, readImage, saveImage, sniffImage } from '../storage.js';
import { assertCleanImage, limit } from '../security.js';
import { reencodeImage, safeDocument } from '../uploadSafety.js';
import { LICENSE_DOC_MAX_BYTES, decide, latestLicenseCheck, pendingVerifications, runVerification, submitLicense, verificationDocument, documentAccessLog } from '../verification.js';
import { CATEGORIES } from '../../../shared/rules.js';
import { pool } from '../db.js';
import { IDENTITY_MAX_BYTES, decideIdentity, identityFile, latestIdentity, pendingIdentities, runIdentityCheck, submitIdentity } from '../identity.js';

export const filesRouter = Router();

const photos = multer({ storage: multer.memoryStorage(), limits: { fileSize: IMAGE_MAX_BYTES, files: 20 } });
const identityFiles = multer({ storage: multer.memoryStorage(), limits: { fileSize: IDENTITY_MAX_BYTES, files: 2 } });
const licenseDoc = multer({ storage: multer.memoryStorage(), limits: { fileSize: LICENSE_DOC_MAX_BYTES, files: 1 } });

/** Converte erros do multer em respostas da API. */
function upload(mw: RequestHandler) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => mw(req, res, (err?: unknown) => {
    if (err instanceof multer.MulterError) {
      return next(new HttpError(err.code === 'LIMIT_FILE_SIZE' ? 413 : 422, err.code === 'LIMIT_FILE_SIZE' ? 'file_too_large' : 'invalid_upload'));
    }
    next(err as Error | undefined);
  });
}

function requireAdmin(req: AuthedRequest) {
  if (!req.user!.roles.includes('admin')) throw new HttpError(403, 'forbidden');
}

filesRouter.post('/uploads', requireAuth, upload(photos.array('files', 20)), async (req: AuthedRequest, res) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (!files.length) throw new HttpError(422, 'no_file');
  if (req.ip) await limit(`upload:ip:${req.ip}`, 200, 60 * 60); // no máximo 200 fotos por hora
  // Formato conferido pela assinatura do arquivo, foto regravada sem GPS/metadados (máx. 2000 px)
  // e conteúdo impróprio barrado pela IA
  const clean = await Promise.all(files.map((f) => reencodeImage(f.buffer)));
  await Promise.all(clean.map((f) => assertCleanImage(f.data, sniffImage(f.data) ?? '', { userId: req.user!.id, ip: req.ip })));
  const saved = [];
  for (const f of clean) saved.push(await saveImage(req.user!.id, f.data));
  res.status(201).json({ files: saved });
});

filesRouter.get('/uploads/:id', async (req, res) => {
  const img = await readImage(req.params.id);
  if (!img?.data) throw new HttpError(404, 'not_found');
  res.set('Content-Type', img.mime);
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Content-Security-Policy', "default-src 'none'; sandbox"); // a imagem nunca roda como página
  res.send(img.data);
});

// Registro profissional: dados + foto/PDF do documento. Análise por IA em segundo plano.
filesRouter.post('/me/license', requireAuth, upload(licenseDoc.single('document')), async (req: AuthedRequest, res) => {
  const data = z.object({
    fullName: z.string().min(3).max(160),
    body: z.string().min(2).max(120),
    number: z.string().min(2).max(40),
    region: z.string().max(40).optional(),
    category: z.enum(CATEGORIES as [string, ...string[]]).optional(),
  }).parse(req.body);
  assertEmailVerified(req.user!);
  const file = req.file;
  if (!file) throw new HttpError(422, 'no_file');
  const doc = await safeDocument(file.buffer, { allowPdf: true }); // tipo real do arquivo; PDF sem conteúdo ativo
  const verificationId = await submitLicense(req.user!, { ...data, category: data.category as never, document: doc.data, documentType: doc.mime });
  // Na Vercel a função termina com a resposta; o cron retoma o que ficar pendente.
  const analysis = runVerification(verificationId).catch((e) => console.error('[verificação IA]', (e as Error).message));
  if (process.env.LICENSE_VERIFY_SYNC === 'true') await analysis;
  res.status(202).json({ verificationId, user: toSelf(req.user!) });
});

filesRouter.get('/me/license', requireAuth, async (req: AuthedRequest, res) => {
  res.json({ status: req.user!.licenseStatus, license: req.user!.professionalLicense, check: await latestLicenseCheck(pool, req.user!.id) });
});

filesRouter.get('/admin/verifications', requireAuth, async (req: AuthedRequest, res) => {
  requireAdmin(req);
  res.json(await pendingVerifications());
});

filesRouter.get('/admin/verifications/:id/document', requireAuth, async (req: AuthedRequest, res) => {
  requireAdmin(req);
  const doc = await verificationDocument(req.params.id, { id: req.user!.id, ip: req.ip, userAgent: String(req.headers['user-agent'] ?? '') });
  if (!doc) throw new HttpError(404, 'not_found');
  if (doc.deleted) throw new HttpError(410, 'document_deleted', { at: doc.deletedAt ?? '' });
  res.set('Content-Type', doc.documentType);
  res.set('Cache-Control', 'private, no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Content-Security-Policy', "default-src 'none'; sandbox"); // nunca roda como página do site
  res.set('Content-Disposition', doc.documentType === 'application/pdf' ? 'attachment; filename="documento.pdf"' : 'inline');
  res.send(doc.document);
});

filesRouter.get('/admin/verifications/:id/access-log', requireAuth, async (req: AuthedRequest, res) => {
  requireAdmin(req);
  res.json(await documentAccessLog(req.params.id));
});

filesRouter.post('/admin/verifications/:id/decision', requireAuth, async (req: AuthedRequest, res) => {
  requireAdmin(req);
  const { status, note } = z.object({ status: z.enum(['approved', 'rejected']), note: z.string().max(1000).optional() }).parse(req.body);
  await decide(req.params.id, status, undefined, req.user!.id, note);
  res.json({ ok: true });
});

// Identidade: CPF/CNPJ + foto do documento + selfie. Checagens em segundo plano; não trava o uso do app.
filesRouter.post('/me/identity', requireAuth, upload(identityFiles.fields([{ name: 'document', maxCount: 1 }, { name: 'selfie', maxCount: 1 }])), async (req: AuthedRequest, res) => {
  const { taxId } = z.object({ taxId: z.string().min(5).max(30) }).parse(req.body);
  const files = req.files as Record<string, Express.Multer.File[] | undefined> | undefined;
  const doc = files?.document?.[0];
  const selfie = files?.selfie?.[0];
  if (!doc || !selfie) throw new HttpError(422, 'no_file');
  const [d, s] = await Promise.all([safeDocument(doc.buffer, { allowPdf: true }), safeDocument(selfie.buffer, { allowPdf: false })]);
  const vid = await submitIdentity(req.user!, {
    taxId, document: d.data, documentType: d.mime, selfie: s.data, selfieType: s.mime,
    ip: req.ip, userAgent: req.get('user-agent'),
  });
  const analysis = runIdentityCheck(vid).catch((e) => console.error('[identidade IA]', (e as Error).message));
  if (process.env.LICENSE_VERIFY_SYNC === 'true') await analysis;
  res.status(202).json({ id: vid, status: (await latestIdentity(req.user!.id))?.status ?? 'pending' });
});

filesRouter.get('/me/identity', requireAuth, async (req: AuthedRequest, res) => {
  const v = await latestIdentity(req.user!.id);
  res.json({ verified: req.user!.identityVerified, status: v?.status ?? 'none', submittedAt: v?.created_at ?? null });
});

filesRouter.get('/admin/identities', requireAuth, async (req: AuthedRequest, res) => {
  requireAdmin(req);
  res.json(await pendingIdentities());
});

filesRouter.get('/admin/identities/:id/:which', requireAuth, async (req: AuthedRequest, res) => {
  requireAdmin(req);
  const which = z.enum(['document', 'selfie']).parse(req.params.which);
  const f = await identityFile(req.params.id, which, { id: req.user!.id, ip: req.ip, userAgent: req.get('user-agent') });
  if (!f) throw new HttpError(404, 'not_found');
  res.set('Content-Type', f.type);
  res.set('Cache-Control', 'private, no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Content-Security-Policy', "default-src 'none'; sandbox");
  res.set('Content-Disposition', f.type === 'application/pdf' ? `attachment; filename="${which}.pdf"` : 'inline');
  res.send(f.data);
});

filesRouter.post('/admin/identities/:id/decision', requireAuth, async (req: AuthedRequest, res) => {
  requireAdmin(req);
  const { status, note } = z.object({ status: z.enum(['approved', 'rejected']), note: z.string().max(1000).optional() }).parse(req.body);
  await decideIdentity(req.params.id, status, undefined, req.user!.id, note);
  res.json({ ok: true });
});
