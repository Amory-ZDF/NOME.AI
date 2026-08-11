import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../../src/app.js'
import { parseEnv } from '../../src/config/env.js'
import { toInputJson } from '../../src/db/json.js'
import { sanitizeCreatedNote } from '../../src/modules/notes/note-versions.js'
import { noteCreateSchema } from '../../src/contracts/student-contracts.js'
import { createTestPrisma, resetDatabase, TEST_DATABASE_URL } from '../helpers/database.js'

const prisma = createTestPrisma()
const studentId = 'student-notes'
const otherStudentId = 'student-other-notes'

function note(id = 'note-1') {
  return {
    id,
    title: 'Derivative rules',
    folderId: null,
    folderPath: null,
    tags: ['calculus'],
    linkedTopics: ['derivatives'],
    linkedErrors: [],
    source: 'typed',
    createdAt: '2026-08-10T09:00:00.000Z',
    updatedAt: '2026-08-10T09:00:00.000Z',
    content: [{ t: 'p', v: 'Differentiate powers first.' }],
    aiSuggestions: [],
  }
}

async function insertStudent(id = studentId) {
  await prisma.student.create({
    data: {
      id,
      name: id,
      avatar: null,
      joinedDays: 1,
      gradeInfo: 'Year 12',
      greeting: toInputJson({ message: 'Hello', fallback: 'Hello' }),
      moduleStats: toInputJson({ notesCount: 0, weeklyExercises: 0, latestAccuracy: 0, pendingErrorReview: 0 }),
      learningSummary: toInputJson({ overallMastery: 0, weeklyCompleted: 0, weeklyTotal: 0, overdueTasks: 0, weakTopics: [], knowledgeHeatmap: [] }),
    },
  })
}

function createApp(id = studentId) {
  return buildApp({
    env: parseEnv({ NODE_ENV: 'test', DATABASE_URL: TEST_DATABASE_URL, STUDENT_ID: id, LOG_LEVEL: 'silent' }),
    prisma,
  })
}

beforeEach(async () => resetDatabase(prisma))
afterAll(async () => { await resetDatabase(prisma); await prisma.$disconnect() })

