import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { mountCrud, pageParams, parseBody, qs } from '../core/crud'
import { audit } from '../core/notify'
import { HHMM, MIN, STATUS_FREQUENCIA, TIPOS_MARCACAO, calcularFrequencia, combinarHora, dentroDaJanela, diaLocal, presencaComputada, proximoTipo, RegrasChamada, pessoaKey, parsePessoaKey } from './logic'
import { GESTAO, MOD, OPERADORES, alertar, ehSuper, getConfig, httpErr, infoPessoas, resolverPessoaPorMetodo } from './servico'

const PODE_CORRIGIR = ['TEACHER', 'COORDINATOR', 'SECRETARY']

async function exigirTurma(req: AuthenticatedRequest, classSectionId: string, _escrita = true) {
  const tenantId = getTenantId(req)
  const sec = await prisma.classSection.findFirst({ where: { id: classSectionId, tenantId } })
  if (!sec) throw httpErr(404, 'Turma não encontrada.')
  if (req.user!.role === 'TEACHER' && sec.professorUserId !== req.user!.id) throw httpErr(403, 'Você não leciona esta turma.')
  return sec
}

async function carregarChamada(req: AuthenticatedRequest, id: string) {
  const ch = await prisma.preChamada.findFirst({ where: { id, tenantId: getTenantId(req) } })
  if (!ch) throw httpErr(404, 'Chamada não encontrada.')
  return ch
}

const regrasDe = (ch: any, cfgIntervalo = 5): RegrasChamada => ({
  inicio: ch.inicioEsperado, fim: ch.fimEsperado, intervaloInicio: ch.intervaloInicio, intervaloFim: ch.intervaloFim,
  toleranciaAtrasoMin: ch.toleranciaAtrasoMin, limiteFaltaMin: ch.limiteFaltaMin, toleranciaSaidaMin: ch.toleranciaSaidaMin, toleranciaIntervaloMin: cfgIntervalo,
})

async function matriculados(classSectionId: string) {
  const rows = await prisma.classSectionEnrollment.findMany({
    where: { classSectionId, enrollment: { status: 'ATIVA', student: { status: 'ATIVO' } } },
    select: { enrollment: { select: { student: { select: { id: true, nomeCompleto: true, ra: true } } } } },
  })
  const m = new Map<string, { id: string; nomeCompleto: string; ra: string }>()
  for (const r of rows) m.set(r.enrollment.student.id, r.enrollment.student)
  return [...m.values()].sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto, 'pt-BR'))
}

/** Recalcula e grava a frequência de um aluno a partir das marcações (não sobrescreve correção manual). */
export async function recalcular(tenantId: string, ch: any, studentId: string, encerrada: boolean, cfgIntervalo = 5) {
  const atual = await prisma.preFrequencia.findUnique({ where: { chamadaId_studentId: { chamadaId: ch.id, studentId } } })
  if (atual?.origem === 'MANUAL') return atual
  const marcs = await prisma.preMarcacao.findMany({ where: { tenantId, chamadaId: ch.id, studentId }, select: { tipo: true, em: true } })
  const r = calcularFrequencia(regrasDe(ch, cfgIntervalo), marcs, encerrada)
  const data = { status: r.status, entradaEm: r.entradaEm, saidaEm: r.saidaEm, minutosAtraso: r.minutosAtraso, minutosSaidaAntecipada: r.minutosSaidaAntecipada, minutosForaIntervalo: r.minutosForaIntervalo, intervaloExcedido: r.intervaloExcedido }
  return prisma.preFrequencia.upsert({
    where: { chamadaId_studentId: { chamadaId: ch.id, studentId } },
    create: { tenantId, chamadaId: ch.id, classSessionId: ch.classSessionId, studentId, ...data },
    update: data,
  })
}

export interface MarcarIn {
  tenantId: string; chamada: any; studentId: string; modo: string; tipo?: string; metodo: string; dispositivoId?: string | null
  distancia?: number; operadorId?: string; justificativa?: string; em?: Date
}

