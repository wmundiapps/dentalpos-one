import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { parseBody, qs } from '../core/crud'
import { audit } from '../core/notify'
import { INDICADORES, Indicador, SENTIDO, UNIDADE, interpretarCsvIes, ranquear } from './csvIes'
import { cnpjValido, enviarCsv, fail, media, normalizar, round2, soDigitos, toCsv } from './util2'

// Comparativo com outras IES (concorrentes / referência): cadastro, indicadores comparáveis
// (CPC/CC/IGC/ENADE, mensalidade, cursos, alunos...), importação CSV (microdados públicos do INEP),
// ranking e evolução. A própria instituição (tipo PROPRIA) é completada com dados internos quando faltam.

const TIPOS = ['PROPRIA', 'CONCORRENTE', 'REFERENCIA'] as const
const indicadorZ = z.enum(INDICADORES)

const schemaIes = z.object({
  tipo: z.enum(TIPOS).default('CONCORRENTE'),
  nome: z.string().trim().min(2).max(300),
  sigla: z.string().trim().max(40).optional(),
  cnpj: z.string().max(30).optional(),
  codigoEmec: z.string().trim().max(20).optional(),
  uf: z.string().trim().length(2).optional(),
  municipio: z.string().max(120).optional(),
  categoria: z.string().max(80).optional(),
  organizacao: z.string().max(80).optional(),
  site: z.string().max(300).optional(),
  ativo: z.boolean().optional(),
  observacoes: z.string().max(3000).optional(),
})

function normalizarIes<T extends { cnpj?: string; codigoEmec?: string; uf?: string }>(d: T): T {
  const out: any = { ...d }
  if (d.cnpj !== undefined) {
    const dig = soDigitos(d.cnpj)
    if (dig && !cnpjValido(dig)) fail(400, 'CNPJ inválido (dígitos verificadores não conferem).')
    out.cnpj = dig || undefined
  }
  if (d.codigoEmec !== undefined) out.codigoEmec = soDigitos(d.codigoEmec) || undefined
  if (d.uf) out.uf = d.uf.toUpperCase()
  return out
}

async function garantirUnicaPropria(tenantId: string, tipo: string | undefined, exceto?: string) {
  if (tipo === 'PROPRIA' && (await prisma.reiIes.findFirst({ where: { tenantId, tipo: 'PROPRIA', ...(exceto ? { id: { not: exceto } } : {}) }, select: { id: true } }))) fail(409, 'Já existe uma IES do tipo PROPRIA (a própria instituição).')
}

async function conflitoCadastro(tenantId: string, d: { cnpj?: string; codigoEmec?: string }, exceto?: string) {
  if (d.codigoEmec && (await prisma.reiIes.findFirst({ where: { tenantId, codigoEmec: d.codigoEmec, ...(exceto ? { id: { not: exceto } } : {}) }, select: { id: true } }))) fail(409, 'Já existe IES com este código e-MEC.')
  if (d.cnpj && (await prisma.reiIes.findFirst({ where: { tenantId, cnpj: d.cnpj, ...(exceto ? { id: { not: exceto } } : {}) }, select: { id: true } }))) fail(409, 'Já existe IES com este CNPJ.')
}

/** Valores internos da própria instituição que podem completar o comparativo. */
async function indicadoresInternos(tenantId: string): Promise<Partial<Record<Indicador, number>>> {
  const out: Partial<Record<Indicador, number>> = {}
  try {
    out.NUM_CURSOS = await prisma.academicProgram.count({ where: { tenantId } })
    out.NUM_ALUNOS = await prisma.enrollment.count({ where: { status: 'ATIVA', student: { tenantId } } })
    const of = await prisma.admOferta.findMany({ where: { tenantId, ativo: true, valorMensalidade: { gt: 0 } }, select: { valorMensalidade: true }, take: 2000 })
    const m = media(of.map((x) => x.valorMensalidade))
    if (m != null) out.MENSALIDADE = m
  } catch { /* tolerante */ }
  return out
}

