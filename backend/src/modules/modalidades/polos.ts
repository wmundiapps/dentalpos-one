import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { mountCrud, parseBody, dateISO } from '../core/crud'
import { audit } from '../core/notify'
import { scheduleReminder } from '../core/reminders'
import { MANAGE, TEACH, comTrava } from './common'
import { CHECKLIST_POLO_PADRAO, ocupacaoPolo, resumoChecklist, relacaoAlunoTutor } from './rules'
import { getConfig } from './common'

const router = Router()

const poloSchema = z.object({
  codigo: z.string().min(1), nome: z.string().min(2), spaceId: z.string().optional().nullable(), campusId: z.string().optional().nullable(),
  responsavelNome: z.string().optional().nullable(), responsavelEmail: z.string().email().optional().nullable(),
  responsavelTelefone: z.string().optional().nullable(), responsavelUserId: z.string().optional().nullable(),
  cep: z.string().optional().nullable(), logradouro: z.string().optional().nullable(), numero: z.string().optional().nullable(),
  bairro: z.string().optional().nullable(), cidade: z.string().optional().nullable(), uf: z.string().length(2).optional().nullable(),
  statusCredenciamento: z.enum(['EM_CREDENCIAMENTO', 'CREDENCIADO', 'SUSPENSO', 'DESCREDENCIADO']).optional(),
  atoNumero: z.string().optional().nullable(), atoData: dateISO().optional().nullable(), atoValidade: dateISO().optional().nullable(),
  capacidade: z.number().int().min(0).optional(), ativo: z.boolean().optional(),
})

async function lembreteAto(tenantId: string, polo: any) {
  if (!polo.atoValidade) return
  await scheduleReminder({
    tenantId, modulo: 'modalidades', titulo: `Renovar credenciamento do polo ${polo.nome} (ato ${polo.atoNumero ?? 's/n'})`,
    dueAt: polo.atoValidade, antecedenciaDias: 180, severity: 'ATENCAO', assigneeRole: 'COORDINATOR', refType: 'ModPolo', refId: polo.id,
    dedupeKey: `mod-polo-ato-${polo.id}`, recorrenciaDias: 30,
  })
}

mountCrud(router, {
  model: 'modPolo', path: '/polos', read: [...TEACH, 'STUDENT'], write: [...MANAGE], create: poloSchema, search: ['nome', 'codigo', 'cidade'],
  filters: ['statusCredenciamento', 'ativo', 'uf', 'cidade'], orderBy: { nome: 'asc' }, modulo: 'modalidades',
  beforeUpdate: (d, _req, cur) => {
    // credenciamento só muda pelas rotas /credenciar e /suspender (exigem checklist e ato)
    if (d.statusCredenciamento !== undefined && d.statusCredenciamento !== cur.statusCredenciamento) throw Object.assign(new Error('Use /polos/:id/credenciar ou /polos/:id/suspender para alterar o credenciamento.'), { status: 422 })
    return d
  },
  beforeCreate: async (d, req) => {
    if (d.statusCredenciamento && d.statusCredenciamento !== 'EM_CREDENCIAMENTO') throw Object.assign(new Error('Todo polo nasce EM_CREDENCIAMENTO; use /polos/:id/credenciar.'), { status: 422 })
    if (d.spaceId) {
      const sp = await prisma.eduSpace.findFirst({ where: { id: d.spaceId, tenantId: getTenantId(req) } })
      if (!sp) throw Object.assign(new Error('Espaço (EduSpace) não encontrado.'), { status: 404 })
    }
    return d
  },
  afterCreate: async (row, req) => {
    const tenantId = getTenantId(req)
    await prisma.modPoloChecklistItem.createMany({ data: CHECKLIST_POLO_PADRAO.map((c) => ({ ...c, tenantId, poloId: row.id })), skipDuplicates: true })
    await lembreteAto(tenantId, row)
  },
  afterUpdate: async (row, req) => lembreteAto(getTenantId(req), row),
})

// Credenciamento: só pode credenciar com checklist obrigatório completo e ato informado.
router.post('/polos/:id/credenciar', requireRole(...MANAGE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(z.object({ atoNumero: z.string().min(1), atoData: dateISO(), atoValidade: dateISO().optional() }), req.body)
  const polo = await prisma.modPolo.findFirst({ where: { id: String(req.params.id), tenantId }, include: { checklist: true } })
  if (!polo) return res.status(404).json({ error: 'Polo não encontrado.' })
  const ck = resumoChecklist(polo.checklist)
  if (!ck.apto) return res.status(422).json({ error: 'Checklist de estrutura mínima incompleto.', checklist: ck })
  const row = await prisma.modPolo.update({ where: { id: polo.id }, data: { statusCredenciamento: 'CREDENCIADO', ativo: true, ...b } })
  await lembreteAto(tenantId, row)
  await audit({ tenantId, userId: getUserId(req), modulo: 'modalidades', acao: 'CREDENCIAR_POLO', refType: 'ModPolo', refId: polo.id, detalhes: b })
  res.json(row)
}))
router.post('/polos/:id/suspender', requireRole(...MANAGE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(z.object({ motivo: z.string().min(3), descredenciar: z.boolean().optional() }), req.body)
  const polo = await prisma.modPolo.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!polo) return res.status(404).json({ error: 'Polo não encontrado.' })
  const row = await prisma.modPolo.update({ where: { id: polo.id }, data: { statusCredenciamento: b.descredenciar ? 'DESCREDENCIADO' : 'SUSPENSO', ativo: !b.descredenciar } })
  await audit({ tenantId, userId: getUserId(req), modulo: 'modalidades', acao: b.descredenciar ? 'DESCREDENCIAR_POLO' : 'SUSPENDER_POLO', refType: 'ModPolo', refId: polo.id, detalhes: b })
  res.json(row)
}))

