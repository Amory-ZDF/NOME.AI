import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../../src/app.js'
import { parseEnv } from '../../src/config/env.js'
import { toInputJson } from '../../src/db/json.js'
import { createTestPrisma, resetDatabase, TEST_DATABASE_URL } from '../helpers/database.js'

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
async function insertNote(note: { id: string; version: number; updatedAt: string } = current, id = studentId) { await prisma.note.create({ data: { id: note.id, studentId: id, version: note.version, updatedAtValue: new Date(note.updatedAt), payload: toInputJson(note) } }) }
function createApp(id = studentId) { return buildApp({ env: parseEnv({ NODE_ENV: 'test', DATABASE_URL: TEST_DATABASE_URL, STUDENT_ID: id, LOG_LEVEL: 'silent' }), prisma }) }

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
    expect(stale.statusCode).toBe(409); expect(fresh.statusCode).toBe(200); expect(replay.statusCode).toBe(409); expect(outOfOrder.statusCode).toBe(409)
    expect(stale.json().code).toBe('STALE_CHANGE'); expect(replay.json().code).toBe('STALE_CHANGE'); expect(outOfOrder.json().code).toBe('STALE_CHANGE')
    await expect(prisma.note.findUnique({ where: { studentId_id: { studentId, id: current.id } } })).resolves.toMatchObject({ version: 3 })
  })

  it('is student-scoped and leaves another student byte-equivalent', async () => {
    const other = 'student-note-undo-other'; await insertStudent(); await insertStudent(other); await insertNote(current, other)
    const before = await prisma.note.findUnique({ where: { studentId_id: { studentId: other, id: current.id } } }); const app = createApp()
    const response = await app.inject({ method: 'POST', url: `/api/notes/${current.id}/undo`, payload: { changedAt: '2026-08-10T11:00:00.000Z' } }); await app.close()
    expect(response.statusCode).toBe(404); expect(response.json()).toEqual({ code: 'NOT_FOUND', message: 'Note not found', data: null })
    await expect(prisma.note.findUnique({ where: { studentId_id: { studentId: other, id: current.id } } })).resolves.toEqual(before)
  })
})
