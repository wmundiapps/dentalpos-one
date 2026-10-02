import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { mountCrud, pageParams, parseBody, qs } from '../core/crud'
import { audit, notify } from '../core/notify'
import { cancelReminders, completeReminders, scheduleReminder } from '../core/reminders'
import { MODULO, SEC, SEC_GESTAO, SEC_LEITURA, exigirAluno, nomeUsuario, proximoProtocolo } from './common'
import {
  ProtocoloStatus,
  addBusinessDays,
  exigeParecer,
  isTerminal,
  novoPrazoAposPendencia,
  podeTransitar,
  slaSituacao,
  DAY,
} from './logic'
import { emitirDocumento } from './documentos'

// ============================================================
// REQUERIMENTOS / PROTOCOLO
// ============================================================

const REF = 'SecProtocolo'
const ANEXO_MAX = 2_000_000 // ~2 MB em dataUrl

const anexoSchema = z
  .object({
    nome: z.string().min(1).max(200),
    mime: z.string().max(100).optional(),
    url: z.string().url().max(2000).optional(),
    dataUrl: z.string().max(ANEXO_MAX).regex(/^data:/, 'dataUrl inválido').optional(),
    descricao: z.string().max(500).optional(),
  })
  .refine((a) => a.url || a.dataUrl, { message: 'informe url ou dataUrl' })

const tipoSchema = z.object({
  codigo: z.string().min(2).max(40).transform((s) => s.toUpperCase().replace(/\s+/g, '_')),
  nome: z.string().min(3).max(150),
  descricao: z.string().max(1000).optional(),
  categoria: z.enum(['ACADEMICO', 'DOCUMENTO', 'FINANCEIRO', 'DIPLOMA', 'GERAL']).default('GERAL'),
  slaDias: z.number().int().min(0).max(180).default(5),
  taxa: z.number().min(0).max(100000).default(0),
  geraDocumento: z.string().max(60).nullable().optional(),
  abertoPeloAluno: z.boolean().default(true),
  exigeAnexo: z.boolean().default(false),
  checklistModeloId: z.string().nullable().optional(),
  prazoReenvioDias: z.number().int().min(1).max(180).default(15),
  responsavelRole: z.string().max(30).default('SECRETARY'),
  camposExtras: z.array(z.object({ chave: z.string(), rotulo: z.string(), obrigatorio: z.boolean().optional() })).optional(),
  ativo: z.boolean().optional(),
})

const abrirSchema = z.object({
  tipoId: z.string().min(1),
  studentId: z.string().optional(),
  enrollmentId: z.string().optional(),
  solicitanteNome: z.string().max(200).optional(),
  assunto: z.string().max(200).optional(),
  descricao: z.string().max(5000).optional(),
  prioridade: z.enum(['BAIXA', 'NORMAL', 'ALTA', 'URGENTE']).default('NORMAL'),
  canal: z.enum(['PORTAL', 'BALCAO', 'EMAIL', 'TELEFONE']).default('BALCAO'),
  dados: z.record(z.string(), z.any()).optional(),
  anexos: z.array(anexoSchema).max(10).optional(),
})

const statusSchema = z.object({
  para: z.enum(['EM_ANALISE', 'PENDENTE_DOCUMENTO', 'DEFERIDO', 'INDEFERIDO', 'CONCLUIDO', 'CANCELADO']),
  parecer: z.string().max(3000).optional(),
  visivelAluno: z.boolean().default(true),
})

function etiqueta(s: string) {
  return (
    {
      ABERTO: 'aberto',
      EM_ANALISE: 'em análise',
      PENDENTE_DOCUMENTO: 'com pendência de documento',
      DEFERIDO: 'deferido',
      INDEFERIDO: 'indeferido',
      CONCLUIDO: 'concluído',
      CANCELADO: 'cancelado',
    } as Record<string, string>
  )[s] ?? s
}

async function feriadosDoTenant(tenantId: string): Promise<string[]> {
  // Tolerante: o módulo calendario pode expor feriados; se a tabela/model não existir, ignora.
  try {
    const d = (prisma as any).calFeriado ?? (prisma as any).calDiaNaoLetivo
    if (!d) return []
    const rows = await d.findMany({ where: { tenantId }, take: 500 })
    return rows.map((r: any) => (r.data ? new Date(r.data).toISOString().slice(0, 10) : null)).filter(Boolean)
  } catch {
    return []
  }
}

// ---------- serviços (exportados) ----------

export interface AbrirProtocoloInput {
  tenantId: string
  tipoId?: string
  tipoCodigo?: string
  studentId?: string | null
  enrollmentId?: string | null
  solicitanteNome?: string
  assunto?: string
  descricao?: string
  prioridade?: string
  canal?: string
  dados?: Record<string, unknown>
  anexos?: Array<z.infer<typeof anexoSchema>>
  abertoPorId?: string
  origem?: 'ALUNO' | 'SECRETARIA' | 'SISTEMA'
  usuarioNome?: string
}

