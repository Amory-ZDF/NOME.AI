import type { FastifyInstance } from 'fastify'
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
  trustedBootstrapDataSchema,
} from '../../src/contracts/student-contracts.js'
import { parseEnv } from '../../src/config/env.js'
import { toInputJson } from '../../src/db/json.js'
import { sessionSummarySchema } from '../../src/modules/sessions/session-summary.js'
import { createTestPrisma, resetDatabase } from '../helpers/database.js'

const prisma = createTestPrisma()
const studentId = 'contract-student'
const now = '2026-08-11T10:00:00.000Z'
const patchAt = '2026-08-11T11:00:00.000Z'
const organizeAt = '2026-08-11T12:00:00.000Z'
const undoAt = '2026-08-11T13:00:00.000Z'
const defaultSettings = settingsSchema.parse({
  tone: 35,
  dailyGoalHours: 4,
  reminderTask: true,
  reminderErrorReview: true,
  reminderStudyTime: false,
})

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
    id,
    order: 1,
    type: 'calculation' as const,
    topic: 'Calculus',
    difficulty: 3,
    content: 'Solve x.',
    acceptKeywords: ['2'],
    correctDisplay: '2',
    errorType: 'method' as const,
    hints: [1, 2, 3, 4, 5].map((level) => ({
      level: level as 1 | 2 | 3 | 4 | 5,
      title: `Hint ${level}`,
      content: `Use step ${level}`,
    })),
  }
}

function task(id = 'task-contract') {
  return taskSchema.parse({
    id,
    title: 'Frontend task',
    type: 'teacher_assigned',
    subject: 'Math',
    estimatedMinutes: 20,
    dueAt: '2026-08-12T10:00:00.000Z',
    assignedBy: 'Teacher',
    priority: 'P1',
    isOverdue: false,
    status: 'pending',
  })
}

function adjustment(id = 'adjustment-contract', taskId = 'task-contract') {
  return taskAdjustmentSchema.parse({
    id,
    taskId,
    reason: 'time_conflict',
    details: 'Frontend timetable overlap',
    availableMinutes: 30,
    proposedDueAt: '2026-08-12T11:00:00.000Z',
    createdAt: now,
    status: 'submitted',
  })
}

function errorItem(
  id = 'error-contract',
  occurredAt = '2026-08-11T09:00:00.000Z',
  occurrenceKey = `manual:${id}:one`,
) {
  return errorItemSchema.parse({
    id,
    questionId: `question-${id}`,
    sessionId: null,
    subject: 'Math',
    errorType: 'method',
    questionSummary: 'Solve x',
    questionContent: 'Solve x',
    type: 'calculation',
    difficulty: 3,
    errorDescription: 'Method',
    relatedTopic: 'Calculus',
    topicId: 'calculus',
    whereWrong: 'Step one',
    whyWrong: 'Forgot rule',
    linkedAbility: 'Methods',
    hintDependency: 0,
    firstOccurredAt: occurredAt,
    lastOccurredAt: occurredAt,
    occurrences: [occurredAt],
    occurrenceKeys: [occurrenceKey],
    occurrenceRecords: [{ key: occurrenceKey, occurredAt }],
    repeatCount: 1,
    status: 'pending_review',
    studentAnswer: '1',
    correctAnswer: '2',
    analysis: 'Use the rule',
    acceptKeywords: ['2'],
    redoHistory: [],
    verificationVariantId: null,
    variantVerifiedAt: null,
    variantVerification: null,
  })
}

function note(id = 'note-contract') {
  return noteSchema.parse({
    id,
    title: 'Original note',
    folderId: null,
    folderPath: null,
    tags: [],
    linkedTopics: [],
    linkedErrors: [],
    source: 'typed',
    createdAt: now,
    updatedAt: now,
    content: [{ t: 'p', v: 'Original content' }],
    aiSuggestions: [{ id: 'add-organized-tag', type: 'add_tag', tag: 'organized' }],
    version: 1,
    versions: [],
  })
}

function exercise(taskId = 'task-contract', id = 'set-contract') {
  return exerciseSetSchema.parse({
    id,
    taskId,
    title: 'Frontend task',
    subject: 'Math',
    questions: [question()],
  })
}

function session(id = 'session-contract', taskId = 'task-contract') {
  return sessionSchema.parse({
    sessionId: id,
    taskId,
    taskTitle: 'Frontend task',
    subject: 'Math',
    completedAt: '2026-08-11T10:10:00.000Z',
    timeSpent: 10,
    timeSpentSeconds: 600,
    questions: [{
      ...question(),
      result: {
        status: 'correct',
        attempts: [{ answer: '2', submittedAt: '2026-08-11T10:09:00.000Z', isCorrect: true }],
        hintsUsed: 0,
        solvedAtHintLevel: 0,
        handwritingUsed: false,
      },
    }],
  })
}

