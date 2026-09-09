import { prisma } from '../lib/prisma'

export async function listCriticalStock(clinicId: string, tenantId?: string) {
  const rows = await prisma.salesProduct.findMany({
    where: {
      clinicId,
      ...(tenantId ? { tenantId } : {}),
      active: true,
    },
    orderBy: { name: 'asc' },
  })

  return rows
    .filter((item) => Number(item.stockQuantity) <= Number(item.minStock))
    .sort(
      (a, b) =>
        (Number(b.minStock) - Number(b.stockQuantity)) -
        (Number(a.minStock) - Number(a.stockQuantity)),
    )
}

export function stockStatus(quantity: number, minimum: number) {
  if (quantity <= 0) return 'SEM_ESTOQUE'
  if (quantity <= minimum) return 'CRITICO'
  if (quantity <= minimum * 1.5) return 'BAIXO'
  return 'OK'
}
