import { Router } from 'express'
import { scheduleReminder } from '../../core/reminders'
import { registerEduJob } from '../../core/jobs'
import { mountCrud } from '../../core/crud'
import { cifrar } from '../../seguranca/cripto'
import {
  AuthenticatedRequest, GESTAO, LEITURA, MOD2, NOT_STUDENT, OPERACAO, Response, addDias, alertaVenc, asyncHandler, audit, dateISO, diasAte, exigirUsuario, fail, getTenantId, getUserId,
  idParam, isGestao, money, nextNum, nomeDe, notify, pageParams, parseBody, prisma, qs, requireRole, usuariosComPapel, z, csv,
} from './common'
import { cnhValidaEm, custoPorKm, periodosSeSobrepoem } from './frotaCalc'

const TIPOS_VEIC = ['CARRO', 'VAN', 'ONIBUS', 'MICROONIBUS', 'UTILITARIO', 'MOTO', 'CAMINHAO'] as const
const COMBUST = ['GASOLINA', 'ETANOL', 'FLEX', 'DIESEL', 'ELETRICO', 'GNV'] as const
const PLACA = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/
const normPlaca = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '')

async function veiculoDoTenant(tenantId: string, id: string) {
  const v = await prisma.inf2Veiculo.findFirst({ where: { id, tenantId } })
  if (!v) fail(400, 'Veículo (veiculoId) não encontrado.')
  return v
}
async function motoristaDoTenant(tenantId: string, id?: string | null) {
  if (!id) return null
  const m = await prisma.inf2Motorista.findFirst({ where: { id, tenantId } })
  if (!m) fail(400, 'Motorista (motoristaId) não encontrado.')
  return m
}
const motoristaView = (m: any) => { const { cnhCifrada, ...r } = m; return { ...r, cnhMascarada: m.cnhFinal ? `********${m.cnhFinal}` : null, cnhAlerta: alertaVenc(m.cnhValidade) } }