// Abre um protocolo com numeração ANO/SEQ atômica, SLA, taxa, lembretes e notificação.
export async function abrirProtocolo(input: AbrirProtocoloInput) {
  const { tenantId } = input
  const tipo = await prisma.secTipoRequerimento.findFirst({
    where: { tenantId, ativo: true, ...(input.tipoId ? { id: input.tipoId } : { codigo: input.tipoCodigo ?? '__' }) },
  })
  if (!tipo) throw Object.assign(new Error('Tipo de requerimento não encontrado ou inativo.'), { status: 404 })

  let student: { id: string; nomeCompleto: string } | null = null
  if (input.studentId) {
    student = await prisma.student.findFirst({ where: { id: input.studentId, tenantId }, select: { id: true, nomeCompleto: true } })
    if (!student) throw Object.assign(new Error('Aluno não encontrado.'), { status: 404 })
  }
  if (input.enrollmentId) {
    const m = await prisma.enrollment.findFirst({ where: { id: input.enrollmentId, ...(student ? { studentId: student.id } : {}) }, select: { id: true } })
    if (!m) throw Object.assign(new Error('Matrícula não encontrada para o aluno.'), { status: 404 })
  }
  if (!student && !input.solicitanteNome) throw Object.assign(new Error('Informe o aluno ou o nome do solicitante.'), { status: 400 })

  const extras = Array.isArray(tipo.camposExtras) ? (tipo.camposExtras as any[]) : []
  for (const c of extras) {
    if (c?.obrigatorio && (input.dados?.[c.chave] == null || input.dados?.[c.chave] === ''))
      throw Object.assign(new Error(`Campo obrigatório não informado: ${c.rotulo || c.chave}.`), { status: 400 })
  }
  if (tipo.exigeAnexo && !(input.anexos?.length)) throw Object.assign(new Error('Este requerimento exige ao menos um anexo.'), { status: 400 })

  // Evita duplicidade: mesmo aluno + mesmo tipo ainda em andamento.
  if (student) {
    const dup = await prisma.secProtocolo.findFirst({
      where: { tenantId, studentId: student.id, tipoId: tipo.id, status: { in: ['ABERTO', 'EM_ANALISE', 'PENDENTE_DOCUMENTO', 'DEFERIDO'] } },
      select: { numero: true },
    })
    if (dup) throw Object.assign(new Error(`Já existe o protocolo ${dup.numero} em andamento para este requerimento.`), { status: 409 })
  }

  const agora = new Date()
  const feriados = await feriadosDoTenant(tenantId)
  const prazoEm = addBusinessDays(agora, tipo.slaDias, feriados)
  const { ano, seq, numero } = await proximoProtocolo(tenantId, agora)
  const origem = input.origem ?? 'SECRETARIA'

  const proto = await prisma.secProtocolo.create({
    data: {
      tenantId,
      numero,
      ano,
      seq,
      tipoId: tipo.id,
      studentId: student?.id,
      enrollmentId: input.enrollmentId ?? undefined,
      solicitanteNome: input.solicitanteNome ?? student?.nomeCompleto,
      assunto: input.assunto || tipo.nome,
      descricao: input.descricao,
      prioridade: input.prioridade ?? 'NORMAL',
      canal: input.canal ?? (origem === 'ALUNO' ? 'PORTAL' : 'BALCAO'),
      abertoPorId: input.abertoPorId,
      slaDias: tipo.slaDias,
      prazoEm,
      taxaValor: tipo.taxa,
      taxaStatus: tipo.taxa > 0 ? 'PENDENTE' : 'ISENTA',
      dados: (input.dados as any) ?? undefined,
      tramites: {
        create: {
          tenantId,
          acao: 'ABERTURA',
          paraStatus: 'ABERTO',
          usuarioId: input.abertoPorId,
          usuarioNome: input.usuarioNome,
          origem: origem === 'ALUNO' ? 'ALUNO' : origem === 'SISTEMA' ? 'SISTEMA' : 'SECRETARIA',
          parecer: `Protocolo aberto (${tipo.nome}).`,
        },
      },
      anexos: input.anexos?.length
        ? { create: input.anexos.map((a) => ({ tenantId, ...a, tamanho: a.dataUrl?.length, enviadoPorId: input.abertoPorId, enviadoPorAluno: origem === 'ALUNO' })) }
        : undefined,
    },
  })

  // Taxa -> contas a receber do financeiro (tolerante a falhas).
  if (tipo.taxa > 0 && student) {
    try {
      const ar = await prisma.accountReceivable.create({
        data: {
          tenantId,
          studentId: student.id,
          enrollmentId: input.enrollmentId ?? undefined,
          descricao: `Taxa de requerimento — ${tipo.nome} (protocolo ${numero})`,
          valor: tipo.taxa,
          dataVencimento: addBusinessDays(agora, 5, feriados),
        },
      })
      await prisma.secProtocolo.update({ where: { id: proto.id }, data: { receivableId: ar.id } })
      proto.receivableId = ar.id
    } catch (e) {
      console.error('[secretaria] falha ao gerar cobrança da taxa', e)
      await prisma.secTramite.create({ data: { tenantId, protocoloId: proto.id, acao: 'TAXA', origem: 'SISTEMA', parecer: 'Não foi possível gerar a cobrança automática; lançar manualmente.', visivelAluno: false } })
    }
  }

  await agendarLembretesSla(proto, tipo.responsavelRole)

  if (student) {
    await notify({
      tenantId,
      studentId: student.id,
      canal: 'IN_APP',
      assunto: `Protocolo ${numero} aberto`,
      mensagem: `Seu requerimento "${tipo.nome}" foi registrado sob o protocolo ${numero}. Prazo previsto: ${prazoEm.toLocaleDateString('pt-BR')}.${tipo.taxa > 0 ? ` Taxa: R$ ${tipo.taxa.toFixed(2).replace('.', ',')} (cobrança no financeiro).` : ''}`,
      templateKey: 'sec.protocolo.aberto',
      refType: REF,
      refId: proto.id,
    })
  }
  await audit({ tenantId, userId: input.abertoPorId, modulo: MODULO, acao: 'PROTOCOLO_ABERTO', refType: REF, refId: proto.id, detalhes: { numero, tipo: tipo.codigo } })
  return proto
}

