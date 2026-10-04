import { Socket } from 'node:net'

// ============================================================
// Antivírus OPCIONAIS. Só rodam se configurados; com timeout; nunca derrubam o fluxo
// (erro/indisponibilidade => { estado: 'indisponivel' } e o upload segue com os demais controles).
// ============================================================

export type ResultadoAv = { estado: 'limpo' } | { estado: 'infectado'; assinatura: string } | { estado: 'indisponivel'; motivo: string } | { estado: 'nao-configurado' }

export function clamavConfigurado() {
  return !!String(process.env.CLAMAV_HOST || '').trim()
}

/** ClamAV via clamd TCP, protocolo INSTREAM (zINSTREAM\0 + blocos [len BE32][dados] + len 0). */
export function varrerClamav(data: Buffer, opt: { host?: string; port?: number; timeoutMs?: number } = {}): Promise<ResultadoAv> {
  const host = opt.host || String(process.env.CLAMAV_HOST || '').trim()
  if (!host) return Promise.resolve({ estado: 'nao-configurado' })
  const port = opt.port || Number(process.env.CLAMAV_PORT || 3310)
  const timeoutMs = opt.timeoutMs || Number(process.env.CLAMAV_TIMEOUT_MS || 8000)
  const limite = Number(process.env.CLAMAV_MAX_BYTES || 25 * 1024 * 1024) // StreamMaxLength padrão do clamd
  if (data.length > limite) return Promise.resolve({ estado: 'indisponivel', motivo: 'arquivo acima do limite do clamd' })

  return new Promise<ResultadoAv>((resolve) => {
    let resposta = ''
    let fim = false
    const sock = new Socket()
    const terminar = (r: ResultadoAv) => {
      if (fim) return
      fim = true
      sock.destroy()
      resolve(r)
    }
    sock.setTimeout(timeoutMs, () => terminar({ estado: 'indisponivel', motivo: 'timeout' }))
    sock.on('error', (e: any) => terminar({ estado: 'indisponivel', motivo: String(e?.code || e?.message || 'erro').slice(0, 60) }))
    sock.on('data', (d) => { resposta += d.toString('latin1') })
    sock.on('end', () => {
      const t = resposta.replace(/\0/g, '').trim()
      const found = /^stream:\s*(.+?)\s+FOUND$/i.exec(t)
      if (found) return terminar({ estado: 'infectado', assinatura: found[1] })
      if (/stream:\s*OK$/i.test(t)) return terminar({ estado: 'limpo' })
      terminar({ estado: 'indisponivel', motivo: 'resposta inesperada do clamd' })
    })
    sock.connect(port, host, () => {
      sock.write('zINSTREAM\0')
      const CH = 64 * 1024
      for (let o = 0; o < data.length; o += CH) {
        const parte = data.subarray(o, Math.min(data.length, o + CH))
        const len = Buffer.alloc(4)
        len.writeUInt32BE(parte.length)
        sock.write(len)
        sock.write(parte)
      }
      sock.write(Buffer.alloc(4)) // terminador
    })
  })
}

/** VirusTotal: consulta SOMENTE o hash sha256 (o conteúdo nunca é enviado). 404 = desconhecido = ok. */
export async function consultarVirusTotal(sha256: string, opt: { timeoutMs?: number } = {}): Promise<ResultadoAv & { malicioso?: number }> {
  const key = String(process.env.VIRUSTOTAL_API_KEY || '').trim()
  if (!key) return { estado: 'nao-configurado' }
  try {
    const r = await fetch(`https://www.virustotal.com/api/v3/files/${sha256}`, {
      headers: { 'x-apikey': key, accept: 'application/json' },
      signal: AbortSignal.timeout(opt.timeoutMs || Number(process.env.VIRUSTOTAL_TIMEOUT_MS || 4000)),
    })
    if (r.status === 404) return { estado: 'limpo' }
    if (!r.ok) return { estado: 'indisponivel', motivo: `http ${r.status}` }
    const j: any = await r.json().catch(() => ({}))
    const s = j?.data?.attributes?.last_analysis_stats || {}
    const malicioso = Number(s.malicious || 0)
    const minimo = Math.max(1, Number(process.env.VIRUSTOTAL_MIN_DETECTIONS || 3))
    if (malicioso >= minimo) return { estado: 'infectado', assinatura: `VirusTotal (${malicioso} detecções)`, malicioso }
    return { estado: 'limpo', malicioso }
  } catch (e: any) {
    return { estado: 'indisponivel', motivo: String(e?.name === 'TimeoutError' ? 'timeout' : e?.message || 'erro').slice(0, 60) }
  }
}
