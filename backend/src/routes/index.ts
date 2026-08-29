import { Router } from 'express'

import { authMiddleware } from '../middleware/auth'
import tenantMiddleware from '../middleware/tenant'

import * as authController from '../controllers/authController'
import * as userController from '../controllers/userController'
import * as clinicController from '../controllers/clinicController'
import * as doctorController from '../controllers/doctorController'
import * as patientController from '../controllers/patientController'
import * as appointmentController from '../controllers/appointmentController'
import * as publicBookingController from '../controllers/publicBookingController'
import * as scheduleController from '../controllers/scheduleController'
import * as budgetController from '../controllers/budgetController'
import * as paymentController from '../controllers/paymentController'
import * as financialController from '../controllers/financialController'
import * as paymentProviderController from '../controllers/paymentProviderController'
import * as feedbackController from '../controllers/feedbackController'
import * as accessController from '../controllers/accessController'
import * as auditController from '../controllers/auditController'
import * as settingsController from '../controllers/settingsController'
import * as sessionController from '../controllers/sessionController'
import * as clinicalController from '../controllers/clinicalController'
import * as laboratoryController from '../controllers/laboratoryController'
import * as designController from '../controllers/designController'
import * as hrController from '../controllers/hrController'
import * as revahController from '../controllers/revahController'
import * as salesController from '../controllers/salesController'
import * as platformController from '../controllers/platformController'
import * as revahSenderController from '../controllers/revahSenderController'
import * as revahChatbotController from '../controllers/revahChatbotController'
import * as leadDiscoveryController from '../controllers/leadDiscoveryController'
import * as webhookController from '../controllers/webhookController'
import * as backofficeController from '../controllers/backofficeController'
import * as platformReadinessController from '../controllers/platformReadinessController'
import * as smartSchedulingController from '../controllers/smartSchedulingController'
import { requirePermission } from '../middleware/permission'

const router = Router()

// ======================
// AUTH
// ======================

router.post('/auth/register', authController.register)
router.post('/auth/login', authController.login)
router.get('/auth/me', authMiddleware, tenantMiddleware, sessionController.me)

// PUBLIC WEBHOOKS
router.post('/webhooks/asaas', webhookController.asaas)
router.post('/webhooks/stripe', webhookController.stripe)

// PUBLIC BOOKING
router.get('/public/booking/:clinicId', publicBookingController.config)
router.get('/public/booking/:clinicId/availability', publicBookingController.availability)
router.post('/public/booking/:clinicId', publicBookingController.store)

// ======================
// MIDDLEWARES
// ======================

router.use(authMiddleware)
router.use(tenantMiddleware)

// ======================
// CORE / ACCESS / SETTINGS / AUDIT
// ======================

router.get('/permissions', requirePermission('users.manage'), accessController.catalog)
router.get('/access-profiles', requirePermission('users.view'), accessController.profiles)
router.post('/access-profiles/bootstrap', requirePermission('users.manage'), accessController.bootstrapProfiles)
router.get('/me/permissions', accessController.myPermissions)
router.post('/users/:userId/access-profiles', requirePermission('users.manage'), accessController.assignProfile)
router.delete('/users/:userId/access-profiles/:profileId', requirePermission('users.manage'), accessController.removeProfile)

router.get('/settings/clinic', requirePermission('settings.view'), settingsController.show)
router.put('/settings/clinic', requirePermission('settings.edit'), settingsController.update)

router.get('/audit-logs', requirePermission('audit.view'), auditController.index)

// ======================
// USERS
// ======================

router.get('/users', requirePermission('users.view'), userController.index)
router.get('/user/:id', requirePermission('users.view'), userController.show)
router.post('/users', requirePermission('users.manage'), userController.store)
router.put('/user/:id', requirePermission('users.manage'), userController.update)
router.delete('/user/:id', requirePermission('users.manage'), userController.remove)

// ======================
// CLINICS
// ======================

router.get('/clinics', requirePermission('settings.view'), clinicController.index)
router.get('/clinic/:id', requirePermission('settings.view'), clinicController.show)
router.post('/clinics', requirePermission('settings.edit'), clinicController.store)
router.put('/clinic/:id', requirePermission('settings.edit'), clinicController.update)
router.delete('/clinic/:id', requirePermission('settings.edit'), clinicController.remove)

