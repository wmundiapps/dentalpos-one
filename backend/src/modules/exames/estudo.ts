import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { parseBody, qs } from '../core/crud'
import { audit } from '../core/notify'
import { callAIForJSON, AiUnavailableError } from '../../services-ai/client'
import { MOD, GESTAO, DOCENTE, TODOS, httpErr, isStudent, requireStudentId, getConfig, cursosDoAluno } from './common'
import { proximaRevisaoSM2, consolidarPerfis, TemaPerfil } from './logic'
import { desempenhoDoAluno } from './analise'

const router = Router()
const opt = <T extends z.ZodTypeAny>(s: T) => s.optional().nullable()
const cortar = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s)

// ---------------------------------------------------------------- flashcards
/** Cria (ou reabre) cartões das questões erradas: frente = pergunta, verso = gabarito + explicação por alternativa. */
export async function gerarCartoesDeErros(tenantId: string, studentId: string, exameId: string, erradas: Array<{ q: any; meta: any; marcada: string | null }>) {
  let criados = 0
  for (const e of erradas) {
    const alts: Array<{ letra: string; texto: string }> = e.q.alternativas ?? []
    if (e.q.tipo !== 'OBJETIVA' || !alts.length) continue
    const com: Record<string, string> = e.meta?.comentarios ?? {}
    const certa = alts.find((a) => a.letra === e.q.gabarito)
    const verso = [`Gabarito: ${e.q.gabarito}) ${certa?.texto ?? ''}`, com[e.q.gabarito] ? `Por quê: ${com[e.q.gabarito]}` : e.q.comentario ? `Por quê: ${e.q.comentario}` : '', e.marcada && com[e.marcada] ? `Seu erro (${e.marcada}): ${com[e.marcada]}` : ''].filter(Boolean).join('\n')
    const frente = `${e.meta?.tema ? `[${e.meta.tema}] ` : ''}${cortar(e.q.enunciado, 420)}`
    const ja = await prisma.exaFlashcard.findFirst({ where: { tenantId, studentId, questaoId: e.q.id } })
    if (ja) { await prisma.exaFlashcard.update({ where: { id: ja.id }, data: { proximaRevisao: new Date(), repeticoes: 0, intervalo: 0 } }); continue }
    await prisma.exaFlashcard.create({ data: { tenantId, studentId, exameId, eixoId: e.q.eixoId, questaoId: e.q.id, tema: e.meta?.tema ?? null, frente, verso, origem: 'ERRO' } })
    criados++
  }
  return criados
}

