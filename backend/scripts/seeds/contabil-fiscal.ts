/**
 * Seed do ESCRITÓRIO DE CONTABILIDADE (bloco contábil-fiscal): 4 empresas FICTÍCIAS (Simples/Fator R, Simples serviços de saúde,
 * Lucro Presumido comércio e MEI) com 12 meses de histórico (receitas e despesas lançadas pelas contas a pagar/receber, que geram os
 * lançamentos contábeis e, portanto, balancete e DRE), notas fiscais (emitidas SIMULADAS, uma cancelada, XML de entrada importado),
 * recibos, guias SIMULADAS dos últimos meses (algumas pagas, uma atrasada), extrato OFX/CSV para conciliar e régua de cobrança.
 * Usa SOMENTE a API (precisa de um usuário com papel GESTOR/CONTADOR: ADMIN/OWNER/RECTOR/BOARD servem) e é idempotente
 * (se já existem empresas contábeis no tenant, não faz nada). Todos os dados são fictícios.
 *
 *   import { seedContabilFiscal } from './seeds/contabil-fiscal'
 *   await seedContabilFiscal(api, ctx)    // api(method, path, body?) -> corpo JSON ou null em caso de erro
 *
 * ctx (tudo opcional): { failures?: string[]; apiAs?: (papel: 'FINANCE') => Promise<SeedApi|null>|SeedApi|null }
 *   - failures: lista onde as falhas são acumuladas (em vez de lançar exceção);
 *   - apiAs('FINANCE'): `api` autenticada como usuário do financeiro (a cobrança e a conciliação passam a ser feitas por ele).
 * Não edita edu-demo-seed.ts: o seed principal (ou o e2e) é quem chama esta função.
 */
import { cnpjComDv } from '../../src/modules/contabil/nucleo/util'

export type SeedApi = (method: string, path: string, body?: any) => Promise<any>
export interface SeedCtx { tenantId?: string; failures?: string[]; apiAs?: (papel: 'FINANCE') => Promise<SeedApi | null> | SeedApi | null }
export interface ResumoSeedContabil { empresas: number; titulos: number; notas: number; recibos: number; guias: number; extrato: number; cobrancas: number; pulado: boolean }

const C = '/edu/contabil'
const lst = (r: any): any[] => (Array.isArray(r) ? r : r?.items ?? [])
const pad = (n: number) => String(n).padStart(2, '0')
const brn = (v: number) => v.toFixed(2).replace('.', ',')

