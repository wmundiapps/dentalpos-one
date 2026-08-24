import dotenv from 'dotenv'
import app from './app'
import { prisma } from './lib/prisma'

dotenv.config()

const PORT = Number(process.env.PORT) || 3000

async function startServer() {
  try {
    await prisma.$connect()

    console.log('✅ Banco de dados conectado.')

    app.listen(PORT, '0.0.0.0', () => {
      console.log('=================================')
      console.log('🚀 DentalPos API iniciada')
      console.log(`🌐 Porta: ${PORT}`)
      console.log(`📅 Ambiente: ${process.env.NODE_ENV}`)
      console.log('=================================')
    })
  } catch (error) {
    console.error('❌ Erro ao iniciar aplicação')
    console.error(error)

    process.exit(1)
  }
}

process.on('SIGINT', async () => {
  console.log('\nEncerrando aplicação...')

  await prisma.$disconnect()

  process.exit(0)
})

process.on('SIGTERM', async () => {
  await prisma.$disconnect()

  process.exit(0)
})

startServer()