router.get('/flashcards', requireRole('STUDENT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const studentId = requireStudentId(req)
  const exameId = qs(req.query.exameId), tema = qs(req.query.tema)
  const rows = await prisma.exaFlashcard.findMany({ where: { tenantId, studentId, ...(exameId ? { exameId } : {}), ...(tema ? { tema: { contains: tema, mode: 'insensitive' } } : {}) }, orderBy: { proximaRevisao: 'asc' }, take: 500 })
  const agora = Date.now()
  res.json({ total: rows.length, paraHoje: rows.filter((r) => r.proximaRevisao.getTime() <= agora).length, items: rows })
}))
router.get('/flashcards/hoje', requireRole('STUDENT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const studentId = requireStudentId(req)
  const exameId = qs(req.query.exameId)
  const where = { tenantId, studentId, proximaRevisao: { lte: new Date() }, ...(exameId ? { exameId } : {}) }
  const [items, total] = await Promise.all([prisma.exaFlashcard.findMany({ where, orderBy: { proximaRevisao: 'asc' }, take: 30 }), prisma.exaFlashcard.count({ where })])
  res.json({ total, items })
}))
router.get('/flashcards/modelos', requireRole(...TODOS), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const exameId = qs(req.query.exameId)
  const rows = await prisma.exaFlashcard.findMany({ where: { tenantId, studentId: null, ...(exameId ? { exameId } : {}) }, orderBy: [{ tema: 'asc' }, { createdAt: 'asc' }], take: 500 })
  const adotados = req.user?.studentId ? new Set((await prisma.exaFlashcard.findMany({ where: { tenantId, studentId: req.user.studentId, modeloId: { in: rows.map((r) => r.id) } }, select: { modeloId: true } })).map((a) => a.modeloId)) : new Set()
  res.json({ items: rows.map((r) => ({ id: r.id, exameId: r.exameId, eixoId: r.eixoId, tema: r.tema, frente: r.frente, verso: r.verso, adotado: adotados.has(r.id) })) })
}))
router.post('/flashcards/modelos', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(z.object({ exameId: z.string(), eixoId: opt(z.string()), tema: z.string().min(2).max(120), frente: z.string().min(3).max(800), verso: z.string().min(3).max(1500) }), req.body)
  if (!(await prisma.desExame.findFirst({ where: { id: b.exameId, tenantId }, select: { id: true } }))) throw httpErr(404, 'Exame não encontrado.')
  const row = await prisma.exaFlashcard.create({ data: { tenantId, studentId: null, exameId: b.exameId, eixoId: b.eixoId ?? null, tema: b.tema, frente: b.frente, verso: b.verso, origem: 'MODELO', criadoPorId: getUserId(req) } })
  res.status(201).json(row)
}))
router.post('/flashcards', requireRole('STUDENT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(z.object({ exameId: opt(z.string()), tema: opt(z.string().max(120)), frente: z.string().min(3).max(800), verso: z.string().min(1).max(1500) }), req.body)
  const row = await prisma.exaFlashcard.create({ data: { tenantId, studentId: requireStudentId(req), exameId: b.exameId ?? null, tema: b.tema ?? null, frente: b.frente, verso: b.verso, origem: 'MANUAL' } })
  res.status(201).json(row)
}))
router.post('/flashcards/adotar', requireRole('STUDENT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const studentId = requireStudentId(req)
  const b = parseBody(z.object({ exameId: opt(z.string()), tema: opt(z.string()), ids: z.array(z.string()).max(200).optional() }), req.body)
  const modelos = await prisma.exaFlashcard.findMany({ where: { tenantId, studentId: null, ...(b.exameId ? { exameId: b.exameId } : {}), ...(b.tema ? { tema: { equals: b.tema, mode: 'insensitive' } } : {}), ...(b.ids ? { id: { in: b.ids } } : {}) }, take: 300 })
  const jaTem = new Set((await prisma.exaFlashcard.findMany({ where: { tenantId, studentId, modeloId: { in: modelos.map((m) => m.id) } }, select: { modeloId: true } })).map((x) => x.modeloId))
  const novos = modelos.filter((m) => !jaTem.has(m.id))
  if (novos.length) await prisma.exaFlashcard.createMany({ data: novos.map((m) => ({ tenantId, studentId, exameId: m.exameId, eixoId: m.eixoId, tema: m.tema, frente: m.frente, verso: m.verso, origem: 'MODELO' as const, modeloId: m.id })) })
  res.status(201).json({ adotados: novos.length, jaExistiam: modelos.length - novos.length })
}))
// Gera cartões a partir do que o aluno errou e dos temas fracos
router.post('/flashcards/gerar', requireRole('STUDENT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const studentId = requireStudentId(req)
  const b = parseBody(z.object({ exameId: z.string() }), req.body)
  const cfg = await getConfig(tenantId)
  const d = await desempenhoDoAluno(tenantId, studentId, b.exameId)
  if (!d.sessoes.length) throw httpErr(422, 'Faça ao menos um simulado ou treino para gerar cartões a partir dos seus erros.')
  // 1) questões erradas nas últimas sessões
  const sims = await prisma.exaSimulado.findMany({ where: { tenantId, id: { in: d.sessoes.slice(-10).map((s) => s.simuladoId) } }, select: { id: true, questaoIds: true } })
  const ms = new Map(sims.map((s) => [s.id, s.questaoIds as string[]]))
  const ids = [...new Set([...ms.values()].flat())]
  const [qs_, metas] = await Promise.all([prisma.desQuestao.findMany({ where: { tenantId, id: { in: ids } } }), prisma.exaQuestaoMeta.findMany({ where: { tenantId, questaoId: { in: ids } } })])
  const mq = new Map(qs_.map((q) => [q.id, q])), mm = new Map(metas.map((m) => [m.questaoId, m]))
  const erradas = new Map<string, string | null>()
  for (const s of d.sessoes.slice(-10)) for (const q of ms.get(s.simuladoId) ?? []) { const marcada = (s.respostas as any)?.[q] ?? null; if (marcada === mq.get(q)?.gabarito) erradas.delete(q); else erradas.set(q, marcada) }
  const deErros = await gerarCartoesDeErros(tenantId, studentId, b.exameId, [...erradas.entries()].filter(([id]) => mq.has(id)).map(([id, marcada]) => ({ q: mq.get(id), meta: mm.get(id), marcada })))
  // 2) temas fracos -> cartão-resumo do tema
  let deTemas = 0
  for (const t of d.porTema.filter((x) => x.total >= 2 && (x.percentual ?? 0) < cfg.metaProntidaoPct)) {
    const ja = await prisma.exaFlashcard.findFirst({ where: { tenantId, studentId, exameId: b.exameId, tema: t.tema, origem: 'TEMA_FRACO' } })
    if (ja) continue
    const doTema = [...mq.values()].filter((q) => (mm.get(q.id)?.tema ?? '').toLowerCase() === t.tema.toLowerCase() && q.tipo === 'OBJETIVA').slice(0, 2)
    const pontos = doTema.map((q) => { const c = (mm.get(q.id)?.comentarios as any) ?? {}; return c[q.gabarito as string] ?? q.comentario }).filter(Boolean)
    if (!pontos.length) continue
    await prisma.exaFlashcard.create({ data: { tenantId, studentId, exameId: b.exameId, tema: t.tema, origem: 'TEMA_FRACO', frente: `Tema fraco (${t.percentual}% de acerto): quais são os pontos-chave de "${t.tema}"?`, verso: pontos.join('\n') } })
    deTemas++
  }
  res.status(201).json({ criadosDeErros: deErros, criadosDeTemasFracos: deTemas })
}))
router.post('/flashcards/:id/revisar', requireRole('STUDENT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(z.object({ qualidade: z.number().int().min(0).max(5) }), req.body)
  const c = await prisma.exaFlashcard.findFirst({ where: { id: String(req.params.id), tenantId, studentId: requireStudentId(req) } })
  if (!c) throw httpErr(404, 'Cartão não encontrado.')
  const n = proximaRevisaoSM2(b.qualidade, c)
  res.json(await prisma.exaFlashcard.update({ where: { id: c.id }, data: { ...n, ultimaRevisao: new Date() } }))
}))
router.delete('/flashcards/:id', requireRole('STUDENT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const r = await prisma.exaFlashcard.deleteMany({ where: { id: String(req.params.id), tenantId, studentId: requireStudentId(req) } })
  if (!r.count) throw httpErr(404, 'Cartão não encontrado.')
  res.status(204).end()
}))

