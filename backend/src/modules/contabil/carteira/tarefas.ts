import type { Request, Router } from 'express'
import {
  CONTADORES, EQUIPE, GESTAO, INTERNO, asArray, clienteOuErro, comp, compAtual, dataIso, dataOpt, diaDoMes, exigir, hojeMeioDia, httpError, idsVisiveis, iso10, pageParams, papelDe, parseBody, prisma, qs,
  restrito, somaDias, somaMeses, tid, txt, txtOpt, uid, z,
} from './common'
import { asyncHandler, auditar, nomesDeUsuarios } from './host'
import { STATUS_ABERTOS_TAREFA } from './calculos'
import { guiasDaCarteira } from './provedores'
import { REGIMES } from './clientes'

export const STATUS_TAREFA = ['A_FAZER', 'EM_ANDAMENTO', 'AGUARDANDO_CLIENTE', 'CONCLUIDA', 'CANCELADA'] as const
export const CATEGORIAS = ['FECHAMENTO', 'OBRIGACAO', 'FOLHA', 'IR', 'OUTRA'] as const
const PRIORIDADES = ['BAIXA', 'NORMAL', 'ALTA', 'URGENTE']

// Modelos padrão. ATENÇÃO: prazos são ilustrativos (dia do mês configurável); confirme o calendário oficial de cada obrigação com o seu contador.
const MODELOS_PADRAO = [
  { nome: 'Fechamento mensal', categoria: 'FECHAMENTO', recorrencia: 'MENSAL', diaPrazo: 10, mesesAdiante: 1, itens: ['Receber/conferir extratos e documentos', 'Classificar lançamentos', 'Conciliar contas', 'Conferir notas emitidas e recebidas', 'Emitir balancete e enviar ao cliente'] },
  { nome: 'Apuração do Simples Nacional (DAS)', categoria: 'OBRIGACAO', regime: 'SIMPLES', recorrencia: 'MENSAL', diaPrazo: 18, mesesAdiante: 1, itens: ['Conferir faturamento do mês', 'Apurar no PGDAS-D', 'Gerar guia DAS', 'Enviar guia ao cliente'] },
  { nome: 'Apuração de impostos (Lucro Presumido)', categoria: 'OBRIGACAO', regime: 'PRESUMIDO', recorrencia: 'MENSAL', diaPrazo: 20, mesesAdiante: 1, itens: ['Apurar PIS/COFINS/ISS', 'Gerar guias', 'Enviar ao cliente'] },
  { nome: 'Apuração de impostos (Lucro Real)', categoria: 'OBRIGACAO', regime: 'REAL', recorrencia: 'MENSAL', diaPrazo: 20, mesesAdiante: 1, itens: ['Apurar PIS/COFINS/IRPJ/CSLL', 'Escriturar livros', 'Gerar guias', 'Enviar ao cliente'] },
  { nome: 'Folha de pagamento', categoria: 'FOLHA', recorrencia: 'MENSAL', diaPrazo: 5, mesesAdiante: 1, itens: ['Receber variáveis (faltas, horas extras)', 'Calcular folha', 'Gerar holerites', 'Gerar guias (INSS/FGTS)', 'Enviar eSocial'] },
  { nome: 'DEFIS / declaração anual do Simples', categoria: 'OBRIGACAO', regime: 'SIMPLES', recorrencia: 'ANUAL', diaPrazo: 31, mesPrazo: 3, mesesAdiante: 0, itens: ['Reunir dados do ano-base', 'Preencher e transmitir', 'Arquivar recibo'] },
  { nome: 'DASN-SIMEI (declaração anual do MEI)', categoria: 'OBRIGACAO', regime: 'MEI', recorrencia: 'ANUAL', diaPrazo: 31, mesPrazo: 5, mesesAdiante: 0, itens: ['Conferir receita bruta do ano', 'Transmitir a DASN-SIMEI', 'Arquivar recibo'] },
  { nome: 'Declaração de Imposto de Renda (pessoa física)', categoria: 'IR', regime: 'PF', recorrencia: 'ANUAL', diaPrazo: 31, mesPrazo: 5, mesesAdiante: 0, itens: ['Coletar informes e recibos', 'Montar a declaração', 'Revisar com o cliente', 'Transmitir e arquivar recibo'] },
  { nome: 'ECF / ECD (escrituração anual)', categoria: 'OBRIGACAO', regime: 'PRESUMIDO', recorrencia: 'ANUAL', diaPrazo: 31, mesPrazo: 7, mesesAdiante: 0, itens: ['Fechar o ano-base', 'Gerar e validar arquivos', 'Transmitir e arquivar recibos'] },
]

