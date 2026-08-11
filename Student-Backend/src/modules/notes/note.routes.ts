import type { FastifyInstance, FastifySchemaCompiler } from 'fastify'
import { validatorCompiler as zodValidatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { errorEnvelopeSchema, ok } from '../../common/http/envelope.js'
import { evidenceTimeSchema, noteBlockSchema, noteCreatePublicSchema, noteIdSchema, noteSchema } from '../../contracts/student-contracts.js'
import { NoteService } from './note.service.js'

interface NoteRoutesOptions { studentId: string }
const noteParamsSchema = z.strictObject({ id: noteIdSchema })
const nonBlank = z.string().min(1).refine((value) => value.trim().length > 0)
const createNoteBodySchema = noteCreatePublicSchema
const notePatchFields = {
  title: nonBlank.optional(), folderId: nonBlank.nullable().optional(), folderPath: nonBlank.nullable().optional(),
  tags: z.array(nonBlank).optional(), content: z.array(noteBlockSchema).optional(), linkedTopics: z.array(nonBlank).optional(), linkedErrors: z.array(nonBlank).optional(), reason: nonBlank.optional(),
}
const notePatchBodySchema = z.union([
  z.strictObject({ ...notePatchFields, changedAt: evidenceTimeSchema, updatedAt: evidenceTimeSchema.optional() }),
  z.strictObject({ ...notePatchFields, changedAt: evidenceTimeSchema.optional(), updatedAt: evidenceTimeSchema }),
])
const noteOrganizeBodySchema = z.strictObject({
  suggestionIds: z.array(noteIdSchema),
  changedAt: evidenceTimeSchema,
})
const noteUndoBodySchema = z.strictObject({ changedAt: evidenceTimeSchema })
const noteRouteValidatorCompiler: FastifySchemaCompiler<any> = (routeSchema) => (
  routeSchema.httpPart === 'body'
    ? (value: unknown) => ({ value })
    : zodValidatorCompiler(routeSchema as Parameters<typeof zodValidatorCompiler>[0])
)
const noteEnvelopeSchema = z.strictObject({ code: z.literal(0), message: z.literal('ok'), data: z.strictObject({ note: noteSchema }) })
const notesEnvelopeSchema = z.strictObject({ code: z.literal(0), message: z.literal('ok'), data: z.strictObject({ notes: z.array(noteSchema) }) })

export async function noteRoutes(app: FastifyInstance, options: NoteRoutesOptions): Promise<void> {
  const routes = app.withTypeProvider<ZodTypeProvider>()
  const service = new NoteService(app.prisma, options.studentId)
  const errors = { 400: errorEnvelopeSchema, 404: errorEnvelopeSchema, 409: errorEnvelopeSchema, 413: errorEnvelopeSchema, 415: errorEnvelopeSchema, 500: errorEnvelopeSchema }
  routes.get('/api/notes', { schema: { tags: ['notes'], summary: 'List notes for the configured student', response: { 200: notesEnvelopeSchema, 404: errorEnvelopeSchema, 500: errorEnvelopeSchema } } }, async () => ok({ notes: await service.list() }))
  routes.post('/api/notes', { validatorCompiler: noteRouteValidatorCompiler, schema: { tags: ['notes'], summary: 'Create a versioned note', body: createNoteBodySchema, response: { 200: noteEnvelopeSchema, ...errors } } }, async (request) => ok({ note: await service.create(request.body) }))
  routes.patch('/api/notes/:id', { validatorCompiler: noteRouteValidatorCompiler, schema: { tags: ['notes'], summary: 'Edit a note and record its prior version', params: noteParamsSchema, body: notePatchBodySchema, response: { 200: noteEnvelopeSchema, ...errors } } }, async (request) => ok({ note: await service.update(request.params.id, request.body) }))
  routes.post('/api/notes/:id/organize', { validatorCompiler: noteRouteValidatorCompiler, schema: { tags: ['notes'], summary: 'Apply selected persisted note suggestions', params: noteParamsSchema, body: noteOrganizeBodySchema, response: { 200: noteEnvelopeSchema, ...errors } } }, async (request) => ok({ note: await service.organize(request.params.id, request.body) }))
  routes.post('/api/notes/:id/undo', { validatorCompiler: noteRouteValidatorCompiler, schema: { tags: ['notes'], summary: 'Restore the latest note snapshot with an undo trace', params: noteParamsSchema, body: noteUndoBodySchema, response: { 200: noteEnvelopeSchema, ...errors } } }, async (request) => ok({ note: await service.undo(request.params.id, request.body) }))
}
