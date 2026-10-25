import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'
import { avatarConfigured } from '../services/avatarVideoService'
import { consultarVideoAvatar, criarVideoAvatar, CREDITOS_AVATAR, gerarConteudo, lerAvatar, salvarAvatar, type Formato } from '../services/marketingStudioService'

const ctx = (req: AuthRequest) => ({ clinicId: req.user!.clinicId, tenantId: req.user!.tenantId, actorId: req.user!.id })

const MOTIVOS: Record<string, string> = {
  IA_NAO_CONFIGURADA: 'A inteligencia artificial ainda nao foi configurada na plataforma.',
  SEM_SALDO: 'Os creditos de IA acabaram. Compre um pacote para continuar.',
  CARTEIRA_SUSPENSA: 'O uso de IA esta suspenso nesta clinica.',
  RESPOSTA_VAZIA: 'A IA nao devolveu resposta. Nenhum credito foi cobrado. Tente de novo.',
  RESPOSTA_INVALIDA: 'A IA devolveu uma resposta fora do formato. Tente de novo.',
  FALHA_PROVEDOR: 'Nao foi possivel falar com o servico agora. Tente de novo em instantes.',
  AVATAR_NAO_CONFIGURADO: 'O video com avatar ainda nao foi ativado na plataforma.',
  SEM_AVATAR_AUTORIZADO: 'Cadastre primeiro o avatar e a autorizacao da pessoa que aparece nele.',
  FALA_CURTA: 'O texto da fala esta muito curto.',
  LIMITE_DIARIO: 'Limite diario de videos com avatar atingido. Tente amanha.',
}
const erro = (res: Response, reason: string) => res.status(reason === 'SEM_SALDO' ? 402 : 409).json({ error: MOTIVOS[reason] || 'Nao foi possivel concluir agora.', code: reason })

export async function content(req: AuthRequest, res: Response) {
  const formato = String(req.body?.formato || '').toUpperCase() as Formato
  const tema = String(req.body?.tema || '').trim()
  if (!['POST', 'STORY', 'REEL'].includes(formato)) return res.status(400).json({ error: 'Escolha post, story ou reel.' })
  if (tema.length < 5) return res.status(400).json({ error: 'Conte o tema em poucas palavras.' })
  try {
    const r = await gerarConteudo({ ...ctx(req), formato, tema, tom: req.body?.tom ? String(req.body.tom) : undefined })
    return r.ok ? res.json(r.conteudo) : erro(res, r.reason)
  } catch (e) {
    console.error('[marketing-studio]', e)
    return res.status(500).json({ error: 'Erro ao gerar o conteudo.' })
  }
}

export async function avatarShow(req: AuthRequest, res: Response) {
  const c = ctx(req)
  const a = await lerAvatar(c.clinicId, c.tenantId)
  return res.json({ ativoNaPlataforma: avatarConfigured(), creditosPorVideo: CREDITOS_AVATAR, avatar: a ? { pessoa: a.pessoa, consentimentoEm: a.consentimentoEm } : null })
}

// Cadastro do avatar: só com autorização expressa da pessoa retratada. Fica no registro de auditoria.
export async function avatarSave(req: AuthRequest, res: Response) {
  const c = ctx(req)
  const avatarId = String(req.body?.avatarId || '').trim()
  const voiceId = String(req.body?.voiceId || '').trim()
  const pessoa = String(req.body?.pessoa || '').trim()
  if (!avatarId || !voiceId || avatarId.length > 120 || voiceId.length > 120) return res.status(400).json({ error: 'Informe o codigo do avatar e da voz.' })
  if (pessoa.length < 3) return res.status(400).json({ error: 'Informe o nome da pessoa que aparece no avatar.' })
  if (req.body?.autorizacao !== true) return res.status(400).json({ error: 'E preciso confirmar que a pessoa autorizou o uso da imagem e da voz.' })
  const cfg = { avatarId, voiceId, pessoa, consentimentoEm: new Date().toISOString(), consentimentoPor: c.actorId }
  try {
    await salvarAvatar(c.clinicId, c.tenantId, c.actorId, cfg)
  } catch (e) {
    console.error('[marketing-studio]', e)
    return res.status(503).json({ error: 'O avatar ainda nao pode ser salvo: falta rodar o SQL 20261023_kit_clinica.sql no banco.' })
  }
  await writeAudit({ clinicId: c.clinicId, tenantId: c.tenantId, actorId: c.actorId, module: 'marketing', action: 'avatar_consent', entityType: 'ClinicBrandKit', entityId: c.clinicId, afterData: { pessoa, consentimentoEm: cfg.consentimentoEm }, ipAddress: req.ip, userAgent: req.headers['user-agent'] })
  return res.json({ pessoa, consentimentoEm: cfg.consentimentoEm })
}

export async function videoCreate(req: AuthRequest, res: Response) {
  const c = ctx(req)
  try {
    const r = await criarVideoAvatar({ ...c, fala: String(req.body?.fala || '') })
    if (!r.ok) return erro(res, r.reason)
    await writeAudit({ clinicId: c.clinicId, tenantId: c.tenantId, actorId: c.actorId, module: 'marketing', action: 'avatar_video', entityType: 'AvatarVideo', entityId: r.videoId, ipAddress: req.ip, userAgent: req.headers['user-agent'] })
    return res.status(202).json({ videoId: r.videoId, creditos: r.creditos })
  } catch (e) {
    console.error('[marketing-studio]', e)
    return res.status(500).json({ error: 'Erro ao criar o video.' })
  }
}

export async function videoShow(req: AuthRequest, res: Response) {
  const c = ctx(req)
  const id = String(req.params.id || '')
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(id)) return res.status(400).json({ error: 'Codigo invalido.' })
  const v = await consultarVideoAvatar({ ...c, videoId: id })
  if (!v) return res.status(404).json({ error: 'Video nao encontrado.' })
  return res.json(v)
}
