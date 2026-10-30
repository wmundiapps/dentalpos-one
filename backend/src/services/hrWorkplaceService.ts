import jwt from 'jsonwebtoken'
import type { NextFunction, Request, Response } from 'express'
import { prisma } from '../lib/prisma'
import { writeAudit } from './auditService'
import { comparePassword, hashPassword } from './userService'
import type { Place } from './hrTimeService'
export type { Place }

// Polos/unidades: cada polo tem o local exato (latitude/longitude + raio) e um PIN do aparelho. O celular do polo abre o link do polo,
// digita o PIN uma vez e passa a bater ponto (CPF + rosto) só dentro do raio. Esse acesso não abre mais nada do sistema.
const secret = () => `${process.env.JWT_SECRET || ''}:polo-aparelho`
const slugify = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50)
const num = (v: unknown) => (v === '' || v === null || v === undefined ? NaN : Number(String(v).replace(',', '.')))
const isPending = (w: { latitude: number; longitude: number }) => w.latitude === 0 && w.longitude === 0
type Org = { clinicId: string; tenantId: string; actorId: string }

const publicRow = (w: { id: string; name: string; slug: string; address: string | null; latitude: number; longitude: number; radiusMeters: number; pinHash: string | null; isActive: boolean; calibrating: boolean; calibratedAt: Date | null; calibratedAccuracy: number | null; utcOffsetMinutes: number }) =>
  ({ id: w.id, name: w.name, slug: w.slug, address: w.address, latitude: w.latitude, longitude: w.longitude, radiusMeters: w.radiusMeters, hasPin: Boolean(w.pinHash), isActive: w.isActive, calibrating: w.calibrating, pending: isPending(w), calibratedAt: w.calibratedAt, calibratedAccuracy: w.calibratedAccuracy, utcOffsetMinutes: w.utcOffsetMinutes })

export async function list(clinicId: string) {
  const rows = await prisma.hRWorkplace.findMany({ where: { clinicId }, orderBy: { name: 'asc' } })
  const counts = await prisma.hREmployee.groupBy({ by: ['workplaceId'], where: { clinicId, workplaceId: { not: null }, status: { notIn: ['TERMINATED', 'Desligado'] } }, _count: true })
  return rows.map((w) => ({ ...publicRow(w), employees: counts.find((c) => c.workplaceId === w.id)?._count || 0 }))
}

