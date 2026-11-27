import { createHash } from 'crypto'
import { ehServico } from '../regime/cnae'
import { aliquotaEfetivaSimples, anexoDaAtividade, dasMeiMensal, irpjTrimestre, Regime } from '../regime/calculo'
import { Atividade, TabelasFiscais } from '../regime/tabelas'
import { brl, pct, r2, somaMeses, ultimoDiaUtilDoMes, vencimentoDia } from '../nucleo/util'

// Cálculo (PURO) das guias a partir dos números da competência. Resultado = ESTIMATIVA/SIMULAÇÃO; nunca é guia oficial.

export type Tributo = 'IRPJ' | 'CSLL' | 'PIS' | 'COFINS' | 'IRRF' | 'IRPF_CARNE_LEAO' | 'DAS' | 'DAS_MEI' | 'INSS' | 'FGTS' | 'ISS'
export type TipoGuia = 'DARF' | 'DAS' | 'GPS' | 'FGTS' | 'ISS'

export const NOME_TRIBUTO: Record<Tributo, string> = {
  IRPJ: 'IRPJ', CSLL: 'CSLL', PIS: 'PIS', COFINS: 'COFINS (não confundir com "corona")', IRRF: 'IRRF (imposto retido na fonte)', IRPF_CARNE_LEAO: 'IRPF — carnê-leão',
  DAS: 'DAS (Simples Nacional)', DAS_MEI: 'DAS-MEI', INSS: 'INSS / GPS', FGTS: 'FGTS (FGTS Digital)', ISS: 'ISS',
}
export const TIPO_DO_TRIBUTO: Record<Tributo, TipoGuia> = { IRPJ: 'DARF', CSLL: 'DARF', PIS: 'DARF', COFINS: 'DARF', IRRF: 'DARF', IRPF_CARNE_LEAO: 'DARF', DAS: 'DAS', DAS_MEI: 'DAS', INSS: 'GPS', FGTS: 'FGTS', ISS: 'ISS' }

export interface EmpresaFiscal { tipoPessoa: string; regime: Regime; atividade: Atividade; anexoForcado?: string | null; issAliquotaPct?: number | null; icmsAliquotaPct?: number | null }
export interface DadosCompetencia {
  competencia: string
  receita: number; despesas: number; folha: number; compras: number; irrfRetido: number
  /** Receita dos 12 meses ANTERIORES à competência (base do Simples) e quantos desses meses têm dados. */
  rbt12Anterior: number; mesesAnterioresComDados: number
  /** Soma dos 3 meses do trimestre que termina na competência (para IRPJ/CSLL trimestrais). */
  trimestre: { receita: number; despesas: number }
  /** Folha dos 12 meses anteriores (fator R). */
  folha12Anterior: number
}
export interface GuiaCalculada {
  tributo: Tributo; tipoGuia: TipoGuia; codigoReceita: string; competencia: string; periodicidade: 'MENSAL' | 'TRIMESTRAL'
  vencimento: Date; baseCalculo: number; aliquota: number | null; valorPrincipal: number; memoria: string[]
}
export interface ObrigacaoPrevista { tributo: Tributo; tipoGuia: TipoGuia; periodicidade: 'MENSAL' | 'TRIMESTRAL'; vencimento: Date }

const mesFimTrimestre = (c: string) => ['03', '06', '09', '12'].includes(c.slice(5, 7))

/** Quais obrigações existem para o regime na competência (usado pelo calendário e pela geração). */
export function obrigacoesDoRegime(emp: Pick<EmpresaFiscal, 'tipoPessoa' | 'regime' | 'atividade'>, comp: string, t: TabelasFiscais, opcoes: { temFolha?: boolean; temIrrf?: boolean } = {}): ObrigacaoPrevista[] {
  const g = t.guias
  const out: ObrigacaoPrevista[] = []
  const add = (tributo: Tributo, periodicidade: 'MENSAL' | 'TRIMESTRAL', vencimento: Date) => out.push({ tributo, tipoGuia: TIPO_DO_TRIBUTO[tributo], periodicidade, vencimento })
  if (emp.tipoPessoa === 'PF') { add('IRPF_CARNE_LEAO', 'MENSAL', ultimoDiaUtilDoMes(somaMeses(comp, 1))); return out }
  if (emp.regime === 'MEI') add('DAS_MEI', 'MENSAL', vencimentoDia(comp, g.diaVencimentoDas))
  else if (emp.regime === 'SIMPLES') add('DAS', 'MENSAL', vencimentoDia(comp, g.diaVencimentoDas))
  else {
    add('PIS', 'MENSAL', vencimentoDia(comp, g.diaVencimentoPisCofins)); add('COFINS', 'MENSAL', vencimentoDia(comp, g.diaVencimentoPisCofins))
    if (ehServico(emp.atividade)) add('ISS', 'MENSAL', vencimentoDia(comp, g.diaVencimentoIssPadrao))
    if (mesFimTrimestre(comp)) { const v = ultimoDiaUtilDoMes(somaMeses(comp, 1)); add('IRPJ', 'TRIMESTRAL', v); add('CSLL', 'TRIMESTRAL', v) }
  }
  if (opcoes.temFolha) { add('INSS', 'MENSAL', vencimentoDia(comp, g.diaVencimentoGps)); add('FGTS', 'MENSAL', vencimentoDia(comp, g.diaVencimentoFgts)) }
  if (opcoes.temIrrf) add('IRRF', 'MENSAL', vencimentoDia(comp, g.diaVencimentoIrrf))
  return out
}

