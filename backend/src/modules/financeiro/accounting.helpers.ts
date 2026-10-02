import { prisma } from '../../lib/prisma'; // AJUSTE: caminho real do seu cliente Prisma

// ============================================================
// Resolve (ou cria, se ainda não existir) uma conta do plano de
// contas pelo código. Evita exigir carga inicial de plano de contas
// antes do módulo funcionar — na primeira baixa, as contas padrão
// (Caixa, Receita de Mensalidades, Despesas Gerais) são criadas
// automaticamente. Depois disso o financeiro pode reorganizar o
// plano de contas normalmente pelos endpoints de /chart-of-accounts.
// ============================================================

export async function getOrCreateAccount(
  tenantId: string,
  codigo: string,
  nome: string,
  tipo: 'ATIVO' | 'PASSIVO' | 'PATRIMONIO_LIQUIDO' | 'RECEITA' | 'DESPESA',
) {
  return prisma.chartOfAccount.upsert({
    where: { tenantId_codigo: { tenantId, codigo } },
    create: { tenantId, codigo, nome, tipo },
    update: {},
  });
}

export const CONTAS_PADRAO = {
  CAIXA: { codigo: '1.1.1', nome: 'Caixa e Bancos', tipo: 'ATIVO' as const },
  RECEITA_MENSALIDADE: { codigo: '3.1.1', nome: 'Receita de Mensalidades', tipo: 'RECEITA' as const },
  DESPESA_GERAL: { codigo: '4.1.1', nome: 'Despesas Gerais', tipo: 'DESPESA' as const },
};

// Registra a transação (receita ou despesa) + o lançamento contábil
// de partida dobrada correspondente, em uma única transação de banco.
export async function registrarBaixaComLancamento(params: {
  tenantId: string;
  tipo: 'RECEITA' | 'DESPESA';
  valor: number;
  formaPagamento: 'PIX' | 'BOLETO' | 'CARTAO' | 'DINHEIRO' | 'TRANSFERENCIA';
  historico: string;
  accountPayableId?: string;
  accountReceivableId?: string;
  dataTransacao?: Date;
}) {
  const { tenantId, tipo, valor, formaPagamento, historico, accountPayableId, accountReceivableId } =
    params;

  const caixa = await getOrCreateAccount(
    tenantId,
    CONTAS_PADRAO.CAIXA.codigo,
    CONTAS_PADRAO.CAIXA.nome,
    CONTAS_PADRAO.CAIXA.tipo,
  );
  const contraparte = await getOrCreateAccount(
    tenantId,
    tipo === 'RECEITA' ? CONTAS_PADRAO.RECEITA_MENSALIDADE.codigo : CONTAS_PADRAO.DESPESA_GERAL.codigo,
    tipo === 'RECEITA' ? CONTAS_PADRAO.RECEITA_MENSALIDADE.nome : CONTAS_PADRAO.DESPESA_GERAL.nome,
    tipo === 'RECEITA' ? CONTAS_PADRAO.RECEITA_MENSALIDADE.tipo : CONTAS_PADRAO.DESPESA_GERAL.tipo,
  );

  return prisma.$transaction(async (tx) => {
    const transacao = await tx.paymentTransaction.create({
      data: {
        tenantId,
        tipo,
        valor,
        formaPagamento,
        dataTransacao: params.dataTransacao ?? new Date(),
        accountPayableId,
        accountReceivableId,
      },
    });

    // Receita: débito Caixa / crédito Receita. Despesa: débito Despesa / crédito Caixa.
    const contaDebitoId = tipo === 'RECEITA' ? caixa.id : contraparte.id;
    const contaCreditoId = tipo === 'RECEITA' ? contraparte.id : caixa.id;

    const lancamento = await tx.accountingEntry.create({
      data: {
        tenantId,
        contaDebitoId,
        contaCreditoId,
        valor,
        historico,
        paymentTransactionId: transacao.id,
      },
    });

    return { transacao, lancamento };
  });
}
