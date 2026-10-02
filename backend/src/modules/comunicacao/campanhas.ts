import crypto from 'crypto'
import { prisma } from '../../lib/prisma'
import { audit } from '../core/notify'
import { canalAtivo, getConfig, variaveisDoContato } from './store'
import { dayNumberBRT, formatBRL, formatDateBR, normalizePhone, pickDestino, podeEnviar, PrefLinha, renderTemplate } from './pure'

const db = prisma as any

export interface Alvo {
  chave: string
  nome: string
  studentId?: string
  candidatoId?: string
  contatoId?: string
  email?: string | null
  telefone?: string | null
  telegramChatId?: string | null
  vars: Record<string, string>
}

export const SEGMENTOS = ['INADIMPLENTES', 'A_VENCER', 'REMATRICULA_PENDENTE', 'CANDIDATOS_ETAPA', 'EGRESSOS', 'ALUNOS_ATIVOS', 'CONTATOS', 'LISTA'] as const
const LIMITE_ALVOS = 20000

// Dados de contato (e-mail/telefone/telegram) de uma lista de alunos: ComContato > User.
export async function contatosDeAlunos(tenantId: string, studentIds: string[]) {
  const out = new Map<string, { nome: string; contatoId?: string; email?: string | null; telefone?: string | null; telegramChatId?: string | null; studentUserId?: string }>()
  if (!studentIds.length) return out
  const [alunos, contatos] = await Promise.all([
    prisma.student.findMany({ where: { tenantId, id: { in: studentIds } }, select: { id: true, nomeCompleto: true, userId: true } }),
    prisma.comContato.findMany({ where: { tenantId, studentId: { in: studentIds } } }),
  ])
  const users = await prisma.user.findMany({ where: { tenantId, id: { in: alunos.map((a) => a.userId) } }, select: { id: true, email: true, phone: true } })
  const uMap = new Map(users.map((u) => [u.id, u]))
  const cMap = new Map(contatos.map((c) => [c.studentId!, c]))
  for (const a of alunos) {
    const c = cMap.get(a.id)
    const u = uMap.get(a.userId)
    out.set(a.id, {
      nome: a.nomeCompleto,
      contatoId: c?.id,
      email: c?.email ?? u?.email ?? null,
      telefone: c?.telefone ?? normalizePhone(u?.phone),
      telegramChatId: c?.telegramChatId ?? null,
      studentUserId: a.userId,
    })
  }
  return out
}

async function alvosDeAlunos(tenantId: string, extra: Map<string, Record<string, string>>): Promise<Alvo[]> {
  const ids = [...extra.keys()].slice(0, LIMITE_ALVOS)
  const dados = await contatosDeAlunos(tenantId, ids)
  const cursos = new Map<string, string>()
  try {
    const mats = await db.enrollment.findMany({ where: { studentId: { in: ids }, status: 'ATIVA' }, include: { program: { select: { nome: true } } }, orderBy: { dataMatricula: 'desc' } })
    for (const m of mats) if (!cursos.has(m.studentId)) cursos.set(m.studentId, m.program?.nome)
  } catch {
    /* acadêmico indisponível */
  }
  return ids.flatMap((id) => {
    const d = dados.get(id)
    if (!d) return []
    const nome = d.nome
    return [{ chave: `s:${id}`, nome, studentId: id, contatoId: d.contatoId, email: d.email, telefone: d.telefone, telegramChatId: d.telegramChatId, vars: { nome: nome.split(' ')[0], nome_completo: nome, ...(cursos.get(id) ? { curso: cursos.get(id)! } : {}), ...extra.get(id)! } }]
  })
}

