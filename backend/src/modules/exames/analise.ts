import { prisma } from '../../lib/prisma'
import { somarAgregados, pct, round } from './logic'

// Sessões concluídas de alunos (opcionalmente filtradas por exame e/ou alunos), da mais antiga para a mais recente.
export async function sessoesConcluidas(tenantId: string, opts: { studentIds?: string[]; exameId?: string; desde?: Date } = {}) {
  return prisma.exaSessao.findMany({
    where: {
      tenantId, status: { in: ['ENVIADA', 'EXPIRADA'] },
      ...(opts.studentIds ? { studentId: { in: opts.studentIds } } : {}),
      ...(opts.exameId ? { simulado: { exameId: opts.exameId } } : {}),
      ...(opts.desde ? { enviadaEm: { gte: opts.desde } } : {}),
    },
    orderBy: { enviadaEm: 'asc' },
    include: { simulado: { select: { titulo: true, exameId: true } } },
  })
}

type Sess = Awaited<ReturnType<typeof sessoesConcluidas>>[number]

/** Agrega por eixo / tema / descritor várias sessões (acertos e totais somados). */
export function agregarSessoes(sessoes: Sess[]) {
  const eixoNome = new Map<string, string>()
  const descCodigo = new Map<string, string>()
  const eixos: Array<Array<{ chave: string; acertos: number; total: number }>> = []
  const temas: typeof eixos = [], descs: typeof eixos = []
  for (const s of sessoes) {
    eixos.push(((s.porEixo as any[]) ?? []).map((e) => { eixoNome.set(e.eixoId, e.nome ?? e.eixoId); return { chave: e.eixoId, acertos: e.acertos, total: e.total } }))
    temas.push(((s.porTema as any[]) ?? []).map((e) => ({ chave: e.tema, acertos: e.acertos, total: e.total })))
    descs.push(((s.porDescritor as any[]) ?? []).map((e) => { descCodigo.set(e.descritorId, e.codigo ?? e.descritorId); return { chave: e.descritorId, acertos: e.acertos, total: e.total } }))
  }
  return {
    porEixo: somarAgregados(eixos).map((x) => ({ eixoId: x.chave, nome: eixoNome.get(x.chave) ?? x.chave, acertos: x.acertos, total: x.total, percentual: x.percentual })),
    porTema: somarAgregados(temas).map((x) => ({ tema: x.chave, acertos: x.acertos, total: x.total, percentual: x.percentual })),
    porDescritor: somarAgregados(descs).map((x) => ({ descritorId: x.chave, codigo: descCodigo.get(x.chave) ?? x.chave, acertos: x.acertos, total: x.total, percentual: x.percentual })),
  }
}

export async function desempenhoDoAluno(tenantId: string, studentId: string, exameId?: string) {
  const sessoes = await sessoesConcluidas(tenantId, { studentIds: [studentId], exameId })
  return { sessoes, ...agregarSessoes(sessoes) }
}

export function pontosEvolucao(sessoes: Sess[]) {
  return sessoes.map((s, i) => ({
    sessaoId: s.id, simulado: s.simulado.titulo, exameId: s.simulado.exameId, data: s.enviadaEm, percentual: s.percentual, acertos: s.acertos, total: s.total,
    variacao: i && s.percentual != null && sessoes[i - 1].percentual != null ? round(s.percentual - (sessoes[i - 1].percentual as number)) : null,
  }))
}
export { pct }
