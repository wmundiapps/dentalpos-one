import { Router, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, requireRole } from '../academico/middleware'
import { qs } from '../core/crud'
import { agregarRespostas } from '../apoio/logic'
import { painelConvenios } from './convenios'
import { investimentosPorDisciplina } from './investimentos'
import { painelGraduacao, painelNiveis, painelPos } from './niveis'
import { Painel, ultimosMeses, painelVazio, semaforoPct, serie1 } from './painelTipos'
import { consolidarPessoas } from './pessoas'
import { DAY, addDias, enviarCsv, fail, inicioDoDia, media, mesChave, pct, round1, round2, seguro, somar, toCsv } from './util2'

// Painéis executivos (reitoria): cada painel devolve { kpis, series, tabelas, avisos } e pode ser
// exportado em CSV (todas as tabelas). Leitura tolerante: falha de uma fonte vira aviso.

const abertoReceber = ['PENDENTE', 'ATRASADO'] as const

async function painelFinanceiro(tenantId: string, meses: number, now: Date): Promise<Painel> {
  const p = painelVazio('financeiro', 'Desempenho financeiro', 'Receita, inadimplência, DRE gerencial e fluxo de caixa (realizado e projetado).', now)
  const ms = ultimosMeses(meses, now)
  const ini = new Date(`${ms[0]}-01T00:00:00Z`)
  const fut = ultimosMeses(4, new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 3, 1)))    // mês atual + próximos 3
  const [ar, ap] = await Promise.all([
    prisma.accountReceivable.findMany({ where: { tenantId, status: { not: 'CANCELADO' }, OR: [{ dataVencimento: { gte: ini } }, { dataPagamento: { gte: ini } }] }, select: { valor: true, status: true, dataVencimento: true, dataPagamento: true }, take: 300_000 }),
    prisma.accountPayable.findMany({ where: { tenantId, status: { not: 'CANCELADO' }, OR: [{ dataVencimento: { gte: ini } }, { dataPagamento: { gte: ini } }] }, select: { valor: true, status: true, dataVencimento: true, dataPagamento: true, categoria: true }, take: 300_000 }),
  ])
  const mapa = () => Object.fromEntries([...ms, ...fut].map((m) => [m, 0])) as Record<string, number>
  const recebido = mapa(), faturado = mapa(), pago = mapa(), aReceber = mapa(), aPagar = mapa()
  const categorias: Record<string, number> = {}
  let vencidoValor = 0, vencidoQtd = 0, faturadoVencido = 0
  for (const r of ar) {
    const mv = mesChave(r.dataVencimento)
    if (mv in faturado) faturado[mv] += r.valor
    if (r.status === 'PAGO' && r.dataPagamento) { const m = mesChave(r.dataPagamento); if (m in recebido) recebido[m] += r.valor }
    else if (r.status !== 'PAGO') {
      if (r.dataVencimento < now) { vencidoValor += r.valor; vencidoQtd++ } else if (mv in aReceber) aReceber[mv] += r.valor
    }
    if (r.dataVencimento < now && r.dataVencimento >= ini) faturadoVencido += r.valor
  }
  for (const r of ap) {
    if (r.status === 'PAGO' && r.dataPagamento) { const m = mesChave(r.dataPagamento); if (m in pago) { pago[m] += r.valor; const c = r.categoria || 'Sem categoria'; categorias[c] = (categorias[c] ?? 0) + r.valor } }
    else if (r.status !== 'PAGO' && r.dataVencimento >= now) { const m = mesChave(r.dataVencimento); if (m in aPagar) aPagar[m] += r.valor }
  }
  const rec12 = somar(ms.map((m) => recebido[m])), des12 = somar(ms.map((m) => pago[m]))
  const inad = pct(vencidoValor, faturadoVencido)
  const apVenc = ap.filter((r) => r.status !== 'PAGO' && r.dataVencimento < now)
  p.kpis = [
    { chave: 'receita', rotulo: `Receita recebida (${meses} meses)`, valor: round2(rec12), unidade: 'R$' },
    { chave: 'despesa', rotulo: `Despesas pagas (${meses} meses)`, valor: round2(des12), unidade: 'R$' },
    { chave: 'resultado', rotulo: 'Resultado do período', valor: round2(rec12 - des12), unidade: 'R$', alerta: rec12 - des12 >= 0 ? 'VERDE' : 'VERMELHO' },
    { chave: 'margem', rotulo: 'Margem', valor: pct(rec12 - des12, rec12), unidade: '%' },
    { chave: 'inadimplencia', rotulo: 'Inadimplência (valor vencido / faturado vencido)', valor: inad, unidade: '%', alerta: semaforoPct(inad, 5, 12) },
    { chave: 'vencido', rotulo: 'Total vencido a receber', valor: round2(vencidoValor), unidade: 'R$' },
    { chave: 'pagarVencido', rotulo: 'Contas a pagar vencidas', valor: apVenc.length, unidade: 'n', alerta: apVenc.length ? 'AMARELO' : 'VERDE' },
  ]
  let acum = 0
  const saldo = ms.map((m) => (acum += recebido[m] - pago[m], round2(acum)))
  p.series = [
    { chave: 'receita-despesa', titulo: 'Receita x despesa (realizado)', tipo: 'linha', unidade: 'R$', rotulos: ms, dados: [{ nome: 'Receita', valores: ms.map((m) => round2(recebido[m])) }, { nome: 'Despesa', valores: ms.map((m) => round2(pago[m])) }] },
    { chave: 'faturado-recebido', titulo: 'Faturado x recebido', tipo: 'barra', unidade: 'R$', rotulos: ms, dados: [{ nome: 'Faturado (vencimento)', valores: ms.map((m) => round2(faturado[m])) }, { nome: 'Recebido', valores: ms.map((m) => round2(recebido[m])) }] },
    { chave: 'saldo', titulo: 'Fluxo de caixa acumulado', tipo: 'linha', unidade: 'R$', rotulos: ms, dados: [{ nome: 'Saldo acumulado', valores: saldo }] },
    { chave: 'projecao', titulo: 'Projeção (mês atual e próximos 3 meses)', tipo: 'barra', unidade: 'R$', rotulos: fut, dados: [{ nome: 'A receber', valores: fut.map((m) => round2(aReceber[m])) }, { nome: 'A pagar', valores: fut.map((m) => round2(aPagar[m])) }] },
  ]
  p.tabelas = [
    { chave: 'dre', titulo: 'DRE gerencial mensal', colunas: [{ key: 'mes', label: 'Mês' }, { key: 'receita', label: 'Receita', tipo: 'moeda' }, { key: 'despesa', label: 'Despesas', tipo: 'moeda' }, { key: 'resultado', label: 'Resultado', tipo: 'moeda' }, { key: 'margemPct', label: 'Margem %', tipo: 'pct' }], linhas: ms.map((m) => ({ mes: m, receita: round2(recebido[m]), despesa: round2(pago[m]), resultado: round2(recebido[m] - pago[m]), margemPct: pct(recebido[m] - pago[m], recebido[m]) })) },
    { chave: 'despesas-categoria', titulo: 'Despesas por categoria', colunas: [{ key: 'categoria', label: 'Categoria' }, { key: 'valor', label: 'Valor', tipo: 'moeda' }, { key: 'pct', label: '%', tipo: 'pct' }], linhas: Object.entries(categorias).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([categoria, valor]) => ({ categoria, valor: round2(valor), pct: pct(valor, des12) })) },
  ]
  p.avisos.push('DRE gerencial por regime de caixa a partir de contas a receber/pagar; não substitui a contabilidade oficial.')
  return p
}

