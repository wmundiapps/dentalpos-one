import jwt from 'jsonwebtoken'
import type { NextFunction, Request, Response } from 'express'
import { prisma } from '../lib/prisma'
import { writeAudit } from './auditService'
import { comparePassword, hashPassword } from './userService'
import type { Place } from './hrTimeService'

// Polos/unidades: cada polo tem o local exato (latitude/longitude + raio) e um PIN do aparelho. O celular do polo abre o link do polo,
// digita o PIN uma vez e passa a bater ponto (CPF + rosto) só dentro do raio. Esse acesso não abre mais nada do sistema.
const secret = () => `${process.env.JWT_SECRET || ''}:polo-aparelho`
const slugify = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50)
const num = (v: unknown) => (v === '' || v === null || v === undefined ? NaN : Number(String(v).replace(',', '.')))
type Org = { clinicId: string; tenantId: string; actorId: string }

const publicRow = (w: { id: string; name: string; slug: string; address: string | null; latitude: number; longitude: number; radiusMeters: number; pinHash: string | null; isActive: boolean }) =>
  ({ id: w.id, name: w.name, slug: w.slug, address: w.address, latitude: w.latitude, longitude: w.longitude, radiusMeters: w.radiusMeters, hasPin: Boolean(w.pinHash), isActive: w.isActive })

export async function list(clinicId: string) {
  const rows = await prisma.hRWorkplace.findMany({ where: { clinicId }, orderBy: { name: 'asc' } })
  const counts = await prisma.hREmployee.groupBy({ by: ['workplaceId'], where: { clinicId, workplaceId: { not: null }, status: { notIn: ['TERMINATED', 'Desligado'] } }, _count: true })
  return rows.map((w) => ({ ...publicRow(w), employees: counts.find((c) => c.workplaceId === w.id)?._count || 0 }))
}

