import { Response, Router } from 'express'
import { z } from 'zod'
import { AuthenticatedRequest, asyncHandler, auditar, httpError, nomeEmpresa, pageParams, papelDe, parseBody, porMetodo, prisma, qs, requireAuth, tid, uid } from '../host2'
import { CHAVES, listarVersoes, tabelasFolha, versaoVigente } from '../parametros'
import { AVISO_SIMULACAO, FAIXA_AVISO, dataBr, diffDias, mascaraCpf, meioDia, protocoloSim, r2, somaDias, validarCpf } from '../util'
import { AVISO_ESTIMATIVA, ROTULO_RESCISAO, TIPOS_RESCISAO, calcDecimoTerceiro, calcFerias, calcFolhaMensal, calcRescisao, periodosAquisitivos, situacaoFerias, textoHolerite, textoRescisao, type FuncCalc } from './calculos'

// RH / Departamento Pessoal (visão contábil): recrutamento, admissão, folha, 13º, férias, afastamentos, rescisão. Tudo ESTIMATIVA a conferir.
// Montado em /api/edu/contabil/rh-dp. eSocial é SIMULADO (protocolos fictícios).
const router = Router()
router.use(requireAuth)
router.use(porMetodo)
const MOD = 'rh-dp'

const CHECKLIST_ADMISSAO = ['Documento de identidade e CPF', 'CTPS digital / PIS', 'Comprovante de residência', 'Certidões de dependentes (se houver)', 'Exame admissional (ASO)', 'Contrato de trabalho assinado', 'Dados bancários / PIX', 'Declaração de opção pelo vale-transporte']
const ETAPAS_CAND = ['TRIAGEM', 'ENTREVISTA', 'TESTE', 'PROPOSTA', 'APROVADO', 'REPROVADO', 'DESISTIU'] as const
const ehSuperPapel = (p: string) => ['ADMIN', 'OWNER', 'RECTOR', 'BOARD'].includes(p)
const cpfVisivel = (req: AuthenticatedRequest) => papelDe(req) !== 'COORDINATOR'
const refFim = (competencia: string) => { const [a, m] = competencia.split('-').map(Number); return new Date(Date.UTC(a, m, 0, 12)) }
const compSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'competência deve ser AAAA-MM')
const dataSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'data deve ser AAAA-MM-DD')

const funcCalc = (f: any): FuncCalc => ({ salarioBase: f.salarioBase, dependentes: f.dependentes, optanteVt: f.optanteVt, vtMensal: f.vtMensal, jornadaMensal: f.jornadaMensal, pensaoAlimenticia: f.pensaoAlimenticia, admissao: f.admissao, demissao: f.demissao })
const outFunc = (f: any, ver: boolean) => ({ ...f, cpf: ver ? f.cpf : mascaraCpf(f.cpf) })

async function funcionario(tenantId: string, id: string) {
  const f = await prisma.ctbDpFuncionario.findFirst({ where: { id, tenantId } })
  if (!f) throw httpError(404, 'Funcionário não encontrado.')
  return f
}

async function esocial(tenantId: string, evento: string, f: { id: string; empresaId: string; nome: string }, payload: Record<string, unknown> = {}) {
  return prisma.ctbDpEsocial.create({ data: { tenantId, funcionarioId: f.id, empresaId: f.empresaId, evento, protocolo: protocoloSim('ESOC', f.id + evento), status: 'ENVIADO_SIMULADO', simulado: true, payload: { evento, funcionarioId: f.id, ...payload, aviso: 'SIMULAÇÃO — não enviado ao eSocial' } as any } })
}

// ---------------- meta / parâmetros ----------------
router.get('/meta', asyncHandler(async (_req, res) => {
  res.json({ faixa: FAIXA_AVISO, simulacao: AVISO_SIMULACAO, estimativa: AVISO_ESTIMATIVA, tiposRescisao: TIPOS_RESCISAO.map((t) => ({ tipo: t, nome: ROTULO_RESCISAO[t] })), etapasCandidato: ETAPAS_CAND, checklistAdmissao: CHECKLIST_ADMISSAO, chavesParametro: CHAVES })
}))
router.get('/parametros', asyncHandler(async (req: AuthenticatedRequest, res) => res.json(await listarVersoes(tid(req)))))
router.post('/parametros', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const d = parseBody(z.object({ chave: z.enum(CHAVES), vigenciaInicio: dataSchema, fonte: z.string().max(200).optional(), dados: z.record(z.any()) }), req.body)
  const dados = d.dados as any
  if (d.chave === 'INSS' && !(Array.isArray(dados.faixas) && dados.faixas.length && typeof dados.teto === 'number')) throw httpError(400, 'INSS exige { faixas: [{ate, aliquota}], teto }.')
  if ((d.chave === 'IRRF' || d.chave === 'IRPF_ANUAL') && !(Array.isArray(dados.faixas) && dados.faixas.length)) throw httpError(400, `${d.chave} exige { faixas: [{ate, aliquota, deducao}], ... }.`)
  if (d.chave === 'SALARIO_MINIMO' && !(typeof dados.valor === 'number' && dados.valor > 0)) throw httpError(400, 'SALARIO_MINIMO exige { valor }.')
  const vig = meioDia(d.vigenciaInicio)
  const p = await prisma.ctbParam.upsert({ where: { tenantId_chave_vigenciaInicio: { tenantId, chave: d.chave, vigenciaInicio: vig } }, create: { tenantId, chave: d.chave, vigenciaInicio: vig, dados: dados as any, fonte: d.fonte, criadoPorId: uid(req) }, update: { dados: dados as any, fonte: d.fonte, ativo: true } })
  await auditar(req, MOD, 'PARAMETRO_SALVO', { tipo: 'CtbParam', id: p.id }, { chave: d.chave, vigencia: d.vigenciaInicio })
  res.status(201).json(p)
}))

