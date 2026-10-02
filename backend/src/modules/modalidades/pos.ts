import { Router, Response } from 'express'
import { z } from 'zod'
import { randomBytes } from 'crypto'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { mountCrud, parseBody, qs, dateISO } from '../core/crud'
import { audit, notify } from '../core/notify'
import { scheduleReminder, cancelReminders, completeReminders } from '../core/reminders'
import { getBranding, brandHeaderHtml, escapeHtml as esc } from '../core/branding'
import { MANAGE, TEACH, getConfig, comTrava } from './common'
import { validarLato, capacidadeOrientador, calcularPrazosStricto, marcosLembrete, progressoStricto, ehStricto, addMeses } from './rules'

const router = Router()
const NIVEL = z.enum(['ESPECIALIZACAO', 'MBA', 'MESTRADO_ACADEMICO', 'MESTRADO_PROFISSIONAL', 'DOUTORADO'])
const POS = ['COORDINATOR', 'SECRETARY'] as const

async function getPos(tenantId: string, id: string) {
  const p = await prisma.modPosPrograma.findFirst({ where: { id, tenantId } })
  if (!p) throw Object.assign(new Error('Programa de pós-graduação não encontrado.'), { status: 404 })
  return p
}

// ---------- Programas ----------
const progSchema = z.object({
  codigo: z.string().min(1), nome: z.string().min(3), nivel: NIVEL, modalidade: z.enum(['PRESENCIAL', 'SEMIPRESENCIAL', 'EAD', 'HIBRIDO']).optional(),
  programId: z.string().optional().nullable(), coordenadorUserId: z.string().optional().nullable(), coordenadorNome: z.string().optional().nullable(),
  cargaHoraria: z.number().int().min(0).optional(), creditosMinimos: z.number().int().min(0).optional(), prazoMaxMeses: z.number().int().min(1).optional().nullable(),
  conceitoCapes: z.number().int().min(1).max(7).optional().nullable(), portariaReconhecimento: z.string().optional().nullable(), areaAvaliacao: z.string().optional().nullable(),
  exigeTcc: z.boolean().optional(), status: z.enum(['EM_ELABORACAO', 'ATIVO', 'SUSPENSO', 'ENCERRADO']).optional(),
})
async function validarPrograma(tenantId: string, d: any, atual?: any) {
  const m = { ...(atual ?? {}), ...d }
  const cfg = await getConfig(tenantId)
  if (m.programId) {
    const p = await prisma.academicProgram.findFirst({ where: { id: m.programId, tenantId } })
    if (!p) throw Object.assign(new Error('Curso acadêmico vinculado não encontrado.'), { status: 404 })
  }
  if (!ehStricto(m.nivel)) {
    if ((m.cargaHoraria ?? 0) < cfg.cargaMinimaLato && (m.status ?? 'EM_ELABORACAO') === 'ATIVO')
      throw Object.assign(new Error(`Lato sensu exige no mínimo ${cfg.cargaMinimaLato}h para ativar o programa.`), { status: 422 })
    d.prazoMaxMeses = d.prazoMaxMeses ?? cfg.prazoMaxMesesLato
  } else {
    if (!m.creditosMinimos && (m.status ?? '') === 'ATIVO') throw Object.assign(new Error('Stricto sensu exige créditos mínimos definidos.'), { status: 422 })
    d.prazoMaxMeses = d.prazoMaxMeses ?? (m.nivel === 'DOUTORADO' ? cfg.prazoMaxMesesDoutorado : cfg.prazoMaxMesesMestrado)
  }
  return d
}
mountCrud(router, {
  model: 'modPosPrograma', path: '/pos/programas', read: [...TEACH], write: [...POS], create: progSchema, search: ['nome', 'codigo'], filters: ['nivel', 'status', 'modalidade'], orderBy: { nome: 'asc' }, modulo: 'modalidades',
  include: { _count: { select: { alunos: true, docentes: true, turmas: true } } },
  beforeCreate: (d, req) => validarPrograma(getTenantId(req), d),
  beforeUpdate: (d, req, cur) => validarPrograma(getTenantId(req), d, cur),
})

// Conformidade do programa (lato: carga mínima e módulos; stricto: docentes, linhas, créditos, orientadores).
router.get('/pos/programas/:id/conformidade', requireRole(...TEACH), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const p = await getPos(tenantId, String(req.params.id))
  const cfg = await getConfig(tenantId)
  const [modulos, docentes, linhas, areas, discs, orient] = await Promise.all([
    prisma.modPosModulo.findMany({ where: { tenantId, posId: p.id } }),
    prisma.modPosDocente.findMany({ where: { tenantId, posId: p.id, ativo: true } }),
    prisma.modPosLinha.count({ where: { tenantId, posId: p.id } }),
    prisma.modPosArea.count({ where: { tenantId, posId: p.id } }),
    prisma.modPosDisciplina.findMany({ where: { tenantId, posId: p.id } }),
    prisma.modPosAluno.groupBy({ by: ['orientadorId'], where: { tenantId, posId: p.id, status: { in: ['MATRICULADO', 'QUALIFICADO'] } }, _count: true }),
  ])
  if (!ehStricto(p.nivel)) {
    const v = validarLato({ cargaHoraria: p.cargaHoraria, modulos, exigeTcc: p.exigeTcc, docentes }, cfg.cargaMinimaLato)
    return res.json({ nivel: p.nivel, tipo: 'LATO', ...v })
  }
  const alertas: any[] = []
  if (!areas) alertas.push({ codigo: 'SEM_AREA', severidade: 'ATENCAO', mensagem: 'Nenhuma área de concentração cadastrada.' })
  if (!linhas) alertas.push({ codigo: 'SEM_LINHA', severidade: 'CRITICO', mensagem: 'Nenhuma linha de pesquisa cadastrada.' })
  const permanentes = docentes.filter((d) => d.categoria === 'PERMANENTE' && d.titulacao !== 'ESPECIALISTA')
  if (permanentes.length < 3) alertas.push({ codigo: 'POUCOS_PERMANENTES', severidade: 'CRITICO', mensagem: `Apenas ${permanentes.length} docente(s) permanente(s) (mínimo recomendado: 3).` })
  const credOfertados = discs.reduce((s, d) => s + d.creditos, 0)
  if (p.creditosMinimos && credOfertados < p.creditosMinimos) alertas.push({ codigo: 'CREDITOS_INSUFICIENTES', severidade: 'CRITICO', mensagem: `Disciplinas somam ${credOfertados} créditos; mínimo exigido ${p.creditosMinimos}.` })
  for (const o of orient) {
    const d = docentes.find((x) => x.id === o.orientadorId)
    if (d && o._count > Math.min(d.capacidadeOrientandos, cfg.maxOrientandosPorDocente))
      alertas.push({ codigo: 'ORIENTADOR_SOBRECARGA', severidade: 'ATENCAO', mensagem: `${d.nome} orienta ${o._count} alunos (limite ${Math.min(d.capacidadeOrientandos, cfg.maxOrientandosPorDocente)}).` })
  }
  res.json({ nivel: p.nivel, tipo: 'STRICTO', conforme: !alertas.some((a) => a.severidade === 'CRITICO'), creditosOfertados: credOfertados, docentesPermanentes: permanentes.length, alertas })
}))

