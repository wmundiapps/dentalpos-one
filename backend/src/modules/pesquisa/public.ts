import { Router } from 'express'
import { prisma } from '../../lib/prisma'
import { asyncHandler, academicErrorHandler } from '../academico/middleware'
import { parseBody, qs, pageParams } from '../core/crud'
import { citarArtigo, addDays } from './lib'
import { httpErr } from './common'
import { registrarParecer, responderConvite, visaoRevisorDaSubmissao } from './periodico'
import { z } from 'zod'

// Rotas PÚBLICAS (sem login) — /api/public/edu/pesquisa/:tenantId/...
// Nunca expõem pareceristas, pareceres, e-mails de autores nem manuscritos em revisão.
export const publicRouter = Router()

// limitador simples em memória para as rotas por token (evita varredura)
const hits = new Map<string, { n: number; t: number }>()
function limitar(chave: string, max = 40, janelaMs = 60_000) {
  const agora = Date.now()
  const h = hits.get(chave)
  if (!h || agora - h.t > janelaMs) { hits.set(chave, { n: 1, t: agora }); return }
  h.n++
  if (h.n > max) throw httpErr(429, 'Muitas requisições. Tente novamente em instantes.')
  if (hits.size > 5000) for (const [k, v] of hits) if (agora - v.t > janelaMs) hits.delete(k)
}

const autoresPublicos = (a: any): Array<{ nome: string; afiliacao?: string; orcid?: string }> =>
  (Array.isArray(a) ? a : []).map((x: any) => ({ nome: x.nome, afiliacao: x.afiliacao ?? undefined, orcid: x.orcid ?? undefined }))

async function artigoPublico(tenantId: string, id: string) {
  const s = await prisma.pesSubmissao.findFirst({ where: { id, tenantId, status: 'PUBLICADO' }, include: { periodico: true, edicao: true, secao: true, versoes: { where: { tipo: { in: ['FINAL', 'EDITORACAO'] } }, orderBy: { numero: 'desc' }, take: 1 } } })
  if (!s || !s.periodico.ativo) return null
  const autores = autoresPublicos(s.autores)
  return {
    id: s.id, codigo: s.codigo, titulo: s.titulo, resumo: s.resumo, abstract: s.abstract, palavrasChave: s.palavrasChave, idioma: s.idioma, autores,
    doi: s.doi, secao: s.secao?.nome ?? null, paginaInicial: s.paginaInicial, paginaFinal: s.paginaFinal, dataPublicacao: s.dataPublicacao,
    periodico: { nome: s.periodico.nome, slug: s.periodico.slug, issn: s.periodico.issn, eissn: s.periodico.eissn, licenca: s.periodico.licenca },
    edicao: s.edicao ? { id: s.edicao.id, volume: s.edicao.volume, numero: s.edicao.numero, ano: s.edicao.ano } : null,
    arquivoUrl: s.periodico.politicaAcessoAberto ? s.versoes[0]?.arquivoUrl ?? null : null,
    citacao: citarArtigo({ autores: autores.map((a) => a.nome), titulo: s.titulo, periodico: s.periodico.nome, volume: s.edicao?.volume, numero: s.edicao?.numero, paginas: s.paginaInicial && s.paginaFinal ? `${s.paginaInicial}-${s.paginaFinal}` : null, ano: s.edicao?.ano ?? s.dataPublicacao?.getFullYear() ?? new Date().getFullYear(), doi: s.doi }),
  }
}

publicRouter.get('/:tenantId/periodicos', asyncHandler(async (req, res) => {
  const items = await prisma.pesPeriodico.findMany({ where: { tenantId: String(req.params.tenantId), ativo: true }, orderBy: { nome: 'asc' }, select: { slug: true, nome: true, sigla: true, issn: true, eissn: true, area: true, linhaEditorial: true, periodicidade: true, licenca: true, politicaAcessoAberto: true } })
  res.json({ items })
}))

publicRouter.get('/:tenantId/periodicos/:slug', asyncHandler(async (req, res) => {
  const tenantId = String(req.params.tenantId)
  const p = await prisma.pesPeriodico.findFirst({ where: { tenantId, slug: String(req.params.slug), ativo: true }, include: { secoes: { where: { ativa: true }, orderBy: { ordem: 'asc' }, select: { id: true, nome: true } }, equipe: { where: { ativo: true, papel: { not: 'PARECERISTA' } }, select: { nome: true, papel: true, instituicao: true, orcid: true } } } })
  if (!p) return res.status(404).json({ error: 'Periódico não encontrado.' })
  const { editorChefeUserId: _u, equipe, secoes, ...pub } = p as any
  res.json({ periodico: { slug: pub.slug, nome: pub.nome, sigla: pub.sigla, issn: pub.issn, eissn: pub.eissn, area: pub.area, linhaEditorial: pub.linhaEditorial, escopo: pub.escopo, normas: pub.normas, politicaAcessoAberto: pub.politicaAcessoAberto, licenca: pub.licenca, emailContato: pub.emailContato, periodicidade: pub.periodicidade, avaliacao: pub.duploCego ? 'Revisão por pares duplo-cego' : 'Revisão por pares' }, secoes, equipeEditorial: equipe })
}))