// ======================
// DOCTORS
// ======================

router.get('/doctors', requirePermission('agenda.view'), doctorController.index)
router.get('/doctor/:id', requirePermission('agenda.view'), doctorController.show)
router.post('/doctors', requirePermission('settings.edit'), doctorController.store)
router.put('/doctor/:id', requirePermission('settings.edit'), doctorController.update)
router.delete('/doctor/:id', requirePermission('settings.edit'), doctorController.remove)

// ======================
// PATIENTS
// ======================

router.get('/patients', requirePermission('patients.view'), patientController.index)
router.get('/patient/:id', requirePermission('patients.view'), patientController.show)
router.post('/patients', requirePermission('patients.create'), patientController.store)
router.put('/patient/:id', requirePermission('patients.edit'), patientController.update)
router.delete('/patient/:id', requirePermission('patients.edit'), patientController.remove)

// CLINICAL RECORD / ODONTOGRAM / TREATMENT PLAN
router.get('/patients/:patientId/clinical', requirePermission('clinical.view'), clinicalController.patientClinical)
router.post('/patients/:patientId/odontogram', requirePermission('clinical.edit'), clinicalController.upsertOdontogramMark)
router.post('/patients/:patientId/evolutions', requirePermission('clinical.edit'), clinicalController.createEvolution)
router.get('/patients/:patientId/treatment-plan', requirePermission('clinical.view'), clinicalController.treatmentPlan)

// ======================
// LABORATORY / DENTALPOS DESIGN
// ======================

router.get('/laboratory-works', requirePermission('laboratory.view'), laboratoryController.index)
router.post('/laboratory-works', requirePermission('laboratory.create'), laboratoryController.store)
router.put('/laboratory-works/:id', requirePermission('laboratory.edit'), laboratoryController.update)
router.post('/laboratory-works/:id/design', requirePermission('design.edit'), laboratoryController.openDesign)
router.get('/design-cases', requirePermission('design.view'), designController.index)
router.put('/design-cases/:id', requirePermission('design.edit'), designController.update)

// ======================
// APPOINTMENTS
// ======================

router.get('/appointments', requirePermission('agenda.view'), appointmentController.index)
router.get('/appointment/:id', requirePermission('agenda.view'), appointmentController.show)
router.post('/appointments', requirePermission('agenda.create'), appointmentController.store)
router.put('/appointment/:id', requirePermission('agenda.edit'), appointmentController.update)
router.delete('/appointment/:id', requirePermission('agenda.cancel'), appointmentController.remove)

// ======================
// SMART SCHEDULING / AGENDA INTELIGENTE
// ======================

router.get('/smart-scheduling/config', requirePermission('agenda.view'), smartSchedulingController.config)
router.post('/smart-scheduling/bootstrap', requirePermission('agenda.edit'), smartSchedulingController.bootstrap)
router.put('/smart-scheduling/policy', requirePermission('agenda.edit'), smartSchedulingController.updatePolicy)
router.put('/smart-scheduling/procedure-rules/:procedureKey', requirePermission('agenda.edit'), smartSchedulingController.upsertProcedureRule)
router.put('/smart-scheduling/laboratory-rules', requirePermission('agenda.edit'), smartSchedulingController.upsertLaboratoryRule)
router.get('/patients/:patientId/scheduling-preference', requirePermission('agenda.view'), smartSchedulingController.patientPreference)
router.put('/patients/:patientId/scheduling-preference', requirePermission('agenda.edit'), smartSchedulingController.updatePatientPreference)
router.post('/smart-scheduling/suggest', requirePermission('agenda.create'), smartSchedulingController.suggest)
router.get('/smart-scheduling/decisions', requirePermission('agenda.view'), smartSchedulingController.decisions)
router.post('/smart-scheduling/decisions/:id/accept', requirePermission('agenda.edit'), smartSchedulingController.acceptDecision)
router.post('/smart-scheduling/decisions/:id/override', requirePermission('agenda.edit'), smartSchedulingController.overrideDecision)
// ======================
// SCHEDULES
// ======================

