import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getUserId, requireRole } from '../academico/middleware'
import { dateISO, mountCrud, pageParams, parseBody, qs } from '../core/crud'
import { audit, notify } from '../core/notify'
import { cancelReminders, completeReminders } from '../core/reminders'
import { ALUNO, MODULO, REF, alunoAlvo, carregarAluno, hasRole, httpError, nomesAlunos, tid, scheduleReminder } from './common'
import { addDays, avaliarInscricaoBolsa, classificarInscricoes, janelaRenovacao, rendaPerCapita } from './logic'
import { desempenhoAluno } from './metricas'

const GEST: any[] = ['SUPPORT', 'FINANCE']
const LEIT: any[] = ['SUPPORT', 'FINANCE', 'COORDINATOR', 'SECRETARY']

const programaSchema = z.object({
  nome: z.string().min(3).max(150),
  tipo: z.enum(['INSTITUCIONAL', 'PROUNI', 'FIES', 'MERITO', 'SOCIOECONOMICA', 'MONITORIA', 'ESPORTE', 'CULTURA', 'PERMANENCIA', 'OUTRO']).default('INSTITUCIONAL'),
  descricao: z.string().max(4000).optional(),
  percentualDesconto: z.number().min(0).max(100).default(0),
  valorMensal: z.number().min(0).nullable().optional(),
  vagas: z.number().int().min(0).default(0),
  rendaPerCapitaMaxSM: z.number().min(0).nullable().optional(),
  mediaMinima: z.number().min(0).max(10).nullable().optional(),
  frequenciaMinima: z.number().min(0).max(100).nullable().optional(),
  inscricaoInicio: dateISO().nullable().optional(),
  inscricaoFim: dateISO().nullable().optional(),
  vigenciaMeses: z.number().int().min(1).max(60).default(6),
  renovavel: z.boolean().default(true),
  renovacaoAntecedenciaDias: z.number().int().min(1).max(180).default(30),
  maxRenovacoes: z.number().int().min(0).nullable().optional(),
  criterios: z.any().optional(),
  ativo: z.boolean().default(true),
})

async function agendarRenovacao(tenantId: string, c: { id: string; studentId: string; fim: Date; programaId: string }, antecedencia: number) {
  await scheduleReminder({ tenantId, modulo: MODULO, titulo: 'Renovação da bolsa: solicite até o prazo', descricao: 'Sua bolsa/auxílio vence em breve. Solicite a renovação para não perder o benefício.', dueAt: c.fim, antecedenciaDias: antecedencia, assigneeStudentId: c.studentId, refType: REF.concessao, refId: c.id, severity: 'ATENCAO', dedupeKey: `apo-bolsa-renov-${c.id}` })
  await scheduleReminder({ tenantId, modulo: MODULO, titulo: 'Bolsa vencendo: acompanhar renovação do aluno', dueAt: c.fim, antecedenciaDias: Math.max(7, Math.floor(antecedencia / 3)), assigneeRole: 'SUPPORT', refType: REF.concessao, refId: c.id, dedupeKey: `apo-bolsa-renov-eq-${c.id}` })
}