const modelo = z.object({
  nome: txt(120).pipe(z.string().min(2)), descricao: txtOpt(400), categoria: z.enum(CATEGORIAS).default('OUTRA'), regime: z.enum(REGIMES).optional().nullable(), segmento: txtOpt(60),
  recorrencia: z.enum(['MENSAL', 'TRIMESTRAL', 'ANUAL']).default('MENSAL'), diaPrazo: z.number().int().min(1).max(31).default(10), mesPrazo: z.number().int().min(1).max(12).optional().nullable(),
  mesesAdiante: z.number().int().min(0).max(12).default(1), itens: z.array(txt(160)).max(30).default([]), ativo: z.boolean().default(true),
})

/** O modelo se aplica à competência? */
export function aplicaNaCompetencia(m: { recorrencia: string; mesPrazo: number | null; mesesAdiante: number }, competencia: string) {
  const mes = Number(competencia.slice(5, 7))
  if (m.recorrencia === 'MENSAL') return true
  if (m.recorrencia === 'TRIMESTRAL') return mes % 3 === 0
  const alvo = (((m.mesPrazo ?? 12) - m.mesesAdiante - 1) % 12 + 12) % 12 + 1
  return mes === alvo
}
const tarefaVisivel = async (req: Request) => { const ids = await idsVisiveis(req); return ids ? { OR: [{ clienteId: { in: ids } }, { responsavelId: uid(req) }] } : {} }

async function tarefaOuErro(req: Request, id: string) {
  const t = await prisma.ctbTarefa.findFirst({ where: { id: String(id), tenantId: tid(req), ...(await tarefaVisivel(req)) } })
  if (!t) throw httpError(404, 'Tarefa não encontrada.')
  return t
}

export async function gerarTarefas(req: Request, competencia: string, clienteId?: string) {
  const tenantId = tid(req)
  const [modelos, clientes] = await Promise.all([
    prisma.ctbTarefaModelo.findMany({ where: { tenantId, ativo: true } }),
    prisma.ctbCliente.findMany({ where: { tenantId, status: 'ATIVO', ...(clienteId ? { id: clienteId } : {}), ...(restrito(req) ? { OR: [{ responsavelId: uid(req) }, { analistaId: uid(req) }] } : {}) } }),
  ])
  const dados: any[] = []
  for (const c of clientes) {
    for (const m of modelos) {
      if (m.regime && m.regime !== c.regime) continue
      if (m.segmento && m.segmento !== c.segmento) continue
      if (!aplicaNaCompetencia(m, competencia)) continue
      const alvo = somaMeses(competencia, m.mesesAdiante)
      dados.push({
        tenantId, clienteId: c.id, modeloId: m.id, titulo: `${m.nome} · ${competencia}`, categoria: m.categoria, competencia, prazo: diaDoMes(alvo, m.diaPrazo),
        responsavelId: c.analistaId ?? c.responsavelId, checklist: asArray<string>(m.itens).map((texto) => ({ texto, feito: false })), criadoPorId: uid(req),
      })
    }
  }
  const r = dados.length ? await prisma.ctbTarefa.createMany({ data: dados, skipDuplicates: true }) : { count: 0 }
  return { competencia, clientes: clientes.length, modelos: modelos.length, candidatas: dados.length, criadas: r.count, jaExistiam: dados.length - r.count }
}

