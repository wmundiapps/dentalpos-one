import { Response, Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, requireRole } from '../academico/middleware'
import { dateISO, mountCrud, pageParams, parseBody, qs } from '../core/crud'
import { hashCpf, HR, MODULO, auditar, carregarColaborador, colaboradorVisao, dia, equipeIds, exigirAcesso, exigirRh, getConfig, httpError, isFin, isRh, logSensivel, meuColaborador, proteger, revelar, tid, uid, validarCpf } from './common'
import { cargaSemanalDe, validarJornada } from './calculo'
import { ENCARGOS_PADRAO, INSS_2025, INSS_2026, IRRF_2025, IRRF_2026 } from './fiscal'

export const VINCULOS = ['CLT', 'PJ', 'ESTAGIARIO', 'PROFESSOR_HORISTA'] as const
export const TIPOS_COLAB = ['DOCENTE', 'TECNICO_ADMINISTRATIVO'] as const
export const STATUS_COLAB = ['EM_ADMISSAO', 'ATIVO', 'AFASTADO', 'FERIAS', 'DESLIGADO'] as const

export const CHECKLIST_ADMISSAO: Array<[string, string, boolean]> = [
  ['RG_CPF', 'RG e CPF (cópia)', true], ['CTPS', 'CTPS digital / carteira de trabalho', true], ['COMP_RESIDENCIA', 'Comprovante de residência', true], ['TITULO_ELEITOR', 'Título de eleitor', false],
  ['RESERVISTA', 'Certificado de reservista (se aplicável)', false], ['ESCOLARIDADE', 'Comprovante de escolaridade / diploma', true], ['REGISTRO_CONSELHO', 'Registro em conselho profissional (se aplicável)', false],
  ['CERTIDAO', 'Certidão de nascimento/casamento', true], ['DEPENDENTES', 'Documentos de dependentes (IRRF / salário-família)', false], ['DADOS_BANCARIOS', 'Dados bancários', true],
  ['FOTO', 'Foto 3x4', false], ['CONTRATO', 'Contrato de trabalho / termo de compromisso assinado', true], ['LGPD', 'Termo de ciência de tratamento de dados (LGPD)', true], ['ASO_ADMISSIONAL', 'Exame admissional (ASO) apto', true],
]
export const CHECKLIST_DESLIGAMENTO: Array<[string, string, boolean]> = [
  ['DEV_CRACHA', 'Devolução de crachá / cartão de acesso', true], ['DEV_EQUIPAMENTOS', 'Devolução de notebook/celular/equipamentos (patrimônio)', true], ['DEV_CHAVES', 'Devolução de chaves e armários', true],
  ['DEV_LIVROS', 'Devolução de livros/acervo da biblioteca', true], ['DEV_UNIFORME', 'Devolução de uniforme/EPI', false], ['ACESSOS', 'Revogação de acessos (sistemas, e-mail, VPN)', true],
  ['PASSAGEM_TAREFAS', 'Passagem de tarefas / turmas e diários', true], ['EXAME_DEMISSIONAL', 'Exame demissional (ASO)', true], ['ACERTO_CONTAS', 'Acerto de contas conferido', true],
]

const jornadaSchema = z.object({ nome: z.string().min(2).max(100), tipo: z.enum(['FIXA_SEMANAL', 'ESCALA_12X36']).default('FIXA_SEMANAL'), dias: z.record(z.string(), z.any()), baseData: dateISO().optional(), bancoHoras: z.boolean().default(false), descontaIntervaloAuto: z.boolean().default(true), ativo: z.boolean().default(true) })

const colabBase = z.object({
  nome: z.string().min(3).max(150), email: z.string().email().max(150).optional(), telefone: z.string().max(30).optional(), matricula: z.string().min(2).max(30).optional(),
  tipo: z.enum(TIPOS_COLAB).default('TECNICO_ADMINISTRATIVO'), vinculo: z.enum(VINCULOS).default('CLT'), status: z.enum(STATUS_COLAB).optional(),
  cargoId: z.string().optional().nullable(), departamentoId: z.string().optional().nullable(), gestorId: z.string().optional().nullable(), jornadaId: z.string().optional().nullable(), userId: z.string().optional().nullable(),
  centroCusto: z.string().max(60).optional(), salarioBase: z.number().min(0).max(1_000_000).default(0), valorHora: z.number().min(0).max(10000).optional(), cargaMensalHoras: z.number().min(0).max(300).optional(),
  dependentesIrrf: z.number().int().min(0).max(20).default(0), dataNascimento: dateISO().optional(), dataAdmissao: dateISO().optional(),
  cpf: z.string().optional(), cnpjPj: z.string().max(20).optional(), banco: z.string().max(60).optional(), agencia: z.string().max(20).optional(), conta: z.string().max(30).optional(), pix: z.string().max(100).optional(),
  observacoes: z.string().max(2000).optional(),
})

