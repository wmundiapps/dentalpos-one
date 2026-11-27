import { prisma } from '../host2'
import { diffDias, dataBr, brl } from '../util'
import { BASE_CONHECIMENTO, type Artigo } from './conhecimento'

// Motor do Assistente Contábil: regras + base de conhecimento local. Funciona SEM chave externa.
// Garantias: (1) todas as respostas passam por `finalizar` e carregam os avisos obrigatórios; (2) pedidos sensíveis (sonegação/fraude)
// são recusados e nunca vão a LLM externo; (3) o parecer final é sempre humano (fila de revisão do contador).

export const AVISO_ASSISTENTE = 'Sou um assistente automatizado, não sou contador e esta resposta não substitui orientação profissional; valide com seu contador antes de decidir ou enviar qualquer coisa.'
export const avisoLgpd = (retencaoDias: number) => `Seus dados são tratados conforme a LGPD (Lei 13.709/2018): usamos o conteúdo desta conversa apenas para responder e para a revisão do contador (finalidade), não envie dados pessoais desnecessários (CPF, saúde, senhas), e as conversas são mantidas por ${retencaoDias} dias (retenção configurável) e depois apagadas. CPF, e-mail e telefone digitados são mascarados no registro.`

export const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const STOP = new Set('a o as os um uma uns umas de do da dos das em no na nos nas por para com sem que e ou se ao aos como qual quais quando onde meu minha meus minhas seu sua eu voce nos ele ela eles elas e foi ser ter tem ha mais menos muito pouco ja nao sim sobre entre ate isso isto esse essa este esta pode posso preciso quero gostaria saber favor'.split(' '))
export const tokens = (s: string) => norm(s).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((t) => t.length > 1 && !STOP.has(t))

// ---------------- detecção de pedido sensível (sonegação, fraude) ----------------
const PADROES_SENSIVEIS: RegExp[] = [
  /sonega/, /\bfraud/, /caixa\s*(2|dois)/, /nota\s*(fria|falsa)/, /falsific/, /\blaranja/, /lavagem\s+de\s+(dinheiro|capital)/, /omiti\w*\s+(receita|renda|faturamento|rendimento)/,
  /esconder\s+(renda|receita|dinheiro|bens|patrimonio|faturamento)/, /ocultar\s+(renda|receita|bens|patrimonio|faturamento)/, /nao\s+declarar\s+(renda|receita|bens|rendimento)/, /pagar\s+por\s+fora/,
  /despesa\s+falsa/, /recibo\s+falso/, /documento\s+falso/, /burlar\s+(a\s+)?(receita|fiscaliza|malha|fisco)/, /enganar\s+(o\s+)?(fisco|receita|fiscaliza)/, /fugir\s+(do\s+)?(fisco|imposto|fiscaliza)/,
  /evitar\s+(a\s+)?fiscaliza/, /(deixar|nao)\s+de\s+pagar\s+imposto\s+sem\s+ser\s+(pego|descoberto)/, /sem\s+ser\s+(pego|descoberto)/, /inflar\s+(despesa|gasto|custo)/, /simular\s+(venda|despesa|contrato)\s+para\s+(pagar\s+menos|reduzir)/,
]
export function detectarSensivel(texto: string): boolean {
  const t = norm(texto)
  return PADROES_SENSIVEIS.some((r) => r.test(t))
}
const RECUSA = 'Não posso ajudar com isso: o pedido envolve sonegação, ocultação de informações ou documentos falsos, e isso é ilegal (crime contra a ordem tributária) além de trazer risco sério para você e sua empresa. Posso, sim, explicar caminhos lícitos: planejamento tributário dentro da lei (escolha do regime, benefícios, fator R), regularização de pendências com parcelamento e autorregularização, e como organizar comprovantes. Se quiser, solicite a revisão do contador para analisar seu caso com segurança.'

// ---------------- busca na base ----------------
export interface Fonte { slug: string; titulo: string; score: number }
export function buscar(texto: string, base: Artigo[]): Array<{ artigo: Artigo; score: number }> {
  const q = tokens(texto)
  if (!q.length) return []
  const prefixo = (a: string, b: string) => a === b || (a.length >= 5 && b.length >= 5 && (a.startsWith(b.slice(0, 5)) || b.startsWith(a.slice(0, 5))))
  const pontuados = base.map((artigo) => {
    const kw = tokens(artigo.palavrasChave), ti = tokens(artigo.titulo), ct = new Set(tokens(artigo.conteudo))
    let score = 0
    for (const t of new Set(q)) {
      if (kw.some((k) => prefixo(k, t))) score += 3
      else if (ti.some((k) => prefixo(k, t))) score += 2
      else if (ct.has(t)) score += 1
    }
    return { artigo, score }
  })
  return pontuados.filter((p) => p.score >= 3).sort((a, b) => b.score - a.score)
}

