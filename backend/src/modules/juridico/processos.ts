import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { mountCrud } from '../core/crud'
import { audit } from '../core/notify'
import { mascararCpf } from '../lgpd/mascara'
import { registrarAcessoSensivel } from '../lgpd/sensiveis'
import {
  AuthenticatedRequest, READ, Response, WRITE, acessoTotal, agendarVencimento, alertaDe, asyncHandler, assertNoTenant, cancelarLembretes, fail, mountLista,
  optDate, optMoney, optStr, pageParams, parseBody, qs, requireRole, restricaoProcesso, tid, uid,
} from './common'
import { diasAte, normalizarCausa, r2, validarCnj } from './logic'

export const AREAS = ['CIVEL', 'CRIMINAL', 'TRABALHISTA', 'ADMINISTRATIVO', 'TRIBUTARIO', 'CONSUMIDOR', 'OUTRO'] as const
export const POSICOES = ['AUTOR', 'REU', 'TERCEIRO', 'INVESTIGADO', 'VITIMA', 'ASSISTENTE'] as const
export const RISCOS = ['PROVAVEL', 'POSSIVEL', 'REMOTO'] as const
const STATUS_EDITAVEIS = ['EM_ANDAMENTO', 'SUSPENSO', 'ARQUIVADO'] as const

const causa = z.preprocess((v) => (typeof v === 'string' && v.trim() ? normalizarCausa(v) : v === '' ? undefined : v), z.string().min(2).max(80).nullish())

const processoBase = z.object({
  numeroCnj: z.string().min(10).max(40), area: z.enum(AREAS), classe: optStr(120), assunto: z.string().min(3).max(300), vara: optStr(160), comarca: optStr(120), tribunal: optStr(80),
  uf: z.string().length(2).nullish(), posicao: z.enum(POSICOES).optional(), sofrido: z.boolean().optional(), valorCausa: optMoney(), risco: z.enum(RISCOS).optional(),
  provisaoValor: optMoney(), status: z.enum(STATUS_EDITAVEIS).optional(), dataDistribuicao: optDate(), causaRaiz: causa, setorOrigem: optStr(120), tipoOrigem: optStr(120),
  segredoJustica: z.boolean().optional(), advogadoId: z.string().uuid().nullish(), escritorioId: z.string().uuid().nullish(), resumo: optStr(),
})

export const ehSofrido = (posicao?: string) => posicao === 'REU' || posicao === 'INVESTIGADO' || posicao === undefined

/** Regra contábil (CPC 25): provisão só para risco PROVÁVEL; possível = divulgação; remoto = nada. */
export function validarProvisao(risco: string, valor: number | null | undefined) {
  if ((valor ?? 0) > 0 && risco !== 'PROVAVEL') fail(422, 'Provisão só se registra para risco PROVÁVEL (possível = apenas divulgação; remoto = nada). Ajuste o risco ou zere a provisão.')
}

async function histProvisao(tenantId: string, processoId: string, risco: string, valor: number, anterior: number | null, motivo: string | undefined, usuarioId: string) {
  await prisma.jurProvisaoHist.create({ data: { tenantId, processoId, risco, valor, valorAnterior: anterior, motivo, usuarioId } })
}

const mascarar = (p: any, req: AuthenticatedRequest) => (acessoTotal(req) ? p : { ...p, partes: p.partes?.map((x: any) => ({ ...x, documento: x.documento ? mascararCpf(x.documento) : x.documento })) })

async function processoAcessivel(req: AuthenticatedRequest, id: string) {
  return prisma.jurProcesso.findFirst({ where: { id, tenantId: tid(req), ...restricaoProcesso(req) } })
}

export const lembretePrazo = (p: any, proc: { numeroCnj: string }, reabrir = false) => agendarVencimento({
  tenantId: p.tenantId, refType: 'JurPrazo', refId: p.id, tag: 'prazo', titulo: `${p.fatal ? 'PRAZO FATAL' : 'Prazo'}: ${p.titulo} (processo ${proc.numeroCnj})`,
  descricao: 'Confira com o advogado responsável e protocole dentro do prazo.', due: p.dataFatal, limites: [7, 3, 1], ativo: p.status === 'ABERTO', reabrir,
  assigneeUserId: p.responsavelUserId ?? undefined,
})
export const lembreteAudiencia = (a: any, proc: { numeroCnj: string }, reabrir = false) => agendarVencimento({
  tenantId: a.tenantId, refType: 'JurAudiencia', refId: a.id, tag: 'audiencia', titulo: `Audiência ${a.tipo} (processo ${proc.numeroCnj})`,
  descricao: `${a.modalidade}${a.local ? ' — ' + a.local : ''}. Prepare preposto, documentos e testemunhas.`, due: a.dataHora, limites: [7, 1], ativo: a.status === 'AGENDADA', reabrir,
})

