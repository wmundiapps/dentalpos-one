import { NextFunction, Request, Response, Router } from 'express'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { writeAudit } from '../../services/auditService'
import { comparePassword } from '../../services/userService'
import { generateToken } from '../../controllers/authController'
import { academicErrorHandler, asyncHandler } from '../academico/middleware'
import { parseBody, qs, pageParams } from '../core/crud'
import { registerEduJob } from '../core/jobs'
import { eventoDeRequisicao, ipDaRequisicao } from './eventos'
import { estaBloqueado, limparTentativas, limparTentativasAntigas, POLITICA_2FA, registrarFalha } from './tentativas'
import {
  confirmarConfiguracao, desativar, iniciarConfiguracao, obterRegistro, papelExige2fa, regenerarCodigos, statusUsuario, validarSegundoFator,
} from './doisFatores'

// ============================================================
// /api/security/*  — montado ANTES do authMiddleware (aceita também o token restrito '2fa-setup').
// ============================================================

interface SegReq extends Request {
  seg?: { id: string; email: string; clinicId: string; tenantId: string; role: string; somenteConfiguracao: boolean }
}

/** Autenticação própria: token normal (qualquer rota) ou token '2fa-setup' (só rotas marcadas). Rejeita escopo '2fa'. */
function segAuth(opts: { permitirConfiguracao?: boolean } = {}) {
  return (req: SegReq, res: Response, next: NextFunction) => {
    const h = req.headers.authorization || ''
    if (!h.startsWith('Bearer ')) return res.status(401).json({ error: 'Token não fornecido' })
    const secret = process.env.JWT_SECRET
    if (!secret) return res.status(500).json({ error: 'JWT_SECRET não configurado' })
    try {
      const d: any = jwt.verify(h.slice(7), secret)
      if (d.scope && d.scope !== '2fa-setup') return res.status(401).json({ error: 'Token inválido ou expirado' })
      const somenteConfiguracao = d.scope === '2fa-setup'
      if (somenteConfiguracao && !opts.permitirConfiguracao) {
        return res.status(403).json({ error: 'Conclua a configuração da autenticação em dois fatores para continuar.' })
      }
      if (!d.id || !d.tenantId) return res.status(401).json({ error: 'Token inválido ou expirado' })
      req.seg = { id: d.id, email: d.email, clinicId: d.clinicId, tenantId: d.tenantId, role: d.role, somenteConfiguracao }
      next()
    } catch {
      return res.status(401).json({ error: 'Token inválido ou expirado' })
    }
  }
}

const router = Router()

const codigoSchema = z.object({ code: z.string().trim().min(6).max(32).optional(), recoveryCode: z.string().trim().min(8).max(32).optional() })

/** Limita tentativas (5 por 15 min por usuário/IP) das operações que exigem código/senha. */
async function bloqueadoOuResponde(req: SegReq, res: Response): Promise<boolean> {
  const l = await estaBloqueado('2fa', req.seg!.id, ipDaRequisicao(req))
  if (l.bloqueado) {
    res.setHeader('Retry-After', String(l.segundos))
    res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.' })
    return true
  }
  return false
}

async function falhou(req: SegReq, tipo: string) {
  const ip = ipDaRequisicao(req)
  await eventoDeRequisicao(req, { tenantId: req.seg!.tenantId, userId: req.seg!.id, tipo, severidade: 'ATENCAO' })
  await registrarFalha('2fa', req.seg!.id, ip, { tenantId: req.seg!.tenantId, userId: req.seg!.id, politica: POLITICA_2FA, userAgent: req.get('user-agent') })
}

async function auditar(req: SegReq, action: string, summary: string, userId?: string) {
  try {
    await writeAudit({
      clinicId: req.seg!.clinicId, tenantId: req.seg!.tenantId, actorId: req.seg!.id, module: 'security', action,
      entityType: 'User', entityId: userId || req.seg!.id, summary, ipAddress: req.ip, userAgent: req.get('user-agent') || undefined,
    })
  } catch (e) {
    console.warn('[seguranca] falha ao auditar', action)
  }
}

