import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { ok } from '../../common/http/envelope.js'
import {
  settingsPatchSchema,
  settingsSchema,
} from '../../contracts/student-contracts.js'
import { SettingsService } from './settings.service.js'

interface SettingsRoutesOptions {
  studentId: string
}

const settingsEnvelopeSchema = z.strictObject({
  code: z.literal(0),
  message: z.literal('ok'),
  data: z.strictObject({ settings: settingsSchema }),
})

export async function settingsRoutes(
  app: FastifyInstance,
  options: SettingsRoutesOptions,
): Promise<void> {
  const routes = app.withTypeProvider<ZodTypeProvider>()
  const service = new SettingsService(app.prisma, options.studentId)

  routes.patch(
    '/api/student/settings',
    {
      schema: {
        tags: ['student'],
        summary: 'Update student study preferences',
        body: settingsPatchSchema,
        response: { 200: settingsEnvelopeSchema },
      },
    },
    async (request) => ok({ settings: await service.patch(request.body) }),
  )
}
