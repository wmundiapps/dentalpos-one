import { Router } from 'express'
import { requirePermission } from '../middleware/permission'
import * as exam from '../controllers/eduExamController'

// Rotas do EduMaster Pro — Provas com IA.
// Montadas em /api/edu/*. Autenticação e contexto de tenant já
// resolvidos pelos middlewares aplicados antes deste router em
// src/routes/index.ts.
const router = Router()

router.get('/edu/questions', requirePermission('edu.exam.view'), exam.listQuestions)
router.post('/edu/questions', requirePermission('edu.exam.manage'), exam.createQuestion)
router.post('/edu/questions/generate', requirePermission('edu.exam.manage'), exam.generateQuestions)

router.get('/edu/exams', requirePermission('edu.exam.view'), exam.listExams)
router.post('/edu/exams', requirePermission('edu.exam.manage'), exam.createExam)
router.post('/edu/exams/:examId/questions', requirePermission('edu.exam.manage'), exam.addExamQuestion)
router.post('/edu/exams/:examId/publish', requirePermission('edu.exam.manage'), exam.publishExam)
router.get('/edu/exams/:examId/attempts', requirePermission('edu.exam.grade'), exam.listExamAttempts)

router.post('/edu/exam-answers/:answerId/ai-grade', requirePermission('edu.exam.grade'), exam.gradeEssayWithAI)
router.post('/edu/exam-answers/:answerId/manual-grade', requirePermission('edu.exam.grade'), exam.gradeEssayManually)

// Portal do aluno (self-service)
router.get('/edu/me/exams', exam.myAvailableExams)
router.post('/edu/me/exams/:examId/start', exam.startAttempt)
router.post('/edu/me/exam-attempts/:attemptId/submit', exam.submitAttempt)
router.get('/edu/me/exam-results', exam.myResults)

export default router
