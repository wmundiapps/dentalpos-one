import { prisma } from '../../lib/prisma'
import { EixoDesempenho, priorizarLacunas, Lacuna, round } from './logic'

// Última tentativa concluída de cada aluno para o exame (estado atual)
export async function ultimasTentativas(tenantId: string, exameId: string, studentIds?: string[]) {
  const t = await prisma.desTentativa.findMany({
    where: { tenantId, status: { in: ['ENVIADA', 'EXPIRADA'] }, simulado: { exameId }, ...(studentIds ? { studentId: { in: studentIds } } : {}) },
    orderBy: { enviadaEm: 'desc' },
    select: { id: true, studentId: true, percentual: true, porEixo: true, enviadaEm: true, simuladoId: true },
  })
  const seen = new Set<string>()
  return t.filter((x) => (seen.has(x.studentId) ? false : (seen.add(x.studentId), true)))
}

// Desempenho agregado por eixo (acertos/total somados) a partir de tentativas
export function agregarPorEixo(tentativas: Array<{ porEixo: any }>) {
  const m = new Map<string, { a: number; t: number }>()
  for (const t of tentativas) for (const e of (t.porEixo as any[]) ?? []) {
    const c = m.get(e.eixoId) ?? { a: 0, t: 0 }
    c.a += e.acertos; c.t += e.total; m.set(e.eixoId, c)
  }
  return m
}

export async function desempenhoEixos(tenantId: string, exameId: string, studentIds?: string[]): Promise<{ eixos: EixoDesempenho[]; amostra: number }> {
  const [eixos, tent] = await Promise.all([
    prisma.desEixo.findMany({ where: { tenantId, exameId, ativo: true }, orderBy: { ordem: 'asc' } }),
    ultimasTentativas(tenantId, exameId, studentIds),
  ])
  const agg = agregarPorEixo(tent)
  return {
    amostra: tent.length,
    eixos: eixos.map((e) => { const c = agg.get(e.id); return { eixoId: e.id, nome: e.nome, peso: e.peso, meta: e.metaAcerto, atual: c && c.t ? round((c.a / c.t) * 100) : null } }),
  }
}

export async function lacunasGrupo(tenantId: string, exameId: string, studentIds?: string[]): Promise<{ lacunas: Lacuna[]; amostra: number }> {
  const d = await desempenhoEixos(tenantId, exameId, studentIds)
  return { lacunas: priorizarLacunas(d.eixos), amostra: d.amostra }
}
