import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { parseBody, pageParams, qs } from '../core/crud'
import { audit, notify } from '../core/notify'
import { scheduleReminder, completeReminders } from '../core/reminders'
import { getBranding, brandHeaderHtml, escapeHtml as esc } from '../core/branding'
import { parseNotasCsv, notaDeTentativas, estatisticas, normalizar, SITUACAO_LABEL, Situacao } from './calc'
import { calcularTurma, recalcularTurma, gravarNota, getPrazoLancamento, roster, TurmaCtx, resolverRegra } from './service'
import { turmaDoUsuario, httpErr, isMgmt, isCoord, role } from './common'

const router = Router()
const PROF = ['TEACHER', 'COORDINATOR', 'SECRETARY'] as const

// ---------- Listagem de turmas ----------

router.get('/turmas', requireRole(...PROF), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const { skip, take, page, pageSize } = pageParams(req.query)
  const where: any = { tenantId }
  if (role(req) === 'TEACHER') where.professorUserId = getUserId(req)
  else if (qs(req.query.professorUserId)) where.professorUserId = qs(req.query.professorUserId)
  if (qs(req.query.termId)) where.termId = qs(req.query.termId)
  if (qs(req.query.disciplineId)) where.disciplineId = qs(req.query.disciplineId)
  const q = qs(req.query.q)
  if (q) where.nome = { contains: q, mode: 'insensitive' }
  const [secs, total] = await Promise.all([
    prisma.classSection.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, include: { discipline: { select: { nome: true, cargaHoraria: true } }, term: { select: { codigo: true } }, _count: { select: { matriculados: true } } } }),
    prisma.classSection.count({ where }),
  ])
  const ids = secs.map((s) => s.id)
  const [diarios, comps] = await Promise.all([
    prisma.ntDiario.findMany({ where: { tenantId, classSectionId: { in: ids } } }),
    prisma.ntComponente.groupBy({ by: ['classSectionId'], where: { tenantId, classSectionId: { in: ids } }, _count: true }),
  ])
  let items = secs.map((s) => {
    const d = diarios.find((x) => x.classSectionId === s.id)
    return {
      id: s.id, nome: s.nome, disciplina: s.discipline.nome, periodoLetivo: s.term.codigo, termId: s.termId, professorUserId: s.professorUserId,
      alunos: s._count.matriculados, componentes: comps.find((c) => c.classSectionId === s.id)?._count ?? 0,
      diarioStatus: d?.status ?? 'ABERTO', prazoLancamento: d?.prazoLancamento ?? null, fechadoEm: d?.fechadoEm ?? null,
    }
  })
  const st = qs(req.query.diarioStatus)
  if (st) items = items.filter((i) => i.diarioStatus === st)
  res.json({ items, total, page, pageSize })
}))

// ---------- Diário completo (grade de notas) ----------

router.get('/turmas/:id/diario', requireRole(...PROF), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const ctx = await turmaDoUsuario(req, String(req.params.id))
  const calc = await calcularTurma(tenantId, ctx)
  const prazo = await getPrazoLancamento(tenantId, ctx.section.id, ctx.section.termId, getUserId(req))
  const disc = await prisma.discipline.findFirst({ where: { id: ctx.section.disciplineId, tenantId }, select: { nome: true, cargaHoraria: true } })
  res.json({
    turma: { id: ctx.section.id, nome: ctx.section.nome, disciplina: disc?.nome, cargaHoraria: disc?.cargaHoraria, termId: ctx.section.termId, professorUserId: ctx.section.professorUserId },
    diario: { status: ctx.diario.status, fechadoEm: ctx.diario.fechadoEm, reabertoEm: ctx.diario.reabertoEm, reaberturaMotivo: ctx.diario.reaberturaMotivo, prazoLancamento: prazo.prazo, prazoOrigem: prazo.origem, prazoExpirado: !!prazo.prazo && prazo.prazo.getTime() < Date.now() },
    regra: { ...ctx.regra, ...ctx.regraInfo, modeloComponentes: undefined },
    componentes: ctx.componentes,
    aulas: { chamadas: calc.aulasChamada, realizadas: calc.aulasRealizadas },
    alunos: calc.alunos.map((a) => ({
      studentId: a.aluno.studentId, ra: a.aluno.ra, nome: a.aluno.nome, statusMatricula: a.aluno.statusMatricula,
      notas: a.notas, frequencia: a.frequencia, resultado: a.resultado, risco: a.risco, notaNecessaria: a.notaNecessaria,
    })),
  })
}))

// ---------- Componentes ----------

const compSchema = z.object({
  codigo: z.string().trim().min(1).max(20),
  nome: z.string().trim().min(2),
  tipo: z.enum(['AVALIACAO', 'RECUPERACAO', 'EXAME']).default('AVALIACAO'),
  peso: z.number().positive().default(1),
  notaMaxima: z.number().positive().max(1000).default(10),
  obrigatorio: z.boolean().default(true),
  dataPrevista: z.coerce.date().optional().nullable(),
  assessmentId: z.string().optional().nullable(),
  ordem: z.number().int().optional(),
})

