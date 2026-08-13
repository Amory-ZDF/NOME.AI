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
import type { StudentPrisma } from './db/client.js'
import { createHttpStudentAgentClient } from './integrations/student-agent/http-student-agent.client.js'
import type { StudentAgentClient } from './integrations/student-agent/student-agent.client.js'
import { AgentDomainError } from './integrations/student-agent/student-agent.errors.js'
import { bootstrapRoutes } from './modules/bootstrap/bootstrap.routes.js'
import { exerciseRoutes } from './modules/exercises/exercise.routes.js'
import { errorRoutes } from './modules/errors/error.routes.js'
import { noteRoutes } from './modules/notes/note.routes.js'
import { materialRoutes } from './modules/materials/material.routes.js'
import { sessionRoutes } from './modules/sessions/session.routes.js'
import { settingsRoutes } from './modules/settings/settings.routes.js'
import { taskRoutes } from './modules/tasks/task.routes.js'
import { errorVariantRoutes } from './modules/variants/error-variant.routes.js'
import { questionVariantRoutes } from './modules/variants/question-variant.routes.js'

interface BuildAppOptions {
  env: Env
  loggerStream?: { write(message: string): void }
  prisma: StudentPrisma
  now?: () => Date
  createId?: () => string
  studentAgentClient?: StudentAgentClient
}

const corsMethods = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']

const healthEnvelopeSchema = z.object({
  code: z.literal(0),
  message: z.literal('ok'),
  data: z.object({
    status: z.literal('ok'),
  }),
})

export function buildApp({ env, loggerStream, prisma, now = () => new Date(), createId = () => crypto.randomUUID(), studentAgentClient }: BuildAppOptions) {
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

  app.decorate('prisma', prisma)
  const httpStudentAgent = createHttpStudentAgentClient({
      baseUrl: env.AGENT_BASE_URL,
      timeoutMs: env.AGENT_TIMEOUT_MS,
    })
  app.decorate('studentAgent', studentAgentClient ?? {
    async classifyMaterial() {
      // The teammate Agent has not published an ingestion/reference contract yet.
      // Do not fabricate classifications from browser-supplied metadata alone.
      throw new AgentDomainError('CONTENT_UNAVAILABLE')
    },
    generateQuestionVariant: httpStudentAgent.generateQuestionVariant,
    generateErrorVariant: httpStudentAgent.generateErrorVariant,
  })

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  app.register(cors, {
    origin: env.CORS_ORIGINS,
    methods: corsMethods,
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

  app.register(bootstrapRoutes, { studentId: env.STUDENT_ID })
  app.register(exerciseRoutes, { studentId: env.STUDENT_ID })
  app.register(errorRoutes, { studentId: env.STUDENT_ID })
  app.register(noteRoutes, { studentId: env.STUDENT_ID })
  app.register(materialRoutes, { studentId: env.STUDENT_ID, databaseUrl: env.DATABASE_URL, now, createId })
  app.register(sessionRoutes, { studentId: env.STUDENT_ID })
  app.register(settingsRoutes, { studentId: env.STUDENT_ID })
  app.register(taskRoutes, { studentId: env.STUDENT_ID, now })
  app.register(questionVariantRoutes, { studentId: env.STUDENT_ID, databaseUrl: env.DATABASE_URL, now })
  app.register(errorVariantRoutes, { studentId: env.STUDENT_ID, databaseUrl: env.DATABASE_URL, now })

  return app
}
