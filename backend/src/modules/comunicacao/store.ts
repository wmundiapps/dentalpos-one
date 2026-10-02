import { prisma } from '../../lib/prisma'
import { decryptSecret, encryptSecret } from '../../services/secretVault'
import { Cfg, faltandoCampos } from './adapters'
import { normalizePhone, onlyDigits, podeEnviar, PrefLinha } from './pure'

const db = prisma as any

export async function getConfig(tenantId: string) {
  const c = await prisma.comConfig.findUnique({ where: { tenantId } })
  return c ?? (await prisma.comConfig.create({ data: { tenantId } }))
}

export function lerCfg(canal: { configCifrada: string | null }): { cfg: Cfg | null; erro?: string } {
  if (!canal.configCifrada) return { cfg: null }
  try {
    return { cfg: decryptSecret<Cfg>(canal.configCifrada) }
  } catch (e: any) {
    return { cfg: null, erro: `Não foi possível decifrar as credenciais (${e?.message || 'chave mestra ausente/alterada'}).` }
  }
}

export function gravarCfg(tipo: string, provedor: string, cfg: Cfg) {
  const faltam = faltandoCampos(tipo, provedor, cfg)
  return { configCifrada: encryptSecret(cfg), configurado: faltam.length === 0, faltam }
}

// Canal ativo+configurado do tenant para o tipo. Prefere o mais recentemente atualizado.
export async function canalAtivo(tenantId: string, tipo: string) {
  return prisma.comCanal.findFirst({ where: { tenantId, tipo: tipo as any, ativo: true, configurado: true }, orderBy: { updatedAt: 'desc' } })
}

export function publicBase(): string {
  return String(process.env.PUBLIC_API_URL || 'https://api.dentalpos.com.br').replace(/\/$/, '')
}
export function webhookUrl(canalId: string, sufixo = ''): string {
  return `${publicBase()}/api/public/edu/comunicacao/webhook/${canalId}${sufixo}`
}

// ---------------------------------------------------------------- contatos
export async function acharContatoPorCanal(tenantId: string, tipoCanal: string, chave: string, extra: { telefone?: string; email?: string } = {}) {
  const tel = normalizePhone(extra.telefone ?? (['WHATSAPP', 'SMS', 'VOZ'].includes(tipoCanal) ? chave : null))
  switch (tipoCanal) {
    case 'WHATSAPP':
    case 'SMS':
    case 'VOZ':
      return tel ? prisma.comContato.findFirst({ where: { tenantId, telefone: tel, ativo: true } }) : null
    case 'TELEGRAM': {
      const c = await prisma.comContato.findFirst({ where: { tenantId, telegramChatId: chave } })
      if (c) return c
      return tel ? prisma.comContato.findFirst({ where: { tenantId, telefone: tel } }) : null
    }
    case 'EMAIL':
      return prisma.comContato.findFirst({ where: { tenantId, email: { equals: (extra.email ?? chave).toLowerCase(), mode: 'insensitive' } } })
    case 'INSTAGRAM':
      return prisma.comContato.findFirst({ where: { tenantId, instagramId: chave } })
    case 'FACEBOOK':
      return prisma.comContato.findFirst({ where: { tenantId, facebookId: chave } })
    case 'SITE_CHAT':
      return prisma.comContato.findFirst({ where: { tenantId, tags: { has: `sitechat:${chave}` } } })
  }
  return null
}

export async function acharOuCriarContato(tenantId: string, tipoCanal: string, chave: string, nome?: string, extra: { telefone?: string; email?: string } = {}) {
  const existente = await acharContatoPorCanal(tenantId, tipoCanal, chave, extra)
  if (existente) {
    // vincula o identificador do canal se ainda não existir
    const patch: any = {}
    if (tipoCanal === 'TELEGRAM' && !existente.telegramChatId) patch.telegramChatId = chave
    if (tipoCanal === 'INSTAGRAM' && !existente.instagramId) patch.instagramId = chave
    if (tipoCanal === 'FACEBOOK' && !existente.facebookId) patch.facebookId = chave
    return Object.keys(patch).length ? prisma.comContato.update({ where: { id: existente.id }, data: patch }) : existente
  }
  const data: any = { tenantId, nome: nome || 'Contato sem nome', tipo: 'OUTRO' }
  const tel = normalizePhone(extra.telefone ?? (['WHATSAPP', 'SMS', 'VOZ'].includes(tipoCanal) ? chave : null))
  if (tel) data.telefone = tel
  if (tipoCanal === 'EMAIL') data.email = (extra.email ?? chave).toLowerCase()
  if (tipoCanal === 'TELEGRAM') data.telegramChatId = chave
  if (tipoCanal === 'INSTAGRAM') data.instagramId = chave
  if (tipoCanal === 'FACEBOOK') data.facebookId = chave
  if (tipoCanal === 'SITE_CHAT') {
    data.tags = [`sitechat:${chave}`]
    data.nome = nome || 'Visitante do site'
  }
  // tenta vincular a um candidato (tolerante: módulo admissões pode não ter dados)
  try {
    if (tel || data.email) {
      const cand = await db.admCandidato.findFirst({
        where: { tenantId, OR: [...(data.email ? [{ email: { equals: data.email, mode: 'insensitive' } }] : []), ...(tel ? [{ telefone: { contains: tel.slice(-9) } }] : [])] },
        select: { id: true, nome: true },
      })
      if (cand) {
        data.candidatoId = cand.id
        data.tipo = 'CANDIDATO'
        if (!nome) data.nome = cand.nome
      }
    }
  } catch {
    /* admissões indisponível */
  }
  return prisma.comContato.create({ data })
}