function exigeAberto(req: AuthenticatedRequest, ctx: TurmaCtx) {
  if (ctx.diario.status === 'FECHADO') throw httpErr(423, 'Diário fechado. Somente a coordenação pode reabri-lo (com justificativa).')
}

async function validarComponente(tenantId: string, ctx: TurmaCtx, c: { tipo: string; codigo: string; assessmentId?: string | null }, ignoreId?: string) {
  const outros = ctx.componentes.filter((x) => x.id !== ignoreId)
  if (outros.some((x) => x.codigo.toLowerCase() === c.codigo.toLowerCase())) throw httpErr(409, `Já existe o componente "${c.codigo}" nesta turma.`)
  if (c.tipo !== 'AVALIACAO' && outros.some((x) => x.tipo === c.tipo)) throw httpErr(409, `A turma já possui um componente do tipo ${c.tipo}.`)
  if (c.assessmentId) {
    const a = await prisma.assessment.findFirst({ where: { id: c.assessmentId, discipline: { tenantId } }, select: { id: true } })
    if (!a) throw httpErr(404, 'Prova (assessment) não encontrada.')
  }
}

router.post('/turmas/:id/componentes/aplicar-regra', requireRole(...PROF), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const ctx = await turmaDoUsuario(req, String(req.params.id))
  exigeAberto(req, ctx)
  const body = parseBody(z.object({ regraId: z.string().optional(), substituir: z.boolean().default(false) }), req.body ?? {})
  let modelo: any[] | null = null
  let regraId: string | null = ctx.regraInfo.regraId
  if (body.regraId) {
    const r = await prisma.ntRegraAvaliacao.findFirst({ where: { id: body.regraId, tenantId, ativo: true } })
    if (!r) throw httpErr(404, 'Regra não encontrada.')
    modelo = Array.isArray(r.componentes) ? (r.componentes as any[]) : null
    regraId = r.id
  } else modelo = ctx.regraInfo.modeloComponentes
  if (!modelo?.length) throw httpErr(422, 'A regra aplicável não define um modelo de componentes.')
  const lancs = await prisma.ntLancamento.count({ where: { tenantId, classSectionId: ctx.section.id } })
  if (ctx.componentes.length && !body.substituir) throw httpErr(409, 'A turma já possui componentes. Envie substituir=true para recriá-los.')
  if (ctx.componentes.length && lancs > 0) throw httpErr(409, 'Há notas lançadas; não é possível substituir os componentes.')
  const criados = await prisma.$transaction(async (tx) => {
    if (ctx.componentes.length) await tx.ntComponente.deleteMany({ where: { tenantId, classSectionId: ctx.section.id } })
    const out: any[] = []
    let i = 0
    for (const m of modelo!) {
      const c = compSchema.parse({ tipo: 'AVALIACAO', ...m })
      out.push(await tx.ntComponente.create({ data: { tenantId, classSectionId: ctx.section.id, codigo: c.codigo, nome: c.nome, tipo: c.tipo, peso: c.peso, notaMaxima: c.notaMaxima, obrigatorio: c.tipo === 'AVALIACAO' ? c.obrigatorio : false, ordem: c.ordem ?? i++ } }))
    }
    await tx.ntDiario.update({ where: { classSectionId: ctx.section.id }, data: { regraId } })
    return out
  })
  await audit({ tenantId, userId: getUserId(req), modulo: 'notas', acao: 'APLICAR_REGRA', refType: 'ClassSection', refId: ctx.section.id, detalhes: { regraId, componentes: criados.length } })
  res.status(201).json({ componentes: criados })
}))

router.post('/turmas/:id/componentes', requireRole(...PROF), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const ctx = await turmaDoUsuario(req, String(req.params.id))
  exigeAberto(req, ctx)
  const c = parseBody(compSchema, req.body)
  await validarComponente(tenantId, ctx, c)
  const row = await prisma.ntComponente.create({ data: { tenantId, classSectionId: ctx.section.id, ...c, dataPrevista: c.dataPrevista ?? null, obrigatorio: c.tipo === 'AVALIACAO' ? c.obrigatorio : false, ordem: c.ordem ?? ctx.componentes.length } })
  if (row.dataPrevista) {
    await scheduleReminder({ tenantId, modulo: 'notas', titulo: `Lançar notas: ${row.nome} (${ctx.section.nome})`, dueAt: new Date(row.dataPrevista.getTime() + 7 * 86400000), antecedenciaDias: 2, assigneeUserId: ctx.section.professorUserId, refType: 'NtComponente', refId: row.id, dedupeKey: `nt-comp-${row.id}` })
  }
  await audit({ tenantId, userId: getUserId(req), modulo: 'notas', acao: 'CRIAR_COMPONENTE', refType: 'NtComponente', refId: row.id })
  res.status(201).json(row)
}))

