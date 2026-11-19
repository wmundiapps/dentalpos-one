import { Router, Response } from 'express'
import { AuthenticatedRequest, asyncHandler, getTenantId } from '../academico/middleware'
import { coletarAlertas, documentosRelacionados } from './rules'

// Alertas críticos por departamento — /api/edu/alertas. Leitura para qualquer perfil de equipe (alunos e professores não veem).
const router = Router()
const BLOQUEADOS = ['STUDENT', 'TEACHER', 'CLIENTE_CONTABIL']
router.use((req: AuthenticatedRequest, res: Response, next) => {
  if (!req.user) return res.status(401).json({ error: 'Não autenticado.' })
  if (BLOQUEADOS.includes(String(req.user.role).toUpperCase())) return res.json({ total: 0, departamentos: [], oculto: true })
  next()
})

router.get('/resumo', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const todos = await coletarAlertas(getTenantId(req))
  const m = new Map<string, number>()
  for (const a of todos) m.set(a.departamento, (m.get(a.departamento) ?? 0) + 1)
  res.json({ total: todos.length, departamentos: [...m.entries()].map(([departamento, total]) => ({ departamento, total })).sort((a, b) => b.total - a.total) })
}))

router.get('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const dep = String(req.query.departamento || '')
  const todos = await coletarAlertas(getTenantId(req))
  res.json((dep ? todos.filter((a) => a.departamento === dep) : todos).map(({ chave, departamento, titulo, resumo, severidade, desde }) => ({ chave, departamento, titulo, resumo, severidade, desde })))
}))

router.get('/detalhe', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req), chave = String(req.query.chave || '')
  const a = (await coletarAlertas(tenantId)).find((x) => x.chave === chave)
  if (!a) return res.status(404).json({ error: 'Este alerta já foi resolvido ou não existe mais.' })
  res.json({ ...a, documentos: await documentosRelacionados(tenantId, a.popTags) })
}))
export default router
