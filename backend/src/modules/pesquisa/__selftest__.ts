// Rode com: npx tsx src/modules/pesquisa/__selftest__.ts
import assert from 'node:assert/strict'
import {
  TRANSICOES_SUBMISSAO, TRANSICOES_TRABALHO, anonimizarSubmissao, calcularNotaAvaliacao, calcularResultadoBanca, classificarInscricoes, competenciasBolsa, consolidarRecomendacoes, decidirTrabalhoEvento,
  distribuirAvaliacoes, estatisticasPeriodico, hashDedupe, indicadoresProducao, normalizarDoi, normalizarOrcid, parseBibtex, pendenciasTrabalho, podeTransicionar, prazosDefesa, progressoProjeto,
  relatoriosObrigatorios, resumoOrcamento, similaridadeTexto, situacaoEtapa, statusSimilaridade, sugerirRevisores, validarIssn, validarNotasParecer, validarOrcid, citarArtigo, pontuacaoPublicacao,
} from './lib'
import { ataDefesaHtml } from './ata'

const d = (s: string) => new Date(s + 'T12:00:00Z')

// identificadores
assert.equal(validarOrcid('0000-0002-1825-0097'), true)
assert.equal(validarOrcid('https://orcid.org/0000-0002-1694-233X'), true)
assert.equal(validarOrcid('0000-0002-1825-0098'), false)
assert.equal(normalizarOrcid('0000000218250097'), '0000-0002-1825-0097')
assert.equal(validarIssn('0378-5955'), true)
assert.equal(validarIssn('0378-5954'), false)
assert.equal(normalizarDoi('https://doi.org/10.1000/ABC.123'), '10.1000/abc.123')
assert.equal(normalizarDoi('abc'), null)
assert.equal(hashDedupe('ARTIGO', 'Título X', 2020, '10.1234/ABC'), 'doi:10.1234/abc')
assert.equal(hashDedupe('ARTIGO', 'Título  Ação!', 2020), 'ARTIGO:2020:titulo acao')

// BibTeX
const bib = `
@article{silva2021,
  author = {Silva, João and Maria Souza},
  title = {Efeitos de {A} em {B}: uma revisão},
  journal = {Revista de Testes},
  year = {2021}, volume = {10}, number = "2", pages = {100--110},
  doi = {10.1234/rt.2021.10},
  keywords = {saúde, educação; pesquisa}
}
@inproceedings{x, title={Anais}, booktitle={Congresso X}, year=2020}
@book{semano, title={Sem ano}}
@comment{ignorar}
`
const r = parseBibtex(bib)
assert.equal(r.itens.length, 2)
assert.equal(r.erros.length, 1)
assert.equal(r.itens[0].tipo, 'ARTIGO')
assert.deepEqual(r.itens[0].autores, ['João Silva', 'Maria Souza'])
assert.equal(r.itens[0].paginas, '100-110')
assert.equal(r.itens[0].doi, '10.1234/rt.2021.10')
assert.equal(r.itens[0].titulo, 'Efeitos de A em B: uma revisão')
assert.equal(r.itens[0].palavrasChave.length, 3)
assert.equal(r.itens[1].tipo, 'TRABALHO_EVENTO')
assert.equal(r.itens[1].ano, 2020)

