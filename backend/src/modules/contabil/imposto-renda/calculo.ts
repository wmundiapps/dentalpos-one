import type { TabelaIrpfAnual } from '../parametros'
import { r2, soDigitos, validarCpf, validarCnpj, diffDias, enesimoDiaUtil, ultimoDiaUtil } from '../util'

// Cálculo do IRPF anual (completa x simplificada), malha de inconsistências (checagens simples) e calendário de obrigações acessórias PJ.
// ESTIMATIVA: não substitui o programa oficial da Receita Federal nem o contador.

export const AVISO_IR = 'Estimativa: o cálculo segue a tabela parametrizada e as informações lançadas; o programa oficial da Receita Federal e seu contador devem conferir antes do envio. Este sistema não envia nada à Receita (simulação).'

export interface ItemIr { id?: string; secao: string; categoria?: string | null; descricao: string; valor: number; valorAnterior?: number | null; documento?: string | null; dados?: any }

const TRIBUTAVEIS = ['SALARIO', 'ALUGUEL', 'AUTONOMO', 'OUTROS_TRIBUTAVEIS']

function impostoAnual(base: number, t: TabelaIrpfAnual): number {
  if (base <= 0) return 0
  const f = t.faixas.find((x) => x.ate == null || base <= x.ate)!
  return Math.max(0, base * f.aliquota - f.deducao)
}
function aplicaRedutor(imposto: number, rendTrib: number, t: TabelaIrpfAnual): { imposto: number; redutor: number } {
  if (!t.redutor || rendTrib > t.redutor.reducaoAte) return { imposto, redutor: 0 }
  const red = rendTrib <= t.redutor.isencaoAte ? imposto : Math.max(0, Math.min(imposto, t.redutor.a - t.redutor.b * rendTrib))
  return { imposto: Math.max(0, imposto - red), redutor: red }
}

