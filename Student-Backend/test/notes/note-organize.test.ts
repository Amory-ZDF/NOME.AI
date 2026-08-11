import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../../src/app.js'
import { parseEnv } from '../../src/config/env.js'
import { noteSchema } from '../../src/contracts/student-contracts.js'
import { normalizeNoteSuggestions } from '../../src/modules/notes/note-versions.js'
import { toInputJson } from '../../src/db/json.js'
import { createTestPrisma, resetDatabase, TEST_DATABASE_URL } from '../helpers/database.js'

const prisma = createTestPrisma()
const studentId = 'student-note-organize'

const original = {
  id: 'note-organize', title: 'Original title', folderId: 'folder-a', folderPath: 'Math',
  tags: ['calculus'], linkedTopics: ['topic-a'], linkedErrors: ['error-a'], source: 'typed',
  createdAt: '2026-08-10T09:00:00.000Z', updatedAt: '2026-08-10T09:00:00.000Z',
  content: [{ t: 'p', v: 'Original content' }],
  aiSuggestions: [
    { id: 'add-tag', type: 'add_tag', message: 'Add an existing tag', tag: 'organized' },
    { id: 'append-content', type: 'append_content', message: 'Append an existing block', content: [{ t: 'p', v: 'Extra content' }, { t: 'p', v: 'Original content' }] },
    { id: 'link-topic', type: 'link_topic', message: 'Link the topic', topicId: 'topic-b' },
    { id: 'link-error', type: 'link_error', message: 'Link the error', errorId: 'error-b' },
  ],
  version: 1, versions: [],
}

async function insertStudent(id = studentId) {
  await prisma.student.create({ data: { id, name: id, avatar: null, joinedDays: 1, gradeInfo: 'Year 12', greeting: toInputJson({ message: 'Hello', fallback: 'Hello' }), moduleStats: toInputJson({ notesCount: 0, weeklyExercises: 0, latestAccuracy: 0, pendingErrorReview: 0 }), learningSummary: toInputJson({ overallMastery: 0, weeklyCompleted: 0, weeklyTotal: 0, overdueTasks: [], weakTopics: [], knowledgeHeatmap: [] }) } })
}
async function insertNote(note = original, id = studentId) {
  await prisma.note.create({ data: { id: note.id, studentId: id, version: note.version, updatedAtValue: new Date(note.updatedAt), payload: toInputJson(note) } })
}
function createApp(id = studentId) { return buildApp({ env: parseEnv({ NODE_ENV: 'test', DATABASE_URL: TEST_DATABASE_URL, STUDENT_ID: id, LOG_LEVEL: 'silent' }), prisma }) }

beforeEach(async () => resetDatabase(prisma))
afterAll(async () => { await resetDatabase(prisma); await prisma.$disconnect() })

