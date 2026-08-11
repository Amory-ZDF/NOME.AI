import { createServer } from 'node:net'
import { mkdtemp, mkdir, rm, rmdir, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve, sep } from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'
import { pathToFileURL } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

const backendRoot = resolve(process.cwd())
const smokeRoot = resolve(backendRoot, '.startup-smoke-tmp')
const timeoutMilliseconds = 5_000
const requestTimeoutMilliseconds = 750
const pollMilliseconds = 50

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

function waitForClose(child: ChildProcess, label: string): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  return new Promise((resolvePromise, reject) => {
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error(`Timed out waiting for ${label} to close`))
    }, timeoutMilliseconds)
    const onClose = (code: number | null, signal: NodeJS.Signals | null) => {
      cleanup()
      resolvePromise({ code, signal })
    }
    const onError = (error: Error) => {
      cleanup()
      reject(error)
    }
    const cleanup = () => {
      clearTimeout(timeout)
      child.removeListener('close', onClose)
      child.removeListener('error', onError)
    }
    child.once('close', onClose)
    child.once('error', onError)
  })
}

async function terminateAndWait(child: ChildProcess, label: string): Promise<void> {
  if (child.exitCode !== null) return
  const terminated = waitForClose(child, `${label} after SIGTERM`)
  child.kill('SIGTERM')
  try {
    await terminated
    return
  } catch {
    if (child.exitCode !== null) return
  }

  const killed = waitForClose(child, `${label} after SIGKILL`)
  child.kill('SIGKILL')
  await killed
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
): Promise<void> {
  const child = spawn(executable, args, { cwd: backendRoot, env: environment, windowsHide: true })
  let output = ''
  const appendOutput = (chunk: Buffer) => { output += chunk.toString() }
  child.stdout.on('data', appendOutput)
  child.stderr.on('data', appendOutput)
  const close = waitForClose(child, `${executable} ${args.join(' ')}`)
  try {
    const result = await close
    if (result.code !== 0) throw new Error(`exited with ${result.code ?? result.signal}`)
  } catch (error) {
    await terminateAndWait(child, `${executable} ${args.join(' ')}`).catch(() => undefined)
    throw new Error(`Command failed (${executable} ${args.join(' ')}):\n${sanitize(`${error instanceof Error ? error.message : String(error)}\n${output}`, databaseUrl, secret)}`)
  } finally {
    child.stdout.removeListener('data', appendOutput)
    child.stderr.removeListener('data', appendOutput)
  }
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

async function sendPlatformShutdownSignal(child: ChildProcess): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    if (child.connected !== true || child.send === undefined) return reject(new Error('Production signal bridge is unavailable'))
    child.send('SIGTERM', (error) => error === null || error === undefined ? resolvePromise() : reject(error))
  })
}

describe('compiled production server startup', () => {
  const temporaryPaths: string[] = []
  const activeChildren = new Set<ChildProcess>()

  afterEach(async () => {
    await Promise.all([...activeChildren].map(async (child) => {
      activeChildren.delete(child)
      await terminateAndWait(child, 'production server cleanup').catch(() => undefined)
    }))
    await Promise.all(temporaryPaths.splice(0).map(async (temporaryPath) => rm(assertInsideSmokeRoot(temporaryPath), { recursive: true, force: true })))
    try {
      await rmdir(smokeRoot)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
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
    let output = ''
    let closeResult: { code: number | null; signal: NodeJS.Signals | null } | undefined

    try {
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
      activeChildren.add(child)
      child.stdout?.on('data', (chunk: Buffer) => { output += chunk.toString() })
      child.stderr?.on('data', (chunk: Buffer) => { output += chunk.toString() })

      const health = await waitForHealth(port, child, databaseUrl, secret, () => output)
      expect(health.headers.get('content-type')).toMatch(/^application\/json; charset=utf-8$/)
      expect(health.headers.get('access-control-allow-origin')).toBe('http://smoke.test')
      await expect(health.json()).resolves.toStrictEqual({ code: 0, message: 'ok', data: { status: 'ok' } })

      const close = waitForClose(child, 'compiled production server')
      await Promise.all([sendPlatformShutdownSignal(child), sendPlatformShutdownSignal(child)])
      closeResult = await close
      expect(closeResult).toStrictEqual({ code: 0, signal: null })
      expect(output).not.toContain(databaseUrl)
      expect(output).not.toContain(secret)
      activeChildren.delete(child)
    } finally {
      if (child !== undefined) {
        child.stdout?.removeAllListeners('data')
        child.stderr?.removeAllListeners('data')
        if (closeResult === undefined) await terminateAndWait(child, 'production server cleanup').catch(() => undefined)
        activeChildren.delete(child)
      }
      await rm(dirname(databasePath), { recursive: true, force: true })
      const index = temporaryPaths.indexOf(temporaryDirectory)
      if (index >= 0) temporaryPaths.splice(index, 1)
    }
  }, timeoutMilliseconds * 4)
})
