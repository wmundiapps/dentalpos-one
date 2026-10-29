import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, requireRole } from '../academico/middleware'
import { parseBody, qs } from '../core/crud'
import { audit } from '../core/notify'
import { CUR_READ, CUR_WRITE, MOD, assertNoTenant, fail, optDate, optStr, tid, uid, uniq } from './common'
import { ArestaMatriz, NoMatriz, acharCiclo, aplicarEquivalencias, caminhoCritico, simularIntegralizacao } from './matrizLogic'

const REGIMES = ['SERIADO_ANUAL', 'SERIADO_SEMESTRAL', 'BIMESTRAL', 'MODULAR', 'CREDITOS', 'LIVRE'] as const
const TIPOS_PERIODO = ['MODULO', 'BIMESTRE', 'TRIMESTRE', 'SEMESTRE', 'ANO', 'PERIODO'] as const
const TIPOS_ITEM = ['OBRIGATORIA', 'OPTATIVA', 'ELETIVA', 'ESTAGIO', 'TCC', 'ATIVIDADE_COMPLEMENTAR', 'EXTENSAO'] as const
const ROTULO_PERIODO: Record<string, string> = { MODULO: 'Módulo', BIMESTRE: 'Bimestre', TRIMESTRE: 'Trimestre', SEMESTRE: 'Semestre', ANO: 'Ano', PERIODO: 'Período' }

const matrizSchema = z.object({
  programId: z.string().min(1), nome: z.string().min(2).max(160), versao: z.string().min(1).max(20).default('1.0'), regime: z.enum(REGIMES).default('SERIADO_SEMESTRAL'),
  vigenciaInicio: optDate(), horasComplementaresMin: z.number().int().min(0).max(2000).default(0), observacao: optStr(1000),
})

async function matrizDoTenant(tenantId: string, id: string) {
  const m = await prisma.acaMatriz.findFirst({ where: { id, tenantId } })
  if (!m) fail(404, 'Matriz não encontrada.')
  return m
}

async function carregarGrafo(tenantId: string, matrizId: string) {
  const [periodos, itens, pre] = await Promise.all([
    prisma.acaMatrizPeriodo.findMany({ where: { tenantId, matrizId }, orderBy: { ordem: 'asc' } }),
    prisma.acaMatrizItem.findMany({ where: { tenantId, matrizId }, orderBy: [{ ordem: 'asc' }, { createdAt: 'asc' }] }),
    prisma.acaPreRequisito.findMany({ where: { tenantId, matrizId } }),
  ])
  const ordem = new Map(periodos.map((p) => [p.id, p.ordem]))
  const nos: NoMatriz[] = itens.map((i) => ({ id: i.id, disciplineId: i.disciplineId, periodoOrdem: ordem.get(i.periodoId) ?? 0, tipo: i.tipo, cargaHoraria: i.cargaHoraria, creditos: i.creditos, grupoOptativas: i.grupoOptativas }))
  const arestas: ArestaMatriz[] = pre.map((p) => ({ itemId: p.itemId, requisitoItemId: p.requisitoItemId, tipo: p.tipo as any, cargaMinima: p.cargaMinima }))
  return { periodos, itens, pre, nos, arestas }
}

async function nomesDisciplinas(tenantId: string, ids: string[]) {
  const d = await prisma.discipline.findMany({ where: { tenantId, id: { in: uniq(ids) } }, select: { id: true, nome: true, cargaHoraria: true } })
  return new Map(d.map((x) => [x.id, x]))
}

