/**
 * Smoke test end-to-end do EduMaster Pro.
 *
 * Cria uma instituição (Clinic) e um usuário ADMIN descartáveis, percorre o
 * fluxo principal de cada um dos 15 módulos pela API HTTP real (não chama
 * controllers diretamente), e remove tudo ao final (delete em cascata do
 * Clinic). Não altera nenhum dado de clínicas/instituições reais.
 *
 * Requer o backend já rodando (ver scripts/run-smoke-tests.sh para subir o
 * servidor, rodar este script e derrubar o servidor automaticamente).
 *
 * Uso:
 *   npx tsx scripts/edu-smoke-test.ts
 *   SMOKE_API_URL=http://localhost:3000/api npx tsx scripts/edu-smoke-test.ts
 */
import { prisma } from '../src/lib/prisma'
import { createUser } from '../src/services/userService'

const API = process.env.SMOKE_API_URL || 'http://localhost:3000/api'

interface StepResult { name: string; ok: boolean; error?: string }
const results: StepResult[] = []

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

async function step(name: string, fn: () => Promise<void>) {
  try {
    await fn()
    results.push({ name, ok: true })
    console.log(`  ✓ ${name}`)
  } catch (error: any) {
    results.push({ name, ok: false, error: error?.message || String(error) })
    console.error(`  ✗ ${name} — ${error?.message || error}`)
  }
}

async function call(token: string, clinicId: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(clinicId ? { 'X-Clinic-ID': clinicId } : {})
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  })
  let json: any = null
  try {
    json = await res.json()
  } catch {
    // resposta sem corpo
  }
  return { status: res.status, body: json }
}

