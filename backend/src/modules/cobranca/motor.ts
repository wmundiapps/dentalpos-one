import { CobCaso, CobExecucao, CobRegua, CobReguaEtapa } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { audit } from '../core/notify'
import { despacharPendentes } from '../comunicacao/dispatcher'
import { formatBRL, formatDateBR, renderTemplate } from '../comunicacao/pure'
import { Carteira, LinhaDevedor, montarCarteira, politicaPara, sincronizarCasos } from './carteira'
import { EtapaRec, diaBRT, etapaDevida } from './calculo'
import { sincronizarTentativas, tentarContato } from './contato'
import { TipoEncaminhamento, escalonar, reenviarNotificacoesPendentes } from './escalonamento'
import { jobAcordos } from './acordos'
import { jobPromessas } from './promessas'

type ReguaComEtapas = CobRegua & { etapas: CobReguaEtapa[] }

export interface ResumoMotor {
  tenants: number
  casosAvaliados: number
  contatos: number // mensagens enfileiradas/simuladas
  simulados: number
  bloqueados: Record<string, number>
  adiados: number
  semDestino: number
  falhas: number
  escalonamentos: number
  escalonamentosBloqueados: number
  pulados: Record<string, number>
  repeticoes: number
  simulacao: any[]
  casos?: { abertos: number; reabertos: number; quitados: number; retomados: number }
  despacho?: any
}
const vazio = (): ResumoMotor => ({ tenants: 0, casosAvaliados: 0, contatos: 0, simulados: 0, bloqueados: {}, adiados: 0, semDestino: 0, falhas: 0, escalonamentos: 0, escalonamentosBloqueados: 0, pulados: {}, repeticoes: 0, simulacao: [] })
const inc = (o: Record<string, number>, k: string) => { o[k] = (o[k] ?? 0) + 1 }

const rec = (e: CobReguaEtapa): EtapaRec => ({ id: e.id, diaAtraso: e.diaAtraso, acao: e.acao, repetirACadaDias: e.repetirACadaDias, maxRepeticoes: e.maxRepeticoes, continuaAposProxima: e.continuaAposProxima })

function escolherRegua(reguas: ReguaComEtapas[], segmento: string): ReguaComEtapas | undefined {
  const ok = reguas.filter((r) => r.segmento === segmento || r.segmento === 'TODOS')
  return ok.sort((a, b) => Number(b.segmento === segmento) - Number(a.segmento === segmento) || b.prioridade - a.prioridade)[0]
}

export function variaveisMensagem(l: LinhaDevedor): Record<string, string> {
  return {
    nome: l.nome.split(' ')[0],
    nome_completo: l.nome,
    valor: formatBRL(l.saldo),
    saldo: formatBRL(l.saldo),
    vencimento: l.vencimentoMaisAntigo ? formatDateBR(l.vencimentoMaisAntigo) : '',
    dias_atraso: String(l.maiorAtraso),
    titulos: String(l.titulosVencidos),
    ...(l.curso ? { curso: l.curso } : {}),
  }
}

/** Motivo para NÃO cobrar este caso agora (pausa automática). */
export function motivoPausa(caso: Pick<CobCaso, 'status' | 'pausadoAte' | 'naoContatar'>, l: LinhaDevedor, polPausaPromessa: boolean, now: Date): string | null {
  if (l.acordoId || caso.status === 'EM_ACORDO') return 'ACORDO'
  if (caso.status === 'JURIDICO') return 'JURIDICO'
  if (caso.pausadoAte && caso.pausadoAte > now) return 'PAUSADO'
  if (polPausaPromessa && l.promessaData && diaBRT(l.promessaData) >= diaBRT(now)) return 'PROMESSA'
  return null
}

/**
 * Motor de recorrência da régua de cobrança.
 * Para cada caso em aberto escolhe a régua do segmento e avalia as etapas pelo MAIOR atraso do aluno:
 *  - MENSAGEM: dispara na 1ª vez quando atraso >= diaAtraso e REPETE a cada `repetirACadaDias` até quitar/acordo
 *    (ou até a etapa seguinte entrar em vigor / maxRepeticoes). No máximo UMA mensagem por caso por execução;
 *    etapas anteriores que também venceram e ficaram para trás são marcadas SUPERADA (sem rajada ao importar atrasos).
 *  - NOTIFICACAO_EXTRAJUDICIAL | NEGATIVACAO | PROTESTO | JURIDICO: uma vez por ciclo, com pré-requisitos (aviso prévio, valor mínimo).
 *  - Pausa automática: acordo ativo, promessa vigente, pausa manual, caso no jurídico. Pagamento total encerra o caso.
 *  - Toda barreira de conformidade (opt-out, janela, limite diário/semanal) está em tentarContato().
 */
