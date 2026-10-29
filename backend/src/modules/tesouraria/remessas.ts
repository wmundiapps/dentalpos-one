import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, requireRole } from '../academico/middleware'
import { dateISO, pageParams, parseBody, qs } from '../core/crud'
import { LEITURA, OPERA, exigir2fa, httpError, log, papelDe, proximoNumero, r2, sha256, soDigitos, tid, uid } from './common'
import { ItemCnab, PagadorCnab, gerarCnab240, gerarPixLote, parseRetorno } from './cnab'
import { contaDoTenant } from './contas'
import { obterProvedor } from './provedor'
import { baixarTitulo, eventoTitulo } from './titulos'
import { hashAutorizacao } from './workflow'

const geraSchema = z.object({
  contaId: z.string().min(1),
  tipo: z.enum(['CNAB240', 'PIX_LOTE']).default('CNAB240'),
  dataPagamento: dateISO().optional(),
  tituloIds: z.array(z.string()).max(500).optional(),
})

function pagadorDe(c: any): PagadorCnab {
  const falta: string[] = []
  if (!c.bancoCodigo) falta.push('código do banco')
  if (!c.agencia) falta.push('agência')
  if (!c.numeroConta) falta.push('número da conta')
  if (!c.titularNome) falta.push('nome do titular')
  if (!soDigitos(c.titularDocumento)) falta.push('CNPJ/CPF do titular')
  if (falta.length) throw httpError(422, `Cadastro da conta pagadora incompleto: ${falta.join(', ')}.`, { code: 'CONTA_INCOMPLETA' })
  return { bancoCodigo: c.bancoCodigo, agencia: c.agencia, conta: c.numeroConta, digitoConta: c.digito ?? '', nome: c.titularNome, documento: c.titularDocumento, convenio: c.convenio ?? '' }
}

