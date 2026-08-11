import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildApp } from '../../src/app.js'
import { parseEnv } from '../../src/config/env.js'
import { toInputJson } from '../../src/db/json.js'
import { createTestPrisma, holdStudentWriteLock, resetDatabase, TEST_DATABASE_URL } from '../helpers/database.js'

const prisma = createTestPrisma()
const studentId = 'material-cancel-student'
const otherStudentId = 'material-cancel-other'
const createdAt = '2026-08-11T10:00:00.000Z'
const updatedAt = '2026-08-11T12:00:00.000Z'

function classificationResult() {
  return {
    suggestedTitle: 'Calculus notes', materialType: 'class_note', examBoard: 'Cambridge', subject: 'Mathematics', chapter: 'Calculus', folderId: 'folder-calculus', folderPath: 'A-Level / Calculus',
    questionBlocks: [], answerBlocks: [], content: [{ t: 'p', v: 'Notes' }], linkedTopics: [], linkedErrors: [], confidence: 1,
  }
}

function job(overrides: Record<string, unknown> = {}) {
  return { id: 'material-cancel-1', fileName: 'notes.pdf', mimeType: 'application/pdf', size: 20, materialType: 'class_note', createdAt, updatedAt: createdAt, progress: 0, status: 'queued', ...overrides }
}
async function insertStudent(id = studentId) {
  await prisma.student.create({ data: { id, name: id, avatar: null, joinedDays: 1, gradeInfo: 'A-Level', greeting: toInputJson({ message: 'Hello', fallback: 'Welcome' }), moduleStats: toInputJson({ notesCount: 0, weeklyExercises: 0, latestAccuracy: 0, pendingErrorReview: 0 }), learningSummary: toInputJson({ overallMastery: 0, weeklyCompleted: 0, weeklyTotal: 0, overdueTasks: 0, weakTopics: [], knowledgeHeatmap: [] }) } })
}
async function insertJob(id = studentId, input = job()) {
  await prisma.materialUploadJob.create({ data: { id: String(input.id), studentId: id, status: String(input.status), createdAtValue: new Date(String(input.createdAt)), payload: toInputJson(input) } })
}
function appFor(id = studentId, now: () => Date = () => new Date(updatedAt), prismaClient = prisma) {
  return buildApp({ env: parseEnv({ NODE_ENV: 'test', DATABASE_URL: TEST_DATABASE_URL, STUDENT_ID: id, LOG_LEVEL: 'silent' }), prisma: prismaClient, now })
}
async function stored(id = studentId, materialId = 'material-cancel-1') { return prisma.materialUploadJob.findUnique({ where: { studentId_id: { studentId: id, id: materialId } } }) }

beforeEach(async () => resetDatabase(prisma))
afterAll(async () => { await resetDatabase(prisma); await prisma.$disconnect() })

