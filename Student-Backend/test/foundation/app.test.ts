import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { buildApp } from '../../src/app.js'
import { AppError } from '../../src/common/errors/app-error.js'
import { parseEnv } from '../../src/config/env.js'

const testEnv = parseEnv({
  NODE_ENV: 'test',
  DATABASE_URL: 'file:./foundation-test.db',
  CORS_ORIGINS: 'https://student.example.com',
  LOG_LEVEL: 'silent',
})

const openApps: FastifyInstance[] = []

function createApp() {
  const app = buildApp({ env: testEnv })
  openApps.push(app)
  return app
}

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()))
})

describe('Fastify application foundation', () => {
  it('returns the health envelope', async () => {
    const response = await createApp().inject({ method: 'GET', url: '/health' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      code: 0,
      message: 'ok',
      data: { status: 'ok' },
    })
  })

  it('returns a stable not-found envelope for missing routes', async () => {
    const response = await createApp().inject({ method: 'GET', url: '/missing' })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({
      code: 'NOT_FOUND',
      message: 'Route not found',
      data: null,
    })
  })

  it('allows only configured CORS origins', async () => {
    const app = createApp()

    const configured = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://student.example.com' },
    })
    const unconfigured = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://attacker.example.com' },
    })

    expect(configured.headers['access-control-allow-origin']).toBe(
      'https://student.example.com',
    )
    expect(unconfigured.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('publishes OpenAPI JSON containing the health route', async () => {
    const response = await createApp().inject({
      method: 'GET',
      url: '/documentation/json',
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('application/json')
    expect(response.json()).toMatchObject({
      openapi: '3.0.3',
      paths: {
        '/health': {
          get: {},
        },
      },
    })
  })

  it('serves the documentation UI with a content security policy', async () => {
    const response = await createApp().inject({
      method: 'GET',
      url: '/documentation/',
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-security-policy']).toBeDefined()
  })

  it('maps AppError without exposing a stack', async () => {
    const app = createApp()
    app.get('/expected-error', async () => {
      throw new AppError('Foundation conflict', 409, 'FOUNDATION_CONFLICT', {
        retryable: false,
      })
    })

    const response = await app.inject({ method: 'GET', url: '/expected-error' })

    expect(response.statusCode).toBe(409)
    expect(response.json()).toEqual({
      code: 'FOUNDATION_CONFLICT',
      message: 'Foundation conflict',
      data: { retryable: false },
    })
    expect(response.body).not.toContain('stack')
  })

  it('maps unexpected errors without exposing private details', async () => {
    const app = createApp()
    app.get('/unexpected-error', async () => {
      throw new Error('private database credential leaked')
    })

    const response = await app.inject({ method: 'GET', url: '/unexpected-error' })

    expect(response.statusCode).toBe(500)
    expect(response.json()).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      data: null,
    })
    expect(response.body).not.toContain('private database credential leaked')
    expect(response.body).not.toContain('stack')
  })

  it('maps strict Zod body validation failures to a public error', async () => {
    const app = createApp()
    app.post(
      '/strict-body',
      {
        schema: {
          body: z.strictObject({ name: z.string().min(1) }),
        },
      },
      async () => ({ accepted: true }),
    )

    const response = await app.inject({
      method: 'POST',
      url: '/strict-body',
      payload: { name: 'Ada', unexpected: true },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      code: 'INVALID_INPUT',
      message: 'Invalid request',
      data: null,
    })
    expect(response.body).not.toContain('unexpected')
    expect(response.body).not.toContain('unrecognized_keys')
  })
})
