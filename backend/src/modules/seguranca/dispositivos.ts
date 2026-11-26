import type { Request } from 'express'
import jwt from 'jsonwebtoken'
import { prisma } from '../../lib/prisma'
import { ipDaRequisicao, registrarEvento } from './eventos'
import { notify } from '../core/notify'
import { isOwnerAccount } from '../../lib/ownerAccount'
import { dispatchRevah } from '../../services/revahProviderService'
import { BRAND_NAME } from '../../lib/brand'

// ============================================================
// Reconhecimento de dispositivo. O frontend gera e guarda (localStorage) um identificador aleatório
// persistente por navegador — não é fingerprinting de hardware, é "lembrar este navegador".
// Login de um fingerprint nunca visto para aquele usuário fica pendente até um papel super aprovar.
// Tabela ausente (migração não aplicada) = trata como "sem controle de dispositivo", nunca quebra o login.
// ============================================================

const SUPER = ['ADMIN', 'OWNER', 'RECTOR', 'BOARD']

function segredo() {
  const s = process.env.JWT_SECRET
  if (!s) throw new Error('JWT_SECRET não configurado')
  return s
}

export function assinarDesafioDispositivo(u: { id: string; tenantId: string }, dispositivoId: string): string {
  return jwt.sign({ uid: u.id, tid: u.tenantId, did: dispositivoId, scope: 'dispositivo' }, segredo(), { expiresIn: '1d' })
}

export function lerDesafioDispositivo(token: string): { uid: string; tid: string; did: string } | null {
  try {
    const d: any = jwt.verify(token, segredo())
    return d?.scope === 'dispositivo' ? d : null
  } catch {
    return null
  }
}

function rotuloDoAgente(userAgent?: string | null): string {
  const ua = userAgent || ''
  const nav = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Navegador'
  const so = /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : 'SO desconhecido'
  return `${nav} · ${so}`
}

async function avisarDonos(tenantId: string, mensagem: string, refId: string) {
  const donos = await prisma.user.findMany({ where: { tenantId, role: { in: SUPER as any } }, select: { id: true }, take: 50 })
  for (const d of donos) await notify({ tenantId, userId: d.id, assunto: 'Novo dispositivo pedindo acesso', mensagem, refType: 'SegDispositivo', refId }).catch(() => null)
}

// Canal fixo de aprovação de dispositivo novo (fora do tenant): quem recebe o e-mail e com qual apelido se
// dirigir a cada um (nunca o nome/papel real) — configurável via DEVICE_APPROVAL_EMAILS_JSON, ex.:
// [{"email":"...","apelido":"seu fornecedor"}]. Sem essa variável, o aviso fica só no in-app (avisarDonos).
function canalAprovacaoDispositivo(): Array<{ email: string; apelido: string }> {
  try {
    const raw = JSON.parse(process.env.DEVICE_APPROVAL_EMAILS_JSON || '[]')
    if (!Array.isArray(raw)) return []
    return raw.filter((r) => r && typeof r.email === 'string' && typeof r.apelido === 'string')
  } catch {
    return []
  }
}

async function avisarCanalExterno(input: { nomeUsuario: string; rotulo: string; ip: string | null; dispositivoId: string }) {
  const canal = canalAprovacaoDispositivo()
  if (!canal.length) return
  const platformKey = String(process.env.RESEND_API_KEY || '').trim()
  if (!platformKey) return
  const corpo = [
    `Um login de dispositivo novo pediu acesso ao sistema.`,
    ``,
    `Conta: ${input.nomeUsuario}`,
    `Dispositivo: ${input.rotulo}`,
    `IP: ${input.ip || 'desconhecido'}`,
    ``,
    `A aprovação (ou recusa) é feita no painel do sistema, em Dispositivos.`,
  ].join('\n')
  for (const dest of canal) {
    await dispatchRevah(
      'EMAIL', dest.email,
      [`Mensagem para: ${dest.apelido}`, '', corpo].join('\n'),
      { apiKey: platformKey, subject: 'Pedido de aprovação de acesso — novo dispositivo' },
      `${BRAND_NAME} <contato@dentalpos.com.br>`,
    ).catch(() => null)
  }
}

