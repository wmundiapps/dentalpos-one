import { Request, Response } from 'express'
import ExcelJS from 'exceljs'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import {
  LANDING_URL,
  getConfig,
  handleClick,
  handleProviderEvent,
  handleUnsubscribe,
  isWebmail,
  logEvent,
  newToken,
  optOutLead,
  PUBLIC_BASE,
  runSequence,
  sendStep,
  sentToday,
  suppress,
} from '../services/prospectService'
import { blockedKeySet, insideSendWindow, isBlockedBy, whatsappNumber } from '../services/prospectBlock'
import { whatsappText } from '../services/prospectTemplates'
import { writeAudit } from '../services/auditService'
import { verifyGithubToken } from '../services/githubOidc'
import { twoFactorEnabled } from '../services/twoFactorService'

// ---------- Acesso: só equipe WMundi ----------
// WMUNDI_STAFF_EMAILS = lista separada por vírgula (ex.: "clinicaravel@gmail.com,contato@dentalpos.com.br").
// Se o projeto já tiver um middleware de staff WMundi, ele pode substituir esta checagem.
function isStaff(req: AuthRequest) {
  const allowed = String(process.env.WMUNDI_STAFF_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  const email = String(req.user?.email || '').toLowerCase()
  return Boolean(email) && allowed.includes(email)
}

// A equipe só entra com a verificação em 2 etapas ativa (STAFF_REQUIRE_2FA=0 desliga, para recuperação).
async function denyIfNotStaff(req: AuthRequest, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Não autenticado.' })
    return true
  }
  if (!isStaff(req)) {
    res.status(403).json({ error: 'Acesso restrito à equipe WMundi.' })
    return true
  }
  if (process.env.STAFF_REQUIRE_2FA !== '0' && !(await twoFactorEnabled(req.user.id))) {
    res.status(403).json({ code: 'TWO_FACTOR_REQUIRED', error: 'Ative a verificação em 2 etapas (Configurações, Segurança da conta) para usar a prospecção.', action: { to: '/configuracoes#duas-etapas', label: 'Ativar 2 etapas' } })
    return true
  }
  return false
}

type LeadWhere = NonNullable<NonNullable<Parameters<typeof prisma.prospectLead.findMany>[0]>['where']>
type ConfigData = Parameters<typeof prisma.prospectConfig.update>[0]['data']

const STATUSES = ['NOVO', 'EM_SEQUENCIA', 'SEQUENCIA_CONCLUIDA', 'QUENTE', 'RESPONDEU', 'CONVERTIDO', 'DESCADASTRADO', 'BOUNCE', 'EXCLUIDO']
const txt = (v: unknown, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '')

// ---------- Painel ----------
export async function stats(req: AuthRequest, res: Response) {
  if (await denyIfNotStaff(req, res)) return
  try {
    const grouped = await prisma.prospectLead.groupBy({ by: ['status'], _count: { _all: true } })
    const byStatus: Record<string, number> = {}
    for (const row of grouped) byStatus[row.status] = row._count._all
    const total = await prisma.prospectLead.count()
    const withEmail = await prisma.prospectLead.count({ where: { email: { not: null } } })
    const clicks = await prisma.prospectEvent.count({ where: { type: 'CLIQUE' } })
    const sentTotal = await prisma.prospectEvent.count({ where: { type: 'ENVIO' } })
    const config = await getConfig()
    return res.json({ total, withEmail, byStatus, clicks, sentTotal, sentToday: await sentToday(), config, landingUrl: LANDING_URL })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao carregar a prospecção.' })
  }
}

