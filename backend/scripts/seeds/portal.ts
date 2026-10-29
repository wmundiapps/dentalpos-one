/**
 * Seed do PORTAL (ambientes de ensino, portal do aluno, portal do professor e sala virtual EAD).
 * Idempotente: se o ambiente GRAD-PRES já tem cursos vinculados, não duplica nada.
 *
 *   import { seedPortal } from './seeds/portal'
 *   const r = await seedPortal(api, { tenantId, clinicId })    // api(method, path, body?) -> JSON ou null em caso de erro (token ADMIN)
 *
 * Cria os logins de demonstração (senha única Demo@2026), cursos/disciplinas/turmas por ambiente, histórico fechado do período
 * anterior (para boletim, histórico e fluxograma), aulas com chamada, materiais/trilhas/aulas ao vivo/atividades, fórum, entregas,
 * financeiro (com parcelas vencidas para 2ª via e acordo), justificativa e processo em andamento, avaliações docentes e consentimentos.
 * Não edita edu-demo-seed.ts: o seed principal (ou o e2e) chama esta função.
 */
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { prisma } from '../../src/lib/prisma'

export type SeedApi = (method: string, path: string, body?: any) => Promise<any>
export interface SeedCtx { tenantId: string; clinicId?: string; failures?: string[]; senha?: string }

export const SENHA_DEMO = 'Demo@2026'
export const LOGINS_DEMO = [
  { perfil: 'Aluno de Graduação Presencial', email: 'aluno.presencial@suainstituicao.edu.br' },
  { perfil: 'Aluno de Graduação EAD', email: 'aluno.ead@suainstituicao.edu.br' },
  { perfil: 'Aluno de Pós-graduação (Lato Sensu presencial + curso livre)', email: 'aluno.pos@suainstituicao.edu.br' },
  { perfil: 'Professor', email: 'professor@suainstituicao.edu.br' },
  { perfil: 'Coordenador', email: 'coordenador@suainstituicao.edu.br' },
] as const

const DAY = 86_400_000
const dia = (n: number) => new Date(Date.now() + n * DAY)
const iso = (n: number) => dia(n).toISOString()
const at = (n: number, h: number, m = 0) => { const d = dia(n); d.setHours(h, m, 0, 0); return d }

export interface ResumoSeedPortal { logins: typeof LOGINS_DEMO; senha: string; ambientes: number; cursos: number; turmas: number; alunos: number; materiais: number; jaExistia: boolean }

