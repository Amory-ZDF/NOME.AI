import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../../src/app.js'
import { parseEnv } from '../../src/config/env.js'
import { toInputJson } from '../../src/db/json.js'
import { createTestPrisma, resetDatabase, TEST_DATABASE_URL } from '../helpers/database.js'

const prisma = createTestPrisma()
const studentId = 'student-note-update'

const original = {
  id: 'note-update', title: 'Original title', folderId: 'folder-a', folderPath: 'Math', tags: ['old'],
  linkedTopics: ['topic-a'], linkedErrors: ['error-a'], source: 'typed', sourceJobId: 'upload-1',
  materialType: 'class_note', examBoard: 'AQA', subject: 'Math', chapter: 'Calculus',
  createdAt: '2026-08-10T09:00:00.000Z', updatedAt: '2026-08-10T09:00:00.000Z',
  content: [{ t: 'p', v: 'Original content' }], aiSuggestions: [{ type: 'link_topic', message: 'Keep me' }], version: 1, versions: [],
}

async function insertStudent(id = studentId) {
  await prisma.student.create({ data: { id, name: id, avatar: null, joinedDays: 1, gradeInfo: 'Year 12', greeting: toInputJson({ message: 'Hello', fallback: 'Hello' }), moduleStats: toInputJson({ notesCount: 0, weeklyExercises: 0, latestAccuracy: 0, pendingErrorReview: 0 }), learningSummary: toInputJson({ overallMastery: 0, weeklyCompleted: 0, weeklyTotal: 0, overdueTasks: 0, weakTopics: [], knowledgeHeatmap: [] }) } })
}
async function insertNote(note = original) {
  await prisma.note.create({ data: { id: note.id, studentId, version: note.version, updatedAtValue: new Date(note.updatedAt), payload: toInputJson(note) } })
}
function createApp() { return buildApp({ env: parseEnv({ NODE_ENV: 'test', DATABASE_URL: TEST_DATABASE_URL, STUDENT_ID: studentId, LOG_LEVEL: 'silent' }), prisma }) }

beforeEach(async () => resetDatabase(prisma))
afterAll(async () => { await resetDatabase(prisma); await prisma.$disconnect() })

