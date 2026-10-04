/**
 * Configuração de segurança do DentalPod Design.
 *
 * Os valores padrão abaixo são embutidos no código; o arquivo `security.json` (na mesma pasta do app, editável
 * SEM recompilar) pode sobrescrevê-los no servidor do cliente.
 *
 * Observação honesta: tudo que roda no navegador pode ser inspecionado/alterado por quem controla o navegador.
 * As travas abaixo impedem uso casual/cópia e embutimento em outros sites; a proteção "real" de acesso e de dados
 * é a do servidor (Dentalpos One: login + 2FA + token do módulo).
 */
export interface SecurityConfig {
  /** Hosts onde o app pode rodar (aceita "*.dominio.com" e "prefixo-*-sufixo.vercel.app"). */
  allowedHosts: string[]
  /** Origens que podem embutir o app em iframe e trocar mensagens (postMessage). */
  allowedParents: string[]
  /** Exige token emitido pelo servidor do Dentalpos One (verificado na API) para abrir o módulo. */
  requireHostToken: boolean
  /** URL base da API que emite/verifica o token (ex.: https://api.exemplo.com/api). */
  apiUrl: string
  /** Bloqueio local de imagens impróprias (IA no navegador). */
  nsfw: { enabled: boolean; blockPorn: number; blockHentai: number; blockCombined: number }
  /** Bloqueia a tela por inatividade (minutos; 0 = desligado). */
  idleLockMinutes: number
  maxPhotoMB: number
  maxModelMB: number
  maxProjectFileMB: number
  /** Nº de bloqueios de imagem na sessão antes de travar novos envios por 15 min. */
  maxBlockedUploads: number
}

export const DEFAULT_CONFIG: SecurityConfig = {
  allowedHosts: [
    'localhost',
    '127.0.0.1',
    '[::1]',
    'dentalpos.com.br',
    '*.dentalpos.com.br',
    'dentalpos-one.vercel.app',
    'dentalpos-landing.vercel.app',
    'dentalpos-one-*-robsonraveloliveira-7222.vercel.app',
  ],
  allowedParents: [
    'http://localhost:*',
    'http://127.0.0.1:*',
    'https://dentalpos.com.br',
    'https://*.dentalpos.com.br',
    'https://dentalpos-one.vercel.app',
    'https://dentalpos-landing.vercel.app',
    'https://dentalpos-one-*-robsonraveloliveira-7222.vercel.app',
  ],
  requireHostToken: false,
  apiUrl: '',
  nsfw: { enabled: true, blockPorn: 0.7, blockHentai: 0.8, blockCombined: 0.85 },
  idleLockMinutes: 0,
  maxPhotoMB: 25,
  maxModelMB: 120,
  maxProjectFileMB: 400,
  maxBlockedUploads: 3,
}

let cached: SecurityConfig | null = null

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const strList = (v: unknown, d: string[]) => (Array.isArray(v) && v.every((x) => typeof x === 'string' && x.length < 200) ? (v as string[]).slice(0, 100) : d)
const num = (v: unknown, d: number, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d)

export async function loadSecurityConfig(): Promise<SecurityConfig> {
  if (cached) return cached
  const cfg: SecurityConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG))
  try {
    const r = await fetch(new URL('security.json', document.baseURI).href, { cache: 'no-store', credentials: 'omit' })
    if (r.ok && (r.headers.get('content-type') || '').includes('json')) {
      const j: unknown = await r.json()
      if (isObj(j)) {
        cfg.allowedHosts = strList(j.allowedHosts, cfg.allowedHosts)
        cfg.allowedParents = strList(j.allowedParents, cfg.allowedParents)
        if (typeof j.requireHostToken === 'boolean') cfg.requireHostToken = j.requireHostToken
        if (typeof j.apiUrl === 'string' && /^https?:\/\/[^\s]+$/.test(j.apiUrl)) cfg.apiUrl = j.apiUrl.replace(/\/+$/, '')
        if (isObj(j.nsfw)) {
          if (typeof j.nsfw.enabled === 'boolean') cfg.nsfw.enabled = j.nsfw.enabled
          cfg.nsfw.blockPorn = num(j.nsfw.blockPorn, cfg.nsfw.blockPorn, 0.3, 1)
          cfg.nsfw.blockHentai = num(j.nsfw.blockHentai, cfg.nsfw.blockHentai, 0.3, 1)
          cfg.nsfw.blockCombined = num(j.nsfw.blockCombined, cfg.nsfw.blockCombined, 0.3, 1)
        }
        cfg.idleLockMinutes = num(j.idleLockMinutes, cfg.idleLockMinutes, 0, 600)
        cfg.maxPhotoMB = num(j.maxPhotoMB, cfg.maxPhotoMB, 1, 100)
        cfg.maxModelMB = num(j.maxModelMB, cfg.maxModelMB, 1, 500)
        cfg.maxProjectFileMB = num(j.maxProjectFileMB, cfg.maxProjectFileMB, 1, 1000)
        cfg.maxBlockedUploads = num(j.maxBlockedUploads, cfg.maxBlockedUploads, 1, 20)
      }
    }
  } catch {
    /* sem arquivo: usa os padrões embutidos */
  }
  cached = cfg
  return cfg
}

export const getSecurityConfig = (): SecurityConfig => cached ?? DEFAULT_CONFIG
