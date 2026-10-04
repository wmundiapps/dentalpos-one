/**
 * Seed de demonstração do EduMaster Pro (usa a API REAL com token ADMIN; contas via Prisma).
 * Uso:  DATABASE_URL=... npx tsx scripts/edu-demo-seed.ts   (backend rodando em API_URL, padrão http://localhost:3000/api)
 * Etapas: SEED_STEPS=contas,bootstrap,marca,... (padrão: todas; "marca" envia a logomarca e deve ser a última se quiser ver o estado sem logo).
 * Login: admin@ravel.edu.br / Ravel@2026  ·  aluno: aluno@ravel.edu.br / Aluno@2026 (clinicId impresso ao final).
 */
import bcrypt from 'bcryptjs'
import { prisma } from '../src/lib/prisma'

const API = process.env.API_URL || 'http://localhost:3000/api'
const TENANT = 'ravel-ies'
export const ADMIN = { email: 'admin@ravel.edu.br', password: 'Ravel@2026' }
export const ALUNO = { email: 'aluno@ravel.edu.br', password: 'Aluno@2026' }

async function contas() {
  let clinic = await prisma.clinic.findFirst({ where: { tenantId: TENANT } })
  if (!clinic) {
    clinic = await prisma.clinic.create({
      data: { tenantId: TENANT, name: 'Instituto Ravel de Ensino Superior', displayName: 'Instituto Ravel de Ensino Superior', email: 'contato@ravel.edu.br', phone: '(11) 4002-8922', cnpj: '12.345.678/0001-90', plan: 'ENTERPRISE' } as any,
    })
  }
  const mk = async (email: string, password: string, firstName: string, lastName: string, role: string) => {
    const ex = await prisma.user.findFirst({ where: { clinicId: clinic!.id, email } })
    if (ex) return ex
    return prisma.user.create({ data: { clinicId: clinic!.id, tenantId: TENANT, email, password: await bcrypt.hash(password, 10), firstName, lastName, role, isActive: true } as any })
  }
  const admin = await mk(ADMIN.email, ADMIN.password, 'Helena', 'Ravel', 'ADMIN')
  return { clinic, admin, mk }
}

async function login(clinicId: string, cred: { email: string; password: string }) {
  const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clinicId, ...cred }) })
  const j: any = await r.json()
  if (!r.ok) throw new Error('login: ' + JSON.stringify(j))
  return j.token as string
}

type Ctx = {
  api: (m: string, p: string, b?: any) => Promise<any>
  tenantId: string
  clinicId: string
  mk: (email: string, password: string, firstName: string, lastName: string, role: string) => Promise<any>
  loginAs: (c: { email: string; password: string }) => Promise<string>
  failures: string[]
}

const MODULOS = ['admissoes', 'secretaria', 'calendario', 'notas', 'infraestrutura', 'suprimentos', 'regulatorio', 'governanca', 'desempenho', 'pesquisa', 'apoio', 'comunicacao', 'biblioteca', 'jornadas', 'modalidades', 'reitoria']

const ALUNO_EMAIL = 'aluno@ravel.edu.br'
const ALUNO_SENHA = 'Aluno@2026'

const STEPS: [string, (c: Ctx) => Promise<void>][] = [
  ['equipe', equipe],
  ['bootstrap', async (c) => { for (const m of MODULOS) await c.api('POST', `/edu/${m}/bootstrap`, {}) }],
  ['academico', academico], ['espacos', espacos], ['admissoes', admissoes],
]


// ----- utilidades de data -----
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString()
const ymd = (n: number) => day(n).slice(0, 10)
const pick = <T,>(a: T[], i: number) => a[i % a.length]

// Estado compartilhado entre etapas (ids criados). Etapas são idempotentes na medida do possível (rodar em banco limpo).
const S: Record<string, any> = {}