export async function registrarMarcacao(p: MarcarIn) {
  const { tenantId, chamada: ch } = p
  if (ch.status !== 'ABERTA') throw httpErr(409, 'Chamada encerrada: reabra para registrar novas marcações.')
  const cfg = await getConfig(tenantId)
  const vinculo = await prisma.classSectionEnrollment.findFirst({ where: { classSectionId: ch.classSectionId, enrollment: { studentId: p.studentId, status: 'ATIVA' } }, select: { id: true } })
  if (!vinculo) throw httpErr(409, 'Aluno não matriculado nesta turma.', 'NAO_MATRICULADO')
  const agora = p.em ?? new Date()
  if (p.metodo !== 'MANUAL' && !dentroDaJanela(agora, { inicio: ch.inicioEsperado, fim: ch.fimEsperado }, cfg.antecedenciaMin)) throw httpErr(409, 'Fora da janela desta aula: a marcação automática só vale de antes do início até 30 min após o fim.', 'FORA_DA_JANELA')
  const existentes = await prisma.preMarcacao.findMany({ where: { tenantId, chamadaId: ch.id, studentId: p.studentId }, orderBy: { em: 'asc' }, select: { tipo: true, em: true } })
  const ultima = existentes[existentes.length - 1]
  const aluno = (await infoPessoas(tenantId, [pessoaKey('ALUNO', p.studentId)])).get(pessoaKey('ALUNO', p.studentId))
  if (ultima && p.metodo !== 'MANUAL' && agora.getTime() - ultima.em.getTime() < cfg.debounceSegundos * 1000 && agora >= ultima.em) {
    const f = await prisma.preFrequencia.findUnique({ where: { chamadaId_studentId: { chamadaId: ch.id, studentId: p.studentId } } })
    return { duplicado: true, tipo: ultima.tipo, aluno, frequencia: f }
  }
  if (p.metodo === 'MANUAL' && (p.justificativa ?? '').trim().length < 5) throw httpErr(400, 'Marcação manual exige justificativa (mín. 5 caracteres).')
  const tipo = (p.tipo && p.tipo !== 'AUTO' ? p.tipo : proximoTipo(p.modo, existentes, agora, regrasDe(ch))) as string
  if (!(TIPOS_MARCACAO as readonly string[]).includes(tipo)) throw httpErr(400, 'Tipo de marcação inválido.')
  const temEntrada = existentes.some((m) => m.tipo === 'ENTRADA')
  if (tipo === 'ENTRADA' && temEntrada && ultima?.tipo !== 'SAIDA') throw httpErr(409, 'Entrada já registrada para este aluno.', 'ENTRADA_DUPLICADA')
  if (tipo !== 'ENTRADA' && !temEntrada) throw httpErr(409, 'Registre a entrada antes de intervalo/saída.', 'SEM_ENTRADA')
  if (tipo === 'INTERVALO_VOLTA' && ultima?.tipo !== 'INTERVALO_SAIDA') throw httpErr(409, 'Não há saída para intervalo em aberto.')
  if (tipo === 'INTERVALO_SAIDA' && ultima?.tipo === 'INTERVALO_SAIDA') throw httpErr(409, 'Intervalo já iniciado.')
  const m = await prisma.preMarcacao.create({
    data: { tenantId, chamadaId: ch.id, studentId: p.studentId, tipo, em: agora, metodo: p.metodo, dispositivoId: p.dispositivoId ?? undefined, distancia: p.distancia, operadorId: p.operadorId, justificativa: p.justificativa?.trim() || undefined },
  })
  if (p.metodo === 'MANUAL') await audit({ tenantId, userId: p.operadorId, modulo: MOD, acao: 'MARCACAO_MANUAL', refType: 'PreChamada', refId: ch.id, detalhes: { studentId: p.studentId, tipo, justificativa: p.justificativa } })
  const f = await recalcular(tenantId, ch, p.studentId, false, cfg.toleranciaIntervaloMin)
  return { duplicado: false, marcacao: m, tipo, aluno, frequencia: f }
}

/** Aplica o resultado de um aluno no diário (Attendance). */
async function gravarDiario(tenantId: string, ch: any, f: { studentId: string; status: string; justificativa?: string | null; minutosAtraso: number; minutosSaidaAntecipada: number }) {
  const presente = presencaComputada(f.status)
  const rotulo = f.justificativa || `Presença por chamada (${f.status}${f.minutosAtraso ? `, atraso ${f.minutosAtraso} min` : ''}${f.minutosSaidaAntecipada ? `, saída antecipada ${f.minutosSaidaAntecipada} min` : ''})`
  await prisma.attendance.upsert({
    where: { classSessionId_studentId: { classSessionId: ch.classSessionId, studentId: f.studentId } },
    create: { classSessionId: ch.classSessionId, studentId: f.studentId, presente, justificativa: rotulo },
    update: { presente, justificativa: rotulo },
  })
  await prisma.classSessionBooking.updateMany({ where: { classSessionId: ch.classSessionId, studentId: f.studentId }, data: { status: presente ? 'PRESENTE' : 'FALTOU' } })
}

export async function fecharChamada(tenantId: string, ch: any, userId?: string) {
  const cfg = await getConfig(tenantId)
  const alunos = await matriculados(ch.classSectionId)
  for (const a of alunos) await recalcular(tenantId, ch, a.id, true, cfg.toleranciaIntervaloMin)
  // quem tinha frequência marcada manualmente e já saiu da lista (ex.: trancou) permanece
  const upd = await prisma.preChamada.update({ where: { id: ch.id }, data: { status: 'FECHADA', fechadaEm: new Date(), fechadaPorId: userId } })
  await audit({ tenantId, userId, modulo: MOD, acao: 'FECHAR_CHAMADA', refType: 'PreChamada', refId: ch.id, detalhes: { alunos: alunos.length } })
  return upd
}

