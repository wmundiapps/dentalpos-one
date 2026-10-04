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
  ['academico', academico], ['espacos', espacos], ['admissoes', admissoes], ['financeiro', financeiro], ['secretaria', secretaria], ['calendario', calendario], ['notas', notas], ['infraestrutura', infraestrutura], ['suprimentos', suprimentos], ['regulatorio', regulatorio], ['governanca', governanca], ['biblioteca', biblioteca], ['apoio', apoio], ['comunicacao', comunicacao], ['modalidades', modalidades], ['pesquisa', pesquisa], ['desempenho', desempenho], ['jornadas', jornadas], ['reitoria', reitoria], ['mesa', mesa], ['marca', marca],
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
  for (const [t, cat2, pr] of [['Ar-condicionado pingando na Sala 102', 'AR_CONDICIONADO', 'ALTA'], ['Projetor sem imagem no Auditório', 'TI', 'MEDIA'], ['Torneira vazando no banheiro do bloco B', 'HIDRAULICA', 'BAIXA']]) {
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
  }
}

async function regulatorio(c: Ctx) {
  const R = '/edu/regulatorio'
  const atos: [string, string, string, string | null, number | null, string, number][] = [
    ['PORTARIA_RECREDENCIAMENTO', 'Portaria MEC nº 412/2023', 'INSTITUICAO', null, 3, 'Recredenciamento da IES (EaD e presencial)', 4],
    ['PORTARIA_RECONHECIMENTO', 'Portaria MEC nº 188/2022', 'CURSO', 'Odontologia', 4, 'Reconhecimento do curso de Odontologia', 4],
    ['PORTARIA_AUTORIZACAO', 'Portaria SERES nº 77/2021', 'CURSO', 'Direito (EaD)', 5, 'Autorização do curso de Direito EaD', 3],
    ['PORTARIA_RENOVACAO', 'Portaria SERES nº 301/2020', 'CURSO', 'Administração', 3, 'Renovação de reconhecimento — Administração', 4],
  ]
  const venc = [1180, 150, 24, -12]
  for (const [i, [tipo, numero, escopo, curso, conceito, obs, ciclo]] of atos.entries()) {
    await c.api('POST', `${R}/atos`, { tipo, numero, orgao: 'MEC', dataPublicacao: day(venc[i] - ciclo * 365), vigenciaInicio: day(venc[i] - ciclo * 365), vencimento: day(venc[i]), escopo, cursoNome: curso, conceito, cicloAvaliativoAnos: ciclo, observacoes: obs })
  }
  const pRec = await c.api('POST', `${R}/processos`, { tipo: 'RECONHECIMENTO_CURSO', titulo: 'Reconhecimento — Direito EaD', programId: S.direito.id, prazoProtocolo: day(18), vagasSolicitadas: 200 })
  const pRen = await c.api('POST', `${R}/processos`, { tipo: 'RENOVACAO_RECONHECIMENTO', titulo: 'Renovação de reconhecimento — Odontologia', programId: S.odonto.id, prazoProtocolo: day(60) })
  const pAdit = await c.api('POST', `${R}/processos`, { tipo: 'ADITAMENTO_VAGAS', titulo: 'Aditamento de vagas — Odontologia (60 → 80)', programId: S.odonto.id, vagasSolicitadas: 80, prazoProtocolo: day(-4) })
  const pAut = await c.api('POST', `${R}/processos`, { tipo: 'AUTORIZACAO_CURSO', titulo: 'Autorização — Medicina Veterinária', cursoNome: 'Medicina Veterinária', prazoProtocolo: day(120) })
  if (pAdit) {
    await c.api('POST', `${R}/processos/${pAdit.id}/avancar`, { etapa: 'PROTOCOLADO', protocoloEmec: '202609018812' }) // pode exigir checklist
  }
  if (pAdit) await c.api('POST', `${R}/processos/${pAdit.id}/avancar`, { etapa: 'EM_ANALISE' })
  if (pAdit) await c.api('POST', `${R}/processos/${pAdit.id}/diligencias`, { descricao: 'Apresentar PPC revisado e comprovar acervo bibliográfico', prazoResposta: day(9), exigencias: [{ texto: 'PPC revisado' }, { texto: 'Comprovante de acervo' }] })
  const mods = lst(await c.api('GET', `${R}/checklist-modelos?pageSize=50`))
  const mRec = mods.find((m) => /RECONHEC/i.test(m.chave ?? m.tipo ?? m.nome)) ?? mods[0]
  if (mRec && pRec) {
    const cl = await c.api('POST', `${R}/checklists`, { modeloId: mRec.id, processoId: pRec.id, programId: S.direito.id, prazo: day(25) })
    const full = cl ? await c.api('GET', `${R}/checklists/${cl.id}`) : null
    const itens: any[] = full?.itens ?? []
    for (const [i, it] of itens.entries()) {
      if (i % 3 === 0) {
        await c.api('POST', `${R}/checklists/itens/${it.id}/evidencias`, { nome: 'evidencia.pdf', dataUrl: 'data:application/pdf;base64,JVBERi0xLjQK' })
        await c.api('PATCH', `${R}/checklists/itens/${it.id}`, { status: 'ATENDIDO' })
      } else if (i % 3 === 1) await c.api('PATCH', `${R}/checklists/itens/${it.id}`, { status: 'EM_ANDAMENTO' })
    }
  }
  await c.api('POST', `${R}/indicadores/gerar`, {})
}

