import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { dateISO, mountCrud, pageParams, parseBody, qs } from '../core/crud'
import { audit } from '../core/notify'
import { scheduleReminder } from '../core/reminders'
import {
  DouItem, Fetcher, PROVEDORES, classificarItem, parseDataDou, provedorPorFormato, referenciaDouTexto, tipoRegAto, TEMAS,
} from './douLogic'
import { DAY, addDias, enviarCsv, fail, normalizar, toCsv } from './util2'

// Monitor de assuntos regulatórios do Diário Oficial da União (DOU).
// Coleta por provedor (INLABS XML / RSS / colagem manual), classifica pelas palavras-chave
// da instituição e gera tratamento (responsável, prazo, status, vínculo com RegAto).

const STATUS = ['NOVA', 'EM_ANALISE', 'EM_TRATAMENTO', 'CONCLUIDA', 'DESCARTADA'] as const
const RELEV = ['ALTA', 'MEDIA', 'BAIXA', 'NENHUMA'] as const
const COLETADOR_COORD = ['COORDINATOR'] as const

let fetcherTeste: Fetcher | undefined
/** Permite injetar um fetcher nos testes (sem rede). */
export function definirFetcherDou(f?: Fetcher) { fetcherTeste = f }

async function palavrasAtivas(tenantId: string) {
  return (await prisma.reiDouPalavra.findMany({ where: { tenantId, ativo: true }, select: { termo: true, tipo: true, peso: true } }))
}

async function lembrete(tenantId: string, p: { id: string; titulo: string; prazoAcaoEm: Date | null; relevancia: string; responsavelUserId: string | null; status: string }) {
  const dedupeKey = `rei-dou:${p.id}`
  if (!p.prazoAcaoEm || p.relevancia !== 'ALTA' && p.relevancia !== 'MEDIA') return
  if (p.status === 'CONCLUIDA' || p.status === 'DESCARTADA') {
    await prisma.eduReminder.updateMany({ where: { tenantId, dedupeKey, status: { in: ['PENDENTE', 'NOTIFICADO', 'ADIADO'] } }, data: { status: 'CONCLUIDO', concluidoEm: new Date() } })
    return
  }
  await scheduleReminder({
    tenantId, modulo: 'reitoria', titulo: `DOU: ${p.titulo}`.slice(0, 200), descricao: 'Publicação do Diário Oficial com prazo de ação.',
    dueAt: p.prazoAcaoEm, antecedenciaDias: 5, severity: p.relevancia === 'ALTA' ? 'CRITICO' : 'ATENCAO', refType: 'ReiDouPublicacao', refId: p.id,
    assigneeUserId: p.responsavelUserId ?? undefined, assigneeRole: p.responsavelUserId ? undefined : 'RECTOR', dedupeKey,
  })
}

