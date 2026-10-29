import { Router } from 'express'
import { randomBytes } from 'crypto'
import { scheduleReminder, completeReminders } from '../../core/reminders'
import { registerEduJob } from '../../core/jobs'
import {
  AuthenticatedRequest, GESTAO, LEITURA, MOD2, Response, asyncHandler, audit, criarAnexo, dateISO, exigirUsuario, fail, getTenantId, getUserId, idParam, isGestao, money,
  nextNum, nomeDe, nomeUsuario, notify, pageParams, parseBody, prisma, qs, requireRole, usuariosComPapel, z, DAY,
} from './common'

export const CATEGORIAS_SOL = ['ELETRICA', 'HIDRAULICA', 'TELHADO', 'BANHEIRO', 'JARDIM', 'PINTURA', 'CALCAMENTO', 'EQUIPAMENTO', 'MOBILIARIO', 'LIMPEZA', 'SEGURANCA', 'TI', 'OUTROS'] as const
const PRIOR = ['BAIXA', 'MEDIA', 'ALTA', 'URGENTE'] as const
export const SLA_DIAS: Record<string, number> = { URGENTE: 1, ALTA: 3, MEDIA: 7, BAIXA: 15 }
const ABERTAS = ['NOVA', 'EM_TRIAGEM', 'OS_GERADA', 'EM_ANDAMENTO', 'AGUARDANDO']

const fotoSchema = z.object({ arquivoNome: z.string().min(1).max(200), mime: z.string().max(120).optional(), dataUrl: z.string().max(2_800_000).optional(), arquivoUrl: z.string().url().max(2000).optional(), descricao: z.string().max(300).optional() })
const criar = z.object({
  tipo: z.enum(['PROBLEMA', 'IMPLEMENTACAO']), categoria: z.enum(CATEGORIAS_SOL).default('OUTROS'), titulo: z.string().min(3).max(200),
  relatorio: z.string().min(10, 'Descreva o relatório com ao menos 10 caracteres.').max(6000), local: z.string().max(200).optional().nullable(),
  spaceId: z.string().optional().nullable(), qrToken: z.string().max(80).optional().nullable(), prioridade: z.enum(PRIOR).default('MEDIA'),
  fotos: z.array(fotoSchema).max(6).optional(),
})

async function acesso(req: AuthenticatedRequest, s: { solicitanteUserId: string }) {
  return s.solicitanteUserId === getUserId(req) || isGestao(req) || ['COORDINATOR', 'FINANCE', 'SUPPLIES', 'SECRETARY', 'SUPPORT', 'STAFF'].includes(String(req.user?.role).toUpperCase())
}
const prazoVencido = (s: any, ref = new Date()) => !!s.prazo && ABERTAS.includes(s.status) && s.prazo < ref
const view = (s: any) => ({ ...s, prazoVencido: prazoVencido(s), cumpriuPrazo: s.resolvidoEm && s.prazo ? s.resolvidoEm <= s.prazo : null })

async function carregar(req: AuthenticatedRequest, res: Response) {
  const s = await prisma.inf2Solicitacao.findFirst({ where: { id: idParam(req), tenantId: getTenantId(req) } })
  if (!s) { res.status(404).json({ error: 'Solicitação não encontrada.' }); return null }
  if (!(await acesso(req, s))) { res.status(404).json({ error: 'Solicitação não encontrada.' }); return null }
  return s
}
const avisar = (tenantId: string, userId: string | null | undefined, assunto: string, mensagem: string, refId: string) =>
  userId ? notify({ tenantId, userId, assunto, mensagem, refType: 'Inf2Solicitacao', refId, templateKey: 'infra2.solicitacao' }).catch(() => null) : null

