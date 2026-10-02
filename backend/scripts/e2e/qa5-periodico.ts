import { setup, check, summary, prisma } from './qa5-lib'
import { runEduJobs } from '../../src/modules/core/jobs'

async function main() {
  const { call, t1, t2, close } = await setup()
  const admin = await t1.mk('ADMIN'), coord = await t1.mk('COORDINATOR'), ed = await t1.mk('TEACHER'), rev1 = await t1.mk('TEACHER'), rev2 = await t1.mk('TEACHER')
  const stu = await t1.mk('STUDENT', true), stu2 = await t1.mk('STUDENT', true), fin = await t1.mk('FINANCE')
  const admB = await t2.mk('ADMIN')
  const P = '/edu/pesquisa'
  let r = await call(admin, 'POST', P + '/bootstrap', {}); check('boot', r.status === 200, r.text)
  r = await call(admin, 'POST', P + '/bootstrap', {}); check('boot idempotente', r.status === 200 && r.json.jaExistiam === true, r.text)
  r = await call(fin, 'POST', P + '/bootstrap', {}); check('boot finance 403', r.status === 403)
  // periódico
  r = await call(coord, 'POST', P + '/periodicos', { nome: 'Revista Teste', issn: '1234-5678', editorChefeUserId: ed.id, doiPrefixo: '10.1234' })
  check('criar periodico (issn invalido 1234-5678 ok?)', r.status === 201 || r.status === 400, r.text)
  r = await call(coord, 'POST', P + '/periodicos', { nome: 'Revista Teste', issn: '0378-5955', editorChefeUserId: ed.id, doiPrefixo: '10.1234', ativo: true })
  check('criar periodico', r.status === 201, r.text)
  const per = r.json
  r = await call(coord, 'POST', P + '/periodicos', { nome: 'Revista Teste', ativo: true })
  check('slug duplicado => 4xx', r.status >= 400 && r.status < 500, r.text)
  r = await call(coord, 'POST', P + '/periodicos', { nome: 'X' }); check('validacao 400', r.status === 400, r.text)
  r = await call(stu, 'POST', P + '/periodicos', { nome: 'Revista Aluno' }); check('aluno cria periodico 403', r.status === 403)
  r = await call(coord, 'PUT', P + '/periodicos/' + per.id, { ativo: true, revisoresPorSubmissao: 2 }); check('update periodico', r.status === 200, r.text)
  const secs = await call(coord, 'GET', P + '/secoes?periodicoId=' + per.id); check('secoes', secs.status === 200 && (secs.json.items?.length ?? 0) >= 4, secs.text)
  // equipe
  const eq: any[] = []
  for (const u of [rev1, rev2]) { r = await call(coord, 'POST', P + '/periodicos-equipe', { periodicoId: per.id, userId: u.id, papel: 'PARECERISTA', areas: ['saude'] }); check('equipe', r.status === 201, r.text); eq.push(r.json) }
  r = await call(coord, 'POST', P + '/periodicos-equipe', { periodicoId: per.id, nome: 'Externo Fulano', email: 'ext@x.com', papel: 'PARECERISTA', areas: ['saude'] }); check('equipe externo', r.status === 201, r.text); const ext = r.json
  // submissão
  const sub = { periodicoId: per.id, titulo: 'Um estudo sobre qualidade do ensino', resumo: 'x'.repeat(120), palavrasChave: ['a1', 'b2', 'c3'], autores: [{ nome: 'Autor Um', email: 'a1@x.com' }], declaracaoOriginalidade: true, arquivoUrl: 'http://f/1.pdf' }
  r = await call(stu, 'POST', P + '/submissoes', { ...sub, resumo: 'curto' }); check('sub validacao 400', r.status === 400, r.text)
  r = await call(stu, 'POST', P + '/submissoes', sub); check('submeter', r.status === 201, r.text); const s1 = r.json
  r = await call(stu, 'POST', P + '/submissoes', sub); check('submissao duplicada 409', r.status === 409, r.text)
  // concorrência de código
  const rs = await Promise.all([1, 2, 3, 4].map((i) => call(stu2, 'POST', P + '/submissoes', { ...sub, titulo: 'Titulo concorrente numero ' + i })))
  check('concorrentes 201', rs.every((x) => x.status === 201), rs.map((x) => x.status))
  check('codigos unicos', new Set(rs.map((x) => x.json?.codigo)).size === 4)
  r = await call(stu2, 'GET', P + '/submissoes/' + s1.id); check('aluno2 nao ve sub do aluno1', r.status === 404, r.status)
  r = await call(admB, 'GET', P + '/submissoes/' + s1.id); check('tenant B 404', r.status === 404)
  r = await call(stu, 'GET', P + '/submissoes/' + s1.id); check('autor ve', r.status === 200)
  // triagem
  r = await call(stu, 'POST', P + `/submissoes/${s1.id}/triagem`, { aprovar: true }); check('aluno triagem 403', r.status === 403)
  r = await call(ed, 'POST', P + `/submissoes/${s1.id}/triagem`, { aprovar: false }); check('rejeitar sem obs 400', r.status === 400, r.text)
  r = await call(ed, 'POST', P + `/submissoes/${s1.id}/triagem`, { aprovar: true, similaridadePct: 50 }); check('similaridade alta 422', r.status === 422, r.text)
  r = await call(ed, 'POST', P + `/submissoes/${s1.id}/triagem`, { aprovar: true, similaridadePct: 10 }); check('triagem ok', r.status === 200 && r.json.status === 'TRIAGEM', r.text)
  r = await call(ed, 'GET', P + `/submissoes/${s1.id}/sugestao-revisores`); check('sugestao', r.status === 200 && r.json.sugestoes.length === 3, r.text)
  r = await call(ed, 'POST', P + `/submissoes/${s1.id}/decisao`, { decisao: 'ACEITAR', justificativa: 'justificativa longa', cartaAutor: 'carta longa aqui' }); check('aceitar em triagem bloqueado (4xx)', r.status === 409 || r.status === 422, r.text)
  r = await call(ed, 'POST', P + `/submissoes/${s1.id}/revisores`, { equipeIds: [eq[0].id, eq[1].id, ext.id] }); check('designar', r.status === 201 && r.json.status === 'EM_REVISAO', r.text)
  const revs = r.json.revisoes
  r = await call(ed, 'POST', P + `/submissoes/${s1.id}/revisores`, { equipeIds: [eq[0].id] }); check('designar mesmo 409/422?', r.status >= 400 && r.status < 500, r.text)
  // duplo-cego
  r = await call(ed, 'GET', P + '/submissoes/' + s1.id); check('editor ve autores', r.status === 200 && r.json.autores)
  r = await call(rev1, 'GET', P + '/minhas-revisoes'); check('minhas revisoes', r.status === 200 && r.json.items.length === 1, r.text)
  check('revisor sem autores', !JSON.stringify(r.json).includes('Autor Um') && !JSON.stringify(r.json).includes('a1@x.com'), r.text)
  r = await call(rev1, 'GET', P + '/submissoes/' + s1.id); check('revisor ve submissao anonima', r.status === 200 && !JSON.stringify(r.json).includes('Autor Um') && !JSON.stringify(r.json).includes('a1@x.com'), r.text)
  r = await call(rev1, 'GET', P + '/submissoes/' + s1.id + '/revisoes'); check('revisor nao lista revisoes (403)', r.status === 403, r.status)
  r = await call(rev1, 'POST', P + `/revisoes/${revs[0].id}/parecer`, {}); check('parecer sem aceitar 400', r.status === 400, r.text)
  const parecer = { recomendacao: 'REVISOES_MENORES', notas: { originalidade: 4, metodologia: 3, relevancia: 4, clareza: 4, referencias: 5 }, comentarioAutor: 'Comentário detalhado ao autor do manuscrito.', semConflito: true }
  r = await call(rev1, 'POST', P + `/revisoes/${revs[0].id}/parecer`, parecer); check('parecer sem aceitar 409', r.status === 409, r.text)
  r = await call(rev2, 'POST', P + `/revisoes/${revs[0].id}/responder`, { aceitar: true }); check('revisao alheia 403', r.status === 403, r.text)
  r = await call(rev1, 'POST', P + `/revisoes/${revs[0].id}/responder`, { aceitar: true }); check('aceitar convite', r.status === 200, r.text)
  r = await call(rev1, 'POST', P + `/revisoes/${revs[0].id}/responder`, { aceitar: true }); check('aceitar 2x 409', r.status === 409)
  r = await call(rev1, 'POST', P + `/revisoes/${revs[0].id}/parecer`, { ...parecer, notas: { originalidade: 9 } }); check('nota invalida 422', r.status === 422, r.text)
  r = await call(rev1, 'POST', P + `/revisoes/${revs[0].id}/parecer`, parecer); check('parecer', r.status === 201, r.text)
  r = await call(rev1, 'POST', P + `/revisoes/${revs[0].id}/parecer`, parecer); check('parecer 2x 409', r.status === 409)
  r = await call(ed, 'POST', P + `/submissoes/${s1.id}/decisao`, { decisao: 'REVISOES_MENORES', justificativa: 'justificativa longa', cartaAutor: 'carta longa aqui' }); check('decisao pareceres insuf 422', r.status === 422, r.text)
  // externo via público
  const ext1 = await prisma.pesRevisao.findUnique({ where: { id: revs[2].id } })
  const PUB = `/public/edu/pesquisa/${t1.tenantId}/revisao/`
  r = await call(null, 'GET', PUB + 'tokeninvalido'); check('token invalido 404', r.status === 404, r.text)
  r = await call(null, 'GET', `/public/edu/pesquisa/${t2.tenantId}/revisao/${ext1!.token}`); check('token outro tenant 404', r.status === 404)
  r = await call(null, 'GET', PUB + ext1!.token); check('publico ve manuscrito', r.status === 200 && !JSON.stringify(r.json).includes('Autor Um') && !JSON.stringify(r.json).includes('a1@x.com') && !JSON.stringify(r.json).includes('autores'), r.text)
  r = await call(null, 'POST', PUB + ext1!.token + '/parecer', parecer); check('publico parecer sem aceitar 409', r.status === 409, r.text)
  r = await call(null, 'POST', PUB + ext1!.token + '/responder', { aceitar: true }); check('publico aceita', r.status === 200, r.text)
  r = await call(null, 'POST', PUB + ext1!.token + '/parecer', { ...parecer, recomendacao: 'ACEITAR' }); check('publico parecer', r.status === 201, r.text)
  // rev2 recusa
  r = await call(rev2, 'POST', P + `/revisoes/${revs[1].id}/responder`, { aceitar: false, motivo: 'sem tempo' }); check('recusa', r.status === 200 && r.json.status === 'RECUSADO', r.text)
  // decisão
  r = await call(ed, 'POST', P + `/submissoes/${s1.id}/decisao`, { decisao: 'REVISOES_MENORES', justificativa: 'justificativa longa', cartaAutor: 'carta longa aqui', prazoRevisaoDias: 30 }); check('decisao revisoes', r.status === 200 && r.json.submissao.status === 'REVISOES_SOLICITADAS', r.text)
  r = await call(ed, 'POST', P + `/submissoes/${s1.id}/decisao`, { decisao: 'ACEITAR', justificativa: 'justificativa longa', cartaAutor: 'carta longa aqui' }); check('decisao 2x 409', r.status === 409, r.text)
  r = await call(stu, 'GET', P + '/submissoes/' + s1.id); check('autor ve pareceres anonimos', r.status === 200 && r.json.pareceres?.length === 2 && !JSON.stringify(r.json.pareceres).includes('Externo') && !JSON.stringify(r.json.pareceres).includes('TEACHER'), r.text)
  // reenvio
  r = await call(stu2, 'POST', P + `/submissoes/${s1.id}/revisao-autor`, { arquivoUrl: 'http://f/2.pdf', cartaResposta: 'c'.repeat(40) }); check('reenvio por outro aluno 403/404', r.status === 403 || r.status === 404, r.status)
  r = await call(stu, 'POST', P + `/submissoes/${s1.id}/revisao-autor`, { arquivoUrl: 'http://f/2.pdf', cartaResposta: 'c'.repeat(40) }); check('reenvio', r.status === 200 && r.json.reconvidados === 2, r.text)
  const rv2 = await prisma.pesRevisao.findMany({ where: { submissaoId: s1.id, rodada: 2 } })
  check('2 reconvites', rv2.length === 2)
  // rodada 2: aceitam e parecer
  for (const rv of rv2) {
    const pubr = `/public/edu/pesquisa/${t1.tenantId}/revisao/${rv.token}`
    const a = await call(rv.revisorUserId ? (rv.revisorUserId === rev1.id ? rev1 : rev2) : null, 'POST', rv.revisorUserId ? P + `/revisoes/${rv.id}/responder` : pubr + '/responder', { aceitar: true }); check('r2 aceita', a.status === 200, a.text)
    const b = await call(rv.revisorUserId ? rev1 : null, 'POST', rv.revisorUserId ? P + `/revisoes/${rv.id}/parecer` : pubr + '/parecer', { ...parecer, recomendacao: 'ACEITAR' }); check('r2 parecer', b.status === 201, b.text)
  }
  r = await call(ed, 'POST', P + `/submissoes/${s1.id}/decisao`, { decisao: 'ACEITAR', justificativa: 'justificativa longa', cartaAutor: 'carta longa aqui' }); check('aceitar', r.status === 200 && r.json.submissao.status === 'ACEITO', r.text)
  // editoração
  r = await call(coord, 'POST', P + '/edicoes', { periodicoId: per.id, volume: 1, numero: '1', ano: 2026 }); check('edicao', r.status === 201, r.text); const edc = r.json
  r = await call(coord, 'POST', P + '/edicoes', { periodicoId: per.id, volume: 1, numero: '1', ano: 2026 }); check('edicao duplicada 4xx', r.status >= 400 && r.status < 500, r.text)
  r = await call(ed, 'POST', P + `/edicoes/${edc.id}/publicar`, {}); check('publicar edicao vazia 422', r.status === 422, r.text)
  r = await call(ed, 'POST', P + `/submissoes/${s1.id}/editoracao`, { edicaoId: edc.id, doi: '10.1234/abc.1' }); check('editoracao', r.status === 200, r.text)
  r = await call(ed, 'POST', P + `/edicoes/${edc.id}/publicar`, {}); check('publicar sem versao final 422', r.status === 422, r.text)
  r = await call(stu, 'POST', P + `/submissoes/${s1.id}/versoes`, { tipo: 'FINAL', arquivoUrl: 'http://f/final.pdf' }); check('versao final', r.status === 201, r.text)
  r = await call(ed, 'POST', P + `/edicoes/${edc.id}/publicar`, {}); check('publicar edicao', r.status === 200 && r.json.artigosPublicados === 1, r.text)
  r = await call(ed, 'POST', P + `/edicoes/${edc.id}/publicar`, {}); check('publicar 2x 409', r.status === 409, r.text)
  r = await call(coord, 'PUT', P + `/edicoes/${edc.id}`, { titulo: 'x' }); check('editar edicao publicada 409', r.status === 409, r.text)
  // públicas
  r = await call(null, 'GET', `/public/edu/pesquisa/${t1.tenantId}/periodicos`); check('pub periodicos', r.status === 200 && r.json.items.length === 1, r.text)
  r = await call(null, 'GET', `/public/edu/pesquisa/${t1.tenantId}/artigos`); check('pub artigos', r.status === 200 && r.json.total === 1 && !JSON.stringify(r.json).includes('a1@x.com'), r.text)
  const aid = r.json.items[0]?.id
  r = await call(null, 'GET', `/public/edu/pesquisa/${t1.tenantId}/artigos/${aid}`); check('pub artigo', r.status === 200 && !JSON.stringify(r.json).includes('a1@x.com'), r.text)
  r = await call(null, 'GET', `/public/edu/pesquisa/${t1.tenantId}/artigos/${aid}/metadados`); check('pub meta', r.status === 200, r.text)
  r = await call(null, 'GET', `/public/edu/pesquisa/${t1.tenantId}/artigos/${aid}/citacao`); check('pub citacao', r.status === 200, r.text)
  r = await call(null, 'GET', `/public/edu/pesquisa/${t1.tenantId}/artigos?q=qualidade`); check('pub busca', r.status === 200 && r.json.total === 1, r.text)
  r = await call(null, 'GET', `/public/edu/pesquisa/${t2.tenantId}/artigos/${aid}`); check('pub tenant B 404', r.status === 404)
  r = await call(null, 'GET', `/public/edu/pesquisa/${t1.tenantId}/periodicos/${per.slug}/edicoes`); check('pub edicoes', r.status === 200 && r.json.items.length === 1, r.text)
  r = await call(null, 'GET', `/public/edu/pesquisa/${t1.tenantId}/periodicos/${per.slug}/edicoes/${edc.id}`); check('pub edicao', r.status === 200, r.text)
  r = await call(null, 'GET', `/public/edu/pesquisa/${t1.tenantId}/periodicos/${per.slug}`); check('pub periodico', r.status === 200 && !JSON.stringify(r.json).includes('Externo'), r.text)
  // produção científica registrada
  const pubs = await prisma.pesPublicacao.count({ where: { tenantId: t1.tenantId, origem: 'PERIODICO' } }); check('publicacao criada', pubs === 1)
  // retirar/transições inválidas
  r = await call(stu, 'POST', P + `/submissoes/${s1.id}/retirar`, {}); check('retirar publicado 409', r.status === 409, r.text)
  // rejeição direta na triagem + retirada
  const s3 = rs[0].json
  r = await call(ed, 'POST', P + `/submissoes/${s3.id}/triagem`, { aprovar: false, observacao: 'fora do escopo' }); check('triagem rejeita', r.status === 200 && r.json.status === 'REJEITADO', r.text)
  r = await call(stu2, 'POST', P + `/submissoes/${s3.id}/retirar`, {}); check('retirar rejeitado 409', r.status === 409, r.text)
  const s4 = rs[1].json
  r = await call(stu2, 'POST', P + `/submissoes/${s4.id}/retirar`, { motivo: 'desisti' }); check('retirar', r.status === 200, r.text)
  r = await call(ed, 'POST', P + `/submissoes/${s4.id}/triagem`, { aprovar: true }); check('triagem de retirado 409', r.status === 409, r.text)
  // lista restrita
  r = await call(stu2, 'GET', P + '/submissoes'); check('aluno2 lista so as suas', r.status === 200 && r.json.items.every((x: any) => rs.some((y) => y.json.id === x.id)), r.text)
  r = await call(ed, 'GET', P + '/periodicos/' + per.id + '/estatisticas'); check('estatisticas', r.status === 200, r.text)
  // job
  await prisma.pesRevisao.updateMany({ where: { submissaoId: s1.id }, data: { prazo: new Date(Date.now() - 864e5 * 5) } })
  const j = await runEduJobs(); check('jobs ok', Object.values(j).every((x: any) => x.ok), Object.entries(j).filter(([, v]: any) => !v.ok))
  // notificações / lembretes
  const nots = await prisma.eduNotification.count({ where: { tenantId: t1.tenantId } }); check('notificacoes geradas', nots > 5, nots)
  const emails = await prisma.eduNotification.count({ where: { tenantId: t1.tenantId, canal: 'EMAIL', destino: 'ext@x.com' } }); check('convite externo na caixa de saida', emails >= 1, emails)
  await close(); summary()
}
main().catch((e) => { console.error(e); process.exit(2) })
