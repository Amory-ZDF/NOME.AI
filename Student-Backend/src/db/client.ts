import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

import { PrismaClient } from '../generated/prisma/client.js'

export type StudentPrisma = PrismaClient

export function createPrisma(databaseUrl: string): StudentPrisma {
  const normalizedUrl = databaseUrl.trim()

  if (normalizedUrl.length === 0) {
    throw new Error('A SQLite database URL is required')
  }

  const adapter = new PrismaBetterSqlite3({ url: normalizedUrl })
  return new PrismaClient({ adapter })
}
