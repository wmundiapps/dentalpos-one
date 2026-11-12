/**
 * Seed de demonstração do módulo EXAMES (ENADE · ENAMED · OAB) — EduMaster Pro.
 * Usa a API REAL com token ADMIN, no estilo de scripts/edu-demo-seed.ts.
 * Uso a partir do edu-demo-seed (sem editá-lo):  import { seedExames } from './seeds/exames'  ->  await seedExames(c.api, c)
 * Uso isolado: ver o README do módulo (src/modules/exames/README.md).
 *
 * Conteúdo: 66 questões objetivas + 2 discursivas AUTORAIS (redigidas para a demonstração, nunca cópia de provas reais), todas
 * comentadas alternativa por alternativa; descritores (matriz de referência autoral), perfis de prova ILUSTRATIVOS, simulados prontos,
 * trilhas, flashcards-modelo e algumas sessões de demonstração dos alunos (criadas direto no banco para popular os painéis).
 * Nome da instituição na demonstração: "SUA INSTITUIÇÃO".
 */
import { prisma } from '../../src/lib/prisma'
import { finalizarSessao } from '../../src/modules/exames/simulados'
import { rngSeed } from '../../src/modules/exames/logic'
import { DESCRITORES, QUESTOES, DISCURSIVAS, PERFIS, FONTE_PERFIL, FLASHCARDS } from './exames-banco'

export interface SeedCtx { tenantId?: string; failures?: string[]; mk?: any }
type Api = (method: string, path: string, body?: any) => Promise<any>

const X = '/edu/exames'
const D = '/edu/desempenho'
const lista = (r: any): any[] => (Array.isArray(r) ? r : r?.items ?? [])
const DAY = 86_400_000

export interface ResumoExames { questoes: number; discursivas: number; descritores: number; perfis: number; simulados: number; trilhas: number; flashcards: number; sessoesDemo: number; jaExistia: boolean }

