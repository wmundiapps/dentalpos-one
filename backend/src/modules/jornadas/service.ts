import { prisma } from '../../lib/prisma'
import { audit } from '../core/notify'
import { cancelReminders, completeReminders, scheduleReminder } from '../core/reminders'
import { registerEduJob } from '../core/jobs'
import {
  Grafo, ItemChecklist, LembreteConfig, NoDef, TransDef, aplicarChecklist, calcularPrazo, checklistPendente, diasDeAtraso, ehAberta, planoEscalonamento,
  podeAtuar, proximosNos,
} from './engine'

const MODULO = 'jornadas'
const REF = 'JorEtapa'
const DIA = 86_400_000
const err = (status: number, msg: string, extra?: object) => Object.assign(new Error(msg), { status, ...extra })

export const PERSONAS = ['CANDIDATO', 'ALUNO', 'EGRESSO', 'PROFESSOR', 'COORDENADOR', 'FUNCIONARIO', 'DIRETORIA', 'REITORIA'] as const

// ------------------------------------------------------------ carga de grafo
export async function carregarGrafo(tenantId: string, templateId: string): Promise<{ template: any; grafo: Grafo }> {
  const template = await prisma.jorTemplate.findFirst({ where: { id: templateId, tenantId }, include: { nos: { orderBy: { ordem: 'asc' } }, transicoes: true } })
  if (!template) throw err(404, 'Modelo de jornada não encontrado.')
  return { template, grafo: paraGrafo(template.nos, template.transicoes) }
}
export function paraGrafo(nos: any[], transicoes: any[]): Grafo {
  return {
    nos: nos.map((n) => ({ chave: n.chave, titulo: n.titulo, descricao: n.descricao, tipo: n.tipo, papel: n.papel, slaDias: n.slaDias, checklist: n.checklist ?? null, documentos: n.documentos ?? null, modulo: n.modulo, rota: n.rota, evento: n.evento, lembrete: n.lembrete ?? null, fase: n.fase, ordem: n.ordem }) as NoDef),
    transicoes: transicoes.map((t) => ({ deChave: t.deChave, paraChave: t.paraChave, rotulo: t.rotulo, condicao: t.condicao ?? null, prioridade: t.prioridade }) as TransDef),
  }
}

async function resolverNome(tenantId: string, personType: string, personId: string): Promise<string | null> {
  try {
    const p: any = prisma
    if (['aluno', 'egresso', 'student'].includes(personType)) return (await p.student.findFirst({ where: { id: personId, tenantId }, select: { nomeCompleto: true } }))?.nomeCompleto ?? null
    if (personType === 'candidato') return (await p.admCandidato.findFirst({ where: { id: personId, tenantId }, select: { nome: true } }))?.nome ?? null
    const u = await p.user.findFirst({ where: { id: personId, tenantId }, select: { firstName: true, lastName: true } })
    return u ? `${u.firstName} ${u.lastName}`.trim() : null
  } catch {
    return null
  }
}

async function historico(tenantId: string, instanciaId: string, acao: string, userId?: string | null, etapaId?: string | null, detalhes?: unknown) {
  await prisma.jorHistorico.create({ data: { tenantId, instanciaId, etapaId: etapaId ?? null, acao, userId: userId ?? null, detalhes: detalhes as any } })
}

// ------------------------------------------------------------ ativação de nós
async function criarLembrete(inst: any, etapa: any) {
  if (!etapa.prazoEm) return
  const cfg = (etapa.lembreteConfig ?? {}) as LembreteConfig
  const ehAluno = ['aluno', 'egresso', 'student'].includes(inst.personType)
  const paraPessoa = etapa.papel === 'STUDENT' && ehAluno
  await scheduleReminder({
    tenantId: inst.tenantId, modulo: MODULO, refType: REF, refId: etapa.id,
    titulo: `${inst.personNome ?? inst.personType}: ${etapa.titulo}`,
    descricao: `Jornada ${inst.templateChave} — etapa "${etapa.titulo}"${etapa.rota ? ' (abrir ' + etapa.rota + ')' : ''}`,
    dueAt: etapa.prazoEm, antecedenciaDias: cfg.antecedenciaDias ?? 2, recorrenciaDias: cfg.recorrenciaDias,
    severity: cfg.severity ?? 'INFO',
    assigneeUserId: etapa.responsavelUserId ?? undefined,
    assigneeRole: etapa.responsavelUserId || paraPessoa ? undefined : etapa.papel ?? undefined,
    assigneeStudentId: paraPessoa ? inst.personId : undefined,
    dedupeKey: `jor:etapa:${etapa.id}`,
  })
}

