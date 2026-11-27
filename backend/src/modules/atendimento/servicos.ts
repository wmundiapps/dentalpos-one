import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { ALUNO, ATENDE, AuthenticatedRequest, GESTAO, MOD, Response, asyncHandler, assertTenant, audit, exigirAluno, fail, parseBody, qs, requireRole, tid, uid } from './common'
import { garantirPadroes } from './bootstrap'
import { validarEtapas } from './logic'
import { ST_ABERTOS, abrirProtocolo, executarAutomacao } from './protocolos'

const servicoSchema = z.object({
  codigo: z.string().min(2).max(40).transform((s) => s.toUpperCase().replace(/[\s-]+/g, '_')), nome: z.string().min(3).max(140), descricao: z.string().max(600).optional(), categoria: z.enum(['ACADEMICO', 'DOCUMENTO', 'FINANCEIRO', 'CADASTRO', 'GERAL']).default('GERAL'),
  publicoAlvo: z.enum(['ALUNO', 'EGRESSO', 'PUBLICO']).default('ALUNO'), autoatendimento: z.boolean().default(false), automacao: z.enum(['NENHUMA', 'EMITIR_DOCUMENTO', 'SEGUNDA_VIA_BOLETO', 'TRANCAMENTO', 'CONSULTA_FINANCEIRA']).default('NENHUMA'),
  modeloId: z.string().nullish(), taxa: z.number().min(0).max(100000).default(0), prazoDias: z.number().int().min(0).max(120).default(5), setorId: z.string().nullish(), exigeAssinatura: z.boolean().default(false), ativo: z.boolean().optional(),
  etapas: z.array(z.object({ codigo: z.string(), nome: z.string(), prazoDias: z.number().int().min(0).max(60).optional(), setorCodigo: z.string().optional() })).nullish(),
  documentos: z.array(z.object({ titulo: z.string().min(3).max(160), descricao: z.string().max(300).optional(), obrigatorio: z.boolean().default(true), validadeDias: z.number().int().min(1).max(3650).nullish() })).max(20).optional(),
})

