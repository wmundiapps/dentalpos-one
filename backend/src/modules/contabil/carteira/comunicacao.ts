import type { Router } from 'express'
import {
  CONTADORES, EQUIPE, INTERNO, brl, clienteOuErro, compAtual, dataBr, dataOpt, exigir, getCfg, hojeMeioDia, httpError, idsVisiveis, pageParams, parseBody, prisma, qs, tid, txt, txtOpt, uid, z,
} from './common'
import { asyncHandler, auditar, nomesDeUsuarios } from './host'
import { formatarDocumento } from './documento'
import { valorVigente } from './calculos'
import { provedorMensagem } from './provedores'

export const TIPOS_INTERACAO = ['LIGACAO', 'EMAIL', 'REUNIAO', 'WHATSAPP', 'NOTA'] as const
export const VARIAVEIS = ['cliente', 'nome_fantasia', 'documento', 'responsavel', 'contato', 'competencia', 'valor_honorario', 'vencimento', 'escritorio', 'data_hoje']

async function contextoVariaveis(tenantId: string, c: any, extras: Record<string, string> = {}) {
  const [cfg, contato, contrato, hon, nomes] = await Promise.all([
    getCfg(tenantId),
    prisma.ctbContato.findFirst({ where: { tenantId, clienteId: c.id }, orderBy: [{ principal: 'desc' }, { createdAt: 'asc' }] }),
    prisma.ctbContrato.findFirst({ where: { tenantId, clienteId: c.id, status: 'VIGENTE' }, orderBy: { inicio: 'desc' } }),
    prisma.ctbHonorario.findFirst({ where: { tenantId, clienteId: c.id, status: 'ABERTO' }, orderBy: { vencimento: 'asc' } }),
    nomesDeUsuarios(tenantId, [c.responsavelId]),
  ])
  const v: Record<string, string> = {
    cliente: c.nome, nome_fantasia: c.nomeFantasia || c.nome, documento: c.documento ? formatarDocumento(c.documento) : '', responsavel: c.responsavelId ? nomes.get(c.responsavelId) ?? '' : '',
    contato: contato?.nome ?? c.nome, competencia: hon?.competencia ?? compAtual(), valor_honorario: hon ? brl(hon.valor) : contrato ? brl(valorVigente(contrato, compAtual())) : '', vencimento: hon ? dataBr(hon.vencimento) : '',
    escritorio: cfg.nomeEscritorio, data_hoje: dataBr(hojeMeioDia()), ...extras,
  }
  return { v, contato }
}
/** Substitui {{variavel}} e informa as que não existem (ficam vazias). */
export function renderizarTexto(texto: string, vars: Record<string, string>) {
  const desconhecidas = new Set<string>()
  const out = texto.replace(/\{\{\s*([a-zA-Z_]\w*)\s*\}\}/g, (_m, k: string) => { if (k in vars) return vars[k]; desconhecidas.add(k); return '' })
  return { texto: out, desconhecidas: [...desconhecidas] }
}

