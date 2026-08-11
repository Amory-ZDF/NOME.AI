import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../../src/app.js'
import { parseEnv } from '../../src/config/env.js'
import { toInputJson } from '../../src/db/json.js'
import { createTestPrisma, resetDatabase } from '../helpers/database.js'

const prisma = createTestPrisma()
const studentId = 'envelope-student'
const otherId = 'envelope-other'
const secret = 'PRIVATE_SQL_PATH_AND_SECRET'

function app(student = studentId, loggerStream?: { write(message: string): void }) {
  return buildApp({
    env: parseEnv({ NODE_ENV: 'test', DATABASE_URL: 'file:./prisma/test.db', STUDENT_ID: student, CORS_ORIGINS: 'https://student.example.com', LOG_LEVEL: loggerStream === undefined ? 'silent' : 'warn' }),
    prisma, ...(loggerStream === undefined ? {} : { loggerStream }),
  })
}

function errorBody(response: { json(): unknown }) {
  return response.json() as { code: string; message: string; data: unknown }
}

function expectFailure(response: { statusCode: number; json(): unknown; headers?: Record<string, unknown> }, status: number, code: string, message: string) {
  expect(response.statusCode).toBe(status)
  expect(errorBody(response)).toEqual({ code, message, data: null })
  expect(`${JSON.stringify(response.json())}${JSON.stringify(response.headers ?? {})}`).not.toMatch(/stack|sqlite|prisma|PRIVATE_SQL_PATH_AND_SECRET|C:\\|select\s/i)
}

async function insertStudent(id = studentId) {
  await prisma.student.create({ data: {
    id, name: id, avatar: null, joinedDays: 1, gradeInfo: 'Year 12',
    greeting: toInputJson({ message: 'Hello', fallback: 'Hello' }),
    moduleStats: toInputJson({ notesCount: 0, weeklyExercises: 0, latestAccuracy: 0, pendingErrorReview: 0 }),
    learningSummary: toInputJson({ overallMastery: 0, weeklyCompleted: 0, weeklyTotal: 0, overdueTasks: 0, weakTopics: [], knowledgeHeatmap: [] }),
  } })
}

async function durableSnapshot() {
  const [students, tasks, adjustments, sets, sessions, errors, notes, folders, jobs, settings] = await Promise.all([
    prisma.student.findMany({ orderBy: { id: 'asc' } }), prisma.task.findMany({ orderBy: [{ studentId: 'asc' }, { id: 'asc' }] }), prisma.taskAdjustment.findMany({ orderBy: [{ studentId: 'asc' }, { id: 'asc' }] }),
    prisma.exerciseSet.findMany({ orderBy: [{ studentId: 'asc' }, { id: 'asc' }] }), prisma.session.findMany({ orderBy: [{ studentId: 'asc' }, { id: 'asc' }] }), prisma.errorItem.findMany({ orderBy: [{ studentId: 'asc' }, { id: 'asc' }] }),
    prisma.note.findMany({ orderBy: [{ studentId: 'asc' }, { id: 'asc' }] }), prisma.noteFolder.findMany({ orderBy: [{ studentId: 'asc' }, { id: 'asc' }] }), prisma.materialUploadJob.findMany({ orderBy: [{ studentId: 'asc' }, { id: 'asc' }] }), prisma.studentSettings.findMany({ orderBy: { studentId: 'asc' } }),
  ])
  return JSON.stringify({ students, tasks, adjustments, sets, sessions, errors, notes, folders, jobs, settings })
}

beforeEach(async () => resetDatabase(prisma))
afterAll(async () => { await resetDatabase(prisma); await prisma.$disconnect() })