export async function seedContabilFiscal(api: SeedApi, ctx: SeedCtx = {}): Promise<ResumoSeedContabil> {
  const falha = (m: string) => ctx.failures?.push(`seedContabilFiscal: ${m}`)
  const r: ResumoSeedContabil = { empresas: 0, titulos: 0, notas: 0, recibos: 0, guias: 0, extrato: 0, cobrancas: 0, pulado: false }
  const existentes = await api('GET', `${C}/empresas?pageSize=1`)
  if (existentes === null) { falha('módulo contábil indisponível (papel sem acesso ou rotas não montadas)'); return r }
  if ((existentes.total ?? lst(existentes).length) > 0) { r.pulado = true; return r }   // idempotente
  const fin: SeedApi = (ctx.apiAs ? await ctx.apiAs('FINANCE') : null) ?? api
  const ok = async (rot: string, p: Promise<any>) => { const x = await p; if (x === null) falha(rot); return x }

  const hoje = new Date()
  const y = hoje.getUTCFullYear(), m0 = hoje.getUTCMonth()
  const dt = (off: number, dia: number) => { const d = new Date(Date.UTC(y, m0 + off, Math.min(dia, 28), 12)); return d.toISOString().slice(0, 10) }
  const dHoje = (delta: number) => new Date(Date.UTC(y, m0, hoje.getUTCDate() + delta, 12)).toISOString().slice(0, 10)
  const hojeIso = dHoje(0)
  const comp = (off: number) => dt(off, 1).slice(0, 7)
  const sazon = [0.93, 0.95, 1.0, 1.02, 1.04, 0.99, 0.97, 1.03, 1.06, 1.08, 1.1, 1.16]   // do mês mais antigo (-11) ao atual (0)
  const arred = (v: number) => Math.round(v / 10) * 10

  const emps = [
    { chave: 'clinica', dados: { tipoPessoa: 'PJ', documento: cnpjComDv('112223330001'), razaoSocial: 'Clínica Sorriso Odontologia Ltda', nomeFantasia: 'Sorriso Odonto', regimeAtual: 'SIMPLES', cnae: '8630504', cnaeDescricao: 'Atividade odontológica', atividade: 'SERVICOS', uf: 'SP', municipio: 'São Paulo', issAliquota: 3, email: 'financeiro@sorrisoodonto.example', telefone: '11990001111', inicioAtividade: '2019-03-12' }, receita: 52000, folha: 14500, aluguel: 6500, custo: ['4.1.2.01', 'Materiais odontológicos', 9200], adm: 3100, mkt: 2300, impostoPct: 0.082, partes: ['Atendimentos particulares', 'Repasse de convênios'], clientes: ['Pacientes particulares', 'OdontoVida Convênios'] },
    { chave: 'tech', dados: { tipoPessoa: 'PJ', documento: cnpjComDv('445556660001'), razaoSocial: 'TechNova Soluções em Software Ltda', nomeFantasia: 'TechNova', regimeAtual: 'SIMPLES', cnae: '6201501', cnaeDescricao: 'Desenvolvimento de programas de computador sob encomenda', atividade: 'SERVICOS_FATOR_R', uf: 'MG', municipio: 'Belo Horizonte', issAliquota: 2.5, email: 'contato@technova.example', telefone: '31990002222', inicioAtividade: '2020-08-03' }, receita: 118000, folha: 21500, aluguel: 4500, custo: ['4.1.2.01', 'Freelancers e terceirizados', 12500], adm: 8200, mkt: 5200, impostoPct: 0.168, partes: ['Contrato de manutenção e suporte', 'Projetos de desenvolvimento'], clientes: ['Grupo Alfa Holding', 'Varejo Horizonte S.A.'] },
    { chave: 'mercado', dados: { tipoPessoa: 'PJ', documento: cnpjComDv('778889990001'), razaoSocial: 'Mercado Bom Preço Ltda', nomeFantasia: 'Bom Preço', regimeAtual: 'PRESUMIDO', cnae: '4712100', cnaeDescricao: 'Comércio varejista de mercadorias em geral (minimercado)', atividade: 'COMERCIO', uf: 'PR', municipio: 'Curitiba', issAliquota: null, email: 'adm@bompreco.example', telefone: '41990003333', inicioAtividade: '2016-05-20' }, receita: 330000, folha: 38500, aluguel: 22000, custo: ['4.1.1.01', 'Compra de mercadorias para revenda', 231000], adm: 9400, mkt: 6100, impostoPct: 0.07, partes: ['Vendas no balcão e caixa', 'Vendas a empresas (faturadas)'], clientes: ['Consumidores (caixa)', 'Condomínio Parque Verde'] },
  ] as const

  const criadas: Record<string, any> = {}
  for (const e of emps) {
    const x = await ok(`criar empresa ${e.dados.razaoSocial}`, api('POST', `${C}/empresas`, e.dados))
    if (x?.id) { criadas[e.chave] = x; r.empresas++ }
  }
  const mei = await ok('criar empresa MEI', api('POST', `${C}/empresas`, { tipoPessoa: 'PJ', documento: cnpjComDv('990001110001'), razaoSocial: 'Maria das Dores Silva 12345678900', nomeFantasia: 'Studio Maria Beleza', regimeAtual: 'MEI', cnae: '9602501', cnaeDescricao: 'Cabeleireiros, manicure e pedicure', atividade: 'SERVICOS', uf: 'BA', municipio: 'Salvador', email: 'maria@studiomaria.example', telefone: '71990004444', inicioAtividade: '2022-01-10' }))
  if (mei?.id) { criadas.mei = mei; r.empresas++ }

  // ---------------- MEI: histórico informado (sem escrituração) — 12 meses perto do limite ----------------
  if (criadas.mei) {
    const vals = [5900, 6100, 6350, 6200, 6500, 6400, 6650, 6800, 6700, 7000, 7150, 7400]
    for (let i = -11; i <= 0; i++) await ok('histórico MEI', api('PUT', `${C}/empresas/${criadas.mei.id}/historico/${comp(i)}`, { receitaBruta: vals[i + 11], despesas: Math.round(vals[i + 11] * 0.22), folha: 0, comprasInsumos: Math.round(vals[i + 11] * 0.12), irrfRetido: 0 }))
  }

  // ---------------- empresas escrituradas: 12 meses de contas a receber/pagar ----------------
  const titulosPrincipais: Record<string, string[]> = {}   // 1 título de receita por mês (para vincular às notas)
  for (const e of emps) {
    const emp = criadas[e.chave]; if (!emp) continue
    titulosPrincipais[e.chave] = []
    for (let i = -11; i <= 0; i++) {
      const k = i + 11
      const rec = arred(e.receita * sazon[k])
      const partes = [Math.round(rec * 0.6), rec - Math.round(rec * 0.6)]
      for (const [j, desc] of e.partes.entries()) {
        const venc = dt(i, 10 + j * 8)
        const t = await ok('título receber', api('POST', `${C}/titulos`, { empresaId: emp.id, tipo: 'RECEBER', descricao: `${desc} — ${comp(i)}`, parceiroNome: e.clientes[j], parceiroEmail: j ? 'financeiro@cliente.example' : null, parceiroTelefone: '11999990000', valor: partes[j], emissao: dt(i, 3 + j * 6), vencimento: venc, contaContabilCodigo: e.dados.atividade === 'COMERCIO' ? '3.1.1.01' : '3.1.2.01', ...(venc < dHoje(-3) ? { pagoEm: venc, formaPagamento: j ? 'PIX' : 'CARTAO' } : {}) }))
        if (!t?.id) continue
        r.titulos++
        if (j === 0) titulosPrincipais[e.chave].push(t.id)
      }
      const despesas: Array<[string, string, string, number, number]> = [
        ['Folha de pagamento e encargos', 'Colaboradores (folha)', '5.1.1.01', e.folha, 5],
        [`Aluguel e condomínio`, 'Imobiliária Central', '5.1.3.01', e.aluguel, 8],
        [e.custo[1], 'Fornecedores diversos', e.custo[0], arred(e.custo[2] * sazon[k]), 12],
        ['Despesas administrativas', 'Fornecedores administrativos', '5.1.2.01', arred(e.adm * (0.95 + (k % 4) * 0.04)), 15],
        ['Marketing e publicidade', 'Agência Impulso', '5.1.4.01', arred(e.mkt * (0.9 + (k % 3) * 0.1)), 18],
        [`Tributos sobre vendas/serviços (${e.dados.regimeAtual === 'SIMPLES' ? 'DAS' : 'PIS/COFINS/ISS/ICMS'})`, 'Receita Federal / Fazenda', '3.2.1.01', arred(rec * e.impostoPct), 20],
      ]
      for (const [desc, parc, conta, valor, dia] of despesas) {
        const venc = dt(i, dia)
        const t = await ok('título pagar', api('POST', `${C}/titulos`, { empresaId: emp.id, tipo: 'PAGAR', descricao: `${desc} — ${comp(i)}`, parceiroNome: parc, valor, emissao: dt(i, Math.max(1, dia - 5)), vencimento: venc, contaContabilCodigo: conta, categoria: conta.startsWith('3.2') ? 'Tributos' : null, ...(venc < dHoje(-1) ? { pagoEm: venc, formaPagamento: 'TRANSFERENCIA' } : {}) }))
        if (t?.id) r.titulos++
      }
    }
  }

  // ---------------- títulos em aberto "da vida real" (cobrança e conciliação) ----------------
  const cl = criadas.clinica, tc = criadas.tech
  const aberto: Record<string, any> = {}
  const novo = async (chave: string, emp: any, body: any) => { const t = await ok(`título ${chave}`, api('POST', `${C}/titulos`, { empresaId: emp.id, ...body })); if (t?.id) { aberto[chave] = t; r.titulos++ } return t }
  if (cl) {
    await novo('cl_conv', cl, { tipo: 'RECEBER', descricao: 'Convênio OdontoVida — repasse de atendimentos', parceiroNome: 'OdontoVida Convênios', parceiroEmail: 'repasse@odontovida.example', parceiroTelefone: '11988887777', valor: 4320, emissao: dHoje(-20), vencimento: dHoje(-6), contaContabilCodigo: '3.1.2.01' })
    await novo('cl_orto', cl, { tipo: 'RECEBER', descricao: 'Parcelamento ortodontia — Carlos Mendes', parceiroNome: 'Carlos Mendes', parceiroEmail: 'carlos.mendes@example.com', parceiroTelefone: '11977776666', valor: 1850, emissao: dHoje(-10), vencimento: dHoje(2), contaContabilCodigo: '3.1.2.01' })
    await novo('cl_vencido20', cl, { tipo: 'RECEBER', descricao: 'Clareamento — Fernanda Rocha (2ª parcela)', parceiroNome: 'Fernanda Rocha', parceiroEmail: 'fernanda.rocha@example.com', parceiroTelefone: '11966665555', valor: 790, emissao: dHoje(-35), vencimento: dHoje(-20), contaContabilCodigo: '3.1.2.01' })
    await novo('cl_dental', cl, { tipo: 'PAGAR', descricao: 'Materiais — DentalMax Distribuidora', parceiroNome: 'DentalMax Distribuidora', valor: 2780.4, emissao: dHoje(-9), vencimento: dHoje(1), contaContabilCodigo: '4.1.2.01' })
  }
  if (tc) {
    await novo('tc_alfa', tc, { tipo: 'RECEBER', descricao: 'Contrato de manutenção — Grupo Alfa (nov)', parceiroNome: 'Grupo Alfa Holding', parceiroEmail: 'ap@grupoalfa.example', valor: 9600, emissao: dHoje(-12), vencimento: dHoje(-2), contaContabilCodigo: '3.1.2.01' })
    await novo('tc_aws', tc, { tipo: 'PAGAR', descricao: 'Infraestrutura em nuvem — AWS Brasil', parceiroNome: 'AWS Brasil Serviços', valor: 7850.2, emissao: dHoje(-5), vencimento: dHoje(3), contaContabilCodigo: '5.1.2.01' })
  }

  // ---------------- notas fiscais ----------------
  for (const e of emps) {
    const emp = criadas[e.chave]; if (!emp) continue
    const tipo = e.dados.atividade === 'COMERCIO' ? 'NFE' : 'NFSE'
    const ids = titulosPrincipais[e.chave] ?? []
    for (const off of [-3, -2, -1, 0]) {
      const tId = ids[off + 11]
      const t = tId ? await api('GET', `${C}/titulos/${tId}`) : null
      if (!t) continue
      const n = await ok('emitir nota', api('POST', `${C}/notas/emitir`, { empresaId: emp.id, tipo, parceiroNome: t.parceiroNome, parceiroDoc: cnpjComDv('555666770001'), descricao: t.descricao, emissao: t.emissao.slice(0, 10), itens: [{ descricao: t.descricao, quantidade: 1, valorUnitario: t.valor }] }))
      if (n?.id) { r.notas++; await api('POST', `${C}/notas/${n.id}/vincular-titulo`, { tituloId: tId }) }
    }
  }
  if (tc) {
    const n = await ok('emitir nota a cancelar', api('POST', `${C}/notas/emitir`, { empresaId: tc.id, tipo: 'NFSE', parceiroNome: 'Cliente Teste Ltda', descricao: 'Consultoria avulsa (emitida em duplicidade)', itens: [{ descricao: 'Consultoria avulsa', quantidade: 1, valorUnitario: 3500 }] }))
    if (n?.id) { r.notas++; await api('POST', `${C}/notas/${n.id}/cancelar`, { motivo: 'Emitida em duplicidade por engano do operador' }) }
  }
  if (criadas.mercado) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><NFe><infNFe Id="NFe41261077788899000199550010000123451000123457" versao="4.00"><ide><mod>55</mod><serie>1</serie><nNF>12345</nNF><dhEmi>${dHoje(-4)}T10:15:00-03:00</dhEmi></ide><emit><CNPJ>${cnpjComDv('123123120001')}</CNPJ><xNome>Distribuidora Atacado Sul Ltda</xNome></emit><dest><CNPJ>${criadas.mercado.documento}</CNPJ><xNome>Mercado Bom Preço Ltda</xNome></dest><det nItem="1"><prod><xProd>Arroz tipo 1 fardo 30kg</xProd><qCom>40</qCom><vUnCom>112.50</vUnCom><vProd>4500.00</vProd></prod></det><det nItem="2"><prod><xProd>Óleo de soja caixa 20un</xProd><qCom>20</qCom><vUnCom>138.00</vUnCom><vProd>2760.00</vProd></prod></det><total><ICMSTot><vProd>7260.00</vProd><vICMS>871.20</vICMS><vPIS>0.00</vPIS><vCOFINS>0.00</vCOFINS><vNF>7260.00</vNF></ICMSTot></total></infNFe></NFe></nfeProc>`
    const n = await ok('importar XML de entrada', api('POST', `${C}/notas/importar-xml`, { empresaId: criadas.mercado.id, xml, gerarTitulo: true, vencimento: dHoje(10) }))
    if (n?.id) { r.notas++; r.titulos++ }
  }
  if (cl) {
    await ok('nota de entrada manual', api('POST', `${C}/notas/entrada`, { empresaId: cl.id, tipo: 'NFSE', numero: 8841, parceiroNome: 'Contabilidade Parceira Ltda', parceiroDoc: cnpjComDv('321321320001'), descricao: 'Serviço de limpeza e higienização do consultório', valorTotal: 1200, emissao: dHoje(-7), impostos: { iss: 36 } })).then((n: any) => { if (n?.id) r.notas++ })
  }

  // ---------------- recibos ----------------
  if (cl) { const x = await ok('recibo 1', api('POST', `${C}/recibos`, { empresaId: cl.id, tipo: 'RECEBIMENTO', pessoaNome: 'Patrícia Lemos', referente: 'Tratamento de canal — dente 36', valor: 1480, formaPagamento: 'PIX', data: dHoje(-3) })); if (x?.id) r.recibos++ }
  if (criadas.mei) { const x = await ok('recibo 2', api('POST', `${C}/recibos`, { empresaId: criadas.mei.id, tipo: 'RECEBIMENTO', pessoaNome: 'Juliana Prado', referente: 'Pacote de coloração e escova', valor: 385.5, formaPagamento: 'DINHEIRO', data: dHoje(-1) })); if (x?.id) r.recibos++ }
  if (tc) { const x = await ok('recibo 3', api('POST', `${C}/recibos`, { empresaId: tc.id, tipo: 'PAGAMENTO', pessoaNome: 'Rafael Nunes (freelancer)', referente: 'Desenvolvimento do módulo de relatórios', valor: 4200, formaPagamento: 'TRANSFERENCIA', data: dHoje(-8) })); if (x?.id) r.recibos++ }

  // ---------------- guias: últimos 3 meses (SIMULADAS) ----------------
  for (const chave of ['clinica', 'tech', 'mercado', 'mei']) {
    const emp = criadas[chave]; if (!emp) continue
    for (const off of [-4, -3, -2, -1]) {
      const g = await ok(`gerar guias ${chave} ${comp(off)}`, api('POST', `${C}/guias/gerar`, { empresaId: emp.id, competencia: comp(off) }))
      for (const x of lst(g?.criadas)) {
        r.guias++
        // tudo que venceu há mais de 25 dias foi pago; o PIS do mercado de dois meses atrás fica ATRASADO de propósito
        const atrasoPropositado = chave === 'mercado' && off === -2 && x.tributo === 'PIS'
        if (x.vencimento.slice(0, 10) < dHoje(-5) && !atrasoPropositado) await api('POST', `${C}/guias/${x.id}/pagar`, { pagoEm: x.vencimento.slice(0, 10) })
      }
    }
  }

  // ---------------- conta bancária + extratos (OFX e CSV) para conciliar ----------------
  if (cl) {
    const cb = await ok('conta bancária clínica', fin('POST', `${C}/contas-bancarias`, { empresaId: cl.id, apelido: 'Banco Exemplo — CC principal', banco: '999', agencia: '0001', conta: '12345-6', saldoInicial: 15000 }))
    if (cb?.id) {
      const ofxData = (d: string) => d.replace(/-/g, '') + '120000[-3:BRT]'
      const trn = (id: string, d: string, v: number, memo: string) => `<STMTTRN><TRNTYPE>${v > 0 ? 'CREDIT' : 'DEBIT'}<DTPOSTED>${ofxData(d)}<TRNAMT>${v.toFixed(2)}<FITID>${id}<MEMO>${memo}</STMTTRN>`
      const ofx = `OFXHEADER:100\nDATA:OFXSGML\nVERSION:102\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>${[
        trn('SEED-CL-001', dHoje(-4), 4320, 'PIX RECEBIDO ODONTOVIDA CONVENIOS'), trn('SEED-CL-002', dHoje(-1), -2780.4, 'PAGTO BOLETO DENTALMAX DISTRIB'),
        trn('SEED-CL-003', dHoje(-1), 1850, 'PIX CARLOS MENDES'), trn('SEED-CL-004', dHoje(-2), -45.9, 'TARIFA MANUTENCAO CONTA'),
        trn('SEED-CL-005', dHoje(-2), 12.34, 'RENDIMENTO APLICACAO AUTOMATICA'), trn('SEED-CL-006', dHoje(-3), 980, 'DEPOSITO NAO IDENTIFICADO'),
      ].join('\n')}</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`
      const imp = await ok('importar OFX', fin('POST', `${C}/contas-bancarias/${cb.id}/importar`, { formato: 'OFX', conteudo: ofx }))
      r.extrato += imp?.importadas ?? 0
    }
  }
  if (tc) {
    const cb = await ok('conta bancária tech', fin('POST', `${C}/contas-bancarias`, { empresaId: tc.id, apelido: 'Banco Digital Exemplo — PJ', banco: '998', agencia: '0001', conta: '98765-4', saldoInicial: 42000 }))
    if (cb?.id) {
      const csv = `Data;Descrição;Valor\n${dHoje(-2).split('-').reverse().join('/')};TED RECEBIDA GRUPO ALFA HOLDING;${brn(9600)}\n${dHoje(-1).split('-').reverse().join('/')};PAGAMENTO AWS BRASIL SERVICOS;-${brn(7850.2)}\n${dHoje(-1).split('-').reverse().join('/')};TARIFA PACOTE SERVICOS;-${brn(89.9)}\n`
      const imp = await ok('importar CSV', fin('POST', `${C}/contas-bancarias/${cb.id}/importar`, { formato: 'CSV', conteudo: csv }))
      r.extrato += imp?.importadas ?? 0
    }
  }

  // ---------------- cobrança (régua simulada) ----------------
  if (cl) { const x = await ok('régua de cobrança', fin('POST', `${C}/cobranca/executar-regua`, { empresaId: cl.id })); r.cobrancas += x?.enviados ?? 0 }

  // ---------------- simulação de regime salva para cada empresa ----------------
  for (const e of Object.values(criadas)) await api('POST', `${C}/empresas/${e.id}/regime/simular`, {})
  return r
}