// ---------- status ----------
router.get('/2fa/status', segAuth({ permitirConfiguracao: true }), asyncHandler(async (req: SegReq, res: Response) => {
  res.json(await statusUsuario(req.seg!.id, req.seg!.role))
}))

// ---------- iniciar configuração ----------
router.post('/2fa/setup/start', segAuth({ permitirConfiguracao: true }), asyncHandler(async (req: SegReq, res: Response) => {
  const u = req.seg!
  const r = await iniciarConfiguracao({ id: u.id, tenantId: u.tenantId, email: u.email })
  res.json(r)
}))

// ---------- confirmar (ativa e devolve os códigos de recuperação UMA vez) ----------
router.post('/2fa/setup/confirm', segAuth({ permitirConfiguracao: true }), asyncHandler(async (req: SegReq, res: Response) => {
  if (await bloqueadoOuResponde(req, res)) return
  const { code } = parseBody(z.object({ code: z.string().trim().min(6).max(8) }), req.body)
  const codigos = await confirmarConfiguracao(req.seg!.id, code)
  if (!codigos) {
    await falhou(req, '2fa_falha_configuracao')
    return res.status(400).json({ error: 'Código inválido. Confira o horário do celular e tente novamente.' })
  }
  await limparTentativas('2fa', req.seg!.id, ipDaRequisicao(req))
  await eventoDeRequisicao(req, { tenantId: req.seg!.tenantId, userId: req.seg!.id, tipo: '2fa_ativado', severidade: 'INFO' })
  await auditar(req, '2FA_ATIVADO', 'Autenticação em dois fatores ativada.')
  const corpo: any = { enabled: true, recoveryCodes: codigos, aviso: 'Guarde estes códigos em local seguro: eles não serão exibidos novamente.' }
  if (req.seg!.somenteConfiguracao) {
    // O usuário acabou de provar o segundo fator: entrega o token de sessão normal para seguir sem novo login.
    const u = await prisma.user.findUnique({ where: { id: req.seg!.id } })
    if (u && u.isActive) corpo.token = generateToken(u)
  }
  res.json(corpo)
}))

// ---------- desativar (senha + código) ----------
router.post('/2fa/disable', segAuth(), asyncHandler(async (req: SegReq, res: Response) => {
  if (await bloqueadoOuResponde(req, res)) return
  const body = parseBody(codigoSchema.extend({ password: z.string().min(1).max(200) }), req.body)
  const user = await prisma.user.findUnique({ where: { id: req.seg!.id } })
  const reg = await obterRegistro(req.seg!.id)
  if (!user || !reg?.ativadoEm) return res.status(409).json({ error: 'A autenticação em dois fatores não está ativa.' })
  if (papelExige2fa(user.role)) return res.status(403).json({ error: 'O seu perfil exige autenticação em dois fatores; não é possível desativá-la.' })
  const senhaOk = await comparePassword(body.password, user.password)
  const fator = senhaOk ? await validarSegundoFator(user.id, body) : { ok: false }
  if (!senhaOk || !fator.ok) {
    await falhou(req, '2fa_falha_desativacao')
    return res.status(401).json({ error: 'Senha ou código inválidos.' })
  }
  await desativar(user.id)
  await eventoDeRequisicao(req, { tenantId: user.tenantId, userId: user.id, tipo: '2fa_desativado', severidade: 'ATENCAO' })
  await auditar(req, '2FA_DESATIVADO', 'Autenticação em dois fatores desativada.')
  res.json({ enabled: false })
}))