export async function list(req: AuthRequest, res: Response) {
  if (await denyIfNotStaff(req, res)) return
  try {
    const status = txt(req.query.status, 40)
    const q = txt(req.query.q, 120)
    const city = txt(req.query.city, 80)
    const page = Math.max(1, Number(req.query.page) || 1)
    const where: LeadWhere = {}
    if (status && STATUSES.includes(status)) where.status = status
    if (city) where.city = { contains: city, mode: 'insensitive' }
    if (q) {
      where.OR = [
        { displayName: { contains: q, mode: 'insensitive' } },
        { razaoSocial: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        ...(digits(q).length >= 4 ? [{ cnpj: { contains: digits(q) } }] : []),
      ]
    }
    const [rows, total] = await Promise.all([
      prisma.prospectLead.findMany({
        where,
        orderBy: [{ hotAt: { sort: 'desc', nulls: 'last' } }, { updatedAt: 'desc' }],
        skip: (page - 1) * 50,
        take: 50,
      }),
      prisma.prospectLead.count({ where }),
    ])
    return res.json({ rows, total, page, pageSize: 50 })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao listar leads.' })
  }
}

export async function events(req: AuthRequest, res: Response) {
  if (await denyIfNotStaff(req, res)) return
  try {
    const rows = await prisma.prospectEvent.findMany({ where: { leadId: String(req.params.id) }, orderBy: { createdAt: 'desc' }, take: 100 })
    return res.json(rows)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao carregar histórico.' })
  }
}

export async function updateLead(req: AuthRequest, res: Response) {
  if (await denyIfNotStaff(req, res)) return
  try {
    const id = String(req.params.id)
    const lead = await prisma.prospectLead.findUnique({ where: { id } })
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado.' })
    const status = txt(req.body?.status, 40)
    const notes = req.body?.notes === undefined ? undefined : txt(req.body.notes, 2000)
    if (status && !STATUSES.includes(status)) return res.status(400).json({ error: 'Status inválido.' })
    if (status === 'DESCADASTRADO' && status !== lead.status) {
      // Pediu para sair (por e-mail, WhatsApp ou telefone): bloqueia para sempre e apaga os contatos.
      await optOutLead(id, 'MANUAL', `Marcado como "não quer receber" por ${req.user?.email || 'equipe'}.`)
      if (notes !== undefined) await prisma.prospectLead.update({ where: { id }, data: { notes } })
      return res.json(await prisma.prospectLead.findUnique({ where: { id } }))
    }
    const row = await prisma.prospectLead.update({
      where: { id },
      data: { ...(status ? { status } : {}), ...(notes !== undefined ? { notes } : {}) },
    })
    if (status && status !== lead.status) {
      await logEvent(id, status === 'RESPONDEU' ? 'RESPOSTA' : 'STATUS', { detail: `Status ${lead.status} → ${status} por ${req.user?.email || 'equipe'}` })
      if (status === 'EXCLUIDO' && lead.email) await suppress(lead.email, 'MANUAL')
    }
    return res.json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao atualizar lead.' })
  }
}

export async function updateConfig(req: AuthRequest, res: Response) {
  if (await denyIfNotStaff(req, res)) return
  try {
    const b = req.body || {}
    const data: ConfigData = {}
    if (typeof b.sendingEnabled === 'boolean') data.sendingEnabled = b.sendingEnabled
    if (b.dailyLimit !== undefined) data.dailyLimit = Math.max(0, Math.min(500, Math.round(Number(b.dailyLimit) || 0)))
    if (b.step2AfterDays !== undefined) data.step2AfterDays = Math.max(1, Math.min(30, Math.round(Number(b.step2AfterDays) || 3)))
    if (b.step3AfterDays !== undefined) data.step3AfterDays = Math.max(2, Math.min(60, Math.round(Number(b.step3AfterDays) || 7)))
    if (typeof b.sendToWebmail === 'boolean') data.sendToWebmail = b.sendToWebmail
    if (typeof b.segments === 'string') {
      const segs = b.segments.split(',').map((s: string) => s.trim().toUpperCase()).filter((s: string) => s === 'CLINICA' || s === 'LABORATORIO')
      data.segments = segs.length ? segs.join(',') : 'CLINICA'
    }
    await getConfig()
    const row = await prisma.prospectConfig.update({ where: { id: 'default' }, data })
    return res.json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao salvar configuração.' })
  }
}

// A Receita guarda muito celular no formato antigo (DDD + 8 dígitos começando em 6 a 9): põe o 9 na frente.
function fixOldMobile(raw: string): string | null {
  if (!raw) return null
  const d = digits(raw)
  if (d.length === 10 && '6789'.includes(d[2])) {
    const n = `${d.slice(0, 2)}9${d.slice(2)}`
    return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`
  }
  return raw
}

// Recebe o JSON gerado pelo scripts/receita-prospects.mjs, em lotes (o painel manda de 500 em 500).
export async function importLeads(req: AuthRequest, res: Response) {
  if (await denyIfNotStaff(req, res)) return
  try {
    const items = Array.isArray(req.body?.leads) ? (req.body.leads as Array<Record<string, unknown>>) : []
    if (!items.length) return res.status(400).json({ error: 'Nenhum lead no arquivo.' })
    if (items.length > 1000) return res.status(400).json({ error: 'Envie no máximo 1000 leads por lote.' })
    const source = txt(req.body?.source, 120) || 'RECEITA_FEDERAL'

    const cnpjs = items.map((item) => digits(item.cnpj)).filter((c) => c.length === 14)
    const existing = new Set((await prisma.prospectLead.findMany({ where: { cnpj: { in: cnpjs } }, select: { cnpj: true } })).map((r) => r.cnpj))
    const emails = items.map((item) => txt(item.email, 200).toLowerCase()).filter(Boolean)
    const blocked = new Set((await prisma.prospectSuppression.findMany({ where: { email: { in: emails } }, select: { email: true } })).map((r) => r.email))
    const hashBlocked = await blockedKeySet(items.map((item) => ({ cnpj: txt(item.cnpj, 20), email: txt(item.email, 200), phone1: txt(item.phone1, 30), phone2: txt(item.phone2, 30) })))

    let created = 0
    let skipped = 0
    let blockedCount = 0
    for (const item of items) {
      const cnpj = digits(item.cnpj)
      if (cnpj.length !== 14 || existing.has(cnpj)) { skipped += 1; continue }
      const email = txt(item.email, 200).toLowerCase() || null
      const razaoSocial = txt(item.razaoSocial, 200)
      const displayName = txt(item.displayName, 200) || txt(item.nomeFantasia, 200) || razaoSocial
      const uf = txt(item.uf, 2).toUpperCase()
      if (!razaoSocial || !uf) { skipped += 1; continue }
      const isBlocked = Boolean(email && blocked.has(email)) || isBlockedBy(hashBlocked, { cnpj, email, phone1: txt(item.phone1, 30), phone2: txt(item.phone2, 30) })
      if (isBlocked) blockedCount += 1
      const lead = await prisma.prospectLead.create({
        data: {
          cnpj,
          razaoSocial,
          nomeFantasia: txt(item.nomeFantasia, 200) || null,
          displayName,
          email,
          emailType: email ? (isWebmail(email) ? 'WEBMAIL' : 'CORPORATIVO') : null,
          phone1: fixOldMobile(txt(item.phone1, 30)),
          phone2: fixOldMobile(txt(item.phone2, 30)),
          uf,
          city: txt(item.city, 120) || null,
          bairro: txt(item.bairro, 120) || null,
          cep: digits(item.cep).slice(0, 8) || null,
          address: txt(item.address, 300) || null,
          cnaePrincipal: txt(item.cnaePrincipal, 10) || null,
          segment: txt(item.segment, 20) === 'LABORATORIO' ? 'LABORATORIO' : 'CLINICA',
          naturezaJuridica: txt(item.naturezaJuridica, 10) || null,
          porte: txt(item.porte, 10) || null,
          openedAt: txt(item.openedAt, 10) || null,
          isMatriz: item.isMatriz !== false,
          source,
          status: isBlocked ? 'DESCADASTRADO' : email ? 'NOVO' : 'EXCLUIDO',
          token: newToken(),
          notes: email ? null : 'Sem e-mail na Receita (só telefone).',
        },
      })
      existing.add(cnpj)
      await logEvent(lead.id, 'IMPORTADO', { detail: `Origem: ${source}` })
      created += 1
    }
    return res.json({ created, skipped, blocked: blockedCount })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao importar leads.' })
  }
}

export async function runNow(req: AuthRequest, res: Response) {
  if (await denyIfNotStaff(req, res)) return
  try {
    const result = await runSequence({ force: req.body?.force === true, dryRun: req.body?.dryRun === true })
    return res.json(result)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Erro ao rodar a sequência.' })
  }
}

// Envia uma etapa para o e-mail informado (o seu), usando um lead real como modelo. Não muda status.
export async function sendTest(req: AuthRequest, res: Response) {
  if (await denyIfNotStaff(req, res)) return
  try {
    const to = txt(req.body?.to, 200)
    const step = Math.min(3, Math.max(1, Number(req.body?.step) || 1))
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return res.status(400).json({ error: 'Informe um e-mail válido para o teste.' })
    const lead = await prisma.prospectLead.findFirst({ where: { email: { not: null } }, orderBy: { createdAt: 'asc' } })
    if (!lead) return res.status(400).json({ error: 'Importe pelo menos um lead antes de testar.' })
    const id = await sendStep(lead, step, to)
    return res.json({ ok: true, providerId: id, modelLead: lead.displayName })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Erro ao enviar teste.' })
  }
}

// ---------- Excel com WhatsApp de um clique ----------
// O número da planilha não abre o WhatsApp direto: aponta para /p/w/<token>, que antes confere horário, um convite por pessoa e a lista de bloqueio.
export async function exportWhatsappSheet(req: AuthRequest, res: Response) {
  if (await denyIfNotStaff(req, res)) return
  try {
    const limite = Math.min(100, Math.max(1, Math.round(Number(req.query.limite) || 30)))
    const segmento = req.query.segmento === 'LABORATORIO' ? 'LABORATORIO' : req.query.segmento === 'CLINICA' ? 'CLINICA' : null
    const cidade = txt(req.query.cidade, 120)
    const invited = new Set((await prisma.prospectEvent.findMany({ where: { type: 'WHATSAPP' }, select: { leadId: true } })).map((e) => e.leadId))
    const pool = await prisma.prospectLead.findMany({
      where: { status: { notIn: ['DESCADASTRADO', 'EXCLUIDO', 'CONVERTIDO'] }, ...(segmento ? { segment: segmento } : {}), ...(cidade ? { city: { equals: cidade, mode: 'insensitive' as const } } : {}), OR: [{ phone1: { not: null } }, { phone2: { not: null } }] },
      take: 3000,
    })
    const blocked = await blockedKeySet(pool)
    const eligible = pool.filter((l) => !invited.has(l.id) && !isBlockedBy(blocked, l) && whatsappNumber(l.phone1, l.phone2))
    // Sorteia para não convidar sempre as mesmas cidades/bairros
    for (let i = eligible.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [eligible[i], eligible[j]] = [eligible[j], eligible[i]] }
    const picked = eligible.slice(0, limite)

    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Convites')
    ws.columns = [{ header: 'Clínica / laboratório', width: 38 }, { header: 'Cidade', width: 20 }, { header: 'Segmento', width: 14 }, { header: 'WhatsApp (clique para abrir)', width: 28 }, { header: 'Mensagem (já vai pronta no WhatsApp)', width: 90 }]
    ws.getRow(1).font = { bold: true }
    for (const l of picked) {
      const number = whatsappNumber(l.phone1, l.phone2) as string
      const row = ws.addRow([l.displayName, l.city || '', l.segment === 'LABORATORIO' ? 'Laboratório' : 'Clínica', '', whatsappText(l)])
      row.getCell(4).value = { text: `(${number.slice(2, 4)}) ${number.slice(4, 9)}-${number.slice(9)}`, hyperlink: `${PUBLIC_BASE}/p/w/${l.token}` }
      row.getCell(4).font = { color: { argb: 'FF1565C0' }, underline: true }
    }
    const help = wb.addWorksheet('Como usar')
    help.getColumn(1).width = 110
    ;[
      'Clique no número: o sistema confere o horário (8h às 21h), se a pessoa já foi convidada e se pediu para sair, e só então abre o WhatsApp com a mensagem pronta.',
      'Use um número só para convites (WhatsApp Business, chip ou fixo), 20 a 30 por dia no começo.',
      'Se a pessoa responder SAIR (ou pedir para não receber), marque "Não quer receber" no painel de prospecção: o número é bloqueado para sempre e apagado do registro.',
      'Contatos vindos dos dados públicos de CNPJ da Receita Federal, para contato comercial entre empresas (LGPD, legítimo interesse).',
    ].forEach((t) => help.addRow([t]))

    await writeAudit({ clinicId: req.user!.clinicId, tenantId: req.user!.tenantId, actorId: req.user!.id, module: 'prospect', action: 'EXPORT_WHATSAPP', summary: `${picked.length} contatos exportados para convite por WhatsApp${segmento ? ` (${segmento})` : ''}.` }).catch(() => undefined)
    const buffer = await wb.xlsx.writeBuffer()
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="convites-whatsapp-${new Date().toISOString().slice(0, 10)}.xlsx"`)
    return res.send(Buffer.from(buffer))
  } catch (error) {
    console.error('Falha ao gerar o Excel de convites:', error)
    return res.status(500).json({ error: 'Não foi possível gerar a planilha.' })
  }
}

