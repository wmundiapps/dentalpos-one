import { Request, Response, Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { asyncHandler } from '../academico/middleware'
import { parseBody, qs } from '../core/crud'
import { audit } from '../core/notify'
import { db, esc, fail, marca, normEmail, normFone, optStr, publicApi, publicBase, token } from './common'
import { processarMensagem } from './atendimento'
import { descadastrarPorToken } from './envio'
import { capturarLead, registrarEvento } from './leads'
import { origemPorUtm, parseUtm, simularMensalidade } from './logic'
import { TEXTO_CONSENTIMENTO_PADRAO, TEXTO_MARKETING_PADRAO } from './rotas-leads'

export const publicRouter = Router()

const hits = new Map<string, number[]>()
function limitar(chave: string, max: number, janelaMs: number) {
  if (process.env.MKT_RATE_LIMIT_OFF === '1') return
  const agora = Date.now(); const l = (hits.get(chave) ?? []).filter((t) => agora - t < janelaMs)
  if (l.length >= max) fail(429, 'Muitas tentativas. Aguarde alguns minutos e tente novamente.')
  l.push(agora); hits.set(chave, l)
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => agora - t < janelaMs)) hits.delete(k)
}
const ip = (req: Request) => String(req.ip ?? req.socket?.remoteAddress ?? 'ip')

async function siteDe(req: Request) {
  const slug = String(req.params.slug || '').toLowerCase()
  const s = await db.mktSite.findUnique({ where: { slug } })
  if (!s || !s.ativo) fail(404, 'Site não encontrado.')
  return s
}
const sanitizaCampos = (campos: any[], dados: Record<string, any>) => {
  const out: Record<string, string> = {}
  for (const c of campos) {
    const v = dados?.[c.chave]; const s = v == null ? '' : String(v).trim().slice(0, 300)
    if (c.obrigatorio && !s) fail(400, `Preencha o campo "${c.rotulo}".`)
    if (c.tipo === 'select' && s && c.opcoes?.length && !c.opcoes.includes(s)) fail(400, `Valor inválido em "${c.rotulo}".`)
    if (s) out[c.chave] = s
  }
  return out
}

async function cursosVitrine(tenantId: string) {
  const of = await prisma.admOferta.findMany({ where: { tenantId, ativo: true, processo: { status: 'ABERTO' } }, orderBy: { nomeCurso: 'asc' }, take: 60 }).catch(() => [])
  return of.map((o) => ({ id: o.id, nome: o.nomeCurso, modalidade: o.modalidade, turno: o.turno, polo: o.poloNome, vagas: o.vagas, mensalidade: o.valorMensalidade, parcelas: o.parcelas }))
}
async function resolverBlocos(tenantId: string, blocos: any[]) {
  const out: any[] = []
  for (const b of blocos) {
    const x = { ...b }
    if (b.tipo === 'CURSOS' || b.tipo === 'SIMULADOR') x.cursos = await cursosVitrine(tenantId)
    if (b.tipo === 'EVENTOS') x.eventos = (await db.mktEvento.findMany({ where: { tenantId, status: 'PUBLICADO', publico: true, inicio: { gte: new Date() } }, orderBy: { inicio: 'asc' }, take: 6 })).map((e: any) => ({ slug: e.slug, titulo: e.titulo, descricao: e.descricao, inicio: e.inicio, local: e.local, online: e.online, vagas: e.vagas }))
    if (b.tipo === 'FAQ' && !(b.itens?.length)) x.itens = (await prisma.comFaq.findMany({ where: { tenantId, ativo: true }, take: 12 }).catch(() => [])).map((f) => ({ pergunta: f.pergunta, resposta: f.resposta }))
    if (b.tipo === 'FORM') {
      const f = b.formularioSlug ? await db.mktFormulario.findFirst({ where: { tenantId, slug: b.formularioSlug, ativo: true } }) : null
      x.formulario = f ? { slug: f.slug, nome: f.nome, descricao: f.descricao, campos: f.campos, textoConsentimento: f.textoConsentimento, textoMarketing: TEXTO_MARKETING_PADRAO, mensagemSucesso: f.mensagemSucesso } : null
    }
    out.push(x)
  }
  return out
}

