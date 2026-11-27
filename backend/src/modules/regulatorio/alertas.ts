import { prisma } from '../../lib/prisma'
import { scheduleReminder, cancelReminders } from '../core/reminders'
import { registerEduJob } from '../core/jobs'
import { audit } from '../core/notify'
import { marcosParaAgendar, statusAto, PARAMS_ATO, MARCOS_PADRAO } from './rules'

const MODULO = 'regulatorio'

const NOMES_ATO: Record<string, string> = {
  PORTARIA_CREDENCIAMENTO: 'Portaria de credenciamento',
  PORTARIA_RECREDENCIAMENTO: 'Portaria de recredenciamento',
  PORTARIA_AUTORIZACAO: 'Portaria de autorização',
  PORTARIA_RECONHECIMENTO: 'Portaria de reconhecimento',
  PORTARIA_RENOVACAO: 'Portaria de renovação de reconhecimento',
  PORTARIA_ADITAMENTO: 'Portaria de aditamento',
  RESOLUCAO: 'Resolução',
  PARECER: 'Parecer',
  OUTRO: 'Ato',
}

export const rotuloAto = (a: { tipo: string; numero: string; cursoNome?: string | null }) =>
  `${NOMES_ATO[a.tipo] ?? 'Ato'} nº ${a.numero}${a.cursoNome ? ' — ' + a.cursoNome : ''}`

// Agenda lembretes escalonados (D-180/90/60/30/15/7) de um ato. Idempotente (dedupeKey por marco/papel).
// Não ressuscita lembretes concluídos/cancelados: use limparAlertasAto() antes quando o vencimento mudar.
export async function sincronizarAlertasAto(ato: any, agora = new Date(), marcos: number[] = MARCOS_PADRAO) {
  if (ato.revogado || !ato.vencimento) return { agendados: 0 }
  const venc = new Date(ato.vencimento)
  let agendados = 0
  const rotulo = rotuloAto(ato)
  const papeis = ['RECTOR', ...(ato.escopo === 'CURSO' || ato.programId ? ['COORDINATOR'] : [])]
  for (const m of marcosParaAgendar(venc, agora, marcos)) {
    for (const role of papeis) {
      if (role === 'COORDINATOR' && m.dias > 90) continue // coordenação entra a partir de D-90
      await scheduleReminder({
        tenantId: ato.tenantId,
        modulo: MODULO,
        titulo: `${rotulo} vence em ${m.dias} dias`,
        descricao: `Vencimento em ${venc.toLocaleDateString('pt-BR')}. Abrir/acompanhar o processo de renovação junto ao e-MEC.`,
        dueAt: venc,
        remindAt: m.data,
        severity: m.severity,
        refType: 'RegAto',
        refId: ato.id,
        assigneeRole: role,
        dedupeKey: `reg:ato:${ato.id}:D${m.dias}:${role}`,
      })
      agendados++
    }
  }
  return { agendados }
}

export async function limparAlertasAto(tenantId: string, atoId: string) {
  await prisma.eduReminder.deleteMany({ where: { tenantId, refType: 'RegAto', refId: atoId, status: { in: ['PENDENTE', 'NOTIFICADO', 'ADIADO', 'CANCELADO'] } } })
}

const TIPOS_RENOVACAVEIS = ['PORTARIA_RECONHECIMENTO', 'PORTARIA_RENOVACAO', 'PORTARIA_RECREDENCIAMENTO', 'PORTARIA_CREDENCIAMENTO', 'PORTARIA_AUTORIZACAO']

