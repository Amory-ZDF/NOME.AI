/**
 * Dashboard module — GET /api/v1/teacher/dashboard
 *
 * Returns the teaching workspace overview: pending tasks, today's courses,
 * ungraded assignments, and student alerts.
 * Per api-contract.md §2.1
 */

import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { errorEnvelopeSchema, ok } from '../../common/http/envelope.js'
import { dashboardDataSchema } from '../../contracts/teacher-contracts.js'
import { teacherStore } from '../../data/teacher-store.js'

const dashboardEnvelopeSchema = z.strictObject({
  code: z.literal(0),
  message: z.literal('ok'),
  data: dashboardDataSchema,
})

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  const routes = app.withTypeProvider<ZodTypeProvider>()

  routes.get(
    '/api/v1/teacher/dashboard',
    {
      schema: {
        tags: ['Teacher'],
        summary: 'Get teaching workspace dashboard',
        response: {
          200: dashboardEnvelopeSchema,
          400: errorEnvelopeSchema,
          500: errorEnvelopeSchema,
        },
      },
    },
    async () => ok(teacherStore.getDashboard()),
  )
}
