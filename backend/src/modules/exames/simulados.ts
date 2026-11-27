import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { parseBody, qs } from '../core/crud'
import { audit } from '../core/notify'
import { montarSimulado, distribuirPorPeso, estimarConceitoEnade, projecaoOAB } from '../desempenho/logic'
import { MOD, GESTAO, DOCENTE, TODOS, AVISO_AUTORAL, httpErr, isStudent, requireStudentId, getConfig, questaoLiberada, cursosDoAluno, alunosDaTurma, alunosDoCurso, nomesAlunos } from './common'
import { corrigirSessao, priorizarTemas, consolidarPerfis, nomeAbreviado, mediaUltimas, round, TemaPerfil } from './logic'
import { desempenhoDoAluno, sessoesConcluidas, pontosEvolucao } from './analise'
import { gerarCartoesDeErros } from './estudo'

const router = Router()
const opt = <T extends z.ZodTypeAny>(s: T) => s.optional().nullable()

// ---------------------------------------------------------------- utilidades
async function questoesLiberadas(tenantId: string, ids: string[]) {
  const cfg = await getConfig(tenantId)
  const [qs_, metas] = await Promise.all([
    prisma.desQuestao.findMany({ where: { tenantId, id: { in: ids } } }),
    prisma.exaQuestaoMeta.findMany({ where: { tenantId, questaoId: { in: ids } } }),
  ])
  const mm = new Map(metas.map((m) => [m.questaoId, m]))
  return { cfg, itens: qs_.map((q) => ({ q, meta: mm.get(q.id) ?? null, liberada: questaoLiberada(q, mm.get(q.id), cfg) })) }
}

/** Questões liberadas ao aluno de um ou mais exames (com meta), para composição de simulados. */
async function poolLiberado(tenantId: string, exameIds: string[], filtros: { tema?: string; eixoId?: string; descritorId?: string } = {}) {
  const cfg = await getConfig(tenantId)
  const qs_ = await prisma.desQuestao.findMany({ where: { tenantId, exameId: { in: exameIds }, status: 'PUBLICADO', tipo: 'OBJETIVA', ...(filtros.eixoId ? { eixoId: filtros.eixoId } : {}) }, take: 3000 })
  const metas = await prisma.exaQuestaoMeta.findMany({ where: { tenantId, questaoId: { in: qs_.map((q) => q.id) }, ...(filtros.descritorId ? { descritorId: filtros.descritorId } : {}) } })
  const mm = new Map(metas.map((m) => [m.questaoId, m]))
  return qs_.filter((q) => {
    const m = mm.get(q.id)
    if (!m || !questaoLiberada(q, m, cfg)) return false
    if (filtros.tema && (m.tema ?? '').trim().toLowerCase() !== filtros.tema.trim().toLowerCase()) return false
    return true
  }).map((q) => ({ q, meta: mm.get(q.id)! }))
}

async function alunoPodeVer(tenantId: string, studentId: string, s: { programId: string | null; donoStudentId: string | null; status: string }) {
  if (s.status !== 'PUBLICADO') return false
  if (s.donoStudentId) return s.donoStudentId === studentId
  if (!s.programId) return true
  return (await cursosDoAluno(tenantId, studentId)).includes(s.programId)
}

// ---------------------------------------------------------------- simulados (modelos prontos)
const composicaoSchema = z.object({
  exameId: z.string(), programId: opt(z.string()), titulo: z.string().min(3).max(160), descricao: opt(z.string().max(600)), duracaoMin: z.number().int().min(5).max(360).default(120),
  questaoIds: z.array(z.string()).min(1).max(120).optional(),
  auto: z.object({
    quantidade: z.number().int().min(1).max(120), incluirExameIds: z.array(z.string()).max(3).optional(), tema: opt(z.string()), eixos: z.array(z.object({ eixoId: z.string(), quantidade: z.number().int().min(1).max(60) })).optional(),
  }).optional(),
}).refine((d) => d.questaoIds || d.auto, { message: 'Informe questaoIds ou auto.' })

