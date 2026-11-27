import { Response, Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler } from '../academico/middleware'
import { pageParams, parseBody, qs } from '../core/crud'
import { completeReminders, scheduleReminder } from '../core/reminders'
import { exigirGestorLgpd, httpError, MODULO, proximoSeq, tid, trilha, uid } from './base'
import { PRAZO_INCIDENTE_DIAS_UTEIS, addDiasUteis, estadoPrazo } from './prazos'

// ============================================================
// 5) Incidentes de segurança (LGPD art. 48; Resolução CD/ANPD nº 15/2024):
//    comunicação à ANPD e aos titulares em até 3 DIAS ÚTEIS contados do conhecimento, quando houver risco ou dano relevante.
// ============================================================

export const CHECKLIST_PADRAO: Array<{ codigo: string; texto: string; obrigatorio: boolean }> = [
  { codigo: 'CONTER', texto: 'Conter o incidente (isolar sistemas/contas, revogar credenciais e chaves expostas)', obrigatorio: true },
  { codigo: 'EVIDENCIAS', texto: 'Preservar evidências (logs, imagens de disco, e-mails) mantendo a cadeia de custódia', obrigatorio: true },
  { codigo: 'DPO', texto: 'Acionar o encarregado (DPO) e a direção da instituição', obrigatorio: true },
  { codigo: 'AVALIAR_ESCOPO', texto: 'Levantar categorias de dados, volume e titulares afetados (inclusive menores e dados sensíveis)', obrigatorio: true },
  { codigo: 'AVALIAR_RISCO', texto: 'Avaliar se há risco ou dano relevante aos titulares e registrar a decisão e a justificativa', obrigatorio: true },
  { codigo: 'OPERADORES', texto: 'Notificar operadores/suboperadores envolvidos conforme o contrato (DPA)', obrigatorio: false },
  { codigo: 'ANPD', texto: 'Comunicar a ANPD em até 3 dias úteis (se risco ou dano relevante) e registrar o protocolo', obrigatorio: false },
  { codigo: 'TITULARES', texto: 'Comunicar os titulares afetados em linguagem simples, em até 3 dias úteis (se risco ou dano relevante)', obrigatorio: false },
  { codigo: 'CAUSA_RAIZ', texto: 'Analisar a causa raiz e definir plano de ação corretivo com prazos e responsáveis', obrigatorio: true },
  { codigo: 'REGISTRO', texto: 'Manter o registro do incidente por no mínimo 5 anos', obrigatorio: true },
  { codigo: 'REVISAO', texto: 'Revisar o inventário (ROPA), o RIPD e treinar a equipe com as lições aprendidas', obrigatorio: false },
]

interface ItemChecklist { codigo: string; texto: string; obrigatorio: boolean; feito: boolean; feitoEm: string | null; feitoPor: string | null; observacao: string | null }
const novoChecklist = (): ItemChecklist[] => CHECKLIST_PADRAO.map((i) => ({ ...i, feito: false, feitoEm: null, feitoPor: null, observacao: null }))

const SEV = ['BAIXA', 'MEDIA', 'ALTA', 'CRITICA'] as const

const criarSchema = z.object({
  titulo: z.string().min(5).max(200), descricao: z.string().min(10).max(8000),
  severidade: z.enum(SEV).default('MEDIA'),
  ocorridoEm: z.string().max(40).optional(), ciencia: z.string().max(40).optional(),
  categoriasDados: z.array(z.string().max(80)).max(30).default([]),
  dadosSensiveis: z.boolean().default(false), envolveMenores: z.boolean().default(false),
  titularesAfetados: z.number().int().min(0).max(100_000_000).optional(),
  riscoRelevante: z.boolean().default(false),
  medidasContencao: z.string().max(4000).optional(),
})

function visao(i: any) {
  const comunicado = !!i.comunicadoAnpdEm && !!i.comunicadoTitularesEm
  const finalizado = i.status === 'ENCERRADO' || (i.riscoRelevante && comunicado)
  const p = estadoPrazo(i.ciencia, i.prazoComunicacaoEm, !finalizado)
  const cl: ItemChecklist[] = Array.isArray(i.checklist) ? i.checklist : []
  return {
    ...i,
    comunicacaoObrigatoria: i.riscoRelevante,
    prazoEstado: p.estado, diasRestantes: p.diasRestantes,
    pendenciaAnpd: i.riscoRelevante && !i.comunicadoAnpdEm, pendenciaTitulares: i.riscoRelevante && !i.comunicadoTitularesEm,
    checklistProgresso: { feitos: cl.filter((c) => c.feito).length, total: cl.length, obrigatoriosPendentes: cl.filter((c) => c.obrigatorio && !c.feito).length },
  }
}

