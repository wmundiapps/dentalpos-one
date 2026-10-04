import { prisma } from '../../lib/prisma'
import { revahConfigured } from '../../services/revahBridge'
import { audit } from '../core/notify'
import { sendVia } from './adapters'
import { checarConsentimento, contatoDaNotificacao, getConfig, lerCfg, webhookUrl } from './store'
import { decidirRetentativa, dentroDaJanela, pickDestino, proximaJanela } from './pure'

const db = prisma as any
const TIPOS_DESPACHO = ['EMAIL', 'WHATSAPP', 'SMS', 'TELEGRAM', 'VOZ', 'INSTAGRAM', 'FACEBOOK']
const SEMPRE_JANELA = ['WHATSAPP', 'SMS', 'VOZ']

type Notif = Awaited<ReturnType<typeof prisma.eduNotification.findFirst>> & {}

interface TenantCtx {
  tenantId: string
  cfg: Awaited<ReturnType<typeof getConfig>>
  canais: Map<string, any>
  contadores: Map<string, { hora: number; dia: number }>
}

export interface ResultadoDespacho {
  avaliadas: number
  enviadas: number
  falhas: number
  canceladas: number
  reagendadas: number
  tentativasPendentes: number
  puladas: number
}

async function ctxTenant(cache: Map<string, TenantCtx>, tenantId: string): Promise<TenantCtx> {
  let c = cache.get(tenantId)
  if (!c) {
    const cfg = await getConfig(tenantId)
    const rows = await prisma.comCanal.findMany({ where: { tenantId, ativo: true }, orderBy: { updatedAt: 'desc' } })
    const canais = new Map<string, any>()
    for (const r of rows) if (r.configurado && !canais.has(r.tipo)) canais.set(r.tipo, r)
    c = { tenantId, cfg, canais, contadores: new Map() }
    cache.set(tenantId, c)
  }
  return c
}

async function contador(ctx: TenantCtx, canal: string, now: Date) {
  let c = ctx.contadores.get(canal)
  if (!c) {
    const base = { tenantId: ctx.tenantId, canal, status: { in: ['ENVIADA', 'ENTREGUE', 'LIDA'] as any } }
    const [hora, dia] = await Promise.all([
      prisma.eduNotification.count({ where: { ...base, enviadoEm: { gte: new Date(now.getTime() - 3600_000) } } }),
      prisma.eduNotification.count({ where: { ...base, enviadoEm: { gte: new Date(now.getTime() - 86_400_000) } } }),
    ])
    c = { hora, dia }
    ctx.contadores.set(canal, c)
  }
  return c
}

async function finalidadeDe(n: { tenantId: string; refType: string | null; refId: string | null }): Promise<string> {
  if (n.refType === 'ComReguaExec') return 'COBRANCA'
  if (n.refType === 'ComCampanha' && n.refId) {
    const c = await prisma.comCampanha.findFirst({ where: { id: n.refId, tenantId: n.tenantId }, select: { finalidade: true } })
    return c?.finalidade ?? 'MARKETING'
  }
  return 'ACADEMICO'
}

async function atualizarMensagem(notificationId: string, status: string, erro?: string | null) {
  try {
    await prisma.comMensagem.updateMany({ where: { notificationId }, data: { status, erro: erro ?? null } })
  } catch {
    /* sem conversa vinculada */
  }
}

async function liberar(n: { id: string }, data: Record<string, unknown>) {
  await prisma.eduNotification.update({ where: { id: n.id }, data: data as any })
}

