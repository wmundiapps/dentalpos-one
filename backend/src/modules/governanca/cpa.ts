import { Router, Response, Request } from 'express'
import { z } from 'zod'
import { createHash, randomBytes } from 'crypto'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole, academicErrorHandler } from '../academico/middleware'
import { mountCrud, parseBody, qs, dateISO } from '../core/crud'
import { audit } from '../core/notify'
import { completeReminders, cancelReminders } from '../core/reminders'
import { getBranding, brandHeaderHtml, escapeHtml as esc } from '../core/branding'
import { READ, WRITE, MOD, DAY, SEGMENTOS, STATUS_ACAO, ensureReminder, fail, fmtData, optDate } from './common'
import { agregarCpa, conceitoIndice, fragilidades, EIXOS_SINAES, validarComposicaoCpa, normalizarToken, AgregadoCpa, PerguntaInfo } from './cpaLogic'

const CICLO_ORDEM = ['PLANEJAMENTO', 'COLETA', 'ANALISE', 'RELATORIO', 'CONCLUIDO'] as const
const hashToken = (t: string) => createHash('sha256').update(normalizarToken(t)).digest('hex')
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function gerarToken() {
  const b = randomBytes(12)
  const c = Array.from(b, (x) => ALFABETO[x % ALFABETO.length]).join('')
  return `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8, 12)}`
}
const diaUTC = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))

async function agendarMandato(m: any) {
  if (!m.ativo) return
  await ensureReminder({
    tenantId: m.tenantId, modulo: MOD, titulo: `Mandato na CPA vence: ${m.nome} (${m.segmento})`, descricao: 'Providencie recondução ou substituição respeitando a composição por segmento.',
    dueAt: m.fimMandato, antecedenciaDias: 60, refType: 'GovCpaMembro', refId: m.id, assigneeUserId: m.userId ?? undefined, assigneeRole: m.userId ? undefined : 'COORDINATOR',
    severity: 'ATENCAO', dedupeKey: `gov:cpa:mandato:${m.id}:${m.fimMandato.toISOString().slice(0, 10)}`,
  })
}

export async function carregarAgregado(tenantId: string, cicloId: string, filtros: { questionarioId?: string; programId?: string } = {}) {
  const ciclo = await prisma.govCpaCiclo.findFirst({ where: { id: cicloId, tenantId } })
  if (!ciclo) fail(404, 'Ciclo não encontrado.')
  const perguntas = await prisma.govCpaPergunta.findMany({ where: { tenantId, questionario: { cicloId, ...(filtros.questionarioId ? { id: filtros.questionarioId } : {}) } } })
  const respostas = await prisma.govCpaResposta.findMany({
    where: { tenantId, cicloId, ...(filtros.questionarioId ? { questionarioId: filtros.questionarioId } : {}), ...(filtros.programId ? { programId: filtros.programId } : {}) },
    include: { itens: true },
  })
  const infos: PerguntaInfo[] = perguntas.map((p) => ({ id: p.id, eixo: p.eixo, dimensao: p.dimensao, tipo: p.tipo as any }))
  const ag = agregarCpa(respostas.map((r) => ({ segmento: r.segmento, programId: r.programId, itens: r.itens.map((i) => ({ perguntaId: i.perguntaId, valor: i.valor })) })), infos, ciclo!.minRespostas)
  // comentários livres: só liberados com amostra suficiente e sem qualquer metadado (embaralhados)
  let comentarios: string[] = []
  if (respostas.length >= ciclo!.minRespostas) {
    comentarios = respostas.flatMap((r) => r.itens.map((i) => (i.texto ?? '').trim()).filter(Boolean))
    comentarios.sort(() => Math.random() - 0.5)
  }
  const convites = await prisma.govCpaConvite.groupBy({ by: ['usado'], where: { tenantId, questionario: { cicloId } }, _count: { _all: true } })
  const emitidos = convites.reduce((s, c) => s + c._count._all, 0)
  const usados = convites.find((c) => c.usado)?._count._all ?? 0
  return { ciclo: ciclo!, ag, comentarios, participacao: { convitesEmitidos: emitidos, respondidos: usados, taxa: emitidos ? Math.round((usados / emitidos) * 1000) / 10 : null } }
}