// ---------- Rotas públicas (sem login) ----------
const escapeHtml = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

function page(title: string, message: string) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="font-family:Arial,sans-serif;background:#f4f6f8;margin:0;padding:40px 16px;color:#1f2933">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:10px;padding:28px">
<h1 style="font-size:20px;margin:0 0 12px">${title}</h1><p style="line-height:1.55;margin:0 0 12px">${message}</p>
<p style="font-size:13px;color:#7b8794;margin:0">CompletoDonto · contato@dentalpos.com.br</p></div></body></html>`
}

export async function publicClick(req: Request, res: Response) {
  const step = Math.min(3, Math.max(1, Number(req.query.s) || 1))
  try {
    await handleClick(String(req.params.token), step)
  } catch (error) {
    console.error('Falha ao registrar clique:', error)
  }
  const target = new URL(LANDING_URL)
  target.searchParams.set('utm_source', 'prospeccao')
  target.searchParams.set('utm_medium', 'email')
  target.searchParams.set('utm_campaign', 'receita-federal')
  target.searchParams.set('utm_content', `etapa-${step}`)
  return res.redirect(302, target.toString())
}

export async function publicWhatsapp(req: Request, res: Response) {
  try {
    if (!insideSendWindow()) return res.status(200).send(page('Fora do horário de convites', 'Convites só saem entre 8h e 21h (horário de Brasília). Volte a clicar no horário certo.'))
    const lead = await prisma.prospectLead.findUnique({ where: { token: String(req.params.token) } })
    if (!lead) return res.status(404).send(page('Link inválido', 'Este convite não existe mais.'))
    const blocked = await blockedKeySet([lead])
    if (['DESCADASTRADO', 'EXCLUIDO', 'CONVERTIDO'].includes(lead.status) || isBlockedBy(blocked, lead)) {
      return res.status(200).send(page('Não enviar', 'Esta pessoa pediu para não receber contato ou já é cliente. Nada foi aberto.'))
    }
    const number = whatsappNumber(lead.phone1, lead.phone2)
    if (!number) return res.status(200).send(page('Sem WhatsApp', 'Este contato não tem celular cadastrado.'))
    const already = await prisma.prospectEvent.findFirst({ where: { leadId: lead.id, type: 'WHATSAPP' } })
    if (already) return res.status(200).send(page('Convite já enviado', 'Esta pessoa já foi convidada por WhatsApp. Um convite por pessoa.'))
    await logEvent(lead.id, 'WHATSAPP', { detail: 'Convite por WhatsApp aberto pela equipe.' })
    return res.redirect(302, `https://wa.me/${number}?text=${encodeURIComponent(whatsappText(lead))}`)
  } catch (error) {
    console.error('Falha no convite por WhatsApp:', error)
    return res.status(500).send(page('Não foi possível abrir', 'Tente de novo em instantes.'))
  }
}