publicRouter.get('/site/:slug', asyncHandler(async (req: Request, res: Response) => {
  const s = await siteDe(req)
  const [paginas, m] = await Promise.all([db.mktPagina.findMany({ where: { tenantId: s.tenantId, status: 'PUBLICADA' }, orderBy: [{ ordem: 'asc' }, { createdAt: 'asc' }], select: { slug: true, titulo: true, tipo: true, noMenu: true } }), marca(s.tenantId)])
  res.json({ site: { slug: s.slug, nome: s.nome, descricao: s.descricao, logoUrl: s.logoUrl, chatAtivo: s.chatAtivo, whatsapp: s.whatsapp, rodape: s.rodape, corPrimaria: s.corPrimaria || m.corPrimaria, corSecundaria: s.corSecundaria || m.corSecundaria }, menu: paginas.filter((p: any) => p.noMenu || p.tipo === 'HOME'), paginas })
}))
publicRouter.get('/site/:slug/paginas/:pagina', asyncHandler(async (req: Request, res: Response) => {
  const s = await siteDe(req); const p = await db.mktPagina.findFirst({ where: { tenantId: s.tenantId, slug: String(req.params.pagina), status: 'PUBLICADA' } })
  if (!p) fail(404, 'Página não encontrada.')
  await db.mktPagina.update({ where: { id: p.id }, data: { visitas: { increment: 1 } } })
  res.json({ id: p.id, slug: p.slug, titulo: p.titulo, tipo: p.tipo, seoTitulo: p.seoTitulo, seoDescricao: p.seoDescricao, blocos: await resolverBlocos(s.tenantId, p.blocos as any[]), publicadoEm: p.publicadoEm })
}))

// ---------------------------------------------------------------- captura (formulários / landing pages)
publicRouter.post('/site/:slug/formularios/:form/enviar', asyncHandler(async (req: Request, res: Response) => {
  limitar(`form:${ip(req)}`, 8, 10 * 60_000)
  const s = await siteDe(req); const f = await db.mktFormulario.findFirst({ where: { tenantId: s.tenantId, slug: String(req.params.form), ativo: true } })
  if (!f) fail(404, 'Formulário não encontrado.')
  const b = parseBody(z.object({ dados: z.record(z.string(), z.any()), consentimentoContato: z.literal(true, { errorMap: () => ({ message: 'É necessário autorizar o tratamento dos dados para contato (LGPD).' }) } as any), consentimentoMarketing: z.boolean().default(false), website: z.string().optional(), tempoPreenchimentoMs: z.number().optional(), paginaId: optStr(80), cupom: optStr(40), ref: optStr(40), utm: z.record(z.string(), z.any()).optional(), curso: optStr(150) }), req.body)
  if (b.website) return void res.status(201).json({ ok: true, mensagem: f.mensagemSucesso }) // honeypot
  if (b.tempoPreenchimentoMs != null && b.tempoPreenchimentoMs < 1500) fail(429, 'Envio rápido demais. Tente novamente.')
  const d = sanitizaCampos(f.campos as any[], b.dados)
  const campos = f.campos as any[]
  const get = (t: string) => { const c = campos.find((x) => x.tipo === t); return c ? d[c.chave] : undefined }
  const campoNome = campos.find((c) => /nome/i.test(c.chave))
  const nome = d.nome ?? (campoNome ? d[campoNome.chave] : undefined)
  if (!nome || String(nome).length < 3) fail(400, 'Informe seu nome.')
  const email = get('email'); const tel = get('telefone')
  if (email && !normEmail(email)) fail(400, 'E-mail inválido.'); if (tel && !normFone(tel)) fail(400, 'Telefone inválido.')
  const r = await capturarLead({ tenantId: s.tenantId, nome: String(nome), email, telefone: tel, curso: b.curso ?? get('curso') ?? f.cursoNome, origem: origemPorUtm(parseUtm(b.utm ?? {}).utmSource, parseUtm(b.utm ?? {}).utmMedium) ?? f.origemPadrao, utm: parseUtm(b.utm ?? {}), campanhaId: f.campanhaId, formularioId: f.id, paginaId: b.paginaId, cupom: b.cupom, indicacao: b.ref, extras: Object.fromEntries(Object.entries(d).filter(([k]) => !['nome', 'email', 'telefone'].includes(k))),
    consentimento: { contato: true, marketing: b.consentimentoMarketing, texto: b.consentimentoMarketing ? `${f.textoConsentimento}\n${TEXTO_MARKETING_PADRAO}` : f.textoConsentimento, versao: f.versaoTexto, origem: b.paginaId ? 'LANDING' : 'FORMULARIO', url: String(req.get('referer') ?? '').slice(0, 300) || null }, ip: ip(req), ua: req.get('user-agent') })
  await db.mktFormulario.update({ where: { id: f.id }, data: { envios: { increment: 1 } } })
  if (b.paginaId) await db.mktPagina.updateMany({ where: { id: b.paginaId, tenantId: s.tenantId }, data: { conversoes: { increment: 1 } } })
  res.status(201).json({ ok: true, mensagem: f.mensagemSucesso, novo: r.novo })
}))