export function mountServicos(router: Router) {
  router.get('/servicos', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    await garantirPadroes(tenantId)
    const where: any = { tenantId }
    const c = qs(req.query.categoria); if (c) where.categoria = c
    if (qs(req.query.autoatendimento) === '1') where.autoatendimento = true
    const [items, uso] = await Promise.all([prisma.atdServico.findMany({ where, include: { documentos: { orderBy: { ordem: 'asc' } } }, orderBy: [{ categoria: 'asc' }, { nome: 'asc' }] }), prisma.atdProtocolo.groupBy({ by: ['servicoId'], where: { tenantId }, _count: true })])
    const um = new Map(uso.map((u) => [u.servicoId, u._count]))
    res.json(items.map((s) => ({ ...s, protocolos: um.get(s.id) ?? 0 })))
  }))
  async function validar(tenantId: string, b: z.infer<typeof servicoSchema> | Partial<z.infer<typeof servicoSchema>>) {
    await assertTenant(tenantId, 'atdSetor', b.setorId, 'Setor'); await assertTenant(tenantId, 'atdModeloDocumento', b.modeloId, 'Modelo de documento')
    if (b.etapas) { const e = validarEtapas(b.etapas); if (e) fail(400, e); if (b.etapas.length < 2) fail(400, 'A jornada precisa de ao menos 2 etapas.') }
    if (b.automacao === 'EMITIR_DOCUMENTO' && !b.modeloId) fail(400, 'Automação de emissão exige o modelo de documento.')
  }
  router.post('/servicos', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const { documentos, ...b } = parseBody(servicoSchema, req.body)
    await validar(tenantId, b)
    if (await prisma.atdServico.findFirst({ where: { tenantId, codigo: b.codigo } })) fail(409, 'Já existe um serviço com este código.')
    const s = await prisma.atdServico.create({ data: { tenantId, ...b, modeloId: b.modeloId ?? undefined, setorId: b.setorId ?? undefined, etapas: b.etapas ?? undefined, documentos: documentos ? { create: documentos.map((d, i) => ({ tenantId, ordem: i, ...d, validadeDias: d.validadeDias ?? undefined })) } : undefined }, include: { documentos: true } })
    await audit({ tenantId, userId: uid(req), modulo: `${MOD}.catalogo`, acao: 'SERVICO_CRIADO', refType: 'AtdServico', refId: s.id })
    res.status(201).json(s)
  }))
  router.put('/servicos/:id', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const s = await prisma.atdServico.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!s) fail(404, 'Serviço não encontrado.')
    const { documentos, codigo: _c, ...b } = parseBody(servicoSchema.partial(), req.body)
    await validar(tenantId, { ...b, automacao: b.automacao ?? (s.automacao as any), modeloId: b.modeloId === undefined ? s.modeloId : b.modeloId })
    const n = await prisma.$transaction(async (tx) => {
      if (documentos) { await tx.atdServicoDocumento.deleteMany({ where: { servicoId: s.id } }); await tx.atdServicoDocumento.createMany({ data: documentos.map((d, i) => ({ tenantId, servicoId: s.id, ordem: i, titulo: d.titulo, descricao: d.descricao, obrigatorio: d.obrigatorio, validadeDias: d.validadeDias ?? undefined })) }) }
      return tx.atdServico.update({ where: { id: s.id }, data: { ...b, modeloId: b.modeloId ?? undefined, setorId: b.setorId ?? undefined, etapas: b.etapas ?? undefined }, include: { documentos: true } })
    })
    await audit({ tenantId, userId: uid(req), modulo: `${MOD}.catalogo`, acao: 'SERVICO_ATUALIZADO', refType: 'AtdServico', refId: s.id })
    res.json(n)
  }))

  // ------------------------------------------------------------ portal (autoatendimento)
  router.get('/portal/servicos', requireRole(...ALUNO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    await garantirPadroes(tenantId)
    const items = await prisma.atdServico.findMany({ where: { tenantId, ativo: true, autoatendimento: true, publicoAlvo: { in: ['ALUNO', 'PUBLICO'] } }, include: { documentos: { orderBy: { ordem: 'asc' }, select: { id: true, titulo: true, obrigatorio: true, validadeDias: true } } }, orderBy: [{ categoria: 'asc' }, { nome: 'asc' }] })
    res.json(items.map((s) => ({ id: s.id, codigo: s.codigo, nome: s.nome, descricao: s.descricao, categoria: s.categoria, taxa: s.taxa, prazoDias: s.prazoDias, imediato: s.automacao !== 'NENHUMA' && s.automacao !== 'TRANCAMENTO' && !s.documentos.length, documentos: s.documentos, automacao: s.automacao })))
  }))
  router.post('/portal/solicitar', requireRole(...ALUNO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req), studentId = exigirAluno(req)
    const b = parseBody(z.object({ servicoId: z.string().min(1), descricao: z.string().max(2000).optional(), finalidade: z.string().max(120).optional() }), req.body)
    const sv = await prisma.atdServico.findFirst({ where: { id: b.servicoId, tenantId, ativo: true, autoatendimento: true } })
    if (!sv) fail(404, 'Serviço não disponível no autoatendimento.')
    if (sv.automacao === 'TRANCAMENTO' || sv.automacao === 'NENHUMA') {
      const dup = await prisma.atdProtocolo.findFirst({ where: { tenantId, studentId, servicoId: sv.id, status: { in: ST_ABERTOS } } })
      if (dup) fail(409, `Você já possui o protocolo ${dup.numero} em andamento para este serviço.`)
    }
    const dados = b.finalidade ? { extras: { finalidade: b.finalidade } } : undefined
    const p = await abrirProtocolo({ tenantId, servicoId: sv.id, studentId, descricao: b.descricao, canal: 'CHAT_PORTAL', origem: 'PORTAL', abertoPorId: req.user!.id, dados })
    const automacao = await executarAutomacao(tenantId, p.id)
    const f = await prisma.atdProtocolo.findUniqueOrThrow({ where: { id: p.id } })
    res.status(201).json({ id: f.id, numero: f.numero, codigoRastreio: f.codigoRastreio, status: f.status, taxaStatus: f.taxaStatus, taxaValor: f.taxaValor, documentoEmitidoId: f.documentoEmitidoId, resultado: f.resultado, automacao })
  }))
}
