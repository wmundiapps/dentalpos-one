import { Router, Response } from 'express'
import { z } from 'zod'
import { createHash } from 'crypto'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, requireRole } from '../academico/middleware'
import { dateISO, pageParams, parseBody, qs } from '../core/crud'
import { CONFERE, LEITURA, OPERA, dia, getConfig, httpError, log, papelDe, r2, tid, uid } from './common'
import { contaDoTenant, lancarMovimento, saldoDaConta } from './contas'
import { ExtratoLido, decodificar, hashesDasLinhas, lerExtrato, similaridade } from './extratoParser'
import { receberRecebivel } from './recebiveis'
import { baixarTitulo, eventoTitulo } from './titulos'

const DIA = 86_400_000
export interface Candidato { tipo: 'TITULO' | 'RECEBIMENTO' | 'MOVIMENTO' | 'RECEBIVEL'; id: string; score: number; descricao: string; valor: number; data: Date | null; motivos: string[] }

/** Pontua candidatos de pareamento para uma linha do extrato. Quanto maior (0..1), mais provável. */
export async function sugerirCandidatos(tenantId: string, item: { id: string; contaId: string; data: Date; valor: number; descricao: string; documento?: string | null }, tolerancia: number): Promise<Candidato[]> {
  const abs = Math.abs(item.valor)
  const faixaValor = { gte: abs - 0.005, lte: abs + 0.005 }
  const cands: Candidato[] = []
  const dist = (d: Date | null) => (d ? Math.abs(item.data.getTime() - d.getTime()) / DIA : 99)
  const pontuarData = (d: Date | null) => { const x = dist(d); return x <= tolerancia ? 1 - x / (tolerancia + 1) : 0 }
  const texto = `${item.descricao} ${item.documento ?? ''}`.toLowerCase()

  if (item.valor < 0) {
    const ts = await prisma.tesTitulo.findMany({ where: { tenantId, status: { in: ['ENVIADO_BANCO', 'PAGO'] }, extratoItemId: null, valorLiquido: faixaValor, OR: [{ pagoContaId: item.contaId }, { contaBancariaId: item.contaId }] }, take: 50 })
    for (const t of ts) {
      const ref = t.pagoEm ?? t.vencimento
      const motivos = ['valor igual']
      let s = 0.5
      const pd = pontuarData(ref)
      if (pd > 0) { s += 0.3 * pd; motivos.push('data próxima') }
      const sim = similaridade(item.descricao, t.fornecedor)
      if (sim > 0) { s += 0.2 * sim; motivos.push('nome do favorecido') }
      if (texto.includes(t.numero.toLowerCase())) { s += 0.2; motivos.push('número do título') }
      cands.push({ tipo: 'TITULO', id: t.id, score: Math.min(1, r2(s)), descricao: `${t.numero} — ${t.fornecedor}`, valor: -t.valorLiquido, data: ref, motivos })
    }
  } else {
    const rs = await prisma.tesRecebimento.findMany({ where: { tenantId, contaId: item.contaId, conciliado: false, valorRecebido: faixaValor }, take: 50 })
    const alunos = rs.length ? await prisma.student.findMany({ where: { tenantId, id: { in: rs.map((r) => r.studentId).filter(Boolean) as string[] } }, select: { id: true, nomeCompleto: true } }) : []
    for (const r of rs) {
      const nome = alunos.find((a) => a.id === r.studentId)?.nomeCompleto ?? ''
      const motivos = ['valor igual']
      let s = 0.5
      const pd = pontuarData(r.data)
      if (pd > 0) { s += 0.3 * pd; motivos.push('data próxima') }
      const sim = similaridade(item.descricao, nome)
      if (sim > 0) { s += 0.2 * sim; motivos.push('nome do pagador') }
      cands.push({ tipo: 'RECEBIMENTO', id: r.id, score: Math.min(1, r2(s)), descricao: `Recebimento ${nome || r.receivableId}`, valor: r.valorRecebido, data: r.data, motivos })
    }
    // Mensalidades em aberto de mesmo valor (ainda não baixadas no sistema): sugere baixar + conciliar.
    const recs = await prisma.accountReceivable.findMany({ where: { tenantId, status: { in: ['PENDENTE', 'ATRASADO'] } }, take: 3000 })
    const ajustes = recs.length ? await prisma.tesRecebivelAjuste.findMany({ where: { tenantId, receivableId: { in: recs.map((r) => r.id) } } }) : []
    const mAj = new Map(ajustes.map((a) => [a.receivableId, a.valorLiquido]))
    const iguais = recs.filter((r) => Math.abs((mAj.get(r.id) ?? r.valor) - abs) < 0.005)
    if (iguais.length) {
      const alunos2 = await prisma.student.findMany({ where: { tenantId, id: { in: Array.from(new Set(iguais.map((r) => r.studentId))) } }, select: { id: true, nomeCompleto: true, ra: true } })
      for (const r of iguais.slice(0, 40)) {
        const al = alunos2.find((a) => a.id === r.studentId)
        const sim = similaridade(item.descricao, al?.nomeCompleto ?? '')
        const raNoTexto = al?.ra && texto.includes(al.ra.toLowerCase())
        const motivos = ['valor igual à mensalidade em aberto']
        let s = 0.35
        const pd = pontuarData(r.dataVencimento)
        if (pd > 0) { s += 0.1 * pd; motivos.push('próximo do vencimento') }
        if (sim > 0) { s += 0.45 * sim; motivos.push('nome do aluno') }
        if (raNoTexto) { s += 0.3; motivos.push('RA no histórico') }
        cands.push({ tipo: 'RECEBIVEL', id: r.id, score: Math.min(1, r2(s)), descricao: `${r.descricao} — ${al?.nomeCompleto ?? r.studentId}`, valor: abs, data: r.dataVencimento, motivos })
      }
    }
  }
  // Movimentos internos (transferências, tarifas, ajustes) ainda não conciliados
  const ms = await prisma.tesMovimento.findMany({ where: { tenantId, contaId: item.contaId, conciliado: false, valor: item.valor < 0 ? { gte: item.valor - 0.005, lte: item.valor + 0.005 } : faixaValor, NOT: { refTipo: { in: ['TITULO', 'RECEBIVEL'] } } }, take: 20 })
  for (const m of ms) {
    const motivos = ['valor igual']
    let s = 0.5
    const pd = pontuarData(m.data)
    if (pd > 0) { s += 0.3 * pd; motivos.push('data próxima') }
    const sim = similaridade(item.descricao, m.descricao)
    if (sim > 0) { s += 0.2 * sim; motivos.push('histórico parecido') }
    cands.push({ tipo: 'MOVIMENTO', id: m.id, score: Math.min(1, r2(s)), descricao: `${m.tipo} — ${m.descricao}`, valor: m.valor, data: m.data, motivos })
  }
  return cands.sort((a, b) => b.score - a.score).slice(0, 8)
}

