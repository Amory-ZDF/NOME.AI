import { createServer } from 'node:net'
import { mkdtemp, mkdir, rm, rmdir, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve, sep } from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { pathToFileURL } from 'node:url'

import { afterEach, describe, expect, it, vi } from 'vitest'

const backendRoot = resolve(process.cwd())
const smokeRoot = resolve(backendRoot, '.startup-smoke-tmp')
const timeoutMilliseconds = 5_000
const requestTimeoutMilliseconds = 750
const pollMilliseconds = 50

type CloseResult = { code: number | null; signal: NodeJS.Signals | null }
type ChildCloseState = {
  readonly label: string
  readonly close: Promise<CloseResult>
  readonly errors: Error[]
  closed: boolean
}
type ChildRegistry = Map<ChildProcess, ChildCloseState>
type TimerApi = {
  setTimeout: (callback: () => void, milliseconds: number) => ReturnType<typeof setTimeout>
  clearTimeout: (timer: ReturnType<typeof setTimeout>) => void
}
type SpawnChild = (executable: string, args: string[], options: Parameters<typeof spawn>[2]) => ChildProcess
type CommandOptions = {
  registry?: ChildRegistry
  spawn?: SpawnChild
  timeoutMilliseconds?: number
}

const activeChildren: ChildRegistry = new Map()

function fakeChild(overrides: Record<string, unknown> = {}): ChildProcess {
  return Object.assign(new EventEmitter(), {
    connected: true,
    exitCode: null,
    signalCode: null,
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: () => true,
    send: (_message: unknown, callback: (error: Error | null) => void) => callback(null),
  }, overrides) as unknown as ChildProcess
}

function assertInsideSmokeRoot(candidate: string): string {
  const resolved = resolve(candidate)
  const pathFromRoot = relative(smokeRoot, resolved)
  if (pathFromRoot === '' || pathFromRoot === '..' || pathFromRoot.startsWith(`..${sep}`)) {
    throw new Error(`Unsafe smoke-test path: ${resolved}`)
  }
  return resolved
}

function sanitize(value: string, databaseUrl: string, secret: string): string {
  return value.replaceAll(databaseUrl, '[REDACTED_DATABASE_URL]').replaceAll(secret, '[REDACTED_SECRET]')
}

function trackChild(registry: ChildRegistry, child: ChildProcess, label: string): ChildCloseState {
  if (registry.has(child)) throw new Error(`${label} is already tracked`)

  let resolveClose!: (result: CloseResult) => void
  const state: ChildCloseState = {
    label,
    close: new Promise<CloseResult>((resolvePromise) => { resolveClose = resolvePromise }),
    errors: [],
    closed: false,
  }
  registry.set(child, state)

  const onError = (error: Error) => { state.errors.push(error) }
  const onClose = (code: number | null, signal: NodeJS.Signals | null) => {
    child.removeListener('error', onError)
    state.closed = true
    resolveClose({ code, signal })
  }
  child.on('error', onError)
  child.once('close', onClose)
  return state
}

async function withTimeout<T>(
  main: Promise<T>,
  milliseconds: number,
  message: string,
  timers: TimerApi = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout },
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      main,
      new Promise<never>((_, reject) => {
        timer = timers.setTimeout(() => reject(new Error(message)), milliseconds)
      }),
    ])
  } finally {
    if (timer !== undefined) timers.clearTimeout(timer)
  }
}

async function boundedClose(state: ChildCloseState, label: string, milliseconds = timeoutMilliseconds): Promise<CloseResult> {
  return await withTimeout(state.close, milliseconds, `Timed out waiting for ${label} to close`)
}

async function untrackClosedChild(
  registry: ChildRegistry,
  child: ChildProcess,
  state: ChildCloseState,
  label: string,
  milliseconds = timeoutMilliseconds,
): Promise<CloseResult> {
  const result = await boundedClose(state, label, milliseconds)
  if (!state.closed) throw new Error(`${label} close was not confirmed`)
  if (registry.get(child) !== state) throw new Error(`${label} close state changed while tracked`)
  registry.delete(child)
  return result
}

function signalFailure(child: ChildProcess, signal: NodeJS.Signals, label: string): Error | undefined {
  try {
    return child.kill(signal) ? undefined : new Error(`Failed to send ${signal} to ${label}`)
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error))
  }
}

