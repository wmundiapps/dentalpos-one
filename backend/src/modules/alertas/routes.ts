import { Router, Response } from 'express'
import { AuthenticatedRequest, asyncHandler, getTenantId } from '../academico/middleware'
import { coletarAlertas as coletarTodosDireto, documentosRelacionados } from './rules'
import { swrCache } from '../../lib/swrCache'

// Alertas críticos por departamento — /api/edu/alertas. Leitura para qualquer perfil de equipe (alunos e professores não veem).
const router = Router()
// Administração e Reitoria veem tudo; os demais cargos veem somente os alertas da sua competência.
const VE_TUDO = ['ADMIN', 'OWNER', 'RECTOR', 'BOARD']
const COMPETENCIA: Record<string, string[]> = {
  FINANCE: ['Financeiro e cobrança'],
  LIBRARIAN: ['Biblioteca'],
  FACILITIES: ['Infraestrutura', 'Lavanderia'],
  SUPPLIES: ['Suprimentos e compras', 'Lavanderia'],
  SECRETARY: ['Atendimento'],
  SUPPORT: ['Atendimento'],
  COORDINATOR: ['Regulatório MEC'],
  GESTOR_CONTABIL: ['Contabilidade'],
  CONTADOR: ['Contabilidade'],
  ANALISTA_CONTABIL: ['Contabilidade'],
}
// Os alertas são calculados no máximo a cada 30 s por instituição (todos os usuários consultam o resumo a cada minuto).
const alertasRecentes = swrCache(30_000, 300_000, (tenantId) => coletarTodosDireto(tenantId))
const coletarTodos = (tenantId: string) => alertasRecentes.get(tenantId)
async function coletarAlertas(req: AuthenticatedRequest) {
  const todos = await coletarTodos(getTenantId(req))
  const cargo = String(req.user?.role || '').toUpperCase()
  if (VE_TUDO.includes(cargo)) return todos
  const meus = COMPETENCIA[cargo] ?? []
  return todos.filter((a) => meus.includes(a.departamento))
}
const BLOQUEADOS = ['STUDENT', 'TEACHER', 'CLIENTE_CONTABIL']
router.use((req: AuthenticatedRequest, res: Response, next) => {
  if (!req.user) return res.status(401).json({ error: 'Não autenticado.' })
  if (BLOQUEADOS.includes(String(req.user.role).toUpperCase())) return res.json({ total: 0, departamentos: [], oculto: true })
  next()
})

router.get('/resumo', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const todos = await coletarAlertas(req)
  const m = new Map<string, number>()
  for (const a of todos) m.set(a.departamento, (m.get(a.departamento) ?? 0) + 1)
  res.json({ total: todos.length, departamentos: [...m.entries()].map(([departamento, total]) => ({ departamento, total })).sort((a, b) => b.total - a.total) })
}))

router.get('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const dep = String(req.query.departamento || '')
  const todos = await coletarAlertas(req)
  res.json((dep ? todos.filter((a) => a.departamento === dep) : todos).map(({ chave, departamento, titulo, resumo, severidade, desde }) => ({ chave, departamento, titulo, resumo, severidade, desde })))
}))

router.get('/detalhe', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req), chave = String(req.query.chave || '')
  const a = (await coletarAlertas(req)).find((x) => x.chave === chave)
  if (!a) return res.status(404).json({ error: 'Este alerta já foi resolvido ou não existe mais.' })
  res.json({ ...a, documentos: await documentosRelacionados(tenantId, a.popTags) })
}))
export default router