function nested(router: Router, o: { seg: string; model: string; create: z.ZodTypeAny; order: any; podeEscrever?: (proc: any) => void; antes?: (d: any, proc: any, req: AuthenticatedRequest) => Promise<void> | void; depois?: (row: any, proc: any, reabrir: boolean) => Promise<void> | void; aoRemover?: (row: any) => Promise<void> | void }) {
  const delegate = () => (prisma as any)[o.model]
  router.get(`/processos/:id/${o.seg}`, requireRole(...READ), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const p = await processoAcessivel(req, String(req.params.id))
    if (!p) return res.status(404).json({ error: 'Processo não encontrado.' })
    const items = await delegate().findMany({ where: { tenantId: tid(req), processoId: p.id }, orderBy: o.order })
    if (o.seg === 'partes') await registrarAcessoSensivel(req, { recurso: 'juridico/processos/partes', recursoId: p.id, categoria: 'DADO_JUDICIAL' })
    res.json({ items: o.seg === 'partes' && !acessoTotal(req) ? items.map((x: any) => ({ ...x, documento: x.documento ? mascararCpf(x.documento) : x.documento })) : items, total: items.length })
  }))
  router.post(`/processos/:id/${o.seg}`, requireRole(...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const p = await processoAcessivel(req, String(req.params.id))
    if (!p) return res.status(404).json({ error: 'Processo não encontrado.' })
    o.podeEscrever?.(p)
    const d: any = parseBody(o.create, req.body)
    await o.antes?.(d, p, req)
    const row = await delegate().create({ data: { ...d, tenantId, processoId: p.id } })
    await o.depois?.(row, p, false)
    await audit({ tenantId, userId: uid(req), modulo: `juridico.${o.seg}`, acao: 'CRIAR', refType: o.model, refId: row.id, detalhes: { processoId: p.id } })
    res.status(201).json(row)
  }))
  const atualizar = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const cur = await delegate().findFirst({ where: { id: String(req.params.subId), tenantId } })
    if (!cur) return res.status(404).json({ error: 'Registro não encontrado.' })
    const p = await processoAcessivel(req, cur.processoId)
    if (!p) return res.status(404).json({ error: 'Registro não encontrado.' })
    const d: any = parseBody((o.create as any).partial(), req.body)
    await o.antes?.({ ...cur, ...d }, p, req)
    const row = await delegate().update({ where: { id: cur.id }, data: d })
    await o.depois?.(row, p, true)
    await audit({ tenantId, userId: uid(req), modulo: `juridico.${o.seg}`, acao: 'ATUALIZAR', refType: o.model, refId: cur.id })
    res.json(row)
  })
  router.put(`/${o.seg}/:subId`, requireRole(...WRITE), atualizar)
  router.patch(`/${o.seg}/:subId`, requireRole(...WRITE), atualizar)
  router.delete(`/${o.seg}/:subId`, requireRole(...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const cur = await delegate().findFirst({ where: { id: String(req.params.subId), tenantId } })
    if (!cur) return res.status(404).json({ error: 'Registro não encontrado.' })
    await delegate().delete({ where: { id: cur.id } })
    await o.aoRemover?.(cur)
    await audit({ tenantId, userId: uid(req), modulo: `juridico.${o.seg}`, acao: 'REMOVER', refType: o.model, refId: cur.id })
    res.status(204).end()
  }))
}

const naoEncerrado = (p: any) => { if (p.status === 'ENCERRADO') fail(409, 'Processo encerrado: reabra-o antes de lançar prazos/audiências.') }

