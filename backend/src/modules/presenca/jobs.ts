import { prisma } from '../../lib/prisma'
import { jobSaidaAutomatica } from './acesso'
import { conciliarChamada, fecharChamada } from './chamada'
import { jobEmprestimos } from './emprestimos'
import { getConfig, registrarLog } from './servico'

const DIA = 86_400_000

/** Fecha e concilia chamadas esquecidas abertas (3 h após o fim da aula). */
export async function jobFecharChamadas() {
  const pend = await prisma.preChamada.findMany({ where: { status: 'ABERTA', fimEsperado: { lt: new Date(Date.now() - 3 * 3600_000) } }, take: 200 })
  for (const ch of pend) {
    const fechada = await fecharChamada(ch.tenantId, ch)
    await conciliarChamada(ch.tenantId, fechada)
  }
  return { fechadas: pend.length }
}

/**
 * Retenção mínima de biometria (LGPD, art. 6º, III e art. 16): exclui templates sem consentimento ativo,
 * de desligados/inativos, sem uso além do prazo; expurga logs antigos e desafios expirados.
 */
export async function jobExpurgoBiometria() {
  const tenants = [...new Set((await prisma.preTemplateFacial.findMany({ select: { tenantId: true }, distinct: ['tenantId'] })).map((t) => t.tenantId))]
  let semConsentimento = 0, desligados = 0, vencidos = 0
  for (const tenantId of tenants) {
    const cfg = await getConfig(tenantId)
    const rows = await prisma.preTemplateFacial.findMany({ where: { tenantId }, select: { id: true, pessoaKey: true, studentId: true, userId: true, consentimentoId: true, ultimoUsoEm: true, createdAt: true } })
    const ativos = new Set((await prisma.lgpConsentimento.findMany({ where: { tenantId, id: { in: [...new Set(rows.map((r) => r.consentimentoId))] }, status: 'ATIVO' }, select: { id: true } })).map((c) => c.id))
    const alunosInativos = new Set((await prisma.student.findMany({ where: { tenantId, id: { in: rows.map((r) => r.studentId).filter(Boolean) as string[] }, status: { in: ['CANCELADO', 'DESISTENTE', 'FORMADO', 'CONCLUIDO'] } }, select: { id: true } })).map((s) => s.id))
    const usuariosInativos = new Set((await prisma.user.findMany({ where: { tenantId, id: { in: rows.map((r) => r.userId).filter(Boolean) as string[] }, isActive: false }, select: { id: true } })).map((u) => u.id))
    const limite = Date.now() - cfg.retencaoTemplateDias * DIA
    const motivos = new Map<string, string>()
    for (const r of rows) {
      if (!ativos.has(r.consentimentoId)) motivos.set(r.id, 'SEM_CONSENTIMENTO')
      else if ((r.studentId && alunosInativos.has(r.studentId)) || (r.userId && usuariosInativos.has(r.userId))) motivos.set(r.id, 'DESLIGAMENTO')
      else if ((r.ultimoUsoEm ?? r.createdAt).getTime() < limite) motivos.set(r.id, 'PRAZO_RETENCAO')
    }
    if (motivos.size) {
      await prisma.preTemplateFacial.deleteMany({ where: { tenantId, id: { in: [...motivos.keys()] } } })
      const porPessoa = new Map<string, string>()
      for (const r of rows) if (motivos.has(r.id)) porPessoa.set(r.pessoaKey, motivos.get(r.id)!)
      for (const [pk, motivo] of porPessoa) await registrarLog({ tenantId, acao: 'EXPURGO', resultado: 'OK', pessoaKey: pk, detalhe: { motivo } })
      for (const m of motivos.values()) { if (m === 'SEM_CONSENTIMENTO') semConsentimento++; else if (m === 'DESLIGAMENTO') desligados++; else vencidos++ }
    }
  }
  // logs e eventos de acesso além da retenção; desafios vencidos
  const cfgs = await prisma.preConfig.findMany({ select: { tenantId: true, retencaoLogDias: true } })
  let logs = 0, acessos = 0
  for (const c of cfgs) {
    const corte = new Date(Date.now() - c.retencaoLogDias * DIA)
    logs += (await prisma.preLogBiometrico.deleteMany({ where: { tenantId: c.tenantId, createdAt: { lt: corte } } })).count
    acessos += (await prisma.preAcesso.deleteMany({ where: { tenantId: c.tenantId, em: { lt: corte } } })).count
    await prisma.preVisita.deleteMany({ where: { tenantId: c.tenantId, saidaEm: { lt: corte } } })
  }
  const desafios = (await prisma.preDesafio.deleteMany({ where: { expiraEm: { lt: new Date(Date.now() - DIA) } } })).count
  return { semConsentimento, desligados, vencidos, logsExcluidos: logs, acessosExcluidos: acessos, desafiosExcluidos: desafios }
}

export async function executarJobsPresenca() {
  return { chamadas: await jobFecharChamadas(), saidaAutomatica: await jobSaidaAutomatica(), emprestimos: await jobEmprestimos(), expurgo: await jobExpurgoBiometria() }
}
