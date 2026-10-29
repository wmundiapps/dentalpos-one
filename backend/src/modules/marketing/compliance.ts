// Conformidade LGPD: supressão global, opt-in, janela, frequência e prova de consentimento.
// TODO envio passa por checarEnvio() imediatamente antes de sair (inclusive agendados), então um descadastro posterior sempre vence.
import { prisma } from '../../lib/prisma'
import { audit } from '../core/notify'
import { sincronizarMarketing } from '../lgpd/consentimentos'
import { db, getConfig, hashId, mask, normEmail, normFone, sha } from './common'
import { dentroDaJanela, excedeFrequencia, proximaJanela } from './logic'

export interface Identificadores { email?: string | null; telefone?: string | null; telegram?: string | null; documento?: string | null }

export function chavesDe(tenantId: string, i: Identificadores) {
  const out: Array<{ tipo: string; hash: string; mascarado: string }> = []
  const e = normEmail(i.email); if (e) out.push({ tipo: 'EMAIL', hash: hashId(tenantId, 'EMAIL', e), mascarado: mask('EMAIL', e) })
  const t = normFone(i.telefone); if (t) out.push({ tipo: 'TELEFONE', hash: hashId(tenantId, 'TELEFONE', t), mascarado: mask('TELEFONE', t) })
  if (i.telegram) out.push({ tipo: 'TELEGRAM', hash: hashId(tenantId, 'TELEGRAM', String(i.telegram)), mascarado: mask('TELEGRAM', String(i.telegram)) })
  const d = String(i.documento ?? '').replace(/\D+/g, ''); if (d.length >= 11) out.push({ tipo: 'DOCUMENTO', hash: hashId(tenantId, 'DOCUMENTO', d), mascarado: mask('DOCUMENTO', d) })
  return out
}

/** Adiciona à lista de supressão GLOBAL todos os identificadores da pessoa (vale para todos os canais) e propaga ao opt-out do módulo de comunicação e à LGPD. */
export async function suprimir(tenantId: string, ids: Identificadores, motivo: string, extra: { canalOrigem?: string; leadId?: string | null; contatoId?: string | null; observacao?: string; userId?: string } = {}) {
  // a pessoa é identificada por TODOS os identificadores conhecidos (leads com o mesmo e-mail/telefone): o descadastro vale para todos os canais
  const e0 = normEmail(ids.email); const t0 = normFone(ids.telefone)
  const leadWhere: any[] = []
  if (e0) leadWhere.push({ emailNorm: e0 })
  if (t0) leadWhere.push({ telefone: t0 })
  if (extra.leadId) leadWhere.push({ id: extra.leadId })
  const leads = leadWhere.length ? await db.mktLead.findMany({ where: { tenantId, OR: leadWhere }, select: { id: true, candidatoId: true, contatoId: true, emailNorm: true, telefone: true } }) : []
  const todos: Identificadores[] = [ids, ...leads.map((l: any) => ({ email: l.emailNorm, telefone: l.telefone }))]
  const porHash = new Map<string, { tipo: string; hash: string; mascarado: string }>()
  for (const i of todos) for (const c of chavesDe(tenantId, i)) porHash.set(`${c.tipo}:${c.hash}`, c)
  const chaves = [...porHash.values()]
  const e = e0 ?? leads.find((l: any) => l.emailNorm)?.emailNorm ?? null; const t = t0 ?? leads.find((l: any) => l.telefone)?.telefone ?? null
  let novos = 0
  for (const c of chaves) {
    const ex = await db.mktSupressao.findUnique({ where: { tenantId_tipo_chaveHash: { tenantId, tipo: c.tipo, chaveHash: c.hash } } })
    if (ex?.ativo) continue
    if (ex) await db.mktSupressao.update({ where: { id: ex.id }, data: { ativo: true, removidoEm: null, motivo, canalOrigem: extra.canalOrigem } })
    else await db.mktSupressao.create({ data: { tenantId, tipo: c.tipo, chaveHash: c.hash, mascarado: c.mascarado, motivo, canalOrigem: extra.canalOrigem, leadId: extra.leadId ?? undefined, contatoId: extra.contatoId ?? undefined, observacao: extra.observacao } })
    novos++
  }
  // lead(s) vinculados: revoga consentimento de marketing e cancela cadências/envios pendentes
  for (const l of leads) {
    await db.mktLead.update({ where: { id: l.id }, data: { consentimentoMarketing: false } })
    await db.mktLeadEvento.create({ data: { tenantId, leadId: l.id, tipo: 'DESCADASTRO', pontos: 0, descricao: `Descadastro (${motivo}) — todos os canais` } })
    await db.mktCadenciaExecucao.updateMany({ where: { tenantId, leadId: l.id, status: 'ATIVA' }, data: { status: 'PARADA', motivo: 'Contato descadastrado' } })
    await db.mktEnvio.updateMany({ where: { tenantId, leadId: l.id, status: 'AGENDADO' }, data: { status: 'CANCELADO', motivo: 'Contato descadastrado' } })
    if (l.candidatoId) await prisma.admCandidato.updateMany({ where: { id: l.candidatoId, tenantId }, data: { consentimentoMarketing: false } })
  }
  const envE = await db.mktEnvio.updateMany({ where: { tenantId, status: 'AGENDADO', destinoHash: { in: chaves.map((c) => c.hash) } }, data: { status: 'CANCELADO', motivo: 'Contato descadastrado' } })
  await db.mktConsentimento.updateMany({ where: { tenantId, revogadoEm: null, OR: [...(chaves.length ? [{ emailHash: { in: chaves.map((c) => c.hash) } }, { telefoneHash: { in: chaves.map((c) => c.hash) } }] : [])] }, data: { revogadoEm: new Date(), motivoRevogacao: motivo } })
  // opt-out da Comunicação (todos os canais, finalidade MARKETING) e revogação LGPD
  try {
    const tels = t ? [t, `+${t}`] : []
    const sync = await sincronizarMarketing(tenantId, { email: e, telefones: tels, docDigits: ids.documento ? [String(ids.documento).replace(/\D+/g, '')] : [], contatoIds: leads.map((l: any) => l.contatoId).filter(Boolean) }, false)
    void sync
  } catch (err) { console.error('[mkt-suprimir-sync]', err) }
  await audit({ tenantId, userId: extra.userId, modulo: 'marketing', acao: 'SUPRESSAO_ADICIONADA', refType: 'MktSupressao', detalhes: { motivo, canalOrigem: extra.canalOrigem, identificadores: chaves.map((c) => c.mascarado), canceladosPendentes: envE.count } })
  return { novos, identificadores: chaves.map((c) => c.mascarado) }
}

