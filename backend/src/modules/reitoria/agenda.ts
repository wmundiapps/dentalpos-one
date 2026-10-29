import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireAuth, requireRole } from '../academico/middleware'
import { dateISO, pageParams, parseBody, qs } from '../core/crud'
import { audit } from '../core/notify'
import { scheduleReminder } from '../core/reminders'
import {
  ItemAgenda, Visao, agruparPorDia, detectarConflitos, expandirRecorrencia, ics, intervaloVisao, ocorrenciasAnuais, prioridadePrazo, ymdLocal,
} from './agendaLogic'
import { DAY, addDias, delegateOpcional, enviarCsv, escHtml, fail, hojeLocal, inicioDoDia, seguro, toCsv } from './util2'

// Agenda executiva da reitoria: compromissos próprios (reuniões, audiências, pauta/ata, convites, lembretes)
// consolidados com calendário acadêmico, prazos regulatórios, DOU, prazos jurídicos, convênios, CIPA e RH.
// Cada fonte é consultada em try/catch: módulo/tabela ausente vira "fonte indisponível", nunca erro.

const TIPOS = ['COMPROMISSO', 'REUNIAO', 'AUDIENCIA', 'PRAZO_REGULATORIO', 'PRAZO_JURIDICO', 'EFEMERIDE', 'ANIVERSARIO', 'VIAGEM', 'OUTRO'] as const
const STATUS = ['AGENDADO', 'CONFIRMADO', 'REALIZADO', 'CANCELADO', 'ADIADO'] as const
const PRIOR = ['BAIXA', 'NORMAL', 'ALTA', 'CRITICA'] as const

type Fonte = (ctx: { tenantId: string; userId: string; de: Date; ate: Date }) => Promise<ItemAgenda[]>
const fontesExternas = new Map<string, Fonte>()
/** Outros módulos (Jurídico, RH...) podem registrar a sua fonte na agenda sem alterar este arquivo. */
export function registrarFonteAgenda(nome: string, fonte: Fonte) { fontesExternas.set(nome, fonte) }

const mkItem = (p: Partial<ItemAgenda> & Pick<ItemAgenda, 'id' | 'origem' | 'tipo' | 'titulo' | 'inicio'>): ItemAgenda => ({
  fim: p.inicio, diaInteiro: true, prioridade: 'NORMAL', ...p,
})

// ---------------- consolidação ----------------

