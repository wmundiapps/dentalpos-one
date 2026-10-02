import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getUserId, requireRole } from '../academico/middleware'
import { dateISO, mountCrud, pageParams, parseBody, qs } from '../core/crud'
import { audit, notify } from '../core/notify'
import { cancelReminders, completeReminders } from '../core/reminders'
import { ALUNO, MODULO, REF, alunoAlvo, carregarAluno, hasRole, httpError, nomesAlunos, numeroAnual, tid, scheduleReminder } from './common'
import { addDays, prazosRelatoriosEstagio, validarTermoEstagio } from './logic'

const GEST: any[] = ['SUPPORT', 'COORDINATOR']
const LEIT: any[] = ['SUPPORT', 'COORDINATOR', 'SECRETARY', 'TEACHER']

const empresaSchema = z.object({
  razaoSocial: z.string().min(2).max(200), nomeFantasia: z.string().max(200).optional(),
  cnpj: z.string().regex(/^\d{14}$|^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/, 'CNPJ inválido').transform((s) => s.replace(/\D/g, '')).optional(),
  segmento: z.string().max(100).optional(), contatoNome: z.string().max(150).optional(), contatoEmail: z.string().email().optional(), contatoTelefone: z.string().max(30).optional(),
  cidade: z.string().max(100).optional(), uf: z.string().length(2).optional(), convenioNumero: z.string().max(60).optional(), convenioInicio: dateISO().optional(), convenioFim: dateISO().optional(),
  status: z.enum(['PROSPECTO', 'ATIVA', 'SUSPENSA', 'ENCERRADA']).default('ATIVA'), observacoes: z.string().max(3000).optional(),
})
const vagaSchema = z.object({
  empresaId: z.string(), tipo: z.enum(['ESTAGIO', 'EMPREGO', 'TRAINEE', 'JOVEM_APRENDIZ', 'VOLUNTARIADO', 'PESQUISA']).default('ESTAGIO'),
  publicoAlvo: z.enum(['ESTUDANTES', 'EGRESSOS', 'AMBOS']).default('ESTUDANTES'), titulo: z.string().min(3).max(200), descricao: z.string().max(5000).optional(),
  area: z.string().max(100).optional(), programId: z.string().optional(), cidade: z.string().max(100).optional(), modalidade: z.enum(['PRESENCIAL', 'REMOTO', 'HIBRIDO']).default('PRESENCIAL'),
  remuneracao: z.number().min(0).optional(), cargaSemanal: z.number().int().min(1).max(44).optional(), requisitos: z.string().max(3000).optional(), periodoMinimo: z.number().int().min(1).max(20).optional(),
  vagas: z.number().int().min(1).default(1), validade: dateISO().optional(), status: z.enum(['RASCUNHO', 'ABERTA', 'PREENCHIDA', 'ENCERRADA', 'EXPIRADA']).default('ABERTA'),
})

const termoSchema = z.object({
  studentId: z.string(), empresaId: z.string(), vagaId: z.string().optional(), tipo: z.enum(['OBRIGATORIO', 'NAO_OBRIGATORIO']).default('NAO_OBRIGATORIO'),
  orientadorUserId: z.string().optional(), supervisorNome: z.string().max(150).optional(), supervisorCargo: z.string().max(100).optional(), area: z.string().max(100).optional(),
  inicio: dateISO(), fim: dateISO(), jornadaDiariaHoras: z.number().min(1).max(12), cargaSemanalHoras: z.number().min(1).max(60),
  bolsaValor: z.number().min(0).optional(), auxilioTransporte: z.number().min(0).optional(), apoliceSeguro: z.string().max(100).optional(), alunoPcd: z.boolean().default(false), atividades: z.string().max(5000).optional(),
})