export async function estaSuprimido(tenantId: string, ids: Identificadores): Promise<{ suprimido: boolean; motivo?: string }> {
  const chaves = chavesDe(tenantId, ids)
  if (!chaves.length) return { suprimido: false }
  const r = await db.mktSupressao.findFirst({ where: { tenantId, ativo: true, OR: chaves.map((c) => ({ tipo: c.tipo, chaveHash: c.hash })) } })
  return r ? { suprimido: true, motivo: `Contato na lista de supressão global (${r.motivo}).` } : { suprimido: false }
}

/** Remover da supressão exige novo opt-in explícito do titular (ou decisão registrada do gestor). */
export async function reativar(tenantId: string, id: string, userId: string, motivo: string) {
  const s = await db.mktSupressao.findFirst({ where: { id, tenantId } })
  if (!s) throw Object.assign(new Error('Registro não encontrado.'), { status: 404 })
  await db.mktSupressao.update({ where: { id }, data: { ativo: false, removidoEm: new Date(), removidoPorId: userId, motivoRemocao: motivo } })
  await audit({ tenantId, userId, modulo: 'marketing', acao: 'SUPRESSAO_REMOVIDA', refType: 'MktSupressao', refId: id, detalhes: { motivo } })
}

/** Há opt-in de marketing comprovado para a pessoa? (MktConsentimento ativo, preferência de Comunicação, candidato ou LGPD). */
export async function temOptIn(tenantId: string, ids: Identificadores, ctx: { leadId?: string | null; candidatoId?: string | null } = {}): Promise<boolean> {
  const chaves = chavesDe(tenantId, ids).map((c) => c.hash)
  if (chaves.length || ctx.leadId) {
    const c = await db.mktConsentimento.findFirst({ where: { tenantId, concedido: true, revogadoEm: null, finalidade: 'MARKETING', OR: [...(chaves.length ? [{ emailHash: { in: chaves } }, { telefoneHash: { in: chaves } }] : []), ...(ctx.leadId ? [{ leadId: ctx.leadId }] : [])] } })
    if (c) return true
  }
  const e = normEmail(ids.email); const t = normFone(ids.telefone)
  const or: any[] = []
  if (e) or.push({ email: { equals: e, mode: 'insensitive' } })
  if (t) or.push({ telefone: { in: [t, `+${t}`] } })
  if (or.length) {
    const ctt = await prisma.comContato.findMany({ where: { tenantId, OR: or }, select: { id: true } })
    if (ctt.length) {
      const p = await prisma.comPreferencia.findFirst({ where: { tenantId, contatoId: { in: ctt.map((x) => x.id) }, finalidade: { in: ['MARKETING', 'TODAS'] }, consentimento: true } })
      if (p) return true
    }
  }
  if (ctx.candidatoId) {
    const cd = await prisma.admCandidato.findFirst({ where: { id: ctx.candidatoId, tenantId, consentimentoMarketing: true }, select: { id: true } })
    if (cd) return true
  }
  if (e) {
    const l = await prisma.lgpConsentimento.findFirst({ where: { tenantId, finalidade: 'COMUNICACAO_MARKETING', status: 'ATIVO', concedido: true, titularEmail: e }, select: { id: true } })
    if (l) return true
  }
  return false
}