router.post('/simulados', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(composicaoSchema, req.body)
  const exame = await prisma.desExame.findFirst({ where: { id: b.exameId, tenantId } })
  if (!exame) throw httpErr(404, 'Exame não encontrado.')
  if (b.programId && !(await prisma.academicProgram.findFirst({ where: { id: b.programId, tenantId }, select: { id: true } }))) throw httpErr(404, 'Curso não encontrado.')
  let ids: string[] = []
  let faltantes: any[] = []
  if (b.questaoIds) {
    const { itens } = await questoesLiberadas(tenantId, b.questaoIds)
    if (itens.length !== new Set(b.questaoIds).size) throw httpErr(400, 'Alguma questão não existe neste tenant.')
    const ruins = itens.filter((i) => !i.liberada)
    if (ruins.length) throw httpErr(409, `${ruins.length} questão(ões) ainda não estão liberadas (precisam de revisão docente e publicação).`)
    ids = b.questaoIds
  } else {
    const a = b.auto!
    const fontes = [b.exameId, ...(a.incluirExameIds ?? [])]
    for (const e of a.incluirExameIds ?? []) if (!(await prisma.desExame.findFirst({ where: { id: e, tenantId }, select: { id: true } }))) throw httpErr(404, 'Exame incluído não encontrado.')
    const pool = await poolLiberado(tenantId, fontes, { tema: a.tema ?? undefined })
    let matriz: Array<{ eixoId: string; quantidade: number }>
    if (a.eixos?.length) matriz = a.eixos
    else {
      const eixos = await prisma.desEixo.findMany({ where: { tenantId, exameId: { in: fontes }, ativo: true } })
      const comQuestao = new Set(pool.map((p) => p.q.eixoId))
      const uteis = eixos.filter((e) => comQuestao.has(e.id))
      const fgShare = fontes.length > 1 ? 0.25 : 0
      const peso = (e: { exameId: string; peso: number }) => (e.exameId === b.exameId ? (1 - fgShare) : fgShare / Math.max(1, fontes.length - 1)) * e.peso / (uteis.filter((x) => x.exameId === e.exameId).reduce((s, x) => s + x.peso, 0) || 1)
      const dist = distribuirPorPeso(a.quantidade, uteis.map((e) => ({ id: e.id, peso: peso(e) })))
      matriz = uteis.map((e) => ({ eixoId: e.id, quantidade: dist[e.id] ?? 0 })).filter((m) => m.quantidade > 0)
    }
    const m = montarSimulado(pool.map((p) => ({ id: p.q.id, eixoId: p.q.eixoId, nivel: p.q.nivel as any })), matriz, Date.now() % 100000)
    ids = m.selecionadas.map((s) => s.questaoId)
    faltantes = m.faltantes
    if (!ids.length) throw httpErr(422, 'Não há questões liberadas suficientes para montar este simulado.')
  }
  const row = await prisma.exaSimulado.create({ data: { tenantId, exameId: b.exameId, programId: b.programId ?? null, titulo: b.titulo, descricao: b.descricao ?? null, duracaoMin: b.duracaoMin, questaoIds: ids as any, criadoPorId: getUserId(req) } })
  await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'CRIAR_SIMULADO', refType: 'ExaSimulado', refId: row.id, detalhes: { questoes: ids.length } })
  res.status(201).json({ ...row, totalQuestoes: ids.length, faltantes, aviso: faltantes.length ? 'Algumas áreas têm menos questões liberadas do que o pedido.' : undefined })
}))

router.get('/simulados', requireRole(...TODOS), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const exameId = qs(req.query.exameId)
  const aluno = isStudent(req)
  const studentId = aluno ? requireStudentId(req) : null
  let rows = await prisma.exaSimulado.findMany({ where: { tenantId, ...(exameId ? { exameId } : {}), ...(aluno ? { status: 'PUBLICADO' } : { donoStudentId: null, ...(qs(req.query.status) ? { status: qs(req.query.status) as any } : {}) }) }, orderBy: { createdAt: 'desc' }, take: 200 })
  if (aluno) { const cur = await cursosDoAluno(tenantId, studentId!); rows = rows.filter((s) => (s.donoStudentId ? s.donoStudentId === studentId : !s.programId || cur.includes(s.programId))) }
  const exames = new Map((await prisma.desExame.findMany({ where: { tenantId, id: { in: [...new Set(rows.map((r) => r.exameId))] } }, select: { id: true, nome: true, tipo: true } })).map((e) => [e.id, e]))
  const sess = await prisma.exaSessao.findMany({ where: { tenantId, simuladoId: { in: rows.map((r) => r.id) }, ...(aluno ? { studentId: studentId! } : {}) }, select: { simuladoId: true, status: true, percentual: true } })
  res.json({
    aviso: AVISO_AUTORAL,
    items: rows.map((r) => {
      const ss = sess.filter((s) => s.simuladoId === r.id), fin = ss.filter((s) => s.status !== 'EM_ANDAMENTO')
      return { id: r.id, titulo: r.titulo, descricao: r.descricao, status: r.status, duracaoMin: r.duracaoMin, exameId: r.exameId, exame: exames.get(r.exameId) ?? null, programId: r.programId, totalQuestoes: (r.questaoIds as string[]).length, pessoal: !!r.donoStudentId, tentativas: fin.length, emAndamento: ss.some((s) => s.status === 'EM_ANDAMENTO'), melhorPercentual: fin.length ? Math.max(...fin.map((s) => s.percentual ?? 0)) : null }
    }),
  })
}))

