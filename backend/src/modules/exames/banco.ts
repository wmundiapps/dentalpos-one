import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { parseBody, qs, pageParams } from '../core/crud'
import { audit } from '../core/notify'
import { callAIForJSON, callAIForText, AiUnavailableError } from '../../services-ai/client'
import { aplicarCatalogo } from '../desempenho/catalogo'
import { validarQuestao } from '../desempenho/questoes'
import { MOD, GESTAO, DOCENTE, TODOS, AVISO_AUTORAL, httpErr, isStudent, getConfig, questaoLiberada } from './common'
import { consolidarPerfis, priorizarTemas, embaralharQuestao, validarComentarios, TemaPerfil } from './logic'
import { desempenhoDoAluno } from './analise'

const router = Router()
const opt = <T extends z.ZodTypeAny>(s: T) => s.optional().nullable()

// ---------------------------------------------------------------- visão geral e configuração
router.get('/visao', requireRole(...TODOS), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const cfg = await getConfig(tenantId)
  const exames = await prisma.desExame.findMany({ where: { tenantId, ativo: true, tipo: { in: ['ENADE', 'ENAMED', 'OAB_1FASE', 'OAB_2FASE', 'RESIDENCIA', 'REVALIDA', 'CONCURSO', 'OUTRO'] } }, orderBy: [{ tipo: 'asc' }, { nome: 'asc' }] })
  const ids = exames.map((e) => e.id)
  const [qs_, metas, sims, descs, perfis] = await Promise.all([
    prisma.desQuestao.findMany({ where: { tenantId, exameId: { in: ids }, status: 'PUBLICADO' }, select: { id: true, exameId: true } }),
    prisma.exaQuestaoMeta.findMany({ where: { tenantId }, select: { questaoId: true, revisao: true } }),
    prisma.exaSimulado.groupBy({ by: ['exameId'], where: { tenantId, status: 'PUBLICADO', donoStudentId: null }, _count: { _all: true } }),
    prisma.exaDescritor.groupBy({ by: ['exameId'], where: { tenantId, ativo: true }, _count: { _all: true } }),
    prisma.exaPerfil.groupBy({ by: ['exameId'], where: { tenantId }, _count: { _all: true } }),
  ])
  const rev = new Map(metas.map((m) => [m.questaoId, m.revisao]))
  const nQ = new Map<string, number>()
  for (const q of qs_) if (questaoLiberada({ status: 'PUBLICADO' }, { revisao: rev.get(q.id) ?? 'PENDENTE' }, cfg)) nQ.set(q.exameId, (nQ.get(q.exameId) ?? 0) + 1)
  const m = (g: Array<{ exameId: string; _count: { _all: number } }>) => new Map(g.map((x) => [x.exameId, x._count._all]))
  const mS = m(sims), mD = m(descs), mP = m(perfis)
  res.json({
    aviso: AVISO_AUTORAL,
    config: { revisaoDocenteObrigatoria: cfg.revisaoDocenteObrigatoria, rankingAtivo: cfg.rankingAtivo },
    exames: exames.map((e) => ({ id: e.id, codigo: e.codigo, nome: e.nome, tipo: e.tipo, numQuestoes: e.numQuestoes, duracaoMin: e.duracaoMin, questoes: nQ.get(e.id) ?? 0, simulados: mS.get(e.id) ?? 0, descritores: mD.get(e.id) ?? 0, perfis: mP.get(e.id) ?? 0 })),
  })
}))

router.post('/bootstrap', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const r = await aplicarCatalogo(tenantId)
  await getConfig(tenantId)
  await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'BOOTSTRAP', detalhes: r })
  res.json({ ok: true, ...r })
}))

router.get('/config', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => { res.json(await getConfig(getTenantId(req))) }))
router.put('/config', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(z.object({ revisaoDocenteObrigatoria: z.boolean().optional(), rankingAtivo: z.boolean().optional(), limiteRiscoPct: z.number().min(0).max(100).optional(), metaProntidaoPct: z.number().min(1).max(100).optional() }), req.body)
  await getConfig(tenantId)
  const row = await prisma.exaConfig.update({ where: { tenantId }, data: b })
  await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'ALTERAR_CONFIG', detalhes: b })
  res.json(row)
}))

