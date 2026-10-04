import assert from 'node:assert/strict'
import * as L from './logic'

const d = (s: string) => new Date(s + 'T12:00:00Z')

// multa
assert.equal(L.calcularMulta(d('2026-03-10'), d('2026-03-10'), { multaDia: 1.5 }).valor, 0)
assert.equal(L.calcularMulta(d('2026-03-10'), d('2026-03-14'), { multaDia: 1.5 }).valor, 6)
assert.equal(L.calcularMulta(d('2026-03-10'), d('2026-03-14'), { multaDia: 1.5 }, { tolerancia: 1 }).diasAtraso, 3)
const lim = L.calcularMulta(d('2026-03-10'), d('2026-04-10'), { multaDia: 2, multaMaxima: 20 })
assert.equal(lim.valor, 20); assert.equal(lim.limitada, true)
// dias úteis: vence sexta 2026-03-13; devolve segunda 2026-03-16 => 1 dia útil
assert.equal(L.diasDeAtraso(d('2026-03-13'), d('2026-03-16'), { somenteUteis: true }), 1)
assert.equal(L.diasDeAtraso(d('2026-03-13'), d('2026-03-16'), { somenteUteis: false }), 3)
assert.equal(L.diasDeAtraso(d('2026-03-13'), d('2026-03-17'), { somenteUteis: true, feriados: ['2026-03-16'] }), 1)
// prazo em dias úteis
assert.equal(L.isoDay(L.somarDias(d('2026-03-12'), 3, { somenteUteis: true })), '2026-03-17')
assert.equal(L.isoDay(L.somarDias(d('2026-03-12'), 7)), '2026-03-19')
// elegibilidade
const pol = L.POLITICAS_PADRAO.ALUNO
assert.deepEqual(L.verificarElegibilidade({ politica: pol, leitor: { ativo: true }, emprestimosAtivos: 0, atrasados: 0, multasAbertasValor: 0, valorMaxMultaAberta: 0 }), [])
assert.equal(L.verificarElegibilidade({ politica: pol, leitor: { ativo: true }, emprestimosAtivos: 3, atrasados: 1, multasAbertasValor: 5, valorMaxMultaAberta: 0 }).length, 3)
assert.equal(L.verificarElegibilidade({ politica: pol, leitor: { ativo: true, bloqueadoAte: new Date(Date.now() + 86400000) }, emprestimosAtivos: 0, atrasados: 0, multasAbertasValor: 0, valorMaxMultaAberta: 0 }).length, 1)
// renovação
const agora = d('2026-03-10')
assert.equal(L.podeRenovar({ renovacoes: 0, maxRenovacoes: 2, status: 'ATIVO', prevista: d('2026-03-12'), agora, reservasAguardando: 0 }).ok, true)
assert.equal(L.podeRenovar({ renovacoes: 2, maxRenovacoes: 2, status: 'ATIVO', prevista: d('2026-03-12'), agora, reservasAguardando: 0 }).ok, false)
assert.equal(L.podeRenovar({ renovacoes: 0, maxRenovacoes: 2, status: 'ATIVO', prevista: d('2026-03-12'), agora, reservasAguardando: 1 }).ok, false)
assert.equal(L.podeRenovar({ renovacoes: 0, maxRenovacoes: 2, status: 'ATIVO', prevista: d('2026-03-01'), agora, reservasAguardando: 0 }).ok, false)
assert.equal(L.isoDay(L.novaDataRenovacao(d('2026-03-12'), agora, 7)), '2026-03-19')
// fila
const fila = [{ id: 'b', createdAt: d('2026-03-02') }, { id: 'a', createdAt: d('2026-03-01') }, { id: 'c', createdAt: d('2026-03-03') }]
assert.equal(L.posicaoNaFila(fila, 'a'), 1)
assert.equal(L.posicaoNaFila(fila, 'c'), 3)
assert.deepEqual(L.distribuirFila(fila, ['x1', 'x2']), [{ reservaId: 'a', exemplarId: 'x1' }, { reservaId: 'b', exemplarId: 'x2' }])
// ISBN
assert.equal(L.validarIsbn('978-85-7522-403-8'), true)
assert.equal(L.validarIsbn('0-306-40615-2'), true)
assert.equal(L.validarIsbn('978-85-7522-403-9'), false)
assert.equal(L.validarIsbn('123'), false)
assert.equal(L.normalizarIsbn('85-7522-403-X'), '857522403X')
// CSV
const csv = 'Título;Autor;Ano;Exemplares\n"Anatomia; Humana";"Netter, F.; Hansen";2019;3\nFisiologia;Guyton;2017;2\n'
const rows = L.parseCsv(csv)
assert.equal(rows.length, 2)
assert.equal(rows[0].titulo, 'Anatomia; Humana')
assert.equal(rows[0].exemplares, '3')
assert.deepEqual(L.listaDeTexto(rows[0].autores), ['Netter, F.', 'Hansen'])
assert.equal(L.parseCsv('a,b\r\n1,"x ""y"""\r\n')[0].b, 'x "y"')
// adequação
const P = { minTitulosBasicos: 3, minTitulosComplementares: 5, vagasPorExemplar: 5 }
const T = (n: number, ex: number, tipo: 'BASICA' | 'COMPLEMENTAR', virtual = false) => Array.from({ length: n }, (_, i) => ({ obraId: `${tipo}${i}`, titulo: `T${tipo}${i}`, tipo, exemplares: ex, virtual }))
let a = L.avaliarAdequacao([...T(3, 7, 'BASICA'), ...T(5, 1, 'COMPLEMENTAR')], 100, P)
assert.equal(a.status, 'ADEQUADA'); assert.equal(a.exemplaresNecessariosPorTitulo, 7)
a = L.avaliarAdequacao([...T(3, 2, 'BASICA'), ...T(5, 1, 'COMPLEMENTAR')], 100, P)
assert.equal(a.status, 'PARCIAL'); assert.equal(a.lacunas.filter((l) => l.codigo === 'EXEMPLARES').length, 3)
a = L.avaliarAdequacao([...T(3, 0, 'BASICA', true), ...T(5, 0, 'COMPLEMENTAR', true)], 100, P)
assert.equal(a.status, 'ADEQUADA')
a = L.avaliarAdequacao(T(1, 0, 'BASICA'), 100, P)
assert.equal(a.status, 'INADEQUADA'); assert.ok(a.lacunas.some((l) => l.codigo === 'TITULOS_BASICOS' && l.faltam === 2))
a = L.avaliarAdequacao([], 0, P)
assert.equal(a.status, 'INADEQUADA')
// repositório
assert.equal(L.situacaoAcesso({ status: 'PUBLICADO', embargoAte: new Date(Date.now() + 1e9) }), 'EMBARGADO')
assert.equal(L.situacaoAcesso({ status: 'PUBLICADO', embargoAte: new Date(Date.now() - 1e9) }), 'ABERTO')
assert.equal(L.situacaoAcesso({ status: 'PUBLICADO', restrito: true }), 'RESTRITO')
assert.equal(L.situacaoAcesso({ status: 'RASCUNHO' }), 'INDISPONIVEL')
assert.equal(L.entradaAutor('João da Silva'), 'Silva, João da'.replace('Silva, João da', 'Silva, João da'))
assert.equal(L.entradaAutor('Maria Souza Filho'), 'Souza Filho, Maria')
assert.equal(L.entradaAutor('Souza, Maria'), 'Souza, Maria')
assert.match(L.cutterSimplificado('Silva'), /^S\d\d$/)
const ficha = L.fichaCatalograficaTexto({ titulo: 'Estudo X', criadores: ['Ana Lima'], ano: 2025, paginas: 80, tipo: 'TCC', curso: 'Farmácia', instituicao: 'Faculdade Y', assuntos: ['Farmácia', 'Saúde'], orientador: 'Pedro Costa', cdd: '615.1' })
assert.ok(ficha.linhas.join('\n').includes('Lima, Ana'))
assert.ok(ficha.linhas.join('\n').includes('1. Farmácia 2. Saúde'))
assert.ok(L.dublinCoreXml({ titulo: 'A & B', criadores: ['X'], assuntos: [], colaboradores: [], tipo: 'TCC', identificador: 'h1' }).includes('A &amp; B'))
// inventário
const r = L.resumirInventario([{ situacao: 'CONFERIDO' }, { situacao: 'NAO_ENCONTRADO' }, { situacao: 'EMPRESTADO' }, { situacao: 'PENDENTE' }])
assert.equal(r.total, 4); assert.equal(r.percentualConferido, 50)
assert.equal(L.giroAcervo(10, 4), 2.5)
console.log('biblioteca selftest OK')
