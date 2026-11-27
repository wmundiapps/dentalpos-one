import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { pageParams, parseBody, qs } from '../core/crud'
import { audit, notify } from '../core/notify'
import { cancelReminders, completeReminders, scheduleReminder } from '../core/reminders'
import { registerEduJob } from '../core/jobs'
import { TRANSICOES_EVENTO_TRABALHO, addDays, decidirTrabalhoEvento, distribuirAvaliacoes, hashDedupe, normalizarTexto, podeTransicionar } from './lib'
import { DOCENTES, GESTAO, LEITORES, MOD, comRetentativa, ehGestor, httpErr, nomeUsuario, proximoCodigo } from './common'

const TODOS = [...DOCENTES, 'STUDENT', 'STAFF', 'LIBRARIAN', 'SECRETARY'] as any[]
const FLUXO_EVENTO = ['RASCUNHO', 'SUBMISSOES_ABERTAS', 'EM_AVALIACAO', 'RESULTADO_DIVULGADO', 'REALIZADO', 'ENCERRADO']

const eventoSchema = z.object({
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{3,60}$/).optional(),
  nome: z.string().trim().min(5),
  tipo: z.enum(['SEMANA_ACADEMICA', 'CONGRESSO', 'SIMPOSIO', 'JORNADA', 'WORKSHOP']).default('SEMANA_ACADEMICA'),
  descricao: z.string().optional().nullable(), local: z.string().optional().nullable(), modalidade: z.enum(['PRESENCIAL', 'ONLINE', 'HIBRIDO']).default('PRESENCIAL'),
  dataInicio: z.coerce.date(), dataFim: z.coerce.date(),
  prazoSubmissao: z.coerce.date().optional().nullable(), prazoAvaliacao: z.coerce.date().optional().nullable(), prazoResultado: z.coerce.date().optional().nullable(), prazoCameraReady: z.coerce.date().optional().nullable(),
  trilhas: z.array(z.string().trim().min(2)).optional(), avaliadoresPorTrabalho: z.number().int().min(1).max(5).default(2), notaMinimaAprovacao: z.number().min(0).max(10).default(6),
  anaisIsbn: z.string().optional().nullable(),
})

function validarPrazos(d: { dataInicio: Date; dataFim: Date; prazoSubmissao?: Date | null; prazoAvaliacao?: Date | null; prazoResultado?: Date | null; prazoCameraReady?: Date | null }) {
  if (d.dataFim < d.dataInicio) throw httpErr(400, 'dataFim anterior a dataInicio.')
  const seq = [d.prazoSubmissao, d.prazoAvaliacao, d.prazoResultado, d.prazoCameraReady].filter(Boolean) as Date[]
  for (let i = 1; i < seq.length; i++) if (seq[i] < seq[i - 1]) throw httpErr(400, 'Prazos fora de ordem: submissão ≤ avaliação ≤ resultado ≤ camera-ready.')
}