router.patch('/turmas/:id/componentes/:cid', requireRole(...PROF), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const ctx = await turmaDoUsuario(req, String(req.params.id))
  exigeAberto(req, ctx)
  const cur = ctx.componentes.find((c) => c.id === String(req.params.cid))
  if (!cur) throw httpErr(404, 'Componente não encontrado.')
  const d = parseBody(compSchema.partial(), req.body)
  await validarComponente(tenantId, ctx, { tipo: d.tipo ?? cur.tipo, codigo: d.codigo ?? cur.codigo, assessmentId: d.assessmentId }, cur.id)
  if (d.notaMaxima != null && d.notaMaxima < cur.notaMaxima) {
    const acima = await prisma.ntLancamento.count({ where: { tenantId, componenteId: cur.id, valor: { gt: d.notaMaxima } } })
    if (acima) throw httpErr(409, `Existem ${acima} nota(s) acima do novo máximo.`)
  }
  const row = await prisma.ntComponente.update({ where: { id: cur.id }, data: d })
  await audit({ tenantId, userId: getUserId(req), modulo: 'notas', acao: 'ATUALIZAR_COMPONENTE', refType: 'NtComponente', refId: cur.id, detalhes: d })
  await recalcularTurma(tenantId, ctx.section.id)
  res.json(row)
}))

router.delete('/turmas/:id/componentes/:cid', requireRole(...PROF), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const ctx = await turmaDoUsuario(req, String(req.params.id))
  exigeAberto(req, ctx)
  const cur = ctx.componentes.find((c) => c.id === String(req.params.cid))
  if (!cur) throw httpErr(404, 'Componente não encontrado.')
  const n = await prisma.ntLancamento.count({ where: { tenantId, componenteId: cur.id } })
  if (n) throw httpErr(409, 'O componente já possui notas lançadas e não pode ser removido.')
  await prisma.ntComponente.delete({ where: { id: cur.id } })
  await completeReminders({ tenantId, refType: 'NtComponente', refId: cur.id })
  await audit({ tenantId, userId: getUserId(req), modulo: 'notas', acao: 'REMOVER_COMPONENTE', refType: 'NtComponente', refId: cur.id })
  res.status(204).end()
}))

// ---------- Lançamento de notas ----------

interface Item { studentId?: string; ra?: string; componenteId?: string; codigo?: string; valor?: number | null; ausente?: boolean; observacao?: string | null }

// Aplica um lote respeitando estado do diário, prazo e matrícula. Falhas por item não abortam o lote.
async function aplicarLote(req: AuthenticatedRequest, ctx: TurmaCtx, items: Item[], opt: { origem: 'MANUAL' | 'IMPORTACAO' | 'PROVA' | 'CORRECAO'; motivo?: string; simular?: boolean; attempts?: Map<string, string> }) {
  const tenantId = getTenantId(req)
  const userId = getUserId(req)
  const alunos = await roster(tenantId, ctx.section.id)
  const porId = new Map(alunos.map((a) => [a.studentId, a]))
  const porRa = new Map(alunos.map((a) => [a.ra.toLowerCase(), a]))
  const compPorId = new Map(ctx.componentes.map((c) => [c.id, c]))
  const compPorCod = new Map(ctx.componentes.map((c) => [String(c.codigo).toLowerCase(), c]))
  const relat = { gravadas: 0, semAlteracao: 0, erros: [] as Array<{ indice: number; erro: string }>, afetados: new Set<string>() }
  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    try {
      const aluno = it.studentId ? porId.get(it.studentId) : it.ra ? porRa.get(it.ra.toLowerCase()) : undefined
      if (!aluno) throw new Error('Aluno não matriculado nesta turma.')
      const comp = it.componenteId ? compPorId.get(it.componenteId) : it.codigo ? compPorCod.get(it.codigo.toLowerCase()) : undefined
      if (!comp) throw new Error('Componente não encontrado nesta turma.')
      if (it.valor == null && !it.ausente) throw new Error('Informe a nota ou marque ausente.')
      if (opt.simular) {
        if (it.valor != null && (it.valor < 0 || it.valor > comp.notaMaxima)) throw new Error(`Nota fora do intervalo 0–${comp.notaMaxima}.`)
        relat.gravadas++
        continue
      }
      const r = await gravarNota({
        tenantId, classSectionId: ctx.section.id, componente: comp, studentId: aluno.studentId, valor: it.valor ?? null, ausente: it.ausente,
        observacao: it.observacao, origem: opt.origem, motivo: opt.motivo, userId, attemptId: opt.attempts?.get(aluno.studentId),
      })
      if (r.changed) { relat.gravadas++; relat.afetados.add(aluno.studentId) } else relat.semAlteracao++
    } catch (e: any) {
      relat.erros.push({ indice: i, erro: e.message })
    }
  }
  return relat
}

