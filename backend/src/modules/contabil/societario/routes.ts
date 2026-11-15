import { Response, Router } from 'express'
import { z } from 'zod'
import { AuthenticatedRequest, asyncHandler, auditar, httpError, pageParams, parseBody, porMetodo, prisma, qs, requireAuth, tid, uid } from '../host2'
import { AVISO_SIMULACAO, FAIXA_AVISO, diffDias, iso10, meioDia, somaDias, validarCpf } from '../util'
import { CNAES, SETORES, buscarCnaes, cnaeDe, formatarCnae } from './cnae'
import { DOCUMENTOS_POR_TIPO, TITULO_DOC, gerarDocumento, type DadosAbertura } from './documentos'
import { ORGAO_DO_TIPO, TIPOS_PROTOCOLO, obterProvedorRegistro, provedoresRegistro } from './provedor'
import { ETAPAS, ROTULO_ETAPA, TIPOS, TIPOS_INFO, alvarasDaAtividade, checarViabilidade, tarefasPadrao } from './regras'

// Abertura de empresas (assistente passo a passo, CNAEs, viabilidade SIMULADA, documentos, CNPJ/IE/IM SIMULADOS, alvarás).
// Montado em /api/edu/contabil/societario. Tudo que fala com órgãos públicos é SIMULAÇÃO (ver provedor.ts).
const router = Router()
router.use(requireAuth)
router.use(porMetodo)
const MOD = 'societario'
const ALVARA_TIPOS = ['FUNCIONAMENTO', 'BOMBEIROS', 'VIGILANCIA_SANITARIA', 'AMBIENTAL', 'OUTRO'] as const

const cnaeStr = z.string().regex(/^\d{4}-?\d\/?\d{2}$|^\d{7}$/, 'CNAE deve ter 7 dígitos').transform((s) => s.replace(/\D+/g, ''))
const enderecoSchema = z.object({
  cep: z.string().max(12).optional(), logradouro: z.string().max(160).optional(), numero: z.string().max(20).optional(), complemento: z.string().max(80).optional().nullable(),
  bairro: z.string().max(80).optional(), municipio: z.string().max(80).optional(), uf: z.string().max(2).optional(), tipoImovel: z.enum(['COMERCIAL', 'RESIDENCIAL', 'MISTO']).optional(), areaM2: z.number().min(0).max(1_000_000).optional(),
}).partial().passthrough()
const socioSchema = z.object({
  nome: z.string().min(3).max(120), cpf: z.string().max(20).optional().nullable().refine((v) => !v || validarCpf(v), 'CPF inválido'),
  participacao: z.number().min(0).max(100).default(0), administrador: z.boolean().default(false), proLabore: z.number().min(0).max(10_000_000).optional().nullable(),
  estadoCivil: z.string().max(40).optional().nullable(), nacionalidade: z.string().max(40).optional().nullable(), profissao: z.string().max(80).optional().nullable(), enderecoTexto: z.string().max(240).optional().nullable(),
})
const aberturaBase = z.object({
  nomeEmpresarial: z.string().min(3).max(160), nomeFantasia: z.string().max(120).optional().nullable(), tipo: z.enum(TIPOS),
  capitalSocial: z.number().min(0).max(1e12).default(0), objetoSocial: z.string().max(2000).optional().nullable(), endereco: enderecoSchema.optional(),
  municipio: z.string().max(80).optional().nullable(), uf: z.string().length(2).optional().nullable(), cnaePrincipal: cnaeStr.optional().nullable(), cnaesSecundarios: z.array(cnaeStr).max(40).optional(),
  dataPrevistaAbertura: z.string().optional().nullable(), responsavelId: z.string().max(80).optional().nullable(), responsavelNome: z.string().max(120).optional().nullable(),
  observacoes: z.string().max(2000).optional().nullable(), empresaId: z.string().max(80).optional().nullable(),
})

