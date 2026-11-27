import crypto from 'crypto'
import { CobAcordo, CobParcela } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { audit } from '../core/notify'
import { registrarBaixaComLancamento } from '../financeiro/accounting.helpers'
import { Carteira, PoliticaCob, TituloCalc, montarCarteira, politicaPara, sincronizarCasos } from './carteira'
import { calcularEncargos, canonicalJson, diaBRT, gerarPlano, round2, saldoDoTitulo, somarMeses, DIA_MS } from './calculo'
import { Forma, FORMAS, aposPagamento } from './pagamentos'
import { dataBR, dinheiro, httpErr, proximoNumero } from './util'

const db = prisma as any

export interface SimulacaoInput {
  tenantId: string
  studentId: string
  receivableIds?: string[]
  now?: Date
  descontoEncargosPct?: number
  descontoPrincipalPct?: number
  entrada?: number
  entradaPct?: number
  parcelas: number
  primeiroVencimento: Date
  entradaVencimento?: Date
  jurosParcelamentoPct?: number
  autor?: 'INSTITUICAO' | 'ALUNO'
}

export interface Simulacao {
  politica: PoliticaCob
  titulos: TituloCalc[]
  principal: number
  encargos: number
  bruto: number
  descontoEncargos: number
  descontoPrincipal: number
  desconto: number
  descontoPct: number
  valorBase: number
  entrada: number
  parcelas: number
  jurosParcelamentoPct: number
  jurosParcelamento: number
  totalAPagar: number
  plano: Array<{ numero: number; valor: number; vencimento: Date }>
  precisaAprovacao: boolean
  avisos: string[]
  temBolsa: boolean
}

function pct(n: unknown, nome: string): number {
  const v = Number(n ?? 0)
  if (!Number.isFinite(v) || v < 0 || v > 100) throw httpErr(400, `${nome} deve estar entre 0 e 100.`)
  return v
}

/** Calcula uma proposta (sem gravar). Valida contra a política: entrada mínima, nº e valor de parcelas, desconto e bolsa. */
export async function simularAcordo(i: SimulacaoInput, cart?: Carteira): Promise<Simulacao> {
  const now = i.now ?? new Date()
  cart = cart ?? (await montarCarteira(i.tenantId, now, { studentId: i.studentId }))
  const todos = (cart.titulos.get(i.studentId) ?? []).filter((t) => !t.emAcordo && t.diasAtraso > 0)
  const sel = i.receivableIds?.length ? todos.filter((t) => i.receivableIds!.includes(t.id)) : todos
  if (i.receivableIds?.length && sel.length !== new Set(i.receivableIds).size) throw httpErr(422, 'Algum título informado não está vencido/em aberto, já está em acordo ou não pertence ao aluno.')
  if (!sel.length) throw httpErr(422, 'O aluno não tem débito vencido disponível para acordo.')
  const info = cart.info.get(i.studentId)
  const pol = politicaPara(cart.politicas, info?.segmento ?? 'GRADUACAO')
  const avisos: string[] = []
  const principal = round2(sel.reduce((a, t) => a + t.principalRestante, 0))
  const encargos = round2(sel.reduce((a, t) => a + t.encargos, 0))
  const bruto = round2(principal + encargos)
  const dEncPct = pct(i.descontoEncargosPct, 'descontoEncargosPct')
  let dPriPct = pct(i.descontoPrincipalPct, 'descontoPrincipalPct')
  if (dPriPct > 0 && pol.bloqueiaDescontoComBolsa && info?.temBolsa) {
    if (i.autor === 'ALUNO') avisos.push('Aluno com bolsa ativa: desconto sobre o principal não é concedido pela política.')
    else throw httpErr(422, 'Aluno com bolsa ativa: a política não permite desconto sobre o principal (a bolsa já reduz a mensalidade).')
    dPriPct = 0
  }
  const descontoEncargos = round2(encargos * (dEncPct / 100))
  const descontoPrincipal = round2(principal * (dPriPct / 100))
  const desconto = round2(descontoEncargos + descontoPrincipal)
  const descontoPct = bruto > 0 ? round2((desconto / bruto) * 100) : 0
  const precisaAprovacao = descontoPct > pol.descontoMaxPct + 0.0001
  const valorBase = round2(bruto - desconto)
  const nParc = Math.floor(Number(i.parcelas))
  if (!Number.isFinite(nParc) || nParc < 0) throw httpErr(400, 'Número de parcelas inválido.')
  if (nParc > pol.parcelasMax) throw httpErr(422, `A política permite no máximo ${pol.parcelasMax} parcelas.`)
  let entrada = i.entrada ?? (i.entradaPct != null ? round2(valorBase * (pct(i.entradaPct, 'entradaPct') / 100)) : round2(valorBase * (pol.entradaMinPct / 100)))
  if (nParc === 0) entrada = valorBase // à vista
  if (!Number.isFinite(entrada) || entrada < 0 || entrada > valorBase + 0.01) throw httpErr(400, 'Entrada inválida.')
  entrada = round2(Math.min(entrada, valorBase))
  const minEntrada = round2(valorBase * (pol.entradaMinPct / 100))
  if (nParc > 0 && entrada + 0.01 < minEntrada) {
    if (i.autor === 'ALUNO') avisos.push(`Entrada abaixo do mínimo da política (${pol.entradaMinPct}% = ${minEntrada.toFixed(2)}).`)
    else throw httpErr(422, `Entrada mínima da política: ${pol.entradaMinPct}% (${minEntrada.toFixed(2)}).`)
  }
  const jurosParc = i.jurosParcelamentoPct ?? pol.jurosParcelamentoPct
  const plano = gerarPlano({ total: valorBase, entrada, parcelas: nParc, jurosMensalPct: jurosParc, primeiroVencimento: i.primeiroVencimento, entradaVencimento: i.entradaVencimento })
  const hoje = diaBRT(now)
  if (plano.parcelas.some((p) => diaBRT(p.vencimento) < hoje)) throw httpErr(422, 'Vencimento de parcela no passado.')
  const menor = plano.parcelas.filter((p) => p.numero > 0).reduce((m, p) => Math.min(m, p.valor), Infinity)
  if (nParc > 1 && menor < pol.parcelaMinima) {
    if (i.autor === 'ALUNO') avisos.push(`Parcela menor que o mínimo da política (${pol.parcelaMinima.toFixed(2)}).`)
    else throw httpErr(422, `Parcela mínima da política: ${pol.parcelaMinima.toFixed(2)}. Reduza o número de parcelas.`)
  }
  return { politica: pol, titulos: sel, principal, encargos, bruto, descontoEncargos, descontoPrincipal, desconto, descontoPct, valorBase, entrada, parcelas: nParc, jurosParcelamentoPct: jurosParc, jurosParcelamento: plano.jurosParcelamento, totalAPagar: plano.totalAPagar, plano: plano.parcelas, precisaAprovacao, avisos, temBolsa: !!info?.temBolsa }
}

