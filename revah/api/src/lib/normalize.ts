// Normalização de destinos por canal. Telefones ficam em E.164 sem "+".

export function digits(v: unknown) {
  return String(v ?? '').replace(/\D/g, '')
}

// Aceita formatos brasileiros comuns: (44) 99999-9999, 44999999999, +55 44 99999-9999.
export function normalizePhone(raw: unknown, defaultCountry = '55'): string | null {
  let d = digits(raw)
  if (!d) return null
  if (d.startsWith('00')) d = d.slice(2)
  if (d.length === 10 || d.length === 11) d = defaultCountry + d
  if (d.startsWith('55')) {
    // Brasil: 55 + DDD (2) + 8 ou 9 dígitos
    if (d.length !== 12 && d.length !== 13) return null
    const ddd = Number(d.slice(2, 4))
    if (ddd < 11 || ddd > 99) return null
    return d
  }
  return d.length >= 8 && d.length <= 15 ? d : null
}

export function normalizeEmail(raw: unknown): string | null {
  const v = String(raw ?? '').trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? v : null
}

export type Channel = 'WHATSAPP' | 'SMS' | 'TELEGRAM' | 'EMAIL' | 'INSTAGRAM' | 'MESSENGER' | 'VOICE'
export const CHANNELS: Channel[] = ['WHATSAPP', 'SMS', 'TELEGRAM', 'EMAIL', 'INSTAGRAM', 'MESSENGER', 'VOICE']

export function isChannel(v: unknown): v is Channel {
  return CHANNELS.includes(String(v) as Channel)
}

// Campo do contato que guarda o endereço de cada canal.
export function contactFieldFor(channel: Channel) {
  switch (channel) {
    case 'WHATSAPP':
    case 'SMS':
    case 'VOICE':
      return 'phone' as const
    case 'EMAIL':
      return 'email' as const
    case 'TELEGRAM':
      return 'telegramChatId' as const
    case 'INSTAGRAM':
      return 'instagramId' as const
    case 'MESSENGER':
      return 'messengerId' as const
  }
}

export function normalizeDestination(channel: Channel, raw: unknown): string | null {
  const field = contactFieldFor(channel)
  if (field === 'phone') return normalizePhone(raw)
  if (field === 'email') return normalizeEmail(raw)
  const v = String(raw ?? '').trim()
  return v ? v : null
}

export function slugify(v: string) {
  return (
    v
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'empresa'
  )
}

// Variáveis de template: {{nome}}, {{primeiro_nome}}, {{empresa}} e campos personalizados.
export function renderTemplate(template: string, vars: Record<string, unknown>) {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, k) => {
    const v = vars[k]
    return v === undefined || v === null ? '' : String(v)
  })
}

export function contactVars(contact: { name?: string | null; company?: string | null; customFields?: unknown } | null, extra: Record<string, unknown> = {}) {
  const name = contact?.name || ''
  const custom = (contact?.customFields && typeof contact.customFields === 'object' ? contact.customFields : {}) as Record<string, unknown>
  return { ...custom, nome: name, primeiro_nome: name.split(' ')[0] || '', empresa: contact?.company || '', ...extra }
}
