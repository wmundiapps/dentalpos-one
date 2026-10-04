import { Router } from 'express'
import { academicErrorHandler } from '../academico/middleware'
import { registerPdi } from './pdi'
import { registerDocumentos } from './documentos'
import { registerCpa, registerCpaPublic } from './cpa'
import { registerNde } from './nde'
import { registerColegiados } from './colegiados'
import { registerCipa } from './cipa'
import { registerCarreira } from './carreira'
import { registerBootstrap } from './bootstrap'
import { registerGovJobs } from './jobs'

// Módulo "governanca" — PDI, documentos/PPC, CPA, NDE, colegiados, CIPA e carreira.
// Rotas autenticadas montadas em /api/edu/governanca.
const router = Router()

registerPdi(router)
registerDocumentos(router)
registerCpa(router)
registerNde(router)
registerColegiados(router)
registerCipa(router)
registerCarreira(router)
registerBootstrap(router)
registerGovJobs()

router.use(academicErrorHandler)

export default router

// Rotas PÚBLICAS (sem login; /api/public/edu/governanca): resposta anônima da CPA por token.
export const publicRouter = Router()
registerCpaPublic(publicRouter)