// Percorre o grafo a partir de `inicio`: nós automáticos (INICIO/MARCO/GATEWAY/FIM) são
// resolvidos na hora; nós de trabalho viram etapas abertas com prazo e lembrete.
async function ativar(inst: any, grafo: Grafo, inicio: string[], ctx: Record<string, any>, userId: string | null, agora: Date) {
  const fila = [...inicio]
  let passos = 0
  let chegouFim = false
  const abertas: any[] = []
  while (fila.length) {
    if (++passos > 200) throw err(500, 'Jornada em laço automático (verifique gateways do modelo).')
    const chave = fila.shift()!
    const no = grafo.nos.find((n) => n.chave === chave)
    if (!no) continue
    const base = { tenantId: inst.tenantId, instanciaId: inst.id, noChave: no.chave, titulo: no.titulo, tipo: no.tipo as any, papel: no.papel ?? null, fase: no.fase ?? null, modulo: no.modulo ?? null, rota: no.rota ?? null, evento: no.evento ?? null, iniciadaEm: agora }
    if (['INICIO', 'MARCO', 'GATEWAY', 'FIM'].includes(no.tipo)) {
      const ciclo = (await prisma.jorEtapa.count({ where: { instanciaId: inst.id, noChave: no.chave } })) + 1
      const e = await prisma.jorEtapa.create({ data: { ...base, ciclo, status: 'CONCLUIDA', concluidaEm: agora, concluidaPorId: userId } })
      await historico(inst.tenantId, inst.id, no.tipo === 'MARCO' ? 'MARCO_ATINGIDO' : no.tipo === 'FIM' ? 'FIM_ATINGIDO' : 'NO_AUTOMATICO', userId, e.id, { no: no.chave, titulo: no.titulo })
      if (no.tipo === 'FIM') { chegouFim = true; continue }
      const prox = proximosNos(grafo, no.chave, ctx)
      if (!prox.length) await historico(inst.tenantId, inst.id, 'SEM_SAIDA', userId, e.id, { no: no.chave })
      fila.push(...prox)
      continue
    }
    const jaAberta = await prisma.jorEtapa.findFirst({ where: { instanciaId: inst.id, noChave: no.chave, status: { in: ['ABERTA', 'AGUARDANDO_EVENTO', 'ATRASADA'] } } })
    if (jaAberta) continue
    const ciclo = (await prisma.jorEtapa.count({ where: { instanciaId: inst.id, noChave: no.chave } })) + 1
    const e = await prisma.jorEtapa.create({
      data: {
        ...base, ciclo, status: no.tipo === 'ESPERA_EVENTO' ? 'AGUARDANDO_EVENTO' : 'ABERTA', prazoEm: calcularPrazo(agora, no.slaDias),
        checklistDef: (no.checklist ?? undefined) as any, documentosDef: (no.documentos ?? undefined) as any, lembreteConfig: (no.lembrete ?? undefined) as any, checklistEstado: {},
      },
    })
    await criarLembrete(inst, e)
    await historico(inst.tenantId, inst.id, 'ETAPA_ABERTA', userId, e.id, { no: no.chave, titulo: no.titulo, prazoEm: e.prazoEm })
    abertas.push(e)
  }
  const restantes = await prisma.jorEtapa.count({ where: { instanciaId: inst.id, status: { in: ['ABERTA', 'AGUARDANDO_EVENTO', 'ATRASADA'] } } })
  if (chegouFim && restantes === 0) {
    await prisma.jorInstancia.update({ where: { id: inst.id }, data: { status: 'CONCLUIDA', concluidaEm: agora } })
    await historico(inst.tenantId, inst.id, 'JORNADA_CONCLUIDA', userId)
  }
  return abertas
}

