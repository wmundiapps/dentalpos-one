// Etiquetas patrimoniais: layouts configuráveis, geração em lote (PDF/SVG/HTML) com QR Code e Code 128 reais,
// e interpretação da leitura (QR/código de barras) usada pelo inventário.
import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { mountCrud, parseBody, qs } from '../core/crud'
import { audit } from '../core/notify'
import { getBranding } from '../core/branding'
import { GESTAO, LEITURA, MODULO, fail } from './util'
import { CAMPOS_ETIQUETA, LAYOUTS_PADRAO, planejarPaginas, renderHtml, renderPdf, renderSvgPagina, validarLayout, type DadosEtiqueta, type LayoutEtiqueta } from './etiquetas/render'

const MAX_ETIQUETAS = 2000

/** Conteúdo gravado no QR Code da etiqueta. Curto de propósito (QR pequeno lê melhor em etiquetas pequenas). */
export const qrDoBem = (tombamento: string) => `EDU:BEM:${tombamento}`

/** Entende o que o leitor devolveu: QR novo (EDU:BEM:x), QR antigo (JSON), URL com tombamento ou o código de barras cru. */
export function interpretarLeitura(texto: string): { tombamento: string | null; formato: 'EDU' | 'JSON' | 'URL' | 'CODIGO' | 'INVALIDO' } {
  const t = String(texto ?? '').trim()
  if (!t || t.length > 300) return { tombamento: null, formato: 'INVALIDO' }
  const m = /^EDU:BEM:(.{1,60})$/i.exec(t)
  if (m) return { tombamento: m[1].trim(), formato: 'EDU' }
  if (t.startsWith('{')) {
    try {
      const j = JSON.parse(t)
      const tomb = j?.tomb ?? j?.tombamento
      if (typeof tomb === 'string' && tomb.trim()) return { tombamento: tomb.trim(), formato: 'JSON' }
    } catch { /* cai para inválido */ }
    return { tombamento: null, formato: 'INVALIDO' }
  }
  if (/^https?:\/\//i.test(t)) {
    try {
      const u = new URL(t)
      const q = u.searchParams.get('tomb') ?? u.searchParams.get('tombamento')
      const seg = /\/bens-por-tombamento\/([^/?#]+)/.exec(u.pathname)?.[1]
      const v = q ?? (seg ? decodeURIComponent(seg) : null)
      if (v && /^[\w.\-/]{1,60}$/.test(v)) return { tombamento: v, formato: 'URL' }
    } catch { /* inválido */ }
    return { tombamento: null, formato: 'INVALIDO' }
  }
  if (/^[\w.\-/]{1,60}$/.test(t)) return { tombamento: t, formato: 'CODIGO' }
  return { tombamento: null, formato: 'INVALIDO' }
}

const layoutBase = z.object({
  nome: z.string().min(2).max(80), formato: z.enum(['A4_COLUNAS', 'ROLO']).default('A4_COLUNAS'),
  larguraMm: z.coerce.number().min(20).max(210), alturaMm: z.coerce.number().min(15).max(297),
  colunas: z.coerce.number().int().min(1).max(8).default(1), linhas: z.coerce.number().int().min(1).max(20).default(1),
  margemSupMm: z.coerce.number().min(0).max(50).default(0), margemEsqMm: z.coerce.number().min(0).max(50).default(0),
  gapXMm: z.coerce.number().min(0).max(20).default(0), gapYMm: z.coerce.number().min(0).max(20).default(0),
  campos: z.array(z.enum(CAMPOS_ETIQUETA)).default(['codigo', 'nome', 'departamento']), mostrarQr: z.boolean().default(true), mostrarBarras: z.boolean().default(true),
  qrPosicao: z.enum(['ESQUERDA', 'DIREITA']).default('ESQUERDA'), fonteBasePt: z.coerce.number().min(4).max(16).default(7), borda: z.boolean().default(true),
  padrao: z.boolean().optional(), ativo: z.boolean().optional(),
})

function assegurarLayoutValido(l: any) {
  const erro = validarLayout(l as LayoutEtiqueta)
  if (erro) fail(400, erro)
}

export function nomeLocal(s?: { nome: string; bloco?: string | null; andar?: string | null; codigo?: string | null } | null): string | null {
  if (!s) return null
  return [s.bloco ? `Bloco ${s.bloco}` : null, s.andar ? `${s.andar}º andar` : null, s.nome].filter(Boolean).join(' / ')
}

export async function nomesDeUsuarios(tenantId: string, ids: string[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter(Boolean))]
  if (!uniq.length) return new Map()
  const us = await prisma.user.findMany({ where: { id: { in: uniq }, tenantId }, select: { id: true, firstName: true, lastName: true } })
  return new Map(us.map((u) => [u.id, `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.id]))
}

/** Dados de impressão de cada bem (nome, departamento, local, responsável). */
export async function dadosDasEtiquetas(tenantId: string, bens: any[]): Promise<DadosEtiqueta[]> {
  const [spaces, deps, users, b] = await Promise.all([
    prisma.eduSpace.findMany({ where: { tenantId, id: { in: [...new Set(bens.map((x) => x.spaceId).filter(Boolean))] } } }),
    prisma.cppDepartamento.findMany({ where: { tenantId, id: { in: [...new Set(bens.map((x) => x.departamentoId).filter(Boolean))] } } }),
    nomesDeUsuarios(tenantId, bens.map((x) => x.responsavelUserId)),
    getBranding(tenantId),
  ])
  return bens.map((x) => ({
    codigo: x.tombamento, nome: x.descricao, departamento: deps.find((d) => d.id === x.departamentoId)?.nome ?? null,
    local: nomeLocal(spaces.find((s) => s.id === x.spaceId)), responsavel: x.responsavelUserId ? users.get(x.responsavelUserId) ?? null : null,
    categoria: x.categoria?.nome ?? null, instituicao: b.sigla || b.nome, qr: qrDoBem(x.tombamento),
  }))
}

async function resolverLayout(tenantId: string, layoutId?: string, inline?: any): Promise<LayoutEtiqueta & { nome?: string }> {
  if (inline) { const l = layoutBase.parse(inline); assegurarLayoutValido(l); return l as any }
  if (layoutId?.startsWith('preset:')) {
    const p = LAYOUTS_PADRAO[Number(layoutId.slice(7))]
    if (!p) fail(404, 'Layout predefinido não encontrado.')
    return p
  }
  if (layoutId) {
    const l = await prisma.cppEtiquetaLayout.findFirst({ where: { id: layoutId, tenantId, ativo: true } })
    if (!l) fail(404, 'Layout não encontrado.')
    return l as any
  }
  const pad = await prisma.cppEtiquetaLayout.findFirst({ where: { tenantId, padrao: true, ativo: true } })
  return (pad as any) ?? LAYOUTS_PADRAO[0]
}

export function mountEtiquetas(router: Router) {
  // Lista: layouts salvos + predefinidos (ainda não salvos).
  router.get('/etiquetas/layouts', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const salvos = await prisma.cppEtiquetaLayout.findMany({ where: { tenantId, ...(qs(req.query.ativo) ? { ativo: qs(req.query.ativo) === 'true' } : {}) }, orderBy: { nome: 'asc' } })
    const nomes = new Set(salvos.map((s) => s.nome))
    const predefinidos = LAYOUTS_PADRAO.map((p, i) => ({ ...p, id: `preset:${i}`, predefinido: true })).filter((p) => !nomes.has(p.nome))
    res.json({ items: [...salvos.map((s) => ({ ...s, predefinido: false })), ...predefinidos], total: salvos.length + predefinidos.length, campos: CAMPOS_ETIQUETA })
  }))

  mountCrud(router, {
    model: 'cppEtiquetaLayout', path: '/etiquetas/layouts', read: LEITURA as any, write: GESTAO, modulo: MODULO, removeMode: 'soft',
    create: layoutBase, search: ['nome'], filters: ['formato', 'ativo'], orderBy: { nome: 'asc' },
    beforeCreate: (data) => { assegurarLayoutValido(data); return data },
    beforeUpdate: (data, _req, current) => { assegurarLayoutValido({ ...current, ...data }); return data },
    afterCreate: async (row) => { if (row.padrao) await prisma.cppEtiquetaLayout.updateMany({ where: { tenantId: row.tenantId, id: { not: row.id } }, data: { padrao: false } }) },
    afterUpdate: async (row) => { if (row.padrao) await prisma.cppEtiquetaLayout.updateMany({ where: { tenantId: row.tenantId, id: { not: row.id } }, data: { padrao: false } }) },
  })

  router.post('/etiquetas/layouts-predefinidos/instalar', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    let criados = 0
    for (const p of LAYOUTS_PADRAO) {
      const ex = await prisma.cppEtiquetaLayout.findFirst({ where: { tenantId, nome: p.nome } })
      if (ex) continue
      const { padrao, ...rest } = p as any
      await prisma.cppEtiquetaLayout.create({ data: { ...rest, tenantId, padrao: !!padrao && !(await prisma.cppEtiquetaLayout.findFirst({ where: { tenantId, padrao: true } })) } })
      criados++
    }
    res.json({ criados })
  }))

  const gerarSchema = z.object({
    layoutId: z.string().optional(), layout: z.any().optional(), formato: z.enum(['pdf', 'svg', 'html', 'json']).default('pdf'),
    ids: z.array(z.string()).max(MAX_ETIQUETAS).optional(), spaceId: z.string().optional(), categoriaId: z.string().optional(), departamentoId: z.string().optional(), responsavelUserId: z.string().optional(),
    copias: z.coerce.number().int().min(1).max(20).default(1), pularPosicoes: z.coerce.number().int().min(0).max(200).default(0), pagina: z.coerce.number().int().min(1).default(1),
    incluirBaixados: z.boolean().default(false),
  })

  router.post('/etiquetas/gerar', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d = parseBody(gerarSchema, req.body ?? {})
    if (!d.ids?.length && !d.spaceId && !d.categoriaId && !d.departamentoId && !d.responsavelUserId) fail(400, 'Informe ids, spaceId, categoriaId, departamentoId ou responsavelUserId.')
    const layout = await resolverLayout(tenantId, d.layoutId, d.layout)
    const bens = await prisma.infBem.findMany({
      where: { tenantId, ...(d.incluirBaixados ? {} : { status: { not: 'BAIXADO' } }), ...(d.ids?.length ? { id: { in: d.ids } } : {}), ...(d.spaceId ? { spaceId: d.spaceId } : {}), ...(d.categoriaId ? { categoriaId: d.categoriaId } : {}), ...(d.departamentoId ? { departamentoId: d.departamentoId } : {}), ...(d.responsavelUserId ? { responsavelUserId: d.responsavelUserId } : {}) },
      include: { categoria: true }, take: MAX_ETIQUETAS, orderBy: { tombamento: 'asc' },
    })
    if (!bens.length) fail(404, 'Nenhum bem encontrado para a seleção.')
    const dados = await dadosDasEtiquetas(tenantId, bens)
    const paginas = planejarPaginas(layout, dados, { copias: d.copias, pularPosicoes: d.pularPosicoes })
    await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'ETIQUETAS_EMITIDAS', refType: 'InfBem', detalhes: { bens: bens.length, copias: d.copias, formato: d.formato, layout: layout.nome ?? 'inline' } })
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Total-Paginas', String(paginas.length))
    res.setHeader('X-Total-Etiquetas', String(dados.length * d.copias))
    if (d.formato === 'json') return res.json({ layout, total: dados.length, copias: d.copias, paginas: paginas.length, etiquetas: dados })
    if (d.formato === 'svg') {
      const pg = paginas[Math.min(d.pagina, paginas.length) - 1]
      return res.type('image/svg+xml').send(renderSvgPagina(layout, pg))
    }
    if (d.formato === 'html') return res.type('html').send(renderHtml(layout, paginas))
    res.setHeader('Content-Disposition', 'inline; filename="etiquetas-patrimonio.pdf"')
    res.type('application/pdf').send(renderPdf(layout, paginas))
  }))

  // Etiqueta única em SVG (impressão rápida a partir da ficha do bem).
  router.get('/bens/:id/etiqueta-svg', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const bem = await prisma.infBem.findFirst({ where: { id: String(req.params.id), tenantId }, include: { categoria: true } })
    if (!bem) return res.status(404).json({ error: 'Bem não encontrado.' })
    const layout = await resolverLayout(tenantId, qs(req.query.layoutId))
    const [dados] = await dadosDasEtiquetas(tenantId, [bem])
    const unico = { ...layout, formato: 'ROLO' as const, colunas: 1, linhas: 1, margemSupMm: 0, margemEsqMm: 0 }
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.type('image/svg+xml').send(renderSvgPagina(unico, planejarPaginas(unico, [dados])[0]))
  }))

  // Traduz o texto lido (QR/código de barras) para o bem correspondente.
  router.post('/leitura/interpretar', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d = parseBody(z.object({ payload: z.string().min(1).max(400) }), req.body)
    const r = interpretarLeitura(d.payload)
    const bem = r.tombamento ? await prisma.infBem.findFirst({ where: { tenantId, tombamento: r.tombamento }, include: { categoria: true } }) : null
    res.json({ ...r, encontrado: !!bem, bem: bem ? { id: bem.id, tombamento: bem.tombamento, descricao: bem.descricao, status: bem.status, estado: bem.estado, spaceId: bem.spaceId, departamentoId: bem.departamentoId, responsavelUserId: bem.responsavelUserId, categoria: bem.categoria?.nome } : null })
  }))
}
