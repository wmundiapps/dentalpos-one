import { prisma } from '../../lib/prisma'
import type { AuthenticatedRequest } from '../academico/middleware'
import { notify } from '../core/notify'
import { httpError, nomesUsuarios, papelDe, proximoNumero, r2, tid, uid } from '../tesouraria/common'
import { autorizarBoleto, refutarBoleto } from './autorizacao'
import { planilhaDoDia } from './recorrencias'
import { auditar, evento, fimDoDia, inicioDoDia, iso10, mascararDoc, meioDia } from './servico'

// Lote do dia: agrupa os boletos recebidos (DDA + e-mail + manual), vai para aprovação (total, parcial ou reprovar tudo) e vira relatório.
export const AVISO_VERIFICACAO = 'Verificação INTERNA do sistema (dígitos verificadores, cadastro, notas e histórico). Não é consulta ao banco nem à CIP e não substitui a conferência no banco/ internet banking antes do pagamento.'

export async function criarLote(req: AuthenticatedRequest, d: { data?: string; boletoIds?: string[]; observacao?: string }) {
  const tenantId = tid(req), user = uid(req)
  const dia = d.data ? meioDia(d.data) : meioDia(new Date().toISOString().slice(0, 10))
  const where: any = d.boletoIds?.length
    ? { tenantId, id: { in: d.boletoIds } }
    : { tenantId, recebidoEm: { gte: inicioDoDia(dia), lte: fimDoDia(dia) } }
  const candidatos = await prisma.bolBoleto.findMany({ where: { ...where, loteId: null, status: { in: ['RECEBIDO', 'A_CONFERIR'] } }, select: { id: true } })
  if (!candidatos.length) throw httpError(422, 'Nenhum boleto em aberto e fora de lote para este dia/seleção.', { code: 'LOTE_VAZIO' })
  if (d.boletoIds?.length && candidatos.length !== new Set(d.boletoIds).size) throw httpError(422, 'Alguns boletos informados não existem, já estão em outro lote ou já foram decididos.', { code: 'LOTE_ITENS_INVALIDOS' })
  const numero = `LOTE-${iso10(dia).replace(/-/g, '')}-${String(await proximoNumero(tenantId, `lote-${iso10(dia)}`)).padStart(2, '0')}`
  const lote = await prisma.bolLote.create({ data: { tenantId, numero, data: dia, observacao: d.observacao, criadoPorId: user } })
  await prisma.bolBoleto.updateMany({ where: { tenantId, id: { in: candidatos.map((c) => c.id) } }, data: { loteId: lote.id } })
  await evento({ tenantId, loteId: lote.id, acao: 'LOTE_CRIADO', para: 'ABERTO', userId: user, papel: papelDe(req), detalhe: { itens: candidatos.length } })
  await auditar(tenantId, user, 'LOTE_CRIADO', 'BolLote', lote.id, { numero, itens: candidatos.length })
  return lote
}

export async function enviarLote(req: AuthenticatedRequest, id: string) {
  const tenantId = tid(req), user = uid(req)
  const lote = await prisma.bolLote.findFirst({ where: { id, tenantId } })
  if (!lote) throw httpError(404, 'Lote não encontrado.')
  if (lote.status !== 'ABERTO') throw httpError(409, `Lote ${lote.numero} está ${lote.status.replace(/_/g, ' ')}; só lotes abertos podem ser enviados para aprovação.`, { code: 'TRANSICAO_INVALIDA' })
  const itens = await prisma.bolBoleto.count({ where: { tenantId, loteId: id } })
  if (!itens) throw httpError(422, 'O lote não tem boletos.')
  const out = await prisma.bolLote.update({ where: { id }, data: { status: 'ENVIADO_APROVACAO', enviadoPorId: user, enviadoEm: new Date() } })
  await evento({ tenantId, loteId: id, acao: 'LOTE_ENVIADO', de: 'ABERTO', para: 'ENVIADO_APROVACAO', userId: user, papel: papelDe(req) })
  await auditar(tenantId, user, 'LOTE_ENVIADO_APROVACAO', 'BolLote', id, { numero: lote.numero, itens })
  const aprovadores = await prisma.user.findMany({ where: { tenantId, role: { in: ['COORDINATOR', 'RECTOR', 'BOARD'] as any[] }, isActive: true }, select: { id: true }, take: 50 })
  for (const u of aprovadores) await notify({ tenantId, userId: u.id, assunto: 'Lote de boletos aguardando aprovação', mensagem: `O lote ${lote.numero} (${itens} boleto(s)) foi enviado para aprovação na Caixa de boletos.`, refType: 'BolLote', refId: id, templateKey: 'boletos.lote' })
  return out
}

