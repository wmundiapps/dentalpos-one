import type { TabelaInss, TabelaIrrf, TabelasFolha } from '../parametros'
import { diffDias, meioDia, r2, somaDias } from '../util'

// Cálculos de DP (folha, 13º, férias, rescisão). Funções PURAS: recebem as tabelas por parâmetro (ver parametros.ts).
// Todos os resultados são ESTIMATIVAS a conferir pelo contador (convenções coletivas, médias de variáveis, DSR, adicionais,
// insalubridade, jornada e demais particularidades não são cobertos).

export const AVISO_ESTIMATIVA = 'Estimativa a conferir: o cálculo segue regras gerais da CLT e das tabelas parametrizadas; não considera convenção coletiva, médias de variáveis, DSR sobre horas extras, adicionais e particularidades do contrato.'

/** INSS do empregado (alíquotas progressivas, limitado ao teto). */
export function calcInss(base: number, t: TabelaInss): number {
  const b = Math.min(Math.max(0, base), t.teto)
  let prev = 0, total = 0
  for (const f of t.faixas) {
    if (b > prev) total += (Math.min(b, f.ate) - prev) * f.aliquota
    prev = f.ate
  }
  return r2(total)
}

export interface ResultadoIrrf { imposto: number; metodo: 'LEGAL' | 'SIMPLIFICADO'; base: number; impostoAntesRedutor: number; redutor: number }
function impostoTabela(base: number, t: TabelaIrrf): number {
  if (base <= 0) return 0
  const f = t.faixas.find((x) => x.ate == null || base <= x.ate)!
  return Math.max(0, base * f.aliquota - f.deducao)
}
/** IRRF mensal: escolhe a forma mais favorável (deduções legais x desconto simplificado) e aplica o redutor da vigência, quando houver. */
export function calcIrrf(t: TabelaIrrf, p: { bruto: number; inss: number; dependentes?: number; pensao?: number }): ResultadoIrrf {
  const dep = (p.dependentes || 0) * t.dedDependente
  const baseLegal = Math.max(0, p.bruto - p.inss - dep - (p.pensao || 0))
  const baseSimpl = Math.max(0, p.bruto - t.descontoSimplificado)
  const iLegal = impostoTabela(baseLegal, t), iSimpl = impostoTabela(baseSimpl, t)
  const usaSimpl = iSimpl < iLegal
  let imposto = usaSimpl ? iSimpl : iLegal
  const antes = imposto
  let redutor = 0
  if (t.redutor && p.bruto <= t.redutor.reducaoAte) redutor = p.bruto <= t.redutor.isencaoAte ? imposto : Math.max(0, Math.min(imposto, t.redutor.a - t.redutor.b * p.bruto))
  imposto = Math.max(0, imposto - redutor)
  return { imposto: r2(imposto), metodo: usaSimpl ? 'SIMPLIFICADO' : 'LEGAL', base: r2(usaSimpl ? baseSimpl : baseLegal), impostoAntesRedutor: r2(antes), redutor: r2(redutor) }
}

export interface FuncCalc {
  salarioBase: number; dependentes: number; optanteVt: boolean; vtMensal: number; jornadaMensal: number; pensaoAlimenticia: number
  admissao: Date; demissao?: Date | null
}
export interface EntradasFolha { faltas?: number; horasExtras50?: number; horasExtras100?: number; outrosProventos?: number; outrosDescontos?: number; adicionalNoturno?: number }
export interface Linha { codigo: string; descricao: string; referencia?: string; valor: number }

/** Dias do mês (base comercial de 30) em que o funcionário esteve vinculado, para admissões/desligamentos no mês. competencia: AAAA-MM */
export function diasVinculo(f: Pick<FuncCalc, 'admissao' | 'demissao'>, competencia: string): number {
  const [a, m] = competencia.split('-').map(Number)
  const ini = new Date(Date.UTC(a, m - 1, 1, 12)), fim = new Date(Date.UTC(a, m, 0, 12))
  const adm = meioDia(f.admissao)
  const dem = f.demissao ? meioDia(f.demissao) : null
  if (adm > fim || (dem && dem < ini)) return 0
  const dIni = adm > ini ? Math.min(30, adm.getUTCDate()) : 1
  const dFim = dem && dem <= fim ? Math.min(30, dem.getUTCDate()) : 30
  return Math.max(0, dFim - dIni + 1)
}