/** Carnê-leão mensal (PF). Tabela e redutor em tabelas.ts — conferir. */
export function carneLeao(base: number, t: TabelasFiscais) {
  const c = t.carneLeao
  const b = Math.max(0, r2(base))
  const f = c.faixas.find((x) => b <= x.ate) ?? c.faixas[c.faixas.length - 1]
  let imposto = Math.max(0, (b * f.aliquota) / 100 - f.deduzir)
  const memo: string[] = [`Base do carnê-leão = rendimentos − despesas do livro-caixa = ${brl(b)}.`, `Tabela progressiva: alíquota ${pct(f.aliquota)} e dedução ${brl(f.deduzir)} → imposto bruto ${brl(imposto)}.`]
  if (b <= c.isencaoRedutorAte) { imposto = 0; memo.push(`Base até ${brl(c.isencaoRedutorAte)}: redutor zera o imposto (regra de isenção — conferir).`) }
  else if (b <= c.redutorMaxAte) { const red = Math.max(0, c.redutorA - c.redutorB * b); imposto = Math.max(0, imposto - red); memo.push(`Redutor = ${brl(c.redutorA)} − ${c.redutorB} × base = ${brl(red)} → imposto ${brl(imposto)} (conferir).`) }
  return { imposto: r2(imposto), aliquota: f.aliquota, memo }
}

