import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, requireRole } from '../academico/middleware'
import { pageParams, parseBody, qs } from '../core/crud'
import { audit } from '../core/notify'
import { mascararCpf } from '../lgpd/mascara'
import { registrarAcessoSensivel } from '../lgpd/sensiveis'
import { Aba, gerarXlsx } from './xlsx'
import {
  MOD, SEC_READ, SEC_WRITE, assertNoTenant, br, chunk, escHtml, fail, isSuper, optDate, optStr, paginaHtml, parseTerm, roleOf, soDigitos, temPapel, tid, uid, uniq, ymd,
} from './common'

const STATUS_CURSO = ['CURSANDO', 'FORMANDO', 'FORMADO', 'TRANCADO', 'JUBILADO', 'TRANSFERIDO', 'EVADIDO'] as const
const STATUS_CONTRATO = ['RASCUNHO', 'PENDENTE_ASSINATURA', 'ASSINADO', 'RESCINDIDO', 'ENCERRADO', 'CANCELADO'] as const
const STATUS_MATRICULA = ['ATIVA', 'TRANCADA', 'CANCELADA', 'CONCLUIDA'] as const

export interface FiltroAlunos {
  ano?: number; periodo?: number; termId?: string; programId?: string; somenteNovos?: boolean; nee?: boolean; matriculaDe?: Date; matriculaAte?: Date
  classSectionId?: string; contratoStatus?: string; statusCurso?: string; statusMatricula?: string; poloId?: string; q?: string; inadimplente?: boolean
  turno?: string; semDocumentos?: boolean; aniversarioMes?: number
}

export function lerFiltro(query: any): FiltroAlunos {
  const f: FiltroAlunos = {}
  const num = (k: string) => { const v = qs(query[k]); if (v === undefined) return undefined; if (!/^\d+$/.test(v)) fail(400, `Filtro inválido: ${k}.`); return Number(v) }
  const bool = (k: string) => { const v = qs(query[k]); return v === undefined ? undefined : v === 'true' || v === '1' }
  const date = (k: string) => { const v = qs(query[k]); if (!v) return undefined; const d = new Date(v.length === 10 ? `${v}T00:00:00-03:00` : v); if (isNaN(d.getTime())) fail(400, `Data inválida: ${k}.`); return d }
  f.ano = num('ano'); f.periodo = num('periodo'); f.aniversarioMes = num('mes')
  if (f.aniversarioMes !== undefined && (f.aniversarioMes < 1 || f.aniversarioMes > 12)) fail(400, 'Mês inválido.')
  f.termId = qs(query.termId); f.programId = qs(query.programId); f.classSectionId = qs(query.classSectionId); f.poloId = qs(query.poloId); f.turno = qs(query.turno)
  f.somenteNovos = bool('novos'); f.nee = bool('nee'); f.inadimplente = bool('inadimplente'); f.semDocumentos = bool('semDocumentos')
  f.matriculaDe = date('matriculaDe'); f.matriculaAte = date('matriculaAte')
  if (f.matriculaAte && qs(query.matriculaAte)!.length === 10) f.matriculaAte = new Date(f.matriculaAte.getTime() + 86_399_999)
  const cs = qs(query.contratoStatus); if (cs) { if (!(STATUS_CONTRATO as readonly string[]).includes(cs)) fail(400, 'Status de contrato inválido.'); f.contratoStatus = cs }
  const sc = qs(query.statusCurso); if (sc) { if (!(STATUS_CURSO as readonly string[]).includes(sc)) fail(400, 'Status do curso inválido.'); f.statusCurso = sc }
  const sm = qs(query.statusMatricula); if (sm) { if (!(STATUS_MATRICULA as readonly string[]).includes(sm)) fail(400, 'Status da matrícula inválido.'); f.statusMatricula = sm }
  f.q = qs(query.q)?.trim().slice(0, 100) || undefined
  return f
}

export interface LinhaAluno {
  id: string; ra: string; nome: string; nomeSocial: string | null; cpf: string; rg: string | null; email: string | null; telefone: string | null; nee: boolean
  dataNascimento: Date | null; statusAluno: string; fotoUrl: string | null; polo: string | null
  cursos: Array<{ enrollmentId: string; programId: string; programa: string; periodoLetivo: string; termId: string; statusMatricula: string; statusCurso: string | null; turno: string | null; matriculaNova: boolean; dataMatricula: Date; turmas: string[] }>
  contratoStatus: string | null; inadimplente: boolean; valorEmAtraso: number
}

const verCpfCompleto = (req: AuthenticatedRequest) => temPapel(req, 'SECRETARY')

