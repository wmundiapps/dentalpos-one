import { Response, Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler } from '../academico/middleware'
import { dateISO, pageParams, parseBody, qs } from '../core/crud'
import { notify } from '../core/notify'
import { r2 } from './calculo'
import { auditar, equipeIds, exigirAutenticado, exigirRh, httpError, isRh, logSensivel, meuColaborador, tid, uid } from './common'

export const classificar = (nota: number, escala: number) => { const x = nota / escala; return x < 0.5 ? 'INSUFICIENTE' : x < 0.7 ? 'EM_DESENVOLVIMENTO' : x < 0.9 ? 'ADEQUADO' : 'EXCELENTE' }
export function notaPonderada(notas: Record<string, any>, criterios: Array<{ id: string; peso: number }>, papel: 'auto' | 'gestor'): number | null {
  let soma = 0, pesos = 0
  for (const c of criterios) { const v = notas?.[c.id]?.[papel]; if (typeof v === 'number') { soma += v * c.peso; pesos += c.peso } }
  return pesos ? r2(soma / pesos) : null
}
export function notaFinalDe(auto: number | null, gestor: number | null, pesoAuto: number, pesoGestor: number): number | null {
  if (gestor === null) return null
  if (auto === null) return gestor
  return r2((auto * pesoAuto + gestor * pesoGestor) / (pesoAuto + pesoGestor))
}
export const K_ANONIMATO = 3

/** Resumo agregado para a Reitoria: sem nomes, grupos com menos de K avaliações são suprimidos. */
export async function resumoAvaliacoes(tenantId: string, cicloId?: string) {
  const ciclo = cicloId ? await prisma.rheCiclo.findFirst({ where: { id: cicloId, tenantId } }) : await prisma.rheCiclo.findFirst({ where: { tenantId, status: { in: ['ENCERRADO', 'ABERTO'] } }, orderBy: { fim: 'desc' } })
  if (!ciclo) return null
  const av = await prisma.rheAvaliacao.findMany({ where: { tenantId, cicloId: ciclo.id } })
  const cols = await prisma.rheColaborador.findMany({ where: { tenantId, id: { in: av.map((a) => a.colaboradorId) } }, select: { id: true, departamentoId: true, tipo: true } })
  const deps = Object.fromEntries((await prisma.rheDepartamento.findMany({ where: { tenantId }, select: { id: true, nome: true } })).map((d) => [d.id, d.nome]))
  const info = Object.fromEntries(cols.map((c) => [c.id, c]))
  const concl = av.filter((a) => a.status === 'CONCLUIDA' && a.notaFinal !== null)
  const agg = (lista: typeof av) => {
    const cc = lista.filter((a) => a.status === 'CONCLUIDA' && a.notaFinal !== null)
    return { avaliacoes: lista.length, concluidas: cc.length, notaMedia: cc.length ? r2(cc.reduce((s, a) => s + (a.notaFinal as number), 0) / cc.length) : null, distribuicao: cc.reduce((m: Record<string, number>, a) => { m[a.classificacao ?? 'N/D'] = (m[a.classificacao ?? 'N/D'] ?? 0) + 1; return m }, {}) }
  }
  const grupos = (chave: (id: string) => string) => {
    const m = new Map<string, typeof av>()
    for (const a of av) { const k = chave(a.colaboradorId); m.set(k, [...(m.get(k) ?? []), a]) }
    return [...m.entries()].map(([k, l]) => (l.filter((a) => a.status === 'CONCLUIDA').length < K_ANONIMATO ? { grupo: k, suprimido: true, motivo: `Grupo com menos de ${K_ANONIMATO} avaliações concluídas` } : { grupo: k, ...agg(l) }))
  }
  const geral = agg(av)
  return {
    ciclo: { id: ciclo.id, nome: ciclo.nome, inicio: ciclo.inicio, fim: ciclo.fim, status: ciclo.status },
    participacao: { total: av.length, concluidas: concl.length + av.filter((a) => a.status === 'CONCLUIDA' && a.notaFinal === null).length, taxa: av.length ? r2(av.filter((a) => a.status === 'CONCLUIDA').length / av.length * 100) : 0 },
    geral: geral.concluidas < K_ANONIMATO ? { ...geral, notaMedia: null, distribuicao: {}, observacao: `Menos de ${K_ANONIMATO} avaliações concluídas: médias suprimidas` } : geral,
    porDepartamento: grupos((id) => deps[info[id]?.departamentoId ?? ''] ?? 'Sem departamento'),
    porCategoria: grupos((id) => info[id]?.tipo ?? 'N/D'),
    privacidade: `Sem dados individuais; grupos com menos de ${K_ANONIMATO} avaliações concluídas são suprimidos.`,
  }
}

