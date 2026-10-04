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
  ['academico', academico], ['espacos', espacos], ['admissoes', admissoes], ['financeiro', financeiro], ['secretaria', secretaria], ['calendario', calendario], ['notas', notas], ['infraestrutura', infraestrutura], ['suprimentos', suprimentos],
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

async function financeiro(c: Ctx) {
  // mensalidades: 1ª parcela já paga, algumas vencidas, outras a vencer
  let k = 0
  for (const st of S.students) {
    if (!st.enrollmentId) continue
    k++
    const valor = st.odo ? 3890 : 689
    const gerou = await c.api('POST', '/edu/financeiro/receivables/generate-mensalidades', { studentId: st.id, enrollmentId: st.enrollmentId, valorParcela: valor, quantidadeParcelas: 5, diaVencimento: 10, primeiroVencimento: ymd(-55), descricaoBase: 'Mensalidade 2026/2' })
    const lista = await c.api('GET', `/edu/financeiro/receivables?studentId=${st.id}&pageSize=50`)
    const itens: any[] = Array.isArray(lista) ? lista : lista?.items ?? []
    // a maioria paga as 2 primeiras; alguns inadimplentes (nenhuma paga)
    const pagar = k % 4 === 0 ? 0 : k % 3 === 0 ? 1 : 2
    itens.sort((a, b) => +new Date(a.dataVencimento) - +new Date(b.dataVencimento))
    for (const r of itens.slice(0, pagar)) await c.api('POST', `/edu/financeiro/receivables/${r.id}/receive`, { formaPagamento: pick(['PIX', 'BOLETO', 'CARTAO'], k) })
    void gerou
  }
  const pagar: [string, string, number, number][] = [
    ['Folha de pagamento — docentes', 'Recursos Humanos', 184000, 5], ['Energia elétrica — Campus Central', 'Concessionária', 21800, 8], ['Material de laboratório (resinas e brocas)', 'DentalSupply Ltda', 12750, -6],
    ['Licenças de software acadêmico', 'EduTech S.A.', 9400, 12], ['Manutenção do ar-condicionado', 'ClimaFrio', 4300, -2], ['Serviço de limpeza', 'LimpaMais', 16200, 3],
  ]
  for (const [descricao, fornecedor, valor, venc] of pagar) await c.api('POST', '/edu/financeiro/payables', { descricao, fornecedor, categoria: 'Operacional', valor, dataVencimento: day(venc) })
}