// indicadores
const pubs = [
  { tipo: 'ARTIGO', ano: 2022, qualis: 'A1', jcr: 3, doi: '10.1/x', autores: [{ tipo: 'DOCENTE', userId: 'u1' }, { tipo: 'DOCENTE', userId: 'u2' }, { tipo: 'ALUNO' }] },
  { tipo: 'ARTIGO', ano: 2023, qualis: 'B2', autores: [{ tipo: 'DOCENTE', userId: 'u1' }] },
  { tipo: 'LIVRO', ano: 2023, autores: [{ tipo: 'DOCENTE', userId: 'u2' }] },
  { tipo: 'TRABALHO_EVENTO', ano: 2021, autores: [{ tipo: 'EXTERNO' }] },
] as any[]
const ind = indicadoresProducao(pubs)
assert.equal(ind.total, 4)
assert.equal(ind.porTipo.ARTIGO, 2)
assert.equal(ind.comDiscentes, 1)
assert.equal(ind.percentualQualisAlto, 50)
assert.equal(ind.percentualComDoi, 25)
assert.equal(ind.docentesAtivos, 2)
assert.equal(ind.mediaJcr, 3)
assert.equal(pontuacaoPublicacao(pubs[0]), 115) // A1=100 + JCR 3*5
assert.equal(indicadoresProducao(pubs, { anoInicio: 2023 }).total, 2)
assert.equal(indicadoresProducao(pubs, { userId: 'u1' }).total, 2)
const u1 = ind.porDocente.find((x) => x.userId === 'u1')!
assert.equal(u1.total, 2)
assert.ok(u1.pontuacaoFracionada < u1.pontuacao)

// máquinas de estado
assert.ok(podeTransicionar(TRANSICOES_SUBMISSAO, 'SUBMETIDO', 'TRIAGEM'))
assert.ok(!podeTransicionar(TRANSICOES_SUBMISSAO, 'SUBMETIDO', 'PUBLICADO'))
assert.ok(!podeTransicionar(TRANSICOES_SUBMISSAO, 'PUBLICADO', 'EM_REVISAO'))
assert.ok(podeTransicionar(TRANSICOES_SUBMISSAO, 'REVISOES_SOLICITADAS', 'EM_REVISAO'))
assert.ok(podeTransicionar(TRANSICOES_TRABALHO, 'DEFESA', 'VERSAO_FINAL'))
assert.ok(!podeTransicionar(TRANSICOES_TRABALHO, 'TEMA', 'DEFESA'))

// pendências do TCC
const base: any = { tipo: 'DISSERTACAO', status: 'PROJETO', orientadorUserId: 'o1', dataDefesa: null, versoes: [], banca: [], exigeQualificacao: true }
let p = pendenciasTrabalho(base, 'BANCA_AGENDADA')
assert.ok(p.some((x) => x.includes('data da defesa')))
assert.ok(p.some((x) => x.includes('3 membros')))
assert.ok(p.some((x) => x.includes('externo')))
assert.ok(p.some((x) => x.includes('Qualificação')))
const completo: any = { ...base, status: 'QUALIFICACAO', dataDefesa: d('2026-12-01'), versoes: [{ tipo: 'QUALIFICACAO' }, { tipo: 'DEFESA' }], banca: [
  { fase: 'DEFESA', papel: 'PRESIDENTE', convite: 'CONFIRMADO' }, { fase: 'DEFESA', papel: 'EXAMINADOR_INTERNO', convite: 'PENDENTE' }, { fase: 'DEFESA', papel: 'EXAMINADOR_EXTERNO', convite: 'PENDENTE' }] }
assert.deepEqual(pendenciasTrabalho(completo, 'BANCA_AGENDADA'), [])
completo.similaridadeStatus = 'NAO_VERIFICADA'
p = pendenciasTrabalho(completo, 'DEFESA')
assert.ok(p.some((x) => x.includes('pendentes')) && p.some((x) => x.includes('similaridade')))
assert.ok(pendenciasTrabalho({ ...base, tipo: 'TCC', exigeQualificacao: false, versoes: [{ tipo: 'DEFESA' }], dataDefesa: d('2026-12-01'), banca: [{ fase: 'DEFESA', papel: 'PRESIDENTE', convite: 'CONFIRMADO' }, { fase: 'DEFESA', papel: 'EXAMINADOR_INTERNO', convite: 'CONFIRMADO' }] }, 'BANCA_AGENDADA').length === 0)
assert.ok(pendenciasTrabalho({ ...base, resultado: null }, 'VERSAO_FINAL').length === 1)

