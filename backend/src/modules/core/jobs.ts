// Registro de jobs periódicos. Cada módulo registra o seu (ex.: marcar
// inadimplentes, fechar prazos, expirar reservas) e o cron único
// GET/POST /api/cron/edu os executa por tenant ou globalmente.
export type EduJob = { name: string; run: () => Promise<unknown> }
const jobs: EduJob[] = []

export function registerEduJob(name: string, run: () => Promise<unknown>) {
  const i = jobs.findIndex((j) => j.name === name)
  if (i >= 0) jobs[i] = { name, run }
  else jobs.push({ name, run })
}

export async function runEduJobs() {
  const out: Record<string, unknown> = {}
  for (const j of jobs) {
    const t = Date.now()
    try {
      out[j.name] = { ok: true, result: await j.run(), ms: Date.now() - t }
    } catch (e: any) {
      console.error(`[edu-job:${j.name}]`, e)
      out[j.name] = { ok: false, error: String(e?.message || e) }
    }
  }
  return out
}