export async function painelComparativo(tenantId: string, o: { ano?: number; iesIds?: string[]; curso?: string }) {
  const iesAll = await prisma.reiIes.findMany({ where: { tenantId, ativo: true, ...(o.iesIds?.length ? { OR: [{ id: { in: o.iesIds } }, { tipo: 'PROPRIA' }] } : {}) }, orderBy: { nome: 'asc' }, take: 500 })
  const inds = await prisma.reiIesIndicador.findMany({ where: { tenantId, iesId: { in: iesAll.map((i) => i.id) }, cursoNome: o.curso ?? '', ...(o.ano ? { ano: { lte: o.ano } } : {}) }, take: 100_000 })
  const anos = [...new Set(inds.map((i) => i.ano))].sort((a, b) => b - a)
  const propria = iesAll.find((i) => i.tipo === 'PROPRIA')
  const internos = propria && !o.curso ? await indicadoresInternos(tenantId) : {}
  const linhas: any[] = []
  for (const ind of INDICADORES) {
    // valor mais recente de cada IES (até o ano pedido)
    const por = new Map<string, { ano: number; valor: number; fonte: string }>()
    for (const r of inds.filter((x) => x.indicador === ind).sort((a, b) => a.ano - b.ano)) por.set(r.iesId, { ano: r.ano, valor: r.valor, fonte: r.fonte })
    if (propria && !por.has(propria.id) && internos[ind] != null) por.set(propria.id, { ano: new Date().getFullYear(), valor: internos[ind]!, fonte: 'INTERNO' })
    if (!por.size) continue
    const itens = iesAll.filter((i) => por.has(i.id)).map((i) => ({ iesId: i.id, nome: i.sigla || i.nome, tipo: i.tipo, ...por.get(i.id)! }))
    const sentido = SENTIDO[ind]
    const ranque = ranquear(itens, sentido)
    const concorrentes = itens.filter((i) => i.tipo !== 'PROPRIA')
    const meu = propria ? ranque.find((r) => r.iesId === propria.id) : undefined
    const mediaConc = media(concorrentes.map((c) => c.valor))
    const melhor = ranque[0]
    linhas.push({
      indicador: ind, unidade: UNIDADE[ind], sentido, participantes: itens.length, ranking: ranque,
      posicaoPropria: meu?.posicao ?? null, valorProprio: meu?.valor ?? null, mediaConcorrentes: mediaConc,
      diferencaMedia: meu && mediaConc != null ? round2(meu.valor - mediaConc) : null,
      diferencaMelhor: meu && melhor ? round2(meu.valor - melhor.valor) : null,
      melhor: melhor ? { nome: melhor.nome, valor: melhor.valor } : null,
    })
  }
  return { ano: o.ano ?? anos[0] ?? null, anosDisponiveis: anos, curso: o.curso ?? null, propria: propria ? { id: propria.id, nome: propria.nome } : null, totalIes: iesAll.length, indicadores: linhas, avisos: [...(!propria ? ['Cadastre a própria instituição (tipo PROPRIA) para ver sua posição no ranking.'] : []), ...(!inds.length ? ['Nenhum indicador cadastrado: importe o CSV do INEP ou lance manualmente.'] : [])] }
}

export async function evolucaoComparativo(tenantId: string, indicador: Indicador, iesIds?: string[], curso?: string) {
  const ies = await prisma.reiIes.findMany({ where: { tenantId, ativo: true, ...(iesIds?.length ? { id: { in: iesIds } } : {}) }, take: 200 })
  const rows = await prisma.reiIesIndicador.findMany({ where: { tenantId, indicador, iesId: { in: ies.map((i) => i.id) }, cursoNome: curso ?? '' }, orderBy: { ano: 'asc' }, take: 50_000 })
  const anos = [...new Set(rows.map((r) => r.ano))].sort((a, b) => a - b)
  const series = ies.map((i) => ({ iesId: i.id, nome: i.sigla || i.nome, tipo: i.tipo, pontos: anos.map((a) => ({ ano: a, valor: rows.find((r) => r.iesId === i.id && r.ano === a)?.valor ?? null })) })).filter((s) => s.pontos.some((p) => p.valor != null))
  return { indicador, unidade: UNIDADE[indicador], anos, series }
}

