import { Router } from 'express'
import { academicErrorHandler } from '../academico/middleware'
import { USA, requireRole } from './common'
import { mountAdmin } from './rotas-admin'
import { mountConversas } from './rotas-conversas'

// Módulo "mensagens" — Mensageiro interno entre departamentos (canais por departamento, grupos, conversas diretas, anexos,
// menções, não lidas, busca, resposta automática por departamento e pedidos de "falar com uma pessoa").
// Montado em /api/edu/mensagens. Só equipe interna (aluno não acessa); tudo filtrado por tenantId. Ver README.md.
const router = Router()
router.use(requireRole(...USA))
mountConversas(router)
mountAdmin(router)
router.use(academicErrorHandler)
export default router
