import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { buildApp } from '../../src/app.js'
import {
  errorItemSchema,
  exerciseSetSchema,
  materialUploadJobSchema,
  noteSchema,
  sessionSchema,
  settingsSchema,
  taskAdjustmentSchema,
  taskSchema,
} from '../../src/contracts/student-contracts.js'
import { parseEnv } from '../../src/config/env.js'
import { toInputJson } from '../../src/db/json.js'
import { createTestPrisma, resetDatabase } from '../helpers/database.js'
import { sessionSummarySchema } from '../../src/modules/sessions/session-summary.js'

const prisma = createTestPrisma()
const studentId = 'contract-student'
const now = '2026-08-11T10:00:00.000Z'

function app() {
  return buildApp({
    env: parseEnv({ NODE_ENV: 'test', DATABASE_URL: 'file:./prisma/test.db', STUDENT_ID: studentId, LOG_LEVEL: 'silent' }),
    prisma,
    now: () => new Date(now),
    createId: () => 'generated-upload',
  })
}

function question(id = 'question-contract') {
  return {
    id, order: 1, type: 'calculation' as const, topic: 'Calculus', difficulty: 3,
    content: 'Solve x.', acceptKeywords: ['2'], correctDisplay: '2', errorType: 'method' as const,
    hints: [1, 2, 3, 4, 5].map((level) => ({ level: level as 1 | 2 | 3 | 4 | 5, title: `Hint ${level}`, content: `Use step ${level}` })),
  }
}

function task(id = 'task-contract') {
  return taskSchema.parse({
    id, title: 'Frontend task', type: 'teacher_assigned', subject: 'Math', estimatedMinutes: 20,
    dueAt: '2026-08-12T10:00:00.000Z', assignedBy: 'Teacher', priority: 'P1', isOverdue: false, status: 'pending',
  })
}

function errorItem(id = 'error-contract') {
  const occurredAt = '2026-08-11T09:00:00.000Z'
  return errorItemSchema.parse({
    id, questionId: 'question-contract', sessionId: null, subject: 'Math', errorType: 'method', questionSummary: 'Solve x', questionContent: 'Solve x',
    type: 'calculation', difficulty: 3, errorDescription: 'Method', relatedTopic: 'Calculus', topicId: 'calculus', whereWrong: 'Step one', whyWrong: 'Forgot rule', linkedAbility: 'Methods', hintDependency: 0,
    firstOccurredAt: occurredAt, lastOccurredAt: occurredAt, occurrences: [occurredAt], occurrenceKeys: ['manual:error-contract'], occurrenceRecords: [{ key: 'manual:error-contract', occurredAt }], repeatCount: 1,
    status: 'pending_review', studentAnswer: '1', correctAnswer: '2', analysis: 'Use the rule', acceptKeywords: ['2'], redoHistory: [], verificationVariantId: null, variantVerifiedAt: null, variantVerification: null,
  })
}

async function insertStudent() {
  await prisma.student.create({ data: {
    id: studentId, name: 'Contract Student', avatar: null, joinedDays: 1, gradeInfo: 'Year 12',
    greeting: toInputJson({ message: 'Welcome', fallback: 'Welcome' }),
    moduleStats: toInputJson({ notesCount: 0, weeklyExercises: 0, latestAccuracy: 0, pendingErrorReview: 0 }),
    learningSummary: toInputJson({ overallMastery: 0, weeklyCompleted: 0, weeklyTotal: 0, overdueTasks: 0, weakTopics: [], knowledgeHeatmap: [] }),
  } })
  await prisma.studentSettings.create({ data: { studentId, payload: toInputJson(settingsSchema.parse({
    tone: 35, dailyGoalHours: 4, reminderTask: true, reminderErrorReview: true, reminderStudyTime: false,
  })) } })
}

function expectOk(response: { statusCode: number; json(): unknown }, schema: { parse(value: unknown): unknown }) {
  expect(response.statusCode).toBe(200)
  const body = response.json() as { data: unknown }
  expect(body).toStrictEqual({ code: 0, message: 'ok', data: schema.parse(body.data) })
}

const taskEnvelope = z.strictObject({ task: taskSchema })
const settingsEnvelope = z.strictObject({ settings: settingsSchema })
const errorsEnvelope = z.strictObject({ errors: z.array(errorItemSchema) })
const noteEnvelope = z.strictObject({ note: noteSchema })
const notesEnvelope = z.strictObject({ notes: z.array(noteSchema) })
const materialEnvelope = z.strictObject({ job: materialUploadJobSchema })
const confirmationEnvelope = z.strictObject({ job: materialUploadJobSchema, note: noteSchema })

