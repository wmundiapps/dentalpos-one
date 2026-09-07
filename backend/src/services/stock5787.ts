import prisma from '../lib/prisma'

export async function listCriticalStock(clinicId:string){
  // Usa o estoque já existente; adaptar os nomes abaixo aos campos definitivos do schema integrado.
  return prisma.$queryRawUnsafe<any[]>(`
    SELECT * FROM "StockItem"
    WHERE "clinicId" = $1
      AND "isActive" = true
      AND quantity <= "minimumQuantity"
    ORDER BY ("minimumQuantity" - quantity) DESC
  `, clinicId)
}

export function stockStatus(quantity:number,minimum:number){
  if(quantity<=0)return 'SEM_ESTOQUE'
  if(quantity<=minimum)return 'CRITICO'
  if(quantity<=minimum*1.5)return 'BAIXO'
  return 'OK'
}
