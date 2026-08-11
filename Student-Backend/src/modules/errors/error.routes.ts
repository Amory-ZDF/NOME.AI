import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { errorEnvelopeSchema, ok } from '../../common/http/envelope.js'
import {
  errorIdSchema,
  errorItemSchema,
  redoAttemptSchema,
  variantVerificationSchema,
} from '../../contracts/student-contracts.js'
import { errorBatchBodySchema } from './error-cards.js'
import { ErrorService } from './error.service.js'

interface ErrorRoutesOptions {
  studentId: string
}

const errorParamsSchema = z.strictObject({
  id: errorIdSchema,
})

const batchEnvelopeSchema = z.strictObject({
  code: z.literal(0),
  message: z.literal('ok'),
  data: z.strictObject({
    errors: z.array(errorItemSchema),
  }),
})

const redoEnvelopeSchema = z.strictObject({
  code: z.literal(0),
  message: z.literal('ok'),
  data: z.strictObject({
    error: errorItemSchema,
  }),
})

const masteryBodySchema = z.strictObject({
  status: z.literal('mastered'),
})

export async function errorRoutes(
  app: FastifyInstance,
  options: ErrorRoutesOptions,
): Promise<void> {
  const routes = app.withTypeProvider<ZodTypeProvider>()
  const service = new ErrorService(app.prisma, options.studentId)

  routes.post(
    '/api/errors/batch',
    {
      schema: {
        tags: ['errors'],
        summary: 'Atomically merge supplied fresh error recurrence evidence',
        body: errorBatchBodySchema,
        response: {
          200: batchEnvelopeSchema,
          400: errorEnvelopeSchema,
          404: errorEnvelopeSchema,
          409: errorEnvelopeSchema,
          413: errorEnvelopeSchema,
          415: errorEnvelopeSchema,
          500: errorEnvelopeSchema,
        },
      },
    },
    async (request) => ok(await service.upsertBatch(request.body.items)),
  )

  routes.post(
    '/api/errors/:id/redo',
    {
      schema: {
        tags: ['errors'],
        summary: 'Append one deterministic redo result to a stored error',
        params: errorParamsSchema,
        body: redoAttemptSchema,
        response: {
          200: redoEnvelopeSchema,
          400: errorEnvelopeSchema,
          404: errorEnvelopeSchema,
          413: errorEnvelopeSchema,
          415: errorEnvelopeSchema,
          500: errorEnvelopeSchema,
        },
      },
    },
    async (request) => ok(await service.addRedo(request.params.id, request.body)),
  )

  routes.post(
    '/api/errors/:id/verification',
    {
      schema: {
        tags: ['errors'],
        summary: 'Record an independently persisted variant verification',
        params: errorParamsSchema,
        body: variantVerificationSchema,
        response: {
          200: redoEnvelopeSchema,
          400: errorEnvelopeSchema,
          404: errorEnvelopeSchema,
          413: errorEnvelopeSchema,
          415: errorEnvelopeSchema,
          500: errorEnvelopeSchema,
        },
      },
    },
    async (request) => ok(await service.recordVerification(request.params.id, request.body)),
  )

  routes.patch(
    '/api/errors/:id',
    {
      schema: {
        tags: ['errors'],
        summary: 'Mark an error mastered after its independent verification',
        params: errorParamsSchema,
        body: masteryBodySchema,
        response: {
          200: redoEnvelopeSchema,
          400: errorEnvelopeSchema,
          404: errorEnvelopeSchema,
          409: errorEnvelopeSchema,
          413: errorEnvelopeSchema,
          415: errorEnvelopeSchema,
          500: errorEnvelopeSchema,
        },
      },
    },
    async (request) => ok(await service.markMastered(request.params.id)),
  )
}
