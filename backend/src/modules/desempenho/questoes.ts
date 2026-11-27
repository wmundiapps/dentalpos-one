import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { parseBody, qs, pageParams } from '../core/crud'
import { audit } from '../core/notify'
import { callAIForJSON, AiUnavailableError } from '../../services-ai/client'
import { MOD, GESTAO, DOCENTE, httpErr } from './common'
import { taxaAcerto, classificarDificuldade, indiceDiscriminacao, avaliarDiscriminacao, letraValida } from './logic'

const router = Router()
const opt = <T extends z.ZodTypeAny>(s: T) => s.optional().nullable()

const alternativaSchema = z.object({ letra: z.string().length(1), texto: z.string().min(1) })
const questaoBase = z.object({
  exameId: z.string(), eixoId: opt(z.string()), disciplineId: opt(z.string()),
  tipo: z.enum(['OBJETIVA', 'DISCURSIVA', 'PECA_PRATICA', 'CASO_CLINICO']).default('OBJETIVA'),
  enunciado: z.string().min(10, 'Enunciado muito curto'),
  alternativas: opt(z.array(alternativaSchema).min(2).max(6)), gabarito: opt(z.string()), comentario: opt(z.string()),
  nivel: z.enum(['FACIL', 'MEDIO', 'DIFICIL']).default('MEDIO'), anoFonte: opt(z.number().int()), fonte: opt(z.string()),
})

// Regras de consistência: objetiva exige alternativas únicas e gabarito dentre elas.
export function validarQuestao(q: { tipo?: string; alternativas?: any; gabarito?: string | null }, exigirGabarito = false) {
  const tipo = q.tipo ?? 'OBJETIVA'
  if (tipo === 'OBJETIVA' || tipo === 'CASO_CLINICO' && q.alternativas?.length) {
    const alts: Array<{ letra: string; texto: string }> = q.alternativas ?? []
    if (alts.length < 2) throw httpErr(400, 'Questão objetiva precisa de ao menos 2 alternativas.')
    const letras = alts.map((a) => a.letra.toUpperCase())
    if (new Set(letras).size !== letras.length) throw httpErr(400, 'Letras de alternativas repetidas.')
    if (!letras.every((l, i) => letraValida(l, alts.length) && l === String.fromCharCode(65 + i))) throw httpErr(400, 'As alternativas devem estar em sequência A, B, C...')
    if (q.gabarito && !letras.includes(q.gabarito.trim().toUpperCase())) throw httpErr(400, 'Gabarito não corresponde a nenhuma alternativa.')
    if (exigirGabarito && !q.gabarito) throw httpErr(400, 'Gabarito obrigatório para revisar/publicar.')
  } else if (exigirGabarito && !q.gabarito) throw httpErr(400, 'Informe o padrão de resposta/gabarito para revisar/publicar.')
}
const normalizar = (d: any) => ({ ...d, gabarito: d.gabarito && d.tipo === 'OBJETIVA' ? d.gabarito.trim().toUpperCase() : d.gabarito, alternativas: d.alternativas?.map((a: any) => ({ letra: a.letra.toUpperCase(), texto: a.texto })) })

async function checarVinculos(tenantId: string, d: { exameId?: string; eixoId?: string | null; disciplineId?: string | null }) {
  if (d.exameId && !(await prisma.desExame.findFirst({ where: { id: d.exameId, tenantId }, select: { id: true } }))) throw httpErr(404, 'Exame não encontrado.')
  if (d.eixoId) {
    const e = await prisma.desEixo.findFirst({ where: { id: d.eixoId, tenantId, ...(d.exameId ? { exameId: d.exameId } : {}) }, select: { id: true } })
    if (!e) throw httpErr(400, 'Eixo/competência não pertence ao exame.')
  }
  if (d.disciplineId && !(await prisma.discipline.findFirst({ where: { id: d.disciplineId, tenantId }, select: { id: true } }))) throw httpErr(404, 'Disciplina não encontrada.')
}

router.get('/questoes', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const { skip, take, page, pageSize } = pageParams(req.query)
  const where: any = { tenantId }
  for (const f of ['exameId', 'eixoId', 'disciplineId', 'status', 'nivel', 'tipo', 'origem']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
  const q = qs(req.query.q)
  if (q) where.enunciado = { contains: q, mode: 'insensitive' }
  const [rows, total] = await Promise.all([prisma.desQuestao.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }), prisma.desQuestao.count({ where })])
  res.json({ items: rows.map((r) => ({ ...r, taxaAcerto: taxaAcerto(r.totalAcertos, r.totalRespostas), dificuldadeObservada: classificarDificuldade(taxaAcerto(r.totalAcertos, r.totalRespostas)) })), total, page, pageSize })
}))

