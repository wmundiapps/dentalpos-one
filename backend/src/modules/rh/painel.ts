import { Response, Router } from 'express'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler } from '../academico/middleware'
import { saldoBanco, r2, minToHhmm, diaLocal } from './calculo'
import { alertasFerias } from './ferias'
import { bancoRows } from './ponto'
import { examesVencimento } from './saude'
import { resumoAvaliacoes } from './avaliacoes'
import { exigirAutenticado, exigirRh, getConfig, httpError, isRh, meuColaborador, tid } from './common'

const K = 3
const supr = (n: number) => (n > 0 && n < K ? null : n)   // suprime contagens muito pequenas em visões agregadas

/** Resumo AGREGADO e anonimizado para a Reitoria (sem nomes, CPF, salários individuais, CID ou notas individuais). */
export async function resumoRhParaReitoria(tenantId: string) {
  const hoje = new Date()
  const cols = await prisma.rheColaborador.findMany({ where: { tenantId }, select: { id: true, status: true, tipo: true, vinculo: true, dataAdmissao: true, dataDesligamento: true, salarioBase: true, departamentoId: true } })
  const ativos = cols.filter((c) => c.status !== 'DESLIGADO' && c.status !== 'EM_ADMISSAO')
  const conta = <T extends string>(l: typeof cols, f: (c: (typeof cols)[number]) => T) => l.reduce((m: Record<string, number>, c) => { const k = f(c); m[k] = (m[k] ?? 0) + 1; return m }, {})
  const h12 = new Date(hoje.getTime() - 365 * 86400000)
  const adm12 = cols.filter((c) => c.dataAdmissao && c.dataAdmissao >= h12).length
  const des12 = cols.filter((c) => c.dataDesligamento && c.dataDesligamento >= h12).length
  const mediaHead = Math.max(1, (ativos.length + (ativos.length - adm12 + des12)) / 2)
  const turnover = r2(((adm12 + des12) / 2) / mediaHead * 100)
  const at12 = await prisma.rheAtestado.findMany({ where: { tenantId, status: { not: 'REJEITADO' }, dataInicio: { gte: h12 } }, select: { dias: true } })
  const diasAtest = at12.reduce((a, x) => a + x.dias, 0)
  const absenteismo = ativos.length ? r2(diasAtest / (ativos.length * 365 * (5 / 7)) * 100) : 0
  const alertas = await alertasFerias(tenantId, null)
  const exVenc = (await examesVencimento(tenantId, 0)).filter((x) => x.situacao !== 'A_VENCER')
  let bancoPassivo = 0, bancoVencido = 0
  for (const c of ativos) { const s = saldoBanco(await bancoRows(tenantId, c.id)); bancoPassivo += Math.max(0, s.saldoMin); bancoVencido += s.vencidoMin }
  const ultimaFolha = await prisma.rheFolha.findFirst({ where: { tenantId, tipo: 'MENSAL', status: 'FECHADA' }, orderBy: { competencia: 'desc' } })
  const t: any = ultimaFolha?.totais ?? null
  const ciclo = await resumoAvaliacoes(tenantId)
  const porDep = conta(ativos, (c) => c.departamentoId ?? 'SEM_DEPARTAMENTO')
  const deps = Object.fromEntries((await prisma.rheDepartamento.findMany({ where: { tenantId }, select: { id: true, nome: true } })).map((d) => [d.id, d.nome]))
  return {
    geradoEm: hoje.toISOString(), referencia: diaLocal(hoje),
    quadro: { total: ativos.length, docentes: ativos.filter((c) => c.tipo === 'DOCENTE').length, tecnicoAdministrativo: ativos.filter((c) => c.tipo === 'TECNICO_ADMINISTRATIVO').length, porVinculo: conta(ativos, (c) => c.vinculo), porStatus: conta(cols, (c) => c.status), emAdmissao: cols.filter((c) => c.status === 'EM_ADMISSAO').length },
    porDepartamento: Object.entries(porDep).map(([k, v]) => ({ departamento: deps[k] ?? 'Sem departamento', colaboradores: supr(v) })).filter((x) => x.colaboradores !== null),
    movimentacao12m: { admissoes: adm12, desligamentos: des12, turnoverPct: turnover },
    saude: { diasAfastamentoAtestados12m: diasAtest, absenteismoPct: absenteismo, examesVencidosOuAusentes: exVenc.length },
    ferias: { periodosVencidos: alertas.filter((a) => a.dobra).length, periodosEmRisco: alertas.filter((a) => !a.dobra).length },
    bancoDeHoras: { passivoHoras: minToHhmm(bancoPassivo), vencidoHoras: minToHhmm(bancoVencido) },
    folha: t ? { competencia: ultimaFolha!.competencia, colaboradores: t.colaboradores, brutoTotal: t.bruto, liquidoTotal: t.liquido, custoTotalEstimado: t.custoTotalEstimado, modeloAValidar: true } : null,
    avaliacaoDesempenho: ciclo ? { ciclo: ciclo.ciclo, participacao: ciclo.participacao, geral: ciclo.geral, porDepartamento: ciclo.porDepartamento } : null,
    privacidade: 'Resumo agregado. Sem identificação de pessoas; grupos pequenos (< 3) suprimidos. Folha/custos em modelo a validar por contador.',
  }
}

