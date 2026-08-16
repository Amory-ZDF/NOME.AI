import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '../generated/prisma/client.js'
import {
  normalizeSqliteDatabaseUrl,
  normalizePostgresDatabaseUrl,
} from './database-url.js'

export type StudentPrisma = PrismaClient

const SQLITE_URL_PREFIX = 'file:'
const POSTGRES_URL_PREFIX = 'postgresql://'

export function createPrisma(databaseUrl: string): StudentPrisma {
  const trimmedUrl = databaseUrl.trim()
  if (trimmedUrl.startsWith(POSTGRES_URL_PREFIX)) {
    const normalizedUrl = normalizePostgresDatabaseUrl(trimmedUrl)
    const adapter = new PrismaPg({ connectionString: normalizedUrl })
    return new PrismaClient({ adapter })
  }

  // Default: SQLite (file:) — kept for tests and local single-file dev.
  const normalizedUrl = normalizeSqliteDatabaseUrl(trimmedUrl)
  const adapter = new PrismaBetterSqlite3({ url: normalizedUrl })
  return new PrismaClient({ adapter })
}
