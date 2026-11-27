import { Router } from 'express'
import { academicErrorHandler } from '../academico/middleware'
import { registerCampanhas } from './rotas-campanhas'
import { registerLeads } from './rotas-leads'
import { registerDisparos } from './rotas-disparos'
import { registerMidiaIa } from './rotas-midia-ia'
import { registerSite } from './rotas-site'
import { registerPainel } from './painel'
import { registerMktJobs } from './jobs'
export { publicRouter } from './publico'

// Módulo MARKETING E CAPTAÇÃO — /api/edu/marketing (autenticado) e /api/public/edu/marketing (público).
// Leitura: MARKETING/ADMISSIONS/COORDINATOR/SECRETARY/FINANCE; escrita: MARKETING (+ ADMISSIONS em leads); aprovação: COORDINATOR e super-papéis.
const router = Router()
registerPainel(router)
registerCampanhas(router)
registerLeads(router)
registerDisparos(router)
registerMidiaIa(router)
registerSite(router)
registerMktJobs()
router.use(academicErrorHandler)
export default router