// ---------------------------------------------------------------- descritores (matriz de referência)
async function exameDoTenant(tenantId: string, exameId: string) {
  const ex = await prisma.desExame.findFirst({ where: { id: exameId, tenantId } })
  if (!ex) throw httpErr(404, 'Exame não encontrado.')
  return ex
}
async function checarEixo(tenantId: string, exameId: string, eixoId?: string | null) {
  if (!eixoId) return
  if (!(await prisma.desEixo.findFirst({ where: { id: eixoId, tenantId, exameId }, select: { id: true } }))) throw httpErr(400, 'Eixo não pertence ao exame.')
}

router.get('/descritores', requireRole(...TODOS), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const where: any = { tenantId, ativo: true }
  for (const f of ['exameId', 'eixoId', 'programId']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
  const rows = await prisma.exaDescritor.findMany({ where, orderBy: [{ exameId: 'asc' }, { ordem: 'asc' }, { codigo: 'asc' }], take: 500 })
  res.json({ items: rows.map((r) => ({ ...r, resumo: undefined, temResumo: !!r.resumo })) })
}))
const descSchema = z.object({ exameId: z.string(), eixoId: opt(z.string()), programId: opt(z.string()), codigo: z.string().min(2).max(40), descricao: z.string().min(10).max(600), resumo: opt(z.string().max(6000)), ordem: z.number().int().optional() })
router.post('/descritores', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const d = parseBody(descSchema, req.body)
  await exameDoTenant(tenantId, d.exameId); await checarEixo(tenantId, d.exameId, d.eixoId)
  if (d.programId && !(await prisma.academicProgram.findFirst({ where: { id: d.programId, tenantId }, select: { id: true } }))) throw httpErr(404, 'Curso não encontrado.')
  const dup = await prisma.exaDescritor.findFirst({ where: { tenantId, exameId: d.exameId, codigo: d.codigo } })
  if (dup) throw httpErr(409, 'Já existe descritor com este código neste exame.')
  const row = await prisma.exaDescritor.create({ data: { ...d, tenantId } })
  await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'CRIAR_DESCRITOR', refType: 'ExaDescritor', refId: row.id })
  res.status(201).json(row)
}))
router.patch('/descritores/:id', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const cur = await prisma.exaDescritor.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!cur) throw httpErr(404, 'Descritor não encontrado.')
  const d = parseBody(descSchema.partial().omit({ exameId: true }).extend({ ativo: z.boolean().optional() }), req.body)
  await checarEixo(tenantId, cur.exameId, d.eixoId)
  res.json(await prisma.exaDescritor.update({ where: { id: cur.id }, data: d }))
}))
router.delete('/descritores/:id', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const cur = await prisma.exaDescritor.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!cur) throw httpErr(404, 'Descritor não encontrado.')
  const emUso = await prisma.exaQuestaoMeta.count({ where: { tenantId, descritorId: cur.id } })
  if (emUso) { await prisma.exaDescritor.update({ where: { id: cur.id }, data: { ativo: false } }); return res.json({ desativado: true, motivo: `${emUso} questão(ões) usam este descritor.` }) }
  await prisma.exaDescritor.delete({ where: { id: cur.id } })
  res.status(204).end()
}))

// Auxílio de IA em conteúdo: material de estudo do descritor (texto autoral + reforço de IA quando houver chave)
router.get('/descritores/:id/estudo', requireRole(...TODOS), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const d = await prisma.exaDescritor.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!d) throw httpErr(404, 'Descritor não encontrado.')
  const [ex, eixo] = await Promise.all([prisma.desExame.findFirst({ where: { id: d.exameId } }), d.eixoId ? prisma.desEixo.findFirst({ where: { id: d.eixoId } }) : null])
  const base = { descritor: { id: d.id, codigo: d.codigo, descricao: d.descricao }, exame: ex?.nome, eixo: eixo?.nome ?? null, resumo: d.resumo ?? null }
  if (qs(req.query.ia) !== '1') return res.json({ ...base, ia: { usada: false } })
  try {
    const texto = await callAIForText({
      system: 'Você é professor(a) de cursinho e prepara estudantes brasileiros para exames de proficiência. Escreva em português do Brasil, de forma didática, SEM inventar leis, súmulas ou dados. Não reproduza questões de provas reais.',
      user: `Faça um roteiro de estudo (máx. 250 palavras, em tópicos) para o descritor "${d.codigo} — ${d.descricao}" do exame "${ex?.nome}"${eixo ? `, eixo "${eixo.nome}"` : ''}. ${d.resumo ? 'Base autoral da instituição: ' + d.resumo : ''} Termine com 3 perguntas de autoavaliação.`,
      maxTokens: 900, ctx: { clinicId: req.user?.clinicId, tenantId, actorId: getUserId(req), referenceType: 'ExaDescritor', referenceId: d.id },
    })
    res.json({ ...base, ia: { usada: true, texto, aviso: 'Texto gerado por IA: confira com o material da disciplina. Não garante o conteúdo da prova real.' } })
  } catch (e) {
    if (!(e instanceof AiUnavailableError)) throw e
    res.json({ ...base, ia: { usada: false, simulada: true, texto: `MODO SIMULADO (IA não configurada). Roteiro mínimo para ${d.codigo}: 1) leia o resumo autoral acima; 2) liste 3 conceitos centrais de "${d.descricao}"; 3) resolva 5 questões do tema no simulado de treino; 4) revise as explicações das alternativas erradas; 5) transforme os erros em flashcards.`, aviso: 'Configure a chave de IA para gerar roteiros personalizados.' } })
  }
}))

