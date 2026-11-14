import { prisma } from '../../lib/prisma'
import { similaridade } from '../tesouraria/extratoParser'
import { httpError, soDigitos } from '../tesouraria/common'
import { alertarRecorrenciaNaoLancada, encerrarAvisosRecorrencia } from './alertas'
import { DIA, auditar, fimDoDia, inicioDoDia, iso10 } from './servico'

// Memória de contas recorrentes: cadastro/aprendizado de recorrências (fornecedor + valor aproximado + dia do mês/periodicidade),
// rotina diária que compara o esperado com o que foi lançado (caixa de boletos + contas a pagar) e avisa "conta recorrente não lançada".

export const PERIODOS: Record<string, number> = { MENSAL: 1, BIMESTRAL: 2, TRIMESTRAL: 3, SEMESTRAL: 6, ANUAL: 12 }
export const MESES_MINIMOS_APRENDIZADO = 3
const normNome = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
const comp = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
const ultimoDia = (ano: number, mes1a12: number) => new Date(Date.UTC(ano, mes1a12, 0)).getUTCDate()

export function dataEsperadaDaCompetencia(competencia: string, diaMes: number): Date {
  const [a, m] = competencia.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, Math.min(Math.max(1, diaMes), ultimoDia(a, m)), 12))
}
export function competenciaAplica(rec: { periodicidade: string; mesBase: number }, competencia: string): boolean {
  const k = PERIODOS[rec.periodicidade] ?? 1
  const m = Number(competencia.split('-')[1])
  return (((m - rec.mesBase) % k) + k) % k === 0
}
const somaMeses = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1, 12))

type Rec = Awaited<ReturnType<typeof prisma.bolRecorrencia.findFirstOrThrow>>

/** Procura, para a recorrência/competência, um boleto da caixa ou título já lançado do mesmo fornecedor, com valor aproximado e vencimento na janela. */
export async function acharLancamento(tenantId: string, rec: Rec, venc: Date) {
  const de = new Date(venc.getTime() - 12 * DIA)
  const ate = new Date(venc.getTime() + 20 * DIA)
  const tol = Math.max(0.01, rec.valorEstimado * (rec.toleranciaPercentual / 100))
  const valor = { gte: rec.valorEstimado - tol, lte: rec.valorEstimado + tol }
  const doc = soDigitos(rec.fornecedorDocumento)
  const mesmoForn = (nome?: string | null, docX?: string | null) => (doc && soDigitos(docX) === doc) || (!doc && !!nome && similaridade(nome, rec.fornecedorNome) >= 0.8)
  const bols = await prisma.bolBoleto.findMany({
    where: { tenantId, status: { not: 'REFUTADO' }, resultado: { not: 'DUPLICADO' }, valor, vencimento: { gte: de, lte: ate }, ...(doc ? { beneficiarioDocumento: doc } : {}) },
    orderBy: { vencimento: 'asc' }, take: 50,
  })
  const bol = bols.find((b) => mesmoForn(b.beneficiarioNome, b.beneficiarioDocumento))
  if (bol) return { boletoId: bol.id, tituloId: bol.tituloId ?? undefined, numero: bol.numero }
  const tits = await prisma.tesTitulo.findMany({
    where: { tenantId, status: { notIn: ['CANCELADO', 'REJEITADO'] }, valorBruto: valor, vencimento: { gte: de, lte: ate }, ...(doc ? { fornecedorDocumento: doc } : rec.fornecedorId ? { fornecedorId: rec.fornecedorId } : {}) },
    orderBy: { vencimento: 'asc' }, take: 50,
  })
  const tit = tits.find((t) => mesmoForn(t.fornecedor, t.fornecedorDocumento) || (rec.fornecedorId && t.fornecedorId === rec.fornecedorId))
  return tit ? { tituloId: tit.id, numero: tit.numero } : null
}