// ------------------------------------------------------------ API pública
export interface IniciarInput { personType: string; personId: string; templateKey?: string; templateId?: string; personNome?: string; contexto?: Record<string, unknown>; userId?: string }

export async function iniciarJornada(tenantId: string, input: IniciarInput) {
  const personType = input.personType.toLowerCase()
  const key = input.templateKey?.trim()
  let template: any = null
  if (input.templateId) template = await prisma.jorTemplate.findFirst({ where: { id: input.templateId, tenantId, status: 'PUBLICADO' } })
  else if (key) {
    const persona = key.toUpperCase()
    template = await prisma.jorTemplate.findFirst({
      where: { tenantId, status: 'PUBLICADO', OR: [{ chave: key }, ...((PERSONAS as readonly string[]).includes(persona) ? [{ chave: `${persona.toLowerCase()}-padrao` }] : [])] },
      orderBy: { versao: 'desc' },
    })
  }
  if (!template) throw err(404, 'Modelo de jornada publicado não encontrado (rode o bootstrap ou publique um modelo).')
  const existente = await prisma.jorInstancia.findFirst({ where: { tenantId, personType, personId: input.personId, templateChave: template.chave, status: { in: ['ATIVA', 'PAUSADA'] } } })
  if (existente) return { instancia: existente, jaExistia: true, etapasAbertas: [] as any[] }
  const { grafo } = await carregarGrafo(tenantId, template.id)
  const v = grafo.nos.find((n) => n.tipo === 'INICIO')
  if (!v) throw err(422, 'Modelo sem nó INICIO.')
  const agora = new Date()
  const nome = input.personNome ?? (await resolverNome(tenantId, personType, input.personId))
  const ctx = { ...(input.contexto ?? {}) }
  const instancia = await prisma.jorInstancia.create({
    data: { tenantId, templateId: template.id, templateChave: template.chave, templateVersao: template.versao, personType, personId: input.personId, personNome: nome, contexto: ctx as any, iniciadaPorId: input.userId ?? null, iniciadaEm: agora },
  })
  await historico(tenantId, instancia.id, 'INICIADA', input.userId, null, { template: template.chave, versao: template.versao })
  await audit({ tenantId, userId: input.userId, modulo: MODULO, acao: 'INICIAR_JORNADA', refType: 'JorInstancia', refId: instancia.id, detalhes: { personType, personId: input.personId, template: template.chave } })
  const etapasAbertas = await ativar(instancia, grafo, [v.chave], ctx, input.userId ?? null, agora)
  return { instancia, jaExistia: false, etapasAbertas }
}

export interface AvancarInput {
  etapaId?: string; instanciaId?: string; noChave?: string
  user?: { id: string; role: string; studentId?: string }   // omitido = chamada de sistema (sem checagem de papel)
  checklist?: Record<string, boolean>
  decisao?: 'APROVADO' | 'REJEITADO'
  contexto?: Record<string, unknown>
  observacao?: string
}

async function localizarEtapa(tenantId: string, i: { etapaId?: string; instanciaId?: string; noChave?: string }) {
  let etapa: any = null
  if (i.etapaId) etapa = await prisma.jorEtapa.findFirst({ where: { id: i.etapaId, tenantId }, include: { instancia: true } })
  else if (i.instanciaId && i.noChave) etapa = await prisma.jorEtapa.findFirst({ where: { tenantId, instanciaId: i.instanciaId, noChave: i.noChave, status: { in: ['ABERTA', 'AGUARDANDO_EVENTO', 'ATRASADA'] } }, include: { instancia: true } })
  if (!etapa) throw err(404, 'Etapa não encontrada.')
  return etapa
}

function guardaAtor(etapa: any, user?: { id: string; role: string; studentId?: string }) {
  if (!user) return
  const role = String(user.role).toUpperCase()
  const ehAlunoDono = role === 'STUDENT' && etapa.instancia.personId === user.studentId
  if (role === 'STUDENT' && !ehAlunoDono) throw err(403, 'Esta etapa pertence a outro aluno.')
  if (!podeAtuar(user, etapa)) throw err(403, 'Sem permissão: a etapa é de responsabilidade de outro papel/usuário.')
}

