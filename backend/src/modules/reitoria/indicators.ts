import { prisma } from '../../lib/prisma'
import {
  Indicador, Perfil, Semaforo, Sentido, TTLCache, calcularNps, montarIndicador, pct, round1, round2,
  semaforoContagem, semaforoPorLimites, variacao, variacaoFavoravel,
} from './logic'
import { execucaoPdi, fracaoTempo as fracaoPdi, semaforo as semaforoPdi } from '../governanca/pdiLogic'

// Catálogo de indicadores do painel executivo. Cada indicador consulta
// (read-only) os módulos e é isolado por try/catch + timeout: a falha ou a
// ausência de tabela/dados de um módulo nunca derruba o painel.

const DAY = 86_400_000
const ABERTAS_SEC = ['ABERTO', 'EM_ANALISE', 'PENDENTE_DOCUMENTO'] as const

export interface Ctx {
  tenantId: string
  programId?: string
  userId?: string          // só preenchido no painel do professor
  now: Date
  memo: Map<string, Promise<any>>
}

type Corpo = Partial<Pick<Indicador, 'anterior' | 'anteriorFonte' | 'meta' | 'detalhe' | 'semaforo' | 'unidade'>> & {
  valor: number | null
  sentido?: Sentido
  limites?: { verde: number; amarelo: number }
  rota?: string
}

export interface Def {
  chave: string
  titulo: string
  categoria: string
  perfis: Perfil[]
  rota: string
  unidade?: string
  cursoFiltravel?: boolean   // respeita ?programId=
  soProfessor?: boolean      // só no painel do professor (usa ctx.userId)
  escopoUsuario?: boolean    // com ctx.userId, filtra pelas turmas do professor
  run: (c: Ctx) => Promise<Corpo | null>
}

const memo = <T>(c: Ctx, k: string, f: () => Promise<T>): Promise<T> => {
  if (!c.memo.has(k)) c.memo.set(k, f())
  return c.memo.get(k)!
}
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1)
const sum = (v: number | null | undefined) => v ?? 0

// ratio atual/anterior -> semáforo (MAIOR_MELHOR)
export function semaforoPorRazao(valor: number | null, anterior: number | null | undefined, sentido: Sentido = 'MAIOR_MELHOR', tol?: { verde: number; amarelo: number }): Semaforo {
  if (valor == null || anterior == null || sentido === 'NEUTRO') return 'CINZA'
  if (anterior === 0) return valor === 0 ? 'CINZA' : sentido === 'MAIOR_MELHOR' ? 'VERDE' : 'VERMELHO'
  const r = valor / anterior
  // MAIOR_MELHOR: razão mínima aceitável (padrão 0,95 / 0,80); MENOR_MELHOR: razão máxima aceitável (padrão 1,05 / 1,20)
  if (sentido === 'MAIOR_MELHOR') { const t = tol ?? { verde: 0.95, amarelo: 0.8 }; return r >= t.verde ? 'VERDE' : r >= t.amarelo ? 'AMARELO' : 'VERMELHO' }
  const t = tol ?? { verde: 1.05, amarelo: 1.2 }
  return r <= t.verde ? 'VERDE' : r <= t.amarelo ? 'AMARELO' : 'VERMELHO'
}

// ---------------- escopos compartilhados ----------------

const enrollWhere = (c: Ctx) => ({ program: { tenantId: c.tenantId }, ...(c.programId ? { programId: c.programId } : {}) })

const studentIdsDoCurso = (c: Ctx): Promise<string[] | undefined> =>
  memo(c, 'studentIds', async () => {
    if (!c.programId) return undefined
    const rows = await prisma.enrollment.findMany({ where: { programId: c.programId, program: { tenantId: c.tenantId } }, select: { studentId: true }, distinct: ['studentId'], take: 50_000 })
    return rows.map((r) => r.studentId)
  })

// Turmas do escopo: do professor logado, ou do curso (via matriz curricular); undefined = todas.
const sectionIds = (c: Ctx): Promise<string[] | undefined> =>
  memo(c, 'sectionIds', async () => {
    if (c.userId) {
      const rows = await prisma.classSection.findMany({ where: { tenantId: c.tenantId, professorUserId: c.userId }, select: { id: true }, take: 5000 })
      return rows.map((r) => r.id)
    }
    if (c.programId) {
      const cd = await prisma.curriculumDiscipline.findMany({ where: { programId: c.programId }, select: { disciplineId: true } })
      const rows = await prisma.classSection.findMany({ where: { tenantId: c.tenantId, disciplineId: { in: cd.map((x) => x.disciplineId) } }, select: { id: true }, take: 10_000 })
      return rows.map((r) => r.id)
    }
    return undefined
  })

const alunosPorCurso = (c: Ctx) =>
  memo(c, 'alunosPorCurso', async () => {
    const g = await prisma.enrollment.groupBy({ by: ['programId'], where: { ...enrollWhere(c), status: 'ATIVA' }, _count: { _all: true } })
    const progs = await prisma.academicProgram.findMany({ where: { tenantId: c.tenantId, id: { in: g.map((x) => x.programId) } }, select: { id: true, nome: true, modalidade: true } })
    const nome = new Map(progs.map((p) => [p.id, p]))
    return g.map((x) => ({ programId: x.programId, nome: nome.get(x.programId)?.nome ?? '(curso removido)', modalidade: nome.get(x.programId)?.modalidade ?? null, alunos: x._count._all }))
      .sort((a, b) => b.alunos - a.alunos)
  })

const termoVigente = (c: Ctx) =>
  memo(c, 'termo', async () =>
    (await prisma.academicTerm.findFirst({ where: { tenantId: c.tenantId, dataInicio: { lte: c.now }, dataFim: { gte: c.now } }, orderBy: { dataInicio: 'desc' } })) ??
    (await prisma.academicTerm.findFirst({ where: { tenantId: c.tenantId }, orderBy: { dataFim: 'desc' } })),
  )

const contagemPorStatus = async (rows: Array<{ _count: { _all: number } } & Record<string, any>>, campo: string) =>
  Object.fromEntries(rows.map((r) => [String(r[campo]), r._count._all]))

// ---------------- definições ----------------

const R: Perfil[] = ['reitoria']
const ALL_GESTAO: Perfil[] = ['reitoria', 'coordenacao']