async function secretaria(c: Ctx) {
  const tipos = await c.api('GET', '/edu/secretaria/tipos?pageSize=100')
  const lista: any[] = Array.isArray(tipos) ? tipos : tipos?.items ?? []
  const tp = (cod: string) => lista.find((t) => t.codigo === cod) ?? lista[0]
  const cods = ['DECLARACAO_MATRICULA', 'HISTORICO_ESCOLAR', 'TRANCAMENTO', 'SEGUNDA_VIA_CARTEIRINHA', 'ATUALIZACAO_CADASTRAL', 'OUTROS']
  const alvo: [number, string, string | null, string?][] = [
    [0, 'DECLARACAO_MATRICULA', null], [1, 'HISTORICO_ESCOLAR', 'EM_ANALISE'], [2, 'TRANCAMENTO', 'PENDENTE_DOCUMENTO', 'Falta comprovante de residência'], [3, 'DECLARACAO_MATRICULA', 'DEFERIDO'],
    [4, 'SEGUNDA_VIA_CARTEIRINHA', 'EM_ANALISE'], [5, 'ATUALIZACAO_CADASTRAL', null], [6, 'HISTORICO_ESCOLAR', 'INDEFERIDO', 'Documentação incompleta no prazo'], [7, 'OUTROS', 'EM_ANALISE'], [8, 'DECLARACAO_MATRICULA', null], [9, 'TRANCAMENTO', 'EM_ANALISE'],
  ]
  void cods
  for (const [i, cod, para, parecer] of alvo) {
    const st = S.students[i + 1]
    if (!st) continue
    const dados: any = {}
    const t = tp(cod)
    for (const e of t?.camposExtras ?? []) if (e.obrigatorio) dados[e.chave] = 'Estágio / comprovação'
    const pr = await c.api('POST', '/edu/secretaria/protocolos', { tipoId: t.id, studentId: st.id, dados, anexos: t?.exigeAnexo ? [{ nome: 'comprovante.pdf', url: 'https://exemplo.com/comprovante.pdf' }] : undefined })
    if (pr && para) {
      await c.api('POST', `/edu/secretaria/protocolos/${pr.id}/status`, { para: 'EM_ANALISE' })
      if (para !== 'EM_ANALISE') await c.api('POST', `/edu/secretaria/protocolos/${pr.id}/status`, { para, parecer })
    }
  }
  // certificados
  const modelos = await c.api('GET', '/edu/secretaria/cert-modelos?pageSize=50')
  const ml: any[] = Array.isArray(modelos) ? modelos : modelos?.items ?? []
  if (ml[0]) {
    for (let i = 0; i < 4; i++) await c.api('POST', '/edu/secretaria/certificados', { modeloId: ml[0].id, studentId: S.students[i]?.id, tituloEvento: 'Semana Acadêmica de Odontologia 2026', cargaHoraria: 20, periodo: '15 a 19/09/2026' })
    await c.api('POST', '/edu/secretaria/certificados/lote', { modeloId: ml[Math.min(1, ml.length - 1)].id, nomeLote: 'Palestrantes — Congresso Ravel', tituloEvento: 'Congresso Ravel de Saúde e Direito', cargaHoraria: 12, destinatarios: [{ nome: 'Dra. Cecília Fontes', cpf: cpfValido(901) }, { nome: 'Prof. Armando Vilela', cpf: cpfValido(902) }, { nome: 'Dr. Túlio Brandão', cpf: cpfValido(903) }] })
  }
}

async function calendario(c: Ctx) {
  const T = S.term.id
  await c.api('POST', `/edu/calendario/periodos/${T}/gerar-calendario`, {})
  await c.api('POST', '/edu/calendario/eventos', { tipo: 'REUNIAO', titulo: 'Reunião do Colegiado de Odontologia', inicio: day(3).slice(0, 10) + 'T14:00:00-03:00', fim: day(3).slice(0, 10) + 'T16:00:00-03:00', diaInteiro: false, publico: 'PROFESSORES' })
  await c.api('POST', '/edu/calendario/eventos', { tipo: 'AULA_INAUGURAL', titulo: 'Aula inaugural — calouros 2027/1', inicio: day(40).slice(0, 10) + 'T19:00:00-03:00', fim: day(40).slice(0, 10) + 'T21:00:00-03:00', diaInteiro: false })
  await c.api('POST', '/edu/calendario/eventos', { tipo: 'REUNIAO', titulo: 'Plantão pedagógico semanal', inicio: day(1).slice(0, 10) + 'T10:00:00-03:00', fim: day(1).slice(0, 10) + 'T11:00:00-03:00', diaInteiro: false, recorrencia: 'SEMANAL', recorrenciaAte: day(70) })
  // configuração para o gerador
  const grupos: [any[], any, number, string, string][] = [[S.secs.odonto, S.odonto, 1, 'MANHA', 'ODO-1-M'], [S.secs.direito, S.direito, 1, 'NOITE', 'DIR-1-N']]
  for (const [secs, prog, per, turno, grupo] of grupos) {
    for (const sec of secs) {
      await c.api('PUT', `/edu/calendario/config/turmas/${sec.id}`, { programId: prog.id, periodo: per, turno, grupo, alunosEstimados: 15 })
      const pratica = /Anatomia|Histologia/.test(sec.disciplina.nome)
      await c.api('PUT', `/edu/calendario/config/disciplinas/${sec.disciplina.id}`, { aulasSemana: 2, pratica, ...(pratica ? { tiposEspaco: ['LABORATORIO'] } : {}) })
    }
  }
  for (const u of ['prof.anatomia', 'prof.histologia', 'prof.direito', 'prof.civil']) {
    await c.api('PUT', `/edu/calendario/professores/${S.users[u].id}/disponibilidade`, { itens: [1, 2, 3, 4, 5].map((d) => ({ diaSemana: d, inicioMin: 420, fimMin: 1320, tipo: 'DISPONIVEL' })), perfil: { maxAulasDia: 4 } })
  }
  const sim = await c.api('POST', '/edu/calendario/gerador/simular', { termId: T })
  if (sim?.execucaoId) await c.api('POST', '/edu/calendario/gerador/aplicar', { execucaoId: sim.execucaoId })
  // provas
  const prova = (sec: any, dias: number, h: string, h2: string, tipo = 'PROVA_1') => c.api('POST', '/edu/calendario/provas', { classSectionId: sec.id, tipo, inicio: `${ymd(dias)}T${h}:00-03:00`, fim: `${ymd(dias)}T${h2}:00-03:00`, spaceId: S.spaces[2]?.id })
  await prova(S.secs.odonto[0], 9, '08:00', '10:00')
  await prova(S.secs.odonto[1], 10, '08:00', '10:00')
  await prova(S.secs.direito[0], 11, '19:30', '21:30')
}

