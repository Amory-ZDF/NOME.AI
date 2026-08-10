import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { afterEach, describe, expect, expectTypeOf, it } from 'vitest'
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

const openApps: Array<ReturnType<typeof buildApp>> = []

function createApp(loggerStream?: { write(message: string): void }) {
  const app = buildApp({
    env: {
      ...testEnv,
      LOG_LEVEL: loggerStream === undefined ? 'silent' : 'error',
    },
    ...(loggerStream === undefined ? {} : { loggerStream }),
  })
  openApps.push(app)
  return app
}

function createLogCapture() {
  let output = ''

  return {
    stream: {
      write(message: string) {
        output += message
      },
    },
    read: () => output,
  }
}

function registerStrictBodyRoute(
  app: ReturnType<typeof buildApp>,
  options: { bodyLimit?: number } = {},
) {
  app.register(async (instance) => {
    const routes = instance.withTypeProvider<ZodTypeProvider>()
    routes.post(
      '/strict-body',
      {
        ...(options.bodyLimit === undefined ? {} : { bodyLimit: options.bodyLimit }),
        schema: {
          body: z.strictObject({ name: z.string().min(1) }),
        },
      },
      async (request) => ({ accepted: request.body.name }),
    )
  })
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

  it.each(['PATCH', 'DELETE'])('allows configured-origin %s preflight', async (method) => {
    const response = await createApp().inject({
      method: 'OPTIONS',
      url: '/cors-preflight',
      headers: {
        origin: 'https://student.example.com',
        'access-control-request-method': method,
      },
    })

    expect(response.statusCode).toBe(204)
    expect(response.headers['access-control-allow-origin']).toBe(
      'https://student.example.com',
    )
    expect(response.headers['access-control-allow-methods']).toContain(method)
  })

  it('does not allow an unconfigured-origin preflight', async () => {
    const response = await createApp().inject({
      method: 'OPTIONS',
      url: '/cors-preflight',
      headers: {
        origin: 'https://attacker.example.com',
        'access-control-request-method': 'DELETE',
      },
    })

    expect(response.headers['access-control-allow-origin']).toBeUndefined()
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

  it('preserves root Zod inference and documents plugin-registered routes', async () => {
    const bodySchema = z.object({ value: z.string() })
    const responseSchema = z.object({ echoed: z.string() })
    const app = createApp()

    app.post(
      '/root-type-proof',
      {
        schema: {
          body: bodySchema,
          response: { 200: responseSchema },
        },
      },
      async (request, reply) => {
        expectTypeOf(request.body).toEqualTypeOf<{ value: string }>()
        expectTypeOf(reply.send).parameter(0).toEqualTypeOf<{ echoed: string }>()
        return reply.send({ echoed: request.body.value })
      },
    )

    app.register(async (instance) => {
      const routes = instance.withTypeProvider<ZodTypeProvider>()
      routes.post(
        '/plugin-echo',
        {
          schema: {
            body: bodySchema,
            response: { 200: responseSchema },
          },
        },
        async (request, reply) => {
          expectTypeOf(request.body).toEqualTypeOf<{ value: string }>()
          expectTypeOf(reply.send).parameter(0).toEqualTypeOf<{ echoed: string }>()
          return reply.send({ echoed: request.body.value })
        },
      )
    })

    const response = await app.inject({
      method: 'POST',
      url: '/plugin-echo',
      payload: { value: 'typed' },
    })
    const documentation = await app.inject({
      method: 'GET',
      url: '/documentation/json',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ echoed: 'typed' })
    expect(documentation.json().paths).toHaveProperty('/plugin-echo')
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

  it('logs a 5xx AppError cause without exposing it to the client', async () => {
    const capture = createLogCapture()
    const app = createApp(capture.stream)
    app.get('/upstream-error', async () => {
      throw new AppError(
        'Dependency unavailable',
        503,
        'UPSTREAM_UNAVAILABLE',
        { retryable: true },
        { cause: new Error('private upstream cause') },
      )
    })

    const response = await app.inject({ method: 'GET', url: '/upstream-error' })
    const logs = capture.read()

    expect(response.statusCode).toBe(503)
    expect(response.json()).toEqual({
      code: 'UPSTREAM_UNAVAILABLE',
      message: 'Dependency unavailable',
      data: { retryable: true },
    })
    expect(response.body).not.toContain('private upstream cause')
    expect(logs).toContain('Application error')
    expect(logs).toContain('private upstream cause')
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

  it('does not trust a forged validation field and logs the unexpected error', async () => {
    const capture = createLogCapture()
    const app = createApp(capture.stream)
    app.get('/forged-validation-error', async () => {
      throw {
        name: 'ForgedValidationError',
        message: 'forged validation marker',
        validation: [{ message: 'not a trusted Zod issue' }],
      }
    })

    const response = await app.inject({ method: 'GET', url: '/forged-validation-error' })

    expect(response.statusCode).toBe(500)
    expect(response.json()).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      data: null,
    })
    expect(capture.read()).toContain('forged validation marker')
  })

  it.each([
    ['malformed JSON', '{', undefined],
    ['empty JSON', '', '0'],
  ])('maps %s to a stable invalid-input envelope', async (_case, payload, contentLength) => {
    const app = createApp()
    registerStrictBodyRoute(app)

    const response = await app.inject({
      method: 'POST',
      url: '/strict-body',
      headers: {
        'content-type': 'application/json',
        ...(contentLength === undefined ? {} : { 'content-length': contentLength }),
      },
      payload,
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      code: 'INVALID_INPUT',
      message: 'Invalid request',
      data: null,
    })
  })

  it('maps an invalid content length to a stable invalid-input envelope', async () => {
    const app = createApp()
    registerStrictBodyRoute(app)

    const response = await app.inject({
      method: 'POST',
      url: '/strict-body',
      headers: {
        'content-type': 'application/json',
        'content-length': '100',
      },
      payload: '{}',
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      code: 'INVALID_INPUT',
      message: 'Invalid request',
      data: null,
    })
  })

  it('maps an unsupported media type to a stable public envelope', async () => {
    const app = createApp()
    registerStrictBodyRoute(app)

    const response = await app.inject({
      method: 'POST',
      url: '/strict-body',
      headers: { 'content-type': 'application/xml' },
      payload: '<student />',
    })

    expect(response.statusCode).toBe(415)
    expect(response.json()).toEqual({
      code: 'UNSUPPORTED_MEDIA_TYPE',
      message: 'Unsupported media type',
      data: null,
    })
  })

  it('maps an oversized body to a stable public envelope', async () => {
    const app = createApp()
    registerStrictBodyRoute(app, { bodyLimit: 16 })

    const response = await app.inject({
      method: 'POST',
      url: '/strict-body',
      payload: { name: 'a value larger than sixteen bytes' },
    })

    expect(response.statusCode).toBe(413)
    expect(response.json()).toEqual({
      code: 'PAYLOAD_TOO_LARGE',
      message: 'Payload too large',
      data: null,
    })
  })

  it('logs response serialization failures and returns a private 500 envelope', async () => {
    const capture = createLogCapture()
    const app = createApp(capture.stream)
    app.register(async (instance) => {
      const routes = instance.withTypeProvider<ZodTypeProvider>()
      routes.get(
        '/invalid-response',
        { schema: { response: { 200: z.object({ value: z.string() }) } } },
        async () => ({ value: 42 }) as never,
      )
    })

    const response = await app.inject({ method: 'GET', url: '/invalid-response' })

    expect(response.statusCode).toBe(500)
    expect(response.json()).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      data: null,
    })
    expect(capture.read()).toContain('FST_ERR_RESPONSE_SERIALIZATION')
  })

  it('whitelists useful error log fields without leaking nested secrets', async () => {
    const capture = createLogCapture()
    const app = createApp(capture.stream)
    app.get('/secret-context-error', async () => {
      const cause = Object.assign(new Error('nested cause marker'), {
        code: 'E_NESTED_CAUSE',
        context: { password: 'CAUSE_PASSWORD_SENTINEL' },
      })
      throw Object.assign(new Error('useful error marker', { cause }), {
        code: 'E_DEEP_CONTEXT',
        context: {
          password: 'PASSWORD_SENTINEL',
          nested: {
            token: 'TOKEN_SENTINEL',
            authorization: 'AUTHORIZATION_SENTINEL',
            cookie: 'COOKIE_SENTINEL',
            DATABASE_URL: 'DATABASE_URL_SENTINEL',
          },
        },
      })
    })

    const response = await app.inject({ method: 'GET', url: '/secret-context-error' })
    const logs = capture.read()

    expect(response.statusCode).toBe(500)
    expect(logs).toContain('"type":"Error"')
    expect(logs).toContain('"name":"Error"')
    expect(logs).toContain('useful error marker')
    expect(logs).toContain('"code":"E_DEEP_CONTEXT"')
    expect(logs).toContain('"stack":"Error: useful error marker')
    expect(logs).toContain('nested cause marker')
    expect(logs).not.toMatch(
      /PASSWORD_SENTINEL|CAUSE_PASSWORD_SENTINEL|TOKEN_SENTINEL|AUTHORIZATION_SENTINEL|COOKIE_SENTINEL|DATABASE_URL_SENTINEL/,
    )
  })

  it.each(['getPrototypeOf', 'constructor'] as const)(
    'keeps the 500 envelope stable when an error cause has a throwing %s trap',
    async (trap) => {
      const capture = createLogCapture()
      const app = createApp(capture.stream)
      app.get('/hostile-error-cause', async () => {
        const target = Object.assign(
          Object.create(trap === 'constructor' ? Error.prototype : Object.prototype),
          {
            name: 'HostileCause',
            message: 'hostile cause marker',
            stack: 'HostileCause: hostile cause marker',
            context: { password: 'HOSTILE_CONTEXT_SECRET' },
          },
        ) as object
        const hostileCause = new Proxy(target, {
          get(current, property, receiver) {
            if (trap === 'constructor' && property === 'constructor') {
              throw new Error('CONSTRUCTOR_TRAP_SECRET')
            }
            return Reflect.get(current, property, receiver)
          },
          getPrototypeOf(current) {
            if (trap === 'getPrototypeOf') {
              throw new Error('GET_PROTOTYPE_OF_TRAP_SECRET')
            }
            return Reflect.getPrototypeOf(current)
          },
        })

        throw new Error('outer hostile error marker', { cause: hostileCause })
      })

      const response = await app.inject({ method: 'GET', url: '/hostile-error-cause' })
      const logs = capture.read()

      expect(response.statusCode).toBe(500)
      expect(response.json()).toEqual({
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        data: null,
      })
      expect(response.body).not.toMatch(/HOSTILE_CONTEXT_SECRET|TRAP_SECRET/)
      expect(logs).toContain('outer hostile error marker')
      expect(logs).toContain('hostile cause marker')
      expect(logs).not.toMatch(
        /HOSTILE_CONTEXT_SECRET|CONSTRUCTOR_TRAP_SECRET|GET_PROTOTYPE_OF_TRAP_SECRET/,
      )
    },
  )

  it('maps strict Zod body validation failures to a public error', async () => {
    const app = createApp()
    registerStrictBodyRoute(app)

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