async function evento(acordoId: string, tenantId: string, tipo: string, autor: string, usuarioId: string | undefined, dados?: unknown) {
  await prisma.cobAcordoEvento.create({ data: { tenantId, acordoId, tipo, autor, usuarioId, dados: dados as any } })
}

async function garantirCaso(tenantId: string, studentId: string, now: Date) {
  let caso = await prisma.cobCaso.findFirst({ where: { tenantId, studentId } })
  if (!caso) caso = await prisma.cobCaso.create({ data: { tenantId, studentId, abertoEm: now } })
  return caso
}

async function gravarPlano(acordoId: string, tenantId: string, plano: Simulacao['plano']) {
  await prisma.cobParcela.deleteMany({ where: { acordoId, tenantId } })
  if (plano.length) await prisma.cobParcela.createMany({ data: plano.map((p) => ({ tenantId, acordoId, numero: p.numero, valor: p.valor, vencimento: p.vencimento })) })
}

export async function criarAcordo(i: SimulacaoInput & { usuarioId?: string; gestor?: boolean; observacao?: string; acordoAnteriorId?: string }) {
  const now = i.now ?? new Date()
  const cart = await montarCarteira(i.tenantId, now, { studentId: i.studentId })
  const sim = await simularAcordo(i, cart)
  if (sim.precisaAprovacao && !i.gestor) throw httpErr(403, `Desconto de ${sim.descontoPct.toFixed(2)}% excede a alçada da política (${sim.politica.descontoMaxPct}%). Peça a aprovação de um gestor.`, { precisaAprovacao: true })
  // não pode haver outra negociação em andamento sobre os mesmos títulos
  const ids = sim.titulos.map((t) => t.id)
  const emCurso = await prisma.cobAcordoTitulo.findFirst({ where: { tenantId: i.tenantId, receivableId: { in: ids }, acordoId: { in: (await prisma.cobAcordo.findMany({ where: { tenantId: i.tenantId, status: { in: ['PROPOSTA', 'CONTRAPROPOSTA', 'ATIVO'] } }, select: { id: true } })).map((a) => a.id) } } })
  if (emCurso) throw httpErr(409, 'Já existe acordo/proposta em andamento para algum dos títulos selecionados.')
  const caso = await garantirCaso(i.tenantId, i.studentId, now)
  const numero = await proximoNumero(i.tenantId, 'ACORDO', 'ACD', now)
  const acordo = await prisma.cobAcordo.create({
    data: {
      tenantId: i.tenantId, casoId: caso.id, studentId: i.studentId, numero, status: i.autor === 'ALUNO' ? 'CONTRAPROPOSTA' : 'PROPOSTA', politicaId: sim.politica.id ?? undefined, valorOriginal: sim.principal, encargos: sim.encargos,
      desconto: sim.desconto, valorNegociado: sim.totalAPagar, entrada: sim.entrada, numeroParcelas: sim.parcelas, jurosParcelamentoPct: sim.jurosParcelamentoPct, primeiroVencimento: i.primeiroVencimento, dataCalculo: now,
      validadeAte: new Date(now.getTime() + sim.politica.validadePropostaDias * DIA_MS), origem: i.autor ?? 'INSTITUICAO', criadoPorId: i.usuarioId, aprovadoPorId: sim.precisaAprovacao ? i.usuarioId : undefined, observacao: i.observacao, acordoAnteriorId: i.acordoAnteriorId,
    },
  })
  await prisma.cobAcordoTitulo.createMany({ data: sim.titulos.map((t) => ({ tenantId: i.tenantId, acordoId: acordo.id, receivableId: t.id, principal: t.principalRestante, encargos: t.encargos })) })
  await gravarPlano(acordo.id, i.tenantId, sim.plano)
  await evento(acordo.id, i.tenantId, i.autor === 'ALUNO' ? 'CONTRAPROPOSTA' : 'PROPOSTA', i.autor ?? 'INSTITUICAO', i.usuarioId, resumoTermos(sim))
  await audit({ tenantId: i.tenantId, userId: i.usuarioId, modulo: 'cobranca', acao: 'ACORDO_PROPOSTO', refType: 'CobAcordo', refId: acordo.id, detalhes: { numero, total: sim.totalAPagar } })
  return detalheAcordo(i.tenantId, acordo.id, sim.avisos)
}