// ---------------- painel ----------------
router.get('/painel', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const empresaId = qs(req.query.empresaId)
  const ew = empresaId ? { empresaId } : {}
  const [vagasAbertas, candidatosAtivos, porStatus, folhasAbertas, rescisoesRascunho, feriasAlerta] = await Promise.all([
    prisma.ctbDpVaga.count({ where: { tenantId, ...ew, status: { in: ['ABERTA', 'EM_SELECAO'] } } }),
    prisma.ctbDpCandidato.count({ where: { tenantId, etapa: { in: ['TRIAGEM', 'ENTREVISTA', 'TESTE', 'PROPOSTA'] } } }),
    prisma.ctbDpFuncionario.groupBy({ by: ['status'], where: { tenantId, ...ew }, _count: true }),
    prisma.ctbDpFolha.count({ where: { tenantId, ...ew, status: 'RASCUNHO' } }),
    prisma.ctbDpRescisao.count({ where: { tenantId, status: 'RASCUNHO' } }),
    prisma.ctbDpFerias.count({ where: { tenantId, status: { in: ['A_PROGRAMAR', 'PROGRAMADA'] }, concessivoFim: { lte: somaDias(new Date(), 90) } } }),
  ])
  res.json({ vagasAbertas, candidatosAtivos, funcionarios: Object.fromEntries(porStatus.map((s) => [s.status, s._count])), folhasEmRascunho: folhasAbertas, rescisoesEmRascunho: rescisoesRascunho, feriasAVencer: feriasAlerta, faixa: FAIXA_AVISO, estimativa: AVISO_ESTIMATIVA })
}))

// ---------------- vagas e candidatos ----------------
const vagaSchema = z.object({ empresaId: z.string().min(1).max(80), empresaNome: z.string().max(160).optional().nullable(), titulo: z.string().min(3).max(160), cargo: z.string().max(120).optional().nullable(), salario: z.number().min(0).max(1e7).optional().nullable(), quantidade: z.number().int().min(1).max(500).default(1), descricao: z.string().max(4000).optional().nullable(), requisitos: z.string().max(4000).optional().nullable(), status: z.enum(['ABERTA', 'EM_SELECAO', 'PREENCHIDA', 'CANCELADA']).default('ABERTA') })
router.get('/vagas', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const { page, pageSize, skip, take } = pageParams(req.query)
  const where: any = { tenantId, ...(qs(req.query.empresaId) ? { empresaId: qs(req.query.empresaId) } : {}), ...(qs(req.query.status) ? { status: qs(req.query.status) } : {}) }
  const [total, rows] = await Promise.all([prisma.ctbDpVaga.count({ where }), prisma.ctbDpVaga.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take })])
  const cands = rows.length ? await prisma.ctbDpCandidato.groupBy({ by: ['vagaId', 'etapa'], where: { tenantId, vagaId: { in: rows.map((r) => r.id) } }, _count: true }) : []
  res.json({ total, page, pageSize, items: rows.map((v) => ({ ...v, funil: Object.fromEntries(ETAPAS_CAND.map((e) => [e, cands.filter((c) => c.vagaId === v.id && c.etapa === e).reduce((s, c) => s + c._count, 0)])) })) })
}))
router.post('/vagas', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const d = parseBody(vagaSchema, req.body)
  const v = await prisma.ctbDpVaga.create({ data: { tenantId, ...d, empresaNome: await nomeEmpresa(tenantId, d.empresaId, d.empresaNome), criadoPorId: uid(req) } })
  await auditar(req, MOD, 'VAGA_CRIADA', { tipo: 'CtbDpVaga', id: v.id })
  res.status(201).json(v)
}))
router.put('/vagas/:id', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const cur = await prisma.ctbDpVaga.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!cur) throw httpError(404, 'Vaga não encontrada.')
  const d = parseBody(vagaSchema.partial(), req.body)
  res.json(await prisma.ctbDpVaga.update({ where: { id: cur.id }, data: d }))
}))
router.get('/vagas/:id/candidatos', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const v = await prisma.ctbDpVaga.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!v) throw httpError(404, 'Vaga não encontrada.')
  const items = await prisma.ctbDpCandidato.findMany({ where: { tenantId, vagaId: v.id }, orderBy: { createdAt: 'asc' } })
  res.json({ vaga: v, items, funil: ETAPAS_CAND.map((e) => ({ etapa: e, total: items.filter((c) => c.etapa === e).length })) })
}))
router.post('/vagas/:id/candidatos', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const v = await prisma.ctbDpVaga.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!v) throw httpError(404, 'Vaga não encontrada.')
  const d = parseBody(z.object({ nome: z.string().min(2).max(120), email: z.string().email().max(160).optional().nullable(), telefone: z.string().max(30).optional().nullable(), observacao: z.string().max(1000).optional().nullable(), nota: z.number().min(0).max(10).optional().nullable() }), req.body)
  const c = await prisma.ctbDpCandidato.create({ data: { tenantId, vagaId: v.id, ...d } })
  await auditar(req, MOD, 'CANDIDATO_ADICIONADO', { tipo: 'CtbDpCandidato', id: c.id })
  res.status(201).json(c)
}))
router.put('/candidatos/:id', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const cur = await prisma.ctbDpCandidato.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!cur) throw httpError(404, 'Candidato não encontrado.')
  const d = parseBody(z.object({ etapa: z.enum(ETAPAS_CAND).optional(), nota: z.number().min(0).max(10).optional().nullable(), observacao: z.string().max(1000).optional().nullable() }), req.body)
  const c = await prisma.ctbDpCandidato.update({ where: { id: cur.id }, data: d })
  if (d.etapa) await auditar(req, MOD, 'CANDIDATO_MOVIDO', { tipo: 'CtbDpCandidato', id: c.id }, { etapa: d.etapa })
  res.json(c)
}))

