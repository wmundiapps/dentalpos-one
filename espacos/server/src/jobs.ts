// Rotina periódica: reservas (expirações, repasses, caução, avaliações),
// fila de e-mails e verificações de registro pendentes.
import { identityJobs } from './identity.js';
import { sendCartReminders, sendVerifyReminders } from './cartRecovery.js';
import { tick } from './bookings.js';
import { flushEmailQueue } from './mailer.js';
import { flushPushQueue } from './push.js';
import { emailIdleConversations } from './assistant.js';
import { rotateDocumentKey } from './keyRotation.js';
import { marketplaceEnabled, refreshExpiringTokens } from './payments/mpAccounts.js';
import { encryptLegacyDocuments, purgeExpiredDocuments, resumePendingVerifications } from './verification.js';

import { pruneSecurity } from './security.js';
import { sendPackageRenewals } from './packages.js';

export async function runJobs() {
  const out: Record<string, string> = {};
  for (const [name, job] of [['bookings', () => tick()], ['verifications', async () => { await resumePendingVerifications(); await identityJobs(); }], ['assistant', () => emailIdleConversations()], ['cart', async () => { await sendCartReminders(); await sendVerifyReminders(); }], ['email', () => flushEmailQueue()], ['push', () => flushPushQueue()],
    ['documents', async () => { await encryptLegacyDocuments(); await purgeExpiredDocuments(); await rotateDocumentKey(); }],
    ['mp_tokens', async () => { if (marketplaceEnabled()) await refreshExpiringTokens(); }], ['security', () => pruneSecurity()], ['packages', () => sendPackageRenewals()]] as const) {
    try { await job(); out[name] = 'ok'; } catch (e) { out[name] = (e as Error).message; console.error(`[job ${name}]`, e); }
  }
  return out;
}