// banca
let rb = calcularResultadoBanca([{ papel: 'PRESIDENTE', nota: 9 }, { papel: 'EXAMINADOR_INTERNO', nota: 8 }, { papel: 'EXAMINADOR_EXTERNO', nota: 7 }, { papel: 'SUPLENTE' }], { notaMinima: 7 })
assert.equal(rb.media, 8)
assert.equal(rb.resultado, 'APROVADO')
rb = calcularResultadoBanca([{ papel: 'PRESIDENTE', nota: 5 }, { papel: 'EXAMINADOR_INTERNO', nota: 6 }], { notaMinima: 7 })
assert.equal(rb.resultado, 'REPROVADO')
rb = calcularResultadoBanca([{ papel: 'PRESIDENTE', nota: 9 }, { papel: 'EXAMINADOR_INTERNO' }])
assert.equal(rb.resultado, null)
assert.equal(rb.pendentes, 1)

// similaridade
const fonte = 'a pesquisa qualitativa em saúde coletiva exige rigor metodológico e reflexão crítica constante sobre o campo'
const copia = 'Introdução. A pesquisa qualitativa em saúde coletiva exige rigor metodológico e reflexão crítica constante sobre o campo. Texto original completamente diferente aqui para encerrar o parágrafo com palavras novas'
const sim = similaridadeTexto(copia, [{ id: 'f1', texto: fonte }], 6)
assert.ok(sim.percentual > 40 && sim.percentual < 80, String(sim.percentual))
assert.equal(sim.porFonte[0].id, 'f1')
assert.ok(sim.trechos[0].includes('pesquisa qualitativa'))
assert.equal(similaridadeTexto('um texto totalmente diferente e curto sem nada em comum mesmo', [{ id: 'f', texto: fonte }]).percentual, 0)
assert.equal(statusSimilaridade(25, 20), 'REPROVADA')
assert.equal(statusSimilaridade(20, 20), 'APROVADA')

// régua de prazos
const pr = prazosDefesa(d('2026-11-30'))
assert.equal(pr.length, 7)
assert.equal(pr.find((x) => x.chave === 'texto-banca')!.dueAt.toISOString().slice(0, 10), '2026-11-15')
assert.equal(pr.find((x) => x.chave === 'deposito')!.dueAt.toISOString().slice(0, 10), '2027-01-14')

// edital
const crit = [{ nome: 'A', peso: 3, notaMax: 10 }, { nome: 'B', peso: 1, notaMax: 5 }]
assert.equal(calcularNotaAvaliacao({ A: 8, B: 5 }, crit).total, 8.5) // (8*3 + 10*1)/4
assert.deepEqual(calcularNotaAvaliacao({ A: 8 }, crit).faltando, ['B'])
assert.deepEqual(calcularNotaAvaliacao({ A: 11, B: 1 }, crit).invalidas, ['A'])
const rk = classificarInscricoes([
  { id: 'a', notaFinal: 9, status: 'AVALIADA', createdAt: d('2026-03-01') },
  { id: 'b', notaFinal: 9, status: 'AVALIADA', primeiroCriterio: 8, createdAt: d('2026-03-02') },
  { id: 'c', notaFinal: 7, status: 'AVALIADA', createdAt: d('2026-03-01') },
  { id: 'd', notaFinal: 5, status: 'AVALIADA', createdAt: d('2026-03-01') },
  { id: 'e', notaFinal: 6.5, status: 'AVALIADA', createdAt: d('2026-03-01') },
], { vagas: 1, vagasSuplentes: 1, notaMinima: 6 })
assert.deepEqual(rk.map((x) => [x.id, x.status]), [['b', 'CONTEMPLADA'], ['a', 'SUPLENTE'], ['c', 'NAO_CONTEMPLADA'], ['e', 'NAO_CONTEMPLADA'], ['d', 'NAO_CONTEMPLADA']])
assert.deepEqual(competenciasBolsa(d('2026-11-15'), d('2027-02-10')), ['2026-11', '2026-12', '2027-01', '2027-02'])

