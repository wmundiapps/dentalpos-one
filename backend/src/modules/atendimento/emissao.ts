import { createHmac } from 'crypto'
import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { getBranding } from '../core/branding'
import { montarHistorico } from '../secretaria/documentos'
import { urlVerificacao } from '../secretaria/common'
import { ALUNO, ATENDE, AuthenticatedRequest, GESTAO, MOD, Response, asyncHandler, assertTenant, audit, exigirAluno, fail, nomeInstituicao, numeroAnual, pageParams, parseBody, qs, requireRole, tid, uid } from './common'
import { CAMPOS_DINAMICOS, TIPOS_MODELO, camposDoTexto, conteudoCanonico, dataExtenso, gerarCodigoVerificacao, mascCpf, renderTexto, sha256 } from './logic'
import { gerarPdf } from './pdf'

const REF = 'AtdDocumentoEmitido'

// ------------------------------------------------------------ assinatura eletrônica (interface; ICP-Brasil é plugável)
export interface AssinaturaProvider { tipo: 'SIMULADA_ICP' | 'ICP_BRASIL'; assinar(p: { hash: string; assinante: string; tenantId: string }): Promise<{ serie: string; assinatura: string; assinadoEm: Date }> }
/** Assinatura SIMULADA: não tem validade jurídica ICP-Brasil. Um provedor real (A1/A3/nuvem) implementa a mesma interface. */
export const AssinaturaSimulada: AssinaturaProvider = {
  tipo: 'SIMULADA_ICP',
  async assinar({ hash, assinante, tenantId }) {
    const assinatura = createHmac('sha256', `${process.env.JWT_SECRET || 'dev'}:${tenantId}`).update(`${hash}|${assinante}`).digest('hex')
    return { serie: `SIM-${assinatura.slice(0, 10).toUpperCase()}`, assinatura, assinadoEm: new Date() }
  },
}
let providerAssinatura: AssinaturaProvider = AssinaturaSimulada
export const definirProvedorAssinatura = (p: AssinaturaProvider) => { providerAssinatura = p }

// ------------------------------------------------------------ campos dinâmicos
const fmt = (d?: Date | null) => (d ? new Date(d).toLocaleDateString('pt-BR') : '')
export async function montarCampos(tenantId: string, studentId: string, extras: Record<string, unknown> = {}) {
  const h = await montarHistorico(tenantId, studentId)
  const { student, matricula, linhas, resumo } = h
  const comFreq = linhas.filter((l) => l.frequencia != null)
  const freq = comFreq.length ? Math.round(comFreq.reduce((s, l) => s + (l.frequencia as number), 0) / comFreq.length) : null
  const concluido = ['CONCLUIDO', 'FORMADO'].includes(student.status) || matricula?.status === 'CONCLUIDA'
  const vars: Record<string, unknown> = {
    nome: student.nomeCompleto, cpf: mascCpf(student.cpf), ra: student.ra, matricula: matricula?.id.slice(0, 8).toUpperCase() ?? '', curso: matricula?.program?.nome ?? '', modalidade: matricula?.program?.modalidade ?? '',
    periodo: matricula?.term?.codigo ?? '', situacao: student.status, ingresso: fmt(matricula?.dataMatricula), conclusao: concluido ? fmt(matricula?.term?.dataFim ?? new Date()) : '',
    carga_horaria_total: matricula?.program?.cargaHorariaTotal ?? '', carga_horaria_cursada: resumo.cargaHorariaCursada, frequencia_media: freq != null ? `${freq}%` : '', coeficiente: resumo.coeficienteRendimento != null ? resumo.coeficienteRendimento.toFixed(2).replace('.', ',') : '',
    disciplinas_aprovadas: resumo.disciplinasAprovadas, historico: linhas.length ? `(${linhas.length} disciplinas — ver tabela abaixo)` : '', finalidade: 'fins comprobatórios', ...extras,
  }
  return { vars, student, matricula, concluido, linhas }
}