router.get('/questoes/qualidade', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const rows = await prisma.desQuestao.findMany({ where: { tenantId, totalRespostas: { gte: 6 }, status: { not: 'ARQUIVADO' }, ...(qs(req.query.exameId) ? { exameId: qs(req.query.exameId) } : {}) }, take: 500 })
  const items = rows.map((r) => ({ id: r.id, enunciado: r.enunciado.slice(0, 140), taxaAcerto: taxaAcerto(r.totalAcertos, r.totalRespostas), indiceDiscriminacao: r.indiceDiscriminacao, avaliacao: avaliarDiscriminacao(r.indiceDiscriminacao), nivelDeclarado: r.nivel, nivelObservado: classificarDificuldade(taxaAcerto(r.totalAcertos, r.totalRespostas)) }))
  res.json({ suspeitas: items.filter((i) => ['REVISAR_GABARITO', 'FRACA'].includes(i.avaliacao)), nivelDivergente: items.filter((i) => i.nivelObservado && i.nivelObservado !== i.nivelDeclarado), total: items.length })
}))

router.get('/questoes/:id', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const q = await prisma.desQuestao.findFirst({ where: { id: String(req.params.id), tenantId: getTenantId(req) } })
  if (!q) throw httpErr(404, 'Questão não encontrada.')
  const taxa = taxaAcerto(q.totalAcertos, q.totalRespostas)
  res.json({ ...q, taxaAcerto: taxa, dificuldadeObservada: classificarDificuldade(taxa), avaliacaoDiscriminacao: avaliarDiscriminacao(q.indiceDiscriminacao) })
}))

router.post('/questoes', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const d = normalizar(parseBody(questaoBase, req.body))
  await checarVinculos(tenantId, d)
  validarQuestao(d)
  const row = await prisma.desQuestao.create({ data: { ...d, tenantId, status: 'RASCUNHO', origem: 'MANUAL', criadoPorId: getUserId(req) } })
  await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'CRIAR_QUESTAO', refType: 'DesQuestao', refId: row.id })
  res.status(201).json(row)
}))

router.post('/questoes/importar', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(z.object({ questoes: z.array(questaoBase).min(1).max(200) }), req.body)
  let criadas = 0
  const erros: Array<{ indice: number; erro: string }> = []
  for (const [i, raw] of b.questoes.entries()) {
    try {
      const d = normalizar(raw)
      await checarVinculos(tenantId, d); validarQuestao(d)
      await prisma.desQuestao.create({ data: { ...d, tenantId, status: 'RASCUNHO', origem: 'IMPORTADA', criadoPorId: getUserId(req) } })
      criadas++
    } catch (e: any) { erros.push({ indice: i, erro: e.message }) }
  }
  res.status(erros.length && !criadas ? 400 : 201).json({ criadas, erros })
}))

router.patch('/questoes/:id', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const cur = await prisma.desQuestao.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!cur) throw httpErr(404, 'Questão não encontrada.')
  const d = normalizar(parseBody(questaoBase.partial(), req.body))
  // em PATCH parcial o tipo pode não vir no corpo: normaliza o gabarito pelo tipo atual da questão
  if (d.gabarito && d.tipo === undefined && cur.tipo === 'OBJETIVA') d.gabarito = String(d.gabarito).trim().toUpperCase()
  await checarVinculos(tenantId, { exameId: d.exameId ?? cur.exameId, eixoId: d.eixoId === undefined ? cur.eixoId : d.eixoId, disciplineId: d.disciplineId })
  validarQuestao({ tipo: d.tipo ?? cur.tipo, alternativas: d.alternativas ?? cur.alternativas, gabarito: d.gabarito ?? cur.gabarito })
  const mudouConteudo = ['enunciado', 'alternativas', 'gabarito'].some((k) => d[k] !== undefined && JSON.stringify(d[k]) !== JSON.stringify((cur as any)[k]))
  // alterar conteúdo de questão revisada/publicada exige nova revisão
  const status = mudouConteudo && ['REVISADO', 'PUBLICADO'].includes(cur.status) ? 'RASCUNHO' : undefined
  const row = await prisma.desQuestao.update({ where: { id: cur.id }, data: { ...d, ...(status ? { status, revisadoPorId: null, revisadoEm: null } : {}) } })
  await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'ATUALIZAR_QUESTAO', refType: 'DesQuestao', refId: cur.id, detalhes: { voltouParaRascunho: !!status } })
  res.json({ ...row, aviso: status ? 'Conteúdo alterado: a questão voltou para RASCUNHO e precisa de nova revisão.' : undefined })
}))

