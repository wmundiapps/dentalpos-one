import { prisma } from '../../lib/prisma'
import { RiscoInput, diffDays } from './logic'

const p: any = prisma

async function tentar<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn() } catch { return fallback }
}

// Coleta read-only e tolerante (cada fonte em try/catch) das métricas acadêmicas/financeiras do aluno.
export async function coletarMetricasAluno(tenantId: string, studentId: string, agora = new Date()): Promise<RiscoInput & { fontes: string[] }> {
  const fontes: string[] = []
  const out: RiscoInput & { fontes: string[] } = { fontes }

  // Notas e frequência consolidadas (módulo notas)
  const resultados: any[] = await tentar(() => p.ntResultado.findMany({ where: { tenantId, studentId, encerrado: false }, select: { mediaParcial: true, mediaFinal: true, frequenciaPct: true, aulasTotal: true, faltas: true } }), [])
  if (resultados.length) {
    fontes.push('NtResultado')
    const notas = resultados.map((r) => r.mediaFinal ?? r.mediaParcial).filter((x: any): x is number => typeof x === 'number')
    if (notas.length) {
      out.mediaNotas = notas.reduce((a: number, b: number) => a + b, 0) / notas.length
      out.avaliacoesTotal = notas.length
      out.avaliacoesAbaixoMedia = notas.filter((n: number) => n < 6).length
    }
    const aulas = resultados.reduce((s, r) => s + (r.aulasTotal || 0), 0)
    const faltas = resultados.reduce((s, r) => s + (r.faltas || 0), 0)
    if (aulas > 0) out.faltasPercent = (faltas / aulas) * 100
  }

  // Fallback: frequência bruta
  if (out.faltasPercent == null) {
    const desde = new Date(agora.getTime() - 120 * 86_400_000)
    const att: any[] = await tentar(() => p.attendance.findMany({ where: { studentId, registradoEm: { gte: desde } }, select: { presente: true, justificativa: true } }), [])
    if (att.length) { fontes.push('Attendance'); out.faltasPercent = (att.filter((a) => !a.presente).length / att.length) * 100 }
  }
  // Fallback: tentativas de avaliação
  if (out.mediaNotas == null) {
    const at: any[] = await tentar(() => p.assessmentAttempt.findMany({ where: { studentId, notaFinal: { not: null } }, select: { notaFinal: true }, take: 200 }), [])
    if (at.length) {
      fontes.push('AssessmentAttempt')
      const notas = at.map((a) => a.notaFinal as number)
      out.mediaNotas = notas.reduce((a, b) => a + b, 0) / notas.length
      out.avaliacoesTotal = notas.length
      out.avaliacoesAbaixoMedia = notas.filter((n) => n < 6).length
    }
  }

  // Inadimplência
  const cr: any[] = await tentar(() => p.accountReceivable.findMany({ where: { tenantId, studentId, status: { in: ['PENDENTE', 'ATRASADO'] }, dataVencimento: { lt: agora } }, select: { dataVencimento: true } }), [])
  const temFin: number = await tentar(() => p.accountReceivable.count({ where: { tenantId, studentId } }), 0)
  if (temFin > 0) {
    fontes.push('AccountReceivable')
    out.parcelasVencidas = cr.length
    out.diasMaiorAtraso = cr.length ? Math.max(...cr.map((c) => diffDays(agora, c.dataVencimento))) : 0
  }

  // Atividade (conteúdo, flashcards, tentativas de avaliação)
  const datas: Date[] = []
  const cp: any = await tentar(() => p.contentProgress.findFirst({ where: { studentId }, orderBy: { ultimaVisualizacao: 'desc' }, select: { ultimaVisualizacao: true } }), null)
  if (cp?.ultimaVisualizacao) datas.push(cp.ultimaVisualizacao)
  const fc: any = await tentar(() => p.studentFlashcardState.findFirst({ where: { studentId, ultimaRevisao: { not: null } }, orderBy: { ultimaRevisao: 'desc' }, select: { ultimaRevisao: true } }), null)
  if (fc?.ultimaRevisao) datas.push(fc.ultimaRevisao)
  const aa: any = await tentar(() => p.assessmentAttempt.findFirst({ where: { studentId }, orderBy: { iniciadoEm: 'desc' }, select: { iniciadoEm: true } }), null)
  if (aa?.iniciadoEm) datas.push(aa.iniciadoEm)
  const ultPresenca: any = await tentar(() => p.attendance.findFirst({ where: { studentId, presente: true }, orderBy: { registradoEm: 'desc' }, select: { registradoEm: true } }), null)
  if (ultPresenca?.registradoEm) datas.push(ultPresenca.registradoEm)
  if (datas.length) {
    fontes.push('Atividade')
    out.diasSemAtividade = diffDays(agora, new Date(Math.max(...datas.map((d) => d.getTime()))))
  }

  // Requerimento de trancamento/cancelamento (secretaria), últimos 120 dias
  const tipos: any[] = await tentar(() => p.secTipoRequerimento.findMany({
    where: { tenantId, OR: [{ codigo: { contains: 'TRANC', mode: 'insensitive' } }, { codigo: { contains: 'CANCEL', mode: 'insensitive' } }, { codigo: { contains: 'DESIST', mode: 'insensitive' } }, { nome: { contains: 'tranca', mode: 'insensitive' } }, { nome: { contains: 'cancelamento de matr', mode: 'insensitive' } }] },
    select: { id: true },
  }), [])
  if (tipos.length) {
    const n: number = await tentar(() => p.secProtocolo.count({
      where: { tenantId, studentId, tipoId: { in: tipos.map((t) => t.id) }, status: { notIn: ['CANCELADO', 'INDEFERIDO'] }, createdAt: { gte: new Date(agora.getTime() - 120 * 86_400_000) } },
    }), 0)
    fontes.push('SecProtocolo')
    out.requerimentoTrancamento = n > 0
  }

  // Fatores protetivos
  out.bolsista = (await tentar(() => prisma.apoConcessaoBolsa.count({ where: { tenantId, studentId, status: 'ATIVA' } }), 0)) > 0
  out.atendimentoRecente = (await tentar(() => prisma.apoAtendimento.count({ where: { tenantId, studentId, status: 'REALIZADO', dataHora: { gte: new Date(agora.getTime() - 30 * 86_400_000) } } }), 0)) > 0
  return out
}

// Média e frequência para critérios de bolsa/monitoria.
export async function desempenhoAluno(tenantId: string, studentId: string) {
  const m = await coletarMetricasAluno(tenantId, studentId)
  return { media: m.mediaNotas ?? null, frequencia: m.faltasPercent != null ? Math.round((100 - m.faltasPercent) * 10) / 10 : null }
}