// Exact implemented/documented non-Agent inventory. Notes deliberately has no
// single-note GET or DELETE route: list/create/patch/organize/undo are complete.
const implementedRoutes = [
  ['health', '/health', 'get'], ['bootstrap', '/api/student/bootstrap', 'get'], ['settings patch', '/api/student/settings', 'patch'],
  ['task create', '/api/tasks', 'post'], ['task complete', '/api/tasks/{id}', 'patch'], ['task adjustment', '/api/tasks/{id}/adjustment-request', 'post'],
  ['task exercise read', '/api/exercise-sets/{taskId}', 'get'], ['bank exercise read', '/api/bank/exercise/{setId}', 'get'], ['session create', '/api/sessions', 'post'], ['summary read', '/api/summary/{sessionId}', 'get'],
  ['error batch', '/api/errors/batch', 'post'], ['error redo', '/api/errors/{id}/redo', 'post'], ['error verification', '/api/errors/{id}/verification', 'post'], ['error mastery', '/api/errors/{id}', 'patch'],
  ['note list', '/api/notes', 'get'], ['note create', '/api/notes', 'post'], ['note patch', '/api/notes/{id}', 'patch'], ['note organize', '/api/notes/{id}/organize', 'post'], ['note undo', '/api/notes/{id}/undo', 'post'],
  ['material create', '/api/material-uploads', 'post'], ['material cancel', '/api/material-uploads/{id}/cancel', 'post'], ['material confirm', '/api/material-uploads/{id}/confirm', 'post'],
] as const

function session() {
  return sessionSchema.parse({
    sessionId: 'session-contract', taskId: 'task-contract', taskTitle: 'Task set', subject: 'Math', completedAt: '2026-08-11T10:10:00.000Z', timeSpent: 10, timeSpentSeconds: 600,
    questions: [{ ...question(), result: { status: 'correct', attempts: [{ answer: '2', submittedAt: '2026-08-11T10:09:00.000Z', isCorrect: true }], hintsUsed: 0, solvedAtHintLevel: 0, handwritingUsed: false } }],
  })
}

beforeEach(async () => resetDatabase(prisma))
afterAll(async () => { await resetDatabase(prisma); await prisma.$disconnect() })

