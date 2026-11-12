import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AcademicRole, AuthenticatedRequest, asyncHandler, requireRole } from '../academico/middleware'
import { parseBody } from '../core/crud'
import { audit, notify } from '../core/notify'
import { Branding, brandHeaderHtml, escapeHtml as esc, getBranding } from '../core/branding'
import { registrarAcessoSensivel } from '../lgpd/sensiveis'
import { hashDocumento } from '../lgpd/mascara'
import { registerEduJob } from '../core/jobs'
import { Campos, CONTEXTOS, ORIGENS, ORDEM_GRAV, TIPOS_DOCUMENTO, pontuar, resultadoDe, sugerirEquivalencias, extrairCampos, mascararNomeDoc, DisciplinaOrigem } from './logic'
import { ProvedorGatewayReal, garantirBaseDemo, obterProvedor } from './provedores'
import { adicionarDocumento, analisarCaso, carregarDestinos, criarCaso, encerrarAlertas, historicoLocal, prepararDocumento } from './engine'
import { statusBloqueio } from './bloqueio'
import {
  MOD, TODOS_OPERADORES, VE_DADOS, diretoriaDe, ehSuper, evento, exigirOrigem, fail, getConfig, lerDados, nomeUsuario, origensDoUsuario, pageParams, papel, podeDecidirCritico, qs, tid, uid,
} from './common'

// Módulo "analise-docs" — Agente de análise de documentos (Secretaria, Financeiro e Jurídico). Montado em /api/edu/analise-docs.
// Ver README.md. O provedor de consulta ao MEC/secretarias estaduais é SIMULADO (base local de demonstração) até haver credencial.
const router = Router()
const OPERA = [...TODOS_OPERADORES] as AcademicRole[]
const ROLES_CFG = ['SECRETARY', 'COORDINATOR', 'FINANCE', 'LEGAL', 'RECTOR', 'BOARD', 'ADMIN', 'OWNER', 'STAFF'] as const

// ------------------------------------------------------------------ esquemas
const str = (max = 200) => z.string().trim().max(max)
const camposSchema = z.object({
  nome: str(200).optional(), cpf: str(20).optional(), rg: str(30).optional(), dataNascimento: str(30).optional(),
  instituicao: str(250).optional(), codigoIes: str(20).optional(), cnpj: str(20).optional(), uf: str(2).optional(), nivelEnsino: z.enum(['SUPERIOR', 'ENSINO_MEDIO', 'EJA']).optional(),
  curso: str(200).optional(), cargaHorariaTotal: z.number().min(0).max(100000).optional(),
  dataEmissao: str(30).optional(), dataConclusao: str(30).optional(), dataInicio: str(30).optional(), validade: str(30).optional(), vencimento: str(30).optional(),
  numeroDocumento: str(60).optional(), assinaturaDigital: z.boolean().optional(), qrCode: z.boolean().optional(), codigoVerificacao: str(60).optional(),
  valor: z.number().min(0).max(1e12).optional(), emitente: str(200).optional(), emitenteCnpj: str(20).optional(), chaveAcesso: str(60).optional(),
  partes: str(400).optional(), vigenciaInicio: str(30).optional(), vigenciaFim: str(30).optional(),
  disciplinas: z.array(z.object({ nome: str(200), cargaHoraria: z.number().min(0).max(5000).nullish(), nota: z.number().min(-1).max(1000).nullish(), situacao: str(40).nullish(), ano: z.number().int().min(1900).max(2100).nullish(), ementa: str(3000).nullish() })).max(300).optional(),
}).strict()
const metaSchema = z.object({
  producer: str(200).optional(), creator: str(200).optional(), criadoEm: str(30).optional(), modificadoEm: str(30).optional(), softwareEdicao: z.boolean().optional(), camposSobrepostos: z.boolean().optional(),
  fontesDistintas: z.number().int().min(0).max(100).optional(), assinaturaValida: z.boolean().optional(), qrConfere: z.boolean().optional(), assinaturaPresente: z.boolean().optional(),
}).strict()
const arquivoSchema = z.object({ nome: str(200).optional(), mime: str(100).optional(), dataUrl: z.string().max(12_000_000).optional(), base64: z.string().max(12_000_000).optional() })
const docSchema = z.object({ tipo: z.string().min(2).max(40), arquivo: arquivoSchema.optional(), texto: z.string().max(80_000).optional(), campos: camposSchema.optional(), metadados: metaSchema.optional() })
const casoSchema = z.object({
  origem: z.enum(ORIGENS), contexto: z.enum(CONTEXTOS).default('OUTRO'), titulo: str(200).min(3), studentId: z.string().max(80).optional(), programId: z.string().max(80).optional(), protocoloId: z.string().max(80).optional(),
  refType: z.string().max(40).optional(), refId: z.string().max(80).optional(), documentos: z.array(docSchema).min(1).max(15), analisar: z.boolean().optional(),
})

const REF_MODELS: Record<string, string> = {
  SecProtocolo: 'secProtocolo', SecAnexo: 'secAnexo', SecConferenciaItem: 'secConferenciaItem', SecDiploma: 'secDiploma', AccountPayable: 'accountPayable', AccountReceivable: 'accountReceivable',
  FiscalInvoice: 'fiscalInvoice', TesTitulo: 'tesTitulo', TesNotaFiscal: 'tesNotaFiscal', TesRecibo: 'tesRecibo', JurContrato: 'jurContrato', JurDocumento: 'jurDocumento', JurAnexo: 'jurAnexo',
}
const ator = (req: AuthenticatedRequest) => ({ id: uid(req), clinicId: req.user?.clinicId, role: papel(req) })

async function validarRefs(tenantId: string, b: { studentId?: string; programId?: string; protocoloId?: string; refType?: string; refId?: string }) {
  if (b.studentId && !(await prisma.student.findFirst({ where: { id: b.studentId, tenantId }, select: { id: true } }))) fail(400, 'Aluno não encontrado nesta instituição.')
  if (b.programId && !(await prisma.academicProgram.findFirst({ where: { id: b.programId, tenantId }, select: { id: true } }))) fail(400, 'Curso não encontrado nesta instituição.')
  if (b.protocoloId && !(await prisma.secProtocolo.findFirst({ where: { id: b.protocoloId, tenantId }, select: { id: true } }))) fail(400, 'Protocolo não encontrado nesta instituição.')
  if ((b.refType && !b.refId) || (!b.refType && b.refId)) fail(400, 'Informe refType e refId juntos.')
  if (b.refType) {
    const model = REF_MODELS[b.refType]
    if (!model) fail(400, `refType não suportado (${Object.keys(REF_MODELS).join(', ')}).`)
    if (!(await (prisma as any)[model].findFirst({ where: { id: b.refId, tenantId }, select: { id: true } }))) fail(400, 'Registro de origem não encontrado nesta instituição.')
  }
}

