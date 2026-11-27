import { prisma } from '../../lib/prisma'
import { ItemMesa, SeveridadeMesa, TTLCache, mesaItem, ordenarMesa, resumirMesa } from './logic'

// Central de pendências ("Minha mesa"): unifica lembretes, aprovações aguardando
// o usuário, etapas de jornada, tarefas atribuídas e notificações. Cada fonte é
// consultada em try/catch — uma tabela ausente nunca derruba a mesa.

const DAY = 86_400_000
const SUPER = ['ADMIN', 'OWNER', 'RECTOR', 'BOARD']

export interface UsuarioMesa { id: string; role: string; tenantId: string }
export interface OpcoesMesa { horizonteDias?: number; now?: Date }

type Coletor = (u: UsuarioMesa, now: Date, horizonte: number) => Promise<Array<Omit<ItemMesa, 'urgencia' | 'atrasadoDias'>>>

const sevPrazo = (prazo: Date | null | undefined, now: Date, base: SeveridadeMesa = 'INFO'): SeveridadeMesa => {
  if (!prazo) return base
  const dias = (prazo.getTime() - now.getTime()) / DAY
  if (dias < 0) return 'CRITICO'
  if (dias <= 2 && base === 'INFO') return 'ATENCAO'
  return base
}

const coletores: Record<string, Coletor> = {
  async lembretes(u, now, h) {
    const rows = await prisma.eduReminder.findMany({
      where: {
        tenantId: u.tenantId, status: { in: ['PENDENTE', 'NOTIFICADO', 'ADIADO'] },
        OR: [{ assigneeUserId: u.id }, { assigneeRole: u.role }],
        AND: [{ OR: [{ dueAt: { lte: new Date(now.getTime() + h * DAY) } }, { severity: 'CRITICO' }] }],
      },
      orderBy: { dueAt: 'asc' }, take: 300,
    })
    return rows.map((r) => ({
      id: `lembrete:${r.id}`, tipo: 'LEMBRETE' as const, origem: 'EduReminder', modulo: r.modulo, titulo: r.titulo, descricao: r.descricao,
      prazo: r.dueAt, severidade: (r.dueAt < now && r.severity === 'INFO' ? 'ATENCAO' : r.severity) as SeveridadeMesa,
      rota: null, ref: { type: 'EduReminder', id: r.id }, acoes: ['concluir', 'adiar'],
    }))
  },

  async aprovacoesSuprimentos(u, now) {
    const rows = await prisma.supAprovacao.findMany({
      where: { tenantId: u.tenantId, status: 'PENDENTE', requisicao: { status: 'AGUARDANDO_APROVACAO' } },
      include: { requisicao: { select: { id: true, numero: true, valorEstimado: true, necessarioEm: true, urgencia: true, justificativa: true } } },
      take: 1000,
    })
    // só a alçada vigente (menor nível pendente) de cada requisição
    const minNivel = new Map<string, number>()
    for (const a of rows) minNivel.set(a.requisicaoId, Math.min(minNivel.get(a.requisicaoId) ?? 99, a.nivel))
    return rows
      .filter((a) => a.nivel === minNivel.get(a.requisicaoId) && (a.papel.toUpperCase() === u.role || (SUPER.includes(u.role) && SUPER.includes(a.papel.toUpperCase()))))
      .map((a) => ({
        id: `sup-aprov:${a.id}`, tipo: 'APROVACAO' as const, origem: 'SupAprovacao', modulo: 'suprimentos',
        titulo: `Aprovar requisição ${a.requisicao.numero} (R$ ${a.requisicao.valorEstimado.toLocaleString('pt-BR')})`, descricao: a.requisicao.justificativa,
        prazo: a.requisicao.necessarioEm, severidade: sevPrazo(a.requisicao.necessarioEm, now, a.requisicao.urgencia === 'URGENTE' ? 'ATENCAO' : 'INFO'),
        rota: `/edu/suprimentos/requisicoes/${a.requisicao.id}`, ref: { type: 'SupRequisicao', id: a.requisicao.id }, acoes: ['aprovar', 'reprovar'],
      }))
  },

  async requerimentos(u, now) {
    const rows = await prisma.secProtocolo.findMany({
      where: { tenantId: u.tenantId, status: { in: ['ABERTO', 'EM_ANALISE'] }, OR: [{ responsavelId: u.id }, { responsavelId: null, tipo: { responsavelRole: u.role } }] },
      orderBy: { prazoEm: 'asc' }, take: 200,
    })
    return rows.map((r) => ({
      id: `protocolo:${r.id}`, tipo: 'APROVACAO' as const, origem: 'SecProtocolo', modulo: 'secretaria',
      titulo: `Requerimento ${r.numero}: ${r.assunto}`, descricao: r.solicitanteNome ? `Solicitante: ${r.solicitanteNome}` : null,
      prazo: r.prazoEm, severidade: sevPrazo(r.prazoEm, now, r.prioridade === 'ALTA' || r.prioridade === 'URGENTE' ? 'ATENCAO' : 'INFO'),
      rota: `/edu/secretaria/protocolos/${r.id}`, ref: { type: 'SecProtocolo', id: r.id },
    }))
  },

  async revisoesNota(u, now) {
    const professor = u.role === 'TEACHER'
    const gestor = u.role === 'COORDINATOR' || SUPER.includes(u.role)
    if (!professor && !gestor) return []
    let where: any = { tenantId: u.tenantId }
    if (professor) {
      const ids = (await prisma.classSection.findMany({ where: { tenantId: u.tenantId, professorUserId: u.id }, select: { id: true }, take: 2000 })).map((s) => s.id)
      where = { ...where, status: 'SOLICITADA', classSectionId: { in: ids } }
    } else where = { ...where, status: 'PARECER_EMITIDO' }
    const rows = await prisma.ntRevisao.findMany({ where, orderBy: { createdAt: 'asc' }, take: 200 })
    return rows.map((r) => ({
      id: `revisao:${r.id}`, tipo: 'APROVACAO' as const, origem: 'NtRevisao', modulo: 'notas',
      titulo: professor ? 'Emitir parecer sobre revisão de nota' : 'Decidir revisão de nota', descricao: r.justificativa.slice(0, 160),
      prazo: r.prazoParecer, severidade: sevPrazo(r.prazoParecer, now), rota: `/edu/notas/revisoes/${r.id}`, ref: { type: 'NtRevisao', id: r.id },
    }))
  },

  async progressoesCarreira(u) {
    if (u.role !== 'SECRETARY' && !SUPER.includes(u.role)) return []
    const rows = await prisma.govCarreiraProgressao.findMany({ where: { tenantId: u.tenantId, status: { in: ['SOLICITADA', 'EM_ANALISE'] } }, orderBy: { createdAt: 'asc' }, take: 100 })
    return rows.map((r) => ({
      id: `progressao:${r.id}`, tipo: 'APROVACAO' as const, origem: 'GovCarreiraProgressao', modulo: 'governanca',
      titulo: 'Analisar progressão funcional', descricao: r.justificativa, prazo: null, severidade: 'INFO' as const,
      rota: `/edu/governanca/carreira/progressoes/${r.id}`, ref: { type: 'GovCarreiraProgressao', id: r.id },
    }))
  },

  async reservasEspaco(u, now) {
    if (u.role !== 'FACILITIES' && !SUPER.includes(u.role)) return []
    const rows = await prisma.calReserva.findMany({ where: { tenantId: u.tenantId, status: 'PENDENTE', fim: { gte: now } }, orderBy: { inicio: 'asc' }, take: 100 })
    return rows.map((r) => ({
      id: `reserva:${r.id}`, tipo: 'APROVACAO' as const, origem: 'CalReserva', modulo: 'calendario',
      titulo: `Decidir reserva de espaço: ${r.titulo}`, descricao: r.finalidade, prazo: r.inicio, severidade: sevPrazo(r.inicio, now),
      rota: `/edu/calendario/reservas/${r.id}`, ref: { type: 'CalReserva', id: r.id }, acoes: ['aprovar', 'rejeitar'],
    }))
  },

  async tarefasInfra(u, now) {
    const [os, ch] = await Promise.all([
      prisma.infOrdemServico.findMany({ where: { tenantId: u.tenantId, responsavelUserId: u.id, status: { notIn: ['CONCLUIDA', 'CANCELADA'] } }, orderBy: { prazoSla: 'asc' }, take: 100 }),
      prisma.infChamado.findMany({ where: { tenantId: u.tenantId, atendenteUserId: u.id, status: { in: ['ABERTO', 'EM_ATENDIMENTO'] } }, orderBy: { createdAt: 'asc' }, take: 100 }),
    ])
    return [
      ...os.map((o) => ({ id: `os:${o.id}`, tipo: 'TAREFA' as const, origem: 'InfOrdemServico', modulo: 'infraestrutura', titulo: `OS ${o.numero}: ${o.titulo}`, descricao: o.descricao, prazo: o.prazoSla, severidade: sevPrazo(o.prazoSla, now, o.prioridade === 'URGENTE' || o.prioridade === 'ALTA' ? 'ATENCAO' : 'INFO'), rota: `/edu/infraestrutura/ordens-servico/${o.id}`, ref: { type: 'InfOrdemServico', id: o.id } })),
      ...ch.map((o) => ({ id: `chamado:${o.id}`, tipo: 'TAREFA' as const, origem: 'InfChamado', modulo: 'infraestrutura', titulo: `Chamado ${o.numero}: ${o.titulo}`, descricao: o.descricao, prazo: null, severidade: (o.prioridade === 'URGENTE' ? 'ATENCAO' : 'INFO') as SeveridadeMesa, rota: `/edu/infraestrutura/chamados/${o.id}`, ref: { type: 'InfChamado', id: o.id } })),
    ]
  },

  async followupsAdmissoes(u, now, h) {
    const rows = await prisma.admCandidato.findMany({ where: { tenantId: u.tenantId, responsavelId: u.id, proximoContatoEm: { lte: new Date(now.getTime() + Math.min(h, 2) * DAY) }, status: { notIn: ['MATRICULADO', 'DESISTENTE', 'REPROVADO'] } }, orderBy: { proximoContatoEm: 'asc' }, take: 100 })
    return rows.map((r) => ({
      id: `followup:${r.id}`, tipo: 'TAREFA' as const, origem: 'AdmCandidato', modulo: 'admissoes', titulo: `Contatar candidato ${r.nome}`, descricao: `Status: ${r.status}`,
      prazo: r.proximoContatoEm, severidade: sevPrazo(r.proximoContatoEm, now), rota: `/edu/admissoes/candidatos/${r.id}`, ref: { type: 'AdmCandidato', id: r.id },
    }))
  },

  async diariosProfessor(u, now, h) {
    if (u.role !== 'TEACHER') return []
    const ids = (await prisma.classSection.findMany({ where: { tenantId: u.tenantId, professorUserId: u.id }, select: { id: true, nome: true }, take: 2000 }))
    const nome = new Map(ids.map((s) => [s.id, s.nome]))
    const rows = await prisma.ntDiario.findMany({ where: { tenantId: u.tenantId, status: 'ABERTO', classSectionId: { in: ids.map((s) => s.id) }, prazoLancamento: { lte: new Date(now.getTime() + Math.min(h, 14) * DAY) } }, orderBy: { prazoLancamento: 'asc' }, take: 100 })
    return rows.map((r) => ({
      id: `diario:${r.id}`, tipo: 'TAREFA' as const, origem: 'NtDiario', modulo: 'notas', titulo: `Lançar notas e fechar diário — ${nome.get(r.classSectionId) ?? 'turma'}`, descricao: null,
      prazo: r.prazoLancamento, severidade: sevPrazo(r.prazoLancamento, now), rota: `/edu/notas/turmas/${r.classSectionId}/diario`, ref: { type: 'NtDiario', id: r.id },
    }))
  },

  async etapasJornada(u, now) {
    const rows = await prisma.jorEtapa.findMany({
      where: { tenantId: u.tenantId, status: { in: ['ABERTA', 'ATRASADA'] }, instancia: { status: 'ATIVA' }, OR: [{ responsavelUserId: u.id }, { responsavelUserId: null, papel: u.role }] },
      include: { instancia: { select: { personNome: true, templateChave: true } } }, orderBy: { prazoEm: 'asc' }, take: 200,
    })
    return rows.map((r) => ({
      id: `etapa:${r.id}`, tipo: 'ETAPA_JORNADA' as const, origem: 'JorEtapa', modulo: r.modulo ?? 'jornadas',
      titulo: `${r.titulo}${r.instancia.personNome ? ` — ${r.instancia.personNome}` : ''}`, descricao: `Jornada ${r.instancia.templateChave}`,
      prazo: r.prazoEm, severidade: r.status === 'ATRASADA' ? ('CRITICO' as const) : sevPrazo(r.prazoEm, now), rota: r.rota ?? `/edu/jornadas/etapas/${r.id}`, ref: { type: 'JorEtapa', id: r.id },
    }))
  },

  async notificacoes(u, now) {
    const rows = await prisma.eduNotification.findMany({
      where: { tenantId: u.tenantId, userId: u.id, canal: 'IN_APP', status: { in: ['PENDENTE', 'ENVIADA', 'ENTREGUE'] }, agendadoPara: { lte: now }, OR: [{ refType: null }, { refType: { not: 'EduReminder' } }] },
      orderBy: { createdAt: 'desc' }, take: 50,
    })
    return rows.map((n) => ({
      id: `notificacao:${n.id}`, tipo: 'NOTIFICACAO' as const, origem: 'EduNotification', modulo: n.refType ?? 'sistema', titulo: n.assunto ?? n.mensagem.slice(0, 80), descricao: n.assunto ? n.mensagem : null,
      prazo: null, severidade: 'INFO' as const, rota: null, ref: { type: 'EduNotification', id: n.id }, acoes: ['marcar-lida'],
    }))
  },
}