export const DEFS: Def[] = [
  // ===== ACADÊMICO =====
  {
    chave: 'matriculas_ativas', titulo: 'Matrículas ativas', categoria: 'Acadêmico', perfis: ['reitoria', 'coordenacao', 'secretaria', 'administracao', 'admissoes'],
    rota: '/edu/academico/matriculas?status=ATIVA', cursoFiltravel: true,
    async run(c) {
      const g = await prisma.enrollment.groupBy({ by: ['status'], where: enrollWhere(c), _count: { _all: true } })
      const m = await contagemPorStatus(g as any, 'status')
      return { valor: m.ATIVA ?? 0, sentido: 'MAIOR_MELHOR', semaforo: 'CINZA', detalhe: { ativas: m.ATIVA ?? 0, trancadas: m.TRANCADA ?? 0, canceladas: m.CANCELADA ?? 0, concluidas: m.CONCLUIDA ?? 0 } }
    },
  },
  {
    chave: 'novas_matriculas_30d', titulo: 'Novas matrículas (30 dias)', categoria: 'Acadêmico', perfis: ['reitoria', 'coordenacao', 'secretaria', 'admissoes', 'administracao'],
    rota: '/edu/academico/matriculas', cursoFiltravel: true,
    async run(c) {
      const [a, b] = await Promise.all([
        prisma.enrollment.count({ where: { ...enrollWhere(c), dataMatricula: { gte: new Date(c.now.getTime() - 30 * DAY) } } }),
        prisma.enrollment.count({ where: { ...enrollWhere(c), dataMatricula: { gte: new Date(c.now.getTime() - 60 * DAY), lt: new Date(c.now.getTime() - 30 * DAY) } } }),
      ])
      return { valor: a, anterior: b, sentido: 'MAIOR_MELHOR', semaforo: semaforoPorRazao(a, b) }
    },
  },
  {
    chave: 'matriculas_trancadas', titulo: 'Matrículas trancadas', categoria: 'Acadêmico', perfis: ['reitoria', 'coordenacao', 'secretaria'],
    rota: '/edu/academico/matriculas?status=TRANCADA', cursoFiltravel: true,
    async run(c) {
      const [t, a] = await Promise.all([
        prisma.enrollment.count({ where: { ...enrollWhere(c), status: 'TRANCADA' } }),
        prisma.enrollment.count({ where: { ...enrollWhere(c), status: { in: ['ATIVA', 'TRANCADA'] } } }),
      ])
      const p = pct(t, a)
      return { valor: t, sentido: 'MENOR_MELHOR', semaforo: semaforoPorLimites(p, { sentido: 'MENOR_MELHOR', verde: 3, amarelo: 6 }), detalhe: { percentualDoBase: p } }
    },
  },
  {
    chave: 'evasao', titulo: 'Taxa de evasão', categoria: 'Acadêmico', perfis: ['reitoria', 'coordenacao'], unidade: '%',
    rota: '/edu/apoio/risco', cursoFiltravel: true,
    async run(c) {
      const ids = await studentIdsDoCurso(c)
      const w = { tenantId: c.tenantId, ...(ids ? { id: { in: ids } } : {}) }
      const g = await prisma.student.groupBy({ by: ['status'], where: w, _count: { _all: true } })
      const m = await contagemPorStatus(g as any, 'status')
      const evadidos = (m.CANCELADO ?? 0) + (m.DESISTENTE ?? 0)
      const base = evadidos + (m.ATIVO ?? 0) + (m.TRANCADO ?? 0)
      const v = base ? pct(evadidos, base) : null
      return { valor: v, sentido: 'MENOR_MELHOR', limites: { verde: 8, amarelo: 15 }, detalhe: { evadidos, base, porStatus: m } }
    },
  },
  {
    chave: 'alunos_por_curso', titulo: 'Alunos ativos por curso', categoria: 'Acadêmico', perfis: ['reitoria', 'coordenacao', 'administracao'],
    rota: '/edu/academico/programas', cursoFiltravel: true,
    async run(c) {
      const l = await alunosPorCurso(c)
      return { valor: l.length ? l.reduce((s, x) => s + x.alunos, 0) : 0, sentido: 'NEUTRO', detalhe: { cursos: l.slice(0, 30), totalCursos: l.length } }
    },
  },
  {
    chave: 'alunos_por_modalidade', titulo: 'Alunos por modalidade', categoria: 'Acadêmico', perfis: ['reitoria', 'administracao'],
    rota: '/edu/modalidades', cursoFiltravel: true,
    async run(c) {
      const l = await alunosPorCurso(c)
      const m: Record<string, number> = {}
      for (const x of l) m[x.modalidade ?? 'NAO_INFORMADA'] = (m[x.modalidade ?? 'NAO_INFORMADA'] ?? 0) + x.alunos
      return { valor: Object.keys(m).length, sentido: 'NEUTRO', unidade: 'modalidades', detalhe: { modalidades: m } }
    },
  },

  // ===== ADMISSÕES =====
  {
    chave: 'funil_admissoes', titulo: 'Funil de admissões (12 meses)', categoria: 'Admissões', perfis: ['reitoria', 'admissoes'],
    rota: '/edu/admissoes/funil',
    async run(c) {
      const g = await prisma.admCandidato.groupBy({ by: ['status'], where: { tenantId: c.tenantId, createdAt: { gte: new Date(c.now.getTime() - 365 * DAY) } }, _count: { _all: true } })
      const m = await contagemPorStatus(g as any, 'status')
      const total = Object.values(m).reduce((s, n) => s + n, 0)
      const inscritos = total - (m.LEAD ?? 0)
      return { valor: total, sentido: 'NEUTRO', detalhe: { funil: m, inscritos, matriculados: m.MATRICULADO ?? 0, conversaoInscritosMatriculadosPct: pct(m.MATRICULADO ?? 0, inscritos), conversaoLeadsPct: pct(m.MATRICULADO ?? 0, total) } }
    },
  },
  {
    chave: 'leads_30d', titulo: 'Novos candidatos/leads (30 dias)', categoria: 'Admissões', perfis: ['reitoria', 'admissoes'],
    rota: '/edu/admissoes/candidatos',
    async run(c) {
      const [a, b] = await Promise.all([
        prisma.admCandidato.count({ where: { tenantId: c.tenantId, createdAt: { gte: new Date(c.now.getTime() - 30 * DAY) } } }),
        prisma.admCandidato.count({ where: { tenantId: c.tenantId, createdAt: { gte: new Date(c.now.getTime() - 60 * DAY), lt: new Date(c.now.getTime() - 30 * DAY) } } }),
      ])
      return { valor: a, anterior: b, sentido: 'MAIOR_MELHOR', semaforo: semaforoPorRazao(a, b) }
    },
  },
  {
    chave: 'matriculas_admissao_pendentes', titulo: 'Matrículas de ingressantes pendentes', categoria: 'Admissões', perfis: ['reitoria', 'admissoes', 'secretaria'],
    rota: '/edu/admissoes/matriculas',
    async run(c) {
      const g = await prisma.admMatricula.groupBy({ by: ['status'], where: { tenantId: c.tenantId, status: { in: ['PENDENTE_DOCUMENTOS', 'DOCUMENTOS_OK'] } }, _count: { _all: true } })
      const m = await contagemPorStatus(g as any, 'status')
      const n = (m.PENDENTE_DOCUMENTOS ?? 0) + (m.DOCUMENTOS_OK ?? 0)
      return { valor: n, sentido: 'MENOR_MELHOR', semaforo: semaforoContagem(n, 15), detalhe: m }
    },
  },

  // ===== FINANCEIRO =====
  {
    chave: 'inadimplencia', titulo: 'Inadimplência (12 meses)', categoria: 'Financeiro', perfis: ['reitoria', 'administracao'], unidade: '%',
    rota: '/edu/financeiro/receber?status=ATRASADO',
    async run(c) {
      const hoje = startOfDay(c.now)
      const janela = { gte: new Date(hoje.getTime() - 365 * DAY), lt: hoje }
      const base = { tenantId: c.tenantId, dataVencimento: janela }
      const [tot, inad, alunos] = await Promise.all([
        prisma.accountReceivable.aggregate({ where: { ...base, status: { not: 'CANCELADO' } }, _sum: { valor: true }, _count: { _all: true } }),
        prisma.accountReceivable.aggregate({ where: { ...base, status: { in: ['PENDENTE', 'ATRASADO'] } }, _sum: { valor: true }, _count: { _all: true } }),
        prisma.accountReceivable.findMany({ where: { ...base, status: { in: ['PENDENTE', 'ATRASADO'] } }, distinct: ['studentId'], select: { studentId: true }, take: 20_000 }),
      ])
      const t = sum(tot._sum.valor)
      const v = t > 0 ? pct(sum(inad._sum.valor), t) : null
      return { valor: v, sentido: 'MENOR_MELHOR', limites: { verde: 5, amarelo: 10 }, detalhe: { valorInadimplente: round2(sum(inad._sum.valor)), valorTotalVencido: round2(t), titulos: inad._count._all, alunosInadimplentes: alunos.length } }
    },
  },
  {
    chave: 'receita_mes', titulo: 'Receita do mês', categoria: 'Financeiro', perfis: ['reitoria', 'administracao'], unidade: 'R$',
    rota: '/edu/financeiro/fluxo-caixa',
    async run(c) {
      const [a, b] = await Promise.all([receitaDespesa(c, 'RECEITA', 0), receitaDespesa(c, 'RECEITA', 1)])
      return { valor: a, anterior: b, sentido: 'MAIOR_MELHOR', semaforo: semaforoPorRazao(a, b), detalhe: { comparacao: 'mesmo intervalo de dias do mês anterior' } }
    },
  },
  {
    chave: 'despesa_mes', titulo: 'Despesa do mês', categoria: 'Financeiro', perfis: ['reitoria', 'administracao'], unidade: 'R$',
    rota: '/edu/financeiro/pagar',
    async run(c) {
      const [a, b] = await Promise.all([receitaDespesa(c, 'DESPESA', 0), receitaDespesa(c, 'DESPESA', 1)])
      return { valor: a, anterior: b, sentido: 'MENOR_MELHOR', semaforo: semaforoPorRazao(a, b, 'MENOR_MELHOR', { verde: 1.05, amarelo: 1.2 }) }
    },
  },
  {
    chave: 'fluxo_caixa_mes', titulo: 'Fluxo de caixa do mês (realizado)', categoria: 'Financeiro', perfis: ['reitoria', 'administracao'], unidade: 'R$',
    rota: '/edu/financeiro/fluxo-caixa',
    async run(c) {
      const [ra, da, rb, db] = await Promise.all([receitaDespesa(c, 'RECEITA', 0), receitaDespesa(c, 'DESPESA', 0), receitaDespesa(c, 'RECEITA', 1), receitaDespesa(c, 'DESPESA', 1)])
      const prox = new Date(c.now.getTime() + 30 * DAY)
      const [rec, pag] = await Promise.all([
        prisma.accountReceivable.aggregate({ where: { tenantId: c.tenantId, status: { in: ['PENDENTE', 'ATRASADO'] }, dataVencimento: { lte: prox } }, _sum: { valor: true } }),
        prisma.accountPayable.aggregate({ where: { tenantId: c.tenantId, status: { in: ['PENDENTE', 'ATRASADO'] }, dataVencimento: { lte: prox } }, _sum: { valor: true } }),
      ])
      const previsto = round2(sum(rec._sum.valor) - sum(pag._sum.valor))
      const v = round2(ra - da)
      return { valor: v, anterior: round2(rb - db), sentido: 'MAIOR_MELHOR', semaforo: v >= 0 && previsto >= 0 ? 'VERDE' : v >= 0 || previsto >= 0 ? 'AMARELO' : 'VERMELHO', detalhe: { receita: ra, despesa: da, previsto30dias: previsto, aReceber30d: round2(sum(rec._sum.valor)), aPagar30d: round2(sum(pag._sum.valor)) } }
    },
  },
  {
    chave: 'contas_pagar_vencidas', titulo: 'Contas a pagar vencidas', categoria: 'Financeiro', perfis: ['reitoria', 'administracao'],
    rota: '/edu/financeiro/pagar?status=ATRASADO',
    async run(c) {
      const a = await prisma.accountPayable.aggregate({ where: { tenantId: c.tenantId, status: { in: ['PENDENTE', 'ATRASADO'] }, dataVencimento: { lt: startOfDay(c.now) } }, _sum: { valor: true }, _count: { _all: true } })
      return { valor: a._count._all, sentido: 'MENOR_MELHOR', semaforo: semaforoContagem(a._count._all, 3), detalhe: { valor: round2(sum(a._sum.valor)) } }
    },
  },

  // ===== CALENDÁRIO / ESPAÇOS =====
  {
    chave: 'ocupacao_espacos', titulo: 'Ocupação semanal dos espaços de ensino', categoria: 'Calendário e espaços', perfis: ['reitoria', 'infraestrutura'], unidade: '%',
    rota: '/edu/calendario/ocupacao',
    async run(c) {
      const term = await termoVigente(c)
      if (!term) return { valor: null }
      const [slots, espacos] = await Promise.all([
        prisma.calSlot.findMany({ where: { tenantId: c.tenantId, termId: term.id, ativo: true, spaceId: { not: null } }, select: { inicioMin: true, fimMin: true, spaceId: true }, take: 50_000 }),
        prisma.eduSpace.count({ where: { tenantId: c.tenantId, ativo: true, tipo: { in: ['SALA_AULA', 'LABORATORIO', 'AUDITORIO', 'CLINICA_ESCOLA'] } } }),
      ])
      if (!espacos) return { valor: null }
      const usados = slots.reduce((s, x) => s + Math.max(0, x.fimMin - x.inicioMin), 0)
      const capacidade = espacos * 5 * 15 * 60 // seg-sex, 7h-22h
      const v = round1(Math.min(100, (usados / capacidade) * 100))
      const semaforo: Semaforo = v > 95 ? 'VERMELHO' : v >= 45 ? 'VERDE' : 'AMARELO'
      return { valor: v, sentido: 'NEUTRO', semaforo, detalhe: { espacos, slotsAtivos: slots.length, espacosUsados: new Set(slots.map((s) => s.spaceId)).size, periodo: term.codigo, faixaIdeal: '45% a 95%' } }
    },
  },
  {
    chave: 'conflitos_calendario', titulo: 'Conflitos de calendário em aberto', categoria: 'Calendário e espaços', perfis: ['reitoria', 'infraestrutura', 'secretaria'],
    rota: '/edu/calendario/conflitos',
    async run(c) {
      const n = await prisma.calConflito.count({ where: { tenantId: c.tenantId, status: 'ABERTO' } })
      return { valor: n, sentido: 'MENOR_MELHOR', semaforo: semaforoContagem(n, 3) }
    },
  },
  {
    chave: 'reservas_pendentes', titulo: 'Reservas de espaço aguardando decisão', categoria: 'Calendário e espaços', perfis: ['reitoria', 'infraestrutura'],
    rota: '/edu/calendario/reservas?status=PENDENTE',
    async run(c) {
      const n = await prisma.calReserva.count({ where: { tenantId: c.tenantId, status: 'PENDENTE', fim: { gte: c.now } } })
      return { valor: n, sentido: 'MENOR_MELHOR', semaforo: semaforoContagem(n, 8) }
    },
  },
  {
    chave: 'prof_aulas_semana', titulo: 'Minhas aulas na semana', categoria: 'Calendário e espaços', perfis: ['professor'], soProfessor: true,
    rota: '/edu/calendario/minha-agenda',
    async run(c) {
      const term = await termoVigente(c)
      if (!term) return { valor: null }
      const slots = await prisma.calSlot.findMany({ where: { tenantId: c.tenantId, termId: term.id, ativo: true, professorUserId: c.userId }, select: { inicioMin: true, fimMin: true } })
      const horas = round1(slots.reduce((s, x) => s + (x.fimMin - x.inicioMin), 0) / 60)
      return { valor: slots.length, sentido: 'NEUTRO', unidade: 'aulas', detalhe: { horasSemana: horas, periodo: term.codigo } }
    },
  },

  // ===== NOTAS / DIÁRIOS =====
  {
    chave: 'diarios_atrasados', titulo: 'Diários com prazo de lançamento vencido', categoria: 'Notas e diários', perfis: ['reitoria', 'coordenacao', 'secretaria', 'professor'],
    rota: '/edu/notas/gestao/pendencias', cursoFiltravel: true, escopoUsuario: true,
    async run(c) {
      const ids = await sectionIds(c)
      const w = { tenantId: c.tenantId, ...(ids ? { classSectionId: { in: ids } } : {}) }
      const [atras, abertos, fechados] = await Promise.all([
        prisma.ntDiario.count({ where: { ...w, status: 'ABERTO', prazoLancamento: { lt: c.now } } }),
        prisma.ntDiario.count({ where: { ...w, status: 'ABERTO' } }),
        prisma.ntDiario.count({ where: { ...w, status: 'FECHADO' } }),
      ])
      return { valor: atras, sentido: 'MENOR_MELHOR', semaforo: semaforoContagem(atras, 5), detalhe: { abertos, fechados, fechamentoPct: pct(fechados, abertos + fechados) } }
    },
  },
  {
    chave: 'revisoes_nota_abertas', titulo: 'Revisões de nota em andamento', categoria: 'Notas e diários', perfis: ['reitoria', 'coordenacao', 'professor'],
    rota: '/edu/notas/revisoes', cursoFiltravel: true, escopoUsuario: true,
    async run(c) {
      const ids = await sectionIds(c)
      const w = { tenantId: c.tenantId, status: { in: ['SOLICITADA', 'PARECER_EMITIDO'] as any[] }, ...(ids ? { classSectionId: { in: ids } } : {}) }
      const [n, venc] = await Promise.all([prisma.ntRevisao.count({ where: w }), prisma.ntRevisao.count({ where: { ...w, prazoParecer: { lt: c.now } } })])
      return { valor: n, sentido: 'MENOR_MELHOR', semaforo: venc > 0 ? 'VERMELHO' : n > 10 ? 'AMARELO' : 'VERDE', detalhe: { comParecerVencido: venc } }
    },
  },
  {
    chave: 'reprovacao', titulo: 'Taxa de reprovação (12 meses)', categoria: 'Notas e diários', perfis: ['reitoria', 'coordenacao', 'professor'], unidade: '%',
    rota: '/edu/notas/gestao/ranking', cursoFiltravel: true, escopoUsuario: true,
    async run(c) {
      const ids = await sectionIds(c)
      const w = { tenantId: c.tenantId, encerrado: true, calculadoEm: { gte: new Date(c.now.getTime() - 365 * DAY) }, ...(ids ? { classSectionId: { in: ids } } : {}) }
      const g = await prisma.ntResultado.groupBy({ by: ['situacao'], where: w, _count: { _all: true } })
      const m = await contagemPorStatus(g as any, 'situacao')
      const total = Object.values(m).reduce((s, n) => s + n, 0)
      const rep = (m.REPROVADO_NOTA ?? 0) + (m.REPROVADO_FREQ ?? 0)
      return { valor: total ? pct(rep, total) : null, sentido: 'MENOR_MELHOR', limites: { verde: 12, amarelo: 20 }, detalhe: { reprovados: rep, total, porSituacao: m } }
    },
  },
  {
    chave: 'prof_alunos_em_risco', titulo: 'Alunos em risco nas minhas turmas', categoria: 'Notas e diários', perfis: ['professor'], soProfessor: true,
    rota: '/edu/notas/gestao/risco',
    async run(c) {
      const ids = (await sectionIds(c)) ?? []
      if (!ids.length) return { valor: 0, semaforo: 'VERDE' }
      const n = await prisma.ntResultado.count({ where: { tenantId: c.tenantId, classSectionId: { in: ids }, encerrado: false, situacao: { in: ['RECUPERACAO', 'REPROVADO_FREQ', 'REPROVADO_NOTA'] } } })
      return { valor: n, sentido: 'MENOR_MELHOR', semaforo: semaforoContagem(n, 5) }
    },
  },

  // ===== SECRETARIA =====
  {
    chave: 'requerimentos_abertos', titulo: 'Requerimentos em aberto', categoria: 'Secretaria', perfis: ['reitoria', 'secretaria'],
    rota: '/edu/secretaria/protocolos',
    async run(c) {
      const [g, venc] = await Promise.all([
        prisma.secProtocolo.groupBy({ by: ['status'], where: { tenantId: c.tenantId, status: { in: [...ABERTAS_SEC] } }, _count: { _all: true } }),
        prisma.secProtocolo.count({ where: { tenantId: c.tenantId, status: { in: ['ABERTO', 'EM_ANALISE'] }, prazoEm: { lt: c.now } } }),
      ])
      const m = await contagemPorStatus(g as any, 'status')
      const n = Object.values(m).reduce((s, x) => s + x, 0)
      const semaforo: Semaforo = venc === 0 ? 'VERDE' : venc / Math.max(1, n) <= 0.1 ? 'AMARELO' : 'VERMELHO'
      return { valor: n, sentido: 'MENOR_MELHOR', semaforo, detalhe: { porStatus: m, comSlaVencido: venc } }
    },
  },
  {
    chave: 'requerimentos_sla_vencido', titulo: 'Requerimentos com SLA vencido', categoria: 'Secretaria', perfis: ['reitoria', 'secretaria'],
    rota: '/edu/secretaria/protocolos?atrasados=true',
    async run(c) {
      const n = await prisma.secProtocolo.count({ where: { tenantId: c.tenantId, status: { in: ['ABERTO', 'EM_ANALISE'] }, prazoEm: { lt: c.now } } })
      return { valor: n, sentido: 'MENOR_MELHOR', semaforo: semaforoContagem(n, 5) }
    },
  },
  {
    chave: 'requerimentos_sla_cumprido', titulo: 'SLA cumprido nos requerimentos (90 dias)', categoria: 'Secretaria', perfis: ['reitoria', 'secretaria'], unidade: '%',
    rota: '/edu/secretaria/relatorios',
    async run(c) {
      const taxa = async (de: Date, ate: Date) => {
        const rows = await prisma.secProtocolo.findMany({ where: { tenantId: c.tenantId, concluidoEm: { gte: de, lt: ate } }, select: { prazoEm: true, concluidoEm: true }, take: 20_000 })
        return rows.length ? { v: pct(rows.filter((r) => r.concluidoEm && r.concluidoEm <= r.prazoEm).length, rows.length), n: rows.length } : null
      }
      const [a, b] = await Promise.all([taxa(new Date(c.now.getTime() - 90 * DAY), new Date(c.now.getTime() + DAY)), taxa(new Date(c.now.getTime() - 180 * DAY), new Date(c.now.getTime() - 90 * DAY))])
      return { valor: a?.v ?? null, anterior: b?.v ?? null, sentido: 'MAIOR_MELHOR', limites: { verde: 90, amarelo: 75 }, detalhe: { concluidos: a?.n ?? 0 } }
    },
  },

  // ===== REGULATÓRIO / GOVERNANÇA =====
  {
    chave: 'prazos_regulatorios', titulo: 'Prazos regulatórios vencendo', categoria: 'Regulatório e governança', perfis: ['reitoria', 'coordenacao', 'secretaria'],
    rota: '/edu/regulatorio/alertas', cursoFiltravel: true,
    async run(c) {
      const hoje = c.now
      const d = (n: number) => new Date(hoje.getTime() + n * DAY)
      const pw = c.programId ? { programId: c.programId } : {}
      const procs = c.programId ? (await prisma.regProcesso.findMany({ where: { tenantId: c.tenantId, programId: c.programId }, select: { id: true } })).map((p) => p.id) : undefined
      const dw = procs ? { processoId: { in: procs } } : {}
      const [atosVenc, atos90, atos30, dilVenc, dil15, protocolos30] = await Promise.all([
        prisma.regAto.count({ where: { tenantId: c.tenantId, revogado: false, vencimento: { lt: hoje }, ...pw } }),
        prisma.regAto.count({ where: { tenantId: c.tenantId, revogado: false, vencimento: { gte: hoje, lte: d(90) }, ...pw } }),
        prisma.regAto.count({ where: { tenantId: c.tenantId, revogado: false, vencimento: { gte: hoje, lte: d(30) }, ...pw } }),
        prisma.regDiligencia.count({ where: { tenantId: c.tenantId, status: { in: ['ABERTA', 'VENCIDA'] }, prazoResposta: { lt: hoje }, ...dw } }),
        prisma.regDiligencia.count({ where: { tenantId: c.tenantId, status: 'ABERTA', prazoResposta: { gte: hoje, lte: d(15) }, ...dw } }),
        prisma.regProcesso.count({ where: { tenantId: c.tenantId, etapa: 'PREPARACAO', resultado: 'PENDENTE', prazoProtocolo: { lte: d(30) }, ...pw } }),
      ])
      const vencidos = atosVenc + dilVenc
      const prox30 = atos30 + dil15 + protocolos30
      return { valor: vencidos + prox30 + (atos90 - atos30), sentido: 'MENOR_MELHOR', semaforo: vencidos > 0 ? 'VERMELHO' : prox30 > 0 ? 'AMARELO' : 'VERDE', detalhe: { atosVencidos: atosVenc, diligenciasVencidas: dilVenc, atosVencendo30d: atos30, atosVencendo90d: atos90, diligenciasVencendo15d: dil15, protocolosAte30d: protocolos30 } }
    },
  },
  {
    chave: 'prontidao_regulatoria', titulo: 'Prontidão regulatória (autoavaliação)', categoria: 'Regulatório e governança', perfis: ['reitoria', 'coordenacao'], unidade: '%',
    rota: '/edu/regulatorio/indicadores', cursoFiltravel: true,
    async run(c) {
      const rows = await prisma.regIndicador.findMany({ where: { tenantId: c.tenantId, conceito: { not: null }, ...(c.programId ? { programId: c.programId } : {}) }, select: { conceito: true, instrumento: true }, take: 5000 })
      if (!rows.length) return { valor: null }
      const media = rows.reduce((s, r) => s + (r.conceito ?? 0), 0) / rows.length
      const abaixo = rows.filter((r) => (r.conceito ?? 0) < 3).length
      return { valor: round1((media / 5) * 100), sentido: 'MAIOR_MELHOR', limites: { verde: 80, amarelo: 60 }, detalhe: { conceitoMedio: round2(media), indicadoresAvaliados: rows.length, abaixoDoMinimo: abaixo } }
    },
  },
  {
    chave: 'pdi_execucao', titulo: 'Execução do PDI', categoria: 'Regulatório e governança', perfis: ['reitoria'], unidade: '%',
    rota: '/edu/governanca/pdi',
    async run(c) {
      const pdi = await prisma.govPdi.findFirst({
        where: { tenantId: c.tenantId, status: 'VIGENTE' },
        include: { eixos: { include: { objetivos: { include: { metas: true } } } } },
      })
      if (!pdi) return { valor: null }
      const exec = execucaoPdi(pdi.eixos.map((e) => ({ id: e.id, peso: e.peso, objetivos: e.objetivos.map((o) => ({ id: o.id, peso: o.peso, metas: o.metas.map((m) => ({ id: m.id, peso: m.peso, linhaBase: m.linhaBase, valorMeta: m.valorMeta, valorAtual: m.valorAtual, sentido: m.sentido as any })) })) })))
      const esperado = round1(fracaoPdi(new Date(Date.UTC(pdi.anoInicio, 0, 1)), new Date(Date.UTC(pdi.anoFim, 11, 31)), c.now) * 100)
      const metas = pdi.eixos.flatMap((e) => e.objetivos.flatMap((o) => o.metas))
      const semDados = metas.every((m) => m.valorAtual == null)
      return { valor: round1(exec.percentual), meta: esperado, sentido: 'MAIOR_MELHOR', semaforo: semaforoPdi(exec.percentual, esperado, semDados) as Semaforo, detalhe: { titulo: pdi.titulo, vigencia: `${pdi.anoInicio}-${pdi.anoFim}`, esperadoPct: esperado, metas: metas.length, metasAtrasadasColeta: metas.filter((m) => m.proximaColetaEm && m.proximaColetaEm < c.now).length } }
    },
  },

  // ===== APOIO / EXPERIÊNCIA =====
  {
    chave: 'risco_evasao', titulo: 'Alunos em risco alto/crítico de evasão', categoria: 'Experiência e apoio', perfis: ['reitoria', 'coordenacao'],
    rota: '/edu/apoio/risco', cursoFiltravel: true,
    async run(c) {
      const ids = await studentIdsDoCurso(c)
      const rows = await prisma.apoRiscoSnapshot.findMany({
        where: { tenantId: c.tenantId, calculadoEm: { gte: new Date(c.now.getTime() - 45 * DAY) }, ...(ids ? { studentId: { in: ids } } : {}) },
        orderBy: { calculadoEm: 'desc' }, distinct: ['studentId'], select: { nivel: true }, take: 30_000,
      })
      if (!rows.length) return { valor: null }
      const m: Record<string, number> = {}
      for (const r of rows) m[r.nivel] = (m[r.nivel] ?? 0) + 1
      const alto = (m.ALTO ?? 0) + (m.CRITICO ?? 0)
      const planos = await prisma.apoPlanoAcao.count({ where: { tenantId: c.tenantId, status: 'ABERTO', ...(ids ? { studentId: { in: ids } } : {}) } })
      return { valor: alto, sentido: 'MENOR_MELHOR', semaforo: semaforoPorLimites(pct(alto, rows.length), { sentido: 'MENOR_MELHOR', verde: 8, amarelo: 18 }), detalhe: { avaliados: rows.length, porNivel: m, percentual: pct(alto, rows.length), planosAbertos: planos } }
    },
  },
  {
    chave: 'nps', titulo: 'NPS institucional (90 dias)', categoria: 'Experiência e apoio', perfis: ['reitoria', 'coordenacao', 'admissoes'], unidade: 'pts',
    rota: '/edu/apoio/pesquisas/nps',
    async run(c) {
      const busca = async (de: Date, ate: Date) =>
        calcularNps((await prisma.apoResposta.findMany({ where: { tenantId: c.tenantId, nps: { not: null }, createdAt: { gte: de, lt: ate } }, select: { nps: true }, take: 50_000 })).map((r) => r.nps as number))
      const [a, b] = await Promise.all([busca(new Date(c.now.getTime() - 90 * DAY), new Date(c.now.getTime() + DAY)), busca(new Date(c.now.getTime() - 180 * DAY), new Date(c.now.getTime() - 90 * DAY))])
      return { valor: a.nps, anterior: b.nps, sentido: 'MAIOR_MELHOR', limites: { verde: 50, amarelo: 0 }, detalhe: { respostas: a.total, promotores: a.promotores, neutros: a.neutros, detratores: a.detratores } }
    },
  },
  {
    chave: 'ouvidoria', titulo: 'Manifestações de ouvidoria em aberto', categoria: 'Experiência e apoio', perfis: ['reitoria'],
    rota: '/edu/apoio/ouvidoria/manifestacoes',
    async run(c) {
      const abertas = { tenantId: c.tenantId, status: { in: ['RECEBIDA', 'EM_ANALISE', 'ENCAMINHADA'] as any[] } }
      const [n, venc, aval] = await Promise.all([
        prisma.apoManifestacao.count({ where: abertas }),
        prisma.apoManifestacao.count({ where: { ...abertas, prazoEm: { lt: c.now } } }),
        prisma.apoManifestacao.aggregate({ where: { tenantId: c.tenantId, avaliacaoNota: { not: null } }, _avg: { avaliacaoNota: true } }),
      ])
      return { valor: n, sentido: 'MENOR_MELHOR', semaforo: venc > 0 ? 'VERMELHO' : n > 15 ? 'AMARELO' : 'VERDE', detalhe: { prazoVencido: venc, satisfacaoMedia: aval._avg.avaliacaoNota != null ? round1(aval._avg.avaliacaoNota) : null } }
    },
  },
  {
    chave: 'alertas_inatividade_ead', titulo: 'Alertas de inatividade (EAD)', categoria: 'Experiência e apoio', perfis: ['reitoria', 'coordenacao'],
    rota: '/edu/modalidades/engajamento', cursoFiltravel: true,
    async run(c) {
      const ids = await studentIdsDoCurso(c)
      const n = await prisma.modAlertaInatividade.count({ where: { tenantId: c.tenantId, status: 'ABERTO', ...(ids ? { studentId: { in: ids } } : {}) } })
      return { valor: n, sentido: 'MENOR_MELHOR', semaforo: semaforoContagem(n, 15) }
    },
  },

  // ===== PESQUISA =====
  {
    chave: 'producao_cientifica', titulo: 'Produção científica no ano', categoria: 'Pesquisa', perfis: ['reitoria', 'coordenacao'],
    rota: '/edu/pesquisa/publicacoes', cursoFiltravel: true,
    async run(c) {
      const ano = c.now.getFullYear()
      const pw = c.programId ? { programId: c.programId } : {}
      const frac = Math.max(0.1, (c.now.getTime() - new Date(ano, 0, 1).getTime()) / (365 * DAY))
      const [a, b, proj] = await Promise.all([
        prisma.pesPublicacao.count({ where: { tenantId: c.tenantId, ano, ...pw } }),
        prisma.pesPublicacao.count({ where: { tenantId: c.tenantId, ano: ano - 1, ...pw } }),
        prisma.pesProjeto.count({ where: { tenantId: c.tenantId, status: 'EM_EXECUCAO', ...pw } }),
      ])
      const esperado = round1(b * frac)
      return { valor: a, anterior: esperado, sentido: 'MAIOR_MELHOR', semaforo: b === 0 ? 'CINZA' : semaforoPorRazao(a, esperado), detalhe: { anoAnteriorTotal: b, anteriorProporcional: esperado, projetosEmExecucao: proj } }
    },
  },

  // ===== INFRAESTRUTURA / SUPRIMENTOS =====
  {
    chave: 'manutencao_os_atrasadas', titulo: 'Ordens de serviço em atraso', categoria: 'Infraestrutura e suprimentos', perfis: ['reitoria', 'infraestrutura'],
    rota: '/edu/infraestrutura/ordens-servico',
    async run(c) {
      const abertas = { tenantId: c.tenantId, status: { notIn: ['CONCLUIDA', 'CANCELADA'] as any[] } }
      const [n, atras, paradas, chamados] = await Promise.all([
        prisma.infOrdemServico.count({ where: abertas }),
        prisma.infOrdemServico.count({ where: { ...abertas, prazoSla: { lt: c.now } } }),
        prisma.infOrdemServico.count({ where: { ...abertas, bemParado: true } }),
        prisma.infChamado.count({ where: { tenantId: c.tenantId, status: { in: ['ABERTO', 'EM_ATENDIMENTO'] } } }),
      ])
      return { valor: atras, sentido: 'MENOR_MELHOR', semaforo: paradas > 0 && atras > 0 ? 'VERMELHO' : semaforoContagem(atras, 5), detalhe: { osAbertas: n, bensParados: paradas, chamadosAbertos: chamados } }
    },
  },
  {
    chave: 'chamados_infra', titulo: 'Chamados de infraestrutura abertos', categoria: 'Infraestrutura e suprimentos', perfis: ['infraestrutura'],
    rota: '/edu/infraestrutura/chamados',
    async run(c) {
      const [n, aval] = await Promise.all([
        prisma.infChamado.count({ where: { tenantId: c.tenantId, status: { in: ['ABERTO', 'EM_ATENDIMENTO'] } } }),
        prisma.infChamado.aggregate({ where: { tenantId: c.tenantId, avaliacaoNota: { not: null } }, _avg: { avaliacaoNota: true } }),
      ])
      return { valor: n, sentido: 'MENOR_MELHOR', semaforo: semaforoContagem(n, 10), detalhe: { satisfacaoMedia: aval._avg.avaliacaoNota != null ? round1(aval._avg.avaliacaoNota) : null } }
    },
  },
  {
    chave: 'estoque_critico', titulo: 'Itens de estoque em nível crítico', categoria: 'Infraestrutura e suprimentos', perfis: ['reitoria', 'infraestrutura'],
    rota: '/edu/suprimentos/estoque?critico=true',
    async run(c) {
      const itens = await prisma.supItem.findMany({ where: { tenantId: c.tenantId, ativo: true, estoqueMinimo: { gt: 0 } }, select: { codigo: true, nome: true, estoqueMinimo: true, saldos: { select: { quantidade: true } } }, take: 10_000 })
      const crit = itens.map((i) => ({ codigo: i.codigo, nome: i.nome, minimo: i.estoqueMinimo, saldo: round2(i.saldos.reduce((s, x) => s + x.quantidade, 0)) })).filter((i) => i.saldo <= i.minimo)
      crit.sort((a, b) => a.saldo / a.minimo - b.saldo / b.minimo)
      return { valor: crit.length, sentido: 'MENOR_MELHOR', semaforo: semaforoContagem(crit.length, 5), detalhe: { itensMonitorados: itens.length, zerados: crit.filter((i) => i.saldo <= 0).length, piores: crit.slice(0, 10) } }
    },
  },
  {
    chave: 'requisicoes_aguardando', titulo: 'Requisições aguardando aprovação', categoria: 'Infraestrutura e suprimentos', perfis: ['reitoria', 'infraestrutura', 'administracao'],
    rota: '/edu/suprimentos/requisicoes?status=AGUARDANDO_APROVACAO',
    async run(c) {
      const a = await prisma.supRequisicao.aggregate({ where: { tenantId: c.tenantId, status: 'AGUARDANDO_APROVACAO' }, _count: { _all: true }, _sum: { valorEstimado: true } })
      return { valor: a._count._all, sentido: 'MENOR_MELHOR', semaforo: semaforoContagem(a._count._all, 10), detalhe: { valorEstimado: round2(sum(a._sum.valorEstimado)) } }
    },
  },

  // ===== BIBLIOTECA =====
  {
    chave: 'acervo', titulo: 'Acervo (exemplares ativos)', categoria: 'Biblioteca', perfis: ['reitoria', 'biblioteca'],
    rota: '/edu/biblioteca/acervo',
    async run(c) {
      const [obras, g] = await Promise.all([
        prisma.bibObra.count({ where: { tenantId: c.tenantId, ativo: true } }),
        prisma.bibExemplar.groupBy({ by: ['status'], where: { tenantId: c.tenantId }, _count: { _all: true } }),
      ])
      const m = await contagemPorStatus(g as any, 'status')
      const ativos = Object.entries(m).filter(([k]) => k !== 'BAIXADO').reduce((s, [, n]) => s + n, 0)
      return { valor: ativos, sentido: 'NEUTRO', unidade: 'exemplares', detalhe: { obras, porStatus: m, disponibilidadePct: pct(m.DISPONIVEL ?? 0, ativos) } }
    },
  },
  {
    chave: 'emprestimos_atrasados', titulo: 'Empréstimos em atraso', categoria: 'Biblioteca', perfis: ['reitoria', 'biblioteca'],
    rota: '/edu/biblioteca/emprestimos?atrasados=true',
    async run(c) {
      const [ativos, atras, multas] = await Promise.all([
        prisma.bibEmprestimo.count({ where: { tenantId: c.tenantId, status: 'ATIVO' } }),
        prisma.bibEmprestimo.count({ where: { tenantId: c.tenantId, status: 'ATIVO', dataPrevista: { lt: c.now } } }),
        prisma.bibMulta.aggregate({ where: { tenantId: c.tenantId, status: { in: ['ABERTA', 'EM_COBRANCA'] } }, _sum: { valor: true }, _count: { _all: true } }),
      ])
      return { valor: atras, sentido: 'MENOR_MELHOR', semaforo: semaforoPorLimites(pct(atras, ativos), { sentido: 'MENOR_MELHOR', verde: 5, amarelo: 15 }), detalhe: { emprestimosAtivos: ativos, percentual: pct(atras, ativos), multasAbertas: multas._count._all, valorMultas: round2(sum(multas._sum.valor)) } }
    },
  },
  {
    chave: 'emprestimos_30d', titulo: 'Empréstimos realizados (30 dias)', categoria: 'Biblioteca', perfis: ['biblioteca', 'reitoria'],
    rota: '/edu/biblioteca/emprestimos',
    async run(c) {
      const [a, b] = await Promise.all([
        prisma.bibEmprestimo.count({ where: { tenantId: c.tenantId, dataEmprestimo: { gte: new Date(c.now.getTime() - 30 * DAY) } } }),
        prisma.bibEmprestimo.count({ where: { tenantId: c.tenantId, dataEmprestimo: { gte: new Date(c.now.getTime() - 60 * DAY), lt: new Date(c.now.getTime() - 30 * DAY) } } }),
      ])
      return { valor: a, anterior: b, sentido: 'MAIOR_MELHOR', semaforo: semaforoPorRazao(a, b, 'MAIOR_MELHOR', { verde: 0.9, amarelo: 0.7 }) }
    },
  },

  // ===== DESEMPENHO EM EXAMES =====
  {
    chave: 'desempenho_exames', titulo: 'Desempenho em exames (ENADE/OAB) — conceito médio', categoria: 'Desempenho em exames', perfis: ['reitoria', 'coordenacao'], unidade: 'pts',
    rota: '/edu/desempenho/painel', cursoFiltravel: true,
    async run(c) {
      const pw = c.programId ? { programId: c.programId } : {}
      const [agg, pend, prox] = await Promise.all([
        prisma.desInscricao.aggregate({ where: { tenantId: c.tenantId, conceito: { not: null }, ...pw }, _avg: { conceito: true }, _count: { _all: true } }),
        prisma.desInscricao.count({ where: { tenantId: c.tenantId, situacao: 'PENDENTE', ...pw } }),
        prisma.desEdicao.count({ where: { tenantId: c.tenantId, dataProva: { gte: c.now, lte: new Date(c.now.getTime() + 90 * DAY) } } }),
      ])
      return { valor: agg._avg.conceito != null ? round2(agg._avg.conceito) : null, sentido: 'MAIOR_MELHOR', limites: { verde: 4, amarelo: 3 }, detalhe: { avaliados: agg._count._all, inscricoesPendentes: pend, provasEm90Dias: prox } }
    },
  },

  // ===== PROCESSOS / PENDÊNCIAS =====
  {
    chave: 'jornadas_atrasadas', titulo: 'Etapas de jornada atrasadas', categoria: 'Processos e pendências', perfis: ['reitoria', 'secretaria', 'coordenacao'],
    rota: '/edu/jornadas/atrasadas',
    async run(c) {
      const rows = await prisma.jorEtapa.findMany({
        where: { tenantId: c.tenantId, instancia: { status: 'ATIVA' }, OR: [{ status: 'ATRASADA' }, { status: 'ABERTA', prazoEm: { lt: c.now } }] },
        select: { modulo: true }, take: 20_000,
      })
      const m: Record<string, number> = {}
      for (const r of rows) m[r.modulo ?? 'geral'] = (m[r.modulo ?? 'geral'] ?? 0) + 1
      return { valor: rows.length, sentido: 'MENOR_MELHOR', semaforo: semaforoContagem(rows.length, 10), detalhe: { porModulo: m } }
    },
  },
  {
    chave: 'lembretes_criticos', titulo: 'Lembretes críticos ou vencidos', categoria: 'Processos e pendências', perfis: ['reitoria', 'coordenacao', 'secretaria', 'administracao', 'infraestrutura', 'biblioteca', 'admissoes'],
    rota: '/edu/reitoria/mesa',
    async run(c) {
      const rows = await prisma.eduReminder.findMany({
        where: { tenantId: c.tenantId, status: { in: ['PENDENTE', 'NOTIFICADO', 'ADIADO'] }, OR: [{ severity: 'CRITICO' }, { dueAt: { lt: c.now } }] },
        select: { modulo: true, dueAt: true, severity: true }, take: 20_000,
      })
      const m: Record<string, number> = {}
      for (const r of rows) m[r.modulo] = (m[r.modulo] ?? 0) + 1
      const venc = rows.filter((r) => r.dueAt < c.now).length
      return { valor: rows.length, sentido: 'MENOR_MELHOR', semaforo: venc > 10 ? 'VERMELHO' : semaforoContagem(rows.length, 10), detalhe: { vencidos: venc, porModulo: m } }
    },
  },
]

