import { prisma } from '../../lib/prisma'
import { Painel, painelVazio, semaforoPct, serie1 } from './painelTipos'
import { media, pct, round1, seguro, somar } from './util2'

// Relatórios por nível: GRADUAÇÃO, PÓS lato sensu (especialização/MBA) e PÓS stricto sensu
// (mestrado/doutorado), consolidados em matrículas, evasão, conclusão e produção.

const LATO = ['ESPECIALIZACAO', 'MBA'] as const
const STRICTO = ['MESTRADO_ACADEMICO', 'MESTRADO_PROFISSIONAL', 'DOUTORADO'] as const
const MESES_MS = 30.4375 * 86_400_000

export interface ResumoNivel { nivel: 'GRADUACAO' | 'POS_LATO' | 'POS_STRICTO'; programas: number; alunosAtivos: number; totalMatriculas: number; evasaoPct: number | null; conclusaoPct: number | null; trancados: number; producao: number }

export async function dadosGraduacao(tenantId: string, now = new Date()) {
  const progs = await prisma.academicProgram.findMany({ where: { tenantId }, select: { id: true, nome: true, modalidade: true }, take: 500 })
  const porStatus = await prisma.enrollment.groupBy({ by: ['programId', 'status'], where: { student: { tenantId } }, _count: { _all: true } })
  const ingressos = await prisma.enrollment.findMany({ where: { student: { tenantId } }, select: { dataMatricula: true }, take: 200_000 })
  const pubs = await seguro('publicacoes', [], () => prisma.pesPublicacao.groupBy({ by: ['programId'], where: { tenantId, programId: { in: progs.map((p) => p.id) } }, _count: { _all: true } }), [] as any[])
  const prodPor = new Map<string, number>(pubs.map((p: any) => [p.programId, p._count._all]))
  const linhas = progs.map((p) => {
    const c = (s: string) => porStatus.find((x) => x.programId === p.id && x.status === s)?._count._all ?? 0
    const total = c('ATIVA') + c('TRANCADA') + c('CANCELADA') + c('CONCLUIDA')
    return { programId: p.id, curso: p.nome, modalidade: p.modalidade, ativas: c('ATIVA'), trancadas: c('TRANCADA'), canceladas: c('CANCELADA'), concluidas: c('CONCLUIDA'), total, evasaoPct: pct(c('CANCELADA'), total), trancamentoPct: pct(c('TRANCADA'), total), conclusaoPct: pct(c('CONCLUIDA'), total), producao: prodPor.get(p.id) ?? 0 }
  }).sort((a, b) => b.total - a.total)
  const anos: Record<string, number> = {}
  for (const i of ingressos) { const a = String(i.dataMatricula.getUTCFullYear()); anos[a] = (anos[a] ?? 0) + 1 }
  const ano0 = now.getUTCFullYear()
  const serieIng = Array.from({ length: 6 }, (_, k) => String(ano0 - 5 + k)).map((a) => ({ rotulo: a, valor: anos[a] ?? 0 }))
  const tot = (k: 'ativas' | 'trancadas' | 'canceladas' | 'concluidas' | 'total' | 'producao') => somar(linhas.map((l) => l[k]))
  const resumo: ResumoNivel = { nivel: 'GRADUACAO', programas: progs.length, alunosAtivos: tot('ativas'), totalMatriculas: tot('total'), evasaoPct: pct(tot('canceladas'), tot('total')), conclusaoPct: pct(tot('concluidas'), tot('total')), trancados: tot('trancadas'), producao: tot('producao') }
  return { linhas, serieIng, resumo }
}

