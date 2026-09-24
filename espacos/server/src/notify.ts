import { db, id, nowIso, save } from './db';

// Notificação interna + e-mail. Em desenvolvimento o e-mail é apenas
// registrado no console; em produção plugar o provedor de e-mail aqui.
export function notify(target: { userId?: string; email?: string }, kind: string, text: string, link?: string) {
  db.notifications.push({ id: id('ntf'), userId: target.userId, email: target.email, kind, text, link, createdAt: nowIso(), read: false });
  save();
  if (process.env.NODE_ENV !== 'test') {
    const to = target.email ?? db.users.find((u) => u.id === target.userId)?.email;
    console.log(`[email] para=${to} tipo=${kind} :: ${text}${link ? ` → ${link}` : ''}`);
  }
}
