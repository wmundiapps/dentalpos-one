import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { mountCrud, pageParams, parseBody, qs } from '../core/crud'
import { audit, notify } from '../core/notify'
import { cancelReminders, completeReminders, scheduleReminder } from '../core/reminders'
import {
  DIA, GESTAO, LEITURA, MOD, SECRETARIA, dia, dt, ehGestor, ehRecepcao, exigir, exigirAluno, exigirPrograma, exigirUser, getConfig, httpErr,
  inicioSemana, mapaAlunos, mapaProgramas, mapaUsuarios, urlOpc, zId, alunoMatriculadoNoCurso,
} from './servico'

const DOCS_PADRAO = ['TERMO_COMPROMISSO', 'PLANO_ATIVIDADES', 'SEGURO', 'CONVENIO'] as const

type Papel = 'ALUNO' | 'ORIENTADOR' | 'GESTAO' | 'SECRETARIA'
/** Define o papel do usuário em relação ao estágio ou nega o acesso (403). */
function papelNoEstagio(req: AuthenticatedRequest, e: { studentId: string; orientadorUserId: string }): Papel {
  const u = req.user!
  if (ehGestor(req)) return 'GESTAO'
  if (u.role === 'SECRETARY') return 'SECRETARIA'
  if (u.role === 'TEACHER' && e.orientadorUserId === u.id) return 'ORIENTADOR'
  if (u.role === 'STUDENT' && u.studentId && e.studentId === u.studentId) return 'ALUNO'
  throw httpErr(403, 'Você não participa deste estágio.')
}
const podeValidar = (p: Papel) => p === 'ORIENTADOR' || p === 'GESTAO' || p === 'SECRETARIA'

async function carregar(tenantId: string, id: string) {
  return exigir(prisma.cprEstagio.findFirst({ where: { id, tenantId } }), 'Estágio não encontrado.')
}

export function situacaoConvenio(c: { inicio: Date; fim: Date; status: string }, ref = new Date()) {
  const dias = Math.ceil((c.fim.getTime() - ref.getTime()) / DIA)
  const situacao = c.status !== 'ATIVO' ? c.status : ref < c.inicio ? 'FUTURO' : dias < 0 ? 'VENCIDO' : dias <= 60 ? 'VENCENDO' : 'VIGENTE'
  return { situacao, diasParaVencer: dias }
}

async function horasResumo(tenantId: string, estagioId: string) {
  const g = await prisma.cprEstagioHora.groupBy({ by: ['status'], where: { tenantId, estagioId }, _sum: { horas: true } })
  const s = (st: string) => g.find((x) => x.status === st)?._sum.horas ?? 0
  return { validadas: s('VALIDADA'), pendentes: s('PENDENTE'), rejeitadas: s('REJEITADA') }
}

export async function alertasEstagios(tenantId: string) {
  const cfg = await getConfig(tenantId)
  const agora = new Date()
  const alertas: Array<{ tipo: string; severidade: 'INFO' | 'ATENCAO' | 'CRITICO'; titulo: string; refType: string; refId: string; vencimento?: Date | null; dias?: number | null; programId?: string | null }> = []
  const conv = await prisma.cprConvenio.findMany({ where: { tenantId, status: 'ATIVO', fim: { lte: new Date(agora.getTime() + cfg.diasAlertaConvenio * DIA) } } })
  const conc = new Map((await prisma.cprConcedente.findMany({ where: { tenantId, id: { in: conv.map((c) => c.concedenteId) } }, select: { id: true, nome: true } })).map((c) => [c.id, c.nome]))
  for (const c of conv) {
    const d = Math.ceil((c.fim.getTime() - agora.getTime()) / DIA)
    alertas.push({ tipo: d < 0 ? 'CONVENIO_VENCIDO' : 'CONVENIO_VENCENDO', severidade: d < 0 ? 'CRITICO' : d <= 15 ? 'ATENCAO' : 'INFO', titulo: `Convênio ${c.numero} (${conc.get(c.concedenteId) ?? 'concedente'}) ${d < 0 ? `venceu há ${-d} dia(s)` : `vence em ${d} dia(s)`}`, refType: 'CprConvenio', refId: c.id, vencimento: c.fim, dias: d })
  }
  const ativos = await prisma.cprEstagio.findMany({ where: { tenantId, status: { in: ['EM_ANDAMENTO', 'AGUARDANDO_DOCUMENTOS'] } } })
  const alunos = await mapaAlunos(tenantId, ativos.map((e) => e.studentId))
  for (const e of ativos) {
    const nome = alunos.get(e.studentId) ?? 'Aluno'
    if (e.seguroValidade) {
      const d = Math.ceil((e.seguroValidade.getTime() - agora.getTime()) / DIA)
      if (d <= cfg.diasAlertaSeguro) alertas.push({ tipo: d < 0 ? 'SEGURO_VENCIDO' : 'SEGURO_VENCENDO', severidade: d < 0 ? 'CRITICO' : 'ATENCAO', titulo: `Seguro de ${nome} ${d < 0 ? 'vencido' : `vence em ${d} dia(s)`}`, refType: 'CprEstagio', refId: e.id, vencimento: e.seguroValidade, dias: d, programId: e.programId })
    }
    if (e.status === 'EM_ANDAMENTO') {
      const d = Math.ceil((e.fim.getTime() - agora.getTime()) / DIA)
      if (d <= cfg.diasAlertaFimEstagio) alertas.push({ tipo: 'ESTAGIO_TERMINANDO', severidade: d < 0 ? 'CRITICO' : 'INFO', titulo: `Estágio de ${nome} ${d < 0 ? `terminou há ${-d} dia(s) e não foi encerrado` : `termina em ${d} dia(s)`}`, refType: 'CprEstagio', refId: e.id, vencimento: e.fim, dias: d, programId: e.programId })
    } else {
      alertas.push({ tipo: 'DOCUMENTOS_PENDENTES', severidade: e.inicio < agora ? 'CRITICO' : 'ATENCAO', titulo: `Estágio de ${nome} aguarda documentos para iniciar`, refType: 'CprEstagio', refId: e.id, vencimento: e.inicio, dias: Math.ceil((e.inicio.getTime() - agora.getTime()) / DIA), programId: e.programId })
    }
  }
  const limite = new Date(agora.getTime() - cfg.diasHorasPendentes * DIA)
  const pend = await prisma.cprEstagioHora.groupBy({ by: ['estagioId'], where: { tenantId, status: 'PENDENTE', createdAt: { lt: limite } }, _sum: { horas: true }, _count: true })
  if (pend.length) {
    const ests = await prisma.cprEstagio.findMany({ where: { tenantId, id: { in: pend.map((p) => p.estagioId) } } })
    const nm = await mapaAlunos(tenantId, ests.map((e) => e.studentId))
    for (const p of pend) {
      const e = ests.find((x) => x.id === p.estagioId)
      if (e) alertas.push({ tipo: 'HORAS_PENDENTES', severidade: 'ATENCAO', titulo: `${p._sum.horas ?? 0} h de ${nm.get(e.studentId) ?? 'aluno'} aguardam validação há mais de ${cfg.diasHorasPendentes} dias`, refType: 'CprEstagio', refId: e.id, programId: e.programId })
    }
  }
  const ordem = { CRITICO: 0, ATENCAO: 1, INFO: 2 }
  return alertas.sort((a, b) => ordem[a.severidade] - ordem[b.severidade])
}

