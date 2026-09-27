import { Router } from 'express';
import { z } from 'zod';
import { pool, rows } from '../db.js';
import { HttpError, optionalAuth, requireAuth, type AuthedRequest } from '../auth.js';
import { ASSISTANT_LIMITS, ask } from '../assistant.js';

export const assistantRouter = Router();

assistantRouter.post('/assistant', optionalAuth, async (req: AuthedRequest, res) => {
  const data = z.object({
    conversationId: z.string().max(80).optional(),
    message: z.string().min(1).max(ASSISTANT_LIMITS.messageChars),
    page: z.string().max(200).optional(),
    locale: z.string().max(10).optional(),
  }).parse(req.body);
  res.json(await ask({ ...data, userId: req.user?.id, ip: req.ip }));
});

// Conversas recentes para a equipe (Admin → Dúvidas)
assistantRouter.get('/admin/assistant', requireAuth, async (req: AuthedRequest, res) => {
  if (!req.user!.roles.includes('admin')) throw new HttpError(403, 'forbidden');
  const list = await rows<{ id: string; page: string | null; created_at: Date; updated_at: Date; name: string | null; email: string | null }>(pool,
    `SELECT c.id, c.page, c.created_at, c.updated_at, u.name, u.email FROM assistant_conversations c
     LEFT JOIN users u ON u.id = c.user_id ORDER BY c.updated_at DESC LIMIT 50`);
  const msgs = list.length ? await rows<{ conversation_id: string; role: string; content: string; created_at: Date }>(pool,
    'SELECT conversation_id, role, content, created_at FROM assistant_messages WHERE conversation_id = ANY($1) ORDER BY id', [list.map((c) => c.id)]) : [];
  res.json(list.map((c) => ({ ...c, messages: msgs.filter((m) => m.conversation_id === c.id).map(({ role, content, created_at }) => ({ role, content, created_at })) })));
});
