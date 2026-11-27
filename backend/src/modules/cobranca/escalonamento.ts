import { CobCaso } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { audit } from '../core/notify'
import { LinhaDevedor, PoliticaCob, TituloCalc, montarCarteira, politicaPara } from './carteira'
import { tentarContato } from './contato'
import { DIA_MS, round2 } from './calculo'
import { dataBR, dinheiro, httpErr, proximoNumero } from './util'

const db = prisma as any

export const TIPOS_ENCAMINHAMENTO = ['NOTIFICACAO_EXTRAJUDICIAL', 'NEGATIVACAO', 'PROTESTO', 'JURIDICO'] as const
export type TipoEncaminhamento = (typeof TIPOS_ENCAMINHAMENTO)[number]

// ---------------------------------------------------------------------------------------------
// CONTRATO COM O JURÍDICO — SolicitacaoExecucaoV1
// O módulo Jurídico NÃO é importado aqui. Ele pode:
//  (a) registrar um handler em memória (registrarHandlerJuridico) que recebe o payload quando o
//      encaminhamento é enviado; ou
//  (b) consumir por HTTP: GET  /api/edu/cobranca/juridico/solicitacoes?status=ENVIADO
//                          POST /api/edu/cobranca/juridico/solicitacoes/:id/retorno  { status, protocolo?, motivo? }
// ---------------------------------------------------------------------------------------------
export interface SolicitacaoExecucaoV1 {
  versao: 'cobranca.solicitacao-execucao.v1'
  numero: string
  geradaEm: string
  origem: { modulo: 'cobranca'; casoId: string; encaminhamentoId: string; tenantId: string }
  devedor: { studentId: string; nome: string; ra: string; cpf: string | null; curso: string | null; segmento: string }
  debito: {
    dataCalculo: string
    valorPrincipal: number
    encargos: number
    valorTotal: number
    maiorAtrasoDias: number
    politica: { id: string | null; nome: string; multaPct: number; jurosTipo: string; jurosPct: number; correcaoPctAnual: number }
    titulos: Array<{ receivableId: string; descricao: string; parcela: number | null; vencimento: string; valorOriginal: number; diasAtraso: number; multa: number; juros: number; correcao: number; saldo: number }>
  }
  historico: {
    totalContatos: number
    ultimosContatos: Array<{ em: string; canal: string; resultado: string }>
    acordos: Array<{ numero: string; status: string; valorNegociado: number; quebradoEm: string | null; motivoQuebra: string | null }>
    promessasQuebradas: number
    notificacaoExtrajudicial: { numero: string; emitidaEm: string } | null
  }
  baseLegal: 'EXERCICIO_REGULAR_DIREITOS'
  observacao: string
}

export type JuridicoHandler = (s: SolicitacaoExecucaoV1) => Promise<{ protocolo?: string } | void>
let handlerJuridico: JuridicoHandler | null = null
export function registrarHandlerJuridico(h: JuridicoHandler | null) {
  handlerJuridico = h
}

async function dadosDoDebito(tenantId: string, studentId: string, now: Date) {
  const cart = await montarCarteira(tenantId, now, { studentId })
  const linha = cart.linhas.find((l) => l.studentId === studentId)
  const titulos = (cart.titulos.get(studentId) ?? []).filter((t) => t.diasAtraso > 0 && !t.emAcordo)
  return { cart, linha, titulos, pol: politicaPara(cart.politicas, linha?.segmento ?? 'GRADUACAO') }
}