/** Compara o esperado com o lançado e avisa o que não foi lançado. Idempotente (roda todo dia e sob demanda). */
export async function verificarRecorrencias(tenantId: string, hoje = new Date(), userId?: string) {
  const recs = await prisma.bolRecorrencia.findMany({ where: { tenantId, ativa: true } })
  const res = { recorrencias: recs.length, avaliados: 0, lancados: 0, naoLancados: 0, novosAvisos: 0 }
  for (const rec of recs) {
    for (const delta of [-1, 0, 1]) {
      const c = comp(somaMeses(hoje, delta))
      if (!competenciaAplica(rec, c)) continue
      const venc = dataEsperadaDaCompetencia(c, rec.diaMes)
      if (delta < 0 && rec.createdAt > venc) continue                    // competência anterior ao cadastro da recorrência
      const limite = new Date(venc.getTime() - rec.antecedenciaDias * DIA)
      let esp = await prisma.bolEsperado.findUnique({ where: { recorrenciaId_competencia: { recorrenciaId: rec.id, competencia: c } } })
      if (!esp) {
        if (hoje < inicioDoDia(limite)) continue                       // ainda cedo: nada esperado
        if (hoje.getTime() - venc.getTime() > 45 * DIA) continue        // competência antiga demais para reabrir
        esp = await prisma.bolEsperado.create({ data: { tenantId, recorrenciaId: rec.id, competencia: c, dataEsperada: venc, limiteLancamento: limite } })
      }
      if (['JUSTIFICADO', 'DISPENSADO'].includes(esp.status)) continue
      res.avaliados++
      const achou = await acharLancamento(tenantId, rec, venc)
      if (achou) {
        if (esp.status !== 'LANCADO') {
          await prisma.bolEsperado.update({ where: { id: esp.id }, data: { status: 'LANCADO', boletoId: achou.boletoId, tituloId: achou.tituloId } })
          await encerrarAvisosRecorrencia(tenantId, esp.id, userId)
        }
        res.lancados++
        continue
      }
      if (hoje >= inicioDoDia(limite)) {
        res.naoLancados++
        const primeiraVez = esp.status !== 'NAO_LANCADO' || !esp.avisadoEm
        await prisma.bolEsperado.update({ where: { id: esp.id }, data: { status: 'NAO_LANCADO', ...(primeiraVez ? { avisadoEm: new Date() } : {}) } })
        if (primeiraVez) {
          await alertarRecorrenciaNaoLancada({ tenantId, esperadoId: esp.id, fornecedor: rec.fornecedorNome, dataEsperada: venc })
          res.novosAvisos++
        }
      }
    }
  }
  return res
}