describe('POST /api/notes/{id}/organize', () => {
  it('applies only selected persisted suggestions, deduplicates their effects, and creates one exact organization snapshot', async () => {
    await insertStudent(); await insertNote(); const app = createApp()
    const changedAt = '2026-08-10T11:00:00.000Z'
    const response = await app.inject({ method: 'POST', url: `/api/notes/${original.id}/organize`, payload: { suggestionIds: ['add-tag', 'append-content', 'link-topic', 'link-error'], changedAt } })
    await app.close()
    const expected = {
      ...original, tags: ['calculus', 'organized'], content: [{ t: 'p', v: 'Original content' }, { t: 'p', v: 'Extra content' }], linkedTopics: ['topic-a', 'topic-b'], linkedErrors: ['error-a', 'error-b'], source: 'ai_organized', updatedAt: changedAt, version: 2,
      versions: [{ version: 1, title: original.title, folderId: original.folderId, folderPath: original.folderPath, tags: original.tags, content: original.content, linkedTopics: original.linkedTopics, linkedErrors: original.linkedErrors, source: original.source, changedAt, reason: 'ai_organize' }],
    }
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ code: 0, message: 'ok', data: { note: expected } })
    await expect(prisma.note.findUnique({ where: { studentId_id: { studentId, id: original.id } } })).resolves.toMatchObject({ version: 2, updatedAtValue: new Date(changedAt), payload: expected })
  })

  it('rejects unknown, duplicate, and malformed selected ids atomically without producing suggestions or links', async () => {
    await insertStudent(); await insertNote(); const before = await prisma.note.findUnique({ where: { studentId_id: { studentId, id: original.id } } }); const app = createApp()
    const unknown = await app.inject({ method: 'POST', url: `/api/notes/${original.id}/organize`, payload: { suggestionIds: ['missing'], changedAt: '2026-08-10T11:00:00.000Z' } })
    const duplicate = await app.inject({ method: 'POST', url: `/api/notes/${original.id}/organize`, payload: { suggestionIds: ['add-tag', 'add-tag'], changedAt: '2026-08-10T11:00:00.000Z' } })
    const malformed = await app.inject({ method: 'POST', url: `/api/notes/${original.id}/organize`, payload: { suggestionIds: ['add-tag', 'bad\u0000id'], changedAt: '2026-08-10T11:00:00.000Z' } })
    await app.close()
    expect(unknown.statusCode).toBe(400); expect(unknown.json()).toEqual({ code: 'INVALID_NOTE_SUGGESTION', message: 'Selected note suggestion is invalid', data: null })
    expect(duplicate.statusCode).toBe(400); expect(duplicate.json()).toEqual({ code: 'INVALID_NOTE_SUGGESTION', message: 'Selected note suggestion is invalid', data: null })
    expect(malformed.statusCode).toBe(400); expect(malformed.json()).toEqual({ code: 'INVALID_NOTE_SUGGESTION', message: 'Selected note suggestion is invalid', data: null })
    await expect(prisma.note.findUnique({ where: { studentId_id: { studentId, id: original.id } } })).resolves.toEqual(before)
  })

  it('keeps organization a no-op when all selected effects already exist', async () => {
    const organized = { ...original, tags: ['calculus', 'organized'], content: [{ t: 'p', v: 'Original content' }, { t: 'p', v: 'Extra content' }], linkedTopics: ['topic-a', 'topic-b'], linkedErrors: ['error-a', 'error-b'], source: 'ai_organized' }
    await insertStudent(); await insertNote(organized); const app = createApp()
    const response = await app.inject({ method: 'POST', url: `/api/notes/${original.id}/organize`, payload: { suggestionIds: ['add-tag', 'append-content', 'link-topic', 'link-error'], changedAt: '2026-08-10T11:00:00.000Z' } })
    await app.close()
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ code: 0, message: 'ok', data: { note: organized } })
  })

  it('keeps an empty persisted-suggestion selection a no-op', async () => {
    await insertStudent(); await insertNote(); const app = createApp()
    const response = await app.inject({ method: 'POST', url: `/api/notes/${original.id}/organize`, payload: { suggestionIds: [], changedAt: '2026-08-10T11:00:00.000Z' } })
    await app.close()
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ code: 0, message: 'ok', data: { note: original } })
  })

  it('does not expose or mutate an another student note', async () => {
    const other = 'student-note-organize-other'
    await insertStudent(); await insertStudent(other); await insertNote(original, other)
    const before = await prisma.note.findUnique({ where: { studentId_id: { studentId: other, id: original.id } } }); const app = createApp()
    const response = await app.inject({ method: 'POST', url: `/api/notes/${original.id}/organize`, payload: { suggestionIds: ['add-tag'], changedAt: '2026-08-10T11:00:00.000Z' } })
    await app.close()
    expect(response.statusCode).toBe(404); expect(response.json()).toEqual({ code: 'NOT_FOUND', message: 'Note not found', data: null })
    await expect(prisma.note.findUnique({ where: { studentId_id: { studentId: other, id: original.id } } })).resolves.toEqual(before)
  })

  it('rejects stored scalar and payload corruption without leaking persisted data', async () => {
    await insertStudent(); await insertNote({ ...original, version: 2, versions: [] }); const app = createApp()
    const response = await app.inject({ method: 'POST', url: `/api/notes/${original.id}/organize`, payload: { suggestionIds: ['add-tag'], changedAt: '2026-08-10T11:00:00.000Z' } })
    await app.close()
    expect(response.statusCode).toBe(500)
    expect(response.json()).toEqual({ code: 'STORED_DATA_INVALID', message: 'Stored student data is invalid', data: null })
    expect(response.body).not.toMatch(/payload|zod|stack/i)
  })

  it('keeps version continuity under concurrent valid commands', async () => {
    await insertStudent(); await insertNote(); const app = createApp()
    const responses = await Promise.all([
      app.inject({ method: 'POST', url: `/api/notes/${original.id}/organize`, payload: { suggestionIds: ['add-tag'], changedAt: '2026-08-10T11:00:00.000Z' } }),
      app.inject({ method: 'POST', url: `/api/notes/${original.id}/organize`, payload: { suggestionIds: ['link-topic'], changedAt: '2026-08-10T11:00:01.000Z' } }),
    ])
    await app.close()
    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 200])
    const stored = await prisma.note.findUniqueOrThrow({ where: { studentId_id: { studentId, id: original.id } } })
    expect(stored.version).toBe(3)
    expect((stored.payload as typeof original).versions).toHaveLength(2)
  })

  it('enforces note id boundaries and documents strict body, response, 413, and 415 contracts', async () => {
    const exactId = `a${'你'.repeat(99)}`
    await insertStudent(); await insertNote({ ...original, id: exactId }); const app = createApp()
    const exact = await app.inject({ method: 'POST', url: `/api/notes/${encodeURIComponent(exactId)}/organize`, payload: { suggestionIds: ['add-tag'], changedAt: '2026-08-10T11:00:00.000Z' } })
    const tooLong = await app.inject({ method: 'POST', url: `/api/notes/${'x'.repeat(101)}/organize`, payload: { suggestionIds: ['add-tag'], changedAt: '2026-08-10T11:00:00.000Z' } })
    const control = await app.inject({ method: 'POST', url: '/api/notes/bad%00id/organize', payload: { suggestionIds: ['add-tag'], changedAt: '2026-08-10T11:00:00.000Z' } })
    const unsupported = await app.inject({ method: 'POST', url: `/api/notes/${encodeURIComponent(exactId)}/organize`, headers: { 'content-type': 'application/xml' }, payload: '<suggestionIds />' })
    const oversized = await app.inject({ method: 'POST', url: `/api/notes/${encodeURIComponent(exactId)}/organize`, headers: { 'content-type': 'application/json' }, payload: JSON.stringify({ suggestionIds: ['add-tag'], changedAt: '2026-08-10T11:00:00.000Z', pad: 'x'.repeat(1_100_000) }) })
    const docs = await app.inject({ method: 'GET', url: '/documentation/json' }); await app.close()
    expect(exact.statusCode).toBe(200); expect(tooLong.statusCode).toBe(400); expect(control.statusCode).toBe(400); expect(unsupported.statusCode).toBe(415); expect(oversized.statusCode).toBe(413)
    const operation = docs.json().paths['/api/notes/{id}/organize'].post
    expect(operation.requestBody.content['application/json'].schema).not.toEqual({})
    expect(Object.keys(operation.responses)).toEqual(expect.arrayContaining(['200', '400', '404', '409', '413', '415', '500']))
  })
})

