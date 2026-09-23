import crypto from 'crypto'
import { httpJson } from '../channels/types'

export function xmlEscape(v: string) {
  return String(v).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!)
}

// Construtor mínimo de TwiML.
export class TwiML {
  private parts: string[] = []
  constructor(private voice = 'Polly.Camila', private language = 'pt-BR') {}
  say(text: string) {
    if (text) this.parts.push(`<Say voice="${xmlEscape(this.voice)}" language="${xmlEscape(this.language)}">${xmlEscape(text)}</Say>`)
    return this
  }
  gather(opts: { action: string; say?: string; timeout?: number; numDigits?: number; hints?: string }) {
    const inner = opts.say ? `<Say voice="${xmlEscape(this.voice)}" language="${xmlEscape(this.language)}">${xmlEscape(opts.say)}</Say>` : ''
    this.parts.push(
      `<Gather input="speech dtmf" action="${xmlEscape(opts.action)}" method="POST" language="${xmlEscape(this.language)}" speechTimeout="auto" timeout="${opts.timeout ?? 6}"${
        opts.numDigits ? ` numDigits="${opts.numDigits}"` : ''
      }${opts.hints ? ` hints="${xmlEscape(opts.hints)}"` : ''} actionOnEmptyResult="true">${inner}</Gather>`,
    )
    return this
  }
  dial(number: string, opts: { action?: string; callerId?: string } = {}) {
    this.parts.push(
      `<Dial${opts.action ? ` action="${xmlEscape(opts.action)}"` : ''}${opts.callerId ? ` callerId="${xmlEscape(opts.callerId)}"` : ''}>${xmlEscape(number)}</Dial>`,
    )
    return this
  }
  redirect(url: string) {
    this.parts.push(`<Redirect method="POST">${xmlEscape(url)}</Redirect>`)
    return this
  }
  pause(seconds = 1) {
    this.parts.push(`<Pause length="${seconds}"/>`)
    return this
  }
  hangup() {
    this.parts.push('<Hangup/>')
    return this
  }
  toString() {
    return `<?xml version="1.0" encoding="UTF-8"?><Response>${this.parts.join('')}</Response>`
  }
}

// Validação da assinatura X-Twilio-Signature (HMAC-SHA1 da URL + parâmetros POST ordenados).
export function twilioSignature(authToken: string, url: string, params: Record<string, string>) {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, k) => acc + k + (params[k] ?? ''), url)
  return crypto.createHmac('sha1', authToken).update(Buffer.from(data, 'utf-8')).digest('base64')
}

export function validTwilioRequest(authToken: string, signature: string | undefined, url: string, params: Record<string, string>) {
  if (!signature || !authToken) return false
  const expected = twilioSignature(authToken, url, params)
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

function auth(creds: { accountSid: string; authToken: string }) {
  return `Basic ${Buffer.from(`${creds.accountSid}:${creds.authToken}`).toString('base64')}`
}

export async function createCall(creds: { accountSid: string; authToken: string }, p: { to: string; from: string; url: string; statusCallback: string; timeout?: number }) {
  const params = new URLSearchParams({ To: p.to, From: p.from, Url: p.url, Method: 'POST', StatusCallback: p.statusCallback, StatusCallbackMethod: 'POST', Timeout: String(p.timeout ?? 30) })
  for (const ev of ['initiated', 'ringing', 'answered', 'completed']) params.append('StatusCallbackEvent', ev)
  return httpJson(`https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/Calls.json`, {
    method: 'POST',
    headers: { Authorization: auth(creds), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  })
}

// Inicia gravação somente depois do aviso e sem recusa do cliente.
export async function startRecording(creds: { accountSid: string; authToken: string }, callSid: string, callback: string) {
  const params = new URLSearchParams({ RecordingStatusCallback: callback, RecordingStatusCallbackMethod: 'POST', RecordingChannels: 'dual' })
  return httpJson(`https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/Calls/${callSid}/Recordings.json`, {
    method: 'POST',
    headers: { Authorization: auth(creds), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  })
}

export async function cancelCall(creds: { accountSid: string; authToken: string }, callSid: string) {
  return httpJson(`https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/Calls/${callSid}.json`, {
    method: 'POST',
    headers: { Authorization: auth(creds), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ Status: 'canceled' }),
  })
}
