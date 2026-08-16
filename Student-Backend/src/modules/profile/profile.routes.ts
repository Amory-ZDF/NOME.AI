import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { errorEnvelopeSchema, ok } from '../../common/http/envelope.js'
import { ProfileService, profileSchema } from './profile.service.js'

interface ProfileRoutesOptions {
  studentId: string
}

const profileEnvelopeSchema = z.strictObject({
  code: z.literal(0),
  message: z.literal('ok'),
  data: profileSchema,
})

export async function profileRoutes(
  app: FastifyInstance,
  options: ProfileRoutesOptions,
): Promise<void> {
  const routes = app.withTypeProvider<ZodTypeProvider>()
  const service = new ProfileService(app.prisma, options.studentId)

  routes.get(
    '/api/student/profile',
    {
      schema: {
        tags: ['profile'],
        summary: 'Read the computed student profile overview and insights',
        response: {
          200: profileEnvelopeSchema,
          404: errorEnvelopeSchema,
          500: errorEnvelopeSchema,
        },
      },
    },
    async () => ok(await service.getProfile()),
  )
}
