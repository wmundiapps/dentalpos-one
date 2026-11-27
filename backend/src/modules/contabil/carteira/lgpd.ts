import type { Router } from 'express'
import { Prisma } from '@prisma/client'
import { GESTAO, INTERNO, CONTADORES, clienteOuErro, dataOpt, exigir, getCfg, hojeMeioDia, httpError, iso10, pageParams, parseBody, prisma, tid, txt, txtOpt, z } from './common'
import { anonimizarUsuarios, asyncHandler, auditar, nomesDeUsuarios } from './host'
import { BASES_LEGAIS, excluirDadosDoCliente } from './clientes'
import { formatarDocumento } from './documento'
import { registrarAcesso } from './lgpdAcesso'

const addAnos = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear() + n, d.getUTCMonth(), d.getUTCDate(), 12))

/** Quando o cliente pode ser excluído de vez: encerrado + prazo de retenção (obrigações fiscais/contábeis), ou prospecto sem movimento. */
async function elegibilidadeExclusao(tenantId: string, c: { id: string; status: string; encerradoEm: Date | null }) {
  const cfg = await getCfg(tenantId)
  const [ct, hn] = await Promise.all([prisma.ctbContrato.count({ where: { tenantId, clienteId: c.id } }), prisma.ctbHonorario.count({ where: { tenantId, clienteId: c.id } })])
  if (c.status === 'PROSPECTO' && !ct && !hn) return { elegivel: true, motivo: 'Prospecto sem contratos nem honorários.', ate: null as Date | null }
  if (c.status !== 'ENCERRADO' || !c.encerradoEm) return { elegivel: false, motivo: 'O cliente precisa estar encerrado e dentro/fora do prazo de retenção para exclusão definitiva. Enquanto isso, use a anonimização.', ate: null }
  const ate = addAnos(c.encerradoEm, cfg.retencaoAnos)
  return { elegivel: ate <= hojeMeioDia(), motivo: ate <= hojeMeioDia() ? 'Prazo de retenção cumprido.' : `Retenção obrigatória até ${iso10(ate)} (${cfg.retencaoAnos} anos após o encerramento).`, ate }
}