async function agendarLembretesSla(proto: { id: string; tenantId: string; numero: string; prazoEm: Date; assunto: string; prioridade: string }, role: string) {
  await scheduleReminder({
    tenantId: proto.tenantId,
    modulo: MODULO,
    titulo: `Protocolo ${proto.numero} vence em breve`,
    descricao: proto.assunto,
    dueAt: proto.prazoEm,
    antecedenciaDias: 1,
    severity: proto.prioridade === 'URGENTE' ? 'CRITICO' : 'ATENCAO',
    refType: REF,
    refId: proto.id,
    assigneeRole: role,
    dedupeKey: `sec:sla:${proto.id}`,
  })
  // Escalonamento: 2 dias após o prazo a coordenação é avisada.
  const esc = new Date(proto.prazoEm.getTime() + 2 * DAY)
  await scheduleReminder({
    tenantId: proto.tenantId,
    modulo: MODULO,
    titulo: `ESCALONAMENTO: protocolo ${proto.numero} vencido sem conclusão`,
    descricao: proto.assunto,
    dueAt: esc,
    remindAt: esc,
    severity: 'CRITICO',
    refType: REF,
    refId: proto.id,
    assigneeRole: 'COORDINATOR',
    dedupeKey: `sec:esc:${proto.id}`,
  })
}

