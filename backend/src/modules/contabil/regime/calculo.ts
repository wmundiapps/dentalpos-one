import { ehServico } from './cnae'
import { AVISO_TABELAS, AnexoSimples, Atividade, FaixaSimples, TabelasFiscais } from './tabelas'
import { brl, pct, r2 } from '../nucleo/util'

// Funções PURAS de cálculo tributário (sem banco). Tudo é ESTIMATIVA para comparar regimes e dimensionar guias simuladas.

export type Regime = 'MEI' | 'SIMPLES' | 'PRESUMIDO' | 'REAL'
export const REGIMES: Regime[] = ['MEI', 'SIMPLES', 'PRESUMIDO', 'REAL']
export const NOME_REGIME: Record<Regime, string> = { MEI: 'MEI', SIMPLES: 'Simples Nacional', PRESUMIDO: 'Lucro Presumido', REAL: 'Lucro Real' }

export interface MesHistorico { competencia: string; receita: number; despesas: number; folha: number; compras: number }

export interface LinhaTributo { nome: string; base: number; aliquotaPct: number | null; valor: number; obs?: string }
export interface ResultadoRegime {
  regime: Regime
  nome: string
  elegivel: boolean
  motivos: string[]            // por que não é elegível / ressalvas
  anexo?: AnexoSimples | null
  tributos: LinhaTributo[]
  totalAnual: number
  cargaEfetivaPct: number | null
  memoria: string[]
}
export interface EntradaRegimes {
  atividade: Atividade
  anexoForcado?: AnexoSimples | null
  regimeAtual: Regime
  issAliquotaPct?: number | null
  icmsAliquotaPct?: number | null
  meses: MesHistorico[]        // até 12 meses (cronológicos)
}
export interface ResultadoRegimes {
  versaoTabelas: string
  situacaoTabelas: string
  resumo: { receitaAnual: number; despesasAnual: number; folhaAnual: number; comprasAnual: number; fatorRPct: number | null; mesesComDados: number; anualizado: boolean }
  regimes: ResultadoRegime[]
  recomendado: Regime | null
  regimeAtual: Regime
  economiaVsAtual: number | null
  alertas: Array<{ nivel: 'info' | 'atencao' | 'critico'; texto: string }>
  ressalvas: string[]
}

export const faixaSimples = (anexo: AnexoSimples, rbt12: number, t: TabelasFiscais): { faixa: FaixaSimples; indice: number } => {
  const f = t.simples.anexos[anexo]
  const i = f.findIndex((x) => rbt12 <= x.ate)
  const idx = i < 0 ? f.length - 1 : i
  return { faixa: f[idx], indice: idx + 1 }
}

/** Alíquota efetiva do Simples: (RBT12 × alíquota nominal − parcela a deduzir) / RBT12. Sem receita, usa a nominal da 1ª faixa. */
export function aliquotaEfetivaSimples(anexo: AnexoSimples, rbt12: number, t: TabelasFiscais) {
  const { faixa, indice } = faixaSimples(anexo, rbt12, t)
  if (rbt12 <= 0) return { efetivaPct: t.simples.anexos[anexo][0].aliquota, nominalPct: t.simples.anexos[anexo][0].aliquota, deduzir: 0, faixa: 1 }
  const efetiva = ((rbt12 * faixa.aliquota) / 100 - faixa.deduzir) / rbt12 * 100
  return { efetivaPct: Math.max(0, efetiva), nominalPct: faixa.aliquota, deduzir: faixa.deduzir, faixa: indice }
}

/** Anexo do Simples para a atividade (e fator R quando aplicável). */
export function anexoDaAtividade(a: Atividade, fatorRPct: number | null, t: TabelasFiscais, forcado?: AnexoSimples | null): AnexoSimples {
  if (forcado) return forcado
  switch (a) {
    case 'COMERCIO': return 'I'
    case 'INDUSTRIA': return 'II'
    case 'SERVICOS_ANEXO_IV': return 'IV'
    case 'SERVICOS_FATOR_R': return (fatorRPct ?? 0) >= t.simples.fatorRMinPct ? 'III' : 'V'
    default: return 'III'
  }
}