// ---------------------------------------------------------------- perfil de prova (padrões por edição/ano)
const temaPerfil = z.object({ tema: z.string().min(2).max(120), eixoCodigo: opt(z.string()), frequenciaPct: z.number().min(0).max(100), nivelPredominante: opt(z.enum(['FACIL', 'MEDIO', 'DIFICIL'])), observacao: opt(z.string().max(300)) })
const perfilSchema = z.object({
  exameId: z.string(), ano: z.number().int().min(1990).max(2100), rotulo: z.string().max(80).default(''), temas: z.array(temaPerfil).min(1).max(60),
  estiloEnunciado: opt(z.string().max(1200)), nivelGeral: opt(z.string().max(120)), fonteDescricao: z.string().min(10).max(600), ilustrativo: z.boolean().default(true),
})
router.get('/perfis', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const exameId = qs(req.query.exameId)
  res.json({ aviso: 'Perfis registram padrões observados (temas recorrentes, estilo, nível). Quando marcados como ilustrativos, são sínteses autorais — não estatísticas oficiais da banca.', items: await prisma.exaPerfil.findMany({ where: { tenantId, ...(exameId ? { exameId } : {}) }, orderBy: [{ exameId: 'asc' }, { ano: 'desc' }] }) })
}))
router.post('/perfis', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const d = parseBody(perfilSchema, req.body)
  await exameDoTenant(tenantId, d.exameId)
  const dup = await prisma.exaPerfil.findFirst({ where: { tenantId, exameId: d.exameId, ano: d.ano, rotulo: d.rotulo } })
  if (dup) throw httpErr(409, 'Já existe perfil para este exame/ano/rótulo.')
  const row = await prisma.exaPerfil.create({ data: { ...d, tenantId, temas: d.temas as any, criadoPorId: getUserId(req) } })
  await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'CRIAR_PERFIL', refType: 'ExaPerfil', refId: row.id })
  res.status(201).json(row)
}))
router.patch('/perfis/:id', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const cur = await prisma.exaPerfil.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!cur) throw httpErr(404, 'Perfil não encontrado.')
  const d = parseBody(perfilSchema.partial().omit({ exameId: true }), req.body)
  res.json(await prisma.exaPerfil.update({ where: { id: cur.id }, data: { ...d, temas: d.temas as any } }))
}))
router.delete('/perfis/:id', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const cur = await prisma.exaPerfil.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!cur) throw httpErr(404, 'Perfil não encontrado.')
  await prisma.exaPerfil.delete({ where: { id: cur.id } })
  res.status(204).end()
}))

export async function recorrenciaDoExame(tenantId: string, exameId: string) {
  const perfis = await prisma.exaPerfil.findMany({ where: { tenantId, exameId } })
  return { perfis: perfis.length, anos: perfis.map((p) => p.ano).sort(), temas: consolidarPerfis(perfis.map((p) => ({ ano: p.ano, temas: p.temas as unknown as TemaPerfil[] }))), ilustrativo: perfis.some((p) => p.ilustrativo) }
}
router.get('/recorrencia', requireRole(...TODOS), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const exameId = qs(req.query.exameId)
  if (!exameId) throw httpErr(400, 'Informe exameId.')
  const tenantId = getTenantId(req)
  await exameDoTenant(tenantId, exameId)
  const r = await recorrenciaDoExame(tenantId, exameId)
  res.json({ ...r, aviso: 'Recorrência histórica não é previsão: temas frequentes podem não aparecer e temas raros podem aparecer.' })
}))