export function registrarTarefas(router: Router) {
  // ---------- modelos ----------
  router.get('/tarefa-modelos', exigir(INTERNO), asyncHandler(async (req, res) => {
    const items = await prisma.ctbTarefaModelo.findMany({ where: { tenantId: tid(req) }, orderBy: [{ categoria: 'asc' }, { nome: 'asc' }] })
    res.json({ items, aviso: 'Os prazos dos modelos são ilustrativos: confirme o calendário oficial de cada obrigação com o seu contador.' })
  }))
  router.post('/tarefa-modelos', exigir(CONTADORES), asyncHandler(async (req, res) => {
    const d = parseBody(modelo, req.body)
    res.status(201).json(await prisma.ctbTarefaModelo.create({ data: { ...(d as any), tenantId: tid(req) } }))
  }))
  router.post('/tarefa-modelos/padrao', exigir(GESTAO), asyncHandler(async (req, res) => {
    const tenantId = tid(req)
    let criados = 0
    for (const m of MODELOS_PADRAO) {
      if (await prisma.ctbTarefaModelo.findFirst({ where: { tenantId, nome: m.nome }, select: { id: true } })) continue
      await prisma.ctbTarefaModelo.create({ data: { ...(m as any), tenantId }, }); criados++
    }
    res.status(201).json({ criados, total: MODELOS_PADRAO.length })
  }))
  router.put('/tarefa-modelos/:id', exigir(CONTADORES), asyncHandler(async (req, res) => {
    const atual = await prisma.ctbTarefaModelo.findFirst({ where: { id: String(req.params.id), tenantId: tid(req) } })
    if (!atual) throw httpError(404, 'Modelo não encontrado.')
    res.json(await prisma.ctbTarefaModelo.update({ where: { id: atual.id }, data: parseBody(modelo.partial(), req.body) as any }))
  }))
  router.delete('/tarefa-modelos/:id', exigir(GESTAO), asyncHandler(async (req, res) => {
    const r = await prisma.ctbTarefaModelo.updateMany({ where: { id: String(req.params.id), tenantId: tid(req) }, data: { ativo: false } })
    if (!r.count) throw httpError(404, 'Modelo não encontrado.')
    res.status(204).end()
  }))

  // ---------- tarefas ----------
  router.post('/tarefas/gerar', exigir(CONTADORES), asyncHandler(async (req, res) => {
    const d = parseBody(z.object({ competencia: comp.default(compAtual()), clienteId: z.string().max(80).optional() }), req.body)
    if (d.clienteId) await clienteOuErro(req, d.clienteId)
    const r = await gerarTarefas(req, d.competencia, d.clienteId)
    await auditar(req, 'TAREFAS_GERADAS', 'CtbTarefa', d.competencia, r)
    res.status(201).json(r)
  }))

  router.get('/tarefas', exigir(INTERNO), asyncHandler(async (req, res) => {
    const tenantId = tid(req)
    const { page, pageSize, skip, take } = pageParams(req.query, 500)
    const where: any = { tenantId, ...(await tarefaVisivel(req)) }
    for (const k of ['status', 'responsavelId', 'clienteId', 'competencia', 'categoria', 'prioridade'] as const) if (qs(req.query[k])) where[k] = qs(req.query[k])
    if (qs(req.query.minhas) === '1') where.responsavelId = uid(req)
    if (qs(req.query.atrasadas) === '1') { where.status = { in: STATUS_ABERTOS_TAREFA }; where.prazo = { lt: hojeMeioDia() } }
    if (qs(req.query.aberta) === '1') where.status = { in: STATUS_ABERTOS_TAREFA }
    if (qs(req.query.q)) where.titulo = { contains: qs(req.query.q), mode: 'insensitive' }
    const [total, rows] = await Promise.all([prisma.ctbTarefa.count({ where }), prisma.ctbTarefa.findMany({ where, orderBy: [{ prazo: 'asc' }, { prioridade: 'desc' }], skip, take })])
    const [clis, nomes] = await Promise.all([prisma.ctbCliente.findMany({ where: { tenantId, id: { in: rows.map((r) => r.clienteId) } }, select: { id: true, nome: true } }), nomesDeUsuarios(tenantId, rows.map((r) => r.responsavelId))])
    const hoje = hojeMeioDia()
    res.json({
      items: rows.map((t) => { const check = asArray<any>(t.checklist); return { ...t, clienteNome: clis.find((c) => c.id === t.clienteId)?.nome ?? null, responsavelNome: t.responsavelId ? nomes.get(t.responsavelId) ?? null : null, atrasada: STATUS_ABERTOS_TAREFA.includes(t.status) && t.prazo < hoje, diasAtraso: STATUS_ABERTOS_TAREFA.includes(t.status) && t.prazo < hoje ? Math.floor((hoje.getTime() - t.prazo.getTime()) / 86_400_000) : 0, progresso: check.length ? Math.round((check.filter((i) => i.feito).length / check.length) * 100) : null } }),
      total, page, pageSize,
    })
  }))

  const checklist = z.array(z.object({ texto: txt(200).pipe(z.string().min(1)), feito: z.boolean().default(false) })).max(40)
  const tarefa = z.object({
    clienteId: z.string().max(80), titulo: txt(160).pipe(z.string().min(2)), categoria: z.enum(CATEGORIAS).default('OUTRA'), competencia: comp.optional().nullable(), prazo: dataIso,
    prioridade: z.enum(PRIORIDADES as [string, ...string[]]).default('NORMAL'), responsavelId: z.string().max(80).optional().nullable(), checklist: checklist.default([]), observacoes: txtOpt(2000),
  })

  router.post('/tarefas', exigir(CONTADORES), asyncHandler(async (req, res) => {
    const d = parseBody(tarefa, req.body)
    await clienteOuErro(req, d.clienteId)
    const t = await prisma.ctbTarefa.create({ data: { ...(d as any), tenantId: tid(req), criadoPorId: uid(req), responsavelId: d.responsavelId ?? uid(req) } })
    await auditar(req, 'TAREFA_CRIADA', 'CtbTarefa', t.id, { clienteId: t.clienteId })
    res.status(201).json(t)
  }))

  router.put('/tarefas/:id', exigir(EQUIPE), asyncHandler(async (req, res) => {
    const atual = await tarefaOuErro(req, String(req.params.id))
    const d = parseBody(tarefa.partial(), req.body)
    if (papelDe(req) === 'ANALISTA_CONTABIL' && (atual.responsavelId !== uid(req) || d.responsavelId !== undefined || d.clienteId !== undefined)) throw httpError(403, 'Analista edita apenas as próprias tarefas e não as reatribui.')
    if (d.clienteId && d.clienteId !== atual.clienteId) await clienteOuErro(req, d.clienteId)
    res.json(await prisma.ctbTarefa.update({ where: { id: atual.id }, data: d as any }))
  }))

  router.patch('/tarefas/:id/status', exigir(EQUIPE), asyncHandler(async (req, res) => {
    const atual = await tarefaOuErro(req, String(req.params.id))
    const d = parseBody(z.object({ status: z.enum(STATUS_TAREFA), forcar: z.boolean().default(false), checklist: checklist.optional() }), req.body)
    if (papelDe(req) === 'ANALISTA_CONTABIL' && atual.responsavelId !== uid(req)) throw httpError(403, 'Analista move apenas as próprias tarefas.')
    const lista = d.checklist ?? asArray<any>(atual.checklist)
    if (d.status === 'CONCLUIDA' && !d.forcar && lista.some((i: any) => !i.feito)) throw httpError(409, 'Há itens do checklist sem marcar. Conclua-os ou confirme a conclusão mesmo assim.', { codigo: 'CHECKLIST_INCOMPLETO' })
    const t = await prisma.ctbTarefa.update({ where: { id: atual.id }, data: { status: d.status, ...(d.checklist ? { checklist: d.checklist as any } : {}), concluidaEm: d.status === 'CONCLUIDA' ? new Date() : null } })
    await auditar(req, 'TAREFA_STATUS', 'CtbTarefa', t.id, { de: atual.status, para: d.status, forcado: d.forcar })
    res.json(t)
  }))

  router.delete('/tarefas/:id', exigir(CONTADORES), asyncHandler(async (req, res) => {
    const t = await tarefaOuErro(req, String(req.params.id))
    await prisma.ctbTarefa.update({ where: { id: t.id }, data: { status: 'CANCELADA' } })
    await auditar(req, 'TAREFA_CANCELADA', 'CtbTarefa', t.id)
    res.status(204).end()
  }))

  // ---------- calendário de obrigações da carteira ----------
  router.get('/calendario', exigir(INTERNO), asyncHandler(async (req, res) => {
    const tenantId = tid(req)
    const mes = comp.parse(qs(req.query.mes) ?? compAtual())
    const [a, m] = mes.split('-').map(Number)
    const ini = new Date(Date.UTC(a, m - 1, 1, 0)), fim = new Date(Date.UTC(a, m, 0, 23, 59, 59))
    const ids = await idsVisiveis(req)
    const clientes = await prisma.ctbCliente.findMany({ where: { tenantId, status: { in: ['ATIVO', 'SUSPENSO'] }, ...(ids ? { id: { in: ids } } : {}) }, select: { id: true, nome: true, empresaId: true, dataAbertura: true, inicioRelacionamento: true } })
    const nomeDe = new Map(clientes.map((c) => [c.id, c.nome]))
    const [tarefas, g] = await Promise.all([
      prisma.ctbTarefa.findMany({ where: { tenantId, prazo: { gte: ini, lte: fim }, status: { not: 'CANCELADA' }, ...(await tarefaVisivel(req)) }, select: { id: true, titulo: true, prazo: true, status: true, clienteId: true, categoria: true } }),
      guiasDaCarteira(tenantId, clientes.map((c) => ({ id: c.id, empresaId: c.empresaId })), { ateVencimento: fim }),
    ])
    const dias: Record<string, { tarefas: any[]; guias: any[]; aniversarios: any[] }> = {}
    const slot = (d: string) => (dias[d] ??= { tarefas: [], guias: [], aniversarios: [] })
    const hoje = hojeMeioDia()
    for (const t of tarefas) slot(iso10(t.prazo)).tarefas.push({ id: t.id, titulo: t.titulo, cliente: nomeDe.get(t.clienteId) ?? '—', status: t.status, categoria: t.categoria, atrasada: STATUS_ABERTOS_TAREFA.includes(t.status) && t.prazo < hoje })
    for (const gu of g.guias) if (gu.vencimento >= ini && gu.vencimento <= fim) slot(iso10(gu.vencimento)).guias.push({ id: gu.id, tipo: gu.tipo, cliente: nomeDe.get(gu.clienteId) ?? '—', valor: gu.valor, status: gu.status })
    for (const c of clientes) {
      if (c.dataAbertura && c.dataAbertura.getUTCMonth() + 1 === m) slot(`${mes}-${String(c.dataAbertura.getUTCDate()).padStart(2, '0')}`).aniversarios.push({ cliente: c.nome, tipo: 'ABERTURA', anos: a - c.dataAbertura.getUTCFullYear() })
      if (c.inicioRelacionamento && c.inicioRelacionamento.getUTCMonth() + 1 === m && c.inicioRelacionamento.getUTCFullYear() < a) slot(`${mes}-${String(c.inicioRelacionamento.getUTCDate()).padStart(2, '0')}`).aniversarios.push({ cliente: c.nome, tipo: 'PARCERIA', anos: a - c.inicioRelacionamento.getUTCFullYear() })
    }
    res.json({ mes, dias, fiscal: { provedor: g.provedor, simulado: g.simulado, degradado: g.degradado } })
  }))
}