async function prepararLancamento(req: AuthenticatedRequest, ctx: TurmaCtx, correcao: boolean, motivo?: string) {
  const tenantId = getTenantId(req)
  if (correcao) {
    if (!isMgmt(req)) throw httpErr(403, 'Correção de notas é restrita à secretaria/coordenação.')
    if (!motivo || motivo.trim().length < 10) throw httpErr(400, 'Justificativa obrigatória (mínimo de 10 caracteres) para correção de nota.')
    return
  }
  exigeAberto(req, ctx)
  if (role(req) === 'TEACHER') {
    const p = await getPrazoLancamento(tenantId, ctx.section.id, ctx.section.termId, getUserId(req))
    if (p.prazo && p.prazo.getTime() < Date.now()) throw httpErr(409, `Prazo de lançamento encerrado em ${p.prazo.toLocaleDateString('pt-BR')} (${p.origem}). Solicite correção à secretaria.`)
  }
}

async function pos(req: AuthenticatedRequest, ctx: TurmaCtx, afetados: Set<string>) {
  const tenantId = getTenantId(req)
  const antes = await prisma.ntResultado.findMany({ where: { tenantId, classSectionId: ctx.section.id, studentId: { in: [...afetados] } } })
  const calc = await recalcularTurma(tenantId, ctx.section.id)
  // diário fechado: avisa o aluno quando a correção muda a situação/média
  if (ctx.diario.status === 'FECHADO' && calc) {
    for (const a of calc.alunos.filter((x) => afetados.has(x.aluno.studentId))) {
      const b = antes.find((x) => x.studentId === a.aluno.studentId)
      if (!b || b.mediaFinal !== a.resultado.mediaFinal || b.situacao !== a.resultado.situacao) {
        await notify({ tenantId, studentId: a.aluno.studentId, assunto: 'Nota atualizada', mensagem: `Sua nota em ${ctx.section.nome} foi atualizada: média final ${a.resultado.mediaFinal ?? '—'} (${SITUACAO_LABEL[a.resultado.situacao as Situacao]}).`, refType: 'ClassSection', refId: ctx.section.id })
      }
    }
  }
}

const itemSchema = z.object({
  studentId: z.string().optional(), ra: z.string().optional(), componenteId: z.string().optional(), codigo: z.string().optional(),
  valor: z.number().nullable().optional(), ausente: z.boolean().optional(), observacao: z.string().max(500).nullable().optional(),
})

router.put('/turmas/:id/notas', requireRole(...PROF), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await turmaDoUsuario(req, String(req.params.id))
  const b = parseBody(z.object({ notas: z.array(itemSchema).min(1).max(2000), motivo: z.string().max(500).optional() }), req.body)
  await prepararLancamento(req, ctx, false)
  const r = await aplicarLote(req, ctx, b.notas, { origem: 'MANUAL', motivo: b.motivo })
  if (r.gravadas) await pos(req, ctx, r.afetados)
  res.json({ gravadas: r.gravadas, semAlteracao: r.semAlteracao, erros: r.erros })
}))

router.post('/turmas/:id/notas/corrigir', requireRole('COORDINATOR', 'SECRETARY'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const ctx = await turmaDoUsuario(req, String(req.params.id))
  const b = parseBody(z.object({ correcoes: z.array(itemSchema).min(1).max(500), motivo: z.string() }), req.body)
  await prepararLancamento(req, ctx, true, b.motivo)
  const r = await aplicarLote(req, ctx, b.correcoes, { origem: 'CORRECAO', motivo: b.motivo.trim() })
  if (r.gravadas) {
    await pos(req, ctx, r.afetados)
    await audit({ tenantId, userId: getUserId(req), modulo: 'notas', acao: 'CORRECAO_LOTE', refType: 'ClassSection', refId: ctx.section.id, detalhes: { motivo: b.motivo, alteradas: r.gravadas } })
    if (ctx.section.professorUserId !== getUserId(req)) await notify({ tenantId, userId: ctx.section.professorUserId, assunto: 'Correção de notas na sua turma', mensagem: `${r.gravadas} nota(s) de ${ctx.section.nome} foram corrigidas pela secretaria/coordenação. Motivo: ${b.motivo.trim()}`, refType: 'ClassSection', refId: ctx.section.id })
  }
  res.json({ alteradas: r.gravadas, semAlteracao: r.semAlteracao, erros: r.erros })
}))

