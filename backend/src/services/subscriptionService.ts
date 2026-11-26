import { randomUUID } from 'crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { hashPassword } from './userService'
import { createStarterClinic } from './clinicProvisionService'
import { call, ensureCustomer } from './platformBillingService'
import { dispatchRevah } from './revahProviderService'
import { decryptSecret, encryptSecret } from './secretVault'

// Assinatura da clinica com a WMundi (mensalidade do DentalPos).
// Regra: 30 dias de teste com cartao cadastrado, depois cobranca mensal automatica com 50% de desconto
// nos 12 primeiros meses e valor cheio a partir do 13o. Sem fidelidade: cancela quando quiser.
// O cartao vai direto ao Asaas (que guarda o token); aqui ficam so a bandeira e os 4 ultimos digitos.

export const TRIAL_DAYS = 30
export const PROMO_CYCLES = 12
export const PROMO_PERCENT = 50
export const TERMS_VERSION = '2026-10-31'
const DAY_MS = 86_400_000

export const PLANS: Record<string, { key: string; name: string; price: number }> = {
  BASIC: { key: 'BASIC', name: 'Basic', price: 197 },
  INTERMEDIUM: { key: 'INTERMEDIUM', name: 'Intermedium', price: 397 },
  PLENUM: { key: 'PLENUM', name: 'Plenum', price: 597 },
}

export class SubscriptionError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '')
const text = (v: unknown) => String(v ?? '').trim()
const round2 = (n: number) => Math.round(n * 100) / 100
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const brDate = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
const isoBrDate = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

function promoUntil() {
  const d = new Date(process.env.SUBSCRIPTION_PROMO_UNTIL || '2026-12-31T23:59:59-03:00')
  return Number.isNaN(d.getTime()) ? new Date('2026-12-31T23:59:59-03:00') : d
}
const promoActive = (now = new Date()) => now <= promoUntil()

// Planos e condicoes que a pagina publica mostra (a mesma regra que o servidor aplica).
export function publicOffer(now = new Date()) {
  const promo = promoActive(now)
  const firstCharge = new Date(now.getTime() + TRIAL_DAYS * DAY_MS)
  return {
    trialDays: TRIAL_DAYS,
    promoActive: promo,
    promoPercent: promo ? PROMO_PERCENT : 0,
    promoCycles: promo ? PROMO_CYCLES : 0,
    promoUntil: promoUntil().toISOString(),
    firstChargeDate: firstCharge.toISOString(),
    cardRequired: false,
    minimumCommitment: false,
    plans: Object.values(PLANS).map(p => ({
      key: p.key,
      name: p.name,
      price: p.price,
      promoPrice: promo ? round2(p.price * (1 - PROMO_PERCENT / 100)) : p.price,
    })),
  }
}

// Data de nascimento: aceita AAAA-MM-DD ou DD/MM/AAAA; so maiores de 18 anos e datas plausiveis.
function parseBirthDate(v: unknown): Date | null {
  const t = text(v)
  let iso = ''
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t)
  if (br) iso = `${br[3]}-${br[2]}-${br[1]}`
  else if (/^\d{4}-\d{2}-\d{2}$/.test(t)) iso = t
  if (!iso) return null
  const d = new Date(`${iso}T12:00:00-03:00`)
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== new Date(`${iso}T12:00:00Z`).toISOString().slice(0, 10)) return null
  const age = (Date.now() - d.getTime()) / (365.25 * DAY_MS)
  return age >= 18 && age <= 110 ? d : null
}

function luhn(num: string) {
  let sum = 0
  let alt = false
  for (let i = num.length - 1; i >= 0; i--) {
    let n = Number(num[i])
    if (alt) { n *= 2; if (n > 9) n -= 9 }
    sum += n
    alt = !alt
  }
  return sum % 10 === 0
}

// ---------- e-mail ----------

async function sendMailWithSubject(to: string, subject: string, body: string) {
  const apiKey = process.env.RESEND_API_KEY || ''
  if (!apiKey) { console.error('RESEND_API_KEY nao configurada - e-mail da assinatura nao enviado.'); return }
  try {
    await dispatchRevah('EMAIL', to, body, { apiKey, from: 'DentalPos <contato@dentalpos.com.br>', subject })
  } catch (error) {
    console.error('Falha ao enviar e-mail da assinatura:', error instanceof Error ? error.message : error)
  }
}

const SIGN = ['', 'Equipe DentalPos', 'Dúvidas: contato@dentalpos.com.br'].join('\n')

function chargeLine(promoPrice: number, fullPrice: number, promoCycles: number) {
  return promoCycles > 0
    ? `${brl(promoPrice)} por mês nos primeiros ${promoCycles} meses (50% de desconto) e ${brl(fullPrice)} por mês a partir do mês ${promoCycles + 1}`
    : `${brl(fullPrice)} por mês`
}

// Token do cartao (fica criptografado; so serve com a chave do Asaas da plataforma). Permite reativar sem digitar o cartao de novo.
function sealToken(token: unknown) {
  const t = text(token)
  if (!t) return null
  try { return encryptSecret({ token: t }) } catch { return null }
}
function openToken(sealed?: string | null) {
  try { return decryptSecret<{ token?: string }>(sealed)?.token || null } catch { return null }
}

// Mensalidades vencidas e nao pagas no Asaas (cliente da clinica).
async function overduePayments(customerId: string | null) {
  if (!customerId) return [] as { id: string; value: number; invoiceUrl?: string }[]
  const r = await call(`/payments?customer=${encodeURIComponent(customerId)}&status=OVERDUE&limit=100`)
  return ((r?.data || []) as any[]).map(p => ({ id: String(p.id), value: Number(p.value || 0), invoiceUrl: p.invoiceUrl ? String(p.invoiceUrl) : undefined }))
}

// ---------- cadastro com teste de 30 dias ----------