async function notas(c: Ctx) {
  const all = [...S.secs.odonto.map((x: any) => ({ ...x, g: 'odo' })), ...S.secs.direito.map((x: any) => ({ ...x, g: 'dir' }))]
  let seed = 3
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 }
  for (const sec of all) {
    const ap = await c.api('POST', `/edu/notas/turmas/${sec.id}/componentes/aplicar-regra`, {})
    const comps: any[] = ap?.componentes ?? []
    const alunos = S.students.filter((x: any) => x.odo === (sec.g === 'odo') && x.enrollmentId)
    for (const comp of comps.slice(0, 3)) {
      const lote = alunos.map((a: any, i: number) => ({ studentId: a.id, codigo: comp.codigo, valor: Math.round((3.5 + rnd() * 6.5 + (i % 5 === 0 ? -1.5 : 0)) * 10) / 10 })).map((n: any) => ({ ...n, valor: Math.max(0, Math.min(10, n.valor)) }))
      const r = await c.api('PUT', `/edu/notas/turmas/${sec.id}/notas`, { notas: lote })
      if (!r) await c.api('POST', `/edu/notas/turmas/${sec.id}/notas/corrigir`, { correcoes: lote, motivo: 'Lançamento inicial da demonstração' })
    }
    await c.api('POST', `/edu/notas/turmas/${sec.id}/recalcular`, {})
  }
}

const lst = (r: any): any[] => (Array.isArray(r) ? r : r?.items ?? [])

