import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { mountCrud, parseBody, qs } from '../core/crud'
import { audit } from '../core/notify'
import { ATENDE, GESTAO_COM } from './roles'
import { getConfig, registrarPreferencia, variaveisDoContato } from './store'
import { extractVars, normalizePhone, onlyDigits, renderTemplate } from './pure'

const router = Router()
const db = prisma as any

const contatoSchema = z.object({
  tipo: z.enum(['ALUNO', 'CANDIDATO', 'EGRESSO', 'RESPONSAVEL', 'FUNCIONARIO', 'OUTRO']).optional(),
  nome: z.string().min(2),
  email: z.string().email().nullable().optional(),
  telefone: z.string().nullable().optional(),
  telegramChatId: z.string().nullable().optional(),
  instagramId: z.string().nullable().optional(),
  facebookId: z.string().nullable().optional(),
  documento: z.string().nullable().optional(),
  studentId: z.string().nullable().optional(),
  candidatoId: z.string().nullable().optional(),
  userId: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  ativo: z.boolean().optional(),
})
function normalizarContato(d: any) {
  if (d.telefone !== undefined) {
    if (d.telefone) {
      const t = normalizePhone(d.telefone)
      if (!t) throw Object.assign(new Error('Telefone inválido (use DDD + número).'), { status: 400 })
      d.telefone = t
    } else d.telefone = null
  }
  if (d.email) d.email = d.email.toLowerCase()
  if (d.documento) d.documento = onlyDigits(d.documento)
  return d
}

// Rotas específicas ANTES do CRUD (que captura /contatos/:id).
router.post(
  '/contatos/sincronizar',
  requireRole(...GESTAO_COM),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const fonte = String(req.body?.fonte || 'ALUNOS').toUpperCase()
    let criados = 0
    let atualizados = 0
    if (fonte === 'ALUNOS' || fonte === 'EGRESSOS') {
      const alunos = await prisma.student.findMany({ where: { tenantId, ...(fonte === 'EGRESSOS' ? { status: { in: ['FORMADO', 'CONCLUIDO'] } } : {}) }, select: { id: true, nomeCompleto: true, cpf: true, userId: true, status: true }, take: 20000 })
      const users = await prisma.user.findMany({ where: { tenantId, id: { in: alunos.map((a) => a.userId) } }, select: { id: true, email: true, phone: true } })
      const uMap = new Map(users.map((u) => [u.id, u]))
      const existentes = new Map((await prisma.comContato.findMany({ where: { tenantId, studentId: { in: alunos.map((a) => a.id) } }, select: { id: true, studentId: true, email: true, telefone: true } })).map((c) => [c.studentId!, c]))
      for (const a of alunos) {
        const u = uMap.get(a.userId)
        const tipo = ['FORMADO', 'CONCLUIDO'].includes(a.status) ? 'EGRESSO' : 'ALUNO'
        const e = existentes.get(a.id)
        if (e) {
          const patch: any = {}
          if (!e.email && u?.email) patch.email = u.email.toLowerCase()
          if (!e.telefone && normalizePhone(u?.phone)) patch.telefone = normalizePhone(u?.phone)
          if (Object.keys(patch).length) {
            await prisma.comContato.update({ where: { id: e.id }, data: patch })
            atualizados++
          }
        } else {
          await prisma.comContato.create({ data: { tenantId, tipo: tipo as any, nome: a.nomeCompleto, email: u?.email?.toLowerCase(), telefone: normalizePhone(u?.phone), documento: a.cpf ? onlyDigits(a.cpf) : null, studentId: a.id, userId: a.userId } })
          criados++
        }
      }
    } else if (fonte === 'CANDIDATOS') {
      const cands = await db.admCandidato.findMany({ where: { tenantId }, select: { id: true, nome: true, email: true, telefone: true, cpf: true, consentimentoLgpd: true }, take: 20000 })
      const ex = new Set((await prisma.comContato.findMany({ where: { tenantId, candidatoId: { in: cands.map((c: any) => c.id) } }, select: { candidatoId: true } })).map((c) => c.candidatoId))
      for (const c of cands) {
        if (ex.has(c.id)) continue
        const novo = await prisma.comContato.create({ data: { tenantId, tipo: 'CANDIDATO', nome: c.nome, email: c.email?.toLowerCase(), telefone: normalizePhone(c.telefone), documento: c.cpf ? onlyDigits(c.cpf) : null, candidatoId: c.id } })
        // sem consentimento LGPD registrado no cadastro do candidato => bloqueia marketing
        if (!c.consentimentoLgpd) await registrarPreferencia({ tenantId, contatoId: novo.id, canal: '*', finalidade: 'MARKETING', consentimento: false, origem: 'IMPORTACAO', motivo: 'Candidato sem consentimento LGPD no cadastro.' })
        criados++
      }
    } else return res.status(400).json({ error: 'fonte deve ser ALUNOS, EGRESSOS ou CANDIDATOS.' })
    await audit({ tenantId, userId: getUserId(req), modulo: 'comunicacao', acao: 'CONTATOS_SINCRONIZADOS', detalhes: { fonte, criados, atualizados } })
    res.json({ fonte, criados, atualizados })
  }),
)