export async function painelGraduacao(tenantId: string, now = new Date()): Promise<Painel> {
  const p = painelVazio('graduacao', 'Graduação', 'Matrículas, evasão, conclusão e produção por curso de graduação.', now)
  const d = await dadosGraduacao(tenantId, now)
  p.kpis = [
    { chave: 'cursos', rotulo: 'Cursos', valor: d.resumo.programas, unidade: 'n' },
    { chave: 'ativos', rotulo: 'Alunos ativos', valor: d.resumo.alunosAtivos, unidade: 'n' },
    { chave: 'evasao', rotulo: 'Cancelamento (evasão)', valor: d.resumo.evasaoPct, unidade: '%', alerta: semaforoPct(d.resumo.evasaoPct, 8, 15) },
    { chave: 'trancados', rotulo: 'Trancados', valor: d.resumo.trancados, unidade: 'n' },
    { chave: 'conclusao', rotulo: 'Concluídos / matrículas', valor: d.resumo.conclusaoPct, unidade: '%' },
    { chave: 'producao', rotulo: 'Publicações vinculadas', valor: d.resumo.producao, unidade: 'n' },
  ]
  p.series = [serie1('ingressantes', 'Ingressantes por ano', 'barra', d.serieIng, 'n'), serie1('ativas-curso', 'Alunos ativos por curso', 'barra', d.linhas.slice(0, 12).map((l) => ({ rotulo: l.curso, valor: l.ativas })), 'n')]
  p.tabelas = [{ chave: 'cursos', titulo: 'Cursos de graduação', colunas: [{ key: 'curso', label: 'Curso' }, { key: 'modalidade', label: 'Modalidade' }, { key: 'ativas', label: 'Ativas', tipo: 'numero' }, { key: 'trancadas', label: 'Trancadas', tipo: 'numero' }, { key: 'canceladas', label: 'Canceladas', tipo: 'numero' }, { key: 'concluidas', label: 'Concluídas', tipo: 'numero' }, { key: 'evasaoPct', label: 'Evasão %', tipo: 'pct' }, { key: 'conclusaoPct', label: 'Conclusão %', tipo: 'pct' }, { key: 'producao', label: 'Publicações', tipo: 'numero' }], linhas: d.linhas }]
  if (!d.linhas.length) p.avisos.push('Nenhum curso de graduação cadastrado.')
  return p
}

export async function dadosPos(tenantId: string, grupo: 'LATO' | 'STRICTO', now = new Date()) {
  const niveis = (grupo === 'LATO' ? LATO : STRICTO) as readonly string[]
  const progs = await prisma.modPosPrograma.findMany({ where: { tenantId, nivel: { in: niveis as any } }, select: { id: true, nome: true, nivel: true, programId: true, conceitoCapes: true, status: true }, take: 500 })
  const ids = progs.map((x) => x.id)
  const alunos = await prisma.modPosAluno.findMany({ where: { tenantId, posId: { in: ids } }, select: { posId: true, status: true, ingressoEm: true, tituladoEm: true, defendidoEm: true, prazoDefesa: true }, take: 100_000 })
  const pubs = await seguro('publicacoes-pos', [], () => prisma.pesPublicacao.groupBy({ by: ['programId'], where: { tenantId, programId: { in: [...ids, ...progs.map((x) => x.programId).filter((x): x is string => !!x)] } }, _count: { _all: true } }), [] as any[])
  const prod = (pr: { id: string; programId: string | null }) => somar(pubs.filter((x: any) => x.programId === pr.id || (pr.programId && x.programId === pr.programId)).map((x: any) => x._count._all))
  const ano = new Date(now.getTime() - 365 * 86_400_000)
  const linhas = progs.map((pr) => {
    const al = alunos.filter((a) => a.posId === pr.id)
    const c = (s: string) => al.filter((a) => a.status === s).length
    const ativos = c('MATRICULADO') + c('QUALIFICADO') + c('DEFENDIDO')
    const tit = al.filter((a) => a.tituladoEm)
    return {
      posId: pr.id, programa: pr.nome, nivel: pr.nivel, conceitoCapes: pr.conceitoCapes, status: pr.status, total: al.length, ativos, trancados: c('TRANCADO'), desligados: c('DESLIGADO'), titulados: c('TITULADO'),
      evasaoPct: pct(c('DESLIGADO'), al.length), conclusaoPct: pct(c('TITULADO'), al.length),
      tempoMedioTitulacaoMeses: media(tit.map((a) => (a.tituladoEm!.getTime() - a.ingressoEm.getTime()) / MESES_MS)),
      defesasUltimos12m: al.filter((a) => a.defendidoEm && a.defendidoEm >= ano).length,
      prazosDefesaVencidos: al.filter((a) => a.prazoDefesa && a.prazoDefesa < now && !a.defendidoEm && ['MATRICULADO', 'QUALIFICADO'].includes(a.status)).length,
      producao: prod(pr),
    }
  }).sort((a, b) => b.total - a.total)
  const tot = (k: 'total' | 'ativos' | 'trancados' | 'desligados' | 'titulados' | 'producao' | 'defesasUltimos12m' | 'prazosDefesaVencidos') => somar(linhas.map((l) => l[k]))
  const resumo: ResumoNivel = { nivel: grupo === 'LATO' ? 'POS_LATO' : 'POS_STRICTO', programas: progs.length, alunosAtivos: tot('ativos'), totalMatriculas: tot('total'), evasaoPct: pct(tot('desligados'), tot('total')), conclusaoPct: pct(tot('titulados'), tot('total')), trancados: tot('trancados'), producao: tot('producao') }
  const porAno: Record<string, number> = {}
  for (const a of alunos) if (a.tituladoEm) { const k = String(a.tituladoEm.getUTCFullYear()); porAno[k] = (porAno[k] ?? 0) + 1 }
  const a0 = now.getUTCFullYear()
  const serieTit = Array.from({ length: 6 }, (_, k) => String(a0 - 5 + k)).map((a) => ({ rotulo: a, valor: porAno[a] ?? 0 }))
  return { linhas, resumo, serieTit, defesas: tot('defesasUltimos12m'), vencidos: tot('prazosDefesaVencidos') }
}

