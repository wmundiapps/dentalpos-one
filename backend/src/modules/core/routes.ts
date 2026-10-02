import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireAuth, requireRole } from '../academico/middleware'
import { mountCrud, parseBody, pageParams, qs } from './crud'
import { getBranding } from './branding'
import { scheduleReminder, processDueReminders } from './reminders'
import { audit } from './notify'

const router = Router()
const MGMT = ['ADMIN', 'OWNER', 'RECTOR', 'BOARD', 'COORDINATOR', 'SECRETARY'] as const

// ---------------- Identidade e logomarcas ----------------

const institutionSchema = z.object({
  nome: z.string().min(2),
  nomeFantasia: z.string().optional().nullable(),
  sigla: z.string().max(20).optional().nullable(),
  mantenedora: z.string().optional().nullable(),
  cnpj: z.string().optional().nullable(),
  codigoEmec: z.string().optional().nullable(),
  categoria: z.string().optional().nullable(),
  organizacao: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  telefone: z.string().optional().nullable(),
  site: z.string().optional().nullable(),
  endereco: z.string().optional().nullable(),
  cidade: z.string().optional().nullable(),
  uf: z.string().max(2).optional().nullable(),
  corPrimaria: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  corSecundaria: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  corDestaque: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  reitorNome: z.string().optional().nullable(),
  reitorCargo: z.string().optional().nullable(),
  lema: z.string().optional().nullable(),
  portariaCredenciamento: z.string().optional().nullable(),
})

// Marca visível para qualquer usuário autenticado (menu, portal do aluno, cabeçalhos).
router.get(
  '/branding',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    res.json(await getBranding(getTenantId(req), qs(req.query.campusId)))
  }),
)

router.get(
  '/instituicao',
  requireRole(...MGMT),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    res.json((await prisma.eduInstitution.findUnique({ where: { tenantId: getTenantId(req) } })) ?? null)
  }),
)

router.put(
  '/instituicao',
  requireRole('ADMIN', 'OWNER', 'RECTOR'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const data = parseBody(institutionSchema, req.body)
    const row = await prisma.eduInstitution.upsert({ where: { tenantId }, create: { tenantId, ...data }, update: data })
    await audit({ tenantId, userId: getUserId(req), modulo: 'core', acao: 'ATUALIZAR_INSTITUICAO', refType: 'EduInstitution', refId: row.id })
    res.json(row)
  }),
)

const MAX_ASSET_BYTES = 1_500_000
const assetSchema = z
  .object({
    kind: z.enum([
      'LOGO_PRINCIPAL', 'LOGO_HORIZONTAL', 'LOGO_ESCURA', 'LOGO_MONOCROMATICA', 'BRASAO', 'SELO_CERTIFICADO',
      'MARCA_DAGUA', 'FAVICON', 'ASSINATURA', 'CABECALHO_DOCUMENTO', 'RODAPE_DOCUMENTO',
    ]),
    campusId: z.string().optional().nullable(),
    titulo: z.string().optional().nullable(),
    dataUrl: z.string().regex(/^data:image\/(png|jpeg|jpg|svg\+xml|webp);base64,/i, 'Envie PNG, JPG, SVG ou WEBP em base64.').optional(),
    url: z.string().url().optional(),
    largura: z.number().int().optional(),
    altura: z.number().int().optional(),
  })
  .refine((v) => v.dataUrl || v.url, { message: 'Informe dataUrl ou url da imagem.' })
  .refine((v) => !v.dataUrl || v.dataUrl.length <= MAX_ASSET_BYTES * 1.37, { message: 'Imagem acima de 1,5 MB.' })

router.get(
  '/marca',
  requireRole(...MGMT),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    res.json(await prisma.eduBrandAsset.findMany({ where: { tenantId: getTenantId(req) }, orderBy: [{ kind: 'asc' }, { createdAt: 'desc' }] }))
  }),
)

