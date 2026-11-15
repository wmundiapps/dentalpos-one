// Testes do módulo ESCRITÓRIO DE CONTABILIDADE (área contábil-fiscal): RBAC por papel, isolamento de tenant, validação,
// cálculos de regime e de guias com casos de teste conhecidos, notas/recibos, financeiro (títulos, baixa, régua, conciliação OFX/CSV),
// plano de contas/lançamentos/balancete/DRE, dashboard, auditoria e o seed (idempotente).
// Uso:  DATABASE_URL=postgresql://postgres:pg@127.0.0.1:5432/contabil_e2e npx tsx scripts/e2e/contabil-fiscal.ts
// Requer Postgres LOCAL com o schema aplicado (prisma db push). Não usa internet, bancos nem credenciais.
process.env.API_RATE_LIMIT_MAX = process.env.API_RATE_LIMIT_MAX || '1000000'
import jwt from 'jsonwebtoken'
import { setup, check, summary, fails, Actor } from './qa5-lib'
import { prisma } from '../../src/lib/prisma'
import { aliquotaEfetivaSimples, anexoDaAtividade, dasMeiMensal, irpjTrimestre, simularRegimes } from '../../src/modules/contabil/regime/calculo'
import { tabelasVigentes } from '../../src/modules/contabil/regime/tabelas'
import { classificarCnae } from '../../src/modules/contabil/regime/cnae'
import { carneLeao, codigosSimulados } from '../../src/modules/contabil/guias/calculo'
import { valorPorExtenso } from '../../src/modules/contabil/nucleo/extenso'
import { cnpjComDv, cnpjValido, cpfValido, anteciparDiaUtil, somaMeses } from '../../src/modules/contabil/nucleo/util'
import { lerCsv, lerOfx, parseValor, sugerir } from '../../src/modules/contabil/financeiro/conciliacao'
import { lerXmlNota } from '../../src/modules/contabil/notas/xml'
import { seedContabilFiscal } from '../seeds/contabil-fiscal'

const secao = (t: string) => console.log(`\n== ${t}`)
const C = '/edu/contabil'
const near = (a: number, b: number, tol = 0.011) => Math.abs(a - b) <= tol
const iso = (d: Date) => d.toISOString().slice(0, 10)
const hoje = new Date()
const dHoje = (n: number) => iso(new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate() + n, 12)))
let cn = 100000000000
const novoCnpj = () => cnpjComDv(String(++cn).padStart(12, '0').replace(/^0/, '1'))