/** Núcleo da ingestão: classifica, deduplica, grava e agenda lembretes. */
export async function ingerirDou(tenantId: string, itens: DouItem[], o: { modo: string; fonte: string; fonteId?: string | null; userId?: string; guardarTudo?: boolean; dryRun?: boolean }) {
  const palavras = await palavrasAtivas(tenantId)
  const classificados = itens.map((i) => ({ i, c: classificarItem(i, palavras) }))
  const existentes = new Set((await prisma.reiDouPublicacao.findMany({ where: { tenantId, identificador: { in: classificados.map((x) => x.c.identificador) } }, select: { identificador: true } })).map((x) => x.identificador))
  const vistos = new Set<string>()
  let novas = 0, duplicadas = 0, descartadas = 0
  const gravadas: any[] = []
  const previa: any[] = []
  for (const { i, c } of classificados) {
    if (existentes.has(c.identificador) || vistos.has(c.identificador)) { duplicadas++; continue }
    vistos.add(c.identificador)
    if (c.relevancia === 'NENHUMA' && !o.guardarTudo) { descartadas++; continue }
    novas++
    const dados = {
      tenantId, identificador: c.identificador, dataPublicacao: i.dataPublicacao, secao: i.secao ?? null, pagina: i.pagina ?? null,
      orgao: c.orgao, orgaoRaw: i.orgaoRaw ?? null, tipoAto: c.tipoAto, numero: c.numero, titulo: i.titulo.slice(0, 500), ementa: i.ementa ?? null,
      texto: i.texto ? i.texto.slice(0, 200_000) : null, url: i.url ?? null, fonte: o.fonte, relevancia: c.relevancia as any, score: c.score, tema: c.tema,
      palavrasEncontradas: c.palavrasEncontradas, prazoAcaoEm: c.prazoAcaoEm,
    }
    if (o.dryRun) { previa.push({ titulo: dados.titulo, relevancia: dados.relevancia, tema: dados.tema, orgao: dados.orgao, palavrasEncontradas: dados.palavrasEncontradas, prazoAcaoEm: dados.prazoAcaoEm }); continue }
    const row = await prisma.reiDouPublicacao.create({ data: dados })
    await tentarVincularAto(tenantId, row)
    await lembrete(tenantId, row as any)
    gravadas.push(row)
  }
  const resumo = { total: itens.length, novas, duplicadas, descartadas }
  if (!o.dryRun) {
    await prisma.reiDouColeta.create({ data: { tenantId, fonteId: o.fonteId ?? null, modo: o.modo, ...resumo, userId: o.userId ?? null } })
    if (o.fonteId) await prisma.reiDouFonte.updateMany({ where: { id: o.fonteId, tenantId }, data: { ultimaColetaEm: new Date(), ultimaColetaStatus: 'OK', ultimaColetaQtd: itens.length } })
  }
  return { ...resumo, publicacoes: gravadas.map((g) => ({ id: g.id, titulo: g.titulo, relevancia: g.relevancia, tema: g.tema })), previa: o.dryRun ? previa : undefined }
}

/** Se já existe RegAto com o mesmo número e tipo, vincula (e preenche referenciaDou se vazia). */
async function tentarVincularAto(tenantId: string, p: { id: string; numero: string | null; tema: string; tipoAto: string; titulo: string; dataPublicacao: Date; secao: number | null; pagina: string | null; relevancia: string }) {
  if (!p.numero || (p.relevancia !== 'ALTA' && p.relevancia !== 'MEDIA')) return null
  const tipo = tipoRegAto(p.tema, p.tipoAto, p.titulo)
  if (tipo === 'OUTRO') return null
  try {
    const ato = await prisma.regAto.findFirst({ where: { tenantId, tipo: tipo as any, numero: p.numero } })
    if (!ato) return null
    await prisma.reiDouPublicacao.update({ where: { id: p.id }, data: { regAtoId: ato.id } })
    if (!ato.referenciaDou) await prisma.regAto.update({ where: { id: ato.id }, data: { referenciaDou: referenciaDouTexto(p) } })
    return ato.id
  } catch { return null }
}

const corpoImportar = z.object({
  formato: z.string().min(2),
  conteudo: z.string().max(15_000_000).optional(),
  url: z.string().max(2000).optional(),
  fonteId: z.string().optional(),
  dataPadrao: z.string().optional(),
  guardarTudo: z.boolean().optional(),
  dryRun: z.boolean().optional(),
})

