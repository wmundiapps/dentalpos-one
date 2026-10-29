// ============================================================
// RH — cálculo SIMPLIFICADO do holerite (função pura). MODELO A VALIDAR POR CONTADOR.
// Convenção: mês comercial de 30 dias; valor-hora = salário / divisor (220); IRRF/INSS por tabelas parametrizáveis (fiscal.ts).
// ============================================================
import { ResumoMes, diffDias, dsrSobreVariaveis, r2 } from './calculo'
import { TabelasVigentes, calcFgts, calcInss, calcIrrf, patronal } from './fiscal'

export interface ItemHolerite { codigo: string; nome: string; tipo: 'PROVENTO' | 'DESCONTO' | 'INFO'; referencia?: number | null; valor: number; i?: boolean; r?: boolean; f?: boolean; reduzBase?: boolean }
export interface HoleriteIn {
  competencia: string; tipoFolha: 'MENSAL' | 'DECIMO_1A' | 'DECIMO_2A'
  colab: { vinculo: string; salarioBase: number; valorHora?: number | null; cargaMensalHoras?: number | null; dependentesIrrf: number; dataAdmissao?: string | null; dataDesligamento?: string | null; bancoHoras?: boolean; aprendiz?: boolean }
  ponto?: ResumoMes | null
  cfg: { divisorHoras: number; adicionalNoturnoPct: number; horaNoturnaReduzida: boolean; he50Pct: number; he100Pct: number; descontaDsrFalta: boolean }
  diasNaoRemunerados?: number
  ferias?: Array<{ ferias: number; terco: number; abono: number; tercoAbono: number; dias: number; diasAbono: number }>
  bonificacoes?: Array<{ tipo: string; descricao: string; valor: number; incideEncargos: boolean }>
  manuais?: Array<{ codigo: string; nome: string; tipo: 'PROVENTO' | 'DESCONTO'; valor: number; referencia?: number | null; incideInss: boolean; incideIrrf: boolean; incideFgts: boolean }>
  bhVencidoMin?: number
  tabelas: TabelasVigentes
  decimo?: { avos: number; mediaVariaveis: number; adiantamento: number }
}
export interface HoleriteOut {
  itens: ItemHolerite[]; bruto: number; descontos: number; liquido: number; inss: number; irrf: number; fgts: number
  baseInss: number; baseIrrf: number; patronal: number; avisos: string[]; irrfDetalhe?: any
}

const mesIni = (comp: string, dia: string | null | undefined, tipo: 'adm' | 'desl') => {
  if (!dia) return null
  return dia.slice(0, 7) === comp ? Math.min(30, +dia.slice(8, 10)) : dia.slice(0, 7) > comp ? (tipo === 'adm' ? 99 : 0) : (tipo === 'adm' ? 1 : -1)
}
/** Dias do contrato dentro do mês (base 30). */
export function diasContratoNoMes(comp: string, adm?: string | null, desl?: string | null): number {
  let ini = 1, fim = 30
  const a = mesIni(comp, adm, 'adm'); if (a !== null) ini = a === 99 ? 31 : a
  const d = mesIni(comp, desl, 'desl'); if (d !== null) fim = d === -1 ? 30 : d
  if (desl && desl.slice(0, 7) < comp) return 0
  return Math.max(0, fim - ini + 1)
}
export const salarioReferencia = (c: HoleriteIn['colab']) => c.vinculo === 'PROFESSOR_HORISTA' ? r2((c.cargaMensalHoras ?? 0) * (c.valorHora ?? 0) * (7 / 6)) : c.salarioBase

