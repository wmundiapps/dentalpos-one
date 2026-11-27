import { createHash } from 'crypto'
import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { pageParams, parseBody, qs } from '../core/crud'
import { audit, notify } from '../core/notify'
import { getBranding } from '../core/branding'
import { cancelReminders, completeReminders, scheduleReminder } from '../core/reminders'
import { registerEduJob } from '../core/jobs'
import { ataDefesaHtml } from './ata'
import { TRANSICOES_TRABALHO, addDays, calcularResultadoBanca, pendenciasTrabalho, podeTransicionar, prazosDefesa, similaridadeTexto, statusSimilaridade } from './lib'
import { DOCENTES, GESTAO, LEITORES, MOD, alunoLite, ehAluno, ehGestor, httpErr, nomeUsuario } from './common'

const ROTULO: Record<string, string> = { TCC: 'Trabalho de Conclusão de Curso', MONOGRAFIA: 'Monografia', DISSERTACAO: 'Dissertação de Mestrado', TESE: 'Tese de Doutorado' }
const NOTA_MINIMA: Record<string, number> = { TCC: 6, MONOGRAFIA: 6, DISSERTACAO: 7, TESE: 7 }

async function carregar(req: AuthenticatedRequest, id: string, include: any = undefined) {
  const tenantId = getTenantId(req)
  const t = await prisma.pesTrabalho.findFirst({ where: { id, tenantId }, include })
  if (!t) throw httpErr(404, 'Trabalho não encontrado.')
  return t as any
}

async function souMembroBanca(tenantId: string, trabalhoId: string, userId: string) {
  return !!(await prisma.pesTrabalhoBanca.findFirst({ where: { tenantId, trabalhoId, userId }, select: { id: true } }))
}

async function podeVer(req: AuthenticatedRequest, t: any) {
  if (ehGestor(req)) return true
  if (['SECRETARY', 'LIBRARIAN', 'STAFF'].includes(String(req.user?.role))) return true
  if (ehAluno(req)) return t.studentId === req.user!.studentId
  return t.orientadorUserId === req.user!.id || (await souMembroBanca(t.tenantId, t.id, req.user!.id))
}
const podeGerir = (req: AuthenticatedRequest, t: any) => ehGestor(req) || t.orientadorUserId === req.user!.id

async function registrarEvento(tenantId: string, trabalhoId: string, de: string | null, para: string, userId?: string, observacao?: string) {
  await prisma.pesTrabalhoEvento.create({ data: { tenantId, trabalhoId, de, para, userId, observacao } })
}

async function estadoParaValidacao(t: any) {
  const [versoes, banca] = await Promise.all([
    prisma.pesTrabalhoVersao.findMany({ where: { trabalhoId: t.id }, select: { tipo: true } }),
    prisma.pesTrabalhoBanca.findMany({ where: { trabalhoId: t.id }, select: { fase: true, papel: true, convite: true, nota: true } }),
  ])
  return { ...t, versoes, banca, exigeQualificacao: t.tipo === 'DISSERTACAO' || t.tipo === 'TESE' }
}

// agenda toda a régua de lembretes da defesa
async function agendarReguaDefesa(t: any) {
  const prazos = prazosDefesa(t.dataDefesa)
  for (const p of prazos) {
    await scheduleReminder({
      tenantId: t.tenantId, modulo: MOD, titulo: `${p.titulo} — ${t.alunoNome}`, descricao: t.titulo, dueAt: p.dueAt, antecedenciaDias: p.antecedenciaDias, severity: p.severity,
      refType: 'PesTrabalho', refId: t.id, assigneeStudentId: p.papel === 'ALUNO' ? t.studentId : undefined, assigneeUserId: p.papel === 'ORIENTADOR' ? t.orientadorUserId ?? undefined : undefined,
      assigneeRole: p.papel === 'COORDENACAO' || (p.papel === 'ORIENTADOR' && !t.orientadorUserId) ? 'COORDINATOR' : undefined, dedupeKey: `pes-tcc-${t.id}-${p.chave}`,
    })
  }
  await prisma.pesTrabalho.update({ where: { id: t.id }, data: { prazoVersaoFinal: prazos.find((x) => x.chave === 'versao-final')!.dueAt, prazoDeposito: prazos.find((x) => x.chave === 'deposito')!.dueAt } })
}

