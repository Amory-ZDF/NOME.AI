import type { FastifyInstance } from 'fastify'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

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
import { createTestPrisma, resetDatabase } from '../helpers/database.js'

const prisma = createTestPrisma()
const first = 'isolation-first'
const second = 'isolation-second'
const timestamp = '2026-08-11T10:00:00.000Z'
const recurrenceAt = '2026-08-11T10:30:00.000Z'
const patchAt = '2026-08-11T11:00:00.000Z'
const organizeAt = '2026-08-11T12:00:00.000Z'
const undoAt = '2026-08-11T13:00:00.000Z'

function server(studentId: string) {
  return buildApp({
    env: parseEnv({ NODE_ENV: 'test', DATABASE_URL: 'file:./prisma/test.db', STUDENT_ID: studentId, LOG_LEVEL: 'silent' }),
    prisma,
    now: () => new Date(timestamp),
    createId: () => 'generated-job',
  })
}

function question(label: string, id = 'shared-question') {
  return {
    id,
    order: 1,
    type: 'calculation' as const,
    topic: 'Algebra',
    difficulty: 2,
    content: `${label} question`,
    acceptKeywords: ['4'],
    correctDisplay: '4',
    errorType: 'calculation' as const,
    hints: [1, 2, 3, 4, 5].map((level) => ({
      level: level as 1 | 2 | 3 | 4 | 5,
      title: `${label} hint ${level}`,
      content: `${label} hint content ${level}`,
    })),
  }
}

function ownedTask(label: string, id = 'shared-task') {
  return taskSchema.parse({
    id,
    title: `${label} task`,
    type: 'teacher_assigned',
    subject: 'Math',
    estimatedMinutes: 30,
    dueAt: '2026-08-12T10:00:00.000Z',
    assignedBy: `${label} teacher`,
    priority: 'P1',
    isOverdue: false,
    status: 'pending',
  })
}

function ownedSet(label: string, taskId = 'shared-task', id = 'shared-set') {
  return exerciseSetSchema.parse({
    id,
    taskId,
    title: `${label} task`,
    subject: 'Math',
    questions: [question(label)],
  })
}

function ownedBankSet(label: string, id = 'shared-bank') {
  return exerciseSetSchema.parse({
    id,
    taskId: null,
    title: `${label} bank`,
    subject: 'Math',
    questions: [question(label, `${id}-question`)],
  })
}

function ownedSession(label: string, id = 'shared-session', taskId = 'shared-task') {
  const isFirst = label === 'First'
  return sessionSchema.parse({
    sessionId: id,
    taskId,
    taskTitle: `${label} task`,
    subject: 'Math',
    completedAt: '2026-08-11T10:10:00.000Z',
    timeSpent: 10,
    timeSpentSeconds: 600,
    questions: [{
      ...question(label),
      result: {
        status: isFirst ? 'correct' : 'wrong',
        attempts: [{ answer: isFirst ? '4' : '3', submittedAt: '2026-08-11T10:09:00.000Z', isCorrect: isFirst }],
        hintsUsed: isFirst ? 0 : 1,
        solvedAtHintLevel: isFirst ? 0 : null,
      },
    }],
  })
}

function expectedSummary(label: string) {
  const submitted = ownedSession(label)
  if (label === 'First') {
    return {
      accuracy: 100,
      correctCount: 1,
      wrongCount: 0,
      unansweredCount: 0,
      hintDependency: { totalHints: 0, averageHints: 0, independentlySolved: 1 },
      errorDistribution: {},
      topicOutcomes: [{ topic: 'Algebra', correct: 1, wrong: 0 }],
      wrongQuestions: [],
    }
  }
  return {
    accuracy: 0,
    correctCount: 0,
    wrongCount: 1,
    unansweredCount: 0,
    hintDependency: { totalHints: 1, averageHints: 1, independentlySolved: 0 },
    errorDistribution: { calculation: 1 },
    topicOutcomes: [{ topic: 'Algebra', correct: 0, wrong: 1 }],
    wrongQuestions: submitted.questions,
  }
}

