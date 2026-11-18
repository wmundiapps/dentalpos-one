import { Router, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { Req, asyncHandler, audit, erro, getTenantId, getUserId, requireRole, txt } from './util'

// Acompanhamento de cada compra até o setor que pediu: emitido, enviado ao fornecedor, chegou, conferido, entrada no estoque,
// saiu para entrega e entregue ao setor. Cada etapa tem responsável. Montado em /api/edu/compras-rastreio.
const router = Router()
const operacao = requireRole('SUPPLIES', 'FACILITIES', 'STAFF')
export const ETAPAS = ['EMITIDO', 'ENVIADO_FORNECEDOR', 'CHEGOU', 'CONFERIDO', 'ENTRADA_ESTOQUE', 'SAIU_ENTREGA', 'ENTREGUE_SETOR'] as const
export const ROTULO: Record<string, string> = { EMITIDO: 'Pedido emitido', ENVIADO_FORNECEDOR: 'Enviado ao fornecedor', CHEGOU: 'Mercadoria chegou', CONFERIDO: 'Conferida (qtd. e qualidade)', ENTRADA_ESTOQUE: 'Entrada no sistema/estoque', SAIU_ENTREGA: 'Saiu para entrega ao setor', ENTREGUE_SETOR: 'Entregue ao setor' }

router.get('/pedidos', asyncHandler(async (req: Req, res: Response) => {
  const tenantId = getTenantId(req)
  const pedidos = await prisma.supPedido.findMany({ where: { tenantId, status: { not: 'RASCUNHO' } }, orderBy: { createdAt: 'desc' }, take: 200, include: { fornecedor: { select: { razaoSocial: true, nomeFantasia: true } }, itens: { select: { itemId: true, quantidade: true } } } })
  const ids = pedidos.map((p) => p.id)
  const [etapas, destinos, itens] = await Promise.all([
    prisma.supPedidoEtapa.findMany({ where: { tenantId, pedidoId: { in: ids } }, orderBy: { em: 'asc' } }),
    prisma.supPedidoDestino.findMany({ where: { tenantId, pedidoId: { in: ids } } }),
    prisma.supItem.findMany({ where: { tenantId, id: { in: pedidos.flatMap((p) => p.itens.map((i) => i.itemId)) } }, select: { id: true, nome: true } }),
  ])
  const nomeItem = new Map(itens.map((i) => [i.id, i.nome]))
  res.json({
    etapas: ETAPAS.map((e) => ({ etapa: e, rotulo: ROTULO[e] })),
    pedidos: pedidos.map((p) => {
      const feitas = etapas.filter((e) => e.pedidoId === p.id)
      const destino = destinos.find((d) => d.pedidoId === p.id)
      const resp = (destino?.responsaveis ?? {}) as Record<string, string>
      const jornada = ETAPAS.map((e) => {
        if (e === 'EMITIDO') return { etapa: e, rotulo: ROTULO[e], feito: true, em: p.emitidoEm ?? p.createdAt, responsavel: 'Compras' }
        const f = feitas.find((x) => x.etapa === e)
        return { etapa: e, rotulo: ROTULO[e], feito: Boolean(f), em: f?.em ?? null, responsavel: f?.responsavel ?? null, previstoResponsavel: resp[e] ?? null, observacao: f?.observacao ?? null }
      })
      const atual = [...jornada].reverse().find((j) => j.feito)
      const proxima = jornada.find((j) => !j.feito)
      return {
        id: p.id, numero: p.numero, status: p.status, valorTotal: p.valorTotal, previsaoEntrega: p.previsaoEntrega, emitidoEm: p.emitidoEm,
        fornecedor: p.fornecedor.nomeFantasia || p.fornecedor.razaoSocial, produtos: p.itens.map((i) => `${nomeItem.get(i.itemId) ?? 'Item'} (${i.quantidade})`),
        departamento: destino?.departamento ?? null, solicitante: destino?.solicitante ?? null,
        etapaAtual: atual?.rotulo ?? '—', proximaEtapa: proxima ?? null, concluido: !proxima,
        atrasado: Boolean(!proxima ? false : p.previsaoEntrega && p.previsaoEntrega < new Date()), jornada,
      }
    }),
  })
}))
router.put('/pedidos/:id/destino', operacao, asyncHandler(async (req: Req, res: Response) => {
  const tenantId = getTenantId(req), pedidoId = String(req.params.id)
  await prisma.supPedido.findFirst({ where: { id: pedidoId, tenantId } }) ?? erro(404, 'Pedido não encontrado.')
  const departamento = txt(req.body?.departamento, 120) || erro(400, 'Informe o setor de destino.')
  const resp: Record<string, string> = {}
  for (const e of ETAPAS) if (req.body?.responsaveis?.[e]) resp[e] = txt(req.body.responsaveis[e], 120)
  const d = { departamento, solicitante: txt(req.body?.solicitante, 120) || null, responsaveis: resp }
  res.json(await prisma.supPedidoDestino.upsert({ where: { pedidoId }, update: d, create: { tenantId, pedidoId, ...d } }))
}))
router.post('/pedidos/:id/etapa', operacao, asyncHandler(async (req: Req, res: Response) => {
  const tenantId = getTenantId(req), pedidoId = String(req.params.id)
  await prisma.supPedido.findFirst({ where: { id: pedidoId, tenantId } }) ?? erro(404, 'Pedido não encontrado.')
  const feitas = await prisma.supPedidoEtapa.findMany({ where: { tenantId, pedidoId } })
  const proxima = ETAPAS.slice(1).find((e) => !feitas.some((f) => f.etapa === e)) ?? erro(409, 'Todas as etapas deste pedido já foram registradas.')
  if (req.body?.etapa && req.body.etapa !== proxima) erro(409, `A próxima etapa é "${ROTULO[proxima]}". Registre na ordem.`)
  const responsavel = txt(req.body?.responsavel, 120) || erro(400, 'Informe o responsável por esta etapa.')
  const r = await prisma.supPedidoEtapa.create({ data: { tenantId, pedidoId, etapa: proxima, responsavel, observacao: txt(req.body?.observacao, 400) || null } })
  await audit({ tenantId, userId: getUserId(req), modulo: 'compras-rastreio', acao: proxima, refType: 'SupPedido', refId: pedidoId })
  res.status(201).json(r)
}))
export default router
