import { setup, check, seedAcademic } from './_lib'
async function main() {
  const { A, B, api, close, prisma } = await setup()
  const U = A.users
  const adm = api(U.ADMIN.token), coord = api(U.COORDINATOR.token), teacher = api(U.TEACHER.token), teacher2 = api(U.TEACHER2.token), st = api(U.STUDENT.token), st2 = api(U.STUDENT2.token), sec = api(U.SECRETARY.token), fin = api(U.FINANCE.token)
  const admB = api(B.users.ADMIN.token), coordB = api(B.users.COORDINATOR.token), stB = api(B.users.STUDENT.token)
  const ac = await seedAcademic(A, { n: 2 })
  const [secA, secB] = ac.sections
  const [s1, s2] = ac.students
  const N = '/edu/notas'
  let r: any

  r = await coord('POST', N + '/bootstrap', {}); check('nt bootstrap 201', r.status === 201 && r.json.criadas.length === 5, r)
  r = await coord('POST', N + '/bootstrap', {}); check('nt bootstrap idempotente 200', r.status === 200 && r.json.criadas.length === 0, r)
  r = await teacher('POST', N + '/bootstrap', {}); check('nt bootstrap teacher 403', r.status === 403)
  r = await coord('GET', N + '/regras'); check('regras list', r.status === 200 && (r.json.items?.length ?? r.json.length) >= 5, r.json?.total)
  const regras = r.json.items ?? r.json
  const regraPadrao = regras.find((x: any) => x.padrao)
  check('uma regra padrão', regras.filter((x: any) => x.padrao).length === 1)
  r = await coord('POST', N + '/regras', { nome: 'Regra X', pesoParcial: 0.7, pesoExame: 0.7 }); check('regra pesos 400', r.status === 400, r)
  r = await coord('POST', N + '/regras', { nome: 'Regra X', mediaAprovacao: 11 }); check('regra media>max 400', r.status === 400, r)
  r = await coord('POST', N + '/regras', { nome: 'Regra curso', escopo: 'CURSO' }); check('regra curso sem programId 400', r.status === 400, r)
  r = await coord('POST', N + '/regras', { nome: 'Regra curso', escopo: 'CURSO', programId: '00000000-0000-0000-0000-000000000000' }); check('regra curso inexistente 404', r.status === 404, r)
  r = await teacher('POST', N + '/regras', { nome: 'Regra T' }); check('regra teacher 403', r.status === 403)
  r = await coord('POST', N + '/regras', { nome: 'Nova padrão', padrao: true, mediaAprovacao: 6, mediaMinimaRecuperacao: 3 }); check('regra nova padrão 201', r.status === 201, r); const rNova = r.json
  r = await coord('GET', N + '/regras'); check('padrão exclusivo', (r.json.items ?? r.json).filter((x: any) => x.padrao).length === 1)
  r = await admB('GET', `${N}/regras/${rNova.id}`); check('regra xtenant 404', r.status === 404, r)
  r = await coord('PATCH', `${N}/regras/${rNova.id}`, { padrao: false }); check('regra patch', r.status === 200, r)
  r = await coord('PATCH', `${N}/regras/${regraPadrao.id}`, { padrao: true }); check('re-padrão', r.status === 200)
  r = await coord('GET', `${N}/regras/resolver/${secA.id}`); check('resolver', r.status === 200 && r.json.origem === 'TENANT', r.json?.origem)
  r = await coord('POST', N + '/regras', { nome: 'Regra turma B', escopo: 'TURMA', classSectionId: secB.id, mediaAprovacao: 5, mediaMinimaRecuperacao: 2, componentes: [{ codigo: 'A1', nome: 'Av 1', peso: 1 }, { codigo: 'A2', nome: 'Av 2', peso: 1 }] }); check('regra turma 201', r.status === 201, r)
  r = await coord('GET', `${N}/regras/resolver/${secB.id}`); check('resolver turma', r.json.origem === 'TURMA')

  // --- componentes
  r = await teacher('GET', N + '/turmas'); check('turmas teacher', r.status === 200 && r.json.items.length === 2, r.json?.total)
  r = await teacher2('GET', `${N}/turmas/${secA.id}/diario`); check('diario outro prof 403', r.status === 403, r)
  r = await st('GET', `${N}/turmas/${secA.id}/diario`); check('diario student 403', r.status === 403)
  r = await admB('GET', `${N}/turmas/${secA.id}/diario`); check('diario xtenant 404', r.status === 404, r)
  r = await teacher('POST', `${N}/turmas/${secA.id}/componentes/aplicar-regra`, {}); check('aplicar regra 201', r.status === 201 && r.json.componentes.length === 5, r)
  r = await teacher('POST', `${N}/turmas/${secA.id}/componentes/aplicar-regra`, {}); check('aplicar regra 2x 409', r.status === 409, r)
  r = await teacher('POST', `${N}/turmas/${secA.id}/componentes`, { codigo: 'P1', nome: 'dup' }); check('componente dup 409', r.status === 409, r)
  r = await teacher('POST', `${N}/turmas/${secA.id}/componentes`, { codigo: 'X1', nome: 'Extra', peso: 1, dataPrevista: '2026-09-01' }); check('componente 201', r.status === 201, r); const cX = r.json
  r = await teacher('POST', `${N}/turmas/${secA.id}/componentes`, { codigo: 'X2', nome: 'Extra2', peso: -1 }); check('componente peso neg 400', r.status === 400, r)
  r = await teacher('DELETE', `${N}/turmas/${secA.id}/componentes/${cX.id}`); check('componente delete', r.status === 204, r)
  r = await teacher('GET', `${N}/turmas/${secA.id}/diario`); check('diario ok', r.status === 200 && r.json.alunos.length === 2, r)
  const comps = r.json.componentes; const C: any = Object.fromEntries(comps.map((c: any) => [c.codigo, c]))
  // turma B: modelo da regra de turma
  r = await teacher2('POST', `${N}/turmas/${secB.id}/componentes/aplicar-regra`, {}); check('aplicar regra turma B', r.status === 201 && r.json.componentes.length === 2, r)

  // --- notas: prazo vencido bloqueia professor
  const pastPrazo = await prisma.calPrazoNotas.create({ data: { tenantId: A.tenantId, termId: ac.term.id, tipo: 'LANCAMENTO_NOTAS', etapa: 'N1', titulo: 'Prazo vencido', prazo: new Date(Date.now() - 86400000) } })
  r = await teacher('PUT', `${N}/turmas/${secA.id}/notas`, { notas: [{ studentId: s1.id, codigo: 'P1', valor: 8 }] }); check('lançar após prazo (calendário) 409', r.status === 409, r)
  r = await coord('POST', `${N}/turmas/${secA.id}/notas/corrigir`, { correcoes: [{ studentId: s1.id, codigo: 'P1', valor: 8 }], motivo: 'curta' }); check('corrigir sem justificativa 400', r.status === 400, r)
  r = await sec('POST', `${N}/turmas/${secA.id}/notas/corrigir`, { correcoes: [{ studentId: s1.id, codigo: 'P1', valor: 8 }], motivo: 'Lançamento tardio autorizado pela coordenação' }); check('corrigir (secretaria) após prazo', r.status === 200 && r.json.alteradas === 1, r)
  r = await teacher('POST', `${N}/turmas/${secA.id}/notas/corrigir`, { correcoes: [{ studentId: s1.id, codigo: 'P1', valor: 8 }], motivo: 'Lançamento tardio autorizado pela coordenação' }); check('corrigir teacher 403', r.status === 403)
  await prisma.calPrazoNotas.delete({ where: { id: pastPrazo.id } })
  // diário com prazo próprio no futuro
  r = await coord('PATCH', `${N}/turmas/${secA.id}/prazo`, { prazoLancamento: new Date(Date.now() + 5 * 86400000).toISOString() }); check('prazo diário', r.status === 200, r)
  r = await teacher('PUT', `${N}/turmas/${secA.id}/notas`, { notas: [
    { studentId: s1.id, codigo: 'P1', valor: 8 }, { studentId: s1.id, codigo: 'P2', valor: 7 }, { studentId: s1.id, codigo: 'TRAB', valor: 9 },
    { studentId: s2.id, codigo: 'P1', valor: 5 }, { studentId: s2.id, codigo: 'P2', valor: 5 }, { studentId: s2.id, codigo: 'TRAB', valor: 5 },
    { studentId: s2.id, codigo: 'REC', valor: 11 }, { studentId: '00000000-0000-0000-0000-000000000000', codigo: 'P1', valor: 5 }, { studentId: s2.id, codigo: 'NOPE', valor: 5 }, { studentId: s2.id, codigo: 'P1' },
  ] }); check('lançar lote', r.status === 200 && r.json.gravadas === 5 && r.json.semAlteracao === 1 && r.json.erros.length === 4, r.json)
  r = await teacher('PUT', `${N}/turmas/${secA.id}/notas`, { notas: [] }); check('lançar vazio 400', r.status === 400, r)
  r = await teacher('PUT', `${N}/turmas/${secA.id}/notas`, { notas: [{ studentId: s1.id, codigo: 'P1', valor: 8 }] }); check('lançar sem alteração', r.json.gravadas === 0 && r.json.semAlteracao === 1, r.json)
  r = await teacher('PUT', `${N}/turmas/${secA.id}/notas`, { notas: [{ studentId: s1.id, codigo: 'P1', valor: 8.5 }], motivo: 'ajuste' }); check('lançar alteração', r.json.gravadas === 1)
  r = await teacher2('PUT', `${N}/turmas/${secA.id}/notas`, { notas: [{ studentId: s1.id, codigo: 'P1', valor: 1 }] }); check('lançar outro prof 403', r.status === 403)
  r = await st('PUT', `${N}/turmas/${secA.id}/notas`, { notas: [{ studentId: s1.id, codigo: 'P1', valor: 10 }] }); check('lançar aluno 403', r.status === 403)
  r = await teacher('GET', `${N}/turmas/${secA.id}/trilha?studentId=${s1.id}`); check('trilha tem histórico', r.status === 200 && r.json.total >= 4, r.json?.total)
  r = await teacher('POST', `${N}/turmas/${secA.id}/notas/importar`, { formato: 'CSV', dados: `ra;P1;P2\n${s1.ra};9;8\n${s2.ra};3;AUSENTE\nRA-INEXISTENTE;5;5`, simular: true }); check('importar csv simular', r.status === 200 && r.json.simulacao && r.json.gravadas === 4, r.json)
  r = await teacher('POST', `${N}/turmas/${secA.id}/notas/importar`, { formato: 'CSV', dados: `ra;P1\n${s1.ra};9`, simular: false }); check('importar csv real', r.status === 200 && r.json.gravadas === 1, r.json)
  r = await teacher('POST', `${N}/turmas/${secA.id}/notas/importar`, { formato: 'JSON', dados: [{ ra: s1.ra, valor: '8,5' }], componenteCodigo: 'P1' }); check('importar json vírgula', r.status === 200 && r.json.gravadas === 1, r.json)
  r = await teacher('POST', `${N}/turmas/${secA.id}/notas/importar`, { formato: 'JSON', dados: 'not json' }); check('importar json inválido 400', r.status === 400, r)
  // frequência
  const sess = await prisma.classSession.create({ data: { classSectionId: secA.id, tipo: 'TEORICA', titulo: 'Aula 1', dataHoraInicio: new Date(Date.now() - 86400000 * 3), dataHoraFim: new Date(Date.now() - 86400000 * 3 + 3600000), status: 'REALIZADA' } })
  await prisma.attendance.createMany({ data: [{ classSessionId: sess.id, studentId: s1.id, presente: true }, { classSessionId: sess.id, studentId: s2.id, presente: true }] })
  r = await teacher('GET', `${N}/turmas/${secA.id}/frequencia`); check('frequência', r.status === 200 && r.json.alunos.find((a: any) => a.studentId === s2.id).abaixoDoMinimo === false, r.json)
  r = await teacher('GET', `${N}/turmas/${secA.id}/estatisticas`); check('estatísticas', r.status === 200, r)
  r = await teacher('GET', `${N}/turmas/${secA.id}/ata.html`); check('ata html', r.status === 200 && r.text.includes('Ata'), r.text.slice(0, 60))
  r = await teacher('POST', `${N}/turmas/${secA.id}/recalcular`); check('recalcular', r.status === 200 && r.json.alunos === 2, r)
  let res1 = await prisma.ntResultado.findMany({ where: { classSectionId: secA.id } }); check('resultados gravados', res1.length === 2, res1)
  // fechamento
  r = await teacher('POST', `${N}/turmas/${secA.id}/fechar`, {}); check('fechar com pendências 409', r.status === 409, r)
  r = await teacher('POST', `${N}/turmas/${secA.id}/fechar`, { forcar: true, justificativa: 'Fechamento forçado teste longo' }); check('fechar forçado por professor 403', r.status === 403, r)
  // aluno 2: reprovado por freq; sem rec lançada... ajusta s2 para sair de recuperação
  r = await teacher('PUT', `${N}/turmas/${secA.id}/notas`, { notas: [{ studentId: s2.id, codigo: 'REC', valor: 10 }] }); check('lançar rec/exame', r.status === 200, r.json)
  r = await teacher('POST', `${N}/turmas/${secA.id}/fechar`, {}); check('fechar diário', r.status === 200 && r.json.status === 'FECHADO', r)
  r = await teacher('POST', `${N}/turmas/${secA.id}/fechar`, {}); check('fechar 2x 409', r.status === 409, r)
  let nt = await prisma.eduNotification.count({ where: { tenantId: A.tenantId, studentId: s1.id, templateKey: 'nt-resultado-final' } }); check('aluno notificado do resultado', nt === 1, nt)
  r = await teacher('PUT', `${N}/turmas/${secA.id}/notas`, { notas: [{ studentId: s1.id, codigo: 'P1', valor: 1 }] }); check('lançar em diário fechado 423', r.status === 423, r)
  r = await teacher('POST', `${N}/turmas/${secA.id}/componentes`, { codigo: 'Z', nome: 'Zeta' }); check('componente em diário fechado 423', r.status === 423, r)
  r = await teacher('POST', `${N}/turmas/${secA.id}/notas/corrigir`, { correcoes: [{ studentId: s1.id, codigo: 'P1', valor: 1 }], motivo: 'x'.repeat(12) }); check('teacher corrigir 403', r.status === 403)
  r = await coord('POST', `${N}/turmas/${secA.id}/notas/corrigir`, { correcoes: [{ studentId: s1.id, codigo: 'P1', valor: 9.5 }], motivo: 'Erro de digitação na prova' }); check('corrigir com diário fechado', r.status === 200 && r.json.alteradas === 1, r)
  nt = await prisma.eduNotification.count({ where: { tenantId: A.tenantId, studentId: s1.id, assunto: 'Nota atualizada' } }); check('aluno notificado de correção', nt === 1, nt)
  nt = await prisma.eduNotification.count({ where: { tenantId: A.tenantId, userId: U.TEACHER.id, assunto: 'Correção de notas na sua turma' } }); check('professor notificado de correção', nt >= 1, nt)
  const hist = await prisma.ntLancamentoHistorico.findMany({ where: { classSectionId: secA.id, studentId: s1.id, origem: 'CORRECAO' } }); check('trilha de correção', hist.length >= 1 && hist.every((h) => h.motivo && h.usuarioId), hist)
  const aud = await prisma.eduAuditEvent.count({ where: { tenantId: A.tenantId, modulo: 'notas', acao: 'NOTA_CORRIGIDA' } }); check('auditoria NOTA_CORRIGIDA', aud >= 1, aud)
  r = await teacher('POST', `${N}/turmas/${secA.id}/reabrir`, { justificativa: 'Reabrir por favor teste' }); check('reabrir teacher 403', r.status === 403)
  // --- revisão
  const comp = C.P1
  r = await st('POST', N + '/revisoes', { classSectionId: secA.id, componenteId: comp.id, justificativa: 'curta' }); check('revisão justificativa curta 400', r.status === 400, r)
  r = await st2('POST', N + '/revisoes', { classSectionId: secB.id, componenteId: comp.id, justificativa: 'Discordo da correção desta prova, solicito reanálise' }); check('revisão componente de outra turma 404', r.status === 404, r)
  r = await st2('POST', N + '/revisoes', { classSectionId: secA.id, componenteId: comp.id, justificativa: 'Discordo da correção desta prova, solicito reanálise' }); check('revisão 201', r.status === 201, r); const rev = r.json
  r = await st2('POST', N + '/revisoes', { classSectionId: secA.id, componenteId: comp.id, justificativa: 'Discordo da correção desta prova, solicito reanálise' }); check('revisão dup 409', r.status === 409, r)
  r = await st('GET', `${N}/revisoes/${rev.id}`); check('revisão de outro aluno 404', r.status === 404, r)
  r = await st2('GET', N + '/revisoes'); check('revisões do aluno', r.json.total === 1)
  r = await teacher2('POST', `${N}/revisoes/${rev.id}/parecer`, { parecer: 'Parecer de teste longo' }); check('parecer outro prof 403', r.status === 403)
  r = await coord('POST', `${N}/revisoes/${rev.id}/decisao`, { decisao: 'DEFERIDA', justificativa: 'Decisão sem parecer ainda', notaNova: 5 }); check('decisão antes do parecer 409', r.status === 409, r)
  r = await teacher('POST', `${N}/revisoes/${rev.id}/parecer`, { parecer: 'A prova foi corrigida corretamente, mas cabe revisão', notaSugerida: 4 }); check('parecer', r.status === 200 && r.json.status === 'PARECER_EMITIDO', r)
  r = await teacher('POST', `${N}/revisoes/${rev.id}/parecer`, { parecer: 'Parecer duplicado teste' }); check('parecer 2x 409', r.status === 409, r)
  r = await coord('POST', `${N}/revisoes/${rev.id}/decisao`, { decisao: 'DEFERIDA', justificativa: 'Revisão aceita pela coordenação', notaNova: 15 }); check('decisão nota acima máx 400', r.status === 400, r)
  r = await coord('POST', `${N}/revisoes/${rev.id}/decisao`, { decisao: 'DEFERIDA', justificativa: 'Revisão aceita pela coordenação', notaNova: 6 }); check('decisão deferida', r.status === 200 && r.json.status === 'DEFERIDA', r)
  const lanc = await prisma.ntLancamento.findFirst({ where: { componenteId: comp.id, studentId: s2.id } }); check('nota revisada aplicada', lanc?.valor === 6, lanc)
  r = await coord('POST', `${N}/revisoes/${rev.id}/decisao`, { decisao: 'INDEFERIDA', justificativa: 'Decisão duplicada teste' }); check('decisão 2x 409', r.status === 409, r)
  r = await st2('POST', `${N}/revisoes/${rev.id}/cancelar`); check('cancelar encerrada 409', r.status === 409, r)
  r = await st('POST', N + '/revisoes', { classSectionId: secA.id, componenteId: comp.id, justificativa: 'Discordo da correção desta prova, solicito reanálise' }); check('revisão 201 s1', r.status === 201, r)
  r = await st2('POST', `${N}/revisoes/${r.json.id}/cancelar`); check('cancelar de outro aluno 403', r.status === 403, r)
  // prazo de revisão vencido
  await prisma.ntDiario.update({ where: { classSectionId: secA.id }, data: { fechadoEm: new Date(Date.now() - 20 * 86400000) } })
  r = await st2('POST', N + '/revisoes', { classSectionId: secA.id, componenteId: C.P2.id, justificativa: 'Discordo da correção desta prova, solicito reanálise' }); check('revisão fora do prazo 409', r.status === 409, r)
  // reabrir
  r = await coord('POST', `${N}/turmas/${secA.id}/reabrir`, { justificativa: 'curta' }); check('reabrir justificativa curta 400', r.status === 400, r)
  r = await coord('POST', `${N}/turmas/${secA.id}/reabrir`, { justificativa: 'Correção de lançamento identificado' }); check('reabrir', r.status === 200, r)
  r = await coord('POST', `${N}/turmas/${secA.id}/reabrir`, { justificativa: 'Correção de lançamento identificado' }); check('reabrir 2x 409', r.status === 409, r)
  r = await teacher('PUT', `${N}/turmas/${secA.id}/notas`, { notas: [{ studentId: s1.id, codigo: 'P2', valor: 7.5 }] }); check('lançar após reabrir', r.status === 200 && r.json.gravadas === 1, r)
  // --- boletim / histórico
  r = await st('GET', N + '/meu/boletim'); check('meu boletim', r.status === 200 && r.json.disciplinas.length === 3, r)
  const dA = r.json.disciplinas.find((d: any) => d.classSectionId === secA.id); check('boletim média A', dA && dA.mediaFinal != null, dA)
  r = await st('GET', N + '/meu/historico'); check('meu histórico', r.status === 200 && r.json.periodos.length >= 1, r)
  r = await st('GET', `${N}/alunos/${s2.id}/boletim`); check('boletim de outro aluno 403', r.status === 403, r)
  r = await teacher('GET', `${N}/alunos/${s2.id}/boletim`); check('boletim prof da turma', r.status === 200, r)
  r = await teacher2('GET', `${N}/alunos/${s2.id}/historico`); check('histórico prof2 (tem turma B) 200', r.status === 200, r)
  r = await admB('GET', `${N}/alunos/${s2.id}/boletim`); check('boletim xtenant', [403, 404].includes(r.status), r)
  r = await coordB('GET', `${N}/alunos/${s2.id}/boletim`); check('boletim coordenador xtenant 404', r.status === 404, r)
  r = await coord('GET', `${N}/alunos/${s1.id}/historico.html`); check('histórico html', r.status === 200 && r.text.includes('Histórico'), r.text.slice(0, 50))
  r = await stB('GET', N + '/meu/boletim'); check('boletim aluno sem vínculo 403', r.status === 403, r)
  // --- gestão
  r = await coord('GET', `${N}/gestao/cursos/${ac.program.id}/visao`); check('gestão visão', r.status === 200, r)
  r = await coordB('GET', `${N}/gestao/cursos/${ac.program.id}/visao`); check('gestão visão xtenant 404', r.status === 404, r)
  r = await coord('GET', `${N}/gestao/ranking?programId=${ac.program.id}`); check('ranking', r.status === 200, r)
  r = await coord('GET', `${N}/gestao/risco`); check('risco', r.status === 200, r)
  r = await teacher('GET', `${N}/gestao/pendencias`); check('pendencias', r.status === 200, r)
  r = await st('GET', `${N}/gestao/risco`); check('risco student 403', r.status === 403)
  // --- portal
  await prisma.accountReceivable.createMany({ data: [
    { tenantId: A.tenantId, studentId: s1.id, descricao: 'Mensalidade 09', numeroParcela: 9, valor: 1000, dataVencimento: new Date(Date.now() - 10 * 86400000), status: 'ATRASADO' },
    { tenantId: A.tenantId, studentId: s1.id, descricao: 'Mensalidade 10', numeroParcela: 10, valor: 1000, dataVencimento: new Date(Date.now() + 10 * 86400000), status: 'PENDENTE' },
  ] })
  await prisma.ntComponente.update({ where: { id: C.EXAME.id }, data: { dataPrevista: new Date(Date.now() + 5 * 86400000) } })
  r = await st('GET', '/edu/notas/portal/meu-painel'); check('portal 200', r.status === 200, r)
  check('portal aluno', r.json?.aluno?.id === s1.id)
  check('portal financeiro (vencido+em aberto)', r.json?.financeiro && r.json.financeiro.qtdVencidas === 1 && r.json.financeiro.totalEmAberto === 2000, r.json?.financeiro)
  check('portal período/turmas', r.json?.periodoAtual && r.json.turmas.length === 3, r.json?.turmas?.length)
  check('portal notas', r.json?.notas?.disciplinas?.length === 3 && r.json.notas.cr != null, r.json?.notas)
  check('portal próximas provas', r.json?.proximasProvas?.length >= 1, r.json?.proximasProvas)
  check('portal avisos', r.json?.avisos?.naoLidas >= 1, r.json?.avisos?.naoLidas)
  r = await st('GET', `/edu/notas/portal/meu-painel?studentId=${s2.id}`); check('portal ignora studentId de aluno', r.status === 200 && r.json.aluno.id === s1.id)
  r = await coord('GET', `/edu/notas/portal/meu-painel?studentId=${s2.id}`); check('portal gestão com studentId', r.status === 200 && r.json.aluno.id === s2.id, r)
  r = await coord('GET', `/edu/notas/portal/meu-painel`); check('portal gestão sem studentId 400', r.status === 400, r)
  r = await coordB('GET', `/edu/notas/portal/meu-painel?studentId=${s2.id}`); check('portal xtenant 404', r.status === 404, r)
  r = await teacher('GET', `/edu/notas/portal/meu-painel`); check('portal teacher 403', r.status === 403, r)
  r = await fin('GET', `/edu/notas/portal/meu-painel`); check('portal finance 403', r.status === 403, r)
  r = await api('bad.token')('GET', `/edu/notas/portal/meu-painel`); check('portal sem token válido 401', r.status === 401, r)

  const { runEduJobs } = await import('../../src/modules/core/jobs')
  const jobs: any = await runEduJobs()
  for (const [k, v] of Object.entries<any>(jobs)) if (k.startsWith('notas')) check('job ' + k, v.ok, v)
  await close()
}
main().catch((e) => { console.error(e); process.exit(2) })