/** Job diário: transforma os alertas em lembretes (sem duplicar) e notifica os orientadores. */
export async function jobAlertasEstagios() {
  const tenants = await prisma.cprConfig.findMany({ select: { tenantId: true } })
  const extra = await prisma.cprEstagio.findMany({ distinct: ['tenantId'], select: { tenantId: true } })
  const ids = [...new Set([...tenants.map((t) => t.tenantId), ...extra.map((t) => t.tenantId)])]
  let criados = 0
  for (const tenantId of ids) {
    const al = await alertasEstagios(tenantId)
    for (const a of al) {
      const est = a.refType === 'CprEstagio' ? await prisma.cprEstagio.findFirst({ where: { id: a.refId, tenantId } }) : null
      await scheduleReminder({
        tenantId, modulo: MOD, titulo: a.titulo, dueAt: a.vencimento ?? new Date(Date.now() + DIA), remindAt: new Date(), severity: a.severidade, refType: a.refType, refId: a.refId,
        dedupeKey: `cpr:${a.tipo}:${a.refId}`, assigneeUserId: est?.orientadorUserId, assigneeRole: est ? undefined : 'COORDINATOR', assigneeStudentId: a.tipo === 'ESTAGIO_TERMINANDO' || a.tipo === 'SEGURO_VENCENDO' ? est?.studentId : undefined,
      })
      criados++
    }
  }
  return { tenants: ids.length, lembretes: criados }
}