export function mountAvaliacoes(router: Router) {
  router.post('/ciclos', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const b = parseBody(z.object({ nome: z.string().min(3).max(120), inicio: dateISO(), fim: dateISO(), pesoAuto: z.number().min(0).max(100).default(30), pesoGestor: z.number().min(0).max(100).default(70), escalaMax: z.number().int().min(3).max(10).default(5) }).refine((d) => d.fim > d.inicio, { message: 'fim deve ser posterior ao início' }).refine((d) => d.pesoAuto + d.pesoGestor === 100, { message: 'pesoAuto + pesoGestor deve somar 100' }), req.body)
    const c = await prisma.rheCiclo.create({ data: { ...b, tenantId: tid(req) } })
    await auditar(req, 'CRIAR_CICLO', 'RheCiclo', c.id)
    res.status(201).json(c)
  }))
  router.get('/ciclos', exigirAutenticado, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const items = await prisma.rheCiclo.findMany({ where: { tenantId }, orderBy: { inicio: 'desc' } })
    const crit = await prisma.rheCriterio.groupBy({ by: ['cicloId'], where: { tenantId }, _count: true })
    const cnt = Object.fromEntries(crit.map((c) => [c.cicloId, c._count]))
    res.json({ items: items.map((c) => ({ ...c, criterios: cnt[c.id] ?? 0 })) })
  }))
  router.post('/ciclos/:id/criterios', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const c = await prisma.rheCiclo.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!c) throw httpError(404, 'Ciclo não encontrado.')
    if (c.status !== 'RASCUNHO') throw httpError(409, 'Critérios só podem ser alterados em ciclo em rascunho.')
    const b = parseBody(z.object({ nome: z.string().min(2).max(120), descricao: z.string().max(500).optional(), peso: z.number().positive().max(10).default(1), categoria: z.enum(['COMPETENCIA', 'RESULTADO', 'VALORES']).default('COMPETENCIA'), ordem: z.number().int().min(0).default(0) }), req.body)
    res.status(201).json(await prisma.rheCriterio.create({ data: { ...b, tenantId, cicloId: c.id } }))
  }))
  router.get('/ciclos/:id/criterios', exigirAutenticado, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    res.json({ items: await prisma.rheCriterio.findMany({ where: { tenantId: tid(req), cicloId: String(req.params.id) }, orderBy: [{ ordem: 'asc' }, { createdAt: 'asc' }] }) })
  }))
  router.post('/ciclos/:id/abrir', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const c = await prisma.rheCiclo.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!c) throw httpError(404, 'Ciclo não encontrado.')
    if (c.status !== 'RASCUNHO') throw httpError(409, 'Ciclo já aberto.')
    if (!(await prisma.rheCriterio.count({ where: { tenantId, cicloId: c.id } }))) return res.status(422).json({ error: 'Cadastre ao menos um critério.', pendencias: ['Nenhum critério cadastrado'] })
    const cols = await prisma.rheColaborador.findMany({ where: { tenantId, status: { in: ['ATIVO', 'AFASTADO', 'FERIAS'] }, vinculo: { not: 'PJ' } }, select: { id: true, gestorId: true, userId: true } })
    await prisma.rheAvaliacao.createMany({ data: cols.map((x) => ({ tenantId, cicloId: c.id, colaboradorId: x.id, avaliadorId: x.gestorId })), skipDuplicates: true })
    await prisma.rheCiclo.update({ where: { id: c.id }, data: { status: 'ABERTO' } })
    for (const x of cols) if (x.userId) await notify({ tenantId, userId: x.userId, assunto: `Avaliação de desempenho: ${c.nome}`, mensagem: 'O ciclo de avaliação foi aberto. Faça a sua autoavaliação na área do colaborador.', refType: 'RheCiclo', refId: c.id })
    await auditar(req, 'ABRIR_CICLO', 'RheCiclo', c.id, { avaliacoes: cols.length })
    res.json({ id: c.id, status: 'ABERTO', avaliacoes: cols.length })
  }))
  router.post('/ciclos/:id/encerrar', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const c = await prisma.rheCiclo.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!c) throw httpError(404, 'Ciclo não encontrado.')
    if (c.status !== 'ABERTO') throw httpError(409, 'Somente ciclos abertos podem ser encerrados.')
    const pend = await prisma.rheAvaliacao.count({ where: { tenantId, cicloId: c.id, status: { not: 'CONCLUIDA' } } })
    res.json({ ...(await prisma.rheCiclo.update({ where: { id: c.id }, data: { status: 'ENCERRADO' } })), avaliacoesNaoConcluidas: pend })
  }))

  const visao = (a: any, ctx: { rh: boolean; proprio: boolean; avaliador: boolean }) => {
    // o colaborador só vê notas do gestor depois de concluída; gestor vê tudo da equipe
    if (ctx.rh || ctx.avaliador) return a
    if (ctx.proprio) {
      const notas: Record<string, any> = {}
      for (const [k, v] of Object.entries(a.notas ?? {})) notas[k] = a.status === 'CONCLUIDA' ? v : { auto: (v as any).auto, comentarioAuto: (v as any).comentarioAuto }
      return a.status === 'CONCLUIDA' ? { ...a, notas } : { ...a, notas, notaGestor: null, notaFinal: null, classificacao: null, parecer: null }
    }
    return null
  }
  const montar = async (tenantId: string, items: any[], req: AuthenticatedRequest) => {
    const me = await meuColaborador(req)
    const nomes = Object.fromEntries((await prisma.rheColaborador.findMany({ where: { tenantId, id: { in: items.map((i) => i.colaboradorId) } }, select: { id: true, nome: true } })).map((c) => [c.id, c.nome]))
    const ciclos = Object.fromEntries((await prisma.rheCiclo.findMany({ where: { tenantId } })).map((c) => [c.id, c]))
    return items.map((a) => { const v = visao(a, { rh: isRh(req), proprio: me?.id === a.colaboradorId, avaliador: !!me && me.id === a.avaliadorId }); return v ? { ...v, colaboradorNome: nomes[a.colaboradorId], ciclo: ciclos[a.cicloId] ? { id: a.cicloId, nome: ciclos[a.cicloId].nome, escalaMax: ciclos[a.cicloId].escalaMax, status: ciclos[a.cicloId].status } : null } : null }).filter(Boolean)
  }

  router.get('/avaliacoes/minhas', exigirAutenticado, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const me = await meuColaborador(req); const tenantId = tid(req)
    if (!me) throw httpError(403, 'Seu usuário não está vinculado a um colaborador do RH.')
    const proprias = await prisma.rheAvaliacao.findMany({ where: { tenantId, colaboradorId: me.id }, orderBy: { createdAt: 'desc' } })
    const aAvaliar = await prisma.rheAvaliacao.findMany({ where: { tenantId, avaliadorId: me.id, status: { not: 'CONCLUIDA' } } })
    res.json({ minhas: await montar(tenantId, proprias, req), aAvaliar: await montar(tenantId, aAvaliar, req) })
  }))

  router.get('/avaliacoes', exigirAutenticado, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    if (!isRh(req)) {
      if (String(req.user?.role).toUpperCase() !== 'COORDINATOR') throw httpError(403, 'Sem permissão para esta ação.')
      where.colaboradorId = { in: await equipeIds(req) }
    }
    for (const f of ['cicloId', 'status', 'colaboradorId'] as const) { const v = qs((req.query as any)[f]); if (v && (isRh(req) || f !== 'colaboradorId')) where[f] = v }
    const [items, total] = await Promise.all([prisma.rheAvaliacao.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }), prisma.rheAvaliacao.count({ where })])
    if (isRh(req) && items.length) await logSensivel(req, 'avaliacoes', 'AVALIACAO', qs(req.query.colaboradorId))
    res.json({ items: await montar(tenantId, items, req), total, page, pageSize })
  }))

  router.get('/avaliacoes/resumo-reitoria', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!isRh(req)) throw httpError(403, 'Acesso restrito ao RH e à administração.')
    const r = await resumoAvaliacoes(tid(req), qs(req.query.cicloId))
    res.json(r ?? { ciclo: null, mensagem: 'Nenhum ciclo de avaliação encontrado.' })
  }))

  const notasSchema = z.record(z.string(), z.object({ nota: z.number().min(0).max(10), comentario: z.string().max(1000).optional() }))
  const carregarAv = async (req: AuthenticatedRequest) => {
    const tenantId = tid(req)
    const a = await prisma.rheAvaliacao.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!a) throw httpError(404, 'Avaliação não encontrada.')
    const ciclo = await prisma.rheCiclo.findFirst({ where: { id: a.cicloId, tenantId } })
    if (!ciclo || ciclo.status !== 'ABERTO') throw httpError(409, 'O ciclo de avaliação não está aberto.')
    const criterios = await prisma.rheCriterio.findMany({ where: { tenantId, cicloId: ciclo.id } })
    return { a, ciclo, criterios }
  }
  const validarNotas = (notas: Record<string, { nota: number }>, criterios: Array<{ id: string; nome: string }>, escala: number) => {
    for (const c of criterios) if (!notas[c.id]) throw httpError(422, `Informe a nota do critério "${c.nome}".`)
    for (const [k, v] of Object.entries(notas)) { if (!criterios.some((c) => c.id === k)) throw httpError(422, 'Critério inválido para este ciclo.'); if (v.nota < 1 || v.nota > escala) throw httpError(422, `As notas devem estar entre 1 e ${escala}.`) }
  }

  router.post('/avaliacoes/:id/autoavaliacao', exigirAutenticado, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const b = parseBody(z.object({ notas: notasSchema }), req.body)
    const { a, ciclo, criterios } = await carregarAv(req)
    const me = await meuColaborador(req)
    if (!me || me.id !== a.colaboradorId) throw httpError(403, 'Somente o próprio colaborador faz a autoavaliação.')
    if (a.status !== 'PENDENTE') throw httpError(409, 'Autoavaliação já enviada.')
    validarNotas(b.notas, criterios, ciclo.escalaMax)
    const notas: Record<string, any> = { ...(a.notas as any) }
    for (const [k, v] of Object.entries(b.notas)) notas[k] = { ...(notas[k] ?? {}), auto: v.nota, comentarioAuto: v.comentario }
    const notaAuto = notaPonderada(notas, criterios, 'auto')
    res.json(await prisma.rheAvaliacao.update({ where: { id: a.id }, data: { notas, notaAuto, status: 'AUTO_ENVIADA' } }))
  }))

  router.post('/avaliacoes/:id/avaliacao-gestor', exigirAutenticado, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const b = parseBody(z.object({ notas: notasSchema, parecer: z.string().min(10).max(3000), planoAcao: z.array(z.object({ acao: z.string().min(3).max(300), prazo: z.string().optional(), responsavel: z.string().max(150).optional(), status: z.enum(['PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDA']).default('PENDENTE') })).max(20).default([]), semAutoavaliacao: z.boolean().default(false) }), req.body)
    const { a, ciclo, criterios } = await carregarAv(req)
    const me = await meuColaborador(req)
    if (me?.id === a.colaboradorId) throw httpError(403, 'Você não pode avaliar a si mesmo como gestor.')
    if (!isRh(req) && !(me && me.id === a.avaliadorId)) throw httpError(403, 'Somente o gestor avaliador (ou o RH) lança a avaliação do gestor.')
    if (a.status === 'CONCLUIDA' || a.status === 'GESTOR_ENVIADA') throw httpError(409, 'Avaliação já concluída.')
    if (a.status === 'PENDENTE' && !(b.semAutoavaliacao && isRh(req))) throw httpError(409, 'Aguarde a autoavaliação do colaborador (o RH pode dispensá-la).')
    validarNotas(b.notas, criterios, ciclo.escalaMax)
    const notas: Record<string, any> = { ...(a.notas as any) }
    for (const [k, v] of Object.entries(b.notas)) notas[k] = { ...(notas[k] ?? {}), gestor: v.nota, comentarioGestor: v.comentario }
    const notaAuto = notaPonderada(notas, criterios, 'auto'), notaGestor = notaPonderada(notas, criterios, 'gestor')
    const notaFinal = notaFinalDe(notaAuto, notaGestor, ciclo.pesoAuto, ciclo.pesoGestor)
    const classificacao = notaFinal === null ? null : classificar(notaFinal, ciclo.escalaMax)
    if ((classificacao === 'INSUFICIENTE' || classificacao === 'EM_DESENVOLVIMENTO') && !b.planoAcao.length) return res.status(422).json({ error: 'Resultado abaixo do esperado exige plano de ação.', pendencias: ['Informe ao menos uma ação do plano de desenvolvimento'], classificacao })
    const r = await prisma.rheAvaliacao.update({ where: { id: a.id }, data: { notas, notaAuto, notaGestor, notaFinal, classificacao, parecer: b.parecer, planoAcao: b.planoAcao as any, status: 'CONCLUIDA', concluidaEm: new Date(), avaliadorId: a.avaliadorId ?? me?.id ?? null } })
    const col = await prisma.rheColaborador.findFirst({ where: { id: a.colaboradorId, tenantId: tid(req) }, select: { userId: true } })
    if (col?.userId) await notify({ tenantId: tid(req), userId: col.userId, assunto: 'Avaliação de desempenho concluída', mensagem: 'O resultado da sua avaliação já está disponível na área do colaborador.', refType: 'RheAvaliacao', refId: a.id })
    await auditar(req, 'CONCLUIR_AVALIACAO', 'RheAvaliacao', a.id, { classificacao })
    res.json(r)
  }))

  router.put('/avaliacoes/:id/plano-acao', exigirAutenticado, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ planoAcao: z.array(z.object({ acao: z.string().min(3).max(300), prazo: z.string().optional(), responsavel: z.string().max(150).optional(), status: z.enum(['PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDA']).default('PENDENTE') })).max(20) }), req.body)
    const a = await prisma.rheAvaliacao.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!a) throw httpError(404, 'Avaliação não encontrada.')
    const me = await meuColaborador(req)
    if (!isRh(req) && !(me && me.id === a.avaliadorId)) throw httpError(403, 'Somente o gestor avaliador ou o RH alteram o plano de ação.')
    res.json(await prisma.rheAvaliacao.update({ where: { id: a.id }, data: { planoAcao: b.planoAcao as any } }))
  }))
}
void uid
