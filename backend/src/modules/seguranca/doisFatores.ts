import { prisma } from '../../lib/prisma'
import { cifrar, decifrar, conferirCodigoRecuperacao, gerarCodigoRecuperacao, hashCodigoRecuperacao } from './cripto'
import { gerarSegredoBase32, otpauthUri, verificarTotp } from './totp'

// ============================================================
// Serviço de 2FA (TOTP). Regras de negócio puras de acesso a dados; HTTP fica em routes.ts.
// ============================================================

export const EMISSOR = process.env.SECURITY_TOTP_ISSUER || 'DentalPos One'
export const QTD_CODIGOS_RECUPERACAO = 8

interface CodigoGuardado { h: string; usadoEm: string | null }

/** Papéis que OBRIGAM 2FA (REQUIRE_2FA_ROLES, lista separada por vírgula; vazia = ninguém). */
export function papeisObrigatorios(): string[] {
  return String(process.env.REQUIRE_2FA_ROLES || '')
    .split(',')
    .map((r) => r.trim().toUpperCase())
    .filter(Boolean)
}

export function papelExige2fa(role: string | null | undefined): boolean {
  return papeisObrigatorios().includes(String(role || '').toUpperCase())
}

export async function obterRegistro(userId: string) {
  return prisma.segDoisFatores.findUnique({ where: { userId } })
}

export async function usuarioTem2faAtivo(userId: string): Promise<boolean> {
  const r = await obterRegistro(userId)
  return !!r?.ativadoEm
}

function listaCodigos(json: unknown): CodigoGuardado[] {
  return Array.isArray(json) ? (json as CodigoGuardado[]) : []
}

export function gerarCodigosRecuperacao(): { claros: string[]; guardados: CodigoGuardado[] } {
  const claros = Array.from({ length: QTD_CODIGOS_RECUPERACAO }, () => gerarCodigoRecuperacao())
  return { claros, guardados: claros.map((c) => ({ h: hashCodigoRecuperacao(c), usadoEm: null })) }
}

/** Inicia (ou reinicia, se ainda não confirmada) a configuração. Falha com 409 se já ativo. */
export async function iniciarConfiguracao(user: { id: string; tenantId: string; email: string }) {
  const atual = await obterRegistro(user.id)
  if (atual?.ativadoEm) throw Object.assign(new Error('A autenticação em dois fatores já está ativa.'), { status: 409 })
  const segredo = gerarSegredoBase32()
  const dados = { segredoCifrado: cifrar(segredo), ativadoEm: null, ultimoPasso: null, codigosRecuperacao: [] as any, versaoCodigos: 0 }
  await prisma.segDoisFatores.upsert({
    where: { userId: user.id },
    create: { tenantId: user.tenantId, userId: user.id, ...dados },
    update: dados,
  })
  return { secret: segredo, otpauthUrl: otpauthUri({ segredo, conta: user.email, emissor: EMISSOR }), issuer: EMISSOR, account: user.email }
}

/** Confirma com um código TOTP: ativa e devolve os códigos de recuperação (única vez em claro). */
export async function confirmarConfiguracao(userId: string, codigo: string): Promise<string[] | null> {
  const r = await obterRegistro(userId)
  if (!r) throw Object.assign(new Error('Inicie a configuração antes de confirmar.'), { status: 409 })
  if (r.ativadoEm) throw Object.assign(new Error('A autenticação em dois fatores já está ativa.'), { status: 409 })
  const passo = verificarTotp(decifrar(r.segredoCifrado), codigo)
  if (passo === null) return null
  const { claros, guardados } = gerarCodigosRecuperacao()
  const upd = await prisma.segDoisFatores.updateMany({
    where: { id: r.id, ativadoEm: null },
    data: { ativadoEm: new Date(), ultimoPasso: passo, codigosRecuperacao: guardados as any, versaoCodigos: { increment: 1 }, ultimoUsoEm: new Date() },
  })
  return upd.count === 1 ? claros : null
}

