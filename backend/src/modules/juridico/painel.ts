import { Router } from 'express'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, READ, Response, asyncHandler, fail, qs, requireRole, restricaoDocumento, restricaoProcesso, tid, DAY } from './common'
import { diasAte, faixaVencimento, r2, severidadePorDias } from './logic'
import { AREAS, POSICOES, RISCOS } from './processos'
import { CATEGORIAS_DOC } from './documentos'
import { TIPOS_CONTRATO } from './contratos'
import { CATEGORIAS_RISCO, TIPOS_SEGURO } from './riscos'
import { CATALOGO_CAUSAS } from './logic'

export interface Alerta { tipo: string; rotulo: string; refType: string; refId: string; titulo: string; vencimento: string | Date; dias: number; faixa: string | null; severidade: 'INFO' | 'ATENCAO' | 'CRITICO'; secao: string }

const hoje0 = () => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d }

/** Todos os vencimentos jurídicos dentro de `dias` (inclui os já vencidos e ainda em aberto). */
export async function coletarAlertas(req: AuthenticatedRequest, dias = 90): Promise<Alerta[]> {
  const tenantId = tid(req)
  const lim = new Date(hoje0().getTime() + (dias + 1) * DAY - 1)
  const out: Alerta[] = []
  const add = (tipo: string, rotulo: string, refType: string, refId: string, titulo: string, venc: Date, secao: string, sev?: Alerta['severidade']) => {
    const d = diasAte(venc) ?? 0
    out.push({ tipo, rotulo, refType, refId, titulo, vencimento: venc, dias: d, faixa: faixaVencimento(d), severidade: sev ?? severidadePorDias(d), secao })
  }
  const procWhere = { processo: restricaoProcesso(req) }
  const [docs, ctr, loc, polo, seg, prazos, aud, parc, riscos, planos] = await Promise.all([
    prisma.jurDocumento.findMany({ where: { tenantId, status: 'VIGENTE', vigenciaFim: { lte: lim }, ...restricaoDocumento(req) }, select: { id: true, titulo: true, codigo: true, vigenciaFim: true } }),
    prisma.jurContrato.findMany({ where: { tenantId, status: 'VIGENTE', vigenciaFim: { lte: lim } }, select: { id: true, objeto: true, codigo: true, contraparteNome: true, vigenciaFim: true } }),
    prisma.jurLocacao.findMany({ where: { tenantId, status: 'VIGENTE', vigenciaFim: { lte: lim } }, select: { id: true, codigo: true, locadorNome: true, vigenciaFim: true } }),
    prisma.jurContratoPolo.findMany({ where: { tenantId, status: 'VIGENTE', vigenciaFim: { lte: lim } }, select: { id: true, codigo: true, gestorNome: true, vigenciaFim: true } }),
    prisma.jurSeguro.findMany({ where: { tenantId, status: 'VIGENTE', vigenciaFim: { lte: lim } }, select: { id: true, tipo: true, apolice: true, seguradora: true, vigenciaFim: true } }),
    prisma.jurPrazo.findMany({ where: { tenantId, status: 'ABERTO', dataFatal: { lte: lim }, ...procWhere }, select: { id: true, titulo: true, fatal: true, dataFatal: true, processo: { select: { numeroCnj: true } } } }),
    prisma.jurAudiencia.findMany({ where: { tenantId, status: 'AGENDADA', dataHora: { lte: lim }, ...procWhere }, select: { id: true, tipo: true, dataHora: true, processo: { select: { numeroCnj: true } } } }),
    prisma.jurParcela.findMany({ where: { tenantId, status: 'ABERTA', vencimento: { lte: new Date(hoje0().getTime() + 8 * DAY) } }, select: { id: true, competencia: true, vencimento: true, valor: true, locacao: { select: { codigo: true } } }, take: 200 }),
    prisma.jurRisco.findMany({ where: { tenantId, status: { not: 'ENCERRADO' }, revisaoEm: { lte: new Date(hoje0().getTime() + 31 * DAY) } }, select: { id: true, codigo: true, titulo: true, revisaoEm: true } }),
    prisma.jurPlanoPrevencao.findMany({ where: { tenantId, status: { in: ['PLANEJADO', 'EM_ANDAMENTO'] }, prazo: { lte: new Date(hoje0().getTime() + 31 * DAY) } }, select: { id: true, titulo: true, prazo: true } }),
  ])
  docs.forEach((x) => add('DOCUMENTO', 'Documento', 'JurDocumento', x.id, `${x.titulo} (${x.codigo})`, x.vigenciaFim!, 'documentos'))
  ctr.forEach((x) => add('CONTRATO', 'Contrato', 'JurContrato', x.id, `${x.objeto.slice(0, 80)} — ${x.contraparteNome} (${x.codigo})`, x.vigenciaFim!, 'contratos'))
  loc.forEach((x) => add('LOCACAO', 'Locação', 'JurLocacao', x.id, `Locação ${x.codigo} — ${x.locadorNome}`, x.vigenciaFim, 'imoveis'))
  polo.forEach((x) => add('CONTRATO_POLO', 'Contrato de polo', 'JurContratoPolo', x.id, `Contrato ${x.codigo} — gestor ${x.gestorNome}`, x.vigenciaFim, 'polos'))
  seg.forEach((x) => add('SEGURO', 'Seguro', 'JurSeguro', x.id, `${x.tipo.replace(/_/g, ' ')} — apólice ${x.apolice} (${x.seguradora})`, x.vigenciaFim, 'riscos'))
  prazos.forEach((x) => add('PRAZO', x.fatal ? 'Prazo fatal' : 'Prazo', 'JurPrazo', x.id, `${x.titulo} — ${x.processo.numeroCnj}`, x.dataFatal, 'processos', x.fatal && (diasAte(x.dataFatal) ?? 0) <= 3 ? 'CRITICO' : undefined))
  aud.forEach((x) => add('AUDIENCIA', 'Audiência', 'JurAudiencia', x.id, `Audiência ${x.tipo} — ${x.processo.numeroCnj}`, x.dataHora, 'processos'))
  parc.forEach((x) => add('PARCELA', 'Parcela de aluguel', 'JurParcela', x.id, `Parcela ${x.competencia} da locação ${x.locacao.codigo} — R$ ${x.valor.toFixed(2).replace('.', ',')}`, x.vencimento, 'imoveis'))
  riscos.forEach((x) => add('RISCO', 'Revisão de risco', 'JurRisco', x.id, `${x.codigo} — ${x.titulo}`, x.revisaoEm!, 'riscos'))
  planos.forEach((x) => add('PLANO', 'Plano de prevenção', 'JurPlanoPrevencao', x.id, x.titulo, x.prazo!, 'inteligencia'))
  return out.sort((a, b) => a.dias - b.dias)
}

