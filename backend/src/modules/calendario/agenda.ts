import { Router, Request, Response } from 'express'
import { randomBytes } from 'crypto'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { parseBody, qs } from '../core/crud'
import { audit } from '../core/notify'
import { IcsEvento, buildIcs } from './ical'
import { DAY_MS, addDays, isoWeekday, localDateKey, localMinutes, minToHHMM, slotInstant, startOfLocalDay } from './time'
import { GESTAO, MODULO, SlotRow, SOLICITANTES, TODOS_PAPEIS, carregarEspacos, datasBloqueadas, enriquecerSlots, erro, nomesUsuarios, temPapel } from './service'
import { listarOcorrencias } from './eventos'
import { eventosIcsDeSlots } from './grade'
import { secoesDoAluno, secoesDoProfessor } from './provas'
import { situacaoPrazo } from './deadlines'

export interface ItemAgenda {
  tipo: 'AULA' | 'PROVA' | 'EVENTO' | 'PRAZO' | 'RESERVA'
  id: string
  titulo: string
  inicio: Date
  fim: Date
  local?: string | null
  detalhe?: string | null
  status?: string
  cor?: string | null
  diaInteiro?: boolean
}

async function ocorrenciasDeSlots(tenantId: string, slots: SlotRow[], de: Date, ate: Date): Promise<ItemAgenda[]> {
  if (!slots.length) return []
  const en = await enriquecerSlots(tenantId, slots)
  const terms = await prisma.academicTerm.findMany({ where: { tenantId, id: { in: [...new Set(slots.map((s) => s.termId))] } } })
  const tm = new Map(terms.map((t) => [t.id, t]))
  const bloq = await datasBloqueadas(tenantId, de, ate)
  const out: ItemAgenda[] = []
  let d = startOfLocalDay(de)
  const dias = Math.min(400, Math.ceil((ate.getTime() - de.getTime()) / DAY_MS) + 1)
  for (let g = 0; g < dias; g++, d = addDays(d, 1)) {
    const wd = isoWeekday(d)
    const key = localDateKey(d)
    if (bloq.has(key)) continue
    for (const s of en) {
      if (s.diaSemana !== wd) continue
      const t = tm.get(s.termId)
      if (!t || d.getTime() < startOfLocalDay(t.dataInicio).getTime() || d.getTime() > startOfLocalDay(t.dataFim).getTime()) continue
      out.push({
        tipo: 'AULA', id: `${s.id}@${key}`, titulo: `${s.disciplina ?? 'Aula'}${s.turma ? ' — ' + s.turma : ''}`, inicio: slotInstant(d, s.inicioMin), fim: slotInstant(d, s.fimMin),
        local: s.espaco ? `${s.espaco.codigo} — ${s.espaco.nome}` : s.tipoAula === 'ONLINE' ? 'Online' : null,
        detalhe: [s.professor ? `Prof. ${s.professor}` : null, s.tipoAula === 'PRATICA' ? 'Aula prática' : null].filter(Boolean).join(' · ') || null,
      })
    }
  }
  return out
}

async function itensDeExames(tenantId: string, where: any, de: Date, ate: Date): Promise<ItemAgenda[]> {
  const ex = await prisma.calExame.findMany({ where: { tenantId, status: { notIn: ['CANCELADA', 'REMARCADA'] }, inicio: { lte: ate }, fim: { gte: de }, ...where }, orderBy: { inicio: 'asc' }, take: 1000 })
  const turmas = await prisma.classSection.findMany({ where: { tenantId, id: { in: [...new Set(ex.map((e) => e.classSectionId))] } }, select: { id: true, nome: true } })
  const tn = new Map(turmas.map((t) => [t.id, t.nome]))
  const esp = await carregarEspacos(tenantId, ex.map((e) => e.spaceId))
  return ex.map((e) => ({ tipo: 'PROVA' as const, id: e.id, titulo: e.titulo, inicio: e.inicio, fim: e.fim, local: e.spaceId ? esp.get(e.spaceId)?.codigo ?? null : null, detalhe: tn.get(e.classSectionId) ?? null, status: e.status }))
}

