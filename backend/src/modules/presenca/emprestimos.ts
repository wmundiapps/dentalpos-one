import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AcademicRole, AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { mountCrud, pageParams, parseBody, qs } from '../core/crud'
import { audit } from '../core/notify'
import { devolver as devolverLivro, emprestar as emprestarLivro, garantirLeitorAluno, garantirLeitorUsuario } from '../biblioteca/service'
import { espacoDoTenant } from './chamada'
import { HORA, DIA, calcularMultaItem, diasDeAtraso, parsePessoaKey } from './logic'
import { GESTAO, MOD, OPERADORES, PessoaInfo, alertar, ehSuper, exigirPessoa, getConfig, httpErr, infoPessoas, pessoaDoUsuario, resolverPessoaPorMetodo } from './servico'

const ACERVO: AcademicRole[] = ['LIBRARIAN', 'FACILITIES', 'COORDINATOR', 'SECRETARY']
const ESTADOS = ['OTIMO', 'BOM', 'REGULAR', 'DANIFICADO'] as const

/** Situação da pessoa para empréstimo de itens: bloqueios, multas, atrasos e limite. */
export async function situacaoPessoa(tenantId: string, key: string) {
  const cfg = await getConfig(tenantId)
  const agora = new Date()
  const [bloqueios, multas, ativos] = await Promise.all([
    prisma.preBloqueio.findMany({ where: { tenantId, pessoaKey: key, ativo: true, OR: [{ ate: null }, { ate: { gt: agora } }] } }),
    prisma.preMulta.findMany({ where: { tenantId, pessoaKey: key, status: 'ABERTA' } }),
    prisma.preEmprestimo.findMany({ where: { tenantId, pessoaKey: key, status: 'ATIVO' } }),
  ])
  const atrasados = ativos.filter((e) => e.previstaEm < agora)
  const motivos: string[] = []
  for (const b of bloqueios) motivos.push(`Bloqueio: ${b.motivo}`)
  if (multas.length) motivos.push(`Multa em aberto (R$ ${multas.reduce((s, m) => s + m.valor, 0).toFixed(2)}).`)
  if (atrasados.length) motivos.push(`${atrasados.length} item(ns) com devolução em atraso.`)
  if (ativos.length >= cfg.emprestimoMaxSimultaneos) motivos.push(`Limite de ${cfg.emprestimoMaxSimultaneos} empréstimos simultâneos atingido.`)
  return { podeEmprestar: motivos.length === 0, motivos, ativos: ativos.length, atrasados: atrasados.length, multasAbertas: multas.length, valorMultas: multas.reduce((s, m) => s + m.valor, 0), limite: cfg.emprestimoMaxSimultaneos }
}

async function localizarCodigo(tenantId: string, codigo: string) {
  const c = codigo.trim()
  if (!c) throw httpErr(400, 'Informe o código do item.')
  const item = await prisma.preItem.findFirst({ where: { tenantId, codigo: c } })
  if (item) return { tipo: 'ITEM' as const, item }
  const ex = await prisma.bibExemplar.findFirst({ where: { tenantId, OR: [{ tombo: c }, { codigoBarras: c }] }, include: { obra: { select: { titulo: true } } } })
  if (ex) return { tipo: 'LIVRO' as const, exemplar: ex }
  throw httpErr(404, 'Item não encontrado (nem equipamento/material, nem exemplar do acervo).')
}

const statusBem = async (tenantId: string, bemId: string | null, status: 'EMPRESTADO' | 'ATIVO' | 'EM_MANUTENCAO') => { if (bemId) await prisma.infBem.updateMany({ where: { id: bemId, tenantId, status: { not: 'BAIXADO' } }, data: { status } }) }

/** Passa a vez para o primeiro da fila de reservas do item (item fica RESERVADO por 24 h). */
export async function atribuirFilaItem(tenantId: string, itemId: string): Promise<boolean> {
  const prox = await prisma.preReservaItem.findFirst({ where: { tenantId, itemId, status: 'AGUARDANDO' }, orderBy: { createdAt: 'asc' } })
  if (!prox) return false
  await prisma.preReservaItem.update({ where: { id: prox.id }, data: { status: 'DISPONIVEL', expiraEm: new Date(Date.now() + DIA) } })
  await prisma.preItem.updateMany({ where: { id: itemId, tenantId, status: 'DISPONIVEL' }, data: { status: 'RESERVADO' } })
  return true
}

export interface RetiradaIn { tenantId: string; pessoa: PessoaInfo; codigo: string; metodo: string; prazoHoras?: number; estado?: string; observacoes?: string; operadorId?: string }