export async function coletarAgenda(tenantId: string, userId: string, de: Date, ate: Date, now = new Date()) {
  const falhas: string[] = []
  const itens: ItemAgenda[] = []
  const add = (xs: ItemAgenda[]) => { itens.push(...xs) }

  // 1) compromissos da própria reitoria (com recorrência; privados só para organizador/convidados)
  add(await seguro('reitoria', falhas, async () => {
    const rows = await prisma.reiCompromisso.findMany({
      where: {
        tenantId, status: { not: 'CANCELADO' },
        OR: [{ recorrencia: 'NENHUMA', inicio: { lt: ate }, fim: { gte: de } }, { recorrencia: { not: 'NENHUMA' }, inicio: { lt: ate } }],
      },
      include: { convites: { select: { userId: true, resposta: true } } }, take: 3000,
    })
    const out: ItemAgenda[] = []
    for (const c of rows) {
      if (c.privado && c.organizadorUserId !== userId && !c.convites.some((x) => x.userId === userId)) continue
      for (const oc of expandirRecorrencia(c, de, ate)) {
        out.push(mkItem({
          id: `rei:${c.id}:${oc.inicio.toISOString().slice(0, 10)}`, origem: 'reitoria', tipo: c.tipo, titulo: c.titulo, descricao: c.descricao, inicio: oc.inicio, fim: oc.fim,
          diaInteiro: c.diaInteiro, status: c.status, prioridade: c.prioridade, local: c.local, ref: { type: 'ReiCompromisso', id: c.id }, editavel: true,
        }))
      }
    }
    return out
  }, []))

  // 2) calendário acadêmico + prazos de notas
  add(await seguro('calendario', falhas, async () => {
    const ev = await prisma.calEvento.findMany({ where: { tenantId, ativo: true, inicio: { lt: ate }, fim: { gte: de } }, orderBy: { inicio: 'asc' }, take: 800 })
    return ev.map((e) => mkItem({
      id: `cal:${e.id}`, origem: 'calendario', tipo: e.tipo === 'REUNIAO' ? 'REUNIAO' : 'EVENTO_ACADEMICO', titulo: e.titulo, descricao: e.descricao, inicio: e.inicio, fim: e.fim, diaInteiro: e.diaInteiro,
      prioridade: ['FERIADO', 'RECESSO', 'FERIAS', 'PONTO_FACULTATIVO'].includes(e.tipo) ? 'BAIXA' : 'NORMAL', local: e.local, ref: { type: 'CalEvento', id: e.id }, rota: '/edu/calendario',
    }))
  }, []))
  add(await seguro('prazos-notas', falhas, async () => {
    const pz = await prisma.calPrazoNotas.findMany({ where: { tenantId, ativo: true, prazo: { gte: de, lt: ate } }, take: 300 })
    return pz.map((p) => mkItem({ id: `calprazo:${p.id}`, origem: 'calendario', tipo: 'PRAZO_REGULATORIO', titulo: `Prazo: ${p.titulo}`, inicio: p.prorrogadoAte ?? p.prazo, prioridade: prioridadePrazo(p.prorrogadoAte ?? p.prazo, now), ref: { type: 'CalPrazoNotas', id: p.id }, rota: '/edu/calendario' }))
  }, []))

  // 3) regulatório: atos, diligências, processos
  add(await seguro('regulatorio', falhas, async () => {
    const [atos, dil, proc] = await Promise.all([
      prisma.regAto.findMany({ where: { tenantId, revogado: false, vencimento: { gte: de, lt: ate } }, take: 300 }),
      prisma.regDiligencia.findMany({ where: { tenantId, status: { in: ['ABERTA', 'RESPONDIDA'] }, prazoResposta: { gte: de, lt: ate } }, include: { processo: { select: { titulo: true } } }, take: 300 }),
      prisma.regProcesso.findMany({ where: { tenantId, etapa: { not: 'ARQUIVADO' }, OR: [{ prazoProtocolo: { gte: de, lt: ate } }, { avaliacaoPrevistaEm: { gte: de, lt: ate } }, { decisaoPrevistaEm: { gte: de, lt: ate } }] }, take: 300 }),
    ])
    const out: ItemAgenda[] = []
    for (const a of atos) out.push(mkItem({ id: `regato:${a.id}`, origem: 'regulatorio', tipo: 'PRAZO_REGULATORIO', titulo: `Vence ato ${a.numero}${a.cursoNome ? ` (${a.cursoNome})` : ''}`, inicio: a.vencimento!, prioridade: prioridadePrazo(a.vencimento!, now), ref: { type: 'RegAto', id: a.id }, rota: '/edu/regulatorio' }))
    for (const d of dil) out.push(mkItem({ id: `regdil:${d.id}`, origem: 'regulatorio', tipo: 'PRAZO_REGULATORIO', titulo: `Diligência: ${d.processo?.titulo ?? d.descricao}`, inicio: d.prazoResposta, prioridade: prioridadePrazo(d.prazoResposta, now) === 'BAIXA' ? 'NORMAL' : prioridadePrazo(d.prazoResposta, now), ref: { type: 'RegDiligencia', id: d.id }, rota: '/edu/regulatorio' }))
    for (const p of proc) {
      for (const [campo, rot] of [['prazoProtocolo', 'Protocolar'], ['avaliacaoPrevistaEm', 'Avaliação in loco prevista'], ['decisaoPrevistaEm', 'Decisão prevista']] as const) {
        const v = (p as any)[campo] as Date | null
        if (v && v >= de && v < ate) out.push(mkItem({ id: `regproc:${p.id}:${campo}`, origem: 'regulatorio', tipo: 'PRAZO_REGULATORIO', titulo: `${rot}: ${p.titulo}`, inicio: v, prioridade: campo === 'prazoProtocolo' ? prioridadePrazo(v, now) : 'NORMAL', ref: { type: 'RegProcesso', id: p.id }, rota: '/edu/regulatorio' }))
      }
    }
    return out
  }, []))

  // 4) DOU: prazos de ação
  add(await seguro('dou', falhas, async () => {
    const ps = await prisma.reiDouPublicacao.findMany({ where: { tenantId, status: { in: ['NOVA', 'EM_ANALISE', 'EM_TRATAMENTO'] }, prazoAcaoEm: { gte: de, lt: ate }, relevancia: { in: ['ALTA', 'MEDIA'] } }, take: 300 })
    return ps.map((p) => mkItem({ id: `dou:${p.id}`, origem: 'dou', tipo: 'PRAZO_REGULATORIO', titulo: `DOU: ${p.titulo}`.slice(0, 160), inicio: p.prazoAcaoEm!, prioridade: p.relevancia === 'ALTA' ? 'ALTA' : prioridadePrazo(p.prazoAcaoEm!, now), ref: { type: 'ReiDouPublicacao', id: p.id }, rota: '/edu/reitoria/dou' }))
  }, []))

  // 5) convênios e vencimentos
  add(await seguro('convenios', falhas, async () => {
    const cs = await prisma.reiConvenio.findMany({ where: { tenantId, status: 'VIGENTE', fim: { gte: de, lt: ate } }, take: 300 })
    return cs.map((c) => mkItem({ id: `conv:${c.id}`, origem: 'convenios', tipo: 'VENCIMENTO', titulo: `Vence convênio ${c.numero}: ${c.parteNome}`, inicio: c.fim!, prioridade: prioridadePrazo(c.fim!, now), ref: { type: 'ReiConvenio', id: c.id }, rota: '/edu/reitoria/convenios' }))
  }, []))

  // 6) governança: reuniões de órgãos colegiados e CIPA
  add(await seguro('governanca', falhas, async () => {
    const [reun, cipa] = await Promise.all([
      prisma.govReuniao.findMany({ where: { tenantId, status: 'AGENDADA', data: { gte: de, lt: ate } }, include: { orgao: { select: { nome: true } } }, take: 300 }),
      prisma.govCipaReuniao.findMany({ where: { tenantId, realizada: false, data: { gte: de, lt: ate } }, take: 100 }),
    ])
    return [
      ...reun.map((r) => mkItem({ id: `govreun:${r.id}`, origem: 'governanca', tipo: 'REUNIAO', titulo: `Reunião: ${r.orgao?.nome ?? 'colegiado'}`, inicio: r.data, fim: addDias(r.data, 0), diaInteiro: false, local: r.local, ref: { type: 'GovReuniao', id: r.id }, rota: '/edu/governanca' })),
      ...cipa.map((r) => mkItem({ id: `cipa:${r.id}`, origem: 'governanca', tipo: 'REUNIAO', titulo: `Reunião da CIPA (${r.competencia})`, inicio: r.data, diaInteiro: false, ref: { type: 'GovCipaReuniao', id: r.id }, rota: '/edu/governanca' })),
    ]
  }, []))

  // 7) Jurídico (defensivo: delegates podem não existir)
  add(await seguro('juridico', falhas, async () => {
    const out: ItemAgenda[] = []
    const prazo = delegateOpcional('jurPrazo'), aud = delegateOpcional('jurAudiencia'), contr = delegateOpcional('jurContrato')
    if (!prazo && !aud && !contr) throw new Error('módulo jurídico indisponível')
    if (prazo) for (const p of await prazo.findMany({ where: { tenantId, status: 'ABERTO', dataFatal: { gte: de, lt: ate } }, include: { processo: { select: { numeroCnj: true } } }, take: 300 })) {
      out.push(mkItem({ id: `jurprazo:${p.id}`, origem: 'juridico', tipo: 'PRAZO_JURIDICO', titulo: `Prazo jurídico: ${p.titulo}${p.processo?.numeroCnj ? ` (${p.processo.numeroCnj})` : ''}`, inicio: p.dataFatal, prioridade: p.fatal ? (prioridadePrazo(p.dataFatal, now) === 'BAIXA' ? 'NORMAL' : prioridadePrazo(p.dataFatal, now)) : 'NORMAL', ref: { type: 'JurPrazo', id: p.id }, rota: '/edu/juridico' }))
    }
    if (aud) for (const a of await aud.findMany({ where: { tenantId, status: { in: ['AGENDADA', 'ADIADA'] }, dataHora: { gte: de, lt: ate } }, include: { processo: { select: { numeroCnj: true } } }, take: 300 })) {
      out.push(mkItem({ id: `juraud:${a.id}`, origem: 'juridico', tipo: 'AUDIENCIA', titulo: `Audiência (${String(a.tipo).toLowerCase()})${a.processo?.numeroCnj ? ` - ${a.processo.numeroCnj}` : ''}`, inicio: a.dataHora, fim: new Date(a.dataHora.getTime() + 3_600_000), diaInteiro: false, local: a.local, prioridade: 'ALTA', ref: { type: 'JurAudiencia', id: a.id }, rota: '/edu/juridico' }))
    }
    if (contr) for (const c of await contr.findMany({ where: { tenantId, status: 'VIGENTE', vigenciaFim: { gte: de, lt: ate } }, take: 300 })) {
      out.push(mkItem({ id: `jurcontr:${c.id}`, origem: 'juridico', tipo: 'VENCIMENTO', titulo: `Vence contrato ${c.codigo}: ${c.contraparteNome}`, inicio: c.vigenciaFim, prioridade: prioridadePrazo(c.vigenciaFim, now), ref: { type: 'JurContrato', id: c.id }, rota: '/edu/juridico' }))
    }
    return out
  }, []))

  // 8) RH: aniversariantes (apenas nome + dia/mês)
  add(await seguro('rh', falhas, async () => {
    const col = delegateOpcional('rheColaborador')
    if (!col) throw new Error('módulo RH indisponível')
    const rows = await col.findMany({ where: { tenantId, status: { not: 'DESLIGADO' }, dataNascimento: { not: null } }, select: { id: true, nome: true, dataNascimento: true }, take: 5000 })
    const out: ItemAgenda[] = []
    for (const r of rows) {
      const n = new Date(new Date(r.dataNascimento).getTime() - 3 * 3_600_000)
      for (const d of ocorrenciasAnuais(n.getUTCMonth() + 1, n.getUTCDate(), de, ate)) out.push(mkItem({ id: `rhaniv:${r.id}:${ymdLocal(d)}`, origem: 'rh', tipo: 'ANIVERSARIO', titulo: `Aniversário: ${r.nome}`, inicio: d, prioridade: 'BAIXA', ref: { type: 'RheColaborador', id: r.id } }))
    }
    return out
  }, []))

  // 9) fontes registradas por outros módulos
  for (const [nome, f] of fontesExternas) add(await seguro(nome, falhas, async () => (await f({ tenantId, userId, de, ate })).map((i) => ({ ...i, origem: i.origem || nome })), []))

  // indisponíveis "esperados" (módulos opcionais) não são erro: separa para informação
  const opcionais = ['juridico', 'rh']
  itens.sort((a, b) => a.inicio.getTime() - b.inicio.getTime() || a.titulo.localeCompare(b.titulo))
  return { itens, fontesIndisponiveis: falhas.filter((f) => !opcionais.includes(f)), modulosOpcionaisAusentes: falhas.filter((f) => opcionais.includes(f)) }
}