export async function mudarStatusProtocolo(p: {
  tenantId: string
  id: string
  para: ProtocoloStatus
  parecer?: string
  usuarioId?: string
  usuarioNome?: string
  origem?: 'SECRETARIA' | 'ALUNO' | 'SISTEMA'
  visivelAluno?: boolean
}) {
  const { tenantId } = p
  const proto = await prisma.secProtocolo.findFirst({ where: { id: p.id, tenantId }, include: { tipo: true } })
  if (!proto) throw Object.assign(new Error('Protocolo não encontrado.'), { status: 404 })
  const de = proto.status as ProtocoloStatus
  if (!podeTransitar(de, p.para)) throw Object.assign(new Error(`Transição inválida: ${etiqueta(de)} → ${etiqueta(p.para)}.`), { status: 409 })
  if (exigeParecer(p.para) && !(p.parecer && p.parecer.trim().length >= 5)) throw Object.assign(new Error('Informe o parecer/motivo (mín. 5 caracteres).'), { status: 400 })
  if (p.para === 'CONCLUIDO' && proto.taxaStatus === 'PENDENTE') {
    await sincronizarTaxa(proto)
    const novo = await prisma.secProtocolo.findUnique({ where: { id: proto.id }, select: { taxaStatus: true } })
    if (novo?.taxaStatus === 'PENDENTE') throw Object.assign(new Error('Taxa do requerimento ainda não foi paga. Registre o pagamento ou isente a taxa.'), { status: 409 })
  }

  const agora = new Date()
  const data: any = { status: p.para }
  if (!proto.responsavelId && p.usuarioId && p.para === 'EM_ANALISE' && (p.origem ?? 'SECRETARIA') === 'SECRETARIA') data.responsavelId = p.usuarioId
  if (p.para === 'PENDENTE_DOCUMENTO') data.pendenteDesde = agora
  if (de === 'PENDENTE_DOCUMENTO' && proto.pendenteDesde) {
    data.prazoEm = novoPrazoAposPendencia(proto.prazoEm, proto.pendenteDesde, agora)
    data.pendenteDesde = null
  }
  if (p.para === 'DEFERIDO' || p.para === 'INDEFERIDO') {
    data.decisao = p.para
    data.decisaoMotivo = p.parecer
    data.decididoEm = agora
  }
  if (p.para === 'EM_ANALISE' && (de === 'DEFERIDO' || de === 'INDEFERIDO')) {
    data.decisao = null
    data.decisaoMotivo = null
    data.decididoEm = null
  }
  if (p.para === 'CONCLUIDO' || p.para === 'CANCELADO') data.concluidoEm = agora

  const atualizado = await prisma.secProtocolo.update({
    where: { id: proto.id },
    data: { ...data, tramites: { create: { tenantId, acao: 'STATUS', deStatus: de, paraStatus: p.para, usuarioId: p.usuarioId, usuarioNome: p.usuarioNome, origem: p.origem ?? 'SECRETARIA', parecer: p.parecer, visivelAluno: p.visivelAluno ?? true } } },
  })

  // Lembretes ------------------------------------------------
  if (isTerminal(p.para) || p.para === 'INDEFERIDO') {
    await completeReminders({ tenantId, refType: REF, refId: proto.id, userId: p.usuarioId })
  }
  if (p.para === 'CANCELADO' || p.para === 'INDEFERIDO') {
    if (proto.receivableId && proto.taxaStatus === 'PENDENTE') await cancelarCobranca(proto.receivableId, tenantId, proto.id)
  }
  if (p.para === 'PENDENTE_DOCUMENTO') {
    await prisma.eduReminder.updateMany({ where: { tenantId, dedupeKey: { in: [`sec:sla:${proto.id}`, `sec:esc:${proto.id}`] }, status: { in: ['PENDENTE', 'NOTIFICADO'] } }, data: { status: 'ADIADO' } })
    if (proto.studentId) {
      await scheduleReminder({
        tenantId,
        modulo: MODULO,
        titulo: `Envie a documentação pendente do protocolo ${proto.numero}`,
        descricao: p.parecer,
        dueAt: new Date(agora.getTime() + proto.tipo.prazoReenvioDias * DAY),
        antecedenciaDias: Math.max(1, Math.floor(proto.tipo.prazoReenvioDias / 2)),
        refType: REF,
        refId: proto.id,
        assigneeStudentId: proto.studentId,
        recorrenciaDias: 5,
        severity: 'ATENCAO',
        dedupeKey: `sec:pend:${proto.id}`,
      })
    }
  }
  if (de === 'PENDENTE_DOCUMENTO' && p.para !== 'PENDENTE_DOCUMENTO') {
    await prisma.eduReminder.updateMany({ where: { tenantId, dedupeKey: `sec:pend:${proto.id}`, status: { in: ['PENDENTE', 'NOTIFICADO', 'ADIADO'] } }, data: { status: 'CONCLUIDO', concluidoEm: agora } })
    if (!isTerminal(p.para) && p.para !== 'INDEFERIDO') {
      await agendarLembretesSla(atualizado as any, proto.tipo.responsavelRole)
      await prisma.eduReminder.updateMany({ where: { tenantId, dedupeKey: { in: [`sec:sla:${proto.id}`, `sec:esc:${proto.id}`] } }, data: { status: 'PENDENTE', escalonadoEm: null } })
    }
  }
  if (p.para === 'EM_ANALISE' && (de === 'DEFERIDO' || de === 'INDEFERIDO')) {
    await agendarLembretesSla(atualizado as any, proto.tipo.responsavelRole)
    await prisma.eduReminder.updateMany({ where: { tenantId, dedupeKey: { in: [`sec:sla:${proto.id}`, `sec:esc:${proto.id}`] } }, data: { status: 'PENDENTE', escalonadoEm: null } })
  }
  if (p.para === 'DEFERIDO' && proto.tipo.geraDocumento === null) {
    // sem documento: lembrar a secretaria de concluir/entregar
    await scheduleReminder({ tenantId, modulo: MODULO, titulo: `Concluir protocolo ${proto.numero} (deferido)`, dueAt: new Date(agora.getTime() + 3 * DAY), antecedenciaDias: 1, refType: REF, refId: proto.id, assigneeRole: proto.tipo.responsavelRole, dedupeKey: `sec:conc:${proto.id}` })
  }

  // Documento automático na conclusão
  let documentoCodigo: string | undefined
  if (p.para === 'CONCLUIDO' && proto.tipo.geraDocumento && proto.studentId) {
    try {
      const doc = await emitirDocumento({ tenantId, tipo: proto.tipo.geraDocumento, studentId: proto.studentId, enrollmentId: proto.enrollmentId, protocoloId: proto.id, userId: p.usuarioId })
      documentoCodigo = doc.codigo
      await prisma.secProtocolo.update({ where: { id: proto.id }, data: { documentoCodigo } })
    } catch (e) {
      console.error('[secretaria] falha ao gerar documento do protocolo', e)
    }
  }
  if (p.para === 'CONCLUIDO' || p.para === 'DEFERIDO' || p.para === 'INDEFERIDO') {
    await prisma.eduReminder.updateMany({ where: { tenantId, dedupeKey: `sec:conc:${proto.id}`, status: { in: ['PENDENTE', 'NOTIFICADO'] } }, data: { status: 'CONCLUIDO', concluidoEm: agora } })
  }

  if (proto.studentId && (p.visivelAluno ?? true)) {
    await notify({
      tenantId,
      studentId: proto.studentId,
      assunto: `Protocolo ${proto.numero}: ${etiqueta(p.para)}`,
      mensagem: `Seu requerimento "${proto.assunto}" (protocolo ${proto.numero}) está ${etiqueta(p.para)}.${p.parecer ? ` Parecer: ${p.parecer}` : ''}${documentoCodigo ? ` Documento emitido, código de verificação ${documentoCodigo}.` : ''}`,
      templateKey: `sec.protocolo.${p.para.toLowerCase()}`,
      refType: REF,
      refId: proto.id,
    })
  }
  await audit({ tenantId, userId: p.usuarioId, modulo: MODULO, acao: `PROTOCOLO_${p.para}`, refType: REF, refId: proto.id, detalhes: { de, para: p.para } })
  return { ...atualizado, documentoCodigo }
}

