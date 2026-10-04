import { Router } from 'express';
import costCenterChartRoutes from './costCenterChart';
import payableRoutes from './payable';
import receivableRoutes from './receivable';
import invoiceRoutes from './invoice';
import reportsRoutes from './reports';
import { academicErrorHandler } from '../academico/middleware';
import './jobs';

// ============================================================
// Em src/app.ts:
//   import financeiroRouter from './modules/financeiro/routes';
//   app.use('/api/financeiro', financeiroRouter);
// ============================================================

const router = Router();

router.use(costCenterChartRoutes);
router.use(payableRoutes);
router.use(receivableRoutes);
router.use(invoiceRoutes);
router.use(reportsRoutes);

router.use(academicErrorHandler);

export default router;