// ---------------------------------------------------------------- trilhas de estudo
const etapaSchema = z.object({ ordem: z.number().int().min(1).max(60), titulo: z.string().min(2).max(160), eixoId: opt(z.string()), descritorIds: opt(z.array(z.string()).max(12)), tema: opt(z.string().max(120)), qtdQuestoes: opt(z.number().int().min(0).max(80)), orientacao: opt(z.string().max(900)) })
const trilhaSchema = z.object({ exameId: z.string(), programId: opt(z.string()), titulo: z.string().min(3).max(160), descricao: opt(z.string().max(800)), area: opt(z.string().max(120)), etapas: z.array(etapaSchema).min(1).max(40) })

function validarOrdens(etapas: Array<{ ordem: number }>) {
  const o = etapas.map((e) => e.ordem)
  if (new Set(o).size !== o.length) throw httpErr(400, 'Há etapas com a mesma ordem.')
}
async function checarTrilha(tenantId: string, d: { exameId: string; programId?: string | null; etapas: Array<{ eixoId?: string | null; descritorIds?: string[] | null }> }) {
  if (!(await prisma.desExame.findFirst({ where: { id: d.exameId, tenantId }, select: { id: true } }))) throw httpErr(404, 'Exame não encontrado.')
  if (d.programId && !(await prisma.academicProgram.findFirst({ where: { id: d.programId, tenantId }, select: { id: true } }))) throw httpErr(404, 'Curso não encontrado.')
  const eixoIds = [...new Set(d.etapas.map((e) => e.eixoId).filter(Boolean) as string[])]
  if (eixoIds.length && (await prisma.desEixo.count({ where: { tenantId, id: { in: eixoIds } } })) !== eixoIds.length) throw httpErr(400, 'Eixo inexistente em alguma etapa.')
  const dIds = [...new Set(d.etapas.flatMap((e) => e.descritorIds ?? []))]
  if (dIds.length && (await prisma.exaDescritor.count({ where: { tenantId, id: { in: dIds } } })) !== dIds.length) throw httpErr(400, 'Descritor inexistente em alguma etapa.')
}

