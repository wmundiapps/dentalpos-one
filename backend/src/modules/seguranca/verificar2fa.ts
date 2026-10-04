import type { Request, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { concluirLogin } from '../../controllers/authController'
import { getDemoAccess } from '../../services/demoAccessService'
import { ipDaRequisicao, registrarEvento } from './eventos'
import { estaBloqueado, limparTentativas, POLITICA_2FA, registrarFalha } from './tentativas'
import { validarSegundoFator } from './doisFatores'
import { lerTokenEscopo } from './tokens'

// POST /api/auth/2fa/verify  { challengeToken, code } | { challengeToken, recoveryCode }
// Troca o desafio (senha já validada) + segundo fator pelo token de sessão normal.
export async function verificar2fa(req: Request, res: Response) {
  const invalido = () => res.status(401).json({ error: 'Código inválido ou desafio expirado. Faça o login novamente.' })
  try {
    const challengeToken = String(req.body?.challengeToken || '')
    const payload = challengeToken ? lerTokenEscopo(challengeToken, '2fa') : null
    if (!payload?.uid) return invalido()

    const ip = ipDaRequisicao(req)
    const ua = req.get('user-agent')
    const lock = await estaBloqueado('2fa', payload.uid, ip)
    if (lock.bloqueado) {
      res.setHeader('Retry-After', String(lock.segundos))
      return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.' })
    }

    const user = await prisma.user.findUnique({ where: { id: String(payload.uid) } })
    if (!user || !user.isActive) return invalido()

    const r = await validarSegundoFator(user.id, { code: req.body?.code, recoveryCode: req.body?.recoveryCode })
    if (!r.ok) {
      await registrarEvento({ tenantId: user.tenantId, userId: user.id, tipo: '2fa_falha', ip, userAgent: ua, detalhe: { via: r.via } })
      await registrarFalha('2fa', user.id, ip, { tenantId: user.tenantId, userId: user.id, politica: POLITICA_2FA, userAgent: ua })
      return res.status(401).json({ error: 'Código inválido.' })
    }

    await limparTentativas('2fa', user.id, ip)
    if (r.via === 'recuperacao') {
      await registrarEvento({ tenantId: user.tenantId, userId: user.id, tipo: '2fa_codigo_recuperacao_usado', severidade: 'ATENCAO', ip, userAgent: ua, detalhe: { restantes: r.restantes } })
    }
    const demo = await getDemoAccess(user.clinicId)
    if (demo.isDemo && demo.phase === 'ENDED') {
      return res.status(403).json({ code: 'DEMO_ENDED', error: 'A demonstração gratuita foi encerrada. Seus dados permanecem preservados. Solicite uma proposta para reativar o acesso.', demo })
    }
    const corpo: any = await concluirLogin(req, user, demo, r.via === 'recuperacao' ? 'Login com 2FA (código de recuperação).' : 'Login com 2FA.')
    if (r.via === 'recuperacao') corpo.recoveryCodesRemaining = r.restantes
    return res.json(corpo)
  } catch (e) {
    console.error('[seguranca] erro no /auth/2fa/verify', e)
    return res.status(500).json({ error: 'Erro interno do servidor.' })
  }
}
