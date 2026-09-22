import { Router } from 'express'
import { requirePermission } from '../middleware/permission'
import * as legal from '../controllers/eduLegalController'

// Rotas do EduMaster Pro — Jurídico.
// Montadas em /api/edu/*. Autenticação e contexto de tenant já
// resolvidos pelos middlewares aplicados antes deste router em
// src/routes/index.ts. O sistema organiza prazos, documentos e
// fluxos — não substitui advogado nem dá parecer jurídico.
const router = Router()

router.get('/edu/legal-cases', requirePermission('edu.legal.view'), legal.listLegalCases)
router.post('/edu/legal-cases', requirePermission('edu.legal.manage'), legal.createLegalCase)
router.put('/edu/legal-cases/:id/status', requirePermission('edu.legal.manage'), legal.updateLegalCaseStatus)

router.post('/edu/legal-cases/:caseId/hearings', requirePermission('edu.legal.manage'), legal.scheduleHearing)
router.put('/edu/legal-hearings/:id/outcome', requirePermission('edu.legal.manage'), legal.recordHearingOutcome)

router.post('/edu/legal-cases/:caseId/documents', requirePermission('edu.legal.manage'), legal.addLegalDocument)

router.get('/edu/legal-cases/:caseId/deadlines', requirePermission('edu.legal.view'), legal.listLegalDeadlines)
router.post('/edu/legal-cases/:caseId/deadlines', requirePermission('edu.legal.manage'), legal.addLegalDeadline)

export default router
