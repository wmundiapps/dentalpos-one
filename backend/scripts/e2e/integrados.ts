import { setup, check, seedAcademic } from './_lib'
async function main() {
  const { A, B, api, close, prisma } = await setup()
  const U = A.users
  const adm = api(U.ADMIN.token), coord = api(U.COORDINATOR.token), teacher = api(U.TEACHER.token), teacher2 = api(U.TEACHER2.token), st = api(U.STUDENT.token), st2 = api(U.STUDENT2.token), fin = api(U.FINANCE.token), sec = api(U.SECRETARY.token)
  const admB = api(B.users.ADMIN.token), finB = api(B.users.FINANCE.token), stB = api(B.users.STUDENT.token), teacherB = api(B.users.TEACHER.token)
  const ac = await seedAcademic(A, { n: 2 })
  const [secA] = ac.sections
  const [s1, s2] = ac.students
  const F = '/edu/financeiro'
  let r: any
  // ---------- FINANCEIRO
  r = await fin('POST', F + '/cost-centers', { nome: 'Clínica Escola' }); check('cc 201', r.status === 201, r); const cc = r.json
  r = await st('POST', F + '/cost-centers', { nome: 'Hack' }); check('cc student 403', r.status === 403)
  r = await fin('POST', F + '/chart-of-accounts', { codigo: '9.9.9', nome: 'Conta X', tipo: 'ATIVO' }); check('plano 201', r.status === 201, r)
  r = await fin('POST', F + '/chart-of-accounts', { codigo: '9.9.9', nome: 'Conta X', tipo: 'ATIVO' }); check('plano dup 409', r.status === 409, r)
  r = await finB('POST', F + '/chart-of-accounts', { codigo: '9.9.9', nome: 'Conta X', tipo: 'ATIVO' }); check('plano outro tenant mesmo código ok', r.status === 201, r)
  r = await finB('GET', F + '/cost-centers'); check('cc isolado', r.status === 200 && r.json.length === 0, r.json)
  r = await fin('POST', F + '/receivables', { studentId: s1.id, descricao: 'Taxa de matrícula', valor: 500, dataVencimento: '2026-11-10' }); check('receber 201', r.status === 201, r); const ar1 = r.json
  r = await fin('POST', F + '/receivables', { studentId: s1.id, descricao: 'Taxa', valor: -5, dataVencimento: '2026-11-10' }); check('receber valor neg 400', r.status === 400, r)
  r = await finB('POST', F + '/receivables', { studentId: s1.id, descricao: 'Taxa invasora', valor: 100, dataVencimento: '2026-11-10' }); check('receber aluno xtenant 404', r.status === 404, r)
  r = await fin('POST', F + '/receivables', { studentId: s1.id, enrollmentId: s2.enrollmentId, descricao: 'Taxa matr errada', valor: 100, dataVencimento: '2026-11-10' }); check('receber matrícula de outro aluno 404', r.status === 404, r)
  r = await fin('POST', F + '/receivables/generate-mensalidades', { studentId: s1.id, enrollmentId: s1.enrollmentId, valorParcela: 1200, quantidadeParcelas: 6, diaVencimento: 10, primeiroVencimento: '2026-01-31' }); check('mensalidades 201', r.status === 201 && r.json.parcelasGeradas === 6, r)
  const meses = r.json.parcelas.map((p: any) => new Date(p.dataVencimento).toISOString().slice(0, 10)); check('vencimentos mensais sem estouro', JSON.stringify(meses) === JSON.stringify(['2026-01-10', '2026-02-10', '2026-03-10', '2026-04-10', '2026-05-10', '2026-06-10']), meses)
  r = await fin('POST', F + '/receivables/generate-mensalidades', { studentId: s1.id, enrollmentId: s1.enrollmentId, valorParcela: 1200, quantidadeParcelas: 6, diaVencimento: 10, primeiroVencimento: '2026-01-31' }); check('mensalidades 2x 409', r.status === 409, r)
  r = await finB('POST', F + '/receivables/generate-mensalidades', { studentId: s1.id, enrollmentId: s1.enrollmentId, valorParcela: 1200, quantidadeParcelas: 6, diaVencimento: 10, primeiroVencimento: '2026-01-31' }); check('mensalidades xtenant 404', r.status === 404, r)
  r = await fin('POST', F + '/receivables/generate-mensalidades', { studentId: s1.id, enrollmentId: s1.enrollmentId, valorParcela: 1200, quantidadeParcelas: 6, diaVencimento: 31, primeiroVencimento: '2026-01-31' }); check('mensalidades dia 31 400', r.status === 400, r)
  r = await fin('GET', F + '/receivables?status=ATRASADO'); check('receber list filtro', r.status === 200)
  r = await fin('GET', F + '/receivables'); check('receber list status computado', r.json.some((x: any) => x.status === 'ATRASADO'), r.json.length)
  r = await st('GET', F + '/receivables/my'); check('receber my', r.status === 200 && r.json.length >= 7, r.json?.length)
  r = await st2('GET', F + '/receivables/my'); check('receber my isolado', r.status === 200 && r.json.length === 0, r.json?.length)
  r = await st('GET', F + '/receivables'); check('receber list student 403', r.status === 403)
  r = await finB('POST', F + `/receivables/${ar1.id}/receive`, { formaPagamento: 'PIX' }); check('receive xtenant 404', r.status === 404, r)
  r = await fin('POST', F + `/receivables/${ar1.id}/receive`, { formaPagamento: 'BITCOIN' }); check('receive forma inválida 400', r.status === 400, r)
  const rs = await Promise.all([fin('POST', F + `/receivables/${ar1.id}/receive`, { formaPagamento: 'PIX' }), fin('POST', F + `/receivables/${ar1.id}/receive`, { formaPagamento: 'PIX' })])
  check('receive concorrente: uma baixa', rs.filter((x) => x.status === 200).length === 1 && rs.filter((x) => x.status === 409).length === 1, rs.map((x) => x.status))
  check('1 transação 1 lançamento', (await prisma.paymentTransaction.count({ where: { accountReceivableId: ar1.id } })) === 1 && (await prisma.accountingEntry.count({ where: { tenantId: A.tenantId } })) === 1)
  const en = await prisma.accountingEntry.findFirst({ where: { tenantId: A.tenantId }, include: { contaDebito: true, contaCredito: true } as any }) as any; check('partida dobrada receita', en && en.contaDebito.codigo === '1.1.1' && en.contaCredito.codigo === '3.1.1' && en.valor === 500, en)
  const cancelado = await prisma.accountReceivable.create({ data: { tenantId: A.tenantId, studentId: s1.id, descricao: 'Cancelada', valor: 10, dataVencimento: new Date(), status: 'CANCELADO' } })
  r = await fin('POST', F + `/receivables/${cancelado.id}/receive`, { formaPagamento: 'PIX' }); check('receive cancelada 409', r.status === 409, r)
  // webhook
  const arG = await prisma.accountReceivable.create({ data: { tenantId: A.tenantId, studentId: s1.id, descricao: 'Gateway', valor: 77, dataVencimento: new Date(), gatewayId: 'gw_123' } })
  r = await fin('POST', F + '/receivables/webhook-gateway-confirmacao', {}); check('webhook sem gatewayId 400', r.status === 400, r)
  r = await finB('POST', F + '/receivables/webhook-gateway-confirmacao', { gatewayId: 'gw_123', formaPagamento: 'PIX', gatewayStatus: 'CONFIRMED' }); check('webhook xtenant 404', r.status === 404, r)
  r = await fin('POST', F + '/receivables/webhook-gateway-confirmacao', { gatewayId: 'gw_123', formaPagamento: 'PIX', gatewayStatus: 'CONFIRMED' }); check('webhook 200', r.status === 200 && r.json.receivable.status === 'PAGO', r)
  r = await fin('POST', F + '/receivables/webhook-gateway-confirmacao', { gatewayId: 'gw_123', formaPagamento: 'PIX', gatewayStatus: 'CONFIRMED' }); check('webhook idempotente', r.status === 200 && r.json.jaProcessado, r)
  // payables
  r = await fin('POST', F + '/payables', { descricao: 'Aluguel', valor: 3000, dataVencimento: '2026-11-05', costCenterId: cc.id, categoria: 'aluguel' }); check('pagar 201', r.status === 201, r); const ap = r.json
  r = await finB('POST', F + '/payables', { descricao: 'Aluguel', valor: 3000, dataVencimento: '2026-11-05', costCenterId: cc.id }); check('pagar cc xtenant 404', r.status === 404, r)
  r = await fin('POST', F + '/payables', { descricao: 'Aluguel', valor: 0, dataVencimento: '2026-11-05' }); check('pagar valor 0 400', r.status === 400, r)
  r = await fin('POST', F + '/payables', { descricao: 'Luz', valor: 400, dataVencimento: '2026-09-05' }); const ap2 = r.json
  r = await fin('GET', F + '/payables'); check('pagar list computa atraso', r.json.find((p: any) => p.id === ap2.id).status === 'ATRASADO')
  const ps = await Promise.all([fin('POST', F + `/payables/${ap.id}/pay`, { formaPagamento: 'TRANSFERENCIA' }), fin('POST', F + `/payables/${ap.id}/pay`, { formaPagamento: 'TRANSFERENCIA' })])
  check('pay concorrente: uma baixa', ps.filter((x) => x.status === 200).length === 1 && ps.filter((x) => x.status === 409).length === 1, ps.map((x) => x.status))
  r = await finB('POST', F + `/payables/${ap2.id}/pay`, { formaPagamento: 'PIX' }); check('pay xtenant 404', r.status === 404, r)
  r = await fin('POST', F + `/payables/${ap2.id}/pay`, { formaPagamento: 'PIX', dataPagamento: '2026-10-01' }); check('pay atrasada', r.status === 200, r)
  // DRE
  r = await fin('GET', F + '/reports/dre?de=2026-01-01&ate=' + new Date().toISOString().slice(0, 10)); check('dre', r.status === 200 && r.json.receitaTotal === 577 && r.json.despesaTotal === 3400 && r.json.resultado === 577 - 3400, r.json)
  r = await fin('GET', F + '/reports/dre?de=2026-01-01&ate=' + new Date().toISOString().slice(0, 10)); check('dre inclui hoje (ate = data)', r.json.receitaTotal === 577, r.json)
  r = await fin('GET', F + '/reports/dre?de=lixo'); check('dre data inválida 400', r.status === 400, r)
  r = await fin('GET', F + '/reports/dre?de=2026-12-01&ate=2026-01-01'); check('dre ate<de 400', r.status === 400, r)
  r = await finB('GET', F + '/reports/dre?de=2026-01-01'); check('dre isolado', r.status === 200 && r.json.receitaTotal === 0 && r.json.despesaTotal === 0, r.json)
  r = await fin('GET', F + '/reports/fluxo-de-caixa?de=2026-01-01&ate=2026-12-31'); check('fluxo de caixa', r.status === 200 && r.json.realizado.recebido === 577, r.json)
  r = await st('GET', F + '/reports/dre'); check('dre student 403', r.status === 403)
  r = await fin('POST', F + '/invoices', { tipo: 'RECIBO', valor: 500, accountReceivableId: ar1.id }); check('invoice 201', r.status === 201, r)
  r = await fin('POST', F + '/invoices', { tipo: 'RECIBO', valor: 500, accountReceivableId: arG.id.replace(/.$/, '0') }); check('invoice AR inexistente 404', r.status === 404, r)
  r = await finB('POST', F + '/invoices', { tipo: 'RECIBO', valor: 500, accountReceivableId: ar1.id }); check('invoice AR xtenant 404', r.status === 404, r)
  r = await fin('GET', F + '/invoices'); check('invoices list', r.status === 200 && r.json.length === 1)
  // jobs financeiro
  const { runEduJobs } = await import('../../src/modules/core/jobs')
  let jobs: any = await runEduJobs()
  check('job financeiro', jobs['financeiro.marcar-atrasados']?.ok === true && jobs['financeiro.marcar-atrasados'].result.receberAtrasadas >= 5, jobs['financeiro.marcar-atrasados'])

  // ---------- CONTEUDO
  const C = '/edu/conteudo'
  const disc = ac.discs[0]
  r = await teacher('POST', C + '/content', { disciplineId: disc.id, tipo: 'RESUMO', titulo: 'Resumo Anatomia', resumoTexto: 'O fêmur é o osso mais longo do corpo humano.' }); check('content 201', r.status === 201, r); const ci = r.json
  r = await teacher('POST', C + '/content', { disciplineId: disc.id, tipo: 'PDF', titulo: 'PDF sem texto', urlArquivo: 'https://x.com/a.pdf' }); const ci2 = r.json
  r = await teacherB('POST', C + '/content', { disciplineId: disc.id, tipo: 'RESUMO', titulo: 'Invasor' }); check('content xtenant 404', r.status === 404, r)
  r = await st('POST', C + '/content', { disciplineId: disc.id, tipo: 'RESUMO', titulo: 'Aluno cria' }); check('content aluno 403', r.status === 403)
  r = await teacher('POST', C + '/content', { disciplineId: disc.id, tipo: 'PDF', titulo: 'url ruim', urlArquivo: 'nao-url' }); check('content url inválida 400', r.status === 400, r)
  r = await st('GET', C + `/disciplines/${disc.id}/content`); check('content list aluno c/ progresso', r.status === 200 && r.json.length === 2 && 'progresso' in r.json[0], r)
  r = await stB('GET', C + `/disciplines/${disc.id}/content`); check('content list xtenant vazio', r.status === 200 && r.json.length === 0, r.json)
  r = await st('GET', C + `/disciplines/${disc.id}/content?tipo=LIXO`); check('content tipo inválido 400', r.status === 400, r)
  r = await st('POST', C + `/content/${ci.id}/progress`, { percentualAssistido: 80 }); check('progress 200', r.status === 200 && r.json.percentualAssistido === 80, r)
  r = await st('POST', C + `/content/${ci.id}/progress`, { concluido: true }); check('progress concluir mantém %', r.json.concluido === true && r.json.percentualAssistido === 80, r.json)
  r = await st('POST', C + `/content/${ci.id}/progress`, { percentualAssistido: 120 }); check('progress >100 400', r.status === 400)
  r = await st('POST', C + `/content/00000000-0000-0000-0000-000000000000/progress`, { percentualAssistido: 10 }); check('progress inexistente 404', r.status === 404, r)
  r = await stB('POST', C + `/content/${ci.id}/progress`, { percentualAssistido: 10 }); check('progress xtenant 4xx', r.status >= 400 && r.status < 500, r)
  r = await teacher('GET', C + `/disciplines/${disc.id}/content/progress-resumo`); check('progress resumo', r.status === 200 && r.json.find((x: any) => x.id === ci.id).concluidos === 1, r.json)
  r = await teacher('POST', C + '/flashcards', { contentItemId: ci.id, pergunta: 'Maior osso?', resposta: 'Fêmur' }); check('flashcard 201', r.status === 201, r); const fc = r.json
  r = await teacherB('POST', C + '/flashcards', { contentItemId: ci.id, pergunta: 'x?', resposta: 'y' }); check('flashcard xtenant 404', r.status === 404, r)
  r = await st('GET', C + '/flashcards/due'); check('due: 1', r.status === 200 && r.json.length === 1, r.json)
  r = await stB('GET', C + '/flashcards/due'); check('due xtenant: 0 (sem aluno => 400 ok)', [200, 400].includes(r.status) && (r.status === 400 || r.json.length === 0), r)
  r = await st('POST', C + `/flashcards/${fc.id}/review`, { qualidade: 4 }); check('review', r.status === 200 && r.json.repeticoes === 1 && r.json.intervalo === 1, r)
  r = await st('POST', C + `/flashcards/${fc.id}/review`, { qualidade: 5 }); check('review 2 → intervalo 6', r.json.intervalo === 6, r.json)
  r = await st('GET', C + '/flashcards/due'); check('due vazio após revisão', r.json.length === 0, r.json)
  r = await st('POST', C + `/flashcards/${fc.id}/review`, { qualidade: 1 }); check('review erro reseta', r.json.repeticoes === 0 && r.json.intervalo === 1, r.json)
  r = await st('POST', C + `/flashcards/${fc.id}/review`, { qualidade: 9 }); check('review qualidade 9 400', r.status === 400)
  r = await stB('POST', C + `/flashcards/${fc.id}/review`, { qualidade: 3 }); check('review xtenant', [400, 403, 404].includes(r.status), r)
  r = await st2('GET', C + '/flashcards/due'); check('due isolado por aluno', r.json.length === 1)
  // biblioteca
  r = await fin('POST', C + '/library/providers', { nome: 'Minha Biblioteca', tipoAcesso: 'ADESAO_INDIVIDUAL', custoMensal: 30, urlAcesso: 'https://bib.com' }); check('provider 201', r.status === 201, r); const prov = r.json
  r = await st('POST', C + '/library/subscribe', { libraryProviderId: prov.id }); check('subscribe 201', r.status === 201, r)
  check('subscribe gera conta a receber', (await prisma.accountReceivable.count({ where: { tenantId: A.tenantId, studentId: s1.id, descricao: { startsWith: 'Assinatura biblioteca' } } })) === 1)
  r = await st('POST', C + '/library/subscribe', { libraryProviderId: prov.id }); check('subscribe 2x 409', r.status === 409, r)
  r = await stB('POST', C + '/library/subscribe', { libraryProviderId: prov.id }); check('subscribe xtenant', [400, 404].includes(r.status), r)
  r = await st('GET', C + '/library/my'); check('library my', r.status === 200 && r.json.length === 1)
  r = await st2('POST', C + `/library/providers/${prov.id}/cancel`); check('cancel sem assinatura 404', r.status === 404, r)
  r = await adm('POST', C + `/library/providers/${prov.id}/cancel?studentId=${s1.id}`); check('cancel admin', r.status === 200 && r.json.status === 'CANCELADA', r)
  r = await st('POST', C + `/library/providers/${prov.id}/cancel`); check('cancel 2x 409', r.status === 409, r)
  r = await st('POST', C + '/library/subscribe', { libraryProviderId: prov.id }); check('resubscribe após cancelar', r.status === 201, r)
  r = await teacher('DELETE', C + `/content/${ci.id}`); check('content delete cascade', r.status === 204, r)
  r = await teacher('DELETE', C + `/content/${ci.id}`); check('content delete 2x 404', r.status === 404, r)
  r = await teacherB('DELETE', C + `/content/${ci2.id}`); check('content delete xtenant 404', r.status === 404, r)

  // ---------- PROVAS-IA
  const P = '/edu/provas'
  const ci3 = await prisma.contentItem.create({ data: { disciplineId: disc.id, tipo: 'RESUMO', titulo: 'R2', resumoTexto: 'Texto base de anatomia.' } })
  r = await teacher('POST', P + '/assessments', { disciplineId: disc.id, classSectionId: secA.id, titulo: 'Prova 1', tipo: 'PROVA', correcaoPorIA: true, dataAbertura: new Date(Date.now() - 3600000), dataFechamento: new Date(Date.now() + 86400000) }); check('assessment 201', r.status === 201, r); const as = r.json
  r = await teacherB('POST', P + '/assessments', { disciplineId: disc.id, titulo: 'Invasora', tipo: 'PROVA' }); check('assessment xtenant 404', r.status === 404, r)
  r = await teacher2('POST', P + '/assessments', { disciplineId: disc.id, classSectionId: secA.id, titulo: 'Outro prof', tipo: 'PROVA' }); check('assessment turma de outro prof 403', r.status === 403, r)
  r = await teacher('POST', P + '/assessments', { disciplineId: disc.id, titulo: 'Datas', tipo: 'PROVA', dataAbertura: '2026-12-01', dataFechamento: '2026-11-01' }); check('assessment datas 400', r.status === 400, r)
  r = await teacher('POST', P + '/assessments', { disciplineId: ac.discs[1].id, classSectionId: secA.id, titulo: 'Turma de outra disc', tipo: 'PROVA' }); check('assessment turma≠disciplina 404', r.status === 404, r)
  r = await st('POST', P + '/assessments', { disciplineId: disc.id, titulo: 'Aluno', tipo: 'PROVA' }); check('assessment aluno 403', r.status === 403)
  r = await teacher('POST', P + `/assessments/${as.id}/questions`, { enunciado: 'Maior osso?', tipo: 'MULTIPLA_ESCOLHA', alternativas: [{ texto: 'Fêmur', correta: true }, { texto: 'Tíbia', correta: false }], peso: 1 }); check('questão MC 201 (gabarito derivado)', r.status === 201 && r.json.respostaCorreta === 'Fêmur', r); const q1 = r.json
  r = await teacher('POST', P + `/assessments/${as.id}/questions`, { enunciado: 'Duas certas', tipo: 'MULTIPLA_ESCOLHA', alternativas: [{ texto: 'A', correta: true }, { texto: 'B', correta: true }] }); check('questão MC 2 corretas 400', r.status === 400, r)
  r = await teacher('POST', P + `/assessments/${as.id}/questions`, { enunciado: 'V ou F: a tíbia é osso', tipo: 'VERDADEIRO_FALSO' }); check('questão VF sem gabarito 400', r.status === 400, r)
  r = await teacher('POST', P + `/assessments/${as.id}/questions`, { enunciado: 'Tíbia é osso?', tipo: 'VERDADEIRO_FALSO', respostaCorreta: 'true', peso: 1 }); check('questão VF 201', r.status === 201, r); const q2 = r.json
  r = await teacher('POST', P + `/assessments/${as.id}/questions`, { enunciado: 'Explique a marcha', tipo: 'DISSERTATIVA', criteriosRubrica: 'Fases da marcha', peso: 2 }); check('questão DISS 201', r.status === 201, r); const q3 = r.json
  check('rubrica criada', (await prisma.gradingRubric.count({ where: { questionId: q3.id } })) === 1)
  r = await teacherB('POST', P + `/assessments/${as.id}/questions`, { enunciado: 'Invasora', tipo: 'DISSERTATIVA' }); check('questão xtenant 404', r.status === 404, r)
  r = await st('GET', P + `/assessments/${as.id}`); check('aluno vê alternativas sem gabarito', r.status === 200 && r.json.questoes.find((q: any) => q.id === q1.id).alternativas.length === 2 && !JSON.stringify(r.json).includes('correta') && !('respostaCorreta' in r.json.questoes[0]), r.text.slice(0, 300))
  r = await teacher('GET', P + `/assessments/${as.id}`); check('professor vê gabarito', r.json.questoes.find((q: any) => q.id === q1.id).respostaCorreta === 'Fêmur', r.json)
  r = await stB('GET', P + `/assessments/${as.id}`); check('assessment get xtenant 404', r.status === 404, r)
  r = await admB('GET', P + `/disciplines/${disc.id}/assessments`); check('assessments list xtenant vazio', r.status === 200 && r.json.length === 0, r.json)
  // geração por IA sem IA configurada
  r = await teacher('POST', P + `/assessments/${as.id}/generate-questions`, { contentItemId: ci3.id, quantidadeMultiplaEscolha: 3 }); check('geração sem IA => 503 com fallback manual', r.status === 503 && r.json.fallback === 'MANUAL', r)
  r = await teacher('POST', P + `/assessments/${as.id}/generate-questions`, { contentItemId: ci2.id, quantidadeMultiplaEscolha: 3 }); check('geração conteúdo sem texto 4xx', r.status >= 400 && r.status < 500, r)
  r = await teacherB('POST', P + `/assessments/${as.id}/generate-questions`, { contentItemId: ci3.id, quantidadeMultiplaEscolha: 3 }); check('geração xtenant 404', r.status === 404, r)
  r = await teacher('POST', P + `/assessments/${as.id}/generate-questions`, { contentItemId: ci3.id, quantidadeMultiplaEscolha: 0, quantidadeDissertativas: 0 }); check('geração 0 questões 400', r.status === 400, r)
  check('nenhuma questão criada pela geração falha', (await prisma.question.count({ where: { assessmentId: as.id } })) === 3)
  // tentativas
  r = await stB('POST', P + `/assessments/${as.id}/attempts`); check('attempt xtenant 404/400', [400, 404].includes(r.status), r)
  const outroAluno = await prisma.student.create({ data: { tenantId: A.tenantId, userId: U.FINANCE.id, ra: 'RAX' + Date.now(), nomeCompleto: 'Sem turma' } })
  r = await st('POST', P + `/assessments/${as.id}/attempts`); check('attempt 201', r.status === 201, r); const at = r.json
  r = await st('POST', P + `/assessments/${as.id}/attempts`); check('attempt retoma 200', r.status === 200 && r.json.id === at.id, r)
  r = await st2('POST', P + `/attempts/${at.id}/submit`, { respostas: [{ questionId: q1.id, respostaTexto: 'Fêmur' }] }); check('submit alheio 403', r.status === 403, r)
  r = await teacher('POST', P + `/attempts/${at.id}/submit`, { respostas: [{ questionId: q1.id, respostaTexto: 'Fêmur' }] }); check('submit teacher 403', r.status === 403)
  // pergunta de outra prova
  const as2 = await prisma.assessment.create({ data: { disciplineId: disc.id, titulo: 'Outra', tipo: 'PROVA' } })
  const qOutra = await prisma.question.create({ data: { assessmentId: as2.id, enunciado: 'Alheia', tipo: 'MULTIPLA_ESCOLHA', alternativas: [{ texto: 'x', correta: true }], respostaCorreta: 'x' } })
  r = await st('POST', P + `/attempts/${at.id}/submit`, { respostas: [{ questionId: qOutra.id, respostaTexto: 'x' }] }); check('submit questão de outra prova 400', r.status === 400, r)
  r = await st('POST', P + `/attempts/${at.id}/submit`, { respostas: [{ questionId: q1.id, respostaTexto: 'Fêmur' }, { questionId: q2.id, respostaTexto: 'true' }, { questionId: q3.id, respostaTexto: 'A marcha tem fase de apoio e balanço.' }] }); check('submit com dissertativa+IA indisponível => aguardando correção manual', r.status === 200 && r.json.aguardandoCorrecaoManual === true && r.json.attempt.finalizadoEm === null, r)
  r = await st('POST', P + `/attempts/${at.id}/submit`, { respostas: [{ questionId: q3.id, respostaTexto: 'mudei' }] }); check('reenvio 409', r.status === 409, r)
  r = await st2('GET', P + `/attempts/${at.id}`); check('ver tentativa alheia 403', r.status === 403, r)
  r = await stB('GET', P + `/attempts/${at.id}`); check('ver tentativa xtenant 404', r.status === 404, r)
  r = await teacher('POST', P + `/attempts/${at.id}/answers/${q3.id}/grade`, { nota: 11 }); check('grade nota>10 400', r.status === 400, r)
  r = await teacher('POST', P + `/attempts/${at.id}/answers/${q3.id}/grade`, {}); check('grade sem nota 400', r.status === 400, r)
  r = await teacherB('POST', P + `/attempts/${at.id}/answers/${q3.id}/grade`, { nota: 5 }); check('grade xtenant 404', r.status === 404, r)
  r = await teacher('POST', P + `/attempts/${at.id}/answers/${qOutra.id}/grade`, { nota: 5 }); check('grade questão alheia 404', r.status === 404, r)
  r = await teacher('POST', P + `/attempts/${at.id}/answers/${q3.id}/grade`, { nota: 5, feedback: 'Faltou citar o balanço médio' }); check('grade ok', r.status === 200, r)
  const at2 = await prisma.assessmentAttempt.findUnique({ where: { id: at.id } }); check('nota final = (10*1 + 10*1 + 5*2)/4 = 7.5', at2?.notaFinal === 7.5 && at2.finalizadoEm != null, at2)
  r = await st('GET', P + `/attempts/${at.id}`); check('aluno vê tentativa', r.status === 200)
  r = await teacher('GET', P + `/assessments/${as.id}/attempts`); check('lista tentativas', r.status === 200 && r.json.length === 1)
  r = await admB('GET', P + `/assessments/${as.id}/attempts`); check('lista tentativas xtenant vazio', r.status === 200 && r.json.length === 0, r.json)
  // nota por questões não respondidas = 0
  r = await st2('POST', P + `/assessments/${as.id}/attempts`); const atB = r.json
  r = await st2('POST', P + `/attempts/${atB.id}/submit`, { respostas: [{ questionId: q1.id, respostaTexto: 'Fêmur' }] }); check('submit parcial com dissertativa não respondida', r.status === 200, r)
  const as3 = await prisma.assessment.create({ data: { disciplineId: disc.id, classSectionId: secA.id, titulo: 'Objetiva', tipo: 'ATIVIDADE' } })
  const qa = await prisma.question.create({ data: { assessmentId: as3.id, enunciado: 'Q a', tipo: 'MULTIPLA_ESCOLHA', alternativas: [{ texto: 'x', correta: true }, { texto: 'y', correta: false }], respostaCorreta: 'x' } })
  const qb = await prisma.question.create({ data: { assessmentId: as3.id, enunciado: 'Q b', tipo: 'MULTIPLA_ESCOLHA', alternativas: [{ texto: 'x', correta: true }, { texto: 'y', correta: false }], respostaCorreta: 'x' } })
  r = await st('POST', P + `/assessments/${as3.id}/attempts`); const at3 = r.json
  r = await st('POST', P + `/attempts/${at3.id}/submit`, { respostas: [{ questionId: qa.id, respostaTexto: 'x' }] }); check('objetiva: 1 de 2 certas => nota 5 (não 10)', r.status === 200 && r.json.attempt.notaFinal === 5 && r.json.attempt.finalizadoEm, r.json?.attempt)
  // prova fechada / não aberta / não matriculado
  const asF = await prisma.assessment.create({ data: { disciplineId: disc.id, titulo: 'Fechada', tipo: 'PROVA', dataFechamento: new Date(Date.now() - 1000) } })
  r = await st('POST', P + `/assessments/${asF.id}/attempts`); check('prova fechada 409', r.status === 409, r)
  const asN = await prisma.assessment.create({ data: { disciplineId: disc.id, titulo: 'Futura', tipo: 'PROVA', dataAbertura: new Date(Date.now() + 86400000) } })
  r = await st('POST', P + `/assessments/${asN.id}/attempts`); check('prova não aberta 409', r.status === 409, r)
  r = await st('GET', P + `/assessments/${asN.id}`); check('aluno não vê questões antes da abertura', r.status === 200 && r.json.questoes.length === 0, r)
  const stNo = api((await import('jsonwebtoken')).default.sign({ id: U.FINANCE.id, clinicId: A.clinic.id, tenantId: A.tenantId, role: 'STUDENT' }, process.env.JWT_SECRET!))
  r = await stNo('POST', P + `/assessments/${as.id}/attempts`); check('aluno não matriculado 403', r.status === 403, r)
  // submissão após fechamento
  const asC = await prisma.assessment.create({ data: { disciplineId: disc.id, classSectionId: secA.id, titulo: 'Fecha logo', tipo: 'PROVA', dataFechamento: new Date(Date.now() + 1500) } })
  const qc = await prisma.question.create({ data: { assessmentId: asC.id, enunciado: 'Q c', tipo: 'MULTIPLA_ESCOLHA', alternativas: [{ texto: 'x', correta: true }, { texto: 'y', correta: false }], respostaCorreta: 'x' } })
  r = await st('POST', P + `/assessments/${asC.id}/attempts`); const atC = r.json
  await new Promise((res) => setTimeout(res, 1800))
  r = await st('POST', P + `/attempts/${atC.id}/submit`, { respostas: [{ questionId: qc.id, respostaTexto: 'x' }] }); check('submit após fechamento 409', r.status === 409, r)
  // integração: importar prova para notas
  r = await coord('POST', '/edu/notas/bootstrap', {})
  r = await teacher('POST', `/edu/notas/turmas/${secA.id}/componentes/aplicar-regra`, {}); const comps = r.json.componentes
  const p1 = comps.find((c: any) => c.codigo === 'P1')
  r = await teacher('POST', `/edu/notas/turmas/${secA.id}/componentes/${p1.id}/importar-prova`, { assessmentId: as.id }); check('importar prova p/ notas', r.status === 200 && r.json.importadas === 2, r.json)
  const l = await prisma.ntLancamento.findFirst({ where: { componenteId: p1.id, studentId: s1.id } }); check('nota importada = 7.5', l?.valor === 7.5 && l.attemptId === at.id, l)
  jobs = await runEduJobs()
  for (const [k, v] of Object.entries<any>(jobs)) if (!v.ok) check('job ' + k, false, v)
  await close()
}
main().catch((e) => { console.error(e); process.exit(2) })