export function registrarComunicacao(router: Router) {
  // ---------- interações ----------
  router.get('/clientes/:id/interacoes', exigir(INTERNO), asyncHandler(async (req, res) => {
    const c = await clienteOuErro(req, String(req.params.id))
    const tenantId = tid(req)
    const { page, pageSize, skip, take } = pageParams(req.query)
    const where = { tenantId, clienteId: c.id }
    const [total, rows] = await Promise.all([prisma.ctbInteracao.count({ where }), prisma.ctbInteracao.findMany({ where, orderBy: { em: 'desc' }, skip, take })])
    const nomes = await nomesDeUsuarios(tenantId, rows.map((r) => r.userId))
    res.json({ items: rows.map((r) => ({ ...r, userNome: r.userId ? nomes.get(r.userId) ?? null : null })), total, page, pageSize })
  }))

  router.post('/clientes/:id/interacoes', exigir(EQUIPE), asyncHandler(async (req, res) => {
    const c = await clienteOuErro(req, String(req.params.id))
    const d = parseBody(z.object({ tipo: z.enum(TIPOS_INTERACAO), direcao: z.enum(['ENTRADA', 'SAIDA']).default('SAIDA'), assunto: txtOpt(160), resumo: txtOpt(3000), em: dataOpt, lembreteEm: dataOpt }), req.body)
    if (!d.assunto && !d.resumo) throw httpError(400, 'Informe o assunto ou o resumo da interação.')
    const r = await prisma.ctbInteracao.create({ data: { ...(d as any), tenantId: tid(req), clienteId: c.id, userId: uid(req), em: d.em ?? new Date(), simulada: false } })
    res.status(201).json(r)
  }))

  router.patch('/interacoes/:id/lembrete-feito', exigir(EQUIPE), asyncHandler(async (req, res) => {
    const ids = await idsVisiveis(req)
    const r = await prisma.ctbInteracao.updateMany({ where: { id: String(req.params.id), tenantId: tid(req), ...(ids ? { clienteId: { in: ids } } : {}) }, data: { lembreteFeito: true } })
    if (!r.count) throw httpError(404, 'Interação não encontrada.')
    res.json({ ok: true })
  }))

  // ---------- modelos de mensagem ----------
  const modelo = z.object({ nome: txt(100).pipe(z.string().min(2)), canal: z.enum(['EMAIL', 'WHATSAPP']).default('EMAIL'), assunto: txtOpt(160), corpo: txt(5000).pipe(z.string().min(3)), ativo: z.boolean().default(true) })
  router.get('/modelos-msg', exigir(INTERNO), asyncHandler(async (req, res) => {
    res.json({ items: await prisma.ctbModeloMsg.findMany({ where: { tenantId: tid(req) }, orderBy: { nome: 'asc' } }), variaveis: VARIAVEIS })
  }))
  router.post('/modelos-msg', exigir(CONTADORES), asyncHandler(async (req, res) => res.status(201).json(await prisma.ctbModeloMsg.create({ data: { ...(parseBody(modelo, req.body) as any), tenantId: tid(req) } }))))
  router.put('/modelos-msg/:id', exigir(CONTADORES), asyncHandler(async (req, res) => {
    const a = await prisma.ctbModeloMsg.findFirst({ where: { id: String(req.params.id), tenantId: tid(req) } })
    if (!a) throw httpError(404, 'Modelo não encontrado.')
    res.json(await prisma.ctbModeloMsg.update({ where: { id: a.id }, data: parseBody(modelo.partial(), req.body) as any }))
  }))
  router.delete('/modelos-msg/:id', exigir(CONTADORES), asyncHandler(async (req, res) => {
    const r = await prisma.ctbModeloMsg.deleteMany({ where: { id: String(req.params.id), tenantId: tid(req) } })
    if (!r.count) throw httpError(404, 'Modelo não encontrado.')
    res.status(204).end()
  }))

  const envio = z.object({ modeloId: z.string().max(80).optional(), canal: z.enum(['EMAIL', 'WHATSAPP']).optional(), assunto: txtOpt(160), corpo: txt(5000).optional(), extras: z.record(z.string().max(500)).default({}), prever: z.boolean().default(false) })
  router.post('/clientes/:id/enviar', exigir(EQUIPE), asyncHandler(async (req, res) => {
    const c = await clienteOuErro(req, String(req.params.id))
    const tenantId = tid(req)
    const d = parseBody(envio, req.body)
    let canal = d.canal ?? 'EMAIL', assunto = d.assunto ?? null, corpo = d.corpo ?? ''
    if (d.modeloId) {
      const m = await prisma.ctbModeloMsg.findFirst({ where: { id: d.modeloId, tenantId, ativo: true } })
      if (!m) throw httpError(404, 'Modelo de mensagem não encontrado.')
      canal = (d.canal ?? m.canal) as any; assunto = d.assunto ?? m.assunto; corpo = d.corpo ?? m.corpo
    }
    if (!corpo.trim()) throw httpError(400, 'Informe a mensagem ou escolha um modelo.')
    const { v, contato } = await contextoVariaveis(tenantId, c, d.extras)
    const a = renderizarTexto(assunto ?? '', v), b = renderizarTexto(corpo, v)
    const destino = canal === 'EMAIL' ? contato?.email ?? c.email : contato?.whatsapp ?? contato?.telefone ?? c.telefone
    if (d.prever) return res.json({ canal, destino, assunto: a.texto, corpo: b.texto, variaveisDesconhecidas: [...a.desconhecidas, ...b.desconhecidas] })
    if (!destino) throw httpError(409, `O cliente não tem ${canal === 'EMAIL' ? 'e-mail' : 'telefone/WhatsApp'} cadastrado.`)
    const prov = provedorMensagem()
    const r = await prov.enviar({ canal, destino, assunto: a.texto, corpo: b.texto })
    const inter = await prisma.ctbInteracao.create({ data: { tenantId, clienteId: c.id, tipo: canal === 'EMAIL' ? 'EMAIL' : 'WHATSAPP', direcao: 'SAIDA', assunto: a.texto || null, resumo: b.texto.slice(0, 3000), simulada: r.simulado, userId: uid(req), em: new Date() } })
    await auditar(req, 'MENSAGEM_ENVIADA', 'CtbInteracao', inter.id, { canal, simulado: r.simulado })
    res.status(201).json({ interacao: inter, envio: r, aviso: r.aviso, variaveisDesconhecidas: [...a.desconhecidas, ...b.desconhecidas] })
  }))

  // ---------- NPS ----------
  router.post('/clientes/:id/nps', exigir(EQUIPE), asyncHandler(async (req, res) => {
    const c = await clienteOuErro(req, String(req.params.id))
    const d = parseBody(z.object({ nota: z.number().int().min(0).max(10), comentario: txtOpt(1000) }), req.body)
    res.status(201).json(await prisma.ctbNps.create({ data: { tenantId: tid(req), clienteId: c.id, nota: d.nota, comentario: d.comentario, origem: 'ESCRITORIO' } }))
  }))
  router.get('/nps/resumo', exigir(INTERNO), asyncHandler(async (req, res) => {
    res.json(await resumoNps(tid(req), await idsVisiveis(req)))
  }))
}

export async function resumoNps(tenantId: string, ids: string[] | null) {
  const desde = new Date(Date.now() - 365 * 86_400_000)
  const rows = await prisma.ctbNps.findMany({ where: { tenantId, createdAt: { gte: desde }, ...(ids ? { clienteId: { in: ids } } : {}) }, orderBy: { createdAt: 'desc' } })
  // última resposta de cada cliente
  const ult = new Map<string, (typeof rows)[number]>()
  for (const r of rows) if (!ult.has(r.clienteId)) ult.set(r.clienteId, r)
  const v = [...ult.values()]
  const prom = v.filter((x) => x.nota >= 9).length, det = v.filter((x) => x.nota <= 6).length, neu = v.length - prom - det
  return { respostas: v.length, promotores: prom, neutros: neu, detratores: det, nps: v.length ? Math.round(((prom - det) / v.length) * 100) : null, comentarios: rows.slice(0, 10).map((r) => ({ clienteId: r.clienteId, nota: r.nota, comentario: r.comentario, em: r.createdAt })) }
}
