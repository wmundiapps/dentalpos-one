import { Router, Response } from 'express'
import { z } from 'zod'
import { AuthenticatedRequest, asyncHandler, requireRole } from '../academico/middleware'
import { pageParams, parseBody, qs } from '../core/crud'
import { audit } from '../core/notify'
import { GESTAO, LEITURA, OFFLINE_TIPOS, db, dt, dtReq, fail, historico, marca, money, optStr, publicApi, publicBase, tid, token, uid } from './common'
import { gerarPecas } from './ia'
import { FORMATOS, gerarSvg } from './logic'
import { recalcRealizado } from './rotas-campanhas'

const SUPER = ['ADMIN', 'OWNER', 'RECTOR', 'BOARD']
const ehSuper = (req: AuthenticatedRequest) => SUPER.includes(String(req.user?.role || '').toUpperCase())
export const urlQr = (tok: string) => `${publicApi()}/public/edu/marketing/r/${tok}`

async function resumoMidia(tenantId: string, m: any) {
  const [leads, mat, ins] = await Promise.all([db.mktLead.count({ where: { tenantId, midiaOfflineId: m.id } }), db.mktLead.count({ where: { tenantId, midiaOfflineId: m.id, etapa: 'MATRICULADO' } }), db.mktMidiaInsercao.aggregate({ where: { tenantId, midiaId: m.id }, _sum: { quantidade: true, custo: true } })])
  const custo = m.custoTotal
  return { ...m, urlQr: urlQr(m.qrToken), leads, matriculados: mat, insercoes: ins._sum.quantidade ?? 0, custoPorLead: leads ? Math.round((custo / leads) * 100) / 100 : null }
}

