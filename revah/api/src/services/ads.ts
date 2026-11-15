// REVAH Ads (add-on vendido à parte): a IA monta o plano do anúncio — estratégia, público, verba,
// variações de texto prontas para o Meta (Facebook/Instagram) e alertas de política de anúncios.
// Fase 1: gera o plano para o cliente copiar no Gerenciador de Anúncios. A publicação direta no Meta
// vem depois da verificação da empresa e da aprovação do app da WMundi para anúncios.
import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod/v4'
import type { AdPlan, Tenant } from '@prisma/client'
import { config } from '../config'
import { prisma } from '../lib/prisma'
import { HttpError, paymentRequired } from '../lib/errors'
import { checkText } from '../lib/contentFilter'

export const AD_GOALS = ['MESSAGES', 'LEADS', 'SALES', 'TRAFFIC'] as const
const GOAL_LABEL: Record<(typeof AD_GOALS)[number], string> = {
  MESSAGES: 'conversas no WhatsApp/Direct',
  LEADS: 'cadastros (formulário de anúncio)',
  SALES: 'vendas no site',
  TRAFFIC: 'visitas ao site',
}
const CTAS = ['SEND_WHATSAPP_MESSAGE', 'SEND_MESSAGE', 'LEARN_MORE', 'SIGN_UP', 'BOOK_NOW', 'CONTACT_US', 'GET_QUOTE', 'SHOP_NOW', 'GET_OFFER'] as const

export const AdResult = z.object({
  strategy: z.string().describe('Estratégia em 3 a 5 frases curtas, em português, para o dono do negócio entender.'),
  campaignObjective: z.enum(['OUTCOME_ENGAGEMENT', 'OUTCOME_LEADS', 'OUTCOME_SALES', 'OUTCOME_TRAFFIC']).describe('Objetivo da campanha no Meta.'),
  audience: z.object({
    ageMin: z.number().int(),
    ageMax: z.number().int(),
    genders: z.enum(['ALL', 'FEMALE', 'MALE']),
    locations: z.array(z.string()).describe('Cidades/regiões com raio sugerido, ex.: "Maringá-PR + 15 km".'),
    interests: z.array(z.string()).describe('Interesses e comportamentos do Meta.'),
    exclusions: z.array(z.string()),
    advantagePlus: z.boolean().describe('true se é melhor deixar o público Advantage+ do Meta encontrar as pessoas.'),
  }),
  budget: z.object({
    dailySuggested: z.number().describe('Verba diária sugerida em reais.'),
    testDays: z.number().int().describe('Dias de teste antes de decidir o que escalar.'),
    howToSplit: z.string(),
  }),
  variants: z
    .array(
      z.object({
        angle: z.string().describe('Ângulo/argumento da variação (ex.: dor, prova social, oferta, urgência).'),
        primaryText: z.string().describe('Texto principal, até 125 caracteres no início que aparece sem "ver mais".'),
        headline: z.string().describe('Título, até 40 caracteres.'),
        description: z.string().describe('Descrição, até 30 caracteres.'),
        cta: z.enum(CTAS),
        creativeBrief: z.string().describe('O que a imagem ou vídeo deve mostrar (para o designer ou para gerar imagem).'),
      }),
    )
    .describe('Exatamente 5 variações com ângulos diferentes.'),
  policyWarnings: z.array(z.string()).describe('Riscos de reprovação nas políticas do Meta e regras do setor (ex.: conselhos profissionais).'),
  successMetrics: z.array(z.string()).describe('O que acompanhar e o número que indica sucesso.'),
  nextSteps: z.array(z.string()),
})
export type AdResult = z.infer<typeof AdResult>

const SYSTEM = `Você é um gestor de tráfego sênior especializado em anúncios no Meta (Facebook e Instagram) para pequenas e médias empresas do Brasil.
Monte um plano de anúncio pronto para usar, em português do Brasil, direto e prático.
Regras:
- Textos dentro dos limites: título até 40 caracteres, descrição até 30, e o gancho nas primeiras 125 caracteres do texto principal.
- Siga as políticas de publicidade do Meta: não afirme nem insinue atributos pessoais de quem vê ("Você tem diabetes?"), sem promessas de resultado garantido, sem antes/depois enganoso, sem conteúdo adulto.
- Respeite as regras do setor: saúde (CFO, CFM, CRM — sem antes/depois, sem preço como chamariz quando o conselho proíbe, sem promessa de cura), financeiro, alimentos etc. Liste os riscos em policyWarnings.
- Prefira objetivos e públicos que funcionem com verba pequena; quando o público for amplo, recomende Advantage+.
- Use a oferta e o público informados; se faltarem dados, assuma o mais provável e diga em strategy.
- Não invente números de resultado nem promessas de vendas.`