async function carregar(tenantId: string, id: string) {
  const ab = await prisma.ctbSocAbertura.findFirst({ where: { id, tenantId } })
  if (!ab) throw httpError(404, 'Abertura não encontrada.')
  return ab
}
const dadosDoc = async (tenantId: string, ab: any): Promise<DadosAbertura> => {
  const socios = await prisma.ctbSocSocio.findMany({ where: { tenantId, aberturaId: ab.id }, orderBy: { createdAt: 'asc' } })
  return { nomeEmpresarial: ab.nomeEmpresarial, nomeFantasia: ab.nomeFantasia, tipo: ab.tipo, capitalSocial: ab.capitalSocial, objetoSocial: ab.objetoSocial, endereco: ab.endereco, municipio: ab.municipio, uf: ab.uf, cnaePrincipal: ab.cnaePrincipal, cnaesSecundarios: (ab.cnaesSecundarios as string[]) || [], socios: socios.map((s) => ({ ...s })) as any, dataPrevista: ab.dataPrevistaAbertura }
}
const ordemEtapa = (e: string) => ETAPAS.indexOf(e as any)
async function avancaEtapa(tenantId: string, abId: string, atual: string, nova: string) {
  if (ordemEtapa(nova) > ordemEtapa(atual)) await prisma.ctbSocAbertura.update({ where: { id: abId }, data: { etapa: nova } })
}
const situacaoAlvara = (a: { validade: Date | null; status: string; alertaDias: number }, hoje = new Date()) => {
  if (a.status === 'DISPENSADO') return { situacao: 'DISPENSADO', diasParaVencer: null as number | null, alerta: false }
  if (!a.validade) return { situacao: a.status, diasParaVencer: null as number | null, alerta: false }
  const d = diffDias(a.validade, hoje)
  if (d < 0) return { situacao: 'VENCIDO', diasParaVencer: d, alerta: true }
  return { situacao: a.status === 'VIGENTE' ? 'VIGENTE' : a.status, diasParaVencer: d, alerta: d <= a.alertaDias }
}

// ---------------- meta e CNAEs ----------------
router.get('/meta', asyncHandler(async (_req, res) => {
  res.json({
    faixa: FAIXA_AVISO, simulacao: AVISO_SIMULACAO,
    tipos: TIPOS.map((t) => ({ tipo: t, ...TIPOS_INFO[t] })),
    etapas: ETAPAS.map((e) => ({ etapa: e, nome: ROTULO_ETAPA[e] })),
    setores: Object.entries(SETORES).map(([setor, nome]) => ({ setor, nome })),
    tiposProtocolo: TIPOS_PROTOCOLO.map((t) => ({ tipo: t, orgao: ORGAO_DO_TIPO[t] })),
    documentos: TITULO_DOC, documentosPorTipo: DOCUMENTOS_POR_TIPO,
    provedores: provedoresRegistro(), totalCnaes: CNAES.length,
  })
}))

router.get('/cnaes', asyncHandler(async (req, res) => {
  const itens = buscarCnaes(qs(req.query.q), { setor: qs(req.query.setor), mei: qs(req.query.mei) === 'true' }, Math.min(200, Number(qs(req.query.limite)) || 60))
  res.json({ total: itens.length, itens: itens.map((c) => ({ ...c, codigoFormatado: formatarCnae(c.codigo) })), aviso: 'Base referencial: confirme sempre na tabela oficial do IBGE/CONCLA e com seu contador.' })
}))

router.get('/empresas-ref', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const [a, f, d] = await Promise.all([
    prisma.ctbSocAbertura.findMany({ where: { tenantId, empresaId: { not: null } }, select: { empresaId: true, nomeEmpresarial: true } }),
    prisma.ctbDpFuncionario.findMany({ where: { tenantId }, select: { empresaId: true, empresaNome: true }, distinct: ['empresaId'] }),
    prisma.ctbIrDeclaracao.findMany({ where: { tenantId, empresaId: { not: null } }, select: { empresaId: true, titularNome: true }, distinct: ['empresaId'] }),
  ])
  const m = new Map<string, string | null>()
  for (const x of a) m.set(x.empresaId!, x.nomeEmpresarial)
  for (const x of f) if (!m.has(x.empresaId)) m.set(x.empresaId, x.empresaNome)
  for (const x of d) if (!m.has(x.empresaId!)) m.set(x.empresaId!, x.titularNome)
  res.json({ itens: [...m].map(([id, nome]) => ({ id, nome })) })
}))

// ---------------- painel ----------------
router.get('/painel', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const hoje = new Date()
  const [porStatus, tarefasAtrasadas, alvaras, protocolosAbertos] = await Promise.all([
    prisma.ctbSocAbertura.groupBy({ by: ['status'], where: { tenantId }, _count: true }),
    prisma.ctbSocTarefa.count({ where: { tenantId, status: { in: ['PENDENTE', 'EM_ANDAMENTO'] }, prazo: { lt: hoje } } }),
    prisma.ctbSocAlvara.findMany({ where: { tenantId, status: { not: 'DISPENSADO' }, validade: { not: null } }, select: { validade: true, status: true, alertaDias: true } }),
    prisma.ctbSocProtocolo.count({ where: { tenantId, status: { in: ['ENVIADO', 'EM_ANALISE', 'EXIGENCIA'] } } }),
  ])
  const sit = alvaras.map((a) => situacaoAlvara(a, hoje))
  res.json({
    aberturas: Object.fromEntries(porStatus.map((s) => [s.status, s._count])),
    tarefasAtrasadas, protocolosAbertos,
    alvaras: { vencidos: sit.filter((s) => s.situacao === 'VENCIDO').length, aVencer: sit.filter((s) => s.alerta && s.situacao !== 'VENCIDO').length, total: alvaras.length },
    faixa: FAIXA_AVISO, simulacao: AVISO_SIMULACAO,
  })
}))

