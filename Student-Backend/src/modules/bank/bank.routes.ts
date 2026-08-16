import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { errorEnvelopeSchema, ok } from '../../common/http/envelope.js'
import {
  BankService,
  bankQuestionSchema,
  bankRecommendationSchema,
  similarQuestionSchema,
} from './bank.service.js'

interface BankRoutesOptions {
  studentId: string
  agentUrl: string
}

const bankQuestionsEnvelopeSchema = z.strictObject({
  code: z.literal(0),
  message: z.literal('ok'),
  data: z.array(bankQuestionSchema),
})

const bankRecommendationsEnvelopeSchema = z.strictObject({
  code: z.literal(0),
  message: z.literal('ok'),
  data: z.array(bankRecommendationSchema),
})

const similarQuestionsEnvelopeSchema = z.strictObject({
  code: z.literal(0),
  message: z.literal('ok'),
  data: z.array(similarQuestionSchema),
})

const questionIdParamsSchema = z.strictObject({
  questionId: z.string().min(1),
})

export async function bankRoutes(
  app: FastifyInstance,
  options: BankRoutesOptions,
): Promise<void> {
  const routes = app.withTypeProvider<ZodTypeProvider>()
  const service = new BankService(app.prisma, options.studentId, options.agentUrl)

  routes.get(
    '/api/bank/questions',
    {
      schema: {
        tags: ['bank'],
        summary: 'List the configured student bank questions',
        response: {
          200: bankQuestionsEnvelopeSchema,
          500: errorEnvelopeSchema,
        },
      },
    },
    async () => ok(await service.listQuestions()),
  )

  routes.get(
    '/api/bank/recommendations',
    {
      schema: {
        tags: ['bank'],
        summary: 'Recommend bank questions from the student weak topics',
        response: {
          200: bankRecommendationsEnvelopeSchema,
          404: errorEnvelopeSchema,
          500: errorEnvelopeSchema,
        },
      },
    },
    async () => ok(await service.listRecommendations()),
  )

  routes.get(
    '/api/bank/similar/:questionId',
    {
      schema: {
        tags: ['bank'],
        summary: 'List similar bank questions from the knowledge graph',
        params: questionIdParamsSchema,
        response: {
          200: similarQuestionsEnvelopeSchema,
          404: errorEnvelopeSchema,
          500: errorEnvelopeSchema,
        },
      },
    },
    async (request) => ok(await service.listSimilarQuestions(request.params.questionId)),
  )
}
