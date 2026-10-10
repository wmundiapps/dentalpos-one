import { Router } from 'express'
import { requirePermission } from '../middleware/permission'
import * as wallet from '../controllers/eduWalletController'

// Rotas do EduMaster Pro — Carteira de Créditos (Cantina).
// Montadas em /api/edu/*. Autenticação e contexto de tenant já
// resolvidos pelos middlewares aplicados antes deste router em
// src/routes/index.ts.
const router = Router()

router.get('/edu/students/:studentId/wallet', requirePermission('edu.wallet.view'), wallet.getStudentWallet)
router.post('/edu/students/:studentId/wallet/recharge', requirePermission('edu.wallet.manage'), wallet.rechargeWallet)
router.post('/edu/students/:studentId/wallet/adjust', requirePermission('edu.wallet.manage'), wallet.adjustWallet)

// Portal do aluno (self-service)
router.get('/edu/me/wallet', wallet.myWallet)

export default router