router.post('/turmas/:id/notas/importar', requireRole(...PROF), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await turmaDoUsuario(req, String(req.params.id))
  const b = parseBody(z.object({
    formato: z.enum(['JSON', 'CSV']),
    dados: z.union([z.string(), z.array(z.any())]),
    componenteCodigo: z.string().optional(),   // JSON: valor aplicado a este componente quando o item não traz "codigo"
    motivo: z.string().optional(),
    simular: z.boolean().default(false),
  }), req.body)
  const fechado = ctx.diario.status === 'FECHADO'
  await prepararLancamento(req, ctx, fechado, b.motivo)
  const items: Item[] = []
  const errosParse: string[] = []
  if (b.formato === 'CSV') {
    if (typeof b.dados !== 'string') throw httpErr(400, 'Para CSV envie "dados" como texto.')
    const p = parseNotasCsv(b.dados)
    errosParse.push(...p.erros)
    for (const col of p.colunas) if (!ctx.componentes.some((c) => String(c.codigo).toLowerCase() === col.toLowerCase())) errosParse.push(`Coluna "${col}" não corresponde a nenhum componente da turma.`)
    for (const l of p.linhas) {
      errosParse.push(...l.erros)
      for (const [cod, v] of Object.entries(l.valores)) items.push({ ra: l.chave, codigo: cod, valor: v === 'AUSENTE' ? null : (v as number | null), ausente: v === 'AUSENTE' })
    }
  } else {
    let arr: any[]
    try { arr = typeof b.dados === 'string' ? JSON.parse(b.dados) : b.dados } catch { throw httpErr(400, 'JSON inválido.') }
    if (!Array.isArray(arr)) throw httpErr(400, 'O JSON deve ser uma lista.')
    for (const o of arr) {
      if (o && typeof o.valores === 'object') {
        for (const [cod, v] of Object.entries(o.valores as Record<string, any>)) items.push({ ra: o.ra, studentId: o.studentId, codigo: cod, valor: typeof v === 'number' ? v : null, ausente: v === 'AUSENTE' || o.ausente })
      } else items.push({ ra: o?.ra, studentId: o?.studentId, componenteId: o?.componenteId, codigo: o?.codigo ?? b.componenteCodigo, valor: o?.valor == null ? null : Number(String(o.valor).replace(',', '.')), ausente: !!o?.ausente, observacao: o?.observacao })
    }
  }
  if (!items.length) throw httpErr(422, 'Nenhuma nota encontrada para importar.')
  const r = await aplicarLote(req, ctx, items, { origem: fechado ? 'CORRECAO' : 'IMPORTACAO', motivo: b.motivo, simular: b.simular })
  if (!b.simular && r.gravadas) {
    await pos(req, ctx, r.afetados)
    await audit({ tenantId: getTenantId(req), userId: getUserId(req), modulo: 'notas', acao: 'IMPORTACAO', refType: 'ClassSection', refId: ctx.section.id, detalhes: { formato: b.formato, gravadas: r.gravadas, erros: r.erros.length } })
  }
  res.json({ simulacao: b.simular, itens: items.length, gravadas: r.gravadas, semAlteracao: r.semAlteracao, erros: [...errosParse.map((e) => ({ indice: -1, erro: e })), ...r.erros] })
}))

// Importa a nota das tentativas de prova (AssessmentAttempt, módulo provas-ia) para um componente.
router.post('/turmas/:id/componentes/:cid/importar-prova', requireRole(...PROF), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const ctx = await turmaDoUsuario(req, String(req.params.id))
  const comp = ctx.componentes.find((c) => c.id === String(req.params.cid))
  if (!comp) throw httpErr(404, 'Componente não encontrado.')
  const b = parseBody(z.object({
    assessmentId: z.string().optional(), modo: z.enum(['MELHOR', 'ULTIMA', 'MEDIA']).default('MELHOR'),
    escalaOrigem: z.number().positive().default(10), simular: z.boolean().default(false), motivo: z.string().optional(),
  }), req.body ?? {})
  const fechado = ctx.diario.status === 'FECHADO'
  await prepararLancamento(req, ctx, fechado, b.motivo)
  const assessmentId = b.assessmentId ?? comp.assessmentId
  if (!assessmentId) throw httpErr(400, 'Informe assessmentId (ou vincule a prova ao componente).')
  const ass = await prisma.assessment.findFirst({
    where: { id: assessmentId, discipline: { tenantId }, OR: [{ classSectionId: ctx.section.id }, { classSectionId: null, disciplineId: ctx.section.disciplineId }] },
    select: { id: true, titulo: true },
  })
  if (!ass) throw httpErr(404, 'Prova não encontrada para esta turma/disciplina.')
  const alunos = await roster(tenantId, ctx.section.id)
  const tent = await prisma.assessmentAttempt.findMany({
    where: { assessmentId, studentId: { in: alunos.map((a) => a.studentId) }, finalizadoEm: { not: null }, notaFinal: { not: null } },
    orderBy: { iniciadoEm: 'asc' },
  })
  const items: Item[] = []
  const attempts = new Map<string, string>()
  const semTentativa: string[] = []
  for (const a of alunos) {
    const ts = tent.filter((t) => t.studentId === a.studentId)
    const nota = notaDeTentativas(ts.map((t) => t.notaFinal as number), b.modo)
    if (nota == null) { semTentativa.push(a.ra); continue }
    const escalada = Math.round((nota / b.escalaOrigem) * comp.notaMaxima * 100) / 100
    items.push({ studentId: a.studentId, componenteId: comp.id, valor: Math.min(comp.notaMaxima, escalada), observacao: `Importada da prova "${ass.titulo}" (${b.modo.toLowerCase()})` })
    const escolhida = b.modo === 'MELHOR' ? ts.reduce((m, t) => ((t.notaFinal ?? 0) > (m.notaFinal ?? 0) ? t : m)) : ts[ts.length - 1]
    attempts.set(a.studentId, escolhida.id)
  }
  if (!b.simular && !comp.assessmentId) await prisma.ntComponente.update({ where: { id: comp.id }, data: { assessmentId } })
  const r = await aplicarLote(req, ctx, items, { origem: fechado ? 'CORRECAO' : 'PROVA', motivo: b.motivo ?? `Importação da prova ${ass.titulo}`, simular: b.simular, attempts })
  if (!b.simular && r.gravadas) await pos(req, ctx, r.afetados)
  res.json({ simulacao: b.simular, prova: ass.titulo, importadas: r.gravadas, semAlteracao: r.semAlteracao, semTentativaFinalizada: semTentativa, erros: r.erros })
}))