async function main() {
  const suffix = Date.now().toString(36)
  const state: Record<string, any> = {}
  let adminToken = ''
  let studentToken = ''

  console.log(`\nSmoke test EduMaster Pro — instituição descartável smoke-${suffix}`)
  console.log(`API: ${API}\n`)

  const clinic = await prisma.clinic.create({
    data: {
      tenantId: `smoke-${suffix}`,
      name: `Smoke Test Institution ${suffix}`,
      email: `smoke-${suffix}@example.com`,
      phone: '11999999999',
      cnpj: '00000000000000'
    }
  })
  const tenantId = clinic.tenantId
  const adminEmail = `admin-${suffix}@smoke.test`
  const adminPassword = 'Smoke#Test123'
  const studentEmail = `aluno-${suffix}@smoke.test`
  const studentPassword = 'Smoke#Student123'

  await createUser({
    clinicId: clinic.id, tenantId, email: adminEmail, password: adminPassword,
    firstName: 'Smoke', lastName: 'Admin', role: 'ADMIN', isActive: true
  })

  const admin = (method: string, path: string, body?: unknown) => call(adminToken, clinic.id, method, path, body)
  const student = (method: string, path: string, body?: unknown) => call(studentToken, clinic.id, method, path, body)

  try {
    await step('login como admin', async () => {
      const r = await call('', '', 'POST', '/auth/login', { clinicId: clinic.id, email: adminEmail, password: adminPassword })
      assert(r.status === 200 && r.body?.token, `status ${r.status}: ${JSON.stringify(r.body)}`)
      adminToken = r.body.token
    })

    // ---------------------------------------------------------------
    // ACADÊMICO
    // ---------------------------------------------------------------
    await step('acadêmico: criar programa', async () => {
      const r = await admin('POST', '/edu/programs', { name: 'Smoke Engenharia', code: `ENG-${suffix}`, level: 'GRADUACAO', totalTerms: 8 })
      assert(r.status === 201, JSON.stringify(r.body))
      state.programId = r.body.id
    })
    await step('acadêmico: criar disciplina', async () => {
      const r = await admin('POST', '/edu/subjects', { name: 'Smoke Cálculo I', code: `CALC-${suffix}`, workloadHours: 80 })
      assert(r.status === 201, JSON.stringify(r.body))
      state.subjectId = r.body.id
    })
    await step('acadêmico: criar matriz curricular', async () => {
      const r = await admin('POST', '/edu/curriculums', { programId: state.programId, version: '1.0', name: 'Matriz 2026' })
      assert(r.status === 201, JSON.stringify(r.body))
      state.curriculumId = r.body.id
    })
    await step('acadêmico: vincular disciplina à matriz', async () => {
      const r = await admin('POST', `/edu/curriculums/${state.curriculumId}/subjects`, { subjectId: state.subjectId, termNumber: 1, workloadHours: 80 })
      assert(r.status === 201, JSON.stringify(r.body))
      state.curriculumSubjectId = r.body.id
    })
    await step('acadêmico: criar período letivo', async () => {
      const r = await admin('POST', '/edu/terms', {
        programId: state.programId, name: '2026/1', type: 'SEMESTRE',
        startDate: new Date().toISOString(), endDate: new Date(Date.now() + 180 * 86400000).toISOString()
      })
      assert(r.status === 201, JSON.stringify(r.body))
      state.termId = r.body.id
    })
    await step('acadêmico: criar turma', async () => {
      const r = await admin('POST', '/edu/classes', { programId: state.programId, curriculumSubjectId: state.curriculumSubjectId, termId: state.termId, code: `T1-${suffix}`, capacity: 40 })
      assert(r.status === 201, JSON.stringify(r.body))
      state.classId = r.body.id
    })
    await step('acadêmico: cadastrar aluno', async () => {
      const r = await admin('POST', '/edu/students', { fullName: 'Aluno Smoke Teste', email: studentEmail })
      assert(r.status === 201, JSON.stringify(r.body))
      state.studentId = r.body.id
    })
    await step('acadêmico: matricular aluno (mensalidade automática)', async () => {
      const r = await admin('POST', '/edu/enrollments', { studentId: state.studentId, programId: state.programId, curriculumId: state.curriculumId, termId: state.termId, monthlyFee: 950.5, tuitionDueDay: 10 })
      assert(r.status === 201, JSON.stringify(r.body))
      assert(r.body.tuitionBillId, 'mensalidade automática (RecurringBill) não foi gerada na matrícula')
      assert(r.body.contractId && r.body.contractSigningToken, 'contrato de matrícula digital não foi gerado automaticamente')
      state.enrollmentId = r.body.id
      state.contractSigningToken = r.body.contractSigningToken
    })
    await step('contrato de matrícula: consultar e assinar pelo link público', async () => {
      const view = await call('', '', 'GET', `/edu/contracts/sign/${state.contractSigningToken}`)
      assert(view.status === 200 && view.body.status === 'PENDENTE_ASSINATURA', JSON.stringify(view.body))
      const sign = await call('', '', 'POST', `/edu/contracts/sign/${state.contractSigningToken}`, { signedByName: 'Aluno Smoke Teste' })
      assert(sign.status === 200 && sign.body.status === 'ASSINADO', JSON.stringify(sign.body))
      const resign = await call('', '', 'POST', `/edu/contracts/sign/${state.contractSigningToken}`, { signedByName: 'Aluno Smoke Teste' })
      assert(resign.status === 409, `reassinatura deveria ser rejeitada: ${JSON.stringify(resign.body)}`)
    })
    await step('contrato de matrícula: listar na secretaria', async () => {
      const r = await admin('GET', `/edu/contracts?studentId=${state.studentId}`)
      assert(r.status === 200 && r.body.length === 1 && r.body[0].status === 'ASSINADO', JSON.stringify(r.body))
    })
    await step('acadêmico: matricular aluno na turma', async () => {
      const r = await admin('POST', `/edu/classes/${state.classId}/enrollments`, { studentId: state.studentId, enrollmentId: state.enrollmentId })
      assert(r.status === 201, JSON.stringify(r.body))
    })
    await step('acadêmico: criar sessão de aula', async () => {
      const r = await admin('POST', `/edu/classes/${state.classId}/sessions`, { type: 'TEORICA', title: 'Aula 1', scheduledAt: new Date(Date.now() + 86400000).toISOString(), durationMinutes: 60 })
      assert(r.status === 201, JSON.stringify(r.body))
      state.sessionId = r.body.id
    })
    await step('acadêmico: lançar frequência', async () => {
      const r = await admin('POST', `/edu/sessions/${state.sessionId}/attendance`, { records: [{ studentId: state.studentId, present: true }] })
      assert(r.status === 201, JSON.stringify(r.body))
    })

    await step('acadêmico: criar e vincular login do aluno', async () => {
      const studentUser = await createUser({
        clinicId: clinic.id, tenantId, email: studentEmail, password: studentPassword,
        firstName: 'Aluno', lastName: 'Smoke', role: 'STUDENT', isActive: true
      })
      await prisma.eduStudent.update({ where: { id: state.studentId }, data: { userId: studentUser.id } })
    })
    await step('acadêmico: login como aluno', async () => {
      const r = await call('', '', 'POST', '/auth/login', { clinicId: clinic.id, email: studentEmail, password: studentPassword })
      assert(r.status === 200 && r.body?.token, `status ${r.status}: ${JSON.stringify(r.body)}`)
      studentToken = r.body.token
    })
    await step('acadêmico (self-service): listar minhas matrículas', async () => {
      const r = await student('GET', '/edu/me/enrollments')
      assert(r.status === 200 && Array.isArray(r.body) && r.body.length === 1, JSON.stringify(r.body))
    })

    await step('equivalência: abrir solicitação', async () => {
      const r = await admin('POST', '/edu/equivalency-requests', {
        studentId: state.studentId, programId: state.programId, originInstitution: 'Instituição Smoke Origem',
        items: [{ originSubjectName: 'Cálculo I (origem)', originWorkloadHours: 80, targetSubjectId: state.subjectId }]
      })
      assert(r.status === 201, JSON.stringify(r.body))
      state.equivalencyItemId = r.body.items[0].id
    })
    await step('equivalência: decidir item (aprovar)', async () => {
      const r = await admin('PUT', `/edu/equivalency-items/${state.equivalencyItemId}/decision`, { status: 'APROVADO', targetSubjectId: state.subjectId })
      assert(r.status === 200 && r.body.status === 'APROVADO', JSON.stringify(r.body))
    })

    // ---------------------------------------------------------------
    // PROVAS COM IA (fluxo manual, sem depender da IA)
    // ---------------------------------------------------------------
    await step('provas: criar questão objetiva', async () => {
      const r = await admin('POST', '/edu/questions', {
        subjectId: state.subjectId, type: 'OBJETIVA_UNICA', statement: 'Quanto é 2+2?',
        options: [{ text: '3', isCorrect: false }, { text: '4', isCorrect: true }]
      })
      assert(r.status === 201, JSON.stringify(r.body))
      state.questionId = r.body.id
      state.correctOptionId = r.body.options.find((o: any) => o.isCorrect)?.id
      assert(state.correctOptionId, 'opção correta não retornada')
    })
    await step('provas: criar questão dissertativa', async () => {
      const r = await admin('POST', '/edu/questions', { subjectId: state.subjectId, type: 'DISSERTATIVA', statement: 'Explique o Teorema Fundamental do Cálculo.' })
      assert(r.status === 201, JSON.stringify(r.body))
      state.essayQuestionId = r.body.id
    })
    await step('provas: criar prova', async () => {
      const r = await admin('POST', '/edu/exams', { classId: state.classId, title: 'Prova Smoke 1', durationMinutes: 60 })
      assert(r.status === 201, JSON.stringify(r.body))
      state.examId = r.body.id
    })
    await step('provas: incluir questões na prova', async () => {
      const r1 = await admin('POST', `/edu/exams/${state.examId}/questions`, { questionId: state.questionId, points: 5 })
      assert(r1.status === 201, JSON.stringify(r1.body))
      state.examQuestionObjId = r1.body.id
      const r2 = await admin('POST', `/edu/exams/${state.examId}/questions`, { questionId: state.essayQuestionId, points: 5 })
      assert(r2.status === 201, JSON.stringify(r2.body))
      state.examQuestionEssayId = r2.body.id
    })
    await step('provas: publicar prova', async () => {
      const r = await admin('POST', `/edu/exams/${state.examId}/publish`)
      assert(r.status === 200 && r.body.status === 'PUBLICADA', JSON.stringify(r.body))
    })
    await step('provas (self-service): iniciar tentativa', async () => {
      const r = await student('POST', `/edu/me/exams/${state.examId}/start`, {})
      assert((r.status === 201 || r.status === 200) && r.body?.id, JSON.stringify(r.body))
      state.attemptId = r.body.id
    })
    await step('provas (self-service): enviar respostas', async () => {
      const r = await student('POST', `/edu/me/exam-attempts/${state.attemptId}/submit`, {
        answers: [
          { examQuestionId: state.examQuestionObjId, selectedOptionIds: [state.correctOptionId] },
          { examQuestionId: state.examQuestionEssayId, essayText: 'O TFC conecta derivação e integração.' }
        ]
      })
      assert(r.status === 200, JSON.stringify(r.body))
    })
    await step('provas: corrigir manualmente a dissertativa', async () => {
      const attempts = await admin('GET', `/edu/exams/${state.examId}/attempts`)
      assert(attempts.status === 200, JSON.stringify(attempts.body))
      const attempt = attempts.body.find((a: any) => a.id === state.attemptId)
      assert(attempt, 'tentativa não encontrada na listagem')
      const essayAnswer = attempt.answers.find((a: any) => a.examQuestionId === state.examQuestionEssayId)
      assert(essayAnswer, 'resposta dissertativa não encontrada')
      const r = await admin('POST', `/edu/exam-answers/${essayAnswer.id}/manual-grade`, { manualScore: 4.5, manualFeedback: 'Bom raciocínio.' })
      assert(r.status === 200, JSON.stringify(r.body))
    })

    // ---------------------------------------------------------------
    // DESEMPENHO E REFORÇO
    // ---------------------------------------------------------------
    await step('desempenho: painel do aluno', async () => {
      const r = await admin('GET', `/edu/students/${state.studentId}/performance`)
      assert(r.status === 200, JSON.stringify(r.body))
    })
    await step('desempenho: criar plano de reforço', async () => {
      const r = await admin('POST', '/edu/reinforcement-plans', { studentId: state.studentId, subjectId: state.subjectId, title: 'Reforço Smoke' })
      assert(r.status === 201, JSON.stringify(r.body))
      state.reinforcementPlanId = r.body.id
    })
    await step('desempenho: adicionar e concluir ação do plano', async () => {
      const r1 = await admin('POST', `/edu/reinforcement-plans/${state.reinforcementPlanId}/actions`, { description: 'Revisar limites e derivadas' })
      assert(r1.status === 201, JSON.stringify(r1.body))
      const r2 = await admin('POST', `/edu/reinforcement-actions/${r1.body.id}/complete`)
      assert(r2.status === 200 && r2.body.status === 'CONCLUIDA', JSON.stringify(r2.body))
    })

    // ---------------------------------------------------------------
    // CONTEÚDO E BIBLIOTECA
    // ---------------------------------------------------------------
    await step('conteúdo: criar material (link externo)', async () => {
      const r = await admin('POST', '/edu/content-items', { subjectId: state.subjectId, type: 'PDF', title: 'Apostila Smoke', url: 'https://example.com/apostila.pdf' })
      assert(r.status === 201, JSON.stringify(r.body))
      state.contentItemId = r.body.id
    })
    await step('conteúdo: gerar acesso ao material', async () => {
      const r = await admin('GET', `/edu/content-items/${state.contentItemId}/access`)
      assert(r.status === 200 && r.body.url, JSON.stringify(r.body))
    })
    await step('conteúdo: criar fórum, tópico e resposta', async () => {
      const forum = await admin('POST', '/edu/forums', { subjectId: state.subjectId, title: 'Fórum Smoke' })
      assert(forum.status === 201, JSON.stringify(forum.body))
      const topic = await admin('POST', `/edu/forums/${forum.body.id}/topics`, { title: 'Dúvida Smoke', body: 'Como resolver o exercício 3?' })
      assert(topic.status === 201, JSON.stringify(topic.body))
      const reply = await admin('POST', `/edu/forum-topics/${topic.body.id}/replies`, { body: 'Aplique a regra da cadeia.' })
      assert(reply.status === 201, JSON.stringify(reply.body))
    })
    await step('conteúdo: criar deck e flashcard', async () => {
      const deck = await admin('POST', '/edu/flashcard-decks', { subjectId: state.subjectId, title: 'Flashcards Smoke' })
      assert(deck.status === 201, JSON.stringify(deck.body))
      const card = await admin('POST', `/edu/flashcard-decks/${deck.body.id}/cards`, { front: 'Derivada de x²', back: '2x' })
      assert(card.status === 201, JSON.stringify(card.body))
    })

    // ---------------------------------------------------------------
    // PROTOCOLO, CERTIFICADOS E DOCUMENTOS
    // ---------------------------------------------------------------
    await step('secretaria: abrir protocolo e atualizar status', async () => {
      const r = await admin('POST', `/edu/students/${state.studentId}/document-requests`, { type: 'DECLARACAO_MATRICULA' })
      assert(r.status === 201, JSON.stringify(r.body))
      const r2 = await admin('PUT', `/edu/document-requests/${r.body.id}/status`, { status: 'PRONTO' })
      assert(r2.status === 200, JSON.stringify(r2.body))
    })
    await step('secretaria: emitir certificado e verificar publicamente', async () => {
      const r = await admin('POST', '/edu/certificates', { studentId: state.studentId, type: 'CERTIFICADO_PARTICIPACAO', title: 'Certificado Smoke' })
      assert(r.status === 201 && r.body.verificationCode, JSON.stringify(r.body))
      const verify = await call('', '', 'GET', `/edu/certificates/verify/${r.body.verificationCode}`)
      assert(verify.status === 200 && verify.body.valid === true, JSON.stringify(verify.body))
    })

    // ---------------------------------------------------------------
    // FACILITIES (patrimônio, manutenção, estacionamento, reservas)
    // ---------------------------------------------------------------
    await step('facilities: patrimônio e manutenção', async () => {
      const asset = await admin('POST', '/edu/assets', { code: `AST-${suffix}`, name: 'Projetor Smoke', category: 'EQUIPAMENTO' })
      assert(asset.status === 201, JSON.stringify(asset.body))
      const order = await admin('POST', '/edu/maintenance-orders', { assetId: asset.body.id, title: 'Trocar lâmpada' })
      assert(order.status === 201, JSON.stringify(order.body))
      const resolved = await admin('PUT', `/edu/maintenance-orders/${order.body.id}/status`, { status: 'CONCLUIDA' })
      assert(resolved.status === 200, JSON.stringify(resolved.body))
    })
    await step('facilities: estacionamento', async () => {
      const spot = await admin('POST', '/edu/parking-spots', { code: `VG-${suffix}`, type: 'ALUNO' })
      assert(spot.status === 201, JSON.stringify(spot.body))
      const assign = await admin('POST', `/edu/parking-spots/${spot.body.id}/assign`, { assignedToStudentId: state.studentId })
      assert(assign.status === 200, JSON.stringify(assign.body))
      const release = await admin('POST', `/edu/parking-spots/${spot.body.id}/release`, {})
      assert(release.status === 200, JSON.stringify(release.body))
    })
    await step('facilities: reserva de sala sem conflito de horário', async () => {
      const resource = await admin('POST', '/edu/bookable-resources', { name: 'Sala Smoke 101', category: 'SALA', capacity: 30 })
      assert(resource.status === 201, JSON.stringify(resource.body))
      const start = new Date(Date.now() + 2 * 86400000)
      const end = new Date(start.getTime() + 3600000)
      const booking = await admin('POST', '/edu/resource-bookings', { resourceId: resource.body.id, purpose: 'Aula Smoke', startAt: start.toISOString(), endAt: end.toISOString() })
      assert(booking.status === 201, JSON.stringify(booking.body))
      const conflict = await admin('POST', '/edu/resource-bookings', { resourceId: resource.body.id, purpose: 'Reunião Smoke', startAt: start.toISOString(), endAt: end.toISOString() })
      assert(conflict.status === 409, `conflito de horário deveria ter sido rejeitado: ${JSON.stringify(conflict.body)}`)
      const cancel = await admin('POST', `/edu/resource-bookings/${booking.body.id}/cancel`)
      assert(cancel.status === 200, JSON.stringify(cancel.body))
    })
    await step('facilities: item com vencimento', async () => {
      const r = await admin('POST', '/edu/expiring-items', { category: 'EXTINTOR', title: 'Extintor corredor A', expiresAt: new Date(Date.now() + 30 * 86400000).toISOString() })
      assert(r.status === 201, JSON.stringify(r.body))
      const resolved = await admin('POST', `/edu/expiring-items/${r.body.id}/resolve`)
      assert(resolved.status === 200, JSON.stringify(resolved.body))
    })

    // ---------------------------------------------------------------
    // SUPRIMENTOS (estoque, compras, vendas)
    // ---------------------------------------------------------------
    await step('suprimentos: estoque, compra e venda', async () => {
      const item = await admin('POST', '/edu/supply-items', { code: `ITEM-${suffix}`, name: 'Caderno Smoke', unit: 'UN', salePrice: 15 })
      assert(item.status === 201, JSON.stringify(item.body))

      const purchase = await admin('POST', '/edu/purchase-orders', { supplierName: 'Fornecedor Smoke', items: [{ itemId: item.body.id, description: 'Caderno Smoke', quantity: 100, unitPrice: 8 }] })
      assert(purchase.status === 201, JSON.stringify(purchase.body))
      const approved = await admin('POST', `/edu/purchase-orders/${purchase.body.id}/approve`)
      assert(approved.status === 200, JSON.stringify(approved.body))
      const received = await admin('POST', `/edu/purchase-orders/${purchase.body.id}/receive`)
      assert(received.status === 200 && received.body.financialEntryId, JSON.stringify(received.body))

      const sale = await admin('POST', '/edu/sales', { studentId: state.studentId, buyerName: 'Aluno Smoke Teste', items: [{ itemId: item.body.id, description: 'Caderno Smoke', quantity: 2, unitPrice: 15 }] })
      assert(sale.status === 201, JSON.stringify(sale.body))
      state.supplyItemId = item.body.id
    })

    // ---------------------------------------------------------------
    // CANTINA COM CRÉDITOS (carteira pré-paga do aluno)
    // ---------------------------------------------------------------
    await step('cantina: recarregar créditos do aluno', async () => {
      const r = await admin('POST', `/edu/students/${state.studentId}/wallet/recharge`, { amount: 50 })
      assert(r.status === 201 && r.body.balance === 50, JSON.stringify(r.body))
    })
    await step('cantina: comprar na cantina pagando com créditos', async () => {
      const sale = await admin('POST', '/edu/sales', {
        studentId: state.studentId, buyerName: 'Aluno Smoke Teste', paymentMethod: 'CREDITO_CANTINA',
        items: [{ itemId: state.supplyItemId, description: 'Caderno Smoke', quantity: 1, unitPrice: 15 }]
      })
      assert(sale.status === 201 && !sale.body.financialEntryId, JSON.stringify(sale.body))
      const wallet = await admin('GET', `/edu/students/${state.studentId}/wallet`)
      assert(wallet.status === 200 && wallet.body.balance === 35, `saldo esperado 35, obtido: ${JSON.stringify(wallet.body)}`)
    })
    await step('cantina: rejeitar compra com saldo insuficiente', async () => {
      const sale = await admin('POST', '/edu/sales', {
        studentId: state.studentId, buyerName: 'Aluno Smoke Teste', paymentMethod: 'CREDITO_CANTINA',
        items: [{ itemId: state.supplyItemId, description: 'Caderno Smoke', quantity: 10, unitPrice: 15 }]
      })
      assert(sale.status === 409, `compra sem saldo deveria ser rejeitada: ${JSON.stringify(sale.body)}`)
    })
    await step('cantina (self-service): consultar minha carteira', async () => {
      const r = await student('GET', '/edu/me/wallet')
      assert(r.status === 200 && r.body.balance === 35 && Array.isArray(r.body.transactions), JSON.stringify(r.body))
    })

    // ---------------------------------------------------------------
    // GOVERNANÇA E REGULATÓRIO
    // ---------------------------------------------------------------
    await step('governança: comissão, meta do PDI e vigilância regulatória', async () => {
      const committee = await admin('POST', '/edu/committees', { type: 'CPA', name: 'CPA Smoke' })
      assert(committee.status === 201, JSON.stringify(committee.body))
      const member = await admin('POST', `/edu/committees/${committee.body.id}/members`, { name: 'Membro Smoke' })
      assert(member.status === 201, JSON.stringify(member.body))

      const goal = await admin('POST', '/edu/pdi-goals', { title: 'Meta Smoke', targetValue: 100 })
      assert(goal.status === 201, JSON.stringify(goal.body))
      const updated = await admin('PUT', `/edu/pdi-goals/${goal.body.id}`, { currentValue: 50, status: 'EM_ANDAMENTO' })
      assert(updated.status === 200, JSON.stringify(updated.body))

      const watch = await admin('POST', '/edu/regulatory-watches', { source: 'MEC', title: 'Portaria Smoke' })
      assert(watch.status === 201, JSON.stringify(watch.body))
      const status = await admin('PUT', `/edu/regulatory-watches/${watch.body.id}/status`, { status: 'TRATADO' })
      assert(status.status === 200, JSON.stringify(status.body))
    })

    // ---------------------------------------------------------------
    // CAPTAÇÃO E INGRESSO (vestibular público + conversão em matrícula)
    // ---------------------------------------------------------------
    await step('captação: processo seletivo, inscrição pública e classificação', async () => {
      const exam = await admin('POST', '/edu/admission-exams', {
        programId: state.programId, name: 'Vestibular Smoke', vacancies: 1,
        applicationStart: new Date(Date.now() - 86400000).toISOString(),
        applicationEnd: new Date(Date.now() + 30 * 86400000).toISOString()
      })
      assert(exam.status === 201, JSON.stringify(exam.body))
      state.admissionExamId = exam.body.id

      const apply = await call('', '', 'POST', `/edu/admission-exams/${state.admissionExamId}/apply`, {
        candidateName: 'Candidato Smoke', candidateEmail: `candidato-${suffix}@smoke.test`
      })
      assert(apply.status === 201, JSON.stringify(apply.body))
      state.applicationId = apply.body.id

      const score = await admin('PUT', `/edu/applications/${state.applicationId}/score`, { score: 800 })
      assert(score.status === 200, JSON.stringify(score.body))

      const classify = await admin('POST', `/edu/admission-exams/${state.admissionExamId}/classify`)
      assert(classify.status === 200 && classify.body.classified === 1, JSON.stringify(classify.body))

      const convert = await admin('POST', `/edu/applications/${state.applicationId}/convert-to-enrollment`, { curriculumId: state.curriculumId, termId: state.termId, monthlyFee: 900 })
      assert(convert.status === 201 && convert.body.enrollment?.tuitionBillId, JSON.stringify(convert.body))
    })

    // ---------------------------------------------------------------
    // PESQUISA E EXTENSÃO
    // ---------------------------------------------------------------
    await step('pesquisa: agência, edital e projeto', async () => {
      const agency = await admin('POST', '/edu/funding-agencies', { name: 'Agência Smoke' })
      assert(agency.status === 201, JSON.stringify(agency.body))
      const call2 = await admin('POST', '/edu/funding-calls', { agencyId: agency.body.id, title: 'Edital Smoke', applicationDeadline: new Date(Date.now() + 60 * 86400000).toISOString() })
      assert(call2.status === 201, JSON.stringify(call2.body))
      const project = await admin('POST', '/edu/research-projects', { type: 'PESQUISA', title: 'Projeto Smoke', coordinatorName: 'Prof. Smoke', fundingAgencyId: agency.body.id, fundingCallId: call2.body.id })
      assert(project.status === 201, JSON.stringify(project.body))
      const status = await admin('PUT', `/edu/research-projects/${project.body.id}/status`, { status: 'APROVADO' })
      assert(status.status === 200, JSON.stringify(status.body))
      const member = await admin('POST', `/edu/research-projects/${project.body.id}/members`, { name: 'Aluno Pesquisador Smoke', studentId: state.studentId })
      assert(member.status === 201, JSON.stringify(member.body))
    })

    // ---------------------------------------------------------------
    // JURÍDICO
    // ---------------------------------------------------------------
    await step('jurídico: demanda, audiência e desfecho', async () => {
      const legalCase = await admin('POST', '/edu/legal-cases', { type: 'ADMINISTRATIVO', title: 'Demanda Smoke', involvedName: 'Aluno Smoke Teste', studentId: state.studentId })
      assert(legalCase.status === 201, JSON.stringify(legalCase.body))
      const hearing = await admin('POST', `/edu/legal-cases/${legalCase.body.id}/hearings`, { scheduledAt: new Date(Date.now() + 5 * 86400000).toISOString() })
      assert(hearing.status === 201, JSON.stringify(hearing.body))
      const outcome = await admin('PUT', `/edu/legal-hearings/${hearing.body.id}/outcome`, { status: 'REALIZADA', outcome: 'ACORDO' })
      assert(outcome.status === 200, JSON.stringify(outcome.body))
      const deadline = await admin('POST', `/edu/legal-cases/${legalCase.body.id}/deadlines`, { title: 'Prazo recursal Smoke', expiresAt: new Date(Date.now() + 10 * 86400000).toISOString() })
      assert(deadline.status === 201, JSON.stringify(deadline.body))
    })

    // ---------------------------------------------------------------
    // CARREIRAS (mural de estágio/emprego)
    // ---------------------------------------------------------------
    await step('carreiras: vaga, candidatura e decisão', async () => {
      const posting = await admin('POST', '/edu/job-postings', { title: 'Estágio Smoke', company: 'Empresa Smoke', description: 'Vaga de estágio para teste automatizado.' })
      assert(posting.status === 201, JSON.stringify(posting.body))
      const apply = await student('POST', `/edu/me/job-postings/${posting.body.id}/apply`, {})
      assert(apply.status === 201, JSON.stringify(apply.body))
      const decide = await admin('PUT', `/edu/job-applications/${apply.body.id}/decision`, { status: 'APROVADA' })
      assert(decide.status === 200, JSON.stringify(decide.body))
    })

    // ---------------------------------------------------------------
    // MOTOR DE FORMULÁRIOS
    // ---------------------------------------------------------------
    await step('formulários: template, submissão e revisão', async () => {
      const template = await admin('POST', '/edu/form-templates', {
        name: 'Formulário Smoke', fields: [{ key: 'observacao', label: 'Observação', type: 'TEXT', required: true }]
      })
      assert(template.status === 201, JSON.stringify(template.body))
      const submission = await admin('POST', `/edu/form-templates/${template.body.id}/submissions`, { data: { observacao: 'Teste automatizado' }, submitterName: 'Smoke' })
      assert(submission.status === 201, JSON.stringify(submission.body))
      const review = await admin('PUT', `/edu/form-submissions/${submission.body.id}/review`, { status: 'APROVADO' })
      assert(review.status === 200, JSON.stringify(review.body))
    })

    // ---------------------------------------------------------------
    // INSTITUIÇÃO (identidade e polos)
    // ---------------------------------------------------------------
    await step('instituição: perfil e campus', async () => {
      const profile = await admin('GET', '/edu/institution-profile')
      assert(profile.status === 200, JSON.stringify(profile.body))
      const campus = await admin('POST', '/edu/campuses', { name: 'Polo Smoke', type: 'POLO' })
      assert(campus.status === 201, JSON.stringify(campus.body))
    })
  } finally {
    await prisma.clinic.delete({ where: { id: clinic.id } })
  }

  const failed = results.filter(r => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} passos OK.`)
  if (failed.length) {
    console.log('\nFalhas:')
    for (const f of failed) console.log(`  - ${f.name}: ${f.error}`)
    process.exitCode = 1
  } else {
    console.log('Smoke test concluído sem falhas.')
  }
}

main()
  .catch((error) => {
    console.error('\nErro fatal no smoke test:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
