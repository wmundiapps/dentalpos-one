import { prisma } from '../../lib/prisma'
import { canalAtivo } from '../comunicacao/store'

// ---------------------------------------------------------------------------------------------
// VOZ IA — ponto de integração com provedor de voz com IA (Twilio Voice + TTS, Vapi, Retell, ElevenLabs...).
//
// Como funciona hoje:
//  - Se o tenant tem um canal VOZ ativo e configurado em /comunicacao/canais (Twilio), a chamada vira uma
//    EduNotification de canal VOZ e é despachada pelo dispatcher da Comunicação (roteiro lido por TTS pt-BR).
//  - Sem credenciais, a chamada é SIMULADA: nada é discado, o CobContato fica com resultado SIMULADO.
//
// Como plugar um provedor real: implemente ProvedorVozIA e chame registrarProvedorVozIA() na inicialização.
// O provedor devolve o resultado da ligação depois (webhook) em POST /api/edu/cobranca/voz-ia/resultado.
// ---------------------------------------------------------------------------------------------

export interface ChamadaIA {
  tenantId: string
  studentId: string
  contatoId: string // id do CobContato (para correlação do retorno)
  destino: string // telefone E.164
  roteiro: string // texto que o agente de voz deve conduzir (já em conformidade)
  nomeAluno: string
}
export interface ResultadoChamadaIA {
  ok: boolean
  simulado: boolean
  provedor: string
  provedorId?: string
  notificationId?: string
  erro?: string
}
export interface ProvedorVozIA {
  nome: string
  disponivel(tenantId: string): Promise<boolean>
  iniciar(c: ChamadaIA): Promise<ResultadoChamadaIA>
}

/** Provedor padrão: reaproveita o canal de voz da Comunicação (Twilio TTS) via caixa de saída. */
export const provedorComunicacao: ProvedorVozIA = {
  nome: 'COMUNICACAO_VOZ',
  async disponivel(tenantId) {
    return !!(await canalAtivo(tenantId, 'VOZ'))
  },
  async iniciar(c) {
    const n = await prisma.eduNotification.create({
      data: { tenantId: c.tenantId, canal: 'VOZ', studentId: c.studentId, destino: c.destino, mensagem: c.roteiro, templateKey: 'cobranca-voz-ia', refType: 'CobContato', refId: c.contatoId, agendadoPara: new Date() },
    })
    return { ok: true, simulado: false, provedor: 'COMUNICACAO_VOZ', notificationId: n.id }
  },
}

/** Provedor de simulação: usado quando não há credenciais. Não disca nada. */
export const provedorSimulado: ProvedorVozIA = {
  nome: 'SIMULADO',
  async disponivel() {
    return true
  },
  async iniciar(c) {
    return { ok: true, simulado: true, provedor: 'SIMULADO', provedorId: `sim-${c.contatoId.slice(0, 8)}` }
  },
}

let externo: ProvedorVozIA | null = null
export function registrarProvedorVozIA(p: ProvedorVozIA | null) {
  externo = p
}

/** Escolhe: provedor externo registrado > canal de voz da Comunicação > simulação. */
export async function escolherProvedor(tenantId: string): Promise<ProvedorVozIA> {
  if (externo && (await externo.disponivel(tenantId))) return externo
  if (await provedorComunicacao.disponivel(tenantId)) return provedorComunicacao
  return provedorSimulado
}

/** Roteiro de voz: curto, neutro, sem expor valores a terceiros e com opção de encerrar contato. */
export function montarRoteiro(nome: string, mensagem: string): string {
  const texto = mensagem.replace(/\s+/g, ' ').trim()
  return `Olá, falo com ${nome}? Esta é uma ligação automática da secretaria financeira da instituição. ${texto} Para falar com um atendente, retorne para o telefone da instituição. Se não deseja receber ligações automáticas, responda a qualquer mensagem com a palavra SAIR. Obrigado.`
}