async function validarContexto(tenantId: string, t: z.infer<typeof termoSchema>, ignorarTermoId?: string) {
  const aluno = await carregarAluno(tenantId, t.studentId)
  const empresa = await prisma.apoEmpresa.findFirst({ where: { id: t.empresaId, tenantId } })
  if (!empresa) throw httpError(404, 'Empresa não encontrada.')
  if (empresa.status !== 'ATIVA') throw httpError(422, `Empresa ${empresa.status}: sem convênio ativo.`)
  const outros = await prisma.apoTermoEstagio.findMany({ where: { tenantId, studentId: t.studentId, status: { in: ['VIGENTE' as const, 'AGUARDANDO_ASSINATURA' as const] }, ...(ignorarTermoId ? { id: { not: ignorarTermoId } } : {}) } })
  const mesmaEmp = await prisma.apoTermoEstagio.findMany({ where: { tenantId, studentId: t.studentId, empresaId: t.empresaId, status: { in: ['ENCERRADO', 'VIGENTE', 'RESCINDIDO', 'VENCIDO'] }, ...(ignorarTermoId ? { id: { not: ignorarTermoId } } : {}) } })
  const meses = mesmaEmp.reduce((s, x) => s + Math.max(0, Math.round((Math.min(x.fim.getTime(), Date.now()) - x.inicio.getTime()) / (30.44 * 86_400_000))), 0)
  const v = validarTermoEstagio({ ...t, convenioFim: empresa.convenioFim, alunoAtivo: ['ATIVO'].includes(aluno.status), estagiosSimultaneosAtivos: outros.length, mesesNaMesmaEmpresa: meses })
  return { aluno, empresa, ...v }
}

