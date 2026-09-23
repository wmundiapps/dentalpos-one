import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { revahPrisma?: PrismaClient }

export const prisma = globalForPrisma.revahPrisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.revahPrisma = prisma
