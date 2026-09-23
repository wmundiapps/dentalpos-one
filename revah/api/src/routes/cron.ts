import { Router } from 'express'
import { config, isProduction } from '../config'
import { safeEqual } from '../lib/crypto'
import { ah } from '../lib/errors'
import { processDueJobs } from '../services/jobs'

const r = Router()

// Chamado pelo Vercel Cron (Authorization: Bearer CRON_SECRET) ou por um agendador externo.
r.all(
  '/cron/tick',
  ah(async (req, res) => {
    const auth = String(req.headers.authorization || '')
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : String(req.query.secret || '')
    if (config.cronSecret ? !safeEqual(token, config.cronSecret) : isProduction) return res.sendStatus(401)
    res.json(await processDueJobs({ maxMs: Number(req.query.maxMs || 45_000) }))
  }),
)

export default r
