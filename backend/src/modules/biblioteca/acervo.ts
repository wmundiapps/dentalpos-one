import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { mountCrud, parseBody, pageParams, qs } from '../core/crud'
import { audit } from '../core/notify'
import { brandHeaderHtml, getBranding, escapeHtml } from '../core/branding'
import { BIB, LEITURA, MOD, derivarObra, httpErr, optDate, strList } from './common'
import { atribuirReservas, gerarTombos } from './service'
import { listaDeTexto, normalizarIsbn, parseCsv, validarIsbn } from './logic'

const obraBase = z.object({
  titulo: z.string().trim().min(1),
  subtitulo: z.string().trim().optional().nullable(),
  tipo: z.enum(['LIVRO', 'PERIODICO', 'TESE', 'DVD', 'NORMA', 'MAPA', 'OUTRO']).optional(),
  autores: strList,
  editora: z.string().trim().optional().nullable(),
  edicao: z.string().trim().optional().nullable(),
  ano: z.coerce.number().int().min(1400).max(2100).optional().nullable(),
  isbn: z.string().trim().optional().nullable(),
  issn: z.string().trim().optional().nullable(),
  cdd: z.string().trim().optional().nullable(),
  cdu: z.string().trim().optional().nullable(),
  cutter: z.string().trim().optional().nullable(),
  assuntos: strList,
  idioma: z.string().trim().optional().nullable(),
  paginas: z.coerce.number().int().min(1).optional().nullable(),
  resumo: z.string().optional().nullable(),
  capaUrl: z.string().optional().nullable(),
  ativo: z.boolean().optional(),
})

const exemplarBase = z.object({
  obraId: z.string().min(1),
  tombo: z.string().trim().min(1).optional(),
  codigoBarras: z.string().trim().optional().nullable(),
  spaceId: z.string().optional().nullable(),
  estante: z.string().trim().optional().nullable(),
  prateleira: z.string().trim().optional().nullable(),
  estado: z.enum(['OTIMO', 'BOM', 'REGULAR', 'RUIM', 'PESSIMO']).optional(),
  apenasConsulta: z.boolean().optional(),
  aquisicaoTipo: z.enum(['COMPRA', 'DOACAO', 'PERMUTA', 'PRODUCAO_INSTITUCIONAL']).optional(),
  dataAquisicao: optDate,
  valor: z.coerce.number().min(0).optional().nullable(),
  fornecedor: z.string().trim().optional().nullable(),
  notaFiscal: z.string().trim().optional().nullable(),
  observacoes: z.string().optional().nullable(),
})

async function checarEspaco(tenantId: string, spaceId?: string | null) {
  if (!spaceId) return
  const s = await prisma.eduSpace.findFirst({ where: { id: spaceId, tenantId }, select: { id: true } })
  if (!s) throw httpErr(400, 'Espaço (spaceId) não encontrado.')
}

