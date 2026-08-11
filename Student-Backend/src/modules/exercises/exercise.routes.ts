import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { errorEnvelopeSchema, ok } from '../../common/http/envelope.js'
import { exerciseSetSchema } from '../../contracts/student-contracts.js'
import { ExerciseService } from './exercise.service.js'

interface ExerciseRoutesOptions {
  studentId: string
}

const safePathIdSchema = z
  .string()
  .min(1)
  .refine((value) => value.trim().length > 0, { message: 'Must not be blank' })
  .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value), {
    message: 'Control characters are not allowed',
  })

const taskParamsSchema = z.strictObject({
  taskId: safePathIdSchema,
})

const bankParamsSchema = z.strictObject({
  setId: safePathIdSchema,
})

const exerciseSetEnvelopeSchema = z.strictObject({
  code: z.literal(0),
  message: z.literal('ok'),
  data: exerciseSetSchema,
})

export async function exerciseRoutes(
  app: FastifyInstance,
  options: ExerciseRoutesOptions,
): Promise<void> {
  const routes = app.withTypeProvider<ZodTypeProvider>()
  const service = new ExerciseService(app.prisma, options.studentId)

  routes.get(
    '/api/exercise-sets/:taskId',
    {
      schema: {
        tags: ['exercises'],
        summary: 'Read the configured student task exercise set',
        params: taskParamsSchema,
        response: {
          200: exerciseSetEnvelopeSchema,
          400: errorEnvelopeSchema,
          404: errorEnvelopeSchema,
          500: errorEnvelopeSchema,
        },
      },
    },
    async (request) => ok(await service.getTaskSet(request.params.taskId)),
  )

  routes.get(
    '/api/bank/exercise/:setId',
    {
      schema: {
        tags: ['exercises'],
        summary: 'Read the configured student bank exercise set',
        params: bankParamsSchema,
        response: {
          200: exerciseSetEnvelopeSchema,
          400: errorEnvelopeSchema,
          404: errorEnvelopeSchema,
          500: errorEnvelopeSchema,
        },
      },
    },
    async (request) => ok(await service.getBankSet(request.params.setId)),
  )
}