// projetos
assert.equal(situacaoEtapa({ fimPrevisto: d('2020-01-01'), status: 'PLANEJADA', percentual: 20 }, d('2026-01-01')), 'ATRASADA')
assert.equal(situacaoEtapa({ fimPrevisto: d('2030-01-01'), status: 'PLANEJADA', percentual: 0 }, d('2026-01-01')), 'PLANEJADA')
assert.equal(situacaoEtapa({ fimPrevisto: d('2020-01-01'), status: 'PLANEJADA', percentual: 100 }, d('2026-01-01')), 'CONCLUIDA')
assert.equal(progressoProjeto([{ inicioPrevisto: d('2026-01-01'), fimPrevisto: d('2026-01-11'), percentual: 100 }, { inicioPrevisto: d('2026-01-11'), fimPrevisto: d('2026-01-31'), percentual: 0 }]), 33.3)
const orc = resumoOrcamento([{ id: 'r1', categoria: 'CUSTEIO', descricao: 'Reagentes', valorPrevisto: 1000 }, { id: 'r2', categoria: 'BOLSA', descricao: 'Bolsa', valorPrevisto: 500 }], [{ rubricaId: 'r1', valor: 400 }, { rubricaId: 'r2', valor: 600 }], 1200)
assert.equal(orc.previsto, 1500)
assert.equal(orc.executado, 1000)
assert.equal(orc.linhas[1].estourou, true)
assert.equal(orc.alertas.length, 2)
const rel = relatoriosObrigatorios(d('2026-03-01'), d('2027-03-01'))
assert.deepEqual(rel.map((x) => x.tipo), ['PARCIAL', 'FINAL'])
assert.equal(rel[1].prazo.toISOString().slice(0, 10), '2027-03-31')

// periódico
const est = estatisticasPeriodico([
  { status: 'PUBLICADO', dataSubmissao: d('2026-01-01'), dataDecisao: d('2026-02-01'), dataPublicacao: d('2026-04-01') },
  { status: 'REJEITADO', dataSubmissao: d('2026-01-01'), dataDecisao: d('2026-01-21') },
  { status: 'EM_REVISAO', dataSubmissao: d('2026-02-01') },
  { status: 'ACEITO', dataSubmissao: d('2026-01-01'), dataDecisao: d('2026-03-02') },
])
assert.equal(est.taxaAceitacao, 66.7)
assert.equal(est.tempoMedioDecisaoDias, 37)
assert.equal(est.tempoMedianoDecisaoDias, 31)
assert.equal(est.emAndamento, 1)
const cands = sugerirRevisores([
  { id: '1', nome: 'Ana Autora', areas: ['saúde'], cargaAtual: 0 },
  { id: '2', nome: 'Bruno Lima', areas: ['Saúde coletiva'], cargaAtual: 1, instituicao: 'Univ X' },
  { id: '3', nome: 'Carla Dias', areas: ['saúde', 'educação'], cargaAtual: 0, email: 'c@x.com' },
  { id: '4', nome: 'Davi Ocupado', areas: ['saúde'], cargaAtual: 9 },
  { id: '5', nome: 'Eva Outra', areas: ['direito'], cargaAtual: 0 },
], { areas: ['saúde'], autores: [{ nome: 'ana autora', email: 'a@x.com', afiliacao: 'Univ X' }] })
assert.equal(cands[0].id, '3')
assert.equal(cands.find((c) => c.id === '1')!.bloqueado, true)
assert.equal(cands.find((c) => c.id === '2')!.bloqueado, true) // mesma instituição
assert.equal(cands.find((c) => c.id === '4')!.bloqueado, true) // carga
assert.equal(cands.find((c) => c.id === '5')!.bloqueado, false)
assert.deepEqual(validarNotasParecer({ originalidade: 5, metodologia: 4, relevancia: 3, clareza: 2, referencias: 1 }), [])
assert.equal(validarNotasParecer({ originalidade: 6 }).length, 5)
assert.equal(consolidarRecomendacoes(['ACEITAR', 'ACEITAR']).sugestao, 'ACEITAR')
assert.equal(consolidarRecomendacoes(['ACEITAR', 'REJEITAR']).sugestao, null) // divergente → 3º parecerista
assert.equal(consolidarRecomendacoes(['REJEITAR', 'REJEITAR', 'ACEITAR']).sugestao, 'REJEITAR')
assert.equal(consolidarRecomendacoes(['REVISOES_MENORES', 'REVISOES_MAIORES']).divergente, false)
const anon: any = anonimizarSubmissao({ id: 's', titulo: 't', autores: [{ nome: 'X' }], submissorUserId: 'u', financiamento: 'CNPq' })
assert.equal(anon.autores, null)
assert.equal(anon.submissorUserId, undefined)
assert.equal(anon.financiamento, undefined)
assert.equal(anon.titulo, 't')
assert.equal(citarArtigo({ autores: ['João da Silva', 'Maria Souza'], titulo: 'Título', periodico: 'Rev', volume: 2, numero: '1', paginas: '1-10', ano: 2026, doi: '10.1234/x' }), 'SILVA, J. da; SOUZA, M.. Título. Rev, v. 2, n. 1, p. 1-10, 2026. DOI: 10.1234/x.'.replace('J. da', 'J. D.').replace('M..', 'M.'))

