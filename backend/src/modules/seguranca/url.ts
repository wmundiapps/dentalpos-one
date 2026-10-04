import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

// ============================================================
// Validação de URLs externas de anexo (anti-SSRF / anti-esquemas perigosos).
// Só https; sem credenciais na URL; sem localhost/IP privado/loopback/link-local/metadados de nuvem.
// A plataforma NÃO busca o conteúdo da URL no servidor; mesmo assim a URL é guardada e aberta por outras pessoas.
// ============================================================

export interface ResultadoUrl { ok: boolean; motivo?: string; url?: URL }

const SUFIXOS_INTERNOS = ['.localhost', '.local', '.internal', '.intranet', '.lan', '.home', '.corp', '.localdomain', '.home.arpa']

export function ipv4Privado(ip: string): boolean {
  const p = ip.split('.').map(Number)
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true
  const [a, b, c] = p
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||          // CGNAT
    (a === 169 && b === 254) ||                    // link-local / metadados (169.254.169.254)
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224                                       // multicast, reservado, broadcast
  )
}

export function ipv6Privado(ip: string): boolean {
  const h = ip.toLowerCase().replace(/^\[|\]$/g, '')
  if (h === '::' || h === '::1') return true
  const mapeado = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(h)
  if (mapeado) return ipv4Privado(mapeado[1])
  const mapeadoHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(h)
  if (mapeadoHex) {
    const hi = parseInt(mapeadoHex[1], 16), lo = parseInt(mapeadoHex[2], 16)
    return ipv4Privado(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`)
  }
  return /^(fc|fd)/.test(h) || /^fe[89ab]/.test(h) || /^ff/.test(h) || h.startsWith('64:ff9b:') || h.startsWith('2001:db8')
}

/** Validação síncrona (sintática). */
export function validarUrlExterna(valor: string, opt: { permitirHttp?: boolean } = {}): ResultadoUrl {
  const bruto = String(valor ?? '').trim()
  if (!bruto) return { ok: false, motivo: 'URL vazia.' }
  if (/[\u0000-\u001f\u007f]/.test(bruto)) return { ok: false, motivo: 'URL com caracteres de controle.' }
  if (/^\s*(javascript|data|file|vbscript|blob|ftp|about|chrome|view-source):/i.test(bruto)) return { ok: false, motivo: 'Esquema de URL não permitido.' }
  let u: URL
  try { u = new URL(bruto) } catch { return { ok: false, motivo: 'URL inválida.' } }
  if (u.protocol !== 'https:' && !(opt.permitirHttp && u.protocol === 'http:')) return { ok: false, motivo: 'Apenas URLs https:// são aceitas.' }
  if (u.username || u.password) return { ok: false, motivo: 'URL com usuário/senha embutidos não é aceita.' }
  const host = u.hostname.toLowerCase().replace(/\.$/, '')
  if (!host) return { ok: false, motivo: 'URL sem host.' }
  if (host === 'localhost' || SUFIXOS_INTERNOS.some((s) => host.endsWith(s))) return { ok: false, motivo: 'Endereço interno/local não é permitido.' }
  const bare = host.replace(/^\[|\]$/g, '')
  const familia = isIP(bare)
  if (familia === 4 && ipv4Privado(bare)) return { ok: false, motivo: 'Endereço de rede interna/privada não é permitido.' }
  if (familia === 6 && ipv6Privado(bare)) return { ok: false, motivo: 'Endereço de rede interna/privada não é permitido.' }
  if (!familia && !host.includes('.')) return { ok: false, motivo: 'Host sem domínio válido.' }
  return { ok: true, url: u }
}

/** Validação com resolução de DNS (detecta nome público apontando para IP privado). Falha de DNS não bloqueia. */
export async function validarUrlExternaDns(valor: string, timeoutMs = 2500): Promise<ResultadoUrl> {
  const r = validarUrlExterna(valor)
  if (!r.ok || !r.url) return r
  const host = r.url.hostname.replace(/^\[|\]$/g, '')
  if (isIP(host)) return r
  try {
    const res = await Promise.race([
      lookup(host, { all: true }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs)),
    ])
    for (const a of res) {
      if ((a.family === 4 && ipv4Privado(a.address)) || (a.family === 6 && ipv6Privado(a.address))) {
        return { ok: false, motivo: 'O endereço resolve para uma rede interna/privada.' }
      }
    }
  } catch {
    /* DNS indisponível/inexistente: não bloqueia (o link pode ficar válido depois) */
  }
  return r
}