describe('documented non-Agent frontend contract', () => {
  it.each(implementedRoutes)('publishes the documented %s route exactly once', async (_name, path, method) => {
    const server = app()
    try {
      const document = await server.inject({ method: 'GET', url: '/documentation/json' })
      expect(document.statusCode).toBe(200)
      expect((document.json() as { paths: Record<string, Record<string, unknown>> }).paths[path]?.[method]).toBeDefined()
    } finally { await server.close() }
  })
  it('serves the documented health, bootstrap, settings, task, exercise, error, note, and material envelopes', async () => {
    await insertStudent()
    const seededTask = task()
    const seededSet = exerciseSetSchema.parse({ id: 'set-contract', taskId: seededTask.id, title: 'Task set', subject: 'Math', questions: [question()] })
    await prisma.task.create({ data: { id: seededTask.id, studentId, type: seededTask.type, status: seededTask.status, dueAt: new Date(seededTask.dueAt!), payload: toInputJson(seededTask) } })
    await prisma.exerciseSet.create({ data: { id: seededSet.id!, studentId, taskId: seededTask.id, kind: 'task', payload: toInputJson(seededSet) } })
    const server = app()
    try {
      const health = await server.inject({ method: 'GET', url: '/health' })
      expect(health.json()).toEqual({ code: 0, message: 'ok', data: { status: 'ok' } })

      const bootstrap = await server.inject({ method: 'GET', url: '/api/student/bootstrap' })
      expect(bootstrap.statusCode).toBe(200)
      expect(Object.keys((bootstrap.json() as { data: object }).data).sort()).toEqual([
        'bankExerciseSets', 'errors', 'exerciseSets', 'greeting', 'learningSummary', 'moduleStats', 'noteFolders', 'notes', 'sessions', 'settings', 'student', 'taskAdjustments', 'tasks', 'uploadJobs',
      ].sort())

      const settings = await server.inject({ method: 'PATCH', url: '/api/student/settings', payload: { dailyGoalHours: 6 } })
      expectOk(settings, settingsEnvelope)

      const createdTask = await server.inject({ method: 'POST', url: '/api/tasks', payload: task('task-created') })
      expectOk(createdTask, taskEnvelope)
      const completedTask = await server.inject({ method: 'PATCH', url: '/api/tasks/task-created', payload: { status: 'completed' } })
      expectOk(completedTask, taskEnvelope)
      const adjustment = await server.inject({ method: 'POST', url: '/api/tasks/task-contract/adjustment-request', payload: { id: 'adjustment-contract', taskId: 'task-contract', reason: 'time_conflict', details: 'Overlap', availableMinutes: 30, proposedDueAt: '2026-08-12T11:00:00.000Z', createdAt: '2026-08-11T10:00:00.000Z', status: 'submitted' } })
      expectOk(adjustment, z.strictObject({ request: taskAdjustmentSchema, task: taskSchema }))

      const exercise = await server.inject({ method: 'GET', url: '/api/exercise-sets/task-contract' })
      expectOk(exercise, exerciseSetSchema)
      const bank = exerciseSetSchema.parse({ id: 'bank-contract', taskId: null, title: 'Bank set', subject: 'Math', questions: [question('bank-question')] })
      await prisma.exerciseSet.create({ data: { id: 'bank-contract', studentId, taskId: null, kind: 'bank', payload: toInputJson(bank) } })
      expectOk(await server.inject({ method: 'GET', url: '/api/bank/exercise/bank-contract' }), exerciseSetSchema)

      const errors = await server.inject({ method: 'POST', url: '/api/errors/batch', payload: { items: [errorItem()] } })
      expectOk(errors, errorsEnvelope)

      const noteBody = noteSchema.parse({ id: 'note-contract', title: 'Frontend note', folderId: null, folderPath: null, tags: [], linkedTopics: [], linkedErrors: [], source: 'typed', createdAt: now, updatedAt: now, content: [{ t: 'p', v: 'Remember this.' }], aiSuggestions: [], version: 1, versions: [] })
      const note = await server.inject({ method: 'POST', url: '/api/notes', payload: noteBody })
      expectOk(note, noteEnvelope)
      const notes = await server.inject({ method: 'GET', url: '/api/notes' })
      expectOk(notes, notesEnvelope)

      const material = await server.inject({ method: 'POST', url: '/api/material-uploads', payload: { id: 'upload-contract', fileName: 'note.pdf', mimeType: 'application/pdf', size: 1, materialType: 'class_note', createdAt: now } })
      expectOk(material, materialEnvelope)
      const queued = (material.json() as { data: { job: Record<string, unknown> } }).data.job
      const confirmation = {
        ...queued, status: 'needs_confirmation', progress: 100, updatedAt: '2026-08-11T11:00:00.000Z',
        result: { suggestedTitle: 'Confirmed note', materialType: 'class_note', examBoard: 'Cambridge', subject: 'Math', chapter: 'Calculus', folderId: 'calculus', folderPath: 'Math/Calculus', questionBlocks: [{ id: 'q1', label: 'Q1', text: 'Solve' }], answerBlocks: [{ id: 'a1', questionId: 'q1', text: '2' }], content: [{ t: 'p', v: 'Confirmed.' }], linkedTopics: ['calculus'], linkedErrors: ['error-contract'], confidence: 1 },
      }
      await prisma.materialUploadJob.update({ where: { studentId_id: { studentId, id: 'upload-contract' } }, data: { status: 'needs_confirmation', payload: toInputJson(confirmation) } })
      expectOk(await server.inject({ method: 'POST', url: '/api/material-uploads/upload-contract/confirm', payload: {} }), confirmationEnvelope)

      const cancelledMaterial = await server.inject({ method: 'POST', url: '/api/material-uploads', payload: { id: 'upload-cancel', fileName: 'cancel.pdf', mimeType: 'application/pdf', size: 1, materialType: 'class_note', createdAt: now } })
      expectOk(cancelledMaterial, materialEnvelope)
      const cancelled = await server.inject({ method: 'POST', url: '/api/material-uploads/upload-cancel/cancel' })
      expectOk(cancelled, materialEnvelope)
    } finally {
      await server.close()
    }
  })

  it('proves the task → exercise → session → summary frontend provenance row', async () => {
    await insertStudent()
    const seededTask = task()
    const seededSet = exerciseSetSchema.parse({ id: 'set-contract', taskId: seededTask.id, title: 'Task set', subject: 'Math', questions: [question()] })
    await prisma.task.create({ data: { id: seededTask.id, studentId, type: seededTask.type, status: seededTask.status, dueAt: new Date(seededTask.dueAt!), payload: toInputJson(seededTask) } })
    await prisma.exerciseSet.create({ data: { id: 'set-contract', studentId, taskId: seededTask.id, kind: 'task', payload: toInputJson(seededSet) } })
    const server = app()
    try {
      expectOk(await server.inject({ method: 'GET', url: '/api/exercise-sets/task-contract' }), exerciseSetSchema)
      expectOk(await server.inject({ method: 'POST', url: '/api/sessions', payload: session() }), z.strictObject({ sessionId: z.literal('session-contract') }))
      expectOk(await server.inject({ method: 'GET', url: '/api/summary/session-contract' }), sessionSummarySchema)
    } finally { await server.close() }
  })

  it('proves full note CRUD, organize, and undo history rows through public requests', async () => {
    await insertStudent()
    const server = app()
    try {
      const created = noteSchema.parse({ id: 'note-history', title: 'Original', folderId: null, folderPath: null, tags: [], linkedTopics: [], linkedErrors: [], source: 'typed', createdAt: now, updatedAt: now, content: [{ t: 'p', v: 'Original' }], aiSuggestions: [{ id: 'add-tag', type: 'add_tag', tag: 'organized' }], version: 1, versions: [] })
      expectOk(await server.inject({ method: 'POST', url: '/api/notes', payload: created }), noteEnvelope)
      expectOk(await server.inject({ method: 'PATCH', url: '/api/notes/note-history', payload: { title: 'Edited', changedAt: '2026-08-11T11:00:00.000Z', reason: 'edit' } }), noteEnvelope)
      expectOk(await server.inject({ method: 'POST', url: '/api/notes/note-history/organize', payload: { suggestionIds: ['add-tag'], changedAt: '2026-08-11T12:00:00.000Z' } }), noteEnvelope)
      const undone = await server.inject({ method: 'POST', url: '/api/notes/note-history/undo', payload: { changedAt: '2026-08-11T13:00:00.000Z' } })
      expectOk(undone, noteEnvelope)
      expect((undone.json() as { data: { note: { versions: unknown[] } } }).data.note.versions).toHaveLength(3)
    } finally { await server.close() }
  })

  it('proves error recurrence → redo → verification → mastery provenance through public requests', async () => {
    await insertStudent()
    const server = app()
    try {
      const initial = errorItem('error-mastery')
      expectOk(await server.inject({ method: 'POST', url: '/api/errors/batch', payload: { items: [initial] } }), errorsEnvelope)
      const redone = await server.inject({ method: 'POST', url: '/api/errors/error-mastery/redo', payload: { attemptedAt: '2026-08-11T10:00:00.000Z', answer: '2', isCorrect: true, timeSpent: 1 } })
      expectOk(redone, z.strictObject({ error: errorItemSchema }))
      const stored = (redone.json() as { data: { error: typeof initial } }).data.error
      const variantTask = taskSchema.parse({ id: 'verification-task', title: 'Independent check', type: 'error_review', subject: 'Math', estimatedMinutes: 10, dueAt: null, assignedBy: null, priority: 'P1', isOverdue: false, status: 'pending', exerciseSetId: 'verification-set', sourceQuestionId: stored.questionId, verificationForErrorId: stored.id, reason: 'Verify', createdAt: '2026-08-11T10:01:00.000Z' })
      const variantSet = exerciseSetSchema.parse({ id: 'verification-set', taskId: variantTask.id, title: variantTask.title, subject: 'Math', sourceQuestionId: stored.questionId, createdAt: variantTask.createdAt, questions: [{ ...question('verification-question'), variantOf: stored.questionId }] })
      const awaiting = errorItemSchema.parse({ ...stored, status: 'verification_due', verificationVariantId: variantSet.id })
      await prisma.task.create({ data: { id: variantTask.id, studentId, type: variantTask.type, status: variantTask.status, dueAt: null, payload: toInputJson(variantTask) } })
      await prisma.exerciseSet.create({ data: { id: variantSet.id!, studentId, taskId: variantTask.id, kind: 'task', payload: toInputJson(variantSet) } })
      await prisma.errorItem.update({ where: { studentId_id: { studentId, id: awaiting.id } }, data: { status: awaiting.status, lastOccurredAt: new Date(awaiting.lastOccurredAt), payload: toInputJson({ storageVersion: 1, error: awaiting, occurrenceEvidenceBindings: awaiting.occurrenceRecords.map(({ key, occurredAt }) => ({ key, occurredAt, fingerprint: '0'.repeat(64) })) }) } })
      expectOk(await server.inject({ method: 'POST', url: '/api/errors/error-mastery/verification', payload: { variantId: 'verification-set', isCorrect: true, verifiedAt: '2026-08-11T10:02:00.000Z' } }), z.strictObject({ error: errorItemSchema }))
      const mastered = await server.inject({ method: 'PATCH', url: '/api/errors/error-mastery', payload: { status: 'mastered' } })
      expectOk(mastered, z.strictObject({ error: errorItemSchema }))
      expect((mastered.json() as { data: { error: { status: string } } }).data.error.status).toBe('mastered')
    } finally { await server.close() }
  })

  it('keeps deliberately unimplemented Agent-owned process and variant routes absent', async () => {
    const server = app()
    try {
      for (const url of ['/api/material-uploads/any/process', '/api/errors/any/variant', '/api/questions/any/variant']) {
        const response = await server.inject({ method: 'POST', url, payload: {} })
        expect(response.statusCode).toBe(404)
        expect(response.json()).toEqual({ code: 'NOT_FOUND', message: 'Route not found', data: null })
      }
    } finally { await server.close() }
  })
})
