import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { errorEnvelopeSchema, ok } from '../../common/http/envelope.js'
import {
  taskAdjustmentSchema,
  taskSchema,
} from '../../contracts/student-contracts.js'
import { TaskService } from './task.service.js'

interface TaskRoutesOptions {
  studentId: string
  now: () => Date
}

const taskParamsSchema = z.strictObject({
  id: z.string().min(1).refine((value) => value.trim().length > 0),
})

const completeTaskBodySchema = z.strictObject({
  status: z.literal('completed'),
})

const taskEnvelopeSchema = z.strictObject({
  code: z.literal(0),
  message: z.literal('ok'),
  data: z.strictObject({ task: taskSchema }),
})

const adjustmentEnvelopeSchema = z.strictObject({
  code: z.literal(0),
  message: z.literal('ok'),
  data: z.strictObject({
    request: taskAdjustmentSchema,
    task: taskSchema,
  }),
})

export async function taskRoutes(
  app: FastifyInstance,
  options: TaskRoutesOptions,
): Promise<void> {
  const routes = app.withTypeProvider<ZodTypeProvider>()
  const service = new TaskService(app.prisma, options.studentId, options.now)

  routes.post(
    '/api/tasks',
    {
      schema: {
        tags: ['tasks'],
        summary: 'Create a task for the configured student',
        body: taskSchema,
        response: {
          200: taskEnvelopeSchema,
          400: errorEnvelopeSchema,
          404: errorEnvelopeSchema,
          409: errorEnvelopeSchema,
          500: errorEnvelopeSchema,
        },
      },
    },
    async (request) => ok({ task: await service.create(request.body) }),
  )

  routes.patch(
    '/api/tasks/:id',
    {
      schema: {
        tags: ['tasks'],
        summary: 'Mark a task completed',
        params: taskParamsSchema,
        body: completeTaskBodySchema,
        response: {
          200: taskEnvelopeSchema,
          400: errorEnvelopeSchema,
          404: errorEnvelopeSchema,
          500: errorEnvelopeSchema,
        },
      },
    },
    async (request) => ok({ task: await service.complete(request.params.id) }),
  )

  routes.post(
    '/api/tasks/:id/adjustment-request',
    {
      schema: {
        tags: ['tasks'],
        summary: 'Submit a schedule adjustment for a teacher task',
        params: taskParamsSchema,
        body: taskAdjustmentSchema,
        response: {
          200: adjustmentEnvelopeSchema,
          400: errorEnvelopeSchema,
          404: errorEnvelopeSchema,
          409: errorEnvelopeSchema,
          500: errorEnvelopeSchema,
        },
      },
    },
    async (request) =>
      ok(await service.requestAdjustment(request.params.id, request.body)),
  )
}
