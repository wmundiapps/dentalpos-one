import { NextFunction, Request, Response, Router } from 'express'
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

// Erros de regra de negócio (4xx) com código e detalhes estruturados (code, pendencias, ids...) para a interface.
router.use((err: any, _req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent || !err || typeof err.status !== 'number' || err.status >= 500) return next(err)
  const extra: Record<string, unknown> = {}
  for (const k of ['code', 'pendencias', 'ids', 'de', 'para', 'aviso']) if (err[k] !== undefined) extra[k] = err[k]
  res.status(err.status).json({ error: err.message || 'Erro.', ...extra })
})

export default router
