import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { brandHeaderHtml, escapeHtml as esc, getBranding } from '../core/branding'
import { dateISO, mountCrud, pageParams, parseBody, qs } from '../core/crud'
import { audit, notify } from '../core/notify'
import { completeReminders, scheduleReminder } from '../core/reminders'
import { MODULO, SEC, SEC_GESTAO, SEC_LEITURA, proximoNumero, urlVerificacao } from './common'
import { criarConferencia, recalcularConferencia } from './conferencia'
import { montarHistorico } from './documentos'
import { DAY, DiplomaStatus, alocarRegistro, avaliarAptidaoFormando, dataExtenso, gerarCodigoVerificacao, podeTransitarDiploma } from './logic'

// ============================================================
// DIPLOMAS (solicitado → conferência → registro → entrega), LIVROS, ATAS, COLAÇÃO DE GRAU
// ============================================================

const REF = 'SecDiploma'

export async function avaliarFormando(tenantId: string, studentId: string, programId?: string | null) {
  const h = await montarHistorico(tenantId, studentId)
  const prog = programId ? await prisma.academicProgram.findFirst({ where: { id: programId }, select: { cargaHorariaTotal: true } }) : h.matricula?.program
  const naoAprovadas = h.linhas.filter((l) => !['APROVADO', 'DISPENSADO', 'APROVEITADO'].includes(l.situacao)).length
  let financeiro = 0
  try {
    financeiro = await prisma.accountReceivable.count({ where: { tenantId, studentId, status: { in: ['PENDENTE', 'ATRASADO'] }, dataVencimento: { lt: new Date() } } })
  } catch { /* financeiro indisponível */ }
  const conf = await prisma.secConferencia.findFirst({ where: { tenantId, studentId, processo: 'DIPLOMA' }, orderBy: { createdAt: 'desc' }, select: { status: true } })
  return {
    ...avaliarAptidaoFormando({ cargaHorariaExigida: prog?.cargaHorariaTotal ?? 0, cargaHorariaCursada: h.resumo.cargaHorariaCursada, disciplinasPendentes: naoAprovadas, statusAluno: h.student.status === 'CONCLUIDO' || h.student.status === 'FORMADO' ? null : h.student.status, conferenciaStatus: conf?.status ?? null, financeiroPendente: financeiro }),
    nome: h.student.nomeCompleto,
  }
}

const livroSchema = z.object({
  tipo: z.enum(['REGISTRO_DIPLOMA', 'ATAS_COLACAO', 'ATAS_GERAIS', 'REGISTRO_CERTIFICADO']),
  numero: z.number().int().min(1).optional(),
  titulo: z.string().min(3).max(150),
  registrosPorFolha: z.number().int().min(1).max(10).default(2),
  termoAbertura: z.string().max(3000).optional(),
})

const ataSchema = z.object({
  livroId: z.string().optional(),
  tipo: z.enum(['COLACAO', 'COLEGIADO', 'BANCA', 'REUNIAO', 'GERAL']).default('GERAL'),
  titulo: z.string().min(3).max(200),
  data: dateISO(),
  conteudo: z.string().min(5).max(100000),
  participantes: z.array(z.object({ nome: z.string(), papel: z.string().optional() })).optional(),
})

const colacaoSchema = z.object({
  nome: z.string().min(3).max(150),
  data: dateISO(),
  local: z.string().max(200).optional(),
  programId: z.string().optional(),
  termId: z.string().optional(),
  prazoInscricaoEm: dateISO().optional(),
  observacoes: z.string().max(2000).optional(),
})

const COLACAO_TRANS: Record<string, string[]> = {
  PLANEJADA: ['CONVOCADA', 'CANCELADA'],
  CONVOCADA: ['REALIZADA', 'PLANEJADA', 'CANCELADA'],
  REALIZADA: ['ENCERRADA'],
  ENCERRADA: [],
  CANCELADA: [],
}