export function calcFolhaMensal(f: FuncCalc, e: EntradasFolha, t: TabelasFolha, competencia: string) {
  const dias = diasVinculo(f, competencia)
  const salario = r2((f.salarioBase / 30) * dias)
  const valorHora = f.salarioBase / (f.jornadaMensal || 220)
  const faltas = Math.min(e.faltas || 0, dias)
  const descFaltas = r2((f.salarioBase / 30) * faltas)
  const he50 = r2(valorHora * 1.5 * (e.horasExtras50 || 0)), he100 = r2(valorHora * 2 * (e.horasExtras100 || 0))
  const adNoturno = r2(e.adicionalNoturno || 0)
  const proventos: Linha[] = [{ codigo: '001', descricao: 'Salário', referencia: `${dias} dias`, valor: salario }]
  if (he50) proventos.push({ codigo: '021', descricao: 'Horas extras 50%', referencia: `${e.horasExtras50}h`, valor: he50 })
  if (he100) proventos.push({ codigo: '022', descricao: 'Horas extras 100%', referencia: `${e.horasExtras100}h`, valor: he100 })
  if (adNoturno) proventos.push({ codigo: '031', descricao: 'Adicional noturno', valor: adNoturno })
  if (e.outrosProventos) proventos.push({ codigo: '090', descricao: 'Outros proventos', valor: r2(e.outrosProventos) })
  const totalProventos = r2(proventos.reduce((s, p) => s + p.valor, 0))
  const bruto = r2(totalProventos - descFaltas)
  const inss = calcInss(bruto, t.inss)
  const ir = calcIrrf(t.irrf, { bruto, inss, dependentes: f.dependentes, pensao: f.pensaoAlimenticia })
  const vtTeto = r2(f.salarioBase * 0.06)
  const vt = f.optanteVt ? r2(f.vtMensal > 0 ? Math.min(vtTeto, f.vtMensal) : vtTeto) : 0
  const descontos: Linha[] = []
  if (descFaltas) descontos.push({ codigo: '501', descricao: 'Faltas', referencia: `${faltas} dia(s)`, valor: descFaltas })
  descontos.push({ codigo: '510', descricao: 'INSS', valor: inss })
  if (ir.imposto) descontos.push({ codigo: '520', descricao: `IRRF (${ir.metodo === 'LEGAL' ? 'deduções legais' : 'desconto simplificado'}${ir.redutor ? ', com redutor' : ''})`, valor: ir.imposto })
  if (vt) descontos.push({ codigo: '530', descricao: 'Vale-transporte (até 6% do salário)', valor: vt })
  if (f.pensaoAlimenticia) descontos.push({ codigo: '540', descricao: 'Pensão alimentícia', valor: r2(f.pensaoAlimenticia) })
  if (e.outrosDescontos) descontos.push({ codigo: '590', descricao: 'Outros descontos', valor: r2(e.outrosDescontos) })
  // Faltas já reduzem o bruto: não entram duas vezes no líquido.
  const totalDescontos = r2(descontos.filter((d) => d.codigo !== '501').reduce((s, d) => s + d.valor, 0))
  const liquido = r2(bruto - totalDescontos)
  const fgts = r2(bruto * t.fgts.aliquota)
  return { dias, proventos, descontos, totalProventos, totalDescontos: r2(totalDescontos + descFaltas), bruto, inss, irrf: ir.imposto, irrfDetalhe: ir, vt, fgts, liquido, bases: { inss: bruto, irrf: ir.base, fgts: bruto }, encargos: { fgts }, estimativa: true, aviso: AVISO_ESTIMATIVA }
}

