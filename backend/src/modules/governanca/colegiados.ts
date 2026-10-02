import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { mountCrud, parseBody, dateISO } from '../core/crud'
import { audit, notify } from '../core/notify'
import { completeReminders, cancelReminders } from '../core/reminders'
import { getBranding, brandHeaderHtml, escapeHtml as esc } from '../core/branding'
import { READ, WRITE, MOD, ensureReminder, proximoNumero, assertProgram, fail, fmtData } from './common'
import { apurar, formatarNumeracao, quorumNecessario } from './colegiadoLogic'

const TIPOS_ORGAO = ['CONSUP', 'CONSEPE', 'COLEGIADO_CURSO', 'CONGREGACAO', 'OUTRO'] as const

async function agendarMandato(m: any) {
  if (!m.ativo) return
  await ensureReminder({
    tenantId: m.tenantId, modulo: MOD, titulo: `Mandato em colegiado vence: ${m.nome} (${m.cargo})`, dueAt: m.fimMandato, antecedenciaDias: 60,
    refType: 'GovOrgaoMembro', refId: m.id, assigneeUserId: m.userId ?? undefined, assigneeRole: m.userId ? undefined : 'SECRETARY', severity: 'ATENCAO',
    dedupeKey: `gov:orgao:mandato:${m.id}:${m.fimMandato.toISOString().slice(0, 10)}`,
  })
}

// Membros com direito a voto e mandato vigente em `data`.
async function votantes(tenantId: string, orgaoId: string, data = new Date()) {
  return prisma.govOrgaoMembro.findMany({ where: { tenantId, orgaoId, ativo: true, temVoto: true, inicioMandato: { lte: data }, fimMandato: { gte: data } } })
}

async function contextoVotacao(tenantId: string, deliberacaoId: string) {
  const delib = await prisma.govDeliberacao.findFirst({ where: { id: deliberacaoId, tenantId } })
  if (!delib) fail(404, 'Deliberação não encontrada.')
  const orgao = await prisma.govOrgao.findFirst({ where: { id: delib!.orgaoId, tenantId } })
  if (!orgao) fail(404, 'Órgão não encontrado.')
  const reuniao = delib!.reuniaoId ? await prisma.govReuniao.findFirst({ where: { id: delib!.reuniaoId, tenantId } }) : null
  return { delib: delib!, orgao: orgao!, reuniao }
}

function presentesDe(reuniao: any): string[] { return Array.isArray(reuniao?.presentes) ? (reuniao.presentes as string[]) : [] }