export function mountAcervo(router: Router) {
  // ---- busca avançada interna (inclui disponibilidade) ----
  router.get('/acervo/busca', requireRole(...LEITURA, 'STUDENT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    res.json(await buscarCatalogo(getTenantId(req), req.query))
  }))

  // lookup rápido por tombo / código de barras (balcão)
  router.get('/exemplares/lookup/:codigo', requireRole(...BIB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const c = String(req.params.codigo)
    const ex = await prisma.bibExemplar.findFirst({ where: { tenantId, OR: [{ tombo: c }, { codigoBarras: c }] }, include: { obra: true } })
    if (!ex) return res.status(404).json({ error: 'Exemplar não encontrado.' })
    const emp = ex.status === 'EMPRESTADO' ? await prisma.bibEmprestimo.findFirst({ where: { tenantId, exemplarId: ex.id, status: 'ATIVO' }, include: { leitor: { select: { id: true, nome: true, perfil: true } } } }) : null
    res.json({ ...ex, emprestimoAtivo: emp })
  }))

  // ---- importação em lote ----
  router.post('/obras/importar', requireRole(...BIB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(z.object({
      formato: z.enum(['json', 'csv']).default('json'),
      dados: z.union([z.string(), z.array(z.record(z.string(), z.any()))]),
      dryRun: z.boolean().default(false),
      spaceId: z.string().optional(),
      estante: z.string().optional(),
      aquisicaoTipo: z.enum(['COMPRA', 'DOACAO', 'PERMUTA', 'PRODUCAO_INSTITUCIONAL']).default('COMPRA'),
    }), req.body)
    await checarEspaco(tenantId, b.spaceId)
    let linhas: Array<Record<string, any>>
    if (typeof b.dados === 'string') {
      linhas = b.formato === 'csv' ? parseCsv(b.dados) : (() => { try { const j = JSON.parse(b.dados as string); return Array.isArray(j) ? j : [j] } catch { throw httpErr(400, 'JSON inválido.') } })()
    } else linhas = b.dados
    if (linhas.length > 2000) throw httpErr(400, 'Máximo de 2000 linhas por importação.')
    const rel = { total: linhas.length, obrasCriadas: 0, obrasExistentes: 0, exemplaresCriados: 0, erros: [] as Array<{ linha: number; erro: string }>, avisos: [] as Array<{ linha: number; aviso: string }> }
    for (let i = 0; i < linhas.length; i++) {
      const raw = linhas[i]
      const n = i + 1
      try {
        const titulo = String(raw.titulo ?? raw.title ?? '').trim()
        if (!titulo) throw new Error('título ausente')
        const isbn = normalizarIsbn(raw.isbn)
        if (isbn && !validarIsbn(isbn)) rel.avisos.push({ linha: n, aviso: `ISBN ${raw.isbn} com dígito verificador inválido (importado mesmo assim).` })
        const autores = listaDeTexto(raw.autores)
        const qtd = Math.min(500, Math.max(0, parseInt(String(raw.exemplares ?? '1'), 10) || 0))
        let obra = isbn ? await prisma.bibObra.findFirst({ where: { tenantId, isbn } }) : null
        if (!obra) obra = await prisma.bibObra.findFirst({ where: { tenantId, titulo: { equals: titulo, mode: 'insensitive' }, ...(autores[0] ? { autoresTexto: { contains: autores[0], mode: 'insensitive' } } : {}) } })
        const tipo = ['LIVRO', 'PERIODICO', 'TESE', 'DVD', 'NORMA', 'MAPA', 'OUTRO'].includes(String(raw.tipo ?? '').toUpperCase()) ? String(raw.tipo).toUpperCase() : 'LIVRO'
        if (obra) rel.obrasExistentes++
        else {
          const dados = derivarObra({
            titulo, subtitulo: raw.subtitulo || null, tipo, autores, editora: raw.editora || null, edicao: raw.edicao || null,
            ano: raw.ano ? parseInt(String(raw.ano), 10) || null : null, isbn, issn: raw.issn || null, cdd: raw.cdd || null, cdu: raw.cdu || null,
            assuntos: listaDeTexto(raw.assuntos), idioma: raw.idioma || 'pt-BR', paginas: raw.paginas ? parseInt(String(raw.paginas), 10) || null : null, resumo: raw.resumo || null,
          })
          if (!b.dryRun) obra = await prisma.bibObra.create({ data: { ...dados, tenantId } })
          rel.obrasCriadas++
        }
        if (qtd > 0) {
          if (!b.dryRun && obra) {
            const tombos = raw.tombo && qtd === 1 ? [String(raw.tombo)] : await gerarTombos(tenantId, qtd)
            for (const tombo of tombos) {
              await prisma.bibExemplar.create({ data: { tenantId, obraId: obra.id, tombo, spaceId: b.spaceId, estante: raw.estante || b.estante || null, prateleira: raw.prateleira || null, aquisicaoTipo: b.aquisicaoTipo, valor: raw.valor ? Number(String(raw.valor).replace(',', '.')) || null : null, fornecedor: raw.fornecedor || null, dataAquisicao: new Date() } })
              rel.exemplaresCriados++
            }
            await atribuirReservas(tenantId, obra.id)
          } else rel.exemplaresCriados += qtd
        }
      } catch (e: any) {
        rel.erros.push({ linha: n, erro: e?.code === 'P2002' ? 'tombo duplicado' : e?.message || 'erro' })
      }
    }
    if (!b.dryRun) await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'IMPORTAR_ACERVO', detalhes: rel })
    res.json({ dryRun: b.dryRun, ...rel })
  }))

  // ---- exemplares em lote para uma obra ----
  router.post('/obras/:id/exemplares-lote', requireRole(...BIB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const obra = await prisma.bibObra.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!obra) return res.status(404).json({ error: 'Obra não encontrada.' })
    const b = parseBody(exemplarBase.omit({ obraId: true, tombo: true }).extend({ quantidade: z.coerce.number().int().min(1).max(500) }), req.body)
    await checarEspaco(tenantId, b.spaceId)
    const { quantidade, ...resto } = b
    const tombos = await gerarTombos(tenantId, quantidade)
    const criados = []
    for (const tombo of tombos) criados.push(await prisma.bibExemplar.create({ data: { ...resto, tenantId, obraId: obra.id, tombo, dataAquisicao: resto.dataAquisicao ?? new Date() } }))
    await atribuirReservas(tenantId, obra.id)
    await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'CRIAR_EXEMPLARES', refType: 'BibObra', refId: obra.id, detalhes: { quantidade } })
    res.status(201).json({ criados: criados.length, tombos })
  }))

  // ---- mudar estado/status operacional (reparo, retorno ao acervo) ----
  router.post('/exemplares/:id/status', requireRole(...BIB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(z.object({ status: z.enum(['DISPONIVEL', 'EM_REPARO', 'EXTRAVIADO']), estado: z.enum(['OTIMO', 'BOM', 'REGULAR', 'RUIM', 'PESSIMO']).optional() }), req.body)
    const ex = await prisma.bibExemplar.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!ex) return res.status(404).json({ error: 'Exemplar não encontrado.' })
    if (['EMPRESTADO', 'BAIXADO'].includes(ex.status)) return res.status(409).json({ error: `Exemplar ${ex.status}: use devolução/reativação.` })
    if (ex.status === 'RESERVADO' && b.status !== 'DISPONIVEL') return res.status(409).json({ error: 'Exemplar reservado: cancele a reserva antes.' })
    const upd = await prisma.bibExemplar.update({ where: { id: ex.id }, data: { status: b.status, estado: b.estado ?? ex.estado } })
    if (b.status === 'DISPONIVEL') await atribuirReservas(tenantId, ex.obraId)
    await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'STATUS_EXEMPLAR', refType: 'BibExemplar', refId: ex.id, detalhes: b })
    res.json(upd)
  }))

  // ---- baixa / descarte ----
  router.post('/exemplares/:id/baixar', requireRole(...BIB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(z.object({ motivo: z.enum(['PERDA', 'DANO', 'OBSOLETO', 'DOACAO', 'ROUBO', 'DUPLICIDADE', 'OUTRO']), observacao: z.string().trim().min(5, 'Justifique a baixa.') }), req.body)
    const ex = await prisma.bibExemplar.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!ex) return res.status(404).json({ error: 'Exemplar não encontrado.' })
    if (ex.status === 'EMPRESTADO') return res.status(409).json({ error: 'Exemplar emprestado: registre a devolução ou extravio antes.' })
    if (ex.status === 'BAIXADO') return res.status(409).json({ error: 'Exemplar já baixado.' })
    if (ex.status === 'RESERVADO') await prisma.bibReserva.updateMany({ where: { tenantId, exemplarId: ex.id, status: 'DISPONIVEL' }, data: { status: 'AGUARDANDO', exemplarId: null, disponivelEm: null, expiraEm: null } })
    const upd = await prisma.bibExemplar.update({ where: { id: ex.id }, data: { status: 'BAIXADO', baixaMotivo: b.motivo, baixaObs: b.observacao, baixaEm: new Date(), baixaPorId: getUserId(req) } })
    await atribuirReservas(tenantId, ex.obraId)
    await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'BAIXAR_EXEMPLAR', refType: 'BibExemplar', refId: ex.id, detalhes: b })
    res.json(upd)
  }))

  router.post('/exemplares/:id/reativar', requireRole(...BIB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const ex = await prisma.bibExemplar.findFirst({ where: { id: String(req.params.id), tenantId, status: { in: ['BAIXADO', 'EXTRAVIADO'] } } })
    if (!ex) return res.status(404).json({ error: 'Exemplar baixado/extraviado não encontrado.' })
    const upd = await prisma.bibExemplar.update({ where: { id: ex.id }, data: { status: 'DISPONIVEL', baixaMotivo: null, baixaEm: null, baixaObs: null, baixaPorId: null } })
    await atribuirReservas(tenantId, ex.obraId)
    await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'REATIVAR_EXEMPLAR', refType: 'BibExemplar', refId: ex.id })
    res.json(upd)
  }))

  // termo de baixa (HTML com logomarca) — lista de exemplares baixados no período
  router.get('/descartes/termo', requireRole(...BIB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const de = qs(req.query.de) ? new Date(qs(req.query.de)!) : new Date(Date.now() - 365 * 86400000)
    const ate = qs(req.query.ate) ? new Date(qs(req.query.ate)!) : new Date()
    const itens = await prisma.bibExemplar.findMany({ where: { tenantId, status: 'BAIXADO', baixaEm: { gte: de, lte: ate } }, include: { obra: true }, orderBy: { baixaEm: 'asc' }, take: 2000 })
    const b = await getBranding(tenantId)
    const cfg = await prisma.bibConfig.findUnique({ where: { tenantId } })
    const linhas = itens.map((i) => `<tr><td>${escapeHtml(i.tombo)}</td><td>${escapeHtml(i.obra.titulo)}</td><td>${escapeHtml(i.baixaMotivo)}</td><td>${i.baixaEm?.toLocaleDateString('pt-BR') ?? ''}</td><td>${i.valor != null ? 'R$ ' + i.valor.toFixed(2) : ''}</td><td>${escapeHtml(i.baixaObs)}</td></tr>`).join('')
    res.type('html').send(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Termo de baixa do acervo</title><body style="font-family:sans-serif;margin:0">${brandHeaderHtml(b, { titulo: 'Termo de Baixa de Acervo', subtitulo: `Período ${de.toLocaleDateString('pt-BR')} a ${ate.toLocaleDateString('pt-BR')}` })}
<main style="padding:24px"><table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;width:100%;font-size:12px"><thead><tr><th>Tombo</th><th>Título</th><th>Motivo</th><th>Data</th><th>Valor</th><th>Observação</th></tr></thead><tbody>${linhas}</tbody></table>
<p>Total de exemplares baixados: <b>${itens.length}</b></p><div style="margin-top:60px;display:flex;justify-content:space-around"><div style="text-align:center">______________________<br/>${escapeHtml(cfg?.bibliotecarioNome || 'Bibliotecário(a) responsável')}${cfg?.bibliotecarioCrb ? '<br/>' + escapeHtml(cfg.bibliotecarioCrb) : ''}</div><div style="text-align:center">______________________<br/>Direção / Reitoria</div></div></main></body></html>`)
  }))

  // ---- remoções protegidas (antes do CRUD genérico) ----
  router.delete('/exemplares/:id', requireRole(...BIB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const id = String(req.params.id)
    const ex = await prisma.bibExemplar.findFirst({ where: { id, tenantId } })
    if (!ex) return res.status(404).json({ error: 'Exemplar não encontrado.' })
    if (await prisma.bibEmprestimo.count({ where: { tenantId, exemplarId: id } })) return res.status(409).json({ error: 'Exemplar possui histórico de empréstimos: use a baixa (descarte).' })
    await prisma.bibExemplar.delete({ where: { id } })
    await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'REMOVER', refType: 'BibExemplar', refId: id })
    res.status(204).end()
  }))
  router.delete('/obras/:id', requireRole(...BIB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const id = String(req.params.id)
    if (!(await prisma.bibObra.findFirst({ where: { id, tenantId } }))) return res.status(404).json({ error: 'Obra não encontrada.' })
    if (await prisma.bibExemplar.count({ where: { tenantId, obraId: id } })) return res.status(409).json({ error: 'Obra possui exemplares: baixe/remova os exemplares ou desative a obra.' })
    await prisma.bibBibliografia.deleteMany({ where: { tenantId, obraId: id } })
    await prisma.bibObra.delete({ where: { id } })
    await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'REMOVER', refType: 'BibObra', refId: id })
    res.status(204).end()
  }))

  // ---- CRUD ----
  mountCrud(router, {
    model: 'bibObra', path: '/obras', read: LEITURA, write: BIB, readAll: true, modulo: MOD,
    create: obraBase, search: ['titulo', 'autoresTexto', 'isbn', 'editora', 'assuntosTexto'], filters: ['tipo', 'ativo', 'idioma', 'ano'], orderBy: { titulo: 'asc' },
    beforeCreate: (d) => derivarObra(d), beforeUpdate: (d) => derivarObra(d),
  })
  mountCrud(router, {
    model: 'bibExemplar', path: '/exemplares', read: LEITURA, write: BIB, modulo: MOD,
    create: exemplarBase, search: ['tombo', 'codigoBarras', 'estante'], filters: ['obraId', 'status', 'estado', 'spaceId', 'estante'], include: { obra: { select: { id: true, titulo: true, isbn: true } } }, orderBy: { tombo: 'asc' },
    beforeCreate: async (d, req) => {
      const tenantId = getTenantId(req)
      if (!(await prisma.bibObra.findFirst({ where: { id: d.obraId, tenantId } }))) throw httpErr(404, 'Obra não encontrada.')
      await checarEspaco(tenantId, d.spaceId)
      if (!d.tombo) d.tombo = (await gerarTombos(tenantId, 1))[0]
      return d
    },
    afterCreate: async (row, req) => { await atribuirReservas(getTenantId(req), row.obraId) },
    beforeUpdate: async (d, req, cur) => {
      if (d.obraId && d.obraId !== cur.obraId) throw httpErr(400, 'Não é permitido trocar a obra de um exemplar.')
      await checarEspaco(getTenantId(req), d.spaceId)
      return d
    },
  })
  mountCrud(router, {
    model: 'bibPolitica', path: '/politicas', read: LEITURA, write: ['LIBRARIAN'], modulo: MOD, readAll: true,
    create: z.object({
      perfil: z.enum(['ALUNO', 'PROFESSOR', 'FUNCIONARIO', 'EXTERNO']),
      prazoDias: z.coerce.number().int().min(1).max(365), limiteEmprestimos: z.coerce.number().int().min(0).max(100),
      maxRenovacoes: z.coerce.number().int().min(0).max(20), diasRenovacao: z.coerce.number().int().min(1).max(365).optional().nullable(),
      multaDia: z.coerce.number().min(0), multaMaxima: z.coerce.number().min(0).optional().nullable(),
      limiteReservas: z.coerce.number().int().min(0).max(50), diasRetiradaReserva: z.coerce.number().int().min(1).max(30),
      bloqueioDiasPorAtraso: z.coerce.number().int().min(0).max(30).optional(), ativo: z.boolean().optional(),
    }),
    orderBy: { perfil: 'asc' },
  })
}

export async function buscarCatalogo(tenantId: string, query: any, opts: { publico?: boolean } = {}) {
  const { skip, take, page, pageSize } = pageParams({ ...query, pageSize: Math.min(Number(qs(query.pageSize) || 20), opts.publico ? 50 : 200) })
  const where: any = { tenantId, ativo: true }
  const q = qs(query.q)
  if (q) where.OR = ['titulo', 'subtitulo', 'autoresTexto', 'assuntosTexto', 'editora', 'isbn', 'cdd'].map((f) => ({ [f]: { contains: f === 'isbn' ? (normalizarIsbn(q) ?? q) : q, mode: 'insensitive' } }))
  const and: any[] = []
  const f = (k: string, campo: string) => { const v = qs(query[k]); if (v) and.push({ [campo]: { contains: v, mode: 'insensitive' } }) }
  f('autor', 'autoresTexto'); f('assunto', 'assuntosTexto'); f('editora', 'editora'); f('titulo', 'titulo'); f('cdd', 'cdd')
  if (qs(query.isbn)) and.push({ isbn: normalizarIsbn(qs(query.isbn)) })
  if (qs(query.tipo)) and.push({ tipo: qs(query.tipo) })
  if (qs(query.idioma)) and.push({ idioma: qs(query.idioma) })
  if (qs(query.ano)) and.push({ ano: Number(qs(query.ano)) })
  if (qs(query.anoDe)) and.push({ ano: { gte: Number(qs(query.anoDe)) } })
  if (qs(query.anoAte)) and.push({ ano: { lte: Number(qs(query.anoAte)) } })
  if (qs(query.disponivel) === 'true') and.push({ exemplares: { some: { status: 'DISPONIVEL', apenasConsulta: false } } })
  if (and.length) where.AND = and
  const [obras, total] = await Promise.all([
    prisma.bibObra.findMany({ where, orderBy: { titulo: 'asc' }, skip, take, select: { id: true, titulo: true, subtitulo: true, tipo: true, autores: true, editora: true, edicao: true, ano: true, isbn: true, cdd: true, assuntos: true, idioma: true, capaUrl: true } }),
    prisma.bibObra.count({ where }),
  ])
  const ids = obras.map((o) => o.id)
  const [grupos, virtuais] = ids.length
    ? await Promise.all([
        prisma.bibExemplar.groupBy({ by: ['obraId', 'status'], where: { tenantId, obraId: { in: ids }, status: { notIn: ['BAIXADO', 'EXTRAVIADO'] } }, _count: { _all: true } }),
        prisma.bibRecursoVirtual.findMany({ where: { tenantId, obraId: { in: ids }, ativo: true }, select: { obraId: true, id: true, tipoAcesso: true } }),
      ])
    : [[], []]
  const items = obras.map((o) => {
    const g = grupos.filter((x) => x.obraId === o.id)
    const total = g.reduce((s, x) => s + x._count._all, 0)
    const disp = g.find((x) => x.status === 'DISPONIVEL')?._count._all ?? 0
    return { ...o, exemplaresTotal: total, exemplaresDisponiveis: disp, acessoVirtual: virtuais.some((v) => v.obraId === o.id) }
  })
  return { items, total, page, pageSize }
}