export function calcIrpf(itens: ItemIr[], t: TabelaIrpfAnual) {
  const soma = (f: (i: ItemIr) => boolean) => r2(itens.filter(f).reduce((s, i) => s + (i.valor || 0), 0))
  const rendTrib = soma((i) => i.secao === 'RENDIMENTO' && TRIBUTAVEIS.includes(i.categoria || 'SALARIO'))
  const rendIsentos = soma((i) => i.secao === 'RENDIMENTO' && i.categoria === 'ISENTO')
  const rendExclusivos = soma((i) => i.secao === 'RENDIMENTO' && i.categoria === 'EXCLUSIVO')
  const dependentes = itens.filter((i) => i.secao === 'DEPENDENTE').length
  const inss = soma((i) => i.secao === 'DEDUCAO' && i.categoria === 'PREVIDENCIA_OFICIAL')
  const pgblBruto = soma((i) => i.secao === 'DEDUCAO' && i.categoria === 'PREVIDENCIA_PRIVADA')
  const pgbl = r2(Math.min(pgblBruto, rendTrib * t.limitePgblPercentual))
  const saude = soma((i) => i.secao === 'DEDUCAO' && i.categoria === 'SAUDE')
  const pensao = soma((i) => i.secao === 'DEDUCAO' && i.categoria === 'PENSAO')
  const livroCaixa = soma((i) => i.secao === 'DEDUCAO' && i.categoria === 'LIVRO_CAIXA')
  const porPessoa = new Map<string, number>()
  for (const i of itens.filter((x) => x.secao === 'DEDUCAO' && x.categoria === 'EDUCACAO')) { const k = String(i.dados?.pessoa || 'TITULAR'); porPessoa.set(k, (porPessoa.get(k) || 0) + (i.valor || 0)) }
  let educacao = 0, educacaoExcedente = 0
  for (const v of porPessoa.values()) { educacao += Math.min(v, t.limiteEducacao); educacaoExcedente += Math.max(0, v - t.limiteEducacao) }
  educacao = r2(educacao); educacaoExcedente = r2(educacaoExcedente)
  const dedDependentes = r2(dependentes * t.dedDependente)
  const deducoes = r2(inss + pgbl + saude + educacao + pensao + livroCaixa + dedDependentes)
  const baseCompleta = r2(Math.max(0, rendTrib - deducoes))
  const completa = aplicaRedutor(impostoAnual(baseCompleta, t), rendTrib, t)
  const descSimpl = r2(Math.min(rendTrib * t.simplificadoPercentual, t.simplificadoLimite))
  const baseSimpl = r2(Math.max(0, rendTrib - descSimpl))
  const simpl = aplicaRedutor(impostoAnual(baseSimpl, t), rendTrib, t)
  const devidoCompleta = r2(completa.imposto), devidoSimplificada = r2(simpl.imposto)
  const retido = r2(itens.filter((i) => i.secao === 'IMPOSTO' && (i.categoria === 'IRRF' || !i.categoria)).reduce((s, i) => s + i.valor, 0))
  const carne = r2(itens.filter((i) => i.secao === 'IMPOSTO' && i.categoria === 'CARNE_LEAO').reduce((s, i) => s + i.valor, 0))
  const pago = r2(retido + carne)
  const recomendado = devidoSimplificada < devidoCompleta ? 'SIMPLIFICADA' : 'COMPLETA'
  const desfecho = (devido: number) => { const s = r2(devido - pago); return { devido, saldo: s, situacao: s > 0 ? 'A_PAGAR' : s < 0 ? 'A_RESTITUIR' : 'ZERADO' } }
  const quotas = (valor: number) => {
    if (valor < 10) return { quotas: 1, valorQuota: valor, observacao: 'Valor mínimo de R$ 10,00 por quota: pagamento à vista.' }
    const n = Math.max(1, Math.min(8, Math.floor(valor / 50)))
    return { quotas: n, valorQuota: r2(valor / n), observacao: 'Até 8 quotas mensais, mínimo de R$ 50,00 cada (conferir regras do exercício).' }
  }
  const completaRes = { ...desfecho(devidoCompleta), baseCalculo: baseCompleta, deducoes, redutor: r2(completa.redutor) }
  const simplRes = { ...desfecho(devidoSimplificada), baseCalculo: baseSimpl, descontoSimplificado: descSimpl, redutor: r2(simpl.redutor) }
  const escolhido = recomendado === 'COMPLETA' ? completaRes : simplRes
  return {
    rendimentos: { tributaveis: rendTrib, isentos: rendIsentos, exclusivos: rendExclusivos },
    deducoes: { previdenciaOficial: inss, previdenciaPrivada: pgbl, previdenciaPrivadaExcedente: r2(pgblBruto - pgbl), saude, educacao, educacaoExcedente, pensao, livroCaixa, dependentes: dedDependentes, quantidadeDependentes: dependentes, total: deducoes },
    imposto: { retidoFonte: retido, carneLeao: carne, totalPago: pago },
    completa: completaRes, simplificada: simplRes, recomendado,
    parcelamento: escolhido.situacao === 'A_PAGAR' ? quotas(escolhido.saldo) : null,
    estimativa: true, aviso: AVISO_IR,
  }
}