router.get('/simulados/:id', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const s = await prisma.exaSimulado.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!s) throw httpErr(404, 'Simulado não encontrado.')
  const ids = s.questaoIds as string[]
  const { itens } = await questoesLiberadas(tenantId, ids)
  const mp = new Map(itens.map((i) => [i.q.id, i]))
  res.json({ ...s, questoes: ids.map((id, n) => ({ ordem: n + 1, id, eixoId: mp.get(id)?.q.eixoId, nivel: mp.get(id)?.q.nivel, tema: mp.get(id)?.meta?.tema, enunciado: mp.get(id)?.q.enunciado?.slice(0, 160), liberada: mp.get(id)?.liberada ?? false })) })
}))

router.post('/simulados/:id/publicar', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const s = await prisma.exaSimulado.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!s) throw httpErr(404, 'Simulado não encontrado.')
  if (s.status === 'PUBLICADO') throw httpErr(409, 'Simulado já publicado.')
  const { itens } = await questoesLiberadas(tenantId, s.questaoIds as string[])
  const ruins = itens.filter((i) => !i.liberada).length
  if (ruins) throw httpErr(409, `${ruins} questão(ões) do simulado não estão liberadas (revisão docente pendente).`)
  const row = await prisma.exaSimulado.update({ where: { id: s.id }, data: { status: 'PUBLICADO' } })
  await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'PUBLICAR_SIMULADO', refType: 'ExaSimulado', refId: s.id })
  res.json(row)
}))
router.post('/simulados/:id/arquivar', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const s = await prisma.exaSimulado.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!s) throw httpErr(404, 'Simulado não encontrado.')
  res.json(await prisma.exaSimulado.update({ where: { id: s.id }, data: { status: 'ARQUIVADO' } }))
}))

// ---------------------------------------------------------------- sessões (aluno realiza, com tempo)
async function questoesDaSessao(tenantId: string, ids: string[]) {
  const [qs_, metas] = await Promise.all([
    prisma.desQuestao.findMany({ where: { tenantId, id: { in: ids } } }),
    prisma.exaQuestaoMeta.findMany({ where: { tenantId, questaoId: { in: ids } } }),
  ])
  const mq = new Map(qs_.map((q) => [q.id, q])), mm = new Map(metas.map((m) => [m.questaoId, m]))
  return ids.map((id) => ({ q: mq.get(id)!, meta: mm.get(id) ?? null })).filter((x) => x.q)
}

async function visaoSessao(tenantId: string, s: { id: string; simuladoId: string; expiraEm: Date; respostas: any }, ids: string[]) {
  const itens = await questoesDaSessao(tenantId, ids)
  return {
    sessaoId: s.id, expiraEm: s.expiraEm, respostasSalvas: s.respostas ?? {},
    questoes: itens.map((x, n) => ({ ordem: n + 1, questaoId: x.q.id, eixoId: x.q.eixoId, tema: x.meta?.tema ?? null, nivel: x.q.nivel, enunciado: x.q.enunciado, alternativas: x.q.alternativas, revisada: x.meta?.revisao === 'APROVADA' })),
  }
}

async function iniciarSessao(tenantId: string, studentId: string, sim: { id: string; duracaoMin: number; questaoIds: any }) {
  const ids = sim.questaoIds as string[]
  const aberta = await prisma.exaSessao.findFirst({ where: { tenantId, simuladoId: sim.id, studentId, status: 'EM_ANDAMENTO' } })
  if (aberta) {
    if (aberta.expiraEm.getTime() < Date.now()) await finalizarSessao(tenantId, aberta.id, 'EXPIRADA')
    else return { sessao: aberta, retomada: true }
  }
  const [cursos] = await Promise.all([cursosDoAluno(tenantId, studentId)])
  const sessao = await prisma.exaSessao.create({ data: { tenantId, simuladoId: sim.id, studentId, programId: cursos[0] ?? null, expiraEm: new Date(Date.now() + sim.duracaoMin * 60_000), total: ids.length } })
  return { sessao, retomada: false }
}

router.post('/simulados/:id/iniciar', requireRole('STUDENT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const studentId = requireStudentId(req)
  const sim = await prisma.exaSimulado.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!sim || !(await alunoPodeVer(tenantId, studentId, sim))) throw httpErr(404, 'Simulado não disponível.')
  const { sessao, retomada } = await iniciarSessao(tenantId, studentId, sim)
  res.status(retomada ? 200 : 201).json({ retomada, ...(await visaoSessao(tenantId, sessao, sim.questaoIds as string[])) })
}))

