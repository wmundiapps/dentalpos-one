import './app'
import { processDueJobs } from './services/jobs'

// Worker dedicado (Railway/Render/Fly/VM). Na Vercel use o cron /cron/tick.
async function loop() {
  for (;;) {
    try {
      const r = await processDueJobs({ maxMs: 30_000 })
      if (!r.processed) await new Promise((res) => setTimeout(res, 3_000))
    } catch (e) {
      console.error('[revah] worker', e)
      await new Promise((res) => setTimeout(res, 10_000))
    }
  }
}
void loop()