export function mountPainel(router: Router) {
  router.get('/painel', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const cfg = await getConfig(tenantId); const hoje = new Date()
    const [cols, ajustes, atest, lic, advSem, bon, desl, folhaAtual] = await Promise.all([
      prisma.rheColaborador.groupBy({ by: ['status'], where: { tenantId }, _count: true }),
      prisma.rheAjustePonto.count({ where: { tenantId, status: 'PENDENTE' } }), prisma.rheAtestado.count({ where: { tenantId, status: 'REGISTRADO' } }),
      prisma.rheLicenca.count({ where: { tenantId, status: 'SOLICITADA' } }), prisma.rheAdvertencia.count({ where: { tenantId, status: 'REGISTRADA' } }),
      prisma.rheBonificacao.count({ where: { tenantId, status: 'PROPOSTA' } }), prisma.rheDesligamento.count({ where: { tenantId, status: { notIn: ['CONCLUIDO', 'CANCELADO'] } } }),
      prisma.rheFolha.findFirst({ where: { tenantId, tipo: 'MENSAL' }, orderBy: { competencia: 'desc' } }),
    ])
    const feriasAlertas = await alertasFerias(tenantId, null)
    const exames = await examesVencimento(tenantId, cfg.alertaExameDias)
    const ativos = await prisma.rheColaborador.findMany({ where: { tenantId, status: { in: ['ATIVO', 'AFASTADO', 'FERIAS'] } }, select: { id: true } })
    let venc = 0, aVencer = 0
    for (const c of ativos) { const s = saldoBanco(await bancoRows(tenantId, c.id), hoje); venc += s.vencidoMin; aVencer += s.aVencerMin }
    const emAdmissao = await prisma.rheColaborador.count({ where: { tenantId, status: 'EM_ADMISSAO' } })
    const mes = diaLocal(hoje).slice(5, 7)
    const aniv = (await prisma.rheColaborador.findMany({ where: { tenantId, status: { not: 'DESLIGADO' }, dataNascimento: { not: null } }, select: { nome: true, dataNascimento: true } })).filter((c) => c.dataNascimento!.toISOString().slice(5, 7) === mes).slice(0, 20).map((c) => ({ nome: c.nome, dia: +c.dataNascimento!.toISOString().slice(8, 10) }))
    res.json({
      quadro: Object.fromEntries(cols.map((c) => [c.status, c._count])),
      pendencias: { ajustesPonto: ajustes, atestadosParaValidar: atest, licencasSolicitadas: lic, advertenciasSemCiencia: advSem, bonificacoesPropostas: bon, desligamentosEmAndamento: desl, admissoesEmAndamento: emAdmissao },
      alertas: { feriasVencidas: feriasAlertas.filter((a) => a.dobra).length, feriasEmRisco: feriasAlertas.filter((a) => !a.dobra).length, examesVencidosOuAusentes: exames.filter((e) => e.situacao !== 'A_VENCER').length, examesAVencer: exames.filter((e) => e.situacao === 'A_VENCER').length, bancoVencido: minToHhmm(venc), bancoAVencer: minToHhmm(aVencer) },
      folha: folhaAtual ? { id: folhaAtual.id, competencia: folhaAtual.competencia, status: folhaAtual.status, totais: folhaAtual.totais } : null,
      aniversariantes: aniv,
    })
  }))

  router.get('/reitoria/resumo', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!isRh(req)) throw httpError(403, 'Acesso restrito à Reitoria/administração e ao RH.')
    res.json(await resumoRhParaReitoria(tid(req)))
  }))

  router.get('/meu/resumo', exigirAutenticado, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const me = await meuColaborador(req)
    if (!me) throw httpError(403, 'Seu usuário não está vinculado a um colaborador do RH.')
    const [adv, aval, periodos, ajustes, hol] = await Promise.all([
      prisma.rheAdvertencia.count({ where: { tenantId, colaboradorId: me.id, status: 'REGISTRADA' } }),
      prisma.rheAvaliacao.count({ where: { tenantId, status: 'PENDENTE', OR: [{ colaboradorId: me.id }, { avaliadorId: me.id }] } }),
      prisma.rheFeriasPeriodo.findMany({ where: { tenantId, colaboradorId: me.id, status: { in: ['DISPONIVEL', 'PARCIAL', 'VENCIDO'] } }, orderBy: { concessivoFim: 'asc' }, take: 3 }),
      prisma.rheAjustePonto.count({ where: { tenantId, colaboradorId: me.id, status: 'PENDENTE' } }),
      prisma.rheHolerite.count({ where: { tenantId, colaboradorId: me.id } }),
    ])
    const s = saldoBanco(await bancoRows(tenantId, me.id))
    res.json({ colaborador: me, bancoDeHoras: { saldo: minToHhmm(s.saldoMin), aVencer: minToHhmm(s.aVencerMin), vencido: minToHhmm(s.vencidoMin) }, pendencias: { advertenciasParaCiencia: adv, avaliacoes: aval, ajustesEmAnalise: ajustes }, ferias: periodos.map((p) => ({ id: p.id, concessivoFim: p.concessivoFim, diasDireito: p.diasDireito, status: p.status })), holerites: hol })
  }))
}