async function sessaoAcessivel(req: AuthenticatedRequest, id: string) {
  const tenantId = getTenantId(req)
  const s = await prisma.exaSessao.findFirst({ where: { id, tenantId }, include: { simulado: true } })
  if (!s) throw httpErr(404, 'Sessão não encontrada.')
  if (isStudent(req) && s.studentId !== req.user?.studentId) throw httpErr(403, 'Sessão de outro aluno.')
  return s
}

router.get('/sessoes/:id', requireRole(...TODOS), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  let s = await sessaoAcessivel(req, String(req.params.id))
  if (s.status === 'EM_ANDAMENTO' && s.expiraEm.getTime() < Date.now()) { await finalizarSessao(tenantId, s.id, 'EXPIRADA'); s = await sessaoAcessivel(req, s.id) }
  if (s.status !== 'EM_ANDAMENTO') return res.json({ status: s.status, sessaoId: s.id, mensagem: 'Sessão finalizada: consulte o resultado.' })
  res.json({ status: s.status, simulado: s.simulado.titulo, ...(await visaoSessao(tenantId, s, s.simulado.questaoIds as string[])) })
}))

router.put('/sessoes/:id/respostas', requireRole('STUDENT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const s = await sessaoAcessivel(req, String(req.params.id))
  if (s.status !== 'EM_ANDAMENTO') throw httpErr(409, 'Sessão já finalizada.')
  if (s.expiraEm.getTime() < Date.now() - 15_000) { await finalizarSessao(tenantId, s.id, 'EXPIRADA'); throw httpErr(409, 'Tempo esgotado: a prova foi corrigida automaticamente.') }
  const b = parseBody(z.object({ respostas: z.record(z.string(), z.string().length(1).nullable()) }), req.body)
  const ids = new Set(s.simulado.questaoIds as string[])
  const atual = { ...((s.respostas as any) ?? {}) }
  let salvas = 0
  for (const [q, alt] of Object.entries(b.respostas)) if (ids.has(q)) { if (alt) atual[q] = alt.toUpperCase(); else delete atual[q]; salvas++ }
  await prisma.exaSessao.update({ where: { id: s.id }, data: { respostas: atual } })
  res.json({ salvas, restanteSegundos: Math.max(0, Math.round((s.expiraEm.getTime() - Date.now()) / 1000)) })
}))

// Correção automática: gabarito, agregações por eixo/tema/descritor, estatística da questão e flashcards dos erros.
export async function finalizarSessao(tenantId: string, sessaoId: string, status: 'ENVIADA' | 'EXPIRADA') {
  const claim = await prisma.exaSessao.updateMany({ where: { id: sessaoId, tenantId, status: 'EM_ANDAMENTO' }, data: { status } })
  const s = await prisma.exaSessao.findFirst({ where: { id: sessaoId, tenantId }, include: { simulado: true } })
  if (!s || claim.count === 0) return s
  const ids = s.simulado.questaoIds as string[]
  const itens = await questoesDaSessao(tenantId, ids)
  const eixos = await prisma.desEixo.findMany({ where: { tenantId, id: { in: [...new Set(itens.map((i) => i.q.eixoId).filter(Boolean) as string[])] } } })
  const descs = await prisma.exaDescritor.findMany({ where: { tenantId, id: { in: [...new Set(itens.map((i) => i.meta?.descritorId).filter(Boolean) as string[])] } } })
  const eNome = new Map(eixos.map((e) => [e.id, e.nome])), dCod = new Map(descs.map((d) => [d.id, d.codigo]))
  const r = corrigirSessao(itens.map((i) => ({ id: i.q.id, eixoId: i.q.eixoId, tema: i.meta?.tema ?? null, descritorId: i.meta?.descritorId ?? null, gabarito: i.q.gabarito })), (s.respostas as any) ?? {})
  const det = new Map(r.detalhe.map((d) => [d.questaoId, d]))
  await prisma.$transaction([
    prisma.exaSessao.update({
      where: { id: s.id },
      data: {
        enviadaEm: new Date(), acertos: r.acertos, total: r.total, percentual: r.percentual,
        porEixo: r.porEixo.map((e) => ({ eixoId: e.chave, nome: eNome.get(e.chave) ?? 'Sem eixo', acertos: e.acertos, total: e.total, percentual: e.percentual })) as any,
        porTema: r.porTema.map((e) => ({ tema: e.chave, acertos: e.acertos, total: e.total, percentual: e.percentual })) as any,
        porDescritor: r.porDescritor.map((e) => ({ descritorId: e.chave, codigo: dCod.get(e.chave) ?? e.chave, acertos: e.acertos, total: e.total, percentual: e.percentual })) as any,
        tempoSegundos: Math.max(0, Math.round((Math.min(Date.now(), s.expiraEm.getTime()) - s.iniciadaEm.getTime()) / 1000)),
      },
    }),
    ...itens.map((i) => prisma.desQuestao.update({ where: { id: i.q.id }, data: { totalRespostas: { increment: 1 }, ...(det.get(i.q.id)?.correta ? { totalAcertos: { increment: 1 } } : {}) } })),
  ])
  const erradas = itens.filter((i) => !det.get(i.q.id)?.correta).map((i) => ({ q: i.q, meta: i.meta, marcada: det.get(i.q.id)?.marcada ?? null }))
  try { await gerarCartoesDeErros(tenantId, s.studentId, s.simulado.exameId, erradas) } catch (e) { console.error('[exames] flashcards', e) }
  return prisma.exaSessao.findFirst({ where: { id: s.id, tenantId }, include: { simulado: true } })
}

