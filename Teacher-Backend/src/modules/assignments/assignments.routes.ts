/**
 * Assignments module — per api-contract.md §2.3
 *
 *   GET    /api/v1/teacher/assignments
 *   POST   /api/v1/teacher/assignments
 *   GET    /api/v1/teacher/assignments/:id/submissions
 *   PUT    /api/v1/teacher/submissions/:submissionId/grade
 */

import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { errorEnvelopeSchema, ok } from '../../common/http/envelope.js'
import {
  assignmentItemSchema,
  createAssignmentSchema,
  gradeSubmissionSchema,
  submissionSchema,
} from '../../contracts/teacher-contracts.js'
import { teacherStore } from '../../data/teacher-store.js'

export async function assignmentsRoutes(app: FastifyInstance): Promise<void> {
  const routes = app.withTypeProvider<ZodTypeProvider>()

  // GET /assignments
  routes.get(
    '/api/v1/teacher/assignments',
    {
      schema: {
        tags: ['Teacher'],
        summary: 'List assignments',
        querystring: z.strictObject({
          status: z.string().optional(),
          page: z.string().optional(),
        }),
        response: {
          200: z.strictObject({ code: z.literal(0), message: z.literal('ok'), data: z.array(assignmentItemSchema) }),
          400: errorEnvelopeSchema,
          500: errorEnvelopeSchema,
        },
      },
    },
    async () => ok(teacherStore.getAssignments()),
  )

  // POST /assignments
  routes.post(
    '/api/v1/teacher/assignments',
    {
      schema: {
        tags: ['Teacher'],
        summary: 'Create a new assignment',
        body: createAssignmentSchema,
        response: {
          200: z.strictObject({ code: z.literal(0), message: z.literal('ok'), data: assignmentItemSchema.optional() }),
          400: errorEnvelopeSchema,
          500: errorEnvelopeSchema,
        },
      },
    },
    async () => ok(undefined),
  )

  // GET /assignments/:id/submissions
  routes.get(
    '/api/v1/teacher/assignments/:id/submissions',
    {
      schema: {
        tags: ['Teacher'],
        summary: 'List submissions for an assignment',
        params: z.strictObject({ id: z.string().min(1) }),
        response: {
          200: z.strictObject({ code: z.literal(0), message: z.literal('ok'), data: z.array(submissionSchema) }),
          404: errorEnvelopeSchema,
          500: errorEnvelopeSchema,
        },
      },
    },
    async (request) => ok(teacherStore.getSubmissions(request.params.id)),
  )

  // PUT /submissions/:submissionId/grade
  routes.put(
    '/api/v1/teacher/submissions/:submissionId/grade',
    {
      schema: {
        tags: ['Teacher'],
        summary: 'Grade a submission',
        params: z.strictObject({ submissionId: z.string().min(1) }),
        body: gradeSubmissionSchema,
        response: {
          200: z.strictObject({ code: z.literal(0), message: z.literal('ok'), data: submissionSchema }),
          400: errorEnvelopeSchema,
          404: errorEnvelopeSchema,
          500: errorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      const result = teacherStore.gradeSubmission(
        request.params.submissionId,
        request.body.score,
        request.body.comment,
      )
      if (!result) return reply.status(404).send({ code: 'NOT_FOUND', message: 'Submission not found', data: null })
      return ok(result)
    },
  )
}
