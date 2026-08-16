const SQLITE_URL_PREFIX = 'file:'
const POSTGRES_URL_PREFIX = 'postgresql://'

export function normalizeSqliteDatabaseUrl(databaseUrl: string): string {
  const normalizedUrl = databaseUrl.trim()
  const databaseLocation = normalizedUrl.slice(SQLITE_URL_PREFIX.length)

  if (
    !normalizedUrl.startsWith(SQLITE_URL_PREFIX) ||
    databaseLocation.length === 0 ||
    databaseLocation.trim() !== databaseLocation ||
    databaseLocation.includes('\0')
  ) {
    throw new Error(
      'SQLite database URL must start with file: and include a database location',
    )
  }

  return normalizedUrl
}

export function normalizePostgresDatabaseUrl(databaseUrl: string): string {
  const normalizedUrl = databaseUrl.trim()

  if (!normalizedUrl.startsWith(POSTGRES_URL_PREFIX)) {
    throw new Error(
      'PostgreSQL database URL must start with postgresql:// and include host and database',
    )
  }

  let parsed: URL
  try {
    parsed = new URL(normalizedUrl)
  } catch {
    throw new Error('PostgreSQL database URL is not a valid URL')
  }

  if (parsed.hostname.length === 0 || parsed.pathname.length <= 1) {
    throw new Error(
      'PostgreSQL database URL must include a host and a database name',
    )
  }

  return normalizedUrl
}
