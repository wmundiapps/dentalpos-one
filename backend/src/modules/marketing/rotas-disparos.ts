import { Router, Response } from 'express'
import { z } from 'zod'
import { AuthenticatedRequest, asyncHandler, requireRole } from '../academico/middleware'
import { mountCrud, pageParams, parseBody, qs } from '../core/crud'
import { audit } from '../core/notify'
import { resolverSegmento } from '../comunicacao/campanhas'
import { CANAIS_DISPARO, GESTAO, LEITURA, REDES, csv, db, fail, getConfig, normEmail, normFone, optStr, dt, tid, uid, ymd } from './common'
import { checarEnvio, estaSuprimido, reativar, suprimir } from './compliance'
import { enviar, processarAgendados, tratarEntrada } from './envio'
import { provedorRede, statusProvedores } from './providers'

const SUPER = ['ADMIN', 'OWNER', 'RECTOR', 'BOARD']
const ehSuper = (req: AuthenticatedRequest) => SUPER.includes(String(req.user?.role || '').toUpperCase())

interface Alvo { nome: string; email?: string | null; telefone?: string | null; telegram?: string | null; leadId?: string; candidatoId?: string; contatoId?: string; curso?: string | null; consultor?: string | null }
export const BASES = ['LEADS', 'ALUNOS', 'EX_ALUNOS', 'CONTATOS'] as const

export async function resolverAudiencia(tenantId: string, base: string, f: any = {}): Promise<Alvo[]> {
  f = f ?? {}
  if (base === 'LEADS') {
    const where: any = { tenantId }
    for (const k of ['etapa', 'origem', 'temperatura', 'campanhaId', 'consultorId']) if (f[k]) where[k] = f[k]
    if (f.curso) where.cursoInteresse = { contains: String(f.curso), mode: 'insensitive' }
    if (f.scoreMin != null) where.score = { gte: Number(f.scoreMin) }
    const ls = await db.mktLead.findMany({ where, take: 5000 })
    return ls.map((l: any) => ({ nome: l.nome, email: l.emailNorm, telefone: l.telefone, leadId: l.id, candidatoId: l.candidatoId ?? undefined, contatoId: l.contatoId ?? undefined, curso: l.cursoInteresse, consultor: l.consultorNome }))
  }
  const seg = base === 'ALUNOS' ? 'ALUNOS_ATIVOS' : base === 'EX_ALUNOS' ? 'EGRESSOS' : 'CONTATOS'
  const alvos = await resolverSegmento(tenantId, seg, { programId: f.programId ?? f.cursoId, tipo: f.tipo, tag: f.tag })
  return alvos.map((a) => ({ nome: a.nome, email: a.email, telefone: a.telefone, telegram: a.telegramChatId, contatoId: a.contatoId, curso: a.vars?.curso }))
}
const destinoDe = (canal: string, a: Alvo) => (canal === 'EMAIL' ? normEmail(a.email) : canal === 'TELEGRAM' ? a.telegram ?? null : normFone(a.telefone))

export async function previaDisparo(tenantId: string, canal: string, base: string, filtros: any, finalidade: string) {
  const alvos = await resolverAudiencia(tenantId, base, filtros)
  let semDestino = 0, suprimidos = 0, semOptIn = 0, aptos = 0
  const amostra: any[] = []
  for (const a of alvos) {
    const d = destinoDe(canal, a); if (!d) { semDestino++; continue }
    const v = await checarEnvio(tenantId, { canal, destino: d, finalidade, leadId: a.leadId, candidatoId: a.candidatoId, ignorarJanela: true })
    if (v.codigo === 'SUPRIMIDO' || v.codigo === 'OPT_OUT') suprimidos++
    else if (v.codigo === 'SEM_OPT_IN') semOptIn++
    else aptos++
    if (amostra.length < 5) amostra.push({ nome: a.nome, resultado: v.ok ? 'APTO' : v.codigo })
  }
  return { totalAlvo: alvos.length, aptos, suprimidos, semOptIn, semDestino, amostra }
}