function htmlRelatorio(b: Awaited<ReturnType<typeof getBranding>>, ciclo: any, ag: AgregadoCpa, tipo: string, part: any, comentarios: string[]) {
  const cel = (c: any) => (!c || c.suprimido ? '<span style="color:#94a3b8">n &lt; mín.</span>' : `${c.indice}% <small>(${conceitoIndice(c.indice)})</small>`)
  const linhasEixo = Object.keys(EIXOS_SINAES).map((k) => {
    const e = EIXOS_SINAES[Number(k)]
    const segs = (ag.porEixoSegmento[k] ?? {})
    return `<tr style="border-bottom:1px solid #e2e8f0"><td style="padding:6px"><b>Eixo ${k}</b> — ${esc(e.nome)}</td><td>${cel(ag.porEixo[k])}</td>${SEGMENTOS.map((s) => `<td>${cel(segs[s])}</td>`).join('')}</tr>`
  }).join('')
  const frag = fragilidades(ag)
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><title>Relatório ${tipo} da CPA</title></head><body style="font-family:Arial,sans-serif;color:#0f172a;max-width:1000px;margin:0 auto">
${brandHeaderHtml(b, { titulo: `Relatório ${tipo === 'ANUAL' ? 'Anual' : 'Parcial'} de Autoavaliação Institucional`, subtitulo: `Comissão Própria de Avaliação — ${ciclo.titulo} (${ciclo.anoBase})` })}
<section style="padding:20px 28px;font-size:13px">
<h3 style="color:${esc(b.cores.secundaria)}">1. Participação</h3>
<p>Respondentes: <b>${ag.totalRespondentes}</b>${part.taxa != null ? ` — ${part.respondidos} de ${part.convitesEmitidos} convites (${part.taxa}%)` : ''}. Resultados com menos de ${ag.minRespostas} respondentes são ocultados para proteger o anonimato.</p>
<h3 style="color:${esc(b.cores.secundaria)}">2. Resultados por eixo SINAES e segmento</h3>
<table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="background:#f1f5f9;text-align:left"><th style="padding:6px">Eixo</th><th>Geral</th>${SEGMENTOS.map((s) => `<th>${s.replace('_', ' ')}</th>`).join('')}</tr></thead><tbody>${linhasEixo}</tbody></table>
<h3 style="color:${esc(b.cores.secundaria)}">3. Fragilidades identificadas</h3>
${frag.length ? `<ul>${frag.map((f) => `<li>${f.nivel === 'EIXO' ? 'Eixo' : 'Dimensão'} ${f.chave}: índice ${f.indice}% (${f.n} respondentes) — ${conceitoIndice(f.indice)}</li>`).join('')}</ul>` : '<p>Nenhuma fragilidade abaixo do limiar de 60%.</p>'}
${comentarios.length ? `<h3 style="color:${esc(b.cores.secundaria)}">4. Comentários (anonimizados)</h3><ul>${comentarios.slice(0, 40).map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
<p style="margin-top:28px;font-size:11px;color:#64748b">Emitido em ${fmtData(new Date())}.</p></section></body></html>`
}

export function registerCpa(router: Router) {
  mountCrud(router, {
    model: 'govCpa', path: '/cpa/comissoes', read: READ, write: WRITE, modulo: 'governanca.cpa', filters: ['ativa'],
    create: z.object({ nome: z.string().min(3), portaria: z.string().optional() }),
    include: { membros: { where: { ativo: true }, orderBy: { nome: 'asc' } } },
  })
  router.get('/cpa/comissoes/:id/composicao', requireRole(...READ, ...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const membros = await prisma.govCpaMembro.findMany({ where: { tenantId: getTenantId(req), cpaId: String(req.params.id) } })
    const vencendo = membros.filter((m) => m.ativo && m.fimMandato.getTime() - Date.now() <= 60 * DAY).map((m) => ({ id: m.id, nome: m.nome, fimMandato: m.fimMandato }))
    res.json({ ...validarComposicaoCpa(membros), mandatosAVencer: vencendo })
  }))
  mountCrud(router, {
    model: 'govCpaMembro', path: '/cpa/membros', read: READ, write: WRITE, modulo: 'governanca.cpa', filters: ['cpaId', 'segmento', 'ativo'], orderBy: { nome: 'asc' },
    create: z.object({ cpaId: z.string().uuid(), nome: z.string().min(2), segmento: z.enum(SEGMENTOS), userId: z.string().optional(), cargo: z.string().optional(), inicioMandato: dateISO(), fimMandato: dateISO() }),
    beforeCreate: async (d, req) => {
      if (!(await prisma.govCpa.findFirst({ where: { id: d.cpaId, tenantId: getTenantId(req) } }))) fail(400, 'CPA não encontrada.')
      if (d.fimMandato <= d.inicioMandato) fail(400, 'fimMandato deve ser posterior ao início.')
    },
    beforeUpdate: (d) => { delete d.cpaId },
    afterCreate: agendarMandato,
    afterUpdate: async (row, req) => {
      if (!row.ativo) await cancelReminders({ tenantId: getTenantId(req), refType: 'GovCpaMembro', refId: row.id })
      else await agendarMandato(row)
    },
  })

  // ---- Ciclos de autoavaliação ----
  mountCrud(router, {
    model: 'govCpaCiclo', path: '/cpa/ciclos', read: READ, write: WRITE, modulo: 'governanca.cpa', filters: ['status', 'anoBase', 'cpaId'], search: ['titulo'],
    create: z.object({ cpaId: z.string().uuid().optional(), titulo: z.string().min(3), anoBase: z.number().int().min(2000).max(2100), inicio: dateISO(), fim: dateISO(), minRespostas: z.number().int().min(3).max(100).default(5) }),
    beforeCreate: (d) => { if (d.fim <= d.inicio) fail(400, 'fim deve ser posterior ao início da coleta.') },
    beforeUpdate: (d) => { delete d.status; delete d.cpaId },
    afterCreate: async (row) => {
      await ensureReminder({ tenantId: row.tenantId, modulo: MOD, titulo: `Iniciar coleta da autoavaliação: ${row.titulo}`, dueAt: row.inicio, antecedenciaDias: 15, refType: 'GovCpaCiclo', refId: row.id, assigneeRole: 'COORDINATOR', dedupeKey: `gov:cpa:inicio:${row.id}` })
    },
    include: { questionarios: { select: { id: true, titulo: true, segmento: true, ativo: true } } },
  })

  router.post('/cpa/ciclos/:id/avancar', requireRole(...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const ciclo = await prisma.govCpaCiclo.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!ciclo) return res.status(404).json({ error: 'Ciclo não encontrado.' })
    const i = CICLO_ORDEM.indexOf(ciclo.status as any)
    if (i >= CICLO_ORDEM.length - 1) fail(409, 'Ciclo já concluído.')
    const prox = CICLO_ORDEM[i + 1]
    if (prox === 'COLETA') {
      const qs_ = await prisma.govCpaQuestionario.findMany({ where: { tenantId, cicloId: ciclo.id, ativo: true }, include: { _count: { select: { perguntas: true } } } })
      if (!qs_.length || qs_.some((q) => q._count.perguntas === 0)) fail(422, 'Para abrir a coleta é preciso ao menos um questionário ativo e todos com perguntas.')
      await ensureReminder({ tenantId, modulo: MOD, titulo: `Encerrar coleta da autoavaliação: ${ciclo.titulo}`, dueAt: ciclo.fim, antecedenciaDias: 7, refType: 'GovCpaCiclo', refId: ciclo.id, assigneeRole: 'COORDINATOR', severity: 'ATENCAO', dedupeKey: `gov:cpa:fimcoleta:${ciclo.id}` })
    }
    if (prox === 'ANALISE') await completeReminders({ tenantId, refType: 'GovCpaCiclo', refId: ciclo.id, userId: getUserId(req) })
    if (prox === 'RELATORIO') {
      await ensureReminder({ tenantId, modulo: MOD, titulo: `Elaborar relatório da CPA: ${ciclo.titulo}`, dueAt: new Date(Date.now() + 30 * DAY), refType: 'GovCpaCiclo', refId: ciclo.id, assigneeRole: 'COORDINATOR', severity: 'ATENCAO', dedupeKey: `gov:cpa:relatorio:${ciclo.id}` })
    }
    if (prox === 'CONCLUIDO') await completeReminders({ tenantId, refType: 'GovCpaCiclo', refId: ciclo.id, userId: getUserId(req) })
    const row = await prisma.govCpaCiclo.update({ where: { id: ciclo.id }, data: { status: prox } })
    await audit({ tenantId, userId: getUserId(req), modulo: 'governanca.cpa', acao: 'AVANCAR_CICLO', refType: 'GovCpaCiclo', refId: ciclo.id, detalhes: { de: ciclo.status, para: prox } })
    res.json(row)
  }))

  // ---- Questionários e perguntas ----
  mountCrud(router, {
    model: 'govCpaQuestionario', path: '/cpa/questionarios', read: READ, write: WRITE, modulo: 'governanca.cpa', filters: ['cicloId', 'segmento', 'ativo'],
    create: z.object({ cicloId: z.string().uuid(), titulo: z.string().min(3), segmento: z.enum(SEGMENTOS) }),
    beforeCreate: async (d, req) => {
      const c = await prisma.govCpaCiclo.findFirst({ where: { id: d.cicloId, tenantId: getTenantId(req) } })
      if (!c) fail(400, 'Ciclo não encontrado.')
      if (c!.status !== 'PLANEJAMENTO') fail(409, 'Questionários só podem ser criados durante o planejamento do ciclo.')
    },
    beforeUpdate: (d) => { delete d.cicloId; delete d.segmento },
    include: { perguntas: { orderBy: { ordem: 'asc' } } },
  })

  // perguntas: bloqueia alteração/remoção quando já há respostas (preserva a validade da coleta)
  const travaPergunta = asyncHandler(async (req: AuthenticatedRequest, _res: Response, next) => {
    const p = await prisma.govCpaPergunta.findFirst({ where: { id: String(req.params.id), tenantId: getTenantId(req) } })
    if (p && (await prisma.govCpaResposta.count({ where: { tenantId: p.tenantId, questionarioId: p.questionarioId } })) > 0) fail(409, 'O questionário já possui respostas; não é possível alterar as perguntas.')
    next()
  })
  router.delete('/cpa/perguntas/:id', requireRole(...WRITE), travaPergunta)
  router.put('/cpa/perguntas/:id', requireRole(...WRITE), travaPergunta)
  router.patch('/cpa/perguntas/:id', requireRole(...WRITE), travaPergunta)
  mountCrud(router, {
    model: 'govCpaPergunta', path: '/cpa/perguntas', read: READ, write: WRITE, modulo: 'governanca.cpa', filters: ['questionarioId', 'eixo'], orderBy: { ordem: 'asc' },
    create: z.object({ questionarioId: z.string().uuid(), eixo: z.number().int().min(1).max(5), dimensao: z.number().int().min(1).max(10).optional(), texto: z.string().min(5), tipo: z.enum(['LIKERT5', 'SIM_NAO', 'TEXTO']).default('LIKERT5'), obrigatoria: z.boolean().default(true), ordem: z.number().int().default(0) }),
    beforeCreate: async (d, req) => {
      if (!(await prisma.govCpaQuestionario.findFirst({ where: { id: d.questionarioId, tenantId: getTenantId(req) } }))) fail(400, 'Questionário não encontrado.')
      if ((await prisma.govCpaResposta.count({ where: { tenantId: getTenantId(req), questionarioId: d.questionarioId } })) > 0) fail(409, 'O questionário já possui respostas.')
    },
    beforeUpdate: (d) => { delete d.questionarioId },
  })

  router.get('/cpa/modelos', requireRole(...READ, ...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const items = await prisma.govCpaModeloQuestionario.findMany({ where: { tenantId: getTenantId(req) }, orderBy: { chave: 'asc' } })
    res.json({ items, total: items.length })
  }))
  router.post('/cpa/questionarios/from-modelo', requireRole(...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const body = parseBody(z.object({ cicloId: z.string().uuid(), modeloKey: z.string().min(1) }), req.body)
    const ciclo = await prisma.govCpaCiclo.findFirst({ where: { id: body.cicloId, tenantId } })
    if (!ciclo) fail(400, 'Ciclo não encontrado.')
    if (ciclo!.status !== 'PLANEJAMENTO') fail(409, 'Questionários só podem ser criados durante o planejamento do ciclo.')
    const modelo = await prisma.govCpaModeloQuestionario.findFirst({ where: { tenantId, chave: body.modeloKey } })
    if (!modelo) fail(404, 'Modelo não encontrado (rode POST /governanca/bootstrap).')
    const perguntas = z.array(z.object({ eixo: z.number(), dimensao: z.number().optional(), texto: z.string(), tipo: z.enum(['LIKERT5', 'SIM_NAO', 'TEXTO']).default('LIKERT5') })).parse(modelo!.perguntas)
    const q = await prisma.govCpaQuestionario.create({
      data: { tenantId, cicloId: body.cicloId, titulo: modelo!.titulo, segmento: modelo!.segmento, modeloKey: modelo!.chave, perguntas: { create: perguntas.map((p, i) => ({ tenantId, eixo: p.eixo, dimensao: p.dimensao, texto: p.texto, tipo: p.tipo, ordem: i })) } },
      include: { perguntas: true },
    })
    res.status(201).json(q)
  }))

  // ---- Convites anônimos ----
  router.post('/cpa/questionarios/:id/convites', requireRole(...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const body = parseBody(z.object({ quantidade: z.number().int().min(1).max(2000), programId: z.string().optional(), expiraEm: optDate() }), req.body)
    const q = await prisma.govCpaQuestionario.findFirst({ where: { id: String(req.params.id), tenantId }, include: { ciclo: true } })
    if (!q) return res.status(404).json({ error: 'Questionário não encontrado.' })
    if (q.ciclo.status === 'CONCLUIDO') fail(409, 'Ciclo concluído.')
    const tokens = Array.from({ length: body.quantidade }, gerarToken)
    await prisma.govCpaConvite.createMany({ data: tokens.map((t) => ({ tenantId, questionarioId: q.id, tokenHash: hashToken(t), programId: body.programId, expiraEm: body.expiraEm ?? q.ciclo.fim })) })
    await audit({ tenantId, userId: getUserId(req), modulo: 'governanca.cpa', acao: 'GERAR_CONVITES', refType: 'GovCpaQuestionario', refId: q.id, detalhes: { quantidade: body.quantidade } })
    // Os tokens em texto claro são devolvidos UMA vez e nunca mais recuperáveis (só o hash é guardado).
    res.status(201).json({ questionarioId: q.id, quantidade: tokens.length, tokens, aviso: 'Guarde/distribua agora: os tokens não podem ser consultados depois.' })
  }))
  router.get('/cpa/questionarios/:id/convites/resumo', requireRole(...READ, ...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req); const questionarioId = String(req.params.id)
    const [total, usados] = await Promise.all([prisma.govCpaConvite.count({ where: { tenantId, questionarioId } }), prisma.govCpaConvite.count({ where: { tenantId, questionarioId, usado: true } })])
    res.json({ total, usados, pendentes: total - usados, taxaParticipacao: total ? Math.round((usados / total) * 1000) / 10 : null })
  }))

  // ---- Resultados / relatório / plano de ação ----
  router.get('/cpa/ciclos/:id/resultados', requireRole(...READ, ...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { ciclo, ag, comentarios, participacao } = await carregarAgregado(getTenantId(req), String(req.params.id), { questionarioId: qs(req.query.questionarioId), programId: qs(req.query.programId) })
    const conceitos = Object.fromEntries(Object.entries(ag.porEixo).map(([k, c]) => [k, conceitoIndice(c.indice)]))
    res.json({ ciclo: { id: ciclo.id, titulo: ciclo.titulo, status: ciclo.status, minRespostas: ciclo.minRespostas }, participacao, ...ag, conceitos, fragilidades: fragilidades(ag), comentarios })
  }))

  router.post('/cpa/ciclos/:id/relatorios', requireRole(...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { tipo } = parseBody(z.object({ tipo: z.enum(['PARCIAL', 'ANUAL']).default('PARCIAL') }), req.body ?? {})
    const { ciclo, ag, comentarios, participacao } = await carregarAgregado(tenantId, String(req.params.id))
    if (ciclo.status === 'PLANEJAMENTO') fail(409, 'Não há dados: a coleta ainda não começou.')
    if (tipo === 'ANUAL' && !['ANALISE', 'RELATORIO', 'CONCLUIDO'].includes(ciclo.status)) fail(409, 'O relatório anual exige a coleta encerrada (ciclo em análise ou posterior).')
    const b = await getBranding(tenantId)
    const html = htmlRelatorio(b, ciclo, ag, tipo, participacao, comentarios)
    const rel = await prisma.govCpaRelatorio.create({ data: { tenantId, cicloId: ciclo.id, tipo, html, dados: { agregado: ag, participacao } as any, geradoPorId: getUserId(req) } })
    if (tipo === 'ANUAL') await completeReminders({ tenantId, refType: 'GovCpaCiclo', refId: ciclo.id, userId: getUserId(req) })
    await audit({ tenantId, userId: getUserId(req), modulo: 'governanca.cpa', acao: 'GERAR_RELATORIO', refType: 'GovCpaRelatorio', refId: rel.id, detalhes: { tipo } })
    res.status(201).json({ id: rel.id, tipo, createdAt: rel.createdAt, html })
  }))
  router.get('/cpa/ciclos/:id/relatorios', requireRole(...READ, ...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const items = await prisma.govCpaRelatorio.findMany({ where: { tenantId: getTenantId(req), cicloId: String(req.params.id) }, orderBy: { createdAt: 'desc' }, select: { id: true, tipo: true, createdAt: true } })
    res.json({ items, total: items.length })
  }))
  router.get('/cpa/relatorios/:id/html', requireRole(...READ, ...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const r = await prisma.govCpaRelatorio.findFirst({ where: { id: String(req.params.id), tenantId: getTenantId(req) } })
    if (!r) return res.status(404).json({ error: 'Relatório não encontrado.' })
    res.type('html').send(r.html)
  }))

  // Plano de ação derivado das fragilidades dos resultados
  router.post('/cpa/ciclos/:id/plano/gerar', requireRole(...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const body = parseBody(z.object({ limiar: z.number().min(1).max(99).default(60), prazoDias: z.number().int().min(7).max(730).default(180) }), req.body ?? {})
    const { ciclo, ag } = await carregarAgregado(tenantId, String(req.params.id))
    const frag = fragilidades(ag, body.limiar)
    const criadas = []
    for (const f of frag) {
      const eixo = f.nivel === 'EIXO' ? Number(f.chave) : undefined
      const dimensao = f.nivel === 'DIMENSAO' ? Number(f.chave) : undefined
      const dup = await prisma.govCpaPlanoAcao.findFirst({ where: { tenantId, cicloId: ciclo.id, eixo: eixo ?? null, dimensao: dimensao ?? null, status: { in: ['PLANEJADA', 'EM_ANDAMENTO'] } } })
      if (dup) continue
      const nome = f.nivel === 'EIXO' ? EIXOS_SINAES[Number(f.chave)]?.nome : Object.values(EIXOS_SINAES).flatMap((e) => e.dimensoes).find((d) => d.n === Number(f.chave))?.nome
      const prazo = new Date(Date.now() + body.prazoDias * DAY)
      const row = await prisma.govCpaPlanoAcao.create({
        data: { tenantId, cicloId: ciclo.id, eixo, dimensao, problema: `${f.nivel === 'EIXO' ? 'Eixo' : 'Dimensão'} ${f.chave} (${nome ?? '—'}) com índice de satisfação ${f.indice}% (${conceitoIndice(f.indice)}).`, acao: 'Definir e executar ações de melhoria para o ponto crítico apontado pela comunidade acadêmica.', prazo, origemScore: f.indice },
      })
      await ensureReminder({ tenantId, modulo: MOD, titulo: `Plano de ação CPA: ${row.problema.slice(0, 80)}`, dueAt: prazo, antecedenciaDias: 15, refType: 'GovCpaPlanoAcao', refId: row.id, assigneeRole: 'COORDINATOR', severity: 'ATENCAO', dedupeKey: `gov:cpa:plano:${row.id}` })
      criadas.push(row)
    }
    res.status(201).json({ limiar: body.limiar, fragilidades: frag.length, criadas: criadas.length, items: criadas })
  }))
  mountCrud(router, {
    model: 'govCpaPlanoAcao', path: '/cpa/plano-acao', read: READ, write: WRITE, modulo: 'governanca.cpa', filters: ['cicloId', 'status', 'eixo'], orderBy: { prazo: 'asc' },
    create: z.object({ cicloId: z.string().uuid(), eixo: z.number().int().min(1).max(5).optional(), dimensao: z.number().int().min(1).max(10).optional(), problema: z.string().min(5), acao: z.string().min(5), responsavelId: z.string().optional(), prazo: optDate(), status: z.enum(STATUS_ACAO).default('PLANEJADA') }),
    beforeCreate: async (d, req) => { if (!(await prisma.govCpaCiclo.findFirst({ where: { id: d.cicloId, tenantId: getTenantId(req) } }))) fail(400, 'Ciclo não encontrado.') },
    beforeUpdate: (d) => { delete d.cicloId },
    afterCreate: async (row) => {
      if (row.prazo) await ensureReminder({ tenantId: row.tenantId, modulo: MOD, titulo: `Plano de ação CPA: ${row.acao.slice(0, 80)}`, dueAt: row.prazo, refType: 'GovCpaPlanoAcao', refId: row.id, assigneeUserId: row.responsavelId ?? undefined, assigneeRole: row.responsavelId ? undefined : 'COORDINATOR', dedupeKey: `gov:cpa:plano:${row.id}` })
    },
    afterUpdate: async (row, req) => {
      const tenantId = getTenantId(req)
      if (row.status === 'CONCLUIDA') await completeReminders({ tenantId, refType: 'GovCpaPlanoAcao', refId: row.id, userId: getUserId(req) })
      else if (row.status === 'CANCELADA') await cancelReminders({ tenantId, refType: 'GovCpaPlanoAcao', refId: row.id })
    },
  })
}

