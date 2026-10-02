import { prisma } from '../../lib/prisma'
import { registerEduJob } from '../core/jobs'
import { notify } from '../core/notify'
import { reclassificarArquivo } from './arquivo'
import { reavaliarFormandos } from './diplomas'
import { DAY } from './logic'
import { mudarStatusProtocolo, sincronizarTaxa } from './protocolos'

// Jobs periódicos da secretaria (executados por /api/cron/edu).

export async function jobProtocolos(now = new Date()) {
  let escalonados = 0
  let cancelados = 0
  let taxas = 0
  // 1) SLA vencido => escalonamento (marca, tramita e avisa coordenação + responsável)
  const vencidos = await prisma.secProtocolo.findMany({ where: { status: { in: ['ABERTO', 'EM_ANALISE'] }, prazoEm: { lt: now }, escalonadoEm: null }, include: { tipo: { select: { nome: true } } }, take: 500 })
  for (const p of vencidos) {
    await prisma.secProtocolo.update({ where: { id: p.id }, data: { escalonadoEm: now, prioridade: p.prioridade === 'URGENTE' ? 'URGENTE' : 'ALTA', tramites: { create: { tenantId: p.tenantId, acao: 'ESCALONAMENTO', origem: 'SISTEMA', parecer: 'Prazo (SLA) vencido — escalonado à coordenação.', visivelAluno: false } } } })
    const destinos = await prisma.user.findMany({ where: { tenantId: p.tenantId, isActive: true, role: 'COORDINATOR' }, select: { id: true }, take: 50 })
    const ids = new Set(destinos.map((d) => d.id))
    if (p.responsavelId) ids.add(p.responsavelId)
    for (const userId of ids) await notify({ tenantId: p.tenantId, userId, assunto: `SLA vencido: protocolo ${p.numero}`, mensagem: `${p.tipo.nome} — ${p.assunto} está atrasado desde ${p.prazoEm.toLocaleDateString('pt-BR')}.`, refType: 'SecProtocolo', refId: p.id })
    if (p.studentId) await notify({ tenantId: p.tenantId, studentId: p.studentId, assunto: `Protocolo ${p.numero}`, mensagem: 'Seu requerimento está em análise prioritária; pedimos desculpas pela demora.', refType: 'SecProtocolo', refId: p.id })
    escalonados++
  }
  // 2) pendência de documento sem resposta além do prazo de reenvio => cancela
  const pend = await prisma.secProtocolo.findMany({ where: { status: 'PENDENTE_DOCUMENTO', pendenteDesde: { not: null } }, include: { tipo: { select: { prazoReenvioDias: true } } }, take: 500 })
  for (const p of pend) {
    if (p.pendenteDesde && now.getTime() - p.pendenteDesde.getTime() > p.tipo.prazoReenvioDias * DAY) {
      try {
        await mudarStatusProtocolo({ tenantId: p.tenantId, id: p.id, para: 'CANCELADO', parecer: `Cancelado automaticamente: documentação não reenviada em ${p.tipo.prazoReenvioDias} dias.`, origem: 'SISTEMA' })
        cancelados++
      } catch (e) {
        console.error('[secretaria:job] cancelar pendente', e)
      }
    }
  }
  // 3) sincroniza pagamento das taxas
  const comTaxa = await prisma.secProtocolo.findMany({ where: { taxaStatus: 'PENDENTE', receivableId: { not: null }, status: { notIn: ['CANCELADO', 'INDEFERIDO'] } }, select: { id: true, tenantId: true, receivableId: true, taxaStatus: true }, take: 500 })
  for (const p of comTaxa) if ((await sincronizarTaxa(p)) !== 'PENDENTE') taxas++
  return { escalonados, cancelados, taxasAtualizadas: taxas }
}

export async function jobColacoes(now = new Date()) {
  let reavaliadas = 0
  let atrasadas = 0
  const prox = await prisma.secColacao.findMany({ where: { status: { in: ['PLANEJADA', 'CONVOCADA'] }, data: { gte: now, lte: new Date(now.getTime() + 21 * DAY) } }, take: 200 })
  for (const c of prox) {
    await reavaliarFormandos(c.tenantId, c)
    reavaliadas++
  }
  const passadas = await prisma.secColacao.findMany({ where: { status: { in: ['PLANEJADA', 'CONVOCADA'] }, data: { lt: new Date(now.getTime() - DAY) } }, take: 200 })
  for (const c of passadas) {
    const users = await prisma.user.findMany({ where: { tenantId: c.tenantId, isActive: true, role: 'SECRETARY' }, select: { id: true }, take: 20 })
    for (const u of users) await notify({ tenantId: c.tenantId, userId: u.id, assunto: `Colação "${c.nome}" sem atualização`, mensagem: 'A data da colação passou. Marque como REALIZADA/CANCELADA e gere a ata.', refType: 'SecColacao', refId: c.id })
    atrasadas++
  }
  return { reavaliadas, atrasadas }
}

export async function jobDiplomas(now = new Date()) {
  let avisos = 0
  const parados = await prisma.secDiploma.findMany({ where: { status: 'PENDENCIA', updatedAt: { lt: new Date(now.getTime() - 15 * DAY) } }, take: 300 })
  for (const d of parados) {
    await notify({ tenantId: d.tenantId, studentId: d.studentId, assunto: 'Pendências no seu diploma', mensagem: `Seu diploma continua com pendências: ${((d.pendencias as string[]) ?? []).join('; ')}. Procure a secretaria.`, refType: 'SecDiploma', refId: d.id })
    await prisma.secDiploma.update({ where: { id: d.id }, data: { updatedAt: now } })
    avisos++
  }
  return { avisos }
}

export function registrarJobsSecretaria() {
  registerEduJob('secretaria.protocolos', () => jobProtocolos())
  registerEduJob('secretaria.arquivo', () => reclassificarArquivo())
  registerEduJob('secretaria.colacoes', () => jobColacoes())
  registerEduJob('secretaria.diplomas', () => jobDiplomas())
}