export default function mountEventos(router: Router) {
  router.get(
    '/eventos',
    requireRole(...TODOS),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const { skip, take, page, pageSize } = pageParams(req.query)
      const where: any = { tenantId }
      const st = qs(req.query.status)
      if (st) where.status = st
      if (String(req.user?.role) === 'STUDENT') where.status = { not: 'RASCUNHO' }
      const [items, total] = await Promise.all([prisma.pesEvento.findMany({ where, orderBy: { dataInicio: 'desc' }, skip, take, include: { _count: { select: { trabalhos: true } } } }), prisma.pesEvento.count({ where })])
      res.json({ items, total, page, pageSize })
    }),
  )
  router.get(
    '/eventos/:id',
    requireRole(...TODOS),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const e = await prisma.pesEvento.findFirst({ where: { id: String(req.params.id), tenantId }, include: { _count: { select: { trabalhos: true } } } })
      if (!e) return res.status(404).json({ error: 'Evento não encontrado.' })
      const porStatus = await prisma.pesEventoTrabalho.groupBy({ by: ['status'], where: { tenantId, eventoId: e.id }, _count: true })
      res.json({ ...e, trabalhosPorStatus: porStatus.map((p) => ({ status: p.status, total: p._count })) })
    }),
  )
  router.post(
    '/eventos',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const d = parseBody(eventoSchema, req.body)
      validarPrazos(d)
      const slug = d.slug ?? `${normalizarTexto(d.nome).replace(/\s+/g, '-').slice(0, 50)}-${d.dataInicio.getUTCFullYear()}`
      const row = await prisma.pesEvento.create({ data: { ...d, slug, tenantId, trilhas: d.trilhas ?? undefined } })
      await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'CRIAR_EVENTO', refType: 'PesEvento', refId: row.id })
      res.status(201).json(row)
    }),
  )
  const atualizar = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const e = await prisma.pesEvento.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!e) return res.status(404).json({ error: 'Evento não encontrado.' })
    if (e.status === 'ENCERRADO') throw httpErr(409, 'Evento encerrado.')
    const d = parseBody(eventoSchema.partial(), req.body)
    validarPrazos({ ...e, ...d } as any)
    const row = await prisma.pesEvento.update({ where: { id: e.id }, data: d as any })
    if (row.status === 'SUBMISSOES_ABERTAS') await agendarPrazosEvento(row)
    res.json(row)
  })
  router.put('/eventos/:id', requireRole(...GESTAO), atualizar)
  router.patch('/eventos/:id', requireRole(...GESTAO), atualizar)

  router.post(
    '/eventos/:id/transicao',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const { para } = parseBody(z.object({ para: z.enum(FLUXO_EVENTO as [string, ...string[]]) }), req.body)
      const e = await prisma.pesEvento.findFirst({ where: { id: String(req.params.id), tenantId } })
      if (!e) return res.status(404).json({ error: 'Evento não encontrado.' })
      const i = FLUXO_EVENTO.indexOf(e.status)
      if (FLUXO_EVENTO.indexOf(para) !== i + 1 && !(para === 'SUBMISSOES_ABERTAS' && e.status === 'EM_AVALIACAO')) throw httpErr(409, `Transição inválida: ${e.status} → ${para}.`)
      const pend: string[] = []
      const trabs = await prisma.pesEventoTrabalho.findMany({ where: { tenantId, eventoId: e.id }, select: { status: true } })
      if (para === 'SUBMISSOES_ABERTAS' && !e.prazoSubmissao) pend.push('Defina o prazo de submissão.')
      if (para === 'EM_AVALIACAO' && !trabs.some((t) => t.status === 'SUBMETIDO' || t.status === 'EM_AVALIACAO')) pend.push('Nenhum trabalho submetido.')
      if (para === 'RESULTADO_DIVULGADO') {
        const abertos = trabs.filter((t) => ['SUBMETIDO', 'EM_AVALIACAO'].includes(t.status)).length
        if (abertos) pend.push(`${abertos} trabalho(s) ainda sem decisão — use /fechar-avaliacao.`)
      }
      if (para === 'ENCERRADO' && !e.anaisPublicadoEm && trabs.some((t) => ['APROVADO', 'APROVADO_COM_AJUSTES', 'CAMERA_READY'].includes(t.status))) pend.push('Anais ainda não publicados (há trabalhos aprovados).')
      if (pend.length) return res.status(422).json({ error: 'Pendências impedem a transição.', pendencias: pend })
      const row = await prisma.pesEvento.update({ where: { id: e.id }, data: { status: para as any } })
      if (para === 'SUBMISSOES_ABERTAS') await agendarPrazosEvento(row)
      if (para === 'ENCERRADO') await cancelReminders({ tenantId, refType: 'PesEvento', refId: e.id })
      await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: `EVENTO_${para}`, refType: 'PesEvento', refId: e.id })
      res.json(row)
    }),
  )

  // ---------- Trabalhos ----------
  router.get(
    '/eventos-trabalhos',
    requireRole(...TODOS),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const { skip, take, page, pageSize } = pageParams(req.query)
      const where: any = { tenantId }
      for (const f of ['eventoId', 'status', 'trilha']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
      if (!ehGestor(req)) where.OR = [{ submissorUserId: req.user!.id }, ...(req.user!.studentId ? [{ submissorStudentId: req.user!.studentId }] : []), { avaliacoes: { some: { avaliadorUserId: req.user!.id } } }]
      const [items, total] = await Promise.all([prisma.pesEventoTrabalho.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }), prisma.pesEventoTrabalho.count({ where })])
      res.json({ items: items.map((t) => (ehGestor(req) || t.submissorUserId === req.user!.id ? t : { ...t, autores: null, submissorUserId: null, submissorStudentId: null })), total, page, pageSize })
    }),
  )
  router.get(
    '/eventos-trabalhos/:id',
    requireRole(...TODOS),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const t = await prisma.pesEventoTrabalho.findFirst({ where: { id: String(req.params.id), tenantId }, include: { avaliacoes: true } })
      if (!t) return res.status(404).json({ error: 'Trabalho não encontrado.' })
      const meu = t.submissorUserId === req.user!.id || (!!t.submissorStudentId && t.submissorStudentId === req.user!.studentId)
      if (ehGestor(req)) return res.json(t)
      if (meu) return res.json({ ...t, avaliacoes: t.avaliacoes.filter((a) => a.concluida).map((a, i) => ({ avaliador: `Avaliador ${String.fromCharCode(65 + i)}`, nota: a.nota, recomendacao: a.recomendacao, parecer: a.parecer })) })
      const av = t.avaliacoes.find((a) => a.avaliadorUserId === req.user!.id)
      if (!av) return res.status(404).json({ error: 'Trabalho não encontrado.' })
      res.json({ id: t.id, codigo: t.codigo, titulo: t.titulo, resumo: t.resumo, palavrasChave: t.palavrasChave, trilha: t.trilha, formatoApresentacao: t.formatoApresentacao, arquivoUrl: t.arquivoUrl, minhaAvaliacao: av })
    }),
  )
  router.post(
    '/eventos-trabalhos',
    requireRole(...TODOS),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const d = parseBody(z.object({
        eventoId: z.string(), titulo: z.string().trim().min(8), resumo: z.string().trim().min(100, 'Resumo deve ter ao menos 100 caracteres.'), palavrasChave: z.array(z.string()).min(3).max(6), trilha: z.string().optional(), formatoApresentacao: z.enum(['ORAL', 'POSTER']).default('ORAL'),
        autores: z.array(z.object({ nome: z.string().trim().min(3), email: z.string().email().optional(), afiliacao: z.string().optional(), userId: z.string().optional() })).min(1).max(10), apresentadorNome: z.string().optional(), arquivoUrl: z.string().optional(),
      }), req.body)
      const e = await prisma.pesEvento.findFirst({ where: { id: d.eventoId, tenantId } })
      if (!e) throw httpErr(404, 'Evento não encontrado.')
      if (e.status !== 'SUBMISSOES_ABERTAS' || (e.prazoSubmissao && e.prazoSubmissao < new Date())) throw httpErr(409, 'Submissões encerradas para este evento.')
      const trilhas: string[] = Array.isArray(e.trilhas) ? (e.trilhas as string[]) : []
      if (trilhas.length && (!d.trilha || !trilhas.includes(d.trilha))) throw httpErr(400, `Trilha inválida. Opções: ${trilhas.join(', ')}.`)
      const dup = await prisma.pesEventoTrabalho.findFirst({ where: { tenantId, eventoId: e.id, submissorUserId: req.user!.id, titulo: { equals: d.titulo, mode: 'insensitive' }, status: { not: 'RETIRADO' } } })
      if (dup) throw httpErr(409, `Trabalho já submetido (${dup.codigo}).`)
      const { eventoId: _e, ...resto } = d
      const row = await comRetentativa(async () => {
        const codigo = await proximoCodigo('pesEventoTrabalho', tenantId, 'EVT', 'codigo')
        return prisma.pesEventoTrabalho.create({ data: { ...resto, tenantId, eventoId: e.id, codigo, autores: d.autores as any, apresentadorNome: d.apresentadorNome ?? d.autores[0].nome, submissorUserId: req.user!.id, submissorStudentId: req.user!.studentId ?? null } })
      })
      await notify({ tenantId, userId: req.user!.id, assunto: `Trabalho submetido (${row.codigo})`, mensagem: `Recebemos "${row.titulo}" para ${e.nome}. Resultado previsto: ${(e.prazoResultado ?? e.prazoAvaliacao)?.toLocaleDateString('pt-BR') ?? 'a definir'}.`, refType: 'PesEventoTrabalho', refId: row.id })
      res.status(201).json(row)
    }),
  )
  router.post(
    '/eventos-trabalhos/:id/retirar',
    requireRole(...TODOS),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const t = await prisma.pesEventoTrabalho.findFirst({ where: { id: String(req.params.id), tenantId } })
      if (!t) return res.status(404).json({ error: 'Trabalho não encontrado.' })
      if (t.submissorUserId !== req.user!.id && !ehGestor(req)) throw httpErr(403, 'Sem permissão.')
      if (!podeTransicionar(TRANSICOES_EVENTO_TRABALHO, t.status, 'RETIRADO')) throw httpErr(409, `Não é possível retirar em ${t.status}.`)
      const row = await prisma.pesEventoTrabalho.update({ where: { id: t.id }, data: { status: 'RETIRADO' } })
      const av = await prisma.pesEventoAvaliacao.findMany({ where: { trabalhoId: t.id, concluida: false } })
      for (const a of av) await cancelReminders({ tenantId, refType: 'PesEventoAvaliacao', refId: a.id })
      res.json(row)
    }),
  )

  // distribui avaliações automaticamente (balanceado, sem conflito de autoria)
  router.post(
    '/eventos/:id/distribuir-avaliacoes',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const d = parseBody(z.object({ avaliadores: z.array(z.object({ userId: z.string(), trilhas: z.array(z.string()).optional() })).min(1) }), req.body)
      const e = await prisma.pesEvento.findFirst({ where: { id: String(req.params.id), tenantId } })
      if (!e) return res.status(404).json({ error: 'Evento não encontrado.' })
      if (!['SUBMISSOES_ABERTAS', 'EM_AVALIACAO'].includes(e.status)) throw httpErr(409, 'Evento fora da fase de submissão/avaliação.')
      const trabs = await prisma.pesEventoTrabalho.findMany({ where: { tenantId, eventoId: e.id, status: { in: ['SUBMETIDO', 'EM_AVALIACAO'] } }, include: { avaliacoes: true } })
      const nomes = new Map<string, string>()
      for (const a of d.avaliadores) nomes.set(a.userId, (await nomeUsuario(tenantId, a.userId)) ?? '')
      const faltam = d.avaliadores.filter((a) => !nomes.get(a.userId))
      if (faltam.length) throw httpErr(404, `Avaliadores não encontrados: ${faltam.map((f) => f.userId).join(', ')}.`)
      const cargaAtual = new Map<string, number>()
      for (const t of trabs) for (const a of t.avaliacoes) cargaAtual.set(a.avaliadorUserId, (cargaAtual.get(a.avaliadorUserId) ?? 0) + 1)
      const alvo = trabs.map((t) => ({ t, falta: e.avaliadoresPorTrabalho - t.avaliacoes.length })).filter((x) => x.falta > 0)
      let criadas = 0
      const sem: string[] = []
      const prazo = e.prazoAvaliacao ?? addDays(new Date(), 15)
      for (const { t, falta } of alvo) {
        const ja = new Set(t.avaliacoes.map((a) => a.avaliadorUserId))
        const autoresIds = [...(Array.isArray(t.autores) ? (t.autores as any[]).map((a) => a.userId).filter(Boolean) : []), ...(t.submissorUserId ? [t.submissorUserId] : [])]
        const r = distribuirAvaliacoes([{ id: t.id, autoresUserIds: [...autoresIds, ...ja], trilha: t.trilha }], d.avaliadores.map((a) => ({ userId: a.userId, trilhas: a.trilhas, cargaAtual: cargaAtual.get(a.userId) ?? 0 })), falta)
        if (r.semAvaliadores.length) sem.push(t.codigo)
        for (const at of r.atribuicoes) {
          const av = await prisma.pesEventoAvaliacao.create({ data: { tenantId, trabalhoId: t.id, avaliadorUserId: at.avaliadorUserId, avaliadorNome: nomes.get(at.avaliadorUserId), prazo } })
          cargaAtual.set(at.avaliadorUserId, (cargaAtual.get(at.avaliadorUserId) ?? 0) + 1)
          criadas++
          await scheduleReminder({ tenantId, modulo: MOD, titulo: `Avaliar trabalho ${t.codigo} — ${e.nome}`, dueAt: prazo, antecedenciaDias: 5, refType: 'PesEventoAvaliacao', refId: av.id, assigneeUserId: at.avaliadorUserId, dedupeKey: `pes-evt-aval-${av.id}` })
        }
        if (t.status === 'SUBMETIDO') await prisma.pesEventoTrabalho.update({ where: { id: t.id }, data: { status: 'EM_AVALIACAO' } })
      }
      for (const uid of new Set(d.avaliadores.map((a) => a.userId))) if ((cargaAtual.get(uid) ?? 0) > 0) await notify({ tenantId, userId: uid, assunto: `Trabalhos para avaliar — ${e.nome}`, mensagem: `Você tem ${cargaAtual.get(uid)} trabalho(s) para avaliar até ${prazo.toLocaleDateString('pt-BR')}.`, refType: 'PesEvento', refId: e.id })
      res.json({ avaliacoesCriadas: criadas, trabalhosSemAvaliadoresSuficientes: sem })
    }),
  )
  router.get(
    '/minhas-avaliacoes-evento',
    requireRole(...DOCENTES),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const items = await prisma.pesEventoAvaliacao.findMany({ where: { tenantId, avaliadorUserId: req.user!.id }, orderBy: { prazo: 'asc' }, include: { trabalho: { select: { id: true, codigo: true, titulo: true, resumo: true, trilha: true, arquivoUrl: true } } } })
      res.json({ items })
    }),
  )
  router.post(
    '/eventos-avaliacoes/:id/concluir',
    requireRole(...DOCENTES),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const d = parseBody(z.object({ nota: z.number().min(0).max(10), recomendacao: z.enum(['APROVAR', 'APROVAR_COM_AJUSTES', 'REPROVAR']), parecer: z.string().trim().min(15, 'Parecer muito curto.') }), req.body)
      const a = await prisma.pesEventoAvaliacao.findFirst({ where: { id: String(req.params.id), tenantId } })
      if (!a) return res.status(404).json({ error: 'Avaliação não encontrada.' })
      if (a.avaliadorUserId !== req.user!.id) throw httpErr(403, 'Esta avaliação não é sua.')
      if (a.concluida) throw httpErr(409, 'Avaliação já concluída.')
      const row = await prisma.pesEventoAvaliacao.update({ where: { id: a.id }, data: { ...d, concluida: true, concluidaEm: new Date() } })
      await completeReminders({ tenantId, refType: 'PesEventoAvaliacao', refId: a.id, userId: getUserId(req) })
      res.json(row)
    }),
  )

  // fecha a avaliação: calcula média e decide cada trabalho com avaliações completas
  router.post(
    '/eventos/:id/fechar-avaliacao',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const e = await prisma.pesEvento.findFirst({ where: { id: String(req.params.id), tenantId } })
      if (!e) return res.status(404).json({ error: 'Evento não encontrado.' })
      if (!['SUBMISSOES_ABERTAS', 'EM_AVALIACAO'].includes(e.status)) throw httpErr(409, 'Evento fora da fase de avaliação.')
      const trabs = await prisma.pesEventoTrabalho.findMany({ where: { tenantId, eventoId: e.id, status: 'EM_AVALIACAO' }, include: { avaliacoes: true } })
      const decididos: Array<{ codigo: string; media: number | null; decisao: string }> = []
      const pendentes: string[] = []
      for (const t of trabs) {
        const concl = t.avaliacoes.filter((a) => a.concluida && a.nota != null)
        const r = decidirTrabalhoEvento(concl.map((a) => a.nota as number), e.notaMinimaAprovacao, e.avaliadoresPorTrabalho)
        if (!r.decisao || t.avaliacoes.some((a) => !a.concluida)) { pendentes.push(t.codigo); continue }
        // divergência forte (aprova x reprova) pede desempate humano
        const recs = new Set(concl.map((a) => a.recomendacao))
        if (recs.has('APROVAR') && recs.has('REPROVAR') && concl.length < e.avaliadoresPorTrabalho + 1) { pendentes.push(`${t.codigo} (divergente — designe um 3º avaliador)`); continue }
        await prisma.pesEventoTrabalho.update({ where: { id: t.id }, data: { status: r.decisao, notaMedia: r.media } })
        decididos.push({ codigo: t.codigo, media: r.media, decisao: r.decisao })
        const msg = `Resultado do trabalho "${t.titulo}" (${e.nome}): ${r.decisao.replace(/_/g, ' ')} — nota ${r.media?.toFixed(2)}.${r.decisao !== 'REPROVADO' && e.prazoCameraReady ? ` Envie a versão final até ${e.prazoCameraReady.toLocaleDateString('pt-BR')}.` : ''}`
        if (t.submissorUserId) await notify({ tenantId, userId: t.submissorUserId, assunto: `Resultado — ${t.codigo}`, mensagem: msg, refType: 'PesEventoTrabalho', refId: t.id })
        else if (t.submissorStudentId) await notify({ tenantId, studentId: t.submissorStudentId, assunto: `Resultado — ${t.codigo}`, mensagem: msg, refType: 'PesEventoTrabalho', refId: t.id })
        if (r.decisao !== 'REPROVADO' && e.prazoCameraReady) await scheduleReminder({ tenantId, modulo: MOD, titulo: `Enviar versão final (camera-ready) ${t.codigo}`, dueAt: e.prazoCameraReady, antecedenciaDias: 7, severity: 'ATENCAO', refType: 'PesEventoTrabalho', refId: t.id, assigneeUserId: t.submissorUserId ?? undefined, assigneeStudentId: t.submissorStudentId ?? undefined, dedupeKey: `pes-evt-cr-${t.id}` })
      }
      if (e.status === 'SUBMISSOES_ABERTAS' && trabs.length) await prisma.pesEvento.update({ where: { id: e.id }, data: { status: 'EM_AVALIACAO' } })
      await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'FECHAR_AVALIACAO_EVENTO', refType: 'PesEvento', refId: e.id, detalhes: { decididos: decididos.length, pendentes: pendentes.length } })
      res.json({ decididos, pendentes })
    }),
  )

  router.post(
    '/eventos-trabalhos/:id/camera-ready',
    requireRole(...TODOS),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const t = await prisma.pesEventoTrabalho.findFirst({ where: { id: String(req.params.id), tenantId }, include: { evento: true } })
      if (!t) return res.status(404).json({ error: 'Trabalho não encontrado.' })
      if (t.submissorUserId !== req.user!.id && !ehGestor(req)) throw httpErr(403, 'Sem permissão.')
      const { url } = parseBody(z.object({ url: z.string().min(3) }), req.body)
      if (!podeTransicionar(TRANSICOES_EVENTO_TRABALHO, t.status, 'CAMERA_READY')) throw httpErr(409, 'Somente trabalhos aprovados enviam a versão final.')
      if (t.evento.prazoCameraReady && t.evento.prazoCameraReady < new Date() && !ehGestor(req)) throw httpErr(409, 'Prazo da versão final encerrado. Procure a organização.')
      const row = await prisma.pesEventoTrabalho.update({ where: { id: t.id }, data: { status: 'CAMERA_READY', cameraReadyUrl: url } })
      await completeReminders({ tenantId, refType: 'PesEventoTrabalho', refId: t.id, userId: getUserId(req) })
      res.json(row)
    }),
  )

  // ---------- Anais ----------
  router.post(
    '/eventos/:id/anais/gerar',
    requireRole(...GESTAO, 'LIBRARIAN'),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const e = await prisma.pesEvento.findFirst({ where: { id: String(req.params.id), tenantId } })
      if (!e) return res.status(404).json({ error: 'Evento não encontrado.' })
      if (e.anaisPublicadoEm) throw httpErr(409, 'Anais já publicados.')
      if (!['RESULTADO_DIVULGADO', 'REALIZADO', 'ENCERRADO'].includes(e.status)) throw httpErr(409, 'Divulgue o resultado antes de gerar os anais.')
      const d = parseBody(z.object({ anaisUrl: z.string().optional(), anaisIsbn: z.string().optional(), apenasComCameraReady: z.boolean().default(true) }), req.body)
      const trabs = await prisma.pesEventoTrabalho.findMany({ where: { tenantId, eventoId: e.id, status: d.apenasComCameraReady ? 'CAMERA_READY' : { in: ['CAMERA_READY', 'APROVADO', 'APROVADO_COM_AJUSTES'] } } })
      if (!trabs.length) throw httpErr(422, 'Nenhum trabalho com versão final (camera-ready) para os anais.')
      trabs.sort((a, b) => (a.trilha ?? '').localeCompare(b.trilha ?? '', 'pt-BR') || a.titulo.localeCompare(b.titulo, 'pt-BR'))
      let pag = 1
      let ordem = 0
      const agora = new Date()
      for (const t of trabs) {
        ordem++
        const paginas = `${pag}-${pag + 3}`
        pag += 4
        const autores: any[] = Array.isArray(t.autores) ? (t.autores as any[]) : []
        const hash = hashDedupe('TRABALHO_EVENTO', t.titulo, e.dataInicio.getUTCFullYear())
        const ex = await prisma.pesPublicacao.findFirst({ where: { tenantId, hashDedupe: hash }, select: { id: true } })
        const pub = ex ?? (await prisma.pesPublicacao.create({ data: { tenantId, tipo: 'TRABALHO_EVENTO', titulo: t.titulo, resumo: t.resumo, palavrasChave: t.palavrasChave, ano: e.dataInicio.getUTCFullYear(), dataPublicacao: agora, veiculo: `Anais — ${e.nome}`, isbn: d.anaisIsbn ?? e.anaisIsbn, paginas, url: d.anaisUrl ?? e.anaisUrl, hashDedupe: hash, origem: 'ANAIS', autores: { create: autores.map((a, i) => ({ tenantId, ordem: i + 1, tipo: a.userId ? ('DOCENTE' as const) : ('EXTERNO' as const), nome: a.nome, userId: a.userId ?? null, instituicao: a.afiliacao ?? null })) } } }))
        await prisma.pesEventoTrabalho.update({ where: { id: t.id }, data: { status: 'PUBLICADO_ANAIS', ordemAnais: ordem, paginasAnais: paginas, publicacaoId: pub.id } })
        await cancelReminders({ tenantId, refType: 'PesEventoTrabalho', refId: t.id })
      }
      const row = await prisma.pesEvento.update({ where: { id: e.id }, data: { anaisPublicadoEm: agora, anaisUrl: d.anaisUrl ?? e.anaisUrl, anaisIsbn: d.anaisIsbn ?? e.anaisIsbn } })
      await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'PUBLICAR_ANAIS', refType: 'PesEvento', refId: e.id, detalhes: { trabalhos: trabs.length } })
      res.json({ evento: row, trabalhosPublicados: trabs.length })
    }),
  )

  router.get(
    '/eventos/:id/anais',
    requireRole(...TODOS),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const e = await prisma.pesEvento.findFirst({ where: { id: String(req.params.id), tenantId } })
      if (!e) return res.status(404).json({ error: 'Evento não encontrado.' })
      const trabs = await prisma.pesEventoTrabalho.findMany({ where: { tenantId, eventoId: e.id, status: 'PUBLICADO_ANAIS' }, orderBy: { ordemAnais: 'asc' }, select: { id: true, codigo: true, titulo: true, resumo: true, trilha: true, autores: true, paginasAnais: true, ordemAnais: true, cameraReadyUrl: true } })
      res.json({ evento: { nome: e.nome, isbn: e.anaisIsbn, url: e.anaisUrl, publicadoEm: e.anaisPublicadoEm }, trabalhos: trabs.map((t) => ({ ...t, autores: (Array.isArray(t.autores) ? (t.autores as any[]) : []).map((a) => ({ nome: a.nome, afiliacao: a.afiliacao })) })) })
    }),
  )

  registerEduJob('pesquisa:eventos-prazos', async () => {
    const agora = new Date()
    const aval = await prisma.pesEventoAvaliacao.findMany({ where: { concluida: false, prazo: { lt: agora } }, include: { trabalho: { include: { evento: true } } }, take: 500 })
    for (const a of aval) {
      await scheduleReminder({ tenantId: a.tenantId, modulo: MOD, titulo: `Avaliação atrasada (${a.avaliadorNome ?? 'avaliador'}) — trabalho ${a.trabalho.codigo}`, dueAt: agora, remindAt: agora, severity: 'ATENCAO', refType: 'PesEvento', refId: a.trabalho.eventoId, assigneeRole: 'COORDINATOR', dedupeKey: `pes-evt-aval-atras-${a.id}` })
    }
    const sub = await prisma.pesEvento.count({ where: { status: 'SUBMISSOES_ABERTAS', prazoSubmissao: { lt: agora } } })
    return { avaliacoesAtrasadas: aval.length, eventosComSubmissaoVencida: sub }
  })
}

async function agendarPrazosEvento(e: any) {
  const itens: Array<[string, Date | null, string]> = [['Encerramento das submissões', e.prazoSubmissao, 'sub'], ['Fim do prazo de avaliação', e.prazoAvaliacao, 'aval'], ['Divulgação do resultado', e.prazoResultado, 'res'], ['Prazo das versões finais (camera-ready)', e.prazoCameraReady, 'cr']]
  for (const [t, d, k] of itens) if (d) await scheduleReminder({ tenantId: e.tenantId, modulo: MOD, titulo: `${t} — ${e.nome}`, dueAt: d, antecedenciaDias: 5, refType: 'PesEvento', refId: e.id, assigneeRole: 'COORDINATOR', dedupeKey: `pes-evt-${e.id}-${k}` })
}
