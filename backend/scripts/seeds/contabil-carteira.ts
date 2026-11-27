/**
 * Seed da CARTEIRA DE CLIENTES do escritório de contabilidade (dados 100% fictícios): ~25 clientes (PF e PJ, vários regimes e segmentos),
 * contatos e sócios, funil comercial (leads, propostas, contratos assinados em modo SIMULADO), honorários dos 3 últimos meses (pagos e em atraso),
 * guias, tarefas das rotinas, apontamento de horas, interações, modelos de mensagem, NPS e um cliente-portal de demonstração.
 * Usa SOMENTE a API (idempotente: se já há clientes na carteira, não faz nada).
 *
 *   import { seedContabilCarteira } from './seeds/contabil-carteira'
 *   await seedContabilCarteira(api, ctx)    // api(method, path, body?) -> corpo JSON ou null em caso de erro
 *
 * ctx.loginAs (opcional): (email, senha) => api autenticada como outra pessoa; usado para o portal enviar um documento e uma mensagem.
 * criarEquipeContabilDemo(prisma, ...) cria os logins da equipe (gestor, contador, analista, financeiro) — chame antes, se quiser a carteira distribuída.
 * Não edita edu-demo-seed.ts: o seed principal (ou o e2e) chama estas funções.
 */
import { completarCNPJ, completarCPF } from '../../src/modules/contabil/carteira/documento'

export type SeedApi = (method: string, path: string, body?: any) => Promise<any>
export interface SeedCtx {
  tenantId?: string
  failures?: string[]
  loginAs?: (email: string, senha: string) => Promise<SeedApi | null> | SeedApi | null
}
export interface ResumoSeedCarteira {
  clientes: number; leads: number; propostas: number; contratos: number; honorarios: number; tarefas: number; guias: number; apontamentos: number; interacoes: number
  portal: { email: string; senha: string; cliente: string } | null; pulado?: boolean
}

