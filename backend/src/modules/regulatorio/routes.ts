import { Router, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { academicErrorHandler, AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { audit } from '../core/notify'
import { MODULO, WRITE } from './common'
import { MODELOS_PADRAO } from './catalogo'
import { gerarIndicadoresPadrao, mountAvaliacao } from './avaliacao'
import { mountProcessos } from './processos'
import { mountAtos } from './atos'
import { mountChecklists } from './checklists'
import { mountDocumentos } from './documentos'
import { mountPainel } from './painel'
import './alertas' // registra o job diário (registerEduJob)

// Módulo "regulatorio" (MEC/INEP) — montado em /api/edu/regulatorio.
const router = Router()

// Bootstrap idempotente: modelos de checklist por tipo de processo/instrumento + indicadores institucionais.
router.post(
  '/bootstrap',
  requireRole(...WRITE),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    let modelosCriados = 0
    let itensCriados = 0
    for (const m of MODELOS_PADRAO) {
      let modelo = await prisma.regChecklistModelo.findFirst({ where: { tenantId, chave: m.chave } })
      if (!modelo) {
        modelo = await prisma.regChecklistModelo.create({ data: { tenantId, chave: m.chave, nome: m.nome, tipoProcesso: m.tipoProcesso as any, instrumento: m.instrumento, descricao: m.descricao } })
        modelosCriados++
        for (const [i, it] of m.itens.entries()) {
          await prisma.regChecklistModeloItem.create({
            data: { tenantId, modeloId: modelo.id, ordem: i + 1, dimensao: it.d ?? 'DOCUMENTAL', titulo: it.t, descricao: it.desc, obrigatorio: it.o ?? true, peso: it.p ?? 1, prazoDias: it.dias, responsavelRole: it.role },
          })
          itensCriados++
        }
      }
    }
    const indicadores = await gerarIndicadoresPadrao(tenantId, null)
    await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'BOOTSTRAP', detalhes: { modelosCriados, itensCriados, indicadores } })
    res.json({ modelosCriados, itensCriados, indicadoresInstitucionaisCriados: indicadores, jaExistentes: MODELOS_PADRAO.length - modelosCriados })
  }),
)

mountPainel(router)
mountProcessos(router)
mountAtos(router)
mountChecklists(router)
mountAvaliacao(router)
mountDocumentos(router)

router.use(academicErrorHandler)

export default router

// Rotas PÚBLICAS opcionais (sem login; montadas em /api/public/edu/regulatorio). Nenhuma: dados regulatórios são internos.
export const publicRouter = Router()