async function painelInfra(tenantId: string, meses: number, now: Date): Promise<Painel> {
  const p = painelVazio('infraestrutura', 'Infraestrutura e manutenção', 'Estado do patrimônio, ordens de serviço, chamados e projetos de melhoria.', now)
  const ms = ultimosMeses(meses, now)
  const ini = new Date(`${ms[0]}-01T00:00:00Z`)
  const [bens, os, chamados, projetos] = await Promise.all([
    prisma.infBem.groupBy({ by: ['estado'], where: { tenantId, status: { not: 'BAIXADO' } }, _count: { _all: true }, _sum: { valorAquisicao: true } }),
    prisma.infOrdemServico.findMany({ where: { tenantId, abertaEm: { gte: ini } }, select: { status: true, tipo: true, abertaEm: true, concluidaEm: true, prazoSla: true, custoMaoObra: true, custoPecas: true, bemParado: true }, take: 100_000 }),
    prisma.infChamado.groupBy({ by: ['status'], where: { tenantId }, _count: { _all: true } }),
    prisma.infProjeto.findMany({ where: { tenantId }, select: { titulo: true, status: true, quantoCusta: true, gastoReal: true, percentual: true }, take: 2000 }),
  ])
  const emManut = await prisma.infBem.count({ where: { tenantId, status: 'EM_MANUTENCAO' } })
  const garantia = await prisma.infBem.count({ where: { tenantId, status: { not: 'BAIXADO' }, garantiaAte: { gte: now, lte: addDias(now, 60) } } })
  const valorPatr = somar(bens.map((b) => b._sum.valorAquisicao))
  const nBens = somar(bens.map((b) => b._count._all))
  const ruins = somar(bens.filter((b) => b.estado === 'RUIM' || b.estado === 'INSERVIVEL').map((b) => b._count._all))
  const abertas = os.filter((o) => !['CONCLUIDA', 'CANCELADA'].includes(o.status))
  const atrasadas = abertas.filter((o) => o.prazoSla < now)
  const conc = os.filter((o) => o.concluidaEm)
  const tmr = media(conc.map((o) => (o.concluidaEm!.getTime() - o.abertaEm.getTime()) / DAY))
  const custoMes: Record<string, number> = Object.fromEntries(ms.map((m) => [m, 0]))
  for (const o of os) { const m = mesChave(o.abertaEm); if (m in custoMes) custoMes[m] += o.custoMaoObra + o.custoPecas }
  const proj = (s: string[]) => projetos.filter((x) => s.includes(x.status))
  p.kpis = [
    { chave: 'bens', rotulo: 'Bens ativos', valor: nBens, unidade: 'n' },
    { chave: 'valorPatrimonial', rotulo: 'Valor de aquisição do patrimônio', valor: round2(valorPatr), unidade: 'R$' },
    { chave: 'ruins', rotulo: 'Bens em estado ruim/inservível', valor: pct(ruins, nBens), unidade: '%', alerta: semaforoPct(pct(ruins, nBens), 5, 15) },
    { chave: 'emManutencao', rotulo: 'Bens em manutenção', valor: emManut, unidade: 'n' },
    { chave: 'osAbertas', rotulo: 'OS abertas', valor: abertas.length, unidade: 'n' },
    { chave: 'osAtrasadas', rotulo: 'OS fora do prazo (SLA)', valor: atrasadas.length, unidade: 'n', alerta: atrasadas.length ? 'VERMELHO' : 'VERDE' },
    { chave: 'tempoMedio', rotulo: 'Tempo médio de resolução', valor: tmr == null ? null : round1(tmr), unidade: 'dias' },
    { chave: 'garantia', rotulo: 'Garantias vencendo em 60 dias', valor: garantia, unidade: 'n' },
    { chave: 'bensParados', rotulo: 'OS com bem parado', valor: abertas.filter((o) => o.bemParado).length, unidade: 'n' },
  ]
  const porStatus = (rows: Array<{ status: string }>) => Object.entries(rows.reduce<Record<string, number>>((m, r) => (m[r.status] = (m[r.status] ?? 0) + 1, m), {}))
  p.series = [
    { chave: 'estado-bens', titulo: 'Estado dos bens', tipo: 'pizza', unidade: 'n', rotulos: bens.map((b) => b.estado), dados: [{ nome: 'Bens', valores: bens.map((b) => b._count._all) }] },
    { chave: 'custo-manutencao', titulo: 'Custo de manutenção por mês', tipo: 'barra', unidade: 'R$', rotulos: ms, dados: [{ nome: 'Custo (mão de obra + peças)', valores: ms.map((m) => round2(custoMes[m])) }] },
    { chave: 'os-status', titulo: 'Ordens de serviço por status', tipo: 'barra', unidade: 'n', rotulos: porStatus(os).map(([k]) => k), dados: [{ nome: 'OS', valores: porStatus(os).map(([, v]) => v) }] },
  ]
  p.tabelas = [
    { chave: 'bens-estado', titulo: 'Patrimônio por estado', colunas: [{ key: 'estado', label: 'Estado' }, { key: 'qtd', label: 'Quantidade', tipo: 'numero' }, { key: 'valor', label: 'Valor de aquisição', tipo: 'moeda' }], linhas: bens.map((b) => ({ estado: b.estado, qtd: b._count._all, valor: round2(b._sum.valorAquisicao ?? 0) })) },
    { chave: 'chamados', titulo: 'Chamados por status', colunas: [{ key: 'status', label: 'Status' }, { key: 'qtd', label: 'Quantidade', tipo: 'numero' }], linhas: chamados.map((c) => ({ status: c.status, qtd: c._count._all })) },
    { chave: 'projetos', titulo: 'Projetos de melhoria (orçado x gasto)', colunas: [{ key: 'titulo', label: 'Projeto' }, { key: 'status', label: 'Status' }, { key: 'quantoCusta', label: 'Orçado', tipo: 'moeda' }, { key: 'gastoReal', label: 'Gasto', tipo: 'moeda' }, { key: 'percentual', label: '% executado', tipo: 'pct' }], linhas: projetos.sort((a, b) => b.quantoCusta - a.quantoCusta).slice(0, 25) },
  ]
  p.kpis.push({ chave: 'projetosOrcado', rotulo: 'Projetos em andamento: orçado', valor: round2(somar(proj(['APROVADO', 'EM_EXECUCAO']).map((x) => x.quantoCusta))), unidade: 'R$' })
  p.kpis.push({ chave: 'projetosGasto', rotulo: 'Projetos em andamento: gasto', valor: round2(somar(proj(['APROVADO', 'EM_EXECUCAO']).map((x) => x.gastoReal))), unidade: 'R$' })
  return p
}

