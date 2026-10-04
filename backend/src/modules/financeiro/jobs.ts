import { prisma } from '../../lib/prisma';
import { registerEduJob } from '../core/jobs';

// Marca como ATRASADO as contas pendentes cujo vencimento já passou (a leitura já faz isso em
// tempo de consulta; o job persiste o status para relatórios/filtros por status).
export async function jobMarcarAtrasados(now = new Date()) {
  const limite = new Date(now.getTime() - 24 * 3_600_000); // tolerância de 1 dia sobre o vencimento
  const [receber, pagar] = await Promise.all([
    prisma.accountReceivable.updateMany({ where: { status: 'PENDENTE', dataVencimento: { lt: limite } }, data: { status: 'ATRASADO' } }),
    prisma.accountPayable.updateMany({ where: { status: 'PENDENTE', dataVencimento: { lt: limite } }, data: { status: 'ATRASADO' } }),
  ]);
  return { receberAtrasadas: receber.count, pagarAtrasadas: pagar.count };
}

registerEduJob('financeiro.marcar-atrasados', () => jobMarcarAtrasados());