export const defCompleta = (etapa: any): ItemChecklist[] => [
  ...(((etapa.checklistDef as ItemChecklist[]) ?? [])),
  ...(((etapa.documentosDef as ItemChecklist[]) ?? []).map((d) => ({ ...d, chave: 'doc:' + d.chave }))),
]

async function encerrarEtapa(etapa: any, status: 'CONCLUIDA' | 'PULADA', userId: string | null, patch: Record<string, unknown>, ctx: Record<string, any>) {
  const agora = new Date()
  const inst = etapa.instancia
  await prisma.jorEtapa.update({ where: { id: etapa.id }, data: { status, concluidaEm: agora, concluidaPorId: userId, ...patch } as any })
  await completeReminders({ tenantId: inst.tenantId, refType: REF, refId: etapa.id, userId: userId ?? undefined })
  await prisma.jorInstancia.update({ where: { id: inst.id }, data: { contexto: ctx as any } })
  const { grafo } = await carregarGrafo(inst.tenantId, inst.templateId)
  const prox = proximosNos(grafo, etapa.noChave, ctx)
  const abertas = await ativar({ ...inst, contexto: ctx }, grafo, prox, ctx, userId, agora)
  return { proximos: prox, etapasAbertas: abertas }
}

export async function avancarEtapa(tenantId: string, input: AvancarInput) {
  const etapa = await localizarEtapa(tenantId, input)
  const inst = etapa.instancia
  if (inst.status !== 'ATIVA') throw err(409, `Jornada ${inst.status.toLowerCase()}: não é possível avançar.`)
  if (!ehAberta(etapa.status)) throw err(409, 'Etapa já encerrada.')
  guardaAtor(etapa, input.user)
  const role = String(input.user?.role ?? 'ADMIN').toUpperCase()
  if (etapa.tipo === 'ESPERA_EVENTO' && input.user && !['ADMIN', 'OWNER', 'RECTOR', 'BOARD'].includes(role)) {
    throw err(409, `Etapa aguarda o evento "${etapa.evento}"; ela avança automaticamente quando ele ocorrer.`)
  }
  if (etapa.tipo === 'APROVACAO' && !input.decisao) throw err(400, 'Informe a decisão (APROVADO ou REJEITADO).')
  const agora = new Date()
  const def = defCompleta(etapa)
  const estado = aplicarChecklist(etapa.checklistEstado as any, input.checklist ?? {}, input.user?.id, agora, def)
  const pend = checklistPendente(def, estado)
  // reprovação em aprovação não exige checklist (volta para correção)
  if (pend.length && input.decisao !== 'REJEITADO') {
    await prisma.jorEtapa.update({ where: { id: etapa.id }, data: { checklistEstado: estado as any } })
    throw err(422, `Checklist/documentos obrigatórios pendentes: ${pend.map((p) => p.titulo).join('; ')}`, { pendentes: pend })
  }
  const ctx: Record<string, any> = { ...((inst.contexto as any) ?? {}), ...(input.contexto ?? {}) }
  if (etapa.tipo === 'APROVACAO') { ctx.decisao = input.decisao; ctx[`${etapa.noChave}.decisao`] = input.decisao }
  const r = await encerrarEtapa(etapa, 'CONCLUIDA', input.user?.id ?? null, { checklistEstado: estado as any, decisao: input.decisao ?? null, observacao: input.observacao ?? null, diasAtraso: diasDeAtraso(etapa.prazoEm, agora) }, ctx)
  await historico(tenantId, inst.id, 'ETAPA_CONCLUIDA', input.user?.id, etapa.id, { no: etapa.noChave, decisao: input.decisao, observacao: input.observacao, proximos: r.proximos })
  return { ...r, instancia: await prisma.jorInstancia.findUnique({ where: { id: inst.id } }) }
}