// ---------------- contexto da empresa ----------------
export interface ContextoEmpresa {
  empresaId: string; nome: string | null
  alvaras: Array<{ tipo: string; validade: string | null; situacao: string; dias: number | null }>
  funcionarios: { ativos: number; emAdmissao: number; afastados: number }
  folha: { competencia: string; status: string; funcionarios: number; liquido: number } | null
  obrigacoes: Array<{ tipo: string; referencia: string; prazo: string; situacao: string }>
  abertura: { status: string; etapa: string; cnpj: string | null } | null
  declaracoes: Array<{ tipo: string; exercicio: number; status: string }>
}
export async function contextoEmpresa(tenantId: string, empresaId: string, nome?: string | null): Promise<ContextoEmpresa> {
  const hoje = new Date()
  const [alvaras, funcs, folha, obrig, ab, decl] = await Promise.all([
    prisma.ctbSocAlvara.findMany({ where: { tenantId, empresaId }, orderBy: { validade: 'asc' }, take: 20 }),
    prisma.ctbDpFuncionario.groupBy({ by: ['status'], where: { tenantId, empresaId }, _count: true }),
    prisma.ctbDpFolha.findFirst({ where: { tenantId, empresaId, tipo: 'MENSAL' }, orderBy: { competencia: 'desc' } }),
    prisma.ctbIrObrigacao.findMany({ where: { tenantId, empresaId, status: { notIn: ['CONFERIDA', 'ENTREGUE'] } }, orderBy: { prazo: 'asc' }, take: 6 }),
    prisma.ctbSocAbertura.findFirst({ where: { tenantId, empresaId }, orderBy: { createdAt: 'desc' } }),
    prisma.ctbIrDeclaracao.findMany({ where: { tenantId, empresaId }, orderBy: { exercicio: 'desc' }, take: 5 }),
  ])
  const c = (s: string) => funcs.find((f) => f.status === s)?._count ?? 0
  return {
    empresaId, nome: nome ?? ab?.nomeEmpresarial ?? null,
    alvaras: alvaras.map((a) => { const d = a.validade ? diffDias(a.validade, hoje) : null; return { tipo: a.tipo, validade: a.validade ? a.validade.toISOString().slice(0, 10) : null, situacao: a.status === 'DISPENSADO' ? 'DISPENSADO' : d != null && d < 0 ? 'VENCIDO' : a.status, dias: d } }),
    funcionarios: { ativos: c('ATIVO') + c('FERIAS'), emAdmissao: c('ADMISSAO'), afastados: c('AFASTADO') },
    folha: folha ? { competencia: folha.competencia, status: folha.status, funcionarios: ((folha.totais as any)?.funcionarios as number) ?? 0, liquido: ((folha.totais as any)?.liquido as number) ?? 0 } : null,
    obrigacoes: obrig.map((o) => ({ tipo: o.tipo, referencia: o.referencia, prazo: o.prazo.toISOString().slice(0, 10), situacao: diffDias(o.prazo, hoje) < 0 ? 'ATRASADA' : o.status })),
    abertura: ab ? { status: ab.status, etapa: ab.etapa, cnpj: ab.cnpj } : null,
    declaracoes: decl.map((d) => ({ tipo: d.tipo, exercicio: d.exercicio, status: d.status })),
  }
}

