import assert from 'node:assert/strict'
import { DOU_PALAVRAS_DEMO, DOU_RSS, DOU_TEXTO_COLADO, DOU_XML_INLABS } from './douFixtures'
import {
  classificarItem, classificarTema, extrairNumero, identificadorDou, orgaoCanonico, parseDataDou, parseInlabsXml, parseRss, parseTextoColado, prazoSugerido,
  referenciaDouTexto, tipoAtoCanonico, tipoRegAto, urlColetaSegura,
} from './douLogic'
import { agruparPorDia, detectarConflitos, expandirRecorrencia, ics, intervaloVisao, ocorrenciasAnuais, prioridadePrazo } from './agendaLogic'
import { interpretarCsvIes, parseCsv, parseNumero, ranquear } from './csvIes'
import { situacaoConvenio } from './convenios'
import { ratear } from './investimentos'
import { mascararResumo } from './pessoas'
import { cnpjValido, inicioDoDia, toCsv } from './util2'

// ---- datas ----
assert.equal(parseDataDou('28/10/2026')?.toISOString().slice(0, 10), '2026-10-28')
assert.equal(parseDataDou('PORTARIA Nº 1, DE 5 DE MARÇO DE 2026')?.toISOString().slice(0, 10), '2026-03-05')
assert.equal(parseDataDou('Wed, 28 Oct 2026 08:00:00 -0300')?.toISOString().slice(0, 10), '2026-10-28')
assert.equal(parseDataDou('lixo'), null)
assert.equal(parseDataDou('31/13/2026'), null)

// ---- parsers ----
const xml = parseInlabsXml(DOU_XML_INLABS)
assert.equal(xml.length, 4)
assert.equal(xml[0].numero, '812'); assert.equal(xml[0].secao, 1); assert.equal(xml[0].pagina, '41'); assert.equal(xml[0].idExterno, '30001')
assert.ok(xml[0].ementa!.includes('Odontologia')); assert.ok(!xml[0].texto!.includes('<p>'))
assert.equal(xml[2].secao, 2)
assert.equal(parseInlabsXml('<xml></xml>').length, 0)
assert.equal(parseInlabsXml('<article id="1" pubDate="xx"><body><Identifica>PORTARIA</Identifica></body></article>').length, 0) // sem data
const rss = parseRss(DOU_RSS)
assert.equal(rss.length, 2); assert.equal(rss[0].idExterno, 'rss-cne-ces-3-2026'); assert.equal(rss[0].dataPublicacao.toISOString().slice(0, 10), '2026-10-28')
const txt = parseTextoColado(DOU_TEXTO_COLADO)
assert.equal(txt.length, 3); assert.equal(txt[0].numero, '1.234'); assert.equal(txt[0].secao, 1); assert.equal(txt[2].secao, 3)
assert.equal(parseTextoColado('nada aqui').length, 0)
assert.equal(extrairNumero('PORTARIA Nº 5.100, DE 20'), '5.100'); assert.equal(extrairNumero('Resolução CNE/CES nº 3/2026, de'), '3/2026')

// ---- canônicos ----
assert.equal(orgaoCanonico('Ministério da Educação/Secretaria de Regulação e Supervisão da Educação Superior'), 'SERES')
assert.equal(orgaoCanonico('Instituto Nacional de Estudos e Pesquisas Educacionais Anísio Teixeira'), 'INEP')
assert.equal(orgaoCanonico('Ministério da Fazenda'), 'OUTRO')
assert.equal(tipoAtoCanonico('Portaria'), 'PORTARIA'); assert.equal(tipoAtoCanonico(null, 'RESOLUÇÃO CNE nº 2'), 'RESOLUCAO')
assert.equal(classificarTema('Reconhece o curso de Odontologia'), 'RECONHECIMENTO')
assert.equal(classificarTema('Renovação de reconhecimento do curso'), 'RENOVACAO')
assert.equal(classificarTema('Autoriza o funcionamento do curso de Enfermagem'), 'AUTORIZACAO')
assert.equal(classificarTema('Recredenciamento da instituição'), 'CREDENCIAMENTO')
assert.equal(classificarTema('Aplica medida cautelar de suspensão de ingresso'), 'PENALIDADE')
assert.equal(classificarTema('Divulga o cronograma do ENADE'), 'ENADE_CPC')
assert.equal(classificarTema('crédito suplementar'), 'OUTRO')
assert.equal(tipoRegAto('RECONHECIMENTO', 'PORTARIA', 'x'), 'PORTARIA_RECONHECIMENTO')
assert.equal(tipoRegAto('CREDENCIAMENTO', 'PORTARIA', 'Recredenciamento'), 'PORTARIA_RECREDENCIAMENTO')
assert.equal(tipoRegAto('OUTRO', 'RESOLUCAO', 'x'), 'RESOLUCAO')