/** Aplica o pareamento. Para títulos em ENVIADO_BANCO, a conciliação confirma o pagamento (baixa) antes de conciliar. */
export async function aplicarConciliacao(req: AuthenticatedRequest, itemId: string, alvo: { tipo: Candidato['tipo'] | 'NOVO_MOVIMENTO'; id?: string; movimentoTipo?: 'TARIFA' | 'RENDIMENTO' | 'AJUSTE'; forma?: string }, metodo: 'AUTO' | 'MANUAL', score?: number) {
  const tenantId = tid(req)
  const item = await prisma.tesExtratoItem.findFirst({ where: { id: itemId, tenantId } })
  if (!item) throw httpError(404, 'Linha do extrato não encontrada.')
  if (item.status !== 'PENDENTE') throw httpError(409, `Linha já está ${item.status}.`)
  const claim = await prisma.tesExtratoItem.updateMany({ where: { id: itemId, tenantId, status: 'PENDENTE' }, data: { status: 'CONCILIADO', metodo, score, conciliadoPorId: uid(req), conciliadoEm: new Date() } })
  if (claim.count === 0) throw httpError(409, 'Linha já foi conciliada por outra pessoa.')
  try {
    let matchTipo: string = alvo.tipo, matchId = alvo.id ?? ''
    if (alvo.tipo === 'TITULO') {
      const t = await prisma.tesTitulo.findFirst({ where: { id: alvo.id, tenantId } })
      if (!t) throw httpError(404, 'Título não encontrado.')
      if (item.valor >= 0) throw httpError(409, 'Título (saída) não pode ser conciliado com crédito.')
      if (Math.abs(t.valorLiquido + item.valor) > 0.009) throw httpError(409, `Valor do título (${t.valorLiquido}) difere do extrato (${Math.abs(item.valor)}).`, { code: 'VALOR_DIVERGENTE' })
      if (t.extratoItemId) throw httpError(409, 'Título já conciliado.')
      if (t.status === 'ENVIADO_BANCO') await baixarTitulo({ tenantId, id: t.id, contaId: item.contaId, data: item.data, userId: uid(req), papel: papelDe(req), comprovante: `extrato:${item.documento ?? item.id}`, via: 'CONCILIACAO' })
      else if (t.status !== 'PAGO') throw httpError(409, `Título ${t.numero} está ${t.status}: só títulos PAGOS ou ENVIADOS AO BANCO podem ser conciliados.`)
      const u = await prisma.tesTitulo.updateMany({ where: { id: t.id, tenantId, status: 'PAGO', extratoItemId: null }, data: { status: 'CONCILIADO', conciliadoEm: new Date(), extratoItemId: item.id } })
      if (u.count === 0) throw httpError(409, 'Título já conciliado.')
      await prisma.tesMovimento.updateMany({ where: { tenantId, refTipo: 'TITULO', refId: t.id }, data: { conciliado: true, extratoItemId: item.id } })
      await eventoTitulo(prisma, { tenantId, tituloId: t.id, acao: 'CONCILIADO', de: 'PAGO', para: 'CONCILIADO', userId: uid(req), papel: papelDe(req), detalhe: { extratoItemId: item.id, metodo, score } })
    } else if (alvo.tipo === 'RECEBIMENTO') {
      const r = await prisma.tesRecebimento.findFirst({ where: { id: alvo.id, tenantId } })
      if (!r) throw httpError(404, 'Recebimento não encontrado.')
      if (r.conciliado) throw httpError(409, 'Recebimento já conciliado.')
      if (item.valor <= 0 || Math.abs(r.valorRecebido - item.valor) > 0.009) throw httpError(409, 'Valor do recebimento difere do extrato.', { code: 'VALOR_DIVERGENTE' })
      await prisma.tesRecebimento.update({ where: { id: r.id }, data: { conciliado: true } })
      if (r.movimentoId) await prisma.tesMovimento.update({ where: { id: r.movimentoId }, data: { conciliado: true, extratoItemId: item.id } })
    } else if (alvo.tipo === 'RECEBIVEL') {
      if (item.valor <= 0) throw httpError(409, 'Recebível só pode ser conciliado com crédito.')
      const out = await receberRecebivel(req, alvo.id!, { forma: alvo.forma || 'PIX', contaId: item.contaId, data: item.data, permutaId: undefined, observacao: `Baixa por conciliação bancária (${item.documento ?? item.id})` })
      const recb = out.recebimento
      if (Math.abs(recb.valorRecebido - item.valor) > 0.009) {
        throw httpError(409, `Valor devido (${recb.valorRecebido}) difere do crédito (${item.valor}).`, { code: 'VALOR_DIVERGENTE' })
      }
      await prisma.tesRecebimento.update({ where: { id: recb.id }, data: { conciliado: true } })
      if (recb.movimentoId) await prisma.tesMovimento.update({ where: { id: recb.movimentoId }, data: { conciliado: true, extratoItemId: item.id } })
      matchTipo = 'RECEBIMENTO'; matchId = recb.id
    } else if (alvo.tipo === 'MOVIMENTO') {
      const m = await prisma.tesMovimento.findFirst({ where: { id: alvo.id, tenantId, contaId: item.contaId } })
      if (!m) throw httpError(404, 'Movimento não encontrado.')
      if (m.conciliado) throw httpError(409, 'Movimento já conciliado.')
      if (Math.abs(m.valor - item.valor) > 0.009) throw httpError(409, 'Valor do movimento difere do extrato.', { code: 'VALOR_DIVERGENTE' })
      await prisma.tesMovimento.update({ where: { id: m.id }, data: { conciliado: true, extratoItemId: item.id } })
    } else if (alvo.tipo === 'NOVO_MOVIMENTO') {
      const tipo = alvo.movimentoTipo ?? (item.valor < 0 ? 'TARIFA' : 'RENDIMENTO')
      const m = await lancarMovimento({ tenantId, contaId: item.contaId, data: item.data, valor: item.valor, tipo, descricao: item.descricao, userId: uid(req) })
      await prisma.tesMovimento.update({ where: { id: m.id }, data: { conciliado: true, extratoItemId: item.id } })
      matchTipo = 'MOVIMENTO'; matchId = m.id
    }
    const done = await prisma.tesExtratoItem.update({ where: { id: itemId }, data: { matchTipo, matchId } })
    await log(req, 'CONCILIACAO', 'TesExtratoItem', itemId, { matchTipo, matchId, metodo, score })
    return done
  } catch (e) {
    await prisma.tesExtratoItem.update({ where: { id: itemId }, data: { status: 'PENDENTE', metodo: null, score: null, conciliadoPorId: null, conciliadoEm: null, matchTipo: null, matchId: null } })
    throw e
  }
}

