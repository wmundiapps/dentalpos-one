import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { mountCrud, pageParams, parseBody, qs } from '../core/crud'
import { audit } from '../core/notify'
import {
  BibItem, PubIn, hashDedupe, indicadoresProducao, normalizarDoi, normalizarOrcid, normalizarQualis, parseBibtex, validarIssn, validarOrcid,
} from './lib'
import { DOCENTES, GESTAO, LEITORES_ALUNO, MOD, docentesPorNome, ehGestor, httpErr } from './common'
import { normalizarTexto } from './lib'

const autorSchema = z.object({
  ordem: z.number().int().min(1).optional(),
  tipo: z.enum(['DOCENTE', 'ALUNO', 'EXTERNO']).default('EXTERNO'),
  nome: z.string().trim().min(2),
  userId: z.string().optional().nullable(),
  studentId: z.string().optional().nullable(),
  orcid: z.string().optional().nullable(),
  lattes: z.string().optional().nullable(),
  instituicao: z.string().optional().nullable(),
  correspondente: z.boolean().optional(),
})

const pubSchema = z.object({
  tipo: z.enum(['ARTIGO', 'LIVRO', 'CAPITULO', 'TRABALHO_EVENTO', 'PATENTE', 'SOFTWARE', 'OUTRO']),
  titulo: z.string().trim().min(3),
  resumo: z.string().optional().nullable(),
  palavrasChave: z.array(z.string()).default([]),
  ano: z.number().int().min(1900).max(2100),
  dataPublicacao: z.coerce.date().optional().nullable(),
  veiculo: z.string().optional().nullable(),
  issn: z.string().optional().nullable(),
  isbn: z.string().optional().nullable(),
  volume: z.string().optional().nullable(),
  numero: z.string().optional().nullable(),
  paginas: z.string().optional().nullable(),
  doi: z.string().optional().nullable(),
  url: z.string().optional().nullable(),
  idioma: z.string().optional().nullable(),
  qualis: z.string().optional().nullable(),
  jcr: z.number().min(0).optional().nullable(),
  citeScore: z.number().min(0).optional().nullable(),
  numeroRegistro: z.string().optional().nullable(),
  citacoes: z.number().int().min(0).optional(),
  programId: z.string().optional().nullable(),
  grupoId: z.string().optional().nullable(),
  projetoId: z.string().optional().nullable(),
  autores: z.array(autorSchema).default([]),
})
type PubInput = z.infer<typeof pubSchema>

// valida identificadores e normaliza campos; lança 400 com a lista de problemas
export function validarPublicacao(d: PubInput) {
  const erros: string[] = []
  let doi: string | null = null
  if (d.doi) {
    doi = normalizarDoi(d.doi)
    if (!doi) erros.push('DOI inválido (formato 10.xxxx/yyyy).')
  }
  if (d.issn && !validarIssn(d.issn)) erros.push('ISSN inválido (dígito verificador).')
  let qualis: string | null = null
  if (d.qualis) {
    qualis = normalizarQualis(d.qualis)
    if (!qualis) erros.push('Qualis deve ser A1-A4, B1-B4 ou C.')
  }
  d.autores.forEach((a, i) => {
    if (a.orcid && !validarOrcid(a.orcid)) erros.push(`ORCID inválido para o autor ${i + 1} (${a.nome}).`)
    if (a.tipo === 'DOCENTE' && a.studentId) erros.push(`Autor ${a.nome}: docente não pode ter studentId.`)
  })
  if (erros.length) throw httpErr(400, `Dados inválidos — ${erros.join(' ')}`)
  return { doi, qualis }
}

async function salvarPublicacao(tenantId: string, d: PubInput, origem: string, id?: string) {
  const { doi, qualis } = validarPublicacao(d)
  const { autores, ...resto } = d
  const hash = hashDedupe(d.tipo, d.titulo, d.ano, doi)
  const data: any = { ...resto, doi, qualis, hashDedupe: hash, origem }
  const autoresData = autores.map((a, i) => ({
    tenantId,
    ordem: a.ordem ?? i + 1,
    tipo: a.tipo,
    nome: a.nome,
    userId: a.userId ?? null,
    studentId: a.studentId ?? null,
    orcid: normalizarOrcid(a.orcid),
    lattes: a.lattes ?? null,
    instituicao: a.instituicao ?? null,
    correspondente: !!a.correspondente,
  }))
  if (id) {
    return prisma.$transaction(async (tx) => {
      await tx.pesPublicacaoAutor.deleteMany({ where: { publicacaoId: id, tenantId } })
      return tx.pesPublicacao.update({ where: { id }, data: { ...data, autores: { create: autoresData } }, include: { autores: { orderBy: { ordem: 'asc' } } } })
    })
  }
  return prisma.pesPublicacao.create({ data: { ...data, tenantId, autores: { create: autoresData } }, include: { autores: { orderBy: { ordem: 'asc' } } } })
}

