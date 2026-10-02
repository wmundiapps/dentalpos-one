import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { mountCrud, parseBody, dateISO, qs, pageParams } from '../core/crud'
import { audit } from '../core/notify'
import { completeReminders, cancelReminders } from '../core/reminders'
import { transicaoValida, TRANSICOES, Etapa } from './rules'
import { sincronizarPrazosProcesso, sincronizarAlertasDiligencia, sincronizarAlertasAto } from './alertas'
import { MODULO, READ, WRITE, bad } from './common'

const TIPOS = ['CREDENCIAMENTO', 'RECREDENCIAMENTO', 'AUTORIZACAO_CURSO', 'RECONHECIMENTO_CURSO', 'RENOVACAO_RECONHECIMENTO', 'ADITAMENTO_VAGAS', 'ADITAMENTO_ENDERECO', 'ADITAMENTO_POLO_EAD', 'TRANSFERENCIA_MANTENCA', 'OUTRO'] as const
const ETAPAS = ['PREPARACAO', 'PROTOCOLADO', 'EM_ANALISE', 'DILIGENCIA', 'AVALIACAO_IN_LOCO', 'DECISAO', 'PUBLICADO', 'ARQUIVADO'] as const
const TIPO_ATO_POR_PROCESSO: Record<string, string> = {
  CREDENCIAMENTO: 'PORTARIA_CREDENCIAMENTO', RECREDENCIAMENTO: 'PORTARIA_RECREDENCIAMENTO', AUTORIZACAO_CURSO: 'PORTARIA_AUTORIZACAO',
  RECONHECIMENTO_CURSO: 'PORTARIA_RECONHECIMENTO', RENOVACAO_RECONHECIMENTO: 'PORTARIA_RENOVACAO', ADITAMENTO_VAGAS: 'PORTARIA_ADITAMENTO',
  ADITAMENTO_ENDERECO: 'PORTARIA_ADITAMENTO', ADITAMENTO_POLO_EAD: 'PORTARIA_ADITAMENTO', TRANSFERENCIA_MANTENCA: 'PORTARIA_ADITAMENTO', OUTRO: 'OUTRO',
}

const processoBase = z.object({
  tipo: z.enum(TIPOS),
  titulo: z.string().min(3).max(200),
  programId: z.string().optional().nullable(),
  cursoNome: z.string().max(200).optional().nullable(),
  numeroProcesso: z.string().max(60).optional().nullable(),
  responsavelId: z.string().optional().nullable(),
  vagasSolicitadas: z.number().int().positive().optional().nullable(),
  enderecoNovo: z.string().max(300).optional().nullable(),
  prazoProtocolo: dateISO().optional().nullable(),
  avaliacaoPrevistaEm: dateISO().optional().nullable(),
  decisaoPrevistaEm: dateISO().optional().nullable(),
  observacoes: z.string().max(4000).optional().nullable(),
})

const avancarSchema = z.object({
  etapa: z.enum(ETAPAS),
  observacao: z.string().max(2000).optional(),
  protocoloEmec: z.string().min(3).max(60).optional(),
  resultado: z.enum(['DEFERIDO', 'INDEFERIDO']).optional(),
  conceitoObtido: z.number().int().min(1).max(5).optional(),
  avaliacaoPrevistaEm: dateISO().optional(),
  decisaoPrevistaEm: dateISO().optional(),
  publicadoEm: dateISO().optional(),
  // ao publicar um deferimento, já registra o ato (portaria) no repositório
  ato: z
    .object({
      numero: z.string().min(1).max(60),
      dataPublicacao: dateISO(),
      referenciaDou: z.string().max(200).optional(),
      vigenciaInicio: dateISO().optional(),
      vencimento: dateISO().optional(),
      vagasAutorizadas: z.number().int().positive().optional(),
      cicloAvaliativoAnos: z.number().int().positive().max(12).optional(),
      conceito: z.number().int().min(1).max(5).optional(),
    })
    .optional(),
})