export function mountFrota(router: Router) {
  // ------------------------------------------------------------ veículos
  mountCrud(router, {
    model: 'inf2Veiculo', path: '/frota/veiculos', read: LEITURA, write: GESTAO, modulo: MOD2,
    create: z.object({
      placa: z.string().min(7).max(8).transform(normPlaca).refine((p) => PLACA.test(p), 'Placa inválida (use ABC1D23 ou ABC1234).'), apelido: z.string().max(80).optional().nullable(),
      marca: z.string().min(1).max(60), modelo: z.string().min(1).max(80), ano: z.number().int().min(1950).max(2100).optional().nullable(),
      tipo: z.enum(TIPOS_VEIC).default('CARRO'), combustivel: z.enum(COMBUST).default('FLEX'), chassi: z.string().max(30).optional().nullable(), renavam: z.string().max(20).optional().nullable(),
      capacidade: z.number().int().min(1).max(200).optional().nullable(), status: z.enum(['ATIVO', 'EM_MANUTENCAO', 'INDISPONIVEL', 'BAIXADO']).default('ATIVO'),
      odometroKm: z.number().min(0).default(0), responsavelUserId: z.string().optional().nullable(), departamentoNome: z.string().max(120).optional().nullable(),
      bemId: z.string().optional().nullable(), valorAquisicao: z.number().min(0).optional().nullable(), observacoes: z.string().max(2000).optional().nullable(),
    }),
    search: ['placa', 'apelido', 'modelo', 'marca'], filters: ['status', 'tipo', 'responsavelUserId'], orderBy: { placa: 'asc' },
    beforeCreate: async (d, req) => {
      const t = getTenantId(req)
      if (await prisma.inf2Veiculo.findFirst({ where: { tenantId: t, placa: d.placa } })) fail(409, 'Já existe veículo com esta placa.')
      return { ...d, responsavelNome: await exigirUsuario(t, d.responsavelUserId) }
    },
    beforeUpdate: async (d, req, cur) => {
      if (d.placa && d.placa !== cur.placa && await prisma.inf2Veiculo.findFirst({ where: { tenantId: cur.tenantId, placa: d.placa } })) fail(409, 'Já existe veículo com esta placa.')
      if (d.odometroKm !== undefined && d.odometroKm < cur.odometroKm) fail(400, 'O odômetro não pode diminuir.')
      return d.responsavelUserId !== undefined ? { ...d, responsavelNome: await exigirUsuario(cur.tenantId, d.responsavelUserId) } : d
    },
  })

  router.get('/frota/veiculos/:id/custo-km', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const v = await prisma.inf2Veiculo.findFirst({ where: { id: idParam(req), tenantId } })
    if (!v) return res.status(404).json({ error: 'Veículo não encontrado.' })
    const ate = qs(req.query.ate) ? new Date(qs(req.query.ate)!) : new Date()
    const de = qs(req.query.de) ? new Date(qs(req.query.de)!) : addDias(ate, -365)
    res.json({ veiculoId: v.id, placa: v.placa, de, ate, ...(await custoVeiculo(tenantId, v.id, de, ate)) })
  }))

  router.get('/frota/veiculos/:id/ficha', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const v = await prisma.inf2Veiculo.findFirst({ where: { id: idParam(req), tenantId } })
    if (!v) return res.status(404).json({ error: 'Veículo não encontrado.' })
    const [docs, seguros, manut, multas, registros, reservas] = await Promise.all([
      prisma.inf2FrotaDoc.findMany({ where: { tenantId, veiculoId: v.id }, orderBy: { validade: 'asc' } }),
      prisma.inf2Seguro.findMany({ where: { tenantId, veiculoId: v.id }, orderBy: { vigenciaFim: 'desc' } }),
      prisma.inf2FrotaManutencao.findMany({ where: { tenantId, veiculoId: v.id }, orderBy: { data: 'desc' }, take: 20 }),
      prisma.inf2Multa.findMany({ where: { tenantId, veiculoId: v.id }, orderBy: { dataInfracao: 'desc' }, take: 20 }),
      prisma.inf2FrotaRegistro.findMany({ where: { tenantId, veiculoId: v.id }, orderBy: { data: 'desc' }, take: 30 }),
      prisma.inf2Reserva.findMany({ where: { tenantId, veiculoId: v.id }, orderBy: { saidaPrevista: 'desc' }, take: 20 }),
    ])
    const ate = new Date()
    res.json({ veiculo: v, docs: docs.map((d) => ({ ...d, alerta: alertaVenc(d.validade) })), seguros: seguros.map((s) => ({ ...s, alerta: alertaVenc(s.vigenciaFim) })), manutencoes: manut, multas, registros, reservas, custo: await custoVeiculo(tenantId, v.id, addDias(ate, -365), ate) })
  }))

  // ------------------------------------------------------------ motoristas (CNH cifrada; só os 3 últimos dígitos voltam)
  const motSchema = z.object({
    nome: z.string().min(3).max(160), userId: z.string().optional().nullable(), colaboradorId: z.string().optional().nullable(), cnhNumero: z.string().regex(/^\d{9,11}$/, 'CNH deve ter 9 a 11 dígitos.').optional(),
    cnhCategoria: z.enum(['A', 'B', 'C', 'D', 'E', 'AB', 'AC', 'AD', 'AE']).optional().nullable(), cnhValidade: dateISO().optional().nullable(), telefone: z.string().max(30).optional().nullable(),
    ativo: z.boolean().default(true), observacoes: z.string().max(1000).optional().nullable(),
  })
  const prepMot = (d: any) => {
    const { cnhNumero, ...r } = d
    if (cnhNumero) { r.cnhFinal = cnhNumero.slice(-3); try { r.cnhCifrada = cifrar(cnhNumero) } catch { r.cnhCifrada = null } }
    return r
  }
  router.post('/frota/motoristas', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d = parseBody(motSchema, req.body)
    if (d.userId) await exigirUsuario(tenantId, d.userId)
    const m = await prisma.inf2Motorista.create({ data: { ...prepMot(d), tenantId } })
    await audit({ tenantId, userId: getUserId(req), modulo: MOD2, acao: 'MOTORISTA_CRIADO', refType: 'Inf2Motorista', refId: m.id })
    res.status(201).json(motoristaView(m))
  }))
  router.get('/frota/motoristas', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId: getTenantId(req) }
    if (qs(req.query.ativo)) where.ativo = qs(req.query.ativo) === 'true'
    const q = qs(req.query.q); if (q) where.nome = { contains: q, mode: 'insensitive' }
    const [rows, total] = await Promise.all([prisma.inf2Motorista.findMany({ where, orderBy: { nome: 'asc' }, skip, take }), prisma.inf2Motorista.count({ where })])
    res.json({ items: rows.map(motoristaView), total, page, pageSize })
  }))
  router.get('/frota/motoristas/:id', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const m = await prisma.inf2Motorista.findFirst({ where: { id: idParam(req), tenantId: getTenantId(req) } })
    if (!m) return res.status(404).json({ error: 'Motorista não encontrado.' })
    res.json(motoristaView(m))
  }))
  router.patch('/frota/motoristas/:id', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const cur = await prisma.inf2Motorista.findFirst({ where: { id: idParam(req), tenantId } })
    if (!cur) return res.status(404).json({ error: 'Motorista não encontrado.' })
    const m = await prisma.inf2Motorista.update({ where: { id: cur.id }, data: prepMot(parseBody(motSchema.partial(), req.body)) })
    res.json(motoristaView(m))
  }))

  // ------------------------------------------------------------ km e abastecimento
  const regSchema = z.object({
    veiculoId: z.string(), tipo: z.enum(['ABASTECIMENTO', 'QUILOMETRAGEM']), data: dateISO().optional(), km: z.number().min(0), litros: z.number().positive().optional().nullable(),
    valor: z.number().min(0).optional().nullable(), combustivel: z.enum(COMBUST).optional().nullable(), posto: z.string().max(120).optional().nullable(), tanqueCheio: z.boolean().default(true),
    motoristaId: z.string().optional().nullable(), observacoes: z.string().max(500).optional().nullable(),
  })
  router.post('/frota/registros', requireRole(...OPERACAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d = parseBody(regSchema, req.body)
    const v = await veiculoDoTenant(tenantId, d.veiculoId)
    const mot = await motoristaDoTenant(tenantId, d.motoristaId)
    if (d.tipo === 'ABASTECIMENTO' && (!d.litros || d.valor == null)) fail(400, 'Abastecimento exige litros e valor.')
    if (d.km < v.odometroKm) fail(400, `Quilometragem (${d.km}) menor que o odômetro atual do veículo (${v.odometroKm}).`)
    const r = await prisma.inf2FrotaRegistro.create({ data: { ...d, data: d.data ?? new Date(), tenantId, motoristaNome: mot?.nome, registradoPorId: getUserId(req), registradoPorNome: await nomeDe(req) } })
    await prisma.inf2Veiculo.update({ where: { id: v.id }, data: { odometroKm: d.km } })
    res.status(201).json(r)
  }))
  router.get('/frota/registros', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId: getTenantId(req) }
    for (const f of ['veiculoId', 'tipo', 'motoristaId']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    const [rows, total] = await Promise.all([prisma.inf2FrotaRegistro.findMany({ where, orderBy: { data: 'desc' }, skip, take }), prisma.inf2FrotaRegistro.count({ where })])
    res.json({ items: rows, total, page, pageSize })
  }))

  // ------------------------------------------------------------ multas
  const multaSchema = z.object({
    veiculoId: z.string(), motoristaId: z.string().optional().nullable(), autoInfracao: z.string().max(40).optional().nullable(), dataInfracao: dateISO(), descricao: z.string().min(3).max(500),
    local: z.string().max(200).optional().nullable(), pontos: z.number().int().min(0).max(21).default(0), valor: z.number().positive(), vencimento: dateISO().optional().nullable(),
    observacoes: z.string().max(1000).optional().nullable(),
  })
  mountCrud(router, {
    model: 'inf2Multa', path: '/frota/multas', read: LEITURA, write: GESTAO, modulo: MOD2, create: multaSchema, update: multaSchema.partial(),
    filters: ['veiculoId', 'status', 'motoristaId', 'tratamento', 'responsavelUserId'], search: ['descricao', 'autoInfracao', 'motoristaNome', 'responsavelNome'], orderBy: { dataInfracao: 'desc' },
    beforeCreate: async (d, req) => {
      const t = getTenantId(req)
      await veiculoDoTenant(t, d.veiculoId)
      const m = await motoristaDoTenant(t, d.motoristaId)
      // por padrão responde pela multa o motorista condutor
      return { ...d, motoristaNome: m?.nome, responsavelUserId: m?.userId ?? null, responsavelNome: m?.nome ?? null }
    },
    afterCreate: async (row, req) => {
      if (row.vencimento) await scheduleReminder({ tenantId: row.tenantId, modulo: 'infraestrutura', titulo: `Multa ${row.autoInfracao ?? ''} vence`, dueAt: row.vencimento, antecedenciaDias: 7, refType: 'Inf2Multa', refId: row.id, assigneeRole: 'FACILITIES', dedupeKey: `inf2-multa-${row.id}` })
    },
  })
  const multaAcao = (acao: string, fn: (m: any, b: any, req: AuthenticatedRequest) => Promise<any>, schema: z.ZodTypeAny = z.object({}).passthrough()) =>
    router.post(`/frota/multas/:id/${acao}`, requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const m = await prisma.inf2Multa.findFirst({ where: { id: idParam(req), tenantId } })
      if (!m) return res.status(404).json({ error: 'Multa não encontrada.' })
      if (['PAGA', 'CANCELADA'].includes(m.status) && acao !== 'ressarcir') fail(409, 'Multa já encerrada.')
      const r = await fn(m, parseBody(schema, req.body ?? {}), req)
      await audit({ tenantId, userId: getUserId(req), modulo: MOD2, acao: `MULTA_${acao.toUpperCase()}`, refType: 'Inf2Multa', refId: m.id })
      res.json(r)
    }))
  multaAcao('tratamento', async (m, b, req) => {
    if (b.tratamento === 'INSTITUICAO') return prisma.inf2Multa.update({ where: { id: m.id }, data: { tratamento: 'INSTITUICAO', valorRessarcir: 0 } })
    const nome = b.responsavelUserId ? await exigirUsuario(m.tenantId, b.responsavelUserId) : b.responsavelNome ?? m.responsavelNome
    if (!nome) fail(400, 'Informe o responsável pelo ressarcimento/desconto.')
    const valorRessarcir = b.valorRessarcir ?? m.valor
    if (valorRessarcir > m.valor + 0.001) fail(400, 'valorRessarcir maior que o valor da multa.')
    const r = await prisma.inf2Multa.update({ where: { id: m.id }, data: { tratamento: b.tratamento, valorRessarcir, responsavelUserId: b.responsavelUserId ?? m.responsavelUserId, responsavelNome: nome } })
    if (r.responsavelUserId) await notify({ tenantId: m.tenantId, userId: r.responsavelUserId, assunto: 'Multa de veículo em seu nome', mensagem: `Multa de ${money(m.valor).toLocaleString('pt-BR')} (${b.tratamento === 'DESCONTO_FOLHA' ? 'desconto em folha' : 'ressarcimento'}). Procure a Infraestrutura.`, refType: 'Inf2Multa', refId: m.id }).catch(() => null)
    return r
  }, z.object({ tratamento: z.enum(['INSTITUICAO', 'RESSARCIMENTO', 'DESCONTO_FOLHA']), responsavelUserId: z.string().optional().nullable(), responsavelNome: z.string().max(160).optional(), valorRessarcir: z.number().min(0).optional() }))
  multaAcao('ressarcir', async (m, b) => {
    if (!['RESSARCIMENTO', 'DESCONTO_FOLHA'].includes(m.tratamento)) fail(409, 'Defina o tratamento (ressarcimento/desconto) antes de registrar valores.')
    const novo = money(m.valorRessarcido + b.valor)
    if (novo > m.valorRessarcir + 0.001) fail(400, 'Valor excede o saldo a ressarcir.')
    return prisma.inf2Multa.update({ where: { id: m.id }, data: { valorRessarcido: novo, ressarcimentoEm: new Date() } })
  }, z.object({ valor: z.number().positive() }))
  multaAcao('pagar', async (m) => prisma.inf2Multa.update({ where: { id: m.id }, data: { status: 'PAGA', pagaEm: new Date() } }))
  multaAcao('recurso', async (m) => prisma.inf2Multa.update({ where: { id: m.id }, data: { status: 'EM_RECURSO' } }))
  multaAcao('cancelar', async (m, b) => prisma.inf2Multa.update({ where: { id: m.id }, data: { status: 'CANCELADA', observacoes: [m.observacoes, b.motivo ? `Cancelada: ${b.motivo}` : null].filter(Boolean).join('\n') || null } }), z.object({ motivo: z.string().max(300).optional() }))

  // ------------------------------------------------------------ seguros, manutenções, documentos
  const segSchema = z.object({
    veiculoId: z.string(), apolice: z.string().min(2).max(60), seguradora: z.string().min(2).max(120), cobertura: z.string().max(500).optional().nullable(), vigenciaInicio: dateISO(), vigenciaFim: dateISO(),
    premio: z.number().min(0).default(0), franquia: z.number().min(0).optional().nullable(), corretor: z.string().max(120).optional().nullable(), responsavelNome: z.string().max(160).optional().nullable(),
    status: z.enum(['VIGENTE', 'ENCERRADA', 'CANCELADA']).default('VIGENTE'),
  }).refine((s) => s.vigenciaFim > s.vigenciaInicio, { message: 'vigenciaFim deve ser posterior à vigenciaInicio.', path: ['vigenciaFim'] })
  mountCrud(router, {
    model: 'inf2Seguro', path: '/frota/seguros', read: LEITURA, write: GESTAO, modulo: MOD2, create: segSchema, update: z.object({ seguradora: z.string(), cobertura: z.string().nullable(), vigenciaFim: dateISO(), premio: z.number().min(0), franquia: z.number().min(0).nullable(), corretor: z.string().nullable(), responsavelNome: z.string().nullable(), status: z.enum(['VIGENTE', 'ENCERRADA', 'CANCELADA']) }).partial(),
    filters: ['veiculoId', 'status'], search: ['apolice', 'seguradora'], orderBy: { vigenciaFim: 'asc' },
    beforeCreate: async (d, req) => { const t = getTenantId(req); await veiculoDoTenant(t, d.veiculoId); if (await prisma.inf2Seguro.findFirst({ where: { tenantId: t, apolice: d.apolice } })) fail(409, 'Apólice já cadastrada.'); return d },
  })
  const manSchema = z.object({
    veiculoId: z.string(), tipo: z.enum(['REVISAO', 'PREVENTIVA', 'CORRETIVA', 'PNEUS', 'LAVAGEM', 'FUNILARIA']), descricao: z.string().min(3).max(500), data: dateISO(), km: z.number().min(0).optional().nullable(),
    custo: z.number().min(0).default(0), oficina: z.string().max(160).optional().nullable(), responsavelUserId: z.string().optional().nullable(), proximaKm: z.number().min(0).optional().nullable(), proximaData: dateISO().optional().nullable(),
    status: z.enum(['AGENDADA', 'CONCLUIDA', 'CANCELADA']).default('CONCLUIDA'),
  })
  mountCrud(router, {
    model: 'inf2FrotaManutencao', path: '/frota/manutencoes', read: LEITURA, write: GESTAO, modulo: MOD2, create: manSchema, update: manSchema.partial(),
    filters: ['veiculoId', 'tipo', 'status'], search: ['descricao', 'oficina'], orderBy: { data: 'desc' },
    beforeCreate: async (d, req) => { const t = getTenantId(req); await veiculoDoTenant(t, d.veiculoId); return { ...d, responsavelNome: await exigirUsuario(t, d.responsavelUserId) } },
    afterCreate: async (row) => {
      if (row.status === 'CONCLUIDA' && row.km) await prisma.inf2Veiculo.updateMany({ where: { id: row.veiculoId, tenantId: row.tenantId, odometroKm: { lt: row.km } }, data: { odometroKm: row.km } })
      if (row.proximaData) await scheduleReminder({ tenantId: row.tenantId, modulo: 'infraestrutura', titulo: `Revisão da frota: ${row.descricao}`, dueAt: row.proximaData, antecedenciaDias: 15, refType: 'Inf2FrotaManutencao', refId: row.id, assigneeRole: 'FACILITIES', dedupeKey: `inf2-fman-${row.id}` })
    },
  })
  const docSchema = z.object({
    veiculoId: z.string(), tipo: z.enum(['CRLV', 'LICENCIAMENTO', 'IPVA', 'DPVAT', 'VISTORIA', 'AUTORIZACAO', 'OUTRO']), numero: z.string().max(60).optional().nullable(), exercicio: z.number().int().min(2000).max(2100).optional().nullable(),
    emissao: dateISO().optional().nullable(), validade: dateISO().optional().nullable(), valor: z.number().min(0).optional().nullable(), responsavelNome: z.string().max(160).optional().nullable(), observacoes: z.string().max(500).optional().nullable(),
  })
  mountCrud(router, {
    model: 'inf2FrotaDoc', path: '/frota/documentos', read: LEITURA, write: GESTAO, modulo: MOD2, create: docSchema, update: docSchema.partial(), filters: ['veiculoId', 'tipo'], orderBy: { validade: 'asc' },
    beforeCreate: async (d, req) => { await veiculoDoTenant(getTenantId(req), d.veiculoId); return d },
    afterCreate: async (row) => { if (row.validade) await agendarDoc(row) },
    afterUpdate: async (row) => { if (row.validade) await agendarDoc(row) },
  })

  // ------------------------------------------------------------ reservas / viagens
  const resSchema = z.object({
    veiculoId: z.string(), motoristaId: z.string().optional().nullable(), finalidade: z.string().min(3).max(300), destino: z.string().min(2).max(200), passageiros: z.number().int().min(1).max(100).default(1),
    saidaPrevista: dateISO(), retornoPrevisto: dateISO(),
  })
  router.post('/frota/reservas', NOT_STUDENT, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d = parseBody(resSchema, req.body)
    if (d.retornoPrevisto <= d.saidaPrevista) fail(400, 'O retorno deve ser posterior à saída.')
    if (d.saidaPrevista.getTime() < Date.now() - 5 * 60_000) fail(400, 'A saída não pode estar no passado.')
    const v = await veiculoDoTenant(tenantId, d.veiculoId)
    if (v.status !== 'ATIVO') fail(409, `Veículo indisponível (${v.status}).`)
    if (v.capacidade && d.passageiros > v.capacidade) fail(400, `Capacidade do veículo: ${v.capacidade} passageiros.`)
    const mot = await motoristaDoTenant(tenantId, d.motoristaId)
    if (mot && (!mot.ativo || !cnhValidaEm(mot.cnhValidade, d.retornoPrevisto))) fail(409, 'Motorista inativo ou com CNH vencida/sem validade informada no período.')
    await checarConflito(tenantId, d.veiculoId, d.saidaPrevista, d.retornoPrevisto)
    const r = await prisma.inf2Reserva.create({ data: { ...d, tenantId, numero: await nextNum(tenantId, 'VIA', 'VIA'), motoristaNome: mot?.nome, solicitanteUserId: getUserId(req), solicitanteNome: await nomeDe(req) } })
    for (const u of await usuariosComPapel(tenantId, ['FACILITIES'])) await notify({ tenantId, userId: u.id, assunto: `Nova reserva de veículo ${r.numero}`, mensagem: `${d.finalidade} — ${d.destino}`, refType: 'Inf2Reserva', refId: r.id }).catch(() => null)
    res.status(201).json(r)
  }))
  router.get('/frota/reservas/minhas', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const rows = await prisma.inf2Reserva.findMany({ where: { tenantId: getTenantId(req), solicitanteUserId: getUserId(req) }, orderBy: { saidaPrevista: 'desc' }, take: 100 })
    res.json({ items: rows, total: rows.length })
  }))
  router.get('/frota/reservas', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId: getTenantId(req) }
    for (const f of ['veiculoId', 'status', 'motoristaId', 'solicitanteUserId']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    const [rows, total] = await Promise.all([prisma.inf2Reserva.findMany({ where, orderBy: { saidaPrevista: 'desc' }, skip, take }), prisma.inf2Reserva.count({ where })])
    res.json({ items: rows, total, page, pageSize })
  }))
  const reservaAcao = (acao: string, roles: 'gestao' | 'dono_ou_gestao', fn: (r: any, b: any, req: AuthenticatedRequest) => Promise<any>, schema: z.ZodTypeAny = z.object({}).passthrough()) =>
    router.post(`/frota/reservas/:id/${acao}`, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const r = await prisma.inf2Reserva.findFirst({ where: { id: idParam(req), tenantId } })
      if (!r) return res.status(404).json({ error: 'Reserva não encontrada.' })
      const dono = r.solicitanteUserId === getUserId(req)
      if (!isGestao(req) && !(roles === 'dono_ou_gestao' && dono)) return res.status(403).json({ error: 'Sem permissão para esta ação.' })
      res.json(await fn(r, parseBody(schema, req.body ?? {}), req))
    }))
  reservaAcao('decidir', 'gestao', async (r, b, req) => {
    if (r.status !== 'SOLICITADA') fail(409, 'Reserva já decidida.')
    if (b.decisao === 'APROVAR') {
      const mId = b.motoristaId ?? r.motoristaId
      const mot = await motoristaDoTenant(r.tenantId, mId)
      if (!mot) fail(400, 'Informe o motorista (motoristaId) para aprovar a reserva.')
      if (!mot.ativo || !cnhValidaEm(mot.cnhValidade, r.retornoPrevisto)) fail(409, 'Motorista inativo ou com CNH vencida no período.')
      await checarConflito(r.tenantId, r.veiculoId, r.saidaPrevista, r.retornoPrevisto, r.id)
      var data: any = { status: 'APROVADA', motoristaId: mot.id, motoristaNome: mot.nome }
    } else { if (!b.motivo) fail(400, 'Informe o motivo da negativa.'); data = { status: 'NEGADA' } }
    const u = await prisma.inf2Reserva.update({ where: { id: r.id }, data: { ...data, decididoPorId: getUserId(req), decididoPorNome: await nomeDe(req), motivoDecisao: b.motivo ?? null } })
    await notify({ tenantId: r.tenantId, userId: r.solicitanteUserId, assunto: `Reserva ${r.numero} ${u.status === 'APROVADA' ? 'aprovada' : 'negada'}`, mensagem: b.motivo ?? 'Veja os detalhes na Frota.', refType: 'Inf2Reserva', refId: r.id }).catch(() => null)
    return u
  }, z.object({ decisao: z.enum(['APROVAR', 'NEGAR']), motoristaId: z.string().optional(), motivo: z.string().max(300).optional() }))
  reservaAcao('iniciar', 'gestao', async (r, b) => {
    if (r.status !== 'APROVADA') fail(409, 'Só reservas aprovadas podem iniciar.')
    const v = await veiculoDoTenant(r.tenantId, r.veiculoId)
    const kmSaida = b.kmSaida ?? v.odometroKm
    if (kmSaida < v.odometroKm) fail(400, `kmSaida menor que o odômetro atual (${v.odometroKm}).`)
    return prisma.inf2Reserva.update({ where: { id: r.id }, data: { status: 'EM_CURSO', saidaReal: new Date(), kmSaida } })
  }, z.object({ kmSaida: z.number().min(0).optional() }))
  reservaAcao('concluir', 'gestao', async (r, b, req) => {
    if (r.status !== 'EM_CURSO') fail(409, 'Só viagens em curso podem ser concluídas.')
    if (b.kmChegada < (r.kmSaida ?? 0)) fail(400, 'kmChegada menor que kmSaida.')
    const u = await prisma.inf2Reserva.update({ where: { id: r.id }, data: { status: 'CONCLUIDA', retornoReal: new Date(), kmChegada: b.kmChegada, ocorrencias: b.ocorrencias ?? null } })
    await prisma.inf2FrotaRegistro.create({ data: { tenantId: r.tenantId, veiculoId: r.veiculoId, tipo: 'QUILOMETRAGEM', data: new Date(), km: b.kmChegada, motoristaId: r.motoristaId, motoristaNome: r.motoristaNome, registradoPorId: getUserId(req), registradoPorNome: await nomeDe(req), observacoes: `Viagem ${r.numero}` } })
    await prisma.inf2Veiculo.updateMany({ where: { id: r.veiculoId, tenantId: r.tenantId, odometroKm: { lt: b.kmChegada } }, data: { odometroKm: b.kmChegada } })
    return u
  }, z.object({ kmChegada: z.number().min(0), ocorrencias: z.string().max(1000).optional() }))
  reservaAcao('cancelar', 'dono_ou_gestao', async (r) => {
    if (!['SOLICITADA', 'APROVADA'].includes(r.status)) fail(409, 'Reserva não pode mais ser cancelada.')
    return prisma.inf2Reserva.update({ where: { id: r.id }, data: { status: 'CANCELADA' } })
  })

  // ------------------------------------------------------------ alertas, painel, exportação
  router.get('/frota/alertas', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    res.json(await coletarAlertas(getTenantId(req), Number(qs(req.query.dias)) || 90))
  }))
  router.get('/frota/painel', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const [veics, multas, reservas] = await Promise.all([prisma.inf2Veiculo.findMany({ where: { tenantId } }), prisma.inf2Multa.findMany({ where: { tenantId } }), prisma.inf2Reserva.findMany({ where: { tenantId, status: { in: ['SOLICITADA', 'APROVADA', 'EM_CURSO'] } } })])
    const al = await coletarAlertas(tenantId, 90)
    const ate = new Date(), de = addDias(ate, -365)
    const custos = await Promise.all(veics.filter((v) => v.status !== 'BAIXADO').map(async (v) => ({ veiculoId: v.id, placa: v.placa, ...(await custoVeiculo(tenantId, v.id, de, ate)) })))
    res.json({
      veiculos: veics.length, ativos: veics.filter((v) => v.status === 'ATIVO').length, emManutencao: veics.filter((v) => v.status === 'EM_MANUTENCAO').length,
      multasAbertas: multas.filter((m) => ['REGISTRADA', 'EM_RECURSO'].includes(m.status)).length,
      multasValorAberto: money(multas.filter((m) => ['REGISTRADA', 'EM_RECURSO'].includes(m.status)).reduce((s, m) => s + m.valor, 0)),
      aRessarcir: money(multas.filter((m) => m.status !== 'CANCELADA').reduce((s, m) => s + Math.max(0, m.valorRessarcir - m.valorRessarcido), 0)),
      reservasPendentes: reservas.filter((r) => r.status === 'SOLICITADA').length, emViagem: reservas.filter((r) => r.status === 'EM_CURSO').length,
      alertas: al.total, vencidos: al.itens.filter((a) => a.faixa === 'VENCIDO').length, custoPorKm: custos,
    })
  }))
  router.get('/frota/relatorios/multas', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const rows = await prisma.inf2Multa.findMany({ where: { tenantId }, orderBy: { dataInfracao: 'desc' }, take: 5000 })
    const veics = Object.fromEntries((await prisma.inf2Veiculo.findMany({ where: { tenantId } })).map((v) => [v.id, v.placa]))
    const out = rows.map((m) => ({ placa: veics[m.veiculoId] ?? '', data: m.dataInfracao, auto: m.autoInfracao ?? '', descricao: m.descricao, motorista: m.motoristaNome ?? '', responsavel: m.responsavelNome ?? '', valor: m.valor, tratamento: m.tratamento, ressarcir: m.valorRessarcir, ressarcido: m.valorRessarcido, status: m.status }))
    if (qs(req.query.format) === 'csv') { res.setHeader('Content-Type', 'text/csv; charset=utf-8'); return res.send('﻿' + csv(out)) }
    res.json({ items: out, total: out.length })
  }))
}

