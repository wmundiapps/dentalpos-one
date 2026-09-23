import { Router } from 'express'
import { requirePermission } from '../middleware/permission'
import * as edu from '../controllers/eduAcademicController'
import * as eduAccess from '../controllers/eduAccessController'

// Rotas do EduMaster Pro — Núcleo Acadêmico.
// Montadas em /api/edu/*. Autenticação e contexto de tenant já
// resolvidos pelos middlewares aplicados antes deste router em
// src/routes/index.ts.
const router = Router()

router.get('/edu/programs', requirePermission('edu.academic.view'), edu.listPrograms)
router.post('/edu/programs', requirePermission('edu.academic.manage'), edu.createProgram)
router.put('/edu/programs/:id', requirePermission('edu.academic.manage'), edu.updateProgram)

router.get('/edu/subjects', requirePermission('edu.academic.view'), edu.listSubjects)
router.post('/edu/subjects', requirePermission('edu.academic.manage'), edu.createSubject)

router.get('/edu/curriculums', requirePermission('edu.academic.view'), edu.listCurriculums)
router.post('/edu/curriculums', requirePermission('edu.academic.manage'), edu.createCurriculum)
router.post('/edu/curriculums/:curriculumId/subjects', requirePermission('edu.academic.manage'), edu.addCurriculumSubject)

router.get('/edu/terms', requirePermission('edu.academic.view'), edu.listTerms)
router.post('/edu/terms', requirePermission('edu.academic.manage'), edu.createTerm)

router.get('/edu/students', requirePermission('edu.academic.view'), edu.listStudents)
router.get('/edu/students/:id', requirePermission('edu.academic.view'), edu.showStudent)
router.post('/edu/students', requirePermission('edu.academic.manage'), edu.createStudent)
router.put('/edu/students/:id', requirePermission('edu.academic.manage'), edu.updateStudent)
router.post('/edu/students/:id/activate-access', requirePermission('edu.academic.manage'), eduAccess.activateStudentAccess)

router.get('/edu/equivalency-requests', requirePermission('edu.academic.view'), edu.listEquivalencyRequests)
router.post('/edu/equivalency-requests', requirePermission('edu.academic.manage'), edu.createEquivalencyRequest)
router.put('/edu/equivalency-items/:itemId/decision', requirePermission('edu.academic.manage'), edu.decideEquivalencyItem)

router.get('/edu/enrollments', requirePermission('edu.enrollment.view'), edu.listEnrollments)
router.post('/edu/enrollments', requirePermission('edu.enrollment.manage'), edu.createEnrollment)

router.get('/edu/classes', requirePermission('edu.academic.view'), edu.listClasses)
router.post('/edu/classes', requirePermission('edu.academic.manage'), edu.createClass)
router.get('/edu/classes/:classId/roster', requirePermission('edu.academic.view'), edu.listClassRoster)
router.post('/edu/classes/:classId/enrollments', requirePermission('edu.enrollment.manage'), edu.enrollInClass)

router.get('/edu/classes/:classId/sessions', requirePermission('edu.academic.view'), edu.listClassSessions)
router.post('/edu/classes/:classId/sessions', requirePermission('edu.academic.manage'), edu.createSession)
router.post('/edu/sessions/:sessionId/bookings', requirePermission('edu.enrollment.manage'), edu.bookSession)
router.post('/edu/sessions/:sessionId/attendance', requirePermission('edu.attendance.manage'), edu.recordAttendance)
router.get('/edu/sessions/:sessionId/attendance', requirePermission('edu.academic.view'), edu.listSessionAttendance)

// Portal do aluno (self-service)
router.get('/edu/me/profile', edu.myProfile)
router.get('/edu/me/enrollments', edu.myEnrollments)
router.get('/edu/me/available-sessions', edu.myAvailableSessions)
router.post('/edu/me/sessions/:sessionId/book', edu.bookSessionSelf)
router.post('/edu/me/sessions/:sessionId/cancel', edu.cancelSessionBookingSelf)
router.get('/edu/me/attendance', edu.myAttendance)

export default router