export function registerPainel(router: Router) {
  router.get('/meta', requireRole(...READ), (_req, res) => res.json({
    categoriasDocumento: CATEGORIAS_DOC, tiposContrato: TIPOS_CONTRATO, areasProcesso: AREAS, posicoes: POSICOES, riscosProcesso: RISCOS, categoriasRisco: CATEGORIAS_RISCO, tiposSeguro: TIPOS_SEGURO,
    causas: CATALOGO_CAUSAS.map((c) => ({ chave: c.chave, rotulo: c.rotulo })),
    aviso: 'Modelos e regras de apoio: valide com advogado antes de uso formal.',
  }))

  router.get('/alertas', requireRole(...READ), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const d = qs(req.query.dias) ?? '90'
    if (!/^\d{1,3}$/.test(d)) fail(400, 'dias inválido.')
    const items = await coletarAlertas(req, +d)
    const tipo = qs(req.query.tipo), faixa = qs(req.query.faixa)
    const f = items.filter((a) => (!tipo || a.tipo === tipo) && (!faixa || a.faixa === faixa))
    res.json({ items: f, total: f.length, resumo: { vencidos: items.filter((a) => a.faixa === 'VENCIDO').length, ate30: items.filter((a) => a.faixa === 'D30').length, ate60: items.filter((a) => a.faixa === 'D60').length, ate90: items.filter((a) => a.faixa === 'D90').length } })
  }))

  router.get('/painel', requireRole(...READ), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const h = hoje0()
    const alertas = await coletarAlertas(req, 90)
    const [docs, contratos, polos, locs, ativos, sofridos, prov, riscos, seguros, sin, prazos7, aud30, parcAtr] = await Promise.all([
      prisma.jurDocumento.count({ where: { tenantId, status: 'VIGENTE', ...restricaoDocumento(req) } }),
      prisma.jurContrato.count({ where: { tenantId, status: 'VIGENTE' } }),
      prisma.jurContratoPolo.count({ where: { tenantId, status: 'VIGENTE' } }),
      prisma.jurLocacao.count({ where: { tenantId, status: 'VIGENTE' } }),
      prisma.jurProcesso.count({ where: { tenantId, status: 'EM_ANDAMENTO', ...restricaoProcesso(req) } }),
      prisma.jurProcesso.count({ where: { tenantId, status: { in: ['EM_ANDAMENTO', 'SUSPENSO'] }, sofrido: true, ...restricaoProcesso(req) } }),
      prisma.jurProcesso.aggregate({ where: { tenantId, sofrido: true, risco: 'PROVAVEL', status: { not: 'ENCERRADO' } }, _sum: { provisaoValor: true }, _count: true }),
      prisma.jurRisco.groupBy({ by: ['nivel'], where: { tenantId, status: { not: 'ENCERRADO' } }, _count: true }),
      prisma.jurSeguro.count({ where: { tenantId, status: 'VIGENTE', vigenciaFim: { gte: h } } }),
      prisma.jurSinistro.count({ where: { tenantId, status: { in: ['COMUNICADO', 'EM_ANALISE'] } } }),
      prisma.jurPrazo.count({ where: { tenantId, status: 'ABERTO', dataFatal: { lte: new Date(h.getTime() + 8 * DAY) }, processo: restricaoProcesso(req) } }),
      prisma.jurAudiencia.count({ where: { tenantId, status: 'AGENDADA', dataHora: { gte: h, lte: new Date(h.getTime() + 31 * DAY) }, processo: restricaoProcesso(req) } }),
      prisma.jurParcela.aggregate({ where: { tenantId, status: 'ABERTA', vencimento: { lt: h } }, _count: true, _sum: { valor: true } }),
    ])
    const nivel = Object.fromEntries(riscos.map((r) => [r.nivel, r._count]))
    res.json({
      acervo: { documentosVigentes: docs, contratosVigentes: contratos, contratosPoloVigentes: polos, locacoesVigentes: locs },
      processos: { emAndamento: ativos, sofridosAbertos: sofridos, provisaoProvavel: r2(prov._sum.provisaoValor ?? 0), qtdProvaveis: prov._count, prazosEm7Dias: prazos7, audienciasEm30Dias: aud30 },
      riscos: { baixo: nivel.BAIXO ?? 0, medio: nivel.MEDIO ?? 0, alto: nivel.ALTO ?? 0, critico: nivel.CRITICO ?? 0 },
      seguros: { vigentes: seguros, sinistrosEmAberto: sin },
      imoveis: { parcelasAtrasadas: parcAtr._count, valorAtrasado: r2(parcAtr._sum.valor ?? 0) },
      alertas: { vencidos: alertas.filter((a) => a.faixa === 'VENCIDO').length, ate30: alertas.filter((a) => a.faixa === 'D30').length, ate60: alertas.filter((a) => a.faixa === 'D60').length, ate90: alertas.filter((a) => a.faixa === 'D90').length, proximos: alertas.slice(0, 12) },
    })
  }))

  // ---- integração leve com a Reitoria: indicadores prontos para o painel executivo.
  router.get('/reitoria/resumo', requireRole(...READ), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const h = hoje0()
    const [alertas, prov, ativos, polos, semContrato, riscosCrit, segVenc] = await Promise.all([
      coletarAlertas(req, 30),
      prisma.jurProcesso.aggregate({ where: { tenantId, sofrido: true, risco: 'PROVAVEL', status: { not: 'ENCERRADO' } }, _sum: { provisaoValor: true } }),
      prisma.jurProcesso.count({ where: { tenantId, sofrido: true, status: { in: ['EM_ANDAMENTO', 'SUSPENSO'] } } }),
      prisma.jurContratoPolo.count({ where: { tenantId, status: 'VIGENTE' } }),
      prisma.modPolo.count({ where: { tenantId, statusCredenciamento: 'CREDENCIADO', NOT: { id: { in: (await prisma.jurContratoPolo.findMany({ where: { tenantId, status: 'VIGENTE' }, select: { poloId: true } })).map((c) => c.poloId) } } } }),
      prisma.jurRisco.count({ where: { tenantId, nivel: 'CRITICO', status: { not: 'ENCERRADO' } } }),
      prisma.jurSeguro.count({ where: { tenantId, status: 'VIGENTE', vigenciaFim: { lte: new Date(h.getTime() + 60 * DAY) } } }),
    ])
    const vencidos = alertas.filter((a) => a.faixa === 'VENCIDO').length, criticos = alertas.filter((a) => a.severidade === 'CRITICO').length
    const ind = (chave: string, rotulo: string, valor: number, nivel: 'ok' | 'atencao' | 'critico', unidade?: string) => ({ chave, rotulo, valor, nivel, unidade })
    res.json({
      modulo: 'juridico', geradoEm: new Date(),
      indicadores: [
        ind('processos_sofridos_abertos', 'Processos sofridos em aberto', ativos, ativos > 20 ? 'atencao' : 'ok'),
        ind('provisao_provavel', 'Provisão (risco provável)', r2(prov._sum.provisaoValor ?? 0), 'atencao', 'BRL'),
        ind('vencimentos_30d', 'Vencimentos jurídicos em 30 dias', alertas.length, alertas.length > 10 ? 'atencao' : 'ok'),
        ind('vencidos', 'Itens jurídicos vencidos', vencidos, vencidos ? 'critico' : 'ok'),
        ind('polos_sem_contrato', 'Polos credenciados sem contrato vigente', semContrato, semContrato ? 'critico' : 'ok'),
        ind('contratos_polo_vigentes', 'Contratos de polo vigentes', polos, 'ok'),
        ind('riscos_criticos', 'Riscos críticos', riscosCrit, riscosCrit ? 'critico' : 'ok'),
        ind('seguros_vencendo_60d', 'Seguros vencendo em 60 dias', segVenc, segVenc ? 'atencao' : 'ok'),
      ],
      destaques: alertas.filter((a) => a.severidade === 'CRITICO').slice(0, 5),
      criticos,
    })
  }))

  // ---- integração com o Financeiro: provisões contábeis e obrigações futuras.
  router.get('/financeiro/provisoes', requireRole(...READ), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const abertos = { tenantId, sofrido: true, status: { not: 'ENCERRADO' } }
    const [provaveis, possiveis, hist, itens] = await Promise.all([
      prisma.jurProcesso.findMany({ where: { ...abertos, risco: 'PROVAVEL' }, select: { area: true, provisaoValor: true, valorCausa: true } }),
      prisma.jurProcesso.aggregate({ where: { ...abertos, risco: 'POSSIVEL' }, _sum: { valorCausa: true }, _count: true }),
      prisma.jurProvisaoHist.findMany({ where: { tenantId, data: { gte: new Date(Date.now() - 30 * DAY) } }, select: { valor: true, valorAnterior: true } }),
      prisma.jurProcesso.findMany({ where: { ...abertos, risco: 'PROVAVEL', ...restricaoProcesso(req) }, orderBy: { provisaoValor: 'desc' }, take: 20, select: { id: true, numeroCnj: true, area: true, assunto: true, provisaoValor: true, valorCausa: true, provisaoAtualizadaEm: true } }),
    ])
    const porArea: Record<string, { qtd: number; provisao: number }> = {}
    for (const p of provaveis) { const a = (porArea[p.area] ??= { qtd: 0, provisao: 0 }); a.qtd++; a.provisao = r2(a.provisao + p.provisaoValor) }
    res.json({
      referencia: 'CPC 25 / NBC TG 25 (modelo de apoio — valide com a contabilidade)',
      provisaoTotal: r2(provaveis.reduce((s, p) => s + p.provisaoValor, 0)), qtdProvaveis: provaveis.length, porArea,
      passivoContingente: { qtdPossiveis: possiveis._count, valorCausaPossiveis: r2(possiveis._sum.valorCausa ?? 0), tratamento: 'Divulgar em nota explicativa; não provisionar.' },
      variacao30d: r2(hist.reduce((s, h) => s + (h.valor - (h.valorAnterior ?? 0)), 0)), maiores: itens,
    })
  }))

  router.get('/financeiro/obrigacoes', requireRole(...READ), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const d = qs(req.query.dias) ?? '90'
    if (!/^\d{1,3}$/.test(d)) fail(400, 'dias inválido.')
    const lim = new Date(hoje0().getTime() + (+d + 1) * DAY - 1)
    const [parcelas, seguros] = await Promise.all([
      prisma.jurParcela.findMany({ where: { tenantId, status: 'ABERTA', vencimento: { lte: lim }, locacao: { natureza: 'LOCACAO_PAGA' } }, orderBy: { vencimento: 'asc' }, select: { id: true, competencia: true, vencimento: true, valor: true, locacao: { select: { codigo: true, locadorNome: true } } } }),
      prisma.jurSeguro.findMany({ where: { tenantId, status: 'VIGENTE', vigenciaFim: { lte: lim } }, orderBy: { vigenciaFim: 'asc' }, select: { id: true, tipo: true, apolice: true, seguradora: true, premio: true, premioPeriodicidade: true, vigenciaFim: true } }),
    ])
    res.json({
      dias: +d,
      aluguelAPagar: { qtd: parcelas.length, valor: r2(parcelas.reduce((s, p) => s + p.valor, 0)), itens: parcelas },
      renovacaoSeguros: { qtd: seguros.length, premioEstimado: r2(seguros.reduce((s, x) => s + x.premio, 0)), itens: seguros },
    })
  }))
}
