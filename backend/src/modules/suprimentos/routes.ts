import { Router } from 'express'
import { academicErrorHandler } from '../academico/middleware'
import { registerCatalogo } from './catalogo'
import { registerCompras } from './compras'
import { registerEstoque } from './estoque'
import { registerVendas } from './vendas'
import { registerRelatorios } from './relatorios'
import { registerBootstrap } from './bootstrap'
import { registerSuprimentosJobs } from './jobs'

// Módulo "suprimentos" — compras, estoque, insumos, contratos e vendas.
// Rotas autenticadas (montadas em /api/edu/suprimentos).
const router = Router()

registerBootstrap(router)
registerCatalogo(router)
registerCompras(router)
registerEstoque(router)
registerVendas(router)
registerRelatorios(router)
registerSuprimentosJobs()

router.use(academicErrorHandler)

export default router

// Rotas PÚBLICAS opcionais (sem login; montadas em /api/public/edu/suprimentos). Nenhuma neste módulo.
export const publicRouter = Router()

export { movimentar, movimentarTx, checarEstoqueMinimo, saldoTotalItem } from './stock'
export { calcularReposicao } from './estoque'
export { compararCotacoes, sugerirReposicao, curvaABC, parcelar, custoMedioPonderado } from './logic'