async function receitaDespesa(c: Ctx, tipo: 'RECEITA' | 'DESPESA', mesesAtras: number): Promise<number> {
  const ini = new Date(c.now.getFullYear(), c.now.getMonth() - mesesAtras, 1)
  const decorrido = c.now.getTime() - startOfMonth(c.now).getTime()
  const fimMes = new Date(c.now.getFullYear(), c.now.getMonth() - mesesAtras + 1, 1)
  const fim = mesesAtras === 0 ? new Date(c.now.getTime() + 1) : new Date(Math.min(fimMes.getTime(), ini.getTime() + decorrido))
  const a = await prisma.paymentTransaction.aggregate({ where: { tenantId: c.tenantId, tipo, dataTransacao: { gte: ini, lt: fim } }, _sum: { valor: true } })
  return round2(sum(a._sum.valor))
}

// ---------------- execução com isolamento ----------------

export const CATALOGO = DEFS.map((d) => ({ chave: d.chave, titulo: d.titulo, categoria: d.categoria, perfis: d.perfis, rota: d.rota, unidade: d.unidade ?? '', cursoFiltravel: !!d.cursoFiltravel }))

const cache = new TTLCache<Indicador>(60_000, 5000)
export const limparCachePainel = (tenantId: string) => cache.clearPrefix(`${tenantId}|`)