export async function resolverSegmento(tenantId: string, segmento: string, filtros: any = {}): Promise<Alvo[]> {
  const f = filtros ?? {}
  const agora = new Date()
  switch (segmento) {
    case 'INADIMPLENTES':
    case 'A_VENCER': {
      const dias = Number(f.dias ?? 5)
      const where: any = { tenantId, dataPagamento: null }
      if (segmento === 'INADIMPLENTES') where.OR = [{ status: 'ATRASADO' }, { status: 'PENDENTE', dataVencimento: { lt: agora } }]
      else Object.assign(where, { status: 'PENDENTE', dataVencimento: { gte: agora, lte: new Date(agora.getTime() + dias * 86_400_000) } })
      const titulos = await db.accountReceivable.findMany({ where, orderBy: { dataVencimento: 'asc' }, take: LIMITE_ALVOS * 3 })
      const por = new Map<string, { total: number; venc: Date; n: number }>()
      for (const t of titulos) {
        const x = por.get(t.studentId)
        if (x) {
          x.total += t.valor
          x.n++
        } else por.set(t.studentId, { total: t.valor, venc: t.dataVencimento, n: 1 })
      }
      const minAtraso = Number(f.minDiasAtraso ?? 0)
      const m = new Map<string, Record<string, string>>()
      for (const [sid, x] of por) {
        const atraso = dayNumberBRT(agora) - dayNumberBRT(x.venc)
        if (segmento === 'INADIMPLENTES' && atraso < minAtraso) continue
        m.set(sid, { valor: formatBRL(x.total), vencimento: formatDateBR(x.venc), parcelas: String(x.n), dias_atraso: String(Math.max(0, atraso)) })
      }
      return alvosDeAlunos(tenantId, m)
    }
    case 'REMATRICULA_PENDENTE': {
      if (!f.termId) throw Object.assign(new Error('Segmento REMATRICULA_PENDENTE exige filtros.termId (período letivo da rematrícula).'), { status: 400 })
      const ativos = await prisma.student.findMany({ where: { tenantId, status: 'ATIVO' }, select: { id: true }, take: LIMITE_ALVOS })
      const ja = await db.enrollment.findMany({ where: { termId: String(f.termId), studentId: { in: ativos.map((a) => a.id) }, status: { in: ['ATIVA', 'CONCLUIDA'] } }, select: { studentId: true } })
      const jaSet = new Set(ja.map((x: any) => x.studentId))
      return alvosDeAlunos(tenantId, new Map(ativos.filter((a) => !jaSet.has(a.id)).map((a) => [a.id, {}])))
    }
    case 'ALUNOS_ATIVOS':
    case 'EGRESSOS': {
      const status = segmento === 'EGRESSOS' ? { in: ['FORMADO', 'CONCLUIDO'] } : 'ATIVO'
      let ids: string[] | undefined
      if (f.programId) {
        const m = await db.enrollment.findMany({ where: { programId: String(f.programId) }, select: { studentId: true }, take: LIMITE_ALVOS })
        ids = [...new Set<string>(m.map((x: any) => x.studentId))]
      }
      const alunos = await prisma.student.findMany({ where: { tenantId, status: status as any, ...(ids ? { id: { in: ids } } : {}) }, select: { id: true }, take: LIMITE_ALVOS })
      return alvosDeAlunos(tenantId, new Map(alunos.map((a) => [a.id, {}])))
    }
    case 'CANDIDATOS_ETAPA': {
      const status: string[] = Array.isArray(f.status) ? f.status : f.status ? [String(f.status)] : ['LEAD', 'INSCRITO']
      const cands = await db.admCandidato.findMany({ where: { tenantId, status: { in: status }, consentimentoLgpd: true }, select: { id: true, nome: true, email: true, telefone: true, protocolo: true }, take: LIMITE_ALVOS })
      return cands.map((c: any) => ({ chave: `c:${c.id}`, nome: c.nome, candidatoId: c.id, email: c.email, telefone: normalizePhone(c.telefone), vars: { nome: String(c.nome).split(' ')[0], nome_completo: c.nome, protocolo: c.protocolo ?? '' } }))
    }
    case 'CONTATOS':
    case 'LISTA': {
      const where: any = { tenantId, ativo: true }
      if (segmento === 'LISTA') where.id = { in: Array.isArray(f.contatoIds) ? f.contatoIds : [] }
      if (f.tipo) where.tipo = f.tipo
      if (f.tag) where.tags = { has: String(f.tag) }
      const cs = await prisma.comContato.findMany({ where, take: LIMITE_ALVOS })
      return cs.map((c) => ({ chave: `k:${c.id}`, nome: c.nome, contatoId: c.id, studentId: c.studentId ?? undefined, candidatoId: c.candidatoId ?? undefined, email: c.email, telefone: c.telefone, telegramChatId: c.telegramChatId, vars: { nome: c.nome.split(' ')[0], nome_completo: c.nome } }))
    }
  }
  throw Object.assign(new Error(`Segmento desconhecido: ${segmento}`), { status: 400 })
}