router.post('/sessoes/:id/enviar', requireRole('STUDENT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const s = await sessaoAcessivel(req, String(req.params.id))
  if (s.status !== 'EM_ANDAMENTO') throw httpErr(409, 'Sessão já finalizada.')
  if (req.body?.respostas) {
    const b = parseBody(z.object({ respostas: z.record(z.string(), z.string().length(1).nullable()) }), req.body)
    const ids = new Set(s.simulado.questaoIds as string[])
    const atual = { ...((s.respostas as any) ?? {}) }
    for (const [q, alt] of Object.entries(b.respostas)) if (ids.has(q)) { if (alt) atual[q] = alt.toUpperCase(); else delete atual[q] }
    await prisma.exaSessao.update({ where: { id: s.id }, data: { respostas: atual } })
  }
  const atrasado = s.expiraEm.getTime() < Date.now() - 15_000
  const f = await finalizarSessao(tenantId, s.id, atrasado ? 'EXPIRADA' : 'ENVIADA')
  res.json({ sessaoId: s.id, status: f?.status, acertos: f?.acertos, total: f?.total, percentual: f?.percentual, avisoTempo: atrasado ? 'Envio fora do prazo: foram contabilizadas as respostas salvas.' : undefined })
}))

router.get('/sessoes/:id/resultado', requireRole(...TODOS), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  let s = await sessaoAcessivel(req, String(req.params.id))
  if (s.status === 'EM_ANDAMENTO' && s.expiraEm.getTime() < Date.now()) { await finalizarSessao(tenantId, s.id, 'EXPIRADA'); s = await sessaoAcessivel(req, s.id) }
  if (s.status === 'EM_ANDAMENTO') throw httpErr(409, 'Sessão em andamento: envie a prova para ver o gabarito.')
  if (!isStudent(req)) await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'VER_RESULTADO_ALUNO', refType: 'ExaSessao', refId: s.id })
  const ex = await prisma.desExame.findFirst({ where: { id: s.simulado.exameId, tenantId } })
  const ids = s.simulado.questaoIds as string[]
  const itens = await questoesDaSessao(tenantId, ids)
  const [eixos, descs] = await Promise.all([
    prisma.desEixo.findMany({ where: { tenantId, id: { in: [...new Set(itens.map((i) => i.q.eixoId).filter(Boolean) as string[])] } } }),
    prisma.exaDescritor.findMany({ where: { tenantId, id: { in: [...new Set(itens.map((i) => i.meta?.descritorId).filter(Boolean) as string[])] } } }),
  ])
  const eixo = new Map(eixos.map((e) => [e.id, e])), desc = new Map(descs.map((d) => [d.id, d]))
  const resp = (s.respostas as any) ?? {}
  const porEixo = ((s.porEixo as any[]) ?? []).map((e) => ({ ...e, meta: eixo.get(e.eixoId)?.metaAcerto ?? null, atingiuMeta: eixo.get(e.eixoId) ? e.percentual >= eixo.get(e.eixoId)!.metaAcerto : null }))
  const pct = s.percentual ?? 0
  const projecao = ex?.tipo === 'ENADE' ? { ...estimarConceitoEnade(pct), rotulo: 'ESTIMATIVA' } : ex && ['OAB_1FASE', 'ENAMED', 'RESIDENCIA', 'REVALIDA'].includes(ex.tipo) ? { ...projecaoOAB(pct, ex.notaCorte ?? 50), rotulo: 'ESTIMATIVA' } : null
  res.json({
    sessaoId: s.id, simulado: s.simulado.titulo, exame: ex?.nome, status: s.status, acertos: s.acertos, total: s.total, percentual: s.percentual, tempoSegundos: s.tempoSegundos, enviadaEm: s.enviadaEm,
    porEixo, porTema: s.porTema, porDescritor: s.porDescritor, projecao,
    aviso: AVISO_AUTORAL,
    revisao: itens.map((x, n) => {
      const marcada = resp[x.q.id] ?? null
      return {
        ordem: n + 1, questaoId: x.q.id, enunciado: x.q.enunciado, alternativas: x.q.alternativas, marcada, gabarito: x.q.gabarito, correta: !!marcada && marcada === x.q.gabarito, respondida: !!marcada,
        tema: x.meta?.tema ?? null, nivel: x.q.nivel, eixo: x.q.eixoId ? eixo.get(x.q.eixoId)?.nome ?? null : null, descritor: x.meta?.descritorId ? { codigo: desc.get(x.meta.descritorId)?.codigo, descricao: desc.get(x.meta.descritorId)?.descricao } : null,
        comentario: x.q.comentario, comentarios: x.meta?.comentarios ?? null, revisada: x.meta?.revisao === 'APROVADA', geradaPor: x.meta?.geradaPor ?? null,
      }
    }),
  })
}))