// ---------------- aberturas ----------------
router.get('/aberturas', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const { page, pageSize, skip, take } = pageParams(req.query)
  const status = qs(req.query.status), q = qs(req.query.q)
  const where: any = { tenantId, ...(status ? { status } : {}), ...(q ? { nomeEmpresarial: { contains: q, mode: 'insensitive' } } : {}) }
  const [total, itens] = await Promise.all([prisma.ctbSocAbertura.count({ where }), prisma.ctbSocAbertura.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take })])
  const ids = itens.map((i) => i.id)
  const tarefas = ids.length ? await prisma.ctbSocTarefa.groupBy({ by: ['aberturaId', 'status'], where: { tenantId, aberturaId: { in: ids } }, _count: true }) : []
  res.json({ total, page, pageSize, items: itens.map((a) => {
    const t = tarefas.filter((x) => x.aberturaId === a.id)
    const tot = t.reduce((s, x) => s + x._count, 0), ok = t.filter((x) => x.status === 'CONCLUIDA').reduce((s, x) => s + x._count, 0)
    return { ...a, progresso: { total: tot, concluidas: ok, percentual: tot ? Math.round((ok / tot) * 100) : 0 } }
  }) })
}))

router.post('/aberturas', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const d = parseBody(aberturaBase.extend({ socios: z.array(socioSchema).max(60).default([]) }), req.body)
  const criada = await prisma.$transaction(async (tx) => {
    const ab = await tx.ctbSocAbertura.create({
      data: {
        tenantId, nomeEmpresarial: d.nomeEmpresarial, nomeFantasia: d.nomeFantasia, tipo: d.tipo, capitalSocial: d.tipo === 'MEI' ? 0 : d.capitalSocial, objetoSocial: d.objetoSocial, endereco: d.endereco as any,
        municipio: d.municipio ?? d.endereco?.municipio, uf: (d.uf ?? d.endereco?.uf)?.toUpperCase(), cnaePrincipal: d.cnaePrincipal, cnaesSecundarios: (d.cnaesSecundarios || []).filter((c) => c !== d.cnaePrincipal) as any,
        dataPrevistaAbertura: d.dataPrevistaAbertura ? meioDia(d.dataPrevistaAbertura) : undefined, responsavelId: d.responsavelId ?? uid(req), responsavelNome: d.responsavelNome, observacoes: d.observacoes, empresaId: d.empresaId, criadoPorId: uid(req),
      },
    })
    for (const s of d.socios) await tx.ctbSocSocio.create({ data: { tenantId, aberturaId: ab.id, ...s, cpf: s.cpf ? s.cpf.replace(/\D+/g, '') : null } })
    const base = new Date()
    let ordem = 0
    for (const t of tarefasPadrao(d.tipo)) await tx.ctbSocTarefa.create({ data: { tenantId, aberturaId: ab.id, etapa: t.etapa, titulo: t.titulo, prazo: somaDias(meioDia(base), t.offset), responsavelId: ab.responsavelId, responsavelNome: ab.responsavelNome, ordem: ordem++ } })
    return ab
  })
  await auditar(req, MOD, 'ABERTURA_CRIADA', { tipo: 'CtbSocAbertura', id: criada.id }, { tipo: d.tipo })
  res.status(201).json(criada)
}))