// ---------------------------------------------------------------- simulador de mensalidade, chat IA
publicRouter.post('/site/:slug/simulador', asyncHandler(async (req: Request, res: Response) => {
  limitar(`sim:${ip(req)}`, 60, 10 * 60_000)
  const s = await siteDe(req); const b = parseBody(z.object({ ofertaId: z.string().max(80), bolsaPct: z.number().min(0).max(100).default(0), pontualidadePct: z.number().min(0).max(30).default(0), email: optStr(150) }), req.body)
  const o = await prisma.admOferta.findFirst({ where: { id: b.ofertaId, tenantId: s.tenantId, ativo: true } }); if (!o) fail(404, 'Curso não encontrado.')
  const sim = simularMensalidade({ valor: o.valorMensalidade, parcelas: o.parcelas, bolsaPct: b.bolsaPct, pontualidadePct: b.pontualidadePct })
  const em = normEmail(b.email)
  if (em) { const l = await db.mktLead.findFirst({ where: { tenantId: s.tenantId, emailNorm: em } }); if (l) await registrarEvento(s.tenantId, l.id, 'SIMULOU_MENSALIDADE', { dedupe: `sim:${o.id}` }) }
  res.json({ curso: o.nomeCurso, ...sim, aviso: 'Simulação ilustrativa; bolsas e descontos dependem de análise e regulamento vigente.' })
}))
publicRouter.post('/site/:slug/chat', asyncHandler(async (req: Request, res: Response) => {
  limitar(`chat:${ip(req)}`, 40, 10 * 60_000)
  const s = await siteDe(req); if (!s.chatAtivo) fail(404, 'Chat indisponível.')
  const b = parseBody(z.object({ sessao: z.string().min(8).max(64).regex(/^[a-zA-Z0-9_-]+$/), texto: z.string().min(1).max(1000), nome: optStr(80) }), req.body)
  const r = await processarMensagem({ tenantId: s.tenantId, canal: 'SITE', sessao: b.sessao, texto: b.texto, nome: b.nome ?? undefined })
  res.json({ resposta: r.resposta, status: r.status, escalonado: r.escalonado, aviso: (r as any).aviso })
}))