const C = '/edu/contabil/carteira'
export const SENHA_PORTAL_DEMO = process.env.CTB_PORTAL_DEMO_SENHA || 'Contab@2026'   // somente demonstração
export const EMAIL_PORTAL_DEMO = 'cliente.portal@padariapaoquente.exemplo.br'
const lst = (r: any): any[] => (Array.isArray(r) ? r : r?.items ?? [])
const iso = (d: Date) => d.toISOString().slice(0, 10)
const hoje = () => new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate(), 12))
const somaDias = (n: number) => new Date(hoje().getTime() + n * 86_400_000)
const mesComp = (delta: number) => { const d = hoje(); const t = d.getUTCFullYear() * 12 + d.getUTCMonth() + delta; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}` }

/** Cria (se faltarem) os logins da equipe do escritório no tenant. Devolve os ids. Senha vem do chamador (hash bcrypt já pronto). */
export async function criarEquipeContabilDemo(prisma: any, o: { tenantId: string; clinicId: string; passwordHash: string; dominio?: string }) {
  const dom = o.dominio || 'suainstituicao.edu.br'
  const defs = [
    ['gestor.contabil', 'Helena', 'Ribeiro', 'GESTOR_CONTABIL'], ['contador1', 'Marcos', 'Teixeira', 'CONTADOR'], ['contador2', 'Patrícia', 'Andrade', 'CONTADOR'],
    ['analista.contabil', 'Bruno', 'Cavalcanti', 'ANALISTA_CONTABIL'], ['financeiro.contabil', 'Renata', 'Moura', 'FINANCE'],
  ] as const
  const out: Record<string, string> = {}
  for (const [loc, firstName, lastName, role] of defs) {
    const email = `${loc}@${dom}`
    const u = (await prisma.user.findFirst({ where: { tenantId: o.tenantId, email } })) ?? (await prisma.user.create({ data: { clinicId: o.clinicId, tenantId: o.tenantId, email, password: o.passwordHash, firstName, lastName, role } }))
    out[email] = u.id
  }
  return out
}

const NOMES_PJ: Array<[string, string, string, string, string, string]> = [
  // razão social, fantasia, regime, segmento, cnae, origem
  ['Padaria Pão Quente Ltda', 'Padaria Pão Quente', 'SIMPLES', 'Alimentação', '1091-1/02', 'Indicação'],
  ['Centro Médico Vida Plena Ltda', 'Vida Plena', 'PRESUMIDO', 'Saúde', '8630-5/03', 'Indicação'],
  ['Mercado Bom Preço Eireli', 'Bom Preço', 'SIMPLES', 'Comércio', '4712-1/00', 'Site'],
  ['Construtora Alicerce S.A.', 'Alicerce', 'REAL', 'Construção', '4120-4/00', 'Evento'],
  ['TecnoSoft Desenvolvimento Ltda', 'TecnoSoft', 'SIMPLES', 'Tecnologia', '6201-5/01', 'Site'],
  ['Escola Pequeno Mundo Ltda', 'Pequeno Mundo', 'PRESUMIDO', 'Educação', '8511-2/00', 'Indicação'],
  ['Transportes Rota Certa Ltda', 'Rota Certa', 'PRESUMIDO', 'Logística', '4930-2/02', 'Parceiro'],
  ['Restaurante Sabor da Terra Ltda', 'Sabor da Terra', 'SIMPLES', 'Alimentação', '5611-2/01', 'Indicação'],
  ['Studio Bela Forma Ltda', 'Bela Forma', 'SIMPLES', 'Serviços', '9602-5/01', 'Redes sociais'],
  ['Agropecuária Vale Verde Ltda', 'Vale Verde', 'REAL', 'Agro', '0111-3/01', 'Evento'],
  ['Auto Peças Ferrari & Filhos Ltda', 'Ferrari Autopeças', 'SIMPLES', 'Comércio', '4530-7/03', 'Site'],
  ['Consultoria Horizonte Ltda', 'Horizonte', 'PRESUMIDO', 'Serviços', '7020-4/00', 'Parceiro'],
  ['Farmácia Vida Plena Ltda', 'Vida Plena', 'SIMPLES', 'Saúde', '4771-7/01', 'Indicação'],
  ['Gráfica Imprime Mais Ltda', 'Imprime Mais', 'SIMPLES', 'Indústria', '1813-0/01', 'Site'],
  ['Hotel Pousada do Sol Ltda', 'Pousada do Sol', 'PRESUMIDO', 'Turismo', '5510-8/01', 'Evento'],
  ['Marcenaria Artes em Madeira ME', 'Artes em Madeira', 'SIMPLES', 'Indústria', '3101-2/00', 'Indicação'],
  ['Academia Corpo em Movimento Ltda', 'Corpo em Movimento', 'SIMPLES', 'Serviços', '9313-1/00', 'Redes sociais'],
  ['Laboratório Análise Precisa Ltda', 'Análise Precisa', 'PRESUMIDO', 'Saúde', '8640-2/05', 'Parceiro'],
  ['Eletro Casa Móveis Ltda', 'Eletro Casa', 'SIMPLES', 'Comércio', '4754-7/01', 'Site'],
  ['Joana Martins Design (MEI)', 'Joana Design', 'MEI', 'Serviços', '7410-2/02', 'Redes sociais'],
  ['Pedro Alves Fotografia (MEI)', 'Pedro Foto', 'MEI', 'Serviços', '7420-0/01', 'Indicação'],
  ['Cooperativa de Catadores Recicla Bem', 'Recicla Bem', 'ISENTA', 'Terceiro setor', '3811-4/00', 'Parceiro'],
]
const NOMES_PF: Array<[string, string]> = [['Carlos Eduardo Nunes', 'Médico autônomo'], ['Fernanda Lima Costa', 'Profissional liberal'], ['Roberto Siqueira', 'Investidor']]
const CONTATOS = [['Ana Paula', 'FINANCEIRO'], ['Ricardo', 'SOCIO'], ['Juliana', 'FISCAL'], ['Marcelo', 'CONTATO_GERAL']] as const

export async function seedContabilCarteira(api: SeedApi, ctx: SeedCtx = {}): Promise<ResumoSeedCarteira> {
  const falha = (m: string) => ctx.failures?.push(`seedContabilCarteira: ${m}`)
  const r: ResumoSeedCarteira = { clientes: 0, leads: 0, propostas: 0, contratos: 0, honorarios: 0, tarefas: 0, guias: 0, apontamentos: 0, interacoes: 0, portal: null }
  const existentes = await api('GET', `${C}/clientes?pageSize=1`)
  if (existentes && (existentes.total ?? lst(existentes).length) > 0) return { ...r, pulado: true }
  const op = async (m: string, p: string, b?: any, rotulo?: string) => { const x = await api(m, p, b); if (x === null || x === undefined) falha(`${m} ${p}${rotulo ? ' (' + rotulo + ')' : ''}`); return x }

  // ---- equipe e configuração ----
  const opcoes = await op('GET', `${C}/clientes/opcoes`)
  const equipe: Array<{ id: string; nome: string; cargo: string }> = opcoes?.equipe ?? []
  const contadores = equipe.filter((u) => ['CONTADOR', 'GESTOR_CONTABIL'].includes(u.cargo))
  const analistas = equipe.filter((u) => u.cargo === 'ANALISTA_CONTABIL')
  const resp = contadores.length ? contadores : equipe
  await op('PUT', `${C}/config`, { nomeEscritorio: 'SUA INSTITUIÇÃO — Contabilidade', capacidadePadrao: 12, custoHora: 85 })
  await op('POST', `${C}/tarefa-modelos/padrao`, {})

  // ---- clientes ----
  const clientes: Array<{ id: string; nome: string; regime: string | null; tipo: string; status: string }> = []
  let seq = 0
  const criar = async (d: any) => {
    const c = await op('POST', `${C}/clientes`, d, d.nome)
    if (c?.id) { clientes.push({ id: c.id, nome: c.nome, regime: c.regime, tipo: c.tipo, status: c.status }); r.clientes++ }
    return c
  }
  for (const [i, [nome, fantasia, regime, segmento, cnae, origem]] of NOMES_PJ.entries()) {
    const mei = regime === 'MEI'
    const doc = mei ? completarCPF(String(310000000 + i * 7919)) : completarCNPJ(String(10203040 + i * 104729).padStart(8, '0') + '0001')
    const status = i === 21 ? 'ENCERRADO' : i === 20 ? 'SUSPENSO' : i >= 18 ? 'PROSPECTO' : 'ATIVO'
    const c = await criar({
      tipo: mei ? 'PF' : 'PJ', documento: doc, nome, nomeFantasia: fantasia, status: status === 'ENCERRADO' ? 'ATIVO' : status, regime, cnaePrincipal: cnae, segmento, origem,
      responsavelId: resp.length ? resp[i % resp.length].id : undefined, analistaId: analistas.length && i % 3 === 0 ? analistas[0].id : undefined,
      dataAbertura: iso(somaDias(-365 * (2 + (i % 9)) - i * 11 + (i % 5) * 30)), email: `contato@${fantasia.toLowerCase().replace(/[^a-z0-9]/g, '')}.exemplo.br`, telefone: `(11) 3${String(100 + i).padStart(3, '0')}-${String(1000 + i * 37).slice(0, 4)}`,
      endereco: { cep: '01310-100', logradouro: 'Av. Exemplo', numero: String(100 + i), bairro: 'Centro', cidade: ['São Paulo', 'Campinas', 'Santos', 'Sorocaba'][i % 4], uf: 'SP' },
      tags: [segmento.toLowerCase(), ...(i % 4 === 0 ? ['prioritário'] : []), ...(regime === 'SIMPLES' ? ['simples'] : [])], observacoes: i % 6 === 0 ? 'Cliente com folha de pagamento e pró-labore. Atenção ao fechamento do dia 5.' : undefined,
      baseLegal: undefined,
    })
    if (!c?.id) continue
    seq++
    const [cn, papel] = CONTATOS[i % CONTATOS.length]
    await op('POST', `${C}/clientes/${c.id}/contatos`, { nome: `${cn} ${fantasia.split(' ')[0]}`, papel, email: `${cn.toLowerCase().replace(/\s/g, '')}@${fantasia.toLowerCase().replace(/[^a-z0-9]/g, '')}.exemplo.br`, telefone: '(11) 99999-0000', whatsapp: '(11) 99999-0000', principal: true })
    if (i % 3 === 0) await op('POST', `${C}/clientes/${c.id}/contatos`, { nome: 'Contador anterior', papel: 'OUTRO', email: 'anterior@exemplo.com.br' })
    if (!mei && i % 2 === 0) {
      await op('POST', `${C}/clientes/${c.id}/socios`, { nome: `Sócio ${i + 1} Fundador`, cpf: completarCPF(String(120000000 + i * 3571)), participacao: 60, administrador: true })
      await op('POST', `${C}/clientes/${c.id}/socios`, { nome: `Sócia ${i + 1} Investidora`, cpf: completarCPF(String(220000000 + i * 4999)), participacao: 40, administrador: false })
    }
    await op('PUT', `${C}/clientes/${c.id}/lgpd`, { baseLegal: 'EXECUCAO_CONTRATO' })
  }
  for (const [i, [nome, perfil]] of NOMES_PF.entries()) {
    await criar({ tipo: 'PF', documento: completarCPF(String(450000000 + i * 6007)), nome, status: 'ATIVO', regime: 'PF', segmento: perfil, origem: 'Indicação', responsavelId: resp.length ? resp[(i + 1) % resp.length].id : undefined, email: `${nome.split(' ')[0].toLowerCase()}@exemplo.com.br`, telefone: '(11) 98888-7777', tags: ['pessoa física', 'IR'] })
  }
  // encerrado: o cliente 22 (índice 21) passa por ATIVO e é encerrado com motivo
  const enc = clientes.find((c) => c.nome.startsWith('Cooperativa'))
  if (enc) { await op('PATCH', `${C}/clientes/${enc.id}/status`, { status: 'ENCERRADO', motivo: 'Mudança de escritório (cliente optou por outro prestador).' }); enc.status = 'ENCERRADO' }

  // ---- funil comercial ----
  const leads: any[] = []
  const novoLead = async (d: any) => { const l = await op('POST', `${C}/leads`, d, d.nome); if (l?.id) { leads.push(l); r.leads++ } return l }
  const lA = await novoLead({ nome: 'Oficina Mecânica Rápido Certo', tipo: 'PJ', email: 'oficina@exemplo.com.br', telefone: '(11) 3333-1000', origem: 'Site', segmento: 'Serviços', valorEstimado: 780, proximoContato: iso(somaDias(2)), observacoes: 'Pediu orçamento pelo formulário.' })
  const lB = await novoLead({ nome: 'Pet Shop Amigo Fiel', tipo: 'PJ', email: 'petshop@exemplo.com.br', origem: 'Indicação', segmento: 'Comércio', valorEstimado: 950, proximoContato: iso(somaDias(5)) })
  const lC = await novoLead({ nome: 'Lucas Ferreira Arquitetura', tipo: 'PF', origem: 'Redes sociais', segmento: 'Serviços', valorEstimado: 640 })
  const lD = await novoLead({ nome: 'Distribuidora Norte Sul Ltda', tipo: 'PJ', documento: completarCNPJ('55667788' + '0001'), email: 'financeiro@nortesul.exemplo.br', origem: 'Evento', segmento: 'Logística', valorEstimado: 2400 })
  const lE = await novoLead({ nome: 'Clínica de Estética Bella Vita', tipo: 'PJ', documento: completarCNPJ('66778899' + '0001'), origem: 'Parceiro', segmento: 'Saúde', valorEstimado: 1500 })
  const lF = await novoLead({ nome: 'Loja Virtual Cantinho Geek', tipo: 'PJ', origem: 'Site', segmento: 'Comércio', valorEstimado: 890 })
  if (lF?.id) await op('PATCH', `${C}/leads/${lF.id}/etapa`, { etapa: 'PERDIDO', motivoPerda: 'Fechou com contador do bairro (preço).' })
  const escopo = [{ servico: 'Contabilidade mensal', descricao: 'Escrituração, balancetes e demonstrações.' }, { servico: 'Obrigações fiscais', descricao: 'Apuração e guias de impostos federais, estaduais e municipais.' }, { servico: 'Departamento pessoal', descricao: 'Folha de até 5 funcionários, admissões e rescisões.' }]
  // lD: lead -> proposta aceita -> contrato assinado (SIMULADO) -> ativo
  if (lD?.id) {
    const conv = await op('POST', `${C}/leads/${lD.id}/converter`, { regime: 'PRESUMIDO' })
    const p = await op('POST', `${C}/propostas`, { leadId: lD.id, titulo: 'Contabilidade completa — Distribuidora Norte Sul', valorMensal: 2400, escopo, validadeAte: iso(somaDias(15)), reajusteIndice: 'IPCA' })
    if (p?.id) {
      r.propostas++
      await op('PATCH', `${C}/propostas/${p.id}/status`, { status: 'ENVIADA' }); await op('PATCH', `${C}/propostas/${p.id}/status`, { status: 'ACEITA' })
      const ct = await op('POST', `${C}/propostas/${p.id}/gerar-contrato`, { inicio: iso(somaDias(-40)), diaVencimento: 10, reajustePercentual: 5 })
      if (ct?.id) {
        r.contratos++
        await op('POST', `${C}/contratos/${ct.id}/enviar-assinatura`, {})
        await op('POST', `${C}/contratos/${ct.id}/assinar`, { parte: 'ESCRITORIO', nome: 'Helena Ribeiro' }); await op('POST', `${C}/contratos/${ct.id}/assinar`, { parte: 'CLIENTE', nome: 'Diretor da Norte Sul' })
        if (conv?.cliente?.id) clientes.push({ id: conv.cliente.id, nome: 'Distribuidora Norte Sul Ltda', regime: 'PRESUMIDO', tipo: 'PJ', status: 'ATIVO' })
      }
    }
  }
  // lE: proposta enviada (aguardando resposta); lB: proposta em rascunho
  if (lE?.id) { const p = await op('POST', `${C}/propostas`, { leadId: lE.id, titulo: 'Contabilidade — Bella Vita', valorMensal: 1500, escopo: escopo.slice(0, 2), validadeAte: iso(somaDias(10)) }); if (p?.id) { r.propostas++; await op('PATCH', `${C}/propostas/${p.id}/status`, { status: 'ENVIADA' }) } }
  if (lB?.id) { const p = await op('POST', `${C}/propostas`, { leadId: lB.id, titulo: 'Contabilidade — Amigo Fiel', valorMensal: 950, escopo: escopo.slice(0, 2) }); if (p?.id) r.propostas++ }

  // ---- contratos de honorários dos clientes ativos ----
  const ativos = clientes.filter((c) => c.status === 'ATIVO' || c.status === 'SUSPENSO')
  const base: Record<string, number> = { MEI: 180, SIMPLES: 650, PRESUMIDO: 1450, REAL: 3200, PF: 320, ISENTA: 400 }
  let k = 0
  for (const c of ativos) {
    if (c.nome.startsWith('Distribuidora')) continue   // já tem contrato (funil)
    k++
    const valor = Math.round((base[c.regime ?? 'SIMPLES'] ?? 600) * (1 + (k % 5) * 0.12))
    const ct = await op('POST', `${C}/contratos`, { clienteId: c.id, valorMensal: valor, escopo: escopo.slice(0, 1 + (k % 3)), inicio: iso(somaDias(-200 - k * 17)), diaVencimento: [5, 10, 15, 20][k % 4], reajusteMes: ((k * 3) % 12) + 1, reajustePercentual: k % 3 === 0 ? 4.5 : null, reajusteIndice: 'IPCA' }, c.nome)
    if (!ct?.id) continue
    r.contratos++
    await op('POST', `${C}/contratos/${ct.id}/enviar-assinatura`, {})
    await op('POST', `${C}/contratos/${ct.id}/assinar`, { parte: 'ESCRITORIO', nome: 'Helena Ribeiro' })
    await op('POST', `${C}/contratos/${ct.id}/assinar`, { parte: 'CLIENTE', nome: `Responsável ${c.nome.split(' ')[0]}` })
  }

  // ---- honorários (3 meses), baixas e atrasos ----
  for (const delta of [-2, -1, 0]) {
    const g = await op('POST', `${C}/honorarios/gerar`, { competencia: mesComp(delta) })
    if (g?.criados) r.honorarios += g.criados
  }
  const hons = lst(await op('GET', `${C}/honorarios?pageSize=200&status=ATRASADO`))
  const atrasados = hons.filter((h) => new Date(h.vencimento) < hoje())
  let n = 0
  for (const h of atrasados) { n++; if (n % 5 !== 0 && n % 7 !== 0) await op('POST', `${C}/honorarios/${h.id}/baixar`, { forma: ['PIX', 'BOLETO', 'TRANSFERENCIA'][n % 3] }) }   // o resto fica inadimplente

  // ---- guias (camada local) ----
  const tipos = ['DAS', 'DARF', 'GPS', 'FGTS', 'ISS']
  for (const [i, c] of ativos.slice(0, 18).entries()) {
    const gs = [{ tipo: c.regime === 'SIMPLES' || c.regime === 'MEI' ? 'DAS' : tipos[1 + (i % 4)], competencia: mesComp(-1), vencimento: iso(somaDias(i % 4 === 0 ? -3 : (i % 7) + 1)), valor: 180 + i * 47.5 }]
    if (i % 3 === 0) gs.push({ tipo: 'FGTS', competencia: mesComp(-1), vencimento: iso(somaDias(10 + i)), valor: 320 + i * 11 })
    for (const g of gs) { const x = await op('POST', `${C}/clientes/${c.id}/guias`, g); if (x?.id) r.guias++ }
  }

  // ---- tarefas (rotinas) ----
  for (const delta of [-1, 0]) { const t = await op('POST', `${C}/tarefas/gerar`, { competencia: mesComp(delta) }); if (t?.criadas) r.tarefas += t.criadas }
  const tarefas = lst(await op('GET', `${C}/tarefas?pageSize=300&competencia=${mesComp(-1)}`))
  let t = 0
  for (const tk of tarefas) {
    t++
    if (t % 3 === 0) await op('PATCH', `${C}/tarefas/${tk.id}/status`, { status: 'CONCLUIDA', forcar: true })
    else if (t % 5 === 0) await op('PATCH', `${C}/tarefas/${tk.id}/status`, { status: 'EM_ANDAMENTO' })
    else if (t % 11 === 0) await op('PATCH', `${C}/tarefas/${tk.id}/status`, { status: 'AGUARDANDO_CLIENTE' })
  }

  // ---- apontamento de horas ----
  for (const [i, c] of ativos.slice(0, 16).entries()) {
    for (const [j, min] of [90, 45, 120].entries()) { const a = await op('POST', `${C}/apontamentos`, { clienteId: c.id, data: iso(somaDias(-(j * 6 + (i % 5)))), minutos: min + (i % 4) * 15, categoria: ['FECHAMENTO', 'FISCAL', 'FOLHA'][j], descricao: 'Rotina do mês' }); if (a?.id) r.apontamentos++ }
  }

  // ---- comunicação ----
  const modelos = [
    { nome: 'Lembrete de honorário', canal: 'EMAIL', assunto: 'Honorários {{competencia}} — {{cliente}}', corpo: 'Olá {{contato}},\n\nSegue o lembrete do honorário de {{competencia}} no valor de {{valor_honorario}}, com vencimento em {{vencimento}}.\n\nAtenciosamente,\n{{responsavel}} · {{escritorio}}' },
    { nome: 'Pedido de documentos do mês', canal: 'WHATSAPP', corpo: 'Oi {{contato}}! Para fechar a contabilidade da {{nome_fantasia}} de {{competencia}}, precisamos do extrato bancário e das notas do mês. Pode enviar pelo portal? Obrigado!' },
    { nome: 'Parabéns pelo aniversário da empresa', canal: 'EMAIL', assunto: 'Parabéns, {{nome_fantasia}}!', corpo: 'Hoje ({{data_hoje}}) é um dia especial para a {{cliente}}. Conte conosco!\n{{escritorio}}' },
  ]
  const mods: any[] = []
  for (const m of modelos) { const x = await op('POST', `${C}/modelos-msg`, m, m.nome); if (x?.id) mods.push(x) }
  for (const [i, c] of ativos.slice(0, 14).entries()) {
    const tipo = (['LIGACAO', 'REUNIAO', 'WHATSAPP', 'EMAIL'] as const)[i % 4]
    const x = await op('POST', `${C}/clientes/${c.id}/interacoes`, { tipo, direcao: i % 3 === 0 ? 'ENTRADA' : 'SAIDA', assunto: ['Dúvida sobre DAS', 'Reunião de planejamento', 'Envio de documentos', 'Revisão do contrato'][i % 4], resumo: 'Registro manual da conversa com o cliente.', em: iso(somaDias(-(i * 9 + 2))), lembreteEm: i % 4 === 0 ? iso(somaDias(i % 8 - 2)) : undefined })
    if (x?.id) r.interacoes++
    if (i < 3 && mods[0]) { const e = await op('POST', `${C}/clientes/${c.id}/enviar`, { modeloId: mods[0].id }); if (e?.interacao) r.interacoes++ }
    if (i % 2 === 0) await op('POST', `${C}/clientes/${c.id}/nps`, { nota: [10, 9, 8, 6, 9, 10, 3][i % 7], comentario: i % 7 === 6 ? 'Demora nas respostas.' : 'Atendimento atencioso.' })
  }

  // ---- cliente-portal de demonstração ----
  const demo = clientes.find((c) => c.nome.startsWith('Padaria'))
  if (demo) {
    const ac = await op('POST', `${C}/clientes/${demo.id}/portal/acesso`, { email: EMAIL_PORTAL_DEMO, nome: 'Dona Maria da Padaria', senha: SENHA_PORTAL_DEMO }, 'portal')
    if (ac?.userId) {
      r.portal = { email: EMAIL_PORTAL_DEMO, senha: SENHA_PORTAL_DEMO, cliente: demo.nome }
      await op('POST', `${C}/clientes/${demo.id}/mensagens-portal`, { texto: 'Olá, Dona Maria! Falta apenas o extrato do mês passado para fecharmos a contabilidade. Pode enviar por aqui.' })
      await op('POST', `${C}/clientes/${demo.id}/guias`, { tipo: 'DAS', competencia: mesComp(-1), vencimento: iso(somaDias(4)), valor: 612.4 }); r.guias++
      const portalApi = ctx.loginAs ? await ctx.loginAs(EMAIL_PORTAL_DEMO, SENHA_PORTAL_DEMO) : null
      if (portalApi) {
        const nota = `data:text/plain;base64,${Buffer.from('Notas emitidas (demonstração)\nNF 101;R$ 1.200,00\nNF 102;R$ 860,00\n').toString('base64')}`
        await portalApi('POST', `${C}/portal/documentos`, { tipo: 'NOTAS_EMITIDAS', competencia: mesComp(-1), nome: 'notas-emitidas.txt', dataUrl: nota })
        await portalApi('POST', `${C}/portal/mensagens`, { texto: 'Bom dia! Mando o extrato amanhã, ok?' })
      }
    }
  }
  return r
}