async function desfazer(req: AuthenticatedRequest, itemId: string) {
  const tenantId = tid(req)
  const item = await prisma.tesExtratoItem.findFirst({ where: { id: itemId, tenantId } })
  if (!item) throw httpError(404, 'Linha do extrato não encontrada.')
  if (item.status !== 'CONCILIADO' && item.status !== 'IGNORADO') throw httpError(409, 'Linha não está conciliada.')
  if (item.matchTipo === 'TITULO' && item.matchId) {
    await prisma.tesTitulo.updateMany({ where: { id: item.matchId, tenantId, status: 'CONCILIADO' }, data: { status: 'PAGO', conciliadoEm: null, extratoItemId: null } })
    await eventoTitulo(prisma, { tenantId, tituloId: item.matchId, acao: 'CONCILIACAO_DESFEITA', de: 'CONCILIADO', para: 'PAGO', userId: uid(req), papel: papelDe(req) })
  }
  if (item.matchTipo === 'RECEBIMENTO' && item.matchId) await prisma.tesRecebimento.updateMany({ where: { id: item.matchId, tenantId }, data: { conciliado: false } })
  await prisma.tesMovimento.updateMany({ where: { tenantId, extratoItemId: item.id }, data: { conciliado: false, extratoItemId: null } })
  const r = await prisma.tesExtratoItem.update({ where: { id: itemId }, data: { status: 'PENDENTE', matchTipo: null, matchId: null, metodo: null, score: null, conciliadoPorId: null, conciliadoEm: null } })
  await log(req, 'CONCILIACAO_DESFEITA', 'TesExtratoItem', itemId, { matchTipo: item.matchTipo })
  return r
}