async function governanca(c: Ctx) {
  const G = '/edu/governanca'
  const pdi = await c.api('POST', `${G}/pdis`, { titulo: 'PDI 2026–2030 — Ravel 2030', anoInicio: 2026, anoFim: 2030 })
  if (pdi) {
    const eixos = ['Ensino e Aprendizagem', 'Pesquisa e Extensão', 'Gestão e Sustentabilidade', 'Infraestrutura']
    const metas: any[] = []
    for (const [i, nome] of eixos.entries()) {
      const eixo = await c.api('POST', `${G}/pdi-eixos`, { pdiId: pdi.id, nome, peso: 1 + (i % 2) })
      if (!eixo) continue
      const obj = await c.api('POST', `${G}/pdi-objetivos`, { eixoId: eixo.id, titulo: ['Reduzir a evasão', 'Ampliar a produção científica', 'Equilíbrio financeiro', 'Modernizar laboratórios'][i] })
      if (!obj) continue
      const def: [string, string, string, number, number][] = [
        ['Taxa de evasão', 'MENOR_MELHOR', 'Reduzir evasão para 8%', 18, 8], ['Publicações indexadas por ano', 'MAIOR_MELHOR', 'Alcançar 60 publicações/ano', 22, 60],
        ['Margem operacional (%)', 'MAIOR_MELHOR', 'Margem operacional de 15%', 6, 15], ['Laboratórios modernizados', 'MAIOR_MELHOR', 'Modernizar 12 laboratórios', 2, 12],
      ]
      const [indicador, sentido, titulo, linhaBase, valorMeta] = def[i]
      const m = await c.api('POST', `${G}/pdi-metas`, { objetivoId: obj.id, titulo, indicador, sentido, linhaBase, valorMeta, periodicidade: 'TRIMESTRAL', prazo: day(500) })
      if (m) metas.push({ m, i })
    }
    const medicoes = [[16, 14], [30, 38], [8, 4], [5, 3]]
    for (const { m, i } of metas) {
      const vals = i === 0 ? [16, 13.5] : i === 1 ? [30, 41] : i === 2 ? [8, 5.5] : [4, 6]
      for (const v of vals) await c.api('POST', `${G}/pdi-metas/${m.id}/medicoes`, { valor: v })
      void medicoes
      await c.api('POST', `${G}/pdi-acoes`, { metaId: m.id, titulo: ['Programa de tutoria entre pares', 'Edital interno de iniciação científica', 'Revisão de contratos e custos', 'Plano de modernização dos laboratórios'][i], prazo: day(i === 2 ? -10 : 40 + i * 25), orcamento: 20000 + i * 15000, gasto: 4000 * i })
      const acaoDone = await c.api('POST', `${G}/pdi-acoes`, { metaId: m.id, titulo: 'Diagnóstico inicial concluído', prazo: day(-30), orcamento: 5000, gasto: 4800 })
      if (acaoDone) await c.api('PUT', `${G}/pdi-acoes/${acaoDone.id}`, { status: 'CONCLUIDA' })
    }
    await c.api('POST', `${G}/pdis/${pdi.id}/ativar`, {})
  }
  const cpa = await c.api('POST', `${G}/cpa/comissoes`, { nome: 'CPA — Comissão Própria de Avaliação' })
  if (cpa) await c.api('POST', `${G}/cpa/ciclos`, { cpaId: cpa.id, titulo: 'Autoavaliação Institucional 2026', anoBase: 2026, inicio: day(-10), fim: day(35), minRespostas: 30 })
  const nde = await c.api('POST', `${G}/ndes`, { programId: S.odonto.id, nome: 'NDE — Odontologia' })
  if (nde) for (const [n, t, r] of [['Marcos Albuquerque', 'DOUTOR', 'INTEGRAL'], ['Ricardo Menezes', 'DOUTOR', 'PARCIAL'], ['Luciana Prado', 'MESTRE', 'PARCIAL'], ['Silvia Aranha', 'DOUTOR', 'INTEGRAL'], ['Tiago Mendes', 'ESPECIALISTA', 'HORISTA']]) await c.api('POST', `${G}/nde-membros`, { ndeId: nde.id, docenteId: 'd-' + n, nome: n, titulacao: t, regime: r, inicio: day(-400) })
  const org = await c.api('POST', `${G}/orgaos`, { tipo: 'CONSUP', nome: 'Conselho Superior (CONSUP)', quorumPercent: 50 })
  if (org) {
    for (let i = 1; i <= 5; i++) await c.api('POST', `${G}/orgao-membros`, { orgaoId: org.id, nome: ['Helena Ravel', 'Marcos Albuquerque', 'Patrícia Moreira', 'Fernando Castro', 'Representante discente'][i - 1], cargo: i === 1 ? 'presidente' : 'membro', inicioMandato: day(-100), fimMandato: day(500), temVoto: true })
    const reu = await c.api('POST', `${G}/reunioes`, { orgaoId: org.id, data: day(6), tipo: 'ORDINARIA' })
    if (reu) await c.api('POST', `${G}/deliberacoes`, { orgaoId: org.id, reuniaoId: reu.id, titulo: 'Aprovar orçamento 2027', texto: 'Aprovação do orçamento anual da instituição.' })
  }
  const cipa = await c.api('POST', `${G}/cipa/gestoes`, { nome: 'CIPA 2026/2027', inicio: day(-120), fim: day(240) })
  void cipa
}

