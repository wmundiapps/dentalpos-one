import type { Request, Response } from 'express'
import type { AuthRequest } from '../middleware/auth'
import { getUserPermissionCodes } from '../services/permissionService'
import * as club from '../services/clubService'

const ctx = (req: AuthRequest) => ({ clinicId: req.user!.clinicId, tenantId: req.user!.tenantId, userId: req.user!.id })
const month = (req: Request) => String(req.query.month || club.monthOf(club.todayBR()))
const fail = (res: Response, error: unknown, fallback: string, status = 400) => {
  const msg = error instanceof Error ? error.message : ''
  // Mensagens de validacao (em portugues) voltam ao usuario; erro tecnico nao.
  return /[áéíóúãçõê]|Informe|Responda|Escolha/.test(msg) ? res.status(status).json({ error: msg }) : (console.error('Clube:', msg), res.status(500).json({ error: fallback }))
}

// Gestor = ADMIN ou quem tem "settings.edit" (perfil GESTOR).
async function isManager(req: AuthRequest) {
  if (req.user?.role === 'ADMIN') return true
  return (await getUserPermissionCodes(req.user!.id)).includes('settings.edit')
}

// Listas fixas para os formularios (origens, canais, tipos, parentesco, equipe) e se quem pede e gestor.
export async function options(req: AuthRequest, res: Response) {
  try {
    const c = ctx(req)
    return res.json({ origins: club.ORIGINS, channels: club.CHANNELS, kinds: club.KINDS, relations: club.RELATIONS, team: await club.listTeam(c.clinicId), isManager: await isManager(req), me: c.userId })
  } catch (error) { return fail(res, error, 'Erro ao carregar o Clube.') }
}

// Painel da equipe: so numeros, sem valores em reais.
export async function panel(req: AuthRequest, res: Response) {
  try { const c = ctx(req); return res.json(await club.panel(c.clinicId, c.tenantId, month(req))) }
  catch (error) { return fail(res, error, 'Erro ao carregar o painel.') }
}

export async function report(req: AuthRequest, res: Response) {
  try { const c = ctx(req); return res.json(await club.managerReport(c.clinicId, c.tenantId, month(req))) }
  catch (error) { return fail(res, error, 'Erro ao carregar o relatório.') }
}

export async function getSettings(req: AuthRequest, res: Response) {
  try { const c = ctx(req); return res.json(await club.getSettings(c.clinicId, c.tenantId)) }
  catch (error) { return fail(res, error, 'Erro ao carregar a configuração.') }
}

export async function saveSettings(req: AuthRequest, res: Response) {
  try { const c = ctx(req); return res.json({ config: await club.saveSettings(c.clinicId, c.tenantId, req.body || {}) }) }
  catch (error) { return fail(res, error, 'Não foi possível salvar.') }
}

export async function getOrigin(req: AuthRequest, res: Response) {
  try { return res.json({ origin: await club.getOrigin(ctx(req).clinicId, String(req.params.patientId)) }) }
  catch (error) { return fail(res, error, 'Erro ao carregar a origem.', 404) }
}

export async function setOrigin(req: AuthRequest, res: Response) {
  try { const c = ctx(req); return res.json({ origin: await club.setOrigin(c.clinicId, c.tenantId, c.userId, await isManager(req), String(req.params.patientId), req.body || {}) }) }
  catch (error) { return fail(res, error, 'Não foi possível salvar a origem.') }
}

export async function listSales(req: AuthRequest, res: Response) {
  try {
    const rows = await club.listSales(ctx(req).clinicId, month(req))
    // Equipe ve as vendas sem valores; gestor ve tudo.
    return res.json({ sales: (await isManager(req)) ? rows : rows.map(({ amount: _a, ...r }) => r) })
  } catch (error) { return fail(res, error, 'Erro ao carregar as vendas.') }
}

