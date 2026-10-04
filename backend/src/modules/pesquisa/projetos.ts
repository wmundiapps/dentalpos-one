import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { mountCrud, pageParams, parseBody, qs } from '../core/crud'
import { audit, notify } from '../core/notify'
import { cancelReminders, completeReminders, scheduleReminder } from '../core/reminders'
import { registerEduJob } from '../core/jobs'
import {
  TRANSICOES_PROJETO, addDays, podeTransicionar, progressoProjeto, relatoriosObrigatorios, resumoOrcamento, situacaoEtapa,
} from './lib'
import { DOCENTES, GESTAO, LEITORES, MOD, alunoLite, comRetentativa, ehAluno, ehGestor, httpErr, nomeUsuario, num, proximoCodigo } from './common'

const TIPOS = ['IC', 'PIBIC', 'PIBITI', 'EXTENSAO', 'INOVACAO', 'PESQUISA', 'OUTRO'] as const

const projetoSchema = z.object({
  titulo: z.string().trim().min(5),
  tipo: z.enum(TIPOS).default('PESQUISA'),
  resumo: z.string().optional().nullable(),
  justificativa: z.string().optional().nullable(),
  objetivos: z.string().optional().nullable(),
  metodologia: z.string().optional().nullable(),
  areaConhecimento: z.string().optional().nullable(),
  palavrasChave: z.array(z.string()).default([]),
  grupoId: z.string().optional().nullable(),
  linhaId: z.string().optional().nullable(),
  programId: z.string().optional().nullable(),
  editalId: z.string().optional().nullable(),
  coordenadorUserId: z.string().optional().nullable(),
  fomento: z.string().optional().nullable(),
  orcamentoTotal: z.number().min(0).default(0),
  dataInicio: z.coerce.date().optional().nullable(),
  dataFim: z.coerce.date().optional().nullable(),
  eticaNecessaria: z.boolean().default(false),
  cepProtocolo: z.string().optional().nullable(),
})

// Valida os requisitos para mudar o status do projeto — devolve a lista de pendências.
export async function pendenciasProjeto(tenantId: string, p: any, para: string): Promise<string[]> {
  const pend: string[] = []
  if (para === 'SUBMETIDO') {
    if (!p.resumo || !p.objetivos || !p.metodologia) pend.push('Preencher resumo, objetivos e metodologia.')
    if (!p.dataInicio || !p.dataFim) pend.push('Definir data de início e fim.')
    if (!p.coordenadorUserId) pend.push('Definir o coordenador do projeto.')
    const [etapas, rubricas] = await Promise.all([prisma.pesProjetoEtapa.count({ where: { tenantId, projetoId: p.id } }), prisma.pesProjetoRubrica.count({ where: { tenantId, projetoId: p.id } })])
    if (!etapas) pend.push('Cadastrar ao menos uma etapa no cronograma.')
    if (num(p.orcamentoTotal) > 0 && !rubricas) pend.push('Detalhar o orçamento em rubricas.')
  }
  if (para === 'EM_EXECUCAO') {
    if (p.eticaNecessaria && p.cepStatus !== 'APROVADO') pend.push('Projeto exige aprovação do Comitê de Ética (CEP/CEUA) antes da execução.')
    if (!p.dataInicio || !p.dataFim) pend.push('Definir cronograma (início/fim).')
  }
  if (para === 'CONCLUIDO') {
    const fin = await prisma.pesProjetoRelatorio.findFirst({ where: { tenantId, projetoId: p.id, tipo: 'FINAL' } })
    if (!fin || !['ENTREGUE', 'APROVADO'].includes(fin.status)) pend.push('Relatório final precisa estar entregue.')
    const abertos = await prisma.pesProjetoEntregavel.count({ where: { tenantId, projetoId: p.id, status: { in: ['PENDENTE', 'ATRASADO'] } } })
    if (abertos) pend.push(`${abertos} entregável(is) ainda pendente(s).`)
  }
  if (['CANCELADO', 'SUSPENSO', 'REPROVADO'].includes(para) && !p.__motivo) pend.push('Informar o motivo.')
  return pend
}

async function gerarObrigacoes(tenantId: string, p: any) {
  const base = relatoriosObrigatorios(p.dataInicio, p.dataFim)
  const existentes = await prisma.pesProjetoRelatorio.findMany({ where: { tenantId, projetoId: p.id }, select: { tipo: true, referencia: true } })
  const chave = new Set(existentes.map((e) => `${e.tipo}|${e.referencia}`))
  for (const r of base) {
    if (chave.has(`${r.tipo}|${r.referencia}`)) continue
    const rel = await prisma.pesProjetoRelatorio.create({ data: { tenantId, projetoId: p.id, tipo: r.tipo, referencia: r.referencia, prazo: r.prazo } })
    await scheduleReminder({
      tenantId, modulo: MOD, titulo: `Relatório ${r.tipo === 'FINAL' ? 'final' : 'parcial'} do projeto ${p.codigo}`, dueAt: r.prazo, antecedenciaDias: 15, severity: r.tipo === 'FINAL' ? 'ATENCAO' : 'INFO',
      refType: 'PesProjetoRelatorio', refId: rel.id, assigneeUserId: p.coordenadorUserId ?? undefined, assigneeRole: p.coordenadorUserId ? undefined : 'COORDINATOR', dedupeKey: `pes-rel-${rel.id}`,
    })
  }
}