export interface EmitirIn { tenantId: string; modeloId: string; studentId: string; extras?: Record<string, unknown>; userId?: string; protocoloId?: string | null; taxaValor?: number; receivableId?: string | null; via?: number; origemId?: string | null }

export async function emitirDocumentoAtd(i: EmitirIn) {
  const { tenantId } = i
  const modelo = await prisma.atdModeloDocumento.findFirst({ where: { id: i.modeloId, tenantId, ativo: true } })
  if (!modelo) fail(404, 'Modelo de documento não encontrado ou inativo.')
  const { vars, student, matricula, concluido, linhas } = await montarCampos(tenantId, i.studentId, i.extras)
  if (modelo.exigeConclusao && !concluido) fail(409, 'Este documento exige conclusão do curso e o aluno ainda não consta como concluinte.')
  if (modelo.exigeMatriculaAtiva && matricula?.status !== 'ATIVA') fail(409, `Matrícula não está ativa (${matricula?.status ?? 'sem matrícula'}): não é possível emitir.`)
  const inst = await nomeInstituicao(tenantId)
  for (let t = 0; t < 5; t++) {
    const codigo = gerarCodigoVerificacao()
    const { numero } = await numeroAnual(tenantId, 'DOC', 6)
    const dados = { ...vars, data: dataExtenso(new Date()), instituicao: inst, numero, codigo }
    const { texto, faltantes } = renderTexto(modelo.texto, dados)
    const obrig = faltantes.filter((f) => !['cpf', 'conclusao', 'frequencia_media', 'coeficiente', 'historico', 'matricula', 'periodo', 'modalidade', 'ingresso'].includes(f) || f === 'conclusao' && modelo.exigeConclusao)
    if (obrig.length) fail(400, `Faltam dados para o documento: ${obrig.join(', ')}.`)
    const hash = sha256(conteudoCanonico({ numero, codigo, titulo: modelo.titulo, destinatario: student.nomeCompleto, conteudo: texto }))
    const sig = modelo.exigeAssinatura ? await providerAssinatura.assinar({ hash, assinante: modelo.assinante || inst, tenantId }) : null
    try {
      const row = await prisma.atdDocumentoEmitido.create({
        data: {
          tenantId, modeloId: modelo.id, tipo: modelo.tipo, numero, codigo, hash, via: i.via ?? 1, origemId: i.origemId ?? undefined, studentId: i.studentId, destinatarioNome: student.nomeCompleto, titulo: modelo.titulo, conteudo: texto,
          dados: { ...dados, cpf: mascCpf(student.cpf), historico: undefined, linhas: camposDoTexto(modelo.texto).includes('historico') || modelo.codigo.includes('HISTORICO') ? linhas : undefined } as any, protocoloId: i.protocoloId ?? undefined,
          assinaturaTipo: sig ? providerAssinatura.tipo : undefined, assinaturaSerie: sig?.serie, assinaturaHash: sig?.assinatura, assinadoEm: sig?.assinadoEm, assinadoPor: sig ? modelo.assinante || inst : undefined,
          validoAte: modelo.validadeDias ? new Date(Date.now() + modelo.validadeDias * 86_400_000) : undefined, taxaValor: i.taxaValor ?? 0, receivableId: i.receivableId ?? undefined, emitidoPorId: i.userId,
        },
      })
      await audit({ tenantId, userId: i.userId, modulo: `${MOD}.emissao`, acao: i.via && i.via > 1 ? 'DOCUMENTO_SEGUNDA_VIA' : 'DOCUMENTO_EMITIDO', refType: REF, refId: row.id, detalhes: { numero, tipo: modelo.tipo, modelo: modelo.codigo } })
      return row
    } catch (e: any) { if (e?.code !== 'P2002') throw e }
  }
  fail(503, 'Falha ao gerar numeração/código do documento.')
}