export function mountEmpregabilidade(router: Router) {
  mountCrud(router, { model: 'apoEmpresa', path: '/empregabilidade/empresas', read: LEIT, write: GEST, create: empresaSchema, search: ['razaoSocial', 'nomeFantasia', 'cnpj'], filters: ['status'], orderBy: { razaoSocial: 'asc' }, modulo: MODULO,
    afterCreate: async (row: any) => { if (row.convenioFim) await scheduleReminder({ tenantId: row.tenantId, modulo: MODULO, titulo: `Convênio de estágio vencendo: ${row.razaoSocial}`, dueAt: row.convenioFim, antecedenciaDias: 60, assigneeRole: 'SUPPORT', refType: REF.empresa, refId: row.id, dedupeKey: `apo-conv-${row.id}` }) },
    afterUpdate: async (row: any) => { if (row.convenioFim) await scheduleReminder({ tenantId: row.tenantId, modulo: MODULO, titulo: `Convênio de estágio vencendo: ${row.razaoSocial}`, dueAt: row.convenioFim, antecedenciaDias: 60, assigneeRole: 'SUPPORT', refType: REF.empresa, refId: row.id, dedupeKey: `apo-conv-${row.id}` }) },
  })

  // ---------- vagas ----------
  mountCrud(router, { model: 'apoVaga', path: '/empregabilidade/vagas', read: LEIT, write: GEST, create: vagaSchema, search: ['titulo', 'area'], filters: ['status', 'tipo', 'empresaId', 'publicoAlvo'], include: { empresa: { select: { razaoSocial: true, nomeFantasia: true } } }, modulo: MODULO,
    beforeCreate: async (d: any, req: AuthenticatedRequest) => { if (!(await prisma.apoEmpresa.findFirst({ where: { id: d.empresaId, tenantId: tid(req) }, select: { id: true } }))) throw httpError(404, 'Empresa não encontrada.'); return d } })

  // Mural para alunos/egressos (somente vagas abertas e válidas)
  router.get('/empregabilidade/mural', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const agora = new Date()
    const publico = req.user?.role === 'STUDENT' ? ['ESTUDANTES', 'AMBOS'] : ['ESTUDANTES', 'EGRESSOS', 'AMBOS']
    const where: any = { tenantId, status: 'ABERTA', publicoAlvo: { in: publico }, OR: [{ validade: null }, { validade: { gte: agora } }], empresa: { status: 'ATIVA' } }
    for (const f of ['tipo', 'area', 'programId']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    const items = await prisma.apoVaga.findMany({ where, include: { empresa: { select: { razaoSocial: true, nomeFantasia: true, cidade: true } } }, orderBy: { createdAt: 'desc' }, take: 100 })
    res.json(items)
  }))

  router.post('/empregabilidade/vagas/:id/candidatar', requireRole(...ALUNO, ...GEST), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const v = await prisma.apoVaga.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!v) throw httpError(404, 'Vaga não encontrada.')
    if (v.status !== 'ABERTA' || (v.validade && v.validade < new Date())) throw httpError(422, 'Vaga não está aberta.')
    const b = parseBody(z.object({ studentId: z.string().optional(), egressoId: z.string().optional(), mensagem: z.string().max(2000).optional() }), req.body ?? {})
    let studentId: string | undefined, egressoId: string | undefined
    if (b.egressoId && hasRole(req, ...GEST)) {
      if (v.publicoAlvo === 'ESTUDANTES') throw httpError(422, 'Vaga restrita a estudantes.')
      if (!(await prisma.apoEgresso.findFirst({ where: { id: b.egressoId, tenantId }, select: { id: true } }))) throw httpError(404, 'Egresso não encontrado.')
      egressoId = b.egressoId
    } else {
      if (v.publicoAlvo === 'EGRESSOS') throw httpError(422, 'Vaga restrita a egressos.')
      studentId = alunoAlvo(req, b.studentId)
      await carregarAluno(tenantId, studentId)
    }
    const dup = await prisma.apoCandidaturaVaga.findFirst({ where: { tenantId, vagaId: v.id, ...(studentId ? { studentId } : { egressoId }) } })
    if (dup) throw httpError(409, 'Candidatura já registrada.')
    const c = await prisma.apoCandidaturaVaga.create({ data: { tenantId, vagaId: v.id, studentId, egressoId, mensagem: b.mensagem } })
    res.status(201).json(c)
  }))

  router.get('/empregabilidade/vagas/:id/candidaturas', requireRole(...GEST), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const items = await prisma.apoCandidaturaVaga.findMany({ where: { tenantId, vagaId: String(req.params.id) }, orderBy: { createdAt: 'asc' } })
    const al = await nomesAlunos(tenantId, items.map((i) => i.studentId))
    res.json(items.map((i) => ({ ...i, aluno: i.studentId ? al[i.studentId] : null })))
  }))

  router.patch('/empregabilidade/candidaturas/:id', requireRole(...GEST), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ status: z.enum(['ENCAMINHADA', 'ENTREVISTA', 'CONTRATADA', 'NAO_SELECIONADA', 'DESISTENTE']) }), req.body)
    const c = await prisma.apoCandidaturaVaga.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!c) throw httpError(404, 'Candidatura não encontrada.')
    const upd = await prisma.apoCandidaturaVaga.update({ where: { id: c.id }, data: { status: b.status } })
    if (b.status === 'CONTRATADA') {
      const v = await prisma.apoVaga.findFirst({ where: { id: c.vagaId, tenantId } })
      if (v) {
        const contratadas = await prisma.apoCandidaturaVaga.count({ where: { tenantId, vagaId: v.id, status: 'CONTRATADA' } })
        if (contratadas >= v.vagas) await prisma.apoVaga.update({ where: { id: v.id }, data: { status: 'PREENCHIDA' } })
        if (c.egressoId && v.tipo !== 'ESTAGIO') {
          const emp = await prisma.apoEmpresa.findFirst({ where: { id: v.empresaId, tenantId } })
          await prisma.apoEgresso.update({ where: { id: c.egressoId }, data: { situacaoProfissional: 'EMPREGADO', empregadorAtual: emp?.razaoSocial, cargoAtual: v.titulo, ultimaAtualizacaoEm: new Date(), primeiroEmpregoEm: undefined } }).catch(() => undefined)
        }
      }
    }
    if (c.studentId && ['ENCAMINHADA', 'ENTREVISTA', 'CONTRATADA'].includes(b.status)) await notify({ tenantId, studentId: c.studentId, assunto: 'Atualização da sua candidatura', mensagem: `Status da candidatura: ${b.status.toLowerCase()}.`, refType: 'ApoCandidaturaVaga', refId: c.id })
    res.json(upd)
  }))

  // ---------- termos de estágio ----------
  router.get('/estagio/termos', requireRole(...LEIT, ...ALUNO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    for (const f of ['status', 'empresaId', 'studentId', 'orientadorUserId']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    if (req.user?.role === 'STUDENT') where.studentId = req.user.studentId
    if (req.user?.role === 'TEACHER') where.orientadorUserId = req.user.id
    if (qs(req.query.vencendoEmDias)) { where.fim = { lte: addDays(new Date(), Number(qs(req.query.vencendoEmDias))) }; where.status = 'VIGENTE' }
    const [items, total] = await Promise.all([prisma.apoTermoEstagio.findMany({ where, include: { empresa: { select: { razaoSocial: true } }, relatorios: true }, orderBy: { fim: 'asc' }, skip, take }), prisma.apoTermoEstagio.count({ where })])
    const al = await nomesAlunos(tenantId, items.map((i) => i.studentId))
    res.json({ items: items.map((i) => ({ ...i, aluno: al[i.studentId] })), total, page, pageSize })
  }))

  // Pré-validação (sem gravar): devolve erros/avisos da Lei 11.788.
  router.post('/estagio/termos/validar', requireRole(...GEST), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const b = parseBody(termoSchema, req.body)
    const r = await validarContexto(tid(req), b)
    res.json({ erros: r.erros, avisos: r.avisos, valido: r.erros.length === 0 })
  }))

  router.post('/estagio/termos', requireRole(...GEST), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(termoSchema, req.body)
    const r = await validarContexto(tenantId, b)
    const salvar = req.query.rascunho === 'true'
    if (r.erros.length && !salvar) return res.status(422).json({ error: 'Termo inválido: ' + r.erros.join(' | '), erros: r.erros, avisos: r.avisos })
    const { numero } = await numeroAnual(tenantId, 'TCE')
    const t = await prisma.apoTermoEstagio.create({ data: { ...b, tenantId, numero, status: 'RASCUNHO', alertas: { erros: r.erros, avisos: r.avisos } as any } })
    await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'TERMO_ESTAGIO_CRIADO', refType: REF.termo, refId: t.id })
    res.status(201).json({ ...t, erros: r.erros, avisos: r.avisos })
  }))

  router.post('/estagio/termos/:id/enviar-assinatura', requireRole(...GEST), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const t = await prisma.apoTermoEstagio.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!t) throw httpError(404, 'Termo não encontrado.')
    if (t.status !== 'RASCUNHO') throw httpError(409, `Termo ${t.status}.`)
    const emp = await prisma.apoEmpresa.findFirst({ where: { id: t.empresaId, tenantId } })
    const r = validarTermoEstagio({ tipo: t.tipo as any, inicio: t.inicio, fim: t.fim, jornadaDiariaHoras: t.jornadaDiariaHoras, cargaSemanalHoras: t.cargaSemanalHoras, alunoPcd: t.alunoPcd, bolsaValor: t.bolsaValor, auxilioTransporte: t.auxilioTransporte, apoliceSeguro: t.apoliceSeguro, orientadorUserId: t.orientadorUserId, supervisorNome: t.supervisorNome, convenioFim: emp?.convenioFim })
    if (r.erros.length) throw httpError(422, 'Corrija antes de enviar: ' + r.erros.join(' | '))
    await notify({ tenantId, studentId: t.studentId, assunto: 'Termo de compromisso de estágio para assinatura', mensagem: `O termo ${t.numero} está disponível para assinatura. Procure o setor de estágios.`, refType: REF.termo, refId: t.id })
    await scheduleReminder({ tenantId, modulo: MODULO, titulo: `Coletar assinaturas do termo ${t.numero}`, dueAt: t.inicio < new Date() ? addDays(new Date(), 3) : addDays(t.inicio, -1), assigneeRole: 'SUPPORT', refType: REF.termo, refId: t.id, severity: 'ATENCAO', dedupeKey: `apo-termo-assin-${t.id}` })
    res.json(await prisma.apoTermoEstagio.update({ where: { id: t.id }, data: { status: 'AGUARDANDO_ASSINATURA' } }))
  }))

  // Assinado por todas as partes: vira VIGENTE e gera lembretes (relatórios semestrais, fim, recesso).
  router.post('/estagio/termos/:id/assinar', requireRole(...GEST), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const t = await prisma.apoTermoEstagio.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!t) throw httpError(404, 'Termo não encontrado.')
    if (t.status !== 'AGUARDANDO_ASSINATURA') throw httpError(409, 'Termo precisa estar aguardando assinatura.')
    const b = parseBody(z.object({ assinadoEm: dateISO().optional() }), req.body ?? {})
    const upd = await prisma.apoTermoEstagio.update({ where: { id: t.id }, data: { status: 'VIGENTE', assinadoEm: b.assinadoEm ?? new Date() } })
    await completeReminders({ tenantId, refType: REF.termo, refId: t.id })
    for (const p of prazosRelatoriosEstagio(t.inicio, t.fim)) {
      const rel = await prisma.apoRelatorioEstagio.create({ data: { tenantId, termoId: t.id, tipo: p.tipo, prazoEm: p.prazoEm } })
      await scheduleReminder({ tenantId, modulo: MODULO, titulo: `Relatório ${p.tipo.toLowerCase()} de estágio (${t.numero})`, dueAt: p.prazoEm, antecedenciaDias: 15, assigneeStudentId: t.studentId, assigneeUserId: t.orientadorUserId ?? undefined, refType: REF.relatorio, refId: rel.id, severity: 'ATENCAO', dedupeKey: `apo-rel-${rel.id}` })
    }
    await scheduleReminder({ tenantId, modulo: MODULO, titulo: `Estágio ${t.numero} termina em breve: renovar (aditivo) ou encerrar`, dueAt: t.fim, antecedenciaDias: 30, assigneeUserId: t.orientadorUserId ?? undefined, assigneeRole: t.orientadorUserId ? undefined : 'SUPPORT', assigneeStudentId: t.studentId, refType: REF.termo, refId: t.id, severity: 'ATENCAO', dedupeKey: `apo-termo-fim-${t.id}` })
    await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'TERMO_ESTAGIO_ASSINADO', refType: REF.termo, refId: t.id })
    res.json(upd)
  }))

  // Aditivo: prorroga o término revalidando a Lei (limite de 2 anos, etc.).
  router.post('/estagio/termos/:id/aditivo', requireRole(...GEST), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const t = await prisma.apoTermoEstagio.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!t || t.status !== 'VIGENTE') throw httpError(409, 'Somente termos vigentes admitem aditivo.')
    const b = parseBody(z.object({ novoFim: dateISO(), bolsaValor: z.number().min(0).optional(), cargaSemanalHoras: z.number().min(1).max(60).optional(), jornadaDiariaHoras: z.number().min(1).max(12).optional(), justificativa: z.string().min(5).max(1000) }), req.body)
    if (b.novoFim <= t.fim) throw httpError(400, 'Novo término deve ser posterior ao atual.')
    const dados = { ...t, tipo: t.tipo as any, fim: b.novoFim, bolsaValor: b.bolsaValor ?? t.bolsaValor ?? undefined, cargaSemanalHoras: b.cargaSemanalHoras ?? t.cargaSemanalHoras, jornadaDiariaHoras: b.jornadaDiariaHoras ?? t.jornadaDiariaHoras, auxilioTransporte: t.auxilioTransporte ?? undefined, apoliceSeguro: t.apoliceSeguro ?? undefined, orientadorUserId: t.orientadorUserId ?? undefined, supervisorNome: t.supervisorNome ?? undefined }
    const emp = await prisma.apoEmpresa.findFirst({ where: { id: t.empresaId, tenantId } })
    const v = validarTermoEstagio({ ...dados, convenioFim: emp?.convenioFim, alunoPcd: t.alunoPcd })
    if (v.erros.length) throw httpError(422, 'Aditivo inválido: ' + v.erros.join(' | '))
    const aditivos = [...(Array.isArray(t.aditivos) ? (t.aditivos as any[]) : []), { em: new Date().toISOString(), fimAnterior: t.fim.toISOString(), novoFim: b.novoFim.toISOString(), justificativa: b.justificativa, por: getUserId(req) }]
    const upd = await prisma.apoTermoEstagio.update({ where: { id: t.id }, data: { fim: b.novoFim, bolsaValor: dados.bolsaValor, cargaSemanalHoras: dados.cargaSemanalHoras, jornadaDiariaHoras: dados.jornadaDiariaHoras, aditivos: aditivos as any } })
    // reprograma lembretes: remove relatório FINAL pendente antigo e recria prazos
    await prisma.apoRelatorioEstagio.deleteMany({ where: { tenantId, termoId: t.id, status: 'PENDENTE' } })
    const entregues = await prisma.apoRelatorioEstagio.findMany({ where: { tenantId, termoId: t.id } })
    const jaPrazos = new Set(entregues.map((e) => e.prazoEm.toISOString()))
    for (const p of prazosRelatoriosEstagio(t.inicio, b.novoFim)) {
      if (jaPrazos.has(p.prazoEm.toISOString())) continue
      const rel = await prisma.apoRelatorioEstagio.create({ data: { tenantId, termoId: t.id, tipo: p.tipo, prazoEm: p.prazoEm } })
      await scheduleReminder({ tenantId, modulo: MODULO, titulo: `Relatório ${p.tipo.toLowerCase()} de estágio (${t.numero})`, dueAt: p.prazoEm, antecedenciaDias: 15, assigneeStudentId: t.studentId, assigneeUserId: t.orientadorUserId ?? undefined, refType: REF.relatorio, refId: rel.id, dedupeKey: `apo-rel-${rel.id}` })
    }
    await scheduleReminder({ tenantId, modulo: MODULO, titulo: `Estágio ${t.numero} termina em breve: renovar (aditivo) ou encerrar`, dueAt: b.novoFim, antecedenciaDias: 30, assigneeUserId: t.orientadorUserId ?? undefined, assigneeRole: t.orientadorUserId ? undefined : 'SUPPORT', assigneeStudentId: t.studentId, refType: REF.termo, refId: t.id, dedupeKey: `apo-termo-fim-${t.id}` })
    res.json({ termo: upd, avisos: v.avisos })
  }))

  router.post('/estagio/termos/:id/rescindir', requireRole(...GEST), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const t = await prisma.apoTermoEstagio.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!t || !['VIGENTE', 'AGUARDANDO_ASSINATURA', 'RASCUNHO'].includes(t.status)) throw httpError(409, 'Termo não pode ser rescindido.')
    const b = parseBody(z.object({ motivo: z.string().min(5).max(1000), rescindidoEm: dateISO().optional() }), req.body)
    await cancelReminders({ tenantId, refType: REF.termo, refId: t.id })
    const rels = await prisma.apoRelatorioEstagio.findMany({ where: { tenantId, termoId: t.id, status: 'PENDENTE' }, select: { id: true } })
    for (const r of rels) await cancelReminders({ tenantId, refType: REF.relatorio, refId: r.id })
    await prisma.apoRelatorioEstagio.updateMany({ where: { tenantId, termoId: t.id, status: 'PENDENTE', tipo: 'PARCIAL' }, data: { status: 'REPROVADO', parecer: 'Cancelado por rescisão' } })
    const upd = await prisma.apoTermoEstagio.update({ where: { id: t.id }, data: { status: 'RESCINDIDO', rescisaoMotivo: b.motivo, rescindidoEm: b.rescindidoEm ?? new Date() } })
    await notify({ tenantId, studentId: t.studentId, assunto: 'Termo de estágio rescindido', mensagem: `Motivo: ${b.motivo}`, refType: REF.termo, refId: t.id })
    res.json(upd)
  }))

  router.post('/estagio/relatorios/:id/entregar', requireRole(...ALUNO, ...GEST), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const r = await prisma.apoRelatorioEstagio.findFirst({ where: { id: String(req.params.id), tenantId }, include: { termo: true } })
    if (!r) throw httpError(404, 'Relatório não encontrado.')
    if (req.user?.role === 'STUDENT' && r.termo.studentId !== req.user.studentId) throw httpError(403, 'Relatório de outro aluno.')
    if (r.status !== 'PENDENTE') throw httpError(409, `Relatório ${r.status}.`)
    await completeReminders({ tenantId, refType: REF.relatorio, refId: r.id })
    if (r.termo.orientadorUserId) await scheduleReminder({ tenantId, modulo: MODULO, titulo: `Avaliar relatório de estágio (${r.termo.numero})`, dueAt: addDays(new Date(), 10), assigneeUserId: r.termo.orientadorUserId, refType: REF.relatorio, refId: r.id, dedupeKey: `apo-rel-aval-${r.id}` })
    res.json(await prisma.apoRelatorioEstagio.update({ where: { id: r.id }, data: { status: 'ENTREGUE', entregueEm: new Date() } }))
  }))

  router.post('/estagio/relatorios/:id/avaliar', requireRole('TEACHER', ...GEST), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const r = await prisma.apoRelatorioEstagio.findFirst({ where: { id: String(req.params.id), tenantId }, include: { termo: true } })
    if (!r) throw httpError(404, 'Relatório não encontrado.')
    if (r.status !== 'ENTREGUE') throw httpError(409, 'Relatório precisa estar entregue.')
    if (req.user?.role === 'TEACHER' && r.termo.orientadorUserId !== req.user.id) throw httpError(403, 'Apenas o orientador avalia.')
    const b = parseBody(z.object({ aprovado: z.boolean(), nota: z.number().min(0).max(10).optional(), parecer: z.string().min(3).max(2000) }), req.body)
    await completeReminders({ tenantId, refType: REF.relatorio, refId: r.id })
    await notify({ tenantId, studentId: r.termo.studentId, assunto: `Relatório de estágio ${b.aprovado ? 'aprovado' : 'reprovado'}`, mensagem: b.parecer, refType: REF.relatorio, refId: r.id })
    res.json(await prisma.apoRelatorioEstagio.update({ where: { id: r.id }, data: { status: b.aprovado ? 'APROVADO' : 'REPROVADO', avaliacaoOrientador: b.nota, parecer: b.parecer } }))
  }))

  router.get('/estagio/resumo', requireRole(...GEST, 'SECRETARY'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const agora = new Date()
    const [porStatus, vencendo, relAtrasados, convenios] = await Promise.all([
      prisma.apoTermoEstagio.groupBy({ by: ['status'], where: { tenantId }, _count: true }),
      prisma.apoTermoEstagio.count({ where: { tenantId, status: 'VIGENTE', fim: { lte: addDays(agora, 30) } } }),
      prisma.apoRelatorioEstagio.count({ where: { tenantId, status: 'PENDENTE', prazoEm: { lt: agora } } }),
      prisma.apoEmpresa.count({ where: { tenantId, status: 'ATIVA', convenioFim: { lte: addDays(agora, 60) } } }),
    ])
    res.json({ termosPorStatus: Object.fromEntries(porStatus.map((s) => [s.status, s._count])), vencendoEm30Dias: vencendo, relatoriosAtrasados: relAtrasados, conveniosVencendoEm60Dias: convenios })
  }))
}

