// Motor de execução: aplica as barreiras, chama o modelo de IA (qualquer provedor), roda ferramentas permitidas,
// manda o que é sensível para aprovação humana, cobra créditos e registra tudo.

import {
  RESPOSTAS_SEGURAS,
  dentroDaJanela,
  detectarOptOut,
  mascarar,
  pediuHumano,
  perguntouSeERobo,
  reclamacaoGrave,
  urgenciaDeSaude,
  verificarSaida,
} from './barreiras.ts'
import type { AgenteDef, EntradaExecucao, PerfilNegocio, Resultado } from './types.ts'

const MAX_VOLTAS = 3

export function montarSistema(agente: AgenteDef, perfil: PerfilNegocio): string {
  const linhas = [
    agente.instrucoes,
    '',
    `Negócio: ${perfil.nome} (${perfil.vertical}).`,
    perfil.horario ? `Horário de atendimento: ${perfil.horario}.` : '',
    perfil.endereco ? `Endereço: ${perfil.endereco}.` : '',
    perfil.servicos?.length ? `Serviços: ${perfil.servicos.join(', ')}.` : '',
    perfil.politicas ? `Políticas: ${perfil.politicas}` : '',
    perfil.linkAvaliacao ? `Link de avaliação: ${perfil.linkAvaliacao}` : '',
    perfil.tom ? `Tom de voz: ${perfil.tom}.` : '',
    perfil.precosPermitidos && Object.keys(perfil.precosPermitidos).length
      ? `Preços que você pode informar: ${Object.entries(perfil.precosPermitidos)
          .map(([k, v]) => `${k} = ${v}`)
          .join('; ')}.`
      : 'Você NÃO pode informar preços.',
    `Ferramentas que você pode usar: ${agente.ferramentas.map((f) => f.nome).join(', ')}.`,
  ]
  return linhas.filter(Boolean).join('\n')
}

function resultadoBase(): Resultado {
  return { resposta: null, acoes: [], transferirParaHumano: false, optOut: false, creditosUsados: 0, aprovacoesPendentes: [] }
}