async function carregarCaso(req: AuthenticatedRequest, id: string, include: any = undefined) {
  const caso = await prisma.adcCaso.findFirst({ where: { id, tenantId: tid(req) }, include })
  if (!caso || !origensDoUsuario(req).includes(caso.origem as any)) fail(404, 'Caso não encontrado.')
  return caso as any
}

const podeVerDados = (req: AuthenticatedRequest, origem: string) => ehSuper(req) || (VE_DADOS as any)[origem]?.includes(papel(req))

// ------------------------------------------------------------------ meta / config / provedor
router.get('/meta', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const cfg = await getConfig(tid(req))
  res.json({
    origens: origensDoUsuario(req), contextos: CONTEXTOS,
    tipos: Object.entries(TIPOS_DOCUMENTO).map(([codigo, t]) => ({ codigo, nome: t.nome, origens: t.origens, itens: t.itens.map((i) => i.item) })),
    provedor: { ativo: cfg.provedor === 'EMEC' && ProvedorGatewayReal.configurado() ? 'EMEC' : 'SIMULADO', simulado: !(cfg.provedor === 'EMEC' && ProvedorGatewayReal.configurado()), configuradoReal: ProvedorGatewayReal.configurado(),
      aviso: 'A verificação de instituições usa uma base local de DEMONSTRAÇÃO (cadastro fictício). Nenhuma consulta real ao MEC (e-MEC) ou às secretarias estaduais de educação é feita sem credencial configurada.' },
    ia: { extracao: 'Regras determinísticas + leitura de texto/PDF (sem OCR de imagens)', resumoIA: Boolean(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY) },
    aviso: 'O agente apoia a conferência humana: não substitui perícia documental nem decisão da instituição.',
    podeConfigurar: ehSuper(req),
  })
}))

router.get('/config', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => { res.json(await getConfig(tid(req))) }))
router.put('/config', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const b = parseBody(z.object({
    percentualAproveitamento: z.number().int().min(10).max(100), similaridadeMinima: z.number().int().min(10).max(100), validadeAproveitamentoAnos: z.number().int().min(1).max(50),
    slaHoras: z.number().int().min(1).max(720), slaCriticoHoras: z.number().int().min(1).max(168), retencaoDias: z.number().int().min(7).max(3650),
    diretoriaSecretaria: z.enum(ROLES_CFG), diretoriaFinanceiro: z.enum(ROLES_CFG), diretoriaJuridico: z.enum(ROLES_CFG), notificarReitor: z.boolean(), provedor: z.enum(['SIMULADO', 'EMEC']),
  }).partial(), req.body)
  const tenantId = tid(req)
  const row = await prisma.adcConfig.upsert({ where: { tenantId }, create: { tenantId, ...b }, update: b })
  await audit({ tenantId, userId: uid(req), modulo: MOD, acao: 'CONFIG_ATUALIZADA', refType: 'AdcConfig', refId: row.id, detalhes: b })
  res.json(row)
}))

// ------------------------------------------------------------------ base de instituições (demonstração) e consulta
router.post('/instituicoes/bootstrap', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const n = await garantirBaseDemo(tid(req))
  res.json({ criadas: n, total: await prisma.adcInstituicao.count({ where: { tenantId: tid(req) } }), aviso: 'Cadastro FICTÍCIO de demonstração.' })
}))
router.get('/instituicoes', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = tid(req)
  await garantirBaseDemo(tenantId)
  const { skip, take, page, pageSize } = pageParams(req.query)
  const where: any = { tenantId }
  const tipo = qs(req.query.tipo), situacao = qs(req.query.situacao), q = qs(req.query.q)
  if (tipo) where.tipo = tipo
  if (situacao) where.situacao = situacao
  if (q) where.OR = [{ nome: { contains: q, mode: 'insensitive' } }, { codigo: { contains: q } }, { sigla: { contains: q, mode: 'insensitive' } }]
  const [items, total] = await Promise.all([prisma.adcInstituicao.findMany({ where, orderBy: [{ tipo: 'asc' }, { nome: 'asc' }], skip, take }), prisma.adcInstituicao.count({ where })])
  res.json({ items, total, page, pageSize, fonte: 'DEMONSTRACAO (cadastro fictício)' })
}))
const instSchema = z.object({
  tipo: z.enum(['IES', 'ESCOLA']), codigo: z.string().regex(/^\d{3,10}$/, 'Código deve ter de 3 a 10 dígitos.'), nome: str(250).min(3), sigla: str(30).optional(), uf: z.string().length(2), municipio: str(120).optional(),
  situacao: z.enum(['REGULAR', 'DESCREDENCIADA', 'EM_EXTINCAO', 'SUSPENSA', 'EM_DILIGENCIA']), secretariaEstadual: str(200).optional(),
  cursos: z.array(z.object({ nome: str(200), grau: str(40).optional(), reconhecido: z.boolean(), portaria: str(200).optional() })).max(100).optional(), ativo: z.boolean().optional(),
})
router.post('/instituicoes', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const b = parseBody(instSchema, req.body)
  const tenantId = tid(req)
  if (await prisma.adcInstituicao.findFirst({ where: { tenantId, tipo: b.tipo, codigo: b.codigo } })) fail(409, 'Já existe instituição com este tipo e código.')
  const row = await prisma.adcInstituicao.create({ data: { ...b, uf: b.uf.toUpperCase(), cursos: b.cursos as any, tenantId, fonte: 'MANUAL' } })
  await audit({ tenantId, userId: uid(req), modulo: MOD, acao: 'INSTITUICAO_CRIADA', refType: 'AdcInstituicao', refId: row.id })
  res.status(201).json(row)
}))
router.patch('/instituicoes/:id', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const b = parseBody(instSchema.partial(), req.body)
  const tenantId = tid(req)
  const cur = await prisma.adcInstituicao.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!cur) fail(404, 'Instituição não encontrada.')
  const row = await prisma.adcInstituicao.update({ where: { id: cur.id }, data: { ...b, uf: b.uf?.toUpperCase(), cursos: b.cursos as any } })
  await audit({ tenantId, userId: uid(req), modulo: MOD, acao: 'INSTITUICAO_ATUALIZADA', refType: 'AdcInstituicao', refId: row.id })
  res.json(row)
}))
router.delete('/instituicoes/:id', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = tid(req)
  const cur = await prisma.adcInstituicao.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!cur) fail(404, 'Instituição não encontrada.')
  await prisma.adcInstituicao.delete({ where: { id: cur.id } })
  res.status(204).end()
}))
router.get('/instituicoes-consulta', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = tid(req)
  const tipo = qs(req.query.tipo) === 'ESCOLA' ? 'ESCOLA' : 'IES'
  const codigo = qs(req.query.codigo), nome = qs(req.query.nome), curso = qs(req.query.curso), uf = qs(req.query.uf)
  if (!codigo && !nome) fail(400, 'Informe o código ou o nome da instituição.')
  await garantirBaseDemo(tenantId)
  const cfg = await getConfig(tenantId)
  const { provedor, aviso } = obterProvedor(tenantId, cfg.provedor)
  const r = tipo === 'IES' ? await provedor.consultarIes({ codigo, nome, curso }) : await provedor.consultarEscola({ codigo, nome, uf })
  await prisma.adcConsulta.create({ data: { tenantId, tipo, termo: (nome || codigo || '').slice(0, 200), provedor: r.provedor, simulada: r.simulada, encontrada: r.encontrada, situacao: r.situacao ?? null, resultado: r as any } })
  res.json({ ...r, aviso: aviso ?? (r.simulada ? 'Resultado SIMULADO: base local de demonstração, não é consulta oficial.' : undefined) })
}))