// ---------- Frequência / recálculo ----------

router.post('/turmas/:id/recalcular', requireRole(...PROF), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  await turmaDoUsuario(req, String(req.params.id))
  const r = await recalcularTurma(tenantId, String(req.params.id))
  const dist: Record<string, number> = {}
  r?.alunos.forEach((a) => { dist[a.resultado.situacao] = (dist[a.resultado.situacao] ?? 0) + 1 })
  res.json({ alunos: r?.alunos.length ?? 0, aulasComChamada: r?.aulasChamada ?? 0, situacoes: dist })
}))

router.get('/turmas/:id/frequencia', requireRole(...PROF), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const ctx = await turmaDoUsuario(req, String(req.params.id))
  const calc = await calcularTurma(tenantId, ctx)
  res.json({
    frequenciaMinima: ctx.regra.frequenciaMinima, aulasComChamada: calc.aulasChamada, aulasRealizadas: calc.aulasRealizadas,
    alunos: calc.alunos.map((a) => ({ studentId: a.aluno.studentId, ra: a.aluno.ra, nome: a.aluno.nome, ...a.frequencia, abaixoDoMinimo: a.frequencia.pct != null && a.frequencia.pct < ctx.regra.frequenciaMinima })),
  })
}))

// ---------- Fechamento do diário ----------

router.post('/turmas/:id/fechar', requireRole(...PROF), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const userId = getUserId(req)
  const ctx = await turmaDoUsuario(req, String(req.params.id))
  if (ctx.diario.status === 'FECHADO') throw httpErr(409, 'Diário já está fechado.')
  const b = parseBody(z.object({ observacao: z.string().max(1000).optional(), forcar: z.boolean().default(false), justificativa: z.string().optional() }), req.body ?? {})
  if (!ctx.componentes.length) throw httpErr(422, 'Defina os componentes de avaliação antes de fechar o diário.')
  const calc = await calcularTurma(tenantId, ctx)
  const pendencias = calc.alunos.filter((a) => a.resultado.pendentes.length).map((a) => ({ studentId: a.aluno.studentId, ra: a.aluno.ra, nome: a.aluno.nome, componentesPendentes: a.resultado.pendentes.map((id) => ctx.componentes.find((c) => c.id === id)?.codigo) }))
  const emFinal = calc.alunos.filter((a) => ['RECUPERACAO', 'EXAME'].includes(a.resultado.situacao)).map((a) => ({ studentId: a.aluno.studentId, ra: a.aluno.ra, nome: a.aluno.nome, situacao: a.resultado.situacao }))
  const bloqueios = pendencias.length || emFinal.length
  if (bloqueios) {
    if (!b.forcar) throw httpErr(409, 'Há pendências para o fechamento do diário.', { pendencias, aguardandoRecuperacaoOuExame: emFinal })
    if (!isMgmt(req) || !b.justificativa || b.justificativa.trim().length < 10) throw httpErr(403, 'Fechar com pendências exige coordenação/secretaria e justificativa (mín. 10 caracteres).')
  }
  const resolvida = await resolverRegra(tenantId, ctx.section.id)
  await prisma.ntDiario.update({
    where: { classSectionId: ctx.section.id },
    data: { status: 'FECHADO', fechadoEm: new Date(), fechadoPorId: userId, fechamentoObs: [b.observacao, bloqueios ? `Fechado com pendências: ${b.justificativa}` : ''].filter(Boolean).join(' | ') || null, regraId: resolvida.regraId, regraSnapshot: resolvida.regra as any },
  })
  const fin = await recalcularTurma(tenantId, ctx.section.id)
  await completeReminders({ tenantId, refType: 'NtDiario', refId: ctx.section.id, userId })
  const dist: Record<string, number> = {}
  for (const a of fin?.alunos ?? []) {
    dist[a.resultado.situacao] = (dist[a.resultado.situacao] ?? 0) + 1
    await notify({ tenantId, studentId: a.aluno.studentId, assunto: `Resultado final — ${ctx.section.nome}`, mensagem: `Diário encerrado. Média final: ${a.resultado.mediaFinal ?? '—'} · Frequência: ${a.frequencia.pct ?? '—'}% · Situação: ${SITUACAO_LABEL[a.resultado.situacao as Situacao]}. Dúvidas? Você pode solicitar revisão de nota pelo portal em até ${ctx.regra.diasRevisao} dias.`, templateKey: 'nt-resultado-final', refType: 'ClassSection', refId: ctx.section.id })
  }
  await audit({ tenantId, userId, modulo: 'notas', acao: 'FECHAR_DIARIO', refType: 'ClassSection', refId: ctx.section.id, detalhes: { situacoes: dist, forcado: !!bloqueios, justificativa: b.justificativa } })
  res.json({ status: 'FECHADO', situacoes: dist, comPendencias: !!bloqueios })
}))

