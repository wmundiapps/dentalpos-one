import { Router } from 'express'
import { z } from 'zod'
import { adapter } from '../adapter'
import { empresaDoTenant, mesesDaEmpresa } from '../empresas/service'
import { auditar } from '../nucleo/auditoria'
import { prisma } from '../nucleo/db'
import { kv, paginaHtml } from '../nucleo/html'
import { asyncHandler, httpError, pageParams, parseBody, qs } from '../nucleo/http'
import { ctxDe, exigir } from '../nucleo/rbac'
import { COMPETENCIA_RE, brl, competenciaDe, dia, esc, fmtDoc, hojeMeioDia, iso10, r2, somaMeses, ultimas12 } from '../nucleo/util'
import { classificarCnae } from '../regime/cnae'
import { tabelasVigentes } from '../regime/tabelas'
import { NOME_TRIBUTO, Tributo, calcularGuias, codigosSimulados, encargosAtraso, obrigacoesDoRegime } from './calculo'

const router = Router()
const dataStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use AAAA-MM-DD')
const br = (d: Date) => iso10(d).split('-').reverse().join('/')

const empFiscal = (e: any) => ({ tipoPessoa: e.tipoPessoa, regime: e.regimeAtual, atividade: (e.atividade ?? classificarCnae(e.cnae).atividade) as any, anexoForcado: e.anexoSimples, issAliquotaPct: e.issAliquota })

async function dadosDaCompetencia(tenantId: string, empresaId: string, comp: string) {
  const prev = ultimas12(somaMeses(comp, -1))
  const tri = [somaMeses(comp, -2), somaMeses(comp, -1), comp]
  const todas = await mesesDaEmpresa(tenantId, empresaId, [...new Set([...prev, ...tri, comp])])
  const mes = (c: string) => todas.find((m) => m.competencia === c)!
  const m = mes(comp)
  const anteriores = prev.map(mes)
  return {
    competencia: comp, receita: m.receita, despesas: m.despesas, folha: m.folha, compras: m.compras, irrfRetido: m.irrf,
    rbt12Anterior: r2(anteriores.reduce((a, x) => a + x.receita, 0)), mesesAnterioresComDados: anteriores.filter((x) => x.receita > 0).length,
    folha12Anterior: r2(anteriores.reduce((a, x) => a + x.folha, 0)),
    trimestre: { receita: r2(tri.map(mes).reduce((a, x) => a + x.receita, 0)), despesas: r2(tri.map(mes).reduce((a, x) => a + x.despesas, 0)) },
  }
}

function aviso(venc: Date, status: string, hoje: Date) {
  const dias = Math.round((venc.getTime() - hoje.getTime()) / 86_400_000)
  if (status === 'PAGA') return { dias, nivel: null as string | null, texto: 'Paga' }
  if (dias < 0) return { dias, nivel: 'critico', texto: `Vencida há ${-dias} dia(s)` }
  if (dias === 0) return { dias, nivel: 'critico', texto: 'Vence hoje' }
  if (dias <= 3) return { dias, nivel: 'critico', texto: `Vence em ${dias} dia(s)` }
  if (dias <= 7) return { dias, nivel: 'atencao', texto: `Vence em ${dias} dias` }
  return { dias, nivel: 'info', texto: `Vence em ${dias} dias` }
}

const guiaOut = (g: any, hoje = hojeMeioDia()) => {
  const s = g.status === 'PENDENTE' && g.vencimento < hoje ? 'ATRASADA' : g.status
  return { ...g, situacao: s, aviso: aviso(g.vencimento, g.status, hoje), nomeTributo: NOME_TRIBUTO[g.tributo as Tributo] ?? g.tributo }
}

