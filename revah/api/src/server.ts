import app from './app'
import { config } from './config'
import { processDueJobs } from './services/jobs'

app.listen(config.port, () => console.log(`[revah] API ouvindo na porta ${config.port}`))

// Em servidor tradicional, a própria API processa a fila (desligue com EMBEDDED_WORKER=false).
if (process.env.EMBEDDED_WORKER !== 'false') {
  let running = false
  setInterval(async () => {
    if (running) return
    running = true
    try {
      await processDueJobs({ maxMs: 20_000 })
    } catch (e) {
      console.error('[revah] worker', e)
    } finally {
      running = false
    }
  }, 5_000)
}