/** Aprende recorrências: mesmo fornecedor lançado em meses seguidos (>= 3) com valores parecidos => sugestão (nunca cria sozinha). */
export async function aprenderRecorrencias(tenantId: string, hoje = new Date()) {
  const desde = somaMeses(hoje, -9)
  const [tits, bols, recs, sugs] = await Promise.all([
    prisma.tesTitulo.findMany({ where: { tenantId, status: { notIn: ['CANCELADO', 'REJEITADO'] }, vencimento: { gte: desde } }, select: { fornecedor: true, fornecedorDocumento: true, valorBruto: true, vencimento: true } }),
    prisma.bolBoleto.findMany({ where: { tenantId, status: { not: 'REFUTADO' }, resultado: { not: 'DUPLICADO' }, vencimento: { gte: desde }, valor: { not: null } }, select: { beneficiarioNome: true, beneficiarioDocumento: true, valor: true, vencimento: true } }),
    prisma.bolRecorrencia.findMany({ where: { tenantId, ativa: true } }),
    prisma.bolRecorrenciaSugestao.findMany({ where: { tenantId } }),
  ])
  const grupos = new Map<string, { nome: string; doc: string; meses: Map<string, { valor: number; dia: number }> }>()
  const add = (nome: string, doc: string | null | undefined, valor: number, venc: Date | null) => {
    if (!venc || !nome) return
    const d = soDigitos(doc)
    const chave = d || normNome(nome)
    if (!chave) return
    const g = grupos.get(chave) ?? { nome, doc: d, meses: new Map() }
    const m = comp(venc)
    if (m >= comp(hoje)) return                                        // aprende só com meses já encerrados (o mês corrente ainda está em curso)
    if (!g.meses.has(m)) g.meses.set(m, { valor, dia: venc.getUTCDate() })
    grupos.set(chave, g)
  }
  tits.forEach((t) => add(t.fornecedor, t.fornecedorDocumento, t.valorBruto, t.vencimento))
  bols.forEach((b) => add(b.beneficiarioNome || '', b.beneficiarioDocumento, b.valor as number, b.vencimento))
  let novas = 0
  const mesAtual = comp(hoje)
  for (const [chave, g] of grupos) {
    const jaTem = recs.some((r) => (g.doc && soDigitos(r.fornecedorDocumento) === g.doc) || similaridade(r.fornecedorNome, g.nome) >= 0.8)
    if (jaTem || sugs.some((s) => s.chave === chave)) continue
    const ordenados = Array.from(g.meses.entries()).sort((a, b) => a[0].localeCompare(b[0]))
    // maior sequência de meses consecutivos
    let melhor: typeof ordenados = []
    let atual: typeof ordenados = []
    for (const par of ordenados) {
      const ant = atual[atual.length - 1]
      const consecutivo = ant && comp(somaMeses(new Date(Date.UTC(Number(ant[0].slice(0, 4)), Number(ant[0].slice(5)) - 1, 1, 12)), 1)) === par[0]
      atual = consecutivo ? [...atual, par] : [par]
      if (atual.length > melhor.length) melhor = [...atual]
    }
    if (melhor.length < MESES_MINIMOS_APRENDIZADO) continue
    const ultimo = melhor[melhor.length - 1][0]
    const distancia = (Number(mesAtual.slice(0, 4)) - Number(ultimo.slice(0, 4))) * 12 + Number(mesAtual.slice(5)) - Number(ultimo.slice(5))
    if (distancia > 2) continue                                        // sequência já encerrada
    const valores = melhor.map((x) => x[1].valor)
    const med = [...valores].sort((a, b) => a - b)[Math.floor(valores.length / 2)]
    if (valores.some((v) => Math.abs(v - med) > med * 0.25)) continue  // valores muito diferentes: não parece fixo
    const media = valores.reduce((s, v) => s + v, 0) / valores.length
    const dias = melhor.map((x) => x[1].dia)
    await prisma.bolRecorrenciaSugestao.create({
      data: { tenantId, chave, fornecedorNome: g.nome.slice(0, 150), fornecedorDocumento: g.doc || null, valorMedio: Math.round(media * 100) / 100, diaMedio: Math.round(dias.reduce((s, v) => s + v, 0) / dias.length), meses: melhor.length },
    })
    novas++
  }
  return { novas }
}

export async function aceitarSugestao(tenantId: string, id: string, userId: string | undefined, over: { diaMes?: number; antecedenciaDias?: number; periodicidade?: string; valorEstimado?: number } = {}) {
  const s = await prisma.bolRecorrenciaSugestao.findFirst({ where: { id, tenantId } })
  if (!s) throw httpError(404, 'Sugestão não encontrada.')
  if (s.status !== 'PENDENTE') throw httpError(409, 'Esta sugestão já foi tratada.')
  const forn = s.fornecedorDocumento ? (await prisma.supFornecedor.findMany({ where: { tenantId }, select: { id: true, cnpj: true } })).find((f) => soDigitos(f.cnpj) === s.fornecedorDocumento) : undefined
  const rec = await prisma.bolRecorrencia.create({
    data: {
      tenantId, fornecedorId: forn?.id, fornecedorNome: s.fornecedorNome, fornecedorDocumento: s.fornecedorDocumento, valorEstimado: over.valorEstimado ?? s.valorMedio, diaMes: over.diaMes ?? s.diaMedio,
      antecedenciaDias: over.antecedenciaDias ?? 5, periodicidade: over.periodicidade ?? 'MENSAL', origem: 'APRENDIDA', criadoPorId: userId, descricao: `Aprendida de ${s.meses} meses seguidos`,
    },
  })
  await prisma.bolRecorrenciaSugestao.update({ where: { id }, data: { status: 'ACEITA' } })
  await auditar(tenantId, userId, 'RECORRENCIA_ACEITA', 'BolRecorrencia', rec.id, { sugestaoId: id })
  return rec
}