async function checarConflito(tenantId: string, veiculoId: string, ini: Date, fim: Date, ignorarId?: string) {
  const outras = await prisma.inf2Reserva.findMany({ where: { tenantId, veiculoId, status: { in: ['APROVADA', 'EM_CURSO'] }, ...(ignorarId ? { id: { not: ignorarId } } : {}) } })
  const c = outras.find((o) => periodosSeSobrepoem([ini, fim], [o.saidaPrevista, o.retornoPrevisto]))
  if (c) fail(409, `Veículo já reservado no período (${c.numero}).`)
}

export async function custoVeiculo(tenantId: string, veiculoId: string, de: Date, ate: Date) {
  const [registros, manutencoes, multas, seguros] = await Promise.all([
    prisma.inf2FrotaRegistro.findMany({ where: { tenantId, veiculoId, data: { gte: de, lte: ate } } }),
    prisma.inf2FrotaManutencao.findMany({ where: { tenantId, veiculoId, status: 'CONCLUIDA', data: { gte: de, lte: ate } } }),
    prisma.inf2Multa.findMany({ where: { tenantId, veiculoId, dataInfracao: { gte: de, lte: ate } } }),
    prisma.inf2Seguro.findMany({ where: { tenantId, veiculoId, status: { not: 'CANCELADA' } } }),
  ])
  return custoPorKm({ registros, manutencoes, multas, seguros, de, ate })
}

