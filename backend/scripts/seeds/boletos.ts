/**
 * Seed da CAIXA DE BOLETOS (DDA e e-mail dedicado): fornecedores, histórico de contas a pagar (base do check-up), notas fiscais
 * correspondentes e ausentes, boletos do DDA SIMULADO (normais, um duplicado, um suspeito e um com DV inválido), e-mails simulados
 * com texto, PDF e XML de NF-e (e um anexo em imagem que o sistema honestamente não consegue ler), recorrências (uma NÃO lançada
 * hoje) e um lote pronto para aprovação. Usa SOMENTE a API e é idempotente (se já há boletos na caixa, não faz nada).
 *
 *   import { seedBoletos } from './seeds/boletos'
 *   await seedBoletos(api, ctx)    // api(method, path, body?) -> corpo JSON ou null em caso de erro
 *
 * `ctx.apiAs('FINANCE')` (opcional) devolve uma `api` autenticada como usuário do financeiro: assim o lote é ENVIADO pelo financeiro
 * e quem está logado como administrador/coordenação consegue decidi-lo (segregação de funções: quem envia não decide).
 * Dados 100% fictícios. Não edita edu-demo-seed.ts: o seed principal (ou o e2e) chama esta função.
 */
import { completarChaveNFe } from '../../src/modules/tesouraria/fiscal'
import { barrasParaLinha47, montarBarrasBancario } from '../../src/modules/boletos/linha'
import { montarPdfTexto } from '../../src/modules/boletos/pdfSimples'
import { cnpjComDv } from '../../src/modules/boletos/provedorDda'

export type SeedApi = (method: string, path: string, body?: any) => Promise<any>
export interface SeedCtx {
  tenantId?: string
  failures?: string[]
  apiAs?: (papel: 'COORDINATOR' | 'RECTOR' | 'FINANCE') => Promise<SeedApi | null> | SeedApi | null
}

const B = '/edu/boletos'
const T = '/edu/tesouraria'
const lst = (r: any): any[] => (Array.isArray(r) ? r : r?.items ?? [])
const b64 = (s: string | Buffer) => Buffer.from(s).toString('base64')
const iso = (d: Date) => d.toISOString().slice(0, 10)
const br = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const cnpjFmt = (c: string) => `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`
const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

export interface ResumoSeedBoletos { fornecedores: number; historico: number; boletos: number; notas: number; emails: number; recorrencias: number; lote: boolean }

/** Data do mês corrente (UTC, meio-dia) no dia indicado (limitado a 28 para existir em qualquer mês). */
function diaDoMes(hoje: Date, dia: number, deltaMes = 0) {
  return new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() + deltaMes, Math.min(28, Math.max(1, dia)), 12))
}

function linhaDe(banco: string, valor: number, venc: Date, salt: number) {
  const livre = String(salt * 7919).padStart(25, '1').slice(0, 25)
  return barrasParaLinha47(montarBarrasBancario({ banco, valor, vencimento: venc, campoLivre: livre }))
}

