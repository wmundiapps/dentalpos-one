import { prisma } from '../../lib/prisma'
import type { AuthenticatedRequest } from '../academico/middleware'
import { httpError, papelDe, proximoNumero, r2, soDigitos, tid, uid } from '../tesouraria/common'
import { contaPadraoPagamento } from './contaPadrao'
import { pendenciasPagamento, autorizarTitulo, eventoTitulo } from '../tesouraria/titulos'
import { log as logTes } from '../tesouraria/common'
import { encerrarAvisosBoleto } from './alertas'
import { analisarBoleto, auditar, evento } from './servico'

// Autorização, conferência e refutação de um boleto da caixa. A autorização NÃO reimplementa o fluxo de pagamento:
// ela cria/atualiza o TesTitulo (contas a pagar) e chama `autorizarTitulo`, que aplica alçada (TesAlcada), dupla aprovação,
// segregação de funções (quem lançou não autoriza), 2FA e congela o conteúdo (hash) como em qualquer título da Tesouraria.

export const SISTEMA = 'SISTEMA_BOLETOS'
const ABERTOS = ['RECEBIDO', 'A_CONFERIR', 'EM_APROVACAO']

export interface OpcoesAutorizar { contaId?: string; observacao?: string; confirmarRisco?: boolean }

async function buscar(tenantId: string, id: string) {
  const b = await prisma.bolBoleto.findFirst({ where: { id, tenantId } })
  if (!b) throw httpError(404, 'Boleto não encontrado.')
  return b
}

function pendenciasBoleto(b: { valor: number | null; vencimento: Date | null; linhaDigitavel: string | null; codigoBarras: string | null; beneficiarioNome: string | null }) {
  const p: string[] = []
  if (!b.valor || b.valor <= 0) p.push('valor do boleto')
  if (!b.vencimento) p.push('vencimento')
  if (!b.linhaDigitavel && !b.codigoBarras) p.push('linha digitável/código de barras (boleto lido sem código: lance manualmente a partir do anexo)')
  if (!b.beneficiarioNome) p.push('nome do beneficiário/fornecedor')
  return p
}

/** Garante o TesTitulo do boleto (cria em CONFERIDO ou atualiza o existente) sem autorizá-lo. */
async function garantirTitulo(req: AuthenticatedRequest, b: Awaited<ReturnType<typeof buscar>>, contaId?: string) {
  const tenantId = tid(req)
  const doc = soDigitos(b.beneficiarioDocumento)
  const codigo = b.tipoBoleto === 'ARRECADACAO' ? (b.codigoBarras ?? b.linhaDigitavel) : (b.linhaDigitavel && soDigitos(b.linhaDigitavel).length === 47 ? soDigitos(b.linhaDigitavel) : b.codigoBarras)
  let titulo = b.tituloId ? await prisma.tesTitulo.findFirst({ where: { id: b.tituloId, tenantId } }) : null
  const forn = b.fornecedorId ? await prisma.supFornecedor.findFirst({ where: { id: b.fornecedorId, tenantId } }) : null
  const conta = contaId ?? (await contaPadraoPagamento(tenantId))
  const dados = {
    descricao: `Boleto ${b.numeroDocumento || b.numero} — ${b.beneficiarioNome}`.slice(0, 300),
    fornecedor: (forn?.razaoSocial || b.beneficiarioNome || 'Fornecedor').slice(0, 150),
    fornecedorDocumento: doc || null, fornecedorId: b.fornecedorId ?? null, formaPagamento: 'BOLETO' as const,
    codigoBarras: codigo ?? null, valorBruto: r2(b.valor as number), valorLiquido: r2(b.valor as number), vencimento: b.vencimento as Date,
    notaFiscalId: b.notaFiscalId ?? null, origem: (b.notaFiscalId ? 'NOTA_FISCAL' : 'MANUAL') as any, contaBancariaId: conta ?? null,
    categoria: 'boleto',
  }
  if (!titulo) {
    // já existe um título com este boleto (mesmo código) lançado manualmente? atualiza em vez de duplicar
    const variantes = [b.codigoBarras, b.linhaDigitavel].filter(Boolean) as string[]
    const existente = variantes.length ? await prisma.tesTitulo.findFirst({ where: { tenantId, codigoBarras: { in: variantes }, status: { notIn: ['CANCELADO', 'REJEITADO'] } } }) : null
    if (existente && !['RASCUNHO', 'CONFERIDO'].includes(existente.status)) {
      await prisma.bolBoleto.update({ where: { id: b.id }, data: { tituloId: existente.id } })
      return existente
    }
    titulo = existente
  }
  if (!titulo) {
    const numero = `CP-${String(await proximoNumero(tenantId, 'titulo')).padStart(6, '0')}`
    titulo = await prisma.tesTitulo.create({
      data: { tenantId, numero, status: 'CONFERIDO', criadoPorId: b.lancadoPorId ?? SISTEMA, conferidoPorId: SISTEMA, conferidoEm: new Date(), origemRef: `boleto:${b.id}`, ...dados } as any,
    })
    await prisma.tesAprovacao.create({ data: { tenantId, tituloId: titulo.id, tipo: 'CONFERENCIA', nivel: 1, userId: SISTEMA, papel: 'SISTEMA', valor: titulo.valorBruto } })
    await eventoTitulo(prisma, { tenantId, tituloId: titulo.id, acao: 'CRIADO', para: 'CONFERIDO', userId: b.lancadoPorId ?? SISTEMA, papel: 'CAIXA_BOLETOS', detalhe: { boleto: b.numero, origem: b.origem, checkup: b.resultado, score: b.score } })
    await logTes(req, 'TITULO_CRIADO_BOLETO', 'TesTitulo', titulo.id, { boleto: b.numero, valor: titulo.valorBruto })
  } else if (['RASCUNHO', 'CONFERIDO'].includes(titulo.status)) {
    const mudou = titulo.status === 'RASCUNHO'
    titulo = await prisma.tesTitulo.update({
      where: { id: titulo.id },
      data: { ...dados, ...(mudou ? { status: 'CONFERIDO', conferidoPorId: SISTEMA, conferidoEm: new Date() } : {}) } as any,
    })
    if (mudou) await prisma.tesAprovacao.create({ data: { tenantId, tituloId: titulo.id, tipo: 'CONFERENCIA', nivel: 1, userId: SISTEMA, papel: 'SISTEMA', valor: titulo.valorBruto } })
    await eventoTitulo(prisma, { tenantId, tituloId: titulo.id, acao: 'ATUALIZADO_BOLETO', para: 'CONFERIDO', userId: uid(req), papel: papelDe(req), detalhe: { boleto: b.numero } })
  }
  await prisma.bolBoleto.update({ where: { id: b.id }, data: { tituloId: titulo.id } })
  if (b.notaFiscalId) await prisma.tesNotaFiscal.updateMany({ where: { id: b.notaFiscalId, tenantId, tituloId: null }, data: { tituloId: titulo.id } })
  return titulo
}