router.post('/turmas/:id/reabrir', requireRole('COORDINATOR'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const userId = getUserId(req)
  if (!isCoord(req)) throw httpErr(403, 'Somente ADMIN/COORDINATOR reabrem o diário.')
  const ctx = await turmaDoUsuario(req, String(req.params.id))
  const b = parseBody(z.object({ justificativa: z.string().trim().min(10, 'Justificativa obrigatória (mín. 10 caracteres).'), prazoDias: z.number().int().min(1).max(60).default(7) }), req.body)
  if (ctx.diario.status !== 'FECHADO') throw httpErr(409, 'O diário não está fechado.')
  await prisma.ntDiario.update({ where: { classSectionId: ctx.section.id }, data: { status: 'ABERTO', reabertoEm: new Date(), reabertoPorId: userId, reaberturaMotivo: b.justificativa, regraSnapshot: undefined } })
  await recalcularTurma(tenantId, ctx.section.id)
  const due = new Date(Date.now() + b.prazoDias * 86400000)
  await scheduleReminder({ tenantId, modulo: 'notas', titulo: `Diário reaberto: refazer fechamento de ${ctx.section.nome}`, descricao: b.justificativa, dueAt: due, antecedenciaDias: 2, severity: 'ATENCAO', assigneeUserId: ctx.section.professorUserId, refType: 'NtDiario', refId: ctx.section.id, dedupeKey: `nt-reabertura-${ctx.section.id}` })
  await notify({ tenantId, userId: ctx.section.professorUserId, assunto: 'Diário reaberto', mensagem: `O diário de ${ctx.section.nome} foi reaberto pela coordenação (${b.justificativa}). Prazo para novo fechamento: ${due.toLocaleDateString('pt-BR')}.`, refType: 'ClassSection', refId: ctx.section.id })
  await audit({ tenantId, userId, modulo: 'notas', acao: 'REABRIR_DIARIO', refType: 'ClassSection', refId: ctx.section.id, detalhes: { justificativa: b.justificativa } })
  res.json({ status: 'ABERTO', prazoNovoFechamento: due })
}))

router.patch('/turmas/:id/prazo', requireRole('COORDINATOR', 'SECRETARY'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const ctx = await turmaDoUsuario(req, String(req.params.id))
  const b = parseBody(z.object({ prazoLancamento: z.coerce.date().nullable() }), req.body)
  await prisma.ntDiario.update({ where: { classSectionId: ctx.section.id }, data: { prazoLancamento: b.prazoLancamento } })
  if (b.prazoLancamento) {
    await scheduleReminder({ tenantId, modulo: 'notas', titulo: `Prazo de lançamento de notas — ${ctx.section.nome}`, dueAt: b.prazoLancamento, antecedenciaDias: 3, assigneeUserId: ctx.section.professorUserId, refType: 'NtDiario', refId: ctx.section.id, dedupeKey: `nt-prazo-${ctx.section.id}` })
  }
  await audit({ tenantId, userId: getUserId(req), modulo: 'notas', acao: 'PRAZO_LANCAMENTO', refType: 'ClassSection', refId: ctx.section.id, detalhes: { prazo: b.prazoLancamento } })
  res.json({ prazoLancamento: b.prazoLancamento })
}))

// ---------- Estatísticas, trilha de auditoria e ata ----------