export async function seedExames(api: Api, ctx: SeedCtx = {}): Promise<ResumoExames> {
  const R: ResumoExames = { questoes: 0, discursivas: 0, descritores: 0, perfis: 0, simulados: 0, trilhas: 0, flashcards: 0, sessoesDemo: 0, jaExistia: false }
  const falha = (m: string) => ctx.failures?.push(`seedExames: ${m}`)

  // 1) catálogo de exames/eixos (idempotente) e configuração do módulo
  if (!(await api('POST', `${X}/bootstrap`, {}))) { falha('bootstrap'); return R }
  await api('PUT', `${X}/config`, { revisaoDocenteObrigatoria: true, rankingAtivo: true, limiteRiscoPct: 40, metaProntidaoPct: 60 })

  const exames = lista(await api('GET', `${D}/exames?pageSize=200`))
  const ex = new Map<string, any>(exames.map((e) => [e.codigo, e]))
  const eixos = new Map<string, string>() // `${exame}|${eixo}` -> id
  for (const e of exames) for (const x of lista(await api('GET', `${D}/eixos?exameId=${e.id}&pageSize=200`))) eixos.set(`${e.codigo}|${x.codigo}`, x.id)

  // idempotência: já tem questões deste banco?
  const probe = ex.get('OAB-1F')
  if (probe) {
    const ja = lista(await api('GET', `${X}/questoes?exameId=${probe.id}&pageSize=200`))
    if (ja.some((q) => String(q.enunciado).startsWith(QUESTOES.find((z) => z.exame === 'OAB-1F')!.enunciado.slice(0, 40)))) { R.jaExistia = true; return R }
  }

  // 2) descritores
  const descJa = new Map<string, Set<string>>()
  for (const e of exames) descJa.set(e.codigo, new Set(lista(await api('GET', `${X}/descritores?exameId=${e.id}`)).map((d) => d.codigo)))
  for (const d of DESCRITORES) {
    const exame = ex.get(d.exame), eixoId = eixos.get(`${d.exame}|${d.eixo}`)
    if (!exame || !eixoId) { falha(`descritor sem exame/eixo ${d.exame}|${d.eixo}`); continue }
    const codigo = `D-${d.eixo}`
    if (descJa.get(d.exame)?.has(codigo)) continue
    if (await api('POST', `${X}/descritores`, { exameId: exame.id, eixoId, codigo, descricao: d.descricao, resumo: d.resumo })) R.descritores++; else falha(`descritor ${codigo}`)
  }

  // 3) questões objetivas + revisão docente (aprovadas pelo admin) — todas autorais
  const letras = ['A', 'B', 'C', 'D', 'E']
  for (const s of QUESTOES) {
    const exame = ex.get(s.exame), eixoId = eixos.get(`${s.exame}|${s.eixo}`)
    if (!exame || !eixoId) { falha(`questão sem exame/eixo ${s.exame}|${s.eixo}`); continue }
    const body = {
      exameId: exame.id, eixoId, tema: s.tema, descritorCodigo: `D-${s.eixo}`, nivel: s.nivel, tipo: 'OBJETIVA', enunciado: s.enunciado,
      alternativas: s.alts.map((t, i) => ({ letra: letras[i], texto: t })), gabarito: letras[s.gab],
      comentario: s.com[s.gab].replace(/^Correta\.\s*/, ''), comentarios: Object.fromEntries(s.com.map((c, i) => [letras[i], c])),
    }
    const q = await api('POST', `${X}/questoes`, body)
    if (!q) { falha(`questão ${s.tema}`); continue }
    if (await api('POST', `${X}/questoes/${q.id}/revisao`, { decisao: 'APROVADA', nota: 'Questão autoral revisada para a demonstração.' })) R.questoes++; else falha(`revisão ${s.tema}`)
  }
  for (const s of DISCURSIVAS) {
    const exame = ex.get(s.exame), eixoId = eixos.get(`${s.exame}|${s.eixo}`)
    if (!exame || !eixoId) { falha(`discursiva sem exame/eixo ${s.exame}|${s.eixo}`); continue }
    const q = await api('POST', `${X}/questoes`, { exameId: exame.id, eixoId, tema: s.tema, descritorCodigo: `D-${s.eixo}`, nivel: s.nivel, tipo: 'DISCURSIVA', enunciado: s.enunciado, gabarito: s.espelho, comentario: s.criterios })
    if (q && (await api('POST', `${X}/questoes/${q.id}/revisao`, { decisao: 'APROVADA' }))) R.discursivas++; else falha(`discursiva ${s.tema}`)
  }

  // 4) perfis de prova (ILUSTRATIVOS)
  for (const p of PERFIS) {
    const exame = ex.get(p.exame)
    if (!exame) continue
    const r = await api('POST', `${X}/perfis`, {
      exameId: exame.id, ano: p.ano, rotulo: p.rotulo, estiloEnunciado: p.estilo, nivelGeral: p.nivel, fonteDescricao: FONTE_PERFIL, ilustrativo: true,
      temas: p.temas.map((t) => ({ tema: t.tema, eixoCodigo: t.eixo ?? null, frequenciaPct: t.f, nivelPredominante: t.nivel ?? null })),
    })
    if (r) R.perfis++; else falha(`perfil ${p.exame} ${p.ano}`)
  }

  // 5) flashcards-modelo
  for (const f of FLASHCARDS) {
    const exame = ex.get(f.exame)
    if (!exame) continue
    if (await api('POST', `${X}/flashcards/modelos`, { exameId: exame.id, eixoId: f.eixo ? eixos.get(`${f.exame}|${f.eixo}`) ?? null : null, tema: f.tema, frente: f.frente, verso: f.verso })) R.flashcards++
  }

  // 6) simulados prontos (por curso quando o curso existir na demonstração)
  const progs = lista(await api('GET', '/edu/academico/programs'))
  const prog = (re: RegExp) => progs.find((p) => re.test(String(p.nome)))?.id as string | undefined
  const defs: Array<{ exame: string; titulo: string; descricao: string; dur: number; q: number; incluir?: string[]; programId?: string }> = [
    { exame: 'ENADE-GERAL', titulo: 'Simulado ENADE — Formação Geral', descricao: 'Questões de formação geral comuns a todos os cursos.', dur: 60, q: 12 },
    { exame: 'ENADE-DIR', titulo: 'Simulado ENADE — Direito (formação geral + específico)', descricao: 'Parte de formação geral e componente específico de Direito.', dur: 90, q: 11, incluir: ['ENADE-GERAL'], programId: prog(/direito/i) },
    { exame: 'ENADE-ODO', titulo: 'Simulado ENADE — Odontologia (formação geral + específico)', descricao: 'Parte de formação geral e componente específico de Odontologia.', dur: 90, q: 11, incluir: ['ENADE-GERAL'], programId: prog(/odonto/i) },
    { exame: 'ENADE-ENF', titulo: 'Simulado ENADE — Enfermagem (formação geral + específico)', descricao: 'Parte de formação geral e componente específico de Enfermagem.', dur: 90, q: 11, incluir: ['ENADE-GERAL'], programId: prog(/enferm/i) },
    { exame: 'ENADE-ADM', titulo: 'Simulado ENADE — Administração (formação geral + específico)', descricao: 'Parte de formação geral e componente específico de Administração.', dur: 75, q: 10, incluir: ['ENADE-GERAL'], programId: prog(/administra/i) },
    { exame: 'ENADE-PED', titulo: 'Simulado ENADE — Pedagogia (formação geral + específico)', descricao: 'Parte de formação geral e componente específico de Pedagogia.', dur: 75, q: 10, incluir: ['ENADE-GERAL'], programId: prog(/pedagog/i) },
    { exame: 'ENAMED', titulo: 'Simulado ENAMED — grandes áreas', descricao: 'Clínica médica, cirurgia, pediatria, ginecologia e obstetrícia, medicina preventiva e urgência.', dur: 60, q: 9, programId: prog(/medicin/i) },
    { exame: 'OAB-1F', titulo: 'Simulado OAB 1ª fase — por disciplinas', descricao: 'Questões objetivas por disciplina, com explicação de cada alternativa.', dur: 90, q: 12, programId: prog(/direito/i) },
  ]
  const publicados: Array<{ id: string; exame: string; programId?: string }> = []
  for (const s of defs) {
    const exame = ex.get(s.exame)
    if (!exame) continue
    const sim = await api('POST', `${X}/simulados`, {
      exameId: exame.id, titulo: s.titulo, descricao: s.descricao, duracaoMin: s.dur, ...(s.programId ? { programId: s.programId } : {}),
      auto: { quantidade: s.q, ...(s.incluir ? { incluirExameIds: s.incluir.map((c) => ex.get(c)?.id).filter(Boolean) } : {}) },
    })
    if (!sim) { falha(`simulado ${s.titulo}`); continue }
    if (await api('POST', `${X}/simulados/${sim.id}/publicar`, {})) { R.simulados++; publicados.push({ id: sim.id, exame: s.exame, programId: s.programId }) } else falha(`publicar ${s.titulo}`)
  }

  // 7) trilhas por curso/área e por fase
  const trilhas: Array<{ exame: string; titulo: string; area: string; programId?: string }> = [
    { exame: 'ENADE-GERAL', titulo: 'Trilha ENADE — Formação Geral', area: 'Formação Geral (todos os cursos)' },
    { exame: 'ENADE-DIR', titulo: 'Trilha ENADE — Direito', area: 'Direito', programId: prog(/direito/i) },
    { exame: 'ENADE-ODO', titulo: 'Trilha ENADE — Odontologia', area: 'Odontologia', programId: prog(/odonto/i) },
    { exame: 'ENADE-ENF', titulo: 'Trilha ENADE — Enfermagem', area: 'Enfermagem', programId: prog(/enferm/i) },
    { exame: 'ENADE-ADM', titulo: 'Trilha ENADE — Administração', area: 'Administração', programId: prog(/administra/i) },
    { exame: 'ENADE-PED', titulo: 'Trilha ENADE — Pedagogia', area: 'Pedagogia', programId: prog(/pedagog/i) },
    { exame: 'ENAMED', titulo: 'Trilha ENAMED — grandes áreas médicas', area: 'Medicina' },
    { exame: 'OAB-1F', titulo: 'Trilha OAB 1ª fase — por disciplinas', area: 'OAB 1ª fase' },
    { exame: 'OAB-2F', titulo: 'Trilha OAB 2ª fase — por área de atuação', area: 'OAB 2ª fase' },
  ]
  for (const t of trilhas) {
    const exame = ex.get(t.exame)
    if (exame && (await api('POST', `${X}/trilhas/gerar`, { exameId: exame.id, titulo: t.titulo, area: t.area, ...(t.programId ? { programId: t.programId } : {}), maxEtapas: 8 }))) R.trilhas++
  }

  // 8) calendário: edição do ENADE para os cursos com inscritos (módulo desempenho)
  const enadeDia = new Date(Date.now() + 120 * DAY).toISOString()
  for (const [cod, re] of [['ENADE-DIR', /direito/i], ['ENADE-ODO', /odonto/i], ['ENADE-ENF', /enferm/i]] as const) {
    const exame = ex.get(cod), programId = prog(re)
    if (!exame || !programId) continue
    const eds = lista(await api('GET', `${D}/edicoes?exameId=${exame.id}&pageSize=20`))
    const ed = eds[0] ?? (await api('POST', `${D}/edicoes`, { exameId: exame.id, ano: new Date().getFullYear(), titulo: 'ENADE ' + new Date().getFullYear(), dataProva: enadeDia, inscricaoInicio: new Date(Date.now() + 10 * DAY).toISOString(), inscricaoFim: new Date(Date.now() + 60 * DAY).toISOString(), status: 'PLANEJADA' }))
    if (ed) await api('POST', `${D}/edicoes/${ed.id}/gerar-inscritos`, { programId, categoria: 'CONCLUINTE', mesesMinimosConcluinte: 0 })
  }

  // 9) sessões de demonstração (alunos fictícios do seed acadêmico) para popular painéis, ranking e flashcards
  if (ctx.tenantId) R.sessoesDemo = await sessoesDemo(ctx.tenantId, publicados, falha)
  return R
}