export async function pdfDoDocumento(d: { id: string; tenantId: string; numero: string; codigo: string; hash: string; titulo: string; conteudo: string; destinatarioNome: string; status: string; via: number; dados: any; assinadoPor: string | null; assinaturaSerie: string | null; assinaturaTipo: string | null; assinadoEm: Date | null; validoAte: Date | null; emitidoEm: Date; modeloId: string }) {
  const [b, modelo] = await Promise.all([getBranding(d.tenantId), prisma.atdModeloDocumento.findFirst({ where: { id: d.modeloId, tenantId: d.tenantId }, select: { cargoAssinante: true } })])
  const linhas: any[] = Array.isArray(d.dados?.linhas) ? d.dados.linhas : []
  const url = urlVerificacao(d.codigo)
  return gerarPdf({
    titulo: d.titulo, instituicao: b.nome,
    paragrafos: d.conteudo.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean),
    tabela: linhas.length ? { cabecalho: ['Período', 'Disciplina', 'CH', 'Nota', 'Freq.', 'Situação'], linhas: linhas.map((l) => [String(l.periodo ?? ''), String(l.disciplina ?? ''), String(l.cargaHoraria ?? ''), l.nota != null ? Number(l.nota).toFixed(1).replace('.', ',') : '—', l.frequencia != null ? `${l.frequencia}%` : '—', String(l.situacao ?? '')]) } : undefined,
    assinaturaLinha: d.assinadoPor ? [d.assinadoPor, modelo?.cargoAssinante || 'Responsável', `Assinatura eletrônica ${d.assinaturaTipo === 'ICP_BRASIL' ? 'ICP-Brasil' : 'SIMULADA (sem validade ICP-Brasil)'} · série ${d.assinaturaSerie} · ${d.assinadoEm ? new Date(d.assinadoEm).toLocaleString('pt-BR') : ''}`] : undefined,
    rodape: [`Documento nº ${d.numero}${d.via > 1 ? ` (${d.via}ª via)` : ''} emitido em ${d.emitidoEm.toLocaleString('pt-BR')}${d.validoAte ? `, válido até ${d.validoAte.toLocaleDateString('pt-BR')}` : ''}.`, `Verifique a autenticidade: ${url}`, `Código: ${d.codigo}  ·  SHA-256: ${d.hash.slice(0, 32)}…`],
    qrTexto: url, marcaDagua: d.status === 'REVOGADO' ? 'REVOGADO' : d.status === 'CANCELADO' ? 'CANCELADO' : d.status === 'SUBSTITUIDO' ? 'SUBSTITUIDO' : undefined, metadata: `numero=${d.numero}`,
  })
}

const modeloSchema = z.object({
  codigo: z.string().min(2).max(40).transform((s) => s.toUpperCase().replace(/\s+/g, '_')), nome: z.string().min(3).max(150), tipo: z.enum(TIPOS_MODELO), titulo: z.string().min(3).max(120), texto: z.string().min(20).max(6000),
  orientacao: z.enum(['portrait', 'landscape']).default('portrait'), validadeDias: z.number().int().min(1).max(3650).nullish(), taxa: z.number().min(0).max(100000).default(0), exigeAssinatura: z.boolean().default(true),
  exigeConclusao: z.boolean().default(false), exigeMatriculaAtiva: z.boolean().default(false), solicitavelPortal: z.boolean().default(true), assinante: z.string().max(120).optional(), cargoAssinante: z.string().max(120).optional(), ativo: z.boolean().optional(),
})
function validarCampos(texto: string) {
  const campos = camposDoTexto(texto)
  const inval = campos.filter((c) => !CAMPOS_DINAMICOS.includes(c))
  if (inval.length) fail(400, `Campos dinâmicos desconhecidos: ${inval.join(', ')}. Disponíveis: ${CAMPOS_DINAMICOS.join(', ')}.`)
  return campos
}

