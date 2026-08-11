import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { AppError } from '../../common/errors/app-error.js'
import { errorEnvelopeSchema, ok } from '../../common/http/envelope.js'
import { materialTypeSchema, materialUploadJobSchema, sessionIdSchema } from '../../contracts/student-contracts.js'
import { ALLOWED_MIME_TYPES, MAX_FILE_BYTES } from './material-rules.js'
import { MaterialService } from './material.service.js'

interface MaterialRoutesOptions {
  studentId: string
  now: () => Date
  createId: () => string
}

const uploadBodySchema = z.strictObject({
  id: sessionIdSchema.optional(),
  fileName: z.string().min(1),
  mimeType: z.enum(ALLOWED_MIME_TYPES),
  size: z.number().nonnegative().max(MAX_FILE_BYTES),
  materialType: materialTypeSchema,
  examBoard: z.string().min(1).optional(),
  subject: z.string().min(1).optional(),
  chapter: z.string().min(1).optional(),
  createdAt: z.string().min(1).optional(),
})
const materialParamsSchema = z.strictObject({ id: sessionIdSchema })
const materialEnvelopeSchema = z.strictObject({
  code: z.literal(0), message: z.literal('ok'), data: z.strictObject({ job: materialUploadJobSchema }),
})
const responseSchemas = {
  200: materialEnvelopeSchema, 400: errorEnvelopeSchema, 404: errorEnvelopeSchema, 409: errorEnvelopeSchema,
  413: errorEnvelopeSchema, 415: errorEnvelopeSchema, 500: errorEnvelopeSchema,
}

export async function materialRoutes(app: FastifyInstance, options: MaterialRoutesOptions): Promise<void> {
  const routes = app.withTypeProvider<ZodTypeProvider>()
  const service = new MaterialService(app.prisma, options.studentId, options.now, options.createId)
  // Validation is intentionally service-owned so documented upload domain codes
  // are retained while Swagger still publishes the exact JSON shape.
  const bypassAutomaticValidation = () => (value: unknown) => ({ value })

  routes.post('/api/material-uploads', {
    validatorCompiler: bypassAutomaticValidation,
    schema: { tags: ['materials'], summary: 'Create a queued material metadata job', body: uploadBodySchema, response: responseSchemas },
  }, async (request) => ok({ job: await service.create(request.body) }))

  routes.post('/api/material-uploads/:id/cancel', {
    validatorCompiler: bypassAutomaticValidation,
    schema: { tags: ['materials'], summary: 'Cancel a material job before completion', params: materialParamsSchema, response: responseSchemas },
  }, async (request) => {
    const params = request.params as unknown
    const parsed = materialParamsSchema.safeParse(params)
    if (!parsed.success) {
      throw new AppError('Invalid request', 400, 'INVALID_INPUT')
    }
    return ok({ job: await service.cancel(parsed.data.id) })
  })
}
