import { Router, Response } from 'express'
import { randomBytes } from 'crypto'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { pageParams, parseBody, qs } from '../core/crud'
import { audit } from '../core/notify'
import { brandHeaderHtml, getBranding } from '../core/branding'
import { completeReminders, scheduleReminder } from '../core/reminders'
import { BIB, MOD, httpErr, optDate, strList } from './common'
import { cutterSimplificado, dublinCoreXml, entradaAutor, fichaCatalograficaHtmlCorpo, listaDeTexto, normalizarBusca, situacaoAcesso, textoBusca } from './logic'
import { notificarLeitor } from './service'

const MAX_DATAURL = 12 * 1024 * 1024
const TIPOS = ['TCC', 'DISSERTACAO', 'TESE', 'ARTIGO', 'NORMA', 'MATERIAL_DIDATICO', 'RELATORIO', 'OUTRO'] as const
const GESTORES = ['LIBRARIAN', 'COORDINATOR']
const AUTORES = ['LIBRARIAN', 'COORDINATOR', 'TEACHER', 'STUDENT'] as const

const base = z.object({
  tipo: z.enum(TIPOS).default('TCC'),
  titulo: z.string().trim().min(3), tituloAlternativo: z.string().optional().nullable(),
  criadores: strList, orientador: z.string().optional().nullable(), coorientador: z.string().optional().nullable(), banca: strList,
  assuntos: strList, descricao: z.string().optional().nullable(), abstractEn: z.string().optional().nullable(),
  editor: z.string().optional().nullable(), colaboradores: strList, dataPublicacao: optDate, formato: z.string().optional().nullable(),
  fonte: z.string().optional().nullable(), idioma: z.string().optional().nullable(), relacao: z.string().optional().nullable(),
  cobertura: z.string().optional().nullable(), direitos: z.string().optional().nullable(), licenca: z.string().optional().nullable(),
  embargoAte: optDate, restrito: z.boolean().optional(),
  arquivoUrl: z.string().url().optional().nullable(), arquivoDataUrl: z.string().max(MAX_DATAURL, 'Arquivo acima de 12MB').regex(/^data:[\w/+.-]+;base64,/, 'dataUrl inválida').optional().nullable(),
  arquivoNome: z.string().optional().nullable(), paginas: z.coerce.number().int().min(1).optional().nullable(), ilustrado: z.boolean().optional(),
  cdd: z.string().optional().nullable(), cutter: z.string().optional().nullable(),
  programId: z.string().optional().nullable(), disciplineId: z.string().optional().nullable(), autorStudentId: z.string().optional().nullable(), autorUserId: z.string().optional().nullable(),
})

export function derivarRepo(d: any, atual?: any) {
  const o: any = { ...d }
  const criadores = d.criadores ?? atual?.criadores ?? []
  const assuntos = d.assuntos ?? atual?.assuntos ?? []
  if ('criadores' in d || 'assuntos' in d || 'titulo' in d || 'descricao' in d)
    o.buscaTexto = textoBusca([d.titulo ?? atual?.titulo, criadores, assuntos, d.descricao ?? atual?.descricao, d.orientador ?? atual?.orientador])
  if (d.arquivoDataUrl && !d.formato) o.formato = String(d.arquivoDataUrl).slice(5, String(d.arquivoDataUrl).indexOf(';'))
  return o
}

function novoHandle() {
  return `rep-${new Date().getFullYear()}-${randomBytes(4).toString('hex')}`
}

