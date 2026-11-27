import { Router, Response } from 'express'
import { z } from 'zod'
import { AuthenticatedRequest, asyncHandler, requireRole } from '../academico/middleware'
import { mountCrud, pageParams, parseBody, qs } from '../core/crud'
import { audit } from '../core/notify'
import { prisma } from '../../lib/prisma'
import { ATENDE, CANAIS_DISPARO, GESTAO, LEITURA, REDES, csv, db, dt, dtReq, fail, historico, marca, money, normEmail, optStr, publicBase, slugify, tid, token, uid } from './common'
import { processarMensagem } from './atendimento'
import { blocosSeguros } from './logic'
import { capturarLead, registrarEvento } from './leads'
import { enviar } from './envio'
import { mascararEmail, mascararTelefone } from '../lgpd/mascara'

export const TIPOS_BLOCO = ['HERO', 'TEXTO', 'CURSOS', 'SIMULADOR', 'FORM', 'FAQ', 'EVENTOS', 'DEPOIMENTOS', 'CTA', 'CHAT', 'NUMEROS'] as const
const blocoSchema = z.object({ tipo: z.enum(TIPOS_BLOCO), titulo: optStr(200), texto: optStr(3000), imagemUrl: optStr(500), botaoRotulo: optStr(60), botaoUrl: optStr(500), formularioSlug: optStr(60), itens: z.array(z.record(z.string(), z.any())).max(30).optional() })
const SUPER = ['ADMIN', 'OWNER', 'RECTOR', 'BOARD']
const ehSuper = (req: AuthenticatedRequest) => SUPER.includes(String(req.user?.role || '').toUpperCase())

