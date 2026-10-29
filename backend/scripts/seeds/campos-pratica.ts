/**
 * Seed de demonstração do módulo CAMPOS DE PRÁTICA (estágios, clínicas-escola, agronomia e núcleo animal) — EduMaster Pro.
 * Usa a API REAL com token ADMIN, no estilo de scripts/edu-demo-seed.ts. Idempotente por bloco (cada bloco é pulado se já existir).
 * Integração (feita fora deste arquivo):  import { seedCamposPratica } from './seeds/campos-pratica'  ->  await seedCamposPratica(c.api, c)
 * Uso isolado:  API_URL=http://localhost:3000/api DATABASE_URL=... npx tsx scripts/seeds/campos-pratica.ts  (admin@suainstituicao.edu.br / Demo@2026)
 *
 * Todos os nomes, documentos e telefones são FICTÍCIOS. Contas criadas (senha Demo@2026): coord.campos@, prof.estagio@, prof.psicologia@, prof.fono@,
 * prof.biomed@, prof.odonto@, prof.medicina@, prof.vet@, prof.vetgrandes@, prof.agro@, recepcao.clinica@ (@suainstituicao.edu.br) e alunos novos dos cursos de campo.
 */
export interface SeedCtx {
  tenantId?: string
  mk?: (email: string, password: string, firstName: string, lastName: string, role: string) => Promise<any>
  loginAs?: (c: { email: string; password: string }) => Promise<string>
  failures?: string[]
}
type Api = (method: string, path: string, body?: any) => Promise<any>

const P = '/edu/campos-pratica'
const MIN = 60_000, HORA = 3_600_000, DIA = 86_400_000
const iso = (ms: number) => new Date(ms).toISOString()
const DOM = '@suainstituicao.edu.br'