// ------------------------------------------------------------------ criação de casos
router.post('/casos', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const b = parseBody(casoSchema, req.body)
  exigirOrigem(req, b.origem)
  const tenantId = tid(req)
  await validarRefs(tenantId, b)
  for (const d of b.documentos) { const t = TIPOS_DOCUMENTO[d.tipo]; if (!t) fail(400, `Tipo de documento inválido: ${d.tipo}.`) }
  const id = await criarCaso(tenantId, ator(req), b as any)
  res.status(201).json(await detalheCaso(req, id, false))
}))

function inferirTipo(nome = '', desc = ''): string {
  const s = `${nome} ${desc}`.toLowerCase()
  if (/hist[oó]rico.*(m[eé]dio|eja)|ensino m[eé]dio|supletivo/.test(s)) return 'HISTORICO_ENSINO_MEDIO'
  if (/hist[oó]rico/.test(s)) return 'HISTORICO_ESCOLAR'
  if (/diploma|certificado de conclus/.test(s)) return 'DIPLOMA'
  if (/\brg\b|\bcpf\b|identidade|cnh/.test(s)) return 'RG_CPF'
  if (/nota fiscal|\bnf-?e?\b|nfs/.test(s)) return 'NOTA_FISCAL'
  if (/contrato/.test(s)) return 'CONTRATO'
  if (/certid/.test(s)) return 'CERTIDAO'
  if (/comprovante|recibo|resid[eê]ncia|pagamento/.test(s)) return 'COMPROVANTE'
  return 'DECLARACAO'
}

/** "Analisar com o agente" a partir de um protocolo da secretaria: lê os anexos (data URL) e cria o caso. */
router.post('/casos/de-protocolo', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const b = parseBody(z.object({ protocoloId: z.string().min(1).max(80), contexto: z.enum(CONTEXTOS).optional(), programId: z.string().max(80).optional(), extras: z.array(docSchema).max(10).optional() }), req.body)
  exigirOrigem(req, 'SECRETARIA')
  const tenantId = tid(req)
  const proto = await prisma.secProtocolo.findFirst({ where: { id: b.protocoloId, tenantId }, include: { tipo: true } })
  if (!proto) fail(404, 'Protocolo não encontrado.')
  if (b.programId) await validarRefs(tenantId, { programId: b.programId })
  const anexos = await prisma.secAnexo.findMany({ where: { protocoloId: proto.id, tenantId }, orderBy: { createdAt: 'asc' }, take: 15 })
  const docs = anexos.map((a) => ({ tipo: inferirTipo(a.nome, a.descricao ?? ''), arquivo: { nome: a.nome, mime: a.mime ?? undefined, dataUrl: a.dataUrl ?? undefined } }))
  const todos = [...docs, ...(b.extras ?? [])].slice(0, 15)
  if (!todos.length) fail(422, 'O protocolo não tem anexos: envie documentos ou informe o texto/campos em "extras".')
  const ref = `${proto.tipo.codigo} ${proto.tipo.nome}`.toUpperCase()
  const contexto = b.contexto ?? (/TRANSFER/.test(ref) ? 'TRANSFERENCIA' : /EQUIV|APROVEIT|DISPENS/.test(ref) ? 'EQUIVALENCIA' : /MATRIC/.test(ref) ? 'MATRICULA' : /DIPLOMA/.test(ref) ? 'DIPLOMA' : 'OUTRO')
  const id = await criarCaso(tenantId, ator(req), { origem: 'SECRETARIA', contexto, titulo: `Protocolo ${proto.numero} — ${proto.assunto}`.slice(0, 200), studentId: proto.studentId ?? undefined, programId: b.programId, protocoloId: proto.id, refType: 'SecProtocolo', refId: proto.id, documentos: todos as any })
  res.status(201).json(await detalheCaso(req, id, false))
}))

