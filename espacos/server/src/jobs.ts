// Rotina periódica: reservas (expirações, repasses, caução, avaliações),
// fila de e-mails e verificações de registro pendentes.
import { tick } from './bookings.js';
import { flushEmailQueue } from './mailer.js';
import { rotateDocumentKey } from './keyRotation.js';
import { marketplaceEnabled, refreshExpiringTokens } from './payments/mpAccounts.js';
import { encryptLegacyDocuments, purgeExpiredDocuments, resumePendingVerifications } from './verification.js';

export async function runJobs() {
  const out: Record<string, string> = {};
  for (const [name, job] of [['bookings', () => tick()], ['verifications', resumePendingVerifications], ['email', () => flushEmailQueue()],
    ['documents', async () => { await encryptLegacyDocuments(); await purgeExpiredDocuments(); await rotateDocumentKey(); }],
    ['mp_tokens', async () => { if (marketplaceEnabled()) await refreshExpiringTokens(); }]] as const) {
    try { await job(); out[name] = 'ok'; } catch (e) { out[name] = (e as Error).message; console.error(`[job ${name}]`, e); }
  }
  return out;
}
