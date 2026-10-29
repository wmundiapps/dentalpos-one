// Gerador de peças e assistente de atendimento. Usa o cliente de IA compartilhado; sem chave, cai em geração SIMULADA determinística.
import { prisma } from '../../lib/prisma'
import { aiConfigured, callAIForJSON, callAIForText } from '../../services-ai/client'
import { db, marca, publicBase } from './common'
import { FORMATOS, gerarSvg, ehPedidoDeSaida } from './logic'

export interface BriefingIA { briefing: string; curso?: string; publico?: string; tom?: string; canal?: string; objetivo?: string; cta?: string; variacoes?: number; formatos?: string[]; tipos?: string[]; tenantId: string; clinicId?: string; userId?: string }
const cap = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s)

function simular(b: BriefingIA, m: Awaited<ReturnType<typeof marca>>) {
  const curso = b.curso || 'nossos cursos EAD'
  const pub = b.publico || 'quem quer estudar com flexibilidade'
  const cta = b.cta || 'Inscreva-se agora'
  const n = Math.max(1, Math.min(5, b.variacoes ?? 3))
  const ganchos = [`Estude ${curso} no seu ritmo`, `${curso}: sua carreira em movimento`, `Chegou a hora de começar ${curso}`, `Aprenda ${curso} onde e quando quiser`, `Seu próximo passo é ${curso}`]
  const prov = ['Aulas ao vivo e gravadas', 'Tutoria próxima e acompanhamento', 'Certificado reconhecido pelo MEC', 'Bolsas e condições especiais', 'Material atualizado por docentes experientes']
  return {
    copy: { titulo: ganchos[0], corpo: `${m.nome} apresenta ${curso} para ${pub}. ${prov[0]}, ${prov[1].toLowerCase()} e ${prov[2].toLowerCase()}. ${b.briefing ? cap(b.briefing, 160) : ''}`.trim(), cta },
    anuncios: Array.from({ length: n }, (_, i) => ({ variacao: i + 1, headline: cap(ganchos[i % ganchos.length], 40), descricao: cap(`${prov[i % prov.length]}. ${cta}.`, 90), cta })),
    roteiro: { duracaoSeg: 30, cenas: [
      { tempo: '0-5s', visual: `Estudante abre o notebook em casa; logotipo ${m.nome}`, narracao: `Você quer ${curso} sem abrir mão da sua rotina?` },
      { tempo: '5-15s', visual: 'Cortes rápidos: aula ao vivo, tutor respondendo, certificado', narracao: `${prov[0]}, ${prov[1].toLowerCase()} e ${prov[2].toLowerCase()}.` },
      { tempo: '15-25s', visual: 'Depoimento curto de aluno (com autorização de uso de imagem)', narracao: 'Quem começou, recomenda.' },
      { tempo: '25-30s', visual: `Tela final com marca ${m.nome} e botão de inscrição`, narracao: `${cta}. Acesse o site e fale com um consultor.` },
    ] },
    legendas: Array.from({ length: n }, (_, i) => ({ variacao: i + 1, texto: `${ganchos[i % ganchos.length]} ✨\n${prov[i % prov.length]}.\n👉 ${cta} — link na bio.`, hashtags: ['#EAD', '#Educação', `#${(b.curso || 'Estude').replace(/\W+/g, '')}`, '#Faculdade', '#Carreira'] })),
    email: { assunto: cap(`${ganchos[1]}`, 60), preheader: cap(prov[0] + ' · ' + prov[2], 90), corpo: `Olá, {{nome}}!\n\n${ganchos[0]}. ${prov[0]}, ${prov[1].toLowerCase()} e ${prov[2].toLowerCase()}.\n\n${cta}: responda esta mensagem ou fale com {{consultor}}.\n\nEquipe ${m.nome}` },
  }
}

/** briefing -> copy, anúncios, roteiro, legendas, e-mail e imagens (SVG com a marca). */
export async function gerarPecas(b: BriefingIA) {
  const m = await marca(b.tenantId)
  let conteudo = simular(b, m)
  let simulado = true
  if (aiConfigured()) {
    try {
      const r = await callAIForJSON<any>({
        system: `Você é redator publicitário de uma instituição de ensino superior brasileira (${m.nome}). Tom de voz: ${b.tom || m.tomDeVoz}. Não prometa resultados garantidos, não use dados pessoais reais, cumpra a LGPD e as regras do CONAR (sem promessas enganosas de emprego ou nota). Responda APENAS JSON com as chaves: copy{titulo,corpo,cta}, anuncios[{variacao,headline(<=40),descricao(<=90),cta}], roteiro{duracaoSeg,cenas[{tempo,visual,narracao}]}, legendas[{variacao,texto,hashtags[]}], email{assunto,preheader,corpo}.`,
        user: `Briefing: ${b.briefing}\nCurso: ${b.curso ?? '-'}\nPúblico: ${b.publico ?? '-'}\nObjetivo: ${b.objetivo ?? '-'}\nCTA: ${b.cta ?? '-'}\nCanal: ${b.canal ?? '-'}\nVariações: ${b.variacoes ?? 3}`,
        maxTokens: 2500, ctx: { tenantId: b.tenantId, clinicId: b.clinicId, actorId: b.userId, referenceType: 'MktPeca' },
      })
      if (r?.copy && Array.isArray(r.anuncios)) { conteudo = { ...conteudo, ...r }; simulado = false }
    } catch { /* cai no simulado */ }
  }
  const formatos = (b.formatos?.length ? b.formatos : ['FEED_1080', 'STORY_1080x1920', 'BANNER_1200x628']).filter((f) => FORMATOS[f])
  const imagens = formatos.map((f) => ({ formato: f, svg: gerarSvg({ formato: f, titulo: conteudo.copy.titulo, subtitulo: conteudo.anuncios[0]?.descricao, cta: conteudo.copy.cta, marca: m }) }))
  return { simulado, marca: m, ...conteudo, imagens }
}

