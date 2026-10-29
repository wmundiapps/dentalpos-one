/**
 * Seed de demonstração do ACADÊMICO AVANÇADO (EduMaster Pro): perfis de alunos (inclusive NEE), matrículas estendidas, contratos, documentos,
 * matrizes curriculares com pré-requisitos (graduação seriada, pós modular, curso livre), turnos/salas/horários, programas de desenvolvimento
 * (preparatórios ENADE/OAB/ENAMED/mestrado/doutorado, mentoria, competências), avaliações globais, orientações, ligas, centros acadêmicos,
 * extramuros e horas complementares. Usa SOMENTE a API (token ADMIN) e aproveita os alunos/cursos/turmas/espaços já existentes (edu-demo-seed).
 *
 *   import { seedAcademico2 } from './seeds/academico2'
 *   await seedAcademico2(api, ctx)    // api(method, path, body?) -> corpo JSON ou null em caso de erro
 *
 * Dados fictícios. Idempotente na medida do possível (rodar em banco limpo para melhor resultado).
 */
export type SeedApi = (method: string, path: string, body?: any) => Promise<any>
export interface SeedCtx { tenantId?: string; failures?: string[] }

const A = '/edu/academico'
const D = '/edu/desenvolvimento'
const DAY = 86_400_000
const dia = (n: number) => new Date(Date.now() + n * DAY).toISOString()
const ymd = (n: number) => dia(n).slice(0, 10)
const lst = (r: any): any[] => (Array.isArray(r) ? r : r?.items ?? [])

export interface ResumoSeedAcademico2 { perfis: number; contratos: number; matrizes: number; alocacoes: number; programas: number; avaliacoes: number; orientacoes: number; ligas: number }

