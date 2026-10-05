import { Router } from 'express'
import * as prospect from '../controllers/prospectController'

// Rotas PÚBLICAS (sem login): clique, descadastro, cron e webhook.
// Montar no mesmo prefixo da API, ANTES do middleware de autenticação. Ex.: app.use('/api', prospectPublicRouter)
export const prospectPublicRouter = Router()
prospectPublicRouter.get('/p/c/:token', prospect.publicClick)
prospectPublicRouter.get('/p/u/:token', prospect.publicUnsubscribe)
prospectPublicRouter.post('/p/u/:token', prospect.publicUnsubscribe)
prospectPublicRouter.get('/p/cron', prospect.cron)
prospectPublicRouter.post('/p/webhook/resend', prospect.resendWebhook)

// Rotas do PAINEL (exigem login; o controller ainda confere se é equipe WMundi).
// Montar junto das rotas autenticadas. Ex.: router.use(authMiddleware, prospectAdminRouter)
export const prospectAdminRouter = Router()
prospectAdminRouter.get('/prospects/stats', prospect.stats)
prospectAdminRouter.get('/prospects', prospect.list)
prospectAdminRouter.get('/prospects/:id/events', prospect.events)
prospectAdminRouter.patch('/prospects/:id', prospect.updateLead)
prospectAdminRouter.put('/prospects-config', prospect.updateConfig)
prospectAdminRouter.post('/prospects/import', prospect.importLeads)
prospectAdminRouter.post('/prospects/run', prospect.runNow)
prospectAdminRouter.post('/prospects/test', prospect.sendTest)