async function main() {
  const S = await setup()
  const { call, t1, t2 } = S
  const admin = await t1.mk('ADMIN'), contador = await t1.mk('CONTADOR'), fin = await t1.mk('FINANCE'), coord = await t1.mk('COORDINATOR'), prof = await t1.mk('TEACHER'), aluno = await t1.mk('STUDENT', true), rector = await t1.mk('RECTOR')
  const adminB = await t2.mk('ADMIN'), finB = await t2.mk('FINANCE')
  const as = (a: Actor) => async (m: string, p: string, b?: any) => { const r = await call(a, m, p, b); return r.status < 400 ? r.json : null }
  const T = tabelasVigentes(new Date('2026-06-01'))

  try {
    // ================================================================== cálculos puros (casos conhecidos)
    secao('Cálculos: MEI, Simples, Presumido, carnê-leão, documentos')
    check('CNPJ válido (DV) / inválido', cnpjValido('11.222.333/0001-81') && !cnpjValido('11.222.333/0001-82') && !cnpjValido('11111111111111'))
    check('CPF válido / inválido', cpfValido('529.982.247-25') && !cpfValido('529.982.247-26') && !cpfValido('111.111.111-11'))
    const dm = dasMeiMensal('COMERCIO', T), ds = dasMeiMensal('SERVICOS', T)
    check('DAS-MEI comércio = 5% do salário mínimo + R$ 1 (ICMS)', near(dm.total, T.salarioMinimo * 0.05 + 1), dm)
    check('DAS-MEI serviços = 5% do salário mínimo + R$ 5 (ISS)', near(ds.total, T.salarioMinimo * 0.05 + 5), ds)
    check('Simples Anexo III 1ª faixa: alíquota efetiva 6% (RBT12 150 mil)', near(aliquotaEfetivaSimples('III', 150_000, T).efetivaPct, 6, 1e-6))
    check('Simples Anexo III RBT12 360 mil: (360000×11,2% − 9.360)/360000 = 8,6%', near(aliquotaEfetivaSimples('III', 360_000, T).efetivaPct, 8.6, 1e-6), aliquotaEfetivaSimples('III', 360_000, T))
    check('Simples Anexo I RBT12 720 mil: 7,575%', near(aliquotaEfetivaSimples('I', 720_000, T).efetivaPct, 7.575, 1e-6))
    check('Simples Anexo V RBT12 1 mi (4ª faixa): 18,79%', near(aliquotaEfetivaSimples('V', 1_000_000, T).efetivaPct, 18.79, 1e-6))
    check('Simples Anexo II RBT12 4,8 mi (6ª faixa): 15%', near(aliquotaEfetivaSimples('II', 4_800_000, T).efetivaPct, (4_800_000 * 0.3 - 720_000) / 4_800_000 * 100, 1e-6))
    check('fator R 28% => Anexo III; 25% => Anexo V', anexoDaAtividade('SERVICOS_FATOR_R', 28, T) === 'III' && anexoDaAtividade('SERVICOS_FATOR_R', 25, T) === 'V' && anexoDaAtividade('COMERCIO', null, T) === 'I')
    const ir = irpjTrimestre(96_000, T.presumido)
    check('Presumido: base 96 mil => IRPJ 14.400 + adicional 3.600', near(ir.normal, 14_400) && near(ir.adicional, 3_600), ir)
    check('carnê-leão: base 6.000 => 574,25 (tabela + redutor)', near(carneLeao(6000, T).imposto, 574.25, 0.02), carneLeao(6000, T))
    check('carnê-leão: base 8.000 => 1.304,00 (sem redutor)', near(carneLeao(8000, T).imposto, 1304, 0.02) && carneLeao(4000, T).imposto === 0)
    check('CNAE 8630504 => serviços; 6201501 => fator R; 4712100 => comércio; 6911701 => anexo IV', classificarCnae('8630504').atividade === 'SERVICOS' && classificarCnae('6201501').atividade === 'SERVICOS_FATOR_R' && classificarCnae('4712100').atividade === 'COMERCIO' && classificarCnae('6911701').atividade === 'SERVICOS_ANEXO_IV' && classificarCnae('').padrao)
    check('valor por extenso', valorPorExtenso(1) === 'um real' && valorPorExtenso(1234.56) === 'mil duzentos e trinta e quatro reais e cinquenta e seis centavos' && valorPorExtenso(2000) === 'dois mil reais' && valorPorExtenso(100) === 'cem reais' && valorPorExtenso(0.01) === 'um centavo' && valorPorExtenso(1_000_000) === 'um milhão de reais', [valorPorExtenso(1234.56), valorPorExtenso(1_000_000)])
    check('dia útil: sábado/domingo antecipam para sexta', iso(anteciparDiaUtil(new Date('2026-01-25T12:00:00Z'))) === '2026-01-23' && iso(anteciparDiaUtil(new Date('2026-01-24T12:00:00Z'))) === '2026-01-23')
    const cs = codigosSimulados('x'), cs2 = codigosSimulados('x')
    check('código de barras simulado: determinístico, não começa com 8, linha rotulada SIMULAÇÃO, 44 dígitos', cs.codigoBarras === cs2.codigoBarras && !cs.codigoBarras.startsWith('8') && /^\d{44}$/.test(cs.codigoBarras) && cs.linhaDigitavel.startsWith('SIMULAÇÃO'))

    const mk = (n: number, receita: number, despesas: number, folha = 0, compras = 0) => Array.from({ length: n }, (_, i) => ({ competencia: somaMeses('2025-01', i), receita, despesas, folha, compras }))
    const mei = simularRegimes({ atividade: 'SERVICOS', regimeAtual: 'SIMPLES', meses: mk(12, 5000, 1000) }, T)
    check('regime: faturamento 60 mil/ano => MEI recomendado e mais barato', mei.recomendado === 'MEI' && mei.regimes.find((r) => r.regime === 'MEI')!.totalAnual < mei.regimes.find((r) => r.regime === 'SIMPLES')!.totalAnual, mei.regimes.map((r) => [r.regime, r.totalAnual]))
    check('regime MEI: total anual = DAS fixo × 12', near(mei.regimes[0].totalAnual, ds.total * 12))
    check('regime: Simples Anexo III 60 mil => 6% = 3.600', near(mei.regimes.find((r) => r.regime === 'SIMPLES')!.totalAnual, 3600))
    const acima = simularRegimes({ atividade: 'SERVICOS', regimeAtual: 'MEI', meses: mk(12, 7000, 2000) }, T)
    check('regime: 84 mil/ano => MEI inelegível + alerta crítico; recomenda outro regime e calcula a economia', !acima.regimes[0].elegivel && acima.alertas.some((a) => a.nivel === 'critico' && /MEI/.test(a.texto)) && acima.recomendado !== 'MEI' && typeof acima.economiaVsAtual === 'number', acima.alertas)
    const perto = simularRegimes({ atividade: 'SERVICOS', regimeAtual: 'MEI', meses: mk(12, 6500, 1500) }, T)
    check('regime: 78 mil/ano => alerta de atenção (96% do limite)', perto.alertas.some((a) => a.nivel === 'atencao' && /MEI/.test(a.texto)), perto.alertas)
    const grande = simularRegimes({ atividade: 'SERVICOS', regimeAtual: 'SIMPLES', meses: mk(12, 450_000, 300_000, 60_000) }, T)
    check('regime: 5,4 mi/ano => Simples inelegível; Presumido e Real calculados; alerta crítico', !grande.regimes.find((r) => r.regime === 'SIMPLES')!.elegivel && grande.recomendado && ['PRESUMIDO', 'REAL'].includes(grande.recomendado) && grande.alertas.some((a) => a.nivel === 'critico' && /Simples/.test(a.texto)))
    const fr = simularRegimes({ atividade: 'SERVICOS_FATOR_R', regimeAtual: 'SIMPLES', meses: mk(12, 50_000, 30_000, 14_000) }, T)
    const sfr = fr.regimes.find((r) => r.regime === 'SIMPLES')!
    check('fator R 28% (14/50 mil) => Anexo III; memória cita o fator R', sfr.anexo === 'III' && sfr.memoria.some((m) => /Fator R/.test(m)) && near(fr.resumo.fatorRPct ?? 0, 28), sfr)
    const fr2 = simularRegimes({ atividade: 'SERVICOS_FATOR_R', regimeAtual: 'SIMPLES', meses: mk(12, 50_000, 30_000, 12_000) }, T)
    check('fator R 24% => Anexo V (mais caro que III) + alerta informativo sobre o fator R', fr2.regimes.find((r) => r.regime === 'SIMPLES')!.anexo === 'V' && fr2.alertas.some((a) => /Fator R/.test(a.texto)), fr2.alertas)
    const pres = simularRegimes({ atividade: 'SERVICOS', regimeAtual: 'PRESUMIDO', issAliquotaPct: 3, meses: mk(12, 100_000, 40_000, 0) }, T).regimes.find((r) => r.regime === 'PRESUMIDO')!
    // 1,2 mi/ano: base 32% por trimestre = 96.000; IRPJ 14.400 + adic 3.600; CSLL 8.640; PIS 0,65%; COFINS 3%; ISS 3%
    const esperadoPres = 4 * (14_400 + 3_600 + 8_640) + 1_200_000 * 0.0065 + 1_200_000 * 0.03 + 1_200_000 * 0.03
    check('Presumido serviços 100 mil/mês: total anual = 4×(IRPJ+adicional+CSLL) + PIS + COFINS + ISS', near(pres.totalAnual, esperadoPres, 0.05), { got: pres.totalAnual, esperadoPres })
    check('toda regra tem memória de cálculo e a soma dos tributos fecha com o total', grande.regimes.every((r) => r.memoria.length > 0 && near(r.tributos.reduce((a, t) => a + t.valor, 0), r.totalAnual, 0.05)))
    const mi = simularRegimes({ atividade: 'SERVICOS', regimeAtual: 'SIMPLES', meses: mk(6, 10_000, 4_000) }, T)
    check('histórico de 6 meses => anualizado com alerta', mi.resumo.anualizado && mi.alertas.some((a) => /anualizad/i.test(a.texto)) && near(mi.resumo.receitaAnual, 120_000))
    check('ressalvas: estimativa + conferir tabelas, e a versão das tabelas informada', mi.ressalvas.some((x) => /ESTIMATIVA/.test(x)) && mi.ressalvas.some((x) => /conferidos/.test(x)) && /conferir|REFERÊNCIA/i.test(mi.situacaoTabelas) && !!mi.versaoTabelas)
    const vazio = simularRegimes({ atividade: 'SERVICOS', regimeAtual: 'SIMPLES', meses: [] }, T)
    check('sem histórico => sem recomendação e alerta crítico', vazio.recomendado === null && vazio.alertas.some((a) => a.nivel === 'critico'))

    secao('Parsers: OFX, CSV, valores BR, XML')
    check('parseValor BR/US/negativos', parseValor('1.234,56') === 1234.56 && parseValor('-12,30') === -12.3 && parseValor('1234.56') === 1234.56 && parseValor('(45,90)') === -45.9 && parseValor('abc') === null && parseValor('R$ 2.000,00') === 2000)
    const ofx = lerOfx(`<OFX><STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260115120000[-3:BRT]<TRNAMT>1500.00<FITID>A1<MEMO>PIX JOAO</STMTTRN><STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260116<TRNAMT>-45.90<FITID>A2<NAME>TARIFA</STMTTRN><STMTTRN><DTPOSTED>2026XXXX<TRNAMT>1<FITID>A3</STMTTRN></OFX>`)
    check('OFX: 2 linhas válidas (data com fuso), 1 inválida', ofx.linhas.length === 2 && ofx.invalidas === 1 && iso(ofx.linhas[0].data) === '2026-01-15' && ofx.linhas[1].valor === -45.9 && ofx.linhas[0].fitid === 'A1', ofx)
    const csv = lerCsv('Data;Descrição;Valor\n15/01/2026;PIX MARIA;1.000,00\n16/01/2026;TARIFA;-45,90\n32/13/2026;ERRO;5,00\n')
    check('CSV BR (;): 2 linhas, 1 inválida', csv.linhas.length === 2 && csv.invalidas === 1 && csv.linhas[0].valor === 1000 && iso(csv.linhas[1].data) === '2026-01-16', csv)
    const sg = sugerir({ data: new Date('2026-01-15T12:00:00Z'), descricao: 'PIX RECEBIDO ODONTOVIDA CONVENIOS', valor: 4320 }, [
      { id: 'a', tipo: 'RECEBER', valor: 4320, vencimento: new Date('2026-01-13T12:00:00Z'), descricao: 'Convênio OdontoVida', parceiroNome: 'OdontoVida Convênios' },
      { id: 'b', tipo: 'RECEBER', valor: 4320, vencimento: new Date('2025-11-01T12:00:00Z'), descricao: 'Outro', parceiroNome: 'Fulano' },
      { id: 'c', tipo: 'PAGAR', valor: 4320, vencimento: new Date('2026-01-15T12:00:00Z'), descricao: 'Pagar', parceiroNome: 'X' },
    ])
    check('sugestão: valor+data+nome => título certo no topo (≥90) e título PAGAR não é sugerido para entrada', sg[0]?.tituloId === 'a' && sg[0].score >= 90 && !sg.some((s) => s.tituloId === 'c'), sg)
    const xmlNfe = (cnpjEmit: string, cnpjDest: string, extra = '') => `<?xml version="1.0"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><NFe><infNFe Id="NFe35261011122233000181550010000000011000000019" versao="4.00"><ide><mod>55</mod><serie>1</serie><nNF>1</nNF><dhEmi>2026-01-10T10:00:00-03:00</dhEmi></ide><emit><CNPJ>${cnpjEmit}</CNPJ><xNome>Fornecedor &amp; Cia</xNome></emit><dest><CNPJ>${cnpjDest}</CNPJ><xNome>Destino</xNome></dest><det nItem="1"><prod><xProd>Item A</xProd><qCom>2</qCom><vUnCom>50.00</vUnCom><vProd>100.00</vProd></prod></det><total><ICMSTot><vProd>100.00</vProd><vICMS>12.00</vICMS><vNF>100.00</vNF></ICMSTot></total></infNFe></NFe>${extra}</nfeProc>`
    const lido = lerXmlNota(xmlNfe('11222333000181', '55566677000199'))
    check('XML NF-e: número, chave, valores, itens e nome com entidade decodificada', lido.numero === 1 && lido.chaveAcesso === '35261011122233000181550010000000011000000019' && lido.valorTotal === 100 && lido.itens.length === 1 && lido.emitenteNome === 'Fornecedor & Cia' && lido.impostos.icms === 12, lido)
    let rejeitou = false; try { lerXmlNota('<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "b">]><nfeProc/>') } catch { rejeitou = true }
    check('XML com DTD/entidade é rejeitado (segurança)', rejeitou)

    // ================================================================== RBAC e isolamento
    secao('RBAC: papéis e isolamento de tenant')
    check('sem token => 401', (await call(null, 'GET', `${C}/eu`)).status === 401)
    for (const [nome, a] of [['aluno', aluno], ['professor', prof], ['coordenação (sem papel)', coord]] as const) check(`${nome}: 403 no módulo`, (await call(a, 'GET', `${C}/eu`)).status === 403 && (await call(a, 'GET', `${C}/empresas`)).status === 403)
    const eu = (a: Actor) => call(a, 'GET', `${C}/eu`).then((r) => r.json)
    check('admin => GESTOR; reitor => GESTOR; contador => CONTADOR; financeiro => FINANCEIRO', (await eu(admin)).papel === 'GESTOR' && (await eu(rector)).papel === 'GESTOR' && (await eu(contador)).papel === 'CONTADOR' && (await eu(fin)).papel === 'FINANCEIRO')
    const euA = await eu(admin)
    check('/eu devolve aviso legal, instituição e sinaliza simulação', /não substitui um contador/.test(euA.aviso) && euA.simulacao === true && !!euA.instituicao)
    check('apenas gestão define papéis (contador 403, financeiro 403)', (await call(contador, 'PUT', `${C}/membros/${coord.id}`, { papel: 'LEITOR' })).status === 403 && (await call(fin, 'GET', `${C}/membros`)).status === 403)
    check('papel para usuário de outro tenant => 404', (await call(admin, 'PUT', `${C}/membros/${adminB.id}`, { papel: 'LEITOR' })).status === 404)
    check('papel inválido => 400', (await call(admin, 'PUT', `${C}/membros/${coord.id}`, { papel: 'SUPERMAN' })).status === 400)
    check('gestor designa coordenação como LEITOR', (await call(admin, 'PUT', `${C}/membros/${coord.id}`, { papel: 'LEITOR' })).status === 200 && (await eu(coord)).papel === 'LEITOR')
    check('aluno nunca ganha acesso (mesmo com designação)', (await call(admin, 'PUT', `${C}/membros/${aluno.id}`, { papel: 'GESTOR' })).status === 200 && (await call(aluno, 'GET', `${C}/eu`)).status === 403)
    check('leitor lê mas não grava', (await call(coord, 'GET', `${C}/empresas`)).status === 200 && (await call(coord, 'POST', `${C}/empresas`, {})).status === 403 && (await call(coord, 'POST', `${C}/titulos`, {})).status === 403)
    check('financeiro não cria empresa, não gera guia, não lança manualmente, não simula regime, não vê auditoria', (await call(fin, 'POST', `${C}/empresas`, {})).status === 403 && (await call(fin, 'POST', `${C}/guias/gerar`, {})).status === 403 && (await call(fin, 'POST', `${C}/lancamentos`, {})).status === 403 && (await call(fin, 'POST', `${C}/regime/simular-avulso`, {})).status === 403 && (await call(fin, 'GET', `${C}/auditoria`)).status === 403)
    check('/membros lista nomes (gestão)', (await call(admin, 'GET', `${C}/membros`)).json.items.some((m: any) => m.userId === coord.id && m.papel === 'LEITOR'))

    // ================================================================== empresas
    secao('Empresas (multi-empresa, validação, tenant)')
    const base = { tipoPessoa: 'PJ', razaoSocial: 'Empresa Teste Alfa Ltda', regimeAtual: 'SIMPLES', cnae: '6201501', uf: 'SP', municipio: 'São Paulo', issAliquota: 3 }
    const docA = novoCnpj()
    check('CNPJ inválido => 400', (await call(admin, 'POST', `${C}/empresas`, { ...base, documento: '11222333000182' })).status === 400)
    check('CPF informado como PJ => 400', (await call(admin, 'POST', `${C}/empresas`, { ...base, documento: '52998224725' })).status === 400)
    check('UF inválida => 400; razão social curta => 400', (await call(admin, 'POST', `${C}/empresas`, { ...base, documento: docA, uf: 'XX' })).status === 400 && (await call(admin, 'POST', `${C}/empresas`, { ...base, documento: docA, razaoSocial: 'A' })).status === 400)
    const eA = await call(contador, 'POST', `${C}/empresas`, { ...base, documento: docA })
    check('contador cria empresa (atividade sugerida por CNAE; plano de contas criado)', eA.status === 201 && eA.json.atividade === 'SERVICOS_FATOR_R' && eA.json.atividadeSugerida.atividade === 'SERVICOS_FATOR_R' && (await prisma.ctbPlanoConta.count({ where: { empresaId: eA.json.id } })) > 40, eA.json)
    check('documento duplicado no tenant => 409', (await call(admin, 'POST', `${C}/empresas`, { ...base, documento: docA })).status === 409)
    check('mesmo CNPJ em OUTRO tenant é permitido', (await call(adminB, 'POST', `${C}/empresas`, { ...base, documento: docA })).status === 201)
    const idA = eA.json.id
    check('tenant B não enxerga a empresa de A (404) e lista só as suas', (await call(adminB, 'GET', `${C}/empresas/${idA}`)).status === 404 && (await call(adminB, 'GET', `${C}/empresas`)).json.items.every((e: any) => e.tenantId === t2.tenantId))
    check('tenant B não altera nem simula empresa de A', (await call(adminB, 'PATCH', `${C}/empresas/${idA}`, { razaoSocial: 'Hack' })).status === 404 && (await call(adminB, 'POST', `${C}/empresas/${idA}/regime/simular`, {})).status === 404)
    check('PATCH parcial preserva campos e valida', (await call(admin, 'PATCH', `${C}/empresas/${idA}`, { municipio: 'Campinas' })).json.razaoSocial === base.razaoSocial && (await call(admin, 'PATCH', `${C}/empresas/${idA}`, { regimeAtual: 'LUCRO' })).status === 400)
    check('busca por nome e documento', (await call(admin, 'GET', `${C}/empresas?q=Alfa`)).json.total >= 1 && (await call(admin, 'GET', `${C}/empresas?q=${docA}`)).json.total === 1)
    const ent = await call(admin, 'GET', `${C}/entidades-externas`)
    check('entidades do sistema hospedeiro (adapter) listadas', ent.status === 200 && ent.json.suportado === true && ent.json.sistema === 'EduMaster Pro')

    // ================================================================== regime via API
    secao('Regime fiscal via API')
    const histRef = async (id: string, receita: number, despesas: number, folha = 0, compras = 0, irrf = 0) => { for (let i = 0; i < 12; i++) await call(admin, 'PUT', `${C}/empresas/${id}/historico/${somaMeses('2025-01', i)}`, { receitaBruta: receita, despesas, folha, comprasInsumos: compras, irrfRetido: irrf }) }
    await histRef(idA, 50_000, 20_000, 8_000)
    check('histórico: competência inválida 400, valor negativo 400, financeiro não grava', (await call(admin, 'PUT', `${C}/empresas/${idA}/historico/2025-13`, { receitaBruta: 1, despesas: 1 })).status === 400 && (await call(admin, 'PUT', `${C}/empresas/${idA}/historico/2025-01`, { receitaBruta: -1, despesas: 1 })).status === 400 && (await call(fin, 'PUT', `${C}/empresas/${idA}/historico/2025-01`, { receitaBruta: 1, despesas: 1 })).status === 403)
    const h = await call(fin, 'GET', `${C}/empresas/${idA}/historico?ate=2025-12`)
    check('financeiro lê histórico (12 meses, fonte MANUAL)', h.status === 200 && h.json.meses.length === 12 && h.json.meses.every((m: any) => m.fonte === 'MANUAL' && m.receitaBruta === 50000))
    const sim = await call(contador, 'POST', `${C}/empresas/${idA}/regime/simular`, { ate: '2025-12', issAliquota: 3 })
    const simMin = sim.json.regimes.filter((r: any) => r.elegivel).reduce((a: any, b: any) => (b.totalAnual < a.totalAnual ? b : a))
    check('simulação da empresa: 600 mil/ano, 4 regimes, recomendação = menor carga elegível, versão das tabelas e ressalva', sim.status === 200 && sim.json.regimes.length === 4 && sim.json.recomendado === simMin.regime && !!sim.json.versaoTabelas && sim.json.ressalvas.length >= 2 && sim.json.simulacao === true && near(sim.json.resumo.receitaAnual, 600_000), { rec: sim.json.recomendado, tot: sim.json.regimes.map((r: any) => [r.regime, r.totalAnual]) })
    check('simulação salva e listada', (await call(fin, 'GET', `${C}/empresas/${idA}/regime/simulacoes`)).json.items.length >= 1)
    const what = await call(contador, 'POST', `${C}/empresas/${idA}/regime/simular`, { salvar: false, meses: Array.from({ length: 12 }, (_, i) => ({ competencia: somaMeses('2025-01', i), receita: 5000, despesas: 1000 })) })
    check('"e se" com meses próprios (sem salvar): MEI recomendado', what.status === 200 && what.json.id === null && what.json.recomendado === 'MEI')
    check('simulador avulso para propostas', (await call(contador, 'POST', `${C}/regime/simular-avulso`, { atividade: 'COMERCIO', regimeAtual: 'SIMPLES', meses: Array.from({ length: 12 }, () => ({ competencia: 'x', receita: 100_000, despesas: 70_000, compras: 60_000 })) })).json.regimes.length === 4 && (await call(contador, 'POST', `${C}/regime/simular-avulso`, { atividade: 'ALIEN', meses: [] })).status === 400)
    check('parâmetros fiscais: tabela vigente, versões e aviso de conferência', (await call(fin, 'GET', `${C}/parametros-fiscais`)).json.aviso.includes('REFERÊNCIA'))
    check('aplicar regime exige motivo e gera auditoria', (await call(contador, 'POST', `${C}/empresas/${idA}/regime/aplicar`, { regime: 'PRESUMIDO', motivo: 'curto' })).status === 400 && (await call(contador, 'POST', `${C}/empresas/${idA}/regime/aplicar`, { regime: 'PRESUMIDO', motivo: 'Simulação indicou menor carga no presumido' })).status === 200 && (await prisma.ctbAuditoria.count({ where: { tenantId: t1.tenantId, acao: 'regime.alterar' } })) === 1)

    // ================================================================== guias
    secao('Guias SIMULADAS (cálculo, vencimento, idempotência, pagamento)')
    // empresa A agora é PRESUMIDO, serviços (fator R => serviço), ISS 3%, histórico 2025 (50 mil/mês, folha 8 mil)
    check('competência inválida/futura => 400; financeiro não gera', (await call(contador, 'POST', `${C}/guias/gerar`, { empresaId: idA, competencia: '2025-13' })).status === 400 && (await call(contador, 'POST', `${C}/guias/gerar`, { empresaId: idA, competencia: '2099-01' })).status === 400 && (await call(fin, 'POST', `${C}/guias/gerar`, { empresaId: idA, competencia: '2025-12' })).status === 403)
    const g12 = await call(contador, 'POST', `${C}/guias/gerar`, { empresaId: idA, competencia: '2025-12' })
    const gp = (tr: string) => g12.json.criadas.find((g: any) => g.tributo === tr)
    check('Presumido 2025-12: PIS 0,65% = 325 e COFINS 3% = 1.500 (competência mensal)', g12.status === 201 && near(gp('PIS')?.valorPrincipal, 325) && near(gp('COFINS')?.valorPrincipal, 1500) && gp('PIS').codigoReceita === '8109', g12.json.criadas?.map((g: any) => [g.tributo, g.valorPrincipal]))
    check('ISS 3% = 1.500 (empresa de serviços)', near(gp('ISS')?.valorPrincipal, 1500))
    check('IRPJ trimestral (4º tri): base 32% de 150 mil = 48 mil => 7.200, sem adicional; CSLL 9% = 4.320', near(gp('IRPJ')?.valorPrincipal, 7200) && near(gp('CSLL')?.valorPrincipal, 4320) && gp('IRPJ').periodicidade === 'TRIMESTRAL', [gp('IRPJ'), gp('CSLL')])
    check('INSS/GPS (35,8% de 8 mil = 2.864) e FGTS (8% = 640)', near(gp('INSS')?.valorPrincipal, 2864) && near(gp('FGTS')?.valorPrincipal, 640))
    check('guias: código de barras fictício, linha rotulada SIMULAÇÃO, memória, versão das tabelas, marcadas como simulação', g12.json.criadas.every((g: any) => g.simulacao === true && g.linhaDigitavel.startsWith('SIMULAÇÃO') && !g.codigoBarras.startsWith('8') && g.memoria.passos.length > 0 && !!g.versaoTabelas) && /SIMULADAS/.test(g12.json.aviso))
    check('vencimentos em dia útil: PIS/COFINS até dia 25 (antecipado); IRPJ no último dia útil de janeiro', iso(new Date(gp('PIS').vencimento)) === '2026-01-23' && iso(new Date(gp('IRPJ').vencimento)) === '2026-01-30', [gp('PIS').vencimento, gp('IRPJ').vencimento])
    const g11 = await call(contador, 'POST', `${C}/guias/gerar`, { empresaId: idA, competencia: '2025-11' })
    check('mês que não fecha trimestre não tem IRPJ/CSLL', !g11.json.criadas.some((g: any) => ['IRPJ', 'CSLL'].includes(g.tributo)) && g11.json.criadas.some((g: any) => g.tributo === 'PIS'))
    check('guia de competência passada já nasce com multa/juros estimados', gp('PIS').multa > 0 && gp('PIS').juros > 0 && near(gp('PIS').valorTotal, gp('PIS').valorPrincipal + gp('PIS').multa + gp('PIS').juros))
    const g12b = await call(contador, 'POST', `${C}/guias/gerar`, { empresaId: idA, competencia: '2025-12' })
    check('gerar de novo é idempotente (nada criado, tudo mantido)', g12b.json.criadas.length === 0 && g12b.json.mantidas.length === g12.json.criadas.length)
    await call(admin, 'PUT', `${C}/empresas/${idA}/historico/2025-12`, { receitaBruta: 60_000, despesas: 20_000, folha: 8_000 })
    const g12c = await call(contador, 'POST', `${C}/guias/gerar`, { empresaId: idA, competencia: '2025-12', recalcular: true })
    check('recalcular atualiza guias pendentes com o novo histórico (PIS 60 mil × 0,65% = 390)', g12c.json.atualizadas.length >= 5 && near(g12c.json.atualizadas.find((g: any) => g.tributo === 'PIS').valorPrincipal, 390))
    const gPago = g12c.json.atualizadas.find((g: any) => g.tributo === 'COFINS')
    check('financeiro paga guia (PAGA com valor pago), 2º pagamento 409', (await call(fin, 'POST', `${C}/guias/${gPago.id}/pagar`, { pagoEm: '2026-01-20' })).json.status === 'PAGA' && (await call(fin, 'POST', `${C}/guias/${gPago.id}/pagar`, {})).status === 409)
    check('guia paga não é cancelada; pendente exige motivo e financeiro não cancela', (await call(contador, 'POST', `${C}/guias/${gPago.id}/cancelar`, { motivo: 'motivo bem longo aqui' })).status === 409 && (await call(contador, 'POST', `${C}/guias/${gp('PIS').id}/cancelar`, { motivo: 'x' })).status === 400 && (await call(fin, 'POST', `${C}/guias/${gp('PIS').id}/cancelar`, { motivo: 'motivo bem longo aqui' })).status === 403)
    check('recalcular não mexe em guia paga', (await call(contador, 'POST', `${C}/guias/gerar`, { empresaId: idA, competencia: '2025-12', recalcular: true })).json.mantidas.some((g: any) => g.id === gPago.id))
    check('tenant B não vê guias nem gera para empresa de A', (await call(adminB, 'GET', `${C}/guias/${gp('PIS').id}`)).status === 404 && (await call(adminB, 'POST', `${C}/guias/gerar`, { empresaId: idA, competencia: '2025-12' })).status === 404 && (await call(adminB, 'POST', `${C}/guias/${gp('PIS').id}/pagar`, {})).status === 404)
    const htmlG = await call(fin, 'GET', `${C}/guias/${gp('PIS').id}/imprimir`)
    check('guia imprimível: marca SIMULAÇÃO, aviso legal e memória', htmlG.status === 200 && /SIMULAÇÃO/.test(htmlG.text) && /não substitui um contador/.test(htmlG.text) && /Memória de cálculo/.test(htmlG.text))
    check('relatório de guias (html e json) com aviso', (await call(fin, 'GET', `${C}/guias-relatorio?empresaId=${idA}&competencia=2025-12`)).text.includes('Relatório de guias') && (await call(fin, 'GET', `${C}/guias-relatorio?empresaId=${idA}&formato=json`)).json.total >= 6 && (await call(fin, 'GET', `${C}/guias-relatorio?competencia=xx`)).status === 400)
    check('lista de guias filtra por situação (ATRASADA), tributo e competência', (await call(fin, 'GET', `${C}/guias?status=ATRASADA&empresaId=${idA}`)).json.items.every((g: any) => g.situacao === 'ATRASADA') && (await call(fin, 'GET', `${C}/guias?tributo=PIS&competencia=2025-12&empresaId=${idA}`)).json.total === 1)
    // Simples e MEI e PF
    const docS = novoCnpj()
    const eS = (await call(admin, 'POST', `${C}/empresas`, { ...base, documento: docS, razaoSocial: 'Simples Serviços Ltda', cnae: '8630504', atividade: 'SERVICOS' })).json
    await histRef(eS.id, 50_000, 20_000, 0)
    const gs = await call(contador, 'POST', `${C}/guias/gerar`, { empresaId: eS.id, competencia: '2025-12' })
    check('Simples Anexo III, RBT12 proporcionalizada 600 mil => alíquota efetiva 10,56% => DAS 5.280', near(gs.json.criadas.find((g: any) => g.tributo === 'DAS')?.valorPrincipal, 5280, 0.05) && gs.json.criadas.length === 1, gs.json.criadas.map((g: any) => [g.tributo, g.valorPrincipal]))
    const docM = novoCnpj()
    const eM = (await call(admin, 'POST', `${C}/empresas`, { ...base, documento: docM, razaoSocial: 'Micro MEI', regimeAtual: 'MEI', cnae: '9602501' })).json
    const gm = await call(contador, 'POST', `${C}/guias/gerar`, { empresaId: eM.id, competencia: '2025-12' })
    check('DAS-MEI fixo mesmo sem receita no mês', gm.json.criadas.length === 1 && gm.json.criadas[0].tributo === 'DAS_MEI' && near(gm.json.criadas[0].valorPrincipal, ds.total))
    const eP = (await call(admin, 'POST', `${C}/empresas`, { tipoPessoa: 'PF', documento: '52998224725', razaoSocial: 'Autônomo Pessoa Física', regimeAtual: 'SIMPLES' })).json
    await call(admin, 'PUT', `${C}/empresas/${eP.id}/historico/2025-12`, { receitaBruta: 9000, despesas: 1000 })
    const gpf = await call(contador, 'POST', `${C}/guias/gerar`, { empresaId: eP.id, competencia: '2025-12' })
    check('PF: carnê-leão sobre base 8.000 (receita − livro-caixa) = 1.304', gpf.json.criadas.length === 1 && gpf.json.criadas[0].tributo === 'IRPF_CARNE_LEAO' && near(gpf.json.criadas[0].valorPrincipal, 1304, 0.05) && gpf.json.criadas[0].codigoReceita === '0190', gpf.json.criadas)
    const cal = await call(fin, 'GET', `${C}/calendario?de=2026-01-01&ate=2026-02-28&empresaId=${idA}`)
    check('calendário: itens por vencimento, status (PAGA/ATRASADA/...) e aviso; resumo', cal.status === 200 && cal.json.items.length >= 5 && cal.json.items.some((i: any) => i.status === 'PAGA') && cal.json.items.every((i: any) => i.aviso && i.vencimento) && cal.json.resumo.atrasadas >= 1 && cal.json.simulacao === true, cal.json.resumo)
    check('calendário: intervalo > 400 dias => 400; tenant B não vê empresa de A', (await call(fin, 'GET', `${C}/calendario?de=2020-01-01&ate=2026-01-01`)).status === 400 && (await call(adminB, 'GET', `${C}/calendario?empresaId=${idA}&de=2026-01-01&ate=2026-02-28`)).json.items.length === 0)

    // ================================================================== notas e recibos
    secao('Notas fiscais e recibos (SIMULADOS)')
    const empN = (await call(admin, 'POST', `${C}/empresas`, { ...base, documento: novoCnpj(), razaoSocial: 'Notas e Cia Ltda', regimeAtual: 'SIMPLES', cnae: '6201501' })).json
    const emitir = (a: Actor, extra: any = {}) => call(a, 'POST', `${C}/notas/emitir`, { empresaId: empN.id, tipo: 'NFSE', parceiroNome: 'Cliente Um', parceiroDoc: novoCnpj(), itens: [{ descricao: 'Consultoria', quantidade: 2, valorUnitario: 500 }], ...extra })
    check('financeiro emite nota (permitido); aluno não', (await emitir(fin)).status === 201 && (await emitir(aluno)).status === 403)
    check('validações: sem itens 400, valor zero 400, documento do cliente inválido 400, vencimento obrigatório com título', (await emitir(admin, { itens: [] })).status === 400 && (await emitir(admin, { itens: [{ descricao: 'x', quantidade: 1, valorUnitario: 0 }] })).status === 400 && (await emitir(admin, { parceiroDoc: '123' })).status === 400 && (await emitir(admin, { gerarTitulo: true })).status === 400)
    const n2 = await emitir(contador, { gerarTitulo: true, vencimento: dHoje(15) })
    check('numeração sequencial por empresa/tipo/série (2ª nota = nº 2), valor 1.000, simulação, protocolo SIM', n2.json.numero === 2 && n2.json.valorTotal === 1000 && n2.json.simulacao === true && n2.json.protocolo.startsWith('SIM') && n2.json.provedor === 'SIMULADO' && !!n2.json.codigoVerificacao, n2.json)
    const nfe = await call(contador, 'POST', `${C}/notas/emitir`, { empresaId: empN.id, tipo: 'NFE', parceiroNome: 'Cliente Dois', itens: [{ descricao: 'Produto', quantidade: 3, valorUnitario: 100 }] })
    check('NF-e: numeração própria (1), chave de 44 dígitos FICTÍCIA', nfe.json.numero === 1 && /^\d{44}$/.test(nfe.json.chaveAcesso), nfe.json)
    const tit = await call(admin, 'GET', `${C}/titulos/${n2.json.tituloId}`)
    check('vínculo nota → conta a receber criada (valor, vencimento, notaId)', tit.status === 200 && tit.json.valor === 1000 && tit.json.notaId === n2.json.id && tit.json.tipo === 'RECEBER')
    check('cancelar: motivo curto 400; financeiro 403; contador ok (cancela título aberto vinculado); repetir 409', (await call(contador, 'POST', `${C}/notas/${n2.json.id}/cancelar`, { motivo: 'curto' })).status === 400 && (await call(fin, 'POST', `${C}/notas/${n2.json.id}/cancelar`, { motivo: 'Emitida por engano, valor incorreto' })).status === 403)
    const canc = await call(contador, 'POST', `${C}/notas/${n2.json.id}/cancelar`, { motivo: 'Emitida por engano, valor incorreto' })
    check('cancelamento OK: protocolo simulado, nota CANCELADA, título cancelado', canc.status === 200 && canc.json.simulacao === true && (await call(admin, 'GET', `${C}/notas/${n2.json.id}`)).json.status === 'CANCELADA' && (await call(admin, 'GET', `${C}/titulos/${n2.json.tituloId}`)).json.status === 'CANCELADO' && (await call(contador, 'POST', `${C}/notas/${n2.json.id}/cancelar`, { motivo: 'Emitida por engano, valor incorreto' })).status === 409)
    const n3 = await emitir(contador, { gerarTitulo: true, vencimento: dHoje(10) })
    await call(fin, 'POST', `${C}/titulos/${n3.json.tituloId}/baixar`, {})
    check('nota com título JÁ PAGO não cancela (409 CTB_TITULO_PAGO)', (await call(contador, 'POST', `${C}/notas/${n3.json.id}/cancelar`, { motivo: 'Tentativa de cancelar nota paga' })).json.codigo === 'CTB_TITULO_PAGO')
    const emp2Doc = novoCnpj()
    const eImp = (await call(admin, 'POST', `${C}/empresas`, { ...base, documento: emp2Doc, razaoSocial: 'Importadora XML Ltda', regimeAtual: 'PRESUMIDO', cnae: '4712100' })).json
    const xml = xmlNfe(novoCnpj(), emp2Doc)
    const imp = await call(contador, 'POST', `${C}/notas/importar-xml`, { empresaId: eImp.id, xml, gerarTitulo: true, vencimento: dHoje(20) })
    check('importar XML: ENTRADA detectada pelo CNPJ de destino, itens/impostos lidos, aviso de não validação, título a pagar criado', imp.status === 201 && imp.json.direcao === 'ENTRADA' && imp.json.valorTotal === 100 && imp.json.status === 'IMPORTADA' && imp.json.simulacao === false && /NÃO foram verificadas/.test(imp.json.aviso) && !!imp.json.tituloId && imp.json.xml === undefined, imp.json)
    check('XML: mesma chave => 409; CNPJ divergente => 422; sem DTD/DOCTYPE; lixo => 400', (await call(contador, 'POST', `${C}/notas/importar-xml`, { empresaId: eImp.id, xml })).status === 409 && (await call(contador, 'POST', `${C}/notas/importar-xml`, { empresaId: eImp.id, xml: xml.replace(/35261011122233000181550010000000011000000019/, '35261011122233000181550010000000021000000010').replace(emp2Doc, novoCnpj()) })).status === 422 && (await call(contador, 'POST', `${C}/notas/importar-xml`, { empresaId: eImp.id, xml: '<?xml version="1.0"?><!DOCTYPE a [<!ENTITY x "y">]><nfeProc><infNFe/></nfeProc>' + ' '.repeat(60) })).status === 400 && (await call(contador, 'POST', `${C}/notas/importar-xml`, { empresaId: eImp.id, xml: '<html>' + 'x'.repeat(100) + '</html>' })).status === 400)
    check('nota importada de terceiros não é cancelável aqui', (await call(contador, 'POST', `${C}/notas/${imp.json.id}/cancelar`, { motivo: 'Tentando cancelar nota de entrada' })).status === 409)
    const ent2 = await call(fin, 'POST', `${C}/notas/entrada`, { empresaId: empN.id, tipo: 'NFSE', numero: 77, parceiroNome: 'Fornecedor Serviços', valorTotal: 800, gerarTitulo: true, vencimento: dHoje(7), impostos: { iss: 24 } })
    check('nota de entrada manual gera conta a pagar; chave duplicada 409', ent2.status === 201 && !!ent2.json.tituloId && (await call(fin, 'POST', `${C}/notas/entrada`, { empresaId: empN.id, tipo: 'NFE', chaveAcesso: '1'.repeat(44), parceiroNome: 'Forn', valorTotal: 10 })).status === 201 && (await call(fin, 'POST', `${C}/notas/entrada`, { empresaId: empN.id, tipo: 'NFE', chaveAcesso: '1'.repeat(44), parceiroNome: 'Forn', valorTotal: 10 })).status === 409)
    const esp = await call(fin, 'GET', `${C}/notas/${n3.json.id}/espelho`)
    check('espelho imprimível: marca SIMULAÇÃO, itens, aviso legal', esp.status === 200 && /SIMULAÇÃO/.test(esp.text) && /Consultoria/.test(esp.text) && /não substitui um contador/.test(esp.text) && /não foi transmitida/.test(esp.text))
    check('lista de notas: filtros e soma ignoram canceladas', (await call(fin, 'GET', `${C}/notas?empresaId=${empN.id}&direcao=SAIDA`)).json.total >= 3 && (await call(fin, 'GET', `${C}/notas?empresaId=${empN.id}&status=CANCELADA`)).json.total === 1)
    check('tenant B não vê notas nem espelho de A', (await call(adminB, 'GET', `${C}/notas/${n3.json.id}`)).status === 404 && (await call(adminB, 'GET', `${C}/notas/${n3.json.id}/espelho`)).status === 404 && (await call(adminB, 'GET', `${C}/notas?empresaId=${empN.id}`)).json.total === 0)
    check('provedor fiscal declarado simulado', (await call(fin, 'GET', `${C}/provedores-fiscais`)).json.simulado === true)
    const rec = await call(fin, 'POST', `${C}/recibos`, { empresaId: empN.id, pessoaNome: 'Cliente Recibo', valor: 1234.56, referente: 'Serviços de consultoria', formaPagamento: 'PIX' })
    const rec2 = await call(fin, 'POST', `${C}/recibos`, { empresaId: empN.id, tipo: 'PAGAMENTO', pessoaNome: 'Fornecedor', valor: 50, referente: 'Material de escritório' })
    check('recibos numerados (1, 2) por empresa; impressão com valor por extenso e aviso', rec.json.numero === 1 && rec2.json.numero === 2 && (await call(fin, 'GET', `${C}/recibos/${rec.json.id}/imprimir`)).text.includes('mil duzentos e trinta e quatro reais e cinquenta e seis centavos'))
    check('recibo: valor inválido 400; título de outro tenant 404; cancelar exige permissão/motivo', (await call(fin, 'POST', `${C}/recibos`, { empresaId: empN.id, pessoaNome: 'Xa', valor: 0, referente: 'xxx' })).status === 400 && (await call(fin, 'POST', `${C}/recibos`, { empresaId: empN.id, pessoaNome: 'Xa', valor: 5, referente: 'xxx', tituloId: 'nao-existe' })).status === 404 && (await call(fin, 'POST', `${C}/recibos/${rec2.json.id}/cancelar`, { motivo: 'motivo bem longo' })).status === 403 && (await call(contador, 'POST', `${C}/recibos/${rec2.json.id}/cancelar`, { motivo: 'Emitido com valor errado' })).status === 200 && (await call(contador, 'POST', `${C}/recibos/${rec2.json.id}/cancelar`, { motivo: 'Emitido com valor errado' })).status === 409)

    // ================================================================== financeiro
    secao('Financeiro: títulos, baixa, cobrança (régua), segunda via')
    const empF = (await call(admin, 'POST', `${C}/empresas`, { ...base, documento: novoCnpj(), razaoSocial: 'Financeiro Teste Ltda', regimeAtual: 'SIMPLES', cnae: '8630504', atividade: 'SERVICOS' })).json
    const tbody = (o: any = {}) => ({ empresaId: empF.id, tipo: 'RECEBER', descricao: 'Mensalidade de serviços', parceiroNome: 'Cliente Financeiro', parceiroEmail: 'c@example.com', parceiroTelefone: '11999990000', valor: 1000, vencimento: dHoje(5), ...o })
    check('título: valor negativo 400, data inválida 400, empresa de outro tenant 404, conta contábil inexistente 400, receber em conta de despesa 400', (await call(fin, 'POST', `${C}/titulos`, tbody({ valor: -5 }))).status === 400 && (await call(fin, 'POST', `${C}/titulos`, tbody({ vencimento: '31/12/2026' }))).status === 400 && (await call(adminB, 'POST', `${C}/titulos`, tbody())).status === 404 && (await call(fin, 'POST', `${C}/titulos`, tbody({ contaContabilCodigo: '9.9.9.99' }))).status === 400 && (await call(fin, 'POST', `${C}/titulos`, tbody({ contaContabilCodigo: '5.1.2.01' }))).status === 400)
    const t1r = await call(fin, 'POST', `${C}/titulos`, tbody({ valor: 1000, vencimento: dHoje(5) }))
    check('título a receber criado (ABERTO, com lançamento contábil D Clientes / C Receita)', t1r.status === 201 && t1r.json.situacao === 'ABERTO' && !!t1r.json.lancamentoId)
    const bal0 = await call(admin, 'GET', `${C}/balancete?empresaId=${empF.id}&de=${hoje.getUTCFullYear()}-01-01&ate=${dHoje(1)}`)
    const lin = (r: any, cod: string) => r.json.linhas.find((l: any) => l.codigo === cod)
    check('balancete reflete: Clientes 1.000 (D) e Receita de serviços 1.000 (C), equilibrado', lin(bal0, '1.1.2.01')?.saldoAtual === 1000 && lin(bal0, '3.1.2.01')?.saldoAtual === 1000 && bal0.json.totais.equilibrado)
    const bx = await call(fin, 'POST', `${C}/titulos/${t1r.json.id}/baixar`, { valorPago: 1015.5 })
    check('baixa com juros: PAGO, valor pago 1.015,50; juros em receita financeira; 2ª baixa 409', bx.status === 200 && bx.json.status === 'PAGO' && bx.json.valorPago === 1015.5 && (await call(fin, 'POST', `${C}/titulos/${t1r.json.id}/baixar`, {})).status === 409)
    const bal1 = await call(admin, 'GET', `${C}/balancete?empresaId=${empF.id}&de=${hoje.getUTCFullYear()}-01-01&ate=${dHoje(1)}`)
    check('balancete após baixa: Banco 1.015,50, Clientes zerado, receita financeira 15,50, ainda equilibrado', lin(bal1, '1.1.1.02')?.saldoAtual === 1015.5 && (lin(bal1, '1.1.2.01')?.saldoAtual ?? 0) === 0 && lin(bal1, '5.2.2.01')?.saldoAtual === 15.5 && bal1.json.totais.equilibrado)
    const tp = await call(fin, 'POST', `${C}/titulos`, tbody({ tipo: 'PAGAR', descricao: 'Aluguel', parceiroNome: 'Imobiliária', valor: 2000, contaContabilCodigo: '5.1.3.01', vencimento: dHoje(3) }))
    const canT = await call(fin, 'POST', `${C}/titulos/${tp.json.id}/cancelar`, { motivo: 'Lançado em duplicidade' })
    const bal2 = await call(admin, 'GET', `${C}/balancete?empresaId=${empF.id}&de=${hoje.getUTCFullYear()}-01-01&ate=${dHoje(1)}`)
    check('cancelar título aberto estorna o lançamento (despesa e fornecedores zerados); título pago não cancela', canT.json.status === 'CANCELADO' && (lin(bal2, '5.1.3.01')?.saldoAtual ?? 0) === 0 && (lin(bal2, '2.1.1.01')?.saldoAtual ?? 0) === 0 && (await call(fin, 'POST', `${C}/titulos/${t1r.json.id}/cancelar`, { motivo: 'Tentando cancelar pago' })).status === 409)
    check('listas: filtro de vencidos, soma e situação VENCIDO calculada', await (async () => {
      await call(fin, 'POST', `${C}/titulos`, tbody({ descricao: 'Atrasado 8 dias', vencimento: dHoje(-8), valor: 300 }))
      const l = await call(fin, 'GET', `${C}/titulos?empresaId=${empF.id}&status=VENCIDO`)
      return l.json.total === 1 && l.json.items[0].situacao === 'VENCIDO' && l.json.items[0].diasAtraso === 8 && l.json.somaValor === 300
    })())
    const reg = await call(fin, 'POST', `${C}/cobranca/executar-regua`, { empresaId: empF.id })
    check('régua: envia a etapa D+7 (mensagem SIMULADA) para o título com 8 dias de atraso', reg.status === 200 && reg.json.enviados >= 1 && reg.json.simulado === true && reg.json.items.some((i: any) => i.etapa === 'D+7' && i.status === 'SIMULADO'), reg.json)
    check('régua é idempotente (2ª execução não reenvia)', (await call(fin, 'POST', `${C}/cobranca/executar-regua`, { empresaId: empF.id })).json.enviados === 0)
    const aberto = (await call(fin, 'GET', `${C}/titulos?empresaId=${empF.id}&status=VENCIDO`)).json.items[0]
    const man = await call(fin, 'POST', `${C}/titulos/${aberto.id}/cobrar`, { canal: 'WHATSAPP' })
    check('cobrança manual WhatsApp registrada como SIMULADO; canal inválido 400; só contas a receber em aberto', man.status === 201 && man.json.status === 'SIMULADO' && (await call(fin, 'POST', `${C}/titulos/${aberto.id}/cobrar`, { canal: 'FAX' })).status === 400 && (await call(fin, 'POST', `${C}/titulos/${t1r.json.id}/cobrar`, { canal: 'EMAIL' })).status === 409)
    check('histórico de cobranças por título/empresa; régua informa provedor simulado', (await call(fin, 'GET', `${C}/cobrancas?tituloId=${aberto.id}`)).json.total >= 2 && (await call(fin, 'GET', `${C}/cobranca/regua`)).json.provedor.simulado === true)
    const via2 = await call(fin, 'GET', `${C}/titulos/${aberto.id}/segunda-via`)
    check('segunda via: documento sem boleto, aviso legal, registrada; conta a pagar não tem segunda via', via2.status === 200 && /sem boleto bancário/.test(via2.text) && /não substitui um contador/.test(via2.text) && (await call(fin, 'GET', `${C}/titulos/${tp.json.id}/segunda-via`)).status === 400)
    check('tenant B não vê/baixa/cobra títulos de A', (await call(adminB, 'GET', `${C}/titulos/${aberto.id}`)).status === 404 && (await call(finB, 'POST', `${C}/titulos/${aberto.id}/baixar`, {})).status === 404 && (await call(finB, 'POST', `${C}/titulos/${aberto.id}/cobrar`, { canal: 'EMAIL' })).status === 404 && (await call(adminB, 'GET', `${C}/titulos?empresaId=${empF.id}`)).json.total === 0)

    secao('Conciliação bancária (OFX/CSV)')
    const cb = await call(fin, 'POST', `${C}/contas-bancarias`, { empresaId: empF.id, apelido: 'Conta teste', banco: '999', saldoInicial: 0 })
    check('conta bancária criada; leitor não cria; tenant B não importa nela', cb.status === 201 && (await call(coord, 'POST', `${C}/contas-bancarias`, { empresaId: empF.id, apelido: 'x' })).status === 403 && (await call(finB, 'POST', `${C}/contas-bancarias/${cb.json.id}/importar`, { formato: 'CSV', conteudo: 'Data;Descrição;Valor\n01/01/2026;X;1,00' })).status === 404)
    const tConc = await call(fin, 'POST', `${C}/titulos`, tbody({ descricao: 'Serviço de design — Studio Aurora', parceiroNome: 'Studio Aurora', valor: 2500, vencimento: dHoje(-2) }))
    const tPag = await call(fin, 'POST', `${C}/titulos`, tbody({ tipo: 'PAGAR', descricao: 'Licença de software', parceiroNome: 'Soft Brasil', valor: 399.9, contaContabilCodigo: '5.1.2.01', vencimento: dHoje(-1) }))
    const tA1 = await call(fin, 'POST', `${C}/titulos`, tbody({ descricao: 'Duplo A', parceiroNome: 'Cliente Gêmeo', valor: 777, vencimento: dHoje(-1) }))
    const tA2 = await call(fin, 'POST', `${C}/titulos`, tbody({ descricao: 'Duplo B', parceiroNome: 'Outro Gêmeo', valor: 777, vencimento: dHoje(-1) }))
    const d8 = (n: number) => dHoje(n).replace(/-/g, '') + '120000[-3:BRT]'
    const trn = (id: string, n: number, v: number, memo: string) => `<STMTTRN><TRNTYPE>X<DTPOSTED>${d8(n)}<TRNAMT>${v.toFixed(2)}<FITID>${id}<MEMO>${memo}</STMTTRN>`
    const ofxTxt = `<OFX><BANKTRANLIST>${[trn('E2E-1', -2, 2500, 'PIX STUDIO AURORA DESIGN'), trn('E2E-2', -1, -399.9, 'DEB SOFT BRASIL LICENCAS'), trn('E2E-3', -1, -45.9, 'TARIFA MANUTENCAO'), trn('E2E-4', -1, 777, 'PIX RECEBIDO'), trn('E2E-5', 0, 12.34, 'RENDIMENTO'), trn('E2E-6', 0, 321.09, 'DEPOSITO MISTERIOSO')].join('')}</BANKTRANLIST></OFX>`
    const i1 = await call(fin, 'POST', `${C}/contas-bancarias/${cb.json.id}/importar`, { formato: 'OFX', conteudo: ofxTxt })
    check('importar OFX: 6 linhas importadas', i1.status === 201 && i1.json.importadas === 6 && i1.json.duplicadas === 0, i1.json)
    check('reimportar o mesmo arquivo: 0 novas (duplicadas ignoradas)', (await call(fin, 'POST', `${C}/contas-bancarias/${cb.json.id}/importar`, { formato: 'OFX', conteudo: ofxTxt })).json.importadas === 0)
    check('arquivo sem linhas válidas => 400; conteúdo curto => 400', (await call(fin, 'POST', `${C}/contas-bancarias/${cb.json.id}/importar`, { formato: 'OFX', conteudo: '<OFX>sem transacoes aqui</OFX>' })).status === 400 && (await call(fin, 'POST', `${C}/contas-bancarias/${cb.json.id}/importar`, { formato: 'CSV', conteudo: 'x' })).status === 400)
    const ext = await call(fin, 'GET', `${C}/extrato?empresaId=${empF.id}&status=PENDENTE`)
    const L = (fit: string) => ext.json.items.find((x: any) => x.fitid === fit)
    check('sugestões automáticas por valor/data/descrição: Aurora => título certo (score alto); licença => título a pagar; gêmeos => 2 candidatos', L('E2E-1').sugestoes[0]?.tituloId === tConc.json.id && L('E2E-1').sugestoes[0].score >= 90 && L('E2E-2').sugestoes[0]?.tituloId === tPag.json.id && L('E2E-4').sugestoes.length === 2 && L('E2E-6').sugestoes.length === 0, ext.json.items.map((x: any) => [x.fitid, x.sugestoes.map((s: any) => s.score)]))
    check('conciliação de entrada com título A PAGAR bloqueada (409); título inexistente 404', (await call(fin, 'POST', `${C}/extrato/${L('E2E-1').id}/conciliar`, { tituloId: tPag.json.id })).status === 409 && (await call(fin, 'POST', `${C}/extrato/${L('E2E-1').id}/conciliar`, { tituloId: 'nada' })).status === 404)
    const cc = await call(fin, 'POST', `${C}/extrato/${L('E2E-1').id}/conciliar`, { tituloId: tConc.json.id })
    check('conciliar: título PAGO na data do extrato, linha CONCILIADA; 2ª tentativa 409', cc.status === 200 && cc.json.titulo.status === 'PAGO' && cc.json.titulo.valorPago === 2500 && (await call(fin, 'POST', `${C}/extrato/${L('E2E-1').id}/conciliar`, { tituloId: tConc.json.id })).status === 409 && (await prisma.ctbExtrato.findUnique({ where: { id: L('E2E-1').id } }))?.status === 'CONCILIADO')
    const aj = await call(fin, 'POST', `${C}/extrato/${L('E2E-3').id}/ajustar`, { contaCodigo: '5.2.1.01', historico: 'Tarifa bancária' })
    check('ajuste (tarifa): lançamento D Despesa financeira / C Banco; conta sintética recusada', aj.status === 200 && aj.json.lancamentoNumero > 0 && (await call(fin, 'POST', `${C}/extrato/${L('E2E-5').id}/ajustar`, { contaCodigo: '5.2' })).status === 400)
    const ig = await call(fin, 'POST', `${C}/extrato/${L('E2E-6').id}/ignorar`, { observacao: 'Depósito a investigar' })
    check('ignorar e reabrir linha; conciliada não reabre', ig.status === 200 && (await call(fin, 'POST', `${C}/extrato/${L('E2E-6').id}/reabrir`, {})).status === 200 && (await call(fin, 'POST', `${C}/extrato/${L('E2E-1').id}/reabrir`, {})).status === 409)
    const auto = await call(fin, 'POST', `${C}/conciliacao/auto`, { empresaId: empF.id })
    check('conciliação automática: casa só o inequívoco (licença) e deixa os gêmeos e o depósito para revisão', auto.json.conciliadas === 1 && (await prisma.ctbTitulo.findUnique({ where: { id: tPag.json.id } }))?.status === 'PAGO' && (await prisma.ctbTitulo.findUnique({ where: { id: tA1.json.id } }))?.status === 'ABERTO' && (await prisma.ctbTitulo.findUnique({ where: { id: tA2.json.id } }))?.status === 'ABERTO', auto.json)
    const resumoExt = (await call(fin, 'GET', `${C}/extrato?empresaId=${empF.id}`)).json.resumo
    check('resumo do extrato por status', ['CONCILIADO', 'AJUSTADO', 'PENDENTE'].every((s) => resumoExt.some((r: any) => r.status === s)))
    const bal3 = await call(admin, 'GET', `${C}/balancete?empresaId=${empF.id}&de=${hoje.getUTCFullYear()}-01-01&ate=${dHoje(1)}`)
    check('balancete após conciliação segue equilibrado', bal3.json.totais.equilibrado && bal3.json.totais.debitos > 0)
    check('tenant B não vê extrato de A', (await call(adminB, 'GET', `${C}/extrato?empresaId=${empF.id}`)).json.total === 0 && (await call(finB, 'POST', `${C}/extrato/${L('E2E-4').id}/ignorar`, {})).status === 404)
    const csvImp = await call(fin, 'POST', `${C}/contas-bancarias/${cb.json.id}/importar`, { formato: 'CSV', conteudo: `Data;Descrição;Valor\n${dHoje(0).split('-').reverse().join('/')};TED RECEBIDA CLIENTE;5.000,00\n${dHoje(0).split('-').reverse().join('/')};PAGAMENTO FORNECEDOR;-1.250,40\n` })
    check('importar CSV brasileiro', csvImp.json.importadas === 2)

    // ================================================================== plano, lançamentos, DRE
    secao('Plano de contas, lançamentos (partidas dobradas), balancete e DRE')
    const empD = (await call(admin, 'POST', `${C}/empresas`, { ...base, documento: novoCnpj(), razaoSocial: 'DRE Teste Ltda', regimeAtual: 'SIMPLES', cnae: '8630504', atividade: 'SERVICOS' })).json
    const mesA = somaMeses(iso(hoje).slice(0, 7), -1), mesB = iso(hoje).slice(0, 7)
    const L1 = (data: string, hist: string, partidas: any[], a = contador) => call(a, 'POST', `${C}/lancamentos`, { empresaId: empD.id, data, historico: hist, partidas })
    check('lançamento desbalanceado 400; uma partida só 400; conta inexistente 400; conta sintética 400; valor zero 400', (await L1(`${mesB}-05`, 'x desbalanceado', [{ conta: '1.1.1.02', tipo: 'D', valor: 100 }, { conta: '3.1.2.01', tipo: 'C', valor: 90 }])).json?.codigo === 'CTB_DESBALANCEADO' && (await L1(`${mesB}-05`, 'só uma', [{ conta: '1.1.1.02', tipo: 'D', valor: 100 }])).status === 400 && (await L1(`${mesB}-05`, 'inexistente', [{ conta: '1.1.1.02', tipo: 'D', valor: 100 }, { conta: '9.9.9.99', tipo: 'C', valor: 100 }])).status === 400 && (await L1(`${mesB}-05`, 'sintetica', [{ conta: '1.1.1.02', tipo: 'D', valor: 100 }, { conta: '3.1', tipo: 'C', valor: 100 }])).status === 400 && (await L1(`${mesB}-05`, 'zero', [{ conta: '1.1.1.02', tipo: 'D', valor: 0 }, { conta: '3.1.2.01', tipo: 'C', valor: 0 }])).status === 400)
    check('financeiro não lança manualmente (403)', (await L1(`${mesB}-05`, 'fin tentando lançar', [{ conta: '1.1.1.02', tipo: 'D', valor: 1 }, { conta: '3.1.2.01', tipo: 'C', valor: 1 }], fin)).status === 403)
    // mês anterior (para o comparativo): receita 8.000, custo 1.500, pessoal 2.500
    await L1(`${mesA}-10`, 'Receita de serviços do mês anterior', [{ conta: '1.1.1.02', tipo: 'D', valor: 8000 }, { conta: '3.1.2.01', tipo: 'C', valor: 8000 }])
    await L1(`${mesA}-12`, 'Custo do mês anterior', [{ conta: '4.1.2.01', tipo: 'D', valor: 1500 }, { conta: '1.1.1.02', tipo: 'C', valor: 1500 }])
    await L1(`${mesA}-15`, 'Folha do mês anterior', [{ conta: '5.1.1.01', tipo: 'D', valor: 2500 }, { conta: '1.1.1.02', tipo: 'C', valor: 2500 }])
    // mês atual: números redondos para conferir a DRE
    const lancs: Array<[string, any[]]> = [
      ['Receita de serviços', [{ conta: '1.1.1.02', tipo: 'D', valor: 10000 }, { conta: '3.1.2.01', tipo: 'C', valor: 10000 }]],
      ['Impostos sobre serviços (DAS)', [{ conta: '3.2.1.01', tipo: 'D', valor: 800 }, { conta: '1.1.1.02', tipo: 'C', valor: 800 }]],
      ['Custo dos serviços', [{ conta: '4.1.2.01', tipo: 'D', valor: 2000 }, { conta: '1.1.1.02', tipo: 'C', valor: 2000 }]],
      ['Folha de pagamento', [{ conta: '5.1.1.01', tipo: 'D', valor: 3000 }, { conta: '1.1.1.02', tipo: 'C', valor: 3000 }]],
      ['Despesas administrativas', [{ conta: '5.1.2.01', tipo: 'D', valor: 500 }, { conta: '1.1.1.02', tipo: 'C', valor: 500 }]],
      ['Rendimento financeiro', [{ conta: '1.1.1.02', tipo: 'D', valor: 100 }, { conta: '5.2.2.01', tipo: 'C', valor: 100 }]],
      ['Tarifas bancárias', [{ conta: '5.2.1.01', tipo: 'D', valor: 50 }, { conta: '1.1.1.02', tipo: 'C', valor: 50 }]],
      ['Provisão IRPJ/CSLL', [{ conta: '5.9.1.01', tipo: 'D', valor: 200 }, { conta: '2.1.3.01', tipo: 'C', valor: 200 }]],
    ]
    for (const [h, p] of lancs) await L1(`${mesB}-08`, h, p)
    const lastL = await L1(`${mesB}-09`, 'Lançamento a estornar', [{ conta: '5.1.2.01', tipo: 'D', valor: 123.45 }, { conta: '1.1.1.01', tipo: 'C', valor: 123.45 }])
    check('lançamento válido criado com número sequencial', lastL.status === 201 && lastL.json.numero === 12, lastL.json?.numero)
    const est = await call(contador, 'POST', `${C}/lancamentos/${lastL.json.id}/estornar`, { motivo: 'Lançado por engano', data: `${mesB}-09` })
    check('estorno cria lançamento inverso; 2º estorno 409; estorno do estorno 409; financeiro 403', est.status === 201 && (await call(contador, 'POST', `${C}/lancamentos/${lastL.json.id}/estornar`, { motivo: 'Lançado por engano' })).status === 409 && (await call(contador, 'POST', `${C}/lancamentos/${est.json.id}/estornar`, { motivo: 'Lançado por engano' })).status === 409 && (await call(fin, 'POST', `${C}/lancamentos/${lastL.json.id}/estornar`, { motivo: 'Lançado por engano' })).status === 403)
    const lan = await call(admin, 'GET', `${C}/lancamentos?empresaId=${empD.id}&de=${mesB}-01&ate=${mesB}-28&conta=5.1.2.01`)
    check('lista de lançamentos com partidas, filtro por conta', lan.json.items.length === 3 && lan.json.items.every((l: any) => l.partidas.length >= 2))
    const dre1 = await call(admin, 'GET', `${C}/dre?empresaId=${empD.id}&de=${mesB}-01&ate=${mesB}-28`)
    const dv = (j: any, k: string, i = 0) => j.linhas.find((l: any) => l.chave === k).valores[i]
    check('DRE do mês: receita bruta 10.000; deduções −800; receita líquida 9.200; custos −2.000; lucro bruto 7.200', dre1.status === 200 && dv(dre1.json, 'receitaBruta') === 10000 && dv(dre1.json, 'deducoes') === -800 && dv(dre1.json, 'receitaLiquida') === 9200 && dv(dre1.json, 'custos') === -2000 && dv(dre1.json, 'lucroBruto') === 7200, dre1.json.linhas?.map((l: any) => [l.chave, l.valores[0]]))
    check('DRE: despesas operacionais −3.500; resultado operacional 3.700; financeiro +100/−50; antes do IR 3.750; IR −200; líquido 3.550; margem 35,5%', dv(dre1.json, 'despesasOperacionais') === -3500 && dv(dre1.json, 'resultadoOperacional') === 3700 && dv(dre1.json, 'receitasFinanceiras') === 100 && dv(dre1.json, 'despesasFinanceiras') === -50 && dv(dre1.json, 'resultadoAntesIr') === 3750 && dv(dre1.json, 'irCsll') === -200 && dv(dre1.json, 'resultadoLiquido') === 3550 && near(dv(dre1.json, 'margemLiquida'), 35.5))
    const dreC = await call(admin, 'GET', `${C}/dre?empresaId=${empD.id}&de=${mesB}-01&ate=${mesB}-28&comparar=anterior`)
    check('DRE comparativa com o período anterior: receita 8.000 antes; variação +25%; resultado anterior 4.000 => variação negativa', dreC.json.comparativo?.linhas.find((l: any) => l.chave === 'receitaBruta').valores[0] === 8000 && dreC.json.comparativo.variacao.find((v: any) => v.chave === 'receitaBruta').percentual[0] === 25 && dreC.json.comparativo.linhas.find((l: any) => l.chave === 'resultadoLiquido').valores[0] === 4000 && dreC.json.comparativo.variacao.find((v: any) => v.chave === 'resultadoLiquido').percentual[0] === -11.25, dreC.json.comparativo?.variacao)
    const dreM = await call(admin, 'GET', `${C}/dre?empresaId=${empD.id}&de=${mesA}-01&ate=${mesB}-28&modo=mensal`)
    check('DRE mensal: 2 colunas (mês anterior e atual) com receitas 8.000 e 10.000', dreM.json.colunas.length === 2 && dv(dreM.json, 'receitaBruta', 0) === 8000 && dv(dreM.json, 'receitaBruta', 1) === 10000)
    const csvDre = await call(admin, 'GET', `${C}/dre?empresaId=${empD.id}&de=${mesB}-01&ate=${mesB}-28&formato=csv`)
    check('DRE exportável em CSV (UTF-8 com BOM, separador ;) e imprimível em HTML com aviso', csvDre.text.startsWith('Linha;Período') && /Resultado líquido/.test(csvDre.text) && (await call(admin, 'GET', `${C}/dre?empresaId=${empD.id}&de=${mesB}-01&ate=${mesB}-28&formato=html`)).text.includes('não substitui um contador'), csvDre.text.slice(0, 150))
    const balD = await call(admin, 'GET', `${C}/balancete?empresaId=${empD.id}&de=${mesB}-01&ate=${mesB}-28`)
    check('balancete do mês: equilibrado; saldo anterior do banco = 4.000 (8.000 − 1.500 − 2.500); contas sintéticas somam filhas', balD.json.totais.equilibrado && lin(balD, '1.1.1.02').saldoAnterior === 4000 && lin(balD, '3').saldoAtual === 17200 && lin(balD, '3.1').saldoAtual === 18000 && lin(balD, '3.1').creditos === 10000, balD.json.linhas.filter((l: any) => ['1.1.1.02', '3', '3.1'].includes(l.codigo)))
    check('balancete CSV e HTML; período invertido 400; empresaId obrigatório', (await call(admin, 'GET', `${C}/balancete?empresaId=${empD.id}&formato=csv`)).text.startsWith('Código;Conta') && (await call(admin, 'GET', `${C}/balancete?empresaId=${empD.id}&de=2026-05-01&ate=2026-01-01`)).status === 400 && (await call(admin, 'GET', `${C}/dre`)).status === 400, [(await call(admin, 'GET', `${C}/balancete?empresaId=${empD.id}&formato=csv`)).text.slice(0, 80), (await call(admin, 'GET', `${C}/balancete?empresaId=${empD.id}&de=2026-05-01&ate=2026-01-01`)).status])
    check('tenant B não vê DRE/balancete/plano/lançamentos de A', (await call(adminB, 'GET', `${C}/dre?empresaId=${empD.id}`)).status === 404 && (await call(adminB, 'GET', `${C}/balancete?empresaId=${empD.id}`)).status === 404 && (await call(adminB, 'GET', `${C}/plano?empresaId=${empD.id}`)).status === 404 && (await call(adminB, 'POST', `${C}/lancamentos/${lastL.json.id}/estornar`, { motivo: 'Tentativa entre tenants' })).status === 404)
    const novaConta = await call(contador, 'POST', `${C}/plano`, { empresaId: empD.id, codigo: '5.1.2.02', nome: 'Software e assinaturas', tipo: 'DESPESA', natureza: 'D' })
    check('plano: conta nova sob pai sintético; duplicada 409; pai inexistente/analítico 400; financeiro 403', novaConta.status === 201 && (await call(contador, 'POST', `${C}/plano`, { empresaId: empD.id, codigo: '5.1.2.02', nome: 'Outra', tipo: 'DESPESA', natureza: 'D' })).status === 409 && (await call(contador, 'POST', `${C}/plano`, { empresaId: empD.id, codigo: '5.1.2.01.01', nome: 'Filha de analítica', tipo: 'DESPESA', natureza: 'D' })).status === 400 && (await call(fin, 'POST', `${C}/plano`, { empresaId: empD.id, codigo: '5.1.2.03', nome: 'Outra conta', tipo: 'DESPESA', natureza: 'D' })).status === 403)
    const sD = await call(contador, 'POST', `${C}/empresas/${empD.id}/regime/simular`, { ate: mesB, salvar: false })
    check('histórico derivado dos lançamentos alimenta o recomendador (receita do mês corrente = 10.000, fonte LANCAMENTOS)', (await call(contador, 'GET', `${C}/empresas/${empD.id}/historico?ate=${mesB}`)).json.meses.some((m: any) => m.competencia === mesB && m.receitaBruta === 10000 && m.fonte === 'LANCAMENTOS') && sD.json.resumo.mesesComDados === 2 && sD.json.resumo.anualizado === false)

    // ================================================================== dashboard e auditoria
    secao('Dashboard e auditoria')
    const dash = await call(fin, 'GET', `${C}/dashboard`)
    check('dashboard: indicadores, série de 12 meses, alertas e próximos vencimentos', dash.status === 200 && dash.json.serie.length === 12 && dash.json.empresasAtivas >= 6 && dash.json.indicadores.aReceber.vencidoQuantidade >= 1 && Array.isArray(dash.json.alertas) && dash.json.alertas.some((a: any) => a.nivel === 'critico') && dash.json.simulacao === true, dash.json.alertas)
    check('dashboard por empresa e isolamento de tenant (B não vê nada de A)', (await call(fin, 'GET', `${C}/dashboard?empresaId=${empF.id}`)).json.empresasAtivas === 1 && (await call(adminB, 'GET', `${C}/dashboard`)).json.indicadores.aReceber.total === 0 && (await call(adminB, 'GET', `${C}/dashboard?empresaId=${empF.id}`)).status === 404)
    const aud = await call(admin, 'GET', `${C}/auditoria?pageSize=200`)
    const acoes = new Set(aud.json.items.map((a: any) => a.acao))
    const exigidas = ['nota.emitir', 'nota.cancelar', 'guia.gerar', 'guia.pagar', 'extrato.conciliar', 'extrato.ajustar', 'lancamento.criar', 'lancamento.estornar', 'regime.simular', 'regime.alterar', 'titulo.baixar', 'cobranca.regua', 'nota.importar-xml', 'membro.definir', 'empresa.criar', 'extrato.importar', 'recibo.emitir', 'extrato.conciliar-auto']
    check('auditoria registra as ações sensíveis (quem/o quê)', exigidas.every((x) => acoes.has(x)) && aud.json.items.every((a: any) => a.userId && a.papel), exigidas.filter((x) => !acoes.has(x)))
    check('auditoria não grava o XML nem conteúdo bruto; resposta sem segredos', !JSON.stringify(aud.json).includes('nfeProc') && !JSON.stringify(aud.json).includes('<OFX>'))
    check('auditoria do tenant A é invisível para B e filtrável; contador lê', (await call(adminB, 'GET', `${C}/auditoria`)).json.items.every((a: any) => a.tenantId === t2.tenantId) && (await call(contador, 'GET', `${C}/auditoria?acao=nota.`)).json.items.every((a: any) => a.acao.startsWith('nota.')))

    // ================================================================== seed
    secao('Seed idempotente (tenant novo, usuário administrador)')
    const failures: string[] = []
    // Tenant C (instituição nova, sem nenhuma empresa) para o seed
    const tenantC = `qa-ctb-c-${Math.random().toString(36).slice(2, 7)}`
    const clinicC = await prisma.clinic.create({ data: { tenantId: tenantC, name: 'Inst c', email: `c${tenantC}@q.com`, phone: '1', cnpj: '00.000.000/0001-03' } as any })
    const mkC = async (role: string): Promise<Actor> => { const u = await prisma.user.create({ data: { clinicId: clinicC.id, tenantId: tenantC, email: `${role.toLowerCase()}@${tenantC}.com`, password: 'x', firstName: role, lastName: 'C', role } as any }); return { id: u.id, role, tenantId: tenantC, token: jwt.sign({ id: u.id, email: u.email, clinicId: clinicC.id, tenantId: tenantC, role }, process.env.JWT_SECRET!) } }
    const adminC = await mkC('ADMIN'), finC = await mkC('FINANCE')
    const apiAdminB = as(adminC)
    const apiFinB = as(finC)
    const t0 = Date.now()
    const rs = await seedContabilFiscal(apiAdminB, { failures, apiAs: () => apiFinB })
    console.log(`  seed: ${JSON.stringify(rs)} em ${Date.now() - t0} ms`)
    check('seed sem falhas', failures.length === 0, failures.slice(0, 5))
    check('seed: 4 empresas, > 150 títulos, notas, recibos, guias, extrato, cobranças', rs.empresas === 4 && rs.titulos > 150 && rs.notas >= 10 && rs.recibos === 3 && rs.guias >= 20 && rs.extrato === 9 && rs.cobrancas >= 1, rs)
    const rs2 = await seedContabilFiscal(apiAdminB, { failures })
    check('seed é idempotente (2ª execução não faz nada)', rs2.pulado === true && rs2.empresas === 0 && (await prisma.ctbEmpresa.count({ where: { tenantId: tenantC } })) === 4)
    const emps = (await call(adminC, 'GET', `${C}/empresas`)).json.items
    const clin = emps.find((e: any) => /Sorriso/.test(e.razaoSocial)), tech = emps.find((e: any) => /TechNova/.test(e.razaoSocial)), merc = emps.find((e: any) => /Bom Preço/.test(e.razaoSocial)), meiE = emps.find((e: any) => /Maria/.test(e.razaoSocial))
    const ano = `${hoje.getUTCFullYear()}-01-01`
    const dreS = await call(adminC, 'GET', `${C}/dre?empresaId=${clin.id}&de=${somaMeses(iso(hoje).slice(0, 7), -11)}-01&ate=${iso(hoje)}`)
    const rb = dv(dreS.json, 'receitaBruta'), rl = dv(dreS.json, 'resultadoLiquido')
    check('seed (clínica): DRE de 12 meses com números plausíveis (receita ~ 650–700 mil; margem líquida entre 5% e 40%)', rb > 600_000 && rb < 760_000 && rl / rb > 0.05 && rl / rb < 0.4, { rb, rl })
    const balS = await call(adminC, 'GET', `${C}/balancete?empresaId=${merc.id}&de=${somaMeses(iso(hoje).slice(0, 7), -11)}-01&ate=${iso(hoje)}`)
    check('seed (mercado): balancete equilibrado; CMV ≈ 70% da receita', balS.json.totais.equilibrado && (() => { const cmv = lin(balS, '4.1.1.01').saldoAtual, rec = lin(balS, '3.1.1.01').saldoAtual; return cmv / rec > 0.6 && cmv / rec < 0.8 })())
    const sims = await Promise.all([clin, tech, merc, meiE].map((e: any) => call(adminC, 'GET', `${C}/empresas/${e.id}/regime/simulacoes`)))
    check('seed: simulação de regime salva para cada empresa, com recomendação', sims.every((s) => s.json.items.length >= 1 && !!s.json.items[0].regimeRecomendado))
    const sTech = (await call(adminC, 'POST', `${C}/empresas/${tech.id}/regime/simular`, { salvar: false })).json
    check('seed (TechNova, fator R baixo): Simples no Anexo V e alerta/recomendação coerentes', sTech.regimes.find((r: any) => r.regime === 'SIMPLES').anexo === 'V' && sTech.resumo.fatorRPct < 28 && sTech.alertas.some((a: any) => /Fator R/.test(a.texto)), sTech.alertas)
    const sMei = (await call(adminC, 'POST', `${C}/empresas/${meiE.id}/regime/simular`, { salvar: false })).json
    check('seed (MEI): perto do limite => alerta; MEI ainda elegível', sMei.regimes[0].elegivel && sMei.alertas.some((a: any) => /MEI/.test(a.texto) && a.nivel === 'atencao'), sMei.alertas)
    const gSeed = await call(adminC, 'GET', `${C}/guias?pageSize=200`)
    check('seed: guias com mix de pagas, pendentes e uma ATRASADA (PIS do mercado)', gSeed.json.items.some((g: any) => g.situacao === 'PAGA') && gSeed.json.items.some((g: any) => g.situacao === 'PENDENTE') && gSeed.json.items.some((g: any) => g.situacao === 'ATRASADA' && g.tributo === 'PIS'))
    const dashB = await call(adminC, 'GET', `${C}/dashboard`)
    check('seed: dashboard com alerta crítico de guia vencida, vencimentos próximos e extrato pendente', dashB.json.alertas.some((a: any) => a.nivel === 'critico' && /guia/.test(a.texto)) && dashB.json.indicadores.extratoPendente === 9 && dashB.json.indicadores.aReceber.vencidoQuantidade >= 2)
    const extB = await call(finC, 'GET', `${C}/extrato?empresaId=${clin.id}&status=PENDENTE`)
    check('seed: extrato da clínica com 3 sugestões fortes (convênio, ortodontia, material)', extB.json.items.filter((x: any) => x.sugestoes[0]?.score >= 85).length === 3, extB.json.items.map((x: any) => [x.descricao, x.sugestoes[0]?.score]))
    const autoSeed = await call(finC, 'POST', `${C}/conciliacao/auto`, { empresaId: clin.id })
    check('seed: conciliação automática resolve as 3 sugestões fortes', autoSeed.json.conciliadas === 3, autoSeed.json)
    void ano
  } finally {
    summary()
    await S.close()
    process.exit(fails.length ? 1 : 0)
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
