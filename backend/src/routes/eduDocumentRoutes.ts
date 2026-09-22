import { Router } from 'express'
import { requirePermission } from '../middleware/permission'
import * as doc from '../controllers/eduDocumentController'

// Rotas do EduMaster Pro — Protocolo e Certificados (Secretaria).
// Montadas em /api/edu/*. Autenticação e contexto de tenant já
// resolvidos pelos middlewares aplicados antes deste router em
// src/routes/index.ts. A verificação pública de certificado é
// montada separadamente em routes/index.ts (antes do authMiddleware).
const router = Router()

router.get('/edu/students/:studentId/documents', requirePermission('edu.secretary.view'), doc.listStudentDocuments)
router.post('/edu/students/:studentId/documents', requirePermission('edu.secretary.manage'), doc.addStudentDocument)

router.get('/edu/document-requests', requirePermission('edu.secretary.view'), doc.listDocumentRequests)
router.post('/edu/students/:studentId/document-requests', requirePermission('edu.secretary.manage'), doc.createDocumentRequest)
router.put('/edu/document-requests/:id/status', requirePermission('edu.secretary.manage'), doc.updateDocumentRequestStatus)

router.get('/edu/certificates', requirePermission('edu.secretary.view'), doc.listCertificates)
router.post('/edu/certificates', requirePermission('edu.secretary.manage'), doc.createCertificate)

// Portal do aluno (self-service)
router.get('/edu/me/documents', doc.myDocuments)
router.post('/edu/me/documents', doc.addMyDocument)
router.get('/edu/me/document-requests', doc.myDocumentRequests)
router.post('/edu/me/document-requests', doc.createMyDocumentRequest)
router.get('/edu/me/certificates', doc.myCertificates)

export default router