router.get('/schedules', requirePermission('agenda.view'), scheduleController.index)
router.get('/schedule/:id', requirePermission('agenda.view'), scheduleController.show)
router.post('/schedules', requirePermission('agenda.edit'), scheduleController.store)
router.put('/schedule/:id', requirePermission('agenda.edit'), scheduleController.update)
router.delete('/schedule/:id', requirePermission('agenda.edit'), scheduleController.remove)

// ======================
// BUDGETS
// ======================

router.get('/budgets', requirePermission('finance.view'), budgetController.index)
router.get('/budget/:id', requirePermission('finance.view'), budgetController.show)
router.post('/budgets', requirePermission('finance.create'), budgetController.store)
router.put('/budget/:id', requirePermission('finance.edit'), budgetController.update)
router.post('/budget/:id/approve', requirePermission('finance.approve'), budgetController.approve)
router.delete('/budget/:id', requirePermission('finance.approve'), budgetController.remove)

// ======================
// PAYMENTS
// ======================

router.get('/payments', requirePermission('finance.view'), paymentController.index)
router.get('/payment/:id', requirePermission('finance.view'), paymentController.show)
router.post('/payments', requirePermission('finance.create'), paymentController.store)
router.put('/payment/:id', requirePermission('finance.edit'), paymentController.update)
router.post('/payment/:id/settle', requirePermission('finance.approve'), paymentController.settle)
router.delete('/payment/:id', requirePermission('finance.approve'), paymentController.remove)

router.get('/financial-entries', requirePermission('finance.view'), financialController.index)
router.post('/financial-entries', requirePermission('finance.create'), financialController.store)
router.put('/financial-entries/:id', requirePermission('finance.edit'), financialController.update)
router.post('/financial-entries/:id/settle', requirePermission('finance.approve'), financialController.settle)
router.delete('/financial-entries/:id', requirePermission('finance.approve'), financialController.remove)
router.get('/financial-dashboard', requirePermission('finance.view'), financialController.dashboard)
router.get('/financial-import-rules', requirePermission('finance.view'), financialController.importRules)
router.post('/financial-import-rules', requirePermission('finance.edit'), financialController.createImportRule)
router.get('/bank-connections', requirePermission('finance.view'), financialController.bankConnections)

router.get('/payment-providers', requirePermission('finance.view'), paymentProviderController.index)
router.put('/payment-providers/:provider', requirePermission('finance.approve'), paymentProviderController.upsert)
router.post('/payment-intents', requirePermission('finance.create'), paymentProviderController.createIntent)

// ======================
// HUMAN RESOURCES
// ======================

router.get('/hr/dashboard', requirePermission('hr.view'), hrController.dashboard)
router.get('/hr/employees', requirePermission('hr.view'), hrController.employees)
router.post('/hr/employees', requirePermission('hr.create'), hrController.createEmployee)
router.put('/hr/employees/:id', requirePermission('hr.edit'), hrController.updateEmployee)
router.post('/hr/attendance', requirePermission('hr.edit'), hrController.createAttendance)
router.post('/hr/payroll-entries', requirePermission('hr.sensitive'), hrController.createPayrollEntry)
router.post('/hr/payroll-close', requirePermission('hr.sensitive'), hrController.closePayroll)
router.post('/hr/vacations', requirePermission('hr.edit'), hrController.createVacation)
router.post('/hr/documents', requirePermission('hr.sensitive'), hrController.createDocument)
router.post('/hr/disciplinary-actions', requirePermission('hr.sensitive'), hrController.createDiscipline)

// ======================
// REVAH / MARKETING / SALES
// ======================

