import { prisma } from '../../lib/prisma'
import { registerEduJob } from '../core/jobs'
import { aprenderRecorrencias, verificarRecorrencias } from './recorrencias'
import { sincronizarDda } from './servico'

// Rotinas periódicas da Caixa de boletos (executadas pelo cron único GET/POST /api/cron/edu, por tenant):
//  - boletos.dda-sincronizar: consulta o DDA (provedor configurado; hoje simulado) dos tenants com DDA ativo;
//  - boletos.recorrencias: confere o que era esperado (contas recorrentes) com o lançado e avisa as não lançadas; aprende novas recorrências.
export async function jobDda() {
  const cfgs = await prisma.bolConfig.findMany({ where: { ddaAtivo: true }, select: { tenantId: true } })
  let novos = 0
  const falhas: string[] = []
  for (const c of cfgs) {
    try { novos += (await sincronizarDda(c.tenantId)).novos } catch (e: any) { falhas.push(`${c.tenantId}: ${e?.message}`) }
  }
  return { tenants: cfgs.length, novos, falhas }
}

export async function jobRecorrencias() {
  const comRec = await prisma.bolRecorrencia.findMany({ where: { ativa: true }, select: { tenantId: true }, distinct: ['tenantId'] })
  const comAprendizado = await prisma.bolConfig.findMany({ where: { recorrenciaAprendizado: true }, select: { tenantId: true } })
  const ids = Array.from(new Set([...comRec.map((x) => x.tenantId), ...comAprendizado.map((x) => x.tenantId)]))
  let novosAvisos = 0
  let sugestoes = 0
  const falhas: string[] = []
  for (const tenantId of ids) {
    try {
      novosAvisos += (await verificarRecorrencias(tenantId)).novosAvisos
      sugestoes += (await aprenderRecorrencias(tenantId)).novas
    } catch (e: any) { falhas.push(`${tenantId}: ${e?.message}`) }
  }
  return { tenants: ids.length, novosAvisos, sugestoes, falhas }
}

export function registrarJobsBoletos() {
  registerEduJob('boletos.dda-sincronizar', jobDda)
  registerEduJob('boletos.recorrencias', jobRecorrencias)
}
