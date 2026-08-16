import 'dotenv/config'

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

interface ServerApp extends CloseableApp {
  listen(options: { host: string; port: number }): Promise<unknown>
  log: {
    error(bindings: { err: unknown }, message: string): unknown
  }
}

interface ServerPrisma extends DisconnectablePrisma {
  $connect(): Promise<unknown>
}

type ShutdownSignal = 'SIGINT' | 'SIGTERM'

interface SignalTarget {
  once(signal: ShutdownSignal, listener: () => void): unknown
  removeListener(signal: ShutdownSignal, listener: () => void): unknown
}

function throwCleanupErrors(errors: unknown[]): void {
  if (errors.length === 1) {
    throw errors[0]
  }
  if (errors.length > 1) {
    throw new AggregateError(errors, 'Student Backend cleanup failed')
  }
}

function startupCleanupError(startupError: unknown, cleanupError: unknown): AggregateError {
  const cleanupErrors =
    cleanupError instanceof AggregateError ? cleanupError.errors : [cleanupError]
  return new AggregateError(
    [startupError, ...cleanupErrors],
    'Student Backend startup and cleanup failed',
    { cause: startupError },
  )
}

export function createShutdown(
  app: CloseableApp,
  prisma: DisconnectablePrisma,
  disposeSignals: () => void = () => undefined,
): () => Promise<void> {
  let shutdownPromise: Promise<void> | undefined

  return () => {
    shutdownPromise ??= (async () => {
      const errors: unknown[] = []

      try {
        disposeSignals()
      } catch (error) {
        errors.push(error)
      }

      try {
        await app.close()
      } catch (error) {
        errors.push(error)
      }

      try {
        await prisma.$disconnect()
      } catch (error) {
        errors.push(error)
      }

      throwCleanupErrors(errors)
    })()

    return shutdownPromise
  }
}

export function registerShutdownSignals(
  signalTarget: SignalTarget,
  shutdown: () => Promise<void>,
  onError: (error: unknown) => void,
): () => void {
  let disposed = false
  const handleSignal = () => {
    void shutdown().catch(onError)
  }

  signalTarget.once('SIGINT', handleSignal)
  try {
    signalTarget.once('SIGTERM', handleSignal)
  } catch (error) {
    signalTarget.removeListener('SIGINT', handleSignal)
    throw error
  }

  return () => {
    if (disposed) {
      return
    }
    disposed = true

    const errors: unknown[] = []
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      try {
        signalTarget.removeListener(signal, handleSignal)
      } catch (error) {
        errors.push(error)
      }
    }
    throwCleanupErrors(errors)
  }
}

interface StartServerOptions {
  app: ServerApp
  host: string
  onShutdownError: (error: unknown) => void
  port: number
  prisma: ServerPrisma
  signalTarget: SignalTarget
}

export async function startServer({
  app,
  host,
  onShutdownError,
  port,
  prisma,
  signalTarget,
}: StartServerOptions): Promise<{ shutdown: () => Promise<void> }> {
  let disposeSignals: () => void = () => undefined
  let settleStartupAttempt!: () => void
  let startupAttemptSettled = false
  const startupAttempt = new Promise<void>((resolveStartupAttempt) => {
    settleStartupAttempt = () => {
      if (startupAttemptSettled) {
        return
      }
      startupAttemptSettled = true
      resolveStartupAttempt()
    }
  })
  const cleanup = createShutdown(app, prisma, () => disposeSignals())
  let shutdownRequested = false
  let shutdownPromise: Promise<void> | undefined
  const shutdown = () => {
    shutdownRequested = true
    shutdownPromise ??= (async () => {
      await startupAttempt
      await cleanup()
    })()
    return shutdownPromise
  }

  let didStartupFail = false
  let startupError: unknown

  try {
    disposeSignals = registerShutdownSignals(signalTarget, shutdown, onShutdownError)
    await prisma.$connect()
    if (!shutdownRequested) {
      await app.listen({ host, port })
    }
  } catch (error) {
    didStartupFail = true
    startupError = error
  }

  settleStartupAttempt()

  if (didStartupFail) {
    try {
      await shutdown()
    } catch (cleanupError) {
      throw startupCleanupError(startupError, cleanupError)
    }
    throw startupError
  }

  if (shutdownRequested) {
    await shutdown()
  }

  return { shutdown }
}

export async function runServer(): Promise<{
  app: FastifyInstance
  prisma: StudentPrisma
  shutdown: () => Promise<void>
}> {
  const env = parseEnv(process.env)
  const prisma = createPrisma(env.DATABASE_URL)
  let app: ReturnType<typeof buildApp>
  try {
    app = buildApp({ env, prisma })
  } catch (startupError) {
    try {
      await prisma.$disconnect()
    } catch (cleanupError) {
      throw startupCleanupError(startupError, cleanupError)
    }
    throw startupError
  }

  const reportShutdownError = (error: unknown) => {
    try {
      app.log.error({ err: error }, 'Failed to shut down cleanly')
    } finally {
      process.exitCode = 1
    }
  }

  try {
    const { shutdown } = await startServer({
      app,
      host: env.HOST,
      onShutdownError: reportShutdownError,
      port: env.PORT,
      prisma,
      signalTarget: process,
    })
    return { app, prisma, shutdown }
  } catch (error) {
    try {
      app.log.error({ err: error }, 'Failed to start Student Backend')
    } catch {
      // Preserve the startup error if logging itself is unavailable.
    }
    throw error
  }
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