// ---------------------------------------------------------------- questões (banco classificado e comentado)
const altSchema = z.object({ letra: z.string().length(1), texto: z.string().min(1).max(1500) })
const questaoSchema = z.object({
  exameId: z.string(), eixoId: z.string(), tema: z.string().min(2).max(120), descritorId: opt(z.string()), descritorCodigo: opt(z.string()), programId: opt(z.string()),
  tipo: z.enum(['OBJETIVA', 'DISCURSIVA']).default('OBJETIVA'), nivel: z.enum(['FACIL', 'MEDIO', 'DIFICIL']).default('MEDIO'),
  enunciado: z.string().min(20).max(6000), alternativas: opt(z.array(altSchema).min(4).max(5)), gabarito: opt(z.string().max(4000)),
  comentario: opt(z.string().max(3000)), comentarios: opt(z.record(z.string(), z.string().max(1500))),
})

async function resolverDescritor(tenantId: string, exameId: string, d: { descritorId?: string | null; descritorCodigo?: string | null }) {
  if (d.descritorId) {
    const x = await prisma.exaDescritor.findFirst({ where: { id: d.descritorId, tenantId, exameId } })
    if (!x) throw httpErr(400, 'Descritor não pertence ao exame.')
    return x.id
  }
  if (d.descritorCodigo) {
    const x = await prisma.exaDescritor.findFirst({ where: { tenantId, exameId, codigo: d.descritorCodigo } })
    if (!x) throw httpErr(400, `Descritor ${d.descritorCodigo} não existe no exame.`)
    return x.id
  }
  return null
}

function checarConteudo(d: { tipo: string; alternativas?: any; gabarito?: string | null; comentarios?: any }) {
  if (d.tipo === 'OBJETIVA') {
    validarQuestao({ tipo: 'OBJETIVA', alternativas: d.alternativas, gabarito: d.gabarito }, true)
    const erros = validarComentarios(d.alternativas, d.comentarios, false)
    if (erros.length) throw httpErr(400, erros[0])
  } else if (!d.gabarito) throw httpErr(400, 'Informe o espelho (padrão de resposta) da questão discursiva.')
}

router.get('/questoes', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const { skip, take, page, pageSize } = pageParams(req.query)
  const where: any = { tenantId }
  for (const f of ['exameId', 'eixoId', 'nivel', 'status']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
  const metaW: any = {}
  for (const f of ['tema', 'descritorId', 'revisao', 'geradaPor']) { const v = qs((req.query as any)[f]); if (v) metaW[f] = f === 'tema' ? { contains: v, mode: 'insensitive' } : v }
  if (Object.keys(metaW).length) {
    const ids = (await prisma.exaQuestaoMeta.findMany({ where: { tenantId, ...metaW }, select: { questaoId: true }, take: 5000 })).map((m) => m.questaoId)
    where.id = { in: ids }
  } else where.id = { in: (await prisma.exaQuestaoMeta.findMany({ where: { tenantId }, select: { questaoId: true }, take: 20000 })).map((m) => m.questaoId) }
  const q = qs(req.query.q)
  if (q) where.enunciado = { contains: q, mode: 'insensitive' }
  const [rows, total] = await Promise.all([prisma.desQuestao.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }), prisma.desQuestao.count({ where })])
  const metas = await prisma.exaQuestaoMeta.findMany({ where: { tenantId, questaoId: { in: rows.map((r) => r.id) } } })
  const mm = new Map(metas.map((m) => [m.questaoId, m]))
  res.json({ aviso: AVISO_AUTORAL, items: rows.map((r) => ({ ...r, meta: mm.get(r.id) ?? null, taxaAcerto: r.totalRespostas ? Math.round((r.totalAcertos / r.totalRespostas) * 1000) / 10 : null })), total, page, pageSize })
}))

router.get('/questoes/:id', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const q = await prisma.desQuestao.findFirst({ where: { id: String(req.params.id), tenantId } })
  const meta = q ? await prisma.exaQuestaoMeta.findUnique({ where: { questaoId: q.id } }) : null
  if (!q || !meta) throw httpErr(404, 'Questão não encontrada.')
  res.json({ ...q, meta })
}))