export default function mountTcc(router: Router) {
  router.get(
    '/trabalhos',
    requireRole(...LEITORES, 'STUDENT'),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const { skip, take, page, pageSize } = pageParams(req.query)
      const where: any = { tenantId }
      for (const f of ['status', 'tipo', 'programId', 'orientadorUserId', 'studentId', 'grupoId']) {
        const v = qs((req.query as any)[f])
        if (v) where[f] = v
      }
      const q = qs(req.query.q)
      if (q) where.OR = [{ titulo: { contains: q, mode: 'insensitive' } }, { alunoNome: { contains: q, mode: 'insensitive' } }]
      if (ehAluno(req)) where.studentId = req.user!.studentId ?? '-'
      else if (String(req.user?.role) === 'TEACHER') {
        const mine = [{ orientadorUserId: req.user!.id }, { banca: { some: { userId: req.user!.id } } }]
        where.AND = [...(where.AND ?? []), { OR: mine }]
      }
      const [items, total] = await Promise.all([prisma.pesTrabalho.findMany({ where, orderBy: { updatedAt: 'desc' }, skip, take }), prisma.pesTrabalho.count({ where })])
      res.json({ items, total, page, pageSize })
    }),
  )

  router.get(
    '/trabalhos/:id',
    requireRole(...LEITORES, 'STUDENT'),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const t = await carregar(req, String(req.params.id), { banca: true, versoes: { select: { id: true, numero: true, tipo: true, arquivoUrl: true, similaridadePct: true, observacoes: true, createdAt: true }, orderBy: { numero: 'asc' } }, eventos: { orderBy: { createdAt: 'asc' } }, orientacoes: { orderBy: { data: 'desc' } } })
      if (!(await podeVer(req, t))) return res.status(404).json({ error: 'Trabalho não encontrado.' })
      const pend: Record<string, string[]> = {}
      const est = await estadoParaValidacao(t)
      for (const para of TRANSICOES_TRABALHO[t.status] ?? []) pend[para] = pendenciasTrabalho(est, para)
      res.json({ ...t, proximasEtapas: pend })
    }),
  )

  router.post(
    '/trabalhos',
    requireRole(...DOCENTES, 'STUDENT'),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const d = parseBody(z.object({
        tipo: z.enum(['TCC', 'MONOGRAFIA', 'DISSERTACAO', 'TESE']).default('TCC'), titulo: z.string().trim().min(5), tema: z.string().optional().nullable(), resumo: z.string().optional().nullable(),
        palavrasChave: z.array(z.string()).default([]), studentId: z.string().optional(), programId: z.string().optional().nullable(), orientadorUserId: z.string().optional().nullable(),
        coorientadorNome: z.string().optional().nullable(), projetoId: z.string().optional().nullable(), grupoId: z.string().optional().nullable(),
        prazoQualificacao: z.coerce.date().optional().nullable(), prazoDefesa: z.coerce.date().optional().nullable(), similaridadeLimite: z.number().min(0).max(100).optional(),
      }), req.body)
      const studentId = ehAluno(req) ? req.user!.studentId : d.studentId
      if (!studentId) throw httpErr(400, 'Informe o aluno (studentId).')
      const s = await alunoLite(tenantId, studentId)
      if (!s) throw httpErr(404, 'Aluno não encontrado.')
      const ativo = await prisma.pesTrabalho.findFirst({ where: { tenantId, studentId, tipo: d.tipo, status: { notIn: ['CANCELADO', 'REPROVADO', 'DEPOSITADO'] } } })
      if (ativo) throw httpErr(409, 'O aluno já possui um trabalho do mesmo tipo em andamento.')
      let orientadorUserId = d.orientadorUserId ?? null
      if (ehAluno(req)) orientadorUserId = d.orientadorUserId ?? null // aluno pode sugerir; confirmação na transição
      if (!ehGestor(req) && !ehAluno(req)) orientadorUserId = req.user!.id
      const row = await prisma.pesTrabalho.create({ data: { ...d, tenantId, studentId, alunoNome: s.nomeCompleto, orientadorUserId, orientadorNome: await nomeUsuario(tenantId, orientadorUserId), status: 'TEMA', similaridadeLimite: d.similaridadeLimite ?? (['DISSERTACAO', 'TESE'].includes(d.tipo) ? 15 : 20) } })
      await registrarEvento(tenantId, row.id, null, 'TEMA', getUserId(req), 'Trabalho criado')
      await scheduleReminder({ tenantId, modulo: MOD, titulo: `Definir orientador de ${s.nomeCompleto}`, dueAt: addDays(new Date(), 15), refType: 'PesTrabalhoOrientador', refId: row.id, assigneeRole: 'COORDINATOR', dedupeKey: `pes-tcc-orient-${row.id}` })
      if (orientadorUserId) await completeReminders({ tenantId, refType: 'PesTrabalhoOrientador', refId: row.id })
      if (row.prazoDefesa) await scheduleReminder({ tenantId, modulo: MOD, titulo: `Prazo final de defesa — ${s.nomeCompleto}`, dueAt: row.prazoDefesa, antecedenciaDias: 30, severity: 'ATENCAO', refType: 'PesTrabalhoPrazoDefesa', refId: row.id, assigneeStudentId: studentId, dedupeKey: `pes-tcc-prazodefesa-${row.id}` })
      await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'CRIAR_TRABALHO', refType: 'PesTrabalho', refId: row.id })
      res.status(201).json(row)
    }),
  )

  router.patch(
    '/trabalhos/:id',
    requireRole(...DOCENTES, 'STUDENT'),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const t = await carregar(req, String(req.params.id))
      if (!(await podeVer(req, t))) throw httpErr(404, 'Trabalho não encontrado.')
      if (['DEPOSITADO', 'CANCELADO'].includes(t.status)) throw httpErr(409, 'Trabalho encerrado.')
      const base = z.object({ titulo: z.string().trim().min(5).optional(), tema: z.string().optional().nullable(), resumo: z.string().optional().nullable(), abstract: z.string().optional().nullable(), palavrasChave: z.array(z.string()).optional() })
      const gestao = base.extend({
        orientadorUserId: z.string().optional().nullable(), coorientadorNome: z.string().optional().nullable(), programId: z.string().optional().nullable(), projetoId: z.string().optional().nullable(), grupoId: z.string().optional().nullable(),
        dataQualificacao: z.coerce.date().optional().nullable(), prazoQualificacao: z.coerce.date().optional().nullable(), prazoDefesa: z.coerce.date().optional().nullable(),
        dataDefesa: z.coerce.date().optional().nullable(), localDefesa: z.string().optional().nullable(), modoDefesa: z.enum(['PRESENCIAL', 'REMOTA', 'HIBRIDA']).optional(), linkSala: z.string().optional().nullable(), similaridadeLimite: z.number().min(0).max(100).optional(),
      })
      const d: any = parseBody(podeGerir(req, t) ? gestao : base, req.body)
      if (!ehGestor(req) && d.orientadorUserId !== undefined) throw httpErr(403, 'Somente a coordenação altera o orientador.')
      if (d.orientadorUserId) {
        d.orientadorNome = await nomeUsuario(tenantId, d.orientadorUserId)
        if (!d.orientadorNome) throw httpErr(404, 'Orientador não encontrado.')
        await completeReminders({ tenantId, refType: 'PesTrabalhoOrientador', refId: t.id, userId: getUserId(req) })
      }
      if (d.dataDefesa && d.dataDefesa.getTime() < Date.now() - 86_400_000 && t.status !== 'DEFESA') throw httpErr(400, 'Data de defesa no passado.')
      if (d.prazoDefesa && t.status !== 'DEFESA') await scheduleReminder({ tenantId, modulo: MOD, titulo: `Prazo final de defesa — ${t.alunoNome}`, dueAt: d.prazoDefesa, antecedenciaDias: 30, severity: 'ATENCAO', refType: 'PesTrabalhoPrazoDefesa', refId: t.id, assigneeStudentId: t.studentId, dedupeKey: `pes-tcc-prazodefesa-${t.id}` })
      if (d.prazoQualificacao) await scheduleReminder({ tenantId, modulo: MOD, titulo: `Prazo de qualificação — ${t.alunoNome}`, dueAt: d.prazoQualificacao, antecedenciaDias: 21, severity: 'ATENCAO', refType: 'PesTrabalho', refId: t.id, assigneeStudentId: t.studentId, dedupeKey: `pes-tcc-prazoqual-${t.id}` })
      const row = await prisma.pesTrabalho.update({ where: { id: t.id }, data: d })
      // reagendar régua se a data da defesa mudou com banca já agendada
      if (d.dataDefesa && ['BANCA_AGENDADA'].includes(t.status)) await agendarReguaDefesa(row)
      await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'ATUALIZAR_TRABALHO', refType: 'PesTrabalho', refId: t.id })
      res.json(row)
    }),
  )

  // ---------- Transição do ciclo ----------
  router.post(
    '/trabalhos/:id/transicao',
    requireRole(...DOCENTES),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const { para, observacao } = parseBody(z.object({ para: z.enum(['TEMA', 'ORIENTACAO', 'PROJETO', 'QUALIFICACAO', 'BANCA_AGENDADA', 'DEFESA', 'VERSAO_FINAL', 'DEPOSITADO', 'REPROVADO', 'CANCELADO']), observacao: z.string().optional() }), req.body)
      const t = await carregar(req, String(req.params.id))
      if (!podeGerir(req, t)) throw httpErr(403, 'Somente o orientador ou a coordenação conduzem o ciclo.')
      if (['REPROVADO', 'DEPOSITADO'].includes(para) && !ehGestor(req)) throw httpErr(403, 'Somente a coordenação registra este desfecho.')
      if (!podeTransicionar(TRANSICOES_TRABALHO, t.status, para)) throw httpErr(409, `Transição inválida: ${t.status} → ${para}.`)
      if (['CANCELADO'].includes(para) && !observacao) throw httpErr(400, 'Informe o motivo do cancelamento.')
      const pend = pendenciasTrabalho(await estadoParaValidacao(t), para)
      if (pend.length) return res.status(422).json({ error: 'Pendências impedem a transição.', pendencias: pend })
      const patch: any = { status: para }
      if (para === 'QUALIFICACAO' && !t.dataQualificacao) patch.dataQualificacao = null
      const row = await prisma.pesTrabalho.update({ where: { id: t.id }, data: patch })
      await registrarEvento(tenantId, t.id, t.status, para, getUserId(req), observacao)
      if (para === 'ORIENTACAO') await completeReminders({ tenantId, refType: 'PesTrabalhoOrientador', refId: t.id })
      if (para === 'BANCA_AGENDADA') await agendarReguaDefesa(row)
      if (para === 'DEFESA') {
        // encerra só a régua pré-defesa; versão final e depósito continuam valendo
        await prisma.eduReminder.updateMany({
          where: { tenantId, refType: 'PesTrabalho', refId: t.id, status: { in: ['PENDENTE', 'NOTIFICADO', 'ADIADO'] }, dedupeKey: { in: ['convites', 'texto-banca', 'similaridade', 'confirmacao', 'vespera'].map((k) => `pes-tcc-${t.id}-${k}`) } },
          data: { status: 'CANCELADO' },
        })
        await completeReminders({ tenantId, refType: 'PesTrabalhoPrazoDefesa', refId: t.id })
      }
      if (['CANCELADO', 'REPROVADO', 'DEPOSITADO'].includes(para)) for (const rt of ['PesTrabalho', 'PesTrabalhoPrazoDefesa', 'PesTrabalhoOrientador']) await cancelReminders({ tenantId, refType: rt, refId: t.id })
      if (para === 'DEPOSITADO') await prisma.pesTrabalho.update({ where: { id: t.id }, data: { depositadoEm: new Date() } })
      await notify({ tenantId, studentId: t.studentId, assunto: `Seu ${ROTULO[t.tipo] ?? 'trabalho'}: ${para}`, mensagem: `O status do seu trabalho "${t.titulo}" mudou para ${para}.${observacao ? ' Obs.: ' + observacao : ''}`, refType: 'PesTrabalho', refId: t.id })
      await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: `TRABALHO_${para}`, refType: 'PesTrabalho', refId: t.id, detalhes: { de: t.status, observacao } })
      res.json(row)
    }),
  )

  // ---------- Banca ----------
  router.post(
    '/trabalhos/:id/banca',
    requireRole(...DOCENTES),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const t = await carregar(req, String(req.params.id))
      if (!podeGerir(req, t)) throw httpErr(403, 'Sem permissão.')
      const d = parseBody(z.object({ fase: z.enum(['QUALIFICACAO', 'DEFESA']).default('DEFESA'), userId: z.string().optional().nullable(), nome: z.string().trim().min(3).optional(), instituicao: z.string().optional().nullable(), titulacao: z.string().optional().nullable(), papel: z.enum(['PRESIDENTE', 'EXAMINADOR_INTERNO', 'EXAMINADOR_EXTERNO', 'SUPLENTE']).default('EXAMINADOR_INTERNO'), email: z.string().email().optional().nullable() }), req.body)
      const nome = d.nome ?? (await nomeUsuario(tenantId, d.userId))
      if (!nome) throw httpErr(400, 'Informe o nome do membro (ou userId).')
      if (d.userId && d.papel !== 'PRESIDENTE' && d.userId === t.orientadorUserId) throw httpErr(422, 'O orientador deve ser o presidente da banca.')
      if (d.papel === 'PRESIDENTE' && t.orientadorUserId && d.userId && d.userId !== t.orientadorUserId) throw httpErr(422, 'O presidente da banca é o orientador do trabalho.')
      if (d.papel === 'EXAMINADOR_EXTERNO' && d.userId) { /* docente interno marcado como externo — permitido só se vier de outra instituição */ }
      const atual = await prisma.pesTrabalhoBanca.findMany({ where: { tenantId, trabalhoId: t.id, fase: d.fase } })
      if (d.papel === 'PRESIDENTE' && atual.some((b) => b.papel === 'PRESIDENTE')) throw httpErr(409, 'Já há presidente nesta banca.')
      if (atual.some((b) => (d.userId && b.userId === d.userId) || b.nome.toLowerCase() === nome.toLowerCase())) throw httpErr(409, 'Membro já faz parte da banca.')
      if (t.coorientadorNome && t.coorientadorNome.toLowerCase() === nome.toLowerCase() && d.papel !== 'SUPLENTE') { /* coorientador pode compor, sem voto a mais */ }
      const row = await prisma.pesTrabalhoBanca.create({ data: { ...d, nome, tenantId, trabalhoId: t.id, convite: d.papel === 'PRESIDENTE' ? 'CONFIRMADO' : 'PENDENTE' } })
      if (d.userId) {
        await notify({ tenantId, userId: d.userId, assunto: 'Convite para banca examinadora', mensagem: `Você foi convidado(a) para a banca de ${d.fase === 'DEFESA' ? 'defesa' : 'qualificação'} de ${t.alunoNome}: "${t.titulo}"${t.dataDefesa ? ' em ' + t.dataDefesa.toLocaleDateString('pt-BR') : ''}. Responda ao convite.`, refType: 'PesTrabalhoBanca', refId: row.id })
        await scheduleReminder({ tenantId, modulo: MOD, titulo: `Responder convite de banca — ${t.alunoNome}`, dueAt: addDays(new Date(), 7), antecedenciaDias: 3, refType: 'PesTrabalhoBanca', refId: row.id, assigneeUserId: d.userId, dedupeKey: `pes-banca-convite-${row.id}` })
      } else if (d.email) {
        await notify({ tenantId, canal: 'EMAIL', destino: d.email, assunto: 'Convite para banca examinadora', mensagem: `Prezado(a) ${nome}, convidamos para compor a banca de ${d.fase === 'DEFESA' ? 'defesa' : 'qualificação'} de ${t.alunoNome}: "${t.titulo}"${t.dataDefesa ? ' em ' + t.dataDefesa.toLocaleDateString('pt-BR') : ''}. Responda à coordenação para confirmar.`, refType: 'PesTrabalhoBanca', refId: row.id })
      }
      await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'ADICIONAR_BANCA', refType: 'PesTrabalho', refId: t.id })
      res.status(201).json(row)
    }),
  )
  router.delete(
    '/trabalhos/:id/banca/:membroId',
    requireRole(...DOCENTES),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const t = await carregar(req, String(req.params.id))
      if (!podeGerir(req, t)) throw httpErr(403, 'Sem permissão.')
      if (['DEFESA', 'VERSAO_FINAL', 'DEPOSITADO'].includes(t.status)) throw httpErr(409, 'Banca já utilizada na defesa.')
      const r = await prisma.pesTrabalhoBanca.deleteMany({ where: { id: String(req.params.membroId), tenantId, trabalhoId: t.id } })
      if (!r.count) return res.status(404).json({ error: 'Membro não encontrado.' })
      await cancelReminders({ tenantId, refType: 'PesTrabalhoBanca', refId: String(req.params.membroId) })
      res.status(204).end()
    }),
  )
  router.post(
    '/banca/:membroId/convite',
    requireRole(...DOCENTES),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const { resposta } = parseBody(z.object({ resposta: z.enum(['CONFIRMADO', 'RECUSADO']) }), req.body)
      const m = await prisma.pesTrabalhoBanca.findFirst({ where: { id: String(req.params.membroId), tenantId }, include: { trabalho: true } })
      if (!m) return res.status(404).json({ error: 'Convite não encontrado.' })
      if (m.userId !== req.user!.id && !ehGestor(req) && m.trabalho.orientadorUserId !== req.user!.id) throw httpErr(403, 'Somente o convidado (ou coordenação/orientador) responde ao convite.')
      const row = await prisma.pesTrabalhoBanca.update({ where: { id: m.id }, data: { convite: resposta } })
      await completeReminders({ tenantId, refType: 'PesTrabalhoBanca', refId: m.id, userId: getUserId(req) })
      if (resposta === 'RECUSADO') {
        const alvo = m.trabalho.orientadorUserId
        if (alvo) await notify({ tenantId, userId: alvo, assunto: 'Convite de banca recusado', mensagem: `${m.nome} recusou o convite para a banca de ${m.trabalho.alunoNome}. Indique um substituto.`, refType: 'PesTrabalho', refId: m.trabalhoId })
        await scheduleReminder({ tenantId, modulo: MOD, titulo: `Substituir membro de banca (${m.nome}) — ${m.trabalho.alunoNome}`, dueAt: addDays(new Date(), 5), severity: 'ATENCAO', refType: 'PesTrabalho', refId: m.trabalhoId, assigneeUserId: alvo ?? undefined, assigneeRole: alvo ? undefined : 'COORDINATOR', dedupeKey: `pes-banca-subst-${m.id}` })
      }
      res.json(row)
    }),
  )

  // ---------- Versões do texto e similaridade ----------
  router.post(
    '/trabalhos/:id/versoes',
    requireRole(...DOCENTES, 'STUDENT'),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const t = await carregar(req, String(req.params.id))
      if (!(await podeVer(req, t)) || (!podeGerir(req, t) && !ehAluno(req))) throw httpErr(403, 'Sem permissão.')
      const d = parseBody(z.object({ tipo: z.enum(['PROJETO', 'QUALIFICACAO', 'DEFESA', 'FINAL']).default('PROJETO'), arquivoUrl: z.string().optional().nullable(), texto: z.string().optional().nullable(), observacoes: z.string().optional().nullable() }), req.body)
      if (!d.arquivoUrl && !d.texto) throw httpErr(400, 'Informe arquivoUrl e/ou texto.')
      if (d.tipo === 'FINAL' && !['DEFESA', 'VERSAO_FINAL'].includes(t.status)) throw httpErr(409, 'A versão final só é enviada após a defesa.')
      const ult = await prisma.pesTrabalhoVersao.findFirst({ where: { trabalhoId: t.id }, orderBy: { numero: 'desc' }, select: { numero: true } })
      let similaridadePct: number | null = null
      if (d.texto && d.texto.length > 200) similaridadePct = await calcularSimilaridadeInterna(tenantId, t.id, d.texto)
      const row = await prisma.pesTrabalhoVersao.create({ data: { tenantId, trabalhoId: t.id, numero: (ult?.numero ?? 0) + 1, tipo: d.tipo, arquivoUrl: d.arquivoUrl ?? null, texto: d.texto ?? null, hashTexto: d.texto ? createHash('sha256').update(d.texto).digest('hex') : null, similaridadePct, observacoes: d.observacoes ?? null, enviadoPorId: getUserId(req) } })
      await registrarEvento(tenantId, t.id, null, `VERSAO_${d.tipo}`, getUserId(req), `Versão ${row.numero} enviada`)
      if (t.orientadorUserId && t.orientadorUserId !== req.user!.id) await notify({ tenantId, userId: t.orientadorUserId, assunto: 'Nova versão de trabalho', mensagem: `${t.alunoNome} enviou a versão ${row.numero} (${d.tipo}) de "${t.titulo}".`, refType: 'PesTrabalho', refId: t.id })
      const { texto: _t, ...semTexto } = row
      res.status(201).json(semTexto)
    }),
  )

  // verificação de similaridade: manual (percentual informado por ferramenta externa) ou automática (trechos repetidos vs. acervo interno)
  router.post(
    '/trabalhos/:id/similaridade',
    requireRole(...DOCENTES),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const t = await carregar(req, String(req.params.id))
      if (!podeGerir(req, t)) throw httpErr(403, 'Sem permissão.')
      const d = parseBody(z.object({ percentual: z.number().min(0).max(100).optional(), fonte: z.string().optional(), observacoes: z.string().optional(), auto: z.boolean().default(false), versaoId: z.string().optional(), justificativa: z.string().trim().min(10).optional() }), req.body)
      let pct = d.percentual
      let trechos: string[] = []
      let porFonte: any[] = []
      if (d.auto) {
        const v = await prisma.pesTrabalhoVersao.findFirst({ where: { tenantId, trabalhoId: t.id, ...(d.versaoId ? { id: d.versaoId } : { texto: { not: null } }) }, orderBy: { numero: 'desc' } })
        if (!v?.texto) throw httpErr(422, 'Nenhuma versão com texto para verificar.')
        const fontes = await fontesInternas(tenantId, t.id)
        const r = similaridadeTexto(v.texto, fontes)
        pct = r.percentual
        trechos = r.trechos
        porFonte = r.porFonte
        await prisma.pesTrabalhoVersao.update({ where: { id: v.id }, data: { similaridadePct: pct } })
      }
      if (pct == null) throw httpErr(400, 'Informe o percentual ou use auto=true.')
      let status = statusSimilaridade(pct, t.similaridadeLimite)
      let st: string = status
      if (status === 'REPROVADA' && d.justificativa) {
        if (!ehGestor(req)) throw httpErr(403, 'Somente a coordenação pode justificar similaridade acima do limite.')
        st = 'JUSTIFICADA'
      }
      const row = await prisma.pesTrabalho.update({ where: { id: t.id }, data: { similaridadePct: pct, similaridadeStatus: st, similaridadeFonte: d.auto ? 'AUTOMATICA_INTERNA' : d.fonte ?? 'MANUAL', similaridadeObs: d.justificativa ?? d.observacoes ?? null } })
      await completeReminders({ tenantId, refType: 'PesTrabalhoSimilaridade', refId: t.id })
      if (st === 'REPROVADA') await notify({ tenantId, studentId: t.studentId, assunto: 'Similaridade acima do limite', mensagem: `O índice de similaridade (${pct.toFixed(1)}%) excede o limite de ${t.similaridadeLimite}%. Revise o texto com seu orientador.`, refType: 'PesTrabalho', refId: t.id })
      await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'VERIFICAR_SIMILARIDADE', refType: 'PesTrabalho', refId: t.id, detalhes: { pct, status: st } })
      res.json({ trabalho: row, percentual: pct, status: st, limite: t.similaridadeLimite, trechos, porFonte })
    }),
  )

  // ---------- Resultado da defesa ----------
  router.post(
    '/trabalhos/:id/resultado',
    requireRole(...DOCENTES),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const t = await carregar(req, String(req.params.id), { banca: true })
      if (!podeGerir(req, t)) throw httpErr(403, 'Somente o presidente/orientador ou a coordenação lançam o resultado.')
      if (t.status !== 'DEFESA') throw httpErr(409, 'O resultado só é lançado com o trabalho em status DEFESA.')
      const d = parseBody(z.object({ notas: z.array(z.object({ membroId: z.string(), nota: z.number().min(0).max(10), parecer: z.string().optional() })).min(1), ressalvas: z.string().optional(), notaMinima: z.number().min(0).max(10).optional() }), req.body)
      for (const n of d.notas) {
        const m = t.banca.find((b: any) => b.id === n.membroId && b.fase === 'DEFESA')
        if (!m) throw httpErr(404, `Membro ${n.membroId} não pertence à banca de defesa.`)
        await prisma.pesTrabalhoBanca.update({ where: { id: m.id }, data: { nota: n.nota, parecer: n.parecer ?? null, assinouEm: new Date() } })
      }
      const banca = await prisma.pesTrabalhoBanca.findMany({ where: { trabalhoId: t.id, fase: 'DEFESA' } })
      const calc = calcularResultadoBanca(banca.filter((b) => b.convite !== 'RECUSADO'), { notaMinima: d.notaMinima ?? NOTA_MINIMA[t.tipo] ?? 7 })
      if (calc.resultado == null) return res.status(422).json({ error: `Faltam notas de ${calc.pendentes} membro(s) titular(es) da banca.` })
      const resultado = calc.resultado === 'REPROVADO' ? 'REPROVADO' : d.ressalvas ? 'APROVADO_COM_RESSALVAS' : 'APROVADO'
      const novoStatus = resultado === 'REPROVADO' ? 'REPROVADO' : 'VERSAO_FINAL'
      const row = await prisma.pesTrabalho.update({ where: { id: t.id }, data: { notaFinal: calc.media, resultado, ressalvas: d.ressalvas ?? null, status: novoStatus as any } })
      await registrarEvento(tenantId, t.id, 'DEFESA', novoStatus, getUserId(req), `Resultado: ${resultado} (média ${calc.media})`)
      if (novoStatus === 'VERSAO_FINAL') {
        const prazoVf = row.prazoVersaoFinal ?? addDays(new Date(), 30)
        await scheduleReminder({ tenantId, modulo: MOD, titulo: `Entregar versão final corrigida — ${t.alunoNome}`, dueAt: prazoVf, antecedenciaDias: 10, severity: 'CRITICO', refType: 'PesTrabalho', refId: t.id, assigneeStudentId: t.studentId, dedupeKey: `pes-tcc-${t.id}-versao-final` })
      } else await cancelReminders({ tenantId, refType: 'PesTrabalho', refId: t.id })
      await notify({ tenantId, studentId: t.studentId, assunto: 'Resultado da defesa', mensagem: `Resultado da defesa de "${t.titulo}": ${resultado.replace(/_/g, ' ')} (média ${calc.media?.toFixed(2)}).${d.ressalvas ? ' Ressalvas: ' + d.ressalvas : ''}`, refType: 'PesTrabalho', refId: t.id })
      await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'RESULTADO_DEFESA', refType: 'PesTrabalho', refId: t.id, detalhes: { media: calc.media, resultado } })
      res.json({ trabalho: row, media: calc.media, resultado })
    }),
  )

  // ---------- Ata em HTML ----------
  router.get(
    '/trabalhos/:id/ata',
    requireRole(...DOCENTES, 'SECRETARY'),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      let t = await carregar(req, String(req.params.id), { banca: true })
      if (!(await podeVer(req, t))) throw httpErr(404, 'Trabalho não encontrado.')
      const fase = qs(req.query.fase) === 'QUALIFICACAO' ? 'QUALIFICACAO' : 'DEFESA'
      const data = fase === 'DEFESA' ? t.dataDefesa : t.dataQualificacao
      if (!data) throw httpErr(422, `Data de ${fase === 'DEFESA' ? 'defesa' : 'qualificação'} não definida.`)
      if (!t.ataNumero && fase === 'DEFESA') {
        const n = await prisma.pesTrabalho.count({ where: { tenantId, ataNumero: { not: null } } })
        t = await prisma.pesTrabalho.update({ where: { id: t.id }, data: { ataNumero: `${new Date().getFullYear()}/${String(n + 1).padStart(3, '0')}` }, include: { banca: true } })
      }
      const banca = t.banca.filter((b: any) => b.fase === fase)
      const calc = calcularResultadoBanca(banca, { notaMinima: NOTA_MINIMA[t.tipo] ?? 7 })
      const prog = t.programId ? await prisma.academicProgram.findFirst({ where: { id: t.programId, tenantId }, select: { nome: true } }) : null
      const b = await getBranding(tenantId)
      const html = ataDefesaHtml(b, { numero: t.ataNumero ?? `Q-${t.id.slice(0, 6)}`, tipoRotulo: ROTULO[t.tipo] ?? t.tipo, titulo: t.titulo, alunoNome: t.alunoNome, programaNome: prog?.nome, orientadorNome: t.orientadorNome, coorientadorNome: t.coorientadorNome, dataDefesa: data, local: t.localDefesa, modo: t.modoDefesa, banca, media: fase === 'DEFESA' ? t.notaFinal ?? calc.media : calc.media, resultado: fase === 'DEFESA' ? t.resultado : null, ressalvas: t.ressalvas, similaridadePct: t.similaridadePct, fase })
      res.type('html').send(html)
    }),
  )

  // ---------- Depósito no repositório ----------
  router.post(
    '/trabalhos/:id/depositar',
    requireRole(...GESTAO, 'LIBRARIAN'),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const t = await carregar(req, String(req.params.id))
      const d = parseBody(z.object({ repositorioUrl: z.string().url(), handle: z.string().optional(), autorizaPublicacao: z.boolean(), embargoAte: z.coerce.date().optional().nullable() }), req.body)
      if (t.status !== 'VERSAO_FINAL') throw httpErr(409, 'Depósito só após a entrega da versão final (status VERSAO_FINAL).')
      await prisma.pesTrabalho.update({ where: { id: t.id }, data: { repositorioUrl: d.repositorioUrl, repositorioHandle: d.handle ?? null, autorizaPublicacao: d.autorizaPublicacao, embargoAte: d.embargoAte ?? null } })
      const fresh = await carregar(req, t.id)
      const pend = pendenciasTrabalho(await estadoParaValidacao(fresh), 'DEPOSITADO')
      if (pend.length) return res.status(422).json({ error: 'Pendências impedem o depósito.', pendencias: pend })
      const row = await prisma.pesTrabalho.update({ where: { id: t.id }, data: { status: 'DEPOSITADO', depositadoEm: new Date() } })
      await registrarEvento(tenantId, t.id, 'VERSAO_FINAL', 'DEPOSITADO', getUserId(req), d.repositorioUrl)
      for (const rt of ['PesTrabalho', 'PesTrabalhoPrazoDefesa', 'PesTrabalhoOrientador']) await cancelReminders({ tenantId, refType: rt, refId: t.id })
      await notify({ tenantId, studentId: t.studentId, assunto: 'Trabalho depositado', mensagem: `Seu trabalho "${t.titulo}" foi depositado no repositório institucional: ${d.repositorioUrl}`, refType: 'PesTrabalho', refId: t.id })
      await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'DEPOSITAR_TRABALHO', refType: 'PesTrabalho', refId: t.id })
      res.json(row)
    }),
  )

  // ---------- Orientações (reuniões) ----------
  router.post(
    '/trabalhos/:id/orientacoes',
    requireRole(...DOCENTES),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const t = await carregar(req, String(req.params.id))
      if (!podeGerir(req, t)) throw httpErr(403, 'Sem permissão.')
      const d = parseBody(z.object({ data: z.coerce.date(), duracaoMin: z.number().int().min(5).max(480).optional(), resumo: z.string().trim().min(10), encaminhamentos: z.string().optional() }), req.body)
      if (d.data.getTime() > Date.now() + 86_400_000) throw httpErr(400, 'Data da orientação no futuro.')
      const row = await prisma.pesTrabalhoOrientacao.create({ data: { ...d, tenantId, trabalhoId: t.id, registradoPorId: getUserId(req) } })
      await completeReminders({ tenantId, refType: 'PesTrabalhoOrientacao', refId: t.id })
      res.status(201).json(row)
    }),
  )

  // ---------- Painel / carga de orientação ----------
  router.get(
    '/trabalhos-painel',
    requireRole(...GESTAO, 'SECRETARY'),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const agora = new Date()
      const [porStatus, porOrientador, defesas, atrasados, semOrientador] = await Promise.all([
        prisma.pesTrabalho.groupBy({ by: ['status'], where: { tenantId }, _count: true }),
        prisma.pesTrabalho.groupBy({ by: ['orientadorUserId'], where: { tenantId, status: { notIn: ['DEPOSITADO', 'CANCELADO', 'REPROVADO'] } }, _count: true }),
        prisma.pesTrabalho.findMany({ where: { tenantId, status: 'BANCA_AGENDADA', dataDefesa: { gte: agora, lte: addDays(agora, 30) } }, select: { id: true, alunoNome: true, titulo: true, dataDefesa: true, localDefesa: true }, orderBy: { dataDefesa: 'asc' } }),
        prisma.pesTrabalho.count({ where: { tenantId, status: { notIn: ['DEPOSITADO', 'CANCELADO', 'REPROVADO'] }, OR: [{ prazoDefesa: { lt: agora }, status: { in: ['TEMA', 'ORIENTACAO', 'PROJETO', 'QUALIFICACAO'] } }, { prazoDeposito: { lt: agora }, status: 'VERSAO_FINAL' }] } }),
        prisma.pesTrabalho.count({ where: { tenantId, orientadorUserId: null, status: { notIn: ['DEPOSITADO', 'CANCELADO', 'REPROVADO'] } } }),
      ])
      res.json({ porStatus: porStatus.map((s) => ({ status: s.status, total: s._count })), cargaOrientadores: porOrientador.filter((o) => o.orientadorUserId).map((o) => ({ orientadorUserId: o.orientadorUserId, orientandos: o._count })).sort((a, b) => b.orientandos - a.orientandos), defesasProximas: defesas, atrasados, semOrientador })
    }),
  )

  // ---------- Job ----------
  registerEduJob('pesquisa:trabalhos-prazos', async () => {
    const agora = new Date()
    let alertas = 0
    const ativos = { notIn: ['DEPOSITADO', 'CANCELADO', 'REPROVADO'] as any }
    const semPrazo = await prisma.pesTrabalho.findMany({ where: { status: { in: ['TEMA', 'ORIENTACAO', 'PROJETO', 'QUALIFICACAO'] }, prazoDefesa: { lt: agora } }, take: 500 })
    for (const t of semPrazo) {
      await scheduleReminder({ tenantId: t.tenantId, modulo: MOD, titulo: `Prazo de defesa vencido: ${t.alunoNome}`, dueAt: agora, remindAt: agora, severity: 'CRITICO', refType: 'PesTrabalho', refId: t.id, assigneeUserId: t.orientadorUserId ?? undefined, assigneeRole: 'COORDINATOR', dedupeKey: `pes-tcc-venc-defesa-${t.id}` })
      alertas++
    }
    const dep = await prisma.pesTrabalho.findMany({ where: { status: 'VERSAO_FINAL', prazoDeposito: { lt: agora } }, take: 500 })
    for (const t of dep) {
      await scheduleReminder({ tenantId: t.tenantId, modulo: MOD, titulo: `Depósito no repositório vencido: ${t.alunoNome}`, dueAt: agora, remindAt: agora, severity: 'CRITICO', refType: 'PesTrabalho', refId: t.id, assigneeRole: 'COORDINATOR', dedupeKey: `pes-tcc-venc-dep-${t.id}` })
      alertas++
    }
    // orientandos sem registro de orientação há 45+ dias
    const lim = addDays(agora, -45)
    const emOrient = await prisma.pesTrabalho.findMany({ where: { status: { in: ['ORIENTACAO', 'PROJETO', 'QUALIFICACAO'] }, orientadorUserId: { not: null }, updatedAt: { lt: lim } }, include: { orientacoes: { orderBy: { data: 'desc' }, take: 1 } }, take: 1000 })
    for (const t of emOrient) {
      if (t.orientacoes[0] && t.orientacoes[0].data > lim) continue
      await scheduleReminder({ tenantId: t.tenantId, modulo: MOD, titulo: `Sem registro de orientação há 45+ dias: ${t.alunoNome}`, dueAt: addDays(agora, 7), remindAt: agora, severity: 'ATENCAO', refType: 'PesTrabalhoOrientacao', refId: t.id, assigneeUserId: t.orientadorUserId ?? undefined, dedupeKey: `pes-tcc-sem-orient-${t.id}` })
      alertas++
    }
    const semOri = await prisma.pesTrabalho.findMany({ where: { orientadorUserId: null, status: ativos, createdAt: { lt: addDays(agora, -15) } }, take: 500 })
    for (const t of semOri) {
      await scheduleReminder({ tenantId: t.tenantId, modulo: MOD, titulo: `Trabalho sem orientador há 15+ dias: ${t.alunoNome}`, dueAt: agora, remindAt: agora, severity: 'ATENCAO', refType: 'PesTrabalhoOrientador', refId: t.id, assigneeRole: 'COORDINATOR', dedupeKey: `pes-tcc-orient-${t.id}` })
      alertas++
    }
    return { alertas }
  })
}

async function fontesInternas(tenantId: string, excluirTrabalhoId: string) {
  const vs = await prisma.pesTrabalhoVersao.findMany({ where: { tenantId, trabalhoId: { not: excluirTrabalhoId }, texto: { not: null } }, select: { id: true, texto: true, trabalhoId: true }, orderBy: { createdAt: 'desc' }, take: 300 })
  const vistos = new Set<string>()
  const out: Array<{ id: string; texto: string }> = []
  for (const v of vs) {
    if (vistos.has(v.trabalhoId)) continue // última versão de cada trabalho
    vistos.add(v.trabalhoId)
    out.push({ id: v.trabalhoId, texto: v.texto as string })
  }
  return out
}

async function calcularSimilaridadeInterna(tenantId: string, trabalhoId: string, texto: string): Promise<number> {
  return similaridadeTexto(texto, await fontesInternas(tenantId, trabalhoId)).percentual
}