router.get('/turmas/:id/estatisticas', requireRole(...PROF), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const ctx = await turmaDoUsuario(req, String(req.params.id))
  const calc = await calcularTurma(tenantId, ctx)
  const porComponente = ctx.componentes.map((c) => {
    const vals = calc.alunos.map((a) => a.notas.find((n) => n.componenteId === c.id)?.valor).filter((v): v is number => v != null)
    return { componenteId: c.id, codigo: c.codigo, nome: c.nome, lancadas: vals.length, ...estatisticas(vals.map((v) => normalizar(v, { id: c.id, tipo: c.tipo, peso: c.peso, notaMaxima: c.notaMaxima, obrigatorio: c.obrigatorio }, ctx.regra)), ctx.regra.notaMaxima) }
  })
  const situacoes: Record<string, number> = {}
  calc.alunos.forEach((a) => { situacoes[a.resultado.situacao] = (situacoes[a.resultado.situacao] ?? 0) + 1 })
  const finais = calc.alunos.filter((a) => ['APROVADO', 'REPROVADO_NOTA', 'REPROVADO_FREQ'].includes(a.resultado.situacao))
  res.json({
    alunos: calc.alunos.length, situacoes,
    taxaAprovacao: finais.length ? Math.round((finais.filter((a) => a.resultado.situacao === 'APROVADO').length / finais.length) * 1000) / 10 : null,
    mediaParcial: estatisticas(calc.alunos.map((a) => a.resultado.mediaParcial), ctx.regra.notaMaxima),
    mediaFinal: estatisticas(calc.alunos.map((a) => a.resultado.mediaFinal), ctx.regra.notaMaxima),
    frequenciaMedia: (() => { const f = calc.alunos.map((a) => a.frequencia.pct).filter((x): x is number => x != null); return f.length ? Math.round((f.reduce((s, x) => s + x, 0) / f.length) * 10) / 10 : null })(),
    porComponente,
  })
}))

router.get('/turmas/:id/trilha', requireRole(...PROF), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const ctx = await turmaDoUsuario(req, String(req.params.id))
  const { skip, take, page, pageSize } = pageParams(req.query)
  const where: any = { tenantId, classSectionId: ctx.section.id }
  if (qs(req.query.studentId)) where.studentId = qs(req.query.studentId)
  if (qs(req.query.origem)) where.origem = qs(req.query.origem)
  const [items, total] = await Promise.all([
    prisma.ntLancamentoHistorico.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
    prisma.ntLancamentoHistorico.count({ where }),
  ])
  res.json({ items, total, page, pageSize })
}))

router.get('/turmas/:id/ata.html', requireRole(...PROF), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const ctx = await turmaDoUsuario(req, String(req.params.id))
  const [calc, brand, disc] = await Promise.all([
    calcularTurma(tenantId, ctx), getBranding(tenantId),
    prisma.discipline.findFirst({ where: { id: ctx.section.disciplineId, tenantId }, select: { nome: true, cargaHoraria: true } }),
  ])
  const prof = await prisma.user.findUnique({ where: { id: ctx.section.professorUserId }, select: { firstName: true, lastName: true } })
  const cols = ctx.componentes
  const linhas = calc.alunos.map((a, i) => `<tr><td>${i + 1}</td><td>${esc(a.aluno.ra)}</td><td style="text-align:left">${esc(a.aluno.nome)}</td>${cols.map((c) => { const n = a.notas.find((x) => x.componenteId === c.id); return `<td>${n?.ausente ? 'AUS' : n?.valor ?? ''}</td>` }).join('')}<td><b>${a.resultado.mediaFinal ?? ''}</b></td><td>${a.frequencia.pct ?? ''}${a.frequencia.pct != null ? '%' : ''}</td><td>${esc(SITUACAO_LABEL[a.resultado.situacao as Situacao])}</td></tr>`).join('')
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Ata de resultados — ${esc(ctx.section.nome)}</title>
<style>body{font-family:Arial,sans-serif;margin:0;color:#0f172a}main{padding:20px 28px}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #cbd5e1;padding:5px 6px;text-align:center}th{background:${esc(brand.cores.primaria)};color:#fff}.assin{display:flex;gap:60px;margin-top:70px}.assin div{flex:1;border-top:1px solid #000;text-align:center;font-size:12px;padding-top:4px}@media print{@page{size:A4 landscape;margin:12mm}}</style></head><body>
${brandHeaderHtml(brand, { titulo: 'Ata de Resultados Finais — Diário de Classe', subtitulo: `${disc?.nome ?? ''} · Turma ${ctx.section.nome} · CH ${disc?.cargaHoraria ?? ''}h` })}
<main><p style="font-size:12px">Professor(a): <b>${esc(`${prof?.firstName ?? ''} ${prof?.lastName ?? ''}`.trim())}</b> · Diário: <b>${ctx.diario.status}</b>${ctx.diario.fechadoEm ? ' em ' + ctx.diario.fechadoEm.toLocaleDateString('pt-BR') : ''} · Média de aprovação: ${ctx.regra.mediaAprovacao} · Frequência mínima: ${ctx.regra.frequenciaMinima}%</p>
<table><thead><tr><th>#</th><th>RA</th><th>Aluno</th>${cols.map((c) => `<th>${esc(c.codigo)}<br/><small>peso ${c.peso}</small></th>`).join('')}<th>Média final</th><th>Freq.</th><th>Situação</th></tr></thead><tbody>${linhas}</tbody></table>
<div class="assin"><div>${esc(`${prof?.firstName ?? ''} ${prof?.lastName ?? ''}`.trim() || 'Professor(a)')}</div><div>Coordenação</div><div>Secretaria Acadêmica</div></div>
<p style="font-size:10px;color:#64748b;margin-top:24px">Emitido em ${new Date().toLocaleString('pt-BR')}</p></main></body></html>`
  res.type('html').send(html)
}))

export default router
