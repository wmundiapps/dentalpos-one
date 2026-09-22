import { Router } from 'express'
import { requirePermission } from '../middleware/permission'
import * as supply from '../controllers/eduSupplyController'

// Rotas do EduMaster Pro — Suprimentos (compras, estoque, vendas).
// Montadas em /api/edu/*. Autenticação e contexto de tenant já
// resolvidos pelos middlewares aplicados antes deste router em
// src/routes/index.ts.
const router = Router()

router.get('/edu/supply-items', requirePermission('edu.supply.view'), supply.listSupplyItems)
router.post('/edu/supply-items', requirePermission('edu.supply.manage'), supply.createSupplyItem)
router.post('/edu/supply-items/:itemId/adjust', requirePermission('edu.supply.manage'), supply.adjustStock)

router.get('/edu/purchase-orders', requirePermission('edu.supply.view'), supply.listPurchaseOrders)
router.post('/edu/purchase-orders', requirePermission('edu.supply.manage'), supply.createPurchaseOrder)
router.post('/edu/purchase-orders/:id/approve', requirePermission('edu.supply.manage'), supply.approvePurchaseOrder)
router.post('/edu/purchase-orders/:id/receive', requirePermission('edu.supply.manage'), supply.receivePurchaseOrder)

router.get('/edu/sales', requirePermission('edu.supply.view'), supply.listSales)
router.post('/edu/sales', requirePermission('edu.supply.manage'), supply.createSale)

export default router
