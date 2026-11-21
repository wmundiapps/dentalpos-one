// Formato do carrossel de ofertas (funções puras, sem banco): validação dos cards, payload dos botões,
// template e mensagem do WhatsApp (API oficial da Meta) e card do Telegram.
import { z } from 'zod'
import { badRequest } from '../lib/errors'

export const MIN_CARDS = 2
export const MAX_CARDS = 10
export const DEFAULT_BUTTON = 'Quero saber mais'
export const OPT_OUT_BUTTON = 'Não quero receber'

export const CardSchema = z.object({
  title: z.string().trim().min(1).max(60),
  subtitle: z.string().trim().max(90).nullable().optional(),
  imageUrl: z.string().trim().url(),
  buttonText: z.string().trim().min(1).max(25).default(DEFAULT_BUTTON),
  buttonUrl: z.string().trim().url().nullable().optional(),
  buttonUrlText: z.string().trim().max(25).nullable().optional(),
  catalogItemId: z.string().nullable().optional(),
  // Etiqueta aplicada ao contato que escolher o card (padrão: o título do card).
  tag: z.string().trim().max(60).nullable().optional(),
})

export const CarouselSchema = z
  .object({
    cards: z.array(CardSchema).min(MIN_CARDS, `Use pelo menos ${MIN_CARDS} cards.`).max(MAX_CARDS, `Use no máximo ${MAX_CARDS} cards.`),
    // Botão "Não quero receber" em cada card (só quando os cards não têm botão de link: a Meta aceita 2 botões por card).
    optOutButton: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    const withUrl = v.cards.filter((c) => c.buttonUrl).length
    if (withUrl && withUrl !== v.cards.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'No WhatsApp todos os cards precisam ter os mesmos botões: coloque link em todos ou em nenhum.' })
    }
  })

export type Card = z.infer<typeof CardSchema>
export type Carousel = z.infer<typeof CarouselSchema>

export function getCarousel(campaign: Pick<Campaign, 'carousel'>): Carousel | null {
  const parsed = CarouselSchema.safeParse(campaign.carousel)
  return parsed.success ? parsed.data : null
}

export function hasUrlButtons(c: Carousel) {
  return c.cards.length > 0 && c.cards.every((x) => Boolean(x.buttonUrl))
}

export function showOptOut(c: Carousel) {
  return c.optOutButton && !hasUrlButtons(c)
}

// ---------------------------------------------------------------------------
// Payload dos botões: "rv:<campaignId>:<card>:<ação>" (cabe nos 64 bytes do callback_data do Telegram).
// Ações: i = interesse, x = não quero receber, g = ir para o card (setas do Telegram).
// ---------------------------------------------------------------------------
export type CarouselAction = 'i' | 'x' | 'g'

export function encodePayload(campaignId: string, index: number, action: CarouselAction) {
  return `rv:${campaignId}:${index}:${action}`
}

export function decodePayload(raw: unknown): { campaignId: string; index: number; action: CarouselAction } | null {
  const m = /^rv:([A-Za-z0-9_-]{6,40}):(\d{1,2}):([ixg])$/.exec(String(raw || ''))
  if (!m) return null
  return { campaignId: m[1], index: Number(m[2]), action: m[3] as CarouselAction }
}

// ---------------------------------------------------------------------------
// WhatsApp: definição do template (enviada à Meta para aprovação) e mensagem de envio.
// ---------------------------------------------------------------------------
const NAME_VARS = /\{\{\s*(nome|primeiro_nome)\s*\}\}/g

// Texto de abertura: só o nome do contato vira variável ({{1}}); outras variáveis não são aceitas pela Meta neste formato.
export function openingForMeta(text: string) {
  const body = text.trim()
  if (!body) throw badRequest('Escreva o texto de abertura do carrossel.')
  if (body.length > 1024) throw badRequest('O texto de abertura pode ter até 1.024 caracteres.')
  let usesName = false
  const converted = body.replace(NAME_VARS, () => {
    usesName = true
    return '{{1}}'
  })
  const other = /\{\{\s*(?!1\s*\}\})[^}]*\}\}/.exec(converted)
  if (other) throw badRequest(`No carrossel do WhatsApp use só {{primeiro_nome}} ou {{nome}} no texto de abertura (encontrei ${other[0]}).`)
  if ((converted.match(/\{\{1\}\}/g) || []).length > 1) throw badRequest('Use o nome do contato só uma vez no texto de abertura.')
  const nameVar = /\{\{\s*nome\s*\}\}/.test(body) ? '{{nome}}' : '{{primeiro_nome}}'
  return { text: converted, params: usesName ? [nameVar] : [] }
}