export async function retirar(p: RetiradaIn) {
  const { tenantId, pessoa } = p
  const alvo = await localizarCodigo(tenantId, p.codigo)
  if (alvo.tipo === 'LIVRO') {
    const leitor = pessoa.studentId ? await garantirLeitorAluno(tenantId, pessoa.studentId) : await garantirLeitorUsuario(tenantId, pessoa.userId!)
    const emp = await emprestarLivro({ tenantId, leitorId: leitor.id, exemplarId: alvo.exemplar.id, operadorId: p.operadorId, observacoes: p.observacoes })
    return { tipo: 'LIVRO', titulo: alvo.exemplar.obra.titulo, emprestimo: emp, pessoa: { pessoaKey: pessoa.pessoaKey, nome: pessoa.nome } }
  }
  const item = alvo.item
  if (!item.ativo) throw httpErr(409, 'Item inativo.')
  const sit = await situacaoPessoa(tenantId, pessoa.pessoaKey)
  if (!sit.podeEmprestar) throw Object.assign(httpErr(409, `Empréstimo bloqueado: ${sit.motivos.join(' ')}`, 'BLOQUEADO'), { motivos: sit.motivos })
  const reserva = await prisma.preReservaItem.findFirst({ where: { tenantId, itemId: item.id, pessoaKey: pessoa.pessoaKey, status: 'DISPONIVEL', expiraEm: { gt: new Date() } } })
  if (item.status === 'RESERVADO' && !reserva) throw httpErr(409, 'Item reservado para outra pessoa (fila de reservas).', 'RESERVADO')
  if (item.status !== 'DISPONIVEL' && item.status !== 'RESERVADO') throw httpErr(409, `Item indisponível (${item.status}).`, 'INDISPONIVEL')
  if (p.estado && !(ESTADOS as readonly string[]).includes(p.estado)) throw httpErr(400, 'Estado inválido.')
  const horas = Math.min(Math.max(p.prazoHoras ?? item.prazoPadraoHoras, 1), 24 * 60)
  const agora = new Date()
  const emp = await prisma.$transaction(async (tx) => {
    const claim = await tx.preItem.updateMany({ where: { id: item.id, tenantId, status: item.status }, data: { status: 'EMPRESTADO' } })
    if (claim.count === 0) throw httpErr(409, 'Item acabou de ser retirado por outra operação.')
    if (reserva) await tx.preReservaItem.update({ where: { id: reserva.id }, data: { status: 'ATENDIDA', concluidaEm: agora } })
    return tx.preEmprestimo.create({ data: { tenantId, itemId: item.id, pessoaKey: pessoa.pessoaKey, studentId: pessoa.studentId, userId: pessoa.userId, retiradaEm: agora, previstaEm: new Date(agora.getTime() + horas * HORA), metodoRetirada: p.metodo, estadoRetirada: p.estado, observacoes: p.observacoes, operadorId: p.operadorId } })
  })
  await statusBem(tenantId, item.bemId, 'EMPRESTADO')
  await audit({ tenantId, userId: p.operadorId, modulo: MOD, acao: 'RETIRADA_ITEM', refType: 'PreEmprestimo', refId: emp.id, detalhes: { item: item.codigo, pessoaKey: pessoa.pessoaKey, metodo: p.metodo } })
  return { tipo: 'ITEM', titulo: item.descricao, item, emprestimo: emp, pessoa: { pessoaKey: pessoa.pessoaKey, nome: pessoa.nome } }
}