// Despacha UMA notificação. Nunca finge envio: sem canal/credencial -> FALHA explicativa.
export async function despacharNotificacao(n: NonNullable<Notif>, ctx: TenantCtx, now = new Date()): Promise<'ENVIADA' | 'FALHA' | 'CANCELADA' | 'REAGENDADA' | 'RETENTAR' | 'PULADA'> {
  const tipo = String(n.canal).toUpperCase()
  if (tipo === 'IN_APP') return 'PULADA'

  // claim otimista (lease de 15 min) para evitar envio duplicado entre execuções concorrentes
  const claim = await prisma.eduNotification.updateMany({
    where: { id: n.id, status: 'PENDENTE', tentativas: n.tentativas },
    data: { tentativas: n.tentativas + 1, agendadoPara: new Date(now.getTime() + 15 * 60_000) },
  })
  if (claim.count === 0) return 'PULADA'
  const tentativas = n.tentativas + 1

  const falhar = async (erro: string, status: 'FALHA' | 'CANCELADA' = 'FALHA') => {
    await liberar(n, { status, erro, enviadoEm: null })
    await atualizarMensagem(n.id, status === 'FALHA' ? 'FALHA' : 'FALHA', erro)
    return status
  }

  if (!TIPOS_DESPACHO.includes(tipo)) return falhar(`Canal "${n.canal}" não é despachável pelo módulo de comunicação.`)
  const canal = ctx.canais.get(tipo)
  if (!canal) return falhar(`Canal ${tipo} não configurado para esta instituição: cadastre as credenciais em /comunicacao/canais. A mensagem NÃO foi enviada.`)

  // destino e contato
  const alvo = await contatoDaNotificacao({ tenantId: n.tenantId, studentId: n.studentId, userId: n.userId, destino: n.destino, canal: tipo })
  const destino = n.destino || pickDestino(tipo, alvo) || null
  if (!destino) return falhar(`Sem destino para o canal ${tipo}: o contato não tem ${tipo === 'EMAIL' ? 'e-mail' : tipo === 'TELEGRAM' ? 'chat do Telegram' : 'telefone'} cadastrado.`)

  // consentimento LGPD
  const finalidade = await finalidadeDe(n)
  const consent = await checarConsentimento(n.tenantId, alvo.contato?.id, tipo, finalidade)
  if (!consent.ok) return falhar(consent.motivo ?? 'Opt-out do contato.', 'CANCELADA')

  // cobrança: não cobrar título já quitado
  if (n.refType === 'ComReguaExec' && n.refId) {
    const ex = await prisma.comReguaExecucao.findFirst({ where: { id: n.refId, tenantId: n.tenantId } })
    if (ex) {
      const t = await db.accountReceivable.findFirst({ where: { id: ex.receivableId, tenantId: n.tenantId }, select: { status: true } })
      if (t && (t.status === 'PAGO' || t.status === 'CANCELADO')) return falhar('Título já quitado/cancelado: cobrança suprimida.', 'CANCELADA')
    }
  }

  // janela de horário comercial (respostas de conversa são imediatas)
  const emConversa = n.refType === 'ComConversa'
  if (!emConversa && (SEMPRE_JANELA.includes(tipo) || canal.restringirHorario) && !dentroDaJanela(now, ctx.cfg)) {
    await liberar(n, { tentativas: n.tentativas, agendadoPara: proximaJanela(now, ctx.cfg) })
    return 'REAGENDADA'
  }

  // limites por canal
  const cont = await contador(ctx, tipo, now)
  if (!emConversa && cont.hora >= canal.limiteHora) {
    await liberar(n, { tentativas: n.tentativas, agendadoPara: new Date(now.getTime() + 15 * 60_000) })
    return 'REAGENDADA'
  }
  if (!emConversa && cont.dia >= canal.limiteDia) {
    await liberar(n, { tentativas: n.tentativas, agendadoPara: proximaJanela(new Date(now.getTime() + 6 * 3600_000), ctx.cfg) })
    return 'REAGENDADA'
  }

  const lido = lerCfg(canal)
  if (!lido.cfg) return falhar(lido.erro ?? 'Credenciais do canal ausentes.')

  const r = await sendVia(tipo, canal.provedor, lido.cfg, {
    destino,
    assunto: n.assunto,
    mensagem: n.mensagem,
    statusCallback: ['WHATSAPP', 'SMS', 'VOZ'].includes(tipo) && canal.provedor === 'TWILIO' ? webhookUrl(canal.id, '/status') : undefined,
  })
  if (r.ok) {
    cont.hora++
    cont.dia++
    await liberar(n, { status: 'ENVIADA', enviadoEm: new Date(), provedorId: r.provedorId ?? null, erro: null, destino })
    await atualizarMensagem(n.id, 'ENVIADA')
    if (!emConversa) await registrarSaidaNaCaixa(n, alvo.contato, tipo, destino).catch(() => undefined)
    return 'ENVIADA'
  }
  const dec = decidirRetentativa({ tentativas, maxTentativas: ctx.cfg.maxTentativas, retryable: !!r.retryable, now, backoff: ctx.cfg.backoffMinutos })
  if (dec.acao === 'RETENTAR') {
    await liberar(n, { status: 'PENDENTE', erro: `Tentativa ${tentativas}/${ctx.cfg.maxTentativas}: ${r.erro}`, agendadoPara: dec.proximaEm })
    return 'RETENTAR'
  }
  return falhar(`${r.erro}${r.retryable ? ` (esgotadas ${tentativas} tentativas)` : ''}`)
}