export async function painelPos(tenantId: string, grupo: 'LATO' | 'STRICTO', now = new Date()): Promise<Painel> {
  const lato = grupo === 'LATO'
  const p = painelVazio(lato ? 'pos-lato' : 'pos-stricto', lato ? 'Pós-graduação lato sensu' : 'Pós-graduação stricto sensu', lato ? 'Especialização e MBA: matrículas, evasão, conclusão e produção.' : 'Mestrado e doutorado: discentes, titulação, defesas e produção.', now)
  const d = await dadosPos(tenantId, grupo, now)
  p.kpis = [
    { chave: 'programas', rotulo: 'Programas', valor: d.resumo.programas, unidade: 'n' },
    { chave: 'ativos', rotulo: 'Alunos ativos', valor: d.resumo.alunosAtivos, unidade: 'n' },
    { chave: 'evasao', rotulo: 'Desligamento (evasão)', valor: d.resumo.evasaoPct, unidade: '%', alerta: semaforoPct(d.resumo.evasaoPct, 10, 20) },
    { chave: 'conclusao', rotulo: 'Titulados / matrículas', valor: d.resumo.conclusaoPct, unidade: '%' },
    { chave: 'defesas', rotulo: 'Defesas (12 meses)', valor: d.defesas, unidade: 'n' },
    { chave: 'vencidos', rotulo: 'Prazos de defesa vencidos', valor: d.vencidos, unidade: 'n', alerta: d.vencidos ? 'VERMELHO' : 'VERDE' },
    { chave: 'producao', rotulo: 'Publicações vinculadas', valor: d.resumo.producao, unidade: 'n' },
  ]
  p.series = [serie1('titulados', 'Titulados por ano', 'barra', d.serieTit, 'n'), serie1('ativos-prog', 'Alunos ativos por programa', 'barra', d.linhas.slice(0, 12).map((l) => ({ rotulo: l.programa, valor: l.ativos })), 'n')]
  p.tabelas = [{ chave: 'programas', titulo: lato ? 'Programas lato sensu' : 'Programas stricto sensu', colunas: [{ key: 'programa', label: 'Programa' }, { key: 'nivel', label: 'Nível' }, ...(lato ? [] : [{ key: 'conceitoCapes', label: 'Conceito CAPES', tipo: 'numero' as const }]), { key: 'ativos', label: 'Ativos', tipo: 'numero' }, { key: 'trancados', label: 'Trancados', tipo: 'numero' }, { key: 'desligados', label: 'Desligados', tipo: 'numero' }, { key: 'titulados', label: 'Titulados', tipo: 'numero' }, { key: 'evasaoPct', label: 'Evasão %', tipo: 'pct' }, { key: 'conclusaoPct', label: 'Conclusão %', tipo: 'pct' }, { key: 'tempoMedioTitulacaoMeses', label: 'Tempo médio (meses)', tipo: 'numero' }, { key: 'prazosDefesaVencidos', label: 'Prazos vencidos', tipo: 'numero' }, { key: 'producao', label: 'Publicações', tipo: 'numero' }], linhas: d.linhas }]
  if (!d.linhas.length) p.avisos.push('Nenhum programa deste nível cadastrado no módulo de Modalidades/Pós.')
  return p
}