export function registerSite(r: Router) {
  // ---------------------------------------------------------------- site
  r.get('/site', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const s = await db.mktSite.findUnique({ where: { tenantId } })
    const paginas = await db.mktPagina.findMany({ where: { tenantId }, orderBy: [{ ordem: 'asc' }, { createdAt: 'asc' }], select: { id: true, slug: true, titulo: true, tipo: true, status: true, visitas: true, conversoes: true, noMenu: true, publicadoEm: true, updatedAt: true } })
    res.json({ site: s, paginas, urlPublica: s ? `${publicBase()}/site/${s.slug}` : null })
  }))
  r.put('/site', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ slug: optStr(50), nome: z.string().min(2).max(120), descricao: optStr(300), corPrimaria: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullish(), corSecundaria: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullish(), logoUrl: optStr(500), ativo: z.boolean().default(true), chatAtivo: z.boolean().default(true), whatsapp: optStr(30), rodape: optStr(500) }), req.body)
    if (b.logoUrl && !/^(https?:\/\/|\/)/i.test(b.logoUrl)) fail(400, 'URL do logotipo inválida.')
    const cur = await db.mktSite.findUnique({ where: { tenantId } })
    const slug = slugify(b.slug || cur?.slug || b.nome)
    const outro = await db.mktSite.findUnique({ where: { slug } }); if (outro && outro.tenantId !== tenantId) fail(409, 'Este endereço já está em uso por outra instituição.')
    const s = await db.mktSite.upsert({ where: { tenantId }, create: { ...b, slug, tenantId } as any, update: { ...b, slug } as any })
    await audit({ tenantId, userId: uid(req), modulo: 'marketing', acao: 'SITE_SALVO', refType: 'MktSite', refId: s.id }); res.json(s)
  }))
  const pagSchema = z.object({ slug: optStr(60), titulo: z.string().min(2).max(150), tipo: z.enum(['HOME', 'LANDING', 'CURSO', 'EVENTO', 'FAQ']).default('LANDING'), blocos: z.array(blocoSchema).max(30).default([]), seoTitulo: optStr(70), seoDescricao: optStr(160), campanhaId: optStr(80), noMenu: z.boolean().default(false), ordem: z.number().int().min(0).max(999).default(0) })
  r.get('/paginas/:id', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => { const p = await db.mktPagina.findFirst({ where: { id: String(req.params.id), tenantId: tid(req) } }); if (!p) fail(404, 'Página não encontrada.'); res.json(p) }))
  r.post('/paginas', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const b = parseBody(pagSchema, req.body); const bad = blocosSeguros(b.blocos); if (bad) fail(400, bad)
    if (!(await db.mktSite.findUnique({ where: { tenantId } }))) fail(409, 'Configure o site (endereço público) antes de criar páginas.')
    const slug = slugify(b.slug || b.titulo); if (await db.mktPagina.findUnique({ where: { tenantId_slug: { tenantId, slug } } })) fail(409, 'Já existe página com este endereço.')
    const p = await db.mktPagina.create({ data: { ...b, slug, tenantId } as any }); await audit({ tenantId, userId: uid(req), modulo: 'marketing', acao: 'CRIAR', refType: 'MktPagina', refId: p.id }); res.status(201).json(p)
  }))
  r.patch('/paginas/:id', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const cur = await db.mktPagina.findFirst({ where: { id: String(req.params.id), tenantId } }); if (!cur) fail(404, 'Página não encontrada.')
    const b = parseBody(pagSchema.partial(), req.body); if (b.blocos) { const bad = blocosSeguros(b.blocos); if (bad) fail(400, bad) }
    const { slug: _s, ...rest } = b as any; res.json(await db.mktPagina.update({ where: { id: cur.id }, data: rest }))
  }))
  r.post('/paginas/:id/publicar', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const cur = await db.mktPagina.findFirst({ where: { id: String(req.params.id), tenantId } }); if (!cur) fail(404, 'Página não encontrada.')
    if (!cur.seoTitulo || !cur.seoDescricao) fail(400, 'Preencha título e descrição de SEO antes de publicar.')
    if (!Array.isArray(cur.blocos) || !cur.blocos.length) fail(400, 'Adicione ao menos um bloco antes de publicar.')
    const bl: any[] = cur.blocos as any[]
    for (const b of bl) if (b.tipo === 'FORM') { const f = b.formularioSlug ? await db.mktFormulario.findFirst({ where: { tenantId, slug: b.formularioSlug, ativo: true } }) : null; if (!f) fail(400, 'Bloco de formulário aponta para um formulário inexistente ou inativo.') }
    const s = await db.mktSite.findUnique({ where: { tenantId } })
    res.json({ ...(await db.mktPagina.update({ where: { id: cur.id }, data: { status: 'PUBLICADA', publicadoEm: new Date() } })), url: s ? `${publicBase()}/site/${s.slug}/${cur.slug}` : null })
  }))
  r.post('/paginas/:id/despublicar', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const cur = await db.mktPagina.findFirst({ where: { id: String(req.params.id), tenantId } }); if (!cur) fail(404, 'Página não encontrada.')
    res.json(await db.mktPagina.update({ where: { id: cur.id }, data: { status: 'RASCUNHO' } }))
  }))
  r.delete('/paginas/:id', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const cur = await db.mktPagina.findFirst({ where: { id: String(req.params.id), tenantId } }); if (!cur) fail(404, 'Página não encontrada.')
    await db.mktPagina.delete({ where: { id: cur.id } }); res.json({ ok: true })
  }))

  // ---------------------------------------------------------------- atendimento IA (equipe)
  r.get('/atendimentos', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { skip, take, page, pageSize } = pageParams(req.query); const where: any = { tenantId: tid(req) }
    for (const k of ['status', 'canal', 'consultorId']) { const v = qs((req.query as any)[k]); if (v) where[k] = v }
    const [items, total] = await Promise.all([db.mktAtendimento.findMany({ where, orderBy: { ultimaMensagemEm: 'desc' }, skip, take }), db.mktAtendimento.count({ where })]); res.json({ items, total, page, pageSize })
  }))
  r.get('/atendimentos/:id', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const a = await db.mktAtendimento.findFirst({ where: { id: String(req.params.id), tenantId: tid(req) }, include: { mensagens: { orderBy: { createdAt: 'asc' }, take: 300 } } }); if (!a) fail(404, 'Atendimento não encontrado.'); res.json(a)
  }))
  // Simula/recebe mensagem de um canal (em produção, o webhook do provedor chamaria o mesmo fluxo).
  r.post('/atendimentos/entrada', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const b = parseBody(z.object({ canal: z.enum(['SITE', 'WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'TELEGRAM', 'EMAIL', 'LINKEDIN', 'TIKTOK', 'THREADS', 'SMS']), remetente: z.string().min(2).max(120), texto: z.string().min(1).max(2000), nome: optStr(100), leadId: optStr(80) }), req.body)
    if (b.leadId && !(await db.mktLead.findFirst({ where: { id: b.leadId, tenantId: tid(req) }, select: { id: true } }))) fail(404, 'Lead não encontrado.')
    res.status(201).json(await processarMensagem({ tenantId: tid(req), canal: b.canal, sessao: b.remetente, texto: b.texto, nome: b.nome ?? undefined, leadId: b.leadId ?? undefined, clinicId: (req.user as any)?.clinicId }))
  }))
  r.post('/atendimentos/:id/responder', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const a = await db.mktAtendimento.findFirst({ where: { id: String(req.params.id), tenantId } }); if (!a) fail(404, 'Atendimento não encontrado.')
    const b = parseBody(z.object({ texto: z.string().min(1).max(2000) }), req.body)
    const m = await db.mktAtendimentoMsg.create({ data: { tenantId, atendimentoId: a.id, autor: 'CONSULTOR', texto: b.texto } })
    await db.mktAtendimento.update({ where: { id: a.id }, data: { status: 'ESCALONADO', ultimaMensagemEm: new Date() } }); res.status(201).json(m)
  }))
  r.post('/atendimentos/:id/assumir', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const a = await db.mktAtendimento.findFirst({ where: { id: String(req.params.id), tenantId } }); if (!a) fail(404, 'Atendimento não encontrado.')
    const c = await db.mktConsultor.findFirst({ where: { tenantId, userId: uid(req), ativo: true } })
    res.json(await db.mktAtendimento.update({ where: { id: a.id }, data: { status: 'ESCALONADO', consultorId: c?.id ?? a.consultorId, consultorNome: c?.nome ?? a.consultorNome ?? 'Equipe', motivoEscalonamento: a.motivoEscalonamento ?? 'Assumido pela equipe' } }))
  }))
  r.post('/atendimentos/:id/encerrar', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const a = await db.mktAtendimento.findFirst({ where: { id: String(req.params.id), tenantId } }); if (!a) fail(404, 'Atendimento não encontrado.')
    res.json(await db.mktAtendimento.update({ where: { id: a.id }, data: { status: 'ENCERRADO' } }))
  }))

  // ---------------------------------------------------------------- eventos
  const evSchema = z.object({ titulo: z.string().min(3).max(150), slug: optStr(60), descricao: optStr(3000), tipo: z.enum(['PALESTRA', 'OPEN_DAY', 'WORKSHOP', 'FEIRA', 'VESTIBULAR', 'VISITA', 'AULA_ABERTA', 'OUTRO']).default('PALESTRA'), inicio: dtReq(), fim: dt(), local: optStr(200), online: z.boolean().default(false), linkOnline: optStr(300), vagas: z.number().int().min(0).max(100000).default(0), publico: z.boolean().default(true), campanhaId: optStr(80), custo: money().default(0) })
  r.get('/eventos', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const where: any = { tenantId }; const st = qs(req.query.status); if (st) where.status = st
    const rows = await db.mktEvento.findMany({ where, orderBy: { inicio: 'desc' }, take: 200 })
    const g = await db.mktEventoInscricao.groupBy({ by: ['eventoId', 'status'], where: { tenantId }, _count: { _all: true } })
    res.json({ items: rows.map((e: any) => { const x = Object.fromEntries(g.filter((i: any) => i.eventoId === e.id).map((i: any) => [i.status, i._count._all])) as Record<string, number>; return { ...e, checkinToken: undefined, inscritos: (x.INSCRITO ?? 0) + (x.PRESENTE ?? 0), presentes: x.PRESENTE ?? 0, listaEspera: x.LISTA_ESPERA ?? 0 } }), total: rows.length })
  }))
  r.post('/eventos', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const b = parseBody(evSchema, req.body); if (b.fim && b.fim < b.inicio) fail(400, 'O fim do evento é anterior ao início.')
    if (b.online && b.linkOnline && !/^https?:\/\//i.test(b.linkOnline)) fail(400, 'Link online inválido.')
    let slug = slugify(b.slug || b.titulo); if (await db.mktEvento.findUnique({ where: { tenantId_slug: { tenantId, slug } } })) slug = `${slug}-${token(2)}`
    const e = await db.mktEvento.create({ data: { ...b, slug, tenantId, checkinToken: token(12) } as any }); await audit({ tenantId, userId: uid(req), modulo: 'marketing', acao: 'CRIAR', refType: 'MktEvento', refId: e.id }); res.status(201).json(e)
  }))
  r.patch('/eventos/:id', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const cur = await db.mktEvento.findFirst({ where: { id: String(req.params.id), tenantId } }); if (!cur) fail(404, 'Evento não encontrado.')
    const b = parseBody(evSchema.partial(), req.body); const { slug: _s, ...rest } = b as any
    if (rest.vagas != null && rest.vagas > 0) { const n = await db.mktEventoInscricao.count({ where: { tenantId, eventoId: cur.id, status: { in: ['INSCRITO', 'PRESENTE'] } } }); if (rest.vagas < n) fail(409, `Já existem ${n} inscritos; não é possível reduzir as vagas abaixo disso.`) }
    res.json(await db.mktEvento.update({ where: { id: cur.id }, data: rest }))
  }))
  const acaoEv = (rota: string, de: string[], para: string) => r.post(`/eventos/:id/${rota}`, requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const e = await db.mktEvento.findFirst({ where: { id: String(req.params.id), tenantId } }); if (!e) fail(404, 'Evento não encontrado.')
    if (!de.includes(e.status)) fail(409, `Ação indisponível para evento em ${e.status}.`)
    res.json(await db.mktEvento.update({ where: { id: e.id }, data: { status: para } }))
  }))
  acaoEv('publicar', ['RASCUNHO'], 'PUBLICADO'); acaoEv('encerrar', ['PUBLICADO'], 'ENCERRADO'); acaoEv('cancelar', ['RASCUNHO', 'PUBLICADO'], 'CANCELADO')
  r.get('/eventos/:id/inscricoes', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const e = await db.mktEvento.findFirst({ where: { id: String(req.params.id), tenantId } }); if (!e) fail(404, 'Evento não encontrado.')
    const rows = await db.mktEventoInscricao.findMany({ where: { tenantId, eventoId: e.id }, orderBy: { createdAt: 'asc' }, take: 2000 })
    res.json({ items: rows.map((i: any) => ({ ...i, email: i.email ? mascararEmail(i.email) : null, telefone: i.telefone ? mascararTelefone(i.telefone) : null })), total: rows.length, checkinUrl: `${publicBase()}/evento-presenca` })
  }))
  // check-in por QR (equipe lê o QR do participante): token do QR + evento
  r.post('/eventos/checkin', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const b = parseBody(z.object({ qrToken: z.string().min(8).max(80) }), req.body)
    const i = await db.mktEventoInscricao.findFirst({ where: { tenantId, qrToken: b.qrToken } }); if (!i) fail(404, 'QR de inscrição inválido para esta instituição.')
    if (i.status === 'CANCELADO') fail(409, 'Inscrição cancelada.'); if (i.status === 'LISTA_ESPERA') fail(409, 'Participante está na lista de espera.')
    const ev = await db.mktEvento.findFirst({ where: { id: i.eventoId, tenantId } }); if (!ev || ev.status === 'CANCELADO') fail(409, 'Evento indisponível.')
    if (i.status === 'PRESENTE') return res.json({ ok: true, jaRegistrado: true, nome: i.nome, checkinEm: i.checkinEm })
    const up = await db.mktEventoInscricao.update({ where: { id: i.id }, data: { status: 'PRESENTE', checkinEm: new Date() } })
    if (i.leadId) await registrarEvento(tenantId, i.leadId, 'PARTICIPOU_EVENTO', { descricao: ev.titulo, dedupe: `evento:${ev.id}` })
    res.json({ ok: true, nome: up.nome, evento: ev.titulo, checkinEm: up.checkinEm })
  }))
  r.post('/eventos/lembretes', requireRole(...GESTAO), asyncHandler(async (_req: AuthenticatedRequest, res: Response) => res.json(await lembretesEventos())))

  // ---------------------------------------------------------------- incentivos / indicação premiada
  mountCrud(r, { model: 'mktPrograma', path: '/programas', read: LEITURA, write: GESTAO, modulo: 'marketing', search: ['nome'], filters: ['publicoAlvo', 'ativo'], orderBy: { createdAt: 'desc' },
    create: z.object({ nome: z.string().min(3).max(150), publicoAlvo: z.enum(['ALUNOS', 'PROFESSORES', 'EQUIPE', 'COMUNIDADE']).default('ALUNOS'), descricao: optStr(1000), recompensa: z.string().min(3).max(200), valorRecompensa: money().default(0), regras: optStr(2000), inicio: dtReq(), fim: dt(), metaIndicacoes: z.number().int().min(0).default(0), ativo: z.boolean().default(true) }),
    beforeCreate: (d: any) => { if (d.fim && d.fim < d.inicio) fail(400, 'O fim do programa é anterior ao início.'); return d } })
  r.post('/programas/:id/indicadores', requireRole(...GESTAO, 'ADMISSIONS'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const p = await db.mktPrograma.findFirst({ where: { id: String(req.params.id), tenantId, ativo: true } }); if (!p) fail(404, 'Programa não encontrado ou inativo.')
    const b = parseBody(z.object({ nome: z.string().min(2).max(120), tipo: z.enum(['ALUNO', 'PROFESSOR', 'FUNCIONARIO', 'COMUNIDADE']).default('ALUNO'), userId: optStr(80), studentId: optStr(80) }), req.body)
    const codigo = `${slugify(b.nome).slice(0, 8).toUpperCase().replace(/-/g, '')}${token(2).toUpperCase()}`
    const i = await db.mktIndicador.create({ data: { ...b, tenantId, programaId: p.id, codigo } as any })
    res.status(201).json({ ...i, link: `${publicBase()}/site/${(await db.mktSite.findUnique({ where: { tenantId } }))?.slug ?? ''}?ref=${codigo}` })
  }))
  r.get('/programas/:id/ranking', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const p = await db.mktPrograma.findFirst({ where: { id: String(req.params.id), tenantId } }); if (!p) fail(404, 'Programa não encontrado.')
    const inds = await db.mktIndicador.findMany({ where: { tenantId, programaId: p.id } }); const ids = await db.mktIndicacao.findMany({ where: { tenantId, programaId: p.id } })
    const rk = inds.map((i: any) => { const x = ids.filter((a: any) => a.indicadorId === i.id); return { indicadorId: i.id, nome: i.nome, tipo: i.tipo, codigo: i.codigo, indicacoes: x.length, convertidas: x.filter((a: any) => a.status === 'CONVERTIDA' || a.status === 'RECOMPENSADA').length, recompensadas: x.filter((a: any) => a.status === 'RECOMPENSADA').length } }).sort((a: any, b: any) => b.convertidas - a.convertidas || b.indicacoes - a.indicacoes)
    res.json({ programa: p, ranking: rk, totalIndicacoes: ids.length, metaAtingidaPct: p.metaIndicacoes ? Math.round((ids.length / p.metaIndicacoes) * 100) : null })
  }))
  r.get('/indicacoes', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const where: any = { tenantId: tid(req) }; const st = qs(req.query.status); if (st) where.status = st
    const items = await db.mktIndicacao.findMany({ where, orderBy: { createdAt: 'desc' }, take: 300 }); res.json({ items, total: items.length })
  }))
  r.post('/indicacoes/:id/recompensar', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const i = await db.mktIndicacao.findFirst({ where: { id: String(req.params.id), tenantId } }); if (!i) fail(404, 'Indicação não encontrada.')
    if (i.status !== 'CONVERTIDA') fail(409, 'Só é possível recompensar indicação cujo indicado se matriculou.')
    const ind = await db.mktIndicador.findFirst({ where: { id: i.indicadorId, tenantId } })
    if (ind && ind.userId === uid(req) && !ehSuper(req)) fail(403, 'Segregação de função: você não pode liberar a própria recompensa.')
    res.json(await db.mktIndicacao.update({ where: { id: i.id }, data: { status: 'RECOMPENSADA', recompensaEm: new Date(), recompensaPorId: uid(req) } }))
  }))
  void CANAIS_DISPARO; void REDES; void csv; void normEmail; void prisma; void marca; void capturarLead; void historico
}