// Reavalia um ato: lembretes escalonados + lembrete "abrir processo de renovação" se a janela já abriu
// e não existe processo de renovação/recredenciamento em andamento. Retorna a situação.
export async function reavaliarAto(ato: any, agora = new Date()) {
  const st = statusAto(ato.vencimento, agora, PARAMS_ATO)
  if (ato.revogado || !ato.vencimento) return { ...st, alertas: 0, renovacaoSugerida: false }
  const { agendados } = await sincronizarAlertasAto(ato, agora)
  let renovacaoSugerida = false
  if (['RENOVACAO_ABERTA', 'VENCENDO', 'VENCIDO'].includes(st.situacao) && TIPOS_RENOVACAVEIS.includes(ato.tipo)) {
    const tiposProc = ato.escopo === 'INSTITUICAO' ? ['RECREDENCIAMENTO', 'CREDENCIAMENTO'] : ['RENOVACAO_RECONHECIMENTO', 'RECONHECIMENTO_CURSO']
    const aberto = await prisma.regProcesso.findFirst({
      where: {
        tenantId: ato.tenantId,
        tipo: { in: tiposProc as any },
        etapa: { notIn: ['PUBLICADO', 'ARQUIVADO'] },
        ...(ato.programId ? { programId: ato.programId } : {}),
      },
      select: { id: true },
    })
    if (!aberto) {
      renovacaoSugerida = true
      await scheduleReminder({
        tenantId: ato.tenantId,
        modulo: MODULO,
        titulo: `Abrir processo de renovação: ${rotuloAto(ato)}`,
        descricao:
          st.situacao === 'VENCIDO'
            ? 'ATO VENCIDO sem processo de renovação em andamento — risco regulatório crítico.'
            : `Vence em ${st.diasRestantes} dia(s) e não há processo de renovação em andamento.`,
        dueAt: new Date(ato.vencimento),
        remindAt: agora,
        severity: st.situacao === 'RENOVACAO_ABERTA' ? 'ATENCAO' : 'CRITICO',
        refType: 'RegAto',
        refId: ato.id,
        assigneeRole: 'RECTOR',
        recorrenciaDias: st.situacao === 'RENOVACAO_ABERTA' ? 30 : 7,
        dedupeKey: `reg:ato:${ato.id}:abrir-renovacao`,
      })
    }
  }
  return { ...st, alertas: agendados, renovacaoSugerida }
}

// Lembretes de prazos de um processo (prazo de protocolo, avaliação e decisão previstas).
export async function sincronizarPrazosProcesso(p: any, agora = new Date()) {
  if (['PUBLICADO', 'ARQUIVADO'].includes(p.etapa)) return
  const rot = `[${String(p.tipo).replace(/_/g, ' ')}] ${p.titulo}`
  if (p.prazoProtocolo && p.etapa === 'PREPARACAO') {
    for (const m of marcosParaAgendar(new Date(p.prazoProtocolo), agora, [60, 30, 15, 7, 3])) {
      await scheduleReminder({
        tenantId: p.tenantId, modulo: MODULO, titulo: `Prazo para protocolar em ${m.dias} dias: ${rot}`,
        dueAt: new Date(p.prazoProtocolo), remindAt: m.data, severity: m.severity, refType: 'RegProcesso', refId: p.id,
        assigneeUserId: p.responsavelId ?? undefined, assigneeRole: p.responsavelId ? undefined : 'COORDINATOR',
        dedupeKey: `reg:proc:${p.id}:protocolo:D${m.dias}`,
      })
    }
  }
  if (p.avaliacaoPrevistaEm && ['EM_ANALISE', 'AVALIACAO_IN_LOCO', 'PROTOCOLADO'].includes(p.etapa)) {
    await scheduleReminder({
      tenantId: p.tenantId, modulo: MODULO, titulo: `Avaliação in loco prevista: ${rot}`, descricao: 'Preparar a IES, comissão interna e evidências para a visita.',
      dueAt: new Date(p.avaliacaoPrevistaEm), antecedenciaDias: 15, severity: 'ATENCAO', refType: 'RegProcesso', refId: p.id,
      assigneeUserId: p.responsavelId ?? undefined, assigneeRole: p.responsavelId ? undefined : 'RECTOR', dedupeKey: `reg:proc:${p.id}:in-loco`,
    })
  }
  if (p.decisaoPrevistaEm && p.etapa === 'DECISAO') {
    await scheduleReminder({
      tenantId: p.tenantId, modulo: MODULO, titulo: `Decisão do MEC prevista: ${rot}`, dueAt: new Date(p.decisaoPrevistaEm), antecedenciaDias: 7,
      severity: 'INFO', refType: 'RegProcesso', refId: p.id, assigneeRole: 'RECTOR', dedupeKey: `reg:proc:${p.id}:decisao`,
    })
  }
}

