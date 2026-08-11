# Student Backend

This package is the standalone Fastify/Prisma API for the student application.

## Local database boundary

The bundled SQLite setup is for single-process, single-writer development only. Do not run
multiple API servers, seed commands, or other writers against the same database file at the
same time. A production deployment that needs concurrent writers must use a database and
deployment topology designed for that workload rather than relying on SQLite write retries.

## Demo seed

The seed is destructive for the configured student: it replaces that student's aggregate
with the backend-owned demo fixture. Run it only with an explicit development or test
environment, for example:

```powershell
$env:NODE_ENV='development'
$env:DATABASE_URL='file:./prisma/dev.db'
npm run db:seed
```

The seed runner rejects production and an unset `NODE_ENV` before creating a Prisma client.
It is not a production data migration mechanism.