router.get('/guias', asyncHandler(async (req, res) => {
  const c = ctxDe(req)
  const { page, pageSize, skip, take } = pageParams(req.query)
  const where: any = { tenantId: c.tenantId }
  for (const k of ['empresaId', 'tributo', 'competencia', 'tipoGuia'] as const) if (qs(req.query[k])) where[k] = qs(req.query[k])
  const st = qs(req.query.status), hoje = hojeMeioDia()
  if (st === 'ATRASADA') { where.status = 'PENDENTE'; where.vencimento = { lt: hoje } }
  else if (st === 'PENDENTE') { where.status = 'PENDENTE' } else if (st === 'PAGA' || st === 'CANCELADA') where.status = st
  const [total, items, soma] = await Promise.all([prisma.ctbGuia.count({ where }), prisma.ctbGuia.findMany({ where, orderBy: [{ vencimento: 'asc' }, { tributo: 'asc' }], skip, take }), prisma.ctbGuia.aggregate({ where, _sum: { valorTotal: true } })])
  res.json({ total, page, pageSize, somaTotal: r2(soma._sum.valorTotal ?? 0), items: items.map((g) => guiaOut(g, hoje)) })
}))

router.get('/guias/:id', asyncHandler(async (req, res, next) => {
  if (['relatorio', 'calendario'].includes(String(req.params.id))) return next('route')
  const c = ctxDe(req)
  const g = await prisma.ctbGuia.findFirst({ where: { id: String(req.params.id), tenantId: c.tenantId } })
  if (!g) throw httpError(404, 'Guia não encontrada.')
  res.json(guiaOut(g))
}))

/** Gera (simula) as guias de uma competência a partir dos lançamentos contábeis/histórico. Idempotente por empresa+tributo+competência. */
router.post('/guias/gerar', exigir('guia.gerar'), asyncHandler(async (req, res) => {
  const c = ctxDe(req)
  const b = parseBody(z.object({ empresaId: z.string().min(1), competencia: z.string().regex(COMPETENCIA_RE, 'use AAAA-MM'), recalcular: z.boolean().default(false) }), req.body)
  const e = await empresaDoTenant(c.tenantId, b.empresaId)
  if (b.competencia > somaMeses(competenciaDe(new Date()), 1)) throw httpError(400, 'Competência futura demais para gerar guias.')
  const t = tabelasVigentes(new Date(b.competencia + '-15'))
  const dados = await dadosDaCompetencia(c.tenantId, e.id, b.competencia)
  const calc = calcularGuias(empFiscal(e), dados, t)
  const hoje = hojeMeioDia()
  const criadas: any[] = [], atualizadas: any[] = [], mantidas: any[] = []
  for (const g of calc) {
    const existente = await prisma.ctbGuia.findFirst({ where: { tenantId: c.tenantId, empresaId: e.id, tributo: g.tributo, competencia: g.competencia, status: { not: 'CANCELADA' } } })
    const enc = encargosAtraso(g.valorPrincipal, g.vencimento, hoje, t)
    const cods = codigosSimulados(`${c.tenantId}|${e.id}|${g.tributo}|${g.competencia}|${g.valorPrincipal}`)
    const dadosGuia = { tributo: g.tributo, tipoGuia: g.tipoGuia, codigoReceita: g.codigoReceita, competencia: g.competencia, periodicidade: g.periodicidade, vencimento: g.vencimento, baseCalculo: r2(g.baseCalculo), aliquota: g.aliquota, valorPrincipal: g.valorPrincipal, multa: enc.multa, juros: enc.juros, valorTotal: r2(g.valorPrincipal + enc.multa + enc.juros), ...cods, memoria: { passos: g.memoria, aviso: 'SIMULAÇÃO: estimativa; códigos de receita e alíquotas de referência — conferir com o contador.', dados } as any, simulacao: true, versaoTabelas: t.versao }
    if (!existente) { criadas.push(await prisma.ctbGuia.create({ data: { ...dadosGuia, tenantId: c.tenantId, empresaId: e.id, criadoPorId: c.userId } })) }
    else if (existente.status === 'PENDENTE' && b.recalcular) { atualizadas.push(await prisma.ctbGuia.update({ where: { id: existente.id }, data: dadosGuia })) }
    else mantidas.push(existente)
  }
  await auditar(c, 'guia.gerar', { empresaId: e.id, detalhes: { competencia: b.competencia, criadas: criadas.map((g) => `${g.tributo}:${g.valorTotal}`), atualizadas: atualizadas.length, mantidas: mantidas.length, versaoTabelas: t.versao } })
  res.status(201).json({ competencia: b.competencia, criadas: criadas.map((g) => guiaOut(g, hoje)), atualizadas: atualizadas.map((g) => guiaOut(g, hoje)), mantidas: mantidas.map((g) => guiaOut(g, hoje)), simulacao: true, aviso: 'Guias SIMULADAS: não são documentos oficiais e não podem ser pagas. Valide com seu contador antes de emitir a guia real.' })
}))