// Sub-recursos do programa (CRUD simples)
const posId = z.string().min(1)
const chk = async (d: any, req: AuthenticatedRequest) => { await getPos(getTenantId(req), d.posId); return d }
mountCrud(router, { model: 'modPosArea', path: '/pos/areas', read: [...TEACH], write: [...POS], create: z.object({ posId, nome: z.string().min(2), descricao: z.string().optional().nullable() }), filters: ['posId'], beforeCreate: chk, modulo: 'modalidades' })
mountCrud(router, { model: 'modPosLinha', path: '/pos/linhas', read: [...TEACH], write: [...POS], create: z.object({ posId, areaId: z.string().optional().nullable(), nome: z.string().min(2), descricao: z.string().optional().nullable() }), filters: ['posId', 'areaId'], beforeCreate: chk, modulo: 'modalidades' })
mountCrud(router, { model: 'modPosModulo', path: '/pos/modulos', read: [...TEACH], write: [...POS], create: z.object({ posId, ordem: z.number().int().min(1).optional(), nome: z.string().min(2), cargaHoraria: z.number().int().min(1), disciplineId: z.string().optional().nullable(), docenteId: z.string().optional().nullable() }), filters: ['posId'], orderBy: { ordem: 'asc' }, beforeCreate: chk, modulo: 'modalidades' })
mountCrud(router, { model: 'modPosDisciplina', path: '/pos/disciplinas', read: [...TEACH, 'STUDENT'], write: [...POS], create: z.object({ posId, disciplineId: z.string().optional().nullable(), codigo: z.string().min(1), nome: z.string().min(2), creditos: z.number().int().min(0).optional(), cargaHoraria: z.number().int().min(0).optional(), obrigatoria: z.boolean().optional(), areaId: z.string().optional().nullable() }), filters: ['posId', 'obrigatoria'], beforeCreate: chk, modulo: 'modalidades',
  // regra: no Brasil 1 crédito = 15h (padrão CAPES); sugere carga coerente
  beforeUpdate: (d) => d })
mountCrud(router, { model: 'modPosColegiado', path: '/pos/colegiado', read: [...TEACH], write: [...POS], create: z.object({ posId, userId: z.string().optional().nullable(), nome: z.string().min(2), papel: z.enum(['COORDENADOR', 'VICE', 'MEMBRO', 'REPR_DISCENTE', 'SECRETARIO']).optional(), inicio: dateISO().optional(), fim: dateISO().optional().nullable() }), filters: ['posId', 'papel'], beforeCreate: chk, modulo: 'modalidades',
  afterCreate: async (row, req) => { if (row.fim) await scheduleReminder({ tenantId: getTenantId(req), modulo: 'modalidades', titulo: `Fim do mandato no colegiado: ${row.nome} (${row.papel})`, dueAt: row.fim, antecedenciaDias: 60, assigneeRole: 'COORDINATOR', refType: 'ModPosColegiado', refId: row.id, dedupeKey: `mod-colegiado-${row.id}` }) } })
mountCrud(router, { model: 'modPosDocente', path: '/pos/docentes', read: [...TEACH], write: [...POS], create: z.object({ posId, userId: z.string().optional().nullable(), nome: z.string().min(2), titulacao: z.enum(['ESPECIALISTA', 'MESTRE', 'DOUTOR', 'POS_DOUTOR']).optional(), categoria: z.enum(['PERMANENTE', 'COLABORADOR', 'VISITANTE']).optional(), orientador: z.boolean().optional(), capacidadeOrientandos: z.number().int().min(0).optional(), linhaId: z.string().optional().nullable(), lattes: z.string().optional().nullable(), ativo: z.boolean().optional() }), filters: ['posId', 'orientador', 'categoria', 'ativo'], search: ['nome'], modulo: 'modalidades',
  beforeCreate: async (d, req) => {
    const p = await getPos(getTenantId(req), d.posId)
    if (d.orientador && ehStricto(p.nivel) && !['DOUTOR', 'POS_DOUTOR'].includes(d.titulacao ?? 'DOUTOR')) throw Object.assign(new Error('Orientador de stricto sensu deve ser doutor.'), { status: 422 })
    return d
  } })