export function mountRemessas(router: Router) {
  router.get('/remessas', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const { page, pageSize, skip, take } = pageParams(req.query)
    const where: any = { tenantId }
    const status = qs(req.query.status)
    if (status) where.status = status
    const [total, rows] = await Promise.all([prisma.tesRemessa.count({ where }), prisma.tesRemessa.findMany({ where, orderBy: { numero: 'desc' }, skip, take, select: { id: true, numero: true, tipo: true, status: true, contaId: true, dataPagamento: true, nomeArquivo: true, hash: true, qtd: true, valorTotal: true, provedor: true, protocolo: true, enviadaEm: true, retornoEm: true, createdAt: true } })])
    res.json({ total, page, pageSize, items: rows })
  }))

  // Títulos prontos para remessa (autorizados, sem remessa).
  router.get('/remessas/elegiveis', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const contaId = qs(req.query.contaId)
    const rows = await prisma.tesTitulo.findMany({ where: { tenantId, status: 'AUTORIZADO', remessaId: null, ...(contaId ? { contaBancariaId: contaId } : {}), formaPagamento: { not: 'DINHEIRO' } }, orderBy: { vencimento: 'asc' }, take: 500 })
    res.json({ items: rows.map((t) => ({ ...t, integridadeOk: t.hashAutorizado === hashAutorizacao(t) })), valorTotal: r2(rows.reduce((a, t) => a + t.valorLiquido, 0)) })
  }))

  router.post('/remessas', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const d = parseBody(geraSchema, req.body)
    const conta = await contaDoTenant(tenantId, d.contaId)
    if (conta.tipo !== 'BANCO' || !conta.ativa) throw httpError(409, 'A remessa exige uma conta bancária ativa.')
    const pagador = pagadorDe(conta)
    const dataPagamento = d.dataPagamento ?? new Date()
    const where: any = { tenantId, status: 'AUTORIZADO', remessaId: null, contaBancariaId: conta.id, formaPagamento: { not: 'DINHEIRO' } }
    if (d.tipo === 'PIX_LOTE') where.formaPagamento = 'PIX'
    if (d.tituloIds?.length) where.id = { in: d.tituloIds }
    const titulos = await prisma.tesTitulo.findMany({ where, orderBy: { vencimento: 'asc' }, take: 500 })
    if (d.tituloIds?.length && titulos.length !== new Set(d.tituloIds).size) {
      const achados = new Set(titulos.map((t) => t.id))
      throw httpError(409, 'Alguns títulos não estão AUTORIZADOS, já estão em remessa, não pertencem à conta pagadora ou não são compatíveis com o tipo de arquivo.', { code: 'TITULOS_INELEGIVEIS', ids: d.tituloIds.filter((i) => !achados.has(i)) })
    }
    if (!titulos.length) throw httpError(409, 'Não há títulos autorizados elegíveis para esta conta/tipo.', { code: 'SEM_TITULOS' })
    const adulterados = titulos.filter((t) => !t.hashAutorizado || t.hashAutorizado !== hashAutorizacao(t))
    if (adulterados.length) throw httpError(409, `Integridade: ${adulterados.length} título(s) mudaram após a autorização (${adulterados.map((t) => t.numero).join(', ')}). Devolva e autorize novamente.`, { code: 'INTEGRIDADE' })

    const numero = await proximoNumero(tenantId, 'remessa')
    const itens: Array<ItemCnab & { tituloId: string }> = titulos.map((t, i) => ({
      tituloId: t.id, idPagamento: `R${String(numero).padStart(6, '0')}T${String(i + 1).padStart(4, '0')}`, formaPagamento: t.formaPagamento as any, favorecidoNome: t.fornecedor,
      favorecidoDocumento: t.fornecedorDocumento, bancoFavorecido: t.favorecidoBanco, agenciaFavorecido: t.favorecidoAgencia, contaFavorecido: t.favorecidoConta, tipoContaFavorecido: t.favorecidoTipoConta,
      chavePix: t.chavePix, tipoChavePix: t.tipoChavePix, codigoBarras: t.codigoBarras, valor: t.valorLiquido, vencimento: t.vencimento,
    }))
    let conteudo: string, nomeArquivo: string
    try {
      if (d.tipo === 'CNAB240') { conteudo = gerarCnab240(pagador, itens, dataPagamento, numero).conteudo; nomeArquivo = `PAG${soDigitos(pagador.bancoCodigo)}${String(numero).padStart(6, '0')}.REM` }
      else { conteudo = gerarPixLote(pagador, itens, dataPagamento).conteudo; nomeArquivo = `PIX${String(numero).padStart(6, '0')}.csv` }
    } catch (e: any) { throw httpError(422, e.message) }
    const valorTotal = r2(itens.reduce((a, i) => a + i.valor, 0))
    const rem = await prisma.$transaction(async (tx) => {
      // reserva atômica: só reserva títulos que continuam AUTORIZADOS e livres
      const reserva = await tx.tesTitulo.updateMany({ where: { tenantId, id: { in: titulos.map((t) => t.id) }, status: 'AUTORIZADO', remessaId: null }, data: { remessaId: 'pendente' } })
      if (reserva.count !== titulos.length) throw httpError(409, 'Algum título foi alterado por outra pessoa durante a geração. Tente novamente.')
      const r = await tx.tesRemessa.create({
        data: { tenantId, numero, tipo: d.tipo, contaId: conta.id, dataPagamento, nomeArquivo, conteudo, hash: sha256(conteudo), qtd: itens.length, valorTotal, provedor: conta.provedor, geradaPorId: uid(req), itens: { create: itens.map((i) => ({ tenantId, tituloId: i.tituloId, valor: i.valor, idPagamento: i.idPagamento })) } },
        include: { itens: true },
      })
      await tx.tesTitulo.updateMany({ where: { tenantId, id: { in: titulos.map((t) => t.id) } }, data: { remessaId: r.id } })
      for (const t of titulos) await eventoTitulo(tx, { tenantId, tituloId: t.id, acao: 'INCLUIDO_REMESSA', userId: uid(req), papel: papelDe(req), detalhe: { remessa: numero } })
      return r
    })
    await log(req, 'REMESSA_GERADA', 'TesRemessa', rem.id, { numero, tipo: d.tipo, qtd: rem.qtd, valorTotal })
    res.status(201).json(rem)
  }))

  router.get('/remessas/:id', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const r = await prisma.tesRemessa.findFirst({ where: { id: String(req.params.id), tenantId }, include: { itens: true } })
    if (!r) throw httpError(404, 'Remessa não encontrada.')
    const ts = await prisma.tesTitulo.findMany({ where: { tenantId, id: { in: r.itens.map((i) => i.tituloId) } }, select: { id: true, numero: true, fornecedor: true, status: true, formaPagamento: true, vencimento: true } })
    const m = new Map(ts.map((t) => [t.id, t]))
    res.json({ ...r, itens: r.itens.map((i) => ({ ...i, titulo: m.get(i.tituloId) ?? null })) })
  }))

  async function carregarRemessa(tenantId: string, id: string) {
    const r = await prisma.tesRemessa.findFirst({ where: { id, tenantId }, include: { itens: true } })
    if (!r) throw httpError(404, 'Remessa não encontrada.')
    return r
  }

  async function liberarTitulos(tenantId: string, remessaId: string, ids: string[], de: string, motivo: string, req: AuthenticatedRequest) {
    if (!ids.length) return
    await prisma.tesTitulo.updateMany({ where: { tenantId, id: { in: ids }, remessaId }, data: { remessaId: null, status: 'AUTORIZADO', ultimoErroBanco: motivo } })
    for (const id of ids) await eventoTitulo(prisma, { tenantId, tituloId: id, acao: 'REMESSA_LIBERADA', de, para: 'AUTORIZADO', userId: req.user?.id, papel: papelDe(req), detalhe: { motivo } })
  }

  router.post('/remessas/:id/enviar', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req), id = String(req.params.id)
    const rem = await carregarRemessa(tenantId, id)
    if (rem.status !== 'GERADA') throw httpError(409, `Remessa está ${rem.status}; só remessas GERADAS podem ser enviadas.`)
    const conta = await contaDoTenant(tenantId, rem.contaId)
    const prov = obterProvedor(conta.provedor)
    const titulos = await prisma.tesTitulo.findMany({ where: { tenantId, id: { in: rem.itens.map((i) => i.tituloId) } } })
    if (titulos.some((t) => t.status !== 'AUTORIZADO' || t.remessaId !== rem.id)) throw httpError(409, 'Algum título da remessa deixou de estar AUTORIZADO.')
    if (titulos.some((t) => !t.hashAutorizado || t.hashAutorizado !== hashAutorizacao(t))) throw httpError(409, 'Integridade: algum título mudou após a autorização.', { code: 'INTEGRIDADE' })
    if (sha256(rem.conteudo) !== rem.hash) throw httpError(409, 'Integridade: o arquivo da remessa foi alterado.', { code: 'INTEGRIDADE' })
    const usou2fa = await exigir2fa(req, rem.valorTotal)
    const claim = await prisma.tesRemessa.updateMany({ where: { id, tenantId, status: 'GERADA' }, data: { status: 'ENVIADA', enviadaPorId: uid(req), enviadaEm: new Date(), provedor: prov.nome } })
    if (claim.count === 0) throw httpError(409, 'Remessa já foi enviada.')
    const mapa = new Map(titulos.map((t) => [t.id, t]))
    const envio = {
      remessaId: rem.id, numero: rem.numero, tipo: rem.tipo, nomeArquivo: rem.nomeArquivo, conteudo: rem.conteudo, hash: rem.hash, conta: { id: conta.id, bancoCodigo: conta.bancoCodigo, numeroConta: conta.numeroConta },
      itens: rem.itens.map((i) => { const t = mapa.get(i.tituloId)!; return { idPagamento: i.idPagamento, valor: i.valor, favorecidoNome: t.fornecedor, formaPagamento: t.formaPagamento, favorecidoConta: t.favorecidoConta, chavePix: t.chavePix, codigoBarras: t.codigoBarras } }),
    }
    let resp
    try { resp = await prov.enviarRemessa(envio) } catch (e: any) {
      await prisma.tesRemessa.update({ where: { id }, data: { status: 'GERADA', enviadaEm: null, enviadaPorId: null } })
      throw httpError(502, `Falha ao comunicar com o banco: ${e.message}`)
    }
    if (!resp.aceito) {
      await prisma.tesRemessa.update({ where: { id }, data: { status: 'ERRO', retornoConteudo: resp.mensagem } })
      await liberarTitulos(tenantId, id, titulos.map((t) => t.id), 'AUTORIZADO', resp.mensagem || 'Arquivo rejeitado pelo banco', req)
      await log(req, 'REMESSA_REJEITADA', 'TesRemessa', id, { mensagem: resp.mensagem })
      return res.status(422).json({ error: resp.mensagem || 'Remessa rejeitada pelo banco.', code: 'REMESSA_REJEITADA' })
    }
    await prisma.tesRemessa.update({ where: { id }, data: { protocolo: resp.protocolo } })
    await prisma.tesTitulo.updateMany({ where: { tenantId, id: { in: titulos.map((t) => t.id) }, status: 'AUTORIZADO' }, data: { status: 'ENVIADO_BANCO', enviadoEm: new Date(), ultimoErroBanco: null } })
    for (const t of titulos) await eventoTitulo(prisma, { tenantId, tituloId: t.id, acao: 'ENVIADO_BANCO', de: 'AUTORIZADO', para: 'ENVIADO_BANCO', userId: uid(req), papel: papelDe(req), detalhe: { remessa: rem.numero, protocolo: resp.protocolo, provedor: prov.nome, simulado: prov.simulado, usou2fa } })
    await log(req, 'REMESSA_ENVIADA', 'TesRemessa', id, { protocolo: resp.protocolo, provedor: prov.nome, simulado: prov.simulado, valorTotal: rem.valorTotal })
    res.json({ remessa: await carregarRemessa(tenantId, id), simulado: prov.simulado, aviso: prov.simulado ? resp.mensagem : undefined })
  }))

  async function processarRetorno(req: AuthenticatedRequest, rem: any, itens: Array<{ idPagamento: string; status: 'PAGO' | 'REJEITADO'; motivo?: string }>, conteudo?: string) {
    const tenantId = tid(req)
    const porId = new Map<string, any>(rem.itens.map((i: any) => [i.idPagamento, i]))
    const resumo = { pagos: 0, rejeitados: 0, ignorados: 0, erros: [] as string[] }
    for (const ri of itens) {
      const item = porId.get(ri.idPagamento)
      if (!item || item.status !== 'INCLUIDO') { resumo.ignorados++; continue }
      try {
        if (ri.status === 'PAGO') {
          await baixarTitulo({ tenantId, id: item.tituloId, contaId: rem.contaId, data: rem.dataPagamento < new Date() ? rem.dataPagamento : new Date(), userId: uid(req), papel: papelDe(req), comprovante: `${rem.nomeArquivo}:${ri.idPagamento}`, via: 'REMESSA' })
          await prisma.tesRemessaItem.update({ where: { id: item.id }, data: { status: 'PAGO' } })
          resumo.pagos++
        } else {
          await prisma.tesRemessaItem.update({ where: { id: item.id }, data: { status: 'REJEITADO', motivo: ri.motivo } })
          await prisma.tesTitulo.updateMany({ where: { tenantId, id: item.tituloId, status: 'ENVIADO_BANCO' }, data: { status: 'AUTORIZADO', remessaId: null, ultimoErroBanco: ri.motivo ?? 'Rejeitado pelo banco' } })
          await eventoTitulo(prisma, { tenantId, tituloId: item.tituloId, acao: 'REJEITADO_BANCO', de: 'ENVIADO_BANCO', para: 'AUTORIZADO', userId: uid(req), papel: papelDe(req), detalhe: { motivo: ri.motivo, remessa: rem.numero } })
          resumo.rejeitados++
        }
      } catch (e: any) { resumo.erros.push(`${ri.idPagamento}: ${e.message}`) }
    }
    const abertos = await prisma.tesRemessaItem.count({ where: { tenantId, remessaId: rem.id, status: 'INCLUIDO' } })
    await prisma.tesRemessa.update({ where: { id: rem.id }, data: { status: abertos === 0 ? 'PROCESSADA' : 'ENVIADA', retornoEm: new Date(), ...(conteudo ? { retornoConteudo: conteudo } : {}) } })
    await log(req, 'REMESSA_RETORNO', 'TesRemessa', rem.id, resumo)
    return { ...resumo, status: abertos === 0 ? 'PROCESSADA' : 'ENVIADA' }
  }

  // Consulta o retorno no provedor (simulado: determinístico).
  router.post('/remessas/:id/consultar-retorno', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const rem = await carregarRemessa(tenantId, String(req.params.id))
    if (rem.status !== 'ENVIADA') throw httpError(409, `Remessa está ${rem.status}; só remessas ENVIADAS têm retorno a consultar.`)
    const conta = await contaDoTenant(tenantId, rem.contaId)
    const prov = obterProvedor(conta.provedor)
    const titulos = await prisma.tesTitulo.findMany({ where: { tenantId, id: { in: rem.itens.map((i) => i.tituloId) } } })
    const mapa = new Map(titulos.map((t) => [t.id, t]))
    const r = await prov.consultarRetorno({
      remessaId: rem.id, numero: rem.numero, tipo: rem.tipo, nomeArquivo: rem.nomeArquivo, conteudo: rem.conteudo, hash: rem.hash, conta: { id: conta.id },
      itens: rem.itens.map((i) => { const t = mapa.get(i.tituloId)!; return { idPagamento: i.idPagamento, valor: i.valor, favorecidoNome: t.fornecedor, formaPagamento: t.formaPagamento, favorecidoConta: t.favorecidoConta, chavePix: t.chavePix, codigoBarras: t.codigoBarras } }),
    }, rem.protocolo || '')
    if (!r.processado) return res.json({ processado: false })
    res.json({ processado: true, ...(await processarRetorno(req, rem, r.itens, r.retornoConteudo)) })
  }))

  // Retorno manual: usuário cola/envia o arquivo de retorno (CNAB 240 ou CSV idPagamento;status;motivo).
  router.post('/remessas/:id/retorno', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const { conteudo } = parseBody(z.object({ conteudo: z.string().min(10).max(2_000_000) }), req.body)
    const rem = await carregarRemessa(tenantId, String(req.params.id))
    if (rem.status !== 'ENVIADA') throw httpError(409, `Remessa está ${rem.status}; só remessas ENVIADAS aceitam retorno.`)
    const itens = parseRetorno(conteudo)
    if (!itens.length) throw httpError(422, 'Nenhum registro reconhecido no arquivo de retorno.')
    res.json(await processarRetorno(req, rem, itens, conteudo))
  }))

  router.post('/remessas/:id/cancelar', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req), id = String(req.params.id)
    const { motivo } = parseBody(z.object({ motivo: z.string().min(5).max(300) }), req.body)
    const rem = await carregarRemessa(tenantId, id)
    if (rem.status !== 'GERADA') throw httpError(409, rem.status === 'ENVIADA' ? 'Remessa já enviada ao banco: não pode ser cancelada aqui (aguarde o retorno).' : `Remessa está ${rem.status}.`)
    const c = await prisma.tesRemessa.updateMany({ where: { id, tenantId, status: 'GERADA' }, data: { status: 'CANCELADA', canceladaEm: new Date() } })
    if (c.count === 0) throw httpError(409, 'Remessa já foi processada.')
    await liberarTitulos(tenantId, id, rem.itens.map((i) => i.tituloId), 'AUTORIZADO', `Remessa ${rem.numero} cancelada: ${motivo}`, req)
    await prisma.tesTitulo.updateMany({ where: { tenantId, id: { in: rem.itens.map((i) => i.tituloId) } }, data: { ultimoErroBanco: null } })
    await log(req, 'REMESSA_CANCELADA', 'TesRemessa', id, { motivo })
    res.json(await carregarRemessa(tenantId, id))
  }))
}
