import { Router, Response } from 'express'
import { z } from 'zod'
import { AuthenticatedRequest, asyncHandler, requireRole } from '../academico/middleware'
import { pageParams, parseBody, qs } from '../core/crud'
import { audit } from '../core/notify'
import { ATENDE, ETAPAS, GESTAO, LEITURA, ORIGENS, csv, db, fail, getConfig, normEmail, normFone, optStr, slugify, tid, uid } from './common'
import { estaSuprimido } from './compliance'
import { capturarLead, distribuir, garantirCandidato, iniciarCadencias, mudarEtapa, processarCadencias, recalcular, registrarEvento, sincronizarAdmissoes } from './leads'
import { mascararEmail, mascararTelefone } from '../lgpd/mascara'
import { prisma } from '../../lib/prisma'

export const TEXTO_CONSENTIMENTO_PADRAO = 'Autorizo o tratamento dos meus dados pessoais para que a instituição entre em contato sobre cursos e processos seletivos, conforme a Política de Privacidade. Posso revogar a qualquer momento.'
export const TEXTO_MARKETING_PADRAO = 'Aceito receber comunicações de divulgação (ofertas, eventos e novidades) por e-mail, SMS, WhatsApp e outros canais. Posso me descadastrar em 1 clique, em qualquer mensagem.'

const mascarar = (l: any, completo: boolean) => completo ? l : { ...l, email: l.email ? mascararEmail(l.email) : null, telefone: l.telefone ? mascararTelefone(l.telefone) : null }
const podeVerPII = (req: AuthenticatedRequest) => ['ADMIN', 'OWNER', 'RECTOR', 'BOARD', 'MARKETING', 'ADMISSIONS'].includes(String(req.user?.role || '').toUpperCase())

const campoSchema = z.object({ chave: z.string().min(1).max(40).regex(/^[a-zA-Z0-9_]+$/), rotulo: z.string().min(1).max(80), tipo: z.enum(['texto', 'email', 'telefone', 'curso', 'select', 'textarea']).default('texto'), obrigatorio: z.boolean().default(false), opcoes: z.array(z.string().max(80)).max(30).optional() })

