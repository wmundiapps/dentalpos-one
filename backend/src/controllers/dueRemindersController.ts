import type { Response } from 'express'
import type { AuthRequest } from '../middleware/auth'
import { KINDS, collectItems, createCustom, getSettings, listCustom, markDone, saveSettings, todayBR, updateCustom } from '../services/dueRemindersService'

const ctx = (req: AuthRequest) => ({ clinicId: req.user!.clinicId, tenantId: req.user!.tenantId })
const fail = (res: Response, error: unknown, fallback: string, status = 400) => {
  const msg = error instanceof Error ? error.message : ''
  // Mensagens de validacao (em portugues) voltam ao usuario; erro tecnico nao.
  return /[áéíóúãç]|Informe|encontrado/.test(msg) ? res.status(status).json({ error: msg }) : (console.error('Lembretes de vencimento:', msg), res.status(500).json({ error: fallback }))
}

// Tela de abertura: o que vence nos proximos 10 dias e o que ja venceu (ate 60 dias atras).
export async function overview(req: AuthRequest, res: Response) {
  try {
    const { clinicId } = ctx(req)
    const today = todayBR()
    const items = await collectItems({ clinicId, today, horizon: 10, back: 60 })
    return res.json({ today, items: items.slice(0, 60).map(({ clinicId: _c, accountant: _a, ...i }) => i) })
  } catch (error) { return fail(res, error, 'Erro ao carregar os vencimentos.') }
}

export async function settings(req: AuthRequest, res: Response) {
  try { return res.json({ settings: await getSettings(ctx(req).clinicId), kinds: KINDS, custom: await listCustom(ctx(req).clinicId) }) }
  catch (error) { return fail(res, error, 'Erro ao carregar as configurações.') }
}

export async function saveSettingsHandler(req: AuthRequest, res: Response) {
  try { const c = ctx(req); return res.json({ settings: await saveSettings(c.clinicId, c.tenantId, req.body || {}) }) }
  catch (error) { return fail(res, error, 'Não foi possível salvar.') }
}

export async function create(req: AuthRequest, res: Response) {
  try { const c = ctx(req); return res.status(201).json({ id: await createCustom(c.clinicId, c.tenantId, req.body || {}) }) }
  catch (error) { return fail(res, error, 'Não foi possível criar o lembrete.') }
}

export async function update(req: AuthRequest, res: Response) {
  try { await updateCustom(ctx(req).clinicId, String(req.params.id), req.body || {}); return res.json({ ok: true }) }
  catch (error) { return fail(res, error, 'Não foi possível salvar o lembrete.', 404) }
}

export async function done(req: AuthRequest, res: Response) {
  try { return res.json({ nextDue: await markDone(ctx(req).clinicId, String(req.params.id)) }) }
  catch (error) { return fail(res, error, 'Não foi possível marcar como feito.', 404) }
}