router.post('/guias/:id/pagar', exigir('guia.pagar'), asyncHandler(async (req, res) => {
  const c = ctxDe(req)
  const b = parseBody(z.object({ pagoEm: dataStr.optional(), valorPago: z.number().positive().max(1e10).optional() }), req.body ?? {})
  const g = await prisma.ctbGuia.findFirst({ where: { id: String(req.params.id), tenantId: c.tenantId } })
  if (!g) throw httpError(404, 'Guia não encontrada.')
  const pagoEm = dia(b.pagoEm ?? iso10(new Date()))
  const enc = encargosAtraso(g.valorPrincipal, g.vencimento, pagoEm, tabelasVigentes(pagoEm))
  const valor = r2(b.valorPago ?? g.valorPrincipal + enc.multa + enc.juros)
  const u = await prisma.ctbGuia.updateMany({ where: { id: g.id, tenantId: c.tenantId, status: 'PENDENTE' }, data: { status: 'PAGA', pagoEm, valorPago: valor, multa: enc.multa, juros: enc.juros, valorTotal: r2(g.valorPrincipal + enc.multa + enc.juros) } })
  if (u.count !== 1) throw httpError(409, 'Esta guia não está pendente (já foi paga ou cancelada).')
  await auditar(c, 'guia.pagar', { entidade: 'CtbGuia', entidadeId: g.id, empresaId: g.empresaId, detalhes: { tributo: g.tributo, competencia: g.competencia, valorPago: valor, multa: enc.multa, juros: enc.juros } })
  res.json(guiaOut(await prisma.ctbGuia.findUniqueOrThrow({ where: { id: g.id } })))
}))

router.post('/guias/:id/cancelar', exigir('guia.gerar'), asyncHandler(async (req, res) => {
  const c = ctxDe(req)
  const b = parseBody(z.object({ motivo: z.string().trim().min(10).max(300) }), req.body)
  const g = await prisma.ctbGuia.findFirst({ where: { id: String(req.params.id), tenantId: c.tenantId } })
  if (!g) throw httpError(404, 'Guia não encontrada.')
  const u = await prisma.ctbGuia.updateMany({ where: { id: g.id, tenantId: c.tenantId, status: 'PENDENTE' }, data: { status: 'CANCELADA' } })
  if (u.count !== 1) throw httpError(409, 'Só guias pendentes podem ser canceladas.')
  await auditar(c, 'guia.cancelar', { entidade: 'CtbGuia', entidadeId: g.id, empresaId: g.empresaId, detalhes: { tributo: g.tributo, competencia: g.competencia, motivo: b.motivo } })
  res.json({ ok: true })
}))