export async function seedAcademico2(api: SeedApi, ctx: SeedCtx = {}): Promise<ResumoSeedAcademico2> {
  const falha = (m: string) => ctx.failures?.push(`seedAcademico2: ${m}`)
  const ok = <T,>(x: T | null | undefined, tag: string): T => { if (!x) falha(tag); return x as T }
  const r: ResumoSeedAcademico2 = { perfis: 0, contratos: 0, matrizes: 0, alocacoes: 0, programas: 0, avaliacoes: 0, orientacoes: 0, ligas: 0 }

  // ---------------------------------------------------------------- base existente
  let programs = lst(await api('GET', `${A}/programs`))
  let terms = lst(await api('GET', `${A}/terms`))
  const students = lst(await api('GET', `${A}/students?pageSize=100`))
  const sections = lst(await api('GET', `${A}/class-sections`))
  if (!programs.length) { const p = await api('POST', `${A}/programs`, { nome: 'Odontologia', modalidade: 'PRESENCIAL', cargaHorariaTotal: 4200 }); if (p) programs = [p] }
  if (!terms.length) { const t = await api('POST', `${A}/terms`, { codigo: '2026/2', dataInicio: '2026-08-03', dataFim: '2026-12-18' }); if (t) terms = [t] }
  if (!programs.length || !terms.length || !students.length) { falha('base acadêmica ausente (rode antes o seed principal)'); return r }
  const term = terms.find((t: any) => t.codigo === '2026/2') ?? terms[0]
  const progOdonto = programs.find((p: any) => /odont/i.test(p.nome)) ?? programs[0]
  const profId = sections[0]?.professorUserId as string | undefined

  // ---------------------------------------------------------------- perfis, matrícula estendida, contratos e documentos
  const polos = lst(await api('GET', '/edu/modalidades/polos'))
  const NEE = [['DEFICIENCIA_VISUAL', 'CONSENTIMENTO'], ['TEA', 'TUTELA_SAUDE'], ['DISLEXIA', 'CONSENTIMENTO']]
  const turnos = ['NOITE', 'MANHA', 'NOITE', 'TARDE']
  const status = ['CURSANDO', 'CURSANDO', 'CURSANDO', 'FORMANDO', 'CURSANDO', 'TRANCADO']
  const lim = students.slice(0, 40)
  for (let i = 0; i < lim.length; i++) {
    const s = lim[i]
    const primeiro = String(s.nomeCompleto).split(' ')[0].toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')
    const nee = i % 9 === 4 ? NEE[((i / 9) | 0) % 3] : null
    const p = await api('PUT', `${A}/alunos/${s.id}/perfil`, {
      email: `${primeiro}.${s.ra}@aluno.example`, telefone: `(11) 9${String(8000 + i * 37).slice(0, 4)}-${String(1000 + i * 53).slice(-4)}`, rg: `${20 + i}.${300 + i}.${100 + i}-${i % 10}`, rgOrgao: 'SSP/SP', sexo: i % 2 ? 'F' : 'M', cidade: 'São Paulo', uf: 'SP',
      ...(polos.length && i % 5 === 0 ? { poloId: polos[0].id } : {}), ...(nee ? { nee: true, neeCategoria: nee[0], neeBaseLegal: nee[1] } : {}),
    })
    if (p) r.perfis++
    const ens = (await api('GET', `${A}/alunos/${s.id}/ficha`))?.matriculas ?? []
    for (const m of ens) await api('PUT', `${A}/matriculas/${m.id}/ext`, { numero: `M${s.ra}`, turno: turnos[i % 4], ingresso: i % 7 === 0 ? 'TRANSFERENCIA' : i % 3 === 0 ? 'ENEM' : 'VESTIBULAR', matriculaNova: i % 3 === 0, statusCurso: status[i % 6], periodoAtual: 1 + (i % 4) })
    const stt = ['ASSINADO', 'ASSINADO', 'ASSINADO', 'PENDENTE_ASSINATURA', 'ASSINADO', 'RESCINDIDO'][i % 6]
    const c = await api('POST', `${A}/alunos/${s.id}/contratos`, { enrollmentId: ens[0]?.id, status: stt, valorMensalidade: [1890, 2150, 980, 3400][i % 4], parcelas: 6, diaVencimento: [5, 10, 15][i % 3], descontoPercent: i % 8 === 0 ? 20 : 0, vigenciaInicio: ymd(-60), vigenciaFim: ymd(120) })
    if (c) r.contratos++
    for (const tipo of ['RG', 'CPF', 'HISTORICO_ESCOLAR', 'COMPROVANTE_RESIDENCIA']) await api('POST', `${A}/alunos/${s.id}/documentos`, { tipo, status: i % 6 === 2 && tipo === 'HISTORICO_ESCOLAR' ? 'PENDENTE' : i % 9 === 1 && tipo === 'COMPROVANTE_RESIDENCIA' ? 'REJEITADO' : 'VALIDADO' })
  }

  // ---------------------------------------------------------------- cursos de pós e livre
  const posC = ok(await api('POST', `${A}/programs`, { nome: 'Especialização em Endodontia (pós-graduação lato sensu)', modalidade: 'PRESENCIAL', cargaHorariaTotal: 360 }), 'curso pós')
  const livre = ok(await api('POST', `${A}/programs`, { nome: 'Curso Livre — Inglês Instrumental para a Saúde', modalidade: 'EAD', cargaHorariaTotal: 60 }), 'curso livre')
  if (posC) await api('PUT', `${A}/cursos/${posC.id}/perfil`, { nivel: 'POS_LATO', regime: 'MODULAR', turnos: ['FIM_DE_SEMANA'], duracaoPeriodos: 6 })
  if (livre) await api('PUT', `${A}/cursos/${livre.id}/perfil`, { nivel: 'LIVRE', regime: 'BIMESTRAL', turnos: ['NOITE'], duracaoPeriodos: 2 })
  await api('PUT', `${A}/cursos/${progOdonto.id}/perfil`, { nivel: 'GRADUACAO', regime: 'SERIADO_SEMESTRAL', turnos: ['MANHA', 'NOITE'], duracaoPeriodos: 10 })

  // ---------------------------------------------------------------- matrizes
  const disc = async (nome: string, ch: number) => ok(await api('POST', `${A}/disciplines`, { nome, cargaHoraria: ch, ementa: `Ementa de ${nome}.` }), `disciplina ${nome}`)
  const montar = async (programId: string, nome: string, regime: string, tipo: string, periodos: Array<Array<[string, number, string?]>>, compMin = 0) => {
    const m = ok(await api('POST', `${A}/matrizes`, { programId, nome, versao: '2026.1', regime, horasComplementaresMin: compMin }), `matriz ${nome}`)
    if (!m) return null
    const itens: Record<string, any> = {}
    for (let pi = 0; pi < periodos.length; pi++) {
      const per = ok(await api('POST', `${A}/matrizes/${m.id}/periodos`, { tipo, ordem: pi + 1 }), 'período')
      for (const [nm, ch, t] of periodos[pi]) {
        const d = await disc(nm, ch)
        if (d && per) itens[nm] = await api('POST', `${A}/matrizes/${m.id}/itens`, { periodoId: per.id, disciplineId: d.id, tipo: t ?? 'OBRIGATORIA', cargaHoraria: ch, creditos: Math.round(ch / 20) })
      }
    }
    return { m, itens }
  }
  const odo = await montar(progOdonto.id, 'Matriz Odontologia 2026.1', 'SERIADO_SEMESTRAL', 'SEMESTRE', [
    [['Anatomia Geral Aca', 80], ['Histologia Geral Aca', 60], ['Bioquímica Aca', 60]],
    [['Anatomia Dental Aca', 80], ['Fisiologia Aca', 60], ['Microbiologia Aca', 60]],
    [['Dentística I Aca', 80], ['Periodontia I Aca', 60], ['Farmacologia Aca', 60]],
    [['Dentística II Aca', 80], ['Endodontia I Aca', 80], ['Optativa: Odontologia Digital Aca', 40, 'OPTATIVA']],
  ], 200)
  if (odo) {
    const I = odo.itens
    const pre = async (a: string, b: string) => { if (I[a] && I[b]) await api('POST', `${A}/matrizes/${odo.m.id}/prerequisitos`, { itemId: I[a].id, requisitoItemId: I[b].id, tipo: 'PRE' }) }
    await pre('Anatomia Dental Aca', 'Anatomia Geral Aca'); await pre('Fisiologia Aca', 'Bioquímica Aca'); await pre('Dentística I Aca', 'Anatomia Dental Aca')
    await pre('Periodontia I Aca', 'Microbiologia Aca'); await pre('Dentística II Aca', 'Dentística I Aca'); await pre('Endodontia I Aca', 'Dentística I Aca')
    if (I['Endodontia I Aca']) await api('POST', `${A}/matrizes/${odo.m.id}/prerequisitos`, { itemId: I['Endodontia I Aca'].id, tipo: 'CARGA_MIN', cargaMinima: 300 })
    if (await api('POST', `${A}/matrizes/${odo.m.id}/publicar`, {})) r.matrizes++
  }
  if (posC) {
    const pos = await montar(posC.id, 'Matriz Endodontia (modular)', 'MODULAR', 'MODULO', [
      [['Módulo 1 — Anatomia e Acesso Endodôntico', 60]], [['Módulo 2 — Instrumentação e Irrigação', 60]], [['Módulo 3 — Obturação e Retratamento', 60]], [['Módulo 4 — Cirurgia Parendodôntica', 60]], [['Módulo 5 — Clínica Supervisionada', 120]],
    ], 20)
    if (pos) {
      const nomes = Object.keys(pos.itens)
      for (let i = 1; i < nomes.length - 1; i++) await api('POST', `${A}/matrizes/${pos.m.id}/prerequisitos`, { itemId: pos.itens[nomes[i]].id, requisitoItemId: pos.itens[nomes[i - 1]].id, tipo: 'PRE' })
      if (await api('POST', `${A}/matrizes/${pos.m.id}/publicar`, {})) r.matrizes++
    }
  }
  if (livre) {
    const lv = await montar(livre.id, 'Matriz Inglês Instrumental (bimestral)', 'BIMESTRAL', 'BIMESTRE', [[['Inglês Instrumental I — Leitura Técnica', 30]], [['Inglês Instrumental II — Redação Científica', 30]]])
    if (lv) { const n = Object.keys(lv.itens); await api('POST', `${A}/matrizes/${lv.m.id}/prerequisitos`, { itemId: lv.itens[n[1]].id, requisitoItemId: lv.itens[n[0]].id, tipo: 'PRE' }); if (await api('POST', `${A}/matrizes/${lv.m.id}/publicar`, {})) r.matrizes++ }
  }

  // ---------------------------------------------------------------- turnos, perfis de turma e alocação de salas
  for (const t of [['MANHA', 'Manhã', 450, 720, [1, 2, 3, 4, 5]], ['TARDE', 'Tarde', 810, 1080, [1, 2, 3, 4, 5]], ['NOITE', 'Noite', 1140, 1360, [1, 2, 3, 4, 5]], ['FIM_DE_SEMANA', 'Finais de semana', 480, 1080, [6, 7]]] as const)
    await api('PUT', `${A}/salas/turnos/${t[0]}`, { nome: t[1], inicioMin: t[2], fimMin: t[3], dias: t[4] })
  const secOdo = sections.filter((s: any) => s.termId === term.id).slice(0, 4)
  for (const s of secOdo) await api('PUT', `${A}/salas/turmas/${s.id}/perfil`, { nivel: 'GRADUACAO', turno: 'NOITE', programId: progOdonto.id, recursosExigidos: /anat|hist/i.test(s.discipline?.nome ?? '') ? [] : [] })
  const mkSec = async (programId: string | undefined, nome: string, ch: number, sigla: string, nivel: string, turno: string, alunos: number, recursos: string[]) => {
    if (!profId) return null
    const d = ok(await api('POST', `${A}/disciplines`, { nome, cargaHoraria: ch }), `disciplina ${nome}`)
    if (!d) return null
    const s = ok(await api('POST', `${A}/class-sections`, { disciplineId: d.id, termId: term.id, professorUserId: profId, nome: sigla, vagas: alunos }), `turma ${sigla}`)
    if (s) await api('PUT', `${A}/salas/turmas/${s.id}/perfil`, { nivel, turno, programId, alunosEstimados: alunos, recursosExigidos: recursos })
    return s
  }
  const sPos = await mkSec(posC?.id, 'Endodontia — Módulo 1 (turma 2026)', 60, 'ENDO-M1-FDS', 'POS', 'FIM_DE_SEMANA', 20, ['Projetor'])
  const sLivre = await mkSec(livre?.id, 'Inglês Instrumental I (turma noite)', 30, 'ING-I-NOITE', 'LIVRE', 'NOITE', 30, [])
  const sTarde = await mkSec(progOdonto.id, 'Prática Laboratorial de Anatomia (tarde)', 60, 'ODO-LAB-T', 'GRADUACAO', 'TARDE', 24, ['Bancadas'])
  for (const s of [sPos, sLivre, sTarde, ...secOdo]) {
    if (!s) continue
    const sug = await api('POST', `${A}/salas/sugerir`, { termId: term.id, classSectionId: s.id, duracaoMin: 100, limite: 3 })
    const top = lst(sug?.sugestoes)[0]
    if (top && (await api('POST', `${A}/salas/alocar`, { termId: term.id, classSectionId: s.id, spaceId: top.spaceId, diaSemana: top.diaSemana, inicioMin: top.inicioMin, fimMin: top.fimMin }))) r.alocacoes++
  }

  // ---------------------------------------------------------------- programas de desenvolvimento
  await api('POST', `${D}/competencias/bootstrap`, {})
  await api('POST', '/edu/desempenho/bootstrap', {})
  const exames = lst(await api('GET', '/edu/desempenho/exames?pageSize=100'))
  const ex = (tipo: string) => exames.find((e: any) => e.tipo === tipo)
  const mestrado = (await api('POST', '/edu/desempenho/exames', { codigo: 'MESTRADO-PROC', nome: 'Processo seletivo de mestrado (prova de conhecimentos)', tipo: 'OUTRO', numQuestoes: 40, duracaoMin: 180, notaCorte: 60 })) ?? exames.find((e: any) => e.codigo === 'MESTRADO-PROC')
  const doutorado = (await api('POST', '/edu/desempenho/exames', { codigo: 'DOUTORADO-PROC', nome: 'Processo seletivo de doutorado (prova de conhecimentos)', tipo: 'OUTRO', numQuestoes: 40, duracaoMin: 180, notaCorte: 70 })) ?? exames.find((e: any) => e.codigo === 'DOUTORADO-PROC')
  const defs: Array<[string, string, string, string | null, string | null, boolean]> = [
    ['ENADE-ODO', 'Preparatório ENADE — Odontologia', 'PREPARATORIO', 'ENADE', ex('ENADE')?.id ?? null, true], ['OAB-1F', 'Preparatório OAB — 1ª fase', 'PREPARATORIO', 'OAB', ex('OAB_1FASE')?.id ?? null, true],
    ['ENAMED', 'Preparatório ENAMED', 'PREPARATORIO', 'ENAMED', ex('ENAMED')?.id ?? null, false], ['MEST-PREP', 'Preparatório para provas de mestrado', 'PREPARATORIO', 'MESTRADO', mestrado?.id ?? null, true],
    ['DOUT-PREP', 'Preparatório para provas de doutorado', 'PREPARATORIO', 'DOUTORADO', doutorado?.id ?? null, false], ['CONCURSO-SAUDE', 'Preparatório para concursos da área da saúde', 'PREPARATORIO', 'CONCURSO', ex('CONCURSO')?.id ?? null, false],
    ['DID-ACOMP', 'Acompanhamento didático (monitoria e reforço)', 'DIDATICO', null, null, false], ['PED-ACOMP', 'Acompanhamento pedagógico e métodos de estudo', 'PEDAGOGICO', null, null, false],
    ['DESENV-PESSOAL', 'Desenvolvimento pessoal e competências socioemocionais', 'DESENVOLVIMENTO_PESSOAL', null, null, false], ['MENTORIA', 'Mentoria acadêmica e de carreira', 'MENTORIA', null, null, false],
  ]
  const progs: Record<string, any> = {}
  for (const [codigo, nome, tipo, alvo, exameId, ranking] of defs) {
    const p = ok(await api('POST', `${D}/programas`, { codigo, nome, tipo, ...(alvo ? { alvo } : {}), ...(exameId ? { exameId } : {}), descricao: `${nome}: trilha, encontros e simulados com acompanhamento.`, inicio: ymd(-20), fim: ymd(160), vagas: 60, rankingAtivo: ranking, metaPercentual: 60, cargaHoraria: 40 }), `programa ${codigo}`)
    if (!p) continue
    progs[codigo] = p
    r.programas++
    const ativs: Array<[string, string, number]> = [['AULA', 'Aula de abertura e diagnóstico', -10], ['LEITURA', 'Leitura dirigida e fichamento', -3], ['ENCONTRO', 'Encontro de revisão com o orientador', 7], ['OFICINA', 'Oficina de resolução de questões', 14], ['MENTORIA', 'Sessão de mentoria individual', 21]]
    for (let i = 0; i < ativs.length; i++) await api('POST', `${D}/programas/${p.id}/atividades`, { ordem: i, tipo: ativs[i][0], titulo: ativs[i][1], dataPrevista: dia(ativs[i][2]), duracaoMin: 90, publicarNoCalendario: i === 2 })
    await api('POST', `${D}/programas/${p.id}/status`, { status: 'ABERTO' })
    for (let i = 0; i < 12 && i < lim.length; i++) await api('POST', `${D}/programas/${p.id}/inscrever`, { studentId: lim[(i * 3 + defs.findIndex((d) => d[0] === codigo)) % lim.length].id, rankingOptIn: ranking && i % 2 === 0 })
    const ats = lst((await api('GET', `${D}/programas/${p.id}`))?.atividades)
    const insc = lst((await api('GET', `${D}/programas/${p.id}/inscricoes`)))
    for (const a of ats.slice(0, 2)) for (const i of insc.slice(0, 8)) await api('POST', `${D}/atividades/${a.id}/registro`, { studentId: i.studentId, status: 'CONCLUIDA' })
    await api('POST', `${D}/programas/${p.id}/status`, { status: 'EM_ANDAMENTO' })
  }
  // banco de questões: reaproveita provas-ia (se houver avaliação) e simulado do preparatório
  const exId = ex('ENADE')?.id
  if (exId && progs['ENADE-ODO']) {
    const eixos = lst(await api('GET', `/edu/desempenho/eixos?exameId=${exId}&pageSize=50`))
    const letras = ['A', 'B', 'C', 'D', 'E']
    for (let i = 0; i < Math.min(eixos.length, 6) * 3; i++) {
      const eixo = eixos[i % Math.min(eixos.length, 6)]
      const q = await api('POST', '/edu/desempenho/questoes', { exameId: exId, eixoId: eixo.id, tipo: 'OBJETIVA', enunciado: `Questão de treino ${i + 1} (${eixo.nome}): assinale a alternativa correta sobre o tema da área.`, alternativas: letras.map((l) => ({ letra: l, texto: `Alternativa ${l} — ${eixo.nome} (${i + 1})` })), gabarito: letras[i % 5], nivel: ['FACIL', 'MEDIO', 'DIFICIL'][i % 3], fonte: 'Elaboração própria (demo)' })
      if (q) { await api('POST', `/edu/desempenho/questoes/${q.id}/revisar`, {}); await api('POST', `/edu/desempenho/questoes/${q.id}/publicar`, {}) }
    }
    await api('POST', `${D}/programas/${progs['ENADE-ODO'].id}/simulados`, { titulo: 'Simulado diagnóstico ENADE — Odontologia', total: 12, abreEm: dia(-1), fechaEm: dia(20) })
  }

  // ---------------------------------------------------------------- competências, planos e acompanhamentos
  const comps = lst((await api('GET', `${D}/competencias`)))
  for (let i = 0; i < Math.min(8, lim.length); i++) {
    for (const [ci, c] of comps.entries()) {
      await api('POST', `${D}/competencias/avaliar`, { studentId: lim[i].id, competenciaId: c.id, periodo: '2026/2', origem: 'PROFESSOR', nota: 2 + ((i + ci) % 4), evidencia: 'Observação em sala e em atividades de grupo.' })
      await api('POST', `${D}/competencias/avaliar`, { studentId: lim[i].id, competenciaId: c.id, periodo: '2026/1', origem: 'MENTOR', nota: 1 + ((i * 2 + ci) % 5) })
    }
    await api('POST', `${D}/planos`, { studentId: lim[i].id, titulo: `Plano individual de desenvolvimento — ${lim[i].nomeCompleto.split(' ')[0]}`, objetivo: 'Consolidar a base teórica e desenvolver autonomia de estudo.', vigenciaInicio: ymd(-15), vigenciaFim: ymd(150), metas: [{ descricao: 'Alcançar média 7,0 nas disciplinas do semestre', area: 'ACADEMICA', prazo: dia(90) }, { descricao: 'Participar de uma atividade de extensão', area: 'PROFISSIONAL', prazo: dia(120) }, { descricao: 'Praticar técnica de gestão do tempo (Pomodoro) por 4 semanas', area: 'SOCIOEMOCIONAL', prazo: dia(30) }] })
    await api('POST', `${D}/acompanhamentos`, { studentId: lim[i].id, tipo: i % 2 ? 'PEDAGOGICO' : 'DIDATICO', resumo: 'Conversa de acompanhamento do semestre.', dificuldades: 'Organização do tempo de estudo e leitura de textos técnicos.', estrategias: 'Plano semanal de estudo e grupo de monitoria.', proximoPassoEm: dia(14) })
  }

  // ---------------------------------------------------------------- avaliação global + orientações
  const ag = await api('POST', `${D}/avaliacoes-globais/gerar`, { termId: term.id })
  r.avaliacoes = ag?.geradas ?? 0
  const risco = lst(await api('GET', `${D}/avaliacoes-globais?faixa=RISCO&pageSize=5`))
  const atencao = lst(await api('GET', `${D}/avaliacoes-globais?faixa=ATENCAO&pageSize=5`))
  for (const a of [...risco, ...atencao].slice(0, 5)) if (a.alertas?.length && (await api('POST', `${D}/avaliacoes-globais/${a.id}/orientacao`, {}))) r.orientacoes++
  const o = await api('POST', `${D}/orientacoes`, { studentId: lim[2].id, tipo: 'ATENDIMENTO', titulo: 'Atendimento de acolhimento — dificuldades de adaptação', descricao: 'Aluno relata sobrecarga e dificuldade de conciliar trabalho e estudo (conteúdo fictício).', prioridade: 'ALTA', confidencialidade: 'SIGILOSO', baseLegal: 'CONSENTIMENTO', consentimentoAluno: true, encaminhadoPara: 'APOIO', prazo: dia(7) })
  if (o) { r.orientacoes++; await api('POST', `${D}/orientacoes/${o.id}/registros`, { tipo: 'ATENDIMENTO', texto: 'Primeira conversa realizada; combinado plano de estudos flexível e retorno em 15 dias.' }) }

  // ---------------------------------------------------------------- ligas, centros acadêmicos, extramuros e horas
  const liga = ok(await api('POST', `${A}/ligas`, { tipo: 'LIGA_ACADEMICA', nome: 'Liga Acadêmica de Endodontia', sigla: 'LAE', areaConhecimento: 'Odontologia', programId: progOdonto.id, descricao: 'Estudos, casos clínicos e ações de extensão em endodontia.', orientadorUserId: profId, orientadorNome: 'Prof. orientador', cargaHorariaMaxAluno: 60 }), 'liga')
  const ca = ok(await api('POST', `${A}/ligas`, { tipo: 'CENTRO_ACADEMICO', nome: 'Centro Acadêmico Dr. Hélio Ravel', sigla: 'CAHR', areaConhecimento: 'Representação estudantil', programId: progOdonto.id, status: 'ATIVA' }), 'centro acadêmico')
  if (liga) {
    r.ligas++
    for (let i = 0; i < 6 && i < lim.length; i++) await api('POST', `${A}/ligas/${liga.id}/membros`, { studentId: lim[i].id, papel: i === 0 ? 'PRESIDENTE' : i === 1 ? 'VICE' : 'MEMBRO' })
    const pl = await api('POST', `${A}/ligas/${liga.id}/planos`, { periodo: '2026/2', objetivos: 'Realizar ciclo de aulas, casos clínicos e uma ação social.', metas: '6 reuniões, 2 aulas abertas e 1 ação extramuros.', orcamento: 3500 })
    if (pl) { await api('POST', `${A}/ligas-planos/${pl.id}/enviar`, {}); await api('POST', `${A}/ligas-planos/${pl.id}/decidir`, { aprovar: true, parecer: 'Plano aprovado.' }) }
    const at = await api('POST', `${A}/ligas/${liga.id}/atividades`, { planoId: pl?.id, tipo: 'AULA', titulo: 'Aula aberta: diagnóstico em endodontia', inicio: dia(-8), fim: dia(-8), cargaHoraria: 3, local: 'Auditório Ravel', publicarNoCalendario: true })
    if (at) await api('POST', `${A}/ligas-atividades/${at.id}/realizar`, { presentes: lim.slice(0, 5).map((s: any) => ({ studentId: s.id })), relatorio: 'Aula com 38 participantes.' })
    await api('POST', `${A}/ligas/${liga.id}/atividades`, { planoId: pl?.id, tipo: 'ACAO_SOCIAL', titulo: 'Ação social de saúde bucal', inicio: dia(25), cargaHoraria: 6, publicarNoCalendario: true })
  }
  if (ca) {
    for (let i = 6; i < 10 && i < lim.length; i++) await api('POST', `${A}/ligas/${ca.id}/membros`, { studentId: lim[i].id, papel: i === 6 ? 'PRESIDENTE' : 'DIRETOR' })
    r.ligas++
  }
  const ext = await api('POST', `${A}/extramuros`, { titulo: 'Ação de saúde bucal em escola municipal', tipo: 'ACAO_COMUNITARIA', local: 'EMEF Jardim Esperança', cidade: 'São Paulo', inicio: dia(-5), fim: dia(-5), vagas: 20, transporte: true, seguro: true, termoAutorizacao: true, riscoNivel: 'MEDIO', cargaHoraria: 8, ligaId: liga?.id, programId: progOdonto.id })
  if (ext) {
    for (const s of lim.slice(0, 6)) await api('POST', `${A}/extramuros/${ext.id}/participantes`, { studentId: s.id, termoAceito: true })
    await api('POST', `${A}/extramuros/${ext.id}/status`, { status: 'APROVADA' })
    await api('POST', `${A}/extramuros/${ext.id}/realizar`, { presentes: lim.slice(0, 5).map((s: any) => s.id), relatorio: 'Atendidas 62 crianças com escovação supervisionada e orientação.' })
  }
  await api('PUT', `${A}/horas-complementares/regras`, { categoria: 'LIGA', maxHoras: 60 })
  await api('PUT', `${A}/horas-complementares/regras`, { categoria: 'EXTENSAO', maxHoras: 80 })
  for (let i = 0; i < 4 && i < lim.length; i++) await api('POST', `${A}/horas-complementares`, { studentId: lim[i].id, categoria: ['ENSINO', 'EVENTO', 'VOLUNTARIADO', 'CULTURA'][i], descricao: ['Monitoria de Anatomia', 'Congresso Paulista de Odontologia', 'Campanha do agasalho', 'Oficina de teatro'][i], horasInformadas: 12 + i * 4, data: ymd(-30 - i) })
  const pend = lst(await api('GET', `${A}/horas-complementares?status=PENDENTE&pageSize=50`))
  for (const h of pend.slice(0, 6)) await api('POST', `${A}/horas-complementares/${h.id}/validar`, { aprovar: true })

  return r
}

