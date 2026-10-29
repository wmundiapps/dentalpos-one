import { createHash } from 'crypto'
import { prisma } from '../../lib/prisma'
import { AiUnavailableError, aiConfigured, callAIForText, extractJson } from '../../services-ai/client'
import { Classificacao, classificarDemanda, contemSensivel, melhorResposta, redigirParaIa, resumirConversa, saudacao } from './logic'

// ============================================================
// Assistente de atendimento. Sem chave de IA usa o motor SIMULADO local (base de conhecimento + regras).
// LGPD: todo texto enviado a provedor externo passa por minimização (CPF, e-mail, telefone, nomes, RA) e textos com
// dado sensível (saúde, menores, biometria...) NUNCA saem do servidor. O registro de uso guarda só hash e contagens.
// ============================================================
export async function getIaConfig(tenantId: string) {
  return prisma.atdIaConfig.upsert({ where: { tenantId }, create: { tenantId }, update: {} })
}

export async function registrarUso(p: { tenantId: string; tipo: string; atendimentoId?: string | null; provedor: string; confianca?: number | null; escalonado?: boolean; sensivel?: boolean; redigidos?: number; entrada?: string; conhecimentoId?: string | null; userId?: string }) {
  return prisma.atdIaUso.create({
    data: {
      tenantId: p.tenantId, tipo: p.tipo, atendimentoId: p.atendimentoId ?? undefined, provedor: p.provedor, confianca: p.confianca ?? undefined, escalonado: !!p.escalonado, bloqueadoSensivel: !!p.sensivel,
      campoRedigidos: p.redigidos ?? 0, entradaHash: p.entrada ? createHash('sha256').update(p.entrada).digest('hex').slice(0, 24) : undefined, entradaChars: p.entrada?.length ?? 0, conhecimentoId: p.conhecimentoId ?? undefined, userId: p.userId,
    },
  })
}

const provedorAtual = () => (String(process.env.ANTHROPIC_API_KEY || '').trim() ? 'ANTHROPIC' : process.env.OPENAI_API_KEY ? 'OPENAI' : 'SIMULADO')

export interface RespostaIa {
  resposta: string | null
  confianca: number
  fonte: 'FAQ' | 'IA' | 'NENHUMA'
  conhecimentoId?: string
  servicoId?: string | null
  provedor: string
  bloqueadoSensivel: boolean
  redigidos: number
  escalonar: boolean
  motivo?: string
}

async function baseConhecimento(tenantId: string, soPublico: boolean) {
  return prisma.atdConhecimento.findMany({ where: { tenantId, ativo: true, ...(soPublico ? { publico: true } : {}) }, take: 400 })
}