const funcSchema = z.object({
  empresaId: z.string().min(1).max(80), empresaNome: z.string().max(160).optional().nullable(), nome: z.string().min(3).max(140), cpf: z.string().max(20).optional().nullable().refine((v) => !v || validarCpf(v), 'CPF inválido'),
  cargo: z.string().max(120).optional().nullable(), salarioBase: z.number().min(0.01).max(1e7), admissao: dataSchema, dependentes: z.number().int().min(0).max(20).default(0),
  optanteVt: z.boolean().default(false), vtMensal: z.number().min(0).max(100000).default(0), jornadaMensal: z.number().int().min(20).max(260).default(220), pensaoAlimenticia: z.number().min(0).max(1e6).default(0),
  contrato: z.object({ tipo: z.enum(['INDETERMINADO', 'EXPERIENCIA', 'DETERMINADO']).default('INDETERMINADO'), experienciaDias: z.number().int().min(1).max(90).optional(), funcao: z.string().max(120).optional(), local: z.string().max(160).optional() }).optional(),
})
async function criarFuncionario(req: AuthenticatedRequest, d: z.infer<typeof funcSchema>, candidatoId?: string) {
  const tenantId = tid(req)
  const f = await prisma.ctbDpFuncionario.create({ data: { tenantId, ...d, cpf: d.cpf ? d.cpf.replace(/\D+/g, '') : null, empresaNome: await nomeEmpresa(tenantId, d.empresaId, d.empresaNome), admissao: meioDia(d.admissao), status: 'ADMISSAO', checklistAdmissao: CHECKLIST_ADMISSAO.map((item) => ({ item, ok: false })) as any, contrato: d.contrato as any, candidatoId, criadoPorId: uid(req) } })
  await auditar(req, MOD, 'ADMISSAO_INICIADA', { tipo: 'CtbDpFuncionario', id: f.id })
  return f
}
router.post('/candidatos/:id/admitir', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const c = await prisma.ctbDpCandidato.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!c) throw httpError(404, 'Candidato não encontrado.')
  if (!['PROPOSTA', 'APROVADO'].includes(c.etapa)) throw httpError(409, 'Só é possível admitir candidato em PROPOSTA ou APROVADO.')
  if (c.funcionarioId) throw httpError(409, 'Candidato já admitido.')
  const v = await prisma.ctbDpVaga.findFirst({ where: { id: c.vagaId, tenantId } })
  const d = parseBody(funcSchema.partial({ empresaId: true, nome: true }), req.body)
  const f = await criarFuncionario(req, { ...d, empresaId: d.empresaId || v!.empresaId, nome: d.nome || c.nome, cargo: d.cargo ?? v?.cargo ?? v?.titulo, salarioBase: d.salarioBase ?? 0 } as any, c.id)
  await prisma.ctbDpCandidato.update({ where: { id: c.id }, data: { etapa: 'APROVADO', funcionarioId: f.id } })
  res.status(201).json(outFunc(f, cpfVisivel(req)))
}))