router.post('/questoes', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(questaoSchema, req.body)
  await exameDoTenant(tenantId, b.exameId); await checarEixo(tenantId, b.exameId, b.eixoId)
  const descritorId = await resolverDescritor(tenantId, b.exameId, b)
  const gab = b.gabarito && b.tipo === 'OBJETIVA' ? b.gabarito.trim().toUpperCase() : b.gabarito
  const alternativas = b.alternativas?.map((a) => ({ letra: a.letra.toUpperCase(), texto: a.texto }))
  const comentarios = b.comentarios ? Object.fromEntries(Object.entries(b.comentarios).map(([k, v]) => [k.toUpperCase(), v])) : null
  checarConteudo({ tipo: b.tipo, alternativas, gabarito: gab, comentarios })
  const row = await prisma.$transaction(async (tx) => {
    const q = await tx.desQuestao.create({ data: { tenantId, exameId: b.exameId, eixoId: b.eixoId, tipo: b.tipo, nivel: b.nivel, enunciado: b.enunciado, alternativas: alternativas as any, gabarito: gab, comentario: b.comentario ?? null, status: 'RASCUNHO', origem: 'MANUAL', fonte: 'Autoral', criadoPorId: getUserId(req) } })
    const meta = await tx.exaQuestaoMeta.create({ data: { tenantId, questaoId: q.id, tema: b.tema, descritorId, programId: b.programId ?? null, comentarios: comentarios as any, geradaPor: 'MANUAL' } })
    return { ...q, meta }
  })
  await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'CRIAR_QUESTAO', refType: 'DesQuestao', refId: row.id })
  res.status(201).json({ ...row, aviso: 'Questão criada como RASCUNHO: passe pela revisão docente para liberá-la aos alunos.' })
}))

router.patch('/questoes/:id', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const cur = await prisma.desQuestao.findFirst({ where: { id: String(req.params.id), tenantId } })
  const meta = cur ? await prisma.exaQuestaoMeta.findUnique({ where: { questaoId: cur.id } }) : null
  if (!cur || !meta) throw httpErr(404, 'Questão não encontrada.')
  const b = parseBody(questaoSchema.partial().omit({ exameId: true, tipo: true }), req.body)
  if (b.eixoId) await checarEixo(tenantId, cur.exameId, b.eixoId)
  const descritorId = b.descritorId !== undefined || b.descritorCodigo ? await resolverDescritor(tenantId, cur.exameId, b) : undefined
  const alternativas = b.alternativas ? b.alternativas.map((a) => ({ letra: a.letra.toUpperCase(), texto: a.texto })) : (cur.alternativas as any)
  const gabarito = b.gabarito !== undefined && b.gabarito !== null && cur.tipo === 'OBJETIVA' ? b.gabarito.trim().toUpperCase() : (b.gabarito ?? cur.gabarito)
  const comentarios = b.comentarios ? Object.fromEntries(Object.entries(b.comentarios).map(([k, v]) => [k.toUpperCase(), v])) : (meta.comentarios as any)
  checarConteudo({ tipo: cur.tipo, alternativas, gabarito, comentarios })
  const mudou = ['enunciado', 'alternativas', 'gabarito', 'comentarios'].some((k) => (b as any)[k] !== undefined)
  const volta = mudou && ['REVISADO', 'PUBLICADO'].includes(cur.status)
  const [q, m] = await prisma.$transaction([
    prisma.desQuestao.update({ where: { id: cur.id }, data: { eixoId: b.eixoId ?? undefined, nivel: b.nivel ?? undefined, enunciado: b.enunciado ?? undefined, alternativas: alternativas as any, gabarito, comentario: b.comentario === undefined ? undefined : b.comentario, ...(volta ? { status: 'RASCUNHO', revisadoPorId: null, revisadoEm: null } : {}) } }),
    prisma.exaQuestaoMeta.update({ where: { id: meta.id }, data: { tema: b.tema ?? undefined, descritorId, programId: b.programId === undefined ? undefined : b.programId, comentarios: comentarios as any, ...(volta ? { revisao: 'PENDENTE', revisadoPorId: null, revisadoEm: null } : {}) } }),
  ])
  await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'ATUALIZAR_QUESTAO', refType: 'DesQuestao', refId: cur.id, detalhes: { voltouParaRevisao: volta } })
  res.json({ ...q, meta: m, aviso: volta ? 'Conteúdo alterado: a questão voltou para revisão docente.' : undefined })
}))

