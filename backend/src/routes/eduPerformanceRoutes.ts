import { Router } from 'express'
import { requirePermission } from '../middleware/permission'
import * as perf from '../controllers/eduPerformanceController'

// Rotas do EduMaster Pro — Desempenho, ENADE/ENAMED e Reforço.
// Montadas em /api/edu/*. Autenticação e contexto de tenant já
// resolvidos pelos middlewares aplicados antes deste router em
// src/routes/index.ts.
const router = Router()

router.get('/edu/students/:id/performance', requirePermission('edu.performance.view'), perf.studentPerformance)
router.get('/edu/classes/:classId/performance', requirePermission('edu.performance.view'), perf.classPerformanceSummary)
router.put('/edu/enrollments/:id/status', requirePermission('edu.enrollment.manage'), perf.updateEnrollmentStatus)

router.get('/edu/reinforcement-plans', requirePermission('edu.performance.view'), perf.listReinforcementPlans)
router.post('/edu/reinforcement-plans', requirePermission('edu.performance.manage'), perf.createReinforcementPlan)
router.post('/edu/reinforcement-plans/:planId/actions', requirePermission('edu.performance.manage'), perf.addReinforcementAction)
router.post('/edu/reinforcement-actions/:actionId/complete', requirePermission('edu.performance.manage'), perf.completeReinforcementAction)

// Portal do aluno (self-service)
router.get('/edu/me/performance', perf.myPerformance)
router.get('/edu/me/reinforcement-plans', perf.myReinforcementPlans)

export default router
