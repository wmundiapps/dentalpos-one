import { Router, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, requireRole } from '../academico/middleware'
import { qs } from '../core/crud'
import { LEITURA } from './common'
import { giroAcervo, round2 } from './logic'

function periodo(q: any) {
  const ate = qs(q.ate) ? new Date(qs(q.ate)!) : new Date()
  const de = qs(q.de) ? new Date(qs(q.de)!) : new Date(ate.getTime() - 365 * 86400000)
  return { de, ate }
}
const lim = (q: any, d = 20) => Math.min(200, Math.max(1, Number(qs(q.limite)) || d))

export function mountRelatorios(router: Router) {
  const guard = requireRole(...LEITURA)

  router.get('/relatorios/resumo', guard, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const agora = new Date()
    const [obras, ex, ativos, atrasados, reservas, multas, leitores, virtuais, repo] = await Promise.all([
      prisma.bibObra.count({ where: { tenantId, ativo: true } }),
      prisma.bibExemplar.groupBy({ by: ['status'], where: { tenantId }, _count: { _all: true } }),
      prisma.bibEmprestimo.count({ where: { tenantId, status: 'ATIVO' } }),
      prisma.bibEmprestimo.count({ where: { tenantId, status: 'ATIVO', dataPrevista: { lt: agora } } }),
      prisma.bibReserva.groupBy({ by: ['status'], where: { tenantId, status: { in: ['AGUARDANDO', 'DISPONIVEL'] } }, _count: { _all: true } }),
      prisma.bibMulta.aggregate({ where: { tenantId, status: { in: ['ABERTA', 'EM_COBRANCA'] } }, _sum: { valor: true }, _count: { _all: true } }),
      prisma.bibLeitor.count({ where: { tenantId, ativo: true } }),
      prisma.bibRecursoVirtual.count({ where: { tenantId, ativo: true } }),
      prisma.bibRepositorioItem.groupBy({ by: ['status'], where: { tenantId }, _count: { _all: true } }),
    ])
    res.json({
      obras, exemplaresPorStatus: Object.fromEntries(ex.map((x) => [x.status, x._count._all])), exemplaresTotal: ex.reduce((s, x) => s + x._count._all, 0),
      emprestimosAtivos: ativos, emprestimosAtrasados: atrasados, reservasPorStatus: Object.fromEntries(reservas.map((x) => [x.status, x._count._all])),
      multasEmAberto: { quantidade: multas._count._all, valor: round2(multas._sum.valor ?? 0) }, leitoresAtivos: leitores, recursosVirtuaisAtivos: virtuais,
      repositorioPorStatus: Object.fromEntries(repo.map((x) => [x.status, x._count._all])),
    })
  }))

  router.get('/relatorios/mais-emprestados', guard, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { de, ate } = periodo(req.query)
    const g = await prisma.bibEmprestimo.groupBy({ by: ['obraId'], where: { tenantId, dataEmprestimo: { gte: de, lte: ate } }, _count: { _all: true }, orderBy: { _count: { obraId: 'desc' } }, take: lim(req.query) })
    const obras = await prisma.bibObra.findMany({ where: { tenantId, id: { in: g.map((x) => x.obraId) } }, select: { id: true, titulo: true, autoresTexto: true, isbn: true } })
    res.json({ de, ate, itens: g.map((x) => ({ ...obras.find((o) => o.id === x.obraId), obraId: x.obraId, emprestimos: x._count._all })) })
  }))

  // obras com exemplares mas sem empréstimo no período (ociosas)
  router.get('/relatorios/ociosos', guard, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const dias = Math.max(30, Number(qs(req.query.dias)) || 365)
    const corte = new Date(Date.now() - dias * 86400000)
    const comUso = await prisma.bibEmprestimo.findMany({ where: { tenantId, dataEmprestimo: { gte: corte } }, select: { obraId: true }, distinct: ['obraId'] })
    const obras = await prisma.bibObra.findMany({
      where: { tenantId, ativo: true, createdAt: { lt: corte }, id: { notIn: comUso.map((x) => x.obraId) }, exemplares: { some: { status: { notIn: ['BAIXADO', 'EXTRAVIADO'] }, apenasConsulta: false } } },
      select: { id: true, titulo: true, autoresTexto: true, ano: true, _count: { select: { exemplares: true } } }, orderBy: { titulo: 'asc' }, take: lim(req.query, 100),
    })
    const vinc = await prisma.bibBibliografia.findMany({ where: { tenantId, obraId: { in: obras.map((o) => o.id) } }, select: { obraId: true } })
    res.json({ dias, total: obras.length, itens: obras.map((o) => ({ ...o, exemplares: o._count.exemplares, naBibliografia: vinc.some((v) => v.obraId === o.id) })) })
  }))

  router.get('/relatorios/giro', guard, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { de, ate } = periodo(req.query)
    const [emp, ex] = await Promise.all([
      prisma.bibEmprestimo.groupBy({ by: ['obraId'], where: { tenantId, dataEmprestimo: { gte: de, lte: ate } }, _count: { _all: true } }),
      prisma.bibExemplar.groupBy({ by: ['obraId'], where: { tenantId, status: { notIn: ['BAIXADO', 'EXTRAVIADO'] } }, _count: { _all: true } }),
    ])
    const totalEx = ex.reduce((s, x) => s + x._count._all, 0)
    const totalEmp = emp.reduce((s, x) => s + x._count._all, 0)
    const porObra = ex.map((x) => ({ obraId: x.obraId, exemplares: x._count._all, emprestimos: emp.find((e) => e.obraId === x.obraId)?._count._all ?? 0 })).map((x) => ({ ...x, giro: giroAcervo(x.emprestimos, x.exemplares) }))
    porObra.sort((a, b) => b.giro - a.giro)
    const ids = [...porObra.slice(0, lim(req.query, 20)), ...porObra.slice(-10)].map((x) => x.obraId)
    const obras = await prisma.bibObra.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, titulo: true } })
    const nome = (id: string) => obras.find((o) => o.id === id)?.titulo
    res.json({ de, ate, giroGeral: giroAcervo(totalEmp, totalEx), exemplares: totalEx, emprestimos: totalEmp, maiorGiro: porObra.slice(0, lim(req.query, 20)).map((x) => ({ ...x, titulo: nome(x.obraId) })), menorGiro: porObra.slice(-10).reverse().map((x) => ({ ...x, titulo: nome(x.obraId) })) })
  }))

  router.get('/relatorios/usuarios-ativos', guard, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { de, ate } = periodo(req.query)
    const g = await prisma.bibEmprestimo.groupBy({ by: ['leitorId'], where: { tenantId, dataEmprestimo: { gte: de, lte: ate } }, _count: { _all: true }, orderBy: { _count: { leitorId: 'desc' } } })
    const leitores = await prisma.bibLeitor.findMany({ where: { tenantId, id: { in: g.map((x) => x.leitorId) } }, select: { id: true, nome: true, perfil: true } })
    const porPerfil: Record<string, { usuarios: number; emprestimos: number }> = {}
    for (const x of g) {
      const p = leitores.find((l) => l.id === x.leitorId)?.perfil ?? 'DESCONHECIDO'
      porPerfil[p] ??= { usuarios: 0, emprestimos: 0 }
      porPerfil[p].usuarios++
      porPerfil[p].emprestimos += x._count._all
    }
    const cadastrados = await prisma.bibLeitor.count({ where: { tenantId, ativo: true } })
    res.json({
      de, ate, usuariosAtivos: g.length, leitoresCadastrados: cadastrados, taxaUtilizacao: cadastrados ? round2((g.length / cadastrados) * 100) : 0, porPerfil,
      ranking: g.slice(0, lim(req.query)).map((x) => ({ ...leitores.find((l) => l.id === x.leitorId), leitorId: x.leitorId, emprestimos: x._count._all })),
    })
  }))

  router.get('/relatorios/atrasos', guard, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const itens = await prisma.bibEmprestimo.findMany({
      where: { tenantId, status: 'ATIVO', dataPrevista: { lt: new Date() } }, orderBy: { dataPrevista: 'asc' }, take: 1000,
      include: { leitor: { select: { id: true, nome: true, perfil: true, email: true, telefone: true } }, exemplar: { select: { tombo: true, obra: { select: { titulo: true } } } } },
    })
    res.json({ total: itens.length, multaPrevistaTotal: round2(itens.reduce((s, e) => s + e.multaPrevista, 0)), itens })
  }))

  router.get('/relatorios/acervo-por-area', guard, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const obras = await prisma.bibObra.findMany({ where: { tenantId, ativo: true }, select: { id: true, cdd: true, _count: { select: { exemplares: true } } } })
    const areas: Record<string, { titulos: number; exemplares: number }> = {}
    for (const o of obras) {
      const k = o.cdd?.trim()[0] ?? 'S/CDD'
      areas[k] ??= { titulos: 0, exemplares: 0 }
      areas[k].titulos++
      areas[k].exemplares += o._count.exemplares
    }
    res.json(areas)
  }))

  router.get('/relatorios/virtual-uso', guard, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { de, ate } = periodo(req.query)
    const g = await prisma.bibAcessoVirtual.groupBy({ by: ['recursoId'], where: { tenantId, createdAt: { gte: de, lte: ate } }, _count: { _all: true }, orderBy: { _count: { recursoId: 'desc' } }, take: lim(req.query, 50) })
    const rec = await prisma.bibRecursoVirtual.findMany({ where: { tenantId }, select: { id: true, titulo: true, provedor: true, tipo: true, ativo: true } })
    const usuarios = await prisma.bibAcessoVirtual.findMany({ where: { tenantId, createdAt: { gte: de, lte: ate } }, select: { studentId: true, userId: true }, distinct: ['studentId', 'userId'] })
    const total = await prisma.bibAcessoVirtual.count({ where: { tenantId, createdAt: { gte: de, lte: ate } } })
    const semUso = rec.filter((r) => r.ativo && !g.some((x) => x.recursoId === r.id)).length
    const porProv: Record<string, number> = {}
    for (const x of g) { const p = rec.find((r) => r.id === x.recursoId)?.provedor ?? 'Sem provedor'; porProv[p] = (porProv[p] ?? 0) + x._count._all }
    res.json({ de, ate, totalAcessos: total, usuariosDistintos: usuarios.length, recursosSemUsoNoTopN: semUso, porProvedor: porProv, ranking: g.map((x) => ({ ...rec.find((r) => r.id === x.recursoId), recursoId: x.recursoId, acessos: x._count._all })) })
  }))

  router.get('/relatorios/repositorio', guard, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const [tipos, top] = await Promise.all([
      prisma.bibRepositorioItem.groupBy({ by: ['tipo', 'status'], where: { tenantId }, _count: { _all: true } }),
      prisma.bibRepositorioItem.findMany({ where: { tenantId, status: 'PUBLICADO' }, orderBy: { downloads: 'desc' }, take: 10, select: { id: true, handle: true, titulo: true, visualizacoes: true, downloads: true } }),
    ])
    res.json({ porTipoStatus: tipos.map((t) => ({ tipo: t.tipo, status: t.status, total: t._count._all })), maisBaixados: top })
  }))
}