export async function seedCamposPratica(api: Api, ctx: SeedCtx = {}) {
  const S: Record<string, any> = {}
  const falha = (m: string) => ctx.failures?.push(`seedCamposPratica: ${m}`)
  const lista = (r: any): any[] => (Array.isArray(r) ? r : r?.items ?? [])
  const { prisma } = await import('../../src/lib/prisma')
  const tenantId = ctx.tenantId ?? (await prisma.clinic.findFirst({ where: { email: `contato${DOM}` } }))?.tenantId ?? 'sua-instituicao'
  const API = process.env.API_URL || 'http://localhost:3000/api'
  const now = Date.now()
  const hoje0 = new Date(); hoje0.setUTCHours(0, 0, 0, 0)
  const at = (dias: number, h: number, m = 0) => hoje0.getTime() + dias * DIA + (h + 3) * HORA + m * MIN // horário de Brasília -> UTC
  const diaSemana = (dias: number) => new Date(hoje0.getTime() + dias * DIA).getUTCDay()
  const util = (dias: number) => diaSemana(dias) !== 0 && diaSemana(dias) !== 6
  const proxUtil = (dias: number) => { while (!util(dias)) dias++; return dias }

  // ---------------------------------------------------------------- acesso como usuários reais
  const cache = new Map<string, Api>()
  const como = async (email: string): Promise<Api> => {
    if (cache.has(email)) return cache.get(email)!
    let token: string | null = null
    // Preferência: assina o token localmente (o seed roda no mesmo ambiente da API e conhece JWT_SECRET) - evita o limite de tentativas de login.
    const u = process.env.JWT_SECRET ? await prisma.user.findFirst({ where: { tenantId, email } }) : null
    if (u && process.env.JWT_SECRET) {
      const jwt = (await import('jsonwebtoken')).default
      token = jwt.sign({ id: u.id, email: u.email, clinicId: u.clinicId, tenantId, role: u.role }, process.env.JWT_SECRET, { expiresIn: '2h' })
    } else if (ctx.loginAs) {
      try { token = await ctx.loginAs({ email, password: 'Demo@2026' }) } catch { try { token = await ctx.loginAs({ email, password: 'Aluno@2026' }) } catch { token = null } }
    }
    if (!token) { falha(`sem token para ${email}; usando administrador`); return api }
    const tk = token
    const f: Api = async (method, path, body) => {
      const r = await fetch(`${API}${path}`, { method, headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' }, body: body !== undefined ? JSON.stringify(body) : undefined })
      const t = await r.text()
      let j: any = null
      try { j = JSON.parse(t) } catch { /* texto */ }
      if (!r.ok) { falha(`${email} ${method} ${path} -> ${r.status} ${t.slice(0, 140)}`); return null }
      return j
    }
    cache.set(email, f)
    return f
  }
  const mk = async (email: string, f: string, l: string, role: string) => (ctx.mk ? ctx.mk(email, 'Demo@2026', f, l, role) : prisma.user.findFirst({ where: { tenantId, email } }))
  const quiet = async (fn: () => Promise<any>) => { const antes = ctx.failures?.length ?? 0; const r = await fn(); if (ctx.failures) ctx.failures.length = Math.min(ctx.failures.length, antes + 0) ; return r }
  void quiet

  // ---------------------------------------------------------------- equipe
  const equipe: Array<[string, string, string, string]> = [
    ['coord.campos', 'Fernanda', 'Lacerda', 'COORDINATOR'], ['prof.estagio', 'Beatriz', 'Sampaio', 'TEACHER'], ['prof.psicologia', 'Renata', 'Figueiredo', 'TEACHER'], ['prof.fono', 'Gustavo', 'Meirelles', 'TEACHER'],
    ['prof.biomed', 'Cláudia', 'Rangel', 'TEACHER'], ['prof.odonto', 'Rodrigo', 'Nogueira', 'TEACHER'], ['prof.medicina', 'Paulo', 'Vilela', 'TEACHER'], ['prof.vet', 'Henrique', 'Bastos', 'TEACHER'],
    ['prof.vetgrandes', 'Simone', 'Aragão', 'TEACHER'], ['prof.agro', 'Antônio', 'Carvalho', 'TEACHER'], ['recepcao.clinica', 'Marcos', 'Teixeira', 'STAFF'],
  ]
  const U: Record<string, any> = {}
  for (const [k, f, l, r] of equipe) U[k] = await mk(`${k}${DOM}`, f, l, r)
  if (Object.values(U).some((u) => !u)) { falha('não foi possível criar a equipe (ctx.mk ausente?)'); return S }
  S.equipe = U

  // ---------------------------------------------------------------- cursos, alunos e turmas
  const cursosDef: Array<[string, number]> = [['Psicologia', 4000], ['Biomedicina', 3600], ['Fonoaudiologia', 3200], ['Medicina Veterinária', 4200], ['Medicina', 7200], ['Agronomia', 3800]]
  const programas = lista(await api('GET', '/edu/academico/programs'))
  const C: Record<string, any> = {}
  for (const [nome, ch] of cursosDef) C[nome] = programas.find((p) => p.nome === nome) ?? (await api('POST', '/edu/academico/programs', { nome, modalidade: 'PRESENCIAL', cargaHorariaTotal: ch }))
  C['Odontologia'] = programas.find((p) => p.nome === 'Odontologia')
  const termos = lista(await api('GET', '/edu/academico/terms'))
  const term = termos.find((t) => t.codigo === '2026/2') ?? termos[0]
  if (Object.values(C).some((c) => !c) || !term) { falha('cursos/período indisponíveis'); return S }
  const campus = await prisma.campus.findFirst({ where: { tenantId } })

  const alunosDef: Array<[string, string, string]> = [
    ['Psicologia', 'Larissa Monteiro Cardoso', 'larissa.monteiro'], ['Psicologia', 'Thiago Barbosa Neves', 'thiago.barbosa'], ['Psicologia', 'Débora Salles Pinheiro', 'debora.salles'],
    ['Biomedicina', 'Gabriel Antunes Rocha', 'gabriel.antunes'], ['Biomedicina', 'Natália Freitas Brandão', 'natalia.freitas'],
    ['Fonoaudiologia', 'Camila Ribeiro Duarte', 'camila.ribeiro'], ['Fonoaudiologia', 'Matheus Oliveira Lins', 'matheus.lins'],
    ['Medicina Veterinária', 'Isadora Campos Vieira', 'isadora.campos'], ['Medicina Veterinária', 'Leonardo Prado Esteves', 'leonardo.prado'], ['Medicina Veterinária', 'Bruna Cavalcante Melo', 'bruna.cavalcante'],
    ['Medicina', 'Vitor Hugo Andrade', 'vitor.andrade'], ['Medicina', 'Letícia Moraes Carneiro', 'leticia.moraes'],
    ['Agronomia', 'Rafael Tavares Dutra', 'rafael.tavares'], ['Agronomia', 'Juliana Peixoto Lemos', 'juliana.peixoto'], ['Agronomia', 'Samuel Borges Queiroz', 'samuel.borges'],
  ]
  const A: Record<string, any[]> = {}
  for (const [i, [curso, nome, login]] of alunosDef.entries()) {
    const email = `${login}${DOM}`
    const user = await mk(email, nome.split(' ')[0], nome.split(' ').slice(1).join(' '), 'STUDENT')
    let st = await prisma.student.findFirst({ where: { tenantId, userId: user.id } })
    if (!st) st = await api('POST', '/edu/academico/students', { userId: user.id, ra: `2026C${String(100 + i)}`, nomeCompleto: nome, cpf: `7${String(10000000 + i * 7331).slice(0, 8)}${String(10 + i).slice(-2)}`, dataNascimento: `${2000 + (i % 5)}-0${1 + (i % 9)}-1${i % 9}` })
    if (!st) { falha(`aluno ${nome}`); continue }
    const jaMat = await prisma.enrollment.findFirst({ where: { studentId: st.id, programId: C[curso].id } })
    const en = jaMat ?? (await api('POST', '/edu/academico/enrollments', { studentId: st.id, programId: C[curso].id, termId: term.id }))
    ;(A[curso] ??= []).push({ ...st, userId: user.id, email, enrollmentId: en?.id })
  }
  // aluno de demonstração (aluno@) em Odontologia
  const alunoDemo = await prisma.student.findFirst({ where: { tenantId, userId: (await prisma.user.findFirst({ where: { tenantId, email: `aluno${DOM}` } }))?.id ?? '__' } })
  if (alunoDemo) {
    const outros = await prisma.student.findMany({ where: { tenantId, ra: { in: ['20261001', '20261002'] } } })
    const emails = await prisma.user.findMany({ where: { tenantId, id: { in: outros.map((o) => o.userId) } }, select: { id: true, email: true } })
    A['Odontologia'] = [{ ...alunoDemo, email: `aluno${DOM}` }, ...outros.map((o) => ({ ...o, email: emails.find((e) => e.id === o.userId)?.email }))]
  }
  S.alunos = A

  // disciplina/turma de aulas práticas de Agronomia
  const discAgro = []
  for (const nome of ['Fitotecnia: Culturas Anuais (aula prática)', 'Olericultura (aula prática)']) {
    let d = await prisma.discipline.findFirst({ where: { tenantId, nome } })
    if (!d) d = await api('POST', '/edu/academico/disciplines', { nome, cargaHoraria: 60, ementa: 'Aulas práticas em campo: preparo, manejo, monitoramento e colheita.' })
    if (!d) continue
    let sec = await prisma.classSection.findFirst({ where: { tenantId, disciplineId: d.id } })
    if (!sec) sec = await api('POST', '/edu/academico/class-sections', { ...(campus ? { campusId: campus.id } : {}), disciplineId: d.id, termId: term.id, professorUserId: U['prof.agro'].id, nome: `AGR-${nome.split(' ')[0].slice(0, 3).toUpperCase()}-1A`, vagas: 30 })
    if (sec) {
      for (const a of A['Agronomia'] ?? []) if (a.enrollmentId && !(await prisma.classSectionEnrollment.findFirst({ where: { enrollmentId: a.enrollmentId, classSectionId: sec.id } }))) await api('POST', '/edu/academico/enrollments/class-sections', { enrollmentId: a.enrollmentId, classSectionId: sec.id })
      discAgro.push({ disciplina: d, turma: sec })
    }
  }

  // ================================================================ 1) ESTÁGIOS
  if (!lista(await api('GET', `${P}/estagios/concedentes?q=Esperan%C3%A7a`)).length) {
    const mkC = async (nome: string, tipo: string, cidade: string, extra: any = {}) => api('POST', `${P}/estagios/concedentes`, { nome, tipo, cidade, uf: 'SP', ...extra })
    const cd: Record<string, any> = {
      hosp: await mkC('Hospital Municipal Esperança', 'HOSPITAL', 'São Paulo', { cnpj: '10.200.300/0001-11', contatoNome: 'Márcia Tavares', contatoEmail: 'estagios@esperanca.example.org', contatoTelefone: '(11) 3000-1000' }),
      psi: await mkC('Clínica Vida Integral', 'CLINICA', 'São Paulo', { cnpj: '20.300.400/0001-22', contatoNome: 'Dr. André Pontes', contatoEmail: 'contato@vidaintegral.example.org' }),
      lab: await mkC('Laboratório Diagnóstica Sul', 'EMPRESA', 'Campinas', { cnpj: '30.400.500/0001-33', contatoNome: 'Dra. Helena Quintão' }),
      faz: await mkC('Fazenda Santa Helena Agropecuária', 'FAZENDA', 'Itapetininga', { cnpj: '40.500.600/0001-44', contatoNome: 'Eng. Agr. Joaquim Brandão' }),
      sms: await mkC('Prefeitura Municipal - Secretaria de Saúde', 'ORGAO_PUBLICO', 'São Paulo', { cnpj: '50.600.700/0001-55', contatoNome: 'Cláudio Ferraz' }),
      esc: await mkC('Escola Estadual Prof. Anita Garibaldi', 'ESCOLA', 'Osasco', { cnpj: '60.700.800/0001-66', contatoNome: 'Diretora Vera Lúcia Matos' }),
    }
    if (Object.values(cd).some((c) => !c)) falha('concedentes')
    const cv = async (k: string, numero: string, ini: number, fim: number, objeto: string) => api('POST', `${P}/estagios/convenios`, { concedenteId: cd[k].id, numero, objeto, inicio: iso(now + ini * DIA), fim: iso(now + fim * DIA), documentoUrl: `https://documentos.suainstituicao.edu.br/convenios/${numero.toLowerCase()}.pdf` })
    const conv: Record<string, any> = {
      hosp: await cv('hosp', 'CV-2025-014', -400, 700, 'Estágio curricular em saúde'), psi: await cv('psi', 'CV-2026-003', -200, 520, 'Estágio em psicologia clínica e da saúde'),
      lab: await cv('lab', 'CV-2024-031', -900, 22, 'Estágio em análises clínicas (vence em breve)'), faz: await cv('faz', 'CV-2026-009', -120, 900, 'Estágio em agronomia e medicina veterinária de grandes animais'),
      sms: await cv('sms', 'CV-2025-040', -300, 430, 'Estágio em saúde pública e odontologia'), esc: await cv('esc', 'CV-2023-007', -1200, -15, 'Convênio vencido: renovação pendente'),
    }
    const campo = async (k: string, nome: string, area: string, sup: string, cargo: string, reg: string) => api('POST', `${P}/estagios/campos`, { concedenteId: cd[k].id, convenioId: conv[k]?.id, nome, area, supervisorNome: sup, supervisorEmail: `${sup.split(' ').pop()!.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')}@${k}.example.org`, supervisorCargo: cargo, supervisorRegistro: reg, local: cd[k].cidade })
    const camp: Record<string, any> = {
      hosp: await campo('hosp', 'Pronto atendimento adulto', 'Medicina', 'Dra. Marta Lopes', 'Médica plantonista', 'CRM-SP 100200'),
      psi: await campo('psi', 'Núcleo de psicoterapia', 'Psicologia', 'Dr. André Pontes', 'Psicólogo clínico', 'CRP 06/54321'),
      lab: await campo('lab', 'Bancada de hematologia', 'Biomedicina', 'Dra. Helena Quintão', 'Biomédica responsável', 'CRBM 12345'),
      faz: await campo('faz', 'Manejo de rebanho e lavoura', 'Agronomia e Veterinária', 'Eng. Agr. Joaquim Brandão', 'Responsável técnico', 'CREA-SP 5060123'),
      sms: await campo('sms', 'Unidade Básica de Saúde Jardim Aurora', 'Saúde pública', 'Dr. Cláudio Ferraz', 'Cirurgião-dentista', 'CRO-SP 77881'),
      esc: await campo('esc', 'Fonoaudiologia escolar', 'Fonoaudiologia', 'Fga. Rita Cardozo', 'Fonoaudióloga', 'CRFa 2-11890'),
    }
    const vg = async (k: string, curso: string, q: number) => api('POST', `${P}/estagios/vagas`, { campoId: camp[k].id, programId: C[curso].id, quantidade: q, requisitos: 'Matrícula ativa e cumprimento dos pré-requisitos do curso.' })
    const vagas: Record<string, any> = {
      med: await vg('hosp', 'Medicina', 3), psi: await vg('psi', 'Psicologia', 3), bio: await vg('lab', 'Biomedicina', 2), vet: await vg('faz', 'Medicina Veterinária', 2), agr: await vg('faz', 'Agronomia', 2), odo: await vg('sms', 'Odontologia', 3), fono: await vg('esc', 'Fonoaudiologia', 2),
    }
    S.concedentes = cd; S.convenios = conv; S.campos = camp; S.vagas = vagas

    const prof = U['prof.estagio']
    const planos = 'Acompanhar a rotina do setor, executar procedimentos sob supervisão, registrar atividades diárias e discutir casos com o supervisor de campo e o professor orientador.'
    /** Cria o estágio e percorre o checklist; devolve o estágio no estado pedido. */
    const estagio = async (curso: string, aluno: any, vaga: any, oPara: 'AGUARDANDO' | 'ANDAMENTO' | 'ENCERRADO', ini: number, dur: number, carga: number, seguroDias: number, extra: any = {}) => {
      if (!aluno || !vaga) return null
      const e = await api('POST', `${P}/estagios`, { studentId: aluno.id, vagaId: vaga.id, orientadorUserId: extra.orientador ?? prof.id, tipo: 'OBRIGATORIO', inicio: iso(now + ini * DIA), fim: iso(now + (ini + dur) * DIA), cargaHorariaTotal: carga, horasSemana: 20, supervisorCampoNome: extra.supervisor })
      if (!e) return null
      const emailAluno = aluno.email ?? `aluno${DOM}`
      const sa = await como(emailAluno)
      await sa('PUT', `${P}/estagios/${e.id}/documentos/TERMO_COMPROMISSO`, { url: `https://documentos.suainstituicao.edu.br/estagios/${e.id.slice(0, 8)}/termo.pdf` })
      if (oPara === 'AGUARDANDO') { await sa('PATCH', `${P}/estagios/${e.id}/plano`, { planoAtividades: planos }); return e }
      await sa('PUT', `${P}/estagios/${e.id}/documentos/SEGURO`, { url: `https://documentos.suainstituicao.edu.br/estagios/${e.id.slice(0, 8)}/apolice.pdf`, numero: `AP-${e.id.slice(0, 6).toUpperCase()}`, validade: iso(now + seguroDias * DIA) })
      await sa('PATCH', `${P}/estagios/${e.id}/plano`, { planoAtividades: planos })
      const det = await api('GET', `${P}/estagios/${e.id}`)
      for (const d of det.documentos.filter((x: any) => x.status === 'ENTREGUE')) await api('POST', `${P}/estagios/${e.id}/documentos/${d.id}/validar`, { aprovar: true })
      await api('POST', `${P}/estagios/${e.id}/ativar`)
      return e
    }
    /** Lança horas nas últimas semanas (seg a qui) respeitando o limite de 20 h/semana. */
    const lancarHoras = async (e: any, aluno: any, semanas: number, validar: number, pendentesAntigas = false) => {
      const sa = await como(aluno.email ?? `aluno${DOM}`)
      const segunda = new Date(hoje0); segunda.setUTCDate(segunda.getUTCDate() - ((segunda.getUTCDay() + 6) % 7))
      const atividades = ['Triagem e acolhimento', 'Acompanhamento de atendimentos', 'Registro em prontuário/ficha', 'Estudo de caso com o supervisor', 'Participação em reunião de equipe', 'Procedimento supervisionado']
      for (let w = semanas; w >= 1; w--) {
        for (const [k, hrs] of [[0, 6], [1, 6], [2, 6], [3, 2]] as const) {
          const d = segunda.getTime() - w * 7 * DIA + k * DIA + 12 * HORA
          if (d < now + e.__ini * DIA || d > now || d > now + (e.__ini + e.__dur) * DIA) continue
          await sa('POST', `${P}/estagios/${e.id}/horas`, { data: iso(d), horas: hrs, atividade: `${atividades[(w + k) % atividades.length]} (${hrs} h)` })
        }
      }
      const hs = lista(await api('GET', `${P}/estagios/${e.id}/horas`)).sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime())
      const alvo = Math.min(validar, hs.length)
      const po = await como(`${(e.__orientador ?? 'prof.estagio')}${DOM}`)
      for (const h of hs.slice(0, alvo)) await po('POST', `${P}/estagios/horas/${h.id}/validar`, { aprovar: true })
      if (pendentesAntigas) for (const h of hs.slice(alvo)) await prisma.cprEstagioHora.update({ where: { id: h.id }, data: { createdAt: new Date(now - 12 * DIA) } })
      return hs.length
    }
    const marca = (e: any, ini: number, orientador = 'prof.estagio', dur = 9999) => e && Object.assign(e, { __ini: ini, __orientador: orientador, __dur: dur })

    const est: any[] = []
    // 1) Psicologia: andamento regular com relatório parcial aprovado
    let e = marca(await estagio('Psicologia', A['Psicologia']?.[0], vagas.psi, 'ANDAMENTO', -45, 150, 120, 300, { supervisor: 'Dr. André Pontes', orientador: U['prof.psicologia'].id }), -45, 'prof.psicologia')
    if (e) {
      await lancarHoras(e, A['Psicologia'][0], 6, 99)
      const sa = await como(A['Psicologia'][0].email)
      const rel = await sa('POST', `${P}/estagios/${e.id}/relatorios`, { tipo: 'PARCIAL', texto: 'Nas primeiras semanas acompanhei acolhimentos e sessões de psicoterapia breve, elaborei fichas de triagem e participei das supervisões semanais. Destaco a importância do manejo ético do sigilo.', entregar: true })
      if (rel) await (await como(`prof.psicologia${DOM}`))('POST', `${P}/estagios/relatorios/${rel.id}/avaliar`, { aprovar: true, parecer: 'Bom relato; aprofundar a análise teórica no relatório final.' })
      est.push(e)
    }
    // 2) Psicologia: horas pendentes há mais de uma semana (gera alerta)
    e = marca(await estagio('Psicologia', A['Psicologia']?.[1], vagas.psi, 'ANDAMENTO', -30, 120, 120, 300, { supervisor: 'Dr. André Pontes', orientador: U['prof.psicologia'].id }), -30, 'prof.psicologia')
    if (e) { await lancarHoras(e, A['Psicologia'][1], 4, 3, true); est.push(e) }
    // 3) Biomedicina: estágio concluído e aprovado (fluxo completo)
    e = marca(await estagio('Biomedicina', A['Biomedicina']?.[0], vagas.bio, 'ANDAMENTO', -60, 70, 40, 200, { supervisor: 'Dra. Helena Quintão', orientador: U['prof.biomed'].id }), -60, 'prof.biomed', 70)
    if (e) {
      await lancarHoras(e, A['Biomedicina'][0], 2, 99)
      const sa = await como(A['Biomedicina'][0].email), po = await como(`prof.biomed${DOM}`)
      const rel = await sa('POST', `${P}/estagios/${e.id}/relatorios`, { tipo: 'FINAL', texto: 'Relatório final: rotina de coleta, triagem e análise hematológica, controle de qualidade interno e validação de resultados com a biomédica responsável. Aprendizados e limitações do campo.', entregar: true })
      if (rel) await po('POST', `${P}/estagios/relatorios/${rel.id}/avaliar`, { aprovar: true, parecer: 'Relatório consistente.' })
      await sa('POST', `${P}/estagios/${e.id}/avaliacoes`, { avaliador: 'AUTOAVALIACAO', criterios: { assiduidade: 9, iniciativa: 8, tecnica: 8, etica: 10 } })
      await po('POST', `${P}/estagios/${e.id}/avaliacoes`, { avaliador: 'ORIENTADOR', criterios: { assiduidade: 9, iniciativa: 8.5, tecnica: 8.5, etica: 10 }, parecer: 'Desempenho muito bom.' })
      await po('POST', `${P}/estagios/${e.id}/avaliacoes`, { avaliador: 'SUPERVISOR_CAMPO', criterios: { assiduidade: 10, iniciativa: 9, tecnica: 9, etica: 10 }, parecer: 'Recomendo contratação futura.' })
      await po('POST', `${P}/estagios/${e.id}/encerrar`)
      est.push(e)
    }
    // 4) Fonoaudiologia: aguardando documentos (convênio vencido bloqueia novos; este já estava no sistema? usa vaga com convênio vencido -> não cria)
    // 5) Veterinária (grandes animais) e 6) Agronomia na fazenda
    e = marca(await estagio('Medicina Veterinária', A['Medicina Veterinária']?.[0], vagas.vet, 'ANDAMENTO', -35, 140, 160, 400, { supervisor: 'Eng. Agr. Joaquim Brandão', orientador: U['prof.vetgrandes'].id }), -35, 'prof.vetgrandes')
    if (e) { await lancarHoras(e, A['Medicina Veterinária'][0], 4, 99); est.push(e) }
    e = marca(await estagio('Agronomia', A['Agronomia']?.[0], vagas.agr, 'ANDAMENTO', -28, 150, 160, 400, { supervisor: 'Eng. Agr. Joaquim Brandão', orientador: U['prof.agro'].id }), -28, 'prof.agro')
    if (e) { await lancarHoras(e, A['Agronomia'][0], 3, 99); est.push(e) }
    // 7) Medicina: seguro vencendo em 20 dias (alerta), horas em dia
    e = marca(await estagio('Medicina', A['Medicina']?.[0], vagas.med, 'ANDAMENTO', -40, 60, 100, 21, { supervisor: 'Dra. Marta Lopes', orientador: U['prof.medicina'].id }), -40, 'prof.medicina', 60)
    if (e) { await lancarHoras(e, A['Medicina'][0], 5, 99); est.push(e) }
    // 8) Medicina: aguardando documentos
    e = await estagio('Medicina', A['Medicina']?.[1], vagas.med, 'AGUARDANDO', 10, 120, 200, 400, { supervisor: 'Dra. Marta Lopes', orientador: U['prof.medicina'].id })
    if (e) est.push(e)
    // 9) Odontologia: o aluno de demonstração (aluno@) em estágio na UBS
    e = marca(await estagio('Odontologia', A['Odontologia']?.[0], vagas.odo, 'ANDAMENTO', -25, 120, 120, 400, { supervisor: 'Dr. Cláudio Ferraz', orientador: U['prof.estagio'].id }), -25)
    if (e) { await lancarHoras(e, A['Odontologia'][0], 3, 2); est.push(e) }
    // 10) Fonoaudiologia: aguardando documentos (vaga com convênio vencido falha por regra; usa a vaga do hospital? não: apenas registra tentativa)
    S.estagios = est
  }

  // ================================================================ 2) CLÍNICAS-ESCOLA E HOSPITAL VETERINÁRIO
  if (!lista(await api('GET', `${P}/clinicas/unidades?q=Psicologia`)).length) {
    type Un = { chave: string; nome: string; tipo: string; area: string; curso: string; salas: Array<[string, string?, number?]>; sup: string; alunos: string }
    const unidadesDef: Un[] = [
      { chave: 'psi', nome: 'Clínica-Escola de Psicologia', tipo: 'CLINICA_ESCOLA', area: 'PSICOLOGIA', curso: 'Psicologia', salas: [['Consultório 1'], ['Consultório 2'], ['Sala de grupos', 'SALA_ATENDIMENTO', 1]], sup: 'prof.psicologia', alunos: 'Psicologia' },
      { chave: 'fono', nome: 'Clínica de Fonoaudiologia', tipo: 'CLINICA_ESCOLA', area: 'FONOAUDIOLOGIA', curso: 'Fonoaudiologia', salas: [['Sala de avaliação'], ['Sala de terapia']], sup: 'prof.fono', alunos: 'Fonoaudiologia' },
      { chave: 'bio', nome: 'Laboratório-Escola de Análises Clínicas', tipo: 'LABORATORIO', area: 'BIOMEDICINA', curso: 'Biomedicina', salas: [['Coleta 1', 'SALA_ATENDIMENTO'], ['Coleta 2', 'SALA_ATENDIMENTO']], sup: 'prof.biomed', alunos: 'Biomedicina' },
      { chave: 'odo', nome: 'Clínica-Escola de Odontologia', tipo: 'CLINICA_ESCOLA', area: 'ODONTOLOGIA', curso: 'Odontologia', salas: [['Box 1'], ['Box 2'], ['Box 3']], sup: 'prof.odonto', alunos: 'Odontologia' },
      { chave: 'med', nome: 'Ambulatório-Escola de Medicina', tipo: 'AMBULATORIO', area: 'MEDICINA', curso: 'Medicina', salas: [['Consultório A'], ['Consultório B']], sup: 'prof.medicina', alunos: 'Medicina' },
    ]
    const UN: Record<string, any> = {}, SALAS: Record<string, any[]> = {}
    for (const u of unidadesDef) {
      UN[u.chave] = await api('POST', `${P}/clinicas/unidades`, { nome: u.nome, tipo: u.tipo, area: u.area, programId: C[u.curso].id, endereco: 'Campus Central - Bloco de Saúde', telefone: '(11) 4002-8922' })
      SALAS[u.chave] = []
      if (UN[u.chave]) for (const [n, t, cap] of u.salas) SALAS[u.chave].push(await api('POST', `${P}/clinicas/consultorios`, { unidadeId: UN[u.chave].id, nome: n, tipo: t ?? 'CONSULTORIO', capacidade: cap ?? 1 }))
    }
    UN.vet = await api('POST', `${P}/clinicas/unidades`, { nome: 'Hospital Veterinário-Escola', tipo: 'HOSPITAL_VET', area: 'VETERINARIA', programId: C['Medicina Veterinária'].id, endereco: 'Campus Rural - Rodovia SP-127, km 4', telefone: '(11) 4002-8930' })
    SALAS.vet = UN.vet ? [await api('POST', `${P}/clinicas/consultorios`, { unidadeId: UN.vet.id, nome: 'Consultório de pequenos animais 1' }), await api('POST', `${P}/clinicas/consultorios`, { unidadeId: UN.vet.id, nome: 'Consultório de pequenos animais 2' }), await api('POST', `${P}/clinicas/consultorios`, { unidadeId: UN.vet.id, nome: 'Centro cirúrgico', tipo: 'CENTRO_CIRURGICO' }), await api('POST', `${P}/clinicas/consultorios`, { unidadeId: UN.vet.id, nome: 'Atendimento a campo / brete', tipo: 'A_CAMPO', capacidade: 4 })] : []
    S.unidades = UN; S.salas = SALAS

    // ---------- pacientes (fictícios), com consentimento
    const consent = (f: string) => ({ aceito: true, finalidade: f })
    const pac = async (nome: string, cpf: string, extra: any = {}, tipo = 'PACIENTE', fin = 'Atendimento supervisionado na clínica-escola, com fins assistenciais e de ensino') =>
      api('POST', `${P}/clinicas/pacientes`, { tipo, nome, cpf, telefone: extra.telefone ?? '(11) 9' + String(8000 + Math.floor(Math.random() * 1999)) + '-' + String(1000 + Math.floor(Math.random() * 8999)), consentimento: consent(fin), ...extra })
    const PAC: Record<string, any> = {}
    const pdef: Array<[string, string, string, any]> = [
      ['psi1', 'Mariana Alves Teixeira', '710.000.001-01', { dataNascimento: '1992-03-14', saude: 'Queixa de ansiedade e dificuldade de sono; sem uso de medicação.' }],
      ['psi2', 'Roberto Campos Lima', '710.000.002-02', { dataNascimento: '1985-11-02', saude: 'Luto recente; acompanhamento breve.' }],
      ['psi3', 'Ana Luísa Prado', '710.000.003-03', { dataNascimento: '2001-07-21', saude: 'Dificuldades de adaptação acadêmica.' }],
      ['psi4', 'Edson Ribeiro Matos', '710.000.004-04', { dataNascimento: '1978-01-30' }],
      ['fono1', 'Pedro Henrique Gomes', '710.000.005-05', { dataNascimento: '2017-05-10', responsavelNome: 'Cláudia Gomes', responsavelCpf: '710.000.105-05', saude: 'Atraso na fala; avaliação de linguagem.' }],
      ['fono2', 'Dona Lourdes Figueiredo', '710.000.006-06', { dataNascimento: '1949-09-09', saude: 'Disfagia leve pós-AVC.' }],
      ['fono3', 'Sofia Martins Azevedo', '710.000.007-07', { dataNascimento: '2019-02-18', responsavelNome: 'Renato Azevedo', responsavelCpf: '710.000.107-07' }],
      ['bio1', 'Cláudio Bernardes', '710.000.008-08', { dataNascimento: '1970-06-25' }], ['bio2', 'Tatiane Souza Freire', '710.000.009-09', { dataNascimento: '1995-12-01' }],
      ['odo1', 'Valéria Cunha Moreira', '710.000.010-10', { dataNascimento: '1988-04-04', saude: 'Alergia a penicilina.' }], ['odo2', 'Heitor Santana', '710.000.011-11', { dataNascimento: '1999-08-19' }], ['odo3', 'Maria Eduarda Pires', '710.000.012-12', { dataNascimento: '2012-10-10', responsavelNome: 'Carolina Pires', responsavelCpf: '710.000.112-12' }],
      ['med1', 'Antônio Carlos Veloso', '710.000.013-13', { dataNascimento: '1960-02-27', saude: 'Hipertensão em acompanhamento.' }], ['med2', 'Rosângela Dias', '710.000.014-14', { dataNascimento: '1975-05-15', saude: 'Diabetes tipo 2.' }],
    ]
    for (const [k, n, c, x] of pdef) PAC[k] = await pac(n, c, x)
    S.pacientes = PAC

    // ---------- escalas passadas (histórico) e próximas, com aluno-estagiário e supervisor
    const dias: number[] = []
    for (let d = -9; d <= 7; d++) if (util(d)) dias.push(d)
    const ESC: Record<string, Record<number, any>> = {}
    const alunoDe = (curso: string) => (A[curso] ?? []).slice(0, 2)
    for (const u of unidadesDef) {
      ESC[u.chave] = {}
      if (!UN[u.chave]) continue
      for (const d of dias) {
        const alunos = alunoDe(u.alunos).map((a) => a.id)
        if (!alunos.length) continue
        const es = await api('POST', `${P}/clinicas/escalas`, { unidadeId: UN[u.chave].id, programId: C[u.curso].id, supervisorUserId: U[u.sup].id, inicio: iso(at(d, 8)), fim: iso(at(d, 12)), capacidadeSimultanea: 2, alunos, observacao: 'Atendimento supervisionado - turno da manhã' })
        if (es) { ESC[u.chave][d] = es; if (d < 0) await prisma.cprEscala.update({ where: { id: es.id }, data: { supervisorPresenteEm: new Date(at(d, 8, 5)) } }) }
      }
    }
    S.escalas = ESC

    // ---------- atendimentos: histórico (realizados e faltas) + agenda dos próximos dias
    const sup = (k: string) => como(`${k}${DOM}`)
    const ativos = unidadesDef.filter((u) => UN[u.chave] && (A[u.alunos]?.length ?? 0) > 0)
    const pacientesDe: Record<string, string[]> = { psi: ['psi1', 'psi2', 'psi3', 'psi4'], fono: ['fono1', 'fono2', 'fono3'], bio: ['bio1', 'bio2'], odo: ['odo1', 'odo2', 'odo3'], med: ['med1', 'med2'] }
    const resumos: Record<string, string[]> = {
      psi: ['Acolhimento inicial; levantamento da demanda e contrato terapêutico.', 'Exploração de situações geradoras de ansiedade; técnicas de respiração.', 'Revisão de metas e devolutiva parcial.'],
      fono: ['Avaliação da linguagem oral; brincadeira dirigida.', 'Terapia de articulação; orientação à família.', 'Treino de deglutição com consistência pastosa.'],
      bio: ['Coleta de sangue venoso, identificação e encaminhamento ao laboratório.', 'Orientação de preparo para exame; coleta realizada sem intercorrências.'],
      odo: ['Anamnese, exame clínico e plano de tratamento.', 'Profilaxia e raspagem supracondiral.', 'Restauração em resina composta dente 36.'],
      med: ['Anamnese, aferição de pressão e orientação nutricional.', 'Retorno: ajuste de conduta e solicitação de exames.'],
    }
    let nPassado = 0
    for (const u of ativos) {
      const pk = pacientesDe[u.chave], alunos = alunoDe(u.alunos), sa = await sup(u.sup)
      let idx = 0
      for (const d of dias.filter((x) => x < 0)) {
        const sala = SALAS[u.chave]?.[0]
        if (!sala || !ESC[u.chave][d] || !pk?.length) continue
        for (const [j, aluno] of alunos.entries()) {
          const paciente = PAC[pk[(idx + j) % pk.length]]
          if (!paciente?.id) continue
          idx++
          const sl = SALAS[u.chave][j % SALAS[u.chave].length]
          const falta = (idx + d + 9) % 9 === 0
          const c = await api('POST', `${P}/clinicas/agenda`, { unidadeId: UN[u.chave].id, consultorioId: sl.id, pacienteId: paciente.id, supervisorUserId: U[u.sup].id, alunoStudentId: aluno.id, inicio: iso(at(d, 8 + j * 2)), fim: iso(at(d, 9 + j * 2)), categoria: idx % 4 === 0 ? 'TRIAGEM' : 'CONSULTA', retroativo: true })
          if (!c) continue
          nPassado++
          if (falta) { await api('POST', `${P}/clinicas/agenda/${c.id}/falta`, { justificada: idx % 12 === 0 }); continue }
          if (!(await sa('POST', `${P}/clinicas/agenda/${c.id}/iniciar`))) continue
          await prisma.cprConsulta.update({ where: { id: c.id }, data: { chegouEm: new Date(at(d, 8 + j * 2) - (3 + (idx % 7) * 4) * MIN), iniciadoEm: new Date(at(d, 8 + j * 2) + (idx % 5) * MIN) } })
          const sal = await como(aluno.email)
          const res = resumos[u.chave]
          await sal('POST', `${P}/clinicas/agenda/${c.id}/registro`, { resumo: res[idx % res.length], conduta: 'Retorno agendado', nivel: 'NORMAL' })
          if (u.chave === 'psi' && idx % 3 === 0) await sa('POST', `${P}/clinicas/agenda/${c.id}/registro`, { resumo: 'Observações do supervisor sobre dinâmica familiar relatada; manter sigilo reforçado.', nivel: 'SIGILOSO' })
          await sa('POST', `${P}/clinicas/agenda/${c.id}/finalizar`)
        }
      }
    }
    S.atendimentosPassados = nPassado
    // paciente com 3 faltas consecutivas (bloqueio de novo agendamento sem liberação)
    if (PAC.psi4?.id && SALAS.psi?.[2]) {
      for (const [k, d] of [[0, -8], [1, -7], [2, -6]] as const) {
        const c = await api('POST', `${P}/clinicas/agenda`, { unidadeId: UN.psi.id, consultorioId: SALAS.psi[2].id, pacienteId: PAC.psi4.id, supervisorUserId: U['prof.psicologia'].id, inicio: iso(at(d, 11, 0)), fim: iso(at(d, 11, 45)), retroativo: true, forcar: true })
        if (c) await api('POST', `${P}/clinicas/agenda/${c.id}/falta`, {})
        void k
      }
    }
    // próximos dias: agenda (alguns confirmados) + lembretes
    let nFuturo = 0
    for (const u of ativos) {
      const pk = pacientesDe[u.chave], alunos = alunoDe(u.alunos)
      let idx = 0
      for (const d of dias.filter((x) => x >= 0 && x <= 5)) {
        if (!ESC[u.chave][d] || !pk?.length) continue
        for (const [j, aluno] of alunos.entries()) {
          const paciente = PAC[pk[(idx + j + d) % pk.length]]
          if (!paciente?.id || (paciente.id === PAC.psi4?.id)) continue
          idx++
          const sl = SALAS[u.chave][j % SALAS[u.chave].length]
          const ini = at(d, 8 + j * 2) + (d === 0 ? Math.max(0, now + 30 * MIN - at(d, 8 + j * 2)) : 0)
          if (d === 0 && ini + 45 * MIN > at(d, 12)) continue
          const c = await api('POST', `${P}/clinicas/agenda`, { unidadeId: UN[u.chave].id, consultorioId: sl.id, pacienteId: paciente.id, supervisorUserId: U[u.sup].id, alunoStudentId: aluno.id, inicio: iso(ini), fim: iso(ini + 45 * MIN), categoria: 'RETORNO' })
          if (!c) continue
          nFuturo++
          if (idx % 2 === 0) await api('POST', `${P}/clinicas/agenda/${c.id}/confirmar`)
        }
      }
    }
    S.atendimentosFuturos = nFuturo
    // fila de espera por curso
    const fila: Array<[string, string, string, string]> = [['psi', 'psi3', 'ALTA', 'Psicologia'], ['fono', 'fono3', 'NORMAL', 'Fonoaudiologia'], ['odo', 'odo3', 'URGENTE', 'Odontologia'], ['med', 'med2', 'NORMAL', 'Medicina'], ['bio', 'bio2', 'NORMAL', 'Biomedicina']]
    for (const [uk, pk, prioridade, curso] of fila) if (PAC[pk]?.id) await api('POST', `${P}/clinicas/fila`, { pacienteId: PAC[pk].id, programId: C[curso].id, unidadeId: UN[uk]?.id, prioridade, observacao: 'Aguardando horário com aluno-estagiário' })
    // espera na fila: itens antigos viram agendamentos (alimenta o tempo médio de espera dos relatórios) e os que seguem aguardando ficam com datas de entrada diferentes
    const antigos = await prisma.cprFila.findMany({ where: { tenantId, status: 'AGUARDANDO' }, orderBy: { createdAt: 'asc' } })
    for (const [i, f] of antigos.entries()) await prisma.cprFila.update({ where: { id: f.id }, data: { createdAt: new Date(now - (4 + i * 5) * DIA) } })
    for (const [uk, pk, curso, hh] of [['bio', 'bio1', 'Biomedicina', 11], ['odo', 'odo2', 'Odontologia', 11]] as const) {
      const d = proxUtil(1)
      if (!PAC[pk]?.id || !SALAS[uk]?.[1] || !ESC[uk]?.[d]) continue
      const f = await api('POST', `${P}/clinicas/fila`, { pacienteId: PAC[pk].id, programId: C[curso].id, unidadeId: UN[uk].id, prioridade: 'NORMAL', observacao: 'Aguardou vaga com estagiário' })
      if (!f) continue
      await prisma.cprFila.update({ where: { id: f.id }, data: { createdAt: new Date(now - 11 * DIA) } })
      const u = unidadesDef.find((x) => x.chave === uk)!
      await api('POST', `${P}/clinicas/fila/${f.id}/agendar`, { unidadeId: UN[uk].id, consultorioId: SALAS[uk][1].id, supervisorUserId: U[u.sup].id, alunoStudentId: alunoDe(u.alunos)[0]?.id, inicio: iso(at(d, hh)), fim: iso(at(d, hh, 45)) })
    }
    // um paciente que revogou o consentimento (exemplo de LGPD)
    const rev = await pac('Fábio Nascimento Dutra', '710.000.099-99', {}, 'PACIENTE')
    if (rev) await api('POST', `${P}/clinicas/pacientes/${rev.id}/consentimento/revogar`, { motivo: 'Solicitação do titular' })
  }

  // ================================================================ 3) NÚCLEO DE AGRONOMIA
  if (!lista(await api('GET', `${P}/agro/areas?q=Santa%20Aurora`)).length) {
    const prof = U['prof.agro']
    const area = await api('POST', `${P}/agro/areas`, { nome: 'Fazenda-Escola Santa Aurora', tipo: 'CAMPO_EXPERIMENTAL', hectares: 42, localizacao: 'Campus Rural - Itapetininga/SP', latitude: -23.59, longitude: -48.05 })
    const horta = await api('POST', `${P}/agro/areas`, { nome: 'Horta didática e estufas', tipo: 'HORTA', hectares: 2, localizacao: 'Campus Rural - setor de olericultura' })
    if (!area || !horta) { falha('áreas'); return S }
    const tl = async (a: any, nome: string, ha: number, solo: string, irrigado = false) => api('POST', `${P}/agro/talhoes`, { areaId: a.id, nome, hectares: ha, solo, irrigado })
    const T = { t1: await tl(area, 'Talhão 1 - Várzea', 8, 'Gleissolo', true), t2: await tl(area, 'Talhão 2 - Encosta', 10, 'Latossolo Vermelho'), t3: await tl(area, 'Talhão 3 - Planalto', 12, 'Latossolo Vermelho-Amarelo'), t4: await tl(area, 'Talhão 4 - Experimental', 6, 'Argissolo'), e1: await tl(horta, 'Estufa 1', 0.5, 'Substrato', true), c1: await tl(horta, 'Canteiros didáticos', 1, 'Franco-arenoso', true) }
    const cl = async (nome: string, especie: string, cicloDias: number, ini: number, fim: number) => api('POST', `${P}/agro/culturas`, { nome, especie, cicloDias, mesPlantioInicio: ini, mesPlantioFim: fim })
    const K = { soja: await cl('Soja', 'Glycine max', 125, 9, 12), milho: await cl('Milho safrinha', 'Zea mays', 130, 1, 3), feijao: await cl('Feijão', 'Phaseolus vulgaris', 90, 2, 4), trigo: await cl('Trigo', 'Triticum aestivum', 120, 4, 6), tomate: await cl('Tomate (estufa)', 'Solanum lycopersicum', 110, 1, 12), alface: await cl('Alface', 'Lactuca sativa', 55, 3, 9) }
    const cvr = async (c: any, nome: string, ciclo?: number, ob?: string) => api('POST', `${P}/agro/cultivares`, { culturaId: c.id, nome, cicloDias: ciclo, obtentor: ob })
    const V = { soja1: await cvr(K.soja, 'BRS 1010 IPRO', 118, 'Embrapa (fictício)'), soja2: await cvr(K.soja, 'M 5917 IPRO', 125), milho1: await cvr(K.milho, 'AG 1051', 130), feijao1: await cvr(K.feijao, 'BRS Estilo', 88), trigo1: await cvr(K.trigo, 'BRS 264', 120), tomate1: await cvr(K.tomate, 'Santa Clara', 105), alface1: await cvr(K.alface, 'Crespa Verde', 52) }
    const turmaPratica = discAgro[0]?.turma, turmaOler = discAgro[1]?.turma
    const ciclo = async (t: any, c: any, cv: any, safra: string, plantio: number, extra: any = {}) => api('POST', `${P}/agro/ciclos`, { talhaoId: t.id, culturaId: c.id, cultivarId: cv?.id, safra, plantioPrevisto: iso(now + plantio * DIA), responsavelUserId: prof.id, confirmarForaJanela: true, ...extra })
    const ativ = (cid: string, body: any) => api('POST', `${P}/agro/ciclos/${cid}/atividades`, body)
    const hist = async (c: any, plantio: number, atividades: any[], colheita: number, kg: number) => {
      if (!c) return
      await api('POST', `${P}/agro/ciclos/${c.id}/plantar`, { data: iso(now + plantio * DIA) })
      for (const a of atividades) await ativ(c.id, { ...a, data: iso(now + (plantio + a.dia) * DIA) })
      if (colheita) await api('POST', `${P}/agro/ciclos/${c.id}/colher`, { data: iso(now + colheita * DIA), producaoKg: kg })
    }
    // safras encerradas (histórico de produtividade)
    const c1 = await ciclo(T.t2, K.milho, V.milho1, '2025/26', -290, { areaHa: 10, classSectionId: turmaPratica?.id, disciplineId: turmaPratica?.disciplinaId })
    await hist(c1, -290, [{ dia: -10, tipo: 'PREPARO_SOLO', observacao: 'Aração e gradagem', custo: 4200 }, { dia: 0, tipo: 'PLANTIO', insumo: 'Sementes AG 1051', quantidade: 6, unidade: 'sc', custoUnitario: 780, custo: 4680 }, { dia: 15, tipo: 'ADUBACAO', insumo: 'NPK 08-28-16', quantidade: 2500, unidade: 'kg', custoUnitario: 4.1 }, { dia: 40, tipo: 'APLICACAO_DEFENSIVO', insumo: 'Inseticida Lambda (fictício)', quantidade: 12, unidade: 'L', custoUnitario: 95, carenciaDias: 21 }, { dia: 70, tipo: 'ADUBACAO', insumo: 'Ureia (cobertura)', quantidade: 1800, unidade: 'kg', custoUnitario: 3.6 }], -150, 84500)
    const c2 = await ciclo(T.t3, K.feijao, V.feijao1, '2025/26', -240, { areaHa: 12 })
    await hist(c2, -240, [{ dia: -7, tipo: 'PREPARO_SOLO', custo: 5200 }, { dia: 0, tipo: 'PLANTIO', insumo: 'Sementes BRS Estilo', quantidade: 8, unidade: 'sc', custoUnitario: 520, custo: 4160 }, { dia: 25, tipo: 'APLICACAO_DEFENSIVO', insumo: 'Fungicida Estrobilurina (fictício)', quantidade: 9, unidade: 'L', custoUnitario: 120, carenciaDias: 14 }], -150, 28800)
    const c3 = await ciclo(T.t1, K.trigo, V.trigo1, '2026', -170, { areaHa: 8 })
    await hist(c3, -170, [{ dia: -5, tipo: 'PREPARO_SOLO', custo: 3600 }, { dia: 0, tipo: 'PLANTIO', insumo: 'Sementes BRS 264', quantidade: 20, unidade: 'sc', custoUnitario: 160, custo: 3200 }, { dia: 30, tipo: 'IRRIGACAO', custo: 900, observacao: 'Pivô - lâmina de 20 mm' }], -50, 31200)
    // safra atual: soja em manejo (aula prática, com carência em vigor), milho planejado, hortaliças
    const soja = await ciclo(T.t2, K.soja, V.soja1, '2026/27', -35, { areaHa: 10, classSectionId: turmaPratica?.id, disciplineId: turmaPratica?.disciplinaId })
    await hist(soja, -35, [{ dia: -8, tipo: 'PREPARO_SOLO', observacao: 'Dessecação e plantio direto', custo: 2800 }, { dia: 0, tipo: 'PLANTIO', insumo: 'Sementes BRS 1010 IPRO', quantidade: 9, unidade: 'sc', custoUnitario: 690, custo: 6210 }, { dia: 12, tipo: 'ADUBACAO', insumo: 'MAP + KCl', quantidade: 3000, unidade: 'kg', custoUnitario: 3.9 }, { dia: 28, tipo: 'APLICACAO_DEFENSIVO', insumo: 'Fungicida Triazol + Estrobilurina (fictício)', quantidade: 8, unidade: 'L', custoUnitario: 135, carenciaDias: 30 }], 0, 0)
    const sojaAlunos = soja ? await como(`${A['Agronomia']?.[0]?.email}`) : api
    if (soja) {
      await sojaAlunos('POST', `${P}/agro/ciclos/${soja.id}/atividades`, { tipo: 'CAPINA', data: iso(now - 6 * DIA), observacao: 'Capina de manutenção nas bordaduras (aula prática)', custo: 0 })
      await sojaAlunos('POST', `${P}/agro/ciclos/${soja.id}/monitoramentos`, { data: iso(now - 5 * DIA), tipo: 'PRAGA', descricao: 'Percevejo-marrom: 2 indivíduos por pano de batida, abaixo do nível de ação.', severidade: 'BAIXA', fotoUrl: 'https://fotos.suainstituicao.edu.br/agronomia/percevejo-soja-01.jpg' })
      await sojaAlunos('POST', `${P}/agro/ciclos/${soja.id}/monitoramentos`, { data: iso(now - 2 * DIA), tipo: 'DOENCA', descricao: 'Ferrugem asiática: pústulas no terço inferior em 15% das plantas; recomendar avaliação de aplicação.', severidade: 'ALTA', fotoUrl: 'https://fotos.suainstituicao.edu.br/agronomia/ferrugem-soja-02.jpg', acao: 'Aguardando decisão do professor responsável' })
      await sojaAlunos('POST', `${P}/agro/ciclos/${soja.id}/monitoramentos`, { data: iso(now - DIA), tipo: 'ESTADO_FENOLOGICO', descricao: 'Estádio V6/R1: início do florescimento nas parcelas precoces.', severidade: 'BAIXA' })
    }
    await ciclo(T.t4, K.milho, V.milho1, '2026/27', 75, { areaHa: 6, classSectionId: turmaPratica?.id })
    await ciclo(T.t3, K.soja, V.soja2, '2026/27', 12, { areaHa: 12 })
    const alf = await ciclo(T.c1, K.alface, V.alface1, '2026', -30, { areaHa: 0.5, classSectionId: turmaOler?.id })
    await hist(alf, -30, [{ dia: -3, tipo: 'PREPARO_SOLO', custo: 150 }, { dia: 0, tipo: 'PLANTIO', insumo: 'Mudas de alface', quantidade: 1800, unidade: 'un', custoUnitario: 0.18 }, { dia: 15, tipo: 'APLICACAO_DEFENSIVO', insumo: 'Calda bordalesa orgânica', quantidade: 5, unidade: 'L', custoUnitario: 8, carenciaDias: 7 }, { dia: 20, tipo: 'IRRIGACAO', custo: 40 }], 0, 0)
    const tom = await ciclo(T.e1, K.tomate, V.tomate1, '2026', -70, { areaHa: 0.5, classSectionId: turmaOler?.id })
    await hist(tom, -70, [{ dia: -4, tipo: 'PREPARO_SOLO', custo: 380 }, { dia: 0, tipo: 'PLANTIO', insumo: 'Mudas Santa Clara', quantidade: 1500, unidade: 'un', custoUnitario: 0.9 }, { dia: 21, tipo: 'ADUBACAO', insumo: 'Fertirrigação NPK', quantidade: 90, unidade: 'kg', custoUnitario: 6.5 }, { dia: 45, tipo: 'APLICACAO_DEFENSIVO', insumo: 'Acaricida (fictício)', quantidade: 2, unidade: 'L', custoUnitario: 160, carenciaDias: 3 }], 0, 0)
    if (tom) await (await como(`${A['Agronomia']?.[1]?.email}`))('POST', `${P}/agro/ciclos/${tom.id}/monitoramentos`, { data: iso(now - 3 * DIA), tipo: 'PRAGA', descricao: 'Ácaro-rajado em folhas baixeiras, reboleiras de 5 m².', severidade: 'MEDIA', fotoUrl: 'https://fotos.suainstituicao.edu.br/agronomia/acaro-tomate-01.jpg' })
    S.agro = { area, horta, talhoes: T, culturas: K }
  }

  // ================================================================ 4) NÚCLEO ANIMAL
  if (!lista(await api('GET', `${P}/clinicas/pacientes?tipo=TUTOR&q=Pimentel`)).length) {
    const tutor = async (nome: string, cpf: string, tel: string) => api('POST', `${P}/clinicas/pacientes`, { tipo: 'TUTOR', nome, cpf, telefone: tel, email: `${nome.split(' ')[0].toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')}@example.org`, consentimento: { aceito: true, finalidade: 'Cadastro do tutor para atendimento do animal no hospital veterinário-escola e envio de lembretes de vacinação' } })
    const TU = { a: await tutor('Eliane Pimentel Souto', '720.000.001-01', '(11) 98111-2201'), b: await tutor('Augusto Cesar Leitão', '720.000.002-02', '(11) 98111-2202'), c: await tutor('Silvana Marques Bittencourt', '720.000.003-03', '(11) 98111-2203'), d: await tutor('Sítio Boa Esperança - José Armando', '720.000.004-04', '(15) 99111-2204'), e: await tutor('Cooperativa Leiteira Vale Verde', '720.000.005-05', '(15) 3111-2205'), f: await tutor('Haras Colina do Sol - Ricardo Amaral', '720.000.006-06', '(15) 99111-2206') }
    if (Object.values(TU).some((t) => !t)) falha('tutores')
    const pr = async (t: any, nome: string, mun: string, ha: number, ex: string) => api('POST', `${P}/animal/propriedades`, { tutorId: t.id, nome, municipio: mun, uf: 'SP', hectares: ha, exploracao: ex })
    const PRP = { d: await pr(TU.d, 'Sítio Boa Esperança', 'Tatuí', 38, 'OVINOCAPRINO'), e: await pr(TU.e, 'Fazenda Vale Verde', 'Itapetininga', 210, 'LEITE'), f: await pr(TU.f, 'Haras Colina do Sol', 'Sarapuí', 65, 'EQUINOCULTURA') }
    const an = async (body: any) => api('POST', `${P}/animal/animais`, body)
    const AN = {
      thor: await an({ nome: 'Thor', grupo: 'PEQUENO', especie: 'CAO', raca: 'Labrador', sexo: 'M', nascimento: iso(now - 4 * 365 * DIA), pelagem: 'Chocolate', identificacao: '985112003000001', tutorId: TU.a.id, pesoAtualKg: 31 }),
      mel: await an({ nome: 'Mel', grupo: 'PEQUENO', especie: 'CAO', raca: 'SRD', sexo: 'F', nascimento: iso(now - 2 * 365 * DIA), pelagem: 'Caramelo', identificacao: '985112003000002', tutorId: TU.b.id, pesoAtualKg: 12.4 }),
      nina: await an({ nome: 'Nina', grupo: 'PEQUENO', especie: 'GATO', raca: 'Siamês', sexo: 'F', nascimento: iso(now - 3 * 365 * DIA), identificacao: '985112003000003', tutorId: TU.c.id, pesoAtualKg: 4.1 }),
      pipoca: await an({ nome: 'Pipoca', grupo: 'PEQUENO', especie: 'COELHO', raca: 'Mini lop', sexo: 'M', tutorId: TU.c.id, pesoAtualKg: 1.6 }),
      mimosa: await an({ nome: 'Mimosa', grupo: 'GRANDE', especie: 'BOVINO', raca: 'Holandesa', sexo: 'F', nascimento: iso(now - 5 * 365 * DIA), identificacao: 'BR-VV-0101', tutorId: TU.e.id, propriedadeId: PRP.e.id, pesoAtualKg: 560 }),
      estrela: await an({ nome: 'Estrela', grupo: 'GRANDE', especie: 'BOVINO', raca: 'Girolando', sexo: 'F', nascimento: iso(now - 3 * 365 * DIA), identificacao: 'BR-VV-0102', tutorId: TU.e.id, propriedadeId: PRP.e.id, pesoAtualKg: 470 }),
      relampago: await an({ nome: 'Relâmpago', grupo: 'GRANDE', especie: 'EQUINO', raca: 'Quarto de Milha', sexo: 'M', nascimento: iso(now - 8 * 365 * DIA), identificacao: 'BR-HC-0007', tutorId: TU.f.id, propriedadeId: PRP.f.id, pesoAtualKg: 495 }),
      aurora: await an({ nome: 'Aurora', grupo: 'GRANDE', especie: 'EQUINO', raca: 'Mangalarga', sexo: 'F', nascimento: iso(now - 6 * 365 * DIA), identificacao: 'BR-HC-0008', tutorId: TU.f.id, propriedadeId: PRP.f.id, pesoAtualKg: 440 }),
      bolinha: await an({ nome: 'Bolinha', grupo: 'GRANDE', especie: 'OVINO', raca: 'Santa Inês', sexo: 'F', identificacao: 'BR-SB-0301', tutorId: TU.d.id, propriedadeId: PRP.d.id, pesoAtualKg: 52 }),
      cabrito: await an({ nome: 'Fumaça', grupo: 'GRANDE', especie: 'CAPRINO', raca: 'Saanen', sexo: 'M', identificacao: 'BR-SB-0302', tutorId: TU.d.id, propriedadeId: PRP.d.id, pesoAtualKg: 48 }),
    }
    const hv = S.unidades?.vet ?? lista(await api('GET', `${P}/clinicas/unidades?tipo=HOSPITAL_VET`))[0]
    const salasVet = lista(await api('GET', `${P}/clinicas/consultorios?unidadeId=${hv?.id}`))
    if (hv) {
      const bz = async (nome: string, tipo: string, grupo: string, cap: number) => api('POST', `${P}/animal/baias`, { unidadeId: hv.id, nome, tipo, grupo, capacidade: cap })
      const BA = { b1: await bz('Baia 1 (grandes animais)', 'BAIA', 'GRANDE', 1), b2: await bz('Baia 2 (grandes animais)', 'BAIA', 'GRANDE', 1), p1: await bz('Piquete A (reabilitação)', 'PIQUETE', 'GRANDE', 4), p2: await bz('Piquete de observação', 'PIQUETE', 'GRANDE', 3), c1: await bz('Canil 1', 'CANIL', 'PEQUENO', 2), c2: await bz('Canil 2', 'CANIL', 'PEQUENO', 2), g1: await bz('Gatil', 'GATIL', 'PEQUENO', 3), iso: await bz('Isolamento', 'ISOLAMENTO', 'PEQUENO', 1) }
      // escala do hospital: pequenos animais (manhã) e grandes animais (tarde), hoje e próximos dias
      const vetAlunos = (A['Medicina Veterinária'] ?? []).map((a) => a.id)
      const escVet: Record<string, any[]> = { peq: [], gra: [] }
      for (const d of [-3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7].filter(util)) {
        const e1 = await api('POST', `${P}/clinicas/escalas`, { unidadeId: hv.id, programId: C['Medicina Veterinária'].id, supervisorUserId: U['prof.vet'].id, inicio: iso(at(d, d === 0 ? 11 : 7)), fim: iso(at(d, d === 0 ? 23 : 12)), capacidadeSimultanea: 2, alunos: vetAlunos.slice(0, 2), observacao: 'Pequenos animais' })
        const e2 = d === 0 ? null : await api('POST', `${P}/clinicas/escalas`, { unidadeId: hv.id, programId: C['Medicina Veterinária'].id, supervisorUserId: U['prof.vetgrandes'].id, inicio: iso(at(d, 13)), fim: iso(at(d, 18)), capacidadeSimultanea: 2, alunos: vetAlunos.slice(1, 3), observacao: 'Grandes animais' })
        if (e1) escVet.peq.push(e1); if (e2) escVet.gra.push(e2)
        if (d < 0) for (const x of [e1, e2]) if (x) await prisma.cprEscala.update({ where: { id: x.id }, data: { supervisorPresenteEm: new Date() } })
      }
      // internações (grandes e pequenos) com manejo, pesagem e medicamentos
      const medsAlm = (await prisma.supAlmoxarifado.findFirst({ where: { tenantId, codigo: 'ALM-VET' } })) ?? (await prisma.supAlmoxarifado.create({ data: { tenantId, codigo: 'ALM-VET', nome: 'Farmácia Veterinária' } }))
      const itens: Array<[string, string, string, number, number]> = [['VET-001', 'Meloxicam injetável 2% (uso veterinário)', 'FR', 15, 42], ['VET-002', 'Ivermectina 1% injetável', 'FR', 10, 6], ['VET-003', 'Ceftiofur 50 mg/mL', 'FR', 8, 12], ['VET-004', 'Soro fisiológico 0,9% 500 mL', 'UN', 40, 120], ['VET-005', 'Vacina polivalente canina V10', 'DOSE', 30, 18], ['VET-006', 'Vacina antirrábica', 'DOSE', 30, 55]]
      const SI: any[] = []
      for (const [codigo, nome, un, min, saldo] of itens) {
        const it = (await prisma.supItem.findFirst({ where: { tenantId, codigo } })) ?? (await prisma.supItem.create({ data: { tenantId, codigo, nome, unidade: un, estoqueMinimo: min, custoMedio: 20 } }))
        if (!(await prisma.supSaldo.findFirst({ where: { almoxarifadoId: medsAlm.id, itemId: it.id } }))) await prisma.supSaldo.create({ data: { tenantId, almoxarifadoId: medsAlm.id, itemId: it.id, quantidade: saldo } })
        SI.push(it)
      }
      const vg = A['Medicina Veterinária'] ?? []
      const supG = await como(`prof.vetgrandes${DOM}`), supP = await como(`prof.vet${DOM}`)
      const intern = async (sa: Api, animal: any, baia: any, motivo: string, dias: number, supKey: string, aluno?: any) => {
        if (!animal || !baia) return null
        return sa('POST', `${P}/animal/internacoes`, { animalId: animal.id, baiaId: baia.id, motivo, supervisorUserId: U[supKey].id, entradaEm: iso(now - dias * DIA), ...(aluno ? { alunoStudentId: aluno.id } : {}) })
      }
      // as escalas de hoje cobrem a entrada; entradas antigas dispensam aluno
      const i1 = await intern(supG, AN.mimosa, BA.b1, 'Retenção de placenta e metrite pós-parto', 4, 'prof.vetgrandes')
      const i2 = await intern(supG, AN.relampago, BA.p1, 'Claudicação do membro posterior direito (suspeita de laminite)', 6, 'prof.vetgrandes')
      const i3 = await intern(supP, AN.mel, BA.c1, 'Piometra - pós-operatório de ovariohisterectomia', 2, 'prof.vet')
      const i4 = await intern(supP, AN.nina, BA.g1, 'Insuficiência renal crônica - fluidoterapia', 3, 'prof.vet')
      const ms = async (sa: Api, animal: any, body: any) => animal && sa('POST', `${P}/animal/animais/${animal.id}/manejos`, body)
      for (const [d, kg] of [[-60, 540], [-30, 552], [-5, 560]] as const) await ms(supG, AN.mimosa, { tipo: 'PESAGEM', pesoKg: kg, data: iso(now + d * DIA) })
      for (const [d, kg] of [[-70, 455], [-35, 466], [-3, 470]] as const) await ms(supG, AN.estrela, { tipo: 'PESAGEM', pesoKg: kg, data: iso(now + d * DIA) })
      for (const [d, kg] of [[-45, 41], [-20, 46], [-4, 52]] as const) await ms(supG, AN.bolinha, { tipo: 'PESAGEM', pesoKg: kg, data: iso(now + d * DIA) })
      for (const [d, kg] of [[-90, 29], [-30, 30.4], [-2, 31]] as const) await ms(supP, AN.thor, { tipo: 'PESAGEM', pesoKg: kg, data: iso(now + d * DIA) })
      for (const [d, kg] of [[-3, 4.4], [-1, 4.1]] as const) await ms(supP, AN.nina, { tipo: 'PESAGEM', pesoKg: kg, data: iso(now + d * DIA), internacaoId: i4?.id })
      await ms(supG, AN.relampago, { tipo: 'CASCOS', descricao: 'Casqueamento terapêutico e ferrageamento ortopédico.', data: iso(now - 4 * DIA), internacaoId: i2?.id })
      await ms(supG, AN.mimosa, { tipo: 'EVOLUCAO', descricao: 'Melhora do apetite, temperatura 38,6 °C, secreção uterina diminuída.', data: iso(now - DIA), internacaoId: i1?.id })
      await ms(supP, AN.mel, { tipo: 'EVOLUCAO', descricao: 'Ferida cirúrgica limpa, sem edema; alimentando-se bem.', data: iso(now - DIA), internacaoId: i3?.id })
      await ms(supG, AN.bolinha, { tipo: 'EXAME_CLINICO', descricao: 'Avaliação FAMACHA grau 3 - indicado vermifugação seletiva.', data: iso(now - 4 * DIA) })
      const uso = async (sa: Api, animal: any, item: any, q: number, internacao: any, d: number) => animal && item && sa('POST', `${P}/animal/animais/${animal.id}/medicamentos`, { supItemId: item.id, quantidade: q, data: iso(now + d * DIA), ...(internacao ? { internacaoId: internacao.id } : {}) })
      await uso(supG, AN.mimosa, SI[2], 3, i1, -3); await uso(supG, AN.mimosa, SI[0], 2, i1, -2); await uso(supG, AN.relampago, SI[0], 4, i2, -5); await uso(supG, AN.relampago, SI[3], 6, i2, -5); await uso(supP, AN.mel, SI[0], 1, i3, -1); await uso(supP, AN.nina, SI[3], 8, i4, -2); await uso(supG, AN.bolinha, SI[1], 1, null, -4)
      // vacinação e vermifugação (atrasadas, próximas e em dia)
      const pf = async (sa: Api, animal: any, body: any) => animal && sa('POST', `${P}/animal/animais/${animal.id}/profilaxia`, body)
      await pf(supP, AN.thor, { tipo: 'VACINA', produto: 'V10', lote: 'V10-2509', aplicadaEm: iso(now - 358 * DIA), proximaDose: iso(now + 7 * DIA), supItemId: SI[4].id })
      await pf(supP, AN.thor, { tipo: 'VACINA', produto: 'Antirrábica', lote: 'RB-2601', aplicadaEm: iso(now - 200 * DIA), intervaloDias: 365, supItemId: SI[5].id })
      await pf(supP, AN.mel, { tipo: 'VACINA', produto: 'V10', lote: 'V10-2508', aplicadaEm: iso(now - 380 * DIA), proximaDose: iso(now - 15 * DIA), supItemId: SI[4].id })
      await pf(supP, AN.mel, { tipo: 'VERMIFUGO', produto: 'Praziquantel + Pirantel', aplicadaEm: iso(now - 100 * DIA), intervaloDias: 120 })
      await pf(supP, AN.nina, { tipo: 'VACINA', produto: 'Tríplice felina (V4)', aplicadaEm: iso(now - 330 * DIA), proximaDose: iso(now + 4 * DIA) })
      await pf(supG, AN.mimosa, { tipo: 'VACINA', produto: 'Aftosa', aplicadaEm: iso(now - 170 * DIA), intervaloDias: 180 })
      await pf(supG, AN.estrela, { tipo: 'VERMIFUGO', produto: 'Ivermectina 1%', aplicadaEm: iso(now - 118 * DIA), intervaloDias: 120, supItemId: SI[1].id })
      await pf(supG, AN.relampago, { tipo: 'VACINA', produto: 'Influenza equina + tétano', aplicadaEm: iso(now - 190 * DIA), proximaDose: iso(now - 8 * DIA) })
      await pf(supG, AN.aurora, { tipo: 'VACINA', produto: 'Encefalomielite equina', aplicadaEm: iso(now - 300 * DIA), proximaDose: iso(now + 20 * DIA) })
      await pf(supG, AN.bolinha, { tipo: 'VERMIFUGO', produto: 'Monepantel', aplicadaEm: iso(now - 4 * DIA), intervaloDias: 60 })
      // agenda do hospital veterinário (hoje e próximos dias): pequenos de manhã, grandes e campo à tarde
      const salaP1 = salasVet.find((s) => /pequenos animais 1/.test(s.nome)), salaP2 = salasVet.find((s) => /pequenos animais 2/.test(s.nome)), campo = salasVet.find((s) => /campo/i.test(s.nome))
      const vagenda: Array<[number, number, any, any, any, string, string, any, string?]> = [
        [0, 17, salaP1, AN.mel, TU.b, 'RETORNO', 'prof.vet', vg[0], undefined], [0, 18, salaP2, AN.pipoca, TU.c, 'CONSULTA', 'prof.vet', vg[1], undefined],
        [1, 9, salaP1, AN.thor, TU.a, 'VACINACAO', 'prof.vet', vg[0], undefined], [1, 14, campo, AN.estrela, TU.e, 'CONSULTA', 'prof.vetgrandes', vg[1], 'Fazenda Vale Verde - Itapetininga'],
        [2, 10, salaP2, AN.nina, TU.c, 'RETORNO', 'prof.vet', vg[1], undefined], [2, 15, campo, AN.bolinha, TU.d, 'PROCEDIMENTO', 'prof.vetgrandes', vg[2], 'Sítio Boa Esperança - Tatuí'],
        [3, 14, campo, AN.aurora, TU.f, 'CONSULTA', 'prof.vetgrandes', vg[1], 'Haras Colina do Sol - Sarapuí'],
      ]
      for (const [d0, h, sala, animal, tu, cat, sk, aluno, local] of vagenda) {
        const d = d0 === 0 && !util(0) ? -1 : proxUtil(d0)
        if (d < 0) continue
        if (!sala || !animal || !tu) continue
        const ini = d === 0 ? Math.max(at(0, h), now + 20 * MIN) : at(d, h)
        if (d === 0 && ini + 50 * MIN > at(0, 22)) continue
        const c = await api('POST', `${P}/clinicas/agenda`, { unidadeId: hv.id, consultorioId: sala.id, pacienteId: tu.id, animalId: animal.id, supervisorUserId: U[sk].id, ...(aluno ? { alunoStudentId: aluno.id } : {}), inicio: iso(ini), fim: iso(ini + 50 * MIN), categoria: cat, ...(local ? { local } : {}) })
        if (c && d <= 1) await api('POST', `${P}/clinicas/agenda/${c.id}/confirmar`)
      }
      S.hospital = { unidade: hv, baias: BA, animais: AN }
    }
    S.tutores = TU
  }

  // job para materializar lembretes e alertas
  await api('POST', `${P}/jobs/executar`)
  return S
}

// Execução isolada
if (require.main === module) {
  ;(async () => {
    const API = process.env.API_URL || 'http://localhost:3000/api'
    const { prisma } = await import('../../src/lib/prisma')
    const clinic = await prisma.clinic.findFirst({ where: { tenantId: 'sua-instituicao' } })
    if (!clinic) throw new Error('Rode antes o edu-demo-seed (tenant sua-instituicao).')
    const login = async (c: { email: string; password: string }) => {
      const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clinicId: clinic.id, ...c }) })
      const j: any = await r.json()
      if (!r.ok) throw new Error('login: ' + JSON.stringify(j))
      return j.token as string
    }
    const failures: string[] = []
    const token = await login({ email: 'admin@suainstituicao.edu.br', password: 'Demo@2026' })
    const api: Api = async (method, path, body) => {
      const r = await fetch(`${API}${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body !== undefined ? JSON.stringify(body) : undefined })
      const t = await r.text()
      let j: any = null
      try { j = JSON.parse(t) } catch { /* texto */ }
      if (!r.ok) { failures.push(`${method} ${path} -> ${r.status} ${t.slice(0, 160)}`); return null }
      return j
    }
    const bcrypt = (await import('bcryptjs')).default
    const mk = async (email: string, password: string, firstName: string, lastName: string, role: string) => {
      const ex = await prisma.user.findFirst({ where: { clinicId: clinic.id, email } })
      if (ex) return ex
      return prisma.user.create({ data: { clinicId: clinic.id, tenantId: clinic.tenantId, email, password: await bcrypt.hash(password, 10), firstName, lastName, role, isActive: true } as any })
    }
    await seedCamposPratica(api, { tenantId: clinic.tenantId ?? 'sua-instituicao', mk, loginAs: login, failures })
    console.log(failures.length ? `${failures.length} chamadas falharam:\n` + failures.map((f) => ' - ' + f).join('\n') : 'seed de campos de prática concluído')
    await prisma.$disconnect()
  })().catch((e) => { console.error(e); process.exit(1) })
}
