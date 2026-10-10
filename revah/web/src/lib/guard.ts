// Proteções da tela (adaptado do ClubeFaz): o painel só roda no endereço oficial e só aparece em moldura (iframe)
// dentro do DentalPos One. A trava de verdade é o cabeçalho CSP (vercel.json); isto cobre cópias do HTML.
const APP = 'https://app.revah.com.br'
const HOSTS = new Set(['app.revah.com.br', 'localhost', '127.0.0.1'])
// Prévias da Vercel do próprio projeto revah-web.
const PREVIEW = /^revah-web(-[a-z0-9-]+)?\.vercel\.app$/
export const FRAME_PARENTS = new Set(['https://app.dentalpos.com.br', 'https://one.dentalpos.com.br', 'https://dentalpos-one.vercel.app'])

function parentOrigin(): string | null {
  const ancestors = (window.location as Location & { ancestorOrigins?: DOMStringList }).ancestorOrigins
  if (ancestors && ancestors.length) return ancestors[0]
  try {
    return document.referrer ? new URL(document.referrer).origin : null
  } catch {
    return null
  }
}

export function guardPage() {
  const { hostname, pathname, search, hash } = window.location
  if (!HOSTS.has(hostname) && !PREVIEW.test(hostname)) {
    window.location.replace(`${APP}${pathname}${search}${hash}`)
    return false
  }
  if (window.top && window.top !== window.self) {
    const parent = parentOrigin()
    if (!parent || !FRAME_PARENTS.has(parent)) {
      try {
        window.top.location.href = window.location.href
      } catch {
        document.documentElement.innerHTML = ''
      }
      return false
    }
  }
  return true
}
