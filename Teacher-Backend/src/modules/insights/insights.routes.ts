/**
 * Insights module — real student data from the long-term-memory Agent.
 *
 *   GET /api/v1/teacher/insights/students
 *   GET /api/v1/teacher/insights/students/:id
 *   GET /api/v1/teacher/insights/tags
 *   GET /api/v1/teacher/insights/reports
 *
 * This is the pain-point demo: the teacher answers "最近发生了什么 /
 * 下节课重点 / 谁需要人工介入" from data the agent organized into the DB,
 * with every tag carrying evidence + confidence (better than a raw score).
 */

import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { errorEnvelopeSchema, ok } from '../../common/http/envelope.js'
import type { InsightsRepo } from '../../data/insights-repo.js'

const insightStudentSchema = z.object({
  id: z.string(),
  name: z.string(),
  accuracy: z.number().nullable(),
  totalAnswered: z.number(),
  pressureIndex: z.number().nullable(),
  activeDays: z.number(),
  recentNarrative: z.string().nullable(),
  nextFocus: z.string().nullable(),
  intervention: z.string().nullable(),
})

const insightTagSchema = z.object({
  id: z.string(),
  studentId: z.string(),
  label: z.string(),
  category: z.string(),
  confidence: z.number(),
  evidence: z.string(),
  status: z.string(),
  updatedAt: z.string(),
})

const insightReportSchema = z.object({
  id: z.string(),
  studentId: z.string(),
  period: z.string(),
  summary: z.string(),
  createdAt: z.string(),
})

export async function insightsRoutes(
  app: FastifyInstance,
  repo: InsightsRepo,
): Promise<void> {
  const routes = app.withTypeProvider<ZodTypeProvider>()

  routes.get(
    '/api/v1/teacher/insights/students',
    {
      schema: {
        tags: ['Teacher'],
        summary: 'List students from the long-term-memory agent',
        response: {
          200: z.strictObject({ code: z.literal(0), message: z.literal('ok'), data: z.array(insightStudentSchema) }),
          500: errorEnvelopeSchema,
        },
      },
    },
    async () => ok(await repo.listStudents()),
  )

  routes.get(
    '/api/v1/teacher/insights/students/:id',
    {
      schema: {
        tags: ['Teacher'],
        summary: 'Get one student profile from the agent',
        params: z.strictObject({ id: z.string().min(1) }),
        response: {
          200: z.strictObject({ code: z.literal(0), message: z.literal('ok'), data: insightStudentSchema }),
          404: errorEnvelopeSchema,
          500: errorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      const student = await repo.getStudent(request.params.id)
      if (!student) {
        return reply.status(404).send({ code: 'NOT_FOUND', message: 'Student not found', data: null })
      }
      return ok(student)
    },
  )

  routes.get(
    '/api/v1/teacher/insights/tags',
    {
      schema: {
        tags: ['Teacher'],
        summary: 'List dynamic student tags (evidence + confidence)',
        querystring: z.strictObject({ studentId: z.string().optional() }),
        response: {
          200: z.strictObject({ code: z.literal(0), message: z.literal('ok'), data: z.array(insightTagSchema) }),
          500: errorEnvelopeSchema,
        },
      },
    },
    async (request) => ok(await repo.listTags(request.query.studentId)),
  )

  routes.get(
    '/api/v1/teacher/insights/reports',
    {
      schema: {
        tags: ['Teacher'],
        summary: 'List periodic teacher reports (weekly/monthly)',
        querystring: z.strictObject({ studentId: z.string().optional(), period: z.string().optional() }),
        response: {
          200: z.strictObject({ code: z.literal(0), message: z.literal('ok'), data: z.array(insightReportSchema) }),
          500: errorEnvelopeSchema,
        },
      },
    },
    async (request) => ok(await repo.listReports(request.query.studentId, request.query.period)),
  )
}