/**
 * Chamado após senha correta (e após 2FA, se houver). Com fingerprint ausente, não bloqueia (compatibilidade).
 * Retorna o corpo de resposta do desafio de dispositivo, ou null para seguir o login normal.
 */
export async function desafioDispositivo(
  req: Request,
  user: { id: string; tenantId: string; role: string; email?: string },
  fingerprint: unknown,
): Promise<Record<string, unknown> | null> {
  const fp = typeof fingerprint === 'string' ? fingerprint.trim().slice(0, 200) : ''
  if (!fp) return null
  const ip = ipDaRequisicao(req)
  const userAgent = req.get('user-agent') || null
  // Conta do proprietário: nunca bloqueia em dispositivo novo (só avisa) — mesma exceção dada a ela em requireRole.
  const semBloqueio = isOwnerAccount(user.email)

  try {
    const existente = await prisma.segDispositivo.findUnique({ where: { userId_fingerprint: { userId: user.id, fingerprint: fp } } })

    if (existente?.aprovado) {
      await prisma.segDispositivo.update({ where: { id: existente.id }, data: { ultimoAcessoEm: new Date(), ip } })
      return null
    }
    if (existente?.recusado) {
      await registrarEvento({ tenantId: user.tenantId, userId: user.id, tipo: 'dispositivo_recusado_tentativa', severidade: 'ATENCAO', ip, userAgent })
      return { deviceRejected: true, error: 'Este dispositivo foi recusado pelo administrador da conta. Peça para liberar novamente, se for engano.' }
    }

    // Primeiro acesso: nenhum dispositivo registrado ainda para esta conta. Libera direto e grava este como a
    // "base" (equipamento + IP de referência) — só um dispositivo DIFERENTE deste, depois, pede aprovação.
    const jaTemBase = existente ? true : (await prisma.segDispositivo.count({ where: { userId: user.id } })) > 0
    const primeiroAcesso = !jaTemBase && !existente

    const registro = existente
      ? await prisma.segDispositivo.update({ where: { id: existente.id }, data: { ip, ultimoAcessoEm: new Date(), ...(semBloqueio || primeiroAcesso ? { aprovado: true, aprovadoEm: new Date() } : {}) } })
      : await prisma.segDispositivo.create({ data: { tenantId: user.tenantId, userId: user.id, fingerprint: fp, rotulo: rotuloDoAgente(userAgent), ip, ...(semBloqueio || primeiroAcesso ? { aprovado: true, aprovadoEm: new Date() } : {}) } })

    if (!existente && !primeiroAcesso) {
      await registrarEvento({ tenantId: user.tenantId, userId: user.id, tipo: 'dispositivo_novo_pendente', severidade: 'ATENCAO', ip, userAgent, detalhe: { dispositivoId: registro.id } })
      await avisarDonos(user.tenantId, `Um login de dispositivo novo (${registro.rotulo || 'desconhecido'}, IP ${ip || 'desconhecido'}) ${semBloqueio ? 'acabou de acontecer' : 'está aguardando sua aprovação'}.`, registro.id)
      if (!semBloqueio) {
        const quemLogou = await prisma.user.findUnique({ where: { id: user.id }, select: { firstName: true, lastName: true, email: true } })
        const nomeUsuario = quemLogou ? [quemLogou.firstName, quemLogou.lastName].filter(Boolean).join(' ') || quemLogou.email : user.email || 'usuário'
        await avisarCanalExterno({ nomeUsuario, rotulo: registro.rotulo || 'desconhecido', ip, dispositivoId: registro.id })
      }
    }

    if (semBloqueio || primeiroAcesso) return null

    return {
      deviceApprovalRequired: true,
      deviceChallengeToken: assinarDesafioDispositivo(user, registro.id),
      message: 'Este é um dispositivo novo. O administrador da conta precisa aprovar o acesso antes de continuar.',
    }
  } catch (e: any) {
    if (e?.code === 'P2021' || e?.code === 'P2022') {
      console.warn('[seguranca] tabela de dispositivos ausente — aplique a migração. Login segue sem controle de dispositivo.')
      return null
    }
    throw e
  }
}
