/**
 * Courses module — GET /api/v1/teacher/courses?start=&end=
 *
 * Returns the weekly course calendar.
 * Per api-contract.md §2.2
 */

import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { errorEnvelopeSchema, ok } from '../../common/http/envelope.js'
import { courseListEnvelopeSchema } from '../../contracts/teacher-contracts.js'
import { teacherStore } from '../../data/teacher-store.js'

const coursesEnvelopeSchema = z.strictObject({
  code: z.literal(0),
  message: z.literal('ok'),
  data: courseListEnvelopeSchema,
})

export async function coursesRoutes(app: FastifyInstance): Promise<void> {
  const routes = app.withTypeProvider<ZodTypeProvider>()

  routes.get(
    '/api/v1/teacher/courses',
    {
      schema: {
        tags: ['Teacher'],
        summary: 'Get calendar courses for a date range',
        querystring: z.strictObject({
          start: z.string().optional(),
          end: z.string().optional(),
        }),
        response: {
          200: coursesEnvelopeSchema,
          400: errorEnvelopeSchema,
          500: errorEnvelopeSchema,
        },
      },
    },
    async () => ok(teacherStore.getCourses()),
  )
}