// ---------------------------------------------------------------- assistente de atendimento
export const INTENCOES = ['SAUDACAO', 'MENSALIDADE', 'CURSOS', 'VESTIBULAR', 'INSCRICAO', 'EVENTOS', 'HUMANO', 'RECLAMACAO', 'SAIR', 'OUTRO'] as const
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
export function detectarIntencao(texto: string): { intencao: (typeof INTENCOES)[number]; confianca: number } {
  const t = norm(texto)
  if (ehPedidoDeSaida(texto)) return { intencao: 'SAIR', confianca: 1 }
  if (/(atendente|humano|consultor|pessoa|ligar|ligacao|telefonar|falar com)/.test(t)) return { intencao: 'HUMANO', confianca: 0.9 }
  if (/(reclama|absurdo|pessimo|processo|procon|cancelar contrato|insatisfeit|enganad)/.test(t)) return { intencao: 'RECLAMACAO', confianca: 0.9 }
  if (/(mensalidade|valor|preco|quanto custa|bolsa|desconto|parcela)/.test(t)) return { intencao: 'MENSALIDADE', confianca: 0.85 }
  if (/(vestibular|prova|enem|edital|processo seletivo)/.test(t)) return { intencao: 'VESTIBULAR', confianca: 0.85 }
  if (/(inscri|matricul|como entrar|quero estudar)/.test(t)) return { intencao: 'INSCRICAO', confianca: 0.8 }
  if (/(evento|palestra|open day|workshop|visita)/.test(t)) return { intencao: 'EVENTOS', confianca: 0.8 }
  if (/(curso|graduac|pos|ead|licenciatura|odontolog|administra|direito|pedagog|turno|modalidade)/.test(t)) return { intencao: 'CURSOS', confianca: 0.75 }
  if (/^(oi|ola|bom dia|boa tarde|boa noite|e ai|hello)\b/.test(t)) return { intencao: 'SAUDACAO', confianca: 0.9 }
  return { intencao: 'OUTRO', confianca: 0.2 }
}

async function contexto(tenantId: string) {
  const [ofertas, processos, eventos, faqs, inst] = await Promise.all([
    prisma.admOferta.findMany({ where: { tenantId, ativo: true, processo: { status: 'ABERTO' } }, orderBy: { nomeCurso: 'asc' }, take: 30 }).catch(() => []),
    prisma.admProcessoSeletivo.findMany({ where: { tenantId, status: 'ABERTO' }, take: 3 }).catch(() => []),
    db.mktEvento.findMany({ where: { tenantId, status: 'PUBLICADO', publico: true, inicio: { gte: new Date() } }, orderBy: { inicio: 'asc' }, take: 3 }),
    prisma.comFaq.findMany({ where: { tenantId, ativo: true }, take: 50 }).catch(() => []),
    prisma.eduInstitution.findUnique({ where: { tenantId }, select: { nome: true, nomeFantasia: true } }),
  ])
  return { ofertas, processos, eventos, faqs, inst }
}
const brl = (n: number) => 'R$ ' + n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
const dataBr = (d: Date) => d.toLocaleDateString('pt-BR')