// ---------------- funcionários / admissão ----------------
router.get('/funcionarios', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const { page, pageSize, skip, take } = pageParams(req.query)
  const q = qs(req.query.q)
  const where: any = { tenantId, ...(qs(req.query.empresaId) ? { empresaId: qs(req.query.empresaId) } : {}), ...(qs(req.query.status) ? { status: qs(req.query.status) } : {}), ...(q ? { nome: { contains: q, mode: 'insensitive' } } : {}) }
  const [total, rows] = await Promise.all([prisma.ctbDpFuncionario.count({ where }), prisma.ctbDpFuncionario.findMany({ where, orderBy: { nome: 'asc' }, skip, take })])
  res.json({ total, page, pageSize, items: rows.map((f) => outFunc(f, false)) })
}))
router.post('/funcionarios', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const d = parseBody(funcSchema, req.body)
  res.status(201).json(outFunc(await criarFuncionario(req, d), cpfVisivel(req)))
}))
router.get('/funcionarios/:id', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const f = await funcionario(tenantId, String(req.params.id))
  const [ferias, afast, esoc, resc] = await Promise.all([
    prisma.ctbDpFerias.findMany({ where: { tenantId, funcionarioId: f.id }, orderBy: { aquisitivoInicio: 'asc' } }),
    prisma.ctbDpAfastamento.findMany({ where: { tenantId, funcionarioId: f.id }, orderBy: { inicio: 'desc' } }),
    prisma.ctbDpEsocial.findMany({ where: { tenantId, funcionarioId: f.id }, orderBy: { createdAt: 'desc' } }),
    prisma.ctbDpRescisao.findMany({ where: { tenantId, funcionarioId: f.id }, orderBy: { createdAt: 'desc' }, select: { id: true, tipo: true, status: true, total: true, dataDesligamento: true } }),
  ])
  res.json({ ...outFunc(f, cpfVisivel(req)), ferias, afastamentos: afast, esocial: esoc, rescisoes: resc, simulacao: AVISO_SIMULACAO })
}))
router.put('/funcionarios/:id', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const cur = await funcionario(tenantId, String(req.params.id))
  const d = parseBody(funcSchema.partial(), req.body)
  const data: any = { ...d }
  if (d.admissao) data.admissao = meioDia(d.admissao)
  if (d.cpf !== undefined) data.cpf = d.cpf ? d.cpf.replace(/\D+/g, '') : null
  const f = await prisma.ctbDpFuncionario.update({ where: { id: cur.id }, data })
  await auditar(req, MOD, 'FUNCIONARIO_ATUALIZADO', { tipo: 'CtbDpFuncionario', id: f.id }, { campos: Object.keys(d) })
  res.json(outFunc(f, cpfVisivel(req)))
}))
router.put('/funcionarios/:id/checklist', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const cur = await funcionario(tenantId, String(req.params.id))
  const d = parseBody(z.object({ checklist: z.array(z.object({ item: z.string().max(200), ok: z.boolean() })).max(40), exameAdmissionalEm: dataSchema.optional().nullable() }), req.body)
  const f = await prisma.ctbDpFuncionario.update({ where: { id: cur.id }, data: { checklistAdmissao: d.checklist as any, ...(d.exameAdmissionalEm !== undefined ? { exameAdmissionalEm: d.exameAdmissionalEm ? meioDia(d.exameAdmissionalEm) : null } : {}) } })
  res.json(outFunc(f, cpfVisivel(req)))
}))
router.post('/funcionarios/:id/concluir-admissao', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const f = await funcionario(tenantId, String(req.params.id))
  if (f.status !== 'ADMISSAO') throw httpError(409, 'O funcionário não está em fase de admissão.')
  const pend = ((f.checklistAdmissao as any[]) || []).filter((c) => !c.ok)
  if (pend.length) throw httpError(409, `Checklist de admissão incompleto (${pend.length} pendência(s)).`, { pendencias: pend.map((p) => p.item) })
  if (!f.exameAdmissionalEm) throw httpError(409, 'Registre a data do exame admissional (ASO) antes de concluir.')
  const ev = await esocial(tenantId, 'S-2200', f, { admissao: f.admissao.toISOString().slice(0, 10), cargo: f.cargo })
  const nv = await prisma.ctbDpFuncionario.update({ where: { id: f.id }, data: { status: 'ATIVO' } })
  // períodos aquisitivos de férias
  const per = periodosAquisitivos(f.admissao, somaDias(new Date(), 400))
  for (const p of per.slice(0, 3)) {
    const ja = await prisma.ctbDpFerias.findFirst({ where: { tenantId, funcionarioId: f.id, aquisitivoInicio: p.inicio } })
    if (!ja) await prisma.ctbDpFerias.create({ data: { tenantId, funcionarioId: f.id, funcionarioNome: f.nome, aquisitivoInicio: p.inicio, aquisitivoFim: p.fim, concessivoFim: p.concessivoFim } })
  }
  await auditar(req, MOD, 'ADMISSAO_CONCLUIDA', { tipo: 'CtbDpFuncionario', id: f.id })
  res.json({ funcionario: outFunc(nv, cpfVisivel(req)), esocial: ev, simulacao: AVISO_SIMULACAO })
}))

router.get('/esocial', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { page, pageSize, skip, take } = pageParams(req.query)
  const where: any = { tenantId: tid(req), ...(qs(req.query.funcionarioId) ? { funcionarioId: qs(req.query.funcionarioId) } : {}) }
  const [total, items] = await Promise.all([prisma.ctbDpEsocial.count({ where }), prisma.ctbDpEsocial.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take })])
  res.json({ total, page, pageSize, items, simulacao: AVISO_SIMULACAO })
}))

// ---------------- folha ----------------
const entradasSchema = z.object({ faltas: z.number().min(0).max(31).optional(), horasExtras50: z.number().min(0).max(300).optional(), horasExtras100: z.number().min(0).max(300).optional(), outrosProventos: z.number().min(0).max(1e7).optional(), outrosDescontos: z.number().min(0).max(1e7).optional(), adicionalNoturno: z.number().min(0).max(1e7).optional() })

async function calcularItem(tenantId: string, folha: { tipo: string; competencia: string }, f: any, entradas: any, t: Awaited<ReturnType<typeof tabelasFolha>>) {
  if (folha.tipo === 'MENSAL') {
    const c = calcFolhaMensal(funcCalc(f), entradas || {}, t, folha.competencia)
    return { calculo: c as any, bruto: c.bruto, inss: c.inss, irrf: c.irrf, fgts: c.fgts, liquido: c.liquido }
  }
  const ano = Number(folha.competencia.slice(0, 4))
  const c = calcDecimoTerceiro(funcCalc(f), t, ano, folha.tipo === 'DECIMO_1' ? 1 : 2, entradas?.mediaVariaveis || 0)
  return { calculo: c as any, bruto: c.parcela === 1 ? c.valor : c.bruto13, inss: c.inss, irrf: c.irrf, fgts: c.fgts, liquido: c.liquido }
}
const totaisDe = (itens: Array<{ bruto: number; inss: number; irrf: number; fgts: number; liquido: number }>) => ({ funcionarios: itens.length, bruto: r2(itens.reduce((s, i) => s + i.bruto, 0)), inss: r2(itens.reduce((s, i) => s + i.inss, 0)), irrf: r2(itens.reduce((s, i) => s + i.irrf, 0)), fgts: r2(itens.reduce((s, i) => s + i.fgts, 0)), liquido: r2(itens.reduce((s, i) => s + i.liquido, 0)) })