export async function executar(e: EntradaExecucao): Promise<Resultado> {
  const agora = e.agora ?? new Date()
  const r = resultadoBase()

  const finalizar = async (motivo?: string): Promise<Resultado> => {
    if (motivo) r.motivo = motivo
    await e.auditoria?.registrar({
      quando: agora.toISOString(),
      agente: e.agente.id,
      canal: e.canal,
      entrada: mascarar(e.entrada),
      acoes: r.acoes,
      transferirParaHumano: r.transferirParaHumano,
      motivo: r.motivo,
      creditos: r.creditosUsados,
    })
    return r
  }

  // 1) Barreiras fixas (sem IA, sem custo)
  if (e.agente.publico === 'cliente-final') {
    if (detectarOptOut(e.entrada)) {
      r.optOut = true
      r.resposta = RESPOSTAS_SEGURAS.optOut
      return finalizar('opt-out')
    }
    if (pediuHumano(e.entrada)) {
      r.transferirParaHumano = true
      r.resposta = RESPOSTAS_SEGURAS.humano
      return finalizar('pediu-humano')
    }
    if (perguntouSeERobo(e.entrada)) {
      r.resposta = RESPOSTAS_SEGURAS.eRobo(e.perfil.nome)
      return finalizar('pergunta-identidade')
    }
    if ((e.perfil.vertical === 'odonto' || e.perfil.vertical === 'saude') && urgenciaDeSaude(e.entrada)) {
      r.transferirParaHumano = true
      r.resposta = RESPOSTAS_SEGURAS.urgenciaSaude
      return finalizar('urgencia-saude')
    }
    if (reclamacaoGrave(e.entrada)) {
      r.transferirParaHumano = true
      r.resposta = RESPOSTAS_SEGURAS.grave
      return finalizar('reclamacao-grave')
    }
  }

  // 2) Mensagem por iniciativa do agente: só no horário permitido
  if (e.agente.proativo && e.agente.publico === 'cliente-final' && !dentroDaJanela(agora)) {
    return finalizar('fora-da-janela')
  }

  // 3) Créditos
  if (e.creditos) {
    const saldo = await e.creditos.saldo()
    if (saldo < e.agente.custoCreditos) return finalizar('sem-creditos')
  }

  // 4) Modelo de IA + ferramentas permitidas
  const sistema = montarSistema(e.agente, e.perfil)
  const mensagens: { papel: 'user' | 'assistant'; conteudo: string }[] = [
    ...e.historico.map((m) => ({ papel: (m.de === 'cliente' ? 'user' : 'assistant') as 'user' | 'assistant', conteudo: m.texto })),
    { papel: 'user', conteudo: e.entrada },
  ]
  const valoresDoSistema: string[] = []
  const jaFeitas = new Set<string>()
  let texto = ''

  for (let volta = 0; volta < MAX_VOLTAS; volta++) {
    const resp = await e.llm.completar({ sistema, mensagens, maxTokens: 500 })
    texto = resp.texto
    if (!resp.chamadas?.length) break

    let rodouAlgo = false
    for (const c of resp.chamadas) {
      const chave = `${c.ferramenta}:${JSON.stringify(c.args)}`
      if (jaFeitas.has(chave)) continue // a mesma ação nunca roda nem é pedida duas vezes
      jaFeitas.add(chave)
      const def = e.agente.ferramentas.find((f) => f.nome === c.ferramenta)
      if (!def) {
        r.acoes.push(`bloqueada:${c.ferramenta}`)
        continue
      }
      if (c.ferramenta === 'passarParaHumano') r.transferirParaHumano = true
      if (def.exigeAprovacao) {
        const id = (await e.aprovacao?.pedir({ agente: e.agente.id, ferramenta: c.ferramenta, args: c.args, motivo: 'ação sensível' })) ?? 'sem-fila'
        r.aprovacoesPendentes.push(id)
        r.acoes.push(`aguardando-aprovacao:${c.ferramenta}`)
        mensagens.push({ papel: 'user', conteudo: `[sistema] ${c.ferramenta} aguarda aprovação da equipe.` })
        continue
      }
      const fn = e.ferramentas?.[c.ferramenta]
      if (!fn) {
        r.acoes.push(`indisponivel:${c.ferramenta}`)
        continue
      }
      const saida = await fn(c.args)
      const serializado = JSON.stringify(saida ?? null)
      for (const m of serializado.matchAll(/R\$\s?\d[\d.]*(,\d{1,2})?/g)) valoresDoSistema.push(m[0])
      r.acoes.push(`ok:${c.ferramenta}`)
      rodouAlgo = true
      mensagens.push({ papel: 'user', conteudo: `[resultado de ${c.ferramenta}] ${serializado.slice(0, 1500)}` })
    }
    // Sem resultado novo para o modelo (tudo bloqueado, indisponível ou aguardando aprovação): encerra aqui.
    if (!rodouAlgo || volta === MAX_VOLTAS - 1) break
  }

  // 5) Conferência da resposta antes de enviar
  const conferencia = verificarSaida(texto, e.agente, e.perfil, valoresDoSistema)
  if (!conferencia.ok) {
    r.transferirParaHumano = true
    r.resposta = RESPOSTAS_SEGURAS.saidaBloqueada
    r.acoes.push(`saida-bloqueada:${conferencia.regra}`)
    return finalizar(`saida-bloqueada:${conferencia.regra}`)
  }
  r.resposta = texto.trim() || RESPOSTAS_SEGURAS.naoSei
  if (!texto.trim()) r.transferirParaHumano = true

  // 6) Créditos e auditoria
  if (e.creditos) {
    const ok = await e.creditos.debitar(e.agente.custoCreditos, `agente:${e.agente.id}`)
    if (ok) r.creditosUsados = e.agente.custoCreditos
  }
  return finalizar()
}