router.get('/revah/campaigns', requirePermission('marketing.view'), revahController.campaigns)
router.post('/revah/campaigns', requirePermission('marketing.send'), revahController.createCampaign)
router.get('/revah/contacts', requirePermission('marketing.view'), revahController.contacts)
router.post('/revah/contacts', requirePermission('marketing.send'), revahController.createContact)
router.post('/revah/contacts/:id/opt-out', requirePermission('marketing.send'), revahController.optOut)
router.get('/revah/messages', requirePermission('marketing.view'), revahController.messages)
router.post('/revah/send', requirePermission('marketing.send'), revahController.send)
router.get('/revah/automations', requirePermission('marketing.view'), revahController.automations)
router.post('/revah/automations', requirePermission('marketing.send'), revahController.createAutomation)
router.get('/revah/conversations', requirePermission('marketing.view'), revahChatbotController.conversations)
router.get('/revah/conversations/:id', requirePermission('marketing.view'), revahChatbotController.conversation)
router.post('/revah/conversations', requirePermission('marketing.send'), revahChatbotController.createConversation)
router.post('/revah/conversations/:id/handoff', requirePermission('marketing.send'), revahChatbotController.handoff)
router.post('/revah/conversations/:id/messages', requirePermission('marketing.send'), revahChatbotController.sendMessage)
router.get('/sales/leads', requirePermission('sales.view'), salesController.leads)
router.post('/sales/leads', requirePermission('sales.edit'), salesController.createLead)
router.put('/sales/leads/:id', requirePermission('sales.edit'), salesController.updateLead)
router.get('/sales/leads/:id/journey', requirePermission('sales.view'), salesController.journey)
router.get('/sales/products', requirePermission('sales.view'), salesController.products)
router.put('/sales/products', requirePermission('sales.edit'), salesController.upsertProduct)

// ======================
// SAAS PLATFORM / TENANT OPERATIONS
// ======================
router.get('/platform/units', requirePermission('settings.view'), platformController.units)
router.put('/platform/units', requirePermission('settings.edit'), platformController.upsertUnit)
router.get('/platform/feature-flags', requirePermission('settings.view'), platformController.featureFlags)
router.put('/platform/feature-flags/:key', requirePermission('settings.edit'), platformController.setFeatureFlag)
router.get('/platform/storage', requirePermission('settings.view'), platformController.storage)
router.get('/platform/readiness', requirePermission('settings.view'), platformReadinessController.readiness)
router.put('/platform/storage', requirePermission('settings.edit'), platformController.setStorage)
router.get('/revah/senders', requirePermission('marketing.view'), revahSenderController.index)
router.put('/revah/senders', requirePermission('marketing.send'), revahSenderController.upsert)
router.get('/lead-discovery/imports', requirePermission('sales.view'), leadDiscoveryController.imports)
router.post('/lead-discovery/imports', requirePermission('sales.edit'), leadDiscoveryController.createImport)

// ======================
// BACKOFFICE / CONTÃBIL / FISCAL
// ======================

router.get('/backoffice/dashboard', requirePermission('accounting.view'), backofficeController.dashboard)
router.get('/backoffice/dre', requirePermission('accounting.view'), backofficeController.dre)
router.get('/suppliers', requirePermission('accounting.view'), backofficeController.suppliers)
router.post('/suppliers', requirePermission('accounting.edit'), backofficeController.createSupplier)
router.get('/accounting/accounts', requirePermission('accounting.view'), backofficeController.accounts)
router.post('/accounting/accounts/bootstrap', requirePermission('accounting.edit'), backofficeController.bootstrapAccounts)
router.get('/accounting/cost-centers', requirePermission('accounting.view'), backofficeController.costCenters)
router.post('/accounting/cost-centers/bootstrap', requirePermission('accounting.edit'), backofficeController.bootstrapCostCenters)
router.get('/accounting/tax-obligations', requirePermission('accounting.view'), backofficeController.taxObligations)
router.post('/accounting/tax-obligations', requirePermission('accounting.edit'), backofficeController.createTaxObligation)
router.post('/accounting/tax-obligations/:id/approve', requirePermission('accounting.approve'), backofficeController.approveTaxObligation)
router.get('/accounting/accountant-access', requirePermission('accounting.portal'), backofficeController.accountantAccesses)
router.post('/accounting/accountant-access', requirePermission('accounting.portal'), backofficeController.createAccountantAccess)
router.put('/accounting/accountant-access/:id', requirePermission('accounting.portal'), backofficeController.updateAccountantAccess)

// ======================
// FEEDBACKS
// ======================

router.get('/feedbacks', requirePermission('patients.view'), feedbackController.index)
router.get('/feedback/:id', requirePermission('patients.view'), feedbackController.show)
router.post('/feedbacks', requirePermission('patients.edit'), feedbackController.store)
router.put('/feedback/:id', requirePermission('patients.edit'), feedbackController.update)
router.delete('/feedback/:id', requirePermission('patients.edit'), feedbackController.remove)

export default router