router.get(
  '/contatos/:id/preferencias',
  requireRole(...ATENDE),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    res.json(await prisma.comPreferencia.findMany({ where: { tenantId: getTenantId(req), contatoId: String(req.params.id) }, orderBy: { registradoEm: 'desc' } }))
  }),
)
const prefSchema = z.object({ canal: z.string().default('*'), finalidade: z.enum(['MARKETING', 'COBRANCA', 'ACADEMICO', 'TODAS']).default('MARKETING'), consentimento: z.boolean(), origem: z.string().optional(), motivo: z.string().optional() })
router.put(
  '/contatos/:id/preferencias',
  requireRole(...ATENDE),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const c = await prisma.comContato.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!c) return res.status(404).json({ error: 'Contato não encontrado.' })
    const b = parseBody(prefSchema, req.body)
    const r = await registrarPreferencia({ tenantId, contatoId: c.id, ...b, origem: b.origem ?? 'ATENDENTE' })
    await audit({ tenantId, userId: getUserId(req), modulo: 'comunicacao', acao: b.consentimento ? 'CONSENTIMENTO' : 'OPT_OUT', refType: 'ComContato', refId: c.id, detalhes: b })
    res.json(r)
  }),
)

router.get(
  '/contatos/:id/historico',
  requireRole(...ATENDE),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const c = await prisma.comContato.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!c) return res.status(404).json({ error: 'Contato não encontrado.' })
    const [conversas, notificacoes, chamadas] = await Promise.all([
      prisma.comConversa.findMany({ where: { tenantId, contatoId: c.id }, orderBy: { ultimaMensagemEm: 'desc' }, take: 20 }),
      prisma.eduNotification.findMany({ where: { tenantId, OR: [...(c.studentId ? [{ studentId: c.studentId }] : []), ...(c.userId ? [{ userId: c.userId }] : [])] }, orderBy: { createdAt: 'desc' }, take: 30 }),
      prisma.comChamada.findMany({ where: { tenantId, contatoId: c.id }, orderBy: { inicioEm: 'desc' }, take: 20 }),
    ])
    res.json({ contato: c, conversas, notificacoes, chamadas })
  }),
)

mountCrud(router, {
  model: 'comContato',
  path: '/contatos',
  read: ATENDE,
  write: ATENDE,
  create: contatoSchema,
  search: ['nome', 'email', 'telefone', 'documento'],
  filters: ['tipo', 'studentId', 'candidatoId', 'ativo'],
  orderBy: { nome: 'asc' },
  modulo: 'comunicacao',
  beforeCreate: normalizarContato,
  beforeUpdate: normalizarContato,
})

// ---------------------------------------------------------------- templates
const templateSchema = z.object({
  chave: z.string().min(2).regex(/^[a-z0-9_.-]+$/i, 'use letras, números, _ . -'),
  nome: z.string().min(2),
  categoria: z.enum(['COBRANCA', 'ACADEMICO', 'MARKETING', 'ADMISSOES', 'GERAL']).default('GERAL'),
  canal: z.string().nullable().optional(),
  assunto: z.string().nullable().optional(),
  corpo: z.string().min(1),
  ativo: z.boolean().optional(),
})
const comVariaveis = (d: any, _req?: any, cur?: any) => {
  if (d.corpo !== undefined || d.assunto !== undefined) d.variaveis = extractVars(`${d.assunto ?? cur?.assunto ?? ''} ${d.corpo ?? cur?.corpo ?? ''}`)
  return d
}

