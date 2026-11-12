// Sugestão automática de itens de planejamento: (1) lacunas do checklist de equipamentos/espaços por curso
// (calcularAdequacao) e (2) recorrência de ocorrências de manutenção (OS corretivas) por bem e por espaço.
// Base 100% por REGRAS e explicável (cada sugestão traz as evidências). Se o cliente de IA estiver configurado
// (services-ai/client.ts), ele apenas REDIGE a justificativa a partir das mesmas evidências; sem chave, o
// redator simulado devolve o texto determinístico. Toda sugestão fica PENDENTE até um gestor aceitar ou rejeitar.
import { prisma } from '../../../lib/prisma'
import { AiUnavailableError, aiConfigured, callAIForJSON } from '../../../services-ai/client'
import { calcularAdequacao } from '../adequacao'
import { round2 } from './calc'

export interface Evidencia { fato: string; detalhe: string }
export interface SugestaoBruta {
  chave: string; programId?: string | null; spaceId?: string | null; titulo: string; tipo: string; origem: 'CHECKLIST' | 'MANUTENCAO'
  justificativa: string; indicadorMec?: string | null; requisitoId?: string | null; quantidade: number; valorEstimado: number; prioridade: string; explicacao: Evidencia[]
}

export const LIMIAR_OS_BEM = 2      // OS corretivas do mesmo bem em 12 meses
export const LIMIAR_OS_ESPACO = 3   // OS corretivas no mesmo espaço em 12 meses

/** Regras do checklist: cada lacuna sem iniciativa em andamento vira uma sugestão. */
export async function sugerirPorChecklist(tenantId: string, coberturas: Set<string>, programId?: string): Promise<SugestaoBruta[]> {
  const reqs = await prisma.infRequisitoCurso.findMany({ where: { tenantId, ativo: true, ...(programId ? { programId } : {}) }, select: { programId: true }, distinct: ['programId'] })
  const out: SugestaoBruta[] = []
  for (const { programId: pid } of reqs) {
    const adq = await calcularAdequacao(tenantId, pid)
    if (!adq) continue
    for (const l of adq.lacunas) {
      if (coberturas.has(l.requisitoId)) continue
      const espaco = l.tipo === 'ESPACO'
      const critico = l.obrigatorio && l.coberturaPct === 0
      out.push({
        chave: `CHK:${pid}:${l.requisitoId}`, programId: pid, requisitoId: l.requisitoId,
        titulo: espaco ? `Ampliar espaços — ${l.descricao} (${adq.programa.nome})` : `Adquirir ${l.lacuna}× ${l.descricao} — ${adq.programa.nome}`,
        tipo: espaco ? 'EXPANSAO' : 'EQUIPAMENTO', origem: 'CHECKLIST',
        justificativa: `O checklist de infraestrutura de ${adq.programa.nome} exige ${l.exigido} unidade(s) de "${l.descricao}" e há ${l.existente}${l.emManutencao ? ` (mais ${l.emManutencao} em manutenção)` : ''}; faltam ${l.lacuna}.${l.referenciaMec ? ` Referência: ${l.referenciaMec}.` : ''}`,
        indicadorMec: l.referenciaMec, quantidade: l.lacuna, valorEstimado: round2(l.custoEstimadoLacuna ?? 0),
        prioridade: critico ? 'CRITICA' : l.obrigatorio ? 'ALTA' : 'MEDIA',
        explicacao: [
          { fato: 'Exigido pelo checklist', detalhe: `${l.exigido} (${adq.vagasConsideradas} vagas/alunos considerados)` },
          { fato: 'Existente em uso', detalhe: String(l.existente) },
          ...(l.emManutencao ? [{ fato: 'Em manutenção', detalhe: String(l.emManutencao) }] : []),
          { fato: 'Lacuna', detalhe: `${l.lacuna} (cobertura ${l.coberturaPct}%)` },
          { fato: 'Obrigatório', detalhe: l.obrigatorio ? 'Sim' : 'Não' },
          ...(l.custoEstimadoLacuna == null ? [{ fato: 'Preço', detalhe: 'Sem bem similar cadastrado para estimar o valor — informe o orçamento.' }] : [{ fato: 'Estimativa', detalhe: 'Valor médio de aquisição dos bens da categoria × lacuna' }]),
        ],
      })
    }
  }
  return out
}