async function agendarLembretesColacao(c: { id: string; tenantId: string; nome: string; data: Date; prazoInscricaoEm: Date | null }) {
  const marcos: Array<[string, number, string, string]> = [
    ['d30', 30, 'Convocar formandos', 'Enviar convocação e conferir pendências dos formandos'],
    ['d14', 14, 'Fechar lista de formandos', 'Lista de formandos deve estar fechada e conferida'],
    ['d7', 7, 'Conferir pendências finais e ensaio', 'Reavaliar aptidão dos formandos; confirmar cerimonial'],
    ['d1', 1, 'Imprimir documentos da colação', 'Lista de presença, juramento e ata prontos'],
  ]
  for (const [k, dias, t, d] of marcos) {
    const due = new Date(c.data.getTime() - dias * DAY)
    if (due.getTime() < Date.now() - DAY) continue
    await scheduleReminder({ tenantId: c.tenantId, modulo: MODULO, titulo: `Colação "${c.nome}": ${t}`, descricao: d, dueAt: due, remindAt: new Date(Math.max(Date.now(), due.getTime() - 2 * DAY)), refType: 'SecColacao', refId: c.id, assigneeRole: 'SECRETARY', severity: dias <= 7 ? 'ATENCAO' : 'INFO', dedupeKey: `sec:colacao:${c.id}:${k}` })
  }
  if (c.prazoInscricaoEm) await scheduleReminder({ tenantId: c.tenantId, modulo: MODULO, titulo: `Colação "${c.nome}": encerra a inscrição`, dueAt: c.prazoInscricaoEm, antecedenciaDias: 3, refType: 'SecColacao', refId: c.id, assigneeRole: 'SECRETARY', dedupeKey: `sec:colacao:${c.id}:insc` })
}

