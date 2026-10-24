import { Response } from 'express'
import { Prisma } from '@prisma/client'
import { randomUUID } from 'crypto'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'

const editable = ['displayName','logo','primaryColor','secondaryColor','accentColor','themeMode','timezone','language','phone','email','address','city','state','zipCode','cnpj'] as const

// Logo: imagem embutida (data:image/...) de até ~600 KB ou endereço https.
const LOGO_MAX = 800_000
function validLogo(v: unknown) {
  if (v === null || v === '') return true
  if (typeof v !== 'string') return false
  if (v.startsWith('https://')) return v.length < 2000
  return /^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(v) && v.length <= LOGO_MAX
}
const validColor = (v: unknown) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)

export async function show(req: AuthRequest, res: Response) {
  const clinic = await prisma.clinic.findFirst({ where: { id: req.user!.clinicId, tenantId: req.user!.tenantId } })
  if (!clinic) return res.status(404).json({ error: 'Clínica não encontrada.' })
  return res.json(clinic)
}

export async function update(req: AuthRequest, res: Response) {
  const before = await prisma.clinic.findFirst({ where: { id: req.user!.clinicId, tenantId: req.user!.tenantId } })
  if (!before) return res.status(404).json({ error: 'Clínica não encontrada.' })
  const data: Record<string, unknown> = {}
  for (const key of editable) if (key in req.body) data[key] = req.body[key]
  if ('logo' in data && !validLogo(data.logo)) return res.status(400).json({ error: 'Logo inválida. Envie PNG, JPG, WEBP ou SVG de até 600 KB.' })
  for (const key of ['primaryColor','secondaryColor','accentColor'] as const) if (key in data && !validColor(data[key])) return res.status(400).json({ error: 'Cor inválida. Use o formato #RRGGBB.' })
  for (const key of ['phone','email','cnpj'] as const) if (key in data && typeof data[key] !== 'string') return res.status(400).json({ error: `Campo ${key} inválido.` })
  if (data.logo === '') data.logo = null
  const clinic = await prisma.clinic.update({ where: { id: before.id }, data })
  // A logo (imagem grande) fica fora do registro de auditoria; registra só se mudou.
  const strip = <T extends { logo: string | null }>(c: T) => ({ ...c, logo: c.logo ? `[logo ${c.logo.length} caracteres]` : null })
  await writeAudit({ clinicId: before.id, tenantId: before.tenantId, actorId: req.user!.id, module: 'settings', action: 'update_identity', entityType: 'Clinic', entityId: before.id, beforeData: strip(before), afterData: strip(clinic), ipAddress: req.ip, userAgent: req.headers['user-agent'] })
  return res.json(clinic)
}

/* ---------- Kit da clínica (cartões, documentos, lembretes) ----------
   Identidade vem da tabela Clinic. Dados extras (WhatsApp, site, RT, cargos da equipe,
   textos dos documentos) ficam na tabela ClinicBrandKit, criada pelo SQL manual
   20261023_kit_clinica.sql. Enquanto o SQL não rodar, o kit funciona só com a identidade. */

const KIT_MAX = 200_000
const clinicPublic = { name: true, displayName: true, logo: true, primaryColor: true, phone: true, email: true, cnpj: true, address: true, city: true, state: true, zipCode: true } as const

async function readKit(clinicId: string, tenantId: string): Promise<{ data: Record<string, unknown>; ready: boolean }> {
  try {
    const rows = await prisma.$queryRaw<{ data: Record<string, unknown> }[]>(Prisma.sql`SELECT "data" FROM "ClinicBrandKit" WHERE "clinicId"=${clinicId} AND "tenantId"=${tenantId} LIMIT 1`)
    return { data: rows[0]?.data || {}, ready: true }
  } catch {
    return { data: {}, ready: false }
  }
}

export async function brandKitShow(req: AuthRequest, res: Response) {
  const clinic = await prisma.clinic.findFirst({ where: { id: req.user!.clinicId, tenantId: req.user!.tenantId }, select: clinicPublic })
  if (!clinic) return res.status(404).json({ error: 'Clínica não encontrada.' })
  const kit = await readKit(req.user!.clinicId, req.user!.tenantId)
  return res.json({ clinic, kit: kit.data, kitReady: kit.ready })
}

export async function brandKitUpdate(req: AuthRequest, res: Response) {
  const body = req.body?.kit
  if (!body || typeof body !== 'object' || Array.isArray(body)) return res.status(400).json({ error: 'Envie o campo kit como objeto.' })
  const json = JSON.stringify(body)
  if (json.length > KIT_MAX) return res.status(413).json({ error: 'Dados do kit muito grandes.' })
  const { clinicId, tenantId, id: actorId } = req.user!
  try {
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "ClinicBrandKit" ("id","clinicId","tenantId","data","updatedBy","createdAt","updatedAt")
      VALUES (${randomUUID()}, ${clinicId}, ${tenantId}, ${json}::jsonb, ${actorId}, NOW(), NOW())
      ON CONFLICT ("clinicId") DO UPDATE SET "data"=EXCLUDED."data", "updatedBy"=EXCLUDED."updatedBy", "updatedAt"=NOW()`)
  } catch (e) {
    console.error('[brand-kit]', e)
    return res.status(503).json({ error: 'O kit ainda não pode ser salvo: falta rodar o SQL 20261023_kit_clinica.sql no banco.' })
  }
  await writeAudit({ clinicId, tenantId, actorId, module: 'settings', action: 'update_brand_kit', entityType: 'ClinicBrandKit', entityId: clinicId, afterData: { keys: Object.keys(body) }, ipAddress: req.ip, userAgent: req.headers['user-agent'] })
  return res.json({ kit: body })
}