async function evento(tenantId: string, incidenteId: string, tipo: string, descricao: string, userId?: string, ocorridoEm?: Date) {
  return prisma.lgpIncidenteEvento.create({ data: { tenantId, incidenteId, tipo, descricao: descricao.slice(0, 3000), userId, ocorridoEm: ocorridoEm ?? new Date() } })
}

async function agendarAlerta(i: { id: string; tenantId: string; numero: string; severidade: string; prazoComunicacaoEm: Date }) {
  const dpo = await prisma.lgpDpo.findFirst({ where: { tenantId: i.tenantId, ativo: true } })
  await scheduleReminder({
    tenantId: i.tenantId, modulo: MODULO, titulo: `LGPD: prazo de comunicação do incidente ${i.numero} (3 dias úteis)`, dueAt: i.prazoComunicacaoEm, remindAt: new Date(), assigneeUserId: dpo?.userId ?? undefined, assigneeRole: dpo?.userId ? undefined : 'ADMIN',
    refType: 'LgpIncidente', refId: i.id, severity: i.severidade === 'CRITICA' || i.severidade === 'ALTA' ? 'CRITICO' : 'ATENCAO', dedupeKey: `lgpd-inc-${i.id}`,
  })
}

async function carregar(req: AuthenticatedRequest) {
  const i = await prisma.lgpIncidente.findFirst({ where: { id: String(req.params.id), tenantId: tid(req) } })
  if (!i) throw httpError(404, 'Incidente não encontrado.')
  return i
}

const parseData = (s: string | undefined, nome: string) => { if (!s) return undefined; const d = new Date(s); if (isNaN(d.getTime())) throw httpError(400, `${nome}: data inválida.`); return d }