export async function seedPortal(api: SeedApi, ctx: SeedCtx): Promise<ResumoSeedPortal> {
  const { tenantId } = ctx
  const senha = ctx.senha || SENHA_DEMO
  const falha = (m: string) => ctx.failures?.push(`seedPortal: ${m}`)
  const r: ResumoSeedPortal = { logins: LOGINS_DEMO, senha, ambientes: 0, cursos: 0, turmas: 0, alunos: 0, materiais: 0, jaExistia: false }

  const clinic = ctx.clinicId ? await prisma.clinic.findUnique({ where: { id: ctx.clinicId } }) : await prisma.clinic.findFirst({ where: { tenantId } })
  if (!clinic) { falha('clínica/tenant não encontrado'); return r }
  const hash = await bcrypt.hash(senha, 10)
  const mkUser = async (email: string, nome: string, sobrenome: string, role: string, comSenha = true) => {
    const ex = await prisma.user.findFirst({ where: { clinicId: clinic.id, email } })
    if (ex) return ex
    return prisma.user.create({ data: { clinicId: clinic.id, tenantId, email, password: comSenha ? hash : await bcrypt.hash(crypto.randomUUID(), 4), firstName: nome, lastName: sobrenome, role, isActive: true } as any })
  }

  // idempotência: ambiente de graduação presencial já populado?
  const amb0 = await prisma.porAmbiente.findFirst({ where: { tenantId, codigo: 'GRAD-PRES' } })
  if (amb0 && await prisma.porAmbienteCurso.count({ where: { ambienteId: amb0.id } })) {
    r.jaExistia = true
    return r
  }

  // ------------------------------------------------------------------ contas
  const prof = await mkUser('professor@suainstituicao.edu.br', 'Marcos', 'Vieira Lopes', 'TEACHER')
  const prof2 = await mkUser('professora.ead@suainstituicao.edu.br', 'Beatriz', 'Nogueira Prado', 'TEACHER')
  await mkUser('coordenador@suainstituicao.edu.br', 'Cláudia', 'Ferraz Monteiro', 'COORDINATOR')
  const uPres = await mkUser('aluno.presencial@suainstituicao.edu.br', 'Rafael', 'Almeida Souza', 'STUDENT')
  const uEad = await mkUser('aluno.ead@suainstituicao.edu.br', 'Juliana', 'Campos Ribeiro', 'STUDENT')
  const uPos = await mkUser('aluno.pos@suainstituicao.edu.br', 'Eduardo', 'Matos Tavares', 'STUDENT')

  // ------------------------------------------------------------------ ambientes
  await api('POST', '/edu/portal2/ambientes/bootstrap', {})
  const ambs = await prisma.porAmbiente.findMany({ where: { tenantId } })
  r.ambientes = ambs.length
  const A = (cod: string) => ambs.find((a) => a.codigo === cod)!.id

  // ------------------------------------------------------------------ períodos
  const termAnt = await api('POST', '/edu/academico/terms', { codigo: `PORTAL-${new Date().getFullYear()}/1`, dataInicio: iso(-250), dataFim: iso(-80) })
  const termAtu = await api('POST', '/edu/academico/terms', { codigo: `PORTAL-${new Date().getFullYear()}/2`, dataInicio: iso(-70), dataFim: iso(50) })
  if (!termAnt || !termAtu) { falha('períodos letivos não criados'); return r }
  await api('POST', '/edu/notas/bootstrap', {})

  // ------------------------------------------------------------------ cursos, matrizes e pré-requisitos
  type Disc = { nome: string; ch: number; periodo: number; pre?: string }
  const cursos: { chave: string; ambiente: string; nome: string; modalidade: string; ch: number; tipoPeriodo: string; porAno: number; discs: Disc[] }[] = [
    { chave: 'adm', ambiente: 'GRAD-PRES', nome: 'Administração (Bacharelado Presencial)', modalidade: 'PRESENCIAL', ch: 3000, tipoPeriodo: 'SEMESTRE', porAno: 2, discs: [
      { nome: 'Fundamentos de Administração', ch: 60, periodo: 1 }, { nome: 'Matemática Aplicada', ch: 60, periodo: 1 }, { nome: 'Comunicação Empresarial', ch: 40, periodo: 1 },
      { nome: 'Contabilidade Geral', ch: 80, periodo: 2, pre: 'Matemática Aplicada' }, { nome: 'Microeconomia', ch: 60, periodo: 2, pre: 'Matemática Aplicada' }, { nome: 'Estatística Aplicada', ch: 60, periodo: 2, pre: 'Matemática Aplicada' },
      { nome: 'Gestão de Pessoas', ch: 60, periodo: 3, pre: 'Fundamentos de Administração' }, { nome: 'Matemática Financeira', ch: 60, periodo: 3, pre: 'Contabilidade Geral' },
      { nome: 'Marketing', ch: 60, periodo: 4, pre: 'Gestão de Pessoas' }, { nome: 'Gestão de Custos', ch: 60, periodo: 4, pre: 'Matemática Financeira' },
    ] },
    { chave: 'ped', ambiente: 'GRAD-EAD', nome: 'Pedagogia (Licenciatura EAD)', modalidade: 'EAD', ch: 3200, tipoPeriodo: 'BIMESTRE', porAno: 6, discs: [
      { nome: 'Introdução à Educação a Distância', ch: 40, periodo: 1 }, { nome: 'Fundamentos da Educação', ch: 60, periodo: 1 },
      { nome: 'Psicologia do Desenvolvimento', ch: 60, periodo: 2, pre: 'Fundamentos da Educação' }, { nome: 'Didática Geral', ch: 60, periodo: 2, pre: 'Fundamentos da Educação' },
      { nome: 'Alfabetização e Letramento', ch: 60, periodo: 3, pre: 'Didática Geral' }, { nome: 'Educação Inclusiva', ch: 40, periodo: 3 },
    ] },
    { chave: 'impl', ambiente: 'LATO-PRES', nome: 'Especialização em Implantodontia (Lato Sensu)', modalidade: 'PRESENCIAL', ch: 600, tipoPeriodo: 'MODULO', porAno: 4, discs: [
      { nome: 'Anatomia Aplicada à Implantodontia', ch: 40, periodo: 1 }, { nome: 'Planejamento Cirúrgico', ch: 40, periodo: 1 },
      { nome: 'Cirurgia de Implantes', ch: 80, periodo: 2, pre: 'Planejamento Cirúrgico' }, { nome: 'Prótese sobre Implantes', ch: 80, periodo: 3, pre: 'Cirurgia de Implantes' },
    ] },
    { chave: 'mba', ambiente: 'LATO-EAD', nome: 'MBA em Gestão de Saúde (Lato Sensu EAD)', modalidade: 'EAD', ch: 420, tipoPeriodo: 'MODULO', porAno: 3, discs: [
      { nome: 'Gestão Estratégica em Saúde', ch: 40, periodo: 1 }, { nome: 'Finanças para Gestores de Saúde', ch: 40, periodo: 2 },
    ] },
    { chave: 'mest', ambiente: 'STRICTO', nome: 'Mestrado em Educação', modalidade: 'PRESENCIAL', ch: 480, tipoPeriodo: 'SEMESTRE', porAno: 2, discs: [
      { nome: 'Metodologia da Pesquisa Científica', ch: 60, periodo: 1 }, { nome: 'Seminário de Dissertação I', ch: 45, periodo: 2, pre: 'Metodologia da Pesquisa Científica' },
    ] },
    { chave: 'livre', ambiente: 'LIVRES', nome: 'Curso Livre de Oratória e Apresentações', modalidade: 'EAD', ch: 40, tipoPeriodo: 'MODULO', porAno: 4, discs: [
      { nome: 'Oratória na Prática', ch: 20, periodo: 1 }, { nome: 'Apresentações de Alto Impacto', ch: 20, periodo: 2 },
    ] },
  ]
  const P: Record<string, { id: string; discs: Record<string, string> }> = {}
  for (const c of cursos) {
    const prog = await api('POST', '/edu/academico/programs', { nome: c.nome, modalidade: c.modalidade, cargaHorariaTotal: c.ch })
    if (!prog) { falha(`curso ${c.nome}`); continue }
    P[c.chave] = { id: prog.id, discs: {} }
    r.cursos++
    for (const d of c.discs) {
      const disc = await api('POST', '/edu/academico/disciplines', { nome: d.nome, cargaHoraria: d.ch, ementa: `Ementa de ${d.nome}.` })
      if (!disc) { falha(`disciplina ${d.nome}`); continue }
      P[c.chave].discs[d.nome] = disc.id
      await api('POST', '/edu/academico/curriculum-links', { programId: prog.id, disciplineId: disc.id, periodo: d.periodo, obrigatoria: true })
    }
    await api('PUT', `/edu/portal2/cursos/${prog.id}/fluxograma-config`, { tipoPeriodo: c.tipoPeriodo, periodosPorAno: c.porAno })
    const itens = c.discs.filter((d) => d.pre).map((d) => ({ disciplineId: P[c.chave].discs[d.nome], requisitoDisciplineId: P[c.chave].discs[d.pre!] })).filter((i) => i.disciplineId && i.requisitoDisciplineId)
    if (itens.length) await api('PUT', `/edu/portal2/cursos/${prog.id}/pre-requisitos`, { itens })
    const amb = c.ambiente
    const atuais = (await prisma.porAmbienteCurso.findMany({ where: { ambienteId: A(amb) } })).map((x) => x.programId)
    await api('PUT', `/edu/portal2/ambientes/${A(amb)}/cursos`, { programIds: [...atuais, prog.id] })
  }

  // ------------------------------------------------------------------ alunos
  const mkAluno = async (user: any, ra: string, nome: string, cpf: string) => {
    const ex = await prisma.student.findUnique({ where: { userId: user.id } })
    if (ex) return ex
    return prisma.student.create({ data: { tenantId, userId: user.id, ra, nomeCompleto: nome, cpf, dataNascimento: new Date('2001-05-14') } })
  }
  const suf = Math.random().toString(36).slice(2, 5).toUpperCase()
  const sPres = await mkAluno(uPres, `PRT${suf}01`, 'Rafael Almeida Souza', '39053344705')
  const sEad = await mkAluno(uEad, `PRT${suf}02`, 'Juliana Campos Ribeiro', '52998224725')
  const sPos = await mkAluno(uPos, `PRT${suf}03`, 'Eduardo Matos Tavares', '11144477735')
  const colegas: any[] = []
  const nomesCol = ['Ana Beatriz Lima', 'Bruno Carvalho Dias', 'Camila Teixeira Rocha', 'Diego Fernandes Melo', 'Elisa Barbosa Nunes', 'Felipe Araújo Castro', 'Gabriela Moreira Pinto', 'Henrique Duarte Gomes']
  for (const [i, n] of nomesCol.entries()) {
    const u = await mkUser(`colega${i + 1}.${suf.toLowerCase()}@suainstituicao.edu.br`, n.split(' ')[0], n.split(' ').slice(1).join(' '), 'STUDENT', false)
    colegas.push(await mkAluno(u, `PRC${suf}${String(i).padStart(2, '0')}`, n, ''))
  }
  r.alunos = 3 + colegas.length

  // ------------------------------------------------------------------ turmas, matrículas, notas do período anterior (fechado)
  type Alun = { s: any; enrollmentId?: string; perfil: 'bom' | 'medio' | 'risco' | 'reprova' }
  const roster: Record<string, Alun[]> = {
    adm: [{ s: sPres, perfil: 'bom' }, ...colegas.slice(0, 5).map((s, i) => ({ s, perfil: (['medio', 'bom', 'risco', 'medio', 'risco'] as const)[i] }))],
    ped: [{ s: sEad, perfil: 'bom' }, ...colegas.slice(3, 7).map((s, i) => ({ s, perfil: (['medio', 'risco', 'bom', 'medio'] as const)[i] }))],
    impl: [{ s: sPos, perfil: 'bom' }, ...colegas.slice(6, 8).map((s) => ({ s, perfil: 'medio' as const }))],
    livre: [{ s: sPos, perfil: 'bom' }, colegas[0] && { s: colegas[0], perfil: 'medio' as const }].filter(Boolean) as Alun[],
  }
  const profDe: Record<string, any> = { adm: prof, ped: prof2, impl: prof, livre: prof2 }
  for (const [chave, alunos] of Object.entries(roster)) {
    for (const a of alunos) {
      const en = await api('POST', '/edu/academico/enrollments', { studentId: a.s.id, programId: P[chave].id, termId: termAtu.id })
      a.enrollmentId = en?.id
    }
  }
  const plano: Record<string, { ant: number[]; atu: number[] }> = { adm: { ant: [1, 2], atu: [3] }, ped: { ant: [1], atu: [2] }, impl: { ant: [1], atu: [2] }, livre: { ant: [], atu: [1] } }
  const secsAtuais: Record<string, any[]> = {}
  let seed = 7
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 }
  const notaPor = (perfil: string, reprovaEsta: boolean) => reprovaEsta ? 1.5 + rnd() * 1.5 : perfil === 'bom' ? 7.8 + rnd() * 2 : perfil === 'medio' ? 6.6 + rnd() * 1.8 : 5.2 + rnd() * 1.6
  for (const c of cursos) {
    const ch = c.chave; const pl = plano[ch]; if (!pl || !P[ch]) continue
    secsAtuais[ch] = []
    for (const [periodo, term, fechada] of [...pl.ant.map((p) => [p, termAnt, true] as const), ...pl.atu.map((p) => [p, termAtu, false] as const)]) {
      for (const d of c.discs.filter((x) => x.periodo === periodo)) {
        const sec = await api('POST', '/edu/academico/class-sections', { disciplineId: P[ch].discs[d.nome], termId: term.id, professorUserId: profDe[ch].id, nome: `${ch.toUpperCase()}-${d.nome.split(' ')[0].slice(0, 3).toUpperCase()}-${fechada ? 'ANT' : 'ATU'}`, vagas: 40 })
        if (!sec) { falha(`turma ${d.nome}`); continue }
        r.turmas++
        const alunos = roster[ch]
        for (const a of alunos) {
          if (!a.enrollmentId) continue
          if (fechada && a.s.id !== sPres.id && a.s.id !== sEad.id && a.s.id !== sPos.id && periodo > 1 && a.perfil === 'risco') continue
          await prisma.classSectionEnrollment.create({ data: { enrollmentId: a.enrollmentId, classSectionId: sec.id } }).catch(() => null)
        }
        if (fechada) {
          const ap = await api('POST', `/edu/notas/turmas/${sec.id}/componentes/aplicar-regra`, {})
          const comps: any[] = ap?.componentes ?? []
          const reprovaDisc = ch === 'adm' && periodo === 2 && d.nome === 'Estatística Aplicada'   // reprovação do Rafael para o fluxograma
          // sessões realizadas + presença
          for (let k = 0; k < 8; k++) {
            const s = await prisma.classSession.create({ data: { classSectionId: sec.id, tipo: 'TEORICA', titulo: `Aula ${k + 1} — ${d.nome}`, dataHoraInicio: at(-200 + k * 7, 19), dataHoraFim: at(-200 + k * 7, 21), local: 'Sala 101', status: 'REALIZADA' } })
            for (const a of alunos) await prisma.attendance.create({ data: { classSessionId: s.id, studentId: a.s.id, presente: !(a.perfil === 'risco' && k % 3 === 0) } }).catch(() => null)
          }
          const lote: any[] = []
          for (const a of alunos) for (const comp of comps) lote.push({ studentId: a.s.id, codigo: comp.codigo, valor: Math.round(Math.min(10, notaPor(a.perfil, reprovaDisc && a.s.id === sPres.id)) * 10) / 10 })
          if (lote.length) {
            const rr = await api('PUT', `/edu/notas/turmas/${sec.id}/notas`, { notas: lote })
            if (!rr) await api('POST', `/edu/notas/turmas/${sec.id}/notas/corrigir`, { correcoes: lote, motivo: 'Lançamento inicial da demonstração' })
          }
          await api('POST', `/edu/notas/turmas/${sec.id}/fechar`, { forcar: true, justificativa: 'Fechamento do período anterior (dados de demonstração).' })
        } else {
          secsAtuais[ch].push({ ...sec, disciplina: d.nome })
          const ap = await api('POST', `/edu/notas/turmas/${sec.id}/componentes/aplicar-regra`, {})
          const comps: any[] = ap?.componentes ?? []
          const lote: any[] = []
          for (const a of alunos) for (const comp of comps.slice(0, 1)) lote.push({ studentId: a.s.id, codigo: comp.codigo, valor: Math.round(Math.min(10, notaPor(a.perfil, false)) * 10) / 10 })
          if (lote.length) await api('PUT', `/edu/notas/turmas/${sec.id}/notas`, { notas: lote })
          // aulas realizadas (com chamada) e agendadas
          for (let k = 0; k < 8; k++) {
            const s = await prisma.classSession.create({ data: { classSectionId: sec.id, tipo: 'TEORICA', titulo: `Aula ${k + 1} — ${d.nome}`, dataHoraInicio: at(-56 + k * 7, 19), dataHoraFim: at(-56 + k * 7, 21), local: c.modalidade === 'EAD' ? 'Online' : 'Sala 102', status: 'REALIZADA' } })
            for (const a of alunos) {
              const falta = (a.s.id === sPres.id && (k === 6 || k === 7)) || (a.perfil === 'risco' && k % 2 === 1)
              await prisma.attendance.create({ data: { classSessionId: s.id, studentId: a.s.id, presente: !falta } }).catch(() => null)
            }
          }
          for (let k = 0; k < 4; k++) await prisma.classSession.create({ data: { classSectionId: sec.id, tipo: 'TEORICA', titulo: `Aula ${9 + k} — ${d.nome}`, dataHoraInicio: k === 0 ? new Date(Date.now() - 30 * 60_000) : at(k * 3, 19), dataHoraFim: k === 0 ? new Date(Date.now() + 90 * 60_000) : at(k * 3, 21), local: c.modalidade === 'EAD' ? 'Online' : 'Sala 102', status: 'AGENDADA' } })
          await api('POST', `/edu/notas/turmas/${sec.id}/recalcular`, {})
        }
      }
    }
  }

  // ------------------------------------------------------------------ materiais, trilhas, aulas, atividades, fórum, recados
  const alunosDe = (ch: string) => roster[ch]
  for (const ch of ['adm', 'ped', 'impl', 'livre']) {
    for (const sec of secsAtuais[ch] ?? []) {
      const base = `/edu/portal2/turmas/${sec.id}`
      const ead = ch === 'ped' || ch === 'livre'
      const mats: any[] = [
        { tipo: 'TEXTO', trilha: 'Unidade 1 — Primeiros passos', ordem: 1, titulo: `Apresentação da disciplina ${sec.disciplina}`, conteudo: `Bem-vindo(a)! Nesta disciplina vamos trabalhar ${sec.disciplina} com leituras, vídeos e atividades. Consulte o plano de ensino e o calendário de avaliações.` },
        { tipo: 'ARQUIVO', trilha: 'Unidade 1 — Primeiros passos', ordem: 2, titulo: 'Plano de ensino (PDF)', url: 'https://exemplo.edu.br/materiais/plano-de-ensino.pdf', arquivoNome: 'plano-de-ensino.pdf' },
        { tipo: 'VIDEO', trilha: 'Unidade 1 — Primeiros passos', ordem: 3, titulo: 'Vídeo introdutório', url: 'https://exemplo.edu.br/videos/introducao', duracaoMin: 12 },
        { tipo: 'LINK', trilha: 'Unidade 2 — Aprofundamento', ordem: 1, titulo: 'Leitura complementar (biblioteca digital)', url: 'https://exemplo.edu.br/biblioteca/leitura-complementar' },
        { tipo: 'ATIVIDADE', trilha: 'Unidade 2 — Aprofundamento', ordem: 2, titulo: 'Estudo dirigido 1', descricao: 'Responda às questões do estudo dirigido e envie o arquivo ou o texto.', aceitaEntrega: true, prazoEntrega: iso(6), notaMaxima: 10 },
        { tipo: 'ATIVIDADE', trilha: 'Unidade 1 — Primeiros passos', ordem: 4, titulo: 'Questionário de nivelamento', descricao: 'Atividade diagnóstica (prazo encerrado).', aceitaEntrega: true, prazoEntrega: iso(-5), notaMaxima: 10 },
      ]
      if (ead) mats.push(
        { tipo: 'AULA_GRAVADA', trilha: 'Aulas gravadas', ordem: 1, titulo: 'Aula 1 — Conceitos fundamentais', url: 'https://exemplo.edu.br/aulas/1', duracaoMin: 48 },
        { tipo: 'AULA_GRAVADA', trilha: 'Aulas gravadas', ordem: 2, titulo: 'Aula 2 — Estudo de casos', url: 'https://exemplo.edu.br/aulas/2', duracaoMin: 52 },
        { tipo: 'AULA_AO_VIVO', trilha: 'Encontros ao vivo', ordem: 1, titulo: 'Webconferência: tira-dúvidas', url: 'https://meet.exemplo.edu.br/sala-tira-duvidas', inicioEm: at(2, 20).toISOString(), duracaoMin: 90 },
      )
      const ids: string[] = []
      for (const m of mats) { const x = await api('POST', `${base}/materiais`, m); if (x) { ids.push(x.id); r.materiais++ } else falha(`material ${m.titulo}`) }
      const forum = await api('POST', `${base}/forum`, { titulo: 'Dúvidas sobre o plano de ensino', corpo: 'Use este espaço para tirar dúvidas gerais da disciplina.', fixado: true })
      if (forum) await api('POST', `/edu/portal2/forum/${forum.id}/respostas`, { corpo: 'Professor, o estudo dirigido pode ser entregue em grupo?' })
      await api('POST', `${base}/recados`, { titulo: 'Bem-vindos ao período', mensagem: 'Pessoal, o material da primeira unidade já está disponível. Qualquer dúvida usem o fórum.', fixado: true })
      // progresso/entregas do aluno de demonstração
      const alvo = alunosDe(ch)[0]?.s
      if (alvo && ids.length) {
        const tenant = tenantId
        await prisma.porProgresso.createMany({ data: ids.slice(0, 3).map((materialId) => ({ tenantId: tenant, materialId, classSectionId: sec.id, studentId: alvo.id, concluido: true, percentual: 100, acessos: 2 })), skipDuplicates: true })
        const nivel = await prisma.porMaterial.findFirst({ where: { tenantId, classSectionId: sec.id, titulo: 'Questionário de nivelamento' } })
        if (nivel) await prisma.porEntrega.create({ data: { tenantId, materialId: nivel.id, classSectionId: sec.id, studentId: alvo.id, texto: 'Respostas do questionário enviadas.', status: 'CORRIGIDA', nota: 8.5, feedback: 'Bom trabalho! Atenção à questão 3.', corrigidaEm: new Date(), corrigidaPor: profDe[ch].id } as any }).catch(() => null)
        await prisma.porAcesso.createMany({ data: [0, 1, 3].map((n) => ({ tenantId, studentId: alvo.id, classSectionId: sec.id, tipo: 'SALA', createdAt: dia(-n) })) })
      }
      // um colega entregou a atividade atual (fica para o professor corrigir)
      const atv = await prisma.porMaterial.findFirst({ where: { tenantId, classSectionId: sec.id, titulo: 'Estudo dirigido 1' } })
      const col = alunosDe(ch)[1]?.s
      if (atv && col) await prisma.porEntrega.create({ data: { tenantId, materialId: atv.id, classSectionId: sec.id, studentId: col.id, texto: 'Segue a resolução do estudo dirigido.', status: 'ENVIADA' } as any }).catch(() => null)
    }
  }

  // ------------------------------------------------------------------ financeiro (parcelas pagas, a vencer e vencidas)
  for (const [s, atrasadas] of [[sPres, 2], [sEad, 0], [sPos, 1]] as const) {
    for (let i = 0; i < 6; i++) {
      const venc = dia(-75 + i * 30)
      const paga = i < 3 - atrasadas
      const pend = !paga
      await prisma.accountReceivable.create({ data: { tenantId, studentId: s.id, descricao: `Mensalidade ${i + 1}/6`, numeroParcela: i + 1, valor: s.id === sPos.id ? 890 : s.id === sEad.id ? 349.9 : 1180, dataVencimento: venc, dataPagamento: paga ? new Date(venc.getTime() - 2 * DAY) : null, status: paga ? 'PAGO' : venc < new Date() ? 'ATRASADO' : 'PENDENTE' } as any })
      void pend
    }
  }

  // ------------------------------------------------------------------ pendências do aluno presencial, privacidade, docente
  const falta1 = await prisma.attendance.count({ where: { studentId: sPres.id, presente: false } })
  if (falta1) await prisma.porJustificativa.create({ data: { tenantId, studentId: sPres.id, classSectionId: secsAtuais.adm?.[0]?.id, dataInicio: at(-15, 0), dataFim: at(-8, 0), motivo: 'Atestado médico — consulta e repouso de 2 dias.', anexoNome: 'atestado.pdf', prazoEm: dia(3) } })
  const proc = await prisma.porProcesso.create({ data: { tenantId, numero: `PI-${new Date().getFullYear()}/90001`, studentId: sPres.id, tipo: 'APROVEITAMENTO', justificativa: 'Cursei Contabilidade Básica em outra instituição.', dados: { disciplinaDestinoId: P.adm?.discs['Gestão de Custos'], disciplinaOrigem: 'Contabilidade Básica', instituicaoOrigem: 'Faculdade Horizonte', cargaHorariaOrigem: 60, notaOrigem: 8.2 }, status: 'EM_ANALISE', prazoEm: dia(9) } })
  const etapas = [['Conferência de documentos', 'Secretaria', 'CONCLUIDA'], ['Análise de equivalência', 'Coordenação', 'EM_ANDAMENTO'], ['Lançamento no histórico', 'Secretaria', 'PENDENTE']]
  await prisma.porProcessoEtapa.createMany({ data: etapas.map(([nome, setor, status], i) => ({ tenantId, processoId: proc.id, ordem: i + 1, nome, setor, status, concluidaEm: status === 'CONCLUIDA' ? dia(-3) : null })) })
  await prisma.porProcessoEvento.createMany({ data: [{ tenantId, processoId: proc.id, tipo: 'ABERTURA', texto: 'Processo aberto pelo aluno.', autorNome: sPres.nomeCompleto }, { tenantId, processoId: proc.id, tipo: 'ETAPA', texto: 'Etapa "Conferência de documentos": concluída — ementa e histórico conferidos.', autorNome: 'Secretaria' }] })
  for (const [u, s] of [[uPres, sPres], [uEad, sEad]] as const) {
    await prisma.porConsentimento.createMany({ data: [{ tenantId, userId: u.id, studentId: s.id, finalidade: 'COMUNICACAO_EMAIL', concedido: true, baseLegal: 'Consentimento (art. 7º, I)', historico: [{ em: iso(-40), concedido: true, origem: 'MATRICULA' }] as any }, { tenantId, userId: u.id, studentId: s.id, finalidade: 'MARKETING', concedido: false, historico: [{ em: iso(-40), concedido: false, origem: 'MATRICULA' }] as any }], skipDuplicates: true })
  }
  for (const ch of ['adm', 'ped']) {
    const sec = secsAtuais[ch]?.[0]
    if (!sec) continue
    const nots = [[5, 5, 4, 4, 5], [4, 5, 5, 4, 4], [5, 4, 4, 3, 5], [4, 4, 5, 5, 5]]
    for (const [i, a] of alunosDe(ch).slice(0, 4).entries()) {
      const n = nots[i]; const notas = { dominio: n[0], didatica: n[1], pontualidade: n[2], feedback: n[3], respeito: n[4] }
      await prisma.porAvaliacaoDocente.create({ data: { tenantId, classSectionId: sec.id, professorUserId: profDe[ch].id, studentId: a.s.id === sPres.id || a.s.id === sEad.id ? colegas[i + 1].id : a.s.id, notas, media: n.reduce((x, y) => x + y, 0) / 5, comentario: i === 0 ? 'Explica muito bem e traz exemplos reais.' : null } }).catch(() => null)
    }
  }
  await prisma.porProfessorPerfil.upsert({ where: { tenantId_userId: { tenantId, userId: prof.id } }, update: {}, create: { tenantId, userId: prof.id, regime: 'PARCIAL', cargaContratualHoras: 20, titulacao: 'Mestre em Administração' } })
  await prisma.porDisponibilidade.createMany({ data: [1, 2, 3, 4].map((d) => ({ tenantId, userId: prof.id, diaSemana: d, inicioMin: 18 * 60, fimMin: 22 * 60, tipo: 'DISPONIVEL' })) })
  return r
}
