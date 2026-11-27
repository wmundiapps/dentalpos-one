import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { parseBody, qs } from '../core/crud'
import { audit } from '../core/notify'
import { delegateOpcional, enviarCsv, fail, media, round2, seguro, somar, toCsv } from './util2'

// Avaliação de funcionários: SOMENTE resumos agregados (por setor/grupo/ciclo). Nunca notas individuais
// (LGPD / sigilo da avaliação de desempenho). Grupos com poucos avaliados são suprimidos (k-anonimato).
// Fontes: lançamento manual, agregação do módulo RH (RheAvaliacao/RheCiclo) quando existir e
// pesquisas de avaliação docente (apoio).

export const MIN_GRUPO = 3
const GRUPOS = ['ADMINISTRATIVO', 'DOCENTE', 'COORDENACAO', 'APOIO', 'OUTRO'] as const

const schemaResumo = z.object({
  ciclo: z.string().trim().min(1).max(60),
  setor: z.string().trim().min(1).max(120),
  grupo: z.enum(GRUPOS).default('ADMINISTRATIVO'),
  avaliados: z.number().int().min(0).max(100_000),
  concluidas: z.number().int().min(0).max(100_000),
  notaMedia: z.number().min(0).max(100).optional(),
  escalaMax: z.number().int().min(2).max(100).default(5),
  distribuicao: z.record(z.string(), z.number().int().min(0)).optional(),
  pontosFortes: z.array(z.string().max(200)).max(10).optional(),
  pontosAtencao: z.array(z.string().max(200)).max(10).optional(),
})

const norm5 = (nota: number | null | undefined, escala: number) => (nota == null ? null : round2((nota / escala) * 5))

/** Aplica k-anonimato: com menos de MIN_GRUPO avaliados, esconde nota e distribuição. */
export function mascararResumo<T extends { avaliados: number; notaMedia: number | null; distribuicao?: any; pontosFortes?: string[]; pontosAtencao?: string[] }>(r: T): T & { suprimido: boolean } {
  if (r.avaliados >= MIN_GRUPO) return { ...r, suprimido: false }
  return { ...r, notaMedia: null, distribuicao: null, pontosFortes: [], pontosAtencao: [], suprimido: true }
}

/** Agrega o módulo RH (se existir) por departamento: apenas contagens e média. */
export async function resumosRh(tenantId: string, ciclo?: string): Promise<Array<{ ciclo: string; setor: string; grupo: string; avaliados: number; concluidas: number; notaMedia: number | null; escalaMax: number; distribuicao: Record<string, number>; origemRef: string }>> {
  const cic = delegateOpcional('rheCiclo'), ava = delegateOpcional('rheAvaliacao'), col = delegateOpcional('rheColaborador'), dep = delegateOpcional('rheDepartamento')
  if (!cic || !ava || !col) return []
  const ciclos = await cic.findMany({ where: { tenantId, status: { in: ['ABERTO', 'ENCERRADO'] }, ...(ciclo ? { nome: ciclo } : {}) }, orderBy: { inicio: 'desc' }, take: ciclo ? 5 : 6 })
  if (!ciclos.length) return []
  const deps = dep ? new Map<string, string>((await dep.findMany({ where: { tenantId }, select: { id: true, nome: true }, take: 2000 })).map((d: any) => [d.id, d.nome])) : new Map<string, string>()
  const out: any[] = []
  for (const c of ciclos) {
    const avs = await ava.findMany({ where: { tenantId, cicloId: c.id }, select: { colaboradorId: true, status: true, notaFinal: true, classificacao: true }, take: 50_000 })
    if (!avs.length) continue
    const cols = await col.findMany({ where: { tenantId, id: { in: avs.map((a: any) => a.colaboradorId) } }, select: { id: true, tipo: true, departamentoId: true }, take: 50_000 })
    const porCol = new Map<string, any>(cols.map((x: any) => [x.id, x]))
    const grupos = new Map<string, any[]>()
    for (const a of avs) {
      const x = porCol.get(a.colaboradorId)
      const setor = (x?.departamentoId && deps.get(x.departamentoId)) || 'Sem departamento'
      const grupo = x?.tipo === 'DOCENTE' ? 'DOCENTE' : 'ADMINISTRATIVO'
      const k = `${setor}|${grupo}`
      grupos.set(k, [...(grupos.get(k) ?? []), a])
    }
    for (const [k, lista] of grupos) {
      const [setor, grupo] = k.split('|')
      const concl = lista.filter((a) => a.status === 'CONCLUIDA')
      const dist: Record<string, number> = {}
      for (const a of concl) if (a.classificacao) dist[a.classificacao] = (dist[a.classificacao] ?? 0) + 1
      out.push({ ciclo: c.nome, setor, grupo, avaliados: lista.length, concluidas: concl.length, notaMedia: media(concl.map((a) => a.notaFinal)), escalaMax: c.escalaMax ?? 5, distribuicao: dist, origemRef: c.id })
    }
  }
  return out
}

