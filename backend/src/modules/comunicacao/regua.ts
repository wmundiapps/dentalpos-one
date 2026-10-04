import { prisma } from '../../lib/prisma'
import { audit } from '../core/notify'
import { contatosDeAlunos, prefsPorContato } from './campanhas'
import { calcularAlvosRegua, formatBRL, formatDateBR, dayNumberBRT, pickDestino, podeEnviar, renderTemplate } from './pure'

const db = prisma as any

// Executa as réguas ativas lendo AccountReceivable (read-only) e enfileirando notificações.
// O unique (etapaId, receivableId) em ComReguaExecucao impede duplicidade.
export async function executarReguas(opts: { tenantId?: string; dryRun?: boolean; now?: Date } = {}) {
  const now = opts.now ?? new Date()
  const reguas = await prisma.comRegua.findMany({ where: { ativa: true, ...(opts.tenantId ? { tenantId: opts.tenantId } : {}) }, include: { etapas: { where: { ativa: true } } } })
  const resumo = { reguas: reguas.length, titulosAvaliados: 0, enfileiradas: 0, semDestino: 0, bloqueadas: 0, simulacao: [] as any[] }
  for (const r of reguas) {
    if (!r.etapas.length) continue
    const offs = r.etapas.map((e) => e.offsetDias)
    const maxO = Math.max(...offs, 0)
    const minO = Math.min(...offs, 0)
    const dia = 86_400_000
    const desde = new Date(now.getTime() - (maxO + r.toleranciaDias + 1) * dia)
    const ate = new Date(now.getTime() - (minO - 1) * dia)
    const titulos = await db.accountReceivable.findMany({
      where: { tenantId: r.tenantId, status: { in: ['PENDENTE', 'ATRASADO'] }, dataPagamento: null, dataVencimento: { gte: desde, lte: ate } },
      take: 5000,
    })
    resumo.titulosAvaliados += titulos.length
    if (!titulos.length) continue
    const exec = await prisma.comReguaExecucao.findMany({ where: { reguaId: r.id, receivableId: { in: titulos.map((t: any) => t.id) } }, select: { etapaId: true, receivableId: true } })
    const feitas = new Set(exec.map((x) => `${x.etapaId}|${x.receivableId}`))
    const alvos = calcularAlvosRegua(titulos.map((t: any) => ({ id: t.id, vencimento: t.dataVencimento, status: t.status })), r.etapas, feitas, now, r.toleranciaDias)
    if (!alvos.length) continue
    const tMap = new Map<string, any>(titulos.map((t: any) => [t.id, t]))
    const eMap = new Map(r.etapas.map((e) => [e.id, e]))
    const contatos = await contatosDeAlunos(r.tenantId, [...new Set(alvos.map((a) => tMap.get(a.tituloId).studentId as string))])
    const prefs = await prefsPorContato(r.tenantId, [...contatos.values()].map((c) => c.contatoId).filter(Boolean) as string[])
    const templates = new Map((await prisma.comTemplate.findMany({ where: { tenantId: r.tenantId, id: { in: r.etapas.map((e) => e.templateId) } } })).map((t) => [t.id, t]))
    const cursos = new Map<string, string>()
    try {
      const mats = await db.enrollment.findMany({ where: { studentId: { in: [...contatos.keys()] }, status: 'ATIVA' }, include: { program: { select: { nome: true } } } })
      for (const m of mats) cursos.set(m.studentId, m.program?.nome)
    } catch {
      /* acadêmico indisponível */
    }

    for (const a of alvos) {
      const t = tMap.get(a.tituloId)
      const etapa = eMap.get(a.etapaId)!
      const tpl = templates.get(etapa.templateId)
      const c = contatos.get(t.studentId)
      if (!tpl || !c) continue
      let canal = etapa.canal
      let destino = pickDestino(canal, c)
      if (!destino && etapa.canalFallback) {
        canal = etapa.canalFallback
        destino = pickDestino(canal, c)
      }
      const vars: Record<string, string> = {
        nome: c.nome.split(' ')[0],
        nome_completo: c.nome,
        valor: formatBRL(t.valor),
        vencimento: formatDateBR(t.dataVencimento),
        descricao: t.descricao,
        parcela: t.numeroParcela ? String(t.numeroParcela) : '',
        dias_atraso: String(Math.max(0, dayNumberBRT(now) - dayNumberBRT(t.dataVencimento))),
        ...(cursos.get(t.studentId) ? { curso: cursos.get(t.studentId)! } : {}),
      }
      let resultado: 'ENFILEIRADO' | 'SEM_DESTINO' | 'BLOQUEADO_OPTOUT' = 'ENFILEIRADO'
      if (!destino) resultado = 'SEM_DESTINO'
      else if (!podeEnviar(prefs.get(c.contatoId ?? '') ?? [], canal, 'COBRANCA').ok) resultado = 'BLOQUEADO_OPTOUT'
      if (opts.dryRun) {
        resumo.simulacao.push({ titulo: t.id, aluno: c.nome, etapa: etapa.nome, canal, destino, resultado, mensagem: renderTemplate(tpl.corpo, vars).texto })
        continue
      }
      try {
        const ex = await prisma.comReguaExecucao.create({ data: { tenantId: r.tenantId, reguaId: r.id, etapaId: etapa.id, receivableId: t.id, studentId: t.studentId, resultado } })
        if (resultado === 'ENFILEIRADO') {
          const n = await prisma.eduNotification.create({
            data: { tenantId: r.tenantId, canal, studentId: t.studentId, destino, assunto: tpl.assunto ? renderTemplate(tpl.assunto, vars).texto : undefined, mensagem: renderTemplate(tpl.corpo, vars).texto, templateKey: tpl.chave, refType: 'ComReguaExec', refId: ex.id, agendadoPara: now },
          })
          await prisma.comReguaExecucao.update({ where: { id: ex.id }, data: { notificationId: n.id } })
          resumo.enfileiradas++
        } else if (resultado === 'SEM_DESTINO') resumo.semDestino++
        else resumo.bloqueadas++
      } catch (e: any) {
        if (e?.code !== 'P2002') throw e // duplicidade = já executado em paralelo
      }
    }
    if (!opts.dryRun && resumo.enfileiradas) await audit({ tenantId: r.tenantId, modulo: 'comunicacao', acao: 'REGUA_EXECUTADA', refType: 'ComRegua', refId: r.id, detalhes: { enfileiradas: resumo.enfileiradas } })
  }
  return resumo
}