function ownedError(label: string, occurredAt = timestamp, key = 'shared-occurrence-one') {
  return errorItemSchema.parse({
    id: 'shared-error',
    questionId: 'shared-error-question',
    sessionId: null,
    subject: 'Math',
    errorType: 'method',
    questionSummary: `${label} error`,
    questionContent: `${label} error content`,
    type: 'calculation',
    difficulty: 2,
    errorDescription: `${label} method error`,
    relatedTopic: 'Algebra',
    topicId: 'algebra',
    whereWrong: `${label} wrong step`,
    whyWrong: `${label} reason`,
    linkedAbility: `${label} method`,
    hintDependency: 0,
    firstOccurredAt: occurredAt,
    lastOccurredAt: occurredAt,
    occurrences: [occurredAt],
    occurrenceKeys: [key],
    occurrenceRecords: [{ key, occurredAt }],
    repeatCount: 1,
    status: 'pending_review',
    studentAnswer: '1',
    correctAnswer: '2',
    analysis: `${label} analysis`,
    acceptKeywords: ['2'],
    redoHistory: [],
    verificationVariantId: null,
    variantVerifiedAt: null,
    variantVerification: null,
  })
}

function ownedNote(label: string, id = 'shared-note') {
  return noteSchema.parse({
    id,
    title: `${label} note`,
    folderId: null,
    folderPath: null,
    tags: [],
    linkedTopics: [],
    linkedErrors: [],
    source: 'typed',
    createdAt: timestamp,
    updatedAt: timestamp,
    content: [{ t: 'p', v: `${label} content` }],
    aiSuggestions: [{ id: 'shared-suggestion', type: 'add_tag', tag: `${label.toLowerCase()}-organized` }],
    version: 1,
    versions: [],
  })
}

async function insertStudent(id: string, label: string) {
  await prisma.student.create({
    data: {
      id,
      name: `${label} Student`,
      avatar: null,
      joinedDays: 2,
      gradeInfo: 'Year 12',
      greeting: toInputJson({ message: `${label} greeting`, fallback: `${label} fallback` }),
      moduleStats: toInputJson({ notesCount: 0, weeklyExercises: 0, latestAccuracy: 0, pendingErrorReview: 0 }),
      learningSummary: toInputJson({ overallMastery: 0, weeklyCompleted: 0, weeklyTotal: 0, overdueTasks: 0, weakTopics: [], knowledgeHeatmap: [] }),
    },
  })
  await prisma.studentSettings.create({
    data: {
      studentId: id,
      payload: toInputJson(settingsSchema.parse({ tone: 35, dailyGoalHours: 4, reminderTask: true, reminderErrorReview: true, reminderStudyTime: false })),
    },
  })
  await prisma.noteFolder.create({
    data: { id: 'shared-folder', studentId: id, parentId: null, payload: toInputJson({ id: 'shared-folder', name: `${label} folder`, noteCount: 0, autoCreated: false }) },
  })
}

async function tenantSnapshot(owner: string) {
  const [student, settings, tasks, adjustments, sets, sessions, errors, notes, folders, jobs] = await Promise.all([
    prisma.student.findUnique({ where: { id: owner } }),
    prisma.studentSettings.findUnique({ where: { studentId: owner } }),
    prisma.task.findMany({ where: { studentId: owner }, orderBy: { id: 'asc' } }),
    prisma.taskAdjustment.findMany({ where: { studentId: owner }, orderBy: { id: 'asc' } }),
    prisma.exerciseSet.findMany({ where: { studentId: owner }, orderBy: { id: 'asc' } }),
    prisma.session.findMany({ where: { studentId: owner }, orderBy: { id: 'asc' } }),
    prisma.errorItem.findMany({ where: { studentId: owner }, orderBy: { id: 'asc' } }),
    prisma.note.findMany({ where: { studentId: owner }, orderBy: { id: 'asc' } }),
    prisma.noteFolder.findMany({ where: { studentId: owner }, orderBy: { id: 'asc' } }),
    prisma.materialUploadJob.findMany({ where: { studentId: owner }, orderBy: { id: 'asc' } }),
  ])
  return JSON.stringify({ student, settings, tasks, adjustments, sets, sessions, errors, notes, folders, jobs })
}

