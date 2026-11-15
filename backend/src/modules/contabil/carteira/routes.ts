import { NextFunction, Request, Response, Router } from 'express'
import { INTERNO, PORTAL, exigir, papelDe } from './common'
import { requireAuth } from './host'
import { fiscalAtual, provedorAssinatura, provedorMensagem, AVISO_LEGAL } from './provedores'
import { registrarClientes } from './clientes'
import { registrarFunil } from './funil'
import { registrarHonorarios } from './honorarios'
import { registrarTarefas } from './tarefas'
import { registrarComunicacao } from './comunicacao'
import { registrarCarteira } from './carteira'
import { registrarRelatorios } from './relatorios'
import { registrarPortal } from './portal'
import { registrarLgpd } from './lgpd'

// Carteira de clientes do escritório de contabilidade. Montado em /api/edu/contabil/carteira (autenticado; tenant vem do token).
// Papéis: ADMIN/OWNER/RECTOR/BOARD e GESTOR_CONTABIL (gestão), CONTADOR, ANALISTA_CONTABIL, FINANCE (financeiro do escritório) e CLIENTE_CONTABIL (somente /portal/*).
// STUDENT, TEACHER e demais cargos não têm acesso. Ver README.md.
const router = Router()
router.use(requireAuth)

router.get('/meta', exigir(INTERNO), (req, res) => {
  const f = fiscalAtual(), m = provedorMensagem(), a = provedorAssinatura()
  res.json({
    papel: papelDe(req), aviso: AVISO_LEGAL,
    provedores: { fiscal: { nome: f.nome, simulado: f.simulado, pendenciasFiscais: !!f.pendenciasFiscais }, mensagem: { nome: m.nome, simulado: m.simulado }, assinatura: { nome: a.nome, simulado: a.simulado } },
  })
})

registrarClientes(router)
registrarFunil(router)
registrarHonorarios(router)
registrarTarefas(router)
registrarComunicacao(router)
registrarCarteira(router)
registrarRelatorios(router)
registrarPortal(router)
registrarLgpd(router)

export default router

/**
 * Isolamento do cliente final: o cargo CLIENTE_CONTABIL só alcança o portal (e o mínimo para o shell abrir).
 * Montado no roteador /api depois da autenticação: vale para as rotas /api/edu/* e para todo o resto da API.
 */
export const PORTAL_PERMITIDO = ['/edu/contabil/carteira/portal', '/edu/acesso/meus-modulos', '/edu/core/branding']
export function bloqueioClienteContabil(req: Request, res: Response, next: NextFunction) {
  if (papelDe(req) !== PORTAL) return next()
  const p = req.path.replace(/\/+$/, '')
  if (PORTAL_PERMITIDO.some((x) => p === x || p.startsWith(x + '/'))) return next()
  return res.status(403).json({ error: 'Seu acesso é restrito ao portal do cliente.', codigo: 'PORTAL_ACESSO_RESTRITO' })
}