// Turmas (lato) / ingressos
mountCrud(router, { model: 'modPosTurma', path: '/pos/turmas', read: [...TEACH], write: [...POS], create: z.object({ posId, codigo: z.string().min(1), inicio: dateISO(), fim: dateISO().optional().nullable(), vagas: z.number().int().min(1).optional(), valorMensalidade: z.number().min(0).optional().nullable(), parcelas: z.number().int().min(1).optional().nullable(), status: z.enum(['PLANEJADA', 'INSCRICOES', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA']).optional() }), filters: ['posId', 'status'], orderBy: { inicio: 'desc' }, beforeCreate: async (d, req) => {
  await getPos(getTenantId(req), d.posId)
  if (d.fim && d.fim <= d.inicio) throw Object.assign(new Error('Fim deve ser posterior ao início.'), { status: 422 })
  return d }, modulo: 'modalidades' })

// ---------- Alunos de pós ----------
router.post('/pos/alunos', requireRole(...POS), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(z.object({ posId, studentId: z.string(), turmaId: z.string().optional(), orientadorId: z.string().optional(), coorientadorId: z.string().optional(), linhaId: z.string().optional(), ingressoEm: dateISO().optional() }), req.body)
  const p = await getPos(tenantId, b.posId)
  if (p.status === 'ENCERRADO' || p.status === 'SUSPENSO') return res.status(422).json({ error: `Programa ${p.status}: não aceita novos alunos.` })
  const st = await prisma.student.findFirst({ where: { id: b.studentId, tenantId } })
  if (!st) return res.status(404).json({ error: 'Aluno não encontrado.' })
  const cfg = await getConfig(tenantId)
  const turma = b.turmaId ? await prisma.modPosTurma.findFirst({ where: { id: b.turmaId, tenantId, posId: p.id } }) : null
  if (b.turmaId && !turma) return res.status(404).json({ error: 'Turma não encontrada neste programa.' })
  const orient = b.orientadorId ? await prisma.modPosDocente.findFirst({ where: { id: b.orientadorId, tenantId, posId: p.id } }) : null
  if (b.orientadorId && !orient) return res.status(404).json({ error: 'Orientador não encontrado neste programa.' })
  const ingressoEm = b.ingressoEm ?? new Date()
  const data: any = { tenantId, posId: p.id, studentId: b.studentId, turmaId: b.turmaId, orientadorId: b.orientadorId, coorientadorId: b.coorientadorId, linhaId: b.linhaId, ingressoEm }
  if (ehStricto(p.nivel)) {
    Object.assign(data, calcularPrazosStricto(ingressoEm, p.prazoMaxMeses ?? (p.nivel === 'DOUTORADO' ? cfg.prazoMaxMesesDoutorado : cfg.prazoMaxMesesMestrado)))
  } else {
    data.prazoDeposito = addMeses(ingressoEm, p.prazoMaxMeses ?? cfg.prazoMaxMesesLato)
  }
  // vagas da turma, capacidade do orientador e duplicidade são checadas sob lock (requisições simultâneas)
  const resultado = await comTrava(`mod-pos:${p.id}`, async (tx) => {
    const dup = await tx.modPosAluno.findFirst({ where: { tenantId, posId: p.id, studentId: b.studentId, status: { notIn: ['DESLIGADO', 'TITULADO'] } }, select: { id: true } })
    if (dup) throw Object.assign(new Error('Aluno já possui matrícula ativa neste programa.'), { status: 409 })
    if (turma) {
      const n = await tx.modPosAluno.count({ where: { tenantId, turmaId: turma.id, status: { notIn: ['DESLIGADO', 'TRANCADO'] } } })
      if (n >= turma.vagas) throw Object.assign(new Error('Turma sem vagas.'), { status: 422 })
    }
    if (orient) {
      const atuais = await tx.modPosAluno.count({ where: { tenantId, orientadorId: orient.id, status: { in: ['MATRICULADO', 'QUALIFICADO'] } } })
      const cap = capacidadeOrientador(orient, atuais, cfg.maxOrientandosPorDocente)
      if (!cap.podeOrientar) throw Object.assign(new Error('Orientador indisponível (não é orientador ativo ou sem vagas).'), { status: 422, capacidade: cap })
    }
    return tx.modPosAluno.create({ data })
  })
  const row = resultado
  await agendarLembretesPrazos(tenantId, row, st.nomeCompleto)
  await audit({ tenantId, userId: getUserId(req), modulo: 'modalidades', acao: 'MATRICULAR_POS', refType: 'ModPosAluno', refId: row.id })
  res.status(201).json(row)
}))

async function agendarLembretesPrazos(tenantId: string, a: any, nome: string) {
  const alvos: Array<[string, Date | null, boolean]> = [['Qualificação', a.prazoQualificacao, !a.qualificadoEm], ['Defesa', a.prazoDefesa, !a.defendidoEm], ['Depósito da versão final', a.prazoDeposito, !a.depositadoEm]]
  for (const [titulo, prazo, aberto] of alvos) {
    if (!prazo || !aberto) continue
    const marcos = marcosLembrete(prazo)
    for (const m of marcos) {
      await scheduleReminder({
        tenantId, modulo: 'modalidades', titulo: `${titulo} de ${nome} em ${m.diasAntes} dia(s)`, dueAt: prazo, remindAt: m.remindAt, severity: m.severity,
        assigneeRole: 'COORDINATOR', refType: 'ModPosAluno', refId: a.id, dedupeKey: `mod-pos-${a.id}-${titulo[0]}-${m.diasAntes}`,
      })
    }
    // prazo vencido sem marco futuro: lembrete imediato crítico
    if (marcos.length === 0) await scheduleReminder({ tenantId, modulo: 'modalidades', titulo: `${titulo} de ${nome}: PRAZO VENCIDO`, dueAt: prazo, remindAt: new Date(), severity: 'CRITICO', assigneeRole: 'COORDINATOR', refType: 'ModPosAluno', refId: a.id, dedupeKey: `mod-pos-${a.id}-${titulo[0]}-venc`, recorrenciaDias: 7 })
  }
}

router.get('/pos/alunos', requireRole(...TEACH), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const where: any = { tenantId }
  for (const f of ['posId', 'status', 'orientadorId', 'turmaId', 'studentId']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
  const items = await prisma.modPosAluno.findMany({ where, orderBy: { ingressoEm: 'desc' }, take: 300 })
  res.json({ items })
}))
router.get('/pos/alunos/:id', requireRole(...TEACH), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const a = await prisma.modPosAluno.findFirst({ where: { id: String(req.params.id), tenantId }, include: { bancas: true, bolsas: true, pos: true } })
  if (!a) return res.status(404).json({ error: 'Aluno de pós não encontrado.' })
  res.json({ ...a, progresso: progressoStricto(a, a.pos.creditosMinimos) })
}))
router.patch('/pos/alunos/:id', requireRole(...POS), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(z.object({ orientadorId: z.string().nullable().optional(), coorientadorId: z.string().nullable().optional(), linhaId: z.string().nullable().optional(), creditosCumpridos: z.number().int().min(0).optional(), cargaCumprida: z.number().int().min(0).optional(), tccTitulo: z.string().optional(), tccStatus: z.enum(['NAO_INICIADO', 'EM_ELABORACAO', 'ENTREGUE', 'APROVADO', 'REPROVADO']).optional(), prazoQualificacao: dateISO().optional(), prazoDefesa: dateISO().optional(), prazoDeposito: dateISO().optional() }), req.body)
  const a = await prisma.modPosAluno.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!a) return res.status(404).json({ error: 'Aluno de pós não encontrado.' })
  if (b.orientadorId && b.orientadorId !== a.orientadorId) {
    const d = await prisma.modPosDocente.findFirst({ where: { id: b.orientadorId, tenantId, posId: a.posId } })
    if (!d) return res.status(404).json({ error: 'Orientador não encontrado.' })
    const cfg = await getConfig(tenantId)
    const atuais = await prisma.modPosAluno.count({ where: { tenantId, orientadorId: d.id, status: { in: ['MATRICULADO', 'QUALIFICADO'] } } })
    if (!capacidadeOrientador(d, atuais, cfg.maxOrientandosPorDocente).podeOrientar) return res.status(422).json({ error: 'Orientador sem capacidade.' })
  }
  const row = await prisma.modPosAluno.update({ where: { id: a.id }, data: b as any })
  if (b.prazoQualificacao || b.prazoDefesa || b.prazoDeposito) {
    const st = await prisma.student.findFirst({ where: { id: a.studentId }, select: { nomeCompleto: true } })
    await agendarLembretesPrazos(tenantId, row, st?.nomeCompleto ?? a.studentId)
  }
  res.json(row)
}))