// ---------------- 13º salário ----------------
export function mesesTrabalhadosNoAno(admissao: Date, fimRef: Date, ano: number): number {
  const ini = new Date(Date.UTC(ano, 0, 1, 12)), fim = new Date(Date.UTC(ano, 11, 31, 12))
  const a = meioDia(admissao) > ini ? meioDia(admissao) : ini
  const z = meioDia(fimRef) < fim ? meioDia(fimRef) : fim
  if (z < a) return 0
  let meses = 0
  for (let m = 0; m < 12; m++) {
    const mi = new Date(Date.UTC(ano, m, 1, 12)), mf = new Date(Date.UTC(ano, m + 1, 0, 12))
    const de = a > mi ? a : mi, ate = z < mf ? z : mf
    if (ate >= de && diffDias(ate, de) + 1 >= 15) meses++
  }
  return meses
}

export function calcDecimoTerceiro(f: FuncCalc, t: TabelasFolha, ano: number, parcela: 1 | 2, mediaVariaveis = 0, adiantamentoPago?: number) {
  const fimRef = f.demissao && meioDia(f.demissao).getUTCFullYear() === ano ? f.demissao : new Date(Date.UTC(ano, 11, 31, 12))
  const meses = mesesTrabalhadosNoAno(f.admissao, fimRef, ano)
  const bruto13 = r2(((f.salarioBase + mediaVariaveis) / 12) * meses)
  const primeira = r2(bruto13 * 0.5)
  if (parcela === 1) return { meses, bruto13, parcela: 1, valor: primeira, inss: 0, irrf: 0, liquido: primeira, fgts: r2(primeira * t.fgts.aliquota), observacao: '1ª parcela: 50% do valor, sem descontos (pagamento até 30/11).', estimativa: true, aviso: AVISO_ESTIMATIVA }
  const inss = calcInss(bruto13, t.inss)
  const ir = calcIrrf(t.irrf, { bruto: bruto13, inss, dependentes: f.dependentes, pensao: f.pensaoAlimenticia })
  const adiantado = adiantamentoPago ?? primeira
  const liquido = r2(bruto13 - adiantado - inss - ir.imposto)
  return { meses, bruto13, parcela: 2, valor: r2(bruto13 - adiantado), inss, irrf: ir.imposto, liquido, fgts: r2((bruto13 - adiantado) * t.fgts.aliquota), observacao: '2ª parcela: valor integral menos o adiantamento, com INSS e IRRF (pagamento até 20/12). IRRF sobre o 13º é calculado separadamente da folha mensal.', estimativa: true, aviso: AVISO_ESTIMATIVA }
}

// ---------------- férias ----------------
export function periodosAquisitivos(admissao: Date, ate: Date) {
  const out: Array<{ inicio: Date; fim: Date; concessivoFim: Date }> = []
  const adm = meioDia(admissao)
  for (let n = 0; n < 60; n++) {
    const ini = new Date(Date.UTC(adm.getUTCFullYear() + n, adm.getUTCMonth(), adm.getUTCDate(), 12))
    const fim = new Date(Date.UTC(adm.getUTCFullYear() + n + 1, adm.getUTCMonth(), adm.getUTCDate() - 1, 12))
    if (ini > ate) break
    out.push({ inicio: ini, fim, concessivoFim: new Date(Date.UTC(fim.getUTCFullYear() + 1, fim.getUTCMonth(), fim.getUTCDate(), 12)) })
  }
  return out
}

export function calcFerias(f: FuncCalc, t: TabelasFolha, o: { dias: number; abono?: boolean; mediaVariaveis?: number }) {
  const dias = Math.min(30, Math.max(5, o.dias))
  const base = f.salarioBase + (o.mediaVariaveis || 0)
  const diaria = base / 30
  const gozo = r2(diaria * dias), tercoGozo = r2(gozo / 3)
  const abonoDias = o.abono ? Math.min(10, Math.floor(30 / 3)) : 0
  const abono = r2(diaria * abonoDias), tercoAbono = r2(abono / 3)
  const brutoTributavel = r2(gozo + tercoGozo)
  const inss = calcInss(brutoTributavel, t.inss)
  const ir = calcIrrf(t.irrf, { bruto: brutoTributavel, inss, dependentes: f.dependentes, pensao: 0 })
  const liquido = r2(brutoTributavel + abono + tercoAbono - inss - ir.imposto)
  return { diasGozo: dias, abonoDias, valorFerias: gozo, tercoConstitucional: tercoGozo, abonoPecuniario: abono, tercoAbono, brutoTributavel, inss, irrf: ir.imposto, liquido, fgts: r2(brutoTributavel * t.fgts.aliquota), observacao: 'Abono pecuniário e seu terço são isentos de INSS e IRRF. Pagamento até 2 dias antes do início do gozo. Férias fracionadas: máx. 3 períodos, um deles com 14+ dias.', estimativa: true, aviso: AVISO_ESTIMATIVA }
}