function validar(g: Awaited<ReturnType<typeof carregarGrafo>>, m: { cargaHorariaTotal: number }, nomes: Map<string, { nome: string }>) {
  const problemas: Array<{ nivel: 'ERRO' | 'AVISO'; texto: string }> = []
  const nome = (itemId: string) => { const i = g.itens.find((x) => x.id === itemId); return i ? nomes.get(i.disciplineId)?.nome ?? i.disciplineId : itemId }
  const ciclo = acharCiclo(g.nos, g.arestas)
  if (ciclo) problemas.push({ nivel: 'ERRO', texto: `Pré-requisitos circulares: ${ciclo.map(nome).join(' → ')}.` })
  for (const a of g.arestas) {
    if (a.tipo !== 'PRE' || !a.requisitoItemId) continue
    const n = g.nos.find((x) => x.id === a.itemId), r = g.nos.find((x) => x.id === a.requisitoItemId)
    if (n && r && r.periodoOrdem >= n.periodoOrdem) problemas.push({ nivel: 'ERRO', texto: `${nome(a.itemId)} exige ${nome(a.requisitoItemId)}, que está no mesmo período ou em período posterior.` })
  }
  for (const p of g.periodos) if (!g.itens.some((i) => i.periodoId === p.id)) problemas.push({ nivel: 'AVISO', texto: `${p.rotulo} sem disciplinas.` })
  if (!g.itens.length) problemas.push({ nivel: 'ERRO', texto: 'A matriz não possui disciplinas.' })
  const ch = g.itens.filter((i) => ['OBRIGATORIA', 'ESTAGIO', 'TCC'].includes(i.tipo)).reduce((s, i) => s + i.cargaHoraria, 0)
  if (m.cargaHorariaTotal && ch !== m.cargaHorariaTotal) problemas.push({ nivel: 'AVISO', texto: `Carga horária obrigatória somada (${ch}h) difere do total declarado (${m.cargaHorariaTotal}h).` })
  return { ok: !problemas.some((p) => p.nivel === 'ERRO'), problemas, cargaObrigatoria: ch }
}

async function recalcularTotais(tenantId: string, matrizId: string) {
  const itens = await prisma.acaMatrizItem.findMany({ where: { tenantId, matrizId } })
  const obrig = itens.filter((i) => ['OBRIGATORIA', 'ESTAGIO', 'TCC'].includes(i.tipo))
  await prisma.acaMatriz.update({ where: { id: matrizId }, data: { cargaHorariaTotal: obrig.reduce((s, i) => s + i.cargaHoraria, 0), creditosTotal: obrig.reduce((s, i) => s + i.creditos, 0) } })
}