// Prorrogação de prazo (colegiado)
router.post('/pos/alunos/:id/prorrogar', requireRole(...POS), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(z.object({ meses: z.number().int().min(1).max(12), justificativa: z.string().min(5) }), req.body)
  const a = await prisma.modPosAluno.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!a) return res.status(404).json({ error: 'Aluno de pós não encontrado.' })
  if (['TITULADO', 'DESLIGADO'].includes(a.status)) return res.status(409).json({ error: 'Aluno já titulado/desligado.' })
  const patch: any = {}
  if (a.prazoDefesa && !a.defendidoEm) patch.prazoDefesa = addMeses(a.prazoDefesa, b.meses)
  if (a.prazoDeposito) patch.prazoDeposito = addMeses(a.prazoDeposito, b.meses)
  if (a.prazoQualificacao && !a.qualificadoEm) patch.prazoQualificacao = addMeses(a.prazoQualificacao, b.meses)
  const row = await prisma.modPosAluno.update({ where: { id: a.id }, data: patch })
  await cancelReminders({ tenantId, refType: 'ModPosAluno', refId: a.id })
  const st = await prisma.student.findFirst({ where: { id: a.studentId }, select: { nomeCompleto: true } })
  await agendarLembretesPrazos(tenantId, row, st?.nomeCompleto ?? a.studentId)
  await audit({ tenantId, userId: getUserId(req), modulo: 'modalidades', acao: 'PRORROGAR_PRAZO', refType: 'ModPosAluno', refId: a.id, detalhes: b })
  res.json(row)
}))

// Trancamento / desligamento
router.post('/pos/alunos/:id/situacao', requireRole(...POS), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(z.object({ status: z.enum(['TRANCADO', 'DESLIGADO', 'MATRICULADO']), motivo: z.string().min(3) }), req.body)
  const a = await prisma.modPosAluno.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!a) return res.status(404).json({ error: 'Aluno de pós não encontrado.' })
  if (a.status === 'TITULADO') return res.status(409).json({ error: 'Aluno titulado não pode ter situação alterada.' })
  if (b.status === 'MATRICULADO' && a.status !== 'TRANCADO') return res.status(422).json({ error: 'Só é possível reativar aluno trancado.' })
  const row = await prisma.modPosAluno.update({ where: { id: a.id }, data: { status: b.status } })
  if (b.status !== 'MATRICULADO') { await cancelReminders({ tenantId, refType: 'ModPosAluno', refId: a.id }); await prisma.modPosBolsa.updateMany({ where: { alunoId: a.id, status: 'ATIVA' }, data: { status: b.status === 'DESLIGADO' ? 'CANCELADA' : 'SUSPENSA' } }) }
  await audit({ tenantId, userId: getUserId(req), modulo: 'modalidades', acao: 'SITUACAO_POS', refType: 'ModPosAluno', refId: a.id, detalhes: b })
  res.json(row)
}))