/** Valida um código TOTP de um usuário com 2FA ATIVO (com proteção contra reutilização do mesmo passo). */
export async function validarTotpUsuario(userId: string, codigo: string): Promise<boolean> {
  const r = await obterRegistro(userId)
  if (!r?.ativadoEm) return false
  const passo = verificarTotp(decifrar(r.segredoCifrado), codigo, { ultimoPasso: r.ultimoPasso })
  if (passo === null) return false
  const upd = await prisma.segDoisFatores.updateMany({
    where: { id: r.id, OR: [{ ultimoPasso: null }, { ultimoPasso: { lt: passo } }] },
    data: { ultimoPasso: passo, ultimoUsoEm: new Date() },
  })
  return upd.count === 1
}

/** Consome um código de recuperação (uso único, atômico por controle otimista). */
export async function consumirCodigoRecuperacao(userId: string, codigo: string): Promise<{ ok: boolean; restantes: number }> {
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const r = await obterRegistro(userId)
    if (!r?.ativadoEm) return { ok: false, restantes: 0 }
    const lista = listaCodigos(r.codigosRecuperacao)
    // Compara com TODOS (sem parar no primeiro acerto) para não vazar posição por tempo.
    let idx = -1
    lista.forEach((c, i) => {
      if (conferirCodigoRecuperacao(codigo, c.h) && !c.usadoEm && idx < 0) idx = i
    })
    if (idx < 0) return { ok: false, restantes: lista.filter((c) => !c.usadoEm).length }
    const nova = lista.map((c, i) => (i === idx ? { ...c, usadoEm: new Date().toISOString() } : c))
    const upd = await prisma.segDoisFatores.updateMany({
      where: { id: r.id, versaoCodigos: r.versaoCodigos },
      data: { codigosRecuperacao: nova as any, versaoCodigos: { increment: 1 }, ultimoUsoEm: new Date() },
    })
    if (upd.count === 1) return { ok: true, restantes: nova.filter((c) => !c.usadoEm).length }
    // conflito de concorrência: tenta de novo (outro uso simultâneo do mesmo código falhará na releitura)
  }
  return { ok: false, restantes: 0 }
}

/** Aceita TOTP (6 dígitos) ou código de recuperação. */
export async function validarSegundoFator(userId: string, entrada: { code?: string; recoveryCode?: string }) {
  const code = String(entrada.code || '').replace(/\s+/g, '')
  if (/^\d{6}$/.test(code)) return { ok: await validarTotpUsuario(userId, code), via: 'totp' as const, restantes: undefined as number | undefined }
  const rec = String(entrada.recoveryCode || entrada.code || '')
  if (rec.replace(/[^a-zA-Z0-9]/g, '').length >= 8) {
    const r = await consumirCodigoRecuperacao(userId, rec)
    return { ok: r.ok, via: 'recuperacao' as const, restantes: r.restantes }
  }
  return { ok: false, via: 'totp' as const, restantes: undefined }
}

export async function regenerarCodigos(userId: string): Promise<string[]> {
  const r = await obterRegistro(userId)
  if (!r?.ativadoEm) throw Object.assign(new Error('A autenticação em dois fatores não está ativa.'), { status: 409 })
  const { claros, guardados } = gerarCodigosRecuperacao()
  await prisma.segDoisFatores.update({ where: { id: r.id }, data: { codigosRecuperacao: guardados as any, versaoCodigos: { increment: 1 } } })
  return claros
}

export async function desativar(userId: string): Promise<void> {
  await prisma.segDoisFatores.deleteMany({ where: { userId } })
}

export async function statusUsuario(userId: string, role: string) {
  const r = await obterRegistro(userId)
  return {
    enabled: !!r?.ativadoEm,
    pendingSetup: !!r && !r.ativadoEm,
    enabledAt: r?.ativadoEm ?? null,
    requiredByRole: papelExige2fa(role),
    recoveryCodesRemaining: r?.ativadoEm ? listaCodigos(r.codigosRecuperacao).filter((c) => !c.usadoEm).length : 0,
  }
}