describe('notes create and list', () => {
  it('creates a full note after normalizing legacy version fields', async () => {
    await insertStudent()
    const app = createApp()
    const payload = note()
    const response = await app.inject({ method: 'POST', url: '/api/notes', payload })
    await app.close()

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      code: 0,
      message: 'ok',
      data: { note: { ...payload, version: 1, versions: [] } },
    })
    await expect(prisma.note.findUnique({ where: { studentId_id: { studentId, id: payload.id } } }))
      .resolves.toMatchObject({ version: 1, updatedAtValue: new Date(payload.updatedAt), payload: { ...payload, version: 1, versions: [] } })
  })

  it('lists only valid student notes in updated-time then id deterministic order', async () => {
    await insertStudent()
    await insertStudent(otherStudentId)
    const first = { ...note('note-a'), updatedAt: '2026-08-10T10:00:00.000Z', version: 1, versions: [] }
    const second = { ...note('note-b'), updatedAt: '2026-08-10T10:00:00.000Z', version: 1, versions: [] }
    const other = { ...note('note-other'), version: 1, versions: [] }
    await prisma.note.createMany({ data: [first, second].map((value) => ({ id: value.id, studentId, version: value.version, updatedAtValue: new Date(value.updatedAt), payload: toInputJson(value) })).concat([{ id: other.id, studentId: otherStudentId, version: other.version, updatedAtValue: new Date(other.updatedAt), payload: toInputJson(other) }]) })
    const app = createApp()
    const response = await app.inject({ method: 'GET', url: '/api/notes' })
    await app.close()

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ code: 0, message: 'ok', data: { notes: [first, second] } })
  })

  it('rejects duplicate ids and unsafe or raw-carrier notes before a mutation', async () => {
    await insertStudent()
    const created = { ...note(), version: 1, versions: [] }
    await prisma.note.create({ data: { id: created.id, studentId, version: 1, updatedAtValue: new Date(created.updatedAt), payload: toInputJson(created) } })
    const app = createApp()
    const duplicate = await app.inject({ method: 'POST', url: '/api/notes', payload: note() })
    const raw = await app.inject({ method: 'POST', url: '/api/notes', payload: { ...note('note-raw'), content: [{ t: 'image', v: 'preview', reference: 'data:image/png;base64,abc', alt: 'scan' }] } })
    await app.close()

    expect(duplicate.statusCode).toBe(409)
    expect(duplicate.json()).toEqual({ code: 'DUPLICATE_ID', message: 'Note id already exists', data: null })
    expect(raw.statusCode).toBe(400)
    expect(raw.json()).toEqual({ code: 'INVALID_NOTE', message: 'Note contains invalid or non-JSON data', data: null })
    await expect(prisma.note.count({ where: { studentId } })).resolves.toBe(1)
  })

  it('atomically accepts only one concurrent create for a student-scoped id', async () => {
    await insertStudent()
    const app = createApp()
    const responses = await Promise.all([
      app.inject({ method: 'POST', url: '/api/notes', payload: note('note-race') }),
      app.inject({ method: 'POST', url: '/api/notes', payload: note('note-race') }),
    ])
    await app.close()
    expect(responses.map(({ statusCode }) => statusCode).sort()).toEqual([200, 409])
    await expect(prisma.note.count({ where: { studentId, id: 'note-race' } })).resolves.toBe(1)
  })

  it('fails safely rather than returning a corrupt stored note', async () => {
    await insertStudent()
    await prisma.note.create({ data: { id: 'note-bad', studentId, version: 1, updatedAtValue: new Date('2026-08-10T09:00:00.000Z'), payload: toInputJson({ id: 'note-bad' }) } })
    const app = createApp()
    const response = await app.inject({ method: 'GET', url: '/api/notes' })
    await app.close()

    expect(response.statusCode).toBe(500)
    expect(response.json()).toEqual({ code: 'STORED_DATA_INVALID', message: 'Stored student data is invalid', data: null })
    expect(response.body).not.toMatch(/payload|zod|stack/i)
  })

  it.each([
    ['unknown field', () => ({ ...note('unsafe-unknown'), extra: true })],
    ['raw image reference', () => ({ ...note('unsafe-reference'), content: [{ t: 'image', v: 'preview', reference: 'raw:bytes', alt: 'scan' }] })],
    ['base64 list reference', () => ({ ...note('unsafe-list'), content: [{ t: 'list', v: 'item', reference: 'base64:bytes' }] })],
    ['base64 highlight reference', () => ({ ...note('unsafe-highlight'), content: [{ t: 'highlight', v: 'mark', reference: 'data:text/plain;base64,abc' }] })],
    ['accessor field', () => { const value = note('unsafe-accessor'); Object.defineProperty(value, 'title', { enumerable: true, get: () => 'bad' }); return value }],
    ['custom prototype', () => Object.assign(Object.create({ inherited: true }), note('unsafe-prototype'))],
    ['sparse content', () => { const value = note('unsafe-sparse'); value.content = new Array(1) as typeof value.content; return value }],
  ])('rejects %s before any database mutation', async (_label, makeUnsafe) => {
    await insertStudent()
    expect(() => sanitizeCreatedNote(makeUnsafe())).toThrow('INVALID_NOTE')
    await expect(prisma.note.count()).resolves.toBe(0)
  })

  it('treats scalar/payload note corruption as a safe stored-data failure', async () => {
    await insertStudent()
    const value = { ...note('note-scalar'), version: 1, versions: [] }
    await prisma.note.create({ data: { id: value.id, studentId, version: 2, updatedAtValue: new Date(value.updatedAt), payload: toInputJson(value) } })
    const app = createApp()
    const response = await app.inject({ method: 'GET', url: '/api/notes' })
    await app.close()
    expect(response.statusCode).toBe(500)
    expect(response.json()).toEqual({ code: 'STORED_DATA_INVALID', message: 'Stored student data is invalid', data: null })
  })

  it('documents transport errors and the public note routes', async () => {
    const app = createApp()
    const unsupported = await app.inject({ method: 'POST', url: '/api/notes', headers: { 'content-type': 'application/xml' }, payload: '<note />' })
    const oversized = await app.inject({ method: 'POST', url: '/api/notes', headers: { 'content-type': 'application/json' }, payload: JSON.stringify({ title: 'x'.repeat(1_048_576) }) })
    const docs = await app.inject({ method: 'GET', url: '/documentation/json' })
    await app.close()
    expect(unsupported.statusCode).toBe(415)
    expect(oversized.statusCode).toBe(413)
    expect(Object.keys(docs.json().paths['/api/notes'].post.responses).sort()).toEqual(['200', '400', '404', '409', '413', '415', '500'])
    expect(Object.keys(docs.json().paths['/api/notes/{id}'].patch.responses).sort()).toEqual(['200', '400', '404', '409', '413', '415', '500'])
  })

  it('enforces the same 100-character safe id boundary on create and patch', async () => {
    await insertStudent(); const app = createApp()
    const exact = `a${'你'.repeat(99)}`
    const created = await app.inject({ method: 'POST', url: '/api/notes', payload: note(exact) })
    const patched = await app.inject({ method: 'PATCH', url: `/api/notes/${encodeURIComponent(exact)}`, payload: { title: 'patched', changedAt: '2026-08-10T11:00:00.000Z' } })
    const tooLong = await app.inject({ method: 'POST', url: '/api/notes', payload: note('x'.repeat(101)) })
    const control = await app.inject({ method: 'POST', url: '/api/notes', payload: note('bad\u0000id') })
    await app.close()
    expect(created.statusCode).toBe(200); expect(patched.statusCode).toBe(200)
    expect(tooLong.statusCode).toBe(400); expect(control.statusCode).toBe(400)
    await expect(prisma.note.count({ where: { studentId } })).resolves.toBe(1)
  })

  it('publishes strict public note ingress schemas rather than anonymous bodies', async () => {
    const app = createApp(); const docs = await app.inject({ method: 'GET', url: '/documentation/json' }); await app.close()
    const schemas = docs.json().components.schemas
    const post = docs.json().paths['/api/notes'].post.requestBody.content['application/json'].schema
    const patch = docs.json().paths['/api/notes/{id}'].patch.requestBody.content['application/json'].schema
    expect(post).not.toEqual({})
    expect(patch).not.toEqual({})
    expect(post.anyOf).toHaveLength(2)
    expect(post.anyOf.every((branch: { additionalProperties?: boolean }) => branch.additionalProperties === false)).toBe(true)
    expect(JSON.stringify({ schemas, post, patch })).toContain('changedAt')
    expect(JSON.stringify({ schemas, post, patch })).toContain('class_note')
    expect(JSON.stringify({ schemas, post, patch })).toContain('maxLength')
    expect(patch.anyOf).toHaveLength(2)
    expect(patch.anyOf.every((branch: { additionalProperties?: boolean; required?: string[] }) => branch.additionalProperties === false && (branch.required?.includes('changedAt') || branch.required?.includes('updatedAt')))).toBe(true)
  })

  it.each([
    ['version mismatch', { ...note('schema-version'), version: 2, versions: [] }],
    ['missing answer question', { ...note('schema-answer'), questionBlocks: [], answerBlocks: [{ id: 'a', questionId: 'missing', text: 'answer' }] }],
  ])('direct noteCreateSchema rejects %s', (_label, invalid) => expect(noteCreateSchema.safeParse(invalid).success).toBe(false))

  it('rejects an enumerable accessor without invoking it', () => {
    let calls = 0
    const value = note('schema-accessor')
    Object.defineProperty(value, 'title', { enumerable: true, get: () => { calls += 1; return 'unsafe' } })
    expect(noteCreateSchema.safeParse(value).success).toBe(false)
    expect(calls).toBe(0)
  })

  it('migrates a valid legacy note once during GET without touching a different student', async () => {
    await insertStudent(); await insertStudent(otherStudentId)
    const legacy = note('legacy-note')
    const otherLegacy = note('other-legacy')
    await prisma.note.createMany({ data: [
      { id: legacy.id, studentId, version: 1, updatedAtValue: new Date(legacy.updatedAt), payload: toInputJson(legacy) },
      { id: otherLegacy.id, studentId: otherStudentId, version: 1, updatedAtValue: new Date(otherLegacy.updatedAt), payload: toInputJson(otherLegacy) },
    ] })
    const app = createApp()
    const first = await app.inject({ method: 'GET', url: '/api/notes' })
    const afterFirst = await prisma.note.findUnique({ where: { studentId_id: { studentId, id: legacy.id } } })
    const second = await app.inject({ method: 'GET', url: '/api/notes' })
    const afterSecond = await prisma.note.findUnique({ where: { studentId_id: { studentId, id: legacy.id } } })
    const other = await prisma.note.findUnique({ where: { studentId_id: { studentId: otherStudentId, id: otherLegacy.id } } })
    await app.close()
    expect(first.statusCode).toBe(200); expect(second.statusCode).toBe(200)
    expect(afterFirst?.payload).toEqual({ ...legacy, version: 1, versions: [] })
    expect(afterSecond).toEqual(afterFirst)
    expect(other?.payload).toEqual(otherLegacy)
  })
})