export interface TrialSignupInput {
  clinicName?: unknown; firstName?: unknown; lastName?: unknown; phone?: unknown; email?: unknown
  password?: unknown; cro?: unknown; specialty?: unknown; plan?: unknown; cpfCnpj?: unknown
  postalCode?: unknown; addressNumber?: unknown; acceptTerms?: unknown
  birthDate?: unknown; street?: unknown; city?: unknown; state?: unknown; croState?: unknown
  card?: { holderName?: unknown; number?: unknown; expiryMonth?: unknown; expiryYear?: unknown; ccv?: unknown }
}

export async function startTrial(input: TrialSignupInput, remoteIp: string) {
  const plan = PLANS[text(input.plan).toUpperCase()]
  if (!plan) throw new SubscriptionError('Escolha um plano.')

  const clinicName = text(input.clinicName)
  const firstName = text(input.firstName)
  const lastName = text(input.lastName)
  const phone = text(input.phone)
  const email = text(input.email).toLowerCase()
  const password = String(input.password || '')
  const doc = digits(input.cpfCnpj)
  const postalCode = digits(input.postalCode)
  const addressNumber = text(input.addressNumber)
  const card = input.card || {}
  const cardNumber = digits(card.number)
  const holderName = text(card.holderName)
  const expiryMonth = digits(card.expiryMonth).padStart(2, '0')
  const expiryYear = digits(card.expiryYear)
  const ccv = digits(card.ccv)

  if (!clinicName || !firstName || !lastName || !phone || !email || !password) throw new SubscriptionError('Clínica, nome, sobrenome, WhatsApp, e-mail e senha são obrigatórios.')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new SubscriptionError('Informe um e-mail válido.')
  if (password.length < 10) throw new SubscriptionError('A senha deve possuir pelo menos 10 caracteres.')
  if (doc.length !== 11 && doc.length !== 14) throw new SubscriptionError('Informe o CPF ou CNPJ do titular da assinatura.')
  if (postalCode.length !== 8 || !addressNumber) throw new SubscriptionError('Informe o CEP e o número do endereço de cobrança.')
  // Cartao e opcional no cadastro: se vier preenchido, e validado e ja fica cadastrado; se nao, o sistema avisa durante o teste.
  const hasCard = Boolean(cardNumber || holderName || ccv || digits(card.expiryYear))
  if (hasCard) {
    if (!holderName || cardNumber.length < 13 || cardNumber.length > 19 || !luhn(cardNumber)) throw new SubscriptionError('Confira o número do cartão e o nome impresso nele.')
    if (!/^(0[1-9]|1[0-2])$/.test(expiryMonth) || expiryYear.length !== 4) throw new SubscriptionError('Confira a validade do cartão.')
    if (ccv.length < 3 || ccv.length > 4) throw new SubscriptionError('Confira o código de segurança do cartão.')
  }
  const cro = text(input.cro)
  const street = text(input.street)
  const city = text(input.city)
  const state = text(input.state).toUpperCase()
  const birthDate = parseBirthDate(input.birthDate)
  if (!cro) throw new SubscriptionError('Informe o número do CRO.')
  if (!birthDate) throw new SubscriptionError('Informe uma data de nascimento válida.')
  if (!street || !city || state.length !== 2) throw new SubscriptionError('Informe o endereço completo: rua, número, cidade e estado (UF).')
  if (input.acceptTerms !== true) throw new SubscriptionError('É necessário aceitar as condições do teste.')

  const duplicateUser = await prisma.user.findFirst({ where: { email, isActive: true }, select: { id: true } })
  if (duplicateUser) throw new SubscriptionError('Este e-mail já possui acesso ao DentalPos. Entre com a conta existente.', 409)

  // Um teste gratuito por CPF/CNPJ (tentativas que falharam no cartao nao contam).
  const sameDoc = await prisma.clinic.findMany({ where: { cnpj: doc }, select: { id: true } })
  if (sameDoc.length) {
    const used = await prisma.platformSubscription.count({ where: { clinicId: { in: sameDoc.map(c => c.id) }, status: { not: 'FALHOU' } } })
    if (used) throw new SubscriptionError('Este CPF/CNPJ já usou o teste gratuito. Entre com a conta existente.', 409)
  }

  const now = new Date()
  const promo = promoActive(now)
  const promoPrice = promo ? round2(plan.price * (1 - PROMO_PERCENT / 100)) : plan.price
  const promoCycles = promo ? PROMO_CYCLES : 0
  const trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * DAY_MS)
  const tenantId = `clinic-${randomUUID()}`
  const passwordHash = await hashPassword(password)
  const subscriptionId = randomUUID()

  // 1) Cria tudo inativo. So ativa depois que o Asaas aceitar o cartao.
  const created = await prisma.$transaction(async tx => {
    const starter = await createStarterClinic(tx, {
      tenantId, clinicName, firstName, lastName, phone, email, passwordHash, cnpj: doc,
      cro, specialty: text(input.specialty) || 'Clínica geral',
      plan: plan.key, maxPatients: 100000, active: !hasCard,
      personal: { cpf: doc.length === 11 ? doc : undefined, birthDate, address: `${street}, ${addressNumber}`, city, state, zipCode: postalCode, croState: text(input.croState).toUpperCase().slice(0, 2) || state },
    })
    await tx.platformSubscription.create({
      data: {
        id: subscriptionId, clinicId: starter.clinicId, tenantId, plan: plan.key, status: hasCard ? 'PENDENTE' : 'TESTE', lastEvent: hasCard ? null : 'TESTE_SEM_CARTAO',
        fullPrice: plan.price, promoPrice, promoCycles, trialDays: TRIAL_DAYS, trialEndsAt, accessUntil: trialEndsAt,
        fullPriceAppliedAt: promoCycles === 0 ? now : null, termsAcceptedAt: now, termsVersion: TERMS_VERSION,
      },
    })
    return starter
  })

  // Sem cartao: o teste ja comeca liberado. O cartao e cadastrado depois, em Configuracoes > Minha assinatura.
  if (!hasCard) {
    await sendMailWithSubject(
      email,
      'Seu teste grátis de 30 dias do DentalPos começou',
      [
        `Olá ${firstName},`,
        '',
        `O teste grátis de 30 dias do DentalPos (plano ${plan.name}) para "${clinicName}" já está liberado, sem precisar de cartão.`,
        '',
        'Acesse: https://app.dentalpos.com.br/',
        `E-mail de login: ${email}`,
        'Senha: a que você cadastrou agora',
        '',
        `Seu acesso grátis vai até ${brDate(trialEndsAt)}.`,
        `Para continuar depois do teste, cadastre o cartão em Configurações > Minha assinatura. Nada é cobrado antes de ${brDate(trialEndsAt)}: ${chargeLine(promoPrice, plan.price, promoCycles)}.`,
        'Sem fidelidade: você pode cancelar a qualquer momento. Vamos avisar por e-mail durante o teste.',
        SIGN,
      ].join('\n'),
    )
    await sendMailWithSubject('contato@dentalpos.com.br', `Novo teste de 30 dias (sem cartão) — ${clinicName}`, [`Clínica: ${clinicName}`, `Responsável: ${firstName} ${lastName}`, `CRO: ${cro}`, `Telefone: ${phone}`, `E-mail: ${email}`, `Cidade: ${city}/${state}`, `Plano: ${plan.name}`, `Fim do teste: ${brDate(trialEndsAt)}`].join('\n'))
    return {
      clinicId: created.clinicId, email, plan: plan.key, cardRegistered: false,
      trialEndsAt: trialEndsAt.toISOString(), firstChargeDate: trialEndsAt.toISOString(),
      firstChargeAmount: promoPrice, fullPrice: plan.price, promoCycles,
    }
  }

  // 2) Cliente + assinatura com cartao no Asaas. A primeira cobranca so acontece no fim do teste.
  let asaasSubscriptionId: string | null = null
  try {
    const customer = await ensureCustomer(created.clinicId)
    const sub = await call('/subscriptions', {
      method: 'POST',
      body: JSON.stringify({
        customer,
        billingType: 'CREDIT_CARD',
        value: promoPrice,
        nextDueDate: isoBrDate(trialEndsAt),
        cycle: 'MONTHLY',
        description: `DentalPos - plano ${plan.name}`,
        externalReference: `sub:${subscriptionId}`,
        creditCard: { holderName, number: cardNumber, expiryMonth, expiryYear, ccv },
        creditCardHolderInfo: { name: holderName, email, cpfCnpj: doc, postalCode, addressNumber, mobilePhone: digits(phone) },
        remoteIp,
      }),
    })
    asaasSubscriptionId = String(sub.id)

    await prisma.$transaction([
      prisma.platformSubscription.update({
        where: { id: subscriptionId },
        data: {
          status: 'TESTE', asaasCustomerId: customer, asaasSubscriptionId,
          cardBrand: sub.creditCard?.creditCardBrand ? String(sub.creditCard.creditCardBrand) : null,
          cardLast4: sub.creditCard?.creditCardNumber ? digits(sub.creditCard.creditCardNumber).slice(-4) : cardNumber.slice(-4),
          cardTokenEnc: sealToken(sub.creditCard?.creditCardToken),
          lastEvent: 'TESTE_INICIADO', updatedAt: new Date(),
        },
      }),
      prisma.clinic.update({ where: { id: created.clinicId }, data: { isActive: true } }),
      prisma.user.update({ where: { id: created.userId }, data: { isActive: true } }),
    ])
  } catch (error) {
    if (asaasSubscriptionId) await call(`/subscriptions/${asaasSubscriptionId}`, { method: 'DELETE' }).catch(() => undefined)
    await prisma.platformSubscription.update({ where: { id: subscriptionId }, data: { status: 'FALHOU', lastEvent: 'FALHA_NO_CADASTRO', updatedAt: new Date() } }).catch(() => undefined)
    // Nunca registrar o corpo da requisicao: ele tem o cartao.
    console.error('Falha ao iniciar teste com cartao:', error instanceof Error ? error.message : 'erro')
    const msg = error instanceof Error ? error.message : ''
    throw new SubscriptionError(msg ? `Não foi possível validar o cartão: ${msg}` : 'Não foi possível validar o cartão. Confira os dados e tente de novo.', 402)
  }

  await sendMailWithSubject(
    email,
    'Seu teste grátis de 30 dias do DentalPos começou',
    [
      `Olá ${firstName},`,
      '',
      `O teste grátis de 30 dias do DentalPos (plano ${plan.name}) para "${clinicName}" já está liberado.`,
      '',
      'Acesse: https://app.dentalpos.com.br/',
      `E-mail de login: ${email}`,
      'Senha: a que você cadastrou agora',
      '',
      `Cobrança: nada é cobrado nos 30 dias de teste. A primeira cobrança será em ${brDate(trialEndsAt)}, no cartão final ${cardNumber.slice(-4)}: ${chargeLine(promoPrice, plan.price, promoCycles)}.`,
      `Sem fidelidade: você pode cancelar a qualquer momento em Configurações > Minha assinatura. Se cancelar até ${brDate(trialEndsAt)}, nada será cobrado.`,
      'Avisaremos por e-mail alguns dias antes da primeira cobrança.',
      SIGN,
    ].join('\n'),
  )
  await sendMailWithSubject('contato@dentalpos.com.br', `Novo teste de 30 dias — ${clinicName}`, [`Clínica: ${clinicName}`, `Responsável: ${firstName} ${lastName}`, `Telefone: ${phone}`, `E-mail: ${email}`, `Plano: ${plan.name}`, `Primeira cobrança: ${brDate(trialEndsAt)}`].join('\n'))

  return {
    clinicId: created.clinicId,
    email,
    plan: plan.key,
    cardRegistered: true,
    trialEndsAt: trialEndsAt.toISOString(),
    firstChargeDate: trialEndsAt.toISOString(),
    firstChargeAmount: promoPrice,
    fullPrice: plan.price,
    promoCycles,
  }
}