router.get('/aberturas/:id', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const ab = await carregar(tenantId, String(req.params.id))
  const [socios, tarefas, documentos, protocolos, alvaras] = await Promise.all([
    prisma.ctbSocSocio.findMany({ where: { tenantId, aberturaId: ab.id }, orderBy: { createdAt: 'asc' } }),
    prisma.ctbSocTarefa.findMany({ where: { tenantId, aberturaId: ab.id }, orderBy: { ordem: 'asc' } }),
    prisma.ctbSocDocumento.findMany({ where: { tenantId, aberturaId: ab.id }, orderBy: { createdAt: 'desc' }, select: { id: true, tipo: true, titulo: true, versao: true, createdAt: true } }),
    prisma.ctbSocProtocolo.findMany({ where: { tenantId, aberturaId: ab.id }, orderBy: { createdAt: 'asc' } }),
    prisma.ctbSocAlvara.findMany({ where: { tenantId, aberturaId: ab.id }, orderBy: { createdAt: 'asc' } }),
  ])
  const hoje = new Date()
  const linhaTempo = ETAPAS.map((e) => {
    const ts = tarefas.filter((t) => t.etapa === e)
    const feitas = ts.filter((t) => t.status === 'CONCLUIDA').length
    const atrasadas = ts.filter((t) => t.status !== 'CONCLUIDA' && t.prazo && t.prazo < hoje).length
    return { etapa: e, nome: ROTULO_ETAPA[e], tarefas: ts.length, concluidas: feitas, atrasadas, status: ts.length && feitas === ts.length ? 'CONCLUIDA' : ab.etapa === e ? 'ATUAL' : ordemEtapa(e) < ordemEtapa(ab.etapa) ? 'PASSADA' : 'FUTURA' }
  })
  res.json({
    ...ab, socios, tarefas, documentos, protocolos, linhaTempo,
    alvaras: alvaras.map((a) => ({ ...a, ...situacaoAlvara(a, hoje) })),
    cnaes: [ab.cnaePrincipal, ...(((ab.cnaesSecundarios as string[]) || []))].filter(Boolean).map((c) => { const x = cnaeDe(c as string); return { codigo: c, codigoFormatado: formatarCnae(c as string), descricao: x?.descricao ?? 'Fora da base referencial', principal: c === ab.cnaePrincipal, anexoSimples: x?.anexoSimples, iss: x?.iss, icms: x?.icms, risco: x?.risco } }),
    faixa: FAIXA_AVISO, simulacao: AVISO_SIMULACAO,
  })
}))

router.put('/aberturas/:id', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const ab = await carregar(tenantId, String(req.params.id))
  if (ab.status === 'CANCELADA') throw httpError(409, 'Abertura cancelada não pode ser alterada.')
  const d = parseBody(aberturaBase.partial().extend({ status: z.enum(['RASCUNHO', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA']).optional(), etapa: z.enum(ETAPAS).optional() }), req.body)
  const data: any = { ...d }
  if (d.uf) data.uf = d.uf.toUpperCase()
  if (d.cnaesSecundarios) data.cnaesSecundarios = d.cnaesSecundarios.filter((c) => c !== (d.cnaePrincipal ?? ab.cnaePrincipal))
  if (d.dataPrevistaAbertura !== undefined) data.dataPrevistaAbertura = d.dataPrevistaAbertura ? meioDia(d.dataPrevistaAbertura) : null
  if (data.tipo === 'MEI') data.capitalSocial = 0
  if (d.status === 'CONCLUIDA') data.etapa = 'CONCLUIDA'
  const nova = await prisma.ctbSocAbertura.update({ where: { id: ab.id }, data })
  await auditar(req, MOD, 'ABERTURA_ATUALIZADA', { tipo: 'CtbSocAbertura', id: ab.id }, { campos: Object.keys(d) })
  res.json(nova)
}))

router.delete('/aberturas/:id', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const ab = await carregar(tenantId, String(req.params.id))
  await prisma.ctbSocAbertura.update({ where: { id: ab.id }, data: { status: 'CANCELADA' } })
  await auditar(req, MOD, 'ABERTURA_CANCELADA', { tipo: 'CtbSocAbertura', id: ab.id })
  res.json({ ok: true })
}))

// ---------------- sócios ----------------
router.post('/aberturas/:id/socios', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const ab = await carregar(tenantId, String(req.params.id))
  const d = parseBody(socioSchema, req.body)
  const info = TIPOS_INFO[ab.tipo as keyof typeof TIPOS_INFO]
  const n = await prisma.ctbSocSocio.count({ where: { tenantId, aberturaId: ab.id } })
  if (info && n >= info.maxSocios) throw httpError(409, `${info.nome} aceita no máximo ${info.maxSocios} ${info.maxSocios === 1 ? 'titular/sócio' : 'sócios'}.`)
  const s = await prisma.ctbSocSocio.create({ data: { tenantId, aberturaId: ab.id, ...d, cpf: d.cpf ? d.cpf.replace(/\D+/g, '') : null } })
  await auditar(req, MOD, 'SOCIO_ADICIONADO', { tipo: 'CtbSocSocio', id: s.id })
  res.status(201).json(s)
}))
router.put('/aberturas/:id/socios/:sid', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  await carregar(tenantId, String(req.params.id))
  const cur = await prisma.ctbSocSocio.findFirst({ where: { id: String(req.params.sid), tenantId, aberturaId: String(req.params.id) } })
  if (!cur) throw httpError(404, 'Sócio não encontrado.')
  const d = parseBody(socioSchema.partial(), req.body)
  res.json(await prisma.ctbSocSocio.update({ where: { id: cur.id }, data: { ...d, ...(d.cpf !== undefined ? { cpf: d.cpf ? d.cpf.replace(/\D+/g, '') : null } : {}) } }))
}))
router.delete('/aberturas/:id/socios/:sid', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const r = await prisma.ctbSocSocio.deleteMany({ where: { id: String(req.params.sid), tenantId, aberturaId: String(req.params.id) } })
  if (!r.count) throw httpError(404, 'Sócio não encontrado.')
  res.json({ ok: true })
}))