// Job: vence termos, expira vagas, avisa convênios.
export async function jobEstagios() {
  const agora = new Date()
  const venc = await prisma.apoTermoEstagio.updateMany({ where: { status: 'VIGENTE', fim: { lt: agora } }, data: { status: 'VENCIDO' } })
  const vagas = await prisma.apoVaga.updateMany({ where: { status: 'ABERTA', validade: { lt: agora } }, data: { status: 'EXPIRADA' } })
  const termosVencidos = await prisma.apoTermoEstagio.findMany({ where: { status: 'VENCIDO', updatedAt: { gte: addDays(agora, -1) } }, take: 500 })
  for (const t of termosVencidos) await completeReminders({ tenantId: t.tenantId, refType: REF.termo, refId: t.id })
  const convs = await prisma.apoEmpresa.updateMany({ where: { status: 'ATIVA', convenioFim: { lt: agora } }, data: { status: 'SUSPENSA', observacoes: 'Convênio vencido: suspensa automaticamente.' } })
  const atrasados = await prisma.apoRelatorioEstagio.findMany({ where: { status: 'PENDENTE', prazoEm: { lt: agora } }, include: { termo: true }, take: 500 })
  for (const r of atrasados) await scheduleReminder({ tenantId: r.tenantId, modulo: MODULO, titulo: `Relatório de estágio em atraso (${r.termo.numero})`, dueAt: addDays(agora, 3), assigneeRole: 'SUPPORT', assigneeStudentId: r.termo.studentId, refType: REF.relatorio, refId: r.id, severity: 'CRITICO', dedupeKey: `apo-rel-atraso-${r.id}` })
  return { termosVencidos: venc.count, vagasExpiradas: vagas.count, conveniosSuspensos: convs.count, relatoriosAtrasados: atrasados.length }
}