// eventos
assert.deepEqual(decidirTrabalhoEvento([8, 9], 6, 2), { media: 8.5, decisao: 'APROVADO' })
assert.deepEqual(decidirTrabalhoEvento([6, 7], 6, 2), { media: 6.5, decisao: 'APROVADO_COM_AJUSTES' })
assert.deepEqual(decidirTrabalhoEvento([3, 8], 6, 2), { media: 5.5, decisao: 'REPROVADO' })
assert.equal(decidirTrabalhoEvento([8], 6, 2).decisao, null)
const dist = distribuirAvaliacoes(
  [{ id: 't1', autoresUserIds: ['a1'] }, { id: 't2', autoresUserIds: [] }, { id: 't3', autoresUserIds: [] }],
  [{ userId: 'a1' }, { userId: 'a2' }, { userId: 'a3' }], 2)
assert.equal(dist.atribuicoes.length, 6)
assert.ok(!dist.atribuicoes.some((x) => x.trabalhoId === 't1' && x.avaliadorUserId === 'a1'))
assert.deepEqual(dist.semAvaliadores, [])
const cont = new Map<string, number>()
dist.atribuicoes.forEach((x) => cont.set(x.avaliadorUserId, (cont.get(x.avaliadorUserId) ?? 0) + 1))
assert.ok(Math.max(...cont.values()) - Math.min(...cont.values()) <= 1)
assert.equal(distribuirAvaliacoes([{ id: 't1', autoresUserIds: ['a1'] }], [{ userId: 'a1' }, { userId: 'a2' }], 2).semAvaliadores[0], 't1')

// ata em HTML (cabeçalho com logomarca)
const brand: any = { nome: 'Instituição <Teste>', cnpj: '00.000.000/0001-00', cores: { primaria: '#0F5FDB', secundaria: '#0B1F3A', destaque: '#21C7A8' }, logos: {}, logoPrincipal: null }
const html = ataDefesaHtml(brand, { numero: '2026/001', tipoRotulo: 'Dissertação de Mestrado', titulo: 'Um título', alunoNome: 'Fulano', dataDefesa: new Date('2026-11-30T17:00:00Z'), banca: [{ nome: 'Prof. A', papel: 'PRESIDENTE', nota: 9 }, { nome: 'Prof. B', papel: 'EXAMINADOR_EXTERNO', nota: 8 }], media: 8.5, resultado: 'APROVADO' })
assert.ok(html.includes('LOGOMARCA'))
assert.ok(html.includes('Instituição &lt;Teste&gt;'))
assert.ok(html.includes('APROVADO(A)'))
assert.ok(html.includes('8,50'))

console.log('pesquisa selftest: OK')