export function mountEstagios(router: Router) {
  const ler = requireRole(...LEITURA)
  const escrever = requireRole(...SECRETARIA)

  // ---------------------------------------------------------------- cadastros
  mountCrud(router, {
    model: 'cprConcedente', path: '/estagios/concedentes', read: LEITURA, write: SECRETARIA, modulo: MOD, search: ['nome', 'cnpj', 'cidade'], filters: ['tipo', 'ativo'], orderBy: { nome: 'asc' },
    create: z.object({ nome: z.string().trim().min(2).max(160), cnpj: z.string().trim().max(24).optional(), tipo: z.enum(['EMPRESA', 'ORGAO_PUBLICO', 'HOSPITAL', 'CLINICA', 'ONG', 'ESCOLA', 'FAZENDA', 'OUTRO']).default('EMPRESA'), cidade: z.string().max(80).optional(), uf: z.string().max(2).optional(), endereco: z.string().max(200).optional(), contatoNome: z.string().max(120).optional(), contatoEmail: z.string().email().optional(), contatoTelefone: z.string().max(30).optional(), ativo: z.boolean().optional() }),
  })

  router.get('/estagios/convenios/situacao', ler, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const lista = await prisma.cprConvenio.findMany({ where: { tenantId }, orderBy: { fim: 'asc' }, take: 500 })
    const conc = new Map((await prisma.cprConcedente.findMany({ where: { tenantId }, select: { id: true, nome: true } })).map((c) => [c.id, c.nome]))
    res.json({ items: lista.map((c) => ({ ...c, concedente: conc.get(c.concedenteId) ?? null, ...situacaoConvenio(c) })) })
  }))

  mountCrud(router, {
    model: 'cprConvenio', path: '/estagios/convenios', read: LEITURA, write: SECRETARIA, modulo: MOD, search: ['numero', 'objeto'], filters: ['concedenteId', 'status'], orderBy: { fim: 'asc' },
    create: z.object({ concedenteId: zId, numero: z.string().trim().min(1).max(60), objeto: z.string().max(300).optional(), inicio: dt, fim: dt, documentoUrl: urlOpc, status: z.enum(['ATIVO', 'ENCERRADO', 'SUSPENSO']).default('ATIVO') }),
    beforeCreate: async (d, req) => {
      if (d.fim <= d.inicio) throw httpErr(400, 'A vigência do convênio deve terminar depois do início.')
      await exigir(prisma.cprConcedente.findFirst({ where: { id: d.concedenteId, tenantId: getTenantId(req) } }), 'Concedente não encontrado.', 400)
    },
    beforeUpdate: async (d, _req, cur) => { if ((d.fim ?? cur.fim) <= (d.inicio ?? cur.inicio)) throw httpErr(400, 'A vigência do convênio deve terminar depois do início.') },
    afterCreate: async (row, req) => {
      await scheduleReminder({ tenantId: row.tenantId, modulo: MOD, titulo: `Renovar convênio ${row.numero}`, dueAt: row.fim, antecedenciaDias: 60, severity: 'ATENCAO', refType: 'CprConvenio', refId: row.id, assigneeRole: 'COORDINATOR', dedupeKey: `cpr:convenio:${row.id}` })
      void req
    },
    afterUpdate: async (row) => {
      if (row.status !== 'ATIVO') await cancelReminders({ tenantId: row.tenantId, refType: 'CprConvenio', refId: row.id })
      else await scheduleReminder({ tenantId: row.tenantId, modulo: MOD, titulo: `Renovar convênio ${row.numero}`, dueAt: row.fim, antecedenciaDias: 60, severity: 'ATENCAO', refType: 'CprConvenio', refId: row.id, assigneeRole: 'COORDINATOR', dedupeKey: `cpr:convenio:${row.id}`, reabrir: true })
    },
  })

  mountCrud(router, {
    model: 'cprCampoEstagio', path: '/estagios/campos', read: LEITURA, write: SECRETARIA, modulo: MOD, search: ['nome', 'area'], filters: ['concedenteId', 'ativo'], orderBy: { nome: 'asc' },
    create: z.object({ concedenteId: zId, convenioId: zId.optional(), nome: z.string().trim().min(2).max(160), area: z.string().max(80).optional(), local: z.string().max(200).optional(), supervisorNome: z.string().max(120).optional(), supervisorEmail: z.string().email().optional(), supervisorCargo: z.string().max(80).optional(), supervisorRegistro: z.string().max(40).optional(), ativo: z.boolean().optional() }),
    beforeCreate: async (d, req) => {
      const t = getTenantId(req)
      await exigir(prisma.cprConcedente.findFirst({ where: { id: d.concedenteId, tenantId: t } }), 'Concedente não encontrado.', 400)
      if (d.convenioId) await exigir(prisma.cprConvenio.findFirst({ where: { id: d.convenioId, tenantId: t, concedenteId: d.concedenteId } }), 'Convênio não pertence a este concedente.', 400)
    },
  })

  router.get('/estagios/vagas/disponibilidade', ler, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const programId = qs(req.query.programId)
    const vagas = await prisma.cprVaga.findMany({ where: { tenantId, ativa: true, ...(programId ? { programId } : {}) } })
    const [campos, progs, ocup] = await Promise.all([
      prisma.cprCampoEstagio.findMany({ where: { tenantId, id: { in: vagas.map((v) => v.campoId) } } }),
      mapaProgramas(tenantId, vagas.map((v) => v.programId)),
      prisma.cprEstagio.groupBy({ by: ['vagaId'], where: { tenantId, status: { in: ['AGUARDANDO_DOCUMENTOS', 'EM_ANDAMENTO'] } }, _count: true }),
    ])
    const conc = new Map((await prisma.cprConcedente.findMany({ where: { tenantId, id: { in: campos.map((c) => c.concedenteId) } }, select: { id: true, nome: true } })).map((c) => [c.id, c.nome]))
    const convs = await prisma.cprConvenio.findMany({ where: { tenantId, concedenteId: { in: campos.map((c) => c.concedenteId) }, status: 'ATIVO' } })
    res.json({
      items: vagas.map((v) => {
        const campo = campos.find((c) => c.id === v.campoId)
        const ocupadas = ocup.find((o) => o.vagaId === v.id)?._count ?? 0
        const cv = convs.filter((c) => c.concedenteId === campo?.concedenteId).sort((a, b) => b.fim.getTime() - a.fim.getTime())[0]
        return { ...v, campo: campo?.nome ?? null, concedente: campo ? conc.get(campo.concedenteId) ?? null : null, curso: progs.get(v.programId) ?? null, ocupadas, disponiveis: Math.max(0, v.quantidade - ocupadas), convenio: cv ? { numero: cv.numero, fim: cv.fim, ...situacaoConvenio(cv) } : null }
      }),
    })
  }))

  mountCrud(router, {
    model: 'cprVaga', path: '/estagios/vagas', read: LEITURA, write: SECRETARIA, modulo: MOD, filters: ['campoId', 'programId', 'ativa'],
    create: z.object({ campoId: zId, programId: zId, quantidade: z.number().int().min(1).max(500).default(1), inicio: dt.optional(), fim: dt.optional(), requisitos: z.string().max(500).optional(), ativa: z.boolean().optional() }),
    beforeCreate: async (d, req) => {
      const t = getTenantId(req)
      await exigir(prisma.cprCampoEstagio.findFirst({ where: { id: d.campoId, tenantId: t, ativo: true } }), 'Campo de estágio não encontrado ou inativo.', 400)
      await exigirPrograma(t, d.programId)
      if (d.inicio && d.fim && d.fim <= d.inicio) throw httpErr(400, 'Período da vaga inválido.')
    },
  })

  // ---------------------------------------------------------------- painel e alertas
  router.get('/estagios/alertas', requireRole(...SECRETARIA, 'TEACHER'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    let al = await alertasEstagios(tenantId)
    if (req.user!.role === 'TEACHER') {
      const meus = new Set((await prisma.cprEstagio.findMany({ where: { tenantId, orientadorUserId: req.user!.id }, select: { id: true } })).map((e) => e.id))
      al = al.filter((a) => a.refType === 'CprEstagio' && meus.has(a.refId))
    }
    res.json({ items: al, total: al.length })
  }))

  router.get('/estagios/painel', requireRole(...SECRETARIA, 'TEACHER'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const programId = qs(req.query.programId)
    const where: any = { tenantId, ...(programId ? { programId } : {}), ...(req.user!.role === 'TEACHER' ? { orientadorUserId: req.user!.id } : {}) }
    const ests = await prisma.cprEstagio.findMany({ where })
    const horas = await prisma.cprEstagioHora.groupBy({ by: ['estagioId', 'status'], where: { tenantId, estagioId: { in: ests.map((e) => e.id) } }, _sum: { horas: true } })
    const vagas = await prisma.cprVaga.findMany({ where: { tenantId, ativa: true, ...(programId ? { programId } : {}) } })
    const progs = await mapaProgramas(tenantId, [...ests.map((e) => e.programId), ...vagas.map((v) => v.programId)])
    const porCurso = new Map<string, any>()
    const get = (pid: string) => { if (!porCurso.has(pid)) porCurso.set(pid, { programId: pid, curso: progs.get(pid) ?? '—', vagas: 0, ocupadas: 0, aguardandoDocumentos: 0, emAndamento: 0, encerrados: 0, aprovados: 0, reprovados: 0, horasValidadas: 0, horasPendentes: 0, horasPrevistas: 0 }); return porCurso.get(pid) }
    for (const v of vagas) get(v.programId).vagas += v.quantidade
    for (const e of ests) {
      const c = get(e.programId)
      if (e.status === 'AGUARDANDO_DOCUMENTOS') { c.aguardandoDocumentos++; c.ocupadas++ }
      if (e.status === 'EM_ANDAMENTO') { c.emAndamento++; c.ocupadas++; c.horasPrevistas += e.cargaHorariaTotal }
      if (e.status === 'ENCERRADO') { c.encerrados++; if (e.resultado === 'APROVADO') c.aprovados++; else c.reprovados++ }
      for (const h of horas.filter((x) => x.estagioId === e.id)) { if (h.status === 'VALIDADA') c.horasValidadas += h._sum.horas ?? 0; if (h.status === 'PENDENTE') c.horasPendentes += h._sum.horas ?? 0 }
    }
    const alertas = await alertasEstagios(tenantId)
    const cursos = [...porCurso.values()].map((c) => ({ ...c, progressoHoras: c.horasPrevistas ? Math.round((c.horasValidadas / c.horasPrevistas) * 1000) / 10 : null }))
    res.json({ cursos, totais: { estagios: ests.length, emAndamento: ests.filter((e) => e.status === 'EM_ANDAMENTO').length, aguardandoDocumentos: ests.filter((e) => e.status === 'AGUARDANDO_DOCUMENTOS').length, encerrados: ests.filter((e) => e.status === 'ENCERRADO').length, alertasCriticos: alertas.filter((a) => a.severidade === 'CRITICO').length, alertas: alertas.length } })
  }))

  // ---------------------------------------------------------------- estágio: criação e consulta
  router.get('/estagios', ler, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    const u = req.user!
    if (u.role === 'STUDENT') where.studentId = u.studentId ?? '__nenhum__'
    else if (u.role === 'TEACHER') where.orientadorUserId = u.id
    for (const f of ['status', 'programId', 'studentId', 'campoId', 'orientadorUserId']) { const v = qs((req.query as any)[f]); if (v && u.role !== 'STUDENT' && !(u.role === 'TEACHER' && f === 'orientadorUserId')) where[f] = v }
    const [rows, total] = await Promise.all([prisma.cprEstagio.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }), prisma.cprEstagio.count({ where })])
    const [al, us, ps, campos] = await Promise.all([mapaAlunos(tenantId, rows.map((r) => r.studentId)), mapaUsuarios(tenantId, rows.map((r) => r.orientadorUserId)), mapaProgramas(tenantId, rows.map((r) => r.programId)), prisma.cprCampoEstagio.findMany({ where: { tenantId, id: { in: rows.map((r) => r.campoId) } }, select: { id: true, nome: true } })])
    const hs = await prisma.cprEstagioHora.groupBy({ by: ['estagioId', 'status'], where: { tenantId, estagioId: { in: rows.map((r) => r.id) } }, _sum: { horas: true } })
    res.json({
      items: rows.map((r) => {
        const val = hs.find((h) => h.estagioId === r.id && h.status === 'VALIDADA')?._sum.horas ?? 0
        const pen = hs.find((h) => h.estagioId === r.id && h.status === 'PENDENTE')?._sum.horas ?? 0
        return { ...r, aluno: al.get(r.studentId) ?? null, orientador: us.get(r.orientadorUserId) ?? null, curso: ps.get(r.programId) ?? null, campo: campos.find((c) => c.id === r.campoId)?.nome ?? null, horasValidadas: val, horasPendentes: pen, progresso: r.cargaHorariaTotal ? Math.min(100, Math.round((val / r.cargaHorariaTotal) * 1000) / 10) : 0 }
      }),
      total, page, pageSize,
    })
  }))

  const criarSchema = z.object({
    studentId: zId, vagaId: zId, orientadorUserId: zId, tipo: z.enum(['OBRIGATORIO', 'NAO_OBRIGATORIO']).default('OBRIGATORIO'),
    inicio: dt, fim: dt, cargaHorariaTotal: z.number().min(10).max(2000), horasSemana: z.number().min(1).max(40).default(20),
    supervisorCampoNome: z.string().max(120).optional(), supervisorCampoEmail: z.string().email().optional(), planoAtividades: z.string().max(5000).optional(),
    pcd: z.boolean().optional(),
  })
  router.post('/estagios', escrever, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(criarSchema, req.body)
    const cfg = await getConfig(tenantId)
    if (b.fim <= b.inicio) throw httpErr(400, 'O estágio deve terminar depois do início.')
    const aluno = await exigirAluno(tenantId, b.studentId)
    const orient = await exigirUser(tenantId, b.orientadorUserId, 'Professor orientador não encontrado.')
    if (!['TEACHER', 'COORDINATOR'].includes(orient.role)) throw httpErr(400, 'O orientador deve ser um professor ou coordenador.')
    const vaga = await exigir(prisma.cprVaga.findFirst({ where: { id: b.vagaId, tenantId } }), 'Vaga não encontrada.', 400)
    if (!vaga.ativa) throw httpErr(409, 'Vaga inativa.', 'VAGA_INATIVA')
    if (vaga.inicio && b.inicio < vaga.inicio || vaga.fim && b.fim > vaga.fim) throw httpErr(409, 'O período do estágio está fora do período da vaga.', 'FORA_PERIODO_VAGA')
    if (!(await alunoMatriculadoNoCurso(aluno.id, vaga.programId))) throw httpErr(409, 'O aluno não está matriculado (ativo) no curso da vaga.', 'ALUNO_FORA_DO_CURSO')
    // Lei 11.788/2008: até 6 h/dia e 30 h/semana no ensino superior; não obrigatório até 2 anos (exceto PcD).
    if (b.horasSemana > cfg.horasMaxSemanaPadrao) throw httpErr(400, `Jornada acima de ${cfg.horasMaxSemanaPadrao} h semanais (Lei 11.788/2008, art. 10).`, 'JORNADA_EXCEDIDA')
    if (b.tipo === 'NAO_OBRIGATORIO' && !b.pcd && b.fim.getTime() - b.inicio.getTime() > 2 * 365 * DIA) throw httpErr(400, 'Estágio não obrigatório não pode passar de 2 anos com a mesma concedente (art. 11).', 'PRAZO_EXCEDIDO')
    const campo = await exigir(prisma.cprCampoEstagio.findFirst({ where: { id: vaga.campoId, tenantId, ativo: true } }), 'Campo de estágio inativo.', 409)
    const conv = await prisma.cprConvenio.findFirst({ where: { tenantId, concedenteId: campo.concedenteId, status: 'ATIVO', inicio: { lte: b.inicio }, fim: { gte: b.fim } }, orderBy: { fim: 'desc' } })
    if (!conv) throw httpErr(409, 'Não há convênio vigente com a concedente durante todo o período do estágio.', 'SEM_CONVENIO')
    const dup = await prisma.cprEstagio.findFirst({ where: { tenantId, studentId: aluno.id, status: { in: ['AGUARDANDO_DOCUMENTOS', 'EM_ANDAMENTO'] }, inicio: { lt: b.fim }, fim: { gt: b.inicio } } })
    if (dup) throw httpErr(409, 'O aluno já possui estágio no mesmo período.', 'ESTAGIO_SOBREPOSTO')
    const ocup = await prisma.cprEstagio.count({ where: { tenantId, vagaId: vaga.id, status: { in: ['AGUARDANDO_DOCUMENTOS', 'EM_ANDAMENTO'] } } })
    if (ocup >= vaga.quantidade) throw httpErr(409, 'Não há vagas disponíveis nesta oferta.', 'SEM_VAGA')
    const { pcd, ...dados } = b
    void pcd
    const est = await prisma.$transaction(async (tx) => {
      const e = await tx.cprEstagio.create({ data: { ...dados, tenantId, programId: vaga.programId, campoId: campo.id, convenioId: conv.id, supervisorCampoNome: b.supervisorCampoNome ?? campo.supervisorNome ?? undefined, supervisorCampoEmail: b.supervisorCampoEmail ?? campo.supervisorEmail ?? undefined } })
      for (const t of DOCS_PADRAO) await tx.cprEstagioDocumento.create({ data: { tenantId, estagioId: e.id, tipo: t, status: t === 'CONVENIO' ? 'VALIDADO' : 'PENDENTE', numero: t === 'CONVENIO' ? conv.numero : undefined, validade: t === 'CONVENIO' ? conv.fim : undefined, validadoEm: t === 'CONVENIO' ? new Date() : undefined } })
      return e
    })
    await scheduleReminder({ tenantId, modulo: MOD, titulo: 'Entregar termo de compromisso, plano de atividades e seguro', dueAt: b.inicio, antecedenciaDias: 15, refType: 'CprEstagio', refId: est.id, assigneeStudentId: aluno.id, severity: 'ATENCAO', dedupeKey: `cpr:docs:${est.id}` })
    await notify({ tenantId, userId: aluno.userId, assunto: 'Estágio cadastrado', mensagem: `Seu estágio em ${campo.nome} foi cadastrado. Entregue o termo de compromisso, o plano de atividades e a apólice de seguro antes de ${b.inicio.toLocaleDateString('pt-BR')}.`, refType: 'CprEstagio', refId: est.id })
    await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'CRIAR_ESTAGIO', refType: 'CprEstagio', refId: est.id })
    res.status(201).json(est)
  }))

  router.get('/estagios/:id', ler, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const e = await carregar(tenantId, String(req.params.id))
    const papel = papelNoEstagio(req, e)
    const [docs, horas, rels, avs, aluno, orient, curso, campo, resumo] = await Promise.all([
      prisma.cprEstagioDocumento.findMany({ where: { tenantId, estagioId: e.id }, orderBy: { createdAt: 'asc' } }),
      prisma.cprEstagioHora.findMany({ where: { tenantId, estagioId: e.id }, orderBy: { data: 'desc' }, take: 300 }),
      prisma.cprEstagioRelatorio.findMany({ where: { tenantId, estagioId: e.id }, orderBy: { createdAt: 'asc' } }),
      prisma.cprEstagioAvaliacao.findMany({ where: { tenantId, estagioId: e.id } }),
      prisma.student.findFirst({ where: { id: e.studentId, tenantId }, select: { nomeCompleto: true, ra: true } }),
      mapaUsuarios(tenantId, [e.orientadorUserId]), mapaProgramas(tenantId, [e.programId]), prisma.cprCampoEstagio.findFirst({ where: { id: e.campoId, tenantId } }), horasResumo(tenantId, e.id),
    ])
    const concedente = campo ? await prisma.cprConcedente.findFirst({ where: { id: campo.concedenteId, tenantId }, select: { nome: true } }) : null
    const pendencias = docs.filter((d) => d.obrigatorio && d.status !== 'VALIDADO').map((d) => d.tipo)
    res.json({ ...e, papel, aluno, orientador: orient.get(e.orientadorUserId) ?? null, curso: curso.get(e.programId) ?? null, campo: campo?.nome ?? null, concedente: concedente?.nome ?? null, documentos: docs, horas, relatorios: rels, avaliacoes: avs, resumoHoras: resumo, pendencias, progresso: e.cargaHorariaTotal ? Math.min(100, Math.round((resumo.validadas / e.cargaHorariaTotal) * 1000) / 10) : 0 })
  }))

  router.patch('/estagios/:id/plano', ler, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const e = await carregar(tenantId, String(req.params.id))
    papelNoEstagio(req, e)
    if (['ENCERRADO', 'CANCELADO'].includes(e.status)) throw httpErr(409, 'Estágio encerrado.')
    const b = parseBody(z.object({ planoAtividades: z.string().trim().min(20, 'Descreva o plano de atividades (mínimo 20 caracteres).').max(5000) }), req.body)
    const r = await prisma.cprEstagio.update({ where: { id: e.id }, data: { planoAtividades: b.planoAtividades } })
    await prisma.cprEstagioDocumento.updateMany({ where: { estagioId: e.id, tenantId, tipo: 'PLANO_ATIVIDADES', status: { in: ['PENDENTE', 'REJEITADO'] } }, data: { status: 'ENTREGUE', motivo: null } })
    res.json(r)
  }))

  // ---------------------------------------------------------------- documentos (checklist)
  router.put('/estagios/:id/documentos/:tipo', ler, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const e = await carregar(tenantId, String(req.params.id))
    papelNoEstagio(req, e)
    const tipo = String(req.params.tipo).toUpperCase()
    const b = parseBody(z.object({ url: urlOpc, numero: z.string().max(80).optional(), validade: dt.optional(), obrigatorio: z.boolean().optional() }), req.body)
    if (tipo === 'CONVENIO') throw httpErr(409, 'O convênio é conferido automaticamente pela vigência cadastrada.')
    if (tipo === 'SEGURO' && !b.validade) throw httpErr(400, 'Informe a validade da apólice do seguro.')
    if (tipo === 'SEGURO' && b.validade && b.validade < e.fim) throw httpErr(409, 'A apólice não cobre todo o período do estágio (vence antes do fim).', 'SEGURO_NAO_COBRE')
    const doc = await prisma.cprEstagioDocumento.upsert({
      where: { estagioId_tipo: { estagioId: e.id, tipo } },
      create: { tenantId, estagioId: e.id, tipo, obrigatorio: b.obrigatorio ?? false, status: 'ENTREGUE', url: b.url, numero: b.numero, validade: b.validade },
      update: { status: 'ENTREGUE', url: b.url, numero: b.numero, validade: b.validade, motivo: null, validadoEm: null, validadoPorId: null },
    })
    res.json(doc)
  }))

  router.post('/estagios/:id/documentos/:docId/validar', ler, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const e = await carregar(tenantId, String(req.params.id))
    const papel = papelNoEstagio(req, e)
    if (!podeValidar(papel)) throw httpErr(403, 'O próprio aluno não valida os documentos do seu estágio.')
    const b = parseBody(z.object({ aprovar: z.boolean(), motivo: z.string().max(300).optional() }), req.body)
    const doc = await exigir(prisma.cprEstagioDocumento.findFirst({ where: { id: String(req.params.docId), estagioId: e.id, tenantId } }), 'Documento não encontrado.')
    if (doc.status === 'PENDENTE') throw httpErr(409, 'O documento ainda não foi entregue.')
    if (!b.aprovar && !b.motivo) throw httpErr(400, 'Informe o motivo da rejeição.')
    if (b.aprovar && doc.tipo === 'PLANO_ATIVIDADES' && !e.planoAtividades) throw httpErr(409, 'Registre o texto do plano de atividades antes de validar.')
    if (b.aprovar && doc.tipo === 'SEGURO' && (!doc.validade || doc.validade < e.fim)) throw httpErr(409, 'Seguro não cobre todo o período do estágio.', 'SEGURO_NAO_COBRE')
    const r = await prisma.cprEstagioDocumento.update({ where: { id: doc.id }, data: { status: b.aprovar ? 'VALIDADO' : 'REJEITADO', motivo: b.aprovar ? null : b.motivo, validadoPorId: getUserId(req), validadoEm: new Date() } })
    if (b.aprovar && doc.tipo === 'TERMO_COMPROMISSO') await prisma.cprEstagio.update({ where: { id: e.id }, data: { termoAssinadoEm: new Date() } })
    if (b.aprovar && doc.tipo === 'SEGURO') await prisma.cprEstagio.update({ where: { id: e.id }, data: { seguroApolice: doc.numero ?? undefined, seguroValidade: doc.validade ?? undefined } })
    if (b.aprovar && doc.tipo === 'SEGURO' && doc.validade) await scheduleReminder({ tenantId, modulo: MOD, titulo: 'Seguro do estágio próximo do vencimento', dueAt: doc.validade, antecedenciaDias: 30, severity: 'ATENCAO', refType: 'CprEstagio', refId: e.id, assigneeUserId: e.orientadorUserId, assigneeStudentId: e.studentId, dedupeKey: `cpr:seguro:${e.id}`, reabrir: true })
    await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: b.aprovar ? 'VALIDAR_DOC' : 'REJEITAR_DOC', refType: 'CprEstagioDocumento', refId: doc.id, detalhes: { tipo: doc.tipo } })
    res.json(r)
  }))

  router.post('/estagios/:id/ativar', ler, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const e = await carregar(tenantId, String(req.params.id))
    const papel = papelNoEstagio(req, e)
    if (!podeValidar(papel)) throw httpErr(403, 'Somente orientador, secretaria ou coordenação ativam o estágio.')
    if (e.status !== 'AGUARDANDO_DOCUMENTOS') throw httpErr(409, `Estágio está ${e.status}.`)
    const docs = await prisma.cprEstagioDocumento.findMany({ where: { tenantId, estagioId: e.id } })
    const pend = docs.filter((d) => d.obrigatorio && d.status !== 'VALIDADO').map((d) => d.tipo)
    if (pend.length) throw Object.assign(httpErr(409, `Documentos pendentes: ${pend.join(', ')}.`, 'DOCUMENTOS_PENDENTES'), { pendencias: pend })
    const conv = e.convenioId ? await prisma.cprConvenio.findFirst({ where: { id: e.convenioId, tenantId } }) : null
    if (!conv || conv.status !== 'ATIVO' || conv.fim < e.fim) throw httpErr(409, 'Convênio não está mais vigente para todo o período.', 'SEM_CONVENIO')
    const r = await prisma.cprEstagio.update({ where: { id: e.id }, data: { status: 'EM_ANDAMENTO' } })
    await completeReminders({ tenantId, refType: 'CprEstagio', refId: e.id, userId: getUserId(req) })
    await scheduleReminder({ tenantId, modulo: MOD, titulo: 'Estágio termina em breve: conferir horas e relatório final', dueAt: e.fim, antecedenciaDias: 30, severity: 'INFO', refType: 'CprEstagio', refId: e.id, assigneeUserId: e.orientadorUserId, assigneeStudentId: e.studentId, dedupeKey: `cpr:fim:${e.id}` })
    await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'ATIVAR_ESTAGIO', refType: 'CprEstagio', refId: e.id })
    res.json(r)
  }))

  router.post('/estagios/:id/cancelar', escrever, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const e = await carregar(tenantId, String(req.params.id))
    if (['ENCERRADO', 'CANCELADO'].includes(e.status)) throw httpErr(409, 'Estágio já finalizado.')
    const b = parseBody(z.object({ motivo: z.string().trim().min(5).max(300) }), req.body)
    const r = await prisma.cprEstagio.update({ where: { id: e.id }, data: { status: 'CANCELADO', resultado: null } })
    await cancelReminders({ tenantId, refType: 'CprEstagio', refId: e.id })
    await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'CANCELAR_ESTAGIO', refType: 'CprEstagio', refId: e.id, detalhes: b })
    res.json(r)
  }))

  // ---------------------------------------------------------------- horas
  router.get('/estagios/:id/horas', ler, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const e = await carregar(tenantId, String(req.params.id))
    papelNoEstagio(req, e)
    const items = await prisma.cprEstagioHora.findMany({ where: { tenantId, estagioId: e.id }, orderBy: { data: 'desc' }, take: 500 })
    res.json({ items, resumo: await horasResumo(tenantId, e.id), cargaHorariaTotal: e.cargaHorariaTotal })
  }))

  router.post('/estagios/:id/horas', ler, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const e = await carregar(tenantId, String(req.params.id))
    const papel = papelNoEstagio(req, e)
    if (papel === 'SECRETARIA') throw httpErr(403, 'Horas são lançadas pelo aluno ou pelo orientador.')
    if (e.status !== 'EM_ANDAMENTO') throw httpErr(409, 'Só é possível lançar horas em estágio em andamento.', 'ESTAGIO_INATIVO')
    const b = parseBody(z.object({ data: dt, horas: z.number().min(0.5).max(12), atividade: z.string().trim().min(5, 'Descreva a atividade realizada.').max(500) }), req.body)
    const cfg = await getConfig(tenantId)
    const d = new Date(Date.UTC(b.data.getUTCFullYear(), b.data.getUTCMonth(), b.data.getUTCDate()))
    if (d < new Date(Date.UTC(e.inicio.getUTCFullYear(), e.inicio.getUTCMonth(), e.inicio.getUTCDate())) || d > e.fim) throw httpErr(409, 'A data está fora do período do estágio.', 'FORA_DO_PERIODO')
    if (d.getTime() > Date.now() + DIA) throw httpErr(409, 'Não é possível lançar horas em data futura.', 'DATA_FUTURA')
    const ativas = { in: ['PENDENTE', 'VALIDADA'] }
    const doDia = await prisma.cprEstagioHora.aggregate({ where: { tenantId, estagioId: e.id, data: d, status: ativas }, _sum: { horas: true } })
    if ((doDia._sum.horas ?? 0) + b.horas > cfg.horasMaxDia) throw httpErr(409, `Limite de ${cfg.horasMaxDia} h por dia excedido (Lei 11.788/2008).`, 'LIMITE_DIARIO')
    const ini = inicioSemana(d)
    const semana = await prisma.cprEstagioHora.aggregate({ where: { tenantId, estagioId: e.id, data: { gte: ini, lt: new Date(ini.getTime() + 7 * DIA) }, status: ativas }, _sum: { horas: true } })
    const limSem = Math.min(e.horasSemana, cfg.horasMaxSemanaPadrao)
    if ((semana._sum.horas ?? 0) + b.horas > limSem) throw httpErr(409, `Limite semanal de ${limSem} h do termo de compromisso excedido.`, 'LIMITE_SEMANAL')
    const tot = await horasResumo(tenantId, e.id)
    if (tot.validadas + tot.pendentes + b.horas > e.cargaHorariaTotal) throw httpErr(409, 'As horas lançadas ultrapassariam a carga horária total do estágio.', 'HORAS_EXCEDEM')
    const h = await prisma.cprEstagioHora.create({ data: { tenantId, estagioId: e.id, data: d, horas: b.horas, atividade: b.atividade, registradoPorId: getUserId(req), ...(papel === 'ORIENTADOR' || papel === 'GESTAO' ? {} : {}) } })
    res.status(201).json(h)
  }))

  async function validarHora(req: AuthenticatedRequest, hora: any, aprovar: boolean, motivo?: string) {
    const tenantId = getTenantId(req)
    const e = await carregar(tenantId, hora.estagioId)
    const papel = papelNoEstagio(req, e)
    if (!podeValidar(papel) || papel === 'SECRETARIA') throw httpErr(403, 'Somente o professor orientador (ou a coordenação) valida horas.')
    if (hora.status !== 'PENDENTE') throw httpErr(409, 'Este lançamento já foi analisado.')
    if (!aprovar && (!motivo || motivo.trim().length < 5)) throw httpErr(400, 'Informe o motivo da rejeição.')
    return prisma.cprEstagioHora.update({ where: { id: hora.id }, data: { status: aprovar ? 'VALIDADA' : 'REJEITADA', motivo: aprovar ? null : motivo, validadoPorId: getUserId(req), validadoEm: new Date() } })
  }
  router.post('/estagios/horas/:horaId/validar', ler, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(z.object({ aprovar: z.boolean(), motivo: z.string().max(300).optional() }), req.body)
    const h = await exigir(prisma.cprEstagioHora.findFirst({ where: { id: String(req.params.horaId), tenantId } }), 'Lançamento não encontrado.')
    res.json(await validarHora(req, h, b.aprovar, b.motivo))
  }))
  router.post('/estagios/:id/horas/validar-lote', ler, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const e = await carregar(tenantId, String(req.params.id))
    const papel = papelNoEstagio(req, e)
    if (papel !== 'ORIENTADOR' && papel !== 'GESTAO') throw httpErr(403, 'Somente o professor orientador (ou a coordenação) valida horas.')
    const b = parseBody(z.object({ ids: z.array(zId).max(200).optional() }), req.body ?? {})
    const pend = await prisma.cprEstagioHora.findMany({ where: { tenantId, estagioId: e.id, status: 'PENDENTE', ...(b.ids ? { id: { in: b.ids } } : {}) } })
    let n = 0
    for (const h of pend) { await validarHora(req, h, true); n++ }
    res.json({ validadas: n })
  }))

  // ---------------------------------------------------------------- relatórios
  router.post('/estagios/:id/relatorios', ler, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const e = await carregar(tenantId, String(req.params.id))
    const papel = papelNoEstagio(req, e)
    if (papel === 'SECRETARIA') throw httpErr(403, 'Relatórios são escritos pelo aluno.')
    if (e.status !== 'EM_ANDAMENTO') throw httpErr(409, 'Estágio não está em andamento.')
    const b = parseBody(z.object({ tipo: z.enum(['PARCIAL', 'FINAL']), texto: z.string().trim().min(30, 'O relatório precisa ter ao menos 30 caracteres.').max(20000), periodoInicio: dt.optional(), periodoFim: dt.optional(), entregar: z.boolean().default(false) }), req.body)
    if (b.tipo === 'FINAL' && (await prisma.cprEstagioRelatorio.count({ where: { tenantId, estagioId: e.id, tipo: 'FINAL', status: { in: ['ENTREGUE', 'APROVADO', 'RASCUNHO'] } } })) > 0) throw httpErr(409, 'Já existe relatório final em andamento.')
    const { entregar, ...dados } = b
    const r = await prisma.cprEstagioRelatorio.create({ data: { ...dados, tenantId, estagioId: e.id } })
    res.status(201).json(entregar ? await entregarRelatorio(tenantId, r.id, e) : r)
  }))

  async function entregarRelatorio(tenantId: string, id: string, e: any) {
    const r = await exigir(prisma.cprEstagioRelatorio.findFirst({ where: { id, tenantId } }), 'Relatório não encontrado.')
    if (!['RASCUNHO', 'DEVOLVIDO'].includes(r.status)) throw httpErr(409, 'Relatório já entregue.')
    if (r.tipo === 'FINAL') {
      const h = await horasResumo(tenantId, e.id)
      if (h.validadas < e.cargaHorariaTotal * 0.9) throw httpErr(409, 'O relatório final só pode ser entregue com ao menos 90% das horas validadas.', 'HORAS_INSUFICIENTES')
    }
    const out = await prisma.cprEstagioRelatorio.update({ where: { id }, data: { status: 'ENTREGUE', entregueEm: new Date(), parecer: null } })
    await notify({ tenantId, userId: e.orientadorUserId, assunto: 'Relatório de estágio entregue', mensagem: `Relatório ${r.tipo === 'FINAL' ? 'final' : 'parcial'} aguardando sua avaliação.`, refType: 'CprEstagioRelatorio', refId: id })
    return out
  }
  router.put('/estagios/relatorios/:rid', ler, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const r = await exigir(prisma.cprEstagioRelatorio.findFirst({ where: { id: String(req.params.rid), tenantId } }), 'Relatório não encontrado.')
    const e = await carregar(tenantId, r.estagioId)
    if (papelNoEstagio(req, e) !== 'ALUNO') throw httpErr(403, 'Somente o aluno edita o relatório.')
    if (!['RASCUNHO', 'DEVOLVIDO'].includes(r.status)) throw httpErr(409, 'Relatório não pode mais ser editado.')
    const b = parseBody(z.object({ texto: z.string().trim().min(30).max(20000) }), req.body)
    res.json(await prisma.cprEstagioRelatorio.update({ where: { id: r.id }, data: { texto: b.texto } }))
  }))
  router.post('/estagios/relatorios/:rid/entregar', ler, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const r = await exigir(prisma.cprEstagioRelatorio.findFirst({ where: { id: String(req.params.rid), tenantId } }), 'Relatório não encontrado.')
    const e = await carregar(tenantId, r.estagioId)
    if (papelNoEstagio(req, e) !== 'ALUNO') throw httpErr(403, 'Somente o aluno entrega o relatório.')
    res.json(await entregarRelatorio(tenantId, r.id, e))
  }))
  router.post('/estagios/relatorios/:rid/avaliar', ler, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const r = await exigir(prisma.cprEstagioRelatorio.findFirst({ where: { id: String(req.params.rid), tenantId } }), 'Relatório não encontrado.')
    const e = await carregar(tenantId, r.estagioId)
    const papel = papelNoEstagio(req, e)
    if (papel !== 'ORIENTADOR' && papel !== 'GESTAO') throw httpErr(403, 'Somente o orientador avalia o relatório.')
    if (r.status !== 'ENTREGUE') throw httpErr(409, 'O relatório não está aguardando avaliação.')
    const b = parseBody(z.object({ aprovar: z.boolean(), parecer: z.string().max(1000).optional() }), req.body)
    if (!b.aprovar && !b.parecer?.trim()) throw httpErr(400, 'Explique o que precisa ser ajustado.')
    const out = await prisma.cprEstagioRelatorio.update({ where: { id: r.id }, data: { status: b.aprovar ? 'APROVADO' : 'DEVOLVIDO', parecer: b.parecer, avaliadoPorId: getUserId(req), avaliadoEm: new Date() } })
    const al = await prisma.student.findFirst({ where: { id: e.studentId, tenantId }, select: { userId: true } })
    await notify({ tenantId, userId: al?.userId, assunto: b.aprovar ? 'Relatório aprovado' : 'Relatório devolvido para ajustes', mensagem: b.parecer ?? 'Relatório avaliado pelo orientador.', refType: 'CprEstagioRelatorio', refId: r.id })
    res.json(out)
  }))

  // ---------------------------------------------------------------- avaliações e encerramento
  router.post('/estagios/:id/avaliacoes', ler, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const e = await carregar(tenantId, String(req.params.id))
    const papel = papelNoEstagio(req, e)
    const b = parseBody(z.object({ avaliador: z.enum(['ORIENTADOR', 'SUPERVISOR_CAMPO', 'AUTOAVALIACAO']), criterios: z.record(z.string().min(2).max(60), z.number().min(0).max(10)).refine((c) => Object.keys(c).length >= 3, 'Informe ao menos 3 critérios (0 a 10).'), parecer: z.string().max(1500).optional() }), req.body)
    if (b.avaliador === 'AUTOAVALIACAO' ? papel !== 'ALUNO' : papel !== 'ORIENTADOR' && papel !== 'GESTAO') throw httpErr(403, b.avaliador === 'AUTOAVALIACAO' ? 'A autoavaliação é feita pelo aluno.' : 'Avaliação feita pelo orientador (registra também a do supervisor de campo).')
    if (!['EM_ANDAMENTO', 'ENCERRADO'].includes(e.status)) throw httpErr(409, 'Estágio não iniciado.')
    if (e.status === 'ENCERRADO') throw httpErr(409, 'Estágio já encerrado.')
    const vals = Object.values(b.criterios)
    const nota = Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 100) / 100
    const r = await prisma.cprEstagioAvaliacao.upsert({ where: { estagioId_avaliador: { estagioId: e.id, avaliador: b.avaliador } }, create: { tenantId, estagioId: e.id, avaliador: b.avaliador, criterios: b.criterios, nota, parecer: b.parecer, registradoPorId: getUserId(req) }, update: { criterios: b.criterios, nota, parecer: b.parecer, registradoPorId: getUserId(req) } })
    res.status(201).json(r)
  }))

  router.post('/estagios/:id/encerrar', ler, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const e = await carregar(tenantId, String(req.params.id))
    const papel = papelNoEstagio(req, e)
    if (papel !== 'ORIENTADOR' && papel !== 'GESTAO') throw httpErr(403, 'Somente o orientador ou a coordenação encerram o estágio.')
    if (e.status !== 'EM_ANDAMENTO') throw httpErr(409, 'Estágio não está em andamento.')
    const cfg = await getConfig(tenantId)
    const h = await horasResumo(tenantId, e.id)
    const faltas: string[] = []
    if (h.pendentes > 0) faltas.push(`${h.pendentes} h ainda aguardam validação`)
    if (h.validadas < e.cargaHorariaTotal) faltas.push(`faltam ${e.cargaHorariaTotal - h.validadas} h validadas (${h.validadas}/${e.cargaHorariaTotal})`)
    const fin = await prisma.cprEstagioRelatorio.findFirst({ where: { tenantId, estagioId: e.id, tipo: 'FINAL', status: 'APROVADO' } })
    if (!fin) faltas.push('relatório final aprovado')
    const avs = await prisma.cprEstagioAvaliacao.findMany({ where: { tenantId, estagioId: e.id } })
    const ori = avs.find((a) => a.avaliador === 'ORIENTADOR'), sup = avs.find((a) => a.avaliador === 'SUPERVISOR_CAMPO')
    if (!ori) faltas.push('avaliação do orientador')
    if (!sup) faltas.push('avaliação do supervisor de campo')
    if (faltas.length) throw Object.assign(httpErr(409, `Não é possível encerrar: ${faltas.join('; ')}.`, 'PENDENCIAS_ENCERRAMENTO'), { pendencias: faltas })
    const nota = Math.round(((ori!.nota + sup!.nota) / 2) * 100) / 100
    const r = await prisma.cprEstagio.update({ where: { id: e.id }, data: { status: 'ENCERRADO', notaFinal: nota, resultado: nota >= cfg.notaMinimaEstagio ? 'APROVADO' : 'REPROVADO', encerradoEm: new Date() } })
    await cancelReminders({ tenantId, refType: 'CprEstagio', refId: e.id })
    const al = await prisma.student.findFirst({ where: { id: e.studentId, tenantId }, select: { userId: true } })
    await notify({ tenantId, userId: al?.userId, assunto: 'Estágio encerrado', mensagem: `Seu estágio foi encerrado com nota ${nota.toFixed(1)} (${r.resultado === 'APROVADO' ? 'aprovado' : 'reprovado'}).`, refType: 'CprEstagio', refId: e.id })
    await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'ENCERRAR_ESTAGIO', refType: 'CprEstagio', refId: e.id, detalhes: { nota } })
    res.json(r)
  }))

  void GESTAO; void dia; void ehRecepcao
}