const resumoTermos = (s: Simulacao) => ({ principal: s.principal, encargos: s.encargos, desconto: s.desconto, descontoPct: s.descontoPct, valorBase: s.valorBase, entrada: s.entrada, parcelas: s.parcelas, jurosParcelamentoPct: s.jurosParcelamentoPct, totalAPagar: s.totalAPagar, avisos: s.avisos })

/** Proposta/contraproposta: recalcula os termos sobre os MESMOS títulos do acordo. */
export async function reproporAcordo(tenantId: string, acordoId: string, p: Omit<SimulacaoInput, 'tenantId' | 'studentId' | 'receivableIds'> & { usuarioId?: string; gestor?: boolean; observacao?: string }) {
  const now = p.now ?? new Date()
  const a = await prisma.cobAcordo.findFirst({ where: { id: acordoId, tenantId } })
  if (!a) throw httpErr(404, 'Acordo não encontrado.')
  if (!['PROPOSTA', 'CONTRAPROPOSTA'].includes(a.status)) throw httpErr(409, `Acordo ${a.status}: só propostas em negociação podem ser ajustadas.`)
  const tits = await prisma.cobAcordoTitulo.findMany({ where: { tenantId, acordoId } })
  const sim = await simularAcordo({ ...p, tenantId, studentId: a.studentId, receivableIds: tits.map((t) => t.receivableId), now: a.dataCalculo > now ? a.dataCalculo : now }) // preserva a data-base do cálculo se futura
  const autor = p.autor ?? 'INSTITUICAO'
  if (autor === 'INSTITUICAO' && sim.precisaAprovacao && !p.gestor) throw httpErr(403, `Desconto de ${sim.descontoPct.toFixed(2)}% excede a alçada (${sim.politica.descontoMaxPct}%): aprovação de gestor necessária.`, { precisaAprovacao: true })
  const upd = await prisma.cobAcordo.update({
    where: { id: acordoId },
    data: { status: autor === 'ALUNO' ? 'CONTRAPROPOSTA' : 'PROPOSTA', origem: autor, valorOriginal: sim.principal, encargos: sim.encargos, desconto: sim.desconto, valorNegociado: sim.totalAPagar, entrada: sim.entrada, numeroParcelas: sim.parcelas, jurosParcelamentoPct: sim.jurosParcelamentoPct, primeiroVencimento: p.primeiroVencimento, dataCalculo: now, validadeAte: new Date(now.getTime() + sim.politica.validadePropostaDias * DIA_MS), observacao: p.observacao ?? a.observacao, aprovadoPorId: autor === 'INSTITUICAO' && sim.precisaAprovacao ? p.usuarioId : null },
  })
  await gravarPlano(acordoId, tenantId, sim.plano)
  await evento(acordoId, tenantId, autor === 'ALUNO' ? 'CONTRAPROPOSTA' : 'AJUSTE', autor, p.usuarioId, { anterior: { valorNegociado: a.valorNegociado, entrada: a.entrada, parcelas: a.numeroParcelas, desconto: a.desconto }, novo: resumoTermos(sim), observacao: p.observacao })
  return { ...(await detalheAcordo(tenantId, upd.id, sim.avisos)), precisaAprovacao: sim.precisaAprovacao }
}

/** A instituição aprova a contraproposta do aluno como está (alçada validada) -> volta a PROPOSTA pronta para aceite. */
export async function aprovarContraproposta(tenantId: string, acordoId: string, usuarioId: string | undefined, gestor: boolean) {
  const a = await prisma.cobAcordo.findFirst({ where: { id: acordoId, tenantId } })
  if (!a) throw httpErr(404, 'Acordo não encontrado.')
  if (a.status !== 'CONTRAPROPOSTA') throw httpErr(409, 'Só contrapropostas podem ser aprovadas.')
  const bruto = a.valorOriginal + a.encargos
  const pol = (await prisma.cobPolitica.findFirst({ where: { id: a.politicaId ?? '', tenantId } })) as PoliticaCob | null
  const max = pol?.descontoMaxPct ?? 30
  const pcd = bruto > 0 ? (a.desconto / bruto) * 100 : 0
  if (pcd > max + 0.0001 && !gestor) throw httpErr(403, `Desconto de ${pcd.toFixed(2)}% excede a alçada (${max}%): aprovação de gestor necessária.`, { precisaAprovacao: true })
  const upd = await prisma.cobAcordo.update({ where: { id: a.id }, data: { status: 'PROPOSTA', origem: 'INSTITUICAO', aprovadoPorId: usuarioId, validadeAte: new Date(Date.now() + (pol?.validadePropostaDias ?? 7) * DIA_MS) } })
  await evento(a.id, tenantId, 'AJUSTE', 'INSTITUICAO', usuarioId, { aprovouContraproposta: true })
  return detalheAcordo(tenantId, upd.id)
}