const NOMES = ['Ana Beatriz Lima', 'Bruno Carvalho', 'Camila Duarte', 'Diego Ferreira', 'Eduarda Gomes', 'Felipe Henrique', 'Gabriela Itaborai', 'Hugo Jardim', 'Isabela Klein', 'João Pedro Lacerda', 'Karina Moura', 'Leonardo Nunes', 'Mariana Oliveira', 'Nicolas Pereira', 'Olívia Queiroz', 'Paulo Ribeiro', 'Quéren Santos', 'Rafael Teixeira', 'Sofia Uchoa', 'Thiago Vasconcelos', 'Úrsula Werneck', 'Vinícius Xavier', 'Yasmin Zanetti', 'Arthur Bastos', 'Beatriz Cordeiro']

async function equipe(c: Ctx) {
  const defs: [string, string, string, string][] = [
    ['coord.odonto@ravel.edu.br', 'Marcos', 'Albuquerque', 'COORDINATOR'], ['secretaria@ravel.edu.br', 'Patrícia', 'Moreira', 'SECRETARY'],
    ['prof.anatomia@ravel.edu.br', 'Ricardo', 'Menezes', 'TEACHER'], ['prof.histologia@ravel.edu.br', 'Luciana', 'Prado', 'TEACHER'],
    ['prof.direito@ravel.edu.br', 'Fernando', 'Castro', 'TEACHER'], ['prof.civil@ravel.edu.br', 'Adriana', 'Tavares', 'TEACHER'],
    ['biblioteca@ravel.edu.br', 'Sônia', 'Barbosa', 'LIBRARIAN'], ['infra@ravel.edu.br', 'Jorge', 'Pacheco', 'FACILITIES'],
    ['admissoes@ravel.edu.br', 'Carla', 'Siqueira', 'ADMISSIONS'], ['apoio@ravel.edu.br', 'Teresa', 'Lopes', 'SUPPORT'],
  ]
  S.users = {}
  for (const [e, f, l, r] of defs) S.users[e.split('@')[0]] = await c.mk(e, 'Ravel@2026', f, l, r)
}

async function academico(c: Ctx) {
  const prisma = (await import('../src/lib/prisma')).prisma
  const u = S.users
  const campus = (await prisma.campus.findFirst({ where: { tenantId: c.tenantId } })) ?? (await prisma.campus.create({ data: { tenantId: c.tenantId, nome: 'Campus Central', endereco: 'Av. das Acácias, 1200', cidade: 'São Paulo', uf: 'SP' } }))
  S.campus = campus
  const odonto = await c.api('POST', '/edu/academico/programs', { nome: 'Odontologia', modalidade: 'PRESENCIAL', cargaHorariaTotal: 4200 })
  const direito = await c.api('POST', '/edu/academico/programs', { nome: 'Direito', modalidade: 'EAD', cargaHorariaTotal: 3700 })
  S.odonto = odonto; S.direito = direito
  const discOdonto: [string, number, number, string][] = [['Anatomia Humana', 80, 1, 'prof.anatomia'], ['Histologia e Embriologia', 60, 1, 'prof.histologia'], ['Bioquímica Oral', 60, 1, 'prof.histologia'], ['Dentística I', 80, 2, 'prof.anatomia']]
  const discDireito: [string, number, number, string][] = [['Introdução ao Direito', 60, 1, 'prof.direito'], ['Direito Civil I', 80, 1, 'prof.civil'], ['Teoria Geral do Estado', 60, 1, 'prof.direito']]
  const term = await c.api('POST', '/edu/academico/terms', { codigo: '2026/2', dataInicio: '2026-08-03', dataFim: '2026-12-18' })
  S.term = term
  S.secs = { odonto: [], direito: [] }
  for (const [prog, list, key] of [[odonto, discOdonto, 'odonto'], [direito, discDireito, 'direito']] as const) {
    for (const [nome, ch, per, prof] of list) {
      const d = await c.api('POST', '/edu/academico/disciplines', { nome, cargaHoraria: ch, ementa: `Ementa de ${nome}.` })
      await c.api('POST', '/edu/academico/curriculum-links', { programId: prog.id, disciplineId: d.id, periodo: per, obrigatoria: true })
      if (per === 1) {
        const sec = await c.api('POST', '/edu/academico/class-sections', { campusId: campus.id, disciplineId: d.id, termId: term.id, professorUserId: u[prof].id, nome: `${key === 'odonto' ? 'ODO' : 'DIR'}-${nome.split(' ')[0].slice(0, 3).toUpperCase()}-1A`, vagas: 40 })
        S.secs[key].push({ ...sec, disciplina: d })
      }
    }
  }
  // alunos
  S.students = []
  for (let i = 0; i < NOMES.length; i++) {
    const email = i === 0 ? ALUNO_EMAIL : `aluno${i + 1}@ravel.edu.br`
    const user = await c.mk(email, i === 0 ? ALUNO_SENHA : 'Aluno@2026', NOMES[i].split(' ')[0], NOMES[i].split(' ').slice(1).join(' '), 'STUDENT')
    const st = await c.api('POST', '/edu/academico/students', { userId: user.id, ra: `2026${String(1000 + i)}`, nomeCompleto: NOMES[i], cpf: `${String(111111111 + i * 7919).slice(0, 9)}${String(10 + i).slice(-2)}`, dataNascimento: `${2000 + (i % 6)}-0${1 + (i % 9)}-1${i % 9}` })
    if (!st) continue
    const odo = i < 15
    const prog = odo ? odonto : direito
    const en = await c.api('POST', '/edu/academico/enrollments', { studentId: st.id, programId: prog.id, termId: term.id })
    if (en) for (const sec of S.secs[odo ? 'odonto' : 'direito']) await c.api('POST', '/edu/academico/enrollments/class-sections', { enrollmentId: en.id, classSectionId: sec.id })
    S.students.push({ ...st, enrollmentId: en?.id, odo, userId: user.id })
  }
  // alguns alunos trancados / concluído (variedade)
  const { prisma: p2 } = await import('../src/lib/prisma')
  if (S.students[13]) await p2.student.update({ where: { id: S.students[13].id }, data: { status: 'TRANCADO' } })
  if (S.students[22]) await p2.student.update({ where: { id: S.students[22].id }, data: { status: 'DESISTENTE' } })
}