router.post('/trilhas', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(trilhaSchema, req.body)
  validarOrdens(b.etapas); await checarTrilha(tenantId, b)
  const row = await prisma.exaTrilha.create({ data: { tenantId, exameId: b.exameId, programId: b.programId ?? null, titulo: b.titulo, descricao: b.descricao ?? null, area: b.area ?? null, etapas: [...b.etapas].sort((a, c) => a.ordem - c.ordem) as any, criadoPorId: getUserId(req) } })
  await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'CRIAR_TRILHA', refType: 'ExaTrilha', refId: row.id })
  res.status(201).json(row)
}))

// Gera trilha a partir da matriz (eixos por peso + descritores + temas recorrentes). IA só reforça as orientações.
router.post('/trilhas/gerar', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(z.object({ exameId: z.string(), programId: opt(z.string()), titulo: opt(z.string().max(160)), area: opt(z.string().max(120)), maxEtapas: z.number().int().min(2).max(20).default(8) }), req.body)
  const ex = await prisma.desExame.findFirst({ where: { id: b.exameId, tenantId } })
  if (!ex) throw httpErr(404, 'Exame não encontrado.')
  if (b.programId && !(await prisma.academicProgram.findFirst({ where: { id: b.programId, tenantId }, select: { id: true } }))) throw httpErr(404, 'Curso não encontrado.')
  const [eixos, descs, perfis] = await Promise.all([
    prisma.desEixo.findMany({ where: { tenantId, exameId: b.exameId, ativo: true }, orderBy: [{ peso: 'desc' }, { ordem: 'asc' }] }),
    prisma.exaDescritor.findMany({ where: { tenantId, exameId: b.exameId, ativo: true, ...(b.programId ? { OR: [{ programId: null }, { programId: b.programId }] } : {}) } }),
    prisma.exaPerfil.findMany({ where: { tenantId, exameId: b.exameId } }),
  ])
  if (!eixos.length) throw httpErr(422, 'O exame não tem eixos/áreas cadastrados.')
  const rec = consolidarPerfis(perfis.map((p) => ({ ano: p.ano, temas: p.temas as unknown as TemaPerfil[] })))
  const etapas: any[] = eixos.slice(0, b.maxEtapas).map((e, i) => {
    const dd = descs.filter((d) => d.eixoId === e.id)
    const tema = rec.find((t) => t.eixoCodigo === e.codigo)?.tema ?? null
    return { ordem: i + 1, titulo: `Estudar: ${e.nome}`, eixoId: e.id, descritorIds: dd.map((d) => d.id).slice(0, 8), tema, qtdQuestoes: Math.max(5, Math.round(e.peso) + 3), orientacao: `Leia os descritores${dd.length ? ' (' + dd.map((d) => d.codigo).join(', ') + ')' : ''}, resolva as questões do eixo e revise as explicações das alternativas erradas.${tema ? ` Tema recorrente: ${tema}.` : ''}` }
  })
  let ia = false
  try {
    const out = await callAIForJSON<{ orientacoes: string[] }>({
      system: 'Você é coordenador(a) pedagógico(a) de cursinho. Escreva orientações curtas (máx. 40 palavras cada) em português do Brasil, sem inventar leis ou dados e sem citar questões de provas reais. Responda só JSON.',
      user: `Exame: ${ex.nome}. Etapas: ${etapas.map((e, i) => `${i + 1}) ${e.titulo}${e.tema ? ' (tema: ' + e.tema + ')' : ''}`).join('; ')}. Responda {"orientacoes":["..."]} com uma orientação de estudo por etapa, na mesma ordem.`,
      maxTokens: 1500, ctx: { clinicId: req.user?.clinicId, tenantId, actorId: getUserId(req), referenceType: 'ExaTrilha' },
    })
    if (Array.isArray(out.orientacoes)) { out.orientacoes.slice(0, etapas.length).forEach((o, i) => { if (typeof o === 'string' && o.trim()) etapas[i].orientacao = o.trim().slice(0, 900) }); ia = true }
  } catch (e) { if (!(e instanceof AiUnavailableError)) console.error('[exames] trilha IA', e) }
  const row = await prisma.exaTrilha.create({ data: { tenantId, exameId: b.exameId, programId: b.programId ?? null, titulo: b.titulo ?? `Trilha ${ex.nome}${b.area ? ' — ' + b.area : ''}`, area: b.area ?? null, descricao: 'Gerada a partir da matriz de referência (eixos por peso, descritores e temas recorrentes).', etapas: etapas as any, geradaPorIa: ia, criadoPorId: getUserId(req) } })
  await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'GERAR_TRILHA', refType: 'ExaTrilha', refId: row.id, detalhes: { ia } })
  res.status(201).json({ ...row, aviso: ia ? 'Orientações redigidas com apoio de IA: revise antes de divulgar.' : 'Gerada sem IA (modo simulado): orientações padrão a partir da matriz.' })
}))