const importSchema = z.object({
  contaId: z.string().min(1), conteudo: z.string().min(10).max(8_000_000).optional(), conteudoBase64: z.string().max(11_000_000).optional(),
  formato: z.enum(['OFX', 'CSV']).optional(), nomeArquivo: z.string().max(200).optional(), autoConciliar: z.boolean().default(false),
})

export function mountConciliacao(router: Router) {
  router.post('/extratos/importar', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const d = parseBody(importSchema, req.body)
    const conta = await contaDoTenant(tenantId, d.contaId)
    const texto = d.conteudo ?? (d.conteudoBase64 ? decodificar(Buffer.from(d.conteudoBase64, 'base64')) : '')
    if (!texto) throw httpError(400, 'Envie o arquivo em conteudo (texto) ou conteudoBase64.')
    let lido: ExtratoLido
    try { lido = lerExtrato(texto, d.formato) } catch (e: any) { throw httpError(e.status || 422, e.message) }
    const hashArquivo = createHash('sha256').update(`${conta.id}|${texto.replace(/\s+/g, ' ').trim()}`).digest('hex')
    if (await prisma.tesExtrato.findFirst({ where: { tenantId, contaId: conta.id, hash: hashArquivo }, select: { id: true } })) throw httpError(409, 'Este arquivo de extrato já foi importado para esta conta.', { code: 'EXTRATO_DUPLICADO' })
    const hashes = hashesDasLinhas(conta.id, lido.linhas)
    const existentes = new Set((await prisma.tesExtratoItem.findMany({ where: { tenantId, contaId: conta.id, hash: { in: hashes } }, select: { hash: true } })).map((x) => x.hash))
    const novos = lido.linhas.map((l, i) => ({ l, h: hashes[i] })).filter((x) => !existentes.has(x.h))
    const extrato = await prisma.tesExtrato.create({
      data: {
        tenantId, contaId: conta.id, formato: lido.formato, nomeArquivo: d.nomeArquivo, hash: hashArquivo, periodoInicio: lido.inicio, periodoFim: lido.fim, saldoFinal: lido.saldoFinal,
        qtd: lido.linhas.length, qtdNovos: novos.length, importadoPorId: uid(req),
        itens: { create: novos.map(({ l, h }) => ({ tenantId, contaId: conta.id, data: l.data, valor: l.valor, descricao: l.descricao.slice(0, 300), documento: l.documento?.slice(0, 80), hash: h })) },
      },
    })
    let auto: any = null
    if (d.autoConciliar) auto = await conciliarAutomatico(req, conta.id, 0.8)
    await log(req, 'EXTRATO_IMPORTADO', 'TesExtrato', extrato.id, { formato: lido.formato, linhas: lido.linhas.length, novos: novos.length })
    res.status(201).json({ extrato, linhas: lido.linhas.length, novos: novos.length, duplicadasIgnoradas: lido.linhas.length - novos.length, avisos: lido.avisos.slice(0, 20), banco: lido.banco, conta: lido.conta, saldoFinal: lido.saldoFinal, conciliacao: auto })
  }))

  router.get('/extratos', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const contaId = qs(req.query.contaId)
    const rows = await prisma.tesExtrato.findMany({ where: { tenantId, ...(contaId ? { contaId } : {}) }, orderBy: { createdAt: 'desc' }, take: 100 })
    res.json({ items: rows })
  }))

  router.get('/extratos/itens', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const { page, pageSize, skip, take } = pageParams(req.query)
    const where: any = { tenantId }
    const contaId = qs(req.query.contaId), status = qs(req.query.status)
    if (contaId) where.contaId = contaId
    if (status) where.status = status
    const [total, items] = await Promise.all([prisma.tesExtratoItem.count({ where }), prisma.tesExtratoItem.findMany({ where, orderBy: [{ data: 'desc' }, { createdAt: 'desc' }], skip, take })])
    res.json({ total, page, pageSize, items })
  }))

  // Resumo de conciliação por conta: saldo do sistema x extrato, pendências dos dois lados.
  router.get('/conciliacao/resumo', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const contas = await prisma.tesContaBancaria.findMany({ where: { tenantId, ativa: true, tipo: { not: 'CAIXA' } } })
    const out: any[] = []
    for (const c of contas) {
      const [pend, conc, movPend, ultimo] = await Promise.all([
        prisma.tesExtratoItem.aggregate({ where: { tenantId, contaId: c.id, status: 'PENDENTE' }, _count: true, _sum: { valor: true } }),
        prisma.tesExtratoItem.count({ where: { tenantId, contaId: c.id, status: 'CONCILIADO' } }),
        prisma.tesMovimento.aggregate({ where: { tenantId, contaId: c.id, conciliado: false }, _count: true, _sum: { valor: true } }),
        prisma.tesExtrato.findFirst({ where: { tenantId, contaId: c.id }, orderBy: { periodoFim: 'desc' } }),
      ])
      out.push({ contaId: c.id, nome: c.nome, saldoSistema: await saldoDaConta(tenantId, c), itensPendentes: pend._count, valorPendente: r2(pend._sum.valor ?? 0), itensConciliados: conc, movimentosSistemaSemExtrato: movPend._count, valorSistemaSemExtrato: r2(movPend._sum.valor ?? 0), ultimoExtratoFim: ultimo?.periodoFim ?? null, saldoExtrato: ultimo?.saldoFinal ?? null })
    }
    res.json({ contas: out })
  }))

  router.get('/extratos/itens/:id/sugestoes', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const item = await prisma.tesExtratoItem.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!item) throw httpError(404, 'Linha do extrato não encontrada.')
    const cfg = await getConfig(tenantId)
    res.json({ item, sugestoes: item.status === 'PENDENTE' ? await sugerirCandidatos(tenantId, item, cfg.toleranciaDiasConciliacao) : [] })
  }))

  const conciliarSchema = z.object({
    tipo: z.enum(['TITULO', 'RECEBIMENTO', 'MOVIMENTO', 'RECEBIVEL', 'NOVO_MOVIMENTO']), id: z.string().optional(),
    movimentoTipo: z.enum(['TARIFA', 'RENDIMENTO', 'AJUSTE']).optional(), forma: z.enum(['BOLETO', 'PIX', 'CARTAO', 'TRANSFERENCIA']).optional(),
  })
  router.post('/extratos/itens/:id/conciliar', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const d = parseBody(conciliarSchema, req.body)
    if (d.tipo !== 'NOVO_MOVIMENTO' && !d.id) throw httpError(400, 'Informe o id do item a conciliar.')
    res.json(await aplicarConciliacao(req, String(req.params.id), d, 'MANUAL'))
  }))

  router.post('/extratos/itens/:id/ignorar', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const { motivo } = parseBody(z.object({ motivo: z.string().min(3).max(200) }), req.body)
    const c = await prisma.tesExtratoItem.updateMany({ where: { id: String(req.params.id), tenantId, status: 'PENDENTE' }, data: { status: 'IGNORADO', metodo: 'MANUAL', conciliadoPorId: uid(req), conciliadoEm: new Date() } })
    if (c.count === 0) throw httpError(409, 'Linha não encontrada ou já tratada.')
    await log(req, 'EXTRATO_IGNORADO', 'TesExtratoItem', String(req.params.id), { motivo })
    res.json({ ok: true })
  }))

  router.post('/extratos/itens/:id/desfazer', requireRole(...CONFERE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    res.json(await desfazer(req, String(req.params.id)))
  }))

  router.post('/conciliacao/automatica', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const d = parseBody(z.object({ contaId: z.string().min(1), minimo: z.number().min(0.5).max(1).default(0.8) }), req.body)
    await contaDoTenant(tid(req), d.contaId)
    res.json(await conciliarAutomatico(req, d.contaId, d.minimo))
  }))
}