// ---------- consulta e cancelamento ----------

export async function getSubscriptionView(clinicId: string) {
  const sub = await prisma.platformSubscription.findUnique({ where: { clinicId } })
  if (!sub || sub.status === 'PENDENTE' || sub.status === 'FALHOU') return { exists: false as const }
  const now = Date.now()
  let overdue: { total: number; invoiceUrl: string | null } | null = null
  if (sub.status === 'ATRASADA') {
    try {
      const list = await overduePayments(sub.asaasCustomerId)
      if (list.length) overdue = { total: round2(list.reduce((a, p) => a + p.value, 0)), invoiceUrl: list[0].invoiceUrl || null }
    } catch { /* o aviso aparece mesmo sem o link */ }
  }
  const inPromo = sub.promoCycles > 0 && sub.cyclesPaid < sub.promoCycles
  const accessUntil = sub.accessUntil
  const noCard = !sub.asaasSubscriptionId
  return {
    exists: true as const,
    status: sub.status,
    plan: sub.plan,
    planName: PLANS[sub.plan]?.name || sub.plan,
    trialEndsAt: sub.trialEndsAt.toISOString(),
    trialDaysLeft: sub.status === 'TESTE' ? Math.max(0, Math.ceil((sub.trialEndsAt.getTime() - now) / DAY_MS)) : 0,
    nextChargeAmount: inPromo ? Number(sub.promoPrice) : Number(sub.fullPrice),
    fullPrice: Number(sub.fullPrice),
    promoCyclesLeft: inPromo ? sub.promoCycles - sub.cyclesPaid : 0,
    cardBrand: sub.cardBrand,
    cardLast4: sub.cardLast4,
    canceled: sub.status === 'CANCELADA',
    canceledAt: sub.canceledAt?.toISOString() || null,
    accessUntil: accessUntil ? accessUntil.toISOString() : null,
    pastDue: sub.status === 'ATRASADA',
    overdue,
    readOnly: Boolean((sub.status === 'CANCELADA' && accessUntil && accessUntil.getTime() < now) || (noCard && sub.trialEndsAt.getTime() < now)),
    // Teste sem cartao: o contador de gratuidade continua; o cartao e cadastrado a qualquer momento.
    hasCard: Boolean(sub.asaasSubscriptionId),
    noCardTrial: noCard && sub.status === 'TESTE',
    trialExpired: noCard && sub.status === 'TESTE' && sub.trialEndsAt.getTime() < now,
    hasSavedCard: Boolean(sub.cardTokenEnc),
    debtAtCancel: Number(sub.debtAtCancel),
    minimumCommitment: false,
  }
}

