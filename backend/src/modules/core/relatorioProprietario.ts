import { prisma } from '../../lib/prisma'
import { registerEduJob } from './jobs'
import { dispatchRevah } from '../../services/revahProviderService'
import { BRAND_NAME } from '../../lib/brand'

// ============================================================================
// Relatório diário de auditoria enviado SOMENTE para o e-mail do proprietário (controle interno da WMundi
// durante o teste/treinamento da Uningá — não é uma tela do sistema, não aparece para nenhum outro perfil).
// Fonte: o próprio log de auditoria que o sistema já grava (AuditLog para login, EduAuditEvent para ações nos
// módulos EduMaster) — este job só resume e envia por e-mail o que já é registrado, não cria rastreamento novo.
// Desativar: remova a chamada a registerEduJob() abaixo (ou apague este arquivo) quando o contrato for assinado.
// ============================================================================
const DESTINATARIO = process.env.RELATORIO_PROPRIETARIO_EMAIL || 'robsonravel@wmundi.com'

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function nomeUsuario(u?: { firstName?: string | null; lastName?: string | null; email?: string } | null): string {
  if (!u) return 'Usuário removido'
  const nome = [u.firstName, u.lastName].filter(Boolean).join(' ').trim()
  return nome || u.email || 'Usuário'
}

export async function gerarRelatorioProprietario(desde: Date, ate: Date) {
  const logins = await prisma.auditLog.findMany({
    where: { module: 'auth', action: 'LOGIN', createdAt: { gte: desde, lt: ate } },
    include: { actor: { select: { firstName: true, lastName: true, email: true, role: true } } },
    orderBy: { createdAt: 'asc' },
    take: 2000,
  })

  const eventos = await prisma.eduAuditEvent.findMany({
    where: { createdAt: { gte: desde, lt: ate } },
    orderBy: { createdAt: 'asc' },
    take: 5000,
  })
  const userIds = [...new Set(eventos.map((e) => e.userId).filter(Boolean))] as string[]
  const usuarios = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true, email: true, role: true } })
    : []
  const porId = new Map(usuarios.map((u) => [u.id, u]))

  const linhas: string[] = []
  linhas.push(`Relatório interno de atividade — ${desde.toISOString().slice(0, 10)}`)
  linhas.push('(controle interno WMundi; não enviado a nenhum outro destinatário)')
  linhas.push('')
  linhas.push(`Logins no período: ${logins.length}`)
  for (const l of logins) {
    linhas.push(`  - ${l.createdAt.toISOString().slice(11, 16)}  ${nomeUsuario(l.actor)} (${l.actor?.role ?? 'N/D'})  ip=${l.ipAddress ?? 'N/D'}`)
  }
  linhas.push('')

  const porUsuario = new Map<string, { nome: string; role: string; acoes: Map<string, number> }>()
  for (const e of eventos) {
    const uid = e.userId || 'sem-usuario'
    const u = e.userId ? porId.get(e.userId) : null
    if (!porUsuario.has(uid)) porUsuario.set(uid, { nome: nomeUsuario(u), role: u?.role ?? 'N/D', acoes: new Map() })
    const chave = `${e.modulo}.${e.acao}`
    const slot = porUsuario.get(uid)!
    slot.acoes.set(chave, (slot.acoes.get(chave) ?? 0) + 1)
  }
  linhas.push(`Ações registradas no período: ${eventos.length}`)
  for (const [, info] of porUsuario) {
    linhas.push(`  - ${info.nome} (${info.role}):`)
    for (const [chave, n] of info.acoes) linhas.push(`      ${chave}: ${n}`)
  }
  if (!eventos.length) linhas.push('  (nenhuma ação registrada no período)')

  return linhas.join('\n')
}

export async function jobRelatorioProprietario() {
  const chave = `relatorio.proprietario.${hojeISO()}`
  if (await prisma.eduJobRun.findUnique({ where: { chave } })) return { enviado: false, motivo: 'já enviado hoje' }

  const platformKey = String(process.env.RESEND_API_KEY || '').trim()
  if (!platformKey) { console.warn('[relatorio-proprietario] RESEND_API_KEY ausente: relatório não enviado.'); return { enviado: false, motivo: 'sem RESEND_API_KEY' } }

  const ate = new Date()
  const desde = new Date(ate.getTime() - 24 * 3_600_000)
  const corpo = await gerarRelatorioProprietario(desde, ate)

  const resultado = await dispatchRevah(
    'EMAIL', DESTINATARIO, corpo,
    { apiKey: platformKey, subject: `[Interno] Atividade do sistema — ${hojeISO()}` },
    `${BRAND_NAME} <contato@dentalpos.com.br>`,
  )
  await prisma.eduJobRun.create({ data: { chave } })
  return { enviado: !resultado.simulated }
}

registerEduJob('relatorio.proprietario', () => jobRelatorioProprietario())
