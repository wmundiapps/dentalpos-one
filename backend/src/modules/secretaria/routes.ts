import { Router, Response } from 'express'
import { AuthenticatedRequest, academicErrorHandler, asyncHandler, getTenantId, requireRole } from '../academico/middleware'
import { mountArquivo } from './arquivo'
import { bootstrapSecretaria } from './bootstrap'
import { mountCertificados } from './certificados'
import { SEC_GESTAO } from './common'
import { mountConferencia } from './conferencia'
import { mountDiplomas } from './diplomas'
import { mountDocumentos } from './documentos'
import { registrarJobsSecretaria } from './jobs'
import { mountProtocolos } from './protocolos'
import { mountSituacao } from './situacao'
import { publicRouter as verificacaoPublica } from './verificacao'

// Módulo "secretaria": protocolo/requerimentos, documentos, conferência, certificados,
// diplomas/colação/livros, arquivo e temporalidade. Montado em /api/edu/secretaria.
const router = Router()

router.post(
  '/bootstrap',
  requireRole(...SEC_GESTAO),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    res.json({ criado: await bootstrapSecretaria(getTenantId(req)) })
  }),
)

mountProtocolos(router)
mountDocumentos(router)
mountConferencia(router)
mountCertificados(router)
mountDiplomas(router)
mountArquivo(router)
mountSituacao(router)

registrarJobsSecretaria()

router.use(academicErrorHandler)

export default router

// Rotas PÚBLICAS (sem login; montadas em /api/public/edu/secretaria): verificação de autenticidade por código.
export const publicRouter = Router()
publicRouter.use(verificacaoPublica)
publicRouter.use(academicErrorHandler)