// ---------------------------------------------------------------- eventos
publicRouter.get('/site/:slug/eventos', asyncHandler(async (req: Request, res: Response) => {
  const s = await siteDe(req)
  const rows = await db.mktEvento.findMany({ where: { tenantId: s.tenantId, status: 'PUBLICADO', publico: true, inicio: { gte: new Date(Date.now() - 86_400_000) } }, orderBy: { inicio: 'asc' }, take: 50 })
  const g = await db.mktEventoInscricao.groupBy({ by: ['eventoId'], where: { tenantId: s.tenantId, status: { in: ['INSCRITO', 'PRESENTE'] } }, _count: { _all: true } })
  res.json({ items: rows.map((e: any) => { const n = g.find((x: any) => x.eventoId === e.id)?._count._all ?? 0; return { slug: e.slug, titulo: e.titulo, descricao: e.descricao, tipo: e.tipo, inicio: e.inicio, fim: e.fim, local: e.online ? 'Online' : e.local, vagas: e.vagas, vagasRestantes: e.vagas ? Math.max(0, e.vagas - n) : null } }) })
}))
publicRouter.post('/site/:slug/eventos/:evento/inscricao', asyncHandler(async (req: Request, res: Response) => {
  limitar(`ev:${ip(req)}`, 10, 10 * 60_000)
  const s = await siteDe(req); const tenantId = s.tenantId
  const b = parseBody(z.object({ nome: z.string().min(3).max(150), email: optStr(150), telefone: optStr(30), consentimentoContato: z.literal(true, { errorMap: () => ({ message: 'É necessário autorizar o tratamento dos dados para a inscrição (LGPD).' }) } as any), aceitaLembretes: z.boolean().default(true), consentimentoMarketing: z.boolean().default(false), website: z.string().optional(), utm: z.record(z.string(), z.any()).optional() }), req.body)
  if (b.website) return void res.status(201).json({ ok: true })
  if (!normEmail(b.email) && !normFone(b.telefone)) fail(400, 'Informe e-mail ou telefone válido.')
  const ev = await db.mktEvento.findFirst({ where: { tenantId, slug: String(req.params.evento), status: 'PUBLICADO', publico: true } }); if (!ev) fail(404, 'Evento não encontrado ou sem inscrições abertas.')
  if (ev.inicio.getTime() < Date.now()) fail(409, 'Este evento já aconteceu.')
  const { lead } = await capturarLead({ tenantId, nome: b.nome, email: b.email, telefone: b.telefone, origem: 'EVENTO', detalheOrigem: ev.titulo, campanhaId: ev.campanhaId, utm: parseUtm(b.utm ?? {}), consentimento: { contato: true, marketing: b.consentimentoMarketing, texto: `Inscrição no evento "${ev.titulo}". ${TEXTO_CONSENTIMENTO_PADRAO}${b.consentimentoMarketing ? '\n' + TEXTO_MARKETING_PADRAO : ''}`, versao: 'evento-1.0', origem: 'EVENTO' }, ip: ip(req), ua: req.get('user-agent') })
  const em = normEmail(b.email); const tel = normFone(b.telefone)
  const tok = token(10)
  // lock para não vender vaga acima do limite em inscrições simultâneas
  const ins = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'mkt-ev:' + ev.id}))`
    const t = tx as any
    const dup = await t.mktEventoInscricao.findFirst({ where: { tenantId, eventoId: ev.id, status: { not: 'CANCELADO' }, OR: [...(em ? [{ email: em }] : []), ...(tel ? [{ telefone: tel }] : [])] } })
    if (dup) return { dup }
    const n = await t.mktEventoInscricao.count({ where: { tenantId, eventoId: ev.id, status: { in: ['INSCRITO', 'PRESENTE'] } } })
    const lotado = ev.vagas > 0 && n >= ev.vagas
    return { nova: await t.mktEventoInscricao.create({ data: { tenantId, eventoId: ev.id, leadId: lead.id, nome: b.nome, email: em, telefone: tel, status: lotado ? 'LISTA_ESPERA' : 'INSCRITO', qrToken: tok, aceitaLembretes: b.aceitaLembretes } }) }
  })
  if ('dup' in ins && ins.dup) return void res.status(200).json({ ok: true, jaInscrito: true, status: ins.dup.status, qrToken: ins.dup.qrToken, evento: ev.titulo })
  const nova = (ins as any).nova
  await audit({ tenantId, modulo: 'marketing', acao: 'EVENTO_INSCRICAO', refType: 'MktEvento', refId: ev.id })
  res.status(201).json({ ok: true, status: nova.status, qrToken: nova.qrToken, evento: ev.titulo, inicio: ev.inicio, mensagem: nova.status === 'LISTA_ESPERA' ? 'Evento lotado: você está na lista de espera.' : 'Inscrição confirmada. Apresente o QR na entrada.' })
}))

// ---------------------------------------------------------------- QR / URL curta de mídia offline
publicRouter.get('/r/:token', asyncHandler(async (req: Request, res: Response) => {
  limitar(`qr:${ip(req)}`, 120, 10 * 60_000)
  const m = await db.mktMidiaOffline.findUnique({ where: { qrToken: String(req.params.token) } }); if (!m) fail(404, 'Link inválido.')
  await db.mktMidiaOffline.update({ where: { id: m.id }, data: { scans: { increment: 1 } } })
  const s = await db.mktSite.findUnique({ where: { tenantId: m.tenantId } })
  const q = new URLSearchParams({ utm_source: m.tipo.toLowerCase(), utm_medium: 'offline', ...(m.cupom ? { cupom: m.cupom } : {}) })
  let destino = m.urlDestino && /^(https?:\/\/|\/)/i.test(m.urlDestino) ? m.urlDestino : s ? `${publicBase()}/site/${s.slug}` : publicBase()
  destino += (destino.includes('?') ? '&' : '?') + q.toString()
  if (qs(req.query.json)) return void res.json({ destino, cupom: m.cupom })
  res.redirect(302, destino)
}))

// ---------------------------------------------------------------- descadastro em 1 clique (todos os canais)
publicRouter.get('/descadastro/:token', asyncHandler(async (req: Request, res: Response) => {
  const e = await db.mktEnvio.findUnique({ where: { tokenDescadastro: String(req.params.token) }, select: { canal: true, tenantId: true } })
  if (!e) fail(404, 'Link de descadastro inválido ou expirado.')
  const m = await marca(e.tenantId)
  res.json({ instituicao: m.nome, canal: e.canal, mensagem: 'Confirme com um clique para não receber mais mensagens de divulgação em nenhum canal.' })
}))
// POST: RFC 8058 (List-Unsubscribe-Post) — um clique, sem login.
publicRouter.post('/descadastro/:token', asyncHandler(async (req: Request, res: Response) => {
  limitar(`unsub:${ip(req)}`, 30, 10 * 60_000)
  res.json(await descadastrarPorToken(String(req.params.token), 'DESCADASTRO'))
}))

// ---------------------------------------------------------------- SEO: HTML renderizado no servidor + sitemap
const bloco = (b: any): string => {
  const btn = b.botaoRotulo ? `<p><a class="btn" href="${esc(b.botaoUrl || '#')}">${esc(b.botaoRotulo)}</a></p>` : ''
  switch (b.tipo) {
    case 'HERO': return `<section class="hero"><h1>${esc(b.titulo)}</h1><p>${esc(b.texto)}</p>${btn}</section>`
    case 'TEXTO': return `<section><h2>${esc(b.titulo)}</h2><p>${esc(b.texto)}</p>${btn}</section>`
    case 'CURSOS': return `<section><h2>${esc(b.titulo || 'Cursos')}</h2><ul>${(b.cursos ?? []).map((c: any) => `<li><strong>${esc(c.nome)}</strong> — ${esc(c.modalidade)} · ${esc(c.turno)} · R$ ${Number(c.mensalidade).toFixed(2)} em ${c.parcelas}x</li>`).join('')}</ul></section>`
    case 'FAQ': return `<section><h2>${esc(b.titulo || 'Perguntas frequentes')}</h2>${(b.itens ?? []).map((i: any) => `<details><summary>${esc(i.pergunta)}</summary><p>${esc(i.resposta)}</p></details>`).join('')}</section>`
    case 'EVENTOS': return `<section><h2>${esc(b.titulo || 'Eventos')}</h2><ul>${(b.eventos ?? []).map((e: any) => `<li>${esc(e.titulo)} — ${esc(new Date(e.inicio).toLocaleDateString('pt-BR'))}</li>`).join('')}</ul></section>`
    case 'CTA': return `<section class="hero"><h2>${esc(b.titulo)}</h2><p>${esc(b.texto)}</p>${btn}</section>`
    case 'DEPOIMENTOS': return `<section><h2>${esc(b.titulo || 'Depoimentos')}</h2>${(b.itens ?? []).map((i: any) => `<blockquote>${esc(i.texto)}<footer>${esc(i.autor)}</footer></blockquote>`).join('')}</section>`
    case 'FORM': return `<section><h2>${esc(b.titulo || 'Fale conosco')}</h2><p>Use a versão interativa para enviar seus dados: <a href="${esc(publicBase())}">abrir</a>.</p></section>`
    default: return b.titulo ? `<section><h2>${esc(b.titulo)}</h2><p>${esc(b.texto)}</p></section>` : ''
  }
}
publicRouter.get('/site/:slug/html/:pagina', asyncHandler(async (req: Request, res: Response) => {
  const s = await siteDe(req); const p = await db.mktPagina.findFirst({ where: { tenantId: s.tenantId, slug: String(req.params.pagina), status: 'PUBLICADA' } }); if (!p) fail(404, 'Página não encontrada.')
  const m = await marca(s.tenantId); const blocos = await resolverBlocos(s.tenantId, p.blocos as any[])
  const url = `${publicBase()}/site/${s.slug}/${p.slug}`
  const ld = JSON.stringify({ '@context': 'https://schema.org', '@type': 'EducationalOrganization', name: s.nome, url: `${publicBase()}/site/${s.slug}` }).replace(/</g, '\\u003c')
  const c1 = /^#[0-9a-f]{6}$/i.test(s.corPrimaria || '') ? s.corPrimaria : m.corPrimaria
  res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; base-uri 'none'; form-action 'none'").type('html').send(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(p.seoTitulo || p.titulo)}</title><meta name="description" content="${esc(p.seoDescricao)}"><link rel="canonical" href="${esc(url)}"><meta property="og:title" content="${esc(p.seoTitulo || p.titulo)}"><meta property="og:description" content="${esc(p.seoDescricao)}"><meta property="og:type" content="website"><meta property="og:url" content="${esc(url)}"><script type="application/ld+json">${ld}</script><style>body{font-family:system-ui,Arial,sans-serif;margin:0;color:#14213d}main{max-width:900px;margin:auto;padding:16px}.hero{background:${esc(c1)};color:#fff;padding:32px 16px;border-radius:12px;margin:12px 0}.btn{background:#fff;color:#14213d;padding:10px 18px;border-radius:99px;text-decoration:none;font-weight:700}section{margin:20px 0}</style></head><body><header style="padding:12px 16px;background:#f4f6fb"><strong>${esc(s.nome)}</strong></header><main>${blocos.map(bloco).join('')}</main><footer style="padding:16px;text-align:center;font-size:13px;color:#555">${esc(s.rodape || s.nome)} · <a href="${esc(publicBase())}/privacidade">Política de Privacidade</a></footer></body></html>`)
}))
publicRouter.get('/site/:slug/sitemap.xml', asyncHandler(async (req: Request, res: Response) => {
  const s = await siteDe(req); const ps = await db.mktPagina.findMany({ where: { tenantId: s.tenantId, status: 'PUBLICADA' }, select: { slug: true, updatedAt: true } })
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${ps.map((p: any) => `<url><loc>${esc(`${publicBase()}/site/${s.slug}/${p.slug}`)}</loc><lastmod>${p.updatedAt.toISOString().slice(0, 10)}</lastmod></url>`).join('')}</urlset>`)
}))
void publicApi
