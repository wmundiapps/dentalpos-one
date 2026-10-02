import { Router } from 'express';
import assessmentsRoutes from './assessments';
import generationRoutes from './generation';
import attemptsRoutes from './attempts';
import { academicErrorHandler } from '../academico/middleware';

// ============================================================
// Em src/app.ts:
//   import provasIARouter from './modules/provas-ia/routes';
//   app.use('/api/provas', provasIARouter);
// ============================================================

const router = Router();

router.use(assessmentsRoutes);
router.use(generationRoutes);
router.use(attemptsRoutes);

router.use(academicErrorHandler);

export default router;
