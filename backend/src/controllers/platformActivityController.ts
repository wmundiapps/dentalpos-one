import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { coletarAtividade } from '../modules/core/relatorioProprietario'

// Painel de atividade (só equipe WMundi): mesma fonte do relatório diário por e-mail
// (relatorioProprietario.ts), mas consultável na tela, com período escolhido pelo usuário.
const DOIS_DIAS_MS = 2 * 24 * 3_600_000

export async function atividade(req: AuthRequest, res: Response) {
  try {
    const ateRaw = req.query.ate ? new Date(String(req.query.ate)) : new Date()
    const ate = Number.isNaN(ateRaw.getTime()) ? new Date() : ateRaw
    const desdeRaw = req.query.desde ? new Date(String(req.query.desde)) : new Date(ate.getTime() - DOIS_DIAS_MS)
    const desde = Number.isNaN(desdeRaw.getTime()) ? new Date(ate.getTime() - DOIS_DIAS_MS) : desdeRaw
    if (desde >= ate) return res.status(400).json({ error: 'O início do período deve ser antes do fim.' })

    const dados = await coletarAtividade(desde, ate)
    return res.json({ desde: desde.toISOString(), ate: ate.toISOString(), ...dados })
  } catch (error) {
    console.error('[platform-activity]', error)
    return res.status(500).json({ error: 'Erro ao consultar atividade.' })
  }
}