export function registerMidiaIa(r: Router) {
  // ---------------------------------------------------------------- mídia offline
  const midiaSchema = z.object({ campanhaId: optStr(80), tipo: z.enum(OFFLINE_TIPOS), veiculo: z.string().min(2).max(150), praca: optStr(100), descricao: optStr(500), inicio: dtReq(), fim: dt(), cupom: optStr(40), telefoneExclusivo: optStr(30), urlDestino: optStr(300), status: z.enum(['PLANEJADA', 'EM_VEICULACAO', 'ENCERRADA', 'CANCELADA']).default('PLANEJADA') })
  r.get('/midia-offline', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const where: any = { tenantId }
    for (const k of ['tipo', 'status', 'campanhaId']) { const v = qs((req.query as any)[k]); if (v) where[k] = v }
    const rows = await db.mktMidiaOffline.findMany({ where, orderBy: { inicio: 'desc' }, take: 200 })
    res.json({ items: await Promise.all(rows.map((m: any) => resumoMidia(tenantId, m))), total: rows.length })
  }))
  r.get('/midia-offline/:id', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const m = await db.mktMidiaOffline.findFirst({ where: { id: String(req.params.id), tenantId } }); if (!m) fail(404, 'Mídia não encontrada.')
    res.json({ ...(await resumoMidia(tenantId, m)), insercoesLista: await db.mktMidiaInsercao.findMany({ where: { tenantId, midiaId: m.id }, orderBy: { data: 'desc' }, take: 200 }) })
  }))
  const validaUnicos = async (tenantId: string, b: any, exceto?: string) => {
    if (b.cupom) { const x = await db.mktMidiaOffline.findFirst({ where: { tenantId, cupom: { equals: b.cupom.trim(), mode: 'insensitive' }, ...(exceto ? { id: { not: exceto } } : {}) } }); if (x) fail(409, 'Este cupom já está em uso em outra mídia.') }
    if (b.campanhaId && !(await db.mktCampanha.findFirst({ where: { id: b.campanhaId, tenantId }, select: { id: true } }))) fail(404, 'Campanha não encontrada.')
    if (b.fim && b.inicio && b.fim < b.inicio) fail(400, 'O fim da veiculação é anterior ao início.')
  }
  r.post('/midia-offline', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const b = parseBody(midiaSchema, req.body); await validaUnicos(tenantId, b)
    if (b.urlDestino && !/^(https?:\/\/|\/)/i.test(b.urlDestino)) fail(400, 'URL de destino inválida.')
    const m = await db.mktMidiaOffline.create({ data: { ...b, cupom: b.cupom?.trim() || undefined, tenantId, qrToken: token(8) } as any })
    await audit({ tenantId, userId: uid(req), modulo: 'marketing', acao: 'CRIAR', refType: 'MktMidiaOffline', refId: m.id }); res.status(201).json(await resumoMidia(tenantId, m))
  }))
  r.patch('/midia-offline/:id', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const cur = await db.mktMidiaOffline.findFirst({ where: { id: String(req.params.id), tenantId } }); if (!cur) fail(404, 'Mídia não encontrada.')
    const b = parseBody(midiaSchema.partial(), req.body); await validaUnicos(tenantId, b, cur.id)
    const up = await db.mktMidiaOffline.update({ where: { id: cur.id }, data: b as any }); if (cur.campanhaId) await recalcRealizado(tenantId, cur.campanhaId); res.json(await resumoMidia(tenantId, up))
  }))
  r.post('/midia-offline/:id/insercoes', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const m = await db.mktMidiaOffline.findFirst({ where: { id: String(req.params.id), tenantId } }); if (!m) fail(404, 'Mídia não encontrada.')
    if (['ENCERRADA', 'CANCELADA'].includes(m.status)) fail(409, 'Mídia encerrada não aceita novas inserções.')
    const b = parseBody(z.object({ data: dtReq(), quantidade: z.number().int().min(1).max(100000).default(1), custo: money().default(0), horario: optStr(20), observacao: optStr(300) }), req.body)
    const i = await db.mktMidiaInsercao.create({ data: { ...b, tenantId, midiaId: m.id } })
    await db.mktMidiaOffline.update({ where: { id: m.id }, data: { custoTotal: { increment: b.custo }, status: m.status === 'PLANEJADA' ? 'EM_VEICULACAO' : m.status } })
    if (m.campanhaId) await recalcRealizado(tenantId, m.campanhaId)
    res.status(201).json(i)
  }))
  r.get('/midia-offline-relatorio', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const rows = await db.mktMidiaOffline.findMany({ where: { tenantId }, take: 500 })
    const por: Record<string, any> = {}
    for (const m of rows) { const s = await resumoMidia(tenantId, m); const k = m.tipo; por[k] ??= { tipo: k, midias: 0, insercoes: 0, custo: 0, leads: 0, matriculados: 0, scans: 0 }; por[k].midias++; por[k].insercoes += s.insercoes; por[k].custo += m.custoTotal; por[k].leads += s.leads; por[k].matriculados += s.matriculados; por[k].scans += m.scans }
    res.json(Object.values(por).map((x: any) => ({ ...x, custoPorLead: x.leads ? Math.round((x.custo / x.leads) * 100) / 100 : null })))
  }))

  // ---------------------------------------------------------------- marca
  r.get('/marca', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => res.json(await marca(tid(req)))))
  r.put('/marca', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const cor = z.string().regex(/^#[0-9a-fA-F]{6}$/).nullish()
    const b = parseBody(z.object({ nome: optStr(100), corPrimaria: cor, corSecundaria: cor, corDestaque: cor, tomDeVoz: optStr(200), slogan: optStr(150), assinatura: optStr(300) }), req.body)
    const tenantId = tid(req); await db.mktMarca.upsert({ where: { tenantId }, create: { ...b, tenantId } as any, update: b as any }); res.json(await marca(tenantId))
  }))

  // ---------------------------------------------------------------- gerador IA e biblioteca de ativos
  r.post('/ia/gerar', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ briefing: z.string().min(10).max(4000), curso: optStr(150), publico: optStr(150), tom: optStr(100), canal: optStr(40), objetivo: optStr(300), cta: optStr(80), variacoes: z.number().int().min(1).max(5).default(3), formatos: z.array(z.string()).max(3).optional(), campanhaId: optStr(80), salvar: z.boolean().default(true) }), req.body)
    if (b.campanhaId && !(await db.mktCampanha.findFirst({ where: { id: b.campanhaId, tenantId }, select: { id: true } }))) fail(404, 'Campanha não encontrada.')
    const out = await gerarPecas({ tenantId, clinicId: (req.user as any)?.clinicId, userId: uid(req), briefing: b.briefing, curso: b.curso ?? undefined, publico: b.publico ?? undefined, tom: b.tom ?? undefined, canal: b.canal ?? undefined, objetivo: b.objetivo ?? undefined, cta: b.cta ?? undefined, variacoes: b.variacoes, formatos: b.formatos })
    let pecas: any[] = []
    if (b.salvar) {
      const grupo = token(4); const base = { tenantId, campanhaId: b.campanhaId ?? undefined, briefing: b.briefing, simulado: out.simulado, grupo, criadoPorId: uid(req), tags: ['ia', ...(b.curso ? [b.curso] : [])] }
      const mk = (tipo: string, titulo: string, extra: any) => db.mktPeca.create({ data: { ...base, tipo, titulo, ...extra } })
      pecas = await Promise.all([
        mk('COPY', `Copy — ${out.copy.titulo}`, { conteudo: out.copy, texto: `${out.copy.titulo}\n\n${out.copy.corpo}\n\n${out.copy.cta}` }),
        ...out.anuncios.map((a: any) => mk('ANUNCIO', `Anúncio v${a.variacao} — ${a.headline}`, { canal: b.canal, conteudo: a, texto: `${a.headline}\n${a.descricao}\n${a.cta}` })),
        mk('ROTEIRO_VIDEO', `Roteiro ${out.roteiro.duracaoSeg}s — ${b.curso ?? 'EAD'}`, { conteudo: out.roteiro, texto: out.roteiro.cenas.map((c: any) => `[${c.tempo}] ${c.visual} — "${c.narracao}"`).join('\n') }),
        ...out.legendas.map((l: any) => mk('LEGENDA', `Legenda v${l.variacao}`, { conteudo: l, texto: `${l.texto}\n${l.hashtags.join(' ')}` })),
        mk('EMAIL', `E-mail — ${out.email.assunto}`, { canal: 'EMAIL', conteudo: out.email, texto: `${out.email.assunto}\n${out.email.preheader}\n\n${out.email.corpo}` }),
        ...out.imagens.map((im: any) => mk('IMAGEM', `Imagem ${im.formato}`, { formato: im.formato, svg: im.svg })),
      ])
    }
    await audit({ tenantId, userId: uid(req), modulo: 'marketing', acao: 'IA_GEROU_PECAS', detalhes: { simulado: out.simulado, pecas: pecas.length } })
    res.status(201).json({ ...out, aviso: out.simulado ? 'Geração SIMULADA (sem chave de IA configurada): textos de modelo e imagens vetoriais com a marca. Revise antes de publicar.' : 'Conteúdo gerado por IA: revise e aprove antes de publicar.', pecas: pecas.map((p) => ({ id: p.id, tipo: p.tipo, titulo: p.titulo })) })
  }))
  r.post('/ia/imagem', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const b = parseBody(z.object({ titulo: z.string().min(3).max(120), subtitulo: optStr(200), cta: optStr(40), formato: z.enum(Object.keys(FORMATOS) as [string, ...string[]]).default('FEED_1080'), campanhaId: optStr(80) }), req.body)
    const svg = gerarSvg({ formato: b.formato, titulo: b.titulo, subtitulo: b.subtitulo ?? undefined, cta: b.cta ?? undefined, marca: await marca(tenantId) })
    const p = await db.mktPeca.create({ data: { tenantId, tipo: 'IMAGEM', titulo: b.titulo, formato: b.formato, svg, campanhaId: b.campanhaId ?? undefined, criadoPorId: uid(req), simulado: true, tags: ['placeholder'] } }); res.status(201).json(p)
  }))
  r.get('/pecas', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { skip, take, page, pageSize } = pageParams(req.query); const where: any = { tenantId: tid(req) }
    for (const k of ['tipo', 'status', 'campanhaId', 'grupo']) { const v = qs((req.query as any)[k]); if (v) where[k] = v }
    const q = qs(req.query.q); if (q) where.titulo = { contains: q, mode: 'insensitive' }
    const [items, total] = await Promise.all([db.mktPeca.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }), db.mktPeca.count({ where })]); res.json({ items, total, page, pageSize })
  }))
  r.get('/pecas/:id', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => { const p = await db.mktPeca.findFirst({ where: { id: String(req.params.id), tenantId: tid(req) } }); if (!p) fail(404, 'Peça não encontrada.'); res.json(p) }))
  r.get('/pecas/:id/imagem.svg', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const p = await db.mktPeca.findFirst({ where: { id: String(req.params.id), tenantId: tid(req) } }); if (!p?.svg) fail(404, 'Peça sem imagem.')
    res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'").type('image/svg+xml').send(p.svg)
  }))
  r.patch('/pecas/:id', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const p = await db.mktPeca.findFirst({ where: { id: String(req.params.id), tenantId } }); if (!p) fail(404, 'Peça não encontrada.')
    const b = parseBody(z.object({ titulo: z.string().min(2).max(200), texto: z.string().max(10000), tags: z.array(z.string().max(40)).max(20), campanhaId: optStr(80) }).partial(), req.body)
    res.json(await db.mktPeca.update({ where: { id: p.id }, data: { ...b, versao: { increment: 1 }, ...(p.status === 'APROVADA' ? { status: 'EM_APROVACAO', aprovadoPorId: null, aprovadoEm: null } : {}) } as any }))
  }))
  const acaoPeca = (rota: string, de: string[], para: string, perm: any) => r.post(`/pecas/:id/${rota}`, perm, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const p = await db.mktPeca.findFirst({ where: { id: String(req.params.id), tenantId } }); if (!p) fail(404, 'Peça não encontrada.')
    if (!de.includes(p.status)) fail(409, `Ação indisponível para peça em ${p.status}.`)
    if (rota === 'aprovar' && p.criadoPorId === uid(req) && !ehSuper(req)) fail(403, 'Segregação de função: quem gerou a peça não pode aprová-la.')
    const motivo = qs(req.body?.motivo)
    if (rota === 'rejeitar' && !motivo) fail(400, 'Informe o motivo da rejeição.')
    const up = await db.mktPeca.update({ where: { id: p.id }, data: { status: para, ...(rota === 'aprovar' ? { aprovadoPorId: uid(req), aprovadoEm: new Date(), motivoRejeicao: null } : {}), ...(rota === 'rejeitar' ? { motivoRejeicao: motivo } : {}) } })
    await historico(tenantId, 'MktPeca', p.id, rota.toUpperCase(), uid(req), motivo); res.json(up)
  }))
  acaoPeca('enviar-aprovacao', ['RASCUNHO', 'REJEITADA'], 'EM_APROVACAO', requireRole(...GESTAO))
  acaoPeca('aprovar', ['EM_APROVACAO'], 'APROVADA', requireRole('COORDINATOR'))
  acaoPeca('rejeitar', ['EM_APROVACAO'], 'REJEITADA', requireRole('COORDINATOR'))
  acaoPeca('arquivar', ['RASCUNHO', 'REJEITADA', 'APROVADA', 'EM_APROVACAO'], 'ARQUIVADA', requireRole(...GESTAO))
  void publicBase
}