export function registerDou(router: Router) {
  // ---- palavras-chave e fontes (CRUD) ----
  mountCrud(router, {
    model: 'reiDouPalavra', path: '/dou/palavras', read: [...COLETADOR_COORD], write: [], modulo: 'reitoria', search: ['termo'], filters: ['tipo', 'ativo'], orderBy: { termo: 'asc' },
    create: z.object({
      termo: z.string().trim().min(2).max(200), tipo: z.enum(['INSTITUICAO', 'CNPJ', 'EMEC', 'CURSO', 'ORGAO', 'OUTRO']).default('OUTRO'),
      peso: z.number().int().min(1).max(10).default(5), programId: z.string().optional(), ativo: z.boolean().optional(),
    }),
  })
  mountCrud(router, {
    model: 'reiDouFonte', path: '/dou/fontes', read: [...COLETADOR_COORD], write: [], modulo: 'reitoria', filters: ['tipo', 'ativo'],
    create: z.object({ nome: z.string().trim().min(2).max(120), tipo: z.enum(['INLABS_XML', 'RSS', 'MANUAL']).default('INLABS_XML'), url: z.string().url().max(2000).optional(), ativo: z.boolean().optional() }),
    beforeCreate: (d: any) => { if (d.tipo !== 'MANUAL' && !d.url) fail(400, 'Informe a URL da fonte.'); return d },
  })

  // Sugere palavras-chave a partir do cadastro da instituição e dos cursos (idempotente).
  router.post('/dou/palavras/sugerir', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const inst = await prisma.eduInstitution.findFirst({ where: { tenantId } })
    const cursos = await prisma.academicProgram.findMany({ where: { tenantId }, select: { id: true, nome: true }, take: 300 })
    const cand: Array<{ termo: string; tipo: string; peso: number; programId?: string }> = []
    if (inst?.nome) cand.push({ termo: inst.nome, tipo: 'INSTITUICAO', peso: 10 })
    if (inst?.nomeFantasia) cand.push({ termo: inst.nomeFantasia, tipo: 'INSTITUICAO', peso: 9 })
    if (inst?.sigla && inst.sigla.length >= 3) cand.push({ termo: inst.sigla, tipo: 'INSTITUICAO', peso: 7 })
    if (inst?.mantenedora) cand.push({ termo: inst.mantenedora, tipo: 'INSTITUICAO', peso: 8 })
    if (inst?.cnpj) cand.push({ termo: inst.cnpj, tipo: 'CNPJ', peso: 10 })
    if (inst?.codigoEmec) cand.push({ termo: inst.codigoEmec, tipo: 'EMEC', peso: 8 })
    for (const c of cursos) cand.push({ termo: c.nome.replace(/^(bacharelado|tecn[oó]logo|licenciatura)\s+(em|de)\s+/i, ''), tipo: 'CURSO', peso: 5, programId: c.id })
    let criadas = 0
    for (const c of cand) {
      if (c.termo.trim().length < 2) continue
      const ja = await prisma.reiDouPalavra.findUnique({ where: { tenantId_termo: { tenantId, termo: c.termo.trim() } } })
      if (ja) continue
      await prisma.reiDouPalavra.create({ data: { tenantId, termo: c.termo.trim(), tipo: c.tipo, peso: c.peso, programId: c.programId } })
      criadas++
    }
    res.json({ criadas, candidatas: cand.length })
  }))

  // ---- importação / coleta ----
  router.post('/dou/importar', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(corpoImportar, req.body)
    const prov = provedorPorFormato(b.formato)
    if (!prov) fail(400, 'Formato inválido. Use XML, RSS ou TEXTO.')
    if (!b.conteudo && !b.url) fail(400, 'Informe "conteudo" ou "url".')
    let itens: DouItem[]
    try {
      itens = await prov!.coletar({ conteudo: b.conteudo, url: b.url, dataPadrao: b.dataPadrao ? parseDataDou(b.dataPadrao) : null }, fetcherTeste)
    } catch (e: any) {
      if (b.fonteId) await prisma.reiDouFonte.updateMany({ where: { id: b.fonteId, tenantId }, data: { ultimaColetaEm: new Date(), ultimaColetaStatus: `ERRO: ${String(e?.message || e).slice(0, 200)}` } })
      await prisma.reiDouColeta.create({ data: { tenantId, fonteId: b.fonteId ?? null, modo: prov!.modo, erro: String(e?.message || e).slice(0, 500), userId: getUserId(req) } })
      throw e
    }
    if (!itens.length) fail(422, 'Nenhuma publicação reconhecida no conteúdo informado.')
    const r = await ingerirDou(tenantId, itens, { modo: prov!.modo, fonte: prov!.modo === 'TEXTO' ? 'TEXTO' : prov!.modo, fonteId: b.fonteId, userId: getUserId(req), guardarTudo: b.guardarTudo, dryRun: b.dryRun })
    await audit({ tenantId, userId: getUserId(req), modulo: 'reitoria', acao: b.dryRun ? 'DOU_SIMULAR' : 'DOU_IMPORTAR', refType: 'ReiDouColeta', detalhes: { modo: prov!.modo, total: r.total, novas: r.novas } })
    res.status(b.dryRun ? 200 : 201).json(r)
  }))

  router.post('/dou/coletar', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { fonteId } = parseBody(z.object({ fonteId: z.string() }), req.body)
    res.json(await coletarFonte(tenantId, fonteId, getUserId(req)))
  }))

  router.get('/dou/coletas', requireRole(...COLETADOR_COORD), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    res.json(await prisma.reiDouColeta.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 100 }))
  }))

  // ---- publicações ----
  router.get('/dou/publicacoes', requireRole(...COLETADOR_COORD), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    for (const k of ['status', 'relevancia', 'tema', 'orgao', 'tipoAto']) { const v = qs((req.query as any)[k]); if (v) where[k] = v }
    if (where.status && !STATUS.includes(where.status)) fail(400, 'Status inválido.')
    if (where.relevancia && !RELEV.includes(where.relevancia)) fail(400, 'Relevância inválida.')
    const de = qs(req.query.de), ate = qs(req.query.ate)
    if (de || ate) {
      where.dataPublicacao = {}
      if (de) where.dataPublicacao.gte = parseDataDou(de) ?? fail(400, 'Data "de" inválida.')
      if (ate) where.dataPublicacao.lte = addDias(parseDataDou(ate) ?? fail(400, 'Data "ate" inválida.'), 1)
    }
    if (qs(req.query.semResponsavel) === 'true') where.responsavelUserId = null
    if (qs(req.query.atrasadas) === 'true') { where.prazoAcaoEm = { lt: new Date() }; where.status = { in: ['NOVA', 'EM_ANALISE', 'EM_TRATAMENTO'] } }
    const q = qs(req.query.q)
    if (q) where.OR = [{ titulo: { contains: q, mode: 'insensitive' } }, { ementa: { contains: q, mode: 'insensitive' } }, { texto: { contains: q, mode: 'insensitive' } }, { numero: { contains: q, mode: 'insensitive' } }]
    const [items, total] = await Promise.all([
      prisma.reiDouPublicacao.findMany({ where, orderBy: [{ dataPublicacao: 'desc' }, { score: 'desc' }], skip, take, select: { texto: false, id: true, tenantId: true, identificador: true, dataPublicacao: true, secao: true, pagina: true, orgao: true, orgaoRaw: true, tipoAto: true, numero: true, titulo: true, ementa: true, url: true, fonte: true, relevancia: true, score: true, tema: true, palavrasEncontradas: true, prazoAcaoEm: true, responsavelUserId: true, responsavelNome: true, status: true, regAtoId: true, observacoes: true, tratadaEm: true, createdAt: true, updatedAt: true } }),
      prisma.reiDouPublicacao.count({ where }),
    ])
    if (qs(req.query.formato) === 'csv') {
      return enviarCsv(res, 'dou-publicacoes', toCsv(
        [{ key: 'dataPublicacao', label: 'Data' }, { key: 'orgao', label: 'Órgão' }, { key: 'tipoAto', label: 'Tipo' }, { key: 'numero', label: 'Número' }, { key: 'titulo', label: 'Título' }, { key: 'relevancia', label: 'Relevância' }, { key: 'tema', label: 'Tema' }, { key: 'status', label: 'Status' }, { key: 'prazoAcaoEm', label: 'Prazo de ação' }, { key: 'responsavelNome', label: 'Responsável' }, { key: 'url', label: 'Link' }],
        items.map((i) => ({ ...i, dataPublicacao: i.dataPublicacao.toISOString().slice(0, 10), prazoAcaoEm: i.prazoAcaoEm?.toISOString().slice(0, 10) })),
      ))
    }
    res.json({ items, total, page, pageSize })
  }))

  router.get('/dou/publicacoes/:id', requireRole(...COLETADOR_COORD), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const row = await prisma.reiDouPublicacao.findFirst({ where: { id: String(req.params.id), tenantId: getTenantId(req) } })
    if (!row) return res.status(404).json({ error: 'Publicação não encontrada.' })
    const ato = row.regAtoId ? await prisma.regAto.findFirst({ where: { id: row.regAtoId, tenantId: row.tenantId }, select: { id: true, tipo: true, numero: true, vencimento: true, referenciaDou: true } }) : null
    res.json({ ...row, regAto: ato })
  }))

  // Cadastro manual de uma publicação (classifica automaticamente).
  router.post('/dou/publicacoes', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(z.object({
      dataPublicacao: dateISO(), titulo: z.string().trim().min(3).max(500), ementa: z.string().max(5000).optional(), texto: z.string().max(200_000).optional(),
      orgao: z.string().max(200).optional(), tipo: z.string().max(60).optional(), numero: z.string().max(60).optional(), secao: z.number().int().min(1).max(3).optional(),
      pagina: z.string().max(20).optional(), url: z.string().max(2000).optional(), guardarMesmoSemRelevancia: z.boolean().optional(),
    }), req.body)
    const r = await ingerirDou(tenantId, [{ dataPublicacao: b.dataPublicacao, secao: b.secao, pagina: b.pagina, orgaoRaw: b.orgao, tipoRaw: b.tipo, numero: b.numero, titulo: b.titulo, ementa: b.ementa, texto: b.texto, url: b.url }], { modo: 'JSON', fonte: 'MANUAL', userId: getUserId(req), guardarTudo: b.guardarMesmoSemRelevancia ?? true })
    if (!r.novas) return res.status(r.duplicadas ? 409 : 200).json({ error: r.duplicadas ? 'Publicação já cadastrada.' : 'Sem relevância para a instituição (não gravada).', ...r })
    res.status(201).json(await prisma.reiDouPublicacao.findFirst({ where: { id: r.publicacoes[0].id } }))
  }))

  // Tratamento: status, responsável, prazo, observações, correção manual de relevância/tema.
  router.patch('/dou/publicacoes/:id', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const cur = await prisma.reiDouPublicacao.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!cur) return res.status(404).json({ error: 'Publicação não encontrada.' })
    const b = parseBody(z.object({
      status: z.enum(STATUS).optional(), responsavelUserId: z.string().nullable().optional(), responsavelNome: z.string().max(200).nullable().optional(),
      prazoAcaoEm: dateISO().nullable().optional(), observacoes: z.string().max(5000).nullable().optional(),
      relevancia: z.enum(RELEV).optional(), tema: z.enum(TEMAS).optional(),
    }), req.body)
    if (b.status === 'CONCLUIDA' && cur.relevancia === 'ALTA' && !(b.observacoes ?? cur.observacoes)) fail(400, 'Registre as observações do tratamento antes de concluir uma publicação de relevância ALTA.')
    const data: any = { ...b }
    if (b.status && b.status !== cur.status) data.tratadaEm = ['CONCLUIDA', 'DESCARTADA'].includes(b.status) ? new Date() : null
    if (b.responsavelUserId && !b.responsavelNome) {
      const u = await prisma.user.findFirst({ where: { id: b.responsavelUserId, tenantId }, select: { firstName: true, lastName: true } })
      if (!u) fail(404, 'Responsável não encontrado.')
      data.responsavelNome = `${u!.firstName} ${u!.lastName}`.trim()
    }
    const row = await prisma.reiDouPublicacao.update({ where: { id: cur.id }, data })
    await lembrete(tenantId, row as any)
    await audit({ tenantId, userId: getUserId(req), modulo: 'reitoria', acao: 'DOU_TRATAR', refType: 'ReiDouPublicacao', refId: cur.id, detalhes: { de: cur.status, para: row.status } })
    res.json(row)
  }))

  router.post('/dou/publicacoes/:id/reclassificar', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const cur = await prisma.reiDouPublicacao.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!cur) return res.status(404).json({ error: 'Publicação não encontrada.' })
    res.json(await reclassificar(tenantId, [cur]).then((n) => ({ reclassificadas: n })))
  }))

  // Reaplica as palavras-chave às publicações ainda em aberto.
  router.post('/dou/reclassificar', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const rows = await prisma.reiDouPublicacao.findMany({ where: { tenantId, status: { in: ['NOVA', 'EM_ANALISE'] } }, take: 5000 })
    res.json({ reclassificadas: await reclassificar(tenantId, rows) })
  }))

  // ---- vínculo com RegAto ----
  router.post('/dou/publicacoes/:id/vincular-ato', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { regAtoId } = parseBody(z.object({ regAtoId: z.string().nullable() }), req.body)
    const p = await prisma.reiDouPublicacao.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!p) return res.status(404).json({ error: 'Publicação não encontrada.' })
    if (regAtoId) {
      const ato = await prisma.regAto.findFirst({ where: { id: regAtoId, tenantId } })
      if (!ato) fail(404, 'Ato regulatório não encontrado.')
      if (!ato!.referenciaDou) await prisma.regAto.update({ where: { id: ato!.id }, data: { referenciaDou: referenciaDouTexto(p) } })
    }
    res.json(await prisma.reiDouPublicacao.update({ where: { id: p.id }, data: { regAtoId } }))
  }))

  // Cria o RegAto a partir da publicação (portaria/resolução) e vincula.
  router.post('/dou/publicacoes/:id/criar-ato', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const o = parseBody(z.object({ programId: z.string().optional(), cursoNome: z.string().max(200).optional(), vencimento: dateISO().optional(), escopo: z.enum(['CURSO', 'INSTITUICAO']).optional() }), req.body)
    const p = await prisma.reiDouPublicacao.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!p) return res.status(404).json({ error: 'Publicação não encontrada.' })
    if (p.regAtoId) fail(409, 'Publicação já vinculada a um ato.')
    const numeroAto = p.numero ?? fail(400, 'A publicação não tem número identificado; cadastre o ato manualmente no Regulatório.')
    const tipo = tipoRegAto(p.tema, p.tipoAto, p.titulo)
    if (tipo === 'OUTRO' && !['PORTARIA', 'RESOLUCAO', 'PARECER'].includes(p.tipoAto)) fail(400, 'Este tipo de publicação não gera ato regulatório.')
    const existente = await prisma.regAto.findFirst({ where: { tenantId, tipo: tipo as any, numero: numeroAto } })
    if (existente) {
      await prisma.reiDouPublicacao.update({ where: { id: p.id }, data: { regAtoId: existente.id } })
      if (!existente.referenciaDou) await prisma.regAto.update({ where: { id: existente.id }, data: { referenciaDou: referenciaDouTexto(p) } })
      return res.json({ regAtoId: existente.id, criado: false })
    }
    const ato = await prisma.regAto.create({
      data: {
        tenantId, tipo: tipo as any, numero: numeroAto, orgao: p.orgao ?? 'MEC', dataPublicacao: p.dataPublicacao, referenciaDou: referenciaDouTexto(p),
        escopo: o.escopo ?? (o.programId || o.cursoNome ? 'CURSO' : 'INSTITUICAO'), programId: o.programId, cursoNome: o.cursoNome, vencimento: o.vencimento,
        observacoes: `Criado a partir do monitor do DOU: ${p.titulo}`.slice(0, 500),
      },
    })
    await prisma.reiDouPublicacao.update({ where: { id: p.id }, data: { regAtoId: ato.id } })
    await audit({ tenantId, userId: getUserId(req), modulo: 'reitoria', acao: 'DOU_CRIAR_ATO', refType: 'RegAto', refId: ato.id })
    res.status(201).json({ regAtoId: ato.id, criado: true })
  }))

  // ---- painel ----
  router.get('/dou/painel', requireRole(...COLETADOR_COORD), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    res.json(await painelDou(getTenantId(req)))
  }))
}

