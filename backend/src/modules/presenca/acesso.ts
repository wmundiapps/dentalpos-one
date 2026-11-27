import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { pageParams, parseBody, qs } from '../core/crud'
import { audit } from '../core/notify'
import { espacoDoTenant } from './chamada'
import { HHMM, MIN, diaLocal, horaLocal, mascararDoc, percentualOcupacao } from './logic'
import { GESTAO, LEITURA_GESTAO, MOD, OPERADORES, alertar, ehSuper, httpErr, infoPessoas, pessoaDoUsuario, resolverPessoaPorMetodo } from './servico'

const hhmmMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3))

export async function configDoEspaco(tenantId: string, spaceId: string) {
  return prisma.preEspacoConfig.findUnique({ where: { tenantId_spaceId: { tenantId, spaceId } } })
}

export async function ocupacaoDe(tenantId: string, spaceId: string) {
  return prisma.preVisita.count({ where: { tenantId, spaceId, saidaEm: null } })
}

export function capacidadeEfetiva(espaco: { capacidade: number }, cfg: { capacidadeMax: number | null } | null): number | null {
  const c = cfg?.capacidadeMax ?? espaco.capacidade
  return c && c > 0 ? c : null
}

export interface AcessoIn {
  tenantId: string; spaceId: string; sentido?: string; metodo: string; embedding?: unknown; liveness?: any; credencial?: string; pessoaKey?: string
  visitante?: { nome: string; documento?: string }; visitaId?: string; dispositivoId?: string | null; operadorId?: string; operadorRole?: string
}