async function painelImplantacao(tenantId: string, now: Date): Promise<Painel> {
  const p = painelVazio('implantacao', 'Implantação de cursos', 'Funil de autorização, reconhecimento e renovação; prazos e atos vigentes.', now)
  const ETAPAS = ['PREPARACAO', 'PROTOCOLADO', 'EM_ANALISE', 'DILIGENCIA', 'AVALIACAO_IN_LOCO', 'DECISAO', 'PUBLICADO', 'ARQUIVADO']
  const TIPOS_CURSO = ['AUTORIZACAO_CURSO', 'RECONHECIMENTO_CURSO', 'RENOVACAO_RECONHECIMENTO', 'ADITAMENTO_VAGAS']
  const procs = await prisma.regProcesso.findMany({ where: { tenantId }, select: { id: true, tipo: true, etapa: true, resultado: true, titulo: true, cursoNome: true, programId: true, protocoladoEm: true, publicadoEm: true, decisaoPrevistaEm: true, prazoProtocolo: true, conceitoObtido: true, updatedAt: true }, take: 5000 })
  const cursoProcs = procs.filter((x) => TIPOS_CURSO.includes(x.tipo))
  const em = (t: string) => cursoProcs.filter((x) => x.tipo === t)
  const dil = await prisma.regDiligencia.findMany({ where: { tenantId, status: { in: ['ABERTA', 'VENCIDA'] } }, select: { prazoResposta: true, status: true }, take: 2000 })
  const atos = await prisma.regAto.findMany({ where: { tenantId, revogado: false, vencimento: { not: null, lte: addDias(now, 365) } }, select: { numero: true, tipo: true, cursoNome: true, vencimento: true }, orderBy: { vencimento: 'asc' }, take: 200 })
  const publicados = cursoProcs.filter((x) => x.publicadoEm && x.protocoladoEm)
  const tempo = media(publicados.map((x) => (x.publicadoEm!.getTime() - x.protocoladoEm!.getTime()) / DAY))
  const progs = await prisma.academicProgram.findMany({ where: { tenantId }, select: { id: true, nome: true }, take: 500 })
  const atosPorCurso = await prisma.regAto.findMany({ where: { tenantId, revogado: false, tipo: { in: ['PORTARIA_AUTORIZACAO', 'PORTARIA_RECONHECIMENTO', 'PORTARIA_RENOVACAO'] }, programId: { not: null } }, select: { programId: true }, take: 5000 })
  const semAto = progs.filter((c) => !atosPorCurso.some((a) => a.programId === c.id))
  const abertos = cursoProcs.filter((x) => !['PUBLICADO', 'ARQUIVADO'].includes(x.etapa))
  p.kpis = [
    { chave: 'processos', rotulo: 'Processos de curso', valor: cursoProcs.length, unidade: 'n' },
    { chave: 'emAndamento', rotulo: 'Em andamento', valor: abertos.length, unidade: 'n' },
    { chave: 'diligencias', rotulo: 'Diligências abertas', valor: dil.length, unidade: 'n', alerta: dil.some((d) => d.prazoResposta < now) ? 'VERMELHO' : dil.length ? 'AMARELO' : 'VERDE' },
    { chave: 'tempoMedio', rotulo: 'Tempo médio protocolo → publicação', valor: tempo == null ? null : Math.round(tempo), unidade: 'dias' },
    { chave: 'deferidos', rotulo: 'Deferidos', valor: cursoProcs.filter((x) => x.resultado === 'DEFERIDO').length, unidade: 'n' },
    { chave: 'indeferidos', rotulo: 'Indeferidos', valor: cursoProcs.filter((x) => x.resultado === 'INDEFERIDO').length, unidade: 'n', alerta: cursoProcs.some((x) => x.resultado === 'INDEFERIDO') ? 'AMARELO' : 'VERDE' },
    { chave: 'semAto', rotulo: 'Cursos sem ato de autorização/reconhecimento', valor: semAto.length, unidade: 'n', alerta: semAto.length ? 'AMARELO' : 'VERDE' },
  ]
  p.series = [
    serie1('funil', 'Funil de processos (todas as etapas)', 'barra', ETAPAS.map((e) => ({ rotulo: e, valor: cursoProcs.filter((x) => x.etapa === e).length })), 'n'),
    { chave: 'tipo-etapa', titulo: 'Processos por tipo', tipo: 'barra', unidade: 'n', rotulos: TIPOS_CURSO, dados: [{ nome: 'Em andamento', valores: TIPOS_CURSO.map((t) => em(t).filter((x) => !['PUBLICADO', 'ARQUIVADO'].includes(x.etapa)).length) }, { nome: 'Publicados', valores: TIPOS_CURSO.map((t) => em(t).filter((x) => x.etapa === 'PUBLICADO').length) }] },
  ]
  p.tabelas = [
    { chave: 'processos-andamento', titulo: 'Processos em andamento', colunas: [{ key: 'titulo', label: 'Processo' }, { key: 'tipo', label: 'Tipo' }, { key: 'etapa', label: 'Etapa' }, { key: 'diasNaEtapa', label: 'Dias na etapa', tipo: 'numero' }, { key: 'decisaoPrevistaEm', label: 'Decisão prevista', tipo: 'data' }], linhas: abertos.map((x) => ({ titulo: x.titulo, tipo: x.tipo, etapa: x.etapa, diasNaEtapa: Math.floor((now.getTime() - x.updatedAt.getTime()) / DAY), decisaoPrevistaEm: x.decisaoPrevistaEm })) },
    { chave: 'atos-vencendo', titulo: 'Atos que vencem em 12 meses', colunas: [{ key: 'numero', label: 'Ato' }, { key: 'tipo', label: 'Tipo' }, { key: 'cursoNome', label: 'Curso' }, { key: 'vencimento', label: 'Vencimento', tipo: 'data' }], linhas: atos },
    { chave: 'cursos-sem-ato', titulo: 'Cursos sem ato vinculado', colunas: [{ key: 'nome', label: 'Curso' }], linhas: semAto.map((c) => ({ nome: c.nome })) },
  ]
  return p
}