export interface RespostaIA { texto: string; intencao: string; confianca: number; escalonar: boolean; motivo?: string; simulado: boolean }
export async function responder(tenantId: string, texto: string, hist: Array<{ autor: string; texto: string }> = [], extra: { clinicId?: string; site?: string } = {}): Promise<RespostaIA> {
  const { intencao, confianca } = detectarIntencao(texto)
  if (intencao === 'SAIR') return { texto: 'Tudo bem! Você não receberá mais mensagens de divulgação, em nenhum canal. Se mudar de ideia, é só pedir.', intencao, confianca, escalonar: false, simulado: true }
  if (intencao === 'HUMANO' || intencao === 'RECLAMACAO') return { texto: intencao === 'RECLAMACAO' ? 'Sinto muito pelo transtorno. Vou encaminhar agora para um consultor responsável, que retornará o quanto antes.' : 'Claro! Estou chamando um consultor para continuar este atendimento com você.', intencao, confianca, escalonar: true, motivo: intencao === 'RECLAMACAO' ? 'Reclamação/insatisfação' : 'Pedido de atendimento humano', simulado: true }
  const c = await contexto(tenantId)
  const nomeInst = c.inst?.nomeFantasia || c.inst?.nome || 'a instituição'
  // 1) FAQ cadastrada
  const t = norm(texto)
  const faq = c.faqs.find((f: any) => (f.palavrasChave ?? f.keywords ?? []).some?.((k: string) => t.includes(norm(k))) || norm(f.pergunta ?? '').split(' ').filter((w: string) => w.length > 5).some((w: string) => t.includes(w)))
  if (aiConfigured()) {
    try {
      const ctx = [
        `Instituição: ${nomeInst}`,
        ...c.ofertas.map((o: any) => `Curso: ${o.nomeCurso} | ${o.modalidade} | ${o.turno} | mensalidade ${brl(o.valorMensalidade)} em ${o.parcelas} parcelas | vagas ${o.vagas}`),
        ...c.processos.map((p: any) => `Processo seletivo aberto: ${p.nome} (inscrições até ${dataBr(p.inscricaoFim)})`),
        ...c.eventos.map((e: any) => `Evento: ${e.titulo} em ${dataBr(e.inicio)}`),
        ...c.faqs.slice(0, 15).map((f: any) => `FAQ: ${f.pergunta} -> ${f.resposta}`),
      ].join('\n')
      const out = await callAIForText({ system: `Você é a assistente virtual de admissões de ${nomeInst}. Responda em português do Brasil, em no máximo 4 frases, SOMENTE com base no contexto abaixo. Se a informação não estiver no contexto, diga que um consultor confirmará e termine com a palavra [ESCALAR]. Nunca peça CPF, senha ou dados de pagamento. Não prometa bolsa nem aprovação.\n${ctx}`, user: [...hist.slice(-6).map((h) => `${h.autor}: ${h.texto}`), `VISITANTE: ${texto}`].join('\n'), maxTokens: 400, ctx: { tenantId, clinicId: extra.clinicId, referenceType: 'MktAtendimento' } })
      const esc = /\[ESCALAR\]/.test(out)
      return { texto: out.replace(/\[ESCALAR\]/g, '').trim(), intencao, confianca: esc ? 0.3 : Math.max(confianca, 0.7), escalonar: esc, motivo: esc ? 'IA sem informação suficiente' : undefined, simulado: false }
    } catch { /* usa regras */ }
  }
  switch (intencao) {
    case 'SAUDACAO': return { texto: `Olá! Sou a assistente virtual de ${nomeInst}. Posso falar sobre cursos, mensalidades, vestibular e eventos. Como posso ajudar?`, intencao, confianca, escalonar: false, simulado: true }
    case 'MENSALIDADE': case 'CURSOS': {
      const achados = c.ofertas.filter((o: any) => t.includes(norm(o.nomeCurso).split(' ')[0]))
      const lista = (achados.length ? achados : c.ofertas).slice(0, 4)
      if (!lista.length) break
      const linhas = lista.map((o: any) => `${o.nomeCurso} (${String(o.modalidade).toLowerCase()}, ${String(o.turno).toLowerCase()}): ${brl(o.valorMensalidade)} em ${o.parcelas}x`).join('; ')
      return { texto: `${intencao === 'MENSALIDADE' ? 'Valores de referência' : 'Cursos com inscrições abertas'}: ${linhas}. Os valores podem ter bolsas e descontos — use o simulador de mensalidade no site ou peça para falar com um consultor.`, intencao, confianca, escalonar: false, simulado: true }
    }
    case 'VESTIBULAR': case 'INSCRICAO': {
      const p = c.processos[0]
      if (!p) break
      return { texto: `${p.nome}: inscrições até ${dataBr(p.inscricaoFim)}${p.provaData ? `, prova em ${dataBr(p.provaData)}` : ''}. Você pode se inscrever pelo site ou deixar seu contato que um consultor ajuda.`, intencao, confianca, escalonar: false, simulado: true }
    }
    case 'EVENTOS': {
      if (!c.eventos.length) return { texto: 'No momento não há eventos abertos, mas posso avisar quando houver — deixe seu contato (com autorização) ou fale com um consultor.', intencao, confianca, escalonar: false, simulado: true }
      return { texto: 'Próximos eventos: ' + c.eventos.map((e: any) => `${e.titulo} (${dataBr(e.inicio)})`).join('; ') + '. A inscrição é gratuita pelo site.', intencao, confianca, escalonar: false, simulado: true }
    }
  }
  if (faq) return { texto: faq.resposta, intencao: 'FAQ', confianca: 0.8, escalonar: false, simulado: true }
  return { texto: 'Não tenho essa informação com segurança. Vou pedir para um consultor confirmar e retornar para você.', intencao, confianca, escalonar: true, motivo: 'Sem resposta confiável', simulado: true }
}
void publicBase
