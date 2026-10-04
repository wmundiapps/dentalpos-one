import type { SecurityConfig } from './config'
import { SecurityError } from './files'

/**
 * Filtro de conteúdo impróprio (nudez / pornografia) 100 % local: o modelo roda no navegador
 * (TensorFlow.js + NSFWJS), a imagem NUNCA sai do dispositivo. É uma camada de defesa em profundidade —
 * nenhum classificador é infalível; a validação definitiva deve ser feita também no servidor.
 */

type Pred = { className: string; probability: number }
interface Classifier {
  classify(img: HTMLCanvasElement | ImageData, topk?: number): Promise<Pred[]>
}

let loading: Promise<Classifier> | null = null

async function getModel(): Promise<Classifier> {
  if (!loading) {
    loading = (async () => {
      const tf = await import('@tensorflow/tfjs')
      try {
        await tf.setBackend('webgl')
      } catch {
        await tf.setBackend('cpu')
      }
      await tf.ready()
      const { load } = await import('nsfwjs/core')
      const { MobileNetV2MidModel } = await import('nsfwjs/models/mobilenet_v2_mid')
      return (await load('MobileNetV2Mid', { modelDefinitions: [MobileNetV2MidModel] })) as unknown as Classifier
    })().catch((e) => {
      loading = null
      throw e
    })
  }
  return loading
}

export interface NsfwVerdict {
  blocked: boolean
  scores: Record<string, number>
}

export function judge(preds: Pred[], cfg: SecurityConfig['nsfw']): NsfwVerdict {
  const s: Record<string, number> = { Porn: 0, Hentai: 0, Sexy: 0, Neutral: 0, Drawing: 0 }
  for (const p of preds) s[p.className] = p.probability
  const blocked = s.Porn >= cfg.blockPorn || s.Hentai >= cfg.blockHentai || s.Porn + s.Hentai + s.Sexy * 0.5 >= cfg.blockCombined
  return { blocked, scores: s }
}

// ── bloqueio progressivo por sessão: várias tentativas impróprias travam novos envios ──
const LOCK_MS = 15 * 60 * 1000
let strikes = 0
let lockedUntil = 0

export const uploadLockRemainingMs = () => Math.max(0, lockedUntil - Date.now())

function strike(cfg: SecurityConfig) {
  strikes++
  if (strikes >= cfg.maxBlockedUploads) {
    lockedUntil = Date.now() + LOCK_MS
    strikes = 0
  }
}

/** Lança SecurityError se a imagem for imprópria (ou se envios estiverem bloqueados). */
export async function assertSafeImage(bitmap: ImageBitmap, cfg: SecurityConfig): Promise<void> {
  const left = uploadLockRemainingMs()
  if (left > 0) throw new SecurityError(`Envios de imagem bloqueados por ${Math.ceil(left / 60000)} min após tentativas de conteúdo impróprio.`, 'nsfw-locked')
  if (!cfg.nsfw.enabled) return
  let model: Classifier
  try {
    model = await getModel()
  } catch (e) {
    console.warn('[dpd] verificador de conteúdo indisponível', e)
    // falha FECHADA: sem o verificador não aceitamos imagens (configurável em security.json → nsfw.enabled=false)
    throw new SecurityError('Não foi possível verificar o conteúdo da imagem. Recarregue a página e tente novamente.', 'nsfw-unavailable')
  }
  const k = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(bitmap.width * k))
  c.height = Math.max(1, Math.round(bitmap.height * k))
  c.getContext('2d')!.drawImage(bitmap, 0, 0, c.width, c.height)
  const verdict = judge(await model.classify(c, 5), cfg.nsfw)
  c.width = c.height = 0
  if (verdict.blocked) {
    strike(cfg)
    throw new SecurityError('Imagem recusada: o sistema só aceita fotos clínicas (rosto, sorriso, arcadas). Conteúdo impróprio é bloqueado e registrado.', 'nsfw')
  }
}

/** Pré-carrega o modelo em segundo plano (ocioso) para o primeiro envio ser rápido. */
export function warmup() {
  void getModel().catch(() => undefined)
}