/** Autoriza o boleto: cria/atualiza o título e o autoriza no fluxo existente (alçada, segregação, dupla aprovação, 2FA). */
export async function autorizarBoleto(req: AuthenticatedRequest, id: string, o: OpcoesAutorizar = {}) {
  const tenantId = tid(req), user = uid(req), papel = papelDe(req)
  let b = await buscar(tenantId, id)
  if (!ABERTOS.includes(b.status)) throw httpError(409, `Boleto ${b.numero} está ${b.status.replace(/_/g, ' ')}; só é possível autorizar boletos em aberto.`, { code: 'TRANSICAO_INVALIDA' })
  // reavalia agora: o cadastro, notas e duplicidades podem ter mudado desde a chegada
  b = (await analisarBoleto(tenantId, id, user)).boleto
  if (b.resultado === 'DUPLICADO') {
    let originalLiberado = false
    if (b.duplicadoDeId) { const orig = await prisma.bolBoleto.findFirst({ where: { id: b.duplicadoDeId, tenantId } }); originalLiberado = !!orig && orig.status === 'REFUTADO' }
    if (b.duplicadoTituloId) { const t = await prisma.tesTitulo.findFirst({ where: { id: b.duplicadoTituloId, tenantId } }); originalLiberado = !!t && ['CANCELADO', 'REJEITADO'].includes(t.status) }
    if (!originalLiberado) throw httpError(409, `Boleto ${b.numero} está marcado como DUPLICADO de outro já lançado. Refute-o (ou cancele o original) em vez de autorizar.`, { code: 'DUPLICADO', duplicadoDeId: b.duplicadoDeId, duplicadoTituloId: b.duplicadoTituloId })
  }
  if (b.resultado === 'SUSPEITO' && !(o.confirmarRisco && (o.observacao || '').trim().length >= 10)) {
    throw httpError(409, `Boleto ${b.numero} está SUSPEITO no check-up. Para autorizar mesmo assim, confirme o risco e registre a justificativa (mín. 10 caracteres) da conferência feita fora do sistema (ex.: contato com o fornecedor por telefone conhecido).`, { code: 'RISCO_CONFIRMACAO' })
  }
  const pend = pendenciasBoleto(b)
  if (pend.length) throw httpError(422, `Dados incompletos para autorizar: ${pend.join('; ')}.`, { code: 'DADOS_INCOMPLETOS', pendencias: pend })
  const titulo = await garantirTitulo(req, b, o.contaId)
  if (['AUTORIZADO', 'ENVIADO_BANCO', 'PAGO', 'CONCILIADO'].includes(titulo.status)) {
    return finalizar(req, b, titulo.id, true, o)
  }
  const pt = pendenciasPagamento(titulo)
  if (pt.length) throw httpError(422, `Dados do pagamento incompletos: ${pt.join('; ')}.`, { code: 'DADOS_INCOMPLETOS', pendencias: pt })
  const r = await autorizarTitulo(req, titulo.id)
  return finalizar(req, b, titulo.id, !r.aguardandoSegundaAprovacao, o, r)
}