// ---------------- lembretes ----------------

async function proximaOcorrencia(c: { inicio: Date; fim: Date; recorrencia: string; recorrenciaAte: Date | null }, now = new Date()) {
  return expandirRecorrencia(c, now, addDias(now, 400))[0] ?? null
}

export async function agendarLembretes(c: any, now = new Date()) {
  if (!['AGENDADO', 'CONFIRMADO', 'ADIADO'].includes(c.status)) return 0
  const oc = await proximaOcorrencia(c, now)
  if (!oc || !(c.lembretesMin?.length)) return 0
  let n = 0
  for (const min of c.lembretesMin as number[]) {
    const remindAt = new Date(oc.inicio.getTime() - min * 60_000)
    if (remindAt.getTime() < now.getTime() - DAY) continue
    await scheduleReminder({
      tenantId: c.tenantId, modulo: 'reitoria', titulo: `Agenda: ${c.titulo}`, descricao: c.local ? `Local: ${c.local}` : undefined, dueAt: oc.inicio, remindAt: remindAt < now ? now : remindAt,
      severity: c.prioridade === 'CRITICA' ? 'CRITICO' : c.prioridade === 'ALTA' ? 'ATENCAO' : 'INFO', refType: 'ReiCompromisso', refId: c.id,
      assigneeUserId: c.organizadorUserId ?? undefined, assigneeRole: c.organizadorUserId ? undefined : 'RECTOR', dedupeKey: `rei-comp:${c.id}:${min}:${oc.inicio.toISOString().slice(0, 10)}`,
    })
    n++
  }
  return n
}