/** Registra entrada/saída em um espaço aplicando regras de acesso, capacidade e alertas. */
export async function registrarAcesso(p: AcessoIn) {
  const { tenantId, spaceId } = p
  const espaco = await espacoDoTenant(tenantId, spaceId)
  if (!espaco.ativo) throw httpErr(409, 'Espaço inativo.')
  const cfg = await configDoEspaco(tenantId, spaceId)
  const cap = capacidadeEfetiva(espaco, cfg)
  const metodo = String(p.metodo).toUpperCase()
  const sentidoPedido = String(p.sentido ?? 'AUTO').toUpperCase()
  if (!['AUTO', 'ENTRADA', 'SAIDA'].includes(sentidoPedido)) throw httpErr(400, 'Sentido inválido (AUTO, ENTRADA ou SAIDA).')
  if (cfg && !cfg.ativo) throw httpErr(409, 'Controle de acesso desativado para este espaço.')

  // ---- visitante (portaria)
  if (p.visitante || p.visitaId) {
    if (p.visitaId) { // saída de visitante
      const v = await prisma.preVisita.findFirst({ where: { id: p.visitaId, tenantId, spaceId, saidaEm: null, pessoaTipo: 'VISITANTE' } })
      if (!v) throw httpErr(404, 'Visita aberta não encontrada.')
      const fechada = await prisma.preVisita.update({ where: { id: v.id }, data: { saidaEm: new Date(), metodoSaida: 'MANUAL' } })
      const ac = await prisma.preAcesso.create({ data: { tenantId, spaceId, pessoaKey: v.pessoaKey, pessoaTipo: 'VISITANTE', visitanteNome: v.visitanteNome, visitanteDoc: v.visitanteDoc, sentido: 'SAIDA', metodo: 'MANUAL', operadorId: p.operadorId } })
      return { resultado: 'LIBERADO', sentido: 'SAIDA', acesso: ac, visita: fechada, ocupacao: await ocupacaoDe(tenantId, spaceId), capacidade: cap }
    }
    const nome = p.visitante!.nome.trim()
    if (nome.length < 3) throw httpErr(400, 'Informe o nome do visitante.')
    const lotado = cap !== null && (await ocupacaoDe(tenantId, spaceId)) >= cap
    if (lotado && cfg?.bloquearNaCapacidade) return negar(p, espaco, `VISITANTE:${nome}`, 'VISITANTE', 'CAPACIDADE', 'Capacidade máxima do espaço atingida.', { visitanteNome: nome, visitanteDoc: mascararDoc(p.visitante!.documento) }, cap)
    const key = `VISITANTE:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    const visita = await prisma.preVisita.create({ data: { tenantId, spaceId, pessoaKey: key, pessoaTipo: 'VISITANTE', visitanteNome: nome, visitanteDoc: mascararDoc(p.visitante!.documento), metodoEntrada: 'MANUAL' } })
    const ac = await prisma.preAcesso.create({ data: { tenantId, spaceId, pessoaKey: key, pessoaTipo: 'VISITANTE', visitanteNome: nome, visitanteDoc: visita.visitanteDoc, sentido: 'ENTRADA', metodo: 'MANUAL', operadorId: p.operadorId } })
    const oc = await ocupacaoDe(tenantId, spaceId)
    await alertaCapacidade(tenantId, espaco, cfg, oc, cap)
    return { resultado: 'LIBERADO', sentido: 'ENTRADA', acesso: ac, visita, ocupacao: oc, capacidade: cap }
  }

  // ---- pessoa identificada (face / QR / código / manual)
  if (cfg?.modoAcesso === 'CREDENCIAL' && metodo === 'MANUAL' && !ehSuper(p.operadorRole)) throw httpErr(403, 'Este espaço exige leitura de face, QR ou código (identificação manual desabilitada).')
  const { pessoa, distancia } = await resolverPessoaPorMetodo({ tenantId, metodo, embedding: p.embedding, liveness: p.liveness, credencial: p.credencial, pessoaKey: p.pessoaKey, dispositivoId: p.dispositivoId, operadorId: p.operadorId, finalidade: 'ACESSO' })
  const aberta = await prisma.preVisita.findFirst({ where: { tenantId, spaceId, pessoaKey: pessoa.pessoaKey, saidaEm: null }, orderBy: { entradaEm: 'desc' } })
  const sentido = sentidoPedido === 'AUTO' ? (aberta ? 'SAIDA' : 'ENTRADA') : sentidoPedido
  const base = { tenantId, spaceId, pessoaKey: pessoa.pessoaKey, pessoaTipo: pessoa.tipo, studentId: pessoa.studentId, userId: pessoa.userId, metodo, dispositivoId: p.dispositivoId ?? undefined, operadorId: p.operadorId, distancia }

  if (sentido === 'SAIDA') {
    if (aberta) await prisma.preVisita.update({ where: { id: aberta.id }, data: { saidaEm: new Date(), metodoSaida: metodo } })
    const ac = await prisma.preAcesso.create({ data: { ...base, sentido: 'SAIDA', motivo: aberta ? undefined : 'SAIDA_SEM_ENTRADA' } })
    return { resultado: 'LIBERADO', sentido, pessoa: resumo(pessoa), acesso: ac, ocupacao: await ocupacaoDe(tenantId, spaceId), capacidade: cap, aviso: aberta ? undefined : 'Saída sem entrada registrada.' }
  }

  // ENTRADA: regras
  if (!pessoa.ativo) return negar(p, espaco, pessoa.pessoaKey, pessoa.tipo, 'CADASTRO_INATIVO', 'Cadastro inativo ou desligado.', { studentId: pessoa.studentId, userId: pessoa.userId, metodo, distancia }, cap, pessoa)
  if (cfg?.modoAcesso === 'RESTRITO') {
    const perfis = (cfg.perfisPermitidos as string[] | null) ?? []
    if (perfis.length && !perfis.includes(String(pessoa.role)) && !ehSuper(pessoa.role ?? '')) return negar(p, espaco, pessoa.pessoaKey, pessoa.tipo, 'PERFIL_NAO_AUTORIZADO', 'Perfil sem autorização para este espaço.', { studentId: pessoa.studentId, userId: pessoa.userId, metodo, distancia }, cap, pessoa)
  }
  if (cfg?.horaAbertura && cfg?.horaFechamento && !ehSuper(pessoa.role ?? '')) {
    const m = hhmmMin(horaLocal(new Date()))
    if (m < hhmmMin(cfg.horaAbertura) || m > hhmmMin(cfg.horaFechamento)) return negar(p, espaco, pessoa.pessoaKey, pessoa.tipo, 'FORA_DO_HORARIO', `Espaço aberto de ${cfg.horaAbertura} às ${cfg.horaFechamento}.`, { studentId: pessoa.studentId, userId: pessoa.userId, metodo, distancia }, cap, pessoa)
  }
  const ocupAntes = await ocupacaoDe(tenantId, spaceId)
  if (aberta) await prisma.preVisita.update({ where: { id: aberta.id }, data: { saidaEm: new Date(), saidaAutomatica: true, metodoSaida: 'AUTOMATICO' } })
  const ocupEfetiva = aberta ? ocupAntes - 1 : ocupAntes
  if (cap !== null && ocupEfetiva >= cap && cfg?.bloquearNaCapacidade) return negar(p, espaco, pessoa.pessoaKey, pessoa.tipo, 'CAPACIDADE', 'Capacidade máxima do espaço atingida.', { studentId: pessoa.studentId, userId: pessoa.userId, metodo, distancia }, cap, pessoa)
  const visita = await prisma.preVisita.create({ data: { tenantId, spaceId, pessoaKey: pessoa.pessoaKey, pessoaTipo: pessoa.tipo, studentId: pessoa.studentId, userId: pessoa.userId, metodoEntrada: metodo } })
  const ac = await prisma.preAcesso.create({ data: { ...base, sentido: 'ENTRADA' } })
  const oc = ocupEfetiva + 1
  await alertaCapacidade(tenantId, espaco, cfg, oc, cap)
  return { resultado: 'LIBERADO', sentido, pessoa: resumo(pessoa), acesso: ac, visita, ocupacao: oc, capacidade: cap, percentual: percentualOcupacao(oc, cap) }
}

const resumo = (p: { pessoaKey: string; nome: string; tipo: string; ra?: string | null; role?: string | null }) => ({ pessoaKey: p.pessoaKey, nome: p.nome, tipo: p.tipo, ra: p.ra ?? null, role: p.role ?? null })

async function negar(p: AcessoIn, espaco: { id: string; nome: string }, key: string, tipo: string, codigo: string, motivo: string, extra: Record<string, any>, cap: number | null, pessoa?: { nome: string } ) {
  const { tenantId } = p
  const ac = await prisma.preAcesso.create({
    data: { tenantId, spaceId: espaco.id, pessoaKey: key, pessoaTipo: tipo, studentId: extra.studentId, userId: extra.userId, visitanteNome: extra.visitanteNome, visitanteDoc: extra.visitanteDoc, sentido: 'ENTRADA', metodo: String(extra.metodo ?? p.metodo).toUpperCase(), resultado: 'NEGADO', motivo: codigo, dispositivoId: p.dispositivoId ?? undefined, operadorId: p.operadorId, distancia: extra.distancia },
  })
  await alertar({ tenantId, tipo: codigo === 'CAPACIDADE' ? 'CAPACIDADE' : 'ACESSO_INDEVIDO', severidade: codigo === 'CAPACIDADE' ? 'ATENCAO' : 'CRITICO', spaceId: espaco.id, pessoaKey: key, mensagem: `Acesso negado em ${espaco.nome}${pessoa ? ` a ${pessoa.nome}` : ''}: ${motivo}`, dedupeKey: `neg:${espaco.id}:${key}:${codigo}`, dedupeMin: 10 })
  throw Object.assign(new Error(motivo), { status: 403, codigo, resultado: 'NEGADO', acessoId: ac.id, capacidade: cap })
}

async function alertaCapacidade(tenantId: string, espaco: { id: string; nome: string }, cfg: { alertaCapacidadePct: number } | null, ocupacao: number, cap: number | null) {
  if (cap === null) return
  const pct = percentualOcupacao(ocupacao, cap) ?? 0
  if (pct >= (cfg?.alertaCapacidadePct ?? 90)) await alertar({ tenantId, tipo: 'CAPACIDADE', severidade: pct >= 100 ? 'CRITICO' : 'ATENCAO', spaceId: espaco.id, mensagem: `${espaco.nome} com ${ocupacao}/${cap} pessoas (${pct}% da capacidade).`, dedupeKey: `cap:${espaco.id}:${pct >= 100 ? 100 : 90}`, dedupeMin: 30 })
}

/** Encerra permanências esquecidas (> 14 h ou após o fechamento do espaço). */
export async function jobSaidaAutomatica() {
  const abertas = await prisma.preVisita.findMany({ where: { saidaEm: null }, take: 2000 })
  if (!abertas.length) return { encerradas: 0 }
  const cfgs = await prisma.preEspacoConfig.findMany({ where: { spaceId: { in: [...new Set(abertas.map((v) => v.spaceId))] } } })
  const cMap = new Map(cfgs.map((c) => [`${c.tenantId}:${c.spaceId}`, c]))
  const agora = Date.now(), ids: string[] = []
  for (const v of abertas) {
    const c = cMap.get(`${v.tenantId}:${v.spaceId}`)
    let encerrar = agora - v.entradaEm.getTime() > 14 * 3600_000
    if (!encerrar && c?.horaFechamento) {
      const fechamento = new Date(`${diaLocal(v.entradaEm).ymd}T${c.horaFechamento}:00-03:00`).getTime()
      if (agora > fechamento + 15 * MIN && fechamento >= v.entradaEm.getTime()) encerrar = true
    }
    if (encerrar) ids.push(v.id)
  }
  if (ids.length) await prisma.preVisita.updateMany({ where: { id: { in: ids } }, data: { saidaEm: new Date(), saidaAutomatica: true, metodoSaida: 'AUTOMATICO' } })
  return { encerradas: ids.length }
}

export function mountAcesso(router: Router) {
  const operador = requireRole(...OPERADORES)
  const gestao = requireRole(...GESTAO)
  const leitura = requireRole(...LEITURA_GESTAO)

  router.get('/espacos', leitura, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const tipo = qs(req.query.tipo)
    const espacos = await prisma.eduSpace.findMany({ where: { tenantId, ativo: true, ...(tipo ? { tipo: tipo as any } : {}) }, orderBy: { nome: 'asc' }, take: 500 })
    const [cfgs, grupos] = await Promise.all([
      prisma.preEspacoConfig.findMany({ where: { tenantId } }),
      prisma.preVisita.groupBy({ by: ['spaceId'], where: { tenantId, saidaEm: null }, _count: { _all: true } }),
    ])
    const cMap = new Map(cfgs.map((c) => [c.spaceId, c])), oMap = new Map(grupos.map((g) => [g.spaceId, g._count._all]))
    const itens = espacos.map((e) => {
      const c = cMap.get(e.id) ?? null, cap = capacidadeEfetiva(e, c), oc = oMap.get(e.id) ?? 0
      return { id: e.id, codigo: e.codigo, nome: e.nome, tipo: e.tipo, bloco: e.bloco, capacidade: cap, ocupacao: oc, percentual: percentualOcupacao(oc, cap), config: c }
    })
    res.json({ items: qs(req.query.controlados) === 'true' ? itens.filter((i) => i.config) : itens })
  }))

  router.put('/espacos/:spaceId/config', gestao, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const spaceId = String(req.params.spaceId)
    await espacoDoTenant(tenantId, spaceId)
    const b = parseBody(z.object({
      modoAcesso: z.enum(['LIVRE', 'CREDENCIAL', 'RESTRITO']).default('LIVRE'), capacidadeMax: z.coerce.number().int().min(1).max(100000).nullable().optional(),
      alertaCapacidadePct: z.coerce.number().int().min(10).max(100).default(90), bloquearNaCapacidade: z.boolean().default(false),
      perfisPermitidos: z.array(z.string().max(30)).max(20).nullable().optional(), horaAbertura: z.string().regex(HHMM).nullable().optional(), horaFechamento: z.string().regex(HHMM).nullable().optional(), ativo: z.boolean().default(true),
    }).refine((c) => !c.horaAbertura === !c.horaFechamento, { message: 'Informe horaAbertura e horaFechamento juntas' }), req.body)
    // PUT substitui a configuração: campos omitidos voltam ao padrão (null)
    const data = { ...b, capacidadeMax: b.capacidadeMax ?? null, horaAbertura: b.horaAbertura ?? null, horaFechamento: b.horaFechamento ?? null, perfisPermitidos: (b.perfisPermitidos ?? null) as any }
    const row = await prisma.preEspacoConfig.upsert({ where: { tenantId_spaceId: { tenantId, spaceId } }, create: { tenantId, spaceId, ...data }, update: data })
    await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'CONFIG_ESPACO', refType: 'EduSpace', refId: spaceId, detalhes: b })
    res.json(row)
  }))

  router.post('/acesso/registrar', operador, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const b = parseBody(z.object({
      spaceId: z.string().min(8).max(60), sentido: z.enum(['AUTO', 'ENTRADA', 'SAIDA']).default('AUTO'), metodo: z.enum(['FACIAL', 'QR', 'CODIGO', 'MANUAL']),
      embedding: z.array(z.number()).length(128).optional(), liveness: z.object({ nonce: z.string().max(80) }).passthrough().optional(), credencial: z.string().max(120).optional(), pessoaKey: z.string().max(80).optional(),
      visitante: z.object({ nome: z.string().max(120), documento: z.string().max(20).optional() }).optional(), visitaId: z.string().max(60).optional(), dispositivoId: z.string().max(60).optional(),
    }), req.body)
    const r = await registrarAcesso({ tenantId: getTenantId(req), ...b, operadorId: getUserId(req), operadorRole: req.user!.role })
    res.status(201).json(r)
  }))

  router.get('/ocupacao', leitura, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const cfgs = await prisma.preEspacoConfig.findMany({ where: { tenantId, ativo: true } })
    const grupos = await prisma.preVisita.groupBy({ by: ['spaceId'], where: { tenantId, saidaEm: null }, _count: { _all: true } })
    const ids = [...new Set([...cfgs.map((c) => c.spaceId), ...grupos.map((g) => g.spaceId)])]
    const espacos = await prisma.eduSpace.findMany({ where: { tenantId, id: { in: ids } } })
    const cMap = new Map(cfgs.map((c) => [c.spaceId, c])), oMap = new Map(grupos.map((g) => [g.spaceId, g._count._all]))
    const items = espacos.map((e) => { const cap = capacidadeEfetiva(e, cMap.get(e.id) ?? null), oc = oMap.get(e.id) ?? 0; return { spaceId: e.id, nome: e.nome, tipo: e.tipo, ocupacao: oc, capacidade: cap, percentual: percentualOcupacao(oc, cap), modoAcesso: cMap.get(e.id)?.modoAcesso ?? 'LIVRE' } }).sort((a, b) => (b.percentual ?? -1) - (a.percentual ?? -1))
    res.json({ atualizadoEm: new Date(), total: items.reduce((s, i) => s + i.ocupacao, 0), items })
  }))
  router.get('/ocupacao/:spaceId', leitura, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const e = await espacoDoTenant(tenantId, String(req.params.spaceId))
    const cfg = await configDoEspaco(tenantId, e.id)
    const visitas = await prisma.preVisita.findMany({ where: { tenantId, spaceId: e.id, saidaEm: null }, orderBy: { entradaEm: 'desc' }, take: 500 })
    const info = await infoPessoas(tenantId, visitas.map((v) => v.pessoaKey))
    const cap = capacidadeEfetiva(e, cfg)
    res.json({ espaco: { id: e.id, nome: e.nome, tipo: e.tipo }, ocupacao: visitas.length, capacidade: cap, percentual: percentualOcupacao(visitas.length, cap), presentes: visitas.map((v) => ({ visitaId: v.id, pessoaKey: v.pessoaKey, nome: v.pessoaTipo === 'VISITANTE' ? v.visitanteNome : info.get(v.pessoaKey)?.nome ?? '—', tipo: v.pessoaTipo, entradaEm: v.entradaEm, metodo: v.metodoEntrada })) })
  }))
  router.post('/espacos/:spaceId/esvaziar', gestao, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const e = await espacoDoTenant(tenantId, String(req.params.spaceId))
    const r = await prisma.preVisita.updateMany({ where: { tenantId, spaceId: e.id, saidaEm: null }, data: { saidaEm: new Date(), saidaAutomatica: true, metodoSaida: 'AUTOMATICO' } })
    await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'ESVAZIAR_ESPACO', refType: 'EduSpace', refId: e.id, detalhes: { encerradas: r.count } })
    res.json({ encerradas: r.count })
  }))

  // ---- históricos
  router.get('/acesso/historico', leitura, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    for (const f of ['spaceId', 'pessoaKey', 'resultado', 'sentido', 'metodo']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    const de = qs(req.query.de), ate = qs(req.query.ate)
    if (de || ate) { where.em = {}; if (de) where.em.gte = new Date(de); if (ate) where.em.lte = new Date(ate); if (isNaN(where.em.gte?.getTime?.() ?? 0) || isNaN(where.em.lte?.getTime?.() ?? 0)) throw httpErr(400, 'Período inválido.') }
    const [total, rows] = await Promise.all([prisma.preAcesso.count({ where }), prisma.preAcesso.findMany({ where, orderBy: { em: 'desc' }, skip, take })])
    const info = await infoPessoas(tenantId, rows.map((r) => r.pessoaKey))
    const espacos = new Map((await prisma.eduSpace.findMany({ where: { tenantId, id: { in: [...new Set(rows.map((r) => r.spaceId))] } }, select: { id: true, nome: true } })).map((e) => [e.id, e.nome]))
    res.json({ total, page, pageSize, items: rows.map((r) => ({ ...r, nome: r.pessoaTipo === 'VISITANTE' ? r.visitanteNome : info.get(r.pessoaKey)?.nome ?? null, espaco: espacos.get(r.spaceId) ?? null })) })
  }))
  router.get('/pessoas/:key/historico', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const key = String(req.params.key)
    const proprio = key === pessoaDoUsuario(req.user!)
    if (!proprio && !ehSuper(req.user!.role) && !LEITURA_GESTAO.includes(req.user!.role)) throw httpErr(403, 'Sem permissão para ver o histórico de outra pessoa.')
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where = { tenantId, pessoaKey: key }
    const [total, rows, visitas] = await Promise.all([prisma.preAcesso.count({ where }), prisma.preAcesso.findMany({ where, orderBy: { em: 'desc' }, skip, take }), prisma.preVisita.findMany({ where, orderBy: { entradaEm: 'desc' }, take: 30 })])
    const espacos = new Map((await prisma.eduSpace.findMany({ where: { tenantId, id: { in: [...new Set([...rows.map((r) => r.spaceId), ...visitas.map((v) => v.spaceId)])] } }, select: { id: true, nome: true } })).map((e) => [e.id, e.nome]))
    res.json({ total, page, pageSize, items: rows.map((r) => ({ ...r, espaco: espacos.get(r.spaceId) ?? null })), permanencias: visitas.map((v) => ({ ...v, espaco: espacos.get(v.spaceId) ?? null, minutos: v.saidaEm ? Math.round((v.saidaEm.getTime() - v.entradaEm.getTime()) / MIN) : null })) })
  }))
  router.get('/espacos/:spaceId/historico', leitura, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const e = await espacoDoTenant(tenantId, String(req.params.spaceId))
    const { skip, take, page, pageSize } = pageParams(req.query)
    const [total, rows] = await Promise.all([prisma.preVisita.count({ where: { tenantId, spaceId: e.id } }), prisma.preVisita.findMany({ where: { tenantId, spaceId: e.id }, orderBy: { entradaEm: 'desc' }, skip, take })])
    const info = await infoPessoas(tenantId, rows.map((r) => r.pessoaKey))
    res.json({ espaco: { id: e.id, nome: e.nome }, total, page, pageSize, items: rows.map((v) => ({ ...v, nome: v.pessoaTipo === 'VISITANTE' ? v.visitanteNome : info.get(v.pessoaKey)?.nome ?? null, minutos: v.saidaEm ? Math.round((v.saidaEm.getTime() - v.entradaEm.getTime()) / MIN) : null })) })
  }))

  // ---- alertas
  router.get('/alertas', leitura, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    const st = qs(req.query.status), tipo = qs(req.query.tipo)
    if (st) where.status = st
    if (tipo) where.tipo = tipo
    const [total, items, abertos] = await Promise.all([prisma.preAlerta.count({ where }), prisma.preAlerta.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }), prisma.preAlerta.count({ where: { tenantId, status: 'ABERTO' } })])
    res.json({ total, abertos, page, pageSize, items })
  }))
  for (const [acao, status] of [['reconhecer', 'RECONHECIDO'], ['resolver', 'RESOLVIDO']] as const) {
    router.post(`/alertas/:id/${acao}`, operador, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const r = await prisma.preAlerta.updateMany({ where: { id: String(req.params.id), tenantId, status: { not: 'RESOLVIDO' } }, data: { status, resolvidoPorId: getUserId(req), resolvidoEm: status === 'RESOLVIDO' ? new Date() : null } })
      if (!r.count) throw httpErr(404, 'Alerta não encontrado ou já resolvido.')
      await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: `ALERTA_${status}`, refType: 'PreAlerta', refId: String(req.params.id) })
      res.json({ ok: true, status })
    }))
  }

  // ---- painel da portaria e relatório por hora
  router.get('/portaria/painel', leitura, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const desde = new Date(Date.now() - 24 * 3600_000)
    const [dentro, entradas, negados, alertas, ultimos, visitantes] = await Promise.all([
      prisma.preVisita.count({ where: { tenantId, saidaEm: null } }),
      prisma.preAcesso.count({ where: { tenantId, sentido: 'ENTRADA', resultado: 'LIBERADO', em: { gte: desde } } }),
      prisma.preAcesso.count({ where: { tenantId, resultado: 'NEGADO', em: { gte: desde } } }),
      prisma.preAlerta.findMany({ where: { tenantId, status: 'ABERTO' }, orderBy: { createdAt: 'desc' }, take: 10 }),
      prisma.preAcesso.findMany({ where: { tenantId }, orderBy: { em: 'desc' }, take: 15 }),
      prisma.preVisita.count({ where: { tenantId, saidaEm: null, pessoaTipo: 'VISITANTE' } }),
    ])
    const info = await infoPessoas(tenantId, ultimos.map((u) => u.pessoaKey))
    const espacos = new Map((await prisma.eduSpace.findMany({ where: { tenantId, id: { in: [...new Set(ultimos.map((u) => u.spaceId))] } }, select: { id: true, nome: true } })).map((e) => [e.id, e.nome]))
    res.json({ dentro, visitantesDentro: visitantes, entradas24h: entradas, negados24h: negados, alertasAbertos: alertas, ultimos: ultimos.map((u) => ({ id: u.id, em: u.em, sentido: u.sentido, resultado: u.resultado, motivo: u.motivo, metodo: u.metodo, espaco: espacos.get(u.spaceId), nome: u.pessoaTipo === 'VISITANTE' ? u.visitanteNome : info.get(u.pessoaKey)?.nome ?? null })) })
  }))
  router.get('/relatorios/ocupacao', leitura, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const spaceId = qs(req.query.spaceId)
    const ref = qs(req.query.data) ? new Date(String(qs(req.query.data))) : new Date()
    if (isNaN(ref.getTime())) throw httpErr(400, 'Data inválida.')
    const { ymd } = diaLocal(ref)
    const ini = new Date(`${ymd}T00:00:00-03:00`).getTime()
    const visitas = await prisma.preVisita.findMany({ where: { tenantId, ...(spaceId ? { spaceId } : {}), entradaEm: { lt: new Date(ini + 86_400_000) }, OR: [{ saidaEm: null }, { saidaEm: { gt: new Date(ini) } }] } })
    const horas = Array.from({ length: 24 }, (_, h) => {
      const a = ini + h * 3600_000, b = a + 3600_000
      return { hora: h, entradas: visitas.filter((v) => v.entradaEm.getTime() >= a && v.entradaEm.getTime() < b).length, ocupacaoFimHora: visitas.filter((v) => v.entradaEm.getTime() < b && (!v.saidaEm || v.saidaEm.getTime() >= b)).length }
    })
    res.json({ data: ymd, spaceId: spaceId ?? null, pico: horas.reduce((m, h) => (h.ocupacaoFimHora > m.ocupacaoFimHora ? h : m), horas[0]), horas })
  }))
}