// Requisitos mínimos de metadados (Dublin Core) para publicar.
export function validarPublicacao(i: any): string[] {
  const e: string[] = []
  if (!i.titulo) e.push('dc:title ausente')
  if (!Array.isArray(i.criadores) || !i.criadores.length) e.push('dc:creator ausente (informe ao menos um autor)')
  if (!Array.isArray(i.assuntos) || !i.assuntos.length) e.push('dc:subject ausente (informe palavras-chave)')
  if (!i.descricao || String(i.descricao).length < 20) e.push('dc:description (resumo) ausente ou muito curto')
  if (!i.arquivoUrl && !i.arquivoDataUrl) e.push('arquivo digital não anexado (arquivoUrl ou arquivoDataUrl)')
  if (!i.licenca && !i.direitos) e.push('licença/direitos (dc:rights) não informados')
  if (['TCC', 'DISSERTACAO', 'TESE'].includes(i.tipo) && !i.orientador) e.push('orientador não informado')
  if (i.embargoAte && i.embargoAte < new Date(Date.now() - 86400000)) e.push('data de embargo já passou: remova o embargo')
  return e
}

export function itemParaPublico(i: any, agora = new Date()) {
  const acesso = situacaoAcesso(i, agora)
  const { arquivoDataUrl, buscaTexto, arquivoUrl, ...resto } = i
  return { ...resto, acesso, temArquivo: !!(arquivoUrl || arquivoDataUrl) }
}