export async function previaCampanha(tenantId: string, c: { segmento: string; filtros: any; canal: string; finalidade: string }) {
  const alvos = await resolverSegmento(tenantId, c.segmento, c.filtros)
  const prefs = await prefsPorContato(tenantId, alvos.map((a) => a.contatoId).filter(Boolean) as string[])
  let semDestino = 0
  let bloqueados = 0
  for (const a of alvos) {
    if (!pickDestino(c.canal, a)) semDestino++
    else if (!podeEnviar(prefs.get(a.contatoId ?? '') ?? [], c.canal, c.finalidade).ok) bloqueados++
  }
  return { totalAlvo: alvos.length, semDestino, bloqueados, enviaveis: alvos.length - semDestino - bloqueados, amostra: alvos.slice(0, 5).map((a) => ({ nome: a.nome, vars: a.vars })) }
}

export async function prefsPorContato(tenantId: string, contatoIds: string[]) {
  const m = new Map<string, PrefLinha[]>()
  if (!contatoIds.length) return m
  for (let i = 0; i < contatoIds.length; i += 5000) {
    const rows = await prisma.comPreferencia.findMany({ where: { tenantId, contatoId: { in: contatoIds.slice(i, i + 5000) } } })
    for (const r of rows) m.set(r.contatoId, [...(m.get(r.contatoId) ?? []), r])
  }
  return m
}

export class CampanhaError extends Error {
  status: number
  constructor(msg: string, status = 409) {
    super(msg)
    this.status = status
  }
}

// Enfileira a campanha na caixa de saída (idempotente: destinatário único por chave).
export async function executarCampanha(tenantId: string, campanhaId: string, userId?: string) {
  const camp = await prisma.comCampanha.findFirst({ where: { id: campanhaId, tenantId } })
  if (!camp) throw new CampanhaError('Campanha não encontrada.', 404)
  if (!['RASCUNHO', 'AGENDADA', 'EXECUTANDO'].includes(camp.status)) throw new CampanhaError(`Campanha em status ${camp.status} não pode ser executada.`)
  const tpl = await prisma.comTemplate.findFirst({ where: { id: camp.templateId, tenantId, ativo: true } })
  if (!tpl) throw new CampanhaError('Template da campanha inexistente ou inativo.', 400)
  if (camp.canal !== 'IN_APP') {
    const canal = await canalAtivo(tenantId, camp.canal)
    if (!canal) throw new CampanhaError(`Canal ${camp.canal} não está configurado/ativo: configure em /comunicacao/canais antes de disparar.`)
  }
  await prisma.comCampanha.update({ where: { id: camp.id }, data: { status: 'EXECUTANDO', iniciadaEm: camp.iniciadaEm ?? new Date() } })

  const alvos = await resolverSegmento(tenantId, camp.segmento, camp.filtros)
  const existentes = new Set((await prisma.comCampanhaDestinatario.findMany({ where: { campanhaId: camp.id }, select: { chave: true } })).map((x) => x.chave))
  const prefs = await prefsPorContato(tenantId, alvos.map((a) => a.contatoId).filter(Boolean) as string[])
  const novas: any[] = []
  const dest: any[] = []
  let semDestino = 0
  let bloqueados = 0
  for (const a of alvos) {
    if (existentes.has(a.chave)) continue
    existentes.add(a.chave)
    const destino = pickDestino(camp.canal, a)
    const base = { id: crypto.randomUUID(), tenantId, campanhaId: camp.id, chave: a.chave, nome: a.nome, contatoId: a.contatoId, studentId: a.studentId, destino }
    if (!destino) {
      semDestino++
      dest.push({ ...base, resultado: 'SEM_DESTINO' })
      continue
    }
    if (!podeEnviar(prefs.get(a.contatoId ?? '') ?? [], camp.canal, camp.finalidade).ok) {
      bloqueados++
      dest.push({ ...base, resultado: 'BLOQUEADO_OPTOUT' })
      continue
    }
    const vars = { ...a.vars, ...(a.contatoId && !a.vars.curso ? await variaveisDoContato(tenantId, { nome: a.nome, studentId: a.studentId }).catch(() => ({})) : {}) }
    const assunto = tpl.assunto ? renderTemplate(tpl.assunto, vars).texto : undefined
    const nId = crypto.randomUUID()
    novas.push({ id: nId, tenantId, canal: camp.canal, studentId: a.studentId, destino, assunto, mensagem: renderTemplate(tpl.corpo, vars).texto, templateKey: tpl.chave, refType: 'ComCampanha', refId: camp.id, agendadoPara: new Date() })
    dest.push({ ...base, resultado: 'ENFILEIRADO', notificationId: nId })
  }
  for (let i = 0; i < novas.length; i += 1000) await prisma.eduNotification.createMany({ data: novas.slice(i, i + 1000) })
  for (let i = 0; i < dest.length; i += 1000) await prisma.comCampanhaDestinatario.createMany({ data: dest.slice(i, i + 1000), skipDuplicates: true })
  const upd = await prisma.comCampanha.update({
    where: { id: camp.id },
    data: { status: 'CONCLUIDA', concluidaEm: new Date(), totalAlvo: { increment: alvos.length - 0 }, totalEnfileirado: { increment: novas.length }, totalBloqueado: { increment: bloqueados }, totalSemDestino: { increment: semDestino } },
  })
  await audit({ tenantId, userId, modulo: 'comunicacao', acao: 'CAMPANHA_EXECUTADA', refType: 'ComCampanha', refId: camp.id, detalhes: { alvos: alvos.length, enfileirados: novas.length, bloqueados, semDestino } })
  return upd
}