export async function executarMotor(opts: { tenantId?: string; now?: Date; dryRun?: boolean; despachar?: boolean } = {}): Promise<ResumoMotor> {
  const now = opts.now ?? new Date()
  const res = vazio()
  const tenantIds = opts.tenantId ? [opts.tenantId] : [...new Set((await prisma.cobRegua.findMany({ where: { ativa: true }, select: { tenantId: true } })).map((r) => r.tenantId))]
  for (const tenantId of tenantIds) {
    const reguas = (await prisma.cobRegua.findMany({ where: { tenantId, ativa: true }, include: { etapas: { where: { ativa: true }, orderBy: [{ diaAtraso: 'asc' }, { ordem: 'asc' }] } } })) as ReguaComEtapas[]
    if (!reguas.length) continue
    res.tenants++
    await sincronizarTentativas(tenantId)
    const cart = await montarCarteira(tenantId, now)
    if (!opts.dryRun) res.casos = mesclar(res.casos, await sincronizarCasos(tenantId, cart, now))
    await processarTenant(tenantId, reguas, cart, now, res, !!opts.dryRun)
    if (!opts.dryRun) await reenviarNotificacoesPendentes(tenantId, now)
    if (!opts.dryRun && opts.despachar) {
      res.despacho = await despacharPendentes({ tenantId, now })
      await sincronizarTentativas(tenantId)
    }
    if (!opts.dryRun) await audit({ tenantId, modulo: 'cobranca', acao: 'MOTOR_EXECUTADO', detalhes: { contatos: res.contatos, escalonamentos: res.escalonamentos, adiados: res.adiados } })
  }
  return res
}

const mesclar = (a: ResumoMotor['casos'], b: NonNullable<ResumoMotor['casos']>) => (a ? { abertos: a.abertos + b.abertos, reabertos: a.reabertos + b.reabertos, quitados: a.quitados + b.quitados, retomados: a.retomados + b.retomados } : b)