async function insertStudent() {
  await prisma.student.create({
    data: {
      id: studentId,
      name: 'Contract Student',
      avatar: null,
      joinedDays: 1,
      gradeInfo: 'Year 12',
      greeting: toInputJson({ message: 'Welcome', fallback: 'Welcome' }),
      moduleStats: toInputJson({ notesCount: 0, weeklyExercises: 0, latestAccuracy: 0, pendingErrorReview: 0 }),
      learningSummary: toInputJson({ overallMastery: 0, weeklyCompleted: 0, weeklyTotal: 0, overdueTasks: 0, weakTopics: [], knowledgeHeatmap: [] }),
    },
  })
  await prisma.studentSettings.create({
    data: {
      studentId,
      payload: toInputJson(defaultSettings),
    },
  })
}

async function seedTaskExercise(taskValue = task(), setValue = exercise(taskValue.id)) {
  await prisma.task.create({
    data: {
      id: taskValue.id,
      studentId,
      type: taskValue.type,
      status: taskValue.status,
      dueAt: taskValue.dueAt === null ? null : new Date(taskValue.dueAt),
      payload: toInputJson(taskValue),
    },
  })
  await prisma.exerciseSet.create({
    data: { id: setValue.id!, studentId, taskId: taskValue.id, kind: 'task', payload: toInputJson(setValue) },
  })
}

async function seedBankExercise(id = 'bank-contract') {
  const set = exerciseSetSchema.parse({
    id,
    taskId: null,
    title: 'Bank set',
    subject: 'Math',
    questions: [question('bank-question')],
  })
  await prisma.exerciseSet.create({ data: { id, studentId, taskId: null, kind: 'bank', payload: toInputJson(set) } })
  return set
}

const taskEnvelope = z.strictObject({ task: taskSchema })
const settingsEnvelope = z.strictObject({ settings: settingsSchema })
const errorsEnvelope = z.strictObject({ errors: z.array(errorItemSchema) })
const errorEnvelope = z.strictObject({ error: errorItemSchema })
const noteEnvelope = z.strictObject({ note: noteSchema })
const notesEnvelope = z.strictObject({ notes: z.array(noteSchema) })
const materialEnvelope = z.strictObject({ job: materialUploadJobSchema })
const confirmationEnvelope = z.strictObject({ job: materialUploadJobSchema, note: noteSchema })
const adjustmentEnvelope = z.strictObject({ request: taskAdjustmentSchema, task: taskSchema })
const sessionIdEnvelope = z.strictObject({ sessionId: z.string().min(1).max(100) })

function expectExactOk(
  response: { statusCode: number; json(): unknown },
  schema: z.ZodType,
  expectedData: unknown,
) {
  expect(response.statusCode).toBe(200)
  expect(response.json()).toStrictEqual({ code: 0, message: 'ok', data: schema.parse(expectedData) })
}

const exactSummary = sessionSummarySchema.parse({
  accuracy: 100,
  correctCount: 1,
  wrongCount: 0,
  unansweredCount: 0,
  hintDependency: { totalHints: 0, averageHints: 0, independentlySolved: 1 },
  errorDistribution: {},
  topicOutcomes: [{ topic: 'Calculus', correct: 1, wrong: 0 }],
  wrongQuestions: [],
})

function exactEmptyBootstrap() {
  return trustedBootstrapDataSchema.parse({
    student: { id: studentId, name: 'Contract Student', avatar: null, joinedDays: 1, gradeInfo: 'Year 12' },
    tasks: [],
    taskAdjustments: [],
    exerciseSets: {},
    bankExerciseSets: {},
    sessions: {},
    errors: [],
    notes: [],
    uploadJobs: [],
    noteFolders: [],
    settings: defaultSettings,
    greeting: { message: 'Welcome', fallback: 'Welcome' },
    moduleStats: { notesCount: 0, weeklyExercises: 0, latestAccuracy: 0, pendingErrorReview: 0 },
    learningSummary: { overallMastery: 0, weeklyCompleted: 0, weeklyTotal: 0, overdueTasks: 0, weakTopics: [], knowledgeHeatmap: [] },
  })
}

async function publicCreateTask(server: FastifyInstance, id = 'task-contract') {
  const expectedTask = task(id)
  const response = await server.inject({ method: 'POST', url: '/api/tasks', payload: task(id) })
  expectExactOk(response, taskEnvelope, { task: expectedTask })
  return (response.json() as { data: { task: z.infer<typeof taskSchema> } }).data.task
}

async function publicCreateNote(server: FastifyInstance, id = 'note-contract') {
  const value = note(id)
  const response = await server.inject({ method: 'POST', url: '/api/notes', payload: value })
  expectExactOk(response, noteEnvelope, { note: value })
  return (response.json() as { data: { note: z.infer<typeof noteSchema> } }).data.note
}