export function registrarLgpd(router: Router) {
  router.get('/clientes/:id/lgpd', exigir(INTERNO), asyncHandler(async (req, res) => {
    const c = await clienteOuErro(req, String(req.params.id))
    const tenantId = tid(req)
    const el = await elegibilidadeExclusao(tenantId, c)
    res.json({ baseLegal: c.baseLegal, basesLegais: BASES_LEGAIS, consentimentoEm: c.consentimentoEm, consentimentoObs: c.consentimentoObs, anonimizadoEm: c.anonimizadoEm, retencao: { anos: (await getCfg(tenantId)).retencaoAnos, exclusaoPermitida: el.elegivel, detalhe: el.motivo, ate: el.ate } })
  }))

  router.put('/clientes/:id/lgpd', exigir(CONTADORES), asyncHandler(async (req, res) => {
    const c = await clienteOuErro(req, String(req.params.id))
    if (c.anonimizadoEm) throw httpError(409, 'Cliente anonimizado.')
    const d = parseBody(z.object({ baseLegal: z.enum(BASES_LEGAIS), consentimentoEm: dataOpt, consentimentoObs: txtOpt(500) }), req.body)
    if (d.baseLegal === 'CONSENTIMENTO' && !d.consentimentoEm && !c.consentimentoEm) throw httpError(400, 'Para a base legal "consentimento", informe a data do consentimento.')
    const r = await prisma.ctbCliente.update({ where: { id: c.id }, data: { baseLegal: d.baseLegal, consentimentoEm: d.consentimentoEm ?? c.consentimentoEm, consentimentoObs: d.consentimentoObs ?? c.consentimentoObs } })
    await auditar(req, 'LGPD_BASE_LEGAL', 'CtbCliente', c.id, { baseLegal: d.baseLegal })
    res.json({ baseLegal: r.baseLegal, consentimentoEm: r.consentimentoEm, consentimentoObs: r.consentimentoObs })
  }))

  router.get('/clientes/:id/lgpd/acessos', exigir(GESTAO), asyncHandler(async (req, res) => {
    const c = await clienteOuErro(req, String(req.params.id))
    const tenantId = tid(req)
    const { page, pageSize, skip, take } = pageParams(req.query)
    const where = { tenantId, clienteId: c.id }
    const [total, rows] = await Promise.all([prisma.ctbLgpdAcesso.count({ where }), prisma.ctbLgpdAcesso.findMany({ where, orderBy: { em: 'desc' }, skip, take })])
    const nomes = await nomesDeUsuarios(tenantId, rows.map((r) => r.userId))
    res.json({ items: rows.map((r) => ({ ...r, userNome: nomes.get(r.userId) ?? null })), total, page, pageSize })
  }))

  router.get('/lgpd/acessos', exigir(GESTAO), asyncHandler(async (req, res) => {
    const tenantId = tid(req)
    const { page, pageSize, skip, take } = pageParams(req.query)
    const [total, rows] = await Promise.all([prisma.ctbLgpdAcesso.count({ where: { tenantId } }), prisma.ctbLgpdAcesso.findMany({ where: { tenantId }, orderBy: { em: 'desc' }, skip, take })])
    const [nomes, clis] = await Promise.all([nomesDeUsuarios(tenantId, rows.map((r) => r.userId)), prisma.ctbCliente.findMany({ where: { tenantId, id: { in: rows.map((r) => r.clienteId) } }, select: { id: true, nome: true } })])
    res.json({ items: rows.map((r) => ({ ...r, userNome: nomes.get(r.userId) ?? null, clienteNome: clis.find((c) => c.id === r.clienteId)?.nome ?? '(removido)' })), total, page, pageSize })
  }))

  // Direito de acesso do titular (art. 18): todos os dados que o escritório guarda sobre o cliente, em JSON.
  router.get('/clientes/:id/lgpd/exportar', exigir(GESTAO), asyncHandler(async (req, res) => {
    const c = await clienteOuErro(req, String(req.params.id))
    const tenantId = tid(req), w = { tenantId, clienteId: c.id }
    const [contatos, socios, anexos, interacoes, contratos, honorarios, guias, nps, msgs, docs, tarefas] = await Promise.all([
      prisma.ctbContato.findMany({ where: w }), prisma.ctbSocio.findMany({ where: w }), prisma.ctbCliAnexo.findMany({ where: w, select: { nome: true, mime: true, tamanho: true, categoria: true, createdAt: true } }),
      prisma.ctbInteracao.findMany({ where: w, orderBy: { em: 'desc' } }), prisma.ctbContrato.findMany({ where: w }), prisma.ctbHonorario.findMany({ where: w }), prisma.ctbCarGuia.findMany({ where: w, select: { tipo: true, competencia: true, vencimento: true, valor: true, status: true } }),
      prisma.ctbNps.findMany({ where: w }), prisma.ctbPortalMsg.findMany({ where: w, select: { autorTipo: true, texto: true, createdAt: true } }), prisma.ctbCaixaDoc.findMany({ where: w, select: { tipo: true, competencia: true, nome: true, status: true, createdAt: true } }),
      prisma.ctbTarefa.findMany({ where: w, select: { titulo: true, categoria: true, competencia: true, prazo: true, status: true } }),
    ])
    const { id: _id, tenantId: _t, ...cadastro } = c as any
    await registrarAcesso(req, c.id, 'EXPORTOU_TITULAR')
    await auditar(req, 'LGPD_EXPORTACAO_TITULAR', 'CtbCliente', c.id)
    res.setHeader('Content-Disposition', `attachment; filename="dados-titular-${c.id.slice(0, 8)}.json"`)
    res.json({
      geradoEm: new Date().toISOString(), titular: { documento: c.documento ? formatarDocumento(c.documento) : null, nome: c.nome }, cadastro, contatos, socios, anexos, interacoes, contratos, honorarios, guias, nps, mensagensPortal: msgs, documentosRecebidos: docs, tarefas,
      observacao: 'Os arquivos anexados não vão neste JSON (apenas o índice); solicite-os separadamente se necessário.',
    })
  }))

  router.post('/clientes/:id/lgpd/anonimizar', exigir(GESTAO), asyncHandler(async (req, res) => {
    const c = await clienteOuErro(req, String(req.params.id))
    if (c.anonimizadoEm) throw httpError(409, 'Cliente já anonimizado.')
    const d = parseBody(z.object({ confirmacao: z.literal('ANONIMIZAR', { errorMap: () => ({ message: 'digite ANONIMIZAR para confirmar' }) }), motivo: txt(300).pipe(z.string().min(5, 'informe o motivo')) }), req.body)
    const tenantId = tid(req), w = { tenantId, clienteId: c.id }
    const portal = await prisma.ctbPortalAcesso.findMany({ where: w, select: { userId: true } })
    const anon = `CLIENTE ANONIMIZADO ${c.id.slice(0, 6).toUpperCase()}`
    await prisma.$transaction([
      prisma.ctbCliente.update({ where: { id: c.id }, data: { nome: anon, nomeFantasia: null, documento: null, email: null, telefone: null, endereco: Prisma.DbNull, observacoes: null, tags: [], cnaesSecundarios: [], dataAbertura: null, empresaId: null, consentimentoObs: null, anonimizadoEm: new Date(), status: 'ENCERRADO', encerradoEm: c.encerradoEm ?? hojeMeioDia() } }),
      prisma.ctbContato.deleteMany({ where: w }), prisma.ctbSocio.deleteMany({ where: w }), prisma.ctbCliAnexo.deleteMany({ where: w }), prisma.ctbInteracao.deleteMany({ where: w }),
      prisma.ctbPortalMsg.deleteMany({ where: w }), prisma.ctbCaixaDoc.deleteMany({ where: w }), prisma.ctbApontamento.updateMany({ where: w, data: { descricao: null } }),
      prisma.ctbNps.updateMany({ where: w, data: { comentario: null } }), prisma.ctbPortalAcesso.updateMany({ where: w, data: { ativo: false } }),
      prisma.ctbTarefa.updateMany({ where: w, data: { observacoes: null, status: 'CANCELADA' } }), prisma.ctbCarGuia.updateMany({ where: w, data: { codigo: null } }),
      prisma.ctbLead.updateMany({ where: w, data: { nome: anon, documento: null, email: null, telefone: null, observacoes: null } }),
    ])
    // as assinaturas do contrato ficam (obrigação legal), sem o nome das pessoas
    const contratos = await prisma.ctbContrato.findMany({ where: w, select: { id: true, assinaturas: true } })
    for (const ct of contratos) await prisma.ctbContrato.update({ where: { id: ct.id }, data: { assinaturas: (Array.isArray(ct.assinaturas) ? (ct.assinaturas as any[]) : []).map((a) => ({ ...a, nome: 'anonimizado' })) as any } })
    await anonimizarUsuarios(tenantId, portal.map((p) => p.userId))
    await registrarAcesso(req, c.id, 'ANONIMIZOU', d.motivo)
    await auditar(req, 'LGPD_ANONIMIZACAO', 'CtbCliente', c.id, { motivo: d.motivo, mantido: 'contratos, honorários e guias (obrigação legal), sem dados pessoais' })
    res.json({ ok: true, anonimizadoEm: new Date(), mantido: 'Contratos, honorários e guias permanecem (obrigação legal/fiscal), sem identificação do titular.' })
  }))

  router.post('/clientes/:id/lgpd/excluir', exigir(GESTAO), asyncHandler(async (req, res) => {
    const c = await clienteOuErro(req, String(req.params.id))
    const d = parseBody(z.object({ confirmacao: z.literal('EXCLUIR', { errorMap: () => ({ message: 'digite EXCLUIR para confirmar' }) }), motivo: txt(300).pipe(z.string().min(5, 'informe o motivo')) }), req.body)
    const tenantId = tid(req)
    const el = await elegibilidadeExclusao(tenantId, c)
    if (!el.elegivel) throw httpError(409, `Exclusão definitiva não permitida: ${el.motivo} Use a anonimização para atender o titular sem perder os registros obrigatórios.`, { codigo: 'RETENCAO_ATIVA', ate: el.ate })
    await excluirDadosDoCliente(tenantId, c.id)
    await auditar(req, 'LGPD_EXCLUSAO', 'CtbCliente', c.id, { motivo: d.motivo })
    res.json({ ok: true })
  }))

  router.get('/lgpd/retencao', exigir(GESTAO), asyncHandler(async (req, res) => {
    const tenantId = tid(req)
    const cfg = await getCfg(tenantId)
    const rows = await prisma.ctbCliente.findMany({ where: { tenantId, status: 'ENCERRADO', encerradoEm: { not: null } }, select: { id: true, nome: true, encerradoEm: true, anonimizadoEm: true }, orderBy: { encerradoEm: 'asc' }, take: 500 })
    const hoje = hojeMeioDia()
    res.json({ retencaoAnos: cfg.retencaoAnos, items: rows.map((c) => { const ate = addAnos(c.encerradoEm!, cfg.retencaoAnos); return { ...c, retencaoAte: ate, podeExcluir: ate <= hoje } }) })
  }))
}
