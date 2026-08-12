/**
 * Students module — per api-contract.md §2.4
 *
 *   GET  /api/v1/teacher/students
 *   GET  /api/v1/teacher/students/:id
 *   GET  /api/v1/teacher/students/:id/knowledge-graph
 *   GET  /api/v1/teacher/students/:id/tags
 *   PUT  /api/v1/teacher/students/:id/tags/:tagId
 *   GET  /api/v1/teacher/students/:id/feedback
 *   GET  /api/v1/teacher/students/:id/suggestions
 *   POST /api/v1/teacher/students/:id/suggestions/:suggestionId/respond
 *   GET  /api/v1/teacher/students/:id/execution
 *   GET  /api/v1/teacher/students/:id/recent-work
 */

import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { errorEnvelopeSchema, ok } from '../../common/http/envelope.js'
import {
  executionSchema,
  feedbackSchema,
  knowledgeGraphItemSchema,
  recentWorkItemSchema,
  studentCardSchema,
  studentDetailSchema,
  studentTagSchema,
  suggestionRespondSchema,
  suggestionSchema,
  tagRespondSchema,
} from '../../contracts/teacher-contracts.js'
import { teacherStore } from '../../data/teacher-store.js'

export async function studentsRoutes(app: FastifyInstance): Promise<void> {
  const routes = app.withTypeProvider<ZodTypeProvider>()

  // GET /students
  routes.get(
    '/api/v1/teacher/students',
    {
      schema: {
        tags: ['Teacher'],
        summary: 'List students',
        querystring: z.strictObject({
          search: z.string().optional(),
          classId: z.string().optional(),
          risk: z.string().optional(),
          sort: z.string().optional(),
          page: z.string().optional(),
        }),
        response: {
          200: z.strictObject({ code: z.literal(0), message: z.literal('ok'), data: z.array(studentCardSchema) }),
          400: errorEnvelopeSchema,
          500: errorEnvelopeSchema,
        },
      },
    },
    async (request) => ok(teacherStore.getStudents(request.query.search, request.query.classId, request.query.risk)),
  )

  // GET /students/:id
  routes.get(
    '/api/v1/teacher/students/:id',
    {
      schema: {
        tags: ['Teacher'],
        summary: 'Get student profile detail',
        params: z.strictObject({ id: z.string().min(1) }),
        response: {
          200: z.strictObject({ code: z.literal(0), message: z.literal('ok'), data: studentDetailSchema }),
          404: errorEnvelopeSchema,
          500: errorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      const detail = teacherStore.getStudentDetail(request.params.id)
      if (!detail) return reply.status(404).send({ code: 'NOT_FOUND', message: 'Student not found', data: null })
      return ok(detail)
    },
  )

  // GET /students/:id/knowledge-graph
  routes.get(
    '/api/v1/teacher/students/:id/knowledge-graph',
    {
      schema: {
        tags: ['Teacher'],
        summary: 'Get student knowledge graph',
        params: z.strictObject({ id: z.string().min(1) }),
        querystring: z.strictObject({ subject: z.string().optional() }),
        response: {
          200: z.strictObject({ code: z.literal(0), message: z.literal('ok'), data: z.array(knowledgeGraphItemSchema) }),
          500: errorEnvelopeSchema,
        },
      },
    },
    async (request) => ok(teacherStore.getKnowledgeGraph(request.params.id, request.query.subject)),
  )

  // GET /students/:id/tags
  routes.get(
    '/api/v1/teacher/students/:id/tags',
    {
      schema: {
        tags: ['Teacher'],
        summary: 'Get student dynamic tags',
        params: z.strictObject({ id: z.string().min(1) }),
        response: {
          200: z.strictObject({ code: z.literal(0), message: z.literal('ok'), data: z.array(studentTagSchema) }),
          500: errorEnvelopeSchema,
        },
      },
    },
    async (request) => ok(teacherStore.getStudentTags(request.params.id)),
  )

  // PUT /students/:id/tags/:tagId
  routes.put(
    '/api/v1/teacher/students/:id/tags/:tagId',
    {
      schema: {
        tags: ['Teacher'],
        summary: 'Confirm / reject / modify a student tag',
        params: z.strictObject({ id: z.string().min(1), tagId: z.string().min(1) }),
        body: tagRespondSchema,
        response: {
          200: z.strictObject({ code: z.literal(0), message: z.literal('ok'), data: studentTagSchema.optional() }),
          500: errorEnvelopeSchema,
        },
      },
    },
    async () => ok(undefined),
  )

  // GET /students/:id/feedback
  routes.get(
    '/api/v1/teacher/students/:id/feedback',
    {
      schema: {
        tags: ['Teacher'],
        summary: 'Get student learning feedback',
        params: z.strictObject({ id: z.string().min(1) }),
        querystring: z.strictObject({ period: z.enum(['3d', '7d', '30d']).optional() }),
        response: {
          200: z.strictObject({ code: z.literal(0), message: z.literal('ok'), data: feedbackSchema }),
          500: errorEnvelopeSchema,
        },
      },
    },
    async (request) => ok(teacherStore.getStudentFeedback(request.params.id, request.query.period)),
  )

  // GET /students/:id/suggestions
  routes.get(
    '/api/v1/teacher/students/:id/suggestions',
    {
      schema: {
        tags: ['Teacher'],
        summary: 'Get AI teaching suggestions for a student',
        params: z.strictObject({ id: z.string().min(1) }),
        response: {
          200: z.strictObject({ code: z.literal(0), message: z.literal('ok'), data: z.array(suggestionSchema) }),
          500: errorEnvelopeSchema,
        },
      },
    },
    async (request) => ok(teacherStore.getStudentSuggestions(request.params.id)),
  )

  // POST /students/:id/suggestions/:suggestionId/respond
  routes.post(
    '/api/v1/teacher/students/:id/suggestions/:suggestionId/respond',
    {
      schema: {
        tags: ['Teacher'],
        summary: 'Adopt or ignore an AI suggestion',
        params: z.strictObject({ id: z.string().min(1), suggestionId: z.string().min(1) }),
        body: suggestionRespondSchema,
        response: {
          200: z.strictObject({ code: z.literal(0), message: z.literal('ok'), data: z.null() }),
          500: errorEnvelopeSchema,
        },
      },
    },
    async () => ok(null),
  )

  // GET /students/:id/execution
  routes.get(
    '/api/v1/teacher/students/:id/execution',
    {
      schema: {
        tags: ['Teacher'],
        summary: 'Get student execution record',
        params: z.strictObject({ id: z.string().min(1) }),
        response: {
          200: z.strictObject({ code: z.literal(0), message: z.literal('ok'), data: executionSchema }),
          500: errorEnvelopeSchema,
        },
      },
    },
    async (request) => ok(teacherStore.getStudentExecution(request.params.id)),
  )

  // GET /students/:id/recent-work
  routes.get(
    '/api/v1/teacher/students/:id/recent-work',
    {
      schema: {
        tags: ['Teacher'],
        summary: 'Get student recent work',
        params: z.strictObject({ id: z.string().min(1) }),
        response: {
          200: z.strictObject({ code: z.literal(0), message: z.literal('ok'), data: z.array(recentWorkItemSchema) }),
          500: errorEnvelopeSchema,
        },
      },
    },
    async (request) => ok(teacherStore.getStudentRecentWork(request.params.id)),
  )
}