async function publicCreateMaterial(server: FastifyInstance, id = 'upload-contract') {
  const response = await server.inject({
    method: 'POST',
    url: '/api/material-uploads',
    payload: { id, fileName: `${id}.pdf`, mimeType: 'application/pdf', size: 1, materialType: 'class_note', createdAt: now },
  })
  const expectedJob = materialUploadJobSchema.parse({
    id,
    fileName: `${id}.pdf`,
    mimeType: 'application/pdf',
    size: 1,
    materialType: 'class_note',
    createdAt: now,
    updatedAt: now,
    progress: 0,
    status: 'queued',
  })
  expectExactOk(response, materialEnvelope, { job: expectedJob })
  return (response.json() as { data: { job: z.infer<typeof materialUploadJobSchema> } }).data.job
}

async function transitionMaterialToConfirmation(job: z.infer<typeof materialUploadJobSchema>) {
  const result = {
    suggestedTitle: 'Confirmed note',
    materialType: 'class_note' as const,
    examBoard: 'Cambridge',
    subject: 'Math',
    chapter: 'Calculus',
    folderId: 'calculus',
    folderPath: 'Math/Calculus',
    questionBlocks: [{ id: 'q1', label: 'Q1', text: 'Solve' }],
    answerBlocks: [{ id: 'a1', questionId: 'q1', text: '2' }],
    content: [{ t: 'p' as const, v: 'Confirmed content' }],
    linkedTopics: ['calculus'],
    linkedErrors: ['error-contract'],
    confidence: 1,
  }
  const transitioned = materialUploadJobSchema.parse({ ...job, status: 'needs_confirmation', progress: 100, updatedAt: patchAt, result })
  await prisma.materialUploadJob.update({
    where: { studentId_id: { studentId, id: job.id } },
    data: { status: transitioned.status, payload: toInputJson(transitioned) },
  })
  return transitioned
}

async function publicCreateAndRedoError(server: FastifyInstance, id = 'error-contract') {
  const batch = await server.inject({ method: 'POST', url: '/api/errors/batch', payload: { items: [errorItem(id)] } })
  expectExactOk(batch, errorsEnvelope, { errors: [errorItem(id)] })
  const redo = await server.inject({
    method: 'POST',
    url: `/api/errors/${id}/redo`,
    payload: { attemptedAt: now, answer: '2', isCorrect: true, timeSpent: 1 },
  })
  const expected = errorItemSchema.parse({
    ...errorItem(id),
    status: 'verification_due',
    redoHistory: [{ attemptedAt: now, answer: '2', isCorrect: true, timeSpent: 1 }],
  })
  expectExactOk(redo, errorEnvelope, { error: expected })
  return (redo.json() as { data: { error: z.infer<typeof errorItemSchema> } }).data.error
}

async function seedVerificationFixture(current: z.infer<typeof errorItemSchema>) {
  const variantTask = taskSchema.parse({
    id: 'verification-task',
    title: 'Independent check',
    type: 'error_review',
    subject: 'Math',
    estimatedMinutes: 10,
    dueAt: null,
    assignedBy: null,
    priority: 'P1',
    isOverdue: false,
    status: 'pending',
    exerciseSetId: 'verification-set',
    sourceQuestionId: current.questionId,
    verificationForErrorId: current.id,
    reason: 'Verify independently',
    createdAt: '2026-08-11T10:01:00.000Z',
  })
  const variantSet = exerciseSetSchema.parse({
    id: 'verification-set',
    taskId: variantTask.id,
    title: variantTask.title,
    subject: 'Math',
    sourceQuestionId: current.questionId,
    createdAt: variantTask.createdAt,
    questions: [{ ...question('verification-question'), variantOf: current.questionId }],
  })
  const awaiting = errorItemSchema.parse({ ...current, status: 'verification_due', verificationVariantId: variantSet.id })
  await prisma.task.create({
    data: { id: variantTask.id, studentId, type: variantTask.type, status: variantTask.status, dueAt: null, payload: toInputJson(variantTask) },
  })
  await prisma.exerciseSet.create({
    data: { id: variantSet.id!, studentId, taskId: variantTask.id, kind: 'task', payload: toInputJson(variantSet) },
  })
  await prisma.errorItem.update({
    where: { studentId_id: { studentId, id: awaiting.id } },
    data: {
      status: awaiting.status,
      lastOccurredAt: new Date(awaiting.lastOccurredAt),
      payload: toInputJson({
        storageVersion: 1,
        error: awaiting,
        occurrenceEvidenceBindings: awaiting.occurrenceRecords.map(({ key, occurredAt }) => ({ key, occurredAt, fingerprint: '0'.repeat(64) })),
      }),
    },
  })
  return awaiting
}