describe('public error envelope and raw-router contract', () => {
  it.each([
    ['empty JSON', '', { 'content-type': 'application/json', 'content-length': '0' }, 400, 'INVALID_INPUT', 'Invalid request'],
    ['truncated JSON', '{', { 'content-type': 'application/json' }, 400, 'INVALID_INPUT', 'Invalid request'],
    ['invalid content length', '{}', { 'content-type': 'application/json', 'content-length': '100' }, 400, 'INVALID_INPUT', 'Invalid request'],
    ['unsupported media', '<task/>', { 'content-type': 'application/xml' }, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Unsupported media type'],
    ['oversized JSON', JSON.stringify({ title: 'x'.repeat(1_100_000) }), { 'content-type': 'application/json' }, 413, 'PAYLOAD_TOO_LARGE', 'Payload too large'],
  ])('maps %s without a write or leaked details', async (_case, payload, headers, status, code, message) => {
    const server = app()
    try {
      const before = await durableSnapshot()
      const response = await server.inject({ method: 'POST', url: '/api/tasks', headers, payload })
      expectFailure(response, status, code, message)
      expect(await durableSnapshot()).toBe(before)
    } finally { await server.close() }
  })

  it('rejects strict unknown fields, malformed path targets, missing ids, and cross-student ids with one safe envelope', async () => {
    await insertStudent()
    await insertStudent(otherId)
    await prisma.note.create({ data: { id: 'only-other', studentId: otherId, version: 1, updatedAtValue: new Date('2026-08-11T00:00:00.000Z'), payload: toInputJson({ id: 'only-other', title: 'Other', folderId: null, folderPath: null, tags: [], linkedTopics: [], linkedErrors: [], source: 'typed', createdAt: '2026-08-11', updatedAt: '2026-08-11', content: [{ t: 'p', v: 'Other' }], aiSuggestions: [], version: 1, versions: [] }) } })
    const server = app()
    try {
      const before = await durableSnapshot()
      const unknown = await server.inject({ method: 'PATCH', url: '/api/student/settings', payload: { unknown: true } })
      const missing = await server.inject({ method: 'PATCH', url: '/api/notes/missing', payload: { title: 'no', changedAt: '2026-08-11', reason: 'no' } })
      const cross = await server.inject({ method: 'PATCH', url: '/api/notes/only-other', payload: { title: 'no', changedAt: '2026-08-11', reason: 'no' } })
      const tooLong = await server.inject({ method: 'POST', url: `/api/material-uploads/${'x'.repeat(101)}/confirm`, payload: {} })
      const badUrl = await server.inject({ method: 'GET', url: '/api/exercise-sets/%E0%A4%A' })
      expectFailure(unknown, 400, 'INVALID_INPUT', 'Invalid request')
      expectFailure(missing, 404, 'NOT_FOUND', 'Note not found')
      expectFailure(cross, 404, 'NOT_FOUND', 'Note not found')
      expectFailure(tooLong, 400, 'INVALID_INPUT', 'Invalid request')
      expectFailure(badUrl, 400, 'INVALID_INPUT', 'Invalid request')
      expect(await durableSnapshot()).toBe(before)
      await expect(prisma.note.findUnique({ where: { studentId_id: { studentId: otherId, id: 'only-other' } } })).resolves.toMatchObject({ payload: { title: 'Other' } })
    } finally { await server.close() }
  })

  it('maps stored corruption and injected unexpected exceptions to private stable failures', async () => {
    await insertStudent()
    await prisma.task.create({ data: { id: 'corrupt', studentId, type: 'teacher_assigned', status: 'pending', dueAt: null, payload: toInputJson({ id: 'corrupt', title: secret }) } })
    const logs: string[] = []
    const server = app(studentId, { write: (line) => logs.push(line) })
    server.get('/contract-unexpected', async () => { throw new Error(secret) })
    try {
      const before = await durableSnapshot()
      const corrupt = await server.inject({ method: 'GET', url: '/api/student/bootstrap' })
      const unexpected = await server.inject({ method: 'GET', url: '/contract-unexpected' })
      expectFailure(corrupt, 500, 'STORED_DATA_INVALID', 'Stored student data is invalid')
      expectFailure(unexpected, 500, 'INTERNAL_ERROR', 'Internal server error')
      expect(JSON.stringify(logs)).toContain(secret)
      expect(await durableSnapshot()).toBe(before)
    } finally { await server.close() }
  })

  it('keeps CORS narrow while raw-router failures have the same JSON-only public envelope', async () => {
    const server = app()
    try {
      const before = await durableSnapshot()
      const configured = await server.inject({ method: 'GET', url: '/health', headers: { origin: 'https://student.example.com' } })
      const attacker = await server.inject({ method: 'GET', url: '/health', headers: { origin: 'https://attacker.example.com' } })
      const raw = await server.inject({ method: 'GET', url: '/api/exercise-sets/%E0%A4%A', headers: { origin: 'https://attacker.example.com', authorization: `Bearer ${secret}` } })
      expect(configured.headers['access-control-allow-origin']).toBe('https://student.example.com')
      expect(attacker.headers['access-control-allow-origin']).toBeUndefined()
      expect(raw.headers['access-control-allow-origin']).toBeUndefined()
      expect(raw.headers['content-type']).toContain('application/json')
      expectFailure(raw, 400, 'INVALID_INPUT', 'Invalid request')
      expect(await durableSnapshot()).toBe(before)
    } finally { await server.close() }
  })
})