export function mountIncidentes(router: Router) {
  router.get('/incidentes', exigirGestorLgpd, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    for (const f of ['status', 'severidade']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    const [items, total] = await Promise.all([prisma.lgpIncidente.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }), prisma.lgpIncidente.count({ where })])
    res.json({ items: items.map(visao), total, page, pageSize })
  }))

  router.post('/incidentes', exigirGestorLgpd, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(criarSchema, req.body)
    const ciencia = parseData(b.ciencia, 'ciência') ?? new Date()
    const ano = new Date().getFullYear()
    const numero = `INC-${ano}-${String(await proximoSeq(tenantId, `INC-${ano}`)).padStart(3, '0')}`
    const prazoComunicacaoEm = addDiasUteis(ciencia, PRAZO_INCIDENTE_DIAS_UTEIS)
    const i = await prisma.lgpIncidente.create({
      data: {
        tenantId, numero, titulo: b.titulo, descricao: b.descricao, severidade: b.severidade, ocorridoEm: parseData(b.ocorridoEm, 'ocorrência'), ciencia, categoriasDados: b.categoriasDados,
        dadosSensiveis: b.dadosSensiveis, envolveMenores: b.envolveMenores, titularesAfetados: b.titularesAfetados, riscoRelevante: b.riscoRelevante || b.severidade === 'CRITICA',
        medidasContencao: b.medidasContencao, prazoComunicacaoEm, checklist: novoChecklist() as any, responsavelId: uid(req),
      },
    })
    await evento(tenantId, i.id, 'DETECCAO', `Incidente registrado: ${b.titulo}`, uid(req), ciencia)
    await trilha({ tenantId, refType: 'Incidente', refId: i.id, acao: 'ABERTO', userId: uid(req), ator: 'EQUIPE', detalhe: { numero, severidade: b.severidade, prazoComunicacaoEm } })
    await agendarAlerta(i)
    res.status(201).json(visao(i))
  }))

  router.get('/incidentes/:id', exigirGestorLgpd, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const i = await carregar(req)
    const eventos = await prisma.lgpIncidenteEvento.findMany({ where: { incidenteId: i.id }, orderBy: { ocorridoEm: 'asc' } })
    res.json({ ...visao(i), eventos })
  }))

  router.put('/incidentes/:id', exigirGestorLgpd, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const i = await carregar(req)
    if (i.status === 'ENCERRADO') throw httpError(409, 'Incidente encerrado.')
    const b = parseBody(criarSchema.partial().extend({ causa: z.string().max(4000).optional(), medidasCorretivas: z.string().max(4000).optional() }), req.body)
    const { ocorridoEm, ciencia, ...resto } = b
    const data: any = { ...resto }
    if (ocorridoEm) data.ocorridoEm = parseData(ocorridoEm, 'ocorrência')
    if (ciencia) { data.ciencia = parseData(ciencia, 'ciência'); data.prazoComunicacaoEm = addDiasUteis(data.ciencia, PRAZO_INCIDENTE_DIAS_UTEIS) }
    if (b.severidade === 'CRITICA') data.riscoRelevante = true
    const r = await prisma.lgpIncidente.update({ where: { id: i.id }, data })
    if (b.riscoRelevante !== undefined && b.riscoRelevante !== i.riscoRelevante) await evento(i.tenantId, i.id, 'AVALIACAO', `Avaliação de risco alterada: risco/dano relevante = ${b.riscoRelevante ? 'SIM (comunicação obrigatória)' : 'NÃO (documentar a justificativa)'}`, uid(req))
    await trilha({ tenantId: i.tenantId, refType: 'Incidente', refId: i.id, acao: 'ATUALIZADO', userId: uid(req), ator: 'EQUIPE', detalhe: { campos: Object.keys(b) } })
    res.json(visao(r))
  }))

  router.post('/incidentes/:id/eventos', exigirGestorLgpd, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const i = await carregar(req)
    const b = parseBody(z.object({ tipo: z.enum(['CONTENCAO', 'AVALIACAO', 'NOTA']).default('NOTA'), descricao: z.string().min(3).max(3000), ocorridoEm: z.string().max(40).optional() }), req.body)
    const e = await evento(i.tenantId, i.id, b.tipo, b.descricao, uid(req), parseData(b.ocorridoEm, 'data'))
    if (b.tipo === 'CONTENCAO' && i.status === 'ABERTO') await prisma.lgpIncidente.update({ where: { id: i.id }, data: { status: 'EM_CONTENCAO' } })
    if (b.tipo === 'AVALIACAO' && ['ABERTO', 'EM_CONTENCAO'].includes(i.status)) await prisma.lgpIncidente.update({ where: { id: i.id }, data: { status: 'EM_AVALIACAO' } })
    res.status(201).json(e)
  }))

  router.post('/incidentes/:id/checklist/:codigo', exigirGestorLgpd, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const i = await carregar(req)
    const b = parseBody(z.object({ feito: z.boolean(), observacao: z.string().max(1000).optional() }), req.body)
    const cl: ItemChecklist[] = Array.isArray(i.checklist) ? (i.checklist as any) : novoChecklist()
    const it = cl.find((c) => c.codigo === String(req.params.codigo))
    if (!it) throw httpError(404, 'Item do checklist não encontrado.')
    it.feito = b.feito; it.feitoEm = b.feito ? new Date().toISOString() : null; it.feitoPor = b.feito ? uid(req) : null; it.observacao = b.observacao ?? it.observacao
    const r = await prisma.lgpIncidente.update({ where: { id: i.id }, data: { checklist: cl as any } })
    await evento(i.tenantId, i.id, 'CHECKLIST', `${b.feito ? 'Concluído' : 'Reaberto'}: ${it.texto}`, uid(req))
    res.json(visao(r))
  }))

  router.post('/incidentes/:id/comunicar-anpd', exigirGestorLgpd, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const i = await carregar(req)
    const b = parseBody(z.object({ protocolo: z.string().min(3).max(80), em: z.string().max(40).optional() }), req.body)
    const em = parseData(b.em, 'data') ?? new Date()
    const r = await prisma.lgpIncidente.update({ where: { id: i.id }, data: { comunicadoAnpdEm: em, anpdProtocolo: b.protocolo, riscoRelevante: true, status: 'COMUNICADO' } })
    await evento(i.tenantId, i.id, 'COMUNICACAO_ANPD', `Comunicação à ANPD registrada (protocolo ${b.protocolo})${em > i.prazoComunicacaoEm ? ' - FORA do prazo de 3 dias úteis' : ''}`, uid(req), em)
    await trilha({ tenantId: i.tenantId, refType: 'Incidente', refId: i.id, acao: 'COMUNICADO_ANPD', userId: uid(req), ator: 'EQUIPE', detalhe: { protocolo: b.protocolo, foraDoPrazo: em > i.prazoComunicacaoEm } })
    if (r.comunicadoTitularesEm) await completeReminders({ tenantId: i.tenantId, refType: 'LgpIncidente', refId: i.id }).catch(() => undefined)
    res.json(visao(r))
  }))

  router.post('/incidentes/:id/comunicar-titulares', exigirGestorLgpd, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const i = await carregar(req)
    const b = parseBody(z.object({ meio: z.string().min(3).max(200), em: z.string().max(40).optional(), titularesNotificados: z.number().int().min(0).optional() }), req.body)
    const em = parseData(b.em, 'data') ?? new Date()
    const r = await prisma.lgpIncidente.update({ where: { id: i.id }, data: { comunicadoTitularesEm: em, meioComunicacaoTitulares: b.meio, riscoRelevante: true, status: i.comunicadoAnpdEm ? 'COMUNICADO' : i.status } })
    await evento(i.tenantId, i.id, 'COMUNICACAO_TITULARES', `Titulares comunicados via ${b.meio}${b.titularesNotificados != null ? ` (${b.titularesNotificados} titulares)` : ''}${em > i.prazoComunicacaoEm ? ' - FORA do prazo de 3 dias úteis' : ''}`, uid(req), em)
    await trilha({ tenantId: i.tenantId, refType: 'Incidente', refId: i.id, acao: 'COMUNICADO_TITULARES', userId: uid(req), ator: 'EQUIPE', detalhe: { meio: b.meio } })
    if (r.comunicadoAnpdEm) await completeReminders({ tenantId: i.tenantId, refType: 'LgpIncidente', refId: i.id }).catch(() => undefined)
    res.json(visao(r))
  }))

  router.post('/incidentes/:id/encerrar', exigirGestorLgpd, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const i = await carregar(req)
    if (i.status === 'ENCERRADO') throw httpError(409, 'Incidente já encerrado.')
    const b = parseBody(z.object({ causa: z.string().min(10).max(4000), medidasCorretivas: z.string().min(10).max(4000), justificativaSemComunicacao: z.string().max(2000).optional() }), req.body)
    const cl: ItemChecklist[] = Array.isArray(i.checklist) ? (i.checklist as any) : []
    const pend = cl.filter((c) => c.obrigatorio && !c.feito).map((c) => c.texto)
    if (pend.length) throw Object.assign(httpError(422, 'Há itens obrigatórios do checklist pendentes.'), { pendencias: pend })
    if (i.riscoRelevante && (!i.comunicadoAnpdEm || !i.comunicadoTitularesEm)) throw httpError(422, 'Risco/dano relevante: comunique a ANPD e os titulares antes de encerrar (ou reavalie o risco e documente a justificativa).')
    if (!i.riscoRelevante && (!b.justificativaSemComunicacao || b.justificativaSemComunicacao.length < 20)) throw httpError(422, 'Sem comunicação à ANPD/titulares: registre a justificativa da avaliação de que não há risco ou dano relevante.')
    const r = await prisma.lgpIncidente.update({ where: { id: i.id }, data: { status: 'ENCERRADO', encerradoEm: new Date(), causa: b.causa, medidasCorretivas: b.medidasCorretivas } })
    await evento(i.tenantId, i.id, 'ENCERRAMENTO', `Incidente encerrado.${b.justificativaSemComunicacao ? ' Justificativa de não comunicação: ' + b.justificativaSemComunicacao : ''}`, uid(req))
    await trilha({ tenantId: i.tenantId, refType: 'Incidente', refId: i.id, acao: 'ENCERRADO', userId: uid(req), ator: 'EQUIPE' })
    await completeReminders({ tenantId: i.tenantId, refType: 'LgpIncidente', refId: i.id }).catch(() => undefined)
    res.json(visao(r))
  }))
}

/** Job: alerta (lembrete CRÍTICO) de incidentes com comunicação pendente que passaram do prazo. */
export async function jobIncidentes() {
  const abertos = await prisma.lgpIncidente.findMany({ where: { status: { not: 'ENCERRADO' }, riscoRelevante: true, OR: [{ comunicadoAnpdEm: null }, { comunicadoTitularesEm: null }] } })
  let alertas = 0
  for (const i of abertos) {
    const p = estadoPrazo(i.ciencia, i.prazoComunicacaoEm, true)
    if (p.estado === 'VENCIDA' || p.estado === 'VENCENDO') {
      await scheduleReminder({ tenantId: i.tenantId, modulo: MODULO, titulo: `${p.estado === 'VENCIDA' ? 'PRAZO VENCIDO' : 'Prazo vencendo'}: comunicar incidente ${i.numero} à ANPD e aos titulares`, dueAt: i.prazoComunicacaoEm, remindAt: new Date(), assigneeRole: 'ADMIN', refType: 'LgpIncidente', refId: i.id, severity: 'CRITICO', dedupeKey: `lgpd-inc-${i.id}` })
      alertas++
    }
  }
  return { pendentes: abertos.length, alertas }
}