// Espelha o envio da caixa de saída na conversa do contato (histórico unificado).
async function registrarSaidaNaCaixa(n: any, contato: any, tipo: string, destino: string) {
  if (!contato) return
  let conv = await prisma.comConversa.findFirst({ where: { tenantId: n.tenantId, contatoId: contato.id, canalTipo: tipo as any, status: { notIn: ['RESOLVIDA', 'ARQUIVADA'] } }, orderBy: { ultimaMensagemEm: 'desc' } })
  if (!conv) conv = await prisma.comConversa.create({ data: { tenantId: n.tenantId, contatoId: contato.id, canalTipo: tipo as any, chaveExterna: destino, status: 'AGUARDANDO_CONTATO', assunto: n.assunto ?? undefined, botAtivo: true } })
  await prisma.comMensagem.create({ data: { tenantId: n.tenantId, conversaId: conv.id, direcao: 'SAIDA', autorTipo: 'SISTEMA', conteudo: n.mensagem, notificationId: n.id, status: 'ENVIADA' } })
  await prisma.comConversa.update({ where: { id: conv.id }, data: { ultimaMensagemEm: new Date(), ultimaDirecao: 'SAIDA' } })
}

// Despacha a caixa de saída (job + endpoint manual).
export async function despacharPendentes(opts: { tenantId?: string; limit?: number; now?: Date } = {}): Promise<ResultadoDespacho> {
  const now = opts.now ?? new Date()
  const res: ResultadoDespacho = { avaliadas: 0, enviadas: 0, falhas: 0, canceladas: 0, reagendadas: 0, tentativasPendentes: 0, puladas: 0 }
  const where: any = { status: 'PENDENTE', canal: { not: 'IN_APP' }, agendadoPara: { lte: now } }
  if (opts.tenantId) where.tenantId = opts.tenantId
  if (revahConfigured()) {
    const deleg = await prisma.comCanal.findMany({ where: { delegarRevah: true, ativo: true, ...(opts.tenantId ? { tenantId: opts.tenantId } : {}) }, select: { tenantId: true, tipo: true } })
    if (deleg.length) where.NOT = deleg.map((d) => ({ tenantId: d.tenantId, canal: d.tipo }))
  }
  const itens = await prisma.eduNotification.findMany({ where, orderBy: { agendadoPara: 'asc' }, take: opts.limit ?? 200 })
  const cache = new Map<string, TenantCtx>()
  for (const n of itens) {
    res.avaliadas++
    try {
      const ctx = await ctxTenant(cache, n.tenantId)
      const r = await despacharNotificacao(n, ctx, now)
      if (r === 'ENVIADA') res.enviadas++
      else if (r === 'FALHA') res.falhas++
      else if (r === 'CANCELADA') res.canceladas++
      else if (r === 'REAGENDADA') res.reagendadas++
      else if (r === 'RETENTAR') res.tentativasPendentes++
      else res.puladas++
    } catch (e: any) {
      console.error('[com-dispatch]', n.id, e)
      res.puladas++
      await prisma.eduNotification.update({ where: { id: n.id }, data: { status: 'PENDENTE', erro: `Erro interno: ${e?.message || e}`, agendadoPara: new Date(now.getTime() + 5 * 60_000) } }).catch(() => undefined)
    }
  }
  if (res.enviadas || res.falhas) {
    const tenants = [...new Set(itens.map((i) => i.tenantId))]
    for (const t of tenants) await audit({ tenantId: t, modulo: 'comunicacao', acao: 'DESPACHO', detalhes: res })
  }
  return res
}

// Envio imediato de uma notificação específica (reenvio manual / resposta de conversa).
export async function despacharPorId(tenantId: string, id: string) {
  const n = await prisma.eduNotification.findFirst({ where: { id, tenantId } })
  if (!n) return null
  const ctx = await ctxTenant(new Map(), tenantId)
  const r = await despacharNotificacao(n, ctx)
  return { resultado: r, notificacao: await prisma.eduNotification.findFirst({ where: { id, tenantId } }) }
}

export async function reenfileirar(tenantId: string, id: string) {
  const r = await prisma.eduNotification.updateMany({ where: { id, tenantId, status: { in: ['FALHA', 'CANCELADA'] } }, data: { status: 'PENDENTE', tentativas: 0, erro: null, agendadoPara: new Date() } })
  return r.count
}

// Atualiza ENTREGUE/LIDA/FALHA a partir de callbacks do provedor.
export async function aplicarStatusProvedor(tenantId: string, provedorId: string, status: 'ENVIADA' | 'ENTREGUE' | 'LIDA' | 'FALHA', erro?: string) {
  const ordem: Record<string, number> = { PENDENTE: 0, ENVIADA: 1, ENTREGUE: 2, LIDA: 3 }
  const n = await prisma.eduNotification.findFirst({ where: { tenantId, provedorId } })
  if (!n) return false
  if (status === 'FALHA') {
    await prisma.eduNotification.update({ where: { id: n.id }, data: { status: 'FALHA', erro: erro ?? 'Falha informada pelo provedor.' } })
  } else if ((ordem[status] ?? 0) > (ordem[n.status] ?? 0)) {
    await prisma.eduNotification.update({ where: { id: n.id }, data: { status, ...(status === 'LIDA' ? { lidaEm: new Date() } : {}) } })
  }
  await atualizarMensagem(n.id, status, erro)
  return true
}
