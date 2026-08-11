import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { errorEnvelopeSchema, ok } from '../../common/http/envelope.js'
import { sessionSchema } from '../../contracts/student-contracts.js'
import { SessionService } from './session.service.js'
import { sessionSummarySchema } from './session-summary.js'

interface SessionRoutesOptions {
  studentId: string
}

const safePathIdSchema = z
  .string()
  .min(1)
  .refine((value) => value.trim().length > 0, { message: 'Must not be blank' })
  .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value), {
    message: 'Control characters are not allowed',
  })

const summaryParamsSchema = z.strictObject({
  sessionId: safePathIdSchema,
})

const createSessionEnvelopeSchema = z.strictObject({
  code: z.literal(0),
  message: z.literal('ok'),
  data: z.strictObject({
    sessionId: z.string().min(1),
  }),
})

const summaryEnvelopeSchema = z.strictObject({
  code: z.literal(0),
  message: z.literal('ok'),
  data: sessionSummarySchema,
})

export async function sessionRoutes(
  app: FastifyInstance,
  options: SessionRoutesOptions,
): Promise<void> {
  const routes = app.withTypeProvider<ZodTypeProvider>()
  const service = new SessionService(app.prisma, options.studentId)

  routes.post(
    '/api/sessions',
    {
      schema: {
        tags: ['sessions'],
        summary: 'Persist a complete exercise session for the configured student',
        body: sessionSchema,
        response: {
          200: createSessionEnvelopeSchema,
          400: errorEnvelopeSchema,
          404: errorEnvelopeSchema,
          409: errorEnvelopeSchema,
          413: errorEnvelopeSchema,
          415: errorEnvelopeSchema,
          500: errorEnvelopeSchema,
        },
      },
    },
    async (request) => ok(await service.create(request.body)),
  )

  routes.get(
    '/api/summary/:sessionId',
    {
      schema: {
        tags: ['sessions'],
        summary: 'Read a deterministic summary for one persisted session',
        params: summaryParamsSchema,
        response: {
          200: summaryEnvelopeSchema,
          400: errorEnvelopeSchema,
          404: errorEnvelopeSchema,
          500: errorEnvelopeSchema,
        },
      },
    },
    async (request) => ok(await service.getSummary(request.params.sessionId)),
  )
}
