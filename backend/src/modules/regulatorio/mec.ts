import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { parseBody, dateISO, qs, pageParams } from '../core/crud'
import { audit } from '../core/notify'
import { scheduleReminder, completeReminders } from '../core/reminders'
import { registerEduJob } from '../core/jobs'
import { getBranding, brandHeaderHtml, escapeHtml as esc } from '../core/branding'
import { READ, WRITE, EVIDENCIA, MODULO, bad } from './common'
import { PESOS_CC, DISCLAIMER_SIMULACAO } from './rules'
import {
  MEC_TIPOS, TIPO_NOME, DIMS_MEC, DIM_NOME, FASES_MEC, FASE_STATUS, PESOS_DIMENSOES, TIPOS_CONCEITO, NOME_CONCEITO, LIMITE_AVISO_DIAS,
  faseAtual, progressoFases, fasesIniciais, montarPrazos, resumoEvidencias, simularConceitoComissao, ehCritico, severidadeLembrete, faixaContinuo, resumoCorpoDocente, diasAte,
  type Prazo,
} from './mecLogic'
import { EVIDENCIAS_MODELO, ROTEIRO_MODELO } from './mecCatalogo'

// Comissão de avaliação do MEC — montado em /api/edu/regulatorio/mec/*. Ver README (seção "Comissão de avaliação do MEC").
// Dados de demonstração (seeds/mec-comissao.ts) são FICTÍCIOS: avaliadores, protocolos e conceitos não existem.

const DAY = 86_400_000
const DIM_ENUM = z.enum(['ORGANIZACAO_DIDATICO_PEDAGOGICA', 'CORPO_DOCENTE_TUTORIAL', 'INFRAESTRUTURA'])
const ROLE_NOME: Record<string, string> = {
  COORDINATOR: 'Coordenação do curso', SECRETARY: 'Secretaria Acadêmica', SUPPORT: 'Apoio ao discente', STAFF: 'Gestão de Pessoas',
  FACILITIES: 'Infraestrutura', LIBRARIAN: 'Biblioteca', FINANCE: 'Financeiro',
}
const AVISO_FICTICIO = 'DADOS FICTÍCIOS DE DEMONSTRAÇÃO — conceitos, comissão, protocolos e avaliadores não são oficiais.'

async function getProcessoMec(tenantId: string, id: string) {
  const p = await prisma.regProcesso.findFirst({ where: { id, tenantId } })
  if (!p) throw bad('Processo não encontrado.', 404)
  if (!(MEC_TIPOS as readonly string[]).includes(p.tipo)) throw bad(`A comissão de avaliação se aplica a processos de autorização, reconhecimento, renovação e (re)credenciamento (tipo atual: ${p.tipo}).`, 409)
  return p
}

async function carregar(tenantId: string, processoId: string) {
  const [fases, membros, visita, evidencias, diligencias] = await Promise.all([
    prisma.regMecFase.findMany({ where: { tenantId, processoId }, orderBy: { ordem: 'asc' } }),
    prisma.regMecMembro.findMany({ where: { tenantId, processoId }, orderBy: [{ papel: 'asc' }, { nome: 'asc' }] }),
    prisma.regMecVisita.findFirst({ where: { tenantId, processoId, status: { not: 'CANCELADA' } }, orderBy: { inicio: 'desc' }, include: { roteiro: { orderBy: [{ dia: 'asc' }, { horaInicio: 'asc' }, { ordem: 'asc' }] } } }),
    prisma.regMecEvidencia.findMany({ where: { tenantId, processoId }, orderBy: [{ dimensao: 'asc' }, { indicadorCodigo: 'asc' }] }),
    prisma.regDiligencia.findMany({ where: { tenantId, processoId }, orderBy: { prazoResposta: 'asc' } }),
  ])
  return { fases, membros, visita, evidencias, diligencias }
}

export async function detalheMec(tenantId: string, processoId: string, agora = new Date()) {
  const processo = await getProcessoMec(tenantId, processoId)
  const { fases, membros, visita, evidencias, diligencias } = await carregar(tenantId, processoId)
  const prazos = montarPrazos({ processo, fases, visita, evidencias, diligencias }, agora)
  const resumoEv = resumoEvidencias(evidencias, agora)
  const atual = faseAtual(fases)
  const simulacao = simularConceitoComissao(evidencias)
  const pendencias = [
    ...diligencias.filter((d) => ['ABERTA', 'VENCIDA'].includes(d.status)).map((d) => ({ tipo: 'DILIGENCIA', id: d.id, titulo: d.descricao, prazo: d.prazoResposta, dias: diasAte(d.prazoResposta, agora), status: d.status })),
    ...evidencias.filter((e) => e.obrigatorio && !['ATENDIDO', 'NAO_APLICAVEL'].includes(e.status)).map((e) => ({ tipo: 'EVIDENCIA', id: e.id, titulo: `${e.indicadorCodigo} — ${e.descricao}`, prazo: e.prazo, dias: e.prazo ? diasAte(e.prazo, agora) : null, status: e.status })),
  ].sort((a, b) => (a.dias ?? 9999) - (b.dias ?? 9999))
  const ficticio = (await prisma.regMecConceito.count({ where: { tenantId, ficticio: true } })) > 0
  return {
    processo, tipoNome: TIPO_NOME[processo.tipo] ?? processo.tipo, fases, faseAtual: atual, progressoFases: progressoFases(fases), membros, visita,
    evidencias, resumoEvidencias: resumoEv, simulacao, diligencias, pendencias, prazos, prazosCriticos: prazos.filter((p) => ehCritico(p.nivel)),
    aviso: ficticio ? AVISO_FICTICIO : undefined,
  }
}

// ---------------- avisos à reitoria/diretoria ----------------
const PAPEIS_AVISO = ['RECTOR', 'BOARD'] as const