export interface DecisaoLote { decisao: 'TOTAL' | 'PARCIAL' | 'REPROVAR'; itens?: string[]; motivo?: string; observacao?: string; confirmarRisco?: boolean; refutarRestantes?: boolean; contaId?: string }

export async function decidirLote(req: AuthenticatedRequest, id: string, d: DecisaoLote) {
  const tenantId = tid(req), user = uid(req), papel = papelDe(req)
  const lote = await prisma.bolLote.findFirst({ where: { id, tenantId } })
  if (!lote) throw httpError(404, 'Lote não encontrado.')
  if (lote.status !== 'ENVIADO_APROVACAO') throw httpError(409, `Lote ${lote.numero} está ${lote.status.replace(/_/g, ' ')}; só lotes enviados para aprovação podem ser decididos.`, { code: 'TRANSICAO_INVALIDA' })
  if (lote.enviadoPorId && lote.enviadoPorId === user) throw httpError(403, 'Segregação de funções: quem enviou o lote para aprovação não pode decidi-lo.', { code: 'SEGREGACAO' })
  const boletos = await prisma.bolBoleto.findMany({ where: { tenantId, loteId: id }, orderBy: { numero: 'asc' } })
  const resultados: Array<{ id: string; numero: string; ok: boolean; acao: string; erro?: string; code?: string }> = []
  const ids = new Set(boletos.map((b) => b.id))
  const faltaMotivo = (d.motivo || '').trim().length < 5

  if (d.decisao === 'REPROVAR') {
    if (faltaMotivo) throw httpError(400, 'Informe o motivo da reprovação do lote (mín. 5 caracteres).')
    for (const b of boletos) {
      if (!['RECEBIDO', 'A_CONFERIR', 'EM_APROVACAO'].includes(b.status)) { resultados.push({ id: b.id, numero: b.numero, ok: false, acao: 'REFUTAR', erro: `já está ${b.status}` }); continue }
      try { await refutarBoleto(req, b.id, `Lote ${lote.numero} reprovado: ${d.motivo}`); resultados.push({ id: b.id, numero: b.numero, ok: true, acao: 'REFUTADO' }) } catch (e: any) { resultados.push({ id: b.id, numero: b.numero, ok: false, acao: 'REFUTAR', erro: e.message, code: e.code }) }
    }
    return fechar(req, lote, d, resultados, boletos.length)
  }

  let aprovar = boletos
  if (d.decisao === 'PARCIAL') {
    const marcados = new Set(d.itens || [])
    if (!marcados.size) throw httpError(400, 'Na aprovação parcial, marque ao menos um boleto (itens).')
    for (const x of marcados) if (!ids.has(x)) throw httpError(400, 'Há itens que não pertencem a este lote.', { code: 'ITEM_FORA_DO_LOTE' })
    aprovar = boletos.filter((b) => marcados.has(b.id))
  }
  // pré-validação: duplicados bloqueiam; suspeitos exigem confirmação explícita do risco (+ observação)
  const bloqueados = aprovar.filter((b) => b.resultado === 'DUPLICADO')
  const suspeitos = aprovar.filter((b) => b.resultado === 'SUSPEITO')
  if (d.decisao === 'TOTAL' && bloqueados.length) throw httpError(422, `A aprovação total não pode incluir boletos DUPLICADOS (${bloqueados.map((b) => b.numero).join(', ')}). Use a aprovação parcial desmarcando-os, ou refute-os.`, { code: 'LOTE_COM_DUPLICADOS', ids: bloqueados.map((b) => b.id) })
  if (suspeitos.length && !(d.confirmarRisco && (d.observacao || '').trim().length >= 10)) throw httpError(422, `O lote tem boletos SUSPEITOS (${suspeitos.map((b) => b.numero).join(', ')}). Desmarque-os ou confirme o risco informando a justificativa (mín. 10 caracteres).`, { code: 'RISCO_CONFIRMACAO', ids: suspeitos.map((b) => b.id) })
  const emAprov = new Set(aprovar.map((b) => b.id))
  for (const b of aprovar) {
    if (b.resultado === 'DUPLICADO') { resultados.push({ id: b.id, numero: b.numero, ok: false, acao: 'AUTORIZAR', erro: 'duplicado: não autorizado', code: 'DUPLICADO' }); continue }
    try {
      const r = await autorizarBoleto(req, b.id, { contaId: d.contaId, observacao: d.observacao, confirmarRisco: b.resultado === 'SUSPEITO' ? d.confirmarRisco : undefined })
      resultados.push({ id: b.id, numero: b.numero, ok: true, acao: r.aguardandoSegundaAprovacao ? 'APROVACAO_PARCIAL' : 'AUTORIZADO' })
    } catch (e: any) { resultados.push({ id: b.id, numero: b.numero, ok: false, acao: 'AUTORIZAR', erro: e.message, code: e.code }) }
  }
  if (!resultados.some((r) => r.ok && ['AUTORIZADO', 'APROVACAO_PARCIAL'].includes(r.acao))) {
    throw httpError(409, `Nenhum boleto do lote pôde ser autorizado: ${resultados.filter((r) => !r.ok).map((r) => `${r.numero} (${r.erro})`).slice(0, 5).join('; ')}.`, { code: 'LOTE_SEM_APROVACAO', aviso: JSON.stringify(resultados) })
  }
  // não marcados na aprovação parcial: voltam à conferência (ou são refutados, se pedido)
  for (const b of boletos.filter((x) => !emAprov.has(x.id))) {
    if (d.refutarRestantes) {
      try { await refutarBoleto(req, b.id, `Não aprovado no lote ${lote.numero}${d.motivo ? `: ${d.motivo}` : ''}`.slice(0, 300)); resultados.push({ id: b.id, numero: b.numero, ok: true, acao: 'REFUTADO' }) } catch (e: any) { resultados.push({ id: b.id, numero: b.numero, ok: false, acao: 'REFUTAR', erro: e.message }) }
    } else {
      await prisma.bolBoleto.update({ where: { id: b.id }, data: { status: 'A_CONFERIR', loteId: null, observacao: `Não aprovado no lote ${lote.numero}${d.motivo ? `: ${d.motivo}` : ''}`.slice(0, 300) } })
      await evento({ tenantId, boletoId: b.id, loteId: id, acao: 'FORA_DO_LOTE', para: 'A_CONFERIR', userId: user, papel })
      resultados.push({ id: b.id, numero: b.numero, ok: true, acao: 'DEVOLVIDO_CONFERENCIA' })
    }
  }
  return fechar(req, lote, d, resultados, boletos.length)
}