export async function seedBoletos(api: SeedApi, ctx: SeedCtx = {}): Promise<ResumoSeedBoletos> {
  const falha = (m: string) => ctx.failures?.push(`seedBoletos: ${m}`)
  const r: ResumoSeedBoletos = { fornecedores: 0, historico: 0, boletos: 0, notas: 0, emails: 0, recorrencias: 0, lote: false }
  const existentes = await api('GET', `${B}/boletos?pageSize=1&origem=DDA`)
  if (existentes && (existentes.total ?? lst(existentes).length) > 0) return r   // idempotente
  const fin: SeedApi = (ctx.apiAs ? await ctx.apiAs('FINANCE') : null) ?? api
  const hoje = new Date()
  const d0 = hoje.getUTCDate()

  // ---------------- fornecedores (os 3 primeiros alimentam o DDA simulado) ----------------
  const FORN = [
    { razaoSocial: 'Papelaria Central Ltda', base: '100200300001', banco: '341', valor: 1850 },
    { razaoSocial: 'TechCampus Informática Ltda', base: '200300400001', banco: '237', valor: 2430 },
    { razaoSocial: 'Limpeza Total Serviços Ltda', base: '300400500001', banco: '001', valor: 980 },
    { razaoSocial: 'Imobiliária Campus Norte Ltda', base: '400500600001', banco: '104', valor: 8500 },
    { razaoSocial: 'NetFibra Telecom S.A.', base: '500600700001', banco: '033', valor: 1290 },
  ].map((f) => ({ ...f, cnpj: cnpjComDv(f.base) }))
  const fornExist = lst(await api('GET', '/edu/suprimentos/fornecedores?pageSize=200'))
  for (const f of FORN) {
    const ja = fornExist.find((x: any) => String(x.cnpj || '').replace(/\D/g, '') === f.cnpj)
    if (ja) { if (!/^\d{3}$/.test(String(ja.banco || '').trim())) await api('PUT', `/edu/suprimentos/fornecedores/${ja.id}`, { banco: f.banco }); continue }
    const c = await api('POST', '/edu/suprimentos/fornecedores', { razaoSocial: f.razaoSocial, cnpj: f.cnpj, banco: f.banco, email: `financeiro@${f.base.slice(0, 4)}.exemplo.com.br`, categorias: ['Serviços'], prazoPagamentoDias: 30 })
    if (c) r.fornecedores++; else falha(`fornecedor ${f.razaoSocial}`)
  }

  // ---------------- configuração (administração) ----------------
  const cfg = await api('PUT', `${B}/config`, { ddaAtivo: true, emailAtivo: true, emailLocal: 'boletos', ddaDocumento: cnpjComDv('112223330001') })
  if (!cfg) falha('configuração')

  // ---------------- conta pagadora (sem usar o nome "Itaú Principal", que é do seed da Tesouraria) ----------------
  const contas = lst(await api('GET', `${T}/contas`))
  let conta = contas.find((c: any) => c.tipo === 'BANCO' && c.ativa !== false)
  if (!conta) conta = await api('POST', `${T}/contas`, { tipo: 'BANCO', nome: 'Conta pagadora — Boletos', bancoCodigo: '341', bancoNome: 'Banco exemplo', agencia: '0912', numeroConta: '45871', digito: '3', titularNome: 'SUA INSTITUIÇÃO', titularDocumento: cnpjComDv('112223330001'), saldoInicial: 150000, padraoPagamento: true })
  if (!conta) falha('conta pagadora')

  // ---------------- histórico de contas a pagar (3 meses seguidos por fornecedor): base do check-up e da aprendizagem de recorrência ----------------
  for (const [i, f] of FORN.slice(0, 3).entries()) {
    for (let m = 1; m <= 3; m++) {
      const venc = diaDoMes(hoje, 10 + i, -m)
      const valor = f.valor - m * 10
      const t = await api('POST', `${T}/titulos`, {
        origem: 'MANUAL', descricao: `Histórico — ${f.razaoSocial} (${iso(venc).slice(0, 7)})`, fornecedor: f.razaoSocial, fornecedorDocumento: f.cnpj, formaPagamento: 'BOLETO',
        codigoBarras: linhaDe(f.banco, valor, venc, 100 + i * 10 + m), valorBruto: valor, vencimento: venc.toISOString(), categoria: 'historico', contaBancariaId: conta?.id,
      })
      if (t) r.historico++; else falha(`histórico ${f.razaoSocial} -${m}`)
    }
  }

  // ---------------- DDA simulado: normais + duplicado + suspeito + DV inválido ----------------
  const sinc = await fin('POST', `${B}/dda/sincronizar`, {})
  if (sinc) r.boletos += sinc.novos ?? 0; else falha('sincronização DDA')
  const lista = lst(await fin('GET', `${B}/boletos?pageSize=100&origem=DDA`))

  // ---------------- notas fiscais: correspondentes aos 2 primeiros normais; o 3º fica "sem nota fiscal" ----------------
  const normais = lista.filter((b: any) => /N\d$/.test(String(b.origemRef || ''))).sort((a: any, b: any) => String(a.origemRef).localeCompare(String(b.origemRef)))
  for (const [i, b] of normais.slice(0, 2).entries()) {
    const f = FORN[i]
    const n = await api('POST', `${T}/notas`, { direcao: 'ENTRADA', modelo: 'NFSE', numero: String(7100 + i), emissao: new Date(hoje.getTime() - 6 * 86_400_000).toISOString(), participanteNome: f.razaoSocial, participanteDocumento: f.cnpj, descricao: `Fornecimento — ${f.razaoSocial}`, valorServicos: b.valor, issAliquota: 2 })
    if (n) r.notas++; else falha(`nota ${f.razaoSocial}`)
  }

  // ---------------- e-mails simulados (caixa dedicada) ----------------
  const net = FORN[4], alu = FORN[3]
  const vencAluguel = diaDoMes(hoje, Math.min(28, d0 + 2))
  const vencNet = diaDoMes(hoje, Math.min(28, d0 + 3))
  const valNet = 1290
  // a) texto puro no corpo (aluguel; fornecedor sem NF: aluguel não gera nota de serviço)
  const linhaAlu = linhaDe(alu.banco, 8500, vencAluguel, 1)
  const e1 = await fin('POST', `${B}/email/simular`, {
    de: 'cobranca@campusnorte.exemplo.com.br', assunto: 'Boleto aluguel Bloco C',
    texto: `Prezados,\nSegue o boleto do aluguel do Bloco C.\nBeneficiário: ${alu.razaoSocial} - CNPJ ${cnpjFmt(alu.cnpj)}\nNº do documento: ALG-${iso(vencAluguel).slice(0, 7)}\nVencimento: ${vencAluguel.toISOString().slice(8, 10)}/${vencAluguel.toISOString().slice(5, 7)}/${vencAluguel.getUTCFullYear()}\nValor do documento: R$ ${br(8500)}\nLinha digitável: ${linhaAlu.replace(/^(.{5})(.{5})(.{5})(.{6})(.{5})(.{6})(.)(.+)$/, '$1.$2 $3.$4 $5.$6 $7 $8')}\n`,
  })
  if (e1) r.emails++; else falha('e-mail aluguel')
  // b) PDF com texto embutido + XML de NF-e (internet)
  const linhaNet = linhaDe(net.banco, valNet, vencNet, 2)
  const chave = completarChaveNFe(`35${iso(hoje).slice(2, 4)}${iso(hoje).slice(5, 7)}${net.cnpj}55001${String(4521).padStart(9, '0')}112345678`)
  const pdf = montarPdfTexto([
    'BOLETO DE COBRANCA - NetFibra Telecom S.A.', `Beneficiario: ${net.razaoSocial}`, `CNPJ: ${cnpjFmt(net.cnpj)}`, `Numero do documento: NF-4521`, `Vencimento: ${vencNet.toISOString().slice(8, 10)}/${vencNet.toISOString().slice(5, 7)}/${vencNet.getUTCFullYear()}`,
    `Valor do documento: R$ ${br(valNet)}`, `Linha digitavel: ${linhaNet}`,
  ], 'Boleto NetFibra')
  const xml = `<?xml version="1.0" encoding="UTF-8"?><nfeProc><NFe><infNFe Id="NFe${chave}"><ide><nNF>4521</nNF></ide><emit><CNPJ>${net.cnpj}</CNPJ><xNome>${net.razaoSocial}</xNome></emit><total><ICMSTot><vNF>${valNet.toFixed(2)}</vNF></ICMSTot></total><cobr><dup><nDup>001</nDup><dVenc>${iso(vencNet)}</dVenc><vDup>${valNet.toFixed(2)}</vDup></dup></cobr></infNFe></NFe></nfeProc>`
  const e2 = await fin('POST', `${B}/email/simular`, {
    de: 'faturamento@netfibra.exemplo.com.br', assunto: 'Fatura internet + NF-e 4521',
    texto: 'Segue boleto e nota fiscal eletrônica da fatura do mês.',
    anexos: [{ filename: 'boleto-netfibra.pdf', mime: 'application/pdf', contentBase64: b64(pdf) }, { filename: 'nfe-4521.xml', mime: 'application/xml', contentBase64: b64(xml) }],
  })
  if (e2) r.emails++; else falha('e-mail internet')
  const nfe = await api('POST', `${T}/notas`, { direcao: 'ENTRADA', modelo: 'NFE', numero: '4521', serie: '1', chave, emissao: new Date(hoje.getTime() - 2 * 86_400_000).toISOString(), participanteNome: net.razaoSocial, participanteDocumento: net.cnpj, descricao: 'Serviço de internet dedicada', valorServicos: valNet, issAliquota: 0 })
  if (nfe) r.notas++; else falha('NF-e internet')
  // c) anexo em imagem: o sistema não faz OCR e diz isso (nada é inventado)
  const e3 = await fin('POST', `${B}/email/simular`, { de: 'financeiro@fornecedor-exemplo.com.br', assunto: 'Boleto escaneado', texto: 'Segue o boleto em anexo.', anexos: [{ filename: 'boleto-escaneado.png', mime: 'image/png', contentBase64: b64(Buffer.from(PNG_1X1, 'base64')) }] })
  if (e3) r.emails++; else falha('e-mail imagem')

  // reavalia tudo (notas/cadastro novos) para refletir o check-up final
  const todos = lst(await fin('GET', `${B}/boletos?pageSize=100`))
  for (const b of todos) await fin('POST', `${B}/boletos/${b.id}/reanalisar`, {})
  r.boletos = todos.length

  // ---------------- recorrências: aluguel e internet já lançados (e-mails acima); a vigilância patrimonial NÃO foi lançada hoje ----------------
  const recs = [
    { fornecedorNome: alu.razaoSocial, fornecedorDocumento: alu.cnpj, descricao: 'Aluguel do Bloco C', valorEstimado: 8500, diaMes: Math.min(28, d0 + 2), antecedenciaDias: 5 },
    { fornecedorNome: net.razaoSocial, fornecedorDocumento: net.cnpj, descricao: 'Internet dedicada do campus', valorEstimado: valNet, diaMes: Math.min(28, d0 + 3), antecedenciaDias: 5 },
    { fornecedorNome: 'Vigilância Patrimonial Segura Ltda', fornecedorDocumento: cnpjComDv('600700800001'), descricao: 'Vigilância patrimonial', valorEstimado: 6200, diaMes: Math.max(1, Math.min(28, d0 - 1)), antecedenciaDias: 3 },
  ]
  for (const rc of recs) { const x = await fin('POST', `${B}/recorrencias`, rc); if (x) r.recorrencias++; else falha(`recorrência ${rc.descricao}`) }
  await fin('POST', `${B}/recorrencias/verificar`, {})

  // ---------------- lote pronto para aprovação: normais (sem risco) enviados pelo financeiro ----------------
  const aprovaveis = (lst(await fin('GET', `${B}/boletos?pageSize=100&status=RECEBIDO`))).filter((b: any) => ['OK', 'ATENCAO'].includes(b.resultado) && b.origem === 'DDA').map((b: any) => b.id)
  if (aprovaveis.length) {
    const lote = await fin('POST', `${B}/lotes`, { boletoIds: aprovaveis, observacao: 'Lote do dia — boletos do DDA sem alerta crítico' })
    if (lote) { const env = await fin('POST', `${B}/lotes/${lote.id}/enviar`, {}); r.lote = !!env; if (!env) falha('envio do lote') } else falha('criação do lote')
  }
  return r
}
