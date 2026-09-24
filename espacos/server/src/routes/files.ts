// Upload de fotos (galeria do celular, câmera, arquivos do computador) e do
// documento do registro profissional.
import { Router, type NextFunction, type RequestHandler, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { HttpError, requireAuth, toSelf, type AuthedRequest } from '../auth';
import { IMAGE_MAX_BYTES, readImage, saveImage } from '../storage';
import { LICENSE_DOC_MAX_BYTES, decide, latestLicenseCheck, pendingVerifications, runVerification, submitLicense, verificationDocument, documentAccessLog } from '../verification';
import { CATEGORIES } from '../../../shared/rules';
import { pool } from '../db';

export const filesRouter = Router();

const photos = multer({ storage: multer.memoryStorage(), limits: { fileSize: IMAGE_MAX_BYTES, files: 20 } });
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
  const saved = [];
  for (const f of files) saved.push(await saveImage(req.user!.id, f.buffer));
  res.status(201).json({ files: saved });
});

filesRouter.get('/uploads/:id', async (req, res) => {
  const img = await readImage(req.params.id);
  if (!img?.data) throw new HttpError(404, 'not_found');
  res.set('Content-Type', img.mime);
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.set('X-Content-Type-Options', 'nosniff');
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
  const file = req.file;
  if (!file) throw new HttpError(422, 'no_file');
  const verificationId = await submitLicense(req.user!, { ...data, category: data.category as never, document: file.buffer, documentType: file.mimetype });
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
  res.set('Content-Disposition', 'inline');
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
