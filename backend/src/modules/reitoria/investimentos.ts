import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { dateISO, pageParams, parseBody, qs } from '../core/crud'
import { audit } from '../core/notify'
import { fail, round2, somar } from './util2'

// Gastos e investimentos em infraestrutura (melhorias, equipamentos...) vinculados às DISCIPLINAS,
// com rateio percentual quando um investimento atende a várias disciplinas.

const TIPOS = ['MELHORIA', 'EQUIPAMENTO', 'REFORMA', 'SOFTWARE', 'ACERVO', 'OUTRO'] as const
const STATUS = ['PLANEJADO', 'EM_EXECUCAO', 'CONCLUIDO', 'CANCELADO'] as const
const LEITURA = ['COORDINATOR', 'FACILITIES', 'SUPPLIES'] as const

const vinculo = z.object({ disciplineId: z.string().min(1), percentual: z.number().min(0.01).max(100).optional() })
const schema = z.object({
  tipo: z.enum(TIPOS).default('MELHORIA'),
  titulo: z.string().trim().min(2).max(300),
  descricao: z.string().max(5000).optional(),
  valor: z.number().min(0).max(1e12).default(0),
  data: dateISO().optional(),
  status: z.enum(STATUS).optional(),
  programId: z.string().optional(),
  infProjetoId: z.string().optional(),
  infBemId: z.string().optional(),
  observacoes: z.string().max(5000).optional(),
  disciplinas: z.array(vinculo).max(60).optional(),
})

/** Normaliza os vínculos: sem percentual => divide igualmente; a soma não pode passar de 100%. */
export function ratear(v: Array<{ disciplineId: string; percentual?: number }>): Array<{ disciplineId: string; percentual: number }> {
  const ids = new Set<string>()
  for (const x of v) { if (ids.has(x.disciplineId)) fail(400, 'Disciplina repetida nos vínculos.'); ids.add(x.disciplineId) }
  if (!v.length) return []
  if (v.every((x) => x.percentual == null)) return v.map((x) => ({ disciplineId: x.disciplineId, percentual: round2(100 / v.length) }))
  if (v.some((x) => x.percentual == null)) fail(400, 'Informe o percentual de todas as disciplinas (ou de nenhuma).')
  const soma = somar(v.map((x) => x.percentual))
  if (soma > 100.0001) fail(400, `A soma dos percentuais (${round2(soma)}%) não pode passar de 100%.`)
  return v.map((x) => ({ disciplineId: x.disciplineId, percentual: x.percentual! }))
}

async function validarDisciplinas(tenantId: string, ids: string[]) {
  if (!ids.length) return
  const n = await prisma.discipline.count({ where: { tenantId, id: { in: ids } } })
  if (n !== new Set(ids).size) fail(404, 'Alguma disciplina informada não existe.')
}

/** Consolidação por disciplina (usada pelo relatório e pelo painel). */
export async function investimentosPorDisciplina(tenantId: string, o: { de?: Date; ate?: Date; programId?: string } = {}) {
  const where: any = { tenantId, status: { not: 'CANCELADO' } }
  if (o.de || o.ate) where.data = { ...(o.de ? { gte: o.de } : {}), ...(o.ate ? { lt: o.ate } : {}) }
  if (o.programId) where.programId = o.programId
  const invs = await prisma.reiInvestimento.findMany({ where, include: { disciplinas: true }, take: 20_000 })
  const discs = await prisma.discipline.findMany({ where: { tenantId }, select: { id: true, nome: true }, take: 5000 })
  const nome = new Map(discs.map((d) => [d.id, d.nome]))
  type Acc = { disciplineId: string | null; disciplina: string; melhorias: number; equipamentos: number; outros: number; total: number; itens: number }
  const acc = new Map<string, Acc>()
  const get = (id: string | null) => {
    const k = id ?? '__sem__'
    if (!acc.has(k)) acc.set(k, { disciplineId: id, disciplina: id ? nome.get(id) ?? '(disciplina removida)' : 'Sem vínculo com disciplina', melhorias: 0, equipamentos: 0, outros: 0, total: 0, itens: 0 })
    return acc.get(k)!
  }
  for (const inv of invs) {
    const alvos = inv.disciplinas.length ? inv.disciplinas.map((d) => ({ id: d.disciplineId as string | null, p: d.percentual })) : [{ id: null as string | null, p: 100 }]
    for (const a of alvos) {
      const v = (inv.valor * a.p) / 100
      const r = get(a.id)
      if (inv.tipo === 'MELHORIA' || inv.tipo === 'REFORMA') r.melhorias += v
      else if (inv.tipo === 'EQUIPAMENTO') r.equipamentos += v
      else r.outros += v
      r.total += v; r.itens++
    }
  }
  // alunos por disciplina (turmas -> matriculados) para custo por aluno
  const secs = await prisma.classSection.findMany({ where: { tenantId, disciplineId: { in: [...acc.keys()].filter((k) => k !== '__sem__') } }, select: { disciplineId: true, _count: { select: { matriculados: true } } }, take: 20_000 })
  const alunos = new Map<string, number>()
  for (const s of secs) alunos.set(s.disciplineId, (alunos.get(s.disciplineId) ?? 0) + s._count.matriculados)
  const linhas = [...acc.values()].map((r) => ({
    ...r, melhorias: round2(r.melhorias), equipamentos: round2(r.equipamentos), outros: round2(r.outros), total: round2(r.total),
    alunos: r.disciplineId ? alunos.get(r.disciplineId) ?? 0 : null,
    valorPorAluno: r.disciplineId && (alunos.get(r.disciplineId) ?? 0) > 0 ? round2(r.total / (alunos.get(r.disciplineId) as number)) : null,
  })).sort((a, b) => b.total - a.total)
  const porTipo: Record<string, number> = {}
  for (const i of invs) porTipo[i.tipo] = round2((porTipo[i.tipo] ?? 0) + i.valor)
  return { linhas, totalGeral: round2(somar(invs.map((i) => i.valor))), investimentos: invs.length, semVinculo: invs.filter((i) => !i.disciplinas.length).length, porTipo }
}