export function mountEmissao(router: Router) {
  router.get('/modelos-documento/campos', requireRole(...ATENDE), (_req, res) => res.json({ campos: CAMPOS_DINAMICOS, tipos: TIPOS_MODELO }))
  router.get('/modelos-documento', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    res.json(await prisma.atdModeloDocumento.findMany({ where: { tenantId: tid(req) }, orderBy: [{ tipo: 'asc' }, { nome: 'asc' }] }))
  }))
  router.post('/modelos-documento', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(modeloSchema, req.body)
    const campos = validarCampos(b.texto)
    if (await prisma.atdModeloDocumento.findFirst({ where: { tenantId, codigo: b.codigo } })) fail(409, 'Já existe um modelo com este código.')
    const m = await prisma.atdModeloDocumento.create({ data: { tenantId, ...b, validadeDias: b.validadeDias ?? undefined, campos } })
    await audit({ tenantId, userId: uid(req), modulo: `${MOD}.emissao`, acao: 'MODELO_CRIADO', refType: 'AtdModeloDocumento', refId: m.id })
    res.status(201).json(m)
  }))
  router.put('/modelos-documento/:id', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const m = await prisma.atdModeloDocumento.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!m) fail(404, 'Modelo não encontrado.')
    const { codigo: _c, ...b } = parseBody(modeloSchema.partial(), req.body)
    const campos = b.texto ? validarCampos(b.texto) : m.campos
    res.json(await prisma.atdModeloDocumento.update({ where: { id: m.id }, data: { ...b, validadeDias: b.validadeDias ?? undefined, campos } }))
  }))
  router.post('/modelos-documento/:id/previa', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const m = await prisma.atdModeloDocumento.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!m) fail(404, 'Modelo não encontrado.')
    const b = parseBody(z.object({ studentId: z.string().min(1) }), req.body)
    await assertTenant(tenantId, 'student', b.studentId, 'Aluno')
    const { vars } = await montarCampos(tenantId, b.studentId)
    const r = renderTexto(m.texto, { ...vars, data: dataExtenso(new Date()), instituicao: await nomeInstituicao(tenantId), numero: '(previa)', codigo: '(previa)' })
    res.json({ texto: r.texto, faltantes: r.faltantes, cpf: mascCpf(String(vars.cpf)) })
  }))

  router.get('/documentos-emitidos', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    for (const f of ['status', 'tipo', 'studentId', 'modeloId']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    const q = qs(req.query.q); if (q) where.OR = [{ numero: { contains: q, mode: 'insensitive' } }, { destinatarioNome: { contains: q, mode: 'insensitive' } }, { codigo: { contains: q.toUpperCase() } }]
    const [items, total] = await Promise.all([prisma.atdDocumentoEmitido.findMany({ where, orderBy: { emitidoEm: 'desc' }, skip, take, select: { id: true, numero: true, codigo: true, tipo: true, titulo: true, status: true, via: true, destinatarioNome: true, emitidoEm: true, validoAte: true, assinaturaTipo: true, assinaturaSerie: true, protocoloId: true, studentId: true, motivoRevogacao: true } }), prisma.atdDocumentoEmitido.count({ where })])
    res.json({ items, total, page, pageSize })
  }))
  router.post('/documentos-emitidos', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ modeloId: z.string().min(1), studentId: z.string().min(1), extras: z.record(z.union([z.string().max(300), z.number()])).optional() }), req.body)
    await assertTenant(tenantId, 'student', b.studentId, 'Aluno')
    const d = await emitirDocumentoAtd({ tenantId, ...b, userId: uid(req) })
    res.status(201).json({ ...d, verificacaoUrl: urlVerificacao(d.codigo) })
  }))
  router.get('/documentos-emitidos/:id', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const d = await prisma.atdDocumentoEmitido.findFirst({ where: { id: String(req.params.id), tenantId: tid(req) } })
    if (!d) fail(404, 'Documento não encontrado.')
    res.json({ ...d, verificacaoUrl: urlVerificacao(d.codigo) })
  }))
  router.get('/documentos-emitidos/:id/pdf', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const d = await prisma.atdDocumentoEmitido.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!d) fail(404, 'Documento não encontrado.')
    await audit({ tenantId, userId: uid(req), modulo: `${MOD}.emissao`, acao: 'DOCUMENTO_PDF_BAIXADO', refType: REF, refId: d.id })
    enviarPdf(res, await pdfDoDocumento(d as any), d.numero)
  }))
  router.post('/documentos-emitidos/:id/segunda-via', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const d = await prisma.atdDocumentoEmitido.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!d || !d.studentId) fail(404, 'Documento não encontrado.')
    if (d.status !== 'EMITIDO') fail(409, `Documento ${d.status}: não admite 2ª via.`)
    const b = parseBody(z.object({ motivo: z.string().min(3).max(300) }), req.body)
    const novo = await emitirDocumentoAtd({ tenantId, modeloId: d.modeloId, studentId: d.studentId, userId: uid(req), via: d.via + 1, origemId: d.id, protocoloId: d.protocoloId })
    await prisma.atdDocumentoEmitido.update({ where: { id: d.id }, data: { status: 'SUBSTITUIDO', motivoRevogacao: `2ª via emitida (${novo.numero}): ${b.motivo}`, revogadoEm: new Date(), revogadoPorId: uid(req) } })
    res.status(201).json({ ...novo, verificacaoUrl: urlVerificacao(novo.codigo) })
  }))
  for (const acao of ['revogar', 'cancelar'] as const) {
    router.post(`/documentos-emitidos/:id/${acao}`, requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = tid(req)
      const d = await prisma.atdDocumentoEmitido.findFirst({ where: { id: String(req.params.id), tenantId } })
      if (!d) fail(404, 'Documento não encontrado.')
      if (d.status !== 'EMITIDO') fail(409, `Documento já está ${d.status}.`)
      const b = parseBody(z.object({ motivo: z.string().min(5).max(500) }), req.body)
      const n = await prisma.atdDocumentoEmitido.update({ where: { id: d.id }, data: { status: acao === 'revogar' ? 'REVOGADO' : 'CANCELADO', motivoRevogacao: b.motivo, revogadoEm: new Date(), revogadoPorId: uid(req) } })
      await audit({ tenantId, userId: uid(req), modulo: `${MOD}.emissao`, acao: acao === 'revogar' ? 'DOCUMENTO_REVOGADO' : 'DOCUMENTO_CANCELADO', refType: REF, refId: d.id, detalhes: { numero: d.numero, motivo: b.motivo } })
      res.json(n)
    }))
  }

  // ------------------------------------------------------------ portal do aluno
  router.get('/portal/documentos', requireRole(...ALUNO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    res.json(await prisma.atdDocumentoEmitido.findMany({ where: { tenantId: tid(req), studentId: exigirAluno(req) }, orderBy: { emitidoEm: 'desc' }, take: 100, select: { id: true, numero: true, codigo: true, tipo: true, titulo: true, status: true, via: true, emitidoEm: true, validoAte: true } }))
  }))
  router.get('/portal/documentos/:id/pdf', requireRole(...ALUNO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const d = await prisma.atdDocumentoEmitido.findFirst({ where: { id: String(req.params.id), tenantId, studentId: exigirAluno(req) } })
    if (!d) fail(404, 'Documento não encontrado.')
    await audit({ tenantId, userId: uid(req), modulo: `${MOD}.emissao`, acao: 'DOCUMENTO_PDF_BAIXADO', refType: REF, refId: d.id, detalhes: { origem: 'PORTAL' } })
    enviarPdf(res, await pdfDoDocumento(d as any), d.numero)
  }))
}

function enviarPdf(res: Response, buf: Buffer, numero: string) {
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Content-Disposition', `inline; filename="${numero.replace(/[^\w.-]+/g, '_')}.pdf"`)
  res.send(buf)
}