async function cancelarCobranca(receivableId: string, tenantId: string, protocoloId: string) {
  try {
    await prisma.accountReceivable.updateMany({ where: { id: receivableId, tenantId, status: 'PENDENTE' }, data: { status: 'CANCELADO' } })
    await prisma.secProtocolo.update({ where: { id: protocoloId }, data: { taxaStatus: 'CANCELADA' } })
  } catch (e) {
    console.error('[secretaria] cancelarCobranca', e)
  }
}

// Reflete o pagamento do título financeiro na taxa do protocolo.
export async function sincronizarTaxa(proto: { id: string; tenantId: string; receivableId: string | null; taxaStatus: string }) {
  if (!proto.receivableId || proto.taxaStatus !== 'PENDENTE') return proto.taxaStatus
  const ar = await prisma.accountReceivable.findFirst({ where: { id: proto.receivableId, tenantId: proto.tenantId }, select: { status: true } })
  if (ar?.status === 'PAGO') {
    await prisma.secProtocolo.update({
      where: { id: proto.id },
      data: { taxaStatus: 'PAGA', tramites: { create: { tenantId: proto.tenantId, acao: 'TAXA', origem: 'SISTEMA', parecer: 'Pagamento da taxa confirmado.' } } },
    })
    return 'PAGA'
  }
  if (ar?.status === 'CANCELADO') {
    await prisma.secProtocolo.update({ where: { id: proto.id }, data: { taxaStatus: 'CANCELADA' } })
    return 'CANCELADA'
  }
  return proto.taxaStatus
}

export function viewProtocolo<T extends { prazoEm: Date; status: string }>(p: T) {
  // Relógio do SLA parado em decisões finais e enquanto aguarda documento do aluno.
  const parado = ['CONCLUIDO', 'CANCELADO', 'DEFERIDO', 'INDEFERIDO', 'PENDENTE_DOCUMENTO'].includes(p.status)
  return { ...p, sla: slaSituacao(p.prazoEm, new Date(), parado) }
}

