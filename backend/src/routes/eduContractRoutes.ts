import { Router } from 'express'
import { requirePermission } from '../middleware/permission'
import * as contract from '../controllers/eduContractController'

// Rotas do EduMaster Pro — Contratos de Matrícula Digitais.
// Montadas em /api/edu/*. Autenticação e contexto de tenant já
// resolvidos pelos middlewares aplicados antes deste router em
// src/routes/index.ts. O link público de assinatura (sem login) é
// montado separadamente em routes/index.ts (antes do authMiddleware).
const router = Router()

router.get('/edu/contracts', requirePermission('edu.secretary.view'), contract.listContracts)
router.get('/edu/contracts/:id', requirePermission('edu.secretary.view'), contract.getContract)
router.put('/edu/contracts/:id/cancel', requirePermission('edu.secretary.manage'), contract.cancelContract)

// Portal do aluno (self-service)
router.get('/edu/me/contracts', contract.myContracts)

export default router