export async function tratarEsperado(tenantId: string, id: string, userId: string | undefined, acao: 'JUSTIFICADO' | 'DISPENSADO', justificativa: string) {
  const e = await prisma.bolEsperado.findFirst({ where: { id, tenantId } })
  if (!e) throw httpError(404, 'Registro esperado não encontrado.')
  if (!['NAO_LANCADO', 'ESPERADO'].includes(e.status)) throw httpError(409, `Item já está ${e.status.replace(/_/g, ' ').toLowerCase()}.`)
  if ((justificativa || '').trim().length < 5) throw httpError(400, 'Informe a justificativa (mín. 5 caracteres).')
  const out = await prisma.bolEsperado.update({ where: { id }, data: { status: acao, justificativa: justificativa.trim(), tratadoPorId: userId, tratadoEm: new Date() } })
  await encerrarAvisosRecorrencia(tenantId, id, userId)
  await auditar(tenantId, userId, acao === 'JUSTIFICADO' ? 'RECORRENCIA_JUSTIFICADA' : 'RECORRENCIA_DISPENSADA', 'BolEsperado', id, { justificativa })
  return out
}

/** "Planilha do dia": o que era esperado para o dia/janela e se foi lançado. */
export async function planilhaDoDia(tenantId: string, dia: Date) {
  const de = new Date(dia.getTime() - 30 * DIA)
  const ate = new Date(dia.getTime() + 7 * DIA)
  const rows = await prisma.bolEsperado.findMany({
    where: { tenantId, OR: [{ status: 'NAO_LANCADO' }, { dataEsperada: { gte: de, lte: ate } }, { tratadoEm: { gte: inicioDoDia(dia), lte: fimDoDia(dia) } }] },
    orderBy: { dataEsperada: 'asc' },
  })
  const recs = await prisma.bolRecorrencia.findMany({ where: { tenantId, id: { in: Array.from(new Set(rows.map((r) => r.recorrenciaId))) } } })
  const mapa = new Map(recs.map((r) => [r.id, r]))
  const itens = rows.map((e) => {
    const r = mapa.get(e.recorrenciaId)
    return {
      id: e.id, recorrenciaId: e.recorrenciaId, competencia: e.competencia, fornecedor: r?.fornecedorNome ?? '—', descricao: r?.descricao ?? null, valorEstimado: r?.valorEstimado ?? null,
      dataEsperada: e.dataEsperada, limiteLancamento: e.limiteLancamento, status: e.status, boletoId: e.boletoId, tituloId: e.tituloId, justificativa: e.justificativa,
      diasAtraso: e.status === 'NAO_LANCADO' ? Math.max(0, Math.floor((dia.getTime() - e.limiteLancamento.getTime()) / DIA)) : 0,
    }
  })
  // previstos (ainda sem registro): vencimento esperado nos próximos 7 dias e ainda antes do limite de lançamento
  const ativas = await prisma.bolRecorrencia.findMany({ where: { tenantId, ativa: true } })
  const virtuais: typeof itens = []
  for (const r of ativas) {
    for (const delta of [0, 1]) {
      const c = comp(somaMeses(dia, delta))
      if (!competenciaAplica(r, c)) continue
      const venc = dataEsperadaDaCompetencia(c, r.diaMes)
      if (venc < dia || venc > ate) continue
      if (itens.some((i) => i.recorrenciaId === r.id && i.competencia === c)) continue
      virtuais.push({ id: `previsto:${r.id}:${c}`, recorrenciaId: r.id, competencia: c, fornecedor: r.fornecedorNome, descricao: r.descricao, valorEstimado: r.valorEstimado, dataEsperada: venc, limiteLancamento: new Date(venc.getTime() - r.antecedenciaDias * DIA), status: 'ESPERADO', boletoId: null, tituloId: null, justificativa: null, diasAtraso: 0 })
    }
  }
  itens.push(...virtuais)
  return {
    dia: iso10(dia),
    naoLancados: itens.filter((i) => i.status === 'NAO_LANCADO'),
    proximos: itens.filter((i) => i.status === 'ESPERADO'),
    lancados: itens.filter((i) => i.status === 'LANCADO'),
    tratados: itens.filter((i) => ['JUSTIFICADO', 'DISPENSADO'].includes(i.status)),
    totais: { esperados: itens.length, naoLancados: itens.filter((i) => i.status === 'NAO_LANCADO').length, valorNaoLancado: Math.round(itens.filter((i) => i.status === 'NAO_LANCADO').reduce((s, i) => s + (i.valorEstimado ?? 0), 0) * 100) / 100 },
  }
}