// Revisão docente: aprovar libera a questão (PUBLICADO); rejeitar a mantém fora dos simulados.
router.post('/questoes/:id/revisao', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(z.object({ decisao: z.enum(['APROVADA', 'REJEITADA']), nota: opt(z.string().max(600)) }), req.body)
  const q = await prisma.desQuestao.findFirst({ where: { id: String(req.params.id), tenantId } })
  const meta = q ? await prisma.exaQuestaoMeta.findUnique({ where: { questaoId: q.id } }) : null
  if (!q || !meta) throw httpErr(404, 'Questão não encontrada.')
  const role = String(req.user?.role).toUpperCase()
  if (role === 'TEACHER' && q.criadoPorId === getUserId(req)) throw httpErr(403, 'A revisão deve ser feita por outro docente ou pela coordenação.')
  if (b.decisao === 'APROVADA') {
    if (!q.eixoId) throw httpErr(400, 'Classifique a questão em um eixo antes de aprovar.')
    if (q.tipo === 'OBJETIVA') {
      validarQuestao(q as any, true)
      const erros = validarComentarios(q.alternativas as any, meta.comentarios as any, true)
      if (erros.length) throw httpErr(400, 'Para aprovar, cada alternativa precisa de explicação: ' + erros.join(' '))
    }
    if (!meta.tema) throw httpErr(400, 'Informe o tema da questão antes de aprovar.')
  }
  const [qq, mm] = await prisma.$transaction([
    prisma.desQuestao.update({ where: { id: q.id }, data: b.decisao === 'APROVADA' ? { status: 'PUBLICADO', revisadoPorId: getUserId(req), revisadoEm: new Date() } : { status: 'RASCUNHO' } }),
    prisma.exaQuestaoMeta.update({ where: { id: meta.id }, data: { revisao: b.decisao, revisadoPorId: getUserId(req), revisadoEm: new Date(), revisaoNota: b.nota ?? null } }),
  ])
  await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: `REVISAO_${b.decisao}`, refType: 'DesQuestao', refId: q.id })
  res.json({ ...qq, meta: mm })
}))

router.post('/questoes/:id/arquivar', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const q = await prisma.desQuestao.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!q) throw httpErr(404, 'Questão não encontrada.')
  res.json(await prisma.desQuestao.update({ where: { id: q.id }, data: { status: 'ARQUIVADO' } }))
}))

// Espelho de questão discursiva (OAB 2ª fase): o aluno só vê depois de tentar responder
router.get('/questoes/:id/espelho', requireRole(...TODOS), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const q = await prisma.desQuestao.findFirst({ where: { id: String(req.params.id), tenantId, tipo: 'DISCURSIVA', status: 'PUBLICADO' } })
  if (!q) throw httpErr(404, 'Questão discursiva não encontrada.')
  res.json({ id: q.id, enunciado: q.enunciado, espelho: q.gabarito, criterios: q.comentario, aviso: 'Espelho autoral para autocorreção. Compare sua resposta, identifique lacunas e registre-as em flashcards.' })
}))
router.get('/discursivas', requireRole(...TODOS), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const exameId = qs(req.query.exameId)
  const rows = await prisma.desQuestao.findMany({ where: { tenantId, tipo: 'DISCURSIVA', status: 'PUBLICADO', ...(exameId ? { exameId } : {}) }, select: { id: true, exameId: true, eixoId: true, enunciado: true, nivel: true }, take: 100 })
  res.json({ items: rows })
}))

// ---------------------------------------------------------------- gerador de questões inspiradas no padrão (IA)
const genSchema = z.object({
  exameId: z.string(), eixoId: z.string(), descritorId: opt(z.string()), perfilAno: opt(z.number().int()), tema: opt(z.string().max(120)),
  quantidade: z.number().int().min(1).max(8).default(3), nivel: z.enum(['FACIL', 'MEDIO', 'DIFICIL']).default('MEDIO'), numAlternativas: z.number().int().min(4).max(5).default(4),
})
const saidaIa = z.object({ tema: z.string().optional(), enunciado: z.string().min(20), alternativas: z.array(altSchema).min(4).max(5), gabarito: z.string().length(1), comentario: z.string().optional(), comentarios: z.record(z.string(), z.string()) })

