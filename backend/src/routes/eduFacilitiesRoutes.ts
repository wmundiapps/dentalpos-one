import { Router } from 'express'
import { requirePermission } from '../middleware/permission'
import * as facilities from '../controllers/eduFacilitiesController'

// Rotas do EduMaster Pro — Facilities (Infraestrutura).
// Montadas em /api/edu/*. Autenticação e contexto de tenant já
// resolvidos pelos middlewares aplicados antes deste router em
// src/routes/index.ts.
const router = Router()

router.get('/edu/assets', requirePermission('edu.facilities.view'), facilities.listAssets)
router.post('/edu/assets', requirePermission('edu.facilities.manage'), facilities.createAsset)
router.put('/edu/assets/:id/status', requirePermission('edu.facilities.manage'), facilities.updateAssetStatus)

router.get('/edu/maintenance-orders', requirePermission('edu.facilities.view'), facilities.listMaintenanceOrders)
router.post('/edu/maintenance-orders', requirePermission('edu.facilities.manage'), facilities.createMaintenanceOrder)
router.put('/edu/maintenance-orders/:id/status', requirePermission('edu.facilities.manage'), facilities.updateMaintenanceStatus)

router.get('/edu/parking-spots', requirePermission('edu.facilities.view'), facilities.listParkingSpots)
router.post('/edu/parking-spots', requirePermission('edu.facilities.manage'), facilities.createParkingSpot)
router.post('/edu/parking-spots/:id/assign', requirePermission('edu.facilities.manage'), facilities.assignParkingSpot)
router.post('/edu/parking-spots/:id/release', requirePermission('edu.facilities.manage'), facilities.releaseParkingSpot)

// Reserva de salas e equipamentos: consulta e reserva ficam abertas a
// qualquer usuário autenticado do tenant (professor/coordenador
// reservando um espaço); só o cadastro do recurso é administrativo.
router.get('/edu/bookable-resources', facilities.listBookableResources)
router.post('/edu/bookable-resources', requirePermission('edu.facilities.manage'), facilities.createBookableResource)
router.get('/edu/resource-bookings', facilities.listResourceBookings)
router.post('/edu/resource-bookings', facilities.createResourceBooking)
router.post('/edu/resource-bookings/:id/cancel', facilities.cancelResourceBooking)

router.get('/edu/expiring-items', requirePermission('edu.facilities.view'), facilities.listExpiringItems)
router.post('/edu/expiring-items', requirePermission('edu.facilities.manage'), facilities.createExpiringItem)
router.post('/edu/expiring-items/:id/resolve', requirePermission('edu.facilities.manage'), facilities.resolveExpiringItem)

export default router