export function calcularHolerite(inp: HoleriteIn): HoleriteOut {
  const { colab, cfg, tabelas } = inp
  const avisos: string[] = []
  const itens: ItemHolerite[] = []
  const add = (x: ItemHolerite) => { if (Math.abs(x.valor) > 0.004 || x.tipo === 'INFO') itens.push({ ...x, valor: r2(x.valor) }) }
  const clt = colab.vinculo === 'CLT' || colab.vinculo === 'PROFESSOR_HORISTA'
  const dc = diasContratoNoMes(inp.competencia, colab.dataAdmissao, colab.dataDesligamento)

  // ------------------------------------------------ 13º salário
  if (inp.tipoFolha !== 'MENSAL') {
    if (!clt) return vazio(['Vínculo sem direito a 13º salário (somente CLT/horista).'])
    const ref = salarioReferencia(colab)
    const av = inp.decimo?.avos ?? 0
    if (inp.tipoFolha === 'DECIMO_1A') {
      add({ codigo: 'DECIMO_1A', nome: '13º salário - 1ª parcela (adiantamento)', tipo: 'PROVENTO', referencia: av, valor: ref * 0.5 * av / 12, f: true })
      const fgts = calcFgts(r2(ref * 0.5 * av / 12), tabelas.encargos)
      add({ codigo: 'FGTS', nome: 'FGTS (depósito do empregador)', tipo: 'INFO', valor: fgts })
      const bruto = itens.filter((i) => i.tipo === 'PROVENTO').reduce((a, i) => a + i.valor, 0)
      return { itens: limpa(itens), bruto: r2(bruto), descontos: 0, liquido: r2(bruto), inss: 0, irrf: 0, fgts, baseInss: 0, baseIrrf: 0, patronal: 0, avisos: [...avisos, 'Sem INSS/IRRF na 1ª parcela; incidem sobre o total na 2ª parcela.'] }
    }
    const bruto13 = r2((ref + (inp.decimo?.mediaVariaveis ?? 0)) * av / 12)
    add({ codigo: 'DECIMO_2A', nome: '13º salário - 2ª parcela (integral)', tipo: 'PROVENTO', referencia: av, valor: bruto13, i: true, r: true, f: true })
    const inss = calcInss(bruto13, tabelas.inss)
    const ir = calcIrrf(bruto13, inss, colab.dependentesIrrf, tabelas.irrf)
    add({ codigo: 'INSS', nome: 'INSS sobre 13º', tipo: 'DESCONTO', valor: inss })
    add({ codigo: 'IRRF', nome: 'IRRF sobre 13º (tributação exclusiva)', tipo: 'DESCONTO', valor: ir.imposto })
    add({ codigo: 'ADIANT_13', nome: 'Adiantamento 13º (1ª parcela)', tipo: 'DESCONTO', valor: inp.decimo?.adiantamento ?? 0 })
    const fgts = calcFgts(Math.max(0, bruto13 - (inp.decimo?.adiantamento ?? 0)), tabelas.encargos)   // FGTS da 1ª já depositado
    add({ codigo: 'FGTS', nome: 'FGTS (depósito do empregador)', tipo: 'INFO', valor: fgts })
    const descontos = r2(itens.filter((i) => i.tipo === 'DESCONTO').reduce((a, i) => a + i.valor, 0))
    return { itens: limpa(itens), bruto: bruto13, descontos, liquido: r2(bruto13 - descontos), inss, irrf: ir.imposto, fgts, baseInss: bruto13, baseIrrf: ir.base, patronal: patronal(bruto13, tabelas.encargos), avisos, irrfDetalhe: ir }
  }

  // ------------------------------------------------ mensal
  const dnr = Math.min(dc, Math.max(0, inp.diasNaoRemunerados ?? 0))
  const dias = Math.max(0, dc - dnr)
  const vh = colab.valorHora ?? (colab.salarioBase / cfg.divisorHoras)
  const vDia = colab.salarioBase / 30

  if (colab.vinculo === 'PJ') {
    add({ codigo: 'HONORARIOS', nome: 'Honorários / contrato PJ (sem encargos trabalhistas)', tipo: 'PROVENTO', referencia: dc, valor: colab.salarioBase * dc / 30 })
    for (const m of inp.manuais ?? []) add({ codigo: m.codigo, nome: m.nome, tipo: m.tipo, referencia: m.referencia, valor: m.valor })
    avisos.push('PJ: pagamento mediante nota fiscal; sem INSS/IRRF/FGTS de empregado (retenções de PJ, se houver, lançar como desconto manual).')
    return fechar(itens, 0, 0, 0, 0, 0, 0, avisos)
  }
  if (colab.vinculo === 'ESTAGIARIO') {
    add({ codigo: 'BOLSA', nome: 'Bolsa-auxílio de estágio', tipo: 'PROVENTO', referencia: dias, valor: colab.salarioBase * dias / 30 })
    for (const m of inp.manuais ?? []) add({ codigo: m.codigo, nome: m.nome, tipo: m.tipo, referencia: m.referencia, valor: m.valor })
    avisos.push('Estagiário: sem INSS/FGTS/IRRF (Lei 11.788/2008); recesso de 30 dias remunerado a cada 12 meses (lançar via férias/manual).')
    return fechar(itens, 0, 0, 0, 0, 0, 0, avisos)
  }

  // CLT / horista
  if (colab.vinculo === 'PROFESSOR_HORISTA') {
    const sal = (colab.cargaMensalHoras ?? 0) * vh * dias / 30
    add({ codigo: 'SAL_HORISTA', nome: 'Aulas/horas contratadas (horista)', tipo: 'PROVENTO', referencia: colab.cargaMensalHoras ?? 0, valor: sal, i: true, r: true, f: true })
    add({ codigo: 'DSR_HORISTA', nome: 'DSR do horista (1/6)', tipo: 'PROVENTO', valor: sal / 6, i: true, r: true, f: true })
  } else add({ codigo: 'SAL', nome: 'Salário', tipo: 'PROVENTO', referencia: dias, valor: colab.salarioBase * dias / 30, i: true, r: true, f: true })

  let variavel = 0
  const p = inp.ponto
  if (p && colab.vinculo === 'CLT') {
    const h = (m: number) => m / 60
    const banco = !!colab.bancoHoras
    if (!banco) {
      const he50 = h(p.extra50Min - p.extraNot50Min) * vh * (1 + cfg.he50Pct / 100)
      const he100 = h(p.extra100Min - p.extraNot100Min) * vh * (1 + cfg.he100Pct / 100)
      const heNot = h(p.extraNot50Min) * vh * (1 + cfg.he50Pct / 100) * (1 + cfg.adicionalNoturnoPct / 100) + h(p.extraNot100Min) * vh * (1 + cfg.he100Pct / 100) * (1 + cfg.adicionalNoturnoPct / 100)
      add({ codigo: 'HE50', nome: `Horas extras ${cfg.he50Pct}%`, tipo: 'PROVENTO', referencia: r2(h(p.extra50Min - p.extraNot50Min)), valor: he50, i: true, r: true, f: true })
      add({ codigo: 'HE100', nome: `Horas extras ${cfg.he100Pct}%`, tipo: 'PROVENTO', referencia: r2(h(p.extra100Min - p.extraNot100Min)), valor: he100, i: true, r: true, f: true })
      add({ codigo: 'HE_NOT', nome: 'Horas extras noturnas (com adicional)', tipo: 'PROVENTO', referencia: r2(h(p.extraNot50Min + p.extraNot100Min)), valor: heNot, i: true, r: true, f: true })
      variavel += he50 + he100 + heNot
    }
    if (inp.bhVencidoMin && inp.bhVencidoMin > 0) {
      const v = h(inp.bhVencidoMin) * vh * (1 + cfg.he50Pct / 100)
      add({ codigo: 'BH_VENCIDO', nome: 'Banco de horas vencido pago como hora extra', tipo: 'PROVENTO', referencia: r2(h(inp.bhVencidoMin)), valor: v, i: true, r: true, f: true })
      variavel += v
    }
    const real = p.noturnoRegularMin
    const equiv = cfg.horaNoturnaReduzida ? real * 60 / 52.5 : real
    const adic = h(equiv) * vh * (cfg.adicionalNoturnoPct / 100) + (cfg.horaNoturnaReduzida ? h(equiv - real) * vh : 0)
    add({ codigo: 'ADIC_NOT', nome: `Adicional noturno ${cfg.adicionalNoturnoPct}%${cfg.horaNoturnaReduzida ? ' (hora reduzida)' : ''}`, tipo: 'PROVENTO', referencia: r2(h(equiv)), valor: adic, i: true, r: true, f: true })
    variavel += adic
    const dsr = dsrSobreVariaveis(variavel, p.diasUteis, p.diasDsr)
    add({ codigo: 'DSR_HE', nome: 'DSR sobre horas extras/adicionais', tipo: 'PROVENTO', valor: dsr, i: true, r: true, f: true })
    if (p.faltas > 0) {
      add({ codigo: 'FALTAS', nome: 'Faltas injustificadas', tipo: 'DESCONTO', referencia: p.faltas, valor: p.faltas * vDia, reduzBase: true })
      if (cfg.descontaDsrFalta) add({ codigo: 'DSR_FALTAS', nome: 'DSR perdido por faltas', tipo: 'DESCONTO', referencia: p.faltas, valor: p.faltas * vDia, reduzBase: true })
    }
    if (!banco && p.atrasoMin > 0) add({ codigo: 'ATRASOS', nome: 'Atrasos e saídas antecipadas', tipo: 'DESCONTO', referencia: r2(h(p.atrasoMin)), valor: h(p.atrasoMin) * vh, reduzBase: true })
  } else if (!p && colab.vinculo === 'CLT') avisos.push('Sem apuração de ponto para a competência: horas extras, faltas e adicional noturno não calculados.')

  for (const f of inp.ferias ?? []) {
    add({ codigo: 'FERIAS', nome: 'Férias', tipo: 'PROVENTO', referencia: f.dias, valor: f.ferias, i: true, r: true, f: true })
    add({ codigo: 'TERCO_FERIAS', nome: '1/3 constitucional de férias', tipo: 'PROVENTO', valor: f.terco, i: false, r: true, f: true })
    if (f.diasAbono > 0) {
      add({ codigo: 'ABONO_FERIAS', nome: 'Abono pecuniário (venda de férias)', tipo: 'PROVENTO', referencia: f.diasAbono, valor: f.abono, i: false, r: false, f: false })
      add({ codigo: 'TERCO_ABONO', nome: '1/3 sobre abono pecuniário', tipo: 'PROVENTO', valor: f.tercoAbono, i: false, r: false, f: false })
    }
  }
  for (const b of inp.bonificacoes ?? []) {
    const plr = b.tipo === 'PLR'
    add({ codigo: b.tipo, nome: `${b.tipo === 'PLR' ? 'PLR' : b.tipo === 'COMISSAO' ? 'Comissão' : b.tipo === 'PREMIO' ? 'Prêmio' : 'Bônus'}: ${b.descricao}`.slice(0, 120), tipo: 'PROVENTO', valor: b.valor, i: b.incideEncargos && !plr, r: true, f: b.incideEncargos && !plr })
  }
  for (const m of inp.manuais ?? []) add({ codigo: m.codigo, nome: m.nome, tipo: m.tipo, referencia: m.referencia, valor: m.valor, i: m.incideInss, r: m.incideIrrf, f: m.incideFgts, reduzBase: m.tipo === 'DESCONTO' && false })

  const soma = (flag: 'i' | 'r' | 'f') => {
    const prov = itens.filter((x) => x.tipo === 'PROVENTO' && x[flag]).reduce((a, x) => a + x.valor, 0)
    const red = itens.filter((x) => x.tipo === 'DESCONTO' && x.reduzBase).reduce((a, x) => a + x.valor, 0)
    return Math.max(0, r2(prov - red))
  }
  const baseInss = soma('i'), baseIr = soma('r'), baseF = soma('f')
  const inss = calcInss(baseInss, tabelas.inss)
  const ir = calcIrrf(baseIr, inss, colab.dependentesIrrf, tabelas.irrf)
  add({ codigo: 'INSS', nome: 'INSS', tipo: 'DESCONTO', valor: inss })
  add({ codigo: 'IRRF', nome: `IRRF (${ir.metodo === 'SIMPLIFICADO' ? 'desconto simplificado' : ir.metodo === 'ISENTO' ? 'isento' : 'deduções legais'})`, tipo: 'DESCONTO', valor: ir.imposto })
  const fgts = calcFgts(baseF, tabelas.encargos, !!colab.aprendiz)
  add({ codigo: 'FGTS', nome: 'FGTS (depósito do empregador)', tipo: 'INFO', valor: fgts })
  return fechar(itens, inss, ir.imposto, fgts, baseInss, ir.base, patronal(baseInss, tabelas.encargos), avisos, ir)

  function vazio(a: string[]): HoleriteOut { return { itens: [], bruto: 0, descontos: 0, liquido: 0, inss: 0, irrf: 0, fgts: 0, baseInss: 0, baseIrrf: 0, patronal: 0, avisos: a } }
}

const limpa = (itens: ItemHolerite[]): ItemHolerite[] => itens.map(({ i, r, f, reduzBase, ...x }) => x)
function fechar(itens: ItemHolerite[], inss: number, irrf: number, fgts: number, baseInss: number, baseIrrf: number, pat: number, avisos: string[], det?: any): HoleriteOut {
  const bruto = r2(itens.filter((i) => i.tipo === 'PROVENTO').reduce((a, i) => a + i.valor, 0))
  const descontos = r2(itens.filter((i) => i.tipo === 'DESCONTO').reduce((a, i) => a + i.valor, 0))
  return { itens: itens.map(({ i, r, f, reduzBase, ...x }) => x), bruto, descontos, liquido: r2(bruto - descontos), inss, irrf, fgts, baseInss, baseIrrf, patronal: pat, avisos, irrfDetalhe: det }
}
void diffDias