// ====================== PÚBLICO (anônimo, sem login) ======================
// Limite simples de tentativas por IP (proteção contra adivinhação de tokens).
const tentativas = new Map<string, { n: number; ate: number }>()
function limitar(req: Request) {
  const ip = String(req.ip || 'x')
  const agora = Date.now()
  const t = tentativas.get(ip)
  if (!t || t.ate < agora) { tentativas.set(ip, { n: 1, ate: agora + 10 * 60_000 }); return }
  t.n++
  if (t.n > 60) throw Object.assign(new Error('Muitas tentativas. Aguarde alguns minutos.'), { status: 429 })
}

async function conviteValido(token: string) {
  const convite = await prisma.govCpaConvite.findUnique({ where: { tokenHash: hashToken(token) }, include: { questionario: { include: { ciclo: true, perguntas: { orderBy: { ordem: 'asc' } } } } } })
  if (!convite) fail(404, 'Código de resposta inválido.')
  const c = convite!
  if (c.usado) fail(410, 'Este código já foi utilizado.')
  if (c.expiraEm && c.expiraEm < new Date()) fail(410, 'Este código expirou.')
  if (!c.questionario.ativo || c.questionario.ciclo.status !== 'COLETA') fail(409, 'A coleta não está aberta para este questionário.')
  const agora = new Date()
  if (agora < c.questionario.ciclo.inicio || agora > new Date(c.questionario.ciclo.fim.getTime() + DAY)) fail(409, 'Fora do período de coleta.')
  return c
}