const previewSchema = z.object({ templateId: z.string().optional(), corpo: z.string().optional(), assunto: z.string().optional(), contatoId: z.string().optional(), studentId: z.string().optional(), variaveis: z.record(z.string(), z.string()).optional() })
router.post(
  '/templates/preview',
  requireRole(...ATENDE),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(previewSchema, req.body)
    let corpo = b.corpo
    let assunto = b.assunto
    if (b.templateId) {
      const t = await prisma.comTemplate.findFirst({ where: { id: b.templateId, tenantId } })
      if (!t) return res.status(404).json({ error: 'Template não encontrado.' })
      corpo = t.corpo
      assunto = t.assunto ?? undefined
    }
    if (!corpo) return res.status(400).json({ error: 'Informe templateId ou corpo.' })
    let nome: string | undefined
    let studentId = b.studentId
    if (b.contatoId) {
      const c = await prisma.comContato.findFirst({ where: { id: b.contatoId, tenantId } })
      nome = c?.nome
      studentId = studentId ?? c?.studentId ?? undefined
    }
    const base = nome || studentId ? await variaveisDoContato(tenantId, { nome, studentId }) : {}
    const exemplo = { nome: 'Maria', nome_completo: 'Maria da Silva', curso: 'Odontologia', valor: 'R$ 1.250,00', vencimento: '10/12/2026', descricao: 'Mensalidade 12/2026', parcela: '12', dias_atraso: '3', protocolo: 'ADM-2026-0001' }
    const vars = { ...(nome || studentId ? base : exemplo), ...(b.variaveis ?? {}) }
    const corpoR = renderTemplate(corpo, vars)
    res.json({ assunto: assunto ? renderTemplate(assunto, vars).texto : null, mensagem: corpoR.texto, variaveisUsadas: extractVars(corpo), faltantes: corpoR.faltantes, usouDadosDeExemplo: !(nome || studentId) })
  }),
)

mountCrud(router, {
  model: 'comTemplate',
  path: '/templates',
  read: ATENDE,
  write: ['MARKETING', 'SUPPORT', 'FINANCE', 'ADMISSIONS'],
  create: templateSchema,
  search: ['chave', 'nome', 'corpo'],
  filters: ['categoria', 'canal', 'ativo'],
  orderBy: { chave: 'asc' },
  modulo: 'comunicacao',
  beforeCreate: comVariaveis,
  beforeUpdate: comVariaveis,
})

// ---------------------------------------------------------------- configuração geral
const configSchema = z.object({
  horarioInicio: z.string().regex(/^\d{1,2}:\d{2}$/),
  horarioFim: z.string().regex(/^\d{1,2}:\d{2}$/),
  diasUteis: z.array(z.number().int().min(0).max(6)),
  maxTentativas: z.number().int().min(1).max(10),
  backoffMinutos: z.array(z.number().int().min(1).max(1440)).min(1),
  slaPrimeiraRespostaMin: z.number().int().min(1),
  slaResolucaoMin: z.number().int().min(1),
  botAtivo: z.boolean(),
  iaFallback: z.boolean(),
  iaLimiteDiarioConversa: z.number().int().min(0).max(50),
  mensagemHandoff: z.string().min(3),
  mensagemForaHorario: z.string().min(3),
  mensagemBoasVindas: z.string().min(3),
})
router.get(
  '/config',
  requireRole(...ATENDE),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => res.json(await getConfig(getTenantId(req)))),
)
router.put(
  '/config',
  requireRole(...GESTAO_COM),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(configSchema.partial(), req.body)
    await getConfig(tenantId)
    const r = await prisma.comConfig.update({ where: { tenantId }, data: b })
    await audit({ tenantId, userId: getUserId(req), modulo: 'comunicacao', acao: 'CONFIG_ATUALIZADA', detalhes: Object.keys(b) })
    res.json(r)
  }),
)

void qs
export default router