// Um ativo ativo por (instituição/campus, tipo): o novo substitui o anterior.
router.post(
  '/marca',
  requireRole('ADMIN', 'OWNER', 'RECTOR', 'COORDINATOR', 'SECRETARY'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const body = parseBody(assetSchema, req.body)
    const mime = body.dataUrl?.slice(5, body.dataUrl.indexOf(';'))
    await prisma.eduBrandAsset.updateMany({ where: { tenantId, kind: body.kind, campusId: body.campusId ?? null, ativo: true }, data: { ativo: false } })
    const row = await prisma.eduBrandAsset.create({ data: { tenantId, ...body, campusId: body.campusId ?? null, mime } })
    await audit({ tenantId, userId: getUserId(req), modulo: 'core', acao: 'UPLOAD_MARCA', refType: 'EduBrandAsset', refId: row.id, detalhes: { kind: body.kind } })
    res.status(201).json(row)
  }),
)

router.delete(
  '/marca/:id',
  requireRole('ADMIN', 'OWNER', 'RECTOR'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const r = await prisma.eduBrandAsset.updateMany({ where: { id: String(req.params.id), tenantId }, data: { ativo: false } })
    if (!r.count) return res.status(404).json({ error: 'Ativo não encontrado.' })
    res.status(204).end()
  }),
)

// ---------------- Seleção de pessoas (docentes, orientadores, responsáveis) ----------------

router.get(
  '/pessoas',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const role = qs(req.query.role)
    const q = qs(req.query.q)
    const where: any = { tenantId, isActive: true }
    if (role) where.role = role.toUpperCase()
    if (q) where.OR = [{ firstName: { contains: q, mode: 'insensitive' } }, { lastName: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }]
    const users = await prisma.user.findMany({ where, select: { id: true, firstName: true, lastName: true, email: true, role: true }, orderBy: { firstName: 'asc' }, take: 50 })
    res.json(users.map((u) => ({ id: u.id, nome: `${u.firstName} ${u.lastName}`.trim(), email: u.email, role: u.role })))
  }),
)

// ---------------- Espaços físicos ----------------

const spaceSchema = z.object({
  campusId: z.string().optional().nullable(),
  codigo: z.string().min(1),
  nome: z.string().min(1),
  tipo: z.enum(['SALA_AULA', 'LABORATORIO', 'AUDITORIO', 'BIBLIOTECA', 'CLINICA_ESCOLA', 'QUADRA', 'PATIO', 'ESTACIONAMENTO', 'SALA_REUNIAO', 'SALA_PROFESSORES', 'ADMINISTRATIVO', 'POLO_EAD', 'OUTRO']),
  bloco: z.string().optional().nullable(),
  andar: z.string().optional().nullable(),
  capacidade: z.number().int().min(0).default(0),
  areaM2: z.number().positive().optional().nullable(),
  recursos: z.array(z.string()).optional(),
  acessivel: z.boolean().optional(),
  ativo: z.boolean().optional(),
  observacoes: z.string().optional().nullable(),
})
mountCrud(router, {
  model: 'eduSpace', path: '/espacos', modulo: 'core', read: ['COORDINATOR', 'TEACHER', 'SECRETARY', 'FACILITIES'], readAll: true,
  write: ['COORDINATOR', 'SECRETARY', 'FACILITIES'], create: spaceSchema, search: ['nome', 'codigo', 'bloco'], filters: ['tipo', 'campusId', 'ativo'],
  orderBy: { codigo: 'asc' }, removeMode: 'soft',
})

// ---------------- Lembretes ----------------

router.get(
  '/lembretes',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const u = req.user!
    const mine = qs(req.query.escopo) !== 'todos' || !['ADMIN', 'OWNER', 'RECTOR', 'BOARD'].includes(u.role)
    const status = qs(req.query.status)
    const where: any = { tenantId }
    if (status) where.status = status
    else where.status = { in: ['PENDENTE', 'NOTIFICADO', 'ADIADO'] }
    if (mine) where.OR = [{ assigneeUserId: u.id }, { assigneeRole: u.role }, ...(u.studentId ? [{ assigneeStudentId: u.studentId }] : [])]
    const modulo = qs(req.query.modulo)
    if (modulo) where.modulo = modulo
    const { skip, take, page, pageSize } = pageParams(req.query)
    const [items, total] = await Promise.all([
      prisma.eduReminder.findMany({ where, orderBy: [{ dueAt: 'asc' }], skip, take }),
      prisma.eduReminder.count({ where }),
    ])
    const now = Date.now()
    res.json({ items: items.map((r) => ({ ...r, atrasado: r.dueAt.getTime() < now })), total, page, pageSize })
  }),
)

