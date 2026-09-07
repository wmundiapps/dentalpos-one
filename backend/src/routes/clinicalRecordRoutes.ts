import { Router } from 'express'
import * as controller from '../controllers/clinicalRecordController'
import { requirePermission } from '../middleware/permission'

const router = Router()

router.get('/patients/:patientId/clinical-record', requirePermission('clinical.view'), controller.show)
router.put('/patients/:patientId/clinical-record', requirePermission('clinical.edit'), controller.save)
router.get('/patients/:patientId/clinical-record/revisions/:revisionId', requirePermission('clinical.view'), controller.revision)
router.get('/clinical-record/custom-fields', requirePermission('clinical.view'), controller.listCustomFields)
router.post('/clinical-record/custom-fields', requirePermission('settings.edit'), controller.upsertCustomField)
router.put('/clinical-record/custom-fields/:fieldId', requirePermission('settings.edit'), controller.upsertCustomField)

export default router