export async function cancelSubscription(clinicId: string) {
  const sub = await prisma.platformSubscription.findUnique({ where: { clinicId } })
  if (!sub || sub.status === 'PENDENTE' || sub.status === 'FALHOU') throw new SubscriptionError('Esta clínica não tem assinatura ativa.', 404)
  if (sub.status === 'CANCELADA') return getSubscriptionView(clinicId)

  // Guarda o que estava vencido: cancelar nao apaga a divida (ela e cobrada na reativacao).
  let debt = 0
  try { debt = round2((await overduePayments(sub.asaasCustomerId)).reduce((a, p) => a + p.value, 0)) } catch { /* segue; a reativacao consulta o Asaas de novo */ }

  if (sub.asaasSubscriptionId) {
    try {
      await call(`/subscriptions/${sub.asaasSubscriptionId}`, { method: 'DELETE' })
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      // Ja removida no Asaas conta como cancelada.
      if (!/nao encontrad|não encontrad|not found|404/i.test(message)) {
        console.error('Falha ao cancelar assinatura no Asaas:', message)
        throw new SubscriptionError('Não foi possível cancelar agora. Tente de novo em alguns minutos.', 502)
      }
    }
  }

  await prisma.platformSubscription.update({ where: { id: sub.id }, data: { status: 'CANCELADA', canceledAt: new Date(), debtAtCancel: debt, lastEvent: 'CANCELADA_PELO_CLIENTE', updatedAt: new Date() } })
  blockCache.delete(clinicId)

  const admin = await prisma.user.findFirst({ where: { clinicId, role: 'ADMIN', isActive: true }, orderBy: { createdAt: 'asc' }, select: { email: true, firstName: true } })
  if (admin) {
    const until = sub.accessUntil ? brDate(sub.accessUntil) : brDate(new Date())
    await sendMailWithSubject(admin.email, 'Assinatura do DentalPos cancelada', [
      `Olá ${admin.firstName},`,
      '',
      'Sua assinatura do DentalPos foi cancelada e nenhuma nova cobrança será feita.',
      `Você continua com acesso completo até ${until}. Depois disso, seus dados ficam preservados e a conta passa a ser somente leitura.`,
      SIGN,
    ].join('\n'))
  }
  return getSubscriptionView(clinicId)
}

// ---------- cadastrar cartao durante (ou depois de) o teste sem cartao ----------

export interface AddCardInput {
  postalCode?: unknown; addressNumber?: unknown
  card?: { holderName?: unknown; number?: unknown; expiryMonth?: unknown; expiryYear?: unknown; ccv?: unknown }
}