export function registerComparativo(router: Router) {
  // ---- cadastro de IES ----
  router.get('/comparativo/ies', requireRole('COORDINATOR'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const where: any = { tenantId }
    if (qs(req.query.tipo)) { if (!(TIPOS as readonly string[]).includes(qs(req.query.tipo)!)) fail(400, 'Tipo inválido.'); where.tipo = qs(req.query.tipo) }
    if (qs(req.query.uf)) where.uf = qs(req.query.uf)!.toUpperCase()
    if (qs(req.query.q)) where.OR = [{ nome: { contains: qs(req.query.q), mode: 'insensitive' } }, { sigla: { contains: qs(req.query.q), mode: 'insensitive' } }, { codigoEmec: { contains: qs(req.query.q) } }]
    const ordem: Record<string, number> = { PROPRIA: 0, CONCORRENTE: 1, REFERENCIA: 2 }
    const items = (await prisma.reiIes.findMany({ where, orderBy: { nome: 'asc' }, include: { _count: { select: { indicadores: true } } }, take: 1000 })).sort((a, b) => (ordem[a.tipo] ?? 9) - (ordem[b.tipo] ?? 9))
    res.json({ items, total: items.length })
  }))

  router.post('/comparativo/ies', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = normalizarIes(parseBody(schemaIes, req.body))
    await garantirUnicaPropria(tenantId, b.tipo)
    await conflitoCadastro(tenantId, b)
    const row = await prisma.reiIes.create({ data: { ...b, tenantId } })
    await audit({ tenantId, userId: getUserId(req), modulo: 'reitoria', acao: 'IES_CRIAR', refType: 'ReiIes', refId: row.id })
    res.status(201).json(row)
  }))

  const atualizarIes = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const cur = await prisma.reiIes.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!cur) return res.status(404).json({ error: 'IES não encontrada.' })
    const b = normalizarIes(parseBody(schemaIes.partial(), req.body))
    await garantirUnicaPropria(tenantId, b.tipo, cur.id)
    await conflitoCadastro(tenantId, b, cur.id)
    res.json(await prisma.reiIes.update({ where: { id: cur.id }, data: b }))
  })
  router.patch('/comparativo/ies/:id', requireRole(), atualizarIes)
  router.put('/comparativo/ies/:id', requireRole(), atualizarIes)

  router.delete('/comparativo/ies/:id', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const r = await prisma.reiIes.deleteMany({ where: { id: String(req.params.id), tenantId } })
    if (!r.count) return res.status(404).json({ error: 'IES não encontrada.' })
    await audit({ tenantId, userId: getUserId(req), modulo: 'reitoria', acao: 'IES_REMOVER', refType: 'ReiIes', refId: String(req.params.id) })
    res.status(204).end()
  }))

  // Cria a IES "própria" a partir do cadastro institucional.
  router.post('/comparativo/ies/propria', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const ja = await prisma.reiIes.findFirst({ where: { tenantId, tipo: 'PROPRIA' } })
    if (ja) return res.json({ ...ja, criada: false })
    const inst = await prisma.eduInstitution.findFirst({ where: { tenantId } })
    if (!inst) fail(404, 'Cadastre a instituição (Identidade) antes.')
    const cnpj = inst!.cnpj && cnpjValido(inst!.cnpj) ? soDigitos(inst!.cnpj) : undefined
    const emec = inst!.codigoEmec ? soDigitos(inst!.codigoEmec) || undefined : undefined
    const row = await prisma.reiIes.create({ data: { tenantId, tipo: 'PROPRIA', nome: inst!.nome, sigla: inst!.sigla ?? undefined, cnpj, codigoEmec: emec, uf: inst!.uf ?? undefined, municipio: inst!.cidade ?? undefined, categoria: inst!.categoria ?? undefined, organizacao: inst!.organizacao ?? undefined, site: inst!.site ?? undefined } })
    res.status(201).json({ ...row, criada: true })
  }))

  // ---- indicadores ----
  router.get('/comparativo/indicadores', requireRole('COORDINATOR'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const where: any = { tenantId }
    if (qs(req.query.iesId)) where.iesId = qs(req.query.iesId)
    if (qs(req.query.indicador)) { if (!(INDICADORES as readonly string[]).includes(qs(req.query.indicador)!)) fail(400, 'Indicador inválido.'); where.indicador = qs(req.query.indicador) }
    if (qs(req.query.ano)) where.ano = parseInt(qs(req.query.ano)!, 10) || 0
    const items = await prisma.reiIesIndicador.findMany({ where, include: { ies: { select: { nome: true, sigla: true, tipo: true } } }, orderBy: [{ ano: 'desc' }, { indicador: 'asc' }], take: 2000 })
    res.json({ items, total: items.length })
  }))

  router.put('/comparativo/indicadores', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(z.object({ iesId: z.string(), ano: z.number().int().min(1990).max(2100), indicador: indicadorZ, valor: z.number().min(0).max(1e9), cursoNome: z.string().max(200).default('') }), req.body)
    if (!(await prisma.reiIes.findFirst({ where: { id: b.iesId, tenantId }, select: { id: true } }))) fail(404, 'IES não encontrada.')
    if (['CPC', 'CC', 'IGC', 'ENADE', 'IDD'].includes(b.indicador) && b.valor > 5) fail(400, `${b.indicador}: valor máximo 5 (use a escala contínua 0 a 5).`)
    if (b.indicador === 'PCT_DOUTORES' && b.valor > 100) fail(400, 'PCT_DOUTORES: máximo 100.')
    const where = { iesId_ano_indicador_cursoNome: { iesId: b.iesId, ano: b.ano, indicador: b.indicador, cursoNome: b.cursoNome } }
    const row = await prisma.reiIesIndicador.upsert({ where, create: { tenantId, ...b, fonte: 'MANUAL' }, update: { valor: b.valor, fonte: 'MANUAL' } })
    res.json(row)
  }))

  router.delete('/comparativo/indicadores/:id', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const r = await prisma.reiIesIndicador.deleteMany({ where: { id: String(req.params.id), tenantId: getTenantId(req) } })
    if (!r.count) return res.status(404).json({ error: 'Indicador não encontrado.' })
    res.status(204).end()
  }))

  // ---- importação CSV (microdados públicos do INEP) ----
  router.post('/comparativo/importar-csv', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(z.object({ conteudo: z.string().min(10).max(20_000_000), delimitador: z.string().max(1).optional(), anoPadrao: z.number().int().min(1990).max(2100).optional(), criarIes: z.boolean().default(true), tipoNovas: z.enum(TIPOS).default('CONCORRENTE'), dryRun: z.boolean().default(false), fonte: z.string().max(30).default('INEP_CSV') }), req.body)
    const r = interpretarCsvIes(b.conteudo, { anoPadrao: b.anoPadrao, delimitador: b.delimitador })
    if (!r.linhas.length) return res.status(422).json({ error: 'Nenhuma linha válida no CSV.', formato: r.formato, cabecalhos: r.cabecalhos, ignoradas: r.ignoradas.slice(0, 50) })
    const existentes = await prisma.reiIes.findMany({ where: { tenantId }, take: 5000 })
    const porEmec = new Map(existentes.filter((i) => i.codigoEmec).map((i) => [i.codigoEmec!, i]))
    const porCnpj = new Map(existentes.filter((i) => i.cnpj).map((i) => [i.cnpj!, i]))
    const porNome = new Map(existentes.map((i) => [normalizar(i.nome), i]))
    let iesCriadas = 0, importados = 0, atualizados = 0
    const semIes: Array<{ linha: number; motivo: string }> = []
    const cache = new Map<string, string>()
    for (const l of r.linhas) {
      let ies = (l.codigo && porEmec.get(l.codigo)) || (l.cnpj && porCnpj.get(l.cnpj)) || (l.nome && porNome.get(normalizar(l.nome))) || null
      const k = l.codigo || l.cnpj || normalizar(l.nome ?? '')
      let iesId = ies?.id ?? cache.get(k)
      if (!iesId) {
        if (!b.criarIes || !l.nome) { semIes.push({ linha: l.linha, motivo: 'IES não cadastrada e criação automática desativada (ou sem nome).' }); continue }
        if (b.dryRun) { iesCriadas++; cache.set(k, `dry:${k}`); continue }
        const cnpj = l.cnpj && cnpjValido(l.cnpj) ? l.cnpj : undefined
        const novo = await prisma.reiIes.create({ data: { tenantId, tipo: b.tipoNovas === 'PROPRIA' ? 'CONCORRENTE' : b.tipoNovas, nome: l.nome, sigla: l.sigla, cnpj: cnpj && !porCnpj.has(cnpj) ? cnpj : undefined, codigoEmec: l.codigo && !porEmec.has(l.codigo) ? l.codigo : undefined, uf: l.uf, municipio: l.municipio, categoria: l.categoria, organizacao: l.organizacao } })
        iesCriadas++; iesId = novo.id; cache.set(k, iesId)
        if (novo.codigoEmec) porEmec.set(novo.codigoEmec, novo)
        if (novo.cnpj) porCnpj.set(novo.cnpj, novo)
        porNome.set(normalizar(novo.nome), novo)
      }
      if (b.dryRun) { importados += l.medidas.length; continue }
      for (const m of l.medidas) {
        const where = { iesId_ano_indicador_cursoNome: { iesId, ano: l.ano!, indicador: m.indicador, cursoNome: l.curso } }
        const ex = await prisma.reiIesIndicador.findUnique({ where })
        await prisma.reiIesIndicador.upsert({ where, create: { tenantId, iesId, ano: l.ano!, indicador: m.indicador, cursoNome: l.curso, valor: m.valor, fonte: b.fonte }, update: { valor: m.valor, fonte: b.fonte } })
        if (ex) atualizados++; else importados++
      }
    }
    if (!b.dryRun) await audit({ tenantId, userId: getUserId(req), modulo: 'reitoria', acao: 'COMPARATIVO_IMPORTAR', refType: 'ReiIesIndicador', detalhes: { linhas: r.linhas.length, importados, atualizados, iesCriadas } })
    res.status(b.dryRun ? 200 : 201).json({ dryRun: b.dryRun, formato: r.formato, delimitador: r.delimitador, linhasLidas: r.linhas.length, importados, atualizados, iesCriadas, ignoradas: [...r.ignoradas, ...semIes].slice(0, 100), totalIgnoradas: r.ignoradas.length + semIes.length })
  }))

  // ---- painéis ----
  router.get('/comparativo/painel', requireRole('COORDINATOR'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const ano = qs(req.query.ano) ? parseInt(qs(req.query.ano)!, 10) : undefined
    if (qs(req.query.ano) && (!ano || ano < 1990)) fail(400, 'Ano inválido.')
    const iesIds = qs(req.query.iesIds)?.split(',').filter(Boolean)
    const p = await painelComparativo(getTenantId(req), { ano, iesIds, curso: qs(req.query.curso) })
    if (qs(req.query.formato) === 'csv') {
      const linhas = p.indicadores.flatMap((i: any) => i.ranking.map((r: any) => ({ indicador: i.indicador, posicao: r.posicao, ies: r.nome, tipo: r.tipo, ano: r.ano, valor: r.valor, fonte: r.fonte })))
      return enviarCsv(res, 'comparativo-ies', toCsv([{ key: 'indicador', label: 'Indicador' }, { key: 'posicao', label: 'Posição' }, { key: 'ies', label: 'IES' }, { key: 'tipo', label: 'Tipo' }, { key: 'ano', label: 'Ano' }, { key: 'valor', label: 'Valor' }, { key: 'fonte', label: 'Fonte' }], linhas))
    }
    res.json(p)
  }))

  router.get('/comparativo/evolucao', requireRole('COORDINATOR'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const ind = indicadorZ.safeParse(qs(req.query.indicador) ?? 'CPC')
    if (!ind.success) fail(400, `Indicador inválido. Use: ${INDICADORES.join(', ')}.`)
    res.json(await evolucaoComparativo(getTenantId(req), ind.data!, qs(req.query.iesIds)?.split(',').filter(Boolean), qs(req.query.curso)))
  }))
}
