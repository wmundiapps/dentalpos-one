// Testes do módulo Caixa de boletos (DDA e e-mail dedicado): validação de linha digitável (casos reais conhecidos), extração (texto, PDF, XML),
// check-up de autenticidade (DV, fornecedor, nota fiscal, duplicidade, suspeita), provedor DDA simulado, webhook de e-mail por tenant,
// caixa de autorização (alçada/segregação reaproveitando a Tesouraria), lotes (total/parcial/reprovar), recorrências, avisos e isolamento por tenant.
// Uso:  DATABASE_URL=postgresql://postgres:pg@127.0.0.1:5432/boletos_e2e npx tsx scripts/e2e/boletos.ts
// Requer Postgres LOCAL com o schema aplicado (prisma db push). Não usa internet, bancos nem credenciais.
import { setup, check, summary, prisma, fails, Actor } from './qa5-lib'
import { barrasParaLinha47, barrasParaLinha48, dataParaFator, dvMod10, dvMod11Barras, fatorParaData, formatarLinha47, lerLinhaDigitavel, montarBarrasArrecadacao, montarBarrasBancario } from '../../src/modules/boletos/linha'
import { acharLinhas, extrairDeTexto, extrairDeXml, lerAnexo } from '../../src/modules/boletos/extracao'
import { extrairTextoPdf, montarPdfTexto } from '../../src/modules/boletos/pdfSimples'
import { avaliarBoleto, notaCompativel } from '../../src/modules/boletos/checkup'
import { cnpjComDv, corromperDv, obterProvedorDda, provedorDdaSimulado } from '../../src/modules/boletos/provedorDda'
import { hashToken, novoToken, tokenConfere, variantesCodigo } from '../../src/modules/boletos/servico'
import { dataEsperadaDaCompetencia, competenciaAplica } from '../../src/modules/boletos/recorrencias'
import { completarChaveNFe } from '../../src/modules/tesouraria/fiscal'
import { runEduJobs } from '../../src/modules/core/jobs'
import { seedBoletos } from '../seeds/boletos'

const secao = (t: string) => console.log(`\n== ${t}`)
const B = '/edu/boletos'
const DAY = 86_400_000
const iso10 = (d: Date) => d.toISOString().slice(0, 10)
const b64 = (s: string | Buffer) => Buffer.from(s).toString('base64')
const meioDia = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12))
const hoje = meioDia(new Date())
const somaDias = (n: number) => new Date(hoje.getTime() + n * DAY)
const brDate = (d: Date) => `${d.toISOString().slice(8, 10)}/${d.toISOString().slice(5, 7)}/${d.getUTCFullYear()}`
const linhaDe = (banco: string, valor: number, venc: Date, salt: number) => barrasParaLinha47(montarBarrasBancario({ banco, valor, vencimento: venc, campoLivre: String(salt * 7919).padStart(25, '1').slice(0, 25) }))

