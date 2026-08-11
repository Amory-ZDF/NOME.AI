import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { errorEnvelopeSchema, ok } from '../../common/http/envelope.js'
import { noteSchema } from '../../contracts/student-contracts.js'
import { NoteService } from './note.service.js'

interface NoteRoutesOptions { studentId: string }
const noteParamsSchema = z.strictObject({ id: z.string().min(1).refine((value) => value.trim().length > 0) })
const noteEnvelopeSchema = z.strictObject({ code: z.literal(0), message: z.literal('ok'), data: z.strictObject({ note: noteSchema }) })
const notesEnvelopeSchema = z.strictObject({ code: z.literal(0), message: z.literal('ok'), data: z.strictObject({ notes: z.array(noteSchema) }) })

export async function noteRoutes(app: FastifyInstance, options: NoteRoutesOptions): Promise<void> {
  const routes = app.withTypeProvider<ZodTypeProvider>()
  const service = new NoteService(app.prisma, options.studentId)
  const errors = { 400: errorEnvelopeSchema, 404: errorEnvelopeSchema, 409: errorEnvelopeSchema, 413: errorEnvelopeSchema, 415: errorEnvelopeSchema, 500: errorEnvelopeSchema }
  routes.get('/api/notes', { schema: { tags: ['notes'], summary: 'List notes for the configured student', response: { 200: notesEnvelopeSchema, 404: errorEnvelopeSchema, 500: errorEnvelopeSchema } } }, async () => ok({ notes: await service.list() }))
  routes.post('/api/notes', { schema: { tags: ['notes'], summary: 'Create a versioned note', body: z.unknown(), response: { 200: noteEnvelopeSchema, ...errors } } }, async (request) => ok({ note: await service.create(request.body) }))
  routes.patch('/api/notes/:id', { schema: { tags: ['notes'], summary: 'Edit a note and record its prior version', params: noteParamsSchema, body: z.unknown(), response: { 200: noteEnvelopeSchema, ...errors } } }, async (request) => ok({ note: await service.update(request.params.id, request.body) }))
}
