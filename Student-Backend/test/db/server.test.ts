import { EventEmitter } from 'node:events'

import { describe, expect, it, vi } from 'vitest'

import {
  createShutdown,
  registerShutdownSignals,
  startServer,
} from '../../src/server.js'

function createServerDoubles(options: {
  closeError?: Error
  connectError?: Error
  disconnectError?: Error
  listenError?: Error
} = {}) {
  const callOrder: string[] = []
  const app = {
    close: vi.fn(async () => {
      callOrder.push('close')
      if (options.closeError !== undefined) {
        throw options.closeError
      }
    }),
    listen: vi.fn(async () => {
      callOrder.push('listen')
      if (options.listenError !== undefined) {
        throw options.listenError
      }
    }),
    log: { error: vi.fn() },
  }
  const prisma = {
    $connect: vi.fn(async () => {
      callOrder.push('connect')
      if (options.connectError !== undefined) {
        throw options.connectError
      }
    }),
    $disconnect: vi.fn(async () => {
      callOrder.push('disconnect')
      if (options.disconnectError !== undefined) {
        throw options.disconnectError
      }
    }),
  }

  return { app, callOrder, prisma }
}

describe('Student Backend server lifecycle', () => {
  it('returns an idempotent signal disposer', async () => {
    const signals = new EventEmitter()
    const shutdown = vi.fn(async () => undefined)
    const reportError = vi.fn()
    const dispose = registerShutdownSignals(signals, shutdown, reportError)

    expect(signals.listenerCount('SIGINT')).toBe(1)
    expect(signals.listenerCount('SIGTERM')).toBe(1)

    dispose()
    dispose()
    signals.emit('SIGINT')
    await Promise.resolve()

    expect(signals.listenerCount('SIGINT')).toBe(0)
    expect(signals.listenerCount('SIGTERM')).toBe(0)
    expect(shutdown).not.toHaveBeenCalled()
    expect(reportError).not.toHaveBeenCalled()
  })

  it('connects before listening and disposes both listeners on the first signal', async () => {
    const signals = new EventEmitter()
    const { app, callOrder, prisma } = createServerDoubles()
    const reportError = vi.fn()
    const { shutdown } = await startServer({
      app,
      host: '127.0.0.1',
      onShutdownError: reportError,
      port: 3001,
      prisma,
      signalTarget: signals,
    })

    expect(callOrder).toEqual(['connect', 'listen'])
    expect(signals.listenerCount('SIGINT')).toBe(1)
    expect(signals.listenerCount('SIGTERM')).toBe(1)

    signals.emit('SIGINT')
    signals.emit('SIGTERM')
    await shutdown()

    expect(app.close).toHaveBeenCalledTimes(1)
    expect(prisma.$disconnect).toHaveBeenCalledTimes(1)
    expect(signals.listenerCount('SIGINT')).toBe(0)
    expect(signals.listenerCount('SIGTERM')).toBe(0)
    expect(reportError).not.toHaveBeenCalled()
  })

  it.each(['connect', 'listen'] as const)(
    'cleans up exactly once and removes listeners when %s fails',
    async (stage) => {
      const startupError = new Error(`${stage} failed`)
      const signals = new EventEmitter()
      const { app, prisma } = createServerDoubles({
        ...(stage === 'connect'
          ? { connectError: startupError }
          : { listenError: startupError }),
      })

      await expect(
        startServer({
          app,
          host: '127.0.0.1',
          onShutdownError: vi.fn(),
          port: 3001,
          prisma,
          signalTarget: signals,
        }),
      ).rejects.toBe(startupError)

      expect(prisma.$connect).toHaveBeenCalledTimes(1)
      expect(app.listen).toHaveBeenCalledTimes(stage === 'connect' ? 0 : 1)
      expect(app.close).toHaveBeenCalledTimes(1)
      expect(prisma.$disconnect).toHaveBeenCalledTimes(1)
      expect(signals.listenerCount('SIGINT')).toBe(0)
      expect(signals.listenerCount('SIGTERM')).toBe(0)
    },
  )

  it('cleans resources if signal registration fails partway through', async () => {
    const startupError = new Error('SIGTERM registration failed')
    const signals = new EventEmitter()
    const register = signals.once.bind(signals)
    vi.spyOn(signals, 'once').mockImplementation((signal, listener) => {
      if (signal === 'SIGTERM') {
        throw startupError
      }
      return register(signal, listener)
    })
    const { app, prisma } = createServerDoubles()

    await expect(
      startServer({
        app,
        host: '127.0.0.1',
        onShutdownError: vi.fn(),
        port: 3001,
        prisma,
        signalTarget: signals,
      }),
    ).rejects.toBe(startupError)

    expect(prisma.$connect).not.toHaveBeenCalled()
    expect(app.listen).not.toHaveBeenCalled()
    expect(app.close).toHaveBeenCalledTimes(1)
    expect(prisma.$disconnect).toHaveBeenCalledTimes(1)
    expect(signals.listenerCount('SIGINT')).toBe(0)
    expect(signals.listenerCount('SIGTERM')).toBe(0)
  })

  it('attempts both cleanup operations and preserves both failures', async () => {
    const closeError = new Error('close failed')
    const disconnectError = new Error('disconnect failed')
    const { app, prisma } = createServerDoubles({ closeError, disconnectError })
    const disposeSignals = vi.fn()
    const shutdown = createShutdown(app, prisma, disposeSignals)

    let thrown: unknown
    try {
      await Promise.all([shutdown(), shutdown(), shutdown()])
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(AggregateError)
    expect((thrown as AggregateError).errors).toEqual([closeError, disconnectError])
    expect(disposeSignals).toHaveBeenCalledTimes(1)
    expect(app.close).toHaveBeenCalledTimes(1)
    expect(prisma.$disconnect).toHaveBeenCalledTimes(1)
  })

  it('preserves startup plus both cleanup failures', async () => {
    const startupError = new Error('listen failed')
    const closeError = new Error('close failed')
    const disconnectError = new Error('disconnect failed')
    const signals = new EventEmitter()
    const { app, prisma } = createServerDoubles({
      closeError,
      disconnectError,
      listenError: startupError,
    })

    let thrown: unknown
    try {
      await startServer({
        app,
        host: '127.0.0.1',
        onShutdownError: vi.fn(),
        port: 3001,
        prisma,
        signalTarget: signals,
      })
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(AggregateError)
    expect((thrown as AggregateError).errors).toEqual([
      startupError,
      closeError,
      disconnectError,
    ])
    expect(app.close).toHaveBeenCalledTimes(1)
    expect(prisma.$disconnect).toHaveBeenCalledTimes(1)
    expect(signals.listenerCount('SIGINT')).toBe(0)
    expect(signals.listenerCount('SIGTERM')).toBe(0)
  })
})