router.post('/gerar', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(genSchema, req.body)
  const [exame, eixo, cfg] = await Promise.all([exameDoTenant(tenantId, b.exameId), prisma.desEixo.findFirst({ where: { id: b.eixoId, tenantId, exameId: b.exameId } }), getConfig(tenantId)])
  if (!eixo) throw httpErr(400, 'Eixo não pertence ao exame.')
  const descritor = b.descritorId ? await prisma.exaDescritor.findFirst({ where: { id: b.descritorId, tenantId, exameId: b.exameId } }) : null
  if (b.descritorId && !descritor) throw httpErr(400, 'Descritor não pertence ao exame.')
  const rec = await recorrenciaDoExame(tenantId, b.exameId)
  const perfil = await prisma.exaPerfil.findFirst({ where: { tenantId, exameId: b.exameId, ...(b.perfilAno ? { ano: b.perfilAno } : {}) }, orderBy: { ano: 'desc' } })
  const temasEixo = rec.temas.filter((t) => !t.eixoCodigo || t.eixoCodigo === eixo.codigo).slice(0, 5)
  const tema = b.tema?.trim() || temasEixo[0]?.tema || eixo.nome
  // Publicação automática só quando a instituição desligou a revisão obrigatória; mesmo assim fica marcada como NÃO revisada.
  const liberarDireto = !cfg.revisaoDocenteObrigatoria
  const letras = 'ABCDE'.slice(0, b.numAlternativas).split('')

  const gravar = async (d: { tema: string; enunciado: string; alternativas: any[]; gabarito: string; comentario?: string; comentarios: Record<string, string> }, geradaPor: 'IA' | 'IA_SIMULADA') => {
    const com = Object.fromEntries(Object.entries(d.comentarios).map(([k, v]) => [k.toUpperCase(), v]))
    return prisma.$transaction(async (tx) => {
      const q = await tx.desQuestao.create({ data: { tenantId, exameId: b.exameId, eixoId: b.eixoId, tipo: 'OBJETIVA', nivel: b.nivel, enunciado: d.enunciado, alternativas: d.alternativas as any, gabarito: d.gabarito.toUpperCase(), comentario: d.comentario ?? null, status: liberarDireto ? 'PUBLICADO' : 'RASCUNHO', origem: 'IA', fonte: geradaPor === 'IA' ? 'Gerada por IA (autoral, inspirada em padrões) — não é questão de prova real' : 'Variação simulada (sem IA) de questão autoral', criadoPorId: getUserId(req) } })
      const meta = await tx.exaQuestaoMeta.create({ data: { tenantId, questaoId: q.id, tema: d.tema, descritorId: descritor?.id ?? null, comentarios: com as any, geradaPor, perfilId: perfil?.id ?? null, revisao: 'PENDENTE' } })
      return { ...q, meta }
    })
  }

  try {
    const padrao = temasEixo.map((t) => `${t.tema} (~${t.frequenciaMedia}% das questões, recorrência ${t.recorrencia})`).join('; ') || 'sem perfil cadastrado'
    const system = `Você é elaborador(a) experiente de questões para o exame "${exame.nome}" no Brasil. Elabore questões ORIGINAIS e inéditas, inspiradas apenas no padrão de dificuldade, estrutura e temas recorrentes informados. É PROIBIDO reproduzir ou parafrasear de perto questões de provas reais ou materiais protegidos. Não invente leis, artigos, súmulas ou dados. Português do Brasil. Responda APENAS com JSON válido.`
    const user = `Eixo: ${eixo.nome}. Tema: ${tema}. ${descritor ? `Descritor: ${descritor.codigo} — ${descritor.descricao}.` : ''} Nível: ${b.nivel}.
Padrão observado (resumo): temas recorrentes: ${padrao}. Estilo do enunciado: ${perfil?.estiloEnunciado ?? 'situação-problema contextualizada com comando objetivo'}.
Elabore ${b.quantidade} questão(ões) objetivas com ${b.numAlternativas} alternativas (${letras.join(', ')}), uma correta, distratores plausíveis, e explique CADA alternativa (por que está certa ou errada).
Formato: {"questoes":[{"tema":"...","enunciado":"...","alternativas":[{"letra":"A","texto":"..."}],"gabarito":"A","comentario":"...","comentarios":{"A":"...","B":"..."}}]}`
    const out = await callAIForJSON<{ questoes: unknown[] }>({ system, user, maxTokens: 5000, ctx: { clinicId: req.user?.clinicId, tenantId, actorId: getUserId(req), referenceType: 'ExaGerador' } })
    const criadas: any[] = [], descartadas: string[] = []
    for (const raw of out.questoes ?? []) {
      const p = saidaIa.safeParse(raw)
      if (!p.success) { descartadas.push('formato inválido'); continue }
      try {
        validarQuestao({ tipo: 'OBJETIVA', alternativas: p.data.alternativas, gabarito: p.data.gabarito }, true)
        const erros = validarComentarios(p.data.alternativas, p.data.comentarios, true)
        if (erros.length) throw new Error(erros[0])
        if (p.data.alternativas.length !== b.numAlternativas) throw new Error('nº de alternativas')
      } catch (e: any) { descartadas.push(e.message); continue }
      criadas.push(await gravar({ ...p.data, tema: p.data.tema?.trim() || tema }, 'IA'))
    }
    await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'GERAR_QUESTOES_IA', detalhes: { criadas: criadas.length, descartadas: descartadas.length } })
    return res.status(201).json({ ia: true, simulada: false, criadas: criadas.length, descartadas, items: criadas, aviso: AVISO_AUTORAL + (liberarDireto ? ' Revisão docente obrigatória está DESLIGADA: as questões ficam visíveis aos alunos marcadas como não revisadas.' : ' As questões aguardam revisão docente.') })
  } catch (e) {
    if (!(e instanceof AiUnavailableError)) throw e
  }

  // IA não configurada -> modo simulado: variações (alternativas reembaralhadas) de questões autorais do mesmo eixo/tema.
  const candidatas = await prisma.desQuestao.findMany({ where: { tenantId, exameId: b.exameId, eixoId: b.eixoId, tipo: 'OBJETIVA', status: 'PUBLICADO', origem: 'MANUAL' }, take: 60 })
  const metas = await prisma.exaQuestaoMeta.findMany({ where: { tenantId, questaoId: { in: candidatas.map((c) => c.id) } } })
  const mm = new Map(metas.map((m) => [m.questaoId, m]))
  const usaveis = candidatas.filter((c) => mm.get(c.id)?.comentarios && (c.alternativas as any[])?.length === b.numAlternativas)
  usaveis.sort((x, y) => Number((mm.get(y.id)?.tema ?? '').toLowerCase() === tema.toLowerCase()) - Number((mm.get(x.id)?.tema ?? '').toLowerCase() === tema.toLowerCase()))
  if (!usaveis.length) {
    return res.status(200).json({ ia: false, simulada: true, criadas: 0, items: [], mensagem: 'IA não configurada e não há questões-base do eixo para variar. Cadastre questões ou configure a chave de IA.', aviso: AVISO_AUTORAL })
  }
  const criadas: any[] = []
  for (let i = 0; i < Math.min(b.quantidade, usaveis.length); i++) {
    const base = usaveis[i], bm = mm.get(base.id)!
    const v = embaralharQuestao({ alternativas: base.alternativas as any, gabarito: base.gabarito as string, comentarios: bm.comentarios as any }, Date.now() + i * 7919)
    criadas.push(await gravar({ tema: bm.tema ?? tema, enunciado: base.enunciado, alternativas: v.alternativas, gabarito: v.gabarito, comentario: base.comentario ?? undefined, comentarios: v.comentarios }, 'IA_SIMULADA'))
  }
  await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'GERAR_QUESTOES_SIMULADO', detalhes: { criadas: criadas.length } })
  res.status(201).json({ ia: false, simulada: true, criadas: criadas.length, items: criadas, aviso: 'MODO SIMULADO: sem chave de IA, as questões são variações (alternativas reembaralhadas) de questões autorais já cadastradas. Configure a IA para gerar questões novas. ' + AVISO_AUTORAL })
}))

