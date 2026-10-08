// Impede que o app rode embutido em outro site (clickjacking) ou copiado em
// domínios não autorizados. Não substitui as proteções do servidor.
const ALLOWED_HOST_SUFFIXES = ['.dentalpos.com.br', '.vercel.app']
const ALLOWED_HOSTS = ['dentalpos.com.br', 'localhost', '127.0.0.1']

export function isAllowedHost(host: string) {
  const h = host.toLowerCase()
  return ALLOWED_HOSTS.includes(h) || ALLOWED_HOST_SUFFIXES.some((s) => h.endsWith(s))
}

export function enforceSiteGuard() {
  if (typeof window === 'undefined') return
  try {
    if (!isAllowedHost(window.location.hostname)) {
      document.body.innerHTML = ''
      window.location.replace('https://app.dentalpos.com.br')
      throw new Error('blocked-host')
    }
    if (window.top && window.top !== window.self) {
      window.top.location.href = window.self.location.href
    }
  } catch (e) {
    if (e instanceof Error && e.message === 'blocked-host') throw e
    document.body.innerHTML = ''
  }
}