// Fluxo RASCUNHO -> REVISADO -> PUBLICADO (-> ARQUIVADO). Quem criou não revisa a própria questão (exceto coordenação).
router.post('/questoes/:id/revisar', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const q = await prisma.desQuestao.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!q) throw httpErr(404, 'Questão não encontrada.')
  if (q.status !== 'RASCUNHO') throw httpErr(409, `Só questões em RASCUNHO podem ser revisadas (atual: ${q.status}).`)
  if (q.criadoPorId === getUserId(req) && String(req.user?.role).toUpperCase() === 'TEACHER') throw httpErr(403, 'A revisão deve ser feita por outro docente ou pela coordenação.')
  validarQuestao(q as any, true)
  const row = await prisma.desQuestao.update({ where: { id: q.id }, data: { status: 'REVISADO', revisadoPorId: getUserId(req), revisadoEm: new Date() } })
  await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'REVISAR_QUESTAO', refType: 'DesQuestao', refId: q.id })
  res.json(row)
}))
router.post('/questoes/:id/publicar', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const q = await prisma.desQuestao.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!q) throw httpErr(404, 'Questão não encontrada.')
  if (q.status !== 'REVISADO') throw httpErr(409, 'Só questões REVISADAS podem ser publicadas.')
  if (!q.eixoId) throw httpErr(400, 'Vincule a questão a um eixo/competência antes de publicar.')
  res.json(await prisma.desQuestao.update({ where: { id: q.id }, data: { status: 'PUBLICADO' } }))
}))
router.post('/questoes/:id/arquivar', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const q = await prisma.desQuestao.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!q) throw httpErr(404, 'Questão não encontrada.')
  res.json(await prisma.desQuestao.update({ where: { id: q.id }, data: { status: 'ARQUIVADO' } }))
}))
router.delete('/questoes/:id', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const q = await prisma.desQuestao.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!q) throw httpErr(404, 'Questão não encontrada.')
  const emUso = await prisma.desSimuladoQuestao.count({ where: { tenantId, questaoId: q.id } })
  if (emUso || q.totalRespostas) throw httpErr(409, 'Questão já utilizada em simulado; arquive em vez de excluir.')
  await prisma.desQuestao.delete({ where: { id: q.id } })
  res.status(204).end()
}))

// ---------- Geração por IA (sempre RASCUNHO, revisão humana obrigatória) ----------
const iaSchema = z.object({
  exameId: z.string(), eixoId: z.string(), disciplineId: opt(z.string()), tema: opt(z.string().max(300)),
  quantidade: z.number().int().min(1).max(10).default(5), nivel: z.enum(['FACIL', 'MEDIO', 'DIFICIL']).default('MEDIO'),
  tipo: z.enum(['OBJETIVA', 'DISCURSIVA', 'PECA_PRATICA', 'CASO_CLINICO']).default('OBJETIVA'), numAlternativas: z.number().int().min(4).max(5).default(4),
})
const SAIDA = z.object({ enunciado: z.string().min(10), alternativas: z.array(z.object({ letra: z.string(), texto: z.string() })).optional(), gabarito: z.string().optional(), comentario: z.string().optional() })

