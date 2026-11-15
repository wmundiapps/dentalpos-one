import type { Router } from 'express'
import {
  CONTADORES, INTERNO, asArray, brl, dataBr, dataIso, dataOpt, emailOpt, esc, exigir, getCfg, hojeMeioDia, httpError, paginaHtml, pageParams, parseBody, prisma, qs, restrito, tid, txt, txtOpt, uid, z,
} from './common'
import { asyncHandler, auditar, nomesDeUsuarios } from './host'
import { comNumero, valorVigente } from './calculos'
import { documentoValido, formatarDocumento, limparDocumento, tipoPorDocumento } from './documento'
import { provedorAssinatura } from './provedores'
import { REGIMES } from './clientes'

export const ETAPAS = ['LEAD', 'PROPOSTA', 'CONTRATO', 'ATIVO', 'PERDIDO'] as const
const escopoSchema = z.array(z.object({ servico: txt(120).pipe(z.string().min(2)), descricao: txtOpt(400) })).max(40)
const INDICES = ['IPCA', 'IGP-M', 'INPC', 'SALARIO_MINIMO', 'FIXO']

const lead = z.object({
  nome: txt(160).pipe(z.string().min(2)), tipo: z.enum(['PF', 'PJ']).default('PJ'), documento: z.string().trim().max(22).optional().nullable().or(z.literal('').transform(() => null)),
  email: emailOpt, telefone: txtOpt(30), origem: txtOpt(60), segmento: txtOpt(60), valorEstimado: z.number().min(0).max(10_000_000).optional().nullable(),
  responsavelId: z.string().max(80).optional().nullable(), proximoContato: dataOpt, observacoes: txtOpt(2000),
})

async function leadOuErro(req: any, id: string) {
  const l = await prisma.ctbLead.findFirst({ where: { id: String(id), tenantId: tid(req), ...(restrito(req) ? { responsavelId: uid(req) } : {}) } })
  if (!l) throw httpError(404, 'Lead não encontrado.')
  return l
}

