import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { mountCrud, parseBody, pageParams, qs } from '../core/crud'
import { audit } from '../core/notify'
import { BIB, LEITURA, MOD, USUARIOS, httpErr, optDate } from './common'
import {
  baixarMulta, cancelarReserva, devolver, emprestar, garantirLeitorAluno, garantirLeitorUsuario, getConfig, leitorDoUsuario,
  registrarPerda, renovar, reservar, situacaoLeitor,
} from './service'
import { posicaoNaFila, resumirInventario } from './logic'

const MULTA_ABERTA = ['ABERTA', 'EM_COBRANCA'] as const

export function mountCirculacao(router: Router) {
  // ---- configuração ----
  router.get('/config', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    res.json(await getConfig(getTenantId(req)))
  }))
  router.put('/config', requireRole(...BIB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(z.object({
      prefixoTombo: z.string().max(10).optional(), valorMultaDiaPadrao: z.coerce.number().min(0).optional(), valorMaxMultaAberta: z.coerce.number().min(0).optional(),
      diasTolerancia: z.coerce.number().int().min(0).max(30).optional(), considerarDiasUteis: z.boolean().optional(),
      feriados: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(), minTitulosBasicos: z.coerce.number().int().min(0).max(30).optional(),
      minTitulosComplementares: z.coerce.number().int().min(0).max(50).optional(), vagasPorExemplar: z.coerce.number().min(0.1).optional(),
      bibliotecarioNome: z.string().optional().nullable(), bibliotecarioCrb: z.string().optional().nullable(),
      proximoTombo: z.coerce.number().int().min(1).optional(),
    }), req.body)
    await getConfig(tenantId)
    const row = await prisma.bibConfig.update({ where: { tenantId }, data: b })
    await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'CONFIG', refType: 'BibConfig', refId: row.id })
    res.json(row)
  }))

  // ---- leitores ----
  router.post('/leitores/de-aluno/:studentId', requireRole(...BIB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    res.json(await garantirLeitorAluno(getTenantId(req), String(req.params.studentId)))
  }))
  router.post('/leitores/de-usuario/:userId', requireRole(...BIB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const perfil = qs(req.query.perfil)
    res.json(await garantirLeitorUsuario(getTenantId(req), String(req.params.userId), perfil && ['PROFESSOR', 'FUNCIONARIO'].includes(perfil) ? (perfil as any) : undefined))
  }))
  router.get('/leitores/:id/situacao', requireRole(...BIB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const l = await prisma.bibLeitor.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!l) return res.status(404).json({ error: 'Leitor não encontrado.' })
    res.json({ leitor: l, ...(await situacaoLeitor(tenantId, l as any)) })
  }))
  router.post('/leitores/:id/bloquear', requireRole(...BIB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(z.object({ ate: optDate, motivo: z.string().trim().min(3) }), req.body)
    const l = await prisma.bibLeitor.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!l) return res.status(404).json({ error: 'Leitor não encontrado.' })
    const r = await prisma.bibLeitor.update({ where: { id: l.id }, data: { bloqueadoAte: b.ate ?? new Date(Date.now() + 30 * 86400000), motivoBloqueio: b.motivo } })
    await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'BLOQUEAR_LEITOR', refType: 'BibLeitor', refId: l.id, detalhes: b })
    res.json(r)
  }))
  router.post('/leitores/:id/desbloquear', requireRole(...BIB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const l = await prisma.bibLeitor.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!l) return res.status(404).json({ error: 'Leitor não encontrado.' })
    const r = await prisma.bibLeitor.update({ where: { id: l.id }, data: { bloqueadoAte: null, motivoBloqueio: null } })
    await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'DESBLOQUEAR_LEITOR', refType: 'BibLeitor', refId: l.id })
    res.json(r)
  }))
  mountCrud(router, {
    model: 'bibLeitor', path: '/leitores', read: LEITURA, write: BIB, modulo: MOD,
    create: z.object({
      perfil: z.enum(['ALUNO', 'PROFESSOR', 'FUNCIONARIO', 'EXTERNO']), studentId: z.string().optional().nullable(), userId: z.string().optional().nullable(),
      nome: z.string().trim().min(2), documento: z.string().trim().optional().nullable(), email: z.string().email().optional().nullable(),
      telefone: z.string().optional().nullable(), validadeAte: optDate, ativo: z.boolean().optional(),
    }),
    search: ['nome', 'documento', 'email'], filters: ['perfil', 'ativo', 'studentId', 'userId'], orderBy: { nome: 'asc' },
    beforeCreate: async (d, req) => {
      const tenantId = getTenantId(req)
      if (d.perfil === 'ALUNO' && !d.studentId) throw httpErr(400, 'Leitor aluno exige studentId.')
      if (d.studentId && !(await prisma.student.findFirst({ where: { id: d.studentId, tenantId }, select: { id: true } }))) throw httpErr(404, 'Aluno não encontrado.')
      if (['PROFESSOR', 'FUNCIONARIO'].includes(d.perfil) && d.userId && !(await prisma.user.findFirst({ where: { id: d.userId, tenantId }, select: { id: true } }))) throw httpErr(404, 'Usuário não encontrado.')
      if (d.studentId && (await prisma.bibLeitor.count({ where: { tenantId, studentId: d.studentId } }))) throw httpErr(409, 'Já existe leitor para este aluno.')
      if (d.userId && (await prisma.bibLeitor.count({ where: { tenantId, userId: d.userId } }))) throw httpErr(409, 'Já existe leitor para este usuário.')
      return d
    },
  })

  // ---- empréstimos (balcão) ----
  router.post('/emprestimos', requireRole(...BIB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const b = parseBody(z.object({ leitorId: z.string().min(1), exemplarId: z.string().optional(), tombo: z.string().optional(), forcar: z.boolean().optional(), observacoes: z.string().optional() }), req.body)
    const tenantId = getTenantId(req)
    if (b.forcar && !['ADMIN', 'OWNER', 'RECTOR', 'BOARD', 'LIBRARIAN'].includes(String(req.user?.role))) throw httpErr(403, 'Sem permissão para forçar empréstimo.')
    const emp = await emprestar({ tenantId, ...b, operadorId: getUserId(req) })
    res.status(201).json(emp)
  }))
  router.post('/emprestimos/devolver', requireRole(...BIB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const b = parseBody(z.object({ exemplarId: z.string().optional(), tombo: z.string().optional(), danificado: z.boolean().optional(), valorDano: z.coerce.number().min(0).optional(), observacoes: z.string().optional(), dataDevolucao: optDate }), req.body)
    res.json(await devolver({ tenantId: getTenantId(req), ...b, operadorId: getUserId(req) }))
  }))
  router.get('/emprestimos', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    for (const k of ['status', 'leitorId', 'obraId', 'exemplarId']) if (qs(req.query[k])) where[k] = qs(req.query[k])
    if (qs(req.query.atrasados) === 'true') { where.status = 'ATIVO'; where.dataPrevista = { lt: new Date() } }
    if (qs(req.query.venceEmDias)) where.dataPrevista = { gte: new Date(), lte: new Date(Date.now() + Number(qs(req.query.venceEmDias)) * 86400000) }
    const [items, total] = await Promise.all([
      prisma.bibEmprestimo.findMany({ where, include: { leitor: { select: { id: true, nome: true, perfil: true } }, exemplar: { select: { tombo: true, obra: { select: { titulo: true } } } } }, orderBy: { dataEmprestimo: 'desc' }, skip, take }),
      prisma.bibEmprestimo.count({ where }),
    ])
    res.json({ items, total, page, pageSize })
  }))
  router.get('/emprestimos/:id', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const e = await prisma.bibEmprestimo.findFirst({ where: { id: String(req.params.id), tenantId: getTenantId(req) }, include: { leitor: true, exemplar: { include: { obra: true } } } })
    if (!e) return res.status(404).json({ error: 'Empréstimo não encontrado.' })
    res.json(e)
  }))
  router.post('/emprestimos/:id/renovar', requireRole(...BIB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    res.json(await renovar({ tenantId: getTenantId(req), emprestimoId: String(req.params.id), operadorId: getUserId(req) }))
  }))
  router.post('/emprestimos/:id/perdido', requireRole(...BIB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const b = parseBody(z.object({ valor: z.coerce.number().min(0).optional() }), req.body ?? {})
    res.json(await registrarPerda({ tenantId: getTenantId(req), emprestimoId: String(req.params.id), valor: b.valor, operadorId: getUserId(req) }))
  }))

  // ---- reservas ----
  router.post('/reservas', requireRole(...BIB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const b = parseBody(z.object({ leitorId: z.string(), obraId: z.string() }), req.body)
    res.status(201).json(await reservar({ tenantId: getTenantId(req), ...b, operadorId: getUserId(req) }))
  }))
  router.get('/reservas', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    for (const k of ['status', 'leitorId', 'obraId']) if (qs(req.query[k])) where[k] = qs(req.query[k])
    const [items, total] = await Promise.all([
      prisma.bibReserva.findMany({ where, include: { leitor: { select: { id: true, nome: true, perfil: true } }, obra: { select: { id: true, titulo: true } } }, orderBy: { createdAt: 'asc' }, skip, take }),
      prisma.bibReserva.count({ where }),
    ])
    res.json({ items, total, page, pageSize })
  }))
  router.post('/reservas/:id/cancelar', requireRole(...BIB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    res.json(await cancelarReserva(getTenantId(req), String(req.params.id), getUserId(req)))
  }))

  // ---- multas ----
  router.get('/multas', requireRole(...BIB, 'FINANCE'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    for (const k of ['status', 'leitorId', 'tipo']) if (qs(req.query[k])) where[k] = qs(req.query[k])
    const [items, total, soma] = await Promise.all([
      prisma.bibMulta.findMany({ where, include: { leitor: { select: { id: true, nome: true, perfil: true, studentId: true } } }, orderBy: { createdAt: 'desc' }, skip, take }),
      prisma.bibMulta.count({ where }),
      prisma.bibMulta.aggregate({ where: { ...where, status: { in: [...MULTA_ABERTA] } }, _sum: { valor: true } }),
    ])
    res.json({ items, total, page, pageSize, totalEmAberto: soma._sum.valor ?? 0 })
  }))
  router.post('/multas', requireRole(...BIB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(z.object({ leitorId: z.string(), tipo: z.enum(['DANO', 'EXTRAVIO', 'ATRASO']).default('DANO'), valor: z.coerce.number().positive(), descricao: z.string().trim().min(3), emprestimoId: z.string().optional() }), req.body)
    if (!(await prisma.bibLeitor.findFirst({ where: { id: b.leitorId, tenantId }, select: { id: true } }))) throw httpErr(404, 'Leitor não encontrado.')
    const m = await prisma.bibMulta.create({ data: { ...b, tenantId } })
    await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'CRIAR_MULTA', refType: 'BibMulta', refId: m.id })
    res.status(201).json(m)
  }))
  router.post('/multas/:id/baixar', requireRole(...BIB, 'FINANCE'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const b = parseBody(z.object({ acao: z.enum(['PAGAR', 'ISENTAR', 'CANCELAR', 'COBRAR']).default('PAGAR'), forma: z.string().optional(), justificativa: z.string().optional(), vencimento: optDate }), req.body ?? {})
    res.json(await baixarMulta({ tenantId: getTenantId(req), multaId: String(req.params.id), operadorId: getUserId(req), ...b }))
  }))

  // ---- autosserviço do usuário logado (aluno/professor/funcionário) ----
  router.get('/meus/resumo', requireRole(...USUARIOS), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const leitor = await leitorDoUsuario(tenantId, req.user as any)
    const [sit, emprestimos, reservas, multas] = await Promise.all([
      situacaoLeitor(tenantId, leitor as any),
      prisma.bibEmprestimo.findMany({ where: { tenantId, leitorId: leitor.id, status: 'ATIVO' }, include: { exemplar: { select: { tombo: true, obra: { select: { id: true, titulo: true, autores: true } } } } }, orderBy: { dataPrevista: 'asc' } }),
      prisma.bibReserva.findMany({ where: { tenantId, leitorId: leitor.id, status: { in: ['AGUARDANDO', 'DISPONIVEL'] } }, include: { obra: { select: { id: true, titulo: true } } } }),
      prisma.bibMulta.findMany({ where: { tenantId, leitorId: leitor.id, status: { in: [...MULTA_ABERTA] } } }),
    ])
    const filas = await Promise.all(reservas.map(async (r) => {
      const fila = await prisma.bibReserva.findMany({ where: { tenantId, obraId: r.obraId, status: 'AGUARDANDO' }, select: { id: true, createdAt: true } })
      return { ...r, posicaoFila: r.status === 'AGUARDANDO' ? posicaoNaFila(fila, r.id) : 0 }
    }))
    res.json({ leitor: { id: leitor.id, nome: leitor.nome, perfil: leitor.perfil }, politica: sit.politica, podeEmprestar: sit.podeEmprestar, motivosBloqueio: sit.motivosBloqueio, emprestimos, reservas: filas, multas })
  }))
  router.post('/meus/renovar/:id', requireRole(...USUARIOS), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const leitor = await leitorDoUsuario(tenantId, req.user as any)
    res.json(await renovar({ tenantId, emprestimoId: String(req.params.id), operadorId: getUserId(req), leitorId: leitor.id }))
  }))
  router.post('/meus/reservar', requireRole(...USUARIOS), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(z.object({ obraId: z.string() }), req.body)
    const leitor = await leitorDoUsuario(tenantId, req.user as any)
    res.status(201).json(await reservar({ tenantId, leitorId: leitor.id, obraId: b.obraId, operadorId: getUserId(req) }))
  }))
  router.post('/meus/reservas/:id/cancelar', requireRole(...USUARIOS), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const leitor = await leitorDoUsuario(tenantId, req.user as any)
    res.json(await cancelarReserva(tenantId, String(req.params.id), getUserId(req), leitor.id))
  }))

  // ---- inventário ----
  mountInventario(router)
}