async function processarTenant(tenantId: string, reguas: ReguaComEtapas[], cart: Carteira, now: Date, res: ResumoMotor, dryRun: boolean) {
  const casos = await prisma.cobCaso.findMany({ where: { tenantId } })
  const casoPor = new Map(casos.map((c) => [c.studentId, c]))
  const execs = await prisma.cobExecucao.findMany({ where: { tenantId } })
  const execPor = new Map<string, CobExecucao>()
  for (const e of execs) execPor.set(`${e.casoId}|${e.ciclo}|${e.etapaId}`, e)
  const execsDoCiclo = (c: CobCaso) => execs.filter((e) => e.casoId === c.id && e.ciclo === c.ciclo)

  for (const l of cart.linhas) {
    if (l.titulosVencidos === 0) {
      if (l.acordoId) inc(res.pulados, 'ACORDO') // débito inteiro coberto por acordo ativo
      continue
    }
    const real = casoPor.get(l.studentId)
    const caso = real ?? ({ id: 'dry-run', tenantId, studentId: l.studentId, status: 'EM_COBRANCA', ciclo: 1, pausadoAte: null, naoContatar: false, abertoEm: now } as unknown as CobCaso)
    if (!real && !dryRun) continue
    res.casosAvaliados++
    const pol = politicaPara(cart.politicas, l.segmento)
    const pausa = motivoPausa(caso, l, pol.pausaComPromessa, now)
    if (pausa) { inc(res.pulados, pausa); continue }
    const regua = escolherRegua(reguas, l.segmento)
    if (!regua) { inc(res.pulados, 'SEM_REGUA'); continue }
    const etapasMsg = regua.etapas.filter((e) => e.acao === 'MENSAGEM')
    const recMsg = etapasMsg.map(rec)
    const jaNoCiclo = real ? execsDoCiclo(real) : []

    // ---- mensagens (recorrência)
    const devidas: Array<{ e: CobReguaEtapa; primeira: boolean; ex?: CobExecucao }> = []
    for (const e of etapasMsg) {
      const ex = execPor.get(`${caso.id}|${caso.ciclo}|${e.id}`)
      const d = etapaDevida(rec(e), ex ? { ocorrencias: ex.ocorrencias, ultimaEm: ex.ultimaEm, resultado: ex.resultado } : undefined, l.maiorAtraso, recMsg, now)
      if (d.devida) devidas.push({ e, primeira: d.primeira, ex })
    }
    if (devidas.length) {
      const alvo = devidas.reduce((m, x) => (x.e.diaAtraso > m.e.diaAtraso ? x : m))
      // as primeiras execuções que ficaram para trás (além da tolerância) são superadas
      for (const x of devidas) {
        if (x === alvo || !x.primeira) continue
        if (l.maiorAtraso - x.e.diaAtraso > regua.toleranciaDias && !dryRun) {
          await prisma.cobExecucao.upsert({ where: { casoId_ciclo_etapaId: { casoId: caso.id, ciclo: caso.ciclo, etapaId: x.e.id } }, create: { tenantId, casoId: caso.id, ciclo: caso.ciclo, etapaId: x.e.id, resultado: 'SUPERADA', encerrada: true }, update: {} })
          inc(res.pulados, 'ETAPA_SUPERADA')
        }
      }
      const e = alvo.e
      const msg = renderTemplate(e.mensagem || '', variaveisMensagem(l)).texto
      const r = await tentarContato({ tenantId, caso, politica: pol, canal: e.canal, canalFallback: e.canalFallback, assunto: e.assunto ? renderTemplate(e.assunto, variaveisMensagem(l)).texto : null, mensagem: msg, etapaId: e.id, automatico: true, nomeAluno: l.nome, now, dryRun })
      if (dryRun) res.simulacao.push({ aluno: l.nome, studentId: l.studentId, etapa: e.nome, diaAtraso: e.diaAtraso, maiorAtraso: l.maiorAtraso, canal: r.canal, resultado: r.resultado, repeticao: !alvo.primeira, mensagem: msg })
      if (r.adiado) res.adiados++
      else {
        if (r.resultado === 'ENFILEIRADO') res.contatos++
        else if (r.resultado === 'SIMULADO') { res.contatos++; res.simulados++ }
        else if (r.resultado === 'SEM_DESTINO') res.semDestino++
        else if (r.resultado === 'FALHA') res.falhas++
        else if (r.resultado.startsWith('BLOQUEADO')) inc(res.bloqueados, r.resultado)
        if (!alvo.primeira && ['ENFILEIRADO', 'SIMULADO'].includes(r.resultado)) res.repeticoes++
        if (!dryRun) {
          await prisma.cobExecucao.upsert({
            where: { casoId_ciclo_etapaId: { casoId: caso.id, ciclo: caso.ciclo, etapaId: e.id } },
            create: { tenantId, casoId: caso.id, ciclo: caso.ciclo, etapaId: e.id, ocorrencias: 1, ultimaEm: now },
            update: { ocorrencias: { increment: 1 }, ultimaEm: now, resultado: 'EXECUTADA' },
          })
        }
      }
    }

    // ---- escalonamento (uma vez por ciclo)
    for (const e of regua.etapas.filter((x) => x.acao !== 'MENSAGEM')) {
      if (l.maiorAtraso < e.diaAtraso) continue
      const ex = execPor.get(`${caso.id}|${caso.ciclo}|${e.id}`)
      if (ex && ex.resultado !== 'AGUARDANDO_PRE_REQUISITO') continue
      if (dryRun) { res.simulacao.push({ aluno: l.nome, studentId: l.studentId, etapa: e.nome, diaAtraso: e.diaAtraso, maiorAtraso: l.maiorAtraso, acao: e.acao, resultado: 'ESCALONARIA' }); continue }
      const r = await escalonar({ tenantId, caso, tipo: e.acao as TipoEncaminhamento, automatico: true, exigeAprovacao: e.exigeAprovacao, etapaId: e.id, now })
      if (r.criado) {
        res.escalonamentos++
        await prisma.cobExecucao.upsert({ where: { casoId_ciclo_etapaId: { casoId: caso.id, ciclo: caso.ciclo, etapaId: e.id } }, create: { tenantId, casoId: caso.id, ciclo: caso.ciclo, etapaId: e.id, ocorrencias: 1, ultimaEm: now }, update: { ocorrencias: 1, ultimaEm: now, resultado: 'EXECUTADA', encerrada: true } })
      } else {
        res.escalonamentosBloqueados++
        const permanente = /abaixo do mínimo|Já existe/.test(r.bloqueado ?? '')
        await prisma.cobExecucao.upsert({ where: { casoId_ciclo_etapaId: { casoId: caso.id, ciclo: caso.ciclo, etapaId: e.id } }, create: { tenantId, casoId: caso.id, ciclo: caso.ciclo, etapaId: e.id, resultado: permanente ? 'SUPERADA' : 'AGUARDANDO_PRE_REQUISITO', encerrada: permanente }, update: { resultado: permanente ? 'SUPERADA' : 'AGUARDANDO_PRE_REQUISITO' } })
      }
    }
    void jaNoCiclo
  }
}

/** Job único: acordos (quebra/expiração), promessas, motor da régua e despacho. */
export async function jobCobranca(opts: { tenantId?: string; now?: Date; despachar?: boolean } = {}) {
  const acordos = await jobAcordos(opts)
  const promessas = await jobPromessas(opts)
  const motor = await executarMotor({ ...opts, despachar: opts.despachar ?? true })
  return { acordos, promessas, motor }
}