async function espacos(c: Ctx) {
  const tipos: [string, string, string, number, string][] = [
    ['A-101', 'Sala 101', 'SALA_AULA', 50, 'A'], ['A-102', 'Sala 102', 'SALA_AULA', 45, 'A'], ['A-201', 'Sala 201', 'SALA_AULA', 60, 'A'], ['B-101', 'Sala 301 (EaD Síncrona)', 'SALA_AULA', 80, 'B'],
    ['LAB-ANA', 'Laboratório de Anatomia', 'LABORATORIO', 30, 'C'], ['LAB-HIS', 'Laboratório de Histologia', 'LABORATORIO', 24, 'C'], ['CLI-1', 'Clínica-Escola de Odontologia', 'CLINICA_ESCOLA', 40, 'D'],
    ['AUD-1', 'Auditório Ravel', 'AUDITORIO', 220, 'E'], ['BIB-1', 'Biblioteca Central', 'BIBLIOTECA', 120, 'F'], ['PAT-1', 'Pátio de Convivência', 'PATIO', 300, 'G'], ['EST-1', 'Estacionamento Principal', 'ESTACIONAMENTO', 180, 'H'],
  ]
  S.spaces = []
  for (const [codigo, nome, tipo, capacidade, bloco] of tipos) {
    const r = await c.api('POST', '/edu/core/espacos', { campusId: S.campus.id, codigo, nome, tipo, capacidade, bloco, acessivel: true, recursos: tipo === 'LABORATORIO' ? ['Microscópios', 'Bancadas'] : ['Projetor', 'Ar-condicionado'] })
    if (r) S.spaces.push(r)
  }
}

function cpfValido(seed: number): string {
  const d: number[] = []
  let x = seed * 7919 + 123456789
  for (let i = 0; i < 9; i++) { d.push(x % 10); x = Math.floor(x / 10) + (i + 3) * 13 }
  const dv = (arr: number[]) => { const f = arr.length + 1; const sm = arr.reduce((a, n, i) => a + n * (f - i), 0); const r = (sm * 10) % 11; return r === 10 ? 0 : r }
  d.push(dv(d)); d.push(dv(d))
  return d.join('')
}

