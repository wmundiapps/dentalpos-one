import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { dateISO, pageParams, parseBody, qs } from '../core/crud'
import { audit } from '../core/notify'
import { contatosDeAlunos } from '../comunicacao/campanhas'
import { registrarPreferencia } from '../comunicacao/store'
import { calcularEncargos, round2, toCsv } from './calculo'
import { LinhaDevedor, montarCarteira, politicaPara, sincronizarCasos } from './carteira'
import { calcularPagamento, FORMAS, registrarPagamentoTitulo } from './pagamentos'
import { COLUNAS_INAD, csvInadimplentes, filtrarLinhas, nomesDeUsuarios, painel, ranking, recebimentos } from './relatorios'
import { LE_PAINEL_COB, OPERA_COB } from './roles'
import { enviarCsv, httpErr, intervalo } from './util'
import { simularAcordo } from './acordos'
import { tipoComunicacao } from './contato'

const router = Router()

router.get('/painel', requireRole(...LE_PAINEL_COB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  res.json(await painel(getTenantId(req)))
}))

const num = (v: unknown) => (v === undefined || v === '' ? undefined : Number(v))
const bool = (v: unknown) => v === 'true' || v === '1'

function filtroDe(q: any) {
  return {
    q: qs(q.q), faixa: qs(q.faixa), status: qs(q.status), responsavelId: qs(q.responsavelId), cursoId: qs(q.cursoId), turmaId: qs(q.turmaId), poloId: qs(q.poloId), segmento: qs(q.segmento),
    min: num(qs(q.min)), max: num(qs(q.max)), semResponsavel: bool(qs(q.semResponsavel)), comPromessa: bool(qs(q.comPromessa)), comAcordo: bool(qs(q.comAcordo)), sort: qs(q.sort), dir: (qs(q.dir) === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc',
  }
}

// Planilha de TODOS os inadimplentes (aging, saldo, encargos, último contato, promessa, responsável, status).
router.get('/inadimplentes', requireRole(...OPERA_COB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const cart = await montarCarteira(tenantId)
  if (qs(req.query.formato) !== 'csv') await sincronizarCasos(tenantId, cart) // garante casoId para ações na tela
  const f = filtroDe(req.query)
  const todas = filtrarLinhas(cart.linhas, f)
  const resp = await nomesDeUsuarios(tenantId, todas.map((l) => l.responsavelUserId ?? ''))
  if (qs(req.query.formato) === 'csv') {
    await audit({ tenantId, userId: getUserId(req), modulo: 'cobranca', acao: 'EXPORTACAO_CSV', detalhes: { linhas: todas.length, filtros: f } })
    return enviarCsv(res, `inadimplentes-${new Date().toISOString().slice(0, 10)}.csv`, csvInadimplentes(todas, resp))
  }
  const { skip, take, page, pageSize } = pageParams(req.query)
  const soma = (k: keyof LinhaDevedor) => round2(todas.reduce((a, l) => a + (Number(l[k]) || 0), 0))
  const uniq = (k: 'curso' | 'turma' | 'polo') => {
    const m = new Map<string, string>()
    for (const l of cart.linhas) if (l[`${k}Id` as 'cursoId'] && l[k]) m.set(l[`${k}Id` as 'cursoId']!, l[k]!)
    return [...m.entries()].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }
  res.json({
    items: todas.slice(skip, skip + take).map((l) => ({ ...l, responsavel: l.responsavelUserId ? (resp.get(l.responsavelUserId) ?? null) : null })),
    total: todas.length, page, pageSize,
    totais: { alunos: todas.length, principal: soma('principal'), multa: soma('multa'), juros: soma('juros'), correcao: soma('correcao'), saldo: soma('saldo'), aVencer: soma('aVencer'), emAcordoValor: soma('emAcordoValor') },
    aging: cart.totais.aging,
    filtros: { cursos: uniq('curso'), turmas: uniq('turma'), polos: uniq('polo') },
    colunasCsv: COLUNAS_INAD,
  })
}))