export function registerProcessos(router: Router) {
  // ---- escritórios e advogados
  mountCrud(router, { model: 'jurEscritorio', path: '/escritorios', read: READ, write: WRITE, modulo: 'juridico.escritorios', search: ['nome', 'cnpj'], filters: ['ativo'], orderBy: { nome: 'asc' }, removeMode: 'soft',
    create: z.object({ nome: z.string().min(2).max(200), cnpj: optStr(30), contatoNome: optStr(120), email: z.string().email().nullish(), telefone: optStr(30), honorarios: optStr(1000), ativo: z.boolean().optional() }),
    include: { advogados: { select: { id: true, nome: true, oab: true, ativo: true } } } })
  mountCrud(router, { model: 'jurAdvogado', path: '/advogados', read: READ, write: WRITE, modulo: 'juridico.advogados', search: ['nome', 'oab'], filters: ['tipo', 'ativo', 'escritorioId'], orderBy: { nome: 'asc' }, removeMode: 'soft',
    create: z.object({ nome: z.string().min(2).max(200), oab: optStr(30), tipo: z.enum(['INTERNO', 'EXTERNO']).optional(), escritorioId: z.string().uuid().nullish(), email: z.string().email().nullish(), telefone: optStr(30), ativo: z.boolean().optional() }),
    include: { escritorio: { select: { id: true, nome: true } } },
    beforeCreate: async (d, req) => { await assertNoTenant(tid(req), 'jurEscritorio', d.escritorioId, 'Escritório') },
    beforeUpdate: async (d, req) => { await assertNoTenant(tid(req), 'jurEscritorio', d.escritorioId, 'Escritório') } })

  // ---- processos: lista e detalhe (com restrição de sigilo, máscara e log de acesso)
  mountLista(router, {
    model: 'jurProcesso', path: '/processos', search: ['numeroCnj', 'assunto', 'vara', 'causaRaiz', 'resumo'],
    filters: ['area', 'status', 'risco', 'posicao', 'sofrido', 'causaRaiz', 'setorOrigem', 'advogadoId', 'escritorioId', 'resultado'], scope: restricaoProcesso,
    orderBy: [{ createdAt: 'desc' }],
  })
  router.get('/processos/:id', requireRole(...READ), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const p = await prisma.jurProcesso.findFirst({
      where: { id: String(req.params.id), tenantId: tid(req), ...restricaoProcesso(req) },
      include: { partes: true, prazos: { orderBy: { dataFatal: 'asc' } }, audiencias: { orderBy: { dataHora: 'asc' } }, andamentos: { orderBy: { data: 'desc' }, take: 50 }, provisoes: { orderBy: { data: 'desc' }, take: 20 } },
    })
    if (!p) return res.status(404).json({ error: 'Processo não encontrado.' })
    await registrarAcessoSensivel(req, { recurso: 'juridico/processos', recursoId: p.id, categoria: p.area === 'CRIMINAL' ? 'ANTECEDENTES_PENAIS' : 'DADO_JUDICIAL' })
    const adv = p.advogadoId ? await prisma.jurAdvogado.findFirst({ where: { id: p.advogadoId, tenantId: tid(req) }, select: { id: true, nome: true, oab: true } }) : null
    const esc = p.escritorioId ? await prisma.jurEscritorio.findFirst({ where: { id: p.escritorioId, tenantId: tid(req) }, select: { id: true, nome: true } }) : null
    res.json({ ...mascarar(p, req), advogado: adv, escritorio: esc })
  }))

  mountCrud(router, {
    model: 'jurProcesso', path: '/processos', read: READ, write: WRITE, modulo: 'juridico.processos', create: processoBase,
    beforeCreate: async (d, req) => {
      const tenantId = tid(req)
      const v = validarCnj(d.numeroCnj); if (!v.ok) fail(400, v.motivo!)
      validarProvisao(d.risco ?? 'POSSIVEL', d.provisaoValor)
      if (d.dataDistribuicao && d.dataDistribuicao.getTime() > Date.now() + 86_400_000) fail(400, 'Data de distribuição no futuro.')
      await assertNoTenant(tenantId, 'jurAdvogado', d.advogadoId, 'Advogado')
      await assertNoTenant(tenantId, 'jurEscritorio', d.escritorioId, 'Escritório')
      const sofrido = d.sofrido ?? ehSofrido(d.posicao)
      return { ...d, numeroCnj: v.numero, sofrido, provisaoValor: r2(d.provisaoValor ?? 0), provisaoAtualizadaEm: d.provisaoValor ? new Date() : null }
    },
    afterCreate: async (row, req) => { if (row.provisaoValor > 0) await histProvisao(row.tenantId, row.id, row.risco, row.provisaoValor, null, 'Provisão inicial', uid(req)) },
    beforeUpdate: async (d, req, cur) => {
      const tenantId = tid(req)
      if (cur.status === 'ENCERRADO') fail(409, 'Processo encerrado: reabra-o para editar.')
      if (d.numeroCnj && d.numeroCnj !== cur.numeroCnj) { const v = validarCnj(d.numeroCnj); if (!v.ok) fail(400, v.motivo!); d.numeroCnj = v.numero }
      const risco = d.risco ?? cur.risco
      const prov = d.provisaoValor !== undefined ? d.provisaoValor ?? 0 : (d.risco && d.risco !== 'PROVAVEL' && cur.provisaoValor > 0 ? 0 : cur.provisaoValor)
      validarProvisao(risco, prov)
      if (d.advogadoId) await assertNoTenant(tenantId, 'jurAdvogado', d.advogadoId, 'Advogado')
      if (d.escritorioId) await assertNoTenant(tenantId, 'jurEscritorio', d.escritorioId, 'Escritório')
      if (d.posicao && d.sofrido === undefined) d.sofrido = ehSofrido(d.posicao)
      if (risco !== cur.risco || prov !== cur.provisaoValor) { d.provisaoValor = r2(prov); d.provisaoAtualizadaEm = new Date(); (req as any)._jurProv = { de: cur.provisaoValor, riscoDe: cur.risco } }
      return d
    },
    afterUpdate: async (row, req) => {
      const prev = (req as any)._jurProv
      if (prev) await histProvisao(row.tenantId, row.id, row.risco, row.provisaoValor, prev.de, `Revisão (risco ${prev.riscoDe} -> ${row.risco})`, uid(req))
    },
  })

  // Reclassificação de risco/provisão com motivo (alimenta o Financeiro).
  router.post('/processos/:id/risco', requireRole(...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ risco: z.enum(RISCOS), provisaoValor: z.number().finite().min(0).max(1e12).optional(), motivo: z.string().min(5).max(1000) }), req.body)
    const p = await prisma.jurProcesso.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!p) return res.status(404).json({ error: 'Processo não encontrado.' })
    if (p.status === 'ENCERRADO') fail(409, 'Processo encerrado: reabra-o para reclassificar o risco.')
    const prov = b.risco === 'PROVAVEL' ? r2(b.provisaoValor ?? p.provisaoValor) : 0
    if (b.risco !== 'PROVAVEL' && (b.provisaoValor ?? 0) > 0) validarProvisao(b.risco, b.provisaoValor)
    if (b.risco === 'PROVAVEL' && prov <= 0) fail(422, 'Risco PROVÁVEL exige valor de provisão maior que zero (estimativa de perda).')
    const row = await prisma.jurProcesso.update({ where: { id: p.id }, data: { risco: b.risco, provisaoValor: prov, provisaoAtualizadaEm: new Date() } })
    await histProvisao(tenantId, p.id, b.risco, prov, p.provisaoValor, b.motivo, uid(req))
    await audit({ tenantId, userId: uid(req), modulo: 'juridico.processos', acao: 'RECLASSIFICAR_RISCO', refType: 'JurProcesso', refId: p.id, detalhes: { de: p.risco, para: b.risco, provisao: prov } })
    res.json(row)
  }))

  router.post('/processos/:id/encerrar', requireRole(...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ resultado: z.enum(['GANHO', 'PERDIDO', 'ACORDO', 'PARCIAL']), valorCondenacao: optMoney(), data: z.coerce.date().optional(), observacao: z.string().max(1000).optional() }), req.body)
    const p = await prisma.jurProcesso.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!p) return res.status(404).json({ error: 'Processo não encontrado.' })
    if (p.status === 'ENCERRADO') fail(409, 'Processo já encerrado.')
    if (b.resultado === 'ACORDO' && b.valorCondenacao == null) fail(422, 'Acordo exige o valor pago/acordado (valorCondenacao).')
    const abertos = await prisma.jurPrazo.findMany({ where: { tenantId, processoId: p.id, status: 'ABERTO' }, select: { id: true } })
    const aud = await prisma.jurAudiencia.findMany({ where: { tenantId, processoId: p.id, status: 'AGENDADA' }, select: { id: true } })
    const row = await prisma.$transaction(async (tx) => {
      await tx.jurPrazo.updateMany({ where: { id: { in: abertos.map((x) => x.id) } }, data: { status: 'CANCELADO' } })
      await tx.jurAudiencia.updateMany({ where: { id: { in: aud.map((x) => x.id) } }, data: { status: 'CANCELADA' } })
      if (p.provisaoValor > 0) await tx.jurProvisaoHist.create({ data: { tenantId, processoId: p.id, risco: p.risco, valor: 0, valorAnterior: p.provisaoValor, motivo: `Baixa da provisão por encerramento (${b.resultado})`, usuarioId: uid(req) } })
      return tx.jurProcesso.update({ where: { id: p.id }, data: { status: 'ENCERRADO', resultado: b.resultado, valorCondenacao: b.valorCondenacao ?? p.valorCondenacao, dataEncerramento: b.data ?? new Date(), provisaoValor: 0, provisaoAtualizadaEm: new Date(), resumo: b.observacao ? `${p.resumo ?? ''}\n[Encerramento] ${b.observacao}`.trim() : p.resumo } })
    })
    for (const x of abertos) await cancelarLembretes(tenantId, 'prazo', x.id)
    for (const x of aud) await cancelarLembretes(tenantId, 'audiencia', x.id)
    await audit({ tenantId, userId: uid(req), modulo: 'juridico.processos', acao: 'ENCERRAR', refType: 'JurProcesso', refId: p.id, detalhes: { resultado: b.resultado, valorCondenacao: b.valorCondenacao, prazosCancelados: abertos.length } })
    res.json(row)
  }))
  router.post('/processos/:id/reabrir', requireRole(...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ motivo: z.string().min(5).max(1000) }), req.body)
    const p = await prisma.jurProcesso.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!p) return res.status(404).json({ error: 'Processo não encontrado.' })
    if (p.status !== 'ENCERRADO' && p.status !== 'ARQUIVADO') fail(409, 'Somente processos encerrados/arquivados podem ser reabertos.')
    const row = await prisma.jurProcesso.update({ where: { id: p.id }, data: { status: 'EM_ANDAMENTO', resultado: null, dataEncerramento: null } })
    await audit({ tenantId, userId: uid(req), modulo: 'juridico.processos', acao: 'REABRIR', refType: 'JurProcesso', refId: p.id, detalhes: b })
    res.json(row)
  }))

  // ---- sub-recursos
  nested(router, { seg: 'partes', model: 'jurProcessoParte', order: { createdAt: 'asc' },
    create: z.object({ nome: z.string().min(2).max(200), documento: optStr(30), tipo: z.enum(['AUTOR', 'REU', 'TERCEIRO', 'TESTEMUNHA', 'ADVOGADO_CONTRARIO', 'PERITO', 'OUTRO']).optional(), polo: z.enum(['ATIVO', 'PASSIVO', 'OUTRO']).optional(), observacao: optStr(1000) }) })
  nested(router, { seg: 'andamentos', model: 'jurAndamento', order: { data: 'desc' },
    create: z.object({ data: z.coerce.date(), tipo: z.enum(['PETICAO', 'DECISAO', 'DESPACHO', 'SENTENCA', 'ACORDAO', 'AUDIENCIA', 'PUBLICACAO', 'RECURSO', 'OUTRO']).optional(), descricao: z.string().min(3).max(5000) }),
    antes: (d, _p, req) => { if (d.data && new Date(d.data).getTime() > Date.now() + 86_400_000) fail(400, 'Data do andamento no futuro.'); d.registradoPorId = uid(req) } })
  nested(router, { seg: 'prazos', model: 'jurPrazo', order: { dataFatal: 'asc' }, podeEscrever: naoEncerrado,
    create: z.object({ titulo: z.string().min(3).max(200), tipo: z.enum(['CONTESTACAO', 'RECURSO', 'MANIFESTACAO', 'CUMPRIMENTO', 'PAGAMENTO', 'OUTRO']).optional(), dataFatal: z.coerce.date(), fatal: z.boolean().optional(), advogadoId: z.string().uuid().nullish(), responsavelUserId: optStr(80), observacao: optStr(1000) }),
    antes: async (d, _p, req) => { if (d.advogadoId) await assertNoTenant(tid(req), 'jurAdvogado', d.advogadoId, 'Advogado') },
    depois: (row, p, reabrir) => lembretePrazo(row, p, reabrir), aoRemover: async (row) => { await cancelarLembretes(row.tenantId, 'prazo', row.id) } })
  nested(router, { seg: 'audiencias', model: 'jurAudiencia', order: { dataHora: 'asc' }, podeEscrever: naoEncerrado,
    create: z.object({ tipo: z.enum(['CONCILIACAO', 'INSTRUCAO', 'JULGAMENTO', 'UNA', 'CUSTODIA', 'OUTRA']).optional(), dataHora: z.coerce.date(), local: optStr(200), modalidade: z.enum(['PRESENCIAL', 'VIRTUAL']).optional(), prepostoNome: optStr(120), advogadoId: z.string().uuid().nullish(), observacao: optStr(1000) }),
    antes: async (d, _p, req) => { if (d.advogadoId) await assertNoTenant(tid(req), 'jurAdvogado', d.advogadoId, 'Advogado'); if (d.dataHora && d.status === undefined && new Date(d.dataHora).getTime() < Date.now() - 86_400_000) fail(422, 'Audiência agendada no passado: registre-a como realizada.') },
    depois: (row, p, reabrir) => lembreteAudiencia(row, p, reabrir), aoRemover: async (row) => { await cancelarLembretes(row.tenantId, 'audiencia', row.id) } })

  // ---- listas globais de prazos e audiências (agenda jurídica)
  const agenda = (model: 'jurPrazo' | 'jurAudiencia', campo: 'dataFatal' | 'dataHora', path: string) =>
    router.get(path, requireRole(...READ), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = tid(req)
      const { skip, take, page, pageSize } = pageParams(req.query)
      const where: any = { tenantId, processo: restricaoProcesso(req) }
      const st = qs(req.query.status); if (st) where.status = st
      const ate = qs(req.query.ateDias)
      if (ate) { if (!/^\d{1,4}$/.test(ate)) fail(400, 'ateDias inválido.'); where[campo] = { lte: new Date(Date.now() + (+ate + 1) * 86_400_000) } }
      const pid = qs(req.query.processoId); if (pid) where.processoId = pid
      const [items, total] = await Promise.all([
        (prisma as any)[model].findMany({ where, orderBy: { [campo]: 'asc' }, skip, take, include: { processo: { select: { id: true, numeroCnj: true, assunto: true, area: true } } } }),
        (prisma as any)[model].count({ where }),
      ])
      res.json({ items: items.map((r: any) => ({ ...r, alerta: alertaDe(r[campo]) })), total, page, pageSize })
    }))
  agenda('jurPrazo', 'dataFatal', '/prazos')
  agenda('jurAudiencia', 'dataHora', '/audiencias')

  const transicao = (path: string, model: 'jurPrazo' | 'jurAudiencia', tag: string, de: string, para: string, acao: string, extra?: z.ZodTypeAny) =>
    router.post(path, requireRole(...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = tid(req)
      const b: any = extra ? parseBody(extra, req.body) : {}
      const cur = await (prisma as any)[model].findFirst({ where: { id: String(req.params.subId), tenantId } })
      if (!cur) return res.status(404).json({ error: 'Registro não encontrado.' })
      const p = await processoAcessivel(req, cur.processoId); if (!p) return res.status(404).json({ error: 'Registro não encontrado.' })
      if (cur.status !== de) fail(409, `Só é possível a partir do status ${de} (atual: ${cur.status}).`)
      const data: any = { status: para, ...(model === 'jurPrazo' && para === 'CUMPRIDO' ? { cumpridoEm: new Date() } : {}), ...b }
      if (b.novaDataHora) { delete data.novaDataHora; data.dataHora = b.novaDataHora; data.status = 'AGENDADA' }
      const row = await (prisma as any)[model].update({ where: { id: cur.id }, data })
      if (data.status === 'AGENDADA') await lembreteAudiencia(row, p, true)
      else await cancelarLembretes(tenantId, tag, cur.id)
      await audit({ tenantId, userId: uid(req), modulo: `juridico.${tag}s`, acao, refType: model, refId: cur.id })
      res.json(row)
    }))
  transicao('/prazos/:subId/cumprir', 'jurPrazo', 'prazo', 'ABERTO', 'CUMPRIDO', 'CUMPRIR', z.object({ observacao: z.string().max(1000).optional() }))
  transicao('/prazos/:subId/perdido', 'jurPrazo', 'prazo', 'ABERTO', 'PERDIDO', 'MARCAR_PERDIDO', z.object({ observacao: z.string().min(5).max(1000) }))
  transicao('/prazos/:subId/cancelar', 'jurPrazo', 'prazo', 'ABERTO', 'CANCELADO', 'CANCELAR')
  transicao('/audiencias/:subId/realizar', 'jurAudiencia', 'audiencia', 'AGENDADA', 'REALIZADA', 'REALIZAR', z.object({ resultado: z.string().min(3).max(2000) }))
  transicao('/audiencias/:subId/adiar', 'jurAudiencia', 'audiencia', 'AGENDADA', 'ADIADA', 'ADIAR', z.object({ novaDataHora: z.coerce.date(), observacao: z.string().max(1000).optional() }))
  transicao('/audiencias/:subId/cancelar', 'jurAudiencia', 'audiencia', 'AGENDADA', 'CANCELADA', 'CANCELAR')
  void diasAte
}