publicRouter.get('/:tenantId/periodicos/:slug/edicoes', asyncHandler(async (req, res) => {
  const tenantId = String(req.params.tenantId)
  const p = await prisma.pesPeriodico.findFirst({ where: { tenantId, slug: String(req.params.slug), ativo: true }, select: { id: true } })
  if (!p) return res.status(404).json({ error: 'Periódico não encontrado.' })
  const items = await prisma.pesEdicao.findMany({ where: { tenantId, periodicoId: p.id, status: 'PUBLICADA' }, orderBy: [{ ano: 'desc' }, { volume: 'desc' }], select: { id: true, volume: true, numero: true, ano: true, titulo: true, tipo: true, capaUrl: true, doi: true, dataPublicacao: true } })
  res.json({ items })
}))

publicRouter.get('/:tenantId/periodicos/:slug/edicoes/:edicaoId', asyncHandler(async (req, res) => {
  const tenantId = String(req.params.tenantId)
  const ed = await prisma.pesEdicao.findFirst({ where: { id: String(req.params.edicaoId), tenantId, status: 'PUBLICADA', periodico: { slug: String(req.params.slug), ativo: true } }, include: { periodico: { select: { nome: true, issn: true } }, submissoes: { where: { status: 'PUBLICADO' }, orderBy: { ordemNaEdicao: 'asc' }, include: { secao: { select: { nome: true } } } } } })
  if (!ed) return res.status(404).json({ error: 'Edição não encontrada.' })
  res.json({ edicao: { id: ed.id, volume: ed.volume, numero: ed.numero, ano: ed.ano, titulo: ed.titulo, editorial: ed.editorial, capaUrl: ed.capaUrl, doi: ed.doi, dataPublicacao: ed.dataPublicacao, periodico: ed.periodico }, artigos: ed.submissoes.map((s) => ({ id: s.id, titulo: s.titulo, autores: autoresPublicos(s.autores).map((a) => a.nome), secao: s.secao?.nome ?? null, doi: s.doi, paginas: s.paginaInicial && s.paginaFinal ? `${s.paginaInicial}-${s.paginaFinal}` : null })) })
}))

publicRouter.get('/:tenantId/artigos', asyncHandler(async (req, res) => {
  const tenantId = String(req.params.tenantId)
  const { skip, take, page, pageSize } = pageParams(req.query)
  const where: any = { tenantId, status: 'PUBLICADO', periodico: { ativo: true, ...(qs(req.query.periodico) ? { slug: qs(req.query.periodico) } : {}) } }
  const q = qs(req.query.q)
  if (q) where.OR = [{ titulo: { contains: q, mode: 'insensitive' } }, { resumo: { contains: q, mode: 'insensitive' } }, { palavrasChave: { has: q } }]
  const [rows, total] = await Promise.all([prisma.pesSubmissao.findMany({ where, orderBy: { dataPublicacao: 'desc' }, skip, take, include: { periodico: { select: { nome: true, slug: true } }, edicao: { select: { volume: true, numero: true, ano: true } } } }), prisma.pesSubmissao.count({ where })])
  res.json({ items: rows.map((s) => ({ id: s.id, titulo: s.titulo, autores: autoresPublicos(s.autores).map((a) => a.nome), periodico: s.periodico, edicao: s.edicao, doi: s.doi, dataPublicacao: s.dataPublicacao, palavrasChave: s.palavrasChave })), total, page, pageSize })
}))

publicRouter.get('/:tenantId/artigos/:id', asyncHandler(async (req, res) => {
  const a = await artigoPublico(String(req.params.tenantId), String(req.params.id))
  if (!a) return res.status(404).json({ error: 'Artigo não encontrado.' })
  res.json(a)
}))

// metadados Dublin Core / JSON-LD para indexadores (Google Scholar, OAI)
publicRouter.get('/:tenantId/artigos/:id/metadados', asyncHandler(async (req, res) => {
  const a = await artigoPublico(String(req.params.tenantId), String(req.params.id))
  if (!a) return res.status(404).json({ error: 'Artigo não encontrado.' })
  res.json({
    '@context': 'https://schema.org', '@type': 'ScholarlyArticle', name: a.titulo, abstract: a.resumo ?? a.abstract, inLanguage: a.idioma, keywords: a.palavrasChave.join(', '), datePublished: a.dataPublicacao,
    author: a.autores.map((x) => ({ '@type': 'Person', name: x.nome, affiliation: x.afiliacao, ...(x.orcid ? { sameAs: `https://orcid.org/${x.orcid}` } : {}) })),
    isPartOf: { '@type': 'PublicationIssue', issueNumber: a.edicao?.numero, isPartOf: { '@type': 'PublicationVolume', volumeNumber: a.edicao?.volume, isPartOf: { '@type': 'Periodical', name: a.periodico.nome, issn: a.periodico.issn } } },
    identifier: a.doi ? `https://doi.org/${a.doi}` : undefined, license: a.periodico.licenca,
    dublinCore: { title: a.titulo, creator: a.autores.map((x) => x.nome), subject: a.palavrasChave, description: a.resumo, publisher: a.periodico.nome, date: a.dataPublicacao, type: 'Text', identifier: a.doi, language: a.idioma },
  })
}))

