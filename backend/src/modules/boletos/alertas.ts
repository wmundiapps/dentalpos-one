import { prisma } from '../../lib/prisma'
import { cancelReminders, completeReminders, scheduleReminder } from '../core/reminders'
import { notify } from '../core/notify'

// Avisos da Caixa de boletos. Mensagens MÍNIMAS (LGPD): número interno, situação e quantidade de motivos; sem CNPJ/CPF, sem linha
// digitável, sem valores. Perfis: financeiro e diretoria (RECTOR/BOARD), via core/notify + core/reminders (lembrete escalonado).

const FINANCEIRO = ['FINANCE']
const DIRETORIA = ['RECTOR', 'BOARD']
const DIA = 86_400_000

async function destinatarios(tenantId: string, papeis: string[]) {
  return prisma.user.findMany({ where: { tenantId, role: { in: papeis as any[] }, isActive: true }, select: { id: true }, take: 100 })
}

export async function alertarBoletoRisco(p: { tenantId: string; boletoId: string; numero: string; resultado: 'SUSPEITO' | 'DUPLICADO'; motivos: number }) {
  const rotulo = p.resultado === 'SUSPEITO' ? 'suspeito' : 'duplicado'
  const assunto = `Boleto ${rotulo} na Caixa de boletos`
  const mensagem = `O boleto ${p.numero} foi marcado como ${rotulo.toUpperCase()} no check-up interno (${p.motivos} motivo(s)). Não autorize antes de conferir; detalhes na Caixa de boletos.`
  const dest = [...(await destinatarios(p.tenantId, [...FINANCEIRO, ...DIRETORIA]))]
  for (const u of dest) await notify({ tenantId: p.tenantId, userId: u.id, assunto, mensagem, refType: 'BolBoleto', refId: p.boletoId, templateKey: 'boletos.risco' })
  if (!dest.length) await notify({ tenantId: p.tenantId, assunto, mensagem, refType: 'BolBoleto', refId: p.boletoId, templateKey: 'boletos.risco' })
  const agora = Date.now()
  // financeiro: aviso agora, vence em 1 dia; diretoria: só é avisada se o financeiro não tratar (lembrete em 1 dia, prazo em 2) => escalonamento
  await scheduleReminder({ tenantId: p.tenantId, modulo: 'boletos', titulo: `Tratar boleto ${rotulo} ${p.numero}`, descricao: 'Conferir na Caixa de boletos e autorizar, devolver ou refutar.', dueAt: new Date(agora + DIA), remindAt: new Date(agora), severity: 'ATENCAO', assigneeRole: 'FINANCE', refType: 'BolBoleto', refId: p.boletoId, dedupeKey: `bol:${p.boletoId}:fin` })
  await scheduleReminder({ tenantId: p.tenantId, modulo: 'boletos', titulo: `Boleto ${rotulo} sem tratamento: ${p.numero}`, descricao: 'Escalonado à diretoria porque o financeiro ainda não decidiu.', dueAt: new Date(agora + 2 * DIA), remindAt: new Date(agora + DIA), severity: p.resultado === 'SUSPEITO' ? 'CRITICO' : 'ATENCAO', assigneeRole: 'RECTOR', refType: 'BolBoleto', refId: p.boletoId, dedupeKey: `bol:${p.boletoId}:dir` })
}

/** Encerra os lembretes de um boleto já decidido. */
export const encerrarAvisosBoleto = (tenantId: string, boletoId: string, userId?: string) => completeReminders({ tenantId, refType: 'BolBoleto', refId: boletoId, userId })
export const cancelarAvisosBoleto = (tenantId: string, boletoId: string) => cancelReminders({ tenantId, refType: 'BolBoleto', refId: boletoId })

export async function alertarRecorrenciaNaoLancada(p: { tenantId: string; esperadoId: string; fornecedor: string; dataEsperada: Date }) {
  const assunto = 'Conta recorrente não lançada'
  const mensagem = `A conta recorrente de "${p.fornecedor}" esperada para ${p.dataEsperada.toLocaleDateString('pt-BR')} ainda não foi lançada. Veja a planilha do dia na Caixa de boletos.`
  const dest = await destinatarios(p.tenantId, FINANCEIRO)
  for (const u of dest) await notify({ tenantId: p.tenantId, userId: u.id, assunto, mensagem, refType: 'BolEsperado', refId: p.esperadoId, templateKey: 'boletos.recorrencia' })
  if (!dest.length) await notify({ tenantId: p.tenantId, assunto, mensagem, refType: 'BolEsperado', refId: p.esperadoId, templateKey: 'boletos.recorrencia' })
  const agora = Date.now()
  await scheduleReminder({ tenantId: p.tenantId, modulo: 'boletos', titulo: `Conta recorrente não lançada: ${p.fornecedor}`, dueAt: new Date(agora + DIA), remindAt: new Date(agora), severity: 'ATENCAO', assigneeRole: 'FINANCE', refType: 'BolEsperado', refId: p.esperadoId, dedupeKey: `bol:rec:${p.esperadoId}:fin` })
  await scheduleReminder({ tenantId: p.tenantId, modulo: 'boletos', titulo: `Conta recorrente ainda não lançada: ${p.fornecedor}`, dueAt: new Date(agora + 3 * DIA), remindAt: new Date(agora + 2 * DIA), severity: 'CRITICO', assigneeRole: 'RECTOR', refType: 'BolEsperado', refId: p.esperadoId, dedupeKey: `bol:rec:${p.esperadoId}:dir` })
}

export const encerrarAvisosRecorrencia = (tenantId: string, esperadoId: string, userId?: string) => completeReminders({ tenantId, refType: 'BolEsperado', refId: esperadoId, userId })