export async function conciliarChamada(tenantId: string, ch: any, opts: { sobrescrever?: boolean; userId?: string } = {}) {
  const freqs = await prisma.preFrequencia.findMany({ where: { tenantId, chamadaId: ch.id } })
  const diario = await prisma.attendance.findMany({ where: { classSessionId: ch.classSessionId }, select: { studentId: true, presente: true } })
  const dMap = new Map(diario.map((d) => [d.studentId, d.presente]))
  let gravados = 0, divergentes = 0, iguais = 0
  for (const f of freqs) {
    const presente = presencaComputada(f.status)
    const previo = dMap.get(f.studentId)
    const difere = previo !== undefined && previo !== presente && f.origem !== 'MANUAL'
    if (difere && !opts.sobrescrever) {
      divergentes++
      await prisma.preFrequencia.update({ where: { id: f.id }, data: { divergente: true, diarioPresente: previo } })
      continue
    }
    if (previo === presente) iguais++
    await gravarDiario(tenantId, ch, f)
    gravados++
    await prisma.preFrequencia.update({ where: { id: f.id }, data: { divergente: false, diarioPresente: previo ?? null, conciliadoEm: new Date() } })
  }
  const upd = await prisma.preChamada.update({ where: { id: ch.id }, data: { status: 'CONCILIADA', conciliadaEm: new Date() } })
  if (divergentes) await alertar({ tenantId, tipo: 'DIVERGENCIA', severidade: 'ATENCAO', mensagem: `${divergentes} divergência(s) entre a chamada facial/QR e o diário do professor na aula ${ch.classSessionId}.`, dedupeKey: `div:${ch.id}`, dedupeMin: 1440 })
  await audit({ tenantId, userId: opts.userId, modulo: MOD, acao: 'CONCILIAR_CHAMADA', refType: 'PreChamada', refId: ch.id, detalhes: { gravados, divergentes, iguais, sobrescrever: !!opts.sobrescrever } })
  return { chamada: upd, gravados, divergentes, iguais }
}

const nomesPessoa = async (tenantId: string, ids: string[]) => {
  const rows = await prisma.student.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, nomeCompleto: true, ra: true } })
  return new Map(rows.map((r) => [r.id, r]))
}

