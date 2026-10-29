import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { mountCrud } from '../core/crud'
import { READ, WRITE, Response, AuthenticatedRequest, agendarVencimento, asyncHandler, assertNoTenant, checarVigencia, mountLista, optDate, optMoney, optStr, proximoCodigo, requireRole, tid } from './common'
import { bloquearStatus, mountCiclo, travarStatus } from './ciclo'

export const TIPOS_CONTRATO = ['PRESTACAO_SERVICOS', 'FORNECIMENTO', 'TRABALHO', 'PARCERIA', 'CONVENIO', 'COOPERACAO', 'TECNOLOGIA', 'OUTRO'] as const
const INDICES = ['IPCA', 'IGPM', 'INPC', 'FIXO', 'NENHUM'] as const

export const lembreteContrato = (c: any, reabrir = false) => agendarVencimento({
  tenantId: c.tenantId, refType: 'JurContrato', refId: c.id, tag: 'contrato', titulo: `Contrato "${c.objeto.slice(0, 80)}" com ${c.contraparteNome} (${c.codigo})`,
  descricao: c.renovacaoAutomatica ? 'Renovação automática: confirme se deseja manter ou notificar a não renovação dentro do aviso prévio.' : 'Renove, aditive ou encerre antes do vencimento.',
  due: c.vigenciaFim, ativo: c.status === 'VIGENTE', reabrir, assigneeUserId: c.responsavelUserId ?? undefined,
})

const base = z.object({
  codigo: z.string().min(3).max(40).optional(), tipo: z.enum(TIPOS_CONTRATO), objeto: z.string().min(3).max(1000), contraparteNome: z.string().min(2).max(200),
  contraparteDoc: optStr(30), valor: optMoney(), periodicidade: z.enum(['MENSAL', 'ANUAL', 'UNICO', 'POR_DEMANDA']).nullish(), indiceReajuste: z.enum(INDICES).nullish(),
  reajusteMes: z.number().int().min(1).max(12).nullish(), dataAssinatura: optDate(), vigenciaInicio: z.coerce.date(), vigenciaFim: optDate(),
  renovacaoAutomatica: z.boolean().optional(), avisoPrevioDias: z.number().int().min(0).max(720).nullish(), multaRescisoria: optStr(500), garantias: optStr(1000),
  responsavelUserId: optStr(80), responsavelNome: optStr(120), documentoId: z.string().uuid().nullish(), observacoes: optStr(),
})

export function registerContratos(router: Router) {
  mountLista(router, {
    model: 'jurContrato', path: '/contratos', campoVenc: 'vigenciaFim', statusVigente: ['VIGENTE'], search: ['objeto', 'contraparteNome', 'codigo'],
    filters: ['tipo', 'status', 'responsavelUserId', 'renovacaoAutomatica'], orderBy: [{ vigenciaFim: 'asc' }, { createdAt: 'desc' }],
  })
  bloquearStatus(router, '/contratos')
  mountCrud(router, {
    model: 'jurContrato', path: '/contratos', read: READ, write: WRITE, modulo: 'juridico.contratos', create: base.omit({}),
    include: { aditivos: { orderBy: { numero: 'asc' } } },
    beforeCreate: async (d, req) => {
      checarVigencia(d.vigenciaInicio, d.vigenciaFim, 'vigência do contrato')
      await assertNoTenant(tid(req), 'jurDocumento', d.documentoId, 'Documento')
      return { ...d, codigo: d.codigo ?? (await proximoCodigo(tid(req), 'CTR')), status: 'RASCUNHO' }
    },
    afterCreate: (row) => lembreteContrato(row),
    beforeUpdate: async (d, req, cur) => {
      travarStatus(d, cur)
      checarVigencia(d.vigenciaInicio ?? cur.vigenciaInicio, d.vigenciaFim ?? cur.vigenciaFim, 'vigência do contrato')
      if (d.documentoId) await assertNoTenant(tid(req), 'jurDocumento', d.documentoId, 'Documento')
    },
    afterUpdate: (row) => lembreteContrato(row, true),
  })
  mountCiclo(router, {
    path: '/contratos', model: 'jurContrato', modulo: 'juridico.contratos', refType: 'JurContrato', campoValor: 'valor', onChange: lembreteContrato,
    aoRenovar: async (row, b, userId) => {
      const ult = await prisma.jurContratoAditivo.aggregate({ where: { contratoId: row.id }, _max: { numero: true } })
      await prisma.jurContratoAditivo.create({ data: { tenantId: row.tenantId, contratoId: row.id, numero: (ult._max.numero ?? 0) + 1, data: new Date(), descricao: b.descricao || 'Renovação/prorrogação de prazo', novoValor: b.novoValor, novaVigenciaFim: b.novaVigenciaFim, criadoPorId: userId } })
    },
  })
  router.get('/contratos/:id/aditivos', requireRole(...READ), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const items = await prisma.jurContratoAditivo.findMany({ where: { tenantId: tid(req), contratoId: String(req.params.id) }, orderBy: { numero: 'asc' } })
    res.json({ items, total: items.length })
  }))
}