export async function consolidarPessoas(tenantId: string, ciclo?: string) {
  const falhas: string[] = []
  const manuais = await prisma.reiAvaliacaoPessoalResumo.findMany({ where: { tenantId, ...(ciclo ? { ciclo } : {}) }, orderBy: [{ ciclo: 'desc' }, { setor: 'asc' }], take: 2000 })
  const rh = await seguro('rh', falhas, () => resumosRh(tenantId, ciclo), [])
  const chaves = new Set(manuais.map((m) => `${m.ciclo}|${m.setor}|${m.grupo}`))
  const linhas = [
    ...manuais.map((m) => ({ ciclo: m.ciclo, setor: m.setor, grupo: m.grupo, avaliados: m.avaliados, concluidas: m.concluidas, notaMedia: m.notaMedia, escalaMax: m.escalaMax, distribuicao: m.distribuicao as any, pontosFortes: m.pontosFortes, pontosAtencao: m.pontosAtencao, fonte: m.fonte })),
    ...rh.filter((r) => !chaves.has(`${r.ciclo}|${r.setor}|${r.grupo}`)).map((r) => ({ ...r, pontosFortes: [] as string[], pontosAtencao: [] as string[], fonte: 'RH' })),
  ].map((l) => {
    const m = mascararResumo(l)
    return { ...m, notaMedia5: norm5(m.notaMedia, m.escalaMax), adesaoPct: l.avaliados ? round2((l.concluidas / l.avaliados) * 100) : null }
  })
  const visiveis = linhas.filter((l) => !l.suprimido)
  const ciclos = [...new Set(linhas.map((l) => l.ciclo))]
  const porGrupo = Object.fromEntries(GRUPOS.map((g) => {
    const ls = visiveis.filter((l) => l.grupo === g)
    return [g, { avaliados: somar(ls.map((l) => l.avaliados)), concluidas: somar(ls.map((l) => l.concluidas)), notaMedia5: media(ls.map((l) => l.notaMedia5)) }]
  }).filter(([, v]: any) => v.avaliados > 0))
  return {
    ciclos, ciclo: ciclo ?? ciclos[0] ?? null, minimoGrupo: MIN_GRUPO, rhDisponivel: !falhas.includes('rh') && !!delegateOpcional('rheAvaliacao'),
    totais: { setores: linhas.length, suprimidos: linhas.length - visiveis.length, avaliados: somar(linhas.map((l) => l.avaliados)), concluidas: somar(linhas.map((l) => l.concluidas)), notaMedia5: media(visiveis.map((l) => l.notaMedia5)) },
    porGrupo, linhas,
  }
}

export function registerPessoas(router: Router) {
  router.get('/pessoas/avaliacoes', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const r = await consolidarPessoas(getTenantId(req), qs(req.query.ciclo))
    if (qs(req.query.formato) === 'csv') {
      return enviarCsv(res, 'avaliacao-pessoas', toCsv(
        [{ key: 'ciclo', label: 'Ciclo' }, { key: 'setor', label: 'Setor' }, { key: 'grupo', label: 'Grupo' }, { key: 'avaliados', label: 'Avaliados' }, { key: 'concluidas', label: 'Concluídas' }, { key: 'adesaoPct', label: 'Adesão %' }, { key: 'notaMedia5', label: 'Nota média (0-5)' }, { key: 'fonte', label: 'Fonte' }, { key: 'suprimido', label: 'Suprimido (grupo pequeno)' }],
        r.linhas,
      ))
    }
    res.json(r)
  }))

  // lançamento/atualização de um resumo agregado (idempotente por ciclo+setor+grupo)
  router.put('/pessoas/resumos', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(schemaResumo, req.body)
    if (b.concluidas > b.avaliados) fail(400, 'Concluídas não pode exceder o total de avaliados.')
    if (b.notaMedia != null && b.notaMedia > b.escalaMax) fail(400, 'A nota média não pode exceder a escala máxima.')
    const dados = { avaliados: b.avaliados, concluidas: b.concluidas, notaMedia: b.notaMedia ?? null, escalaMax: b.escalaMax, distribuicao: b.distribuicao as any, pontosFortes: b.pontosFortes ?? [], pontosAtencao: b.pontosAtencao ?? [], fonte: 'MANUAL' }
    const row = await prisma.reiAvaliacaoPessoalResumo.upsert({ where: { tenantId_ciclo_setor_grupo: { tenantId, ciclo: b.ciclo, setor: b.setor, grupo: b.grupo } }, create: { tenantId, ciclo: b.ciclo, setor: b.setor, grupo: b.grupo, ...dados }, update: dados })
    await audit({ tenantId, userId: getUserId(req), modulo: 'reitoria', acao: 'PESSOAS_RESUMO', refType: 'ReiAvaliacaoPessoalResumo', refId: row.id })
    res.json(row)
  }))

  router.delete('/pessoas/resumos/:id', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const r = await prisma.reiAvaliacaoPessoalResumo.deleteMany({ where: { id: String(req.params.id), tenantId: getTenantId(req) } })
    if (!r.count) return res.status(404).json({ error: 'Resumo não encontrado.' })
    res.status(204).end()
  }))

  // Congela os agregados do RH como resumos (histórico mesmo se o ciclo for alterado depois).
  router.post('/pessoas/sincronizar-rh', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    if (!delegateOpcional('rheAvaliacao')) return res.json({ disponivel: false, sincronizados: 0 })
    const rh = await resumosRh(tenantId, qs(req.query.ciclo))
    let n = 0
    for (const r of rh) {
      const dados = { avaliados: r.avaliados, concluidas: r.concluidas, notaMedia: r.notaMedia, escalaMax: r.escalaMax, distribuicao: r.distribuicao as any, fonte: 'RH', origemRef: r.origemRef }
      const where = { tenantId_ciclo_setor_grupo: { tenantId, ciclo: r.ciclo, setor: r.setor, grupo: r.grupo } }
      const ex = await prisma.reiAvaliacaoPessoalResumo.findUnique({ where })
      if (ex && ex.fonte === 'MANUAL') continue
      await prisma.reiAvaliacaoPessoalResumo.upsert({ where, create: { tenantId, ciclo: r.ciclo, setor: r.setor, grupo: r.grupo, ...dados }, update: dados })
      n++
    }
    res.json({ disponivel: true, sincronizados: n })
  }))
}