async function terminateAndWait(
  child: ChildProcess,
  state: ChildCloseState,
  label: string,
  milliseconds = timeoutMilliseconds,
): Promise<void> {
  if (state.closed || child.exitCode !== null || child.signalCode !== null) {
    await boundedClose(state, label, milliseconds)
    return
  }

  const failures: unknown[] = []
  const termFailure = signalFailure(child, 'SIGTERM', label)
  if (termFailure !== undefined) failures.push(termFailure)
  try {
    await boundedClose(state, `${label} after SIGTERM`, milliseconds)
    return
  } catch (error) {
    failures.push(error)
  }

  const killFailure = signalFailure(child, 'SIGKILL', label)
  if (killFailure !== undefined) failures.push(killFailure)
  try {
    await boundedClose(state, `${label} after SIGKILL`, milliseconds)
    return
  } catch (error) {
    failures.push(error)
  }

  failures.push(...state.errors)
  throw new AggregateError(failures, `${label} cleanup failed`)
}

async function runWithCleanup<T>(operation: () => Promise<T>, cleanup: () => Promise<void>, label: string): Promise<T> {
  let result: T | undefined
  let operationError: unknown
  let operationFailed = false
  try {
    result = await operation()
  } catch (error) {
    operationFailed = true
    operationError = error
  }

  try {
    await cleanup()
  } catch (cleanupError) {
    if (operationFailed) throw new AggregateError([operationError, cleanupError], `${label} and cleanup failed`)
    throw cleanupError
  }

  if (operationFailed) throw operationError
  return result as T
}

async function reservePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolvePromise, reject) => {
    server.once('error', reject)
    server.listen({ host: '127.0.0.1', port: 0 }, resolvePromise)
  })
  const address = server.address()
  await new Promise<void>((resolvePromise, reject) => server.close((error) => error === undefined ? resolvePromise() : reject(error)))
  if (address === null || typeof address === 'string') throw new Error('Could not reserve a loopback port')
  return address.port
}

async function command(
  executable: string,
  args: string[],
  environment: NodeJS.ProcessEnv,
  databaseUrl: string,
  secret: string,
  options: CommandOptions = {},
): Promise<void> {
  const registry = options.registry ?? activeChildren
  const closeTimeout = options.timeoutMilliseconds ?? timeoutMilliseconds
  const spawnChild = options.spawn ?? spawn
  const label = `${executable} ${args.join(' ')}`
  const child = spawnChild(executable, args, { cwd: backendRoot, env: environment, windowsHide: true })
  const state = trackChild(registry, child, label)
  let output = ''
  const appendOutput = (chunk: Buffer) => { output += chunk.toString() }
  child.stdout?.on('data', appendOutput)
  child.stderr?.on('data', appendOutput)

  await runWithCleanup(async () => {
    try {
      const result = await boundedClose(state, label, closeTimeout)
      if (result.code !== 0) throw new Error(`exited with ${result.code ?? result.signal}`)
    } catch (error) {
      throw new Error(`Command failed (${label}):\n${sanitize(`${error instanceof Error ? error.message : String(error)}\n${output}`, databaseUrl, secret)}`, { cause: error })
    }
  }, async () => {
    if (!state.closed) await terminateAndWait(child, state, label, closeTimeout)
    await untrackClosedChild(registry, child, state, label, closeTimeout)
    child.stdout?.removeListener('data', appendOutput)
    child.stderr?.removeListener('data', appendOutput)
    if (state.errors.length > 0) throw new AggregateError(state.errors, `${label} emitted child-process errors`)
  }, label)
}

async function waitForHealth(port: number, child: ChildProcess, databaseUrl: string, secret: string, output: () => string): Promise<Response> {
  const deadline = Date.now() + timeoutMilliseconds
  let lastError = 'server did not respond'
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Production server exited early (${child.exitCode}):\n${sanitize(output(), databaseUrl, secret)}`)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMilliseconds)
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, {
        headers: { authorization: `Bearer ${secret}`, origin: 'http://smoke.test' },
        signal: controller.signal,
      })
      if (response.status === 200) return response
      lastError = `health returned ${response.status}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    } finally {
      clearTimeout(timeout)
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, pollMilliseconds))
  }
  throw new Error(`Timed out waiting for production health: ${lastError}\n${sanitize(output(), databaseUrl, secret)}`)
}

async function sendPlatformShutdownSignal(child: ChildProcess, milliseconds = timeoutMilliseconds): Promise<void> {
  await withTimeout(new Promise<void>((resolvePromise, reject) => {
    if (child.connected !== true || child.send === undefined) return reject(new Error('Production signal bridge is unavailable'))
    child.send('SIGTERM', (error) => error === null || error === undefined ? resolvePromise() : reject(error))
  }), milliseconds, 'Timed out sending production signal')
}