export function mountSolicitacoes(router: Router) {
  // ------------------------------------------------------------ QR das salas
  router.post('/qr-locais', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(z.object({ nome: z.string().min(2).max(160), spaceId: z.string().optional().nullable() }), req.body)
    if (b.spaceId && !(await prisma.eduSpace.findFirst({ where: { id: b.spaceId, tenantId } }))) fail(400, 'Espaço (spaceId) não encontrado.')
    const q = await prisma.inf2QrLocal.create({ data: { tenantId, nome: b.nome, spaceId: b.spaceId ?? null, token: 'IQ' + randomBytes(9).toString('base64url') } })
    res.status(201).json({ ...q, caminho: `/edu/infraestrutura?secao=solicitacoes&qr=${q.token}` })
  }))
  router.get('/qr-locais', requireRole(...GESTAO, 'COORDINATOR'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const rows = await prisma.inf2QrLocal.findMany({ where: { tenantId: getTenantId(req) }, orderBy: { nome: 'asc' }, take: 500 })
    res.json({ items: rows.map((q) => ({ ...q, caminho: `/edu/infraestrutura?secao=solicitacoes&qr=${q.token}` })), total: rows.length })
  }))
  router.delete('/qr-locais/:id', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const r = await prisma.inf2QrLocal.deleteMany({ where: { id: idParam(req), tenantId: getTenantId(req) } })
    if (!r.count) return res.status(404).json({ error: 'QR não encontrado.' })
    res.status(204).end()
  }))
  // resolve o QR lido no celular (qualquer usuário autenticado do tenant)
  router.get('/qr/:token', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const q = await prisma.inf2QrLocal.findFirst({ where: { token: String(req.params.token), tenantId: getTenantId(req), ativo: true } })
    if (!q) return res.status(404).json({ error: 'QR inválido ou desativado.' })
    res.json({ nome: q.nome, spaceId: q.spaceId, token: q.token })
  }))

  // ------------------------------------------------------------ solicitações
  router.post('/solicitacoes', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d = parseBody(criar, req.body)
    let { local, spaceId } = d
    let qrLocalId: string | null = null
    if (d.qrToken) {
      const q = await prisma.inf2QrLocal.findFirst({ where: { token: d.qrToken, tenantId, ativo: true } })
      if (!q) fail(400, 'QR inválido ou desativado.')
      qrLocalId = q.id; spaceId = spaceId ?? q.spaceId; local = local ?? q.nome
    }
    if (spaceId && !(await prisma.eduSpace.findFirst({ where: { id: spaceId, tenantId } }))) fail(400, 'Espaço (spaceId) não encontrado.')
    for (const f of d.fotos ?? []) if (!f.dataUrl && !f.arquivoUrl) fail(400, 'Cada foto precisa de dataUrl ou arquivoUrl.')
    const numero = await nextNum(tenantId, 'SOL', 'SOL')
    const nome = await nomeDe(req)
    const { fotos, qrToken, ...base } = d
    const s = await prisma.inf2Solicitacao.create({
      data: { ...base, local, spaceId, tenantId, numero, qrLocalId, origem: qrLocalId ? 'QR' : 'APP', solicitanteUserId: getUserId(req), solicitanteNome: nome },
    })
    for (const f of fotos ?? []) await criarAnexo(req, 'Solicitacao', s.id, f)
    for (const u of await usuariosComPapel(tenantId, ['FACILITIES'])) await avisar(tenantId, u.id, `Nova solicitação ${numero}`, `${d.tipo === 'PROBLEMA' ? 'Problema' : 'Implementação'} relatado: ${d.titulo}`, s.id)
    await audit({ tenantId, userId: getUserId(req), modulo: MOD2, acao: 'SOLICITACAO_CRIADA', refType: 'Inf2Solicitacao', refId: s.id, detalhes: { tipo: d.tipo, categoria: d.categoria, fotos: fotos?.length ?? 0 } })
    res.status(201).json(view(s))
  }))

  router.get('/solicitacoes/minhas', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where = { tenantId: getTenantId(req), solicitanteUserId: getUserId(req) }
    const [rows, total] = await Promise.all([prisma.inf2Solicitacao.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }), prisma.inf2Solicitacao.count({ where })])
    res.json({ items: rows.map(view), total, page, pageSize })
  }))

  router.get('/solicitacoes', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId: getTenantId(req) }
    for (const f of ['status', 'tipo', 'categoria', 'prioridade', 'responsavelUserId', 'solicitanteUserId', 'spaceId']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    if (qs(req.query.abertas) === 'true') where.status = { in: ABERTAS }
    if (qs(req.query.vencidas) === 'true') { where.status = { in: ABERTAS }; where.prazo = { lt: new Date() } }
    const q = qs(req.query.q)
    if (q) where.OR = [{ titulo: { contains: q, mode: 'insensitive' } }, { relatorio: { contains: q, mode: 'insensitive' } }, { numero: { contains: q, mode: 'insensitive' } }]
    const [rows, total] = await Promise.all([prisma.inf2Solicitacao.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }), prisma.inf2Solicitacao.count({ where })])
    res.json({ items: rows.map(view), total, page, pageSize })
  }))

  router.get('/solicitacoes/painel', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const todas = await prisma.inf2Solicitacao.findMany({ where: { tenantId }, take: 5000 })
    const cnt = (k: string) => todas.reduce<Record<string, number>>((m, s: any) => { m[s[k]] = (m[s[k]] ?? 0) + 1; return m }, {})
    const resolvidas = todas.filter((s) => s.resolvidoEm)
    const aval = todas.filter((s) => s.avaliacaoNota != null)
    res.json({
      total: todas.length, porStatus: cnt('status'), porCategoria: cnt('categoria'), porTipo: cnt('tipo'),
      abertas: todas.filter((s) => ABERTAS.includes(s.status)).length, vencidas: todas.filter((s) => prazoVencido(s)).length,
      novasSemTriagem: todas.filter((s) => s.status === 'NOVA').length,
      tempoMedioResolucaoDias: resolvidas.length ? money(resolvidas.reduce((a, s) => a + (s.resolvidoEm!.getTime() - s.createdAt.getTime()) / DAY, 0) / resolvidas.length) : null,
      avaliacaoMedia: aval.length ? money(aval.reduce((a, s) => a + (s.avaliacaoNota ?? 0), 0) / aval.length) : null,
      custoTotal: money(todas.reduce((a, s) => a + (s.custoFinal ?? 0), 0)),
    })
  }))

  router.get('/solicitacoes/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const s = await carregar(req, res); if (!s) return
    const dono = s.solicitanteUserId === getUserId(req) && !isGestao(req)
    const [comentarios, ordens, fotos] = await Promise.all([
      prisma.inf2SolicitacaoComentario.findMany({ where: { tenantId: s.tenantId, solicitacaoId: s.id, ...(dono ? { interno: false } : {}) }, orderBy: { createdAt: 'asc' } }),
      prisma.inf2OrdemServico.findMany({ where: { tenantId: s.tenantId, solicitacaoId: s.id }, orderBy: { createdAt: 'asc' } }),
      prisma.inf2Anexo.findMany({ where: { tenantId: s.tenantId, refType: 'Solicitacao', refId: s.id }, select: { id: true, nome: true, mime: true, tamanhoBytes: true, url: true, createdAt: true }, orderBy: { createdAt: 'asc' } }),
    ])
    res.json({ ...view(s), comentarios, ordens, fotos })
  }))

  router.post('/solicitacoes/:id/comentarios', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const s = await carregar(req, res); if (!s) return
    const b = parseBody(z.object({ texto: z.string().min(1).max(3000), interno: z.boolean().default(false) }), req.body)
    const gestor = isGestao(req)
    if (b.interno && !gestor) fail(403, 'Comentário interno é exclusivo da gestão.')
    const c = await prisma.inf2SolicitacaoComentario.create({ data: { tenantId: s.tenantId, solicitacaoId: s.id, userId: getUserId(req), autorNome: await nomeDe(req), texto: b.texto, interno: b.interno } })
    if (!b.interno) await avisar(s.tenantId, gestor ? s.solicitanteUserId : s.responsavelUserId, `Atualização ${s.numero}`, 'Há um novo comentário na solicitação.', s.id)
    res.status(201).json(c)
  }))

  router.post('/solicitacoes/:id/triagem', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const s = await carregar(req, res); if (!s) return
    if (!['NOVA', 'EM_TRIAGEM'].includes(s.status)) fail(409, 'A solicitação já passou da triagem.')
    const b = parseBody(z.object({
      decisao: z.enum(['ACEITAR', 'REJEITAR']), motivo: z.string().max(500).optional(), prioridade: z.enum(PRIOR).optional(), categoria: z.enum(CATEGORIAS_SOL).optional(),
      responsavelUserId: z.string().optional().nullable(), prazo: dateISO().optional().nullable(), custoEstimado: z.number().min(0).optional().nullable(),
    }), req.body)
    if (b.decisao === 'REJEITAR') {
      if (!b.motivo) fail(400, 'Informe o motivo da rejeição.')
      const r = await prisma.inf2Solicitacao.update({ where: { id: s.id }, data: { status: 'REJEITADA', motivoRejeicao: b.motivo, triadoPorId: getUserId(req), triadoEm: new Date() } })
      await avisar(tenantId, s.solicitanteUserId, `Solicitação ${s.numero} não aceita`, b.motivo, s.id)
      return res.json(view(r))
    }
    const respNome = await exigirUsuario(tenantId, b.responsavelUserId)
    const prioridade = b.prioridade ?? (s.prioridade as any)
    const prazo = b.prazo ?? new Date(Date.now() + (SLA_DIAS[prioridade] ?? 7) * DAY)
    const r = await prisma.inf2Solicitacao.update({
      where: { id: s.id },
      data: { status: 'EM_TRIAGEM', prioridade, categoria: b.categoria ?? s.categoria, responsavelUserId: b.responsavelUserId ?? s.responsavelUserId, responsavelNome: respNome ?? s.responsavelNome, prazo, custoEstimado: b.custoEstimado ?? s.custoEstimado, triadoPorId: getUserId(req), triadoEm: new Date() },
    })
    if (r.responsavelUserId) {
      await scheduleReminder({ tenantId, modulo: 'infraestrutura', titulo: `Solicitação ${r.numero}: ${r.titulo}`, dueAt: prazo, antecedenciaDias: 1, refType: 'Inf2Solicitacao', refId: r.id, assigneeUserId: r.responsavelUserId, dedupeKey: `inf2-sol-${r.id}` })
      await avisar(tenantId, r.responsavelUserId, `Solicitação ${r.numero} atribuída a você`, `Prazo: ${prazo.toLocaleDateString('pt-BR')}`, r.id)
    }
    await avisar(tenantId, s.solicitanteUserId, `Solicitação ${s.numero} em andamento`, 'Sua solicitação foi triada e tem prazo definido.', s.id)
    res.json(view(r))
  }))

  router.post('/solicitacoes/:id/gerar-os', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const s = await carregar(req, res); if (!s) return
    if (!['NOVA', 'EM_TRIAGEM', 'OS_GERADA', 'EM_ANDAMENTO', 'AGUARDANDO'].includes(s.status)) fail(409, 'Solicitação encerrada: não é possível gerar OS.')
    const b = parseBody(z.object({ responsavelUserId: z.string().optional().nullable(), equipeExterna: z.string().max(200).optional(), prazo: dateISO().optional().nullable(), custoPrevisto: z.number().min(0).optional(), descricao: z.string().max(3000).optional(), tipo: z.enum(['CORRETIVA', 'PREVENTIVA', 'IMPLEMENTACAO']).optional() }), req.body ?? {})
    const respId = b.responsavelUserId ?? s.responsavelUserId
    const respNome = respId ? await exigirUsuario(tenantId, respId) : null
    const prazo = b.prazo ?? s.prazo ?? new Date(Date.now() + (SLA_DIAS[s.prioridade] ?? 7) * DAY)
    const os = await prisma.inf2OrdemServico.create({
      data: { tenantId, numero: await nextNum(tenantId, 'OS2', 'OS'), solicitacaoId: s.id, titulo: s.titulo, descricao: b.descricao ?? s.relatorio, tipo: b.tipo ?? (s.tipo === 'IMPLEMENTACAO' ? 'IMPLEMENTACAO' : 'CORRETIVA'), prioridade: s.prioridade, responsavelUserId: respId, responsavelNome: respNome, equipeExterna: b.equipeExterna, prazo, custoPrevisto: b.custoPrevisto ?? s.custoEstimado ?? 0, criadoPorId: getUserId(req) },
    })
    await prisma.inf2Solicitacao.update({ where: { id: s.id }, data: { status: 'OS_GERADA', responsavelUserId: respId, responsavelNome: respNome, prazo, triadoPorId: s.triadoPorId ?? getUserId(req), triadoEm: s.triadoEm ?? new Date() } })
    await avisar(tenantId, s.solicitanteUserId, `Ordem de serviço ${os.numero} aberta`, `Sua solicitação ${s.numero} virou a OS ${os.numero}.`, s.id)
    await avisar(tenantId, respId, `OS ${os.numero} atribuída a você`, os.titulo, s.id)
    await audit({ tenantId, userId: getUserId(req), modulo: MOD2, acao: 'OS_GERADA', refType: 'Inf2OrdemServico', refId: os.id, detalhes: { solicitacaoId: s.id } })
    res.status(201).json(os)
  }))

  router.post('/solicitacoes/:id/resolver', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const s = await carregar(req, res); if (!s) return
    if (!ABERTAS.includes(s.status)) fail(409, 'Só solicitações abertas podem ser resolvidas.')
    const b = parseBody(z.object({ custoFinal: z.number().min(0).optional(), nota: z.string().max(3000).optional() }), req.body ?? {})
    const r = await resolverSolicitacao(s, b.custoFinal, b.nota, getUserId(req))
    res.json(view(r))
  }))

  router.post('/solicitacoes/:id/avaliar', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const s = await carregar(req, res); if (!s) return
    if (s.solicitanteUserId !== getUserId(req)) fail(403, 'Somente o solicitante avalia o atendimento.')
    if (s.status !== 'RESOLVIDA') fail(409, 'A avaliação é feita após a resolução.')
    const b = parseBody(z.object({ nota: z.number().int().min(1).max(5), comentario: z.string().max(1000).optional() }), req.body)
    const r = await prisma.inf2Solicitacao.update({ where: { id: s.id }, data: { avaliacaoNota: b.nota, avaliacaoComentario: b.comentario, avaliadoEm: new Date(), status: 'FECHADA', fechadoEm: new Date() } })
    res.json(view(r))
  }))
  router.post('/solicitacoes/:id/reabrir', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const s = await carregar(req, res); if (!s) return
    if (s.solicitanteUserId !== getUserId(req) && !isGestao(req)) fail(403, 'Sem permissão.')
    if (!['RESOLVIDA', 'FECHADA'].includes(s.status)) fail(409, 'Só solicitações resolvidas podem ser reabertas.')
    const b = parseBody(z.object({ motivo: z.string().min(3).max(500) }), req.body)
    const r = await prisma.inf2Solicitacao.update({ where: { id: s.id }, data: { status: 'EM_TRIAGEM', resolvidoEm: null, fechadoEm: null, avaliacaoNota: null, avaliacaoComentario: null, avaliadoEm: null } })
    await prisma.inf2SolicitacaoComentario.create({ data: { tenantId: s.tenantId, solicitacaoId: s.id, userId: getUserId(req), autorNome: await nomeDe(req), texto: `Reaberta: ${b.motivo}` } })
    res.json(view(r))
  }))
  router.post('/solicitacoes/:id/cancelar', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const s = await carregar(req, res); if (!s) return
    if (s.solicitanteUserId !== getUserId(req) && !isGestao(req)) fail(403, 'Sem permissão.')
    if (!['NOVA', 'EM_TRIAGEM'].includes(s.status)) fail(409, 'Só é possível cancelar antes da execução.')
    res.json(view(await prisma.inf2Solicitacao.update({ where: { id: s.id }, data: { status: 'CANCELADA' } })))
  }))

  // ------------------------------------------------------------ ordens de serviço
  router.post('/os', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(z.object({
      titulo: z.string().min(3).max(200), descricao: z.string().max(4000).optional(), tipo: z.enum(['CORRETIVA', 'PREVENTIVA', 'IMPLEMENTACAO']).default('CORRETIVA'), prioridade: z.enum(PRIOR).default('MEDIA'),
      responsavelUserId: z.string().optional().nullable(), equipeExterna: z.string().max(200).optional(), prazo: dateISO().optional().nullable(), custoPrevisto: z.number().min(0).default(0),
      solicitacaoId: z.string().optional().nullable(), agendaItemId: z.string().optional().nullable(),
    }), req.body)
    if (b.solicitacaoId && !(await prisma.inf2Solicitacao.findFirst({ where: { id: b.solicitacaoId, tenantId } }))) fail(400, 'Solicitação não encontrada.')
    if (b.agendaItemId && !(await prisma.inf2AgendaItem.findFirst({ where: { id: b.agendaItemId, tenantId } }))) fail(400, 'Item da agenda não encontrado.')
    const respNome = await exigirUsuario(tenantId, b.responsavelUserId)
    const os = await prisma.inf2OrdemServico.create({ data: { ...b, tenantId, numero: await nextNum(tenantId, 'OS2', 'OS'), responsavelNome: respNome, criadoPorId: getUserId(req) } })
    res.status(201).json(os)
  }))
  router.get('/os', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId: getTenantId(req) }
    for (const f of ['status', 'tipo', 'prioridade', 'responsavelUserId', 'solicitacaoId']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    if (qs(req.query.vencidas) === 'true') { where.status = { in: ['ABERTA', 'EM_EXECUCAO', 'AGUARDANDO_MATERIAL'] }; where.prazo = { lt: new Date() } }
    const [rows, total] = await Promise.all([prisma.inf2OrdemServico.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }), prisma.inf2OrdemServico.count({ where })])
    res.json({ items: rows, total, page, pageSize })
  }))
  router.get('/os/:id', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const o = await prisma.inf2OrdemServico.findFirst({ where: { id: idParam(req), tenantId: getTenantId(req) } })
    if (!o) return res.status(404).json({ error: 'OS não encontrada.' })
    const fotos = await prisma.inf2Anexo.findMany({ where: { tenantId: o.tenantId, refType: 'Ordem', refId: o.id }, select: { id: true, nome: true, mime: true, createdAt: true } })
    res.json({ ...o, fotos })
  }))
  router.patch('/os/:id', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const o = await prisma.inf2OrdemServico.findFirst({ where: { id: idParam(req), tenantId } })
    if (!o) return res.status(404).json({ error: 'OS não encontrada.' })
    if (['CONCLUIDA', 'CANCELADA'].includes(o.status)) fail(409, 'OS encerrada não pode ser alterada.')
    const b = parseBody(z.object({ titulo: z.string().min(3).max(200), descricao: z.string().max(4000), prioridade: z.enum(PRIOR), responsavelUserId: z.string().nullable(), equipeExterna: z.string().max(200), prazo: dateISO().nullable(), custoPrevisto: z.number().min(0), status: z.enum(['ABERTA', 'EM_EXECUCAO', 'AGUARDANDO_MATERIAL']) }).partial(), req.body)
    const data: any = { ...b }
    if (b.responsavelUserId !== undefined) data.responsavelNome = await exigirUsuario(tenantId, b.responsavelUserId)
    if (b.status === 'EM_EXECUCAO' && !o.iniciadaEm) data.iniciadaEm = new Date()
    const r = await prisma.inf2OrdemServico.update({ where: { id: o.id }, data })
    if (o.solicitacaoId && b.status === 'EM_EXECUCAO') await prisma.inf2Solicitacao.updateMany({ where: { id: o.solicitacaoId, tenantId, status: { in: ['OS_GERADA', 'EM_TRIAGEM', 'AGUARDANDO'] } }, data: { status: 'EM_ANDAMENTO' } })
    res.json(r)
  }))
  router.post('/os/:id/iniciar', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const o = await prisma.inf2OrdemServico.findFirst({ where: { id: idParam(req), tenantId } })
    if (!o) return res.status(404).json({ error: 'OS não encontrada.' })
    if (!['ABERTA', 'AGUARDANDO_MATERIAL'].includes(o.status)) fail(409, 'Só OS abertas podem ser iniciadas.')
    const r = await prisma.inf2OrdemServico.update({ where: { id: o.id }, data: { status: 'EM_EXECUCAO', iniciadaEm: o.iniciadaEm ?? new Date() } })
    if (o.solicitacaoId) await prisma.inf2Solicitacao.updateMany({ where: { id: o.solicitacaoId, tenantId, status: { in: ['OS_GERADA', 'EM_TRIAGEM', 'AGUARDANDO', 'NOVA'] } }, data: { status: 'EM_ANDAMENTO' } })
    res.json(r)
  }))
  router.post('/os/:id/concluir', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const o = await prisma.inf2OrdemServico.findFirst({ where: { id: idParam(req), tenantId } })
    if (!o) return res.status(404).json({ error: 'OS não encontrada.' })
    if (['CONCLUIDA', 'CANCELADA'].includes(o.status)) fail(409, 'OS já encerrada.')
    const b = parseBody(z.object({ custoReal: z.number().min(0).optional(), relatorioExecucao: z.string().min(5, 'Informe o relatório de execução.').max(6000) }), req.body)
    const agora = new Date()
    const r = await prisma.inf2OrdemServico.update({ where: { id: o.id }, data: { status: 'CONCLUIDA', concluidaEm: agora, iniciadaEm: o.iniciadaEm ?? agora, custoReal: b.custoReal ?? o.custoPrevisto, relatorioExecucao: b.relatorioExecucao, noPrazo: o.prazo ? agora <= o.prazo : null } })
    if (o.solicitacaoId) {
      const s = await prisma.inf2Solicitacao.findFirst({ where: { id: o.solicitacaoId, tenantId } })
      const abertas = await prisma.inf2OrdemServico.count({ where: { tenantId, solicitacaoId: o.solicitacaoId, status: { notIn: ['CONCLUIDA', 'CANCELADA'] } } })
      if (s && ABERTAS.includes(s.status) && abertas === 0) {
        const soma = (await prisma.inf2OrdemServico.findMany({ where: { tenantId, solicitacaoId: s.id, status: 'CONCLUIDA' } })).reduce((a, x) => a + (x.custoReal ?? 0), 0)
        await resolverSolicitacao(s, money(soma), undefined, getUserId(req))
      }
    }
    if (o.agendaItemId) await prisma.inf2AgendaItem.updateMany({ where: { id: o.agendaItemId, tenantId, status: { in: ['PLANEJADO', 'EM_ANDAMENTO'] } }, data: { status: 'CONCLUIDO', concluidoEm: agora, concluidoPorId: getUserId(req), custoReal: r.custoReal } })
    res.json(r)
  }))
  router.post('/os/:id/cancelar', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const o = await prisma.inf2OrdemServico.findFirst({ where: { id: idParam(req), tenantId: getTenantId(req) } })
    if (!o) return res.status(404).json({ error: 'OS não encontrada.' })
    if (['CONCLUIDA', 'CANCELADA'].includes(o.status)) fail(409, 'OS já encerrada.')
    res.json(await prisma.inf2OrdemServico.update({ where: { id: o.id }, data: { status: 'CANCELADA' } }))
  }))
}

