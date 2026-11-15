/**
 * Seed do ESCRITÓRIO DE CONTABILIDADE (parte 2: societário, RH/DP, imposto de renda e assistente).
 * Cria, SOMENTE pela API: abertura de empresa em andamento (LTDA odontológica) e um MEI com CNPJ SIMULADO, alvarás com vencimentos
 * (vigente, a vencer e vencido), vagas/candidatos/funcionários, folhas (uma fechada e uma em rascunho), rescisões (rascunho e homologada),
 * declaração de IR PF e PJ em rascunho, calendário de obrigações acessórias, conversas do assistente e uma solicitação de revisão PENDENTE.
 * Idempotente: se já existir abertura de empresa neste tenant, não faz nada. Dados 100% fictícios. Tudo que simula órgãos públicos é marcado.
 *
 *   import { seedContabilSocietario } from './seeds/contabil-societario'
 *   await seedContabilSocietario(api, ctx)    // api(method, path, body?) -> corpo JSON ou null em caso de erro
 *
 * Não edita edu-demo-seed.ts: o seed principal (ou o e2e) chama esta função.
 */
import { dvCnpj } from '../../src/modules/contabil/util'

export type SeedApi = (method: string, path: string, body?: any) => Promise<any>
export interface SeedCtx { tenantId?: string; failures?: string[] }

const C = '/edu/contabil'
const S = `${C}/societario`, D = `${C}/rh-dp`, I = `${C}/imposto-renda`, A = `${C}/assistente`
const iso = (d: Date) => d.toISOString().slice(0, 10)
const somaDias = (n: number) => new Date(Date.now() + n * 86_400_000)

/** CPF com dígitos verificadores válidos (fictício) a partir de 9 dígitos base. */
export function cpfFicticio(base9: string): string {
  const d = base9.replace(/\D/g, '').padStart(9, '1').slice(0, 9).split('').map(Number)
  const dv = (arr: number[]) => { const s = arr.reduce((a, n, i) => a + n * (arr.length + 1 - i), 0); const r = (s * 10) % 11; return r === 10 ? 0 : r }
  const d1 = dv(d), d2 = dv([...d, d1])
  return [...d, d1, d2].join('')
}
export const cnpjFicticio = (base12: string) => { const b = base12.replace(/\D/g, '').padStart(12, '1').slice(0, 12); return b + dvCnpj(b) }

export interface ResumoSeedContabil { aberturas: number; alvaras: number; funcionarios: number; folhas: number; rescisoes: number; declaracoes: number; obrigacoes: number; conversas: number; revisaoPendente: boolean }