export async function pularEtapa(tenantId: string, input: { etapaId: string; justificativa: string; user: { id: string; role: string } }) {
  if ((input.justificativa ?? '').trim().length < 10) throw err(400, 'Justificativa obrigatória (mínimo 10 caracteres).')
  const etapa = await localizarEtapa(tenantId, input)
  const inst = etapa.instancia
  if (inst.status !== 'ATIVA') throw err(409, 'Jornada não está ativa.')
  if (!ehAberta(etapa.status)) throw err(409, 'Etapa já encerrada.')
  const role = String(input.user.role).toUpperCase()
  const gestor = ['ADMIN', 'OWNER', 'RECTOR', 'BOARD', 'COORDINATOR'].includes(role)
  if (!gestor) throw err(403, 'Somente gestores podem pular etapas.')
  if (etapa.tipo === 'APROVACAO' && !['ADMIN', 'OWNER', 'RECTOR', 'BOARD'].includes(role)) throw err(403, 'Somente a administração pode pular uma aprovação.')
  const ctx: Record<string, any> = { ...((inst.contexto as any) ?? {}), decisao: 'PULADO' }
  const r = await encerrarEtapa(etapa, 'PULADA', input.user.id, { justificativa: input.justificativa }, ctx)
  await historico(tenantId, inst.id, 'ETAPA_PULADA', input.user.id, etapa.id, { no: etapa.noChave, justificativa: input.justificativa })
  await audit({ tenantId, userId: input.user.id, modulo: MODULO, acao: 'PULAR_ETAPA', refType: REF, refId: etapa.id, detalhes: { justificativa: input.justificativa } })
  return r
}

export async function registrarAtraso(tenantId: string, input: { etapaId: string; motivo: string; novoPrazo?: Date; userId?: string }) {
  const etapa = await localizarEtapa(tenantId, input)
  if (!ehAberta(etapa.status)) throw err(409, 'Etapa já encerrada.')
  const agora = new Date()
  const prazo = input.novoPrazo ?? etapa.prazoEm
  const dias = diasDeAtraso(etapa.prazoEm, agora) || 1
  const upd = await prisma.jorEtapa.update({
    where: { id: etapa.id },
    data: input.novoPrazo ? { prazoEm: input.novoPrazo, status: etapa.tipo === 'ESPERA_EVENTO' ? 'AGUARDANDO_EVENTO' : 'ABERTA', observacao: input.motivo, escalonadoNivel: 0, diasAtraso: 0 } : { status: 'ATRASADA', diasAtraso: dias, observacao: input.motivo },
  })
  if (input.novoPrazo && prazo) await criarLembrete(etapa.instancia, upd)
  await historico(tenantId, etapa.instanciaId, 'ATRASO_REGISTRADO', input.userId, etapa.id, { motivo: input.motivo, diasAtraso: dias, novoPrazo: input.novoPrazo ?? null })
  await audit({ tenantId, userId: input.userId, modulo: MODULO, acao: 'ATRASO', refType: REF, refId: etapa.id, detalhes: { motivo: input.motivo } })
  return upd
}

export async function cancelarInstancia(tenantId: string, input: { instanciaId: string; motivo: string; userId?: string }) {
  const inst = await prisma.jorInstancia.findFirst({ where: { id: input.instanciaId, tenantId } })
  if (!inst) throw err(404, 'Jornada não encontrada.')
  if (['CONCLUIDA', 'CANCELADA'].includes(inst.status)) throw err(409, 'Jornada já encerrada.')
  const abertas = await prisma.jorEtapa.findMany({ where: { instanciaId: inst.id, status: { in: ['ABERTA', 'AGUARDANDO_EVENTO', 'ATRASADA'] } }, select: { id: true } })
  await prisma.jorEtapa.updateMany({ where: { id: { in: abertas.map((a) => a.id) } }, data: { status: 'CANCELADA' } })
  for (const a of abertas) await cancelReminders({ tenantId, refType: REF, refId: a.id })
  const up = await prisma.jorInstancia.update({ where: { id: inst.id }, data: { status: 'CANCELADA', canceladaEm: new Date(), motivoCancelamento: input.motivo } })
  await historico(tenantId, inst.id, 'CANCELADA', input.userId, null, { motivo: input.motivo, etapasCanceladas: abertas.length })
  await audit({ tenantId, userId: input.userId, modulo: MODULO, acao: 'CANCELAR_JORNADA', refType: 'JorInstancia', refId: inst.id, detalhes: { motivo: input.motivo } })
  return up
}