router.get('/trilhas', requireRole(...TODOS), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const exameId = qs(req.query.exameId), programId = qs(req.query.programId)
  const aluno = isStudent(req)
  let rows = await prisma.exaTrilha.findMany({ where: { tenantId, ...(aluno ? { ativo: true } : {}), ...(exameId ? { exameId } : {}), ...(programId ? { programId } : {}) }, orderBy: { createdAt: 'desc' }, take: 200 })
  let prog = new Map<string, number>()
  if (aluno) {
    const studentId = requireStudentId(req)
    const cur = await cursosDoAluno(tenantId, studentId)
    rows = rows.filter((t) => !t.programId || cur.includes(t.programId))
    const p = await prisma.exaTrilhaProgresso.groupBy({ by: ['trilhaId'], where: { tenantId, studentId, trilhaId: { in: rows.map((r) => r.id) } }, _count: { _all: true } })
    prog = new Map(p.map((x) => [x.trilhaId, x._count._all]))
  }
  res.json({ items: rows.map((t) => ({ id: t.id, exameId: t.exameId, programId: t.programId, titulo: t.titulo, descricao: t.descricao, area: t.area, ativo: t.ativo, geradaPorIa: t.geradaPorIa, totalEtapas: (t.etapas as any[]).length, etapasConcluidas: aluno ? prog.get(t.id) ?? 0 : undefined })) })
}))

router.get('/trilhas/:id', requireRole(...TODOS), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const t = await prisma.exaTrilha.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!t) throw httpErr(404, 'Trilha não encontrada.')
  const etapas = t.etapas as any[]
  const cfg = await getConfig(tenantId)
  const descs = await prisma.exaDescritor.findMany({ where: { tenantId, id: { in: [...new Set(etapas.flatMap((e) => e.descritorIds ?? []))] } }, select: { id: true, codigo: true, descricao: true } })
  const eixos = await prisma.desEixo.findMany({ where: { tenantId, id: { in: [...new Set(etapas.map((e) => e.eixoId).filter(Boolean))] } }, select: { id: true, nome: true } })
  const dm = new Map(descs.map((d) => [d.id, d])), em = new Map(eixos.map((e) => [e.id, e.nome]))
  let feitas = new Set<number>()
  let d: Awaited<ReturnType<typeof desempenhoDoAluno>> | null = null
  if (isStudent(req)) {
    const studentId = requireStudentId(req)
    feitas = new Set((await prisma.exaTrilhaProgresso.findMany({ where: { tenantId, trilhaId: t.id, studentId } })).map((p) => p.ordem))
    d = await desempenhoDoAluno(tenantId, studentId, t.exameId)
  }
  let proxima = true
  const out = etapas.sort((a, b) => a.ordem - b.ordem).map((e) => {
    const acerto = d ? (e.eixoId ? d.porEixo.find((x) => x.eixoId === e.eixoId)?.percentual : e.tema ? d.porTema.find((x) => x.tema.toLowerCase() === String(e.tema).toLowerCase())?.percentual : null) ?? null : null
    const concluida = feitas.has(e.ordem)
    const atual = !concluida && proxima && isStudent(req)
    if (!concluida) proxima = false
    return { ...e, eixo: e.eixoId ? em.get(e.eixoId) ?? null : null, descritores: (e.descritorIds ?? []).map((i: string) => dm.get(i)).filter(Boolean), concluida, atual, acertoAtual: acerto, abaixoDaMeta: acerto != null ? acerto < cfg.metaProntidaoPct : null }
  })
  res.json({ ...t, etapas: out, progressoPct: etapas.length && isStudent(req) ? Math.round((feitas.size / etapas.length) * 100) : undefined })
}))

