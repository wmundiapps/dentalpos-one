import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, requireRole } from '../academico/middleware'
import { pageParams, parseBody, qs } from '../core/crud'
import { audit, notify } from '../core/notify'
import { mascararNome } from '../lgpd/mascara'
import { registrarAcessoSensivel } from '../lgpd/sensiveis'
import { montarSimulado, distribuirPorPeso, QuestaoPool } from '../desempenho/logic'
import { DEV_READ, DEV_WRITE, MOD, ORIENT, assertNoTenant, fail, isSuper, optDate, optStr, parseTerm, roleOf, temPapel, tid, uid, uniq } from './common'
import { COMPETENCIAS_PADRAO, calcularGlobal, prioridadeDosAlertas, rankear } from './devLogic'

const TIPOS_PROG = ['PREPARATORIO', 'DIDATICO', 'PEDAGOGICO', 'DESENVOLVIMENTO_PESSOAL', 'MENTORIA', 'NIVELAMENTO'] as const
const ALVOS = ['ENADE', 'ENAMED', 'OAB', 'MESTRADO', 'DOUTORADO', 'CONCURSO', 'OUTRO'] as const
const CONF = ['NORMAL', 'RESTRITO', 'SIGILOSO'] as const
const REITORIA = ['ADMIN', 'OWNER', 'RECTOR', 'BOARD']

const meuId = (req: AuthenticatedRequest) => (roleOf(req) === 'STUDENT' ? req.user?.studentId ?? null : null)
function exigirProprioOuStaff(req: AuthenticatedRequest, studentId: string) {
  const meu = meuId(req)
  if (roleOf(req) === 'STUDENT' && meu !== studentId) fail(403, 'Você só pode acessar os seus próprios dados.')
}

async function nomesAlunos(tenantId: string, ids: string[]) {
  const a = await prisma.student.findMany({ where: { tenantId, id: { in: uniq(ids) } }, select: { id: true, nomeCompleto: true, ra: true } })
  return new Map(a.map((x) => [x.id, x]))
}

function podeVerOrientacao(req: AuthenticatedRequest, o: { confidencialidade: string; criadoPorId: string | null; responsavelUserId: string | null }) {
  if (isSuper(req)) return { ver: true, detalhe: true }
  const eu = req.user!.id
  const dono = o.criadoPorId === eu || o.responsavelUserId === eu
  const r = roleOf(req)
  if (o.confidencialidade === 'SIGILOSO') return { ver: dono, detalhe: dono }
  if (o.confidencialidade === 'RESTRITO') return { ver: dono || r === 'SUPPORT' || r === 'COORDINATOR', detalhe: dono || r === 'SUPPORT' }
  return { ver: dono || r === 'SUPPORT' || r === 'COORDINATOR', detalhe: true }
}