// ------------------------------------------------------------------ listagem e detalhe
router.get('/casos', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = tid(req)
  const { skip, take, page, pageSize } = pageParams(req.query)
  const origens = origensDoUsuario(req)
  const where: any = { tenantId, origem: { in: origens } }
  const origem = qs(req.query.origem)
  if (origem) { if (!origens.includes(origem as any)) fail(403, 'Seu perfil não atua neste setor.'); where.origem = origem }
  for (const f of ['status', 'resultado', 'contexto', 'studentId', 'refType', 'refId', 'protocoloId']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
  if (qs(req.query.bloqueado) === 'true') where.bloqueado = true
  if (qs(req.query.critico) === 'true') where.critico = true
  if (qs(req.query.fila) === 'true') where.status = { in: ['EM_FILA', 'EM_REVISAO'] }
  if (qs(req.query.atrasados) === 'true') { where.slaEm = { lt: new Date() }; where.status = { in: ['EM_FILA', 'EM_REVISAO'] } }
  const q = qs(req.query.q)
  if (q) where.OR = [{ codigo: { contains: q, mode: 'insensitive' } }, { titulo: { contains: q, mode: 'insensitive' } }, { sujeitoNome: { contains: q, mode: 'insensitive' } }]
  const ordem = qs(req.query.ordem) === 'recentes' ? [{ createdAt: 'desc' as const }] : [{ bloqueado: 'desc' as const }, { critico: 'desc' as const }, { slaEm: 'asc' as const }]
  const [rows, total] = await Promise.all([
    prisma.adcCaso.findMany({ where, orderBy: ordem, skip, take, select: { id: true, codigo: true, origem: true, contexto: true, titulo: true, status: true, resultado: true, score: true, critico: true, bloqueado: true, sujeitoNome: true, slaEm: true, createdAt: true, analisadoEm: true, decisao: true, responsavelId: true, modoAnalise: true, _count: { select: { documentos: true } } } }),
    prisma.adcCaso.count({ where }),
  ])
  const ids = rows.map((r) => r.id)
  const abertos = ids.length ? await prisma.adcAchado.groupBy({ by: ['casoId'], where: { casoId: { in: ids }, resolvido: false, gravidade: { in: ['MEDIA', 'ALTA', 'CRITICA'] } }, _count: { _all: true } }) : []
  const ab = new Map(abertos.map((a) => [a.casoId, a._count._all]))
  const agora = Date.now()
  res.json({
    items: rows.map((r) => ({ ...r, documentos: r._count.documentos, achadosAbertos: ab.get(r.id) ?? 0, atrasado: ['EM_FILA', 'EM_REVISAO'].includes(r.status) && r.slaEm.getTime() < agora })), total, page, pageSize,
  })
}))

async function detalheCaso(req: AuthenticatedRequest, id: string, registrarAcesso = true) {
  const tenantId = tid(req)
  const caso = await carregarCaso(req, id, {
    documentos: { orderBy: { createdAt: 'asc' }, select: { id: true, tipo: true, arquivoNome: true, mime: true, tamanho: true, hashArquivo: true, camposResumo: true, metadados: true, checklist: true, confianca: true, modoExtracao: true, createdAt: true } },
    achados: true, equivalencias: { orderBy: { origemDisciplina: 'asc' } }, consultas: { orderBy: { createdAt: 'asc' } }, eventos: { orderBy: { createdAt: 'desc' }, take: 100 },
  })
  if (registrarAcesso) await registrarAcessoSensivel(req, { recurso: 'analise-docs/casos', recursoId: caso.id, categoria: 'DOCUMENTO_PESSOAL', acao: 'LEITURA', titularTipo: caso.studentId ? 'ALUNO' : undefined, titularId: caso.studentId ?? undefined })
  const cfg = await getConfig(tenantId)
  const achados = [...caso.achados].sort((a: any, b: any) => (ORDEM_GRAV[b.gravidade] ?? 0) - (ORDEM_GRAV[a.gravidade] ?? 0))
  const exigeAlcada = caso.bloqueado || caso.resultado === 'CRITICO'
  return {
    ...caso, achados,
    responsavelNome: await nomeUsuario(tenantId, caso.responsavelId), criadoPorNome: await nomeUsuario(tenantId, caso.criadoPorId), decididoPorNome: await nomeUsuario(tenantId, caso.decididoPorId),
    diretoria: diretoriaDe(cfg, caso.origem),
    permissoes: { verDados: podeVerDados(req, caso.origem), decidir: !exigeAlcada || podeDecidirCritico(req, cfg, caso.origem), exigeAlcada, outraPessoaDecide: exigeAlcada && caso.criadoPorId === uid(req) && !ehSuper(req) },
    aviso: caso.consultas.some((c: any) => c.simulada) ? 'A verificação da instituição foi SIMULADA (base local de demonstração), não uma consulta oficial ao MEC/secretarias estaduais.' : undefined,
  }
}

router.get('/casos/:id', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => { res.json(await detalheCaso(req, String(req.params.id))) }))

/** Dados pessoais POR EXTENSO: só perfis do setor/administração, com motivo obrigatório e log de acesso. */
router.get('/casos/:id/campos', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = tid(req)
  const caso = await carregarCaso(req, String(req.params.id), { documentos: { orderBy: { createdAt: 'asc' } } })
  if (!podeVerDados(req, caso.origem)) fail(403, 'Seu perfil vê apenas dados mascarados neste setor.')
  if (caso.dadosApagadosEm) fail(410, 'Os dados pessoais foram apagados pela política de retenção.')
  const motivo = (qs(req.query.motivo) || '').trim()
  if (motivo.length < 5) fail(400, 'Informe o motivo do acesso (mín. 5 caracteres): ele fica registrado.')
  await registrarAcessoSensivel(req, { recurso: 'analise-docs/campos', recursoId: caso.id, categoria: 'DOCUMENTO_PESSOAL', acao: 'LEITURA_COMPLETA', titularTipo: caso.studentId ? 'ALUNO' : undefined, titularId: caso.studentId ?? undefined, motivo })
  await evento(tenantId, caso.id, 'ACESSO_DADOS', { usuarioId: uid(req), texto: `Dados completos consultados. Motivo: ${motivo.slice(0, 200)}` })
  await audit({ tenantId, userId: uid(req), modulo: MOD, acao: 'DADOS_COMPLETOS_CONSULTADOS', refType: 'AdcCaso', refId: caso.id, detalhes: { motivo } })
  res.json({ documentos: caso.documentos.map((d: any) => ({ id: d.id, tipo: d.tipo, campos: lerDados(d.dadosCif) })), aviso: 'Dados pessoais: uso restrito à finalidade da análise; o acesso foi registrado.' })
}))