export async function montarSolicitacaoExecucao(tenantId: string, caso: CobCaso, enc: { id: string; numero: string }, now = new Date()): Promise<SolicitacaoExecucaoV1> {
  const { linha, titulos, pol } = await dadosDoDebito(tenantId, caso.studentId, now)
  if (!linha || !titulos.length) throw httpErr(422, 'Sem débito vencido em aberto para encaminhar.')
  const st = await prisma.student.findFirst({ where: { id: caso.studentId, tenantId }, select: { nomeCompleto: true, ra: true, cpf: true } })
  const [contatos, ult, acordos, quebradas, notif] = await Promise.all([
    prisma.cobContato.count({ where: { tenantId, studentId: caso.studentId, direcao: 'SAIDA' } }),
    prisma.cobContato.findMany({ where: { tenantId, studentId: caso.studentId, direcao: 'SAIDA' }, orderBy: { createdAt: 'desc' }, take: 10 }),
    prisma.cobAcordo.findMany({ where: { tenantId, studentId: caso.studentId, status: { notIn: ['PROPOSTA', 'CONTRAPROPOSTA', 'CANCELADO'] } }, orderBy: { createdAt: 'asc' } }),
    prisma.cobPromessa.count({ where: { tenantId, studentId: caso.studentId, status: 'QUEBRADA' } }),
    prisma.cobEncaminhamento.findFirst({ where: { tenantId, casoId: caso.id, tipo: 'NOTIFICACAO_EXTRAJUDICIAL', status: { not: 'CANCELADO' } }, orderBy: { createdAt: 'asc' } }),
  ])
  return {
    versao: 'cobranca.solicitacao-execucao.v1',
    numero: enc.numero,
    geradaEm: now.toISOString(),
    origem: { modulo: 'cobranca', casoId: caso.id, encaminhamentoId: enc.id, tenantId },
    devedor: { studentId: caso.studentId, nome: st?.nomeCompleto ?? '', ra: st?.ra ?? '', cpf: st?.cpf ?? null, curso: linha.curso, segmento: linha.segmento },
    debito: {
      dataCalculo: now.toISOString(),
      valorPrincipal: linha.principal,
      encargos: linha.encargos,
      valorTotal: linha.saldo,
      maiorAtrasoDias: linha.maiorAtraso,
      politica: { id: pol.id, nome: pol.nome, multaPct: pol.multaPct, jurosTipo: pol.jurosTipo, jurosPct: pol.jurosPct, correcaoPctAnual: pol.correcaoPctAnual },
      titulos: titulos.map((t) => ({ receivableId: t.id, descricao: t.descricao, parcela: t.parcela, vencimento: t.vencimento.toISOString(), valorOriginal: t.valor, diasAtraso: t.diasAtraso, multa: t.multa, juros: t.juros, correcao: t.correcao, saldo: t.saldo })),
    },
    historico: {
      totalContatos: contatos,
      ultimosContatos: ult.map((c) => ({ em: c.createdAt.toISOString(), canal: c.canal, resultado: c.resultado })),
      acordos: acordos.map((a) => ({ numero: a.numero, status: a.status, valorNegociado: a.valorNegociado, quebradoEm: a.quebradoEm?.toISOString() ?? null, motivoQuebra: a.motivoQuebra })),
      promessasQuebradas: quebradas,
      notificacaoExtrajudicial: notif ? { numero: notif.numero, emitidaEm: notif.createdAt.toISOString() } : null,
    },
    baseLegal: 'EXERCICIO_REGULAR_DIREITOS',
    observacao: 'Solicitação gerada automaticamente pelo módulo de Cobrança. Os valores são estimativas calculadas pela política vigente na data indicada e devem ser conferidos antes do ajuizamento.',
  }
}