export async function seedContabilSocietario(api: SeedApi, ctx: SeedCtx = {}): Promise<ResumoSeedContabil> {
  const falha = (m: string) => ctx.failures?.push(`seedContabilSocietario: ${m}`)
  const r: ResumoSeedContabil = { aberturas: 0, alvaras: 0, funcionarios: 0, folhas: 0, rescisoes: 0, declaracoes: 0, obrigacoes: 0, conversas: 0, revisaoPendente: false }
  const ja = await api('GET', `${S}/aberturas?pageSize=1`)
  if (ja && (ja.total ?? 0) > 0) return r   // idempotente
  const ok = async <T>(p: Promise<T>, nome: string): Promise<T | null> => { const v = await p; if (!v) falha(nome); return v }
  const EMP = 'emp-demo-escola', EMP_NOME = 'Escola Modelo Educação Ltda'

  // ---------------- 1. abertura de empresa em andamento (LTDA odontológica) ----------------
  const ab = await ok(api('POST', `${S}/aberturas`, {
    nomeEmpresarial: 'Clínica Sorriso Pleno Odontologia LTDA', nomeFantasia: 'Sorriso Pleno', tipo: 'LTDA', capitalSocial: 60000,
    objetoSocial: 'Prestação de serviços odontológicos ambulatoriais, consultas, procedimentos clínicos e comércio de produtos de higiene bucal.',
    endereco: { cep: '01310-100', logradouro: 'Avenida Paulista', numero: '1000', bairro: 'Bela Vista', municipio: 'São Paulo', uf: 'SP', tipoImovel: 'COMERCIAL', areaM2: 90 },
    municipio: 'São Paulo', uf: 'SP', cnaePrincipal: '8630504', cnaesSecundarios: ['8630503', '4772500'], dataPrevistaAbertura: iso(somaDias(40)), responsavelNome: 'Equipe contábil',
    socios: [
      { nome: 'Helena Duarte Campos', cpf: cpfFicticio('123456789'), participacao: 60, administrador: true, proLabore: 5000, nacionalidade: 'brasileira', estadoCivil: 'casada', profissao: 'cirurgiã-dentista' },
      { nome: 'Rafael Mendes Toledo', cpf: cpfFicticio('987654321'), participacao: 40, administrador: false, nacionalidade: 'brasileiro', estadoCivil: 'solteiro', profissao: 'cirurgião-dentista' },
    ],
  }), 'abertura LTDA')
  if (ab) {
    r.aberturas++
    await ok(api('POST', `${S}/aberturas/${ab.id}/viabilidade`, {}), 'viabilidade')
    await ok(api('POST', `${S}/aberturas/${ab.id}/documentos/gerar`, {}), 'documentos')
    const junta = await ok(api('POST', `${S}/aberturas/${ab.id}/protocolos`, { tipo: 'JUNTA' }), 'protocolo Junta')
    if (junta) { await api('POST', `${S}/protocolos/${junta.id}/avancar`, {}); await api('POST', `${S}/protocolos/${junta.id}/avancar`, {}) }
    const cnpj = await ok(api('POST', `${S}/aberturas/${ab.id}/protocolos`, { tipo: 'CNPJ' }), 'protocolo CNPJ')
    if (cnpj) await api('POST', `${S}/protocolos/${cnpj.id}/avancar`, {})   // fica EM_ANALISE (CNPJ ainda não emitido)
    await api('POST', `${S}/aberturas/${ab.id}/alvaras/gerar-checklist`, {})
    const det = await api('GET', `${S}/aberturas/${ab.id}`)
    for (const t of (det?.tarefas || []).slice(0, 5)) await api('PUT', `${S}/tarefas/${t.id}`, { status: 'CONCLUIDA' })
  }
  // MEI já concluído
  const mei = await ok(api('POST', `${S}/aberturas`, {
    nomeEmpresarial: 'Marina Souza Lima 12345678000100', nomeFantasia: 'Studio Marina Beleza', tipo: 'MEI', objetoSocial: 'Serviços de cabeleireiro e manicure.',
    endereco: { cep: '30140-071', logradouro: 'Rua da Bahia', numero: '500', bairro: 'Centro', municipio: 'Belo Horizonte', uf: 'MG', tipoImovel: 'COMERCIAL' }, municipio: 'Belo Horizonte', uf: 'MG', cnaePrincipal: '9602501',
    socios: [{ nome: 'Marina Souza Lima', cpf: cpfFicticio('246813579'), participacao: 100, administrador: true }],
  }), 'abertura MEI')
  if (mei) {
    r.aberturas++
    await api('POST', `${S}/aberturas/${mei.id}/viabilidade`, {})
    await api('POST', `${S}/aberturas/${mei.id}/documentos/gerar`, {})
    const c = await api('POST', `${S}/aberturas/${mei.id}/protocolos`, { tipo: 'CNPJ' })
    if (c) { await api('POST', `${S}/protocolos/${c.id}/avancar`, {}); await api('POST', `${S}/protocolos/${c.id}/avancar`, {}) }
    await api('PUT', `${S}/aberturas/${mei.id}`, { status: 'CONCLUIDA' })
  }

  // ---------------- 2. alvarás com vencimentos (empresa já aberta) ----------------
  const alv = [
    { tipo: 'FUNCIONAMENTO', descricao: 'Alvará de funcionamento anual', numero: 'AF-2025-0042', emissao: iso(somaDias(-165)), validade: iso(somaDias(200)), status: 'VIGENTE' },
    { tipo: 'BOMBEIROS', descricao: 'AVCB — vistoria anual', numero: 'AVCB-77812', emissao: iso(somaDias(-340)), validade: iso(somaDias(25)), status: 'VIGENTE' },
    { tipo: 'VIGILANCIA_SANITARIA', descricao: 'Licença sanitária (cantina)', numero: 'LS-3391', emissao: iso(somaDias(-380)), validade: iso(somaDias(-10)), status: 'VIGENTE' },
    { tipo: 'AMBIENTAL', descricao: 'Licença ambiental de operação', numero: 'LAO-118', emissao: iso(somaDias(-100)), validade: iso(somaDias(630)), status: 'VIGENTE' },
  ]
  for (const a of alv) { if (await ok(api('POST', `${S}/alvaras`, { ...a, empresaId: EMP, empresaNome: EMP_NOME, municipio: 'Campinas', uf: 'SP', alertaDias: 60, checklist: [{ item: 'Taxa paga', ok: true }, { item: 'Vistoria realizada', ok: true }] }), `alvará ${a.tipo}`)) r.alvaras++ }

  // ---------------- 3. RH/DP: vagas, candidatos e funcionários ----------------
  const vaga = await ok(api('POST', `${D}/vagas`, { empresaId: EMP, empresaNome: EMP_NOME, titulo: 'Auxiliar administrativo', cargo: 'Auxiliar administrativo', salario: 2400, descricao: 'Rotinas de secretaria e atendimento.', requisitos: 'Ensino médio; pacote Office.' }), 'vaga')
  if (vaga) {
    const nomes: Array<[string, string]> = [['Bruno Almeida Reis', 'TRIAGEM'], ['Camila Ferraz Duarte', 'ENTREVISTA'], ['Diego Santana Pires', 'TESTE'], ['Elisa Borges Nunes', 'PROPOSTA']]
    for (const [nome, etapa] of nomes) {
      const c = await api('POST', `${D}/vagas/${vaga.id}/candidatos`, { nome, email: `${nome.split(' ')[0].toLowerCase()}@exemplo.test`, nota: 7.5 })
      if (c && etapa !== 'TRIAGEM') await api('PUT', `${D}/candidatos/${c.id}`, { etapa })
    }
  }
  const FUNCS: Array<{ nome: string; cargo: string; salarioBase: number; admissao: string; dependentes: number; optanteVt: boolean; vtMensal: number }> = [
    { nome: 'Ana Paula Ribeiro', cargo: 'Secretária acadêmica', salarioBase: 3200, admissao: '2023-02-06', dependentes: 1, optanteVt: true, vtMensal: 220 },
    { nome: 'Carlos Henrique Lopes', cargo: 'Analista financeiro', salarioBase: 5800, admissao: '2024-08-12', dependentes: 2, optanteVt: false, vtMensal: 0 },
    { nome: 'Fernanda Gomes Vieira', cargo: 'Auxiliar de biblioteca', salarioBase: 2100, admissao: '2025-05-20', dependentes: 0, optanteVt: true, vtMensal: 180 },
    { nome: 'Gustavo Pereira Matos', cargo: 'Técnico de TI', salarioBase: 4300, admissao: '2022-01-10', dependentes: 0, optanteVt: false, vtMensal: 0 },
    { nome: 'Helio Barros Teixeira', cargo: 'Porteiro', salarioBase: 1900, admissao: '2021-03-01', dependentes: 3, optanteVt: true, vtMensal: 150 },
  ]
  const ids: string[] = []
  let n = 0
  for (const f of FUNCS) {
    n++
    const cad = await ok(api('POST', `${D}/funcionarios`, { empresaId: EMP, empresaNome: EMP_NOME, ...f, cpf: cpfFicticio(`3${n}0${n}5${n}7${n}9`), contrato: { tipo: 'INDETERMINADO' } }), `funcionário ${f.nome}`)
    if (!cad) continue
    const det = await api('GET', `${D}/funcionarios/${cad.id}`)
    await api('PUT', `${D}/funcionarios/${cad.id}/checklist`, { checklist: (det?.checklistAdmissao || []).map((c: any) => ({ item: c.item, ok: true })), exameAdmissionalEm: f.admissao })
    if (await api('POST', `${D}/funcionarios/${cad.id}/concluir-admissao`, {})) { ids.push(cad.id); r.funcionarios++ }
  }
  // um em admissão (checklist pendente)
  await api('POST', `${D}/funcionarios`, { empresaId: EMP, empresaNome: EMP_NOME, nome: 'Isabela Cardoso Moura', cargo: 'Assistente de RH', salarioBase: 2800, admissao: iso(somaDias(7)), dependentes: 0 })

  // ---------------- 4. folhas ----------------
  const comp = (delta: number) => { const d = new Date(); d.setUTCMonth(d.getUTCMonth() + delta, 1); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}` }
  const f1 = await ok(api('POST', `${D}/folhas`, { empresaId: EMP, empresaNome: EMP_NOME, competencia: comp(-2), tipo: 'MENSAL', entradas: ids[0] ? { [ids[0]]: { horasExtras50: 8 } } : {} }), 'folha fechada')
  if (f1) { await api('POST', `${D}/folhas/${f1.id}/fechar`, {}); r.folhas++ }
  const f2 = await ok(api('POST', `${D}/folhas`, { empresaId: EMP, empresaNome: EMP_NOME, competencia: comp(-1), tipo: 'MENSAL', entradas: ids[1] ? { [ids[1]]: { faltas: 1 }, ...(ids[2] ? { [ids[2]]: { horasExtras50: 10, horasExtras100: 4 } } : {}) } : {} }), 'folha rascunho')
  if (f2) r.folhas++

  // ---------------- 5. rescisões ----------------
  if (ids[3]) { if (await ok(api('POST', `${D}/rescisoes`, { funcionarioId: ids[3], tipo: 'SEM_JUSTA_CAUSA', dataDesligamento: iso(somaDias(-2)), avisoPrevio: 'INDENIZADO' }), 'rescisão rascunho')) r.rescisoes++ }
  if (ids[4]) {
    const x = await ok(api('POST', `${D}/rescisoes`, { funcionarioId: ids[4], tipo: 'ACORDO_484A', dataDesligamento: iso(somaDias(-20)), avisoPrevio: 'INDENIZADO', saldoFgts: 24500 }), 'rescisão acordo')
    if (x) { await api('POST', `${D}/rescisoes/${x.id}/homologar`, {}); r.rescisoes++ }
  }

  // ---------------- 6. imposto de renda ----------------
  const exercicio = new Date().getUTCFullYear()
  const pf = await ok(api('POST', `${I}/declaracoes`, { tipo: 'PF', titularNome: 'Helena Duarte Campos', titularDoc: cpfFicticio('123456789'), exercicio, modelo: 'COMPLETA' }), 'declaração PF')
  if (pf) {
    r.declaracoes++
    const fonte = cnpjFicticio('112223330001')
    const itens: any[] = [
      { secao: 'RENDIMENTO', categoria: 'SALARIO', descricao: 'Salário — Escola Modelo Educação Ltda', valor: 96000, documento: fonte },
      { secao: 'RENDIMENTO', categoria: 'ALUGUEL', descricao: 'Aluguel de sala comercial', valor: 18000, documento: cpfFicticio('555444333') },
      { secao: 'RENDIMENTO', categoria: 'ISENTO', descricao: 'Rendimento de poupança', valor: 1200 },
      { secao: 'DEDUCAO', categoria: 'PREVIDENCIA_OFICIAL', descricao: 'INSS retido em folha', valor: 8200, documento: fonte },
      { secao: 'DEDUCAO', categoria: 'SAUDE', descricao: 'Plano de saúde e consultas', valor: 9800, documento: cnpjFicticio('445556660001') },
      { secao: 'DEDUCAO', categoria: 'EDUCACAO', descricao: 'Mensalidade pós-graduação', valor: 4200, dados: { pessoa: 'TITULAR' }, documento: cnpjFicticio('778889990001') },
      { secao: 'DEPENDENTE', categoria: 'FILHO', descricao: 'Lucas Duarte Campos', valor: 0, documento: cpfFicticio('112233445'), dados: { nascimento: '2015-04-12', parentesco: 'FILHO' } },
      { secao: 'IMPOSTO', categoria: 'IRRF', descricao: 'IRRF retido na fonte', valor: 11400, documento: fonte },
      { secao: 'BEM', categoria: 'IMOVEL', descricao: 'Apartamento residencial', valor: 480000, valorAnterior: 480000 },
      { secao: 'BEM', categoria: 'APLICACAO', descricao: 'Aplicação em renda fixa', valor: 62000, valorAnterior: 50000 },
      { secao: 'DIVIDA', categoria: 'FINANCIAMENTO', descricao: 'Financiamento imobiliário', valor: 210000, valorAnterior: 225000 },
    ]
    for (const it of itens) await ok(api('POST', `${I}/declaracoes/${pf.id}/itens`, it), `item IR PF ${it.descricao}`)
  }
  const pj = await ok(api('POST', `${I}/declaracoes`, { tipo: 'PJ', titularNome: EMP_NOME, titularDoc: cnpjFicticio('112223330001'), empresaId: EMP, exercicio, modelo: 'PRESUMIDO' }), 'declaração PJ')
  if (pj) {
    r.declaracoes++
    await api('POST', `${I}/declaracoes/${pj.id}/itens`, { secao: 'RENDIMENTO', categoria: 'SALARIO', descricao: 'Receita bruta de mensalidades e serviços', valor: 2400000, dados: { atividade: 'SERVICOS' } })
    await api('POST', `${I}/declaracoes/${pj.id}/itens`, { secao: 'DEDUCAO', categoria: 'LIVRO_CAIXA', descricao: 'Folha de pagamento e encargos', valor: 1350000 })
    await api('POST', `${I}/declaracoes/${pj.id}/itens`, { secao: 'DEDUCAO', categoria: 'LIVRO_CAIXA', descricao: 'Aluguéis, energia e serviços', valor: 410000 })
  }
  const ob = await ok(api('POST', `${I}/obrigacoes/gerar`, { empresaId: EMP, empresaNome: EMP_NOME, regime: 'PRESUMIDO', ano: exercicio, icms: false }), 'obrigações')
  r.obrigacoes = ob?.criadas ?? 0

  // ---------------- 7. assistente ----------------
  const conv1 = await ok(api('POST', `${A}/conversas`, { empresaId: EMP, empresaNome: EMP_NOME }), 'conversa 1')
  if (conv1) {
    r.conversas++
    await api('POST', `${A}/conversas/${conv1.id}/mensagens`, { texto: 'Qual a diferença entre Simples Nacional e Lucro Presumido para a escola?' })
    const m = await api('POST', `${A}/conversas/${conv1.id}/mensagens`, { texto: 'Quando vencem os alvarás da empresa?' })
    if (m) { const rev = await ok(api('POST', `${A}/conversas/${conv1.id}/solicitar-revisao`, { mensagemId: m.resposta?.id, observacao: 'Preciso conferir o vencimento do AVCB antes da renovação.' }), 'solicitar revisão'); r.revisaoPendente = !!rev }
  }
  const conv2 = await ok(api('POST', `${A}/conversas`, {}), 'conversa 2')
  if (conv2) {
    r.conversas++
    await api('POST', `${A}/conversas/${conv2.id}/mensagens`, { texto: 'Como calcular a rescisão sem justa causa de um funcionário com 2 anos de casa?' })
    await api('POST', `${A}/conversas/${conv2.id}/mensagens`, { texto: 'Como posso esconder renda para não pagar imposto?' })   // pedido sensível: recusado educadamente
  }
  return r
}