// ------------------------------------------------------------------ ações sobre o caso
router.post('/casos/:id/documentos', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const b = parseBody(docSchema.extend({ analisar: z.boolean().optional() }), req.body)
  const caso = await carregarCaso(req, String(req.params.id))
  if (['APROVADO'].includes(caso.status)) fail(409, 'Caso já aprovado: abra um novo caso.')
  const { analisar, ...d } = b
  await adicionarDocumento(tid(req), caso.id, ator(req), d as any)
  if (analisar !== false) await analisarCaso(tid(req), caso.id, ator(req), { reanalise: true })
  res.status(201).json(await detalheCaso(req, caso.id, false))
}))

router.patch('/casos/:id/documentos/:docId/campos', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const b = parseBody(z.object({ campos: camposSchema, metadados: metaSchema.optional(), reanalisar: z.boolean().optional() }), req.body)
  const tenantId = tid(req)
  const caso = await carregarCaso(req, String(req.params.id))
  if (caso.status === 'APROVADO' || caso.status === 'REJEITADO') fail(409, 'Caso já decidido: os campos não podem mais ser alterados.')
  if (caso.dadosApagadosEm) fail(409, 'Dados apagados pela política de retenção.')
  const doc = await prisma.adcDocumento.findFirst({ where: { id: String(req.params.docId), casoId: caso.id, tenantId } })
  if (!doc) fail(404, 'Documento não encontrado.')
  const atual = lerDados(doc.dadosCif) ?? {}
  const novos: Campos = { ...atual, ...b.campos }
  const p = prepararDocumento(tenantId, { tipo: doc.tipo, campos: novos, metadados: { ...((doc.metadados as any) ?? {}), ...(b.metadados ?? {}) } })
  await prisma.adcDocumento.update({ where: { id: doc.id }, data: { dadosCif: p.data.dadosCif, camposResumo: p.data.camposResumo, checklist: p.data.checklist, metadados: p.data.metadados, chaveDup: p.data.chaveDup, modoExtracao: 'CAMPOS', confianca: 0.95 } })
  if (novos.cpf || novos.nome) await prisma.adcCaso.update({ where: { id: caso.id }, data: { ...(novos.nome && !caso.sujeitoNome ? { sujeitoNome: mascararNomeDoc(novos.nome) } : {}), ...(novos.cpf && !caso.sujeitoCpfHash ? { sujeitoCpfHash: hashDocumento(novos.cpf, tenantId) } : {}) } })
  await evento(tenantId, caso.id, 'CAMPOS_EDITADOS', { usuarioId: uid(req), texto: `Campos conferidos/corrigidos manualmente: ${Object.keys(b.campos).join(', ')}.`, dados: { campos: Object.keys(b.campos) } })
  await audit({ tenantId, userId: uid(req), modulo: MOD, acao: 'CAMPOS_EDITADOS', refType: 'AdcDocumento', refId: doc.id, detalhes: { campos: Object.keys(b.campos) } })
  if (b.reanalisar !== false) await analisarCaso(tenantId, caso.id, ator(req), { reanalise: true })
  res.json(await detalheCaso(req, caso.id, false))
}))

router.post('/casos/:id/analisar', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const caso = await carregarCaso(req, String(req.params.id))
  if (caso.status === 'APROVADO') fail(409, 'Caso já aprovado.')
  await analisarCaso(tid(req), caso.id, ator(req), { reanalise: true })
  res.json(await detalheCaso(req, caso.id, false))
}))

router.post('/casos/:id/atribuir', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const b = parseBody(z.object({ responsavelId: z.string().min(1).max(80) }), req.body)
  const tenantId = tid(req)
  const caso = await carregarCaso(req, String(req.params.id))
  const u = await prisma.user.findFirst({ where: { id: b.responsavelId, tenantId, isActive: true }, select: { id: true } })
  if (!u) fail(400, 'Usuário não encontrado nesta instituição.')
  await prisma.adcCaso.update({ where: { id: caso.id }, data: { responsavelId: u.id } })
  await evento(tenantId, caso.id, 'ATRIBUICAO', { usuarioId: uid(req), texto: `Caso atribuído a ${await nomeUsuario(tenantId, u.id)}.` })
  await notify({ tenantId, userId: u.id, assunto: `Caso ${caso.codigo} atribuído a você`, mensagem: `O caso ${caso.codigo} do Agente de documentos foi atribuído a você para revisão.`, refType: 'AdcCaso', refId: caso.id })
  res.json(await detalheCaso(req, caso.id, false))
}))

router.post('/casos/:id/comentarios', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const b = parseBody(z.object({ texto: z.string().trim().min(2).max(2000) }), req.body)
  const caso = await carregarCaso(req, String(req.params.id))
  await evento(tid(req), caso.id, 'COMENTARIO', { usuarioId: uid(req), texto: b.texto })
  res.status(201).json({ ok: true })
}))

async function recalcular(tenantId: string, casoId: string) {
  const ach = await prisma.adcAchado.findMany({ where: { casoId } })
  const abertos = ach.filter((a) => !a.resolvido)
  await prisma.adcCaso.update({ where: { id: casoId }, data: { score: pontuar(ach), resultado: resultadoDe(abertos) } })
}

router.post('/casos/:id/achados/:aid/resolver', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const b = parseBody(z.object({ nota: z.string().trim().min(10).max(1000) }), req.body)
  const tenantId = tid(req)
  const caso = await carregarCaso(req, String(req.params.id))
  const cfg = await getConfig(tenantId)
  const a = await prisma.adcAchado.findFirst({ where: { id: String(req.params.aid), casoId: caso.id, tenantId } })
  if (!a) fail(404, 'Achado não encontrado.')
  if (a.gravidade === 'CRITICA' && !podeDecidirCritico(req, cfg, caso.origem)) fail(403, 'Achado crítico só pode ser resolvido pela reitoria/administração ou pela diretoria do setor.')
  if (a.resolvido) fail(409, 'Achado já resolvido.')
  await prisma.adcAchado.update({ where: { id: a.id }, data: { resolvido: true, resolvidoPorId: uid(req), resolvidoEm: new Date(), resolucaoNota: b.nota } })
  await recalcular(tenantId, caso.id)
  await evento(tenantId, caso.id, 'ACHADO_RESOLVIDO', { usuarioId: uid(req), texto: `Achado "${a.titulo}" marcado como resolvido: ${b.nota}`, dados: { regra: a.regra, gravidade: a.gravidade } })
  await audit({ tenantId, userId: uid(req), modulo: MOD, acao: 'ACHADO_RESOLVIDO', refType: 'AdcCaso', refId: caso.id, detalhes: { regra: a.regra, gravidade: a.gravidade } })
  res.json(await detalheCaso(req, caso.id, false))
}))

