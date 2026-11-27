import { Router } from 'express'
import societario from './societario/routes'
import rhDp from './rh-dp/routes'
import impostoRenda from './imposto-renda/routes'
import assistente from './assistente/routes'

// Escritório de Contabilidade — parte 2 (societário, RH/DP, imposto de renda, assistente).
// Montado em /api/edu/contabil (autenticado). Sub-rotas: /societario, /rh-dp, /imposto-renda, /assistente.
// Bloco PORTÁTIL: depende do hospedeiro apenas por ./host2.ts (ver README.md).
const router = Router()
router.use('/societario', societario)
router.use('/rh-dp', rhDp)
router.use('/imposto-renda', impostoRenda)
router.use('/assistente', assistente)

export default router