function agrupar(itens: ItemAgenda[]) {
  const porDia: Record<string, ItemAgenda[]> = {}
  for (const i of itens) (porDia[localDateKey(i.inicio)] ??= []).push(i)
  return porDia
}

export interface AgendaPerfil {
  role: string
  userId: string
  studentId?: string
}

export async function montarAgenda(tenantId: string, perfil: AgendaPerfil, de: Date, ate: Date, termId?: string) {
  const itens: ItemAgenda[] = []
  const role = perfil.role
  if (role === 'STUDENT') {
    if (!perfil.studentId) throw erro(404, 'Usuário sem cadastro de aluno vinculado.')
    const secoes = await secoesDoAluno(tenantId, perfil.studentId, termId)
    const slots = (await prisma.calSlot.findMany({ where: { tenantId, ativo: true, classSectionId: { in: secoes } }, take: 5000 })) as unknown as SlotRow[]
    itens.push(...(await ocorrenciasDeSlots(tenantId, slots, de, ate)))
    itens.push(...(await itensDeExames(tenantId, { classSectionId: { in: secoes } }, de, ate)))
    const programIds = (await prisma.enrollment.findMany({ where: { studentId: perfil.studentId }, select: { programId: true } })).map((e) => e.programId)
    for (const o of await listarOcorrencias(tenantId, de, ate, { termId, programIds, extra: { publico: { in: ['TODOS', 'ALUNOS'] } } })) {
      itens.push({ tipo: 'EVENTO', id: o.id, titulo: o.titulo, inicio: o.inicio, fim: o.fim, detalhe: o.tipo, local: o.local, cor: o.cor, diaInteiro: o.diaInteiro })
    }
  } else {
    const ehProf = role === 'TEACHER'
    if (ehProf) {
      const secoes = await secoesDoProfessor(tenantId, perfil.userId, termId)
      const slots = (await prisma.calSlot.findMany({ where: { tenantId, ativo: true, OR: [{ professorUserId: perfil.userId }, { classSectionId: { in: secoes } }] }, take: 5000 })) as unknown as SlotRow[]
      itens.push(...(await ocorrenciasDeSlots(tenantId, slots, de, ate)))
      itens.push(...(await itensDeExames(tenantId, { OR: [{ professorUserId: perfil.userId }, { fiscais: { some: { userId: perfil.userId } } }, { classSectionId: { in: secoes } }] }, de, ate)))
      // prazos de lançamento em aberto
      const termIds = (await prisma.classSection.findMany({ where: { tenantId, professorUserId: perfil.userId }, select: { termId: true }, distinct: ['termId'] })).map((s) => s.termId)
      const prazos = await prisma.calPrazoNotas.findMany({ where: { tenantId, ativo: true, termId: { in: termIds } }, include: { excecoes: { where: { userId: perfil.userId } }, conclusoes: { where: { userId: perfil.userId } } } })
      for (const p of prazos) {
        if (p.conclusoes.length) continue
        const s = situacaoPrazo(p, new Date(), p.excecoes[0]?.ate ?? null)
        if (s.efetivo.getTime() >= de.getTime() && s.efetivo.getTime() <= ate.getTime()) itens.push({ tipo: 'PRAZO', id: p.id, titulo: p.titulo, inicio: new Date(s.efetivo.getTime() - 3_600_000), fim: s.efetivo, status: s.situacao, detalhe: s.prorrogado ? 'Prazo prorrogado' : null })
      }
    }
    for (const o of await listarOcorrencias(tenantId, de, ate, { termId, extra: ehProf ? { publico: { in: ['TODOS', 'PROFESSORES'] } } : {} })) {
      itens.push({ tipo: 'EVENTO', id: o.id, titulo: o.titulo, inicio: o.inicio, fim: o.fim, detalhe: o.tipo, local: o.local, cor: o.cor, diaInteiro: o.diaInteiro })
    }
    const res = await prisma.calReserva.findMany({ where: { tenantId, solicitanteId: perfil.userId, status: { in: ['PENDENTE', 'APROVADA'] }, bloqueio: false, inicio: { lte: ate }, fim: { gte: de } }, take: 500 })
    const esp = await carregarEspacos(tenantId, res.map((r) => r.spaceId))
    for (const r of res) itens.push({ tipo: 'RESERVA', id: r.id, titulo: r.titulo, inicio: r.inicio, fim: r.fim, local: esp.get(r.spaceId)?.codigo ?? null, status: r.status })
  }
  itens.sort((a, b) => a.inicio.getTime() - b.inicio.getTime())
  return itens
}