async function admissoes(c: Ctx) {
  const prisma = (await import('../src/lib/prisma')).prisma
  const proc = await c.api('POST', '/edu/admissoes/processos', {
    codigo: 'VEST-2027-1', nome: 'Vestibular 2027/1 — Graduação', tipo: 'VESTIBULAR_TRADICIONAL', termId: S.term.id,
    edital: 'Edital 01/2026', inscricaoInicio: day(-30), inscricaoFim: day(20), provaData: day(26), resultadoData: day(34), matriculaInicio: day(35), matriculaFim: day(50),
    taxaInscricao: 90, notaMinima: 40, listaEspera: true,
  })
  S.proc = proc
  const oOdo = await c.api('POST', '/edu/admissoes/ofertas', { processoId: proc.id, programId: S.odonto.id, nomeCurso: 'Odontologia', turno: 'INTEGRAL', modalidade: 'PRESENCIAL', campusId: S.campus.id, vagas: 60, valorMensalidade: 3890, parcelas: 12 })
  const oDir = await c.api('POST', '/edu/admissoes/ofertas', { processoId: proc.id, programId: S.direito.id, nomeCurso: 'Direito (EaD)', turno: 'FLEXIVEL', modalidade: 'EAD', poloNome: 'Polo Digital', vagas: 200, valorMensalidade: 689, parcelas: 12 })
  const oDirN = await c.api('POST', '/edu/admissoes/ofertas', { processoId: proc.id, nomeCurso: 'Direito', turno: 'NOTURNO', modalidade: 'PRESENCIAL', campusId: S.campus.id, vagas: 80, valorMensalidade: 1890, parcelas: 12 })
  await c.api('POST', `/edu/admissoes/processos/${proc.id}/abrir`, {})
  const camps = [
    ['Instagram Ads — Odonto', 'INSTAGRAM', 'ATIVA', 12000, [3500, 4200, 3100]], ['Google Search — Graduação', 'GOOGLE', 'ATIVA', 9000, [2800, 3300]],
    ['Feira de Profissões', 'EVENTO', 'ENCERRADA', 5000, [4800]], ['Indicação de Alunos', 'INDICACAO', 'ATIVA', 2000, [600]],
  ] as const
  S.camps = []
  for (const [nome, canal, status, orc, gastos] of camps) {
    const cp = await c.api('POST', '/edu/admissoes/campanhas', { nome, canal, status, nivel: 'GRADUACAO', processoId: proc.id, orcamento: orc, metaInscritos: 60, metaMatriculas: 20, inicio: day(-60), fim: day(30), utmSource: canal.toLowerCase() })
    if (!cp) continue
    S.camps.push(cp)
    for (const g of gastos) await c.api('POST', '/edu/admissoes/campanhas-gastos', { campanhaId: cp.id, valor: g, descricao: 'Investimento mensal', data: day(-20) })
  }
  const plano: [string, number][] = [] // [status, qtd]
  const dist = ['LEAD', 'LEAD', 'LEAD', 'LEAD', 'LEAD', 'LEAD', 'INSCRITO', 'INSCRITO', 'INSCRITO', 'INSCRITO', 'INSCRITO', 'INSCRITO', 'INSCRITO', 'PROVA', 'PROVA', 'PROVA', 'PROVA', 'PROVA', 'APROVADO', 'APROVADO', 'APROVADO', 'APROVADO', 'APROVADO', 'CONVOCADO', 'CONVOCADO', 'CONVOCADO', 'MATRICULADO', 'MATRICULADO', 'REPROVADO', 'DESISTENTE']
  const sobren = ['Almeida', 'Barros', 'Cavalcanti', 'Dantas', 'Esteves', 'Figueiredo', 'Guimarães', 'Holanda', 'Ibrahim', 'Junqueira', 'Krause', 'Leal']
  const nomes = ['Lucas', 'Julia', 'Pedro', 'Larissa', 'Mateus', 'Letícia', 'Gustavo', 'Amanda', 'Rodrigo', 'Natália', 'Vitor', 'Bianca', 'Caio', 'Fernanda', 'Henrique']
  const origens = ['INSTAGRAM', 'GOOGLE', 'INDICACAO', 'EVENTO', 'SITE', 'WHATSAPP']
  S.cands = []
  for (let i = 0; i < dist.length; i++) {
    const st = dist[i]
    const ofertaId = [oOdo, oDir, oDirN][i % 3]?.id
    const body: any = { nome: `${nomes[i % nomes.length]} ${sobren[(i * 5) % sobren.length]}`, email: `cand${i}@exemplo.com`, telefone: `(11) 9${String(8000 + i * 37).padStart(4, '0')}-${String(1000 + i * 13).slice(-4)}`, origem: pick(origens, i), campanhaId: S.camps[i % S.camps.length]?.id, consentimentoLgpd: true, consentimentoMarketing: i % 2 === 0 }
    if (st !== 'LEAD') { body.processoId = proc.id; body.ofertaId = ofertaId; body.cpf = cpfValido(i + 1) }
    const cand = await c.api('POST', '/edu/admissoes/candidatos', body)
    if (!cand) continue
    S.cands.push(cand)
    if (st === 'LEAD' && i % 2 === 0) await c.api('POST', `/edu/admissoes/candidatos/${cand.id}/interacoes`, { tipo: 'WHATSAPP', descricao: 'Primeiro contato: interessado em bolsa.', proximoContatoEm: day(1 + (i % 4)) })
    if (st === 'INSCRITO') continue
    if (['PROVA', 'APROVADO', 'CONVOCADO', 'MATRICULADO', 'REPROVADO'].includes(st)) {
      const nota = st === 'REPROVADO' ? 22 : 55 + ((i * 7) % 40)
      await c.api('POST', `/edu/admissoes/candidatos/${cand.id}/notas`, { notas: [{ componente: 'PROVA', nota }, { componente: 'REDACAO', nota: Math.min(100, nota + 5) }] })
    }
    if (['APROVADO', 'CONVOCADO', 'MATRICULADO'].includes(st)) await c.api('POST', `/edu/admissoes/candidatos/${cand.id}/status`, { status: 'APROVADO' })
    if (st === 'REPROVADO') await c.api('POST', `/edu/admissoes/candidatos/${cand.id}/status`, { status: 'REPROVADO' })
    if (st === 'DESISTENTE') await c.api('POST', `/edu/admissoes/candidatos/${cand.id}/status`, { status: 'DESISTENTE', motivo: 'Optou por outra instituição' })
    if (st === 'CONVOCADO' || st === 'MATRICULADO') await prisma.admCandidato.update({ where: { id: cand.id }, data: { status: st as any, etapaMaxima: st === 'CONVOCADO' ? 4 : 5 } })
  }
  void plano
}

