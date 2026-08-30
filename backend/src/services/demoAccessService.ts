import { prisma } from '../lib/prisma'

export const DEMO_ACCESS_FLAG = 'DEMO_ACCESS'

export type DemoPhase = 'NONE' | 'ACTIVE' | 'READ_ONLY' | 'ENDED'

export interface DemoAccessSnapshot {
  isDemo: boolean
  phase: DemoPhase
  active: boolean
  readOnly: boolean
  plan: string | null
  startAt: string | null
  endAt: string | null
  graceUntil: string | null
  daysRemaining: number | null
  modules: string[]
  termsVersion: string | null
  message: string
}

type DemoMetadata = {
  version?: number
  startAt?: unknown
  endAt?: unknown
  graceUntil?: unknown
  modules?: unknown
  termsVersion?: unknown
  termsAcceptedAt?: unknown
  program?: unknown
}

const DAY_MS = 24 * 60 * 60 * 1000

function validDate(value: unknown) {
  const date = new Date(String(value || ''))
  return Number.isNaN(date.getTime()) ? undefined : date
}

function normalizeModules(value: unknown) {
  if (!Array.isArray(value)) return []
  return Array.from(
    new Set(
      value
        .map(item => String(item || '').trim().toLowerCase())
        .filter(Boolean),
    ),
  ).sort()
}

function boundedInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, Math.round(parsed)))
}

export function demoOptions() {
  const durationDays = boundedInt(process.env.DEMO_DEFAULT_DAYS, 30, 1, 365)
  const graceDays = boundedInt(process.env.DEMO_GRACE_DAYS, 7, 0, 90)
  const modules = normalizeModules(
    String(process.env.DEMO_DEFAULT_MODULES || 'agenda,patients').split(','),
  )
  const termsVersion = String(process.env.DEMO_TERMS_VERSION || '2026-08-30').trim()
  const enabled =
    process.env.ENABLE_DEMO_REGISTRATION === 'true' ||
    (process.env.NODE_ENV !== 'production' && process.env.ENABLE_DEMO_REGISTRATION !== 'false')

  return {
    enabled,
    durationDays,
    graceDays,
    modules: modules.length ? modules : ['agenda', 'patients'],
    termsVersion,
  }
}

export function createDemoMetadata(input?: {
  startAt?: Date
  durationDays?: number
  graceDays?: number
  modules?: string[]
  termsVersion?: string
}) {
  const options = demoOptions()
  const startAt = input?.startAt || new Date()
  const durationDays = input?.durationDays ?? options.durationDays
  const graceDays = input?.graceDays ?? options.graceDays
  const endAt = new Date(startAt.getTime() + durationDays * DAY_MS)
  const graceUntil = new Date(endAt.getTime() + graceDays * DAY_MS)

  return {
    version: 1,
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
    graceUntil: graceUntil.toISOString(),
    modules: normalizeModules(input?.modules || options.modules),
    termsVersion: input?.termsVersion || options.termsVersion,
    termsAcceptedAt: startAt.toISOString(),
    program: 'EARLY_ACCESS',
  }
}

function noneSnapshot(plan: string | null): DemoAccessSnapshot {
  return {
    isDemo: false,
    phase: 'NONE',
    active: false,
    readOnly: false,
    plan,
    startAt: null,
    endAt: null,
    graceUntil: null,
    daysRemaining: null,
    modules: [],
    termsVersion: null,
    message: '',
  }
}

function endedSnapshot(plan: string | null, metadata?: DemoMetadata): DemoAccessSnapshot {
  return {
    isDemo: true,
    phase: 'ENDED',
    active: false,
    readOnly: false,
    plan,
    startAt: validDate(metadata?.startAt)?.toISOString() || null,
    endAt: validDate(metadata?.endAt)?.toISOString() || null,
    graceUntil: validDate(metadata?.graceUntil)?.toISOString() || null,
    daysRemaining: 0,
    modules: normalizeModules(metadata?.modules),
    termsVersion: metadata?.termsVersion ? String(metadata.termsVersion) : null,
    message:
      'O período gratuito foi encerrado. Os dados permanecem preservados e o acesso pode ser reativado após a contratação.',
  }
}

export async function getDemoAccess(
  clinicId: string,
  now = new Date(),
): Promise<DemoAccessSnapshot> {
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: { id: true, plan: true },
  })

  if (!clinic) return noneSnapshot(null)

  const plan = String(clinic.plan || '')
  const demoPlan = plan.toUpperCase().startsWith('DEMO')
  const flag = await prisma.tenantFeatureFlag.findUnique({
    where: { clinicId_key: { clinicId, key: DEMO_ACCESS_FLAG } },
    select: { enabled: true, metadata: true },
  })

  if (!demoPlan && flag?.enabled !== true) return noneSnapshot(plan)

  const metadata = (flag?.metadata || {}) as DemoMetadata
  if (!flag?.enabled) {
    return demoPlan ? endedSnapshot(plan, metadata) : noneSnapshot(plan)
  }

  const startAt = validDate(metadata.startAt)
  const endAt = validDate(metadata.endAt)
  const graceUntil = validDate(metadata.graceUntil)
  const modules = normalizeModules(metadata.modules)

  if (!startAt || !endAt || !graceUntil || endAt <= startAt || graceUntil < endAt) {
    return endedSnapshot(plan, metadata)
  }

  const nowMs = now.getTime()
  const endMs = endAt.getTime()
  const graceMs = graceUntil.getTime()

  if (nowMs <= endMs) {
    return {
      isDemo: true,
      phase: 'ACTIVE',
      active: true,
      readOnly: false,
      plan,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      graceUntil: graceUntil.toISOString(),
      daysRemaining: Math.max(0, Math.ceil((endMs - nowMs) / DAY_MS)),
      modules,
      termsVersion: metadata.termsVersion ? String(metadata.termsVersion) : null,
      message:
        'Demonstração gratuita ativa. A continuidade após o prazo informado dependerá de contratação.',
    }
  }

  if (nowMs <= graceMs) {
    return {
      isDemo: true,
      phase: 'READ_ONLY',
      active: false,
      readOnly: true,
      plan,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      graceUntil: graceUntil.toISOString(),
      daysRemaining: 0,
      modules,
      termsVersion: metadata.termsVersion ? String(metadata.termsVersion) : null,
      message:
        'A demonstração gratuita terminou. Durante o período de segurança, os dados podem ser consultados, mas novas alterações estão bloqueadas.',
    }
  }

  return endedSnapshot(plan, metadata)
}

export function evaluateDemoPermission(
  demo: DemoAccessSnapshot,
  permissionCode: string,
) {
  if (!demo.isDemo) return { allowed: true as const }

  const [moduleName, action = 'view'] = String(permissionCode || '').toLowerCase().split('.')

  if (demo.phase === 'ENDED') {
    return {
      allowed: false as const,
      code: 'DEMO_ENDED',
      error:
        'A demonstração gratuita foi encerrada. Seus dados permanecem preservados. Solicite uma proposta para reativar o acesso.',
    }
  }

  if (!moduleName || !demo.modules.includes(moduleName)) {
    return {
      allowed: false as const,
      code: 'DEMO_MODULE_LOCKED',
      error: 'Este módulo não está liberado nesta demonstração.',
    }
  }

  if (demo.phase === 'READ_ONLY' && action !== 'view') {
    return {
      allowed: false as const,
      code: 'DEMO_READ_ONLY',
      error:
        'A demonstração terminou e está em modo somente leitura. Seus dados permanecem preservados.',
    }
  }

  return { allowed: true as const }
}