router.get('/minhas-sessoes', requireRole('STUDENT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const studentId = requireStudentId(req)
  const rows = await prisma.exaSessao.findMany({ where: { tenantId, studentId }, orderBy: { iniciadaEm: 'desc' }, take: 100, include: { simulado: { select: { titulo: true, exameId: true } } } })
  res.json({ items: rows.map((s) => ({ id: s.id, simulado: s.simulado.titulo, exameId: s.simulado.exameId, status: s.status, percentual: s.percentual, acertos: s.acertos, total: s.total, iniciadaEm: s.iniciadaEm, expiraEm: s.expiraEm })) })
}))

// ---------------------------------------------------------------- treino personalizado (sugerido, por tema, ou refazer erradas)
async function questoesErradasDoAluno(tenantId: string, studentId: string, exameId: string) {
  const sess = (await sessoesConcluidas(tenantId, { studentIds: [studentId], exameId })).slice(-10)
  const sims = await prisma.exaSimulado.findMany({ where: { tenantId, id: { in: sess.map((s) => s.simuladoId) } }, select: { id: true, questaoIds: true } })
  const ms = new Map(sims.map((s) => [s.id, s.questaoIds as string[]]))
  const acertou = new Set<string>(), errou = new Set<string>()
  const gab = new Map((await prisma.desQuestao.findMany({ where: { tenantId, id: { in: [...new Set([...ms.values()].flat())] } }, select: { id: true, gabarito: true } })).map((q) => [q.id, q.gabarito]))
  for (const s of sess) for (const q of ms.get(s.simuladoId) ?? []) { const ok = ((s.respostas as any)?.[q] ?? null) === gab.get(q); (ok ? acertou : errou).add(q); if (ok) errou.delete(q) }
  return [...errou]
}

router.post('/treino', requireRole('STUDENT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const studentId = requireStudentId(req)
  const b = parseBody(z.object({ exameId: z.string(), quantidade: z.number().int().min(3).max(40).default(10), modo: z.enum(['sugerido', 'tema', 'erradas']).default('sugerido'), tema: opt(z.string()), eixoId: opt(z.string()), descritorId: opt(z.string()) }), req.body)
  const ex = await prisma.desExame.findFirst({ where: { id: b.exameId, tenantId } })
  if (!ex) throw httpErr(404, 'Exame não encontrado.')
  let pool = await poolLiberado(tenantId, [b.exameId], { eixoId: b.eixoId ?? undefined, descritorId: b.descritorId ?? undefined, tema: b.modo === 'tema' ? (b.tema ?? undefined) : undefined })
  let titulo = `Treino — ${ex.nome}`
  if (b.modo === 'tema') { if (!b.tema && !b.eixoId && !b.descritorId) throw httpErr(400, 'Informe tema, eixo ou descritor.'); titulo = `Treino por tema — ${b.tema ?? 'seleção'}` }
  if (b.modo === 'erradas') {
    const erradas = new Set(await questoesErradasDoAluno(tenantId, studentId, b.exameId))
    pool = pool.filter((p) => erradas.has(p.q.id)); titulo = 'Revisão das questões que errei'
    if (!pool.length) throw httpErr(422, 'Você não tem questões erradas para refazer neste exame.')
  }
  let escolhidas = pool
  if (b.modo === 'sugerido') {
    const perfis = await prisma.exaPerfil.findMany({ where: { tenantId, exameId: b.exameId } })
    const rec = consolidarPerfis(perfis.map((p) => ({ ano: p.ano, temas: p.temas as unknown as TemaPerfil[] })))
    const d = await desempenhoDoAluno(tenantId, studentId, b.exameId)
    const ac = new Map(d.porTema.map((t) => [t.tema.trim().toLowerCase(), t.percentual]))
    const prio = new Map(priorizarTemas(rec.length ? rec : [...new Set(pool.map((p) => p.meta.tema ?? ''))].filter(Boolean).map((t) => ({ tema: t, frequenciaMedia: 1 })), ac).map((t, i) => [t.tema.trim().toLowerCase(), t.prioridade] as const))
    escolhidas = [...pool].sort((x, y) => (prio.get((y.meta.tema ?? '').trim().toLowerCase()) ?? 0) - (prio.get((x.meta.tema ?? '').trim().toLowerCase()) ?? 0) || Math.random() - 0.5)
    titulo = `Treino sugerido — ${ex.nome}`
  } else escolhidas = [...pool].sort(() => Math.random() - 0.5)
  escolhidas = escolhidas.slice(0, b.quantidade)
  if (!escolhidas.length) throw httpErr(422, 'Não há questões liberadas para este filtro.')
  const sim = await prisma.exaSimulado.create({ data: { tenantId, exameId: b.exameId, titulo, descricao: 'Treino pessoal', duracaoMin: Math.max(10, escolhidas.length * 3), questaoIds: escolhidas.map((e) => e.q.id) as any, status: 'PUBLICADO', donoStudentId: studentId, criadoPorId: getUserId(req) } })
  const { sessao } = await iniciarSessao(tenantId, studentId, sim)
  res.status(201).json({ simuladoId: sim.id, ...(await visaoSessao(tenantId, sessao, sim.questaoIds as string[])) })
}))