async function fechar(req: AuthenticatedRequest, lote: { id: string; numero: string }, d: DecisaoLote, resultados: Array<{ ok: boolean; acao: string }>, total: number) {
  const tenantId = tid(req), user = uid(req)
  const autorizados = resultados.filter((r) => r.ok && ['AUTORIZADO', 'APROVACAO_PARCIAL'].includes(r.acao)).length
  const refutados = resultados.filter((r) => r.ok && r.acao === 'REFUTADO').length
  const falhas = resultados.filter((r) => !r.ok).length
  const status = d.decisao === 'REPROVAR' ? (falhas ? 'PARCIAL' : 'REPROVADO') : d.decisao === 'TOTAL' && !falhas && autorizados === total ? 'APROVADO' : 'PARCIAL'
  const relatorio = await relatorioLote(tenantId, lote.id)
  const out = await prisma.bolLote.update({
    where: { id: lote.id },
    data: { status, decisao: d.decisao, decididoPorId: user, decididoEm: new Date(), decisaoMotivo: (d.motivo || d.observacao || null)?.slice(0, 500), resumo: { autorizados, refutados, falhas, totais: relatorio.totais } as any },
  })
  await evento({ tenantId, loteId: lote.id, acao: `LOTE_${d.decisao}`, de: 'ENVIADO_APROVACAO', para: status, userId: user, papel: papelDe(req), detalhe: { autorizados, refutados, falhas, motivo: d.motivo } })
  await auditar(tenantId, user, `LOTE_${d.decisao}`, 'BolLote', lote.id, { numero: lote.numero, status, autorizados, refutados, falhas })
  return { lote: out, resultados, resumo: { autorizados, refutados, falhas, total } }
}

const vazioContagem = () => ({ OK: 0, ATENCAO: 0, SUSPEITO: 0, DUPLICADO: 0 })