export async function detalheAcordo(tenantId: string, acordoId: string, avisos: string[] = []) {
  const a = await prisma.cobAcordo.findFirst({ where: { id: acordoId, tenantId } })
  if (!a) throw httpErr(404, 'Acordo não encontrado.')
  const [titulos, parcelas, eventos] = await Promise.all([
    prisma.cobAcordoTitulo.findMany({ where: { tenantId, acordoId } }),
    prisma.cobParcela.findMany({ where: { tenantId, acordoId }, orderBy: { numero: 'asc' } }),
    prisma.cobAcordoEvento.findMany({ where: { tenantId, acordoId }, orderBy: { createdAt: 'asc' } }),
  ])
  const recs: any[] = await db.accountReceivable.findMany({ where: { tenantId, id: { in: titulos.map((t) => t.receivableId) } }, select: { id: true, descricao: true, numeroParcela: true, dataVencimento: true, status: true } })
  const rMap = new Map(recs.map((r) => [r.id, r]))
  const st = await prisma.student.findFirst({ where: { id: a.studentId, tenantId }, select: { nomeCompleto: true, ra: true } })
  return { ...a, aluno: st ? { nome: st.nomeCompleto, ra: st.ra } : null, titulos: titulos.map((t) => ({ ...t, titulo: rMap.get(t.receivableId) ?? null })), parcelas, eventos, avisos }
}

// ---------------------------------------------------------------- aceite / termo
export function montarTermo(a: CobAcordo, parcelas: CobParcela[], titulos: Array<{ descricao: string; principal: number; encargos: number; vencimento?: Date | null }>, aluno: { nome: string; ra: string }, aceite: { canal: string; por: string; documento?: string | null; em: Date }): string {
  const linhasT = titulos.map((t) => `  - ${t.descricao}${t.vencimento ? ` (venc. ${dataBR(t.vencimento)})` : ''}: principal ${dinheiro(t.principal)} + encargos ${dinheiro(t.encargos)}`).join('\n')
  const linhasP = parcelas.map((p) => `  ${p.numero === 0 ? 'Entrada' : `Parcela ${p.numero}/${a.numeroParcelas}`}: ${dinheiro(p.valor)} - vencimento ${dataBR(p.vencimento)}`).join('\n')
  return [
    `TERMO DE ACORDO DE PAGAMENTO Nº ${a.numero}`,
    '',
    `Devedor(a)/Aluno(a): ${aluno.nome} (RA ${aluno.ra})`,
    '',
    'DÉBITOS RENEGOCIADOS:',
    linhasT,
    `  Principal: ${dinheiro(a.valorOriginal)} | Encargos (multa, juros e correção até ${dataBR(a.dataCalculo)}): ${dinheiro(a.encargos)} | Desconto concedido: ${dinheiro(a.desconto)}`,
    '',
    `VALOR TOTAL AJUSTADO: ${dinheiro(a.valorNegociado)}${a.jurosParcelamentoPct > 0 ? ` (inclui juros de parcelamento de ${a.jurosParcelamentoPct}% a.m.)` : ''}`,
    'PLANO DE PAGAMENTO:',
    linhasP,
    '',
    'CONDIÇÕES: (1) o atraso de qualquer parcela sujeita o valor a multa e juros conforme a política vigente; (2) o descumprimento por prazo superior ao de tolerância informado pela instituição enseja a QUEBRA do acordo, com o restabelecimento do débito original, abatidos os valores já pagos e perda dos descontos concedidos; (3) o acordo não implica novação das obrigações acessórias nem renúncia a direitos; (4) a instituição não expõe nem comunica o débito a terceiros, respeitado o art. 42 do CDC.',
    'PROTEÇÃO DE DADOS: os dados deste termo são tratados com base na execução de contrato e no exercício regular de direitos (LGPD, art. 7º, V e VI), para fins de cobrança e controle do acordo.',
    '',
    `ACEITE: registrado em ${dataBR(aceite.em)} por ${aceite.por}${aceite.documento ? ` (documento ${aceite.documento})` : ''}, via ${aceite.canal}.`,
  ].join('\n')
}