router.get('/folhas', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { page, pageSize, skip, take } = pageParams(req.query)
  const where: any = { tenantId: tid(req), ...(qs(req.query.empresaId) ? { empresaId: qs(req.query.empresaId) } : {}), ...(qs(req.query.competencia) ? { competencia: qs(req.query.competencia) } : {}), ...(qs(req.query.status) ? { status: qs(req.query.status) } : {}) }
  const [total, items] = await Promise.all([prisma.ctbDpFolha.count({ where }), prisma.ctbDpFolha.findMany({ where, orderBy: [{ competencia: 'desc' }, { createdAt: 'desc' }], skip, take })])
  res.json({ total, page, pageSize, items })
}))
router.post('/folhas', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const d = parseBody(z.object({ empresaId: z.string().min(1).max(80), empresaNome: z.string().max(160).optional().nullable(), competencia: compSchema, tipo: z.enum(['MENSAL', 'DECIMO_1', 'DECIMO_2']).default('MENSAL'), entradas: z.record(entradasSchema.passthrough()).optional() }), req.body)
  if (d.tipo === 'DECIMO_1' && d.competencia.slice(5) !== '11') throw httpError(400, 'A 1ª parcela do 13º usa a competência de novembro (AAAA-11).')
  if (d.tipo === 'DECIMO_2' && d.competencia.slice(5) !== '12') throw httpError(400, 'A 2ª parcela do 13º usa a competência de dezembro (AAAA-12).')
  const ja = await prisma.ctbDpFolha.findFirst({ where: { tenantId, empresaId: d.empresaId, competencia: d.competencia, tipo: d.tipo } })
  if (ja) throw httpError(409, 'Já existe folha desta empresa para a competência/tipo informados.', { folhaId: ja.id })
  const fim = refFim(d.competencia)
  const funcs = await prisma.ctbDpFuncionario.findMany({ where: { tenantId, empresaId: d.empresaId, status: { in: ['ATIVO', 'AFASTADO', 'FERIAS', 'DESLIGADO'] }, admissao: { lte: fim } } })
  const elegiveis = funcs.filter((f) => !f.demissao || f.demissao >= new Date(Date.UTC(fim.getUTCFullYear(), fim.getUTCMonth(), 1, 12)))
  if (!elegiveis.length) throw httpError(409, 'Não há funcionários ativos para esta empresa/competência.')
  const t = await tabelasFolha(tenantId, fim)
  const folha = await prisma.ctbDpFolha.create({ data: { tenantId, empresaId: d.empresaId, empresaNome: await nomeEmpresa(tenantId, d.empresaId, d.empresaNome), competencia: d.competencia, tipo: d.tipo, versaoTabelas: t.versoes as any, criadoPorId: uid(req) } })
  const itens: any[] = []
  for (const f of elegiveis) {
    const ent = d.entradas?.[f.id] || {}
    const r = await calcularItem(tenantId, folha, f, ent, t)
    itens.push(await prisma.ctbDpFolhaItem.create({ data: { tenantId, folhaId: folha.id, funcionarioId: f.id, funcionarioNome: f.nome, entradas: ent as any, ...r } }))
  }
  const upd = await prisma.ctbDpFolha.update({ where: { id: folha.id }, data: { totais: totaisDe(itens) as any } })
  await auditar(req, MOD, 'FOLHA_CALCULADA', { tipo: 'CtbDpFolha', id: folha.id }, { competencia: d.competencia, tipo: d.tipo, funcionarios: itens.length })
  res.status(201).json({ ...upd, estimativa: AVISO_ESTIMATIVA })
}))
router.get('/folhas/:id', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const folha = await prisma.ctbDpFolha.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!folha) throw httpError(404, 'Folha não encontrada.')
  const itens = await prisma.ctbDpFolhaItem.findMany({ where: { tenantId, folhaId: folha.id }, orderBy: { funcionarioNome: 'asc' } })
  res.json({ ...folha, itens, estimativa: AVISO_ESTIMATIVA })
}))
router.put('/folhas/:id/itens/:funcId', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const folha = await prisma.ctbDpFolha.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!folha) throw httpError(404, 'Folha não encontrada.')
  if (folha.status === 'FECHADA') throw httpError(409, 'Folha fechada não pode ser alterada.')
  const item = await prisma.ctbDpFolhaItem.findFirst({ where: { tenantId, folhaId: folha.id, funcionarioId: String(req.params.funcId) } })
  if (!item) throw httpError(404, 'Funcionário não consta nesta folha.')
  const f = await funcionario(tenantId, item.funcionarioId)
  const ent = parseBody(entradasSchema, req.body)
  const t = await tabelasFolha(tenantId, refFim(folha.competencia))
  const r = await calcularItem(tenantId, folha, f, ent, t)
  const nv = await prisma.ctbDpFolhaItem.update({ where: { id: item.id }, data: { entradas: ent as any, ...r } })
  const todos = await prisma.ctbDpFolhaItem.findMany({ where: { tenantId, folhaId: folha.id } })
  await prisma.ctbDpFolha.update({ where: { id: folha.id }, data: { totais: totaisDe(todos) as any } })
  res.json(nv)
}))
router.post('/folhas/:id/fechar', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const folha = await prisma.ctbDpFolha.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!folha) throw httpError(404, 'Folha não encontrada.')
  if (folha.status === 'FECHADA') throw httpError(409, 'Folha já fechada.')
  const nv = await prisma.ctbDpFolha.update({ where: { id: folha.id }, data: { status: 'FECHADA', fechadaEm: new Date() } })
  await auditar(req, MOD, 'FOLHA_FECHADA', { tipo: 'CtbDpFolha', id: folha.id })
  res.json(nv)
}))
router.get('/folhas/:id/itens/:funcId/holerite', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const folha = await prisma.ctbDpFolha.findFirst({ where: { id: String(req.params.id), tenantId } })
  const item = folha ? await prisma.ctbDpFolhaItem.findFirst({ where: { tenantId, folhaId: folha.id, funcionarioId: String(req.params.funcId) } }) : null
  if (!folha || !item) throw httpError(404, 'Holerite não encontrado.')
  const f = await funcionario(tenantId, item.funcionarioId)
  const c: any = item.calculo
  const texto = folha.tipo === 'MENSAL'
    ? textoHolerite({ empresa: folha.empresaNome || folha.empresaId, nome: f.nome, cargo: f.cargo, competencia: folha.competencia, tipo: folha.tipo }, c)
    : `RECIBO DE 13º SALÁRIO — ESTIMATIVA\nEmpresa: ${folha.empresaNome || folha.empresaId}\nFuncionário: ${f.nome}\nCompetência: ${folha.competencia} (${folha.tipo})\nMeses considerados: ${c.meses}/12\nValor bruto: ${c.parcela === 1 ? c.valor : c.bruto13}\nINSS: ${c.inss}   IRRF: ${c.irrf}\nLÍQUIDO: ${c.liquido}\n\n${AVISO_ESTIMATIVA}\nEste documento não substitui um contador; valide antes de pagar ou enviar.`
  res.json({ texto, calculo: c, estimativa: AVISO_ESTIMATIVA })
}))