async function biblioteca(c: Ctx) {
  const B = '/edu/biblioteca'
  const obras: [string, string[], string, string, number, string][] = [
    ['Anatomia Humana — Atlas', ['Netter, Frank H.'], '978-85-352-3412-1', '611', 2019, 'Elsevier'], ['Histologia Básica', ['Junqueira, L. C.', 'Carneiro, J.'], '978-85-277-2301-4', '611.018', 2017, 'Guanabara Koogan'],
    ['Dentística — Procedimentos Pré-clínicos', ['Baratieri, L. N.'], '978-85-7288-410-0', '617.6', 2018, 'Santos'], ['Curso de Direito Civil — Parte Geral', ['Gagliano, Pablo S.'], '978-85-536-1203-9', '347', 2022, 'Saraiva'],
    ['Teoria Geral do Estado', ['Dallari, Dalmo de A.'], '978-85-472-3290-5', '320.1', 2021, 'Saraiva'], ['Introdução ao Estudo do Direito', ['Nader, Paulo'], '978-85-309-9103-7', '340', 2020, 'Forense'],
    ['Bioquímica Ilustrada', ['Harvey, R. A.'], '978-85-8271-471-3', '572', 2017, 'Artmed'], ['Metodologia do Trabalho Científico', ['Marconi, M. A.', 'Lakatos, E. M.'], '978-85-97-01565-3', '001.42', 2021, 'Atlas'],
  ]
  S.obras = []
  for (const [titulo, autores, isbn, cdd, ano, editora] of obras) {
    const o = await c.api('POST', `${B}/obras`, { titulo, autores, isbn, cdd, ano, editora, assuntos: 'ensino superior' })
    if (!o) continue
    S.obras.push(o)
    await c.api('POST', `${B}/obras/${o.id}/exemplares-lote`, { quantidade: 3 })
  }
  const leitores: any[] = []
  for (const st of S.students.slice(0, 8)) {
    const l = await c.api('POST', `${B}/leitores/de-aluno/${st.id}`, {})
    if (l) leitores.push(l)
  }
  const ex = lst(await c.api('GET', `${B}/exemplares?pageSize=40`))
  for (const [i, l] of leitores.entries()) {
    const e = ex[i * 2]
    if (!e) continue
    const emp = await c.api('POST', `${B}/emprestimos`, { leitorId: l.id, tombo: e.tombo })
    // alguns atrasados: força a data de devolução prevista para o passado
    if (emp && i % 3 === 0) {
      const prisma = (await import('../src/lib/prisma')).prisma
      await prisma.bibEmprestimo.update({ where: { id: emp.id }, data: { dataPrevista: new Date(Date.now() - (4 + i) * 86_400_000) } as any }).catch(() => undefined)
    }
  }
  await c.api('POST', `${B}/jobs/executar`, {})
}