router.post(
  '/lembretes',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(
      z.object({
        titulo: z.string().min(2),
        descricao: z.string().optional(),
        dueAt: z.coerce.date(),
        antecedenciaDias: z.number().int().min(0).max(365).optional(),
        severity: z.enum(['INFO', 'ATENCAO', 'CRITICO']).optional(),
        assigneeUserId: z.string().optional(),
        assigneeRole: z.string().optional(),
        modulo: z.string().default('manual'),
        recorrenciaDias: z.number().int().min(1).optional(),
      }),
      req.body,
    )
    const row = await scheduleReminder({ tenantId, ...b, assigneeUserId: b.assigneeUserId ?? (b.assigneeRole ? undefined : req.user!.id) })
    res.status(201).json(row)
  }),
)

router.post(
  '/lembretes/:id/concluir',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const r = await prisma.eduReminder.updateMany({
      where: { id: String(req.params.id), tenantId, status: { in: ['PENDENTE', 'NOTIFICADO', 'ADIADO'] } },
      data: { status: 'CONCLUIDO', concluidoEm: new Date(), concluidoPorId: getUserId(req) },
    })
    if (!r.count) return res.status(404).json({ error: 'Lembrete não encontrado ou já encerrado.' })
    res.json({ ok: true })
  }),
)

router.post(
  '/lembretes/:id/adiar',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { dias } = parseBody(z.object({ dias: z.number().int().min(1).max(90).default(1) }), req.body)
    const cur = await prisma.eduReminder.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!cur) return res.status(404).json({ error: 'Lembrete não encontrado.' })
    const row = await prisma.eduReminder.update({ where: { id: cur.id }, data: { status: 'ADIADO', remindAt: new Date(Date.now() + dias * 86_400_000) } })
    res.json(row)
  }),
)

// ---------------- Notificações (caixa do usuário) ----------------

router.get(
  '/notificacoes',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const u = req.user!
    const where: any = { tenantId, canal: 'IN_APP', OR: [{ userId: u.id }, ...(u.studentId ? [{ studentId: u.studentId }] : [])] }
    if (qs(req.query.naoLidas) === 'true') where.lidaEm = null
    const { skip, take } = pageParams(req.query)
    const [items, naoLidas] = await Promise.all([
      prisma.eduNotification.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      prisma.eduNotification.count({ where: { ...where, lidaEm: null } }),
    ])
    res.json({ items, naoLidas })
  }),
)

router.post(
  '/notificacoes/:id/lida',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const u = req.user!
    await prisma.eduNotification.updateMany({
      where: { id: String(req.params.id), tenantId: getTenantId(req), OR: [{ userId: u.id }, ...(u.studentId ? [{ studentId: u.studentId }] : [])] },
      data: { lidaEm: new Date(), status: 'LIDA' },
    })
    res.json({ ok: true })
  }),
)

router.get(
  '/auditoria',
  requireRole('ADMIN', 'OWNER', 'RECTOR', 'BOARD'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { skip, take } = pageParams(req.query)
    const where: any = { tenantId }
    const m = qs(req.query.modulo)
    if (m) where.modulo = m
    res.json(await prisma.eduAuditEvent.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }))
  }),
)

// Execução manual do motor de lembretes pelo próprio tenant (o cron global usa /api/cron/edu).
router.post(
  '/lembretes/processar',
  requireRole('ADMIN', 'OWNER', 'RECTOR'),
  asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
    res.json(await processDueReminders())
  }),
)

export default router