router.get('/inadimplentes/:studentId', requireRole(...OPERA_COB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const studentId = String(req.params.studentId)
  const cart = await montarCarteira(tenantId, new Date(), { studentId })
  await sincronizarCasos(tenantId, cart)
  const linha = cart.linhas.find((l) => l.studentId === studentId)
  const aluno = await prisma.student.findFirst({ where: { id: studentId, tenantId }, select: { id: true, nomeCompleto: true, ra: true, status: true } })
  if (!aluno) return res.status(404).json({ error: 'Aluno não encontrado.' })
  const info = cart.info.get(studentId)
  const caso = await prisma.cobCaso.findFirst({ where: { tenantId, studentId } })
  const [contatos, promessas, acordos, enc, recebs] = await Promise.all([
    prisma.cobContato.findMany({ where: { tenantId, studentId }, orderBy: { createdAt: 'desc' }, take: 100 }),
    prisma.cobPromessa.findMany({ where: { tenantId, studentId }, orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.cobAcordo.findMany({ where: { tenantId, studentId }, orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.cobEncaminhamento.findMany({ where: { tenantId, studentId }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, numero: true, tipo: true, status: true, simulado: true, valorDebito: true, createdAt: true, protocoloExterno: true } }),
    prisma.cobRecebimento.findMany({ where: { tenantId, studentId }, orderBy: { dataPagamento: 'desc' }, take: 20 }),
  ])
  let bolsas: any[] = []
  try {
    const db = prisma as any
    const agora = new Date()
    bolsas = await db.apoConcessaoBolsa.findMany({ where: { tenantId, studentId, status: 'ATIVA', inicio: { lte: agora }, fim: { gte: agora } }, select: { id: true, percentual: true, valorMensal: true, inicio: true, fim: true } })
  } catch { /* apoio indisponível */ }
  const dados = (await contatosDeAlunos(tenantId, [studentId])).get(studentId)
  const pol = politicaPara(cart.politicas, info?.segmento ?? 'GRADUACAO')
  const resp = await nomesDeUsuarios(tenantId, [caso?.responsavelUserId ?? ''])
  let quitacaoAVista: any = null
  try { quitacaoAVista = await simularAcordo({ tenantId, studentId, parcelas: 0, primeiroVencimento: new Date(), descontoEncargosPct: pol.descontoQuitacaoEncargosPct, descontoPrincipalPct: info?.temBolsa && pol.bloqueiaDescontoComBolsa ? 0 : pol.descontoQuitacaoPrincipalPct }, cart) } catch { /* sem débito */ }
  res.json({
    aluno: { ...aluno, curso: info?.curso, turma: info?.turma, polo: info?.polo, segmento: info?.segmento, temBolsa: info?.temBolsa },
    linha: linha ?? null,
    titulos: cart.titulos.get(studentId) ?? [],
    caso: caso ? { ...caso, responsavel: caso.responsavelUserId ? (resp.get(caso.responsavelUserId) ?? null) : null } : null,
    politica: pol,
    contatoDisponivel: { email: !!dados?.email, telefone: !!dados?.telefone, telegram: !!dados?.telegramChatId },
    contatos, promessas, acordos, encaminhamentos: enc, recebimentos: recebs, bolsas,
    quitacaoAVista: quitacaoAVista ? { valorBase: quitacaoAVista.valorBase, desconto: quitacaoAVista.desconto, descontoPct: quitacaoAVista.descontoPct, total: quitacaoAVista.totalAPagar } : null,
  })
}))

// ---------------------------------------------------------------- casos
router.post('/casos/atribuir', requireRole(...OPERA_COB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(z.object({ studentIds: z.array(z.string()).min(1).max(500), responsavelUserId: z.string().nullable() }), req.body)
  if (b.responsavelUserId) {
    const u = await prisma.user.findFirst({ where: { id: b.responsavelUserId, tenantId }, select: { id: true } })
    if (!u) throw httpErr(404, 'Responsável não encontrado.')
  }
  await sincronizarCasos(tenantId, await montarCarteira(tenantId))
  const r = await prisma.cobCaso.updateMany({ where: { tenantId, studentId: { in: b.studentIds } }, data: { responsavelUserId: b.responsavelUserId } })
  await audit({ tenantId, userId: getUserId(req), modulo: 'cobranca', acao: 'CASOS_ATRIBUIDOS', detalhes: { qtd: r.count, responsavel: b.responsavelUserId } })
  res.json({ atualizados: r.count })
}))

router.get('/responsaveis', requireRole(...OPERA_COB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const us = await prisma.user.findMany({ where: { tenantId: getTenantId(req), role: { in: ['FINANCE', 'ADMIN', 'OWNER'] as any } }, select: { id: true, firstName: true, lastName: true, role: true }, take: 200 })
  res.json({ items: us.map((u) => ({ id: u.id, nome: `${u.firstName} ${u.lastName}`.trim(), papel: u.role })) })
}))

async function casoDoTenant(tenantId: string, id: string) {
  const c = await prisma.cobCaso.findFirst({ where: { id, tenantId } })
  if (!c) throw httpErr(404, 'Caso não encontrado.')
  return c
}

