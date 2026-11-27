/**
 * Limpa os dados de demonstração (fictícios) de um tenant, mantendo o schema, a instituição (Clinic)
 * e os usuários (login/senha) intactos. Não toca nas tabelas "Clinic" e "User" de propósito.
 *
 * Uso:
 *   npx tsx scripts/edu-clear-tenant-data.ts --tenant=sua-instituicao            (dry-run: só conta)
 *   npx tsx scripts/edu-clear-tenant-data.ts --tenant=sua-instituicao --commit   (apaga de verdade)
 *
 * Descobre tabelas com "tenantId" próprio E tabelas que só são tenant-escopadas por tabela-mãe
 * (ex.: Enrollment não tem tenantId, mas referencia Student, que tem) — recursivamente, até não
 * achar mais nenhuma. A ordem de exclusão (folha -> raiz) vem das foreign keys reais do banco
 * (pg_constraint/information_schema), pra nunca violar uma constraint. Cada DELETE roda isolado
 * (evita o mesmo problema de memória de locks descrito em edu-reset-db.ts ao fazer tudo de uma vez).
 */
import { prisma } from '../src/lib/prisma'

const TENANT = (process.argv.find((a) => a.startsWith('--tenant=')) || '').split('=')[1] || process.env.DEMO_TENANT || 'sua-instituicao'
const COMMIT = process.argv.includes('--commit')
const EXCLUIR = new Set(['Clinic', 'User', '_prisma_migrations'])

type FK = { child: string; childCol: string; parent: string; parentCol: string }

async function main() {
  // 0) todas as foreign keys (coluna a coluna) do schema public
  const fks: FK[] = await prisma.$queryRawUnsafe(`
    SELECT
      kcu.table_name AS "child", kcu.column_name AS "childCol",
      ccu.table_name AS "parent", ccu.column_name AS "parentCol"
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public' AND kcu.table_name <> ccu.table_name
  `)

  // 1) tabelas com coluna tenantId própria (escopo direto)
  const comTenantId: { table_name: string }[] = await prisma.$queryRawUnsafe(`
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'tenantId'
  `)
  type Filtro = { where: string; params: string[] }
  const filtro = new Map<string, Filtro>()
  for (const { table_name } of comTenantId) {
    if (EXCLUIR.has(table_name)) continue
    filtro.set(table_name, { where: '"tenantId" = $1', params: [TENANT] })
  }

  // 2) propaga o escopo por FK (filhas sem tenantId próprio, mas que referenciam uma tabela já escopada) até fixar
  let mudou = true
  while (mudou) {
    mudou = false
    for (const fk of fks) {
      if (EXCLUIR.has(fk.child) || filtro.has(fk.child)) continue
      const pai = filtro.get(fk.parent)
      if (!pai) continue
      filtro.set(fk.child, { where: `"${fk.childCol}" IN (SELECT "${fk.parentCol}" FROM "public"."${fk.parent}" WHERE ${pai.where})`, params: pai.params })
      mudou = true
    }
  }

  const alvo = [...filtro.keys()]

  // 3) ordem de exclusão folha -> raiz entre as tabelas-alvo (quem referencia quem, só considerando FKs entre elas)
  const referenciadaPor = new Map<string, Set<string>>()
  for (const { child, parent } of fks) {
    if (!filtro.has(child) || !filtro.has(parent)) continue
    if (!referenciadaPor.has(parent)) referenciadaPor.set(parent, new Set())
    referenciadaPor.get(parent)!.add(child)
  }
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
  ordem.push(...pendentes) // ciclo de FKs remanescente (raro), na ordem que estava

  console.log(`[clear-tenant-data] tenant=${TENANT} commit=${COMMIT} tabelas=${ordem.length}`)
  let totalLinhas = 0
  let falhas = 0
  for (const tabela of ordem) {
    const f = filtro.get(tabela)!
    let qtd: number
    try {
      const [{ n }] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*)::bigint AS n FROM "public"."${tabela}" WHERE ${f.where}`, ...f.params)
      qtd = Number(n)
    } catch (e: any) { console.error(`  [erro ao contar] ${tabela}: ${e?.message || e}`); falhas++; continue }
    if (!qtd) continue
    totalLinhas += qtd
    if (COMMIT) {
      try {
        await prisma.$executeRawUnsafe(`DELETE FROM "public"."${tabela}" WHERE ${f.where}`, ...f.params)
        console.log(`  apagado  ${tabela}: ${qtd}`)
      } catch (e: any) { console.error(`  [erro ao apagar] ${tabela} (${qtd} linhas): ${e?.message || e}`); falhas++ }
    } else {
      console.log(`  (dry-run) ${tabela}: ${qtd}`)
    }
  }
  console.log(`[clear-tenant-data] total de linhas ${COMMIT ? 'apagadas' : 'encontradas'}: ${totalLinhas}${falhas ? ` (${falhas} tabela(s) com erro, ver acima)` : ''}`)
}
main().catch((e) => { console.error('[clear-tenant-data] falhou:', e?.message || e); process.exit(1) }).finally(() => prisma.$disconnect())
