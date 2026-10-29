import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { mountCrud } from '../core/crud'
import { AuthenticatedRequest, READ, Response, WRITE, agendarVencimento, alertaDe, asyncHandler, assertNoTenant, checarVigencia, fail, mountLista, optMoney, optStr, proximoCodigo, requireRole, tid } from './common'
import { bloquearStatus, mountCiclo, travarStatus } from './ciclo'
import { comissaoEstimada, r2 } from './logic'

const COMISSAO = ['PERCENTUAL_MENSALIDADE', 'VALOR_POR_ALUNO', 'FIXO_MENSAL', 'MISTO', 'NENHUM'] as const
const bem = z.object({
  descricao: z.string().min(2).max(200), bemId: z.string().uuid().optional(), tombamento: z.string().max(60).optional(),
  valor: z.number().min(0).max(1e10).optional(), estado: z.string().max(40).optional(), devolvidoEm: z.string().max(40).optional(),
})

export const lembretePolo = async (c: any, reabrir = false) => {
  const polo = await prisma.modPolo.findFirst({ where: { id: c.poloId, tenantId: c.tenantId }, select: { nome: true } })
  await agendarVencimento({
    tenantId: c.tenantId, refType: 'JurContratoPolo', refId: c.id, tag: 'polo', titulo: `Contrato do polo ${polo?.nome ?? c.poloId} com ${c.gestorNome} (${c.codigo})`,
    descricao: 'Renove o contrato com o gestor do polo ou inicie o processo de rescisão (alunos, patrimônio, comunicação).', due: c.vigenciaFim, ativo: c.status === 'VIGENTE', reabrir,
  })
}

const base = z.object({
  codigo: z.string().min(3).max(40).optional(), poloId: z.string().uuid(), gestorNome: z.string().min(2).max(200), gestorDoc: optStr(30), gestorEmail: z.string().email().nullish(),
  gestorTelefone: optStr(30), objeto: optStr(2000), condicoes: optStr(), patrimonioCedido: z.array(bem).max(200).optional(),
  direitosInstituicao: optStr(), deveresInstituicao: optStr(), direitosGestor: optStr(), deveresGestor: optStr(),
  comissionamentoTipo: z.enum(COMISSAO).optional(), comissionamentoPercentual: z.number().min(0).max(100).nullish(), comissionamentoValor: optMoney(), comissionamentoObs: optStr(1000),
  vigenciaInicio: z.coerce.date(), vigenciaFim: z.coerce.date(), prazoMeses: z.number().int().min(1).max(600).nullish(), renovacaoAutomatica: z.boolean().optional(),
  avisoPrevioDias: z.number().int().min(0).max(720).nullish(), rescisaoCondicoes: optStr(), multaRescisoria: optStr(500), documentoId: z.string().uuid().nullish(),
})

async function normalizarPatrimonio(tenantId: string, itens?: z.infer<typeof bem>[]) {
  if (!itens) return undefined
  const out: any[] = []
  for (const it of itens) {
    if (it.bemId) {
      const b = await prisma.infBem.findFirst({ where: { id: it.bemId, tenantId }, select: { tombamento: true, descricao: true, valorAquisicao: true } })
      if (!b) fail(400, `Bem de patrimônio não encontrado nesta instituição: ${it.bemId}.`)
      out.push({ ...it, tombamento: it.tombamento ?? b!.tombamento, valor: it.valor ?? b!.valorAquisicao })
    } else out.push(it)
  }
  return out
}