// ---------------- viabilidade (SIMULADA) ----------------
router.post('/aberturas/:id/viabilidade', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const ab = await carregar(tenantId, String(req.params.id))
  const d = await dadosDoc(tenantId, ab)
  const resultado = checarViabilidade({ ...d, municipio: ab.municipio, uf: ab.uf, socios: d.socios.map((s) => ({ ...s, participacao: s.participacao })) })
  await prisma.ctbSocAbertura.update({ where: { id: ab.id }, data: { viabilidade: resultado as any } })
  await avancaEtapa(tenantId, ab.id, ab.etapa, resultado.resultado === 'INVIAVEL' ? 'VIABILIDADE' : 'DOCUMENTOS')
  const prot = obterProvedorRegistro()
  const r = await prot.abrir({ tipo: 'VIABILIDADE', chave: ab.id, nomeEmpresarial: ab.nomeEmpresarial })
  await prisma.ctbSocProtocolo.create({ data: { tenantId, aberturaId: ab.id, orgao: ORGAO_DO_TIPO.VIABILIDADE, tipo: 'VIABILIDADE', protocolo: r.protocolo, status: resultado.resultado === 'INVIAVEL' ? 'INDEFERIDO' : 'DEFERIDO', simulado: prot.simulado, provedor: prot.nome, historico: [{ em: new Date().toISOString(), status: resultado.resultado, mensagem: 'Consulta de viabilidade simulada' }] as any, criadoPorId: uid(req) } })
  await auditar(req, MOD, 'VIABILIDADE_SIMULADA', { tipo: 'CtbSocAbertura', id: ab.id }, { resultado: resultado.resultado })
  res.json({ ...resultado, simulacao: AVISO_SIMULACAO })
}))

// ---------------- documentos (minutas imprimíveis) ----------------
router.post('/aberturas/:id/documentos/gerar', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const ab = await carregar(tenantId, String(req.params.id))
  const { tipo } = parseBody(z.object({ tipo: z.enum(Object.keys(TITULO_DOC) as [string, ...string[]]).optional() }), req.body)
  const tipos = tipo ? [tipo] : DOCUMENTOS_POR_TIPO[ab.tipo] || []
  const dados = await dadosDoc(tenantId, ab)
  const out: any[] = []
  for (const t of tipos) {
    const g = gerarDocumento(t, dados)
    const ult = await prisma.ctbSocDocumento.findFirst({ where: { tenantId, aberturaId: ab.id, tipo: t }, orderBy: { versao: 'desc' }, select: { versao: true } })
    out.push(await prisma.ctbSocDocumento.create({ data: { tenantId, aberturaId: ab.id, tipo: t, titulo: g.titulo, conteudo: g.conteudo, versao: (ult?.versao ?? 0) + 1, criadoPorId: uid(req) } }))
  }
  await avancaEtapa(tenantId, ab.id, ab.etapa, 'DOCUMENTOS')
  await auditar(req, MOD, 'DOCUMENTOS_GERADOS', { tipo: 'CtbSocAbertura', id: ab.id }, { tipos })
  res.status(201).json({ itens: out })
}))
router.get('/aberturas/:id/documentos/:docId', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const doc = await prisma.ctbSocDocumento.findFirst({ where: { id: String(req.params.docId), tenantId, aberturaId: String(req.params.id) } })
  if (!doc) throw httpError(404, 'Documento não encontrado.')
  res.json({ ...doc, aviso: FAIXA_AVISO })
}))

// ---------------- protocolos (CNPJ, Junta, IE, IM, alvarás) — SIMULADOS ----------------
router.get('/protocolos', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const { page, pageSize, skip, take } = pageParams(req.query)
  const where: any = { tenantId, ...(qs(req.query.status) ? { status: qs(req.query.status) } : {}), ...(qs(req.query.aberturaId) ? { aberturaId: qs(req.query.aberturaId) } : {}) }
  const [total, items] = await Promise.all([prisma.ctbSocProtocolo.count({ where }), prisma.ctbSocProtocolo.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take })])
  res.json({ total, page, pageSize, items, simulacao: AVISO_SIMULACAO })
}))