// ---------------- calendário de obrigações ----------------
router.get('/calendario', asyncHandler(async (req, res) => {
  const c = ctxDe(req)
  const hoje = hojeMeioDia()
  const de = dia(qs(req.query.de) ?? iso10(new Date(hoje.getTime() - 30 * 86_400_000)))
  const ate = dia(qs(req.query.ate) ?? iso10(new Date(hoje.getTime() + 60 * 86_400_000)))
  if (ate.getTime() - de.getTime() > 400 * 86_400_000) throw httpError(400, 'Intervalo máximo de 400 dias.')
  const empresaId = qs(req.query.empresaId)
  const empresas = await prisma.ctbEmpresa.findMany({ where: { tenantId: c.tenantId, ativo: true, ...(empresaId ? { id: empresaId } : {}) }, take: 200 })
  const t = tabelasVigentes(hoje)
  const comps: string[] = []
  for (let x = somaMeses(competenciaDe(de), -3); x <= competenciaDe(ate); x = somaMeses(x, 1)) comps.push(x)
  const guias = await prisma.ctbGuia.findMany({ where: { tenantId: c.tenantId, empresaId: { in: empresas.map((e) => e.id) }, status: { not: 'CANCELADA' }, competencia: { in: comps } } })
  const items: any[] = []
  for (const e of empresas) {
    const meses = await mesesDaEmpresa(c.tenantId, e.id, comps)
    const folhaRecente = meses.some((m) => m.folha > 0), irrf = meses.some((m) => m.irrf > 0)
    const fiscal = empFiscal(e)
    for (const comp of comps) {
      const m = meses.find((x) => x.competencia === comp)!
      for (const o of obrigacoesDoRegime(fiscal, comp, t, { temFolha: (m?.folha ?? 0) > 0 || (folhaRecente && comp > somaMeses(competenciaDe(hoje), -3)), temIrrf: (m?.irrf ?? 0) > 0 })) {
        if (o.vencimento < de || o.vencimento > ate) continue
        const g = guias.find((x) => x.empresaId === e.id && x.tributo === o.tributo && x.competencia === comp)
        // Competência sem nenhum movimento e sem guia: não é uma obrigação "a gerar" (evita ruído).
        if (!g && !(m && (m.receita > 0 || m.folha > 0 || m.irrf > 0)) && o.tributo !== 'DAS_MEI') continue
        const status = g ? (g.status === 'PAGA' ? 'PAGA' : g.vencimento < hoje ? 'ATRASADA' : 'PENDENTE') : (o.vencimento < hoje ? 'ATRASADA' : 'A_GERAR')
        const a = aviso(g?.vencimento ?? o.vencimento, status === 'PAGA' ? 'PAGA' : 'PENDENTE', hoje)
        items.push({ empresaId: e.id, empresa: e.razaoSocial, tributo: o.tributo, nomeTributo: NOME_TRIBUTO[o.tributo], tipoGuia: o.tipoGuia, competencia: comp, periodicidade: o.periodicidade, vencimento: g?.vencimento ?? o.vencimento, status, guiaId: g?.id ?? null, valor: g?.valorTotal ?? null, diasParaVencer: a.dias, nivel: a.nivel, aviso: status === 'A_GERAR' && a.nivel ? `Guia ainda não gerada — ${a.texto.toLowerCase()}` : a.texto })
      }
    }
  }
  items.sort((a, b) => +a.vencimento - +b.vencimento || a.empresa.localeCompare(b.empresa))
  res.json({ de: iso10(de), ate: iso10(ate), total: items.length, resumo: { atrasadas: items.filter((i) => i.status === 'ATRASADA').length, proximos7dias: items.filter((i) => i.status !== 'PAGA' && i.diasParaVencer >= 0 && i.diasParaVencer <= 7).length, aGerar: items.filter((i) => i.status === 'A_GERAR').length, pagas: items.filter((i) => i.status === 'PAGA').length }, items, simulacao: true, aviso: 'Vencimentos calculados por regras de referência (dia útil anterior, feriados nacionais fixos). Confira no calendário oficial e com o contador.' })
}))

// ---------------- impressão ----------------
router.get('/guias/:id/imprimir', asyncHandler(async (req, res) => {
  const c = ctxDe(req)
  const g = await prisma.ctbGuia.findFirst({ where: { id: String(req.params.id), tenantId: c.tenantId } })
  if (!g) throw httpError(404, 'Guia não encontrada.')
  const e = await empresaDoTenant(c.tenantId, g.empresaId)
  const passos: string[] = Array.isArray((g.memoria as any)?.passos) ? (g.memoria as any).passos : []
  const corpo = `
    <p style="border:2px solid #b00020;padding:8px;color:#b00020;font-weight:700">GUIA SIMULADA — NÃO É UM DOCUMENTO OFICIAL E NÃO PODE SER PAGA. Gere a guia real no sistema oficial (ou com seu contador) após validar os valores.</p>
    ${kv([['Contribuinte', `${e.razaoSocial} (${fmtDoc(e.documento)})`], ['Tributo', NOME_TRIBUTO[g.tributo as Tributo] ?? g.tributo], ['Tipo de guia', g.tipoGuia], ['Código de receita (referência)', g.codigoReceita], ['Competência', g.competencia + (g.periodicidade === 'TRIMESTRAL' ? ' (trimestre)' : '')], ['Vencimento', br(g.vencimento)], ['Situação', g.status]])}
    <h2>Valores</h2>
    <table><tr><th>Base de cálculo</th><th class="n">Alíquota</th><th class="n">Principal</th><th class="n">Multa</th><th class="n">Juros</th><th class="n">Total</th></tr>
    <tr><td>${brl(g.baseCalculo)}</td><td class="n">${g.aliquota != null ? g.aliquota.toLocaleString('pt-BR') + '%' : '—'}</td><td class="n">${brl(g.valorPrincipal)}</td><td class="n">${brl(g.multa)}</td><td class="n">${brl(g.juros)}</td><th class="n">${brl(g.valorTotal)}</th></tr></table>
    <h2>Código de barras / linha digitável (FICTÍCIOS)</h2>
    <div class="barras"></div><p class="mono">${esc(g.linhaDigitavel)}</p><p class="mono" style="color:#777">${esc(g.codigoBarras)}</p>
    <h2>Memória de cálculo</h2><ol>${passos.map((p) => `<li>${esc(p)}</li>`).join('') || '<li>—</li>'}</ol>
    <p style="color:#666;font-size:12px">Tabelas: versão ${esc(g.versaoTabelas)} (referência — conferir). Multa/juros de atraso são estimativas.</p>`
  res.type('html').send(paginaHtml(`Guia simulada — ${NOME_TRIBUTO[g.tributo as Tributo] ?? g.tributo} ${g.competencia}`, corpo, { instituicao: await adapter().nomeInstituicao(c.tenantId), simulacao: true, subtitulo: e.razaoSocial }))
}))