export function mountRepositorio(router: Router) {
  const roleGuard = requireRole(...AUTORES)

  const carregar = async (req: AuthenticatedRequest, id: string) => {
    const tenantId = getTenantId(req)
    const item = await prisma.bibRepositorioItem.findFirst({ where: { tenantId, OR: [{ id }, { handle: id }] } })
    if (!item) throw httpErr(404, 'Item não encontrado.')
    return item
  }
  const ehGestor = (req: AuthenticatedRequest) => ['ADMIN', 'OWNER', 'RECTOR', 'BOARD', ...GESTORES].includes(String(req.user?.role))
  const podeEditar = (req: AuthenticatedRequest, item: any) => {
    if (ehGestor(req)) return true
    if (!['RASCUNHO'].includes(item.status)) return false
    return (req.user?.studentId && item.autorStudentId === req.user.studentId) || item.autorUserId === req.user?.id
  }

  router.post('/repositorio', roleGuard, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d: any = derivarRepo(parseBody(base, req.body))
    if (req.user?.role === 'STUDENT') {
      if (!req.user.studentId) throw httpErr(403, 'Aluno não identificado.')
      d.autorStudentId = req.user.studentId
      if (!d.criadores?.length) {
        const s = await prisma.student.findFirst({ where: { id: req.user.studentId, tenantId }, select: { nomeCompleto: true } })
        if (s) { d.criadores = [s.nomeCompleto]; d.buscaTexto = textoBusca([d.titulo, d.criadores, d.assuntos, d.descricao]) }
      }
    } else if (!d.autorUserId && !d.autorStudentId && req.user?.role === 'TEACHER') d.autorUserId = req.user.id
    if (d.programId && !(await prisma.academicProgram.findFirst({ where: { id: d.programId, tenantId }, select: { id: true } }))) throw httpErr(404, 'Curso não encontrado.')
    if (d.autorStudentId && !(await prisma.student.findFirst({ where: { id: d.autorStudentId, tenantId }, select: { id: true } }))) throw httpErr(404, 'Aluno autor não encontrado.')
    const item = await prisma.bibRepositorioItem.create({ data: { ...d, tenantId, handle: novoHandle() } })
    await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'CRIAR_ITEM_REPOSITORIO', refType: 'BibRepositorioItem', refId: item.id })
    res.status(201).json(item)
  }))

  router.get('/repositorio', requireRole(...AUTORES, 'SECRETARY', 'STAFF'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    if (!ehGestor(req) && !['SECRETARY', 'STAFF'].includes(String(req.user?.role)))
      where.OR = [{ autorUserId: getUserId(req) }, ...(req.user?.studentId ? [{ autorStudentId: req.user.studentId }] : [])]
    for (const k of ['status', 'tipo', 'programId', 'autorStudentId']) if (qs(req.query[k])) where[k] = qs(req.query[k])
    const q = qs(req.query.q)
    if (q) where.buscaTexto = { contains: normalizarBusca(q) }
    const [items, total] = await Promise.all([
      prisma.bibRepositorioItem.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take, select: { id: true, handle: true, tipo: true, status: true, titulo: true, criadores: true, orientador: true, dataPublicacao: true, embargoAte: true, programId: true, visualizacoes: true, downloads: true, createdAt: true } }),
      prisma.bibRepositorioItem.count({ where }),
    ])
    res.json({ items, total, page, pageSize })
  }))

  router.get('/repositorio/:id', requireRole(...AUTORES, 'SECRETARY', 'STAFF'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const i = await carregar(req, String(req.params.id))
    const proprio = i.autorUserId === req.user?.id || (!!req.user?.studentId && i.autorStudentId === req.user.studentId)
    if (!ehGestor(req) && !proprio && !['SECRETARY', 'STAFF'].includes(String(req.user?.role)) && i.status !== 'PUBLICADO') throw httpErr(403, 'Sem permissão.')
    const { arquivoDataUrl, ...resto } = i
    res.json({ ...resto, temArquivo: !!(i.arquivoUrl || arquivoDataUrl), acesso: situacaoAcesso(i), pendenciasPublicacao: i.status === 'PUBLICADO' ? [] : validarPublicacao(i) })
  }))

  const atualizar = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const i = await carregar(req, String(req.params.id))
    if (!podeEditar(req, i)) throw httpErr(403, 'Item não editável por você neste status.')
    const d = derivarRepo(parseBody(base.partial(), req.body), i)
    if (!ehGestor(req)) { delete d.autorStudentId; delete d.autorUserId; delete d.embargoAte; delete d.restrito; delete d.licenca }
    if (d.programId && !(await prisma.academicProgram.findFirst({ where: { id: d.programId, tenantId }, select: { id: true } }))) throw httpErr(404, 'Curso não encontrado.')
    const upd = await prisma.bibRepositorioItem.update({ where: { id: i.id }, data: d })
    await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'ATUALIZAR_ITEM_REPOSITORIO', refType: 'BibRepositorioItem', refId: i.id })
    const { arquivoDataUrl, ...resto } = upd
    res.json(resto)
  })
  router.put('/repositorio/:id', roleGuard, atualizar)
  router.patch('/repositorio/:id', roleGuard, atualizar)

  router.delete('/repositorio/:id', requireRole(...BIB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const i = await carregar(req, String(req.params.id))
    if (i.status === 'PUBLICADO') throw httpErr(409, 'Item publicado: use "retirar" (preserva o registro).')
    await prisma.bibRepositorioItem.delete({ where: { id: i.id } })
    await audit({ tenantId: i.tenantId, userId: getUserId(req), modulo: MOD, acao: 'REMOVER', refType: 'BibRepositorioItem', refId: i.id })
    res.status(204).end()
  }))

  router.post('/repositorio/:id/enviar-revisao', roleGuard, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const i = await carregar(req, String(req.params.id))
    if (!podeEditar(req, i) && !ehGestor(req)) throw httpErr(403, 'Sem permissão.')
    if (i.status !== 'RASCUNHO') throw httpErr(409, 'Somente rascunhos podem ser enviados para revisão.')
    const pend = validarPublicacao(i).filter((p) => !p.startsWith('licença'))
    if (pend.length) throw Object.assign(new Error(`Metadados incompletos: ${pend.join('; ')}`), { status: 422, pendencias: pend })
    const upd = await prisma.bibRepositorioItem.update({ where: { id: i.id }, data: { status: 'EM_REVISAO' } })
    await scheduleReminder({ tenantId, modulo: MOD, titulo: `Revisar item do repositório: ${i.titulo}`, dueAt: new Date(Date.now() + 7 * 86400000), antecedenciaDias: 4, severity: 'ATENCAO', assigneeRole: 'LIBRARIAN', refType: 'BibRepositorioItem', refId: i.id, dedupeKey: `bib-repo-revisao:${i.id}` })
    await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'ENVIAR_REVISAO', refType: 'BibRepositorioItem', refId: i.id })
    res.json({ id: upd.id, status: upd.status })
  }))

  router.post('/repositorio/:id/devolver', requireRole(...BIB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(z.object({ motivo: z.string().trim().min(5) }), req.body)
    const i = await carregar(req, String(req.params.id))
    if (i.status !== 'EM_REVISAO') throw httpErr(409, 'Item não está em revisão.')
    await prisma.bibRepositorioItem.update({ where: { id: i.id }, data: { status: 'RASCUNHO' } })
    await completeReminders({ tenantId, refType: 'BibRepositorioItem', refId: i.id, userId: getUserId(req) })
    if (i.autorUserId || i.autorStudentId) await notificarLeitor({ tenantId, userId: i.autorUserId, studentId: i.autorStudentId }, 'Item do repositório devolvido para ajustes', `"${i.titulo}": ${b.motivo}`, { refType: 'BibRepositorioItem', refId: i.id })
    res.json({ id: i.id, status: 'RASCUNHO' })
  }))

  router.post('/repositorio/:id/publicar', requireRole(...BIB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const i = await carregar(req, String(req.params.id))
    if (!['RASCUNHO', 'EM_REVISAO', 'RETIRADO'].includes(i.status)) throw httpErr(409, 'Item já publicado.')
    const pend = validarPublicacao(i)
    if (pend.length) throw Object.assign(new Error(`Não é possível publicar: ${pend.join('; ')}`), { status: 422, pendencias: pend })
    const cutter = i.cutter || cutterSimplificado(entradaAutor(listaDeTexto(i.criadores)[0] ?? i.titulo).split(',')[0])
    const upd = await prisma.bibRepositorioItem.update({ where: { id: i.id }, data: { status: 'PUBLICADO', publicadoEm: new Date(), dataPublicacao: i.dataPublicacao ?? new Date(), revisadoPorId: getUserId(req), cutter } })
    await completeReminders({ tenantId, refType: 'BibRepositorioItem', refId: i.id, userId: getUserId(req) })
    if (i.embargoAte && i.embargoAte > new Date())
      await scheduleReminder({ tenantId, modulo: MOD, titulo: `Fim de embargo: ${i.titulo}`, descricao: 'O arquivo será liberado automaticamente ao público na data indicada.', dueAt: i.embargoAte, antecedenciaDias: 7, severity: 'INFO', assigneeRole: 'LIBRARIAN', refType: 'BibRepositorioItem', refId: i.id, dedupeKey: `bib-embargo:${i.id}` })
    if (i.autorUserId || i.autorStudentId) await notificarLeitor({ tenantId, userId: i.autorUserId, studentId: i.autorStudentId }, 'Trabalho publicado no repositório institucional', `"${i.titulo}" foi publicado. Identificador: ${i.handle}.`, { refType: 'BibRepositorioItem', refId: i.id })
    await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'PUBLICAR_ITEM', refType: 'BibRepositorioItem', refId: i.id })
    res.json({ id: upd.id, handle: upd.handle, status: upd.status, acesso: situacaoAcesso(upd) })
  }))

  router.post('/repositorio/:id/retirar', requireRole(...BIB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const b = parseBody(z.object({ motivo: z.string().trim().min(5) }), req.body)
    const i = await carregar(req, String(req.params.id))
    if (i.status !== 'PUBLICADO') throw httpErr(409, 'Item não está publicado.')
    await prisma.bibRepositorioItem.update({ where: { id: i.id }, data: { status: 'RETIRADO', direitos: `${i.direitos ?? ''} [Retirado: ${b.motivo}]`.trim() } })
    await audit({ tenantId: i.tenantId, userId: getUserId(req), modulo: MOD, acao: 'RETIRAR_ITEM', refType: 'BibRepositorioItem', refId: i.id, detalhes: b })
    res.json({ id: i.id, status: 'RETIRADO' })
  }))

  // arquivo (inclui acesso restrito/embargado para gestores e comunidade autenticada)
  router.get('/repositorio/:id/arquivo', requireRole(...AUTORES, 'SECRETARY', 'STAFF'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const i = await carregar(req, String(req.params.id))
    const acesso = situacaoAcesso(i)
    if (acesso === 'EMBARGADO' && !ehGestor(req) && i.autorUserId !== req.user?.id) throw httpErr(403, `Arquivo sob embargo até ${i.embargoAte?.toLocaleDateString('pt-BR')}.`)
    if (acesso === 'INDISPONIVEL' && !ehGestor(req) && i.autorUserId !== req.user?.id && i.autorStudentId !== req.user?.studentId) throw httpErr(403, 'Item não publicado.')
    await prisma.bibRepositorioItem.update({ where: { id: i.id }, data: { downloads: { increment: 1 } } })
    return enviarArquivo(res, i)
  }))

  router.get('/repositorio/:id/ficha-catalografica', requireRole(...AUTORES, 'SECRETARY', 'STAFF'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const i = await carregar(req, String(req.params.id))
    res.type('html').send(await fichaHtml(i))
  }))
  router.get('/repositorio/:id/dublin-core', requireRole(...AUTORES, 'SECRETARY', 'STAFF'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    res.type('application/xml').send(dcDoItem(await carregar(req, String(req.params.id))))
  }))
}

