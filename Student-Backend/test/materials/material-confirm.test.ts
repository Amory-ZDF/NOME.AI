import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ZodError } from 'zod'

import { buildApp } from '../../src/app.js'
import { parseEnv } from '../../src/config/env.js'
import { toInputJson } from '../../src/db/json.js'
import { MaterialService } from '../../src/modules/materials/material.service.js'
import { AppError } from '../../src/common/errors/app-error.js'
import { Prisma } from '../../src/generated/prisma/client.js'
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

async function durableSnapshot() {
  const [students, tasks, adjustments, exerciseSets, sessions, errors, notes, folders, jobs, settings] = await Promise.all([
    prisma.student.findMany({ orderBy: { id: 'asc' } }), prisma.task.findMany({ orderBy: [{ studentId: 'asc' }, { id: 'asc' }] }),
    prisma.taskAdjustment.findMany({ orderBy: [{ studentId: 'asc' }, { id: 'asc' }] }), prisma.exerciseSet.findMany({ orderBy: [{ studentId: 'asc' }, { id: 'asc' }] }),
    prisma.session.findMany({ orderBy: [{ studentId: 'asc' }, { id: 'asc' }] }), prisma.errorItem.findMany({ orderBy: [{ studentId: 'asc' }, { id: 'asc' }] }),
    prisma.note.findMany({ orderBy: [{ studentId: 'asc' }, { id: 'asc' }] }), prisma.noteFolder.findMany({ orderBy: [{ studentId: 'asc' }, { id: 'asc' }] }),
    prisma.materialUploadJob.findMany({ orderBy: [{ studentId: 'asc' }, { id: 'asc' }] }), prisma.studentSettings.findMany({ orderBy: { studentId: 'asc' } }),
  ])
  return JSON.stringify({ students, tasks, adjustments, exerciseSets, sessions, errors, notes, folders, jobs, settings })
}

beforeEach(async () => resetDatabase(prisma))
afterAll(async () => { await resetDatabase(prisma); await prisma.$disconnect() })