// O cartao vai direto ao Asaas. Durante o teste a primeira cobranca fica para o fim dele; se o teste ja acabou, cobra no dia seguinte.
export async function addCardToTrial(clinicId: string, input: AddCardInput, remoteIp: string) {
  const sub = await prisma.platformSubscription.findUnique({ where: { clinicId } })
  if (!sub || sub.asaasSubscriptionId || !['TESTE', 'CANCELADA'].includes(sub.status)) throw new SubscriptionError('Esta clínica já tem cartão cadastrado ou não está em teste.', 409)
  const c = input.card || {}
  const number = digits(c.number)
  const holderName = text(c.holderName)
  const expiryMonth = digits(c.expiryMonth).padStart(2, '0')
  const expiryYear = digits(c.expiryYear)
  const ccv = digits(c.ccv)
  const postalCode = digits(input.postalCode)
  const addressNumber = text(input.addressNumber)
  if (!holderName || number.length < 13 || number.length > 19 || !luhn(number)) throw new SubscriptionError('Confira o número do cartão e o nome impresso nele.')
  if (!/^(0[1-9]|1[0-2])$/.test(expiryMonth) || expiryYear.length !== 4 || ccv.length < 3 || ccv.length > 4) throw new SubscriptionError('Confira a validade e o código de segurança do cartão.')
  if (postalCode.length !== 8 || !addressNumber) throw new SubscriptionError('Informe o CEP e o número do endereço de cobrança.')
  const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { email: true, phone: true, cnpj: true } })
  const admin = await adminOf(clinicId)
  if (!clinic || !admin) throw new SubscriptionError('Clínica não encontrada.', 404)
  const doc = digits(clinic.cnpj)
  if (doc.length !== 11 && doc.length !== 14) throw new SubscriptionError('O CPF/CNPJ da clínica não está cadastrado. Fale com o suporte.', 409)

  const now = new Date()
  const trialRunning = sub.trialEndsAt.getTime() > now.getTime()
  const firstDue = trialRunning ? sub.trialEndsAt : new Date(now.getTime() + DAY_MS)
  const discounted = promoActive() && sub.promoCycles > 0 && sub.cyclesPaid < sub.promoCycles
  const value = discounted ? Number(sub.promoPrice) : Number(sub.fullPrice)
  let asaasSubscriptionId: string | null = null
  try {
    const customer = await ensureCustomer(clinicId)
    const created = await call('/subscriptions', {
      method: 'POST',
      body: JSON.stringify({
        customer, billingType: 'CREDIT_CARD', value, nextDueDate: isoBrDate(firstDue), cycle: 'MONTHLY',
        description: `DentalPos - plano ${PLANS[sub.plan]?.name || sub.plan}`, externalReference: `sub:${sub.id}`,
        creditCard: { holderName, number, expiryMonth, expiryYear, ccv },
        creditCardHolderInfo: { name: holderName, email: admin.email, cpfCnpj: doc, postalCode, addressNumber, mobilePhone: digits(clinic.phone) },
        remoteIp,
      }),
    })
    asaasSubscriptionId = String(created.id)
    await prisma.platformSubscription.update({
      where: { id: sub.id },
      data: {
        status: 'TESTE', canceledAt: null, asaasCustomerId: customer, asaasSubscriptionId,
        cardBrand: created.creditCard?.creditCardBrand ? String(created.creditCard.creditCardBrand) : null,
        cardLast4: created.creditCard?.creditCardNumber ? digits(created.creditCard.creditCardNumber).slice(-4) : number.slice(-4),
        cardTokenEnc: sealToken(created.creditCard?.creditCardToken),
        trialEndsAt: trialRunning ? sub.trialEndsAt : firstDue,
        accessUntil: trialRunning ? sub.accessUntil : new Date(firstDue.getTime() + 3 * DAY_MS),
        reminderSentAt: null, lastEvent: 'CARTAO_CADASTRADO_NO_TESTE', updatedAt: new Date(),
      },
    })
  } catch (error) {
    if (asaasSubscriptionId) await call(`/subscriptions/${asaasSubscriptionId}`, { method: 'DELETE' }).catch(() => undefined)
    console.error('Falha ao cadastrar cartao no teste:', error instanceof Error ? error.message : 'erro')
    const msg = error instanceof Error ? error.message : ''
    throw new SubscriptionError(msg ? `Não foi possível validar o cartão: ${msg}` : 'Não foi possível validar o cartão. Confira os dados e tente de novo.', 402)
  }
  blockCache.delete(clinicId)
  await sendMailWithSubject(admin.email, 'Cartão cadastrado no DentalPos', [
    `Olá ${admin.firstName},`,
    '',
    trialRunning
      ? `Recebemos o seu cartão final ${number.slice(-4)}. Nada é cobrado agora: a primeira cobrança de ${brl(value)} será em ${brDate(firstDue)}, no fim do seu teste grátis.`
      : `Recebemos o seu cartão final ${number.slice(-4)}. A primeira cobrança de ${brl(value)} será em ${brDate(firstDue)} e seu acesso segue liberado.`,
    'Sem fidelidade: você pode cancelar a qualquer momento em Configurações > Minha assinatura.',
    SIGN,
  ].join('\n'))
  return getSubscriptionView(clinicId)
}

// ---------- reativar assinatura cancelada ----------

export interface ReactivateInput {
  useNewCard?: boolean
  postalCode?: unknown
  addressNumber?: unknown
  card?: { holderName?: unknown; number?: unknown; expiryMonth?: unknown; expiryYear?: unknown; ccv?: unknown }
}