export function registerCpaPublic(pub: Router) {
  pub.get('/cpa/responder/:token', asyncHandler(async (req: Request, res: Response) => {
    limitar(req)
    const c = await conviteValido(String(req.params.token))
    res.json({
      ciclo: c.questionario.ciclo.titulo, titulo: c.questionario.titulo, segmento: c.questionario.segmento,
      aviso: 'Sua participação é anônima: nenhuma informação sua é associada às respostas.',
      perguntas: c.questionario.perguntas.map((p) => ({ id: p.id, eixo: p.eixo, texto: p.texto, tipo: p.tipo, obrigatoria: p.obrigatoria })),
    })
  }))

  pub.post('/cpa/responder/:token', asyncHandler(async (req: Request, res: Response) => {
    limitar(req)
    const body = parseBody(z.object({ respostas: z.array(z.object({ perguntaId: z.string().uuid(), valor: z.number().optional(), texto: z.string().max(2000).optional() })).min(1) }), req.body)
    const c = await conviteValido(String(req.params.token))
    const pmap = new Map(c.questionario.perguntas.map((p) => [p.id, p]))
    const itens: Array<{ perguntaId: string; valor?: number; texto?: string }> = []
    const vistos = new Set<string>()
    for (const r of body.respostas) {
      const p = pmap.get(r.perguntaId)
      if (!p) fail(400, 'Pergunta não pertence ao questionário.')
      if (vistos.has(r.perguntaId)) fail(400, 'Pergunta respondida mais de uma vez.')
      vistos.add(r.perguntaId)
      if (p!.tipo === 'LIKERT5' && !(Number.isInteger(r.valor) && r.valor! >= 1 && r.valor! <= 5)) { if (r.valor != null || p!.obrigatoria) fail(400, `Resposta inválida (1 a 5) na pergunta: ${p!.texto}`); continue }
      if (p!.tipo === 'SIM_NAO' && !(r.valor === 0 || r.valor === 1)) { if (r.valor != null || p!.obrigatoria) fail(400, `Resposta inválida (0 ou 1) na pergunta: ${p!.texto}`); continue }
      if (p!.tipo === 'TEXTO' && !r.texto?.trim()) { if (p!.obrigatoria) fail(400, `Resposta obrigatória: ${p!.texto}`); continue }
      itens.push({ perguntaId: r.perguntaId, valor: p!.tipo === 'TEXTO' ? undefined : r.valor, texto: p!.tipo === 'TEXTO' ? r.texto?.trim() : undefined })
    }
    for (const p of c.questionario.perguntas) if (p.obrigatoria && !itens.some((i) => i.perguntaId === p.id)) fail(400, `Pergunta obrigatória sem resposta: ${p.texto}`)

    await prisma.$transaction(async (tx) => {
      // consumo atômico do token: impede resposta dupla; a resposta NÃO guarda referência ao convite
      const claim = await tx.govCpaConvite.updateMany({ where: { id: c.id, usado: false }, data: { usado: true } })
      if (claim.count !== 1) fail(410, 'Este código já foi utilizado.')
      await tx.govCpaResposta.create({
        data: {
          tenantId: c.tenantId, cicloId: c.questionario.cicloId, questionarioId: c.questionarioId, segmento: c.questionario.segmento, programId: c.programId,
          createdAt: diaUTC(), // truncado ao dia: dificulta correlação temporal com o uso do token
          itens: { create: itens.map((i) => ({ tenantId: c.tenantId, perguntaId: i.perguntaId, valor: i.valor, texto: i.texto })) },
        },
      })
    })
    res.status(201).json({ ok: true, mensagem: 'Resposta registrada anonimamente. Obrigado por participar!' })
  }))
  pub.use(academicErrorHandler)
}
