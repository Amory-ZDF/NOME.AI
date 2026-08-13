import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { AppError } from '../../common/errors/app-error.js'
import { errorEnvelopeSchema, ok } from '../../common/http/envelope.js'
import {
  errorIdSchema,
  errorItemSchema,
  exerciseSetSchema,
  taskSchema,
} from '../../contracts/student-contracts.js'
import { ErrorVariantService } from './error-variant.service.js'

interface ErrorVariantRoutesOptions {
  studentId: string
  databaseUrl: string
  now: () => Date
}

const paramsSchema = z.strictObject({ id: errorIdSchema })
const successSchema = z.strictObject({
  code: z.literal(0),
  message: z.literal('ok'),
  data: z.strictObject({
    exerciseSet: exerciseSetSchema,
    task: taskSchema,
    error: errorItemSchema,
  }),
})
const responses = {
  200: successSchema,
  400: errorEnvelopeSchema,
  404: errorEnvelopeSchema,
  409: errorEnvelopeSchema,
  413: errorEnvelopeSchema,
  415: errorEnvelopeSchema,
  500: errorEnvelopeSchema,
  502: errorEnvelopeSchema,
  503: errorEnvelopeSchema,
}

export async function errorVariantRoutes(
  app: FastifyInstance,
  options: ErrorVariantRoutesOptions,
): Promise<void> {
  const routes = app.withTypeProvider<ZodTypeProvider>()
  const service = new ErrorVariantService(
    app.prisma,
    options.studentId,
    options.now,
    app.studentAgent,
    options.databaseUrl,
  )
  const bypassAutomaticValidation = () => (value: unknown) => ({ value })

  routes.post('/api/errors/:id/variant', {
    validatorCompiler: bypassAutomaticValidation,
    schema: {
      tags: ['variants'],
      summary: 'Create and link an independent error verification variant',
      params: paramsSchema,
      response: responses,
    },
    preValidation: async (request) => {
      if (request.body !== undefined) throw new AppError('Invalid request', 400, 'INVALID_INPUT')
    },
  }, async (request) => {
    const params = paramsSchema.safeParse(request.params as unknown)
    if (!params.success) throw new AppError('Invalid request', 400, 'INVALID_INPUT')
    return ok(await service.create(params.data.id))
  })
}
