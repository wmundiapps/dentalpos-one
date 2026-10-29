import { CobCaso } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { contatosDeAlunos, prefsPorContato } from '../comunicacao/campanhas'
import { pickDestino, podeEnviar } from '../comunicacao/pure'
import { PoliticaCob } from './carteira'
import { diaBRT, dentroDaJanelaCobranca, mascararDestino, proximaJanelaCobranca, validarMensagemCobranca, DIA_MS } from './calculo'
import { escolherProvedor, montarRoteiro } from './voz-ia'

export const CANAIS_COB = ['SMS', 'WHATSAPP', 'TELEGRAM', 'EMAIL', 'VOZ_IA'] as const
export type CanalCob = (typeof CANAIS_COB)[number]
/** Canal da Comunicação correspondente (VOZ_IA usa a abstração de voz). */
export const tipoComunicacao = (c: string) => (c === 'VOZ_IA' ? 'VOZ' : c)

export interface TentativaInput {
  tenantId: string
  caso: Pick<CobCaso, 'id' | 'studentId' | 'naoContatar'>
  politica: PoliticaCob
  canal: string
  canalFallback?: string | null
  assunto?: string | null
  mensagem: string
  etapaId?: string | null
  acordoId?: string | null
  automatico: boolean
  usuarioId?: string | null
  tipo?: string
  extrajudicial?: boolean
  nomeAluno?: string
  now?: Date
  dryRun?: boolean
}
export interface TentativaResultado {
  resultado: string
  canal: string
  contatoId?: string
  adiado?: boolean
  proximaEm?: Date
  motivo?: string
  simulado?: boolean
}

const NAO_CONTA = ['FALHA', 'SEM_DESTINO']

function inicioDiaBRT(now: Date): Date {
  return new Date((diaBRT(now)) * DIA_MS + 3 * 3_600_000)
}

/** Quantos contatos de cobrança já houve com o aluno no dia/semana (inclui a régua antiga da Comunicação). */
export async function contagemContatos(tenantId: string, studentId: string, now: Date) {
  const hoje = inicioDiaBRT(now)
  const semana = new Date(hoje.getTime() - 6 * DIA_MS)
  const base = { tenantId, studentId, direcao: 'SAIDA', tipo: { not: 'NOTA' }, NOT: [{ resultado: { startsWith: 'BLOQUEADO' } }, { resultado: { in: NAO_CONTA } }] }
  const [cDia, cSem, nDia, nSem] = await Promise.all([
    prisma.cobContato.count({ where: { ...base, createdAt: { gte: hoje } } }),
    prisma.cobContato.count({ where: { ...base, createdAt: { gte: semana } } }),
    prisma.eduNotification.count({ where: { tenantId, studentId, refType: 'ComReguaExec', status: { not: 'CANCELADA' }, createdAt: { gte: hoje } } }),
    prisma.eduNotification.count({ where: { tenantId, studentId, refType: 'ComReguaExec', status: { not: 'CANCELADA' }, createdAt: { gte: semana } } }),
  ])
  return { dia: cDia + nDia, semana: cSem + nSem }
}

async function registrar(inp: TentativaInput, canal: string, resultado: string, extra: { destino?: string | null; erro?: string; notificationId?: string; mensagem?: string } = {}) {
  const now = inp.now ?? new Date()
  const c = await prisma.cobContato.create({
    data: {
      tenantId: inp.tenantId, casoId: inp.caso.id, studentId: inp.caso.studentId, tipo: inp.tipo ?? (canal === 'VOZ_IA' ? 'VOZ_IA' : 'MENSAGEM'), direcao: 'SAIDA', canal,
      automatico: inp.automatico, createdAt: now, resultado, etapaId: inp.etapaId ?? undefined, acordoId: inp.acordoId ?? undefined, notificationId: extra.notificationId, baseLegal: inp.politica.baseLegal,
      finalidade: 'COBRANCA', destino: mascararDestino(canal, extra.destino ?? null), assunto: inp.assunto ?? undefined, mensagem: (extra.mensagem ?? inp.mensagem).slice(0, 2000), usuarioId: inp.usuarioId ?? undefined, erro: extra.erro,
    },
  })
  if (!resultado.startsWith('BLOQUEADO') && !NAO_CONTA.includes(resultado)) {
    await prisma.cobCaso.update({ where: { id: inp.caso.id }, data: { ultimoContatoEm: now, ultimoContatoCanal: canal, ultimoContatoResultado: resultado } })
  }
  return c
}

