/**
 * Seed de demonstração do módulo JURÍDICO (EduMaster Pro). Usa a API REAL com token ADMIN, no estilo de scripts/edu-demo-seed.ts.
 * Uso a partir do edu-demo-seed (sem editá-lo):  import { seedJuridico } from './seeds/juridico'  ->  await seedJuridico(c.api, c)
 * Uso isolado:  DATABASE_URL=... API_URL=http://localhost:3000/api npx tsx scripts/seeds/juridico.ts   (login admin@suainstituicao.edu.br / Demo@2026)
 * Todos os textos, números de processo e valores são FICTÍCIOS (números CNJ com dígito verificador válido, mas inexistentes). Rodar em banco limpo.
 */
import { gerarCnj } from '../../src/modules/juridico/logic'

export interface SeedCtx {
  tenantId?: string
  mk?: (email: string, password: string, firstName: string, lastName: string, role: string) => Promise<any>
  failures?: string[]
}
type Api = (method: string, path: string, body?: any) => Promise<any>

const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString()
const ymd = (n: number) => day(n).slice(0, 10)
const J = '/edu/juridico'

export async function seedJuridico(api: Api, ctx: SeedCtx = {}) {
  const S: Record<string, any> = {}
  const post = (p: string, b: any) => api('POST', `${J}${p}`, b)
  const ok = <T,>(x: T | null | undefined, tag: string): T => { if (!x) ctx.failures?.push(`seedJuridico: falhou ${tag}`); return x as T }

  // equipe jurídica
  if (ctx.mk) await ctx.mk('juridico@suainstituicao.edu.br', 'Demo@2026', 'Renata', 'Siqueira', 'LEGAL')

  // ---------------------------------------------------------------- escritórios e advogados
  const e1 = ok(await post('/escritorios', { nome: 'Siqueira & Moraes Advogados Associados', cnpj: '11.222.333/0001-44', contatoNome: 'Dr. Paulo Moraes', email: 'contato@siqueiramoraes.example', telefone: '(11) 3000-1000', honorarios: 'Êxito de 10% + pro labore mensal' }), 'escritorio1')
  const e2 = ok(await post('/escritorios', { nome: 'Barros Lima Advocacia Trabalhista', cnpj: '55.666.777/0001-88', contatoNome: 'Dra. Helena Lima', email: 'helena@barroslima.example', telefone: '(11) 3000-2000' }), 'escritorio2')
  const a1 = ok(await post('/advogados', { nome: 'Paulo Moraes', oab: 'OAB/SP 123.456', tipo: 'EXTERNO', escritorioId: e1?.id, email: 'paulo@siqueiramoraes.example' }), 'adv1')
  const a2 = ok(await post('/advogados', { nome: 'Helena Lima', oab: 'OAB/SP 234.567', tipo: 'EXTERNO', escritorioId: e2?.id }), 'adv2')
  const a3 = ok(await post('/advogados', { nome: 'Renata Siqueira', oab: 'OAB/SP 345.678', tipo: 'INTERNO', email: 'juridico@suainstituicao.edu.br' }), 'adv3')
  S.adv = [a1, a2, a3]

  // ---------------------------------------------------------------- acervo documental
  const docs: Array<[string, string, string, string | null, number | null, boolean?]> = [
    ['CONVENIO', 'Convênio de estágio com a Prefeitura Municipal', 'Prefeitura Municipal', 'VIGENTE', 25],
    ['PARCERIA', 'Parceria com o Hospital Santa Clara (campo de prática)', 'Hospital Santa Clara', 'VIGENTE', 55],
    ['COOPERACAO', 'Acordo de cooperação acadêmica com a Universidade do Porto', 'Universidade do Porto', 'VIGENTE', 85],
    ['FISCAL', 'Certidão Negativa de Débitos Federais', 'Receita Federal / PGFN', 'VIGENTE', 12],
    ['INTERNO', 'Regimento interno de contratações', 'Instituição', 'VIGENTE', 400],
    ['TRABALHISTA', 'Acordo coletivo de trabalho com o sindicato docente', 'Sindicato dos Professores', 'VIGENTE', 150, true],
    ['CONTRATO', 'Contrato-modelo de prestação de serviços educacionais (aluno)', 'Alunos', 'VIGENTE', 320],
    ['CONVENIO', 'Convênio com o Conselho Regional de Odontologia', 'CRO-SP', 'RASCUNHO', null],
  ]
  S.docs = []
  for (const [categoria, titulo, partes, status, dias, conf] of docs) {
    const d = await post('/documentos', { categoria, titulo, partes, status, vigenciaInicio: ymd(-300), ...(dias != null ? { vigenciaFim: ymd(dias) } : {}), responsavelNome: 'Renata Siqueira', confidencial: !!conf, tags: [categoria.toLowerCase(), 'demo'] })
    if (d) S.docs.push(d); else ctx.failures?.push(`seedJuridico: documento ${titulo}`)
  }
  if (S.docs[0]) {
    await post(`/documentos/${S.docs[0].id}/versoes`, { resumoAlteracoes: 'Versão inicial assinada pelas partes.', vigenciaInicio: ymd(-300), vigenciaFim: ymd(25) })
    await post(`/documentos/${S.docs[0].id}/versoes`, { resumoAlteracoes: 'Aditivo: inclusão de vagas de estágio em Odontologia.', vigenciaInicio: ymd(-30), vigenciaFim: ymd(25) })
  }

  // ---------------------------------------------------------------- contratos
  const ctrs: Array<[string, string, string, number, number, number | null, boolean]> = [
    ['PRESTACAO_SERVICOS', 'Serviços de vigilância patrimonial 24h', 'Guardian Segurança Ltda', 18500, -320, 45, false],
    ['PRESTACAO_SERVICOS', 'Serviços de limpeza e conservação', 'Limpex Serviços Gerais Ltda', 24200, -100, 265, true],
    ['TECNOLOGIA', 'Licença do sistema de gestão acadêmica (SaaS)', 'EduTech Sistemas S.A.', 9800, -200, 70, true],
    ['FORNECIMENTO', 'Fornecimento de materiais odontológicos para a clínica-escola', 'DentalMed Distribuidora', 31000, -60, 305, false],
    ['TRABALHO', 'Contrato de trabalho — Coordenador de curso (modelo)', 'Prof. Marcos Albuquerque', 14500, -700, 400, false],
  ]
  S.contratos = []
  for (const [tipo, objeto, contraparteNome, valor, ini, fim, renov] of ctrs) {
    const c = await post('/contratos', { tipo, objeto, contraparteNome, valor, periodicidade: 'MENSAL', indiceReajuste: 'IPCA', reajusteMes: 3, vigenciaInicio: ymd(ini), vigenciaFim: ymd(fim as number), renovacaoAutomatica: renov, avisoPrevioDias: 60, multaRescisoria: '20% do saldo contratual', responsavelNome: 'Renata Siqueira' })
    if (c) { await post(`/contratos/${c.id}/ativar`, {}); S.contratos.push(c) } else ctx.failures?.push(`seedJuridico: contrato ${objeto}`)
  }

  // ---------------------------------------------------------------- imóveis e aluguéis
  const im1 = ok(await post('/imoveis', { apelido: 'Campus Sede', tipo: 'PREDIO', propriedade: 'PROPRIO', logradouro: 'Av. das Nações', numero: '1000', cidade: 'São Paulo', uf: 'SP', cep: '01310-100', matricula: '45.321 - 3º RI', inscricaoIptu: '012.345.0001-2', areaM2: 12500 }), 'imovel1')
  const im2 = ok(await post('/imoveis', { apelido: 'Anexo Centro (prédio alugado)', tipo: 'PREDIO', propriedade: 'ALUGADO', logradouro: 'Rua Direita', numero: '250', cidade: 'São Paulo', uf: 'SP', areaM2: 1800 }), 'imovel2')
  const im3 = ok(await post('/imoveis', { apelido: 'Sala comercial — Polo Campinas', tipo: 'POLO', propriedade: 'ALUGADO', logradouro: 'Rua Barão de Jaguara', numero: '77', cidade: 'Campinas', uf: 'SP', areaM2: 220 }), 'imovel3')
  const im4 = ok(await post('/imoveis', { apelido: 'Terreno para expansão (em negociação)', tipo: 'TERRENO', propriedade: 'EM_NEGOCIACAO', cidade: 'São Paulo', uf: 'SP', areaM2: 6000 }), 'imovel4')
  S.imoveis = [im1, im2, im3, im4]
  if (im2) {
    const l = await post('/locacoes', { imovelId: im2.id, natureza: 'LOCACAO_PAGA', locadorNome: 'Imobiliária Centro Antigo Ltda', locadorDoc: '22.333.444/0001-55', locatarioNome: 'SUA INSTITUIÇÃO', valorMensal: 42000, diaVencimento: 10, indiceReajuste: 'IGPM', mesReajuste: 6, vigenciaInicio: ymd(-150), vigenciaFim: ymd(580), garantiaTipo: 'CAUCAO', garantiaValor: 126000, garantiaDetalhe: '3 aluguéis em depósito', multaRescisoria: '3 aluguéis proporcionais ao prazo restante' })
    if (l) { await post(`/locacoes/${l.id}/ativar`, {}); await post(`/locacoes/${l.id}/parcelas/gerar`, {}); S.locacao1 = l }
  }
  if (im3) {
    const l = await post('/locacoes', { imovelId: im3.id, natureza: 'LOCACAO_PAGA', locadorNome: 'Marta Coelho Imóveis', locatarioNome: 'SUA INSTITUIÇÃO', valorMensal: 6800, diaVencimento: 5, indiceReajuste: 'IPCA', vigenciaInicio: ymd(-400), vigenciaFim: ymd(62), garantiaTipo: 'FIADOR', garantiaDetalhe: 'Fiador: Sr. Antônio Coelho (imóvel quitado)' })
    if (l) { await post(`/locacoes/${l.id}/ativar`, {}); await post(`/locacoes/${l.id}/parcelas/gerar`, {}); S.locacao2 = l }
  }
  if (im1) {
    const l = await post('/locacoes', { imovelId: im1.id, natureza: 'LOCACAO_RECEBIDA', locadorNome: 'SUA INSTITUIÇÃO', locatarioNome: 'Cantina Sabor & Arte ME', valorMensal: 3500, diaVencimento: 15, indiceReajuste: 'FIXO', percentualFixo: 5, vigenciaInicio: ymd(-30), vigenciaFim: ymd(700), garantiaTipo: 'SEGURO_FIANCA', garantiaDetalhe: 'Apólice de seguro-fiança vinculada ao contrato' })
    if (l) { await post(`/locacoes/${l.id}/ativar`, {}); await post(`/locacoes/${l.id}/parcelas/gerar`, {}) }
  }
  if (im4) await post('/locacoes', { imovelId: im4.id, natureza: 'COMPRA', locadorNome: 'Espólio de J. Almeida', locatarioNome: 'SUA INSTITUIÇÃO', valorMensal: 0, vigenciaInicio: ymd(0), vigenciaFim: ymd(180), emNegociacao: true, condicoes: 'Proposta de compra em análise; due diligence da matrícula pendente.' })
  // quita as parcelas já vencidas da locação 1 e deixa 2 em atraso
  for (const loc of [S.locacao1, S.locacao2]) {
    if (!loc) continue
    const ps = await api('GET', `${J}/parcelas?locacaoId=${loc.id}&status=ABERTA&pageSize=200`)
    const vencidas = (ps?.items || []).filter((p: any) => new Date(p.vencimento).getTime() < Date.now())
    for (const p of vencidas.slice(0, Math.max(0, vencidas.length - 2))) await post(`/parcelas/${p.id}/pagar`, { pagoEm: p.vencimento })
  }

  // ---------------------------------------------------------------- polos EAD (integração com modalidades/polos)
  let polos = (await api('GET', '/edu/modalidades/polos?pageSize=50'))?.items || []
  if (!polos.length) {
    for (const [cod, nome, cid] of [['J01', 'Polo Centro — São Paulo', 'São Paulo'], ['J02', 'Polo Campinas', 'Campinas'], ['J03', 'Polo Recife', 'Recife']]) {
      const p = await api('POST', '/edu/modalidades/polos', { codigo: cod, nome, cidade: cid, uf: cid === 'Recife' ? 'PE' : 'SP', capacidade: 120 })
      if (p) polos.push(p)
    }
  }
  S.contratosPolo = []
  for (const [i, polo] of polos.slice(0, 2).entries()) {
    const c = await post('/contratos-polo', {
      poloId: polo.id, gestorNome: i ? 'Carlos Eduardo Pinheiro' : 'Mariana Teixeira Gomes', gestorDoc: i ? '321.654.987-00' : '123.456.789-09', gestorEmail: `gestor${i + 1}@polo.example`,
      objeto: `Gestão e operação do ${polo.nome} como polo de apoio presencial.`, condicoes: 'Polo funciona em dias úteis e aos sábados em dias de prova presencial; manter laboratório de informática e biblioteca mínima.',
      patrimonioCedido: [{ descricao: '20 computadores para laboratório', tombamento: `PAT-${i + 1}-001`, valor: 48000, estado: 'BOM' }, { descricao: 'Projetor multimídia', tombamento: `PAT-${i + 1}-002`, valor: 3500, estado: 'BOM' }],
      direitosInstituicao: 'Fiscalizar o polo, auditar registros e aplicar a marca institucional.', deveresInstituicao: 'Repassar a comissão até o dia 10, fornecer material e treinamento.',
      direitosGestor: 'Receber a comissão pactuada e usar o espaço cedido.', deveresGestor: 'Manter a estrutura mínima, atender os alunos, guardar o patrimônio e prestar contas mensalmente.',
      comissionamentoTipo: i ? 'VALOR_POR_ALUNO' : 'PERCENTUAL_MENSALIDADE', comissionamentoPercentual: i ? undefined : 12, comissionamentoValor: i ? 45 : undefined,
      vigenciaInicio: ymd(-180), vigenciaFim: ymd(i ? 40 : 550), prazoMeses: 24, avisoPrevioDias: 90, rescisaoCondicoes: 'Rescisão por descumprimento grave ou por denúncia com aviso prévio de 90 dias; patrimônio devolvido em 15 dias.', multaRescisoria: '3 comissões mensais médias',
    })
    if (c) { await post(`/contratos-polo/${c.id}/ativar`, {}); S.contratosPolo.push(c) } else ctx.failures?.push(`seedJuridico: contrato do polo ${polo.nome}`)
  }

  // ---------------------------------------------------------------- processos
  let seq = 1000
  const P = async (b: any, extra?: (p: any) => Promise<void>) => {
    seq++
    const j = b.area === 'TRABALHISTA' ? 5 : 8, tr = b.area === 'TRABALHISTA' ? 2 : 26
    const p = await post('/processos', { numeroCnj: gerarCnj(seq, new Date(b.dataDistribuicao || Date.now()).getFullYear(), j, tr, b.area === 'TRABALHISTA' ? 17 : 100), tribunal: b.area === 'TRABALHISTA' ? 'TRT-2' : 'TJSP', uf: 'SP', comarca: 'São Paulo', posicao: 'REU', ...b })
    if (!p) { ctx.failures?.push(`seedJuridico: processo ${b.assunto}`); return null }
    if (extra) await extra(p)
    return p
  }
  const cobr = (n: number, d: number, risco: string, prov: number, extra: any = {}) => P({ area: 'CONSUMIDOR', assunto: `Cobrança indevida de mensalidade já quitada (aluno ${n})`, classe: 'Procedimento Comum Cível', vara: '3ª Vara Cível', valorCausa: 8000 + n * 1500, risco, provisaoValor: prov, dataDistribuicao: ymd(d), causaRaiz: 'COBRANCA_INDEVIDA', setorOrigem: 'Financeiro/Cobrança', tipoOrigem: 'Aluno', advogadoId: a1?.id, escritorioId: e1?.id, ...extra })
  const pc1 = await cobr(1, -40, 'PROVAVEL', 6000, { resumo: 'Aluno alega negativação após acordo quitado.' })
  await cobr(2, -95, 'POSSIVEL', 0)
  const pc3 = await cobr(3, -200, 'PROVAVEL', 9500)
  await cobr(4, -30, 'POSSIVEL', 0)
  const pt1 = await P({ area: 'TRABALHISTA', assunto: 'Horas extras e hora-atividade de professor horista', classe: 'Reclamação Trabalhista', vara: '12ª Vara do Trabalho', valorCausa: 85000, risco: 'PROVAVEL', provisaoValor: 38000, dataDistribuicao: ymd(-70), causaRaiz: 'TRABALHISTA_HORAS_EXTRAS', setorOrigem: 'RH', tipoOrigem: 'Docente', advogadoId: a2?.id, escritorioId: e2?.id })
  await P({ area: 'TRABALHISTA', assunto: 'Horas extras — técnico administrativo', vara: '5ª Vara do Trabalho', valorCausa: 42000, risco: 'POSSIVEL', dataDistribuicao: ymd(-120), causaRaiz: 'TRABALHISTA_HORAS_EXTRAS', setorOrigem: 'RH', tipoOrigem: 'Colaborador', advogadoId: a2?.id, escritorioId: e2?.id })
  await P({ area: 'TRABALHISTA', assunto: 'Verbas rescisórias e FGTS em atraso', vara: '9ª Vara do Trabalho', valorCausa: 30000, risco: 'PROVAVEL', provisaoValor: 22000, dataDistribuicao: ymd(-300), causaRaiz: 'TRABALHISTA_VERBAS_RESCISORIAS', setorOrigem: 'RH', tipoOrigem: 'Colaborador', advogadoId: a2?.id })
  await P({ area: 'CONSUMIDOR', assunto: 'Publicidade enganosa: curso sem reconhecimento à época da oferta', vara: '1ª Vara Cível', valorCausa: 55000, risco: 'POSSIVEL', dataDistribuicao: ymd(-60), causaRaiz: 'PUBLICIDADE_ENGANOSA', setorOrigem: 'Marketing/Admissões', tipoOrigem: 'Aluno', advogadoId: a1?.id })
  await P({ area: 'CONSUMIDOR', assunto: 'Promessa de bolsa não cumprida', vara: '2ª Vara Cível', valorCausa: 18000, risco: 'REMOTO', dataDistribuicao: ymd(-20), causaRaiz: 'PUBLICIDADE_ENGANOSA', setorOrigem: 'Marketing/Admissões', tipoOrigem: 'Aluno', advogadoId: a1?.id })
  await P({ area: 'CIVEL', assunto: 'Atraso na emissão de diploma', vara: '4ª Vara Cível', valorCausa: 12000, risco: 'POSSIVEL', dataDistribuicao: ymd(-150), causaRaiz: 'DIPLOMA_CERTIFICADO_ATRASO', setorOrigem: 'Secretaria', tipoOrigem: 'Aluno', advogadoId: a3?.id })
  await P({ area: 'CIVEL', assunto: 'Reparação de danos por queda em escada do bloco B', vara: '6ª Vara Cível', valorCausa: 70000, risco: 'PROVAVEL', provisaoValor: 25000, dataDistribuicao: ymd(-250), causaRaiz: 'ACIDENTE_DANO_PESSOAL', setorOrigem: 'Infraestrutura', tipoOrigem: 'Aluno', advogadoId: a1?.id })
  await P({ area: 'CIVEL', assunto: 'Cobrança de aluguel pela instituição (inadimplência de lojista)', posicao: 'AUTOR', sofrido: false, vara: '8ª Vara Cível', valorCausa: 21000, risco: 'REMOTO', dataDistribuicao: ymd(-90), causaRaiz: 'LOCACAO_IMOVEL', setorOrigem: 'Infraestrutura', advogadoId: a3?.id })
  const pcr = await P({ area: 'CRIMINAL', assunto: 'Inquérito sobre suposta fraude em vestibular (apuração interna)', classe: 'Inquérito Policial', vara: 'DIPO — Delegacia Seccional', posicao: 'INVESTIGADO', risco: 'POSSIVEL', dataDistribuicao: ymd(-45), segredoJustica: true, causaRaiz: 'OUTRA', setorOrigem: 'Admissões', advogadoId: a1?.id, escritorioId: e1?.id })
  const penc = await P({ area: 'CONSUMIDOR', assunto: 'Cancelamento de matrícula e devolução de valores', vara: '7ª Vara Cível', valorCausa: 9000, risco: 'POSSIVEL', dataDistribuicao: ymd(-420), causaRaiz: 'RESCISAO_CONTRATO_ALUNO', setorOrigem: 'Secretaria/Financeiro', tipoOrigem: 'Aluno', advogadoId: a1?.id })
  const penc2 = await P({ area: 'CONSUMIDOR', assunto: 'Cobrança indevida — acordo homologado', vara: '3ª Vara Cível', valorCausa: 6000, risco: 'POSSIVEL', dataDistribuicao: ymd(-380), causaRaiz: 'COBRANCA_INDEVIDA', setorOrigem: 'Financeiro/Cobrança', tipoOrigem: 'Aluno', advogadoId: a1?.id })
  S.processos = { pc1, pc3, pt1, pcr, penc, penc2 }

  if (pc1) {
    await post(`/processos/${pc1.id}/partes`, { nome: 'Lucas Ferreira Andrade', documento: '529.982.247-25', tipo: 'AUTOR', polo: 'ATIVO' })
    await post(`/processos/${pc1.id}/partes`, { nome: 'SUA INSTITUIÇÃO', documento: '12.345.678/0001-90', tipo: 'REU', polo: 'PASSIVO' })
    await post(`/processos/${pc1.id}/andamentos`, { data: day(-38), tipo: 'DESPACHO', descricao: 'Citação da ré para contestar em 15 dias úteis.' })
    await post(`/processos/${pc1.id}/andamentos`, { data: day(-10), tipo: 'PETICAO', descricao: 'Contestação protocolada com documentos de baixa dos pagamentos.' })
    await post(`/processos/${pc1.id}/prazos`, { titulo: 'Réplica do autor — acompanhar e manifestar', tipo: 'MANIFESTACAO', dataFatal: day(4), fatal: true, advogadoId: a1?.id })
    await post(`/processos/${pc1.id}/prazos`, { titulo: 'Juntar comprovantes de conciliação bancária', tipo: 'MANIFESTACAO', dataFatal: day(20), fatal: false })
    await post(`/processos/${pc1.id}/audiencias`, { tipo: 'CONCILIACAO', dataHora: day(12), local: 'CEJUSC — Fórum Central', modalidade: 'PRESENCIAL', prepostoNome: 'Patrícia Moreira', advogadoId: a1?.id })
  }
  if (pt1) {
    await post(`/processos/${pt1.id}/partes`, { nome: 'Fernando Castro', documento: '987.654.321-00', tipo: 'AUTOR', polo: 'ATIVO' })
    await post(`/processos/${pt1.id}/prazos`, { titulo: 'Recurso ordinário', tipo: 'RECURSO', dataFatal: day(2), fatal: true, advogadoId: a2?.id })
    await post(`/processos/${pt1.id}/audiencias`, { tipo: 'INSTRUCAO', dataHora: day(25), local: 'TRT-2 — Sala 12', modalidade: 'VIRTUAL', advogadoId: a2?.id })
  }
  if (pc3) await post(`/processos/${pc3.id}/prazos`, { titulo: 'Pagamento da condenação (cumprimento de sentença)', tipo: 'PAGAMENTO', dataFatal: day(28), fatal: true })
  if (pcr) await post(`/processos/${pcr.id}/prazos`, { titulo: 'Entrega de documentos solicitados pela autoridade policial', tipo: 'CUMPRIMENTO', dataFatal: day(9), fatal: false })
  if (penc) await post(`/processos/${penc.id}/encerrar`, { resultado: 'GANHO', data: day(-60), observacao: 'Pedido julgado improcedente; transitado em julgado.' })
  if (penc2) await post(`/processos/${penc2.id}/encerrar`, { resultado: 'ACORDO', valorCondenacao: 3200, data: day(-200) })

  // ---------------------------------------------------------------- inteligência: planos de prevenção
  const pl1 = await post('/planos-prevencao', { titulo: 'Conciliação de baixas antes de negativar', causaRaiz: 'COBRANCA_INDEVIDA', setor: 'Financeiro/Cobrança', descricao: 'Reduzir cobranças indevidas e negativações de alunos adimplentes.', prioridade: 'ALTA', responsavelNome: 'Gerente Financeiro', prazo: ymd(60), meta: 'Reduzir em 50% os processos da causa em 12 meses' })
  if (pl1) {
    await post(`/planos-prevencao/${pl1.id}/acoes`, { descricao: 'Revisar a régua de cobrança e exigir conferência de acordos/baixas', responsavelNome: 'Coordenação de Cobrança', prazo: ymd(20) })
    await post(`/planos-prevencao/${pl1.id}/acoes`, { descricao: 'Notificação prévia por escrito antes de qualquer negativação', responsavelNome: 'Jurídico', prazo: ymd(30) })
    await post(`/planos-prevencao/${pl1.id}/iniciar`, {})
  }
  await post('/planos-prevencao', { titulo: 'Controle de jornada de docentes horistas', causaRaiz: 'TRABALHISTA_HORAS_EXTRAS', setor: 'RH', prioridade: 'ALTA', responsavelNome: 'Gerente de RH', prazo: ymd(90) })

  // ---------------------------------------------------------------- riscos e seguros
  const riscos: Array<[string, string, string, number, number, string?]> = [
    ['Incêndio nos blocos com laboratórios', 'PATRIMONIAL', 'Infraestrutura', 2, 5], ['Acidente com aluno em aula prática', 'PESSOAL', 'Clínica-escola', 3, 4],
    ['Condenações trabalhistas recorrentes (horas extras)', 'TRABALHISTA', 'RH', 4, 3], ['Vazamento de dados de alunos (LGPD)', 'CIBERNETICO', 'TI', 3, 5],
    ['Perda do credenciamento de polo EAD', 'REGULATORIO', 'Modalidades', 2, 4], ['Dano reputacional por publicidade enganosa', 'REPUTACIONAL', 'Marketing', 3, 3],
    ['Falha de fornecedor crítico (vigilância)', 'OPERACIONAL', 'Compras', 2, 2], ['Responsabilidade civil por erro em atendimento odontológico', 'RESPONSABILIDADE_CIVIL', 'Clínica-escola', 3, 5],
  ]
  S.riscos = []
  for (const [titulo, categoria, setor, probabilidade, impacto] of riscos) {
    const r = await post('/riscos', { titulo, categoria, setor, probabilidade, impacto, responsavelNome: 'Comitê de Riscos', controles: probabilidade * impacto >= 10 ? 'Controles e monitoramento em implantação.' : undefined, revisaoEm: ymd(probabilidade * impacto >= 15 ? 12 : 120) })
    if (r) S.riscos.push(r); else ctx.failures?.push(`seedJuridico: risco ${titulo}`)
  }
  const seguros: Array<[string, string, string, number, number, number, number]> = [
    ['PATRIMONIAL', 'AP-PAT-2025-0001', 'Porto Seguro Patrimonial', 48000, 15000000, -320, 45],
    ['RESPONSABILIDADE_CIVIL', 'AP-RC-2025-0042', 'Allianz Responsabilidade Civil', 36000, 5000000, -245, 120],
    ['ACIDENTES_ALUNOS', 'AP-AC-2026-0007', 'Tokio Marine Acidentes Pessoais', 22000, 1000000, -60, 305],
    ['CIBERNETICO', 'AP-CY-2025-0003', 'Chubb Cyber', 28000, 2000000, -350, 15],
    ['DANOS_MORAIS', 'AP-DM-2026-0011', 'Zurich Responsabilidade Profissional', 15000, 800000, -30, 335],
  ]
  S.seguros = []
  for (const [tipo, apolice, seguradora, premio, limite, ini, fim] of seguros) {
    const s = await post('/seguros', { tipo, apolice, seguradora, corretor: 'Corretora Alfa Seguros', premio, premioPeriodicidade: 'ANUAL', limiteTotal: limite, vigenciaInicio: ymd(ini), vigenciaFim: ymd(fim), coberturas: [{ descricao: 'Cobertura básica', limite, franquia: 5000 }, { descricao: 'Despesas de contenção', limite: Math.round(limite * 0.1) }], bensSegurados: 'Conforme relação anexa à apólice', responsavelNome: 'Renata Siqueira' })
    if (s) S.seguros.push(s); else ctx.failures?.push(`seedJuridico: seguro ${apolice}`)
  }
  if (S.seguros[0] && S.riscos[0]) await api('PUT', `${J}/riscos/${S.riscos[0].id}`, { seguroId: S.seguros[0].id })
  if (S.seguros[2]) {
    const sn = await post(`/seguros/${S.seguros[2].id}/sinistros`, { dataOcorrencia: day(-25), descricao: 'Aluno lesionou o punho em aula prática de laboratório; atendimento médico e fisioterapia.', valorEstimado: 7500, protocoloSeguradora: 'SIN-2026-88231' })
    if (sn) await post(`/sinistros/${sn.id}/status`, { status: 'EM_ANALISE' })
  }
  return S
}