const TIMEOUT_MS = 12_000
function comTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('tempo esgotado')), ms)
    p.then((v) => { clearTimeout(t); resolve(v) }, (e) => { clearTimeout(t); reject(e) })
  })
}

async function executar(d: Def, c: Ctx): Promise<Indicador> {
  const key = `${c.tenantId}|${c.programId ?? '-'}|${d.escopoUsuario || d.soProfessor ? c.userId ?? '-' : '-'}|${d.chave}`
  const hit = cache.get(key)
  if (hit) return hit
  const base = { chave: d.chave, titulo: d.titulo, categoria: d.categoria, unidade: d.unidade ?? '', rota: d.rota, perfis: d.perfis, sentido: 'NEUTRO' as Sentido }
  let out: Indicador
  try {
    const r = await comTimeout(d.run(c), TIMEOUT_MS)
    if (!r) out = montarIndicador({ ...base, valor: null })
    else out = montarIndicador({ ...base, ...r, unidade: r.unidade ?? base.unidade, rota: r.rota ?? base.rota, sentido: r.sentido ?? 'NEUTRO', valor: r.valor })
  } catch (e: any) {
    console.warn(`[reitoria:indicador:${d.chave}]`, e?.message || e)
    out = montarIndicador({ ...base, valor: null, erro: String(e?.message || e).slice(0, 200) })
  }
  cache.set(key, out)
  return out
}