/** Lembretes (24h antes) aos inscritos que pediram lembrete — mensagem transacional; supressão global SEMPRE respeitada. */
export async function lembretesEventos() {
  const agora = new Date()
  const evs = await db.mktEvento.findMany({ where: { status: 'PUBLICADO', inicio: { gt: agora, lte: new Date(agora.getTime() + 25 * 3600_000) } } })
  let enviados = 0, bloqueados = 0
  for (const e of evs) {
    const ins = await db.mktEventoInscricao.findMany({ where: { tenantId: e.tenantId, eventoId: e.id, status: 'INSCRITO', aceitaLembretes: true, lembreteEnviadoEm: null }, take: 2000 })
    for (const i of ins) {
      const canal = i.email ? 'EMAIL' : i.telefone ? 'WHATSAPP' : null; if (!canal) continue
      const env = await enviar({ tenantId: e.tenantId, canal, destino: canal === 'EMAIL' ? i.email : i.telefone, assunto: `Lembrete: ${e.titulo}`, corpo: `Olá, ${i.nome.split(' ')[0]}! Lembrete: "${e.titulo}" acontece em ${e.inicio.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}${e.local ? ` — ${e.local}` : ''}. Apresente seu QR de presença na entrada.`, finalidade: 'TRANSACIONAL', leadId: i.leadId, eventoInscricaoId: i.id, campanhaId: e.campanhaId })
      if (env.status === 'ENVIADO') { enviados++; await db.mktEventoInscricao.update({ where: { id: i.id }, data: { lembreteEnviadoEm: new Date() } }) } else if (env.status === 'BLOQUEADO') { bloqueados++; await db.mktEventoInscricao.update({ where: { id: i.id }, data: { lembreteEnviadoEm: new Date() } }) }
    }
  }
  return { eventos: evs.length, enviados, bloqueados }
}