export function situacaoFerias(concessivoFim: Date, hoje = new Date(), alertaDias = 90) {
  const d = diffDias(concessivoFim, hoje)
  return { diasParaVencer: d, situacao: d < 0 ? 'VENCIDA' : d <= alertaDias ? 'A_VENCER' : 'NO_PRAZO', alerta: d <= alertaDias, observacao: d < 0 ? 'Período concessivo vencido: férias devem ser pagas em dobro (CLT art. 137), salvo exceções — conferir.' : undefined }
}

// ---------------- rescisão ----------------
export const TIPOS_RESCISAO = ['SEM_JUSTA_CAUSA', 'PEDIDO_DEMISSAO', 'ACORDO_484A', 'JUSTA_CAUSA', 'TERMINO_CONTRATO'] as const
export type TipoRescisao = (typeof TIPOS_RESCISAO)[number]
export const ROTULO_RESCISAO: Record<TipoRescisao, string> = { SEM_JUSTA_CAUSA: 'Dispensa sem justa causa', PEDIDO_DEMISSAO: 'Pedido de demissão', ACORDO_484A: 'Acordo entre as partes (art. 484-A da CLT)', JUSTA_CAUSA: 'Dispensa por justa causa', TERMINO_CONTRATO: 'Término de contrato de experiência/prazo determinado' }
export type AvisoPrevio = 'INDENIZADO' | 'TRABALHADO' | 'DISPENSADO' | 'NAO_CUMPRIDO'

export function anosCompletos(admissao: Date, ate: Date): number {
  const a = meioDia(admissao), z = meioDia(ate)
  let n = z.getUTCFullYear() - a.getUTCFullYear()
  if (z.getUTCMonth() < a.getUTCMonth() || (z.getUTCMonth() === a.getUTCMonth() && z.getUTCDate() < a.getUTCDate())) n--
  return Math.max(0, n)
}
export const diasAvisoPrevio = (admissao: Date, desligamento: Date) => Math.min(90, 30 + 3 * anosCompletos(admissao, desligamento))

export interface EntradaRescisao {
  f: FuncCalc; tipo: TipoRescisao; desligamento: Date; avisoPrevio: AvisoPrevio
  periodosFeriasVencidos?: number; saldoFgts?: number; mediaVariaveis?: number; adiantamento13?: number; outrosDescontos?: number
}
export interface Verba { codigo: string; descricao: string; referencia?: string; valor: number; tipo: 'PROVENTO' | 'DESCONTO'; incidencias?: string }