async function reclassificar(tenantId: string, rows: any[]): Promise<number> {
  const palavras = await palavrasAtivas(tenantId)
  let n = 0
  for (const r of rows) {
    const c = classificarItem({ dataPublicacao: r.dataPublicacao, secao: r.secao, pagina: r.pagina, orgaoRaw: r.orgaoRaw, tipoRaw: r.tipoAto, numero: r.numero, titulo: r.titulo, ementa: r.ementa, texto: r.texto, idExterno: null }, palavras)
    const row = await prisma.reiDouPublicacao.update({ where: { id: r.id }, data: { relevancia: c.relevancia as any, score: c.score, tema: c.tema, palavrasEncontradas: c.palavrasEncontradas, prazoAcaoEm: r.prazoAcaoEm ?? c.prazoAcaoEm } })
    await lembrete(tenantId, row as any)
    n++
  }
  return n
}

export async function coletarFonte(tenantId: string, fonteId: string, userId?: string) {
  const f = await prisma.reiDouFonte.findFirst({ where: { id: fonteId, tenantId } })
  if (!f) fail(404, 'Fonte não encontrada.')
  if (f!.tipo === 'MANUAL' || !f!.url) fail(400, 'Fonte manual não coleta sozinha: use a importação por colagem.')
  const prov = PROVEDORES[f!.tipo]
  if (!prov) fail(400, 'Tipo de fonte desconhecido.')
  try {
    const itens = await prov.coletar({ url: f!.url! }, fetcherTeste)
    return await ingerirDou(tenantId, itens, { modo: 'URL', fonte: prov.modo, fonteId: f!.id, userId })
  } catch (e: any) {
    await prisma.reiDouFonte.update({ where: { id: f!.id }, data: { ultimaColetaEm: new Date(), ultimaColetaStatus: `ERRO: ${String(e?.message || e).slice(0, 200)}` } })
    await prisma.reiDouColeta.create({ data: { tenantId, fonteId: f!.id, modo: 'URL', erro: String(e?.message || e).slice(0, 500), userId } })
    throw e
  }
}

