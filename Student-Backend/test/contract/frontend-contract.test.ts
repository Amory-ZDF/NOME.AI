import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../../src/app.js'
import {
  errorItemSchema,
  exerciseSetSchema,
  materialUploadJobSchema,
  noteSchema,
  settingsSchema,
  taskSchema,
} from '../../src/contracts/student-contracts.js'
import { parseEnv } from '../../src/config/env.js'
import { toInputJson } from '../../src/db/json.js'
import { createTestPrisma, resetDatabase } from '../helpers/database.js'

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
  expect(response.json()).toMatchObject({ code: 0, message: 'ok' })
  const body = response.json() as { data: unknown }
  expect(() => schema.parse(body.data)).not.toThrow()
}

beforeEach(async () => resetDatabase(prisma))
afterAll(async () => { await resetDatabase(prisma); await prisma.$disconnect() })

describe('documented non-Agent frontend contract', () => {
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
      expectOk(settings, { parse: (data) => ({ settings: settingsSchema.parse((data as { settings: unknown }).settings) }) })

      const createdTask = await server.inject({ method: 'POST', url: '/api/tasks', payload: task('task-created') })
      expectOk(createdTask, { parse: (data) => ({ task: taskSchema.parse((data as { task: unknown }).task) }) })
      const completedTask = await server.inject({ method: 'PATCH', url: '/api/tasks/task-created', payload: { status: 'completed' } })
      expectOk(completedTask, { parse: (data) => ({ task: taskSchema.parse((data as { task: unknown }).task) }) })

      const exercise = await server.inject({ method: 'GET', url: '/api/exercise-sets/task-contract' })
      expectOk(exercise, exerciseSetSchema)

      const errors = await server.inject({ method: 'POST', url: '/api/errors/batch', payload: { items: [errorItem()] } })
      expectOk(errors, { parse: (data) => ({ errors: (data as { errors: unknown[] }).errors.map((value) => errorItemSchema.parse(value)) }) })

      const noteBody = noteSchema.parse({ id: 'note-contract', title: 'Frontend note', folderId: null, folderPath: null, tags: [], linkedTopics: [], linkedErrors: [], source: 'typed', createdAt: now, updatedAt: now, content: [{ t: 'p', v: 'Remember this.' }], aiSuggestions: [], version: 1, versions: [] })
      const note = await server.inject({ method: 'POST', url: '/api/notes', payload: noteBody })
      expectOk(note, { parse: (data) => ({ note: noteSchema.parse((data as { note: unknown }).note) }) })
      const notes = await server.inject({ method: 'GET', url: '/api/notes' })
      expectOk(notes, { parse: (data) => ({ notes: (data as { notes: unknown[] }).notes.map((value) => noteSchema.parse(value)) }) })

      const material = await server.inject({ method: 'POST', url: '/api/material-uploads', payload: { id: 'upload-contract', fileName: 'note.pdf', mimeType: 'application/pdf', size: 1, materialType: 'class_note', createdAt: now } })
      expectOk(material, { parse: (data) => ({ job: materialUploadJobSchema.parse((data as { job: unknown }).job) }) })
      const cancelled = await server.inject({ method: 'POST', url: '/api/material-uploads/upload-contract/cancel' })
      expectOk(cancelled, { parse: (data) => ({ job: materialUploadJobSchema.parse((data as { job: unknown }).job) }) })
    } finally {
      await server.close()
    }
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