async function fullSnapshot() {
  const [students, settings, tasks, adjustments, sets, sessions, errors, notes, folders, jobs] = await Promise.all([
    prisma.student.findMany({ orderBy: { id: 'asc' } }),
    prisma.studentSettings.findMany({ orderBy: { studentId: 'asc' } }),
    prisma.task.findMany({ orderBy: [{ studentId: 'asc' }, { id: 'asc' }] }),
    prisma.taskAdjustment.findMany({ orderBy: [{ studentId: 'asc' }, { id: 'asc' }] }),
    prisma.exerciseSet.findMany({ orderBy: [{ studentId: 'asc' }, { id: 'asc' }] }),
    prisma.session.findMany({ orderBy: [{ studentId: 'asc' }, { id: 'asc' }] }),
    prisma.errorItem.findMany({ orderBy: [{ studentId: 'asc' }, { id: 'asc' }] }),
    prisma.note.findMany({ orderBy: [{ studentId: 'asc' }, { id: 'asc' }] }),
    prisma.noteFolder.findMany({ orderBy: [{ studentId: 'asc' }, { id: 'asc' }] }),
    prisma.materialUploadJob.findMany({ orderBy: [{ studentId: 'asc' }, { id: 'asc' }] }),
  ])
  return JSON.stringify({ students, settings, tasks, adjustments, sets, sessions, errors, notes, folders, jobs })
}

async function ownMutation(
  otherId: string,
  request: () => Promise<{ statusCode: number }>,
  expectedStatus = 200,
) {
  const before = await tenantSnapshot(otherId)
  const response = await request()
  expect(response.statusCode).toBe(expectedStatus)
  expect(await tenantSnapshot(otherId)).toBe(before)
  return response
}

async function failedCrossTenantMutation(request: () => Promise<{ statusCode: number }>) {
  const before = await fullSnapshot()
  const response = await request()
  expect(response.statusCode).toBe(404)
  expect(await fullSnapshot()).toBe(before)
}

async function seedExerciseFixtures(studentId: string, label: string) {
  const set = ownedSet(label)
  const bank = ownedBankSet(label)
  await prisma.exerciseSet.createMany({ data: [
    { id: set.id!, studentId, taskId: set.taskId, kind: 'task', payload: toInputJson(set) },
    { id: bank.id!, studentId, taskId: null, kind: 'bank', payload: toInputJson(bank) },
  ] })
}

async function seedVerificationFixture(studentId: string, label: string) {
  const row = await prisma.errorItem.findUniqueOrThrow({ where: { studentId_id: { studentId, id: 'shared-error' } } })
  const aggregate = row.payload as { error: unknown; occurrenceEvidenceBindings: unknown[] }
  const current = errorItemSchema.parse(aggregate.error)
  const verificationTask = taskSchema.parse({
    id: 'shared-verification-task',
    title: `${label} verification`,
    type: 'error_review',
    subject: 'Math',
    estimatedMinutes: 10,
    dueAt: null,
    assignedBy: null,
    priority: 'P1',
    isOverdue: false,
    status: 'pending',
    exerciseSetId: 'shared-verification-set',
    sourceQuestionId: current.questionId,
    verificationForErrorId: current.id,
    reason: `${label} verification`,
    createdAt: '2026-08-11T10:31:00.000Z',
  })
  const verificationSet = exerciseSetSchema.parse({
    id: 'shared-verification-set',
    taskId: verificationTask.id,
    title: verificationTask.title,
    subject: 'Math',
    sourceQuestionId: current.questionId,
    createdAt: verificationTask.createdAt,
    questions: [{ ...question(label, 'shared-verification-question'), variantOf: current.questionId }],
  })
  const awaiting = errorItemSchema.parse({ ...current, status: 'verification_due', verificationVariantId: verificationSet.id })
  await prisma.task.create({ data: { id: verificationTask.id, studentId, type: verificationTask.type, status: verificationTask.status, dueAt: null, payload: toInputJson(verificationTask) } })
  await prisma.exerciseSet.create({ data: { id: verificationSet.id!, studentId, taskId: verificationTask.id, kind: 'task', payload: toInputJson(verificationSet) } })
  await prisma.errorItem.update({
    where: { studentId_id: { studentId, id: current.id } },
    data: { status: awaiting.status, payload: toInputJson({ ...aggregate, error: awaiting }) },
  })
}

