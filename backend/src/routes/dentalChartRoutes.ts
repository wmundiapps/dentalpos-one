import { Router } from 'express'
import { requirePermission } from '../middleware/permission'
import * as dentalChartController from '../controllers/dentalChartController'

const router = Router()


router.get('/patients/:patientId/dental-chart', requirePermission('clinical.view'), dentalChartController.chart)
router.put('/patients/:patientId/dental-chart/entries', requirePermission('clinical.edit'), dentalChartController.saveEntry)
router.delete('/patients/:patientId/dental-chart/entries/:id', requirePermission('clinical.edit'), dentalChartController.removeEntry)

router.get('/dental-findings', requirePermission('clinical.view'), dentalChartController.findings)
router.post('/dental-findings', requirePermission('clinical.edit'), dentalChartController.createFinding)

router.get('/patients/:patientId/periodontal-exams', requirePermission('clinical.view'), dentalChartController.periodontalHistory)
router.post('/patients/:patientId/periodontal-exams', requirePermission('clinical.edit'), dentalChartController.createPeriodontalExam)
router.get('/patients/:patientId/periodontal-comparison', requirePermission('clinical.view'), dentalChartController.comparePeriodontal)

export default router