async function painelInvestimentos(tenantId: string, meses: number, now: Date): Promise<Painel> {
  const p = painelVazio('investimentos', 'Gastos e investimentos por disciplina', 'Melhorias e equipamentos vinculados às disciplinas, com rateio e custo por aluno.', now)
  const r = await investimentosPorDisciplina(tenantId)
  const ms = ultimosMeses(meses, now)
  const ini = new Date(`${ms[0]}-01T00:00:00Z`)
  const invs = await prisma.reiInvestimento.findMany({ where: { tenantId, status: { not: 'CANCELADO' }, data: { gte: ini } }, select: { data: true, valor: true, tipo: true }, take: 50_000 })
  const mm: Record<string, { m: number; e: number }> = Object.fromEntries(ms.map((m) => [m, { m: 0, e: 0 }]))
  for (const i of invs) { const k = mesChave(i.data); if (!mm[k]) continue; if (i.tipo === 'EQUIPAMENTO') mm[k].e += i.valor; else mm[k].m += i.valor }
  const vinc = r.linhas.filter((l) => l.disciplineId)
  p.kpis = [
    { chave: 'total', rotulo: 'Total investido (registrado)', valor: r.totalGeral, unidade: 'R$' },
    { chave: 'itens', rotulo: 'Investimentos', valor: r.investimentos, unidade: 'n' },
    { chave: 'disciplinas', rotulo: 'Disciplinas beneficiadas', valor: vinc.length, unidade: 'n' },
    { chave: 'semVinculo', rotulo: 'Sem vínculo com disciplina', valor: r.semVinculo, unidade: 'n', alerta: r.semVinculo ? 'AMARELO' : 'VERDE' },
    { chave: 'equip', rotulo: 'Em equipamentos', valor: round2(r.porTipo.EQUIPAMENTO ?? 0), unidade: 'R$' },
    { chave: 'melh', rotulo: 'Em melhorias', valor: round2((r.porTipo.MELHORIA ?? 0) + (r.porTipo.REFORMA ?? 0)), unidade: 'R$' },
  ]
  p.series = [
    { chave: 'mes', titulo: 'Investimento por mês', tipo: 'barra', unidade: 'R$', rotulos: ms, dados: [{ nome: 'Melhorias/reformas/outros', valores: ms.map((m) => round2(mm[m].m)) }, { nome: 'Equipamentos', valores: ms.map((m) => round2(mm[m].e)) }] },
    serie1('top-disciplinas', 'Maiores investimentos por disciplina', 'barra', vinc.slice(0, 10).map((l) => ({ rotulo: l.disciplina, valor: l.total })), 'R$'),
  ]
  p.tabelas = [{ chave: 'por-disciplina', titulo: 'Investimento por disciplina', colunas: [{ key: 'disciplina', label: 'Disciplina' }, { key: 'melhorias', label: 'Melhorias', tipo: 'moeda' }, { key: 'equipamentos', label: 'Equipamentos', tipo: 'moeda' }, { key: 'outros', label: 'Outros', tipo: 'moeda' }, { key: 'total', label: 'Total', tipo: 'moeda' }, { key: 'alunos', label: 'Alunos', tipo: 'numero' }, { key: 'valorPorAluno', label: 'R$/aluno', tipo: 'moeda' }], linhas: r.linhas }]
  return p
}

async function painelCipa(tenantId: string, now: Date): Promise<Painel> {
  const p = painelVazio('cipa', 'CIPA', 'Andamento das reuniões, mapa de riscos, plano de ação, inspeções e acidentes.', now)
  const gestao = await prisma.govCipaGestao.findFirst({ where: { tenantId, status: { in: ['VIGENTE', 'ELEICAO'] } }, orderBy: { inicio: 'desc' }, include: { _count: { select: { membros: true } } } })
  const reunioes = gestao ? await prisma.govCipaReuniao.findMany({ where: { tenantId, gestaoId: gestao.id }, orderBy: { data: 'asc' }, take: 60 }) : []
  const riscos = await prisma.govCipaRisco.findMany({ where: { tenantId }, select: { local: true, agente: true, nivel: true, status: true, gravidade: true, probabilidade: true, descricao: true, pontuacao: true }, take: 2000 })
  const planos = await prisma.govCipaPlanoAcao.findMany({ where: { tenantId }, select: { acao: true, status: true, prazo: true }, take: 2000 })
  const insp = await prisma.govCipaInspecao.findMany({ where: { tenantId }, select: { data: true, local: true, realizada: true }, take: 500 })
  const acid = await prisma.govCipaAcidente.findMany({ where: { tenantId, data: { gte: addDias(now, -365) } }, select: { gravidade: true, catObrigatoria: true, catEmitida: true, tipo: true }, take: 2000 })
  const passadas = reunioes.filter((r) => r.data < now)
  const realizadas = reunioes.filter((r) => r.realizada)
  const nao = passadas.filter((r) => !r.realizada)
  const riscosAbertos = riscos.filter((r) => r.status !== 'CONTROLADO' && r.status !== 'ENCERRADO' && r.status !== 'ELIMINADO')
  const planosAbertos = planos.filter((x) => !['CONCLUIDA', 'CANCELADA'].includes(x.status))
  const planosAtrasados = planosAbertos.filter((x) => x.prazo < now)
  const catPend = acid.filter((a) => a.catObrigatoria && !a.catEmitida).length
  const porNivel = (n: string) => riscosAbertos.filter((r) => r.nivel === n).length
  p.kpis = [
    { chave: 'gestao', rotulo: 'Gestão', valor: gestao ? `${gestao.nome} (${gestao.status})` : 'Sem gestão cadastrada' },
    { chave: 'membros', rotulo: 'Membros', valor: gestao?._count.membros ?? 0, unidade: 'n' },
    { chave: 'reunioes', rotulo: 'Reuniões realizadas / previstas até hoje', valor: `${realizadas.length}/${passadas.length}` },
    { chave: 'reunioesAtraso', rotulo: 'Reuniões previstas não realizadas', valor: nao.length, unidade: 'n', alerta: nao.length ? 'VERMELHO' : 'VERDE' },
    { chave: 'riscosAbertos', rotulo: 'Riscos em aberto', valor: riscosAbertos.length, unidade: 'n' },
    { chave: 'riscosAltos', rotulo: 'Riscos altos/críticos', valor: porNivel('ALTO') + porNivel('CRITICO'), unidade: 'n', alerta: porNivel('ALTO') + porNivel('CRITICO') ? 'VERMELHO' : 'VERDE' },
    { chave: 'planosAtrasados', rotulo: 'Ações do plano atrasadas', valor: planosAtrasados.length, unidade: 'n', alerta: planosAtrasados.length ? 'VERMELHO' : 'VERDE' },
    { chave: 'acidentes', rotulo: 'Acidentes (12 meses)', valor: acid.length, unidade: 'n' },
    { chave: 'catPendente', rotulo: 'CAT obrigatória pendente', valor: catPend, unidade: 'n', alerta: catPend ? 'VERMELHO' : 'VERDE' },
  ]
  const agentes = ['FISICO', 'QUIMICO', 'BIOLOGICO', 'ERGONOMICO', 'ACIDENTE']
  p.series = [
    serie1('riscos-agente', 'Riscos em aberto por agente', 'barra', agentes.map((a) => ({ rotulo: a, valor: riscosAbertos.filter((r) => r.agente === a).length })), 'n'),
    serie1('riscos-nivel', 'Riscos em aberto por nível', 'pizza', ['BAIXO', 'MEDIO', 'ALTO', 'CRITICO'].map((n) => ({ rotulo: n, valor: porNivel(n) })), 'n'),
  ]
  const matriz: Array<Record<string, any>> = [5, 4, 3, 2, 1].map((g) => ({ gravidade: `Gravidade ${g}`, ...Object.fromEntries([1, 2, 3, 4, 5].map((pr) => [`p${pr}`, riscosAbertos.filter((r) => r.gravidade === g && r.probabilidade === pr).length])) }))
  p.tabelas = [
    { chave: 'mapa-riscos', titulo: 'Mapa de riscos (gravidade x probabilidade)', colunas: [{ key: 'gravidade', label: '' }, ...[1, 2, 3, 4, 5].map((n) => ({ key: `p${n}`, label: `Prob. ${n}`, tipo: 'numero' as const }))], linhas: matriz },
    { chave: 'riscos', titulo: 'Riscos em aberto', colunas: [{ key: 'local', label: 'Local' }, { key: 'agente', label: 'Agente' }, { key: 'nivel', label: 'Nível' }, { key: 'pontuacao', label: 'Pontos', tipo: 'numero' }, { key: 'descricao', label: 'Descrição' }], linhas: riscosAbertos.sort((a, b) => b.pontuacao - a.pontuacao).slice(0, 30) },
    { chave: 'reunioes', titulo: 'Reuniões da gestão', colunas: [{ key: 'competencia', label: 'Competência' }, { key: 'data', label: 'Data', tipo: 'data' }, { key: 'realizada', label: 'Realizada' }], linhas: reunioes.map((r) => ({ competencia: r.competencia, data: r.data, realizada: r.realizada ? 'Sim' : r.data < now ? 'NÃO (atrasada)' : 'Agendada' })) },
    { chave: 'pendencias', titulo: 'Pendências (plano de ação e inspeções)', colunas: [{ key: 'item', label: 'Item' }, { key: 'prazo', label: 'Prazo', tipo: 'data' }, { key: 'situacao', label: 'Situação' }], linhas: [...planosAbertos.map((x) => ({ item: x.acao, prazo: x.prazo, situacao: x.prazo < now ? 'ATRASADA' : x.status })), ...insp.filter((i) => !i.realizada).map((i) => ({ item: `Inspeção: ${i.local}`, prazo: i.data, situacao: i.data < now ? 'ATRASADA' : 'AGENDADA' }))] },
  ]
  if (!gestao) p.avisos.push('Nenhuma gestão da CIPA vigente ou em eleição.')
  return p
}

