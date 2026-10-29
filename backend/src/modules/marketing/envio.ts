// Despacho de mensagens: registro (MktEnvio), conformidade, provedor e descadastro de 1 clique.
import { renderTemplate } from '../comunicacao/pure'
import { audit } from '../core/notify'
import { db, publicApi, token } from './common'
import { checarEnvio, hashDestino, suprimir } from './compliance'
import { ehPedidoDeSaida, rodapeDescadastro } from './logic'
import { provedorCanal } from './providers'

export interface EnvioParams {
  tenantId: string; canal: string; destino: string; assunto?: string | null; corpo: string; finalidade?: string
  leadId?: string | null; contatoId?: string | null; candidatoId?: string | null; disparoId?: string | null; campanhaId?: string | null; cadenciaExecId?: string | null; eventoInscricaoId?: string | null
  vars?: Record<string, any>; ignorarJanela?: boolean
}
export const urlDescadastro = (tok: string) => `${publicApi().replace(/\/api$/, '')}/descadastro/${tok}`

/** Cria o envio, aplica a conformidade e tenta enviar. Retorna o MktEnvio final (status ENVIADO | FALHA | BLOQUEADO | AGENDADO). */
export async function enviar(p: EnvioParams) {
  const finalidade = p.finalidade ?? 'MARKETING'
  const tok = token(16)
  const link = urlDescadastro(tok)
  const vars = { ...(p.vars ?? {}), link_descadastro: link }
  const assunto = p.assunto ? renderTemplate(p.assunto, vars).texto : null
  let corpo = renderTemplate(p.corpo, vars).texto
  if (!corpo.includes(link)) corpo += rodapeDescadastro(p.canal, link)
  const base = { tenantId: p.tenantId, disparoId: p.disparoId ?? undefined, cadenciaExecId: p.cadenciaExecId ?? undefined, eventoInscricaoId: p.eventoInscricaoId ?? undefined, campanhaId: p.campanhaId ?? undefined, leadId: p.leadId ?? undefined, contatoId: p.contatoId ?? undefined, canal: p.canal, destino: p.destino, destinoHash: hashDestino(p.tenantId, p.canal, p.destino), assunto, corpo, finalidade, tokenDescadastro: tok }
  const v = await checarEnvio(p.tenantId, { canal: p.canal, destino: p.destino, finalidade, leadId: p.leadId, candidatoId: p.candidatoId, ignorarJanela: p.ignorarJanela })
  if (!v.ok && v.adiarPara) return db.mktEnvio.create({ data: { ...base, status: 'AGENDADO', motivo: v.motivo, agendadoPara: v.adiarPara } })
  if (!v.ok) return db.mktEnvio.create({ data: { ...base, status: 'BLOQUEADO', motivo: v.motivo } })
  const row = await db.mktEnvio.create({ data: { ...base, status: 'AGENDADO', agendadoPara: new Date() } })
  return executar(row.id, true)
}

async function executar(id: string, jaChecado = false) {
  const e = await db.mktEnvio.findUnique({ where: { id } })
  if (!e || e.status !== 'AGENDADO') return e
  if (!jaChecado) {
    const v = await checarEnvio(e.tenantId, { canal: e.canal, destino: e.destino, finalidade: e.finalidade, leadId: e.leadId })
    if (!v.ok && v.adiarPara) return db.mktEnvio.update({ where: { id }, data: { agendadoPara: v.adiarPara, motivo: v.motivo } })
    if (!v.ok) return db.mktEnvio.update({ where: { id }, data: { status: 'BLOQUEADO', motivo: v.motivo } })
  }
  const r = await provedorCanal(e.canal).enviar({ destino: e.destino, assunto: e.assunto, corpo: e.corpo })
  if (!r.ok && r.hardBounce) {
    await suprimir(e.tenantId, e.canal === 'EMAIL' ? { email: e.destino } : { telefone: e.destino }, 'BOUNCE', { canalOrigem: e.canal, leadId: e.leadId })
  }
  return db.mktEnvio.update({ where: { id }, data: r.ok ? { status: 'ENVIADO', enviadoEm: new Date(), provedor: r.provedor, simulado: r.simulado, externalId: r.externalId, motivo: null } : { status: 'FALHA', motivo: r.erro, provedor: r.provedor, simulado: r.simulado } })
}

/** Job: envia o que estava adiado por janela de horário (reavalia suprimidos/opt-out no momento do envio). */
export async function processarAgendados(limite = 200) {
  const due = await db.mktEnvio.findMany({ where: { status: 'AGENDADO', agendadoPara: { lte: new Date() } }, orderBy: { agendadoPara: 'asc' }, take: limite })
  let enviados = 0, bloqueados = 0, adiados = 0
  for (const d of due) {
    const r = await executar(d.id)
    if (r?.status === 'ENVIADO') enviados++
    else if (r?.status === 'BLOQUEADO') bloqueados++
    else adiados++
  }
  return { processados: due.length, enviados, bloqueados, adiados }
}

/** Descadastro de 1 clique: o token vem no rodapé de TODAS as mensagens, de qualquer canal. Suprime a pessoa em todos os canais. */
export async function descadastrarPorToken(tok: string, motivo = 'DESCADASTRO') {
  const e = await db.mktEnvio.findUnique({ where: { tokenDescadastro: tok } })
  if (!e) throw Object.assign(new Error('Link de descadastro inválido ou expirado.'), { status: 404 })
  const ids = e.canal === 'EMAIL' ? { email: e.destino } : e.canal === 'TELEGRAM' ? { telegram: e.destino } : { telefone: e.destino }
  const r = await suprimir(e.tenantId, ids, motivo, { canalOrigem: e.canal, leadId: e.leadId, contatoId: e.contatoId, observacao: 'Descadastro em 1 clique' })
  await audit({ tenantId: e.tenantId, modulo: 'marketing', acao: 'DESCADASTRO_1_CLIQUE', refType: 'MktEnvio', refId: e.id, detalhes: { canal: e.canal } })
  return { ok: true, ...r }
}

/** Mensagem recebida (SMS/WhatsApp/Telegram/e-mail/voz): palavras como SAIR/PARAR suprimem em todos os canais. */
export async function tratarEntrada(tenantId: string, canal: string, remetente: string, texto: string) {
  if (!ehPedidoDeSaida(texto)) return { optOut: false }
  const ids = canal === 'EMAIL' ? { email: remetente } : canal === 'TELEGRAM' ? { telegram: remetente } : { telefone: remetente }
  const r = await suprimir(tenantId, ids, 'SAIR', { canalOrigem: canal, observacao: 'Pedido de saída por mensagem' })
  return { optOut: true, ...r }
}