// ---------------------------------------------------------------- desempenho (relatório por tema/descritor e evolução)
async function relatorioAluno(tenantId: string, studentId: string, exameId?: string) {
  const d = await desempenhoDoAluno(tenantId, studentId, exameId)
  const cfg = await getConfig(tenantId)
  const pcts = d.sessoes.map((s) => s.percentual ?? 0)
  const ex = exameId ? await prisma.desExame.findFirst({ where: { id: exameId, tenantId } }) : null
  const ordenar = <T extends { percentual: number | null; total: number }>(l: T[]) => [...l].sort((a, b) => (a.percentual ?? 101) - (b.percentual ?? 101))
  const temasFracos = ordenar(d.porTema).filter((t) => t.total >= 2 && (t.percentual ?? 0) < cfg.metaProntidaoPct).slice(0, 8)
  const media = mediaUltimas(pcts, 3)
  const proj = media == null || !ex ? null : ex.tipo === 'ENADE' ? { ...estimarConceitoEnade(media), rotulo: 'ESTIMATIVA' } : ['OAB_1FASE', 'ENAMED', 'RESIDENCIA', 'REVALIDA'].includes(ex.tipo) ? { ...projecaoOAB(media, ex.notaCorte ?? 50), rotulo: 'ESTIMATIVA' } : null
  return {
    exameId: exameId ?? null, sessoes: d.sessoes.length, mediaUltimas3: media, melhor: pcts.length ? Math.max(...pcts) : null, ultimo: pcts.length ? pcts[pcts.length - 1] : null,
    tempoMedioSegundos: d.sessoes.length ? Math.round(d.sessoes.reduce((s, x) => s + (x.tempoSegundos ?? 0), 0) / d.sessoes.length) : null,
    metaPct: cfg.metaProntidaoPct, porEixo: ordenar(d.porEixo), porTema: ordenar(d.porTema), porDescritor: ordenar(d.porDescritor), temasFracos, evolucao: pontosEvolucao(d.sessoes), projecao: proj,
    aviso: 'Relatório de treino. Projeções são estimativas internas e não substituem o resultado oficial.',
  }
}
router.get('/meu-desempenho', requireRole('STUDENT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  res.json(await relatorioAluno(getTenantId(req), requireStudentId(req), qs(req.query.exameId)))
}))
router.get('/alunos/:studentId/desempenho', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const st = await prisma.student.findFirst({ where: { id: String(req.params.studentId), tenantId }, select: { id: true, nomeCompleto: true, ra: true } })
  if (!st) throw httpErr(404, 'Aluno não encontrado.')
  await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'VER_DESEMPENHO_ALUNO', refType: 'Student', refId: st.id })
  res.json({ aluno: { id: st.id, nome: st.nomeCompleto, ra: st.ra }, ...(await relatorioAluno(tenantId, st.id, qs(req.query.exameId))) })
}))