// execução isolada
if (require.main === module) {
  const API = process.env.API_URL || 'http://localhost:3000/api'
  ;(async () => {
    const { prisma } = await import('../../src/lib/prisma')
    const clinic = await prisma.clinic.findFirst({ where: { tenantId: 'sua-instituicao' } })
    if (!clinic) throw new Error('Rode antes scripts/edu-demo-seed.ts (cria a instituição sua-instituicao).')
    const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clinicId: clinic.id, email: 'admin@suainstituicao.edu.br', password: 'Demo@2026' }) })
    const token = ((await r.json()) as any).token as string
    const failures: string[] = []
    const api: Api = async (method, path, body) => {
      const x = await fetch(`${API}${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body !== undefined ? JSON.stringify(body) : undefined })
      const t = await x.text(); let j: any = null; try { j = JSON.parse(t) } catch { /* texto */ }
      if (!x.ok) { failures.push(`${method} ${path} -> ${x.status} ${t.slice(0, 160)}`); return null }
      return j
    }
    await seedJuridico(api, { tenantId: 'sua-instituicao', failures })
    console.log(failures.length ? `${failures.length} chamadas falharam:\n - ${failures.join('\n - ')}` : 'Seed jurídico concluído.')
    await prisma.$disconnect()
  })().catch((e) => { console.error(e); process.exit(1) })
}