describe('compiled production server startup', () => {
  const temporaryPaths: string[] = []

  afterEach(async () => {
    const cleanupErrors: unknown[] = []
    for (const [child, state] of [...activeChildren]) {
      try {
        await terminateAndWait(child, state, `${state.label} afterEach cleanup`)
        await untrackClosedChild(activeChildren, child, state, `${state.label} afterEach cleanup`)
      } catch (error) {
        cleanupErrors.push(error)
      }
    }

    if (activeChildren.size === 0) {
      for (const temporaryPath of [...temporaryPaths]) {
        try {
          await rm(assertInsideSmokeRoot(temporaryPath), { recursive: true, force: true })
          temporaryPaths.splice(temporaryPaths.indexOf(temporaryPath), 1)
        } catch (error) {
          cleanupErrors.push(error)
        }
      }
      if (temporaryPaths.length === 0) {
        try {
          await rmdir(smokeRoot)
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') cleanupErrors.push(error)
        }
      }
    } else {
      cleanupErrors.push(new Error(`Refusing to delete smoke temporary paths while ${activeChildren.size} child process(es) remain unclosed`))
    }

    if (cleanupErrors.length > 0) throw new AggregateError(cleanupErrors, 'Startup smoke afterEach cleanup failed')
  })

  it('serves compiled-entry health with CORS and exits naturally after two runtime signals', async () => {
    await mkdir(smokeRoot, { recursive: true })
    const temporaryDirectory = assertInsideSmokeRoot(await mkdtemp(resolve(smokeRoot, 'startup-')))
    temporaryPaths.push(temporaryDirectory)
    const databasePath = assertInsideSmokeRoot(resolve(temporaryDirectory, 'student.db'))
    const databaseUrl = `file:${databasePath.replaceAll('\\', '/')}`
    const secret = 'smoke-auth-secret-must-not-leak'
    const port = await reservePort()
    const environment = { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: String(port), DATABASE_URL: databaseUrl, STUDENT_ID: 'smoke-student', CORS_ORIGINS: 'http://smoke.test', LOG_LEVEL: 'silent', SMOKE_SECRET: secret }
    let child: ChildProcess | undefined
    let serverState: ChildCloseState | undefined
    let output = ''

    await runWithCleanup(async () => {
      await command(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.build.json'], environment, databaseUrl, secret)
      await command(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], environment, databaseUrl, secret)

      const bridgePath = assertInsideSmokeRoot(resolve(temporaryDirectory, 'signal-bridge.mjs'))
      await writeFile(
        bridgePath,
        "process.on('message', (signal) => { if (signal === 'SIGTERM') process.emit('SIGTERM') })\nprocess.channel?.unref()\n",
      )
      child = spawn(process.execPath, ['--import', pathToFileURL(bridgePath).href, 'dist/server.js'], {
        cwd: backendRoot,
        env: environment,
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        windowsHide: true,
      })
      serverState = trackChild(activeChildren, child, 'compiled production server')
      child.stdout?.on('data', (chunk: Buffer) => { output += chunk.toString() })
      child.stderr?.on('data', (chunk: Buffer) => { output += chunk.toString() })

      await runWithCleanup(async () => {
        const health = await waitForHealth(port, child!, databaseUrl, secret, () => output)
        expect(health.headers.get('content-type')).toMatch(/^application\/json; charset=utf-8$/)
        expect(health.headers.get('access-control-allow-origin')).toBe('http://smoke.test')
        await expect(health.json()).resolves.toStrictEqual({ code: 0, message: 'ok', data: { status: 'ok' } })

        await Promise.all([sendPlatformShutdownSignal(child!), sendPlatformShutdownSignal(child!)])
        const closeResult = await boundedClose(serverState!, 'compiled production server')
        expect(closeResult).toStrictEqual({ code: 0, signal: null })
        expect(serverState!.errors).toStrictEqual([])
        expect(output).not.toContain(databaseUrl)
        expect(output).not.toContain(secret)
      }, async () => {
        if (!serverState!.closed) await terminateAndWait(child!, serverState!, 'compiled production server cleanup')
        await untrackClosedChild(activeChildren, child!, serverState!, 'compiled production server cleanup')
        child!.stdout?.removeAllListeners('data')
        child!.stderr?.removeAllListeners('data')
        if (serverState!.errors.length > 0) throw new AggregateError(serverState!.errors, 'compiled production server emitted child-process errors')
      }, 'compiled production server')
    }, async () => {
      if (activeChildren.size > 0) throw new Error(`Refusing to delete ${temporaryDirectory} before all child processes close`)
      await rm(dirname(databasePath), { recursive: true, force: true })
      const index = temporaryPaths.indexOf(temporaryDirectory)
      if (index >= 0) temporaryPaths.splice(index, 1)
    }, 'compiled production startup smoke')
  }, timeoutMilliseconds * 4)
})

