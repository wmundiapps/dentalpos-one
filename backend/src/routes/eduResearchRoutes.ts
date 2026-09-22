import { Router } from 'express'
import { requirePermission } from '../middleware/permission'
import * as research from '../controllers/eduResearchController'

// Rotas do EduMaster Pro — Pesquisa e Extensão.
// Montadas em /api/edu/*. Autenticação e contexto de tenant já
// resolvidos pelos middlewares aplicados antes deste router em
// src/routes/index.ts.
const router = Router()

router.get('/edu/funding-agencies', requirePermission('edu.research.view'), research.listFundingAgencies)
router.post('/edu/funding-agencies', requirePermission('edu.research.manage'), research.createFundingAgency)

router.get('/edu/funding-calls', requirePermission('edu.research.view'), research.listFundingCalls)
router.post('/edu/funding-calls', requirePermission('edu.research.manage'), research.createFundingCall)

router.get('/edu/research-projects', requirePermission('edu.research.view'), research.listResearchProjects)
router.post('/edu/research-projects', requirePermission('edu.research.manage'), research.createResearchProject)
router.put('/edu/research-projects/:id/status', requirePermission('edu.research.manage'), research.updateResearchProjectStatus)
router.post('/edu/research-projects/:projectId/members', requirePermission('edu.research.manage'), research.addResearchProjectMember)

// Portal do aluno (self-service)
router.get('/edu/me/research-projects', research.myResearchProjects)

export default router