// ---- classificação ----
const pal = DOU_PALAVRAS_DEMO
const cls = xml.map((i) => classificarItem(i, pal))
assert.equal(cls[0].relevancia, 'ALTA'); assert.equal(cls[0].tema, 'RECONHECIMENTO'); assert.equal(cls[0].orgao, 'SERES')
assert.ok(cls[0].palavrasEncontradas.includes('12.345.678/0001-90')); assert.ok(cls[0].palavrasEncontradas.includes('Odontologia'))
assert.equal(cls[0].prazoAcaoEm?.toISOString().slice(0, 10), '2026-11-27')       // "prazo de 30 (trinta) dias" a partir de 28/10
assert.equal(cls[1].relevancia, 'BAIXA')                                           // MEC regulamentação geral
assert.equal(cls[1].prazoAcaoEm, null)
assert.equal(cls[2].relevancia, 'NENHUMA')                                         // Fazenda
assert.equal(cls[3].relevancia, 'ALTA'); assert.equal(cls[3].tema, 'ENADE_CPC')   // cursos da instituição
assert.equal(cls[3].prazoAcaoEm?.toISOString().slice(0, 10), '2026-11-07')         // prazo de 10 dias
assert.equal(classificarItem(txt[0], pal).tema, 'PENALIDADE'); assert.equal(classificarItem(txt[0], pal).relevancia, 'ALTA')
assert.equal(classificarItem(txt[2], pal).relevancia, 'NENHUMA')
assert.equal(classificarItem(txt[1], pal).relevancia, 'BAIXA')                     // MEC + Prouni
// e-MEC só casa como número inteiro
assert.equal(classificarItem({ ...xml[2], titulo: 'DESPACHO 14321', ementa: null, texto: null }, [{ termo: '4321', tipo: 'EMEC', peso: 8 }]).relevancia, 'NENHUMA')
// CNPJ sem pontuação no texto casa
assert.equal(classificarItem({ ...xml[2], texto: 'cnpj 12345678000190' }, [{ termo: '12.345.678/0001-90', tipo: 'CNPJ', peso: 10 }]).relevancia, 'ALTA')
// acentos / caixa
assert.equal(classificarItem({ ...xml[2], titulo: 'ENFERMAGEM - EXTRATO' }, [{ termo: 'enfermagem', tipo: 'CURSO', peso: 5 }]).palavrasEncontradas.length, 1)
// sem palavras: apenas órgão MEC + tema regulatório
assert.equal(classificarItem(xml[1], []).relevancia, 'BAIXA')
// identificador estável
assert.equal(identificadorDou(xml[0]), 'ext:30001'); assert.equal(identificadorDou(txt[0]), identificadorDou({ ...txt[0] }))
assert.notEqual(identificadorDou(txt[0]), identificadorDou(txt[1]))
assert.equal(prazoSugerido(new Date('2026-10-28T15:00:00Z'), 'OUTRO', 'NENHUMA', ''), null)
assert.equal(prazoSugerido(new Date('2026-10-28T15:00:00Z'), 'OUTRO', 'ALTA', 'prazo de 99999 dias')?.toISOString().slice(0, 10), '2026-11-12')
assert.equal(referenciaDouTexto({ dataPublicacao: new Date('2026-10-28T15:00:00Z'), secao: 1, pagina: '41' }), 'DOU Seção 1, p. 41, 28/10/2026')

// ---- SSRF ----
assert.throws(() => urlColetaSegura('http://exemplo.gov.br/x'))
assert.throws(() => urlColetaSegura('https://localhost/x'))
assert.throws(() => urlColetaSegura('https://127.0.0.1/x'))
assert.throws(() => urlColetaSegura('https://intranet/x'))
assert.throws(() => urlColetaSegura('file:///etc/passwd'))
assert.ok(urlColetaSegura('https://www.in.gov.br/feed.xml').startsWith('https://'))