export async function painelNiveis(tenantId: string, now = new Date()): Promise<Painel> {
  const p = painelVazio('niveis', 'Graduação e pós-graduação — consolidado', 'Comparativo por nível: matrículas, evasão, conclusão e produção.', now)
  const [g, l, s] = await Promise.all([dadosGraduacao(tenantId, now), dadosPos(tenantId, 'LATO', now), dadosPos(tenantId, 'STRICTO', now)])
  const rs = [g.resumo, l.resumo, s.resumo]
  const rotulo: Record<string, string> = { GRADUACAO: 'Graduação', POS_LATO: 'Pós lato sensu', POS_STRICTO: 'Pós stricto sensu' }
  p.kpis = [
    { chave: 'ativos', rotulo: 'Alunos ativos (todos os níveis)', valor: somar(rs.map((r) => r.alunosAtivos)), unidade: 'n' },
    { chave: 'programas', rotulo: 'Cursos e programas', valor: somar(rs.map((r) => r.programas)), unidade: 'n' },
    { chave: 'producao', rotulo: 'Publicações vinculadas', valor: somar(rs.map((r) => r.producao)), unidade: 'n' },
  ]
  p.series = [
    { chave: 'ativos-nivel', titulo: 'Alunos ativos por nível', tipo: 'pizza', unidade: 'n', rotulos: rs.map((r) => rotulo[r.nivel]), dados: [{ nome: 'Ativos', valores: rs.map((r) => r.alunosAtivos) }] },
    { chave: 'evasao-conclusao', titulo: 'Evasão e conclusão (%)', tipo: 'barra', unidade: '%', rotulos: rs.map((r) => rotulo[r.nivel]), dados: [{ nome: 'Evasão %', valores: rs.map((r) => r.evasaoPct) }, { nome: 'Conclusão %', valores: rs.map((r) => r.conclusaoPct) }] },
  ]
  p.tabelas = [{ chave: 'niveis', titulo: 'Por nível', colunas: [{ key: 'nivel', label: 'Nível' }, { key: 'programas', label: 'Cursos/programas', tipo: 'numero' }, { key: 'alunosAtivos', label: 'Alunos ativos', tipo: 'numero' }, { key: 'totalMatriculas', label: 'Total de matrículas', tipo: 'numero' }, { key: 'trancados', label: 'Trancados', tipo: 'numero' }, { key: 'evasaoPct', label: 'Evasão %', tipo: 'pct' }, { key: 'conclusaoPct', label: 'Conclusão %', tipo: 'pct' }, { key: 'producao', label: 'Publicações', tipo: 'numero' }], linhas: rs.map((r) => ({ ...r, nivel: rotulo[r.nivel], evasaoPct: r.evasaoPct == null ? null : round1(r.evasaoPct) })) }]
  return p
}
