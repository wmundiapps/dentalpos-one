import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { parseBody } from '../core/crud'
import { audit } from '../core/notify'
import { CATEGORIAS_PADRAO, garantirCategorias, importarFeriadosNacionais } from './eventos'
import { GESTAO, MALHA_PADRAO, MODULO } from './service'

export function registerBootstrap(router: Router) {
  // Catálogos padrão para uma IES brasileira — idempotente.
  router.post(
    '/bootstrap',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const b = parseBody(z.object({ anos: z.array(z.number().int().min(2000).max(2100)).max(5).optional(), incluirHorarios: z.boolean().default(true), incluirFeriados: z.boolean().default(true) }), req.body ?? {})
      const antesCat = await prisma.calCategoria.count({ where: { tenantId } })
      await garantirCategorias(tenantId)
      const categorias = (await prisma.calCategoria.count({ where: { tenantId } })) - antesCat
      let horarios = 0
      if (b.incluirHorarios) {
        for (const h of MALHA_PADRAO) {
          const ex = await prisma.calHorario.findUnique({ where: { tenantId_turno_ordem: { tenantId, turno: h.turno, ordem: h.ordem } } })
          if (!ex) {
            await prisma.calHorario.create({ data: { tenantId, nome: h.nome, turno: h.turno, ordem: h.ordem, inicioMin: h.inicioMin, fimMin: h.fimMin } })
            horarios++
          }
        }
      }
      let feriados = { criados: 0, existentes: 0 }
      const anos = b.anos ?? [new Date().getFullYear(), new Date().getFullYear() + 1]
      if (b.incluirFeriados) feriados = await importarFeriadosNacionais(tenantId, anos, {}, getUserId(req))
      await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'BOOTSTRAP', detalhes: { categorias, horarios, feriados, anos } })
      res.status(201).json({ categoriasCriadas: categorias, categoriasPadrao: CATEGORIAS_PADRAO.length, horariosCriados: horarios, feriadosCriados: feriados.criados, feriadosJaExistiam: feriados.existentes, anos })
    }),
  )
}