/** Calcula todas as guias da competência (somente as que têm valor > 0, exceto DAS-MEI que é fixo). */
export function calcularGuias(emp: EmpresaFiscal, d: DadosCompetencia, t: TabelasFiscais): GuiaCalculada[] {
  const comp = d.competencia
  const g = t.guias
  const out: GuiaCalculada[] = []
  const push = (x: GuiaCalculada) => { if (x.valorPrincipal > 0 || x.tributo === 'DAS_MEI') out.push({ ...x, valorPrincipal: r2(x.valorPrincipal) }) }
  const venc = (tr: Tributo) => obrigacoesDoRegime(emp, comp, t, { temFolha: true, temIrrf: true }).find((o) => o.tributo === tr)?.vencimento
  const real = emp.regime === 'REAL'

  if (emp.tipoPessoa === 'PF') {
    const base = Math.max(0, d.receita - d.despesas)
    const c = carneLeao(base, t)
    push({ tributo: 'IRPF_CARNE_LEAO', tipoGuia: 'DARF', codigoReceita: '0190', competencia: comp, periodicidade: 'MENSAL', vencimento: venc('IRPF_CARNE_LEAO')!, baseCalculo: base, aliquota: c.aliquota, valorPrincipal: c.imposto, memoria: c.memo })
    return out
  }

  if (emp.regime === 'MEI') {
    const m = dasMeiMensal(emp.atividade, t)
    push({ tributo: 'DAS_MEI', tipoGuia: 'DAS', codigoReceita: 'DAS-MEI', competencia: comp, periodicidade: 'MENSAL', vencimento: venc('DAS_MEI')!, baseCalculo: d.receita, aliquota: null, valorPrincipal: m.total, memoria: [`DAS-MEI fixo = 5% do salário mínimo (${brl(t.salarioMinimo)}) = ${brl(m.inss)} + ${m.rotulo.includes('ICMS') ? 'ICMS' : 'ISS'} ${brl(m.complemento)} = ${brl(m.total)}.`, `Receita do mês: ${brl(d.receita)} (limite anual do MEI: ${brl(t.mei.limiteAnual)}).`] })
  } else if (emp.regime === 'SIMPLES') {
    // RBT12: receita dos 12 meses anteriores; sem histórico completo, proporcionaliza (média × 12) ou, sem nada, anualiza a receita do mês.
    let rbt12 = d.rbt12Anterior
    const mem: string[] = []
    if (d.mesesAnterioresComDados < 12) {
      rbt12 = d.mesesAnterioresComDados > 0 ? (d.rbt12Anterior / d.mesesAnterioresComDados) * 12 : d.receita * 12
      mem.push(`Histórico anterior com ${d.mesesAnterioresComDados} mês(es): RBT12 proporcionalizada = ${brl(rbt12)}.`)
    } else mem.push(`RBT12 (12 meses anteriores) = ${brl(rbt12)}.`)
    const fatorR = rbt12 > 0 ? (d.folha12Anterior / rbt12) * 100 : null
    const anexo = anexoDaAtividade(emp.atividade, fatorR, t, (emp.anexoForcado as any) ?? null)
    const ef = aliquotaEfetivaSimples(anexo, rbt12, t)
    if (emp.atividade === 'SERVICOS_FATOR_R') mem.push(`Fator R = ${fatorR == null ? 'n/d' : pct(fatorR)} (mínimo ${pct(t.simples.fatorRMinPct, 0)}) → Anexo ${anexo}.`)
    mem.push(`Anexo ${anexo}, ${ef.faixa}ª faixa: alíquota efetiva = (RBT12 × ${pct(ef.nominalPct)} − ${brl(ef.deduzir)}) ÷ RBT12 = ${pct(ef.efetivaPct, 4)}.`)
    const v = (d.receita * ef.efetivaPct) / 100
    mem.push(`DAS = receita do mês ${brl(d.receita)} × ${pct(ef.efetivaPct, 4)} = ${brl(v)}.`)
    if (rbt12 > t.simples.sublimiteAnual) mem.push('ATENÇÃO: RBT12 acima do sublimite — ICMS/ISS são recolhidos fora do DAS; esta guia não inclui esses valores.')
    push({ tributo: 'DAS', tipoGuia: 'DAS', codigoReceita: 'DAS', competencia: comp, periodicidade: 'MENSAL', vencimento: venc('DAS')!, baseCalculo: d.receita, aliquota: r2(ef.efetivaPct * 10000) / 10000, valorPrincipal: v, memoria: mem })
    if (anexo !== 'IV' && d.folha > 0) {
      // Fora do Anexo IV a CPP patronal já está no DAS; continua devida a parcela descontada dos empregados (estimativa).
      const sg = t.encargosFolha.seguradosMediaPct
      push({ tributo: 'INSS', tipoGuia: 'GPS', codigoReceita: '2003', competencia: comp, periodicidade: 'MENSAL', vencimento: venc('INSS')!, baseCalculo: d.folha, aliquota: sg, valorPrincipal: (d.folha * sg) / 100, memoria: [`Simples (Anexo ${anexo}): a CPP patronal está dentro do DAS; resta o INSS descontado dos empregados (média estimada ${pct(sg)}) sobre a folha ${brl(d.folha)}. O valor real vem da folha de pagamento.`] })
    }
    if (anexo === 'IV' && d.folha > 0) {
      const p = t.simples.cppPatronalPct + t.simples.ratPct
      push({ tributo: 'INSS', tipoGuia: 'GPS', codigoReceita: '2003', competencia: comp, periodicidade: 'MENSAL', vencimento: venc('INSS')!, baseCalculo: d.folha, aliquota: p + t.encargosFolha.seguradosMediaPct, valorPrincipal: (d.folha * (p + t.encargosFolha.seguradosMediaPct)) / 100, memoria: [`Anexo IV: INSS patronal fora do DAS: ${pct(p)} + descontado dos empregados (média estimada ${pct(t.encargosFolha.seguradosMediaPct)}) sobre folha ${brl(d.folha)}.`] })
    }
  } else {
    const p = emp.regime === 'PRESUMIDO' ? t.presumido : null
    const r = t.real
    const baseR = Math.max(0, d.receita - (real ? d.compras : 0))
    const pisP = real ? r.pisPct : t.presumido.pisPct, cofP = real ? r.cofinsPct : t.presumido.cofinsPct
    const cumul = real ? 'não cumulativo' : 'cumulativo'
    push({ tributo: 'PIS', tipoGuia: 'DARF', codigoReceita: real ? '6912' : '8109', competencia: comp, periodicidade: 'MENSAL', vencimento: venc('PIS')!, baseCalculo: baseR, aliquota: pisP, valorPrincipal: (baseR * pisP) / 100, memoria: [`PIS ${cumul}: ${pct(pisP)} × ${real ? `(receita ${brl(d.receita)} − compras/insumos ${brl(d.compras)})` : `receita ${brl(d.receita)}`} = ${brl((baseR * pisP) / 100)}.`, 'Créditos reais do regime não cumulativo dependem das notas de entrada e das regras de cada insumo.'] })
    push({ tributo: 'COFINS', tipoGuia: 'DARF', codigoReceita: real ? '5856' : '2172', competencia: comp, periodicidade: 'MENSAL', vencimento: venc('COFINS')!, baseCalculo: baseR, aliquota: cofP, valorPrincipal: (baseR * cofP) / 100, memoria: [`COFINS ${cumul}: ${pct(cofP)} × ${real ? `(receita ${brl(d.receita)} − compras/insumos ${brl(d.compras)})` : `receita ${brl(d.receita)}`} = ${brl((baseR * cofP) / 100)}.`] })
    if (ehServico(emp.atividade)) {
      const iss = emp.issAliquotaPct ?? t.indiretos.issAliquotaPadraoPct
      push({ tributo: 'ISS', tipoGuia: 'ISS', codigoReceita: 'ISS', competencia: comp, periodicidade: 'MENSAL', vencimento: venc('ISS')!, baseCalculo: d.receita, aliquota: iss, valorPrincipal: (d.receita * iss) / 100, memoria: [`ISS = ${pct(iss)} (alíquota do município) × receita de serviços ${brl(d.receita)} = ${brl((d.receita * iss) / 100)}. Vencimento e regras variam por município.`] })
    }
    if (mesFimTrimestre(comp)) {
      const q = d.trimestre
      if (p) {
        const pI = p.presuncaoIrpj[emp.atividade], pC = p.presuncaoCsll[emp.atividade]
        const bI = (q.receita * pI) / 100, bC = (q.receita * pC) / 100
        const x = irpjTrimestre(bI, p)
        push({ tributo: 'IRPJ', tipoGuia: 'DARF', codigoReceita: '2089', competencia: comp, periodicidade: 'TRIMESTRAL', vencimento: venc('IRPJ')!, baseCalculo: r2(bI), aliquota: p.irpjPct, valorPrincipal: x.normal + x.adicional, memoria: [`Trimestre: receita ${brl(q.receita)} × presunção ${pct(pI, 0)} = base ${brl(bI)}.`, `IRPJ ${pct(p.irpjPct, 0)} = ${brl(x.normal)}; adicional ${pct(p.irpjAdicionalPct, 0)} sobre o excedente de ${brl(p.adicionalLimiteTrimestral)} = ${brl(x.adicional)}.`] })
        push({ tributo: 'CSLL', tipoGuia: 'DARF', codigoReceita: '2372', competencia: comp, periodicidade: 'TRIMESTRAL', vencimento: venc('CSLL')!, baseCalculo: r2(bC), aliquota: p.csllPct, valorPrincipal: (bC * p.csllPct) / 100, memoria: [`Trimestre: receita ${brl(q.receita)} × presunção ${pct(pC, 0)} = base ${brl(bC)}; CSLL ${pct(p.csllPct, 0)}.`] })
      } else {
        const lucro = q.receita - q.despesas
        const x = irpjTrimestre(lucro, r)
        push({ tributo: 'IRPJ', tipoGuia: 'DARF', codigoReceita: '0220', competencia: comp, periodicidade: 'TRIMESTRAL', vencimento: venc('IRPJ')!, baseCalculo: r2(Math.max(0, lucro)), aliquota: r.irpjPct, valorPrincipal: x.normal + x.adicional, memoria: [`Trimestre (apuração trimestral): receita ${brl(q.receita)} − despesas ${brl(q.despesas)} = lucro ${brl(lucro)}${lucro <= 0 ? ' (prejuízo: sem imposto; compensação de prejuízos não considerada)' : ''}.`, `IRPJ ${pct(r.irpjPct, 0)} + adicional ${pct(r.irpjAdicionalPct, 0)} sobre o excedente de ${brl(r.adicionalLimiteTrimestral)}.`] })
        push({ tributo: 'CSLL', tipoGuia: 'DARF', codigoReceita: '6012', competencia: comp, periodicidade: 'TRIMESTRAL', vencimento: venc('CSLL')!, baseCalculo: r2(Math.max(0, lucro)), aliquota: r.csllPct, valorPrincipal: (Math.max(0, lucro) * r.csllPct) / 100, memoria: [`CSLL ${pct(r.csllPct, 0)} × lucro do trimestre ${brl(Math.max(0, lucro))}.`] })
      }
    }
    if (d.folha > 0) {
      const e = t.encargosFolha
      const patr = e.patronalPct + e.ratPct + e.terceirosPct
      push({ tributo: 'INSS', tipoGuia: 'GPS', codigoReceita: '2003', competencia: comp, periodicidade: 'MENSAL', vencimento: venc('INSS')!, baseCalculo: d.folha, aliquota: patr + e.seguradosMediaPct, valorPrincipal: (d.folha * (patr + e.seguradosMediaPct)) / 100, memoria: [`Folha ${brl(d.folha)}: patronal ${pct(e.patronalPct)} + RAT ${pct(e.ratPct)} + terceiros ${pct(e.terceirosPct)} + descontado dos empregados (média estimada ${pct(e.seguradosMediaPct)}). Valores reais vêm da folha de pagamento.`] })
    }
  }

  if (emp.regime === 'MEI' && d.folha > 0) {
    const pr = t.mei.patronalComFuncionarioPct + t.encargosFolha.seguradosMediaPct
    push({ tributo: 'INSS', tipoGuia: 'GPS', codigoReceita: '2003', competencia: comp, periodicidade: 'MENSAL', vencimento: venc('INSS')!, baseCalculo: d.folha, aliquota: pr, valorPrincipal: (d.folha * pr) / 100, memoria: [`MEI com empregado: ${pct(t.mei.patronalComFuncionarioPct)} patronal + ${pct(t.encargosFolha.seguradosMediaPct)} do empregado sobre ${brl(d.folha)}.`] })
  }
  if (emp.regime !== 'MEI' || d.folha > 0) {
    if (d.folha > 0) push({ tributo: 'FGTS', tipoGuia: 'FGTS', codigoReceita: 'FGTS', competencia: comp, periodicidade: 'MENSAL', vencimento: venc('FGTS')!, baseCalculo: d.folha, aliquota: t.encargosFolha.fgtsPct, valorPrincipal: (d.folha * t.encargosFolha.fgtsPct) / 100, memoria: [`FGTS ${pct(t.encargosFolha.fgtsPct)} × folha ${brl(d.folha)} (recolhimento via FGTS Digital, que substitui a guia GFIP/SEFIP).`] })
  }
  if (d.irrfRetido > 0) push({ tributo: 'IRRF', tipoGuia: 'DARF', codigoReceita: '0561', competencia: comp, periodicidade: 'MENSAL', vencimento: venc('IRRF')!, baseCalculo: d.irrfRetido, aliquota: null, valorPrincipal: d.irrfRetido, memoria: [`IRRF retido no mês: ${brl(d.irrfRetido)} (código 0561 trabalho assalariado; serviços de PJ usam 1708 — conferir).`] })
  return out
}