async function sessoesDemo(tenantId: string, publicados: Array<{ id: string; exame: string; programId?: string }>, falha: (m: string) => void) {
  let n = 0
  const sims = await prisma.exaSimulado.findMany({ where: { tenantId, id: { in: publicados.map((p) => p.id) } } })
  const matr = await prisma.enrollment.findMany({ where: { status: 'ATIVA', student: { tenantId } }, select: { studentId: true, programId: true }, take: 400 })
  const porCurso = new Map<string, string[]>()
  for (const m of matr) porCurso.set(m.programId, [...(porCurso.get(m.programId) ?? []), m.studentId])
  const gabs = new Map((await prisma.desQuestao.findMany({ where: { tenantId, id: { in: [...new Set(sims.flatMap((s) => s.questaoIds as string[]))] } }, select: { id: true, gabarito: true, alternativas: true } })).map((q) => [q.id, q]))
  for (const sim of sims) {
    if (!sim.programId) continue
    const alunos = (porCurso.get(sim.programId) ?? []).slice(0, 10)
    for (const [i, studentId] of alunos.entries()) {
      for (const [k, dias] of [-45, -20, -4].entries()) {
        if (await prisma.exaSessao.count({ where: { tenantId, simuladoId: sim.id, studentId } }) > k) continue
        const rand = rngSeed(1000 + i * 31 + k * 7 + sim.titulo.length)
        const skill = Math.min(0.92, 0.3 + (i % 6) * 0.1 + k * 0.08) // alguns alunos em risco, outros na meta
        const respostas: Record<string, string> = {}
        for (const qid of sim.questaoIds as string[]) {
          const q = gabs.get(qid)
          if (!q || rand() < 0.04) continue // 4% em branco
          const alts = ((q.alternativas as any[]) ?? []).map((a) => a.letra)
          respostas[qid] = rand() < skill ? (q.gabarito as string) : alts.filter((l) => l !== q.gabarito)[Math.floor(rand() * Math.max(1, alts.length - 1))] ?? alts[0]
        }
        const quando = new Date(Date.now() + dias * DAY)
        const s = await prisma.exaSessao.create({ data: { tenantId, simuladoId: sim.id, studentId, programId: sim.programId, iniciadaEm: new Date(quando.getTime() - 3_000_000), expiraEm: new Date(Date.now() + 3_600_000), total: (sim.questaoIds as string[]).length, respostas } })
        try {
          await finalizarSessao(tenantId, s.id, 'ENVIADA')
          await prisma.exaSessao.update({ where: { id: s.id }, data: { enviadaEm: quando, expiraEm: new Date(quando.getTime() + 1_000_000), tempoSegundos: 1800 + Math.floor(rand() * 1500) } })
          n++
        } catch (e: any) { falha(`sessão demo: ${e.message}`) }
      }
    }
  }
  // a revisão de flashcards gerados dos erros deve cair no futuro próximo: deixa-os vencidos hoje (aparecem em "Revisar hoje")
  return n
}