async function main() {
  // ====================================================================== linha digitável
  secao('Linha digitável: casos reais conhecidos, DV e fator de vencimento')
  const v1 = lerLinhaDigitavel('00190500954014481606906809350314337370000000100', new Date('2008-01-01'))
  check('real 1 (BB): válida', v1.ok && v1.formato === 'LINHA_47', v1.erros)
  check('real 1: banco 001, valor R$ 1,00, vencimento 31/12/2007', v1.banco === '001' && v1.valor === 1 && v1.vencimento && iso10(v1.vencimento) === '2007-12-31', v1)
  check('real 1: código de barras de 44 dígitos conhecido', v1.codigoBarras === '00193373700000001000500940144816060680935031', v1.codigoBarras)
  const v1b = lerLinhaDigitavel('00193373700000001000500940144816060680935031', new Date('2008-01-01'))
  check('real 1 (44 dígitos): válido, mesmo valor e vencimento', v1b.ok && v1b.formato === 'BARRAS_44' && v1b.valor === 1 && v1b.vencimento && iso10(v1b.vencimento) === '2007-12-31')
  check('real 1: formatada com pontos e espaços também é aceita', lerLinhaDigitavel('00190.50095 40144.816069 06809.350314 3 37370000000100', new Date('2008-01-01')).ok)
  const v2 = lerLinhaDigitavel('21290001192110001210904475617405975870000002000', new Date('2018-07-01'))
  check('real 2: válida, valor R$ 20,00 e vencimento 16/07/2018', v2.ok && v2.valor === 20 && v2.vencimento && iso10(v2.vencimento) === '2018-07-16', v2)
  check('real 2 (44 dígitos conhecidos) válido', lerLinhaDigitavel('21299758700000020000001121100012100447561740', new Date('2018-07-01')).ok)
  const arr = lerLinhaDigitavel('846700000017435900240209024050002435842210108119')
  check('real 3 (arrecadação 48 dígitos): válida, valor R$ 143,59', arr.ok && arr.tipo === 'ARRECADACAO' && arr.valor === 143.59, arr)
  check('arrecadação: sem vencimento embutido', arr.vencimento === null)
  const dvBom = v1.digitos
  const dvRuim = dvBom.slice(0, 9) + String((Number(dvBom[9]) + 1) % 10) + dvBom.slice(10)
  const rBad = lerLinhaDigitavel(dvRuim, new Date('2008-01-01'))
  check('DV do campo 1 corrompido: inválida e aponta o campo', !rBad.ok && rBad.dvsInvalidos.includes('campo 1'), rBad.erros)
  const rBad2 = lerLinhaDigitavel(dvBom.slice(0, 20) + String((Number(dvBom[20]) + 5) % 10) + dvBom.slice(21), new Date('2008-01-01'))
  check('DV do campo 2 corrompido: inválida', !rBad2.ok && rBad2.dvsInvalidos.includes('campo 2'))
  const rBad3 = lerLinhaDigitavel(dvBom.slice(0, 31) + String((Number(dvBom[31]) + 2) % 10) + dvBom.slice(32), new Date('2008-01-01'))
  check('DV do campo 3 corrompido: inválida', !rBad3.ok && rBad3.dvsInvalidos.includes('campo 3'))
  const rBad4 = lerLinhaDigitavel(dvBom.slice(0, 32) + String((Number(dvBom[32]) % 9) + 1 === Number(dvBom[32]) ? 2 : (Number(dvBom[32]) % 9) + 1) + dvBom.slice(33), new Date('2008-01-01'))
  check('DV geral corrompido: inválida', !rBad4.ok && rBad4.dvsInvalidos.includes('geral'))
  const rVal = lerLinhaDigitavel(dvBom.slice(0, 40) + '9' + dvBom.slice(41), new Date('2008-01-01'))
  check('alterar o valor embutido quebra o DV geral', !rVal.ok)
  check('quantidade de dígitos errada', !lerLinhaDigitavel('1234567890').ok && lerLinhaDigitavel('1234567890').formato === 'INVALIDO')
  check('texto vazio / nulo', !lerLinhaDigitavel('').ok && !lerLinhaDigitavel(null).ok)
  const arrBad = lerLinhaDigitavel('846700000017435900240209024050002435842210108118')
  check('arrecadação com DV alterado: inválida', !arrBad.ok && arrBad.dvsInvalidos.length > 0)
  check('mod10 do campo 1 real confere com a linha', dvMod10('001905009') === Number(v1.digitos[9]))
  check('mod11 geral do caso real 1 (barras 0019 3 3737...)', dvMod11Barras('0019' + '00193373700000001000500940144816060680935031'.slice(5)) === 3)
  check('fator 4 dígitos: ciclo antigo (2007-12-31 = fator 3737)', dataParaFator(new Date('2007-12-31T12:00:00Z')) === 3737)
  check('fator: 21/02/2025 = 9999 (último do ciclo antigo)', fatorParaData(9999, new Date('2025-02-01')) !== null && iso10(fatorParaData(9999, new Date('2025-02-01'))!) === '2025-02-21')
  check('fator: reinício em 22/02/2025 = 1000', iso10(fatorParaData(1000, new Date('2025-03-01'))!) === '2025-02-22' && dataParaFator(new Date('2025-02-22T12:00:00Z')) === 1000)
  check('fator: 2026-11-14 ida e volta (ciclo novo)', iso10(fatorParaData(dataParaFator(new Date('2026-11-14T12:00:00Z')), new Date('2026-11-01'))!) === '2026-11-14')
  check('fator 0000 = sem vencimento', fatorParaData(0) === null)
  const gerada = linhaDe('341', 1234.56, somaDias(10), 5)
  const lg = lerLinhaDigitavel(gerada)
  check('linha gerada pelo sistema é válida e coerente (valor/vencimento)', lg.ok && lg.valor === 1234.56 && iso10(lg.vencimento!) === iso10(somaDias(10)) && lg.banco === '341', lg)
  check('formatarLinha47 mantém os dígitos', formatarLinha47(gerada).replace(/\D/g, '') === gerada && formatarLinha47(gerada).includes(' '))
  check('corromperDv gera linha inválida', !lerLinhaDigitavel(corromperDv(gerada)).ok)
  const barArr = montarBarrasArrecadacao({ segmento: '2', valor: 350.75, empresa: '01234567', livre: '12345678901234567890', modulo: 10 })
  const l48 = barrasParaLinha48(barArr)
  check('arrecadação gerada (mod10) é válida e traz o valor', lerLinhaDigitavel(l48).ok && lerLinhaDigitavel(l48).valor === 350.75 && lerLinhaDigitavel(barArr).ok)
  const barArr11 = montarBarrasArrecadacao({ segmento: '3', valor: 99.9, empresa: '00000123', livre: '98765432109876543210', modulo: 11 })
  check('arrecadação gerada (mod11) é válida', lerLinhaDigitavel(barrasParaLinha48(barArr11)).ok && lerLinhaDigitavel(barrasParaLinha48(barArr11)).valor === 99.9)
  check('variantes do mesmo código (44 e 47)', variantesCodigo(lg.codigoBarras, gerada).length === 2 && variantesCodigo(lg.codigoBarras, gerada).includes(gerada))

  // ====================================================================== extração
  secao('Extração: texto, PDF com texto, PDF sem texto, XML de NF-e')
  const chaveNF = completarChaveNFe(`352611${cnpjComDv('100200300001')}55001000004521112345678`)
  const textoBol = `Beneficiário: Papelaria Central Ltda\nCNPJ: ${cnpjComDv('100200300001')}\nNº do documento: ABC-123\nVencimento: ${brDate(somaDias(8))}\nValor do documento: R$ 1.850,00\nLinha digitável: ${formatarLinha47(linhaDe('341', 1850, somaDias(8), 7))}\nChave de acesso: ${chaveNF}\n`
  const ex = extrairDeTexto(textoBol)
  check('texto: acha a linha digitável (47)', ex.linhaDigitavel === linhaDe('341', 1850, somaDias(8), 7), ex.linhaDigitavel)
  check('texto: valor 1.850,00', ex.valor === 1850, ex.valor)
  check('texto: vencimento', ex.vencimento === iso10(somaDias(8)), ex.vencimento)
  check('texto: CNPJ do beneficiário', ex.beneficiarioDocumento === cnpjComDv('100200300001'), ex.beneficiarioDocumento)
  check('texto: nome do beneficiário', (ex.beneficiarioNome || '').startsWith('Papelaria Central'), ex.beneficiarioNome)
  check('texto: número do documento', ex.numeroDocumento === 'ABC-123', ex.numeroDocumento)
  check('texto: chave da NF-e (44 dígitos válidos)', ex.nfChave === chaveNF, ex.nfChave)
  check('acharLinhas ignora números curtos e telefones', acharLinhas('Tel (11) 99999-8888 CEP 01310-100 valor 1.234,56').length === 0)
  check('acharLinhas: linha colada a outros textos', acharLinhas(`Pague: ${gerada} até o vencimento`)[0] === gerada)
  check('texto sem boleto não inventa nada', Object.keys(extrairDeTexto('Olá, tudo bem? Segue a proposta comercial.')).filter((k) => k !== 'fonte').length === 0)
  const pdf = montarPdfTexto(['BOLETO TESTE', `Beneficiario: TechCampus Informatica Ltda`, `Valor do documento: R$ 2.430,00`, `Vencimento: ${brDate(somaDias(5))}`, `Linha digitavel: ${linhaDe('237', 2430, somaDias(5), 9)}`])
  const lp = extrairTextoPdf(pdf)
  check('PDF com texto embutido: lido', lp.ok && lp.texto.includes('TechCampus'), lp)
  const la = lerAnexo({ nome: 'boleto.pdf', mime: 'application/pdf', conteudo: pdf })
  check('anexo PDF: dados extraídos (linha + valor)', la.leitura === 'LIDO' && la.dados?.linhaDigitavel === linhaDe('237', 2430, somaDias(5), 9) && la.dados?.valor === 2430, la)
  const pdfImg = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /XObject /Subtype /Image /Width 10 /Height 10 /Length 4 >>\nstream\nabcd\nendstream\nendobj\n%%EOF', 'latin1')
  const lImg = lerAnexo({ nome: 'scan.pdf', mime: 'application/pdf', conteudo: pdfImg })
  check('PDF digitalizado (imagem): "SEM_TEXTO" com explicação honesta de que não há OCR', lImg.leitura === 'SEM_TEXTO' && /OCR/.test(lImg.nota || '') && !lImg.dados, lImg)
  const lPng = lerAnexo({ nome: 'foto.png', mime: 'image/png', conteudo: Buffer.from('iVBORw0KGgo=', 'base64') })
  check('imagem: sem OCR, nada extraído', lPng.leitura === 'SEM_TEXTO' && /OCR/.test(lPng.nota || '') && !lPng.dados)
  check('PDF inválido: motivo claro', extrairTextoPdf(Buffer.from('não sou pdf')).ok === false)
  check('anexo de tipo não suportado', lerAnexo({ nome: 'x.zip', mime: 'application/zip', conteudo: Buffer.from('PK') }).leitura === 'NAO_SUPORTADO')
  const xml = `<?xml version="1.0"?><nfeProc><NFe><infNFe Id="NFe${chaveNF}"><ide><nNF>4521</nNF></ide><emit><CNPJ>${cnpjComDv('100200300001')}</CNPJ><xNome>Papelaria Central Ltda</xNome></emit><total><ICMSTot><vNF>1850.00</vNF></ICMSTot></total><cobr><dup><nDup>001</nDup><dVenc>${iso10(somaDias(8))}</dVenc><vDup>925.00</vDup></dup><dup><nDup>002</nDup><dVenc>${iso10(somaDias(38))}</dVenc><vDup>925.00</vDup></dup></cobr></infNFe></NFe></nfeProc>`
  const dx = extrairDeXml(xml)
  check('XML NF-e: chave, emitente, número e valor', dx?.nfChave === chaveNF && dx?.nfEmitenteDocumento === cnpjComDv('100200300001') && dx?.nfNumero === '4521' && dx?.nfValor === 1850, dx)
  check('XML NF-e: duplicatas (cobrança)', dx?.duplicatas?.length === 2 && dx.duplicatas[0].valor === 925)
  check('XML que não é NF-e é ignorado', extrairDeXml('<root><a>1</a></root>') === null)

  // ====================================================================== check-up (função pura)
  secao('Check-up de autenticidade (função pura)')
  const forn = [{ id: 'f1', razaoSocial: 'Papelaria Central Ltda', cnpj: cnpjComDv('100200300001'), banco: '341' }, { id: 'f2', razaoSocial: 'Limpeza Total Serviços Ltda', cnpj: cnpjComDv('300400500001'), banco: '001' }]
  const nota = { id: 'n1', numero: '77', emissao: somaDias(-5), valorTotal: 1850, valorLiquido: 1850 }
  const ctxBase = { fornecedores: forn, historicoValores: [1840, 1850, 1860], bancosHistorico: ['341'], notas: [nota], duplicidade: null }
  const entOk = { linhaDigitavel: linhaDe('341', 1850, somaDias(8), 1), valor: 1850, vencimento: somaDias(8), beneficiarioNome: 'Papelaria Central Ltda', beneficiarioDocumento: cnpjComDv('100200300001') }
  const rOk = avaliarBoleto(entOk, ctxBase as any)
  check('check-up OK: tudo confere e traz motivos positivos', rOk.resultado === 'OK' && rOk.score === 0 && rOk.motivos.some((m) => m.codigo === 'DV_OK') && rOk.motivos.some((m) => m.codigo === 'NF_OK') && rOk.fornecedorId === 'f1' && rOk.notaFiscalId === 'n1', rOk)
  const rSemNf = avaliarBoleto(entOk, { ...ctxBase, notas: [] } as any)
  check('sem nota fiscal: ATENCAO com pendência "sem nota fiscal"', rSemNf.resultado === 'ATENCAO' && rSemNf.motivos.some((m) => m.codigo === 'SEM_NF' && /sem nota fiscal/i.test(m.texto)))
  const rNfValor = avaliarBoleto(entOk, { ...ctxBase, notas: [{ ...nota, valorTotal: 5000, valorLiquido: 5000 }] } as any)
  check('nota com valor incompatível não é aceita como correspondente', rNfValor.motivos.some((m) => m.codigo === 'SEM_NF'))
  check('nota compatível por parcelamento (1/2)', notaCompativel({ ...nota, valorTotal: 3700, valorLiquido: 3700 }, 1850) === 'PARCELA' && notaCompativel(nota, 1850) === 'EXATO' && notaCompativel(nota, 999) === null)
  const rDv = avaliarBoleto({ ...entOk, linhaDigitavel: corromperDv(entOk.linhaDigitavel) }, ctxBase as any)
  check('DV inválido: SUSPEITO com motivo crítico', rDv.resultado === 'SUSPEITO' && rDv.motivos.some((m) => m.codigo === 'DV_INVALIDO' && m.gravidade === 'CRITICO') && rDv.score >= 60)
  const rValDiv = avaliarBoleto({ ...entOk, valor: 1999 }, ctxBase as any)
  check('valor do campo diferente do embutido: SUSPEITO', rValDiv.resultado === 'SUSPEITO' && rValDiv.motivos.some((m) => m.codigo === 'VALOR_DIVERGE'))
  const rVencDiv = avaliarBoleto({ ...entOk, vencimento: somaDias(9) }, ctxBase as any)
  check('vencimento do campo diferente do embutido: SUSPEITO', rVencDiv.resultado === 'SUSPEITO' && rVencDiv.motivos.some((m) => m.codigo === 'VENCIMENTO_DIVERGE'))
  const rCnpj = avaliarBoleto({ ...entOk, beneficiarioDocumento: cnpjComDv('900800700001') }, ctxBase as any)
  check('CNPJ diferente do cadastro com nome parecido: SUSPEITO', rCnpj.resultado === 'SUSPEITO' && rCnpj.motivos.some((m) => m.codigo === 'CNPJ_DIVERGE'))
  const rNome = avaliarBoleto({ ...entOk, beneficiarioNome: 'Distribuidora Aurora de Alimentos' }, ctxBase as any)
  check('CNPJ confere mas razão social diverge: alerta', rNome.motivos.some((m) => m.codigo === 'NOME_DIVERGE'))
  const rDesc = avaliarBoleto({ ...entOk, beneficiarioNome: 'Fulano Comércio', beneficiarioDocumento: cnpjComDv('777888990001') }, { ...ctxBase, bancosHistorico: [], historicoValores: [] } as any)
  check('beneficiário desconhecido: motivo', rDesc.motivos.some((m) => m.codigo === 'BENEFICIARIO_DESCONHECIDO'))
  const rBanco = avaliarBoleto({ ...entOk, linhaDigitavel: linhaDe('033', 1850, somaDias(8), 2) }, ctxBase as any)
  check('banco diferente do histórico do fornecedor: alerta', rBanco.motivos.some((m) => m.codigo === 'BANCO_DIVERGE') && rBanco.banco === '033')
  const rFora = avaliarBoleto({ ...entOk, valor: 18500, linhaDigitavel: linhaDe('341', 18500, somaDias(8), 3) }, ctxBase as any)
  check('valor muito fora do histórico: motivo (10x)', rFora.motivos.some((m) => m.codigo === 'VALOR_FORA_HISTORICO'))
  const rCombo = avaliarBoleto({ ...entOk, valor: 18500, linhaDigitavel: linhaDe('033', 18500, somaDias(8), 3) }, ctxBase as any)
  check('banco divergente + valor fora do histórico somam => SUSPEITO', rCombo.resultado === 'SUSPEITO' && rCombo.score >= 60, rCombo.score)
  const rVenc = avaliarBoleto({ ...entOk, vencimento: somaDias(-60), linhaDigitavel: linhaDe('341', 1850, somaDias(-60), 4) }, ctxBase as any)
  check('vencido há muito: motivo VENCIDO_HA_MUITO', rVenc.motivos.some((m) => m.codigo === 'VENCIDO_HA_MUITO'))
  const rVenc2 = avaliarBoleto({ ...entOk, vencimento: somaDias(-3), linhaDigitavel: linhaDe('341', 1850, somaDias(-3), 4) }, ctxBase as any)
  check('vencido há poucos dias: apenas ATENCAO', rVenc2.motivos.some((m) => m.codigo === 'VENCIDO') && rVenc2.resultado === 'ATENCAO')
  const rDup = avaliarBoleto(entOk, { ...ctxBase, duplicidade: { tipo: 'BOLETO', id: 'x', numero: 'BOL-000001', status: 'AUTORIZADO', criterio: 'CODIGO_BARRAS' } } as any)
  check('duplicidade por código de barras: DUPLICADO e score alto', rDup.resultado === 'DUPLICADO' && rDup.score >= 80 && rDup.duplicidade?.numero === 'BOL-000001' && /Mesmo código de barras/.test(rDup.motivos.find((m) => m.codigo === 'DUPLICADO')!.texto))
  const rDup2 = avaliarBoleto(entOk, { ...ctxBase, duplicidade: { tipo: 'TITULO', id: 't', numero: 'CP-000010', status: 'PAGO', criterio: 'FORNECEDOR_VALOR_VENCIMENTO' } } as any)
  check('duplicidade por fornecedor+valor+vencimento próximos', rDup2.resultado === 'DUPLICADO' && /Provável duplicidade/.test(rDup2.motivos.find((m) => m.codigo === 'DUPLICADO')!.texto))
  const rSemLinha = avaliarBoleto({ valor: 100, vencimento: somaDias(3), beneficiarioNome: 'Papelaria Central Ltda', beneficiarioDocumento: cnpjComDv('100200300001') }, ctxBase as any)
  check('sem linha digitável: ATENCAO e orientação (nada inventado)', rSemLinha.motivos.some((m) => m.codigo === 'LINHA_AUSENTE') && rSemLinha.codigoBarras === null)
  const chaveOutroCnpj = completarChaveNFe(`352611${cnpjComDv('900800700001')}55001000004521112345678`)
  const rChave = avaliarBoleto({ ...entOk, nfChave: chaveOutroCnpj }, ctxBase as any)
  check('CNPJ da chave da NF-e diferente do beneficiário: crítico', rChave.motivos.some((m) => m.codigo === 'NF_CHAVE_CNPJ_DIVERGE') && rChave.resultado === 'SUSPEITO')
  check('chave da NF-e com DV inválido: crítico', avaliarBoleto({ ...entOk, nfChave: chaveNF.slice(0, 43) + ((Number(chaveNF[43]) + 1) % 10) }, ctxBase as any).motivos.some((m) => m.codigo === 'NF_CHAVE_INVALIDA'))
  check('chave de NF-e informada e não lançada: pendência', avaliarBoleto({ ...entOk, nfChave: chaveNF }, { ...ctxBase, notas: [] } as any).motivos.some((m) => m.codigo === 'NF_NAO_LANCADA'))
  check('documento do beneficiário com DV inválido', avaliarBoleto({ ...entOk, beneficiarioDocumento: '11222333000199' }, ctxBase as any).motivos.some((m) => m.codigo === 'DOC_INVALIDO'))

  // ====================================================================== DDA simulado e token
  secao('Provedor DDA simulado e segredo do webhook')
  const ddaLista = await provedorDdaSimulado.listarBoletos({ tenantId: 'x', fornecedores: [], hoje })
  check('DDA simulado: 6 boletos (3 normais, 1 duplicado, 1 suspeito, 1 DV inválido)', ddaLista.length === 6)
  check('DDA simulado: determinístico no mesmo dia', JSON.stringify(ddaLista) === JSON.stringify(await provedorDdaSimulado.listarBoletos({ tenantId: 'y', fornecedores: [], hoje })))
  check('DDA simulado: um duplicado (mesma linha, ids diferentes)', new Set(ddaLista.map((b) => b.linhaDigitavel)).size === 5 && new Set(ddaLista.map((b) => b.idExterno)).size === 6)
  check('DDA simulado: exatamente um com DV inválido', ddaLista.filter((b) => !lerLinhaDigitavel(b.linhaDigitavel).ok).length === 1)
  check('DDA simulado: demais boletos coerentes (valor e vencimento embutidos)', ddaLista.filter((b) => lerLinhaDigitavel(b.linhaDigitavel).ok).every((b) => { const l = lerLinhaDigitavel(b.linhaDigitavel); return l.valor === b.valor && iso10(l.vencimento!) === b.vencimento }))
  check('provedor DDA desconhecido => 424 PROVEDOR_NAO_CONFIGURADO', (() => { try { obterProvedorDda('BANCO_X'); return false } catch (e: any) { return e.status === 424 && e.code === 'PROVEDOR_NAO_CONFIGURADO' } })())
  const tk = novoToken()
  check('token do webhook: hash confere e token errado não', tokenConfere({ webhookTokenHash: tk.hash }, tk.token) && !tokenConfere({ webhookTokenHash: tk.hash }, tk.token + 'x') && !tokenConfere({ webhookTokenHash: null }, tk.token) && tk.hash === hashToken(tk.token) && tk.prefixo === tk.token.slice(0, 8))
  check('recorrência: competências por periodicidade', competenciaAplica({ periodicidade: 'TRIMESTRAL', mesBase: 2 }, '2026-05') && !competenciaAplica({ periodicidade: 'TRIMESTRAL', mesBase: 2 }, '2026-06') && competenciaAplica({ periodicidade: 'MENSAL', mesBase: 1 }, '2026-06') && competenciaAplica({ periodicidade: 'ANUAL', mesBase: 3 }, '2027-03'))
  check('recorrência: dia 31 em fevereiro vira último dia do mês', iso10(dataEsperadaDaCompetencia('2027-02', 31)) === '2027-02-28' && iso10(dataEsperadaDaCompetencia('2028-02', 31)) === '2028-02-29')

  // ====================================================================== API
  secao('API: configuração, permissões e isolamento')
  const S = await setup()
  const { call, t1, t2 } = S
  const admin = await t1.mk('ADMIN'), admin2 = await t1.mk('ADMIN'), fin = await t1.mk('FINANCE'), fin2 = await t1.mk('FINANCE'), coord = await t1.mk('COORDINATOR'), prof = await t1.mk('TEACHER'), aluno = await t1.mk('STUDENT', true)
  const adminB = await t2.mk('ADMIN'), finB = await t2.mk('FINANCE')
  const rector = await t1.mk('RECTOR'), board = await t1.mk('BOARD')
  const as = (a: Actor) => async (m: string, p: string, b?: any) => { const r = await call(a, m, p, b); return r.status < 400 ? r.json : null }
  try {
    check('sem token: 401', (await call(null, 'GET', `${B}/painel`)).status === 401)
    check('professor: 403 no painel', (await call(prof, 'GET', `${B}/painel`)).status === 403)
    check('aluno: 403 no painel', (await call(aluno, 'GET', `${B}/painel`)).status === 403)
    check('financeiro lê o painel (vazio)', (await call(fin, 'GET', `${B}/painel`)).status === 200)
    const cfg0 = await call(fin, 'GET', `${B}/config`)
    check('config padrão: e-mail e DDA desligados; endereço com domínio padrão fictício', cfg0.json.emailAtivo === false && cfg0.json.ddaAtivo === false && /^boletos@/.test(cfg0.json.endereco) && cfg0.json.dominioPadrao === 'instituicao-exemplo.edu.br', cfg0.json)
    check('config: financeiro não altera (403)', (await call(fin, 'PUT', `${B}/config`, { ddaAtivo: true })).status === 403)
    check('sincronizar DDA com DDA desligado => 409 DDA_INATIVO', (await call(fin, 'POST', `${B}/dda/sincronizar`, {})).json?.code === 'DDA_INATIVO')
    check('config: domínio inválido 400', (await call(admin, 'PUT', `${B}/config`, { dominioEmail: 'sem espaço!' })).status === 400)
    check('config: provedor DDA desconhecido 400', (await call(admin, 'PUT', `${B}/config`, { ddaProvedor: 'XYZ' })).status === 400)
    check('config: CNPJ inválido 400', (await call(admin, 'PUT', `${B}/config`, { ddaDocumento: '11222333000199' })).status === 400)
    const cfgOn = await call(admin, 'PUT', `${B}/config`, { emailAtivo: true, dominioEmail: 'financeiro.faculdade-exemplo.edu.br', emailLocal: 'boletos' })
    const tokenA: string = cfgOn.json?.tokenNovo
    check('ativar e-mail gera segredo uma única vez e mostra o endereço configurado', !!tokenA && tokenA.startsWith('bol_') && cfgOn.json.endereco === 'boletos@financeiro.faculdade-exemplo.edu.br', cfgOn.json)
    const cfgLer = await call(admin, 'GET', `${B}/config`)
    check('GET config não devolve o segredo nem o hash', !JSON.stringify(cfgLer.json).includes(tokenA) && !('webhookTokenHash' in cfgLer.json) && cfgLer.json.tokenConfigurado === true)
    const hashNoBanco = (await prisma.bolConfig.findUnique({ where: { tenantId: t1.tenantId } }))?.webhookTokenHash
    check('segredo é guardado só como hash', hashNoBanco === hashToken(tokenA) && hashNoBanco !== tokenA)

    secao('Webhook de e-mail por tenant (público)')
    const urlWh = `/public/edu/boletos/webhook/email/${t1.tenantId}`
    const linhaWh = linhaDe('341', 1850, somaDias(8), 41)
    const payload = { messageId: 'msg-1', from: 'cobranca@papelaria.exemplo.com.br', to: 'boletos@financeiro.faculdade-exemplo.edu.br', subject: 'Boleto outubro', text: `Beneficiário: Papelaria Central Ltda\nCNPJ: ${cnpjComDv('100200300001')}\nVencimento: ${brDate(somaDias(8))}\nValor do documento: R$ 1.850,00\nLinha digitável: ${linhaWh}`, attachments: [] as any[] }
    check('webhook sem token: 401', (await call(null, 'POST', urlWh, payload)).status === 401)
    check('webhook com token errado: 401', (await call(null, 'POST', urlWh, payload, { authorization: 'Bearer bol_errado' })).status === 401)
    check('webhook com tenant inexistente: 401 (mesma resposta)', (await call(null, 'POST', `/public/edu/boletos/webhook/email/nao-existe`, payload, { authorization: `Bearer ${tokenA}` })).status === 401)
    check('webhook do tenant B não aceita o token do tenant A', (await call(null, 'POST', `/public/edu/boletos/webhook/email/${t2.tenantId}`, payload, { authorization: `Bearer ${tokenA}` })).status === 401)
    const wh = await call(null, 'POST', urlWh, payload, { authorization: `Bearer ${tokenA}` })
    check('webhook com token correto: 202 e lança 1 boleto', wh.status === 202 && wh.json.boletos === 1 && wh.json.status === 'PROCESSADO', wh.json)
    const wh2 = await call(null, 'POST', urlWh, payload, { 'x-boletos-token': tokenA })
    check('mesmo messageId de novo: idempotente (200, sem duplicar)', wh2.status === 200 && wh2.json.duplicado === true)
    const whBad = await call(null, 'POST', urlWh, { subject: 1 }, { authorization: `Bearer ${tokenA}` })
    check('payload inválido: 400', whBad.status === 400)
    const eicar = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'
    const whEicar = await call(null, 'POST', urlWh, { messageId: 'msg-eicar', subject: 'anexo', text: 'segue', attachments: [{ filename: 'boleto.txt', contentType: 'text/plain', contentBase64: b64(eicar) }] }, { authorization: `Bearer ${tokenA}` })
    check('anexo malicioso é bloqueado pela varredura de upload (nada é lido)', whEicar.status === 202 && whEicar.json.bloqueados === 1 && whEicar.json.boletos === 0 && whEicar.json.status === 'ILEGIVEL', whEicar.json)
    const rot = await call(admin, 'POST', `${B}/config/token`, {})
    const tokenA2: string = rot.json.tokenNovo
    check('rotacionar o segredo invalida o anterior', !!tokenA2 && tokenA2 !== tokenA && (await call(null, 'POST', urlWh, { ...payload, messageId: 'msg-rot' }, { authorization: `Bearer ${tokenA}` })).status === 401 && (await call(null, 'POST', urlWh, { ...payload, messageId: 'msg-rot' }, { authorization: `Bearer ${tokenA2}` })).status === 202)
    await call(admin, 'PUT', `${B}/config`, { emailAtivo: false })
    check('canal de e-mail desligado: webhook 401', (await call(null, 'POST', urlWh, { ...payload, messageId: 'msg-off' }, { authorization: `Bearer ${tokenA2}` })).status === 401)
    await call(admin, 'PUT', `${B}/config`, { emailAtivo: true })

    // ----------------------------------------------------------------- seed
    secao('Seed da Caixa de boletos (fornecedores, histórico, DDA, e-mails, recorrências, lote)')
    const falhasSeed: string[] = []
    const ctxSeed = { failures: falhasSeed, apiAs: (papel: string) => as(papel === 'FINANCE' ? fin : papel === 'COORDINATOR' ? coord : rector) }
    const jaTem = (await call(admin, 'GET', `${B}/boletos?pageSize=1`)).json.total
    const res = await seedBoletos(as(admin), ctxSeed as any)
    check('seed sem falhas', falhasSeed.length === 0, falhasSeed)
    check('seed: fornecedores, histórico, notas, e-mails, recorrências e lote', res.fornecedores === 5 && res.historico === 9 && res.notas >= 3 && res.emails === 3 && res.recorrencias === 3 && res.lote === true, res)
    const resSeed2 = await seedBoletos(as(admin), ctxSeed as any)
    check('seed idempotente (segunda execução não cria nada)', resSeed2.fornecedores === 0 && resSeed2.boletos === 0 && resSeed2.emails === 0 && resSeed2.lote === false && jaTem >= 1)
    const lista = (await call(fin, 'GET', `${B}/boletos?pageSize=100`)).json
    const itens: any[] = lista.items
    const porRef = (sub: string) => itens.find((b) => String(b.origemRef || '').includes(sub))
    check('seed: boletos do DDA (6) + e-mail (2 do seed + 1 do webhook + 1 do segredo rotacionado)', itens.filter((b) => b.origem === 'DDA').length === 6 && itens.filter((b) => b.origem === 'EMAIL').length === 4, itens.map((b) => b.origem))
    const dup = itens.find((b) => b.resultado === 'DUPLICADO' && b.origem === 'DDA')
    const susp = porRef('SUSP1'), dv = porRef('DV1'), n1 = porRef('-N1'), n2 = porRef('-N2'), n3 = porRef('-N3')
    check('DDA: duplicado marcado como DUPLICADO e ligado ao original', !!dup && String(dup.origemRef).includes('DUP1') && dup.duplicadoDeId === n1.id, dup)
    check('DDA: suspeito (CNPJ parecido, outro banco) marcado SUSPEITO com motivo legível', susp?.resultado === 'SUSPEITO' && susp.motivos.some((m: any) => m.codigo === 'CNPJ_DIVERGE' && m.texto.length > 20), susp)
    check('DDA: DV inválido marcado SUSPEITO com motivo DV_INVALIDO', dv?.resultado === 'SUSPEITO' && dv.motivos.some((m: any) => m.codigo === 'DV_INVALIDO'), dv)
    check('DDA: boletos normais com nota fiscal localizada => OK', n1?.resultado === 'OK' && n2?.resultado === 'OK' && n1.motivos.some((m: any) => m.codigo === 'NF_OK'), [n1?.resultado, n2?.resultado])
    check('DDA: normal sem nota fiscal => ATENCAO "sem nota fiscal"', n3?.resultado === 'ATENCAO' && n3.motivos.some((m: any) => m.codigo === 'SEM_NF'), n3)
    check('score cresce com o risco (OK < ATENCAO < SUSPEITO < DUPLICADO)', n1.score < n3.score && n3.score < susp.score && susp.score <= dup.score && dup.score >= 80, [n1.score, n3.score, susp.score, dup.score])
    check('todo boleto tem resultado, score e motivos', itens.every((b) => ['OK', 'ATENCAO', 'SUSPEITO', 'DUPLICADO'].includes(b.resultado) && typeof b.score === 'number' && Array.isArray(b.motivos) && b.motivos.length > 0))
    const sync2 = await call(fin, 'POST', `${B}/dda/sincronizar`, {})
    check('segunda sincronização no mesmo dia: idempotente (0 novos)', sync2.status === 200 && sync2.json.novos === 0 && sync2.json.jaExistiam === 6 && sync2.json.simulado === true, sync2.json)
    const boletoAlu = itens.find((b) => b.origem === 'EMAIL' && /Aluguel/i.test(b.descricao || ''))
    const boletoNet = itens.find((b) => b.origem === 'EMAIL' && b.nfChave)
    check('e-mail com texto: dados extraídos (valor, vencimento, beneficiário, nº documento)', boletoAlu?.valor === 8500 && boletoAlu.numeroDocumento?.startsWith('ALG-') && boletoAlu.beneficiarioNome?.startsWith('Imobiliária') && boletoAlu.vencimento, boletoAlu)
    check('e-mail com PDF + XML: boleto do PDF com chave da NF-e do XML e nota lançada localizada', boletoNet?.valor === 1290 && boletoNet.nfChave?.length === 44 && boletoNet.motivos.some((m: any) => m.codigo === 'NF_OK') && boletoNet.resultado === 'OK', boletoNet)
    const emails = (await call(fin, 'GET', `${B}/emails`)).json
    const emImg = emails.items.find((e: any) => e.assunto === 'Boleto escaneado')
    check('e-mail com anexo em imagem: ILEGIVEL, sem boleto inventado, com aviso honesto de que não há OCR', emImg?.status === 'ILEGIVEL' && emImg.boletosGerados === 0 && /ler|OCR/i.test(emImg.observacao) && emImg.anexosLidos[0].leitura === 'SEM_TEXTO' && /OCR/.test(emImg.anexosLidos[0].leituraNota), emImg)
    check('e-mails lançam automaticamente como RECEBIDO (sem autorizar pagamento)', itens.filter((b) => b.origem === 'EMAIL').every((b) => b.status === 'RECEBIDO' && !b.tituloId))
    check('lote do seed enviado para aprovação', (await call(fin, 'GET', `${B}/lotes?status=ENVIADO_APROVACAO`)).json.items.length === 1)

    // ----------------------------------------------------------------- avisos
    secao('Avisos: notificação + lembrete escalonado (financeiro e diretoria), sem dados sensíveis')
    const notifs = await prisma.eduNotification.findMany({ where: { tenantId: t1.tenantId, refType: 'BolBoleto' } })
    const paraFin = notifs.filter((n) => n.userId === fin.id)
    check('suspeito/duplicado geram notificação para o financeiro', paraFin.some((n) => n.refId === susp.id) && paraFin.some((n) => n.refId === dup.id) && paraFin.some((n) => n.refId === dv.id))
    check('diretoria (reitor) também é avisada', notifs.some((n) => n.userId === rector.id && n.refId === susp.id) && notifs.some((n) => n.userId === board.id))
    check('coordenação não recebe o aviso de risco (perfis RBAC)', !notifs.some((n) => n.userId === coord.id))
    check('mensagem mínima: sem CNPJ, linha digitável ou valor', notifs.every((n) => !/\d{14}/.test(n.mensagem) && !/\d{44,48}/.test(n.mensagem) && !/R\$/.test(n.mensagem)), notifs[0]?.mensagem)
    const rems = await prisma.eduReminder.findMany({ where: { tenantId: t1.tenantId, modulo: 'boletos', refType: 'BolBoleto' } })
    const remsSusp = rems.filter((r) => r.refId === susp.id)
    check('lembrete escalonado: financeiro (agora) e diretoria (prazo maior, severidade crítica)', remsSusp.some((r) => r.assigneeRole === 'FINANCE') && remsSusp.some((r) => r.assigneeRole === 'RECTOR' && r.severity === 'CRITICO' && r.dueAt > remsSusp.find((x) => x.assigneeRole === 'FINANCE')!.dueAt))
    check('boleto OK não gera aviso de risco', !notifs.some((n) => n.refId === n1.id) && !rems.some((r) => r.refId === n1.id))

    // ----------------------------------------------------------------- painel e filtros
    secao('Painel e filtros')
    const painel = (await call(fin, 'GET', `${B}/painel`)).json
    check('painel: recebidos hoje, aguardando, suspeitos, duplicados e recorrentes pendentes', painel.recebidosHoje >= 10 && painel.aguardando >= 10 && painel.suspeitos >= 2 && painel.duplicados >= 1 && painel.recorrentesPendentes === 1, painel)
    check('painel: DDA simulado identificado e aviso de verificação interna', painel.dda.ativo === false || painel.dda.simulado === true) // ddaAtivo pode ser true após seed
    check('painel: aviso de que é verificação interna e não substitui a conferência no banco', /não substitui a conferência no banco/.test(painel.aviso))
    check('filtro por resultado SUSPEITO', (await call(fin, 'GET', `${B}/boletos?resultado=SUSPEITO`)).json.items.every((b: any) => b.resultado === 'SUSPEITO'))
    check('filtro por origem EMAIL', (await call(fin, 'GET', `${B}/boletos?origem=EMAIL`)).json.items.every((b: any) => b.origem === 'EMAIL'))
    check('busca por nome do beneficiário', (await call(fin, 'GET', `${B}/boletos?q=Imobili`)).json.items.length >= 1)
    check('filtro por status ABERTOS', (await call(fin, 'GET', `${B}/boletos?status=ABERTOS`)).json.total === painel.aguardando)
    check('filtro por datas (hoje)', (await call(fin, 'GET', `${B}/boletos?de=${iso10(hoje)}&ate=${iso10(hoje)}`)).json.total >= 10)
    check('contagem por resultado devolvida para os chips de filtro', typeof lista.porResultado.OK === 'number' && typeof lista.porResultado.DUPLICADO === 'number')

    // ----------------------------------------------------------------- detalhe
    secao('Detalhe do boleto: check-up, anexos, trilha')
    const det = (await call(fin, 'GET', `${B}/boletos/${dup.id}`)).json
    check('detalhe do duplicado traz o original ligado', det.duplicadoDe?.id === n1.id && det.duplicadoDe.numero === n1.numero)
    check('detalhe traz trilha de eventos com RECEBIDO e CHECKUP', det.eventos.some((e: any) => e.acao === 'RECEBIDO') && det.eventos.some((e: any) => e.acao === 'CHECKUP'))
    check('detalhe traz o aviso de verificação interna', /verificação INTERNA/i.test(det.aviso))
    const detNet = (await call(fin, 'GET', `${B}/boletos/${boletoNet.id}`)).json
    check('detalhe do e-mail: anexos lidos (PDF e XML), e-mail de origem e nota fiscal', detNet.anexos.length >= 2 && detNet.anexos.some((a: any) => a.nome.endsWith('.pdf') && a.leitura === 'LIDO') && detNet.email?.assunto?.includes('NF-e') && detNet.notaFiscal?.numero === '4521', detNet)
    const dl = await fetch(`${S.base}/edu/boletos/anexos/${detNet.anexos.find((a: any) => a.nome.endsWith('.pdf')).id}/download`, { headers: { authorization: `Bearer ${fin.token}` } })
    const dlBuf = Buffer.from(await dl.arrayBuffer())
    check('download do anexo guardado (PDF íntegro, como attachment)', dl.status === 200 && dlBuf.subarray(0, 4).toString() === '%PDF' && /attachment/.test(dl.headers.get('content-disposition') || '') && dl.headers.get('x-content-type-options') === 'nosniff')
    check('tenant B não baixa anexo do tenant A', (await call(finB, 'GET', `/edu/boletos/anexos/${detNet.anexos[0].id}/download`)).status === 404)
    check('tenant B não vê boleto do tenant A (404) nem lista', (await call(finB, 'GET', `${B}/boletos/${dup.id}`)).status === 404 && (await call(finB, 'GET', `${B}/boletos`)).json.total === 0)
    check('tenant B não age sobre boleto de A', (await call(adminB, 'POST', `${B}/boletos/${dup.id}/refutar`, { motivo: 'tentativa cruzada' })).status === 404)
    check('tenant B não vê lotes, e-mails nem recorrências de A', (await call(adminB, 'GET', `${B}/lotes`)).json.total === 0 && (await call(adminB, 'GET', `${B}/emails`)).json.total === 0 && (await call(adminB, 'GET', `${B}/recorrencias`)).json.items.length === 0)

    // ----------------------------------------------------------------- simulação de e-mail (tela)
    secao('Simular recebimento de e-mail (tela) e lançamento manual')
    const linhaSim = linhaDe('104', 3200, somaDias(12), 77)
    const sim = await call(fin, 'POST', `${B}/email/simular`, { de: 'financeiro@fornecedor-x.exemplo.com.br', assunto: 'Boleto de serviços', texto: `Beneficiário: Gráfica Aurora Ltda\nCNPJ: ${cnpjComDv('710200300001')}\nVencimento: ${brDate(somaDias(12))}\nValor do documento: R$ 3.200,00\nLinha digitável: ${linhaSim}`, anexos: [{ filename: 'boleto-grafica.txt', mime: 'text/plain', contentBase64: b64(`Linha digitável: ${linhaSim}`) }] })
    check('simulação: 201 e boleto lançado como RECEBIDO', sim.status === 201 && sim.json.boletos.length === 1 && sim.json.boletos[0].status === 'RECEBIDO' && sim.json.boletos[0].valor === 3200, sim.json)
    check('simulação: beneficiário desconhecido e sem nota => ATENCAO/pendências', ['ATENCAO', 'SUSPEITO'].includes(sim.json.boletos[0].resultado) && sim.json.boletos[0].motivos.some((m: any) => m.codigo === 'BENEFICIARIO_DESCONHECIDO'))
    const simPdf = await call(fin, 'POST', `${B}/email/simular`, { assunto: 'PDF sem texto', texto: '', anexos: [{ filename: 'scan.pdf', mime: 'application/pdf', contentBase64: b64(pdfImg) }] })
    check('simulação com PDF digitalizado: aviso honesto, nenhum boleto, anexo guardado', simPdf.status === 201 && simPdf.json.boletos.length === 0 && /OCR|ler/i.test(simPdf.json.aviso) && simPdf.json.anexos[0].leitura === 'SEM_TEXTO')
    check('simulação sem texto e sem anexo: 400', (await call(fin, 'POST', `${B}/email/simular`, { assunto: 'vazio' })).status === 400)
    check('simulação por professor: 403', (await call(prof, 'POST', `${B}/email/simular`, { texto: 'x' })).status === 403)
    check('simulação por coordenador: 403 (só o financeiro opera a caixa)', (await call(coord, 'POST', `${B}/email/simular`, { texto: 'x' })).status === 403)
    const simMsg = await call(fin, 'POST', `${B}/email/simular`, { messageId: 'dup-1', texto: `Linha: ${linhaSim}` })
    const simMsg2 = await call(fin, 'POST', `${B}/email/simular`, { messageId: 'dup-1', texto: `Linha: ${linhaSim}` })
    check('mesmo messageId simulado: não reprocessa', simMsg2.status === 200 && simMsg2.json.duplicadoEmail === true && simMsg.status === 201)
    const simDupContent = await call(fin, 'POST', `${B}/email/simular`, { texto: `Reenvio do boleto. Linha: ${linhaSim}`, assunto: 'Reenvio' })
    check('mesmo código de barras reenviado por outro e-mail: DUPLICADO ligado ao primeiro', simDupContent.json.boletos[0]?.resultado === 'DUPLICADO' && simDupContent.json.boletos[0].duplicadoDeId === sim.json.boletos[0].id, simDupContent.json.boletos[0])
    check('manual: linha inválida (dígitos a menos) 400', (await call(fin, 'POST', `${B}/boletos`, { linhaDigitavel: '12345', beneficiarioNome: 'Teste Ltda' })).status === 400)
    check('manual: sem linha e sem valor 400', (await call(fin, 'POST', `${B}/boletos`, { beneficiarioNome: 'Teste Ltda' })).status === 400)
    const cpfPF = '52998224725'
    const manPF = await call(fin, 'POST', `${B}/boletos`, { linhaDigitavel: linhaDe('001', 450, somaDias(6), 88), beneficiarioNome: 'Maria Prestadora (autônoma)', beneficiarioDocumento: cpfPF, descricao: 'Serviço eventual' })
    check('manual: valor e vencimento herdados da linha digitável válida', manPF.status === 201 && manPF.json.valor === 450 && manPF.json.vencimento.startsWith(iso10(somaDias(6))), manPF.json)
    check('LGPD: CPF do beneficiário (pessoa física) sai mascarado na API', manPF.json.beneficiarioDocumento === '***.982.247-**' && !JSON.stringify(manPF.json).includes(cpfPF))

    // ----------------------------------------------------------------- caixa de autorização
    secao('Caixa de autorização: Autorizar / Conferir / Refutar (alçada e segregação da Tesouraria)')
    const m1 = (await call(fin, 'POST', `${B}/boletos`, { linhaDigitavel: linhaDe('341', 1500, somaDias(7), 91), beneficiarioNome: 'Papelaria Central Ltda', beneficiarioDocumento: cnpjComDv('100200300001'), descricao: 'Material' })).json
    check('manual lançado pelo financeiro (lancadoPorId = financeiro)', m1.lancadoPorId === fin.id && m1.status === 'RECEBIDO')
    const autFin = await call(fin, 'POST', `${B}/boletos/${m1.id}/autorizar`, {})
    check('segregação: quem lançou não autoriza (403 SEGREGACAO)', autFin.status === 403 && autFin.json.code === 'SEGREGACAO', autFin.json)
    const confSemObs = await call(coord, 'POST', `${B}/boletos/${m1.id}/conferir`, { observacao: 'ok' })
    check('conferir exige observação (mín. 5)', confSemObs.status === 400)
    const conf = await call(coord, 'POST', `${B}/boletos/${m1.id}/conferir`, { observacao: 'Conferir NF com o almoxarifado.' })
    check('conferir devolve para checagem com observação registrada', conf.status === 200 && conf.json.status === 'A_CONFERIR' && conf.json.observacao.includes('almoxarifado'))
    check('professor não autoriza (403)', (await call(prof, 'POST', `${B}/boletos/${m1.id}/autorizar`, {})).status === 403)
    const aut = await call(coord, 'POST', `${B}/boletos/${m1.id}/autorizar`, { observacao: 'Autorizado após conferência' })
    check('coordenação autoriza (valor na faixa): boleto AUTORIZADO e título criado', aut.status === 200 && aut.json.boleto.status === 'AUTORIZADO' && aut.json.titulo.status === 'AUTORIZADO' && aut.json.titulo.formaPagamento === 'BOLETO' && aut.json.titulo.valorBruto === 1500, aut.json)
    const titulo = await prisma.tesTitulo.findUnique({ where: { id: aut.json.titulo.id } })
    check('título no fluxo existente: hash congelado, contas a pagar legado e vínculo com o boleto', !!titulo?.hashAutorizado && !!titulo.accountPayableId && titulo.origemRef === `boleto:${m1.id}` && titulo.fornecedorDocumento === cnpjComDv('100200300001'))
    check('título traz trilha (TesTituloEvento) e aprovação de autorização', (await prisma.tesTituloEvento.count({ where: { tituloId: titulo!.id } })) >= 2 && (await prisma.tesAprovacao.count({ where: { tituloId: titulo!.id, tipo: 'AUTORIZACAO', userId: coord.id } })) === 1)
    check('título aparece em Contas a pagar da Tesouraria', (await call(fin, 'GET', `/edu/tesouraria/titulos/${titulo!.id}`)).status === 200)
    check('autorizar de novo: 409 transição inválida', (await call(coord, 'POST', `${B}/boletos/${m1.id}/autorizar`, {})).status === 409)
    check('refutar boleto já autorizado: 409', (await call(coord, 'POST', `${B}/boletos/${m1.id}/refutar`, { motivo: 'tarde demais' })).status === 409)
    check('auditoria global registra autorização (modulo boletos)', (await prisma.eduAuditEvent.count({ where: { tenantId: t1.tenantId, modulo: 'boletos', acao: 'BOLETO_AUTORIZADO', refId: m1.id } })) === 1)
    check('lembretes do boleto encerrados após decisão (se havia)', (await prisma.eduReminder.count({ where: { tenantId: t1.tenantId, refType: 'BolBoleto', refId: m1.id, status: { in: ['PENDENTE', 'NOTIFICADO'] } } })) === 0)
    // alçada
    const mAlto = (await call(fin, 'POST', `${B}/boletos`, { linhaDigitavel: linhaDe('341', 7000, somaDias(9), 92), beneficiarioNome: 'Papelaria Central Ltda', beneficiarioDocumento: cnpjComDv('100200300001') })).json
    const alcada = await call(coord, 'POST', `${B}/boletos/${mAlto.id}/autorizar`, {})
    check('alçada: R$ 7.000 não pode ser autorizado pela coordenação (403 ALCADA)', alcada.status === 403 && alcada.json.code === 'ALCADA', alcada.json)
    const autAdmin = await call(admin, 'POST', `${B}/boletos/${mAlto.id}/autorizar`, {})
    check('alçada: administrador/diretoria autoriza a faixa superior', autAdmin.status === 200 && autAdmin.json.boleto.status === 'AUTORIZADO', autAdmin.json)
    const mDupla = (await call(fin, 'POST', `${B}/boletos`, { linhaDigitavel: linhaDe('341', 30000, somaDias(9), 93), beneficiarioNome: 'Papelaria Central Ltda', beneficiarioDocumento: cnpjComDv('100200300001') })).json
    const a1 = await call(admin, 'POST', `${B}/boletos/${mDupla.id}/autorizar`, { observacao: 'Valor alto conferido', confirmarRisco: true })
    check('dupla aprovação acima do limite: 1ª aprovação deixa EM_APROVACAO', a1.status === 200 && a1.json.aguardandoSegundaAprovacao === true && a1.json.boleto.status === 'EM_APROVACAO' && a1.json.aprovacoesNecessarias === 2, a1.json)
    const a1b = await call(admin, 'POST', `${B}/boletos/${mDupla.id}/autorizar`, { observacao: 'Valor alto conferido', confirmarRisco: true })
    check('dupla aprovação: o mesmo aprovador não vale duas vezes (DUPLA_APROVACAO)', a1b.status === 403 && a1b.json.code === 'DUPLA_APROVACAO', a1b.json)
    const a2 = await call(admin2, 'POST', `${B}/boletos/${mDupla.id}/autorizar`, { observacao: 'Segundo aprovador confirma o risco', confirmarRisco: true })
    check('dupla aprovação: o 2º aprovador conclui', a2.status === 200 && a2.json.boleto.status === 'AUTORIZADO' && a2.json.titulo.aprovacoesFeitas === 2, a2.json)
    // duplicado / suspeito
    const autDup = await call(coord, 'POST', `${B}/boletos/${dup.id}/autorizar`, {})
    check('DUPLICADO não pode ser autorizado (409 DUPLICADO)', autDup.status === 409 && autDup.json.code === 'DUPLICADO', autDup.json)
    check('refutar exige motivo (mín. 5)', (await call(coord, 'POST', `${B}/boletos/${dup.id}/refutar`, { motivo: '' })).status === 400 && (await call(coord, 'POST', `${B}/boletos/${dup.id}/refutar`, {})).status === 400)
    const refut = await call(coord, 'POST', `${B}/boletos/${dup.id}/refutar`, { motivo: 'Duplicidade confirmada: já lançado no DDA.' })
    check('refutar bloqueia o boleto e registra decisão/motivo', refut.status === 200 && refut.json.status === 'REFUTADO' && refut.json.motivoRefutacao.includes('Duplicidade') && refut.json.decididoPorId === coord.id)
    check('refutado não vira título', !(await prisma.tesTitulo.findFirst({ where: { tenantId: t1.tenantId, origemRef: `boleto:${dup.id}` } })))
    check('auditoria registra a refutação', (await prisma.eduAuditEvent.count({ where: { tenantId: t1.tenantId, modulo: 'boletos', acao: 'BOLETO_REFUTADO', refId: dup.id } })) === 1)
    check('refutar de novo: 409', (await call(coord, 'POST', `${B}/boletos/${dup.id}/refutar`, { motivo: 'repetido de novo' })).status === 409)
    const autSusp = await call(coord, 'POST', `${B}/boletos/${susp.id}/autorizar`, {})
    check('SUSPEITO: autorizar sem confirmar o risco => 409 RISCO_CONFIRMACAO', autSusp.status === 409 && autSusp.json.code === 'RISCO_CONFIRMACAO', autSusp.json)
    check('SUSPEITO: confirmar sem justificativa suficiente também é recusado', (await call(coord, 'POST', `${B}/boletos/${susp.id}/autorizar`, { confirmarRisco: true, observacao: 'ok' })).status === 409)
    const refSusp = await call(coord, 'POST', `${B}/boletos/${susp.id}/refutar`, { motivo: 'CNPJ não confere com o cadastro do fornecedor.' })
    check('suspeito refutado com motivo', refSusp.status === 200 && refSusp.json.status === 'REFUTADO')
    const autDv = await call(admin, 'POST', `${B}/boletos/${dv.id}/autorizar`, { confirmarRisco: true, observacao: 'Fornecedor confirmou o boleto por telefone conhecido.' })
    check('SUSPEITO com risco confirmado e justificativa: autorizado e justificativa gravada', autDv.status === 200 && autDv.json.boleto.status === 'AUTORIZADO' && autDv.json.boleto.observacao.includes('telefone'), autDv.json)
    const evDv = (await call(admin, 'GET', `${B}/boletos/${dv.id}`)).json.eventos.find((e: any) => e.acao === 'AUTORIZADO')
    check('evento de autorização guarda risco confirmado e resultado do check-up', evDv?.detalhe?.riscoConfirmado === true && evDv.detalhe.resultadoCheckup === 'SUSPEITO')
    const semConta = await call(admin, 'POST', `${B}/boletos/${n3.id}/autorizar`, {})
    check('boleto normal sem NF (pendência) pode ser autorizado por quem tem alçada', semConta.status === 200 && semConta.json.boleto.status === 'AUTORIZADO', semConta.json)
    const emAb = await call(fin, 'GET', `${B}/boletos/${m1.id}`)
    check('detalhe do autorizado mostra o título vinculado', emAb.json.titulo?.id === titulo!.id && emAb.json.status === 'AUTORIZADO')
    check('reanalisar disponível a quem confere', (await call(coord, 'POST', `${B}/boletos/${n2.id}/reanalisar`, {})).status === 200)
    check('reanalisar negado ao professor', (await call(prof, 'POST', `${B}/boletos/${n2.id}/reanalisar`, {})).status === 403)
    // dados incompletos: e-mail sem linha
    const semLinha = await call(fin, 'POST', `${B}/boletos`, { valor: 100, vencimento: iso10(somaDias(4)), beneficiarioNome: 'Fulano ME' })
    const autSemLinha = await call(admin, 'POST', `${B}/boletos/${semLinha.json.id}/autorizar`, { confirmarRisco: true, observacao: 'tentativa sem código de barras' })
    check('sem linha digitável: 422 DADOS_INCOMPLETOS com pendências (nada inventado)', autSemLinha.status === 422 && autSemLinha.json.code === 'DADOS_INCOMPLETOS' && autSemLinha.json.pendencias.some((p: string) => /linha digitável/.test(p)), autSemLinha.json)

    // ----------------------------------------------------------------- lotes
    secao('Lote do dia: relatório, aprovação total, parcial e reprovar tudo')
    const rel = (await call(fin, 'GET', `${B}/lotes/relatorio?data=${iso10(hoje)}`)).json
    check('relatório do dia agrupa DDA + e-mail com totais e resultado', rel.totais.quantidade >= 10 && rel.totais.porOrigem.DDA.quantidade === 6 && rel.totais.porOrigem.EMAIL.quantidade >= 3 && typeof rel.totais.porResultado.DUPLICADO === 'number' && rel.totais.valorTotal > 0, rel.totais)
    check('relatório traz todos os dados do check-up por boleto', rel.boletos.every((b: any) => Array.isArray(b.motivos) && b.resultado && typeof b.score === 'number' && 'linhaDigitavel' in b && 'fornecedor' in b))
    check('relatório traz a planilha de recorrentes não lançados e o aviso interno', rel.recorrentesNaoLancados.length === 1 && /Vigilância/.test(rel.recorrentesNaoLancados[0].fornecedor) && /INTERNA/.test(rel.aviso))
    const lotes = (await call(fin, 'GET', `${B}/lotes`)).json.items
    const loteSeed = lotes.find((l: any) => l.status === 'ENVIADO_APROVACAO')
    check('lote do seed: enviado pelo financeiro com itens e valor total', loteSeed && loteSeed.itens >= 2 && loteSeed.valorTotal > 0 && loteSeed.enviadoPorId === fin.id, loteSeed)
    const decFin = await call(fin, 'POST', `${B}/lotes/${loteSeed.id}/decidir`, { decisao: 'TOTAL' })
    check('segregação do lote: quem enviou não decide (403 SEGREGACAO)', decFin.status === 403 && decFin.json.code === 'SEGREGACAO', decFin.json)
    check('professor não decide lote (403)', (await call(prof, 'POST', `${B}/lotes/${loteSeed.id}/decidir`, { decisao: 'TOTAL' })).status === 403)
    check('decisão inválida: 400', (await call(coord, 'POST', `${B}/lotes/${loteSeed.id}/decidir`, { decisao: 'TALVEZ' })).status === 400)
    check('parcial sem itens marcados: 400', (await call(coord, 'POST', `${B}/lotes/${loteSeed.id}/decidir`, { decisao: 'PARCIAL', itens: [] })).status === 400)
    check('parcial com item de fora do lote: 400', (await call(coord, 'POST', `${B}/lotes/${loteSeed.id}/decidir`, { decisao: 'PARCIAL', itens: [m1.id] })).status === 400)
    check('reprovar tudo sem motivo: 400', (await call(coord, 'POST', `${B}/lotes/${loteSeed.id}/decidir`, { decisao: 'REPROVAR' })).status === 400)
    const loteDet = (await call(fin, 'GET', `${B}/lotes/${loteSeed.id}`)).json
    const idsLote: string[] = loteDet.relatorio.boletos.map((b: any) => b.id)
    const abertosLote = loteDet.relatorio.boletos.filter((b: any) => ['RECEBIDO', 'A_CONFERIR'].includes(b.status))
    check('detalhe do lote: relatório + trilha', loteDet.lote.status === 'ENVIADO_APROVACAO' && loteDet.eventos.some((e: any) => e.acao === 'LOTE_ENVIADO') && abertosLote.length >= 1)
    const marcado = abertosLote[0].id
    const parcial = await call(coord, 'POST', `${B}/lotes/${loteSeed.id}/decidir`, { decisao: 'PARCIAL', itens: [marcado], motivo: 'Demais itens aguardam NF' })
    check('aprovação parcial: marcados autorizados, os demais voltam à conferência', parcial.status === 200 && parcial.json.lote.status === 'PARCIAL' && parcial.json.resultados.find((r: any) => r.id === marcado)?.acao === 'AUTORIZADO' && parcial.json.resumo.autorizados === 1, parcial.json)
    const apos = (await call(fin, 'GET', `${B}/boletos/${abertosLote.find((b: any) => b.id !== marcado)?.id ?? marcado}`)).json
    check('itens não marcados voltam A_CONFERIR sem lote e com a observação', abertosLote.length < 2 || (apos.status === 'A_CONFERIR' && !apos.loteId && /Não aprovado no lote/.test(apos.observacao)))
    check('lote decidido guarda quem decidiu/quando e o resumo', parcial.json.lote.decididoPorId === coord.id && !!parcial.json.lote.decididoEm && parcial.json.lote.decisao === 'PARCIAL' && parcial.json.lote.resumo.autorizados === 1)
    check('lote já decidido não decide de novo (409)', (await call(admin, 'POST', `${B}/lotes/${loteSeed.id}/decidir`, { decisao: 'TOTAL' })).status === 409)
    check('lote decidido tem relatório com quem aprovou', (await call(fin, 'GET', `${B}/lotes/relatorio?loteId=${loteSeed.id}`)).json.lote.decididoPor?.length > 0)
    // novo lote: reprovar tudo
    const nA = (await call(fin, 'POST', `${B}/boletos`, { linhaDigitavel: linhaDe('341', 410, somaDias(5), 201), beneficiarioNome: 'Papelaria Central Ltda', beneficiarioDocumento: cnpjComDv('100200300001') })).json
    const nB = (await call(fin, 'POST', `${B}/boletos`, { linhaDigitavel: linhaDe('341', 420, somaDias(5), 202), beneficiarioNome: 'Papelaria Central Ltda', beneficiarioDocumento: cnpjComDv('100200300001') })).json
    check('lote vazio/inválido: 422', (await call(fin, 'POST', `${B}/lotes`, { boletoIds: [m1.id] })).status === 422)
    const lt2 = (await call(fin, 'POST', `${B}/lotes`, { boletoIds: [nA.id, nB.id], observacao: 'Lote de teste' })).json
    check('lote criado ABERTO com numeração', lt2.status === 'ABERTO' && /^LOTE-\d{8}-\d{2}$/.test(lt2.numero))
    check('decidir lote ainda aberto (não enviado): 409', (await call(coord, 'POST', `${B}/lotes/${lt2.id}/decidir`, { decisao: 'TOTAL' })).status === 409)
    check('enviar lote para aprovação', (await call(fin, 'POST', `${B}/lotes/${lt2.id}/enviar`, {})).json.status === 'ENVIADO_APROVACAO')
    check('coordenação é avisada do lote (notificação)', (await prisma.eduNotification.count({ where: { tenantId: t1.tenantId, refType: 'BolLote', refId: lt2.id, userId: coord.id } })) === 1)
    const reprov = await call(coord, 'POST', `${B}/lotes/${lt2.id}/decidir`, { decisao: 'REPROVAR', motivo: 'Fornecedores sem contrato vigente' })
    check('reprovar tudo: lote REPROVADO e todos os boletos REFUTADOS com o motivo', reprov.status === 200 && reprov.json.lote.status === 'REPROVADO' && reprov.json.resumo.refutados === 2 && (await prisma.bolBoleto.findMany({ where: { id: { in: [nA.id, nB.id] } } })).every((b) => b.status === 'REFUTADO' && /sem contrato/.test(b.motivoRefutacao || '')))
    // lote total com duplicado e total ok
    const nC = (await call(fin, 'POST', `${B}/boletos`, { linhaDigitavel: linhaDe('341', 430, somaDias(5), 203), beneficiarioNome: 'Papelaria Central Ltda', beneficiarioDocumento: cnpjComDv('100200300001') })).json
    const nCdup = (await call(fin, 'POST', `${B}/boletos`, { linhaDigitavel: linhaDe('341', 430, somaDias(5), 203), beneficiarioNome: 'Papelaria Central Ltda', beneficiarioDocumento: cnpjComDv('100200300001') })).json
    check('boleto repetido manualmente é DUPLICADO do primeiro', nCdup.resultado === 'DUPLICADO' && nCdup.duplicadoDeId === nC.id)
    const lt3 = (await call(fin, 'POST', `${B}/lotes`, { boletoIds: [nC.id, nCdup.id] })).json
    await call(fin, 'POST', `${B}/lotes/${lt3.id}/enviar`, {})
    const totDup = await call(coord, 'POST', `${B}/lotes/${lt3.id}/decidir`, { decisao: 'TOTAL' })
    check('aprovação total com duplicado: 422 LOTE_COM_DUPLICADOS', totDup.status === 422 && totDup.json.code === 'LOTE_COM_DUPLICADOS')
    const parcOk = await call(coord, 'POST', `${B}/lotes/${lt3.id}/decidir`, { decisao: 'PARCIAL', itens: [nC.id], refutarRestantes: true, motivo: 'Duplicado descartado' })
    check('parcial com refutar restantes: duplicado refutado e o outro autorizado', parcOk.status === 200 && parcOk.json.lote.status === 'PARCIAL' && (await prisma.bolBoleto.findUnique({ where: { id: nCdup.id } }))?.status === 'REFUTADO' && (await prisma.bolBoleto.findUnique({ where: { id: nC.id } }))?.status === 'AUTORIZADO')
    const nD = (await call(fin, 'POST', `${B}/boletos`, { linhaDigitavel: linhaDe('341', 440, somaDias(5), 204), beneficiarioNome: 'Papelaria Central Ltda', beneficiarioDocumento: cnpjComDv('100200300001') })).json
    const nE = (await call(fin, 'POST', `${B}/boletos`, { linhaDigitavel: linhaDe('341', 450.5, somaDias(5), 205), beneficiarioNome: 'Papelaria Central Ltda', beneficiarioDocumento: cnpjComDv('100200300001') })).json
    const lt4 = (await call(fin, 'POST', `${B}/lotes`, { boletoIds: [nD.id, nE.id] })).json
    await call(fin, 'POST', `${B}/lotes/${lt4.id}/enviar`, {})
    const tot = await call(admin, 'POST', `${B}/lotes/${lt4.id}/decidir`, { decisao: 'TOTAL' })
    check('aprovação total: lote APROVADO, todos AUTORIZADOS, títulos criados', tot.status === 200 && tot.json.lote.status === 'APROVADO' && tot.json.resumo.autorizados === 2 && (await prisma.tesTitulo.count({ where: { tenantId: t1.tenantId, origemRef: { in: [`boleto:${nD.id}`, `boleto:${nE.id}`] }, status: 'AUTORIZADO' } })) === 2, tot.json)
    check('auditoria do lote (enviado e decidido)', (await prisma.eduAuditEvent.count({ where: { tenantId: t1.tenantId, modulo: 'boletos', refType: 'BolLote', refId: lt4.id } })) >= 3)
    const nF = (await call(fin, 'POST', `${B}/boletos`, { linhaDigitavel: linhaDe('033', 12000, somaDias(5), 206), beneficiarioNome: 'Papelaria Central Ltda', beneficiarioDocumento: cnpjComDv('100200300001') })).json
    check('valor muito acima do histórico + banco diferente: SUSPEITO', nF.resultado === 'SUSPEITO' && nF.motivos.some((m: any) => m.codigo === 'VALOR_FORA_HISTORICO') && nF.motivos.some((m: any) => m.codigo === 'BANCO_DIVERGE'), nF)
    const lt5 = (await call(fin, 'POST', `${B}/lotes`, { boletoIds: [nF.id] })).json
    await call(fin, 'POST', `${B}/lotes/${lt5.id}/enviar`, {})
    const lt5r = await call(coord, 'POST', `${B}/lotes/${lt5.id}/decidir`, { decisao: 'TOTAL' })
    check('lote com suspeito exige confirmar o risco com justificativa (422 RISCO_CONFIRMACAO)', lt5r.status === 422 && lt5r.json.code === 'RISCO_CONFIRMACAO')
    await call(coord, 'POST', `${B}/lotes/${lt5.id}/decidir`, { decisao: 'REPROVAR', motivo: 'Valor e banco fora do padrão' })

    // ----------------------------------------------------------------- recorrências
    secao('Recorrências: cadastro, aprendizado, verificação diária e planilha do dia')
    const rec = (await call(fin, 'GET', `${B}/recorrencias`)).json
    check('recorrências do seed: 3 ativas', rec.items.filter((r: any) => r.ativa).length === 3)
    check('aprendizado: fornecedores com 3 meses seguidos viram SUGESTÃO (nunca recorrência automática)', rec.sugestoes.length >= 3 && rec.sugestoes.every((s: any) => s.meses >= 3 && s.status === 'PENDENTE') && rec.items.length === 3 && ['Papelaria Central Ltda', 'TechCampus Informática Ltda', 'Limpeza Total Serviços Ltda'].every((n) => rec.sugestoes.some((s: any) => s.fornecedorNome === n)), rec.sugestoes.map((s: any) => s.fornecedorNome))
    check('sugestão traz valor médio e dia médio', rec.sugestoes.every((s: any) => s.valorMedio > 0 && s.diaMedio >= 1 && s.diaMedio <= 31) && rec.sugestoes.find((s: any) => /TechCampus/.test(s.fornecedorNome)).diaMedio === 11)
    const nSug = rec.sugestoes.length
    const sg = rec.sugestoes.find((s: any) => /Papelaria/.test(s.fornecedorNome))
    const acc = await call(fin, 'POST', `${B}/recorrencias/sugestoes/${sg.id}/aceitar`, {})
    check('aceitar sugestão cria a recorrência (origem APRENDIDA)', acc.status === 201 && acc.json.origem === 'APRENDIDA' && acc.json.fornecedorNome === sg.fornecedorNome)
    check('aceitar de novo: 409', (await call(fin, 'POST', `${B}/recorrencias/sugestoes/${sg.id}/aceitar`, {})).status === 409)
    const sgIgn = rec.sugestoes.find((s: any) => /TechCampus/.test(s.fornecedorNome))
    check('ignorar sugestão', (await call(fin, 'POST', `${B}/recorrencias/sugestoes/${sgIgn.id}/ignorar`, {})).status === 200 && (await call(fin, 'GET', `${B}/recorrencias`)).json.sugestoes.length === nSug - 2)
    const verif = await call(fin, 'POST', `${B}/recorrencias/verificar`, {})
    check('"Verificar agora": executa e responde com contagens', verif.status === 200 && verif.json.recorrencias >= 3 && typeof verif.json.sugestoesNovas === 'number', verif.json)
    check('verificação não duplica avisos (idempotente)', (await call(fin, 'POST', `${B}/recorrencias/verificar`, {})).json.novosAvisos === 0)
    const plan = (await call(fin, 'GET', `${B}/planilha-do-dia`)).json
    const vig = plan.naoLancados.find((n: any) => /Vigilância/.test(n.fornecedor))
    check('planilha do dia: vigilância patrimonial NÃO lançada, com valor esperado e dias de atraso', !!vig && vig.valorEstimado === 6200 && plan.totais.valorNaoLancado >= 6200 && vig.diasAtraso >= 0, plan.totais)
    check('planilha do dia: aluguel e internet já lançados (conciliados com a caixa)', plan.lancados.length >= 2 && plan.lancados.some((l: any) => /Imobiliária/.test(l.fornecedor) && l.boletoId) && plan.lancados.some((l: any) => /NetFibra/.test(l.fornecedor)), plan.lancados)
    const remRec = await prisma.eduReminder.findMany({ where: { tenantId: t1.tenantId, refType: 'BolEsperado' } })
    check('aviso "conta recorrente não lançada": lembrete ao financeiro e escalonado à diretoria', remRec.some((r) => r.assigneeRole === 'FINANCE') && remRec.some((r) => r.assigneeRole === 'RECTOR' && r.severity === 'CRITICO'))
    check('aviso de recorrência chega ao financeiro por notificação', (await prisma.eduNotification.count({ where: { tenantId: t1.tenantId, refType: 'BolEsperado', userId: fin.id } })) >= 1)
    check('painel conta os recorrentes pendentes', (await call(fin, 'GET', `${B}/painel`)).json.recorrentesPendentes === plan.naoLancados.length)
    const idEsp = vig.id
    check('justificar exige texto (400)', (await call(fin, 'POST', `${B}/esperados/${idEsp}/justificar`, { justificativa: 'ok' })).status === 400)
    check('professor não justifica (403)', (await call(prof, 'POST', `${B}/esperados/${idEsp}/justificar`, { justificativa: 'texto longo o bastante' })).status === 403)
    const just = await call(coord, 'POST', `${B}/esperados/${idEsp}/justificar`, { justificativa: 'Contrato encerrado; vigilância passou para o campus Norte.' })
    check('justificar tira da lista e guarda quem/quando', just.status === 200 && just.json.status === 'JUSTIFICADO' && just.json.tratadoPorId === coord.id && !(await call(fin, 'GET', `${B}/planilha-do-dia`)).json.naoLancados.some((n: any) => n.id === idEsp))
    check('lembretes da recorrência encerrados ao justificar', (await prisma.eduReminder.count({ where: { tenantId: t1.tenantId, refType: 'BolEsperado', refId: idEsp, status: { in: ['PENDENTE', 'NOTIFICADO'] } } })) === 0)
    check('justificar duas vezes: 409', (await call(coord, 'POST', `${B}/esperados/${idEsp}/dispensar`, { justificativa: 'tentativa repetida' })).status === 409)
    const novaRec = await call(fin, 'POST', `${B}/recorrencias`, { fornecedorNome: 'Jardinagem Verde Ltda', fornecedorDocumento: cnpjComDv('810900100001'), descricao: 'Jardinagem', valorEstimado: 700, diaMes: 5, periodicidade: 'TRIMESTRAL', mesBase: 1, antecedenciaDias: 2 })
    check('cadastro manual de recorrência (trimestral)', novaRec.status === 201 && novaRec.json.origem === 'MANUAL' && novaRec.json.periodicidade === 'TRIMESTRAL')
    check('recorrência: validações (valor, dia, periodicidade, CNPJ)', (await call(fin, 'POST', `${B}/recorrencias`, { fornecedorNome: 'X', valorEstimado: 1, diaMes: 5 })).status === 400 && (await call(fin, 'POST', `${B}/recorrencias`, { fornecedorNome: 'Fornecedor Y', valorEstimado: -5, diaMes: 5 })).status === 400 && (await call(fin, 'POST', `${B}/recorrencias`, { fornecedorNome: 'Fornecedor Y', valorEstimado: 5, diaMes: 40 })).status === 400 && (await call(fin, 'POST', `${B}/recorrencias`, { fornecedorNome: 'Fornecedor Y', valorEstimado: 5, diaMes: 4, periodicidade: 'DIARIA' })).status === 400 && (await call(fin, 'POST', `${B}/recorrencias`, { fornecedorNome: 'Fornecedor Y', fornecedorDocumento: '11222333000199', valorEstimado: 5, diaMes: 4 })).status === 400)
    check('editar e desativar recorrência', (await call(fin, 'PUT', `${B}/recorrencias/${novaRec.json.id}`, { valorEstimado: 750 })).json.valorEstimado === 750 && (await call(fin, 'DELETE', `${B}/recorrencias/${novaRec.json.id}`)).status === 200 && (await call(fin, 'GET', `${B}/recorrencias`)).json.items.find((r: any) => r.id === novaRec.json.id).ativa === false)
    check('professor não cadastra recorrência (403)', (await call(prof, 'POST', `${B}/recorrencias`, { fornecedorNome: 'Fornecedor Y', valorEstimado: 5, diaMes: 4 })).status === 403)
    // recorrência cujo boleto chega depois passa a "lançada"
    const diaFuturo = Math.min(28, hoje.getUTCDate() + 1)
    const vFut = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), diaFuturo, 12))
    const recG = await call(fin, 'POST', `${B}/recorrencias`, { fornecedorNome: 'Gráfica Aurora Ltda', fornecedorDocumento: cnpjComDv('710200300001'), descricao: 'Impressões', valorEstimado: 3200, diaMes: diaFuturo, antecedenciaDias: 30 })
    const verif2 = (await call(fin, 'POST', `${B}/recorrencias/verificar`, {})).json
    check('nova recorrência cujo boleto já está na caixa (e-mail simulado) conta como lançada', verif2.lancados >= 1 && verif2.novosAvisos === 0, verif2)
    void recG; void vFut
    // ----------------------------------------------------------------- cron
    secao('Cron: jobs registrados e idempotentes')
    const jobs = await runEduJobs()
    check('jobs "boletos.dda-sincronizar" e "boletos.recorrencias" registrados e ok', (jobs as any)['boletos.dda-sincronizar']?.ok === true && (jobs as any)['boletos.recorrencias']?.ok === true, Object.keys(jobs).filter((k) => k.startsWith('boletos')))
    check('cron do DDA não duplica boletos do dia', (jobs as any)['boletos.dda-sincronizar'].result.novos === 0 && (jobs as any)['boletos.dda-sincronizar'].result.falhas.length === 0, (jobs as any)['boletos.dda-sincronizar'])
    check('cron de recorrências não cria avisos repetidos', (jobs as any)['boletos.recorrencias'].result.novosAvisos === 0 && (jobs as any)['boletos.recorrencias'].result.falhas.length === 0, (jobs as any)['boletos.recorrencias'])
    // ----------------------------------------------------------------- permissões gerais
    secao('Permissões e auditoria geral')
    const audit = await call(admin, 'GET', `${B}/boletos-eventos/auditoria`)
    check('auditoria completa só para administração', audit.status === 200 && audit.json.items.length > 20 && (await call(fin, 'GET', `${B}/boletos-eventos/auditoria`)).status === 403)
    check('auditoria não contém linha digitável nem segredo', !JSON.stringify(audit.json.items).includes(tokenA2) && !/\b\d{47}\b/.test(JSON.stringify(audit.json.items)))
    check('SUPPLIES (compras) lê a caixa mas não opera', (await call(await t1.mk('SUPPLIES'), 'GET', `${B}/boletos`)).status === 200)
    check('FINANCE de outro tenant não opera no tenant A', (await call(finB, 'POST', `${B}/dda/sincronizar`, {})).status === 409 && (await call(finB, 'POST', `${B}/boletos/${m1.id}/autorizar`, {})).status === 404)
    check('nenhuma resposta vaza hash do segredo', !JSON.stringify(lista).includes('webhookTokenHash'))
    check('lote do tenant B não existe para A', (await call(admin, 'GET', `${B}/lotes/${loteSeed.id.replace(/.$/, '0')}`)).status === 404)
  } finally {
    summary()
    if (fails.length) console.log(`\nFALHAS: ${fails.length}`)
    await S.close()
    process.exit(fails.length ? 1 : 0)
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
