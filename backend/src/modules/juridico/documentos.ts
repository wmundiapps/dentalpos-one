import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { mountCrud } from '../core/crud'
import { audit } from '../core/notify'
import { AuthenticatedRequest, READ, WRITE, Response, acessoTotal, agendarVencimento, asyncHandler, cancelarLembretes, checarVigencia, fail, mountLista, nz, optDate, optStr, parseBody, proximoCodigo, requireRole, restricaoDocumento, tid, uid } from './common'

export const CATEGORIAS_DOC = ['INTERNO', 'PARCERIA', 'CONVENIO', 'FISCAL', 'TRABALHISTA', 'COOPERACAO', 'CONTRATO', 'OUTRO'] as const
export const STATUS_DOC = ['RASCUNHO', 'VIGENTE', 'ENCERRADO', 'CANCELADO'] as const

export async function lembreteDocumento(d: any, reabrir = false) {
  await agendarVencimento({
    tenantId: d.tenantId, refType: 'JurDocumento', refId: d.id, tag: 'doc', titulo: `Documento jurídico "${d.titulo}" (${d.codigo})`,
    descricao: 'Providencie renovação, aditivo ou encerramento antes do vencimento.', due: d.vigenciaFim, ativo: d.status === 'VIGENTE', reabrir,
    assigneeUserId: d.responsavelUserId ?? undefined,
  })
}

const base = z.object({
  codigo: z.string().min(3).max(40).optional(), categoria: z.enum(CATEGORIAS_DOC), titulo: z.string().min(3).max(200), descricao: optStr(),
  partes: optStr(500), status: z.enum(STATUS_DOC).optional(), vigenciaInicio: optDate(), vigenciaFim: optDate(), responsavelUserId: optStr(80),
  responsavelNome: optStr(120), confidencial: z.boolean().optional(), tags: z.array(z.string().min(1).max(40)).max(20).optional(),
})

export function registerDocumentos(router: Router) {
  mountLista(router, {
    model: 'jurDocumento', path: '/documentos', campoVenc: 'vigenciaFim', statusVigente: ['VIGENTE'], search: ['titulo', 'codigo', 'partes', 'descricao'],
    filters: ['categoria', 'status', 'responsavelUserId', 'confidencial', 'tags'], orderBy: [{ vigenciaFim: 'asc' }, { createdAt: 'desc' }], scope: restricaoDocumento,
  })

  mountCrud(router, {
    model: 'jurDocumento', path: '/documentos', read: READ, write: WRITE, modulo: 'juridico.documentos', create: base, scope: restricaoDocumento,
    include: { versoes: { select: { id: true, versao: true, status: true, vigenciaInicio: true, vigenciaFim: true, createdAt: true }, orderBy: { versao: 'desc' } } },
    beforeCreate: async (d, req) => {
      checarVigencia(d.vigenciaInicio, d.vigenciaFim)
      if (d.status === 'VIGENTE' && !d.vigenciaInicio) fail(422, 'Documento vigente exige o início da vigência.')
      return { ...d, codigo: d.codigo ?? (await proximoCodigo(tid(req), 'DOC')), tags: d.tags ?? [] }
    },
    afterCreate: (row) => lembreteDocumento(row),
    beforeUpdate: (d, _req, cur) => {
      delete d.versaoAtual
      checarVigencia(d.vigenciaInicio ?? cur.vigenciaInicio, d.vigenciaFim ?? cur.vigenciaFim)
      if (d.codigo && d.codigo !== cur.codigo) fail(422, 'O código do documento não pode ser alterado.')
      if (cur.status === 'CANCELADO' && d.status && d.status !== 'CANCELADO') fail(409, 'Documento cancelado não pode ser reaberto.')
    },
    afterUpdate: (row) => lembreteDocumento(row, true),
  })

  // ---- versionamento
  router.get('/documentos/:id/versoes', requireRole(...READ), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const doc = await prisma.jurDocumento.findFirst({ where: { id: String(req.params.id), tenantId: tid(req), ...restricaoDocumento(req) }, select: { id: true } })
    if (!doc) return res.status(404).json({ error: 'Documento não encontrado.' })
    const items = await prisma.jurDocumentoVersao.findMany({ where: { tenantId: tid(req), documentoId: doc.id }, orderBy: { versao: 'desc' } })
    res.json({ items, total: items.length })
  }))

  // Nova versão: a anterior vira SUBSTITUIDA (vigência encerrada na véspera) e o documento herda a vigência da nova.
  router.post('/documentos/:id/versoes', requireRole(...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ resumoAlteracoes: z.string().min(3).max(2000), conteudo: z.string().max(200_000).optional(), vigenciaInicio: optDate(), vigenciaFim: optDate() }), req.body)
    checarVigencia(b.vigenciaInicio, b.vigenciaFim)
    const doc = await prisma.jurDocumento.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!doc) return res.status(404).json({ error: 'Documento não encontrado.' })
    if (doc.status === 'CANCELADO' || doc.status === 'ENCERRADO') fail(409, 'Documento encerrado/cancelado não recebe novas versões.')
    const inicio = b.vigenciaInicio ?? new Date()
    for (let i = 0; i < 3; i++) {
      try {
        const out = await prisma.$transaction(async (tx) => {
          const ult = await tx.jurDocumentoVersao.aggregate({ where: { tenantId, documentoId: doc.id }, _max: { versao: true } })
          await tx.jurDocumentoVersao.updateMany({ where: { tenantId, documentoId: doc.id, status: 'VIGENTE' }, data: { status: 'SUBSTITUIDA', vigenciaFim: new Date(inicio.getTime() - 86_400_000) } })
          const v = await tx.jurDocumentoVersao.create({ data: { tenantId, documentoId: doc.id, versao: (ult._max.versao ?? 0) + 1, resumoAlteracoes: b.resumoAlteracoes, conteudo: b.conteudo, status: 'VIGENTE', vigenciaInicio: inicio, vigenciaFim: nz(b.vigenciaFim), criadoPorId: uid(req) } })
          const d = await tx.jurDocumento.update({ where: { id: doc.id }, data: { versaoAtual: v.versao, vigenciaInicio: inicio, vigenciaFim: b.vigenciaFim ?? doc.vigenciaFim } })
          return { v, d }
        })
        await lembreteDocumento(out.d, true)
        await audit({ tenantId, userId: uid(req), modulo: 'juridico.documentos', acao: 'NOVA_VERSAO', refType: 'JurDocumento', refId: doc.id, detalhes: { versao: out.v.versao } })
        return res.status(201).json(out.v)
      } catch (e: any) { if (e?.code !== 'P2002' || i === 2) throw e }
    }
  }))

  router.post('/documentos/:id/encerrar', requireRole(...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const d = await prisma.jurDocumento.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!d) return res.status(404).json({ error: 'Documento não encontrado.' })
    if (d.status !== 'VIGENTE' && d.status !== 'RASCUNHO') fail(409, 'Somente documentos vigentes ou em rascunho podem ser encerrados.')
    const row = await prisma.jurDocumento.update({ where: { id: d.id }, data: { status: 'ENCERRADO' } })
    await cancelarLembretes(tenantId, 'doc', d.id)
    await audit({ tenantId, userId: uid(req), modulo: 'juridico.documentos', acao: 'ENCERRAR', refType: 'JurDocumento', refId: d.id })
    res.json(row)
  }))
  void acessoTotal
}
