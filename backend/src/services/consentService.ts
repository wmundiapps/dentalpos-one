// Autorização de contato de marketing (opcional, por canal). A prova (quem, canais, texto, versão, IP, data) vai para a base
// central de contatos autorizados da WMundi (tela "Contatos autorizados" do Studio Beauty Barber). Não grava nada neste banco.
// Só envia se CONSENT_INGEST_KEY estiver configurada; sem ela, não faz nada. Nunca derruba o cadastro.
export const CONSENT_CHANNELS = ['whatsapp', 'sms', 'email', 'phone'] as const
export type ConsentChannel = (typeof CONSENT_CHANNELS)[number]

// TEXTO PROVISÓRIO: depende de aprovação do Robson e revisão da Dra. Roberta (docs/legal/CONSENTIMENTO-CONTATO-PADRAO.md).
export const CONSENT_TEXT_VERSION = 'v1-2026-10-provisorio'
export const CONSENT_TEXT_PT =
  'Autorizo a WMundi Technologies e seus sistemas (DentalPos e demais) a entrar em contato comigo pelos canais marcados, com ofertas, novidades e avisos. Posso retirar a autorização quando quiser, pelo mesmo canal ou pelo e-mail contato@dentalpos.com.br. (Opcional)'

export function pickChannels(input: unknown): Record<ConsentChannel, boolean> {
  const src = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  return Object.fromEntries(CONSENT_CHANNELS.map((c) => [c, src[c] === true])) as Record<ConsentChannel, boolean>
}

export async function forwardConsent(p: {
  name?: string
  phone?: string
  email?: string
  channels: unknown
  source: string
  ip?: string
  userAgent?: string
}): Promise<void> {
  try {
    const key = process.env.CONSENT_INGEST_KEY
    if (!key) return
    const channels = pickChannels(p.channels)
    if (!Object.values(channels).some(Boolean)) return
    const base = process.env.CONSENT_INGEST_URL || 'https://app.studiobeautybarber.com/api/ingest/consent'
    await fetch(base, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: p.name,
        phone: p.phone,
        email: p.email,
        channels,
        source: p.source,
        text_version: CONSENT_TEXT_VERSION,
        text_shown: CONSENT_TEXT_PT,
        lang: 'pt',
        ip: p.ip,
        consent_at: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(5000),
    })
  } catch (err) {
    console.error('Falha ao registrar autorização de contato:', err instanceof Error ? err.message : err)
  }
}
