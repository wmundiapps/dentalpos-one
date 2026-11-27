// Zera o banco de demonstração apagando as tabelas uma a uma (cada DROP em transação própria).
// O "migrate reset" do Prisma apaga tudo numa transação só e estoura a memória de locks do Postgres com muitas tabelas.
import { PrismaClient } from '@prisma/client'

async function main() {
  const prisma = new PrismaClient()
  const tabelas: { tablename: string }[] = await prisma.$queryRawUnsafe(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`)
  let n = 0
  for (const { tablename } of tabelas) {
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "public"."${tablename.replace(/"/g, '""')}" CASCADE`)
    n++
  }
  const tipos: { typname: string }[] = await prisma.$queryRawUnsafe(
    `SELECT t.typname FROM pg_type t JOIN pg_namespace ns ON ns.oid = t.typnamespace WHERE ns.nspname = 'public' AND t.typtype = 'e'`,
  )
  for (const { typname } of tipos) await prisma.$executeRawUnsafe(`DROP TYPE IF EXISTS "public"."${typname.replace(/"/g, '""')}" CASCADE`)
  console.log(`[edu-reset-db] ${n} tabelas e ${tipos.length} tipos removidos`)
  await prisma.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