// ---------------------------------------------------------------- ranking opcional por turma/curso (LGPD: só quem optou aparece)
router.get('/preferencias', requireRole('STUDENT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const p = await prisma.exaPreferencia.findUnique({ where: { tenantId_studentId: { tenantId, studentId: requireStudentId(req) } } })
  const cfg = await getConfig(tenantId)
  res.json({ rankingParticipa: p?.rankingParticipa ?? false, rankingDisponivel: cfg.rankingAtivo, consentidoEm: p?.consentidoEm ?? null, informacao: 'Participar do ranking mostra seu nome abreviado e sua média aos colegas da turma. Você pode sair a qualquer momento.' })
}))
router.put('/preferencias', requireRole('STUDENT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const studentId = requireStudentId(req)
  const b = parseBody(z.object({ rankingParticipa: z.boolean() }), req.body)
  const row = await prisma.exaPreferencia.upsert({ where: { tenantId_studentId: { tenantId, studentId } }, create: { tenantId, studentId, rankingParticipa: b.rankingParticipa, consentidoEm: b.rankingParticipa ? new Date() : null }, update: { rankingParticipa: b.rankingParticipa, consentidoEm: b.rankingParticipa ? new Date() : null } })
  await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: b.rankingParticipa ? 'RANKING_CONSENTIMENTO' : 'RANKING_REVOGACAO', refType: 'Student', refId: studentId })
  res.json(row)
}))

router.get('/ranking', requireRole(...TODOS), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const exameId = qs(req.query.exameId)
  if (!exameId) throw httpErr(400, 'Informe exameId.')
  const cfg = await getConfig(tenantId)
  const aluno = isStudent(req)
  if (!cfg.rankingAtivo) throw httpErr(403, 'O ranking não está habilitado pela instituição.')
  const classSectionId = qs(req.query.classSectionId), programId = qs(req.query.programId)
  let escopo: string[]
  if (aluno) {
    const me = requireStudentId(req)
    const mine = await prisma.exaPreferencia.findUnique({ where: { tenantId_studentId: { tenantId, studentId: me } } })
    if (!mine?.rankingParticipa) throw httpErr(403, 'Ative sua participação no ranking para ver os colegas.')
    // o aluno só enxerga a própria turma/curso
    const turmas = await prisma.classSectionEnrollment.findMany({ where: { enrollment: { studentId: me, status: 'ATIVA' }, classSection: { tenantId } }, select: { classSectionId: true } })
    const ts = turmas.map((t) => t.classSectionId)
    if (classSectionId && !ts.includes(classSectionId)) throw httpErr(403, 'Você não pertence a esta turma.')
    const cursos = await cursosDoAluno(tenantId, me)
    if (programId && !cursos.includes(programId)) throw httpErr(403, 'Você não pertence a este curso.')
    escopo = classSectionId ? await alunosDaTurma(tenantId, classSectionId) : programId ? await alunosDoCurso(tenantId, programId) : await alunosDaTurma(tenantId, ts[0] ?? '')
  } else {
    escopo = classSectionId ? await alunosDaTurma(tenantId, classSectionId) : programId ? await alunosDoCurso(tenantId, programId) : []
    if (!classSectionId && !programId) throw httpErr(400, 'Informe classSectionId ou programId.')
  }
  const optIn = aluno ? new Set((await prisma.exaPreferencia.findMany({ where: { tenantId, rankingParticipa: true, studentId: { in: escopo } }, select: { studentId: true } })).map((p) => p.studentId)) : null
  const ids = optIn ? escopo.filter((i) => optIn.has(i)) : escopo
  const sess = await sessoesConcluidas(tenantId, { studentIds: ids, exameId })
  const porAluno = new Map<string, number[]>()
  for (const s of sess) porAluno.set(s.studentId, [...(porAluno.get(s.studentId) ?? []), s.percentual ?? 0])
  const nomes = await nomesAlunos(tenantId, [...porAluno.keys()])
  const lista = [...porAluno.entries()].map(([studentId, v]) => ({ studentId, media: mediaUltimas(v, 3) as number, sessoes: v.length })).sort((a, b) => b.media - a.media)
  const me = req.user?.studentId
  res.json({
    exameId, criterio: 'média das 3 últimas sessões', participantes: lista.length,
    itens: lista.map((l, i) => ({ posicao: i + 1, aluno: aluno ? nomeAbreviado(nomes.get(l.studentId)?.nome ?? 'Aluno') : nomes.get(l.studentId)?.nome ?? 'Aluno', ...(aluno ? {} : { studentId: l.studentId, ra: nomes.get(l.studentId)?.ra }), media: round(l.media), sessoes: l.sessoes, voce: !!me && l.studentId === me })),
    aviso: aluno ? 'Aparecem apenas colegas que optaram por participar.' : 'Visão da coordenação/docência (inclui todos os alunos com sessão).',
  })
}))

export default router