export async function publicUnsubscribe(req: Request, res: Response) {
  try {
    const lead = await handleUnsubscribe(String(req.params.token))
    if (req.method === 'POST') return res.status(200).send('ok')
    if (!lead) return res.status(404).send(page('Link inválido', 'Não encontramos este cadastro. Se quiser, escreva para contato@dentalpos.com.br que removemos manualmente.'))
    return res.send(page('Pronto, você não vai mais receber', `O e-mail ${escapeHtml(lead.email || '')} foi removido da nossa lista de contatos comerciais e não receberá novas mensagens. Desculpe o incômodo.`))
  } catch (error) {
    console.error('Falha no descadastro:', error)
    return res.status(500).send(page('Não foi possível concluir', 'Tente de novo em instantes ou escreva para contato@dentalpos.com.br que removemos manualmente.'))
  }
}

// Rodada de convites por e-mail pedida pelo GitHub Actions (de hora em hora): token OIDC do GitHub, sem senha guardada.
export async function cronGithub(req: Request, res: Response) {
  const token = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token || !(await verifyGithubToken(token, 'prospect-invites.yml', 'dentalpos-prospect-invites').catch(() => false))) {
    return res.status(401).json({ error: 'Não autorizado.' })
  }
  try {
    return res.json(await runSequence({ scheduled: true }))
  } catch (error) {
    console.error('Falha na rodada agendada de prospecção:', error)
    return res.status(500).json({ error: 'Falha na rodada.' })
  }
}