export function mountChamada(router: Router) {
  const operador = requireRole(...OPERADORES)
  const gestao = requireRole(...GESTAO)

  // ---- configuração de regras
  router.get('/config', operador, asyncHandler(async (req: AuthenticatedRequest, res: Response) => { res.json(await getConfig(getTenantId(req))) }))
  router.put('/config', gestao, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(z.object({
      toleranciaAtrasoMin: z.coerce.number().int().min(0).max(120), limiteFaltaMin: z.coerce.number().int().min(1).max(240), antecedenciaMin: z.coerce.number().int().min(0).max(180),
      toleranciaSaidaMin: z.coerce.number().int().min(0).max(120), toleranciaIntervaloMin: z.coerce.number().int().min(0).max(60), debounceSegundos: z.coerce.number().int().min(5).max(900),
      limiarDistancia: z.coerce.number().min(0.2).max(0.7), margemAmbiguidade: z.coerce.number().min(0).max(0.2), livenessObrigatorio: z.boolean(),
      maxTentativas: z.coerce.number().int().min(2).max(20), janelaTentativasMin: z.coerce.number().int().min(1).max(60), bloqueioMin: z.coerce.number().int().min(1).max(240),
      retencaoLogDias: z.coerce.number().int().min(30).max(730), retencaoTemplateDias: z.coerce.number().int().min(30).max(1825),
      emprestimoMaxSimultaneos: z.coerce.number().int().min(1).max(20), multaDiaItem: z.coerce.number().min(0).max(500), multaMaximaItem: z.coerce.number().min(0).max(5000), bloqueioAposAtrasoDias: z.coerce.number().int().min(1).max(90),
    }).partial(), req.body)
    await getConfig(tenantId)
    const row = await prisma.preConfig.update({ where: { tenantId }, data: b })
    await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'CONFIG', refType: 'PreConfig', refId: row.id, detalhes: b })
    res.json(row)
  }))

  // ---- dispositivos (quiosques)
  mountCrud(router, {
    model: 'preDispositivo', path: '/dispositivos', read: OPERADORES, write: GESTAO, modulo: MOD, removeMode: 'soft', search: ['nome'], filters: ['finalidade', 'ativo', 'spaceId'], orderBy: { nome: 'asc' },
    create: z.object({ nome: z.string().trim().min(2).max(80), finalidade: z.enum(['CHAMADA', 'PORTARIA', 'BIBLIOTECA', 'LABORATORIO', 'AUDIOVISUAL']).default('CHAMADA'), spaceId: z.string().max(60).optional().nullable(), modo: z.enum(['AUTO', 'ENTRADA', 'SAIDA', 'INTERVALO']).default('AUTO'), ativo: z.boolean().optional() }),
    beforeCreate: async (d, req) => { if (d.spaceId) await espacoDoTenant(getTenantId(req), d.spaceId); return d },
    beforeUpdate: async (d, req) => { if (d.spaceId) await espacoDoTenant(getTenantId(req), d.spaceId); return d },
  })
  router.post('/dispositivos/:id/desbloquear', gestao, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const r = await prisma.preDispositivo.updateMany({ where: { id: String(req.params.id), tenantId }, data: { bloqueadoAte: null } })
    if (!r.count) throw httpErr(404, 'Dispositivo não encontrado.')
    // zera a contagem de falhas recentes registrando um OK administrativo
    await prisma.preLogBiometrico.create({ data: { tenantId, acao: 'COMPARACAO', resultado: 'OK', dispositivoId: String(req.params.id), finalidade: 'ADMIN', userId: getUserId(req) } })
    await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'DESBLOQUEAR_DISPOSITIVO', refType: 'PreDispositivo', refId: String(req.params.id) })
    res.json({ ok: true })
  }))

  // ---- horários programados por turma/sala
  const horaOpt = z.string().regex(HHMM, 'Use HH:mm').optional().nullable()
  mountCrud(router, {
    model: 'preHorario', path: '/horarios', read: OPERADORES, write: GESTAO, modulo: MOD, removeMode: 'soft', filters: ['classSectionId', 'spaceId', 'diaSemana', 'ativo'], orderBy: [{ diaSemana: 'asc' }, { horaEntrada: 'asc' }],
    create: z.object({
      classSectionId: z.string().min(8).max(60), spaceId: z.string().max(60).optional().nullable(), diaSemana: z.coerce.number().int().min(0).max(6),
      horaEntrada: z.string().regex(HHMM, 'Use HH:mm'), inicioIntervalo: horaOpt, fimIntervalo: horaOpt, horaSaida: z.string().regex(HHMM, 'Use HH:mm'),
      toleranciaAtrasoMin: z.coerce.number().int().min(0).max(120).optional().nullable(), toleranciaSaidaMin: z.coerce.number().int().min(0).max(120).optional().nullable(), ativo: z.boolean().optional(),
    }).refine((h) => h.horaEntrada < h.horaSaida, { message: 'horaSaida deve ser depois de horaEntrada' })
      .refine((h) => (!h.inicioIntervalo && !h.fimIntervalo) || (!!h.inicioIntervalo && !!h.fimIntervalo && h.inicioIntervalo < h.fimIntervalo && h.inicioIntervalo > h.horaEntrada && h.fimIntervalo < h.horaSaida), { message: 'Intervalo inválido: informe início e fim dentro do horário da aula' }),
    beforeCreate: async (d, req) => { await exigirTurma(req, d.classSectionId); if (d.spaceId) await espacoDoTenant(getTenantId(req), d.spaceId); return d },
  })

  // ---- agenda do dia
  router.get('/chamadas/agenda', operador, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const ref = qs(req.query.data) ? new Date(String(qs(req.query.data))) : new Date()
    if (isNaN(ref.getTime())) throw httpErr(400, 'Data inválida.')
    const { ymd } = diaLocal(ref)
    const ini = new Date(`${ymd}T00:00:00-03:00`), fim = new Date(ini.getTime() + 86_400_000)
    const where: any = { dataHoraInicio: { gte: ini, lt: fim }, classSection: { tenantId, ...(req.user!.role === 'TEACHER' ? { professorUserId: req.user!.id } : {}) } }
    const sessoes = await prisma.classSession.findMany({ where, orderBy: { dataHoraInicio: 'asc' }, include: { classSection: { select: { id: true, nome: true, discipline: { select: { nome: true } } } } } })
    const chamadas = await prisma.preChamada.findMany({ where: { tenantId, classSessionId: { in: sessoes.map((s) => s.id) } } })
    const cMap = new Map(chamadas.map((c) => [c.classSessionId, c]))
    res.json({ data: ymd, items: sessoes.map((s) => ({ classSessionId: s.id, titulo: s.titulo, tipo: s.tipo, status: s.status, local: s.local, inicio: s.dataHoraInicio, fim: s.dataHoraFim, turma: s.classSection.nome, classSectionId: s.classSection.id, disciplina: s.classSection.discipline.nome, chamada: cMap.get(s.id) ? { id: cMap.get(s.id)!.id, status: cMap.get(s.id)!.status } : null })) })
  }))

  // ---- abrir chamada
  router.post('/chamadas/abrir', operador, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(z.object({ classSessionId: z.string().min(8).max(60), dispositivoId: z.string().max(60).optional() }), req.body)
    const s = await prisma.classSession.findFirst({ where: { id: b.classSessionId, classSection: { tenantId } }, include: { classSection: true } })
    if (!s) throw httpErr(404, 'Aula não encontrada.')
    await exigirTurma(req, s.classSectionId)
    if (s.status === 'CANCELADA') throw httpErr(409, 'Aula cancelada: não é possível abrir chamada.')
    if (b.dispositivoId) { const d = await prisma.preDispositivo.findFirst({ where: { id: b.dispositivoId, tenantId, ativo: true } }); if (!d) throw httpErr(404, 'Dispositivo não encontrado.') }
    const existente = await prisma.preChamada.findUnique({ where: { tenantId_classSessionId: { tenantId, classSessionId: s.id } } })
    if (existente) return res.json({ ...existente, jaExistia: true })
    const cfg = await getConfig(tenantId)
    const h = await prisma.preHorario.findFirst({ where: { tenantId, classSectionId: s.classSectionId, diaSemana: diaLocal(s.dataHoraInicio).diaSemana, ativo: true } })
    const ch = await prisma.preChamada.create({
      data: {
        tenantId, classSessionId: s.id, classSectionId: s.classSectionId, horarioId: h?.id, dispositivoId: b.dispositivoId, abertaPorId: getUserId(req),
        inicioEsperado: h ? combinarHora(s.dataHoraInicio, h.horaEntrada) : s.dataHoraInicio,
        fimEsperado: h ? combinarHora(s.dataHoraInicio, h.horaSaida) : s.dataHoraFim,
        intervaloInicio: h?.inicioIntervalo ? combinarHora(s.dataHoraInicio, h.inicioIntervalo) : null,
        intervaloFim: h?.fimIntervalo ? combinarHora(s.dataHoraInicio, h.fimIntervalo) : null,
        toleranciaAtrasoMin: h?.toleranciaAtrasoMin ?? cfg.toleranciaAtrasoMin, limiteFaltaMin: cfg.limiteFaltaMin, toleranciaSaidaMin: h?.toleranciaSaidaMin ?? cfg.toleranciaSaidaMin,
      },
    })
    await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'ABRIR_CHAMADA', refType: 'PreChamada', refId: ch.id })
    res.status(201).json({ ...ch, jaExistia: false })
  }))

  // ---- detalhe (lista de chamada ao vivo)
  router.get('/chamadas/:id', operador, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const ch = await carregarChamada(req, String(req.params.id))
    await exigirTurma(req, ch.classSectionId, false)
    const [alunos, freqs, marcs, sec, sessao] = await Promise.all([
      matriculados(ch.classSectionId),
      prisma.preFrequencia.findMany({ where: { tenantId, chamadaId: ch.id } }),
      prisma.preMarcacao.findMany({ where: { tenantId, chamadaId: ch.id }, orderBy: { em: 'asc' } }),
      prisma.classSection.findUnique({ where: { id: ch.classSectionId }, select: { nome: true, discipline: { select: { nome: true } } } }),
      prisma.classSession.findUnique({ where: { id: ch.classSessionId }, select: { titulo: true, local: true } }),
    ])
    const fMap = new Map(freqs.map((f) => [f.studentId, f]))
    const mMap = new Map<string, typeof marcs>()
    for (const m of marcs) mMap.set(m.studentId, [...(mMap.get(m.studentId) ?? []), m])
    const roster = alunos.map((a) => {
      const f = fMap.get(a.id), ms = mMap.get(a.id) ?? []
      return { studentId: a.id, nome: a.nomeCompleto, ra: a.ra, status: f?.status ?? (ms.length ? 'PRESENTE' : 'PENDENTE'), origem: f?.origem ?? null, entradaEm: f?.entradaEm ?? ms.find((m) => m.tipo === 'ENTRADA')?.em ?? null, saidaEm: f?.saidaEm ?? null, minutosAtraso: f?.minutosAtraso ?? 0, minutosSaidaAntecipada: f?.minutosSaidaAntecipada ?? 0, intervaloExcedido: f?.intervaloExcedido ?? false, divergente: f?.divergente ?? false, frequenciaId: f?.id ?? null, ultimaMarcacao: ms[ms.length - 1] ? { tipo: ms[ms.length - 1].tipo, em: ms[ms.length - 1].em, metodo: ms[ms.length - 1].metodo } : null }
    })
    const cont = (s: string) => roster.filter((r) => r.status === s).length
    res.json({
      chamada: ch, turma: sec?.nome, disciplina: sec?.discipline.nome, aula: sessao, roster,
      resumo: { total: roster.length, presentes: cont('PRESENTE'), atrasos: cont('ATRASO') + cont('ATRASO_SAIDA_ANTECIPADA'), saidasAntecipadas: cont('SAIDA_ANTECIPADA') + cont('ATRASO_SAIDA_ANTECIPADA'), faltas: cont('FALTA'), justificadas: cont('JUSTIFICADA'), pendentes: cont('PENDENTE'), divergentes: roster.filter((r) => r.divergente).length },
    })
  }))

  // ---- reconhecimento facial (embedding calculado no dispositivo)
  router.post('/chamadas/:id/reconhecer', operador, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(z.object({ embedding: z.array(z.number()).length(128), liveness: z.object({ nonce: z.string().max(80) }).passthrough().optional(), tipo: z.string().max(20).optional(), dispositivoId: z.string().max(60).optional() }), req.body)
    const ch = await carregarChamada(req, String(req.params.id))
    await exigirTurma(req, ch.classSectionId)
    const dispositivoId = b.dispositivoId ?? ch.dispositivoId ?? undefined
    const disp = dispositivoId ? await prisma.preDispositivo.findFirst({ where: { id: dispositivoId, tenantId, ativo: true } }) : null
    if (dispositivoId && !disp) throw httpErr(404, 'Dispositivo não encontrado.')
    const { pessoa, distancia } = await resolverPessoaPorMetodo({ tenantId, metodo: 'FACIAL', embedding: b.embedding, liveness: b.liveness, dispositivoId, operadorId: getUserId(req), finalidade: 'PRESENCA' })
    if (!pessoa.studentId) throw httpErr(409, 'A pessoa reconhecida não é aluno desta turma.', 'NAO_MATRICULADO')
    const r = await registrarMarcacao({ tenantId, chamada: ch, studentId: pessoa.studentId, modo: disp?.modo ?? 'AUTO', tipo: b.tipo, metodo: 'FACIAL', dispositivoId, distancia, operadorId: getUserId(req) })
    res.status(r.duplicado ? 200 : 201).json(r)
  }))

  // ---- alternativas sem biometria: QR, código e manual
  router.post('/chamadas/:id/marcar', operador, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(z.object({
      metodo: z.enum(['QR', 'CODIGO', 'MANUAL']), credencial: z.string().max(120).optional(), studentId: z.string().max(60).optional(), tipo: z.string().max(20).optional(),
      justificativa: z.string().max(500).optional(), dispositivoId: z.string().max(60).optional(), em: z.coerce.date().optional(),
    }), req.body)
    const ch = await carregarChamada(req, String(req.params.id))
    await exigirTurma(req, ch.classSectionId)
    if (b.metodo === 'MANUAL' && !PODE_CORRIGIR.concat(['STAFF']).includes(req.user!.role) && !ehSuper(req.user!.role)) throw httpErr(403, 'Sem permissão para marcação manual.')
    const dispositivoId = b.dispositivoId ?? ch.dispositivoId ?? undefined
    const disp = dispositivoId ? await prisma.preDispositivo.findFirst({ where: { id: dispositivoId, tenantId } }) : null
    const { pessoa } = await resolverPessoaPorMetodo({ tenantId, metodo: b.metodo, credencial: b.credencial, pessoaKey: b.studentId ? pessoaKey('ALUNO', b.studentId) : undefined, dispositivoId, operadorId: getUserId(req), finalidade: 'PRESENCA' })
    if (!pessoa.studentId) throw httpErr(409, 'A pessoa informada não é aluno.', 'NAO_MATRICULADO')
    // horário informado só vale na marcação manual (correção retroativa dentro da aula)
    const r = await registrarMarcacao({ tenantId, chamada: ch, studentId: pessoa.studentId, modo: disp?.modo ?? 'AUTO', tipo: b.tipo, metodo: b.metodo, dispositivoId, operadorId: getUserId(req), justificativa: b.justificativa, em: b.metodo === 'MANUAL' ? b.em : undefined })
    res.status(r.duplicado ? 200 : 201).json(r)
  }))

  router.post('/chamadas/:id/fechar', operador, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const ch = await carregarChamada(req, String(req.params.id))
    await exigirTurma(req, ch.classSectionId)
    if (ch.status !== 'ABERTA') throw httpErr(409, 'Chamada já encerrada.')
    const fechada = await fecharChamada(tenantId, ch, getUserId(req))
    const autoConciliar = req.body?.conciliar !== false
    const conc = autoConciliar ? await conciliarChamada(tenantId, fechada, { userId: getUserId(req) }) : null
    res.json({ chamada: conc?.chamada ?? fechada, conciliacao: conc })
  }))
  router.post('/chamadas/:id/conciliar', operador, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const ch = await carregarChamada(req, String(req.params.id))
    await exigirTurma(req, ch.classSectionId)
    if (ch.status === 'ABERTA') throw httpErr(409, 'Feche a chamada antes de conciliar com o diário.')
    res.json(await conciliarChamada(tenantId, ch, { sobrescrever: req.body?.sobrescrever === true, userId: getUserId(req) }))
  }))
  router.post('/chamadas/:id/reabrir', requireRole(...PODE_CORRIGIR as any), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const ch = await carregarChamada(req, String(req.params.id))
    await exigirTurma(req, ch.classSectionId)
    const motivo = String(req.body?.motivo ?? '').trim()
    if (motivo.length < 5) throw httpErr(400, 'Informe o motivo da reabertura (mín. 5 caracteres).')
    const upd = await prisma.preChamada.update({ where: { id: ch.id }, data: { status: 'ABERTA', fechadaEm: null, conciliadaEm: null } })
    await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'REABRIR_CHAMADA', refType: 'PreChamada', refId: ch.id, detalhes: { motivo } })
    res.json(upd)
  }))
  router.get('/chamadas', operador, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    const st = qs(req.query.status), turma = qs(req.query.classSectionId)
    if (st) where.status = st
    if (turma) where.classSectionId = turma
    if (req.user!.role === 'TEACHER') where.classSectionId = { in: (await prisma.classSection.findMany({ where: { tenantId, professorUserId: req.user!.id }, select: { id: true } })).map((s) => s.id), ...(turma ? { equals: turma } : {}) } as any
    const [total, items] = await Promise.all([prisma.preChamada.count({ where }), prisma.preChamada.findMany({ where, orderBy: { inicioEsperado: 'desc' }, skip, take })])
    res.json({ total, page, pageSize, items })
  }))

  // ---- correção manual com justificativa e trilha
  router.patch('/frequencias/:id', requireRole(...PODE_CORRIGIR as any), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(z.object({ status: z.enum(STATUS_FREQUENCIA as [string, ...string[]]), justificativa: z.string().trim().min(10, 'Justificativa deve ter pelo menos 10 caracteres').max(500) }), req.body)
    const f = await prisma.preFrequencia.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!f) throw httpErr(404, 'Frequência não encontrada.')
    const ch = await prisma.preChamada.findFirst({ where: { id: f.chamadaId, tenantId } })
    if (!ch) throw httpErr(404, 'Chamada não encontrada.')
    await exigirTurma(req, ch.classSectionId)
    const antes = { status: f.status, origem: f.origem, justificativa: f.justificativa, entradaEm: f.entradaEm, saidaEm: f.saidaEm }
    const upd = await prisma.preFrequencia.update({ where: { id: f.id }, data: { status: b.status, origem: 'MANUAL', justificativa: b.justificativa, divergente: false } })
    await prisma.preCorrecao.create({ data: { tenantId, frequenciaId: f.id, chamadaId: f.chamadaId, studentId: f.studentId, de: antes as any, para: { status: b.status, origem: 'MANUAL' }, justificativa: b.justificativa, userId: getUserId(req), papel: req.user!.role } })
    await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'CORRIGIR_FREQUENCIA', refType: 'PreFrequencia', refId: f.id, detalhes: { de: f.status, para: b.status, justificativa: b.justificativa } })
    if (ch.status !== 'ABERTA') await gravarDiario(tenantId, ch, { studentId: f.studentId, status: b.status, justificativa: `Correção manual: ${b.justificativa}`, minutosAtraso: 0, minutosSaidaAntecipada: 0 })
    res.json(upd)
  }))
  router.get('/frequencias/:id/correcoes', operador, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    res.json({ items: await prisma.preCorrecao.findMany({ where: { tenantId, frequenciaId: String(req.params.id) }, orderBy: { createdAt: 'asc' } }) })
  }))
  router.get('/divergencias', operador, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const where: any = { tenantId, divergente: true }
    if (req.user!.role === 'TEACHER') {
      const ids = (await prisma.classSection.findMany({ where: { tenantId, professorUserId: req.user!.id }, select: { id: true } })).map((s) => s.id)
      where.chamada = { classSectionId: { in: ids } }
    }
    const items = await prisma.preFrequencia.findMany({ where, orderBy: { updatedAt: 'desc' }, take: 200, include: { chamada: { select: { id: true, classSessionId: true, classSectionId: true, inicioEsperado: true } } } })
    const nomes = await nomesPessoa(tenantId, items.map((i) => i.studentId))
    res.json({ items: items.map((i) => ({ ...i, aluno: nomes.get(i.studentId) ?? null, presenteReconhecimento: presencaComputada(i.status) })) })
  }))
  router.post('/frequencias/:id/resolver', requireRole(...PODE_CORRIGIR as any), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(z.object({ fonte: z.enum(['RECONHECIMENTO', 'DIARIO']), justificativa: z.string().trim().min(10).max(500) }), req.body)
    const f = await prisma.preFrequencia.findFirst({ where: { id: String(req.params.id), tenantId, divergente: true } })
    if (!f) throw httpErr(404, 'Divergência não encontrada.')
    const ch = await prisma.preChamada.findFirst({ where: { id: f.chamadaId, tenantId } })
    if (!ch) throw httpErr(404, 'Chamada não encontrada.')
    await exigirTurma(req, ch.classSectionId)
    let novoStatus = f.status
    if (b.fonte === 'DIARIO') {
      novoStatus = f.diarioPresente ? 'PRESENTE' : 'FALTA'
      await prisma.preFrequencia.update({ where: { id: f.id }, data: { status: novoStatus, origem: 'MANUAL', justificativa: b.justificativa, divergente: false, conciliadoEm: new Date() } })
    } else {
      await gravarDiario(tenantId, ch, f)
      await prisma.preFrequencia.update({ where: { id: f.id }, data: { divergente: false, conciliadoEm: new Date() } })
    }
    await prisma.preCorrecao.create({ data: { tenantId, frequenciaId: f.id, chamadaId: f.chamadaId, studentId: f.studentId, de: { status: f.status, diarioPresente: f.diarioPresente } as any, para: { status: novoStatus, fonte: b.fonte }, justificativa: b.justificativa, userId: getUserId(req), papel: req.user!.role } })
    await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'RESOLVER_DIVERGENCIA', refType: 'PreFrequencia', refId: f.id, detalhes: b })
    res.json({ ok: true, status: novoStatus })
  }))

  // ---- relatórios de frequência
  router.get('/relatorios/frequencia', operador, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const turma = qs(req.query.classSectionId)
    if (!turma) throw httpErr(400, 'Informe classSectionId.')
    await exigirTurma(req, turma, false)
    const de = qs(req.query.de) ? new Date(String(qs(req.query.de))) : new Date(Date.now() - 90 * 86_400_000)
    const ate = qs(req.query.ate) ? new Date(String(qs(req.query.ate))) : new Date(Date.now() + 86_400_000)
    if (isNaN(de.getTime()) || isNaN(ate.getTime())) throw httpErr(400, 'Período inválido.')
    const chamadas = await prisma.preChamada.findMany({ where: { tenantId, classSectionId: turma, inicioEsperado: { gte: de, lte: ate }, status: { not: 'ABERTA' } }, select: { id: true } })
    const freqs = await prisma.preFrequencia.findMany({ where: { tenantId, chamadaId: { in: chamadas.map((c) => c.id) } } })
    const alunos = await matriculados(turma)
    const linhas = alunos.map((a) => {
      const fs = freqs.filter((f) => f.studentId === a.id)
      const c = (s: string[]) => fs.filter((f) => s.includes(f.status)).length
      const presencas = c(['PRESENTE']), atrasos = c(['ATRASO', 'ATRASO_SAIDA_ANTECIPADA']), saidas = c(['SAIDA_ANTECIPADA', 'ATRASO_SAIDA_ANTECIPADA']), faltas = c(['FALTA']), just = c(['JUSTIFICADA'])
      const computadas = fs.filter((f) => presencaComputada(f.status)).length
      return { studentId: a.id, nome: a.nomeCompleto, ra: a.ra, aulas: fs.length, presencas, atrasos, saidasAntecipadas: saidas, faltas, justificadas: just, percentual: fs.length ? Math.round((computadas / fs.length) * 1000) / 10 : null, minutosAtraso: fs.reduce((s, f) => s + f.minutosAtraso, 0) }
    })
    if (qs(req.query.formato) === 'csv') {
      const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
      const csv = [['RA', 'Aluno', 'Aulas', 'Presenças', 'Atrasos', 'Saídas antecipadas', 'Faltas', 'Justificadas', '% frequência'].map(esc).join(';'), ...linhas.map((l) => [l.ra, l.nome, l.aulas, l.presencas, l.atrasos, l.saidasAntecipadas, l.faltas, l.justificadas, l.percentual ?? ''].map(esc).join(';'))].join('\n')
      res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', 'attachment; filename="frequencia.csv"')
      return res.send('﻿' + csv)
    }
    res.json({ turmaId: turma, aulas: chamadas.length, periodo: { de, ate }, alunos: linhas })
  }))
  router.get('/relatorios/aluno/:studentId', requireRole('TEACHER', 'COORDINATOR', 'SECRETARY', 'STAFF', 'SUPPORT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    res.json(await resumoAluno(getTenantId(req), String(req.params.studentId)))
  }))
  router.get('/minha-frequencia', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user!.studentId) throw httpErr(403, 'Disponível apenas para alunos.')
    res.json(await resumoAluno(getTenantId(req), req.user!.studentId))
  }))
}

