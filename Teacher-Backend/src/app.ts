import cors from '@fastify/cors'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import Fastify from 'fastify'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  jsonSchemaTransform,
  serializerCompiler,
  type ZodTypeProvider,
  validatorCompiler,
} from 'fastify-type-provider-zod'
import { z } from 'zod'

import { installErrorHandlers } from './common/http/error-handler.js'
import { fail, ok } from './common/http/envelope.js'
import { serializeError } from './common/logging/error-serializer.js'
import type { Env } from './config/env.js'
import type { InsightsRepo } from './data/insights-repo.js'
import { dashboardRoutes } from './modules/dashboard/dashboard.routes.js'
import { coursesRoutes } from './modules/courses/courses.routes.js'
import { studentsRoutes } from './modules/students/students.routes.js'
import { assignmentsRoutes } from './modules/assignments/assignments.routes.js'
import { reportsRoutes } from './modules/reports/reports.routes.js'
import { insightsRoutes } from './modules/insights/insights.routes.js'

interface BuildAppOptions {
  env: Env
  insightsRepo?: InsightsRepo
  loggerStream?: { write(message: string): void }
  now?: () => Date
  createId?: () => string
}

const corsMethods = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']

const healthEnvelopeSchema = z.object({
  code: z.literal(0),
  message: z.literal('ok'),
  data: z.object({
    status: z.literal('ok'),
  }),
})

export function buildApp({ env, insightsRepo, loggerStream, now = () => new Date(), createId = () => crypto.randomUUID() }: BuildAppOptions) {
  let logRawRouterRejection = () => undefined
  const invalidRequestBody = JSON.stringify(fail('INVALID_INPUT', 'Invalid request'))
  const rejectRawRouterRequest = (
    _path: string,
    request: IncomingMessage,
    response: ServerResponse,
  ) => {
    try {
      logRawRouterRejection()
    } catch {
      // A logging transport failure must not prevent the safe rejection.
    }

    if (response.destroyed || response.writableEnded || response.headersSent) return

    const origin = request.headers.origin
    const headers: Record<string, string | number> = {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(invalidRequestBody),
      Vary: 'Origin',
    }
    if (origin !== undefined && env.CORS_ORIGINS.includes(origin)) {
      headers['Access-Control-Allow-Origin'] = origin
    }

    try {
      response.writeHead(400, headers)
      response.end(invalidRequestBody)
    } catch {
      if (!response.destroyed) response.destroy()
    }
  }

  const app = Fastify({
    routerOptions: {
      onBadUrl: rejectRawRouterRequest,
      onMaxParamLength: rejectRawRouterRequest,
    },
    logger: {
      level: env.LOG_LEVEL,
      serializers: {
        err: serializeError,
      },
      ...(loggerStream === undefined ? {} : { stream: loggerStream }),
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
  }).withTypeProvider<ZodTypeProvider>()

  logRawRouterRejection = () => {
    app.log.warn(
      {
        event: 'raw_router_rejection',
        reason: 'invalid_request_target',
      },
      'Raw router request rejected',
    )
  }

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  app.register(cors, {
    origin: env.CORS_ORIGINS,
    methods: corsMethods,
  })
  app.register(swagger, {
    openapi: {
      info: {
        title: 'NOME.AI Teacher API',
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

  // Health
  app.register(async (routes) => {
    const typedRoutes = routes.withTypeProvider<ZodTypeProvider>()
    typedRoutes.get(
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

  // Teacher domain routes
  app.register(dashboardRoutes)
  app.register(coursesRoutes)
  app.register(studentsRoutes)
  app.register(assignmentsRoutes)
  app.register(reportsRoutes)
  if (insightsRepo?.enabled) {
    app.register(insightsRoutes, insightsRepo)
    app.addHook('onClose', async () => {
      await insightsRepo.close()
    })
  }

  return app
}
