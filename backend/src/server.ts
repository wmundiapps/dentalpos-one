import dotenv from 'dotenv'

dotenv.config()

import app from './app'
import { prisma } from './lib/prisma'
import { assertRuntimeConfiguration, runtimeChecks } from './config/runtime'
import { startAppointmentReminderWorker } from './services/appointmentReminderService'

const PORT = Number(process.env.PORT) || 3000
let server: ReturnType<typeof app.listen> | undefined
let reminderTimer: ReturnType<typeof setInterval> | undefined

async function startServer() {
  try {
    assertRuntimeConfiguration()

    if (process.env.NODE_ENV !== 'production') {
      const pending = runtimeChecks().filter(check => check.critical && !check.ok)
      if (pending.length) {
        console.warn(`⚠️ Homologação: ${pending.length} requisito(s) crítico(s) de produção ainda pendente(s).`)
      }
    }

    await prisma.$connect()
    console.log('✅ Banco de dados conectado.')

    reminderTimer = startAppointmentReminderWorker()

    server = app.listen(PORT, '0.0.0.0', () => {
      console.log('=================================')
      console.log('🚀 DentalPos API iniciada')
      console.log(`🌐 Porta: ${PORT}`)
      console.log(`📅 Ambiente: ${process.env.NODE_ENV || 'development'}`)
      console.log(`🚦 Canal: ${process.env.RELEASE_CHANNEL || 'internal'}`)
      console.log('=================================')
    })
  } catch (error) {
    console.error('❌ Erro ao iniciar aplicação')
    console.error(error)
    process.exit(1)
  }
}

async function shutdown(signal: string) {
  console.log(`\n${signal} recebido. Encerrando aplicação...`)

  if (reminderTimer) clearInterval(reminderTimer)

  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()))
  }

  await prisma.$disconnect()
  process.exit(0)
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error)
})
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error)
  void shutdown('UNCAUGHT_EXCEPTION')
})

void startServer()
