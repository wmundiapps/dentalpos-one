import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { mountCrud, parseBody, pageParams, qs } from '../core/crud'
import { audit } from '../core/notify'
import { completeReminders, scheduleReminder } from '../core/reminders'
import { BIB, LEITURA, MOD, httpErr } from './common'
import { avaliarAdequacao, AdequacaoParams, normalizarIsbn, TituloVinculado } from './logic'
import { atribuirReservas, gerarTombos, getConfig, notificarLeitor } from './service'
import { derivarObra } from './common'

const SUGESTORES = ['LIBRARIAN', 'COORDINATOR', 'TEACHER'] as const
const DAY = 86_400_000

export async function calcularAdequacao(tenantId: string, filtro: { programId?: string; disciplineId?: string; params?: Partial<AdequacaoParams> }) {
  const cfg = await getConfig(tenantId)
  const params: AdequacaoParams = {
    minTitulosBasicos: filtro.params?.minTitulosBasicos ?? cfg.minTitulosBasicos,
    minTitulosComplementares: filtro.params?.minTitulosComplementares ?? cfg.minTitulosComplementares,
    vagasPorExemplar: filtro.params?.vagasPorExemplar ?? cfg.vagasPorExemplar,
  }
  // disciplinas no escopo (curso -> matriz curricular; senão todas do tenant)
  let disciplinas: Array<{ id: string; nome: string; periodo?: number }> = []
  let programa: { id: string; nome: string } | null = null
  if (filtro.programId) {
    programa = await prisma.academicProgram.findFirst({ where: { id: filtro.programId, tenantId }, select: { id: true, nome: true } })
    if (!programa) throw httpErr(404, 'Curso não encontrado.')
    const cd = await prisma.curriculumDiscipline.findMany({ where: { programId: filtro.programId }, include: { discipline: true }, orderBy: { periodo: 'asc' } })
    disciplinas = cd.map((c) => ({ id: c.disciplineId, nome: c.discipline.nome, periodo: c.periodo }))
  } else {
    const ds = await prisma.discipline.findMany({ where: { tenantId, ...(filtro.disciplineId ? { id: filtro.disciplineId } : {}) }, orderBy: { nome: 'asc' }, take: 1000 })
    disciplinas = ds.map((d) => ({ id: d.id, nome: d.nome }))
  }
  if (filtro.disciplineId) disciplinas = disciplinas.filter((d) => d.id === filtro.disciplineId)
  const dIds = disciplinas.map((d) => d.id)

  const [vinculos, turmas] = await Promise.all([
    prisma.bibBibliografia.findMany({ where: { tenantId, disciplineId: { in: dIds } } }),
    prisma.classSection.findMany({ where: { tenantId, disciplineId: { in: dIds } }, include: { term: { select: { dataFim: true } }, matriculados: { select: { id: true } } } }),
  ])
  const obraIds = [...new Set(vinculos.map((v) => v.obraId))]
  const [obras, grupos, virtuais] = obraIds.length
    ? await Promise.all([
        prisma.bibObra.findMany({ where: { tenantId, id: { in: obraIds } }, select: { id: true, titulo: true } }),
        prisma.bibExemplar.groupBy({ by: ['obraId'], where: { tenantId, obraId: { in: obraIds }, status: { notIn: ['BAIXADO', 'EXTRAVIADO'] } }, _count: { _all: true } }),
        prisma.bibRecursoVirtual.findMany({ where: { tenantId, obraId: { in: obraIds }, ativo: true }, select: { obraId: true } }),
      ])
    : [[], [], []]

  const resultado = disciplinas.map((d) => {
    // vagas: turmas do período mais recente
    const ts = turmas.filter((t) => t.disciplineId === d.id)
    const ultimoFim = ts.reduce((m, t) => Math.max(m, t.term.dataFim.getTime()), 0)
    const recentes = ts.filter((t) => t.term.dataFim.getTime() === ultimoFim)
    const vagas = recentes.reduce((s, t) => s + (t.vagas ?? t.matriculados.length), 0)
    const titulos: TituloVinculado[] = vinculos.filter((v) => v.disciplineId === d.id).map((v) => ({
      obraId: v.obraId, titulo: obras.find((o) => o.id === v.obraId)?.titulo ?? '(obra removida)', tipo: v.tipo,
      exemplares: grupos.find((g) => g.obraId === v.obraId)?._count._all ?? 0, virtual: virtuais.some((x) => x.obraId === v.obraId),
    }))
    return { disciplineId: d.id, disciplina: d.nome, periodo: d.periodo, titulos, ...avaliarAdequacao(titulos, vagas, params) }
  })
  const n = resultado.length
  return {
    parametros: params, curso: programa,
    resumo: {
      disciplinas: n, adequadas: resultado.filter((r) => r.status === 'ADEQUADA').length, parciais: resultado.filter((r) => r.status === 'PARCIAL').length,
      inadequadas: resultado.filter((r) => r.status === 'INADEQUADA').length, indiceMedio: n ? Math.round(resultado.reduce((s, r) => s + r.indice, 0) / n) : 0,
      semBibliografia: resultado.filter((r) => r.titulos.length === 0).length,
    },
    disciplinas: resultado,
  }
}