publicRouter.get('/:tenantId/artigos/:id/citacao', asyncHandler(async (req, res) => {
  const a = await artigoPublico(String(req.params.tenantId), String(req.params.id))
  if (!a) return res.status(404).json({ error: 'Artigo não encontrado.' })
  res.json({ abnt: a.citacao })
}))

// Eventos: lista e anais publicados
publicRouter.get('/:tenantId/eventos', asyncHandler(async (req, res) => {
  const items = await prisma.pesEvento.findMany({ where: { tenantId: String(req.params.tenantId), status: { not: 'RASCUNHO' } }, orderBy: { dataInicio: 'desc' }, select: { slug: true, nome: true, tipo: true, descricao: true, local: true, modalidade: true, dataInicio: true, dataFim: true, status: true, prazoSubmissao: true, trilhas: true, anaisPublicadoEm: true } })
  res.json({ items })
}))
publicRouter.get('/:tenantId/eventos/:slug/anais', asyncHandler(async (req, res) => {
  const tenantId = String(req.params.tenantId)
  const e = await prisma.pesEvento.findFirst({ where: { tenantId, slug: String(req.params.slug), anaisPublicadoEm: { not: null } } })
  if (!e) return res.status(404).json({ error: 'Anais não encontrados.' })
  const trabs = await prisma.pesEventoTrabalho.findMany({ where: { tenantId, eventoId: e.id, status: 'PUBLICADO_ANAIS' }, orderBy: { ordemAnais: 'asc' }, select: { codigo: true, titulo: true, resumo: true, trilha: true, autores: true, paginasAnais: true, cameraReadyUrl: true, palavrasChave: true } })
  res.json({ evento: { nome: e.nome, isbn: e.anaisIsbn, url: e.anaisUrl, publicadoEm: e.anaisPublicadoEm }, trabalhos: trabs.map((t) => ({ ...t, autores: autoresPublicos(t.autores).map((a) => ({ nome: a.nome, afiliacao: a.afiliacao })) })) })
}))

// ---------- Parecerista externo por token (duplo-cego) ----------
async function revisaoPorToken(tenantId: string, token: string, ip?: string) {
  limitar(`${ip ?? 'x'}:${token.slice(0, 8)}`)
  const r = await prisma.pesRevisao.findUnique({ where: { token } })
  if (!r || r.tenantId !== tenantId) throw httpErr(404, 'Convite inválido.')
  if (addDays(r.prazo, 30) < new Date()) throw httpErr(410, 'Convite expirado.')
  if (['CANCELADO', 'EXPIRADO'].includes(r.status)) throw httpErr(410, 'Este convite foi cancelado ou expirou.')
  return r
}

publicRouter.get('/:tenantId/revisao/:token', asyncHandler(async (req, res) => {
  const r = await revisaoPorToken(String(req.params.tenantId), String(req.params.token), req.ip)
  const s = await prisma.pesSubmissao.findFirst({ where: { id: r.submissaoId }, include: { periodico: { select: { nome: true, normas: true } }, versoes: { orderBy: { numero: 'desc' }, take: 1 } } })
  if (!s) throw httpErr(404, 'Manuscrito não encontrado.')
  res.json({ convite: { status: r.status, prazo: r.prazo, rodada: r.rodada, revisor: r.revisorNome }, periodico: s.periodico, manuscrito: visaoRevisorDaSubmissao(s, s.versoes[0]), criterios: ['originalidade', 'metodologia', 'relevancia', 'clareza', 'referencias'], escala: '1 (insuficiente) a 5 (excelente)' })
}))
publicRouter.post('/:tenantId/revisao/:token/responder', asyncHandler(async (req, res) => {
  const r = await revisaoPorToken(String(req.params.tenantId), String(req.params.token), req.ip)
  const { aceitar, motivo } = parseBody(z.object({ aceitar: z.boolean(), motivo: z.string().optional() }), req.body)
  const row = await responderConvite(r, aceitar, motivo)
  res.json({ status: row.status })
}))
publicRouter.post('/:tenantId/revisao/:token/parecer', asyncHandler(async (req, res) => {
  const r = await revisaoPorToken(String(req.params.tenantId), String(req.params.token), req.ip)
  const row = await registrarParecer(r, req.body)
  res.status(201).json({ status: row.status, concluidoEm: row.concluidoEm })
}))

publicRouter.use(academicErrorHandler)