// Checklist
router.get('/polos/:id/checklist', requireRole(...TEACH), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const items = await prisma.modPoloChecklistItem.findMany({ where: { tenantId: getTenantId(req), poloId: String(req.params.id) }, orderBy: { chave: 'asc' } })
  res.json({ items, resumo: resumoChecklist(items) })
}))
router.put('/polos/:id/checklist/:chave', requireRole(...MANAGE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(z.object({ atendido: z.boolean(), evidenciaUrl: z.string().optional().nullable(), observacao: z.string().optional().nullable(), titulo: z.string().optional(), obrigatorio: z.boolean().optional() }), req.body)
  const polo = await prisma.modPolo.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!polo) return res.status(404).json({ error: 'Polo não encontrado.' })
  const chave = String(req.params.chave).toUpperCase()
  const row = await prisma.modPoloChecklistItem.upsert({
    where: { poloId_chave: { poloId: polo.id, chave } },
    create: { tenantId, poloId: polo.id, chave, titulo: b.titulo ?? chave, obrigatorio: b.obrigatorio ?? false, atendido: b.atendido, evidenciaUrl: b.evidenciaUrl, observacao: b.observacao, verificadoEm: new Date(), verificadoPorId: getUserId(req) },
    update: { atendido: b.atendido, evidenciaUrl: b.evidenciaUrl ?? undefined, observacao: b.observacao ?? undefined, titulo: b.titulo, obrigatorio: b.obrigatorio, verificadoEm: new Date(), verificadoPorId: getUserId(req) },
  })
  res.json(row)
}))

// Ofertas por polo
const poloOfertaSchema = z.object({ poloId: z.string(), programId: z.string(), termId: z.string().optional().nullable(), vagas: z.number().int().min(0), ativo: z.boolean().optional() })
mountCrud(router, {
  model: 'modPoloOferta', path: '/polo-ofertas', read: [...TEACH], write: [...MANAGE], create: poloOfertaSchema, filters: ['poloId', 'programId', 'termId', 'ativo'], modulo: 'modalidades',
  beforeCreate: async (d, req) => {
    const tenantId = getTenantId(req)
    const polo = await prisma.modPolo.findFirst({ where: { id: d.poloId, tenantId } })
    if (!polo) throw Object.assign(new Error('Polo não encontrado.'), { status: 404 })
    if (polo.statusCredenciamento !== 'CREDENCIADO') throw Object.assign(new Error('Só é possível ofertar cursos em polos CREDENCIADOS.'), { status: 422 })
    const prog = await prisma.academicProgram.findFirst({ where: { id: d.programId, tenantId } })
    if (!prog) throw Object.assign(new Error('Curso não encontrado.'), { status: 404 })
    const outras = await prisma.modPoloOferta.aggregate({ where: { tenantId, poloId: d.poloId, ativo: true }, _sum: { vagas: true } })
    if (polo.capacidade > 0 && (outras._sum.vagas ?? 0) + d.vagas > polo.capacidade)
      throw Object.assign(new Error(`Vagas ofertadas excedem a capacidade do polo (${polo.capacidade}).`), { status: 422 })
    return d
  },
})