const DECISOES = ['APROVAR', 'APROVAR_COM_RESSALVA', 'REJEITAR', 'SOLICITAR_NOVO_DOCUMENTO'] as const
const STATUS_DECISAO: Record<string, string> = { APROVAR: 'APROVADO', APROVAR_COM_RESSALVA: 'APROVADO', REJEITAR: 'REJEITADO', SOLICITAR_NOVO_DOCUMENTO: 'DOCUMENTO_SOLICITADO' }

router.post('/casos/:id/decisao', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const b = parseBody(z.object({ decisao: z.enum(DECISOES), justificativa: z.string().trim().min(10).max(2000) }), req.body)
  const tenantId = tid(req)
  const caso = await carregarCaso(req, String(req.params.id))
  const cfg = await getConfig(tenantId)
  if (caso.status === 'EM_FILA') fail(409, 'O caso ainda não foi analisado.')
  if (caso.status === 'APROVADO' || caso.status === 'REJEITADO') fail(409, 'Caso já decidido. Para rever, reanalise com novos documentos.')
  const exigeAlcada = caso.bloqueado || caso.resultado === 'CRITICO'
  if (exigeAlcada) {
    if (!podeDecidirCritico(req, cfg, caso.origem)) fail(403, 'Caso CRÍTICO: a decisão cabe à reitoria/administração ou à diretoria do setor.')
    if (caso.criadoPorId === uid(req) && !ehSuper(req)) fail(403, 'Caso CRÍTICO: a decisão deve ser tomada por outra pessoa que não quem enviou o documento.')
    if (b.justificativa.length < 20) fail(400, 'Caso crítico: a justificativa deve ter ao menos 20 caracteres.')
  }
  const agora = new Date()
  await prisma.$transaction(async (tx) => {
    if (exigeAlcada && ['APROVAR', 'APROVAR_COM_RESSALVA'].includes(b.decisao))
      await tx.adcAchado.updateMany({ where: { casoId: caso.id, resolvido: false, gravidade: { in: ['CRITICA', 'ALTA'] } }, data: { resolvido: true, resolvidoPorId: uid(req), resolvidoEm: agora, resolucaoNota: `Decisão humana: ${b.decisao} — ${b.justificativa}`.slice(0, 500) } })
    await tx.adcCaso.update({ where: { id: caso.id }, data: { status: STATUS_DECISAO[b.decisao], decisao: b.decisao, decisaoJustificativa: b.justificativa, decididoEm: agora, decididoPorId: uid(req), bloqueado: false, expiraEm: new Date(agora.getTime() + cfg.retencaoDias * 86_400_000) } })
  })
  await recalcular(tenantId, caso.id)
  await evento(tenantId, caso.id, 'DECISAO', { usuarioId: uid(req), texto: `${b.decisao}: ${b.justificativa}`, dados: { decisao: b.decisao, critico: exigeAlcada } })
  if (caso.bloqueado) await evento(tenantId, caso.id, 'DESBLOQUEIO', { usuarioId: uid(req), texto: b.decisao === 'REJEITAR' || b.decisao === 'SOLICITAR_NOVO_DOCUMENTO' ? 'Bloqueio substituído por decisão desfavorável: o processo só avança com novo parecer favorável.' : 'Bloqueio liberado por decisão humana registrada.' })
  await encerrarAlertas(tenantId, caso.id, uid(req))
  await audit({ tenantId, userId: uid(req), modulo: MOD, acao: 'DECISAO_REGISTRADA', refType: 'AdcCaso', refId: caso.id, detalhes: { decisao: b.decisao, critico: exigeAlcada, codigo: caso.codigo } })
  if (caso.criadoPorId && caso.criadoPorId !== uid(req)) await notify({ tenantId, userId: caso.criadoPorId, assunto: `Decisão no caso ${caso.codigo}: ${b.decisao}`, mensagem: `O caso ${caso.codigo} foi decidido (${b.decisao}). Justificativa registrada no histórico.`, refType: 'AdcCaso', refId: caso.id })
  res.json(await detalheCaso(req, caso.id, false))
}))

router.post('/casos/:id/equivalencias/:eid/decisao', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const b = parseBody(z.object({ decisao: z.enum(['ACEITA', 'REJEITADA']), nota: z.string().trim().max(500).optional() }), req.body)
  const tenantId = tid(req)
  const caso = await carregarCaso(req, String(req.params.id))
  const e = await prisma.adcEquivalenciaSug.findFirst({ where: { id: String(req.params.eid), casoId: caso.id, tenantId } })
  if (!e) fail(404, 'Sugestão não encontrada.')
  const avisos = (e.avisos as any[] | null) ?? []
  if (b.decisao === 'ACEITA' && e.sugestao === 'NAO_EQUIVALENTE') fail(409, 'Esta disciplina foi classificada como NÃO equivalente: não pode ser aceita para aproveitamento.')
  if (b.decisao === 'ACEITA' && avisos.some((a) => a.gravidade === 'ALTA') && (b.nota ?? '').length < 10) fail(400, 'Há avisos de gravidade alta (prazo, pré-requisito, nota...): registre uma justificativa (mín. 10 caracteres) para aceitar.')
  await prisma.adcEquivalenciaSug.update({ where: { id: e.id }, data: { decisao: b.decisao, decididoPorId: uid(req), decididoEm: new Date() } })
  await evento(tenantId, caso.id, 'EQUIVALENCIA_DECIDIDA', { usuarioId: uid(req), texto: `Equivalência de "${e.origemDisciplina}" ${b.decisao}${b.nota ? ': ' + b.nota : ''}.`, dados: { disciplina: e.origemDisciplina, destino: e.disciplinaNome, decisao: b.decisao } })
  res.json(await detalheCaso(req, caso.id, false))
}))

