import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { mountCrud, pageParams, parseBody, qs } from '../core/crud'
import { audit, notify } from '../core/notify'
import { completeReminders, scheduleReminder } from '../core/reminders'
import { registerEduJob } from '../core/jobs'
import { CriterioEdital, TRANSICOES_EDITAL, addDays, calcularNotaAvaliacao, classificarInscricoes, podeTransicionar } from './lib'
import { DOCENTES, GESTAO, LEITORES, MOD, alunoLite, ehAluno, ehGestor, httpErr, nomeUsuario, num, proximoCodigo, comRetentativa } from './common'
import { criarBolsa } from './projetos'

const criterioSchema = z.object({ nome: z.string().trim().min(2), peso: z.number().positive(), notaMax: z.number().positive().default(10) })

const editalSchema = z.object({
  numero: z.string().trim().min(3),
  titulo: z.string().trim().min(5),
  tipo: z.enum(['IC', 'PIBIC', 'PIBITI', 'EXTENSAO', 'INOVACAO', 'PESQUISA', 'OUTRO']).default('PIBIC'),
  descricao: z.string().optional().nullable(),
  requisitos: z.string().optional().nullable(),
  dataAbertura: z.coerce.date(),
  dataFechamento: z.coerce.date(),
  dataResultado: z.coerce.date().optional().nullable(),
  vagas: z.number().int().min(0).default(0),
  vagasSuplentes: z.number().int().min(0).default(0),
  valorBolsa: z.number().min(0).default(0),
  duracaoMeses: z.number().int().min(1).max(60).default(12),
  notaMinima: z.number().min(0).max(10).default(0),
  criterios: z.array(criterioSchema).optional().nullable(),
})

const criteriosDe = (e: any): CriterioEdital[] => (Array.isArray(e.criterios) ? e.criterios : [])

