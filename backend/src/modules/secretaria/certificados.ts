import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { Branding, brandHeaderHtml, escapeHtml as esc, getBranding } from '../core/branding'
import { mountCrud, pageParams, parseBody, qs } from '../core/crud'
import { audit, notify } from '../core/notify'
import { MODULO, SEC, SEC_GESTAO, SEC_LEITURA, exigirAluno, proximoNumero, urlVerificacao } from './common'
import { dataExtenso, formatNumero, gerarCodigoVerificacao, renderTemplate, sha256, variaveisDoTemplate } from './logic'

// ============================================================
// CERTIFICADOS: modelos, emissão individual/lote, revogação, reemissão
// ============================================================

const REF = 'SecCertificado'
export const TIPOS_CERT = ['CURSO', 'EXTENSAO', 'EVENTO', 'POS_GRADUACAO', 'MONITORIA', 'PARTICIPACAO'] as const

const modeloSchema = z.object({
  codigo: z.string().min(2).max(40).transform((s) => s.toUpperCase().replace(/\s+/g, '_')),
  nome: z.string().min(3).max(150),
  tipo: z.enum(TIPOS_CERT),
  titulo: z.string().max(100).default('CERTIFICADO'),
  texto: z.string().min(10).max(4000),
  htmlCustom: z.string().max(60000).nullable().optional(),
  orientacao: z.enum(['landscape', 'portrait']).default('landscape'),
  assinaturas: z.array(z.object({ nome: z.string().max(120), cargo: z.string().max(120), assetKind: z.string().max(40).optional() })).max(4).optional(),
  ativo: z.boolean().optional(),
})

export interface DadosCertificado {
  nome: string
  cpf?: string | null
  tituloEvento: string
  cargaHoraria?: number | null
  periodo?: string | null
  extra?: Record<string, unknown>
}

