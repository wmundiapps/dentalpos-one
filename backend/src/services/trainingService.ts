import { randomBytes } from 'crypto'
import { prisma } from '../lib/prisma'
import { getUserPermissionCodes, seedPermissionCatalog } from './permissionService'

export const TRAINING_MODULES = ['carreira', 'jobrotation'] as const
export type TrainingModule = (typeof TRAINING_MODULES)[number]
export const CAREER_LEVELS = ['simples', 'mediano', 'super', 'hiper', 'ultra']
export const JOB_ROTATION_SECTORS = ['rec', 'cme', 'fin', 'lab', 'asb']
export const JOB_ROTATION_TOP_LEVEL = 5

// Perfis de sistema que recebem o treinamento na primeira vez que a clínica abre o módulo.
// Depois disso o gestor ajusta na tela de Permissões e a escolha dele é mantida.
const PROFILE_GRANTS: Record<string, string[]> = {
  GESTOR: ['training.clinical', 'training.jobrotation', 'training.manage'],
  DENTISTA: ['training.clinical'],
  RECEPCAO: ['training.jobrotation'],
  AUXILIAR: ['training.jobrotation'],
  LABORATORIO: ['training.jobrotation'],
  FINANCEIRO: ['training.jobrotation'],
  ADMINISTRACAO: ['training.jobrotation'],
}

export const MODULE_PERMISSION: Record<TrainingModule, string> = {
  carreira: 'training.clinical',
  jobrotation: 'training.jobrotation',
}

export function isTrainingModule(value: unknown): value is TrainingModule {
  return typeof value === 'string' && (TRAINING_MODULES as readonly string[]).includes(value)
}

/** Dia corrente no fuso da clínica (Brasília), no formato AAAA-MM-DD. */
export function trainingDay(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

async function grantDefaultTrainingPermissions(clinicId: string) {
  await seedPermissionCatalog()
  const permissions = await prisma.permission.findMany({ where: { code: { startsWith: 'training.' } } })
  const byCode = new Map(permissions.map((p) => [p.code, p.id]))
  const profiles = await prisma.accessProfile.findMany({ where: { clinicId, code: { in: Object.keys(PROFILE_GRANTS) } } })
  const data = profiles.flatMap((profile) =>
    PROFILE_GRANTS[profile.code]
      .map((code) => byCode.get(code))
      .filter((id): id is string => Boolean(id))
      .map((permissionId) => ({ profileId: profile.id, permissionId })),
  )
  if (data.length) await prisma.accessProfilePermission.createMany({ data, skipDuplicates: true })
}

export async function getTrainingSettings(clinicId: string, tenantId: string) {
  let settings = await prisma.trainingSettings.findUnique({ where: { clinicId } })
  if (!settings) {
    settings = await prisma.trainingSettings
      .create({ data: { clinicId, tenantId } })
      .catch(() => prisma.trainingSettings.findUniqueOrThrow({ where: { clinicId } }))
  }
  if (!settings.permissionsSeededAt) {
    await grantDefaultTrainingPermissions(clinicId)
    settings = await prisma.trainingSettings.update({ where: { clinicId }, data: { permissionsSeededAt: new Date() } })
  }
  return settings
}

export async function getTrainingAccess(user: { id: string; role: string }) {
  if (user.role === 'ADMIN') return { carreira: true, jobrotation: true, manage: true }
  const codes = await getUserPermissionCodes(user.id)
  return {
    carreira: codes.includes('training.clinical'),
    jobrotation: codes.includes('training.jobrotation'),
    manage: codes.includes('training.manage'),
  }
}

export function prizeCode(module: TrainingModule) {
  return `${module === 'carreira' ? 'OD' : 'JR'}-${randomBytes(4).toString('hex').toUpperCase().slice(0, 6)}`
}

/** Confere no progresso salvo se o colaborador realmente chegou ao topo exigido. */
export function reachedTop(module: TrainingModule, state: unknown, minLevel: string) {
  if (!state || typeof state !== 'object') return null
  const s = state as Record<string, unknown>
  if (module === 'carreira') {
    const diff = typeof s.diff === 'string' ? s.diff : ''
    if (s.won !== true || !CAREER_LEVELS.includes(diff)) return null
    return CAREER_LEVELS.indexOf(diff) >= Math.max(0, CAREER_LEVELS.indexOf(minLevel)) ? diff : null
  }
  const level = Number(s.level)
  return Number.isFinite(level) && level > JOB_ROTATION_TOP_LEVEL ? String(JOB_ROTATION_TOP_LEVEL) : null
}