export function calcRescisao(e: EntradaRescisao, t: TabelasFolha) {
  const { f, tipo } = e
  const desl = meioDia(e.desligamento)
  const salario = f.salarioBase + (e.mediaVariaveis || 0)
  const diaria = salario / 30
  const verbas: Verba[] = []
  const anos = anosCompletos(f.admissao, desl)
  const avisoDias = diasAvisoPrevio(f.admissao, desl)
  const justa = tipo === 'JUSTA_CAUSA'

  // saldo de salário
  const diasSaldo = Math.min(30, desl.getUTCDate())
  const diasMesAdm = f.admissao > new Date(Date.UTC(desl.getUTCFullYear(), desl.getUTCMonth(), 1, 12)) ? Math.min(29, meioDia(f.admissao).getUTCDate() - 1) : 0
  const saldoSalario = r2((f.salarioBase / 30) * Math.max(0, diasSaldo - diasMesAdm))
  verbas.push({ codigo: 'R01', descricao: 'Saldo de salário', referencia: `${Math.max(0, diasSaldo - diasMesAdm)} dias`, valor: saldoSalario, tipo: 'PROVENTO', incidencias: 'INSS, IRRF, FGTS' })

  // aviso prévio
  let avisoIndenizado = 0, avisoDescontado = 0, projecaoDias = 0
  const indeniza = e.avisoPrevio === 'INDENIZADO' || e.avisoPrevio === 'DISPENSADO'
  if ((tipo === 'SEM_JUSTA_CAUSA') && indeniza) { avisoIndenizado = r2(diaria * avisoDias); projecaoDias = avisoDias }
  else if (tipo === 'ACORDO_484A' && indeniza) { avisoIndenizado = r2((diaria * avisoDias) / 2); projecaoDias = avisoDias / 2 }
  else if (tipo === 'PEDIDO_DEMISSAO' && e.avisoPrevio === 'NAO_CUMPRIDO') avisoDescontado = r2(f.salarioBase)
  if (avisoIndenizado) verbas.push({ codigo: 'R02', descricao: tipo === 'ACORDO_484A' ? 'Aviso prévio indenizado (50% - acordo)' : 'Aviso prévio indenizado', referencia: `${tipo === 'ACORDO_484A' ? avisoDias / 2 : avisoDias} dias`, valor: avisoIndenizado, tipo: 'PROVENTO', incidencias: 'FGTS (sem INSS/IRRF)' })

  // data projetada (o aviso indenizado integra o tempo de serviço para 13º e férias proporcionais)
  const proj = projecaoDias ? somaDias(desl, Math.round(projecaoDias)) : desl

  // 13º proporcional
  let decimo = 0, mesesDecimo = 0
  if (!justa) {
    mesesDecimo = mesesTrabalhadosNoAno(f.admissao, proj, proj.getUTCFullYear())
    decimo = r2((salario / 12) * mesesDecimo)
    verbas.push({ codigo: 'R03', descricao: '13º salário proporcional', referencia: `${mesesDecimo}/12`, valor: decimo, tipo: 'PROVENTO', incidencias: 'INSS, IRRF (separado), FGTS' })
  }

  // férias vencidas e proporcionais (+ 1/3)
  const venc = e.periodosFeriasVencidos || 0
  let feriasVenc = 0, feriasProp = 0, mesesFerias = 0
  if (venc > 0) { feriasVenc = r2(salario * venc); verbas.push({ codigo: 'R04', descricao: `Férias vencidas${venc > 1 ? ` (${venc} períodos)` : ''}`, referencia: `${venc} período(s)`, valor: feriasVenc, tipo: 'PROVENTO', incidencias: 'indenizatória (sem INSS/IRRF)' }); verbas.push({ codigo: 'R05', descricao: '1/3 constitucional sobre férias vencidas', valor: r2(feriasVenc / 3), tipo: 'PROVENTO', incidencias: 'indenizatória' }) }
  if (!justa) {
    const periodos = periodosAquisitivos(f.admissao, proj)
    const ult = periodos[periodos.length - 1]
    const ini = ult ? ult.inicio : meioDia(f.admissao)
    let m = 0
    const dEnd = proj
    for (let k = 0; k < 12; k++) {
      const mi = new Date(Date.UTC(ini.getUTCFullYear(), ini.getUTCMonth() + k, ini.getUTCDate(), 12))
      const mf = new Date(Date.UTC(ini.getUTCFullYear(), ini.getUTCMonth() + k + 1, ini.getUTCDate() - 1, 12))
      if (mi > dEnd) break
      const ate = mf < dEnd ? mf : dEnd
      if (diffDias(ate, mi) + 1 >= 15) m++
    }
    mesesFerias = Math.min(12, m)
    if (mesesFerias > 0) {
      feriasProp = r2((salario / 12) * mesesFerias)
      verbas.push({ codigo: 'R06', descricao: 'Férias proporcionais', referencia: `${mesesFerias}/12`, valor: feriasProp, tipo: 'PROVENTO', incidencias: 'indenizatória' })
      verbas.push({ codigo: 'R07', descricao: '1/3 constitucional sobre férias proporcionais', valor: r2(feriasProp / 3), tipo: 'PROVENTO', incidencias: 'indenizatória' })
    }
  }

  // descontos
  const inssSaldo = calcInss(saldoSalario, t.inss)
  const irSaldo = calcIrrf(t.irrf, { bruto: saldoSalario, inss: inssSaldo, dependentes: f.dependentes, pensao: 0 })
  const inss13 = decimo ? calcInss(decimo, t.inss) : 0
  const ir13 = decimo ? calcIrrf(t.irrf, { bruto: decimo, inss: inss13, dependentes: f.dependentes, pensao: 0 }) : { imposto: 0 } as any
  const descontos: Verba[] = []
  if (inssSaldo) descontos.push({ codigo: 'D01', descricao: 'INSS sobre saldo de salário', valor: inssSaldo, tipo: 'DESCONTO' })
  if (irSaldo.imposto) descontos.push({ codigo: 'D02', descricao: 'IRRF sobre saldo de salário', valor: irSaldo.imposto, tipo: 'DESCONTO' })
  if (inss13) descontos.push({ codigo: 'D03', descricao: 'INSS sobre 13º salário', valor: inss13, tipo: 'DESCONTO' })
  if (ir13.imposto) descontos.push({ codigo: 'D04', descricao: 'IRRF sobre 13º salário (tributação exclusiva)', valor: ir13.imposto, tipo: 'DESCONTO' })
  if (avisoDescontado) descontos.push({ codigo: 'D05', descricao: 'Aviso prévio não cumprido pelo empregado', referencia: '30 dias', valor: avisoDescontado, tipo: 'DESCONTO' })
  if (e.adiantamento13) descontos.push({ codigo: 'D06', descricao: 'Adiantamento de 13º já pago', valor: r2(e.adiantamento13), tipo: 'DESCONTO' })
  if (e.outrosDescontos) descontos.push({ codigo: 'D09', descricao: 'Outros descontos', valor: r2(e.outrosDescontos), tipo: 'DESCONTO' })

  const totalProventos = r2(verbas.reduce((s, v) => s + v.valor, 0))
  const totalDescontos = r2(descontos.reduce((s, v) => s + v.valor, 0))
  const liquido = r2(totalProventos - totalDescontos)

  // FGTS
  const depositoRescisorio = r2((saldoSalario + decimo + avisoIndenizado) * t.fgts.aliquota)
  const mesesServico = Math.max(1, Math.round(diffDias(desl, f.admissao) / 30))
  const saldoEstimado = r2(f.salarioBase * t.fgts.aliquota * mesesServico)
  const saldoBase = e.saldoFgts != null ? e.saldoFgts : saldoEstimado
  const pct = tipo === 'SEM_JUSTA_CAUSA' ? t.fgts.multaSemJustaCausa : tipo === 'ACORDO_484A' ? t.fgts.multaAcordo : 0
  const multa = r2((saldoBase + depositoRescisorio) * pct)

  const total = r2(liquido) // valor líquido a pagar ao empregado (multa do FGTS é paga à parte, ao fundo/empregado via conta vinculada)
  return {
    tipo, rotuloTipo: ROTULO_RESCISAO[tipo], desligamento: desl.toISOString().slice(0, 10), anosCompletos: anos, avisoDias, avisoPrevio: e.avisoPrevio,
    verbas: [...verbas, ...descontos], totalProventos, totalDescontos, liquido: total,
    fgts: { depositoRescisorio, saldoConsiderado: r2(saldoBase), saldoEstimado: e.saldoFgts == null, percentualMulta: pct, multa, saqueLiberado: tipo === 'ACORDO_484A' ? '80% do saldo' : tipo === 'SEM_JUSTA_CAUSA' ? '100% do saldo' : 'não liberado', observacao: 'Multa e saldo devem ser conferidos no extrato analítico do FGTS (Conectividade Social).' },
    seguroDesemprego: tipo === 'SEM_JUSTA_CAUSA' ? 'Em tese elegível (conferir requisitos de tempo de serviço e carência).' : tipo === 'ACORDO_484A' ? 'Não há direito a seguro-desemprego no acordo.' : 'Não elegível nesta modalidade.',
    prazoPagamento: 'Até 10 dias corridos contados do término do contrato (CLT art. 477, §6º).',
    memoria: { saldoSalario, avisoIndenizado, avisoDescontado, decimo, mesesDecimo, feriasVencidas: feriasVenc, feriasProporcionais: feriasProp, mesesFerias, projecaoDias },
    estimativa: true, aviso: AVISO_ESTIMATIVA,
  }
}