async function painelProvas(tenantId: string, now: Date): Promise<Painel> {
  const p = painelVazio('provas', 'Desempenho de alunos em provas', 'ENADE/OAB e exames externos (edições) e simulados internos.', now)
  const edicoes = await prisma.desEdicao.findMany({ where: { tenantId }, orderBy: [{ ano: 'desc' }], take: 12, include: { exame: { select: { nome: true, tipo: true } }, inscricoes: { select: { situacao: true, nota: true, conceito: true } } } })
  const tents = await prisma.desTentativa.groupBy({ by: ['simuladoId'], where: { tenantId, status: 'ENVIADA' }, _count: { _all: true }, _avg: { percentual: true } })
  const sims = await prisma.desSimulado.findMany({ where: { tenantId, id: { in: tents.map((t) => t.simuladoId) } }, select: { id: true, titulo: true }, take: 500 })
  const nomeSim = new Map(sims.map((s) => [s.id, s.titulo]))
  const linhasEd = edicoes.map((e) => {
    const ins = e.inscricoes
    const notas = ins.map((i) => i.nota)
    return { exame: e.exame.nome, tipo: e.exame.tipo, ano: e.ano, inscritos: ins.length, ausentes: ins.filter((i) => i.situacao === 'AUSENTE').length, notaMedia: media(notas), conceitoMedio: media(ins.map((i) => i.conceito)) }
  })
  const mediaSim = media(tents.map((t) => t._avg.percentual))
  const tentTotal = somar(tents.map((t) => t._count._all))
  const comNota = linhasEd.filter((l) => l.notaMedia != null)
  p.kpis = [
    { chave: 'edicoes', rotulo: 'Edições de exames registradas', valor: edicoes.length, unidade: 'n' },
    { chave: 'inscritos', rotulo: 'Inscritos (últimas edições)', valor: somar(linhasEd.map((l) => l.inscritos)), unidade: 'n' },
    { chave: 'notaMedia', rotulo: 'Nota média nos exames', valor: media(comNota.map((l) => l.notaMedia)), unidade: 'nota' },
    { chave: 'simulados', rotulo: 'Tentativas de simulados', valor: tentTotal, unidade: 'n' },
    { chave: 'mediaSimulados', rotulo: 'Acerto médio nos simulados', valor: mediaSim == null ? null : round1(mediaSim), unidade: '%' },
  ]
  p.series = [
    serie1('nota-edicao', 'Nota média por edição', 'barra', linhasEd.filter((l) => l.notaMedia != null).reverse().map((l) => ({ rotulo: `${l.exame} ${l.ano}`, valor: l.notaMedia as number }))),
    serie1('simulados', 'Acerto médio por simulado (%)', 'barra', tents.slice(0, 12).map((t) => ({ rotulo: nomeSim.get(t.simuladoId) ?? t.simuladoId.slice(0, 6), valor: round1(t._avg.percentual ?? 0) })), '%'),
  ]
  p.tabelas = [
    { chave: 'edicoes', titulo: 'Exames externos por edição', colunas: [{ key: 'exame', label: 'Exame' }, { key: 'ano', label: 'Ano', tipo: 'numero' }, { key: 'inscritos', label: 'Inscritos', tipo: 'numero' }, { key: 'ausentes', label: 'Ausentes', tipo: 'numero' }, { key: 'notaMedia', label: 'Nota média', tipo: 'numero' }, { key: 'conceitoMedio', label: 'Conceito médio', tipo: 'numero' }], linhas: linhasEd },
    { chave: 'simulados', titulo: 'Simulados', colunas: [{ key: 'simulado', label: 'Simulado' }, { key: 'tentativas', label: 'Tentativas', tipo: 'numero' }, { key: 'media', label: 'Acerto médio %', tipo: 'pct' }], linhas: tents.map((t) => ({ simulado: nomeSim.get(t.simuladoId) ?? t.simuladoId, tentativas: t._count._all, media: t._avg.percentual == null ? null : round1(t._avg.percentual) })) },
  ]
  return p
}