/** Relatório imprimível do lote (por id) ou do dia (por data): boletos DDA + e-mail com todos os dados do check-up. */
export async function relatorioLote(tenantId: string, loteId?: string | null, data?: string) {
  let lote = loteId ? await prisma.bolLote.findFirst({ where: { id: loteId, tenantId } }) : null
  if (loteId && !lote) throw httpError(404, 'Lote não encontrado.')
  const dia = lote ? lote.data : data ? meioDia(data) : meioDia(new Date().toISOString().slice(0, 10))
  const boletos = await prisma.bolBoleto.findMany({
    where: lote ? { tenantId, loteId: lote.id } : { tenantId, recebidoEm: { gte: inicioDoDia(dia), lte: fimDoDia(dia) } },
    orderBy: [{ origem: 'asc' }, { numero: 'asc' }],
  })
  const forn = await prisma.supFornecedor.findMany({ where: { tenantId, id: { in: boletos.map((b) => b.fornecedorId).filter(Boolean) as string[] } }, select: { id: true, razaoSocial: true } })
  const nomeForn = new Map(forn.map((f) => [f.id, f.razaoSocial]))
  const notas = await prisma.tesNotaFiscal.findMany({ where: { tenantId, id: { in: boletos.map((b) => b.notaFiscalId).filter(Boolean) as string[] } }, select: { id: true, numero: true, valorTotal: true } })
  const mapaNota = new Map(notas.map((n) => [n.id, n]))
  const titulos = await prisma.tesTitulo.findMany({ where: { tenantId, id: { in: boletos.map((b) => b.tituloId).filter(Boolean) as string[] } }, select: { id: true, numero: true, status: true } })
  const mapaTit = new Map(titulos.map((t) => [t.id, t]))
  const nomes = await nomesUsuarios(tenantId, [...boletos.map((b) => b.decididoPorId), lote?.criadoPorId, lote?.enviadoPorId, lote?.decididoPorId])
  const itens = boletos.map((b) => {
    const motivos = (Array.isArray(b.motivos) ? b.motivos : []) as any[]
    return {
      id: b.id, numero: b.numero, origem: b.origem, status: b.status, resultado: b.resultado, score: b.score, recebidoEm: b.recebidoEm,
      fornecedor: (b.fornecedorId && nomeForn.get(b.fornecedorId)) || b.beneficiarioNome, beneficiarioNome: b.beneficiarioNome, beneficiarioDocumento: mascararDoc(b.beneficiarioDocumento),
      numeroDocumento: b.numeroDocumento, linhaDigitavel: b.linhaDigitavel, banco: b.banco, valor: b.valor, vencimento: b.vencimento,
      notaFiscal: b.notaFiscalId ? { numero: mapaNota.get(b.notaFiscalId)?.numero, valor: mapaNota.get(b.notaFiscalId)?.valorTotal } : null,
      titulo: b.tituloId ? mapaTit.get(b.tituloId) ?? null : null,
      duplicadoDeId: b.duplicadoDeId, motivos, observacao: b.observacao, motivoRefutacao: b.motivoRefutacao, decididoPor: b.decididoPorId ? nomes[b.decididoPorId] ?? null : null, decididoEm: b.decididoEm,
    }
  })
  const porOrigem: Record<string, { quantidade: number; valor: number }> = {}
  const porResultado: Record<string, number> = vazioContagem()
  const valorPorResultado: Record<string, number> = vazioContagem()
  for (const i of itens) {
    const o = (porOrigem[i.origem] ??= { quantidade: 0, valor: 0 })
    o.quantidade++; o.valor = r2(o.valor + (i.valor ?? 0))
    porResultado[i.resultado] = (porResultado[i.resultado] ?? 0) + 1
    valorPorResultado[i.resultado] = r2((valorPorResultado[i.resultado] ?? 0) + (i.valor ?? 0))
  }
  const planilha = await planilhaDoDia(tenantId, dia)
  return {
    gerado: { em: new Date().toISOString() },
    aviso: AVISO_VERIFICACAO,
    data: iso10(dia),
    lote: lote ? { id: lote.id, numero: lote.numero, status: lote.status, decisao: lote.decisao, decisaoMotivo: lote.decisaoMotivo, criadoPor: lote.criadoPorId ? nomes[lote.criadoPorId] : null, enviadoPor: lote.enviadoPorId ? nomes[lote.enviadoPorId] : null, enviadoEm: lote.enviadoEm, decididoPor: lote.decididoPorId ? nomes[lote.decididoPorId] : null, decididoEm: lote.decididoEm, observacao: lote.observacao } : null,
    totais: { quantidade: itens.length, valorTotal: r2(itens.reduce((s, i) => s + (i.valor ?? 0), 0)), porOrigem, porResultado, valorPorResultado },
    boletos: itens,
    recorrentesNaoLancados: planilha.naoLancados,
  }
}