// ---------- regenerar códigos de recuperação (senha + código) ----------
router.post('/2fa/recovery-codes/regenerate', segAuth(), asyncHandler(async (req: SegReq, res: Response) => {
  if (await bloqueadoOuResponde(req, res)) return
  const body = parseBody(codigoSchema.extend({ password: z.string().min(1).max(200) }), req.body)
  const user = await prisma.user.findUnique({ where: { id: req.seg!.id } })
  if (!user) return res.status(401).json({ error: 'Não autenticado.' })
  const reg = await obterRegistro(user.id)
  if (!reg?.ativadoEm) return res.status(409).json({ error: 'A autenticação em dois fatores não está ativa.' })
  const senhaOk = await comparePassword(body.password, user.password)
  const fator = senhaOk ? await validarSegundoFator(user.id, body) : { ok: false }
  if (!senhaOk || !fator.ok) {
    await falhou(req, '2fa_falha_regeneracao')
    return res.status(401).json({ error: 'Senha ou código inválidos.' })
  }
  const codigos = await regenerarCodigos(user.id)
  await eventoDeRequisicao(req, { tenantId: user.tenantId, userId: user.id, tipo: '2fa_codigos_regenerados', severidade: 'ATENCAO' })
  await auditar(req, '2FA_CODIGOS_REGENERADOS', 'Códigos de recuperação regenerados.')
  res.json({ recoveryCodes: codigos, aviso: 'Os códigos anteriores deixaram de valer. Guarde estes em local seguro.' })
}))

// ---------- administração ----------
const ADMIN_ROLES = ['ADMIN', 'OWNER', 'RECTOR', 'BOARD']
function soAdmin(req: SegReq, res: Response, next: NextFunction) {
  if (!ADMIN_ROLES.includes(String(req.seg?.role || '').toUpperCase())) return res.status(403).json({ error: 'Sem permissão para esta ação.' })
  next()
}

// Eventos de segurança do tenant, com filtros.
router.get('/events', segAuth(), soAdmin, asyncHandler(async (req: SegReq, res: Response) => {
  const tenantId = req.seg!.tenantId
  const where: any = { tenantId }
  const tipo = qs(req.query.tipo)
  const severidade = qs(req.query.severidade)
  const userId = qs(req.query.userId)
  const ip = qs(req.query.ip)
  if (tipo) where.tipo = tipo
  if (severidade) {
    if (!['INFO', 'ATENCAO', 'CRITICO'].includes(severidade)) return res.status(400).json({ error: 'Filtro inválido: severidade.' })
    where.severidade = severidade
  }
  if (userId) where.userId = userId
  if (ip) where.ip = ip
  const desde = qs(req.query.desde)
  const ate = qs(req.query.ate)
  if (desde || ate) {
    where.createdAt = {}
    if (desde) { const d = new Date(desde); if (isNaN(d.getTime())) return res.status(400).json({ error: 'Filtro inválido: desde.' }); where.createdAt.gte = d }
    if (ate) { const d = new Date(ate); if (isNaN(d.getTime())) return res.status(400).json({ error: 'Filtro inválido: ate.' }); where.createdAt.lte = d }
  }
  const { page, pageSize, skip, take } = pageParams(req.query)
  const [total, items] = await Promise.all([
    prisma.segEvento.count({ where }),
    prisma.segEvento.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
  ])
  res.json({ page, pageSize, total, items })
}))

// Remove o 2FA de um usuário do mesmo tenant (perdeu o aparelho e os códigos). Fica auditado.
router.post('/2fa/admin-reset', segAuth(), soAdmin, asyncHandler(async (req: SegReq, res: Response) => {
  const { userId } = parseBody(z.object({ userId: z.string().min(1) }), req.body)
  const alvo = await prisma.user.findFirst({ where: { id: userId, tenantId: req.seg!.tenantId }, select: { id: true } })
  if (!alvo) return res.status(404).json({ error: 'Usuário não encontrado.' })
  await desativar(alvo.id)
  await limparTentativasUsuario(alvo.id)
  await eventoDeRequisicao(req, { tenantId: req.seg!.tenantId, userId: alvo.id, tipo: '2fa_reset_admin', severidade: 'CRITICO', detalhe: { porUserId: req.seg!.id } })
  await auditar(req, '2FA_RESET_ADMIN', 'Autenticação em dois fatores removida por administrador.', alvo.id)
  res.json({ ok: true })
}))

async function limparTentativasUsuario(userId: string) {
  try { await prisma.segTentativaLogin.deleteMany({ where: { escopo: '2fa', chave: userId } }) } catch { /* ignora */ }
}

// Job periódico (cron /api/cron/edu): apaga contagens de tentativas antigas.
registerEduJob('seguranca.limpar-tentativas', async () => ({ apagadas: await limparTentativasAntigas(7) }))

router.use(academicErrorHandler)

export default router