/** Alertas operacionais da carteira (usados no dashboard e no sino). */
export async function alertasDaCarteira(req: Request) {
  const tenantId = tid(req)
  const hoje = hojeMeioDia()
  const ids = await idsVisiveis(req)
  const tv = await tarefaVisivel(req)
  const clientes = await prisma.ctbCliente.findMany({ where: { tenantId, status: 'ATIVO', ...(ids ? { id: { in: ids } } : {}) }, select: { id: true, nome: true, empresaId: true, dataAbertura: true } })
  const nomeDe = new Map(clientes.map((c) => [c.id, c.nome]))
  const [atrasadas, hoje_, guias, lembretes, hon] = await Promise.all([
    prisma.ctbTarefa.findMany({ where: { tenantId, status: { in: STATUS_ABERTOS_TAREFA }, prazo: { lt: hoje }, ...tv }, orderBy: { prazo: 'asc' }, take: 50 }),
    prisma.ctbTarefa.count({ where: { tenantId, status: { in: STATUS_ABERTOS_TAREFA }, prazo: { gte: hoje, lt: somaDias(hoje, 1) }, ...tv } }),
    guiasDaCarteira(tenantId, clientes.map((c) => ({ id: c.id, empresaId: c.empresaId })), { status: 'ABERTA', ateVencimento: somaDias(hoje, 7) }),
    prisma.ctbInteracao.findMany({ where: { tenantId, lembreteEm: { lte: somaDias(hoje, 1) }, lembreteFeito: false, ...(ids ? { clienteId: { in: ids } } : {}) }, orderBy: { lembreteEm: 'asc' }, take: 30 }),
    ids === null || ids.length ? prisma.ctbHonorario.count({ where: { tenantId, status: 'ABERTO', vencimento: { lt: hoje }, ...(ids ? { clienteId: { in: ids } } : {}) } }) : 0,
  ])
  const emSete = somaDias(hoje, 7)
  const aniv = clientes.filter((c) => { if (!c.dataAbertura) return false; for (let i = 0; i <= 7; i++) { const d = somaDias(hoje, i); if (d.getUTCMonth() === c.dataAbertura.getUTCMonth() && d.getUTCDate() === c.dataAbertura.getUTCDate()) return true } return false }).map((c) => ({ clienteId: c.id, cliente: c.nome }))
  return {
    tarefasAtrasadas: atrasadas.map((t) => ({ id: t.id, titulo: t.titulo, cliente: nomeDe.get(t.clienteId) ?? null, prazo: t.prazo, diasAtraso: Math.floor((hoje.getTime() - t.prazo.getTime()) / 86_400_000) })),
    tarefasVencemHoje: hoje_,
    guias: { vencidas: guias.guias.filter((g) => g.vencimento < hoje).length, aVencer7d: guias.guias.filter((g) => g.vencimento >= hoje && g.vencimento <= emSete).length, itens: guias.guias.slice(0, 30).map((g) => ({ id: g.id, tipo: g.tipo, cliente: nomeDe.get(g.clienteId) ?? null, vencimento: g.vencimento, valor: g.valor })), fiscal: { provedor: guias.provedor, simulado: guias.simulado, degradado: guias.degradado } },
    lembretes: lembretes.map((l) => ({ id: l.id, clienteId: l.clienteId, cliente: nomeDe.get(l.clienteId) ?? null, assunto: l.assunto, lembreteEm: l.lembreteEm })),
    honorariosAtrasados: hon,
    aniversarios: aniv,
  }
}