describe('POST /api/material-uploads/:id/cancel', () => {
  it.each([
    ['queued', job()],
    ['processing', job({ status: 'processing', progress: 10 })],
    ['failed', job({ status: 'failed', progress: 10, failure: { code: 'FAILED', message: 'Nope' } })],
    ['needs_confirmation', job({ status: 'needs_confirmation', progress: 100, result: classificationResult() })],
  ])('transitions %s to a terminal metadata-only cancelled job', async (_status, original) => {
    await insertStudent(); await insertJob(studentId, original)
    const app = appFor()
    const response = await app.inject({ method: 'POST', url: '/api/material-uploads/material-cancel-1/cancel' })
    await app.close()
    const expected: Record<string, unknown> = { ...original }
    delete expected.failure
    delete expected.result
    expect(response.statusCode).toBe(200)
    expect(response.json().data.job).toEqual({ ...expected, status: 'cancelled', updatedAt })
    expect(response.json().data.job).not.toHaveProperty('failure')
    expect(response.json().data.job).not.toHaveProperty('result')
    expect(await stored()).toMatchObject({ status: 'cancelled', payload: response.json().data.job })
  })

  it('is idempotent for cancelled jobs and never rewrites timestamps or calls its clock', async () => {
    await insertStudent(); await insertJob(studentId, job({ status: 'cancelled', updatedAt: createdAt }))
    const now = vi.fn(() => new Date(updatedAt)); const app = appFor(studentId, now)
    const response = await app.inject({ method: 'POST', url: '/api/material-uploads/material-cancel-1/cancel' })
    await app.close()
    expect(response.statusCode).toBe(200)
    expect(response.json().data.job).toEqual(job({ status: 'cancelled', updatedAt: createdAt }))
    expect(now).not.toHaveBeenCalled()
  })

  it.each([null, 'unexpected', { reason: 'unexpected' }])('rejects a cancel body %j without mutating the job', async (payload) => {
    await insertStudent(); await insertJob()
    const app = appFor()
    const response = await app.inject({ method: 'POST', url: '/api/material-uploads/material-cancel-1/cancel', headers: { 'content-type': 'application/json' }, payload: payload as never })
    await app.close()
    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({ code: 'INVALID_INPUT', message: 'Invalid request', data: null })
    expect(await stored()).toMatchObject({ status: 'queued', payload: job() })
  })

  it('rejects completed cancellation, missing ids, and cross-student ids without mutation', async () => {
    await insertStudent(); await insertStudent(otherStudentId)
    await insertJob(studentId, job({ status: 'completed', progress: 100, result: classificationResult() }))
    await insertJob(otherStudentId, job({ id: 'other-only', status: 'queued' }))
    const app = appFor()
    const completed = await app.inject({ method: 'POST', url: '/api/material-uploads/material-cancel-1/cancel' })
    const missing = await app.inject({ method: 'POST', url: '/api/material-uploads/missing/cancel' })
    const cross = await app.inject({ method: 'POST', url: '/api/material-uploads/other-only/cancel' })
    await app.close()
    expect(completed.json()).toMatchObject({ code: 'UPLOAD_ALREADY_COMPLETED' })
    expect(missing.json()).toMatchObject({ code: 'NOT_FOUND' })
    expect(cross.json()).toMatchObject({ code: 'NOT_FOUND' })
    expect(await stored(otherStudentId, 'other-only')).toMatchObject({ status: 'queued' })
  })

  it('rejects malformed stored payloads and scalar mismatch safely without exposing details', async () => {
    await insertStudent()
    await prisma.materialUploadJob.create({ data: { id: 'corrupt', studentId, status: 'queued', createdAtValue: new Date(createdAt), payload: toInputJson({ id: 'corrupt', status: 'queued' }) } })
    await prisma.materialUploadJob.create({ data: { id: 'mismatch', studentId, status: 'processing', createdAtValue: new Date(createdAt), payload: toInputJson(job({ id: 'mismatch', status: 'queued' })) } })
    const app = appFor()
    for (const id of ['corrupt', 'mismatch']) {
      const response = await app.inject({ method: 'POST', url: `/api/material-uploads/${id}/cancel` })
      expect(response.statusCode).toBe(500)
      expect(response.json()).toEqual({ code: 'STORED_DATA_INVALID', message: 'Stored student data is invalid', data: null })
    }
    await app.close()
  })

  it('serializes concurrent cancellation attempts without lost removal of state-only data', async () => {
    await insertStudent(); await insertJob(studentId, job({ status: 'failed', failure: { code: 'FAILED', message: 'Nope' } }))
    const app = appFor()
    const responses = await Promise.all([
      app.inject({ method: 'POST', url: '/api/material-uploads/material-cancel-1/cancel' }),
      app.inject({ method: 'POST', url: '/api/material-uploads/material-cancel-1/cancel' }),
    ])
    await app.close()
    expect(responses.map((response) => response.statusCode)).toEqual([200, 200])
    expect(responses.every((response) => response.json().data.job.status === 'cancelled')).toBe(true)
    expect(await stored()).toMatchObject({ status: 'cancelled', payload: expect.not.objectContaining({ failure: expect.anything() }) })
  })

  it('retries a real SQLite lock and makes concurrent cancellation idempotent', { timeout: 15_000 }, async () => {
    await insertStudent(); await insertJob()
    const firstClient = createTestPrisma(); const secondClient = createTestPrisma(); const blocker = createTestPrisma()
    const firstApp = appFor(studentId, () => new Date(updatedAt), firstClient)
    const secondApp = appFor(studentId, () => new Date(updatedAt), secondClient)
    const release = await holdStudentWriteLock(blocker, studentId, 125)
    try {
      const [first, second] = await Promise.all([
        firstApp.inject({ method: 'POST', url: '/api/material-uploads/material-cancel-1/cancel' }),
        secondApp.inject({ method: 'POST', url: '/api/material-uploads/material-cancel-1/cancel' }),
      ])
      expect([first.statusCode, second.statusCode]).toEqual([200, 200])
      expect(await stored()).toMatchObject({ status: 'cancelled' })
    } finally {
      await release(); await firstApp.close(); await secondApp.close(); await firstClient.$disconnect(); await secondClient.$disconnect(); await blocker.$disconnect()
    }
  })

  it('validates identifier limits and documents cancellation responses', async () => {
    const app = appFor()
    const tooLong = await app.inject({ method: 'POST', url: `/api/material-uploads/${'x'.repeat(101)}/cancel` })
    const control = await app.inject({ method: 'POST', url: '/api/material-uploads/a%00b/cancel' })
    const docs = await app.inject({ method: 'GET', url: '/documentation/json' })
    await app.close()
    expect(tooLong.json()).toMatchObject({ code: 'INVALID_INPUT' })
    expect(control.json()).toMatchObject({ code: 'INVALID_INPUT' })
    expect(Object.keys(docs.json().paths['/api/material-uploads/{id}/cancel'].post.responses).sort()).toEqual(['200', '400', '404', '409', '413', '415', '500'])
  })
})