async function resolverSolicitacao(s: any, custoFinal: number | undefined, nota: string | undefined, userId: string) {
  const r = await prisma.inf2Solicitacao.update({ where: { id: s.id }, data: { status: 'RESOLVIDA', resolvidoEm: new Date(), custoFinal: custoFinal ?? s.custoFinal ?? s.custoEstimado } })
  if (nota) await prisma.inf2SolicitacaoComentario.create({ data: { tenantId: s.tenantId, solicitacaoId: s.id, userId, autorNome: await nomeUsuario(s.tenantId, userId), texto: nota } })
  await completeReminders({ tenantId: s.tenantId, refType: 'Inf2Solicitacao', refId: s.id, userId })
  await avisar(s.tenantId, s.solicitanteUserId, `Solicitação ${s.numero} resolvida`, 'Avalie o atendimento na sua solicitação.', s.id)
  return r
}

/** Job: avisa responsáveis e gestão sobre solicitações com prazo vencido. */
export async function jobSolicitacoes() {
  const vencidas = await prisma.inf2Solicitacao.findMany({ where: { status: { in: ABERTAS }, prazo: { lt: new Date() } }, take: 1000 })
  for (const s of vencidas) await avisar(s.tenantId, s.responsavelUserId, `Prazo vencido: ${s.numero}`, s.titulo, s.id)
  return { vencidas: vencidas.length }
}
export function registerSolicitacoesJob() { registerEduJob('infra2.solicitacoes', () => jobSolicitacoes()) }