describe('startup child lifecycle regression probes', () => {
  it('tracks one spawn-time close state through fast-close and already-exited paths', async () => {
    const registry = new Map<ChildProcess, ChildCloseState>()
    const fastChild = fakeChild()
    const fastState = trackChild(registry, fastChild, 'fast child')

    expect(registry.get(fastChild)).toBe(fastState)
    fastChild.emit('close', 0, null)
    await expect(boundedClose(fastState, 'fast child', 20)).resolves.toStrictEqual({ code: 0, signal: null })
    await untrackClosedChild(registry, fastChild, fastState, 'fast child', 20)
    expect(registry.has(fastChild)).toBe(false)

    const exitedSignals: NodeJS.Signals[] = []
    const exitedChild = fakeChild({ kill: (signal: NodeJS.Signals) => { exitedSignals.push(signal); return true } })
    const exitedState = trackChild(registry, exitedChild, 'already-exited child')
    Object.assign(exitedChild, { exitCode: 0 })
    queueMicrotask(() => exitedChild.emit('close', 0, null))
    await terminateAndWait(exitedChild, exitedState, 'already-exited child', 20)
    await untrackClosedChild(registry, exitedChild, exitedState, 'already-exited child', 20)
    expect(exitedSignals).toStrictEqual([])
    expect(registry.has(exitedChild)).toBe(false)
  })

  it('clears a timeout handle when the main promise settles', async () => {
    const handle = { probe: true } as unknown as ReturnType<typeof setTimeout>
    const set = vi.fn(() => handle)
    const clear = vi.fn()

    await expect(withTimeout(Promise.resolve('settled'), 20, 'settled probe', { setTimeout: set, clearTimeout: clear })).resolves.toBe('settled')
    expect(clear).toHaveBeenCalledExactlyOnceWith(handle)
  })

  it('bounds helper close cleanup and retains an unconfirmed child', async () => {
    const registry = new Map<ChildProcess, ChildCloseState>()
    const signals: NodeJS.Signals[] = []
    const child = fakeChild({ kill: (signal: NodeJS.Signals) => { signals.push(signal); return false } })

    await expect(command(
      process.execPath,
      ['-e', 'process.exit(0)'],
      process.env,
      'file:helper-probe.db',
      'helper-probe-secret',
      { registry, spawn: () => child, timeoutMilliseconds: 5 },
    )).rejects.toBeInstanceOf(AggregateError)
    expect(signals).toStrictEqual(['SIGTERM', 'SIGKILL'])
    expect(registry.has(child)).toBe(true)
  })

  it('bounds an IPC callback that never fires and clears its timeout', async () => {
    vi.useFakeTimers()
    const clear = vi.spyOn(globalThis, 'clearTimeout')
    const child = fakeChild({ send: () => true })
    try {
      const sending = sendPlatformShutdownSignal(child, 20)
      const rejection = expect(sending).rejects.toThrow('Timed out sending production signal')
      await vi.advanceTimersByTimeAsync(20)
      await rejection
      expect(clear).toHaveBeenCalled()
    } finally {
      clear.mockRestore()
      vi.useRealTimers()
    }
  })

  it('aggregates TERM, KILL, and final close failures without losing tracking', async () => {
    const registry = new Map<ChildProcess, ChildCloseState>()
    const child = fakeChild({ kill: () => false })
    const state = trackChild(registry, child, 'stuck child')

    const cleanup = terminateAndWait(child, state, 'stuck child', 5)
    await expect(cleanup).rejects.toSatisfy((error: unknown) =>
      error instanceof AggregateError
      && error.errors.some((entry) => String(entry).includes('SIGTERM'))
      && error.errors.some((entry) => String(entry).includes('SIGKILL')),
    )
    expect(registry.get(child)).toBe(state)
  })

  it('preserves the original failure and aggregates cleanup failures', async () => {
    const original = new Error('original operation failed')
    const cleanup = new Error('cleanup failed')

    await expect(runWithCleanup(
      async () => { throw original },
      async () => { throw cleanup },
      'probe operation',
    )).rejects.toSatisfy((error: unknown) =>
      error instanceof AggregateError
      && error.errors[0] === original
      && error.errors[1] === cleanup,
    )
  })
})