describe('persisted AI suggestion contract', () => {
  it.each([
    { id: 'split', type: 'split_note', message: 'Split this note' },
    { id: 'related', type: 'related_content', message: 'Related content' },
    { id: 'add-tag', type: 'add_tag', tag: 'organized' },
    { id: 'tag', type: 'tag', value: 'organized' },
    { id: 'append', type: 'append_content', content: [{ t: 'p', v: 'extra' }] },
    { id: 'content', type: 'content', blocks: [{ t: 'p', v: 'extra' }] },
    { id: 'topic', type: 'link_topic', topicId: 'topic-b' },
    { id: 'error', type: 'link_error', errorId: 'error-b' },
  ])('accepts the existing %s suggestion variant with its canonical payload', (suggestion) => {
    expect(noteSchema.safeParse({ ...original, aiSuggestions: [suggestion] }).success).toBe(true)
  })

  it.each([
    { id: 'bad-tag', type: 'add_tag', tag: '' },
    { id: 'bad-content', type: 'append_content', content: [{ t: 'image', v: 'raw', reference: 'data:image/png;base64,abc', alt: 'raw' }] },
    { id: 'bad-topic', type: 'link_topic', topicId: 'topic-b', value: 'topic-c' },
    { id: 'bad-error', type: 'link_error', errorId: 'error-b', unexpected: true },
    { id: 'bad-id\u0000', type: 'tag', value: 'organized' },
  ])('rejects malformed, ambiguous, unsafe, or extra suggestion data', (suggestion) => {
    expect(noteSchema.safeParse({ ...original, aiSuggestions: [suggestion] }).success).toBe(false)
  })

  it('rejects duplicate explicit persisted suggestion ids before any command can select them', () => {
    const duplicated = { ...original, aiSuggestions: [
      { id: 'same', type: 'tag', value: 'first' },
      { id: 'same', type: 'tag', value: 'second' },
    ] }
    expect(noteSchema.safeParse(duplicated).success).toBe(false)
  })

  it('normalizes legacy id-less persisted suggestions deterministically without changing their payload', () => {
    const legacy = { ...original, aiSuggestions: [{ type: 'tag', value: 'legacy' }, { type: 'tag', value: 'legacy' }] }
    const first = normalizeNoteSuggestions(noteSchema.parse(legacy))
    const reloaded = normalizeNoteSuggestions(noteSchema.parse(JSON.parse(JSON.stringify(legacy))))
    expect(first).toEqual(reloaded)
    expect(first.map((suggestion) => suggestion.id)).toHaveLength(2)
    expect(new Set(first.map((suggestion) => suggestion.id)).size).toBe(2)
    expect(first.map(({ id: _id, ...suggestion }) => suggestion)).toEqual(legacy.aiSuggestions)
  })
})