function mountInventario(router: Router) {
  router.post('/inventarios', requireRole(...BIB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(z.object({ nome: z.string().trim().min(3), spaceId: z.string().optional(), estante: z.string().optional() }), req.body)
    if (b.spaceId && !(await prisma.eduSpace.findFirst({ where: { id: b.spaceId, tenantId }, select: { id: true } }))) throw httpErr(400, 'Espaço não encontrado.')
    if (await prisma.bibInventario.count({ where: { tenantId, status: 'ABERTO', spaceId: b.spaceId ?? null, estante: b.estante ?? null } })) throw httpErr(409, 'Já existe inventário aberto para este escopo.')
    const exemplares = await prisma.bibExemplar.findMany({
      where: { tenantId, status: { notIn: ['BAIXADO', 'EXTRAVIADO'] }, ...(b.spaceId ? { spaceId: b.spaceId } : {}), ...(b.estante ? { estante: b.estante } : {}) },
      select: { id: true, tombo: true, status: true },
    })
    const inv = await prisma.bibInventario.create({ data: { tenantId, ...b, responsavelId: getUserId(req), totalEsperado: exemplares.length } })
    if (exemplares.length)
      await prisma.bibInventarioItem.createMany({
        data: exemplares.map((e) => ({ tenantId, inventarioId: inv.id, exemplarId: e.id, tombo: e.tombo, situacao: e.status === 'EMPRESTADO' ? 'EMPRESTADO' as const : 'PENDENTE' as const })),
      })
    await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'ABRIR_INVENTARIO', refType: 'BibInventario', refId: inv.id, detalhes: { esperado: exemplares.length } })
    res.status(201).json(inv)
  }))
  router.get('/inventarios', requireRole(...BIB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId, ...(qs(req.query.status) ? { status: qs(req.query.status) } : {}) }
    const [items, total] = await Promise.all([prisma.bibInventario.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }), prisma.bibInventario.count({ where })])
    res.json({ items, total, page, pageSize })
  }))
  router.get('/inventarios/:id', requireRole(...BIB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const inv = await prisma.bibInventario.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!inv) return res.status(404).json({ error: 'Inventário não encontrado.' })
    const sit = qs(req.query.situacao)
    const itens = await prisma.bibInventarioItem.findMany({ where: { inventarioId: inv.id, ...(sit ? { situacao: sit as any } : {}) }, orderBy: { tombo: 'asc' }, take: 5000 })
    const todos = sit ? await prisma.bibInventarioItem.findMany({ where: { inventarioId: inv.id }, select: { situacao: true } }) : itens
    res.json({ inventario: inv, resumo: resumirInventario(todos), itens })
  }))
  // leitura de tombos (lote) — marca conferidos e detecta divergências de local
  router.post('/inventarios/:id/leituras', requireRole(...BIB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(z.object({ tombos: z.array(z.string().trim().min(1)).min(1).max(1000), local: z.string().optional() }), req.body)
    const inv = await prisma.bibInventario.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!inv) return res.status(404).json({ error: 'Inventário não encontrado.' })
    if (inv.status !== 'ABERTO') throw httpErr(409, 'Inventário não está aberto.')
    const out = { conferidos: 0, repetidos: 0, foraDoEscopo: [] as string[], naoCadastrados: [] as string[], localDivergente: [] as string[] }
    const agora = new Date()
    for (const leitura of [...new Set(b.tombos)]) {
      const item = await prisma.bibInventarioItem.findFirst({ where: { inventarioId: inv.id, OR: [{ tombo: leitura }] } })
      if (item) {
        if (item.situacao === 'CONFERIDO') { out.repetidos++; continue }
        await prisma.bibInventarioItem.update({ where: { id: item.id }, data: { situacao: 'CONFERIDO', conferidoEm: agora, localLido: b.local ?? null } })
        out.conferidos++
        continue
      }
      // não esperado neste escopo: pelo código de barras ou tombo existente em outro local
      const ex = await prisma.bibExemplar.findFirst({ where: { tenantId, OR: [{ tombo: leitura }, { codigoBarras: leitura }] } })
      if (!ex) { out.naoCadastrados.push(leitura); continue }
      if (ex.status === 'BAIXADO' || ex.status === 'EXTRAVIADO') {
        out.foraDoEscopo.push(`${ex.tombo} (${ex.status}: reaparecido)`)
      }
      const existente = await prisma.bibInventarioItem.findFirst({ where: { inventarioId: inv.id, tombo: ex.tombo } })
      if (existente) { if (existente.situacao !== 'CONFERIDO') { await prisma.bibInventarioItem.update({ where: { id: existente.id }, data: { situacao: 'CONFERIDO', conferidoEm: agora, localLido: b.local ?? null } }); out.conferidos++ } else out.repetidos++; continue }
      await prisma.bibInventarioItem.create({ data: { tenantId, inventarioId: inv.id, exemplarId: ex.id, tombo: ex.tombo, situacao: 'LOCAL_DIVERGENTE', localLido: b.local ?? null, conferidoEm: agora, observacao: `Cadastrado em ${ex.estante ?? ex.spaceId ?? 'outro local'}` } })
      out.localDivergente.push(ex.tombo)
    }
    res.json(out)
  }))
  router.post('/inventarios/:id/concluir', requireRole(...BIB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(z.object({ marcarExtraviados: z.boolean().default(false) }), req.body ?? {})
    const inv = await prisma.bibInventario.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!inv) return res.status(404).json({ error: 'Inventário não encontrado.' })
    if (inv.status !== 'ABERTO') throw httpErr(409, 'Inventário não está aberto.')
    const pend = await prisma.bibInventarioItem.findMany({ where: { inventarioId: inv.id, situacao: 'PENDENTE' } })
    await prisma.bibInventarioItem.updateMany({ where: { inventarioId: inv.id, situacao: 'PENDENTE' }, data: { situacao: 'NAO_ENCONTRADO' } })
    if (b.marcarExtraviados) {
      const ids = pend.map((p) => p.exemplarId).filter(Boolean) as string[]
      await prisma.bibExemplar.updateMany({ where: { tenantId, id: { in: ids }, status: 'DISPONIVEL' }, data: { status: 'EXTRAVIADO', baixaMotivo: 'INVENTARIO', baixaEm: new Date(), baixaPorId: getUserId(req) } })
    }
    const todos = await prisma.bibInventarioItem.findMany({ where: { inventarioId: inv.id }, select: { situacao: true } })
    const resumo = resumirInventario(todos)
    const upd = await prisma.bibInventario.update({ where: { id: inv.id }, data: { status: 'CONCLUIDO', concluidoEm: new Date(), resumo: resumo as any } })
    await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'CONCLUIR_INVENTARIO', refType: 'BibInventario', refId: inv.id, detalhes: resumo })
    res.json({ inventario: upd, resumo })
  }))
  router.post('/inventarios/:id/cancelar', requireRole(...BIB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const inv = await prisma.bibInventario.findFirst({ where: { id: String(req.params.id), tenantId, status: 'ABERTO' } })
    if (!inv) return res.status(404).json({ error: 'Inventário aberto não encontrado.' })
    res.json(await prisma.bibInventario.update({ where: { id: inv.id }, data: { status: 'CANCELADO', concluidoEm: new Date() } }))
  }))
}