describe('PATCH /api/notes/{id}', () => {
  it('updates only editable fields and snapshots the exact prior state with client metadata', async () => {
    await insertStudent(); await insertNote(); const app = createApp()
    const changedAt = '2026-08-10T11:00:00.000Z'
    const patch = { title: 'Updated title', folderId: null, folderPath: null, tags: ['new'], content: [{ t: 'h', v: 'Updated' }], linkedTopics: ['topic-b'], linkedErrors: ['error-b'], changedAt, reason: 'manual_edit' }
    const response = await app.inject({ method: 'PATCH', url: `/api/notes/${original.id}`, payload: patch })
    await app.close()
    const expected = { ...original, ...Object.fromEntries(Object.entries(patch).filter(([key]) => !['changedAt', 'reason'].includes(key))), updatedAt: changedAt, version: 2, versions: [{ version: 1, title: original.title, folderId: original.folderId, folderPath: original.folderPath, tags: original.tags, content: original.content, linkedTopics: original.linkedTopics, linkedErrors: original.linkedErrors, source: original.source, changedAt, reason: 'manual_edit' }] }
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ code: 0, message: 'ok', data: { note: expected } })
    await expect(prisma.note.findUnique({ where: { studentId_id: { studentId, id: original.id } } })).resolves.toMatchObject({ version: 2, updatedAtValue: new Date(changedAt), payload: expected })
  })

  it('defaults absent reason to edit, preserves no-ops, and rejects immutable or invalid metadata atomically', async () => {
    await insertStudent(); await insertNote(); const app = createApp()
    const noOp = await app.inject({ method: 'PATCH', url: `/api/notes/${original.id}`, payload: { title: original.title, changedAt: '2026-08-10T11:00:00.000Z' } })
    const immutable = await app.inject({ method: 'PATCH', url: `/api/notes/${original.id}`, payload: { source: 'photo', changedAt: '2026-08-10T11:00:00.000Z' } })
    const invalidMetadata = await app.inject({ method: 'PATCH', url: `/api/notes/${original.id}`, payload: { title: 'No write', changedAt: null } })
    await app.close()
    expect(noOp.statusCode).toBe(200)
    expect(noOp.json()).toEqual({ code: 0, message: 'ok', data: { note: original } })
    expect(immutable.statusCode).toBe(400)
    expect(immutable.json()).toEqual({ code: 'INVALID_NOTE_PATCH', message: 'Note patch contains invalid fields', data: null })
    expect(invalidMetadata.statusCode).toBe(400)
    expect(invalidMetadata.json()).toEqual({ code: 'INVALID_CHANGE_METADATA', message: 'Change metadata is invalid', data: null })
    await expect(prisma.note.findUnique({ where: { studentId_id: { studentId, id: original.id } } })).resolves.toMatchObject({ version: 1, payload: original })
  })

  it('uses changedAt over updatedAt, accepts the legacy updatedAt metadata, and defaults the reason', async () => {
    await insertStudent(); await insertNote(); const app = createApp()
    const both = await app.inject({ method: 'PATCH', url: `/api/notes/${original.id}`, payload: { title: 'First', changedAt: '2026-08-10T11:00:00.000Z', updatedAt: '2026-08-10T12:00:00.000Z' } })
    const legacy = await app.inject({ method: 'PATCH', url: `/api/notes/${original.id}`, payload: { title: 'Second', updatedAt: '2026-08-10T13:00:00.000Z' } })
    const empty = await app.inject({ method: 'PATCH', url: `/api/notes/${original.id}`, payload: { changedAt: '2026-08-10T14:00:00.000Z' } })
    await app.close()
    expect(both.statusCode).toBe(200)
    expect(both.json().data.note).toMatchObject({ updatedAt: '2026-08-10T11:00:00.000Z', version: 2, versions: [{ changedAt: '2026-08-10T11:00:00.000Z', reason: 'edit' }] })
    expect(legacy.statusCode).toBe(200)
    expect(legacy.json().data.note).toMatchObject({ updatedAt: '2026-08-10T13:00:00.000Z', version: 3, versions: [expect.anything(), { changedAt: '2026-08-10T13:00:00.000Z', reason: 'edit' }] })
    expect(empty.statusCode).toBe(200)
    expect(empty.json().data.note.version).toBe(3)
  })

  it('treats a key-reordered but JSON-equivalent content patch as a no-op', async () => {
    await insertStudent(); await insertNote(); const app = createApp()
    await prisma.note.update({ where: { studentId_id: { studentId, id: original.id } }, data: { payload: toInputJson({ ...original, content: [{ t: 'list', v: 'one', reference: 'object://one', alt: 'one' }] }) } })
    const response = await app.inject({ method: 'PATCH', url: `/api/notes/${original.id}`, payload: { content: [{ alt: 'one', reference: 'object://one', v: 'one', t: 'list' }], changedAt: '2026-08-10T11:00:00.000Z' } })
    await app.close()
    expect(response.statusCode).toBe(200)
    expect(response.json().data.note).toMatchObject({ version: 1, updatedAt: original.updatedAt, versions: [] })
  })

  it('returns a safe not-found response and never creates or changes a note', async () => {
    await insertStudent(); const app = createApp()
    const response = await app.inject({ method: 'PATCH', url: '/api/notes/missing', payload: { title: 'No note', changedAt: '2026-08-10T11:00:00.000Z' } })
    await app.close()
    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ code: 'NOT_FOUND', message: 'Note not found', data: null })
    await expect(prisma.note.count()).resolves.toBe(0)
  })

  it('rejects an empty patch with the domain metadata error and zero writes', async () => {
    await insertStudent(); await insertNote(); const before = await prisma.note.findUnique({ where: { studentId_id: { studentId, id: original.id } } }); const app = createApp()
    const response = await app.inject({ method: 'PATCH', url: `/api/notes/${original.id}`, payload: {} })
    await app.close()
    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({ code: 'INVALID_CHANGE_METADATA', message: 'Change metadata is invalid', data: null })
    await expect(prisma.note.findUnique({ where: { studentId_id: { studentId, id: original.id } } })).resolves.toEqual(before)
  })

  it('cannot read or mutate another student note and keeps its payload byte-equivalent', async () => {
    const other = 'student-note-other'
    await insertStudent(); await insertStudent(other)
    await prisma.note.create({ data: { id: original.id, studentId: other, version: original.version, updatedAtValue: new Date(original.updatedAt), payload: toInputJson(original) } })
    const before = await prisma.note.findUnique({ where: { studentId_id: { studentId: other, id: original.id } } })
    const app = createApp()
    const response = await app.inject({ method: 'PATCH', url: `/api/notes/${original.id}`, payload: { title: 'forbidden', changedAt: '2026-08-10T11:00:00.000Z' } })
    await app.close()
    expect(response.statusCode).toBe(404)
    await expect(prisma.note.findUnique({ where: { studentId_id: { studentId: other, id: original.id } } })).resolves.toEqual(before)
  })
})