async function emLotes<T, R>(items: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < items.length; i += n) out.push(...(await Promise.all(items.slice(i, i + n).map(f))))
  return out
}

export interface OpcoesPainel { tenantId: string; perfil: Perfil; programId?: string; userId?: string; chaves?: string[]; now?: Date }

export function selecionarDefs(o: Pick<OpcoesPainel, 'perfil' | 'programId' | 'userId' | 'chaves'>): Def[] {
  return DEFS.filter((d) => {
    if (o.chaves && !o.chaves.includes(d.chave)) return false
    if (!d.perfis.includes(o.perfil)) return false
    if (d.soProfessor && !o.userId) return false
    if (o.programId && !d.cursoFiltravel) return false
    return true
  })
}

export async function calcularIndicadores(o: OpcoesPainel): Promise<Indicador[]> {
  const ctx: Ctx = { tenantId: o.tenantId, programId: o.programId, userId: o.perfil === 'professor' ? o.userId : undefined, now: o.now ?? new Date(), memo: new Map() }
  const defs = selecionarDefs({ ...o, userId: ctx.userId })
  const inds = await emLotes(defs, 6, (d) => executar(d, ctx))
  if (!ctx.programId && !ctx.userId) await aplicarSnapshots(o.tenantId, inds, ctx.now)
  return inds
}

