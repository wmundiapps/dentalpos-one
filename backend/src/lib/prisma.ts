import { PrismaClient } from '@prisma/client'

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined
}

function runtimeDatabaseUrl() {
  const raw = String(process.env.DATABASE_URL || '').trim()
  if (!raw) return undefined

  try {
    const url = new URL(raw)
    const pooled =
      /pooler/i.test(url.hostname) ||
      url.port === '6543' ||
      url.searchParams.get('pgbouncer') === 'true'

    if (pooled) {
      if (!url.searchParams.has('pgbouncer')) {
        url.searchParams.set('pgbouncer', 'true')
      }
      if (!url.searchParams.has('connection_limit')) {
        url.searchParams.set('connection_limit', '1')
      }
    }

    return url.toString()
  } catch {
    return raw
  }
}

const databaseUrl = runtimeDatabaseUrl()

export const prisma =
  global.prisma ??
  new PrismaClient({
    ...(databaseUrl
      ? {
          datasources: {
            db: { url: databaseUrl },
          },
        }
      : {}),
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'info', 'warn', 'error']
        : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma
}