// Cria a concessão de forma atômica: o lock por programa serializa a checagem de vagas + criação,
// evitando que deferimentos simultâneos ultrapassem o limite de vagas.
async function criarConcessao(tenantId: string, prog: any, studentId: string, inscricaoId: string | null, userId: string, opts: { validarVagas?: boolean } = {}) {
  const inicio = new Date()
  const fim = new Date(inicio); fim.setMonth(fim.getMonth() + prog.vigenciaMeses)
  const c = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'apo-bolsa-vagas:' + prog.id}))`
    if (await tx.apoConcessaoBolsa.findFirst({ where: { tenantId, programaId: prog.id, studentId, status: { in: ['ATIVA', 'RENOVACAO_PENDENTE'] } }, select: { id: true } })) throw httpError(409, 'O aluno já possui concessão ativa neste programa.')
    if (opts.validarVagas && prog.vagas > 0) {
      const ativas = await tx.apoConcessaoBolsa.count({ where: { tenantId, programaId: prog.id, status: { in: ['ATIVA', 'RENOVACAO_PENDENTE'] } } })
      if (ativas >= prog.vagas) throw httpError(409, 'Sem vagas disponíveis no programa (use lista de espera ou forcar=true).')
    }
    return tx.apoConcessaoBolsa.create({ data: { tenantId, programaId: prog.id, studentId, inscricaoId, percentual: prog.percentualDesconto, valorMensal: prog.valorMensal, inicio, fim, status: 'ATIVA', renovacaoLimiteEm: addDays(fim, 0) } })
  })
  await agendarRenovacao(tenantId, c, prog.renovacaoAntecedenciaDias)
  await notify({ tenantId, studentId, assunto: `Bolsa concedida: ${prog.nome}`, mensagem: `Parabéns! Você foi contemplado(a) com ${prog.percentualDesconto ? prog.percentualDesconto + '% de desconto' : 'o auxílio'} do programa ${prog.nome}, válido até ${fim.toLocaleDateString('pt-BR')}.`, refType: REF.concessao, refId: c.id, templateKey: 'apoio.bolsa.concedida' })
  await audit({ tenantId, userId, modulo: MODULO, acao: 'BOLSA_CONCEDIDA', refType: REF.concessao, refId: c.id })
  return c
}

export function mountBolsas(router: Router) {
  mountCrud(router, { model: 'apoProgramaBolsa', path: '/bolsas/programas', read: LEIT, write: GEST, create: programaSchema, search: ['nome'], filters: ['tipo', 'ativo'], orderBy: { nome: 'asc' }, modulo: MODULO })

  // Programas com inscrição aberta (qualquer usuário autenticado).
  router.get('/bolsas/programas-abertos', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const agora = new Date()
    const tenantId = tid(req)
    const progs = await prisma.apoProgramaBolsa.findMany({ where: { tenantId, ativo: true, OR: [{ inscricaoInicio: null }, { inscricaoInicio: { lte: agora } }], AND: [{ OR: [{ inscricaoFim: null }, { inscricaoFim: { gte: agora } }] }] }, orderBy: { nome: 'asc' } })
    res.json(progs)
  }))

  router.post('/bolsas/inscricoes', requireRole(...ALUNO, ...GEST), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({
      programaId: z.string(), studentId: z.string().optional(), rendaFamiliar: z.number().min(0), numeroMembros: z.number().int().min(1).max(30),
      condicoes: z.object({ cadUnico: z.boolean().optional(), escolaPublica: z.boolean().optional(), deficiencia: z.boolean().optional(), moraSozinho: z.boolean().optional(), familiaNumerosa: z.boolean().optional(), primeiraGeracao: z.boolean().optional() }).optional(),
      documentos: z.array(z.string()).optional(),
    }), req.body)
    const studentId = alunoAlvo(req, b.studentId)
    await carregarAluno(tenantId, studentId)
    const prog = await prisma.apoProgramaBolsa.findFirst({ where: { id: b.programaId, tenantId, ativo: true } })
    if (!prog) throw httpError(404, 'Programa não encontrado ou inativo.')
    const ja = await prisma.apoConcessaoBolsa.findFirst({ where: { tenantId, studentId, programaId: prog.id, status: { in: ['ATIVA', 'RENOVACAO_PENDENTE'] } } })
    if (ja) throw httpError(409, 'Você já possui concessão ativa neste programa (use a renovação).')
    const rpc = rendaPerCapita(b.rendaFamiliar, b.numeroMembros)
    const desemp = await desempenhoAluno(tenantId, studentId)
    const docsExigidos: string[] = Array.isArray((prog.criterios as any)?.documentos) ? (prog.criterios as any).documentos : []
    const av = avaliarInscricaoBolsa(prog, { rendaPerCapita: rpc, numeroMembros: b.numeroMembros, mediaAtual: desemp.media, frequenciaAtual: desemp.frequencia, condicoes: b.condicoes, documentosEnviados: b.documentos ?? [], documentosExigidos: docsExigidos })
    const periodo = av.pendencias.find((x) => x.startsWith('Período'))
    if (periodo) throw httpError(422, periodo)
    const status = av.elegivel ? 'INSCRITA' : 'INDEFERIDA'
    const insc = await prisma.apoInscricaoBolsa.upsert({
      where: { tenantId_programaId_studentId: { tenantId, programaId: prog.id, studentId } },
      create: { tenantId, programaId: prog.id, studentId, rendaFamiliar: b.rendaFamiliar, numeroMembros: b.numeroMembros, rendaPerCapita: rpc, condicoes: b.condicoes as any, documentos: b.documentos as any, mediaAtual: desemp.media, frequenciaAtual: desemp.frequencia, pontuacao: av.pontuacao, elegivel: av.elegivel, pendencias: av.pendencias as any, status, parecer: av.elegivel ? undefined : 'Indeferimento automático por critérios: ' + av.pendencias.join(' ') },
      update: { rendaFamiliar: b.rendaFamiliar, numeroMembros: b.numeroMembros, rendaPerCapita: rpc, condicoes: b.condicoes as any, documentos: b.documentos as any, mediaAtual: desemp.media, frequenciaAtual: desemp.frequencia, pontuacao: av.pontuacao, elegivel: av.elegivel, pendencias: av.pendencias as any, status, parecer: av.elegivel ? null : 'Indeferimento automático por critérios: ' + av.pendencias.join(' ') },
    })
    await notify({ tenantId, studentId, assunto: 'Inscrição de bolsa recebida', mensagem: `Sua inscrição no programa ${prog.nome} foi recebida${av.elegivel ? ' e será analisada.' : ', mas não atende aos critérios: ' + av.pendencias.join(' ')}`, refType: 'ApoInscricaoBolsa', refId: insc.id })
    if (av.elegivel) await scheduleReminder({ tenantId, modulo: MODULO, titulo: `Analisar inscrição de bolsa (${prog.nome})`, dueAt: prog.inscricaoFim ? addDays(prog.inscricaoFim, 10) : addDays(new Date(), 15), assigneeRole: 'SUPPORT', refType: 'ApoInscricaoBolsa', refId: insc.id, dedupeKey: `apo-insc-analise-${insc.id}` })
    res.status(201).json({ ...insc, avaliacao: av })
  }))

  router.get('/bolsas/inscricoes', requireRole(...LEIT), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    for (const f of ['programaId', 'status', 'studentId']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    const [items, total] = await Promise.all([prisma.apoInscricaoBolsa.findMany({ where, orderBy: [{ pontuacao: 'desc' }, { createdAt: 'asc' }], skip, take }), prisma.apoInscricaoBolsa.count({ where })])
    const alunos = await nomesAlunos(tenantId, items.map((i) => i.studentId))
    res.json({ items: items.map((i) => ({ ...i, aluno: alunos[i.studentId] })), total, page, pageSize })
  }))

  router.get('/bolsas/minhas', requireRole(...ALUNO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const studentId = alunoAlvo(req)
    const [inscricoes, concessoes] = await Promise.all([prisma.apoInscricaoBolsa.findMany({ where: { tenantId, studentId }, orderBy: { createdAt: 'desc' } }), prisma.apoConcessaoBolsa.findMany({ where: { tenantId, studentId }, orderBy: { fim: 'desc' } })])
    res.json({ inscricoes, concessoes })
  }))

  // Decisão individual (deferimento exige vaga disponível, a menos de override justificado).
  router.post('/bolsas/inscricoes/:id/decidir', requireRole(...GEST), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ decisao: z.enum(['DEFERIDA', 'INDEFERIDA', 'LISTA_ESPERA', 'EM_ANALISE']), parecer: z.string().min(5).max(2000), forcar: z.boolean().optional() }), req.body)
    const insc = await prisma.apoInscricaoBolsa.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!insc) throw httpError(404, 'Inscrição não encontrada.')
    if (['DEFERIDA', 'CANCELADA'].includes(insc.status)) throw httpError(409, `Inscrição já ${insc.status}.`)
    const prog = await prisma.apoProgramaBolsa.findFirst({ where: { id: insc.programaId, tenantId } })
    if (!prog) throw httpError(404, 'Programa não encontrado.')
    let concessao: any = null
    if (b.decisao === 'DEFERIDA') {
      if (!insc.elegivel && !b.forcar) throw httpError(422, 'Inscrição não elegível pelos critérios; use forcar=true com parecer justificado.')
      concessao = await criarConcessao(tenantId, prog, insc.studentId, insc.id, getUserId(req), { validarVagas: !b.forcar })
    } else {
      await notify({ tenantId, studentId: insc.studentId, assunto: `Resultado da bolsa: ${prog.nome}`, mensagem: `Sua inscrição foi ${b.decisao === 'INDEFERIDA' ? 'indeferida' : b.decisao === 'LISTA_ESPERA' ? 'colocada em lista de espera' : 'colocada em análise'}. Parecer: ${b.parecer}`, refType: 'ApoInscricaoBolsa', refId: insc.id })
    }
    await completeReminders({ tenantId, refType: 'ApoInscricaoBolsa', refId: insc.id, userId: getUserId(req) })
    const upd = await prisma.apoInscricaoBolsa.update({ where: { id: insc.id }, data: { status: b.decisao, parecer: b.parecer, analisadoPorId: getUserId(req), analisadoEm: new Date() } })
    res.json({ inscricao: upd, concessao })
  }))

  // Classifica todas as inscrições elegíveis do programa por pontuação e (opcional) aplica o resultado.
  router.post('/bolsas/programas/:id/classificar', requireRole(...GEST), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const aplicar = req.body?.aplicar === true
    const prog = await prisma.apoProgramaBolsa.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!prog) throw httpError(404, 'Programa não encontrado.')
    const insc = await prisma.apoInscricaoBolsa.findMany({ where: { tenantId, programaId: prog.id, status: { in: ['INSCRITA', 'EM_ANALISE', 'LISTA_ESPERA'] } } })
    const ativas = await prisma.apoConcessaoBolsa.count({ where: { tenantId, programaId: prog.id, status: { in: ['ATIVA', 'RENOVACAO_PENDENTE'] } } })
    const cls = classificarInscricoes(insc, prog.vagas > 0 ? prog.vagas : insc.length, ativas)
    if (aplicar) {
      for (const i of cls.deferidas) {
        await criarConcessao(tenantId, prog, i.studentId, i.id, getUserId(req))
        await prisma.apoInscricaoBolsa.update({ where: { id: i.id }, data: { status: 'DEFERIDA', parecer: `Classificação automática (pontuação ${i.pontuacao}).`, analisadoPorId: getUserId(req), analisadoEm: new Date() } })
        await completeReminders({ tenantId, refType: 'ApoInscricaoBolsa', refId: i.id })
      }
      for (const i of cls.listaEspera) {
        await prisma.apoInscricaoBolsa.update({ where: { id: i.id }, data: { status: 'LISTA_ESPERA', parecer: 'Lista de espera por classificação.' } })
        await notify({ tenantId, studentId: i.studentId, assunto: `Bolsa ${prog.nome}: lista de espera`, mensagem: 'Você está na lista de espera e será chamado(a) caso surja vaga.', refType: 'ApoInscricaoBolsa', refId: i.id })
      }
      await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'BOLSA_CLASSIFICACAO_APLICADA', refType: 'ApoProgramaBolsa', refId: prog.id, detalhes: { deferidas: cls.deferidas.length, espera: cls.listaEspera.length } })
    }
    res.json({ aplicado: aplicar, vagasLivres: Math.max(0, (prog.vagas || insc.length) - ativas), deferidas: cls.deferidas.map((x) => ({ id: x.id, studentId: x.studentId, pontuacao: x.pontuacao })), listaEspera: cls.listaEspera.map((x) => ({ id: x.id, studentId: x.studentId, pontuacao: x.pontuacao })) })
  }))

  router.get('/bolsas/concessoes', requireRole(...LEIT), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    for (const f of ['programaId', 'status', 'studentId']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    if (qs(req.query.vencendoEmDias)) where.fim = { lte: addDays(new Date(), Number(qs(req.query.vencendoEmDias))) }, where.status = { in: ['ATIVA', 'RENOVACAO_PENDENTE'] }
    const [items, total] = await Promise.all([prisma.apoConcessaoBolsa.findMany({ where, orderBy: { fim: 'asc' }, skip, take }), prisma.apoConcessaoBolsa.count({ where })])
    const alunos = await nomesAlunos(tenantId, items.map((i) => i.studentId))
    res.json({ items: items.map((i) => ({ ...i, aluno: alunos[i.studentId] })), total, page, pageSize })
  }))

  // Renovação: reavalia média/frequência e a janela; aluno ou equipe podem acionar.
  router.post('/bolsas/concessoes/:id/renovar', requireRole(...ALUNO, ...GEST), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const c = await prisma.apoConcessaoBolsa.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!c) throw httpError(404, 'Concessão não encontrada.')
    if (req.user?.role === 'STUDENT' && c.studentId !== req.user.studentId) throw httpError(404, 'Concessão não encontrada.')
    if (!['ATIVA', 'RENOVACAO_PENDENTE'].includes(c.status)) throw httpError(409, `Concessão ${c.status}: não renovável.`)
    const prog = await prisma.apoProgramaBolsa.findFirst({ where: { id: c.programaId, tenantId } })
    if (!prog) throw httpError(404, 'Programa não encontrado.')
    const b = parseBody(z.object({ forcar: z.boolean().optional(), justificativa: z.string().max(1000).optional() }), req.body ?? {})
    if (!prog.renovavel) throw httpError(422, 'Programa não admite renovação.')
    if (prog.maxRenovacoes != null && c.renovacoes >= prog.maxRenovacoes) throw httpError(422, `Limite de ${prog.maxRenovacoes} renovação(ões) atingido.`)
    const jan = janelaRenovacao(c.fim, prog.renovacaoAntecedenciaDias)
    if (jan.estado === 'AGUARDANDO') throw httpError(422, `Janela de renovação abre em ${jan.abre.toLocaleDateString('pt-BR')}.`)
    if (jan.estado === 'EXPIRADA') throw httpError(422, 'Prazo de renovação expirado.')
    const desemp = await desempenhoAluno(tenantId, c.studentId)
    const pend: string[] = []
    if (prog.mediaMinima != null && (desemp.media == null || desemp.media < prog.mediaMinima)) pend.push(`Média ${desemp.media ?? 'indisponível'} abaixo do mínimo ${prog.mediaMinima}.`)
    if (prog.frequenciaMinima != null && desemp.frequencia != null && desemp.frequencia < prog.frequenciaMinima) pend.push(`Frequência ${desemp.frequencia}% abaixo do mínimo ${prog.frequenciaMinima}%.`)
    if (pend.length) {
      const pode = b.forcar && hasRole(req, 'SUPPORT', 'FINANCE') && (b.justificativa ?? '').length >= 10
      if (!pode) throw httpError(422, 'Não atende às condições de renovação: ' + pend.join(' ') + ' (equipe pode forçar com justificativa).')
    }
    const novoFim = new Date(c.fim); novoFim.setMonth(novoFim.getMonth() + prog.vigenciaMeses)
    const upd = await prisma.apoConcessaoBolsa.update({ where: { id: c.id }, data: { fim: novoFim, status: 'ATIVA', renovacoes: { increment: 1 }, observacoes: b.justificativa ? `${c.observacoes ?? ''}\nRenovação: ${b.justificativa}`.trim() : c.observacoes } })
    await completeReminders({ tenantId, refType: REF.concessao, refId: c.id, userId: getUserId(req) })
    await agendarRenovacao(tenantId, upd, prog.renovacaoAntecedenciaDias)
    await notify({ tenantId, studentId: c.studentId, assunto: 'Bolsa renovada', mensagem: `Sua bolsa ${prog.nome} foi renovada até ${novoFim.toLocaleDateString('pt-BR')}.`, refType: REF.concessao, refId: c.id })
    await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'BOLSA_RENOVADA', refType: REF.concessao, refId: c.id, detalhes: { forcada: pend.length > 0 } })
    res.json(upd)
  }))

  router.post('/bolsas/concessoes/:id/encerrar', requireRole(...GEST), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ motivo: z.string().min(5).max(500), suspender: z.boolean().optional() }), req.body)
    const c = await prisma.apoConcessaoBolsa.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!c) throw httpError(404, 'Concessão não encontrada.')
    if (['ENCERRADA', 'CANCELADA'].includes(c.status)) throw httpError(409, 'Concessão já finalizada.')
    const upd = await prisma.apoConcessaoBolsa.update({ where: { id: c.id }, data: { status: b.suspender ? 'SUSPENSA' : 'CANCELADA', motivoEncerramento: b.motivo } })
    if (!b.suspender) await cancelReminders({ tenantId, refType: REF.concessao, refId: c.id })
    await notify({ tenantId, studentId: c.studentId, assunto: b.suspender ? 'Bolsa suspensa' : 'Bolsa cancelada', mensagem: `Motivo: ${b.motivo}`, refType: REF.concessao, refId: c.id })
    await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: b.suspender ? 'BOLSA_SUSPENSA' : 'BOLSA_CANCELADA', refType: REF.concessao, refId: c.id })
    res.json(upd)
  }))

  router.post('/bolsas/concessoes/:id/reativar', requireRole(...GEST), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const c = await prisma.apoConcessaoBolsa.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!c || c.status !== 'SUSPENSA') throw httpError(409, 'Somente concessões suspensas podem ser reativadas.')
    if (c.fim < new Date()) throw httpError(422, 'Vigência já expirou; use nova inscrição.')
    res.json(await prisma.apoConcessaoBolsa.update({ where: { id: c.id }, data: { status: 'ATIVA', motivoEncerramento: null } }))
  }))

  router.get('/bolsas/resumo', requireRole(...LEIT), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const [porStatus, programas] = await Promise.all([prisma.apoConcessaoBolsa.groupBy({ by: ['status'], where: { tenantId }, _count: true }), prisma.apoProgramaBolsa.findMany({ where: { tenantId, ativo: true } })])
    const ativas = await prisma.apoConcessaoBolsa.groupBy({ by: ['programaId'], where: { tenantId, status: { in: ['ATIVA', 'RENOVACAO_PENDENTE'] } }, _count: true })
    const mapa = Object.fromEntries(ativas.map((a) => [a.programaId, a._count]))
    res.json({ concessoesPorStatus: Object.fromEntries(porStatus.map((s) => [s.status, s._count])), programas: programas.map((p) => ({ id: p.id, nome: p.nome, vagas: p.vagas, ocupadas: mapa[p.id] ?? 0, livres: p.vagas > 0 ? Math.max(0, p.vagas - (mapa[p.id] ?? 0)) : null })) })
  }))
}

// Job: marca renovação pendente quando a janela abre; encerra concessões vencidas.
export async function jobBolsas() {
  const agora = new Date()
  let pendentes = 0, encerradas = 0
  const ativas = await prisma.apoConcessaoBolsa.findMany({ where: { status: { in: ['ATIVA', 'RENOVACAO_PENDENTE'] } }, take: 2000 })
  const progs = new Map((await prisma.apoProgramaBolsa.findMany({ where: { id: { in: Array.from(new Set(ativas.map((a) => a.programaId))) } } })).map((p) => [p.id, p]))
  for (const c of ativas) {
    const prog = progs.get(c.programaId)
    if (c.fim < agora) {
      await prisma.apoConcessaoBolsa.update({ where: { id: c.id }, data: { status: 'ENCERRADA', motivoEncerramento: 'Vigência encerrada sem renovação.' } })
      await notify({ tenantId: c.tenantId, studentId: c.studentId, assunto: 'Bolsa encerrada', mensagem: 'A vigência da sua bolsa terminou. Procure o setor de assistência estudantil se desejar uma nova inscrição.', refType: REF.concessao, refId: c.id })
      encerradas++
    } else if (c.status === 'ATIVA' && prog && janelaRenovacao(c.fim, prog.renovacaoAntecedenciaDias, agora).estado === 'ABERTA' && prog.renovavel) {
      await prisma.apoConcessaoBolsa.update({ where: { id: c.id }, data: { status: 'RENOVACAO_PENDENTE' } })
      pendentes++
    }
  }
  return { pendentes, encerradas }
}