// ---------------- documentos imprimíveis ----------------
const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export function textoHolerite(emp: { empresa: string; nome: string; cargo?: string | null; competencia: string; tipo: string }, c: ReturnType<typeof calcFolhaMensal>): string {
  const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length))
  const l = (x: Linha, d: boolean) => `${pad(x.codigo, 5)}${pad(x.descricao, 42)}${pad(x.referencia || '', 12)}${(d ? '-' : '') + fmt(x.valor)}`
  return `HOLERITE / RECIBO DE PAGAMENTO — ESTIMATIVA (conferir com o contador)
Empresa: ${emp.empresa}      Competência: ${emp.competencia} (${emp.tipo})
Funcionário: ${emp.nome}      Cargo: ${emp.cargo || '—'}
${'-'.repeat(78)}
${c.proventos.map((p) => l(p, false)).join('\n')}
${c.descontos.map((d) => l(d, true)).join('\n')}
${'-'.repeat(78)}
Total de proventos: ${fmt(c.totalProventos)}   Total de descontos: ${fmt(c.totalDescontos)}
LÍQUIDO A RECEBER: ${fmt(c.liquido)}
Base INSS: ${fmt(c.bases.inss)}   Base IRRF: ${fmt(c.bases.irrf)}   FGTS do mês (encargo da empresa): ${fmt(c.fgts)}

${AVISO_ESTIMATIVA}
Este documento não substitui um contador; valide antes de pagar ou enviar. Dados tratados conforme a LGPD.`
}

