import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../../src/app.js'
import { parseEnv } from '../../src/config/env.js'
import { toInputJson } from '../../src/db/json.js'
import {
  createTestPrisma,
  holdStudentWriteLock,
  resetDatabase,
  TEST_DATABASE_URL,
} from '../helpers/database.js'

const prisma = createTestPrisma()
const studentId = 'material-confirm-student'
const otherStudentId = 'material-confirm-other'
const createdAt = '2026-08-11T10:00:00.000Z'
const updatedAt = '2026-08-11T12:00:00.000Z'

function storedResult(overrides: Record<string, unknown> = {}) {
  return {
    suggestedTitle: 'Stored calculus notes', materialType: 'class_note', examBoard: 'Cambridge',
    subject: 'Mathematics', chapter: 'Differentiation', folderId: 'folder-stored',
    folderPath: 'A-Level / Mathematics', questionBlocks: [{ id: 'q1', label: 'Question 1', text: 'Find dy/dx' }],
    answerBlocks: [{ id: 'a1', questionId: 'q1', text: 'Differentiate' }],
    content: [{ t: 'h', v: 'Differentiation' }, { t: 'p', v: 'Use the power rule.' }],
    linkedTopics: ['topic-derivatives'], linkedErrors: ['error-power-rule'], confidence: 0.8,
    ...overrides,
  }
}

function confirmationJob(overrides: Record<string, unknown> = {}) {
  const job = {
    id: 'material-confirm-1', fileName: 'calculus.pdf', mimeType: 'application/pdf', size: 20,
    materialType: 'class_note', examBoard: 'Initial board', subject: 'Initial subject', chapter: 'Initial chapter',
    createdAt, updatedAt, progress: 100, status: 'needs_confirmation', result: storedResult(), ...overrides,
  }
  return Object.fromEntries(Object.entries(job).filter(([, value]) => value !== undefined))
}

function appFor(id = studentId, prismaClient = prisma) {
  return buildApp({
    env: parseEnv({ NODE_ENV: 'test', DATABASE_URL: TEST_DATABASE_URL, STUDENT_ID: id, LOG_LEVEL: 'silent' }),
    prisma: prismaClient,
    now: () => new Date('2026-08-11T13:00:00.000Z'),
  })
}

async function insertStudent(id = studentId) {
  await prisma.student.create({ data: {
    id, name: id, avatar: null, joinedDays: 1, gradeInfo: 'A-Level',
    greeting: toInputJson({ message: 'Hello', fallback: 'Welcome' }),
    moduleStats: toInputJson({ notesCount: 0, weeklyExercises: 0, latestAccuracy: 0, pendingErrorReview: 0 }),
    learningSummary: toInputJson({ overallMastery: 0, weeklyCompleted: 0, weeklyTotal: 0, overdueTasks: 0, weakTopics: [], knowledgeHeatmap: [] }),
  } })
}

async function insertJob(id = studentId, input = confirmationJob()) {
  await prisma.materialUploadJob.create({ data: {
    id: String(input.id), studentId: id, status: String(input.status),
    createdAtValue: new Date(String(input.createdAt)), payload: toInputJson(input),
  } })
}

async function insertNote(id: string, sourceJobId = 'unrelated-job') {
  const note = {
    id, title: 'Existing note', folderId: null, folderPath: null, tags: [], linkedTopics: [], linkedErrors: [],
    source: 'typed', createdAt, updatedAt, content: [{ t: 'p', v: 'Existing content' }], aiSuggestions: [],
    sourceJobId, version: 1, versions: [],
  }
  await prisma.note.create({ data: {
    id, studentId, version: 1, updatedAtValue: new Date(updatedAt), payload: toInputJson(note),
  } })
}

async function readJob(id = 'material-confirm-1', owner = studentId) {
  return prisma.materialUploadJob.findUnique({ where: { studentId_id: { studentId: owner, id } } })
}

beforeEach(async () => resetDatabase(prisma))
afterAll(async () => { await resetDatabase(prisma); await prisma.$disconnect() })