// Vercel Cron chama com "Authorization: Bearer <CRON_SECRET>".
export async function cron(req: Request, res: Response) {
  const secret = process.env.CRON_SECRET || ''
  if (!secret || req.get('authorization') !== `Bearer ${secret}`) return res.status(401).json({ error: 'Não autorizado.' })
  try {
    const result = await runSequence()
    return res.json(result)
  } catch (error) {
    console.error('Falha no cron de prospecção:', error)
    return res.status(500).json({ error: 'Falha no cron.' })
  }
}

// Webhook do Resend (bounce e reclamação de spam). URL: /p/webhook/resend?key=<RESEND_WEBHOOK_KEY>
export async function resendWebhook(req: Request, res: Response) {
  const key = process.env.RESEND_WEBHOOK_KEY || ''
  if (!key || req.query.key !== key) return res.status(401).json({ error: 'Não autorizado.' })
  try {
    const type = String(req.body?.type || '')
    const data = req.body?.data || {}
    const to = Array.isArray(data.to) ? data.to.map(String) : data.to ? [String(data.to)] : []
    await handleProviderEvent(type, String(data.email_id || ''), to)
    return res.json({ ok: true })
  } catch (error) {
    console.error('Falha no webhook do Resend:', error)
    return res.status(500).json({ error: 'Falha.' })
  }
}