router.patch('/casos/:id', requireRole(...OPERA_COB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const c = await casoDoTenant(tenantId, String(req.params.id))
  const b = parseBody(z.object({ responsavelUserId: z.string().nullable().optional(), observacoes: z.string().max(4000).optional(), naoContatar: z.boolean().optional(), naoContatarMotivo: z.string().max(500).optional() }), req.body)
  if (b.responsavelUserId) {
    const u = await prisma.user.findFirst({ where: { id: b.responsavelUserId, tenantId }, select: { id: true } })
    if (!u) throw httpErr(404, 'Responsável não encontrado.')
  }
  if (b.naoContatar && !b.naoContatarMotivo && !c.naoContatarMotivo) throw httpErr(400, 'Informe o motivo do bloqueio de contato.')
  const u = await prisma.cobCaso.update({ where: { id: c.id }, data: b })
  await audit({ tenantId, userId: getUserId(req), modulo: 'cobranca', acao: 'CASO_ATUALIZADO', refType: 'CobCaso', refId: c.id, detalhes: b })
  res.json(u)
}))

router.post('/casos/:id/pausar', requireRole(...OPERA_COB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const c = await casoDoTenant(tenantId, String(req.params.id))
  const b = parseBody(z.object({ ate: dateISO(), motivo: z.string().min(3).max(300) }), req.body)
  if (b.ate.getTime() <= Date.now()) throw httpErr(422, 'A pausa deve terminar no futuro.')
  if (b.ate.getTime() - Date.now() > 90 * 86_400_000) throw httpErr(422, 'Pausa máxima de 90 dias.')
  const u = await prisma.cobCaso.update({ where: { id: c.id }, data: { pausadoAte: b.ate, pausaMotivo: b.motivo } })
  await audit({ tenantId, userId: getUserId(req), modulo: 'cobranca', acao: 'CASO_PAUSADO', refType: 'CobCaso', refId: c.id, detalhes: b })
  res.json(u)
}))
router.post('/casos/:id/retomar', requireRole(...OPERA_COB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const c = await casoDoTenant(tenantId, String(req.params.id))
  const u = await prisma.cobCaso.update({ where: { id: c.id }, data: { pausadoAte: null, pausaMotivo: null } })
  await audit({ tenantId, userId: getUserId(req), modulo: 'cobranca', acao: 'CASO_RETOMADO', refType: 'CobCaso', refId: c.id })
  res.json(u)
}))

// Opt-out / opt-in de COBRANÇA (LGPD): grava em ComPreferencia (finalidade COBRANCA) — a mesma tabela que o dispatcher consulta.
async function preferencia(req: AuthenticatedRequest, res: Response, consentimento: boolean) {
  const tenantId = getTenantId(req)
  const c = await casoDoTenant(tenantId, String(req.params.id))
  const b = parseBody(z.object({ canal: z.enum(['*', 'SMS', 'WHATSAPP', 'TELEGRAM', 'EMAIL', 'VOZ_IA']).default('*'), motivo: z.string().max(300).optional() }), req.body ?? {})
  const dados = (await contatosDeAlunos(tenantId, [c.studentId])).get(c.studentId)
  if (!dados) throw httpErr(404, 'Aluno sem cadastro de contato.')
  let contatoId = dados.contatoId
  if (!contatoId) {
    const novo = await prisma.comContato.create({ data: { tenantId, nome: dados.nome, tipo: 'ALUNO', studentId: c.studentId, email: dados.email ?? undefined, telefone: dados.telefone ?? undefined } })
    contatoId = novo.id
  }
  const canal = b.canal === '*' ? '*' : tipoComunicacao(b.canal)
  await registrarPreferencia({ tenantId, contatoId, canal, finalidade: 'COBRANCA', consentimento, origem: 'ATENDENTE', motivo: b.motivo })
  await prisma.cobContato.create({ data: { tenantId, casoId: c.id, studentId: c.studentId, tipo: 'NOTA', direcao: 'ENTRADA', canal: b.canal === '*' ? 'SISTEMA' : b.canal, resultado: 'REGISTRADO', observacao: `${consentimento ? 'Opt-in' : 'OPT-OUT'} de cobrança (${b.canal})${b.motivo ? ': ' + b.motivo : ''}`, usuarioId: getUserId(req), baseLegal: 'EXECUCAO_CONTRATO' } })
  await audit({ tenantId, userId: getUserId(req), modulo: 'cobranca', acao: consentimento ? 'OPT_IN_COBRANCA' : 'OPT_OUT_COBRANCA', refType: 'CobCaso', refId: c.id, detalhes: b })
  res.json({ ok: true, contatoId, canal: b.canal, consentimento })
}
router.post('/casos/:id/optout', requireRole(...OPERA_COB), asyncHandler((req: AuthenticatedRequest, res: Response) => preferencia(req, res, false)))
router.post('/casos/:id/optin', requireRole(...OPERA_COB), asyncHandler((req: AuthenticatedRequest, res: Response) => preferencia(req, res, true)))

