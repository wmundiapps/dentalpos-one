import jwt from 'jsonwebtoken'

// Tokens de escopo restrito do fluxo de 2FA. NENHUM deles é aceito pelo authMiddleware
// (que rejeita qualquer token com `scope`), portanto não dão acesso à API.
//   '2fa'       : desafio após senha correta (5 min) — só serve para POST /auth/2fa/verify.
//   '2fa-setup' : papel exige 2FA e o usuário ainda não tem — só serve para as rotas de configuração.

export type EscopoToken = '2fa' | '2fa-setup'

export interface UsuarioToken {
  id: string
  email: string
  clinicId: string
  tenantId: string
  role: string
}

function segredo() {
  const s = process.env.JWT_SECRET
  if (!s) throw new Error('JWT_SECRET não configurado')
  return s
}

export function assinarDesafio2fa(u: UsuarioToken): string {
  return jwt.sign({ uid: u.id, tid: u.tenantId, scope: '2fa' }, segredo(), { expiresIn: '5m' })
}

export function assinarTokenConfiguracao(u: UsuarioToken): string {
  return jwt.sign({ ...u, scope: '2fa-setup' }, segredo(), { expiresIn: '15m' })
}

export function lerTokenEscopo(token: string, escopo: EscopoToken): any | null {
  try {
    const d: any = jwt.verify(token, segredo())
    return d && d.scope === escopo ? d : null
  } catch {
    return null
  }
}
