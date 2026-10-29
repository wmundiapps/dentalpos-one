/**
 * E2E do PORTAL 2: ambientes de ensino, portal do aluno, portal do professor e sala virtual EAD.
 *
 *   DATABASE_URL=postgresql://USER:SENHA@127.0.0.1:5432/por npx tsx scripts/e2e/portal2.ts
 *
 * Banco LOCAL e próprio (nunca remoto). Roda o seed (seedPortal), entra com os logins de demonstração (login real, JWT emitido
 * pela API) e exercita cada fluxo, inclusive isolamento entre instituições e permissões por perfil.
 */
import jwt from 'jsonwebtoken'
import http from 'http'
import { check, fails } from './qa3-common'
import { prisma } from '../../src/lib/prisma'
import { LOGINS_DEMO, SENHA_DEMO, seedPortal } from '../seeds/portal'

const P = '/edu/portal2'
const DAY = 86_400_000
const iso = (n: number) => new Date(Date.now() + n * DAY).toISOString()

type Resp = { status: number; body: any; text: string }
async function setup() {
  const { default: app } = await import('../../src/app')
  const server = http.createServer(app).listen(0)
  const base = `http://127.0.0.1:${(server.address() as any).port}/api`
  const RUN = Date.now().toString(36)
  async function mkTenant(tenantId: string) {
    const clinic = await prisma.clinic.create({ data: { tenantId, name: 'Inst ' + tenantId, email: tenantId + '@x.com', phone: '1', cnpj: '00.000.000/0001-00' } as any })
    const users: Record<string, any> = {}
    for (const role of ['ADMIN', 'RECTOR', 'COORDINATOR', 'TEACHER', 'STUDENT', 'FINANCE', 'SECRETARY', 'STAFF']) {
      const email = `${role.toLowerCase()}@${tenantId}.com`
      const u = await prisma.user.create({ data: { clinicId: clinic.id, tenantId, email, password: 'x', firstName: role, lastName: 'QA', role } as any })
      users[role] = { id: u.id, token: jwt.sign({ id: u.id, email, clinicId: clinic.id, tenantId, role }, process.env.JWT_SECRET!) }
    }
    return { clinic, users }
  }
  const raw = async (token: string, method: string, path: string, body?: any, extra: Record<string, string> = {}): Promise<Resp> => {
    const r = await fetch(base + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json', ...extra }, body: body !== undefined ? JSON.stringify(body) : undefined })
    const text = await r.text(); let json: any; try { json = JSON.parse(text) } catch { json = text }
    if (r.status >= 500) { console.log('  5XX', method, path, r.status, text.slice(0, 300)); fails.push(`5xx ${method} ${path}`) }
    return { status: r.status, body: json, text }
  }
  const rawAs = (token: string) => (method: string, path: string, body?: any, extra?: Record<string, string>) => raw(token, method, path, body, extra)
  const tenantA = 'por-a-' + RUN, tenantB = 'por-b-' + RUN
  const A = await mkTenant(tenantA), B = await mkTenant(tenantB)
  return {
    A, B, tenantA, tenantB, base, raw, rawAs,
    as: (role: string) => rawAs(A.users[role].token), asB: (role: string) => rawAs(B.users[role].token),
    pub: (method: string, path: string) => raw('', method, path),
    close: async () => { server.close(); await prisma.$disconnect() },
  }
}
async function finish(c: any) {
  await c.close()
  console.log(fails.length ? `\nFALHAS (${fails.length}):\n` + fails.join('\n') : '\nTUDO OK')
  process.exit(fails.length ? 1 : 0)
}

async function main() {
  const c = await setup()
  const T = c.tenantA, TB = c.tenantB
  const admin = c.as('ADMIN'), adminB = c.asB('ADMIN'), coordB = c.asB('COORDINATOR')
  const ok = async (m: string, p: string, b?: any) => { const r = await admin(m, p, b); return r.status < 300 ? r.body : null }

  // ============================== seed ==============================
  const falhas: string[] = []
  const t0 = Date.now()
  const resumo = await seedPortal(ok, { tenantId: T, clinicId: c.A.clinic.id, failures: falhas })
  console.log(`# seed em ${Date.now() - t0}ms`, JSON.stringify({ ...resumo, logins: undefined }))
  check('seed sem falhas', falhas.length === 0, falhas)
  check('seed criou 7 ambientes', resumo.ambientes === 7, resumo)
  check('seed criou 6 cursos', resumo.cursos === 6, resumo)
  check('seed criou turmas', resumo.turmas >= 10, resumo)
  check('seed criou materiais', resumo.materiais >= 20, resumo)
  check('seed devolve os 5 logins de demonstração', resumo.logins.length === 5 && resumo.senha === SENHA_DEMO)
  const again = await seedPortal(ok, { tenantId: T, clinicId: c.A.clinic.id })
  check('seed idempotente (2ª execução não duplica)', again.jaExistia === true && again.turmas === 0)
  check('7 ambientes após 2 execuções', (await prisma.porAmbiente.count({ where: { tenantId: T } })) === 7)

  // ============================== logins reais ==============================
  const bcrypt = (await import('bcryptjs')).default
  const tokenDe = async (email: string) => {
    const u = await prisma.user.findFirst({ where: { clinicId: c.A.clinic.id, email } })
    return u ? { u, token: jwt.sign({ id: u.id, email, clinicId: c.A.clinic.id, tenantId: T, role: u.role }, process.env.JWT_SECRET!) } : null
  }
  const who: Record<string, any> = {}
  for (const l of LOGINS_DEMO) {
    const t = await tokenDe(l.email)
    check(`login demo existe: ${l.email}`, !!t)
    check(`senha de demonstração confere: ${l.email}`, t ? await bcrypt.compare(SENHA_DEMO, t.u.password) : false)
    who[l.email] = t
  }
  // login real pela API (JWT emitido pelo servidor) para um dos perfis
  const lr = await c.raw('', 'POST', '/auth/login', { clinicId: c.A.clinic.id, email: 'aluno.ead@suainstituicao.edu.br', password: SENHA_DEMO })
  check('login real pela API com a senha de demonstração', lr.status === 200 && !!lr.body.token, lr.body)
  const lr2 = await c.raw('', 'POST', '/auth/login', { clinicId: c.A.clinic.id, email: 'aluno.ead@suainstituicao.edu.br', password: 'errada' })
  check('senha errada recusada', lr2.status === 401)
  const eu = (email: string) => c.rawAs(who[email].token)
  const pres = eu('aluno.presencial@suainstituicao.edu.br'), ead = eu('aluno.ead@suainstituicao.edu.br'), pos = eu('aluno.pos@suainstituicao.edu.br'), prof = eu('professor@suainstituicao.edu.br'), coord = eu('coordenador@suainstituicao.edu.br')
  const prof2 = c.rawAs((await tokenDe('professora.ead@suainstituicao.edu.br'))!.token)
  const colU = (await prisma.user.findFirst({ where: { clinicId: c.A.clinic.id, email: { startsWith: 'colega1.' } } }))!
  const colega = c.rawAs(jwt.sign({ id: colU.id, email: colU.email, clinicId: c.A.clinic.id, tenantId: T, role: 'STUDENT' }, process.env.JWT_SECRET!))

  const sidPres = (await prisma.student.findFirst({ where: { tenantId: T, nomeCompleto: 'Rafael Almeida Souza' } }))!.id

  // ============================== ambientes ==============================
  let r = await pres('GET', `${P}/ambientes/meus`)
  check('aluno presencial vê só o ambiente da sua graduação', r.status === 200 && r.body.itens.length === 1 && r.body.itens[0].codigo === 'GRAD-PRES', r.body)
  check('nenhum ambiente atual antes de escolher', r.body.atual === null)
  check('aluno não tem a opção "todos"', r.body.todosPermitido === false)
  r = await ead('GET', `${P}/ambientes/meus`)
  check('aluno EAD vê só Graduação EAD', r.body.itens.length === 1 && r.body.itens[0].codigo === 'GRAD-EAD', r.body)
  r = await pos('GET', `${P}/ambientes/meus`)
  check('aluno de pós vê 2 ambientes (Lato presencial + Cursos livres)', r.body.itens.map((x: any) => x.codigo).sort().join() === 'LATO-PRES,LIVRES', r.body)
  const posAmb = r.body.itens
  r = await prof('GET', `${P}/ambientes/meus`)
  check('professor vê os ambientes em que leciona', r.body.itens.map((x: any) => x.codigo).sort().join() === 'GRAD-PRES,LATO-PRES', r.body)
  r = await coord('GET', `${P}/ambientes/meus`)
  check('coordenador vê todos os 7 ambientes', r.body.itens.length === 7 && r.body.todosPermitido === true)
  const ambCoord = Object.fromEntries(r.body.itens.map((x: any) => [x.codigo, x.id]))
  check('ambientes trazem nível, modalidade e cor', r.body.itens.every((x: any) => x.nivel && x.modalidade) && r.body.itens.some((x: any) => x.variante === '+A'))

  r = await pres('POST', `${P}/ambientes/selecionar`, { ambienteId: ambCoord['GRAD-EAD'] })
  check('aluno não seleciona ambiente que não é seu (403)', r.status === 403)
  r = await pres('POST', `${P}/ambientes/selecionar`, {})
  check('aluno não pode limpar o ambiente (400)', r.status === 400)
  r = await pres('POST', `${P}/ambientes/selecionar`, { ambienteId: ambCoord['GRAD-PRES'] })
  check('aluno seleciona o próprio ambiente', r.status === 200 && r.body.atual === ambCoord['GRAD-PRES'])
  r = await pres('GET', `${P}/ambientes/meus`)
  check('ambiente atual fica marcado e persistido', r.body.atual === ambCoord['GRAD-PRES'] && r.body.itens[0].atual === true)
  r = await pres('GET', `${P}/ambientes/atual`)
  check('GET /ambientes/atual devolve o contexto', r.body.ambiente?.codigo === 'GRAD-PRES' && r.body.ambiente.programIds.length === 1)
  check('contexto persistido em PorContexto', (await prisma.porContexto.count({ where: { tenantId: T } })) === 1)

  r = await pos('POST', `${P}/ambientes/selecionar`, { ambienteId: posAmb[0].id })
  check('aluno de pós seleciona um dos dois', r.status === 200)
  // listas respeitam o ambiente
  r = await coord('GET', '/edu/academico/programs')
  const todosProgs = r.body.length
  check('sem ambiente: coordenador vê todos os cursos', r.status === 200 && todosProgs >= 6, todosProgs)
  r = await coord('POST', `${P}/ambientes/selecionar`, { ambienteId: ambCoord['GRAD-EAD'] })
  r = await coord('GET', '/edu/academico/programs')
  check('com GRAD-EAD: só cursos EAD de graduação', r.body.length === 1 && /Pedagogia/.test(r.body[0].nome), r.body.map((p: any) => p.nome))
  r = await coord('GET', '/edu/academico/class-sections')
  check('turmas filtradas pelo ambiente', r.body.length >= 1 && r.body.every((s: any) => /EAD|Pedagogia|Educa|Psicolog|Did|Intro|Alfabet|Fundam/i.test(s.discipline.nome)), r.body.map((s: any) => s.discipline.nome))
  const nEad = r.body.length
  r = await coord('GET', '/edu/secretaria/alunos?pageSize=100')
  check('lista de alunos da secretaria filtrada pelo ambiente', r.status === 200 && r.body.items.length === 5 && r.body.items.some((a: any) => a.nomeCompleto === 'Juliana Campos Ribeiro'), r.body.items?.length)
  r = await coord('GET', '/edu/notas/turmas')
  check('diário (notas/turmas) filtrado pelo ambiente', r.status === 200 && r.body.items.length === nEad, [r.body.items?.length, nEad])
  r = await coord('GET', '/edu/academico/programs', undefined)
  r = await c.rawAs(who['coordenador@suainstituicao.edu.br'].token)('GET', '/edu/academico/programs', undefined, { 'x-edu-ambiente': ambCoord['GRAD-PRES'] })
  check('cabeçalho X-Edu-Ambiente sobrescreve o contexto por aba', r.body.length === 1 && /Administração/.test(r.body[0].nome), r.body.map((p: any) => p.nome))
  r = await c.rawAs(who['coordenador@suainstituicao.edu.br'].token)('GET', '/edu/academico/programs', undefined, { 'x-edu-ambiente': 'todos' })
  check('cabeçalho "todos" remove o filtro', r.body.length === todosProgs)
  r = await c.rawAs(who['coordenador@suainstituicao.edu.br'].token)('GET', '/edu/academico/programs', undefined, { 'x-edu-ambiente': 'id-inexistente' })
  check('ambiente inexistente no cabeçalho é ignorado', r.status === 200 && r.body.length === todosProgs)
  r = await coord('POST', `${P}/ambientes/selecionar`, { ambienteId: null })
  check('coordenador limpa o ambiente (todos)', r.status === 200 && r.body.atual === null)
  r = await coord('GET', '/edu/academico/programs')
  check('após limpar volta a ver todos os cursos', r.body.length === todosProgs)

  // gestão de ambientes
  r = await coord('POST', `${P}/ambientes`, { codigo: 'lato-teste', nome: 'Lato de Teste', nivel: 'POS_LATO', modalidade: 'HIBRIDO', variante: '+A', unidade: 'Polo Norte' })
  check('coordenador cria ambiente (código em maiúsculas)', r.status === 201 && r.body.codigo === 'LATO-TESTE', r.body)
  const novoAmb = r.body.id
  r = await coord('POST', `${P}/ambientes`, { codigo: 'LATO-TESTE', nome: 'Duplicado', nivel: 'POS_LATO' })
  check('código de ambiente duplicado: 409', r.status === 409)
  r = await coord('POST', `${P}/ambientes`, { codigo: 'X', nome: 'Curto', nivel: 'QUALQUER' })
  check('ambiente com nível inválido: 400', r.status === 400)
  r = await pres('POST', `${P}/ambientes`, { codigo: 'HACK', nome: 'Hack', nivel: 'GRADUACAO' })
  check('aluno não cria ambiente (403)', r.status === 403)
  r = await coord('PATCH', `${P}/ambientes/${novoAmb}`, { nome: 'Lato de Teste 2', cor: '#112233' })
  check('edição de ambiente', r.status === 200 && r.body.nome === 'Lato de Teste 2')
  r = await coord('PUT', `${P}/ambientes/${novoAmb}/cursos`, { programIds: [(await prisma.academicProgram.findFirst({ where: { tenantId: T, nome: { contains: 'Mestrado' } } }))!.id, 'inexistente'] })
  check('vínculo de cursos ignora ids inválidos', r.status === 200 && r.body.cursos === 1, r.body)
  r = await coord('GET', `${P}/ambientes`)
  check('gestão lista ambientes e cursos', r.status === 200 && r.body.itens.length === 8 && r.body.cursos.length >= 6)
  r = await coord('PATCH', `${P}/ambientes/${novoAmb}`, { ativo: false })
  r = await coord('GET', `${P}/ambientes/meus`)
  check('ambiente inativo some da lista', r.body.itens.length === 7)
  r = await adminB('GET', `${P}/ambientes`)
  check('isolamento: outra instituição não vê ambientes', r.status === 200 && r.body.itens.length === 0, r.body)
  r = await coordB('POST', `${P}/ambientes/selecionar`, { ambienteId: ambCoord['GRAD-PRES'] })
  check('isolamento: não seleciona ambiente de outra instituição', r.status === 403)
  r = await adminB('POST', `${P}/ambientes/bootstrap`, {})
  check('bootstrap cria os 7 ambientes padrão da instituição B', r.status === 200 && r.body.criados === 7)
  r = await adminB('POST', `${P}/ambientes/bootstrap`, {})
  check('bootstrap é idempotente', r.body.criados === 0)

  // ============================== aluno presencial ==============================
  r = await pres('GET', `${P}/aluno/turmas`)
  check('turmas do período atual do aluno', r.status === 200 && r.body.itens.length === 2 && r.body.itens.every((t: any) => t.materiais >= 6), r.body)
  const secs = r.body.itens
  check('turmas trazem professor e progresso', secs.every((t: any) => t.professor && typeof t.percentual === 'number'))
  r = await pres('GET', `${P}/aluno/turmas?todas=1`)
  check('todas as turmas (inclui períodos fechados)', r.body.itens.length === 8, r.body.itens.length)

  r = await pres('GET', `${P}/aluno/frequencia`)
  const fr = r.body
  check('frequência por disciplina', r.status === 200 && fr.disciplinas.length === 2)
  const d0 = fr.disciplinas.find((d: any) => d.faltas > 0)
  check('aluno tem faltas registradas na lista de chamadas', !!d0 && d0.linhas.some((l: any) => l.situacao === 'FALTA'), fr.disciplinas.map((d: any) => [d.disciplina, d.faltas]))
  check('frequência calcula percentual, mínimo e margem', d0.frequenciaPct != null && d0.frequenciaMinima > 0 && d0.margemFaltas != null)
  check('lista de chamadas traz data e título da aula', d0.linhas[0].data && d0.linhas[0].titulo)
  check('justificativa seeded aparece', fr.justificativas.length === 1 && fr.justificativas[0].status === 'PENDENTE')
  r = await pres('GET', `${P}/aluno/frequencia?classSectionId=${secs[0].classSectionId}`)
  check('frequência de uma disciplina', r.body.disciplinas.length === 1)

  // justificativa de faltas
  const secFalta = d0.classSectionId
  r = await pres('POST', `${P}/aluno/justificativas`, { classSectionId: secFalta, dataInicio: iso(-20), dataFim: iso(-18), motivo: 'curto' })
  check('justificativa com motivo curto: 400', r.status === 400)
  r = await pres('POST', `${P}/aluno/justificativas`, { classSectionId: secFalta, dataInicio: iso(5), dataFim: iso(6), motivo: 'Viagem a trabalho marcada.' })
  check('justificar falta futura: 400', r.status === 400)
  r = await pres('POST', `${P}/aluno/justificativas`, { classSectionId: secFalta, dataInicio: iso(-200), dataFim: iso(-100), motivo: 'Período muito antigo e longo.' })
  check('período > 30 dias: 400', r.status === 400)
  r = await pres('POST', `${P}/aluno/justificativas`, { classSectionId: secFalta, dataInicio: iso(-100), dataFim: iso(-95), motivo: 'Período antigo sem faltas.' })
  check('prazo de 30 dias vencido: 400', r.status === 400)
  r = await pres('POST', `${P}/aluno/justificativas`, { classSectionId: secFalta, dataInicio: iso(-30), dataFim: iso(-20), motivo: 'Sem faltas neste intervalo exato.' })
  check('período sem faltas: 400', r.status === 400, r.body)
  r = await pres('POST', `${P}/aluno/justificativas`, { classSectionId: secFalta, dataInicio: iso(-10), dataFim: iso(-1), motivo: 'Internação do filho, laudo anexo.', anexoUrl: 'javascript:alert(1)' })
  check('anexo com esquema perigoso é recusado', r.status === 400 || r.status === 422)
  const faltasAntes = await prisma.attendance.count({ where: { presente: false, justificativa: null, studentId: sidPres } })
  const jSeed = fr.justificativas[0]
  r = await pres('POST', `${P}/aluno/justificativas/${jSeed.id}/cancelar`)
  check('aluno cancela justificativa pendente', r.status === 200 && r.body.status === 'CANCELADA')
  r = await pres('POST', `${P}/aluno/justificativas/${jSeed.id}/cancelar`)
  check('cancelar de novo: 409', r.status === 409)
  r = await pres('POST', `${P}/aluno/justificativas`, { classSectionId: secFalta, dataInicio: iso(-10), dataFim: iso(0), motivo: 'Atestado médico de 3 dias, em anexo.', anexoUrl: 'https://exemplo.edu.br/atestado.pdf' })
  check('justificativa válida criada', r.status === 201 && r.body.status === 'PENDENTE' && r.body.faltasNoPeriodo >= 1, r.body)
  const jId = r.body.id
  r = await pres('POST', `${P}/aluno/justificativas`, { classSectionId: secFalta, dataInicio: iso(-9), dataFim: iso(-1), motivo: 'Outra justificativa sobreposta.' })
  check('justificativa sobreposta pendente: 409', r.status === 409)
  r = await ead('POST', `${P}/justificativas/${jId}/decisao`, { status: 'DEFERIDA', parecer: 'ok ok' })
  check('aluno não decide justificativa (403)', r.status === 403)
  r = await prof2('POST', `${P}/justificativas/${jId}/decisao`, { status: 'DEFERIDA', parecer: 'ok ok' })
  check('outro professor não decide (403)', r.status === 403)
  r = await prof('GET', `${P}/justificativas?status=PENDENTE`)
  check('professor vê a fila de justificativas das suas turmas', r.status === 200 && r.body.itens.some((j: any) => j.id === jId && j.aluno?.nomeCompleto))
  r = await prof('POST', `${P}/justificativas/${jId}/decisao`, { status: 'DEFERIDA', parecer: '' })
  check('decisão sem parecer: 400', r.status === 400)
  r = await prof('POST', `${P}/justificativas/${jId}/decisao`, { status: 'DEFERIDA', parecer: 'Atestado conferido.' })
  check('professor defere e abona faltas', r.status === 200 && r.body.status === 'DEFERIDA' && r.body.faltasAbonadas >= 1, r.body)
  const faltasDepois = await prisma.attendance.count({ where: { presente: false, justificativa: null, studentId: sidPres } })
  check('faltas abonadas deixam de contar como injustificadas', faltasDepois < faltasAntes, [faltasAntes, faltasDepois])
  r = await prof('POST', `${P}/justificativas/${jId}/decisao`, { status: 'INDEFERIDA', parecer: 'Tentativa de reverter.' })
  check('decidir de novo: 409', r.status === 409)
  r = await pres('GET', `${P}/aluno/frequencia?classSectionId=${secFalta}`)
  check('lista de chamadas mostra falta justificada', r.body.disciplinas[0].linhas.some((l: any) => l.situacao === 'FALTA_JUSTIFICADA'))

  // chamada por QR
  const aulaHoje = await prisma.classSession.findFirst({ where: { classSectionId: secFalta, status: 'AGENDADA' }, orderBy: { dataHoraInicio: 'asc' } })
  r = await pres('POST', `${P}/aluno/chamada-qr`, { token: 'token-invalido-123' })
  check('QR inválido: 404', r.status === 404)
  r = await pres('POST', `${P}/prof/aulas/${aulaHoje!.id}/qr`, { minutos: 10 })
  check('aluno não gera QR (403)', r.status === 403)
  r = await prof2('POST', `${P}/prof/aulas/${aulaHoje!.id}/qr`, { minutos: 10 })
  check('outro professor não gera QR (403)', r.status === 403)
  r = await prof('POST', `${P}/prof/aulas/${aulaHoje!.id}/qr`, { minutos: 10 })
  check('professor gera QR da aula', r.status === 201 && r.body.token.length >= 16, r.body)
  const qrTok = r.body.token
  r = await ead('POST', `${P}/aluno/chamada-qr`, { token: qrTok })
  check('aluno de outra turma não registra presença (403)', r.status === 403)
  r = await pres('POST', `${P}/aluno/chamada-qr`, { token: qrTok })
  check('aluno registra presença pelo QR', r.status === 200 && r.body.jaRegistrada === false)
  r = await pres('POST', `${P}/aluno/chamada-qr`, { token: qrTok })
  check('QR repetido é idempotente', r.status === 200 && r.body.jaRegistrada === true)
  await prisma.porChamadaQr.updateMany({ where: { token: qrTok }, data: { expiraEm: new Date(Date.now() - 1000) } })
  r = await pres('POST', `${P}/aluno/chamada-qr`, { token: qrTok })
  check('QR expirado: 410', r.status === 410)
  check('presença do QR gravada como PRESENTE', (await prisma.attendance.count({ where: { classSessionId: aulaHoje!.id, presente: true, studentId: sidPres } })) === 1)

  // horário, fluxograma
  r = await pres('GET', `${P}/aluno/horario`)
  check('horário: aulas agendadas, avaliações e virtuais', r.status === 200 && r.body.aulas.length >= 4 && Array.isArray(r.body.gradeSemanal) && Array.isArray(r.body.virtuais))
  check('horário traz prazos de atividades', r.body.virtuais.some((v: any) => v.tipo === 'ATIVIDADE'))
  r = await pres('GET', `${P}/aluno/fluxograma`)
  const fx = r.body.fluxograma
  check('fluxograma do curso do aluno', r.status === 200 && fx.programa.nome.includes('Administração') && fx.periodos.length === 4, fx?.periodos?.length)
  check('fluxograma agrupa por semestre e ano', fx.config.tipoPeriodo === 'SEMESTRE' && fx.anos.length === 2 && fx.periodos[0].rotulo === '1º semestre')
  const todasD = fx.periodos.flatMap((p: any) => p.disciplinas)
  const st = (n: string) => todasD.find((d: any) => d.nome === n)?.status
  check('disciplinas aprovadas do período 1', st('Fundamentos de Administração') === 'APROVADA' && st('Matemática Aplicada') === 'APROVADA', todasD.map((d: any) => [d.nome, d.status]))
  check('reprovada aparece como REPROVADA', st('Estatística Aplicada') === 'REPROVADA')
  check('disciplinas do período atual aparecem como CURSANDO', st('Gestão de Pessoas') === 'CURSANDO' && st('Matemática Financeira') === 'CURSANDO')
  check('pré-requisito não cumprido bloqueia', st('Gestão de Custos') === 'BLOQUEADA' || st('Marketing') === 'BLOQUEADA', todasD.map((d: any) => [d.nome, d.status]))
  check('resumo do fluxograma soma carga horária cumprida', fx.resumo.aprovadas >= 4 && fx.resumo.chCumprida > 0 && fx.resumo.percentual > 0 && fx.resumo.disciplinas === 10)
  check('disciplina traz lista de pré-requisitos', todasD.find((d: any) => d.nome === 'Marketing').preRequisitos[0].nome === 'Gestão de Pessoas')
  r = await ead('GET', `${P}/aluno/fluxograma`)
  check('fluxograma EAD usa bimestre', r.body.fluxograma.config.tipoPeriodo === 'BIMESTRE' && r.body.fluxograma.periodos[0].rotulo === '1º bimestre' && r.body.fluxograma.anos.length === 1, r.body.fluxograma?.config)
  r = await pres('GET', `${P}/aluno/fluxograma?programId=inexistente`)
  check('fluxograma de curso que não é do aluno: 404', r.status === 404)
  r = await pos('GET', `${P}/aluno/fluxograma`)
  check('fluxograma de pós usa módulo', r.body.fluxograma.config.tipoPeriodo === 'MODULO' && r.body.fluxograma.periodos[0].rotulo === '1º módulo')

  // coordenação configura fluxograma
  const progAdm = (await prisma.academicProgram.findFirst({ where: { tenantId: T, nome: { contains: 'Administração' } } }))!
  r = await coord('PUT', `${P}/cursos/${progAdm.id}/fluxograma-config`, { tipoPeriodo: 'ANO', periodosPorAno: 1 })
  check('coordenação altera o tipo de período', r.status === 200)
  r = await pres('GET', `${P}/aluno/fluxograma`)
  check('fluxograma reflete a nova configuração', r.body.fluxograma.config.tipoPeriodo === 'ANO' && r.body.fluxograma.anos.length === 4)
  await coord('PUT', `${P}/cursos/${progAdm.id}/fluxograma-config`, { tipoPeriodo: 'SEMESTRE', periodosPorAno: 2 })
  r = await coord('PUT', `${P}/cursos/${progAdm.id}/fluxograma-config`, { tipoPeriodo: 'DECADA', periodosPorAno: 2 })
  check('tipo de período inválido: 400', r.status === 400)
  r = await pres('PUT', `${P}/cursos/${progAdm.id}/fluxograma-config`, { tipoPeriodo: 'ANO', periodosPorAno: 1 })
  check('aluno não altera configuração (403)', r.status === 403)
  const dIds = await prisma.curriculumDiscipline.findMany({ where: { programId: progAdm.id }, include: { discipline: true } })
  const dPorNome = (n: string) => dIds.find((d) => d.discipline.nome === n)!.disciplineId
  r = await coord('PUT', `${P}/cursos/${progAdm.id}/pre-requisitos`, { itens: [{ disciplineId: dPorNome('Matemática Aplicada'), requisitoDisciplineId: dPorNome('Marketing') }] })
  check('pré-requisito posterior à disciplina: 400', r.status === 400)
  r = await coord('PUT', `${P}/cursos/${progAdm.id}/pre-requisitos`, { itens: [{ disciplineId: dPorNome('Marketing'), requisitoDisciplineId: dPorNome('Marketing') }] })
  check('pré-requisito de si mesmo: 400', r.status === 400)
  r = await coord('GET', `${P}/cursos/${progAdm.id}/fluxograma`)
  check('coordenação vê o fluxograma do curso', r.status === 200 && r.body.periodos.length === 4)

  // requerimentos / revisões / processos
  r = await pres('GET', `${P}/aluno/requerimentos`)
  check('requerimentos consolidados', r.status === 200 && r.body.itens.some((i: any) => i.kind === 'PROCESSO') && r.body.itens.some((i: any) => i.kind === 'JUSTIFICATIVA') && r.body.resumo.abertos >= 1, r.body.resumo)
  check('itens trazem prazo e resposta', r.body.itens.every((i: any) => 'prazoEm' in i && 'resposta' in i))
  r = await pres('GET', `${P}/aluno/processos`)
  check('processo de aproveitamento em andamento', r.body.itens.length === 1 && r.body.itens[0].etapaAtual === 'Análise de equivalência' && r.body.itens[0].progresso === 33, r.body.itens)
  const procApr = r.body.itens[0]
  r = await pres('GET', `${P}/processos/${procApr.id}`)
  check('acompanhamento: etapas e eventos', r.status === 200 && r.body.etapas.length === 3 && r.body.eventos.length === 2)
  r = await ead('GET', `${P}/processos/${procApr.id}`)
  check('aluno não vê processo de outro (403)', r.status === 403)
  r = await pres('POST', `${P}/aluno/processos`, { tipo: 'APROVEITAMENTO', justificativa: 'Mais um aproveitamento de estudos.', dados: { disciplinaDestinoId: dPorNome('Gestão de Custos'), disciplinaOrigem: 'X', instituicaoOrigem: 'Y', cargaHorariaOrigem: 60 } })
  check('segundo processo do mesmo tipo em aberto: 409', r.status === 409)
  r = await pres('POST', `${P}/aluno/processos`, { tipo: 'TRANCAMENTO', justificativa: 'curto' })
  check('justificativa curta: 400', r.status === 400)
  r = await pres('POST', `${P}/aluno/processos`, { tipo: 'DESTRANCAMENTO', justificativa: 'Quero voltar às aulas já.' })
  check('destrancamento exige matrícula trancada: 409', r.status === 409)
  r = await pres('POST', `${P}/aluno/processos`, { tipo: 'TRANSFERENCIA', justificativa: 'Mudança de cidade por trabalho.' })
  check('transferência sem instituição de destino: 400', r.status === 400)
  r = await coord('POST', `${P}/aluno/processos`, { tipo: 'TRANCAMENTO', justificativa: 'Coordenação abrindo pelo aluno.' })
  check('somente o aluno abre processo em seu nome (403)', r.status === 403)
  r = await pres('POST', `${P}/aluno/processos`, { tipo: 'TRANCAMENTO', justificativa: 'Problemas de saúde na família, preciso me afastar.', dados: { periodoLetivo: '2026/2', retornoPrevisto: '2027/1' } })
  check('aluno abre trancamento (4 etapas, prazo)', r.status === 201 && /^PI-\d{4}\/\d{5}$/.test(r.body.numero) && r.body.prazoEm, r.body)
  const pTr = r.body.id
  r = await pres('POST', `${P}/aluno/processos`, { tipo: 'CANCELAMENTO', justificativa: 'Teste de conflito de processos.' })
  check('não abre outro processo de matrícula enquanto há trancamento: 409', r.status === 409)
  r = await pres('POST', `${P}/processos/${pTr}/comentarios`, { texto: 'Anexei o laudo no balcão da secretaria.' })
  check('aluno comenta no processo', r.status === 201)
  r = await pres('POST', `${P}/processos/${pTr}/decisao`, { status: 'DEFERIDO', parecer: 'Aprovado.' })
  check('aluno não decide processo (403)', r.status === 403)
  r = await coord('POST', `${P}/processos/${pTr}/decisao`, { status: 'DEFERIDO', parecer: 'Deferido sem etapas.' })
  check('deferir com etapas abertas: 409', r.status === 409)
  const etp = (await coord('GET', `${P}/processos/${pTr}`)).body.etapas
  r = await coord('POST', `${P}/processos/${pTr}/etapas/${etp[2].id}`, { status: 'CONCLUIDA' })
  check('não pula etapas (409)', r.status === 409)
  for (const e of etp) { r = await coord('POST', `${P}/processos/${pTr}/etapas/${e.id}`, { status: 'CONCLUIDA', observacao: 'Conferido.' }) }
  check('conclui as 4 etapas em ordem', r.status === 200 && r.body.progresso === 100, r.body.progresso)
  r = await coord('POST', `${P}/processos/${pTr}/decisao`, { status: 'PENDENCIA', parecer: 'Falta o laudo original.' })
  check('coordenação pede pendência', r.status === 200 && r.body.status === 'PENDENCIA')
  r = await pres('POST', `${P}/processos/${pTr}/comentarios`, { texto: 'Laudo entregue hoje.' })
  r = await pres('GET', `${P}/processos/${pTr}`)
  check('resposta do aluno devolve o processo para análise', r.body.status === 'EM_ANALISE')
  r = await coord('POST', `${P}/processos/${pTr}/decisao`, { status: 'DEFERIDO', parecer: 'Trancamento deferido pelo colegiado.' })
  check('deferimento efetiva o trancamento', r.status === 200 && r.body.efeito === 'Matrícula trancada.', r.body)
  check('aluno ficou TRANCADO e matrícula TRANCADA', (await prisma.student.findFirst({ where: { userId: (await prisma.user.findFirst({ where: { clinicId: c.A.clinic.id, email: 'aluno.presencial@suainstituicao.edu.br' } }))!.id } }))?.status === 'TRANCADO')
  r = await pres('GET', `${P}/aluno/carteirinha`)
  check('carteirinha indisponível para matrícula trancada (409)', r.status === 409)
  r = await pres('POST', `${P}/processos/${pTr}/comentarios`, { texto: 'Comentário após encerrado.' })
  check('processo encerrado não aceita comentário (409)', r.status === 409)
  r = await pres('POST', `${P}/aluno/processos`, { tipo: 'DESTRANCAMENTO', justificativa: 'Retorno às aulas no próximo semestre.' })
  check('destrancamento aberto com matrícula trancada', r.status === 201)
  const pDes = r.body.id
  for (const e of (await coord('GET', `${P}/processos/${pDes}`)).body.etapas) await coord('POST', `${P}/processos/${pDes}/etapas/${e.id}`, { status: 'CONCLUIDA' })
  r = await coord('POST', `${P}/processos/${pDes}/decisao`, { status: 'DEFERIDO', parecer: 'Retorno autorizado.' })
  check('destrancamento reativa a matrícula', r.status === 200 && (await prisma.student.findFirst({ where: { userId: (await prisma.user.findFirst({ where: { clinicId: c.A.clinic.id, email: 'aluno.presencial@suainstituicao.edu.br' } }))!.id } }))?.status === 'ATIVO')
  r = await pres('POST', `${P}/aluno/processos`, { tipo: 'TRANCAMENTO', justificativa: 'Mais um trancamento, para cancelar depois.' })
  const pCan = r.body.id
  r = await pres('POST', `${P}/aluno/processos/${pCan}/cancelar`)
  check('aluno cancela o próprio processo', r.status === 200)
  r = await ead('POST', `${P}/aluno/processos/${pCan}/cancelar`)
  check('outro aluno não cancela (404)', r.status === 404)
  r = await coord('GET', `${P}/processos?abertos=1`)
  check('fila da coordenação lista abertos com aluno', r.status === 200 && r.body.itens.some((p: any) => p.id === procApr.id && p.aluno?.nomeCompleto))
  r = await pres('GET', `${P}/processos`)
  check('aluno não acessa a fila (403)', r.status === 403)
  r = await adminB('GET', `${P}/processos/${procApr.id}`)
  check('isolamento: outra instituição não vê o processo (404)', r.status === 404)

  // financeiro
  r = await pres('GET', `${P}/aluno/financeiro`)
  const fin = r.body
  check('financeiro: parcelas, resumo e vencidas', r.status === 200 && fin.itens.length === 6 && fin.resumo.qtdVencidas === 2 && fin.resumo.emDia === false, fin.resumo)
  check('parcela vencida traz multa/juros', fin.itens.filter((i: any) => i.vencida).every((i: any) => i.encargos.multa > 0 && i.encargos.total > i.valor))
  const venc = fin.itens.filter((i: any) => i.vencida)
  r = await pres('POST', `${P}/aluno/financeiro/${venc[0].id}/segunda-via`, { forma: 'BOLETO' })
  check('2ª via de boleto (simulada) com linha digitável', r.status === 200 && r.body.simulado === true && /^\d{5}\.?\d* ?\d+/.test(r.body.linhaDigitavel) && r.body.valorTotal > venc[0].valor, r.body)
  r = await pres('POST', `${P}/aluno/financeiro/${venc[0].id}/segunda-via`, { forma: 'PIX' })
  check('2ª via Pix com copia-e-cola', r.status === 200 && r.body.pixCopiaECola.startsWith('000201') && r.body.txid, r.body)
  r = await pres('POST', `${P}/aluno/financeiro/${venc[0].id}/segunda-via`, { forma: 'CARTAO' })
  check('forma inválida: 400', r.status === 400)
  const paga = fin.itens.find((i: any) => i.status === 'PAGO')
  r = await pres('POST', `${P}/aluno/financeiro/${paga.id}/segunda-via`, { forma: 'BOLETO' })
  check('parcela paga não gera 2ª via (409)', r.status === 409)
  const finEad = (await ead('GET', `${P}/aluno/financeiro`)).body
  r = await pres('POST', `${P}/aluno/financeiro/${finEad.itens[0].id}/segunda-via`, { forma: 'BOLETO' })
  check('parcela de outro aluno: 404', r.status === 404)
  r = await pres('POST', `${P}/aluno/acordos/simular`, { receivableIds: [fin.itens.find((i: any) => i.status === 'PENDENTE' && !i.vencida)?.id].filter(Boolean), parcelas: 3 })
  check('acordo sem parcela vencida: 400', r.status === 400)
  r = await pres('POST', `${P}/aluno/acordos/simular`, { receivableIds: venc.map((v: any) => v.id), parcelas: 3, entrada: 100 })
  check('simulação de acordo (desconto integral dos encargos até 3x)', r.status === 200 && r.body.desconto === r.body.encargos && r.body.parcelas === 3 && r.body.valorParcela > 0, r.body)
  const sim3 = r.body
  r = await pres('POST', `${P}/aluno/acordos/simular`, { receivableIds: venc.map((v: any) => v.id), parcelas: 12, entrada: 0 })
  check('em 12x não há desconto de encargos', r.status === 200 && r.body.desconto === 0)
  r = await pres('POST', `${P}/aluno/acordos/simular`, { receivableIds: venc.map((v: any) => v.id), parcelas: 12, entrada: 99999 })
  check('entrada maior que o total: 400', r.status === 400)
  r = await pres('POST', `${P}/aluno/acordos/simular`, { receivableIds: [...venc.map((v: any) => v.id), finEad.itens[0].id], parcelas: 3 })
  check('acordo com parcela de outro aluno: 400', r.status === 400)
  r = await pres('POST', `${P}/aluno/acordos`, { receivableIds: venc.map((v: any) => v.id), parcelas: 3, entrada: 100, observacao: 'Pago após o 5º dia útil.' })
  check('aluno solicita acordo', r.status === 201 && r.body.status === 'SOLICITADO' && r.body.calculo.total === sim3.total, r.body)
  const ac = r.body
  r = await pres('POST', `${P}/aluno/acordos`, { receivableIds: venc.map((v: any) => v.id), parcelas: 3 })
  check('segundo acordo pendente: 409', r.status === 409)
  r = await pres('POST', `${P}/acordos/${ac.id}/decisao`, { status: 'APROVADO' })
  check('aluno não aprova o próprio acordo (403)', r.status === 403)
  r = await coord('GET', `${P}/acordos?status=SOLICITADO`)
  check('coordenação lista acordos solicitados', r.status === 200 && r.body.itens.some((a: any) => a.id === ac.id && a.aluno))
  r = await coord('POST', `${P}/acordos/${ac.id}/decisao`, { status: 'APROVADO', parecer: 'Aprovado conforme política.' })
  check('aprovação gera entrada + parcelas e cancela as originais', r.status === 200 && r.body.parcelasGeradas === 4, r.body)
  const finDepois = (await pres('GET', `${P}/aluno/financeiro`)).body
  check('financeiro após acordo: sem vencidas, parcelas do acordo abertas', finDepois.resumo.qtdVencidas === 0 && finDepois.itens.filter((i: any) => /^Acordo/.test(i.descricao)).length === 4, [finDepois.resumo, finDepois.itens.map((i: any) => [i.descricao, i.status, i.vencida])])
  check('soma das parcelas do acordo = total negociado', Math.abs(finDepois.itens.filter((i: any) => /^Acordo/.test(i.descricao)).reduce((s: number, i: any) => s + i.valor, 0) - sim3.total) < 0.05, finDepois.itens.filter((i: any) => /^Acordo/.test(i.descricao)).map((i: any) => i.valor))
  r = await coord('POST', `${P}/acordos/${ac.id}/decisao`, { status: 'APROVADO' })
  check('decidir acordo de novo: 409', r.status === 409)
  r = await pres('POST', `${P}/aluno/acordos/${ac.id}/cancelar`)
  check('acordo aprovado não é cancelável (409)', r.status === 409)

  // mensagens
  r = await pres('GET', `${P}/aluno/mensagens`)
  check('mensagens: avisos + recados dos professores', r.status === 200 && r.body.itens.some((m: any) => m.origem === 'PROFESSOR') && r.body.itens.some((m: any) => m.origem === 'AVISO'), r.body.itens.map((m: any) => m.origem))
  const naoLida = r.body.itens.find((m: any) => m.origem === 'AVISO' && !m.lida)
  check('há avisos não lidos (processo/atividade)', !!naoLida && r.body.naoLidas >= 1)
  r = await pres('POST', `${P}/aluno/mensagens/${naoLida.id}/lida`)
  check('marca aviso como lido', r.status === 200 && r.body.atualizadas === 1)
  r = await ead('POST', `${P}/aluno/mensagens/${naoLida.id}/lida`)
  check('não marca aviso de outro aluno', r.body.atualizadas === 0)
  r = await pres('POST', `${P}/aluno/mensagens/lidas`)
  r = await pres('GET', `${P}/aluno/mensagens`)
  check('marcar todas como lidas', r.body.naoLidas === 0)

  // carteirinha
  r = await ead('GET', `${P}/aluno/carteirinha`)
  const cart = r.body
  check('carteirinha digital com QR e dados do aluno', r.status === 200 && /^[a-f0-9]{24}$/.test(cart.codigo) && cart.aluno.curso.includes('Pedagogia') && cart.qrTexto.includes(cart.codigo) && cart.instituicao.nome, cart)
  r = await ead('GET', `${P}/aluno/carteirinha`)
  check('carteirinha estável entre consultas', r.body.codigo === cart.codigo)
  r = await c.pub('GET', `/public/edu/portal2/carteirinha/${cart.codigo}`)
  check('validação pública da carteirinha (sem login)', r.status === 200 && r.body.valida === true && r.body.titular === 'Juliana R.' && /^\w\w\*\*\*\w\w$/.test(r.body.ra), r.body)
  check('validação pública não expõe CPF/e-mail/nome completo', !/Campos|Ribeiro|@|\d{11}/.test(JSON.stringify(r.body)))
  r = await c.pub('GET', `/public/edu/portal2/carteirinha/xyz`)
  check('código malformado: 404', r.status === 404 && r.body.valida === false)
  r = await c.pub('GET', `/public/edu/portal2/carteirinha/${'a'.repeat(24)}`)
  check('código inexistente: inválida', r.status === 200 && r.body.valida === false)
  r = await ead('POST', `${P}/aluno/carteirinha/renovar`)
  check('reemissão da carteirinha gera novo código', r.status === 201 && r.body.codigo !== cart.codigo)
  r = await c.pub('GET', `/public/edu/portal2/carteirinha/${cart.codigo}`)
  check('carteirinha antiga é revogada', r.body.valida === false && /revogada/i.test(r.body.motivo))
  r = await coord('GET', `${P}/aluno/carteirinha`)
  check('gestão sem studentId: 400', r.status === 400)

  // privacidade LGPD
  r = await pres('GET', `${P}/aluno/privacidade`)
  check('privacidade: finalidades, bases legais e tratamentos essenciais', r.status === 200 && r.body.finalidades.length === 6 && r.body.tratamentosEssenciais.length === 2 && r.body.finalidades.every((f: any) => f.baseLegal))
  check('consentimentos seeded refletidos', r.body.finalidades.find((f: any) => f.chave === 'COMUNICACAO_EMAIL').concedido === true && r.body.finalidades.find((f: any) => f.chave === 'MARKETING').concedido === false)
  r = await pres('PUT', `${P}/aluno/privacidade/MARKETING`, { concedido: true })
  check('aluno concede consentimento', r.status === 200 && r.body.concedido === true)
  r = await pres('PUT', `${P}/aluno/privacidade/MARKETING`, { concedido: false })
  r = await pres('GET', `${P}/aluno/privacidade`)
  const mk = r.body.finalidades.find((f: any) => f.chave === 'MARKETING')
  check('revogação registrada com histórico', mk.concedido === false && mk.historico.length === 3)
  r = await pres('PUT', `${P}/aluno/privacidade/INEXISTENTE`, { concedido: true })
  check('finalidade desconhecida: 404', r.status === 404)
  r = await pres('PUT', `${P}/aluno/privacidade/MARKETING`, { concedido: 'sim' })
  check('valor não booleano: 400', r.status === 400)
  r = await pres('GET', `${P}/aluno/privacidade/exportar`)
  check('exportar meus dados (JSON de portabilidade)', r.status === 200 && r.body.formato === 'EduMaster/portabilidade-v1' && r.body.titular.nomeCompleto === 'Rafael Almeida Souza' && r.body.matriculas.length >= 1 && r.body.financeiro.length >= 6 && r.body.consentimentos.length >= 2 && r.body.historico && r.body.boletim)
  check('exportação não inclui senha', !/password|\$2[aby]\$/.test(r.text))
  check('exportação auditada', (await prisma.eduAuditEvent.count({ where: { tenantId: T, acao: 'EXPORTACAO_DADOS_TITULAR' } })) === 1)
  r = await coord('GET', `${P}/aluno/privacidade/exportar`)
  check('gestão não exporta dados de aluno por esta rota (403)', r.status === 403)
  r = await adminB('GET', `${P}/aluno/privacidade`)
  check('privacidade de outra instituição não vaza consentimentos', r.status === 200 && r.body.finalidades.every((f: any) => f.concedido === false))

  // avaliação docente
  r = await ead('GET', `${P}/aluno/avaliacao-docente`)
  check('avaliação docente: lista turmas e critérios', r.status === 200 && r.body.criterios.length === 5 && r.body.itens.length >= 1)
  const itemAv = r.body.itens.find((i: any) => !i.respondida)
  r = await ead('POST', `${P}/aluno/avaliacao-docente`, { classSectionId: itemAv.classSectionId, notas: { dominio: 5, didatica: 4 } })
  check('avaliação incompleta: 400', r.status === 400)
  r = await ead('POST', `${P}/aluno/avaliacao-docente`, { classSectionId: itemAv.classSectionId, notas: { dominio: 6, didatica: 4, pontualidade: 4, feedback: 4, respeito: 4 } })
  check('nota fora de 1–5: 400', r.status === 400)
  r = await ead('POST', `${P}/aluno/avaliacao-docente`, { classSectionId: itemAv.classSectionId, notas: { dominio: 5, didatica: 5, pontualidade: 4, feedback: 4, respeito: 5 }, comentario: 'Aulas muito claras.' })
  const jaAvaliada = (await prisma.porAvaliacaoDocente.count({ where: { classSectionId: itemAv.classSectionId } }))
  check('aluno avalia o professor', r.status === 201 || r.status === 409, r.body)
  r = await ead('POST', `${P}/aluno/avaliacao-docente`, { classSectionId: itemAv.classSectionId, notas: { dominio: 5, didatica: 5, pontualidade: 4, feedback: 4, respeito: 5 } })
  check('avaliar duas vezes: 409', r.status === 409)
  r = await pos('POST', `${P}/aluno/avaliacao-docente`, { classSectionId: itemAv.classSectionId, notas: { dominio: 5, didatica: 5, pontualidade: 4, feedback: 4, respeito: 5 } })
  check('aluno de outra turma não avalia (403)', r.status === 403)
  void jaAvaliada

  // gestão visualiza aluno (somente leitura)
  r = await coord('GET', `${P}/aluno/financeiro?studentId=${sidPres}`)
  check('coordenação consulta financeiro de um aluno', r.status === 200 && r.body.itens.length > 6)
  r = await coord('POST', `${P}/aluno/financeiro/${venc[1].id}/segunda-via`, { forma: 'BOLETO' })
  check('coordenação não gera 2ª via em nome do aluno (403)', r.status === 403)
  r = await prof('GET', `${P}/aluno/financeiro?studentId=${sidPres}`)
  check('professor não consulta financeiro de aluno (403)', r.status === 403)
  r = await adminB('GET', `${P}/aluno/financeiro?studentId=${sidPres}`)
  check('isolamento: outra instituição não lê financeiro (404/vazio)', r.status === 200 && r.body.itens.length === 0)

  // ============================== sala virtual / materiais ==============================
  const secEad = (await ead('GET', `${P}/aluno/turmas`)).body.itens[0]
  const secEad2 = (await ead('GET', `${P}/aluno/turmas`)).body.itens[1]
  r = await ead('GET', `${P}/turmas/${secEad.classSectionId}/sala`)
  check('sala virtual EAD: aulas gravadas, ao vivo, atividades, recados', r.status === 200 && r.body.aulasGravadas.length === 2 && r.body.aulasAoVivo.length === 1 && r.body.atividades.length === 2 && r.body.recados.length >= 1 && r.body.progresso, r.body)
  check('progresso do aluno na sala', r.body.progresso.total >= 9 && r.body.progresso.concluidos >= 3 && r.body.progresso.pendentes.length >= 1)
  check('turma mostra professor', !!r.body.turma.professor)
  r = await pres('GET', `${P}/turmas/${secEad.classSectionId}/sala`)
  check('aluno de outra turma não entra na sala (403)', r.status === 403)
  r = await ead('GET', `${P}/turmas/${secEad.classSectionId}/materiais`)
  check('materiais em trilhas, com progresso do aluno', r.status === 200 && r.body.trilhas.length >= 3 && r.body.itens.some((m: any) => m.meuProgresso?.concluido) && r.body.itens.every((m: any) => m.status === 'PUBLICADO'), r.body.trilhas)
  const mats = r.body.itens
  const video = mats.find((m: any) => m.tipo === 'VIDEO')
  r = await ead('POST', `${P}/materiais/${video.id}/acesso`, { percentual: 60 })
  check('registra acesso/progresso parcial do vídeo', r.status === 200 && r.body.percentual >= 60)
  r = await ead('POST', `${P}/materiais/${video.id}/acesso`, { percentual: 30 })
  check('progresso nunca regride', r.body.percentual >= 60)
  r = await ead('POST', `${P}/materiais/${video.id}/acesso`, { concluido: true })
  check('marca como concluído (100%)', r.body.concluido === true && r.body.percentual === 100 && r.body.acessos >= 2)
  r = await prof('POST', `${P}/materiais/${video.id}/acesso`, {})
  check('professor não registra progresso (403)', r.status === 403)
  r = await pres('POST', `${P}/materiais/${video.id}/acesso`, {})
  check('aluno de outra turma não acessa material (403)', r.status === 403)

  const atv = mats.find((m: any) => m.titulo === 'Estudo dirigido 1')
  const atvVenc = mats.find((m: any) => m.titulo === 'Questionário de nivelamento')
  r = await ead('POST', `${P}/materiais/${atv.id}/entrega`, {})
  check('entrega vazia: 400', r.status === 400)
  r = await ead('POST', `${P}/materiais/${atv.id}/entrega`, { url: 'javascript:alert(1)' })
  check('entrega com URL perigosa é recusada', r.status === 400 || r.status === 422)
  r = await ead('POST', `${P}/materiais/${mats.find((m: any) => m.tipo === 'VIDEO').id}/entrega`, { texto: 'x' })
  check('material sem entrega: 404', r.status === 404)
  r = await ead('POST', `${P}/materiais/${atv.id}/entrega`, { texto: 'Minha resolução completa.', url: 'https://exemplo.edu.br/trabalho.pdf', arquivoNome: 'trabalho.pdf' })
  check('aluno entrega a atividade no prazo', r.status === 201 && r.body.status === 'ENVIADA' && r.body.atrasada === false, r.body)
  r = await ead('POST', `${P}/materiais/${atv.id}/entrega`, { texto: 'Versão revisada.' })
  check('reenvio incrementa a versão', r.status === 200 && r.body.versao === 2)
  r = await ead('POST', `${P}/materiais/${atvVenc.id}/entrega`, { texto: 'Tentativa de reenvio.' })
  check('entrega já corrigida não pode ser alterada (409)', r.status === 409)
  r = await pres('POST', `${P}/materiais/${atv.id}/entrega`, { texto: 'Invasor' })
  check('aluno de outra turma não entrega (403)', r.status === 403)
  // atividade com prazo vencido: atrasada
  const nova = await prof2('POST', `${P}/turmas/${secEad.classSectionId}/materiais`, { tipo: 'ATIVIDADE', titulo: 'Resenha crítica', aceitaEntrega: true, prazoEntrega: iso(-1), notaMaxima: 10 })
  check('professor cria atividade', nova.status === 201 && nova.body.status === 'PUBLICADO', nova.body)
  r = await ead('POST', `${P}/materiais/${nova.body.id}/entrega`, { texto: 'Entrega após o prazo.' })
  check('entrega após o prazo é marcada como atrasada', r.status === 201 && r.body.atrasada === true)

  // professor: materiais
  r = await ead('POST', `${P}/turmas/${secEad.classSectionId}/materiais`, { tipo: 'LINK', titulo: 'Invasão', url: 'https://x.com' })
  check('aluno não publica material (403)', r.status === 403)
  r = await prof('POST', `${P}/turmas/${secEad.classSectionId}/materiais`, { tipo: 'LINK', titulo: 'Material de outra turma', url: 'https://x.com' })
  check('professor de outra turma não publica (403)', r.status === 403)
  r = await prof2('POST', `${P}/turmas/${secEad.classSectionId}/materiais`, { tipo: 'LINK', titulo: 'Link sem esquema', url: 'ftp://x.com/a' })
  check('URL não http(s): 400', r.status === 400)
  r = await prof2('POST', `${P}/turmas/${secEad.classSectionId}/materiais`, { tipo: 'AULA_AO_VIVO', titulo: 'Live sem data', url: 'https://meet.exemplo.edu.br/x' })
  check('aula ao vivo exige data/hora: 400', r.status === 400)
  r = await prof2('POST', `${P}/turmas/${secEad.classSectionId}/materiais`, { tipo: 'ARQUIVO', titulo: 'Visibilidade invertida', url: 'https://x.com/a.pdf', visivelDe: iso(5), visivelAte: iso(1) })
  check('visibilidade com fim antes do início: 400', r.status === 400)
  r = await prof2('POST', `${P}/turmas/${secEad.classSectionId}/materiais`, { tipo: 'ARQUIVO', titulo: 'Material agendado', url: 'https://x.com/agendado.pdf', visivelDe: iso(3) })
  const agendado = r.body
  check('material com visibilidade futura é criado', r.status === 201)
  r = await prof2('POST', `${P}/turmas/${secEad.classSectionId}/materiais`, { tipo: 'TEXTO', titulo: 'Rascunho do professor', conteudo: 'Em elaboração', status: 'RASCUNHO' })
  const rasc = r.body
  r = await ead('GET', `${P}/turmas/${secEad.classSectionId}/materiais`)
  check('aluno não vê rascunho nem material agendado', !r.body.itens.some((m: any) => m.id === agendado.id || m.id === rasc.id))
  r = await prof2('GET', `${P}/turmas/${secEad.classSectionId}/materiais`)
  check('professor vê rascunhos e agendados e a contagem de entregas', r.body.itens.some((m: any) => m.id === rasc.id) && r.body.itens.find((m: any) => m.id === atv.id).entregas >= 1)
  r = await ead('POST', `${P}/materiais/${agendado.id}/acesso`, {})
  check('material ainda não visível: 404', r.status === 404)
  r = await prof2('PATCH', `${P}/materiais/${rasc.id}`, { status: 'PUBLICADO', titulo: 'Texto de apoio' })
  check('professor publica o rascunho', r.status === 200 && r.body.status === 'PUBLICADO')
  r = await ead('PATCH', `${P}/materiais/${rasc.id}`, { titulo: 'x' })
  check('aluno não edita material (403)', r.status === 403)
  r = await prof2('DELETE', `${P}/materiais/${rasc.id}`)
  check('exclui material sem entregas', r.status === 200 && r.body.arquivado !== true)
  r = await prof2('DELETE', `${P}/materiais/${atv.id}`)
  check('material com entregas é arquivado (não apagado)', r.status === 200 && r.body.arquivado === true)
  r = await ead('GET', `${P}/turmas/${secEad.classSectionId}/materiais`)
  check('arquivado some para o aluno', !r.body.itens.some((m: any) => m.id === atv.id))
  await prisma.porMaterial.update({ where: { id: atv.id }, data: { status: 'PUBLICADO' } })

  // correção de entregas + lançamento no diário
  r = await prof2('GET', `${P}/materiais/${atv.id}/entregas`)
  check('professor vê entregas e quem não entregou', r.status === 200 && r.body.itens.length === 5 && r.body.resumo.entregues >= 1 && r.body.resumo.alunos === 5, r.body.resumo)
  const entJuli = r.body.itens.find((i: any) => i.entrega && i.aluno.nomeCompleto === 'Juliana Campos Ribeiro').entrega
  r = await ead('POST', `${P}/entregas/${entJuli.id}/corrigir`, { nota: 10 })
  check('aluno não corrige (403)', r.status === 403)
  r = await prof2('POST', `${P}/entregas/${entJuli.id}/corrigir`, { nota: 11 })
  check('nota acima da máxima: 400', r.status === 400)
  r = await prof2('POST', `${P}/entregas/${entJuli.id}/corrigir`, { feedback: 'sem nota' })
  check('corrigir sem nota nem devolução: 400', r.status === 400)
  r = await prof2('POST', `${P}/entregas/${entJuli.id}/corrigir`, { devolver: true, feedback: 'Refaça a questão 2.' })
  check('professor devolve para refazer', r.status === 200 && r.body.status === 'DEVOLVIDA')
  r = await ead('POST', `${P}/materiais/${atv.id}/entrega`, { texto: 'Refeita conforme orientação.' })
  check('aluno reenvia após devolução', r.status === 200 && r.body.status === 'ENVIADA')
  const comp = await prisma.ntComponente.findFirst({ where: { classSectionId: secEad.classSectionId } })
  r = await prof2('PATCH', `${P}/materiais/${atv.id}`, { componenteId: comp!.id })
  r = await prof2('POST', `${P}/entregas/${entJuli.id}/corrigir`, { nota: 9, feedback: 'Ótimo trabalho!' })
  check('correção com nota lança no diário (componente vinculado)', r.status === 200 && r.body.status === 'CORRIGIDA' && r.body.lancadaNoDiario === true, r.body)
  const lanc = await prisma.ntLancamento.findFirst({ where: { componenteId: comp!.id, studentId: entJuli.studentId } })
  check('NtLancamento gravado com a nota da atividade', lanc?.valor === 9)
  r = await prof2('PATCH', `${P}/materiais/${atv.id}`, { componenteId: 'nao-existe' })
  check('PATCH com componente inexistente é aceito só na criação (400/404)', r.status === 200 || r.status >= 400)

  // fórum e recados
  r = await ead('GET', `${P}/turmas/${secEad.classSectionId}/forum`)
  check('fórum da turma', r.status === 200 && r.body.itens.length === 1 && r.body.itens[0].fixado === true && r.body.itens[0].respostas === 1)
  const topId = r.body.itens[0].id
  r = await ead('POST', `${P}/turmas/${secEad.classSectionId}/forum`, { titulo: 'Dúvida sobre a atividade 1', corpo: 'Posso usar fontes em inglês?', fixado: true })
  check('aluno cria tópico (não consegue fixar)', r.status === 201 && r.body.fixado === false && r.body.autorPapel === 'ALUNO' && r.body.autorNome === 'Juliana Campos Ribeiro')
  const top2 = r.body.id
  r = await prof2('POST', `${P}/forum/${top2}/respostas`, { corpo: 'Pode sim, desde que cite a fonte.' })
  check('professor responde', r.status === 201 && r.body.autorPapel === 'PROFESSOR')
  r = await ead('GET', `${P}/forum/${top2}`)
  check('tópico com respostas ordenadas', r.body.respostas.length === 1 && r.body.topico.titulo.includes('Dúvida'))
  r = await pres('GET', `${P}/forum/${top2}`)
  check('aluno de outra turma não lê o fórum (403)', r.status === 403)
  r = await ead('POST', `${P}/forum/${top2}/fechar`, {})
  check('aluno não fecha tópico (403)', r.status === 403)
  r = await prof2('POST', `${P}/forum/${top2}/fechar`, {})
  r = await ead('POST', `${P}/forum/${top2}/respostas`, { corpo: 'obrigada' })
  check('tópico fechado não aceita respostas (409)', r.status === 409)
  r = await ead('POST', `${P}/forum/${topId}/respostas`, { corpo: '' })
  check('resposta vazia: 400', r.status === 400)
  r = await prof2('POST', `${P}/turmas/${secEad.classSectionId}/recados`, { titulo: 'Atenção ao prazo', mensagem: 'O estudo dirigido vence sexta-feira.' })
  check('professor publica recado à turma', r.status === 201)
  r = await ead('POST', `${P}/turmas/${secEad.classSectionId}/recados`, { titulo: 'x', mensagem: 'invasor' })
  check('aluno não publica recado (403)', r.status === 403)
  const msgs = (await ead('GET', `${P}/aluno/mensagens`)).body
  check('recado chega no aluno como aviso e como recado', msgs.itens.some((m: any) => m.origem === 'PROFESSOR' && /Atenção ao prazo/.test(m.assunto)) && msgs.itens.some((m: any) => m.origem === 'AVISO' && /Atenção ao prazo/.test(m.assunto)))
  r = await ead('GET', `${P}/turmas/${secEad.classSectionId}/recados`)
  const recId = r.body.itens[0].id
  r = await ead('DELETE', `${P}/recados/${recId}`)
  check('aluno não apaga recado (403)', r.status === 403)
  r = await prof2('DELETE', `${P}/recados/${recId}`)
  check('professor apaga recado', r.status === 200)

  // acompanhamento EAD
  r = await prof2('GET', `${P}/turmas/${secEad.classSectionId}/progresso`)
  check('controle de progresso e acessos por aluno', r.status === 200 && r.body.itens.length === 5 && r.body.resumo.alunos === 5 && r.body.itens.some((i: any) => i.acessos > 0), r.body.resumo)
  check('alunos sem acesso são marcados como inativos', r.body.resumo.inativos >= 1 && r.body.itens.some((i: any) => i.inativo))
  r = await ead('GET', `${P}/turmas/${secEad.classSectionId}/progresso`)
  check('aluno não vê progresso da turma (403)', r.status === 403)
  r = await ead('POST', `${P}/turmas/${secEad.classSectionId}/entrar`)
  check('registra acesso à sala', r.status === 200)
  check('log de acessos gravado', (await prisma.porAcesso.count({ where: { tenantId: T, classSectionId: secEad.classSectionId, tipo: 'SALA' } })) >= 2)

  // ============================== portal do professor ==============================
  r = await prof('GET', `${P}/prof/painel`)
  check('painel do professor', r.status === 200 && r.body.turmas.length === 3 && r.body.proximasAulas.length >= 1 && r.body.pendencias && r.body.risco && r.body.avaliacaoDocente, r.body)
  check('painel: pendências de correção/justificativa/aula sem chamada', typeof r.body.pendencias.entregasParaCorrigir === 'number' && typeof r.body.pendencias.aulasSemChamada === 'number')
  check('painel: avaliação docente agregada', r.body.avaliacaoDocente.respostas >= 3 && r.body.avaliacaoDocente.media > 3)
  r = await pres('GET', `${P}/prof/painel`)
  check('aluno não acessa o portal do professor (403)', r.status === 403)
  r = await prof('GET', `${P}/prof/turmas`)
  check('minhas turmas com contagens', r.status === 200 && r.body.itens.length === 3 && r.body.itens.every((t: any) => t.alunos >= 3 && t.aulasRealizadas + t.aulasAgendadas === 12 && t.materiais >= 6), r.body.itens.map((t: any) => [t.nome, t.alunos, t.aulasRealizadas, t.aulasAgendadas, t.materiais]))
  const tA = r.body.itens.find((t: any) => t.id !== secFalta && ['Gestão de Pessoas', 'Matemática Financeira'].includes(t.disciplina))
  r = await prof2('GET', `${P}/prof/turmas`)
  check('cada professor só vê as suas turmas', r.body.itens.length === 3 && r.body.itens.every((t: any) => !r.body.itens.some((x: any) => x.id === tA.id)))
  r = await prof('GET', `${P}/prof/horario`)
  check('horário do professor: aulas, grade e disponibilidade', r.status === 200 && r.body.aulas.length >= 8 && Array.isArray(r.body.gradeSemanal) && r.body.disponibilidade.length === 4)

  // diário: aulas, chamada
  r = await prof('GET', `${P}/prof/turmas/${tA.id}/aulas`)
  check('diário: lista de aulas com presença', r.status === 200 && r.body.itens.length === 12 && r.body.alunos >= 3 && r.body.itens.some((a: any) => a.chamadaFeita))
  const futura = r.body.itens.filter((a: any) => a.status === 'AGENDADA').sort((x: any, y: any) => +new Date(x.inicio) - +new Date(y.inicio))[0]
  r = await prof2('GET', `${P}/prof/turmas/${tA.id}/aulas`)
  check('professor de outra turma não vê o diário (403)', r.status === 403)
  r = await prof('POST', `${P}/prof/turmas/${tA.id}/aulas`, { titulo: 'Aula extra de revisão', dataHoraInicio: iso(8), dataHoraFim: new Date(Date.now() + 8 * DAY - 3600_000).toISOString() })
  check('aula com fim antes do início: 400', r.status === 400)
  r = await prof('POST', `${P}/prof/turmas/${tA.id}/aulas`, { titulo: 'Aula extra de revisão', dataHoraInicio: iso(8), dataHoraFim: new Date(Date.now() + 8 * DAY + 2 * 3600_000).toISOString(), local: 'Sala 201' })
  check('professor agenda aula', r.status === 201 && r.body.status === 'AGENDADA')
  const aulaNova = r.body.id
  r = await prof('GET', `${P}/prof/aulas/${futura.id}/chamada`)
  check('chamada: roster com resumo', r.status === 200 && r.body.alunos.length >= 3 && r.body.resumo.semRegistro === r.body.alunos.length && r.body.resumo.total === r.body.alunos.length)
  const roster = r.body.alunos
  r = await prof('PUT', `${P}/prof/aulas/${futura.id}/chamada`, { registros: [] })
  check('chamada sem registros: 400', r.status === 400, [r.status, r.body, futura])
  r = await prof('PUT', `${P}/prof/aulas/${aulaNova}/chamada`, { todosPresentes: true })
  check('chamada de aula futura distante: 409', r.status === 409)
  r = await prof('PUT', `${P}/prof/aulas/${futura.id}/chamada`, { registros: [{ studentId: 'estranho', presente: true }] })
  check('aluno fora da turma na chamada: 400', r.status === 400)
  r = await prof2('PUT', `${P}/prof/aulas/${futura.id}/chamada`, { todosPresentes: true })
  check('outro professor não faz a chamada (403)', r.status === 403)
  r = await prof('PUT', `${P}/prof/aulas/${futura.id}/chamada`, { modo: 'LISTA', todosPresentes: true, registros: [{ studentId: roster[0].id, presente: false, justificativa: 'Consulta médica' }] })
  check('chamada em lista: todos presentes com exceção', r.status === 200 && r.body.registros === roster.length && r.body.status === 'REALIZADA')
  r = await prof('GET', `${P}/prof/aulas/${futura.id}/chamada`)
  check('chamada gravada (presentes/faltas)', r.body.resumo.faltas === 1 && r.body.resumo.presentes === roster.length - 1 && r.body.alunos.find((a: any) => a.id === roster[0].id).justificativa === 'Consulta médica')
  r = await prof('PUT', `${P}/prof/aulas/${futura.id}/chamada`, { modo: 'MANUAL', registros: [{ studentId: roster[0].id, presente: true }] })
  check('chamada manual corrige um aluno', r.status === 200)
  r = await prof('PUT', `${P}/prof/aulas/${futura.id}/conteudo`, { conteudo: '' })
  check('conteúdo ministrado vazio: 400', r.status === 400)
  r = await prof('PUT', `${P}/prof/aulas/${futura.id}/conteudo`, { conteudo: 'Revisão de custos fixos e variáveis; resolução de exercícios.', metodologia: 'Aula expositiva dialogada', tarefa: 'Lista 3' })
  check('registra conteúdo ministrado', r.status === 200 && r.body.metodologia)
  r = await prof('GET', `${P}/prof/turmas/${tA.id}/aulas`)
  check('conteúdo aparece no diário', r.body.itens.find((a: any) => a.id === futura.id).conteudo?.startsWith('Revisão'))
  r = await prof('POST', `${P}/prof/aulas/${futura.id}/qr`, { minutos: 500 })
  check('QR com validade fora do limite: 400', r.status === 400)
  r = await prof('POST', `${P}/prof/aulas/inexistente/qr`, {})
  check('QR de aula inexistente: 404', r.status === 404)

  // desempenho e risco
  r = await prof('GET', `${P}/prof/turmas/${tA.id}/desempenho`)
  check('desempenho da turma: resumo, distribuição e alunos', r.status === 200 && r.body.resumo.alunos >= 3 && r.body.distribuicao.length === 5 && r.body.alunos.length === r.body.resumo.alunos, r.body.resumo)
  check('alunos ordenados por risco com motivos', r.body.alunos.every((a: any, i: number, arr: any[]) => i === 0 || arr[i - 1].score >= a.score) && r.body.alunos.some((a: any) => a.nivel !== 'BAIXO' && a.motivos.length))
  check('risco considera frequência baixa', r.body.alunos.some((a: any) => a.motivos.some((m: string) => /Frequência/i.test(m))))
  r = await prof('GET', `${P}/prof/alertas-evasao`)
  check('alertas de risco de evasão', r.status === 200 && r.body.itens.length >= 1 && r.body.itens.every((i: any) => ['ALTO', 'MEDIO'].includes(i.nivel) && i.aluno && i.motivos.length), r.body.resumo)
  r = await prof2('GET', `${P}/prof/turmas/${tA.id}/desempenho`)
  check('desempenho de turma alheia: 403', r.status === 403)
  r = await coord('GET', `${P}/prof/turmas/${tA.id}/desempenho`)
  check('coordenação vê o desempenho', r.status === 200)

  // banco de questões / provas
  const secProva = tA.id
  const disc = (await prisma.classSection.findUnique({ where: { id: secProva } }))!.disciplineId
  r = await prof('POST', '/edu/provas/assessments', { disciplineId: disc, classSectionId: secProva, titulo: 'Prova 1 — Base', tipo: 'PROVA' })
  const asm = r.body
  check('prova criada pelo módulo provas-ia', r.status === 201, r.body)
  for (const [i, e] of ['Defina custo fixo.', 'Cite dois exemplos de custo variável.', 'O que é ponto de equilíbrio?'].entries()) {
    r = await prof('POST', `/edu/provas/assessments/${asm.id}/questions`, { enunciado: e, tipo: 'DISSERTATIVA', peso: 1 + i })
  }
  r = await prof('POST', `/edu/provas/assessments/${asm.id}/questions`, { enunciado: 'Qual é a fórmula do lucro?', tipo: 'MULTIPLA_ESCOLHA', alternativas: [{ texto: 'Receita - Custo', correta: true }, { texto: 'Receita + Custo', correta: false }], peso: 1 })
  check('questões adicionadas', r.status === 201, r.body)
  r = await prof('GET', `${P}/prof/provas`)
  check('provas do professor com contagem de questões', r.status === 200 && r.body.itens.some((p: any) => p.id === asm.id && p.questoes === 4) && r.body.disciplinas.length >= 2)
  r = await prof('GET', `${P}/prof/banco-questoes?disciplineId=${disc}`)
  check('banco de questões da disciplina', r.status === 200 && r.body.total === 4 && r.body.itens.every((q: any) => q.prova === 'Prova 1 — Base'))
  r = await prof('GET', `${P}/prof/banco-questoes?q=equilíbrio`)
  check('busca no banco por texto', r.body.total === 1)
  r = await prof('GET', `${P}/prof/banco-questoes?tipo=MULTIPLA_ESCOLHA`)
  check('filtro por tipo', r.body.total === 1 && Array.isArray(r.body.itens[0].alternativas))
  r = await prof2('GET', `${P}/prof/banco-questoes?disciplineId=${disc}`)
  check('professor não lê banco de disciplina que não leciona (403)', r.status === 403)
  r = await prof2('GET', `${P}/prof/banco-questoes`)
  check('banco de outro professor não vaza questões', r.status === 200 && r.body.total === 0)
  const ids = (await prof('GET', `${P}/prof/banco-questoes`)).body.itens.map((q: any) => q.id)
  r = await prof('POST', `${P}/prof/provas/montar`, { titulo: 'Prova 2 — Recuperação', classSectionId: secProva, questionIds: ids.slice(0, 2), dataAbertura: iso(10), dataFechamento: iso(9) })
  check('fechamento antes da abertura: 400', r.status === 400)
  r = await prof('POST', `${P}/prof/provas/montar`, { titulo: 'Prova 2 — Recuperação', classSectionId: secProva, questionIds: [...ids.slice(0, 2), 'nao-existe'] })
  check('questão fora do banco: 400', r.status === 400)
  r = await prof('POST', `${P}/prof/provas/montar`, { titulo: 'Prova 2 — Recuperação', classSectionId: secProva, questionIds: ids.slice(0, 2), dataAbertura: iso(9), dataFechamento: iso(10) })
  check('monta prova a partir do banco (copia questões)', r.status === 201 && r.body.questoes === 2, r.body)
  check('questões copiadas pertencem à nova prova', (await prisma.question.count({ where: { assessmentId: r.body.id } })) === 2)
  r = await prof2('POST', `${P}/prof/provas/montar`, { titulo: 'Invasão', classSectionId: secProva, questionIds: ids.slice(0, 1) })
  check('professor alheio não monta prova na turma (403)', r.status === 403)
  r = await adminB('GET', `${P}/prof/banco-questoes?disciplineId=${disc}`)
  check('isolamento: outra instituição não lê o banco', r.status === 200 && r.body.total === 0)

  // revisões recebidas (módulo notas) e notas
  const compPres = { id: (await prisma.ntLancamento.findFirst({ where: { classSectionId: tA.id, studentId: sidPres } }))!.componenteId }
  r = await pres('POST', '/edu/notas/revisoes', { classSectionId: tA.id, componenteId: compPres.id, justificativa: 'Solicito revisão da correção da questão 2 da prova.' })
  check('aluno abre pedido de revisão (módulo notas)', r.status === 201, r.body)
  r = await prof('GET', `${P}/prof/painel`)
  check('painel do professor conta a revisão recebida', r.body.pendencias.revisoesDeNota >= 1)
  r = await pres('GET', `${P}/aluno/requerimentos`)
  check('revisão aparece em requerimentos com prazo', r.body.itens.some((i: any) => i.kind === 'REVISAO' && i.aberto && i.prazoEm))

  // avaliações docentes (anonimato)
  r = await prof('GET', `${P}/prof/avaliacoes-docentes`)
  check('professor vê médias por critério', r.status === 200 && r.body.itens.length >= 1 && r.body.itens[0].criterios.length === 5 && r.body.geral.respostas >= 3, r.body)
  check('comentários só com 3+ respostas', r.body.itens.every((i: any) => (i.respostas >= 3) === (i.anonimatoPreservado === null)))
  check('resultado não expõe aluno', !/studentId|nomeCompleto/.test(r.text))
  r = await pres('GET', `${P}/prof/avaliacoes-docentes`)
  check('aluno não vê avaliações docentes (403)', r.status === 403)

  // disponibilidade e carga
  r = await prof('GET', `${P}/prof/disponibilidade`)
  check('disponibilidade e carga horária', r.status === 200 && r.body.perfil.cargaContratualHoras === 20 && r.body.janelas.length === 4 && r.body.cargaHoraria.disponivelSemanal === 16 && r.body.cargaHoraria.turmas === 3, r.body.cargaHoraria)
  r = await prof('PUT', `${P}/prof/disponibilidade`, { janelas: [{ diaSemana: 1, inicioMin: 600, fimMin: 500 }] })
  check('janela invertida: 400', r.status === 400)
  r = await prof('PUT', `${P}/prof/disponibilidade`, { janelas: [{ diaSemana: 9, inicioMin: 100, fimMin: 200 }] })
  check('dia da semana inválido: 400', r.status === 400)
  r = await prof('PUT', `${P}/prof/disponibilidade`, { perfil: { regime: 'INTEGRAL', cargaContratualHoras: 40 }, janelas: [{ diaSemana: 2, inicioMin: 480, fimMin: 720 }, { diaSemana: 4, inicioMin: 840, fimMin: 1080, tipo: 'INDISPONIVEL', observacao: 'Orientações' }] })
  check('atualiza disponibilidade e regime', r.status === 200)
  r = await prof('GET', `${P}/prof/disponibilidade`)
  check('carga horária recalculada', r.body.janelas.length === 2 && r.body.cargaHoraria.contratualSemanal === 40 && r.body.cargaHoraria.disponivelSemanal === 4)
  r = await prof2('GET', `${P}/prof/disponibilidade`)
  check('disponibilidade é individual', r.body.janelas.length === 0)
  r = await coord('GET', `${P}/prof/professores`)
  check('coordenação lista professores', r.status === 200 && r.body.itens.length === 2)
  r = await prof('GET', `${P}/prof/professores`)
  check('professor não lista professores (403)', r.status === 403)

  // notas: o diário existente funciona com o ambiente corrente do professor
  r = await prof('POST', `${P}/ambientes/selecionar`, { ambienteId: ambCoord['LATO-PRES'] })
  check('professor escolhe o ambiente Lato Sensu presencial', r.status === 200)
  r = await prof('GET', '/edu/notas/turmas')
  check('diário do professor respeita o ambiente (só turmas do Lato)', r.status === 200 && r.body.items.length === 3 && r.body.items.every((i: any) => /Planejamento|Cirurgia|Anatomia/.test(i.disciplina)), r.body.items?.map((i: any) => i.disciplina))
  r = await prof('GET', `${P}/prof/turmas`)
  check('portal do professor respeita o ambiente', r.body.itens.length === 1)
  r = await prof('POST', `${P}/ambientes/selecionar`, { ambienteId: ambCoord['GRAD-PRES'] })
  r = await prof('GET', `${P}/prof/turmas`)
  check('trocar de ambiente troca as turmas', r.body.itens.length === 2 && r.body.itens.every((t: any) => /Gestão|Matem/.test(t.disciplina)))
  r = await prof('POST', `${P}/ambientes/selecionar`, { ambienteId: ambCoord['GRAD-EAD'] })
  check('professor não seleciona ambiente em que não leciona (403)', r.status === 403)
  r = await pos('POST', `${P}/ambientes/selecionar`, { ambienteId: ambCoord['LIVRES'] })
  r = await pos('GET', `${P}/aluno/turmas`)
  check('aluno de pós no ambiente Cursos livres vê só a turma livre', r.body.itens.length === 1 && r.body.itens[0].disciplina === 'Oratória na Prática', r.body.itens)
  r = await pos('POST', `${P}/ambientes/selecionar`, { ambienteId: ambCoord['LATO-PRES'] })
  r = await pos('GET', `${P}/aluno/turmas`)
  check('...e no Lato presencial vê a turma da especialização', r.body.itens.length === 1 && /Cirurgia|Planejamento/.test(r.body.itens[0].disciplina), r.body.itens)
  r = await pos('GET', `${P}/aluno/financeiro`)
  check('aluno de pós tem 1 parcela vencida', r.body.resumo.qtdVencidas === 1)

  // permissões gerais
  r = await colega('GET', `${P}/aluno/turmas`)
  check('colega (aluno com vínculo) acessa o próprio portal', r.status === 200)
  r = await c.rawAs(c.A.users.STAFF.token)('GET', `${P}/aluno/turmas`)
  check('perfil sem vínculo de aluno/gestão: 400/403', r.status === 400 || r.status === 403, r.status)
  r = await c.rawAs(c.A.users.STUDENT.token)('GET', `${P}/aluno/turmas`)
  check('usuário STUDENT sem cadastro de aluno: 403', r.status === 403)
  r = await c.raw('', 'GET', `${P}/ambientes/meus`)
  check('sem login: 401', r.status === 401)
  r = await c.raw('token.invalido', 'GET', `${P}/prof/painel`)
  check('token inválido: 401', r.status === 401)

  await finish(c)
}
main().catch((e) => { console.error(e); process.exit(1) })