// ---------- Bancas (qualificação / defesa / TCC) ----------
router.post('/pos/bancas', requireRole(...POS), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(z.object({ alunoId: z.string(), tipo: z.enum(['QUALIFICACAO', 'DEFESA', 'TCC']), dataHora: dateISO(), local: z.string().optional(), membros: z.array(z.object({ nome: z.string(), instituicao: z.string().optional(), papel: z.string().optional() })).min(1) }), req.body)
  const a = await prisma.modPosAluno.findFirst({ where: { id: b.alunoId, tenantId }, include: { pos: true } })
  if (!a) return res.status(404).json({ error: 'Aluno de pós não encontrado.' })
  if (['TRANCADO', 'DESLIGADO', 'TITULADO'].includes(a.status)) return res.status(422).json({ error: `Aluno ${a.status}: não é possível agendar banca.` })
  if (b.tipo === 'DEFESA' && ehStricto(a.pos.nivel) && !a.qualificadoEm) return res.status(422).json({ error: 'Defesa exige qualificação aprovada.' })
  if (b.tipo === 'DEFESA' && ehStricto(a.pos.nivel)) {
    const min = a.pos.nivel === 'DOUTORADO' ? 5 : 3
    if (b.membros.length < min) return res.status(422).json({ error: `Banca de defesa de ${a.pos.nivel.toLowerCase()} exige no mínimo ${min} membros.` })
  }
  if (b.tipo === 'QUALIFICACAO' && !ehStricto(a.pos.nivel)) return res.status(422).json({ error: 'Qualificação é exclusiva de stricto sensu.' })
  const row = await prisma.modPosBanca.create({ data: { tenantId, alunoId: a.id, tipo: b.tipo, dataHora: b.dataHora, local: b.local, membros: b.membros as any } })
  await scheduleReminder({ tenantId, modulo: 'modalidades', titulo: `Banca de ${b.tipo.toLowerCase()} em ${b.dataHora.toLocaleString('pt-BR')}`, dueAt: b.dataHora, antecedenciaDias: 7, severity: 'ATENCAO', assigneeRole: 'COORDINATOR', refType: 'ModPosBanca', refId: row.id, dedupeKey: `mod-banca-${row.id}` })
  await notify({ tenantId, studentId: a.studentId, assunto: `Banca agendada: ${b.tipo}`, mensagem: `Sua banca de ${b.tipo.toLowerCase()} foi agendada para ${b.dataHora.toLocaleString('pt-BR')}${b.local ? ' em ' + b.local : ''}.`, refType: 'ModPosBanca', refId: row.id })
  res.status(201).json(row)
}))
router.get('/pos/bancas', requireRole(...TEACH), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const where: any = { tenantId }
  const al = qs(req.query.alunoId); if (al) where.alunoId = al
  const tp = qs(req.query.tipo); if (tp) where.tipo = tp
  res.json({ items: await prisma.modPosBanca.findMany({ where, orderBy: { dataHora: 'asc' }, take: 200 }) })
}))
// Registrar resultado: atualiza o status do aluno (máquina de estados).
router.post('/pos/bancas/:id/resultado', requireRole(...POS), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(z.object({ resultado: z.enum(['APROVADO', 'APROVADO_COM_RESSALVAS', 'REPROVADO']), nota: z.number().min(0).max(10).optional(), ataUrl: z.string().optional() }), req.body)
  const banca = await prisma.modPosBanca.findFirst({ where: { id: String(req.params.id), tenantId }, include: { aluno: { include: { pos: true } } } })
  if (!banca) return res.status(404).json({ error: 'Banca não encontrada.' })
  if (banca.realizada) return res.status(409).json({ error: 'Resultado já registrado.' })
  if (['TRANCADO', 'DESLIGADO', 'TITULADO'].includes(banca.aluno.status)) return res.status(422).json({ error: `Aluno ${banca.aluno.status}: não é possível registrar resultado de banca.` })
  const a = banca.aluno
  const aprovado = b.resultado !== 'REPROVADO'
  const patch: any = {}
  if (aprovado) {
    if (banca.tipo === 'QUALIFICACAO') { patch.qualificadoEm = banca.dataHora; patch.status = 'QUALIFICADO' }
    else if (banca.tipo === 'DEFESA') { patch.defendidoEm = banca.dataHora; patch.status = 'DEFENDIDO'; patch.tccStatus = 'APROVADO' }
    else { patch.tccStatus = 'APROVADO'; patch.defendidoEm = banca.dataHora }
  } else if (banca.tipo !== 'QUALIFICACAO') patch.tccStatus = 'REPROVADO'
  await prisma.$transaction([
    prisma.modPosBanca.update({ where: { id: banca.id }, data: { resultado: b.resultado, nota: b.nota, ataUrl: b.ataUrl, realizada: true } }),
    prisma.modPosAluno.update({ where: { id: a.id }, data: patch }),
  ])
  await completeReminders({ tenantId, refType: 'ModPosBanca', refId: banca.id, userId: getUserId(req) })
  // conclui lembretes do prazo correspondente
  const prefix = banca.tipo === 'QUALIFICACAO' ? 'Q' : 'D'
  if (aprovado) await prisma.eduReminder.updateMany({ where: { tenantId, refType: 'ModPosAluno', refId: a.id, dedupeKey: { startsWith: `mod-pos-${a.id}-${prefix}-` }, status: { in: ['PENDENTE', 'NOTIFICADO', 'ADIADO'] } }, data: { status: 'CONCLUIDO', concluidoEm: new Date() } })
  if (!aprovado) await notify({ tenantId, assunto: `Banca reprovada`, mensagem: `Banca de ${banca.tipo} reprovada para o aluno de pós ${a.id}. Avaliar nova banca/prorrogação.`, refType: 'ModPosBanca', refId: banca.id })
  res.json({ ok: true, aluno: patch })
}))

