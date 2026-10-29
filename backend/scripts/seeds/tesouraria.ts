/**
 * Seed da TESOURARIA / FINANCEIRO EDU: contas bancárias e caixa, alçadas, contas a pagar em todos os estados do fluxo
 * (rascunho -> conferido -> autorizado -> enviado ao banco -> pago -> conciliado), remessa CNAB 240 no provedor SIMULADO,
 * extrato OFX com conciliação automática, folha/terceiros, notas fiscais, permuta, recibos e bolsas.
 * Usa SOMENTE a API e é idempotente (se a conta "Itaú Principal" já existe, não duplica nada).
 *
 *   import { seedTesouraria } from './seeds/tesouraria'
 *   await seedTesouraria(api, ctx)    // api(method, path, body?) -> corpo JSON ou null em caso de erro
 *
 * O fluxo exige SEGREGAÇÃO DE FUNÇÕES: quem lança não confere nem autoriza. Por isso `ctx.apiAs` (opcional) devolve uma `api`
 * autenticada como outro usuário (ex.: o coordenador do seed principal). Sem `apiAs`, o seed cria só os rascunhos e
 * deixa a fila de conferência para o coordenador (a tela mostra "aguardando conferência").
 * Não edita edu-demo-seed.ts: o seed principal (ou o e2e) chama esta função.
 */
export type SeedApi = (method: string, path: string, body?: any) => Promise<any>
export interface SeedCtx {
  tenantId?: string
  failures?: string[]
  /** Papéis para os passos que exigem outra pessoa (conferir/autorizar). Ex.: { COORDINATOR: apiDoCoordenador, RECTOR: apiDoReitor } */
  apiAs?: (papel: 'COORDINATOR' | 'RECTOR' | 'FINANCE') => Promise<SeedApi | null> | SeedApi | null
}

const T = '/edu/tesouraria'
const DAY = 86_400_000
const dia = (n: number) => new Date(Date.now() + n * DAY).toISOString()
const lst = (r: any): any[] => (Array.isArray(r) ? r : r?.items ?? [])
const ofxData = (n: number) => new Date(Date.now() + n * DAY).toISOString().slice(0, 10).replace(/-/g, '') + '120000'

export const CNPJ_INSTITUICAO = '11.222.333/0001-81'

function cpf(seed: number): string {
  const n = String(100000000 + ((seed * 7919) % 899999999)).slice(0, 9).split('').map(Number)
  const dv = (a: number[]) => { const s = a.reduce((t, x, i) => t + x * (a.length + 1 - i), 0); const r = (s * 10) % 11; return r === 10 ? 0 : r }
  const d1 = dv(n), d2 = dv([...n, d1])
  return [...n, d1, d2].join('')
}

export interface ResumoSeedTesouraria { contas: number; titulos: number; conferidos: number; autorizados: number; pagos: number; conciliados: number; remessas: number; recibos: number; notas: number; folha: number; permutas: number; itensExtrato: number }

