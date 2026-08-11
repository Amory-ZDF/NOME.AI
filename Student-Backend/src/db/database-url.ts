const SQLITE_URL_PREFIX = 'file:'

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