export function registerColegiados(router: Router) {
  mountCrud(router, {
    model: 'govOrgao', path: '/orgaos', read: READ, write: WRITE, modulo: 'governanca.colegiados', filters: ['tipo', 'programId', 'ativo'], search: ['nome', 'sigla'],
    create: z.object({ tipo: z.enum(TIPOS_ORGAO), nome: z.string().min(3), sigla: z.string().optional(), programId: z.string().optional(), quorumPercent: z.number().int().min(1).max(100).default(50), maioria: z.enum(['SIMPLES', 'ABSOLUTA']).default('SIMPLES') }),
    beforeCreate: async (d, req) => { if (d.tipo === 'COLEGIADO_CURSO' && !d.programId) fail(400, 'Colegiado de curso exige programId.'); await assertProgram(getTenantId(req), d.programId) },
    beforeUpdate: (d) => { delete d.tipo },
  })

  router.get('/orgaos/:id/composicao', requireRole(...READ, ...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const orgao = await prisma.govOrgao.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!orgao) return res.status(404).json({ error: 'Órgão não encontrado.' })
    const membros = await prisma.govOrgaoMembro.findMany({ where: { tenantId, orgaoId: orgao.id, ativo: true }, orderBy: { nome: 'asc' } })
    const agora = new Date()
    const vigentes = membros.filter((m) => m.inicioMandato <= agora && m.fimMandato >= agora)
    const comVoto = vigentes.filter((m) => m.temVoto).length
    res.json({
      orgao, vigentes, vencidos: membros.filter((m) => m.fimMandato < agora), comVoto, quorumNecessario: quorumNecessario(comVoto, orgao.quorumPercent),
      semPresidente: !vigentes.some((m) => m.cargo === 'PRESIDENTE'),
    })
  }))

  mountCrud(router, {
    model: 'govOrgaoMembro', path: '/orgao-membros', read: READ, write: WRITE, modulo: 'governanca.colegiados', filters: ['orgaoId', 'cargo', 'ativo'], orderBy: { nome: 'asc' },
    create: z.object({ orgaoId: z.string().uuid(), nome: z.string().min(2), userId: z.string().optional(), cargo: z.string().default('MEMBRO'), representacao: z.string().optional(), temVoto: z.boolean().default(true), inicioMandato: dateISO(), fimMandato: dateISO() }),
    beforeCreate: async (d, req) => {
      if (!(await prisma.govOrgao.findFirst({ where: { id: d.orgaoId, tenantId: getTenantId(req) } }))) fail(400, 'Órgão não encontrado.')
      if (d.fimMandato <= d.inicioMandato) fail(400, 'fimMandato deve ser posterior ao início.')
      d.cargo = String(d.cargo).toUpperCase()
    },
    beforeUpdate: (d) => { delete d.orgaoId },
    afterCreate: agendarMandato,
    afterUpdate: async (row, req) => { if (!row.ativo) await cancelReminders({ tenantId: getTenantId(req), refType: 'GovOrgaoMembro', refId: row.id }); else await agendarMandato(row) },
  })

  // ---- Reuniões ----
  mountCrud(router, {
    model: 'govReuniao', path: '/reunioes', read: READ, write: WRITE, modulo: 'governanca.colegiados', filters: ['orgaoId', 'status', 'tipo'], orderBy: { data: 'desc' },
    create: z.object({ orgaoId: z.string().uuid(), tipo: z.enum(['ORDINARIA', 'EXTRAORDINARIA']).default('ORDINARIA'), data: dateISO(), local: z.string().optional() }),
    update: z.object({ tipo: z.enum(['ORDINARIA', 'EXTRAORDINARIA']), data: dateISO(), local: z.string(), ata: z.string() }).partial(),
    beforeCreate: async (d, req) => { if (!(await prisma.govOrgao.findFirst({ where: { id: d.orgaoId, tenantId: getTenantId(req) } }))) fail(400, 'Órgão não encontrado.') },
    afterCreate: async (row) => {
      await ensureReminder({ tenantId: row.tenantId, modulo: MOD, titulo: 'Reunião de colegiado agendada: enviar convocação e pauta', dueAt: row.data, antecedenciaDias: 7, refType: 'GovReuniao', refId: row.id, assigneeRole: 'SECRETARY', dedupeKey: `gov:reuniao:${row.id}` })
    },
    afterUpdate: async (row) => { if (row.status === 'AGENDADA') await ensureReminder({ tenantId: row.tenantId, modulo: MOD, titulo: 'Reunião de colegiado agendada: enviar convocação e pauta', dueAt: row.data, antecedenciaDias: 7, refType: 'GovReuniao', refId: row.id, assigneeRole: 'SECRETARY', dedupeKey: `gov:reuniao:${row.id}` }) },
    include: { pautas: { orderBy: { ordem: 'asc' } } },
  })

  mountCrud(router, {
    model: 'govPauta', path: '/pautas', read: READ, write: WRITE, modulo: 'governanca.colegiados', filters: ['reuniaoId'], orderBy: { ordem: 'asc' },
    create: z.object({ reuniaoId: z.string().uuid(), ordem: z.number().int().default(0), titulo: z.string().min(3), descricao: z.string().optional(), tipo: z.enum(['INFORME', 'DELIBERACAO']).default('DELIBERACAO') }),
    beforeCreate: async (d, req) => {
      const r = await prisma.govReuniao.findFirst({ where: { id: d.reuniaoId, tenantId: getTenantId(req) } })
      if (!r) fail(400, 'Reunião não encontrada.')
      if (r!.status !== 'AGENDADA') fail(409, 'Só é possível alterar a pauta de reuniões agendadas.')
    },
    beforeUpdate: (d) => { delete d.reuniaoId },
  })

  router.post('/reunioes/:id/pautas/from-modelo', requireRole(...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { chave } = parseBody(z.object({ chave: z.string().min(1) }), req.body)
    const r = await prisma.govReuniao.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!r) return res.status(404).json({ error: 'Reunião não encontrada.' })
    if (r.status !== 'AGENDADA') fail(409, 'Reunião não está agendada.')
    const m = await prisma.govPautaModelo.findFirst({ where: { tenantId, chave } })
    if (!m) fail(404, 'Pauta-modelo não encontrada (rode POST /governanca/bootstrap).')
    const itens = z.array(z.object({ titulo: z.string(), tipo: z.enum(['INFORME', 'DELIBERACAO']).default('DELIBERACAO') })).parse(m!.itens)
    const base = await prisma.govPauta.count({ where: { tenantId, reuniaoId: r.id } })
    await prisma.govPauta.createMany({ data: itens.map((it, i) => ({ tenantId, reuniaoId: r.id, ordem: base + i + 1, titulo: it.titulo, tipo: it.tipo })) })
    res.status(201).json(await prisma.govPauta.findMany({ where: { tenantId, reuniaoId: r.id }, orderBy: { ordem: 'asc' } }))
  }))

  router.get('/pauta-modelos', requireRole(...READ, ...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const items = await prisma.govPautaModelo.findMany({ where: { tenantId: getTenantId(req) }, orderBy: { chave: 'asc' } })
    res.json({ items, total: items.length })
  }))

  // Convocação: notifica os membros vigentes (com usuário vinculado) com data e pauta.
  router.post('/reunioes/:id/convocar', requireRole(...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const r = await prisma.govReuniao.findFirst({ where: { id: String(req.params.id), tenantId }, include: { pautas: { orderBy: { ordem: 'asc' } }, orgao: true } })
    if (!r) return res.status(404).json({ error: 'Reunião não encontrada.' })
    if (r.status !== 'AGENDADA') fail(409, 'Reunião não está agendada.')
    if (!r.pautas.length) fail(422, 'Cadastre a pauta antes de convocar.')
    const membros = await prisma.govOrgaoMembro.findMany({ where: { tenantId, orgaoId: r.orgaoId, ativo: true, inicioMandato: { lte: r.data }, fimMandato: { gte: r.data } } })
    const msg = `Convocação — ${r.orgao.nome} (${r.tipo.toLowerCase()}) em ${r.data.toLocaleString('pt-BR')}${r.local ? ' — ' + r.local : ''}.\nPauta:\n${r.pautas.map((p) => `${p.ordem}. ${p.titulo}`).join('\n')}`
    let enviados = 0
    for (const m of membros) if (m.userId) { await notify({ tenantId, userId: m.userId, assunto: `Convocação: ${r.orgao.nome}`, mensagem: msg, refType: 'GovReuniao', refId: r.id }); enviados++ }
    await completeReminders({ tenantId, refType: 'GovReuniao', refId: r.id, userId: getUserId(req) })
    await audit({ tenantId, userId: getUserId(req), modulo: 'governanca.colegiados', acao: 'CONVOCAR', refType: 'GovReuniao', refId: r.id, detalhes: { membros: membros.length, enviados } })
    res.json({ membros: membros.length, notificados: enviados, semUsuarioVinculado: membros.length - enviados })
  }))

  // Lista de presença + verificação de quórum
  router.post('/reunioes/:id/presenca', requireRole(...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { presentes } = parseBody(z.object({ presentes: z.array(z.string()) }), req.body)
    const r = await prisma.govReuniao.findFirst({ where: { id: String(req.params.id), tenantId }, include: { orgao: true } })
    if (!r) return res.status(404).json({ error: 'Reunião não encontrada.' })
    if (r.status === 'CANCELADA') fail(409, 'Reunião cancelada.')
    const vot = await votantes(tenantId, r.orgaoId, r.data)
    const todos = await prisma.govOrgaoMembro.findMany({ where: { tenantId, orgaoId: r.orgaoId, ativo: true } })
    const ids = new Set(todos.map((m) => m.id))
    const invalidos = presentes.filter((p) => !ids.has(p))
    if (invalidos.length) fail(400, `Presentes que não são membros do órgão: ${invalidos.join(', ')}`)
    const unicos = [...new Set(presentes)]
    const presentesVoto = vot.filter((m) => unicos.includes(m.id)).length
    const necessario = quorumNecessario(vot.length, r.orgao.quorumPercent)
    const ok = presentesVoto >= necessario
    const row = await prisma.govReuniao.update({ where: { id: r.id }, data: { presentes: unicos, quorumAtingido: ok } })
    res.json({ reuniao: row, totalComVoto: vot.length, presentesComVoto: presentesVoto, quorumNecessario: necessario, quorumAtingido: ok })
  }))

  router.post('/reunioes/:id/realizar', requireRole(...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { ata } = parseBody(z.object({ ata: z.string().optional() }), req.body ?? {})
    const r = await prisma.govReuniao.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!r) return res.status(404).json({ error: 'Reunião não encontrada.' })
    if (r.status !== 'AGENDADA') fail(409, 'Somente reuniões agendadas podem ser realizadas.')
    if (!presentesDe(r).length) fail(422, 'Registre a lista de presença antes.')
    if (!r.quorumAtingido) fail(422, 'Quórum não atingido: a reunião não pode ser instalada. Cancele ou reagende.')
    const row = await prisma.govReuniao.update({ where: { id: r.id }, data: { status: 'REALIZADA', ata: ata ?? r.ata } })
    await completeReminders({ tenantId, refType: 'GovReuniao', refId: r.id, userId: getUserId(req) })
    await audit({ tenantId, userId: getUserId(req), modulo: 'governanca.colegiados', acao: 'REALIZAR', refType: 'GovReuniao', refId: r.id })
    res.json(row)
  }))

  router.post('/reunioes/:id/cancelar', requireRole(...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const r = await prisma.govReuniao.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!r) return res.status(404).json({ error: 'Reunião não encontrada.' })
    if (r.status !== 'AGENDADA') fail(409, 'Somente reuniões agendadas podem ser canceladas.')
    await cancelReminders({ tenantId, refType: 'GovReuniao', refId: r.id })
    res.json(await prisma.govReuniao.update({ where: { id: r.id }, data: { status: 'CANCELADA' } }))
  }))

  // ---- Deliberações / votações ----
  const travaDelete = asyncHandler(async (req: AuthenticatedRequest, _res: Response, next) => {
    const d = await prisma.govDeliberacao.findFirst({ where: { id: String(req.params.id), tenantId: getTenantId(req) } })
    if (d && d.status !== 'PROPOSTA') fail(409, 'Deliberação já em votação/decidida não pode ser alterada ou removida (use arquivar).')
    next()
  })
  router.delete('/deliberacoes/:id', requireRole(...WRITE), travaDelete)
  router.put('/deliberacoes/:id', requireRole(...WRITE), travaDelete)
  router.patch('/deliberacoes/:id', requireRole(...WRITE), travaDelete)
  mountCrud(router, {
    model: 'govDeliberacao', path: '/deliberacoes', read: READ, write: WRITE, modulo: 'governanca.colegiados', filters: ['orgaoId', 'reuniaoId', 'status', 'ano'], search: ['titulo', 'numeracao'],
    create: z.object({ orgaoId: z.string().uuid(), reuniaoId: z.string().uuid().optional(), pautaId: z.string().uuid().optional(), titulo: z.string().min(3), texto: z.string().optional() }),
    update: z.object({ titulo: z.string().min(3), texto: z.string(), pautaId: z.string().uuid() }).partial(),
    beforeCreate: async (d, req) => {
      const tenantId = getTenantId(req)
      if (!(await prisma.govOrgao.findFirst({ where: { id: d.orgaoId, tenantId } }))) fail(400, 'Órgão não encontrado.')
      if (d.reuniaoId) {
        const r = await prisma.govReuniao.findFirst({ where: { id: d.reuniaoId, tenantId } })
        if (!r || r.orgaoId !== d.orgaoId) fail(400, 'Reunião inválida para este órgão.')
      }
      d.ano = new Date().getFullYear()
    },
  })

  router.post('/deliberacoes/:id/abrir-votacao', requireRole(...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { delib, reuniao } = await contextoVotacao(tenantId, String(req.params.id))
    if (delib.status !== 'PROPOSTA') fail(409, 'Somente propostas podem entrar em votação.')
    if (!reuniao) fail(422, 'Vincule a deliberação a uma reunião antes de votar.')
    if (reuniao!.status === 'CANCELADA') fail(409, 'Reunião cancelada.')
    if (!reuniao!.quorumAtingido) fail(422, 'Quórum não verificado/atingido na reunião (use /reunioes/:id/presenca).')
    res.json(await prisma.govDeliberacao.update({ where: { id: delib.id }, data: { status: 'EM_VOTACAO' } }))
  }))

  router.post('/deliberacoes/:id/votos', requireRole(...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const body = parseBody(z.object({ membroId: z.string().uuid(), voto: z.enum(['FAVOR', 'CONTRA', 'ABSTENCAO']) }), req.body)
    const { delib, reuniao } = await contextoVotacao(tenantId, String(req.params.id))
    if (delib.status !== 'EM_VOTACAO') fail(409, 'A deliberação não está em votação.')
    const membro = await prisma.govOrgaoMembro.findFirst({ where: { id: body.membroId, tenantId, orgaoId: delib.orgaoId, ativo: true } })
    if (!membro) fail(400, 'Membro não pertence ao órgão.')
    if (!membro!.temVoto) fail(422, 'Membro sem direito a voto.')
    if (!presentesDe(reuniao).includes(membro!.id)) fail(422, 'Membro não consta na lista de presença da reunião.')
    const v = await prisma.govVotoRegistro.upsert({
      where: { deliberacaoId_membroId: { deliberacaoId: delib.id, membroId: membro!.id } },
      create: { tenantId, deliberacaoId: delib.id, membroId: membro!.id, voto: body.voto }, update: { voto: body.voto },
    })
    res.status(201).json(v)
  }))

  router.get('/deliberacoes/:id/votos', requireRole(...READ, ...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { delib, orgao, reuniao } = await contextoVotacao(tenantId, String(req.params.id))
    const votos = await prisma.govVotoRegistro.findMany({ where: { tenantId, deliberacaoId: delib.id } })
    const vot = await votantes(tenantId, orgao.id, reuniao?.data ?? new Date())
    const presentes = presentesDe(reuniao)
    const ap = apurar({ totalComVoto: vot.length, presentesComVoto: vot.filter((m) => presentes.includes(m.id)).length, votos: votos.map((v) => v.voto as any), quorumPercent: orgao.quorumPercent, maioria: orgao.maioria as any })
    res.json({ status: delib.status, votos, apuracaoParcial: ap, faltamVotar: vot.filter((m) => presentes.includes(m.id) && !votos.some((v) => v.membroId === m.id)).map((m) => ({ id: m.id, nome: m.nome })) })
  }))

  router.post('/deliberacoes/:id/apurar', requireRole(...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const body = parseBody(z.object({ encerrar: z.boolean().default(false), desempate: z.enum(['FAVOR', 'CONTRA']).optional() }), req.body ?? {})
    const { delib, orgao, reuniao } = await contextoVotacao(tenantId, String(req.params.id))
    if (delib.status !== 'EM_VOTACAO') fail(409, 'A deliberação não está em votação.')
    const vot = await votantes(tenantId, orgao.id, reuniao?.data ?? new Date())
    const presentes = presentesDe(reuniao)
    const presVoto = vot.filter((m) => presentes.includes(m.id))
    const registros = await prisma.govVotoRegistro.findMany({ where: { tenantId, deliberacaoId: delib.id } })
    let votos = registros.map((v) => v.voto as 'FAVOR' | 'CONTRA' | 'ABSTENCAO')
    if (body.encerrar) { // quem não votou, estando presente, é computado como abstenção
      const faltam = presVoto.filter((m) => !registros.some((r) => r.membroId === m.id)).length
      votos = [...votos, ...Array.from({ length: faltam }, () => 'ABSTENCAO' as const)]
    }
    let ap = apurar({ totalComVoto: vot.length, presentesComVoto: presVoto.length, votos, quorumPercent: orgao.quorumPercent, maioria: orgao.maioria as any })
    let votoQualidade: string | undefined
    if (ap.resultado === 'EMPATE') {
      if (!body.desempate) fail(409, 'Empate: informe "desempate" (FAVOR|CONTRA) — voto de qualidade do presidente.')
      votoQualidade = body.desempate
      ap = { ...ap, resultado: body.desempate === 'FAVOR' ? 'APROVADA' : 'REJEITADA' }
    }
    if (ap.resultado === 'SEM_QUORUM') fail(422, 'Sem quórum para deliberar.')
    if (ap.resultado === 'EM_ABERTO') fail(409, 'Ainda há votos pendentes (use encerrar=true para computar ausência de voto como abstenção).')
    const agora = new Date()
    const aprovada = ap.resultado === 'APROVADA'
    const upd: any = { status: aprovada ? 'APROVADA' : 'REJEITADA', decididaEm: agora, resultado: { ...ap, votoQualidade } }
    if (aprovada) {
      const ano = agora.getFullYear()
      const numero = await proximoNumero(tenantId, 'DELIBERACAO', ano)
      upd.ano = ano; upd.numero = numero; upd.numeracao = formatarNumeracao(numero, ano)
    }
    const row = await prisma.govDeliberacao.update({ where: { id: delib.id }, data: upd })
    await audit({ tenantId, userId: getUserId(req), modulo: 'governanca.colegiados', acao: aprovada ? 'APROVAR' : 'REJEITAR', refType: 'GovDeliberacao', refId: delib.id, detalhes: { ...ap, numeracao: row.numeracao } })
    res.json(row)
  }))

  router.post('/deliberacoes/:id/arquivar', requireRole(...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { delib } = await contextoVotacao(tenantId, String(req.params.id))
    if (delib.status === 'APROVADA') fail(409, 'Deliberação aprovada não pode ser arquivada.')
    res.json(await prisma.govDeliberacao.update({ where: { id: delib.id }, data: { status: 'ARQUIVADA' } }))
  }))

  router.get('/deliberacoes/:id/resolucao-html', requireRole(...READ, ...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { delib, orgao } = await contextoVotacao(tenantId, String(req.params.id))
    if (delib.status !== 'APROVADA') fail(409, 'Somente deliberações aprovadas geram resolução.')
    const b = await getBranding(tenantId)
    const r: any = delib.resultado ?? {}
    res.type('html').send(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><title>Resolução ${esc(delib.numeracao)}</title></head><body style="font-family:Georgia,serif;max-width:860px;margin:0 auto;color:#0f172a">
${brandHeaderHtml(b, { titulo: `Resolução nº ${delib.numeracao}`, subtitulo: orgao.nome })}
<section style="padding:24px 36px;line-height:1.6"><h3>${esc(delib.titulo)}</h3><div style="white-space:pre-wrap">${esc(delib.texto ?? '')}</div>
<p style="margin-top:24px;font-size:13px">Aprovada em ${fmtData(delib.decididaEm)} — votos: ${r.favor ?? 0} favoráveis, ${r.contra ?? 0} contrários, ${r.abstencao ?? 0} abstenções${r.votoQualidade ? ` (voto de qualidade: ${esc(r.votoQualidade)})` : ''}.</p>
<div style="margin-top:56px;text-align:center"><div style="border-top:1px solid #0f172a;width:320px;margin:0 auto;padding-top:4px">${esc(b.reitorNome ?? 'Presidente do órgão')}<br/><small>${esc(b.reitorCargo ?? '')}</small></div></div></section></body></html>`)
  }))

  // Ata em HTML
  router.get('/reunioes/:id/ata-html', requireRole(...READ, ...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const r = await prisma.govReuniao.findFirst({ where: { id: String(req.params.id), tenantId }, include: { orgao: true, pautas: { orderBy: { ordem: 'asc' } }, deliberacoes: true } })
    if (!r) return res.status(404).json({ error: 'Reunião não encontrada.' })
    const membros = await prisma.govOrgaoMembro.findMany({ where: { tenantId, orgaoId: r.orgaoId } })
    const pres = presentesDe(r)
    const b = await getBranding(tenantId)
    res.type('html').send(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><title>Ata</title></head><body style="font-family:Georgia,serif;max-width:860px;margin:0 auto;color:#0f172a">
${brandHeaderHtml(b, { titulo: `Ata de reunião ${r.tipo === 'ORDINARIA' ? 'ordinária' : 'extraordinária'}`, subtitulo: r.orgao.nome })}
<section style="padding:20px 36px;line-height:1.55;font-size:14px">
<p>Data: ${r.data.toLocaleString('pt-BR')}${r.local ? ' — ' + esc(r.local) : ''}. Status: ${r.status}. Quórum: ${r.quorumAtingido ? 'atingido' : 'não verificado/atingido'}.</p>
<p><b>Presentes:</b> ${membros.filter((m) => pres.includes(m.id)).map((m) => esc(m.nome)).join('; ') || '—'}.<br/><b>Ausentes:</b> ${membros.filter((m) => !pres.includes(m.id) && m.ativo).map((m) => esc(m.nome)).join('; ') || '—'}.</p>
<h4>Pauta</h4><ol>${r.pautas.map((p) => `<li>${esc(p.titulo)}${p.descricao ? ' — ' + esc(p.descricao) : ''}</li>`).join('')}</ol>
<h4>Deliberações</h4><ul>${r.deliberacoes.map((d) => `<li>${esc(d.titulo)} — <b>${d.status}</b>${d.numeracao ? ' (Resolução ' + esc(d.numeracao) + ')' : ''}</li>`).join('') || '<li>Nenhuma.</li>'}</ul>
<h4>Registro</h4><div style="white-space:pre-wrap">${esc(r.ata ?? '')}</div></section></body></html>`)
  }))
}