export function enviarArquivo(res: Response, i: any) {
  if (i.arquivoDataUrl) {
    const m = /^data:([\w/+.-]+);base64,(.*)$/s.exec(i.arquivoDataUrl)
    if (!m) throw httpErr(500, 'Arquivo corrompido.')
    res.setHeader('Content-Type', m[1])
    res.setHeader('Content-Disposition', `inline; filename="${String(i.arquivoNome || i.handle).replace(/[^\w.\- ]/g, '_')}"`)
    return res.send(Buffer.from(m[2], 'base64'))
  }
  if (i.arquivoUrl) return res.redirect(i.arquivoUrl)
  throw httpErr(404, 'Item sem arquivo anexado.')
}

export function dcDoItem(i: any) {
  return dublinCoreXml({
    titulo: i.titulo, criadores: listaDeTexto(i.criadores), assuntos: listaDeTexto(i.assuntos), descricao: i.descricao, editor: i.editor,
    colaboradores: [...listaDeTexto(i.colaboradores), ...(i.orientador ? [i.orientador] : []), ...(i.coorientador ? [i.coorientador] : [])],
    data: i.dataPublicacao, tipo: i.tipo, formato: i.formato, identificador: i.handle, fonte: i.fonte, idioma: i.idioma, relacao: i.relacao, cobertura: i.cobertura, direitos: [i.licenca, i.direitos].filter(Boolean).join(' — ') || null,
  })
}

