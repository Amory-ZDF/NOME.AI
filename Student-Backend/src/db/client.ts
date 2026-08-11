import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

import { PrismaClient } from '../generated/prisma/client.js'
import { normalizeSqliteDatabaseUrl } from './database-url.js'

export type StudentPrisma = PrismaClient

export function createPrisma(databaseUrl: string): StudentPrisma {
  const normalizedUrl = normalizeSqliteDatabaseUrl(databaseUrl)
  const adapter = new PrismaBetterSqlite3({ url: normalizedUrl })
  return new PrismaClient({ adapter })
}