// ---------------- malha (checagens simples) ----------------
export interface Pendencia { codigo: string; nivel: 'ERRO' | 'ALERTA' | 'INFO'; mensagem: string; itemId?: string }
export function checarMalha(d: { tipo: string; titularDoc?: string | null; itens: ItemIr[]; anexosPorItem: Set<string>; resultado?: ReturnType<typeof calcIrpf> | null; exercicio: number }): Pendencia[] {
  const out: Pendencia[] = []
  const p = (codigo: string, nivel: Pendencia['nivel'], mensagem: string, itemId?: string) => out.push({ codigo, nivel, mensagem, itemId })
  const cpfCnpjOk = (v?: string | null) => !v || validarCpf(v) || validarCnpj(v)
  if (d.tipo === 'PF') {
    if (!d.titularDoc || !validarCpf(d.titularDoc)) p('CPF_TITULAR', 'ERRO', 'CPF do titular ausente ou inválido.')
    const rend = d.itens.filter((i) => i.secao === 'RENDIMENTO')
    if (!rend.length) p('SEM_RENDIMENTOS', 'ALERTA', 'Nenhum rendimento lançado: confirme se o contribuinte está obrigado/optou por declarar.')
    for (const r of rend) { if (r.categoria !== 'ISENTO' && !r.documento) p('FONTE_SEM_DOC', 'ALERTA', `Rendimento "${r.descricao}" sem CPF/CNPJ da fonte pagadora.`, r.id); else if (!cpfCnpjOk(r.documento)) p('FONTE_DOC_INVALIDO', 'ERRO', `CPF/CNPJ inválido na fonte pagadora de "${r.descricao}".`, r.id) }
    const deps = d.itens.filter((i) => i.secao === 'DEPENDENTE')
    const vistos = new Set<string>()
    for (const dep of deps) {
      const cpf = soDigitos(dep.documento)
      if (!cpf) p('DEP_SEM_CPF', 'ALERTA', `Dependente "${dep.descricao}" sem CPF.`, dep.id)
      else if (!validarCpf(cpf)) p('DEP_CPF_INVALIDO', 'ERRO', `CPF inválido do dependente "${dep.descricao}".`, dep.id)
      else if (vistos.has(cpf)) p('DEP_DUPLICADO', 'ERRO', `Dependente "${dep.descricao}" duplicado.`, dep.id)
      else if (soDigitos(d.titularDoc) === cpf) p('DEP_IGUAL_TITULAR', 'ERRO', 'O titular não pode ser dependente de si mesmo.', dep.id)
      vistos.add(cpf)
      const nasc = dep.dados?.nascimento ? new Date(dep.dados.nascimento) : null
      if (nasc && !isNaN(nasc.getTime())) { const idade = d.exercicio - 1 - nasc.getUTCFullYear(); if (idade > 21 && !dep.dados?.universitario && !/c[oô]njuge|companheir/i.test(String(dep.dados?.parentesco || ''))) p('DEP_IDADE', 'ALERTA', `Dependente "${dep.descricao}" com mais de 21 anos: só é aceito em casos específicos (universitário até 24, incapaz...).`, dep.id) }
    }
    for (const dd of d.itens.filter((i) => i.secao === 'DEDUCAO')) {
      if (['SAUDE', 'EDUCACAO', 'PREVIDENCIA_PRIVADA', 'PENSAO'].includes(dd.categoria || '')) {
        if (!dd.id || !d.anexosPorItem.has(dd.id)) p('SEM_COMPROVANTE', 'ALERTA', `Dedução "${dd.descricao}" sem comprovante anexado.`, dd.id)
        if (dd.categoria === 'SAUDE' && !dd.documento) p('SAUDE_SEM_PRESTADOR', 'ALERTA', `Despesa de saúde "${dd.descricao}" sem CPF/CNPJ do prestador.`, dd.id)
        else if (!cpfCnpjOk(dd.documento)) p('PRESTADOR_INVALIDO', 'ERRO', `CPF/CNPJ do prestador inválido em "${dd.descricao}".`, dd.id)
      }
    }
    const r = d.resultado
    if (r) {
      if (r.rendimentos.tributaveis > 0 && r.deducoes.saude > r.rendimentos.tributaveis * 0.5) p('SAUDE_ALTA', 'ALERTA', 'Despesas médicas acima de 50% dos rendimentos tributáveis: valor atípico que pode cair em malha.')
      if (r.deducoes.educacaoExcedente > 0) p('EDUCACAO_LIMITE', 'INFO', `Despesas de educação acima do limite por pessoa (excedente de ${r.deducoes.educacaoExcedente.toFixed(2)} não é dedutível).`)
      if (r.deducoes.previdenciaPrivadaExcedente > 0) p('PGBL_LIMITE', 'INFO', 'Contribuições a previdência privada acima de 12% da renda tributável: o excedente não é dedutível.')
      if (r.rendimentos.tributaveis > 0 && r.deducoes.previdenciaOficial > r.rendimentos.tributaveis * 0.14) p('INSS_ALTO', 'ALERTA', 'Contribuição previdenciária acima de 14% dos rendimentos tributáveis: confira os informes.')
      if (r.imposto.retidoFonte > r.rendimentos.tributaveis * 0.275 && r.rendimentos.tributaveis > 0) p('IRRF_ALTO', 'ALERTA', 'Imposto retido acima de 27,5% dos rendimentos tributáveis: confira os informes de rendimentos.')
      const patrimonio = d.itens.filter((i) => i.secao === 'BEM').reduce((s, i) => s + (i.valor - (i.valorAnterior ?? i.valor)), 0)
      const dividas = d.itens.filter((i) => i.secao === 'DIVIDA').reduce((s, i) => s + (i.valor - (i.valorAnterior ?? i.valor)), 0)
      const origem = r.rendimentos.tributaveis + r.rendimentos.isentos + r.rendimentos.exclusivos + Math.max(0, dividas) - r.imposto.totalPago
      if (patrimonio > 0 && patrimonio > origem) p('VARIACAO_PATRIMONIAL', 'ERRO', 'Evolução patrimonial maior que os recursos declarados (rendimentos + dívidas): possível variação patrimonial a descoberto.')
    }
    for (const b of d.itens.filter((i) => i.secao === 'BEM')) { if (b.valorAnterior != null && b.valor < b.valorAnterior && !b.dados?.justificativa) p('BEM_REDUZIU', 'ALERTA', `Bem "${b.descricao}" com valor menor que o do ano anterior: informe alienação/baixa (justificativa).`, b.id) }
  } else {
    const rec = d.itens.filter((i) => i.secao === 'RENDIMENTO')
    if (!d.titularDoc || !validarCnpj(d.titularDoc)) p('CNPJ_PJ', 'ERRO', 'CNPJ da empresa ausente ou inválido.')
    if (!rec.length) p('PJ_SEM_RECEITA', 'ALERTA', 'Nenhuma receita lançada para o período.')
  }
  return out
}