/** Multa de mora (0,33%/dia, máx. 20%) e juros aproximados (Selic mensal de referência) para guia vencida. Estimativa. */
export function encargosAtraso(valor: number, vencimento: Date, hoje: Date, t: TabelasFiscais) {
  const dias = Math.floor((hoje.getTime() - vencimento.getTime()) / 86_400_000)
  if (dias <= 0) return { multa: 0, juros: 0, dias: 0 }
  const multa = Math.min(t.guias.multaMaximaPct, dias * t.guias.multaDiaPct)
  const juros = (dias / 30) * t.guias.selicMensalPctAproximada + 1
  return { multa: r2((valor * multa) / 100), juros: r2((valor * juros) / 100), dias }
}

/** Códigos FICTÍCIOS (não pagáveis): começam com 0 (arrecadação real começa com 8) e levam o rótulo SIMULAÇÃO. */
export function codigosSimulados(semente: string) {
  const h = createHash('sha256').update('SIM|' + semente).digest('hex')
  const dig = BigInt('0x' + h).toString().padEnd(52, '7').slice(0, 44)
  const barras = '0' + dig.slice(1)
  const grupos = [0, 11, 22, 33].map((i) => barras.slice(i, i + 11))
  const dv = (s: string) => { let soma = 0, peso = 2; for (let i = s.length - 1; i >= 0; i--) { let x = Number(s[i]) * peso; if (x > 9) x = Math.floor(x / 10) + (x % 10); soma += x; peso = peso === 2 ? 1 : 2 } return (10 - (soma % 10)) % 10 }
  const linha = 'SIMULAÇÃO ' + grupos.map((s) => `${s}-${(dv(s) + 5) % 10}`).join(' ')   // DV propositalmente INVÁLIDO: a linha não é aceita por nenhum banco
  return { codigoBarras: barras, linhaDigitavel: linha }
}
