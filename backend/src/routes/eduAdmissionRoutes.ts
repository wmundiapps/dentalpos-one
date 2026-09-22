import { Router } from 'express'
import { requirePermission } from '../middleware/permission'
import * as admission from '../controllers/eduAdmissionController'

// Rotas do EduMaster Pro — Captação e Ingresso.
// Montadas em /api/edu/*. Autenticação e contexto de tenant já
// resolvidos pelos middlewares aplicados antes deste router em
// src/routes/index.ts. A inscrição pública é montada separadamente em
// routes/index.ts (antes do authMiddleware).
const router = Router()

router.get('/edu/admission-exams', requirePermission('edu.admission.view'), admission.listAdmissionExams)
router.post('/edu/admission-exams', requirePermission('edu.admission.manage'), admission.createAdmissionExam)
router.post('/edu/admission-exams/:admissionExamId/classify', requirePermission('edu.admission.manage'), admission.classifyAdmissionExam)

router.get('/edu/applications', requirePermission('edu.admission.view'), admission.listApplications)
router.put('/edu/applications/:id/score', requirePermission('edu.admission.manage'), admission.setApplicationScore)
router.put('/edu/applications/:id/status', requirePermission('edu.admission.manage'), admission.updateApplicationStatus)
router.post('/edu/applications/:id/convert-to-enrollment', requirePermission('edu.enrollment.manage'), admission.convertApplicationToEnrollment)

export default router
