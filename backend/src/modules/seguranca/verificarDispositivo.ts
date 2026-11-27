import type { Request, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { concluirLogin } from '../../controllers/authController'
import { getDemoAccess } from '../../services/demoAccessService'
import { lerDesafioDispositivo } from './dispositivos'

// POST /api/auth/device/status  { deviceChallengeToken }
// Consultado em loop pela tela de "aguardando aprovação" até alguém aprovar/recusar o dispositivo.
export async function statusDispositivo(req: Request, res: Response) {
  try {
    const token = String(req.body?.deviceChallengeToken || '')
    const payload = token ? lerDesafioDispositivo(token) : null
    if (!payload) return res.status(401).json({ error: 'Pedido de acesso inválido ou expirado. Faça o login novamente.' })

    const dispositivo = await prisma.segDispositivo.findUnique({ where: { id: payload.did } })
    if (!dispositivo || dispositivo.userId !== payload.uid) {
      return res.status(401).json({ error: 'Pedido de acesso inválido ou expirado. Faça o login novamente.' })
    }

    if (dispositivo.recusado) {
      return res.status(403).json({ status: 'recusado', error: 'Este dispositivo foi recusado pelo administrador da conta.' })
    }
    if (!dispositivo.aprovado) {
      return res.json({ status: 'pendente' })
    }

    const user = await prisma.user.findUnique({ where: { id: payload.uid } })
    if (!user || !user.isActive) return res.status(401).json({ error: 'Usuário inativo.' })

    const demo = await getDemoAccess(user.clinicId)
    if (demo.isDemo && demo.phase === 'ENDED') {
      return res.status(403).json({ code: 'DEMO_ENDED', error: 'A demonstração gratuita foi encerrada. Seus dados permanecem preservados. Solicite uma proposta para reativar o acesso.', demo })
    }

    const corpo: any = await concluirLogin(req, user, demo, 'Login após aprovação de dispositivo novo.')
    corpo.status = 'aprovado'
    return res.json(corpo)
  } catch (e) {
    console.error('[seguranca] erro no /auth/device/status', e)
    return res.status(500).json({ error: 'Erro interno do servidor.' })
  }
}
