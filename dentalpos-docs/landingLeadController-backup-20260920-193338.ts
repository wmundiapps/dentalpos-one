import type { Request, Response } from 'express'
import { dispatchRevah } from '../services/revahProviderService'

const ADMIN_EMAIL = 'contato@dentalpos.com.br'
const EXPERIENCE_URL = 'https://dentalpos-one.vercel.app/'

function resendCredentials() {
  const apiKey = process.env.RESEND_API_KEY || ''
  return {
    apiKey,
    from: 'DentalPos One <contato@dentalpos.com.br>',
  }
}

type LeadPayload = {
  nome?: string
  clinica?: string
  email?: string
  whatsapp?: string
  mensagem?: string
}

function validateLead(body: LeadPayload) {
  const nome = String(body.nome || '').trim()
  const email = String(body.email || '').trim()
  const whatsapp = String(body.whatsapp || '').trim()
  if (!nome || !email || !whatsapp) return null
  return {
    nome,
    clinica: String(body.clinica || '').trim(),
    email,
    whatsapp,
    mensagem: String(body.mensagem || '').trim(),
  }
}

export async function submitLead(req: Request, res: Response) {
  const lead = validateLead(req.body || {})
  if (!lead) {
    return res.status(400).json({ error: 'Informe nome, e-mail e WhatsApp.' })
  }

  const credentials = resendCredentials()
  if (!credentials.apiKey) {
    console.error('RESEND_API_KEY não configurada.')
    return res.status(500).json({ error: 'Envio de e-mail não configurado no servidor.' })
  }

  const adminContent = [
    'Novo interessado pela Landing Page do DentalPos One:',
    '',
    `Nome: ${lead.nome}`,
    `Clínica: ${lead.clinica || '(não informado)'}`,
    `E-mail: ${lead.email}`,
    `WhatsApp: ${lead.whatsapp}`,
    `Mensagem: ${lead.mensagem || '(sem mensagem)'}`,
  ].join('\n')

  const welcomeContent = [
    `Olá ${lead.nome},`,
    '',
    'Ficamos muito felizes com o seu interesse em testar o DentalPos One!',
    '',
    'Seu acesso ao EXPERIENCE — 30 dias completos, sem custo e sem compromisso — já está disponível:',
    EXPERIENCE_URL,
    '',
    'Nosso objetivo com o DentalPos One é que o sistema resolva a maior parte das tarefas do dia a dia da sua clínica — da agenda ao financeiro, do prontuário à comunicação com o paciente — para que você possa dedicar seu tempo ao que realmente importa: o atendimento.',
    '',
    'Durante o período de teste, dentro do próprio sistema, na última página do menu você vai encontrar um espaço dedicado exclusivamente para sugestões, elogios ou reclamações. Fique à vontade para nos contar o que funcionou bem, o que faltou, ou qualquer ideia que você tiver — nossa equipe analisa cada mensagem, e o que for aprovado entra em funcionamento em breve.',
    '',
    'Qualquer dúvida, estamos à disposição pelo WhatsApp: (44) 98453-5069.',
    '',
    'Bem-vindo(a) à experiência DentalPos One.',
    '',
    'Equipe DentalPos One',
    'Você só precisa atender.',
  ].join('\n')

  try {
    await dispatchRevah('EMAIL', ADMIN_EMAIL, adminContent, {
      ...credentials,
      subject: `Novo interessado — ${lead.nome}`,
    })
    await dispatchRevah('EMAIL', lead.email, welcomeContent, {
      ...credentials,
      subject: 'Bem-vindo ao DentalPos One — seu acesso está liberado',
    })
    return res.json({ ok: true })
  } catch (error) {
    console.error('Falha ao enviar e-mails da landing page:', error)
    return res.status(502).json({ error: 'Não foi possível enviar o e-mail agora.' })
  }
}

export async function submitEvent(req: Request, res: Response) {
  const lead = validateLead(req.body || {})
  if (!lead) {
    return res.status(400).json({ error: 'Dados incompletos.' })
  }
  const label = String((req.body || {}).label || 'Ação registrada')

  const credentials = resendCredentials()
  if (!credentials.apiKey) {
    return res.status(200).json({ ok: true })
  }

  const content = [
    `${label} — DentalPos One Landing Page`,
    '',
    `Nome: ${lead.nome}`,
    `Clínica: ${lead.clinica || '(não informado)'}`,
    `E-mail: ${lead.email}`,
    `WhatsApp: ${lead.whatsapp}`,
  ].join('\n')

  try {
    await dispatchRevah('EMAIL', ADMIN_EMAIL, content, {
      ...credentials,
      subject: label,
    })
  } catch (error) {
    console.error('Falha ao enviar evento da landing page:', error)
  }
  return res.json({ ok: true })
}