export default function mountEditais(router: Router) {
  // ---------- Editais ----------
  router.get(
    '/editais',
    requireRole(...LEITORES, 'STUDENT'),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const { skip, take, page, pageSize } = pageParams(req.query)
      const where: any = { tenantId }
      if (ehAluno(req)) where.status = { not: 'RASCUNHO' }
      for (const f of ['status', 'tipo']) {
        const v = qs((req.query as any)[f])
        if (v) where[f] = v
      }
      const [items, total] = await Promise.all([prisma.pesEdital.findMany({ where, orderBy: { dataAbertura: 'desc' }, skip, take, include: { _count: { select: { inscricoes: true } } } }), prisma.pesEdital.count({ where })])
      res.json({ items, total, page, pageSize })
    }),
  )
  router.get(
    '/editais/:id',
    requireRole(...LEITORES, 'STUDENT'),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const e = await prisma.pesEdital.findFirst({ where: { id: String(req.params.id), tenantId: getTenantId(req) }, include: { _count: { select: { inscricoes: true } } } })
      if (!e || (ehAluno(req) && e.status === 'RASCUNHO')) return res.status(404).json({ error: 'Edital não encontrado.' })
      res.json(e)
    }),
  )
  router.post(
    '/editais',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const d = parseBody(editalSchema, req.body)
      if (d.dataFechamento <= d.dataAbertura) throw httpErr(400, 'dataFechamento deve ser posterior a dataAbertura.')
      if (d.dataResultado && d.dataResultado < d.dataFechamento) throw httpErr(400, 'dataResultado anterior ao fechamento.')
      const row = await prisma.pesEdital.create({ data: { ...d, tenantId, criterios: d.criterios ?? undefined } as any })
      await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'CRIAR_EDITAL', refType: 'PesEdital', refId: row.id })
      res.status(201).json(row)
    }),
  )
  const atualizarEdital = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const e = await prisma.pesEdital.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!e) return res.status(404).json({ error: 'Edital não encontrado.' })
    const d = parseBody(editalSchema.partial(), req.body)
    if (e.status !== 'RASCUNHO' && (d.criterios || d.vagas != null || d.notaMinima != null)) throw httpErr(409, 'Critérios, vagas e nota mínima só mudam enquanto o edital é rascunho.')
    if (e.status === 'ENCERRADO') throw httpErr(409, 'Edital encerrado.')
    const ab = d.dataAbertura ?? e.dataAbertura
    const fe = d.dataFechamento ?? e.dataFechamento
    if (fe <= ab) throw httpErr(400, 'dataFechamento deve ser posterior a dataAbertura.')
    const row = await prisma.pesEdital.update({ where: { id: e.id }, data: d as any })
    await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'ATUALIZAR_EDITAL', refType: 'PesEdital', refId: e.id })
    res.json(row)
  })
  router.put('/editais/:id', requireRole(...GESTAO), atualizarEdital)
  router.patch('/editais/:id', requireRole(...GESTAO), atualizarEdital)
  router.delete(
    '/editais/:id',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const e = await prisma.pesEdital.findFirst({ where: { id: String(req.params.id), tenantId } })
      if (!e) return res.status(404).json({ error: 'Edital não encontrado.' })
      if (e.status !== 'RASCUNHO') throw httpErr(409, 'Só editais em rascunho podem ser removidos.')
      await prisma.pesEdital.delete({ where: { id: e.id } })
      res.status(204).end()
    }),
  )

  router.post(
    '/editais/:id/transicao',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const { para } = parseBody(z.object({ para: z.enum(['RASCUNHO', 'ABERTO', 'EM_AVALIACAO', 'RESULTADO_PUBLICADO', 'ENCERRADO']) }), req.body)
      const e = await prisma.pesEdital.findFirst({ where: { id: String(req.params.id), tenantId } })
      if (!e) return res.status(404).json({ error: 'Edital não encontrado.' })
      if (!podeTransicionar(TRANSICOES_EDITAL, e.status, para)) throw httpErr(409, `Transição inválida: ${e.status} → ${para}.`)
      const pend: string[] = []
      const insc = await prisma.pesEditalInscricao.findMany({ where: { tenantId, editalId: e.id }, include: { avaliacoes: true } })
      if (para === 'ABERTO' && e.status === 'RASCUNHO') {
        if (!criteriosDe(e).length) pend.push('Definir critérios de avaliação.')
        if (e.vagas < 1) pend.push('Definir ao menos 1 vaga.')
      }
      if (para === 'EM_AVALIACAO') {
        const pendentes = insc.filter((i) => i.status === 'INSCRITA').length
        if (pendentes) pend.push(`${pendentes} inscrição(ões) ainda sem homologação.`)
        if (!insc.some((i) => i.status === 'HOMOLOGADA')) pend.push('Nenhuma inscrição homologada.')
      }
      if (para === 'RESULTADO_PUBLICADO') {
        const naoAval = insc.filter((i) => i.status === 'HOMOLOGADA')
        if (naoAval.length) pend.push(`${naoAval.length} inscrição(ões) homologada(s) sem avaliação concluída.`)
      }
      if (pend.length) return res.status(422).json({ error: 'Pendências impedem a transição.', pendencias: pend })

      let resultado: any = undefined
      if (para === 'RESULTADO_PUBLICADO') {
        const ranks = classificarInscricoes(
          insc.filter((i) => i.status === 'AVALIADA').map((i) => {
            const c = criteriosDe(e)[0]
            const pri = c ? i.avaliacoes.filter((a) => a.concluida).map((a) => (a.notas as any)?.[c.nome]).filter((n) => typeof n === 'number') : []
            return { id: i.id, notaFinal: i.notaFinal, status: i.status, primeiroCriterio: pri.length ? pri.reduce((a: number, b: number) => a + b, 0) / pri.length : 0, createdAt: i.createdAt }
          }),
          { vagas: e.vagas, vagasSuplentes: e.vagasSuplentes, notaMinima: e.notaMinima },
        )
        for (const r of ranks) {
          const i = insc.find((x) => x.id === r.id)!
          await prisma.pesEditalInscricao.update({ where: { id: r.id }, data: { classificacao: r.classificacao, status: r.status } })
          const msg = r.status === 'CONTEMPLADA' ? 'contemplada' : r.status === 'SUPLENTE' ? 'classificada como suplente' : 'não contemplada'
          if (i.proponenteUserId) await notify({ tenantId, userId: i.proponenteUserId, assunto: `Resultado do edital ${e.numero}`, mensagem: `Sua inscrição "${i.titulo}" foi ${msg}${r.classificacao ? ` (classificação ${r.classificacao}º, nota ${i.notaFinal?.toFixed(2)})` : ''}.`, refType: 'PesEditalInscricao', refId: i.id })
          if (i.bolsistaStudentId) await notify({ tenantId, studentId: i.bolsistaStudentId, assunto: `Resultado do edital ${e.numero}`, mensagem: `A inscrição "${i.titulo}" foi ${msg}.`, refType: 'PesEditalInscricao', refId: i.id })
        }
        resultado = { classificadas: ranks.length, contempladas: ranks.filter((r) => r.status === 'CONTEMPLADA').length, suplentes: ranks.filter((r) => r.status === 'SUPLENTE').length }
      }
      const row = await prisma.pesEdital.update({ where: { id: e.id }, data: { status: para as any, ...(para === 'ABERTO' && !e.publicadoEm ? { publicadoEm: new Date() } : {}), ...(para === 'RESULTADO_PUBLICADO' ? { dataResultado: new Date() } : {}) } })
      if (para === 'ABERTO') {
        await scheduleReminder({ tenantId, modulo: MOD, titulo: `Fechamento das inscrições do edital ${e.numero}`, dueAt: e.dataFechamento, antecedenciaDias: 3, refType: 'PesEdital', refId: e.id, assigneeRole: 'COORDINATOR', dedupeKey: `pes-edital-fecha-${e.id}` })
      }
      if (para === 'EM_AVALIACAO') {
        await completeReminders({ tenantId, refType: 'PesEdital', refId: e.id })
        await scheduleReminder({ tenantId, modulo: MOD, titulo: `Publicar resultado do edital ${e.numero}`, dueAt: e.dataResultado ?? addDays(new Date(), 30), antecedenciaDias: 5, refType: 'PesEdital', refId: e.id, assigneeRole: 'COORDINATOR', dedupeKey: `pes-edital-result-${e.id}` })
      }
      if (para === 'RESULTADO_PUBLICADO') await completeReminders({ tenantId, refType: 'PesEdital', refId: e.id, userId: getUserId(req) })
      await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: `EDITAL_${para}`, refType: 'PesEdital', refId: e.id, detalhes: resultado })
      res.json({ edital: row, resultado })
    }),
  )

  // ---------- Inscrições ----------
  router.get(
    '/inscricoes',
    requireRole(...DOCENTES, 'STUDENT'),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const { skip, take, page, pageSize } = pageParams(req.query)
      const where: any = { tenantId }
      for (const f of ['editalId', 'status']) {
        const v = qs((req.query as any)[f])
        if (v) where[f] = v
      }
      if (ehAluno(req)) where.bolsistaStudentId = req.user!.studentId ?? '-'
      else if (!ehGestor(req)) where.OR = [{ proponenteUserId: req.user!.id }, { avaliacoes: { some: { avaliadorUserId: req.user!.id } } }]
      const [items, total] = await Promise.all([prisma.pesEditalInscricao.findMany({ where, include: { avaliacoes: { select: { id: true, avaliadorUserId: true, concluida: true, notaTotal: true, prazo: true } } }, orderBy: [{ classificacao: 'asc' }, { createdAt: 'desc' }], skip, take }), prisma.pesEditalInscricao.count({ where })])
      res.json({ items, total, page, pageSize })
    }),
  )
  router.post(
    '/inscricoes',
    requireRole(...DOCENTES),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const d = parseBody(z.object({ editalId: z.string(), projetoId: z.string().optional().nullable(), titulo: z.string().trim().min(5), resumo: z.string().optional().nullable(), bolsistaStudentId: z.string().optional().nullable(), proponenteUserId: z.string().optional().nullable() }), req.body)
      const e = await prisma.pesEdital.findFirst({ where: { id: d.editalId, tenantId } })
      if (!e) throw httpErr(404, 'Edital não encontrado.')
      const agora = new Date()
      if (e.status !== 'ABERTO' || agora < e.dataAbertura || agora > e.dataFechamento) throw httpErr(409, 'Edital fora do período de inscrições.')
      const proponente = ehGestor(req) && d.proponenteUserId ? d.proponenteUserId : req.user!.id
      const dup = await prisma.pesEditalInscricao.findFirst({ where: { tenantId, editalId: e.id, proponenteUserId: proponente, titulo: { equals: d.titulo, mode: 'insensitive' } } })
      if (dup) throw httpErr(409, 'Inscrição já realizada com este título.')
      let bolsistaNome: string | null = null
      if (d.bolsistaStudentId) {
        const s = await alunoLite(tenantId, d.bolsistaStudentId)
        if (!s) throw httpErr(404, 'Aluno bolsista não encontrado.')
        bolsistaNome = s.nomeCompleto
        const ja = await prisma.pesEditalInscricao.findFirst({ where: { tenantId, editalId: e.id, bolsistaStudentId: s.id, status: { not: 'INDEFERIDA' } } })
        if (ja) throw httpErr(409, 'Aluno já indicado em outra inscrição deste edital.')
      }
      if (d.projetoId && !(await prisma.pesProjeto.findFirst({ where: { id: d.projetoId, tenantId }, select: { id: true } }))) throw httpErr(404, 'Projeto não encontrado.')
      const row = await prisma.pesEditalInscricao.create({ data: { tenantId, editalId: e.id, projetoId: d.projetoId ?? null, proponenteUserId: proponente, proponenteNome: (await nomeUsuario(tenantId, proponente)) ?? 'Proponente', bolsistaStudentId: d.bolsistaStudentId ?? null, bolsistaNome, titulo: d.titulo, resumo: d.resumo ?? null } })
      await scheduleReminder({ tenantId, modulo: MOD, titulo: `Homologar inscrição "${d.titulo}" (edital ${e.numero})`, dueAt: addDays(e.dataFechamento, 5), refType: 'PesEditalInscricao', refId: row.id, assigneeRole: 'COORDINATOR', dedupeKey: `pes-insc-hom-${row.id}` })
      await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'INSCREVER_EDITAL', refType: 'PesEditalInscricao', refId: row.id })
      res.status(201).json(row)
    }),
  )
  router.post(
    '/inscricoes/:id/homologar',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const { deferir, justificativa } = parseBody(z.object({ deferir: z.boolean(), justificativa: z.string().trim().optional() }), req.body)
      const i = await prisma.pesEditalInscricao.findFirst({ where: { id: String(req.params.id), tenantId } })
      if (!i) return res.status(404).json({ error: 'Inscrição não encontrada.' })
      if (i.status !== 'INSCRITA') throw httpErr(409, 'Inscrição já homologada/avaliada.')
      if (!deferir && !justificativa) throw httpErr(400, 'Indeferimento exige justificativa.')
      const row = await prisma.pesEditalInscricao.update({ where: { id: i.id }, data: { status: deferir ? 'HOMOLOGADA' : 'INDEFERIDA', justificativa: justificativa ?? null } })
      await completeReminders({ tenantId, refType: 'PesEditalInscricao', refId: i.id, userId: getUserId(req) })
      if (i.proponenteUserId) await notify({ tenantId, userId: i.proponenteUserId, assunto: `Inscrição ${deferir ? 'homologada' : 'indeferida'}`, mensagem: `Sua inscrição "${i.titulo}" foi ${deferir ? 'homologada' : 'indeferida: ' + justificativa}.`, refType: 'PesEditalInscricao', refId: i.id })
      res.json(row)
    }),
  )
  // atribui avaliadores (ad hoc) com prazo e lembretes
  router.post(
    '/inscricoes/:id/avaliadores',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const d = parseBody(z.object({ avaliadores: z.array(z.string()).min(1), prazoDias: z.number().int().min(1).max(90).default(15) }), req.body)
      const i = await prisma.pesEditalInscricao.findFirst({ where: { id: String(req.params.id), tenantId }, include: { edital: true } })
      if (!i) return res.status(404).json({ error: 'Inscrição não encontrada.' })
      if (!['HOMOLOGADA', 'AVALIADA'].includes(i.status)) throw httpErr(409, 'Inscrição precisa estar homologada.')
      const prazo = addDays(new Date(), d.prazoDias)
      const criadas = []
      for (const uid of [...new Set(d.avaliadores)]) {
        if (uid === i.proponenteUserId) throw httpErr(422, 'Proponente não pode avaliar a própria inscrição (conflito de interesse).')
        const nome = await nomeUsuario(tenantId, uid)
        if (!nome) throw httpErr(404, `Usuário avaliador ${uid} não encontrado.`)
        const a = await prisma.pesEditalAvaliacao.upsert({ where: { inscricaoId_avaliadorUserId: { inscricaoId: i.id, avaliadorUserId: uid } }, create: { tenantId, inscricaoId: i.id, avaliadorUserId: uid, avaliadorNome: nome, prazo }, update: {} })
        criadas.push(a)
        await scheduleReminder({ tenantId, modulo: MOD, titulo: `Avaliar inscrição "${i.titulo}" (edital ${i.edital.numero})`, dueAt: a.prazo ?? prazo, antecedenciaDias: 3, refType: 'PesEditalAvaliacao', refId: a.id, assigneeUserId: uid, dedupeKey: `pes-eaval-${a.id}` })
        await notify({ tenantId, userId: uid, assunto: 'Nova avaliação de proposta atribuída', mensagem: `Você foi designado(a) para avaliar "${i.titulo}" até ${(a.prazo ?? prazo).toLocaleDateString('pt-BR')}.`, refType: 'PesEditalAvaliacao', refId: a.id })
      }
      res.status(201).json({ avaliacoes: criadas })
    }),
  )
  router.get(
    '/minhas-avaliacoes',
    requireRole(...DOCENTES),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const items = await prisma.pesEditalAvaliacao.findMany({ where: { tenantId, avaliadorUserId: req.user!.id, ...(qs(req.query.concluida) ? { concluida: qs(req.query.concluida) === 'true' } : {}) }, include: { inscricao: { select: { id: true, titulo: true, resumo: true, editalId: true } } }, orderBy: { prazo: 'asc' } })
      res.json({ items })
    }),
  )
  router.post(
    '/avaliacoes/:id/concluir',
    requireRole(...DOCENTES),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const d = parseBody(z.object({ notas: z.record(z.string(), z.number()), parecer: z.string().trim().min(10, 'Parecer muito curto.') }), req.body)
      const a = await prisma.pesEditalAvaliacao.findFirst({ where: { id: String(req.params.id), tenantId }, include: { inscricao: { include: { edital: true } } } })
      if (!a) return res.status(404).json({ error: 'Avaliação não encontrada.' })
      if (a.avaliadorUserId !== req.user!.id && !ehGestor(req)) throw httpErr(403, 'Somente o avaliador designado conclui a avaliação.')
      if (a.concluida) throw httpErr(409, 'Avaliação já concluída.')
      const calc = calcularNotaAvaliacao(d.notas, criteriosDe(a.inscricao.edital))
      if (calc.faltando.length) throw httpErr(422, `Notas ausentes: ${calc.faltando.join(', ')}.`)
      if (calc.invalidas.length) throw httpErr(422, `Notas fora da faixa: ${calc.invalidas.join(', ')}.`)
      await prisma.pesEditalAvaliacao.update({ where: { id: a.id }, data: { notas: d.notas, notaTotal: calc.total, parecer: d.parecer, concluida: true, concluidaEm: new Date() } })
      await completeReminders({ tenantId, refType: 'PesEditalAvaliacao', refId: a.id, userId: getUserId(req) })
      const todas = await prisma.pesEditalAvaliacao.findMany({ where: { inscricaoId: a.inscricaoId } })
      let inscricao = a.inscricao
      if (todas.length >= 2 && todas.every((x) => x.concluida)) {
        const notaFinal = Math.round((todas.reduce((s, x) => s + (x.notaTotal ?? 0), 0) / todas.length) * 100) / 100
        inscricao = (await prisma.pesEditalInscricao.update({ where: { id: a.inscricaoId }, data: { notaFinal, status: 'AVALIADA' }, include: { edital: true } })) as any
      }
      res.json({ notaTotal: calc.total, inscricaoStatus: inscricao.status, notaFinal: (inscricao as any).notaFinal ?? null, observacao: todas.length < 2 ? 'Mínimo de 2 avaliadores para consolidar a nota final.' : undefined })
    }),
  )

  // Implanta bolsa (e projeto, se necessário) para inscrição contemplada
  router.post(
    '/inscricoes/:id/implantar',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const d = parseBody(z.object({ dataInicio: z.coerce.date(), studentId: z.string().optional(), criarProjeto: z.boolean().default(true), agencia: z.enum(['INSTITUCIONAL', 'CNPQ', 'CAPES', 'FAPESP', 'OUTRA']).default('INSTITUCIONAL') }), req.body)
      const i = await prisma.pesEditalInscricao.findFirst({ where: { id: String(req.params.id), tenantId }, include: { edital: true } })
      if (!i) return res.status(404).json({ error: 'Inscrição não encontrada.' })
      if (i.status !== 'CONTEMPLADA' && i.status !== 'SUPLENTE') throw httpErr(409, 'Somente inscrições contempladas/suplentes são implantadas.')
      if (i.edital.status !== 'RESULTADO_PUBLICADO' && i.edital.status !== 'ENCERRADO') throw httpErr(409, 'Resultado do edital ainda não publicado.')
      const studentId = d.studentId ?? i.bolsistaStudentId
      if (!studentId) throw httpErr(400, 'Informe o aluno bolsista (studentId).')
      const fim = new Date(d.dataInicio)
      fim.setUTCMonth(fim.getUTCMonth() + i.edital.duracaoMeses)
      let projetoId = i.projetoId
      if (!projetoId && d.criarProjeto) {
        const p = await comRetentativa(async () => {
          const codigo = await proximoCodigo('pesProjeto', tenantId, 'PRJ', 'codigo')
          return prisma.pesProjeto.create({ data: { tenantId, codigo, titulo: i.titulo, tipo: i.edital.tipo, resumo: i.resumo, status: 'APROVADO', coordenadorUserId: i.proponenteUserId, coordenadorNome: i.proponenteNome, editalId: i.editalId, dataInicio: d.dataInicio, dataFim: fim, fomento: `Edital ${i.edital.numero}` } })
        })
        projetoId = p.id
        await prisma.pesProjetoMembro.create({ data: { tenantId, projetoId, tipo: 'DOCENTE', userId: i.proponenteUserId, nome: i.proponenteNome, papel: 'COORDENADOR' } })
      }
      const bolsa = await criarBolsa(tenantId, { projetoId, editalId: i.editalId, inscricaoId: i.id, studentId, orientadorUserId: i.proponenteUserId, modalidade: i.edital.tipo, agencia: d.agencia, valorMensal: num(i.edital.valorBolsa), dataInicio: d.dataInicio, dataFim: fim })
      if (projetoId) {
        const s = await alunoLite(tenantId, studentId)
        await prisma.pesProjetoMembro.create({ data: { tenantId, projetoId, tipo: 'ALUNO', studentId, nome: s?.nomeCompleto ?? 'Bolsista', papel: 'BOLSISTA' } })
        await prisma.pesEditalInscricao.update({ where: { id: i.id }, data: { projetoId } })
      }
      await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'IMPLANTAR_INSCRICAO', refType: 'PesEditalInscricao', refId: i.id, detalhes: { bolsaId: bolsa.id, projetoId } })
      res.status(201).json({ bolsa, projetoId })
    }),
  )

  // ---------- Job: lembra avaliadores atrasados e fecha edital vencido ----------
  registerEduJob('pesquisa:editais', async () => {
    const agora = new Date()
    const vencidos = await prisma.pesEdital.findMany({ where: { status: 'ABERTO', dataFechamento: { lt: agora } }, take: 200 })
    for (const e of vencidos) {
      await scheduleReminder({ tenantId: e.tenantId, modulo: MOD, titulo: `Inscrições do edital ${e.numero} encerradas — homologar e iniciar avaliação`, dueAt: addDays(agora, 5), remindAt: agora, severity: 'ATENCAO', refType: 'PesEdital', refId: e.id, assigneeRole: 'COORDINATOR', dedupeKey: `pes-edital-encerrado-${e.id}` })
    }
    const aval = await prisma.pesEditalAvaliacao.count({ where: { concluida: false, prazo: { lt: agora } } })
    return { editaisParaEncerrar: vencidos.length, avaliacoesAtrasadas: aval }
  })
}
