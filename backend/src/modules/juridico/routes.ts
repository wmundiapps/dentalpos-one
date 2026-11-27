import { Router } from 'express'
import { academicErrorHandler } from '../academico/middleware'
import { registerAnexos } from './anexos'
import { registerDocumentos } from './documentos'
import { registerContratos } from './contratos'
import { registerImoveis } from './imoveis'
import { registerPolos } from './polos'
import { registerProcessos } from './processos'
import { registerInteligencia } from './inteligencia'
import { registerRiscos } from './riscos'
import { registerPainel } from './painel'
import { registerJurJobs } from './jobs'

// Módulo "juridico" — acervo, contratos, imóveis, polos EAD, processos, inteligência, riscos e seguros.
// Rotas autenticadas montadas em /api/edu/juridico. Leitura: LEGAL/FINANCE/SECRETARY; escrita: LEGAL; ADMIN/OWNER/RECTOR/BOARD sempre.
const router = Router()

registerPainel(router)
registerAnexos(router)
registerDocumentos(router)
registerContratos(router)
registerImoveis(router)
registerPolos(router)
registerProcessos(router)
registerInteligencia(router)
registerRiscos(router)
registerJurJobs()

router.use(academicErrorHandler)

export default router