/**
 * Pipeline ÚNICO de contato de cobrança. Ordem das barreiras (todas obrigatórias):
 *  1. bloqueio manual "não contatar";  2. janela (dia útil/horário/feriado);  3. limite diário e semanal;
 *  4. destino existente;  5. opt-out (por canal, finalidade COBRANCA e canal "*");  6. conformidade do texto (CDC art. 42).
 * Automático fora da janela/limite NÃO registra (é adiado); manual registra o bloqueio. Cada tentativa decidida fica em CobContato.
 */
export async function tentarContato(inp: TentativaInput): Promise<TentativaResultado> {
  const now = inp.now ?? new Date()
  const pol = inp.politica
  const log = async (canal: string, resultado: string, extra: Parameters<typeof registrar>[3] = {}) => {
    if (inp.dryRun) return { id: undefined as string | undefined }
    return registrar(inp, canal, resultado, extra)
  }

  if (inp.caso.naoContatar) {
    const c = await log(inp.canal, 'BLOQUEADO_NAO_CONTATAR', { erro: 'Caso marcado como "não contatar".' })
    return { resultado: 'BLOQUEADO_NAO_CONTATAR', canal: inp.canal, contatoId: c.id }
  }
  if (!dentroDaJanelaCobranca(now, pol)) {
    const proximaEm = proximaJanelaCobranca(now, pol)
    if (inp.automatico) return { resultado: 'ADIADO_JANELA', canal: inp.canal, adiado: true, proximaEm, motivo: 'Fora da janela de contato' }
    const c = await log(inp.canal, 'BLOQUEADO_JANELA', { erro: `Fora da janela ${pol.janelaInicio}-${pol.janelaFim} (dias úteis). Próxima: ${proximaEm.toISOString()}` })
    return { resultado: 'BLOQUEADO_JANELA', canal: inp.canal, contatoId: c.id, proximaEm }
  }
  const cont = await contagemContatos(inp.tenantId, inp.caso.studentId, now)
  if (cont.dia >= pol.limiteContatosDia || cont.semana >= pol.limiteContatosSemana) {
    const motivo = cont.dia >= pol.limiteContatosDia ? `limite de ${pol.limiteContatosDia} contato(s) por dia` : `limite de ${pol.limiteContatosSemana} contatos por semana`
    if (inp.automatico) return { resultado: 'ADIADO_LIMITE', canal: inp.canal, adiado: true, motivo }
    const c = await log(inp.canal, 'BLOQUEADO_LIMITE', { erro: `Atingido o ${motivo}.` })
    return { resultado: 'BLOQUEADO_LIMITE', canal: inp.canal, contatoId: c.id, motivo }
  }

  // destino + opt-out por canal (principal, depois fallback)
  const dados = (await contatosDeAlunos(inp.tenantId, [inp.caso.studentId])).get(inp.caso.studentId)
  const prefs = dados?.contatoId ? ((await prefsPorContato(inp.tenantId, [dados.contatoId])).get(dados.contatoId) ?? []) : []
  let motivoFalha: 'SEM_DESTINO' | 'BLOQUEADO_OPTOUT' = 'SEM_DESTINO'
  let escolhido: { canal: string; destino: string } | null = null
  for (const canal of [inp.canal, inp.canalFallback].filter(Boolean) as string[]) {
    const tipo = tipoComunicacao(canal)
    const destino = dados ? pickDestino(tipo, dados) : null
    if (!destino) continue
    if (!podeEnviar(prefs, tipo, 'COBRANCA').ok) {
      motivoFalha = 'BLOQUEADO_OPTOUT'
      continue
    }
    escolhido = { canal, destino }
    break
  }
  if (!escolhido) {
    const c = await log(inp.canal, motivoFalha, { erro: motivoFalha === 'BLOQUEADO_OPTOUT' ? 'Opt-out do contato para cobrança neste(s) canal(is).' : 'Sem destino cadastrado para o canal.' })
    return { resultado: motivoFalha, canal: inp.canal, contatoId: c.id }
  }

  const erros = validarMensagemCobranca(inp.mensagem, { extrajudicial: !!inp.extrajudicial })
  if (erros.length) {
    const c = await log(escolhido.canal, 'FALHA', { destino: escolhido.destino, erro: `Mensagem reprovada na conformidade: ${erros.join('; ')}` })
    return { resultado: 'FALHA', canal: escolhido.canal, contatoId: c.id, motivo: erros.join('; ') }
  }
  if (inp.dryRun) return { resultado: 'ENFILEIRADO', canal: escolhido.canal }

  const c = await registrar(inp, escolhido.canal, 'ENFILEIRADO', { destino: escolhido.destino })
  if (escolhido.canal === 'VOZ_IA') {
    const prov = await escolherProvedor(inp.tenantId)
    const r = await prov.iniciar({ tenantId: inp.tenantId, studentId: inp.caso.studentId, contatoId: c.id, destino: escolhido.destino, roteiro: montarRoteiro(inp.nomeAluno?.split(' ')[0] ?? 'aluno', inp.mensagem), nomeAluno: inp.nomeAluno ?? '' })
    const resultado = !r.ok ? 'FALHA' : r.simulado ? 'SIMULADO' : 'ENFILEIRADO'
    await prisma.cobContato.update({ where: { id: c.id }, data: { resultado, notificationId: r.notificationId, erro: r.erro, observacao: `provedor=${r.provedor}${r.provedorId ? ' id=' + r.provedorId : ''}${r.simulado ? ' (SIMULADO: nenhuma ligação foi discada)' : ''}` } })
    if (!r.ok) await prisma.cobCaso.update({ where: { id: inp.caso.id }, data: { ultimoContatoResultado: 'FALHA' } })
    return { resultado, canal: 'VOZ_IA', contatoId: c.id, simulado: r.simulado, motivo: r.erro }
  }
  const n = await prisma.eduNotification.create({
    data: { tenantId: inp.tenantId, canal: tipoComunicacao(escolhido.canal), studentId: inp.caso.studentId, destino: escolhido.destino, assunto: inp.assunto ?? undefined, mensagem: inp.mensagem, templateKey: 'cobranca', refType: 'CobContato', refId: c.id, agendadoPara: now },
  })
  await prisma.cobContato.update({ where: { id: c.id }, data: { notificationId: n.id } })
  return { resultado: 'ENFILEIRADO', canal: escolhido.canal, contatoId: c.id }
}