export async function pausarInstancia(tenantId: string, instanciaId: string, userId?: string) {
  const inst = await prisma.jorInstancia.findFirst({ where: { id: instanciaId, tenantId } })
  if (!inst) throw err(404, 'Jornada não encontrada.')
  if (inst.status !== 'ATIVA') throw err(409, 'Somente jornadas ativas podem ser pausadas.')
  const abertas = await prisma.jorEtapa.findMany({ where: { instanciaId, status: { in: ['ABERTA', 'AGUARDANDO_EVENTO', 'ATRASADA'] } }, select: { id: true } })
  for (const a of abertas) await cancelReminders({ tenantId, refType: REF, refId: a.id })
  const up = await prisma.jorInstancia.update({ where: { id: instanciaId }, data: { status: 'PAUSADA', contexto: { ...((inst.contexto as any) ?? {}), _pausadaEm: new Date().toISOString() } as any } })
  await historico(tenantId, instanciaId, 'PAUSADA', userId)
  return up
}

// Ao retomar, os prazos das etapas abertas são deslocados pelo tempo pausado.
export async function retomarInstancia(tenantId: string, instanciaId: string, userId?: string) {
  const inst = await prisma.jorInstancia.findFirst({ where: { id: instanciaId, tenantId } })
  if (!inst) throw err(404, 'Jornada não encontrada.')
  if (inst.status !== 'PAUSADA') throw err(409, 'Jornada não está pausada.')
  const ctx: any = { ...((inst.contexto as any) ?? {}) }
  const desde = ctx._pausadaEm ? new Date(ctx._pausadaEm) : new Date()
  delete ctx._pausadaEm
  const delta = Math.max(0, Date.now() - desde.getTime())
  const abertas = await prisma.jorEtapa.findMany({ where: { instanciaId, status: { in: ['ABERTA', 'AGUARDANDO_EVENTO', 'ATRASADA'] } } })
  for (const e of abertas) {
    const novo = e.prazoEm ? new Date(e.prazoEm.getTime() + delta) : null
    const u = await prisma.jorEtapa.update({ where: { id: e.id }, data: { prazoEm: novo, status: e.tipo === 'ESPERA_EVENTO' ? 'AGUARDANDO_EVENTO' : 'ABERTA', diasAtraso: 0, escalonadoNivel: 0 } })
    await criarLembrete(inst, u)
  }
  const up = await prisma.jorInstancia.update({ where: { id: instanciaId }, data: { status: 'ATIVA', contexto: ctx } })
  await historico(tenantId, instanciaId, 'RETOMADA', userId, null, { deslocamentoDias: +(delta / DIA).toFixed(2) })
  return up
}

// Evento externo (ex.: secretaria.matricula_efetivada, regulatorio.enade_realizado): conclui as
// etapas ESPERA_EVENTO correspondentes e segue o fluxo.
export async function dispararEvento(tenantId: string, input: { evento: string; personType?: string; personId?: string; instanciaId?: string; contexto?: Record<string, unknown>; userId?: string }) {
  const etapas = await prisma.jorEtapa.findMany({
    where: {
      tenantId, evento: input.evento, tipo: 'ESPERA_EVENTO', status: { in: ['AGUARDANDO_EVENTO', 'ATRASADA', 'ABERTA'] },
      instancia: { status: 'ATIVA', ...(input.instanciaId ? { id: input.instanciaId } : {}), ...(input.personType ? { personType: input.personType.toLowerCase() } : {}), ...(input.personId ? { personId: input.personId } : {}) },
    },
    include: { instancia: true }, take: 500,
  })
  let avancadas = 0
  for (const e of etapas) {
    const ctx: Record<string, any> = { ...((e.instancia.contexto as any) ?? {}), ...(input.contexto ?? {}), [`evento.${input.evento}`]: new Date().toISOString() }
    await encerrarEtapa(e, 'CONCLUIDA', input.userId ?? null, { observacao: `Evento ${input.evento}` }, ctx)
    await historico(tenantId, e.instanciaId, 'EVENTO_RECEBIDO', input.userId, e.id, { evento: input.evento })
    avancadas++
  }
  return { encontradas: etapas.length, avancadas }
}

