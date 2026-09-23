import type { Job } from '@prisma/client'
import { prisma } from '../lib/prisma'

export type JobType = 'CAMPAIGN_SEND' | 'AUTOMATION_ACTION' | 'PLACE_CALL' | 'CALL_SUMMARY'
export type JobOutcome = void | { reschedule: Date; reason?: string }
type Handler = (job: Job) => Promise<JobOutcome>

const handlers: Partial<Record<JobType, Handler>> = {}
export function registerJobHandler(type: JobType, fn: Handler) {
  handlers[type] = fn
}

export async function enqueueJob(tenantId: string, type: JobType, payload: Record<string, unknown>, runAt = new Date()) {
  return prisma.job.create({ data: { tenantId, type, payload: payload as any, runAt } })
}

const MAX_ATTEMPTS = 3

// Reserva atômica (SKIP LOCKED) para permitir vários workers/crons em paralelo.
export async function claimDueJobs(limit: number): Promise<Job[]> {
  await prisma.job.updateMany({
    where: { status: 'RUNNING', lockedAt: { lt: new Date(Date.now() - 10 * 60_000) } },
    data: { status: 'PENDING', lockedAt: null },
  })
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE "Job" SET status = 'RUNNING', "lockedAt" = now(), "updatedAt" = now()
    WHERE id IN (
      SELECT id FROM "Job" WHERE status = 'PENDING' AND "runAt" <= now()
      ORDER BY "runAt" ASC LIMIT ${limit} FOR UPDATE SKIP LOCKED
    ) RETURNING id`
  if (!rows.length) return []
  return prisma.job.findMany({ where: { id: { in: rows.map((r) => r.id) } }, orderBy: { runAt: 'asc' } })
}

export async function runJob(job: Job) {
  const handler = handlers[job.type as JobType]
  if (!handler) {
    await prisma.job.update({ where: { id: job.id }, data: { status: 'FAILED', lastError: `Sem handler para ${job.type}` } })
    return
  }
  try {
    const out = await handler(job)
    if (out && 'reschedule' in out) {
      await prisma.job.update({ where: { id: job.id }, data: { status: 'PENDING', runAt: out.reschedule, lockedAt: null, lastError: out.reason || null } })
    } else {
      await prisma.job.update({ where: { id: job.id }, data: { status: 'DONE', lockedAt: null } })
    }
  } catch (e: any) {
    const attempts = job.attempts + 1
    const done = attempts >= MAX_ATTEMPTS
    await prisma.job.update({
      where: { id: job.id },
      data: {
        attempts,
        status: done ? 'FAILED' : 'PENDING',
        lockedAt: null,
        lastError: String(e?.message || e).slice(0, 500),
        runAt: done ? job.runAt : new Date(Date.now() + 2 ** attempts * 60_000),
      },
    })
    console.error(`[revah] job ${job.type} ${job.id} falhou (tentativa ${attempts})`, e?.message || e)
  }
}

// Processa a fila por até maxMs (ideal para cron serverless).
export async function processDueJobs(opts: { maxMs?: number; batch?: number } = {}) {
  const started = Date.now()
  const maxMs = opts.maxMs ?? 45_000
  let processed = 0
  while (Date.now() - started < maxMs) {
    const jobs = await claimDueJobs(opts.batch ?? 20)
    if (!jobs.length) break
    for (const job of jobs) {
      if (Date.now() - started > maxMs) {
        await prisma.job.update({ where: { id: job.id }, data: { status: 'PENDING', lockedAt: null } })
        continue
      }
      await runJob(job)
      processed++
    }
  }
  return { processed, ms: Date.now() - started }
}