describe('POST /api/material-uploads/:id/confirm', () => {
  it('keeps the deterministic derived note id reachable at 95 characters and rejects 96 before any upload write', async () => {
    await insertStudent()
    const id95 = 'u'.repeat(95)
    const id96 = 'v'.repeat(96)
    const app = appFor()
    const accepted = await app.inject({ method: 'POST', url: '/api/material-uploads', payload: {
      id: id95, fileName: 'reachable.pdf', mimeType: 'application/pdf', size: 1,
      materialType: 'class_note', createdAt,
    } })
    await prisma.materialUploadJob.update({
      where: { studentId_id: { studentId, id: id95 } },
      data: { status: 'needs_confirmation', payload: toInputJson(confirmationJob({ id: id95 })) },
    })
    const confirmed = await app.inject({ method: 'POST', url: `/api/material-uploads/${id95}/confirm`, payload: {} })
    const rejected = await app.inject({ method: 'POST', url: '/api/material-uploads', payload: {
      id: id96, fileName: 'unreachable.pdf', mimeType: 'application/pdf', size: 1,
      materialType: 'class_note', createdAt,
    } })
    await app.close()
    expect(accepted.statusCode).toBe(200)
    expect(confirmed.statusCode).toBe(200)
    expect(confirmed.json().data.note.id).toBe(`note-${id95}`)
    expect(confirmed.json().data.note.id).toHaveLength(100)
    expect(rejected.statusCode).toBe(400)
    await expect(prisma.materialUploadJob.findUnique({ where: { studentId_id: { studentId, id: id96 } } })).resolves.toBeNull()
  })

  it('treats a legacy overlong stored job id as stored corruption rather than creating a partial note', async () => {
    await insertStudent()
    const id96 = 's'.repeat(96)
    await insertJob(studentId, confirmationJob({ id: id96 }))
    const service = new MaterialService(prisma, studentId, () => new Date(updatedAt), () => 'unused')
    await expect(service.confirm(id96, {})).rejects.toMatchObject({
      status: 500, code: 'STORED_DATA_INVALID', message: 'Stored student data is invalid',
    })
    await expect(prisma.note.count()).resolves.toBe(0)
  })

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

  it('leaves every durable model byte-equivalent when persisted classification data is corrupt', async () => {
    await insertStudent()
    await prisma.materialUploadJob.create({ data: {
      id: 'corrupt-snapshot', studentId, status: 'needs_confirmation', createdAtValue: new Date(createdAt),
      payload: toInputJson(confirmationJob({ id: 'corrupt-snapshot', result: { suggestedTitle: 'incomplete' } })),
    } })
    const before = await durableSnapshot(); const app = appFor()
    const response = await app.inject({ method: 'POST', url: '/api/material-uploads/corrupt-snapshot/confirm', payload: {} })
    await app.close()
    expect(response.statusCode).toBe(500)
    expect(await durableSnapshot()).toBe(before)
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

  it('serializes different confirmation patches across independent Prisma clients without a 500 or lost winner', async () => {
    await insertStudent(); await insertJob()
    const firstClient = createTestPrisma(); const secondClient = createTestPrisma()
    const first = appFor(studentId, firstClient); const second = appFor(studentId, secondClient)
    try {
      const responses = await Promise.all([
        first.inject({ method: 'POST', url: '/api/material-uploads/material-confirm-1/confirm', payload: { suggestedTitle: 'first winner' } }),
        second.inject({ method: 'POST', url: '/api/material-uploads/material-confirm-1/confirm', payload: { suggestedTitle: 'second winner' } }),
      ])
      expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 409])
      expect(responses.every((response) => response.statusCode !== 500)).toBe(true)
      const winner = responses.find((response) => response.statusCode === 200)!.json().data
      expect((await readJob())?.status).toBe('completed')
      expect((await readJob())?.payload).toMatchObject({ result: { suggestedTitle: winner.job.result.suggestedTitle } })
      await expect(prisma.note.findUnique({ where: { studentId_id: { studentId, id: 'note-material-confirm-1' } } }))
        .resolves.toMatchObject({ payload: { title: winner.note.title } })
    } finally {
      await first.close(); await second.close(); await firstClient.$disconnect(); await secondClient.$disconnect()
    }
  })

  it.each([
    ['invalid patch', 400, async (app: ReturnType<typeof appFor>) => app.inject({ method: 'POST', url: '/api/material-uploads/material-confirm-1/confirm', payload: { unknown: true } })],
    ['wrong state', 409, async (app: ReturnType<typeof appFor>) => app.inject({ method: 'POST', url: '/api/material-uploads/material-confirm-1/confirm', payload: {} })],
    ['note collision', 409, async (app: ReturnType<typeof appFor>) => app.inject({ method: 'POST', url: '/api/material-uploads/material-confirm-1/confirm', payload: {} })],
  ])('leaves every durable model byte-equivalent after %s failure', async (name, status, action) => {
    await insertStudent()
    await insertJob(studentId, name === 'wrong state' ? confirmationJob({ status: 'queued', progress: 0, result: undefined }) : confirmationJob())
    if (name === 'note collision') await insertNote('note-material-confirm-1')
    const before = await durableSnapshot(); const app = appFor()
    const response = await action(app)
    await app.close()
    expect(response.statusCode).toBe(status)
    expect(await durableSnapshot()).toBe(before)
  })

  it.each([
    ['P1008', new Prisma.PrismaClientKnownRequestError('locked', { code: 'P1008', clientVersion: 'test' }), 5],
    ['P2034', new Prisma.PrismaClientKnownRequestError('conflict', { code: 'P2034', clientVersion: 'test' }), 5],
    ['P2028', new Prisma.PrismaClientKnownRequestError('no retry', { code: 'P2028', clientVersion: 'test' }), 1],
    ['domain', new AppError('domain', 400, 'INVALID_INPUT'), 1], ['zod', new ZodError([]), 1], ['unknown', new Error('unknown'), 1],
  ] as const)('retries confirm only for bounded transient Prisma contention: %s', async (_name, cause, calls) => {
    const transaction = vi.fn(async () => { throw cause })
    const service = new MaterialService({ $transaction: transaction } as never, studentId, () => new Date(updatedAt), () => 'unused')
    await expect(service.confirm('material-confirm-1', {})).rejects.toBe(cause)
    expect(transaction).toHaveBeenCalledTimes(calls)
  })

  it.each([
    ['handwritten_draft', 'handwritten'], ['error_photo', 'photo'], ['class_note', 'typed'],
    ['teacher_material', 'typed'], ['homework', 'typed'], ['past_paper', 'typed'],
    ['mock_paper', 'typed'], ['mark_scheme', 'typed'], ['ielts_passage', 'typed'],
    ['writing_speaking', 'typed'],
  ] as const)('maps %s confirmation provenance to %s without generating a result', async (materialType, source) => {
    await insertStudent(); await insertJob(studentId, confirmationJob({ result: storedResult({ materialType }) }))
    const app = appFor()
    const response = await app.inject({ method: 'POST', url: '/api/material-uploads/material-confirm-1/confirm', payload: {} })
    await app.close()
    expect(response.statusCode).toBe(200)
    expect(response.json().data.job.result.materialType).toBe(materialType)
    expect(response.json().data.job.materialType).toBe(materialType)
    expect(response.json().data.note.source).toBe(source)
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
    expect(unsupported.json()).toEqual({ code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Unsupported media type', data: null })
    expect(tooLarge.json()).toEqual({ code: 'PAYLOAD_TOO_LARGE', message: 'Payload too large', data: null })
    await expect(prisma.materialUploadJob.count()).resolves.toBe(0)
    await expect(prisma.note.count()).resolves.toBe(0)
    expect(Object.keys(docs.json().paths['/api/material-uploads/{id}/confirm'].post.responses).sort())
      .toEqual(['200', '400', '404', '409', '413', '415', '500'])
    const parameter = docs.json().paths['/api/material-uploads/{id}/confirm'].post.parameters[0]
    expect(parameter.schema).toMatchObject({ maxLength: 95 })
    const body = docs.json().paths['/api/material-uploads/{id}/confirm'].post.requestBody.content['application/json'].schema
    expect(body).toMatchObject({ additionalProperties: false })
    expect(body.properties.questionBlocks.items).toMatchObject({ additionalProperties: false })
    expect(body.properties.answerBlocks.items).toMatchObject({ additionalProperties: false })
  })
})