export default function mountProjetos(router: Router) {
  // ---------- Projetos ----------
  router.get(
    '/projetos',
    requireRole(...LEITORES, 'STUDENT'),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const { skip, take, page, pageSize } = pageParams(req.query)
      const where: any = { tenantId }
      for (const f of ['status', 'tipo', 'grupoId', 'programId', 'editalId', 'coordenadorUserId']) {
        const v = qs((req.query as any)[f])
        if (v) where[f] = v
      }
      const q = qs(req.query.q)
      if (q) where.OR = [{ titulo: { contains: q, mode: 'insensitive' } }, { codigo: { contains: q, mode: 'insensitive' } }]
      if (ehAluno(req)) where.membros = { some: { studentId: req.user!.studentId ?? '-' } }
      else if (!ehGestor(req) && String(req.user?.role).toUpperCase() === 'TEACHER' && qs(req.query.meus) === 'true') where.OR = [{ coordenadorUserId: req.user!.id }, { membros: { some: { userId: req.user!.id } } }]
      const [items, total] = await Promise.all([
        prisma.pesProjeto.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
        prisma.pesProjeto.count({ where }),
      ])
      res.json({ items, total, page, pageSize })
    }),
  )

  router.get(
    '/projetos/:id',
    requireRole(...LEITORES, 'STUDENT'),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const p = await prisma.pesProjeto.findFirst({
        where: { id: String(req.params.id), tenantId, ...(ehAluno(req) ? { membros: { some: { studentId: req.user!.studentId ?? '-' } } } : {}) },
        include: { membros: true, etapas: { orderBy: { ordem: 'asc' } }, rubricas: true, entregaveis: { orderBy: { prazo: 'asc' } }, relatorios: { orderBy: { prazo: 'asc' } } },
      })
      if (!p) return res.status(404).json({ error: 'Projeto não encontrado.' })
      res.json(p)
    }),
  )

  router.post(
    '/projetos',
    requireRole(...DOCENTES),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const d = parseBody(projetoSchema, req.body)
      if (d.dataInicio && d.dataFim && d.dataFim <= d.dataInicio) throw httpErr(400, 'dataFim deve ser posterior a dataInicio.')
      if (!ehGestor(req)) d.coordenadorUserId = req.user!.id
      if (d.eticaNecessaria && !d.cepProtocolo) { /* protocolo pode vir depois */ }
      if (d.grupoId && !(await prisma.pesGrupo.findFirst({ where: { id: d.grupoId, tenantId }, select: { id: true } }))) throw httpErr(404, 'Grupo não encontrado.')
      const coordNome = await nomeUsuario(tenantId, d.coordenadorUserId)
      const row = await comRetentativa(async () => {
        const codigo = await proximoCodigo('pesProjeto', tenantId, 'PRJ', 'codigo')
        return prisma.pesProjeto.create({
          data: { ...d, tenantId, codigo, coordenadorNome: coordNome, cepStatus: d.eticaNecessaria ? 'PENDENTE' : 'NAO_APLICAVEL' },
        })
      })
      if (row.coordenadorUserId) await prisma.pesProjetoMembro.create({ data: { tenantId, projetoId: row.id, tipo: 'DOCENTE', userId: row.coordenadorUserId, nome: coordNome ?? 'Coordenador', papel: 'COORDENADOR' } })
      await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'CRIAR_PROJETO', refType: 'PesProjeto', refId: row.id })
      res.status(201).json(row)
    }),
  )

  const atualizarProjeto = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const p = await prisma.pesProjeto.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!p) return res.status(404).json({ error: 'Projeto não encontrado.' })
    if (!ehGestor(req) && p.coordenadorUserId !== req.user!.id) throw httpErr(403, 'Somente o coordenador do projeto ou a coordenação podem editar.')
    if (['CONCLUIDO', 'CANCELADO'].includes(p.status)) throw httpErr(409, 'Projeto encerrado não pode ser editado.')
    const d = parseBody(projetoSchema.partial().extend({ cepStatus: z.enum(['NAO_APLICAVEL', 'PENDENTE', 'APROVADO', 'REPROVADO']).optional() }), req.body)
    if (d.cepStatus && !ehGestor(req)) throw httpErr(403, 'Somente a coordenação registra o parecer do CEP.')
    const ini = d.dataInicio ?? p.dataInicio
    const fim = d.dataFim ?? p.dataFim
    if (ini && fim && fim <= ini) throw httpErr(400, 'dataFim deve ser posterior a dataInicio.')
    const row = await prisma.pesProjeto.update({ where: { id: p.id }, data: d as any })
    await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'ATUALIZAR_PROJETO', refType: 'PesProjeto', refId: p.id })
    res.json(row)
  })
  router.put('/projetos/:id', requireRole(...DOCENTES), atualizarProjeto)
  router.patch('/projetos/:id', requireRole(...DOCENTES), atualizarProjeto)

  router.post(
    '/projetos/:id/transicao',
    requireRole(...DOCENTES),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const { para, motivo } = parseBody(z.object({ para: z.enum(['RASCUNHO', 'SUBMETIDO', 'EM_AVALIACAO', 'APROVADO', 'EM_EXECUCAO', 'SUSPENSO', 'CONCLUIDO', 'CANCELADO', 'REPROVADO']), motivo: z.string().optional() }), req.body)
      const p = await prisma.pesProjeto.findFirst({ where: { id: String(req.params.id), tenantId } })
      if (!p) return res.status(404).json({ error: 'Projeto não encontrado.' })
      const dono = p.coordenadorUserId === req.user!.id
      // submissão/cancelamento pelo coordenador do projeto; avaliação/decisão pela coordenação
      const soGestor = ['EM_AVALIACAO', 'APROVADO', 'REPROVADO', 'EM_EXECUCAO', 'SUSPENSO', 'CONCLUIDO'].includes(para)
      if (!ehGestor(req) && (soGestor || !dono)) throw httpErr(403, 'Sem permissão para esta transição.')
      if (!podeTransicionar(TRANSICOES_PROJETO, p.status, para)) throw httpErr(409, `Transição inválida: ${p.status} → ${para}.`)
      const pend = await pendenciasProjeto(tenantId, { ...p, __motivo: motivo }, para)
      if (pend.length) return res.status(422).json({ error: 'Pendências impedem a transição.', pendencias: pend })
      const row = await prisma.pesProjeto.update({ where: { id: p.id }, data: { status: para as any, motivoStatus: motivo ?? null } })
      await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: `PROJETO_${para}`, refType: 'PesProjeto', refId: p.id, detalhes: { de: p.status, motivo } })
      if (para === 'EM_EXECUCAO' && p.status === 'APROVADO') await gerarObrigacoes(tenantId, p)
      if (para === 'SUBMETIDO') {
        await scheduleReminder({ tenantId, modulo: MOD, titulo: `Avaliar projeto ${p.codigo}: ${p.titulo}`, dueAt: addDays(new Date(), 15), severity: 'INFO', refType: 'PesProjeto', refId: p.id, assigneeRole: 'COORDINATOR', dedupeKey: `pes-prj-aval-${p.id}` })
      }
      if (['APROVADO', 'REPROVADO', 'EM_EXECUCAO', 'CONCLUIDO', 'CANCELADO'].includes(para)) await completeReminders({ tenantId, refType: 'PesProjeto', refId: p.id, userId: getUserId(req) })
      if (['CANCELADO', 'CONCLUIDO'].includes(para)) {
        for (const tipo of ['PesProjetoRelatorio', 'PesProjetoEntregavel']) {
          const ids = await (prisma as any)[tipo === 'PesProjetoRelatorio' ? 'pesProjetoRelatorio' : 'pesProjetoEntregavel'].findMany({ where: { tenantId, projetoId: p.id }, select: { id: true } })
          for (const i of ids) await cancelReminders({ tenantId, refType: tipo, refId: i.id })
        }
      }
      if (para === 'CANCELADO' || para === 'SUSPENSO') {
        const bolsas = await prisma.pesBolsa.findMany({ where: { tenantId, projetoId: p.id, status: 'ATIVA' } })
        for (const b of bolsas) await mudarStatusBolsa(tenantId, b.id, para === 'CANCELADO' ? 'CANCELADA' : 'SUSPENSA', `Projeto ${para.toLowerCase()}: ${motivo}`)
      }
      if (p.coordenadorUserId && !dono) await notify({ tenantId, userId: p.coordenadorUserId, assunto: `Projeto ${p.codigo}: ${para}`, mensagem: `O projeto "${p.titulo}" mudou para ${para}.${motivo ? ' Motivo: ' + motivo : ''}`, refType: 'PesProjeto', refId: p.id })
      res.json(row)
    }),
  )

  router.get(
    '/projetos/:id/painel',
    requireRole(...LEITORES, 'STUDENT'),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const p = await prisma.pesProjeto.findFirst({ where: { id: String(req.params.id), tenantId, ...(ehAluno(req) ? { membros: { some: { studentId: req.user!.studentId ?? '-' } } } : {}) }, include: { etapas: true, rubricas: true, lancamentos: true, entregaveis: true, relatorios: true, membros: true } })
      if (!p) return res.status(404).json({ error: 'Projeto não encontrado.' })
      const agora = new Date()
      const etapas = p.etapas.map((e) => ({ ...e, situacao: situacaoEtapa(e, agora) }))
      const orc = resumoOrcamento(p.rubricas.map((r) => ({ id: r.id, categoria: r.categoria, descricao: r.descricao, valorPrevisto: num(r.valorPrevisto) })), p.lancamentos.map((l) => ({ rubricaId: l.rubricaId, valor: num(l.valor) })), num(p.orcamentoTotal))
      const atrasos = {
        etapas: etapas.filter((e) => e.situacao === 'ATRASADA').length,
        entregaveis: p.entregaveis.filter((e) => ['PENDENTE', 'ATRASADO'].includes(e.status) && e.prazo < agora).length,
        relatorios: p.relatorios.filter((r) => ['PENDENTE', 'ATRASADO', 'AJUSTES_SOLICITADOS'].includes(r.status) && r.prazo < agora).length,
      }
      res.json({
        projeto: { id: p.id, codigo: p.codigo, titulo: p.titulo, status: p.status, tipo: p.tipo, dataInicio: p.dataInicio, dataFim: p.dataFim, cepStatus: p.cepStatus },
        progressoPercentual: progressoProjeto(p.etapas),
        etapas, orcamento: orc, atrasos,
        proximosPrazos: [
          ...p.entregaveis.filter((e) => e.status === 'PENDENTE').map((e) => ({ tipo: 'ENTREGAVEL', titulo: e.titulo, prazo: e.prazo })),
          ...p.relatorios.filter((r) => r.status === 'PENDENTE').map((r) => ({ tipo: `RELATORIO_${r.tipo}`, titulo: r.referencia ?? r.tipo, prazo: r.prazo })),
        ].sort((a, b) => a.prazo.getTime() - b.prazo.getTime()).slice(0, 10),
        equipe: p.membros.filter((m) => !m.dataFim).length,
      })
    }),
  )

  // ---------- Membros ----------
  mountCrud(router, {
    model: 'pesProjetoMembro',
    path: '/projetos-membros',
    read: [...LEITORES],
    write: DOCENTES,
    create: z.object({
      projetoId: z.string(),
      tipo: z.enum(['DOCENTE', 'ALUNO', 'EXTERNO']).default('ALUNO'),
      userId: z.string().optional().nullable(),
      studentId: z.string().optional().nullable(),
      nome: z.string().trim().min(2).optional(),
      papel: z.enum(['COORDENADOR', 'ORIENTADOR', 'BOLSISTA', 'VOLUNTARIO', 'COLABORADOR']).default('BOLSISTA'),
      cargaHorariaSemanal: z.number().int().min(1).max(60).optional().nullable(),
      dataInicio: z.coerce.date().optional(),
      dataFim: z.coerce.date().optional().nullable(),
    }),
    filters: ['projetoId', 'papel', 'tipo', 'studentId', 'userId'],
    modulo: MOD,
    beforeCreate: async (d, req) => {
      const tenantId = getTenantId(req)
      const p = await prisma.pesProjeto.findFirst({ where: { id: d.projetoId, tenantId } })
      if (!p) throw httpErr(404, 'Projeto não encontrado.')
      if (!ehGestor(req) && p.coordenadorUserId !== req.user!.id) throw httpErr(403, 'Somente o coordenador do projeto adiciona membros.')
      if (d.studentId) {
        const s = await alunoLite(tenantId, d.studentId)
        if (!s) throw httpErr(404, 'Aluno não encontrado.')
        d.nome = d.nome ?? s.nomeCompleto
        d.tipo = 'ALUNO'
        const ja = await prisma.pesProjetoMembro.findFirst({ where: { tenantId, projetoId: d.projetoId, studentId: d.studentId, dataFim: null } })
        if (ja) throw httpErr(409, 'Aluno já participa deste projeto.')
        if (d.papel === 'BOLSISTA') {
          const outro = await prisma.pesProjetoMembro.findFirst({ where: { tenantId, studentId: d.studentId, papel: 'BOLSISTA', dataFim: null, projeto: { status: { in: ['APROVADO', 'EM_EXECUCAO', 'SUSPENSO'] } } } })
          if (outro) throw httpErr(409, 'Aluno já é bolsista em outro projeto ativo (acúmulo vedado).')
        }
      } else if (d.userId) {
        d.nome = d.nome ?? (await nomeUsuario(tenantId, d.userId)) ?? undefined
        d.tipo = 'DOCENTE'
      }
      if (!d.nome) throw httpErr(400, 'Informe o nome (ou studentId/userId).')
      return d
    },
  })
  router.post(
    '/projetos-membros/:id/desligar',
    requireRole(...DOCENTES),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const m = await prisma.pesProjetoMembro.findFirst({ where: { id: String(req.params.id), tenantId }, include: { projeto: true } })
      if (!m) return res.status(404).json({ error: 'Membro não encontrado.' })
      if (!ehGestor(req) && m.projeto.coordenadorUserId !== req.user!.id) throw httpErr(403, 'Sem permissão.')
      const row = await prisma.pesProjetoMembro.update({ where: { id: m.id }, data: { dataFim: new Date() } })
      if (m.papel === 'BOLSISTA' && m.studentId) {
        const b = await prisma.pesBolsa.findFirst({ where: { tenantId, projetoId: m.projetoId, studentId: m.studentId, status: { in: ['ATIVA', 'SUSPENSA'] } } })
        if (b) await mudarStatusBolsa(tenantId, b.id, 'ENCERRADA', 'Bolsista desligado do projeto')
      }
      await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'DESLIGAR_MEMBRO_PROJETO', refType: 'PesProjetoMembro', refId: m.id })
      res.json(row)
    }),
  )

  // ---------- Cronograma ----------
  const etapaSchema = z.object({
    projetoId: z.string(),
    ordem: z.number().int().min(1).optional(),
    titulo: z.string().trim().min(3),
    descricao: z.string().optional().nullable(),
    inicioPrevisto: z.coerce.date(),
    fimPrevisto: z.coerce.date(),
    inicioReal: z.coerce.date().optional().nullable(),
    fimReal: z.coerce.date().optional().nullable(),
    percentual: z.number().int().min(0).max(100).default(0),
  })
  const normEtapa = (d: any) => {
    if (d.fimPrevisto && d.inicioPrevisto && d.fimPrevisto < d.inicioPrevisto) throw httpErr(400, 'Fim previsto anterior ao início previsto.')
    if (d.percentual != null) {
      d.status = situacaoEtapa({ fimPrevisto: d.fimPrevisto ?? new Date(8.64e15), status: d.percentual >= 100 ? 'CONCLUIDA' : d.percentual > 0 ? 'EM_ANDAMENTO' : 'PLANEJADA', percentual: d.percentual })
      if (d.percentual >= 100 && !d.fimReal) d.fimReal = new Date()
      if (d.percentual > 0 && !d.inicioReal) d.inicioReal = new Date()
    }
    return d
  }
  mountCrud(router, {
    model: 'pesProjetoEtapa',
    path: '/projetos-etapas',
    read: LEITORES,
    write: DOCENTES,
    create: etapaSchema,
    filters: ['projetoId', 'status'],
    orderBy: [{ ordem: 'asc' }, { inicioPrevisto: 'asc' }],
    modulo: MOD,
    beforeCreate: async (d, req) => {
      const p = await prisma.pesProjeto.findFirst({ where: { id: d.projetoId, tenantId: getTenantId(req) } })
      if (!p) throw httpErr(404, 'Projeto não encontrado.')
      if (!ehGestor(req) && p.coordenadorUserId !== req.user!.id) throw httpErr(403, 'Somente o coordenador do projeto edita o cronograma.')
      if (p.dataInicio && d.inicioPrevisto < p.dataInicio) throw httpErr(400, 'Etapa começa antes do início do projeto.')
      if (p.dataFim && d.fimPrevisto > p.dataFim) throw httpErr(400, 'Etapa termina depois do fim do projeto.')
      return normEtapa(d)
    },
    beforeUpdate: (d, _req, cur) => normEtapa({ ...d, fimPrevisto: d.fimPrevisto ?? cur.fimPrevisto, inicioPrevisto: d.inicioPrevisto ?? cur.inicioPrevisto, percentual: d.percentual ?? cur.percentual, inicioReal: d.inicioReal ?? cur.inicioReal, fimReal: d.fimReal ?? cur.fimReal }),
  })

  // ---------- Orçamento ----------
  mountCrud(router, {
    model: 'pesProjetoRubrica',
    path: '/projetos-rubricas',
    read: LEITORES,
    write: DOCENTES,
    create: z.object({ projetoId: z.string(), categoria: z.enum(['CUSTEIO', 'CAPITAL', 'BOLSA', 'SERVICO_TERCEIROS', 'VIAGEM', 'OUTRO']), descricao: z.string().trim().min(3), valorPrevisto: z.number().min(0) }),
    filters: ['projetoId', 'categoria'],
    modulo: MOD,
    beforeCreate: async (d, req) => {
      const tenantId = getTenantId(req)
      const p = await prisma.pesProjeto.findFirst({ where: { id: d.projetoId, tenantId } })
      if (!p) throw httpErr(404, 'Projeto não encontrado.')
      if (!ehGestor(req) && p.coordenadorUserId !== req.user!.id) throw httpErr(403, 'Sem permissão.')
      const soma = await prisma.pesProjetoRubrica.aggregate({ where: { tenantId, projetoId: p.id }, _sum: { valorPrevisto: true } })
      if (num(p.orcamentoTotal) > 0 && num(soma._sum.valorPrevisto) + d.valorPrevisto > num(p.orcamentoTotal) + 0.005) throw httpErr(422, 'Soma das rubricas excede o orçamento total do projeto.')
      return d
    },
  })

  router.post(
    '/projetos/:id/lancamentos',
    requireRole(...DOCENTES, 'FINANCE'),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const d = parseBody(z.object({ rubricaId: z.string(), descricao: z.string().trim().min(3), valor: z.number().positive(), data: z.coerce.date().optional(), documento: z.string().optional().nullable() }), req.body)
      const p = await prisma.pesProjeto.findFirst({ where: { id: String(req.params.id), tenantId } })
      if (!p) return res.status(404).json({ error: 'Projeto não encontrado.' })
      if (!ehGestor(req) && p.coordenadorUserId !== req.user!.id && String(req.user?.role).toUpperCase() !== 'FINANCE') throw httpErr(403, 'Sem permissão.')
      if (!['APROVADO', 'EM_EXECUCAO'].includes(p.status)) throw httpErr(409, 'Lançamentos só em projeto aprovado/em execução.')
      const r = await prisma.pesProjetoRubrica.findFirst({ where: { id: d.rubricaId, tenantId, projetoId: p.id } })
      if (!r) throw httpErr(404, 'Rubrica não encontrada neste projeto.')
      const gasto = await prisma.pesProjetoLancamento.aggregate({ where: { tenantId, rubricaId: r.id }, _sum: { valor: true } })
      const saldo = num(r.valorPrevisto) - num(gasto._sum.valor)
      if (d.valor > saldo + 0.005) throw httpErr(422, `Saldo insuficiente na rubrica "${r.descricao}": disponível ${saldo.toFixed(2)}.`)
      const row = await prisma.pesProjetoLancamento.create({ data: { tenantId, projetoId: p.id, ...d } })
      await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'LANCAR_DESPESA', refType: 'PesProjeto', refId: p.id, detalhes: { valor: d.valor, rubrica: r.descricao } })
      res.status(201).json(row)
    }),
  )

  router.get(
    '/projetos/:id/orcamento',
    requireRole(...LEITORES),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const p = await prisma.pesProjeto.findFirst({ where: { id: String(req.params.id), tenantId }, include: { rubricas: true, lancamentos: { orderBy: { data: 'desc' } } } })
      if (!p) return res.status(404).json({ error: 'Projeto não encontrado.' })
      res.json({ ...resumoOrcamento(p.rubricas.map((r) => ({ id: r.id, categoria: r.categoria, descricao: r.descricao, valorPrevisto: num(r.valorPrevisto) })), p.lancamentos.map((l) => ({ rubricaId: l.rubricaId, valor: num(l.valor) })), num(p.orcamentoTotal)), lancamentos: p.lancamentos })
    }),
  )

  // ---------- Entregáveis ----------
  mountCrud(router, {
    model: 'pesProjetoEntregavel',
    path: '/projetos-entregaveis',
    read: LEITORES,
    write: DOCENTES,
    create: z.object({ projetoId: z.string(), titulo: z.string().trim().min(3), tipo: z.enum(['ARTIGO', 'PROTOTIPO', 'RELATORIO', 'EVENTO', 'SOFTWARE', 'OUTRO']).default('RELATORIO'), prazo: z.coerce.date(), url: z.string().optional().nullable(), publicacaoId: z.string().optional().nullable(), observacoes: z.string().optional().nullable() }),
    update: z.object({ titulo: z.string().optional(), tipo: z.string().optional(), prazo: z.coerce.date().optional(), url: z.string().optional().nullable(), publicacaoId: z.string().optional().nullable(), observacoes: z.string().optional().nullable() }),
    filters: ['projetoId', 'status', 'tipo'],
    orderBy: { prazo: 'asc' },
    modulo: MOD,
    beforeCreate: async (d, req) => {
      const p = await prisma.pesProjeto.findFirst({ where: { id: d.projetoId, tenantId: getTenantId(req) } })
      if (!p) throw httpErr(404, 'Projeto não encontrado.')
      if (!ehGestor(req) && p.coordenadorUserId !== req.user!.id) throw httpErr(403, 'Sem permissão.')
      return d
    },
    afterCreate: async (row) => {
      const p = await prisma.pesProjeto.findFirst({ where: { id: row.projetoId } })
      await scheduleReminder({ tenantId: row.tenantId, modulo: MOD, titulo: `Entregável "${row.titulo}" (projeto ${p?.codigo ?? ''})`, dueAt: row.prazo, antecedenciaDias: 7, refType: 'PesProjetoEntregavel', refId: row.id, assigneeUserId: p?.coordenadorUserId ?? undefined, assigneeRole: p?.coordenadorUserId ? undefined : 'COORDINATOR', dedupeKey: `pes-ent-${row.id}` })
    },
    afterUpdate: async (row) => {
      await scheduleReminder({ tenantId: row.tenantId, modulo: MOD, titulo: `Entregável "${row.titulo}"`, dueAt: row.prazo, antecedenciaDias: 7, refType: 'PesProjetoEntregavel', refId: row.id, dedupeKey: `pes-ent-${row.id}` })
    },
  })
  router.post(
    '/projetos-entregaveis/:id/entregar',
    requireRole(...DOCENTES),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const e = await prisma.pesProjetoEntregavel.findFirst({ where: { id: String(req.params.id), tenantId }, include: { projeto: true } })
      if (!e) return res.status(404).json({ error: 'Entregável não encontrado.' })
      if (!ehGestor(req) && e.projeto.coordenadorUserId !== req.user!.id) throw httpErr(403, 'Sem permissão.')
      const d = parseBody(z.object({ url: z.string().optional().nullable(), publicacaoId: z.string().optional().nullable(), aceitar: z.boolean().optional() }), req.body)
      if (d.publicacaoId && !(await prisma.pesPublicacao.findFirst({ where: { id: d.publicacaoId, tenantId }, select: { id: true } }))) throw httpErr(404, 'Publicação vinculada não encontrada.')
      const status = d.aceitar && ehGestor(req) ? 'ACEITO' : 'ENTREGUE'
      const row = await prisma.pesProjetoEntregavel.update({ where: { id: e.id }, data: { status, entregueEm: new Date(), url: d.url ?? e.url, publicacaoId: d.publicacaoId ?? e.publicacaoId } })
      await completeReminders({ tenantId, refType: 'PesProjetoEntregavel', refId: e.id, userId: getUserId(req) })
      res.json(row)
    }),
  )

  // ---------- Relatórios parciais/finais ----------
  mountCrud(router, {
    model: 'pesProjetoRelatorio',
    path: '/projetos-relatorios',
    read: LEITORES,
    write: GESTAO,
    create: z.object({ projetoId: z.string(), tipo: z.enum(['PARCIAL', 'FINAL']).default('PARCIAL'), referencia: z.string().optional().nullable(), prazo: z.coerce.date() }),
    filters: ['projetoId', 'status', 'tipo'],
    orderBy: { prazo: 'asc' },
    modulo: MOD,
    afterCreate: async (row) => {
      const p = await prisma.pesProjeto.findFirst({ where: { id: row.projetoId } })
      await scheduleReminder({ tenantId: row.tenantId, modulo: MOD, titulo: `Relatório ${row.tipo.toLowerCase()} do projeto ${p?.codigo ?? ''}`, dueAt: row.prazo, antecedenciaDias: 15, refType: 'PesProjetoRelatorio', refId: row.id, assigneeUserId: p?.coordenadorUserId ?? undefined, dedupeKey: `pes-rel-${row.id}` })
    },
  })
  router.post(
    '/projetos-relatorios/:id/entregar',
    requireRole(...DOCENTES),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const r = await prisma.pesProjetoRelatorio.findFirst({ where: { id: String(req.params.id), tenantId }, include: { projeto: true } })
      if (!r) return res.status(404).json({ error: 'Relatório não encontrado.' })
      if (!ehGestor(req) && r.projeto.coordenadorUserId !== req.user!.id) throw httpErr(403, 'Sem permissão.')
      if (r.status === 'APROVADO') throw httpErr(409, 'Relatório já aprovado.')
      const { conteudo } = parseBody(z.object({ conteudo: z.string().trim().min(30, 'Relatório muito curto.') }), req.body)
      const row = await prisma.pesProjetoRelatorio.update({ where: { id: r.id }, data: { conteudo, status: 'ENTREGUE', entregueEm: new Date() } })
      await completeReminders({ tenantId, refType: 'PesProjetoRelatorio', refId: r.id, userId: getUserId(req) })
      await scheduleReminder({ tenantId, modulo: MOD, titulo: `Avaliar relatório ${r.tipo.toLowerCase()} do projeto ${r.projeto.codigo}`, dueAt: addDays(new Date(), 15), refType: 'PesProjetoRelatorioAvaliacao', refId: r.id, assigneeRole: 'COORDINATOR', dedupeKey: `pes-rel-aval-${r.id}` })
      res.json(row)
    }),
  )
  router.post(
    '/projetos-relatorios/:id/avaliar',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const r = await prisma.pesProjetoRelatorio.findFirst({ where: { id: String(req.params.id), tenantId }, include: { projeto: true } })
      if (!r) return res.status(404).json({ error: 'Relatório não encontrado.' })
      if (r.status !== 'ENTREGUE') throw httpErr(409, 'Só relatórios entregues podem ser avaliados.')
      const d = parseBody(z.object({ aprovado: z.boolean(), parecer: z.string().trim().min(5), nota: z.number().min(0).max(10).optional() }), req.body)
      const row = await prisma.pesProjetoRelatorio.update({ where: { id: r.id }, data: { status: d.aprovado ? 'APROVADO' : 'AJUSTES_SOLICITADOS', parecer: d.parecer, nota: d.nota ?? null, avaliadorUserId: getUserId(req), avaliadoEm: new Date() } })
      await completeReminders({ tenantId, refType: 'PesProjetoRelatorioAvaliacao', refId: r.id, userId: getUserId(req) })
      if (!d.aprovado) {
        const prazo = addDays(new Date(), 15)
        await prisma.pesProjetoRelatorio.update({ where: { id: r.id }, data: { prazo } })
        await scheduleReminder({ tenantId, modulo: MOD, titulo: `Ajustar relatório ${r.tipo.toLowerCase()} (${r.projeto.codigo})`, dueAt: prazo, severity: 'ATENCAO', refType: 'PesProjetoRelatorio', refId: r.id, assigneeUserId: r.projeto.coordenadorUserId ?? undefined, dedupeKey: `pes-rel-${r.id}` })
      }
      if (r.projeto.coordenadorUserId) await notify({ tenantId, userId: r.projeto.coordenadorUserId, assunto: `Relatório ${d.aprovado ? 'aprovado' : 'com ajustes'} — ${r.projeto.codigo}`, mensagem: d.parecer, refType: 'PesProjetoRelatorio', refId: r.id })
      res.json(row)
    }),
  )

  // ---------- Bolsas ----------
  router.get(
    '/bolsas',
    requireRole(...LEITORES, 'FINANCE'),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const { skip, take, page, pageSize } = pageParams(req.query)
      const where: any = { tenantId }
      for (const f of ['status', 'modalidade', 'projetoId', 'studentId', 'editalId', 'agencia']) {
        const v = qs((req.query as any)[f])
        if (v) where[f] = v
      }
      const [items, total] = await Promise.all([prisma.pesBolsa.findMany({ where, include: { pagamentos: { orderBy: { competencia: 'asc' } } }, orderBy: { createdAt: 'desc' }, skip, take }), prisma.pesBolsa.count({ where })])
      res.json({ items, total, page, pageSize })
    }),
  )
  router.get(
    '/minhas-bolsas',
    requireRole('STUDENT'),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const items = await prisma.pesBolsa.findMany({ where: { tenantId, studentId: req.user!.studentId ?? '-' }, include: { pagamentos: { orderBy: { competencia: 'asc' } } }, orderBy: { createdAt: 'desc' } })
      res.json({ items })
    }),
  )
  router.post(
    '/bolsas',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const d = parseBody(z.object({ projetoId: z.string().optional().nullable(), editalId: z.string().optional().nullable(), inscricaoId: z.string().optional().nullable(), studentId: z.string(), orientadorUserId: z.string().optional().nullable(), modalidade: z.string().default('PIBIC'), agencia: z.enum(['INSTITUCIONAL', 'CNPQ', 'CAPES', 'FAPESP', 'OUTRA']).default('INSTITUCIONAL'), valorMensal: z.number().positive(), dataInicio: z.coerce.date(), dataFim: z.coerce.date() }), req.body)
      const row = await criarBolsa(tenantId, d)
      await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'CRIAR_BOLSA', refType: 'PesBolsa', refId: row.id })
      res.status(201).json(row)
    }),
  )
  router.post(
    '/bolsas/:id/status',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const { para, motivo } = parseBody(z.object({ para: z.enum(['ATIVA', 'SUSPENSA', 'ENCERRADA', 'CANCELADA']), motivo: z.string().trim().min(3) }), req.body)
      const row = await mudarStatusBolsa(tenantId, String(req.params.id), para, motivo)
      await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: `BOLSA_${para}`, refType: 'PesBolsa', refId: row.id, detalhes: { motivo } })
      res.json(row)
    }),
  )
  router.post(
    '/bolsas/:id/pagamentos/:competencia/liberar',
    requireRole(...GESTAO, 'FINANCE'),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const b = await prisma.pesBolsa.findFirst({ where: { id: String(req.params.id), tenantId } })
      if (!b) return res.status(404).json({ error: 'Bolsa não encontrada.' })
      if (b.status !== 'ATIVA') throw httpErr(409, 'Bolsa não está ativa.')
      if (b.projetoId) {
        const atras = await prisma.pesProjetoRelatorio.count({ where: { tenantId, projetoId: b.projetoId, status: { in: ['PENDENTE', 'ATRASADO'] }, prazo: { lt: new Date() } } })
        if (atras) throw httpErr(422, 'Pagamento bloqueado: projeto com relatório em atraso.')
      }
      const pg = await prisma.pesBolsaPagamento.findFirst({ where: { bolsaId: b.id, competencia: String(req.params.competencia), tenantId } })
      if (!pg) return res.status(404).json({ error: 'Competência não encontrada.' })
      if (pg.status === 'PAGO') throw httpErr(409, 'Competência já paga.')
      const marcarPago = qs(req.query.pago) === 'true'
      const row = await prisma.pesBolsaPagamento.update({ where: { id: pg.id }, data: { status: marcarPago ? 'PAGO' : 'LIBERADO', pagoEm: marcarPago ? new Date() : null } })
      res.json(row)
    }),
  )

  // ---------- Job: marca atrasos e escala ----------
  registerEduJob('pesquisa:projetos-atrasos', async () => {
    const agora = new Date()
    const [rel, ent, etp] = await Promise.all([
      prisma.pesProjetoRelatorio.updateMany({ where: { status: 'PENDENTE', prazo: { lt: agora } }, data: { status: 'ATRASADO' } }),
      prisma.pesProjetoEntregavel.updateMany({ where: { status: 'PENDENTE', prazo: { lt: agora } }, data: { status: 'ATRASADO' } }),
      prisma.pesProjetoEtapa.updateMany({ where: { status: { in: ['PLANEJADA', 'EM_ANDAMENTO'] }, fimPrevisto: { lt: agora }, percentual: { lt: 100 } }, data: { status: 'ATRASADA' } }),
    ])
    // projetos cuja data fim passou e ainda em execução → alerta único para a coordenação
    const vencidos = await prisma.pesProjeto.findMany({ where: { status: 'EM_EXECUCAO', dataFim: { lt: agora } }, take: 500 })
    for (const p of vencidos) {
      await scheduleReminder({ tenantId: p.tenantId, modulo: MOD, titulo: `Projeto ${p.codigo} passou da data fim e segue em execução`, dueAt: agora, severity: 'CRITICO', refType: 'PesProjeto', refId: p.id, assigneeRole: 'COORDINATOR', remindAt: agora, dedupeKey: `pes-prj-vencido-${p.id}` })
    }
    return { relatoriosAtrasados: rel.count, entregaveisAtrasados: ent.count, etapasAtrasadas: etp.count, projetosVencidos: vencidos.length }
  })
}

