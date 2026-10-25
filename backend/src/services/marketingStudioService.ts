import { randomUUID } from 'crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { runAiTask } from './aiService'
import { checkBalance, credit, debit } from './creditService'
import { avatarConfigured, createAvatarVideo, getAvatarVideo } from './avatarVideoService'

// Estúdio de Marketing: agente que escreve post/story/reel e, se a clínica quiser,
// gera o vídeo com o avatar realista de quem autorizou. Usa a carteira de créditos "IA".

export type Formato = 'POST' | 'STORY' | 'REEL'
export type Conteudo = { legenda: string; hashtags: string[]; telas: { titulo: string; texto: string }[]; fala: string; ideiaVisual: string }
export type AvatarConfig = { avatarId: string; voiceId: string; pessoa: string; consentimentoEm: string; consentimentoPor: string }

// Créditos por vídeo de avatar (custo do provedor é bem maior que o de texto). Ajustável por variável de ambiente.
export const CREDITOS_AVATAR = Math.max(1, Number(process.env.AVATAR_CREDITOS || 25))
const MAX_AVATAR_DIA = Math.max(1, Number(process.env.AVATAR_MAX_DIA || 10))
const MAX_FALA = 700

const FORMATOS: Record<Formato, string> = {
  POST: 'um post de feed (1 imagem): 1 tela com título curto e texto de apoio',
  STORY: 'uma sequência de 3 stories: 3 telas, cada uma com título curto e frase curta',
  REEL: 'um reel de até 30 segundos: 4 telas curtas e uma fala narrada de 60 a 80 palavras',
}

const SISTEMA =
  'Voce e redator de marketing de clinicas odontologicas no Brasil. Escreva em portugues do Brasil, tom cordial e profissional. ' +
  'Siga as regras de publicidade do Conselho Federal de Odontologia: nao prometa resultado, nao use "antes e depois" sensacionalista, ' +
  'nao use precos promocionais apelativos, nao faca comparacao com outros profissionais, nao exponha paciente. ' +
  'Responda SOMENTE com JSON valido neste formato: {"legenda":string,"hashtags":string[],"telas":[{"titulo":string,"texto":string}],"fala":string,"ideiaVisual":string}. ' +
  'No campo "fala" escreva o texto que uma pessoa diria em voz alta, sem emojis, sem hashtags, sem simbolos.'

function lerJson(texto: string): Partial<Conteudo> | null {
  const i = texto.indexOf('{')
  const f = texto.lastIndexOf('}')
  if (i < 0 || f <= i) return null
  try { return JSON.parse(texto.slice(i, f + 1)) } catch { return null }
}

export async function gerarConteudo(input: { clinicId: string; tenantId: string; actorId: string; formato: Formato; tema: string; tom?: string }) {
  const clinica = await prisma.clinic.findFirst({ where: { id: input.clinicId, tenantId: input.tenantId }, select: { name: true, displayName: true, city: true } })
  const kit = await lerKit(input.clinicId, input.tenantId)
  const nome = clinica?.displayName || clinica?.name || 'a clinica'
  const prompt =
    `Clinica: ${nome}${clinica?.city ? `, em ${clinica.city}` : ''}.\n` +
    (typeof kit.data.tagline === 'string' && kit.data.tagline ? `Especialidades: ${kit.data.tagline}.\n` : '') +
    `Formato: ${FORMATOS[input.formato]}.\nTema: ${input.tema.slice(0, 400)}.\n` +
    `Tom: ${(input.tom || 'acolhedor e educativo').slice(0, 80)}.`

  const r = await runAiTask({ clinicId: input.clinicId, tenantId: input.tenantId, actorId: input.actorId, task: 'MARKETING', system: SISTEMA, prompt, maxTokens: 1800, referenceType: 'MARKETING_STUDIO' })
  if (!r.ok) return { ok: false as const, reason: r.reason || 'FALHA_PROVEDOR' }

  const j = lerJson(r.text || '')
  if (!j || typeof j.legenda !== 'string') return { ok: false as const, reason: 'RESPOSTA_INVALIDA' }
  const conteudo: Conteudo = {
    legenda: j.legenda,
    hashtags: Array.isArray(j.hashtags) ? j.hashtags.map(String).slice(0, 15) : [],
    telas: Array.isArray(j.telas) ? j.telas.slice(0, 6).map((t: any) => ({ titulo: String(t?.titulo || ''), texto: String(t?.texto || '') })) : [],
    fala: String(j.fala || '').slice(0, MAX_FALA),
    ideiaVisual: String(j.ideiaVisual || ''),
  }
  return { ok: true as const, conteudo }
}

/* ---------- Avatar da clínica (guardado no Kit da Clínica, chave "avatarIA") ---------- */