router.post('/aberturas/:id/protocolos', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const ab = await carregar(tenantId, String(req.params.id))
  const d = parseBody(z.object({ tipo: z.enum(TIPOS_PROTOCOLO as [string, ...string[]]), alvaraId: z.string().max(80).optional() }), req.body)
  const aberto = await prisma.ctbSocProtocolo.findFirst({ where: { tenantId, aberturaId: ab.id, tipo: d.tipo, status: { in: ['ENVIADO', 'EM_ANALISE', 'EXIGENCIA'] } } })
  if (aberto) throw httpError(409, `Já existe protocolo ${d.tipo} em andamento (${aberto.protocolo}).`)
  if (d.tipo === 'CNPJ' && ab.cnpj) throw httpError(409, 'Esta abertura já possui CNPJ simulado emitido.')
  if (d.tipo === 'CNPJ' && ab.tipo !== 'MEI') {
    const junta = await prisma.ctbSocProtocolo.findFirst({ where: { tenantId, aberturaId: ab.id, tipo: 'JUNTA', status: 'DEFERIDO' } })
    if (!junta) throw httpError(409, 'Para solicitar o CNPJ (simulado) é preciso ter o registro na Junta Comercial deferido.')
  }
  if ((d.tipo === 'IE' || d.tipo === 'IM') && !ab.cnpj) throw httpError(409, 'Solicite e obtenha o CNPJ antes das inscrições estadual e municipal.')
  if (d.alvaraId) { const a = await prisma.ctbSocAlvara.findFirst({ where: { id: d.alvaraId, tenantId, aberturaId: ab.id } }); if (!a) throw httpError(404, 'Alvará não encontrado nesta abertura.') }
  const prov = obterProvedorRegistro()
  const r = await prov.abrir({ tipo: d.tipo as any, chave: ab.id, nomeEmpresarial: ab.nomeEmpresarial })
  const p = await prisma.ctbSocProtocolo.create({ data: { tenantId, aberturaId: ab.id, empresaId: ab.empresaId, orgao: ORGAO_DO_TIPO[d.tipo as keyof typeof ORGAO_DO_TIPO], tipo: d.tipo, protocolo: r.protocolo, status: r.status, simulado: prov.simulado, provedor: prov.nome, historico: [{ em: new Date().toISOString(), status: r.status, mensagem: r.mensagem, alvaraId: d.alvaraId }] as any, criadoPorId: uid(req) } })
  await avancaEtapa(tenantId, ab.id, ab.etapa, d.tipo === 'JUNTA' || d.tipo === 'CNPJ' ? 'REGISTRO' : d.tipo === 'IE' || d.tipo === 'IM' ? 'INSCRICOES' : 'ALVARAS')
  await auditar(req, MOD, 'PROTOCOLO_SIMULADO_ABERTO', { tipo: 'CtbSocProtocolo', id: p.id }, { tipoProtocolo: d.tipo })
  res.status(201).json({ ...p, simulacao: AVISO_SIMULACAO })
}))

router.post('/protocolos/:pid/avancar', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const p = await prisma.ctbSocProtocolo.findFirst({ where: { id: String(req.params.pid), tenantId } })
  if (!p) throw httpError(404, 'Protocolo não encontrado.')
  const ab = p.aberturaId ? await prisma.ctbSocAbertura.findFirst({ where: { id: p.aberturaId, tenantId } }) : null
  const prov = obterProvedorRegistro()
  const r = await prov.avancar({ tipo: p.tipo as any, status: p.status, chave: p.aberturaId || p.id, nomeEmpresarial: ab?.nomeEmpresarial || '' })
  const hist = [...(((p.historico as any[]) || [])), { em: new Date().toISOString(), status: r.status, mensagem: r.mensagem }]
  const nv = await prisma.ctbSocProtocolo.update({ where: { id: p.id }, data: { status: r.status, numeroEmitido: r.numeroEmitido ?? p.numeroEmitido, historico: hist as any } })
  if (r.status === 'DEFERIDO' && ab) {
    if (p.tipo === 'CNPJ' && r.numeroEmitido) { await prisma.ctbSocAbertura.update({ where: { id: ab.id }, data: { cnpj: r.numeroEmitido, cnpjSimulado: true } }); await avancaEtapa(tenantId, ab.id, ab.etapa, 'INSCRICOES') }
    if (p.tipo === 'JUNTA') await avancaEtapa(tenantId, ab.id, ab.etapa, 'REGISTRO')
    if (p.tipo.startsWith('ALVARA')) {
      const alvaraId = ((p.historico as any[]) || []).map((h) => h.alvaraId).find(Boolean)
      if (alvaraId) {
        const emissao = meioDia(new Date())
        const meses = p.tipo === 'ALVARA_AMBIENTAL' ? 24 : 12
        await prisma.ctbSocAlvara.updateMany({ where: { id: alvaraId, tenantId }, data: { status: 'VIGENTE', numero: r.numeroEmitido, emissao, validade: new Date(Date.UTC(emissao.getUTCFullYear(), emissao.getUTCMonth() + meses, emissao.getUTCDate(), 12)) } })
      }
    }
  }
  await auditar(req, MOD, 'PROTOCOLO_SIMULADO_AVANCOU', { tipo: 'CtbSocProtocolo', id: p.id }, { status: r.status })
  res.json({ ...nv, mensagem: r.mensagem, simulacao: AVISO_SIMULACAO })
}))