const esc = (s: unknown) => String(s ?? '—').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const dt = (d: any) => (d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—')

export function registerPolos(router: Router) {
  mountLista(router, {
    model: 'jurContratoPolo', path: '/contratos-polo', campoVenc: 'vigenciaFim', statusVigente: ['VIGENTE'], search: ['codigo', 'gestorNome'], filters: ['status', 'poloId', 'comissionamentoTipo'],
    orderBy: [{ vigenciaFim: 'asc' }],
  })
  bloquearStatus(router, '/contratos-polo')
  mountCrud(router, {
    model: 'jurContratoPolo', path: '/contratos-polo', read: READ, write: WRITE, modulo: 'juridico.polos', create: base,
    beforeCreate: async (d, req) => {
      const tenantId = tid(req)
      checarVigencia(d.vigenciaInicio, d.vigenciaFim, 'vigência do contrato do polo')
      const polo = await prisma.modPolo.findFirst({ where: { id: d.poloId, tenantId }, select: { id: true } })
      if (!polo) fail(400, 'Polo não encontrado nesta instituição.')
      await assertNoTenant(tenantId, 'jurDocumento', d.documentoId, 'Documento')
      if ((d.comissionamentoTipo === 'PERCENTUAL_MENSALIDADE' || d.comissionamentoTipo === 'MISTO') && d.comissionamentoPercentual == null && d.comissionamentoTipo === 'PERCENTUAL_MENSALIDADE') fail(422, 'Comissionamento percentual exige comissionamentoPercentual.')
      return { ...d, codigo: d.codigo ?? (await proximoCodigo(tenantId, 'POL')), patrimonioCedido: await normalizarPatrimonio(tenantId, d.patrimonioCedido), status: 'RASCUNHO' }
    },
    afterCreate: (row) => lembretePolo(row),
    beforeUpdate: async (d, req, cur) => {
      travarStatus(d, cur)
      delete d.poloId
      checarVigencia(d.vigenciaInicio ?? cur.vigenciaInicio, d.vigenciaFim ?? cur.vigenciaFim, 'vigência do contrato do polo')
      if (d.patrimonioCedido) d.patrimonioCedido = await normalizarPatrimonio(tid(req), d.patrimonioCedido)
    },
    afterUpdate: (row) => lembretePolo(row, true),
  })
  mountCiclo(router, {
    path: '/contratos-polo', model: 'jurContratoPolo', modulo: 'juridico.polos', refType: 'JurContratoPolo', onChange: lembretePolo,
    validarAtivar: async (c, tenantId) => {
      const pend: string[] = []
      if (!c.deveresGestor || !c.deveresInstituicao) pend.push('deveres das partes')
      if (!c.direitosGestor || !c.direitosInstituicao) pend.push('direitos das partes')
      if (!c.rescisaoCondicoes) pend.push('condições de rescisão')
      if (c.comissionamentoTipo !== 'NENHUM' && c.comissionamentoPercentual == null && c.comissionamentoValor == null) pend.push('valor/percentual de comissionamento')
      if (pend.length) fail(422, `Para ativar o contrato do polo, preencha: ${pend.join(', ')}.`)
      const polo = await prisma.modPolo.findFirst({ where: { id: c.poloId, tenantId } })
      if (!polo) fail(422, 'Polo não encontrado.')
      if (polo!.statusCredenciamento === 'DESCREDENCIADO') fail(422, 'Polo descredenciado não pode receber contrato vigente.')
      const outro = await prisma.jurContratoPolo.findFirst({ where: { tenantId, poloId: c.poloId, status: 'VIGENTE', id: { not: c.id }, vigenciaInicio: { lte: c.vigenciaFim }, vigenciaFim: { gte: c.vigenciaInicio } }, select: { codigo: true } })
      if (outro) fail(409, `Já existe contrato vigente (${outro.codigo}) para este polo no mesmo período.`)
    },
  })

  // Situação contratual de todos os polos (integração com modalidades/polos.ts).
  const situacao = async (tenantId: string, poloId?: string) => {
    const polos = await prisma.modPolo.findMany({ where: { tenantId, ...(poloId ? { id: poloId } : {}) }, orderBy: { nome: 'asc' } })
    const contratos = await prisma.jurContratoPolo.findMany({ where: { tenantId, poloId: { in: polos.map((p) => p.id) } }, orderBy: { vigenciaFim: 'desc' } })
    const alunos = await prisma.modPoloAluno.groupBy({ by: ['poloId'], where: { tenantId, ativo: true, poloId: { in: polos.map((p) => p.id) } }, _count: true })
    const nAlunos = new Map(alunos.map((a) => [a.poloId, a._count]))
    return polos.map((p) => {
      const cs = contratos.filter((c) => c.poloId === p.id)
      const vig = cs.find((c) => c.status === 'VIGENTE')
      const alerta = vig ? alertaDe(vig.vigenciaFim) : null
      const situacao = !vig ? 'SEM_CONTRATO' : alerta!.faixa === 'VENCIDO' ? 'VENCIDO' : alerta!.faixa === 'OK' ? 'REGULAR' : 'VENCENDO'
      const avisos: string[] = []
      if (!vig && p.statusCredenciamento === 'CREDENCIADO') avisos.push('Polo credenciado sem contrato vigente com o gestor.')
      if (vig && ['SUSPENSO', 'DESCREDENCIADO'].includes(p.statusCredenciamento)) avisos.push(`Contrato vigente com polo ${p.statusCredenciamento.toLowerCase()}: avalie suspensão/rescisão.`)
      if (situacao === 'VENCIDO') avisos.push('Contrato do gestor vencido.')
      const alunosAtivos = nAlunos.get(p.id) ?? 0
      return {
        polo: { id: p.id, codigo: p.codigo, nome: p.nome, cidade: p.cidade, uf: p.uf, statusCredenciamento: p.statusCredenciamento, atoValidade: p.atoValidade },
        situacao, alerta, avisos, alunosAtivos, contratoVigente: vig ?? null, totalContratos: cs.length,
        comissao: vig ? comissaoEstimada(vig, alunosAtivos) : null,
        patrimonioCedido: Array.isArray(vig?.patrimonioCedido) ? (vig!.patrimonioCedido as any[]).length : 0,
      }
    })
  }
  router.get('/polos/situacao', requireRole(...READ), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const items = await situacao(tid(req))
    res.json({
      items, total: items.length,
      resumo: { semContrato: items.filter((i) => i.situacao === 'SEM_CONTRATO').length, vencendo: items.filter((i) => i.situacao === 'VENCENDO').length, vencidos: items.filter((i) => i.situacao === 'VENCIDO').length, regulares: items.filter((i) => i.situacao === 'REGULAR').length },
    })
  }))
  router.get('/polos/:poloId/situacao', requireRole(...READ), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const [s] = await situacao(tid(req), String(req.params.poloId))
    if (!s) return res.status(404).json({ error: 'Polo não encontrado.' })
    res.json(s)
  }))

  // Minuta (MODELO) do contrato com o gestor do polo. Precisa de revisão de advogado antes de qualquer uso.
  router.get('/contratos-polo/:id/minuta', requireRole(...READ), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const c = await prisma.jurContratoPolo.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!c) return res.status(404).json({ error: 'Contrato não encontrado.' })
    const [polo, clinic] = await Promise.all([prisma.modPolo.findFirst({ where: { id: c.poloId, tenantId } }), prisma.clinic.findFirst({ where: { tenantId }, select: { name: true, cnpj: true } })])
    const bens = (Array.isArray(c.patrimonioCedido) ? c.patrimonioCedido : []) as any[]
    const com = comissaoEstimada(c, 0)
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Minuta ${esc(c.codigo)}</title><style>body{font-family:Georgia,serif;max-width:800px;margin:2rem auto;padding:0 1rem;line-height:1.5}h1{font-size:1.3rem;text-align:center}h2{font-size:1rem;margin-top:1.4rem}.aviso{border:2px solid #b45309;background:#fffbeb;padding:.8rem;font-family:sans-serif;font-size:.9rem}</style></head><body>
<p class="aviso"><b>MODELO DE MINUTA — NÃO É PEÇA JURÍDICA FINAL.</b> Gerada automaticamente a partir do cadastro. Deve ser revisada e adaptada por advogado antes de qualquer assinatura.</p>
<h1>CONTRATO DE GESTÃO DE POLO DE APOIO PRESENCIAL (EAD)<br><small>${esc(c.codigo)}</small></h1>
<p><b>CONTRATANTE:</b> ${esc(clinic?.name)}, CNPJ ${esc(clinic?.cnpj)}.<br><b>GESTOR DO POLO:</b> ${esc(c.gestorNome)}, documento ${esc(c.gestorDoc)}, e-mail ${esc(c.gestorEmail)}.</p>
<h2>Cláusula 1ª — Objeto</h2><p>${esc(c.objeto || `Gestão e operação do polo ${polo?.nome ?? ''}, ${polo?.cidade ?? ''}/${polo?.uf ?? ''}, em apoio presencial à oferta de cursos a distância.`)}</p>
<h2>Cláusula 2ª — Condições gerais</h2><p>${esc(c.condicoes)}</p>
<h2>Cláusula 3ª — Patrimônio cedido</h2>${bens.length ? '<ul>' + bens.map((b) => `<li>${esc(b.descricao)} — tombamento ${esc(b.tombamento)} — estado ${esc(b.estado)}${b.valor != null ? ` — valor R$ ${Number(b.valor).toFixed(2).replace('.', ',')}` : ''}</li>`).join('') + '</ul><p>O gestor responde pela guarda, conservação e devolução dos bens ao término do contrato.</p>' : '<p>Nenhum bem cedido.</p>'}
<h2>Cláusula 4ª — Direitos e deveres da CONTRATANTE</h2><p><b>Direitos:</b> ${esc(c.direitosInstituicao)}</p><p><b>Deveres:</b> ${esc(c.deveresInstituicao)}</p>
<h2>Cláusula 5ª — Direitos e deveres do GESTOR</h2><p><b>Direitos:</b> ${esc(c.direitosGestor)}</p><p><b>Deveres:</b> ${esc(c.deveresGestor)}</p>
<h2>Cláusula 6ª — Comissionamento</h2><p>Modelo: ${esc(c.comissionamentoTipo)}${c.comissionamentoPercentual != null ? ` — ${c.comissionamentoPercentual}%` : ''}${c.comissionamentoValor != null ? ` — R$ ${Number(c.comissionamentoValor).toFixed(2).replace('.', ',')}` : ''}. ${esc(com.nota)} ${esc(c.comissionamentoObs)}</p>
<h2>Cláusula 7ª — Prazo</h2><p>De ${dt(c.vigenciaInicio)} a ${dt(c.vigenciaFim)}${c.prazoMeses ? ` (${c.prazoMeses} meses)` : ''}. Renovação automática: ${c.renovacaoAutomatica ? 'sim' : 'não'}. Aviso prévio: ${c.avisoPrevioDias ?? '—'} dias.</p>
<h2>Cláusula 8ª — Rescisão</h2><p>${esc(c.rescisaoCondicoes)} Multa: ${esc(c.multaRescisoria)}.</p>
<h2>Cláusula 9ª — Proteção de dados</h2><p>As partes observarão a Lei nº 13.709/2018 (LGPD) no tratamento de dados de alunos, limitando-o às finalidades deste contrato. [Cláusula a detalhar pelo jurídico.]</p>
<h2>Cláusula 10ª — Foro</h2><p>[Foro a definir pelo jurídico.]</p>
<p style="margin-top:3rem">_______________________________<br>CONTRATANTE</p><p>_______________________________<br>GESTOR DO POLO</p></body></html>`
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'")
    res.send(html)
  }))
  void r2
}