export async function aceitarAcordo(tenantId: string, acordoId: string, p: { canal: string; aceitoPor: string; documento?: string; ip?: string; usuarioId?: string; now?: Date }) {
  const now = p.now ?? new Date()
  const a = await prisma.cobAcordo.findFirst({ where: { id: acordoId, tenantId } })
  if (!a) throw httpErr(404, 'Acordo não encontrado.')
  if (a.status === 'CONTRAPROPOSTA') throw httpErr(409, 'Há uma contraproposta do aluno aguardando análise da instituição. Aprove-a ou ajuste os termos antes do aceite.')
  if (a.status !== 'PROPOSTA') throw httpErr(409, `Acordo ${a.status}: só propostas podem ser aceitas.`)
  if (a.validadeAte && a.validadeAte < now) {
    await prisma.cobAcordo.update({ where: { id: a.id }, data: { status: 'CANCELADO', observacao: 'Proposta expirada' } })
    await evento(a.id, tenantId, 'CANCELAMENTO', 'SISTEMA', undefined, { motivo: 'expirada' })
    throw httpErr(409, 'A proposta expirou. Gere uma nova.')
  }
  const tits = await prisma.cobAcordoTitulo.findMany({ where: { tenantId, acordoId } })
  const recs: any[] = await db.accountReceivable.findMany({ where: { tenantId, id: { in: tits.map((t) => t.receivableId) } } })
  if (recs.length !== tits.length || recs.some((r) => !['PENDENTE', 'ATRASADO'].includes(r.status))) throw httpErr(409, 'Algum título do acordo foi pago/cancelado desde a proposta. Refaça a simulação.')
  // nenhum outro acordo ATIVO pode cobrir os mesmos títulos
  const outro = await prisma.cobAcordoTitulo.findFirst({ where: { tenantId, receivableId: { in: tits.map((t) => t.receivableId) }, acordoId: { not: a.id, in: (await prisma.cobAcordo.findMany({ where: { tenantId, status: 'ATIVO' }, select: { id: true } })).map((x) => x.id) } } })
  if (outro) throw httpErr(409, 'Outro acordo ativo já cobre algum dos títulos.')
  const parcelas = await prisma.cobParcela.findMany({ where: { tenantId, acordoId }, orderBy: { numero: 'asc' } })
  const st = await prisma.student.findFirst({ where: { id: a.studentId, tenantId }, select: { nomeCompleto: true, ra: true } })
  const rMap = new Map(recs.map((r) => [r.id, r]))
  const termo = montarTermo(a, parcelas, tits.map((t) => ({ descricao: rMap.get(t.receivableId)?.descricao ?? t.receivableId, principal: t.principal, encargos: t.encargos, vencimento: rMap.get(t.receivableId)?.dataVencimento })), { nome: st?.nomeCompleto ?? '', ra: st?.ra ?? '' }, { canal: p.canal, por: p.aceitoPor, documento: p.documento ? mascararDoc(p.documento) : null, em: now })
  const hash = crypto.createHash('sha256').update(canonicalJson({ numero: a.numero, studentId: a.studentId, valorNegociado: a.valorNegociado, entrada: a.entrada, parcelas: parcelas.map((x) => [x.numero, x.valor, x.vencimento]), titulos: tits.map((t) => [t.receivableId, t.principal, t.encargos]), aceite: { canal: p.canal, por: p.aceitoPor, em: now } })).digest('hex')
  // claim: só uma requisição ativa o acordo
  const claim = await prisma.cobAcordo.updateMany({ where: { id: a.id, tenantId, status: 'PROPOSTA' }, data: { status: 'ATIVO', aceiteEm: now, aceiteCanal: p.canal, aceitePor: p.aceitoPor, aceiteDocumento: p.documento ? mascararDoc(p.documento) : null, aceiteIp: p.ip, aceiteHash: hash, termoTexto: termo } })
  if (claim.count === 0) throw httpErr(409, 'O acordo já foi processado.')
  await evento(a.id, tenantId, 'ACEITE', 'ALUNO', p.usuarioId, { canal: p.canal, por: p.aceitoPor, hash })
  await prisma.cobCaso.update({ where: { id: a.casoId }, data: { status: 'EM_ACORDO', pausaMotivo: `Acordo ${a.numero}` } })
  await prisma.cobPromessa.updateMany({ where: { tenantId, casoId: a.casoId, status: 'ABERTA' }, data: { status: 'CANCELADA', resolvidaEm: now, observacao: `Substituída pelo acordo ${a.numero}` } })
  await prisma.cobContato.create({ data: { tenantId, casoId: a.casoId, studentId: a.studentId, tipo: 'NOTA', direcao: 'ENTRADA', canal: 'SISTEMA', resultado: 'ACORDO', acordoId: a.id, observacao: `Acordo ${a.numero} aceito via ${p.canal} por ${p.aceitoPor}`, usuarioId: p.usuarioId, baseLegal: 'EXECUCAO_CONTRATO' } })
  await audit({ tenantId, userId: p.usuarioId, modulo: 'cobranca', acao: 'ACORDO_ACEITO', refType: 'CobAcordo', refId: a.id, detalhes: { numero: a.numero, canal: p.canal, hash } })
  return detalheAcordo(tenantId, a.id)
}

const mascararDoc = (d: string) => {
  const n = d.replace(/\D/g, '')
  return n.length === 11 ? `***.${n.slice(3, 6)}.${n.slice(6, 9)}-**` : n.length > 4 ? `***${n.slice(-4)}` : '***'
}

// ---------------------------------------------------------------- pagamento de parcela
export function devidoParcela(p: { valor: number; vencimento: Date }, data: Date, pol: PoliticaCob) {
  if (!pol.aplicarEncargosAcordo) return { face: p.valor, encargos: 0, total: p.valor, diasAtraso: Math.max(0, diaBRT(data) - diaBRT(p.vencimento)) }
  const e = calcularEncargos(p.valor, p.vencimento, data, { multaPct: pol.multaPct, jurosTipo: pol.jurosTipo, jurosPct: pol.jurosPct, jurosComposto: pol.jurosComposto, correcaoPctAnual: 0, toleranciaDias: pol.toleranciaDias })
  return { face: p.valor, encargos: e.total, total: round2(p.valor + e.total), diasAtraso: e.diasAtraso }
}