router.post('/protocolos/:pid/exigencia', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const { mensagem } = parseBody(z.object({ mensagem: z.string().min(3).max(500) }), req.body)
  const p = await prisma.ctbSocProtocolo.findFirst({ where: { id: String(req.params.pid), tenantId } })
  if (!p) throw httpError(404, 'Protocolo não encontrado.')
  if (!['ENVIADO', 'EM_ANALISE'].includes(p.status)) throw httpError(409, 'Só é possível registrar exigência em protocolo enviado ou em análise.')
  res.json(await prisma.ctbSocProtocolo.update({ where: { id: p.id }, data: { status: 'EXIGENCIA', historico: [...(((p.historico as any[]) || [])), { em: new Date().toISOString(), status: 'EXIGENCIA', mensagem }] as any } }))
}))

// ---------------- alvarás ----------------
router.get('/alvaras', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const { page, pageSize, skip, take } = pageParams(req.query)
  const where: any = { tenantId, ...(qs(req.query.aberturaId) ? { aberturaId: qs(req.query.aberturaId) } : {}), ...(qs(req.query.empresaId) ? { empresaId: qs(req.query.empresaId) } : {}), ...(qs(req.query.tipo) ? { tipo: qs(req.query.tipo) } : {}) }
  const [total, rows] = await Promise.all([prisma.ctbSocAlvara.count({ where }), prisma.ctbSocAlvara.findMany({ where, orderBy: [{ validade: 'asc' }, { createdAt: 'desc' }], skip, take })])
  let items = rows.map((a) => ({ ...a, ...situacaoAlvara(a) }))
  if (qs(req.query.alerta) === 'true') items = items.filter((a) => a.alerta)
  res.json({ total, page, pageSize, items })
}))

const alvaraSchema = z.object({
  tipo: z.enum(ALVARA_TIPOS), descricao: z.string().max(300).optional().nullable(), municipio: z.string().max(80).optional().nullable(), uf: z.string().length(2).optional().nullable(),
  numero: z.string().max(60).optional().nullable(), emissao: z.string().optional().nullable(), validade: z.string().optional().nullable(),
  status: z.enum(['PENDENTE', 'EM_ANALISE', 'VIGENTE', 'VENCIDO', 'DISPENSADO']).default('PENDENTE'), alertaDias: z.number().int().min(1).max(365).default(60),
  checklist: z.array(z.object({ item: z.string().max(200), ok: z.boolean().default(false) })).max(40).optional(), observacao: z.string().max(1000).optional().nullable(),
  aberturaId: z.string().max(80).optional().nullable(), empresaId: z.string().max(80).optional().nullable(), empresaNome: z.string().max(160).optional().nullable(),
})