// Lembretes escalonados do prazo de resposta de uma diligência (D-7, D-3, D-1 e no dia).
export async function sincronizarAlertasDiligencia(d: any, rotuloProcesso: string, responsavelId?: string | null, agora = new Date()) {
  if (!['ABERTA', 'VENCIDA'].includes(d.status)) return
  for (const m of marcosParaAgendar(new Date(d.prazoResposta), agora, [15, 7, 3, 1])) {
    await scheduleReminder({
      tenantId: d.tenantId, modulo: MODULO, titulo: `Diligência vence em ${m.dias} dia(s): ${rotuloProcesso}`, descricao: d.descricao.slice(0, 300),
      dueAt: new Date(d.prazoResposta), remindAt: m.data, severity: m.dias <= 7 ? 'CRITICO' : 'ATENCAO', refType: 'RegDiligencia', refId: d.id,
      assigneeUserId: responsavelId ?? d.responsavelId ?? undefined, assigneeRole: responsavelId || d.responsavelId ? undefined : 'RECTOR',
      dedupeKey: `reg:dilig:${d.id}:D${m.dias}`,
    })
  }
}

export interface ResultadoJob { atos: number; vencidos: number; vencendo: number; renovacoesSugeridas: number; diligenciasVencidas: number; processosAtrasados: number }

// Job diário: reavalia TODOS os atos com vencimento (todos os tenants), marca diligências vencidas e
// reforça prazos de protocolo.
export async function reavaliarTodos(agora = new Date(), tenantId?: string): Promise<ResultadoJob> {
  const out: ResultadoJob = { atos: 0, vencidos: 0, vencendo: 0, renovacoesSugeridas: 0, diligenciasVencidas: 0, processosAtrasados: 0 }
  const atos = await prisma.regAto.findMany({ where: { revogado: false, vencimento: { not: null }, ...(tenantId ? { tenantId } : {}) }, take: 5000 })
  for (const a of atos) {
    try {
      const r = await reavaliarAto(a, agora)
      out.atos++
      if (r.situacao === 'VENCIDO') out.vencidos++
      if (r.situacao === 'VENCENDO') out.vencendo++
      if (r.renovacaoSugerida) out.renovacoesSugeridas++
    } catch (e) {
      console.error('[regulatorio-job] ato', a.id, e)
    }
  }
  const dil = await prisma.regDiligencia.findMany({ where: { status: 'ABERTA', prazoResposta: { lt: agora }, ...(tenantId ? { tenantId } : {}) }, include: { processo: true }, take: 2000 })
  for (const d of dil) {
    await prisma.regDiligencia.update({ where: { id: d.id }, data: { status: 'VENCIDA' } })
    await scheduleReminder({
      tenantId: d.tenantId, modulo: MODULO, titulo: `DILIGÊNCIA VENCIDA: ${d.processo.titulo}`, descricao: d.descricao.slice(0, 300), dueAt: d.prazoResposta, remindAt: agora,
      severity: 'CRITICO', refType: 'RegDiligencia', refId: d.id, assigneeRole: 'RECTOR', recorrenciaDias: 3, dedupeKey: `reg:dilig:${d.id}:vencida`,
    })
    await audit({ tenantId: d.tenantId, modulo: MODULO, acao: 'DILIGENCIA_VENCIDA', refType: 'RegDiligencia', refId: d.id })
    out.diligenciasVencidas++
  }
  const procs = await prisma.regProcesso.findMany({ where: { etapa: 'PREPARACAO', prazoProtocolo: { not: null }, ...(tenantId ? { tenantId } : {}) }, take: 2000 })
  for (const p of procs) {
    await sincronizarPrazosProcesso(p, agora)
    if (p.prazoProtocolo && p.prazoProtocolo < agora) out.processosAtrasados++
  }
  return out
}

registerEduJob('regulatorio:reavaliar-atos', () => reavaliarTodos())

export { cancelReminders }