export async function coletarMesa(u: UsuarioMesa, o: OpcoesMesa = {}) {
  const now = o.now ?? new Date()
  const h = o.horizonteDias ?? 30
  const itens: ItemMesa[] = []
  const falhas: string[] = []
  await Promise.all(Object.entries(coletores).map(async ([nome, f]) => {
    try {
      for (const i of await f(u, now, h)) itens.push(mesaItem(i, now))
    } catch (e: any) {
      falhas.push(nome)
      console.warn(`[reitoria:mesa:${nome}]`, e?.message || e)
    }
  }))
  return { itens: ordenarMesa(itens), falhas }
}

const resumoCache = new TTLCache<any>(20_000, 1000)

// Dados do "sino" do cabeçalho: contadores + as 5 mais urgentes.
export async function resumoSino(u: UsuarioMesa) {
  const k = `${u.tenantId}|${u.id}`
  const hit = resumoCache.get(k)
  if (hit) return hit
  const { itens, falhas } = await coletarMesa(u)
  const naoLidas = await prisma.eduNotification.count({ where: { tenantId: u.tenantId, userId: u.id, canal: 'IN_APP', status: { in: ['PENDENTE', 'ENVIADA', 'ENTREGUE'] } } }).catch(() => 0)
  const r = { ...resumirMesa(itens), notificacoesNaoLidas: naoLidas, badge: itens.filter((i) => i.tipo !== 'NOTIFICACAO').length + naoLidas, topo: itens.slice(0, 5), fontesComErro: falhas }
  resumoCache.set(k, r)
  return r
}
export const limparResumoSino = (tenantId: string, userId: string) => resumoCache.clearPrefix(`${tenantId}|${userId}`)

