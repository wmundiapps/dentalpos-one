import { Router } from 'express'
import { requirePermission } from '../middleware/permission'
import * as gov from '../controllers/eduGovernanceController'

// Rotas do EduMaster Pro — Governança e Regulatório.
// Montadas em /api/edu/*. Autenticação e contexto de tenant já
// resolvidos pelos middlewares aplicados antes deste router em
// src/routes/index.ts.
const router = Router()

router.get('/edu/committees', requirePermission('edu.governance.view'), gov.listCommittees)
router.post('/edu/committees', requirePermission('edu.governance.manage'), gov.createCommittee)
router.post('/edu/committees/:committeeId/members', requirePermission('edu.governance.manage'), gov.addCommitteeMember)

router.get('/edu/pdi-goals', requirePermission('edu.governance.view'), gov.listPdiGoals)
router.post('/edu/pdi-goals', requirePermission('edu.governance.manage'), gov.createPdiGoal)
router.put('/edu/pdi-goals/:id', requirePermission('edu.governance.manage'), gov.updatePdiGoal)
router.post('/edu/pdi-goals/:goalId/evidences', requirePermission('edu.governance.manage'), gov.addPdiEvidence)

router.get('/edu/regulatory-watches', requirePermission('edu.governance.view'), gov.listRegulatoryWatches)
router.post('/edu/regulatory-watches', requirePermission('edu.governance.manage'), gov.createRegulatoryWatch)
router.post('/edu/regulatory-watches/:id/triage', requirePermission('edu.governance.manage'), gov.triageRegulatoryWatch)
router.put('/edu/regulatory-watches/:id/status', requirePermission('edu.governance.manage'), gov.updateRegulatoryWatchStatus)

export default router
