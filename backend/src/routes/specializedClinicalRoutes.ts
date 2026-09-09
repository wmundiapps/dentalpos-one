import { Router } from 'express'
import * as specializedClinicalController from '../controllers/specializedClinicalController'
import { requirePermission } from '../middleware/permission'

export const specializedClinicalRouter = Router({ mergeParams: true })

specializedClinicalRouter.get(
  '/patients/:patientId/specialized-clinical',
  requirePermission('clinical.view'),
  specializedClinicalController.index,
)
specializedClinicalRouter.post(
  '/patients/:patientId/specialized-clinical',
  requirePermission('clinical.edit'),
  specializedClinicalController.store,
)
specializedClinicalRouter.put(
  '/patients/:patientId/specialized-clinical/:recordId',
  requirePermission('clinical.edit'),
  specializedClinicalController.update,
)
specializedClinicalRouter.post(
  '/patients/:patientId/specialized-clinical/:recordId/evolutions',
  requirePermission('clinical.edit'),
  specializedClinicalController.storeEvolution,
)
specializedClinicalRouter.post(
  '/patients/:patientId/specialized-clinical/:recordId/attachments',
  requirePermission('clinical.edit'),
  specializedClinicalController.storeAttachment,
)
specializedClinicalRouter.patch(
  '/patients/:patientId/specialized-clinical/:recordId/attachments/:attachmentId/archive',
  requirePermission('clinical.edit'),
  specializedClinicalController.archiveAttachment,
)

export default specializedClinicalRouter