// Reativa so com tudo em dia: cobra no cartao o que estava vencido e depois cria a nova assinatura (sem novo teste).
export async function reactivateSubscription(clinicId: string, input: ReactivateInput, remoteIp: string) {
  const sub = await prisma.platformSubscription.findUnique({ where: { clinicId } })
  if (!sub || sub.status !== 'CANCELADA' || !sub.asaasCustomerId) throw new SubscriptionError('Só dá para reativar uma assinatura cancelada.', 409)
  const customer = sub.asaasCustomerId
  const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { email: true, phone: true, cnpj: true, name: true } })
  const admin = await prisma.user.findFirst({ where: { clinicId, role: 'ADMIN' }, orderBy: { createdAt: 'asc' }, select: { email: true, firstName: true } })
  if (!clinic) throw new SubscriptionError('Clínica não encontrada.', 404)

  // 1) Cartao: o guardado ou um novo (que vira token no Asaas).
  let token = openToken(sub.cardTokenEnc)
  let cardBrand = sub.cardBrand
  let cardLast4 = sub.cardLast4
  if (input.useNewCard || !token) {
    const c = input.card || {}
    const number = digits(c.number)
    const holderName = text(c.holderName)
    const expiryMonth = digits(c.expiryMonth).padStart(2, '0')
    const expiryYear = digits(c.expiryYear)
    const ccv = digits(c.ccv)
    const postalCode = digits(input.postalCode)
    const addressNumber = text(input.addressNumber)
    if (!holderName || number.length < 13 || number.length > 19 || !luhn(number)) throw new SubscriptionError('Informe o cartão para reativar.')
    if (!/^(0[1-9]|1[0-2])$/.test(expiryMonth) || expiryYear.length !== 4 || ccv.length < 3 || ccv.length > 4) throw new SubscriptionError('Confira a validade e o código de segurança do cartão.')
    if (postalCode.length !== 8 || !addressNumber) throw new SubscriptionError('Informe o CEP e o número do endereço de cobrança.')
    try {
      const t = await call('/creditCard/tokenizeCreditCard', {
        method: 'POST',
        body: JSON.stringify({
          customer,
          creditCard: { holderName, number, expiryMonth, expiryYear, ccv },
          creditCardHolderInfo: { name: holderName, email: admin?.email || clinic.email, cpfCnpj: digits(clinic.cnpj), postalCode, addressNumber, mobilePhone: digits(clinic.phone) },
          remoteIp,
        }),
      })
      token = text(t.creditCardToken)
      cardBrand = t.creditCardBrand ? String(t.creditCardBrand) : cardBrand
      cardLast4 = t.creditCardNumber ? digits(t.creditCardNumber).slice(-4) : number.slice(-4)
    } catch (error) {
      console.error('Falha ao validar cartao na reativacao:', error instanceof Error ? error.message : 'erro')
      throw new SubscriptionError(`Não foi possível validar o cartão${error instanceof Error && error.message ? `: ${error.message}` : '.'}`, 402)
    }
    if (!token) throw new SubscriptionError('Não foi possível validar o cartão. Tente de novo.', 402)
  }

  // 2) Tudo em dia: paga o que estava vencido (cobrancas abertas e a divida guardada no cancelamento).
  const open = await overduePayments(customer)
  const today = isoBrDate(new Date())
  try {
    if (open.length) {
      for (const p of open) await call(`/payments/${p.id}/payWithCreditCard`, { method: 'POST', body: JSON.stringify({ creditCardToken: token, remoteIp }) })
    } else if (Number(sub.debtAtCancel) > 0) {
      await call('/payments', {
        method: 'POST',
        body: JSON.stringify({ customer, billingType: 'CREDIT_CARD', value: Number(sub.debtAtCancel), dueDate: today, description: 'DentalPos - mensalidade em atraso', externalReference: `debt:${sub.id}`, creditCardToken: token, remoteIp }),
      })
    }
  } catch (error) {
    console.error('Falha ao cobrar pendencia na reativacao:', error instanceof Error ? error.message : 'erro')
    throw new SubscriptionError('Não conseguimos cobrar o valor em atraso no cartão. Use outro cartão para reativar.', 402)
  }

  // 3) Nova assinatura, cobrando agora. Desconto so se a promocao ainda vale e ainda restam meses dele.
  const discounted = promoActive() && sub.cyclesPaid < sub.promoCycles
  const value = discounted ? Number(sub.promoPrice) : Number(sub.fullPrice)
  let created: any
  try {
    created = await call('/subscriptions', {
      method: 'POST',
      body: JSON.stringify({ customer, billingType: 'CREDIT_CARD', value, nextDueDate: today, cycle: 'MONTHLY', description: `DentalPos - plano ${PLANS[sub.plan]?.name || sub.plan}`, externalReference: `sub:${sub.id}`, creditCardToken: token, remoteIp }),
    })
  } catch (error) {
    console.error('Falha ao criar assinatura na reativacao:', error instanceof Error ? error.message : 'erro')
    throw new SubscriptionError(`Não foi possível reativar: ${error instanceof Error && error.message ? error.message : 'cartão recusado.'}`, 402)
  }

  await prisma.platformSubscription.update({
    where: { id: sub.id },
    data: {
      status: 'ATIVA', asaasSubscriptionId: String(created.id), canceledAt: null, debtAtCancel: 0,
      accessUntil: new Date(Date.now() + 33 * DAY_MS), cardBrand, cardLast4, cardTokenEnc: sealToken(token),
      ...(discounted ? {} : { promoCycles: sub.cyclesPaid, fullPriceAppliedAt: new Date() }),
      lastEvent: 'REATIVADA', updatedAt: new Date(),
    },
  })
  blockCache.delete(clinicId)

  if (admin) {
    await sendMailWithSubject(admin.email, 'Assinatura do DentalPos reativada', [
      `Olá ${admin.firstName},`,
      '',
      `Sua assinatura do DentalPos foi reativada. Cobramos ${brl(value)} no cartão final ${cardLast4 || '----'} e as próximas mensalidades seguem todo mês.`,
      'Sem fidelidade: você pode cancelar de novo a qualquer momento em Configurações > Minha assinatura.',
      SIGN,
    ].join('\n'))
  }
  return getSubscriptionView(clinicId)
}

// ---------- bloqueio depois do cancelamento (somente leitura) ----------

const blockCache = new Map<string, { until: number; blocked: boolean }>()