export async function metricasCampanha(tenantId: string, camp: { id: string; iniciadaEm: Date | null }) {
  const grupos = await prisma.eduNotification.groupBy({ by: ['status'], where: { tenantId, refType: 'ComCampanha', refId: camp.id }, _count: { _all: true } })
  const c = Object.fromEntries(grupos.map((g) => [g.status, g._count._all])) as Record<string, number>
  const enviadasTotal = (c.ENVIADA ?? 0) + (c.ENTREGUE ?? 0) + (c.LIDA ?? 0)
  let respostas = 0
  if (camp.iniciadaEm) {
    const dest = await prisma.comCampanhaDestinatario.findMany({ where: { campanhaId: camp.id, resultado: 'ENFILEIRADO', contatoId: { not: null } }, select: { contatoId: true }, take: 20000 })
    const ids = dest.map((d) => d.contatoId!)
    if (ids.length) {
      const r = await prisma.comMensagem.findMany({ where: { tenantId, direcao: 'ENTRADA', createdAt: { gte: camp.iniciadaEm, lte: new Date(camp.iniciadaEm.getTime() + 72 * 3600_000) }, conversa: { contatoId: { in: ids } } }, select: { conversa: { select: { contatoId: true } } }, take: 20000 })
      respostas = new Set(r.map((x) => x.conversa.contatoId)).size
    }
  }
  const entregues = (c.ENTREGUE ?? 0) + (c.LIDA ?? 0)
  return {
    pendentes: c.PENDENTE ?? 0,
    enviadas: enviadasTotal,
    entregues,
    lidas: c.LIDA ?? 0,
    falhas: c.FALHA ?? 0,
    canceladas: c.CANCELADA ?? 0,
    respostas,
    taxaEntrega: enviadasTotal ? Math.round((entregues / enviadasTotal) * 1000) / 10 : 0,
    taxaLeitura: enviadasTotal ? Math.round(((c.LIDA ?? 0) / enviadasTotal) * 1000) / 10 : 0,
    taxaResposta: enviadasTotal ? Math.round((respostas / enviadasTotal) * 1000) / 10 : 0,
  }
}

export async function jobCampanhas() {
  const agora = new Date()
  const pend = await prisma.comCampanha.findMany({ where: { status: { in: ['AGENDADA', 'EXECUTANDO'] }, agendadaPara: { lte: agora } }, take: 20 })
  let executadas = 0
  let canceladas = 0
  for (const c of pend) {
    try {
      await executarCampanha(c.tenantId, c.id)
      executadas++
    } catch (e: any) {
      if (e instanceof CampanhaError) {
        await prisma.comCampanha.update({ where: { id: c.id }, data: { status: 'CANCELADA' } })
        await audit({ tenantId: c.tenantId, modulo: 'comunicacao', acao: 'CAMPANHA_CANCELADA_AUTO', refType: 'ComCampanha', refId: c.id, detalhes: { motivo: e.message } })
        canceladas++
      } else console.error('[com-campanha]', c.id, e)
    }
  }
  return { executadas, canceladas }
}

void getConfig