/** Cria/atualiza lembretes (RECTOR e BOARD) para prazos críticos (vencidos ou a ≤ limite dias) do processo. Idempotente. */
export async function avisarProcesso(tenantId: string, processoId: string, agora = new Date(), limite = LIMITE_AVISO_DIAS) {
  const p = await prisma.regProcesso.findFirst({ where: { id: processoId, tenantId } })
  if (!p || ['PUBLICADO', 'ARQUIVADO'].includes(p.etapa)) return { avisos: 0, itens: [] as any[] }
  const { fases, visita, evidencias, diligencias } = await carregar(tenantId, processoId)
  const prazos = montarPrazos({ processo: p, fases, visita, evidencias, diligencias }, agora)
  const rot = `[${TIPO_NOME[p.tipo] ?? p.tipo}] ${p.titulo}`
  const itens: Array<{ chave: string; titulo: string; dueAt: Date; dias: number; severity: 'INFO' | 'ATENCAO' | 'CRITICO'; descricao: string; refType: string; refId: string }> = []
  const evCrit = prazos.filter((x) => x.origem === 'EVIDENCIA' && x.dias <= limite)
  for (const x of prazos) {
    if (x.origem === 'EVIDENCIA' || x.dias > limite) continue
    itens.push({
      chave: `${x.origem.toLowerCase()}:${x.refId}`, titulo: `${x.dias < 0 ? 'PRAZO VENCIDO' : `Prazo em ${x.dias} dia(s)`} — ${x.titulo} | ${rot}`, dueAt: x.prazo, dias: x.dias,
      severity: severidadeLembrete(x.nivel), descricao: 'Acompanhamento da comissão de avaliação do MEC: prazo crítico exige providência da direção.', refType: x.refType, refId: x.refId,
    })
  }
  if (evCrit.length) {
    const menor = evCrit[0]
    itens.push({
      chave: `evidencias:${p.id}`, titulo: `${evCrit.length} evidência(s) obrigatória(s) do kit da visita vencida(s) ou vencendo em até ${limite} dias | ${rot}`, dueAt: menor.prazo, dias: menor.dias,
      severity: severidadeLembrete(menor.nivel), descricao: evCrit.slice(0, 8).map((e) => e.titulo).join('; '), refType: 'RegProcesso', refId: p.id,
    })
  } else {
    await prisma.eduReminder.updateMany({ where: { tenantId, dedupeKey: { in: PAPEIS_AVISO.map((r) => `reg:mec:evidencias:${p.id}:${r}`) }, status: { in: ['PENDENTE', 'NOTIFICADO', 'ADIADO'] } }, data: { status: 'CONCLUIDO', concluidoEm: new Date() } })
  }
  for (const it of itens) {
    for (const role of PAPEIS_AVISO) {
      await scheduleReminder({
        tenantId, modulo: MODULO, titulo: it.titulo.slice(0, 250), descricao: it.descricao.slice(0, 500), dueAt: it.dueAt, remindAt: agora, severity: it.severity,
        refType: it.refType, refId: it.refId, assigneeRole: role, dedupeKey: `reg:mec:${it.chave}:${role}`, recorrenciaDias: it.dias < 0 ? 3 : undefined,
      })
    }
  }
  if (itens.length) await audit({ tenantId, modulo: MODULO, acao: 'MEC_AVISO_REITORIA', refType: 'RegProcesso', refId: p.id, detalhes: { itens: itens.length, papeis: PAPEIS_AVISO } })
  return { avisos: itens.length * PAPEIS_AVISO.length, itens: itens.map((i) => ({ titulo: i.titulo, dias: i.dias, severity: i.severity })) }
}

export async function avisarTodos(agora = new Date(), tenantId?: string) {
  const procs = await prisma.regProcesso.findMany({ where: { tipo: { in: MEC_TIPOS as any }, etapa: { notIn: ['PUBLICADO', 'ARQUIVADO'] }, ...(tenantId ? { tenantId } : {}) }, select: { id: true, tenantId: true }, take: 3000 })
  let avisos = 0
  for (const p of procs) {
    try { avisos += (await avisarProcesso(p.tenantId, p.id, agora)).avisos } catch (e) { console.error('[mec-avisos]', p.id, e) }
  }
  return { processos: procs.length, avisos }
}
registerEduJob('regulatorio:mec-avisos', () => avisarTodos())

async function avisarSilencioso(tenantId: string, processoId: string) {
  try { await avisarProcesso(tenantId, processoId) } catch (e) { console.error('[mec-avisos]', e) }
}

