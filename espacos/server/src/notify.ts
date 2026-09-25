import { id, nowIso, type Db } from './db.js';
import { insertNotification } from './repo.js';

// Notificação interna + e-mail. Gravada na mesma transação da ação que a
// originou; o e-mail sai depois pela fila (mailer.flushEmailQueue).
export async function notify(db: Db, target: { userId?: string; email?: string }, kind: string, text: string, link?: string) {
  await insertNotification(db, { id: id('ntf'), userId: target.userId, email: target.email, kind, text, link, createdAt: nowIso(), read: false });
}