async function main() {
  const { clinic, mk } = await contas()
  const token = await login(clinic.id, ADMIN)
  const failures: string[] = []
  const api = async (method: string, path: string, body?: any): Promise<any> => {
    const r = await fetch(`${API}${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body !== undefined ? JSON.stringify(body) : undefined })
    const t = await r.text()
    let j: any = null
    try { j = JSON.parse(t) } catch { /* texto */ }
    if (!r.ok) { failures.push(`${method} ${path} -> ${r.status} ${t.slice(0, 160)}`); return null }
    return j
  }
  const steps = (process.env.SEED_STEPS || '').split(',').filter(Boolean)
  const ctx: Ctx = { api, tenantId: TENANT, clinicId: clinic.id, mk, loginAs: (c) => login(clinic.id, c), failures }
  for (const [name, fn] of STEPS) {
    if (steps.length && !steps.includes(name)) continue
    console.log('>> etapa', name)
    await fn(ctx)
  }
  console.log(`\nclinicId=${clinic.id}\nadmin=${ADMIN.email} / ${ADMIN.password}\naluno=${ALUNO.email} / ${ALUNO.password}`)
  if (failures.length) { console.log(`\n${failures.length} chamadas falharam:`); failures.forEach((f) => console.log(' -', f)) }
  await prisma.$disconnect()
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
