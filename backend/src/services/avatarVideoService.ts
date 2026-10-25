// Adaptador de vídeo com avatar realista. O cliente nunca vê o provedor.
// Provedor padrão: HeyGen (AVATAR_PROVIDER). Chave só em variável de ambiente (HEYGEN_API_KEY), nunca no código.
// Para trocar de provedor (ex.: D-ID), basta outro bloco com as mesmas duas funções.

export type AvatarStatus = 'PROCESSANDO' | 'PRONTO' | 'FALHOU'

export type AvatarVideo = {
  status: AvatarStatus
  videoUrl?: string
  reason?: string
}

const PROVEDOR = String(process.env.AVATAR_PROVIDER || 'HEYGEN').toUpperCase()
const HEYGEN = 'https://api.heygen.com'

export function avatarConfigured() {
  return PROVEDOR === 'HEYGEN' && Boolean(String(process.env.HEYGEN_API_KEY || '').trim())
}

export const avatarProvider = () => PROVEDOR

async function heygen(path: string, init?: RequestInit) {
  const resposta = await fetch(`${HEYGEN}${path}`, {
    ...init,
    headers: { 'X-Api-Key': String(process.env.HEYGEN_API_KEY || '').trim(), 'Content-Type': 'application/json', ...(init?.headers || {}) },
  })
  const texto = await resposta.text()
  let corpo: any = {}
  try { corpo = texto ? JSON.parse(texto) : {} } catch { corpo = {} }
  return { ok: resposta.ok, status: resposta.status, corpo }
}

// Cria o vídeo (vertical 9:16, formato reel/story). Devolve o id do provedor.
export async function createAvatarVideo(input: { avatarId: string; voiceId: string; text: string }): Promise<{ ok: true; videoId: string } | { ok: false; reason: string }> {
  if (!avatarConfigured()) return { ok: false, reason: 'AVATAR_NAO_CONFIGURADO' }
  try {
    const r = await heygen('/v2/video/generate', {
      method: 'POST',
      body: JSON.stringify({
        video_inputs: [
          {
            character: { type: 'avatar', avatar_id: input.avatarId, avatar_style: 'normal' },
            voice: { type: 'text', input_text: input.text, voice_id: input.voiceId },
          },
        ],
        dimension: { width: 720, height: 1280 },
      }),
    })
    const videoId = String(r.corpo?.data?.video_id || '')
    if (!r.ok || !videoId) {
      console.error('Falha ao criar vídeo de avatar:', r.status, r.corpo?.error?.message || r.corpo?.message || '')
      return { ok: false, reason: 'FALHA_PROVEDOR' }
    }
    return { ok: true, videoId }
  } catch (erro) {
    console.error('Erro ao chamar o provedor de avatar:', erro)
    return { ok: false, reason: 'FALHA_PROVEDOR' }
  }
}

export async function getAvatarVideo(videoId: string): Promise<AvatarVideo> {
  if (!avatarConfigured()) return { status: 'FALHOU', reason: 'AVATAR_NAO_CONFIGURADO' }
  try {
    const r = await heygen(`/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`)
    if (!r.ok) return { status: 'PROCESSANDO' }
    const estado = String(r.corpo?.data?.status || '').toLowerCase()
    if (estado === 'completed') {
      const url = String(r.corpo?.data?.video_url || '')
      return url.startsWith('https://') ? { status: 'PRONTO', videoUrl: url } : { status: 'FALHOU', reason: 'SEM_ARQUIVO' }
    }
    if (estado === 'failed') return { status: 'FALHOU', reason: 'FALHA_PROVEDOR' }
    return { status: 'PROCESSANDO' }
  } catch (erro) {
    console.error('Erro ao consultar o provedor de avatar:', erro)
    return { status: 'PROCESSANDO' }
  }
}