// ---------------- estimativa PJ (informativa) ----------------
export function estimativaPj(itens: ItemIr[], dados: { regime?: string; atividade?: 'SERVICOS' | 'COMERCIO' | 'INDUSTRIA' }) {
  const receita = r2(itens.filter((i) => i.secao === 'RENDIMENTO').reduce((s, i) => s + i.valor, 0))
  const despesas = r2(itens.filter((i) => i.secao === 'DEDUCAO').reduce((s, i) => s + i.valor, 0))
  const regime = dados.regime || 'PRESUMIDO'
  const base: any = { regime, receitaBruta: receita, despesas, lucroContabil: r2(receita - despesas), estimativa: true, aviso: 'Estimativa simplificada e informativa: não substitui a apuração fiscal do contador (ECF/ECD).' }
  if (regime === 'PRESUMIDO') {
    const pIr = dados.atividade === 'COMERCIO' || dados.atividade === 'INDUSTRIA' ? 0.08 : 0.32, pCs = dados.atividade === 'COMERCIO' || dados.atividade === 'INDUSTRIA' ? 0.12 : 0.32
    const baseIr = r2(receita * pIr), baseCs = r2(receita * pCs)
    const adicional = r2(Math.max(0, baseIr - 240000) * 0.1)
    return { ...base, irpj: r2(baseIr * 0.15 + adicional), csll: r2(baseCs * 0.09), baseIrpj: baseIr, baseCsll: baseCs, adicionalIrpj: adicional, observacao: 'Lucro presumido anual (apuração trimestral na prática; adicional de 10% sobre base acima de R$ 60 mil/trimestre).' }
  }
  if (regime === 'REAL') {
    const lucro = Math.max(0, base.lucroContabil)
    return { ...base, irpj: r2(lucro * 0.15 + Math.max(0, lucro - 240000) * 0.1), csll: r2(lucro * 0.09), observacao: 'Lucro real anual simplificado, sem adições/exclusões do LALUR.' }
  }
  return { ...base, irpj: 0, csll: 0, observacao: 'Simples Nacional: tributos recolhidos no DAS; entrega da DEFIS anual. Sem IRPJ/CSLL separados.' }
}