// Todos os indicadores institucionais (para OKR sync, snapshots, relatório).
export const calcularTodos = (tenantId: string) => calcularIndicadores({ tenantId, perfil: 'reitoria' })

// ---------------- snapshots (variação vs. período anterior) ----------------

const diaISO = (d: Date) => d.toISOString().slice(0, 10)

async function aplicarSnapshots(tenantId: string, inds: Indicador[], now: Date) {
  try {
    const alvo = inds.filter((i) => i.valor != null && i.anterior == null)
    if (!alvo.length) return
    const de = diaISO(new Date(now.getTime() - 45 * DAY))
    const ate = diaISO(new Date(now.getTime() - 20 * DAY))
    const rows = await prisma.reiSnapshot.findMany({ where: { tenantId, chave: { in: alvo.map((i) => i.chave) }, dia: { gte: de, lte: ate } }, orderBy: { dia: 'desc' } })
    const porChave = new Map<string, number>()
    for (const r of rows) if (!porChave.has(r.chave)) porChave.set(r.chave, r.valor)
    for (const i of alvo) {
      const ant = porChave.get(i.chave)
      if (ant == null) continue
      const v = variacao(i.valor, ant)
      i.anterior = ant; i.anteriorFonte = 'SNAPSHOT'; i.variacaoAbs = v.abs; i.variacaoPct = v.pct; i.tendencia = v.tendencia
      i.favoravel = variacaoFavoravel(v.tendencia, i.sentido)
    }
  } catch (e: any) {
    console.warn('[reitoria:snapshots]', e?.message || e)
  }
}

export async function salvarSnapshots(tenantId: string, inds: Indicador[], now = new Date()) {
  const dia = diaISO(now)
  let n = 0
  for (const i of inds) {
    if (i.valor == null || !Number.isFinite(i.valor)) continue
    await prisma.reiSnapshot.upsert({
      where: { tenantId_chave_dia: { tenantId, chave: i.chave, dia } },
      create: { tenantId, chave: i.chave, dia, valor: i.valor, semaforo: i.semaforo },
      update: { valor: i.valor, semaforo: i.semaforo },
    })
    n++
  }
  return n
}