type Escopo = 'ALUNO' | 'PROFESSOR' | 'TURMA' | 'ESPACO' | 'INSTITUCIONAL'

/** Eventos iCal de um escopo (aulas recorrentes + avaliações + eventos do calendário). */
export async function eventosIcsDoEscopo(tenantId: string, escopo: Escopo, refId: string | null, termId?: string | null): Promise<{ nome: string; eventos: IcsEvento[] }> {
  const agora = new Date()
  const de = addDays(agora, -30)
  const ate = addDays(agora, 365)
  let slots: SlotRow[] = []
  let exWhere: any = null
  let publico: string[] = ['TODOS']
  let nome = 'Calendário acadêmico'
  let programIds: string[] | undefined
  const baseSlot: any = { tenantId, ativo: true, ...(termId ? { termId } : {}) }
  if (escopo === 'ALUNO') {
    if (!refId) throw erro(400, 'refId obrigatório.')
    const secoes = await secoesDoAluno(tenantId, refId, termId ?? undefined)
    slots = (await prisma.calSlot.findMany({ where: { ...baseSlot, classSectionId: { in: secoes } }, take: 5000 })) as unknown as SlotRow[]
    exWhere = { classSectionId: { in: secoes } }
    publico = ['TODOS', 'ALUNOS']
    nome = 'Minhas aulas e provas'
    programIds = (await prisma.enrollment.findMany({ where: { studentId: refId }, select: { programId: true } })).map((e) => e.programId)
  } else if (escopo === 'PROFESSOR') {
    if (!refId) throw erro(400, 'refId obrigatório.')
    const secoes = await secoesDoProfessor(tenantId, refId, termId ?? undefined)
    slots = (await prisma.calSlot.findMany({ where: { ...baseSlot, OR: [{ professorUserId: refId }, { classSectionId: { in: secoes } }] }, take: 5000 })) as unknown as SlotRow[]
    exWhere = { OR: [{ professorUserId: refId }, { fiscais: { some: { userId: refId } } }, { classSectionId: { in: secoes } }] }
    publico = ['TODOS', 'PROFESSORES']
    nome = 'Minha grade de professor'
  } else if (escopo === 'TURMA') {
    if (!refId) throw erro(400, 'refId obrigatório.')
    slots = (await prisma.calSlot.findMany({ where: { ...baseSlot, OR: [{ classSectionId: refId }, { grupo: refId }] }, take: 5000 })) as unknown as SlotRow[]
    exWhere = { OR: [{ classSectionId: refId }, { grupo: refId }] }
    publico = ['TODOS', 'ALUNOS']
    nome = 'Grade da turma'
  } else if (escopo === 'ESPACO') {
    if (!refId) throw erro(400, 'refId obrigatório.')
    slots = (await prisma.calSlot.findMany({ where: { ...baseSlot, spaceId: refId }, take: 5000 })) as unknown as SlotRow[]
    exWhere = { spaceId: refId }
    publico = []
    nome = 'Ocupação do espaço'
  }
  const eventos: IcsEvento[] = [...(await eventosIcsDeSlots(tenantId, slots))]
  if (exWhere) {
    for (const p of await itensDeExames(tenantId, exWhere, de, ate)) eventos.push({ uid: `prova-${p.id}@edumaster`, titulo: p.titulo, descricao: p.detalhe, local: p.local, inicio: p.inicio, fim: p.fim, categorias: ['Avaliação'] })
  }
  if (escopo === 'ESPACO' && refId) {
    const rs = await prisma.calReserva.findMany({ where: { tenantId, spaceId: refId, status: 'APROVADA', inicio: { lte: ate }, fim: { gte: de } }, take: 2000 })
    for (const r of rs) eventos.push({ uid: `reserva-${r.id}@edumaster`, titulo: r.bloqueio ? `BLOQUEIO: ${r.titulo}` : r.titulo, descricao: r.finalidade, inicio: r.inicio, fim: r.fim, categorias: [r.bloqueio ? 'Bloqueio' : 'Reserva'] })
  }
  if (publico.length) {
    const occ = await listarOcorrencias(tenantId, de, ate, { termId: termId ?? undefined, programIds, extra: { publico: { in: publico } } })
    for (const o of occ) eventos.push({ uid: `evento-${o.id}@edumaster`, titulo: o.titulo, descricao: o.descricao, local: o.local, inicio: o.inicio, fim: o.fim, diaInteiro: o.diaInteiro, categorias: [o.tipo] })
  }
  return { nome, eventos }
}