export async function save(c: Org, id: string | null, body: any) {
  const name = String(body?.name || '').trim().slice(0, 80)
  if (name.length < 3) return { error: 'Informe o nome do polo.' }
  const latitude = num(body?.latitude), longitude = num(body?.longitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return { error: 'Informe a localização exata do polo (latitude e longitude). Use “Capturar localização deste aparelho” estando no polo.' }
  const radiusMeters = Math.round(num(body?.radiusMeters || 150))
  if (!(radiusMeters >= 30 && radiusMeters <= 1000)) return { error: 'O raio permitido deve ficar entre 30 e 1000 metros.' }
  const address = body?.address ? String(body.address).trim().slice(0, 200) : null
  let slug = slugify(String(body?.slug || name))
  if (!slug) return { error: 'Nome inválido.' }
  const clash = await prisma.hRWorkplace.findFirst({ where: { clinicId: c.clinicId, slug, ...(id ? { id: { not: id } } : {}) }, select: { id: true } })
  if (clash) slug = `${slug}-${Math.random().toString(36).slice(2, 5)}`
  if (id) {
    const cur = await prisma.hRWorkplace.findFirst({ where: { id, clinicId: c.clinicId } })
    if (!cur) return { error: 'Polo não encontrado.', status: 404 }
    const row = await prisma.hRWorkplace.update({ where: { id }, data: { name, slug: body?.slug ? slug : cur.slug, address, latitude, longitude, radiusMeters, ...(body?.isActive !== undefined ? { isActive: Boolean(body.isActive) } : {}) } })
    await writeAudit({ clinicId: c.clinicId, tenantId: c.tenantId, actorId: c.actorId, module: 'hr', action: 'WORKPLACE_UPDATE', entityType: 'HRWorkplace', entityId: id, summary: `Polo ${name} atualizado (${latitude.toFixed(5)}, ${longitude.toFixed(5)}, raio ${radiusMeters} m).` }).catch(() => undefined)
    return { ok: true, workplace: publicRow(row) }
  }
  const row = await prisma.hRWorkplace.create({ data: { clinicId: c.clinicId, tenantId: c.tenantId, name, slug, address, latitude, longitude, radiusMeters } })
  await writeAudit({ clinicId: c.clinicId, tenantId: c.tenantId, actorId: c.actorId, module: 'hr', action: 'WORKPLACE_CREATE', entityType: 'HRWorkplace', entityId: row.id, summary: `Polo ${name} criado.` }).catch(() => undefined)
  return { ok: true, workplace: publicRow(row) }
}

export async function setPin(c: Org, id: string, pin: unknown) {
  const p = String(pin ?? '').trim()
  if (!/^\d{6}$/.test(p)) return { error: 'O PIN do aparelho precisa ter 6 números.' }
  const cur = await prisma.hRWorkplace.findFirst({ where: { id, clinicId: c.clinicId } })
  if (!cur) return { error: 'Polo não encontrado.', status: 404 }
  await prisma.hRWorkplace.update({ where: { id }, data: { pinHash: await hashPassword(p) } })
  await writeAudit({ clinicId: c.clinicId, tenantId: c.tenantId, actorId: c.actorId, module: 'hr', action: 'WORKPLACE_PIN', entityType: 'HRWorkplace', entityId: id, summary: `PIN do aparelho do polo ${cur.name} definido.` }).catch(() => undefined)
  return { ok: true }
}

// ---- público (celular do polo) ----
const tries = new Map<string, { n: number; until: number }>()

export async function publicInfo(slug: string) {
  const w = await prisma.hRWorkplace.findFirst({ where: { slug: slug.toLowerCase(), isActive: true }, select: { name: true, pinHash: true } })
  return w ? { name: w.name, ready: Boolean(w.pinHash) } : null
}

export async function unlock(slug: string, pin: unknown, ip: string) {
  const key = `${slug}:${ip}`
  const t = tries.get(key)
  if (t && t.until > Date.now()) return { error: 'Muitas tentativas. Aguarde alguns minutos.', status: 429 }
  const w = await prisma.hRWorkplace.findFirst({ where: { slug: slug.toLowerCase(), isActive: true } })
  if (!w || !w.pinHash) return { error: 'Polo não encontrado ou ainda sem PIN. Fale com o RH.', status: 404 }
  if (!(await comparePassword(String(pin ?? ''), w.pinHash))) {
    const n = (t?.n || 0) + 1
    tries.set(key, { n: n >= 5 ? 0 : n, until: n >= 5 ? Date.now() + 10 * 60 * 1000 : 0 })
    return { error: 'PIN incorreto.', status: 401 }
  }
  tries.delete(key)
  const token = jwt.sign({ kind: 'polo', workplaceId: w.id, clinicId: w.clinicId, tenantId: w.tenantId, v: w.pinHash.slice(-8) }, secret(), { expiresIn: '60d' })
  return { ok: true, token, name: w.name }
}

export type PoloReq = Request & { polo?: { place: Place; clinicId: string; tenantId: string } }
// Aparelho do polo: token do PIN; trocar o PIN invalida os aparelhos antigos.
export async function poloAuth(req: PoloReq, res: Response, next: NextFunction) {
  try {
    const raw = String(req.headers.authorization || '').replace(/^Bearer /, '')
    const p = jwt.verify(raw, secret()) as { kind?: string; workplaceId: string; v?: string }
    if (p.kind !== 'polo') throw new Error('tipo')
    const w = await prisma.hRWorkplace.findFirst({ where: { id: p.workplaceId, slug: String(req.params.slug).toLowerCase(), isActive: true } })
    if (!w || !w.pinHash || w.pinHash.slice(-8) !== p.v) throw new Error('polo')
    req.polo = { clinicId: w.clinicId, tenantId: w.tenantId, place: { id: w.id, name: w.name, latitude: w.latitude, longitude: w.longitude, radiusMeters: w.radiusMeters } }
    return next()
  } catch { return res.status(401).json({ code: 'POLO_LOCKED', error: 'Aparelho não liberado. Digite o PIN do polo.' }) }
}
