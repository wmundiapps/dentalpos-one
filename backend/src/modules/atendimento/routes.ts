import { Router } from 'express'
import { academicErrorHandler } from '../academico/middleware'
import { mountAtendimentos } from './atendimentos'
import { mountConhecimento } from './conhecimento'
import { mountEmissao } from './emissao'
import { mountProtocolos } from './protocolos'
import { mountServicos } from './servicos'
import { garantirPadroes } from './bootstrap'
import { ATENDE, GESTAO, asyncHandler, requireRole, tid } from './common'
export { publicRouter } from './publico'

// Módulo "atendimento" — central de atendimento ao aluno (multiatendimento omnichannel, protocolos e jornada com rastreio,
// documentos recebidos, IA, emissão de documentos e catálogo de autoatendimento). Montado em /api/edu/atendimento.
const router = Router()
router.get('/meta', requireRole(...ATENDE, 'STUDENT'), asyncHandler(async (req, res) => {
  await garantirPadroes(tid(req as any))
  res.json({ canais: ['BALCAO', 'TELEFONE', 'WHATSAPP', 'EMAIL', 'CHAT_PORTAL', 'INSTAGRAM', 'FACEBOOK'], prioridades: ['BAIXA', 'NORMAL', 'ALTA', 'URGENTE'], gestao: GESTAO })
}))
router.post('/bootstrap', requireRole(...GESTAO), asyncHandler(async (req, res) => { await garantirPadroes(tid(req as any)); res.json({ ok: true }) }))
mountAtendimentos(router)
mountProtocolos(router)
mountServicos(router)
mountConhecimento(router)
mountEmissao(router)
router.use(academicErrorHandler)
export default router