/** DAS-MEI mensal (valor fixo): 5% do salário mínimo + ISS (serviços) e/ou ICMS (comércio/indústria). */
export function dasMeiMensal(a: Atividade, t: TabelasFiscais) {
  const inss = r2((t.salarioMinimo * t.mei.inssPctSalarioMinimo) / 100)
  const comp = a === 'COMERCIO' || a === 'INDUSTRIA' ? t.mei.icmsFixo : ehServico(a) ? t.mei.issFixo : t.mei.icmsFixo
  return { inss, complemento: comp, total: r2(inss + comp), rotulo: a === 'COMERCIO' || a === 'INDUSTRIA' ? 'INSS + ICMS' : 'INSS + ISS' }
}

const soma = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
/** Divide o histórico em blocos de 3 meses (aproximação de trimestres). */
const trimestres = (m: MesHistorico[]) => { const out: MesHistorico[][] = []; for (let i = 0; i < m.length; i += 3) out.push(m.slice(i, i + 3)); return out }

/** IRPJ com adicional sobre uma base trimestral. */
export const irpjTrimestre = (base: number, p: { irpjPct: number; irpjAdicionalPct: number; adicionalLimiteTrimestral: number }) => {
  const b = Math.max(0, base)
  return { normal: r2((b * p.irpjPct) / 100), adicional: r2((Math.max(0, b - p.adicionalLimiteTrimestral) * p.irpjAdicionalPct) / 100) }
}