export async function subscriptionBlock(clinicId: string, action: string) {
  if (action === 'view') return null
  const hit = blockCache.get(clinicId)
  let blocked: boolean
  if (hit && hit.until > Date.now()) blocked = hit.blocked
  else {
    // Se a tabela ainda nao existir (SQL nao rodou), nao bloqueia ninguem.
    const sub = await prisma.platformSubscription.findUnique({ where: { clinicId }, select: { status: true, accessUntil: true, asaasSubscriptionId: true, trialEndsAt: true } }).catch(() => null)
    blocked = Boolean(sub && ((sub.status === 'CANCELADA' && sub.accessUntil && sub.accessUntil.getTime() < Date.now()) || (sub.status === 'TESTE' && !sub.asaasSubscriptionId && sub.trialEndsAt.getTime() < Date.now())))
    blockCache.set(clinicId, { until: Date.now() + 60_000, blocked })
  }
  if (!blocked) return null
  return { code: 'SUBSCRIPTION_ENDED', error: 'O período de teste ou o período pago terminou. Seus dados estão preservados e a conta está somente leitura. Cadastre o cartão em Configurações > Minha assinatura para continuar.' }
}

// ---------- webhook do Asaas ----------

async function adminOf(clinicId: string) {
  return prisma.user.findFirst({ where: { clinicId, role: 'ADMIN', isActive: true }, orderBy: { createdAt: 'asc' }, select: { email: true, firstName: true } })
}

async function applyFullPrice(sub: { id: string; asaasSubscriptionId: string | null; fullPrice: Prisma.Decimal }) {
  if (!sub.asaasSubscriptionId) return
  try {
    await call(`/subscriptions/${sub.asaasSubscriptionId}`, { method: 'PUT', body: JSON.stringify({ value: Number(sub.fullPrice), updatePendingPayments: true }) })
    await prisma.platformSubscription.update({ where: { id: sub.id }, data: { fullPriceAppliedAt: new Date(), lastEvent: 'VALOR_CHEIO_APLICADO', updatedAt: new Date() } })
  } catch (error) {
    // Fica pendente: a rotina diaria tenta de novo.
    console.error('Falha ao aplicar valor cheio na assinatura:', error instanceof Error ? error.message : error)
  }
}

export async function handleSubscriptionWebhook(body: any) {
  const event = String(body?.event || '')
  const payment = body?.payment || {}
  const asaasId = String(payment?.subscription || body?.subscription?.id || '')
  if (!asaasId) return { handled: false, reason: 'SEM_ASSINATURA' }
  const sub = await prisma.platformSubscription.findFirst({ where: { asaasSubscriptionId: asaasId } })
  if (!sub) return { handled: false, reason: 'ASSINATURA_NAO_ENCONTRADA' }

  if (event === 'PAYMENT_CONFIRMED' || event === 'PAYMENT_RECEIVED') {
    const paymentId = String(payment.id || '')
    if (!paymentId) return { handled: false, reason: 'SEM_PAGAMENTO' }
    for (let attempt = 0; attempt < 3; attempt++) {
      const current = await prisma.platformSubscription.findUnique({ where: { id: sub.id } })
      if (!current) return { handled: false }
      const paid = Array.isArray(current.paidPaymentIds) ? (current.paidPaymentIds as string[]) : []
      if (paid.includes(paymentId)) return { handled: true, repetido: true }
      const due = payment.dueDate ? new Date(`${payment.dueDate}T12:00:00-03:00`) : new Date()
      const paidThrough = new Date(due.getTime() + 33 * DAY_MS)
      const canceled = current.status === 'CANCELADA'
      const cyclesPaid = current.cyclesPaid + 1
      const res = await prisma.platformSubscription.updateMany({
        where: { id: current.id, cyclesPaid: current.cyclesPaid },
        data: {
          cyclesPaid, paidPaymentIds: [...paid, paymentId].slice(-40) as Prisma.InputJsonValue,
          ...(canceled ? {} : { status: 'ATIVA' }),
          accessUntil: current.accessUntil && current.accessUntil > paidThrough ? current.accessUntil : paidThrough,
          lastEvent: event, updatedAt: new Date(),
        },
      })
      if (res.count === 1) {
        if (!canceled && !current.fullPriceAppliedAt && cyclesPaid >= current.promoCycles) await applyFullPrice(current)
        blockCache.delete(current.clinicId)
        return { handled: true }
      }
    }
    return { handled: false, reason: 'CONCORRENCIA' }
  }

  if (event === 'PAYMENT_OVERDUE' || event === 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED') {
    if (sub.status !== 'CANCELADA') await prisma.platformSubscription.update({ where: { id: sub.id }, data: { status: 'ATRASADA', lastEvent: event, updatedAt: new Date() } })
    const admin = await adminOf(sub.clinicId)
    if (admin) {
      await sendMailWithSubject(admin.email, 'Não conseguimos cobrar sua mensalidade do DentalPos', [
        `Olá ${admin.firstName},`,
        '',
        'Não conseguimos cobrar a mensalidade do DentalPos no seu cartão.',
        payment.invoiceUrl ? `Para regularizar, use este link: ${payment.invoiceUrl}` : 'Entre no sistema, em Configurações > Minha assinatura, para ver o que fazer.',
        'Seus dados continuam seguros e o acesso segue liberado enquanto você regulariza.',
        SIGN,
      ].join('\n'))
    }
    return { handled: true }
  }

  if (event === 'SUBSCRIPTION_DELETED' || event === 'SUBSCRIPTION_INACTIVATED') {
    if (sub.status !== 'CANCELADA') await prisma.platformSubscription.update({ where: { id: sub.id }, data: { status: 'CANCELADA', canceledAt: new Date(), lastEvent: event, updatedAt: new Date() } })
    blockCache.delete(sub.clinicId)
    return { handled: true }
  }

  return { handled: false, reason: `EVENTO_IGNORADO:${event}` }
}

// ---------- rotina diaria (cron) ----------

