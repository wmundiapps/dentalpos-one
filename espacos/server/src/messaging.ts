// Avisos instantâneos aos parceiros (corretor e zelador) e ao locatário: Telegram e WhatsApp.
// Gravados em fila na mesma transação da ação (queueInstant) e enviados pela rotina (flushInstantQueue).
//
// Env (todas opcionais; sem elas o aviso vai só por e-mail e notificação do site):
//   TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME   bot do @BotFather; o parceiro liga pelo link t.me/<bot>?start=<código>
//   TELEGRAM_WEBHOOK_SECRET                     segredo do webhook (setWebhook ... secret_token)
//   WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID    WhatsApp Cloud API (Meta)
//   WHATSAPP_TEMPLATE (padrão spacehour_aviso), WHATSAPP_TEMPLATE_LANG (padrão pt_BR): modelo aprovado com 1 variável {{1}}
import { id, one, pool, rows, type Db } from './db.js';

export const telegramEnabled = () => !!process.env.TELEGRAM_BOT_TOKEN;
export const whatsappEnabled = () => !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
export const telegramStartLink = (code: string) =>
  process.env.TELEGRAM_BOT_USERNAME ? `https://t.me/${process.env.TELEGRAM_BOT_USERNAME.replace(/^@/, '')}?start=${code}` : null;

export async function queueInstant(db: Db, userId: string, text: string) {
  await db.query('INSERT INTO instant_messages (id, user_id, text) VALUES ($1,$2,$3)', [id('msg'), userId, text.slice(0, 3500)]);
}

let sender: typeof fetch = (...a) => fetch(...a);
export function setMessagingFetch(f?: typeof fetch) { sender = f ?? ((...a) => fetch(...a)); }

async function sendTelegram(chatId: string, text: string) {
  const r = await sender(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`telegram ${r.status}`);
}

async function sendWhatsApp(phone: string, text: string) {
  const to = `55${phone.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '')}`;
  const r = await sender(`https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
    body: JSON.stringify({
      messaging_product: 'whatsapp', to, type: 'template',
      template: {
        name: process.env.WHATSAPP_TEMPLATE || 'spacehour_aviso', language: { code: process.env.WHATSAPP_TEMPLATE_LANG || 'pt_BR' },
        // Modelos do WhatsApp não aceitam quebra de linha na variável
        components: [{ type: 'body', parameters: [{ type: 'text', text: text.replace(/\s*\n+\s*/g, ' · ').slice(0, 1000) }] }],
      },
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`whatsapp ${r.status}`);
}

/** Envia a fila: Telegram para quem ligou o bot; WhatsApp para quem tem celular (parceiro ou usuário). */
export async function flushInstantQueue(limit = 50) {
  const pending = await rows<{ id: string; user_id: string; text: string; chat: string | null; phone: string | null }>(pool,
    `SELECT m.id, m.user_id, m.text, p.telegram_chat_id AS chat, coalesce(p.phone, u.phone) AS phone
       FROM instant_messages m JOIN users u ON u.id = m.user_id LEFT JOIN partners p ON p.user_id = m.user_id
      WHERE m.status = 'pending' ORDER BY m.created_at LIMIT $1`, [limit]);
  for (const m of pending) {
    const used: string[] = [];
    const errors: string[] = [];
    if (telegramEnabled() && m.chat) await sendTelegram(m.chat, m.text).then(() => used.push('telegram'), (e) => errors.push((e as Error).message));
    if (whatsappEnabled() && m.phone && m.phone.replace(/\D/g, '').length >= 10) await sendWhatsApp(m.phone, m.text).then(() => used.push('whatsapp'), (e) => errors.push((e as Error).message));
    const status = used.length ? 'sent' : errors.length ? 'failed' : 'skipped';
    await pool.query('UPDATE instant_messages SET status = $2, channels = $3, error = $4, sent_at = now() WHERE id = $1',
      [m.id, status, used.join(',') || null, errors.join('; ') || null]);
  }
  return pending.length;
}

/** Webhook do bot: "/start <código>" liga o Telegram do parceiro. */
export async function handleTelegramUpdate(update: { message?: { chat?: { id?: number }; text?: string } }) {
  const chat = update.message?.chat?.id;
  const text = update.message?.text?.trim() ?? '';
  const m = /^\/start\s+([A-Za-z0-9_-]{8,64})$/.exec(text);
  if (!chat) return;
  if (!m) {
    if (telegramEnabled()) await sendTelegram(String(chat), 'Olá! Para receber os avisos do SpaceHour, toque no botão "Ligar Telegram" no seu Painel do parceiro (space-hour.com/parceiro).').catch(() => {});
    return;
  }
  const p = await one<{ user_id: string }>(pool, 'UPDATE partners SET telegram_chat_id = $2, telegram_link_token = NULL WHERE telegram_link_token = $1 RETURNING user_id', [m[1], String(chat)]);
  if (telegramEnabled()) {
    await sendTelegram(String(chat), p
      ? 'Pronto! A partir de agora você recebe aqui os avisos de novas reservas dos espaços em que é parceiro SpaceHour.'
      : 'Este código expirou. Gere outro no Painel do parceiro (space-hour.com/parceiro).').catch(() => {});
  }
}
