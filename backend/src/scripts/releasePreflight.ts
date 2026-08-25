import 'dotenv/config'
import { prisma } from '../lib/prisma'
import { runtimeChecks } from '../config/runtime'

async function main() {
  const checks = runtimeChecks()
  let databaseOk = false

  try {
    await prisma.$queryRaw`SELECT 1`
    databaseOk = true
  } catch {
    databaseOk = false
  }

  const rows = [
    { label: 'Banco de dados acessível', ok: databaseOk, critical: true },
    ...checks.map(check => ({ label: check.label, ok: check.ok, critical: check.critical }))
  ]

  for (const row of rows) {
    console.log(`${row.ok ? 'OK ' : 'PENDENTE'} ${row.critical ? '[CRÍTICO]' : '[AVISO]'} ${row.label}`)
  }

  const failures = rows.filter(row => row.critical && !row.ok)
  if (failures.length) {
    console.error(`\nPreflight reprovado: ${failures.length} requisito(s) crítico(s) pendente(s).`)
    process.exitCode = 1
  } else {
    console.log('\nPreflight aprovado para promoção do ambiente.')
  }
}

main()
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