const MAPA_STATUS: Record<string, string> = { PENDENTE: 'ENFILEIRADO', ENVIADA: 'ENVIADO', ENTREGUE: 'ENTREGUE', LIDA: 'LIDO', FALHA: 'FALHA', CANCELADA: 'BLOQUEADO_OPTOUT' }

/** Reflete em CobContato o desfecho das notificações despachadas pelo dispatcher da Comunicação. */
export async function sincronizarTentativas(tenantId: string, limite = 500) {
  const pend = await prisma.cobContato.findMany({ where: { tenantId, notificationId: { not: null }, resultado: { in: ['ENFILEIRADO', 'ENVIADO', 'ENTREGUE'] } }, orderBy: { createdAt: 'desc' }, take: limite })
  if (!pend.length) return 0
  const ns = await prisma.eduNotification.findMany({ where: { tenantId, id: { in: pend.map((p) => p.notificationId!) } }, select: { id: true, status: true, erro: true } })
  const nMap = new Map(ns.map((n) => [n.id, n]))
  let alterados = 0
  for (const p of pend) {
    const n = nMap.get(p.notificationId!)
    if (!n) continue
    let novo = MAPA_STATUS[n.status] ?? p.resultado
    if (n.status === 'CANCELADA' && !/opt-?out|optou/i.test(n.erro ?? '')) novo = 'FALHA'
    if (novo !== p.resultado) {
      await prisma.cobContato.update({ where: { id: p.id }, data: { resultado: novo, erro: ['FALHA', 'BLOQUEADO_OPTOUT'].includes(novo) ? (n.erro ?? undefined) : undefined } })
      alterados++
    }
  }
  return alterados
}

/**
 * Usada pelo dispatcher da Comunicação: cobrança que não deve mais sair (caso quitado/em acordo/pausado ou título coberto por acordo).
 * Retorna o motivo ou null.
 */
export async function cobrancaSuprimida(n: { tenantId: string; refType: string | null; refId: string | null; studentId: string | null }, now = new Date()): Promise<string | null> {
  if (!n.studentId) return null
  if (n.refType !== 'CobContato' && n.refType !== 'ComReguaExec') return null
  const caso = await prisma.cobCaso.findFirst({ where: { tenantId: n.tenantId, studentId: n.studentId } })
  if (!caso) return null
  if (n.refType === 'CobContato') {
    const c = n.refId ? await prisma.cobContato.findFirst({ where: { id: n.refId, tenantId: n.tenantId } }) : null
    // notificações de acordo/aviso formal não são suprimidas por estarem "em acordo"
    if (c?.acordoId) return null
    if (['QUITADO', 'ENCERRADO'].includes(caso.status)) return 'Débito quitado/encerrado: cobrança suprimida.'
  }
  if (caso.status === 'EM_ACORDO') return 'Aluno com acordo ativo: cobrança pausada.'
  if (caso.pausadoAte && caso.pausadoAte > now) return 'Cobrança pausada manualmente.'
  if (caso.naoContatar) return 'Aluno marcado como "não contatar".'
  return null
}
