import { id, nowIso, one, type Db } from './db';
import { insertNotification } from './repo';

// Notificação interna + e-mail. Gravada na mesma transação da ação que a
// originou. Em desenvolvimento o e-mail é só registrado no console; em
// produção plugar o provedor de e-mail aqui (ou num worker que leia a tabela).
export async function notify(db: Db, target: { userId?: string; email?: string }, kind: string, text: string, link?: string) {
  await insertNotification(db, { id: id('ntf'), userId: target.userId, email: target.email, kind, text, link, createdAt: nowIso(), read: false });
  if (process.env.NODE_ENV !== 'test') {
    const to = target.email ?? (await one<{ email: string }>(db, 'SELECT email FROM users WHERE id = $1', [target.userId]))?.email;
    console.log(`[email] para=${to} tipo=${kind} :: ${text}${link ? ` → ${link}` : ''}`);
  }
}
