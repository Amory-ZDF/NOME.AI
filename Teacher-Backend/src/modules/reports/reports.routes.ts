/**
 * Reports module — per api-contract.md §2.5
 *
 *   GET /api/v1/teacher/reports/overview
 *   GET /api/v1/teacher/reports/score-trend
 *   GET /api/v1/teacher/reports/error-distribution
 *   GET /api/v1/teacher/reports/students
 */

import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { errorEnvelopeSchema, ok } from '../../common/http/envelope.js'
import {
  errorDistributionOverTimeSchema,
  reportOverviewSchema,
  reportStudentSchema,
  scoreTrendSchema,
} from '../../contracts/teacher-contracts.js'
import { teacherStore } from '../../data/teacher-store.js'

const periodEnum = z.enum(['week', 'month', 'semester'])

export async function reportsRoutes(app: FastifyInstance): Promise<void> {
  const routes = app.withTypeProvider<ZodTypeProvider>()

  // GET /reports/overview
  routes.get(
    '/api/v1/teacher/reports/overview',
    {
      schema: {
        tags: ['Teacher'],
        summary: 'Get class overview report',
        querystring: z.strictObject({ period: periodEnum.optional() }),
        response: {
          200: z.strictObject({ code: z.literal(0), message: z.literal('ok'), data: reportOverviewSchema }),
          500: errorEnvelopeSchema,
        },
      },
    },
    async () => ok(teacherStore.getReportOverview()),
  )

  // GET /reports/score-trend
  routes.get(
    '/api/v1/teacher/reports/score-trend',
    {
      schema: {
        tags: ['Teacher'],
        summary: 'Get score trend data',
        querystring: z.strictObject({ period: periodEnum.optional() }),
        response: {
          200: z.strictObject({ code: z.literal(0), message: z.literal('ok'), data: scoreTrendSchema }),
          500: errorEnvelopeSchema,
        },
      },
    },
    async () => ok(teacherStore.getScoreTrend()),
  )

  // GET /reports/error-distribution
  routes.get(
    '/api/v1/teacher/reports/error-distribution',
    {
      schema: {
        tags: ['Teacher'],
        summary: 'Get error distribution over time',
        querystring: z.strictObject({ period: periodEnum.optional() }),
        response: {
          200: z.strictObject({ code: z.literal(0), message: z.literal('ok'), data: errorDistributionOverTimeSchema }),
          500: errorEnvelopeSchema,
        },
      },
    },
    async () => ok(teacherStore.getErrorDistribution()),
  )

  // GET /reports/students
  routes.get(
    '/api/v1/teacher/reports/students',
    {
      schema: {
        tags: ['Teacher'],
        summary: 'Get attention / improved student rankings',
        querystring: z.strictObject({ type: z.enum(['improved', 'attention']).optional() }),
        response: {
          200: z.strictObject({ code: z.literal(0), message: z.literal('ok'), data: z.array(reportStudentSchema) }),
          500: errorEnvelopeSchema,
        },
      },
    },
    async (request) => ok(teacherStore.getAttentionStudents(request.query.type)),
  )
}