export async function pagarParcela(tenantId: string, acordoId: string, parcelaId: string, p: { valor?: number; forma: Forma; dataPagamento?: Date; usuarioId?: string }) {
  const data = p.dataPagamento ?? new Date()
  if (!FORMAS.includes(p.forma)) throw httpErr(400, 'Forma de pagamento inválida.')
  const a = await prisma.cobAcordo.findFirst({ where: { id: acordoId, tenantId } })
  if (!a) throw httpErr(404, 'Acordo não encontrado.')
  if (a.status !== 'ATIVO') throw httpErr(409, `Acordo ${a.status}: só acordos ativos recebem parcelas.`)
  const par = await prisma.cobParcela.findFirst({ where: { id: parcelaId, acordoId, tenantId } })
  if (!par) throw httpErr(404, 'Parcela não encontrada.')
  if (par.status !== 'ABERTA') throw httpErr(409, `Parcela ${par.status}.`)
  const pol = ((a.politicaId && (await prisma.cobPolitica.findFirst({ where: { id: a.politicaId, tenantId } }))) || null) as PoliticaCob | null
  const polEf = pol ?? (await politicaDoAluno(tenantId, a.studentId, data))
  const dev = devidoParcela(par, data, polEf)
  const valor = round2(p.valor ?? dev.total)
  if (valor + 0.01 < dev.total) throw httpErr(422, `Valor insuficiente: a parcela exige ${dev.total.toFixed(2)} (face ${dev.face.toFixed(2)} + encargos ${dev.encargos.toFixed(2)}). Pagamento parcial de parcela não é aceito.`)
  if (valor > dev.total + 0.01) throw httpErr(422, `Valor maior que o devido (${dev.total.toFixed(2)}).`)
  const claim = await prisma.cobParcela.updateMany({ where: { id: par.id, status: 'ABERTA' }, data: { status: 'PAGA', valorPago: valor, pagoEm: data } })
  if (claim.count === 0) throw httpErr(409, 'Parcela já baixada.')
  let transacaoId: string | undefined
  try {
    const b = await registrarBaixaComLancamento({ tenantId, tipo: 'RECEITA', valor, formaPagamento: p.forma, historico: `Acordo ${a.numero} — ${par.numero === 0 ? 'entrada' : `parcela ${par.numero}/${a.numeroParcelas}`}`, dataTransacao: data })
    transacaoId = b.transacao.id
  } catch (e) {
    await prisma.cobParcela.update({ where: { id: par.id }, data: { status: 'ABERTA', valorPago: 0, pagoEm: null } })
    throw e
  }
  const rec = await prisma.cobRecebimento.create({ data: { tenantId, casoId: a.casoId, studentId: a.studentId, origem: 'ACORDO_PARCELA', acordoId: a.id, parcelaId: par.id, valor, principal: dev.face, encargos: round2(valor - dev.face), forma: p.forma, dataPagamento: data, transacaoId, registradoPorId: p.usuarioId } })
  await evento(a.id, tenantId, 'PAGAMENTO', 'INSTITUICAO', p.usuarioId, { parcela: par.numero, valor, encargos: dev.encargos, diasAtraso: dev.diasAtraso })
  const abertas = await prisma.cobParcela.count({ where: { acordoId, tenantId, status: { in: ['ABERTA', 'PARCIAL'] } } })
  let quitado = false
  if (abertas === 0) {
    await quitarAcordo(tenantId, a, data, p.usuarioId)
    quitado = true
  } else {
    await aposPagamento(tenantId, a.studentId, { valor, quitado: false, now: data })
  }
  await audit({ tenantId, userId: p.usuarioId, modulo: 'cobranca', acao: 'PARCELA_PAGA', refType: 'CobParcela', refId: par.id, detalhes: { acordo: a.numero, parcela: par.numero, valor } })
  return { recebimento: rec, quitado, acordo: await detalheAcordo(tenantId, a.id) }
}

async function politicaDoAluno(tenantId: string, studentId: string, now: Date): Promise<PoliticaCob> {
  const cart = await montarCarteira(tenantId, now, { studentId })
  return politicaPara(cart.politicas, cart.info.get(studentId)?.segmento ?? 'GRADUACAO')
}

async function quitarAcordo(tenantId: string, a: CobAcordo, data: Date, usuarioId?: string) {
  const tits = await prisma.cobAcordoTitulo.findMany({ where: { tenantId, acordoId: a.id } })
  await db.accountReceivable.updateMany({ where: { tenantId, id: { in: tits.map((t) => t.receivableId) }, status: { in: ['PENDENTE', 'ATRASADO'] } }, data: { status: 'PAGO', dataPagamento: data, gatewayStatus: 'QUITADO_POR_ACORDO' } })
  await prisma.cobAcordo.update({ where: { id: a.id }, data: { status: 'QUITADO', quitadoEm: data } })
  await evento(a.id, tenantId, 'QUITACAO', 'INSTITUICAO', usuarioId, { desconto: a.desconto })
  await aposPagamento(tenantId, a.studentId, { valor: a.valorNegociado, quitado: true, now: data })
}