export async function executarDisparo(tenantId: string, id: string, userId?: string) {
  const d = await db.mktDisparo.findFirst({ where: { id, tenantId } })
  if (!d) fail(404, 'Disparo não encontrado.')
  if (!['RASCUNHO', 'AGENDADO'].includes(d.status)) fail(409, `Disparo em ${d.status} não pode ser executado.`)
  if (d.campanhaId) { const c = await db.mktCampanha.findFirst({ where: { id: d.campanhaId, tenantId } }); if (!c || !['APROVADA', 'ATIVA'].includes(c.status)) fail(409, 'A campanha vinculada precisa estar aprovada ou ativa para disparar.') }
  const claim = await db.mktDisparo.updateMany({ where: { id, tenantId, status: { in: ['RASCUNHO', 'AGENDADO'] } }, data: { status: 'ENVIANDO', executadoEm: new Date() } })
  if (!claim.count) fail(409, 'Disparo já está em execução.')
  const alvos = await resolverAudiencia(tenantId, d.base, d.filtros)
  const vistos = new Set<string>(); const t = { alvo: alvos.length, enviado: 0, bloqueado: 0, agendado: 0, falha: 0 }
  for (const a of alvos) {
    const dest = destinoDe(d.canal, a); if (!dest || vistos.has(dest)) { t.bloqueado += dest ? 0 : 1; continue }
    vistos.add(dest)
    const e = await enviar({ tenantId, canal: d.canal, destino: dest, assunto: d.assunto, corpo: d.corpo, finalidade: d.finalidade, leadId: a.leadId, contatoId: a.contatoId, candidatoId: a.candidatoId, disparoId: d.id, campanhaId: d.campanhaId, vars: { nome: a.nome.split(' ')[0], nome_completo: a.nome, curso: a.curso ?? 'nossos cursos', consultor: a.consultor ?? 'nossa equipe' } })
    if (e.status === 'ENVIADO') t.enviado++; else if (e.status === 'BLOQUEADO') t.bloqueado++; else if (e.status === 'AGENDADO') t.agendado++; else t.falha++
  }
  const up = await db.mktDisparo.update({ where: { id }, data: { status: 'CONCLUIDO', totalAlvo: t.alvo, totalEnviado: t.enviado, totalBloqueado: t.bloqueado, totalAgendado: t.agendado, totalFalha: t.falha } })
  await audit({ tenantId, userId, modulo: 'marketing', acao: 'DISPARO_EXECUTADO', refType: 'MktDisparo', refId: id, detalhes: t })
  return up
}
export async function jobDisparos() {
  const due = await db.mktDisparo.findMany({ where: { status: 'AGENDADO', agendadoPara: { lte: new Date() } }, take: 20 })
  let n = 0
  for (const d of due) { try { await executarDisparo(d.tenantId, d.id); n++ } catch (e) { console.error('[mkt-disparo]', d.id, e) } }
  return { disparos: n, ...(await processarAgendados()) }
}
export async function jobPublicacoes() {
  const due = await db.mktPublicacao.findMany({ where: { status: { in: ['APROVADA', 'AGENDADA'] }, agendadoPara: { lte: new Date() } }, take: 50 })
  let ok = 0
  for (const p of due) { const r = await publicar(p); if (r.status === 'PUBLICADA') ok++ }
  return { publicadas: ok, avaliadas: due.length }
}
async function publicar(p: any) {
  const r = await provedorRede(p.rede).publicar({ texto: p.texto, midiaUrl: p.midiaUrl })
  const metr = r.ok ? { alcance: 200 + (p.texto.length * 7) % 900, curtidas: 20 + (p.texto.length * 3) % 120, cliques: 5 + (p.texto.length) % 40 } : undefined
  return db.mktPublicacao.update({ where: { id: p.id }, data: r.ok ? { status: 'PUBLICADA', publicadoEm: new Date(), externalId: r.externalId, urlPublica: r.url, simulado: r.simulado, erro: null, metricas: metr } : { status: 'FALHA', erro: r.erro, simulado: r.simulado } })
}