// Resolve o contato (e destino por canal) de uma notificação da caixa de saída.
export async function contatoDaNotificacao(n: { tenantId: string; studentId: string | null; userId: string | null; destino: string | null; canal: string }) {
  let contato: any = null
  if (n.studentId) contato = await prisma.comContato.findFirst({ where: { tenantId: n.tenantId, studentId: n.studentId } })
  if (!contato && n.userId) contato = await prisma.comContato.findFirst({ where: { tenantId: n.tenantId, userId: n.userId } })
  if (!contato && n.destino) contato = await acharContatoPorCanal(n.tenantId, n.canal, n.destino)
  let email: string | null = contato?.email ?? null
  let telefone: string | null = contato?.telefone ?? null
  let telegramChatId: string | null = contato?.telegramChatId ?? null
  // fallback: dados do usuário vinculado (Student.userId ou userId direto)
  if ((!email || !telefone) && (n.userId || n.studentId)) {
    try {
      let uid = n.userId
      if (!uid && n.studentId) uid = (await prisma.student.findFirst({ where: { id: n.studentId, tenantId: n.tenantId }, select: { userId: true } }))?.userId ?? null
      if (uid) {
        const u = await prisma.user.findFirst({ where: { id: uid, tenantId: n.tenantId }, select: { email: true, phone: true } })
        email = email ?? u?.email ?? null
        telefone = telefone ?? normalizePhone(u?.phone)
      }
    } catch {
      /* ignora */
    }
  }
  return { contato, email, telefone, telegramChatId }
}

// ---------------------------------------------------------------- consentimento
export async function checarConsentimento(tenantId: string, contatoId: string | null | undefined, canal: string, finalidade: string) {
  if (!contatoId) return { ok: true }
  const prefs = (await prisma.comPreferencia.findMany({ where: { tenantId, contatoId } })) as PrefLinha[]
  return podeEnviar(prefs, canal, finalidade)
}

export async function registrarPreferencia(p: { tenantId: string; contatoId: string; canal?: string; finalidade?: string; consentimento: boolean; origem?: string; motivo?: string }) {
  const canal = p.canal ?? '*'
  const finalidade = p.finalidade ?? 'MARKETING'
  return prisma.comPreferencia.upsert({
    where: { tenantId_contatoId_canal_finalidade: { tenantId: p.tenantId, contatoId: p.contatoId, canal, finalidade } },
    create: { tenantId: p.tenantId, contatoId: p.contatoId, canal, finalidade, consentimento: p.consentimento, origem: p.origem, motivo: p.motivo },
    update: { consentimento: p.consentimento, origem: p.origem, motivo: p.motivo, registradoEm: new Date() },
  })
}

// Dados de variáveis de template a partir do contato/aluno.
export async function variaveisDoContato(tenantId: string, c: { nome?: string | null; studentId?: string | null }): Promise<Record<string, string>> {
  const vars: Record<string, string> = { nome: (c.nome || '').split(' ')[0] || '', nome_completo: c.nome || '' }
  if (c.studentId) {
    try {
      const mat = await db.enrollment.findFirst({ where: { studentId: c.studentId, status: 'ATIVA' }, include: { program: { select: { nome: true } } }, orderBy: { dataMatricula: 'desc' } })
      if (mat?.program?.nome) vars.curso = mat.program.nome
      const st = await prisma.student.findFirst({ where: { id: c.studentId, tenantId }, select: { ra: true } })
      if (st) vars.ra = st.ra
    } catch {
      /* acadêmico indisponível */
    }
  }
  return vars
}

export { onlyDigits }