export function mountDiplomas(router: Router) {
  // ---------- livros e atas ----------
  mountCrud(router, {
    model: 'secLivro',
    path: '/livros',
    read: SEC_LEITURA,
    write: SEC_GESTAO,
    create: livroSchema,
    update: livroSchema.pick({ titulo: true, registrosPorFolha: true, termoAbertura: true }).partial(),
    filters: ['tipo', 'aberto'],
    orderBy: [{ tipo: 'asc' }, { numero: 'desc' }],
    modulo: MODULO,
    removeMode: 'hard',
    beforeCreate: async (d, req) => {
      const tenantId = getTenantId(req)
      if (!d.numero) d.numero = (await prisma.secLivro.aggregate({ where: { tenantId, tipo: d.tipo }, _max: { numero: true } }))._max.numero! + 1 || 1
      if (d.tipo === 'REGISTRO_DIPLOMA' || d.tipo === 'REGISTRO_CERTIFICADO') {
        const aberto = await prisma.secLivro.findFirst({ where: { tenantId, tipo: d.tipo, aberto: true } })
        if (aberto) throw Object.assign(new Error(`Já existe o livro nº ${aberto.numero} aberto para este tipo. Encerre-o antes.`), { status: 409 })
      }
    },
  })

  router.post('/livros/:id/encerrar', requireRole(...SEC_GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const l = await prisma.secLivro.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!l) return res.status(404).json({ error: 'Livro não encontrado.' })
    if (!l.aberto) return res.status(409).json({ error: 'Livro já encerrado.' })
    const r = await prisma.secLivro.update({ where: { id: l.id }, data: { aberto: false, encerradoEm: new Date() } })
    await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'LIVRO_ENCERRADO', refType: 'SecLivro', refId: l.id, detalhes: { ultimoRegistro: l.proximoRegistro - 1 } })
    res.json(r)
  }))

  // Termo de abertura/encerramento em HTML (para impressão e rubrica).
  router.get('/livros/:id/termo', requireRole(...SEC_LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const l = await prisma.secLivro.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!l) return res.status(404).json({ error: 'Livro não encontrado.' })
    const b = await getBranding(tenantId)
    const encerrado = qs(req.query.tipo) === 'encerramento' || !l.aberto
    const texto = encerrado
      ? `Este livro (nº ${l.numero}) contém ${l.proximoRegistro - 1} registro(s) em ${l.folhaAtual} folha(s), encerrado em ${dataExtenso(l.encerradoEm ?? new Date())}.`
      : l.termoAbertura || `Este livro (nº ${l.numero}) destina-se ao registro de ${l.titulo}, contendo folhas numeradas e rubricadas, aberto em ${dataExtenso(l.abertoEm)}.`
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.send(paginaSimples(b, encerrado ? 'Termo de encerramento' : 'Termo de abertura', `<p><b>${esc(l.titulo)}</b> — Livro nº ${l.numero}</p><p>${esc(texto)}</p><div style="margin-top:70px;text-align:center">________________________________<br/>${esc(b.reitorNome || 'Secretário(a) Geral')}</div>`))
  }))

  mountCrud(router, {
    model: 'secAta',
    path: '/atas',
    read: SEC_LEITURA,
    write: SEC_GESTAO,
    create: ataSchema,
    search: ['titulo'],
    filters: ['tipo', 'livroId', 'colacaoId'],
    orderBy: { data: 'desc' },
    modulo: MODULO,
    beforeCreate: async (d, req) => {
      const tenantId = getTenantId(req)
      if (d.livroId) {
        const l = await prisma.secLivro.findFirst({ where: { id: d.livroId, tenantId } })
        if (!l) throw Object.assign(new Error('Livro não encontrado.'), { status: 404 })
        if (!l.aberto) throw Object.assign(new Error('Livro encerrado.'), { status: 409 })
        if (!l.tipo.startsWith('ATAS')) throw Object.assign(new Error('O livro informado não é de atas.'), { status: 409 })
        d.numero = await proximoNumero(tenantId, `ATA:${l.id}`)
      }
    },
  })

  router.get('/atas/:id/html', requireRole(...SEC_LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const a = await prisma.secAta.findFirst({ where: { id: String(req.params.id), tenantId }, include: { livro: true } })
    if (!a) return res.status(404).json({ error: 'Ata não encontrada.' })
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.send(paginaSimples(await getBranding(tenantId), `Ata${a.numero ? ` nº ${a.numero}` : ''}${a.livro ? ` — Livro ${a.livro.numero}` : ''}`, a.conteudo.startsWith('<') ? a.conteudo : `<p style="white-space:pre-wrap">${esc(a.conteudo)}</p>`))
  }))

  // ---------- diplomas ----------
  router.get('/diplomas', requireRole(...SEC_LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    for (const f of ['status', 'studentId', 'colacaoId', 'livroId', 'tipo']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    const [items, total] = await Promise.all([prisma.secDiploma.findMany({ where, orderBy: { solicitadoEm: 'desc' }, skip, take }), prisma.secDiploma.count({ where })])
    res.json({ items, total, page, pageSize })
  }))

  router.get('/diplomas/:id', requireRole(...SEC_LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const d = await prisma.secDiploma.findFirst({ where: { id: String(req.params.id), tenantId: getTenantId(req) }, include: { livro: { select: { numero: true, titulo: true } } } })
    if (!d) return res.status(404).json({ error: 'Diploma não encontrado.' })
    const conf = d.conferenciaId ? await recalcularConferencia(getTenantId(req), d.conferenciaId).then((r) => ({ id: d.conferenciaId, status: r.status, percentual: r.percentual })).catch(() => null) : null
    res.json({ ...d, conferencia: conf })
  }))

  router.post('/diplomas', requireRole(...SEC), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(z.object({ studentId: z.string().min(1), enrollmentId: z.string().optional(), tipo: z.enum(['DIPLOMA', 'SEGUNDA_VIA']).default('DIPLOMA'), observacoes: z.string().max(1000).optional(), protocoloId: z.string().optional(), forcar: z.boolean().default(false) }), req.body)
    const s = await prisma.student.findFirst({ where: { id: b.studentId, tenantId } })
    if (!s) return res.status(404).json({ error: 'Aluno não encontrado.' })
    const matr = await prisma.enrollment.findMany({ where: { studentId: s.id, ...(b.enrollmentId ? { id: b.enrollmentId } : {}) }, orderBy: { dataMatricula: 'desc' } })
    const m = matr.find((x) => x.status === 'CONCLUIDA') ?? matr[0]
    const concluiu = ['CONCLUIDO', 'FORMADO'].includes(s.status) || m?.status === 'CONCLUIDA'
    if (!concluiu && !b.forcar) return res.status(409).json({ error: 'O aluno ainda não consta como concluinte (use forcar=true para exceção autorizada).' })
    if (b.forcar && !['ADMIN', 'OWNER', 'RECTOR', 'BOARD', 'COORDINATOR'].includes(String(req.user?.role))) return res.status(403).json({ error: 'Apenas coordenação/administração pode forçar a solicitação.' })
    const ativo = await prisma.secDiploma.findFirst({ where: { tenantId, studentId: s.id, tipo: b.tipo, programId: m?.programId ?? null, status: { notIn: ['CANCELADO', ...(b.tipo === 'SEGUNDA_VIA' ? ['ENTREGUE'] : [])] as any } } })
    if (ativo) return res.status(409).json({ error: `Já existe diploma em andamento/emitido (${ativo.status}).` })
    if (b.tipo === 'SEGUNDA_VIA') {
      const orig = await prisma.secDiploma.findFirst({ where: { tenantId, studentId: s.id, tipo: 'DIPLOMA', status: { in: ['REGISTRADO', 'ENTREGUE'] } } })
      if (!orig) return res.status(409).json({ error: 'Não há diploma original registrado para emitir 2ª via.' })
    }
    const d = await prisma.secDiploma.create({ data: { tenantId, studentId: s.id, programId: m?.programId, enrollmentId: m?.id, tipo: b.tipo, observacoes: b.observacoes, protocoloId: b.protocoloId, dataConclusao: m?.term?.dataFim ?? undefined } as any })
    await scheduleReminder({ tenantId, modulo: MODULO, titulo: `Diploma de ${s.nomeCompleto}: iniciar conferência`, dueAt: new Date(Date.now() + 10 * DAY), antecedenciaDias: 7, refType: REF, refId: d.id, assigneeRole: 'SECRETARY', dedupeKey: `sec:dip:${d.id}` })
    await notify({ tenantId, studentId: s.id, assunto: 'Solicitação de diploma recebida', mensagem: `Recebemos a solicitação de ${b.tipo === 'SEGUNDA_VIA' ? '2ª via do diploma' : 'diploma'}. Você será avisado a cada etapa.`, refType: REF, refId: d.id })
    await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'DIPLOMA_SOLICITADO', refType: REF, refId: d.id })
    res.status(201).json(d)
  }))

  router.post('/diplomas/:id/transitar', requireRole(...SEC), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(z.object({ para: z.enum(['CONFERENCIA', 'PENDENCIA', 'REGISTRO', 'CANCELADO']), motivo: z.string().max(1000).optional(), pendencias: z.array(z.string().max(300)).optional() }), req.body)
    const d = await prisma.secDiploma.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!d) return res.status(404).json({ error: 'Diploma não encontrado.' })
    const de = d.status as DiplomaStatus
    if (!podeTransitarDiploma(de, b.para)) return res.status(409).json({ error: `Transição inválida: ${de} → ${b.para}.` })
    const data: any = { status: b.para }
    if (b.para === 'CONFERENCIA' && !d.conferenciaId) {
      try {
        const c = await criarConferencia({ tenantId, processo: 'DIPLOMA', titulo: 'Conferência documental — diploma', studentId: d.studentId, refType: REF, refId: d.id, userId: getUserId(req) })
        data.conferenciaId = c.id
      } catch (e: any) {
        if (e?.status !== 404) throw e // sem checklist DIPLOMA cadastrado: segue sem conferência (rode /bootstrap)
      }
    }
    if (b.para === 'PENDENCIA') {
      if (!b.pendencias?.length && !b.motivo) return res.status(400).json({ error: 'Informe as pendências.' })
      data.pendencias = b.pendencias ?? [b.motivo]
    }
    if (b.para === 'REGISTRO') {
      if (!d.conferenciaId) return res.status(409).json({ error: 'Conferência documental não iniciada. Cadastre/rode o bootstrap do checklist DIPLOMA e inicie a conferência.' })
      const r = await recalcularConferencia(tenantId, d.conferenciaId)
      if (r.status !== 'APROVADA') return res.status(409).json({ error: `Conferência documental ${r.status} (${r.aprovados}/${r.total} itens aprovados).` })
      const apt = await avaliarFormando(tenantId, d.studentId, d.programId)
      if (!apt.apto) return res.status(409).json({ error: 'Pendências acadêmicas/financeiras impedem o registro.', pendencias: apt.pendencias })
      data.pendencias = null
    }
    if (b.para === 'CANCELADO' && !(b.motivo && b.motivo.length >= 5)) return res.status(400).json({ error: 'Informe o motivo do cancelamento.' })
    if (b.motivo) data.observacoes = [d.observacoes, `[${new Date().toLocaleDateString('pt-BR')}] ${b.motivo}`].filter(Boolean).join('\n')
    const r = await prisma.secDiploma.update({ where: { id: d.id }, data })
    if (b.para === 'CANCELADO') await completeReminders({ tenantId, refType: REF, refId: d.id })
    if (b.para === 'PENDENCIA') await notify({ tenantId, studentId: d.studentId, assunto: 'Pendência no seu diploma', mensagem: `Há pendências para o registro do diploma: ${(data.pendencias as string[]).join('; ')}`, refType: REF, refId: d.id })
    await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: `DIPLOMA_${b.para}`, refType: REF, refId: d.id, detalhes: { de, motivo: b.motivo } })
    res.json(r)
  }))

  // Registro no livro: numeração sequencial/folha atômica (compare-and-swap no contador do livro).
  router.post('/diplomas/:id/registrar', requireRole(...SEC_GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(z.object({ livroId: z.string().min(1), dataRegistro: dateISO().optional() }), req.body)
    const d = await prisma.secDiploma.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!d) return res.status(404).json({ error: 'Diploma não encontrado.' })
    if (d.status !== 'REGISTRO') return res.status(409).json({ error: 'O diploma precisa estar na etapa REGISTRO.' })
    let reg: { numero: number; folha: number } | null = null
    for (let t = 0; t < 6 && !reg; t++) {
      const livro = await prisma.secLivro.findFirst({ where: { id: b.livroId, tenantId } })
      if (!livro) return res.status(404).json({ error: 'Livro não encontrado.' })
      if (!livro.aberto || livro.tipo !== 'REGISTRO_DIPLOMA') return res.status(409).json({ error: 'Informe um livro de registro de diplomas aberto.' })
      const a = alocarRegistro(livro)
      const ok = await prisma.secLivro.updateMany({ where: { id: livro.id, proximoRegistro: livro.proximoRegistro }, data: { proximoRegistro: a.proximoRegistro, folhaAtual: a.folha } })
      if (ok.count === 1) reg = { numero: a.numero, folha: a.folha }
    }
    if (!reg) return res.status(503).json({ error: 'Concorrência ao numerar o registro; tente novamente.' })
    let r: any
    for (let i = 0; i < 4 && !r; i++) {
      try {
        r = await prisma.secDiploma.update({ where: { id: d.id }, data: { status: 'REGISTRADO', livroId: b.livroId, numeroRegistro: reg.numero, folha: reg.folha, dataRegistro: b.dataRegistro ?? new Date(), codigoVerificacao: gerarCodigoVerificacao() } })
      } catch (e: any) {
        if (e?.code !== 'P2002') throw e
      }
    }
    if (!r) return res.status(503).json({ error: 'Falha ao gerar código do diploma.' })
    await scheduleReminder({ tenantId, modulo: MODULO, titulo: `Diploma registrado nº ${reg.numero}: entregar ao aluno`, dueAt: new Date(Date.now() + 30 * DAY), antecedenciaDias: 20, refType: REF, refId: d.id, assigneeRole: 'SECRETARY', recorrenciaDias: 15, dedupeKey: `sec:dip:entrega:${d.id}` })
    await prisma.eduReminder.updateMany({ where: { tenantId, dedupeKey: `sec:dip:${d.id}` }, data: { status: 'CONCLUIDO', concluidoEm: new Date() } })
    await notify({ tenantId, studentId: d.studentId, assunto: 'Diploma registrado', mensagem: `Seu diploma foi registrado (registro nº ${reg.numero}, folha ${reg.folha}). Agende a retirada na secretaria.`, refType: REF, refId: d.id })
    await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'DIPLOMA_REGISTRADO', refType: REF, refId: d.id, detalhes: reg })
    res.json(r)
  }))

  router.post('/diplomas/:id/entregar', requireRole(...SEC), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(z.object({ retiradoPor: z.string().min(3).max(200), retiradoDoc: z.string().min(3).max(40), entregueEm: dateISO().optional() }), req.body)
    const d = await prisma.secDiploma.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!d) return res.status(404).json({ error: 'Diploma não encontrado.' })
    if (!podeTransitarDiploma(d.status as DiplomaStatus, 'ENTREGUE')) return res.status(409).json({ error: 'Diploma precisa estar REGISTRADO para ser entregue.' })
    const r = await prisma.secDiploma.update({ where: { id: d.id }, data: { status: 'ENTREGUE', entregueEm: b.entregueEm ?? new Date(), retiradoPor: b.retiradoPor, retiradoDoc: b.retiradoDoc } })
    await completeReminders({ tenantId, refType: REF, refId: d.id, userId: getUserId(req) })
    await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'DIPLOMA_ENTREGUE', refType: REF, refId: d.id, detalhes: { retiradoPor: b.retiradoPor } })
    res.json(r)
  }))

  // Termo de registro (folha do livro) para impressão.
  router.get('/diplomas/:id/termo-registro', requireRole(...SEC_LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d = await prisma.secDiploma.findFirst({ where: { id: String(req.params.id), tenantId }, include: { livro: true } })
    if (!d || !d.livro || !d.numeroRegistro) return res.status(404).json({ error: 'Diploma ainda não registrado.' })
    const [s, prog] = await Promise.all([prisma.student.findFirst({ where: { id: d.studentId, tenantId } }), d.programId ? prisma.academicProgram.findFirst({ where: { id: d.programId } }) : null])
    const b = await getBranding(tenantId)
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.send(paginaSimples(b, `Registro de diploma nº ${d.numeroRegistro}`, `<p><b>Livro:</b> ${d.livro.numero} &nbsp; <b>Folha:</b> ${d.folha} &nbsp; <b>Registro:</b> ${d.numeroRegistro} &nbsp; <b>Data:</b> ${d.dataRegistro?.toLocaleDateString('pt-BR')}</p>
<p>Registrado o diploma de <b>${esc(s?.nomeCompleto)}</b> (RA ${esc(s?.ra)}${s?.cpf ? `, CPF ${esc(s.cpf)}` : ''}), concluinte do curso de <b>${esc(prog?.nome ?? '—')}</b>${d.dataConclusao ? `, concluído em ${d.dataConclusao.toLocaleDateString('pt-BR')}` : ''}${d.dataColacao ? `, com colação de grau em ${d.dataColacao.toLocaleDateString('pt-BR')}` : ''}.${d.tipo === 'SEGUNDA_VIA' ? ' <b>Segunda via.</b>' : ''}</p>
<p style="font:12px sans-serif;color:#475569">Código de verificação: <b>${esc(d.codigoVerificacao)}</b> — ${esc(urlVerificacao(d.codigoVerificacao ?? ''))}</p>
<div style="margin-top:70px;text-align:center">________________________________<br/>Secretário(a) Geral</div>`))
  }))

  // ---------- colação de grau ----------
  mountCrud(router, {
    model: 'secColacao',
    path: '/colacoes',
    read: SEC_LEITURA,
    write: SEC_GESTAO,
    create: colacaoSchema,
    update: colacaoSchema.partial(),
    filters: ['status', 'programId'],
    include: { _count: { select: { formandos: true } } },
    orderBy: { data: 'desc' },
    modulo: MODULO,
    afterCreate: (row) => agendarLembretesColacao(row),
    afterUpdate: (row) => agendarLembretesColacao(row),
  })

  router.get('/colacoes/:id/formandos', requireRole(...SEC_LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const c = await prisma.secColacao.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!c) return res.status(404).json({ error: 'Colação não encontrada.' })
    const f = await prisma.secColacaoFormando.findMany({ where: { colacaoId: c.id, tenantId }, orderBy: { nome: 'asc' } })
    const resumo: Record<string, number> = {}
    for (const x of f) resumo[x.status] = (resumo[x.status] ?? 0) + 1
    res.json({ colacao: c, resumo, formandos: f })
  }))

  // Inscreve formandos (lista explícita ou concluintes do curso) já avaliando aptidão.
  router.post('/colacoes/:id/formandos', requireRole(...SEC), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(z.object({ studentIds: z.array(z.string()).max(1000).optional(), incluirConcluintesDoCurso: z.boolean().default(false) }), req.body)
    const c = await prisma.secColacao.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!c) return res.status(404).json({ error: 'Colação não encontrada.' })
    if (['REALIZADA', 'ENCERRADA', 'CANCELADA'].includes(c.status)) return res.status(409).json({ error: `Colação ${c.status}.` })
    const ids = new Set(b.studentIds ?? [])
    if (b.incluirConcluintesDoCurso) {
      if (!c.programId) return res.status(400).json({ error: 'A colação não tem curso definido.' })
      const ms = await prisma.enrollment.findMany({ where: { programId: c.programId, status: 'CONCLUIDA', student: { tenantId } }, select: { studentId: true } })
      ms.forEach((m) => ids.add(m.studentId))
    }
    const incluidos: any[] = []
    const erros: any[] = []
    for (const sid of ids) {
      try {
        const s = await prisma.student.findFirst({ where: { id: sid, tenantId }, select: { id: true, nomeCompleto: true } })
        if (!s) throw new Error('aluno não encontrado')
        const ja = await prisma.secColacaoFormando.findUnique({ where: { colacaoId_studentId: { colacaoId: c.id, studentId: s.id } } })
        if (ja) continue
        const apt = await avaliarFormando(tenantId, s.id, c.programId)
        incluidos.push(await prisma.secColacaoFormando.create({ data: { tenantId, colacaoId: c.id, studentId: s.id, nome: s.nomeCompleto, status: apt.apto ? 'APTO' : 'PENDENTE', pendencias: apt.pendencias } }))
      } catch (e: any) {
        erros.push({ studentId: sid, erro: e?.message })
      }
    }
    res.status(201).json({ incluidos: incluidos.length, erros, formandos: incluidos })
  }))

  router.post('/colacoes/:id/reavaliar', requireRole(...SEC), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const c = await prisma.secColacao.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!c) return res.status(404).json({ error: 'Colação não encontrada.' })
    const r = await reavaliarFormandos(tenantId, c)
    res.json(r)
  }))

  router.patch('/colacoes/:id/formandos/:formandoId', requireRole(...SEC), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(z.object({ status: z.enum(['INSCRITO', 'APTO', 'PENDENTE', 'COLOU', 'AUSENTE', 'EXCLUIDO']).optional(), juramento: z.boolean().optional(), observacoes: z.string().max(500).optional() }), req.body)
    const f = await prisma.secColacaoFormando.findFirst({ where: { id: String(req.params.formandoId), colacaoId: String(req.params.id), tenantId }, include: { colacao: true } })
    if (!f) return res.status(404).json({ error: 'Formando não encontrado.' })
    if (b.status === 'COLOU' && f.status !== 'APTO' && f.status !== 'COLOU') return res.status(409).json({ error: 'Somente formando APTO pode colar grau (resolva as pendências ou autorize via coordenação).' })
    if (b.status === 'COLOU' && f.colacao.status !== 'REALIZADA') return res.status(409).json({ error: 'Registre a presença apenas com a colação REALIZADA.' })
    res.json(await prisma.secColacaoFormando.update({ where: { id: f.id }, data: b }))
  }))

  router.post('/colacoes/:id/status', requireRole(...SEC_GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { para } = parseBody(z.object({ para: z.enum(['PLANEJADA', 'CONVOCADA', 'REALIZADA', 'ENCERRADA', 'CANCELADA']) }), req.body)
    const c = await prisma.secColacao.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!c) return res.status(404).json({ error: 'Colação não encontrada.' })
    if (!COLACAO_TRANS[c.status]?.includes(para)) return res.status(409).json({ error: `Transição inválida: ${c.status} → ${para}.` })
    if (para === 'ENCERRADA' && !c.ataId) return res.status(409).json({ error: 'Gere a ata da colação antes de encerrar.' })
    if (para === 'REALIZADA') await reavaliarFormandos(tenantId, c) // fotografia final de pendências
    const r = await prisma.secColacao.update({ where: { id: c.id }, data: { status: para } })
    if (para === 'CONVOCADA') {
      const fs = await prisma.secColacaoFormando.findMany({ where: { colacaoId: c.id, tenantId, status: { in: ['APTO', 'PENDENTE', 'INSCRITO'] } } })
      for (const f of fs)
        await notify({ tenantId, studentId: f.studentId, assunto: `Convocação: ${c.nome}`, mensagem: `Você está convocado(a) para a colação de grau "${c.nome}" em ${c.data.toLocaleString('pt-BR')}${c.local ? `, local: ${c.local}` : ''}.${f.status === 'PENDENTE' ? ` ATENÇÃO — pendências: ${((f.pendencias as string[]) ?? []).join('; ')}` : ''}`, templateKey: 'sec.colacao.convocacao', refType: 'SecColacao', refId: c.id })
    }
    if (para === 'ENCERRADA' || para === 'CANCELADA') {
      await prisma.eduReminder.updateMany({ where: { tenantId, refType: 'SecColacao', refId: c.id, status: { in: ['PENDENTE', 'NOTIFICADO', 'ADIADO'] } }, data: { status: para === 'CANCELADA' ? 'CANCELADO' : 'CONCLUIDO' } })
    }
    await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: `COLACAO_${para}`, refType: 'SecColacao', refId: c.id })
    res.json(r)
  }))

  // Lista de presença / formandos imprimível.
  router.get('/colacoes/:id/lista', requireRole(...SEC_LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const c = await prisma.secColacao.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!c) return res.status(404).json({ error: 'Colação não encontrada.' })
    const f = await prisma.secColacaoFormando.findMany({ where: { colacaoId: c.id, tenantId, status: { not: 'EXCLUIDO' } }, orderBy: { nome: 'asc' } })
    const linhas = f.map((x, i) => `<tr><td>${i + 1}</td><td>${esc(x.nome)}</td><td>${esc(x.status)}</td><td style="width:200px"></td></tr>`).join('')
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.send(paginaSimples(await getBranding(tenantId), `Lista de formandos — ${c.nome}`, `<p>${c.data.toLocaleString('pt-BR')}${c.local ? ' — ' + esc(c.local) : ''}</p><table><thead><tr><th>#</th><th>Formando</th><th>Situação</th><th>Assinatura</th></tr></thead><tbody>${linhas}</tbody></table>`))
  }))

  // Gera a ata da colação (no livro de atas de colação) e, opcionalmente, abre os diplomas dos que colaram.
  router.post('/colacoes/:id/ata', requireRole(...SEC_GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(z.object({ livroId: z.string().optional(), observacoes: z.string().max(3000).optional(), gerarDiplomas: z.boolean().default(true) }), req.body ?? {})
    const c = await prisma.secColacao.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!c) return res.status(404).json({ error: 'Colação não encontrada.' })
    if (c.status !== 'REALIZADA' && c.status !== 'ENCERRADA') return res.status(409).json({ error: 'A ata só pode ser gerada após a realização da colação.' })
    if (c.ataId) return res.status(409).json({ error: 'A ata desta colação já foi gerada.' })
    const livro = b.livroId
      ? await prisma.secLivro.findFirst({ where: { id: b.livroId, tenantId, aberto: true } })
      : await prisma.secLivro.findFirst({ where: { tenantId, tipo: 'ATAS_COLACAO', aberto: true }, orderBy: { numero: 'desc' } })
    const formandos = await prisma.secColacaoFormando.findMany({ where: { colacaoId: c.id, tenantId }, orderBy: { nome: 'asc' } })
    const colaram = formandos.filter((f) => f.status === 'COLOU')
    const ausentes = formandos.filter((f) => f.status === 'AUSENTE')
    if (!colaram.length) return res.status(409).json({ error: 'Nenhum formando marcado como COLOU.' })
    const b0 = await getBranding(tenantId)
    const numero = livro ? await proximoNumero(tenantId, `ATA:${livro.id}`) : null
    const conteudo = `<p>Aos ${esc(dataExtenso(c.data))}${c.local ? `, no(a) ${esc(c.local)}` : ''}, realizou-se a sessão solene de <b>colação de grau</b> "${esc(c.nome)}" da ${esc(b0.nome)}, presidida pela autoridade institucional, com a presença dos formandos abaixo relacionados, que prestaram o compromisso legal e receberam o grau:</p><ol>${colaram.map((f) => `<li>${esc(f.nome)}${f.juramento ? '' : ' (sem juramento)'}</li>`).join('')}</ol>${ausentes.length ? `<p>Ausentes: ${ausentes.map((f) => esc(f.nome)).join(', ')}.</p>` : ''}${b.observacoes ? `<p>${esc(b.observacoes)}</p>` : ''}<p>Nada mais havendo a tratar, lavrou-se a presente ata, assinada pelas autoridades presentes.</p>`
    const ata = await prisma.secAta.create({ data: { tenantId, livroId: livro?.id, numero: numero ?? undefined, tipo: 'COLACAO', titulo: `Ata de colação de grau — ${c.nome}`, data: c.data, conteudo, participantes: colaram.map((f) => ({ nome: f.nome, papel: 'Formando' })) as any, colacaoId: c.id, createdById: getUserId(req) } })
    await prisma.secColacao.update({ where: { id: c.id }, data: { ataId: ata.id } })
    let diplomasCriados = 0
    if (b.gerarDiplomas) {
      for (const f of colaram) {
        const ex = await prisma.secDiploma.findFirst({ where: { tenantId, studentId: f.studentId, tipo: 'DIPLOMA', status: { not: 'CANCELADO' } } })
        if (ex) {
          await prisma.secDiploma.update({ where: { id: ex.id }, data: { colacaoId: c.id, dataColacao: c.data } })
          await prisma.secColacaoFormando.update({ where: { id: f.id }, data: { diplomaId: ex.id } })
        } else {
          const d = await prisma.secDiploma.create({ data: { tenantId, studentId: f.studentId, programId: c.programId, tipo: 'DIPLOMA', colacaoId: c.id, dataColacao: c.data } })
          await prisma.secColacaoFormando.update({ where: { id: f.id }, data: { diplomaId: d.id } })
          await scheduleReminder({ tenantId, modulo: MODULO, titulo: `Diploma de ${f.nome}: iniciar conferência`, dueAt: new Date(Date.now() + 10 * DAY), antecedenciaDias: 7, refType: REF, refId: d.id, assigneeRole: 'SECRETARY', dedupeKey: `sec:dip:${d.id}` })
          diplomasCriados++
        }
      }
    }
    await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'COLACAO_ATA', refType: 'SecColacao', refId: c.id, detalhes: { ataId: ata.id, diplomasCriados } })
    res.status(201).json({ ata, diplomasCriados })
  }))
}