router.post('/alvaras', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const d = parseBody(alvaraSchema, req.body)
  let empresaId = d.empresaId, empresaNome = d.empresaNome
  if (d.aberturaId) { const ab = await carregar(tenantId, d.aberturaId); empresaId = empresaId ?? ab.empresaId; empresaNome = empresaNome ?? ab.nomeEmpresarial }
  if (!d.aberturaId && !empresaId) throw httpError(400, 'Informe a abertura ou a empresa (empresaId) do alvará.')
  const a = await prisma.ctbSocAlvara.create({ data: { tenantId, ...d, empresaId, empresaNome, emissao: d.emissao ? meioDia(d.emissao) : null, validade: d.validade ? meioDia(d.validade) : null, checklist: d.checklist as any, criadoPorId: uid(req) } })
  await auditar(req, MOD, 'ALVARA_CRIADO', { tipo: 'CtbSocAlvara', id: a.id }, { tipo: d.tipo })
  res.status(201).json({ ...a, ...situacaoAlvara(a) })
}))
router.put('/alvaras/:id', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const cur = await prisma.ctbSocAlvara.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!cur) throw httpError(404, 'Alvará não encontrado.')
  const d = parseBody(alvaraSchema.partial(), req.body)
  const data: any = { ...d }
  if (d.emissao !== undefined) data.emissao = d.emissao ? meioDia(d.emissao) : null
  if (d.validade !== undefined) data.validade = d.validade ? meioDia(d.validade) : null
  const a = await prisma.ctbSocAlvara.update({ where: { id: cur.id }, data })
  await auditar(req, MOD, 'ALVARA_ATUALIZADO', { tipo: 'CtbSocAlvara', id: a.id })
  res.json({ ...a, ...situacaoAlvara(a) })
}))
router.delete('/alvaras/:id', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const r = await prisma.ctbSocAlvara.deleteMany({ where: { id: String(req.params.id), tenantId: tid(req) } })
  if (!r.count) throw httpError(404, 'Alvará não encontrado.')
  res.json({ ok: true })
}))
router.post('/aberturas/:id/alvaras/gerar-checklist', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const ab = await carregar(tenantId, String(req.params.id))
  const cn = [ab.cnaePrincipal, ...(((ab.cnaesSecundarios as string[]) || []))].filter(Boolean).map((c) => cnaeDe(c as string)).filter(Boolean) as any[]
  const tpl = alvarasDaAtividade(cn, ab.municipio, ab.tipo)
  const criados: any[] = []
  for (const t of tpl) {
    const ja = await prisma.ctbSocAlvara.findFirst({ where: { tenantId, aberturaId: ab.id, tipo: t.tipo } })
    if (ja) continue
    criados.push(await prisma.ctbSocAlvara.create({ data: { tenantId, aberturaId: ab.id, empresaId: ab.empresaId, empresaNome: ab.nomeEmpresarial, tipo: t.tipo, descricao: t.descricao, municipio: ab.municipio, uf: ab.uf, checklist: t.checklist.map((item) => ({ item, ok: false })) as any, criadoPorId: uid(req) } }))
  }
  await avancaEtapa(tenantId, ab.id, ab.etapa, 'ALVARAS')
  await auditar(req, MOD, 'ALVARAS_CHECKLIST_GERADO', { tipo: 'CtbSocAbertura', id: ab.id }, { criados: criados.length })
  res.status(201).json({ criados: criados.length, itens: criados, aviso: 'Exigências variam por município e por vistoria; o checklist é um ponto de partida (confirme na prefeitura/órgão).' })
}))

// ---------------- tarefas da linha do tempo ----------------
router.post('/aberturas/:id/tarefas', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const ab = await carregar(tenantId, String(req.params.id))
  const d = parseBody(z.object({ etapa: z.enum(ETAPAS), titulo: z.string().min(3).max(200), responsavelId: z.string().max(80).optional().nullable(), responsavelNome: z.string().max(120).optional().nullable(), prazo: z.string().optional().nullable() }), req.body)
  const ult = await prisma.ctbSocTarefa.aggregate({ where: { tenantId, aberturaId: ab.id }, _max: { ordem: true } })
  const t = await prisma.ctbSocTarefa.create({ data: { tenantId, aberturaId: ab.id, etapa: d.etapa, titulo: d.titulo, responsavelId: d.responsavelId, responsavelNome: d.responsavelNome, prazo: d.prazo ? meioDia(d.prazo) : null, ordem: (ult._max.ordem ?? 0) + 1 } })
  res.status(201).json(t)
}))
router.put('/tarefas/:tid', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const cur = await prisma.ctbSocTarefa.findFirst({ where: { id: String(req.params.tid), tenantId } })
  if (!cur) throw httpError(404, 'Tarefa não encontrada.')
  const d = parseBody(z.object({ titulo: z.string().min(3).max(200).optional(), status: z.enum(['PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDA', 'BLOQUEADA']).optional(), responsavelId: z.string().max(80).optional().nullable(), responsavelNome: z.string().max(120).optional().nullable(), prazo: z.string().optional().nullable() }), req.body)
  const data: any = { ...d }
  if (d.prazo !== undefined) data.prazo = d.prazo ? meioDia(d.prazo) : null
  if (d.status) data.concluidaEm = d.status === 'CONCLUIDA' ? new Date() : null
  const t = await prisma.ctbSocTarefa.update({ where: { id: cur.id }, data })
  await auditar(req, MOD, 'TAREFA_ATUALIZADA', { tipo: 'CtbSocTarefa', id: t.id }, { status: t.status })
  res.json(t)
}))

export default router
export { iso10 }