async function cancelarLembretes(tenantId: string, id: string) {
  await prisma.eduReminder.updateMany({ where: { tenantId, refType: 'ReiCompromisso', refId: id, status: { in: ['PENDENTE', 'NOTIFICADO', 'ADIADO'] } }, data: { status: 'CANCELADO' } })
}

/** Job diário: reagenda lembretes de compromissos próximos/recorrentes. */
export async function jobAgendaLembretes() {
  const now = new Date()
  const rows = await prisma.reiCompromisso.findMany({ where: { status: { in: ['AGENDADO', 'CONFIRMADO', 'ADIADO'] }, NOT: { lembretesMin: { isEmpty: true } }, OR: [{ recorrencia: { not: 'NENHUMA' } }, { inicio: { gte: now, lt: addDias(now, 15) } }] }, take: 5000 })
  let n = 0
  for (const c of rows) { try { n += await agendarLembretes(c, now) } catch { /* isolado */ } }
  return { compromissos: rows.length, lembretes: n }
}

// ---------------- rotas ----------------

const schemaPauta = z.array(z.object({ titulo: z.string().trim().min(1).max(300), responsavel: z.string().max(200).optional(), minutos: z.number().int().min(0).max(1440).optional() })).max(60)
const schemaConvite = z.object({ userId: z.string().optional(), nome: z.string().trim().min(1).max(200), email: z.string().email().max(200).optional(), papel: z.enum(['PARTICIPANTE', 'PRESIDENTE', 'SECRETARIO', 'OBSERVADOR']).default('PARTICIPANTE') })
const schemaCompromisso = z.object({
  tipo: z.enum(TIPOS).default('COMPROMISSO'),
  titulo: z.string().trim().min(2).max(300),
  descricao: z.string().max(5000).optional(),
  local: z.string().max(300).optional(),
  linkVideo: z.string().url().max(500).optional(),
  inicio: dateISO(),
  fim: dateISO().optional(),
  diaInteiro: z.boolean().optional(),
  prioridade: z.enum(PRIOR).optional(),
  privado: z.boolean().optional(),
  recorrencia: z.enum(['NENHUMA', 'SEMANAL', 'MENSAL', 'ANUAL']).optional(),
  recorrenciaAte: dateISO().optional(),
  lembretesMin: z.array(z.number().int().min(0).max(60 * 24 * 30)).max(5).optional(),
  pauta: schemaPauta.optional(),
  convites: z.array(schemaConvite).max(100).optional(),
})

function validarJanela(inicio: Date, fim: Date, rec?: string, ate?: Date | null) {
  if (fim < inicio) fail(400, 'O fim deve ser posterior ao início.')
  if (rec && rec !== 'NENHUMA' && ate && ate < inicio) fail(400, 'O fim da recorrência deve ser posterior ao início.')
}