export function registerDisparos(r: Router) {
  r.get('/provedores', requireRole(...LEITURA), asyncHandler(async (_q: AuthenticatedRequest, res: Response) => res.json(statusProvedores())))
  mountCrud(r, { model: 'mktSegmento', path: '/segmentos', read: LEITURA, write: GESTAO, modulo: 'marketing', search: ['nome'], filters: ['base', 'ativo'], orderBy: { nome: 'asc' },
    create: z.object({ nome: z.string().min(3).max(120), base: z.enum(BASES).default('LEADS'), filtros: z.record(z.string(), z.any()).optional(), ativo: z.boolean().default(true) }) })

  r.post('/disparos/previa', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const b = parseBody(z.object({ canal: z.enum(CANAIS_DISPARO), base: z.enum(BASES).default('LEADS'), filtros: z.record(z.string(), z.any()).optional(), finalidade: z.enum(['MARKETING', 'TRANSACIONAL']).default('MARKETING') }), req.body)
    res.json(await previaDisparo(tid(req), b.canal, b.base, b.filtros, b.finalidade))
  }))
  r.get('/disparos', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { skip, take, page, pageSize } = pageParams(req.query); const where: any = { tenantId: tid(req) }
    for (const k of ['status', 'canal', 'campanhaId']) { const v = qs((req.query as any)[k]); if (v) where[k] = v }
    const [items, total] = await Promise.all([db.mktDisparo.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }), db.mktDisparo.count({ where })]); res.json({ items, total, page, pageSize })
  }))
  r.get('/disparos/:id', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const d = await db.mktDisparo.findFirst({ where: { id: String(req.params.id), tenantId } }); if (!d) fail(404, 'Disparo não encontrado.')
    const g = await db.mktEnvio.groupBy({ by: ['status'], where: { tenantId, disparoId: d.id }, _count: { _all: true } })
    const bl = await db.mktEnvio.groupBy({ by: ['motivo'], where: { tenantId, disparoId: d.id, status: 'BLOQUEADO' }, _count: { _all: true } })
    res.json({ ...d, envios: Object.fromEntries(g.map((x: any) => [x.status, x._count._all])), bloqueios: bl.map((x: any) => ({ motivo: x.motivo, total: x._count._all })) })
  }))
  r.post('/disparos', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ nome: z.string().min(3).max(150), campanhaId: optStr(80), canal: z.enum(CANAIS_DISPARO), segmentoId: optStr(80), base: z.enum(BASES).default('LEADS'), filtros: z.record(z.string(), z.any()).optional(), assunto: optStr(200), corpo: z.string().min(3).max(4000), finalidade: z.enum(['MARKETING', 'TRANSACIONAL']).default('MARKETING'), baseLegal: z.string().max(40).optional(), agendadoPara: dt() }), req.body)
    if (b.canal === 'EMAIL' && !b.assunto) fail(400, 'E-mail exige assunto.')
    let { base, filtros } = b
    if (b.segmentoId) { const s = await db.mktSegmento.findFirst({ where: { id: b.segmentoId, tenantId, ativo: true } }); if (!s) fail(404, 'Segmento não encontrado.'); base = s.base; filtros = s.filtros ?? undefined }
    let baseLegal = b.baseLegal ?? 'CONSENTIMENTO'
    if (b.campanhaId) { const c = await db.mktCampanha.findFirst({ where: { id: b.campanhaId, tenantId } }); if (!c) fail(404, 'Campanha não encontrada.'); baseLegal = b.baseLegal ?? c.baseLegal }
    if (b.finalidade === 'MARKETING' && !['CONSENTIMENTO', 'LEGITIMO_INTERESSE'].includes(baseLegal)) fail(400, 'Disparo de marketing exige base legal de consentimento ou legítimo interesse (o opt-in continua exigido pelo sistema).')
    if (b.agendadoPara && b.agendadoPara.getTime() < Date.now() - 60_000) fail(400, 'A data de agendamento está no passado.')
    const d = await db.mktDisparo.create({ data: { tenantId, nome: b.nome, campanhaId: b.campanhaId ?? undefined, canal: b.canal, segmentoId: b.segmentoId ?? undefined, base, filtros: filtros as any, assunto: b.assunto ?? undefined, corpo: b.corpo, finalidade: b.finalidade, baseLegal, status: b.agendadoPara ? 'AGENDADO' : 'RASCUNHO', agendadoPara: b.agendadoPara, criadoPorId: uid(req) } })
    await audit({ tenantId, userId: uid(req), modulo: 'marketing', acao: 'CRIAR', refType: 'MktDisparo', refId: d.id }); res.status(201).json(d)
  }))
  r.post('/disparos/:id/executar', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => res.json(await executarDisparo(tid(req), String(req.params.id), uid(req)))))
  r.post('/disparos/:id/cancelar', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const d = await db.mktDisparo.findFirst({ where: { id: String(req.params.id), tenantId } }); if (!d) fail(404, 'Disparo não encontrado.')
    if (!['RASCUNHO', 'AGENDADO'].includes(d.status)) fail(409, `Disparo em ${d.status} não pode ser cancelado.`)
    await db.mktEnvio.updateMany({ where: { tenantId, disparoId: d.id, status: 'AGENDADO' }, data: { status: 'CANCELADO', motivo: 'Disparo cancelado' } })
    res.json(await db.mktDisparo.update({ where: { id: d.id }, data: { status: 'CANCELADO' } }))
  }))
  r.post('/envios/processar', requireRole(...GESTAO), asyncHandler(async (_q: AuthenticatedRequest, res: Response) => res.json(await jobDisparos())))
  r.get('/envios', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { skip, take, page, pageSize } = pageParams(req.query); const where: any = { tenantId: tid(req) }
    for (const k of ['status', 'canal', 'disparoId', 'leadId', 'campanhaId']) { const v = qs((req.query as any)[k]); if (v) where[k] = v }
    const [rows, total] = await Promise.all([db.mktEnvio.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }), db.mktEnvio.count({ where })])
    const { mask } = await import('./common')
    res.json({ items: rows.map((e: any) => ({ ...e, destino: mask(e.canal === 'EMAIL' ? 'EMAIL' : e.canal === 'TELEGRAM' ? 'TELEGRAM' : 'TELEFONE', e.destino), corpo: undefined, tokenDescadastro: undefined })), total, page, pageSize })
  }))
  // envio avulso (1:1) — também passa pela conformidade
  r.post('/envios', requireRole(...GESTAO, 'ADMISSIONS'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const b = parseBody(z.object({ leadId: z.string(), canal: z.enum(CANAIS_DISPARO), assunto: optStr(200), corpo: z.string().min(3).max(4000), finalidade: z.enum(['MARKETING', 'TRANSACIONAL']).default('TRANSACIONAL') }), req.body)
    const tenantId = tid(req); const l = await db.mktLead.findFirst({ where: { id: b.leadId, tenantId } }); if (!l) fail(404, 'Lead não encontrado.')
    const dest = b.canal === 'EMAIL' ? l.emailNorm : l.telefone; if (!dest) fail(400, `Lead sem destino para ${b.canal}.`)
    const e = await enviar({ tenantId, canal: b.canal, destino: dest, assunto: b.assunto, corpo: b.corpo, finalidade: b.finalidade, leadId: l.id, candidatoId: l.candidatoId, contatoId: l.contatoId, vars: { nome: l.nome.split(' ')[0], curso: l.cursoInteresse ?? '' } })
    res.status(201).json({ id: e.id, status: e.status, motivo: e.motivo })
  }))

  // ---------------------------------------------------------------- redes sociais (publicação/agendamento)
  const pubSchema = z.object({ campanhaId: optStr(80), pecaId: optStr(80), rede: z.enum(REDES), texto: z.string().min(3).max(3000), midiaUrl: optStr(500), agendadoPara: dt() })
  r.get('/publicacoes', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { skip, take, page, pageSize } = pageParams(req.query); const where: any = { tenantId: tid(req) }
    for (const k of ['status', 'rede', 'campanhaId']) { const v = qs((req.query as any)[k]); if (v) where[k] = v }
    const [items, total] = await Promise.all([db.mktPublicacao.findMany({ where, orderBy: [{ agendadoPara: 'desc' }, { createdAt: 'desc' }], skip, take }), db.mktPublicacao.count({ where })]); res.json({ items, total, page, pageSize })
  }))
  r.post('/publicacoes', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const b = parseBody(pubSchema, req.body)
    if (b.midiaUrl && !/^(https?:\/\/|\/)/i.test(b.midiaUrl)) fail(400, 'URL de mídia inválida.')
    if (b.pecaId && !(await db.mktPeca.findFirst({ where: { id: b.pecaId, tenantId }, select: { id: true } }))) fail(404, 'Peça não encontrada.')
    if (b.campanhaId && !(await db.mktCampanha.findFirst({ where: { id: b.campanhaId, tenantId }, select: { id: true } }))) fail(404, 'Campanha não encontrada.')
    const p = await db.mktPublicacao.create({ data: { ...b, tenantId, criadoPorId: uid(req) } as any }); res.status(201).json(p)
  }))
  r.patch('/publicacoes/:id', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const p = await db.mktPublicacao.findFirst({ where: { id: String(req.params.id), tenantId } }); if (!p) fail(404, 'Publicação não encontrada.')
    if (['PUBLICADA', 'CANCELADA'].includes(p.status)) fail(409, 'Publicação encerrada não pode ser editada.')
    const b = parseBody(pubSchema.partial(), req.body)
    res.json(await db.mktPublicacao.update({ where: { id: p.id }, data: { ...b, ...(['APROVADA', 'AGENDADA'].includes(p.status) ? { status: 'EM_APROVACAO', aprovadoPorId: null } : {}) } as any }))
  }))
  const acaoPub = (rota: string, de: string[], para: string, perm: any, extra?: (p: any, req: AuthenticatedRequest) => any) => r.post(`/publicacoes/:id/${rota}`, perm, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const p = await db.mktPublicacao.findFirst({ where: { id: String(req.params.id), tenantId } }); if (!p) fail(404, 'Publicação não encontrada.')
    if (!de.includes(p.status)) fail(409, `Ação indisponível para publicação em ${p.status}.`)
    if (rota === 'aprovar' && p.criadoPorId === uid(req) && !ehSuper(req)) fail(403, 'Segregação de função: quem criou a publicação não pode aprová-la.')
    if (rota === 'agendar') { const d = qs(req.body?.agendadoPara) ? new Date(String(qs(req.body.agendadoPara))) : p.agendadoPara; if (!d || isNaN(+d)) fail(400, 'Informe a data de agendamento.'); req.body = { agendadoPara: d } }
    res.json(await db.mktPublicacao.update({ where: { id: p.id }, data: { status: para, ...(extra ? extra(p, req) : {}) } }))
  }))
  acaoPub('enviar-aprovacao', ['RASCUNHO'], 'EM_APROVACAO', requireRole(...GESTAO))
  acaoPub('aprovar', ['EM_APROVACAO'], 'APROVADA', requireRole('COORDINATOR'), (_p, req) => ({ aprovadoPorId: uid(req) }))
  acaoPub('agendar', ['APROVADA', 'AGENDADA'], 'AGENDADA', requireRole(...GESTAO), (_p, req) => ({ agendadoPara: req.body.agendadoPara }))
  acaoPub('cancelar', ['RASCUNHO', 'EM_APROVACAO', 'APROVADA', 'AGENDADA', 'FALHA'], 'CANCELADA', requireRole(...GESTAO))
  r.post('/publicacoes/:id/publicar', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const p = await db.mktPublicacao.findFirst({ where: { id: String(req.params.id), tenantId } }); if (!p) fail(404, 'Publicação não encontrada.')
    if (!['APROVADA', 'AGENDADA', 'FALHA'].includes(p.status)) fail(409, 'Somente publicações aprovadas podem ser publicadas.')
    if (p.status === 'FALHA' && !p.aprovadoPorId) fail(409, 'Publicação sem aprovação.')
    res.json(await publicar(p))
  }))

  // ---------------------------------------------------------------- conformidade LGPD
  r.get('/conformidade/supressao', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { skip, take, page, pageSize } = pageParams(req.query); const where: any = { tenantId: tid(req) }
    if (qs(req.query.ativo) !== 'todos') where.ativo = qs(req.query.ativo) !== 'false'
    const [items, total] = await Promise.all([db.mktSupressao.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take, select: { id: true, tipo: true, mascarado: true, motivo: true, canalOrigem: true, ativo: true, createdAt: true, removidoEm: true, motivoRemocao: true } }), db.mktSupressao.count({ where })]); res.json({ items, total, page, pageSize })
  }))
  r.post('/conformidade/supressao', requireRole(...GESTAO, 'SECRETARY', 'ADMISSIONS'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const b = parseBody(z.object({ email: optStr(150), telefone: optStr(30), telegram: optStr(60), documento: optStr(20), motivo: z.enum(['ATENDENTE', 'SOLICITACAO_TITULAR', 'RECLAMACAO', 'IMPORTACAO']).default('ATENDENTE'), observacao: optStr(300) }), req.body)
    if (!normEmail(b.email) && !normFone(b.telefone) && !b.telegram && !b.documento) fail(400, 'Informe ao menos um identificador (e-mail, telefone, Telegram ou CPF).')
    res.status(201).json(await suprimir(tid(req), b, b.motivo, { observacao: b.observacao ?? undefined, userId: uid(req), canalOrigem: 'MANUAL' }))
  }))
  r.post('/conformidade/supressao/importar', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const b = parseBody(z.object({ itens: z.array(z.object({ email: optStr(150), telefone: optStr(30) })).min(1).max(5000) }), req.body)
    let novos = 0; for (const i of b.itens) if (normEmail(i.email) || normFone(i.telefone)) novos += (await suprimir(tid(req), i, 'IMPORTACAO', { userId: uid(req), canalOrigem: 'IMPORTACAO' })).novos
    res.status(201).json({ recebidos: b.itens.length, novos })
  }))
  r.post('/conformidade/supressao/:id/remover', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const b = parseBody(z.object({ motivo: z.string().min(15).max(500) }), req.body) // exige justificativa (novo opt-in do titular)
    await reativar(tid(req), String(req.params.id), uid(req), b.motivo); res.json({ ok: true })
  }))
  r.post('/conformidade/verificar', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const b = parseBody(z.object({ canal: z.enum(CANAIS_DISPARO), destino: z.string().min(3).max(200), finalidade: z.enum(['MARKETING', 'TRANSACIONAL']).default('MARKETING') }), req.body)
    const v = await checarEnvio(tid(req), { ...b }); res.json({ permitido: v.ok, motivo: v.motivo, codigo: v.codigo, adiarPara: v.adiarPara })
  }))
  r.get('/conformidade/consentimentos', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { skip, take, page, pageSize } = pageParams(req.query); const where: any = { tenantId: tid(req) }
    const st = qs(req.query.status); if (st === 'ativos') where.revogadoEm = null; if (st === 'revogados') where.revogadoEm = { not: null }
    const [items, total] = await Promise.all([db.mktConsentimento.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take, select: { id: true, leadId: true, email: true, titularNome: true, finalidade: true, baseLegal: true, canais: true, textoVersao: true, textoHash: true, origem: true, createdAt: true, revogadoEm: true, motivoRevogacao: true } }), db.mktConsentimento.count({ where })]); res.json({ items, total, page, pageSize })
  }))
  r.get('/conformidade/prova/:leadId', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const l = await db.mktLead.findFirst({ where: { id: String(req.params.leadId), tenantId } }); if (!l) fail(404, 'Lead não encontrado.')
    const itens = await db.mktConsentimento.findMany({ where: { tenantId, leadId: l.id }, orderBy: { createdAt: 'asc' } })
    await audit({ tenantId, userId: uid(req), modulo: 'marketing', acao: 'PROVA_CONSENTIMENTO_CONSULTADA', refType: 'MktLead', refId: l.id })
    res.json({ lead: { id: l.id, nome: l.nome, origem: l.origem }, consentimentos: itens.map((c: any) => ({ ...c, emailHash: undefined, telefoneHash: undefined })) })
  }))
  const relatorio = async (tenantId: string) => {
    const desde = new Date(Date.now() - 30 * 86_400_000)
    const [supAtivas, supMotivo, consAtivos, consRev, bloqueios, enviados, leadsMk, leadsMkSemProva, campSemBase, cfg, disparoMk] = await Promise.all([
      db.mktSupressao.count({ where: { tenantId, ativo: true } }),
      db.mktSupressao.groupBy({ by: ['motivo'], where: { tenantId, ativo: true }, _count: { _all: true } }),
      db.mktConsentimento.count({ where: { tenantId, revogadoEm: null, concedido: true } }), db.mktConsentimento.count({ where: { tenantId, revogadoEm: { not: null } } }),
      db.mktEnvio.findMany({ where: { tenantId, status: 'BLOQUEADO', createdAt: { gte: desde } }, select: { motivo: true, canal: true } }),
      db.mktEnvio.groupBy({ by: ['canal'], where: { tenantId, status: { in: ['ENVIADO', 'ENTREGUE', 'LIDO'] }, createdAt: { gte: desde } }, _count: { _all: true } }),
      db.mktLead.count({ where: { tenantId, consentimentoMarketing: true } }),
      db.mktLead.count({ where: { tenantId, consentimentoMarketing: true, NOT: { id: { in: (await db.mktConsentimento.findMany({ where: { tenantId, leadId: { not: null }, finalidade: 'MARKETING', concedido: true }, select: { leadId: true }, take: 50000 })).map((x: any) => x.leadId) } } } }),
      db.mktCampanha.count({ where: { tenantId, finalidade: 'MARKETING', baseLegal: { notIn: ['CONSENTIMENTO', 'LEGITIMO_INTERESSE'] } } }),
      getConfig(tenantId),
      db.mktDisparo.count({ where: { tenantId, finalidade: 'MARKETING', status: 'CONCLUIDO', createdAt: { gte: desde } } }),
    ])
    const porMotivo: Record<string, number> = {}; for (const b of bloqueios) { const k = String(b.motivo || 'Outro').replace(/\(.*\)/, '').trim(); porMotivo[k] = (porMotivo[k] ?? 0) + 1 }
    const problemas: string[] = []
    if (leadsMkSemProva > 0) problemas.push(`${leadsMkSemProva} lead(s) com opt-in de marketing sem prova de consentimento registrada.`)
    if (campSemBase > 0) problemas.push(`${campSemBase} campanha(s) de marketing sem base legal adequada.`)
    if (!cfg.remetenteEndereco) problemas.push('Endereço do remetente não configurado (exigido no rodapé de e-mails).')
    if (!cfg.contatoDpo) problemas.push('Contato do encarregado (DPO) não configurado.')
    return { geradoEm: new Date(), periodoDias: 30, supressao: { ativos: supAtivas, porMotivo: Object.fromEntries(supMotivo.map((x: any) => [x.motivo, x._count._all])) }, consentimentos: { ativos: consAtivos, revogados: consRev, leadsComOptIn: leadsMk, leadsComOptInSemProva: leadsMkSemProva },
      bloqueiosPorMotivo: porMotivo, totalBloqueios: bloqueios.length, enviadosPorCanal: Object.fromEntries(enviados.map((x: any) => [x.canal, x._count._all])), disparosMarketing: disparoMk,
      politicas: { janela: `${cfg.janelaInicio}-${cfg.janelaFim}`, diasPermitidos: cfg.diasPermitidos, limiteDia: cfg.limiteDia, limiteSemana: cfg.limiteSemana, descadastro1Clique: true, supressaoGlobal: true, optInObrigatorioMarketing: true }, problemas, conforme: problemas.length === 0 }
  }
  r.get('/conformidade/painel', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => res.json(await relatorio(tid(req)))))
  r.get('/conformidade/relatorio.csv', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const rel = await relatorio(tid(req)); const rows: any[] = []
    rows.push({ secao: 'supressao', item: 'ativos', valor: rel.supressao.ativos }); for (const [k, v] of Object.entries(rel.supressao.porMotivo)) rows.push({ secao: 'supressao', item: k, valor: v })
    rows.push({ secao: 'consentimentos', item: 'ativos', valor: rel.consentimentos.ativos }, { secao: 'consentimentos', item: 'revogados', valor: rel.consentimentos.revogados })
    for (const [k, v] of Object.entries(rel.bloqueiosPorMotivo)) rows.push({ secao: 'bloqueios_30d', item: k, valor: v })
    for (const [k, v] of Object.entries(rel.enviadosPorCanal)) rows.push({ secao: 'enviados_30d', item: k, valor: v })
    for (const p of rel.problemas) rows.push({ secao: 'pendencia', item: p, valor: 1 })
    await audit({ tenantId: tid(req), userId: uid(req), modulo: 'marketing', acao: 'RELATORIO_CONFORMIDADE_EXPORTADO' })
    res.type('text/csv; charset=utf-8').send(csv(rows, ['secao', 'item', 'valor']))
  }))
  void ymd; void estaSuprimido; void tratarEntrada
}