/** Regras de manutenção: bens com reincidência de OS corretiva ou em estado ruim; espaços com muitas ocorrências. */
export async function sugerirPorManutencao(tenantId: string, agora = new Date()): Promise<SugestaoBruta[]> {
  const desde = new Date(agora.getTime() - 365 * 86_400_000)
  const os = await prisma.infOrdemServico.findMany({ where: { tenantId, tipo: 'CORRETIVA', abertaEm: { gte: desde }, status: { not: 'CANCELADA' } }, select: { id: true, numero: true, titulo: true, bemId: true, spaceId: true, custoMaoObra: true, custoPecas: true } })
  const out: SugestaoBruta[] = []
  const porBem = new Map<string, typeof os>()
  const porEspaco = new Map<string, typeof os>()
  for (const o of os) {
    if (o.bemId) porBem.set(o.bemId, [...(porBem.get(o.bemId) ?? []), o])
    if (o.spaceId) porEspaco.set(o.spaceId, [...(porEspaco.get(o.spaceId) ?? []), o])
  }
  const bensRuins = await prisma.infBem.findMany({ where: { tenantId, estado: { in: ['RUIM', 'INSERVIVEL'] }, status: { not: 'BAIXADO' } }, select: { id: true } })
  const ids = new Set<string>([...porBem.keys(), ...bensRuins.map((b) => b.id)])
  const bens = ids.size ? await prisma.infBem.findMany({ where: { tenantId, id: { in: [...ids] }, status: { not: 'BAIXADO' } }, include: { categoria: true } }) : []
  for (const b of bens) {
    const lista = porBem.get(b.id) ?? []
    const ruim = b.estado === 'RUIM' || b.estado === 'INSERVIVEL'
    if (lista.length < LIMIAR_OS_BEM && !(ruim && lista.length >= 1) && b.estado !== 'INSERVIVEL') continue
    const custo = round2(lista.reduce((s, o) => s + o.custoMaoObra + o.custoPecas, 0))
    out.push({
      chave: `MNT-BEM:${b.id}`, spaceId: b.spaceId, titulo: `Repor ${b.descricao} (tombamento ${b.tombamento})`, tipo: 'REPOSICAO', origem: 'MANUTENCAO',
      justificativa: `O bem ${b.tombamento} (${b.descricao}) teve ${lista.length} ordem(ns) de serviço corretiva(s) nos últimos 12 meses (R$ ${custo.toFixed(2)} gastos) e está em estado ${b.estado}. A reposição tende a custar menos do que seguir consertando.`,
      quantidade: 1, valorEstimado: round2(b.valorAquisicao), prioridade: b.estado === 'INSERVIVEL' || b.criticidade === 'CRITICA' ? 'ALTA' : 'MEDIA',
      explicacao: [
        { fato: 'OS corretivas (12 meses)', detalhe: lista.map((o) => o.numero).join(', ') || 'nenhuma' },
        { fato: 'Custo de manutenção acumulado', detalhe: `R$ ${custo.toFixed(2)}` },
        { fato: 'Estado do bem', detalhe: b.estado },
        { fato: 'Valor de aquisição (referência)', detalhe: `R$ ${b.valorAquisicao.toFixed(2)}` },
      ],
    })
  }
  const esp = [...porEspaco.entries()].filter(([, l]) => l.length >= LIMIAR_OS_ESPACO)
  if (esp.length) {
    const spaces = await prisma.eduSpace.findMany({ where: { tenantId, id: { in: esp.map(([id]) => id) } } })
    for (const [spaceId, lista] of esp) {
      const sp = spaces.find((s) => s.id === spaceId)
      if (!sp) continue
      const custo = round2(lista.reduce((s, o) => s + o.custoMaoObra + o.custoPecas, 0))
      out.push({
        chave: `MNT-ESP:${spaceId}`, spaceId, titulo: `Reforma/revisão geral — ${sp.nome}`, tipo: 'REFORMA', origem: 'MANUTENCAO',
        justificativa: `O espaço ${sp.codigo} (${sp.nome}) acumulou ${lista.length} ocorrências corretivas em 12 meses (R$ ${custo.toFixed(2)}). Recomenda-se avaliar reforma para eliminar a causa-raiz.`,
        quantidade: 1, valorEstimado: round2(Math.max(custo * 2, 0)), prioridade: lista.length >= LIMIAR_OS_ESPACO * 2 ? 'ALTA' : 'MEDIA',
        explicacao: [
          { fato: 'Ocorrências corretivas (12 meses)', detalhe: `${lista.length}: ${lista.slice(0, 6).map((o) => o.numero).join(', ')}` },
          { fato: 'Custo acumulado', detalhe: `R$ ${custo.toFixed(2)}` },
          { fato: 'Estimativa', detalhe: '2× o custo corretivo acumulado (referência inicial; refine com cotações)' },
        ],
      })
    }
  }
  return out
}

/** Redator: com IA configurada reescreve a justificativa a partir das evidências; sem chave, mantém o texto das regras (simulado). */
export async function redigirJustificativas(tenantId: string, sugs: SugestaoBruta[]): Promise<{ motor: 'REGRAS' | 'IA'; sugs: SugestaoBruta[] }> {
  if (!sugs.length || !aiConfigured()) return { motor: 'REGRAS', sugs }
  try {
    const r = await callAIForJSON<Array<{ chave: string; justificativa: string }>>({
      system: 'Você redige justificativas curtas (até 3 frases, português do Brasil) para planos de infraestrutura de uma instituição de ensino superior. Use SOMENTE os fatos fornecidos; não invente números, normas ou valores. Responda apenas um JSON: [{"chave":"...","justificativa":"..."}].',
      user: JSON.stringify(sugs.map((s) => ({ chave: s.chave, titulo: s.titulo, fatos: s.explicacao, textoBase: s.justificativa }))),
      maxTokens: 2500, ctx: { tenantId, referenceType: 'IplSugestao' },
    })
    const m = new Map((Array.isArray(r) ? r : []).map((x) => [x.chave, String(x.justificativa || '').trim()]))
    return { motor: 'IA', sugs: sugs.map((s) => ({ ...s, justificativa: m.get(s.chave) || s.justificativa })) }
  } catch (e) {
    if (!(e instanceof AiUnavailableError)) console.warn('[infra-planejamento] IA indisponível, usando regras:', (e as Error).message)
    return { motor: 'REGRAS', sugs }
  }
}