// ---------------------------------------------------------------- quebra / reabertura / renegociação
export async function quebrarAcordo(tenantId: string, acordoId: string, p: { motivo: string; usuarioId?: string; automatico?: boolean; now?: Date; status?: 'QUEBRADO' | 'RENEGOCIADO' }) {
  const now = p.now ?? new Date()
  const a = await prisma.cobAcordo.findFirst({ where: { id: acordoId, tenantId } })
  if (!a) throw httpErr(404, 'Acordo não encontrado.')
  if (a.status !== 'ATIVO') throw httpErr(409, `Só acordos ativos podem ser quebrados (status atual: ${a.status}).`)
  const claim = await prisma.cobAcordo.updateMany({ where: { id: a.id, tenantId, status: 'ATIVO' }, data: { status: p.status ?? 'QUEBRADO', quebradoEm: now, motivoQuebra: p.motivo } })
  if (claim.count === 0) throw httpErr(409, 'O acordo já foi processado.')
  await prisma.cobParcela.updateMany({ where: { acordoId, tenantId, status: 'ABERTA' }, data: { status: 'CANCELADA' } })
  // crédito: o que o aluno já pagou abate o débito original (encargos primeiro, títulos mais antigos primeiro)
  const pagas = await prisma.cobParcela.findMany({ where: { acordoId, tenantId, status: 'PAGA' } })
  let credito = round2(pagas.reduce((s, x) => s + x.valorPago, 0))
  const creditoTotal = credito
  const tits = await prisma.cobAcordoTitulo.findMany({ where: { tenantId, acordoId } })
  const recs: any[] = await db.accountReceivable.findMany({ where: { tenantId, id: { in: tits.map((t) => t.receivableId) }, status: { in: ['PENDENTE', 'ATRASADO'] } }, orderBy: { dataVencimento: 'asc' } })
  const polAluno = await politicaDoAluno(tenantId, a.studentId, now)
  for (const r of recs) {
    if (credito <= 0.009) break
    const aloc = await prisma.cobAlocacao.findMany({ where: { tenantId, receivableId: r.id } })
    const s = saldoDoTitulo(r.valor, r.dataVencimento, a.dataCalculo > now ? a.dataCalculo : now, polAluno, aloc)
    const enc = Math.min(credito, s.encargosDevidos)
    const pri = Math.min(round2(credito - enc), s.principalRestante)
    if (enc + pri <= 0) continue
    await prisma.cobAlocacao.create({ data: { tenantId, receivableId: r.id, acordoId: a.id, origem: 'CREDITO_QUEBRA', principal: round2(pri), encargos: round2(enc) } })
    credito = round2(credito - enc - pri)
    if (round2(s.principalRestante - pri) <= 0.009) await db.accountReceivable.updateMany({ where: { id: r.id, tenantId, status: { in: ['PENDENTE', 'ATRASADO'] } }, data: { status: 'PAGO', dataPagamento: now, gatewayStatus: 'QUITADO_POR_CREDITO' } })
  }
  await evento(a.id, tenantId, p.status === 'RENEGOCIADO' ? 'RENEGOCIACAO' : 'QUEBRA', p.automatico ? 'SISTEMA' : 'INSTITUICAO', p.usuarioId, { motivo: p.motivo, creditoAplicado: round2(creditoTotal - credito), automatico: !!p.automatico })
  // reabre o ciclo de cobrança: a régua recomeça
  const caso = await prisma.cobCaso.findFirst({ where: { id: a.casoId, tenantId } })
  if (caso) await prisma.cobCaso.update({ where: { id: caso.id }, data: { status: p.status === 'RENEGOCIADO' ? 'EM_COBRANCA' : 'EM_COBRANCA', ciclo: caso.ciclo + 1, abertoEm: now, resolvidoEm: null, pausaMotivo: null, pausadoAte: null } })
  await prisma.cobContato.create({ data: { tenantId, casoId: a.casoId, studentId: a.studentId, tipo: 'NOTA', direcao: 'ENTRADA', canal: 'SISTEMA', resultado: 'REGISTRADO', acordoId: a.id, observacao: `Acordo ${a.numero} ${p.status === 'RENEGOCIADO' ? 'renegociado' : 'quebrado'}: ${p.motivo}`, usuarioId: p.usuarioId } })
  await audit({ tenantId, userId: p.usuarioId, modulo: 'cobranca', acao: p.status === 'RENEGOCIADO' ? 'ACORDO_RENEGOCIADO' : 'ACORDO_QUEBRADO', refType: 'CobAcordo', refId: a.id, detalhes: { motivo: p.motivo, automatico: !!p.automatico } })
  return detalheAcordo(tenantId, a.id)
}

export async function reabrirAcordo(tenantId: string, acordoId: string, p: { novoPrimeiroVencimento?: Date; usuarioId?: string; now?: Date }) {
  const now = p.now ?? new Date()
  const a = await prisma.cobAcordo.findFirst({ where: { id: acordoId, tenantId } })
  if (!a) throw httpErr(404, 'Acordo não encontrado.')
  if (a.status !== 'QUEBRADO') throw httpErr(409, 'Só acordos quebrados podem ser reabertos.')
  const tits = await prisma.cobAcordoTitulo.findMany({ where: { tenantId, acordoId } })
  const ids = tits.map((t) => t.receivableId)
  const outro = await prisma.cobAcordoTitulo.findFirst({ where: { tenantId, receivableId: { in: ids }, acordoId: { not: a.id, in: (await prisma.cobAcordo.findMany({ where: { tenantId, status: { in: ['ATIVO', 'PROPOSTA', 'CONTRAPROPOSTA'] } }, select: { id: true } })).map((x) => x.id) } } })
  if (outro) throw httpErr(409, 'Outro acordo/proposta já cobre algum dos títulos: não é possível reabrir.')
  const disponiveis = await db.accountReceivable.count({ where: { tenantId, id: { in: ids }, OR: [{ status: { in: ['PENDENTE', 'ATRASADO'] } }, { gatewayStatus: 'QUITADO_POR_CREDITO' }] } })
  if (!disponiveis) throw httpErr(409, 'Os títulos do acordo já foram pagos por outro meio.')
  const canceladas = await prisma.cobParcela.findMany({ where: { acordoId, tenantId, status: 'CANCELADA' }, orderBy: { numero: 'asc' } })
  const vencidas = canceladas.filter((x) => diaBRT(x.vencimento) < diaBRT(now))
  if (vencidas.length && !p.novoPrimeiroVencimento) throw httpErr(422, 'Há parcelas vencidas: informe novoPrimeiroVencimento para reprogramá-las.', { parcelasVencidas: vencidas.map((v) => v.numero) })
  if (p.novoPrimeiroVencimento && diaBRT(p.novoPrimeiroVencimento) < diaBRT(now)) throw httpErr(422, 'Novo vencimento no passado.')
  // devolve os títulos quitados por crédito e desfaz os créditos
  await db.accountReceivable.updateMany({ where: { tenantId, id: { in: ids }, gatewayStatus: 'QUITADO_POR_CREDITO' }, data: { status: 'PENDENTE', dataPagamento: null, gatewayStatus: null } })
  await prisma.cobAlocacao.deleteMany({ where: { tenantId, acordoId: a.id, origem: 'CREDITO_QUEBRA' } })
  let k = 0
  for (const c of canceladas) {
    await prisma.cobParcela.update({ where: { id: c.id }, data: { status: 'ABERTA', ...(p.novoPrimeiroVencimento ? { vencimento: somarMeses(p.novoPrimeiroVencimento, k++) } : {}) } })
  }
  await prisma.cobAcordo.update({ where: { id: a.id }, data: { status: 'ATIVO', quebradoEm: null, motivoQuebra: null } })
  await evento(a.id, tenantId, 'REABERTURA', 'INSTITUICAO', p.usuarioId, { novoPrimeiroVencimento: p.novoPrimeiroVencimento })
  const caso = await prisma.cobCaso.findFirst({ where: { id: a.casoId, tenantId } })
  if (caso) await prisma.cobCaso.update({ where: { id: caso.id }, data: { status: 'EM_ACORDO', pausaMotivo: `Acordo ${a.numero} reaberto` } })
  await audit({ tenantId, userId: p.usuarioId, modulo: 'cobranca', acao: 'ACORDO_REABERTO', refType: 'CobAcordo', refId: a.id })
  return detalheAcordo(tenantId, a.id)
}