let client: Anthropic | null = null
function ai() {
  if (!client) client = new Anthropic({ apiKey: config.ai.apiKey, timeout: 55_000, maxRetries: 1 })
  return client
}

export function adsAccess(tenant: Pick<Tenant, 'adsAddonActive'>) {
  return { addonActive: tenant.adsAddonActive, aiAvailable: Boolean(config.ai.apiKey), platforms: ['META'] }
}

export function assertAdsAccess(tenant: Pick<Tenant, 'adsAddonActive'>) {
  if (!tenant.adsAddonActive) throw paymentRequired('O REVAH Ads é contratado à parte. Fale com o comercial para liberar.', 'ADS_ADDON_REQUIRED')
}

function promptFor(plan: AdPlan, tenant: Tenant) {
  return [
    `Empresa: ${tenant.name}`,
    `O que vende e para quem: ${plan.business}`,
    plan.offer ? `Oferta: ${plan.offer}` : 'Oferta: não informada',
    plan.audience ? `Público desejado: ${plan.audience}` : 'Público desejado: não informado',
    plan.location ? `Onde anunciar: ${plan.location}` : 'Onde anunciar: não informado',
    `Objetivo: ${GOAL_LABEL[plan.goal as (typeof AD_GOALS)[number]] || plan.goal}`,
    plan.dailyBudget ? `Verba diária disponível: R$ ${Number(plan.dailyBudget).toFixed(2)}` : 'Verba diária: não informada (sugira uma)',
  ].join('\n')
}

// Limites do Meta e filtro de texto do REVAH aplicados depois da IA.
export function finalizeResult(r: AdResult): AdResult & { flagged: string[] } {
  const flagged: string[] = []
  const variants = r.variants.slice(0, 5).map((v, i) => {
    const out = { ...v, headline: v.headline.slice(0, 40), description: v.description.slice(0, 30) }
    for (const [label, text] of [['texto', out.primaryText], ['título', out.headline], ['descrição', out.description]] as const) {
      if (checkText(text)) flagged.push(`Variação ${i + 1}: ${label} recusado pelo filtro de conteúdo.`)
    }
    return out
  })
  return { ...r, variants, flagged }
}

export async function generateAdPlan(tenant: Tenant, plan: AdPlan) {
  assertAdsAccess(tenant)
  if (!config.ai.apiKey) throw new HttpError(503, 'A IA do REVAH está indisponível no momento.', 'AI_UNAVAILABLE')
  const since = new Date(Date.now() - 24 * 3600_000)
  const used = await prisma.auditLog.count({ where: { tenantId: tenant.id, action: 'ADS_GENERATE', createdAt: { gte: since } } })
  if (used >= config.ai.adsDailyGenerations) throw new HttpError(429, `Limite de ${config.ai.adsDailyGenerations} gerações por dia atingido. Tente amanhã.`, 'ADS_DAILY_LIMIT')

  const res = await ai().beta.messages.parse({
    model: config.ai.adsModel,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium', format: betaZodOutputFormat(AdResult) },
    system: SYSTEM,
    messages: [{ role: 'user', content: promptFor(plan, tenant) }],
  })
  if (res.stop_reason === 'refusal' || !res.parsed_output) {
    throw new HttpError(422, 'A IA não conseguiu montar este anúncio. Revise a descrição do negócio e tente de novo.', 'ADS_REFUSED')
  }
  const result = finalizeResult(res.parsed_output)
  await prisma.auditLog.create({ data: { tenantId: tenant.id, action: 'ADS_GENERATE', entity: 'AdPlan', entityId: plan.id } })
  return prisma.adPlan.update({ where: { id: plan.id }, data: { result: result as any, generatedAt: new Date() } })
}