/** Gera uma resposta a partir da base de conhecimento da instituição (com provedor externo só se houver chave e o texto for seguro). */
export async function responder(p: { tenantId: string; texto: string; tipo: 'SUGERIR_RESPOSTA' | 'RESPOSTA_AUTOMATICA' | 'CONSULTA_PORTAL'; atendimentoId?: string; nomes?: string[]; userId?: string; soPublico?: boolean; nomeSolicitante?: string | null }): Promise<RespostaIa> {
  const cfg = await getIaConfig(p.tenantId)
  const base: RespostaIa = { resposta: null, confianca: 0, fonte: 'NENHUMA', provedor: 'SIMULADO', bloqueadoSensivel: false, redigidos: 0, escalonar: true }
  if (!cfg.iaAtiva) return { ...base, motivo: 'Assistente de IA desativado para esta instituição.' }
  if (contemSensivel(p.texto)) {
    await registrarUso({ tenantId: p.tenantId, tipo: p.tipo, atendimentoId: p.atendimentoId, provedor: 'SIMULADO', escalonado: true, sensivel: true, entrada: p.texto, userId: p.userId })
    return { ...base, bloqueadoSensivel: true, motivo: 'Conteúdo com possível dado sensível (LGPD): não processado pela IA, encaminhado a atendente humano.' }
  }
  const kb = await baseConhecimento(p.tenantId, p.tipo !== 'SUGERIR_RESPOSTA' || !!p.soPublico)
  const m = melhorResposta(kb.map((k) => ({ id: k.id, pergunta: k.pergunta, resposta: k.resposta, palavrasChave: k.palavrasChave })), p.texto)
  const red = redigirParaIa(p.texto, cfg.enviarDadosPessoais ? [] : p.nomes ?? [])
  let out: RespostaIa = m
    ? { resposta: `${saudacao(p.nomeSolicitante)} ${m.faq.resposta}`, confianca: m.confianca, fonte: 'FAQ', conhecimentoId: m.faq.id, servicoId: kb.find((k) => k.id === m.faq.id)?.servicoId ?? null, provedor: 'SIMULADO', bloqueadoSensivel: false, redigidos: red.redigidos, escalonar: false }
    : { ...base, redigidos: red.redigidos, motivo: 'Nenhum artigo da base de conhecimento corresponde à pergunta.' }

  // Provedor real (opcional): só reescreve/consolida a partir dos artigos mais próximos, com texto minimizado.
  if (aiConfigured() && kb.length && (!m || m.confianca < 0.9)) {
    try {
      const topo = kb.slice(0, 0)
      void topo
      const ctx = kb.map((k) => `P: ${k.pergunta}\nR: ${k.resposta}`).join('\n\n').slice(0, 7000)
      const raw = await callAIForText({
        system: 'Você é o assistente de atendimento de uma instituição de ensino superior brasileira. Responda em português, no máximo 5 linhas, SOMENTE com base na base de conhecimento fornecida; não invente prazos, valores ou políticas. Dados pessoais foram substituídos por marcadores como [CPF]/[NOME]: nunca tente recuperá-los. Retorne JSON: {"resposta": string, "confianca": número de 0 a 1}. Se a base não permitir responder, retorne {"resposta":"","confianca":0}.\n\nBASE:\n' + ctx,
        user: red.texto.slice(0, 800), maxTokens: 500, ctx: { tenantId: p.tenantId, referenceType: 'AtdAtendimento', referenceId: p.atendimentoId },
      })
      const j = JSON.parse(extractJson(raw))
      const conf = Math.max(0, Math.min(1, Number(j.confianca) || 0))
      if (j.resposta && conf > out.confianca) out = { ...out, resposta: `${saudacao(p.nomeSolicitante)} ${String(j.resposta).slice(0, 1200)}`, confianca: conf, fonte: 'IA', provedor: provedorAtual(), escalonar: false }
    } catch (e) {
      if (!(e instanceof AiUnavailableError)) console.error('[atd-ia]', (e as any)?.message)
    }
  }
  const minimo = p.tipo === 'RESPOSTA_AUTOMATICA' || p.tipo === 'CONSULTA_PORTAL' ? cfg.confiancaMinima : 0.2
  out.escalonar = !out.resposta || out.confianca < minimo
  if (out.escalonar && out.resposta && p.tipo !== 'SUGERIR_RESPOSTA') out.motivo = `Confiança ${out.confianca.toFixed(2)} abaixo do mínimo ${minimo.toFixed(2)}: escalonado para humano.`
  await registrarUso({ tenantId: p.tenantId, tipo: p.tipo, atendimentoId: p.atendimentoId, provedor: out.provedor, confianca: out.confianca, escalonado: out.escalonar, redigidos: out.redigidos, entrada: p.texto, conhecimentoId: out.conhecimentoId, userId: p.userId })
  if (out.conhecimentoId && !out.escalonar) await prisma.atdConhecimento.update({ where: { id: out.conhecimentoId }, data: { usos: { increment: 1 } } }).catch(() => undefined)
  return out
}

export async function classificar(p: { tenantId: string; texto: string; atendimentoId?: string; userId?: string }): Promise<Classificacao> {
  const [setores, servicos] = await Promise.all([
    prisma.atdSetor.findMany({ where: { tenantId: p.tenantId, ativo: true }, select: { id: true, codigo: true, nome: true, palavrasChave: true } }),
    prisma.atdServico.findMany({ where: { tenantId: p.tenantId, ativo: true }, select: { id: true, codigo: true, nome: true, descricao: true, setorId: true, autoatendimento: true } }),
  ])
  const c = classificarDemanda(p.texto, setores, servicos)
  await registrarUso({ tenantId: p.tenantId, tipo: 'CLASSIFICAR', atendimentoId: p.atendimentoId, provedor: 'SIMULADO', confianca: c.confianca, entrada: p.texto, userId: p.userId })
  return c
}

export async function resumir(p: { tenantId: string; atendimentoId: string; userId?: string }) {
  const msgs = await prisma.atdMensagem.findMany({ where: { tenantId: p.tenantId, atendimentoId: p.atendimentoId, direcao: { not: 'NOTA_INTERNA' } }, orderBy: { createdAt: 'asc' }, take: 200 })
  const resumo = resumirConversa(msgs)
  await registrarUso({ tenantId: p.tenantId, tipo: 'RESUMIR', atendimentoId: p.atendimentoId, provedor: 'SIMULADO', entrada: resumo, userId: p.userId })
  return resumo
}