export function registerDesenvolvimento(router: Router) {
  const leitura = requireRole(...DEV_READ)
  const gestao = requireRole(...DEV_WRITE)

  // =============================================================== programas
  const progSchema = z.object({
    codigo: z.string().min(2).max(30), nome: z.string().min(3).max(160), tipo: z.enum(TIPOS_PROG).default('PREPARATORIO'), alvo: z.enum(ALVOS).nullish(), exameId: optStr(60), programId: optStr(60), descricao: optStr(3000),
    inicio: optDate(), fim: optDate(), vagas: z.number().int().min(1).max(100000).nullish(), rankingAtivo: z.boolean().default(false), metaPercentual: z.number().min(0).max(100).default(60), cargaHoraria: z.number().int().min(0).max(2000).default(0), responsavelUserId: optStr(60),
  })

  router.get('/programas', requireRole(...DEV_READ, 'STUDENT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    for (const k of ['tipo', 'alvo', 'status']) if (qs((req.query as any)[k])) where[k] = qs((req.query as any)[k])
    if (roleOf(req) === 'STUDENT') where.status = { in: ['ABERTO', 'EM_ANDAMENTO'] }
    if (qs(req.query.q)) where.nome = { contains: qs(req.query.q), mode: 'insensitive' }
    const [items, total] = await Promise.all([prisma.acaPrograma.findMany({ where, orderBy: [{ status: 'asc' }, { nome: 'asc' }], skip, take }), prisma.acaPrograma.count({ where })])
    const ins = await prisma.acaProgramaInscricao.groupBy({ by: ['programaId'], where: { tenantId, programaId: { in: items.map((i) => i.id) }, status: { in: ['ATIVA', 'CONCLUIDA'] } }, _count: { _all: true } })
    const m = new Map(ins.map((i) => [i.programaId, i._count._all]))
    const meu = meuId(req)
    const minhas = meu ? await prisma.acaProgramaInscricao.findMany({ where: { tenantId, studentId: meu, programaId: { in: items.map((i) => i.id) } } }) : []
    res.json({ items: items.map((i) => ({ ...i, inscritos: m.get(i.id) ?? 0, minhaInscricao: minhas.find((x) => x.programaId === i.id) ?? null })), total, page, pageSize })
  }))
  router.post('/programas', gestao, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(progSchema, req.body)
    if (b.inicio && b.fim && b.fim < b.inicio) fail(400, 'O fim deve ser posterior ao início.')
    if (b.exameId) await assertNoTenant(tenantId, 'desExame', b.exameId, 'Exame')
    if (b.programId) await assertNoTenant(tenantId, 'academicProgram', b.programId, 'Curso')
    if (b.tipo === 'PREPARATORIO' && !b.alvo) fail(400, 'Informe o alvo do preparatório (ENADE, ENAMED, OAB, mestrado, doutorado, concurso...).')
    if (await prisma.acaPrograma.findFirst({ where: { tenantId, codigo: b.codigo } })) fail(409, 'Já existe um programa com este código.')
    const p = await prisma.acaPrograma.create({ data: { ...b, tenantId, responsavelUserId: b.responsavelUserId ?? uid(req) } as any })
    await audit({ tenantId, userId: uid(req), modulo: MOD, acao: 'PROGRAMA_CRIADO', refType: 'AcaPrograma', refId: p.id })
    res.status(201).json(p)
  }))
  router.get('/programas/:id', requireRole(...DEV_READ, 'STUDENT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const p = await prisma.acaPrograma.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!p) fail(404, 'Programa não encontrado.')
    const atividades = await prisma.acaProgramaAtividade.findMany({ where: { tenantId, programaId: p.id }, orderBy: [{ dataPrevista: 'asc' }, { ordem: 'asc' }] })
    const meu = meuId(req)
    const reg = meu ? await prisma.acaAtividadeRegistro.findMany({ where: { tenantId, programaId: p.id, studentId: meu } }) : []
    const ins = meu ? await prisma.acaProgramaInscricao.findFirst({ where: { programaId: p.id, studentId: meu } }) : null
    res.json({ ...p, atividades: atividades.map((a) => ({ ...a, meuRegistro: reg.find((r) => r.atividadeId === a.id) ?? null })), minhaInscricao: ins })
  }))
  router.patch('/programas/:id', gestao, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const p = await prisma.acaPrograma.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!p) fail(404, 'Programa não encontrado.')
    const b = parseBody(progSchema.partial(), req.body)
    if (b.exameId) await assertNoTenant(tenantId, 'desExame', b.exameId, 'Exame')
    res.json(await prisma.acaPrograma.update({ where: { id: p.id }, data: Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined)) as any }))
  }))
  router.post('/programas/:id/status', gestao, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const p = await prisma.acaPrograma.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!p) fail(404, 'Programa não encontrado.')
    const b = parseBody(z.object({ status: z.enum(['RASCUNHO', 'ABERTO', 'EM_ANDAMENTO', 'ENCERRADO']) }), req.body)
    const ordem = ['RASCUNHO', 'ABERTO', 'EM_ANDAMENTO', 'ENCERRADO']
    if (ordem.indexOf(b.status) < ordem.indexOf(p.status)) fail(409, 'Não é possível voltar o programa a uma etapa anterior.')
    if (b.status === 'ABERTO' && !(await prisma.acaProgramaAtividade.count({ where: { programaId: p.id } }))) fail(422, 'Cadastre o cronograma (ao menos uma atividade) antes de abrir inscrições.')
    const u = await prisma.acaPrograma.update({ where: { id: p.id }, data: { status: b.status } })
    if (b.status === 'ENCERRADO') await prisma.acaProgramaInscricao.updateMany({ where: { programaId: p.id, status: 'ATIVA' }, data: { status: 'CONCLUIDA', concluidoEm: new Date() } })
    res.json(u)
  }))

  // inscrições
  router.post('/programas/:id/inscrever', requireRole(...DEV_READ, 'STUDENT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const p = await prisma.acaPrograma.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!p) fail(404, 'Programa não encontrado.')
    if (!['ABERTO', 'EM_ANDAMENTO'].includes(p.status)) fail(409, 'O programa não está recebendo inscrições.')
    const b = parseBody(z.object({ studentId: optStr(60), rankingOptIn: z.boolean().default(false), metaPercentual: z.number().min(0).max(100).nullish() }), req.body)
    const meu = meuId(req)
    const studentId = meu ?? b.studentId
    if (!studentId) fail(400, 'Informe o aluno.')
    if (meu && b.studentId && b.studentId !== meu) fail(403, 'Você só pode se inscrever em seu nome.')
    if (!meu && !temPapel(req, ...DEV_WRITE)) fail(403, 'Sem permissão para inscrever alunos.')
    await assertNoTenant(tenantId, 'student', studentId, 'Aluno')
    const ex = await prisma.acaProgramaInscricao.findFirst({ where: { programaId: p.id, studentId } })
    if (ex && ex.status !== 'DESISTENTE') fail(409, 'Aluno já inscrito neste programa.')
    const ocupadas = await prisma.acaProgramaInscricao.count({ where: { programaId: p.id, status: { in: ['ATIVA', 'CONCLUIDA'] } } })
    const status = p.vagas && ocupadas >= p.vagas ? 'LISTA_ESPERA' : 'ATIVA'
    const dados = { status, rankingOptIn: p.rankingAtivo ? b.rankingOptIn : false, metaPercentual: b.metaPercentual ?? null, inscritoEm: new Date(), progresso: 0 }
    const i = ex ? await prisma.acaProgramaInscricao.update({ where: { id: ex.id }, data: dados }) : await prisma.acaProgramaInscricao.create({ data: { ...dados, tenantId, programaId: p.id, studentId } })
    res.status(201).json(i)
  }))
  router.post('/programas/:id/desistir', requireRole('STUDENT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const i = await prisma.acaProgramaInscricao.findFirst({ where: { tenantId, programaId: String(req.params.id), studentId: meuId(req) ?? '-' } })
    if (!i) fail(404, 'Inscrição não encontrada.')
    await prisma.acaProgramaInscricao.update({ where: { id: i.id }, data: { status: 'DESISTENTE', rankingOptIn: false } })
    // promove o primeiro da lista de espera
    const prox = await prisma.acaProgramaInscricao.findFirst({ where: { programaId: i.programaId, status: 'LISTA_ESPERA' }, orderBy: { inscritoEm: 'asc' } })
    if (prox) await prisma.acaProgramaInscricao.update({ where: { id: prox.id }, data: { status: 'ATIVA' } })
    res.json({ ok: true, promovido: !!prox })
  }))
  router.patch('/inscricoes/:id/ranking', requireRole('STUDENT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const i = await prisma.acaProgramaInscricao.findFirst({ where: { id: String(req.params.id), tenantId, studentId: meuId(req) ?? '-' } })
    if (!i) fail(404, 'Inscrição não encontrada.')
    const b = parseBody(z.object({ rankingOptIn: z.boolean() }), req.body)
    res.json(await prisma.acaProgramaInscricao.update({ where: { id: i.id }, data: { rankingOptIn: b.rankingOptIn } }))
  }))
  router.get('/programas/:id/inscricoes', leitura, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const items = await prisma.acaProgramaInscricao.findMany({ where: { tenantId, programaId: String(req.params.id) }, orderBy: { inscritoEm: 'asc' } })
    const m = await nomesAlunos(tenantId, items.map((i) => i.studentId))
    res.json({ items: items.map((i) => ({ ...i, aluno: m.get(i.studentId) ?? null })) })
  }))

  // cronograma
  router.post('/programas/:id/atividades', gestao, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const p = await prisma.acaPrograma.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!p) fail(404, 'Programa não encontrado.')
    const b = parseBody(z.object({ ordem: z.number().int().default(0), tipo: z.enum(['AULA', 'SIMULADO', 'TRILHA', 'LEITURA', 'ENCONTRO', 'ENTREGA', 'MENTORIA', 'OFICINA']).default('AULA'), titulo: z.string().min(3).max(200), descricao: optStr(2000), dataPrevista: optDate(), duracaoMin: z.number().int().min(5).max(1440).default(60), simuladoId: optStr(60), eixoId: optStr(60), obrigatoria: z.boolean().default(true), publicarNoCalendario: z.boolean().default(false) }), req.body)
    if (b.simuladoId) await assertNoTenant(tenantId, 'desSimulado', b.simuladoId, 'Simulado')
    if (b.eixoId) await assertNoTenant(tenantId, 'desEixo', b.eixoId, 'Área/eixo')
    if (p.fim && b.dataPrevista && b.dataPrevista > new Date(p.fim.getTime() + 86_400_000)) fail(400, 'A data prevista ultrapassa o fim do programa.')
    const { publicarNoCalendario, ...dados } = b
    let calEventoId: string | undefined
    if (publicarNoCalendario && b.dataPrevista) calEventoId = (await prisma.calEvento.create({ data: { tenantId, tipo: 'OUTRO', titulo: `${p.nome}: ${b.titulo}`, inicio: b.dataPrevista, fim: new Date(b.dataPrevista.getTime() + b.duracaoMin * 60_000), diaInteiro: false, publico: 'ALUNOS', criadoPorId: uid(req) } })).id
    res.status(201).json(await prisma.acaProgramaAtividade.create({ data: { ...dados, tenantId, programaId: p.id, calEventoId } as any }))
  }))
  router.delete('/atividades/:id', gestao, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const a = await prisma.acaProgramaAtividade.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!a) fail(404, 'Atividade não encontrada.')
    await prisma.$transaction([prisma.acaAtividadeRegistro.deleteMany({ where: { atividadeId: a.id } }), prisma.acaProgramaAtividade.delete({ where: { id: a.id } })])
    await recalcularProgresso(tenantId, a.programaId)
    res.status(204).end()
  }))
  router.post('/atividades/:id/registro', requireRole(...DEV_READ, 'STUDENT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const a = await prisma.acaProgramaAtividade.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!a) fail(404, 'Atividade não encontrada.')
    const b = parseBody(z.object({ studentId: optStr(60), status: z.enum(['PENDENTE', 'CONCLUIDA', 'FALTOU']).default('CONCLUIDA'), nota: z.number().min(0).max(100).nullish() }), req.body)
    const meu = meuId(req)
    const studentId = meu ?? b.studentId
    if (!studentId) fail(400, 'Informe o aluno.')
    if (meu && !['LEITURA', 'TRILHA'].includes(a.tipo)) fail(403, 'Esta atividade é registrada pela equipe do programa.')
    if (meu && (b.studentId && b.studentId !== meu)) fail(403, 'Você só pode registrar a sua participação.')
    if (!meu && !temPapel(req, 'COORDINATOR', 'SUPPORT', 'TEACHER')) fail(403, 'Sem permissão.')
    const ins = await prisma.acaProgramaInscricao.findFirst({ where: { programaId: a.programaId, studentId, status: { in: ['ATIVA', 'CONCLUIDA'] } } })
    if (!ins) fail(409, 'O aluno não está inscrito (ativo) neste programa.')
    const r = await prisma.acaAtividadeRegistro.upsert({ where: { atividadeId_studentId: { atividadeId: a.id, studentId } }, create: { tenantId, atividadeId: a.id, programaId: a.programaId, studentId, status: b.status, nota: b.nota ?? null }, update: { status: b.status, nota: b.nota ?? null, concluidaEm: new Date() } })
    await recalcularProgresso(tenantId, a.programaId, studentId)
    res.json(r)
  }))

  async function recalcularProgresso(tenantId: string, programaId: string, studentId?: string) {
    const obrig = await prisma.acaProgramaAtividade.findMany({ where: { tenantId, programaId, obrigatoria: true }, select: { id: true } })
    const insc = await prisma.acaProgramaInscricao.findMany({ where: { programaId, ...(studentId ? { studentId } : {}) } })
    for (const i of insc) {
      const feitas = obrig.length ? await prisma.acaAtividadeRegistro.count({ where: { programaId, studentId: i.studentId, status: 'CONCLUIDA', atividadeId: { in: obrig.map((o) => o.id) } } }) : 0
      await prisma.acaProgramaInscricao.update({ where: { id: i.id }, data: { progresso: obrig.length ? Math.round((feitas / obrig.length) * 1000) / 10 : 0 } })
    }
  }

  // painel: desempenho por área + adesão
  router.get('/programas/:id/painel', leitura, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const p = await prisma.acaPrograma.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!p) fail(404, 'Programa não encontrado.')
    const [insc, ativ] = await Promise.all([prisma.acaProgramaInscricao.findMany({ where: { programaId: p.id } }), prisma.acaProgramaAtividade.findMany({ where: { programaId: p.id } })])
    const simIds = uniq(ativ.map((a) => a.simuladoId).filter(Boolean) as string[])
    const ativos = insc.filter((i) => ['ATIVA', 'CONCLUIDA'].includes(i.status))
    const tent = simIds.length ? await prisma.desTentativa.findMany({ where: { tenantId, simuladoId: { in: simIds }, studentId: { in: ativos.map((i) => i.studentId) }, status: 'ENVIADA' } }) : []
    const eixos = p.exameId ? await prisma.desEixo.findMany({ where: { tenantId, exameId: p.exameId } }) : []
    const nomeEixo = new Map(eixos.map((e) => [e.id, { nome: e.nome, meta: e.metaAcerto }]))
    const acc = new Map<string, { acertos: number; total: number }>()
    for (const t of tent) for (const e of (Array.isArray(t.porEixo) ? (t.porEixo as any[]) : [])) { const o = acc.get(e.eixoId) ?? { acertos: 0, total: 0 }; o.acertos += e.acertos ?? 0; o.total += e.total ?? 0; acc.set(e.eixoId, o) }
    const porArea = [...acc.entries()].map(([eixoId, v]) => ({ eixoId, area: nomeEixo.get(eixoId)?.nome ?? eixoId, meta: nomeEixo.get(eixoId)?.meta ?? p.metaPercentual, percentual: v.total ? Math.round((v.acertos / v.total) * 1000) / 10 : null, questoes: v.total })).sort((a, b) => (a.percentual ?? 0) - (b.percentual ?? 0))
    const percentuais = tent.map((t) => t.percentual).filter((x): x is number => x !== null)
    res.json({
      programa: { id: p.id, nome: p.nome, tipo: p.tipo, alvo: p.alvo, status: p.status, metaPercentual: p.metaPercentual },
      inscritos: { ativos: insc.filter((i) => i.status === 'ATIVA').length, concluidos: insc.filter((i) => i.status === 'CONCLUIDA').length, listaEspera: insc.filter((i) => i.status === 'LISTA_ESPERA').length, desistentes: insc.filter((i) => i.status === 'DESISTENTE').length, vagas: p.vagas },
      progressoMedio: ativos.length ? Math.round((ativos.reduce((s, i) => s + i.progresso, 0) / ativos.length) * 10) / 10 : 0,
      atividades: { total: ativ.length, simulados: simIds.length }, tentativas: tent.length,
      mediaSimulados: percentuais.length ? Math.round((percentuais.reduce((a, b) => a + b, 0) / percentuais.length) * 10) / 10 : null,
      acimaDaMeta: percentuais.filter((x) => x >= p.metaPercentual).length, porArea,
    })
  }))

  // ranking opcional (somente quem consentiu; nomes abreviados)
  router.get('/programas/:id/ranking', requireRole(...DEV_READ, 'STUDENT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const p = await prisma.acaPrograma.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!p) fail(404, 'Programa não encontrado.')
    if (!p.rankingAtivo) fail(409, 'Este programa não utiliza ranking.')
    const ativ = await prisma.acaProgramaAtividade.findMany({ where: { programaId: p.id, simuladoId: { not: null } } })
    const simIds = uniq(ativ.map((a) => a.simuladoId!))
    const insc = await prisma.acaProgramaInscricao.findMany({ where: { programaId: p.id, status: { in: ['ATIVA', 'CONCLUIDA'] } } })
    const optIn = insc.filter((i) => i.rankingOptIn)
    const tent = simIds.length ? await prisma.desTentativa.findMany({ where: { tenantId, simuladoId: { in: simIds }, studentId: { in: optIn.map((i) => i.studentId) }, percentual: { not: null } } }) : []
    const por = new Map<string, number[]>()
    for (const t of tent) por.set(t.studentId, [...(por.get(t.studentId) ?? []), t.percentual!])
    const itens = [...por.entries()].map(([studentId, v]) => ({ studentId, valor: Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10, simulados: v.length }))
    const rk = rankear(itens)
    const nomes = await nomesAlunos(tenantId, rk.map((r) => r.studentId))
    const meu = meuId(req)
    const staff = roleOf(req) !== 'STUDENT'
    res.json({
      participantes: optIn.length, totalInscritos: insc.length,
      items: rk.map((r) => ({ posicao: r.posicao, aluno: staff || r.studentId === meu ? (staff ? nomes.get(r.studentId)?.nomeCompleto : 'Você') : mascararNome(nomes.get(r.studentId)?.nomeCompleto), percentual: r.valor, simulados: r.simulados, voce: r.studentId === meu })),
      minhaPosicao: meu ? rk.find((r) => r.studentId === meu)?.posicao ?? null : undefined,
      aviso: 'O ranking é opcional: só aparecem alunos que consentiram. Cada aluno pode sair a qualquer momento.',
    })
  }))

  // simulado do programa (usa o banco de questões do módulo desempenho)
  router.post('/programas/:id/simulados', gestao, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const p = await prisma.acaPrograma.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!p) fail(404, 'Programa não encontrado.')
    if (!p.exameId) fail(409, 'Vincule o programa a um exame (ENADE, OAB, ENAMED...) para usar o banco de questões.')
    const b = parseBody(z.object({ titulo: z.string().min(3).max(160), total: z.number().int().min(1).max(200).default(20), duracaoMin: z.number().int().min(10).max(600).optional(), abreEm: optDate(), fechaEm: optDate(), dataPrevista: optDate(), seed: z.number().int().optional() }), req.body)
    const ex = await prisma.desExame.findFirst({ where: { id: p.exameId, tenantId }, include: { eixos: { where: { ativo: true } } } })
    if (!ex) fail(404, 'Exame não encontrado.')
    const dist = distribuirPorPeso(b.total, ex.eixos.map((e) => ({ id: e.id, peso: e.peso })))
    const matriz = Object.entries(dist).filter(([, n]) => n > 0).map(([eixoId, quantidade]) => ({ eixoId, quantidade }))
    const pool = await prisma.desQuestao.findMany({ where: { tenantId, exameId: ex.id, status: 'PUBLICADO', tipo: 'OBJETIVA' }, select: { id: true, eixoId: true, nivel: true, totalRespostas: true } })
    const sel = montarSimulado(pool.map((q): QuestaoPool => ({ id: q.id, eixoId: q.eixoId, nivel: q.nivel as any, usos: q.totalRespostas })), matriz as any, b.seed ?? Date.now() % 100000)
    if (!sel.selecionadas.length) fail(422, 'Não há questões PUBLICADAS suficientes no banco deste exame. Importe/publique questões primeiro.')
    const insc = await prisma.acaProgramaInscricao.findMany({ where: { programaId: p.id, status: { in: ['ATIVA', 'CONCLUIDA'] } }, select: { studentId: true } })
    const sim = await prisma.desSimulado.create({
      data: {
        tenantId, exameId: ex.id, titulo: b.titulo, status: 'PUBLICADO', abreEm: b.abreEm ?? undefined, fechaEm: b.fechaEm ?? undefined, duracaoMin: b.duracaoMin ?? Math.max(30, sel.selecionadas.length * 3), matriz: matriz as any, criadoPorId: uid(req),
        questoes: { create: sel.selecionadas.map((s, i) => ({ tenantId, questaoId: s.questaoId, eixoId: s.eixoId, ordem: i + 1 })) },
        alvos: { create: insc.map((i) => ({ tenantId, studentId: i.studentId })) },
      },
    })
    const ativ = await prisma.acaProgramaAtividade.create({ data: { tenantId, programaId: p.id, tipo: 'SIMULADO', titulo: b.titulo, simuladoId: sim.id, dataPrevista: b.dataPrevista ?? b.abreEm ?? undefined, duracaoMin: sim.duracaoMin } })
    await audit({ tenantId, userId: uid(req), modulo: MOD, acao: 'SIMULADO_PROGRAMA', refType: 'DesSimulado', refId: sim.id, detalhes: { programaId: p.id, questoes: sel.selecionadas.length } })
    res.status(201).json({ simuladoId: sim.id, atividadeId: ativ.id, questoes: sel.selecionadas.length, faltantes: sel.faltantes, alunosConvidados: insc.length })
  }))

  // reaproveita o banco de provas-ia: copia questões objetivas de uma avaliação para o banco do exame (rascunho/publicado)
  router.post('/programas/:id/importar-questoes-provas', gestao, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const p = await prisma.acaPrograma.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!p) fail(404, 'Programa não encontrado.')
    if (!p.exameId) fail(409, 'Vincule o programa a um exame antes de importar questões.')
    const b = parseBody(z.object({ assessmentId: z.string().min(1), eixoId: optStr(60), publicar: z.boolean().default(false) }), req.body)
    const as = await prisma.assessment.findFirst({ where: { id: b.assessmentId, discipline: { tenantId } }, include: { questoes: true } })
    if (!as) fail(404, 'Avaliação não encontrada.')
    if (b.eixoId) { const e = await prisma.desEixo.findFirst({ where: { id: b.eixoId, tenantId, exameId: p.exameId } }); if (!e) fail(400, 'Eixo não pertence ao exame do programa.') }
    let importadas = 0, ignoradas = 0
    for (const q of as.questoes) {
      const alts = Array.isArray(q.alternativas) ? (q.alternativas as any[]) : []
      if (q.tipo !== 'MULTIPLA_ESCOLHA' || alts.length < 2 || alts.filter((a) => a?.correta).length !== 1) { ignoradas++; continue }
      const fonte = `provas-ia:${q.id}`
      if (await prisma.desQuestao.findFirst({ where: { tenantId, exameId: p.exameId, fonte } })) { ignoradas++; continue }
      const letras = 'ABCDEFGHIJ'
      const alternativas = alts.map((a, i) => ({ letra: letras[i], texto: String(a?.texto ?? '') }))
      const gabarito = letras[alts.findIndex((a) => a?.correta)]
      await prisma.desQuestao.create({ data: { tenantId, exameId: p.exameId, eixoId: b.eixoId ?? undefined, disciplineId: as.disciplineId, tipo: 'OBJETIVA', enunciado: q.enunciado, alternativas: alternativas as any, gabarito, fonte, origem: 'IMPORTADA', status: b.publicar ? 'PUBLICADO' : 'RASCUNHO', criadoPorId: uid(req) } })
      importadas++
    }
    await audit({ tenantId, userId: uid(req), modulo: MOD, acao: 'IMPORTAR_QUESTOES_PROVAS', refType: 'Assessment', refId: as.id, detalhes: { importadas, ignoradas } })
    res.json({ importadas, ignoradas, status: b.publicar ? 'PUBLICADO' : 'RASCUNHO' })
  }))

  // =============================================================== competências / desenvolvimento pessoal
  router.get('/competencias', requireRole(...DEV_READ, 'STUDENT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => { res.json({ items: await prisma.acaCompetencia.findMany({ where: { tenantId: tid(req), ativo: true }, orderBy: { nome: 'asc' } }) }) }))
  router.post('/competencias/bootstrap', gestao, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    let criadas = 0
    for (const c of COMPETENCIAS_PADRAO) { const ex = await prisma.acaCompetencia.findFirst({ where: { tenantId, codigo: c.codigo } }); if (!ex) { await prisma.acaCompetencia.create({ data: { ...c, tenantId } }); criadas++ } }
    res.json({ criadas, total: COMPETENCIAS_PADRAO.length })
  }))
  router.post('/competencias', gestao, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ codigo: z.string().min(2).max(40), nome: z.string().min(3).max(100), dominio: z.enum(['AUTOCONHECIMENTO', 'AUTORREGULACAO', 'CONSCIENCIA_SOCIAL', 'RELACIONAMENTO', 'TOMADA_DECISAO', 'COMUNICACAO', 'LIDERANCA', 'PENSAMENTO_CRITICO']), descricao: optStr(500) }), req.body)
    if (await prisma.acaCompetencia.findFirst({ where: { tenantId, codigo: b.codigo } })) fail(409, 'Código já cadastrado.')
    res.status(201).json(await prisma.acaCompetencia.create({ data: { ...b, tenantId } }))
  }))
  router.post('/competencias/avaliar', requireRole(...DEV_READ, 'STUDENT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ studentId: optStr(60), competenciaId: z.string().min(1), periodo: z.string().min(4).max(12), origem: z.enum(['AUTO', 'PROFESSOR', 'MENTOR', 'PAR']).default('AUTO'), nota: z.number().int().min(1).max(5), evidencia: optStr(1000) }), req.body)
    const meu = meuId(req)
    const studentId = meu ?? b.studentId
    if (!studentId) fail(400, 'Informe o aluno.')
    if (meu && (b.origem !== 'AUTO' || (b.studentId && b.studentId !== meu))) fail(403, 'Alunos registram apenas a própria autoavaliação.')
    if (!meu && b.origem === 'AUTO') fail(400, 'A autoavaliação é feita pelo próprio aluno.')
    await assertNoTenant(tenantId, 'student', studentId, 'Aluno')
    await assertNoTenant(tenantId, 'acaCompetencia', b.competenciaId, 'Competência')
    res.status(201).json(await prisma.acaAvaliacaoCompetencia.create({ data: { tenantId, studentId, competenciaId: b.competenciaId, periodo: b.periodo, origem: b.origem, nota: b.nota, evidencia: b.evidencia, avaliadorId: uid(req) } }))
  }))
  router.get('/alunos/:id/competencias', requireRole(...DEV_READ, 'STUDENT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const id = String(req.params.id)
    exigirProprioOuStaff(req, id)
    await assertNoTenant(tenantId, 'student', id, 'Aluno')
    const [comp, av] = await Promise.all([prisma.acaCompetencia.findMany({ where: { tenantId, ativo: true } }), prisma.acaAvaliacaoCompetencia.findMany({ where: { tenantId, studentId: id }, orderBy: { createdAt: 'asc' } })])
    const items = comp.map((c) => {
      const l = av.filter((a) => a.competenciaId === c.id)
      const med = (o: string) => { const x = l.filter((a) => a.origem === o).map((a) => a.nota); return x.length ? Math.round((x.reduce((s, v) => s + v, 0) / x.length) * 10) / 10 : null }
      const todos = l.map((a) => a.nota)
      const periodos = uniq(l.map((a) => a.periodo)).sort()
      return { id: c.id, codigo: c.codigo, nome: c.nome, dominio: c.dominio, auto: med('AUTO'), professor: med('PROFESSOR'), mentor: med('MENTOR'), par: med('PAR'), media: todos.length ? Math.round((todos.reduce((s, v) => s + v, 0) / todos.length) * 10) / 10 : null, evolucao: periodos.map((p) => { const x = l.filter((a) => a.periodo === p).map((a) => a.nota); return { periodo: p, media: Math.round((x.reduce((s, v) => s + v, 0) / x.length) * 10) / 10 } }) }
    })
    res.json({ items, percepcaoDivergente: items.filter((i) => i.auto !== null && (i.professor !== null || i.mentor !== null) && Math.abs((i.auto ?? 0) - ((i.professor ?? i.mentor) ?? 0)) >= 1.5).map((i) => i.nome) })
  }))

  // =============================================================== plano individual
  router.post('/planos', gestao, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ studentId: z.string().min(1), titulo: z.string().min(3).max(160), objetivo: optStr(2000), mentorUserId: optStr(60), programaId: optStr(60), vigenciaInicio: optDate(), vigenciaFim: optDate(), visivelAoAluno: z.boolean().default(true), metas: z.array(z.object({ descricao: z.string().min(3).max(300), area: z.enum(['ACADEMICA', 'PROFISSIONAL', 'PESSOAL', 'SOCIOEMOCIONAL', 'SAUDE']).default('ACADEMICA'), prazo: optDate(), indicador: optStr(200) })).max(30).default([]) }), req.body)
    await assertNoTenant(tenantId, 'student', b.studentId, 'Aluno')
    if (b.mentorUserId) await assertNoTenant(tenantId, 'user', b.mentorUserId, 'Mentor')
    if (b.programaId) await assertNoTenant(tenantId, 'acaPrograma', b.programaId, 'Programa')
    if (b.vigenciaInicio && b.vigenciaFim && b.vigenciaFim < b.vigenciaInicio) fail(400, 'A vigência final deve ser posterior à inicial.')
    const { metas, ...dados } = b
    const pl = await prisma.acaPlanoIndividual.create({ data: { ...dados, tenantId, mentorUserId: dados.mentorUserId ?? uid(req), metas: { create: metas.map((m) => ({ ...m, tenantId })) } }, include: { metas: true } })
    await audit({ tenantId, userId: uid(req), modulo: MOD, acao: 'PLANO_INDIVIDUAL', refType: 'AcaPlanoIndividual', refId: pl.id })
    res.status(201).json(pl)
  }))
  router.get('/planos', requireRole(...DEV_READ, 'STUDENT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const where: any = { tenantId }
    const meu = meuId(req)
    if (roleOf(req) === 'STUDENT') { where.studentId = meu ?? '-'; where.visivelAoAluno = true } else if (qs(req.query.studentId)) where.studentId = qs(req.query.studentId)
    if (qs(req.query.status)) where.status = qs(req.query.status)
    const items = await prisma.acaPlanoIndividual.findMany({ where, orderBy: { createdAt: 'desc' }, include: { metas: true }, take: 200 })
    const m = await nomesAlunos(tenantId, items.map((i) => i.studentId))
    res.json({ items: items.map((i) => ({ ...i, aluno: m.get(i.studentId) ?? null, progresso: i.metas.length ? Math.round(i.metas.reduce((s, x) => s + x.progresso, 0) / i.metas.length) : 0 })) })
  }))
  router.patch('/planos/:id', gestao, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const p = await prisma.acaPlanoIndividual.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!p) fail(404, 'Plano não encontrado.')
    const b = parseBody(z.object({ titulo: z.string().min(3).max(160), objetivo: optStr(2000), status: z.enum(['RASCUNHO', 'ATIVO', 'CONCLUIDO', 'CANCELADO']), visivelAoAluno: z.boolean() }).partial(), req.body)
    res.json(await prisma.acaPlanoIndividual.update({ where: { id: p.id }, data: Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined)) as any }))
  }))
  router.patch('/planos-metas/:id', requireRole(...DEV_READ, 'STUDENT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const m = await prisma.acaPlanoMeta.findFirst({ where: { id: String(req.params.id), tenantId }, include: { plano: true } })
    if (!m) fail(404, 'Meta não encontrada.')
    if (roleOf(req) === 'STUDENT' && m.plano.studentId !== meuId(req)) fail(403, 'Sem permissão.')
    const b = parseBody(z.object({ status: z.enum(['ABERTA', 'EM_ANDAMENTO', 'ATINGIDA', 'NAO_ATINGIDA']), progresso: z.number().int().min(0).max(100), evidencia: optStr(1000) }).partial(), req.body)
    const data: any = { ...b }
    if (b.status === 'ATINGIDA') data.progresso = 100
    res.json(await prisma.acaPlanoMeta.update({ where: { id: m.id }, data }))
  }))
  router.post('/planos/:id/metas', gestao, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const p = await prisma.acaPlanoIndividual.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!p) fail(404, 'Plano não encontrado.')
    const b = parseBody(z.object({ descricao: z.string().min(3).max(300), area: z.enum(['ACADEMICA', 'PROFISSIONAL', 'PESSOAL', 'SOCIOEMOCIONAL', 'SAUDE']).default('ACADEMICA'), prazo: optDate(), indicador: optStr(200) }), req.body)
    res.status(201).json(await prisma.acaPlanoMeta.create({ data: { ...b, tenantId, planoId: p.id } }))
  }))

  // =============================================================== acompanhamento didático e pedagógico
  router.post('/acompanhamentos', requireRole('COORDINATOR', 'TEACHER', 'SUPPORT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ studentId: z.string().min(1), tipo: z.enum(['DIDATICO', 'PEDAGOGICO']).default('DIDATICO'), disciplineId: optStr(60), classSectionId: optStr(60), data: optDate(), resumo: z.string().min(5).max(3000), dificuldades: optStr(2000), estrategias: optStr(2000), resultado: optStr(2000), proximoPassoEm: optDate(), sigilo: z.enum(['NORMAL', 'RESTRITO']).default('NORMAL') }), req.body)
    await assertNoTenant(tenantId, 'student', b.studentId, 'Aluno')
    if (b.disciplineId) await assertNoTenant(tenantId, 'discipline', b.disciplineId, 'Disciplina')
    if (b.tipo === 'PEDAGOGICO' && roleOf(req) === 'TEACHER') fail(403, 'O acompanhamento pedagógico é registrado pela coordenação/apoio.')
    const a = await prisma.acaAcompanhamento.create({ data: { ...b, tenantId, autorUserId: uid(req), data: b.data ?? new Date() } })
    await audit({ tenantId, userId: uid(req), modulo: MOD, acao: 'ACOMPANHAMENTO', refType: 'AcaAcompanhamento', refId: a.id, detalhes: { tipo: b.tipo } })
    res.status(201).json(a)
  }))
  router.get('/acompanhamentos', requireRole('COORDINATOR', 'TEACHER', 'SUPPORT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    if (qs(req.query.studentId)) where.studentId = qs(req.query.studentId)
    if (qs(req.query.tipo)) where.tipo = qs(req.query.tipo)
    if (!isSuper(req) && !['COORDINATOR', 'SUPPORT'].includes(roleOf(req))) where.autorUserId = uid(req)   // professor vê o que registrou
    else if (!isSuper(req) && roleOf(req) === 'COORDINATOR') where.OR = [{ sigilo: 'NORMAL' }, { autorUserId: uid(req) }]
    const [items, total] = await Promise.all([prisma.acaAcompanhamento.findMany({ where, orderBy: { data: 'desc' }, skip, take }), prisma.acaAcompanhamento.count({ where })])
    const m = await nomesAlunos(tenantId, items.map((i) => i.studentId))
    res.json({ items: items.map((i) => ({ ...i, aluno: m.get(i.studentId) ?? null })), total, page, pageSize })
  }))

  // =============================================================== avaliação global
  async function coletarEntrada(tenantId: string, studentId: string, periodo: string) {
    const ha12m = new Date(Date.now() - 365 * 86_400_000)
    const [res1, receb, ocor, horas, projetos, ativPct, anterior] = await Promise.all([
      prisma.ntResultado.findMany({ where: { tenantId, studentId }, select: { mediaFinal: true, mediaParcial: true, frequenciaPct: true } }),
      prisma.accountReceivable.findMany({ where: { tenantId, studentId, status: { in: ['PENDENTE', 'ATRASADO'] }, dataVencimento: { lt: new Date() } }, select: { dataVencimento: true } }),
      prisma.apoOcorrencia.findMany({ where: { tenantId, studentId, dataFato: { gte: ha12m } }, select: { gravidade: true } }),
      prisma.acaHoraComplementar.findMany({ where: { tenantId, studentId, status: { in: ['APROVADA', 'PARCIAL'] } }, select: { categoria: true, horasValidadas: true } }),
      prisma.pesProjetoMembro.count({ where: { tenantId, studentId, dataFim: null } }),
      prisma.acaProgramaInscricao.findMany({ where: { studentId, status: { in: ['ATIVA', 'CONCLUIDA'] } }, select: { progresso: true } }),
      prisma.acaAvaliacaoGlobal.findFirst({ where: { tenantId, studentId, periodo: { not: periodo } }, orderBy: { createdAt: 'desc' }, select: { scoreGlobal: true } }),
    ])
    const medias = res1.map((r) => r.mediaFinal ?? r.mediaParcial).filter((x): x is number => x !== null && x !== undefined)
    const fr = res1.map((r) => r.frequenciaPct).filter((x): x is number => x !== null && x !== undefined)
    const atraso = receb.length ? Math.max(...receb.map((r) => Math.floor((Date.now() - r.dataVencimento.getTime()) / 86_400_000))) : 0
    return {
      mediasFinais: medias, frequenciaPct: fr.length ? fr.reduce((a, b) => a + b, 0) / fr.length : null, atividadesConcluidasPct: ativPct.length ? ativPct.reduce((s, i) => s + i.progresso, 0) / ativPct.length : null,
      parcelasVencidas: receb.length, maiorAtrasoDias: atraso, ocorrencias: ocor.map((o) => ({ gravidade: o.gravidade })),
      horasPesquisaExtensao: horas.filter((h) => ['PESQUISA', 'EXTENSAO', 'LIGA'].includes(h.categoria)).reduce((s, h) => s + h.horasValidadas, 0), horasComplementares: horas.reduce((s, h) => s + h.horasValidadas, 0), projetosAtivos: projetos, scoreAnterior: anterior?.scoreGlobal ?? null,
    }
  }
  async function gerarUma(tenantId: string, studentId: string, periodo: string, userId: string, termId?: string) {
    const entrada = await coletarEntrada(tenantId, studentId, periodo)
    const r = calcularGlobal(entrada)
    const dados = { notaAcademica: r.notaAcademica, frequenciaPct: r.frequenciaPct, engajamento: r.engajamento, financeiroScore: r.financeiroScore, ocorrencias: r.ocorrencias, horasPesquisaExtensao: entrada.horasPesquisaExtensao, horasComplementares: entrada.horasComplementares, scoreGlobal: r.scoreGlobal, faixa: r.faixa, componentes: { ...r.componentes, bonus: r.bonus, penalidade: r.penalidade } as any, alertas: r.alertas as any, geradaPorId: userId, termId: termId ?? null }
    return prisma.acaAvaliacaoGlobal.upsert({ where: { tenantId_studentId_periodo: { tenantId, studentId, periodo } }, create: { ...dados, tenantId, studentId, periodo }, update: dados })
  }

  router.post('/avaliacoes-globais/gerar', requireRole('COORDINATOR', 'SUPPORT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ studentId: optStr(60), programId: optStr(60), termId: optStr(60), periodo: z.string().min(4).max(12).optional() }), req.body)
    let periodo = b.periodo
    if (b.termId) { const t = await prisma.academicTerm.findFirst({ where: { id: b.termId, tenantId } }); if (!t) fail(404, 'Período letivo não encontrado.'); periodo = periodo ?? t.codigo }
    periodo = periodo ?? `${new Date().getFullYear()}/${new Date().getMonth() < 6 ? 1 : 2}`
    let ids: string[] = []
    if (b.studentId) { await assertNoTenant(tenantId, 'student', b.studentId, 'Aluno'); ids = [b.studentId] }
    else {
      const w: any = { status: { in: ['ATIVA', 'TRANCADA'] }, student: { tenantId } }
      if (b.programId) { await assertNoTenant(tenantId, 'academicProgram', b.programId, 'Curso'); w.programId = b.programId }
      if (b.termId) w.termId = b.termId
      ids = uniq((await prisma.enrollment.findMany({ where: w, select: { studentId: true }, take: 5000 })).map((e) => e.studentId))
    }
    if (!ids.length) fail(404, 'Nenhum aluno encontrado para avaliar.')
    const out = []
    for (const id of ids) out.push(await gerarUma(tenantId, id, periodo, uid(req), b.termId))
    await audit({ tenantId, userId: uid(req), modulo: MOD, acao: 'AVALIACAO_GLOBAL', refType: 'AcaAvaliacaoGlobal', detalhes: { alunos: ids.length, periodo } })
    const faixas: Record<string, number> = {}
    for (const o of out) faixas[o.faixa] = (faixas[o.faixa] ?? 0) + 1
    res.status(201).json({ periodo, geradas: out.length, faixas, items: ids.length === 1 ? out : undefined })
  }))

  router.get('/avaliacoes-globais', leitura, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    for (const k of ['faixa', 'periodo', 'studentId']) if (qs((req.query as any)[k])) where[k] = qs((req.query as any)[k])
    const [items, total] = await Promise.all([prisma.acaAvaliacaoGlobal.findMany({ where, orderBy: [{ scoreGlobal: 'asc' }], skip, take }), prisma.acaAvaliacaoGlobal.count({ where })])
    const m = await nomesAlunos(tenantId, items.map((i) => i.studentId))
    res.json({ items: items.map((i) => ({ ...i, aluno: m.get(i.studentId) ?? null })), total, page, pageSize })
  }))
  router.get('/meu/avaliacao-global', requireRole('STUDENT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const a = await prisma.acaAvaliacaoGlobal.findFirst({ where: { tenantId, studentId: meuId(req) ?? '-' }, orderBy: { createdAt: 'desc' } })
    if (!a) return void res.json({ avaliacao: null })
    // o aluno vê o próprio panorama, sem ocorrências disciplinares detalhadas nem alertas internos
    res.json({ avaliacao: { periodo: a.periodo, notaAcademica: a.notaAcademica, frequenciaPct: a.frequenciaPct, engajamento: a.engajamento, financeiroScore: a.financeiroScore, scoreGlobal: a.scoreGlobal, faixa: a.faixa, parecer: a.parecer } })
  }))
  router.get('/avaliacoes-globais/:id', leitura, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const a = await prisma.acaAvaliacaoGlobal.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!a) fail(404, 'Avaliação não encontrada.')
    if (a.ocorrencias > 0) await registrarAcessoSensivel(req, { recurso: 'desenvolvimento/avaliacoes-globais', recursoId: a.id, categoria: 'DISCIPLINAR', titularTipo: 'ALUNO', titularId: a.studentId })
    const [aluno, hist, orient] = await Promise.all([nomesAlunos(tenantId, [a.studentId]), prisma.acaAvaliacaoGlobal.findMany({ where: { tenantId, studentId: a.studentId }, orderBy: { createdAt: 'asc' }, select: { periodo: true, scoreGlobal: true, faixa: true } }), prisma.acaOrientacao.count({ where: { tenantId, avaliacaoId: a.id } })])
    res.json({ ...a, aluno: aluno.get(a.studentId) ?? null, historico: hist, orientacoes: orient })
  }))
  router.patch('/avaliacoes-globais/:id/parecer', requireRole('COORDINATOR', 'SUPPORT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const a = await prisma.acaAvaliacaoGlobal.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!a) fail(404, 'Avaliação não encontrada.')
    const b = parseBody(z.object({ parecer: z.string().min(5).max(3000) }), req.body)
    res.json(await prisma.acaAvaliacaoGlobal.update({ where: { id: a.id }, data: { parecer: b.parecer, parecerPorId: uid(req) } }))
  }))
  router.post('/avaliacoes-globais/:id/orientacao', requireRole(...ORIENT), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const a = await prisma.acaAvaliacaoGlobal.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!a) fail(404, 'Avaliação não encontrada.')
    const alertas = (a.alertas as any[]) ?? []
    if (!alertas.length && a.faixa !== 'RISCO') fail(409, 'Não há alertas que justifiquem uma ação de orientação.')
    if (await prisma.acaOrientacao.findFirst({ where: { tenantId, avaliacaoId: a.id, status: { in: ['ABERTA', 'EM_ACOMPANHAMENTO', 'ENCAMINHADA'] } } })) fail(409, 'Já existe uma orientação aberta para esta avaliação.')
    const prioridade = prioridadeDosAlertas(alertas)
    const o = await prisma.acaOrientacao.create({
      data: { tenantId, studentId: a.studentId, tipo: a.faixa === 'RISCO' ? 'ALERTA_RISCO' : 'PLANO_ACAO', titulo: `Orientação — avaliação global ${a.periodo} (${a.faixa})`, descricao: alertas.map((x) => `• ${x.texto} → ${x.sugestao}`).join('\n'), origem: 'AVALIACAO_GLOBAL', avaliacaoId: a.id, prioridade, confidencialidade: 'RESTRITO', baseLegal: 'EXECUCAO_CONTRATO', responsavelUserId: uid(req), criadoPorId: uid(req), prazo: new Date(Date.now() + (prioridade === 'URGENTE' ? 3 : prioridade === 'ALTA' ? 7 : 15) * 86_400_000) },
    })
    await audit({ tenantId, userId: uid(req), modulo: MOD, acao: 'ORIENTACAO_DE_AVALIACAO', refType: 'AcaOrientacao', refId: o.id })
    res.status(201).json(o)
  }))

  // =============================================================== ações de orientação (confidencialidade + LGPD)
  const orSchema = z.object({
    studentId: z.string().min(1), tipo: z.enum(['ALERTA_RISCO', 'PLANO_ACAO', 'ENCAMINHAMENTO', 'ATENDIMENTO']).default('PLANO_ACAO'), titulo: z.string().min(3).max(200), descricao: optStr(4000), prioridade: z.enum(['BAIXA', 'MEDIA', 'ALTA', 'URGENTE']).default('MEDIA'),
    confidencialidade: z.enum(CONF).default('RESTRITO'), baseLegal: z.enum(['EXECUCAO_CONTRATO', 'TUTELA_SAUDE', 'CONSENTIMENTO', 'LEGITIMO_INTERESSE']).default('EXECUCAO_CONTRATO'), consentimentoAluno: z.boolean().default(false),
    responsavelUserId: optStr(60), encaminhadoPara: z.enum(['APOIO', 'PSICOLOGIA', 'FINANCEIRO', 'COORDENACAO', 'SECRETARIA', 'NAPNE']).nullish(), prazo: optDate(),
  })
  router.post('/orientacoes', requireRole('COORDINATOR', 'SUPPORT', 'TEACHER'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(orSchema, req.body)
    await assertNoTenant(tenantId, 'student', b.studentId, 'Aluno')
    if (b.responsavelUserId) await assertNoTenant(tenantId, 'user', b.responsavelUserId, 'Responsável')
    if (roleOf(req) === 'TEACHER' && !['ENCAMINHAMENTO', 'ALERTA_RISCO'].includes(b.tipo)) fail(403, 'Professores registram alertas e encaminhamentos; planos e atendimentos são da coordenação/apoio.')
    if (b.tipo === 'ATENDIMENTO' && b.confidencialidade === 'NORMAL') fail(400, 'Atendimentos devem ter confidencialidade restrita ou sigilosa.')
    if (b.baseLegal === 'CONSENTIMENTO' && !b.consentimentoAluno) fail(400, 'Registre o consentimento do aluno (ou do responsável, se menor) para usar esta base legal.')
    if (b.baseLegal === 'TUTELA_SAUDE' && !['SUPPORT'].includes(roleOf(req)) && !isSuper(req)) fail(403, 'A base "tutela da saúde" exige profissional da equipe de apoio.')
    const { consentimentoAluno, ...dados } = b
    const o = await prisma.acaOrientacao.create({ data: { ...dados, tenantId, origem: roleOf(req) === 'TEACHER' ? 'PROFESSOR' : 'MANUAL', criadoPorId: uid(req), responsavelUserId: b.responsavelUserId ?? (roleOf(req) === 'TEACHER' ? undefined : uid(req)), consentimentoAlunoEm: consentimentoAluno ? new Date() : null } })
    if (o.responsavelUserId && o.responsavelUserId !== uid(req)) await notify({ tenantId, userId: o.responsavelUserId, assunto: 'Nova ação de orientação', mensagem: `Você foi designado(a) para a orientação "${o.titulo}" (prioridade ${o.prioridade}).`, refType: 'AcaOrientacao', refId: o.id })
    await audit({ tenantId, userId: uid(req), modulo: MOD, acao: 'ORIENTACAO_CRIADA', refType: 'AcaOrientacao', refId: o.id, detalhes: { tipo: o.tipo, confidencialidade: o.confidencialidade, baseLegal: o.baseLegal } })
    res.status(201).json(o)
  }))
  router.get('/orientacoes', requireRole(...ORIENT), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    for (const k of ['status', 'prioridade', 'tipo', 'studentId', 'encaminhadoPara']) if (qs((req.query as any)[k])) where[k] = qs((req.query as any)[k])
    if (qs(req.query.minhas) === 'true') where.OR = [{ responsavelUserId: uid(req) }, { criadoPorId: uid(req) }]
    // sigilosas só aparecem para o responsável/criador (e administração)
    if (!isSuper(req)) where.AND = [{ OR: [{ confidencialidade: { not: 'SIGILOSO' } }, { criadoPorId: uid(req) }, { responsavelUserId: uid(req) }] }]
    const [rows, total] = await Promise.all([prisma.acaOrientacao.findMany({ where, orderBy: [{ prioridade: 'desc' }, { createdAt: 'desc' }], skip, take }), prisma.acaOrientacao.count({ where })])
    const m = await nomesAlunos(tenantId, rows.map((i) => i.studentId))
    res.json({ items: rows.map((o) => ({ ...o, descricao: podeVerOrientacao(req, o).detalhe ? o.descricao : '[restrito]', aluno: m.get(o.studentId) ?? null, vencida: !!o.prazo && o.prazo < new Date() && !['CONCLUIDA', 'CANCELADA'].includes(o.status) })), total, page, pageSize })
  }))
  router.get('/orientacoes/:id', requireRole(...ORIENT, 'TEACHER'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const o = await prisma.acaOrientacao.findFirst({ where: { id: String(req.params.id), tenantId }, include: { registros: { orderBy: { data: 'asc' } } } })
    if (!o) fail(404, 'Orientação não encontrada.')
    const perm = podeVerOrientacao(req, o)
    if (!perm.ver) fail(403, 'Esta orientação tem confidencialidade que não permite o seu acesso.')
    await registrarAcessoSensivel(req, { recurso: 'desenvolvimento/orientacoes', recursoId: o.id, categoria: o.baseLegal === 'TUTELA_SAUDE' ? 'SAUDE' : 'DISCIPLINAR', titularTipo: 'ALUNO', titularId: o.studentId, acao: 'LEITURA' })
    const m = await nomesAlunos(tenantId, [o.studentId])
    res.json({ ...o, descricao: perm.detalhe ? o.descricao : '[restrito]', registros: perm.detalhe ? o.registros.filter((r) => r.confidencialidade !== 'SIGILOSO' || r.autorUserId === uid(req) || isSuper(req)) : [], aluno: m.get(o.studentId) ?? null })
  }))
  router.post('/orientacoes/:id/registros', requireRole(...ORIENT), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const o = await prisma.acaOrientacao.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!o) fail(404, 'Orientação não encontrada.')
    if (!podeVerOrientacao(req, o).detalhe) fail(403, 'Sem permissão para registrar nesta orientação.')
    if (['CONCLUIDA', 'CANCELADA'].includes(o.status)) fail(409, 'A orientação está encerrada.')
    const b = parseBody(z.object({ tipo: z.enum(['NOTA', 'ATENDIMENTO', 'ENCAMINHAMENTO', 'RETORNO']).default('NOTA'), texto: z.string().min(3).max(4000), confidencialidade: z.enum(CONF).optional() }), req.body)
    const r = await prisma.acaOrientacaoRegistro.create({ data: { tenantId, orientacaoId: o.id, tipo: b.tipo, texto: b.texto, autorUserId: uid(req), confidencialidade: b.confidencialidade ?? o.confidencialidade } })
    if (o.status === 'ABERTA') await prisma.acaOrientacao.update({ where: { id: o.id }, data: { status: 'EM_ACOMPANHAMENTO' } })
    await registrarAcessoSensivel(req, { recurso: 'desenvolvimento/orientacoes', recursoId: o.id, categoria: 'SAUDE', titularTipo: 'ALUNO', titularId: o.studentId, acao: 'ESCRITA' })
    res.status(201).json(r)
  }))
  router.post('/orientacoes/:id/status', requireRole(...ORIENT), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const o = await prisma.acaOrientacao.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!o) fail(404, 'Orientação não encontrada.')
    if (!podeVerOrientacao(req, o).ver) fail(403, 'Sem permissão.')
    const b = parseBody(z.object({ status: z.enum(['EM_ACOMPANHAMENTO', 'ENCAMINHADA', 'CONCLUIDA', 'CANCELADA']), encaminhadoPara: z.enum(['APOIO', 'PSICOLOGIA', 'FINANCEIRO', 'COORDENACAO', 'SECRETARIA', 'NAPNE']).optional(), responsavelUserId: optStr(60), texto: optStr(1000) }), req.body)
    if (['CONCLUIDA', 'CANCELADA'].includes(o.status)) fail(409, 'A orientação já está encerrada.')
    if (b.status === 'ENCAMINHADA' && !b.encaminhadoPara) fail(400, 'Informe para onde a orientação foi encaminhada.')
    if (b.status === 'CONCLUIDA' && !b.texto) fail(400, 'Descreva o desfecho para concluir.')
    if (b.responsavelUserId) await assertNoTenant(tenantId, 'user', b.responsavelUserId, 'Responsável')
    const u = await prisma.acaOrientacao.update({ where: { id: o.id }, data: { status: b.status, encaminhadoPara: b.encaminhadoPara ?? o.encaminhadoPara, responsavelUserId: b.responsavelUserId ?? o.responsavelUserId, concluidoEm: ['CONCLUIDA', 'CANCELADA'].includes(b.status) ? new Date() : null } })
    if (b.texto || b.status === 'ENCAMINHADA') await prisma.acaOrientacaoRegistro.create({ data: { tenantId, orientacaoId: o.id, tipo: b.status === 'ENCAMINHADA' ? 'ENCAMINHAMENTO' : b.status === 'CONCLUIDA' ? 'CONCLUSAO' : 'NOTA', texto: b.texto ?? `Encaminhada para ${b.encaminhadoPara}.`, autorUserId: uid(req), confidencialidade: o.confidencialidade } })
    if (b.responsavelUserId && b.responsavelUserId !== o.responsavelUserId) await notify({ tenantId, userId: b.responsavelUserId, assunto: 'Orientação atribuída', mensagem: `A orientação "${o.titulo}" foi atribuída a você.`, refType: 'AcaOrientacao', refId: o.id })
    await audit({ tenantId, userId: uid(req), modulo: MOD, acao: 'ORIENTACAO_STATUS', refType: 'AcaOrientacao', refId: o.id, detalhes: { status: b.status } })
    res.json(u)
  }))
  // o aluno vê apenas o que é NORMAL e foi dirigido a ele (plano de ação/encaminhamento), nunca alertas internos
  router.get('/meu/orientacoes', requireRole('STUDENT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const items = await prisma.acaOrientacao.findMany({ where: { tenantId, studentId: meuId(req) ?? '-', confidencialidade: 'NORMAL', tipo: { in: ['PLANO_ACAO', 'ENCAMINHAMENTO'] } }, orderBy: { createdAt: 'desc' }, select: { id: true, tipo: true, titulo: true, descricao: true, status: true, prazo: true, createdAt: true } })
    res.json({ items })
  }))
  // direito de acesso do titular (LGPD art. 18): quem acessou os dados sensíveis de orientação do aluno
  router.get('/orientacoes/acessos/:studentId', requireRole('COORDINATOR'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const acessos = await prisma.lgpAcessoSensivel.findMany({ where: { tenantId, titularId: String(req.params.studentId), recurso: { startsWith: 'desenvolvimento/' } }, orderBy: { createdAt: 'desc' }, take: 200 })
    res.json({ items: acessos })
  }))

  // =============================================================== indicadores
  async function agregados(tenantId: string, filtro: { programId?: string; periodo?: string }) {
    const where: any = { tenantId }
    if (filtro.periodo) where.periodo = filtro.periodo
    let studentIds: string[] | undefined
    if (filtro.programId) studentIds = uniq((await prisma.enrollment.findMany({ where: { programId: filtro.programId, student: { tenantId } }, select: { studentId: true } })).map((e) => e.studentId))
    if (studentIds) where.studentId = { in: studentIds }
    const av = await prisma.acaAvaliacaoGlobal.findMany({ where })
    // última avaliação por aluno
    const ult = new Map<string, (typeof av)[number]>()
    for (const a of av.sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime())) ult.set(a.studentId, a)
    const atual = [...ult.values()]
    const faixas: Record<string, number> = { OTIMO: 0, BOM: 0, ATENCAO: 0, RISCO: 0 }
    for (const a of atual) faixas[a.faixa]++
    const media = (f: (a: any) => number | null) => { const x = atual.map(f).filter((v): v is number => v !== null && v !== undefined); return x.length ? Math.round((x.reduce((s, v) => s + v, 0) / x.length) * 10) / 10 : null }
    const orWhere: any = { tenantId }
    if (studentIds) orWhere.studentId = { in: studentIds }
    const [abertas, vencidas, concluidas, insc] = await Promise.all([
      prisma.acaOrientacao.count({ where: { ...orWhere, status: { in: ['ABERTA', 'EM_ACOMPANHAMENTO', 'ENCAMINHADA'] } } }),
      prisma.acaOrientacao.count({ where: { ...orWhere, status: { in: ['ABERTA', 'EM_ACOMPANHAMENTO', 'ENCAMINHADA'] }, prazo: { lt: new Date() } } }),
      prisma.acaOrientacao.count({ where: { ...orWhere, status: 'CONCLUIDA' } }),
      prisma.acaProgramaInscricao.count({ where: { tenantId, status: { in: ['ATIVA', 'CONCLUIDA'] }, ...(studentIds ? { studentId: { in: studentIds } } : {}) } }),
    ])
    return { alunosAvaliados: atual.length, faixas, risco: atual.length ? Math.round(((faixas.RISCO + faixas.ATENCAO) / atual.length) * 1000) / 10 : 0, scoreMedio: media((a) => a.scoreGlobal), notaMedia: media((a) => a.notaAcademica), frequenciaMedia: media((a) => a.frequenciaPct), engajamentoMedio: media((a) => a.engajamento), orientacoes: { abertas, vencidas, concluidas }, inscricoesProgramas: insc }
  }
  router.get('/indicadores/coordenacao', requireRole('COORDINATOR', 'SUPPORT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const programId = qs(req.query.programId)
    if (programId) await assertNoTenant(tenantId, 'academicProgram', programId, 'Curso')
    const base = await agregados(tenantId, { programId, periodo: qs(req.query.periodo) })
    const emRisco = await prisma.acaAvaliacaoGlobal.findMany({ where: { tenantId, faixa: 'RISCO', ...(qs(req.query.periodo) ? { periodo: qs(req.query.periodo) } : {}) }, orderBy: { scoreGlobal: 'asc' }, take: 15 })
    const m = await nomesAlunos(tenantId, emRisco.map((e) => e.studentId))
    res.json({ ...base, alunosEmRisco: emRisco.map((e) => ({ avaliacaoId: e.id, aluno: m.get(e.studentId)?.nomeCompleto, ra: m.get(e.studentId)?.ra, score: e.scoreGlobal, alertas: ((e.alertas as any[]) ?? []).map((a) => a.codigo) })) })
  }))
  router.get('/indicadores/reitoria', requireRole(...REITORIA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const geral = await agregados(tenantId, { periodo: qs(req.query.periodo) })
    const cursos = await prisma.academicProgram.findMany({ where: { tenantId }, select: { id: true, nome: true } })
    const porCurso = []
    for (const c of cursos) { const a = await agregados(tenantId, { programId: c.id, periodo: qs(req.query.periodo) }); if (a.alunosAvaliados) porCurso.push({ cursoId: c.id, curso: c.nome, alunosAvaliados: a.alunosAvaliados, scoreMedio: a.scoreMedio, risco: a.risco, faixas: a.faixas }) }
    const periodos = await prisma.acaAvaliacaoGlobal.groupBy({ by: ['periodo'], where: { tenantId }, _avg: { scoreGlobal: true }, _count: { _all: true } })
    const programas = await prisma.acaPrograma.groupBy({ by: ['tipo', 'status'], where: { tenantId }, _count: { _all: true } })
    res.json({ ...geral, porCurso: porCurso.sort((a, b) => b.risco - a.risco), evolucao: periodos.map((p) => ({ periodo: p.periodo, scoreMedio: Math.round((p._avg.scoreGlobal ?? 0) * 10) / 10, avaliados: p._count._all })).sort((a, b) => a.periodo.localeCompare(b.periodo)), programas: programas.map((p) => ({ tipo: p.tipo, status: p.status, qtd: p._count._all })), aviso: 'Indicadores agregados: não identificam alunos.' })
  }))
}
export { parseTerm }