export async function renegociarAcordo(tenantId: string, acordoId: string, p: Omit<SimulacaoInput, 'tenantId' | 'studentId' | 'receivableIds'> & { motivo: string; usuarioId?: string; gestor?: boolean }) {
  const a = await prisma.cobAcordo.findFirst({ where: { id: acordoId, tenantId } })
  if (!a) throw httpErr(404, 'Acordo não encontrado.')
  if (!['ATIVO', 'QUEBRADO'].includes(a.status)) throw httpErr(409, 'Só acordos ativos ou quebrados podem ser renegociados.')
  if (a.status === 'ATIVO') await quebrarAcordo(tenantId, acordoId, { motivo: `Renegociação: ${p.motivo}`, usuarioId: p.usuarioId, status: 'RENEGOCIADO', now: p.now })
  else await prisma.cobAcordo.update({ where: { id: a.id }, data: { status: 'RENEGOCIADO' } })
  try {
    const novo = await criarAcordo({ ...p, tenantId, studentId: a.studentId, acordoAnteriorId: a.id, observacao: `Renegociação do acordo ${a.numero}: ${p.motivo}` })
    await evento(a.id, tenantId, 'RENEGOCIACAO', 'INSTITUICAO', p.usuarioId, { novoAcordo: novo.numero, motivo: p.motivo })
    return novo
  } catch (e) {
    // não deixa o aluno sem acordo por erro de validação: restaura o quebrado (o crédito já foi aplicado)
    await prisma.cobAcordo.update({ where: { id: a.id }, data: { status: 'QUEBRADO' } })
    throw e
  }
}

export async function cancelarAcordo(tenantId: string, acordoId: string, p: { motivo: string; usuarioId?: string }) {
  const a = await prisma.cobAcordo.findFirst({ where: { id: acordoId, tenantId } })
  if (!a) throw httpErr(404, 'Acordo não encontrado.')
  if (!['PROPOSTA', 'CONTRAPROPOSTA'].includes(a.status)) throw httpErr(409, 'Só propostas em negociação podem ser canceladas (acordo ativo: use quebrar).')
  await prisma.cobAcordo.update({ where: { id: a.id }, data: { status: 'CANCELADO', observacao: p.motivo } })
  await prisma.cobParcela.updateMany({ where: { acordoId, tenantId }, data: { status: 'CANCELADA' } })
  await evento(a.id, tenantId, 'CANCELAMENTO', 'INSTITUICAO', p.usuarioId, { motivo: p.motivo })
  return detalheAcordo(tenantId, a.id)
}

/** Job: quebra automática por atraso na parcela e expiração de propostas. */
export async function jobAcordos(opts: { tenantId?: string; now?: Date } = {}) {
  const now = opts.now ?? new Date()
  const r = { quebrados: 0, expirados: 0 }
  const where: any = opts.tenantId ? { tenantId: opts.tenantId } : {}
  const exp = await prisma.cobAcordo.findMany({ where: { ...where, status: { in: ['PROPOSTA', 'CONTRAPROPOSTA'] }, validadeAte: { lt: now } } })
  for (const a of exp) {
    await prisma.cobAcordo.update({ where: { id: a.id }, data: { status: 'CANCELADO', observacao: 'Proposta expirada' } })
    await prisma.cobParcela.updateMany({ where: { acordoId: a.id }, data: { status: 'CANCELADA' } })
    await evento(a.id, a.tenantId, 'CANCELAMENTO', 'SISTEMA', undefined, { motivo: 'expirada' })
    r.expirados++
  }
  const ativos = await prisma.cobAcordo.findMany({ where: { ...where, status: 'ATIVO' } })
  const pols = new Map<string, number>()
  for (const a of ativos) {
    let tol = pols.get(a.politicaId ?? '')
    if (tol === undefined) {
      tol = a.politicaId ? ((await prisma.cobPolitica.findFirst({ where: { id: a.politicaId, tenantId: a.tenantId }, select: { toleranciaQuebraDias: true } }))?.toleranciaQuebraDias ?? 5) : 5
      pols.set(a.politicaId ?? '', tol)
    }
    const atrasada = await prisma.cobParcela.findFirst({ where: { acordoId: a.id, status: 'ABERTA', vencimento: { lt: new Date(now.getTime() - tol * DIA_MS) } }, orderBy: { numero: 'asc' } })
    if (atrasada) {
      await quebrarAcordo(a.tenantId, a.id, { motivo: `Parcela ${atrasada.numero} vencida em ${dataBR(atrasada.vencimento)} sem pagamento (quebra automática)`, automatico: true, now })
      r.quebrados++
    }
  }
  return r
}

export { sincronizarCasos }