export async function devolverCodigo(p: { tenantId: string; codigo: string; metodo: string; estado?: string; observacoes?: string; operadorId?: string }) {
  const { tenantId } = p
  const alvo = await localizarCodigo(tenantId, p.codigo)
  if (alvo.tipo === 'LIVRO') {
    const r = await devolverLivro({ tenantId, exemplarId: alvo.exemplar.id, operadorId: p.operadorId, danificado: p.estado === 'DANIFICADO', observacoes: p.observacoes })
    return { tipo: 'LIVRO', titulo: alvo.exemplar.obra.titulo, resultado: r }
  }
  const item = alvo.item
  const emp = await prisma.preEmprestimo.findFirst({ where: { tenantId, itemId: item.id, status: 'ATIVO' } })
  if (!emp) throw httpErr(409, 'Este item não possui empréstimo ativo.')
  if (p.estado && !(ESTADOS as readonly string[]).includes(p.estado)) throw httpErr(400, 'Estado inválido.')
  const cfg = await getConfig(tenantId)
  const agora = new Date()
  const dias = diasDeAtraso(emp.previstaEm, agora)
  const valor = calcularMultaItem(dias, cfg.multaDiaItem, cfg.multaMaximaItem)
  const danificado = p.estado === 'DANIFICADO'
  const upd = await prisma.$transaction(async (tx) => {
    const done = await tx.preEmprestimo.updateMany({ where: { id: emp.id, status: 'ATIVO' }, data: { status: 'DEVOLVIDO', devolucaoEm: agora, diasAtraso: dias, metodoDevolucao: p.metodo, estadoDevolucao: p.estado, devolvidoPorId: p.operadorId, observacoes: p.observacoes ?? emp.observacoes } })
    if (done.count === 0) throw httpErr(409, 'Empréstimo já devolvido.')
    await tx.preItem.update({ where: { id: item.id }, data: { status: danificado ? 'MANUTENCAO' : 'DISPONIVEL' } })
    if (valor > 0) await tx.preMulta.create({ data: { tenantId, emprestimoId: emp.id, pessoaKey: emp.pessoaKey, studentId: emp.studentId, userId: emp.userId, valor, diasAtraso: dias, motivo: `Atraso de ${dias} dia(s) na devolução de ${item.descricao}` } })
    return tx.preEmprestimo.findUnique({ where: { id: emp.id } })
  })
  let bloqueado = false
  if (dias >= cfg.bloqueioAposAtrasoDias) {
    bloqueado = true
    await prisma.preBloqueio.create({ data: { tenantId, pessoaKey: emp.pessoaKey, motivo: `Devolução com ${dias} dias de atraso (${item.descricao})`, ate: new Date(agora.getTime() + dias * DIA), origem: 'AUTOMATICO' } })
  }
  await statusBem(tenantId, item.bemId, danificado ? 'EM_MANUTENCAO' : 'ATIVO')
  if (danificado) await alertar({ tenantId, tipo: 'DIVERGENCIA', severidade: 'ATENCAO', mensagem: `Item ${item.codigo} (${item.descricao}) devolvido danificado e enviado para manutenção.`, dedupeKey: `dano:${emp.id}` })
  else await atribuirFilaItem(tenantId, item.id)
  await audit({ tenantId, userId: p.operadorId, modulo: MOD, acao: 'DEVOLUCAO_ITEM', refType: 'PreEmprestimo', refId: emp.id, detalhes: { item: item.codigo, dias, multa: valor, estado: p.estado } })
  const info = (await infoPessoas(tenantId, [emp.pessoaKey])).get(emp.pessoaKey)
  return { tipo: 'ITEM', titulo: item.descricao, emprestimo: upd, multa: valor > 0 ? { valor, diasAtraso: dias } : null, bloqueado, pessoa: info ? { pessoaKey: info.pessoaKey, nome: info.nome } : null }
}

export async function jobEmprestimos() {
  const agora = new Date()
  const atrasados = await prisma.preEmprestimo.findMany({ where: { status: 'ATIVO', previstaEm: { lt: agora } }, take: 1000 })
  for (const e of atrasados) {
    const dias = diasDeAtraso(e.previstaEm, agora)
    await prisma.preEmprestimo.update({ where: { id: e.id }, data: { diasAtraso: dias } })
    await alertar({ tenantId: e.tenantId, tipo: 'ATRASO_DEVOLUCAO', severidade: dias >= 3 ? 'CRITICO' : 'ATENCAO', pessoaKey: e.pessoaKey, mensagem: `Devolução em atraso (${dias} dia(s)): empréstimo ${e.id.slice(0, 8)}.`, dedupeKey: `atraso:${e.id}`, dedupeMin: 1440 })
  }
  const vencidas = await prisma.preReservaItem.findMany({ where: { status: 'DISPONIVEL', expiraEm: { lt: agora } }, take: 500 })
  for (const r of vencidas) {
    await prisma.preReservaItem.update({ where: { id: r.id }, data: { status: 'EXPIRADA', concluidaEm: agora } })
    await prisma.preItem.updateMany({ where: { id: r.itemId, tenantId: r.tenantId, status: 'RESERVADO' }, data: { status: 'DISPONIVEL' } })
    await atribuirFilaItem(r.tenantId, r.itemId)
  }
  return { atrasados: atrasados.length, reservasExpiradas: vencidas.length }
}

const idCodigo = z.string().trim().min(1).max(120)
const metodoSchema = z.enum(['FACIAL', 'QR', 'CODIGO', 'MANUAL'])

