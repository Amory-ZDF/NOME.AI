import type { FastifyInstance, FastifySchemaCompiler } from 'fastify'
import { validatorCompiler as zodValidatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { errorEnvelopeSchema, ok } from '../../common/http/envelope.js'
import { evidenceTimeSchema, noteIdSchema, noteSchema } from '../../contracts/student-contracts.js'
import { NoteService } from './note.service.js'

interface NoteRoutesOptions { studentId: string }
const noteParamsSchema = z.strictObject({ id: noteIdSchema })
const nonBlank = z.string().min(1).refine((value) => value.trim().length > 0)
const createNoteBodySchema = z.strictObject({
  id: noteIdSchema, title: nonBlank, materialType: z.string().optional(), examBoard: nonBlank.optional(), subject: nonBlank.optional(), chapter: nonBlank.optional(),
  folderId: nonBlank.nullable(), folderPath: nonBlank.nullable(), tags: z.array(nonBlank), linkedTopics: z.array(nonBlank), linkedErrors: z.array(nonBlank),
  source: z.enum(['typed', 'handwritten', 'photo', 'ai_organized']), createdAt: evidenceTimeSchema, updatedAt: evidenceTimeSchema,
  content: z.array(z.unknown()), aiSuggestions: z.array(z.unknown()), questionBlocks: z.array(z.unknown()).optional(), answerBlocks: z.array(z.unknown()).optional(), sourceJobId: nonBlank.optional(),
  version: z.number().int().positive().optional(), versions: z.array(z.unknown()).optional(),
}).refine((value) => (value.version === undefined) === (value.versions === undefined), { message: 'version and versions must be supplied together' })
const notePatchBodySchema = z.strictObject({
  title: nonBlank.optional(), folderId: nonBlank.nullable().optional(), folderPath: nonBlank.nullable().optional(),
  tags: z.array(nonBlank).optional(), content: z.array(z.unknown()).optional(), linkedTopics: z.array(nonBlank).optional(), linkedErrors: z.array(nonBlank).optional(),
  changedAt: evidenceTimeSchema.optional(), updatedAt: evidenceTimeSchema.optional(), reason: nonBlank.optional(),
}).refine((value) => value.changedAt !== undefined || value.updatedAt !== undefined, { message: 'changedAt or updatedAt is required' })
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
}
