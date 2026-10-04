import { Router } from 'express';
import contentRoutes from './content';
import flashcardRoutes from './flashcards';
import libraryRoutes from './library';
import { academicErrorHandler } from '../academico/middleware';

// ============================================================
// Em src/app.ts:
//   import conteudoRouter from './modules/conteudo/routes';
//   app.use('/api/conteudo', conteudoRouter);
// ============================================================

const router = Router();

router.use(contentRoutes);
router.use(flashcardRoutes);
router.use(libraryRoutes);

router.use(academicErrorHandler);

export default router;