export function mountEmprestimos(router: Router) {
  const operador = requireRole(...OPERADORES)
  const acervo = requireRole(...ACERVO)

  mountCrud(router, {
    model: 'preItem', path: '/itens', read: OPERADORES, write: ACERVO, modulo: MOD, removeMode: 'soft', search: ['codigo', 'descricao'], filters: ['categoria', 'setor', 'status', 'spaceId', 'ativo'], orderBy: { descricao: 'asc' },
    create: z.object({
      codigo: z.string().trim().min(2).max(60), descricao: z.string().trim().min(2).max(200), categoria: z.enum(['EQUIPAMENTO', 'MATERIAL', 'AUDIOVISUAL', 'LABORATORIO', 'OUTRO']).default('EQUIPAMENTO'),
      setor: z.enum(['BIBLIOTECA', 'LABORATORIO', 'AUDIOVISUAL', 'OUTRO']).default('LABORATORIO'), bemId: z.string().max(60).optional().nullable(), spaceId: z.string().max(60).optional().nullable(),
      prazoPadraoHoras: z.coerce.number().int().min(1).max(24 * 60).default(24), maxRenovacoes: z.coerce.number().int().min(0).max(10).default(1), exigeTermo: z.boolean().optional(), observacoes: z.string().max(500).optional().nullable(),
      status: z.enum(['DISPONIVEL', 'MANUTENCAO', 'BAIXADO']).optional(), ativo: z.boolean().optional(),
    }),
    beforeCreate: async (d, req) => { const t = getTenantId(req); if (d.spaceId) await espacoDoTenant(t, d.spaceId); if (d.bemId) await bemDoTenant(t, d.bemId); return d },
    beforeUpdate: async (d, req) => { const t = getTenantId(req); if (d.spaceId) await espacoDoTenant(t, d.spaceId); if (d.bemId) await bemDoTenant(t, d.bemId); if (d.status === 'EMPRESTADO') throw httpErr(400, 'Status EMPRESTADO só muda por retirada.'); return d },
  })
  router.post('/itens/de-bem/:bemId', acervo, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const bem = await bemDoTenant(tenantId, String(req.params.bemId))
    const ja = await prisma.preItem.findFirst({ where: { tenantId, bemId: bem.id } })
    if (ja) return res.json({ ...ja, jaExistia: true })
    const b = parseBody(z.object({ setor: z.enum(['BIBLIOTECA', 'LABORATORIO', 'AUDIOVISUAL', 'OUTRO']).default('AUDIOVISUAL'), categoria: z.enum(['EQUIPAMENTO', 'MATERIAL', 'AUDIOVISUAL', 'LABORATORIO', 'OUTRO']).default('EQUIPAMENTO'), prazoPadraoHoras: z.coerce.number().int().min(1).max(1440).default(24) }), req.body ?? {})
    const item = await prisma.preItem.create({ data: { tenantId, codigo: bem.tombamento, descricao: bem.descricao, bemId: bem.id, spaceId: bem.spaceId, ...b, status: bem.status === 'ATIVO' ? 'DISPONIVEL' : bem.status === 'EMPRESTADO' ? 'EMPRESTADO' : 'MANUTENCAO' } })
    await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'ITEM_DE_PATRIMONIO', refType: 'PreItem', refId: item.id, detalhes: { tombamento: bem.tombamento } })
    res.status(201).json({ ...item, jaExistia: false })
  }))
  router.get('/itens/lookup/:codigo', operador, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const a = await localizarCodigo(tenantId, String(req.params.codigo))
    if (a.tipo === 'LIVRO') return res.json({ tipo: 'LIVRO', codigo: a.exemplar.tombo, titulo: a.exemplar.obra.titulo, status: a.exemplar.status })
    const emp = await prisma.preEmprestimo.findFirst({ where: { tenantId, itemId: a.item.id, status: 'ATIVO' } })
    const info = emp ? (await infoPessoas(tenantId, [emp.pessoaKey])).get(emp.pessoaKey) : null
    res.json({ tipo: 'ITEM', item: a.item, emprestimoAtivo: emp ? { id: emp.id, previstaEm: emp.previstaEm, pessoa: info?.nome ?? null, atrasado: emp.previstaEm < new Date() } : null })
  }))

  // ---- retirada / devolução / renovação
  router.get('/pessoas/:key/emprestimos-situacao', operador, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const p = await exigirPessoa(tenantId, String(req.params.key))
    res.json({ pessoa: { pessoaKey: p.pessoaKey, nome: p.nome }, ...(await situacaoPessoa(tenantId, p.pessoaKey)) })
  }))
  router.post('/emprestimos/retirar', operador, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(z.object({
      metodo: metodoSchema, codigo: idCodigo, embedding: z.array(z.number()).length(128).optional(), liveness: z.object({ nonce: z.string().max(80) }).passthrough().optional(),
      credencial: z.string().max(120).optional(), pessoaKey: z.string().max(80).optional(), dispositivoId: z.string().max(60).optional(),
      prazoHoras: z.coerce.number().int().min(1).max(1440).optional(), estado: z.string().max(20).optional(), observacoes: z.string().max(500).optional(),
    }), req.body)
    const { pessoa } = await resolverPessoaPorMetodo({ tenantId, metodo: b.metodo, embedding: b.embedding, liveness: b.liveness, credencial: b.credencial, pessoaKey: b.pessoaKey, dispositivoId: b.dispositivoId, operadorId: getUserId(req), finalidade: 'EMPRESTIMO' })
    if (!pessoa.ativo) throw httpErr(409, 'Cadastro inativo ou desligado.')
    res.status(201).json(await retirar({ tenantId, pessoa, codigo: b.codigo, metodo: b.metodo, prazoHoras: b.prazoHoras, estado: b.estado, observacoes: b.observacoes, operadorId: getUserId(req) }))
  }))
  router.post('/emprestimos/devolver', operador, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const b = parseBody(z.object({ codigo: idCodigo, metodo: metodoSchema.default('QR'), estado: z.string().max(20).optional(), observacoes: z.string().max(500).optional() }), req.body)
    res.json(await devolverCodigo({ tenantId: getTenantId(req), ...b, operadorId: getUserId(req) }))
  }))
  const renovarEmp = async (tenantId: string, id: string, quem: { pessoaKey?: string; operadorId?: string }) => {
    const e = await prisma.preEmprestimo.findFirst({ where: { id, tenantId, status: 'ATIVO' } })
    if (!e || (quem.pessoaKey && e.pessoaKey !== quem.pessoaKey)) throw httpErr(404, 'Empréstimo ativo não encontrado.')
    const item = await prisma.preItem.findFirst({ where: { id: e.itemId, tenantId } })
    if (!item) throw httpErr(404, 'Item não encontrado.')
    if (e.previstaEm < new Date()) throw httpErr(409, 'Empréstimo em atraso: devolva o item.', 'ATRASADO')
    if (e.renovacoes >= item.maxRenovacoes) throw httpErr(409, `Limite de renovações atingido (${item.maxRenovacoes}).`, 'LIMITE_RENOVACOES')
    const fila = await prisma.preReservaItem.count({ where: { tenantId, itemId: item.id, status: { in: ['AGUARDANDO', 'DISPONIVEL'] } } })
    if (fila) throw httpErr(409, 'Há reservas na fila para este item: não é possível renovar.', 'RESERVADO')
    const sit = await situacaoPessoa(tenantId, e.pessoaKey)
    if (sit.multasAbertas) throw httpErr(409, 'Pague ou regularize a multa em aberto antes de renovar.', 'MULTA')
    const upd = await prisma.preEmprestimo.update({ where: { id: e.id }, data: { renovacoes: { increment: 1 }, previstaEm: new Date(e.previstaEm.getTime() + item.prazoPadraoHoras * HORA) } })
    await audit({ tenantId, userId: quem.operadorId, modulo: MOD, acao: 'RENOVAR_ITEM', refType: 'PreEmprestimo', refId: e.id })
    return upd
  }
  router.post('/emprestimos/:id/renovar', operador, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    res.json(await renovarEmp(getTenantId(req), String(req.params.id), { operadorId: getUserId(req) }))
  }))
  router.post('/emprestimos/:id/perdido', acervo, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(z.object({ valor: z.coerce.number().min(0).max(100000).default(0), motivo: z.string().trim().min(5).max(300) }), req.body)
    const e = await prisma.preEmprestimo.findFirst({ where: { id: String(req.params.id), tenantId, status: 'ATIVO' } })
    if (!e) throw httpErr(404, 'Empréstimo ativo não encontrado.')
    const item = await prisma.preItem.findFirst({ where: { id: e.itemId, tenantId } })
    await prisma.$transaction([
      prisma.preEmprestimo.update({ where: { id: e.id }, data: { status: 'PERDIDO', devolucaoEm: new Date(), observacoes: b.motivo } }),
      prisma.preItem.update({ where: { id: e.itemId }, data: { status: 'PERDIDO' } }),
      ...(b.valor > 0 ? [prisma.preMulta.create({ data: { tenantId, emprestimoId: e.id, pessoaKey: e.pessoaKey, studentId: e.studentId, userId: e.userId, valor: b.valor, diasAtraso: 0, motivo: `Item perdido: ${b.motivo}` } })] : []),
    ])
    if (item?.bemId) await prisma.infBem.updateMany({ where: { id: item.bemId, tenantId }, data: { observacoes: `Item perdido em empréstimo (${b.motivo})` } })
    await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'ITEM_PERDIDO', refType: 'PreEmprestimo', refId: e.id, detalhes: b })
    res.json({ ok: true })
  }))
  router.get('/emprestimos', operador, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    for (const f of ['status', 'pessoaKey', 'itemId']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    if (qs(req.query.atrasados) === 'true') { where.status = 'ATIVO'; where.previstaEm = { lt: new Date() } }
    const [total, rows] = await Promise.all([prisma.preEmprestimo.count({ where }), prisma.preEmprestimo.findMany({ where, orderBy: { retiradaEm: 'desc' }, skip, take })])
    const [info, itens] = await Promise.all([infoPessoas(tenantId, rows.map((r) => r.pessoaKey)), prisma.preItem.findMany({ where: { tenantId, id: { in: rows.map((r) => r.itemId) } }, select: { id: true, codigo: true, descricao: true } })])
    const iMap = new Map(itens.map((i) => [i.id, i])), agora = new Date()
    res.json({ total, page, pageSize, items: rows.map((r) => ({ ...r, item: iMap.get(r.itemId) ?? null, pessoa: info.get(r.pessoaKey)?.nome ?? null, atrasado: r.status === 'ATIVO' && r.previstaEm < agora })) })
  }))
  router.get('/meus/emprestimos', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const key = pessoaDoUsuario(req.user!)
    const rows = await prisma.preEmprestimo.findMany({ where: { tenantId, pessoaKey: key }, orderBy: { retiradaEm: 'desc' }, take: 50 })
    const itens = new Map((await prisma.preItem.findMany({ where: { tenantId, id: { in: rows.map((r) => r.itemId) } }, select: { id: true, descricao: true, codigo: true } })).map((i) => [i.id, i]))
    const multas = await prisma.preMulta.findMany({ where: { tenantId, pessoaKey: key }, orderBy: { createdAt: 'desc' }, take: 20 })
    res.json({ situacao: await situacaoPessoa(tenantId, key), items: rows.map((r) => ({ ...r, item: itens.get(r.itemId) ?? null, atrasado: r.status === 'ATIVO' && r.previstaEm < new Date() })), multas })
  }))
  router.post('/meus/emprestimos/:id/renovar', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    res.json(await renovarEmp(getTenantId(req), String(req.params.id), { pessoaKey: pessoaDoUsuario(req.user!), operadorId: getUserId(req) }))
  }))

  // ---- multas e bloqueios
  router.get('/multas', acervo, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    const st = qs(req.query.status), pk = qs(req.query.pessoaKey)
    if (st) where.status = st
    if (pk) where.pessoaKey = pk
    const [total, rows] = await Promise.all([prisma.preMulta.count({ where }), prisma.preMulta.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take })])
    const info = await infoPessoas(tenantId, rows.map((r) => r.pessoaKey))
    res.json({ total, page, pageSize, items: rows.map((m) => ({ ...m, pessoa: info.get(m.pessoaKey)?.nome ?? null })) })
  }))
  router.post('/multas/:id/baixar', acervo, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(z.object({ acao: z.enum(['PAGAR', 'ISENTAR']), motivo: z.string().trim().min(5).max(300).optional() }).refine((x) => x.acao === 'PAGAR' || !!x.motivo, { message: 'Isenção exige motivo' }), req.body)
    const r = await prisma.preMulta.updateMany({ where: { id: String(req.params.id), tenantId, status: 'ABERTA' }, data: { status: b.acao === 'PAGAR' ? 'PAGA' : 'ISENTA', motivo: b.motivo, baixadaPorId: getUserId(req), baixadaEm: new Date() } })
    if (!r.count) throw httpErr(404, 'Multa aberta não encontrada.')
    await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: `MULTA_${b.acao}`, refType: 'PreMulta', refId: String(req.params.id), detalhes: b })
    res.json({ ok: true })
  }))
  router.get('/bloqueios', acervo, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const rows = await prisma.preBloqueio.findMany({ where: { tenantId, ativo: true }, orderBy: { createdAt: 'desc' }, take: 200 })
    const info = await infoPessoas(tenantId, rows.map((r) => r.pessoaKey))
    res.json({ items: rows.map((b) => ({ ...b, pessoa: info.get(b.pessoaKey)?.nome ?? null })) })
  }))
  router.post('/bloqueios', acervo, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(z.object({ pessoaKey: z.string().max(80), motivo: z.string().trim().min(5).max(300), ate: z.coerce.date().optional() }), req.body)
    if (!parsePessoaKey(b.pessoaKey)) throw httpErr(400, 'Pessoa inválida.')
    await exigirPessoa(tenantId, b.pessoaKey)
    const row = await prisma.preBloqueio.create({ data: { tenantId, ...b, origem: 'MANUAL', criadoPorId: getUserId(req) } })
    await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'BLOQUEAR_PESSOA', refType: 'PreBloqueio', refId: row.id })
    res.status(201).json(row)
  }))
  router.post('/bloqueios/:id/liberar', acervo, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const r = await prisma.preBloqueio.updateMany({ where: { id: String(req.params.id), tenantId, ativo: true }, data: { ativo: false, liberadoEm: new Date() } })
    if (!r.count) throw httpErr(404, 'Bloqueio não encontrado.')
    await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'LIBERAR_BLOQUEIO', refType: 'PreBloqueio', refId: String(req.params.id) })
    res.json({ ok: true })
  }))

  // ---- reservas
  router.post('/reservas', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(z.object({ itemId: z.string().max(60), pessoaKey: z.string().max(80).optional() }), req.body)
    let key = pessoaDoUsuario(req.user!)
    if (b.pessoaKey && b.pessoaKey !== key) {
      if (!OPERADORES.includes(req.user!.role) && !ehSuper(req.user!.role)) throw httpErr(403, 'Sem permissão para reservar em nome de outra pessoa.')
      key = b.pessoaKey
    }
    const pessoa = await exigirPessoa(tenantId, key)
    const item = await prisma.preItem.findFirst({ where: { id: b.itemId, tenantId, ativo: true } })
    if (!item) throw httpErr(404, 'Item não encontrado.')
    if (item.status === 'DISPONIVEL') throw httpErr(409, 'O item está disponível: retire diretamente.', 'DISPONIVEL')
    if (['BAIXADO', 'PERDIDO'].includes(item.status)) throw httpErr(409, 'Item indisponível para reserva.')
    const dup = await prisma.preReservaItem.findFirst({ where: { tenantId, itemId: item.id, pessoaKey: key, status: { in: ['AGUARDANDO', 'DISPONIVEL'] } } })
    if (dup) throw httpErr(409, 'Você já tem uma reserva para este item.')
    const r = await prisma.preReservaItem.create({ data: { tenantId, itemId: item.id, pessoaKey: key, studentId: pessoa.studentId, userId: pessoa.userId } })
    const posicao = await prisma.preReservaItem.count({ where: { tenantId, itemId: item.id, status: 'AGUARDANDO', createdAt: { lte: r.createdAt } } })
    res.status(201).json({ ...r, posicaoFila: posicao })
  }))
  router.get('/reservas', operador, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const where: any = { tenantId }
    const st = qs(req.query.status), it = qs(req.query.itemId)
    if (st) where.status = st
    if (it) where.itemId = it
    const rows = await prisma.preReservaItem.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 })
    const info = await infoPessoas(tenantId, rows.map((r) => r.pessoaKey))
    res.json({ items: rows.map((r) => ({ ...r, pessoa: info.get(r.pessoaKey)?.nome ?? null })) })
  }))
  router.post('/reservas/:id/cancelar', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const r = await prisma.preReservaItem.findFirst({ where: { id: String(req.params.id), tenantId, status: { in: ['AGUARDANDO', 'DISPONIVEL'] } } })
    if (!r) throw httpErr(404, 'Reserva não encontrada.')
    if (r.pessoaKey !== pessoaDoUsuario(req.user!) && !OPERADORES.includes(req.user!.role) && !ehSuper(req.user!.role)) throw httpErr(403, 'Sem permissão.')
    await prisma.preReservaItem.update({ where: { id: r.id }, data: { status: 'CANCELADA', concluidaEm: new Date() } })
    if (r.status === 'DISPONIVEL') { await prisma.preItem.updateMany({ where: { id: r.itemId, tenantId, status: 'RESERVADO' }, data: { status: 'DISPONIVEL' } }); await atribuirFilaItem(tenantId, r.itemId) }
    res.json({ ok: true })
  }))

  // ---- inventário (conferência por leitura de QR/código)
  router.post('/inventarios', acervo, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(z.object({ setor: z.enum(['BIBLIOTECA', 'LABORATORIO', 'AUDIOVISUAL', 'OUTRO']).optional(), spaceId: z.string().max(60).optional() }), req.body ?? {})
    if (b.spaceId) await espacoDoTenant(tenantId, b.spaceId)
    const inv = await prisma.preInventario.create({ data: { tenantId, ...b, iniciadoPorId: getUserId(req) } })
    res.status(201).json(inv)
  }))
  const escopoInv = (inv: { tenantId: string; setor: string | null; spaceId: string | null }) => ({ tenantId: inv.tenantId, ativo: true, status: { notIn: ['BAIXADO'] }, ...(inv.setor ? { setor: inv.setor } : {}), ...(inv.spaceId ? { spaceId: inv.spaceId } : {}) })
  router.post('/inventarios/:id/leituras', acervo, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(z.object({ codigo: idCodigo, via: z.string().max(10).default('QR') }), req.body)
    const inv = await prisma.preInventario.findFirst({ where: { id: String(req.params.id), tenantId, status: 'ABERTO' } })
    if (!inv) throw httpErr(404, 'Inventário aberto não encontrado.')
    const item = await prisma.preItem.findFirst({ where: { tenantId, codigo: b.codigo } })
    try {
      const l = await prisma.preInventarioLeitura.create({ data: { tenantId, inventarioId: inv.id, codigo: b.codigo, itemId: item?.id, via: b.via } })
      res.status(201).json({ ...l, cadastrado: !!item, descricao: item?.descricao ?? null, foraDoEscopo: !!item && ((inv.setor && item.setor !== inv.setor) || (inv.spaceId && item.spaceId !== inv.spaceId)) })
    } catch (e: any) { if (e?.code === 'P2002') return res.json({ duplicado: true, codigo: b.codigo }); throw e }
  }))
  const resultadoInv = async (inv: any) => {
    const esperados = await prisma.preItem.findMany({ where: escopoInv(inv), select: { id: true, codigo: true, descricao: true, status: true } })
    const leituras = await prisma.preInventarioLeitura.findMany({ where: { inventarioId: inv.id } })
    const lidos = new Set(leituras.map((l) => l.codigo))
    const faltantes = esperados.filter((i) => !lidos.has(i.codigo) && i.status !== 'EMPRESTADO')
    const emprestados = esperados.filter((i) => !lidos.has(i.codigo) && i.status === 'EMPRESTADO')
    const naoCadastrados = leituras.filter((l) => !l.itemId).map((l) => l.codigo)
    return { esperados: esperados.length, lidos: leituras.length, conferidos: esperados.filter((i) => lidos.has(i.codigo)).length, faltantes, emprestadosForaDoLocal: emprestados, naoCadastrados }
  }
  router.get('/inventarios/:id', acervo, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const inv = await prisma.preInventario.findFirst({ where: { id: String(req.params.id), tenantId: getTenantId(req) } })
    if (!inv) throw httpErr(404, 'Inventário não encontrado.')
    res.json({ inventario: inv, resultado: inv.status === 'CONCLUIDO' ? inv.resultado : await resultadoInv(inv) })
  }))
  router.get('/inventarios', acervo, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    res.json({ items: await prisma.preInventario.findMany({ where: { tenantId: getTenantId(req) }, orderBy: { iniciadoEm: 'desc' }, take: 50 }) })
  }))
  router.post('/inventarios/:id/concluir', acervo, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const inv = await prisma.preInventario.findFirst({ where: { id: String(req.params.id), tenantId, status: 'ABERTO' } })
    if (!inv) throw httpErr(404, 'Inventário aberto não encontrado.')
    const r = await resultadoInv(inv)
    let marcados = 0
    if (req.body?.marcarPerdidos === true) {
      const m = await prisma.preItem.updateMany({ where: { tenantId, id: { in: r.faltantes.map((f) => f.id) }, status: 'DISPONIVEL' }, data: { status: 'PERDIDO' } })
      marcados = m.count
    }
    const upd = await prisma.preInventario.update({ where: { id: inv.id }, data: { status: 'CONCLUIDO', concluidoEm: new Date(), resultado: { ...r, marcadosPerdidos: marcados } as any } })
    await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'CONCLUIR_INVENTARIO', refType: 'PreInventario', refId: inv.id, detalhes: { faltantes: r.faltantes.length, marcados } })
    res.json({ inventario: upd, resultado: { ...r, marcadosPerdidos: marcados } })
  }))

  // ---- painel e relatório
  router.get('/relatorios/emprestimos', operador, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const agora = new Date()
    const [ativos, atrasados, devolvidos30, itens, multas, bloqueios, reservas, top] = await Promise.all([
      prisma.preEmprestimo.count({ where: { tenantId, status: 'ATIVO' } }),
      prisma.preEmprestimo.count({ where: { tenantId, status: 'ATIVO', previstaEm: { lt: agora } } }),
      prisma.preEmprestimo.count({ where: { tenantId, status: 'DEVOLVIDO', devolucaoEm: { gte: new Date(agora.getTime() - 30 * DIA) } } }),
      prisma.preItem.groupBy({ by: ['status'], where: { tenantId, ativo: true }, _count: { _all: true } }),
      prisma.preMulta.aggregate({ where: { tenantId, status: 'ABERTA' }, _sum: { valor: true }, _count: { _all: true } }),
      prisma.preBloqueio.count({ where: { tenantId, ativo: true } }),
      prisma.preReservaItem.count({ where: { tenantId, status: { in: ['AGUARDANDO', 'DISPONIVEL'] } } }),
      prisma.preEmprestimo.groupBy({ by: ['itemId'], where: { tenantId, retiradaEm: { gte: new Date(agora.getTime() - 90 * DIA) } }, _count: { _all: true }, orderBy: { _count: { itemId: 'desc' } }, take: 5 }),
    ])
    const nomes = new Map((await prisma.preItem.findMany({ where: { tenantId, id: { in: top.map((t) => t.itemId) } }, select: { id: true, descricao: true, codigo: true } })).map((i) => [i.id, i]))
    res.json({ ativos, atrasados, devolvidos30d: devolvidos30, itensPorStatus: Object.fromEntries(itens.map((i) => [i.status, i._count._all])), multasAbertas: multas._count._all, valorMultasAbertas: multas._sum.valor ?? 0, bloqueiosAtivos: bloqueios, reservasAbertas: reservas, maisEmprestados: top.map((t) => ({ ...nomes.get(t.itemId), emprestimos: t._count._all })) })
  }))
}

async function bemDoTenant(tenantId: string, bemId: string) {
  const b = await prisma.infBem.findFirst({ where: { id: bemId, tenantId } })
  if (!b) throw httpErr(404, 'Bem patrimonial não encontrado nesta instituição.')
  return b
}

export { GESTAO }