router.patch('/trilhas/:id', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const cur = await prisma.exaTrilha.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!cur) throw httpErr(404, 'Trilha não encontrada.')
  const b = parseBody(trilhaSchema.partial().omit({ exameId: true }).extend({ ativo: z.boolean().optional() }), req.body)
  if (b.etapas) { validarOrdens(b.etapas); await checarTrilha(tenantId, { exameId: cur.exameId, programId: b.programId, etapas: b.etapas }) }
  res.json(await prisma.exaTrilha.update({ where: { id: cur.id }, data: { ...b, etapas: b.etapas ? ([...b.etapas].sort((a, c) => a.ordem - c.ordem) as any) : undefined } }))
}))

router.post('/trilhas/:id/etapas/:ordem/concluir', requireRole('STUDENT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const studentId = requireStudentId(req)
  const t = await prisma.exaTrilha.findFirst({ where: { id: String(req.params.id), tenantId, ativo: true } })
  const ordem = parseInt(String(req.params.ordem), 10)
  if (!t) throw httpErr(404, 'Trilha não encontrada.')
  if (!(t.etapas as any[]).some((e) => e.ordem === ordem)) throw httpErr(404, 'Etapa inexistente.')
  await prisma.exaTrilhaProgresso.upsert({ where: { trilhaId_studentId_ordem: { trilhaId: t.id, studentId, ordem } }, create: { tenantId, trilhaId: t.id, studentId, ordem }, update: {} })
  res.json({ ok: true, concluidas: await prisma.exaTrilhaProgresso.count({ where: { trilhaId: t.id, studentId } }), total: (t.etapas as any[]).length })
}))
router.delete('/trilhas/:id/etapas/:ordem/concluir', requireRole('STUDENT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  await prisma.exaTrilhaProgresso.deleteMany({ where: { tenantId, trilhaId: String(req.params.id), studentId: requireStudentId(req), ordem: parseInt(String(req.params.ordem), 10) } })
  res.status(204).end()
}))

// ---------------------------------------------------------------- LGPD: o aluno vê e apaga os próprios dados de preparação
router.get('/meus-dados', requireRole('STUDENT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const studentId = requireStudentId(req)
  const [sessoes, cartoes, pref, prog] = await Promise.all([
    prisma.exaSessao.findMany({ where: { tenantId, studentId }, select: { id: true, simuladoId: true, status: true, percentual: true, acertos: true, total: true, iniciadaEm: true, enviadaEm: true, respostas: true } }),
    prisma.exaFlashcard.findMany({ where: { tenantId, studentId } }),
    prisma.exaPreferencia.findUnique({ where: { tenantId_studentId: { tenantId, studentId } } }),
    prisma.exaTrilhaProgresso.findMany({ where: { tenantId, studentId } }),
  ])
  await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'EXPORTAR_MEUS_DADOS', refType: 'Student', refId: studentId })
  res.json({ finalidade: 'Preparação para exames (treino pedagógico). Base legal: execução do contrato educacional / interesse legítimo da instituição. Os dados ficam visíveis ao próprio aluno, à coordenação e à docência do curso.', sessoes, flashcards: cartoes, preferencias: pref, progressoTrilhas: prog })
}))
router.delete('/meus-dados', requireRole('STUDENT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const studentId = requireStudentId(req)
  const [a, b, c, d] = await Promise.all([
    prisma.exaSessao.deleteMany({ where: { tenantId, studentId } }), prisma.exaFlashcard.deleteMany({ where: { tenantId, studentId } }),
    prisma.exaTrilhaProgresso.deleteMany({ where: { tenantId, studentId } }), prisma.exaPreferencia.deleteMany({ where: { tenantId, studentId } }),
  ])
  await prisma.exaSimulado.deleteMany({ where: { tenantId, donoStudentId: studentId } })
  await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'APAGAR_MEUS_DADOS', refType: 'Student', refId: studentId, detalhes: { sessoes: a.count, flashcards: b.count } })
  res.json({ apagados: { sessoes: a.count, flashcards: b.count, progressoTrilhas: c.count, preferencias: d.count } })
}))

void GESTAO
export default router