describe('POST /api/material-uploads/:id/confirm', () => {
  it('merges a strict partial result, creates its deterministic provenance note, and completes atomically', async () => {
    await insertStudent(); await insertJob()
    const app = appFor()
    const response = await app.inject({ method: 'POST', url: '/api/material-uploads/material-confirm-1/confirm', payload: {
      suggestedTitle: 'Confirmed calculus notes', materialType: 'handwritten_draft', folderId: 'folder-confirmed',
      folderPath: 'A-Level / Calculus', linkedTopics: ['topic-confirmed'], confidence: 1,
    } })
    await app.close()

    const merged = storedResult({
      suggestedTitle: 'Confirmed calculus notes', materialType: 'handwritten_draft', folderId: 'folder-confirmed',
      folderPath: 'A-Level / Calculus', linkedTopics: ['topic-confirmed'], confidence: 1,
    })
    const expectedJob = confirmationJob({
      materialType: 'handwritten_draft', examBoard: merged.examBoard, subject: merged.subject, chapter: merged.chapter,
      folderId: merged.folderId, folderPath: merged.folderPath, status: 'completed', progress: 100, result: merged,
    })
    const expectedNote = {
      id: 'note-material-confirm-1', title: merged.suggestedTitle, materialType: merged.materialType,
      examBoard: merged.examBoard, subject: merged.subject, chapter: merged.chapter, folderId: merged.folderId,
      folderPath: merged.folderPath, tags: [], questionBlocks: merged.questionBlocks, answerBlocks: merged.answerBlocks,
      content: merged.content, linkedTopics: merged.linkedTopics, linkedErrors: merged.linkedErrors, aiSuggestions: [],
      sourceJobId: 'material-confirm-1', source: 'handwritten', createdAt, updatedAt, version: 1, versions: [],
    }
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ code: 0, message: 'ok', data: { job: expectedJob, note: expectedNote } })
    expect(await readJob()).toMatchObject({ status: 'completed', payload: expectedJob })
    await expect(prisma.note.findUnique({ where: { studentId_id: { studentId, id: expectedNote.id } } }))
      .resolves.toMatchObject({ version: 1, updatedAtValue: new Date(updatedAt), payload: expectedNote })
  })

  it('uses the stored strict result for an empty partial patch without generating any fields', async () => {
    await insertStudent(); await insertJob()
    const app = appFor()
    const response = await app.inject({ method: 'POST', url: '/api/material-uploads/material-confirm-1/confirm', payload: {} })
    await app.close()
    expect(response.statusCode).toBe(200)
    expect(response.json().data.job.result).toEqual(storedResult())
    expect(response.json().data.note.title).toBe('Stored calculus notes')
  })

  it.each([
    [{ unknown: true }], [{ suggestedTitle: 'raw:secret' }], [{ confidence: 2 }],
    [{ content: [] }], [{ answerBlocks: [{ id: 'a2', questionId: 'unknown', text: 'No' }] }],
    [{ questionBlocks: [{ id: 'duplicate', label: 'A', text: 'A' }, { id: 'duplicate', label: 'B', text: 'B' }] }],
  ])('rejects an unsafe or invalid partial patch before writing %#', async (patch) => {
    await insertStudent(); await insertJob()
    const before = await readJob(); const app = appFor()
    const response = await app.inject({ method: 'POST', url: '/api/material-uploads/material-confirm-1/confirm', payload: patch })
    await app.close()
    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({ code: 'INVALID_CLASSIFICATION_PATCH', message: 'Classification patch contains invalid fields', data: null })
    expect(await readJob()).toEqual(before)
    await expect(prisma.note.count({ where: { studentId } })).resolves.toBe(0)
  })

  it('rolls back both sides when the deterministic note already exists', async () => {
    await insertStudent(); await insertJob(); await insertNote('note-material-confirm-1')
    const before = await readJob(); const app = appFor()
    const response = await app.inject({ method: 'POST', url: '/api/material-uploads/material-confirm-1/confirm', payload: {} })
    await app.close()
    expect(response.statusCode).toBe(409)
    expect(response.json()).toEqual({ code: 'DUPLICATE_ID', message: 'Note id already exists', data: null })
    expect(await readJob()).toEqual(before)
    await expect(prisma.note.count({ where: { studentId } })).resolves.toBe(1)
  })

  it.each([
    ['queued', confirmationJob({ status: 'queued', progress: 0, result: undefined }), 'INVALID_JOB_STATE'],
    ['cancelled', confirmationJob({ status: 'cancelled', result: undefined }), 'UPLOAD_CANCELLED'],
    ['completed', confirmationJob({ status: 'completed' }), 'UPLOAD_ALREADY_COMPLETED'],
  ])('rejects %s lifecycle conflicts without mutation', async (_state, input, code) => {
    await insertStudent(); await insertJob(studentId, input); const before = await readJob(); const app = appFor()
    const response = await app.inject({ method: 'POST', url: '/api/material-uploads/material-confirm-1/confirm', payload: {} })
    await app.close()
    expect(response.statusCode).toBe(409)
    expect(response.json()).toMatchObject({ code, data: null })
    expect(await readJob()).toEqual(before)
    await expect(prisma.note.count()).resolves.toBe(0)
  })

  it('keeps missing and cross-student jobs invisible', async () => {
    await insertStudent(); await insertStudent(otherStudentId); await insertJob(otherStudentId, confirmationJob({ id: 'other-only' }))
    const app = appFor()
    const [missing, cross] = await Promise.all([
      app.inject({ method: 'POST', url: '/api/material-uploads/missing/confirm', payload: {} }),
      app.inject({ method: 'POST', url: '/api/material-uploads/other-only/confirm', payload: {} }),
    ])
    await app.close()
    expect(missing.json()).toMatchObject({ code: 'NOT_FOUND' }); expect(cross.json()).toMatchObject({ code: 'NOT_FOUND' })
    expect(await readJob('other-only', otherStudentId)).toMatchObject({ status: 'needs_confirmation' })
  })

  it('fails safely on corrupt stored classification data and rolls back', async () => {
    await insertStudent()
    await prisma.materialUploadJob.create({ data: {
      id: 'corrupt', studentId, status: 'needs_confirmation', createdAtValue: new Date(createdAt),
      payload: toInputJson(confirmationJob({ id: 'corrupt', result: { suggestedTitle: 'incomplete' } })),
    } })
    const app = appFor()
    const response = await app.inject({ method: 'POST', url: '/api/material-uploads/corrupt/confirm', payload: {} })
    await app.close()
    expect(response.statusCode).toBe(500)
    expect(response.json()).toEqual({ code: 'STORED_DATA_INVALID', message: 'Stored student data is invalid', data: null })
    await expect(prisma.note.count()).resolves.toBe(0)
  })

  it('allows exactly one concurrent confirmation and leaves one complete job plus one note', async () => {
    await insertStudent(); await insertJob(); const app = appFor()
    const responses = await Promise.all([
      app.inject({ method: 'POST', url: '/api/material-uploads/material-confirm-1/confirm', payload: {} }),
      app.inject({ method: 'POST', url: '/api/material-uploads/material-confirm-1/confirm', payload: {} }),
    ])
    await app.close()
    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 409])
    expect(responses.find((response) => response.statusCode === 409)?.json()).toMatchObject({ code: 'UPLOAD_ALREADY_COMPLETED' })
    expect(await readJob()).toMatchObject({ status: 'completed' })
    await expect(prisma.note.count({ where: { studentId } })).resolves.toBe(1)
  })

  it('retries a real SQLite write lock while preserving the one-transaction invariant', { timeout: 15_000 }, async () => {
    await insertStudent(); await insertJob()
    const firstClient = createTestPrisma(); const blocker = createTestPrisma(); const app = appFor(studentId, firstClient)
    const release = await holdStudentWriteLock(blocker, studentId, 125)
    try {
      const response = await app.inject({ method: 'POST', url: '/api/material-uploads/material-confirm-1/confirm', payload: {} })
      expect(response.statusCode).toBe(200)
      expect(await readJob()).toMatchObject({ status: 'completed' })
      await expect(prisma.note.count({ where: { studentId } })).resolves.toBe(1)
    } finally {
      await release(); await app.close(); await firstClient.$disconnect(); await blocker.$disconnect()
    }
  })

  it('keeps transport boundaries strict and publishes only confirmation, not agent routes', async () => {
    const app = appFor()
    const tooLong = await app.inject({ method: 'POST', url: `/api/material-uploads/${'x'.repeat(101)}/confirm`, payload: {} })
    const control = await app.inject({ method: 'POST', url: '/api/material-uploads/a%00b/confirm', payload: {} })
    const unsupported = await app.inject({ method: 'POST', url: '/api/material-uploads/material-confirm-1/confirm', headers: { 'content-type': 'application/xml' }, payload: '<confirmation />' })
    const tooLarge = await app.inject({ method: 'POST', url: '/api/material-uploads/material-confirm-1/confirm', payload: { suggestedTitle: 'x'.repeat(1_100_000) } })
    const process = await app.inject({ method: 'POST', url: '/api/material-uploads/material-confirm-1/process' })
    const docs = await app.inject({ method: 'GET', url: '/documentation/json' })
    await app.close()
    expect(tooLong.json()).toMatchObject({ code: 'INVALID_INPUT' }); expect(control.json()).toMatchObject({ code: 'INVALID_INPUT' })
    expect(unsupported.statusCode).toBe(415); expect(tooLarge.statusCode).toBe(413); expect(process.statusCode).toBe(404)
    expect(Object.keys(docs.json().paths['/api/material-uploads/{id}/confirm'].post.responses).sort())
      .toEqual(['200', '400', '404', '409', '413', '415', '500'])
  })
})