/** Constrói a consulta de alunos com todos os filtros da secretaria. Retorna linhas enriquecidas. */
export async function consultarAlunos(tenantId: string, f: FiltroAlunos, req: AuthenticatedRequest, pag: { skip: number; take: number } | null) {
  const and: any[] = [{ tenantId }]
  const idSets: string[][] = []

  // períodos letivos (ano/período/termId)
  let termIds: string[] | undefined
  if (f.termId) termIds = [f.termId]
  else if (f.ano !== undefined || f.periodo !== undefined) {
    const terms = await prisma.academicTerm.findMany({ where: { tenantId }, select: { id: true, codigo: true } })
    termIds = terms.filter((t) => { const p = parseTerm(t.codigo); return (f.ano === undefined || p.ano === f.ano) && (f.periodo === undefined || p.periodo === f.periodo) }).map((t) => t.id)
  }

  // filtros que vivem na matrícula estendida
  const extWhere: any = { tenantId }
  let usaExt = false
  if (f.statusCurso) { extWhere.statusCurso = f.statusCurso; usaExt = true }
  if (f.somenteNovos) { extWhere.matriculaNova = true; usaExt = true }
  if (f.turno) { extWhere.turno = f.turno; usaExt = true }
  let extEnrollIds: string[] | undefined
  if (usaExt) extEnrollIds = (await prisma.acaMatriculaExt.findMany({ where: extWhere, select: { enrollmentId: true } })).map((e) => e.enrollmentId)

  const enr: any = { }
  if (termIds) enr.termId = { in: termIds }
  if (f.programId) enr.programId = f.programId
  if (f.statusMatricula) enr.status = f.statusMatricula
  if (f.matriculaDe || f.matriculaAte) enr.dataMatricula = { ...(f.matriculaDe ? { gte: f.matriculaDe } : {}), ...(f.matriculaAte ? { lte: f.matriculaAte } : {}) }
  if (f.classSectionId) enr.turmas = { some: { classSectionId: f.classSectionId } }
  if (extEnrollIds) enr.id = { in: extEnrollIds }
  if (Object.keys(enr).length) and.push({ matriculas: { some: enr } })

  // perfil (NEE, polo, aniversariantes)
  if (f.nee === false) and.push({ id: { notIn: (await prisma.acaAlunoPerfil.findMany({ where: { tenantId, nee: true }, select: { studentId: true } })).map((p) => p.studentId) } })
  if (f.nee === true || f.poloId) {
    const pw: any = { tenantId }
    if (f.nee === true) pw.nee = true
    if (f.poloId) pw.poloId = f.poloId
    idSets.push((await prisma.acaAlunoPerfil.findMany({ where: pw, select: { studentId: true } })).map((p) => p.studentId))
  }
  if (f.contratoStatus) idSets.push(uniq((await prisma.acaContrato.findMany({ where: { tenantId, status: f.contratoStatus }, select: { studentId: true } })).map((c) => c.studentId)))
  if (f.inadimplente) idSets.push(uniq((await prisma.accountReceivable.findMany({ where: { tenantId, status: { in: ['PENDENTE', 'ATRASADO'] }, dataVencimento: { lt: new Date() } }, select: { studentId: true } })).map((c) => c.studentId)))
  if (f.semDocumentos) idSets.push(uniq((await prisma.acaDocumentoAluno.findMany({ where: { tenantId, obrigatorio: true, status: { in: ['PENDENTE', 'REJEITADO'] } }, select: { studentId: true } })).map((c) => c.studentId)))
  if (f.aniversarioMes) {
    const alunos = await prisma.student.findMany({ where: { tenantId, dataNascimento: { not: null } }, select: { id: true, dataNascimento: true } })
    idSets.push(alunos.filter((a) => a.dataNascimento!.getUTCMonth() + 1 === f.aniversarioMes).map((a) => a.id))
  }
  for (const s of idSets) and.push({ id: { in: s } })

  // busca livre: nome, RA, CPF, RG, telefone, e-mail
  if (f.q) {
    const q = f.q
    const dig = soDigitos(q)
    const perfOr: any[] = [{ email: { contains: q, mode: 'insensitive' } }, { rg: { contains: q, mode: 'insensitive' } }, { telefone: { contains: q } }, { nomeSocial: { contains: q, mode: 'insensitive' } }]
    const perf = new Set((await prisma.acaAlunoPerfil.findMany({ where: { tenantId, OR: perfOr }, select: { studentId: true } })).map((p) => p.studentId))
    const or: any[] = [{ nomeCompleto: { contains: q, mode: 'insensitive' } }, { ra: { contains: q, mode: 'insensitive' } }, { cpf: { contains: q } }]
    if (dig.length >= 3) {
      // busca por dígitos ignorando máscara (CPF, RG, telefone)
      const like = `%${dig}%`
      const a = await prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM "Student" WHERE "tenantId" = ${tenantId} AND regexp_replace(coalesce(cpf, ''), '[^0-9]', '', 'g') LIKE ${like}`
      for (const x of a) or.push({ id: x.id })
      const b = await prisma.$queryRaw<Array<{ sid: string }>>`SELECT "studentId" AS sid FROM "AcaAlunoPerfil" WHERE "tenantId" = ${tenantId} AND (regexp_replace(coalesce(telefone, ''), '[^0-9]', '', 'g') LIKE ${like} OR regexp_replace(coalesce(rg, ''), '[^0-9]', '', 'g') LIKE ${like})`
      for (const x of b) perf.add(x.sid)
    }
    if (perf.size) or.push({ id: { in: [...perf] } })
    and.push({ OR: or })
  }

  const where = { AND: and }
  const [total, alunos] = await Promise.all([
    prisma.student.count({ where }),
    prisma.student.findMany({ where, orderBy: [{ nomeCompleto: 'asc' }, { id: 'asc' }], ...(pag ?? { take: 20000, skip: 0 }), include: { matriculas: { orderBy: { dataMatricula: 'desc' }, include: { turmas: { include: { classSection: { select: { nome: true } } } } } } } }),
  ])
  const ids = alunos.map((a) => a.id)
  const enrIds = alunos.flatMap((a) => a.matriculas.map((m) => m.id))
  const programIds = uniq(alunos.flatMap((a) => a.matriculas.map((m) => m.programId)))
  const termIdsAll = uniq(alunos.flatMap((a) => a.matriculas.map((m) => m.termId)))
  const poloIdsLookup: string[] = []
  const [perfis, exts, contratos, programs, terms, receb] = await Promise.all([
    prisma.acaAlunoPerfil.findMany({ where: { tenantId, studentId: { in: ids } } }),
    prisma.acaMatriculaExt.findMany({ where: { tenantId, enrollmentId: { in: enrIds } } }),
    prisma.acaContrato.findMany({ where: { tenantId, studentId: { in: ids } }, orderBy: { createdAt: 'desc' } }),
    prisma.academicProgram.findMany({ where: { tenantId, id: { in: programIds } }, select: { id: true, nome: true } }),
    prisma.academicTerm.findMany({ where: { tenantId, id: { in: termIdsAll } }, select: { id: true, codigo: true } }),
    prisma.accountReceivable.findMany({ where: { tenantId, studentId: { in: ids }, status: { in: ['PENDENTE', 'ATRASADO'] }, dataVencimento: { lt: new Date() } }, select: { studentId: true, valor: true } }),
  ])
  for (const p of perfis) if (p.poloId) poloIdsLookup.push(p.poloId)
  const polos = poloIdsLookup.length ? await prisma.modPolo.findMany({ where: { tenantId, id: { in: uniq(poloIdsLookup) } }, select: { id: true, nome: true } }) : []
  const mPolo = new Map(polos.map((p) => [p.id, p.nome]))
  const mPerf = new Map(perfis.map((p) => [p.studentId, p]))
  const mExt = new Map(exts.map((e) => [e.enrollmentId, e]))
  const mProg = new Map(programs.map((p) => [p.id, p.nome]))
  const mTerm = new Map(terms.map((t) => [t.id, t.codigo]))
  const mContrato = new Map<string, string>()
  for (const c of contratos) if (!mContrato.has(c.studentId)) mContrato.set(c.studentId, c.status)
  const dev = new Map<string, number>()
  for (const r of receb) dev.set(r.studentId, (dev.get(r.studentId) ?? 0) + r.valor)
  const cpfCheio = verCpfCompleto(req)

  const rows: LinhaAluno[] = alunos.map((a) => {
    const p = mPerf.get(a.id)
    return {
      id: a.id, ra: a.ra, nome: a.nomeCompleto, nomeSocial: p?.nomeSocial ?? null, cpf: cpfCheio ? a.cpf ?? '' : mascararCpf(a.cpf), rg: p?.rg ?? null, email: p?.email ?? null, telefone: p?.telefone ?? null,
      nee: !!p?.nee, dataNascimento: a.dataNascimento, statusAluno: a.status, fotoUrl: p?.fotoUrl ?? null, polo: p?.poloId ? mPolo.get(p.poloId) ?? null : null,
      cursos: a.matriculas.map((m) => {
        const e = mExt.get(m.id)
        return { enrollmentId: m.id, programId: m.programId, programa: mProg.get(m.programId) ?? '—', periodoLetivo: mTerm.get(m.termId) ?? '—', termId: m.termId, statusMatricula: m.status, statusCurso: e?.statusCurso ?? null, turno: e?.turno ?? null, matriculaNova: !!e?.matriculaNova, dataMatricula: m.dataMatricula, turmas: m.turmas.map((t) => t.classSection.nome) }
      }),
      contratoStatus: mContrato.get(a.id) ?? null, inadimplente: dev.has(a.id), valorEmAtraso: Math.round((dev.get(a.id) ?? 0) * 100) / 100,
    }
  })
  return { rows, total }
}

const COLS_ALUNOS = [
  { titulo: 'RA', largura: 14 }, { titulo: 'Nome', largura: 36 }, { titulo: 'Nome social', largura: 22 }, { titulo: 'CPF', largura: 16 }, { titulo: 'RG', largura: 14 }, { titulo: 'E-mail', largura: 30 }, { titulo: 'Telefone', largura: 16 },
  { titulo: 'Nascimento', largura: 12 }, { titulo: 'Curso', largura: 30 }, { titulo: 'Período letivo', largura: 14 }, { titulo: 'Turma(s)', largura: 26 }, { titulo: 'Turno', largura: 12 }, { titulo: 'Data da matrícula', largura: 16 },
  { titulo: 'Status da matrícula', largura: 16 }, { titulo: 'Status do curso', largura: 16 }, { titulo: 'Matrícula nova', largura: 12 }, { titulo: 'NEE', largura: 8 }, { titulo: 'Contrato', largura: 20 }, { titulo: 'Inadimplente', largura: 12 }, { titulo: 'Polo/unidade', largura: 20 },
]
export function linhasXlsx(rows: LinhaAluno[], req: AuthenticatedRequest) {
  const out: any[][] = []
  const mostraNee = temPapel(req, 'SUPPORT', 'COORDINATOR', 'SECRETARY')
  for (const r of rows) {
    const cursos = r.cursos.length ? r.cursos : [null]
    for (const c of cursos) out.push([r.ra, r.nome, r.nomeSocial, r.cpf, r.rg, r.email, r.telefone, ymd(r.dataNascimento) && br(r.dataNascimento), c?.programa, c?.periodoLetivo, c?.turmas.join('; '), c?.turno, c ? br(c.dataMatricula) : '', c?.statusMatricula, c?.statusCurso, c ? c.matriculaNova : '', mostraNee ? r.nee : '', r.contratoStatus, r.inadimplente, r.polo])
  }
  return out
}

function resumoFiltro(f: FiltroAlunos): string {
  const p: string[] = []
  if (f.ano) p.push(`ano ${f.ano}`); if (f.periodo) p.push(`período ${f.periodo}`); if (f.somenteNovos) p.push('matrículas novas'); if (f.nee) p.push('NEE'); if (f.q) p.push(`busca "${f.q}"`)
  if (f.statusCurso) p.push(`curso ${f.statusCurso}`); if (f.contratoStatus) p.push(`contrato ${f.contratoStatus}`); if (f.statusMatricula) p.push(`matrícula ${f.statusMatricula}`)
  return p.length ? `Filtros: ${p.join(', ')}` : 'Sem filtros'
}

// ------------------------------------------------------------------ relatórios
export const RELATORIOS = [
  { codigo: 'lista-alunos', nome: 'Lista de alunos', descricao: 'Todos os alunos conforme os filtros aplicados.' },
  { codigo: 'matriculados-curso', nome: 'Matriculados por curso', descricao: 'Quantidade de alunos por curso e status da matrícula.' },
  { codigo: 'matriculados-turma', nome: 'Matriculados por turma', descricao: 'Alunos por turma, com vagas e ocupação.' },
  { codigo: 'novos', nome: 'Matrículas novas', descricao: 'Alunos ingressantes (matrícula nova) no período.' },
  { codigo: 'nee', nome: 'Alunos com necessidades especiais', descricao: 'Lista restrita (dado sensível, acesso registrado).' },
  { codigo: 'contratos', nome: 'Contratos', descricao: 'Contratos por status, valores e vigência.' },
  { codigo: 'inadimplentes', nome: 'Inadimplentes', descricao: 'Alunos com parcelas vencidas em aberto.' },
  { codigo: 'aniversariantes', nome: 'Aniversariantes', descricao: 'Aniversariantes do mês (parâmetro mes).' },
  { codigo: 'carometro', nome: 'Carômetro', descricao: 'Fotos e nomes dos alunos por turma/curso (HTML imprimível).' },
  { codigo: 'sem-documentos', nome: 'Pendências de documentos', descricao: 'Alunos com documentos obrigatórios pendentes.' },
]

async function gerarRelatorio(req: AuthenticatedRequest, codigo: string, f: FiltroAlunos): Promise<{ titulo: string; abas: Aba[]; html: string; dados: any }> {
  const tenantId = tid(req)
  const rel = RELATORIOS.find((r) => r.codigo === codigo)
  if (!rel) fail(404, 'Relatório não encontrado.')
  const sub = resumoFiltro(f)
  const tabelaHtml = (cols: string[], linhas: any[][]) => `<table><thead><tr>${cols.map((c) => `<th>${escHtml(c)}</th>`).join('')}</tr></thead><tbody>${linhas.map((l) => `<tr>${l.map((v) => `<td>${escHtml(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
  const montar = (cols: string[], linhas: any[][], dados: any) => ({ titulo: rel!.nome, abas: [{ nome: rel!.nome, colunas: cols.map((c) => ({ titulo: c })), linhas }], html: paginaHtml(rel!.nome, sub, tabelaHtml(cols, linhas)), dados })

  if (codigo === 'lista-alunos' || codigo === 'novos' || codigo === 'nee' || codigo === 'inadimplentes' || codigo === 'aniversariantes' || codigo === 'sem-documentos') {
    const ff = { ...f }
    if (codigo === 'novos') ff.somenteNovos = true
    if (codigo === 'nee') { ff.nee = true; await registrarAcessoSensivel(req, { recurso: 'academico2/relatorios/nee', categoria: 'DEFICIENCIA', acao: 'EXPORTACAO', motivo: 'Relatório de alunos com necessidades especiais' }) }
    if (codigo === 'inadimplentes') ff.inadimplente = true
    if (codigo === 'sem-documentos') ff.semDocumentos = true
    if (codigo === 'aniversariantes') ff.aniversarioMes = ff.aniversarioMes ?? new Date().getMonth() + 1
    const { rows } = await consultarAlunos(tenantId, ff, req, null)
    if (codigo === 'aniversariantes') {
      const ord = rows.slice().sort((a, b) => (a.dataNascimento?.getUTCDate() ?? 0) - (b.dataNascimento?.getUTCDate() ?? 0))
      return montar(['Dia', 'Nome', 'RA', 'Curso', 'E-mail', 'Telefone'], ord.map((r) => [r.dataNascimento?.getUTCDate(), r.nome, r.ra, r.cursos[0]?.programa ?? '', r.email, r.telefone]), { total: ord.length, mes: ff.aniversarioMes })
    }
    if (codigo === 'inadimplentes') return montar(['RA', 'Nome', 'Curso', 'E-mail', 'Telefone', 'Valor em atraso (R$)', 'Contrato'], rows.map((r) => [r.ra, r.nome, r.cursos[0]?.programa ?? '', r.email, r.telefone, r.valorEmAtraso, r.contratoStatus]), { total: rows.length, valorTotal: Math.round(rows.reduce((s, r) => s + r.valorEmAtraso, 0) * 100) / 100 })
    if (codigo === 'nee') return montar(['RA', 'Nome', 'Curso', 'Período', 'E-mail', 'Telefone'], rows.map((r) => [r.ra, r.nome, r.cursos[0]?.programa ?? '', r.cursos[0]?.periodoLetivo ?? '', r.email, r.telefone]), { total: rows.length })
    if (codigo === 'sem-documentos') {
      const docs = await prisma.acaDocumentoAluno.findMany({ where: { tenantId, obrigatorio: true, status: { in: ['PENDENTE', 'REJEITADO'] }, studentId: { in: rows.map((r) => r.id) } } })
      const por = new Map<string, string[]>()
      for (const d of docs) por.set(d.studentId, [...(por.get(d.studentId) ?? []), d.tipo])
      return montar(['RA', 'Nome', 'Curso', 'Documentos pendentes'], rows.map((r) => [r.ra, r.nome, r.cursos[0]?.programa ?? '', (por.get(r.id) ?? []).join(', ')]), { total: rows.length })
    }
    const lin = linhasXlsx(rows, req)
    return { titulo: rel.nome, abas: [{ nome: rel.nome, colunas: COLS_ALUNOS, linhas: lin }], html: paginaHtml(rel.nome, sub, tabelaHtml(COLS_ALUNOS.map((c) => c.titulo), lin)), dados: { total: rows.length } }
  }

  if (codigo === 'matriculados-curso') {
    const { rows } = await consultarAlunos(tenantId, f, req, null)
    const m = new Map<string, Record<string, number>>()
    for (const r of rows) for (const c of r.cursos) { const o = m.get(c.programa) ?? { ATIVA: 0, TRANCADA: 0, CANCELADA: 0, CONCLUIDA: 0 }; o[c.statusMatricula] = (o[c.statusMatricula] ?? 0) + 1; m.set(c.programa, o) }
    const lin = [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, o]) => [k, o.ATIVA, o.TRANCADA, o.CANCELADA, o.CONCLUIDA, o.ATIVA + o.TRANCADA + o.CANCELADA + o.CONCLUIDA])
    return montar(['Curso', 'Ativas', 'Trancadas', 'Canceladas', 'Concluídas', 'Total'], lin, { cursos: lin.length })
  }
  if (codigo === 'matriculados-turma') {
    const turmas = await prisma.classSection.findMany({ where: { tenantId, ...(f.classSectionId ? { id: f.classSectionId } : {}), ...(f.termId ? { termId: f.termId } : {}) }, include: { discipline: { select: { nome: true } }, term: { select: { codigo: true } }, _count: { select: { matriculados: true } } }, orderBy: { nome: 'asc' }, take: 5000 })
    const lin = turmas.map((t) => [t.nome, t.discipline.nome, t.term.codigo, t._count.matriculados, t.vagas ?? '', t.vagas ? `${Math.round((t._count.matriculados / t.vagas) * 100)}%` : ''])
    return montar(['Turma', 'Disciplina', 'Período', 'Matriculados', 'Vagas', 'Ocupação'], lin, { turmas: lin.length })
  }
  if (codigo === 'contratos') {
    const cs = await prisma.acaContrato.findMany({ where: { tenantId, ...(f.contratoStatus ? { status: f.contratoStatus } : {}) }, orderBy: { createdAt: 'desc' }, take: 20000 })
    const al = await prisma.student.findMany({ where: { tenantId, id: { in: uniq(cs.map((c) => c.studentId)) } }, select: { id: true, ra: true, nomeCompleto: true } })
    const mA = new Map(al.map((a) => [a.id, a]))
    const lin = cs.map((c) => [c.numero, mA.get(c.studentId)?.ra, mA.get(c.studentId)?.nomeCompleto, c.status, c.valorMensalidade, c.parcelas, c.descontoPercent, br(c.assinadoEm), br(c.vigenciaInicio), br(c.vigenciaFim)])
    return montar(['Contrato', 'RA', 'Aluno', 'Status', 'Mensalidade (R$)', 'Parcelas', 'Desconto %', 'Assinado em', 'Início', 'Fim'], lin, { total: lin.length })
  }
  // carômetro
  const { rows } = await consultarAlunos(tenantId, f, req, null)
  const grupos = new Map<string, LinhaAluno[]>()
  for (const r of rows) { const k = r.cursos[0] ? `${r.cursos[0].programa} — ${r.cursos[0].periodoLetivo}` : 'Sem matrícula'; grupos.set(k, [...(grupos.get(k) ?? []), r]) }
  const ini = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase()
  const html = [...grupos.entries()].map(([k, l]) => `<h2>${escHtml(k)} (${l.length})</h2><div class="grid">${l.map((r) => `<div class="card"><div class="av">${r.fotoUrl && /^https?:\/\//.test(r.fotoUrl) ? `<img src="${escHtml(r.fotoUrl)}" alt="">` : escHtml(ini(r.nomeSocial || r.nome))}</div><b>${escHtml(r.nomeSocial || r.nome)}</b><br>${escHtml(r.ra)}</div>`).join('')}</div>`).join('')
  return { titulo: rel.nome, abas: [{ nome: 'Carômetro', colunas: [{ titulo: 'Grupo' }, { titulo: 'RA' }, { titulo: 'Nome' }], linhas: rows.map((r) => [r.cursos[0]?.programa ?? '', r.ra, r.nomeSocial || r.nome]) }], html: paginaHtml('Carômetro', sub, html), dados: { total: rows.length } }
}

function enviarXlsx(res: Response, nome: string, abas: Aba[]) {
  const buf = gerarXlsx(abas)
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename="${nome.replace(/[^a-zA-Z0-9_.-]/g, '_')}.xlsx"`)
  res.setHeader('Content-Length', String(buf.length))
  res.end(buf)
}

// ------------------------------------------------------------------ rotas
const perfilSchema = z.object({
  email: optStr(200), telefone: optStr(30), rg: optStr(30), rgOrgao: optStr(20), sexo: optStr(20), nomeSocial: optStr(120), fotoUrl: optStr(500), poloId: optStr(60), cidade: optStr(80), uf: optStr(2), responsavelNome: optStr(120),
  nee: z.boolean().optional(), neeCategoria: optStr(120), neeBaseLegal: optStr(60), neeConsentimentoEm: optDate(),
})
const extSchema = z.object({
  numero: optStr(40), turno: z.enum(['MANHA', 'TARDE', 'NOITE', 'FIM_DE_SEMANA', 'INTEGRAL', 'EAD']).nullish(), ingresso: z.enum(['VESTIBULAR', 'ENEM', 'TRANSFERENCIA', 'PORTADOR_DIPLOMA', 'REINGRESSO', 'OUTRO']).optional(),
  matriculaNova: z.boolean().optional(), statusCurso: z.enum(STATUS_CURSO).optional(), poloId: optStr(60), periodoAtual: z.number().int().min(1).max(60).nullish(), matrizId: optStr(60),
})
const contratoSchema = z.object({
  enrollmentId: optStr(60), numero: z.string().min(1).max(40).optional(), status: z.enum(STATUS_CONTRATO).default('PENDENTE_ASSINATURA'), valorMensalidade: z.number().min(0).max(1e7), parcelas: z.number().int().min(1).max(120).default(6),
  diaVencimento: z.number().int().min(1).max(28).default(10), descontoPercent: z.number().min(0).max(100).default(0), assinadoEm: optDate(), vigenciaInicio: optDate(), vigenciaFim: optDate(), observacao: optStr(1000),
})
const docSchema = z.object({ tipo: z.string().min(2).max(80), status: z.enum(['PENDENTE', 'ENTREGUE', 'VALIDADO', 'REJEITADO', 'DISPENSADO']).default('PENDENTE'), obrigatorio: z.boolean().default(true), validadeEm: optDate(), observacao: optStr(500) })

async function alunoDoTenant(tenantId: string, id: string) {
  const a = await prisma.student.findFirst({ where: { id, tenantId } })
  if (!a) fail(404, 'Aluno não encontrado.')
  return a
}

export function registerAlunos(router: Router) {
  const leitura = requireRole(...SEC_READ)
  const escrita = requireRole(...SEC_WRITE)

  router.get('/alunos/filtros', leitura, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const [terms, programs, turmas, polos] = await Promise.all([
      prisma.academicTerm.findMany({ where: { tenantId }, orderBy: { dataInicio: 'desc' }, select: { id: true, codigo: true } }),
      prisma.academicProgram.findMany({ where: { tenantId }, orderBy: { nome: 'asc' }, select: { id: true, nome: true } }),
      prisma.classSection.findMany({ where: { tenantId }, orderBy: { nome: 'asc' }, select: { id: true, nome: true, termId: true }, take: 2000 }),
      prisma.modPolo.findMany({ where: { tenantId }, orderBy: { nome: 'asc' }, select: { id: true, nome: true } }),
    ])
    const anos = uniq(terms.map((t) => parseTerm(t.codigo).ano).filter((x): x is number => x !== null)).sort((a, b) => b - a)
    const periodos = uniq(terms.map((t) => parseTerm(t.codigo).periodo).filter((x): x is number => x !== null)).sort()
    res.json({ anos, periodos, termos: terms, cursos: programs, turmas, polos, statusCurso: STATUS_CURSO, statusContrato: STATUS_CONTRATO, statusMatricula: STATUS_MATRICULA, turnos: ['MANHA', 'TARDE', 'NOITE', 'FIM_DE_SEMANA', 'INTEGRAL', 'EAD'] })
  }))

  router.get('/alunos', leitura, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const f = lerFiltro(req.query)
    const { rows, total } = await consultarAlunos(tenantId, f, req, { skip, take })
    if (f.nee) await registrarAcessoSensivel(req, { recurso: 'academico2/alunos', categoria: 'DEFICIENCIA', acao: 'LISTAGEM', motivo: 'Filtro de alunos com necessidades especiais' })
    const nee = temPapel(req, 'SUPPORT', 'COORDINATOR', 'SECRETARY')
    res.json({ items: nee ? rows : rows.map((r) => ({ ...r, nee: false })), total, page, pageSize, filtro: resumoFiltro(f) })
  }))

  router.get('/alunos/exportar.xlsx', leitura, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const f = lerFiltro(req.query)
    const { rows, total } = await consultarAlunos(tenantId, f, req, null)
    if (f.nee) await registrarAcessoSensivel(req, { recurso: 'academico2/alunos', categoria: 'DEFICIENCIA', acao: 'EXPORTACAO', motivo: 'Exportação com filtro NEE' })
    await audit({ tenantId, userId: uid(req), modulo: MOD, acao: 'EXPORTAR_ALUNOS_XLSX', detalhes: { total, filtro: resumoFiltro(f) } })
    enviarXlsx(res, `alunos-${ymd(new Date())}`, [
      { nome: 'Alunos', colunas: COLS_ALUNOS, linhas: linhasXlsx(rows, req) },
      { nome: 'Filtros', colunas: [{ titulo: 'Filtro aplicado' }, { titulo: 'Total de alunos' }], linhas: [[resumoFiltro(f), total]] },
    ])
  }))

  router.get('/alunos/:id/ficha', leitura, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const a = await alunoDoTenant(tenantId, String(req.params.id))
    const podeSensivel = temPapel(req, 'SUPPORT', 'COORDINATOR', 'SECRETARY')
    const [perfil, matriculas, contratos, documentos, notas, titulos, certificados, horas, ocorrencias, orientacoes] = await Promise.all([
      prisma.acaAlunoPerfil.findFirst({ where: { tenantId, studentId: a.id } }),
      prisma.enrollment.findMany({ where: { studentId: a.id }, orderBy: { dataMatricula: 'desc' }, include: { program: { select: { nome: true, modalidade: true } }, term: { select: { codigo: true } }, turmas: { include: { classSection: { select: { nome: true, discipline: { select: { nome: true } } } } } } } }),
      prisma.acaContrato.findMany({ where: { tenantId, studentId: a.id }, orderBy: { createdAt: 'desc' } }),
      prisma.acaDocumentoAluno.findMany({ where: { tenantId, studentId: a.id }, orderBy: { tipo: 'asc' } }),
      prisma.ntResultado.findMany({ where: { tenantId, studentId: a.id }, orderBy: { createdAt: 'desc' }, take: 200 }),
      prisma.accountReceivable.findMany({ where: { tenantId, studentId: a.id }, orderBy: { dataVencimento: 'desc' }, take: 200 }),
      prisma.certificate.findMany({ where: { studentId: a.id }, orderBy: { emitidoEm: 'desc' }, take: 50 }),
      prisma.acaHoraComplementar.findMany({ where: { tenantId, studentId: a.id }, orderBy: { createdAt: 'desc' }, take: 100 }),
      podeSensivel ? prisma.apoOcorrencia.findMany({ where: { tenantId, studentId: a.id }, orderBy: { dataFato: 'desc' }, take: 50, select: { id: true, numero: true, gravidade: true, categoria: true, status: true, dataFato: true } }) : Promise.resolve([] as any[]),
      temPapel(req, 'SUPPORT', 'COORDINATOR') ? prisma.acaOrientacao.count({ where: { tenantId, studentId: a.id, status: { in: ['ABERTA', 'EM_ACOMPANHAMENTO', 'ENCAMINHADA'] } } }) : Promise.resolve(null),
    ])
    const exts = await prisma.acaMatriculaExt.findMany({ where: { tenantId, studentId: a.id } })
    const mExt = new Map(exts.map((e) => [e.enrollmentId, e]))
    const discIds = uniq(notas.map((n) => n.disciplineId).filter(Boolean) as string[])
    const discs = await prisma.discipline.findMany({ where: { tenantId, id: { in: discIds } }, select: { id: true, nome: true } })
    const mDisc = new Map(discs.map((d) => [d.id, d.nome]))
    const emAberto = titulos.filter((t) => t.status === 'PENDENTE' || t.status === 'ATRASADO')
    const vencidas = emAberto.filter((t) => t.dataVencimento < new Date())
    if (perfil?.nee || ocorrencias.length) await registrarAcessoSensivel(req, { recurso: 'academico2/alunos/ficha', recursoId: a.id, categoria: perfil?.nee ? 'DEFICIENCIA' : 'DISCIPLINAR', acao: 'LEITURA', titularTipo: 'ALUNO', titularId: a.id })
    res.json({
      aluno: { id: a.id, ra: a.ra, nome: a.nomeCompleto, cpf: verCpfCompleto(req) ? a.cpf : mascararCpf(a.cpf), dataNascimento: a.dataNascimento, status: a.status },
      perfil: perfil ? { ...perfil, nee: podeSensivel ? perfil.nee : false, neeCategoria: temPapel(req, 'SUPPORT', 'COORDINATOR') ? perfil.neeCategoria : null, neeBaseLegal: podeSensivel ? perfil.neeBaseLegal : null } : null,
      menor: a.dataNascimento ? (Date.now() - a.dataNascimento.getTime()) / (365.25 * 86_400_000) < 18 : null,
      matriculas: matriculas.map((m) => ({ id: m.id, curso: m.program.nome, modalidade: m.program.modalidade, periodoLetivo: m.term.codigo, status: m.status, dataMatricula: m.dataMatricula, ext: mExt.get(m.id) ?? null, turmas: m.turmas.map((t) => ({ nome: t.classSection.nome, disciplina: t.classSection.discipline.nome })) })),
      contratos, documentos,
      notas: notas.map((n) => ({ id: n.id, disciplina: n.disciplineId ? mDisc.get(n.disciplineId) ?? null : null, mediaParcial: n.mediaParcial, mediaFinal: n.mediaFinal, frequenciaPct: n.frequenciaPct, faltas: n.faltas, situacao: n.situacao })),
      financeiro: { emAberto: emAberto.length, vencidas: vencidas.length, valorVencido: Math.round(vencidas.reduce((s, t) => s + t.valor, 0) * 100) / 100, parcelas: titulos.slice(0, 60).map((t) => ({ id: t.id, descricao: t.descricao, valor: t.valor, vencimento: t.dataVencimento, pagoEm: t.dataPagamento, status: t.status })) },
      certificados, horasComplementares: { total: horas.reduce((s, h) => s + h.horasValidadas, 0), itens: horas },
      ocorrencias: podeSensivel ? ocorrencias : null, orientacoesAbertas: orientacoes,
    })
  }))

  router.put('/alunos/:id/perfil', escrita, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const a = await alunoDoTenant(tenantId, String(req.params.id))
    const b = parseBody(perfilSchema, req.body)
    if (b.poloId) await assertNoTenant(tenantId, 'modPolo', b.poloId, 'Polo')
    if (b.nee === true && !b.neeBaseLegal) fail(400, 'Informe a base legal (LGPD art. 11) para registrar necessidade educacional especial.')
    const data: any = { ...Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined)) }
    if (b.nee === true && !b.neeConsentimentoEm && b.neeBaseLegal === 'CONSENTIMENTO') data.neeConsentimentoEm = new Date()
    const p = await prisma.acaAlunoPerfil.upsert({ where: { tenantId_studentId: { tenantId, studentId: a.id } }, create: { ...data, tenantId, studentId: a.id }, update: data })
    await audit({ tenantId, userId: uid(req), modulo: MOD, acao: 'PERFIL_ALUNO', refType: 'Student', refId: a.id, detalhes: { campos: Object.keys(b), nee: b.nee } })
    res.json(p)
  }))

  router.put('/matriculas/:enrollmentId/ext', escrita, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const m = await prisma.enrollment.findFirst({ where: { id: String(req.params.enrollmentId), student: { tenantId } }, include: { term: { select: { codigo: true } } } })
    if (!m) fail(404, 'Matrícula não encontrada.')
    const b = parseBody(extSchema, req.body)
    const t = parseTerm(m.term.codigo)
    const data: any = { ...Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined)) }
    const e = await prisma.acaMatriculaExt.upsert({ where: { tenantId_enrollmentId: { tenantId, enrollmentId: m.id } }, create: { ...data, tenantId, enrollmentId: m.id, studentId: m.studentId, anoLetivo: t.ano, periodoLetivo: t.periodo }, update: data })
    await audit({ tenantId, userId: uid(req), modulo: MOD, acao: 'MATRICULA_EXT', refType: 'Enrollment', refId: m.id })
    res.json(e)
  }))

  router.get('/contratos', leitura, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    if (qs(req.query.status)) where.status = qs(req.query.status)
    if (qs(req.query.studentId)) where.studentId = qs(req.query.studentId)
    const [items, total] = await Promise.all([prisma.acaContrato.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }), prisma.acaContrato.count({ where })])
    res.json({ items, total, page, pageSize })
  }))

  router.post('/alunos/:id/contratos', escrita, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const a = await alunoDoTenant(tenantId, String(req.params.id))
    const b = parseBody(contratoSchema, req.body)
    if (b.enrollmentId) { const m = await prisma.enrollment.findFirst({ where: { id: b.enrollmentId, studentId: a.id } }); if (!m) fail(400, 'Matrícula não pertence ao aluno.') }
    if (b.vigenciaInicio && b.vigenciaFim && b.vigenciaFim < b.vigenciaInicio) fail(400, 'O fim da vigência deve ser posterior ao início.')
    const n = await prisma.acaContrato.count({ where: { tenantId } })
    const numero = b.numero ?? `CT-${new Date().getFullYear()}-${String(n + 1).padStart(5, '0')}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`
    const c = await prisma.acaContrato.create({ data: { ...b, numero, tenantId, studentId: a.id, assinadoEm: b.status === 'ASSINADO' ? b.assinadoEm ?? new Date() : b.assinadoEm } })
    await audit({ tenantId, userId: uid(req), modulo: MOD, acao: 'CONTRATO_CRIADO', refType: 'AcaContrato', refId: c.id })
    res.status(201).json(c)
  }))

  router.patch('/contratos/:id', escrita, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const cur = await prisma.acaContrato.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!cur) fail(404, 'Contrato não encontrado.')
    const b = parseBody(contratoSchema.partial(), req.body)
    const data: any = Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined))
    if (b.status === 'ASSINADO' && !cur.assinadoEm && !b.assinadoEm) data.assinadoEm = new Date()
    const c = await prisma.acaContrato.update({ where: { id: cur.id }, data })
    await audit({ tenantId, userId: uid(req), modulo: MOD, acao: 'CONTRATO_ATUALIZADO', refType: 'AcaContrato', refId: c.id, detalhes: { status: c.status } })
    res.json(c)
  }))

  router.post('/alunos/:id/documentos', escrita, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const a = await alunoDoTenant(tenantId, String(req.params.id))
    const b = parseBody(docSchema, req.body)
    const d = await prisma.acaDocumentoAluno.create({ data: { ...b, tenantId, studentId: a.id, entregueEm: ['ENTREGUE', 'VALIDADO'].includes(b.status) ? new Date() : undefined } })
    res.status(201).json(d)
  }))
  router.patch('/documentos/:id', escrita, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const cur = await prisma.acaDocumentoAluno.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!cur) fail(404, 'Documento não encontrado.')
    const b = parseBody(docSchema.partial(), req.body)
    const data: any = Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined))
    if (b.status && ['ENTREGUE', 'VALIDADO'].includes(b.status) && !cur.entregueEm) data.entregueEm = new Date()
    res.json(await prisma.acaDocumentoAluno.update({ where: { id: cur.id }, data }))
  }))

  router.get('/relatorios', leitura, (_req, res) => { res.json({ items: RELATORIOS }) })
  router.get('/relatorios/:codigo', leitura, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const f = lerFiltro(req.query)
    const fmt = (qs(req.query.formato) || 'json').toLowerCase()
    if (!['json', 'xlsx', 'html'].includes(fmt)) fail(400, 'Formato inválido (json, xlsx ou html).')
    const r = await gerarRelatorio(req, String(req.params.codigo), f)
    await audit({ tenantId, userId: uid(req), modulo: MOD, acao: 'RELATORIO', refType: 'Relatorio', refId: String(req.params.codigo), detalhes: { formato: fmt } })
    if (fmt === 'xlsx') return enviarXlsx(res, `${req.params.codigo}-${ymd(new Date())}`, r.abas)
    if (fmt === 'html') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return void res.send(r.html) }
    res.json({ titulo: r.titulo, colunas: r.abas[0].colunas.map((c) => c.titulo), linhas: r.abas[0].linhas.slice(0, 5000), dados: r.dados })
  }))
}
export { chunk, isSuper, roleOf }