async function painelProfessores(tenantId: string, now: Date): Promise<Painel> {
  const p = painelVazio('professores', 'Avaliação de professores', 'Resultados das pesquisas de avaliação docente (resultados ocultos abaixo do mínimo de respostas).', now)
  const desde = addDias(now, -730)
  const apps = await prisma.apoAplicacao.findMany({ where: { tenantId, alvoTipo: { in: ['DOCENTE', 'DISCIPLINA'] }, professorUserId: { not: null }, status: { in: ['ENCERRADA', 'PUBLICADA'] }, abertura: { gte: desde } }, include: { instrumento: true }, take: 500 })
  const users = await prisma.user.findMany({ where: { tenantId, id: { in: apps.map((a) => a.professorUserId!) } }, select: { id: true, firstName: true, lastName: true } })
  const nome = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]))
  const linhas: any[] = []
  for (const a of apps) {
    const rs = await prisma.apoResposta.findMany({ where: { tenantId, aplicacaoId: a.id }, select: { respostas: true, nps: true, comentario: true } })
    const agg: any = agregarRespostas(a.instrumento.perguntas as any, rs.map((r) => ({ respostas: r.respostas as any, nps: r.nps, comentario: r.comentario })), a.minRespostas ?? a.instrumento.minRespostas, a.convidados)
    linhas.push({ professor: nome.get(a.professorUserId!) ?? '(removido)', aplicacao: a.titulo, disciplina: a.alvoRotulo ?? '', respostas: agg.n, taxaResposta: agg.taxaResposta, media: agg.suprimido ? null : agg.mediaGeral, escalaMax: a.instrumento.escalaMax, suprimido: agg.suprimido ? 'Sim' : 'Não' })
  }
  const vis = linhas.filter((l) => l.media != null)
  const geral = media(vis.map((l) => (l.media / l.escalaMax) * 5))
  p.kpis = [
    { chave: 'aplicacoes', rotulo: 'Avaliações aplicadas (24 meses)', valor: apps.length, unidade: 'n' },
    { chave: 'media', rotulo: 'Média geral (0 a 5)', valor: geral, unidade: 'nota', alerta: semaforoPct(geral, 4, 3, false) },
    { chave: 'suprimidas', rotulo: 'Ocultas por baixo nº de respostas', valor: linhas.length - vis.length, unidade: 'n' },
    { chave: 'taxa', rotulo: 'Taxa média de resposta', valor: media(linhas.map((l) => l.taxaResposta)), unidade: '%' },
  ]
  const dist = [['≥ 4,5', (x: number) => x >= 4.5], ['4,0 a 4,5', (x: number) => x >= 4 && x < 4.5], ['3,0 a 4,0', (x: number) => x >= 3 && x < 4], ['< 3,0', (x: number) => x < 3]] as const
  p.series = [serie1('faixas', 'Docentes por faixa de nota', 'pizza', dist.map(([r, f]) => ({ rotulo: r, valor: vis.filter((l) => f((l.media / l.escalaMax) * 5)).length })), 'n')]
  p.tabelas = [{ chave: 'ranking', titulo: 'Resultados por docente/aplicação', colunas: [{ key: 'professor', label: 'Professor' }, { key: 'aplicacao', label: 'Aplicação' }, { key: 'disciplina', label: 'Alvo' }, { key: 'respostas', label: 'Respostas', tipo: 'numero' }, { key: 'taxaResposta', label: 'Taxa %', tipo: 'pct' }, { key: 'media', label: 'Média', tipo: 'numero' }, { key: 'suprimido', label: 'Oculto' }], linhas: [...vis.sort((a, b) => b.media / b.escalaMax - a.media / a.escalaMax), ...linhas.filter((l) => l.media == null)] }]
  return p
}

async function painelVestibular(tenantId: string, now: Date): Promise<Painel> {
  const p = painelVazio('vestibular', 'Campanhas e vestibular', 'Funil de candidatos, relação candidato/vaga, conversão e custo de aquisição por campanha.', now)
  const procs = await prisma.admProcessoSeletivo.findMany({ where: { tenantId }, orderBy: { inscricaoInicio: 'desc' }, take: 8, select: { id: true, nome: true, status: true, nivel: true } })
  const ids = procs.map((x) => x.id)
  const [ofertas, cands, camps, gastos, candCamp] = await Promise.all([
    prisma.admOferta.groupBy({ by: ['processoId'], where: { tenantId, processoId: { in: ids } }, _sum: { vagas: true } }),
    prisma.admCandidato.groupBy({ by: ['processoId', 'status'], where: { tenantId, processoId: { in: ids } }, _count: { _all: true } }),
    prisma.admCampanha.findMany({ where: { tenantId }, orderBy: { inicio: 'desc' }, take: 30 }),
    prisma.admCampanhaGasto.groupBy({ by: ['campanhaId'], where: { tenantId }, _sum: { valor: true } }),
    prisma.admCandidato.groupBy({ by: ['campanhaId', 'status'], where: { tenantId, campanhaId: { not: null } }, _count: { _all: true } }),
  ])
  const linhas = procs.map((pr) => {
    const vagas = ofertas.find((o) => o.processoId === pr.id)?._sum.vagas ?? 0
    const c = (s?: string) => somar(cands.filter((x) => x.processoId === pr.id && (!s || x.status === s)).map((x) => x._count._all))
    const total = c(), leads = c('LEAD'), inscritos = total - leads, matr = c('MATRICULADO')
    return { processo: pr.nome, nivel: pr.nivel, status: pr.status, vagas, inscritos, candidatoPorVaga: vagas ? round1(inscritos / vagas) : null, aprovados: c('APROVADO') + c('CONVOCADO') + matr, matriculados: matr, conversaoPct: pct(matr, inscritos), ocupacaoPct: pct(matr, vagas) }
  })
  const linhasCamp = camps.map((c) => {
    const gasto = gastos.find((g) => g.campanhaId === c.id)?._sum.valor ?? 0
    const n = (s?: string) => somar(candCamp.filter((x) => x.campanhaId === c.id && (!s || x.status === s)).map((x) => x._count._all))
    const matr = n('MATRICULADO'), tot = n()
    return { campanha: c.nome, canal: c.canal, status: c.status, orcamento: c.orcamento, gasto: round2(gasto), candidatos: tot, matriculas: matr, metaMatriculas: c.metaMatriculas, custoPorCandidato: tot ? round2(gasto / tot) : null, cac: matr ? round2(gasto / matr) : null }
  })
  const totInsc = somar(linhas.map((l) => l.inscritos)), totMat = somar(linhas.map((l) => l.matriculados)), totVagas = somar(linhas.map((l) => l.vagas))
  const gastoTotal = somar(linhasCamp.map((l) => l.gasto)), matCamp = somar(linhasCamp.map((l) => l.matriculas))
  p.kpis = [
    { chave: 'processos', rotulo: 'Processos seletivos (recentes)', valor: procs.length, unidade: 'n' },
    { chave: 'vagas', rotulo: 'Vagas ofertadas', valor: totVagas, unidade: 'n' },
    { chave: 'inscritos', rotulo: 'Inscritos', valor: totInsc, unidade: 'n' },
    { chave: 'candVaga', rotulo: 'Candidatos por vaga', valor: totVagas ? round1(totInsc / totVagas) : null, unidade: 'n' },
    { chave: 'matriculados', rotulo: 'Matriculados', valor: totMat, unidade: 'n' },
    { chave: 'conversao', rotulo: 'Conversão inscrito → matrícula', valor: pct(totMat, totInsc), unidade: '%' },
    { chave: 'gasto', rotulo: 'Investimento em campanhas', valor: round2(gastoTotal), unidade: 'R$' },
    { chave: 'cac', rotulo: 'Custo por matrícula (campanhas)', valor: matCamp ? round2(gastoTotal / matCamp) : null, unidade: 'R$' },
  ]
  p.series = [
    { chave: 'funil', titulo: 'Vagas x inscritos x matriculados', tipo: 'barra', unidade: 'n', rotulos: linhas.map((l) => l.processo), dados: [{ nome: 'Vagas', valores: linhas.map((l) => l.vagas) }, { nome: 'Inscritos', valores: linhas.map((l) => l.inscritos) }, { nome: 'Matriculados', valores: linhas.map((l) => l.matriculados) }] },
    serie1('cac', 'Custo por matrícula por campanha', 'barra', linhasCamp.filter((c) => c.cac != null).map((c) => ({ rotulo: c.campanha, valor: c.cac as number })), 'R$'),
  ]
  p.tabelas = [
    { chave: 'processos', titulo: 'Processos seletivos', colunas: [{ key: 'processo', label: 'Processo' }, { key: 'status', label: 'Status' }, { key: 'vagas', label: 'Vagas', tipo: 'numero' }, { key: 'inscritos', label: 'Inscritos', tipo: 'numero' }, { key: 'candidatoPorVaga', label: 'Cand./vaga', tipo: 'numero' }, { key: 'matriculados', label: 'Matriculados', tipo: 'numero' }, { key: 'conversaoPct', label: 'Conversão %', tipo: 'pct' }, { key: 'ocupacaoPct', label: 'Ocupação %', tipo: 'pct' }], linhas },
    { chave: 'campanhas', titulo: 'Campanhas', colunas: [{ key: 'campanha', label: 'Campanha' }, { key: 'canal', label: 'Canal' }, { key: 'orcamento', label: 'Orçamento', tipo: 'moeda' }, { key: 'gasto', label: 'Gasto', tipo: 'moeda' }, { key: 'candidatos', label: 'Candidatos', tipo: 'numero' }, { key: 'matriculas', label: 'Matrículas', tipo: 'numero' }, { key: 'custoPorCandidato', label: 'R$/candidato', tipo: 'moeda' }, { key: 'cac', label: 'R$/matrícula', tipo: 'moeda' }], linhas: linhasCamp },
  ]
  return p
}

