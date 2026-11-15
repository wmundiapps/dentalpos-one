// ÚNICO ponto de acoplamento com o ORM do sistema hospedeiro. Em outro sistema, aponte para o PrismaClient dele
// (que precisa conter os models Ctb* de prisma/edu/contabil-fiscal.prisma).
export { prisma } from '../../../lib/prisma'
export { Prisma } from '@prisma/client'