// ---------- serviços de bolsa (exportados p/ editais.ts) ----------
export async function criarBolsa(tenantId: string, d: { projetoId?: string | null; editalId?: string | null; inscricaoId?: string | null; studentId: string; orientadorUserId?: string | null; modalidade: string; agencia: string; valorMensal: number; dataInicio: Date; dataFim: Date }) {
  const { competenciasBolsa } = await import('./lib')
  if (d.dataFim <= d.dataInicio) throw httpErr(400, 'dataFim deve ser posterior a dataInicio.')
  const s = await alunoLite(tenantId, d.studentId)
  if (!s) throw httpErr(404, 'Aluno não encontrado.')
  const ativa = await prisma.pesBolsa.findFirst({ where: { tenantId, studentId: d.studentId, status: { in: ['ATIVA', 'SUSPENSA'] }, dataFim: { gte: d.dataInicio } } })
  if (ativa) throw httpErr(409, 'Aluno já possui bolsa ativa no período.')
  if (d.projetoId && !(await prisma.pesProjeto.findFirst({ where: { id: d.projetoId, tenantId }, select: { id: true } }))) throw httpErr(404, 'Projeto não encontrado.')
  const bolsa = await prisma.pesBolsa.create({
    data: { tenantId, projetoId: d.projetoId ?? null, editalId: d.editalId ?? null, inscricaoId: d.inscricaoId ?? null, studentId: d.studentId, userId: s.userId, bolsistaNome: s.nomeCompleto, orientadorUserId: d.orientadorUserId ?? null, modalidade: d.modalidade, agencia: d.agencia, valorMensal: d.valorMensal, dataInicio: d.dataInicio, dataFim: d.dataFim },
  })
  await prisma.pesBolsaPagamento.createMany({ data: competenciasBolsa(d.dataInicio, d.dataFim).map((c) => ({ tenantId, bolsaId: bolsa.id, competencia: c, valor: d.valorMensal })) })
  await scheduleReminder({ tenantId, modulo: MOD, titulo: `Bolsa de ${s.nomeCompleto} termina em breve`, dueAt: d.dataFim, antecedenciaDias: 30, refType: 'PesBolsa', refId: bolsa.id, assigneeUserId: d.orientadorUserId ?? undefined, assigneeRole: d.orientadorUserId ? undefined : 'COORDINATOR', dedupeKey: `pes-bolsa-fim-${bolsa.id}` })
  await notify({ tenantId, studentId: s.id, assunto: 'Bolsa de pesquisa implantada', mensagem: `Sua bolsa ${d.modalidade} foi implantada (${d.dataInicio.toLocaleDateString('pt-BR')} a ${d.dataFim.toLocaleDateString('pt-BR')}).`, refType: 'PesBolsa', refId: bolsa.id })
  return bolsa
}