router.post('/questoes/gerar-ia', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(iaSchema, req.body)
  await checarVinculos(tenantId, b)
  const [exame, eixo, disc] = await Promise.all([
    prisma.desExame.findFirst({ where: { id: b.exameId, tenantId } }), prisma.desEixo.findFirst({ where: { id: b.eixoId, tenantId } }),
    b.disciplineId ? prisma.discipline.findFirst({ where: { id: b.disciplineId, tenantId } }) : null,
  ])
  const letras = 'ABCDE'.slice(0, b.numAlternativas).split('')
  const objetiva = b.tipo === 'OBJETIVA' || (b.tipo === 'CASO_CLINICO' && true)
  try {
    const system = `Você é elaborador(a) experiente de questões para o exame "${exame!.nome}" no Brasil. Escreva em português do Brasil, no estilo e nível de exigência da banca, com contextualização, linguagem técnica correta e SEM inventar leis, súmulas ou artigos inexistentes. Responda APENAS com JSON válido.`
    const user = `Elabore ${b.quantidade} questão(ões) ${b.tipo}, nível ${b.nivel}, sobre "${eixo!.nome}"${disc ? ` (disciplina ${disc.nome})` : ''}${b.tema ? `, tema: ${b.tema}` : ''}.
${objetiva ? `Cada questão tem ${b.numAlternativas} alternativas (${letras.join(', ')}), apenas uma correta, distratores plausíveis, gabarito (letra) e comentário explicando a correta e por que as demais estão erradas.` : 'Inclua enunciado completo (situação-problema), padrão de resposta esperado em "gabarito" e critérios no "comentario".'}
Formato: {"questoes":[{"enunciado":"...","alternativas":[{"letra":"A","texto":"..."}],"gabarito":"A","comentario":"..."}]}`
    const out = await callAIForJSON<{ questoes: unknown[] }>({ system, user, maxTokens: 4000, ctx: { clinicId: req.user?.clinicId, tenantId, actorId: getUserId(req), referenceType: 'DesQuestao' } })
    const criadas: any[] = []
    const descartadas: string[] = []
    for (const raw of out.questoes ?? []) {
      const p = SAIDA.safeParse(raw)
      if (!p.success) { descartadas.push('formato inválido'); continue }
      const d = normalizar({ ...p.data, tipo: b.tipo })
      try { if (objetiva) { validarQuestao(d, true); if (d.alternativas.length !== b.numAlternativas) throw new Error('nº de alternativas') } } catch (e: any) { descartadas.push(e.message); continue }
      criadas.push(await prisma.desQuestao.create({ data: { tenantId, exameId: b.exameId, eixoId: b.eixoId, disciplineId: b.disciplineId ?? null, tipo: b.tipo, nivel: b.nivel, enunciado: d.enunciado, alternativas: objetiva ? d.alternativas : undefined, gabarito: d.gabarito, comentario: d.comentario, status: 'RASCUNHO', origem: 'IA', fonte: 'Gerada por IA — requer revisão humana', criadoPorId: getUserId(req) } }))
    }
    await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'GERAR_QUESTOES_IA', detalhes: { criadas: criadas.length, descartadas: descartadas.length } })
    res.status(201).json({ ia: true, criadas: criadas.length, descartadas, items: criadas, aviso: 'Questões salvas como RASCUNHO: revise gabarito e conteúdo antes de publicar.' })
  } catch (e) {
    if (!(e instanceof AiUnavailableError)) throw e
    // Fallback sem IA: devolve modelo para preenchimento manual (nada é salvo)
    res.status(200).json({
      ia: false, mensagem: 'IA não configurada: use o modelo abaixo para elaboração manual (POST /questoes).',
      modelo: { exameId: b.exameId, eixoId: b.eixoId, disciplineId: b.disciplineId ?? null, tipo: b.tipo, nivel: b.nivel, enunciado: `[Situação-problema contextualizada sobre ${eixo!.nome}${b.tema ? ' — ' + b.tema : ''}] ... Com base no exposto, assinale a alternativa correta.`, alternativas: objetiva ? letras.map((l) => ({ letra: l, texto: '[preencher]' })) : undefined, gabarito: null, comentario: '[explicar a correta e refutar os distratores]' },
      orientacoes: ['Use caso/situação real e dados atuais', 'Um único comando claro no final do enunciado', 'Distratores plausíveis e de extensão similar', 'Evite "todas as anteriores"'],
    })
  }
}))

// ---------- Estatísticas ----------
export async function recalcularEstatisticas(tenantId: string, exameId?: string, limite = 300) {
  const qs_ = await prisma.desQuestao.findMany({ where: { tenantId, ...(exameId ? { exameId } : {}), status: { in: ['PUBLICADO', 'REVISADO'] } }, select: { id: true }, take: limite })
  const ids = qs_.map((q) => q.id)
  if (!ids.length) return { atualizadas: 0 }
  const [tot, ok] = await Promise.all([
    prisma.desResposta.groupBy({ by: ['questaoId'], where: { tenantId, questaoId: { in: ids }, correta: { not: null }, tentativa: { status: { in: ['ENVIADA', 'EXPIRADA'] } } }, _count: { _all: true } }),
    prisma.desResposta.groupBy({ by: ['questaoId'], where: { tenantId, questaoId: { in: ids }, correta: true, tentativa: { status: { in: ['ENVIADA', 'EXPIRADA'] } } }, _count: { _all: true } }),
  ])
  const mt = new Map(tot.map((t) => [t.questaoId, t._count._all])), mo = new Map(ok.map((t) => [t.questaoId, t._count._all]))
  let atualizadas = 0
  for (const id of ids) {
    const total = mt.get(id) ?? 0
    if (!total) continue
    let disc: number | null = null
    if (total >= 6) {
      const rs = await prisma.desResposta.findMany({ where: { tenantId, questaoId: id, correta: { not: null }, tentativa: { status: { in: ['ENVIADA', 'EXPIRADA'] } } }, select: { correta: true, tentativa: { select: { percentual: true } } } })
      disc = indiceDiscriminacao(rs.map((r) => ({ nota: r.tentativa.percentual ?? 0, acertou: !!r.correta })))
    }
    await prisma.desQuestao.update({ where: { id }, data: { totalRespostas: total, totalAcertos: mo.get(id) ?? 0, indiceDiscriminacao: disc } })
    atualizadas++
  }
  return { atualizadas }
}
router.post('/questoes/recalcular-estatisticas', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  res.json(await recalcularEstatisticas(getTenantId(req), qs(req.body?.exameId)))
}))

export default router
