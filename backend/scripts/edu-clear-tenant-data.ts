/**
 * Limpa os dados de demonstração (fictícios) de um tenant, mantendo o schema, a instituição (Clinic)
 * e os usuários (login/senha) intactos. Não toca nas tabelas "Clinic" e "User" de propósito.
 *
 * Uso:
 *   npx tsx scripts/edu-clear-tenant-data.ts --tenant=sua-instituicao            (dry-run: só conta)
 *   npx tsx scripts/edu-clear-tenant-data.ts --tenant=sua-instituicao --commit   (apaga de verdade)
 *
 * Ordem de exclusão calculada a partir das foreign keys reais do banco (pg_constraint), de tabelas-folha
 * para tabelas-raiz, para nunca violar uma constraint — cada DELETE roda na própria transação (evita o
 * mesmo problema de memória de locks descrito em edu-reset-db.ts ao tentar fazer tudo de uma vez).
 */
import { prisma } from '../src/lib/prisma'

const TENANT = (process.argv.find((a) => a.startsWith('--tenant=')) || '').split('=')[1] || process.env.DEMO_TENANT || 'sua-instituicao'
const COMMIT = process.argv.includes('--commit')
const EXCLUIR = new Set(['Clinic', 'User', '_prisma_migrations'])

async function main() {
  // 1) tabelas com coluna tenantId (exceto as protegidas)
  const tabelas: { table_name: string }[] = await prisma.$queryRawUnsafe(`
    SELECT c.table_name FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.column_name = 'tenantId'
  `)
  const alvo = tabelas.map((t) => t.table_name).filter((t) => !EXCLUIR.has(t))

  // 2) foreign keys entre tabelas do schema public, para montar a ordem folha -> raiz
  const fks: { child: string; parent: string }[] = await prisma.$queryRawUnsafe(`
    SELECT
      tc.table_name AS child,
      ccu.table_name AS parent
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public' AND tc.table_name <> ccu.table_name
  `)

  // tabelas que SÃO referenciadas por outras (não podem ser apagadas antes de quem aponta pra elas)
  const referenciadaPor = new Map<string, Set<string>>() // parent -> set de children que precisam sair antes
  for (const { child, parent } of fks) {
    if (!referenciadaPor.has(parent)) referenciadaPor.set(parent, new Set())
    referenciadaPor.get(parent)!.add(child)
  }

  // ordenação topológica simples: repete passadas removendo tabelas cujos "filhos pendentes" já foram todos resolvidos
  const pendentes = new Set(alvo)
  const ordem: string[] = []
  let avancou = true
  while (pendentes.size && avancou) {
    avancou = false
    for (const t of [...pendentes]) {
      const filhos = referenciadaPor.get(t)
      const temFilhoPendente = filhos && [...filhos].some((f) => pendentes.has(f) && f !== t)
      if (!temFilhoPendente) { ordem.push(t); pendentes.delete(t); avancou = true }
    }
  }
  // o que sobrou (ciclo de FKs) vai no fim, na ordem que estava
  ordem.push(...pendentes)

  console.log(`[clear-tenant-data] tenant=${TENANT} commit=${COMMIT} tabelas=${ordem.length}`)
  let totalLinhas = 0
  for (const tabela of ordem) {
    const [{ n }] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*)::bigint AS n FROM "public"."${tabela}" WHERE "tenantId" = $1`, TENANT)
    const qtd = Number(n)
    if (!qtd) continue
    totalLinhas += qtd
    if (COMMIT) {
      await prisma.$executeRawUnsafe(`DELETE FROM "public"."${tabela}" WHERE "tenantId" = $1`, TENANT)
      console.log(`  apagado  ${tabela}: ${qtd}`)
    } else {
      console.log(`  (dry-run) ${tabela}: ${qtd}`)
    }
  }
  console.log(`[clear-tenant-data] total de linhas ${COMMIT ? 'apagadas' : 'encontradas'}: ${totalLinhas}`)
}
main().catch((e) => { console.error('[clear-tenant-data] falhou:', e?.message || e); process.exit(1) }).finally(() => prisma.$disconnect())