// Execução isolada: DATABASE_URL=... API_URL=http://localhost:3000/api npx tsx scripts/seeds/academico2.ts
if (require.main === module) {
  const API = process.env.API_URL || 'http://localhost:3000/api'
  ;(async () => {
    const { prisma } = await import('../../src/lib/prisma')
    const clinic = await prisma.clinic.findFirst({ where: { tenantId: 'ravel-ies' } })
    if (!clinic) throw new Error('Rode antes o edu-demo-seed.ts (tenant ravel-ies).')
    const lr = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clinicId: clinic.id, email: 'admin@ravel.edu.br', password: 'Ravel@2026' }) })
    const token = ((await lr.json()) as any).token
    const failures: string[] = []
    const api: SeedApi = async (method, path, body) => {
      const r = await fetch(`${API}${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body !== undefined ? JSON.stringify(body) : undefined })
      const t = await r.text(); let j: any = null; try { j = JSON.parse(t) } catch { /* vazio */ }
      if (!r.ok) { if (r.status >= 500) console.log('5xx', method, path, t.slice(0, 200)); return null }
      return j ?? {}
    }
    console.log(await seedAcademico2(api, { failures }))
    if (failures.length) console.log('Falhas:', failures)
    await prisma.$disconnect()
  })().catch((e) => { console.error(e); process.exit(1) })
}