export function registrarFunil(router: Router) {
  // ============ leads / kanban ============
  router.get('/funil', exigir(CONTADORES), asyncHandler(async (req, res) => {
    const tenantId = tid(req)
    const where: any = { tenantId, ...(restrito(req) ? { responsavelId: uid(req) } : {}) }
    const leads = await prisma.ctbLead.findMany({ where, orderBy: { updatedAt: 'desc' }, take: 1000 })
    const props = await prisma.ctbProposta.findMany({ where: { tenantId, leadId: { in: leads.map((l) => l.id) } }, select: { leadId: true, status: true, valorMensal: true, numero: true } })
    const nomes = await nomesDeUsuarios(tenantId, leads.map((l) => l.responsavelId))
    const colunas = ETAPAS.map((etapa) => {
      const ls = leads.filter((l) => l.etapa === etapa)
      return { etapa, total: ls.length, valor: ls.reduce((s, l) => s + (l.valorEstimado ?? 0), 0), leads: ls.map((l) => ({ ...l, responsavelNome: l.responsavelId ? nomes.get(l.responsavelId) ?? null : null, propostas: props.filter((p) => p.leadId === l.id) })) }
    })
    const n = (e: string) => leads.filter((l) => l.etapa === e).length
    const alcancouProposta = n('PROPOSTA') + n('CONTRATO') + n('ATIVO'), alcancouContrato = n('CONTRATO') + n('ATIVO')
    const total = leads.length
    res.json({
      colunas, total,
      conversao: { leadParaProposta: total ? Math.round((alcancouProposta / total) * 1000) / 10 : 0, propostaParaContrato: alcancouProposta ? Math.round((alcancouContrato / alcancouProposta) * 1000) / 10 : 0, leadParaAtivo: total ? Math.round((n('ATIVO') / total) * 1000) / 10 : 0 },
    })
  }))

  router.get('/leads', exigir(CONTADORES), asyncHandler(async (req, res) => {
    const { page, pageSize, skip, take } = pageParams(req.query)
    const where: any = { tenantId: tid(req), ...(restrito(req) ? { responsavelId: uid(req) } : {}) }
    if (qs(req.query.etapa)) where.etapa = qs(req.query.etapa)
    if (qs(req.query.q)) where.nome = { contains: qs(req.query.q), mode: 'insensitive' }
    const [total, items] = await Promise.all([prisma.ctbLead.count({ where }), prisma.ctbLead.findMany({ where, orderBy: { updatedAt: 'desc' }, skip, take })])
    res.json({ items, total, page, pageSize })
  }))

  router.post('/leads', exigir(CONTADORES), asyncHandler(async (req, res) => {
    const d = parseBody(lead, req.body)
    if (d.documento && !documentoValido(d.documento, d.tipo)) throw httpError(400, d.tipo === 'PF' ? 'CPF inválido.' : 'CNPJ inválido.')
    const l = await prisma.ctbLead.create({ data: { ...(d as any), tenantId: tid(req), documento: d.documento ? limparDocumento(d.documento) : null, responsavelId: d.responsavelId ?? (restrito(req) ? uid(req) : null) } })
    await auditar(req, 'LEAD_CRIADO', 'CtbLead', l.id)
    res.status(201).json(l)
  }))

  router.put('/leads/:id', exigir(CONTADORES), asyncHandler(async (req, res) => {
    const atual = await leadOuErro(req, String(req.params.id))
    const d = parseBody(lead.partial(), req.body)
    if (d.documento && !documentoValido(d.documento, d.tipo ?? atual.tipo)) throw httpError(400, 'Documento inválido.')
    res.json(await prisma.ctbLead.update({ where: { id: atual.id }, data: { ...(d as any), ...(d.documento ? { documento: limparDocumento(d.documento) } : {}) } }))
  }))

  router.patch('/leads/:id/etapa', exigir(CONTADORES), asyncHandler(async (req, res) => {
    const atual = await leadOuErro(req, String(req.params.id))
    const d = parseBody(z.object({ etapa: z.enum(ETAPAS), motivoPerda: txtOpt(300) }), req.body)
    if (d.etapa === 'PERDIDO' && !d.motivoPerda) throw httpError(400, 'Informe o motivo da perda.')
    if (d.etapa === 'ATIVO') {
      const ok = atual.clienteId && (await prisma.ctbContrato.findFirst({ where: { tenantId: tid(req), clienteId: atual.clienteId, status: 'VIGENTE' }, select: { id: true } }))
      if (!ok) throw httpError(409, 'Para ativar, o lead precisa ter um contrato vigente (assinado). Gere a proposta, o contrato e conclua a assinatura.')
    }
    if ((d.etapa === 'CONTRATO' || d.etapa === 'PROPOSTA') && atual.etapa === 'PERDIDO') { /* reabertura permitida */ }
    const l = await prisma.ctbLead.update({ where: { id: atual.id }, data: { etapa: d.etapa, etapaEm: new Date(), motivoPerda: d.etapa === 'PERDIDO' ? d.motivoPerda : null } })
    await auditar(req, 'LEAD_ETAPA', 'CtbLead', l.id, { de: atual.etapa, para: d.etapa })
    res.json(l)
  }))

  router.post('/leads/:id/converter', exigir(CONTADORES), asyncHandler(async (req, res) => {
    const atual = await leadOuErro(req, String(req.params.id))
    if (atual.clienteId) throw httpError(409, 'Este lead já foi convertido em cliente.')
    const d = parseBody(z.object({ documento: z.string().trim().max(22).optional(), regime: z.enum(REGIMES).optional() }), req.body)
    const doc = limparDocumento(d.documento || atual.documento)
    const tipo = tipoPorDocumento(doc)
    if (!tipo || !documentoValido(doc)) throw httpError(400, 'Informe um CPF/CNPJ válido para converter o lead em cliente.')
    const tenantId = tid(req)
    if (await prisma.ctbCliente.findFirst({ where: { tenantId, documento: doc }, select: { id: true } })) throw httpError(409, 'Já existe um cliente com este CPF/CNPJ.')
    const c = await prisma.ctbCliente.create({ data: { tenantId, tipo, documento: doc, nome: atual.nome, email: atual.email, telefone: atual.telefone, origem: atual.origem, segmento: atual.segmento, regime: d.regime ?? (tipo === 'PF' ? 'PF' : null), status: 'PROSPECTO', responsavelId: atual.responsavelId, criadoPorId: uid(req) } })
    const l = await prisma.ctbLead.update({ where: { id: atual.id }, data: { clienteId: c.id, documento: doc, tipo } })
    await auditar(req, 'LEAD_CONVERTIDO', 'CtbLead', l.id, { clienteId: c.id })
    res.status(201).json({ lead: l, cliente: { id: c.id, nome: c.nome } })
  }))

  router.delete('/leads/:id', exigir(CONTADORES), asyncHandler(async (req, res) => {
    const l = await leadOuErro(req, String(req.params.id))
    if (l.clienteId) throw httpError(409, 'Lead convertido não pode ser excluído (marque como perdido, se for o caso).')
    await prisma.ctbProposta.deleteMany({ where: { tenantId: tid(req), leadId: l.id, status: 'RASCUNHO' } })
    await prisma.ctbLead.delete({ where: { id: l.id } })
    res.status(204).end()
  }))

  // ============ propostas ============
  const proposta = z.object({
    leadId: z.string().max(80).optional().nullable(), clienteId: z.string().max(80).optional().nullable(), titulo: txt(160).pipe(z.string().min(2)),
    valorMensal: z.number().positive().max(10_000_000), escopo: escopoSchema.default([]), validadeAte: dataOpt, reajusteIndice: z.enum(INDICES as [string, ...string[]]).default('IPCA'), observacoes: txtOpt(3000),
  })

  router.get('/propostas', exigir(CONTADORES), asyncHandler(async (req, res) => {
    const { page, pageSize, skip, take } = pageParams(req.query)
    const where: any = { tenantId: tid(req) }
    if (qs(req.query.status)) where.status = qs(req.query.status)
    if (qs(req.query.leadId)) where.leadId = qs(req.query.leadId)
    if (qs(req.query.clienteId)) where.clienteId = qs(req.query.clienteId)
    const [total, items] = await Promise.all([prisma.ctbProposta.count({ where }), prisma.ctbProposta.findMany({ where, orderBy: { numero: 'desc' }, skip, take })])
    const leads = await prisma.ctbLead.findMany({ where: { tenantId: tid(req), id: { in: items.map((i) => i.leadId).filter(Boolean) as string[] } }, select: { id: true, nome: true } })
    const clis = await prisma.ctbCliente.findMany({ where: { tenantId: tid(req), id: { in: items.map((i) => i.clienteId).filter(Boolean) as string[] } }, select: { id: true, nome: true } })
    res.json({ items: items.map((p) => ({ ...p, destinatario: leads.find((l) => l.id === p.leadId)?.nome ?? clis.find((c) => c.id === p.clienteId)?.nome ?? null })), total, page, pageSize })
  }))

  async function destinoDaProposta(tenantId: string, d: { leadId?: string | null; clienteId?: string | null }, req: any) {
    if (!d.leadId && !d.clienteId) throw httpError(400, 'Informe o lead ou o cliente da proposta.')
    let leadId = d.leadId ?? null, clienteId = d.clienteId ?? null
    if (leadId) { const l = await leadOuErro(req, leadId); clienteId = clienteId ?? l.clienteId }
    if (clienteId && !(await prisma.ctbCliente.findFirst({ where: { id: clienteId, tenantId }, select: { id: true } }))) throw httpError(404, 'Cliente não encontrado.')
    return { leadId, clienteId }
  }

  router.post('/propostas', exigir(CONTADORES), asyncHandler(async (req, res) => {
    const d = parseBody(proposta, req.body)
    const tenantId = tid(req)
    const dest = await destinoDaProposta(tenantId, d, req)
    const p = await comNumero('ctbProposta', tenantId, (numero) => prisma.ctbProposta.create({ data: { ...(d as any), ...dest, tenantId, numero, criadoPorId: uid(req) } }))
    if (dest.leadId) await prisma.ctbLead.updateMany({ where: { id: dest.leadId, tenantId, etapa: 'LEAD' }, data: { etapa: 'PROPOSTA', etapaEm: new Date() } })
    await auditar(req, 'PROPOSTA_CRIADA', 'CtbProposta', p.id, { numero: p.numero, valorMensal: p.valorMensal })
    res.status(201).json(p)
  }))

  router.get('/propostas/:id', exigir(CONTADORES), asyncHandler(async (req, res) => {
    const p = await prisma.ctbProposta.findFirst({ where: { id: String(req.params.id), tenantId: tid(req) } })
    if (!p) throw httpError(404, 'Proposta não encontrada.')
    res.json(p)
  }))

  router.put('/propostas/:id', exigir(CONTADORES), asyncHandler(async (req, res) => {
    const p = await prisma.ctbProposta.findFirst({ where: { id: String(req.params.id), tenantId: tid(req) } })
    if (!p) throw httpError(404, 'Proposta não encontrada.')
    if (!['RASCUNHO', 'ENVIADA'].includes(p.status)) throw httpError(409, 'Proposta já decidida não pode ser editada.')
    const d = parseBody(proposta.partial(), req.body)
    res.json(await prisma.ctbProposta.update({ where: { id: p.id }, data: d as any }))
  }))

  router.patch('/propostas/:id/status', exigir(CONTADORES), asyncHandler(async (req, res) => {
    const p = await prisma.ctbProposta.findFirst({ where: { id: String(req.params.id), tenantId: tid(req) } })
    if (!p) throw httpError(404, 'Proposta não encontrada.')
    const d = parseBody(z.object({ status: z.enum(['ENVIADA', 'ACEITA', 'RECUSADA', 'EXPIRADA']) }), req.body)
    const ok: Record<string, string[]> = { RASCUNHO: ['ENVIADA'], ENVIADA: ['ACEITA', 'RECUSADA', 'EXPIRADA'] }
    if (!(ok[p.status] || []).includes(d.status)) throw httpError(409, `Transição inválida: ${p.status} → ${d.status}.`)
    const r = await prisma.ctbProposta.update({ where: { id: p.id }, data: { status: d.status, ...(d.status === 'ENVIADA' ? { enviadaEm: new Date() } : { decididaEm: new Date() }) } })
    await auditar(req, 'PROPOSTA_STATUS', 'CtbProposta', p.id, { de: p.status, para: d.status })
    // "ENVIADA" apenas registra o envio feito pelo escritório (o sistema não envia a proposta sozinho: use Imprimir/PDF ou o e-mail do escritório).
    res.json({ ...r, aviso: d.status === 'ENVIADA' ? 'Registrada como enviada. O sistema não dispara e-mail real: envie o documento impresso/PDF pelo seu canal.' : undefined })
  }))

  router.get('/propostas/:id/imprimir', exigir(CONTADORES), asyncHandler(async (req, res) => {
    const tenantId = tid(req)
    const p = await prisma.ctbProposta.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!p) throw httpError(404, 'Proposta não encontrada.')
    const [cfg, l, c] = await Promise.all([getCfg(tenantId), p.leadId ? prisma.ctbLead.findFirst({ where: { id: p.leadId, tenantId } }) : null, p.clienteId ? prisma.ctbCliente.findFirst({ where: { id: p.clienteId, tenantId } }) : null])
    const dest = c?.nome ?? l?.nome ?? '—'
    const escopo = asArray<{ servico: string; descricao?: string }>(p.escopo)
    res.type('html').send(paginaHtml(`Proposta ${p.numero}`, `
      <h1>Proposta de honorários nº ${p.numero}</h1><small>${esc(cfg.nomeEscritorio)} · emitida em ${dataBr(p.createdAt)}${p.validadeAte ? ` · válida até ${dataBr(p.validadeAte)}` : ''}</small>
      <h2>${esc(p.titulo)}</h2><p><b>Para:</b> ${esc(dest)}${c?.documento ? ` · ${esc(formatarDocumento(c.documento))}` : ''}</p>
      <h2>Escopo dos serviços</h2>${escopo.length ? `<table><tr><th>Serviço</th><th>Descrição</th></tr>${escopo.map((e) => `<tr><td>${esc(e.servico)}</td><td>${esc(e.descricao || '')}</td></tr>`).join('')}</table>` : '<p>Escopo a definir.</p>'}
      <h2>Honorários</h2><p>Valor mensal: <b>${brl(p.valorMensal)}</b> · reajuste anual pelo índice: ${esc(p.reajusteIndice)}.</p>
      ${p.observacoes ? `<h2>Observações</h2><p>${esc(p.observacoes)}</p>` : ''}
      <p><small>Proposta comercial. Não constitui contrato até a assinatura do instrumento. Valores estimados, sujeitos a revisão conforme o enquadramento real do cliente.</small></p>`))
  }))

  router.post('/propostas/:id/gerar-contrato', exigir(CONTADORES), asyncHandler(async (req, res) => {
    const tenantId = tid(req)
    const p = await prisma.ctbProposta.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!p) throw httpError(404, 'Proposta não encontrada.')
    if (p.status !== 'ACEITA') throw httpError(409, 'Só é possível gerar contrato de uma proposta ACEITA.')
    let clienteId = p.clienteId
    if (!clienteId && p.leadId) { clienteId = (await prisma.ctbLead.findFirst({ where: { id: p.leadId, tenantId }, select: { clienteId: true } }))?.clienteId ?? null; if (clienteId) await prisma.ctbProposta.update({ where: { id: p.id }, data: { clienteId } }) }
    if (!clienteId) throw httpError(409, 'Converta o lead em cliente (informe o CPF/CNPJ) antes de gerar o contrato.')
    if (await prisma.ctbContrato.findFirst({ where: { tenantId, propostaId: p.id }, select: { id: true } })) throw httpError(409, 'Esta proposta já gerou um contrato.')
    const d = parseBody(z.object({ inicio: dataOpt, fim: dataOpt, diaVencimento: z.number().int().min(1).max(28).default(10), reajusteMes: z.number().int().min(1).max(12).optional().nullable(), reajustePercentual: z.number().min(0).max(100).optional().nullable() }), req.body)
    const inicio = d.inicio ?? hojeMeioDia()
    const c = await comNumero('ctbContrato', tenantId, (numero) => prisma.ctbContrato.create({
      data: { tenantId, numero, clienteId, propostaId: p.id, valorMensal: p.valorMensal, escopo: p.escopo as any, inicio, fim: d.fim ?? null, diaVencimento: d.diaVencimento, reajusteMes: d.reajusteMes ?? inicio.getUTCMonth() + 1, reajusteIndice: p.reajusteIndice, reajustePercentual: d.reajustePercentual ?? null, criadoPorId: uid(req) },
    }))
    if (p.leadId) await prisma.ctbLead.updateMany({ where: { id: p.leadId, tenantId, etapa: { in: ['LEAD', 'PROPOSTA'] } }, data: { etapa: 'CONTRATO', etapaEm: new Date() } })
    await auditar(req, 'CONTRATO_GERADO', 'CtbContrato', c.id, { propostaId: p.id, numero: c.numero })
    res.status(201).json(c)
  }))

  // ============ contratos ============
  const contrato = z.object({
    clienteId: z.string().max(80), valorMensal: z.number().positive().max(10_000_000), escopo: escopoSchema.default([]), inicio: dataIso, fim: dataOpt,
    diaVencimento: z.number().int().min(1).max(28).default(10), reajusteMes: z.number().int().min(1).max(12).optional().nullable(), reajusteIndice: z.enum(INDICES as [string, ...string[]]).default('IPCA'),
    reajustePercentual: z.number().min(0).max(100).optional().nullable(), observacoes: txtOpt(3000),
  })

  router.get('/contratos', exigir(INTERNO), asyncHandler(async (req, res) => {
    const { page, pageSize, skip, take } = pageParams(req.query)
    const tenantId = tid(req)
    const where: any = { tenantId }
    if (qs(req.query.status)) where.status = qs(req.query.status)
    if (qs(req.query.clienteId)) where.clienteId = qs(req.query.clienteId)
    if (restrito(req)) { const ids = (await prisma.ctbCliente.findMany({ where: { tenantId, OR: [{ responsavelId: uid(req) }, { analistaId: uid(req) }] }, select: { id: true } })).map((c) => c.id); where.clienteId = qs(req.query.clienteId) && ids.includes(qs(req.query.clienteId)!) ? qs(req.query.clienteId) : { in: ids } }
    const [total, items] = await Promise.all([prisma.ctbContrato.count({ where }), prisma.ctbContrato.findMany({ where, orderBy: { numero: 'desc' }, skip, take })])
    const clis = await prisma.ctbCliente.findMany({ where: { tenantId, id: { in: items.map((i) => i.clienteId) } }, select: { id: true, nome: true } })
    const comp = hojeMeioDia().toISOString().slice(0, 7)
    res.json({ items: items.map((c) => ({ ...c, clienteNome: clis.find((x) => x.id === c.clienteId)?.nome ?? null, valorAtual: valorVigente(c, comp) })), total, page, pageSize })
  }))

  async function contratoOuErro(req: any, id: string) {
    const c = await prisma.ctbContrato.findFirst({ where: { id: String(id), tenantId: tid(req) } })
    if (!c) throw httpError(404, 'Contrato não encontrado.')
    if (restrito(req) && !(await prisma.ctbCliente.findFirst({ where: { id: c.clienteId, tenantId: tid(req), OR: [{ responsavelId: uid(req) }, { analistaId: uid(req) }] }, select: { id: true } }))) throw httpError(404, 'Contrato não encontrado.')
    return c
  }

  router.post('/contratos', exigir(CONTADORES), asyncHandler(async (req, res) => {
    const d = parseBody(contrato, req.body)
    const tenantId = tid(req)
    if (!(await prisma.ctbCliente.findFirst({ where: { id: d.clienteId, tenantId, ...(restrito(req) ? { OR: [{ responsavelId: uid(req) }, { analistaId: uid(req) }] } : {}) }, select: { id: true } }))) throw httpError(404, 'Cliente não encontrado.')
    if (d.fim && d.fim < d.inicio) throw httpError(400, 'O fim da vigência deve ser posterior ao início.')
    const c = await comNumero('ctbContrato', tenantId, (numero) => prisma.ctbContrato.create({ data: { ...(d as any), tenantId, numero, reajusteMes: d.reajusteMes ?? d.inicio.getUTCMonth() + 1, criadoPorId: uid(req) } }))
    await auditar(req, 'CONTRATO_CRIADO', 'CtbContrato', c.id, { numero: c.numero, valorMensal: c.valorMensal })
    res.status(201).json(c)
  }))

  router.get('/contratos/:id', exigir(INTERNO), asyncHandler(async (req, res) => {
    const c = await contratoOuErro(req, String(req.params.id))
    res.json({ ...c, valorAtual: valorVigente(c, hojeMeioDia().toISOString().slice(0, 7)), provedorAssinatura: { nome: provedorAssinatura().nome, simulado: provedorAssinatura().simulado } })
  }))

  router.put('/contratos/:id', exigir(CONTADORES), asyncHandler(async (req, res) => {
    const c = await contratoOuErro(req, String(req.params.id))
    const d = parseBody(contrato.partial(), req.body)
    if (c.status === 'RASCUNHO') {
      if (d.clienteId && d.clienteId !== c.clienteId) throw httpError(400, 'Não é possível trocar o cliente do contrato.')
      res.json(await prisma.ctbContrato.update({ where: { id: c.id }, data: d as any }))
    } else if (c.status === 'VIGENTE') {
      // vigente: só condições operacionais (reajuste, vencimento, fim, observações); valor e escopo mudam por aditivo (novo contrato).
      const permitido: any = {}
      for (const k of ['diaVencimento', 'reajusteMes', 'reajusteIndice', 'reajustePercentual', 'fim', 'observacoes'] as const) if ((d as any)[k] !== undefined) permitido[k] = (d as any)[k]
      if (Object.keys(d).some((k) => !(k in permitido))) throw httpError(409, 'Contrato vigente: valor, escopo e início só mudam por aditivo (encerre e crie um novo contrato).')
      res.json(await prisma.ctbContrato.update({ where: { id: c.id }, data: permitido }))
    } else throw httpError(409, 'Contrato neste status não pode ser editado.')
    await auditar(req, 'CONTRATO_ATUALIZADO', 'CtbContrato', c.id, { campos: Object.keys(d) })
  }))

  router.post('/contratos/:id/enviar-assinatura', exigir(CONTADORES), asyncHandler(async (req, res) => {
    const c = await contratoOuErro(req, String(req.params.id))
    if (c.status !== 'RASCUNHO') throw httpError(409, 'Só contrato em rascunho segue para assinatura.')
    const r = await prisma.ctbContrato.update({ where: { id: c.id }, data: { status: 'AGUARDANDO_ASSINATURA' } })
    await auditar(req, 'CONTRATO_ENVIADO_ASSINATURA', 'CtbContrato', c.id)
    res.json({ ...r, simulado: provedorAssinatura().simulado, aviso: provedorAssinatura().simulado ? 'Assinatura SIMULADA: nenhuma solicitação foi enviada a um provedor real; use o botão de assinar para registrar o aceite de teste.' : undefined })
  }))

  router.post('/contratos/:id/assinar', exigir(CONTADORES), asyncHandler(async (req, res) => {
    const c = await contratoOuErro(req, String(req.params.id))
    const tenantId = tid(req)
    if (c.status !== 'AGUARDANDO_ASSINATURA') throw httpError(409, 'O contrato precisa estar aguardando assinatura.')
    const d = parseBody(z.object({ parte: z.enum(['ESCRITORIO', 'CLIENTE']), nome: txt(120).pipe(z.string().min(2)) }), req.body)
    const lista = asArray<any>(c.assinaturas)
    if (lista.some((a) => a.parte === d.parte)) throw httpError(409, 'Esta parte já assinou.')
    const ass = await provedorAssinatura().assinar({ tenantId, contratoId: c.id, parte: d.parte, nome: d.nome, resumo: `${c.numero}|${c.valorMensal}|${c.inicio.toISOString()}` })
    const novas = [...lista, ass]
    const completo = ['ESCRITORIO', 'CLIENTE'].every((p) => novas.some((a) => a.parte === p))
    if (completo && (await prisma.ctbContrato.findFirst({ where: { tenantId, clienteId: c.clienteId, status: 'VIGENTE', id: { not: c.id } }, select: { id: true } }))) throw httpError(409, 'O cliente já tem outro contrato vigente. Encerre-o antes de ativar este.')
    const r = await prisma.ctbContrato.update({ where: { id: c.id }, data: { assinaturas: novas as any, ...(completo ? { status: 'VIGENTE', assinadoEm: new Date() } : {}) } })
    if (completo) {
      await prisma.ctbCliente.updateMany({ where: { id: c.clienteId, tenantId, status: 'PROSPECTO' }, data: { status: 'ATIVO', inicioRelacionamento: hojeMeioDia() } })
      await prisma.ctbLead.updateMany({ where: { tenantId, clienteId: c.clienteId, etapa: { in: ['LEAD', 'PROPOSTA', 'CONTRATO'] } }, data: { etapa: 'ATIVO', etapaEm: new Date() } })
    }
    await auditar(req, 'CONTRATO_ASSINADO_SIMULADO', 'CtbContrato', c.id, { parte: d.parte, completo })
    res.json({ ...r, simulado: ass.simulada, aviso: ass.simulada ? 'Assinatura SIMULADA: sem valor jurídico. Integre um provedor de assinatura eletrônica real (interface ProvedorAssinatura).' : undefined })
  }))

  router.post('/contratos/:id/encerrar', exigir(CONTADORES), asyncHandler(async (req, res) => {
    const c = await contratoOuErro(req, String(req.params.id))
    const d = parseBody(z.object({ fim: dataOpt, motivo: txt(300).pipe(z.string().min(3)) }), req.body)
    if (!['VIGENTE', 'AGUARDANDO_ASSINATURA', 'RASCUNHO'].includes(c.status)) throw httpError(409, 'Contrato já encerrado.')
    const r = await prisma.ctbContrato.update({ where: { id: c.id }, data: { status: c.status === 'VIGENTE' ? 'ENCERRADO' : 'CANCELADO', fim: d.fim ?? hojeMeioDia(), observacoes: `${c.observacoes ? c.observacoes + '\n' : ''}Encerrado: ${d.motivo}` } })
    await auditar(req, 'CONTRATO_ENCERRADO', 'CtbContrato', c.id, { motivo: d.motivo })
    res.json(r)
  }))

  router.get('/contratos/:id/imprimir', exigir(INTERNO), asyncHandler(async (req, res) => {
    const tenantId = tid(req)
    const c = await contratoOuErro(req, String(req.params.id))
    const [cfg, cli] = await Promise.all([getCfg(tenantId), prisma.ctbCliente.findFirst({ where: { id: c.clienteId, tenantId } })])
    const escopo = asArray<{ servico: string; descricao?: string }>(c.escopo)
    const ass = asArray<any>(c.assinaturas)
    res.type('html').send(paginaHtml(`Contrato ${c.numero}`, `
      <h1>Contrato de prestação de serviços contábeis nº ${c.numero}</h1>
      <p><span class="sim">MODELO GENÉRICO — revise com assessoria jurídica antes de usar</span></p>
      <p><b>Contratada:</b> ${esc(cfg.nomeEscritorio)}<br><b>Contratante:</b> ${esc(cli?.nome ?? '—')}${cli?.documento ? ` · ${esc(formatarDocumento(cli.documento))}` : ''}</p>
      <h2>1. Objeto e escopo</h2>${escopo.length ? `<table><tr><th>Serviço</th><th>Descrição</th></tr>${escopo.map((e) => `<tr><td>${esc(e.servico)}</td><td>${esc(e.descricao || '')}</td></tr>`).join('')}</table>` : '<p>Conforme proposta comercial.</p>'}
      <h2>2. Honorários</h2><p>Valor mensal: <b>${brl(c.valorMensal)}</b>, com vencimento todo dia <b>${c.diaVencimento}</b>. Reajuste anual em ${c.reajusteMes ? `mês ${c.reajusteMes}` : 'data a definir'} pelo índice ${esc(c.reajusteIndice)}${c.reajustePercentual ? ` (simulação: ${c.reajustePercentual}% ao ano)` : ''}.</p>
      <h2>3. Vigência</h2><p>Início em ${dataBr(c.inicio)}${c.fim ? ` e término em ${dataBr(c.fim)}` : ', por prazo indeterminado'}.</p>
      ${c.observacoes ? `<h2>4. Observações</h2><p>${esc(c.observacoes)}</p>` : ''}
      <h2>Assinaturas <span class="sim">SIMULADAS</span></h2>
      ${ass.length ? `<table><tr><th>Parte</th><th>Nome</th><th>Data</th><th>Hash</th></tr>${ass.map((a) => `<tr><td>${esc(a.parte)}</td><td>${esc(a.nome)}</td><td>${esc(new Date(a.em).toLocaleString('pt-BR'))}</td><td style="font-size:10px">${esc(String(a.hash).slice(0, 24))}…</td></tr>`).join('')}</table>` : '<p>Sem assinaturas registradas.</p>'}
      <p><small>As assinaturas acima foram registradas por um provedor SIMULADO e não têm valor jurídico. Para validade, colete assinatura por meio de um provedor de assinatura eletrônica real.</small></p>`))
  }))
}