export function respostaComContexto(texto: string, ctx: ContextoEmpresa | null): string | null {
  if (!ctx) return null
  const t = norm(texto)
  const nome = ctx.nome || 'a empresa selecionada'
  const partes: string[] = []
  if (/alvara|licenca|vigilancia|bombeiro|validade|venc\w+\s+(do|da|de)?\s*(alvara|licenca)/.test(t) || /(quando|quais).*(vence|vencem|renov)/.test(t)) {
    if (!ctx.alvaras.length) partes.push(`Para ${nome} não há alvarás cadastrados no sistema.`)
    else partes.push(`Alvarás de ${nome} (dados cadastrados no sistema):\n` + ctx.alvaras.map((a) => `- ${a.tipo}: ${a.validade ? `validade ${dataBr(a.validade)}${a.dias != null ? (a.dias < 0 ? ` (VENCIDO há ${-a.dias} dias)` : ` (faltam ${a.dias} dias)`) : ''}` : 'sem validade cadastrada'} — ${a.situacao}`).join('\n'))
  }
  if (/folha|holerite|salario|funcionario|colaborador|empregado|pagamento de pessoal/.test(t)) {
    partes.push(`Pessoal de ${nome}: ${ctx.funcionarios.ativos} ativo(s), ${ctx.funcionarios.emAdmissao} em admissão, ${ctx.funcionarios.afastados} afastado(s).` + (ctx.folha ? ` Última folha: ${ctx.folha.competencia} (${ctx.folha.status}), ${ctx.folha.funcionarios} funcionário(s), líquido total estimado ${brl(ctx.folha.liquido)}.` : ' Ainda não há folha calculada.'))
  }
  if (/obrigac|prazo|ecd|ecf|dctf|efd|defis|dasn|entrega|atrasad/.test(t)) {
    partes.push(ctx.obrigacoes.length ? `Próximas obrigações de ${nome}:\n` + ctx.obrigacoes.map((o) => `- ${o.tipo} (${o.referencia}): prazo ${dataBr(o.prazo)} — ${o.situacao}`).join('\n') : `Não há obrigações acessórias pendentes cadastradas para ${nome}.`)
  }
  if (/abertura|abrir|cnpj|junta|viabilidade|inscricao/.test(t) && ctx.abertura) {
    partes.push(`Abertura de ${nome}: status ${ctx.abertura.status}, etapa ${ctx.abertura.etapa}${ctx.abertura.cnpj ? `; CNPJ SIMULADO ${ctx.abertura.cnpj} (fictício)` : '; CNPJ ainda não emitido (simulação)'}.`)
  }
  if (/imposto de renda|irpf|declaracao|restitu|malha/.test(t) && ctx.declaracoes.length) {
    partes.push(`Declarações de ${nome}: ` + ctx.declaracoes.map((d) => `${d.tipo} ${d.exercicio} (${d.status})`).join('; ') + '.')
  }
  return partes.length ? partes.join('\n\n') : null
}

export interface Resposta { texto: string; fontes: Fonte[]; sensivel: boolean; usouContexto: boolean; provedor: 'LOCAL' | 'LLM_EXTERNO'; semResposta: boolean }

export function finalizar(corpo: string, retencaoDias: number): string {
  return `${corpo.trim()}\n\nAviso: ${AVISO_ASSISTENTE}\nLGPD: ${avisoLgpd(retencaoDias)}`
}

/** Resposta 100% local. */
export function responderLocal(texto: string, base: Artigo[], ctx: ContextoEmpresa | null, retencaoDias: number): Resposta {
  if (detectarSensivel(texto)) return { texto: finalizar(RECUSA, retencaoDias), fontes: [], sensivel: true, usouContexto: false, provedor: 'LOCAL', semResposta: false }
  const achados = buscar(texto, base).slice(0, 2)
  const doCtx = respostaComContexto(texto, ctx)
  const partes: string[] = []
  if (doCtx) partes.push(doCtx)
  for (const a of achados) partes.push(`${a.artigo.titulo}\n${a.artigo.conteudo}`)
  if (!partes.length) {
    const saud = /^(oi|ola|bom dia|boa tarde|boa noite)\b/.test(norm(texto).trim())
    return { texto: finalizar(saud ? 'Olá! Sou o Assistente Contábil do EduMaster Pro. Posso explicar regimes tributários, guias e prazos, abertura de empresa, folha, férias, rescisão, MEI e imposto de renda, e consultar dados da empresa selecionada. Escreva sua dúvida.' : 'Não encontrei informação suficiente na minha base de conhecimento para responder com segurança. Reformule a pergunta (por exemplo: "qual o prazo da DCTF?" ou "como calcular rescisão sem justa causa?") ou clique em "Solicitar revisão do contador" para que uma pessoa responda.', retencaoDias), fontes: [], sensivel: false, usouContexto: false, provedor: 'LOCAL', semResposta: !saud }
  }
  return { texto: finalizar(partes.join('\n\n---\n\n') + '\n\nPara decisões ou envios, confirme com o contador; use o botão "Solicitar revisão do contador" se quiser um parecer humano.', retencaoDias), fontes: achados.map((a) => ({ slug: a.artigo.slug, titulo: a.artigo.titulo, score: a.score })), sensivel: false, usouContexto: !!doCtx, provedor: 'LOCAL', semResposta: false }
}

export const baseCompleta = (extras: Artigo[]): Artigo[] => {
  const slugs = new Set(extras.map((e) => e.slug))
  return [...extras, ...BASE_CONHECIMENTO.filter((b) => !slugs.has(b.slug))]
}
