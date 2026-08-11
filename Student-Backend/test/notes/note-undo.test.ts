import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildApp } from '../../src/app.js'
import { AppError } from '../../src/common/errors/app-error.js'
import { parseEnv } from '../../src/config/env.js'
import { noteSchema } from '../../src/contracts/student-contracts.js'
import { toInputJson } from '../../src/db/json.js'
import { Prisma } from '../../src/generated/prisma/client.js'
import { NoteService } from '../../src/modules/notes/note.service.js'
import { ZodError } from 'zod'
import { createTestPrisma, holdStudentWriteLock, resetDatabase, TEST_DATABASE_URL, type TestPrisma } from '../helpers/database.js'

const prisma = createTestPrisma()
const studentId = 'student-note-undo'
const prior = {
  id: 'note-undo', title: 'Original title', folderId: 'folder-a', folderPath: 'Math', tags: ['calculus'], linkedTopics: ['topic-a'], linkedErrors: ['error-a'], source: 'typed', createdAt: '2026-08-10T09:00:00.000Z', updatedAt: '2026-08-10T09:00:00.000Z', content: [{ t: 'p', v: 'Original content' }], aiSuggestions: [], version: 1, versions: [],
}
const current = {
  ...prior, title: 'Organized title', tags: ['calculus', 'organized'], linkedTopics: ['topic-a', 'topic-b'], source: 'ai_organized', updatedAt: '2026-08-10T10:00:00.000Z', version: 2,
  versions: [{ version: 1, title: prior.title, folderId: prior.folderId, folderPath: prior.folderPath, tags: prior.tags, content: prior.content, linkedTopics: prior.linkedTopics, linkedErrors: prior.linkedErrors, source: prior.source, changedAt: '2026-08-10T10:00:00.000Z', reason: 'ai_organize' }],
}

async function insertStudent(id = studentId) {
  await prisma.student.create({ data: { id, name: id, avatar: null, joinedDays: 1, gradeInfo: 'Year 12', greeting: toInputJson({ message: 'Hello', fallback: 'Hello' }), moduleStats: toInputJson({ notesCount: 0, weeklyExercises: 0, latestAccuracy: 0, pendingErrorReview: 0 }), learningSummary: toInputJson({ overallMastery: 0, weeklyCompleted: 0, weeklyTotal: 0, overdueTasks: [], weakTopics: [], knowledgeHeatmap: [] }) } })
}
async function insertNote(note: { id: string; version: number; updatedAt: string } & Record<string, unknown> = current, id = studentId) { await prisma.note.create({ data: { id: note.id, studentId: id, version: note.version, updatedAtValue: new Date(note.updatedAt), payload: toInputJson(note) } }) }
function createApp(id = studentId, client: TestPrisma = prisma) { return buildApp({ env: parseEnv({ NODE_ENV: 'test', DATABASE_URL: TEST_DATABASE_URL, STUDENT_ID: id, LOG_LEVEL: 'silent' }), prisma: client }) }

beforeEach(async () => resetDatabase(prisma))
afterAll(async () => { await resetDatabase(prisma); await prisma.$disconnect() })