// Visão da reitoria: pendências vencidas por módulo e por responsável.
export async function panoramaPendencias(tenantId: string, now = new Date()) {
  const rows = await prisma.eduReminder.findMany({
    where: { tenantId, status: { in: ['PENDENTE', 'NOTIFICADO', 'ADIADO'] }, dueAt: { lt: now } },
    select: { modulo: true, assigneeUserId: true, assigneeRole: true, severity: true, dueAt: true, titulo: true, id: true }, orderBy: { dueAt: 'asc' }, take: 5000,
  })
  const porModulo: Record<string, number> = {}
  const porResp = new Map<string, { chave: string; userId?: string | null; papel?: string | null; total: number; maisAntigaDias: number }>()
  for (const r of rows) {
    porModulo[r.modulo] = (porModulo[r.modulo] ?? 0) + 1
    const chave = r.assigneeUserId ?? `papel:${r.assigneeRole ?? 'sem-responsavel'}`
    const dias = Math.ceil((now.getTime() - r.dueAt.getTime()) / DAY)
    const e = porResp.get(chave) ?? { chave, userId: r.assigneeUserId, papel: r.assigneeRole, total: 0, maisAntigaDias: 0 }
    e.total++; e.maisAntigaDias = Math.max(e.maisAntigaDias, dias)
    porResp.set(chave, e)
  }
  const resp = [...porResp.values()].sort((a, b) => b.total - a.total).slice(0, 20)
  const ids = resp.map((r) => r.userId).filter(Boolean) as string[]
  const users = ids.length ? await prisma.user.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, firstName: true, lastName: true, role: true } }).catch(() => []) : []
  const nome = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]))
  return {
    totalVencidos: rows.length,
    criticos: rows.filter((r) => r.severity === 'CRITICO').length,
    porModulo,
    porResponsavel: resp.map((r) => ({ ...r, nome: r.userId ? nome.get(r.userId) ?? null : null })),
    maisAntigos: rows.slice(0, 10).map((r) => ({ id: r.id, modulo: r.modulo, titulo: r.titulo, dueAt: r.dueAt, diasAtraso: Math.ceil((now.getTime() - r.dueAt.getTime()) / DAY) })),
  }
}