async function publicVerifyError(
  server: FastifyInstance,
  current: z.infer<typeof errorItemSchema>,
  id = 'error-contract',
) {
  const verification = { variantId: 'verification-set', isCorrect: true, verifiedAt: '2026-08-11T10:02:00.000Z' }
  const response = await server.inject({
    method: 'POST',
    url: `/api/errors/${id}/verification`,
    payload: verification,
  })
  expectExactOk(response, errorEnvelope, { error: { ...current, variantVerifiedAt: verification.verifiedAt, variantVerification: verification } })
  return (response.json() as { data: { error: z.infer<typeof errorItemSchema> } }).data.error
}

const implementedRoutes = [
  ['health', '/health', 'get'],
  ['bootstrap', '/api/student/bootstrap', 'get'],
  ['settings patch', '/api/student/settings', 'patch'],
  ['task create', '/api/tasks', 'post'],
  ['task complete', '/api/tasks/{id}', 'patch'],
  ['task adjustment', '/api/tasks/{id}/adjustment-request', 'post'],
  ['task exercise read', '/api/exercise-sets/{taskId}', 'get'],
  ['bank exercise read', '/api/bank/exercise/{setId}', 'get'],
  ['session create', '/api/sessions', 'post'],
  ['summary read', '/api/summary/{sessionId}', 'get'],
  ['error batch', '/api/errors/batch', 'post'],
  ['error redo', '/api/errors/{id}/redo', 'post'],
  ['error verification', '/api/errors/{id}/verification', 'post'],
  ['error mastery', '/api/errors/{id}', 'patch'],
  ['note list', '/api/notes', 'get'],
  ['note create', '/api/notes', 'post'],
  ['note patch', '/api/notes/{id}', 'patch'],
  ['note organize', '/api/notes/{id}/organize', 'post'],
  ['note undo', '/api/notes/{id}/undo', 'post'],
  ['material create', '/api/material-uploads', 'post'],
  ['material cancel', '/api/material-uploads/{id}/cancel', 'post'],
  ['material confirm', '/api/material-uploads/{id}/confirm', 'post'],
] as const

beforeEach(async () => resetDatabase(prisma))
afterAll(async () => { await resetDatabase(prisma); await prisma.$disconnect() })