router.get('/guias-relatorio', asyncHandler(async (req, res) => {
  const c = ctxDe(req)
  const comp = qs(req.query.competencia)
  if (comp && !COMPETENCIA_RE.test(comp)) throw httpError(400, 'Competência inválida (AAAA-MM).')
  const where: any = { tenantId: c.tenantId, status: { not: 'CANCELADA' } }
  if (qs(req.query.empresaId)) { await empresaDoTenant(c.tenantId, qs(req.query.empresaId)!); where.empresaId = qs(req.query.empresaId) }
  if (comp) where.competencia = comp
  const hoje = hojeMeioDia()
  const guias = await prisma.ctbGuia.findMany({ where, orderBy: [{ vencimento: 'asc' }], take: 1000 })
  const empresas = await prisma.ctbEmpresa.findMany({ where: { tenantId: c.tenantId, id: { in: [...new Set(guias.map((g) => g.empresaId))] } } })
  const nome = (id: string) => empresas.find((e) => e.id === id)?.razaoSocial ?? id
  const linhas = guias.map((g) => ({ ...guiaOut(g, hoje), empresa: nome(g.empresaId) }))
  if (qs(req.query.formato) === 'json') return res.json({ competencia: comp ?? null, total: linhas.length, totalValor: r2(guias.reduce((a, g) => a + g.valorTotal, 0)), items: linhas })
  const tot = (s: string) => r2(guias.filter((g) => (s === 'ATRASADA' ? g.status === 'PENDENTE' && g.vencimento < hoje : g.status === s)).reduce((a, g) => a + g.valorTotal, 0))
  const corpo = `${kv([['Competência', comp ?? 'todas'], ['Guias', linhas.length], ['Pendentes', brl(tot('PENDENTE'))], ['Atrasadas', brl(tot('ATRASADA'))], ['Pagas', brl(tot('PAGA'))]])}
    <table><tr><th>Empresa</th><th>Tributo</th><th>Competência</th><th>Vencimento</th><th>Situação</th><th class="n">Valor</th></tr>
    ${linhas.map((l) => `<tr><td>${esc(l.empresa)}</td><td>${esc(l.nomeTributo)}</td><td>${esc(l.competencia)}</td><td>${br(l.vencimento)}</td><td>${esc(l.situacao)}</td><td class="n">${brl(l.valorTotal)}</td></tr>`).join('') || '<tr><td colspan="6">Nenhuma guia.</td></tr>'}</table>
    <p style="color:#666;font-size:12px">Todas as guias deste relatório são SIMULAÇÕES (estimativas).</p>`
  res.type('html').send(paginaHtml('Relatório de guias e obrigações', corpo, { instituicao: await adapter().nomeInstituicao(c.tenantId), simulacao: true, subtitulo: comp ?? 'todas as competências' }))
}))

export default router