async function apoio(c: Ctx) {
  const A = '/edu/apoio'
  const tipos = ['PSICOLOGICO', 'PSICOPEDAGOGICO', 'SOCIAL']
  for (let i = 0; i < 4; i++) await c.api('POST', `${A}/atendimentos`, { studentId: S.students[i + 2].id, tipo: pick(tipos, i), dataHora: day(1 + i), motivo: ['Ansiedade nas provas', 'Dificuldade de organização', 'Apoio socioeconômico', 'Adaptação ao curso'][i] })
  const man: [string, string, string][] = [['RECLAMACAO', 'Ar-condicionado da Sala 102 quebrado', 'O ar-condicionado da sala está sem funcionar há duas semanas, prejudicando as aulas.'], ['ELOGIO', 'Atendimento da secretaria', 'Gostaria de elogiar o atendimento rápido e cordial da secretaria acadêmica.'], ['SUGESTAO', 'Mais tomadas na biblioteca', 'Sugiro a instalação de mais tomadas nas mesas de estudo da biblioteca.'], ['DENUNCIA', 'Comportamento inadequado em estágio', 'Relato de situação inadequada ocorrida no campo de estágio.']]
  for (const [tipo, assunto, descricao] of man) await c.api('POST', `${A}/ouvidoria/manifestacoes`, { tipo, assunto, descricao })
  for (const [tipo, assunto, descricao] of man.slice(0, 2)) {
    await fetch(`${process.env.API_URL || 'http://localhost:3000/api'}/public/edu/apoio/ouvidoria/${c.tenantId}/manifestacoes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo, assunto: assunto + ' (anônima)', descricao }) }).catch(() => undefined)
  }
  const mans = lst(await c.api('GET', `${A}/ouvidoria/manifestacoes?pageSize=20`))
  if (mans[0]) await c.api('POST', `${A}/ouvidoria/manifestacoes/${mans[0].id}/triar`, {})
  await c.api('POST', `${A}/risco/recalcular`, {})
  for (const [n, ano, sit] of [['Paulo Henrique Duarte', 2021, 'EMPREGADO'], ['Clara Magalhães', 2022, 'EMPREGADO'], ['Rodolfo Nascimento', 2020, 'EMPREENDEDOR'], ['Vera Lúcia Pinto', 2023, 'DESEMPREGADO']]) await c.api('POST', `${A}/egressos`, { nome: n, email: n.split(' ')[0].toLowerCase() + '@egresso.com', anoConclusao: ano, situacaoProfissional: sit, atuaNaArea: sit !== 'DESEMPREGADO' })
  const emp = await c.api('POST', `${A}/empregabilidade/empresas`, { razaoSocial: 'Clínica Sorriso Total Ltda', nomeFantasia: 'Clínica Sorriso Total', cnpj: '11.222.333/0001-81' })
  if (emp) await c.api('POST', `${A}/empregabilidade/vagas`, { empresaId: emp.id, titulo: 'Estágio em Odontologia', tipo: 'ESTAGIO', descricao: 'Estágio em clínica odontológica geral.' })
  await c.api('POST', `${A}/monitoria/vagas`, { disciplineId: S.secs.odonto[0].disciplina.id, professorUserId: S.users['prof.anatomia'].id, termId: S.term.id, vagas: 2, requisitos: 'Média mínima 7,0 em Anatomia.' })
}

async function comunicacao(c: Ctx) {
  const C = '/edu/comunicacao'
  await c.api('POST', `${C}/canais`, { tipo: 'WHATSAPP', nome: 'WhatsApp Secretaria', provedor: 'META_CLOUD', config: { accessToken: 'demo', phoneNumberId: '100', appSecret: 'demo' } })
  await c.api('POST', `${C}/canais`, { tipo: 'EMAIL', nome: 'E-mail institucional', provedor: 'RESEND', config: { apiKey: 're_demo', from: 'no-reply@ravel.edu.br', webhookSecret: 'whsec_ZGVtbw==' } })
  await c.api('POST', `${C}/canais`, { tipo: 'SITE_CHAT', nome: 'Chat do site', provedor: 'PROPRIO' })
  await c.api('POST', `${C}/contatos/sincronizar`, { origem: 'ALUNOS' })
  const tpls = lst(await c.api('GET', `${C}/templates?pageSize=50`))
  const tp = tpls[0]
  if (tp) {
    await c.api('POST', `${C}/campanhas`, { nome: 'Rematrícula 2027/1 — lembrete', segmento: 'ALUNOS_ATIVOS', canal: 'EMAIL', templateId: tp.id, finalidade: 'ACADEMICO' })
    await c.api('POST', `${C}/campanhas`, { nome: 'Vestibular 2027/1 — últimas vagas', segmento: 'CONTATOS', canal: 'EMAIL', templateId: tp.id, finalidade: 'MARKETING' })
  }
  await c.api('POST', `${C}/reguas/simular`, {})
  const ct = lst(await c.api('GET', `${C}/contatos?pageSize=5`))
  for (const [i, x] of ct.slice(0, 3).entries()) await c.api('POST', `${C}/conversas`, { contatoId: x.id, canal: 'WHATSAPP', texto: ['Olá! Gostaria de informações sobre a rematrícula.', 'Bom dia, preciso da segunda via do boleto.', 'Qual o prazo para trancamento?'][i] })
}

async function modalidades(c: Ctx) {
  const M = '/edu/modalidades'
  for (const [cod, nome, cid, uf] of [['P01', 'Polo Centro — São Paulo', 'São Paulo', 'SP'], ['P02', 'Polo Campinas', 'Campinas', 'SP'], ['P03', 'Polo Recife', 'Recife', 'PE']]) await c.api('POST', `${M}/polos`, { codigo: cod, nome, cidade: cid, uf, capacidade: 120 })
  const polos = lst(await c.api('GET', `${M}/polos`))
  if (polos[0]) await c.api('POST', `${M}/polos/${polos[0].id}/credenciar`, { atoNumero: 'Portaria SERES nº 912/2025', atoData: day(-200) })
  for (const [n, t] of [['Tutor Henrique Alves', 'DISTANCIA'], ['Tutora Beatriz Rocha', 'DISTANCIA'], ['Tutor Presencial Marcelo', 'PRESENCIAL']]) await c.api('POST', `${M}/tutores`, { nome: n, tipo: t, capacidadeAlunos: 40 })
  const discs = S.secs.direito.map((s: any) => s.disciplina)
  for (const d of discs) await c.api('POST', `${M}/ofertas`, { disciplineId: d.id, programId: S.direito.id, modalidade: 'EAD', cargaPresencial: Math.round(d.cargaHoraria * 0.1), cargaOnline: d.cargaHoraria - Math.round(d.cargaHoraria * 0.1), minEncontros: 1, avaliacoesPresenciais: 1 })
  await c.api('POST', `${M}/pos/programas`, { codigo: 'ESP-IMP', nome: 'Especialização em Implantodontia', nivel: 'ESPECIALIZACAO', cargaHoraria: 420, modalidade: 'PRESENCIAL' })
  await c.api('POST', `${M}/pos/programas`, { codigo: 'MP-DD', nome: 'Mestrado Profissional em Direito Digital', nivel: 'MESTRADO_PROFISSIONAL', cargaHoraria: 360, creditosMinimos: 24, conceitoCapes: 3 })
  await c.api('POST', `${M}/bootstrap`, {})
}

async function pesquisa(c: Ctx) {
  const P = '/edu/pesquisa'
  const prof = S.users['prof.anatomia']
  const pubs: [string, string, number, string, string][] = [
    ['Avaliação de resinas bulk-fill em restaurações posteriores', 'ARTIGO', 2025, 'a2', '10.1000/ravel.2025.001'], ['Responsabilidade civil do cirurgião-dentista: panorama jurisprudencial', 'ARTIGO', 2025, 'b1', '10.1000/ravel.2025.002'],
    ['Realidade aumentada no ensino de anatomia', 'ARTIGO', 2024, 'a1', '10.1000/ravel.2024.003'], ['Evasão no ensino superior privado: um estudo de caso', 'ARTIGO', 2024, 'b2', '10.1000/ravel.2024.004'],
    ['Manual de Semiologia Odontológica', 'LIVRO', 2023, 'b3', '10.1000/ravel.2023.005'],
  ]
  for (const [titulo, tipo, ano, qualis, doi] of pubs) await c.api('POST', `${P}/publicacoes`, { tipo, titulo, ano, qualis, doi, autores: [{ tipo: 'EXTERNO', nome: 'Dra. Cecília Fontes', orcid: '0000-0002-1825-0097' }] })
  const g = await c.api('POST', `${P}/grupos`, { nome: 'Grupo de Pesquisa em Biomateriais e Dentística', liderUserId: prof.id })
  void g
  const pj1 = await c.api('POST', `${P}/projetos`, { titulo: 'Resinas bulk-fill: desempenho clínico em 24 meses', tipo: 'PIBIC', coordenadorUserId: prof.id, orcamentoTotal: 18000, dataInicio: ymd(-90), dataFim: ymd(275), resumo: 'Estudo clínico controlado.', objetivos: 'Avaliar longevidade.', metodologia: 'Ensaio clínico randomizado.' })
  const pj2 = await c.api('POST', `${P}/projetos`, { titulo: 'IA generativa na prática jurídica', tipo: 'PIBIC', orcamentoTotal: 12000, dataInicio: ymd(10), dataFim: ymd(375), resumo: 'Mapeamento de usos.', objetivos: 'Mapear riscos.', metodologia: 'Revisão sistemática.' })
  if (pj1) {
    await c.api('POST', `${P}/projetos-etapas`, { projetoId: pj1.id, titulo: 'Recrutamento de pacientes', inicioPrevisto: ymd(-80), fimPrevisto: ymd(-20) })
    await c.api('POST', `${P}/projetos-etapas`, { projetoId: pj1.id, titulo: 'Acompanhamento clínico (6 meses)', inicioPrevisto: ymd(-19), fimPrevisto: ymd(120) })
    await c.api('POST', `${P}/projetos-rubricas`, { projetoId: pj1.id, categoria: 'BOLSA', descricao: 'Bolsas de IC', valorPrevisto: 12000 })
    await c.api('POST', `${P}/projetos/${pj1.id}/transicao`, { para: 'SUBMETIDO' })
    await c.api('POST', `${P}/projetos/${pj1.id}/transicao`, { para: 'EM_AVALIACAO' })
    await c.api('POST', `${P}/projetos/${pj1.id}/transicao`, { para: 'APROVADO' })
    await c.api('POST', `${P}/projetos/${pj1.id}/transicao`, { para: 'EM_EXECUCAO' })
  }
  if (pj2) await c.api('POST', `${P}/projetos-etapas`, { projetoId: pj2.id, titulo: 'Revisão da literatura', inicioPrevisto: ymd(11), fimPrevisto: ymd(100) })
  for (const [i, tipo] of ['TCC', 'TCC', 'DISSERTACAO'].entries()) await c.api('POST', `${P}/trabalhos`, { tipo, titulo: ['Percepção de estudantes sobre a clínica-escola', 'Contratos eletrônicos e proteção de dados', 'Educação a distância e permanência estudantil'][i], studentId: S.students[i + 3].id, orientadorUserId: prof.id })
  const per = await c.api('POST', `${P}/periodicos`, { nome: 'Revista Ravel de Ciências da Saúde e do Direito', issn: '0378-5955', editorChefeUserId: prof.id, doiPrefixo: '10.1234', ativo: true })
  void per
}

async function desempenho(c: Ctx) {
  const D = '/edu/desempenho'
  const exames = lst(await c.api('GET', `${D}/exames?pageSize=50`))
  const oab = exames.find((e) => e.tipo === 'OAB_1FASE')
  const enade = exames.find((e) => e.tipo === 'ENADE')
  if (oab) await c.api('POST', `${D}/edicoes`, { exameId: oab.id, ano: 2026, titulo: 'XLIII Exame de Ordem', inscricaoInicio: day(-20), inscricaoFim: day(15), dataProva: day(45), status: 'INSCRICOES_ABERTAS' })
  if (enade) await c.api('POST', `${D}/edicoes`, { exameId: enade.id, ano: 2026, titulo: 'ENADE 2026', dataProva: day(120), status: 'PLANEJADA' })
  if (oab) await c.api('POST', `${D}/metas`, { programId: S.direito.id, exameId: oab.id, ano: 2026, metaAcerto: 70 })
  const alvo = oab ?? enade
  if (!alvo) return
  const eixos = lst(await c.api('GET', `${D}/eixos?exameId=${alvo.id}&pageSize=20`))
  const qs: string[] = []
  for (let i = 0; i < 12; i++) {
    const eixo = eixos[i % Math.max(1, Math.min(2, eixos.length))]
    const q = await c.api('POST', `${D}/questoes`, { exameId: alvo.id, eixoId: eixo?.id, tipo: 'OBJETIVA', nivel: pick(['FACIL', 'MEDIO', 'DIFICIL'], i), enunciado: `Questão ${i + 1}: assinale a alternativa correta sobre ${eixo?.nome ?? 'o tema'} no contexto profissional.`, alternativas: ['A', 'B', 'C', 'D'].map((l) => ({ letra: l, texto: `Alternativa ${l} da questão ${i + 1}` })), gabarito: pick(['A', 'B', 'C', 'D'], i), comentario: 'Comentário do gabarito.' })
    if (q) { await c.api('POST', `${D}/questoes/${q.id}/revisar`, {}); await c.api('POST', `${D}/questoes/${q.id}/publicar`, {}); qs.push(q.id) }
  }
  if (eixos.length >= 1) await c.api('POST', `${D}/simulados/montar`, { exameId: alvo.id, titulo: 'Simulado Diagnóstico', matriz: eixos.slice(0, 2).map((e) => ({ eixoId: e.id, quantidade: 4 })), abreEm: day(-1), fechaEm: day(7), duracaoMin: 60 })
}

async function jornadas(c: Ctx) {
  const J = '/edu/jornadas'
  const tpls = lst(await c.api('GET', `${J}/templates?pageSize=20`))
  const tAluno = tpls.find((t) => t.persona === 'ALUNO')
  const tCand = tpls.find((t) => t.persona === 'CANDIDATO')
  S.tAluno = tAluno
  const drive = async (instId: string, passos: number) => {
    for (let n = 0; n < passos; n++) {
      const inst = await c.api('GET', `${J}/instancias/${instId}`)
      if (!inst || inst.status !== 'ATIVA') return
      const abertas = (inst.etapas ?? []).filter((e: any) => ['ABERTA', 'AGUARDANDO_EVENTO', 'ATRASADA'].includes(e.status))
      const e = abertas[0]
      if (!e) return
      if (e.tipo === 'ESPERA_EVENTO') { await c.api('POST', `${J}/eventos`, { evento: e.evento, instanciaId: instId }); continue }
      const chk: Record<string, boolean> = {}
      for (const i of e.checklistDef ?? []) chk[i.chave] = true
      for (const i of e.documentosDef ?? []) chk['doc:' + i.chave] = true
      const body: any = { checklist: chk }
      if (e.tipo === 'APROVACAO') body.decisao = 'APROVADO'
      await c.api('POST', `${J}/instancias/${instId}/etapas/${e.id}/avancar`, body)
    }
  }
  S.instancias = []
  if (tAluno) {
    const alvo = [[0, 3], [1, 6], [2, 9], [3, 2], [4, 12], [5, 5]]
    for (const [i, passos] of alvo) {
      const st = S.students[i]
      const r = await c.api('POST', `${J}/instancias`, { personType: 'aluno', personId: st.userId, templateId: tAluno.id, personNome: st.nomeCompleto, contexto: { possuiFies: i % 2 === 0, ultimoPeriodo: false } })
      const inst = r?.instancia ?? r
      if (inst?.id) { S.instancias.push(inst); await drive(inst.id, passos) }
    }
  }
  if (tCand) for (const [i, cand] of S.cands.slice(6, 10).entries()) {
    const r = await c.api('POST', `${J}/instancias`, { personType: 'candidato', personId: cand.id, templateId: tCand.id, personNome: cand.nome })
    const inst = r?.instancia ?? r
    if (inst?.id) await drive(inst.id, 1 + i)
  }
  await c.api('POST', `${J}/processar-atrasos`, {})
}

async function reitoria(c: Ctx) {
  const R = '/edu/reitoria'
  const objs = lst(await c.api('GET', `${R}/objetivos?pageSize=20`))
  for (const o of objs.slice(0, 3)) await c.api('POST', `${R}/objetivos/${o.id}/ativar`, {})
  await c.api('POST', `${R}/painel/snapshot`, {})
  await c.api('POST', `${R}/okr/sincronizar`, {})
}

async function mesa(c: Ctx) {
  const L = '/edu/core/lembretes'
  const itens: [string, string, number, string][] = [
    ['Enviar relatório de autoavaliação (CPA) à CONAES', 'CRITICO', 4, 'regulatorio'], ['Conferir CND da empresa de limpeza', 'ATENCAO', 7, 'suprimentos'], ['Revisar PPC do curso de Direito', 'INFO', 15, 'academico'],
    ['Responder diligência MEC — aditamento de vagas', 'CRITICO', -2, 'regulatorio'], ['Aprovar calendário acadêmico 2027/1', 'ATENCAO', 12, 'calendario'], ['Renovar contrato de licenças acadêmicas', 'ATENCAO', -1, 'financeiro'],
  ]
  for (const [titulo, severity, d, modulo] of itens) await c.api('POST', L, { titulo, descricao: 'Lembrete criado pela demonstração.', dueAt: day(d), severity, modulo, antecedenciaDias: 3 })
  await c.api('POST', `${L}/processar`, {})
}

async function marca(c: Ctx) {
  await c.api('PUT', '/edu/core/instituicao', {
    nome: 'Instituto Ravel de Ensino Superior', nomeFantasia: 'Instituto Ravel', sigla: 'IRES', mantenedora: 'Ravel Educacional Ltda.', cnpj: '12.345.678/0001-90', codigoEmec: '24819',
    categoria: 'Centro Universitário', organizacao: 'Privada com fins lucrativos', email: 'contato@ravel.edu.br', telefone: '(11) 4002-8922', site: 'https://www.ravel.edu.br',
    endereco: 'Av. das Acácias, 1200 — Jardim Universitário', cidade: 'São Paulo', uf: 'SP', corPrimaria: '#1F3A8A', corSecundaria: '#0B1F4D', corDestaque: '#D4A017',
    reitorNome: 'Profa. Dra. Helena Ravel', reitorCargo: 'Reitora', lema: 'Ciência, ética e cuidado', portariaCredenciamento: 'Portaria MEC nº 412/2023',
  })
  const svg = (fundo: string, tipo: 'principal' | 'brasao' | 'escura') => {
    const cor = tipo === 'escura' ? '#FFFFFF' : '#1F3A8A'
    const ouro = '#D4A017'
    if (tipo === 'brasao') return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 240" width="200" height="240"><path d="M20 20h160v110c0 52-40 84-80 98-40-14-80-46-80-98z" fill="#1F3A8A" stroke="${ouro}" stroke-width="8"/><path d="M36 36h128v94c0 42-32 68-64 80-32-12-64-38-64-80z" fill="#0B1F4D"/><text x="100" y="118" text-anchor="middle" font-family="Georgia,serif" font-size="64" font-weight="700" fill="${ouro}">IR</text><path d="M60 148h80M70 166h60" stroke="${ouro}" stroke-width="4" stroke-linecap="round"/><path d="M100 44l8 16h-16z" fill="${ouro}"/></svg>`
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 160" width="520" height="160"><circle cx="80" cy="80" r="66" fill="${tipo === 'escura' ? 'none' : '#1F3A8A'}" stroke="${ouro}" stroke-width="6"/><text x="80" y="102" text-anchor="middle" font-family="Georgia,serif" font-size="62" font-weight="700" fill="${tipo === 'escura' ? '#FFFFFF' : ouro}">IR</text><text x="170" y="74" font-family="Georgia,serif" font-size="46" font-weight="700" fill="${cor}">Instituto Ravel</text><text x="172" y="108" font-family="Arial,sans-serif" font-size="19" letter-spacing="3" fill="${tipo === 'escura' ? '#E5E7EB' : '#4B5563'}">ENSINO SUPERIOR</text><rect x="172" y="120" width="120" height="4" fill="${ouro}"/></svg>`
  }
  void svg
  const du = (x: string) => 'data:image/svg+xml;base64,' + Buffer.from(x).toString('base64')
  await c.api('POST', '/edu/core/marca', { kind: 'LOGO_PRINCIPAL', titulo: 'Logomarca principal', dataUrl: du(svg('', 'principal')), largura: 520, altura: 160 })
  await c.api('POST', '/edu/core/marca', { kind: 'LOGO_ESCURA', titulo: 'Logomarca para fundo escuro', dataUrl: du(svg('', 'escura')), largura: 520, altura: 160 })
  await c.api('POST', '/edu/core/marca', { kind: 'BRASAO', titulo: 'Brasão', dataUrl: du(svg('', 'brasao')), largura: 200, altura: 240 })
  await c.api('POST', '/edu/core/marca', { kind: 'FAVICON', titulo: 'Favicon', dataUrl: du(svg('', 'brasao')), largura: 200, altura: 240 })
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