async function checarProgram(tenantId: string, programId?: string | null) {
  if (!programId) return
  const p = await prisma.academicProgram.findFirst({ where: { id: programId, tenantId }, select: { id: true } })
  if (!p) throw bad('Curso (programId) não encontrado neste tenant.')
}

export function mountProcessos(router: Router) {
  mountCrud(router, {
    model: 'regProcesso',
    path: '/processos',
    modulo: MODULO,
    read: READ,
    write: WRITE,
    create: processoBase,
    update: processoBase.partial(),
    search: ['titulo', 'protocoloEmec', 'numeroProcesso', 'cursoNome'],
    filters: ['tipo', 'etapa', 'resultado', 'programId', 'responsavelId'],
    orderBy: { updatedAt: 'desc' },
    beforeCreate: async (data, req) => {
      await checarProgram(getTenantId(req), data.programId)
      return data
    },
    beforeUpdate: async (data, req) => {
      await checarProgram(getTenantId(req), data.programId)
      return data
    },
    afterCreate: async (row) => sincronizarPrazosProcesso(row),
    afterUpdate: async (row) => sincronizarPrazosProcesso(row),
  })

  // Detalhe completo
  router.get(
    '/processos/:id/detalhe',
    requireRole(...READ, ...WRITE),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const p = await prisma.regProcesso.findFirst({
        where: { id: String(req.params.id), tenantId },
        include: { historico: { orderBy: { createdAt: 'asc' } }, diligencias: { orderBy: { prazoResposta: 'asc' } }, checklists: { select: { id: true, nome: true, prontidao: true, instrumento: true } } },
      })
      if (!p) return res.status(404).json({ error: 'Processo não encontrado.' })
      res.json({ ...p, proximasEtapas: TRANSICOES[p.etapa as Etapa] })
    }),
  )

  // Máquina de estados do processo e-MEC
  router.post(
    '/processos/:id/avancar',
    requireRole(...WRITE),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const userId = getUserId(req)
      const b = parseBody(avancarSchema, req.body)
      const p = await prisma.regProcesso.findFirst({ where: { id: String(req.params.id), tenantId } })
      if (!p) return res.status(404).json({ error: 'Processo não encontrado.' })
      const de = p.etapa as Etapa
      const para = b.etapa as Etapa
      if (!transicaoValida(de, para)) throw bad(`Transição inválida: ${de} → ${para}. Permitidas a partir de ${de}: ${TRANSICOES[de].join(', ') || 'nenhuma (etapa final)'}.`, 409)

      const patch: any = { etapa: para }
      if (b.avaliacaoPrevistaEm) patch.avaliacaoPrevistaEm = b.avaliacaoPrevistaEm
      if (b.decisaoPrevistaEm) patch.decisaoPrevistaEm = b.decisaoPrevistaEm

      if (para === 'PROTOCOLADO') {
        const prot = b.protocoloEmec || p.protocoloEmec
        if (!prot) throw bad('Informe o número de protocolo do e-MEC (protocoloEmec) para protocolar.')
        patch.protocoloEmec = prot
        patch.protocoladoEm = new Date()
        // prontidão mínima: itens obrigatórios do checklist
        const itens = await prisma.regChecklistItem.count({ where: { tenantId, checklist: { processoId: p.id }, obrigatorio: true, status: { in: ['PENDENTE', 'EM_ANDAMENTO'] } } })
        if (itens > 0 && !(req.body as any)?.forcar) throw bad(`Há ${itens} requisito(s) obrigatório(s) do checklist ainda pendentes. Conclua-os ou envie "forcar": true para protocolar assim mesmo.`, 409)
      }
      if (de === 'DILIGENCIA' || para === 'DILIGENCIA') {
        const abertas = await prisma.regDiligencia.count({ where: { tenantId, processoId: p.id, status: { in: ['ABERTA', 'VENCIDA'] } } })
        if (para === 'DILIGENCIA' && abertas === 0) throw bad('Para entrar em DILIGENCIA registre a diligência (POST /processos/:id/diligencias).')
        if (de === 'DILIGENCIA' && para !== 'ARQUIVADO' && abertas > 0) throw bad(`Há ${abertas} diligência(s) sem resposta. Responda-as antes de sair desta etapa.`, 409)
      }
      if (para === 'PUBLICADO') {
        if (!b.resultado) throw bad('Informe o resultado (DEFERIDO ou INDEFERIDO) ao publicar.')
        patch.resultado = b.resultado
        patch.publicadoEm = b.publicadoEm ?? new Date()
        if (b.conceitoObtido) patch.conceitoObtido = b.conceitoObtido
        if (b.resultado === 'INDEFERIDO' && !b.observacao) throw bad('Indeferimento exige observação (motivo/recurso cabível).')
      }
      if (para === 'ARQUIVADO') patch.resultado = 'ARQUIVADO'

      const novo = await prisma.regProcesso.update({ where: { id: p.id }, data: patch })
      await prisma.regProcessoHistorico.create({ data: { tenantId, processoId: p.id, etapaDe: de, etapaPara: para, userId, observacao: b.observacao } })
      await audit({ tenantId, userId, modulo: MODULO, acao: `ETAPA_${para}`, refType: 'RegProcesso', refId: p.id, detalhes: { de, para } })

      let ato: any = null
      if (para === 'PROTOCOLADO') await completeReminders({ tenantId, refType: 'RegProcesso', refId: p.id, userId })
      if (['PUBLICADO', 'ARQUIVADO'].includes(para)) await cancelReminders({ tenantId, refType: 'RegProcesso', refId: p.id })
      else await sincronizarPrazosProcesso(novo)

      if (para === 'PUBLICADO' && b.resultado === 'DEFERIDO' && b.ato) {
        ato = await prisma.regAto.create({
          data: {
            tenantId, tipo: TIPO_ATO_POR_PROCESSO[p.tipo] as any, numero: b.ato.numero, dataPublicacao: b.ato.dataPublicacao, referenciaDou: b.ato.referenciaDou,
            programId: p.programId, cursoNome: p.cursoNome, escopo: ['CREDENCIAMENTO', 'RECREDENCIAMENTO', 'TRANSFERENCIA_MANTENCA'].includes(p.tipo) ? 'INSTITUICAO' : 'CURSO',
            processoId: p.id, vigenciaInicio: b.ato.vigenciaInicio ?? b.ato.dataPublicacao, vencimento: b.ato.vencimento, vagasAutorizadas: b.ato.vagasAutorizadas ?? p.vagasSolicitadas,
            cicloAvaliativoAnos: b.ato.cicloAvaliativoAnos, conceito: b.ato.conceito ?? b.conceitoObtido,
          },
        })
        await sincronizarAlertasAto(ato)
        await audit({ tenantId, userId, modulo: MODULO, acao: 'ATO_REGISTRADO', refType: 'RegAto', refId: ato.id })
      }
      res.json({ processo: novo, ato })
    }),
  )

  // ---------- Diligências ----------
  const dilSchema = z.object({
    descricao: z.string().min(5).max(6000),
    exigencias: z.array(z.object({ texto: z.string().min(2), atendida: z.boolean().optional() })).optional(),
    recebidaEm: dateISO().optional(),
    prazoResposta: dateISO(),
    responsavelId: z.string().optional(),
  })

  router.post(
    '/processos/:id/diligencias',
    requireRole(...WRITE),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const userId = getUserId(req)
      const b = parseBody(dilSchema, req.body)
      const p = await prisma.regProcesso.findFirst({ where: { id: String(req.params.id), tenantId } })
      if (!p) return res.status(404).json({ error: 'Processo não encontrado.' })
      if (['PUBLICADO', 'ARQUIVADO', 'PREPARACAO'].includes(p.etapa)) throw bad('Só é possível registrar diligência em processo protocolado e em andamento.', 409)
      if (b.prazoResposta.getTime() < Date.now() - 86_400_000) throw bad('Prazo de resposta no passado.')
      const d = await prisma.regDiligencia.create({ data: { tenantId, processoId: p.id, ...b } })
      if (p.etapa !== 'DILIGENCIA') {
        await prisma.regProcesso.update({ where: { id: p.id }, data: { etapa: 'DILIGENCIA' } })
        await prisma.regProcessoHistorico.create({ data: { tenantId, processoId: p.id, etapaDe: p.etapa, etapaPara: 'DILIGENCIA', userId, observacao: 'Diligência registrada' } })
      }
      await sincronizarAlertasDiligencia(d, p.titulo, b.responsavelId ?? p.responsavelId)
      await audit({ tenantId, userId, modulo: MODULO, acao: 'DILIGENCIA_CRIADA', refType: 'RegDiligencia', refId: d.id })
      res.status(201).json(d)
    }),
  )

  router.get(
    '/diligencias',
    requireRole(...READ, ...WRITE),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const { skip, take, page, pageSize } = pageParams(req.query)
      const where: any = { tenantId }
      const st = qs(req.query.status)
      if (st) where.status = st
      const pid = qs(req.query.processoId)
      if (pid) where.processoId = pid
      const [items, total] = await Promise.all([
        prisma.regDiligencia.findMany({ where, include: { processo: { select: { id: true, titulo: true, tipo: true } } }, orderBy: { prazoResposta: 'asc' }, skip, take }),
        prisma.regDiligencia.count({ where }),
      ])
      const agora = Date.now()
      res.json({ items: items.map((d) => ({ ...d, diasParaPrazo: Math.ceil((d.prazoResposta.getTime() - agora) / 86_400_000) })), total, page, pageSize })
    }),
  )

  const finaliza = (status: 'RESPONDIDA' | 'CUMPRIDA' | 'CANCELADA') =>
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const userId = getUserId(req)
      const b = parseBody(z.object({ resposta: z.string().max(8000).optional(), exigencias: z.array(z.object({ texto: z.string(), atendida: z.boolean().optional() })).optional() }), req.body ?? {})
      const d = await prisma.regDiligencia.findFirst({ where: { id: String(req.params.id), tenantId } })
      if (!d) return res.status(404).json({ error: 'Diligência não encontrada.' })
      if (status === 'RESPONDIDA' && !['ABERTA', 'VENCIDA'].includes(d.status)) throw bad(`Diligência já está ${d.status}.`, 409)
      if (status === 'RESPONDIDA' && !b.resposta) throw bad('Informe o texto da resposta.')
      if (status === 'CUMPRIDA' && d.status !== 'RESPONDIDA') throw bad('Só se marca como cumprida uma diligência já respondida.', 409)
      const novo = await prisma.regDiligencia.update({
        where: { id: d.id },
        data: { status, ...(b.resposta ? { resposta: b.resposta } : {}), ...(b.exigencias ? { exigencias: b.exigencias as any } : {}), ...(status === 'RESPONDIDA' ? { respondidaEm: new Date() } : {}) },
      })
      await completeReminders({ tenantId, refType: 'RegDiligencia', refId: d.id, userId })
      await audit({ tenantId, userId, modulo: MODULO, acao: `DILIGENCIA_${status}`, refType: 'RegDiligencia', refId: d.id })
      res.json(novo)
    })
  router.post('/diligencias/:id/responder', requireRole(...WRITE), finaliza('RESPONDIDA'))
  router.post('/diligencias/:id/cumprir', requireRole(...WRITE), finaliza('CUMPRIDA'))
  router.post('/diligencias/:id/cancelar', requireRole(...WRITE), finaliza('CANCELADA'))
}