// Aviso antes da primeira cobranca e nova tentativa de aplicar o valor cheio.
export async function processSubscriptionJobs() {
  const soon = new Date(Date.now() + 3 * DAY_MS)
  const reminders = await prisma.platformSubscription.findMany({ where: { status: 'TESTE', reminderSentAt: null, asaasSubscriptionId: { not: null }, trialEndsAt: { lte: soon } }, take: 100 })
  for (const sub of reminders) {
    const admin = await adminOf(sub.clinicId)
    if (admin) {
      await sendMailWithSubject(admin.email, 'Sua primeira cobrança do DentalPos é em breve', [
        `Olá ${admin.firstName},`,
        '',
        `Seu teste grátis termina em ${brDate(sub.trialEndsAt)}. Nessa data cobraremos ${brl(Number(sub.promoCycles > 0 ? sub.promoPrice : sub.fullPrice))} no cartão final ${sub.cardLast4 || '----'}${sub.promoCycles > 0 ? `, com 50% de desconto pelos próximos ${sub.promoCycles} meses (depois ${brl(Number(sub.fullPrice))} por mês)` : ''}.`,
        'Sem fidelidade: se não quiser continuar, cancele em Configurações > Minha assinatura antes dessa data e nada será cobrado. Você pode cancelar a qualquer momento.',
        SIGN,
      ].join('\n'))
    }
    await prisma.platformSubscription.update({ where: { id: sub.id }, data: { reminderSentAt: new Date(), updatedAt: new Date() } })
  }

  const noCardNotices = await processNoCardTrialNotices()

  const pendingFull = await prisma.platformSubscription.findMany({ where: { status: { in: ['ATIVA', 'ATRASADA'] }, fullPriceAppliedAt: null }, take: 100 })
  for (const sub of pendingFull) if (sub.cyclesPaid >= sub.promoCycles) await applyFullPrice(sub)

  return { reminders: reminders.length, noCardNotices, fullPriceRetries: pendingFull.length }
}

// Teste sem cartao: avisos por e-mail durante o teste (dia 7, dia 15, 3 dias antes e no ultimo dia) e um depois que acaba.
// Cada aviso sai uma unica vez (trialNotices). Se a rotina atrasar, sai so o mais recente e os anteriores contam como enviados.
const NOTICE_ORDER = ['D7', 'D15', 'D27', 'LAST', 'ENDED'] as const

export function noticesDue(trialEndsAt: Date, now = new Date()): string[] {
  const left = trialEndsAt.getTime() - now.getTime()
  const daysLeft = Math.ceil(left / DAY_MS)
  const daysUsed = TRIAL_DAYS - daysLeft
  if (left < 0) return now.getTime() - trialEndsAt.getTime() > 30 * DAY_MS ? [] : ['D7', 'D15', 'D27', 'LAST', 'ENDED']
  const due: string[] = []
  if (daysUsed >= 7) due.push('D7')
  if (daysUsed >= 15) due.push('D15')
  if (daysLeft <= 3) due.push('D27')
  if (daysLeft <= 1) due.push('LAST')
  return due
}

async function processNoCardTrialNotices() {
  const now = new Date()
  const subs = await prisma.platformSubscription.findMany({ where: { status: 'TESTE', asaasSubscriptionId: null }, take: 200 })
  let sent = 0
  for (const sub of subs) {
    const done = Array.isArray(sub.trialNotices) ? (sub.trialNotices as string[]) : []
    const due = noticesDue(sub.trialEndsAt, now)
    const pending = due.filter(k => !done.includes(k))
    if (!pending.length) continue
    const key = pending[pending.length - 1]
    const admin = await adminOf(sub.clinicId)
    if (admin) {
      const plan = PLANS[sub.plan]?.name || sub.plan
      const price = promoActive(now) && sub.promoCycles > 0 ? `${brl(Number(sub.promoPrice))} por mês nos primeiros ${sub.promoCycles} meses (50% de desconto) e ${brl(Number(sub.fullPrice))} depois` : `${brl(Number(sub.fullPrice))} por mês`
      const daysLeft = Math.max(0, Math.ceil((sub.trialEndsAt.getTime() - now.getTime()) / DAY_MS))
      const cta = 'Para cadastrar o cartão: entre em https://app.dentalpos.com.br/, abra Configurações > Minha assinatura e clique em "Cadastrar cartão". Nada é cobrado antes do fim do teste, não há fidelidade e você cancela quando quiser.'
      let subject = ''
      let lines: string[] = []
      if (key === 'ENDED') {
        subject = 'Seu teste grátis do DentalPos terminou: seus dados estão guardados'
        lines = ['Seu teste grátis terminou e sua conta está somente para leitura. Seus pacientes, agenda e financeiro continuam guardados.', `Para voltar a usar tudo (plano ${plan}: ${price}), cadastre o cartão.`, cta]
      } else if (key === 'LAST') {
        subject = 'Hoje é o último dia do seu teste grátis do DentalPos'
        lines = [`Hoje é o último dia do seu teste grátis (até ${brDate(sub.trialEndsAt)}). Depois dele a conta fica somente para leitura.`, `Cadastre o cartão agora para continuar sem interrupção e aproveitar as condições do plano ${plan}: ${price}.`, cta]
      } else if (key === 'D27') {
        subject = `Faltam ${daysLeft} dia(s) do seu teste grátis do DentalPos`
        lines = [`Seu teste grátis termina em ${brDate(sub.trialEndsAt)} (faltam ${daysLeft} dia(s)).`, `Cadastre o cartão para não perder o acesso e aproveitar as condições do plano ${plan}: ${price}.`, cta]
      } else {
        subject = key === 'D7' ? 'Como está sendo seu teste do DentalPos?' : 'Metade do seu teste grátis do DentalPos já passou'
        lines = [`Seu teste grátis vai até ${brDate(sub.trialEndsAt)} (faltam ${daysLeft} dia(s)).`, `Se está gostando, já pode cadastrar o cartão e garantir as condições do plano ${plan}: ${price}.`, cta]
      }
      await sendMailWithSubject(admin.email, subject, [`Olá ${admin.firstName},`, '', ...lines, SIGN].join('\n'))
      sent++
    }
    await prisma.platformSubscription.update({ where: { id: sub.id }, data: { trialNotices: [...new Set([...done, ...due])] as Prisma.InputJsonValue, updatedAt: new Date() } })
  }
  return sent
}