export function mountAdequacao(router: Router) {
  // ---- bibliografia (vínculo disciplina x obra) ----
  router.get('/bibliografia/disciplina/:id', requireRole(...LEITURA, 'STUDENT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const v = await prisma.bibBibliografia.findMany({ where: { tenantId, disciplineId: String(req.params.id) } })
    const obras = await prisma.bibObra.findMany({ where: { tenantId, id: { in: v.map((x) => x.obraId) } }, select: { id: true, titulo: true, autores: true, edicao: true, ano: true, isbn: true } })
    const g = await prisma.bibExemplar.groupBy({ by: ['obraId', 'status'], where: { tenantId, obraId: { in: obras.map((o) => o.id) }, status: { notIn: ['BAIXADO', 'EXTRAVIADO'] } }, _count: { _all: true } })
    const itens = v.map((x) => {
      const gs = g.filter((y) => y.obraId === x.obraId)
      return { ...x, obra: obras.find((o) => o.id === x.obraId), exemplares: gs.reduce((s, y) => s + y._count._all, 0), disponiveis: gs.find((y) => y.status === 'DISPONIVEL')?._count._all ?? 0 }
    })
    res.json({ basica: itens.filter((i) => i.tipo === 'BASICA'), complementar: itens.filter((i) => i.tipo === 'COMPLEMENTAR') })
  }))
  router.get('/bibliografia/obra/:id/disciplinas', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const v = await prisma.bibBibliografia.findMany({ where: { tenantId, obraId: String(req.params.id) } })
    const ds = await prisma.discipline.findMany({ where: { tenantId, id: { in: v.map((x) => x.disciplineId) } }, select: { id: true, nome: true } })
    res.json(v.map((x) => ({ ...x, disciplina: ds.find((d) => d.id === x.disciplineId) })))
  }))
  mountCrud(router, {
    model: 'bibBibliografia', path: '/bibliografia', read: LEITURA, write: [...BIB, 'COORDINATOR'], modulo: MOD,
    create: z.object({ disciplineId: z.string().min(1), obraId: z.string().min(1), tipo: z.enum(['BASICA', 'COMPLEMENTAR']).default('BASICA'), observacao: z.string().optional().nullable() }),
    filters: ['disciplineId', 'obraId', 'tipo'], orderBy: [{ tipo: 'asc' }, { createdAt: 'asc' }],
    beforeCreate: async (d, req) => {
      const tenantId = getTenantId(req)
      if (!(await prisma.discipline.findFirst({ where: { id: d.disciplineId, tenantId }, select: { id: true } }))) throw httpErr(404, 'Disciplina não encontrada.')
      if (!(await prisma.bibObra.findFirst({ where: { id: d.obraId, tenantId }, select: { id: true } }))) throw httpErr(404, 'Obra não encontrada.')
      return d
    },
    beforeUpdate: (d) => { delete d.disciplineId; delete d.obraId; return d },
  })

  // ---- relatório de adequação ----
  router.get('/adequacao', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const p: Partial<AdequacaoParams> = {}
    if (qs(req.query.minBasicos)) p.minTitulosBasicos = Number(qs(req.query.minBasicos))
    if (qs(req.query.minComplementares)) p.minTitulosComplementares = Number(qs(req.query.minComplementares))
    if (qs(req.query.vagasPorExemplar)) p.vagasPorExemplar = Number(qs(req.query.vagasPorExemplar))
    const r = await calcularAdequacao(getTenantId(req), { programId: qs(req.query.programId), disciplineId: qs(req.query.disciplineId), params: p })
    const so = qs(req.query.status)
    res.json(so ? { ...r, disciplinas: r.disciplinas.filter((d) => d.status === so) } : r)
  }))

  // lacunas -> sugestões de aquisição (com lembrete ao bibliotecário)
  router.post('/adequacao/gerar-sugestoes', requireRole(...BIB, 'COORDINATOR'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(z.object({ programId: z.string().optional(), disciplineId: z.string().optional(), prazoDias: z.coerce.number().int().min(1).max(365).default(30) }), req.body ?? {})
    const adeq = await calcularAdequacao(tenantId, b)
    const criadas: any[] = []
    for (const d of adeq.disciplinas) {
      for (const l of d.lacunas) {
        if (!['TITULOS_BASICOS', 'TITULOS_COMPLEMENTARES', 'EXEMPLARES', 'SEM_EXEMPLAR'].includes(l.codigo)) continue
        const tipoBib = l.codigo === 'TITULOS_COMPLEMENTARES' || l.codigo === 'SEM_EXEMPLAR' ? 'COMPLEMENTAR' : 'BASICA'
        const obraId = l.obraId ?? null
        const existe = await prisma.bibSugestaoAquisicao.findFirst({ where: { tenantId, disciplineId: d.disciplineId, obraId, tipoBibliografia: tipoBib, origem: 'ADEQUACAO', status: { in: ['PENDENTE', 'APROVADA', 'COMPRADA'] } } })
        if (existe) continue
        const titulo = obraId ? d.titulos.find((t) => t.obraId === obraId)?.titulo ?? 'Exemplares adicionais' : `Título(s) de bibliografia ${tipoBib === 'BASICA' ? 'básica' : 'complementar'} — ${d.disciplina}`
        const s = await prisma.bibSugestaoAquisicao.create({
          data: { tenantId, titulo, obraId, disciplineId: d.disciplineId, tipoBibliografia: tipoBib, quantidade: Math.max(1, l.faltam ?? 1), origem: 'ADEQUACAO', solicitanteId: getUserId(req), justificativa: l.mensagem },
        })
        await scheduleReminder({
          tenantId, modulo: MOD, titulo: `Analisar sugestão de aquisição: ${titulo}`, descricao: l.mensagem, dueAt: new Date(Date.now() + b.prazoDias * DAY), antecedenciaDias: 7,
          severity: 'ATENCAO', assigneeRole: 'LIBRARIAN', refType: 'BibSugestaoAquisicao', refId: s.id, dedupeKey: `bib-sugestao:${s.id}`,
        })
        criadas.push(s)
      }
    }
    await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'GERAR_SUGESTOES_ADEQUACAO', detalhes: { criadas: criadas.length } })
    res.status(201).json({ criadas: criadas.length, sugestoes: criadas })
  }))

  // ---- sugestões de aquisição ----
  router.post('/sugestoes', requireRole(...SUGESTORES, 'STUDENT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(z.object({
      titulo: z.string().trim().min(3), autores: z.string().optional(), editora: z.string().optional(), isbn: z.string().optional(),
      obraId: z.string().optional(), disciplineId: z.string().optional(), tipoBibliografia: z.enum(['BASICA', 'COMPLEMENTAR']).optional(),
      quantidade: z.coerce.number().int().min(1).max(500).default(1), valorEstimado: z.coerce.number().min(0).optional(), justificativa: z.string().trim().min(5, 'Justifique a sugestão.'),
    }), req.body)
    if (b.obraId && !(await prisma.bibObra.findFirst({ where: { id: b.obraId, tenantId }, select: { id: true } }))) throw httpErr(404, 'Obra não encontrada.')
    if (b.disciplineId && !(await prisma.discipline.findFirst({ where: { id: b.disciplineId, tenantId }, select: { id: true } }))) throw httpErr(404, 'Disciplina não encontrada.')
    const role = String(req.user?.role)
    const s = await prisma.bibSugestaoAquisicao.create({ data: { ...b, isbn: normalizarIsbn(b.isbn) ?? undefined, tenantId, solicitanteId: getUserId(req), origem: role === 'STUDENT' ? 'ALUNO' : role === 'LIBRARIAN' ? 'BIBLIOTECA' : 'PROFESSOR' } })
    await scheduleReminder({
      tenantId, modulo: MOD, titulo: `Nova sugestão de aquisição: ${s.titulo}`, descricao: b.justificativa, dueAt: new Date(Date.now() + 15 * DAY), antecedenciaDias: 10,
      severity: 'INFO', assigneeRole: 'LIBRARIAN', refType: 'BibSugestaoAquisicao', refId: s.id, dedupeKey: `bib-sugestao:${s.id}`,
    })
    await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'SUGERIR_AQUISICAO', refType: 'BibSugestaoAquisicao', refId: s.id })
    res.status(201).json(s)
  }))
  router.get('/sugestoes', requireRole(...SUGESTORES, 'STUDENT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const role = String(req.user?.role)
    const gestor = ['LIBRARIAN', 'COORDINATOR', 'ADMIN', 'OWNER', 'RECTOR', 'BOARD'].includes(role)
    const where: any = { tenantId, ...(gestor ? {} : { solicitanteId: getUserId(req) }) }
    for (const k of ['status', 'disciplineId', 'origem']) if (qs(req.query[k])) where[k] = qs(req.query[k])
    const [items, total] = await Promise.all([prisma.bibSugestaoAquisicao.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }), prisma.bibSugestaoAquisicao.count({ where })])
    res.json({ items, total, page, pageSize })
  }))
  router.post('/sugestoes/:id/decidir', requireRole('LIBRARIAN', 'COORDINATOR'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(z.object({ decisao: z.enum(['APROVAR', 'REJEITAR']), motivo: z.string().optional(), valorEstimado: z.coerce.number().min(0).optional() }), req.body)
    const s = await prisma.bibSugestaoAquisicao.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!s) return res.status(404).json({ error: 'Sugestão não encontrada.' })
    if (s.status !== 'PENDENTE') throw httpErr(409, `Sugestão já está ${s.status}.`)
    if (b.decisao === 'REJEITAR' && (!b.motivo || b.motivo.trim().length < 5)) throw httpErr(400, 'Informe o motivo da rejeição.')
    const upd = await prisma.bibSugestaoAquisicao.update({
      where: { id: s.id }, data: { status: b.decisao === 'APROVAR' ? 'APROVADA' : 'REJEITADA', decididoPorId: getUserId(req), decididoEm: new Date(), motivoDecisao: b.motivo, valorEstimado: b.valorEstimado ?? s.valorEstimado },
    })
    await completeReminders({ tenantId, refType: 'BibSugestaoAquisicao', refId: s.id, userId: getUserId(req) })
    if (b.decisao === 'APROVAR')
      await scheduleReminder({ tenantId, modulo: MOD, titulo: `Comprar: ${s.titulo} (${s.quantidade} un.)`, dueAt: new Date(Date.now() + 30 * DAY), antecedenciaDias: 7, severity: 'ATENCAO', assigneeRole: 'LIBRARIAN', refType: 'BibSugestaoAquisicao', refId: s.id, dedupeKey: `bib-compra:${s.id}` })
    if (s.solicitanteId && s.origem !== 'ADEQUACAO')
      await notificarLeitor({ tenantId, userId: s.solicitanteId }, `Sugestão de aquisição ${upd.status === 'APROVADA' ? 'aprovada' : 'rejeitada'}`, `"${s.titulo}": ${upd.status === 'APROVADA' ? 'aprovada para compra.' : 'rejeitada. ' + (b.motivo ?? '')}`, { refType: 'BibSugestaoAquisicao', refId: s.id })
    await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: `SUGESTAO_${b.decisao}`, refType: 'BibSugestaoAquisicao', refId: s.id, detalhes: b })
    res.json(upd)
  }))
  router.post('/sugestoes/:id/comprar', requireRole(...BIB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(z.object({ valorEstimado: z.coerce.number().min(0).optional() }), req.body ?? {})
    const s = await prisma.bibSugestaoAquisicao.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!s) return res.status(404).json({ error: 'Sugestão não encontrada.' })
    if (s.status !== 'APROVADA') throw httpErr(409, 'Só é possível comprar sugestões aprovadas.')
    const upd = await prisma.bibSugestaoAquisicao.update({ where: { id: s.id }, data: { status: 'COMPRADA', valorEstimado: b.valorEstimado ?? s.valorEstimado } })
    await completeReminders({ tenantId, refType: 'BibSugestaoAquisicao', refId: s.id })
    await scheduleReminder({ tenantId, modulo: MOD, titulo: `Receber compra: ${s.titulo}`, dueAt: new Date(Date.now() + 30 * DAY), antecedenciaDias: 5, severity: 'ATENCAO', assigneeRole: 'LIBRARIAN', refType: 'BibSugestaoAquisicao', refId: s.id, dedupeKey: `bib-recebimento:${s.id}` })
    await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'SUGESTAO_COMPRADA', refType: 'BibSugestaoAquisicao', refId: s.id })
    res.json(upd)
  }))
  // recebimento: cria a obra (se necessário), os exemplares com tombo e o vínculo de bibliografia
  router.post('/sugestoes/:id/receber', requireRole(...BIB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(z.object({
      quantidade: z.coerce.number().int().min(1).max(500).optional(), spaceId: z.string().optional(), estante: z.string().optional(), valor: z.coerce.number().min(0).optional(),
      fornecedor: z.string().optional(), notaFiscal: z.string().optional(),
    }), req.body ?? {})
    const s = await prisma.bibSugestaoAquisicao.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!s) return res.status(404).json({ error: 'Sugestão não encontrada.' })
    if (!['APROVADA', 'COMPRADA'].includes(s.status)) throw httpErr(409, 'Sugestão precisa estar aprovada/comprada para recebimento.')
    if (b.spaceId && !(await prisma.eduSpace.findFirst({ where: { id: b.spaceId, tenantId }, select: { id: true } }))) throw httpErr(400, 'Espaço não encontrado.')
    let obraId = s.obraId
    if (!obraId) {
      const isbn = normalizarIsbn(s.isbn)
      const ex = isbn ? await prisma.bibObra.findFirst({ where: { tenantId, isbn } }) : null
      const obra = ex ?? await prisma.bibObra.create({ data: { tenantId, ...derivarObra({ titulo: s.titulo, autores: s.autores ? s.autores.split(/[;|]/).map((x) => x.trim()).filter(Boolean) : [], editora: s.editora, isbn, assuntos: [] }) } })
      obraId = obra.id
    }
    const qtd = b.quantidade ?? s.quantidade
    const tombos = await gerarTombos(tenantId, qtd)
    for (const tombo of tombos)
      await prisma.bibExemplar.create({ data: { tenantId, obraId, tombo, spaceId: b.spaceId, estante: b.estante, aquisicaoTipo: 'COMPRA', dataAquisicao: new Date(), valor: b.valor ?? (s.valorEstimado ?? undefined), fornecedor: b.fornecedor, notaFiscal: b.notaFiscal } })
    if (s.disciplineId)
      await prisma.bibBibliografia.upsert({
        where: { tenantId_disciplineId_obraId: { tenantId, disciplineId: s.disciplineId, obraId } }, update: {},
        create: { tenantId, disciplineId: s.disciplineId, obraId, tipo: s.tipoBibliografia ?? 'COMPLEMENTAR' },
      })
    const upd = await prisma.bibSugestaoAquisicao.update({ where: { id: s.id }, data: { status: 'RECEBIDA', recebidoEm: new Date(), obraId } })
    await completeReminders({ tenantId, refType: 'BibSugestaoAquisicao', refId: s.id })
    await atribuirReservas(tenantId, obraId)
    if (s.solicitanteId && s.origem !== 'ADEQUACAO')
      await notificarLeitor({ tenantId, userId: s.solicitanteId }, 'Obra sugerida já está no acervo', `"${s.titulo}" foi adquirida (${qtd} exemplar(es)).`, { refType: 'BibSugestaoAquisicao', refId: s.id })
    await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'SUGESTAO_RECEBIDA', refType: 'BibSugestaoAquisicao', refId: s.id, detalhes: { tombos } })
    res.json({ sugestao: upd, obraId, tombos })
  }))
}