export function registerLeads(r: Router) {
  // ---------------------------------------------------------------- leads
  r.get('/leads', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    for (const k of ['etapa', 'origem', 'temperatura', 'consultorId', 'campanhaId']) { const v = qs((req.query as any)[k]); if (v) where[k] = v }
    const q = qs(req.query.q); if (q) where.OR = [{ nome: { contains: q, mode: 'insensitive' } }, { emailNorm: { contains: q.toLowerCase() } }, { cursoInteresse: { contains: q, mode: 'insensitive' } }]
    const [items, total] = await Promise.all([db.mktLead.findMany({ where, orderBy: [{ score: 'desc' }, { createdAt: 'desc' }], skip, take }), db.mktLead.count({ where })])
    const pii = podeVerPII(req)
    res.json({ items: items.map((l: any) => mascarar(l, pii)), total, page, pageSize })
  }))
  r.get('/leads/:id', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const l = await db.mktLead.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!l) fail(404, 'Lead não encontrado.')
    const [eventos, envios, consentimentos, sup] = await Promise.all([
      db.mktLeadEvento.findMany({ where: { tenantId, leadId: l.id }, orderBy: { createdAt: 'desc' }, take: 100 }),
      db.mktEnvio.findMany({ where: { tenantId, leadId: l.id }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, canal: true, assunto: true, status: true, motivo: true, createdAt: true, enviadoEm: true, finalidade: true } }),
      db.mktConsentimento.findMany({ where: { tenantId, leadId: l.id }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, finalidade: true, baseLegal: true, textoVersao: true, textoHash: true, origem: true, createdAt: true, revogadoEm: true, motivoRevogacao: true, concedido: true } }),
      estaSuprimido(tenantId, { email: l.emailNorm, telefone: l.telefone }),
    ])
    res.json({ ...mascarar(l, podeVerPII(req)), eventos, envios, consentimentos, suprimido: sup.suprimido })
  }))
  const leadSchema = z.object({
    nome: z.string().min(3).max(150), email: optStr(150), telefone: optStr(30), curso: optStr(150), origem: z.enum(ORIGENS).default('BALCAO'), detalheOrigem: optStr(150), campanhaId: optStr(80), cupom: optStr(40), convenio: optStr(150), indicacao: optStr(40),
    consentimentoContato: z.literal(true, { errorMap: () => ({ message: 'Confirme que o titular autorizou o contato (LGPD).' }) } as any),
    consentimentoMarketing: z.boolean().default(false),
  })
  r.post('/leads', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const b = parseBody(leadSchema, req.body)
    const { lead, novo } = await capturarLead({ tenantId: tid(req), nome: b.nome, email: b.email, telefone: b.telefone, curso: b.curso, origem: b.origem, detalheOrigem: b.detalheOrigem, campanhaId: b.campanhaId, cupom: b.cupom, convenio: b.convenio, indicacao: b.indicacao,
      consentimento: { contato: true, marketing: b.consentimentoMarketing, texto: b.consentimentoMarketing ? TEXTO_MARKETING_PADRAO : TEXTO_CONSENTIMENTO_PADRAO, versao: 'interno-1.0', origem: 'ATENDENTE' } })
    await db.mktConsentimento.updateMany({ where: { tenantId: tid(req), leadId: lead.id, origem: 'ATENDENTE', titularNome: b.nome }, data: { url: `registrado por usuário ${uid(req)}` } })
    res.status(novo ? 201 : 200).json(mascarar(lead, podeVerPII(req)))
  }))
  r.post('/leads/importar', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    // Importação de listas: SÓ com base legal declarada. Sem comprovação de opt-in, entra como contato SEM marketing.
    const b = parseBody(z.object({ origem: z.enum(ORIGENS).default('OUTRO'), baseLegal: z.enum(['CONSENTIMENTO', 'LEGITIMO_INTERESSE', 'PROCEDIMENTOS_PRELIMINARES']), comprovanteConsentimento: optStr(500), campanhaId: optStr(80),
      linhas: z.array(z.object({ nome: z.string().min(2).max(150), email: optStr(150), telefone: optStr(30), curso: optStr(150) })).min(1).max(1000) }), req.body)
    const optIn = b.baseLegal === 'CONSENTIMENTO' && !!b.comprovanteConsentimento
    let criados = 0, existentes = 0, invalidos = 0
    for (const l of b.linhas) {
      if (!normEmail(l.email) && !normFone(l.telefone)) { invalidos++; continue }
      const r1 = await capturarLead({ tenantId: tid(req), nome: l.nome, email: l.email, telefone: l.telefone, curso: l.curso, origem: b.origem, campanhaId: b.campanhaId, detalheOrigem: 'IMPORTACAO',
        consentimento: { contato: true, marketing: optIn, texto: `Importação de lista (${b.baseLegal}). Comprovante: ${b.comprovanteConsentimento ?? 'não informado'}`, versao: 'importacao', origem: 'IMPORTACAO' } })
      if (r1.novo) criados++; else existentes++
    }
    await audit({ tenantId: tid(req), userId: uid(req), modulo: 'marketing', acao: 'LEADS_IMPORTADOS', detalhes: { criados, existentes, invalidos, baseLegal: b.baseLegal, optIn } })
    res.status(201).json({ criados, existentes, invalidos, marketingHabilitado: optIn, aviso: optIn ? undefined : 'Sem comprovante de consentimento: os contatos foram importados SEM autorização de marketing.' })
  }))
  r.post('/leads/:id/etapa', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const b = parseBody(z.object({ etapa: z.enum(ETAPAS), motivo: optStr(300) }), req.body)
    if (b.etapa === 'PERDIDO' && !b.motivo) fail(400, 'Informe o motivo da perda.')
    res.json(await mudarEtapa(tid(req), String(req.params.id), b.etapa, { userId: uid(req), motivo: b.motivo ?? undefined }))
  }))
  r.post('/leads/:id/atribuir', requireRole(...GESTAO, 'ADMISSIONS'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const b = parseBody(z.object({ consultorId: optStr(80) }), req.body)
    const lead = await db.mktLead.findFirst({ where: { id: String(req.params.id), tenantId } }); if (!lead) fail(404, 'Lead não encontrado.')
    if (!b.consultorId) return res.json(await distribuir(tenantId, lead.id, true))
    const c = await db.mktConsultor.findFirst({ where: { id: b.consultorId, tenantId, ativo: true } }); if (!c) fail(404, 'Consultor não encontrado ou inativo.')
    const cfg = await getConfig(tenantId)
    const up = await db.mktLead.update({ where: { id: lead.id }, data: { consultorId: c.id, consultorNome: c.nome, atribuidoEm: new Date(), proximoContatoEm: new Date(Date.now() + cfg.slaPrimeiroContatoMin * 60_000) } })
    await db.mktLeadEvento.create({ data: { tenantId, leadId: lead.id, tipo: 'ATRIBUIDO', descricao: `Atribuído manualmente para ${c.nome}`, userId: uid(req) } })
    res.json(up)
  }))
  r.post('/leads/:id/eventos', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const b = parseBody(z.object({ tipo: z.enum(['RESPONDEU', 'VISITOU_CURSO', 'SIMULOU_MENSALIDADE', 'SOLICITOU_CONTATO', 'PARTICIPOU_EVENTO', 'NOTA', 'LIGACAO', 'EMAIL_ABERTO', 'EMAIL_CLIQUE']), descricao: optStr(500) }), req.body)
    const tenantId = tid(req); const l = await db.mktLead.findFirst({ where: { id: String(req.params.id), tenantId } }); if (!l) fail(404, 'Lead não encontrado.')
    if (['NOTA', 'LIGACAO'].includes(b.tipo)) { await db.mktLeadEvento.create({ data: { tenantId, leadId: l.id, tipo: b.tipo, descricao: b.descricao ?? undefined, userId: uid(req) } }); if (b.tipo === 'LIGACAO' && !l.primeiroContatoEm) await db.mktLead.update({ where: { id: l.id }, data: { primeiroContatoEm: new Date(), etapa: l.etapa === 'NOVO' ? 'CONTATO' : l.etapa } }); return res.status(201).json(await recalcular(tenantId, l.id)) }
    res.status(201).json((await registrarEvento(tenantId, l.id, b.tipo, { descricao: b.descricao ?? undefined, userId: uid(req) })) ?? { ok: true })
  }))
  r.post('/leads/sincronizar-admissoes', requireRole(...GESTAO, 'ADMISSIONS'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => res.json(await sincronizarAdmissoes(tid(req)))))
  r.post('/leads/:id/candidato', requireRole(...ATENDE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const l = await db.mktLead.findFirst({ where: { id: String(req.params.id), tenantId } }); if (!l) fail(404, 'Lead não encontrado.')
    res.json({ candidatoId: await garantirCandidato(tenantId, l.id, l.consentimentoMarketing) })
  }))
  r.get('/leads-export.csv', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const rows = await db.mktLead.findMany({ where: { tenantId: tid(req) }, orderBy: { createdAt: 'desc' }, take: 5000 })
    await audit({ tenantId: tid(req), userId: uid(req), modulo: 'marketing', acao: 'EXPORTACAO_LEADS', detalhes: { linhas: rows.length } })
    res.type('text/csv; charset=utf-8').send(csv(rows.map((l: any) => ({ nome: l.nome, email: l.email, telefone: l.telefone, curso: l.cursoInteresse, origem: l.origem, etapa: l.etapa, score: l.score, temperatura: l.temperatura, consultor: l.consultorNome, marketing: l.consentimentoMarketing ? 'SIM' : 'NAO', criado: l.createdAt })), ['nome', 'email', 'telefone', 'curso', 'origem', 'etapa', 'score', 'temperatura', 'consultor', 'marketing', 'criado']))
  }))

  // ---------------------------------------------------------------- formulários
  r.get('/formularios', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => { const items = await db.mktFormulario.findMany({ where: { tenantId: tid(req) }, orderBy: { createdAt: 'desc' } }); res.json({ items, total: items.length }) }))
  const formSchema = z.object({ nome: z.string().min(3).max(120), slug: optStr(60), descricao: optStr(500), campos: z.array(campoSchema).min(1).max(25), origemPadrao: z.enum(ORIGENS).default('SITE'), campanhaId: optStr(80), cursoNome: optStr(150), textoConsentimento: z.string().min(30).max(2000).default(TEXTO_CONSENTIMENTO_PADRAO), versaoTexto: z.string().max(20).default('1.0'), mensagemSucesso: optStr(300), ativo: z.boolean().default(true) })
  const validaForm = (b: any) => { if (!b.campos.some((c: any) => ['email', 'telefone'].includes(c.tipo))) fail(400, 'O formulário precisa ter um campo de e-mail ou telefone.') }
  r.post('/formularios', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const b = parseBody(formSchema, req.body); validaForm(b)
    const slug = slugify(b.slug || b.nome)
    if (await db.mktFormulario.findUnique({ where: { tenantId_slug: { tenantId, slug } } })) fail(409, 'Já existe formulário com este endereço (slug).')
    const f = await db.mktFormulario.create({ data: { ...b, slug, tenantId, mensagemSucesso: b.mensagemSucesso ?? undefined } as any })
    await audit({ tenantId, userId: uid(req), modulo: 'marketing', acao: 'CRIAR', refType: 'MktFormulario', refId: f.id }); res.status(201).json(f)
  }))
  r.patch('/formularios/:id', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const cur = await db.mktFormulario.findFirst({ where: { id: String(req.params.id), tenantId } }); if (!cur) fail(404, 'Formulário não encontrado.')
    const b = parseBody(formSchema.partial(), req.body); if (b.campos) validaForm({ campos: b.campos })
    const { slug: _s, ...rest } = b as any
    const textoMudou = b.textoConsentimento && b.textoConsentimento !== cur.textoConsentimento
    res.json(await db.mktFormulario.update({ where: { id: cur.id }, data: { ...rest, ...(textoMudou && !b.versaoTexto ? { versaoTexto: String(Number.parseFloat(cur.versaoTexto || '1') + 1) } : {}) } }))
  }))
  r.delete('/formularios/:id', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const cur = await db.mktFormulario.findFirst({ where: { id: String(req.params.id), tenantId } }); if (!cur) fail(404, 'Formulário não encontrado.')
    await db.mktFormulario.update({ where: { id: cur.id }, data: { ativo: false } }); res.json({ ok: true, desativado: true })
  }))

  // ---------------------------------------------------------------- cadências
  r.get('/cadencias', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const items = await db.mktCadencia.findMany({ where: { tenantId: tid(req) }, include: { passos: { orderBy: { ordem: 'asc' } } }, orderBy: { createdAt: 'desc' } })
    const ex = await db.mktCadenciaExecucao.groupBy({ by: ['cadenciaId', 'status'], where: { tenantId: tid(req) }, _count: { _all: true } })
    res.json({ items: items.map((c: any) => ({ ...c, execucoes: Object.fromEntries(ex.filter((e: any) => e.cadenciaId === c.id).map((e: any) => [e.status, e._count._all])) })), total: items.length })
  }))
  const passoSchema = z.object({ atrasoHoras: z.number().int().min(0).max(24 * 90).default(0), canal: z.enum(['EMAIL', 'SMS', 'TELEGRAM', 'WHATSAPP', 'VOZ']).default('EMAIL'), assunto: optStr(200), corpo: z.string().min(3).max(3000), finalidade: z.enum(['MARKETING', 'TRANSACIONAL']).default('MARKETING') })
  r.post('/cadencias', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ nome: z.string().min(3).max(120), gatilho: z.enum(['LEAD_NOVO', 'LEAD_QUENTE', 'MANUAL']).default('LEAD_NOVO'), origens: z.array(z.enum(ORIGENS)).default([]), ativa: z.boolean().default(true), campanhaId: optStr(80), passos: z.array(passoSchema).min(1).max(15) }), req.body)
    const { passos, ...resto } = b
    const c = await db.mktCadencia.create({ data: { ...resto, tenantId, passos: { create: passos.map((p, i) => ({ ...p, tenantId, ordem: i })) } } as any, include: { passos: true } })
    await audit({ tenantId, userId: uid(req), modulo: 'marketing', acao: 'CRIAR', refType: 'MktCadencia', refId: c.id }); res.status(201).json(c)
  }))
  r.patch('/cadencias/:id', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const cur = await db.mktCadencia.findFirst({ where: { id: String(req.params.id), tenantId } }); if (!cur) fail(404, 'Cadência não encontrada.')
    const b = parseBody(z.object({ nome: z.string().min(3).max(120), ativa: z.boolean(), origens: z.array(z.enum(ORIGENS)) }).partial(), req.body)
    const up = await db.mktCadencia.update({ where: { id: cur.id }, data: b })
    if (b.ativa === false) await db.mktCadenciaExecucao.updateMany({ where: { tenantId, cadenciaId: cur.id, status: 'ATIVA' }, data: { status: 'PARADA', motivo: 'Cadência desativada' } })
    res.json(up)
  }))
  r.post('/cadencias/:id/iniciar', requireRole(...GESTAO, 'ADMISSIONS'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const b = parseBody(z.object({ leadId: z.string() }), req.body)
    const l = await db.mktLead.findFirst({ where: { id: b.leadId, tenantId } }); if (!l) fail(404, 'Lead não encontrado.')
    res.json({ iniciadas: await iniciarCadencias(tenantId, l.id, 'MANUAL', String(req.params.id)) })
  }))
  r.post('/cadencias/executar', requireRole(...GESTAO), asyncHandler(async (_req: AuthenticatedRequest, res: Response) => res.json(await processarCadencias())))
  void prisma
}