// ---------------- HTML do kit da visita ----------------
async function kitHtml(tenantId: string, id: string) {
  const [d, b] = await Promise.all([detalheMec(tenantId, id), getBranding(tenantId)])
  const fd = (x: any) => (x ? new Date(x).toLocaleDateString('pt-BR') : '—')
  const cor: Record<string, string> = { ATENDIDO: '#15803d', EM_ANDAMENTO: '#a16207', PENDENTE: '#b91c1c', NAO_APLICAVEL: '#64748b' }
  const secoes = DIMS_MEC.map((dim) => {
    const l = d.evidencias.filter((e) => e.dimensao === dim)
    const linhas = l.map((e) => `<tr><td>${esc(e.indicadorCodigo)}</td><td>${esc(e.indicadorNome)}</td><td>${esc(e.descricao)}</td><td>${esc(e.pastaKit ?? '')}</td><td>${esc(e.responsavelNome ?? '—')}</td><td>${fd(e.prazo)}</td><td style="color:${cor[e.status]};font-weight:700">${esc(e.status.replace(/_/g, ' '))}</td><td>${esc(e.documentoNome ?? '—')}</td><td>${e.conceitoEstimado ?? '—'}</td></tr>`).join('')
    return `<h3>${esc(DIM_NOME[dim])}</h3><table><thead><tr><th>Cód.</th><th>Indicador</th><th>Documento / evidência</th><th>Pasta do kit</th><th>Responsável</th><th>Prazo</th><th>Situação</th><th>Arquivo</th><th>Conc.</th></tr></thead><tbody>${linhas || '<tr><td colspan="9">Sem evidências cadastradas.</td></tr>'}</tbody></table>`
  }).join('')
  const rot = d.visita?.roteiro?.length
    ? `<h3>Roteiro da visita</h3><table><thead><tr><th>Dia</th><th>Horário</th><th>Dimensão</th><th>Atividade</th><th>Local</th><th>Participantes</th></tr></thead><tbody>${d.visita.roteiro.map((r) => `<tr><td>${fd(r.dia)}</td><td>${esc(r.horaInicio)}–${esc(r.horaFim)}</td><td>${esc(DIM_NOME[r.dimensao] ?? r.dimensao)}</td><td>${esc(r.atividade)}</td><td>${esc(r.local ?? '')}</td><td>${esc(r.participantes ?? '')}</td></tr>`).join('')}</tbody></table>`
    : ''
  const membros = d.membros.length ? `<h3>Comissão avaliadora</h3><ul>${d.membros.map((m) => `<li><b>${esc(m.nome)}</b> — ${esc(m.papel)}${m.instituicao ? ` (${esc(m.instituicao)})` : ''}</li>`).join('')}</ul>` : ''
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Kit da visita</title>
<style>body{font-family:Arial,sans-serif;color:#0f172a;margin:0}main{padding:20px 28px}table{border-collapse:collapse;width:100%;font-size:11px;margin-bottom:12px}th,td{border:1px solid #cbd5e1;padding:5px 7px;text-align:left;vertical-align:top}th{background:#f1f5f9}.av{background:#fef9c3;border:1px solid #eab308;padding:8px 12px;border-radius:6px;font-size:12px;margin-bottom:12px}@media print{main{padding:6px}}</style></head><body>
${brandHeaderHtml(b, { titulo: 'Kit da visita — Comissão de avaliação do MEC', subtitulo: `${esc(d.tipoNome)} · ${esc(d.processo.titulo)} · Protocolo e-MEC ${esc(d.processo.protocoloEmec ?? 'a protocolar')}` })}
<main>${d.aviso ? `<div class="av"><b>${esc(d.aviso)}</b></div>` : ''}
<p>Prontidão do kit: <b>${d.resumoEvidencias.percentual}%</b> (${d.resumoEvidencias.atendidas} de ${d.resumoEvidencias.total} evidências) · Obrigatórias pendentes: <b>${d.resumoEvidencias.obrigatoriasPendentes}</b> · Visita: <b>${d.visita ? fd(d.visita.inicio) + ' a ' + fd(d.visita.fim) : 'não agendada'}</b></p>
${membros}${rot}${secoes}
<p style="font-size:11px;color:#64748b">Documento gerencial interno de preparação. Não substitui o instrumento oficial do INEP. ${esc(DISCLAIMER_SIMULACAO)}</p></main></body></html>`
}

// ---------------- escopo "excelência" (scorecard) ----------------
export async function excelenciaMec(tenantId: string, agora = new Date()) {
  const { DEFS } = await import('../reitoria/indicators')
  const runDef = async (chave: string) => {
    const d = DEFS.find((x) => x.chave === chave)
    if (!d) return null
    try { return await d.run({ tenantId, now: agora, memo: new Map() } as any) } catch { return null }
  }
  const [conceitos, programas, pdi, prontidao, exames, nps, perfis, egressos, cpaCiclos, cpaConvites, cpaItens, cpaPlanos, ndeMembros, atos] = await Promise.all([
    prisma.regMecConceito.findMany({ where: { tenantId }, orderBy: [{ ano: 'desc' }, { tipo: 'asc' }] }),
    prisma.academicProgram.findMany({ where: { tenantId }, select: { id: true, nome: true }, orderBy: { nome: 'asc' }, take: 500 }),
    runDef('pdi_execucao'), runDef('prontidao_regulatoria'), runDef('desempenho_exames'), runDef('nps'),
    prisma.porProfessorPerfil.findMany({ where: { tenantId }, select: { titulacao: true, regime: true } }),
    prisma.apoEgresso.findMany({ where: { tenantId }, select: { situacaoProfissional: true, atuaNaArea: true, cursandoPos: true, ultimaAtualizacaoEm: true } }),
    prisma.govCpaCiclo.findMany({ where: { tenantId }, select: { id: true, titulo: true, status: true, anoBase: true } }),
    prisma.govCpaConvite.groupBy({ by: ['usado'], where: { tenantId }, _count: { _all: true } }),
    prisma.govCpaPergunta.findMany({ where: { tenantId, tipo: 'LIKERT5' }, select: { id: true }, take: 5000 }).then((ps) => prisma.govCpaRespostaItem.aggregate({ where: { tenantId, valor: { not: null }, perguntaId: { in: ps.map((x) => x.id) } }, _avg: { valor: true }, _count: { _all: true } })).catch(() => null),
    prisma.govCpaPlanoAcao.groupBy({ by: ['status'], where: { tenantId }, _count: { _all: true } }),
    prisma.govNdeMembro.findMany({ where: { tenantId, ativo: true }, select: { titulacao: true, regime: true } }),
    prisma.regAto.findMany({ where: { tenantId, revogado: false }, select: { tipo: true, escopo: true, conceito: true, cursoNome: true, vencimento: true } }),
  ])
  const ultimo = (tipo: string, escopo?: string) => conceitos.filter((c) => c.tipo === tipo && (!escopo || c.escopo === escopo)).sort((a, b) => b.ano - a.ano)[0] ?? null
  const ci = ultimo('CI'), igc = ultimo('IGC')
  const porCurso = (tipo: string) => {
    const r: Array<{ programId: string | null; curso: string; ano: number; faixa: number; valor: number | null }> = []
    const vistos = new Set<string>()
    for (const c of conceitos.filter((x) => x.tipo === tipo && x.escopo === 'CURSO')) {
      const k = c.programId ?? c.cursoNome ?? ''
      if (vistos.has(k)) continue
      vistos.add(k)
      r.push({ programId: c.programId, curso: c.cursoNome ?? programas.find((p) => p.id === c.programId)?.nome ?? '—', ano: c.ano, faixa: c.faixa, valor: c.valor })
    }
    return r
  }
  const cpc = porCurso('CPC'), enade = porCurso('ENADE'), idd = porCurso('IDD'), cc = porCurso('CC')
  const todasFaixas = [ci?.faixa, igc?.faixa, ...cpc.map((x) => x.faixa), ...enade.map((x) => x.faixa), ...idd.map((x) => x.faixa), ...cc.map((x) => x.faixa)].filter((x): x is number => x != null)
  const docentes = resumoCorpoDocente(perfis)
  const nde = resumoCorpoDocente(ndeMembros.map((m) => ({ titulacao: m.titulacao, regime: m.regime })))
  const convTot = cpaConvites.reduce((s, c) => s + c._count._all, 0)
  const convUsados = cpaConvites.find((c) => c.usado)?._count._all ?? 0
  const planosTot = cpaPlanos.reduce((s, p) => s + p._count._all, 0)
  const planosOk = cpaPlanos.filter((p) => p.status === 'CONCLUIDA').reduce((s, p) => s + p._count._all, 0)
  const relatorios = await prisma.govCpaRelatorio.count({ where: { tenantId, tipo: 'ANUAL' } })
  const empregados = egressos.filter((e) => ['EMPREGADO', 'AUTONOMO', 'EMPREENDEDOR', 'ESTUDANDO', 'CONCURSO'].includes(e.situacaoProfissional)).length
  const infra: Array<{ programId: string; curso: string; requisitos: number; atendem: number; obrigatoriosAtendidosPct: number }> = []
  try {
    const { calcularAdequacao } = await import('../infraestrutura/adequacao')
    for (const pg of programas) {
      const a = await calcularAdequacao(tenantId, pg.id)
      if (a && a.totais.requisitos > 0) infra.push({ programId: pg.id, curso: pg.nome, requisitos: a.totais.requisitos, atendem: a.totais.atendem, obrigatoriosAtendidosPct: a.totais.obrigatoriosAtendidosPct })
    }
  } catch { /* módulo opcional */ }
  const infraReq = infra.reduce((s, i) => s + i.requisitos, 0)
  const infraOk = infra.reduce((s, i) => s + i.atendem, 0)
  let comparativo: any = null
  try {
    const { painelComparativo } = await import('../reitoria/comparativo')
    const pc = await painelComparativo(tenantId, {})
    comparativo = {
      totalIes: pc.totalIes,
      posicoes: pc.indicadores.filter((i: any) => ['IGC', 'CPC', 'ENADE', 'IDD', 'PCT_DOUTORES'].includes(i.indicador)).map((i: any) => ({ indicador: i.indicador, posicao: i.posicaoPropria, participantes: i.participantes, valorProprio: i.valorProprio, mediaConcorrentes: i.mediaConcorrentes })),
    }
  } catch { /* módulo opcional */ }

  const verde = (ok: boolean | null) => (ok == null ? 'CINZA' : ok ? 'VERDE' : 'AMARELO')
  const itens = [
    { chave: 'CI', rotulo: 'Conceito Institucional (CI)', valor: ci?.faixa ?? null, meta: 5, unidade: 'faixa', semaforo: verde(ci ? ci.faixa >= 5 : null) },
    { chave: 'IGC', rotulo: 'IGC — Índice Geral de Cursos', valor: igc?.faixa ?? null, meta: 5, unidade: 'faixa', detalhe: igc?.valor != null ? `contínuo ${igc.valor}` : undefined, semaforo: verde(igc ? igc.faixa >= 5 : null) },
    { chave: 'CPC', rotulo: 'CPC dos cursos (mínimo)', valor: cpc.length ? Math.min(...cpc.map((x) => x.faixa)) : null, meta: 5, unidade: 'faixa', semaforo: verde(cpc.length ? cpc.every((x) => x.faixa >= 5) : null) },
    { chave: 'ENADE', rotulo: 'ENADE dos cursos (mínimo)', valor: enade.length ? Math.min(...enade.map((x) => x.faixa)) : null, meta: 5, unidade: 'faixa', semaforo: verde(enade.length ? enade.every((x) => x.faixa >= 5) : null) },
    { chave: 'IDD', rotulo: 'IDD dos cursos (mínimo)', valor: idd.length ? Math.min(...idd.map((x) => x.faixa)) : null, meta: 5, unidade: 'faixa', semaforo: verde(idd.length ? idd.every((x) => x.faixa >= 5) : null) },
    { chave: 'CC', rotulo: 'Conceito de Curso (CC, mínimo)', valor: cc.length ? Math.min(...cc.map((x) => x.faixa)) : null, meta: 5, unidade: 'faixa', semaforo: verde(cc.length ? cc.every((x) => x.faixa >= 5) : null) },
    { chave: 'PDI', rotulo: 'Execução do PDI', valor: pdi?.valor ?? null, meta: 100, unidade: '%', semaforo: verde(pdi?.valor != null ? pdi.valor >= 95 : null) },
    { chave: 'CPA', rotulo: 'Autoavaliação CPA (participação)', valor: convTot ? Math.round((convUsados / convTot) * 1000) / 10 : null, meta: 80, unidade: '%', detalhe: `${relatorios} relatório(s) anual(is); satisfação ${cpaItens?._avg?.valor != null ? Math.round((cpaItens._avg.valor / 5) * 1000) / 10 + '%' : '—'}`, semaforo: verde(convTot ? convUsados / convTot >= 0.8 && relatorios > 0 : null) },
    { chave: 'AUTOAVALIACAO', rotulo: 'Autoavaliação regulatória (prontidão)', valor: prontidao?.valor ?? null, meta: 90, unidade: '%', semaforo: verde(prontidao?.valor != null ? prontidao.valor >= 90 : null) },
    { chave: 'EGRESSOS', rotulo: 'Egressos inseridos (trabalho/estudo)', valor: egressos.length ? Math.round((empregados / egressos.length) * 1000) / 10 : null, meta: 90, unidade: '%', detalhe: `${egressos.length} egresso(s) acompanhado(s)`, semaforo: verde(egressos.length ? empregados / egressos.length >= 0.9 : null) },
    { chave: 'DOCENTES_MESTRES_DOUTORES', rotulo: 'Docentes mestres ou doutores', valor: docentes.pctMestresDoutores, meta: 90, unidade: '%', detalhe: `${docentes.total} docente(s); doutores ${docentes.pctDoutores ?? '—'}%`, semaforo: verde(docentes.total ? (docentes.pctMestresDoutores ?? 0) >= 90 : null) },
    { chave: 'DOCENTES_REGIME', rotulo: 'Docentes em regime integral', valor: docentes.pctIntegral, meta: 60, unidade: '%', detalhe: `integral/parcial: ${docentes.pctIntegralParcial ?? '—'}%`, semaforo: verde(docentes.total ? (docentes.pctIntegral ?? 0) >= 60 : null) },
    { chave: 'INFRAESTRUTURA', rotulo: 'Itens de infraestrutura exigidos atendidos', valor: infraReq ? Math.round((infraOk / infraReq) * 1000) / 10 : null, meta: 100, unidade: '%', detalhe: `${infraOk} de ${infraReq} requisitos em ${infra.length} curso(s)`, semaforo: verde(infraReq ? infraOk === infraReq && infra.every((i) => i.obrigatoriosAtendidosPct >= 100) : null) },
    { chave: 'DESEMPENHO_EXAMES', rotulo: 'Desempenho em exames (conceito médio)', valor: exames?.valor ?? null, meta: 4.5, unidade: 'pts', semaforo: verde(exames?.valor != null ? exames.valor >= 4.5 : null) },
  ]
  const avaliaveis = itens.filter((i) => i.semaforo !== 'CINZA')
  const verdes = avaliaveis.filter((i) => i.semaforo === 'VERDE').length
  return {
    geradoEm: agora,
    ficticio: conceitos.some((c) => c.ficticio),
    aviso: conceitos.some((c) => c.ficticio) ? AVISO_FICTICIO : undefined,
    resumo: { itens: itens.length, verdes, avaliaveis: avaliaveis.length, notaMaxima: avaliaveis.length > 0 && verdes === avaliaveis.length, faixaMinimaConceitos: todasFaixas.length ? Math.min(...todasFaixas) : null },
    ci, igc, cpc, enade, idd, cc, itens, docentes, nde, atosComConceito: atos.filter((a) => a.conceito != null).map((a) => ({ tipo: a.tipo, escopo: a.escopo, curso: a.cursoNome, conceito: a.conceito })),
    cpa: { ciclos: cpaCiclos, convites: { total: convTot, usados: convUsados }, planosAcao: { total: planosTot, concluidos: planosOk }, relatoriosAnuais: relatorios },
    egressos: { total: egressos.length, inseridos: empregados }, infra, comparativo, nps: nps?.valor ?? null,
  }
}

// ---------------- rotas ----------------
export function mountMec(router: Router) {
  const guard = requireRole(...READ, ...WRITE)
  const writer = requireRole(...WRITE)

  router.get('/mec/catalogo', guard, (_req, res) => {
    res.json({
      aviso: DISCLAIMER_SIMULACAO, tipos: MEC_TIPOS.map((t) => ({ tipo: t, nome: TIPO_NOME[t] })), fases: FASES_MEC, dimensoes: DIMS_MEC.map((d) => ({ dimensao: d, nome: DIM_NOME[d] })),
      pesosDimensoes: PESOS_DIMENSOES, pesosCcAntigo: PESOS_CC, tiposConceito: TIPOS_CONCEITO.map((t) => ({ tipo: t, nome: NOME_CONCEITO[t] })),
      evidenciasModelo: EVIDENCIAS_MODELO.length, roteiroModelo: ROTEIRO_MODELO.length, limiteAvisoDias: LIMITE_AVISO_DIAS,
    })
  })

  router.get('/mec/painel', guard, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const agora = new Date()
    const procs = await prisma.regProcesso.findMany({ where: { tenantId, tipo: { in: MEC_TIPOS as any }, etapa: { not: 'ARQUIVADO' } }, orderBy: { updatedAt: 'desc' }, take: 200 })
    const ids = procs.map((p) => p.id)
    const [fases, membros, visitas, evs, dils, conceitosFict] = await Promise.all([
      prisma.regMecFase.findMany({ where: { tenantId, processoId: { in: ids } } }),
      prisma.regMecMembro.groupBy({ by: ['processoId'], where: { tenantId, processoId: { in: ids } }, _count: { _all: true } }),
      prisma.regMecVisita.findMany({ where: { tenantId, processoId: { in: ids }, status: { not: 'CANCELADA' } }, orderBy: { inicio: 'desc' } }),
      prisma.regMecEvidencia.findMany({ where: { tenantId, processoId: { in: ids } } }),
      prisma.regDiligencia.findMany({ where: { tenantId, processoId: { in: ids } } }),
      prisma.regMecConceito.count({ where: { tenantId, ficticio: true } }),
    ])
    const items = procs.map((p) => {
      const f = fases.filter((x) => x.processoId === p.id)
      const v = visitas.find((x) => x.processoId === p.id) ?? null
      const e = evs.filter((x) => x.processoId === p.id)
      const d = dils.filter((x) => x.processoId === p.id)
      const prazos = montarPrazos({ processo: p, fases: f, visita: v, evidencias: e, diligencias: d }, agora)
      const sim = simularConceitoComissao(e)
      const atual = faseAtual(f)
      return {
        id: p.id, titulo: p.titulo, tipo: p.tipo, tipoNome: TIPO_NOME[p.tipo], etapa: p.etapa, resultado: p.resultado, protocoloEmec: p.protocoloEmec, programId: p.programId, cursoNome: p.cursoNome,
        faseAtual: atual ? { chave: atual.chave, nome: atual.nome, status: atual.status } : null, progressoFases: progressoFases(f), iniciado: f.length > 0,
        membros: membros.find((m) => m.processoId === p.id)?._count._all ?? 0, visita: v ? { id: v.id, inicio: v.inicio, fim: v.fim, status: v.status } : null,
        evidencias: resumoEvidencias(e, agora), conceitoSimulado: sim.disponivel ? { faixa: sim.faixa, continuo: sim.continuo } : null,
        proximoPrazo: prazos[0] ? { titulo: prazos[0].titulo, prazo: prazos[0].prazo, dias: prazos[0].dias, nivel: prazos[0].nivel } : null,
        prazosCriticos: prazos.filter((x) => ehCritico(x.nivel)).length, diligenciasAbertas: d.filter((x) => ['ABERTA', 'VENCIDA'].includes(x.status)).length,
      }
    })
    const criticos: Array<Prazo & { processoId: string; processo: string }> = []
    for (const p of procs) {
      const f = fases.filter((x) => x.processoId === p.id)
      const pr = montarPrazos({ processo: p, fases: f, visita: visitas.find((x) => x.processoId === p.id) ?? null, evidencias: evs.filter((x) => x.processoId === p.id), diligencias: dils.filter((x) => x.processoId === p.id) }, agora)
      for (const x of pr.filter((y) => ehCritico(y.nivel)).slice(0, 5)) criticos.push({ ...x, processoId: p.id, processo: p.titulo })
    }
    criticos.sort((a, b) => a.dias - b.dias)
    res.json({
      geradoEm: agora, aviso: conceitosFict > 0 ? AVISO_FICTICIO : undefined,
      resumo: {
        processos: items.length, comVisitaAgendada: items.filter((i) => i.visita && ['AGENDADA', 'EM_ANDAMENTO'].includes(i.visita.status)).length, prazosCriticos: criticos.length,
        prontidaoMediaKit: items.filter((i) => i.evidencias.total > 0).length ? Math.round((items.reduce((s, i) => s + i.evidencias.percentual, 0) / items.filter((i) => i.evidencias.total > 0).length) * 10) / 10 : null,
      },
      items, criticos: criticos.slice(0, 30),
    })
  }))

  router.get('/mec/processos/:id', guard, asyncHandler(async (req: AuthenticatedRequest, res: Response) => res.json(await detalheMec(getTenantId(req), String(req.params.id)))))

  // Inicia o acompanhamento: fases do processo + kit de evidências (idempotente; não sobrescreve o que existe).
  router.post('/mec/processos/:id/iniciar', writer, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(z.object({ gerarEvidencias: z.boolean().default(true) }), req.body ?? {})
    const p = await getProcessoMec(tenantId, String(req.params.id))
    let fasesCriadas = 0, evCriadas = 0
    const existentes = new Set((await prisma.regMecFase.findMany({ where: { tenantId, processoId: p.id }, select: { chave: true } })).map((f) => f.chave))
    for (const f of fasesIniciais(new Date(), p.etapa, p.protocoladoEm)) {
      if (existentes.has(f.chave)) continue
      const previstaEm = f.chave === 'VISITA_IN_LOCO' && p.avaliacaoPrevistaEm ? p.avaliacaoPrevistaEm : f.chave === 'DESPACHO_PORTARIA' && p.decisaoPrevistaEm ? p.decisaoPrevistaEm : f.previstaEm
      await prisma.regMecFase.create({ data: { tenantId, processoId: p.id, ...f, previstaEm, realizadaEm: f.status === 'CONCLUIDA' ? (p.protocoladoEm ?? new Date()) : null } })
      fasesCriadas++
    }
    if (b.gerarEvidencias) evCriadas = await gerarEvidencias(tenantId, p.id, p.avaliacaoPrevistaEm)
    await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'MEC_INICIAR', refType: 'RegProcesso', refId: p.id, detalhes: { fasesCriadas, evCriadas } })
    await avisarSilencioso(tenantId, p.id)
    res.status(201).json({ fasesCriadas, evidenciasCriadas: evCriadas })
  }))

  router.patch('/mec/fases/:id', writer, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(z.object({ status: z.enum(FASE_STATUS).optional(), previstaEm: dateISO().optional().nullable(), realizadaEm: dateISO().optional().nullable(), observacao: z.string().max(2000).optional().nullable() }), req.body)
    const f = await prisma.regMecFase.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!f) return res.status(404).json({ error: 'Fase não encontrada.' })
    const data: any = { ...b }
    if (b.status === 'CONCLUIDA' && !b.realizadaEm && !f.realizadaEm) data.realizadaEm = new Date()
    if (b.status && b.status !== 'CONCLUIDA' && b.realizadaEm === undefined) data.realizadaEm = null
    const row = await prisma.regMecFase.update({ where: { id: f.id }, data })
    await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'MEC_FASE', refType: 'RegMecFase', refId: f.id, detalhes: { de: f.status, para: row.status } })
    if (row.status === 'CONCLUIDA') await completeReminders({ tenantId, refType: 'RegMecFase', refId: f.id, userId: getUserId(req) })
    await avisarSilencioso(tenantId, f.processoId)
    res.json(row)
  }))

  // ---- comissão avaliadora ----
  const membroSchema = z.object({
    nome: z.string().min(3).max(200), papel: z.enum(['COORDENADOR', 'AVALIADOR', 'OBSERVADOR']).default('AVALIADOR'), instituicao: z.string().max(200).optional().nullable(),
    titulacao: z.string().max(80).optional().nullable(), areaAtuacao: z.string().max(200).optional().nullable(), dimensaoFoco: DIM_ENUM.optional().nullable(),
    email: z.string().email().max(200).optional().nullable(), designadoEm: dateISO().optional().nullable(), observacao: z.string().max(1000).optional().nullable(),
  })
  router.get('/mec/processos/:id/membros', guard, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const items = await prisma.regMecMembro.findMany({ where: { tenantId: getTenantId(req), processoId: String(req.params.id) }, orderBy: [{ papel: 'asc' }, { nome: 'asc' }] })
    res.json({ items, total: items.length })
  }))
  router.post('/mec/processos/:id/membros', writer, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const p = await getProcessoMec(tenantId, String(req.params.id))
    const b = parseBody(membroSchema, req.body)
    if (b.papel === 'COORDENADOR' && (await prisma.regMecMembro.findFirst({ where: { tenantId, processoId: p.id, papel: 'COORDENADOR' } }))) throw bad('A comissão já possui coordenador(a). Altere o papel do atual antes.', 409)
    const row = await prisma.regMecMembro.create({ data: { ...b, tenantId, processoId: p.id, designadoEm: b.designadoEm ?? new Date() } })
    await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'MEC_MEMBRO_CRIAR', refType: 'RegMecMembro', refId: row.id })
    res.status(201).json(row)
  }))
  router.patch('/mec/membros/:id', writer, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const cur = await prisma.regMecMembro.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!cur) return res.status(404).json({ error: 'Membro não encontrado.' })
    const b = parseBody(membroSchema.partial(), req.body)
    if (b.papel === 'COORDENADOR' && cur.papel !== 'COORDENADOR' && (await prisma.regMecMembro.findFirst({ where: { tenantId, processoId: cur.processoId, papel: 'COORDENADOR', id: { not: cur.id } } }))) throw bad('A comissão já possui coordenador(a).', 409)
    res.json(await prisma.regMecMembro.update({ where: { id: cur.id }, data: b }))
  }))
  router.delete('/mec/membros/:id', writer, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const r = await prisma.regMecMembro.deleteMany({ where: { id: String(req.params.id), tenantId: getTenantId(req) } })
    if (!r.count) return res.status(404).json({ error: 'Membro não encontrado.' })
    res.status(204).end()
  }))

  // ---- visita in loco + roteiro por dimensão ----
  const visitaSchema = z.object({ inicio: dateISO(), fim: dateISO(), local: z.string().max(200).optional().nullable(), observacoes: z.string().max(2000).optional().nullable(), status: z.enum(['AGENDADA', 'EM_ANDAMENTO', 'REALIZADA', 'CANCELADA']).optional() })
  router.post('/mec/processos/:id/visita', writer, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const p = await getProcessoMec(tenantId, String(req.params.id))
    const b = parseBody(visitaSchema, req.body)
    if (b.fim.getTime() < b.inicio.getTime()) throw bad('O fim da visita deve ser igual ou posterior ao início.')
    const ativa = await prisma.regMecVisita.findFirst({ where: { tenantId, processoId: p.id, status: { in: ['AGENDADA', 'EM_ANDAMENTO'] } } })
    const row = ativa
      ? await prisma.regMecVisita.update({ where: { id: ativa.id }, data: b })
      : await prisma.regMecVisita.create({ data: { ...b, tenantId, processoId: p.id } })
    await prisma.regProcesso.update({ where: { id: p.id }, data: { avaliacaoPrevistaEm: b.inicio } })
    await prisma.regMecFase.updateMany({ where: { tenantId, processoId: p.id, chave: 'VISITA_IN_LOCO' }, data: { previstaEm: b.inicio } })
    await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: ativa ? 'MEC_VISITA_ATUALIZAR' : 'MEC_VISITA_AGENDAR', refType: 'RegMecVisita', refId: row.id })
    await avisarSilencioso(tenantId, p.id)
    res.status(ativa ? 200 : 201).json(row)
  }))
  router.patch('/mec/visitas/:id', writer, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const cur = await prisma.regMecVisita.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!cur) return res.status(404).json({ error: 'Visita não encontrada.' })
    const b = parseBody(visitaSchema.partial(), req.body)
    const ini = b.inicio ?? cur.inicio, fim = b.fim ?? cur.fim
    if (fim.getTime() < ini.getTime()) throw bad('O fim da visita deve ser igual ou posterior ao início.')
    const row = await prisma.regMecVisita.update({ where: { id: cur.id }, data: b })
    if (b.status === 'REALIZADA') {
      await prisma.regMecFase.updateMany({ where: { tenantId, processoId: cur.processoId, chave: 'VISITA_IN_LOCO' }, data: { status: 'CONCLUIDA', realizadaEm: new Date() } })
      await completeReminders({ tenantId, refType: 'RegMecVisita', refId: cur.id, userId: getUserId(req) })
    }
    await avisarSilencioso(tenantId, cur.processoId)
    res.json(row)
  }))
  router.post('/mec/visitas/:id/roteiro/gerar', writer, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(z.object({ refazer: z.boolean().default(false) }), req.body ?? {})
    const v = await prisma.regMecVisita.findFirst({ where: { id: String(req.params.id), tenantId }, include: { _count: { select: { roteiro: true } } } })
    if (!v) return res.status(404).json({ error: 'Visita não encontrada.' })
    if (v._count.roteiro > 0 && !b.refazer) throw bad('A visita já possui roteiro. Envie "refazer": true para substituí-lo.', 409)
    if (b.refazer) await prisma.regMecRoteiro.deleteMany({ where: { tenantId, visitaId: v.id } })
    const dias = Math.max(1, Math.min(5, Math.round((v.fim.getTime() - v.inicio.getTime()) / DAY) + 1))
    const base = new Date(Date.UTC(v.inicio.getUTCFullYear(), v.inicio.getUTCMonth(), v.inicio.getUTCDate(), 12))
    const itens = ROTEIRO_MODELO.filter((r) => r.dia < dias || r.dia === 1)
    await prisma.regMecRoteiro.createMany({
      data: itens.map((r, i) => ({ tenantId, visitaId: v.id, dia: new Date(base.getTime() + Math.min(r.dia, dias - 1) * DAY), horaInicio: r.horaInicio, horaFim: r.horaFim, dimensao: r.dimensao as any, atividade: r.atividade, local: r.local, participantes: r.participantes, ordem: i })),
    })
    res.status(201).json({ criados: itens.length })
  }))
  const roteiroSchema = z.object({
    dia: dateISO(), horaInicio: z.string().regex(/^\d{2}:\d{2}$/), horaFim: z.string().regex(/^\d{2}:\d{2}$/), dimensao: DIM_ENUM, atividade: z.string().min(3).max(300),
    local: z.string().max(200).optional().nullable(), participantes: z.string().max(300).optional().nullable(), realizada: z.boolean().optional(),
  })
  router.post('/mec/visitas/:id/roteiro', writer, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const v = await prisma.regMecVisita.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!v) return res.status(404).json({ error: 'Visita não encontrada.' })
    const b = parseBody(roteiroSchema, req.body)
    if (b.horaFim <= b.horaInicio) throw bad('O horário final deve ser depois do inicial.')
    res.status(201).json(await prisma.regMecRoteiro.create({ data: { ...b, tenantId, visitaId: v.id } }))
  }))
  router.patch('/mec/roteiro/:id', writer, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const cur = await prisma.regMecRoteiro.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!cur) return res.status(404).json({ error: 'Item do roteiro não encontrado.' })
    const b = parseBody(roteiroSchema.partial(), req.body)
    if ((b.horaFim ?? cur.horaFim) <= (b.horaInicio ?? cur.horaInicio)) throw bad('O horário final deve ser depois do inicial.')
    res.json(await prisma.regMecRoteiro.update({ where: { id: cur.id }, data: b }))
  }))
  router.delete('/mec/roteiro/:id', writer, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const r = await prisma.regMecRoteiro.deleteMany({ where: { id: String(req.params.id), tenantId: getTenantId(req) } })
    if (!r.count) return res.status(404).json({ error: 'Item do roteiro não encontrado.' })
    res.status(204).end()
  }))

  // ---- evidências por indicador (kit da visita) ----
  const evSchema = z.object({
    dimensao: DIM_ENUM, indicadorCodigo: z.string().min(1).max(20), indicadorNome: z.string().min(3).max(300), descricao: z.string().min(3).max(600), obrigatorio: z.boolean().default(true),
    responsavelId: z.string().optional().nullable(), responsavelNome: z.string().max(200).optional().nullable(), prazo: dateISO().optional().nullable(), pastaKit: z.string().max(200).optional().nullable(),
    documentoNome: z.string().max(300).optional().nullable(), documentoUrl: z.string().max(1000).optional().nullable(), conceitoEstimado: z.number().int().min(1).max(5).optional().nullable(),
    observacao: z.string().max(1000).optional().nullable(), status: z.enum(['PENDENTE', 'EM_ANDAMENTO', 'ATENDIDO', 'NAO_APLICAVEL']).optional(),
  })
  const regraStatus = (d: any, cur?: any) => {
    const st = d.status ?? cur?.status
    if (st === 'ATENDIDO' && !(d.documentoNome ?? cur?.documentoNome) && !(d.documentoUrl ?? cur?.documentoUrl)) throw bad('Para marcar como ATENDIDO informe o documento (documentoNome ou documentoUrl).')
    if (d.status === 'ATENDIDO' && cur?.status !== 'ATENDIDO') d.concluidoEm = new Date()
    if (d.status && d.status !== 'ATENDIDO') d.concluidoEm = null
    return d
  }
  router.get('/mec/processos/:id/evidencias', guard, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const where: any = { tenantId: getTenantId(req), processoId: String(req.params.id) }
    const dim = qs(req.query.dimensao); if (dim) where.dimensao = dim
    const st = qs(req.query.status); if (st) where.status = st
    const items = await prisma.regMecEvidencia.findMany({ where, orderBy: [{ dimensao: 'asc' }, { indicadorCodigo: 'asc' }] })
    res.json({ items, total: items.length, resumo: resumoEvidencias(items) })
  }))
  router.post('/mec/processos/:id/evidencias/gerar', writer, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const p = await getProcessoMec(tenantId, String(req.params.id))
    const criadas = await gerarEvidencias(tenantId, p.id, p.avaliacaoPrevistaEm)
    await avisarSilencioso(tenantId, p.id)
    res.status(201).json({ criadas })
  }))
  router.post('/mec/processos/:id/evidencias', writer, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const p = await getProcessoMec(tenantId, String(req.params.id))
    const b = regraStatus(parseBody(evSchema, req.body))
    const row = await prisma.regMecEvidencia.create({ data: { ...b, tenantId, processoId: p.id } })
    await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'MEC_EVIDENCIA_CRIAR', refType: 'RegMecEvidencia', refId: row.id })
    await avisarSilencioso(tenantId, p.id)
    res.status(201).json(row)
  }))
  router.patch('/mec/evidencias/:id', writer, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const cur = await prisma.regMecEvidencia.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!cur) return res.status(404).json({ error: 'Evidência não encontrada.' })
    const b = regraStatus(parseBody(evSchema.partial(), req.body), cur)
    const row = await prisma.regMecEvidencia.update({ where: { id: cur.id }, data: b })
    await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'MEC_EVIDENCIA_ATUALIZAR', refType: 'RegMecEvidencia', refId: cur.id })
    await avisarSilencioso(tenantId, cur.processoId)
    res.json(row)
  }))
  // Responsáveis pelas evidências (infraestrutura, biblioteca...) atualizam só a situação e o documento.
  router.post('/mec/evidencias/:id/atualizar', requireRole(...EVIDENCIA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const cur = await prisma.regMecEvidencia.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!cur) return res.status(404).json({ error: 'Evidência não encontrada.' })
    const b = regraStatus(parseBody(evSchema.pick({ status: true, documentoNome: true, documentoUrl: true, observacao: true }), req.body), cur)
    const row = await prisma.regMecEvidencia.update({ where: { id: cur.id }, data: b })
    await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'MEC_EVIDENCIA_RESPONSAVEL', refType: 'RegMecEvidencia', refId: cur.id, detalhes: { status: row.status } })
    res.json(row)
  }))
  router.delete('/mec/evidencias/:id', writer, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const r = await prisma.regMecEvidencia.deleteMany({ where: { id: String(req.params.id), tenantId: getTenantId(req) } })
    if (!r.count) return res.status(404).json({ error: 'Evidência não encontrada.' })
    res.status(204).end()
  }))

  // ---- simulação de conceito por dimensão ----
  const simular = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const p = await getProcessoMec(tenantId, String(req.params.id))
    const body = parseBody(z.object({ organizacaoDidatico: z.number().min(1).max(5).optional(), corpoDocente: z.number().min(1).max(5).optional(), infraestrutura: z.number().min(1).max(5).optional() }), req.method === 'GET' ? {} : req.body ?? {})
    const evs = await prisma.regMecEvidencia.findMany({ where: { tenantId, processoId: p.id } })
    const r = simularConceitoComissao(evs, { ORGANIZACAO_DIDATICO_PEDAGOGICA: body.organizacaoDidatico, CORPO_DOCENTE_TUTORIAL: body.corpoDocente, INFRAESTRUTURA: body.infraestrutura } as any)
    res.json(r)
  })
  router.get('/mec/processos/:id/simulacao', guard, simular)
  router.post('/mec/processos/:id/simulacao', guard, simular)

  // ---- kit da visita ----
  router.get('/mec/processos/:id/kit', guard, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const d = await detalheMec(getTenantId(req), String(req.params.id))
    const porDimensao = DIMS_MEC.map((dim) => ({
      dimensao: dim, nome: DIM_NOME[dim], resumo: d.resumoEvidencias.porDimensao[dim],
      indicadores: Object.values(d.evidencias.filter((e) => e.dimensao === dim).reduce((m: Record<string, any>, e) => {
        const k = e.indicadorCodigo
        ;(m[k] ??= { codigo: k, nome: e.indicadorNome, itens: [] }).itens.push({ id: e.id, documento: e.descricao, pasta: e.pastaKit, responsavel: e.responsavelNome, prazo: e.prazo, status: e.status, arquivo: e.documentoNome, obrigatorio: e.obrigatorio, conceitoEstimado: e.conceitoEstimado })
        return m
      }, {})),
    }))
    res.json({ processo: { id: d.processo.id, titulo: d.processo.titulo, protocoloEmec: d.processo.protocoloEmec }, aviso: d.aviso, prontidao: d.resumoEvidencias, visita: d.visita ? { inicio: d.visita.inicio, fim: d.visita.fim, status: d.visita.status } : null, porDimensao })
  }))
  router.get('/mec/processos/:id/kit.html', guard, asyncHandler(async (req: AuthenticatedRequest, res: Response) => res.type('html').send(await kitHtml(getTenantId(req), String(req.params.id)))))

  // ---- avisos ----
  router.get('/mec/avisos', guard, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const items = await prisma.eduReminder.findMany({ where: { tenantId, modulo: MODULO, dedupeKey: { startsWith: 'reg:mec:' }, status: { in: ['PENDENTE', 'NOTIFICADO', 'ADIADO'] } }, orderBy: { dueAt: 'asc' }, take: 200 })
    res.json({ items, total: items.length, limiteDias: LIMITE_AVISO_DIAS, papeis: PAPEIS_AVISO })
  }))
  router.post('/mec/avisos/processar', writer, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const r = await avisarTodos(new Date(), tenantId)
    await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'MEC_AVISOS_PROCESSAR', detalhes: r })
    res.json(r)
  }))

  // ---- conceitos regulatórios (CI, IGC, CPC, CC, ENADE, IDD) ----
  const conceitoSchema = z.object({
    tipo: z.enum(TIPOS_CONCEITO), ano: z.number().int().min(2000).max(2100), programId: z.string().optional().nullable(), cursoNome: z.string().max(200).optional().nullable(),
    valor: z.number().min(0).max(5).optional().nullable(), faixa: z.number().int().min(1).max(5).optional(), ficticio: z.boolean().default(false), observacao: z.string().max(500).optional().nullable(),
  })
  router.get('/mec/conceitos', guard, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    for (const f of ['tipo', 'escopo', 'programId']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    const ano = qs(req.query.ano); if (ano) where.ano = parseInt(ano, 10) || 0
    const [items, total] = await Promise.all([prisma.regMecConceito.findMany({ where, orderBy: [{ ano: 'desc' }, { tipo: 'asc' }, { cursoNome: 'asc' }], skip, take }), prisma.regMecConceito.count({ where })])
    res.json({ items, total, page, pageSize, aviso: items.some((i) => i.ficticio) ? AVISO_FICTICIO : undefined })
  }))
  // Upsert por (tipo, curso, ano). Faixa é derivada do contínuo quando não informada (CI e CC exigem a faixa).
  router.post('/mec/conceitos', writer, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(conceitoSchema, req.body)
    const porCurso = ['CPC', 'CC', 'ENADE', 'IDD'].includes(b.tipo)
    if (porCurso && !b.programId && !b.cursoNome) throw bad(`${b.tipo} é um conceito por curso: informe programId ou cursoNome.`)
    if (!porCurso && (b.programId || b.cursoNome)) throw bad(`${b.tipo} é um conceito da instituição: não informe curso.`)
    if (b.programId && !(await prisma.academicProgram.findFirst({ where: { id: b.programId, tenantId }, select: { id: true } }))) throw bad('Curso (programId) não encontrado neste tenant.')
    if (['CI', 'CC'].includes(b.tipo) && b.faixa == null) throw bad(`${b.tipo} exige a faixa (1 a 5).`)
    if (b.valor == null && b.faixa == null) throw bad('Informe o valor contínuo (0 a 5) ou a faixa (1 a 5).')
    const faixa = b.faixa ?? faixaContinuo(b.valor as number)
    const chave = `${b.tipo}:${b.programId ?? (b.cursoNome ? 'n-' + b.cursoNome.toLowerCase() : '-')}:${b.ano}`
    const data = { escopo: porCurso ? 'CURSO' : 'INSTITUICAO', programId: b.programId ?? null, cursoNome: b.cursoNome ?? null, tipo: b.tipo, ano: b.ano, valor: b.valor ?? null, faixa, ficticio: b.ficticio, observacao: b.observacao ?? null }
    const row = await prisma.regMecConceito.upsert({ where: { tenantId_chave: { tenantId, chave } }, create: { tenantId, chave, ...data }, update: data })
    await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'MEC_CONCEITO', refType: 'RegMecConceito', refId: row.id, detalhes: { tipo: b.tipo, ano: b.ano, faixa } })
    res.status(201).json(row)
  }))
  router.delete('/mec/conceitos/:id', writer, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const r = await prisma.regMecConceito.deleteMany({ where: { id: String(req.params.id), tenantId: getTenantId(req) } })
    if (!r.count) return res.status(404).json({ error: 'Conceito não encontrado.' })
    res.status(204).end()
  }))
  router.get('/mec/excelencia', guard, asyncHandler(async (req: AuthenticatedRequest, res: Response) => res.json(await excelenciaMec(getTenantId(req)))))
}

async function gerarEvidencias(tenantId: string, processoId: string, visitaPrevista?: Date | null) {
  const existentes = new Set((await prisma.regMecEvidencia.findMany({ where: { tenantId, processoId }, select: { indicadorCodigo: true, descricao: true } })).map((e) => `${e.indicadorCodigo}|${e.descricao}`))
  let criadas = 0
  for (const m of EVIDENCIAS_MODELO) {
    if (existentes.has(`${m.codigo}|${m.documento}`)) continue
    const prazo = new Date(visitaPrevista ? visitaPrevista.getTime() - (45 - m.dias) * DAY : Date.now() + m.dias * DAY)
    await prisma.regMecEvidencia.create({
      data: { tenantId, processoId, dimensao: m.dimensao as any, indicadorCodigo: m.codigo, indicadorNome: m.indicador, descricao: m.documento, obrigatorio: m.obrigatorio ?? true, responsavelNome: m.role ? ROLE_NOME[m.role] : null, prazo, pastaKit: m.pasta },
    })
    criadas++
  }
  return criadas
}