export function registerAgenda(router: Router, publicRouter: Router) {
  router.get(
    '/meu-calendario',
    requireRole(...TODOS_PAPEIS),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const hoje = startOfLocalDay(new Date())
      const de = qs(req.query.de) ? new Date(qs(req.query.de)!) : hoje
      const ate = qs(req.query.ate) ? new Date(qs(req.query.ate)!) : new Date(hoje.getTime() + 14 * DAY_MS)
      if (isNaN(de.getTime()) || isNaN(ate.getTime()) || ate < de) throw erro(400, 'Janela de datas inválida.')
      if (ate.getTime() - de.getTime() > 125 * DAY_MS) throw erro(400, 'Janela máxima: 120 dias.')
      const gestao = temPapel(req.user?.role, ...GESTAO)
      let perfil: AgendaPerfil = { role: String(req.user!.role), userId: getUserId(req), studentId: req.user!.studentId }
      if (gestao && qs(req.query.studentId)) perfil = { role: 'STUDENT', userId: getUserId(req), studentId: qs(req.query.studentId) }
      else if (gestao && qs(req.query.professorId)) perfil = { role: 'TEACHER', userId: qs(req.query.professorId)! }
      const itens = await montarAgenda(tenantId, perfil, de, ate, qs(req.query.termId))
      const resumo = { aulas: 0, provas: 0, eventos: 0, prazos: 0, reservas: 0 }
      for (const i of itens) resumo[(i.tipo.toLowerCase() + 's') as keyof typeof resumo]++
      res.json({ perfil: perfil.role === 'STUDENT' ? 'ALUNO' : perfil.role === 'TEACHER' ? 'PROFESSOR' : 'GERAL', de, ate, resumo, itens: itens.map((i) => ({ ...i, horario: i.diaInteiro ? 'Dia inteiro' : minToHHMM(localMinutes(i.inicio)) })), porDia: agrupar(itens) })
    }),
  )

  router.get(
    '/meu-calendario.ics',
    requireRole(...TODOS_PAPEIS),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const role = String(req.user!.role)
      const r = role === 'STUDENT' ? await eventosIcsDoEscopo(tenantId, 'ALUNO', req.user!.studentId ?? null, qs(req.query.termId)) : role === 'TEACHER' ? await eventosIcsDoEscopo(tenantId, 'PROFESSOR', getUserId(req), qs(req.query.termId)) : await eventosIcsDoEscopo(tenantId, 'INSTITUCIONAL', null)
      res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
      res.setHeader('Content-Disposition', 'attachment; filename="meu-calendario.ics"')
      res.send(buildIcs(r.eventos, { nome: r.nome }))
    }),
  )

  // ---------- Assinatura (feeds) ----------
  router.post(
    '/feeds',
    requireRole(...TODOS_PAPEIS),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const userId = getUserId(req)
      const b = parseBody(z.object({ escopo: z.enum(['TURMA', 'PROFESSOR', 'ESPACO', 'ALUNO', 'INSTITUCIONAL']), refId: z.string().nullish(), termId: z.string().nullish(), titulo: z.string().max(120).nullish() }), req.body)
      const gestao = temPapel(req.user?.role, ...GESTAO)
      let refId = b.refId ?? null
      if (b.escopo === 'ALUNO') {
        if (!gestao) {
          if (req.user?.role !== 'STUDENT' || !req.user.studentId) throw erro(403, 'Sem permissão.')
          refId = req.user.studentId
        }
        if (!refId) throw erro(400, 'refId obrigatório.')
      } else if (b.escopo === 'PROFESSOR') {
        if (!gestao) refId = userId
        if (!refId) throw erro(400, 'refId obrigatório.')
      } else if (b.escopo === 'INSTITUCIONAL') refId = null
      else {
        if (!gestao && !temPapel(req.user?.role, 'TEACHER', 'FACILITIES')) throw erro(403, 'Sem permissão.')
        if (!refId) throw erro(400, 'refId obrigatório.')
      }
      await eventosIcsDoEscopo(tenantId, b.escopo, refId, b.termId) // valida o escopo
      const token = randomBytes(24).toString('hex')
      const row = await prisma.calFeed.create({ data: { tenantId, token, escopo: b.escopo, refId, termId: b.termId ?? null, titulo: b.titulo ?? null, criadoPorId: userId } })
      await audit({ tenantId, userId, modulo: MODULO, acao: 'CRIAR_FEED', refType: 'CalFeed', refId: row.id, detalhes: { escopo: b.escopo } })
      res.status(201).json({ id: row.id, escopo: row.escopo, token, url: `/api/public/edu/calendario/feeds/${token}.ics`, observacao: 'Cole o endereço completo (com o domínio do sistema) em "Adicionar calendário por URL" no Google Agenda/Outlook. Trate como senha: quem tem o link vê a agenda.' })
    }),
  )

  router.get(
    '/feeds',
    requireRole(...TODOS_PAPEIS),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const gestao = temPapel(req.user?.role, ...GESTAO)
      const rows = await prisma.calFeed.findMany({ where: { tenantId, ativo: true, ...(gestao ? {} : { criadoPorId: getUserId(req) }) }, orderBy: { createdAt: 'desc' }, take: 200 })
      res.json({ items: rows.map((r) => ({ id: r.id, escopo: r.escopo, refId: r.refId, termId: r.termId, titulo: r.titulo, ultimoAcesso: r.ultimoAcesso, createdAt: r.createdAt, url: `/api/public/edu/calendario/feeds/${r.token}.ics` })) })
    }),
  )

  router.delete(
    '/feeds/:id',
    requireRole(...TODOS_PAPEIS),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const f = await prisma.calFeed.findFirst({ where: { id: String(req.params.id), tenantId } })
      if (!f) return res.status(404).json({ error: 'Feed não encontrado.' })
      if (f.criadoPorId !== getUserId(req) && !temPapel(req.user?.role, ...GESTAO)) return res.status(403).json({ error: 'Sem permissão.' })
      await prisma.calFeed.update({ where: { id: f.id }, data: { ativo: false } })
      res.status(204).end()
    }),
  )

  // ---------- Público: assinatura iCal por token ----------
  publicRouter.get(
    '/feeds/:file',
    asyncHandler(async (req: Request, res: Response) => {
      const token = String(req.params.file).replace(/\.ics$/i, '')
      if (!/^[a-f0-9]{48}$/.test(token)) return res.status(404).json({ error: 'Feed não encontrado.' })
      const f = await prisma.calFeed.findFirst({ where: { token, ativo: true } })
      if (!f) return res.status(404).json({ error: 'Feed não encontrado.' })
      await prisma.calFeed.update({ where: { id: f.id }, data: { ultimoAcesso: new Date() } })
      const r = await eventosIcsDoEscopo(f.tenantId, f.escopo as Escopo, f.refId, f.termId)
      res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
      res.setHeader('Cache-Control', 'private, max-age=900')
      res.send(buildIcs(r.eventos, { nome: f.titulo ?? r.nome }))
    }),
  )
}