// ---------------- calculadoras avulsas (não gravam) ----------------
const funcAvulso = z.object({ salarioBase: z.number().min(0.01).max(1e7), dependentes: z.number().int().min(0).max(20).default(0), optanteVt: z.boolean().default(false), vtMensal: z.number().min(0).default(0), jornadaMensal: z.number().int().min(20).max(260).default(220), pensaoAlimenticia: z.number().min(0).default(0), admissao: dataSchema, demissao: dataSchema.optional().nullable() })
const toFunc = (d: z.infer<typeof funcAvulso>): FuncCalc => ({ ...d, admissao: meioDia(d.admissao), demissao: d.demissao ? meioDia(d.demissao) : null })
router.post('/calculos/folha', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const d = parseBody(z.object({ funcionario: funcAvulso, competencia: compSchema, entradas: entradasSchema.optional() }), req.body)
  const t = await tabelasFolha(tid(req), refFim(d.competencia))
  res.json({ ...calcFolhaMensal(toFunc(d.funcionario), d.entradas || {}, t, d.competencia), tabelas: t.versoes })
}))
router.post('/calculos/decimo', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const d = parseBody(z.object({ funcionario: funcAvulso, ano: z.number().int().min(2000).max(2100), parcela: z.union([z.literal(1), z.literal(2)]), mediaVariaveis: z.number().min(0).default(0) }), req.body)
  const t = await tabelasFolha(tid(req), new Date(Date.UTC(d.ano, 11, 20, 12)))
  res.json({ ...calcDecimoTerceiro(toFunc(d.funcionario), t, d.ano, d.parcela, d.mediaVariaveis), tabelas: t.versoes })
}))
router.post('/calculos/ferias', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const d = parseBody(z.object({ funcionario: funcAvulso, dias: z.number().int().min(5).max(30), abono: z.boolean().default(false), mediaVariaveis: z.number().min(0).default(0), referencia: dataSchema.optional() }), req.body)
  const t = await tabelasFolha(tid(req), d.referencia ? meioDia(d.referencia) : new Date())
  res.json({ ...calcFerias(toFunc(d.funcionario), t, d), tabelas: t.versoes })
}))
const rescSchema = z.object({ tipo: z.enum(TIPOS_RESCISAO), dataDesligamento: dataSchema, avisoPrevio: z.enum(['INDENIZADO', 'TRABALHADO', 'DISPENSADO', 'NAO_CUMPRIDO']).default('INDENIZADO'), periodosFeriasVencidos: z.number().int().min(0).max(5).default(0), saldoFgts: z.number().min(0).max(1e8).optional().nullable(), mediaVariaveis: z.number().min(0).default(0), adiantamento13: z.number().min(0).default(0), outrosDescontos: z.number().min(0).default(0) })
router.post('/calculos/rescisao', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const d = parseBody(z.object({ funcionario: funcAvulso }).merge(rescSchema), req.body)
  const t = await tabelasFolha(tid(req), meioDia(d.dataDesligamento))
  res.json({ ...calcRescisao({ f: toFunc(d.funcionario), tipo: d.tipo, desligamento: meioDia(d.dataDesligamento), avisoPrevio: d.avisoPrevio, periodosFeriasVencidos: d.periodosFeriasVencidos, saldoFgts: d.saldoFgts ?? undefined, mediaVariaveis: d.mediaVariaveis, adiantamento13: d.adiantamento13, outrosDescontos: d.outrosDescontos }, t), tabelas: t.versoes })
}))

