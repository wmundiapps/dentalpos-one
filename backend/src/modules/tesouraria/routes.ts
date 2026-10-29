import { Router } from 'express'
import { requireAuth } from '../academico/middleware'
import { mountContas } from './contas'
import { mountRecebiveis } from './recebiveis'
import { mountRecibos } from './recibos'
import { mountPermutas } from './permutas'
import { mountTitulos } from './titulos'
import { mountRemessas } from './remessas'
import { mountConciliacao } from './conciliacao'
import { mountNotas } from './notas'
import { mountFolha } from './folha'
import { mountRelatorios } from './relatorios'

// Tesouraria / Financeiro Edu. Montado em /api/edu/tesouraria (autenticado; tenant vem do token).
// Rotas fixas (ex.: /titulos/fila, /recebiveis/gerar-mensalidades) são registradas antes das parametrizadas dentro de cada módulo.
const router = Router()
router.use(requireAuth)

mountRelatorios(router)
mountContas(router)
mountRecebiveis(router)
mountRecibos(router)
mountPermutas(router)
mountTitulos(router)
mountRemessas(router)
mountConciliacao(router)
mountNotas(router)
mountFolha(router)

export default router