async function resumoAluno(tenantId: string, studentId: string) {
  const aluno = await prisma.student.findFirst({ where: { id: studentId, tenantId }, select: { id: true, nomeCompleto: true, ra: true } })
  if (!aluno) throw httpErr(404, 'Aluno não encontrado.')
  const freqs = await prisma.preFrequencia.findMany({ where: { tenantId, studentId, chamada: { status: { not: 'ABERTA' } } }, include: { chamada: { select: { classSectionId: true, inicioEsperado: true } } }, orderBy: { createdAt: 'desc' }, take: 500 })
  const porTurma = new Map<string, typeof freqs>()
  for (const f of freqs) porTurma.set(f.chamada.classSectionId, [...(porTurma.get(f.chamada.classSectionId) ?? []), f])
  const secs = await prisma.classSection.findMany({ where: { tenantId, id: { in: [...porTurma.keys()] } }, select: { id: true, nome: true, discipline: { select: { nome: true } } } })
  const sMap = new Map(secs.map((s) => [s.id, s]))
  const turmas = [...porTurma.entries()].map(([id, fs]) => ({ classSectionId: id, turma: sMap.get(id)?.nome, disciplina: sMap.get(id)?.discipline.nome, aulas: fs.length, presencas: fs.filter((f) => presencaComputada(f.status)).length, atrasos: fs.filter((f) => f.minutosAtraso > 0).length, faltas: fs.filter((f) => f.status === 'FALTA').length, justificadas: fs.filter((f) => f.status === 'JUSTIFICADA').length, percentual: Math.round((fs.filter((f) => presencaComputada(f.status)).length / fs.length) * 1000) / 10 }))
  return { aluno, turmas, ultimas: freqs.slice(0, 20).map((f) => ({ id: f.id, status: f.status, aula: f.chamada.inicioEsperado, minutosAtraso: f.minutosAtraso, origem: f.origem })) }
}

export async function espacoDoTenant(tenantId: string, spaceId: string) {
  const e = await prisma.eduSpace.findFirst({ where: { id: spaceId, tenantId } })
  if (!e) throw httpErr(404, 'Espaço não encontrado nesta instituição.')
  return e
}

export { MIN, parsePessoaKey }