async function agendarDoc(d: any) {
  await scheduleReminder({ tenantId: d.tenantId, modulo: 'infraestrutura', titulo: `Documento do veículo vence: ${d.tipo}`, dueAt: d.validade, antecedenciaDias: 30, refType: 'Inf2FrotaDoc', refId: d.id, assigneeRole: 'FACILITIES', dedupeKey: `inf2-fdoc-${d.id}` })
}

export async function coletarAlertas(tenantId: string, dias = 90) {
  const limite = addDias(new Date(), dias)
  const [docs, seguros, mans, motoristas, multas] = await Promise.all([
    prisma.inf2FrotaDoc.findMany({ where: { tenantId, validade: { lte: limite } } }),
    prisma.inf2Seguro.findMany({ where: { tenantId, status: 'VIGENTE', vigenciaFim: { lte: limite } } }),
    prisma.inf2FrotaManutencao.findMany({ where: { tenantId, status: { not: 'CANCELADA' }, proximaData: { lte: limite } } }),
    prisma.inf2Motorista.findMany({ where: { tenantId, ativo: true, cnhValidade: { lte: limite } } }),
    prisma.inf2Multa.findMany({ where: { tenantId, status: { in: ['REGISTRADA', 'EM_RECURSO'] }, vencimento: { lte: limite } } }),
  ])
  const veics = Object.fromEntries((await prisma.inf2Veiculo.findMany({ where: { tenantId } })).map((v) => [v.id, v.placa]))
  // documentos/revisões já renovados por registro mais novo do mesmo tipo/veículo não alertam
  const docsAtuais = docs.filter((d) => !docs.some((o) => o.id !== d.id && o.veiculoId === d.veiculoId && o.tipo === d.tipo && (o.validade ?? 0) > (d.validade ?? 0)))
  const itens: Array<{ tipo: string; refId: string; veiculo?: string; titulo: string; vencimento: Date; dias: number | null; faixa: string | null; responsavel?: string | null }> = []
  const add = (tipo: string, refId: string, veiculoId: string | null, titulo: string, venc: Date | null, responsavel?: string | null) => { if (venc) { const a = alertaVenc(venc); itens.push({ tipo, refId, veiculo: veiculoId ? veics[veiculoId] : undefined, titulo, vencimento: venc, dias: a.dias, faixa: a.faixa, responsavel }) } }
  for (const d of docsAtuais) add('DOCUMENTO', d.id, d.veiculoId, `${d.tipo}${d.exercicio ? ' ' + d.exercicio : ''}`, d.validade, d.responsavelNome)
  for (const s of seguros) add('SEGURO', s.id, s.veiculoId, `Apólice ${s.apolice} (${s.seguradora})`, s.vigenciaFim, s.responsavelNome)
  for (const m of mans) add('REVISAO', m.id, m.veiculoId, m.descricao, m.proximaData, m.responsavelNome)
  for (const m of motoristas) add('CNH', m.id, null, `CNH de ${m.nome}`, m.cnhValidade, m.nome)
  for (const m of multas) add('MULTA', m.id, m.veiculoId, `Multa ${m.autoInfracao ?? m.descricao}`, m.vencimento, m.responsavelNome)
  itens.sort((a, b) => a.vencimento.getTime() - b.vencimento.getTime())
  return { dias, total: itens.length, itens }
}

/** Job: lembretes para documentos, seguros, CNH e revisões que vencem em até 90 dias. */
export async function jobFrota() {
  const tenants = await prisma.inf2Veiculo.findMany({ distinct: ['tenantId'], select: { tenantId: true } })
  let n = 0
  for (const { tenantId } of tenants) {
    const al = await coletarAlertas(tenantId, 60)
    for (const a of al.itens) { await scheduleReminder({ tenantId, modulo: 'infraestrutura', titulo: `Frota: ${a.titulo}${a.veiculo ? ' — ' + a.veiculo : ''}`, dueAt: a.vencimento, antecedenciaDias: 30, refType: `Inf2Alerta${a.tipo}`, refId: a.refId, assigneeRole: 'FACILITIES', severity: (a.dias ?? 0) < 0 ? 'CRITICO' : 'ATENCAO', dedupeKey: `inf2-alerta-${a.tipo}-${a.refId}` }); n++ }
  }
  return { alertas: n }
}
export function registerFrotaJob() { registerEduJob('infra2.frota', () => jobFrota()) }
