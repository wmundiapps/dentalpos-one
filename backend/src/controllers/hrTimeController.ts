import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma'
import * as hr from '../services/hrTimeService'
import * as hrFace from '../services/hrFaceService'
import * as hrPortal from '../services/hrPortalService'
import * as hrVault from '../services/hrVaultService'

type AuthedReq = Request & { user?: { id: string; email: string; clinicId: string; tenantId: string; role: string } }

const timeCtx = (req: AuthedReq): hr.TimeCtx => ({ clinicId: req.user!.clinicId, tenantId: req.user!.tenantId, userId: req.user!.id, email: req.user!.email })
const orgCtx = (req: AuthedReq) => ({ clinicId: req.user!.clinicId, tenantId: req.user!.tenantId, actorId: req.user!.id })
const refOf = (req: Request) => String(req.query.ref || hr.currentRef())
const idOf = (req: Request) => String(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id)

function wrap(fn: (req: AuthedReq, res: Response) => Promise<unknown>) {
  return async (req: Request, res: Response) => {
    try { await fn(req as AuthedReq, res) }
    catch (e) {
      if (e instanceof hr.HrError) return res.status(e.status).json({ error: e.message, ...(e.extra || {}) })
      console.error('Falha no RH/ponto:', e)
      return res.status(500).json({ error: 'Não foi possível concluir a operação.' })
    }
  }
}

const clientIp = (req: Request) => String((req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0] || req.ip || '').trim()

// ---- o próprio funcionário (qualquer usuário logado; só enxerga os dados dele) ----
export const meToday = wrap(async (req, res) => res.json(await hr.myToday(timeCtx(req))))
export const mePunch = wrap(async (req, res) => res.json(await hr.punch(timeCtx(req), { ip: clientIp(req), userAgent: String(req.headers['user-agent'] || '') }, req.body)))
export const meMonth = wrap(async (req, res) => res.json(await hr.myMonth(timeCtx(req), refOf(req))))
export const meRequests = wrap(async (req, res) => res.json(await hr.myRequests(timeCtx(req))))
export const meRequest = wrap(async (req, res) => res.json(await hr.myRequest(timeCtx(req), idOf(req))))
export const meCreateRequest = wrap(async (req, res) => res.status(201).json(await hr.createAbsenceRequest(timeCtx(req), req.body)))

// ---- ponto pelo rosto (aparelho fixo da clínica) ----
export const facePunch = wrap(async (req, res) => res.json(await hr.facePunch({ clinicId: req.user!.clinicId, tenantId: req.user!.tenantId, userId: req.user!.id }, { ip: clientIp(req), userAgent: String(req.headers['user-agent'] || '') }, req.body)))
export const faceFirstEnroll = wrap(async (req, res) => res.json(await hr.firstFaceEnroll({ clinicId: req.user!.clinicId, tenantId: req.user!.tenantId, userId: req.user!.id }, { ip: clientIp(req), userAgent: String(req.headers['user-agent'] || '') }, req.body)))
export const cpfCheck = wrap(async (req, res) => res.json(await hr.cpfCheck({ clinicId: req.user!.clinicId, tenantId: req.user!.tenantId }, clientIp(req), req.body)))
export const faceStatus = wrap(async (req, res) => res.json(await hrFace.faceStatus(req.user!.clinicId, idOf(req))))
export const faceEnroll = wrap(async (req, res) => {
  const r = await hrFace.enrollFace(orgCtx(req), idOf(req), req.body) as { error?: string; status?: number; ok?: boolean }
  if (r.error) return res.status(r.status || 400).json({ error: r.error })
  return res.json({ ok: true })
})
export const punchPhoto = wrap(async (req, res) => res.json(await hrFace.punchPhoto(req.user!.clinicId, idOf(req))))
export const faceReference = wrap(async (req, res) => res.json(await hrFace.referencePhoto(req.user!.clinicId, idOf(req))))
export const faceRemove = wrap(async (req, res) => res.json(await hrFace.removeFace(orgCtx(req), idOf(req))))

// ---- RH, administração e gestor ----
export const settingsGet = wrap(async (req, res) => res.json(await hr.getTimeSettings(req.user!.clinicId)))
export const settingsSave = wrap(async (req, res) => res.json(await hr.saveTimeSettings(orgCtx(req), req.body)))
export const timesheet = wrap(async (req, res) => res.json(await hr.timesheet(orgCtx(req), refOf(req))))
export const employeeMonth = wrap(async (req, res) => res.json(await hr.employeeMonth(orgCtx(req), String(req.params.employeeId), refOf(req))))
export const suggestions = wrap(async (req, res) => res.json(await hr.payrollSuggestions(orgCtx(req), refOf(req))))
export const requests = wrap(async (req, res) => res.json(await hr.listRequests(orgCtx(req), req.query.status ? String(req.query.status) : undefined)))
export const request = wrap(async (req, res) => res.json(await hr.getRequest(orgCtx(req), idOf(req))))
export const decide = wrap(async (req, res) => res.json(await hr.decideRequest({ ...orgCtx(req), actorId: req.user!.id }, idOf(req), req.body)))

