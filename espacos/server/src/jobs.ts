// Rotina periódica: reservas (expirações, repasses, caução, avaliações),
// fila de e-mails e verificações de registro pendentes.
import { tick } from './bookings';
import { flushEmailQueue } from './mailer';
import { resumePendingVerifications } from './verification';

export async function runJobs() {
  const out: Record<string, string> = {};
  for (const [name, job] of [['bookings', () => tick()], ['verifications', resumePendingVerifications], ['email', () => flushEmailQueue()]] as const) {
    try { await job(); out[name] = 'ok'; } catch (e) { out[name] = (e as Error).message; console.error(`[job ${name}]`, e); }
  }
  return out;
}
