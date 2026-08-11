import { once } from 'node:events'
import { createServer } from 'node:net'
import { mkdtemp, mkdir, rm, rmdir, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve, sep } from 'node:path'
import { fork, spawn, type ChildProcess } from 'node:child_process'
import { pathToFileURL } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

const backendRoot = resolve(process.cwd())
const smokeRoot = resolve(backendRoot, '.startup-smoke-tmp')
const timeoutMilliseconds = 5_000
const pollMilliseconds = 50

function assertInsideSmokeRoot(candidate: string): string {
  const resolved = resolve(candidate)
  const pathFromRoot = relative(smokeRoot, resolved)
  if (pathFromRoot === '' || pathFromRoot.startsWith(`..${sep}`) || pathFromRoot === '..') {
    throw new Error(`Unsafe smoke-test path: ${resolved}`)
  }
  return resolved
}

async function reservePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolvePromise, reject) => {
    server.once('error', reject)
    server.listen({ host: '127.0.0.1', port: 0 }, () => resolvePromise())
  })
  const address = server.address()
  await new Promise<void>((resolvePromise, reject) => server.close((error) => error === undefined ? resolvePromise() : reject(error)))
  if (address === null || typeof address === 'string') throw new Error('Could not reserve a loopback port')
  return address.port
}

function sanitize(value: string, databaseUrl: string, secret: string): string {
  return value.replaceAll(databaseUrl, '[REDACTED_DATABASE_URL]').replaceAll(secret, '[REDACTED_SECRET]')
}

function command(
  executable: string,
  args: string[],
  environment: NodeJS.ProcessEnv,
  databaseUrl: string,
  secret: string,
): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(executable, args, { cwd: backendRoot, env: environment, windowsHide: true })
    let output = ''
    child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString() })
    child.stderr.on('data', (chunk: Buffer) => { output += chunk.toString() })
    child.once('error', reject)
    child.once('close', (code) => {
      if (code === 0) return resolvePromise()
      reject(new Error(`Command failed (${executable} ${args.join(' ')}):\n${sanitize(output, databaseUrl, secret)}`))
    })
  })
}

async function waitForHealth(
  port: number,
  child: ChildProcess,
  databaseUrl: string,
  secret: string,
  output: () => string,
): Promise<Response> {
  const deadline = Date.now() + timeoutMilliseconds
  let lastError = 'server did not respond'
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Production server exited early (${child.exitCode}):\n${sanitize(output(), databaseUrl, secret)}`)
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, {
        headers: { authorization: `Bearer ${secret}`, origin: 'http://smoke.test' },
      })
      if (response.status === 200) return response
      lastError = `health returned ${response.status}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, pollMilliseconds))
  }
  throw new Error(`Timed out waiting for production health: ${lastError}\n${sanitize(output(), databaseUrl, secret)}`)
}

async function waitForClose(child: ChildProcess): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  return await Promise.race([
    once(child, 'close').then(([code, signal]) => ({ code: code as number | null, signal: signal as NodeJS.Signals | null })),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timed out waiting for production server shutdown')), timeoutMilliseconds)),
  ])
}

async function sendPlatformShutdownSignal(child: ChildProcess): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    child.send?.('SIGTERM', (error) => error === null || error === undefined ? resolvePromise() : reject(error))
  })
}

describe('compiled production server startup', () => {
  const temporaryPaths: string[] = []

  afterEach(async () => {
    await Promise.all(temporaryPaths.splice(0).map(async (temporaryPath) => {
      const verifiedPath = assertInsideSmokeRoot(temporaryPath)
      await rm(verifiedPath, { recursive: true, force: true })
    }))
    try {
      await rmdir(smokeRoot)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  })

  it('serves health with CORS and shuts down cleanly after repeated termination', async () => {
    await mkdir(smokeRoot, { recursive: true })
    const temporaryDirectory = assertInsideSmokeRoot(await mkdtemp(resolve(smokeRoot, 'startup-')))
    temporaryPaths.push(temporaryDirectory)
    const databasePath = assertInsideSmokeRoot(resolve(temporaryDirectory, 'student.db'))
    const databaseUrl = `file:${databasePath.replaceAll('\\', '/')}`
    const secret = 'smoke-auth-secret-must-not-leak'
    const port = await reservePort()
    const environment = {
      ...process.env,
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: String(port),
      DATABASE_URL: databaseUrl,
      STUDENT_ID: 'smoke-student',
      CORS_ORIGINS: 'http://smoke.test',
      LOG_LEVEL: 'silent',
      SMOKE_SECRET: secret,
    }
    let child: ChildProcess | undefined
    let output = ''
    let closeResult: { code: number | null; signal: NodeJS.Signals | null } | undefined

    try {
      await command(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.build.json'], environment, databaseUrl, secret)
      await command(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], environment, databaseUrl, secret)

      const wrapperPath = resolve(temporaryDirectory, 'compiled-server-wrapper.mjs')
      await writeFile(wrapperPath, `import { runServer } from ${JSON.stringify(pathToFileURL(resolve(backendRoot, 'dist/server.js')).href)};\nconst { shutdown } = await runServer();\nprocess.on('message', async (signal) => { process.emit(signal); await shutdown(); if (process.connected) process.disconnect(); });\n`)
      child = fork(wrapperPath, [], { cwd: backendRoot, env: environment, silent: true })
      child.stdout?.on('data', (chunk: Buffer) => { output += chunk.toString() })
      child.stderr?.on('data', (chunk: Buffer) => { output += chunk.toString() })

      const health = await waitForHealth(port, child, databaseUrl, secret, () => output)
      expect(health.headers.get('content-type')).toMatch(/^application\/json; charset=utf-8$/)
      expect(health.headers.get('access-control-allow-origin')).toBe('http://smoke.test')
      await expect(health.json()).resolves.toStrictEqual({ code: 0, message: 'ok', data: { status: 'ok' } })

      await Promise.all([sendPlatformShutdownSignal(child), sendPlatformShutdownSignal(child)])
      closeResult = await waitForClose(child)
      expect(closeResult).toStrictEqual({ code: 0, signal: null })
      expect(output).not.toContain(databaseUrl)
      expect(output).not.toContain(secret)
    } finally {
      if (child !== undefined) {
        const spawnedChild = child
        spawnedChild.stdout?.removeAllListeners('data')
        spawnedChild.stderr?.removeAllListeners('data')
        if (closeResult === undefined && spawnedChild.exitCode === null) {
          spawnedChild.kill('SIGTERM')
          await waitForClose(spawnedChild).catch(() => spawnedChild.kill('SIGKILL'))
        }
      }
      await rm(dirname(databasePath), { recursive: true, force: true })
      temporaryPaths.splice(temporaryPaths.indexOf(temporaryDirectory), 1)
    }
  }, timeoutMilliseconds * 3)
})