// Depósito da versão final e titulação (stricto exige depósito; lato exige carga + TCC aprovado)
router.post('/pos/alunos/:id/depositar', requireRole(...POS), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const a = await prisma.modPosAluno.findFirst({ where: { id: String(req.params.id), tenantId }, include: { pos: true } })
  if (!a) return res.status(404).json({ error: 'Aluno de pós não encontrado.' })
  if (!a.defendidoEm) return res.status(422).json({ error: 'Depósito exige defesa aprovada.' })
  const row = await prisma.modPosAluno.update({ where: { id: a.id }, data: { depositadoEm: new Date() } })
  await prisma.eduReminder.updateMany({ where: { tenantId, refType: 'ModPosAluno', refId: a.id, dedupeKey: { startsWith: `mod-pos-${a.id}-D` }, status: { in: ['PENDENTE', 'NOTIFICADO', 'ADIADO'] } }, data: { status: 'CONCLUIDO', concluidoEm: new Date() } })
  res.json(row)
}))
router.post('/pos/alunos/:id/titular', requireRole(...POS), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const a = await prisma.modPosAluno.findFirst({ where: { id: String(req.params.id), tenantId }, include: { pos: true } })
  if (!a) return res.status(404).json({ error: 'Aluno de pós não encontrado.' })
  if (a.status === 'TITULADO') return res.status(409).json({ error: 'Já titulado.' })
  if (['TRANCADO', 'DESLIGADO'].includes(a.status)) return res.status(422).json({ error: `Aluno ${a.status}.` })
  const cfg = await getConfig(tenantId)
  const faltas: string[] = []
  if (ehStricto(a.pos.nivel)) {
    const pr = progressoStricto(a, a.pos.creditosMinimos)
    for (const e of pr.etapas) if (!e.ok) faltas.push(e.chave)
  } else {
    if (a.cargaCumprida < Math.max(a.pos.cargaHoraria, cfg.cargaMinimaLato)) faltas.push(`CARGA_HORARIA (${a.cargaCumprida}/${Math.max(a.pos.cargaHoraria, cfg.cargaMinimaLato)}h)`)
    if (a.pos.exigeTcc && a.tccStatus !== 'APROVADO') faltas.push('TCC_APROVADO')
  }
  if (faltas.length) return res.status(422).json({ error: 'Pendências para titulação.', pendencias: faltas })
  const codigo = `POS-${new Date().getFullYear()}-${randomBytes(4).toString('hex').toUpperCase()}`
  const row = await prisma.modPosAluno.update({ where: { id: a.id }, data: { status: 'TITULADO', tituladoEm: new Date(), certificadoEmitidoEm: new Date(), certificadoCodigo: codigo } })
  await cancelReminders({ tenantId, refType: 'ModPosAluno', refId: a.id })
  await prisma.modPosBolsa.updateMany({ where: { alunoId: a.id, status: 'ATIVA' }, data: { status: 'ENCERRADA' } })
  await notify({ tenantId, studentId: a.studentId, assunto: 'Parabéns! Titulação concluída', mensagem: `Você concluiu ${a.pos.nome}. Código do certificado: ${codigo}.`, refType: 'ModPosAluno', refId: a.id })
  await audit({ tenantId, userId: getUserId(req), modulo: 'modalidades', acao: 'TITULAR', refType: 'ModPosAluno', refId: a.id, detalhes: { codigo } })
  res.json(row)
}))