// ---------------------------------------------------------------- sugestões: temas com maior chance de recorrência x lacuna do aluno
router.get('/sugestoes', requireRole(...TODOS), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const exameId = qs(req.query.exameId)
  if (!exameId) throw httpErr(400, 'Informe exameId.')
  await exameDoTenant(tenantId, exameId)
  const cfg = await getConfig(tenantId)
  const rec = await recorrenciaDoExame(tenantId, exameId)
  const acerto = new Map<string, number | null>()
  if (isStudent(req) && req.user?.studentId) {
    const d = await desempenhoDoAluno(tenantId, req.user.studentId, exameId)
    for (const t of d.porTema) acerto.set(t.tema.trim().toLowerCase(), t.percentual)
  }
  const qs_ = await prisma.desQuestao.findMany({ where: { tenantId, exameId, status: 'PUBLICADO', tipo: 'OBJETIVA' }, select: { id: true } })
  const metas = await prisma.exaQuestaoMeta.findMany({ where: { tenantId, questaoId: { in: qs_.map((q) => q.id) } }, select: { tema: true, revisao: true } })
  const disp = new Map<string, number>()
  for (const m of metas) if (m.tema && questaoLiberada({ status: 'PUBLICADO' }, m, cfg)) disp.set(m.tema.trim().toLowerCase(), (disp.get(m.tema.trim().toLowerCase()) ?? 0) + 1)
  const temas = priorizarTemas(rec.temas, acerto).slice(0, 12).map((t) => ({ ...t, questoesDisponiveis: disp.get(t.tema.trim().toLowerCase()) ?? 0 }))
  res.json({ exameId, personalizado: acerto.size > 0, temas, anosAnalisados: rec.anos, ilustrativo: rec.ilustrativo, aviso: 'Sugestões baseiam-se na recorrência de temas em edições anteriores e no seu desempenho. Não são previsão da prova real; a IA não garante o conteúdo do exame oficial.' })
}))

export default router
