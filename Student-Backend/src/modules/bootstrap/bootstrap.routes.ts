import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { errorEnvelopeSchema, ok } from '../../common/http/envelope.js'
import { trustedBootstrapDataSchema } from '../../contracts/student-contracts.js'
import { BootstrapService } from './bootstrap.service.js'

interface BootstrapRoutesOptions {
  studentId: string
}

const bootstrapEnvelopeSchema = z.strictObject({
  code: z.literal(0),
  message: z.literal('ok'),
  data: trustedBootstrapDataSchema,
})

export async function bootstrapRoutes(
  app: FastifyInstance,
  options: BootstrapRoutesOptions,
): Promise<void> {
  const routes = app.withTypeProvider<ZodTypeProvider>()
  const service = new BootstrapService(app.prisma, options.studentId)

  routes.get(
    '/api/student/bootstrap',
    {
      schema: {
        tags: ['student'],
        summary: 'Load the complete configured student state',
        response: {
          200: bootstrapEnvelopeSchema,
          404: errorEnvelopeSchema,
          500: errorEnvelopeSchema,
        },
      },
    },
    async () => ok(await service.getBootstrap()),
  )
}
