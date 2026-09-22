import { Router } from 'express'
import { requirePermission } from '../middleware/permission'
import * as forms from '../controllers/eduFormController'

// Rotas do EduMaster Pro — Motor de Formulários e Fluxos Configuráveis.
// Último módulo, propositalmente genérico para departamentos extras.
// Montadas em /api/edu/*. Autenticação e contexto de tenant já
// resolvidos pelos middlewares aplicados antes deste router em
// src/routes/index.ts.
const router = Router()

router.get('/edu/form-templates', requirePermission('edu.forms.view'), forms.listFormTemplates)
router.post('/edu/form-templates', requirePermission('edu.forms.manage'), forms.createFormTemplate)
router.post('/edu/form-templates/:templateId/submissions', forms.createFormSubmission)

router.get('/edu/form-submissions', requirePermission('edu.forms.view'), forms.listFormSubmissions)
router.put('/edu/form-submissions/:id/review', requirePermission('edu.forms.manage'), forms.reviewFormSubmission)
router.post('/edu/form-submissions/:id/advance', requirePermission('edu.forms.manage'), forms.advanceFormSubmission)

// Portal do aluno (self-service)
router.get('/edu/me/form-submissions', forms.myFormSubmissions)

export default router