export function textoRescisao(emp: { empresa: string; nome: string; cargo?: string | null; admissao: Date }, r: ReturnType<typeof calcRescisao>): string {
  const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length))
  return `TERMO DE RESCISÃO DO CONTRATO DE TRABALHO — MINUTA/ESTIMATIVA
(Não é o TRCT oficial homologável: serve de conferência para o contador.)
Empregador: ${emp.empresa}
Empregado: ${emp.nome}     Cargo: ${emp.cargo || '—'}
Admissão: ${meioDia(emp.admissao).toISOString().slice(0, 10)}    Desligamento: ${r.desligamento}    Tempo: ${r.anosCompletos} ano(s) completo(s)
Causa do afastamento: ${r.rotuloTipo}    Aviso prévio: ${r.avisoPrevio} (${r.avisoDias} dias)
${'-'.repeat(78)}
${r.verbas.map((v) => `${pad(v.codigo, 5)}${pad(v.descricao, 52)}${pad(v.referencia || '', 12)}${(v.tipo === 'DESCONTO' ? '-' : '') + fmt(v.valor)}`).join('\n')}
${'-'.repeat(78)}
Total de proventos: ${fmt(r.totalProventos)}    Total de descontos: ${fmt(r.totalDescontos)}
LÍQUIDO A PAGAR: ${fmt(r.liquido)}
FGTS: depósito rescisório ${fmt(r.fgts.depositoRescisorio)}; saldo considerado ${fmt(r.fgts.saldoConsiderado)}${r.fgts.saldoEstimado ? ' (ESTIMADO)' : ''}; multa de ${Math.round(r.fgts.percentualMulta * 100)}%: ${fmt(r.fgts.multa)}; saque: ${r.fgts.saqueLiberado}.
Seguro-desemprego: ${r.seguroDesemprego}
Prazo de pagamento: ${r.prazoPagamento}

Assinaturas: ______________________ (empregador)     ______________________ (empregado)

${AVISO_ESTIMATIVA}
Este documento não substitui um contador; valide antes de pagar ou enviar. Dados tratados conforme a LGPD.`
}