export async function mudarStatusBolsa(tenantId: string, id: string, para: 'ATIVA' | 'SUSPENSA' | 'ENCERRADA' | 'CANCELADA', motivo: string) {
  const b = await prisma.pesBolsa.findFirst({ where: { id, tenantId } })
  if (!b) throw httpErr(404, 'Bolsa não encontrada.')
  const ok: Record<string, string[]> = { ATIVA: ['SUSPENSA', 'ENCERRADA', 'CANCELADA'], SUSPENSA: ['ATIVA', 'ENCERRADA', 'CANCELADA'], ENCERRADA: [], CANCELADA: [] }
  if (!ok[b.status]?.includes(para)) throw httpErr(409, `Transição de bolsa inválida: ${b.status} → ${para}.`)
  const row = await prisma.pesBolsa.update({ where: { id }, data: { status: para, motivoStatus: motivo } })
  if (para !== 'ATIVA') await prisma.pesBolsaPagamento.updateMany({ where: { bolsaId: id, status: { in: ['PREVISTO', 'LIBERADO'] }, ...(para === 'SUSPENSA' ? {} : { competencia: { gte: new Date().toISOString().slice(0, 7) } }) }, data: { status: 'SUSPENSO' } })
  else await prisma.pesBolsaPagamento.updateMany({ where: { bolsaId: id, status: 'SUSPENSO' }, data: { status: 'PREVISTO' } })
  if (['ENCERRADA', 'CANCELADA'].includes(para)) await cancelReminders({ tenantId, refType: 'PesBolsa', refId: id })
  if (b.studentId) await notify({ tenantId, studentId: b.studentId, assunto: `Bolsa ${para.toLowerCase()}`, mensagem: `Sua bolsa de pesquisa foi ${para.toLowerCase()}. Motivo: ${motivo}`, refType: 'PesBolsa', refId: id })
  return row
}