async function infraestrutura(c: Ctx) {
  const I = '/edu/infraestrutura'
  const cats = lst(await c.api('GET', `${I}/categorias-bem?pageSize=100`))
  const cat = (cod: string) => cats.find((x) => x.codigo === cod) ?? cats[0]
  const sp = (i: number) => S.spaces[i % S.spaces.length]
  const bens: [string, string, number, number, number, string?][] = [
    ['Notebook Dell Latitude (laboratório de informática)', 'COMPUTADOR', 6200, -500, 1], ['Projetor Epson PowerLite', 'COMPUTADOR', 3400, -900, 2], ['Ar-condicionado Split 24.000 BTU', 'AR-COND', 5800, -1200, 0],
    ['Microscópio binocular Olympus', 'COMPUTADOR', 8900, -700, 5], ['Cadeira odontológica Dabi Atlante', 'COMPUTADOR', 26500, -300, 6], ['Ar-condicionado Split 18.000 BTU', 'AR-COND', 4200, -1500, 3],
    ['Autoclave 75 L', 'COMPUTADOR', 14500, -800, 6], ['Notebook Lenovo ThinkPad (secretaria)', 'COMPUTADOR', 5400, -200, 8],
  ]
  S.bens = []
  for (const [descricao, c1, valor, dias, sala] of bens) {
    const b = await c.api('POST', `${I}/bens`, { descricao, categoriaId: cat(c1).id, valorAquisicao: valor, dataAquisicao: day(dias), spaceId: sp(sala).id, garantiaAte: day(dias + 730) })
    if (b) S.bens.push(b)
  }
  if (S.bens[2]) await c.api('POST', `${I}/bens/${S.bens[2].id}/estado`, { estado: 'RUIM', motivo: 'Compressor com ruído excessivo' })
  if (S.bens[1]) await c.api('POST', `${I}/bens/${S.bens[1].id}/transferir`, { spaceId: sp(7).id, motivo: 'Uso no auditório' })
  // ordens de serviço em estágios diferentes
  const os: [string, string, string | null][] = [['Conserto do compressor — Sala 101', 'ALTA', null], ['Preventiva anual de ar-condicionado', 'MEDIA', 'EM_EXECUCAO'], ['Troca de lâmpadas — corredor bloco A', 'BAIXA', 'CONCLUIDA'], ['Calibração dos microscópios', 'MEDIA', 'EM_EXECUCAO']]
  for (const [titulo, prioridade, fim] of os) {
    const o = await c.api('POST', `${I}/ordens-servico`, { titulo, prioridade, bemId: S.bens[2]?.id, spaceId: sp(0).id })
    if (!o || !fim) continue
    await c.api('POST', `${I}/ordens-servico/${o.id}/status`, { status: 'EM_EXECUCAO' })
    if (fim === 'CONCLUIDA') await c.api('POST', `${I}/ordens-servico/${o.id}/status`, { status: 'CONCLUIDA', solucao: 'Lâmpadas LED instaladas e testadas.', custoMaoObra: 180 })
  }
  for (const [t, cat2, pr] of [['Ar-condicionado pingando na Sala 102', 'AR_CONDICIONADO', 'ALTA'], ['Projetor sem imagem no Auditório', 'EQUIPAMENTO', 'MEDIA'], ['Torneira vazando no banheiro do bloco B', 'HIDRAULICA', 'BAIXA']]) {
    await c.api('POST', `${I}/chamados`, { titulo: t, categoria: cat2, prioridade: pr, spaceId: sp(1).id, descricao: 'Reportado pela comunidade acadêmica.' })
  }
  await c.api('POST', `${I}/planos-preventivos`, { titulo: 'Preventiva dos notebooks', categoriaId: cat('COMPUTADOR').id, periodicidadeDias: 90, antecedenciaDias: 10, proximaExecucao: day(5), checklist: [{ item: 'Limpeza interna', obrigatorio: true }] })
  await c.api('POST', `${I}/planos-preventivos`, { titulo: 'Preventiva de ar-condicionado', categoriaId: cat('AR-COND').id, periodicidadeDias: 60, antecedenciaDias: 7, proximaExecucao: day(-3), checklist: [{ item: 'Limpar filtros', obrigatorio: true }] })
  await c.api('POST', `${I}/projetos`, { titulo: 'Troca da iluminação por LED', oQue: 'Substituir 480 lâmpadas fluorescentes por LED', porQue: 'Reduzir 38% do consumo de energia', quantoCusta: 48000, fimPrevisto: day(75), onde: 'Blocos A, B e C' })
  await c.api('POST', `${I}/projetos`, { titulo: 'Novo laboratório de Anatomia Virtual', oQue: 'Implantar mesa de anatomia 3D', porQue: 'Requisito de adequação do curso de Odontologia', quantoCusta: 180000, fimPrevisto: day(150) })
  const area = await c.api('POST', `${I}/estacionamento/areas`, { nome: 'Estacionamento Principal' })
  if (area) {
    await c.api('POST', `${I}/estacionamento/areas/${area.id}/vagas-lote`, { prefixo: 'A', quantidade: 12 })
    await c.api('POST', `${I}/estacionamento/vagas`, { areaId: area.id, codigo: 'PCD1', tipo: 'PCD' })
  }
  for (const [i, nome] of ['Quadra 1', 'Corredor A', 'Pátio'].entries()) {
    const pt = await c.api('POST', `${I}/iluminacao/pontos`, { codigo: `L-00${i + 1}`, spaceId: sp(9).id, potenciaW: 18, quantidade: 6 + i * 4, descricao: nome })
    void pt
  }
  const med = await c.api('POST', `${I}/medidores`, { codigo: 'M-ENERGIA', tipo: 'ENERGIA', spaceId: sp(0).id })
  if (med) for (let m = 6; m >= 0; m--) await c.api('POST', `${I}/medidores/${med.id}/leituras`, { dataLeitura: day(-30 * m), valor: 12000 + (6 - m) * 950 + (m % 2) * 300 })
}