async function painelPublicacoes(tenantId: string, now: Date): Promise<Painel> {
  const p = painelVazio('publicacoes', 'Publicações e produção científica', 'Produção por ano, tipo e qualificação; citações.', now)
  const pubs = await prisma.pesPublicacao.findMany({ where: { tenantId }, select: { tipo: true, ano: true, qualis: true, citacoes: true, titulo: true, veiculo: true }, take: 100_000 })
  const a0 = now.getUTCFullYear()
  const anos = Array.from({ length: 6 }, (_, k) => a0 - 5 + k)
  const tipos = [...new Set(pubs.map((x) => x.tipo))]
  const alto = pubs.filter((x) => x.qualis && /^(A|B1)/i.test(x.qualis)).length
  p.kpis = [
    { chave: 'total', rotulo: 'Publicações', valor: pubs.length, unidade: 'n' },
    { chave: 'ano', rotulo: `Em ${a0}`, valor: pubs.filter((x) => x.ano === a0).length, unidade: 'n' },
    { chave: 'qualis', rotulo: 'Qualis A/B1', valor: alto, unidade: 'n' },
    { chave: 'citacoes', rotulo: 'Citações', valor: somar(pubs.map((x) => x.citacoes)), unidade: 'n' },
  ]
  p.series = [
    { chave: 'ano-tipo', titulo: 'Publicações por ano e tipo', tipo: 'barra', unidade: 'n', rotulos: anos.map(String), dados: tipos.map((t) => ({ nome: t, valores: anos.map((a) => pubs.filter((x) => x.tipo === t && x.ano === a).length) })) },
    serie1('tipo', 'Por tipo', 'pizza', tipos.map((t) => ({ rotulo: t, valor: pubs.filter((x) => x.tipo === t).length })), 'n'),
  ]
  p.tabelas = [{ chave: 'mais-citadas', titulo: 'Mais citadas', colunas: [{ key: 'titulo', label: 'Título' }, { key: 'veiculo', label: 'Veículo' }, { key: 'ano', label: 'Ano', tipo: 'numero' }, { key: 'qualis', label: 'Qualis' }, { key: 'citacoes', label: 'Citações', tipo: 'numero' }], linhas: [...pubs].sort((a, b) => b.citacoes - a.citacoes).slice(0, 15) }]
  return p
}

async function painelConveniosP(tenantId: string, now: Date): Promise<Painel> {
  const p = painelVazio('convenios', 'Acordos e convênios', 'Vigência, alertas de vencimento e valores.', now)
  const r = await painelConvenios(tenantId, now)
  p.kpis = [
    { chave: 'vigentes', rotulo: 'Vigentes', valor: r.vigentes, unidade: 'n' },
    { chave: 'vencidos', rotulo: 'Vencidos não encerrados', valor: r.vencidosNaoEncerrados, unidade: 'n', alerta: r.vencidosNaoEncerrados ? 'VERMELHO' : 'VERDE' },
    { chave: 'v30', rotulo: 'Vencem em 30 dias', valor: r.vencendoEm30, unidade: 'n', alerta: r.vencendoEm30 ? 'AMARELO' : 'VERDE' },
    { chave: 'v90', rotulo: 'Vencem em 90 dias', valor: r.vencendoEm90, unidade: 'n' },
    { chave: 'valor', rotulo: 'Valor dos vigentes', valor: round2(r.valorVigente), unidade: 'R$' },
    { chave: 'intl', rotulo: 'Internacionais', valor: r.internacionais, unidade: 'n' },
  ]
  p.series = [serie1('tipo', 'Convênios por tipo', 'pizza', Object.entries(r.porTipo).map(([rotulo, valor]) => ({ rotulo, valor })), 'n')]
  p.tabelas = [{ chave: 'alertas', titulo: 'Alertas de vigência', colunas: [{ key: 'numero', label: 'Número' }, { key: 'titulo', label: 'Título' }, { key: 'parteNome', label: 'Parte' }, { key: 'fim', label: 'Fim', tipo: 'data' }, { key: 'diasRestantes', label: 'Dias', tipo: 'numero' }, { key: 'situacao', label: 'Situação' }], linhas: r.alertas }]
  return p
}

