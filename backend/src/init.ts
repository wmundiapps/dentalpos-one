import { prisma } from './lib/prisma'

export async function initializeApplication() {
  try {
    await prisma.$connect()

    console.log('✅ Prisma conectado.')

    console.log('✅ Inicialização concluída.')
  } catch (error) {
    console.error('❌ Falha na inicialização da aplicação.')
    console.error(error)

    process.exit(1)
  }
}