router.post('/sincronizar', requireRole(...OPERA_COB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  res.json(await sincronizarCasos(tenantId, await montarCarteira(tenantId)))
}))

// ---------------------------------------------------------------- relatórios
router.get('/ranking', requireRole(...LE_PAINEL_COB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const d = qs(req.query.dimensao) ?? 'curso'
  if (!['curso', 'turma', 'polo', 'segmento'].includes(d)) throw httpErr(400, 'dimensao deve ser curso, turma, polo ou segmento.')
  const r = await ranking(getTenantId(req), d as any)
  if (qs(req.query.formato) === 'csv') return enviarCsv(res, `ranking-${d}.csv`, toCsv([{ key: 'posicao', label: '#' }, { key: 'nome', label: d }, { key: 'alunosInadimplentes', label: 'Inadimplentes' }, { key: 'alunosNaCarteira', label: 'Alunos na carteira' }, { key: 'pctAlunos', label: '% alunos' }, { key: 'principal', label: 'Principal vencido' }, { key: 'encargos', label: 'Encargos' }, { key: 'saldo', label: 'Saldo' }, { key: 'carteira', label: 'Carteira 12m' }, { key: 'taxaInadimplencia', label: 'Taxa %' }], r.rows as any))
  res.json(r)
}))

router.get('/recebimentos', requireRole(...OPERA_COB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { de, ate } = intervalo({ de: qs(req.query.de), ate: qs(req.query.ate) }, 30)
  const r = await recebimentos(getTenantId(req), de, ate)
  if (qs(req.query.formato) === 'csv') return enviarCsv(res, 'recebimentos.csv', toCsv([{ key: 'pagoEm', label: 'Pago em' }, { key: 'aluno', label: 'Aluno' }, { key: 'ra', label: 'RA' }, { key: 'descricao', label: 'Título' }, { key: 'vencimento', label: 'Vencimento' }, { key: 'diasAtraso', label: 'Dias de atraso' }, { key: 'valor', label: 'Valor' }, { key: 'viaAcordo', label: 'Via acordo' }], r.titulos as any))
  res.json(r)
}))

// ---------------------------------------------------------------- baixa de título (integração com o contas a receber)
router.get('/pagamentos/calcular', requireRole(...OPERA_COB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const rid = qs(req.query.receivableId)
  if (!rid) throw httpErr(400, 'receivableId é obrigatório.')
  const data = qs(req.query.data) ? new Date(String(qs(req.query.data))) : new Date()
  const c = await calcularPagamento(getTenantId(req), rid, { data, quitacao: bool(qs(req.query.quitacao)) })
  res.json({ receivableId: rid, data, valorOriginal: c.titulo.valor, principalRestante: c.saldo.principalRestante, encargos: c.saldo.encargosDevidos, detalheEncargos: c.saldo.enc, saldo: c.saldo.saldo, desconto: c.desconto, totalAPagar: c.totalAPagar, descontoBloqueadoPorBolsa: c.descontoBloqueadoPorBolsa, temBolsa: c.temBolsa, politica: { id: c.politica.id, nome: c.politica.nome } })
}))

router.post('/pagamentos', requireRole(...OPERA_COB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(z.object({ receivableId: z.string(), valor: z.number().positive().optional(), forma: z.enum(FORMAS as [string, ...string[]]), dataPagamento: dateISO().optional(), quitacao: z.boolean().optional(), observacao: z.string().max(500).optional() }), req.body)
  const r = await registrarPagamentoTitulo({ tenantId, receivableId: b.receivableId, valor: b.valor, forma: b.forma as any, dataPagamento: b.dataPagamento, quitacao: b.quitacao, observacao: b.observacao, usuarioId: getUserId(req) })
  res.status(201).json(r)
}))

// utilitário de simulação de encargos (tela de políticas)
router.post('/calculadora', requireRole(...OPERA_COB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const b = parseBody(z.object({ valor: z.number().positive(), vencimento: dateISO(), dataCalculo: dateISO().optional(), multaPct: z.number().min(0).max(100).default(2), jurosTipo: z.enum(['MENSAL', 'DIARIO']).default('MENSAL'), jurosPct: z.number().min(0).max(100).default(1), jurosComposto: z.boolean().default(false), correcaoPctAnual: z.number().min(0).max(100).default(0), toleranciaDias: z.number().int().min(0).max(60).default(0) }), req.body)
  res.json(calcularEncargos(b.valor, b.vencimento, b.dataCalculo ?? new Date(), b))
}))

export default router