export function registerMatrizes(router: Router) {
  const leitura = requireRole(...CUR_READ)
  const escrita = requireRole(...CUR_WRITE)

  // ---------- perfil do curso (nível e regime) ----------
  router.get('/cursos', leitura, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const [programs, perfis, matrizes] = await Promise.all([
      prisma.academicProgram.findMany({ where: { tenantId }, orderBy: { nome: 'asc' } }),
      prisma.acaCursoPerfil.findMany({ where: { tenantId } }),
      prisma.acaMatriz.groupBy({ by: ['programId'], where: { tenantId }, _count: { _all: true } }),
    ])
    const mp = new Map(perfis.map((p) => [p.programId, p])), mm = new Map(matrizes.map((m) => [m.programId, m._count._all]))
    res.json({ items: programs.map((p) => ({ id: p.id, nome: p.nome, modalidade: p.modalidade, cargaHorariaTotal: p.cargaHorariaTotal, perfil: mp.get(p.id) ?? null, matrizes: mm.get(p.id) ?? 0 })) })
  }))
  router.put('/cursos/:programId/perfil', escrita, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const programId = String(req.params.programId)
    await assertNoTenant(tenantId, 'academicProgram', programId, 'Curso')
    const b = parseBody(z.object({ nivel: z.enum(['GRADUACAO', 'TECNOLOGO', 'POS_LATO', 'POS_STRICTO', 'LIVRE', 'TECNICO']).default('GRADUACAO'), regime: z.enum(REGIMES).default('SERIADO_SEMESTRAL'), turnos: z.array(z.enum(['MANHA', 'TARDE', 'NOITE', 'FIM_DE_SEMANA', 'INTEGRAL', 'EAD'])).default([]), duracaoPeriodos: z.number().int().min(1).max(60).nullish(), codigoEmec: optStr(40) }), req.body)
    const p = await prisma.acaCursoPerfil.upsert({ where: { tenantId_programId: { tenantId, programId } }, create: { ...b, tenantId, programId } as any, update: b as any })
    res.json(p)
  }))

  // ---------- matrizes ----------
  router.get('/matrizes', leitura, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const where: any = { tenantId }
    if (qs(req.query.programId)) where.programId = qs(req.query.programId)
    if (qs(req.query.status)) where.status = qs(req.query.status)
    const items = await prisma.acaMatriz.findMany({ where, orderBy: [{ programId: 'asc' }, { createdAt: 'desc' }], include: { _count: { select: { itens: true, periodos: true } } }, take: 500 })
    const progs = await prisma.academicProgram.findMany({ where: { tenantId, id: { in: uniq(items.map((i) => i.programId)) } }, select: { id: true, nome: true } })
    const mp = new Map(progs.map((p) => [p.id, p.nome]))
    res.json({ items: items.map((m) => ({ ...m, curso: mp.get(m.programId) ?? null })), total: items.length })
  }))

  router.post('/matrizes', escrita, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(matrizSchema, req.body)
    await assertNoTenant(tenantId, 'academicProgram', b.programId, 'Curso')
    const dup = await prisma.acaMatriz.findFirst({ where: { tenantId, programId: b.programId, versao: b.versao } })
    if (dup) fail(409, 'Já existe uma matriz desta versão para o curso.')
    const m = await prisma.acaMatriz.create({ data: { ...b, tenantId } })
    await audit({ tenantId, userId: uid(req), modulo: MOD, acao: 'MATRIZ_CRIADA', refType: 'AcaMatriz', refId: m.id })
    res.status(201).json(m)
  }))

  router.get('/matrizes/:id', leitura, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const m = await matrizDoTenant(tenantId, String(req.params.id))
    const g = await carregarGrafo(tenantId, m.id)
    const nomes = await nomesDisciplinas(tenantId, g.itens.map((i) => i.disciplineId))
    res.json({
      ...m,
      periodos: g.periodos.map((p) => ({ ...p, itens: g.itens.filter((i) => i.periodoId === p.id).map((i) => ({ ...i, disciplina: nomes.get(i.disciplineId)?.nome ?? null, prerequisitos: g.pre.filter((x) => x.itemId === i.id) })) })),
    })
  }))

  router.patch('/matrizes/:id', escrita, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const m = await matrizDoTenant(tenantId, String(req.params.id))
    const b = parseBody(matrizSchema.omit({ programId: true }).partial(), req.body)
    res.json(await prisma.acaMatriz.update({ where: { id: m.id }, data: Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined)) as any }))
  }))

  router.delete('/matrizes/:id', escrita, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const m = await matrizDoTenant(tenantId, String(req.params.id))
    if (m.status !== 'RASCUNHO') fail(409, 'Só matrizes em rascunho podem ser excluídas; arquive as demais.')
    await prisma.$transaction([prisma.acaPreRequisito.deleteMany({ where: { tenantId, matrizId: m.id } }), prisma.acaMatriz.delete({ where: { id: m.id } })])
    res.status(204).end()
  }))

  router.post('/matrizes/:id/duplicar', escrita, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const m = await matrizDoTenant(tenantId, String(req.params.id))
    const b = parseBody(z.object({ versao: z.string().min(1).max(20) }), req.body)
    if (await prisma.acaMatriz.findFirst({ where: { tenantId, programId: m.programId, versao: b.versao } })) fail(409, 'Já existe uma matriz desta versão para o curso.')
    const g = await carregarGrafo(tenantId, m.id)
    const nova = await prisma.$transaction(async (tx) => {
      const nm = await tx.acaMatriz.create({ data: { tenantId, programId: m.programId, nome: m.nome, versao: b.versao, regime: m.regime, status: 'RASCUNHO', cargaHorariaTotal: m.cargaHorariaTotal, creditosTotal: m.creditosTotal, horasComplementaresMin: m.horasComplementaresMin, observacao: m.observacao } })
      const mapP = new Map<string, string>(), mapI = new Map<string, string>()
      for (const p of g.periodos) mapP.set(p.id, (await tx.acaMatrizPeriodo.create({ data: { tenantId, matrizId: nm.id, ordem: p.ordem, tipo: p.tipo, rotulo: p.rotulo } })).id)
      for (const i of g.itens) mapI.set(i.id, (await tx.acaMatrizItem.create({ data: { tenantId, matrizId: nm.id, periodoId: mapP.get(i.periodoId)!, disciplineId: i.disciplineId, tipo: i.tipo, cargaHoraria: i.cargaHoraria, creditos: i.creditos, ordem: i.ordem, grupoOptativas: i.grupoOptativas } })).id)
      for (const p of g.pre) await tx.acaPreRequisito.create({ data: { tenantId, matrizId: nm.id, itemId: mapI.get(p.itemId)!, requisitoItemId: p.requisitoItemId ? mapI.get(p.requisitoItemId) : null, tipo: p.tipo, cargaMinima: p.cargaMinima } })
      return nm
    })
    res.status(201).json(nova)
  }))

  router.post('/matrizes/:id/publicar', escrita, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const m = await matrizDoTenant(tenantId, String(req.params.id))
    await recalcularTotais(tenantId, m.id)
    const m2 = await matrizDoTenant(tenantId, m.id)
    const g = await carregarGrafo(tenantId, m.id)
    const v = validar(g, m2, await nomesDisciplinas(tenantId, g.itens.map((i) => i.disciplineId)))
    if (!v.ok) fail(422, 'A matriz possui erros e não pode ser publicada.', { problemas: v.problemas })
    await prisma.$transaction([
      prisma.acaMatriz.updateMany({ where: { tenantId, programId: m.programId, status: 'VIGENTE', id: { not: m.id } }, data: { status: 'ARQUIVADA' } }),
      prisma.acaMatriz.update({ where: { id: m.id }, data: { status: 'VIGENTE', vigenciaInicio: m.vigenciaInicio ?? new Date() } }),
    ])
    await audit({ tenantId, userId: uid(req), modulo: MOD, acao: 'MATRIZ_PUBLICADA', refType: 'AcaMatriz', refId: m.id })
    res.json({ ok: true, problemas: v.problemas })
  }))

  router.get('/matrizes/:id/validar', leitura, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const m = await matrizDoTenant(tenantId, String(req.params.id))
    const g = await carregarGrafo(tenantId, m.id)
    res.json(validar(g, m, await nomesDisciplinas(tenantId, g.itens.map((i) => i.disciplineId))))
  }))

  // ---------- períodos (módulo, bimestre, semestre, ano) ----------
  router.post('/matrizes/:id/periodos', escrita, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const m = await matrizDoTenant(tenantId, String(req.params.id))
    const b = parseBody(z.object({ tipo: z.enum(TIPOS_PERIODO).default('SEMESTRE'), rotulo: z.string().min(1).max(60).optional(), ordem: z.number().int().min(1).max(200).optional(), quantidade: z.number().int().min(1).max(60).optional() }), req.body)
    const ult = await prisma.acaMatrizPeriodo.findFirst({ where: { tenantId, matrizId: m.id }, orderBy: { ordem: 'desc' } })
    const qt = b.quantidade ?? 1
    const criados = []
    for (let i = 0; i < qt; i++) {
      const ordem = (b.quantidade ? (ult?.ordem ?? 0) + i + 1 : b.ordem ?? (ult?.ordem ?? 0) + 1)
      if (await prisma.acaMatrizPeriodo.findFirst({ where: { matrizId: m.id, ordem } })) fail(409, `Já existe o período de ordem ${ordem}.`)
      criados.push(await prisma.acaMatrizPeriodo.create({ data: { tenantId, matrizId: m.id, ordem, tipo: b.tipo, rotulo: !b.quantidade && b.rotulo ? b.rotulo : `${ordem}º ${ROTULO_PERIODO[b.tipo]}` } }))
    }
    res.status(201).json(qt === 1 ? criados[0] : { items: criados })
  }))
  router.patch('/periodos/:id', escrita, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const p = await prisma.acaMatrizPeriodo.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!p) fail(404, 'Período não encontrado.')
    const b = parseBody(z.object({ rotulo: z.string().min(1).max(60), tipo: z.enum(TIPOS_PERIODO) }).partial(), req.body)
    res.json(await prisma.acaMatrizPeriodo.update({ where: { id: p.id }, data: b }))
  }))
  router.delete('/periodos/:id', escrita, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const p = await prisma.acaMatrizPeriodo.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!p) fail(404, 'Período não encontrado.')
    if (await prisma.acaMatrizItem.count({ where: { periodoId: p.id } })) fail(409, 'Remova ou mova as disciplinas do período antes de excluí-lo.')
    await prisma.acaMatrizPeriodo.delete({ where: { id: p.id } })
    res.status(204).end()
  }))

  // ---------- itens ----------
  router.post('/matrizes/:id/itens', escrita, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const m = await matrizDoTenant(tenantId, String(req.params.id))
    const b = parseBody(z.object({ periodoId: z.string().min(1), disciplineId: z.string().min(1), tipo: z.enum(TIPOS_ITEM).default('OBRIGATORIA'), cargaHoraria: z.number().int().min(0).max(5000).optional(), creditos: z.number().int().min(0).max(100).default(0), ordem: z.number().int().default(0), grupoOptativas: optStr(60) }), req.body)
    const per = await prisma.acaMatrizPeriodo.findFirst({ where: { id: b.periodoId, matrizId: m.id } })
    if (!per) fail(400, 'Período não pertence à matriz.')
    const d = await prisma.discipline.findFirst({ where: { id: b.disciplineId, tenantId } })
    if (!d) fail(400, 'Disciplina não encontrada nesta instituição.')
    if (await prisma.acaMatrizItem.findFirst({ where: { matrizId: m.id, disciplineId: b.disciplineId } })) fail(409, 'A disciplina já está na matriz.')
    const i = await prisma.acaMatrizItem.create({ data: { ...b, cargaHoraria: b.cargaHoraria ?? d.cargaHoraria, tenantId, matrizId: m.id } })
    await recalcularTotais(tenantId, m.id)
    res.status(201).json(i)
  }))
  router.patch('/itens/:id', escrita, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const it = await prisma.acaMatrizItem.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!it) fail(404, 'Item não encontrado.')
    const b = parseBody(z.object({ periodoId: z.string(), tipo: z.enum(TIPOS_ITEM), cargaHoraria: z.number().int().min(0).max(5000), creditos: z.number().int().min(0).max(100), ordem: z.number().int(), grupoOptativas: optStr(60) }).partial(), req.body)
    if (b.periodoId && !(await prisma.acaMatrizPeriodo.findFirst({ where: { id: b.periodoId, matrizId: it.matrizId } }))) fail(400, 'Período não pertence à matriz.')
    const u = await prisma.acaMatrizItem.update({ where: { id: it.id }, data: Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined)) as any })
    await recalcularTotais(tenantId, it.matrizId)
    res.json(u)
  }))
  router.delete('/itens/:id', escrita, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const it = await prisma.acaMatrizItem.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!it) fail(404, 'Item não encontrado.')
    await prisma.$transaction([prisma.acaPreRequisito.deleteMany({ where: { tenantId, OR: [{ itemId: it.id }, { requisitoItemId: it.id }] } }), prisma.acaMatrizItem.delete({ where: { id: it.id } })])
    await recalcularTotais(tenantId, it.matrizId)
    res.status(204).end()
  }))

  // ---------- pré-requisitos ----------
  router.post('/matrizes/:id/prerequisitos', escrita, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const m = await matrizDoTenant(tenantId, String(req.params.id))
    const b = parseBody(z.object({ itemId: z.string().min(1), requisitoItemId: z.string().nullish(), tipo: z.enum(['PRE', 'CO', 'CARGA_MIN']).default('PRE'), cargaMinima: z.number().int().min(1).max(10000).nullish() }), req.body)
    const g = await carregarGrafo(tenantId, m.id)
    const item = g.nos.find((n) => n.id === b.itemId)
    if (!item) fail(400, 'Disciplina da matriz não encontrada.')
    if (b.tipo === 'CARGA_MIN') {
      if (!b.cargaMinima) fail(400, 'Informe a carga horária mínima integralizada.')
    } else {
      if (!b.requisitoItemId) fail(400, 'Informe a disciplina requisito.')
      if (b.requisitoItemId === b.itemId) fail(400, 'Uma disciplina não pode ser requisito dela mesma.')
      const r = g.nos.find((n) => n.id === b.requisitoItemId)
      if (!r) fail(400, 'Requisito não pertence à matriz.')
      if (b.tipo === 'PRE' && r.periodoOrdem >= item.periodoOrdem) fail(400, 'O pré-requisito deve estar em um período anterior ao da disciplina.')
      const teste = acharCiclo(g.nos, [...g.arestas, { itemId: b.itemId, requisitoItemId: b.requisitoItemId!, tipo: b.tipo }])
      if (teste) fail(409, 'O vínculo criaria pré-requisitos circulares.')
    }
    const dup = await prisma.acaPreRequisito.findFirst({ where: { itemId: b.itemId, requisitoItemId: b.requisitoItemId ?? null, tipo: b.tipo } })
    if (dup) fail(409, 'Vínculo já cadastrado.')
    res.status(201).json(await prisma.acaPreRequisito.create({ data: { tenantId, matrizId: m.id, itemId: b.itemId, requisitoItemId: b.requisitoItemId ?? null, tipo: b.tipo, cargaMinima: b.cargaMinima ?? null } }))
  }))
  router.delete('/prerequisitos/:id', escrita, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const p = await prisma.acaPreRequisito.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!p) fail(404, 'Vínculo não encontrado.')
    await prisma.acaPreRequisito.delete({ where: { id: p.id } })
    res.status(204).end()
  }))

  // ---------- equivalências ----------
  router.get('/equivalencias', leitura, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const items = await prisma.acaEquivalencia.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 1000 })
    const nomes = await nomesDisciplinas(tenantId, items.flatMap((i) => [i.disciplineId, i.equivalenteId]))
    res.json({ items: items.map((i) => ({ ...i, disciplina: nomes.get(i.disciplineId)?.nome, equivalente: nomes.get(i.equivalenteId)?.nome })) })
  }))
  router.post('/equivalencias', escrita, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ disciplineId: z.string().min(1), equivalenteId: z.string().min(1), percentual: z.number().int().min(1).max(100).default(100), bidirecional: z.boolean().default(true), observacao: optStr(300) }), req.body)
    if (b.disciplineId === b.equivalenteId) fail(400, 'Uma disciplina não pode ser equivalente a ela mesma.')
    await assertNoTenant(tenantId, 'discipline', b.disciplineId, 'Disciplina')
    await assertNoTenant(tenantId, 'discipline', b.equivalenteId, 'Disciplina equivalente')
    if (await prisma.acaEquivalencia.findFirst({ where: { tenantId, OR: [{ disciplineId: b.disciplineId, equivalenteId: b.equivalenteId }, { disciplineId: b.equivalenteId, equivalenteId: b.disciplineId }] } })) fail(409, 'Equivalência já cadastrada.')
    res.status(201).json(await prisma.acaEquivalencia.create({ data: { ...b, tenantId } }))
  }))
  router.delete('/equivalencias/:id', escrita, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const e = await prisma.acaEquivalencia.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!e) fail(404, 'Equivalência não encontrada.')
    await prisma.acaEquivalencia.delete({ where: { id: e.id } })
    res.status(204).end()
  }))

  // ---------- fluxograma (visualização gráfica) ----------
  router.get('/matrizes/:id/fluxograma', leitura, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const m = await matrizDoTenant(tenantId, String(req.params.id))
    const g = await carregarGrafo(tenantId, m.id)
    const nomes = await nomesDisciplinas(tenantId, g.itens.map((i) => i.disciplineId))
    const critico = new Set(caminhoCritico(g.nos, g.arestas))
    const colunas = g.periodos.map((p, ci) => {
      const its = g.itens.filter((i) => i.periodoId === p.id)
      return {
        periodoId: p.id, ordem: p.ordem, tipo: p.tipo, rotulo: p.rotulo, cargaHoraria: its.reduce((s, i) => s + i.cargaHoraria, 0), creditos: its.reduce((s, i) => s + i.creditos, 0),
        itens: its.map((i, ri) => ({ id: i.id, disciplineId: i.disciplineId, nome: nomes.get(i.disciplineId)?.nome ?? '—', tipo: i.tipo, cargaHoraria: i.cargaHoraria, creditos: i.creditos, x: ci, y: ri, critico: critico.has(i.id) })),
      }
    })
    const arestas = g.pre.filter((p) => p.requisitoItemId).map((p) => ({ id: p.id, de: p.requisitoItemId, para: p.itemId, tipo: p.tipo, critico: critico.has(p.itemId) && critico.has(p.requisitoItemId!) }))
    const cargaMin = g.pre.filter((p) => p.tipo === 'CARGA_MIN').map((p) => ({ itemId: p.itemId, cargaMinima: p.cargaMinima }))
    res.json({ matriz: { id: m.id, nome: m.nome, versao: m.versao, regime: m.regime, status: m.status, cargaHorariaTotal: m.cargaHorariaTotal, creditosTotal: m.creditosTotal }, colunas, arestas, cargaMin, caminhoCritico: [...critico].length ? caminhoCritico(g.nos, g.arestas) : [], validacao: validar(g, m, nomes) })
  }))

  // ---------- simulador de integralização por aluno ----------
  router.get('/matrizes/:id/simular', leitura, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const m = await matrizDoTenant(tenantId, String(req.params.id))
    const studentId = qs(req.query.studentId)
    if (!studentId) fail(400, 'Informe o aluno (studentId).')
    const aluno = await prisma.student.findFirst({ where: { id: studentId, tenantId }, select: { id: true, nomeCompleto: true, ra: true } })
    if (!aluno) fail(404, 'Aluno não encontrado.')
    const g = await carregarGrafo(tenantId, m.id)
    const [res1, equivs, horas] = await Promise.all([
      prisma.ntResultado.findMany({ where: { tenantId, studentId, disciplineId: { not: null } }, select: { disciplineId: true, situacao: true } }),
      prisma.acaEquivalencia.findMany({ where: { tenantId } }),
      prisma.acaHoraComplementar.aggregate({ where: { tenantId, studentId, status: { in: ['APROVADA', 'PARCIAL'] } }, _sum: { horasValidadas: true } }),
    ])
    const aprov = new Set(res1.filter((r) => r.situacao === 'APROVADO').map((r) => r.disciplineId!))
    const assumir = (qs(req.query.assumirAprovadas) || '').split(',').filter(Boolean)
    for (const itemId of assumir) { const it = g.itens.find((i) => i.id === itemId); if (it) aprov.add(it.disciplineId) }
    const emCurso = new Set(res1.filter((r) => ['EM_CURSO', 'RECUPERACAO', 'EXAME'].includes(r.situacao)).map((r) => r.disciplineId!))
    const cargaMax = qs(req.query.cargaMaxPeriodo) ? Number(qs(req.query.cargaMaxPeriodo)) : undefined
    if (cargaMax !== undefined && (!Number.isFinite(cargaMax) || cargaMax < 0)) fail(400, 'cargaMaxPeriodo inválida.')
    const sim = simularIntegralizacao(g.nos, g.arestas, { aprovadas: aplicarEquivalencias(aprov, equivs), emCurso, horasComplementares: horas._sum.horasValidadas ?? 0 }, { complementaresMin: m.horasComplementaresMin, cargaMaxPeriodo: cargaMax })
    const nomes = await nomesDisciplinas(tenantId, g.itens.map((i) => i.disciplineId))
    const nomeItem = new Map(g.itens.map((i) => [i.id, nomes.get(i.disciplineId)?.nome ?? '—']))
    const limpa = (f: string) => f.replace(/: (\S+)$/, (_s, id) => `: ${nomes.get(id)?.nome ?? id}`)
    res.json({
      aluno, matriz: { id: m.id, nome: m.nome, versao: m.versao }, ...sim,
      itens: sim.itens.map((i) => ({ ...i, nome: nomeItem.get(i.id), faltam: i.faltam.map(limpa) })),
      plano: sim.plano.map((p) => ({ ...p, itens: p.itens.map((id) => ({ id, nome: nomeItem.get(id) })) })),
      aviso: 'Simulação de apoio ao planejamento: não substitui o histórico oficial nem a análise de integralização da secretaria.',
    })
  }))
}