describe('POST /api/notes/{id}/undo', () => {
  it('restores the latest prior state deeply while appending a traceable pre-undo snapshot', async () => {
    await insertStudent(); await insertNote(); const app = createApp(); const changedAt = '2026-08-10T11:00:00.000Z'
    const response = await app.inject({ method: 'POST', url: `/api/notes/${current.id}/undo`, payload: { changedAt } }); await app.close()
    const expected = { ...prior, updatedAt: changedAt, version: 3, versions: [...current.versions, { version: 2, title: current.title, folderId: current.folderId, folderPath: current.folderPath, tags: current.tags, content: current.content, linkedTopics: current.linkedTopics, linkedErrors: current.linkedErrors, source: current.source, changedAt, reason: 'undo' }] }
    expect(response.statusCode).toBe(200); expect(response.json()).toEqual({ code: 0, message: 'ok', data: { note: expected } })
    await expect(prisma.note.findUnique({ where: { studentId_id: { studentId, id: current.id } } })).resolves.toMatchObject({ version: 3, updatedAtValue: new Date(changedAt), payload: expected })
  })

  it('preserves the current legal source when the latest legacy snapshot source is null', async () => {
    const legacy = { ...current, versions: [{ ...current.versions[0], source: null }] }
    await insertStudent(); await insertNote(legacy); const app = createApp()
    const response = await app.inject({ method: 'POST', url: `/api/notes/${current.id}/undo`, payload: { changedAt: '2026-08-10T11:00:00.000Z' } }); await app.close()
    expect(response.statusCode).toBe(200); expect(response.json().data.note.source).toBe('ai_organized')
  })

  it('accepts a legacy snapshot with no source and preserves the current legal source through a deep undo trace', async () => {
    const { source: _source, ...sourceLessSnapshot } = current.versions[0]!
    const legacy = { ...current, versions: [sourceLessSnapshot] }
    expect(noteSchema.safeParse(legacy).success).toBe(true)
    await insertStudent(); await insertNote(legacy); const app = createApp()
    const changedAt = '2026-08-10T11:00:00.000Z'
    const response = await app.inject({ method: 'POST', url: `/api/notes/${current.id}/undo`, payload: { changedAt } }); await app.close()
    expect(response.statusCode).toBe(200)
    expect(response.json().data.note).toMatchObject({
      title: prior.title, folderId: prior.folderId, folderPath: prior.folderPath, tags: prior.tags,
      content: prior.content, linkedTopics: prior.linkedTopics, linkedErrors: prior.linkedErrors,
      source: current.source, updatedAt: changedAt, version: 3,
      versions: [sourceLessSnapshot, { version: 2, source: current.source, changedAt, reason: 'undo' }],
    })
  })

  it('rejects missing history, stale timestamps, replays, and out-of-order timestamps without mutation', async () => {
    await insertStudent(); await insertNote(prior); const before = await prisma.note.findUnique({ where: { studentId_id: { studentId, id: prior.id } } }); const app = createApp()
    const noHistory = await app.inject({ method: 'POST', url: `/api/notes/${prior.id}/undo`, payload: { changedAt: '2026-08-10T11:00:00.000Z' } }); await app.close()
    expect(noHistory.statusCode).toBe(409); expect(noHistory.json()).toEqual({ code: 'NO_NOTE_VERSION', message: 'There is no previous note version to restore', data: null })
    await expect(prisma.note.findUnique({ where: { studentId_id: { studentId, id: prior.id } } })).resolves.toEqual(before)

    await resetDatabase(prisma); await insertStudent(); await insertNote(); const app2 = createApp()
    const stale = await app2.inject({ method: 'POST', url: `/api/notes/${current.id}/undo`, payload: { changedAt: current.updatedAt } })
    const fresh = await app2.inject({ method: 'POST', url: `/api/notes/${current.id}/undo`, payload: { changedAt: '2026-08-10T11:00:00.000Z' } })
    const replay = await app2.inject({ method: 'POST', url: `/api/notes/${current.id}/undo`, payload: { changedAt: '2026-08-10T11:00:00.000Z' } })
    const outOfOrder = await app2.inject({ method: 'POST', url: `/api/notes/${current.id}/undo`, payload: { changedAt: '2026-08-10T10:30:00.000Z' } }); await app2.close()
    expect(stale.statusCode).toBe(400); expect(fresh.statusCode).toBe(200); expect(replay.statusCode).toBe(400); expect(outOfOrder.statusCode).toBe(400)
    expect(stale.json()).toEqual({ code: 'STALE_CHANGE', message: 'Change timestamp is stale', data: null })
    expect(replay.json()).toEqual({ code: 'STALE_CHANGE', message: 'Change timestamp is stale', data: null })
    expect(outOfOrder.json()).toEqual({ code: 'STALE_CHANGE', message: 'Change timestamp is stale', data: null })
    await expect(prisma.note.findUnique({ where: { studentId_id: { studentId, id: current.id } } })).resolves.toMatchObject({ version: 3 })
  })

  it('is student-scoped and leaves another student byte-equivalent', async () => {
    const other = 'student-note-undo-other'; await insertStudent(); await insertStudent(other); await insertNote(current, other)
    const before = await prisma.note.findUnique({ where: { studentId_id: { studentId: other, id: current.id } } }); const app = createApp()
    const response = await app.inject({ method: 'POST', url: `/api/notes/${current.id}/undo`, payload: { changedAt: '2026-08-10T11:00:00.000Z' } }); await app.close()
    expect(response.statusCode).toBe(404); expect(response.json()).toEqual({ code: 'NOT_FOUND', message: 'Note not found', data: null })
    await expect(prisma.note.findUnique({ where: { studentId_id: { studentId: other, id: current.id } } })).resolves.toEqual(before)
  })

  it('uses the latest lifecycle evidence across clients so stale edits and undos cannot roll history backward', async () => {
    await insertStudent(); await insertNote({ ...current, version: 1, versions: [], source: 'typed', updatedAt: prior.updatedAt, title: prior.title, tags: prior.tags, linkedTopics: prior.linkedTopics, aiSuggestions: [{ id: 'tag', type: 'tag', value: 'organized' }] })
    const first = createApp(); const second = createApp()
    const organized = await first.inject({ method: 'POST', url: `/api/notes/${current.id}/organize`, payload: { suggestionIds: ['tag'], changedAt: '2026-08-10T11:00:01.000Z' } })
    const stalePatch = await second.inject({ method: 'PATCH', url: `/api/notes/${current.id}`, payload: { title: 'stale edit', changedAt: '2026-08-10T11:00:00.000Z' } })
    const staleUndo = await second.inject({ method: 'POST', url: `/api/notes/${current.id}/undo`, payload: { changedAt: '2026-08-10T11:00:00.500Z' } })
    const noOp = await second.inject({ method: 'PATCH', url: `/api/notes/${current.id}`, payload: { title: prior.title, changedAt: '2026-08-10T11:00:00.000Z' } })
    await first.close(); await second.close()
    expect(organized.statusCode).toBe(200)
    expect(stalePatch.statusCode).toBe(400); expect(stalePatch.json()).toEqual({ code: 'STALE_CHANGE', message: 'Change timestamp is stale', data: null })
    expect(staleUndo.statusCode).toBe(400); expect(staleUndo.json()).toEqual({ code: 'STALE_CHANGE', message: 'Change timestamp is stale', data: null })
    expect(noOp.statusCode).toBe(200); expect(noOp.json().data.note).toMatchObject({ version: 2, updatedAt: '2026-08-10T11:00:01.000Z' })
    const stored = await prisma.note.findUniqueOrThrow({ where: { studentId_id: { studentId, id: current.id } } })
    expect(stored).toMatchObject({ version: 2, updatedAtValue: new Date('2026-08-10T11:00:01.000Z') })
  })

  it('uses snapshot evidence as well as top-level updatedAt when rejecting a retrograde PATCH', async () => {
    const futureHistory = {
      ...current,
      updatedAt: '2026-08-10T11:00:00.000Z',
      versions: [{ ...current.versions[0]!, changedAt: '2026-08-10T11:00:01.000Z' }],
    }
    await insertStudent(); await insertNote(futureHistory)
    const before = await prisma.note.findUnique({ where: { studentId_id: { studentId, id: current.id } } }); const app = createApp()
    const response = await app.inject({ method: 'PATCH', url: `/api/notes/${current.id}`, payload: { title: 'retrograde', changedAt: '2026-08-10T11:00:00.500Z' } }); await app.close()
    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({ code: 'STALE_CHANGE', message: 'Change timestamp is stale', data: null })
    await expect(prisma.note.findUnique({ where: { studentId_id: { studentId, id: current.id } } })).resolves.toEqual(before)
  })

  it('publishes legacy snapshot source as optional in OpenAPI while retaining the strict undo body', async () => {
    const app = createApp(); const docs = await app.inject({ method: 'GET', url: '/documentation/json' }); await app.close()
    const document = docs.json()
    const findSnapshot = (value: unknown): { required?: string[] } | undefined => {
      if (value === null || typeof value !== 'object') return undefined
      const schema = value as { properties?: Record<string, unknown>; required?: string[] }
      if (schema.properties?.changedAt !== undefined && schema.properties.reason !== undefined && schema.properties.linkedTopics !== undefined) return schema
      return Object.values(value).map(findSnapshot).find((candidate) => candidate !== undefined)
    }
    const snapshot = findSnapshot(document.paths['/api/notes/{id}/undo'].post.responses['200'])
    expect(snapshot).toBeDefined()
    expect(snapshot?.required).not.toContain('source')
    const body = document.paths['/api/notes/{id}/undo'].post.requestBody.content['application/json'].schema
    expect(body.required).toEqual(['changedAt'])
    expect(body.additionalProperties).toBe(false)
  })

  it('keeps two independent clients’ later organize commands continuous and monotonic without a lost update', async () => {
    const seeded = { ...current, version: 1, versions: [], source: 'typed', updatedAt: prior.updatedAt, title: prior.title, tags: prior.tags, linkedTopics: prior.linkedTopics, aiSuggestions: [{ id: 'tag-a', type: 'tag', value: 'first' }, { id: 'tag-b', type: 'tag', value: 'second' }] }
    await insertStudent(); await insertNote(seeded)
    const first = createApp(); const second = createApp()
    const responses = [
      await first.inject({ method: 'POST', url: `/api/notes/${current.id}/organize`, payload: { suggestionIds: ['tag-a'], changedAt: '2026-08-10T11:00:01.000Z' } }),
      await second.inject({ method: 'POST', url: `/api/notes/${current.id}/organize`, payload: { suggestionIds: ['tag-b'], changedAt: '2026-08-10T11:00:02.000Z' } }),
    ]
    await first.close(); await second.close()
    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 200])
    const stored = await prisma.note.findUniqueOrThrow({ where: { studentId_id: { studentId, id: current.id } } })
    const payload = stored.payload as typeof current
    expect(stored.version).toBe(3)
    expect(payload.versions.map(({ changedAt }) => changedAt)).toEqual(['2026-08-10T11:00:01.000Z', '2026-08-10T11:00:02.000Z'])
    expect(payload.updatedAt).toBe('2026-08-10T11:00:02.000Z')
  })

  it.each([
    ['PATCH', prior, { method: 'PATCH', payload: { title: 'locked edit', changedAt: '2026-08-10T12:00:00.000Z' } }],
    ['organize', { ...prior, aiSuggestions: [{ id: 'tag', type: 'tag', value: 'locked' }] }, { method: 'POST', suffix: '/organize', payload: { suggestionIds: ['tag'], changedAt: '2026-08-10T12:00:00.000Z' } }],
    ['undo', current, { method: 'POST', suffix: '/undo', payload: { changedAt: '2026-08-10T12:00:00.000Z' } }],
  ] as const)('retries a real SQLite write lock for %s without a 500 or lost write', { timeout: 15_000 }, async (_action, note, request) => {
    await insertStudent(); await insertNote(note)
    const client = createTestPrisma(); const blocker = createTestPrisma(); const app = createApp(studentId, client)
    const release = await holdStudentWriteLock(blocker, studentId, 125)
    try {
      const response = await app.inject({ method: request.method, url: `/api/notes/${current.id}${'suffix' in request ? request.suffix : ''}`, payload: request.payload })
      expect(response.statusCode).toBe(200)
      expect(response.json().data.note).toMatchObject({ version: note.version + 1, updatedAt: '2026-08-10T12:00:00.000Z' })
      const stored = await prisma.note.findUniqueOrThrow({ where: { studentId_id: { studentId, id: current.id } } })
      expect(stored.version).toBe(note.version + 1)
    } finally {
      await release(); await app.close(); await client.$disconnect(); await blocker.$disconnect()
    }
  })

  it.each([
    ['P1008', new Prisma.PrismaClientKnownRequestError('locked', { code: 'P1008', clientVersion: 'test' }), 5],
    ['P2034', new Prisma.PrismaClientKnownRequestError('conflict', { code: 'P2034', clientVersion: 'test' }), 5],
    ['P2028', new Prisma.PrismaClientKnownRequestError('synthetic', { code: 'P2028', clientVersion: 'test' }), 1],
    ['AppError', new AppError('domain', 400, 'INVALID_INPUT'), 1],
    ['ZodError', new ZodError([]), 1],
    ['unknown', new Error('unknown'), 1],
  ] as const)('retries only proven Prisma contention errors: %s', async (_label, cause, calls) => {
    const transaction = vi.fn(async () => { throw cause })
    const service = new NoteService({ $transaction: transaction } as any, studentId)
    await expect(service.update(current.id, { title: 'retry', changedAt: '2026-08-10T12:00:00.000Z' })).rejects.toBe(cause)
    expect(transaction).toHaveBeenCalledTimes(calls)
  })
})
