import { setup, check, summary, prisma } from './qa5-lib'
import { runEduJobs } from '../../src/modules/core/jobs'

const d = (n: number) => new Date(Date.now() + n * 864e5).toISOString()
async function main() {
  const { call, t1, t2, close } = await setup()
  const admin = await t1.mk('ADMIN'), coord = await t1.mk('COORDINATOR'), tch = await t1.mk('TEACHER'), tch2 = await t1.mk('TEACHER'), tch3 = await t1.mk('TEACHER')
  const stu = await t1.mk('STUDENT', true), stu2 = await t1.mk('STUDENT', true), fin = await t1.mk('FINANCE'), lib = await t1.mk('LIBRARIAN'), sec = await t1.mk('SECRETARY')
  const admB = await t2.mk('ADMIN'), tchB = await t2.mk('TEACHER')
  const P = '/edu/pesquisa'
  // ---- publicações
  const pub = { tipo: 'ARTIGO', titulo: 'Artigo sobre ensino', ano: 2025, doi: '10.1000/xyz123', qualis: 'a1', autores: [{ tipo: 'EXTERNO', nome: 'Fulano', orcid: '0000-0002-1825-0097' }] }
  let r = await call(tch, 'POST', P + '/publicacoes', pub); check('pub criar', r.status === 201, r.text); const pb = r.json
  check('qualis normalizado', pb?.qualis === 'A1', pb?.qualis)
  r = await call(tch, 'POST', P + '/publicacoes', pub); check('pub dup 409', r.status === 409, r.text)
  r = await call(tch, 'POST', P + '/publicacoes', { ...pub, titulo: 'Outro art', doi: 'xxx' }); check('doi invalido 400', r.status === 400, r.text)
  r = await call(tch, 'POST', P + '/publicacoes', { ...pub, titulo: 'Outro art', doi: null, autores: [{ nome: 'F', orcid: '1234' }] }); check('orcid invalido 400', r.status === 400, r.text)
  r = await call(tch2, 'PUT', P + '/publicacoes/' + pb.id, { titulo: 'Novo' }); check('outro docente nao edita 403', r.status === 403, r.text)
  r = await call(tch, 'PUT', P + '/publicacoes/' + pb.id, { citacoes: 5 }); check('pub edit', r.status === 200 && r.json.autores.length >= 1, r.text)
  r = await call(stu, 'POST', P + '/publicacoes', pub); check('aluno nao cria 403', r.status === 403)
  r = await call(admB, 'GET', P + '/publicacoes/' + pb.id); check('pub tenant B 404', r.status === 404)
  r = await call(admB, 'DELETE', P + '/publicacoes/' + pb.id); check('del tenant B 404', r.status === 404)
  r = await call(tch, 'POST', P + '/publicacoes/importar', { formato: 'BIBTEX', conteudo: '@article{a, title={Titulo Bib Um}, author={Silva, Joao and Souza, Maria}, year={2024}, journal={Rev X}, doi={10.1/abc}}\n@book{b, title={Livro Dois}, author={Pereira, Ana}, year={2023}, publisher={Ed}}', dryRun: true }); check('importar dry', r.status === 200 && r.json.criadas === 2, r.text)
  r = await call(tch, 'POST', P + '/publicacoes/importar', { formato: 'BIBTEX', conteudo: '@article{a, title={Titulo Bib Um}, author={Silva, Joao and Souza, Maria}, year={2024}, journal={Rev X}, doi={10.1000/abc}}\n@book{b, title={Livro Dois}, author={Pereira, Ana}, year={2023}, publisher={Ed}}' }); check('importar', r.status === 201 && r.json.criadas === 2, r.text)
  r = await call(tch, 'POST', P + '/publicacoes/importar', { formato: 'BIBTEX', conteudo: '@article{a, title={Titulo Bib Um}, author={Silva, Joao and Souza, Maria}, year={2024}, journal={Rev X}, doi={10.1000/abc}}' }); check('importar dup', r.status === 201 && r.json.duplicadas.length === 1, r.text)
  r = await call(tch, 'GET', P + '/indicadores/producao'); check('ind producao', r.status === 200, r.text)
  r = await call(tch, 'GET', P + '/indicadores/docente/' + tch.id); check('ind docente', r.status === 200, r.text)
  // grupos
  r = await call(coord, 'POST', P + '/grupos', { nome: 'Grupo A', liderUserId: tch.id }); check('grupo', r.status === 201, r.text); const g = r.json
  r = await call(coord, 'POST', P + '/grupos-membros', { grupoId: g.id, userId: tch.id, nome: 'Xx' }); check('membro dup 409', r.status === 409, r.text)
  r = await call(coord, 'POST', P + '/grupos-membros', { grupoId: g.id, studentId: stu.studentId, tipo: 'ALUNO', nome: 'Aluno', papel: 'ESTUDANTE' }); check('membro', r.status === 201, r.text)
  r = await call(coord, 'GET', P + `/grupos/${g.id}/painel`); check('painel grupo', r.status === 200, r.text)
  // ---- projeto
  r = await call(tch, 'POST', P + '/projetos', { titulo: 'Projeto de IC sobre aprendizagem', tipo: 'PIBIC', orcamentoTotal: 1000, dataInicio: d(10), dataFim: d(375), resumo: 'r', objetivos: 'o', metodologia: 'm' }); check('projeto', r.status === 201, r.text); const pj = r.json
  const rs = await Promise.all([1, 2, 3, 4, 5].map((i) => call(tch, 'POST', P + '/projetos', { titulo: 'Projeto concorrente ' + i }))); check('projetos concorrentes', rs.every((x) => x.status === 201) && new Set(rs.map((x) => x.json.codigo)).size === 5, rs.map((x) => x.status + (x.json?.codigo ?? '')))
  r = await call(tch, 'POST', P + '/projetos', { titulo: 'Projeto', dataInicio: d(10), dataFim: d(5) }); check('projeto titulo curto 400', r.status === 400, r.text)
  r = await call(tch2, 'PUT', P + '/projetos/' + pj.id, { resumo: 'x' }); check('outro docente 403', r.status === 403, r.text)
  r = await call(tch, 'POST', P + `/projetos/${pj.id}/transicao`, { para: 'SUBMETIDO' }); check('submeter sem etapa 422', r.status === 422, r.text)
  r = await call(tch, 'POST', P + '/projetos-etapas', { projetoId: pj.id, titulo: 'Etapa 1', inicioPrevisto: d(11), fimPrevisto: d(100) }); check('etapa', r.status === 201, r.text)
  r = await call(tch, 'POST', P + '/projetos-etapas', { projetoId: pj.id, titulo: 'Etapa fora', inicioPrevisto: d(1), fimPrevisto: d(100) }); check('etapa fora 400', r.status === 400, r.text)
  r = await call(tch, 'POST', P + '/projetos-rubricas', { projetoId: pj.id, categoria: 'BOLSA', descricao: 'Bolsas', valorPrevisto: 800 }); check('rubrica', r.status === 201, r.text); const rub = r.json
  r = await call(tch, 'POST', P + '/projetos-rubricas', { projetoId: pj.id, categoria: 'CUSTEIO', descricao: 'Mais', valorPrevisto: 300 }); check('rubrica excede 422', r.status === 422, r.text)
  r = await call(tch, 'POST', P + `/projetos/${pj.id}/transicao`, { para: 'EM_AVALIACAO' }); check('prof nao avalia 403', r.status === 403, r.text)
  r = await call(tch, 'POST', P + `/projetos/${pj.id}/transicao`, { para: 'SUBMETIDO' }); check('submeter', r.status === 200, r.text)
  r = await call(tch, 'POST', P + `/projetos/${pj.id}/transicao`, { para: 'SUBMETIDO' }); check('submeter 2x 409', r.status === 409, r.text)
  r = await call(coord, 'POST', P + `/projetos/${pj.id}/transicao`, { para: 'EM_EXECUCAO' }); check('pular etapa 409', r.status === 409, r.text)
  for (const para of ['EM_AVALIACAO', 'APROVADO']) { r = await call(coord, 'POST', P + `/projetos/${pj.id}/transicao`, { para }); check('proj ' + para, r.status === 200, r.text) }
  r = await call(tch, 'POST', P + `/projetos/${pj.id}/lancamentos`, { rubricaId: rub.id, descricao: 'Compra', valor: 900 }); check('lanc saldo insuf 422', r.status === 422, r.text)
  r = await call(tch, 'POST', P + `/projetos/${pj.id}/lancamentos`, { rubricaId: rub.id, descricao: 'Compra', valor: 500 }); check('lanc', r.status === 201, r.text)
  r = await call(fin, 'POST', P + `/projetos/${pj.id}/lancamentos`, { rubricaId: rub.id, descricao: 'Compra2', valor: 300 }); check('lanc finance', r.status === 201, r.text)
  const lancs = await Promise.all([1, 2, 3].map(() => call(fin, 'POST', P + `/projetos/${pj.id}/lancamentos`, { rubricaId: rub.id, descricao: 'Conc', valor: 1 }))); 
  r = await call(coord, 'POST', P + `/projetos/${pj.id}/transicao`, { para: 'EM_EXECUCAO' }); check('executar', r.status === 200, r.text)
  const rels = await prisma.pesProjetoRelatorio.count({ where: { projetoId: pj.id } }); check('relatorios gerados', rels >= 1, rels)
  const rem = await prisma.eduReminder.count({ where: { tenantId: t1.tenantId, refType: 'PesProjetoRelatorio' } }); check('lembretes relatorios', rem >= 1, rem)
  r = await call(tch, 'POST', P + '/projetos-entregaveis', { projetoId: pj.id, titulo: 'Artigo final', prazo: d(300) }); check('entregavel', r.status === 201, r.text); const ent = r.json
  r = await call(tch, 'POST', P + `/projetos/${pj.id}/transicao`, { para: 'CONCLUIDO' }); check('prof conclui 403', r.status === 403)
  r = await call(coord, 'POST', P + `/projetos/${pj.id}/transicao`, { para: 'CONCLUIDO' }); check('concluir pendente 422', r.status === 422, r.text)
  r = await call(tch, 'POST', P + `/projetos-entregaveis/${ent.id}/entregar`, { url: 'http://x' }); check('entregar', r.status === 200, r.text)
  // ---- edital -> bolsas
  const ed = { numero: 'ED-001/' + Math.random().toString(36).slice(2, 5), titulo: 'Edital IC teste', tipo: 'PIBIC', dataAbertura: d(-1), dataFechamento: d(30), vagas: 1, vagasSuplentes: 1, valorBolsa: 400, duracaoMeses: 6, notaMinima: 5, criterios: [{ nome: 'merito', peso: 2, notaMax: 10 }, { nome: 'viab', peso: 1, notaMax: 10 }] }
  r = await call(coord, 'POST', P + '/editais', { ...ed, dataFechamento: d(-5) }); check('edital datas 400', r.status === 400, r.text)
  r = await call(coord, 'POST', P + '/editais', ed); check('edital', r.status === 201, r.text); const e = r.json
  r = await call(coord, 'POST', P + '/editais', ed); check('edital num dup 4xx', r.status >= 400 && r.status < 500, r.text)
  r = await call(tch, 'POST', P + '/inscricoes', { editalId: e.id, titulo: 'Inscricao um' }); check('inscricao em rascunho 409', r.status === 409, r.text)
  r = await call(coord, 'POST', P + `/editais/${e.id}/transicao`, { para: 'RESULTADO_PUBLICADO' }); check('edital transicao invalida 409', r.status === 409, r.text)
  r = await call(coord, 'POST', P + `/editais/${e.id}/transicao`, { para: 'ABERTO' }); check('edital abrir', r.status === 200, r.text)
  r = await call(stu, 'GET', P + '/editais'); check('aluno ve editais', r.status === 200 && r.json.items.length >= 1, r.text)
  const insc: any[] = []
  for (const [u, s, t] of [[tch, stu, 'Inscricao Alfa'], [tch2, stu2, 'Inscricao Beta'], [tch3, null, 'Inscricao Gama']] as any) {
    r = await call(u, 'POST', P + '/inscricoes', { editalId: e.id, titulo: t, bolsistaStudentId: s?.studentId }); check('inscrever ' + t, r.status === 201, r.text); insc.push(r.json)
  }
  r = await call(tch2, 'POST', P + '/inscricoes', { editalId: e.id, titulo: 'Inscricao Delta', bolsistaStudentId: stu.studentId }); check('aluno ja indicado 409', r.status === 409, r.text)
  r = await call(tch, 'POST', P + '/inscricoes', { editalId: e.id, titulo: 'inscricao alfa' }); check('inscr dup 409', r.status === 409, r.text)
  r = await call(tch2, 'GET', P + '/inscricoes'); check('docente ve so suas', r.status === 200 && r.json.items.every((i: any) => i.proponenteUserId === tch2.id), r.text)
  r = await call(coord, 'POST', P + `/editais/${e.id}/transicao`, { para: 'EM_AVALIACAO' }); check('avaliacao sem homologar 422', r.status === 422, r.text)
  r = await call(coord, 'POST', P + `/inscricoes/${insc[2].id}/homologar`, { deferir: false }); check('indeferir sem just 400', r.status === 400, r.text)
  r = await call(coord, 'POST', P + `/inscricoes/${insc[2].id}/homologar`, { deferir: false, justificativa: 'sem aluno' }); check('indeferir', r.status === 200, r.text)
  for (const i of insc.slice(0, 2)) { r = await call(coord, 'POST', P + `/inscricoes/${i.id}/homologar`, { deferir: true }); check('homologar', r.status === 200, r.text) }
  r = await call(coord, 'POST', P + `/inscricoes/${insc[0].id}/homologar`, { deferir: true }); check('homologar 2x 409', r.status === 409, r.text)
  r = await call(coord, 'POST', P + `/inscricoes/${insc[0].id}/avaliadores`, { avaliadores: [tch.id] }); check('conflito proponente 422', r.status === 422, r.text)
  r = await call(coord, 'POST', P + `/editais/${e.id}/transicao`, { para: 'EM_AVALIACAO' }); check('em avaliacao', r.status === 200, r.text)
  const notas = [[9, 8], [6, 6]]
  for (let k = 0; k < 2; k++) {
    const avs = [tch3, k === 0 ? tch2 : tch, coord].filter((x) => x.id !== (k === 0 ? tch.id : tch2.id)).slice(0, 2)
    r = await call(coord, 'POST', P + `/inscricoes/${insc[k].id}/avaliadores`, { avaliadores: avs.map((a) => a.id) }); check('designar avaliadores', r.status === 201 && r.json.avaliacoes.length === 2, r.text)
    for (const [ai, av] of avs.entries()) {
      const aid = r.json.avaliacoes[ai].id
      const bad = await call(av, 'POST', P + `/avaliacoes/${aid}/concluir`, { notas: { merito: 11, viab: 5 }, parecer: 'parecer longo suficiente' }); check('nota fora faixa 422', bad.status === 422, bad.text)
      const mi = await call(av, 'POST', P + `/avaliacoes/${aid}/concluir`, { notas: { merito: 5 }, parecer: 'parecer longo suficiente' }); check('nota faltando 422', mi.status === 422, mi.text)
      const o = await call(avs[1 - ai], 'POST', P + `/avaliacoes/${aid}/concluir`, { notas: { merito: 5, viab: 5 }, parecer: 'parecer longo suficiente' }); check('avaliacao alheia 403', o.status === 403, o.text)
      const ok = await call(av, 'POST', P + `/avaliacoes/${aid}/concluir`, { notas: { merito: notas[k][0], viab: notas[k][1] }, parecer: 'parecer longo suficiente' }); check('concluir aval', ok.status === 200, ok.text)
      if (ai === 1) check('inscricao avaliada', ok.json.inscricaoStatus === 'AVALIADA' && ok.json.notaFinal != null, ok.text)
      const again = await call(av, 'POST', P + `/avaliacoes/${aid}/concluir`, { notas: { merito: 5, viab: 5 }, parecer: 'parecer longo suficiente' }); check('concluir 2x 409', again.status === 409, again.text)
    }
  }
  r = await call(coord, 'POST', P + `/inscricoes/${insc[0].id}/implantar`, { dataInicio: d(0) }); check('implantar antes resultado 409', r.status === 409, r.text)
  r = await call(coord, 'POST', P + `/editais/${e.id}/transicao`, { para: 'RESULTADO_PUBLICADO' }); check('resultado', r.status === 200 && r.json.resultado.contempladas === 1 && r.json.resultado.suplentes === 1, r.text)
  const i0 = await prisma.pesEditalInscricao.findMany({ where: { editalId: e.id }, orderBy: { classificacao: 'asc' } }); console.log('  status inscr', i0.map((x) => `${x.titulo}:${x.status}:${x.classificacao}:${x.notaFinal}`))
  r = await call(coord, 'POST', P + `/inscricoes/${insc[0].id}/implantar`, { dataInicio: d(0) }); check('implantar', r.status === 201, r.text); const bolsa = r.json?.bolsa
  r = await call(coord, 'POST', P + `/inscricoes/${insc[0].id}/implantar`, { dataInicio: d(0) }); check('implantar 2x 409', r.status === 409, r.text)
  const pgs = await prisma.pesBolsaPagamento.findMany({ where: { bolsaId: bolsa?.id } }); check('pagamentos gerados 6-7', pgs.length >= 6 && pgs.length <= 7, pgs.length)
  r = await call(stu, 'GET', P + '/minhas-bolsas'); check('aluno ve sua bolsa', r.status === 200 && r.json.items.length === 1, r.text)
  r = await call(stu2, 'GET', P + '/minhas-bolsas'); check('aluno2 nao ve', r.status === 200 && r.json.items.length === 0, r.text)
  r = await call(stu, 'GET', P + '/bolsas'); check('aluno lista bolsas 403', r.status === 403)
  r = await call(coord, 'POST', P + '/bolsas', { studentId: stu.studentId, modalidade: 'PIBIC', agencia: 'INSTITUCIONAL', valorMensal: 400, dataInicio: d(0), dataFim: d(90) }); check('bolsa duplicada 409', r.status === 409, r.text)
  const comp = pgs.sort((a, b) => a.competencia.localeCompare(b.competencia))[0].competencia
  r = await call(fin, 'POST', P + `/bolsas/${bolsa.id}/pagamentos/${comp}/liberar?pago=true`, {}); check('liberar pagamento', r.status === 200 && r.json.status === 'PAGO', r.text)
  r = await call(fin, 'POST', P + `/bolsas/${bolsa.id}/pagamentos/${comp}/liberar`, {}); check('pagar 2x 409', r.status === 409, r.text)
  r = await call(fin, 'POST', P + `/bolsas/${bolsa.id}/pagamentos/1999-01/liberar`, {}); check('competencia inexistente 404', r.status === 404, r.text)
  r = await call(coord, 'POST', P + `/bolsas/${bolsa.id}/status`, { para: 'SUSPENSA', motivo: 'teste' }); check('suspender', r.status === 200, r.text)
  r = await call(fin, 'POST', P + `/bolsas/${bolsa.id}/pagamentos/${pgs[1].competencia}/liberar`, {}); check('pagar bolsa suspensa 409', r.status === 409, r.text)
  r = await call(coord, 'POST', P + `/bolsas/${bolsa.id}/status`, { para: 'ATIVA', motivo: 'volta' }); check('reativar', r.status === 200, r.text)
  const pgs2 = await prisma.pesBolsaPagamento.findMany({ where: { bolsaId: bolsa.id } }); check('pagamento PAGO preservado, demais PREVISTO', pgs2.filter((p) => p.status === 'PAGO').length === 1 && pgs2.filter((p) => p.status === 'PREVISTO').length === pgs2.length - 1, pgs2.map((p) => p.status))
  r = await call(coord, 'POST', P + `/bolsas/${bolsa.id}/status`, { para: 'ENCERRADA', motivo: 'fim' }); check('encerrar', r.status === 200, r.text)
  r = await call(coord, 'POST', P + `/bolsas/${bolsa.id}/status`, { para: 'ATIVA', motivo: 'volta' }); check('reabrir encerrada 409', r.status === 409, r.text)
  r = await call(admB, 'POST', P + `/bolsas/${bolsa.id}/status`, { para: 'CANCELADA', motivo: 'xxx' }); check('bolsa tenant B 404', r.status === 404, r.text)
  r = await call(admB, 'GET', P + `/editais/${e.id}`); check('edital tenant B 404', r.status === 404)
  r = await call(admB, 'POST', P + `/editais/${e.id}/transicao`, { para: 'ENCERRADO' }); check('edital transicao tenant B 404', r.status === 404)
  // ---- TCC
  const mkT = async (tipo: string, s: any) => (await call(coord, 'POST', P + '/trabalhos', { tipo, titulo: 'Trabalho ' + tipo + ' sobre algo', studentId: s.studentId, orientadorUserId: tch.id }))
  r = await mkT('TCC', stu); check('trabalho', r.status === 201, r.text); const tr = r.json
  r = await mkT('TCC', stu); check('trabalho dup 409', r.status === 409, r.text)
  r = await call(stu2, 'GET', P + '/trabalhos/' + tr.id); check('aluno2 404', r.status === 404, r.text)
  r = await call(tch2, 'GET', P + '/trabalhos/' + tr.id); check('outro docente 404', r.status === 404, r.text)
  r = await call(tch, 'POST', P + `/trabalhos/${tr.id}/transicao`, { para: 'DEFESA' }); check('pular 409', r.status === 409, r.text)
  for (const para of ['ORIENTACAO']) { r = await call(tch, 'POST', P + `/trabalhos/${tr.id}/transicao`, { para }); check('trab ' + para, r.status === 200, r.text) }
  r = await call(stu, 'POST', P + `/trabalhos/${tr.id}/versoes`, { tipo: 'PROJETO', texto: 'Texto do projeto. '.repeat(30) }); check('versao projeto', r.status === 201, r.text)
  r = await call(stu, 'POST', P + `/trabalhos/${tr.id}/versoes`, { tipo: 'FINAL', texto: 'x'.repeat(10) }); check('versao final cedo 409', r.status === 409, r.text)
  r = await call(tch, 'POST', P + `/trabalhos/${tr.id}/transicao`, { para: 'PROJETO' }); check('trab PROJETO', r.status === 200, r.text)
  r = await call(tch, 'POST', P + `/trabalhos/${tr.id}/orientacoes`, { data: d(-1), resumo: 'Reunião de orientação 1' }); check('orientacao', r.status === 201, r.text)
  r = await call(tch, 'POST', P + `/trabalhos/${tr.id}/orientacoes`, { data: d(5), resumo: 'Reunião de orientação 1' }); check('orientacao futura 400', r.status === 400, r.text)
  r = await call(stu, 'POST', P + `/trabalhos/${tr.id}/versoes`, { tipo: 'DEFESA', texto: 'Texto do trabalho para a defesa. '.repeat(30) }); check('versao defesa', r.status === 201, r.text)
  r = await call(tch, 'POST', P + `/trabalhos/${tr.id}/transicao`, { para: 'BANCA_AGENDADA' }); check('banca sem data 422', r.status === 422 && r.json.pendencias.length >= 2, r.text)
  r = await call(tch, 'PATCH', P + `/trabalhos/${tr.id}`, { dataDefesa: d(20), localDefesa: 'Sala 1' }); check('data defesa', r.status === 200, r.text)
  r = await call(tch, 'PATCH', P + `/trabalhos/${tr.id}`, { dataDefesa: d(-20) }); check('data passada 400', r.status === 400, r.text)
  r = await call(tch, 'POST', P + `/trabalhos/${tr.id}/banca`, { papel: 'PRESIDENTE', userId: tch2.id }); check('presidente != orientador 422', r.status === 422, r.text)
  r = await call(tch, 'POST', P + `/trabalhos/${tr.id}/banca`, { papel: 'PRESIDENTE', userId: tch.id }); check('presidente', r.status === 201, r.text); const b1 = r.json
  r = await call(tch, 'POST', P + `/trabalhos/${tr.id}/banca`, { papel: 'PRESIDENTE', nome: 'Outro Pres' }); check('2 presidentes 409', r.status === 409, r.text)
  r = await call(tch, 'POST', P + `/trabalhos/${tr.id}/banca`, { papel: 'EXAMINADOR_INTERNO', userId: tch2.id }); check('examinador', r.status === 201, r.text); const b2 = r.json
  r = await call(tch, 'POST', P + `/trabalhos/${tr.id}/banca`, { papel: 'EXAMINADOR_EXTERNO', nome: 'Ext Fulano', email: 'ext@u.com', instituicao: 'USP' }); check('externo', r.status === 201, r.text); const b3 = r.json
  r = await call(tch, 'POST', P + `/trabalhos/${tr.id}/transicao`, { para: 'BANCA_AGENDADA' }); check('banca agendada', r.status === 200, r.text)
  r = await call(tch, 'POST', P + `/trabalhos/${tr.id}/transicao`, { para: 'DEFESA' }); check('defesa com convites pendentes 422', r.status === 422, r.text)
  r = await call(tch3, 'POST', P + `/banca/${b2.id}/convite`, { resposta: 'CONFIRMADO' }); check('convite alheio 403', r.status === 403, r.text)
  r = await call(tch2, 'POST', P + `/banca/${b2.id}/convite`, { resposta: 'CONFIRMADO' }); check('convite', r.status === 200, r.text)
  r = await call(tch, 'POST', P + `/banca/${b3.id}/convite`, { resposta: 'CONFIRMADO' }); check('convite externo', r.status === 200, r.text)
  r = await call(tch, 'POST', P + `/trabalhos/${tr.id}/transicao`, { para: 'DEFESA' }); check('defesa sem similaridade 422', r.status === 422, r.text)
  r = await call(tch, 'POST', P + `/trabalhos/${tr.id}/similaridade`, { auto: true }); check('similaridade auto', r.status === 200, r.text)
  r = await call(tch, 'POST', P + `/trabalhos/${tr.id}/similaridade`, { percentual: 50 }); check('sim reprovada', r.status === 200 && r.json.status === 'REPROVADA', r.text)
  r = await call(tch, 'POST', P + `/trabalhos/${tr.id}/similaridade`, { percentual: 50, justificativa: 'citações extensas legítimas' }); check('prof nao justifica 403', r.status === 403, r.text)
  r = await call(coord, 'POST', P + `/trabalhos/${tr.id}/similaridade`, { percentual: 50, justificativa: 'citações extensas legítimas' }); check('coord justifica', r.status === 200 && r.json.status === 'JUSTIFICADA', r.text)
  r = await call(tch, 'POST', P + `/trabalhos/${tr.id}/transicao`, { para: 'DEFESA' }); check('defesa', r.status === 200, r.text)
  r = await call(tch, 'POST', P + `/trabalhos/${tr.id}/resultado`, { notas: [{ membroId: b1.id, nota: 9 }] }); check('faltam notas 422', r.status === 422, r.text)
  r = await call(tch, 'POST', P + `/trabalhos/${tr.id}/resultado`, { notas: [{ membroId: b1.id, nota: 9 }, { membroId: b2.id, nota: 8 }, { membroId: b3.id, nota: 11 }] }); check('nota >10 400', r.status === 400, r.text)
  r = await call(tch, 'POST', P + `/trabalhos/${tr.id}/resultado`, { notas: [{ membroId: b1.id, nota: 9 }, { membroId: b2.id, nota: 8 }, { membroId: b3.id, nota: 10 }], ressalvas: 'ajustar refs' }); check('resultado', r.status === 200 && r.json.resultado === 'APROVADO_COM_RESSALVAS' && r.json.media === 9, r.text)
  r = await call(tch, 'POST', P + `/trabalhos/${tr.id}/resultado`, { notas: [{ membroId: b1.id, nota: 1 }] }); check('resultado 2x 409', r.status === 409, r.text)
  r = await call(tch, 'GET', P + `/trabalhos/${tr.id}/ata`); check('ata html', r.status === 200 && r.text.includes('Trabalho'), r.status)
  r = await call(lib, 'POST', P + `/trabalhos/${tr.id}/depositar`, { repositorioUrl: 'http://repo/1', autorizaPublicacao: true }); check('depositar sem versao final 422', r.status === 422, r.text)
  r = await call(stu, 'POST', P + `/trabalhos/${tr.id}/versoes`, { tipo: 'FINAL', arquivoUrl: 'http://f/final.pdf' }); check('versao final', r.status === 201, r.text)
  r = await call(lib, 'POST', P + `/trabalhos/${tr.id}/depositar`, { repositorioUrl: 'http://repo/1', autorizaPublicacao: true }); check('depositar', r.status === 200 && r.json.status === 'DEPOSITADO', r.text)
  r = await call(lib, 'POST', P + `/trabalhos/${tr.id}/depositar`, { repositorioUrl: 'http://repo/1', autorizaPublicacao: true }); check('depositar 2x 409', r.status === 409, r.text)
  r = await call(coord, 'GET', P + '/trabalhos-painel'); check('painel', r.status === 200, r.text)
  r = await call(admB, 'GET', P + '/trabalhos/' + tr.id); check('trab tenant B 404', r.status === 404)
  // tese: requisitos
  r = await mkT('TESE', stu2); check('tese', r.status === 201, r.text)
  // jobs
  await prisma.pesProjetoRelatorio.updateMany({ where: { projetoId: pj.id }, data: { prazo: new Date(Date.now() - 864e5 * 3) } })
  r = await call(coord, 'POST', P + `/projetos-relatorios/${(await prisma.pesProjetoRelatorio.findFirst({ where: { projetoId: pj.id } }))!.id}/entregar`, { conteudo: 'x'.repeat(10) }); check('relatorio curto 400', r.status === 400, r.text)
  const j = await runEduJobs(); check('jobs ok', Object.values(j).every((x: any) => x.ok), Object.entries(j).filter(([, v]: any) => !v.ok))
  const j2 = await runEduJobs(); check('jobs 2x ok', Object.values(j2).every((x: any) => x.ok))
  const dd = await prisma.eduReminder.groupBy({ by: ['dedupeKey'], where: { tenantId: t1.tenantId, dedupeKey: { not: null } }, _count: true, having: { dedupeKey: { _count: { gt: 1 } } } }); check('sem lembrete duplicado', dd.length === 0)
  // bolsa bloqueada por relatório em atraso
  r = await call(coord, 'POST', P + `/projetos/${pj.id}/transicao`, { para: 'CANCELADO' }); check('cancelar projeto sem motivo 422', r.status === 422, r.text)
  await close(); summary()
}
main().catch((e) => { console.error(e); process.exit(2) })