// Gera o HTML do certificado (logomarca em destaque + selo + assinaturas + QR/código).
export function renderCertificadoHtml(p: { modelo: { titulo: string; texto: string; htmlCustom?: string | null; orientacao: string; assinaturas?: any }; b: Branding; dados: DadosCertificado; numero: string; codigo: string; emitidoEm: Date; revogado?: boolean }) {
  const { modelo, b, dados } = p
  const vars: Record<string, unknown> = {
    ...(dados.extra ?? {}),
    nome: dados.nome,
    cpf: dados.cpf ?? '',
    evento: dados.tituloEvento,
    titulo: dados.tituloEvento,
    cargaHoraria: dados.cargaHoraria ?? '',
    periodo: dados.periodo ?? '',
    data: dataExtenso(p.emitidoEm),
    instituicao: b.nome,
    numero: p.numero,
    codigo: p.codigo,
  }
  const url = urlVerificacao(p.codigo)
  const assinaturas: Array<{ nome: string; cargo: string; assetKind?: string }> = Array.isArray(modelo.assinaturas) && modelo.assinaturas.length ? modelo.assinaturas : [{ nome: b.reitorNome || '', cargo: b.reitorCargo || 'Reitor(a)', assetKind: 'ASSINATURA' }]
  const cor = b.cores
  const assinaturasHtml = assinaturas
    .map((a, i) => {
      const img = b.logos[a.assetKind || (i === 0 ? 'ASSINATURA' : '')]
      return `<div style="text-align:center;min-width:220px;font:13px Georgia,serif">${img ? `<img src="${esc(img)}" alt="" style="max-height:60px;max-width:200px;display:block;margin:0 auto -6px"/>` : '<div style="height:54px"></div>'}<div style="border-top:1px solid #0f172a;padding-top:4px"><b>${esc(a.nome || '____________________')}</b></div><div style="color:#475569;font-size:12px">${esc(a.cargo)}</div></div>`
    })
    .join('')
  const selo = b.logos.SELO_CERTIFICADO ? `<img src="${esc(b.logos.SELO_CERTIFICADO)}" alt="Selo" style="height:92px"/>` : ''
  const marca = b.logos.MARCA_DAGUA ? `<img src="${esc(b.logos.MARCA_DAGUA)}" alt="" style="position:absolute;inset:0;margin:auto;max-width:55%;max-height:55%;opacity:.07"/>` : ''
  const verif = `<div style="display:flex;align-items:center;gap:10px;font:10.5px sans-serif;color:#475569"><div id="qr" data-url="${esc(url)}" style="width:76px;height:76px"></div><div>Certificado nº <b>${esc(p.numero)}</b><br/>Verifique em ${esc(url)}<br/>Código: <b style="font-size:12px">${esc(p.codigo)}</b></div></div>`
  const revogado = p.revogado ? `<div style="position:absolute;top:40%;left:0;right:0;text-align:center;font:900 90px sans-serif;color:#dc262655;transform:rotate(-18deg)">REVOGADO</div>` : ''
  const raw = { cabecalho: brandHeaderHtml(b, { titulo: modelo.titulo }), selo, assinaturas: `<div style="display:flex;gap:48px;justify-content:center;flex-wrap:wrap">${assinaturasHtml}</div>`, verificacao: verif, marcaDagua: marca }
  const corpo = renderTemplate(modelo.texto, vars)
  const largura = modelo.orientacao === 'portrait' ? '794px' : '1122px'
  const altura = modelo.orientacao === 'portrait' ? '1122px' : '794px'
  const conteudo = modelo.htmlCustom
    ? renderTemplate(modelo.htmlCustom, { ...vars, corpo }, { ...raw, corpo: `<div>${corpo}</div>` })
    : `<div style="position:absolute;inset:14px;border:3px double ${esc(cor.primaria)};pointer-events:none"></div>${marca}
<div style="position:relative;padding:26px 48px;display:flex;flex-direction:column;height:100%;box-sizing:border-box">
${raw.cabecalho}
<div style="flex:1;display:flex;flex-direction:column;justify-content:center;text-align:center;font-family:Georgia,serif;padding:10px 40px">
  <div style="font-size:15px;line-height:1.9;color:#0f172a">${corpo}</div>
</div>
<div style="display:flex;justify-content:space-between;align-items:flex-end;gap:20px">${verif}${raw.assinaturas}<div style="min-width:92px;text-align:right">${selo}</div></div>
</div>${revogado}`
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Certificado ${esc(p.numero)} — ${esc(dados.nome)}</title>
<style>@page{size:A4 ${modelo.orientacao};margin:0}body{margin:0;background:#e5e7eb}.pg{position:relative;width:${largura};height:${altura};margin:16px auto;background:#fff;box-shadow:0 2px 14px #0003;overflow:hidden}.barra{max-width:${largura};margin:8px auto;text-align:right;font:13px sans-serif}@media print{body{background:#fff}.pg{margin:0;box-shadow:none}.barra{display:none}}</style></head><body>
<div class="barra"><button onclick="window.print()">Imprimir / salvar PDF</button></div>
<div class="pg">${conteudo}${p.revogado && modelo.htmlCustom ? revogado : ''}</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
<script>try{var q=document.getElementById('qr');if(q)new QRCode(q,{text:q.dataset.url,width:76,height:76})}catch(e){}</script></body></html>`
  return html
}

const TIPO_CORE: Record<string, 'CONCLUSAO_CURSO' | 'EXTENSAO' | 'PARTICIPACAO'> = { CURSO: 'CONCLUSAO_CURSO', POS_GRADUACAO: 'CONCLUSAO_CURSO', EXTENSAO: 'EXTENSAO' }

// Emite um certificado: numeração atômica ANO/SEQ, código único e SHA-256 do HTML.
export async function emitirCertificado(p: {
  tenantId: string
  modeloId: string
  dados: DadosCertificado
  studentId?: string | null
  loteId?: string | null
  userId?: string
  permitirDuplicado?: boolean
  branding?: Branding
}) {
  const modelo = await prisma.secCertModelo.findFirst({ where: { id: p.modeloId, tenantId: p.tenantId, ativo: true } })
  if (!modelo) throw Object.assign(new Error('Modelo de certificado não encontrado ou inativo.'), { status: 404 })
  let dados = { ...p.dados }
  if (p.studentId) {
    const s = await prisma.student.findFirst({ where: { id: p.studentId, tenantId: p.tenantId }, select: { nomeCompleto: true, cpf: true } })
    if (!s) throw Object.assign(new Error('Aluno não encontrado.'), { status: 404 })
    dados = { ...dados, nome: dados.nome || s.nomeCompleto, cpf: dados.cpf ?? s.cpf }
  }
  if (!dados.nome?.trim()) throw Object.assign(new Error('Nome do destinatário obrigatório.'), { status: 400 })
  if (!p.permitirDuplicado) {
    const dup = await prisma.secCertificado.findFirst({
      where: { tenantId: p.tenantId, modeloId: modelo.id, status: 'EMITIDO', tituloEvento: dados.tituloEvento, periodo: dados.periodo ?? null, ...(p.studentId ? { studentId: p.studentId } : dados.cpf ? { destinatarioDoc: dados.cpf } : { destinatarioNome: dados.nome }) },
      select: { numero: true },
    })
    if (dup) throw Object.assign(new Error(`Já existe o certificado ${dup.numero} para este destinatário/evento.`), { status: 409 })
  }
  const b = p.branding ?? (await getBranding(p.tenantId))
  const emitidoEm = new Date()
  const ano = emitidoEm.getFullYear()
  const seq = await proximoNumero(p.tenantId, `CERT:${ano}`)
  const numero = formatNumero(ano, seq, 6)
  for (let i = 0; i < 4; i++) {
    const codigo = gerarCodigoVerificacao()
    const html = renderCertificadoHtml({ modelo, b, dados, numero, codigo, emitidoEm })
    try {
      const row = await prisma.secCertificado.create({
        data: {
          tenantId: p.tenantId,
          modeloId: modelo.id,
          loteId: p.loteId ?? undefined,
          numero,
          codigo,
          hash: sha256(html),
          destinatarioNome: dados.nome,
          destinatarioDoc: dados.cpf ?? undefined,
          studentId: p.studentId ?? undefined,
          tituloEvento: dados.tituloEvento,
          cargaHoraria: dados.cargaHoraria ?? undefined,
          periodo: dados.periodo ?? undefined,
          dados: (dados.extra as any) ?? undefined,
          html,
          emitidoEm,
          emitidoPorId: p.userId,
        },
      })
      if (p.studentId) {
        // espelha no Certificate do núcleo (portal legado), sem falhar a emissão
        try {
          const core = await prisma.certificate.create({ data: { studentId: p.studentId, tipo: TIPO_CORE[modelo.tipo] ?? 'PARTICIPACAO', descricao: `${dados.tituloEvento} (${numero})`, emitidoEm, urlPdf: urlVerificacao(codigo) } })
          await prisma.secCertificado.update({ where: { id: row.id }, data: { certificateId: core.id } })
        } catch (e) {
          console.error('[secretaria] espelho Certificate', e)
        }
        await notify({ tenantId: p.tenantId, studentId: p.studentId, assunto: 'Certificado emitido', mensagem: `Seu certificado "${dados.tituloEvento}" (nº ${numero}) está disponível. Código de verificação: ${codigo}.`, templateKey: 'sec.certificado.emitido', refType: REF, refId: row.id })
      }
      await audit({ tenantId: p.tenantId, userId: p.userId, modulo: MODULO, acao: 'CERTIFICADO_EMITIDO', refType: REF, refId: row.id, detalhes: { numero, modelo: modelo.codigo } })
      return row
    } catch (e: any) {
      if (e?.code === 'P2002' && String(e?.meta?.target ?? '').includes('numero')) throw e
      if (e?.code !== 'P2002') throw e
    }
  }
  throw Object.assign(new Error('Falha ao gerar código único.'), { status: 503 })
}

const emitirSchema = z.object({
  modeloId: z.string().min(1),
  studentId: z.string().optional(),
  nome: z.string().max(200).optional(),
  cpf: z.string().max(20).optional(),
  tituloEvento: z.string().min(2).max(250),
  cargaHoraria: z.number().int().min(0).max(10000).optional(),
  periodo: z.string().max(120).optional(),
  extra: z.record(z.string(), z.any()).optional(),
  permitirDuplicado: z.boolean().default(false),
})

const loteSchema = z.object({
  modeloId: z.string().min(1),
  nomeLote: z.string().min(2).max(150),
  tituloEvento: z.string().min(2).max(250),
  cargaHoraria: z.number().int().min(0).max(10000).optional(),
  periodo: z.string().max(120).optional(),
  extra: z.record(z.string(), z.any()).optional(),
  classSectionId: z.string().optional(), // todos os alunos da turma
  programId: z.string().optional(), // matrículas CONCLUIDA do curso
  destinatarios: z
    .array(z.object({ studentId: z.string().optional(), nome: z.string().max(200).optional(), cpf: z.string().max(20).optional(), extra: z.record(z.string(), z.any()).optional(), cargaHoraria: z.number().int().optional() }))
    .max(500)
    .optional(),
})

export function mountCertificados(router: Router) {
  mountCrud(router, {
    model: 'secCertModelo',
    path: '/cert-modelos',
    read: SEC_LEITURA,
    write: SEC_GESTAO,
    create: modeloSchema,
    search: ['nome', 'codigo'],
    filters: ['tipo', 'ativo'],
    orderBy: { nome: 'asc' },
    modulo: MODULO,
    removeMode: 'soft',
    beforeCreate: (d) => validarTexto(d),
    beforeUpdate: (d) => validarTexto(d),
  })

  router.get('/cert-modelos/:id/variaveis', requireRole(...SEC_LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const m = await prisma.secCertModelo.findFirst({ where: { id: String(req.params.id), tenantId: getTenantId(req) } })
    if (!m) return res.status(404).json({ error: 'Modelo não encontrado.' })
    res.json({ variaveis: [...new Set([...variaveisDoTemplate(m.texto), ...(m.htmlCustom ? variaveisDoTemplate(m.htmlCustom) : [])])], padrao: ['nome', 'cpf', 'evento', 'cargaHoraria', 'periodo', 'data', 'instituicao', 'numero', 'codigo'], blocosHtml: ['cabecalho', 'selo', 'assinaturas', 'verificacao', 'marcaDagua', 'corpo'] })
  }))

  // Pré-visualização com dados fictícios ou informados.
  router.post('/cert-modelos/:id/preview', requireRole(...SEC), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const m = await prisma.secCertModelo.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!m) return res.status(404).json({ error: 'Modelo não encontrado.' })
    const b = parseBody(z.object({ nome: z.string().default('Fulano de Tal'), tituloEvento: z.string().default('Evento de Exemplo'), cargaHoraria: z.number().optional().default(20), periodo: z.string().default('01 a 05/01'), extra: z.record(z.string(), z.any()).optional() }), req.body ?? {})
    const html = renderCertificadoHtml({ modelo: m, b: await getBranding(tenantId), dados: b, numero: formatNumero(new Date().getFullYear(), 0), codigo: 'EXEM-PLO0-0000', emitidoEm: new Date() })
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.send(html)
  }))

  router.post('/certificados', requireRole(...SEC), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const b = parseBody(emitirSchema, req.body)
    if (!b.studentId && !b.nome) return res.status(400).json({ error: 'Informe studentId ou nome.' })
    const row = await emitirCertificado({ tenantId: getTenantId(req), modeloId: b.modeloId, studentId: b.studentId, userId: getUserId(req), permitirDuplicado: b.permitirDuplicado, dados: { nome: b.nome ?? '', cpf: b.cpf, tituloEvento: b.tituloEvento, cargaHoraria: b.cargaHoraria, periodo: b.periodo, extra: b.extra } })
    res.status(201).json(row)
  }))

  // Emissão em lote (lista, turma ou concluintes de um curso). Retorna sucesso/erro por destinatário.
  router.post('/certificados/lote', requireRole(...SEC), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(loteSchema, req.body)
    const userId = getUserId(req)
    const destinatarios: Array<{ studentId?: string; nome?: string; cpf?: string; extra?: Record<string, unknown>; cargaHoraria?: number }> = [...(b.destinatarios ?? [])]
    if (b.classSectionId) {
      const cs = await prisma.classSection.findFirst({ where: { id: b.classSectionId, tenantId }, select: { id: true } })
      if (!cs) return res.status(404).json({ error: 'Turma não encontrada.' })
      const vs = await prisma.classSectionEnrollment.findMany({ where: { classSectionId: cs.id, enrollment: { status: { in: ['ATIVA', 'CONCLUIDA'] } } }, include: { enrollment: { select: { studentId: true } } } })
      for (const v of vs) destinatarios.push({ studentId: v.enrollment.studentId })
    }
    if (b.programId) {
      const ms = await prisma.enrollment.findMany({ where: { programId: b.programId, status: 'CONCLUIDA', student: { tenantId } }, select: { studentId: true } })
      for (const m of ms) destinatarios.push({ studentId: m.studentId })
    }
    const unicos = new Map<string, (typeof destinatarios)[number]>()
    for (const d of destinatarios) unicos.set(d.studentId ?? `${d.cpf ?? ''}|${(d.nome ?? '').toLowerCase()}`, d)
    const lista = [...unicos.values()]
    if (!lista.length) return res.status(400).json({ error: 'Nenhum destinatário informado.' })
    if (lista.length > 500) return res.status(400).json({ error: 'Máximo de 500 destinatários por lote.' })
    const modelo = await prisma.secCertModelo.findFirst({ where: { id: b.modeloId, tenantId, ativo: true }, select: { id: true } })
    if (!modelo) return res.status(404).json({ error: 'Modelo não encontrado.' })
    const lote = await prisma.secCertLote.create({ data: { tenantId, modeloId: modelo.id, nome: b.nomeLote, criadoPorId: userId } })
    const branding = await getBranding(tenantId)
    const emitidos: Array<{ id: string; numero: string; codigo: string; nome: string }> = []
    const erros: Array<{ destinatario: string; erro: string }> = []
    for (const d of lista) {
      try {
        if (!d.studentId && !d.nome) throw new Error('destinatário sem nome/studentId')
        const row = await emitirCertificado({ tenantId, modeloId: modelo.id, studentId: d.studentId, loteId: lote.id, userId, branding, dados: { nome: d.nome ?? '', cpf: d.cpf, tituloEvento: b.tituloEvento, cargaHoraria: d.cargaHoraria ?? b.cargaHoraria, periodo: b.periodo, extra: { ...(b.extra ?? {}), ...(d.extra ?? {}) } } })
        emitidos.push({ id: row.id, numero: row.numero, codigo: row.codigo, nome: row.destinatarioNome })
      } catch (e: any) {
        erros.push({ destinatario: d.studentId ?? d.nome ?? '?', erro: e?.message ?? 'erro' })
      }
    }
    await prisma.secCertLote.update({ where: { id: lote.id }, data: { total: emitidos.length } })
    await audit({ tenantId, userId, modulo: MODULO, acao: 'CERTIFICADO_LOTE', refType: 'SecCertLote', refId: lote.id, detalhes: { emitidos: emitidos.length, erros: erros.length } })
    res.status(erros.length && !emitidos.length ? 422 : 201).json({ loteId: lote.id, emitidos, erros })
  }))

  router.get('/certificados', requireRole(...SEC_LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    for (const f of ['status', 'modeloId', 'studentId', 'loteId']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    const q = qs(req.query.q)
    if (q) where.OR = [{ destinatarioNome: { contains: q, mode: 'insensitive' } }, { numero: { contains: q } }, { codigo: { contains: q.toUpperCase() } }, { tituloEvento: { contains: q, mode: 'insensitive' } }]
    const [items, total] = await Promise.all([
      prisma.secCertificado.findMany({ where, select: { id: true, numero: true, codigo: true, status: true, destinatarioNome: true, tituloEvento: true, cargaHoraria: true, periodo: true, emitidoEm: true, studentId: true, loteId: true, modeloId: true, revogadoEm: true }, orderBy: { emitidoEm: 'desc' }, skip, take }),
      prisma.secCertificado.count({ where }),
    ])
    res.json({ items, total, page, pageSize })
  }))

  router.get('/certificados/:id', requireRole(...SEC_LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { html, ...c } = (await prisma.secCertificado.findFirst({ where: { id: String(req.params.id), tenantId: getTenantId(req) } })) ?? ({} as any)
    if (!c.id) return res.status(404).json({ error: 'Certificado não encontrado.' })
    res.json(c)
  }))

  router.get('/certificados/:id/html', requireRole(...SEC_LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const c = await prisma.secCertificado.findFirst({ where: { id: String(req.params.id), tenantId: getTenantId(req) }, include: { modelo: true } })
    if (!c) return res.status(404).json({ error: 'Certificado não encontrado.' })
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    // Revogados são re-renderizados com a marca "REVOGADO"; os demais devolvem o HTML original (hash íntegro).
    if (c.status === 'REVOGADO') return res.send(renderCertificadoHtml({ modelo: c.modelo, b: await getBranding(c.tenantId), dados: { nome: c.destinatarioNome, cpf: c.destinatarioDoc, tituloEvento: c.tituloEvento, cargaHoraria: c.cargaHoraria, periodo: c.periodo, extra: (c.dados as any) ?? undefined }, numero: c.numero, codigo: c.codigo, emitidoEm: c.emitidoEm, revogado: true }))
    res.send(c.html)
  }))

  router.post('/certificados/:id/revogar', requireRole(...SEC_GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { motivo } = parseBody(z.object({ motivo: z.string().min(5).max(500) }), req.body)
    const c = await prisma.secCertificado.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!c) return res.status(404).json({ error: 'Certificado não encontrado.' })
    if (c.status !== 'EMITIDO') return res.status(409).json({ error: `Certificado já está ${c.status}.` })
    const r = await prisma.secCertificado.update({ where: { id: c.id }, data: { status: 'REVOGADO', revogadoEm: new Date(), revogadoPorId: getUserId(req), motivoRevogacao: motivo }, select: { id: true, numero: true, status: true, revogadoEm: true } })
    if (c.studentId) await notify({ tenantId, studentId: c.studentId, assunto: 'Certificado revogado', mensagem: `O certificado nº ${c.numero} foi revogado. Motivo: ${motivo}`, refType: REF, refId: c.id })
    await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'CERTIFICADO_REVOGADO', refType: REF, refId: c.id, detalhes: { motivo } })
    res.json(r)
  }))

  // Reemissão: substitui o certificado (novo nº/código) mantendo rastro; permite corrigir dados.
  router.post('/certificados/:id/reemitir', requireRole(...SEC_GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(z.object({ motivo: z.string().min(5).max(500), nome: z.string().max(200).optional(), cpf: z.string().max(20).optional(), tituloEvento: z.string().max(250).optional(), cargaHoraria: z.number().int().optional(), periodo: z.string().max(120).optional() }), req.body)
    const c = await prisma.secCertificado.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!c) return res.status(404).json({ error: 'Certificado não encontrado.' })
    if (c.status === 'SUBSTITUIDO') return res.status(409).json({ error: 'Certificado já foi substituído.' })
    const novo = await emitirCertificado({ tenantId, modeloId: c.modeloId, studentId: c.studentId, loteId: c.loteId, userId: getUserId(req), permitirDuplicado: true, dados: { nome: b.nome ?? c.destinatarioNome, cpf: b.cpf ?? c.destinatarioDoc, tituloEvento: b.tituloEvento ?? c.tituloEvento, cargaHoraria: b.cargaHoraria ?? c.cargaHoraria, periodo: b.periodo ?? c.periodo, extra: (c.dados as any) ?? undefined } })
    await prisma.secCertificado.update({ where: { id: c.id }, data: { status: 'SUBSTITUIDO', substituidoPorId: novo.id, motivoRevogacao: b.motivo, revogadoEm: new Date(), revogadoPorId: getUserId(req) } })
    await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'CERTIFICADO_REEMITIDO', refType: REF, refId: c.id, detalhes: { novoId: novo.id, motivo: b.motivo } })
    res.status(201).json({ anterior: c.numero, novo: { id: novo.id, numero: novo.numero, codigo: novo.codigo } })
  }))

  // Portal
  router.get('/portal/certificados', requireRole('STUDENT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    res.json(await prisma.secCertificado.findMany({ where: { tenantId: getTenantId(req), studentId: exigirAluno(req), status: 'EMITIDO' }, select: { id: true, numero: true, codigo: true, tituloEvento: true, cargaHoraria: true, emitidoEm: true }, orderBy: { emitidoEm: 'desc' } }))
  }))
  router.get('/portal/certificados/:id/html', requireRole('STUDENT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const c = await prisma.secCertificado.findFirst({ where: { id: String(req.params.id), tenantId: getTenantId(req), studentId: exigirAluno(req), status: 'EMITIDO' } })
    if (!c) return res.status(404).json({ error: 'Certificado não encontrado.' })
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.send(c.html)
  }))
}

function validarTexto(d: any) {
  // Impede script injetado no texto/HTML do modelo (o HTML é servido ao usuário).
  for (const k of ['texto', 'htmlCustom']) {
    if (typeof d[k] === 'string' && /<\s*script|<[^>]*[\s"'\/]on\w+\s*=|javascript:/i.test(d[k])) throw Object.assign(new Error(`O campo ${k} não pode conter scripts ou manipuladores de evento.`), { status: 400 })
  }
  return d
}