function bibParaInput(b: BibItem, extra: { programId?: string | null; grupoId?: string | null; projetoId?: string | null }, docentes: Map<string, string>): PubInput {
  return {
    tipo: b.tipo,
    titulo: b.titulo,
    resumo: b.resumo ?? null,
    palavrasChave: b.palavrasChave,
    ano: b.ano,
    veiculo: b.veiculo ?? null,
    issn: b.issn && validarIssn(b.issn) ? b.issn : null,
    isbn: b.isbn ?? null,
    volume: b.volume ?? null,
    numero: b.numero ?? null,
    paginas: b.paginas ?? null,
    doi: b.doi ?? null,
    url: b.url ?? null,
    idioma: b.idioma ?? null,
    programId: extra.programId ?? null,
    grupoId: extra.grupoId ?? null,
    projetoId: extra.projetoId ?? null,
    autores: b.autores.map((nome, i) => {
      const uid = docentes.get(normalizarTexto(nome))
      return { ordem: i + 1, tipo: uid ? ('DOCENTE' as const) : ('EXTERNO' as const), nome, userId: uid ?? null }
    }),
  } as PubInput
}

async function carregarPubsParaIndicadores(tenantId: string, where: any = {}): Promise<PubIn[]> {
  const rows = await prisma.pesPublicacao.findMany({ where: { tenantId, ...where }, include: { autores: true }, take: 20000 })
  return rows.map((r) => ({
    tipo: r.tipo,
    ano: r.ano,
    qualis: r.qualis,
    jcr: r.jcr,
    doi: r.doi,
    programId: r.programId,
    grupoId: r.grupoId,
    autores: r.autores.map((a) => ({ tipo: a.tipo, userId: a.userId, nome: a.nome })),
  }))
}

