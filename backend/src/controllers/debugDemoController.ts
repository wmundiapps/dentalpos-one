import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma'
import { DEMO_ACCESS_FLAG, getDemoAccess } from '../services/demoAccessService'

function checkSecret(req: Request, res: Response): boolean {
  const expected = process.env.DEBUG_DEMO_SECRET || ''
  const provided = req.header('x-debug-secret') || ''
  if (!expected || provided !== expected) {
    res.status(403).json({ error: 'Não autorizado.' })
    return false
  }
  return true
}

type DebugClinicSummary = {
  clinicId: string
  name: string
  plan: string
  phase: string
  endAt: string | null
  modules: string[]
}

export async function list(req: Request, res: Response) {
  if (!checkSecret(req, res)) return
  const clinics = await prisma.clinic.findMany({
    where: {
      OR: [
        { plan: { startsWith: 'DEMO' } },
        { featureFlags: { some: { key: DEMO_ACCESS_FLAG, enabled: true } } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, displayName: true, plan: true },
  })

  const results: DebugClinicSummary[] = []
  for (const clinic of clinics) {
    const demo = await getDemoAccess(clinic.id)
    results.push({
      clinicId: clinic.id,
      name: clinic.displayName || clinic.name,
      plan: clinic.plan,
      phase: demo.phase,
      endAt: demo.endAt,
      modules: demo.modules,
    })
  }
  return res.json(results)
}

export async function setModules(req: Request, res: Response) {
  if (!checkSecret(req, res)) return
  const { clinicId, modules } = req.body as { clinicId?: string; modules?: string[] }
  if (!clinicId || !Array.isArray(modules) || !modules.length) {
    return res.status(400).json({ error: 'Informe clinicId e modules (array).' })
  }

  const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { id: true, plan: true } })
  if (!clinic) return res.status(404).json({ error: 'Clínica não encontrada.' })

  const flag = await prisma.tenantFeatureFlag.findUnique({
    where: { clinicId_key: { clinicId, key: DEMO_ACCESS_FLAG } },
  })
  if (!flag) return res.status(404).json({ error: 'Configuração de demo não encontrada para esta clínica.' })

  const metadata = (flag.metadata || {}) as Record<string, unknown>

  await prisma.tenantFeatureFlag.update({
    where: { id: flag.id },
    data: {
      enabled: true,
      rolloutStage: 'PILOT',
      metadata: { ...metadata, modules, version: 1 },
    },
  })

  if (!String(clinic.plan).toUpperCase().startsWith('DEMO')) {
    await prisma.clinic.update({ where: { id: clinicId }, data: { plan: 'DEMO' } })
  }

  return res.json({ ok: true, clinicId, modules })
}