// Alunos por polo (vínculo) com controle de capacidade
router.post('/polos/:id/alunos', requireRole(...MANAGE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(z.object({ studentId: z.string(), programId: z.string().optional() }), req.body)
  const polo = await prisma.modPolo.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!polo) return res.status(404).json({ error: 'Polo não encontrado.' })
  if (!polo.ativo || polo.statusCredenciamento !== 'CREDENCIADO') return res.status(422).json({ error: 'Polo inativo ou não credenciado.' })
  const st = await prisma.student.findFirst({ where: { id: b.studentId, tenantId } })
  if (!st) return res.status(404).json({ error: 'Aluno não encontrado.' })
  const resultado = await comTrava(`mod-polo:${polo.id}`, async (tx) => {
    const ocupados = await tx.modPoloAluno.count({ where: { tenantId, poloId: polo.id, ativo: true } })
    const ja = await tx.modPoloAluno.findUnique({ where: { poloId_studentId: { poloId: polo.id, studentId: b.studentId } } })
    if (!(ja && ja.ativo) && polo.capacidade > 0 && ocupados >= polo.capacidade) return { erro: 'Polo sem capacidade disponível.', extra: { ocupacao: ocupacaoPolo(polo.capacidade, ocupados) } }
    if (b.programId && !(ja && ja.ativo)) {
      const of = await tx.modPoloOferta.findFirst({ where: { tenantId, poloId: polo.id, programId: b.programId, ativo: true } })
      if (of) {
        const n = await tx.modPoloAluno.count({ where: { tenantId, poloId: polo.id, programId: b.programId, ativo: true } })
        if (of.vagas > 0 && n >= of.vagas) return { erro: 'Vagas do curso neste polo esgotadas.', extra: {} }
      }
    }
    const row = await tx.modPoloAluno.upsert({ where: { poloId_studentId: { poloId: polo.id, studentId: b.studentId } }, create: { tenantId, poloId: polo.id, studentId: b.studentId, programId: b.programId }, update: { ativo: true, programId: b.programId } })
    return { row }
  })
  if ('erro' in resultado) return res.status(422).json({ error: resultado.erro, ...resultado.extra })
  res.status(201).json(resultado.row)
}))
router.delete('/polos/:id/alunos/:studentId', requireRole(...MANAGE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const r = await prisma.modPoloAluno.updateMany({ where: { tenantId: getTenantId(req), poloId: String(req.params.id), studentId: String(req.params.studentId) }, data: { ativo: false } })
  res.json({ desativados: r.count })
}))
router.get('/polos/:id/alunos', requireRole(...TEACH), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  res.json(await prisma.modPoloAluno.findMany({ where: { tenantId: getTenantId(req), poloId: String(req.params.id), ativo: true }, take: 500 }))
}))

// Indicadores por polo
async function indicadoresPolo(tenantId: string, poloId: string) {
  const polo = await prisma.modPolo.findFirst({ where: { id: poloId, tenantId }, include: { checklist: true, ofertas: { where: { ativo: true } } } })
  if (!polo) return null
  const cfg = await getConfig(tenantId)
  const alunosIds = (await prisma.modPoloAluno.findMany({ where: { tenantId, poloId, ativo: true }, select: { studentId: true } })).map((a) => a.studentId)
  const [tutoresAloc, resumos, atend] = await Promise.all([
    prisma.modTutorAlocacao.findMany({ where: { tenantId, poloId, ativo: true }, select: { tutorId: true } }),
    prisma.modEngajamentoResumo.findMany({ where: { tenantId, studentId: { in: alunosIds } }, select: { nivel: true } }),
    prisma.modAtendimento.findMany({ where: { tenantId, studentId: { in: alunosIds }, createdAt: { gte: new Date(Date.now() - 90 * 86_400_000) } }, select: { slaCumprido: true, status: true } }),
  ])
  const tutores = new Set(tutoresAloc.map((t) => t.tutorId)).size
  const emRisco = resumos.filter((r) => r.nivel === 'ALTO' || r.nivel === 'CRITICO').length
  const respondidos = atend.filter((a) => a.slaCumprido != null)
  return {
    polo: { id: polo.id, codigo: polo.codigo, nome: polo.nome, status: polo.statusCredenciamento, atoValidade: polo.atoValidade },
    ocupacao: ocupacaoPolo(polo.capacidade, alunosIds.length),
    vagasOfertadas: polo.ofertas.reduce((s, o) => s + o.vagas, 0),
    cursosOfertados: polo.ofertas.length,
    estrutura: resumoChecklist(polo.checklist),
    tutoria: relacaoAlunoTutor(alunosIds.length, tutores, cfg.alunosPorTutorEad),
    alunosEmRiscoEvasao: emRisco,
    pctRiscoEvasao: alunosIds.length ? Math.round((emRisco / alunosIds.length) * 1000) / 10 : 0,
    atendimentos90d: { total: atend.length, slaCumpridoPct: respondidos.length ? Math.round((respondidos.filter((a) => a.slaCumprido).length / respondidos.length) * 1000) / 10 : null },
    atoVencendo: polo.atoValidade ? polo.atoValidade.getTime() - Date.now() < 180 * 86_400_000 : false,
  }
}
router.get('/polos/:id/indicadores', requireRole(...TEACH), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const r = await indicadoresPolo(getTenantId(req), String(req.params.id))
  if (!r) return res.status(404).json({ error: 'Polo não encontrado.' })
  res.json(r)
}))
router.get('/polos-indicadores', requireRole(...TEACH), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const polos = await prisma.modPolo.findMany({ where: { tenantId, ativo: true }, select: { id: true } })
  const out: any[] = []
  for (const p of polos) { const r = await indicadoresPolo(tenantId, p.id); if (r) out.push(r) }
  res.json(out)
}))

export default router