export function cardBody(card: Pick<Card, 'title' | 'subtitle'>) {
  const text = card.subtitle ? `${card.title}\n${card.subtitle}` : card.title
  if (text.length > 160) throw badRequest(`O texto do card "${card.title}" passa de 160 caracteres.`)
  return text
}

export function waTemplateName(campaignId: string, now = Date.now()) {
  return `revah_carrossel_${campaignId.slice(-8).toLowerCase().replace(/[^a-z0-9]/g, '')}_${now.toString(36)}`
}

export function waCarouselTemplateDefinition(input: { name: string; language?: string; opening: string; carousel: Carousel; headerHandles: string[] }) {
  const { carousel } = input
  const opening = openingForMeta(input.opening)
  const url = hasUrlButtons(carousel)
  const optOut = showOptOut(carousel)
  return {
    name: input.name,
    language: input.language || 'pt_BR',
    category: 'MARKETING',
    components: [
      {
        type: 'BODY',
        text: opening.text,
        ...(opening.params.length ? { example: { body_text: [['Ana']] } } : {}),
      },
      {
        type: 'CAROUSEL',
        cards: carousel.cards.map((card, i) => ({
          components: [
            { type: 'HEADER', format: 'IMAGE', example: { header_handle: [input.headerHandles[i]] } },
            { type: 'BODY', text: cardBody(card) },
            {
              type: 'BUTTONS',
              buttons: [
                { type: 'QUICK_REPLY', text: card.buttonText || DEFAULT_BUTTON },
                ...(url ? [{ type: 'URL', text: card.buttonUrlText || 'Ver detalhes', url: card.buttonUrl }] : []),
                ...(optOut ? [{ type: 'QUICK_REPLY', text: OPT_OUT_BUTTON }] : []),
              ],
            },
          ],
        })),
      },
    ],
    params: opening.params,
  }
}

export function waCarouselMessage(input: { to: string; templateName: string; language?: string; bodyParams: string[]; campaignId: string; carousel: Carousel }) {
  const { carousel } = input
  const optOut = showOptOut(carousel)
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: input.to,
    type: 'template',
    template: {
      name: input.templateName,
      language: { code: input.language || 'pt_BR' },
      components: [
        ...(input.bodyParams.length ? [{ type: 'body', parameters: input.bodyParams.map((text) => ({ type: 'text', text: text || 'tudo bem' })) }] : []),
        {
          type: 'carousel',
          cards: carousel.cards.map((card, i) => ({
            card_index: i,
            components: [
              { type: 'header', parameters: [{ type: 'image', image: { link: card.imageUrl } }] },
              { type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload: encodePayload(input.campaignId, i, 'i') }] },
              // Botão de link sem variável não leva parâmetro; o de saída fica depois dele.
              ...(optOut ? [{ type: 'button', sub_type: 'quick_reply', index: '1', parameters: [{ type: 'payload', payload: encodePayload(input.campaignId, i, 'x') }] }] : []),
            ],
          })),
        },
      ],
    },
  }
}

// ---------------------------------------------------------------------------
// Telegram: um card por vez, com setas para navegar (editMessageMedia).
// ---------------------------------------------------------------------------
export function telegramCard(input: { campaignId: string; carousel: Carousel; index: number; opening?: string | null }) {
  const { carousel, campaignId } = input
  const total = carousel.cards.length
  const index = ((input.index % total) + total) % total
  const card = carousel.cards[index]
  const caption = [input.opening?.trim(), [card.title, card.subtitle].filter(Boolean).join('\n'), `${index + 1} de ${total}`].filter(Boolean).join('\n\n').slice(0, 1024)
  const keyboard: { text: string; callback_data?: string; url?: string }[][] = [
    [
      { text: '◀', callback_data: encodePayload(campaignId, (index - 1 + total) % total, 'g') },
      { text: '▶', callback_data: encodePayload(campaignId, (index + 1) % total, 'g') },
    ],
    [{ text: card.buttonText || DEFAULT_BUTTON, callback_data: encodePayload(campaignId, index, 'i') }],
  ]
  if (card.buttonUrl) keyboard.push([{ text: card.buttonUrlText || 'Ver detalhes', url: card.buttonUrl }])
  if (carousel.optOutButton) keyboard.push([{ text: OPT_OUT_BUTTON, callback_data: encodePayload(campaignId, index, 'x') }])
  return { photo: card.imageUrl, caption, reply_markup: { inline_keyboard: keyboard } }
}

