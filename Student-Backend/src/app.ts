import cors from '@fastify/cors'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import Fastify, { type FastifyInstance } from 'fastify'
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod'
import { z } from 'zod'

import { installErrorHandlers } from './common/http/error-handler.js'
import { ok } from './common/http/envelope.js'
import type { Env } from './config/env.js'

interface BuildAppOptions {
  env: Env
}

const healthEnvelopeSchema = z.object({
  code: z.literal(0),
  message: z.literal('ok'),
  data: z.object({
    status: z.literal('ok'),
  }),
})

export function buildApp({ env }: BuildAppOptions): FastifyInstance {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'request.headers.authorization',
          'request.headers.cookie',
          'headers.authorization',
          'headers.cookie',
          'cookies',
          '*.cookies',
          'DATABASE_URL',
          '*.DATABASE_URL',
          'databaseUrl',
          '*.databaseUrl',
          'database_url',
          '*.database_url',
          'password',
          '*.password',
          'secret',
          '*.secret',
          'token',
          '*.token',
        ],
        censor: '[REDACTED]',
      },
    },
  })

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  app.register(cors, {
    origin: env.CORS_ORIGINS,
  })
  app.register(swagger, {
    openapi: {
      info: {
        title: 'NOME.AI Student API',
        version: '1.0.0',
      },
    },
    transform: jsonSchemaTransform,
  })
  app.register(swaggerUi, {
    routePrefix: '/documentation',
    staticCSP: true,
  })

  installErrorHandlers(app)

  app.register(async (routes) => {
    routes.get(
      '/health',
      {
        schema: {
          response: {
            200: healthEnvelopeSchema,
          },
        },
      },
      async () => ok({ status: 'ok' as const }),
    )
  })

  return app
}
