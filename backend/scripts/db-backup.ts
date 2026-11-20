/**
 * Operação manual do backup: `npx tsx scripts/db-backup.ts backup` | `restore-test` | `status`.
 * Usa as mesmas variáveis do servidor (DATABASE_URL, BACKUP_S3_* ou BACKUP_LOCAL_DIR, BACKUP_ENCRYPTION_KEY).
 */
import { prisma } from '../src/lib/prisma'
import { runBackup, runRestoreTest } from '../src/services/backupService'

async function main() {
  const cmd = process.argv[2]
  if (cmd === 'backup') console.log(await runBackup())
  else if (cmd === 'restore-test') console.log(JSON.stringify(await runRestoreTest(), (_k, v) => (typeof v === 'bigint' ? Number(v) : v), 2))
  else if (cmd === 'status') {
    const rows = await prisma.platformBackupRun.findMany({ orderBy: { startedAt: 'desc' }, take: 10 })
    console.log(JSON.stringify(rows, (_k, v) => (typeof v === 'bigint' ? Number(v) : v), 2))
  } else { console.log('uso: db-backup.ts backup | restore-test | status'); process.exitCode = 1 }
}
main().catch(e => { console.error(e?.message || e); process.exitCode = 1 }).finally(() => prisma.$disconnect())
