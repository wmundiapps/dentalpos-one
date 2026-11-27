import type { Request } from 'express'
import { ipDaRequisicao, registrarEvento } from './eventos'
import { estaBloqueado, limparTentativas, registrarFalha } from './tentativas'
import { papelExige2fa, usuarioTem2faAtivo } from './doisFatores'
import { assinarDesafio2fa, assinarTokenConfiguracao } from './tokens'

// ============================================================
// Ganchos usados por controllers/authController.ts (login). Tudo é retrocompatível:
// sem 2FA ativo e sem REQUIRE_2FA_ROLES, o login responde exatamente como antes.
// ============================================================

export async function bloqueioLogin(req: Request, email: string) {
  const ip = ipDaRequisicao(req)
  const r = await estaBloqueado('login', email, ip)
  if (r.bloqueado) {
    await registrarEvento({ tipo: 'login_bloqueado_tentativa', severidade: 'ATENCAO', ip, userAgent: req.get('user-agent'), detalhe: { segundosRestantes: r.segundos } })
  }
  return r
}

export async function falhaLogin(req: Request, email: string, user: { id: string; tenantId: string } | null) {
  const ip = ipDaRequisicao(req)
  await registrarEvento({
    tenantId: user?.tenantId, userId: user?.id, tipo: 'login_falho', ip, userAgent: req.get('user-agent'),
    // o motivo real (e-mail inexistente x senha errada) fica apenas no log interno, nunca na resposta
    detalhe: { motivo: user ? 'senha_incorreta' : 'usuario_inexistente_ou_inativo' },
  })
  await registrarFalha('login', email, ip, { tenantId: user?.tenantId, userId: user?.id, userAgent: req.get('user-agent') })
}

export async function sucessoLogin(req: Request, email: string) {
  await limparTentativas('login', email, ipDaRequisicao(req))
}

/**
 * Chamado após senha correta. Retorna o corpo de resposta do desafio (2FA) ou null para seguir o login normal.
 * Tabela ausente (migração ainda não aplicada) = trata como "sem 2FA", para nunca quebrar o login existente.
 */
export async function desafioSegundoFator(
  req: Request,
  user: { id: string; email: string; clinicId: string; tenantId: string; role: string },
): Promise<Record<string, unknown> | null> {
  let tem2fa = false
  try {
    tem2fa = await usuarioTem2faAtivo(user.id)
  } catch (e: any) {
    if (e?.code === 'P2021' || e?.code === 'P2022') {
      console.warn('[seguranca] tabelas de 2FA ausentes — aplique a migração 20261004_edumaster_pro.sql. Login segue sem 2FA.')
    } else {
      throw e
    }
  }
  if (tem2fa) {
    return { requires2fa: true, challengeToken: assinarDesafio2fa(user), expiresInSeconds: 300 }
  }
  if (papelExige2fa(user.role)) {
    await registrarEvento({ tenantId: user.tenantId, userId: user.id, tipo: '2fa_exigido_configuracao', ip: ipDaRequisicao(req), userAgent: req.get('user-agent'), detalhe: { role: user.role } })
    return {
      requires2faSetup: true,
      setupToken: assinarTokenConfiguracao(user),
      message: 'Seu perfil exige autenticação em dois fatores. Configure-a para continuar.',
      expiresInSeconds: 900,
    }
  }
  return null
}