// ---------------- férias ----------------
router.get('/ferias', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const { page, pageSize, skip, take } = pageParams(req.query)
  const where: any = { tenantId, ...(qs(req.query.funcionarioId) ? { funcionarioId: qs(req.query.funcionarioId) } : {}), ...(qs(req.query.status) ? { status: qs(req.query.status) } : {}) }
  const [total, rows] = await Promise.all([prisma.ctbDpFerias.count({ where }), prisma.ctbDpFerias.findMany({ where, orderBy: { concessivoFim: 'asc' }, skip, take })])
  let items = rows.map((r) => ({ ...r, ...(['GOZADA'].includes(r.status) ? { diasParaVencer: null, alerta: false } : situacaoFerias(r.concessivoFim)) }))
  if (qs(req.query.alerta) === 'true') items = items.filter((i: any) => i.alerta)
  res.json({ total, page, pageSize, items })
}))
router.post('/funcionarios/:id/ferias/programar', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const f = await funcionario(tenantId, String(req.params.id))
  const d = parseBody(z.object({ feriasId: z.string().max(80).optional(), gozoInicio: dataSchema, dias: z.number().int().min(5).max(30).default(30), abono: z.boolean().default(false) }), req.body)
  if (f.status === 'DESLIGADO') throw httpError(409, 'Funcionário desligado.')
  const pend = await prisma.ctbDpFerias.findFirst({ where: { tenantId, funcionarioId: f.id, status: { in: ['A_PROGRAMAR', 'VENCIDA'] }, ...(d.feriasId ? { id: d.feriasId } : {}) }, orderBy: { aquisitivoInicio: 'asc' } })
  if (!pend) throw httpError(404, 'Não há período aquisitivo a programar.')
  if (pend.aquisitivoFim >= new Date()) throw httpError(409, 'Período aquisitivo ainda não completou 12 meses.')
  const inicio = meioDia(d.gozoInicio)
  if ([0, 6].includes(inicio.getUTCDay())) throw httpError(400, 'O início das férias não pode ocorrer em sábado/domingo (conferir dias de repouso/feriados).')
  const t = await tabelasFolha(tenantId, inicio)
  const calculo = calcFerias(funcCalc(f), t, { dias: d.dias, abono: d.abono })
  const r = await prisma.ctbDpFerias.update({ where: { id: pend.id }, data: { gozoInicio: inicio, dias: d.dias, abonoPecuniario: d.abono, calculo: calculo as any, status: 'PROGRAMADA' } })
  await auditar(req, MOD, 'FERIAS_PROGRAMADAS', { tipo: 'CtbDpFerias', id: r.id })
  res.json({ ...r, pagamentoAte: dataBr(somaDias(inicio, -2)) })
}))
router.post('/ferias/:id/gozar', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const r = await prisma.ctbDpFerias.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!r) throw httpError(404, 'Férias não encontradas.')
  if (r.status !== 'PROGRAMADA') throw httpError(409, 'Programe as férias antes de registrar o gozo.')
  res.json(await prisma.ctbDpFerias.update({ where: { id: r.id }, data: { status: 'GOZADA' } }))
}))

// ---------------- afastamentos ----------------
router.get('/afastamentos', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { page, pageSize, skip, take } = pageParams(req.query)
  const where: any = { tenantId: tid(req), ...(qs(req.query.funcionarioId) ? { funcionarioId: qs(req.query.funcionarioId) } : {}) }
  const [total, items] = await Promise.all([prisma.ctbDpAfastamento.count({ where }), prisma.ctbDpAfastamento.findMany({ where, orderBy: { inicio: 'desc' }, skip, take })])
  res.json({ total, page, pageSize, items })
}))
router.post('/afastamentos', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const d = parseBody(z.object({ funcionarioId: z.string().min(1).max(80), tipo: z.enum(['DOENCA', 'ACIDENTE', 'MATERNIDADE', 'PATERNIDADE', 'LICENCA_NAO_REMUNERADA', 'OUTRO']), inicio: dataSchema, fim: dataSchema.optional().nullable(), observacao: z.string().max(500).optional().nullable() }), req.body)
  const f = await funcionario(tenantId, d.funcionarioId)
  if (d.fim && d.fim < d.inicio) throw httpError(400, 'A data final não pode ser anterior ao início.')
  const ev = await esocial(tenantId, 'S-2230', f, { tipo: d.tipo, inicio: d.inicio })
  const a = await prisma.ctbDpAfastamento.create({ data: { tenantId, funcionarioId: f.id, funcionarioNome: f.nome, tipo: d.tipo, inicio: meioDia(d.inicio), fim: d.fim ? meioDia(d.fim) : null, observacao: d.observacao, esocialEvento: ev.protocolo } })
  if (!d.fim && f.status === 'ATIVO') await prisma.ctbDpFuncionario.update({ where: { id: f.id }, data: { status: 'AFASTADO' } })
  await auditar(req, MOD, 'AFASTAMENTO_REGISTRADO', { tipo: 'CtbDpAfastamento', id: a.id }, { tipoAfastamento: d.tipo })
  res.status(201).json({ ...a, simulacao: AVISO_SIMULACAO })
}))
router.put('/afastamentos/:id', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const a = await prisma.ctbDpAfastamento.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!a) throw httpError(404, 'Afastamento não encontrado.')
  const d = parseBody(z.object({ fim: dataSchema, observacao: z.string().max(500).optional().nullable() }), req.body)
  if (meioDia(d.fim) < a.inicio) throw httpError(400, 'A data final não pode ser anterior ao início.')
  const nv = await prisma.ctbDpAfastamento.update({ where: { id: a.id }, data: { fim: meioDia(d.fim), observacao: d.observacao ?? a.observacao } })
  await prisma.ctbDpFuncionario.updateMany({ where: { id: a.funcionarioId, tenantId, status: 'AFASTADO' }, data: { status: 'ATIVO' } })
  res.json(nv)
}))