export function registerInvestimentos(router: Router) {
  router.get('/investimentos', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    if (qs(req.query.tipo)) { if (!(TIPOS as readonly string[]).includes(qs(req.query.tipo)!)) fail(400, 'Tipo inválido.'); where.tipo = qs(req.query.tipo) }
    if (qs(req.query.status)) { if (!(STATUS as readonly string[]).includes(qs(req.query.status)!)) fail(400, 'Status inválido.'); where.status = qs(req.query.status) }
    if (qs(req.query.disciplineId)) where.disciplinas = { some: { disciplineId: qs(req.query.disciplineId) } }
    if (qs(req.query.semDisciplina) === 'true') where.disciplinas = { none: {} }
    if (qs(req.query.q)) where.titulo = { contains: qs(req.query.q), mode: 'insensitive' }
    const [items, total] = await Promise.all([
      prisma.reiInvestimento.findMany({ where, include: { disciplinas: true }, orderBy: { data: 'desc' }, skip, take }),
      prisma.reiInvestimento.count({ where }),
    ])
    res.json({ items, total, page, pageSize })
  }))

  router.get('/investimentos/por-disciplina', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    res.json(await investimentosPorDisciplina(getTenantId(req), { programId: qs(req.query.programId) }))
  }))

  router.get('/investimentos/:id', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const row = await prisma.reiInvestimento.findFirst({ where: { id: String(req.params.id), tenantId: getTenantId(req) }, include: { disciplinas: true } })
    if (!row) return res.status(404).json({ error: 'Investimento não encontrado.' })
    res.json(row)
  }))

  router.post('/investimentos', requireRole('FACILITIES', 'SUPPLIES'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { disciplinas, ...b } = parseBody(schema, req.body)
    const v = ratear(disciplinas ?? [])
    await validarDisciplinas(tenantId, v.map((x) => x.disciplineId))
    if (b.programId && !(await prisma.academicProgram.findFirst({ where: { id: b.programId, tenantId }, select: { id: true } }))) fail(404, 'Curso não encontrado.')
    try {
      const row = await prisma.reiInvestimento.create({ data: { ...b, tenantId, disciplinas: { create: v.map((x) => ({ ...x, tenantId })) } }, include: { disciplinas: true } })
      await audit({ tenantId, userId: getUserId(req), modulo: 'reitoria', acao: 'INVESTIMENTO_CRIAR', refType: 'ReiInvestimento', refId: row.id })
      res.status(201).json(row)
    } catch (e: any) {
      if (e?.code === 'P2002') fail(409, 'Este projeto/bem de infraestrutura já está registrado como investimento.')
      throw e
    }
  }))

  router.patch('/investimentos/:id', requireRole('FACILITIES', 'SUPPLIES'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const cur = await prisma.reiInvestimento.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!cur) return res.status(404).json({ error: 'Investimento não encontrado.' })
    const { disciplinas, ...b } = parseBody(schema.partial(), req.body)
    const v = disciplinas ? ratear(disciplinas) : null
    if (v) await validarDisciplinas(tenantId, v.map((x) => x.disciplineId))
    const row = await prisma.$transaction(async (tx) => {
      if (v) {
        await tx.reiInvestimentoDisciplina.deleteMany({ where: { investimentoId: cur.id } })
        await tx.reiInvestimentoDisciplina.createMany({ data: v.map((x) => ({ ...x, tenantId, investimentoId: cur.id })) })
      }
      return tx.reiInvestimento.update({ where: { id: cur.id }, data: b, include: { disciplinas: true } })
    })
    await audit({ tenantId, userId: getUserId(req), modulo: 'reitoria', acao: 'INVESTIMENTO_ATUALIZAR', refType: 'ReiInvestimento', refId: cur.id })
    res.json(row)
  }))

  router.put('/investimentos/:id/disciplinas', requireRole('FACILITIES', 'SUPPLIES'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const cur = await prisma.reiInvestimento.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!cur) return res.status(404).json({ error: 'Investimento não encontrado.' })
    const b = parseBody(z.object({ disciplinas: z.array(vinculo).max(60) }), req.body)
    const v = ratear(b.disciplinas)
    await validarDisciplinas(tenantId, v.map((x) => x.disciplineId))
    await prisma.$transaction([
      prisma.reiInvestimentoDisciplina.deleteMany({ where: { investimentoId: cur.id } }),
      prisma.reiInvestimentoDisciplina.createMany({ data: v.map((x) => ({ ...x, tenantId, investimentoId: cur.id })) }),
    ])
    res.json(await prisma.reiInvestimento.findFirst({ where: { id: cur.id }, include: { disciplinas: true } }))
  }))

  router.delete('/investimentos/:id', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const r = await prisma.reiInvestimento.deleteMany({ where: { id: String(req.params.id), tenantId } })
    if (!r.count) return res.status(404).json({ error: 'Investimento não encontrado.' })
    await audit({ tenantId, userId: getUserId(req), modulo: 'reitoria', acao: 'INVESTIMENTO_REMOVER', refType: 'ReiInvestimento', refId: String(req.params.id) })
    res.status(204).end()
  }))

  // Traz projetos de melhoria (InfProjeto) e bens (InfBem) da Infraestrutura que ainda não estão registrados.
  router.post('/investimentos/importar-infra', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(z.object({ desde: dateISO().optional(), incluirBens: z.boolean().default(true), incluirProjetos: z.boolean().default(true), valorMinimoBem: z.number().min(0).default(500) }), req.body)
    const desde = b.desde ?? new Date(Date.now() - 3 * 365 * 86_400_000)
    let projetos = 0, bens = 0
    if (b.incluirProjetos) {
      const ps = await prisma.infProjeto.findMany({ where: { tenantId, status: { in: ['APROVADO', 'EM_EXECUCAO', 'CONCLUIDO'] }, createdAt: { gte: desde } }, take: 2000 })
      const ja = new Set((await prisma.reiInvestimento.findMany({ where: { tenantId, infProjetoId: { in: ps.map((p) => p.id) } }, select: { infProjetoId: true } })).map((x) => x.infProjetoId))
      for (const p of ps) {
        if (ja.has(p.id)) continue
        await prisma.reiInvestimento.create({ data: { tenantId, tipo: 'MELHORIA', titulo: p.titulo, descricao: p.oQue, valor: p.gastoReal > 0 ? p.gastoReal : p.quantoCusta, data: p.concluidoEm ?? p.inicioPrevisto ?? p.createdAt, status: p.status === 'CONCLUIDO' ? 'CONCLUIDO' : p.status === 'EM_EXECUCAO' ? 'EM_EXECUCAO' : 'PLANEJADO', infProjetoId: p.id } })
        projetos++
      }
    }
    if (b.incluirBens) {
      const bs = await prisma.infBem.findMany({ where: { tenantId, status: { not: 'BAIXADO' }, dataAquisicao: { gte: desde }, valorAquisicao: { gte: b.valorMinimoBem } }, take: 5000 })
      const ja = new Set((await prisma.reiInvestimento.findMany({ where: { tenantId, infBemId: { in: bs.map((p) => p.id) } }, select: { infBemId: true } })).map((x) => x.infBemId))
      for (const x of bs) {
        if (ja.has(x.id)) continue
        await prisma.reiInvestimento.create({ data: { tenantId, tipo: 'EQUIPAMENTO', titulo: `${x.descricao} (${x.tombamento})`, valor: x.valorAquisicao, data: x.dataAquisicao, status: 'CONCLUIDO', infBemId: x.id } })
        bens++
      }
    }
    res.json({ projetosImportados: projetos, bensImportados: bens })
  }))
}