async function transitionMaterial(studentId: string, id: string, label: string) {
  const row = await prisma.materialUploadJob.findUniqueOrThrow({ where: { studentId_id: { studentId, id } } })
  const current = materialUploadJobSchema.parse(row.payload)
  const transitioned = materialUploadJobSchema.parse({
    ...current,
    status: 'needs_confirmation',
    progress: 100,
    updatedAt: patchAt,
    result: {
      suggestedTitle: `${label} material note`,
      materialType: 'class_note',
      examBoard: 'Cambridge',
      subject: 'Math',
      chapter: 'Algebra',
      folderId: 'algebra',
      folderPath: 'Math/Algebra',
      questionBlocks: [{ id: 'q1', label: 'Q1', text: `${label} question` }],
      answerBlocks: [{ id: 'a1', questionId: 'q1', text: '4' }],
      content: [{ t: 'p', v: `${label} derived content` }],
      linkedTopics: ['algebra'],
      linkedErrors: ['shared-error'],
      confidence: 1,
    },
  })
  await prisma.materialUploadJob.update({ where: { studentId_id: { studentId, id } }, data: { status: transitioned.status, payload: toInputJson(transitioned) } })
}

async function seedExclusiveFixture(studentId: string, label: string) {
  const key = `${label.toLowerCase()}-only`
  const taskValue = ownedTask(label, `${key}-task`)
  const setValue = ownedSet(label, taskValue.id, `${key}-set`)
  const bankValue = ownedBankSet(label, `${key}-bank`)
  const sessionValue = ownedSession(label, `${key}-session`, taskValue.id)
  const errorValue = errorItemSchema.parse({ ...ownedError(label), id: `${key}-error`, questionId: `${key}-error-question`, occurrenceKeys: [`${key}-occurrence`], occurrenceRecords: [{ key: `${key}-occurrence`, occurredAt: timestamp }] })
  const noteValue = ownedNote(label, `${key}-note`)
  const jobs = [`${key}-cancel`, `${key}-confirm`].map((id) => materialUploadJobSchema.parse({
    id,
    fileName: `${label}.pdf`,
    mimeType: 'application/pdf',
    size: 1,
    materialType: 'class_note',
    createdAt: timestamp,
    updatedAt: timestamp,
    progress: 0,
    status: 'queued',
  }))
  await prisma.task.create({ data: { id: taskValue.id, studentId, type: taskValue.type, status: taskValue.status, dueAt: new Date(taskValue.dueAt!), payload: toInputJson(taskValue) } })
  await prisma.exerciseSet.createMany({ data: [
    { id: setValue.id!, studentId, taskId: taskValue.id, kind: 'task', payload: toInputJson(setValue) },
    { id: bankValue.id!, studentId, taskId: null, kind: 'bank', payload: toInputJson(bankValue) },
  ] })
  await prisma.session.create({ data: { id: sessionValue.sessionId, studentId, taskId: taskValue.id, submittedAt: new Date(sessionValue.completedAt), payload: toInputJson(sessionValue) } })
  await prisma.errorItem.create({ data: { id: errorValue.id, studentId, questionId: errorValue.questionId, status: errorValue.status, lastOccurredAt: new Date(errorValue.lastOccurredAt), payload: toInputJson({ storageVersion: 1, error: errorValue, occurrenceEvidenceBindings: [{ key: `${key}-occurrence`, occurredAt: timestamp, fingerprint: '0'.repeat(64) }] }) } })
  await prisma.note.create({ data: { id: noteValue.id, studentId, version: noteValue.version, updatedAtValue: new Date(noteValue.updatedAt), payload: toInputJson(noteValue) } })
  await prisma.materialUploadJob.createMany({ data: jobs.map((job) => ({ id: job.id, studentId, status: job.status, createdAtValue: new Date(job.createdAt), payload: toInputJson(job) })) })
}