describe('documented non-Agent frontend contract', () => {
  it.each(implementedRoutes)('documents exactly one %s route/method row', async (_name, path, method) => {
    const server = app()
    try {
      const document = await server.inject({ method: 'GET', url: '/documentation/json' })
      expect(document.statusCode).toBe(200)
      const operation = (document.json() as { paths: Record<string, Record<string, unknown>> }).paths[path]?.[method]
      expect(operation).toBeDefined()
    } finally { await server.close() }
  })

  it('health GET returns one exact strict envelope', async () => {
    const server = app()
    try { expectExactOk(await server.inject({ method: 'GET', url: '/health' }), z.strictObject({ status: z.literal('ok') }), { status: 'ok' }) }
    finally { await server.close() }
  })

  it('bootstrap GET returns the complete canonical strict aggregate', async () => {
    await insertStudent()
    const server = app()
    try { expectExactOk(await server.inject({ method: 'GET', url: '/api/student/bootstrap' }), trustedBootstrapDataSchema, exactEmptyBootstrap()) }
    finally { await server.close() }
  })

  it('settings PATCH accepts the frontend patch and returns the complete settings envelope', async () => {
    await insertStudent()
    const server = app()
    try { expectExactOk(await server.inject({ method: 'PATCH', url: '/api/student/settings', payload: { dailyGoalHours: 6 } }), settingsEnvelope, { settings: { ...defaultSettings, dailyGoalHours: 6 } }) }
    finally { await server.close() }
  })

  it('task create POST accepts a frontend task and returns the complete task envelope', async () => {
    await insertStudent()
    const server = app()
    try { expectExactOk(await server.inject({ method: 'POST', url: '/api/tasks', payload: task() }), taskEnvelope, { task: task() }) }
    finally { await server.close() }
  })

  it('task complete PATCH accepts the frontend completion command and returns the canonical task', async () => {
    await insertStudent()
    const server = app()
    try {
      await publicCreateTask(server)
      expectExactOk(await server.inject({ method: 'PATCH', url: '/api/tasks/task-contract', payload: { status: 'completed' } }), taskEnvelope, { task: { ...task(), status: 'completed', completedAt: now, isOverdue: false } })
    } finally { await server.close() }
  })

  it('task adjustment POST accepts the frontend request and returns both strict canonical records', async () => {
    await insertStudent()
    const server = app()
    try {
      await publicCreateTask(server)
      expectExactOk(await server.inject({ method: 'POST', url: '/api/tasks/task-contract/adjustment-request', payload: adjustment() }), adjustmentEnvelope, { request: adjustment(), task: { ...task(), adjustmentStatus: 'submitted' } })
    } finally { await server.close() }
  })

  it('task exercise GET returns the canonical set for the scoped task', async () => {
    await insertStudent()
    await seedTaskExercise()
    const server = app()
    try { expectExactOk(await server.inject({ method: 'GET', url: '/api/exercise-sets/task-contract' }), exerciseSetSchema, exercise()) }
    finally { await server.close() }
  })

  it('bank exercise GET returns the canonical scoped bank set', async () => {
    await insertStudent()
    const bank = await seedBankExercise()
    const server = app()
    try { expectExactOk(await server.inject({ method: 'GET', url: '/api/bank/exercise/bank-contract' }), exerciseSetSchema, bank) }
    finally { await server.close() }
  })

  it('session create POST accepts the frontend submission and returns only its canonical id', async () => {
    await insertStudent()
    await seedTaskExercise()
    const server = app()
    try { expectExactOk(await server.inject({ method: 'POST', url: '/api/sessions', payload: session() }), sessionIdEnvelope, { sessionId: 'session-contract' }) }
    finally { await server.close() }
  })

  it('summary GET returns the canonical deterministic session summary', async () => {
    await insertStudent()
    await seedTaskExercise()
    const server = app()
    try {
      expectExactOk(await server.inject({ method: 'POST', url: '/api/sessions', payload: session() }), sessionIdEnvelope, { sessionId: 'session-contract' })
      expectExactOk(await server.inject({ method: 'GET', url: '/api/summary/session-contract' }), sessionSummarySchema, exactSummary)
    } finally { await server.close() }
  })

  it('error batch POST accepts the frontend card array and returns canonical errors', async () => {
    await insertStudent()
    const server = app()
    try { expectExactOk(await server.inject({ method: 'POST', url: '/api/errors/batch', payload: { items: [errorItem()] } }), errorsEnvelope, { errors: [errorItem()] }) }
    finally { await server.close() }
  })

  it('error redo POST accepts one frontend attempt and returns the canonical error', async () => {
    await insertStudent()
    const server = app()
    try {
      const initial = await server.inject({ method: 'POST', url: '/api/errors/batch', payload: { items: [errorItem()] } })
      expectExactOk(initial, errorsEnvelope, { errors: [errorItem()] })
      expectExactOk(await server.inject({ method: 'POST', url: '/api/errors/error-contract/redo', payload: { attemptedAt: now, answer: '2', isCorrect: true, timeSpent: 1 } }), errorEnvelope, { error: { ...errorItem(), status: 'verification_due', redoHistory: [{ attemptedAt: now, answer: '2', isCorrect: true, timeSpent: 1 }] } })
    } finally { await server.close() }
  })

  it('error verification POST accepts one frontend audit against seeded external provenance', async () => {
    await insertStudent()
    const server = app()
    try {
      const redone = await publicCreateAndRedoError(server)
      const awaiting = await seedVerificationFixture(redone)
      await publicVerifyError(server, awaiting)
    } finally { await server.close() }
  })

  it('error mastery PATCH accepts the frontend mastery command after verified provenance', async () => {
    await insertStudent()
    const server = app()
    try {
      const redone = await publicCreateAndRedoError(server)
      const awaiting = await seedVerificationFixture(redone)
      const beforeMastery = await publicVerifyError(server, awaiting)
      expectExactOk(await server.inject({ method: 'PATCH', url: '/api/errors/error-contract', payload: { status: 'mastered' } }), errorEnvelope, { error: { ...beforeMastery, status: 'mastered' } })
    } finally { await server.close() }
  })

  it('note list GET returns the complete canonical scoped note array', async () => {
    await insertStudent()
    const server = app()
    try {
      await publicCreateNote(server)
      expectExactOk(await server.inject({ method: 'GET', url: '/api/notes' }), notesEnvelope, { notes: [note()] })
    } finally { await server.close() }
  })

  it('note create POST accepts the complete frontend note and returns the canonical note', async () => {
    await insertStudent()
    const server = app()
    try { expectExactOk(await server.inject({ method: 'POST', url: '/api/notes', payload: note() }), noteEnvelope, { note: note() }) }
    finally { await server.close() }
  })

  it('note patch PATCH accepts frontend change metadata and returns the canonical versioned note', async () => {
    await insertStudent()
    const server = app()
    try {
      await publicCreateNote(server)
      const original = note()
      expectExactOk(await server.inject({ method: 'PATCH', url: '/api/notes/note-contract', payload: { title: 'Edited note', changedAt: patchAt, reason: 'manual_edit' } }), noteEnvelope, { note: { ...original, title: 'Edited note', updatedAt: patchAt, version: 2, versions: [{ version: 1, title: original.title, folderId: null, folderPath: null, tags: [], content: original.content, linkedTopics: [], linkedErrors: [], source: 'typed', changedAt: patchAt, reason: 'manual_edit' }] } })
    } finally { await server.close() }
  })

  it('note organize POST accepts selected persisted suggestion ids and returns the canonical note', async () => {
    await insertStudent()
    const server = app()
    try {
      await publicCreateNote(server)
      const original = note()
      expectExactOk(await server.inject({ method: 'POST', url: '/api/notes/note-contract/organize', payload: { suggestionIds: ['add-organized-tag'], changedAt: patchAt } }), noteEnvelope, { note: { ...original, tags: ['organized'], source: 'ai_organized', updatedAt: patchAt, version: 2, versions: [{ version: 1, title: original.title, folderId: null, folderPath: null, tags: [], content: original.content, linkedTopics: [], linkedErrors: [], source: 'typed', changedAt: patchAt, reason: 'ai_organize' }] } })
    } finally { await server.close() }
  })

  it('note undo POST accepts frontend change metadata and returns the canonical restored note', async () => {
    await insertStudent()
    const server = app()
    try {
      await publicCreateNote(server)
      const original = note()
      const patched = { ...original, title: 'Edited note', updatedAt: patchAt, version: 2, versions: [{ version: 1, title: original.title, folderId: null, folderPath: null, tags: [], content: original.content, linkedTopics: [], linkedErrors: [], source: 'typed' as const, changedAt: patchAt, reason: 'manual_edit' }] }
      expectExactOk(await server.inject({ method: 'PATCH', url: '/api/notes/note-contract', payload: { title: 'Edited note', changedAt: patchAt, reason: 'manual_edit' } }), noteEnvelope, { note: patched })
      expectExactOk(await server.inject({ method: 'POST', url: '/api/notes/note-contract/undo', payload: { changedAt: organizeAt } }), noteEnvelope, { note: { ...original, updatedAt: organizeAt, version: 3, versions: [...patched.versions, { version: 2, title: 'Edited note', folderId: null, folderPath: null, tags: [], content: original.content, linkedTopics: [], linkedErrors: [], source: 'typed', changedAt: organizeAt, reason: 'undo' }] } })
    } finally { await server.close() }
  })

  it('material create POST accepts frontend metadata and returns the canonical queued job', async () => {
    await insertStudent()
    const server = app()
    try {
      expectExactOk(await server.inject({ method: 'POST', url: '/api/material-uploads', payload: { id: 'upload-contract', fileName: 'note.pdf', mimeType: 'application/pdf', size: 1, materialType: 'class_note', createdAt: now } }), materialEnvelope, { job: { id: 'upload-contract', fileName: 'note.pdf', mimeType: 'application/pdf', size: 1, materialType: 'class_note', createdAt: now, updatedAt: now, progress: 0, status: 'queued' } })
    } finally { await server.close() }
  })

  it('material cancel POST returns the canonical cancelled job', async () => {
    await insertStudent()
    const server = app()
    try {
      await publicCreateMaterial(server)
      expectExactOk(await server.inject({ method: 'POST', url: '/api/material-uploads/upload-contract/cancel' }), materialEnvelope, { job: { id: 'upload-contract', fileName: 'upload-contract.pdf', mimeType: 'application/pdf', size: 1, materialType: 'class_note', createdAt: now, updatedAt: now, progress: 0, status: 'cancelled' } })
    } finally { await server.close() }
  })

  it('material confirm POST accepts the frontend patch after the absent process transition fixture', async () => {
    await insertStudent()
    const server = app()
    try {
      const job = await publicCreateMaterial(server)
      const transitioned = await transitionMaterialToConfirmation(job)
      const result = { ...transitioned.result!, suggestedTitle: 'Frontend confirmed title' }
      expectExactOk(await server.inject({ method: 'POST', url: '/api/material-uploads/upload-contract/confirm', payload: { suggestedTitle: 'Frontend confirmed title' } }), confirmationEnvelope, {
        job: { ...transitioned, materialType: result.materialType, examBoard: result.examBoard, subject: result.subject, chapter: result.chapter, folderId: result.folderId, folderPath: result.folderPath, status: 'completed', progress: 100, result },
        note: { id: 'note-upload-contract', title: result.suggestedTitle, materialType: result.materialType, examBoard: result.examBoard, subject: result.subject, chapter: result.chapter, folderId: result.folderId, folderPath: result.folderPath, tags: [], questionBlocks: result.questionBlocks, answerBlocks: result.answerBlocks, content: result.content, linkedTopics: result.linkedTopics, linkedErrors: result.linkedErrors, aiSuggestions: [], sourceJobId: 'upload-contract', source: 'typed', createdAt: transitioned.createdAt, updatedAt: transitioned.updatedAt, version: 1, versions: [] },
      })
    } finally { await server.close() }
  })

  it('proves public task create -> seeded exercise -> public exercise read -> public session -> public summary provenance', async () => {
    await insertStudent()
    const server = app()
    try {
      const createdTask = await publicCreateTask(server)
      const set = exercise(createdTask.id)
      await prisma.exerciseSet.create({ data: { id: set.id!, studentId, taskId: createdTask.id, kind: 'task', payload: toInputJson(set) } })
      const read = await server.inject({ method: 'GET', url: `/api/exercise-sets/${createdTask.id}` })
      expectExactOk(read, exerciseSetSchema, set)
      const submitted = session('session-provenance', createdTask.id)
      expectExactOk(await server.inject({ method: 'POST', url: '/api/sessions', payload: submitted }), sessionIdEnvelope, { sessionId: 'session-provenance' })
      const summary = await server.inject({ method: 'GET', url: `/api/summary/${submitted.sessionId}` })
      expectExactOk(summary, sessionSummarySchema, exactSummary)
    } finally { await server.close() }
  })

  it('proves two public occurrences -> public redo -> seeded verification provenance -> public verification -> mastery', async () => {
    await insertStudent()
    const server = app()
    try {
      const firstOccurrence = errorItem('error-provenance', '2026-08-11T08:00:00.000Z', 'occurrence-one')
      const secondOccurrence = errorItem('error-provenance', '2026-08-11T09:00:00.000Z', 'occurrence-two')
      expectExactOk(await server.inject({ method: 'POST', url: '/api/errors/batch', payload: { items: [firstOccurrence] } }), errorsEnvelope, { errors: [firstOccurrence] })
      const recurrence = await server.inject({ method: 'POST', url: '/api/errors/batch', payload: { items: [secondOccurrence] } })
      const expectedRecurrence = errorItemSchema.parse({ ...firstOccurrence, lastOccurredAt: secondOccurrence.lastOccurredAt, occurrences: ['2026-08-11T08:00:00.000Z', '2026-08-11T09:00:00.000Z'], occurrenceKeys: ['occurrence-one', 'occurrence-two'], occurrenceRecords: [{ key: 'occurrence-one', occurredAt: '2026-08-11T08:00:00.000Z' }, { key: 'occurrence-two', occurredAt: '2026-08-11T09:00:00.000Z' }], repeatCount: 2, hasIncompleteOccurrenceHistory: false })
      expectExactOk(recurrence, errorsEnvelope, { errors: [expectedRecurrence] })
      const recurrent = (recurrence.json() as { data: { errors: Array<z.infer<typeof errorItemSchema>> } }).data.errors[0]!
      expect(recurrent).toStrictEqual(expectedRecurrence)
      const redo = await server.inject({ method: 'POST', url: '/api/errors/error-provenance/redo', payload: { attemptedAt: now, answer: '2', isCorrect: true, timeSpent: 1 } })
      const expectedRedo = errorItemSchema.parse({ ...expectedRecurrence, status: 'verification_due', redoHistory: [{ attemptedAt: now, answer: '2', isCorrect: true, timeSpent: 1 }] })
      expectExactOk(redo, errorEnvelope, { error: expectedRedo })
      const redone = (redo.json() as { data: { error: z.infer<typeof errorItemSchema> } }).data.error
      expect(redone).toStrictEqual(expectedRedo)
      const awaiting = await seedVerificationFixture(redone)
      const verified = await publicVerifyError(server, awaiting, 'error-provenance')
      const mastered = await server.inject({ method: 'PATCH', url: '/api/errors/error-provenance', payload: { status: 'mastered' } })
      expectExactOk(mastered, errorEnvelope, { error: { ...verified, status: 'mastered' } })
    } finally { await server.close() }
  })

  it('proves public material create -> fixture transition -> public confirm -> public note list provenance', async () => {
    await insertStudent()
    const server = app()
    try {
      const job = await publicCreateMaterial(server, 'upload-provenance')
      const transitioned = await transitionMaterialToConfirmation(job)
      const result = transitioned.result!
      const confirmed = await server.inject({ method: 'POST', url: '/api/material-uploads/upload-provenance/confirm', payload: {} })
      const expectedDerived = noteSchema.parse({ id: 'note-upload-provenance', title: result.suggestedTitle, materialType: result.materialType, examBoard: result.examBoard, subject: result.subject, chapter: result.chapter, folderId: result.folderId, folderPath: result.folderPath, tags: [], questionBlocks: result.questionBlocks, answerBlocks: result.answerBlocks, content: result.content, linkedTopics: result.linkedTopics, linkedErrors: result.linkedErrors, aiSuggestions: [], sourceJobId: 'upload-provenance', source: 'typed', createdAt: transitioned.createdAt, updatedAt: transitioned.updatedAt, version: 1, versions: [] })
      expectExactOk(confirmed, confirmationEnvelope, { job: { ...transitioned, materialType: result.materialType, examBoard: result.examBoard, subject: result.subject, chapter: result.chapter, folderId: result.folderId, folderPath: result.folderPath, status: 'completed', progress: 100 }, note: expectedDerived })
      const derived = (confirmed.json() as { data: { note: z.infer<typeof noteSchema> } }).data.note
      expect(derived).toStrictEqual(expectedDerived)
      const listed = await server.inject({ method: 'GET', url: '/api/notes' })
      expectExactOk(listed, notesEnvelope, { notes: [expectedDerived] })
    } finally { await server.close() }
  })

  it('proves note create -> patch -> organize -> undo with exact snapshot ids, reasons, sources, content, and restoration', async () => {
    await insertStudent()
    const server = app()
    try {
      const original = await publicCreateNote(server, 'note-history')
      const patchedResponse = await server.inject({
        method: 'PATCH',
        url: '/api/notes/note-history',
        payload: { title: 'Edited note', content: [{ t: 'p', v: 'Edited content' }], changedAt: patchAt, reason: 'manual_edit' },
      })
      const expectedPatched = noteSchema.parse({
        ...original,
        title: 'Edited note',
        content: [{ t: 'p', v: 'Edited content' }],
        updatedAt: patchAt,
        version: 2,
        versions: [{ version: 1, title: original.title, folderId: original.folderId, folderPath: original.folderPath, tags: original.tags, content: original.content, linkedTopics: original.linkedTopics, linkedErrors: original.linkedErrors, source: original.source, changedAt: patchAt, reason: 'manual_edit' }],
      })
      expectExactOk(patchedResponse, noteEnvelope, { note: expectedPatched })
      const patched = (patchedResponse.json() as { data: { note: z.infer<typeof noteSchema> } }).data.note
      expect(patched).toStrictEqual(expectedPatched)
      const organizedResponse = await server.inject({ method: 'POST', url: '/api/notes/note-history/organize', payload: { suggestionIds: ['add-organized-tag'], changedAt: organizeAt } })
      const expectedOrganized = noteSchema.parse({
        ...expectedPatched,
        tags: ['organized'],
        source: 'ai_organized',
        updatedAt: organizeAt,
        version: 3,
        versions: [...expectedPatched.versions, { version: 2, title: expectedPatched.title, folderId: expectedPatched.folderId, folderPath: expectedPatched.folderPath, tags: expectedPatched.tags, content: expectedPatched.content, linkedTopics: expectedPatched.linkedTopics, linkedErrors: expectedPatched.linkedErrors, source: expectedPatched.source, changedAt: organizeAt, reason: 'ai_organize' }],
      })
      expectExactOk(organizedResponse, noteEnvelope, { note: expectedOrganized })
      const organized = (organizedResponse.json() as { data: { note: z.infer<typeof noteSchema> } }).data.note
      expect(organized).toStrictEqual(expectedOrganized)
      const undoneResponse = await server.inject({ method: 'POST', url: '/api/notes/note-history/undo', payload: { changedAt: undoAt } })
      const expectedUndone = noteSchema.parse({
        ...expectedOrganized,
        title: expectedPatched.title,
        folderId: expectedPatched.folderId,
        folderPath: expectedPatched.folderPath,
        tags: expectedPatched.tags,
        content: expectedPatched.content,
        linkedTopics: expectedPatched.linkedTopics,
        linkedErrors: expectedPatched.linkedErrors,
        source: expectedPatched.source,
        updatedAt: undoAt,
        version: 4,
        versions: [...expectedOrganized.versions, { version: 3, title: expectedOrganized.title, folderId: expectedOrganized.folderId, folderPath: expectedOrganized.folderPath, tags: expectedOrganized.tags, content: expectedOrganized.content, linkedTopics: expectedOrganized.linkedTopics, linkedErrors: expectedOrganized.linkedErrors, source: expectedOrganized.source, changedAt: undoAt, reason: 'undo' }],
      })
      expectExactOk(undoneResponse, noteEnvelope, { note: expectedUndone })
      const undone = (undoneResponse.json() as { data: { note: z.infer<typeof noteSchema> } }).data.note
      expect(undone).toStrictEqual(expectedUndone)
    } finally { await server.close() }
  })

  it('keeps the two deliberately unimplemented Agent-owned variant routes absent', async () => {
    const server = app()
    try {
      for (const url of ['/api/errors/any/variant', '/api/questions/any/variant']) {
        const response = await server.inject({ method: 'POST', url, payload: {} })
        expect(response.statusCode).toBe(404)
        expect(response.json()).toStrictEqual({ code: 'NOT_FOUND', message: 'Route not found', data: null })
      }
    } finally { await server.close() }
  })
})
