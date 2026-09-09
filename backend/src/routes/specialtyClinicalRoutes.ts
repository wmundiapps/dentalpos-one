import { pendingState, beginTreatment, resolvePending } from '../controllers/laboratoryAlertResolutionController'
import { Router } from 'express'
import { requirePermission } from '../middleware/permission'
import * as controller from '../controllers/specialtyClinicalController'

export const specialtyClinicalRoutes = Router()

specialtyClinicalRoutes.get('/patients/:patientId/surgeries', requirePermission('clinical.view'), controller.listSurgeries)
specialtyClinicalRoutes.post('/patients/:patientId/surgeries', requirePermission('clinical.edit'), controller.createSurgery)
specialtyClinicalRoutes.put('/surgeries/:id', requirePermission('clinical.edit'), controller.updateSurgery)
specialtyClinicalRoutes.post('/surgeries/:id/follow-ups', requirePermission('clinical.edit'), controller.addSurgeryFollowUp)

specialtyClinicalRoutes.get('/patients/:patientId/implants', requirePermission('clinical.view'), controller.listImplants)
specialtyClinicalRoutes.post('/patients/:patientId/implants', requirePermission('clinical.edit'), controller.createImplant)
specialtyClinicalRoutes.put('/implants/:id', requirePermission('clinical.edit'), controller.updateImplant)
specialtyClinicalRoutes.get('/implants/traceability/:code', requirePermission('clinical.view'), controller.findImplantByTrace)

specialtyClinicalRoutes.get('/patients/:patientId/prostheses', requirePermission('clinical.view'), controller.listProstheses)
specialtyClinicalRoutes.post('/patients/:patientId/prostheses', requirePermission('clinical.edit'), controller.createProsthesis)
specialtyClinicalRoutes.put('/prostheses/:id', requirePermission('clinical.edit'), controller.updateProsthesis)
specialtyClinicalRoutes.post('/prostheses/:id/history', requirePermission('clinical.edit'), controller.addProsthesisHistory)

specialtyClinicalRoutes.get('/laboratory-works/:id/pending-state', requirePermission('clinical.view'), pendingState)
specialtyClinicalRoutes.post('/laboratory-works/:id/pending-treatment', requirePermission('clinical.edit'), beginTreatment)
specialtyClinicalRoutes.post('/laboratory-works/:id/resolve-pending', requirePermission('clinical.edit'), resolvePending)