export async function seedTesouraria(api: SeedApi, ctx: SeedCtx = {}): Promise<ResumoSeedTesouraria> {
  const falha = (m: string) => ctx.failures?.push(`seedTesouraria: ${m}`)
  const r: ResumoSeedTesouraria = { contas: 0, titulos: 0, conferidos: 0, autorizados: 0, pagos: 0, conciliados: 0, remessas: 0, recibos: 0, notas: 0, folha: 0, permutas: 0, itensExtrato: 0 }

  const contasExistentes = lst(await api('GET', `${T}/contas`))
  if (contasExistentes.some((c: any) => c.nome === 'Itaú Principal')) return r   // idempotente

  const coord = ctx.apiAs ? await ctx.apiAs('COORDINATOR') : null
  const reitor = ctx.apiAs ? await ctx.apiAs('RECTOR') : null

  // ---------------- configuração, alçadas e contas ----------------
  await api('PUT', `${T}/config`, { regimeTributario: 'IMUNE_ISENTA', serieRecibo: 'A', limiteDuplaAprovacao: 40000, sistemaContabil: 'Domínio Sistemas (exportação CSV genérica)' })
  // alçadas da instituição: a coordenação confere e autoriza até R$ 25.000; acima, diretoria (e dupla aprovação acima de R$ 40.000)
  await api('PUT', `${T}/alcadas`, { faixas: [
    { nome: 'Coordenação/financeiro até R$ 25.000', valorAte: 25000, papeis: ['COORDINATOR', 'FINANCE'], aprovacoes: 1 },
    { nome: 'Diretoria acima de R$ 25.000', valorAte: null, papeis: ['RECTOR', 'ADMIN', 'OWNER', 'BOARD'], aprovacoes: 1 },
  ] })
  const itau = await api('POST', `${T}/contas`, { tipo: 'BANCO', nome: 'Itaú Principal', bancoCodigo: '341', bancoNome: 'Itaú Unibanco', agencia: '0912', numeroConta: '45871', digito: '3', titularNome: 'Instituto Ravel de Ensino Superior', titularDocumento: CNPJ_INSTITUICAO, convenio: 'RAVEL001', saldoInicial: 250000, padraoPagamento: true })
  const bb = await api('POST', `${T}/contas`, { tipo: 'BANCO', nome: 'Banco do Brasil — Reserva', bancoCodigo: '001', bancoNome: 'Banco do Brasil', agencia: '3456', numeroConta: '99871', digito: 'X', titularNome: 'Instituto Ravel de Ensino Superior', titularDocumento: CNPJ_INSTITUICAO, saldoInicial: 80000 })
  const caixa = await api('POST', `${T}/contas`, { tipo: 'CAIXA', nome: 'Caixa da Tesouraria', saldoInicial: 1500 })
  if (!itau || !bb || !caixa) { falha('contas não criadas'); return r }
  r.contas = 3
  await api('POST', `${T}/transferencias`, { origemId: itau.id, destinoId: caixa.id, valor: 1000, descricao: 'Reforço de troco do caixa' })

  // ---------------- recebimentos de mensalidades já existentes ----------------
  const abertas = lst(await api('GET', `${T}/recebiveis?status=PENDENTE&pageSize=30`))
  await api('POST', `${T}/recebiveis/aplicar-bolsas`, {})
  const formas: Array<[string, string]> = [['PIX', itau.id], ['BOLETO', itau.id], ['CARTAO', itau.id], ['DINHEIRO', caixa.id]]
  let i = 0
  for (const rec of abertas.slice(0, 4)) {
    const [forma, contaId] = formas[i++ % formas.length]
    const out = await api('POST', `${T}/recebiveis/${rec.id}/receber`, { forma, contaId })
    if (out?.recibo) r.recibos++
  }
  // permuta: aluno quita parcela com serviço (aprovada por outra pessoa)
  const alvoPermuta = abertas[4]
  if (alvoPermuta) {
    const valor = alvoPermuta.valorDevido ?? alvoPermuta.valor
    const pm = await api('POST', `${T}/permutas`, { sentido: 'RECEBER', parteNome: 'Gráfica Campus Express Ltda', parteDocumento: CNPJ_INSTITUICAO, tipoContrapartida: 'SERVICO', descricao: 'Impressão e encadernação de material didático (contrapartida de mensalidade de bolsista-parceiro)', valorEquivalente: valor, documentoTipo: 'CONTRATO', documentoNumero: 'CT-PERM-2026/07', receivableId: alvoPermuta.id })
    if (pm) {
      r.permutas++
      if (coord) {
        await coord('POST', `${T}/permutas/${pm.id}/aprovar`, {})
        const out = await api('POST', `${T}/recebiveis/${alvoPermuta.id}/receber`, { forma: 'PERMUTA', permutaId: pm.id })
        if (out?.recibo) r.recibos++
      }
    }
  }

  // ---------------- contas a pagar em diferentes estados ----------------
  const base = (o: any) => ({ contaBancariaId: itau.id, formaPagamento: 'PIX', tipoChavePix: 'CNPJ', chavePix: CNPJ_INSTITUICAO, fornecedorDocumento: CNPJ_INSTITUICAO, categoria: 'Operacional', vencimento: dia(5), ...o })
  const criar = async (o: any) => { const t = await api('POST', `${T}/titulos`, base(o)); if (t) r.titulos++; else falha(`título ${o.descricao}`); return t }
  const conferir = async (t: any) => { if (!coord || !t) return t; const x = await coord('POST', `${T}/titulos/${t.id}/conferir`, {}); if (x) r.conferidos++; return x }
  const autorizar = async (t: any) => { if (!coord || !t) return null; const x = await coord('POST', `${T}/titulos/${t.id}/autorizar`, {}); if (x?.titulo?.status === 'AUTORIZADO') r.autorizados++; return x }

  await criar({ descricao: 'Material de expediente — outubro', fornecedor: 'Papelaria Central Ltda', valorBruto: 1840.5, categoria: 'material' })                       // rascunho
  const aguardaConf = await criar({ descricao: 'Manutenção do ar-condicionado — bloco B', fornecedor: 'ClimaFrio Serviços', valorBruto: 4300, vencimento: dia(-2) })
  await conferir(aguardaConf)                                                                                                                                       // conferido (aguarda autorização)
  const pag1 = await criar({ descricao: 'Serviço de limpeza — outubro', fornecedor: 'LimpaMais Serviços', valorBruto: 3980, vencimento: dia(3), fornecedorDocumento: CNPJ_INSTITUICAO })
  const pag2 = await criar({ descricao: 'Licenças de software acadêmico (trimestre)', fornecedor: 'EduTech S.A.', valorBruto: 9400, formaPagamento: 'TED', favorecidoBanco: '237', favorecidoAgencia: '1234', favorecidoConta: '55412-8', chavePix: undefined, tipoChavePix: undefined, vencimento: dia(8) })
  const pag3 = await criar({ descricao: 'Energia elétrica — Campus Central', fornecedor: 'Concessionária de Energia', valorBruto: 21800, formaPagamento: 'BOLETO', codigoBarras: '23793381286000000000300000000403456780000012345', chavePix: undefined, tipoChavePix: undefined, fornecedorDocumento: undefined, vencimento: dia(4) })
  const equip = await criar({ descricao: 'Equipamentos odontológicos — laboratório (compra)', fornecedor: 'DentalSupply Ltda', valorBruto: 48500, origem: 'COMPRA', vencimento: dia(15) })
  for (const t of [pag1, pag2, pag3, equip]) await conferir(t)
  for (const t of [pag1, pag2, pag3]) await autorizar(t)
  // acima do limite global exige dupla aprovação da diretoria: a 1ª aprovação do reitor deixa o título em "1/2"
  if (equip && reitor) await reitor('POST', `${T}/titulos/${equip.id}/autorizar`, {})

  // remessa CNAB 240 -> envio (simulado) -> retorno
  if (r.autorizados) {
    const rem = await api('POST', `${T}/remessas`, { contaId: itau.id, tipo: 'CNAB240', dataPagamento: dia(0) })
    if (rem) {
      r.remessas++
      await api('POST', `${T}/remessas/${rem.id}/enviar`, {})
      const ret = await api('POST', `${T}/remessas/${rem.id}/consultar-retorno`, {})
      r.pagos += ret?.pagos ?? 0
    }
  }

  // ---------------- folha, pró-labore e terceiros ----------------
  const comp = new Date().toISOString().slice(0, 7)
  const folha = await api('POST', `${T}/folha/importar`, {
    competencia: comp, tipo: 'MISTO', vencimentoPadrao: dia(6),
    lancamentos: [
      { tipo: 'SALARIO', favorecidoNome: 'Marcos Albuquerque (Coordenação)', documento: cpf(11), funcionarioId: 'seed-f1', bruto: 9800, inss: 876.97, irrf: 1190.5, chavePix: cpf(11), tipoChavePix: 'CPF' },
      { tipo: 'SALARIO', favorecidoNome: 'Patrícia Moreira (Secretaria)', documento: cpf(12), funcionarioId: 'seed-f2', bruto: 4200, inss: 378, irrf: 118.2, chavePix: cpf(12), tipoChavePix: 'CPF' },
      { tipo: 'PROLABORE', favorecidoNome: 'Helena Ravel (Mantenedora)', documento: cpf(13), funcionarioId: 'seed-s1', bruto: 15000, chavePix: cpf(13), tipoChavePix: 'CPF' },
      { tipo: 'RPA', favorecidoNome: 'Dr. Ricardo Menezes (palestrante convidado)', documento: cpf(14), bruto: 2500, issAliquota: 5, chavePix: 'ricardo.menezes@exemplo.com', tipoChavePix: 'EMAIL', referencia: 'Semana Acadêmica' },
      { tipo: 'PJ', favorecidoNome: 'Eletro Manutenção ME', documento: CNPJ_INSTITUICAO, bruto: 3200, retemTributos: true, issAliquota: 2, chavePix: CNPJ_INSTITUICAO, tipoChavePix: 'CNPJ', referencia: 'NF 5521 — manutenção elétrica' },
    ],
  })
  r.folha = folha?.criados?.length ?? 0
  if (coord && folha) for (const c of folha.criados.slice(0, 3)) await coord('POST', `${T}/titulos/${c.id}/conferir`, {})

  // ---------------- notas fiscais ----------------
  const nfe = await api('POST', `${T}/notas`, { direcao: 'ENTRADA', modelo: 'NFSE', numero: '5521', emissao: dia(-4), participanteNome: 'Eletro Manutenção ME', participanteDocumento: CNPJ_INSTITUICAO, descricao: 'Manutenção elétrica', valorServicos: 3200, issAliquota: 2, issRetido: true, retencaoIrrf: 48, retencaoPis: 20.8, retencaoCofins: 96, retencaoCsll: 32, contaContabilId: undefined })
  if (nfe) r.notas++
  const nfpag = await api('POST', `${T}/notas`, { direcao: 'ENTRADA', modelo: 'NFSE', numero: '8890', emissao: dia(-6), participanteNome: 'LimpaMais Serviços', participanteDocumento: CNPJ_INSTITUICAO, descricao: 'Limpeza e conservação', valorServicos: 3980, issAliquota: 3, tituloId: pag1?.id })
  if (nfpag) r.notas++
  const nfs = await api('POST', `${T}/notas`, { direcao: 'SAIDA', modelo: 'NFSE', numero: '3001', emissao: dia(-3), participanteNome: 'Aluno (exemplo)', valorServicos: 1500, issAliquota: 3, descricao: 'Serviços educacionais — taxa de extensão' })
  if (nfs) r.notas++

  // ---------------- extrato OFX e conciliação automática ----------------
  const pagos = lst(await api('GET', `${T}/titulos?status=PAGO&pageSize=50`))
  const linhas = pagos.map((t: any, k: number) => `<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>${ofxData(0)}<TRNAMT>-${Number(t.valorLiquido).toFixed(2)}<FITID>SEED${k + 1}<MEMO>PAGTO ${String(t.fornecedor).toUpperCase()}\n`).join('')
  const ofx = `OFXHEADER:100\nDATA:OFXSGML\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKACCTFROM><BANKID>341<ACCTID>45871</BANKACCTFROM><BANKTRANLIST><DTSTART>${ofxData(-7)}<DTEND>${ofxData(0)}\n${linhas}` +
    `<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>${ofxData(-1)}<TRNAMT>-89.90<FITID>SEEDTAR<MEMO>TARIFA PACOTE DE SERVICOS\n<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>${ofxData(-1)}<TRNAMT>412.37<FITID>SEEDDEP<MEMO>DEPOSITO NAO IDENTIFICADO\n</BANKTRANLIST><LEDGERBAL><BALAMT>238210.11<DTASOF>${ofxData(0)}</LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`
  const imp = await api('POST', `${T}/extratos/importar`, { contaId: itau.id, conteudo: ofx, nomeArquivo: 'extrato-itau.ofx' })
  r.itensExtrato = imp?.novos ?? 0
  if (imp) {
    const auto = await api('POST', `${T}/conciliacao/automatica`, { contaId: itau.id })
    r.conciliados = auto?.conciliados ?? 0
  }

  await api('GET', `${T}/bolsas/conferencia`)    // registra divergências no painel
  return r
}