async function finalizar(req: AuthenticatedRequest, b: Awaited<ReturnType<typeof buscar>>, tituloId: string, completo: boolean, o: OpcoesAutorizar, r?: any) {
  const tenantId = tid(req), user = uid(req), papel = papelDe(req)
  const status = completo ? 'AUTORIZADO' : 'EM_APROVACAO'
  const out = await prisma.bolBoleto.update({
    where: { id: b.id },
    data: { status, tituloId, observacao: o.observacao ?? b.observacao, ...(completo ? { decididoPorId: user, decididoEm: new Date() } : {}) },
  })
  await evento({ tenantId, boletoId: b.id, acao: completo ? 'AUTORIZADO' : 'APROVACAO_PARCIAL', de: b.status, para: status, userId: user, papel, detalhe: { tituloId, observacao: o.observacao, riscoConfirmado: !!o.confirmarRisco, resultadoCheckup: b.resultado } })
  await auditar(tenantId, user, completo ? 'BOLETO_AUTORIZADO' : 'BOLETO_APROVACAO_PARCIAL', 'BolBoleto', b.id, { numero: b.numero, tituloId, resultado: b.resultado, riscoConfirmado: !!o.confirmarRisco })
  if (completo) await encerrarAvisosBoleto(tenantId, b.id, user)
  const titulo = await prisma.tesTitulo.findUniqueOrThrow({ where: { id: tituloId } })
  return { boleto: out, titulo, aguardandoSegundaAprovacao: !completo, aprovacoesFeitas: r?.aprovacoesFeitas ?? titulo.aprovacoesFeitas, aprovacoesNecessarias: r?.aprovacoesNecessarias ?? titulo.aprovacoesNecessarias }
}

/** Conferir: devolve o boleto para checagem, com observação obrigatória. */
export async function conferirBoleto(req: AuthenticatedRequest, id: string, observacao: string) {
  const tenantId = tid(req), user = uid(req)
  const b = await buscar(tenantId, id)
  if (!['RECEBIDO', 'A_CONFERIR'].includes(b.status)) throw httpError(409, `Boleto ${b.numero} está ${b.status.replace(/_/g, ' ')}; só boletos recebidos podem ser devolvidos para conferência.`, { code: 'TRANSICAO_INVALIDA' })
  if ((observacao || '').trim().length < 5) throw httpError(400, 'Informe a observação da conferência (mín. 5 caracteres).')
  const out = await prisma.bolBoleto.update({ where: { id }, data: { status: 'A_CONFERIR', observacao: observacao.trim() } })
  await evento({ tenantId, boletoId: id, acao: 'DEVOLVIDO_CONFERENCIA', de: b.status, para: 'A_CONFERIR', userId: user, papel: papelDe(req), detalhe: { observacao } })
  await auditar(tenantId, user, 'BOLETO_DEVOLVIDO_CONFERENCIA', 'BolBoleto', id, { numero: b.numero })
  return out
}

/** Refutar: bloqueia o boleto (motivo obrigatório) e registra auditoria; cancela o título preliminar se ainda não autorizado. */
export async function refutarBoleto(req: AuthenticatedRequest, id: string, motivo: string) {
  const tenantId = tid(req), user = uid(req)
  const b = await buscar(tenantId, id)
  if (!ABERTOS.includes(b.status)) throw httpError(409, `Boleto ${b.numero} está ${b.status.replace(/_/g, ' ')}; só boletos em aberto podem ser refutados. Se já foi autorizado, cancele o título em Contas a pagar.`, { code: 'TRANSICAO_INVALIDA' })
  if ((motivo || '').trim().length < 5) throw httpError(400, 'Informe o motivo da refutação (mín. 5 caracteres).')
  if (b.tituloId) {
    const t = await prisma.tesTitulo.findFirst({ where: { id: b.tituloId, tenantId } })
    if (t && ['RASCUNHO', 'CONFERIDO'].includes(t.status)) {
      await prisma.tesTitulo.update({ where: { id: t.id }, data: { status: 'CANCELADO', origemRef: null } })
      await eventoTitulo(prisma, { tenantId, tituloId: t.id, acao: 'CANCELADO', de: t.status, para: 'CANCELADO', userId: user, papel: papelDe(req), detalhe: { motivo: `Boleto ${b.numero} refutado: ${motivo}` } })
    }
  }
  const out = await prisma.bolBoleto.update({ where: { id }, data: { status: 'REFUTADO', motivoRefutacao: motivo.trim(), decididoPorId: user, decididoEm: new Date() } })
  await evento({ tenantId, boletoId: id, acao: 'REFUTADO', de: b.status, para: 'REFUTADO', userId: user, papel: papelDe(req), detalhe: { motivo } })
  await auditar(tenantId, user, 'BOLETO_REFUTADO', 'BolBoleto', id, { numero: b.numero, resultado: b.resultado, motivo })
  await encerrarAvisosBoleto(tenantId, id, user)
  return out
}