export async function painelDou(tenantId: string, now = new Date()) {
  const abertas = { in: ['NOVA', 'EM_ANALISE', 'EM_TRATAMENTO'] as any }
  const [porStatus, porRelevancia, porTema, atrasadas, vencendo7, semResp, ultimas, coletas, palavras] = await Promise.all([
    prisma.reiDouPublicacao.groupBy({ by: ['status'], where: { tenantId }, _count: { _all: true } }),
    prisma.reiDouPublicacao.groupBy({ by: ['relevancia'], where: { tenantId, status: abertas }, _count: { _all: true } }),
    prisma.reiDouPublicacao.groupBy({ by: ['tema'], where: { tenantId }, _count: { _all: true } }),
    prisma.reiDouPublicacao.count({ where: { tenantId, status: abertas, prazoAcaoEm: { lt: now } } }),
    prisma.reiDouPublicacao.count({ where: { tenantId, status: abertas, prazoAcaoEm: { gte: now, lte: new Date(now.getTime() + 7 * DAY) } } }),
    prisma.reiDouPublicacao.count({ where: { tenantId, status: abertas, relevancia: { in: ['ALTA', 'MEDIA'] }, responsavelUserId: null } }),
    prisma.reiDouPublicacao.findMany({ where: { tenantId, status: abertas, relevancia: { in: ['ALTA', 'MEDIA'] } }, orderBy: [{ relevancia: 'asc' }, { dataPublicacao: 'desc' }], take: 10, select: { id: true, titulo: true, relevancia: true, tema: true, prazoAcaoEm: true, status: true, dataPublicacao: true, responsavelNome: true } }),
    prisma.reiDouColeta.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 5 }),
    prisma.reiDouPalavra.count({ where: { tenantId, ativo: true } }),
  ])
  const m = (rows: any[], k: string) => Object.fromEntries(rows.map((r) => [r[k], r._count._all]))
  return {
    porStatus: m(porStatus, 'status'), abertasPorRelevancia: m(porRelevancia, 'relevancia'), porTema: m(porTema, 'tema'),
    atrasadas, vencendoEm7Dias: vencendo7, semResponsavel: semResp, palavrasAtivas: palavras, ultimasRelevantes: ultimas, ultimasColetas: coletas,
    semPalavras: palavras === 0 ? 'Cadastre as palavras-chave da instituição (ou use "Sugerir a partir do cadastro") para classificar as publicações.' : null,
  }
}

/** Job: coleta as fontes ativas com URL (falhas isoladas por fonte). */
export async function jobDouColeta() {
  let fontes = 0, novas = 0, erros = 0
  const fs = await prisma.reiDouFonte.findMany({ where: { ativo: true, url: { not: null }, tipo: { in: ['INLABS_XML', 'RSS'] } }, take: 200 })
  for (const f of fs) {
    try { const r = await coletarFonte(f.tenantId, f.id); fontes++; novas += r.novas } catch { erros++ }
  }
  return { fontes, novas, erros }
}

void normalizar