/** Opt-out explícito no módulo de Comunicação (ComPreferencia consentimento=false) ou revogação LGPD vence qualquer opt-in. */
async function optOutComunicacao(tenantId: string, ids: Identificadores): Promise<boolean> {
  const e = normEmail(ids.email); const t = normFone(ids.telefone)
  const or: any[] = []
  if (e) or.push({ email: { equals: e, mode: 'insensitive' } })
  if (t) or.push({ telefone: { in: [t, `+${t}`] } })
  if (!or.length) return false
  const ctt = await prisma.comContato.findMany({ where: { tenantId, OR: or }, select: { id: true } })
  if (!ctt.length) return false
  const p = await prisma.comPreferencia.findFirst({ where: { tenantId, contatoId: { in: ctt.map((x) => x.id) }, finalidade: { in: ['MARKETING', 'TODAS'] }, consentimento: false } })
  return !!p
}

export interface Verificacao { ok: boolean; motivo?: string; adiarPara?: Date; codigo?: string }
/** Pipeline único de conformidade antes de qualquer envio. finalidade TRANSACIONAL (lembrete de evento inscrito, resposta ao lead que pediu contato) dispensa opt-in/frequência, mas NUNCA a supressão. */
export async function checarEnvio(tenantId: string, p: { canal: string; destino: string; finalidade: string; leadId?: string | null; candidatoId?: string | null; agora?: Date; ignorarJanela?: boolean }): Promise<Verificacao> {
  const agora = p.agora ?? new Date()
  const ids: Identificadores = { email: p.canal === 'EMAIL' ? p.destino : null, telefone: ['SMS', 'WHATSAPP', 'VOZ'].includes(p.canal) ? p.destino : null, telegram: p.canal === 'TELEGRAM' ? p.destino : null }
  if (p.leadId) {
    const l = await db.mktLead.findFirst({ where: { id: p.leadId, tenantId }, select: { emailNorm: true, telefone: true } })
    if (l) { ids.email = ids.email ?? l.emailNorm; ids.telefone = ids.telefone ?? l.telefone }
  }
  // pessoa suprimida por QUALQUER identificador (e-mail, telefone...) => bloqueia todos os canais
  const s = await estaSuprimido(tenantId, ids)
  if (s.suprimido) return { ok: false, motivo: s.motivo, codigo: 'SUPRIMIDO' }
  if (await optOutComunicacao(tenantId, ids)) return { ok: false, motivo: 'Contato optou por não receber marketing (módulo de Comunicação).', codigo: 'OPT_OUT' }
  if (p.finalidade === 'MARKETING') {
    if (!(await temOptIn(tenantId, ids, { leadId: p.leadId, candidatoId: p.candidatoId }))) return { ok: false, motivo: 'Sem consentimento (opt-in) de marketing registrado.', codigo: 'SEM_OPT_IN' }
    const cfg = await getConfig(tenantId)
    const alvoHash = chavesDe(tenantId, ids).map((c) => c.hash)
    const [dia, sem] = await Promise.all([
      db.mktEnvio.count({ where: { tenantId, finalidade: 'MARKETING', status: { in: ['ENVIADO', 'ENTREGUE', 'LIDO'] }, destinoHash: { in: alvoHash }, enviadoEm: { gte: new Date(agora.getTime() - 24 * 3600_000) } } }),
      db.mktEnvio.count({ where: { tenantId, finalidade: 'MARKETING', status: { in: ['ENVIADO', 'ENTREGUE', 'LIDO'] }, destinoHash: { in: alvoHash }, enviadoEm: { gte: new Date(agora.getTime() - 7 * 24 * 3600_000) } } }),
    ])
    // o mesmo envio pode ter 2 hashes (e-mail/telefone) da mesma pessoa; contamos por destino exato, que é o gravado em destinoHash
    const f = excedeFrequencia(dia, sem, cfg.limiteDia, cfg.limiteSemana)
    if (f) return { ok: false, motivo: f, codigo: 'FREQUENCIA' }
  }
  if (!p.ignorarJanela && ['SMS', 'WHATSAPP', 'VOZ', 'TELEGRAM', 'EMAIL'].includes(p.canal) && p.finalidade === 'MARKETING') {
    const cfg = await getConfig(tenantId)
    if (!dentroDaJanela(agora, cfg)) return { ok: false, motivo: `Fora da janela de horário permitida (${cfg.janelaInicio}-${cfg.janelaFim}).`, adiarPara: proximaJanela(agora, cfg), codigo: 'JANELA' }
  }
  return { ok: true }
}

export function hashDestino(tenantId: string, canal: string, destino: string) {
  const tipo = canal === 'EMAIL' ? 'EMAIL' : canal === 'TELEGRAM' ? 'TELEGRAM' : 'TELEFONE'
  const v = tipo === 'EMAIL' ? normEmail(destino) ?? destino : tipo === 'TELEFONE' ? normFone(destino) ?? destino : destino
  return hashId(tenantId, tipo, v)
}
export const _sha = sha