/** Simulação avulsa de equivalência (sem criar caso): disciplinas informadas x matriz do curso. */
router.post('/equivalencias/simular', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const b = parseBody(z.object({ programId: z.string().min(1).max(80), studentId: z.string().max(80).optional(), texto: z.string().max(80_000).optional(), disciplinas: camposSchema.shape.disciplinas }), req.body)
  const tenantId = tid(req)
  await validarRefs(tenantId, { programId: b.programId, studentId: b.studentId })
  const discs = (b.disciplinas ?? extrairCampos(b.texto ?? '').disciplinas ?? []) as DisciplinaOrigem[]
  if (!discs.length) fail(400, 'Informe disciplinas (lista) ou um texto com linhas "Disciplina | CH | Nota | Situação | Ano".')
  const caso = { programId: b.programId, studentId: b.studentId }
  const cfg = await getConfig(tenantId)
  const destinos = await carregarDestinos(tenantId, caso.programId)
  const hist = await historicoLocal(tenantId, caso.studentId, destinos)
  const r = sugerirEquivalencias(discs, destinos, { percentualAproveitamento: cfg.percentualAproveitamento, similaridadeMinima: cfg.similaridadeMinima, validadeAproveitamentoAnos: cfg.validadeAproveitamentoAnos }, hist)
  res.json({ configuracao: { percentualAproveitamento: cfg.percentualAproveitamento, similaridadeMinima: cfg.similaridadeMinima, validadeAproveitamentoAnos: cfg.validadeAproveitamentoAnos }, matrizComDisciplinas: destinos.length, sugestoes: r.map((s) => ({ origem: s.origem.nome, origemCargaHoraria: s.origem.cargaHoraria, destino: s.destino?.nome ?? null, cargaDestino: s.destino?.cargaHoraria ?? null, similaridade: s.similaridade, razaoCarga: s.razaoCarga, sugestao: s.sugestao, avisos: s.avisos })) })
}))