async function validarRefs(tenantId: string, b: any, selfId?: string) {
  const chk = async (m: string, id?: string | null, nome = m) => { if (id && !(await (prisma as any)[m].findFirst({ where: { id, tenantId }, select: { id: true } }))) throw httpError(422, `${nome} não encontrado(a) nesta instituição.`) }
  await chk('rheCargo', b.cargoId, 'Cargo'); await chk('rheDepartamento', b.departamentoId, 'Departamento'); await chk('rheColaborador', b.gestorId, 'Gestor'); await chk('rheJornada', b.jornadaId, 'Jornada')
  if (b.gestorId && b.gestorId === selfId) throw httpError(422, 'O colaborador não pode ser gestor de si mesmo.')
  if (b.userId) {
    if (!(await prisma.user.findFirst({ where: { id: b.userId, tenantId }, select: { id: true } }))) throw httpError(422, 'Usuário não encontrado nesta instituição.')
    const outro = await prisma.rheColaborador.findFirst({ where: { tenantId, userId: b.userId, ...(selfId ? { NOT: { id: selfId } } : {}) }, select: { id: true } })
    if (outro) throw httpError(409, 'Este usuário já está vinculado a outro colaborador.')
  }
}

export function mountCadastro(router: Router) {
  const leitura = [HR, 'COORDINATOR', 'FINANCE'] as any[]
  mountCrud(router, { model: 'rheDepartamento', path: '/departamentos', read: leitura, write: [HR], create: z.object({ codigo: z.string().min(1).max(30).transform((s) => s.toUpperCase()), nome: z.string().min(2).max(120), centroCusto: z.string().max(60).optional(), responsavelId: z.string().optional(), ativo: z.boolean().default(true) }), search: ['nome', 'codigo'], orderBy: { nome: 'asc' }, modulo: MODULO })
  mountCrud(router, { model: 'rheCargo', path: '/cargos', read: leitura, write: [HR], create: z.object({ nome: z.string().min(2).max(120), cbo: z.string().max(10).optional(), categoria: z.enum(['DOCENTE', 'TECNICO_ADMINISTRATIVO', 'GESTAO']).default('TECNICO_ADMINISTRATIVO'), faixaMin: z.number().min(0).optional(), faixaMax: z.number().min(0).optional(), descricao: z.string().max(1000).optional(), ativo: z.boolean().default(true) }).refine((d) => d.faixaMin === undefined || d.faixaMax === undefined || d.faixaMax >= d.faixaMin, { message: 'faixaMax deve ser maior ou igual a faixaMin' }), update: z.object({ nome: z.string().min(2).max(120), cbo: z.string().max(10), categoria: z.enum(['DOCENTE', 'TECNICO_ADMINISTRATIVO', 'GESTAO']), faixaMin: z.number().min(0), faixaMax: z.number().min(0), descricao: z.string().max(1000), ativo: z.boolean() }).partial(), search: ['nome'], orderBy: { nome: 'asc' }, modulo: MODULO })
  mountCrud(router, {
    model: 'rheJornada', path: '/jornadas', read: leitura, write: [HR], create: jornadaSchema, orderBy: { nome: 'asc' }, modulo: MODULO,
    beforeCreate: (d) => { const e = validarJornada(d.tipo, d.dias); if (e.length) throw httpError(422, e.join(' ')); return { ...d, cargaSemanalMin: cargaSemanalDe(d.tipo, d.dias) } },
    beforeUpdate: (d, _r, cur) => { const tipo = d.tipo ?? cur.tipo, dias = d.dias ?? cur.dias; const e = validarJornada(tipo, dias); if (e.length) throw httpError(422, e.join(' ')); return { ...d, cargaSemanalMin: cargaSemanalDe(tipo, dias) } },
  })
  mountCrud(router, { model: 'rheFeriado', path: '/feriados', read: leitura, write: [HR], create: z.object({ data: dateISO(), nome: z.string().min(2).max(100) }), orderBy: { data: 'asc' }, modulo: MODULO })

  router.get('/config', requireRole(HR, 'FINANCE'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => res.json(await getConfig(tid(req)))))
  router.put('/config', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const b = parseBody(z.object({
      toleranciaMarcacaoMin: z.number().int().min(0).max(30), toleranciaDiariaMin: z.number().int().min(0).max(60), divisorHoras: z.number().min(100).max(300), adicionalNoturnoPct: z.number().min(0).max(100),
      horaNoturnaReduzida: z.boolean(), noturnoInicio: z.string().regex(/^\d{2}:\d{2}$/), noturnoFim: z.string().regex(/^\d{2}:\d{2}$/), he50Pct: z.number().min(0).max(200), he100Pct: z.number().min(0).max(300),
      he50LimiteDiarioMin: z.number().int().min(0).max(600), excedenteCem: z.boolean(), bancoValidadeMeses: z.number().int().min(1).max(12), bancoFator100: z.number().min(1).max(3),
      periodicidadeExameMeses: z.number().int().min(1).max(24), alertaFeriasDias: z.number().int().min(15).max(365), alertaExameDias: z.number().int().min(7).max(180), descontaDsrFalta: z.boolean(),
    }).partial(), req.body)
    await getConfig(tid(req))
    const r = await prisma.rheConfig.update({ where: { tenantId: tid(req) }, data: b })
    await auditar(req, 'ATUALIZAR_CONFIG', 'RheConfig', r.id, b)
    res.json(r)
  }))

  // ---------------------------------------------------------------- colaboradores
  router.get('/colaboradores', requireRole(HR, 'COORDINATOR', 'FINANCE'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    if (!isRh(req) && !isFin(req)) where.id = { in: await equipeIds(req) }
    for (const f of ['status', 'vinculo', 'tipo', 'departamentoId', 'cargoId'] as const) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    const q = qs(req.query.q)
    if (q) where.OR = [{ nome: { contains: q, mode: 'insensitive' } }, { matricula: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }]
    const [items, total] = await Promise.all([prisma.rheColaborador.findMany({ where, orderBy: { nome: 'asc' }, skip, take }), prisma.rheColaborador.count({ where })])
    const [cargos, deps] = await Promise.all([prisma.rheCargo.findMany({ where: { tenantId }, select: { id: true, nome: true } }), prisma.rheDepartamento.findMany({ where: { tenantId }, select: { id: true, nome: true } })])
    const cn = Object.fromEntries(cargos.map((c) => [c.id, c.nome])), dn = Object.fromEntries(deps.map((d) => [d.id, d.nome]))
    res.json({ items: items.map((c) => ({ ...colaboradorVisao(c, req), cargoNome: c.cargoId ? cn[c.cargoId] : null, departamentoNome: c.departamentoId ? dn[c.departamentoId] : null })), total, page, pageSize })
  }))

  router.get('/colaboradores/meu', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const me = await meuColaborador(req)
    if (!me) throw httpError(403, 'Seu usuário não está vinculado a um colaborador do RH.')
    const c = await carregarColaborador(tid(req), me.id)
    const { salarioBase, valorHora, cpfHash, cpfCifrado, contaCifrada, pixCifrado, ...r } = c as any
    res.json({ ...r, cpfMascarado: r.cpfFinal ? `***.***.***-${r.cpfFinal}` : null })
  }))

  router.get('/colaboradores/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const c = await carregarColaborador(tid(req), String(req.params.id))
    await exigirAcesso(req, c.id)
    const [cargo, dep, gestor, jornada] = await Promise.all([
      c.cargoId ? prisma.rheCargo.findFirst({ where: { id: c.cargoId } }) : null, c.departamentoId ? prisma.rheDepartamento.findFirst({ where: { id: c.departamentoId } }) : null,
      c.gestorId ? prisma.rheColaborador.findFirst({ where: { id: c.gestorId }, select: { id: true, nome: true } }) : null, c.jornadaId ? prisma.rheJornada.findFirst({ where: { id: c.jornadaId } }) : null,
    ])
    if (isRh(req)) await logSensivel(req, 'colaboradores', 'REMUNERACAO', c.id, c.id)
    res.json({ ...colaboradorVisao(c, req), cargo, departamento: dep, gestor, jornada })
  }))

  // Revela o CPF completo (RH, com motivo) — gera log de acesso a dado pessoal.
  router.get('/colaboradores/:id/cpf', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const motivo = qs(req.query.motivo)
    if (!motivo || motivo.length < 5) throw httpError(400, 'Informe o motivo da consulta (mín. 5 caracteres).')
    const c = await carregarColaborador(tid(req), String(req.params.id))
    await logSensivel(req, 'colaboradores/cpf', 'IDENTIFICACAO', c.id, c.id, motivo)
    res.json({ id: c.id, cpf: revelar(c.cpfCifrado) })
  }))

  router.post('/colaboradores', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(colabBase.refine((d) => d.vinculo !== 'PROFESSOR_HORISTA' || (d.valorHora && d.cargaMensalHoras), { message: 'Professor horista exige valorHora e cargaMensalHoras' }), req.body)
    await validarRefs(tenantId, b)
    const { cpf, conta, pix, ...resto } = b
    let cpfData: any = {}
    if (cpf) {
      const d = validarCpf(cpf); const h = hashCpf(tenantId, d)!
      if (await prisma.rheColaborador.findFirst({ where: { tenantId, cpfHash: h }, select: { id: true } })) throw httpError(409, 'Já existe colaborador com este CPF.')
      cpfData = { cpfHash: h, cpfCifrado: proteger(d), cpfFinal: d.slice(-2) }
    }
    const hoje = dia(new Date())
    const status = b.status ?? (b.dataAdmissao && dia(b.dataAdmissao) <= hoje ? 'ATIVO' : 'EM_ADMISSAO')
    const { matricula: mat, ...semMat } = resto
    const matricula = mat ?? (await (await import('./common')).proximaMatricula(tenantId))
    const c = await prisma.rheColaborador.create({ data: { ...semMat, matricula, tenantId, status, ...cpfData, contaCifrada: proteger(conta), pixCifrado: proteger(pix) } as any })
    if (c.dataAdmissao) await prisma.rheMovimentacao.create({ data: { tenantId, colaboradorId: c.id, tipo: 'ADMISSAO', dataEfetiva: c.dataAdmissao, cargoParaId: c.cargoId, salarioPara: c.salarioBase, departamentoParaId: c.departamentoId, motivo: 'Admissão', aprovadoPorId: uid(req) } })
    if (status === 'EM_ADMISSAO') await prisma.rheChecklistItem.createMany({ data: CHECKLIST_ADMISSAO.map(([codigo, titulo, obrigatorio]) => ({ tenantId, colaboradorId: c.id, fluxo: 'ADMISSAO', codigo, titulo, obrigatorio })), skipDuplicates: true })
    await auditar(req, 'CRIAR', 'RheColaborador', c.id)
    res.status(201).json(colaboradorVisao(c, req))
  }))

  router.put('/colaboradores/:id', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const cur = await carregarColaborador(tenantId, String(req.params.id))
    if (cur.status === 'DESLIGADO') throw httpError(409, 'Colaborador desligado não pode ser alterado.')
    const b = parseBody(colabBase.partial(), req.body)
    await validarRefs(tenantId, b, cur.id)
    const { cpf, conta, pix, status, ...resto } = b as any
    const data: any = { ...resto }
    if (status && status !== cur.status) {
      if (status === 'DESLIGADO') throw httpError(422, 'Use o fluxo de desligamento (/desligamentos) para desligar.')
      data.status = status
    }
    if (cpf) {
      const d = validarCpf(cpf); const h = hashCpf(tenantId, d)!
      if (await prisma.rheColaborador.findFirst({ where: { tenantId, cpfHash: h, NOT: { id: cur.id } }, select: { id: true } })) throw httpError(409, 'Já existe colaborador com este CPF.')
      Object.assign(data, { cpfHash: h, cpfCifrado: proteger(d), cpfFinal: d.slice(-2) })
    }
    if (conta !== undefined) data.contaCifrada = proteger(conta)
    if (pix !== undefined) data.pixCifrado = proteger(pix)
    const c = await prisma.rheColaborador.update({ where: { id: cur.id }, data })
    const mudouSal = data.salarioBase !== undefined && data.salarioBase !== cur.salarioBase
    const mudouCargo = data.cargoId !== undefined && data.cargoId !== cur.cargoId
    const mudouDep = data.departamentoId !== undefined && data.departamentoId !== cur.departamentoId
    if (mudouSal || mudouCargo || mudouDep) {
      await prisma.rheMovimentacao.create({ data: { tenantId, colaboradorId: cur.id, tipo: mudouCargo ? 'PROMOCAO' : mudouDep ? 'TRANSFERENCIA' : 'REAJUSTE', dataEfetiva: new Date(), cargoDeId: cur.cargoId, cargoParaId: c.cargoId, salarioDe: cur.salarioBase, salarioPara: c.salarioBase, departamentoDeId: cur.departamentoId, departamentoParaId: c.departamentoId, motivo: 'Alteração cadastral', aprovadoPorId: uid(req) } })
    }
    await auditar(req, 'ATUALIZAR', 'RheColaborador', cur.id, { campos: Object.keys(data).filter((k) => !/cpf|conta|pix/i.test(k)) })
    res.json(colaboradorVisao(c, req))
  }))

  // ---------------------------------------------------------------- bootstrap (parâmetros e modelos)
  router.post('/bootstrap', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    await getConfig(tenantId)
    const eventos: Array<[string, string, string, boolean, boolean, boolean]> = [
      ['SAL', 'Salário', 'PROVENTO', true, true, true], ['SAL_HORISTA', 'Horas contratadas (horista)', 'PROVENTO', true, true, true], ['DSR_HORISTA', 'DSR do horista', 'PROVENTO', true, true, true], ['BOLSA', 'Bolsa-auxílio de estágio', 'PROVENTO', false, false, false],
      ['HONORARIOS', 'Honorários PJ', 'PROVENTO', false, false, false], ['HE50', 'Horas extras 50%', 'PROVENTO', true, true, true], ['HE100', 'Horas extras 100%', 'PROVENTO', true, true, true], ['HE_NOT', 'Horas extras noturnas', 'PROVENTO', true, true, true],
      ['ADIC_NOT', 'Adicional noturno', 'PROVENTO', true, true, true], ['DSR_HE', 'DSR sobre variáveis', 'PROVENTO', true, true, true], ['BH_VENCIDO', 'Banco de horas vencido', 'PROVENTO', true, true, true],
      ['FERIAS', 'Férias', 'PROVENTO', true, true, true], ['TERCO_FERIAS', '1/3 de férias', 'PROVENTO', false, true, true], ['ABONO_FERIAS', 'Abono pecuniário', 'PROVENTO', false, false, false], ['TERCO_ABONO', '1/3 do abono', 'PROVENTO', false, false, false],
      ['DECIMO_1A', '13º - 1ª parcela', 'PROVENTO', false, false, true], ['DECIMO_2A', '13º - 2ª parcela', 'PROVENTO', true, true, true],
      ['BONUS', 'Bônus', 'PROVENTO', true, true, true], ['PREMIO', 'Prêmio', 'PROVENTO', true, true, true], ['PLR', 'Participação nos lucros', 'PROVENTO', false, true, false], ['COMISSAO', 'Comissão', 'PROVENTO', true, true, true],
      ['AJUDA_CUSTO', 'Ajuda de custo (indenizatória)', 'PROVENTO', false, false, false], ['AULA_EXTRA', 'Aulas extras / substituição', 'PROVENTO', true, true, true],
      ['FALTAS', 'Faltas', 'DESCONTO', false, false, false], ['DSR_FALTAS', 'DSR perdido', 'DESCONTO', false, false, false], ['ATRASOS', 'Atrasos', 'DESCONTO', false, false, false],
      ['INSS', 'INSS', 'DESCONTO', false, false, false], ['IRRF', 'IRRF', 'DESCONTO', false, false, false], ['ADIANT_13', 'Adiantamento de 13º', 'DESCONTO', false, false, false],
      ['VT', 'Vale-transporte (desconto até 6%)', 'DESCONTO', false, false, false], ['PLANO_SAUDE', 'Plano de saúde (coparticipação)', 'DESCONTO', false, false, false], ['ADIANTAMENTO', 'Adiantamento salarial', 'DESCONTO', false, false, false], ['PENSAO', 'Pensão alimentícia', 'DESCONTO', false, false, false],
    ]
    let ev = 0
    for (const [codigo, nome, tipo, i, r, f] of eventos) {
      const x = await prisma.rheEventoFolha.upsert({ where: { tenantId_codigo: { tenantId, codigo } }, create: { tenantId, codigo, nome, tipo, incideInss: i, incideIrrf: r, incideFgts: f, sistema: true }, update: {} })
      if (x) ev++
    }
    const tabs: Array<[string, string, any, any, string]> = [
      ['INSS', '2025-01-01', INSS_2025.faixas, { teto: INSS_2025.teto }, 'Portaria Interministerial MPS/MF 6/2025 (referência)'],
      ['INSS', '2026-01-01', INSS_2026.faixas, { teto: INSS_2026.teto }, 'Tabela 2026 (referência - conferir portaria vigente)'],
      ['IRRF', '2025-01-01', IRRF_2025.faixas, { deducaoDependente: IRRF_2025.deducaoDependente, descontoSimplificado: IRRF_2025.descontoSimplificado, redutor: null }, 'Tabela progressiva mensal (referência)'],
      ['IRRF', '2026-01-01', IRRF_2026.faixas, { deducaoDependente: IRRF_2026.deducaoDependente, descontoSimplificado: IRRF_2026.descontoSimplificado, redutor: IRRF_2026.redutor }, 'Lei 15.270/2025 - redutor/isenção até R$ 5.000 (referência - conferir)'],
      ['ENCARGOS', '2025-01-01', null, ENCARGOS_PADRAO, 'FGTS 8%, patronal 20% + RAT + terceiros (instituição pode ter isenção/alíquotas distintas)'],
    ]
    for (const [tipo, vig, faixas, parametros, fonte] of tabs) {
      await prisma.rheTabelaFiscal.upsert({ where: { tenantId_tipo_vigenciaInicio: { tenantId, tipo, vigenciaInicio: new Date(vig + 'T00:00:00Z') } }, create: { tenantId, tipo, vigenciaInicio: new Date(vig + 'T00:00:00Z'), faixas, parametros, fonte, modeloAValidar: true, descricao: 'MODELO A VALIDAR POR CONTADOR', criadoPorId: uid(req) }, update: {} })
    }
    const jornadas: Array<[string, any, boolean]> = [
      ['Padrão 40h (seg-sex)', { 1: { entrada: '08:00', saida: '17:00', intervaloMin: 60 }, 2: { entrada: '08:00', saida: '17:00', intervaloMin: 60 }, 3: { entrada: '08:00', saida: '17:00', intervaloMin: 60 }, 4: { entrada: '08:00', saida: '17:00', intervaloMin: 60 }, 5: { entrada: '08:00', saida: '17:00', intervaloMin: 60 } }, false],
      ['Padrão 44h (seg-sáb)', { 1: { entrada: '08:00', saida: '17:00', intervaloMin: 60 }, 2: { entrada: '08:00', saida: '17:00', intervaloMin: 60 }, 3: { entrada: '08:00', saida: '17:00', intervaloMin: 60 }, 4: { entrada: '08:00', saida: '17:00', intervaloMin: 60 }, 5: { entrada: '08:00', saida: '17:00', intervaloMin: 60 }, 6: { entrada: '08:00', saida: '12:00', intervaloMin: 0 } }, true],
    ]
    for (const [nome, dias, banco] of jornadas) {
      const j = await prisma.rheJornada.findFirst({ where: { tenantId, nome } })
      if (!j) await prisma.rheJornada.create({ data: { tenantId, nome, tipo: 'FIXA_SEMANAL', dias, bancoHoras: banco, cargaSemanalMin: cargaSemanalDe('FIXA_SEMANAL', dias) } })
    }
    await auditar(req, 'BOOTSTRAP', 'RheConfig')
    res.json({ ok: true, eventos: ev, aviso: 'Tabelas fiscais criadas como MODELO A VALIDAR POR CONTADOR (vigências 2025/2026).' })
  }))
}