export default function mountPublicacoes(router: Router) {
  // ---------- Publicações ----------
  router.get(
    '/publicacoes',
    requireRole(...LEITORES_ALUNO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const { skip, take, page, pageSize } = pageParams(req.query)
      const where: any = { tenantId }
      for (const f of ['tipo', 'qualis', 'programId', 'grupoId', 'projetoId']) {
        const v = qs((req.query as any)[f])
        if (v) where[f] = v
      }
      const ano = qs(req.query.ano)
      if (ano) where.ano = parseInt(ano, 10)
      const q = qs(req.query.q)
      if (q) where.OR = [{ titulo: { contains: q, mode: 'insensitive' } }, { veiculo: { contains: q, mode: 'insensitive' } }, { doi: { contains: q, mode: 'insensitive' } }]
      const docenteId = qs(req.query.docenteId)
      const studentId = qs(req.query.studentId)
      if (docenteId) where.autores = { some: { userId: docenteId } }
      if (studentId) where.autores = { some: { studentId } }
      const [items, total] = await Promise.all([
        prisma.pesPublicacao.findMany({ where, include: { autores: { orderBy: { ordem: 'asc' } } }, orderBy: [{ ano: 'desc' }, { createdAt: 'desc' }], skip, take }),
        prisma.pesPublicacao.count({ where }),
      ])
      res.json({ items, total, page, pageSize })
    }),
  )

  router.get(
    '/publicacoes/:id',
    requireRole(...LEITORES_ALUNO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const row = await prisma.pesPublicacao.findFirst({ where: { id: String(req.params.id), tenantId: getTenantId(req) }, include: { autores: { orderBy: { ordem: 'asc' } } } })
      if (!row) return res.status(404).json({ error: 'Publicação não encontrada.' })
      res.json(row)
    }),
  )

  router.post(
    '/publicacoes',
    requireRole(...DOCENTES),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const d = parseBody(pubSchema, req.body)
      // docente comum cadastra com ele próprio como autor, se nenhum docente informado
      if (!ehGestor(req) && !d.autores.some((a) => a.userId === req.user!.id)) {
        if (!d.autores.some((a) => a.tipo === 'DOCENTE')) d.autores.unshift({ tipo: 'DOCENTE', nome: 'Autor', userId: req.user!.id } as any)
      }
      try {
        const row = await salvarPublicacao(tenantId, d, 'MANUAL')
        await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'CRIAR_PUBLICACAO', refType: 'PesPublicacao', refId: row.id })
        res.status(201).json(row)
      } catch (e: any) {
        if (e?.code === 'P2002') throw httpErr(409, 'Publicação já cadastrada (mesmo DOI ou título/ano).')
        throw e
      }
    }),
  )

  const atualizar = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const id = String(req.params.id)
    const atual = await prisma.pesPublicacao.findFirst({ where: { id, tenantId }, include: { autores: true } })
    if (!atual) return res.status(404).json({ error: 'Publicação não encontrada.' })
    if (!ehGestor(req) && !atual.autores.some((a) => a.userId === req.user!.id)) throw httpErr(403, 'Somente autores ou a coordenação editam a publicação.')
    const d = parseBody(pubSchema.partial(), req.body)
    const merged = {
      ...(atual as any),
      ...d,
      autores: d.autores ?? atual.autores.map((a) => ({ ordem: a.ordem, tipo: a.tipo, nome: a.nome, userId: a.userId, studentId: a.studentId, orcid: a.orcid, lattes: a.lattes, instituicao: a.instituicao, correspondente: a.correspondente })),
    } as PubInput
    delete (merged as any).id
    delete (merged as any).tenantId
    delete (merged as any).createdAt
    delete (merged as any).updatedAt
    delete (merged as any).hashDedupe
    delete (merged as any).origem
    try {
      const row = await salvarPublicacao(tenantId, merged, atual.origem, id)
      await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'ATUALIZAR_PUBLICACAO', refType: 'PesPublicacao', refId: id })
      res.json(row)
    } catch (e: any) {
      if (e?.code === 'P2002') throw httpErr(409, 'Já existe outra publicação com o mesmo DOI ou título/ano.')
      throw e
    }
  })
  router.put('/publicacoes/:id', requireRole(...DOCENTES), atualizar)
  router.patch('/publicacoes/:id', requireRole(...DOCENTES), atualizar)

  router.delete(
    '/publicacoes/:id',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const id = String(req.params.id)
      const r = await prisma.pesPublicacao.deleteMany({ where: { id, tenantId } })
      if (!r.count) return res.status(404).json({ error: 'Publicação não encontrada.' })
      await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'REMOVER_PUBLICACAO', refType: 'PesPublicacao', refId: id })
      res.status(204).end()
    }),
  )

  // Importação em lote (BibTeX ou JSON). dryRun=true só valida/mostra o que seria criado.
  router.post(
    '/publicacoes/importar',
    requireRole(...DOCENTES),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const body = parseBody(
        z.object({
          formato: z.enum(['BIBTEX', 'JSON']),
          conteudo: z.string().optional(),
          itens: z.array(pubSchema).optional(),
          programId: z.string().optional().nullable(),
          grupoId: z.string().optional().nullable(),
          projetoId: z.string().optional().nullable(),
          dryRun: z.boolean().default(false),
          vincularDocentes: z.boolean().default(true),
        }),
        req.body,
      )
      const docentes = body.vincularDocentes ? await docentesPorNome(tenantId) : new Map<string, string>()
      const erros: string[] = []
      let inputs: PubInput[] = []
      if (body.formato === 'BIBTEX') {
        if (!body.conteudo) throw httpErr(400, 'Informe o conteúdo BibTeX em "conteudo".')
        const r = parseBibtex(body.conteudo)
        erros.push(...r.erros)
        inputs = r.itens.map((b) => bibParaInput(b, body, docentes))
      } else {
        inputs = (body.itens ?? []).map((i) => ({ ...i, programId: i.programId ?? body.programId ?? null, grupoId: i.grupoId ?? body.grupoId ?? null, projetoId: i.projetoId ?? body.projetoId ?? null }))
      }
      if (inputs.length > 500) throw httpErr(400, 'Importe no máximo 500 itens por lote.')
      const criadas: string[] = []
      const duplicadas: string[] = []
      const invalidas: Array<{ titulo: string; erro: string }> = []
      for (const inp of inputs) {
        try {
          const { doi } = validarPublicacao(inp)
          const hash = hashDedupe(inp.tipo, inp.titulo, inp.ano, doi)
          const ja = await prisma.pesPublicacao.findFirst({ where: { tenantId, hashDedupe: hash }, select: { id: true } })
          if (ja) { duplicadas.push(inp.titulo); continue }
          if (body.dryRun) { criadas.push(inp.titulo); continue }
          const row = await salvarPublicacao(tenantId, inp, body.formato)
          criadas.push(row.id)
        } catch (e: any) {
          if (e?.code === 'P2002') duplicadas.push(inp.titulo)
          else invalidas.push({ titulo: inp.titulo, erro: e?.message || 'erro' })
        }
      }
      if (!body.dryRun) await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'IMPORTAR_PUBLICACOES', detalhes: { formato: body.formato, criadas: criadas.length, duplicadas: duplicadas.length } })
      res.status(body.dryRun ? 200 : 201).json({ dryRun: body.dryRun, lidas: inputs.length, criadas: criadas.length, duplicadas, invalidas, avisos: erros, itens: criadas })
    }),
  )

  // ---------- Indicadores ----------
  router.get(
    '/indicadores/producao',
    requireRole(...DOCENTES, 'LIBRARIAN', 'SECRETARY'),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const anoInicio = qs(req.query.anoInicio) ? parseInt(qs(req.query.anoInicio)!, 10) : undefined
      const anoFim = qs(req.query.anoFim) ? parseInt(qs(req.query.anoFim)!, 10) : undefined
      let userId = qs(req.query.userId)
      if (!ehGestor(req) && String(req.user?.role).toUpperCase() === 'TEACHER') userId = req.user!.id // docente só vê o próprio
      const pubs = await carregarPubsParaIndicadores(tenantId)
      res.json(indicadoresProducao(pubs, { anoInicio, anoFim, programId: qs(req.query.programId), grupoId: qs(req.query.grupoId), userId }))
    }),
  )

  // Produção por docente ano a ano (plano de carreira / regulatório).
  router.get(
    '/indicadores/docente/:userId',
    requireRole(...DOCENTES),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const userId = String(req.params.userId)
      if (!ehGestor(req) && req.user!.id !== userId) throw httpErr(403, 'Sem permissão para consultar outro docente.')
      const pubs = await carregarPubsParaIndicadores(tenantId, { autores: { some: { userId } } })
      const anos = [...new Set(pubs.map((p) => p.ano))].sort()
      const porAno = anos.map((a) => ({ ano: a, ...indicadoresProducao(pubs, { anoInicio: a, anoFim: a, userId }) }))
      const [projetos, trabalhos] = await Promise.all([
        prisma.pesProjeto.count({ where: { tenantId, coordenadorUserId: userId } }),
        prisma.pesTrabalho.count({ where: { tenantId, orientadorUserId: userId } }),
      ])
      res.json({ userId, total: indicadoresProducao(pubs, { userId }), porAno, projetosCoordenados: projetos, orientacoes: trabalhos })
    }),
  )

  router.get(
    '/indicadores/curso/:programId',
    requireRole(...GESTAO, 'SECRETARY'),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const programId = String(req.params.programId)
      const anoInicio = qs(req.query.anoInicio) ? parseInt(qs(req.query.anoInicio)!, 10) : undefined
      const anoFim = qs(req.query.anoFim) ? parseInt(qs(req.query.anoFim)!, 10) : undefined
      const pubs = await carregarPubsParaIndicadores(tenantId, { programId })
      const [projetos, trabalhos] = await Promise.all([
        prisma.pesProjeto.groupBy({ by: ['status'], where: { tenantId, programId }, _count: true }),
        prisma.pesTrabalho.groupBy({ by: ['status'], where: { tenantId, programId }, _count: true }),
      ])
      res.json({ programId, producao: indicadoresProducao(pubs, { anoInicio, anoFim }), projetosPorStatus: projetos.map((p) => ({ status: p.status, total: p._count })), trabalhosPorStatus: trabalhos.map((p) => ({ status: p.status, total: p._count })) })
    }),
  )

  // ---------- Grupos de pesquisa ----------
  mountCrud(router, {
    model: 'pesGrupo',
    path: '/grupos',
    read: [...DOCENTES, 'LIBRARIAN', 'SECRETARY', 'STAFF', 'STUDENT'],
    write: GESTAO,
    create: z.object({
      nome: z.string().trim().min(3),
      sigla: z.string().optional().nullable(),
      areaConhecimento: z.string().optional().nullable(),
      descricao: z.string().optional().nullable(),
      liderUserId: z.string().optional().nullable(),
      liderNome: z.string().optional().nullable(),
      viceLiderUserId: z.string().optional().nullable(),
      viceLiderNome: z.string().optional().nullable(),
      programId: z.string().optional().nullable(),
      diretorioCnpqId: z.string().optional().nullable(),
      dataCriacao: z.coerce.date().optional().nullable(),
      ativo: z.boolean().optional(),
    }),
    search: ['nome', 'sigla', 'areaConhecimento'],
    filters: ['ativo', 'programId', 'liderUserId'],
    include: { linhas: true, membros: { where: { dataSaida: null } } },
    orderBy: { nome: 'asc' },
    modulo: MOD,
    beforeCreate: async (data, req) => {
      if (data.liderUserId && !data.liderNome) data.liderNome = (await prisma.user.findFirst({ where: { id: data.liderUserId, tenantId: getTenantId(req) }, select: { firstName: true, lastName: true } }).then((u) => (u ? `${u.firstName} ${u.lastName}` : null))) ?? undefined
      return data
    },
    afterCreate: async (row, req) => {
      // líder entra automaticamente como membro
      if (row.liderNome) await prisma.pesGrupoMembro.create({ data: { tenantId: row.tenantId, grupoId: row.id, tipo: 'DOCENTE', userId: row.liderUserId, nome: row.liderNome, papel: 'LIDER' } })
    },
  })

  mountCrud(router, {
    model: 'pesGrupoLinha',
    path: '/grupos-linhas',
    read: [...DOCENTES, 'STAFF'],
    write: GESTAO,
    create: z.object({ grupoId: z.string(), nome: z.string().trim().min(3), descricao: z.string().optional().nullable(), ativa: z.boolean().optional() }),
    filters: ['grupoId', 'ativa'],
    search: ['nome'],
    modulo: MOD,
    beforeCreate: async (d, req) => {
      if (!(await prisma.pesGrupo.findFirst({ where: { id: d.grupoId, tenantId: getTenantId(req) }, select: { id: true } }))) throw httpErr(404, 'Grupo não encontrado.')
      return d
    },
  })

  mountCrud(router, {
    model: 'pesGrupoMembro',
    path: '/grupos-membros',
    read: [...DOCENTES, 'STAFF'],
    write: GESTAO,
    create: z.object({
      grupoId: z.string(),
      tipo: z.enum(['DOCENTE', 'ALUNO', 'EXTERNO']).default('DOCENTE'),
      userId: z.string().optional().nullable(),
      studentId: z.string().optional().nullable(),
      nome: z.string().trim().min(2),
      papel: z.enum(['LIDER', 'VICE_LIDER', 'PESQUISADOR', 'ESTUDANTE', 'COLABORADOR']).default('PESQUISADOR'),
      lattes: z.string().optional().nullable(),
      orcid: z.string().optional().nullable(),
      dataEntrada: z.coerce.date().optional(),
      dataSaida: z.coerce.date().optional().nullable(),
    }),
    filters: ['grupoId', 'tipo', 'papel', 'userId', 'studentId'],
    search: ['nome'],
    modulo: MOD,
    beforeCreate: async (d, req) => {
      const tenantId = getTenantId(req)
      if (!(await prisma.pesGrupo.findFirst({ where: { id: d.grupoId, tenantId }, select: { id: true } }))) throw httpErr(404, 'Grupo não encontrado.')
      if (d.orcid) {
        if (!validarOrcid(d.orcid)) throw httpErr(400, 'ORCID inválido.')
        d.orcid = normalizarOrcid(d.orcid)
      }
      const dup = await prisma.pesGrupoMembro.findFirst({ where: { tenantId, grupoId: d.grupoId, dataSaida: null, OR: [d.userId ? { userId: d.userId } : { id: '-' }, d.studentId ? { studentId: d.studentId } : { id: '-' }] } })
      if (dup) throw httpErr(409, 'Pessoa já é membro ativo do grupo.')
      return d
    },
  })

  // Desligar membro (preserva histórico)
  router.post(
    '/grupos-membros/:id/desligar',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const m = await prisma.pesGrupoMembro.findFirst({ where: { id: String(req.params.id), tenantId } })
      if (!m) return res.status(404).json({ error: 'Membro não encontrado.' })
      const row = await prisma.pesGrupoMembro.update({ where: { id: m.id }, data: { dataSaida: new Date() } })
      await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'DESLIGAR_MEMBRO_GRUPO', refType: 'PesGrupoMembro', refId: m.id })
      res.json(row)
    }),
  )

  // Painel do grupo: produção, projetos e orientações dos membros
  router.get(
    '/grupos/:id/painel',
    requireRole(...DOCENTES),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const g = await prisma.pesGrupo.findFirst({ where: { id: String(req.params.id), tenantId }, include: { linhas: true, membros: true } })
      if (!g) return res.status(404).json({ error: 'Grupo não encontrado.' })
      const pubs = await carregarPubsParaIndicadores(tenantId, { grupoId: g.id })
      const projetos = await prisma.pesProjeto.groupBy({ by: ['status'], where: { tenantId, grupoId: g.id }, _count: true })
      const trabalhos = await prisma.pesTrabalho.count({ where: { tenantId, grupoId: g.id } })
      res.json({ grupo: g, producao: indicadoresProducao(pubs), projetosPorStatus: projetos.map((p) => ({ status: p.status, total: p._count })), trabalhos })
    }),
  )
}
