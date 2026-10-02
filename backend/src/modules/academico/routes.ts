import { Router } from 'express';
import curriculumRoutes from './curriculum';
import studentRoutes from './student';
import classSectionRoutes from './classSection';
import sessionRoutes from './session';
import { academicErrorHandler } from './middleware';

// ============================================================
// COMO INTEGRAR NO APP PRINCIPAL (src/app.ts ou equivalente):
//
//   import academicoRouter from './modules/academico/routes';
//   app.use('/api/academico', academicoRouter);
//
// Pré-requisito: o middleware de autenticação global (que popula
// req.user com { id, tenantId, role, studentId? }) deve rodar ANTES
// desta linha no app.ts — este módulo não reimplementa login/JWT,
// só consome o que já existe no dentalpos-one/backend.
// ============================================================

const router = Router();

router.use(curriculumRoutes);
router.use(studentRoutes);
router.use(classSectionRoutes);
router.use(sessionRoutes);

router.use(academicErrorHandler);

export default router;
