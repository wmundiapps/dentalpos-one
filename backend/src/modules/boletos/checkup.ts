import { validarChaveNFe, validarDocumento } from '../tesouraria/fiscal'
import { similaridade } from '../tesouraria/extratoParser'
import { lerLinhaDigitavel, soDigitos } from './linha'

// Check-up de autenticidade de um boleto (verificação INTERNA; não consulta o banco nem a CIP e não substitui a conferência no banco).
// Função pura: o serviço monta o contexto (cadastro de fornecedores, histórico, notas, duplicidades) e grava o resultado.

export type Resultado = 'OK' | 'ATENCAO' | 'SUSPEITO' | 'DUPLICADO'
export type Gravidade = 'OK' | 'INFO' | 'ATENCAO' | 'CRITICO'
export interface Motivo { codigo: string; gravidade: Gravidade; texto: string; pontos: number }

export interface EntradaCheckup {
  linhaDigitavel?: string | null
  codigoBarras?: string | null
  valor?: number | null
  vencimento?: Date | null
  beneficiarioNome?: string | null
  beneficiarioDocumento?: string | null
  nfChave?: string | null
  hoje?: Date
}
export interface FornecedorCad { id: string; razaoSocial: string; nomeFantasia?: string | null; cnpj?: string | null; banco?: string | null }
export interface NotaCad { id: string; numero: string; chave?: string | null; emissao: Date; valorTotal: number; valorLiquido: number; participanteDocumento?: string | null; participanteNome?: string }
export interface DuplicidadeAchada { tipo: 'BOLETO' | 'TITULO'; id: string; numero: string; status: string; criterio: 'CODIGO_BARRAS' | 'FORNECEDOR_VALOR_VENCIMENTO' }
export interface ContextoCheckup {
  fornecedores: FornecedorCad[]
  historicoValores: number[]                 // valores de títulos/boletos anteriores do mesmo fornecedor
  bancosHistorico: string[]                  // bancos (3 dígitos) de boletos/títulos anteriores do mesmo fornecedor
  notas: NotaCad[]                           // notas fiscais de entrada candidatas (mesmo participante)
  notaPorChave?: NotaCad | null
  duplicidade?: DuplicidadeAchada | null
  cfg?: { diasVencidoSuspeito?: number; fatorValorSuspeito?: number; prazoNotaDias?: number }
}
export interface SaidaCheckup {
  resultado: Resultado
  score: number
  motivos: Motivo[]
  fornecedorId: string | null
  notaFiscalId: string | null
  codigoBarras: string | null
  banco: string | null
  tipoBoleto: string | null
  duplicidade: DuplicidadeAchada | null
  leitura: { valor: number | null; vencimento: string | null }
}

const iso10 = (d: Date) => d.toISOString().slice(0, 10)
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const mediana = (v: number[]) => { const s = [...v].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }

/** Procura o fornecedor no cadastro por CNPJ; sem CNPJ confiável, por nome parecido. */
export function localizarFornecedor(forn: FornecedorCad[], doc?: string | null, nome?: string | null) {
  const d = soDigitos(doc)
  const porCnpj = d ? forn.find((f) => soDigitos(f.cnpj) === d) : undefined
  if (porCnpj) return { fornecedor: porCnpj, via: 'CNPJ' as const, similar: undefined as FornecedorCad | undefined }
  let similar: FornecedorCad | undefined
  if (nome) {
    let melhor = 0
    for (const f of forn) {
      const s = Math.max(similaridade(nome, f.razaoSocial), f.nomeFantasia ? similaridade(nome, f.nomeFantasia) : 0)
      if (s > melhor) { melhor = s; similar = f }
    }
    if (melhor < 0.8) similar = undefined
  }
  return { fornecedor: undefined as FornecedorCad | undefined, via: null, similar }
}