// ---- agenda ----
const d0 = inicioDoDia('2026-10-28')
const sem = intervaloVisao('semana', '2026-10-28')   // quarta-feira
assert.equal(sem.de.toISOString(), '2026-10-26T03:00:00.000Z'); assert.equal(sem.ate.toISOString(), '2026-11-02T03:00:00.000Z')
assert.equal(intervaloVisao('dia', '2026-10-28').ate.getTime() - d0.getTime(), 86_400_000)
const mes = intervaloVisao('mes', '2026-12-15'); assert.equal(mes.de.toISOString(), '2026-12-01T03:00:00.000Z'); assert.equal(mes.ate.toISOString(), '2027-01-01T03:00:00.000Z')
assert.throws(() => inicioDoDia('28/10/2026'))
const anual = { inicio: inicioDoDia('2024-02-29'), fim: inicioDoDia('2024-02-29'), recorrencia: 'ANUAL', recorrenciaAte: null }
const oc = expandirRecorrencia(anual, inicioDoDia('2026-01-01'), inicioDoDia('2028-12-31'))
assert.deepEqual(oc.map((o) => o.inicio.toISOString().slice(0, 10)), ['2026-02-28', '2027-02-28', '2028-02-29'])
const mensal = { inicio: new Date('2026-01-31T13:00:00Z'), fim: new Date('2026-01-31T14:00:00Z'), recorrencia: 'MENSAL', recorrenciaAte: new Date('2026-04-30T12:00:00Z') }
assert.deepEqual(expandirRecorrencia(mensal, inicioDoDia('2026-01-01'), inicioDoDia('2026-12-31')).map((o) => o.inicio.toISOString().slice(0, 10)), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'])
const sema = { inicio: new Date('2026-10-26T13:00:00Z'), fim: new Date('2026-10-26T14:00:00Z'), recorrencia: 'SEMANAL', recorrenciaAte: null }
assert.equal(expandirRecorrencia(sema, inicioDoDia('2026-11-01'), inicioDoDia('2026-12-01')).length, 5)
assert.equal(expandirRecorrencia({ inicio: d0, fim: d0, recorrencia: 'NENHUMA' }, inicioDoDia('2026-11-01'), inicioDoDia('2026-12-01')).length, 0)
assert.deepEqual(ocorrenciasAnuais(10, 29, inicioDoDia('2026-10-01'), inicioDoDia('2026-11-01')).map((d) => d.toISOString().slice(0, 10)), ['2026-10-29'])
const a = { id: 'a', inicio: new Date('2026-10-28T13:00:00Z'), fim: new Date('2026-10-28T14:00:00Z') }
assert.equal(detectarConflitos(a, [{ id: 'b', inicio: new Date('2026-10-28T13:30:00Z'), fim: new Date('2026-10-28T15:00:00Z') }, { id: 'c', inicio: new Date('2026-10-28T14:00:00Z'), fim: new Date('2026-10-28T15:00:00Z') }]).length, 1)
const hoje = new Date('2026-10-28T12:00:00Z')
assert.equal(prioridadePrazo(new Date('2026-10-27T12:00:00Z'), hoje), 'CRITICA'); assert.equal(prioridadePrazo(new Date('2026-11-02T12:00:00Z'), hoje), 'ALTA'); assert.equal(prioridadePrazo(new Date('2027-03-02T12:00:00Z'), hoje), 'BAIXA')
const grp = agruparPorDia([{ id: '1', origem: 'x', tipo: 'OUTRO', titulo: 'B', inicio: inicioDoDia('2026-10-28'), fim: inicioDoDia('2026-10-30'), diaInteiro: true, prioridade: 'NORMAL' }])
assert.deepEqual(Object.keys(grp).sort(), ['2026-10-28', '2026-10-29'])
const cal = ics([{ id: 'rei:1', origem: 'reitoria', tipo: 'REUNIAO', titulo: 'Reunião; com, vírgula', inicio: new Date('2026-10-28T13:00:00Z'), fim: new Date('2026-10-28T14:00:00Z'), diaInteiro: false, prioridade: 'NORMAL' }])
assert.ok(cal.includes('BEGIN:VCALENDAR') && cal.includes('SUMMARY:Reunião\\; com\\, vírgula') && cal.includes('DTSTART:20261028T130000Z'))

// ---- convênios ----
const base = { status: 'VIGENTE', vigenciaIndeterminada: false, avisoDias: [90, 60, 30] }
const n = new Date('2026-10-28T12:00:00Z')
assert.equal(situacaoConvenio({ ...base, fim: new Date('2027-06-01T12:00:00Z') }, n).situacao, 'VIGENTE')
assert.equal(situacaoConvenio({ ...base, fim: new Date('2026-12-20T12:00:00Z') }, n).faixa, 'ATENCAO')       // 53 dias
assert.equal(situacaoConvenio({ ...base, fim: new Date('2027-01-10T12:00:00Z') }, n).faixa, 'INFO')       // 74 dias
assert.equal(situacaoConvenio({ ...base, fim: new Date('2026-11-10T12:00:00Z') }, n).faixa, 'CRITICO')
assert.equal(situacaoConvenio({ ...base, fim: new Date('2026-10-01T12:00:00Z') }, n).situacao, 'VENCIDO')
assert.equal(situacaoConvenio({ ...base, fim: null, vigenciaIndeterminada: true }, n).situacao, 'SEM_PRAZO')
assert.equal(situacaoConvenio({ ...base, status: 'ENCERRADO', fim: new Date('2026-10-01T12:00:00Z') }, n).situacao, 'INATIVO')

// ---- investimentos ----
assert.deepEqual(ratear([{ disciplineId: 'a' }, { disciplineId: 'b' }, { disciplineId: 'c' }]).map((x) => x.percentual), [33.33, 33.33, 33.33])
assert.throws(() => ratear([{ disciplineId: 'a', percentual: 70 }, { disciplineId: 'b', percentual: 40 }]))
assert.throws(() => ratear([{ disciplineId: 'a', percentual: 50 }, { disciplineId: 'b' }]))
assert.throws(() => ratear([{ disciplineId: 'a' }, { disciplineId: 'a' }]))
assert.deepEqual(ratear([]), [])

// ---- pessoas ----
assert.equal(mascararResumo({ avaliados: 2, notaMedia: 4.5 }).suprimido, true); assert.equal(mascararResumo({ avaliados: 2, notaMedia: 4.5 }).notaMedia, null)
assert.equal(mascararResumo({ avaliados: 3, notaMedia: 4.5 }).notaMedia, 4.5)

// ---- CSV INEP ----
assert.deepEqual(parseCsv('a;b\n"x;y";"z ""q"""\n'), [['a', 'b'], ['x;y', 'z "q"']])
assert.equal(parseNumero('1.234,56'), 1234.56); assert.equal(parseNumero('3,8'), 3.8); assert.equal(parseNumero('1.234'), 1234); assert.equal(parseNumero('SC'), null); assert.equal(parseNumero('R$ 1.890,00'), 1890)
const csv = 'CO_IES;NO_IES;SG_UF;NU_ANO_CENSO;CPC_CONTINUO;IGC_CONTINUO;QT_CURSO;QT_MAT\n1001;Faculdade Alfa;SP;2025;3,85;3,41;12;4.500\n1002;Univ Beta;RJ;2025;SC;4,02;30;12000\n;;;2025;4;4;1;1\n1003;Gama;MG;1800;3;3;1;1\n1004;Delta;PR;2025;7,5;;;\n'
const ri = interpretarCsvIes(csv)
assert.equal(ri.formato, 'LARGO'); assert.equal(ri.delimitador, ';')
assert.equal(ri.linhas.length, 2)
assert.deepEqual(ri.linhas[0].medidas.map((m) => [m.indicador, m.valor]), [['CPC', 3.85], ['IGC', 3.41], ['NUM_CURSOS', 12], ['NUM_ALUNOS', 4500]])
assert.equal(ri.linhas[1].medidas.find((m) => m.indicador === 'CPC'), undefined)
assert.ok(ri.ignoradas.some((x) => /identificação/.test(x.motivo))); assert.ok(ri.ignoradas.some((x) => /Ano/.test(x.motivo))); assert.ok(ri.ignoradas.some((x) => /acima de 5/.test(x.motivo)))
const longo = interpretarCsvIes('codigo_ies,nome,ano,indicador,valor,curso\n1001,Alfa,2024,CPC,"3,9",Odontologia\n1001,Alfa,2024,xyz,1,\n')
assert.equal(longo.formato, 'LONGO'); assert.equal(longo.linhas.length, 1); assert.equal(longo.linhas[0].curso, 'Odontologia')
assert.equal(interpretarCsvIes('so cabecalho').linhas.length, 0)
const rk = ranquear([{ valor: 4 }, { valor: 4 }, { valor: 3 }], 'MAIOR'); assert.deepEqual(rk.map((x) => x.posicao), [1, 1, 3])
assert.deepEqual(ranquear([{ valor: 1 }, { valor: 2 }], 'MENOR').map((x) => x.posicao), [1, 2])

// ---- util ----
assert.equal(cnpjValido('11.222.333/0001-81'), true); assert.equal(cnpjValido('11.222.333/0001-82'), false); assert.equal(cnpjValido('00000000000000'), false)
assert.equal(toCsv([{ key: 'a', label: 'A' }], [{ a: 'x;"y"' }]), '﻿A\r\n"x;""y"""\r\n')

console.log('reitoria2 selftest: ok')