export async function createSale(req: AuthRequest, res: Response) {
  try { const c = ctx(req); return res.status(201).json({ id: await club.createSale(c.clinicId, c.tenantId, c.userId, req.body || {}) }) }
  catch (error) { return fail(res, error, 'Não foi possível registrar a venda.') }
}

export async function confirmSale(req: AuthRequest, res: Response) {
  try { const c = ctx(req); return res.json(await club.confirmPayment(c.clinicId, c.tenantId, c.userId, String(req.params.id))) }
  catch (error) { return fail(res, error, 'Não foi possível confirmar o pagamento.') }
}

export async function cancelSale(req: AuthRequest, res: Response) {
  try { const c = ctx(req); await club.cancelSale(c.clinicId, c.tenantId, c.userId, String(req.params.id)); return res.json({ ok: true }) }
  catch (error) { return fail(res, error, 'Não foi possível cancelar.') }
}

export async function members(req: AuthRequest, res: Response) {
  try { return res.json({ members: await club.listMembers(ctx(req).clinicId) }) }
  catch (error) { return fail(res, error, 'Erro ao carregar os participantes.') }
}

export async function addMember(req: AuthRequest, res: Response) {
  try { const c = ctx(req); await club.addMember(c.clinicId, c.tenantId, c.userId, req.body || {}); return res.status(201).json({ ok: true }) }
  catch (error) { return fail(res, error, 'Não foi possível cadastrar.') }
}

export async function statement(req: AuthRequest, res: Response) {
  try { return res.json(await club.statement(ctx(req).clinicId, String(req.params.patientId))) }
  catch (error) { return fail(res, error, 'Erro ao carregar o extrato.', 404) }
}

export async function useCashback(req: AuthRequest, res: Response) {
  try { const c = ctx(req); await club.useCashback(c.clinicId, c.tenantId, c.userId, req.body || {}); return res.json({ ok: true }) }
  catch (error) { return fail(res, error, 'Não foi possível usar o cashback.') }
}

export async function transfer(req: AuthRequest, res: Response) {
  try { const c = ctx(req); await club.transferCashback(c.clinicId, c.tenantId, c.userId, req.body || {}); return res.json({ ok: true }) }
  catch (error) { return fail(res, error, 'Não foi possível transferir.') }
}

export async function myWeek(req: AuthRequest, res: Response) {
  try { const c = ctx(req); return res.json(await club.myWeek(c.clinicId, c.tenantId, c.userId)) }
  catch (error) { return fail(res, error, 'Erro ao carregar a avaliação da semana.') }
}

export async function submitEvaluation(req: AuthRequest, res: Response) {
  try { const c = ctx(req); await club.submitTeamEvaluation(c.clinicId, c.tenantId, c.userId, req.body || {}); return res.status(201).json({ ok: true }) }
  catch (error) { return fail(res, error, 'Não foi possível enviar a avaliação.') }
}

export async function evaluations(req: AuthRequest, res: Response) {
  try { return res.json(await club.teamEvaluations(ctx(req).clinicId, String(req.query.week || club.weekKey()))) }
  catch (error) { return fail(res, error, 'Erro ao carregar as avaliações.') }
}

export async function surveys(req: AuthRequest, res: Response) {
  try { return res.json(await club.patientSurveys(ctx(req).clinicId, month(req))) }
  catch (error) { return fail(res, error, 'Erro ao carregar as avaliações dos pacientes.') }
}

// Link publico de avaliacao do paciente (sem login).
export async function publicSurvey(req: Request, res: Response) {
  try { return res.json(await club.publicSurveyForm(String(req.params.token))) }
  catch (error) { return fail(res, error, 'Link de avaliação não encontrado.', 404) }
}

export async function publicSurveySubmit(req: Request, res: Response) {
  try { await club.submitPatientSurvey(String(req.params.token), req.body || {}); return res.status(201).json({ ok: true }) }
  catch (error) { return fail(res, error, 'Não foi possível enviar a avaliação.') }
}