async function suprimentos(c: Ctx) {
  const prisma = (await import('../src/lib/prisma')).prisma
  const R = '/edu/suprimentos'
  const itens = lst(await c.api('GET', `${R}/itens?pageSize=100`))
  const alms = lst(await c.api('GET', `${R}/almoxarifados`))
  const alm = alms.find((a) => a.codigo === 'CENTRAL') ?? alms[0]
  const cc = (await prisma.eduCostCenter.findFirst({ where: { tenantId: c.tenantId } })) ?? (await prisma.eduCostCenter.create({ data: { tenantId: c.tenantId, nome: 'Curso de Odontologia' } }))
  const forn: any[] = []
  for (const [i, n] of ['DentalSupply Ltda', 'PapelaMax Papelaria', 'TonerTech Informática', 'LabQuímica Reagentes'].entries()) {
    const f = await c.api('POST', `${R}/fornecedores`, { razaoSocial: n, cnpj: ['11.222.333/0001-81', '45.997.418/0001-53', '33.000.167/0001-01', '60.746.948/0001-12'][i], prazoPagamentoDias: 30 })
    if (f) forn.push(f)
  }
  if (forn[0]) await c.api('POST', `${R}/fornecedores/avaliacoes`, { fornecedorId: forn[0].id, notaPrazo: 5, notaQualidade: 4, notaPreco: 4 })
  // estoque: alguns itens fartos, outros no limite
  itens.slice(0, 8).forEach(() => {})
  let n = 0
  for (const it of itens) {
    n++
    if (!alm || n > 9) break
    const qtd = n % 3 === 0 ? 2 : 40 + n * 10
    const body: any = { tipo: 'ENTRADA', itemId: it.id, almoxarifadoId: alm.id, quantidade: qtd, custoUnitario: 12 + n }
    if (it.controlaLote) { body.loteNumero = `L${n}`; body.validade = day(60 + n * 20) }
    await c.api('POST', `${R}/estoque/movimentacoes`, body)
  }
  const reqItens = itens.slice(0, 3).map((it, i) => ({ itemId: it.id, quantidade: 10 + i * 5 }))
  for (let i = 0; i < 3; i++) {
    const rq = await c.api('POST', `${R}/requisicoes`, { centroCustoId: cc.id, justificativa: ['Reposição mensal do laboratório', 'Material para a semana acadêmica', 'Insumos da clínica-escola'][i], itens: reqItens })
    if (rq && i < 2) await c.api('POST', `${R}/requisicoes/${rq.id}/enviar`, {})
    if (rq && i === 1) await c.api('POST', `${R}/requisicoes/${rq.id}/decidir`, { decisao: 'APROVADO' })
  }
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
    try { await fn(ctx) } catch (e: any) { failures.push(`ETAPA ${name}: ${e?.stack?.split('\n').slice(0, 3).join(' | ')}`) }
  }
  console.log(`\nclinicId=${clinic.id}\nadmin=${ADMIN.email} / ${ADMIN.password}\naluno=${ALUNO.email} / ${ALUNO.password}`)
  if (failures.length) { console.log(`\n${failures.length} chamadas falharam:`); failures.forEach((f) => console.log(' -', f)) }
  await prisma.$disconnect()
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
