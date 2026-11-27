import { Router } from 'express'
import { adapterEduMaster } from './adapter/edumaster'
import { definirAdapter } from './adapter'
import contabilidadeRouter from './contabilidade/routes'
import dashboardRouter from './dashboard/routes'
import empresasRouter from './empresas/routes'
import financeiroRouter from './financeiro/routes'
import guiasRouter from './guias/routes'
import { contextoContabil } from './nucleo/rbac'
import { errorHandler } from './nucleo/http'
import notasRouter from './notas/routes'
import regimeRouter from './regime/routes'

// Escritório de Contabilidade — bloco PORTÁTIL. Montado em /api/edu/contabil (autenticado; tenant vem do token).
// Em outro sistema: troque o adapter abaixo (ver README.md) e monte este router onde fizer sentido.
definirAdapter(adapterEduMaster)

const router = Router()
router.use(contextoContabil)            // exige papel contábil (aluno/professor e demais cargos sem papel: 403)
router.use(empresasRouter)
router.use(regimeRouter)
router.use(notasRouter)
router.use(guiasRouter)
router.use(financeiroRouter)
router.use(contabilidadeRouter)
router.use(dashboardRouter)
router.use(errorHandler)
export default router