// Certificado HTML (lato: certificado de especialização; stricto: declaração de conclusão) com espaço para logomarca.
router.get('/pos/alunos/:id/certificado', requireRole(...TEACH, 'STUDENT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const a = await prisma.modPosAluno.findFirst({ where: { id: String(req.params.id), tenantId, ...(req.user?.role === 'STUDENT' ? { studentId: req.user.studentId ?? '__none__' } : {}) }, include: { pos: true } })
  if (!a) return res.status(404).json({ error: 'Aluno de pós não encontrado.' })
  if (a.status !== 'TITULADO') return res.status(422).json({ error: 'Certificado disponível apenas após a titulação.' })
  const [br, st, mods] = await Promise.all([getBranding(tenantId), prisma.student.findFirst({ where: { id: a.studentId } }), prisma.modPosModulo.findMany({ where: { tenantId, posId: a.posId }, orderBy: { ordem: 'asc' } })])
  const titulo = ehStricto(a.pos.nivel) ? `Diploma de ${a.pos.nivel.replace(/_/g, ' ')}` : `Certificado de ${a.pos.nivel === 'MBA' ? 'MBA' : 'Pós-graduação Lato Sensu — Especialização'}`
  const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>${esc(titulo)}</title><body style="font-family:Georgia,serif;max-width:900px;margin:24px auto;border:6px double ${esc(br.cores.primaria)}">
${brandHeaderHtml(br, { titulo, subtitulo: a.pos.nome })}
<main style="padding:40px 56px;text-align:center;line-height:1.8">
<p>Certificamos que <strong style="font-size:22px">${esc(st?.nomeCompleto ?? a.studentId)}</strong> concluiu, em ${a.tituladoEm?.toLocaleDateString('pt-BR')}, o curso de <strong>${esc(a.pos.nome)}</strong>${a.pos.cargaHoraria ? `, com carga horária de <strong>${a.pos.cargaHoraria} horas</strong>` : ''}${a.tccTitulo ? `, tendo apresentado o trabalho "<em>${esc(a.tccTitulo)}</em>"` : ''}.</p>
${mods.length ? `<h4>Módulos cursados</h4><table style="margin:0 auto;font-size:13px;border-collapse:collapse">${mods.map((m) => `<tr><td style="padding:2px 12px;text-align:left">${esc(m.nome)}</td><td style="padding:2px 12px">${m.cargaHoraria}h</td></tr>`).join('')}</table>` : ''}
<p style="margin-top:48px">${esc(br.reitorNome ?? '')}<br/><small>${esc(br.reitorCargo ?? '')}</small></p>
<p style="font-size:11px;color:#64748b">Código de autenticidade: ${esc(a.certificadoCodigo ?? '')}${a.pos.portariaReconhecimento ? ' · ' + esc(a.pos.portariaReconhecimento) : ''}</p>
</main></body></html>`
  res.type('html').send(html)
}))

// ---------- Bolsas ----------
router.post('/pos/bolsas', requireRole(...POS, 'FINANCE'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(z.object({ alunoId: z.string(), agencia: z.enum(['CAPES', 'CNPQ', 'FAPESP', 'FAP', 'INSTITUCIONAL', 'OUTRA']), modalidadeBolsa: z.string().optional(), valorMensal: z.number().positive(), inicio: dateISO(), fim: dateISO(), observacao: z.string().optional() }), req.body)
  const a = await prisma.modPosAluno.findFirst({ where: { id: b.alunoId, tenantId }, include: { pos: true } })
  if (!a) return res.status(404).json({ error: 'Aluno de pós não encontrado.' })
  if (!ehStricto(a.pos.nivel) && b.agencia === 'CAPES') return res.status(422).json({ error: 'Bolsas CAPES são exclusivas de programas stricto sensu.' })
  if (['DESLIGADO', 'TITULADO', 'TRANCADO'].includes(a.status)) return res.status(422).json({ error: `Aluno ${a.status} não pode receber bolsa.` })
  if (b.fim <= b.inicio) return res.status(422).json({ error: 'Fim deve ser posterior ao início.' })
  // regra CAPES: vedado acúmulo de bolsas de agências de fomento
  const fomento = ['CAPES', 'CNPQ', 'FAPESP', 'FAP']
  if (fomento.includes(b.agencia)) {
    const outra = await prisma.modPosBolsa.findFirst({ where: { tenantId, alunoId: a.id, status: 'ATIVA', agencia: { in: fomento }, inicio: { lt: b.fim }, fim: { gt: b.inicio } } })
    if (outra) return res.status(409).json({ error: `Acúmulo vedado: aluno já possui bolsa ${outra.agencia} no período.` })
  }
  const row = await prisma.modPosBolsa.create({ data: { tenantId, alunoId: a.id, agencia: b.agencia, modalidadeBolsa: b.modalidadeBolsa, valorMensal: b.valorMensal, inicio: b.inicio, fim: b.fim, observacao: b.observacao } })
  for (const [dias, sev] of [[60, 'INFO'], [30, 'ATENCAO'], [7, 'CRITICO']] as const)
    await scheduleReminder({ tenantId, modulo: 'modalidades', titulo: `Bolsa ${b.agencia} vence em ${dias} dia(s) — renovar ou encerrar`, dueAt: b.fim, remindAt: new Date(b.fim.getTime() - dias * 86_400_000), severity: sev, assigneeRole: 'COORDINATOR', refType: 'ModPosBolsa', refId: row.id, dedupeKey: `mod-bolsa-${row.id}-${dias}` })
  await audit({ tenantId, userId: getUserId(req), modulo: 'modalidades', acao: 'CRIAR_BOLSA', refType: 'ModPosBolsa', refId: row.id })
  res.status(201).json(row)
}))
router.get('/pos/bolsas', requireRole(...TEACH, 'FINANCE'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const where: any = { tenantId }
  for (const f of ['alunoId', 'agencia', 'status']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
  const items = await prisma.modPosBolsa.findMany({ where, orderBy: { fim: 'asc' }, take: 300 })
  const ativas = items.filter((i) => i.status === 'ATIVA')
  res.json({ items, resumo: { ativas: ativas.length, custoMensalAtivo: ativas.reduce((s, i) => s + Number(i.valorMensal), 0) } })
}))
router.post('/pos/bolsas/:id/situacao', requireRole(...POS, 'FINANCE'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(z.object({ status: z.enum(['SUSPENSA', 'ENCERRADA', 'CANCELADA', 'ATIVA']), observacao: z.string().optional() }), req.body)
  const bolsa = await prisma.modPosBolsa.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!bolsa) return res.status(404).json({ error: 'Bolsa não encontrada.' })
  if (['ENCERRADA', 'CANCELADA'].includes(bolsa.status)) return res.status(409).json({ error: 'Bolsa já finalizada.' })
  const row = await prisma.modPosBolsa.update({ where: { id: bolsa.id }, data: { status: b.status, observacao: b.observacao ?? bolsa.observacao } })
  if (['ENCERRADA', 'CANCELADA'].includes(b.status)) await cancelReminders({ tenantId, refType: 'ModPosBolsa', refId: bolsa.id })
  res.json(row)
}))

// ---------- Ofertas para Admissões ----------
mountCrud(router, { model: 'modPosOferta', path: '/pos/ofertas', read: [...TEACH, 'ADMISSIONS', 'MARKETING'], write: [...POS], create: z.object({ posId, turmaId: z.string().optional().nullable(), titulo: z.string().min(3), vagas: z.number().int().min(1), valor: z.number().min(0).optional().nullable(), inscricoesDe: dateISO().optional().nullable(), inscricoesAte: dateISO().optional().nullable(), requisitos: z.string().optional().nullable(), admOfertaId: z.string().optional().nullable() }), filters: ['posId', 'status', 'turmaId'], modulo: 'modalidades',
  beforeCreate: async (d, req) => {
    const tenantId = getTenantId(req)
    await getPos(tenantId, d.posId)
    if (d.turmaId) { const t = await prisma.modPosTurma.findFirst({ where: { id: d.turmaId, tenantId, posId: d.posId } }); if (!t) throw Object.assign(new Error('Turma inválida para este programa.'), { status: 422 }) }
    if (d.inscricoesDe && d.inscricoesAte && d.inscricoesAte <= d.inscricoesDe) throw Object.assign(new Error('Fim das inscrições deve ser posterior ao início.'), { status: 422 })
    return d
  } })
router.post('/pos/ofertas/:id/publicar', requireRole(...POS), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const o = await prisma.modPosOferta.findFirst({ where: { id: String(req.params.id), tenantId }, include: { pos: true } })
  if (!o) return res.status(404).json({ error: 'Oferta não encontrada.' })
  if (o.pos.status !== 'ATIVO') return res.status(422).json({ error: 'Programa precisa estar ATIVO para publicar oferta.' })
  if (!ehStricto(o.pos.nivel)) {
    const cfg = await getConfig(tenantId)
    if (o.pos.cargaHoraria < cfg.cargaMinimaLato) return res.status(422).json({ error: `Lato sensu abaixo de ${cfg.cargaMinimaLato}h não pode ser ofertado.` })
  }
  const row = await prisma.modPosOferta.update({ where: { id: o.id }, data: { status: 'PUBLICADA' } })
  if (row.inscricoesAte) await scheduleReminder({ tenantId, modulo: 'modalidades', titulo: `Encerram as inscrições: ${o.titulo}`, dueAt: row.inscricoesAte, antecedenciaDias: 5, assigneeRole: 'ADMISSIONS', refType: 'ModPosOferta', refId: o.id, dedupeKey: `mod-posof-${o.id}` })
  res.json(row)
}))
router.post('/pos/ofertas/:id/encerrar', requireRole(...POS), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const o = await prisma.modPosOferta.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!o) return res.status(404).json({ error: 'Oferta não encontrada.' })
  await cancelReminders({ tenantId, refType: 'ModPosOferta', refId: o.id })
  res.json(await prisma.modPosOferta.update({ where: { id: o.id }, data: { status: 'ENCERRADA' } }))
}))
// Catálogo público-interno de ofertas publicadas (para o módulo de admissões consumir).
export async function listarOfertasPosPublicadas(tenantId: string) {
  const now = new Date()
  return prisma.modPosOferta.findMany({ where: { tenantId, status: 'PUBLICADA', OR: [{ inscricoesAte: null }, { inscricoesAte: { gte: now } }] }, include: { pos: { select: { nome: true, nivel: true, cargaHoraria: true, modalidade: true } } }, orderBy: { inscricoesAte: 'asc' } })
}
router.get('/pos/ofertas-publicadas', requireRole(...TEACH, 'ADMISSIONS', 'MARKETING'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  res.json(await listarOfertasPosPublicadas(getTenantId(req)))
}))

// ---------- Relatório de produção do PPG (tolerante às tabelas de `pesquisa`) ----------
async function tentar<T>(fn: () => Promise<T>, padrao: T): Promise<T> {
  try { return await fn() } catch { return padrao }
}
router.get('/pos/programas/:id/producao', requireRole(...TEACH), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const p = await getPos(tenantId, String(req.params.id))
  const anoIni = parseInt(qs(req.query.anoInicio) ?? '', 10) || new Date().getFullYear() - 3
  const anoFim = parseInt(qs(req.query.anoFim) ?? '', 10) || new Date().getFullYear()
  const docentes = await prisma.modPosDocente.findMany({ where: { tenantId, posId: p.id } })
  const alunos = await prisma.modPosAluno.findMany({ where: { tenantId, posId: p.id } })
  const titulados = alunos.filter((a) => a.tituladoEm && a.tituladoEm.getFullYear() >= anoIni && a.tituladoEm.getFullYear() <= anoFim)
  const tempos = titulados.map((a) => (a.tituladoEm!.getTime() - a.ingressoEm.getTime()) / (30.44 * 86_400_000))
  const delegates = prisma as any
  // tabelas do módulo pesquisa (se existirem): tenta delegates comuns, ignora ausência
  const userIds = docentes.map((d) => d.userId).filter(Boolean) as string[]
  const producoes = await tentar(async () => {
    const d = delegates.pesProducao ?? delegates.pesPublicacao
    if (!d) return null
    return d.findMany({ where: { tenantId, ano: { gte: anoIni, lte: anoFim } }, take: 2000 }) as Promise<any[]>
  }, null)
  const projetos = await tentar(async () => {
    const d = delegates.pesProjeto
    if (!d) return null
    return d.count({ where: { tenantId } }) as Promise<number>
  }, null)
  const porTipo: Record<string, number> = {}
  let docentesComProducao = 0
  if (producoes) {
    const autores = new Set<string>()
    for (const pr of producoes) {
      const tipo = String(pr.tipo ?? 'OUTRO'); porTipo[tipo] = (porTipo[tipo] ?? 0) + 1
      for (const k of ['autorUserId', 'pesquisadorId', 'userId']) if (pr[k] && userIds.includes(pr[k])) autores.add(pr[k])
    }
    docentesComProducao = autores.size
  }
  res.json({
    programa: { id: p.id, nome: p.nome, nivel: p.nivel, conceitoCapes: p.conceitoCapes }, periodo: { anoInicio: anoIni, anoFim: anoFim },
    docentes: { total: docentes.length, permanentes: docentes.filter((d) => d.categoria === 'PERMANENTE').length, orientadores: docentes.filter((d) => d.orientador).length, doutores: docentes.filter((d) => ['DOUTOR', 'POS_DOUTOR'].includes(d.titulacao)).length },
    discentes: { ativos: alunos.filter((a) => ['MATRICULADO', 'QUALIFICADO'].includes(a.status)).length, titulados: titulados.length, desligados: alunos.filter((a) => a.status === 'DESLIGADO').length, tempoMedioTitulacaoMeses: tempos.length ? Math.round((tempos.reduce((s, t) => s + t, 0) / tempos.length) * 10) / 10 : null },
    bolsistas: await prisma.modPosBolsa.count({ where: { tenantId, status: 'ATIVA', aluno: { posId: p.id } } }),
    pesquisa: producoes === null ? { disponivel: false, aviso: 'Módulo de pesquisa sem dados/tabelas: produção intelectual não consolidada.' } : { disponivel: true, producoes: producoes.length, porTipo, docentesComProducao, pctDocentesComProducao: docentes.length ? Math.round((docentesComProducao / docentes.length) * 1000) / 10 : 0, projetos },
  })
}))

// ---------- Job: prazos stricto/lato vencidos, bolsas vencidas ----------
export async function varrerPrazosPos(now = new Date()) {
  const abertos = await prisma.modPosAluno.findMany({ where: { status: { in: ['MATRICULADO', 'QUALIFICADO', 'DEFENDIDO'] } }, take: 5000 })
  let vencidos = 0
  for (const a of abertos) {
    const itens: Array<[string, Date | null, Date | null]> = [['Qualificação', a.prazoQualificacao, a.qualificadoEm], ['Defesa', a.prazoDefesa, a.defendidoEm], ['Depósito', a.prazoDeposito, a.depositadoEm]]
    for (const [nome, prazo, feito] of itens) {
      if (prazo && !feito && prazo < now) {
        vencidos++
        await scheduleReminder({ tenantId: a.tenantId, modulo: 'modalidades', titulo: `${nome} em atraso (prazo ${prazo.toLocaleDateString('pt-BR')}) — aluno de pós ${a.studentId}`, dueAt: prazo, remindAt: now, severity: 'CRITICO', assigneeRole: 'COORDINATOR', refType: 'ModPosAluno', refId: a.id, dedupeKey: `mod-pos-venc-${a.id}-${nome[0]}`, recorrenciaDias: 7 })
      }
    }
  }
  const bolsas = await prisma.modPosBolsa.updateMany({ where: { status: 'ATIVA', fim: { lt: now } }, data: { status: 'ENCERRADA' } })
  return { alunosAvaliados: abertos.length, prazosVencidos: vencidos, bolsasEncerradas: bolsas.count }
}

export default router