export async function fichaHtml(i: any) {
  const b = await getBranding(i.tenantId)
  const cfg = await prisma.bibConfig.findUnique({ where: { tenantId: i.tenantId } })
  let curso: string | null = null
  if (i.programId) curso = (await prisma.academicProgram.findFirst({ where: { id: i.programId, tenantId: i.tenantId }, select: { nome: true } }))?.nome ?? null
  const corpo = fichaCatalograficaHtmlCorpo({
    titulo: i.titulo, criadores: listaDeTexto(i.criadores), ano: (i.dataPublicacao ?? i.createdAt)?.getFullYear?.() ?? null, paginas: i.paginas, ilustrado: i.ilustrado,
    orientador: i.orientador, coorientador: i.coorientador, tipo: i.tipo, curso, instituicao: b.nome, assuntos: listaDeTexto(i.assuntos), cdd: i.cdd, cutter: i.cutter,
    bibliotecarioNome: cfg?.bibliotecarioNome, bibliotecarioCrb: cfg?.bibliotecarioCrb,
  })
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Ficha catalográfica</title><body style="margin:0;font-family:sans-serif">${brandHeaderHtml(b, { titulo: 'Ficha Catalográfica', subtitulo: 'Sistema de Bibliotecas — Repositório Institucional' })}<main style="padding:24px">${corpo}<p style="text-align:center;font-size:11px;color:#64748b">Identificador: ${i.handle}. Esta ficha deve ser impressa no verso da folha de rosto do trabalho.</p></main></body></html>`
}