export async function reavaliarFormandos(tenantId: string, c: { id: string; programId: string | null }) {
  const fs = await prisma.secColacaoFormando.findMany({ where: { colacaoId: c.id, tenantId, status: { in: ['INSCRITO', 'APTO', 'PENDENTE'] } } })
  let aptos = 0
  let pendentes = 0
  for (const f of fs) {
    const apt = await avaliarFormando(tenantId, f.studentId, c.programId)
    await prisma.secColacaoFormando.update({ where: { id: f.id }, data: { status: apt.apto ? 'APTO' : 'PENDENTE', pendencias: apt.pendencias } })
    apt.apto ? aptos++ : pendentes++
  }
  return { avaliados: fs.length, aptos, pendentes }
}

function paginaSimples(b: Awaited<ReturnType<typeof getBranding>>, titulo: string, corpo: string) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${esc(titulo)}</title>
<style>@page{size:A4;margin:14mm}body{margin:0;background:#eef1f6;font-family:Georgia,serif;color:#0f172a}.f{max-width:820px;margin:16px auto;background:#fff;box-shadow:0 2px 12px #0002;min-height:900px}.c{padding:24px 44px;line-height:1.7;font-size:15px}table{width:100%;border-collapse:collapse;font-size:13px}th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:left}th{background:#f1f5f9}.b{max-width:820px;margin:8px auto;text-align:right;font:13px sans-serif}@media print{body{background:#fff}.f{box-shadow:none;margin:0}.b{display:none}}</style></head><body><div class="b"><button onclick="window.print()">Imprimir / salvar PDF</button></div><div class="f">${brandHeaderHtml(b, { titulo })}<div class="c">${corpo}</div></div></body></html>`
}