async function painelPessoasP(tenantId: string, now: Date): Promise<Painel> {
  const p = painelVazio('pessoas', 'Avaliação de funcionários', 'Resumos agregados por setor (sem dados individuais); integra o módulo de RH quando disponível.', now)
  const r = await consolidarPessoas(tenantId)
  p.kpis = [
    { chave: 'ciclo', rotulo: 'Ciclo mais recente', valor: r.ciclo ?? '—' },
    { chave: 'avaliados', rotulo: 'Avaliados', valor: r.totais.avaliados, unidade: 'n' },
    { chave: 'concluidas', rotulo: 'Avaliações concluídas', valor: r.totais.concluidas, unidade: 'n' },
    { chave: 'adesao', rotulo: 'Adesão', valor: pct(r.totais.concluidas, r.totais.avaliados), unidade: '%' },
    { chave: 'nota', rotulo: 'Nota média (0 a 5)', valor: r.totais.notaMedia5, unidade: 'nota' },
    { chave: 'suprimidos', rotulo: 'Setores ocultos (grupo pequeno)', valor: r.totais.suprimidos, unidade: 'n' },
  ]
  const visiveis = r.linhas.filter((l) => !l.suprimido && (!r.ciclo || l.ciclo === r.ciclo) && l.notaMedia5 != null)
  p.series = [serie1('setor', 'Nota média por setor (0 a 5)', 'barra', visiveis.map((l) => ({ rotulo: l.setor, valor: l.notaMedia5 as number }))), serie1('grupo', 'Avaliados por grupo', 'pizza', Object.entries(r.porGrupo).map(([rotulo, v]: any) => ({ rotulo, valor: v.avaliados })), 'n')]
  p.tabelas = [{ chave: 'setores', titulo: 'Resumo por setor', colunas: [{ key: 'ciclo', label: 'Ciclo' }, { key: 'setor', label: 'Setor' }, { key: 'grupo', label: 'Grupo' }, { key: 'avaliados', label: 'Avaliados', tipo: 'numero' }, { key: 'concluidas', label: 'Concluídas', tipo: 'numero' }, { key: 'adesaoPct', label: 'Adesão %', tipo: 'pct' }, { key: 'notaMedia5', label: 'Nota (0-5)', tipo: 'numero' }, { key: 'fonte', label: 'Fonte' }, { key: 'suprimido', label: 'Oculto' }], linhas: r.linhas.map((l) => ({ ...l, suprimido: l.suprimido ? 'Sim (< 3 avaliados)' : '' })) }]
  if (!r.rhDisponivel) p.avisos.push('Módulo de RH sem ciclos de avaliação: exibindo apenas resumos lançados manualmente.')
  return p
}

type Gerador = (tenantId: string, o: { meses: number; now: Date }) => Promise<Painel>
export const PAINEIS: Array<{ id: string; titulo: string; grupo: string; gerar: Gerador }> = [
  { id: 'financeiro', titulo: 'Desempenho financeiro', grupo: 'Gestão', gerar: (t, o) => painelFinanceiro(t, o.meses, o.now) },
  { id: 'infraestrutura', titulo: 'Infraestrutura e manutenção', grupo: 'Gestão', gerar: (t, o) => painelInfra(t, o.meses, o.now) },
  { id: 'implantacao', titulo: 'Implantação de cursos', grupo: 'Gestão', gerar: (t, o) => painelImplantacao(t, o.now) },
  { id: 'investimentos', titulo: 'Investimentos por disciplina', grupo: 'Gestão', gerar: (t, o) => painelInvestimentos(t, o.meses, o.now) },
  { id: 'cipa', titulo: 'CIPA', grupo: 'Gestão', gerar: (t, o) => painelCipa(t, o.now) },
  { id: 'convenios', titulo: 'Acordos e convênios', grupo: 'Gestão', gerar: (t, o) => painelConveniosP(t, o.now) },
  { id: 'pessoas', titulo: 'Avaliação de funcionários', grupo: 'Pessoas', gerar: (t, o) => painelPessoasP(t, o.now) },
  { id: 'professores', titulo: 'Avaliação de professores', grupo: 'Pessoas', gerar: (t, o) => painelProfessores(t, o.now) },
  { id: 'provas', titulo: 'Desempenho em provas', grupo: 'Acadêmico', gerar: (t, o) => painelProvas(t, o.now) },
  { id: 'vestibular', titulo: 'Campanhas e vestibular', grupo: 'Acadêmico', gerar: (t, o) => painelVestibular(t, o.now) },
  { id: 'publicacoes', titulo: 'Publicações', grupo: 'Acadêmico', gerar: (t, o) => painelPublicacoes(t, o.now) },
  { id: 'niveis', titulo: 'Graduação e pós (consolidado)', grupo: 'Níveis', gerar: (t, o) => painelNiveis(t, o.now) },
  { id: 'graduacao', titulo: 'Graduação', grupo: 'Níveis', gerar: (t, o) => painelGraduacao(t, o.now) },
  { id: 'pos-lato', titulo: 'Pós lato sensu', grupo: 'Níveis', gerar: (t, o) => painelPos(t, 'LATO', o.now) },
  { id: 'pos-stricto', titulo: 'Pós stricto sensu', grupo: 'Níveis', gerar: (t, o) => painelPos(t, 'STRICTO', o.now) },
]

export function painelParaCsv(p: Painel): string {
  const partes: string[] = []
  partes.push(toCsv([{ key: 'rotulo', label: 'Indicador' }, { key: 'valor', label: 'Valor' }, { key: 'unidade', label: 'Unidade' }], p.kpis.map((k) => ({ rotulo: k.rotulo, valor: k.valor, unidade: k.unidade ?? '' }))).replace(/^﻿/, ''))
  for (const t of p.tabelas) partes.push(`\r\n${t.titulo}\r\n` + toCsv(t.colunas, t.linhas).replace(/^﻿/, ''))
  return '﻿' + `${p.titulo};gerado em ${p.geradoEm}\r\n` + partes.join('')
}

void inicioDoDia; void seguro

export function registerPaineis(router: Router) {
  router.get('/paineis', requireRole('COORDINATOR'), asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
    res.json(PAINEIS.map(({ id, titulo, grupo }) => ({ id, titulo, grupo })))
  }))

  router.get('/paineis/:id', requireRole('COORDINATOR'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const def = PAINEIS.find((x) => x.id === String(req.params.id))
    if (!def) return res.status(404).json({ error: 'Painel não encontrado.' })
    const meses = Math.min(24, Math.max(3, parseInt(qs(req.query.meses) ?? '12', 10) || 12))
    const painel = await def.gerar(getTenantId(req), { meses, now: new Date() })
    const fmt = qs(req.query.formato)
    if (fmt === 'csv') return enviarCsv(res, `painel-${def.id}`, painelParaCsv(painel))
    if (fmt && fmt !== 'json') fail(400, 'Formato inválido. Use json ou csv.')
    res.json(painel)
  }))
}
