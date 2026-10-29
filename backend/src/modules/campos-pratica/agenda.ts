import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { pageParams, parseBody, qs } from '../core/crud'
import { audit, notify } from '../core/notify'
import { cancelReminders, completeReminders, scheduleReminder } from '../core/reminders'
import { cifrar, decifrar } from '../seguranca/cripto'
import { abreviar, podeVerPaciente } from './pacientes'
import {
  DIA, HORA, MOD, OPERACAO, RECEPCAO, alunoMatriculadoNoCurso, dt, ehGestor, ehRecepcao, ehSuper, exigir, exigirAluno, exigirPrograma, exigirUser, getConfig, httpErr, logAcesso,
  mapaAlunos, mapaProgramas, mapaUsuarios, zId,
} from './servico'

const ATIVAS = ['AGENDADO', 'CONFIRMADO', 'CHEGOU', 'EM_ATENDIMENTO']
const OCUPAM = [...ATIVAS, 'REALIZADO', 'FALTOU']
const fmtData = (d: Date) => d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })
const PESO: Record<string, number> = { URGENTE: 0, ALTA: 1, NORMAL: 2 }

async function lock(tx: any, chave: string) { await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${chave}))` }

export interface NovaConsulta {
  unidadeId: string; consultorioId: string; pacienteId: string; animalId?: string; supervisorUserId: string; alunoStudentId?: string; programId?: string
  inicio: Date; fim: Date; categoria?: string; filaId?: string; remarcadoDeId?: string; local?: string; forcar?: boolean; retroativo?: boolean
}

/** Núcleo da agenda: valida regras de supervisão e conflitos e grava (serializado por unidade). */
export async function criarConsulta(req: AuthenticatedRequest, c: NovaConsulta) {
  const tenantId = getTenantId(req)
  const cfg = await getConfig(tenantId)
  if (c.fim <= c.inicio) throw httpErr(400, 'O horário final deve ser depois do inicial.')
  if (c.fim.getTime() - c.inicio.getTime() > 6 * HORA) throw httpErr(400, 'Duração máxima de um atendimento: 6 horas.')
  if (c.retroativo && !ehGestor(req)) throw httpErr(403, 'Lançamento retroativo é restrito à coordenação.')
  if (!c.retroativo && c.inicio.getTime() < Date.now() - 5 * 60_000) throw httpErr(400, 'Não é possível agendar no passado.', 'DATA_PASSADA')
  const unidade = await exigir(prisma.cprUnidade.findFirst({ where: { id: c.unidadeId, tenantId, ativo: true } }), 'Unidade não encontrada ou inativa.', 400)
  const sala = await exigir(prisma.cprConsultorio.findFirst({ where: { id: c.consultorioId, tenantId, unidadeId: unidade.id, ativo: true } }), 'Consultório não pertence à unidade ou está inativo.', 400)
  const paciente = await exigir(prisma.cprPaciente.findFirst({ where: { id: c.pacienteId, tenantId } }), 'Paciente/tutor não encontrado.', 400)
  if (paciente.anonimizadoEm) throw httpErr(409, 'Cadastro anonimizado.')
  if (paciente.consentimentoStatus !== 'ATIVO') throw httpErr(409, 'Consentimento (LGPD) ausente ou revogado: colete o consentimento antes de agendar.', 'CONSENTIMENTO_AUSENTE')
  if (c.animalId) {
    const an = await exigir(prisma.cprAnimal.findFirst({ where: { id: c.animalId, tenantId } }), 'Animal não encontrado.', 400)
    if (an.tutorId !== paciente.id) throw httpErr(409, 'O animal não pertence a este tutor.', 'ANIMAL_OUTRO_TUTOR')
    if (an.status !== 'ATIVO') throw httpErr(409, 'Animal inativo.')
    if (unidade.tipo !== 'HOSPITAL_VET') throw httpErr(409, 'Animais só são atendidos no hospital veterinário-escola.')
  } else if (unidade.tipo === 'HOSPITAL_VET') throw httpErr(400, 'Informe o animal do atendimento.')
  const sup = await exigirUser(tenantId, c.supervisorUserId, 'Supervisor não encontrado.')
  if (!['TEACHER', 'COORDINATOR'].includes(sup.role)) throw httpErr(400, 'O supervisor deve ser professor ou coordenador.')
  if (paciente.faltasConsecutivas >= cfg.maxFaltasConsecutivas && !(c.forcar && ehGestor(req))) throw httpErr(409, `Paciente com ${paciente.faltasConsecutivas} faltas consecutivas: a coordenação precisa liberar o novo agendamento.`, 'FALTAS_EXCEDIDAS')
  const escala = await prisma.cprEscala.findFirst({ where: { tenantId, unidadeId: unidade.id, supervisorUserId: sup.id, status: 'ATIVA', inicio: { lte: c.inicio }, fim: { gte: c.fim } } })
  let programId = c.programId ?? escala?.programId ?? unidade.programId ?? undefined
  if (c.alunoStudentId) {
    const aluno = await exigirAluno(tenantId, c.alunoStudentId)
    if (!escala) throw httpErr(409, 'Aluno só atende com supervisor escalado neste horário e unidade.', 'SEM_SUPERVISOR_ESCALADO')
    const naEscala = await prisma.cprEscalaAluno.findFirst({ where: { escalaId: escala.id, studentId: aluno.id } })
    if (!naEscala) throw httpErr(409, 'O aluno não está escalado com este supervisor neste horário.', 'ALUNO_FORA_DA_ESCALA')
    programId = escala.programId
    if (!(await alunoMatriculadoNoCurso(aluno.id, escala.programId))) throw httpErr(409, 'Aluno sem matrícula ativa no curso da escala.', 'ALUNO_FORA_DO_CURSO')
  }
  if (!programId) throw httpErr(400, 'Informe o curso (programId) do atendimento.')
  await exigirPrograma(tenantId, programId)

  return prisma.$transaction(async (tx) => {
    await lock(tx, `cpr-agenda:${tenantId}:${unidade.id}`)
    const base = { tenantId, status: { in: OCUPAM.filter((s) => s !== 'FALTOU') }, inicio: { lt: c.fim }, fim: { gt: c.inicio } }
    const nSala = await tx.cprConsulta.count({ where: { ...base, consultorioId: sala.id } })
    if (nSala >= sala.capacidade) throw httpErr(409, `Conflito de sala: ${sala.nome} já está ocupada neste horário.`, 'CONFLITO_SALA')
    const nSup = await tx.cprConsulta.count({ where: { ...base, supervisorUserId: sup.id } })
    const capSup = escala?.capacidadeSimultanea ?? 1
    if (nSup >= capSup) throw httpErr(409, `Conflito de profissional: o supervisor já acompanha ${nSup} atendimento(s) neste horário (limite ${capSup}).`, 'CONFLITO_SUPERVISOR')
    if (c.alunoStudentId && (await tx.cprConsulta.count({ where: { ...base, alunoStudentId: c.alunoStudentId } })) > 0) throw httpErr(409, 'Conflito: o aluno já tem outro atendimento neste horário.', 'CONFLITO_ALUNO')
    const ocupPac = await tx.cprConsulta.count({ where: { ...base, ...(c.animalId ? { animalId: c.animalId } : { pacienteId: paciente.id }) } })
    if (ocupPac > 0) throw httpErr(409, c.animalId ? 'O animal já tem atendimento neste horário.' : 'O paciente já tem atendimento neste horário.', 'CONFLITO_PACIENTE')
    const row = await tx.cprConsulta.create({
      data: { tenantId, unidadeId: unidade.id, consultorioId: sala.id, programId: programId!, pacienteId: paciente.id, animalId: c.animalId, supervisorUserId: sup.id, alunoStudentId: c.alunoStudentId, escalaId: escala?.id, inicio: c.inicio, fim: c.fim, categoria: c.categoria ?? 'CONSULTA', filaId: c.filaId, remarcadoDeId: c.remarcadoDeId, local: c.local, criadoPorId: getUserId(req) },
    })
    if (c.filaId) await tx.cprFila.updateMany({ where: { id: c.filaId, tenantId }, data: { status: 'AGENDADO', consultaId: row.id } })
    return row
  }).then(async (row) => {
    if (row.inicio.getTime() > Date.now()) {
      await scheduleReminder({ tenantId, modulo: MOD, titulo: `Atendimento em ${unidade.nome} às ${fmtData(row.inicio)}`, dueAt: row.inicio, remindAt: new Date(Math.max(Date.now(), row.inicio.getTime() - cfg.antecedenciaLembreteHoras * HORA)), refType: 'CprConsulta', refId: row.id, assigneeUserId: row.supervisorUserId, dedupeKey: `cpr:consulta:${row.id}` })
    }
    await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'AGENDAR', refType: 'CprConsulta', refId: row.id })
    return row
  })
}

const schemaConsulta = z.object({
  unidadeId: zId, consultorioId: zId, pacienteId: zId, animalId: zId.optional(), supervisorUserId: zId, alunoStudentId: zId.optional(), programId: zId.optional(), inicio: dt, fim: dt,
  categoria: z.enum(['TRIAGEM', 'CONSULTA', 'RETORNO', 'AVALIACAO', 'PROCEDIMENTO', 'VACINACAO', 'CIRURGIA']).default('CONSULTA'), local: z.string().max(200).optional(), forcar: z.boolean().optional(), retroativo: z.boolean().optional(),
})

async function comNomes(req: AuthenticatedRequest, rows: any[]) {
  const tenantId = getTenantId(req)
  const [pacs, us, als, ps, unis, salas, animais] = await Promise.all([
    prisma.cprPaciente.findMany({ where: { tenantId, id: { in: rows.map((r) => r.pacienteId) } }, select: { id: true, nome: true, tipo: true, faltasConsecutivas: true } }),
    mapaUsuarios(tenantId, rows.map((r) => r.supervisorUserId)), mapaAlunos(tenantId, rows.map((r) => r.alunoStudentId)), mapaProgramas(tenantId, rows.map((r) => r.programId)),
    prisma.cprUnidade.findMany({ where: { tenantId, id: { in: rows.map((r) => r.unidadeId) } }, select: { id: true, nome: true, area: true } }),
    prisma.cprConsultorio.findMany({ where: { tenantId, id: { in: rows.map((r) => r.consultorioId) } }, select: { id: true, nome: true } }),
    prisma.cprAnimal.findMany({ where: { tenantId, id: { in: rows.map((r) => r.animalId).filter(Boolean) } }, select: { id: true, nome: true, especie: true } }),
  ])
  const completo = ehRecepcao(req)
  return rows.map((r) => {
    const p = pacs.find((x) => x.id === r.pacienteId)
    return { ...r, paciente: p ? (completo ? p.nome : abreviar(p.nome)) : null, pacienteTipo: p?.tipo, faltasConsecutivasPaciente: completo ? p?.faltasConsecutivas : undefined, supervisor: us.get(r.supervisorUserId) ?? null, aluno: r.alunoStudentId ? als.get(r.alunoStudentId) ?? null : null, curso: ps.get(r.programId) ?? null, unidade: unis.find((u) => u.id === r.unidadeId)?.nome ?? null, area: unis.find((u) => u.id === r.unidadeId)?.area ?? null, consultorio: salas.find((s) => s.id === r.consultorioId)?.nome ?? null, animal: r.animalId ? animais.find((a) => a.id === r.animalId) ?? null : null }
  })
}

async function carregarConsulta(req: AuthenticatedRequest, id: string) {
  const c = await exigir(prisma.cprConsulta.findFirst({ where: { id, tenantId: getTenantId(req) } }), 'Atendimento não encontrado.')
  return c
}
/** Quem pode agir sobre o atendimento: supervisor, aluno escalado, recepção/coordenação. */
function papelConsulta(req: AuthenticatedRequest, c: { supervisorUserId: string; alunoStudentId: string | null }): 'SUPERVISOR' | 'ALUNO' | 'RECEPCAO' | 'GESTAO' {
  const u = req.user!
  if (u.role === 'TEACHER' && c.supervisorUserId === u.id) return 'SUPERVISOR'
  if (ehGestor(req)) return u.id === c.supervisorUserId ? 'SUPERVISOR' : 'GESTAO'
  if (u.role === 'STUDENT' && u.studentId && c.alunoStudentId === u.studentId) return 'ALUNO'
  if (u.role === 'SECRETARY' || u.role === 'STAFF') return 'RECEPCAO'
  throw httpErr(403, 'Você não participa deste atendimento.')
}

/** Chama o próximo da fila quando um horário é liberado. */
async function chamarFila(tenantId: string, programId: string, unidadeId: string, inicio: Date) {
  const fila = await prisma.cprFila.findMany({ where: { tenantId, programId, status: 'AGUARDANDO', OR: [{ unidadeId }, { unidadeId: null }] }, take: 50 })
  fila.sort((a, b) => PESO[a.prioridade] - PESO[b.prioridade] || a.createdAt.getTime() - b.createdAt.getTime())
  const prox = fila[0]
  if (!prox) return null
  await prisma.cprFila.update({ where: { id: prox.id }, data: { status: 'CHAMADO', chamadoEm: new Date() } })
  const p = await prisma.cprPaciente.findFirst({ where: { id: prox.pacienteId, tenantId } })
  let destino: string | undefined
  try { destino = p?.telefoneCifrado ? decifrar(p.telefoneCifrado) : undefined } catch { /* sem telefone */ }
  await notify({ tenantId, canal: destino ? 'WHATSAPP' : 'IN_APP', destino, assunto: 'Vaga disponível na clínica-escola', mensagem: `Surgiu uma vaga para ${fmtData(inicio)}. Entre em contato com a clínica para confirmar seu atendimento.`, refType: 'CprFila', refId: prox.id })
  return prox.id
}

export async function enviarLembreteConsulta(c: any) {
  const tenantId = c.tenantId
  const [p, un, aluno] = await Promise.all([prisma.cprPaciente.findFirst({ where: { id: c.pacienteId, tenantId } }), prisma.cprUnidade.findFirst({ where: { id: c.unidadeId, tenantId } }), c.alunoStudentId ? prisma.student.findFirst({ where: { id: c.alunoStudentId, tenantId }, select: { userId: true } }) : null])
  let destino: string | undefined
  try { destino = p?.telefoneCifrado ? decifrar(p.telefoneCifrado) : undefined } catch { /* sem telefone */ }
  const msg = `Lembrete: atendimento em ${un?.nome ?? 'clínica-escola'} em ${fmtData(c.inicio)}. Responda SIM para confirmar ou NÃO para cancelar.`
  if (destino) await notify({ tenantId, canal: 'WHATSAPP', destino, assunto: 'Lembrete de atendimento', mensagem: msg, refType: 'CprConsulta', refId: c.id })
  if (aluno?.userId) await notify({ tenantId, userId: aluno.userId, assunto: 'Atendimento agendado', mensagem: `Você tem atendimento supervisionado em ${fmtData(c.inicio)} (${un?.nome ?? ''}).`, refType: 'CprConsulta', refId: c.id })
  await notify({ tenantId, userId: c.supervisorUserId, assunto: 'Atendimento supervisionado', mensagem: `Atendimento em ${fmtData(c.inicio)} (${un?.nome ?? ''}).`, refType: 'CprConsulta', refId: c.id })
  await prisma.cprConsulta.update({ where: { id: c.id }, data: { lembreteEnviadoEm: new Date() } })
  return { paciente: !!destino, aluno: !!aluno?.userId }
}

export async function jobLembretesConsultas() {
  const tenants = await prisma.cprConsulta.findMany({ distinct: ['tenantId'], select: { tenantId: true } })
  let enviados = 0
  let semDesfecho = 0
  for (const { tenantId } of tenants) {
    const cfg = await getConfig(tenantId)
    const agora = new Date()
    const lista = await prisma.cprConsulta.findMany({ where: { tenantId, status: { in: ['AGENDADO', 'CONFIRMADO'] }, lembreteEnviadoEm: null, inicio: { gt: agora, lte: new Date(agora.getTime() + cfg.antecedenciaLembreteHoras * HORA) } }, take: 500 })
    for (const c of lista) { await enviarLembreteConsulta(c); enviados++ }
    // atendimentos cujo horário passou sem desfecho: pede à recepção para registrar presença/falta
    const velhas = await prisma.cprConsulta.findMany({ where: { tenantId, status: { in: ['AGENDADO', 'CONFIRMADO'] }, fim: { lt: new Date(agora.getTime() - 2 * HORA) } }, take: 200 })
    for (const c of velhas) {
      await scheduleReminder({ tenantId, modulo: MOD, titulo: 'Atendimento sem desfecho: registre comparecimento ou falta', dueAt: c.fim, remindAt: agora, severity: 'ATENCAO', refType: 'CprConsulta', refId: c.id, assigneeRole: 'SECRETARY', dedupeKey: `cpr:semdesfecho:${c.id}` })
      semDesfecho++
    }
  }
  return { lembretes: enviados, semDesfecho }
}

export function mountAgenda(router: Router) {
  const amplo = requireRole(...RECEPCAO, 'TEACHER', 'STUDENT')
  const operacao = requireRole(...OPERACAO)
  const recepcao = requireRole(...RECEPCAO)
  const clinico = requireRole('COORDINATOR', 'TEACHER', 'STUDENT')

  // ---------------------------------------------------------------- escalas
  router.post('/clinicas/escalas', requireRole('COORDINATOR', 'SECRETARY'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(z.object({ unidadeId: zId, programId: zId, supervisorUserId: zId, consultorioId: zId.optional(), inicio: dt, fim: dt, capacidadeSimultanea: z.number().int().min(1).max(10).default(3), observacao: z.string().max(300).optional(), alunos: z.array(zId).max(30).default([]) }), req.body)
    if (b.fim <= b.inicio || b.fim.getTime() - b.inicio.getTime() > 12 * HORA) throw httpErr(400, 'Período da escala inválido (máximo 12 h).')
    await exigir(prisma.cprUnidade.findFirst({ where: { id: b.unidadeId, tenantId, ativo: true } }), 'Unidade não encontrada.', 400)
    await exigirPrograma(tenantId, b.programId)
    const sup = await exigirUser(tenantId, b.supervisorUserId, 'Supervisor não encontrado.')
    if (!['TEACHER', 'COORDINATOR'].includes(sup.role)) throw httpErr(400, 'O supervisor deve ser professor ou coordenador.')
    if (b.consultorioId) await exigir(prisma.cprConsultorio.findFirst({ where: { id: b.consultorioId, tenantId, unidadeId: b.unidadeId } }), 'Consultório inválido.', 400)
    for (const sid of b.alunos) await validarAluno(tenantId, { id: '__nova__', programId: b.programId, inicio: b.inicio, fim: b.fim }, sid)
    const row = await prisma.$transaction(async (tx) => {
      await lock(tx, `cpr-escala:${tenantId}:${b.supervisorUserId}`)
      const choque = await tx.cprEscala.findFirst({ where: { tenantId, supervisorUserId: sup.id, status: 'ATIVA', inicio: { lt: b.fim }, fim: { gt: b.inicio } } })
      if (choque) throw httpErr(409, 'O supervisor já está escalado em outro horário que se sobrepõe a este.', 'CONFLITO_SUPERVISOR')
      const e = await tx.cprEscala.create({ data: { tenantId, unidadeId: b.unidadeId, programId: b.programId, supervisorUserId: sup.id, consultorioId: b.consultorioId, inicio: b.inicio, fim: b.fim, capacidadeSimultanea: b.capacidadeSimultanea, observacao: b.observacao } })
      for (const sid of new Set(b.alunos)) await tx.cprEscalaAluno.create({ data: { tenantId, escalaId: e.id, studentId: sid } })
      return e
    })
    await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'CRIAR_ESCALA', refType: 'CprEscala', refId: row.id })
    res.status(201).json(row)
  }))

  async function validarAluno(tenantId: string, esc: { id: string; programId: string; inicio: Date; fim: Date }, studentId: string) {
    const aluno = await exigirAluno(tenantId, studentId)
    if (!(await alunoMatriculadoNoCurso(aluno.id, esc.programId))) throw httpErr(409, `Aluno ${aluno.nomeCompleto} não está matriculado no curso da escala.`, 'ALUNO_FORA_DO_CURSO')
    const outras = await prisma.cprEscalaAluno.findMany({ where: { tenantId, studentId: aluno.id, escalaId: { not: esc.id } }, select: { escalaId: true } })
    if (outras.length && (await prisma.cprEscala.count({ where: { id: { in: outras.map((o) => o.escalaId) }, status: 'ATIVA', inicio: { lt: esc.fim }, fim: { gt: esc.inicio } } }))) throw httpErr(409, `Aluno ${aluno.nomeCompleto} já está em outra escala neste horário.`, 'CONFLITO_ALUNO')
    return aluno
  }
  async function adicionarAluno(tenantId: string, esc: { id: string; programId: string; inicio: Date; fim: Date }, studentId: string) {
    const aluno = await validarAluno(tenantId, esc, studentId)
    return prisma.cprEscalaAluno.upsert({ where: { escalaId_studentId: { escalaId: esc.id, studentId: aluno.id } }, create: { tenantId, escalaId: esc.id, studentId: aluno.id }, update: {} })
  }

  router.get('/clinicas/escalas', amplo, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const where: any = { tenantId, status: qs(req.query.status) ?? 'ATIVA' }
    const de = qs(req.query.de), ate = qs(req.query.ate)
    if (de) where.fim = { gte: new Date(de) }
    if (ate) where.inicio = { lte: new Date(ate) }
    for (const f of ['unidadeId', 'programId', 'supervisorUserId']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    if (req.user!.role === 'TEACHER') where.supervisorUserId = req.user!.id
    if (req.user!.role === 'STUDENT') where.id = { in: (await prisma.cprEscalaAluno.findMany({ where: { tenantId, studentId: req.user!.studentId ?? '__' }, select: { escalaId: true } })).map((x) => x.escalaId) }
    const rows = await prisma.cprEscala.findMany({ where, orderBy: { inicio: 'asc' }, take: 300 })
    const [als, us, ps, unis, ca] = await Promise.all([
      prisma.cprEscalaAluno.findMany({ where: { tenantId, escalaId: { in: rows.map((r) => r.id) } } }), mapaUsuarios(tenantId, rows.map((r) => r.supervisorUserId)), mapaProgramas(tenantId, rows.map((r) => r.programId)),
      prisma.cprUnidade.findMany({ where: { tenantId, id: { in: rows.map((r) => r.unidadeId) } }, select: { id: true, nome: true } }),
      prisma.cprConsulta.groupBy({ by: ['escalaId'], where: { tenantId, escalaId: { in: rows.map((r) => r.id) }, status: { in: OCUPAM } }, _count: true }),
    ])
    const nomes = await mapaAlunos(tenantId, als.map((a) => a.studentId))
    res.json({ items: rows.map((r) => ({ ...r, supervisor: us.get(r.supervisorUserId) ?? null, curso: ps.get(r.programId) ?? null, unidade: unis.find((u) => u.id === r.unidadeId)?.nome ?? null, alunos: als.filter((a) => a.escalaId === r.id).map((a) => ({ studentId: a.studentId, nome: nomes.get(a.studentId) ?? null })), atendimentos: ca.find((x) => x.escalaId === r.id)?._count ?? 0 })) })
  }))

  router.post('/clinicas/escalas/:id/alunos', requireRole('COORDINATOR', 'SECRETARY'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const esc = await exigir(prisma.cprEscala.findFirst({ where: { id: String(req.params.id), tenantId, status: 'ATIVA' } }), 'Escala não encontrada.')
    const b = parseBody(z.object({ studentId: zId }), req.body)
    res.status(201).json(await adicionarAluno(tenantId, esc, b.studentId))
  }))
  router.delete('/clinicas/escalas/:id/alunos/:studentId', requireRole('COORDINATOR', 'SECRETARY'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const esc = await exigir(prisma.cprEscala.findFirst({ where: { id: String(req.params.id), tenantId } }), 'Escala não encontrada.')
    const uso = await prisma.cprConsulta.count({ where: { tenantId, escalaId: esc.id, alunoStudentId: String(req.params.studentId), status: { in: ATIVAS } } })
    if (uso) throw httpErr(409, 'O aluno tem atendimentos ativos nesta escala: reatribua ou cancele antes.', 'ALUNO_COM_ATENDIMENTOS')
    await prisma.cprEscalaAluno.deleteMany({ where: { escalaId: esc.id, studentId: String(req.params.studentId), tenantId } })
    res.status(204).end()
  }))
  router.post('/clinicas/escalas/:id/presenca', requireRole('COORDINATOR', 'TEACHER'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const esc = await exigir(prisma.cprEscala.findFirst({ where: { id: String(req.params.id), tenantId, status: 'ATIVA' } }), 'Escala não encontrada.')
    if (esc.supervisorUserId !== req.user!.id && !ehGestor(req)) throw httpErr(403, 'Somente o supervisor escalado registra a própria presença.')
    const agora = Date.now()
    if (agora < esc.inicio.getTime() - 30 * 60_000 || agora > esc.fim.getTime()) throw httpErr(409, 'Fora da janela da escala (30 min antes até o fim).', 'FORA_DA_JANELA')
    res.json(await prisma.cprEscala.update({ where: { id: esc.id }, data: { supervisorPresenteEm: new Date() } }))
  }))
  router.post('/clinicas/escalas/:id/cancelar', requireRole('COORDINATOR', 'SECRETARY'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const esc = await exigir(prisma.cprEscala.findFirst({ where: { id: String(req.params.id), tenantId, status: 'ATIVA' } }), 'Escala não encontrada.')
    const b = parseBody(z.object({ cancelarAtendimentos: z.boolean().default(false) }), req.body ?? {})
    const ativas = await prisma.cprConsulta.findMany({ where: { tenantId, escalaId: esc.id, status: { in: ['AGENDADO', 'CONFIRMADO'] } }, select: { id: true } })
    if (ativas.length && !b.cancelarAtendimentos) throw httpErr(409, `${ativas.length} atendimento(s) dependem desta escala. Confirme o cancelamento deles.`, 'ESCALA_COM_ATENDIMENTOS')
    await prisma.cprConsulta.updateMany({ where: { id: { in: ativas.map((a) => a.id) } }, data: { status: 'CANCELADO', motivoCancelamento: 'Escala do supervisor cancelada' } })
    for (const a of ativas) await cancelReminders({ tenantId, refType: 'CprConsulta', refId: a.id })
    await prisma.cprEscala.update({ where: { id: esc.id }, data: { status: 'CANCELADA' } })
    res.json({ ok: true, atendimentosCancelados: ativas.length })
  }))

  // ---------------------------------------------------------------- agenda
  router.post('/clinicas/agenda', operacao, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const b = parseBody(schemaConsulta, req.body)
    if (req.user!.role === 'TEACHER' && b.supervisorUserId !== req.user!.id) throw httpErr(403, 'Professores agendam apenas atendimentos sob a sua supervisão.')
    res.status(201).json(await criarConsulta(req, b))
  }))

  router.get('/clinicas/agenda/ocupacao', amplo, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const de = new Date(qs(req.query.de) ?? Date.now()), ate = new Date(qs(req.query.ate) ?? Date.now() + 7 * DIA)
    const unidadeId = qs(req.query.unidadeId)
    const rows = await prisma.cprConsulta.findMany({ where: { tenantId, ...(unidadeId ? { unidadeId } : {}), status: { in: OCUPAM.filter((s) => s !== 'FALTOU') }, inicio: { lt: ate }, fim: { gt: de } }, select: { consultorioId: true, supervisorUserId: true, inicio: true, fim: true, unidadeId: true }, take: 2000, orderBy: { inicio: 'asc' } })
    res.json({ items: rows })
  }))

  router.get('/clinicas/agenda', amplo, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    for (const f of ['unidadeId', 'consultorioId', 'programId', 'status', 'supervisorUserId', 'alunoStudentId', 'pacienteId', 'animalId', 'categoria']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    const de = qs(req.query.de), ate = qs(req.query.ate)
    if (de || ate) where.inicio = { ...(de ? { gte: new Date(de) } : {}), ...(ate ? { lte: new Date(ate) } : {}) }
    if (req.user!.role === 'TEACHER') where.supervisorUserId = req.user!.id
    if (req.user!.role === 'STUDENT') where.alunoStudentId = req.user!.studentId ?? '__nenhum__'
    const [rows, total] = await Promise.all([prisma.cprConsulta.findMany({ where, orderBy: { inicio: qs(req.query.ordem) === 'desc' ? 'desc' : 'asc' }, skip, take }), prisma.cprConsulta.count({ where })])
    res.json({ items: await comNomes(req, rows), total, page, pageSize })
  }))

  router.get('/clinicas/agenda/:id', amplo, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const c = await carregarConsulta(req, String(req.params.id))
    papelConsulta(req, c)
    res.json((await comNomes(req, [c]))[0])
  }))

  router.post('/clinicas/agenda/:id/confirmar', operacao, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const c = await carregarConsulta(req, String(req.params.id))
    papelConsulta(req, c)
    if (c.status !== 'AGENDADO') throw httpErr(409, `Atendimento está ${c.status}.`)
    res.json(await prisma.cprConsulta.update({ where: { id: c.id }, data: { status: 'CONFIRMADO', confirmadoEm: new Date() } }))
  }))

  router.post('/clinicas/agenda/:id/lembrete', operacao, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const c = await carregarConsulta(req, String(req.params.id))
    papelConsulta(req, c)
    if (!['AGENDADO', 'CONFIRMADO'].includes(c.status)) throw httpErr(409, 'Só é possível lembrar atendimentos agendados.')
    res.json({ ok: true, ...(await enviarLembreteConsulta(c)) })
  }))

  router.post('/clinicas/agenda/:id/chegada', recepcao, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const c = await carregarConsulta(req, String(req.params.id))
    if (!['AGENDADO', 'CONFIRMADO'].includes(c.status)) throw httpErr(409, `Atendimento está ${c.status}.`)
    if (Math.abs(c.inicio.getTime() - Date.now()) > 12 * HORA) throw httpErr(409, 'A chegada só pode ser registrada no dia do atendimento.')
    res.json(await prisma.cprConsulta.update({ where: { id: c.id }, data: { status: 'CHEGOU', chegouEm: new Date() } }))
  }))

  router.post('/clinicas/agenda/:id/iniciar', clinico, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const c = await carregarConsulta(req, String(req.params.id))
    const papel = papelConsulta(req, c)
    if (papel === 'RECEPCAO') throw httpErr(403, 'A recepção não inicia atendimentos.')
    if (!['AGENDADO', 'CONFIRMADO', 'CHEGOU'].includes(c.status)) throw httpErr(409, `Atendimento está ${c.status}.`)
    if (c.inicio.getTime() - Date.now() > 30 * 60_000) throw httpErr(409, 'Ainda não é o horário do atendimento (permitido 30 min antes).', 'ANTES_DO_HORARIO')
    if (c.alunoStudentId) {
      // Regra de supervisão: aluno só atende com o supervisor escalado e presente.
      const esc = c.escalaId ? await prisma.cprEscala.findFirst({ where: { id: c.escalaId, tenantId, status: 'ATIVA' } }) : null
      if (!esc) throw httpErr(409, 'Atendimento sem escala de supervisão ativa.', 'SEM_SUPERVISOR_ESCALADO')
      if (papel === 'ALUNO' && !esc.supervisorPresenteEm) throw httpErr(409, 'O supervisor ainda não confirmou presença na escala: o aluno não pode iniciar sozinho.', 'SUPERVISOR_AUSENTE')
    }
    const r = await prisma.cprConsulta.update({ where: { id: c.id }, data: { status: 'EM_ATENDIMENTO', iniciadoEm: new Date(), chegouEm: c.chegouEm ?? undefined } })
    await logAcesso(req, { recurso: 'agenda', recursoId: c.id, pacienteId: c.pacienteId, acao: 'ESCRITA' })
    res.json(r)
  }))

  router.post('/clinicas/agenda/:id/finalizar', requireRole('COORDINATOR', 'TEACHER'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const c = await carregarConsulta(req, String(req.params.id))
    const papel = papelConsulta(req, c)
    if (papel !== 'SUPERVISOR') throw httpErr(403, 'Somente o supervisor encerra o atendimento (e revisa o registro do aluno).')
    if (c.status !== 'EM_ATENDIMENTO') throw httpErr(409, 'O atendimento precisa estar em andamento.')
    const regs = await prisma.cprRegistroAtendimento.count({ where: { tenantId, consultaId: c.id } })
    if (!regs) throw httpErr(409, 'Registre o resumo do atendimento antes de finalizar.', 'SEM_REGISTRO')
    const agora = new Date()
    await prisma.$transaction([
      prisma.cprRegistroAtendimento.updateMany({ where: { tenantId, consultaId: c.id, revisadoEm: null }, data: { revisadoEm: agora, revisadoPorId: req.user!.id } }),
      prisma.cprConsulta.update({ where: { id: c.id }, data: { status: 'REALIZADO', finalizadoEm: agora } }),
      prisma.cprPaciente.update({ where: { id: c.pacienteId }, data: { faltasConsecutivas: 0 } }),
    ])
    await completeReminders({ tenantId, refType: 'CprConsulta', refId: c.id, userId: req.user!.id })
    await audit({ tenantId, userId: req.user!.id, modulo: MOD, acao: 'FINALIZAR_ATENDIMENTO', refType: 'CprConsulta', refId: c.id })
    res.json(await prisma.cprConsulta.findUnique({ where: { id: c.id } }))
  }))

  router.post('/clinicas/agenda/:id/falta', operacao, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const c = await carregarConsulta(req, String(req.params.id))
    papelConsulta(req, c)
    if (!['AGENDADO', 'CONFIRMADO'].includes(c.status)) throw httpErr(409, `Atendimento está ${c.status}.`)
    if (c.inicio.getTime() > Date.now()) throw httpErr(409, 'O horário do atendimento ainda não começou.', 'AINDA_NAO_COMECOU')
    const b = parseBody(z.object({ justificada: z.boolean().default(false), motivo: z.string().max(300).optional() }), req.body ?? {})
    const cfg = await getConfig(tenantId)
    const r = await prisma.cprConsulta.update({ where: { id: c.id }, data: { status: 'FALTOU', motivoCancelamento: b.motivo } })
    const p = await prisma.cprPaciente.update({ where: { id: c.pacienteId }, data: b.justificada ? { faltasTotal: { increment: 1 } } : { faltasConsecutivas: { increment: 1 }, faltasTotal: { increment: 1 } } })
    await completeReminders({ tenantId, refType: 'CprConsulta', refId: c.id })
    if (p.faltasConsecutivas >= cfg.maxFaltasConsecutivas) await scheduleReminder({ tenantId, modulo: MOD, titulo: `Paciente atingiu ${p.faltasConsecutivas} faltas consecutivas: contatar antes de novo agendamento`, dueAt: new Date(Date.now() + 7 * DIA), remindAt: new Date(), severity: 'ATENCAO', refType: 'CprPaciente', refId: p.id, assigneeRole: 'COORDINATOR', dedupeKey: `cpr:faltas:${p.id}`, reabrir: true })
    res.json({ ...r, faltasConsecutivasPaciente: p.faltasConsecutivas })
  }))

  router.post('/clinicas/agenda/:id/cancelar', operacao, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const c = await carregarConsulta(req, String(req.params.id))
    papelConsulta(req, c)
    if (!['AGENDADO', 'CONFIRMADO', 'CHEGOU'].includes(c.status)) throw httpErr(409, `Atendimento está ${c.status}.`)
    const b = parseBody(z.object({ motivo: z.string().trim().min(3).max(300) }), req.body)
    const r = await prisma.cprConsulta.update({ where: { id: c.id }, data: { status: 'CANCELADO', motivoCancelamento: b.motivo } })
    await cancelReminders({ tenantId, refType: 'CprConsulta', refId: c.id })
    const filaChamada = c.inicio.getTime() > Date.now() ? await chamarFila(tenantId, c.programId, c.unidadeId, c.inicio) : null
    res.json({ ...r, filaChamada })
  }))

  router.post('/clinicas/agenda/:id/remarcar', operacao, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const c = await carregarConsulta(req, String(req.params.id))
    papelConsulta(req, c)
    if (!['AGENDADO', 'CONFIRMADO'].includes(c.status)) throw httpErr(409, `Atendimento está ${c.status}.`)
    const b = parseBody(z.object({ inicio: dt, fim: dt, consultorioId: zId.optional(), supervisorUserId: zId.optional(), alunoStudentId: zId.nullable().optional() }), req.body)
    // libera o horário antigo antes de validar (dentro de uma transação lógica: se falhar, volta ao estado anterior)
    await prisma.cprConsulta.update({ where: { id: c.id }, data: { status: 'REMARCADO' } })
    try {
      const nova = await criarConsulta(req, { unidadeId: c.unidadeId, consultorioId: b.consultorioId ?? c.consultorioId, pacienteId: c.pacienteId, animalId: c.animalId ?? undefined, supervisorUserId: b.supervisorUserId ?? c.supervisorUserId, alunoStudentId: b.alunoStudentId === null ? undefined : b.alunoStudentId ?? c.alunoStudentId ?? undefined, programId: c.programId, inicio: b.inicio, fim: b.fim, categoria: c.categoria, remarcadoDeId: c.id, local: c.local ?? undefined, retroativo: false })
      await cancelReminders({ tenantId, refType: 'CprConsulta', refId: c.id })
      res.json(nova)
    } catch (e) {
      await prisma.cprConsulta.update({ where: { id: c.id }, data: { status: c.status } })
      throw e
    }
  }))

  // ---------------------------------------------------------------- registro de atendimento (conteúdo cifrado + confidencialidade)
  const NIVEIS = ['NORMAL', 'RESTRITO', 'SIGILOSO'] as const
  router.post('/clinicas/agenda/:id/registro', clinico, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const c = await carregarConsulta(req, String(req.params.id))
    const papel = papelConsulta(req, c)
    if (papel === 'GESTAO') throw httpErr(403, 'A coordenação não escreve registros clínicos; eles são feitos por aluno e supervisor.')
    if (papel === 'RECEPCAO') throw httpErr(403, 'A recepção não acessa registros clínicos.')
    if (!(papel === 'SUPERVISOR' ? ['EM_ATENDIMENTO', 'REALIZADO'] : ['EM_ATENDIMENTO']).includes(c.status)) throw httpErr(409, 'O registro só pode ser feito durante o atendimento (o supervisor pode complementar depois).', 'FORA_DO_ATENDIMENTO')
    const b = parseBody(z.object({ resumo: z.string().trim().min(10, 'Descreva o atendimento em ao menos 10 caracteres.').max(4000), conduta: z.string().max(500).optional(), nivel: z.enum(NIVEIS).default('NORMAL') }), req.body)
    if (papel === 'ALUNO' && b.nivel === 'SIGILOSO') throw httpErr(403, 'Somente o supervisor define o nível sigiloso.')
    const r = await prisma.cprRegistroAtendimento.create({ data: { tenantId, consultaId: c.id, pacienteId: c.pacienteId, autorUserId: req.user!.id, autorStudentId: papel === 'ALUNO' ? req.user!.studentId : undefined, nivel: b.nivel, resumoCifrado: cifrar(b.resumo), conduta: b.conduta, ...(papel === 'SUPERVISOR' ? { revisadoEm: new Date(), revisadoPorId: req.user!.id } : {}) } })
    await logAcesso(req, { recurso: 'registros', recursoId: r.id, pacienteId: c.pacienteId, acao: 'ESCRITA' })
    res.status(201).json({ id: r.id, nivel: r.nivel, consultaId: r.consultaId, createdAt: r.createdAt })
  }))

  router.get('/clinicas/agenda/:id/registros', clinico, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const c = await carregarConsulta(req, String(req.params.id))
    const papel = papelConsulta(req, c)
    const motivo = qs(req.query.motivo)
    const regs = await prisma.cprRegistroAtendimento.findMany({ where: { tenantId, consultaId: c.id }, orderBy: { createdAt: 'asc' } })
    const out: any[] = []
    for (const r of regs) {
      const autor = r.autorUserId === req.user!.id
      let pode = false, quebra = false
      if (papel === 'SUPERVISOR') pode = true
      else if (papel === 'ALUNO') pode = autor || (r.nivel === 'NORMAL' && c.alunoStudentId === req.user!.studentId)
      else if (papel === 'GESTAO') { if (r.nivel === 'NORMAL') pode = true; else if (motivo && motivo.trim().length >= 15) { pode = true; quebra = true } }
      if (!pode) { await logAcesso(req, { recurso: 'registros', recursoId: r.id, pacienteId: c.pacienteId, acao: 'NEGADO' }); out.push({ id: r.id, nivel: r.nivel, bloqueado: true, createdAt: r.createdAt, mensagem: r.nivel === 'NORMAL' ? 'Sem acesso.' : 'Conteúdo restrito. Acesso excepcional exige justificativa registrada.' }); continue }
      await logAcesso(req, { recurso: 'registros', recursoId: r.id, pacienteId: c.pacienteId, acao: quebra ? 'QUEBRA_SIGILO' : 'LEITURA', motivo: quebra ? motivo : undefined })
      let resumo: string | null = null
      try { resumo = decifrar(r.resumoCifrado) } catch { resumo = null }
      out.push({ id: r.id, nivel: r.nivel, resumo, conduta: r.conduta, autorUserId: r.autorUserId, revisado: !!r.revisadoEm, createdAt: r.createdAt, quebraDeSigilo: quebra })
    }
    res.json({ items: out })
  }))

  router.patch('/clinicas/registros/:rid/nivel', requireRole('TEACHER', 'COORDINATOR'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const r = await exigir(prisma.cprRegistroAtendimento.findFirst({ where: { id: String(req.params.rid), tenantId } }), 'Registro não encontrado.')
    const c = await carregarConsulta(req, r.consultaId)
    if (c.supervisorUserId !== req.user!.id && !ehSuper(req)) throw httpErr(403, 'Somente o supervisor do atendimento altera o nível de confidencialidade.')
    const b = parseBody(z.object({ nivel: z.enum(NIVEIS) }), req.body)
    await logAcesso(req, { recurso: 'registros', recursoId: r.id, pacienteId: r.pacienteId, acao: 'ESCRITA', motivo: `nível ${r.nivel} -> ${b.nivel}` })
    res.json(await prisma.cprRegistroAtendimento.update({ where: { id: r.id }, data: { nivel: b.nivel }, select: { id: true, nivel: true } }))
  }))

  // ---------------------------------------------------------------- fila de espera
  router.post('/clinicas/fila', recepcao, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(z.object({ pacienteId: zId, animalId: zId.optional(), programId: zId, unidadeId: zId.optional(), prioridade: z.enum(['NORMAL', 'ALTA', 'URGENTE']).default('NORMAL'), categoria: z.string().max(30).default('CONSULTA'), observacao: z.string().max(300).optional() }), req.body)
    const p = await exigir(prisma.cprPaciente.findFirst({ where: { id: b.pacienteId, tenantId } }), 'Paciente não encontrado.', 400)
    if (p.consentimentoStatus !== 'ATIVO' || p.anonimizadoEm) throw httpErr(409, 'Consentimento (LGPD) ausente ou revogado.', 'CONSENTIMENTO_AUSENTE')
    await exigirPrograma(tenantId, b.programId)
    if (b.unidadeId) await exigir(prisma.cprUnidade.findFirst({ where: { id: b.unidadeId, tenantId } }), 'Unidade não encontrada.', 400)
    if (await prisma.cprFila.findFirst({ where: { tenantId, pacienteId: p.id, programId: b.programId, animalId: b.animalId ?? null, status: { in: ['AGUARDANDO', 'CHAMADO'] } } })) throw httpErr(409, 'Já está na fila deste curso.', 'JA_NA_FILA')
    const r = await prisma.cprFila.create({ data: { ...b, tenantId } })
    res.status(201).json(r)
  }))

  router.get('/clinicas/fila', recepcao, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const where: any = { tenantId, status: qs(req.query.status) ?? { in: ['AGUARDANDO', 'CHAMADO'] } }
    const programId = qs(req.query.programId); if (programId) where.programId = programId
    const rows = await prisma.cprFila.findMany({ where, take: 500 })
    rows.sort((a, b) => PESO[a.prioridade] - PESO[b.prioridade] || a.createdAt.getTime() - b.createdAt.getTime())
    const [pacs, ps] = await Promise.all([prisma.cprPaciente.findMany({ where: { tenantId, id: { in: rows.map((r) => r.pacienteId) } }, select: { id: true, nome: true } }), mapaProgramas(tenantId, rows.map((r) => r.programId))])
    res.json({ items: rows.map((r, i) => ({ ...r, posicao: i + 1, paciente: pacs.find((p) => p.id === r.pacienteId)?.nome ?? null, curso: ps.get(r.programId) ?? null, esperaDias: Math.floor((Date.now() - r.createdAt.getTime()) / DIA) })) })
  }))

  router.post('/clinicas/fila/:id/agendar', operacao, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const f = await exigir(prisma.cprFila.findFirst({ where: { id: String(req.params.id), tenantId } }), 'Item da fila não encontrado.')
    if (!['AGUARDANDO', 'CHAMADO'].includes(f.status)) throw httpErr(409, `Item da fila está ${f.status}.`)
    const b = parseBody(schemaConsulta.omit({ pacienteId: true, animalId: true, programId: true }), req.body)
    if (req.user!.role === 'TEACHER' && b.supervisorUserId !== req.user!.id) throw httpErr(403, 'Professores agendam apenas sob a própria supervisão.')
    res.status(201).json(await criarConsulta(req, { ...b, pacienteId: f.pacienteId, animalId: f.animalId ?? undefined, programId: f.programId, filaId: f.id }))
  }))
  router.post('/clinicas/fila/:id/desistir', recepcao, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const f = await exigir(prisma.cprFila.findFirst({ where: { id: String(req.params.id), tenantId } }), 'Item da fila não encontrado.')
    if (!['AGUARDANDO', 'CHAMADO'].includes(f.status)) throw httpErr(409, `Item da fila está ${f.status}.`)
    res.json(await prisma.cprFila.update({ where: { id: f.id }, data: { status: 'DESISTIU' } }))
  }))

  // ---------------------------------------------------------------- painel e relatórios por curso
  router.get('/clinicas/painel', operacao, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const ini = new Date(); ini.setUTCHours(0, 0, 0, 0)
    const fim = new Date(ini.getTime() + DIA)
    const sw: any = req.user!.role === 'TEACHER' ? { supervisorUserId: req.user!.id } : {}
    const [hoje, emAtend, filaN, faltasSemana, semana, pacientes, bloqueados] = await Promise.all([
      prisma.cprConsulta.count({ where: { tenantId, ...sw, inicio: { gte: ini, lt: fim }, status: { notIn: ['CANCELADO', 'REMARCADO'] } } }),
      prisma.cprConsulta.count({ where: { tenantId, ...sw, status: 'EM_ATENDIMENTO' } }),
      prisma.cprFila.count({ where: { tenantId, status: { in: ['AGUARDANDO', 'CHAMADO'] } } }),
      prisma.cprConsulta.count({ where: { tenantId, ...sw, status: 'FALTOU', inicio: { gte: new Date(Date.now() - 7 * DIA) } } }),
      prisma.cprConsulta.count({ where: { tenantId, ...sw, inicio: { gte: new Date(Date.now() - 7 * DIA), lt: fim }, status: { in: ['REALIZADO', 'FALTOU'] } } }),
      prisma.cprPaciente.count({ where: { tenantId, anonimizadoEm: null, tipo: 'PACIENTE' } }),
      prisma.cprPaciente.count({ where: { tenantId, consentimentoStatus: { not: 'ATIVO' }, anonimizadoEm: null } }),
    ])
    res.json({ atendimentosHoje: hoje, emAtendimento: emAtend, filaEspera: filaN, faltasUltimos7Dias: faltasSemana, taxaFaltaSemana: semana ? Math.round((faltasSemana / semana) * 1000) / 10 : 0, pacientes, semConsentimentoAtivo: bloqueados })
  }))

  router.get('/clinicas/relatorios', requireRole('COORDINATOR', 'SECRETARY', 'TEACHER'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const de = new Date(qs(req.query.de) ?? Date.now() - 90 * DIA), ate = new Date(qs(req.query.ate) ?? Date.now() + 30 * DIA)
    const where: any = { tenantId, inicio: { gte: de, lte: ate } }
    const programId = qs(req.query.programId); if (programId) where.programId = programId
    const unidadeId = qs(req.query.unidadeId); if (unidadeId) where.unidadeId = unidadeId
    if (req.user!.role === 'TEACHER') where.supervisorUserId = req.user!.id
    const rows = await prisma.cprConsulta.findMany({ where, select: { id: true, programId: true, unidadeId: true, status: true, inicio: true, createdAt: true, chegouEm: true, iniciadoEm: true, filaId: true, alunoStudentId: true }, take: 20000 })
    const filas = await prisma.cprFila.findMany({ where: { tenantId, id: { in: rows.map((r) => r.filaId).filter(Boolean) as string[] } }, select: { id: true, createdAt: true } })
    const filaMap = new Map(filas.map((f) => [f.id, f.createdAt]))
    const ps = await mapaProgramas(tenantId, rows.map((r) => r.programId))
    const por = new Map<string, any>()
    for (const r of rows) {
      if (!por.has(r.programId)) por.set(r.programId, { programId: r.programId, curso: ps.get(r.programId) ?? '—', total: 0, realizados: 0, faltas: 0, cancelados: 0, remarcados: 0, abertos: 0, esperaFilaDias: [] as number[], esperaSalaMin: [] as number[], alunos: new Set<string>(), meses: {} as Record<string, number> })
      const c = por.get(r.programId)
      c.total++
      if (r.status === 'REALIZADO') c.realizados++; else if (r.status === 'FALTOU') c.faltas++; else if (r.status === 'CANCELADO') c.cancelados++; else if (r.status === 'REMARCADO') c.remarcados++; else c.abertos++
      if (r.status === 'REALIZADO' && r.alunoStudentId) c.alunos.add(r.alunoStudentId)
      if (r.status === 'REALIZADO') { const m = r.inicio.toISOString().slice(0, 7); c.meses[m] = (c.meses[m] ?? 0) + 1 }
      if (r.filaId && filaMap.has(r.filaId)) c.esperaFilaDias.push((r.createdAt.getTime() - filaMap.get(r.filaId)!.getTime()) / DIA)
      if (r.chegouEm && r.iniciadoEm) c.esperaSalaMin.push((r.iniciadoEm.getTime() - r.chegouEm.getTime()) / 60_000)
    }
    const med = (a: number[]) => (a.length ? Math.round((a.reduce((s, v) => s + v, 0) / a.length) * 10) / 10 : null)
    const cursos = [...por.values()].map((c) => ({ programId: c.programId, curso: c.curso, total: c.total, realizados: c.realizados, faltas: c.faltas, cancelados: c.cancelados, remarcados: c.remarcados, abertos: c.abertos, taxaFalta: c.realizados + c.faltas ? Math.round((c.faltas / (c.realizados + c.faltas)) * 1000) / 10 : 0, tempoMedioEsperaFilaDias: med(c.esperaFilaDias), tempoMedioEsperaSalaMin: med(c.esperaSalaMin), alunosAtuantes: c.alunos.size, porMes: c.meses })).sort((a, b) => b.total - a.total)
    const filaAberta = await prisma.cprFila.findMany({ where: { tenantId, status: 'AGUARDANDO', ...(programId ? { programId } : {}) }, select: { createdAt: true, programId: true } })
    if (qs(req.query.formato) === 'csv') {
      const csv = ['curso;total;realizados;faltas;cancelados;taxa_falta_pct;espera_fila_dias;espera_sala_min', ...cursos.map((c) => [c.curso, c.total, c.realizados, c.faltas, c.cancelados, c.taxaFalta, c.tempoMedioEsperaFilaDias ?? '', c.tempoMedioEsperaSalaMin ?? ''].join(';'))].join('\n')
      res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.send(csv); return
    }
    res.json({ periodo: { de, ate }, cursos, fila: { aguardando: filaAberta.length, esperaMediaDias: med(filaAberta.map((f) => (Date.now() - f.createdAt.getTime()) / DIA)) } })
  }))
  void ehSuper
}