export async function save(c: Org, id: string | null, body: any) {
  const name = String(body?.name || '').trim().slice(0, 80)
  if (name.length < 3) return { error: 'Informe o nome do polo.' }
  const remote = body?.pendingCalibration === true
  const latitude = remote && !Number.isFinite(num(body?.latitude)) ? 0 : num(body?.latitude), longitude = remote && !Number.isFinite(num(body?.longitude)) ? 0 : num(body?.longitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return { error: 'Informe a localização exata do polo (latitude e longitude). Use “Capturar localização deste aparelho” estando no polo.' }
  const radiusMeters = Math.round(num(body?.radiusMeters || 150))
  if (!(radiusMeters >= 30 && radiusMeters <= 1000)) return { error: 'O raio permitido deve ficar entre 30 e 1000 metros.' }
  const tz = Math.round(num(body?.utcOffsetMinutes ?? -180))
  if (![-120, -180, -240, -300].includes(tz)) return { error: 'Fuso horário inválido.' }
  const address = body?.address ? String(body.address).trim().slice(0, 200) : null
  let slug = slugify(String(body?.slug || name))
  if (!slug) return { error: 'Nome inválido.' }
  const clash = await prisma.hRWorkplace.findFirst({ where: { clinicId: c.clinicId, slug, ...(id ? { id: { not: id } } : {}) }, select: { id: true } })
  if (clash) slug = `${slug}-${Math.random().toString(36).slice(2, 5)}`
  if (id) {
    const cur = await prisma.hRWorkplace.findFirst({ where: { id, clinicId: c.clinicId } })
    if (!cur) return { error: 'Polo não encontrado.', status: 404 }
    const row = await prisma.hRWorkplace.update({ where: { id }, data: { name, slug: body?.slug ? slug : cur.slug, address, latitude, longitude, radiusMeters, utcOffsetMinutes: tz, ...(body?.isActive !== undefined ? { isActive: Boolean(body.isActive) } : {}), ...(remote ? { calibrating: true } : (latitude !== cur.latitude || longitude !== cur.longitude) ? { calibrating: false } : {}) } })
    await writeAudit({ clinicId: c.clinicId, tenantId: c.tenantId, actorId: c.actorId, module: 'hr', action: 'WORKPLACE_UPDATE', entityType: 'HRWorkplace', entityId: id, summary: `Polo ${name} atualizado (${latitude.toFixed(5)}, ${longitude.toFixed(5)}, raio ${radiusMeters} m).` }).catch(() => undefined)
    return { ok: true, workplace: publicRow(row) }
  }
  const row = await prisma.hRWorkplace.create({ data: { clinicId: c.clinicId, tenantId: c.tenantId, name, slug, address, latitude, longitude, radiusMeters, utcOffsetMinutes: tz, calibrating: remote } })
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

// RH libera (ou cancela) a calibragem: a pessoa responsável pelo polo confirma o local pelo celular do polo, sem o RH precisar estar lá.
export async function setCalibration(c: Org, id: string, on: boolean) {
  const cur = await prisma.hRWorkplace.findFirst({ where: { id, clinicId: c.clinicId } })
  if (!cur) return { error: 'Polo não encontrado.', status: 404 }
  if (!cur.pinHash && on) return { error: 'Defina antes o PIN do polo: a calibragem é feita no celular do polo, depois de digitar o PIN.' }
  await prisma.hRWorkplace.update({ where: { id }, data: { calibrating: on } })
  await writeAudit({ clinicId: c.clinicId, tenantId: c.tenantId, actorId: c.actorId, module: 'hr', action: on ? 'WORKPLACE_CALIBRATION_OPEN' : 'WORKPLACE_CALIBRATION_CLOSE', entityType: 'HRWorkplace', entityId: id, summary: `Calibragem do local do polo ${cur.name} ${on ? 'liberada' : 'encerrada'}.` }).catch(() => undefined)
  return { ok: true }
}

// ---- público (celular do polo) ----
const tries = new Map<string, { n: number; until: number }>()

export async function publicInfo(slug: string) {
  const w = await prisma.hRWorkplace.findFirst({ where: { slug: slug.toLowerCase(), isActive: true }, select: { name: true, pinHash: true, calibrating: true, latitude: true, longitude: true } })
  return w ? { name: w.name, ready: Boolean(w.pinHash), calibrating: w.calibrating, pending: isPending(w) } : null
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
    req.polo = { clinicId: w.clinicId, tenantId: w.tenantId, place: { id: w.id, name: w.name, latitude: w.latitude, longitude: w.longitude, radiusMeters: w.radiusMeters, pending: isPending(w), calibrating: w.calibrating, utcOffsetMinutes: w.utcOffsetMinutes } }
    return next()
  } catch { return res.status(401).json({ code: 'POLO_LOCKED', error: 'Aparelho não liberado. Digite o PIN do polo.' }) }
}

// Calibragem no próprio polo: só quando o RH liberou, só com PIN do aparelho e com boa precisão do GPS. Grava o local e encerra a calibragem.
export async function calibrate(place: Place, body: any) {
  const w = await prisma.hRWorkplace.findUnique({ where: { id: place.id } })
  if (!w || !w.calibrating) return { error: 'A calibragem do local não está liberada para este polo. Peça ao RH para liberar.', status: 403 }
  const latitude = num(body?.latitude), longitude = num(body?.longitude), accuracy = Math.round(num(body?.accuracy))
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || (latitude === 0 && longitude === 0)) return { error: 'Localização inválida. Ative a localização do aparelho e tente de novo.' }
  if (!Number.isFinite(accuracy) || accuracy > 60) return { error: `A localização está imprecisa (±${Number.isFinite(accuracy) ? accuracy : '?'} m). Vá para perto de uma janela ou área aberta, espere alguns segundos e tente de novo (precisa ficar em até 60 m).` }
  await prisma.hRWorkplace.update({ where: { id: w.id }, data: { latitude, longitude, calibrating: false, calibratedAt: new Date(), calibratedAccuracy: accuracy } })
  await writeAudit({ clinicId: w.clinicId, tenantId: w.tenantId, actorId: `polo:${w.id}`, module: 'hr', action: 'WORKPLACE_CALIBRATED', entityType: 'HRWorkplace', entityId: w.id, summary: `Local do polo ${w.name} confirmado pelo celular do polo (${latitude.toFixed(5)}, ${longitude.toFixed(5)}, precisão ±${accuracy} m).` }).catch(() => undefined)
  return { ok: true }
}
