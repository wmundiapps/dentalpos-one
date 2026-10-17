import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'

// Rateio de despesas do prédio/condomínio entre os condôminos. Guardado na flag da clínica (sem tabela nova),
// um registro por mês (AAAA-MM).
const FLAG_KEY = 'CONDO_SPLIT'
export const ITEM_KEYS = ['agua', 'luz', 'telefone', 'internet', 'iptu', 'condominio', 'limpeza', 'contador', 'sindico', 'fundoReserva', 'bancarios', 'consertos', 'outros'] as const
type Month = { employees: { name: string; salary: number }[]; encargosPct: number; items: Record<string, number>; outrosDesc: string; condominos: number }

const money = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.round(Math.min(n, 1e9) * 100) / 100 : 0 }

function cleanMonth(b: any): Month {
  const items: Record<string, number> = {}
  for (const k of ITEM_KEYS) items[k] = money(b?.items?.[k])
  const employees = (Array.isArray(b?.employees) ? b.employees : []).slice(0, 200).map((e: any) => ({ name: String(e?.name ?? '').trim().slice(0, 80), salary: money(e?.salary) })).filter((e: { name: string; salary: number }) => e.name || e.salary)
  const pct = Number(b?.encargosPct)
  return { employees, encargosPct: Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0, items, outrosDesc: String(b?.outrosDesc ?? '').slice(0, 120), condominos: Math.min(1000, Math.max(0, Math.round(Number(b?.condominos) || 0))) }
}

export async function show(req: AuthRequest, res: Response) {
  const row = await prisma.tenantFeatureFlag.findUnique({ where: { clinicId_key: { clinicId: req.user!.clinicId, key: FLAG_KEY } } })
  const months = ((row?.metadata as { months?: Record<string, Month> } | null)?.months) || {}
  return res.json({ months })
}

export async function save(req: AuthRequest, res: Response) {
  const month = String(req.body?.month || '')
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return res.status(400).json({ error: 'Mês inválido.' })
  const { clinicId, tenantId } = { clinicId: req.user!.clinicId, tenantId: req.user!.tenantId }
  const row = await prisma.tenantFeatureFlag.findUnique({ where: { clinicId_key: { clinicId, key: FLAG_KEY } } })
  const months = { ...(((row?.metadata as { months?: Record<string, Month> } | null)?.months) || {}), [month]: cleanMonth(req.body?.data) }
  await prisma.tenantFeatureFlag.upsert({
    where: { clinicId_key: { clinicId, key: FLAG_KEY } },
    update: { enabled: true, metadata: { months } as never },
    create: { clinicId, tenantId, key: FLAG_KEY, enabled: true, rolloutStage: 'GA', metadata: { months } as never },
  })
  await writeAudit({ clinicId, tenantId, actorId: req.user!.id, module: 'finance', action: 'CONDO_SPLIT_SAVE', summary: `Rateio do condomínio de ${month} salvo.` }).catch(() => undefined)
  return res.json({ ok: true })
}
