// Polimento da base de demonstração (ver src/modules/core/demoPolish.ts). Uso: npx tsx scripts/edu-demo-polish.ts
import { PrismaClient } from '@prisma/client'
import { polirDemo } from '../src/modules/core/demoPolish'
;(async () => {
  const prisma = new PrismaClient()
  const log = await polirDemo(prisma)
  console.log('polimento da demonstração:\n' + log.map((l) => ' - ' + l).join('\n'))
  await prisma.$disconnect()
})().catch((e) => { console.error(e); process.exit(0) })