// ---------------- rescisão ----------------
router.get('/rescisoes', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { page, pageSize, skip, take } = pageParams(req.query)
  const where: any = { tenantId: tid(req), ...(qs(req.query.status) ? { status: qs(req.query.status) } : {}), ...(qs(req.query.funcionarioId) ? { funcionarioId: qs(req.query.funcionarioId) } : {}) }
  const [total, items] = await Promise.all([prisma.ctbDpRescisao.count({ where }), prisma.ctbDpRescisao.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take, select: { id: true, funcionarioId: true, funcionarioNome: true, tipo: true, dataDesligamento: true, total: true, status: true, createdAt: true } })])
  res.json({ total, page, pageSize, items })
}))
router.post('/rescisoes', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const d = parseBody(z.object({ funcionarioId: z.string().min(1).max(80) }).merge(rescSchema), req.body)
  const f = await funcionario(tenantId, d.funcionarioId)
  if (f.status === 'DESLIGADO') throw httpError(409, 'Funcionário já desligado.')
  if (f.status === 'ADMISSAO') throw httpError(409, 'Conclua a admissão antes de registrar a rescisão.')
  const deslig = meioDia(d.dataDesligamento)
  if (deslig < f.admissao) throw httpError(400, 'A data de desligamento não pode ser anterior à admissão.')
  const aberta = await prisma.ctbDpRescisao.findFirst({ where: { tenantId, funcionarioId: f.id, status: 'RASCUNHO' } })
  if (aberta) throw httpError(409, 'Já existe rescisão em rascunho para este funcionário.', { rescisaoId: aberta.id })
  // férias vencidas: períodos aquisitivos completos sem gozo (quando não informado)
  let vencidos = d.periodosFeriasVencidos
  if (!(req.body && 'periodosFeriasVencidos' in req.body)) vencidos = await prisma.ctbDpFerias.count({ where: { tenantId, funcionarioId: f.id, status: { in: ['A_PROGRAMAR', 'VENCIDA', 'PROGRAMADA'] }, aquisitivoFim: { lt: deslig } } })
  const t = await tabelasFolha(tenantId, deslig)
  const calculo = calcRescisao({ f: funcCalc(f), tipo: d.tipo, desligamento: deslig, avisoPrevio: d.avisoPrevio, periodosFeriasVencidos: vencidos, saldoFgts: d.saldoFgts ?? undefined, mediaVariaveis: d.mediaVariaveis, adiantamento13: d.adiantamento13, outrosDescontos: d.outrosDescontos }, t)
  const r = await prisma.ctbDpRescisao.create({ data: { tenantId, funcionarioId: f.id, funcionarioNome: f.nome, empresaId: f.empresaId, tipo: d.tipo, dataDesligamento: deslig, avisoPrevio: d.avisoPrevio, saldoFgts: d.saldoFgts ?? null, calculo: { ...calculo, tabelas: t.versoes } as any, total: calculo.liquido, criadoPorId: uid(req) } })
  await auditar(req, MOD, 'RESCISAO_CALCULADA', { tipo: 'CtbDpRescisao', id: r.id }, { tipoRescisao: d.tipo })
  res.status(201).json({ ...r, estimativa: AVISO_ESTIMATIVA })
}))
router.get('/rescisoes/:id', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const r = await prisma.ctbDpRescisao.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!r) throw httpError(404, 'Rescisão não encontrada.')
  const f = await funcionario(tenantId, r.funcionarioId)
  res.json({ ...r, termo: textoRescisao({ empresa: f.empresaNome || f.empresaId, nome: f.nome, cargo: f.cargo, admissao: f.admissao }, r.calculo as any), estimativa: AVISO_ESTIMATIVA })
}))
router.post('/rescisoes/:id/homologar', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const r = await prisma.ctbDpRescisao.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!r) throw httpError(404, 'Rescisão não encontrada.')
  if (r.status !== 'RASCUNHO') throw httpError(409, 'Só é possível homologar rescisão em rascunho.')
  const f = await funcionario(tenantId, r.funcionarioId)
  const ev = await esocial(tenantId, 'S-2299', f, { tipo: r.tipo, desligamento: r.dataDesligamento.toISOString().slice(0, 10) })
  const nv = await prisma.ctbDpRescisao.update({ where: { id: r.id }, data: { status: 'HOMOLOGADA', esocialEvento: ev.protocolo } })
  await prisma.ctbDpFuncionario.update({ where: { id: f.id }, data: { status: 'DESLIGADO', demissao: r.dataDesligamento } })
  await auditar(req, MOD, 'RESCISAO_HOMOLOGADA', { tipo: 'CtbDpRescisao', id: r.id })
  res.json({ ...nv, esocial: ev, simulacao: AVISO_SIMULACAO })
}))
router.delete('/rescisoes/:id', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = tid(req)
  const r = await prisma.ctbDpRescisao.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!r) throw httpError(404, 'Rescisão não encontrada.')
  if (r.status !== 'RASCUNHO') throw httpError(409, 'Só é possível cancelar rescisão em rascunho.')
  await prisma.ctbDpRescisao.update({ where: { id: r.id }, data: { status: 'CANCELADA' } })
  res.json({ ok: true })
}))

export default router
export { ehSuperPapel, versaoVigente, diffDias }