// ---------------- calendário de obrigações acessórias (PJ) ----------------
export type TipoObrigacao = 'ECD' | 'ECF' | 'DCTF' | 'EFD_CONTRIBUICOES' | 'EFD_ICMS_IPI' | 'DEFIS' | 'DASN_SIMEI'
export const ROTULO_OBRIGACAO: Record<TipoObrigacao, string> = { ECD: 'ECD — Escrituração Contábil Digital', ECF: 'ECF — Escrituração Contábil Fiscal', DCTF: 'DCTF — Declaração de Débitos e Créditos Tributários Federais', EFD_CONTRIBUICOES: 'EFD-Contribuições (PIS/Cofins)', EFD_ICMS_IPI: 'EFD ICMS/IPI (SPED Fiscal)', DEFIS: 'DEFIS — Declaração de Informações Socioeconômicas e Fiscais (Simples)', DASN_SIMEI: 'DASN-SIMEI — Declaração Anual do MEI' }
export const CHECKLIST_OBRIGACAO: Record<TipoObrigacao, string[]> = {
  ECD: ['Plano de contas e balancete fechados no ano-calendário', 'Livro Diário e Razão conciliados', 'Balanço patrimonial e DRE conferidos', 'Termos de abertura/encerramento e assinatura com certificado digital', 'Validação no programa oficial (PVA) sem erros'],
  ECF: ['ECD entregue (a ECF depende dela)', 'LALUR/LACS e apuração do IRPJ/CSLL conferidos', 'Retenções na fonte conciliadas', 'Validação no PVA e transmissão com certificado digital'],
  DCTF: ['Débitos e créditos do mês apurados', 'Compensações e suspensões conferidas', 'Retenções de terceiros consideradas', 'Validação no programa e transmissão'],
  EFD_CONTRIBUICOES: ['Notas de entrada e saída do mês escrituradas', 'Créditos de PIS/Cofins conferidos', 'Totais conciliados com a contabilidade', 'Validação no PVA e transmissão'],
  EFD_ICMS_IPI: ['Livros de entrada, saída e apuração do ICMS fechados', 'Inventário (quando exigido) apresentado', 'Validação no PVA e transmissão (prazo varia por UF)'],
  DEFIS: ['Receita bruta anual e por atividade apurada', 'Distribuição de lucros e pró-labore conferidos', 'Empregados e despesas declarados', 'Transmissão no Portal do Simples Nacional'],
  DASN_SIMEI: ['Receita bruta do ano apurada (comércio/serviços)', 'Informação sobre empregado', 'Transmissão no Portal do Simples/MEI'],
}
/** Prazos gerais (SIMULAÇÃO de calendário: sem feriados nacionais/estaduais; conferir o calendário oficial do exercício). */
export function prazoObrigacao(tipo: TipoObrigacao, referencia: string): Date {
  const ano = Number(referencia.slice(0, 4))
  const mes = referencia.length > 4 ? Number(referencia.slice(5, 7)) : 0
  const proxMes = (m: number, a: number, n: number) => { const t = m + n; return { a: a + Math.floor((t - 1) / 12), m: ((t - 1) % 12) + 1 } }
  switch (tipo) {
    case 'ECD': return ultimoDiaUtil(ano + 1, 5)
    case 'ECF': return ultimoDiaUtil(ano + 1, 7)
    case 'DEFIS': return new Date(Date.UTC(ano + 1, 2, 31, 12))
    case 'DASN_SIMEI': return new Date(Date.UTC(ano + 1, 4, 31, 12))
    case 'DCTF': { const x = proxMes(mes, ano, 2); return enesimoDiaUtil(x.a, x.m, 15) }
    case 'EFD_CONTRIBUICOES': { const x = proxMes(mes, ano, 2); return enesimoDiaUtil(x.a, x.m, 10) }
    case 'EFD_ICMS_IPI': { const x = proxMes(mes, ano, 1); return new Date(Date.UTC(x.a, x.m - 1, 20, 12)) }
  }
}
export function obrigacoesDoRegime(regime: string, icms: boolean): TipoObrigacao[] {
  if (regime === 'MEI') return ['DASN_SIMEI']
  if (regime === 'SIMPLES') return icms ? ['DEFIS', 'EFD_ICMS_IPI'] : ['DEFIS']
  const base: TipoObrigacao[] = ['ECD', 'ECF', 'DCTF', 'EFD_CONTRIBUICOES']
  return icms ? [...base, 'EFD_ICMS_IPI'] : base
}
export const mensais = (t: TipoObrigacao) => t === 'DCTF' || t === 'EFD_CONTRIBUICOES' || t === 'EFD_ICMS_IPI'
export const situacaoObrigacao = (o: { prazo: Date; status: string }, hoje = new Date()) => {
  const d = diffDias(o.prazo, hoje)
  const concluida = o.status === 'CONFERIDA' || o.status === 'ENTREGUE'
  return { diasParaPrazo: d, situacao: concluida ? o.status : d < 0 ? 'ATRASADA' : d <= 15 ? 'PRAZO_PROXIMO' : o.status, alerta: !concluida && d <= 15 }
}