beforeEach(async () => resetDatabase(prisma))
afterAll(async () => { await resetDatabase(prisma); await prisma.$disconnect() })

describe('student isolation across every documented non-Agent ownership family', () => {
  it('allows overlapping ids and keeps every own mutation byte-isolated in both directions', async () => {
    await insertStudent(first, 'First')
    await insertStudent(second, 'Second')
    const one = server(first)
    const two = server(second)
    const tenants = [
      { id: first, otherId: second, label: 'First', app: one, goal: 5 },
      { id: second, otherId: first, label: 'Second', app: two, goal: 6 },
    ] as const
    try {
      for (const tenant of tenants) {
        await ownMutation(tenant.otherId, () => tenant.app.inject({ method: 'PATCH', url: '/api/student/settings', payload: { dailyGoalHours: tenant.goal } }))
        await ownMutation(tenant.otherId, () => tenant.app.inject({ method: 'POST', url: '/api/tasks', payload: ownedTask(tenant.label) }))
        await ownMutation(tenant.otherId, () => tenant.app.inject({ method: 'POST', url: '/api/tasks/shared-task/adjustment-request', payload: taskAdjustmentSchema.parse({ id: 'shared-adjustment', taskId: 'shared-task', reason: 'time_conflict', details: `${tenant.label} conflict`, availableMinutes: 30, proposedDueAt: '2026-08-12T11:00:00.000Z', createdAt: timestamp, status: 'submitted' }) }))
      }

      for (const tenant of tenants) await seedExerciseFixtures(tenant.id, tenant.label)

      for (const tenant of tenants) {
        const taskRead = await tenant.app.inject({ method: 'GET', url: '/api/exercise-sets/shared-task' })
        expect(taskRead.statusCode).toBe(200)
        expect(JSON.stringify(taskRead.json())).toContain(`${tenant.label} question`)
        expect(JSON.stringify(taskRead.json())).not.toContain(`${tenant.label === 'First' ? 'Second' : 'First'} question`)
        const bankRead = await tenant.app.inject({ method: 'GET', url: '/api/bank/exercise/shared-bank' })
        expect(bankRead.statusCode).toBe(200)
        expect(JSON.stringify(bankRead.json())).toContain(`${tenant.label} bank`)
        await ownMutation(tenant.otherId, () => tenant.app.inject({ method: 'POST', url: '/api/sessions', payload: ownedSession(tenant.label) }))
        const summary = await tenant.app.inject({ method: 'GET', url: '/api/summary/shared-session' })
        expect(summary.statusCode).toBe(200)
        expect(summary.json()).toStrictEqual({ code: 0, message: 'ok', data: expectedSummary(tenant.label) })

        await ownMutation(tenant.otherId, () => tenant.app.inject({ method: 'POST', url: '/api/errors/batch', payload: { items: [ownedError(tenant.label)] } }))
        await ownMutation(tenant.otherId, () => tenant.app.inject({ method: 'POST', url: '/api/errors/batch', payload: { items: [ownedError(tenant.label, recurrenceAt, 'shared-occurrence-two')] } }))
        await ownMutation(tenant.otherId, () => tenant.app.inject({ method: 'POST', url: '/api/errors/shared-error/redo', payload: { attemptedAt: '2026-08-11T10:31:00.000Z', answer: '2', isCorrect: true, timeSpent: 2 } }))
      }

      for (const tenant of tenants) await seedVerificationFixture(tenant.id, tenant.label)

      for (const tenant of tenants) {
        await ownMutation(tenant.otherId, () => tenant.app.inject({ method: 'POST', url: '/api/errors/shared-error/verification', payload: { variantId: 'shared-verification-set', isCorrect: true, verifiedAt: '2026-08-11T10:32:00.000Z' } }))
        await ownMutation(tenant.otherId, () => tenant.app.inject({ method: 'PATCH', url: '/api/errors/shared-error', payload: { status: 'mastered' } }))

        await ownMutation(tenant.otherId, () => tenant.app.inject({ method: 'POST', url: '/api/notes', payload: ownedNote(tenant.label) }))
        await ownMutation(tenant.otherId, () => tenant.app.inject({ method: 'PATCH', url: '/api/notes/shared-note', payload: { title: `${tenant.label} edited`, changedAt: patchAt, reason: `${tenant.label.toLowerCase()}_edit` } }))
        await ownMutation(tenant.otherId, () => tenant.app.inject({ method: 'POST', url: '/api/notes/shared-note/organize', payload: { suggestionIds: ['shared-suggestion'], changedAt: organizeAt } }))
        await ownMutation(tenant.otherId, () => tenant.app.inject({ method: 'POST', url: '/api/notes/shared-note/undo', payload: { changedAt: undoAt } }))

        await ownMutation(tenant.otherId, () => tenant.app.inject({ method: 'POST', url: '/api/material-uploads', payload: { id: 'shared-cancel', fileName: `${tenant.label}-cancel.pdf`, mimeType: 'application/pdf', size: 1, materialType: 'class_note', createdAt: timestamp } }))
        await ownMutation(tenant.otherId, () => tenant.app.inject({ method: 'POST', url: '/api/material-uploads/shared-cancel/cancel' }))
        await ownMutation(tenant.otherId, () => tenant.app.inject({ method: 'POST', url: '/api/material-uploads', payload: { id: 'shared-confirm', fileName: `${tenant.label}-confirm.pdf`, mimeType: 'application/pdf', size: 1, materialType: 'class_note', createdAt: timestamp } }))
      }

      for (const tenant of tenants) await transitionMaterial(tenant.id, 'shared-confirm', tenant.label)

      for (const tenant of tenants) {
        await ownMutation(tenant.otherId, () => tenant.app.inject({ method: 'POST', url: '/api/material-uploads/shared-confirm/confirm', payload: {} }))
        await ownMutation(tenant.otherId, () => tenant.app.inject({ method: 'PATCH', url: '/api/tasks/shared-task', payload: { status: 'completed' } }))

        const notes = await tenant.app.inject({ method: 'GET', url: '/api/notes' })
        expect(notes.statusCode).toBe(200)
        const serializedNotes = JSON.stringify(notes.json())
        expect(serializedNotes).toContain(`${tenant.label} edited`)
        expect(serializedNotes).toContain(`${tenant.label} material note`)
        expect(serializedNotes).not.toContain(`${tenant.label === 'First' ? 'Second' : 'First'} material note`)

        const bootstrap = await tenant.app.inject({ method: 'GET', url: '/api/student/bootstrap' })
        expect(bootstrap.statusCode).toBe(200)
        const rawBootstrap = bootstrap.json() as { data: unknown }
        const data = trustedBootstrapDataSchema.parse(rawBootstrap.data)
        expect(bootstrap.json()).toStrictEqual({ code: 0, message: 'ok', data })
        expect(data.student.name).toBe(`${tenant.label} Student`)
        expect(data.settings.dailyGoalHours).toBe(tenant.goal)
        expect(data.tasks.map(({ id }) => id)).toStrictEqual(['shared-task', 'shared-verification-task'])
        expect(data.taskAdjustments.map(({ id }) => id)).toStrictEqual(['shared-adjustment'])
        expect(Object.keys(data.exerciseSets)).toStrictEqual(['shared-set', 'shared-verification-set'])
        expect(Object.keys(data.bankExerciseSets)).toStrictEqual(['shared-bank'])
        expect(Object.keys(data.sessions)).toStrictEqual(['shared-session'])
        expect(data.errors.map(({ id, status }) => ({ id, status }))).toStrictEqual([{ id: 'shared-error', status: 'mastered' }])
        expect(data.notes.map(({ id }) => id).sort()).toStrictEqual(['note-shared-confirm', 'shared-note'])
        expect(data.uploadJobs.map(({ id }) => id).sort()).toStrictEqual(['shared-cancel', 'shared-confirm'])
        expect(data.noteFolders.map(({ id }) => id)).toStrictEqual(['shared-folder'])
        expect(JSON.stringify(data)).not.toContain(`"${tenant.label === 'First' ? 'Second' : 'First'}`)
      }

      await expect(prisma.task.count({ where: { id: 'shared-task' } })).resolves.toBe(2)
      await expect(prisma.task.count({ where: { id: 'shared-verification-task' } })).resolves.toBe(2)
      await expect(prisma.taskAdjustment.count({ where: { id: 'shared-adjustment' } })).resolves.toBe(2)
      await expect(prisma.exerciseSet.count({ where: { id: 'shared-set' } })).resolves.toBe(2)
      await expect(prisma.exerciseSet.count({ where: { id: 'shared-bank' } })).resolves.toBe(2)
      await expect(prisma.exerciseSet.count({ where: { id: 'shared-verification-set' } })).resolves.toBe(2)
      await expect(prisma.session.count({ where: { id: 'shared-session' } })).resolves.toBe(2)
      await expect(prisma.errorItem.count({ where: { id: 'shared-error' } })).resolves.toBe(2)
      await expect(prisma.note.count({ where: { id: 'shared-note' } })).resolves.toBe(2)
      await expect(prisma.note.count({ where: { id: 'note-shared-confirm' } })).resolves.toBe(2)
      await expect(prisma.noteFolder.count({ where: { id: 'shared-folder' } })).resolves.toBe(2)
      await expect(prisma.materialUploadJob.count({ where: { id: 'shared-cancel' } })).resolves.toBe(2)
      await expect(prisma.materialUploadJob.count({ where: { id: 'shared-confirm' } })).resolves.toBe(2)
    } finally { await one.close(); await two.close() }
  })

  it.each([
    ['task exercise read', (app: FastifyInstance, otherKey: string) => app.inject({ method: 'GET', url: `/api/exercise-sets/${otherKey}-task` })],
    ['bank exercise read', (app: FastifyInstance, otherKey: string) => app.inject({ method: 'GET', url: `/api/bank/exercise/${otherKey}-bank` })],
    ['session summary read', (app: FastifyInstance, otherKey: string) => app.inject({ method: 'GET', url: `/api/summary/${otherKey}-session` })],
  ])('makes cross-tenant %s invisible in both directions', async (_name, request) => {
    await insertStudent(first, 'First')
    await insertStudent(second, 'Second')
    await seedExclusiveFixture(first, 'First')
    await seedExclusiveFixture(second, 'Second')
    const one = server(first)
    const two = server(second)
    try {
      expect((await request(one, 'second-only')).statusCode).toBe(404)
      expect((await request(two, 'first-only')).statusCode).toBe(404)
    } finally { await one.close(); await two.close() }
  })

  it.each([
    ['task complete', (app: FastifyInstance, key: string) => app.inject({ method: 'PATCH', url: `/api/tasks/${key}-task`, payload: { status: 'completed' } })],
    ['task adjustment', (app: FastifyInstance, key: string) => app.inject({ method: 'POST', url: `/api/tasks/${key}-task/adjustment-request`, payload: { id: `${key}-adjustment`, taskId: `${key}-task`, reason: 'time_conflict', details: 'cross tenant', availableMinutes: 30, proposedDueAt: '2026-08-12T11:00:00.000Z', createdAt: timestamp, status: 'submitted' } })],
    ['session create provenance', (app: FastifyInstance, key: string) => app.inject({ method: 'POST', url: '/api/sessions', payload: ownedSession(key.startsWith('first') ? 'First' : 'Second', `${key}-cross-session`, `${key}-task`) })],
    ['error redo', (app: FastifyInstance, key: string) => app.inject({ method: 'POST', url: `/api/errors/${key}-error/redo`, payload: { attemptedAt: patchAt, answer: '2', isCorrect: true, timeSpent: 1 } })],
    ['error verification', (app: FastifyInstance, key: string) => app.inject({ method: 'POST', url: `/api/errors/${key}-error/verification`, payload: { variantId: `${key}-set`, isCorrect: true, verifiedAt: patchAt } })],
    ['error mastery', (app: FastifyInstance, key: string) => app.inject({ method: 'PATCH', url: `/api/errors/${key}-error`, payload: { status: 'mastered' } })],
    ['note patch', (app: FastifyInstance, key: string) => app.inject({ method: 'PATCH', url: `/api/notes/${key}-note`, payload: { title: 'cross tenant', changedAt: patchAt, reason: 'cross' } })],
    ['note organize', (app: FastifyInstance, key: string) => app.inject({ method: 'POST', url: `/api/notes/${key}-note/organize`, payload: { suggestionIds: ['shared-suggestion'], changedAt: patchAt } })],
    ['note undo', (app: FastifyInstance, key: string) => app.inject({ method: 'POST', url: `/api/notes/${key}-note/undo`, payload: { changedAt: patchAt } })],
    ['material cancel', (app: FastifyInstance, key: string) => app.inject({ method: 'POST', url: `/api/material-uploads/${key}-cancel/cancel` })],
    ['material confirm', (app: FastifyInstance, key: string) => app.inject({ method: 'POST', url: `/api/material-uploads/${key}-confirm/confirm`, payload: {} })],
  ])('rejects cross-tenant %s without any durable write in both directions', async (_name, request) => {
    await insertStudent(first, 'First')
    await insertStudent(second, 'Second')
    await seedExclusiveFixture(first, 'First')
    await seedExclusiveFixture(second, 'Second')
    const one = server(first)
    const two = server(second)
    try {
      await failedCrossTenantMutation(() => request(one, 'second-only'))
      await failedCrossTenantMutation(() => request(two, 'first-only'))
    } finally { await one.close(); await two.close() }
  })

  it('keeps bootstrap and note list scoped when only the other tenant owns exclusive records', async () => {
    await insertStudent(first, 'First')
    await insertStudent(second, 'Second')
    await seedExclusiveFixture(first, 'First')
    await seedExclusiveFixture(second, 'Second')
    const one = server(first)
    const two = server(second)
    try {
      for (const [app, ownMarker, otherMarker] of [[one, 'First', 'Second'], [two, 'Second', 'First']] as const) {
        const bootstrap = await app.inject({ method: 'GET', url: '/api/student/bootstrap' })
        const notes = await app.inject({ method: 'GET', url: '/api/notes' })
        expect(bootstrap.statusCode).toBe(200)
        expect(notes.statusCode).toBe(200)
        const rawBootstrap = bootstrap.json() as { data: unknown }
        const data = trustedBootstrapDataSchema.parse(rawBootstrap.data)
        const key = `${ownMarker.toLowerCase()}-only`
        expect(bootstrap.json()).toStrictEqual({ code: 0, message: 'ok', data })
        expect(data.student.name).toBe(`${ownMarker} Student`)
        expect(data.tasks.map(({ id }) => id)).toStrictEqual([`${key}-task`])
        expect(data.taskAdjustments).toStrictEqual([])
        expect(Object.keys(data.exerciseSets)).toStrictEqual([`${key}-set`])
        expect(Object.keys(data.bankExerciseSets)).toStrictEqual([`${key}-bank`])
        expect(Object.keys(data.sessions)).toStrictEqual([`${key}-session`])
        expect(data.errors.map(({ id }) => id)).toStrictEqual([`${key}-error`])
        expect(data.notes.map(({ id }) => id)).toStrictEqual([`${key}-note`])
        expect(data.uploadJobs.map(({ id }) => id).sort()).toStrictEqual([`${key}-cancel`, `${key}-confirm`])
        expect(data.noteFolders.map(({ id }) => id)).toStrictEqual(['shared-folder'])
        expect(JSON.stringify(data)).not.toContain(`"${otherMarker}`)
        expect(notes.json()).toStrictEqual({ code: 0, message: 'ok', data: { notes: [ownedNote(ownMarker, `${key}-note`)] } })
      }
    } finally { await one.close(); await two.close() }
  })
})