// ------------------------------------------------------------------ laudo imprimível (somente dados mascarados)
router.get('/casos/:id/laudo', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = tid(req)
  const d = await detalheCaso(req, String(req.params.id))
  const b: Branding = await getBranding(tenantId)
  const cor = (g: string) => (g === 'CRITICA' ? '#b91c1c' : g === 'ALTA' ? '#c2410c' : g === 'MEDIA' ? '#a16207' : g === 'BAIXA' ? '#475569' : '#0f766e')
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Laudo ${esc(d.codigo)} — ${esc(b.nome)}</title>
<style>body{font-family:system-ui,sans-serif;margin:0;background:#f1f5f9;color:#0f172a}.f{max-width:860px;margin:16px auto;background:#fff;padding:24px 32px;box-shadow:0 2px 10px #0002}h2{font-size:16px;margin:20px 0 6px;color:#0f172a}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:left;vertical-align:top}th{background:#f1f5f9}.tag{display:inline-block;color:#fff;border-radius:10px;padding:1px 8px;font-size:11px;font-weight:700}.aviso{background:#fef9c3;border:1px solid #facc15;padding:8px 12px;border-radius:6px;font-size:13px}@media print{body{background:#fff}.f{box-shadow:none;margin:0}.b{display:none}}</style></head><body>
<div class="f"><div class="b" style="text-align:right"><button onclick="window.print()">Imprimir / salvar PDF</button></div>
${brandHeaderHtml(b, { titulo: 'Laudo do Agente de análise de documentos', subtitulo: d.codigo })}
<p><b>Caso:</b> ${esc(d.titulo)} · <b>Origem:</b> ${esc(d.origem)} · <b>Contexto:</b> ${esc(d.contexto)} · <b>Titular (mascarado):</b> ${esc(d.sujeitoNome || '—')}</p>
<p><b>Resultado:</b> ${esc(d.resultado || '—')} · <b>Risco:</b> ${d.score ?? '—'}/100 · <b>Status:</b> ${esc(d.status)}${d.bloqueado ? ' · <b style="color:#b91c1c">PROCESSO BLOQUEADO até decisão humana</b>' : ''}</p>
<p>${esc(d.resumo || '')}</p>
${d.aviso ? `<p class="aviso">${esc(d.aviso)}</p>` : ''}
<h2>Achados (explicáveis)</h2><table><tr><th>Gravidade</th><th>Achado</th><th>Explicação / evidência</th><th>Situação</th></tr>
${d.achados.map((a: any) => `<tr><td><span class="tag" style="background:${cor(a.gravidade)}">${esc(a.gravidade)}</span></td><td>${esc(a.titulo)}<br/><small>${esc(a.categoria)} · ${esc(a.regra)}</small></td><td>${esc(a.explicacao)}${a.sugestao ? `<br/><i>Sugestão: ${esc(a.sugestao)}</i>` : ''}${a.evidencia ? `<br/><small>${esc(JSON.stringify(a.evidencia))}</small>` : ''}</td><td>${a.resolvido ? 'Resolvido' : 'Aberto'}</td></tr>`).join('') || '<tr><td colspan="4">Nenhum achado.</td></tr>'}</table>
<h2>Documentos</h2><table><tr><th>Tipo</th><th>Arquivo</th><th>Extração</th><th>Checklist</th></tr>
${d.documentos.map((x: any) => `<tr><td>${esc(TIPOS_DOCUMENTO[x.tipo]?.nome || x.tipo)}</td><td>${esc(x.arquivoNome || '—')}<br/><small>${esc((x.hashArquivo || '').slice(0, 16))}</small></td><td>${esc(x.modoExtracao || '')}</td><td>${((x.checklist as any[]) || []).map((c) => `${c.ok ? '✔' : c.obrigatorio ? '✖' : '–'} ${esc(c.item)}`).join('<br/>')}</td></tr>`).join('')}</table>
${d.equivalencias.length ? `<h2>Equivalência de disciplinas</h2><table><tr><th>Origem</th><th>Matriz</th><th>Similar.</th><th>Carga</th><th>Sugestão</th><th>Avisos</th><th>Decisão</th></tr>${d.equivalencias.map((e: any) => `<tr><td>${esc(e.origemDisciplina)} (${e.origemCargaHoraria ?? '—'} h)</td><td>${esc(e.disciplinaNome || '—')}</td><td>${e.similaridade}%</td><td>${e.razaoCarga}%</td><td>${esc(e.sugestao)}</td><td>${((e.avisos as any[]) || []).map((a) => esc(a.texto)).join('<br/>')}</td><td>${esc(e.decisao)}</td></tr>`).join('')}</table>` : ''}
${d.consultas.length ? `<h2>Consultas de instituição</h2><table><tr><th>Tipo</th><th>Termo</th><th>Provedor</th><th>Resultado</th></tr>${d.consultas.map((c: any) => `<tr><td>${esc(c.tipo)}</td><td>${esc(c.termo)}</td><td>${esc(c.provedor)}${c.simulada ? ' (SIMULADO)' : ''}</td><td>${c.encontrada ? esc(c.situacao || '') : 'Não encontrada'}</td></tr>`).join('')}</table>` : ''}
${d.decisao ? `<h2>Decisão humana</h2><p><b>${esc(d.decisao)}</b> por ${esc(d.decididoPorNome || '—')} em ${d.decididoEm ? new Date(d.decididoEm).toLocaleString('pt-BR') : '—'}.<br/>${esc(d.decisaoJustificativa || '')}</p>` : ''}
<p class="aviso">Este laudo é apoio à conferência: não substitui perícia documental nem a decisão da instituição. Dados pessoais exibidos mascarados (LGPD).</p></div></body></html>`
  res.type('html').send(html)
}))

// ------------------------------------------------------------------ bloqueio (consulta p/ telas de outros módulos)
router.get('/bloqueio', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const refType = qs(req.query.refType), refId = qs(req.query.refId)
  if (!refType || !refId) fail(400, 'Informe refType e refId.')
  const s = await statusBloqueio(tid(req), { refType, refId })
  res.json({ bloqueado: s.bloqueado, motivo: (s as any).motivo ?? null, caso: (s as any).caso ?? null })
}))

// ------------------------------------------------------------------ painel
router.get('/painel', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = tid(req)
  const origens = origensDoUsuario(req)
  const base = { tenantId, origem: { in: origens } }
  const agora = new Date()
  const d30 = new Date(agora.getTime() - 30 * 86_400_000), d90 = new Date(agora.getTime() - 90 * 86_400_000)
  const abertos = { status: { in: ['EM_FILA', 'EM_REVISAO'] } }
  const [porStatus, porOrigem, porResultado, naFila, criticosAbertos, bloqueados, atrasados, decididos, ultimos, achadosTop] = await Promise.all([
    prisma.adcCaso.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
    prisma.adcCaso.groupBy({ by: ['origem'], where: { ...base, ...abertos }, _count: { _all: true } }),
    prisma.adcCaso.groupBy({ by: ['resultado'], where: { ...base, createdAt: { gte: d90 } }, _count: { _all: true } }),
    prisma.adcCaso.count({ where: { ...base, ...abertos } }),
    prisma.adcCaso.count({ where: { ...base, ...abertos, resultado: 'CRITICO' } }),
    prisma.adcCaso.count({ where: { ...base, bloqueado: true } }),
    prisma.adcCaso.count({ where: { ...base, ...abertos, slaEm: { lt: agora } } }),
    prisma.adcCaso.findMany({ where: { ...base, decididoEm: { gte: d30 } }, select: { createdAt: true, decididoEm: true, slaEm: true, origem: true } }),
    prisma.adcCaso.findMany({ where: { ...base, createdAt: { gte: d30 } }, select: { createdAt: true, resultado: true } }),
    prisma.adcAchado.groupBy({ by: ['regra', 'gravidade'], where: { tenantId, createdAt: { gte: d90 }, caso: { origem: { in: origens } } }, _count: { _all: true }, orderBy: { _count: { regra: 'desc' } }, take: 10 }),
  ])
  const horas = decididos.map((c) => (c.decididoEm!.getTime() - c.createdAt.getTime()) / 3_600_000)
  const noPrazo = decididos.filter((c) => c.decididoEm! <= c.slaEm).length
  const serie: Record<string, { dia: string; criados: number; criticos: number }> = {}
  for (let i = 29; i >= 0; i--) { const dia = new Date(agora.getTime() - i * 86_400_000).toISOString().slice(0, 10); serie[dia] = { dia, criados: 0, criticos: 0 } }
  for (const c of ultimos) { const s = serie[c.createdAt.toISOString().slice(0, 10)]; if (s) { s.criados++; if (c.resultado === 'CRITICO') s.criticos++ } }
  res.json({
    naFila, criticosAbertos, bloqueados, atrasados,
    decididos30d: decididos.length, tempoMedioHoras: horas.length ? Math.round((horas.reduce((a, b) => a + b, 0) / horas.length) * 10) / 10 : null, noPrazoPct: decididos.length ? Math.round((noPrazo / decididos.length) * 100) : null,
    porStatus: Object.fromEntries(porStatus.map((x) => [x.status, x._count._all])), filaPorOrigem: Object.fromEntries(porOrigem.map((x) => [x.origem, x._count._all])),
    porResultado90d: Object.fromEntries(porResultado.map((x) => [x.resultado ?? 'SEM_ANALISE', x._count._all])),
    achadosFrequentes: achadosTop.map((a) => ({ regra: a.regra, gravidade: a.gravidade, total: a._count._all })), serie: Object.values(serie),
    provedor: { simulado: !ProvedorGatewayReal.configurado() },
  })
}))

// ------------------------------------------------------------------ retenção (LGPD): apaga os dados pessoais cifrados após a decisão + prazo
export async function aplicarRetencao(now = new Date(), tenantId?: string) {
  const vencidos = await prisma.adcCaso.findMany({ where: { ...(tenantId ? { tenantId } : {}), dadosApagadosEm: null, status: { in: ['APROVADO', 'REJEITADO', 'DOCUMENTO_SOLICITADO'] }, expiraEm: { lt: now } }, select: { id: true, tenantId: true }, take: 500 })
  for (const c of vencidos) {
    await prisma.adcDocumento.updateMany({ where: { casoId: c.id }, data: { dadosCif: null, camposResumo: {} as any } })
    await prisma.adcCaso.update({ where: { id: c.id }, data: { dadosApagadosEm: now, sujeitoNome: null } })
    await evento(c.tenantId, c.id, 'DADOS_APAGADOS', { texto: 'Dados pessoais cifrados apagados pela política de retenção.' })
    await audit({ tenantId: c.tenantId, modulo: MOD, acao: 'RETENCAO_APLICADA', refType: 'AdcCaso', refId: c.id })
  }
  return { apagados: vencidos.length }
}
registerEduJob('analise-docs.retencao', () => aplicarRetencao())

/** Aplica a retenção agora para o tenant (administração). */
router.post('/retencao/executar', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => { res.json(await aplicarRetencao(new Date(), tid(req))) }))

export default router