function documentoNotificacao(numero: string, nome: string, ra: string, titulos: TituloCalc[], total: number, pol: PoliticaCob, now: Date): string {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
  const linhas = titulos.map((t) => `<tr><td>${esc(t.descricao)}</td><td>${dataBR(t.vencimento)}</td><td>${t.diasAtraso}</td><td>${dinheiro(t.principalRestante)}</td><td>${dinheiro(t.encargos)}</td><td>${dinheiro(t.saldo)}</td></tr>`).join('')
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Notificação extrajudicial ${numero}</title><body style="font-family:Arial,sans-serif;max-width:760px;margin:24px auto;line-height:1.5">
<h2>NOTIFICAÇÃO EXTRAJUDICIAL Nº ${numero}</h2>
<p><b>Notificado(a):</b> ${esc(nome)} (RA ${esc(ra)})<br><b>Data:</b> ${dataBR(now)}</p>
<p>Pela presente, a instituição de ensino NOTIFICA V.Sa. de que constam em aberto os débitos abaixo, relativos à prestação de serviços educacionais, atualizados até ${dataBR(now)} conforme multa de ${pol.multaPct}% e juros de ${pol.jurosPct}% ${pol.jurosTipo === 'DIARIO' ? 'ao dia' : 'ao mês'}${pol.correcaoPctAnual ? ` e correção de ${pol.correcaoPctAnual}% a.a.` : ''}:</p>
<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:14px"><tr><th>Descrição</th><th>Vencimento</th><th>Dias</th><th>Principal</th><th>Encargos</th><th>Saldo</th></tr>${linhas}<tr><td colspan="5"><b>TOTAL ATUALIZADO</b></td><td><b>${dinheiro(total)}</b></td></tr></table>
<p>Fica V.Sa. notificado(a) para, no prazo de <b>${pol.diasAvisoPrevio} dias</b> a contar do recebimento, regularizar o débito ou procurar a secretaria financeira para negociação (parcelamento e condições especiais podem estar disponíveis).</p>
<p>Decorrido o prazo sem regularização, a instituição poderá adotar as medidas legais cabíveis, incluindo o protesto do título, a comunicação a cadastros de proteção ao crédito (com a comunicação prévia exigida pelo art. 43, §2º, do CDC) e a cobrança judicial.</p>
<p>Esta comunicação é dirigida exclusivamente ao(à) notificado(a). Dados tratados com base no art. 7º, V e VI, da LGPD. Em caso de pagamento já efetuado, desconsidere e apresente o comprovante.</p>
<p>Modelo gerado pelo sistema — recomenda-se revisão pelo departamento jurídico antes do envio por meio formal (carta com AR ou cartório).</p></body></html>`
}

export interface ResultadoEscalonamento {
  criado?: boolean
  encaminhamentoId?: string
  bloqueado?: string
  status?: string
}

/** Cria o encaminhamento do tipo pedido respeitando pré-requisitos. Idempotente por (caso, tipo, ciclo): não duplica pendentes/ativos. */
export async function escalonar(p: { tenantId: string; caso: CobCaso; tipo: TipoEncaminhamento; automatico: boolean; exigeAprovacao?: boolean; etapaId?: string; usuarioId?: string; now?: Date; linha?: LinhaDevedor }): Promise<ResultadoEscalonamento> {
  const now = p.now ?? new Date()
  const { linha, titulos, pol } = await dadosDoDebito(p.tenantId, p.caso.studentId, now)
  if (!linha || !titulos.length) return { bloqueado: 'Sem débito vencido em aberto.' }
  if (linha.acordoId) return { bloqueado: 'Aluno com acordo ativo: escalonamento suspenso.' }
  const existente = await prisma.cobEncaminhamento.findFirst({ where: { tenantId: p.tenantId, casoId: p.caso.id, tipo: p.tipo, status: { notIn: ['CANCELADO', 'DEVOLVIDO'] }, createdAt: { gte: p.caso.abertoEm } } })
  if (existente) return { bloqueado: `Já existe ${p.tipo} (${existente.numero}) neste ciclo.`, encaminhamentoId: existente.id }

  if (p.tipo === 'NEGATIVACAO' || p.tipo === 'PROTESTO') {
    const aviso = await prisma.cobEncaminhamento.findFirst({ where: { tenantId: p.tenantId, casoId: p.caso.id, tipo: 'NOTIFICACAO_EXTRAJUDICIAL', status: 'ENVIADO' }, orderBy: { createdAt: 'asc' } })
    if (!aviso) {
      const gerado = await prisma.cobEncaminhamento.findFirst({ where: { tenantId: p.tenantId, casoId: p.caso.id, tipo: 'NOTIFICACAO_EXTRAJUDICIAL', status: 'GERADO' } })
      return { bloqueado: gerado ? `A notificação extrajudicial ${gerado.numero} ainda não foi entregue ao aluno: confirme o envio (e-mail ou carta) antes de protestar/negativar.` : 'Exige notificação extrajudicial prévia (CDC art. 43, §2º).' }
    }
    const dias = Math.floor((now.getTime() - (aviso.enviadoEm ?? aviso.createdAt).getTime()) / DIA_MS)
    if (dias < pol.diasAvisoPrevio) return { bloqueado: `Aguardando o prazo de aviso prévio: ${dias}/${pol.diasAvisoPrevio} dias desde a entrega da notificação ${aviso.numero}.` }
  }
  if (p.tipo === 'JURIDICO' && linha.saldo < pol.valorMinimoExecucao) return { bloqueado: `Saldo ${linha.saldo.toFixed(2)} abaixo do mínimo para execução (${pol.valorMinimoExecucao.toFixed(2)}).` }

  const numero = await proximoNumero(p.tenantId, 'ENCAMINHAMENTO', 'ENC', now)
  const aprov = p.tipo !== 'NOTIFICACAO_EXTRAJUDICIAL' && (p.exigeAprovacao ?? true)
  const enc = await prisma.cobEncaminhamento.create({
    data: { tenantId: p.tenantId, casoId: p.caso.id, studentId: p.caso.studentId, numero, tipo: p.tipo, status: aprov ? 'AGUARDANDO_APROVACAO' : 'GERADO', simulado: p.tipo === 'NEGATIVACAO' || p.tipo === 'PROTESTO', automatico: p.automatico, etapaId: p.etapaId, valorDebito: linha.saldo, geradoPorId: p.usuarioId, createdAt: now },
  })
  let payload: any = { aluno: linha.nome, ra: linha.ra, valorDebito: linha.saldo, titulos: titulos.map((t) => t.id) }
  let documentoHtml: string | undefined
  if (p.tipo === 'JURIDICO') payload = await montarSolicitacaoExecucao(p.tenantId, p.caso, enc, now)
  if (p.tipo === 'NOTIFICACAO_EXTRAJUDICIAL') documentoHtml = documentoNotificacao(numero, linha.nome, linha.ra, titulos, linha.saldo, pol, now)
  await prisma.cobEncaminhamento.update({ where: { id: enc.id }, data: { payload, documentoHtml } })
  await audit({ tenantId: p.tenantId, userId: p.usuarioId, modulo: 'cobranca', acao: `ENCAMINHAMENTO_${p.tipo}`, refType: 'CobEncaminhamento', refId: enc.id, detalhes: { numero, valor: linha.saldo, automatico: p.automatico } })

  if (p.tipo === 'NOTIFICACAO_EXTRAJUDICIAL') {
    // tenta enviar uma cópia por e-mail (respeita opt-out/janela/limite). O documento formal fica no encaminhamento.
    const r = await tentarContato({
      tenantId: p.tenantId, caso: p.caso, politica: pol, canal: 'EMAIL', assunto: `Notificação extrajudicial nº ${numero}`, extrajudicial: true, automatico: p.automatico, usuarioId: p.usuarioId, now, nomeAluno: linha.nome,
      mensagem: `Prezado(a) ${linha.nome.split(' ')[0]}, está disponível a notificação extrajudicial nº ${numero} referente a débito de ${dinheiro(linha.saldo)}. Prazo para regularização: ${pol.diasAvisoPrevio} dias. Procure a secretaria financeira para negociar. Se já pagou, desconsidere e envie o comprovante.`,
    })
    if (r.resultado === 'ENFILEIRADO') await prisma.cobEncaminhamento.update({ where: { id: enc.id }, data: { status: 'ENVIADO', enviadoEm: now } })
    // sem e-mail/janela/limite: fica GERADO e é reenviado pelo motor; também pode ser enviado por carta e confirmado em /aprovar
    return { criado: true, encaminhamentoId: enc.id, status: r.resultado === 'ENFILEIRADO' ? 'ENVIADO' : 'GERADO' }
  }
  if (!aprov) {
    await enviarEncaminhamento(p.tenantId, enc.id, p.usuarioId, now)
    return { criado: true, encaminhamentoId: enc.id, status: 'ENVIADO' }
  }
  return { criado: true, encaminhamentoId: enc.id, status: 'AGUARDANDO_APROVACAO' }
}

/** Reenvia a cópia por e-mail das notificações extrajudiciais ainda não entregues (janela/limite/destino) — chamado pelo motor. */
export async function reenviarNotificacoesPendentes(tenantId: string, now = new Date()) {
  const pend = await prisma.cobEncaminhamento.findMany({ where: { tenantId, tipo: 'NOTIFICACAO_EXTRAJUDICIAL', status: 'GERADO', automatico: true }, take: 200 })
  let enviadas = 0
  for (const e of pend) {
    const caso = await prisma.cobCaso.findFirst({ where: { id: e.casoId, tenantId } })
    if (!caso || caso.naoContatar || ['QUITADO', 'ENCERRADO', 'EM_ACORDO', 'JURIDICO'].includes(caso.status) || (caso.pausadoAte && caso.pausadoAte > now)) continue
    const { linha, pol } = await dadosDoDebito(tenantId, caso.studentId, now)
    if (!linha) continue
    const r = await tentarContato({
      tenantId, caso, politica: pol, canal: 'EMAIL', assunto: `Notificação extrajudicial nº ${e.numero}`, extrajudicial: true, automatico: true, now, nomeAluno: linha.nome,
      mensagem: `Prezado(a) ${linha.nome.split(' ')[0]}, está disponível a notificação extrajudicial nº ${e.numero} referente a débito de ${dinheiro(linha.saldo)}. Prazo para regularização: ${pol.diasAvisoPrevio} dias. Procure a secretaria financeira para negociar. Se já pagou, desconsidere e envie o comprovante.`,
    })
    if (r.resultado === 'ENFILEIRADO') {
      await prisma.cobEncaminhamento.update({ where: { id: e.id }, data: { status: 'ENVIADO', enviadoEm: now } })
      enviadas++
    }
  }
  return enviadas
}

/** Marca como ENVIADO. Negativação/protesto são SIMULADOS (sem bureau/cartório); jurídico dispara o handler registrado. */
export async function enviarEncaminhamento(tenantId: string, id: string, usuarioId?: string, now = new Date()) {
  const enc = await prisma.cobEncaminhamento.findFirst({ where: { id, tenantId } })
  if (!enc) throw httpErr(404, 'Encaminhamento não encontrado.')
  if (!['AGUARDANDO_APROVACAO', 'GERADO'].includes(enc.status)) throw httpErr(409, `Encaminhamento ${enc.status}.`)
  const data: any = { status: 'ENVIADO', enviadoEm: now, aprovadoPorId: usuarioId ?? enc.aprovadoPorId }
  if (enc.simulado) data.protocoloExterno = `SIMULADO-${enc.numero}`
  let upd = await prisma.cobEncaminhamento.update({ where: { id }, data })
  if (enc.tipo === 'JURIDICO') {
    await prisma.cobCaso.update({ where: { id: enc.casoId }, data: { status: 'JURIDICO' } })
    if (handlerJuridico && enc.payload) {
      try {
        const r = await handlerJuridico(enc.payload as unknown as SolicitacaoExecucaoV1)
        if (r && r.protocolo) upd = await prisma.cobEncaminhamento.update({ where: { id }, data: { status: 'ACEITO', protocoloExterno: r.protocolo, retornoEm: now } })
      } catch (e: any) {
        console.error('[cobranca→juridico]', e)
        await prisma.cobEncaminhamento.update({ where: { id }, data: { retornoMotivo: `Falha ao entregar ao Jurídico: ${e?.message || e}` } })
      }
    }
  }
  await audit({ tenantId, userId: usuarioId, modulo: 'cobranca', acao: 'ENCAMINHAMENTO_ENVIADO', refType: 'CobEncaminhamento', refId: id, detalhes: { tipo: enc.tipo, simulado: enc.simulado } })
  return upd
}

export async function retornoJuridico(tenantId: string, id: string, r: { status: 'ACEITO' | 'DEVOLVIDO' | 'CONCLUIDO'; protocolo?: string; motivo?: string }, usuarioId?: string, now = new Date()) {
  const enc = await prisma.cobEncaminhamento.findFirst({ where: { id, tenantId, tipo: 'JURIDICO' } })
  if (!enc) throw httpErr(404, 'Solicitação não encontrada.')
  const ok: Record<string, string[]> = { ENVIADO: ['ACEITO', 'DEVOLVIDO'], ACEITO: ['CONCLUIDO', 'DEVOLVIDO'] }
  if (!ok[enc.status]?.includes(r.status)) throw httpErr(409, `Transição inválida: ${enc.status} -> ${r.status}.`)
  if (r.status === 'DEVOLVIDO' && !r.motivo) throw httpErr(400, 'Informe o motivo da devolução.')
  const upd = await prisma.cobEncaminhamento.update({ where: { id }, data: { status: r.status, protocoloExterno: r.protocolo ?? enc.protocoloExterno, retornoMotivo: r.motivo ?? enc.retornoMotivo, retornoEm: now } })
  if (r.status === 'DEVOLVIDO' || r.status === 'CONCLUIDO') {
    const caso = await prisma.cobCaso.findFirst({ where: { id: enc.casoId, tenantId } })
    if (caso?.status === 'JURIDICO') await prisma.cobCaso.update({ where: { id: caso.id }, data: { status: 'EM_COBRANCA' } })
  }
  await audit({ tenantId, userId: usuarioId, modulo: 'cobranca', acao: `JURIDICO_${r.status}`, refType: 'CobEncaminhamento', refId: id, detalhes: r })
  return upd
}

export async function cancelarEncaminhamento(tenantId: string, id: string, motivo: string, usuarioId?: string) {
  const enc = await prisma.cobEncaminhamento.findFirst({ where: { id, tenantId } })
  if (!enc) throw httpErr(404, 'Encaminhamento não encontrado.')
  if (!['AGUARDANDO_APROVACAO', 'GERADO'].includes(enc.status)) throw httpErr(409, `Encaminhamento ${enc.status} não pode ser cancelado (já enviado).`)
  const upd = await prisma.cobEncaminhamento.update({ where: { id }, data: { status: 'CANCELADO', retornoMotivo: motivo } })
  await audit({ tenantId, userId: usuarioId, modulo: 'cobranca', acao: 'ENCAMINHAMENTO_CANCELADO', refType: 'CobEncaminhamento', refId: id, detalhes: { motivo } })
  return upd
}

export { round2, db }
