import { prisma } from '../nucleo/db'

// Plano de contas padrão (simplificado, para pequenas empresas). Pode ser ajustado por empresa. Tipos: ATIVO, PASSIVO, PL, RECEITA, CUSTO, DESPESA.
type C = [codigo: string, nome: string, tipo: string, natureza: 'D' | 'C', analitica: boolean]

export const PLANO_PADRAO: C[] = [
  ['1', 'ATIVO', 'ATIVO', 'D', false],
  ['1.1', 'Ativo circulante', 'ATIVO', 'D', false],
  ['1.1.1', 'Disponibilidades', 'ATIVO', 'D', false],
  ['1.1.1.01', 'Caixa', 'ATIVO', 'D', true],
  ['1.1.1.02', 'Bancos conta movimento', 'ATIVO', 'D', true],
  ['1.1.2', 'Clientes', 'ATIVO', 'D', false],
  ['1.1.2.01', 'Clientes (contas a receber)', 'ATIVO', 'D', true],
  ['1.1.3', 'Tributos a recuperar', 'ATIVO', 'D', false],
  ['1.1.3.01', 'Tributos a recuperar', 'ATIVO', 'D', true],
  ['1.2', 'Ativo não circulante', 'ATIVO', 'D', false],
  ['1.2.1', 'Imobilizado', 'ATIVO', 'D', false],
  ['1.2.1.01', 'Móveis, equipamentos e computadores', 'ATIVO', 'D', true],
  ['2', 'PASSIVO E PATRIMÔNIO LÍQUIDO', 'PASSIVO', 'C', false],
  ['2.1', 'Passivo circulante', 'PASSIVO', 'C', false],
  ['2.1.1', 'Fornecedores', 'PASSIVO', 'C', false],
  ['2.1.1.01', 'Fornecedores (contas a pagar)', 'PASSIVO', 'C', true],
  ['2.1.2', 'Obrigações trabalhistas e previdenciárias', 'PASSIVO', 'C', false],
  ['2.1.2.01', 'Salários a pagar', 'PASSIVO', 'C', true],
  ['2.1.2.02', 'Encargos sociais a recolher', 'PASSIVO', 'C', true],
  ['2.1.3', 'Obrigações tributárias', 'PASSIVO', 'C', false],
  ['2.1.3.01', 'Tributos a recolher', 'PASSIVO', 'C', true],
  ['2.3', 'Patrimônio líquido', 'PL', 'C', false],
  ['2.3.1', 'Capital social', 'PL', 'C', false],
  ['2.3.1.01', 'Capital social subscrito', 'PL', 'C', true],
  ['2.3.2', 'Lucros ou prejuízos acumulados', 'PL', 'C', false],
  ['2.3.2.01', 'Lucros ou prejuízos acumulados', 'PL', 'C', true],
  ['3', 'RECEITAS', 'RECEITA', 'C', false],
  ['3.1', 'Receita bruta', 'RECEITA', 'C', false],
  ['3.1.1', 'Receita de vendas', 'RECEITA', 'C', false],
  ['3.1.1.01', 'Venda de mercadorias', 'RECEITA', 'C', true],
  ['3.1.2', 'Receita de serviços', 'RECEITA', 'C', false],
  ['3.1.2.01', 'Prestação de serviços', 'RECEITA', 'C', true],
  ['3.2', 'Deduções da receita', 'RECEITA', 'D', false],
  ['3.2.1', 'Impostos sobre vendas e serviços', 'RECEITA', 'D', false],
  ['3.2.1.01', 'Impostos sobre vendas e serviços (DAS, ISS, PIS, COFINS)', 'RECEITA', 'D', true],
  ['3.2.2', 'Devoluções e abatimentos', 'RECEITA', 'D', false],
  ['3.2.2.01', 'Devoluções e abatimentos', 'RECEITA', 'D', true],
  ['4', 'CUSTOS', 'CUSTO', 'D', false],
  ['4.1', 'Custos operacionais', 'CUSTO', 'D', false],
  ['4.1.1', 'Custo das mercadorias vendidas', 'CUSTO', 'D', false],
  ['4.1.1.01', 'Custo das mercadorias vendidas (CMV)', 'CUSTO', 'D', true],
  ['4.1.2', 'Custo dos serviços prestados', 'CUSTO', 'D', false],
  ['4.1.2.01', 'Custo dos serviços prestados (CSP)', 'CUSTO', 'D', true],
  ['5', 'DESPESAS', 'DESPESA', 'D', false],
  ['5.1', 'Despesas operacionais', 'DESPESA', 'D', false],
  ['5.1.1', 'Despesas com pessoal', 'DESPESA', 'D', false],
  ['5.1.1.01', 'Salários, pró-labore e encargos', 'DESPESA', 'D', true],
  ['5.1.2', 'Despesas administrativas', 'DESPESA', 'D', false],
  ['5.1.2.01', 'Despesas administrativas gerais', 'DESPESA', 'D', true],
  ['5.1.3', 'Aluguéis e condomínio', 'DESPESA', 'D', false],
  ['5.1.3.01', 'Aluguéis e condomínio', 'DESPESA', 'D', true],
  ['5.1.4', 'Despesas comerciais', 'DESPESA', 'D', false],
  ['5.1.4.01', 'Marketing e despesas comerciais', 'DESPESA', 'D', true],
  ['5.1.5', 'Tributos e taxas', 'DESPESA', 'D', false],
  ['5.1.5.01', 'Tributos, taxas e contribuições', 'DESPESA', 'D', true],
  ['5.2', 'Resultado financeiro', 'DESPESA', 'D', false],
  ['5.2.1', 'Despesas financeiras', 'DESPESA', 'D', false],
  ['5.2.1.01', 'Despesas financeiras (juros, tarifas, descontos)', 'DESPESA', 'D', true],
  ['5.2.2', 'Receitas financeiras', 'RECEITA', 'C', false],
  ['5.2.2.01', 'Receitas financeiras (juros recebidos, descontos obtidos)', 'RECEITA', 'C', true],
  ['5.9', 'Imposto de renda e contribuição social', 'DESPESA', 'D', false],
  ['5.9.1', 'IRPJ e CSLL', 'DESPESA', 'D', false],
  ['5.9.1.01', 'Provisão para IRPJ e CSLL', 'DESPESA', 'D', true],
]

export const CONTA = {
  CAIXA: '1.1.1.01', BANCO: '1.1.1.02', CLIENTES: '1.1.2.01', FORNECEDORES: '2.1.1.01',
  RECEITA_VENDAS: '3.1.1.01', RECEITA_SERVICOS: '3.1.2.01', DESPESA_ADM: '5.1.2.01',
  DESP_FINANCEIRA: '5.2.1.01', REC_FINANCEIRA: '5.2.2.01', TRIBUTOS_RECOLHER: '2.1.3.01',
}

/** Cria o plano padrão da empresa se ela ainda não tem nenhuma conta (idempotente). */
export async function garantirPlano(tenantId: string, empresaId: string) {
  const n = await prisma.ctbPlanoConta.count({ where: { tenantId, empresaId } })
  if (n > 0) return n
  await prisma.ctbPlanoConta.createMany({
    data: PLANO_PADRAO.map(([codigo, nome, tipo, natureza, analitica]) => ({ tenantId, empresaId, codigo, nome, tipo, natureza, analitica })),
    skipDuplicates: true,
  })
  return PLANO_PADRAO.length
}