/** Concilia sozinho apenas quando há UM candidato claramente melhor (score >= mínimo e folga sobre o segundo). Não baixa mensalidades automaticamente: só sugere. */
export async function conciliarAutomatico(req: AuthenticatedRequest, contaId: string, minimo: number) {
  const tenantId = tid(req)
  const cfg = await getConfig(tenantId)
  const pend = await prisma.tesExtratoItem.findMany({ where: { tenantId, contaId, status: 'PENDENTE' }, orderBy: { data: 'asc' }, take: 1000 })
  let conciliados = 0, comSugestao = 0, semCandidato = 0
  const sugestoes: Array<{ itemId: string; melhor: Candidato }> = []
  const erros: string[] = []
  for (const it of pend) {
    const cands = await sugerirCandidatos(tenantId, it, cfg.toleranciaDiasConciliacao)
    const top = cands[0]
    if (!top) { semCandidato++; continue }
    const segundo = cands[1]
    const unico = !segundo || top.score - segundo.score >= 0.1
    if (top.tipo !== 'RECEBIVEL' && top.score >= minimo && unico) {
      try { await aplicarConciliacao(req, it.id, { tipo: top.tipo, id: top.id }, 'AUTO', top.score); conciliados++; continue } catch (e: any) { erros.push(`${it.id}: ${e.message}`) }
    }
    comSugestao++
    sugestoes.push({ itemId: it.id, melhor: top })
    await prisma.tesExtratoItem.update({ where: { id: it.id }, data: { score: top.score, matchTipo: null } })
  }
  await log(req, 'CONCILIACAO_AUTOMATICA', 'TesContaBancaria', contaId, { analisadas: pend.length, conciliados, comSugestao, semCandidato })
  return { analisadas: pend.length, conciliados, comSugestao, semCandidato, sugestoes: sugestoes.slice(0, 100), erros }
}