export async function listarPendenciasDaPessoa(tenantId: string, personType: string, personId: string) {
  const etapas = await prisma.jorEtapa.findMany({
    where: { tenantId, status: { in: ['ABERTA', 'AGUARDANDO_EVENTO', 'ATRASADA'] }, instancia: { personType: personType.toLowerCase(), personId, status: 'ATIVA' } },
    include: { instancia: { select: { id: true, templateChave: true, personNome: true } } },
    orderBy: [{ prazoEm: 'asc' }],
  })
  const agora = new Date()
  return etapas.map((e) => ({
    etapaId: e.id, instanciaId: e.instanciaId, jornada: e.instancia.templateChave, titulo: e.titulo, tipo: e.tipo, papel: e.papel, fase: e.fase, modulo: e.modulo, rota: e.rota,
    status: e.status, prazoEm: e.prazoEm, diasAtraso: e.prazoEm ? diasDeAtraso(e.prazoEm, agora) : 0, diasParaPrazo: e.prazoEm ? Math.ceil((e.prazoEm.getTime() - agora.getTime()) / DIA) : null,
  }))
}

// ------------------------------------------------------------ job de atrasos
export async function processarAtrasos(now = new Date()) {
  const vencidas = await prisma.jorEtapa.findMany({
    where: { status: { in: ['ABERTA', 'AGUARDANDO_EVENTO', 'ATRASADA'] }, prazoEm: { lt: now }, instancia: { status: 'ATIVA' } },
    include: { instancia: true }, take: 1000, orderBy: { prazoEm: 'asc' },
  })
  let marcadas = 0, escalonadas = 0
  for (const e of vencidas) {
    const dias = diasDeAtraso(e.prazoEm, now)
    const plano = planoEscalonamento(e.lembreteConfig as any, dias, e.escalonadoNivel)
    if (e.status !== 'ATRASADA') {
      marcadas++
      await historico(e.tenantId, e.instanciaId, 'ATRASO_DETECTADO', null, e.id, { no: e.noChave, diasAtraso: dias })
    }
    const data: any = { status: 'ATRASADA', diasAtraso: dias }
    if (plano.nivel > e.escalonadoNivel && plano.destinoPapel) {
      const quem = e.instancia.personNome ?? e.instancia.personType
      await scheduleReminder({
        tenantId: e.tenantId, modulo: MODULO, refType: REF, refId: e.id,
        titulo: `ESCALONADO (nível ${plano.nivel}): ${quem} — ${e.titulo} atrasada há ${dias} dia(s)`,
        descricao: `Responsável original: ${e.papel ?? '-'}. Jornada ${e.instancia.templateChave}.`,
        dueAt: e.prazoEm!, remindAt: now, severity: 'CRITICO', assigneeRole: plano.destinoPapel, recorrenciaDias: 3,
        dedupeKey: `jor:escala:${e.id}:${plano.nivel}`,
      })
      await prisma.eduReminder.updateMany({ where: { tenantId: e.tenantId, dedupeKey: `jor:etapa:${e.id}`, status: { in: ['PENDENTE', 'NOTIFICADO', 'ADIADO'] } }, data: { severity: 'CRITICO' } })
      // o aviso ao gestor é entregue pelo lembrete CRITICO (assigneeRole) via processDueReminders
      data.escalonadoNivel = plano.nivel
      data.escalonadoEm = now
      escalonadas++
      await historico(e.tenantId, e.instanciaId, 'ESCALONADA', null, e.id, { nivel: plano.nivel, destino: plano.destinoPapel, diasAtraso: dias })
    }
    await prisma.jorEtapa.update({ where: { id: e.id }, data })
  }
  return { avaliadas: vencidas.length, novasAtrasadas: marcadas, escalonadas }
}

registerEduJob('jornadas.atrasos', () => processarAtrasos())
