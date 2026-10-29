import { Router } from 'express'
import { NextFunction, Request, Response } from 'express'
import { academicErrorHandler } from '../academico/middleware'
import { registerEduJob } from '../core/jobs'
import { jobCobranca } from './motor'
import acordos from './rotas-acordos'
import carteira from './rotas-carteira'
import config from './rotas-config'
import contatos from './rotas-contatos'
import escalonamento from './rotas-escalonamento'

// Módulo "cobranca" (inadimplência, política, régua com recorrência, acordos, conformidade e escalonamento).
// Autenticado em /api/edu/cobranca. Não há rotas públicas: aceite do aluno é registrado pelo atendente.
const router = Router()

router.use(config)
router.use(carteira)
router.use(acordos)
router.use(contatos)
router.use(escalonamento)
// Erros de negócio com dados extras (erros de conformidade, precisaAprovacao, parcelasVencidas...) saem junto da mensagem.
router.use((err: any, _req: Request, res: Response, next: NextFunction) => {
  if (err?.extra && err.status && err.status < 500 && !res.headersSent) return res.status(err.status).json({ error: err.message, ...err.extra })
  next(err)
})
router.use(academicErrorHandler)
export default router

// Job periódico (cron /api/cron/edu): quebra/expiração de acordos, promessas vencidas, motor da régua e despacho.
// Registrado DEPOIS do job da Comunicação; por isso o motor já chama o dispatcher ao final.
registerEduJob('cobranca.motor', () => jobCobranca())
