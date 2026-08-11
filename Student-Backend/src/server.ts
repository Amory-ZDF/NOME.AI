import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import type { FastifyInstance } from 'fastify'

import { buildApp } from './app.js'
import { parseEnv } from './config/env.js'
import { createPrisma, type StudentPrisma } from './db/client.js'

interface CloseableApp {
  close(): Promise<unknown>
}

interface DisconnectablePrisma {
  $disconnect(): Promise<unknown>
}

export function createShutdown(
  app: CloseableApp,
  prisma: DisconnectablePrisma,
): () => Promise<void> {
  let shutdownPromise: Promise<void> | undefined

  return () => {
    shutdownPromise ??= (async () => {
      try {
        await app.close()
      } finally {
        await prisma.$disconnect()
      }
    })()

    return shutdownPromise
  }
}

export async function runServer(): Promise<{
  app: FastifyInstance
  prisma: StudentPrisma
  shutdown: () => Promise<void>
}> {
  const env = parseEnv(process.env)
  const prisma = createPrisma(env.DATABASE_URL)
  const app = buildApp({ env, prisma })
  const shutdown = createShutdown(app, prisma)

  const handleSignal = () => {
    void shutdown().catch((error: unknown) => {
      app.log.error({ err: error }, 'Failed to shut down cleanly')
      process.exitCode = 1
    })
  }

  process.once('SIGINT', handleSignal)
  process.once('SIGTERM', handleSignal)

  try {
    await app.listen({ host: env.HOST, port: env.PORT })
  } catch (error) {
    app.log.error({ err: error }, 'Failed to start Student Backend')
    await shutdown()
    throw error
  }

  return { app, prisma, shutdown }
}

const entrypoint = process.argv[1]
if (
  entrypoint !== undefined &&
  pathToFileURL(resolve(entrypoint)).href === import.meta.url
) {
  void runServer().catch(() => {
    process.exitCode = 1
  })
}
