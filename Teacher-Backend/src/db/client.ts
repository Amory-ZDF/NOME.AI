import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

import { PrismaClient } from '../generated/prisma/client.js'
import { normalizeSqliteDatabaseUrl } from './database-url.js'

export type TeacherPrisma = PrismaClient

export function createPrisma(databaseUrl: string): TeacherPrisma {
  const normalizedUrl = normalizeSqliteDatabaseUrl(databaseUrl)
  const adapter = new PrismaBetterSqlite3({ url: normalizedUrl })
  return new PrismaClient({ adapter })
}