/** Há valor/histórico compatível com a nota? (valor total, líquido ou fração de parcelamento 2..12 vezes). */
export function notaCompativel(n: NotaCad, valor: number): 'EXATO' | 'PARCELA' | null {
  const perto = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.05, b * 0.01)
  if (perto(valor, n.valorTotal) || perto(valor, n.valorLiquido)) return 'EXATO'
  for (let p = 2; p <= 12; p++) if (perto(valor, n.valorTotal / p) || perto(valor, n.valorLiquido / p)) return 'PARCELA'
  return null
}

export function avaliarBoleto(e: EntradaCheckup, ctx: ContextoCheckup): SaidaCheckup {
  const hoje = e.hoje ?? new Date()
  const cfg = { diasVencidoSuspeito: 30, fatorValorSuspeito: 3, prazoNotaDias: 120, ...(ctx.cfg || {}) }
  const m: Motivo[] = []
  const add = (codigo: string, gravidade: Gravidade, texto: string, pontos = 0) => m.push({ codigo, gravidade, texto, pontos })

  // (a) linha digitável / código de barras
  const bruta = e.linhaDigitavel || e.codigoBarras || ''
  const leitura = bruta ? lerLinhaDigitavel(bruta, e.vencimento ?? hoje) : null
  let valorLido: number | null = null
  let vencLido: string | null = null
  if (!leitura) {
    add('LINHA_AUSENTE', 'ATENCAO', 'Linha digitável/código de barras não informado ou não lido: sem como validar os dígitos verificadores. Conferir no documento original.', 15)
  } else if (!leitura.ok) {
    const critico = leitura.dvsInvalidos.length > 0 || leitura.formato === 'INVALIDO'
    add('DV_INVALIDO', critico ? 'CRITICO' : 'ATENCAO', `Linha digitável/código de barras com problema: ${leitura.erros.join('; ')}.`, critico ? 60 : 15)
  } else {
    add('DV_OK', 'OK', 'Dígitos verificadores da linha digitável/código de barras conferem (módulo 10/11).')
  }
  if (leitura && leitura.formato !== 'INVALIDO') {
    valorLido = leitura.valor ?? null
    vencLido = leitura.vencimento ? iso10(leitura.vencimento) : null
    if (valorLido != null && e.valor != null) {
      if (Math.abs(valorLido - e.valor) > 0.009) add('VALOR_DIVERGE', 'CRITICO', `Valor embutido na linha digitável (${brl(valorLido)}) diferente do valor informado (${brl(e.valor)}).`, 40)
      else add('VALOR_CONFERE', 'OK', 'Valor embutido na linha digitável confere com o valor do boleto.')
    } else if (valorLido == null && leitura.ok && leitura.tipo === 'BANCARIO') {
      add('VALOR_LIVRE', 'INFO', 'A linha digitável não traz valor (valor livre): conferir o valor no documento.')
    }
    if (vencLido && e.vencimento) {
      if (vencLido !== iso10(e.vencimento)) add('VENCIMENTO_DIVERGE', 'CRITICO', `Vencimento embutido na linha digitável (${vencLido.split('-').reverse().join('/')}) diferente do informado (${iso10(e.vencimento).split('-').reverse().join('/')}).`, 40)
      else add('VENCIMENTO_CONFERE', 'OK', 'Vencimento embutido na linha digitável confere.')
    }
  }

  // (b) fornecedor/beneficiário
  const doc = soDigitos(e.beneficiarioDocumento)
  if (doc && !validarDocumento(doc)) add('DOC_INVALIDO', 'CRITICO', 'CPF/CNPJ do beneficiário com dígitos verificadores inválidos.', 35)
  const loc = localizarFornecedor(ctx.fornecedores, doc || null, e.beneficiarioNome)
  let fornecedor = loc.fornecedor
  if (fornecedor) {
    const sim = e.beneficiarioNome ? Math.max(similaridade(e.beneficiarioNome, fornecedor.razaoSocial), fornecedor.nomeFantasia ? similaridade(e.beneficiarioNome, fornecedor.nomeFantasia) : 0) : 1
    if (e.beneficiarioNome && sim < 0.5) add('NOME_DIVERGE', 'ATENCAO', `CNPJ confere com o fornecedor cadastrado "${fornecedor.razaoSocial}", mas a razão social do boleto ("${e.beneficiarioNome}") é diferente.`, 30)
    else add('FORNECEDOR_OK', 'OK', `Beneficiário confere com o fornecedor cadastrado: ${fornecedor.razaoSocial}.`)
  } else if (loc.similar) {
    if (doc) add('CNPJ_DIVERGE', 'CRITICO', `O nome do beneficiário lembra o fornecedor cadastrado "${loc.similar.razaoSocial}", mas o CNPJ do boleto não confere com o cadastro.`, 50)
    else { fornecedor = loc.similar; add('CNPJ_AUSENTE', 'ATENCAO', `Boleto sem CNPJ do beneficiário; identificado pelo nome como "${loc.similar.razaoSocial}". Conferir o CNPJ no documento.`, 10) }
  } else {
    add('BENEFICIARIO_DESCONHECIDO', 'ATENCAO', 'Beneficiário sem cadastro de fornecedor (CNPJ/razão social não encontrados). Cadastrar o fornecedor ou confirmar a origem do boleto.', 25)
  }

  // banco/histórico do fornecedor
  const barras = leitura && leitura.formato !== 'INVALIDO' ? leitura.codigoBarras ?? null : null
  const banco = leitura?.tipo === 'BANCARIO' && barras ? barras.slice(0, 3) : null
  if (banco && ctx.bancosHistorico.length) {
    if (!ctx.bancosHistorico.includes(banco)) add('BANCO_DIVERGE', 'ATENCAO', `Banco do boleto (${banco}) diferente do histórico deste fornecedor (${Array.from(new Set(ctx.bancosHistorico)).join(', ')}). Confirmar com o fornecedor por canal conhecido antes de pagar.`, 35)
    else add('BANCO_OK', 'OK', `Banco do boleto (${banco}) coincide com o histórico do fornecedor.`)
  }

  // valor x histórico
  if (e.valor != null && ctx.historicoValores.length >= 2) {
    const med = mediana(ctx.historicoValores)
    if (med > 0) {
      const r = e.valor / med
      if (r >= cfg.fatorValorSuspeito || r <= 1 / cfg.fatorValorSuspeito) {
        const forte = r >= cfg.fatorValorSuspeito * 2 || r <= 1 / (cfg.fatorValorSuspeito * 2)
        add('VALOR_FORA_HISTORICO', 'ATENCAO', `Valor ${brl(e.valor)} muito fora do histórico deste fornecedor (mediana ${brl(med)}, ${r >= 1 ? `${r.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}x maior` : `${(1 / r).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}x menor`}).`, forte ? 40 : 30)
      } else add('VALOR_HISTORICO_OK', 'OK', 'Valor compatível com o histórico do fornecedor.')
    }
  }

  // vencimento
  if (e.vencimento) {
    const dias = Math.floor((hoje.getTime() - e.vencimento.getTime()) / 86_400_000)
    if (dias > cfg.diasVencidoSuspeito) add('VENCIDO_HA_MUITO', 'ATENCAO', `Boleto vencido há ${dias} dias (limite de alerta: ${cfg.diasVencidoSuspeito}). Confirmar se a cobrança ainda é devida.`, 25)
    else if (dias > 0) add('VENCIDO', 'ATENCAO', `Boleto vencido há ${dias} dia(s): pagamento pode ter juros/multa.`, 10)
  } else add('SEM_VENCIMENTO', 'ATENCAO', 'Vencimento não identificado no boleto.', 10)

  // (c) nota fiscal
  const prazo = cfg.prazoNotaDias * 86_400_000
  if (e.nfChave) {
    const k = soDigitos(e.nfChave)
    if (!validarChaveNFe(k)) add('NF_CHAVE_INVALIDA', 'CRITICO', 'Chave de acesso da NF-e informada com dígito verificador inválido.', 40)
    else if (doc && doc.length === 14 && k.slice(6, 20) !== doc) add('NF_CHAVE_CNPJ_DIVERGE', 'CRITICO', 'O CNPJ contido na chave da NF-e é diferente do CNPJ do beneficiário do boleto.', 40)
  }
  let nota: NotaCad | null = ctx.notaPorChave ?? null
  if (!nota && e.valor != null) {
    const candidatas = ctx.notas
      .map((n) => ({ n, tipo: notaCompativel(n, e.valor as number) }))
      .filter((x) => x.tipo)
      .filter((x) => !e.vencimento || (e.vencimento.getTime() - x.n.emissao.getTime() <= prazo && e.vencimento.getTime() - x.n.emissao.getTime() >= -30 * 86_400_000))
    nota = candidatas.sort((a, b) => (a.tipo === 'EXATO' ? 0 : 1) - (b.tipo === 'EXATO' ? 0 : 1))[0]?.n ?? null
  }
  if (nota) {
    const tipo = e.valor != null ? notaCompativel(nota, e.valor) : 'EXATO'
    if (!tipo) add('NF_VALOR_DIVERGE', 'ATENCAO', `Nota fiscal nº ${nota.numero} localizada, mas o valor (${brl(nota.valorTotal)}) não é compatível com o boleto.`, 20)
    else if (e.vencimento && (e.vencimento.getTime() - nota.emissao.getTime() > prazo)) add('NF_FORA_PRAZO', 'ATENCAO', `Nota fiscal nº ${nota.numero} emitida há mais de ${cfg.prazoNotaDias} dias do vencimento.`, 10)
    else add('NF_OK', 'OK', `Nota fiscal nº ${nota.numero} localizada com valor ${tipo === 'PARCELA' ? 'compatível com parcela' : 'compatível'} e dentro do prazo.`)
  } else if (e.nfChave && validarChaveNFe(e.nfChave)) {
    add('NF_NAO_LANCADA', 'ATENCAO', 'NF-e informada no boleto/e-mail, mas não está lançada em Notas fiscais. Lançar a nota para conciliar.', 15)
  } else {
    add('SEM_NF', 'ATENCAO', 'Sem nota fiscal: nenhuma nota de entrada deste fornecedor com valor compatível e dentro do prazo. Pendência: obter/lançar a nota fiscal.', 15)
  }

  // (d) duplicidade
  const dup = ctx.duplicidade ?? null
  if (dup) {
    add('DUPLICADO', 'CRITICO',
      dup.criterio === 'CODIGO_BARRAS'
        ? `Mesmo código de barras já lançado (${dup.tipo === 'TITULO' ? 'conta a pagar' : 'boleto'} ${dup.numero}, situação ${dup.status.replace(/_/g, ' ').toLowerCase()}).`
        : `Provável duplicidade: mesmo fornecedor, valor e vencimento próximo de ${dup.tipo === 'TITULO' ? 'conta a pagar' : 'boleto'} ${dup.numero} (${dup.status.replace(/_/g, ' ').toLowerCase()}).`, 0)
  }

  const pontos = m.reduce((s, x) => s + x.pontos, 0)
  const critico = m.some((x) => x.gravidade === 'CRITICO' && x.codigo !== 'DUPLICADO')
  const algumAlerta = m.some((x) => x.gravidade === 'ATENCAO')
  let resultado: Resultado
  let score = Math.min(100, pontos)
  if (dup) { resultado = 'DUPLICADO'; score = Math.max(score, 80) }
  else if (critico || pontos >= 50) { resultado = 'SUSPEITO'; score = Math.max(score, 60) }
  else if (algumAlerta) resultado = 'ATENCAO'
  else resultado = 'OK'

  return {
    resultado, score, motivos: m,
    fornecedorId: fornecedor?.id ?? null,
    notaFiscalId: nota?.id ?? null,
    codigoBarras: barras,
    banco,
    tipoBoleto: leitura?.tipo ?? null,
    duplicidade: dup,
    leitura: { valor: valorLido, vencimento: vencLido },
  }
}
