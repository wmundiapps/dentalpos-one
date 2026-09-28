import { Router } from 'express'
import { requirePermission } from '../middleware/permission'
import * as career from '../controllers/eduCareerController'

// Rotas do EduMaster Pro — Vagas e Carreiras.
// Montadas em /api/edu/*. Autenticação e contexto de tenant já
// resolvidos pelos middlewares aplicados antes deste router em
// src/routes/index.ts.
const router = Router()

// Mural de vagas: leitura liberada a qualquer usuário autenticado do
// tenant (aluno navega pelas vagas); publicar/gerenciar é administrativo.
router.get('/edu/job-postings', career.listJobPostings)
router.post('/edu/job-postings', requirePermission('edu.career.manage'), career.createJobPosting)
router.post('/edu/job-postings/:id/close', requirePermission('edu.career.manage'), career.closeJobPosting)
router.get('/edu/job-postings/:postingId/applications', requirePermission('edu.career.manage'), career.listJobApplications)
router.put('/edu/job-applications/:id/decision', requirePermission('edu.career.manage'), career.decideJobApplication)

// Portal do aluno (self-service)
router.get('/edu/me/job-applications', career.myJobApplications)
router.post('/edu/me/job-postings/:postingId/apply', career.applyToJobPosting)

export default router