async function carregar(tenantId: string, id: string, userId: string) {
  const c = await prisma.reiCompromisso.findFirst({ where: { id, tenantId }, include: { convites: { orderBy: { createdAt: 'asc' } } } })
  if (!c) fail(404, 'Compromisso não encontrado.')
  if (c!.privado && c!.organizadorUserId !== userId && !c!.convites.some((x) => x.userId === userId)) fail(404, 'Compromisso não encontrado.')
  return c!
}

async function conflitosDe(tenantId: string, alvo: { id?: string; inicio: Date; fim: Date; diaInteiro?: boolean }) {
  if (alvo.diaInteiro) return []
  const vizinhos = await prisma.reiCompromisso.findMany({ where: { tenantId, status: { not: 'CANCELADO' }, recorrencia: 'NENHUMA', diaInteiro: false, inicio: { lt: alvo.fim }, fim: { gt: alvo.inicio } }, select: { id: true, titulo: true, inicio: true, fim: true }, take: 20 })
  return detectarConflitos(alvo as any, vizinhos as any)
}

export function registerAgenda(router: Router) {
  // visão consolidada
  router.get('/agenda', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const visao = (qs(req.query.visao) ?? 'semana') as Visao
    if (!['dia', 'semana', 'mes'].includes(visao)) fail(400, 'Visão inválida. Use dia, semana ou mes.')
    const data = qs(req.query.data) ?? hojeLocal()
    const { de, ate, rotulo } = intervaloVisao(visao, data)
    let { itens, fontesIndisponiveis, modulosOpcionaisAusentes } = await coletarAgenda(tenantId, getUserId(req), de, ate)
    const origem = qs(req.query.origem), tipo = qs(req.query.tipo)
    if (origem) itens = itens.filter((i) => i.origem === origem)
    if (tipo) itens = itens.filter((i) => i.tipo === tipo)
    const porOrigem: Record<string, number> = {}
    for (const i of itens) porOrigem[i.origem] = (porOrigem[i.origem] ?? 0) + 1
    if (qs(req.query.formato) === 'csv') {
      return enviarCsv(res, `agenda-${visao}-${data}`, toCsv(
        [{ key: 'inicio', label: 'Início' }, { key: 'fim', label: 'Fim' }, { key: 'origem', label: 'Origem' }, { key: 'tipo', label: 'Tipo' }, { key: 'titulo', label: 'Título' }, { key: 'prioridade', label: 'Prioridade' }, { key: 'local', label: 'Local' }],
        itens,
      ))
    }
    res.json({ visao, data, rotulo, de, ate, total: itens.length, porOrigem, itens, porDia: visao === 'dia' ? undefined : agruparPorDia(itens), fontesIndisponiveis, modulosOpcionaisAusentes })
  }))

  router.get('/agenda/proximos', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const dias = Math.min(120, Math.max(1, parseInt(qs(req.query.dias) ?? '14', 10) || 14))
    const now = new Date()
    const r = await coletarAgenda(getTenantId(req), getUserId(req), now, addDias(now, dias))
    const itens = r.itens.filter((i) => !['EVENTO_ACADEMICO'].includes(i.tipo) || i.prioridade !== 'BAIXA').slice(0, 50)
    res.json({ dias, total: itens.length, itens, fontesIndisponiveis: r.fontesIndisponiveis })
  }))

  router.get('/agenda/ics', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const now = new Date()
    const { itens } = await coletarAgenda(getTenantId(req), getUserId(req), addDias(now, -7), addDias(now, 180))
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="agenda-reitoria.ics"')
    res.send(ics(itens))
  }))

  router.get('/agenda/aniversariantes', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const mes = Math.min(12, Math.max(1, parseInt(qs(req.query.mes) ?? String(new Date().getMonth() + 1), 10) || 1))
    const ano = new Date().getFullYear()
    const de = inicioDoDia(`${ano}-${String(mes).padStart(2, '0')}-01`)
    const ate = mes === 12 ? inicioDoDia(`${ano + 1}-01-01`) : inicioDoDia(`${ano}-${String(mes + 1).padStart(2, '0')}-01`)
    const { itens } = await coletarAgenda(getTenantId(req), getUserId(req), de, ate)
    res.json(itens.filter((i) => i.tipo === 'ANIVERSARIO' || i.tipo === 'EFEMERIDE'))
  }))

  // efemérides acadêmicas padrão (idempotente)
  router.post('/agenda/efemerides/bootstrap', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const lista: Array<[string, number, number]> = [
      ['Dia da Biblioteca', 3, 12], ['Dia Nacional da Educação', 4, 28], ['Dia do Estudante', 8, 11], ['Dia do Professor', 10, 15],
      ['Dia do Cirurgião-Dentista', 10, 25], ['Dia do Servidor Público', 10, 28], ['Dia Nacional do Livro', 10, 29], ['Dia do Pesquisador Científico', 5, 8],
      ['Dia da Mulher', 3, 8], ['Dia da Consciência Negra', 11, 20],
    ]
    let criadas = 0
    const ano = new Date().getFullYear()
    for (const [titulo, mes, d] of lista) {
      const origemKey = `efemeride:${mes}-${d}`
      if (await prisma.reiCompromisso.findUnique({ where: { tenantId_origemKey: { tenantId, origemKey } } })) continue
      const ini = inicioDoDia(`${ano}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
      await prisma.reiCompromisso.create({ data: { tenantId, tipo: 'EFEMERIDE', titulo, inicio: ini, fim: ini, diaInteiro: true, prioridade: 'BAIXA', recorrencia: 'ANUAL', origemKey } })
      criadas++
    }
    res.json({ criadas, total: lista.length })
  }))

  // convites do usuário logado
  router.get('/agenda/meus-convites', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const rows = await prisma.reiConvite.findMany({ where: { tenantId, userId: getUserId(req), compromisso: { status: { not: 'CANCELADO' }, fim: { gte: new Date() } } }, include: { compromisso: { select: { id: true, titulo: true, tipo: true, inicio: true, fim: true, local: true } } }, orderBy: { createdAt: 'desc' }, take: 100 })
    res.json(rows)
  }))

  // ---- compromissos ----
  router.get('/compromissos', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req), userId = getUserId(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId, OR: [{ privado: false }, { organizadorUserId: userId }, { convites: { some: { userId } } }] }
    if (qs(req.query.tipo)) { if (!(TIPOS as readonly string[]).includes(qs(req.query.tipo)!)) fail(400, 'Tipo inválido.'); where.tipo = qs(req.query.tipo) }
    if (qs(req.query.status)) { if (!(STATUS as readonly string[]).includes(qs(req.query.status)!)) fail(400, 'Status inválido.'); where.status = qs(req.query.status) }
    if (qs(req.query.q)) where.AND = [{ OR: [{ titulo: { contains: qs(req.query.q), mode: 'insensitive' } }, { descricao: { contains: qs(req.query.q), mode: 'insensitive' } }] }]
    const [items, total] = await Promise.all([
      prisma.reiCompromisso.findMany({ where, orderBy: { inicio: 'desc' }, skip, take, include: { _count: { select: { convites: true } } } }),
      prisma.reiCompromisso.count({ where }),
    ])
    res.json({ items, total, page, pageSize })
  }))

  router.get('/compromissos/:id', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    res.json(await carregar(getTenantId(req), String(req.params.id), getUserId(req)))
  }))

  router.post('/compromissos', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req), userId = getUserId(req)
    const b = parseBody(schemaCompromisso, req.body)
    const fim = b.fim ?? (b.diaInteiro ? b.inicio : new Date(b.inicio.getTime() + 3_600_000))
    validarJanela(b.inicio, fim, b.recorrencia, b.recorrenciaAte)
    const org = await prisma.user.findFirst({ where: { id: userId, tenantId }, select: { firstName: true, lastName: true } })
    const { convites, ...resto } = b
    const conflitos = await conflitosDe(tenantId, { inicio: b.inicio, fim, diaInteiro: b.diaInteiro })
    const row = await prisma.reiCompromisso.create({
      data: { ...resto, fim, tenantId, organizadorUserId: userId, organizadorNome: org ? `${org.firstName} ${org.lastName}`.trim() : null, pauta: b.pauta as any, lembretesMin: b.lembretesMin ?? [], convites: convites?.length ? { create: convites.map((c) => ({ ...c, tenantId })) } : undefined },
      include: { convites: true },
    })
    await agendarLembretes(row)
    await audit({ tenantId, userId, modulo: 'reitoria', acao: 'AGENDA_CRIAR', refType: 'ReiCompromisso', refId: row.id })
    res.status(201).json({ ...row, conflitos })
  }))

  router.patch('/compromissos/:id', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req), userId = getUserId(req)
    const cur = await carregar(tenantId, String(req.params.id), userId)
    const b = parseBody(schemaCompromisso.omit({ convites: true }).partial().extend({ status: z.enum(STATUS).optional() }), req.body)
    const inicio = b.inicio ?? cur.inicio
    const fim = b.fim ?? (b.inicio ? new Date(b.inicio.getTime() + (cur.fim.getTime() - cur.inicio.getTime())) : cur.fim)
    validarJanela(inicio, fim, b.recorrencia ?? cur.recorrencia, b.recorrenciaAte ?? cur.recorrenciaAte)
    const row = await prisma.reiCompromisso.update({ where: { id: cur.id }, data: { ...b, inicio, fim, pauta: b.pauta as any }, include: { convites: true } })
    if (b.inicio || b.lembretesMin || b.status) { await cancelarLembretes(tenantId, cur.id); await agendarLembretes(row) }
    await audit({ tenantId, userId, modulo: 'reitoria', acao: 'AGENDA_ATUALIZAR', refType: 'ReiCompromisso', refId: cur.id })
    res.json({ ...row, conflitos: await conflitosDe(tenantId, { id: row.id, inicio, fim, diaInteiro: row.diaInteiro }) })
  }))

  router.delete('/compromissos/:id', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const cur = await carregar(tenantId, String(req.params.id), getUserId(req))
    if (cur.origemKey && !cur.origemKey.startsWith('efemeride:')) fail(409, 'Compromisso gerado automaticamente: cancele em vez de excluir.')
    await cancelarLembretes(tenantId, cur.id)
    await prisma.reiCompromisso.delete({ where: { id: cur.id } })
    await audit({ tenantId, userId: getUserId(req), modulo: 'reitoria', acao: 'AGENDA_REMOVER', refType: 'ReiCompromisso', refId: cur.id })
    res.status(204).end()
  }))

  for (const [acao, status] of [['concluir', 'REALIZADO'], ['cancelar', 'CANCELADO'], ['confirmar', 'CONFIRMADO']] as const) {
    router.post(`/compromissos/:id/${acao}`, requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const cur = await carregar(tenantId, String(req.params.id), getUserId(req))
      if (cur.status === 'CANCELADO') fail(409, 'Compromisso cancelado.')
      if (cur.status === 'REALIZADO' && status !== 'REALIZADO') fail(409, 'Compromisso já realizado.')
      const row = await prisma.reiCompromisso.update({ where: { id: cur.id }, data: { status } })
      if (status !== 'CONFIRMADO') await cancelarLembretes(tenantId, cur.id)
      res.json(row)
    }))
  }

  router.post('/compromissos/:id/adiar', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const cur = await carregar(tenantId, String(req.params.id), getUserId(req))
    const b = parseBody(z.object({ inicio: dateISO(), fim: dateISO().optional(), motivo: z.string().max(500).optional() }), req.body)
    if (['CANCELADO', 'REALIZADO'].includes(cur.status)) fail(409, 'Compromisso encerrado não pode ser adiado.')
    const fim = b.fim ?? new Date(b.inicio.getTime() + (cur.fim.getTime() - cur.inicio.getTime()))
    validarJanela(b.inicio, fim)
    const row = await prisma.reiCompromisso.update({ where: { id: cur.id }, data: { inicio: b.inicio, fim, status: 'ADIADO', descricao: b.motivo ? `${cur.descricao ? cur.descricao + '\n' : ''}Adiado: ${b.motivo}` : cur.descricao }, include: { convites: true } })
    await cancelarLembretes(tenantId, cur.id); await agendarLembretes(row)
    await prisma.reiConvite.updateMany({ where: { tenantId, compromissoId: cur.id }, data: { resposta: 'PENDENTE', respondidoEm: null } })
    res.json(row)
  }))

  // ---- convites ----
  router.post('/compromissos/:id/convites', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const cur = await carregar(tenantId, String(req.params.id), getUserId(req))
    const b = parseBody(schemaConvite, req.body)
    if (b.userId) {
      if (!(await prisma.user.findFirst({ where: { id: b.userId, tenantId }, select: { id: true } }))) fail(404, 'Usuário convidado não encontrado.')
      if (cur.convites.some((c) => c.userId === b.userId)) fail(409, 'Usuário já convidado.')
    }
    const row = await prisma.reiConvite.create({ data: { ...b, tenantId, compromissoId: cur.id } })
    res.status(201).json(row)
  }))

  router.delete('/compromissos/:id/convites/:conviteId', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const cur = await carregar(tenantId, String(req.params.id), getUserId(req))
    const r = await prisma.reiConvite.deleteMany({ where: { id: String(req.params.conviteId), tenantId, compromissoId: cur.id } })
    if (!r.count) return res.status(404).json({ error: 'Convite não encontrado.' })
    res.status(204).end()
  }))

  // o próprio convidado responde (qualquer usuário autenticado convidado)
  router.post('/compromissos/:id/responder', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req), userId = getUserId(req)
    const b = parseBody(z.object({ resposta: z.enum(['ACEITO', 'RECUSADO', 'TALVEZ']), justificativa: z.string().max(500).optional() }), req.body)
    const conv = await prisma.reiConvite.findFirst({ where: { tenantId, compromissoId: String(req.params.id), userId } })
    if (!conv) return res.status(404).json({ error: 'Você não foi convidado para este compromisso.' })
    if (b.resposta === 'RECUSADO' && !b.justificativa) fail(400, 'Informe a justificativa ao recusar.')
    res.json(await prisma.reiConvite.update({ where: { id: conv.id }, data: { resposta: b.resposta, justificativa: b.justificativa, respondidoEm: new Date() } }))
  }))

  router.post('/compromissos/:id/presenca', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const cur = await carregar(tenantId, String(req.params.id), getUserId(req))
    const b = parseBody(z.object({ presentes: z.array(z.string()).max(200) }), req.body)
    await prisma.reiConvite.updateMany({ where: { tenantId, compromissoId: cur.id }, data: { presente: false } })
    const r = await prisma.reiConvite.updateMany({ where: { tenantId, compromissoId: cur.id, id: { in: b.presentes } }, data: { presente: true } })
    res.json({ presentes: r.count, convidados: cur.convites.length })
  }))

  // ---- pauta e ata ----
  router.put('/compromissos/:id/pauta', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const cur = await carregar(tenantId, String(req.params.id), getUserId(req))
    const b = parseBody(z.object({ pauta: schemaPauta }), req.body)
    res.json(await prisma.reiCompromisso.update({ where: { id: cur.id }, data: { pauta: b.pauta as any } }))
  }))

  router.post('/compromissos/:id/ata', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const cur = await carregar(tenantId, String(req.params.id), getUserId(req))
    if (cur.ataAprovadaEm) fail(409, 'Ata já aprovada: não pode ser alterada.')
    if (cur.status === 'CANCELADO') fail(409, 'Compromisso cancelado.')
    const b = parseBody(z.object({
      ata: z.string().trim().min(10).max(100_000),
      decisoes: z.array(z.object({ texto: z.string().trim().min(1).max(1000), responsavel: z.string().max(200).optional(), prazo: dateISO().optional() })).max(60).optional(),
    }), req.body)
    const row = await prisma.reiCompromisso.update({ where: { id: cur.id }, data: { ata: b.ata, decisoes: b.decisoes as any, ataRegistradaEm: new Date(), status: cur.status === 'AGENDADO' || cur.status === 'CONFIRMADO' ? 'REALIZADO' : cur.status } })
    // decisões com prazo viram lembretes
    for (const [i, d] of (b.decisoes ?? []).entries()) {
      if (d.prazo) await scheduleReminder({ tenantId, modulo: 'reitoria', titulo: `Decisão: ${d.texto}`.slice(0, 200), descricao: `Ata de "${cur.titulo}"${d.responsavel ? ` — responsável: ${d.responsavel}` : ''}`, dueAt: d.prazo, severity: 'ATENCAO', refType: 'ReiCompromisso', refId: cur.id, assigneeRole: 'RECTOR', dedupeKey: `rei-ata:${cur.id}:${i}` })
    }
    await audit({ tenantId, userId: getUserId(req), modulo: 'reitoria', acao: 'AGENDA_ATA', refType: 'ReiCompromisso', refId: cur.id })
    res.json(row)
  }))

  router.post('/compromissos/:id/ata/aprovar', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const cur = await carregar(tenantId, String(req.params.id), getUserId(req))
    if (!cur.ata) fail(409, 'Não há ata registrada.')
    if (cur.ataAprovadaEm) fail(409, 'Ata já aprovada.')
    res.json(await prisma.reiCompromisso.update({ where: { id: cur.id }, data: { ataAprovadaEm: new Date() } }))
  }))

  // pauta + ata para impressão
  router.get('/compromissos/:id/documento', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const cur = await carregar(getTenantId(req), String(req.params.id), getUserId(req))
    const pauta = (cur.pauta as any[] | null) ?? []
    const dec = (cur.decisoes as any[] | null) ?? []
    const fmt = (d: Date) => d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escHtml(cur.titulo)}</title><style>body{font:14px/1.5 system-ui,sans-serif;max-width:800px;margin:24px auto;padding:0 16px}h1{font-size:20px}h2{font-size:16px;margin-top:20px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:4px 8px;text-align:left}</style></head><body>
<h1>${escHtml(cur.titulo)}</h1><p>${escHtml(cur.tipo)} — ${escHtml(fmt(cur.inicio))}${cur.local ? ` — ${escHtml(cur.local)}` : ''}</p>
<h2>Participantes</h2><table><tr><th>Nome</th><th>Papel</th><th>Resposta</th><th>Presença</th></tr>${cur.convites.map((c) => `<tr><td>${escHtml(c.nome)}</td><td>${escHtml(c.papel)}</td><td>${escHtml(c.resposta)}</td><td>${c.presente == null ? '—' : c.presente ? 'Presente' : 'Ausente'}</td></tr>`).join('')}</table>
<h2>Pauta</h2><ol>${pauta.map((p) => `<li>${escHtml(p.titulo)}${p.responsavel ? ` — ${escHtml(p.responsavel)}` : ''}${p.minutos ? ` (${p.minutos} min)` : ''}</li>`).join('') || '<li>—</li>'}</ol>
<h2>Ata</h2><div style="white-space:pre-wrap">${escHtml(cur.ata ?? 'Ata ainda não registrada.')}</div>${cur.ataAprovadaEm ? `<p><em>Aprovada em ${escHtml(fmt(cur.ataAprovadaEm))}</em></p>` : ''}
<h2>Decisões e encaminhamentos</h2><ul>${dec.map((d) => `<li>${escHtml(d.texto)}${d.responsavel ? ` — ${escHtml(d.responsavel)}` : ''}${d.prazo ? ` (prazo ${escHtml(new Date(d.prazo).toLocaleDateString('pt-BR'))})` : ''}</li>`).join('') || '<li>—</li>'}</ul></body></html>`
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.send(html)
  }))
}
