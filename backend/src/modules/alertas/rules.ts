import { prisma } from '../../lib/prisma'

// Alertas críticos por departamento. Cada regra consulta os dados reais do sistema e devolve zero ou mais alertas,
// com o problema explicado, o que fazer e as palavras-chave para achar POPs/instruções de trabalho relacionados.
export interface Alerta {
  chave: string
  regra: string
  departamento: string
  titulo: string
  resumo: string
  severidade: 'CRITICO'
  problema: string
  impacto: string
  oQueFazer: string[]
  rota: string
  rotaRotulo: string
  popTags: string[]
  detalhes: Array<{ rotulo: string; valor: string }>
  desde?: Date | null
}

const DIA = 86_400_000
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const data = (d?: Date | null) => (d ? d.toLocaleDateString('pt-BR') : '—')
const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`
type Regra = (tenantId: string, now: Date) => Promise<Alerta[]>
const base = (r: Omit<Alerta, 'severidade'>): Alerta => ({ ...r, severidade: 'CRITICO' })

export const REGRAS: Array<{ id: string; run: Regra }> = [
  {
    id: 'receber_atraso', run: async (tenantId) => {
      const rows = await prisma.accountReceivable.findMany({ where: { tenantId, status: 'ATRASADO' }, orderBy: { dataVencimento: 'asc' }, take: 500 })
      if (!rows.length) return []
      const total = rows.reduce((s, r) => s + r.valor, 0)
      const ids = [...new Set(rows.map((r) => r.studentId))]
      const alunos = await prisma.student.findMany({ where: { tenantId, id: { in: ids.slice(0, 8) } }, select: { id: true, nomeCompleto: true } })
      return [base({
        chave: 'receber_atraso', regra: 'receber_atraso', departamento: 'Financeiro e cobrança', titulo: `${plural(rows.length, 'parcela em atraso', 'parcelas em atraso')}`,
        resumo: `${brl(total)} em ${plural(ids.length, 'aluno', 'alunos')}`,
        problema: `Há ${plural(rows.length, 'parcela vencida e ainda não paga', 'parcelas vencidas e ainda não pagas')}, somando ${brl(total)}. A mais antiga venceu em ${data(rows[0].dataVencimento)}.`,
        impacto: 'Quanto mais tempo em aberto, menor a chance de recuperação e maior o custo de cobrança.',
        oQueFazer: ['Abra Cobrança > Inadimplentes e confira os contatos de cada aluno.', 'Execute a régua de cobrança (lembrete por WhatsApp e e-mail) ou envie uma cobrança individual.', 'Se o aluno responder, registre o acordo ou a promessa de pagamento.', 'Casos sem retorno após a régua seguem para o Jurídico, com o histórico de contatos.'],
        rota: '/edu/cobranca?aba=inadimplentes', rotaRotulo: 'Abrir Inadimplentes', popTags: ['cobran', 'inadimpl', 'parcela'],
        detalhes: [{ rotulo: 'Parcelas', valor: String(rows.length) }, { rotulo: 'Valor em aberto', valor: brl(total) }, { rotulo: 'Alunos', valor: alunos.map((a) => a.nomeCompleto).join(', ') || '—' }], desde: rows[0].dataVencimento,
      })]
    },
  },
  {
    id: 'pagar_vencidas', run: async (tenantId, now) => {
      const rows = await prisma.accountPayable.findMany({ where: { tenantId, status: { not: 'PAGO' }, dataVencimento: { lt: now } }, orderBy: { dataVencimento: 'asc' }, take: 200 })
      if (!rows.length) return []
      const total = rows.reduce((s, r) => s + r.valor, 0)
      return [base({
        chave: 'pagar_vencidas', regra: 'pagar_vencidas', departamento: 'Financeiro e cobrança', titulo: plural(rows.length, 'conta a pagar vencida', 'contas a pagar vencidas'), resumo: brl(total),
        problema: `${plural(rows.length, 'conta', 'contas')} a pagar passaram do vencimento (${brl(total)}). Mais antiga: ${rows[0].descricao}, de ${rows[0].fornecedor ?? 'fornecedor não informado'}, vencida em ${data(rows[0].dataVencimento)}.`,
        impacto: 'Juros e multa, risco de suspensão de serviços e desgaste com fornecedores.',
        oQueFazer: ['Abra Financeiro > Contas a pagar e filtre por vencidas.', 'Confira cada conta na fila de conferência e autorização.', 'Autorize o pagamento ou negocie nova data com o fornecedor.', 'Registre a baixa assim que pagar.'],
        rota: '/edu/financeiro?secao=pagar', rotaRotulo: 'Abrir Contas a pagar', popTags: ['contas a pagar', 'fornecedor'], detalhes: [{ rotulo: 'Contas', valor: String(rows.length) }, { rotulo: 'Valor', valor: brl(total) }], desde: rows[0].dataVencimento,
      })]
    },
  },
  {
    id: 'bib_atraso', run: async (tenantId, now) => {
      const n = await prisma.bibEmprestimo.count({ where: { tenantId, status: 'ATIVO', dataPrevista: { lt: now } } })
      if (!n) return []
      return [base({
        chave: 'bib_atraso', regra: 'bib_atraso', departamento: 'Biblioteca', titulo: plural(n, 'empréstimo em atraso', 'empréstimos em atraso'), resumo: 'Obras com devolução vencida',
        problema: `${plural(n, 'obra está', 'obras estão')} com a devolução vencida.`, impacto: 'Obras indisponíveis para outros alunos e multas acumulando.',
        oQueFazer: ['Abra Biblioteca > Empréstimos e filtre por atrasados.', 'Avise o leitor por e-mail ou WhatsApp.', 'Registre a renovação ou a devolução.', 'Aplique a multa conforme a política, se for o caso.'],
        rota: '/edu/biblioteca', rotaRotulo: 'Abrir Biblioteca', popTags: ['empréstimo', 'devolução', 'biblioteca'], detalhes: [{ rotulo: 'Empréstimos em atraso', valor: String(n) }],
      })]
    },
  },
  {
    id: 'os_sla', run: async (tenantId, now) => {
      const rows = await prisma.infOrdemServico.findMany({ where: { tenantId, status: { in: ['ABERTA', 'EM_EXECUCAO'] as any }, prazoSla: { lt: now } }, orderBy: { prazoSla: 'asc' }, take: 20 })
      return rows.map((o) => base({
        chave: `os_sla:${o.id}`, regra: 'os_sla', departamento: 'Infraestrutura', titulo: `OS ${o.numero} fora do prazo`, resumo: o.titulo,
        problema: `A ordem de serviço ${o.numero} (${o.titulo}) passou do prazo combinado em ${data(o.prazoSla)}${o.bemParado ? ' e o equipamento está parado' : ''}.`, impacto: 'Setor afetado sem o serviço e descumprimento do prazo (SLA) de manutenção.',
        oQueFazer: ['Abra a ordem de serviço e confira o responsável.', 'Atualize o andamento com fotos e observações.', 'Se faltar peça ou fornecedor, abra a requisição de compra.', 'Conclua a OS e avise o solicitante.'],
        rota: '/edu/infraestrutura?secao=solicitacoes', rotaRotulo: 'Abrir Solicitações e OS', popTags: ['ordem de serviço', 'sla', 'manutenção'], detalhes: [{ rotulo: 'Tipo', valor: String(o.tipo) }, { rotulo: 'Prazo', valor: data(o.prazoSla) }], desde: o.prazoSla,
      }))
    },
  },
  {
    id: 'estoque_critico', run: async (tenantId) => {
      const itens = await prisma.supItem.findMany({ where: { tenantId, ativo: true, estoqueMinimo: { gt: 0 } }, select: { id: true, nome: true, estoqueMinimo: true, saldos: { select: { quantidade: true } } }, take: 5000 })
      const crit = itens.map((i) => ({ id: i.id, nome: i.nome, minimo: i.estoqueMinimo, saldo: i.saldos.reduce((s, x) => s + x.quantidade, 0) })).filter((i) => i.saldo <= i.minimo)
      return crit.slice(0, 10).map((i) => base({
        chave: `estoque_critico:${i.id}`, regra: 'estoque_critico', departamento: 'Suprimentos e compras', titulo: `${i.nome} abaixo do mínimo`, resumo: `Saldo ${i.saldo} · mínimo ${i.minimo}`,
        problema: `O saldo de ${i.nome} (${i.saldo}) está no nível mínimo ou abaixo dele (${i.minimo}).`, impacto: 'Risco de faltar material nos setores que dependem dele.',
        oQueFazer: ['Abra Compras, estoque e vendas e confira o saldo por almoxarifado.', 'Crie a requisição de compra com a quantidade de reposição.', 'Acompanhe o pedido em Acompanhamento de compras até a entrega ao setor.'],
        rota: '/edu/suprimentos', rotaRotulo: 'Abrir Compras e estoque', popTags: ['estoque', 'reposição'], detalhes: [{ rotulo: 'Saldo atual', valor: String(i.saldo) }, { rotulo: 'Estoque mínimo', valor: String(i.minimo) }],
      }))
    },
  },
  {
    id: 'pedido_atrasado', run: async (tenantId, now) => {
      const rows = await prisma.supPedido.findMany({ where: { tenantId, status: { in: ['EMITIDO', 'PARCIALMENTE_RECEBIDO'] as any }, previsaoEntrega: { lt: now } }, orderBy: { previsaoEntrega: 'asc' }, take: 10, include: { fornecedor: { select: { razaoSocial: true, nomeFantasia: true } } } })
      return rows.map((p) => base({
        chave: `pedido_atrasado:${p.id}`, regra: 'pedido_atrasado', departamento: 'Suprimentos e compras', titulo: `Pedido ${p.numero} atrasado`, resumo: p.fornecedor.nomeFantasia || p.fornecedor.razaoSocial,
        problema: `O pedido ${p.numero} deveria ter chegado em ${data(p.previsaoEntrega)} e ainda não foi recebido.`, impacto: 'O setor solicitante segue sem o material.',
        oQueFazer: ['Contate o fornecedor e confirme a nova data.', 'Registre a observação no Acompanhamento de compras.', 'Se o atraso for longo, avalie a cotação alternativa.'],
        rota: '/edu/compras-rastreio', rotaRotulo: 'Abrir Acompanhamento de compras', popTags: ['pedido de compra', 'acompanhamento'], detalhes: [{ rotulo: 'Previsão', valor: data(p.previsaoEntrega) }, { rotulo: 'Valor', valor: brl(p.valorTotal) }], desde: p.previsaoEntrega,
      }))
    },
  },
  {
    id: 'brigada_certificado', run: async (tenantId, now) => {
      const rows = await prisma.cipBrigadista.findMany({ where: { tenantId, ativo: true, certificadoAte: { lt: new Date(now.getTime() + 30 * DIA) } }, orderBy: { certificadoAte: 'asc' }, take: 20 })
      return rows.map((b) => {
        const dias = Math.ceil((b.certificadoAte!.getTime() - now.getTime()) / DIA)
        return base({
          chave: `brigada_certificado:${b.id}`, regra: 'brigada_certificado', departamento: 'CIPA e segurança do trabalho', titulo: `Certificado de ${b.nome} ${dias < 0 ? 'vencido' : `vence em ${dias} dia(s)`}`, resumo: `Brigada · ${b.funcao.replace(/_/g, ' ')}`,
          problema: `O certificado de brigadista de ${b.nome} (${b.setor ?? 'setor não informado'}) ${dias < 0 ? `venceu em ${data(b.certificadoAte)}` : `vence em ${data(b.certificadoAte)}, daqui a ${dias} dia(s)`}.`, impacto: 'Brigada incompleta e descumprimento da exigência de brigadistas treinados.',
          oQueFazer: ['Abra CIPA > Calendário e agende o treinamento de reciclagem.', 'Confirme a presença do brigadista e a carga horária.', 'Atualize a validade do certificado em CIPA > Brigada de incêndio.'],
          rota: '/edu/cipa?secao=brigada', rotaRotulo: 'Abrir Brigada de incêndio', popTags: ['brigada', 'certificado'], detalhes: [{ rotulo: 'Brigadista', valor: b.nome }, { rotulo: 'Validade', valor: data(b.certificadoAte) }, { rotulo: 'Setor', valor: b.setor ?? '—' }], desde: b.certificadoAte,
        })
      })
    },
  },
  {
    id: 'cat_aberta', run: async (tenantId) => {
      const rows = await prisma.cipCat.findMany({ where: { tenantId, status: { in: ['REGISTRADA', 'EM_TRATATIVA'] } }, orderBy: { createdAt: 'asc' }, take: 20 })
      return rows.map((c) => base({
        chave: `cat_aberta:${c.id}`, regra: 'cat_aberta', departamento: 'CIPA e segurança do trabalho', titulo: `${c.protocolo}: providência pendente`, resumo: `${c.colaboradorNome} · ${c.gravidade}`,
        problema: `A ocorrência ${c.protocolo} (${c.colaboradorNome}, ${c.setor ?? 'setor não informado'}) ainda não teve a providência confirmada. ${c.descricao}`, impacto: 'Prazo legal de comunicação e risco de repetição do acidente.',
        oQueFazer: ['Abra o registro e reconheça o aviso.', 'Descreva e execute a providência (atendimento, sinalização, orientação da equipe).', 'Registre a providência e, se houver afastamento, comunique o órgão competente.', 'Encerre a ocorrência.'],
        rota: '/edu/cipa?secao=cat', rotaRotulo: 'Abrir Registro de CAT', popTags: ['cat', 'acidente'], detalhes: [{ rotulo: 'Gravidade', valor: c.gravidade }, { rotulo: 'Ocorrência', valor: data(c.dataOcorrencia) }, { rotulo: 'Prazo da providência', valor: data(c.prazoProvidenciaEm) }], desde: c.createdAt,
      }))
    },
  },
  {
    id: 'epi_pendente', run: async (tenantId, now) => {
      const n = await prisma.colEpiEntrega.count({ where: { tenantId, status: 'PENDENTE', createdAt: { lt: new Date(now.getTime() - 7 * DIA) } } })
      if (!n) return []
      return [base({
        chave: 'epi_pendente', regra: 'epi_pendente', departamento: 'RH', titulo: `${plural(n, 'EPI', 'EPIs')} sem retirada há mais de 7 dias`, resumo: 'Colaboradores sem o equipamento',
        problema: `${plural(n, 'EPI designado', 'EPIs designados')} ainda não ${n === 1 ? 'foi retirado' : 'foram retirados'} pelos colaboradores.`, impacto: 'Colaboradores expostos sem o equipamento de proteção.',
        oQueFazer: ['Abra Portal do colaborador > Biblioteca e EPIs (RH).', 'Contate o colaborador e o gestor do setor.', 'Registre a entrega assim que ocorrer.'],
        rota: '/edu/colaborador?aba=gestao', rotaRotulo: 'Abrir EPIs (RH)', popTags: ['epi'], detalhes: [{ rotulo: 'EPIs pendentes', valor: String(n) }],
      })]
    },
  },
  {
    id: 'ferias_vencidas', run: async (tenantId) => {
      const n = await prisma.rheFeriasPeriodo.count({ where: { tenantId, status: 'VENCIDO' } })
      if (!n) return []
      return [base({
        chave: 'ferias_vencidas', regra: 'ferias_vencidas', departamento: 'RH', titulo: plural(n, 'período de férias vencido', 'períodos de férias vencidos'), resumo: 'Férias não programadas no prazo',
        problema: `${plural(n, 'período', 'períodos')} de férias passaram do prazo concessivo sem programação.`, impacto: 'Risco trabalhista de pagamento em dobro.',
        oQueFazer: ['Abra RH > Férias e programe o gozo imediatamente.', 'Converse com o gestor para ajustar a escala.', 'Registre a programação e a ciência do colaborador.'],
        rota: '/edu/rh?secao=ferias', rotaRotulo: 'Abrir Férias', popTags: ['férias'], detalhes: [{ rotulo: 'Períodos', valor: String(n) }],
      })]
    },
  },
  {
    id: 'mec_prazo', run: async (tenantId, now) => {
      const rows = await prisma.regMecEvidencia.findMany({ where: { tenantId, status: { not: 'ATENDIDO' }, prazo: { lte: new Date(now.getTime() + 7 * DIA) } }, orderBy: { prazo: 'asc' }, take: 8 })
      return rows.map((e) => base({
        chave: `mec_prazo:${e.id}`, regra: 'mec_prazo', departamento: 'Regulatório MEC', titulo: `Evidência ${e.indicadorCodigo} com prazo em ${data(e.prazo)}`, resumo: e.indicadorNome,
        problema: `A evidência do indicador ${e.indicadorCodigo} (${e.indicadorNome}) precisa ser entregue até ${data(e.prazo)}. Responsável: ${e.responsavelNome ?? 'não definido'}.`, impacto: 'Dossiê incompleto para a comissão de avaliação do MEC.',
        oQueFazer: [`Reúna o documento: ${e.descricao}.`, 'Anexe o arquivo na evidência e confirme a pasta do kit.', 'Marque como atendida e avise a coordenação.'],
        rota: '/edu/regulatorio', rotaRotulo: 'Abrir Regulatório MEC', popTags: ['mec', 'evidência'], detalhes: [{ rotulo: 'Dimensão', valor: e.dimensao }, { rotulo: 'Prazo', valor: data(e.prazo) }, { rotulo: 'Responsável', valor: e.responsavelNome ?? '—' }], desde: e.prazo,
      }))
    },
  },
  {
    id: 'dou_prazo', run: async (tenantId, now) => {
      const rows = await prisma.reiDouPublicacao.findMany({ where: { tenantId, status: { in: ['NOVA', 'EM_ANALISE'] as any }, prazoAcaoEm: { lte: new Date(now.getTime() + 5 * DIA) } }, orderBy: { prazoAcaoEm: 'asc' }, take: 5 })
      return rows.map((p) => base({
        chave: `dou_prazo:${p.id}`, regra: 'dou_prazo', departamento: 'Reitoria', titulo: `Diário Oficial: ação até ${data(p.prazoAcaoEm)}`, resumo: p.titulo.slice(0, 90),
        problema: `A publicação "${p.titulo}" (${p.orgao ?? 'órgão não informado'}) exige ação até ${data(p.prazoAcaoEm)}.`, impacto: 'Perda de prazo regulatório.',
        oQueFazer: ['Leia a publicação e identifique a providência exigida.', 'Designe o responsável e registre o andamento.', 'Marque como tratada quando concluir.'],
        rota: '/edu/reitoria/dou', rotaRotulo: 'Abrir Diário Oficial', popTags: ['diário oficial', 'publicação'], detalhes: [{ rotulo: 'Publicada em', valor: data(p.dataPublicacao) }, { rotulo: 'Prazo', valor: data(p.prazoAcaoEm) }, { rotulo: 'Responsável', valor: p.responsavelNome ?? '—' }], desde: p.prazoAcaoEm,
      }))
    },
  },
  {
    id: 'atd_sla', run: async (tenantId, now) => {
      const rows = await prisma.atdAtendimento.findMany({ where: { tenantId, status: { in: ['EM_FILA', 'EM_ATENDIMENTO'] as any }, slaResolucaoEm: { lt: now } }, orderBy: { slaResolucaoEm: 'asc' }, take: 10 })
      return rows.map((a) => base({
        chave: `atd_sla:${a.id}`, regra: 'atd_sla', departamento: 'Atendimento', titulo: `Atendimento ${a.numero} fora do prazo`, resumo: a.assunto,
        problema: `O atendimento ${a.numero} (${a.assunto}), de ${a.solicitanteNome ?? 'solicitante'}, passou do prazo de resolução.`, impacto: 'Insatisfação do aluno e descumprimento do SLA.',
        oQueFazer: ['Abra o atendimento e responda ao solicitante.', 'Se depender de outro setor, encaminhe com prazo.', 'Resolva e registre a solução.'],
        rota: '/edu/atendimento?secao=central', rotaRotulo: 'Abrir Central de atendimento', popTags: ['atendimento', 'sla'], detalhes: [{ rotulo: 'Canal', valor: String(a.canal) }, { rotulo: 'Prazo', valor: data(a.slaResolucaoEm) }], desde: a.slaResolucaoEm,
      }))
    },
  },
  {
    id: 'acesso_alerta', run: async (tenantId) => {
      const rows = await prisma.preAlerta.findMany({ where: { tenantId, status: { in: ['ABERTO', 'RECONHECIDO'] }, severidade: 'CRITICO' }, orderBy: { createdAt: 'asc' }, take: 10 })
      return rows.map((a) => base({
        chave: `acesso_alerta:${a.id}`, regra: 'acesso_alerta', departamento: 'Segurança e acesso', titulo: `Alerta de acesso: ${a.tipo.replace(/_/g, ' ').toLowerCase()}`, resumo: a.mensagem.slice(0, 90),
        problema: a.mensagem, impacto: 'Possível falha de segurança no controle de entrada e saída.',
        oQueFazer: ['Abra Presença e acesso e confira o registro.', 'Verifique o local e a pessoa envolvida.', 'Resolva o alerta e registre a conclusão.'],
        rota: '/edu/presenca', rotaRotulo: 'Abrir Presença e acesso', popTags: ['acesso', 'portaria'], detalhes: [{ rotulo: 'Tipo', valor: a.tipo }, { rotulo: 'Registrado em', valor: data(a.createdAt) }], desde: a.createdAt,
      }))
    },
  },
  {
    id: 'lavanderia_atraso', run: async (tenantId, now) => {
      const rows = await prisma.lavRemessa.findMany({ where: { tenantId, status: { not: 'CONFERIDA' }, previsaoRetornoEm: { lt: now } }, orderBy: { previsaoRetornoEm: 'asc' }, take: 10 })
      return rows.map((r) => base({
        chave: `lavanderia_atraso:${r.id}`, regra: 'lavanderia_atraso', departamento: 'Lavanderia', titulo: `Remessa ${r.codigo} atrasada`, resumo: r.departamento,
        problema: `A remessa ${r.codigo} (${r.totalPecas} peças de ${r.departamento}) deveria ter retornado em ${data(r.previsaoRetornoEm)}. Etapa atual: ${r.status.replace(/_/g, ' ').toLowerCase()}.`, impacto: 'Setor sem a rouparia necessária.',
        oQueFazer: ['Abra a jornada da remessa e veja quem fez a última etapa.', 'Contate o responsável pela etapa seguinte.', 'Registre o avanço e confira as peças na entrega.'],
        rota: '/edu/lavanderia', rotaRotulo: 'Abrir Lavanderia', popTags: ['rouparia', 'lavanderia'], detalhes: [{ rotulo: 'Peças', valor: String(r.totalPecas) }, { rotulo: 'Previsão', valor: data(r.previsaoRetornoEm) }], desde: r.previsaoRetornoEm,
      }))
    },
  },
  {
    id: 'guia_vencendo', run: async (tenantId, now) => {
      const rows = await prisma.ctbGuia.findMany({ where: { tenantId, status: 'PENDENTE', vencimento: { lte: new Date(now.getTime() + 5 * DIA) } }, orderBy: { vencimento: 'asc' }, take: 50 })
      if (!rows.length) return []
      const total = rows.reduce((s, g) => s + g.valorTotal, 0)
      const tributos = [...new Set(rows.map((g) => g.tributo))].join(', ')
      return [base({
        chave: 'guia_vencendo', regra: 'guia_vencendo', departamento: 'Contabilidade', titulo: `${plural(rows.length, 'guia vence', 'guias vencem')} nos próximos 5 dias`, resumo: `${brl(total)} · ${tributos}`,
        problema: `${plural(rows.length, 'guia', 'guias')} (${tributos}) somando ${brl(total)} vencem até ${data(rows[rows.length - 1].vencimento)} e ainda estão pendentes. A primeira vence em ${data(rows[0].vencimento)}.`, impacto: 'Multa e juros por atraso no recolhimento.',
        oQueFazer: ['Abra Contabilidade > Guias e obrigações.', 'Confira o valor e a linha digitável de cada guia.', 'Programe o pagamento e marque a guia como paga.'],
        rota: '/edu/contabil?aba=guias', rotaRotulo: 'Abrir Guias e obrigações', popTags: ['guia', 'tributo'], detalhes: [{ rotulo: 'Guias', valor: String(rows.length) }, { rotulo: 'Valor total', valor: brl(total) }, { rotulo: 'Primeiro vencimento', valor: data(rows[0].vencimento) }], desde: rows[0].vencimento,
      })]
    },
  },
]

export async function coletarAlertas(tenantId: string, now = new Date()): Promise<Alerta[]> {
  const out: Alerta[] = []
  for (const r of REGRAS) {
    try { out.push(...(await r.run(tenantId, now))) } catch (e: any) { console.warn(`[alertas:${r.id}]`, String(e?.message || e).split('\n')[0].slice(0, 120)) }
  }
  return out
}

/** POPs, instruções de trabalho e manuais relacionados ao alerta (pelo título/conteúdo e palavras-chave). */
export async function documentosRelacionados(tenantId: string, tags: string[]) {
  if (!tags.length) return []
  return prisma.colDocumento.findMany({
    where: { tenantId, ativo: true, tipo: { in: ['POP', 'INSTRUCAO', 'MANUAL'] }, OR: tags.flatMap((t) => [{ titulo: { contains: t, mode: 'insensitive' as const } }, { descricao: { contains: t, mode: 'insensitive' as const } }]) },
    select: { id: true, tipo: true, titulo: true, descricao: true, conteudo: true, url: true }, take: 4,
  })
}