// ---------- rotas ----------
export function mountProtocolos(router: Router) {
  mountCrud(router, {
    model: 'secTipoRequerimento',
    path: '/tipos',
    read: SEC_LEITURA,
    write: SEC_GESTAO,
    create: tipoSchema,
    search: ['nome', 'codigo'],
    filters: ['categoria', 'ativo', 'abertoPeloAluno'],
    orderBy: { nome: 'asc' },
    modulo: MODULO,
    removeMode: 'soft',
  })

  // Dashboard
  router.get(
    '/protocolos-resumo',
    requireRole(...SEC_LEITURA),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const agora = new Date()
      const abertos = { in: ['ABERTO', 'EM_ANALISE'] as any }
      const [porStatus, atrasados, vencendo, semResponsavel, concluidos30] = await Promise.all([
        prisma.secProtocolo.groupBy({ by: ['status'], where: { tenantId }, _count: { _all: true } }),
        prisma.secProtocolo.count({ where: { tenantId, status: abertos, prazoEm: { lt: agora } } }),
        prisma.secProtocolo.count({ where: { tenantId, status: abertos, prazoEm: { gte: agora, lte: new Date(agora.getTime() + 2 * DAY) } } }),
        prisma.secProtocolo.count({ where: { tenantId, status: abertos, responsavelId: null } }),
        prisma.secProtocolo.findMany({ where: { tenantId, status: 'CONCLUIDO', concluidoEm: { gte: new Date(agora.getTime() - 30 * DAY) } }, select: { createdAt: true, concluidoEm: true, prazoEm: true } }),
      ])
      const tempos = concluidos30.map((c) => ((c.concluidoEm as Date).getTime() - c.createdAt.getTime()) / DAY)
      const noPrazo = concluidos30.filter((c) => (c.concluidoEm as Date) <= c.prazoEm).length
      res.json({
        porStatus: Object.fromEntries(porStatus.map((s) => [s.status, s._count._all])),
        atrasados,
        vencendoEm2Dias: vencendo,
        semResponsavel,
        concluidos30d: concluidos30.length,
        tempoMedioDias: tempos.length ? Math.round((tempos.reduce((a, b) => a + b, 0) / tempos.length) * 10) / 10 : null,
        percentualNoPrazo: concluidos30.length ? Math.round((noPrazo / concluidos30.length) * 100) : null,
      })
    }),
  )

  router.get(
    '/protocolos',
    requireRole(...SEC_LEITURA),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const { skip, take, page, pageSize } = pageParams(req.query)
      const where: any = { tenantId }
      for (const f of ['status', 'tipoId', 'studentId', 'responsavelId', 'prioridade', 'canal']) {
        const v = qs((req.query as any)[f])
        if (v) where[f] = v
      }
      if (qs(req.query.atrasados) === 'true') {
        where.status = { in: ['ABERTO', 'EM_ANALISE'] }
        where.prazoEm = { lt: new Date() }
      }
      if (qs(req.query.minhas) === 'true') where.responsavelId = getUserId(req)
      const q = qs(req.query.q)
      if (q) where.OR = [{ numero: { contains: q } }, { assunto: { contains: q, mode: 'insensitive' } }, { solicitanteNome: { contains: q, mode: 'insensitive' } }]
      const [items, total] = await Promise.all([
        prisma.secProtocolo.findMany({ where, include: { tipo: { select: { codigo: true, nome: true } } }, orderBy: [{ prazoEm: 'asc' }], skip, take }),
        prisma.secProtocolo.count({ where }),
      ])
      res.json({ items: items.map(viewProtocolo), total, page, pageSize })
    }),
  )

  router.post(
    '/protocolos',
    requireRole(...SEC),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const b = parseBody(abrirSchema, req.body)
      const userId = getUserId(req)
      const proto = await abrirProtocolo({ ...b, tenantId, abertoPorId: userId, usuarioNome: await nomeUsuario(userId), origem: 'SECRETARIA' })
      res.status(201).json(proto)
    }),
  )

  router.get(
    '/protocolos/:id',
    requireRole(...SEC_LEITURA),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const p = await prisma.secProtocolo.findFirst({
        where: { id: String(req.params.id), tenantId },
        include: { tipo: true, tramites: { orderBy: { createdAt: 'asc' } }, anexos: { select: { id: true, nome: true, mime: true, tamanho: true, url: true, descricao: true, enviadoPorAluno: true, createdAt: true } } },
      })
      if (!p) return res.status(404).json({ error: 'Protocolo não encontrado.' })
      const taxaStatus = await sincronizarTaxa(p)
      res.json(viewProtocolo({ ...p, taxaStatus: taxaStatus as any }))
    }),
  )

  router.post(
    '/protocolos/:id/status',
    requireRole(...SEC_GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const b = parseBody(statusSchema, req.body)
      const userId = getUserId(req)
      // Deferimento/indeferimento: apenas SECRETARY/COORDINATOR (SEC_GESTAO) — já garantido; análise é livre.
      res.json(await mudarStatusProtocolo({ tenantId, id: String(req.params.id), para: b.para, parecer: b.parecer, visivelAluno: b.visivelAluno, usuarioId: userId, usuarioNome: await nomeUsuario(userId) }))
    }),
  )

  router.post(
    '/protocolos/:id/atribuir',
    requireRole(...SEC_GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const { responsavelId } = parseBody(z.object({ responsavelId: z.string().min(1) }), req.body)
      const u = await prisma.user.findFirst({ where: { id: responsavelId, tenantId, isActive: true }, select: { id: true, firstName: true, lastName: true } })
      if (!u) return res.status(404).json({ error: 'Usuário não encontrado.' })
      const p = await prisma.secProtocolo.findFirst({ where: { id: String(req.params.id), tenantId } })
      if (!p) return res.status(404).json({ error: 'Protocolo não encontrado.' })
      if (isTerminal(p.status as ProtocoloStatus)) return res.status(409).json({ error: 'Protocolo encerrado.' })
      const r = await prisma.secProtocolo.update({
        where: { id: p.id },
        data: { responsavelId: u.id, tramites: { create: { tenantId, acao: 'ATRIBUICAO', usuarioId: getUserId(req), parecer: `Atribuído a ${u.firstName} ${u.lastName}`, visivelAluno: false } } },
      })
      await prisma.eduReminder.updateMany({ where: { tenantId, dedupeKey: `sec:sla:${p.id}` }, data: { assigneeUserId: u.id } })
      await notify({ tenantId, userId: u.id, assunto: `Protocolo ${p.numero} atribuído a você`, mensagem: `${p.assunto} — prazo ${p.prazoEm.toLocaleDateString('pt-BR')}`, refType: REF, refId: p.id })
      await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'PROTOCOLO_ATRIBUIDO', refType: REF, refId: p.id, detalhes: { responsavelId } })
      res.json(r)
    }),
  )

  router.post(
    '/protocolos/:id/comentarios',
    requireRole(...SEC_GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const b = parseBody(z.object({ texto: z.string().min(1).max(3000), visivelAluno: z.boolean().default(false) }), req.body)
      const p = await prisma.secProtocolo.findFirst({ where: { id: String(req.params.id), tenantId } })
      if (!p) return res.status(404).json({ error: 'Protocolo não encontrado.' })
      const userId = getUserId(req)
      const t = await prisma.secTramite.create({ data: { tenantId, protocoloId: p.id, acao: 'COMENTARIO', usuarioId: userId, usuarioNome: await nomeUsuario(userId), parecer: b.texto, visivelAluno: b.visivelAluno } })
      if (b.visivelAluno && p.studentId) await notify({ tenantId, studentId: p.studentId, assunto: `Protocolo ${p.numero}: nova mensagem`, mensagem: b.texto, refType: REF, refId: p.id })
      res.status(201).json(t)
    }),
  )

  router.post(
    '/protocolos/:id/anexos',
    requireRole(...SEC),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const b = parseBody(anexoSchema, req.body)
      const p = await prisma.secProtocolo.findFirst({ where: { id: String(req.params.id), tenantId }, select: { id: true, status: true } })
      if (!p) return res.status(404).json({ error: 'Protocolo não encontrado.' })
      if (isTerminal(p.status as ProtocoloStatus)) return res.status(409).json({ error: 'Protocolo encerrado.' })
      const a = await prisma.secAnexo.create({ data: { tenantId, protocoloId: p.id, ...b, tamanho: b.dataUrl?.length, enviadoPorId: getUserId(req) }, select: { id: true, nome: true, mime: true, tamanho: true } })
      await prisma.secTramite.create({ data: { tenantId, protocoloId: p.id, acao: 'ANEXO', usuarioId: getUserId(req), parecer: `Anexo adicionado: ${b.nome}`, visivelAluno: true } })
      res.status(201).json(a)
    }),
  )

  router.get(
    '/protocolos/:id/anexos/:anexoId',
    requireRole(...SEC_LEITURA),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const a = await prisma.secAnexo.findFirst({ where: { id: String(req.params.anexoId), protocoloId: String(req.params.id), tenantId } })
      if (!a) return res.status(404).json({ error: 'Anexo não encontrado.' })
      res.json(a)
    }),
  )

  // Isenção de taxa (coordenação/administração).
  router.post(
    '/protocolos/:id/taxa/isentar',
    requireRole(...SEC_GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const { motivo } = parseBody(z.object({ motivo: z.string().min(5).max(500) }), req.body)
      const p = await prisma.secProtocolo.findFirst({ where: { id: String(req.params.id), tenantId } })
      if (!p) return res.status(404).json({ error: 'Protocolo não encontrado.' })
      if (p.taxaStatus !== 'PENDENTE') return res.status(409).json({ error: 'A taxa não está pendente.' })
      if (p.receivableId) await cancelarCobranca(p.receivableId, tenantId, p.id)
      const r = await prisma.secProtocolo.update({ where: { id: p.id }, data: { taxaStatus: 'ISENTA', tramites: { create: { tenantId, acao: 'TAXA', usuarioId: getUserId(req), parecer: `Taxa isenta: ${motivo}` } } } })
      await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'TAXA_ISENTA', refType: REF, refId: p.id, detalhes: { motivo } })
      res.json(r)
    }),
  )

  // ---------- PORTAL DO ALUNO ----------
  const ALUNO = requireRole('STUDENT')

  router.get(
    '/portal/tipos',
    ALUNO,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      res.json(await prisma.secTipoRequerimento.findMany({ where: { tenantId, ativo: true, abertoPeloAluno: true }, orderBy: { nome: 'asc' }, select: { id: true, codigo: true, nome: true, descricao: true, categoria: true, slaDias: true, taxa: true, exigeAnexo: true, camposExtras: true } }))
    }),
  )

  router.get(
    '/portal/protocolos',
    ALUNO,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const studentId = exigirAluno(req)
      const items = await prisma.secProtocolo.findMany({ where: { tenantId, studentId }, include: { tipo: { select: { nome: true } } }, orderBy: { createdAt: 'desc' }, take: 200 })
      res.json(items.map(({ responsavelId, abertoPorId, escalonadoEm, ...p }) => p))
    }),
  )

  router.post(
    '/portal/protocolos',
    ALUNO,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const studentId = exigirAluno(req)
      const b = parseBody(abrirSchema.omit({ studentId: true, canal: true, prioridade: true, solicitanteNome: true }), req.body)
      const tipo = await prisma.secTipoRequerimento.findFirst({ where: { id: b.tipoId, tenantId, ativo: true, abertoPeloAluno: true } })
      if (!tipo) return res.status(404).json({ error: 'Requerimento indisponível no portal.' })
      const proto = await abrirProtocolo({ ...b, tenantId, studentId, abertoPorId: req.user!.id, origem: 'ALUNO', canal: 'PORTAL' })
      res.status(201).json(proto)
    }),
  )

  router.get(
    '/portal/protocolos/:id',
    ALUNO,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const studentId = exigirAluno(req)
      const p = await prisma.secProtocolo.findFirst({
        where: { id: String(req.params.id), tenantId, studentId },
        include: { tipo: { select: { nome: true } }, tramites: { where: { visivelAluno: true }, orderBy: { createdAt: 'asc' }, select: { acao: true, deStatus: true, paraStatus: true, parecer: true, origem: true, createdAt: true } }, anexos: { select: { id: true, nome: true, mime: true, createdAt: true, enviadoPorAluno: true } } },
      })
      if (!p) return res.status(404).json({ error: 'Protocolo não encontrado.' })
      const { responsavelId, abertoPorId, ...pub } = p
      res.json(pub)
    }),
  )

  // Aluno envia documentos/complemento; se estava pendente, volta para análise automaticamente.
  router.post(
    '/portal/protocolos/:id/anexos',
    ALUNO,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const studentId = exigirAluno(req)
      const b = parseBody(z.object({ anexos: z.array(anexoSchema).min(1).max(10), mensagem: z.string().max(2000).optional() }), req.body)
      const p = await prisma.secProtocolo.findFirst({ where: { id: String(req.params.id), tenantId, studentId } })
      if (!p) return res.status(404).json({ error: 'Protocolo não encontrado.' })
      if (isTerminal(p.status as ProtocoloStatus) || p.status === 'INDEFERIDO') return res.status(409).json({ error: 'Protocolo encerrado.' })
      await prisma.secAnexo.createMany({ data: b.anexos.map((a) => ({ tenantId, protocoloId: p.id, ...a, tamanho: a.dataUrl?.length, enviadoPorId: req.user!.id, enviadoPorAluno: true })) })
      await prisma.secTramite.create({ data: { tenantId, protocoloId: p.id, acao: 'ANEXO', usuarioId: req.user!.id, origem: 'ALUNO', parecer: b.mensagem ?? `Aluno enviou ${b.anexos.length} anexo(s).` } })
      if (p.status === 'PENDENTE_DOCUMENTO') {
        await mudarStatusProtocolo({ tenantId, id: p.id, para: 'EM_ANALISE', parecer: 'Documentação reenviada pelo aluno.', origem: 'ALUNO', usuarioId: req.user!.id, visivelAluno: false })
        if (p.responsavelId) await notify({ tenantId, userId: p.responsavelId, assunto: `Protocolo ${p.numero}: documentos reenviados`, mensagem: 'O aluno reenviou a documentação pendente.', refType: REF, refId: p.id })
        else {
          const sec = await prisma.user.findMany({ where: { tenantId, role: 'SECRETARY', isActive: true }, select: { id: true }, take: 20 })
          for (const u of sec) await notify({ tenantId, userId: u.id, assunto: `Protocolo ${p.numero}: documentos reenviados`, mensagem: 'O aluno reenviou a documentação pendente.', refType: REF, refId: p.id })
        }
      }
      res.status(201).json({ ok: true })
    }),
  )

  router.post(
    '/portal/protocolos/:id/cancelar',
    ALUNO,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const studentId = exigirAluno(req)
      const p = await prisma.secProtocolo.findFirst({ where: { id: String(req.params.id), tenantId, studentId } })
      if (!p) return res.status(404).json({ error: 'Protocolo não encontrado.' })
      if (!['ABERTO', 'PENDENTE_DOCUMENTO'].includes(p.status)) return res.status(409).json({ error: 'Só é possível cancelar protocolos ainda não analisados.' })
      const motivo = String(req.body?.motivo ?? 'Cancelado a pedido do aluno.').slice(0, 500)
      res.json(await mudarStatusProtocolo({ tenantId, id: p.id, para: 'CANCELADO', parecer: motivo.length >= 5 ? motivo : 'Cancelado a pedido do aluno.', origem: 'ALUNO', usuarioId: req.user!.id, visivelAluno: false }))
    }),
  )
}