export function simularRegimes(e: EntradaRegimes, t: TabelasFiscais): ResultadoRegimes {
  const comDados = e.meses.filter((m) => m.receita > 0 || m.despesas > 0)
  const n = Math.max(1, e.meses.length)
  const anualizar = e.meses.length > 0 && e.meses.length < 12
  const k = anualizar ? 12 / n : 1
  const meses: MesHistorico[] = anualizar
    ? Array.from({ length: 12 }, (_, i) => { const b = e.meses[i % e.meses.length]; return { ...b, competencia: `anualizado-${i + 1}` } })
    : e.meses
  const rbt12 = r2(soma(e.meses.map((m) => m.receita)) * k)
  const desp12 = r2(soma(e.meses.map((m) => m.despesas)) * k)
  const folha12 = r2(soma(e.meses.map((m) => m.folha)) * k)
  const compras12 = r2(soma(e.meses.map((m) => m.compras)) * k)
  const fatorR = rbt12 > 0 ? (folha12 / rbt12) * 100 : null
  const servico = ehServico(e.atividade)
  const iss = e.issAliquotaPct ?? t.indiretos.issAliquotaPadraoPct
  const icms = e.icmsAliquotaPct ?? t.indiretos.icmsAliquotaPadraoPct
  const enc = t.encargosFolha
  const alertas: ResultadoRegimes['alertas'] = []
  const ressalvas = [
    'Esta é uma ESTIMATIVA para comparação. Não considera créditos específicos, benefícios fiscais, retenções, prejuízos fiscais a compensar, particularidades do CNAE/município nem vedações. Valide com seu contador.',
    AVISO_TABELAS,
  ]
  if (anualizar) alertas.push({ nivel: 'atencao', texto: `Histórico com apenas ${n} mês(es): os números foram anualizados (×${(12 / n).toFixed(2)}). Complete 12 meses para uma estimativa melhor.` })
  if (!comDados.length) alertas.push({ nivel: 'critico', texto: 'Sem histórico de receita/despesa: informe pelo menos 1 mês para comparar regimes.' })

  const regimes: ResultadoRegime[] = []

  // ---------------- MEI ----------------
  {
    const mem: string[] = []; const motivos: string[] = []
    const d = dasMeiMensal(e.atividade, t)
    let elegivel = true
    if (rbt12 > t.mei.limiteAnual) { elegivel = false; motivos.push(`Receita anual ${brl(rbt12)} acima do limite do MEI (${brl(t.mei.limiteAnual)}).`) }
    if (folha12 > 12 * t.salarioMinimo * 1.5) { elegivel = false; motivos.push('Folha incompatível com o MEI (permite no máximo 1 empregado, com salário mínimo ou piso da categoria).') }
    if (e.atividade === 'SERVICOS_FATOR_R' || e.atividade === 'SERVICOS_ANEXO_IV') motivos.push('Atenção: várias atividades intelectuais/regulamentadas e de construção NÃO podem ser MEI — confira o CNAE na lista de ocupações permitidas.')
    mem.push(`DAS-MEI mensal = 5% × salário mínimo (${brl(t.salarioMinimo)}) = ${brl(d.inss)} + ${d.rotulo.includes('ICMS') ? 'ICMS' : 'ISS'} fixo ${brl(d.complemento)} = ${brl(d.total)}.`)
    mem.push(`Anual = ${brl(d.total)} × 12 = ${brl(d.total * 12)}.`)
    const tributos: LinhaTributo[] = [{ nome: `DAS-MEI (${d.rotulo})`, base: rbt12, aliquotaPct: null, valor: r2(d.total * 12), obs: 'Valor fixo mensal' }]
    if (folha12 > 0) { const v = r2((folha12 * t.mei.patronalComFuncionarioPct) / 100); tributos.push({ nome: 'INSS patronal do empregado (MEI)', base: folha12, aliquotaPct: t.mei.patronalComFuncionarioPct, valor: v }); mem.push(`INSS patronal MEI com empregado: ${pct(t.mei.patronalComFuncionarioPct)} × folha ${brl(folha12)} = ${brl(v)}.`) }
    const total = r2(soma(tributos.map((x) => x.valor)))
    regimes.push({ regime: 'MEI', nome: NOME_REGIME.MEI, elegivel, motivos, tributos, totalAnual: total, cargaEfetivaPct: rbt12 > 0 ? r2((total / rbt12) * 100) : null, memoria: mem })
  }

  // ---------------- SIMPLES ----------------
  {
    const mem: string[] = []; const motivos: string[] = []
    const anexo = anexoDaAtividade(e.atividade, fatorR, t, e.anexoForcado)
    let elegivel = true
    if (rbt12 > t.simples.limiteAnual) { elegivel = false; motivos.push(`Receita anual ${brl(rbt12)} acima do limite do Simples Nacional (${brl(t.simples.limiteAnual)}).`) }
    const ef = aliquotaEfetivaSimples(anexo, rbt12, t)
    mem.push(`Receita bruta dos 12 meses (RBT12) = ${brl(rbt12)}.`)
    if (e.atividade === 'SERVICOS_FATOR_R') mem.push(`Fator R = folha ${brl(folha12)} ÷ receita ${brl(rbt12)} = ${fatorR == null ? 'n/d' : pct(fatorR)}; mínimo ${pct(t.simples.fatorRMinPct)} → ${anexo === 'III' ? 'Anexo III (mais barato)' : 'Anexo V'}.`)
    mem.push(`Anexo ${anexo}, ${ef.faixa}ª faixa: alíquota nominal ${pct(ef.nominalPct)} e parcela a deduzir ${brl(ef.deduzir)}.`)
    mem.push(`Alíquota efetiva = (RBT12 × ${pct(ef.nominalPct)} − ${brl(ef.deduzir)}) ÷ RBT12 = ${pct(ef.efetivaPct, 4)}.`)
    const vDas = r2((rbt12 * ef.efetivaPct) / 100)
    const tributos: LinhaTributo[] = [{ nome: `DAS (Simples Nacional — Anexo ${anexo})`, base: rbt12, aliquotaPct: r2(ef.efetivaPct * 100) / 100, valor: vDas }]
    mem.push(`DAS anual ≈ ${brl(rbt12)} × ${pct(ef.efetivaPct, 4)} = ${brl(vDas)} (aproximação anual da apuração mensal).`)
    if (anexo === 'IV') {
      const cpp = r2((folha12 * (t.simples.cppPatronalPct + t.simples.ratPct)) / 100)
      tributos.push({ nome: 'CPP patronal + RAT (fora do DAS no Anexo IV)', base: folha12, aliquotaPct: t.simples.cppPatronalPct + t.simples.ratPct, valor: cpp })
      mem.push(`Anexo IV: INSS patronal não está no DAS → ${pct(t.simples.cppPatronalPct + t.simples.ratPct)} × folha ${brl(folha12)} = ${brl(cpp)}.`)
    }
    if (rbt12 > t.simples.sublimiteAnual && elegivel) {
      motivos.push(`Receita acima do sublimite de ${brl(t.simples.sublimiteAnual)}: ICMS e ISS passam a ser recolhidos fora do DAS (não somados nesta estimativa).`)
      alertas.push({ nivel: 'atencao', texto: `Receita acima do sublimite do Simples (${brl(t.simples.sublimiteAnual)}): ICMS/ISS são cobrados fora do DAS — a carga real pode ser maior que a estimada.` })
    }
    const total = r2(soma(tributos.map((x) => x.valor)))
    regimes.push({ regime: 'SIMPLES', nome: NOME_REGIME.SIMPLES, elegivel, motivos, anexo, tributos, totalAnual: total, cargaEfetivaPct: rbt12 > 0 ? r2((total / rbt12) * 100) : null, memoria: mem })
  }

  // ---------------- encargos comuns a Presumido/Real ----------------
  const patronalPct = enc.patronalPct + enc.ratPct + enc.terceirosPct
  const linhaIndiretos = (mem: string[]): LinhaTributo[] => {
    const out: LinhaTributo[] = []
    if (servico) {
      const v = r2((rbt12 * iss) / 100)
      out.push({ nome: 'ISS (município)', base: rbt12, aliquotaPct: iss, valor: v })
      mem.push(`ISS = ${pct(iss)} × receita ${brl(rbt12)} = ${brl(v)} (alíquota do município; padrão ${pct(t.indiretos.issAliquotaPadraoPct)} quando não informada).`)
    } else {
      const baseIcms = Math.max(0, rbt12 - compras12)
      const v = r2((baseIcms * icms) / 100)
      out.push({ nome: 'ICMS (estimativa sobre margem)', base: baseIcms, aliquotaPct: icms, valor: v, obs: 'Estimativa grosseira: alíquota × (receita − compras); depende da UF, NCM, ST e créditos' })
      mem.push(`ICMS (estimativa) = ${pct(icms)} × (receita ${brl(rbt12)} − compras ${brl(compras12)}) = ${brl(v)}.`)
    }
    const vp = r2((folha12 * patronalPct) / 100)
    out.push({ nome: 'INSS patronal + RAT + terceiros', base: folha12, aliquotaPct: patronalPct, valor: vp, obs: 'Alíquotas de RAT e terceiros variam por CNAE/FAP' })
    mem.push(`Encargos sobre a folha ${brl(folha12)}: ${pct(enc.patronalPct)} patronal + ${pct(enc.ratPct)} RAT + ${pct(enc.terceirosPct)} terceiros = ${pct(patronalPct)} → ${brl(vp)}.`)
    return out
  }

  // ---------------- PRESUMIDO ----------------
  {
    const mem: string[] = []; const motivos: string[] = []
    const p = t.presumido
    const elegivel = rbt12 <= p.limiteReceitaAnual
    if (!elegivel) motivos.push(`Receita acima de ${brl(p.limiteReceitaAnual)}: Lucro Real obrigatório.`)
    const pI = p.presuncaoIrpj[e.atividade], pC = p.presuncaoCsll[e.atividade]
    let irpj = 0, adic = 0, csll = 0
    const tri = trimestres(meses)
    tri.forEach((q, i) => {
      const rec = soma(q.map((m) => m.receita))
      const baseI = (rec * pI) / 100, baseC = (rec * pC) / 100
      const x = irpjTrimestre(baseI, p)
      irpj += x.normal; adic += x.adicional; csll += (baseC * p.csllPct) / 100
      mem.push(`Bloco ${i + 1}: receita ${brl(rec)} → base IRPJ ${pct(pI, 0)} = ${brl(baseI)}; IRPJ ${pct(p.irpjPct, 0)} = ${brl(x.normal)}; adicional ${pct(p.irpjAdicionalPct, 0)} sobre o que passa de ${brl(p.adicionalLimiteTrimestral)} = ${brl(x.adicional)}; CSLL ${pct(p.csllPct, 0)} × base ${pct(pC, 0)} (${brl(baseC)}) = ${brl((baseC * p.csllPct) / 100)}.`)
    })
    const pis = r2((rbt12 * p.pisPct) / 100), cof = r2((rbt12 * p.cofinsPct) / 100)
    mem.push(`PIS cumulativo ${pct(p.pisPct)} × ${brl(rbt12)} = ${brl(pis)}; COFINS cumulativa ${pct(p.cofinsPct)} × ${brl(rbt12)} = ${brl(cof)}.`)
    const tributos: LinhaTributo[] = [
      { nome: 'IRPJ', base: r2((rbt12 * pI) / 100), aliquotaPct: p.irpjPct, valor: r2(irpj) },
      { nome: 'Adicional de IRPJ', base: r2((rbt12 * pI) / 100), aliquotaPct: p.irpjAdicionalPct, valor: r2(adic) },
      { nome: 'CSLL', base: r2((rbt12 * pC) / 100), aliquotaPct: p.csllPct, valor: r2(csll) },
      { nome: 'PIS (cumulativo)', base: rbt12, aliquotaPct: p.pisPct, valor: pis },
      { nome: 'COFINS (cumulativa)', base: rbt12, aliquotaPct: p.cofinsPct, valor: cof },
      ...linhaIndiretos(mem),
    ]
    const total = r2(soma(tributos.map((x) => x.valor)))
    regimes.push({ regime: 'PRESUMIDO', nome: NOME_REGIME.PRESUMIDO, elegivel, motivos, tributos, totalAnual: total, cargaEfetivaPct: rbt12 > 0 ? r2((total / rbt12) * 100) : null, memoria: mem })
  }

  // ---------------- REAL ----------------
  {
    const mem: string[] = []; const motivos: string[] = []
    const r = t.real
    let irpj = 0, adic = 0, csll = 0
    tri_: for (const [i, q] of trimestres(meses).entries()) {
      const lucro = soma(q.map((m) => m.receita)) - soma(q.map((m) => m.despesas))
      if (lucro <= 0) { mem.push(`Bloco ${i + 1}: resultado ${brl(lucro)} (prejuízo) → sem IRPJ/CSLL (prejuízo fiscal poderia ser compensado depois; não considerado).`); continue tri_ }
      const x = irpjTrimestre(lucro, r)
      irpj += x.normal; adic += x.adicional; csll += (lucro * r.csllPct) / 100
      mem.push(`Bloco ${i + 1}: lucro ${brl(lucro)}; IRPJ ${pct(r.irpjPct, 0)} = ${brl(x.normal)}; adicional ${brl(x.adicional)}; CSLL ${pct(r.csllPct, 0)} = ${brl((lucro * r.csllPct) / 100)}.`)
    }
    const debito = (rbt12 * (r.pisPct + r.cofinsPct)) / 100
    const credito = (compras12 * (r.pisPct + r.cofinsPct)) / 100
    const pcLiquido = Math.max(0, debito - credito)
    const pis = r2(Math.max(0, (rbt12 - compras12) * r.pisPct / 100)), cof = r2(Math.max(0, (rbt12 - compras12) * r.cofinsPct / 100))
    mem.push(`PIS/COFINS não cumulativos: débito ${pct(r.pisPct + r.cofinsPct)} × receita ${brl(rbt12)} = ${brl(debito)}; crédito sobre compras/insumos ${brl(compras12)} = ${brl(credito)}; líquido ${brl(pcLiquido)} (créditos reais dependem da documentação).`)
    const tributos: LinhaTributo[] = [
      { nome: 'IRPJ', base: r2(Math.max(0, rbt12 - desp12)), aliquotaPct: r.irpjPct, valor: r2(irpj) },
      { nome: 'Adicional de IRPJ', base: r2(Math.max(0, rbt12 - desp12)), aliquotaPct: r.irpjAdicionalPct, valor: r2(adic) },
      { nome: 'CSLL', base: r2(Math.max(0, rbt12 - desp12)), aliquotaPct: r.csllPct, valor: r2(csll) },
      { nome: 'PIS (não cumulativo, líquido de créditos)', base: r2(Math.max(0, rbt12 - compras12)), aliquotaPct: r.pisPct, valor: pis },
      { nome: 'COFINS (não cumulativa, líquida de créditos)', base: r2(Math.max(0, rbt12 - compras12)), aliquotaPct: r.cofinsPct, valor: cof },
      ...linhaIndiretos(mem),
    ]
    const total = r2(soma(tributos.map((x) => x.valor)))
    if (desp12 <= 0 && rbt12 > 0) motivos.push('Sem despesas informadas: o lucro real ficaria igual à receita (superestimado). Informe as despesas.')
    regimes.push({ regime: 'REAL', nome: NOME_REGIME.REAL, elegivel: true, motivos, tributos, totalAnual: total, cargaEfetivaPct: rbt12 > 0 ? r2((total / rbt12) * 100) : null, memoria: mem })
  }

  // ---------------- recomendação e alertas ----------------
  const elegiveis = regimes.filter((r) => r.elegivel && rbt12 > 0)
  const melhor = elegiveis.length ? elegiveis.reduce((a, b) => (b.totalAnual < a.totalAnual - 0.005 ? b : a)) : null
  const atual = regimes.find((r) => r.regime === e.regimeAtual)
  const economia = melhor && atual ? r2(atual.totalAnual - melhor.totalAnual) : null

  if (rbt12 > 0) {
    const m = t.mei.limiteAnual, s = t.simples
    if (e.regimeAtual === 'MEI' || rbt12 <= m * 1.3) {
      if (rbt12 > m * (1 + t.mei.toleranciaExcessoPct / 100)) alertas.push({ nivel: 'critico', texto: `Receita de ${brl(rbt12)} excede o limite do MEI em mais de ${t.mei.toleranciaExcessoPct}%: o desenquadramento costuma ser retroativo ao início do ano. Procure o contador com urgência.` })
      else if (rbt12 > m) alertas.push({ nivel: 'critico', texto: `Receita de ${brl(rbt12)} acima do limite do MEI (${brl(m)}): é preciso migrar de regime (excesso até ${t.mei.toleranciaExcessoPct}% tem tratamento específico).` })
      else if (rbt12 >= m * 0.8) alertas.push({ nivel: 'atencao', texto: `Receita de ${brl(rbt12)} já é ${pct((rbt12 / m) * 100, 0)} do limite do MEI (${brl(m)}).` })
    }
    if (rbt12 > s.limiteAnual) alertas.push({ nivel: 'critico', texto: `Receita de ${brl(rbt12)} acima do limite do Simples Nacional (${brl(s.limiteAnual)}): enquadramento no Simples não é mais possível.` })
    else if (rbt12 > s.sublimiteAnual) alertas.push({ nivel: 'atencao', texto: `Receita acima do sublimite (${brl(s.sublimiteAnual)}): ICMS/ISS fora do DAS.` })
    else if (rbt12 >= s.limiteAnual * 0.8) alertas.push({ nivel: 'atencao', texto: `Receita de ${brl(rbt12)} é ${pct((rbt12 / s.limiteAnual) * 100, 0)} do limite do Simples (${brl(s.limiteAnual)}).` })
    if (e.atividade === 'SERVICOS_FATOR_R' && fatorR != null) {
      const falta = t.simples.fatorRMinPct / 100 * rbt12 - folha12
      if (fatorR < t.simples.fatorRMinPct) alertas.push({ nivel: 'info', texto: `Fator R de ${pct(fatorR)} está abaixo de ${pct(t.simples.fatorRMinPct, 0)}: a empresa paga pelo Anexo V. Elevar a folha/pró-labore em cerca de ${brl(falta)} por ano levaria ao Anexo III (avalie o custo total antes).` })
      else if (fatorR >= t.simples.fatorRMinPct && fatorR <= t.simples.fatorRMinPct + 2) alertas.push({ nivel: 'atencao', texto: `Fator R de ${pct(fatorR)} está muito próximo do mínimo de ${pct(t.simples.fatorRMinPct, 0)}: uma queda de folha pode jogar a empresa no Anexo V.` })
    }
    if (melhor && e.regimeAtual !== melhor.regime && economia != null && economia > 0) alertas.push({ nivel: 'info', texto: `Pela estimativa, ${melhor.nome} custaria ${brl(economia)} a menos por ano que o regime atual (${NOME_REGIME[e.regimeAtual]}). Mudanças de regime têm prazos (em geral só em janeiro) e regras próprias — consulte o contador.` })
  }

  return {
    versaoTabelas: t.versao, situacaoTabelas: t.situacao,
    resumo: { receitaAnual: rbt12, despesasAnual: desp12, folhaAnual: folha12, comprasAnual: compras12, fatorRPct: fatorR == null ? null : r2(fatorR), mesesComDados: comDados.length, anualizado: anualizar },
    regimes, recomendado: melhor?.regime ?? null, regimeAtual: e.regimeAtual, economiaVsAtual: economia, alertas, ressalvas,
  }
}