// Listas que a tela de RH usa (antes os dados ficavam só no navegador).
export const listAttendance = wrap(async (req, res) => {
  const c = orgCtx(req)
  res.json(await prisma.hRAttendance.findMany({ where: { clinicId: c.clinicId, tenantId: c.tenantId }, orderBy: { date: 'desc' }, take: 300, include: { employee: { select: { name: true } } } }))
})
export const listPayrollEntries = wrap(async (req, res) => {
  const c = orgCtx(req)
  const reference = req.query.reference ? String(req.query.reference) : undefined
  res.json(await prisma.hRPayrollEntry.findMany({ where: { clinicId: c.clinicId, tenantId: c.tenantId, ...(reference ? { reference } : {}) }, orderBy: { createdAt: 'desc' }, take: 500, include: { employee: { select: { name: true } } } }))
})
export const listClosings = wrap(async (req, res) => {
  const c = orgCtx(req)
  res.json(await prisma.hRPayrollClosing.findMany({ where: { clinicId: c.clinicId, tenantId: c.tenantId }, orderBy: { reference: 'desc' }, take: 24 }))
})
export const listVacations = wrap(async (req, res) => {
  const c = orgCtx(req)
  res.json(await prisma.hRVacation.findMany({ where: { clinicId: c.clinicId, tenantId: c.tenantId }, orderBy: { concessionDeadline: 'asc' }, take: 200, include: { employee: { select: { name: true } } } }))
})
export const listDocuments = wrap(async (req, res) => {
  const c = orgCtx(req)
  res.json(await prisma.hRDocument.findMany({ where: { clinicId: c.clinicId, tenantId: c.tenantId }, orderBy: { issuedAt: 'desc' }, take: 200, include: { employee: { select: { name: true } } } }))
})
export const listDiscipline = wrap(async (req, res) => {
  const c = orgCtx(req)
  res.json(await prisma.hRDisciplinaryAction.findMany({ where: { clinicId: c.clinicId, tenantId: c.tenantId }, orderBy: { date: 'desc' }, take: 200, include: { employee: { select: { name: true } } } }))
})

// ---- área do colaborador (CPF + senha individual; só os próprios dados) ----
export const portalSetPassword = wrap(async (req, res) => {
  const r = await hrPortal.setPortalPassword(orgCtx(req), idOf(req), req.body?.password) as { error?: string; status?: number }
  if (r.error) return res.status(r.status || 400).json({ error: r.error })
  return res.json({ ok: true })
})
export const portalLogin = wrap(async (req, res) => {
  const r = await hrPortal.portalLogin(req.body?.cpf, req.body?.password, clientIp(req)) as { error?: string; status?: number; token?: string; name?: string }
  if (r.error) return res.status(r.status || 400).json({ error: r.error })
  return res.json({ token: r.token, name: r.name })
})
const portalCtx = (req: Request): hr.TimeCtx => { const p = (req as hrPortal.PortalReq).portal!; return { clinicId: p.clinicId, tenantId: p.tenantId, userId: `colaborador:${p.employeeId}`, email: '', employeeId: p.employeeId } }
export const portalToday = wrap(async (req, res) => res.json(await hr.myToday(portalCtx(req))))
export const portalMonth = wrap(async (req, res) => res.json(await hr.myMonth(portalCtx(req), refOf(req))))
export const portalRequests = wrap(async (req, res) => res.json(await hr.myRequests(portalCtx(req))))

// ---- acesso exclusivo do RH (login e senha próprios) ----
const vaultCtx = (req: AuthedReq) => ({ clinicId: req.user!.clinicId, tenantId: req.user!.tenantId, userId: req.user!.id })
const vaultReply = (res: Response, r: { error?: string; status?: number }) => (r.error ? res.status(r.status || 400).json({ error: r.error }) : res.json(r))
export const vaultStatus = wrap(async (req, res) => res.json(await hrVault.status(vaultCtx(req), req as never)))
export const vaultSetup = wrap(async (req, res) => vaultReply(res, await hrVault.setup(vaultCtx(req), req.body) as never))
export const vaultUnlock = wrap(async (req, res) => vaultReply(res, await hrVault.unlock(vaultCtx(req), req.body) as never))
export const vaultResetRequest = wrap(async (req, res) => vaultReply(res, await hrVault.requestReset(vaultCtx(req)) as never))
export const vaultResetConfirm = wrap(async (req, res) => vaultReply(res, await hrVault.confirmReset(vaultCtx(req), req.body) as never))