async function lerKit(clinicId: string, tenantId: string): Promise<{ data: Record<string, any> }> {
  try {
    const rows = await prisma.$queryRaw<{ data: Record<string, any> }[]>(Prisma.sql`SELECT "data" FROM "ClinicBrandKit" WHERE "clinicId"=${clinicId} AND "tenantId"=${tenantId} LIMIT 1`)
    return { data: rows[0]?.data || {} }
  } catch {
    return { data: {} }
  }
}

export async function lerAvatar(clinicId: string, tenantId: string): Promise<AvatarConfig | null> {
  const a = (await lerKit(clinicId, tenantId)).data.avatarIA
  return a && typeof a === 'object' && a.avatarId && a.voiceId && a.consentimentoEm ? (a as AvatarConfig) : null
}

// Une só a chave avatarIA ao kit, sem apagar o resto. Exige o SQL 20261023_kit_clinica.sql já rodado.
export async function salvarAvatar(clinicId: string, tenantId: string, actorId: string, cfg: AvatarConfig) {
  const json = JSON.stringify({ avatarIA: cfg })
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "ClinicBrandKit" ("id","clinicId","tenantId","data","updatedBy","createdAt","updatedAt")
    VALUES (${randomUUID()}, ${clinicId}, ${tenantId}, ${json}::jsonb, ${actorId}, NOW(), NOW())
    ON CONFLICT ("clinicId") DO UPDATE SET "data"="ClinicBrandKit"."data" || EXCLUDED."data", "updatedBy"=EXCLUDED."updatedBy", "updatedAt"=NOW()`)
}

/* ---------- Vídeo com avatar ---------- */

export async function criarVideoAvatar(input: { clinicId: string; tenantId: string; actorId: string; fala: string }) {
  if (!avatarConfigured()) return { ok: false as const, reason: 'AVATAR_NAO_CONFIGURADO' }
  const cfg = await lerAvatar(input.clinicId, input.tenantId)
  if (!cfg) return { ok: false as const, reason: 'SEM_AVATAR_AUTORIZADO' }

  const fala = input.fala.trim().slice(0, MAX_FALA)
  if (fala.length < 20) return { ok: false as const, reason: 'FALA_CURTA' }

  const inicioDia = new Date(); inicioDia.setUTCHours(0, 0, 0, 0)
  const hoje = await prisma.creditLedger.count({ where: { clinicId: input.clinicId, referenceType: 'AVATAR_VIDEO', movement: { not: 'ESTORNO' }, createdAt: { gte: inicioDia } } })
  if (hoje >= MAX_AVATAR_DIA) return { ok: false as const, reason: 'LIMITE_DIARIO' }

  const saldo = await checkBalance(input.clinicId, input.tenantId, 'IA', CREDITOS_AVATAR)
  if (!saldo.allowed) return { ok: false as const, reason: saldo.reason }

  const v = await createAvatarVideo({ avatarId: cfg.avatarId, voiceId: cfg.voiceId, text: fala })
  if (!v.ok) return { ok: false as const, reason: v.reason }

  // Só debita depois que o provedor aceitou o vídeo. O id do vídeo fica no extrato e prova que ele é desta clínica.
  const d = await debit({ clinicId: input.clinicId, tenantId: input.tenantId, kind: 'IA', units: CREDITOS_AVATAR, description: 'IA: vídeo com avatar', provider: 'AVATAR', referenceType: 'AVATAR_VIDEO', referenceId: v.videoId, actorId: input.actorId, idempotencyKey: `avatar:${v.videoId}` })
  if (!d.ok) return { ok: false as const, reason: d.reason }
  return { ok: true as const, videoId: v.videoId, creditos: CREDITOS_AVATAR }
}

export async function consultarVideoAvatar(input: { clinicId: string; tenantId: string; actorId: string; videoId: string }) {
  const dono = await prisma.creditLedger.findFirst({ where: { clinicId: input.clinicId, referenceType: 'AVATAR_VIDEO', referenceId: input.videoId, movement: { not: 'ESTORNO' } }, select: { id: true } })
  if (!dono) return null
  const v = await getAvatarVideo(input.videoId)
  if (v.status === 'FALHOU') {
    // Falha do provedor não custa crédito ao cliente. Idempotente: estorna uma vez só.
    await credit({ clinicId: input.clinicId, tenantId: input.tenantId, kind: 'IA', units: CREDITOS_AVATAR, description: 'IA: estorno de vídeo com avatar', movement: 'ESTORNO', referenceType: 'AVATAR_VIDEO', referenceId: input.videoId, actorId: input.actorId, idempotencyKey: `avatar-estorno:${input.videoId}` })
  }
  return v
}
