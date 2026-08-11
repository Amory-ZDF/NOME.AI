import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../../src/app.js'
import { parseEnv } from '../../src/config/env.js'
import { toInputJson } from '../../src/db/json.js'
import type { Prisma } from '../../src/generated/prisma/client.js'
import {
  createTestPrisma,
  resetDatabase,
  TEST_DATABASE_URL,
} from '../helpers/database.js'

const prisma = createTestPrisma()
const primaryStudentId = 'student-primary'
const otherStudentId = 'student-other'

const settings = {
  tone: 35,
  dailyGoalHours: 4,
  reminderTask: true,
  reminderErrorReview: true,
  reminderStudyTime: false,
}

const greeting = {
  message: 'Keep building momentum.',
  fallback: 'A little progress every day adds up.',
}

const moduleStats = {
  notesCount: 1,
  weeklyExercises: 2,
  latestAccuracy: 78,
  pendingErrorReview: 1,
}

const learningSummary = {
  overallMastery: 62,
  weeklyCompleted: 3,
  weeklyTotal: 5,
  overdueTasks: 0,
  weakTopics: ['Calculus - Extrema'],
  knowledgeHeatmap: [
    { topicId: 'calculus-extrema', topicName: 'Extrema', mastery: 48 },
  ],
}

const hints = [1, 2, 3, 4, 5].map((level) => ({
  level,
  title: `Hint ${level}`,
  content: `Hint content ${level}`,
}))

function question(id: string) {
  return {
    id,
    order: 1,
    type: 'calculation',
    topic: 'Calculus - Extrema',
    difficulty: 3,
    content: '<p>Find the stationary point.</p>',
    acceptKeywords: ['stationary'],
    correctDisplay: 'Differentiate and solve f\'(x)=0.',
    errorType: 'method',
    hints,
    understandingExplanation: 'A stationary point has zero first derivative.',
    scoringExplanation: 'One mark for differentiating and one for solving.',
  }
}

function task(id: string, title: string, status: 'pending' | 'completed') {
  return {
    id,
    title,
    type: 'teacher_assigned',
    subject: 'A-Level Math',
    estimatedMinutes: 30,
    dueAt: '2026-08-20T12:00:00.000Z',
    assignedBy: 'Ms. Wang',
    priority: 'P1',
    isOverdue: false,
    status,
    exerciseSetId: `set-${id}`,
    ...(status === 'completed'
      ? { completedAt: '2026-08-10T12:00:00.000Z' }
      : {}),
  }
}

function exerciseSet(id: string, taskId: string | null, title: string) {
  return {
    id,
    taskId,
    title,
    subject: 'A-Level Math',
    questions: [question(`question-${id}`)],
  }
}

function session(id: string, taskId: string) {
  return {
    sessionId: id,
    taskId,
    taskTitle: 'Primary session',
    subject: 'A-Level Math',
    completedAt: '2026-08-10T12:00:00.000Z',
    timeSpent: 12,
    timeSpentSeconds: 720,
    questions: [
      {
        ...question(`question-${id}`),
        result: {
          status: 'correct',
          attempts: [
            {
              answer: 'stationary',
              submittedAt: '2026-08-10T11:59:00.000Z',
              isCorrect: true,
            },
          ],
          hintsUsed: 1,
          solvedAtHintLevel: 1,
          handwritingUsed: false,
        },
      },
    ],
  }
}

function errorItem(id: string, questionId: string) {
  const occurredAt = '2026-08-10T12:00:00.000Z'
  const occurrenceKey = `session:session-a:question:${questionId}`
  return {
    id,
    questionId,
    sessionId: 'session-a',
    subject: 'A-Level Math',
    errorType: 'method',
    questionSummary: 'Find a stationary point.',
    questionContent: '<p>Find a stationary point.</p>',
    type: 'calculation',
    difficulty: 3,
    errorDescription: 'The derivative method was not applied.',
    relatedTopic: 'Calculus - Extrema',
    topicId: 'calculus-extrema',
    whereWrong: 'The first step.',
    whyWrong: 'The derivative rule was recalled incorrectly.',
    linkedAbility: 'Select an appropriate differentiation method.',
    hintDependency: 1,
    firstOccurredAt: occurredAt,
    lastOccurredAt: occurredAt,
    occurrences: [occurredAt],
    occurrenceKeys: [occurrenceKey],
    occurrenceRecords: [{ key: occurrenceKey, occurredAt }],
    repeatCount: 1,
    status: 'pending_review',
    studentAnswer: 'x=1',
    correctAnswer: 'x=2',
    analysis: 'Differentiate before solving.',
    acceptKeywords: ['x=2'],
    redoHistory: [],
    verificationVariantId: null,
    variantVerifiedAt: null,
    variantVerification: null,
  }
}

function note(id: string, title: string) {
  return {
    id,
    title,
    folderId: 'folder-root',
    folderPath: 'A-Level Math',
    tags: ['calculus'],
    linkedTopics: ['calculus-extrema'],
    linkedErrors: ['error-a'],
    source: 'typed',
    createdAt: '2026-08-01',
    updatedAt: '2026-08-10',
    content: [{ t: 'p', v: 'Differentiate before solving.' }],
    aiSuggestions: [],
    version: 1,
    versions: [],
  }
}

function folder(id: string, name: string) {
  return {
    id,
    name,
    noteCount: 1,
    autoCreated: false,
  }
}

function uploadJob(id: string) {
  return {
    id,
    fileName: 'calculus.pdf',
    mimeType: 'application/pdf',
    size: 4096,
    materialType: 'class_note',
    createdAt: '2026-08-10T10:00:00.000Z',
    updatedAt: '2026-08-10T10:00:00.000Z',
    progress: 0,
    status: 'queued',
  }
}

async function insertStudentFixture(studentId: string, label: string) {
  await prisma.student.create({
    data: {
      id: studentId,
      name: `${label} Student`,
      avatar: null,
      joinedDays: 45,
      gradeInfo: 'A-Level · Year 12 Science',
      greeting: toInputJson({ ...greeting, message: `${label} greeting` }),
      moduleStats: toInputJson(moduleStats),
      learningSummary: toInputJson(learningSummary),
    },
  })

  const taskZ = task('task-z', `${label} Z task`, 'pending')
  const taskA = task('task-a', `${label} A task`, 'completed')
  await prisma.task.createMany({
    data: [
      {
        id: taskZ.id,
        studentId,
        type: taskZ.type,
        status: taskZ.status,
        dueAt: new Date(taskZ.dueAt),
        payload: toInputJson(taskZ),
      },
      {
        id: taskA.id,
        studentId,
        type: taskA.type,
        status: taskA.status,
        dueAt: new Date(taskA.dueAt),
        payload: toInputJson(taskA),
      },
    ],
  })

  const adjustment = {
    id: 'adjustment-a',
    taskId: 'task-z',
    reason: 'time_conflict',
    details: 'Two deadlines overlap.',
    availableMinutes: 30,
    proposedDueAt: '2026-08-21T12:00:00.000Z',
    createdAt: '2026-08-10T09:00:00.000Z',
    status: 'submitted',
  }
  await prisma.taskAdjustment.create({
    data: {
      id: adjustment.id,
      studentId,
      taskId: adjustment.taskId,
      status: adjustment.status,
      createdAt: new Date(adjustment.createdAt),
      payload: toInputJson(adjustment),
    },
  })

  const setZ = exerciseSet('set-z', 'task-z', `${label} Z set`)
  const setA = exerciseSet('set-a', 'task-a', `${label} A set`)
  const bankZ = exerciseSet('bank-z', null, `${label} Z bank set`)
  const bankA = exerciseSet('bank-a', null, `${label} A bank set`)
  await prisma.exerciseSet.createMany({
    data: [
      { id: setZ.id, studentId, taskId: setZ.taskId, kind: 'task', payload: toInputJson(setZ) },
      { id: setA.id, studentId, taskId: setA.taskId, kind: 'task', payload: toInputJson(setA) },
      { id: bankZ.id, studentId, taskId: null, kind: 'bank', payload: toInputJson(bankZ) },
      { id: bankA.id, studentId, taskId: null, kind: 'bank', payload: toInputJson(bankA) },
    ],
  })

  const sessionZ = session('session-z', 'task-z')
  const sessionA = session('session-a', 'task-a')
  await prisma.session.createMany({
    data: [sessionZ, sessionA].map((value) => ({
      id: value.sessionId,
      studentId,
      taskId: value.taskId,
      submittedAt: new Date(value.completedAt),
      payload: toInputJson(value),
    })),
  })

  const errorZ = errorItem('error-z', 'question-z')
  const errorA = errorItem('error-a', 'question-a')
  await prisma.errorItem.createMany({
    data: [errorZ, errorA].map((value) => ({
      id: value.id,
      studentId,
      questionId: value.questionId,
      status: value.status,
      lastOccurredAt: new Date(value.lastOccurredAt),
      payload: toInputJson(value),
    })),
  })

  const noteZ = note('note-z', `${label} Z note`)
  const noteA = note('note-a', `${label} A note`)
  await prisma.note.createMany({
    data: [noteZ, noteA].map((value) => ({
      id: value.id,
      studentId,
      version: value.version,
      updatedAtValue: new Date(`${value.updatedAt}T00:00:00.000Z`),
      payload: toInputJson(value),
    })),
  })

  const folderZ = folder('folder-z', `${label} Z folder`)
  const folderA = folder('folder-a', `${label} A folder`)
  await prisma.noteFolder.createMany({
    data: [folderZ, folderA].map((value) => ({
      id: value.id,
      studentId,
      parentId: null,
      payload: toInputJson(value),
    })),
  })

  const jobZ = uploadJob('upload-z')
  const jobA = uploadJob('upload-a')
  await prisma.materialUploadJob.createMany({
    data: [jobZ, jobA].map((value) => ({
      id: value.id,
      studentId,
      status: value.status,
      createdAtValue: new Date(value.createdAt),
      payload: toInputJson(value),
    })),
  })

  await prisma.studentSettings.create({
    data: { studentId, payload: toInputJson(settings) },
  })
}

function createApp(studentId = primaryStudentId) {
  return buildApp({
    env: parseEnv({
      NODE_ENV: 'test',
      DATABASE_URL: TEST_DATABASE_URL,
      STUDENT_ID: studentId,
      LOG_LEVEL: 'silent',
    }),
    prisma,
  })
}

beforeEach(async () => {
  await resetDatabase(prisma)
})

afterAll(async () => {
  await resetDatabase(prisma)
  await prisma.$disconnect()
})

describe('GET /api/student/bootstrap', () => {
  it('returns the exact complete bootstrap shape as deterministic records and lists', async () => {
    await insertStudentFixture(primaryStudentId, 'Primary')
    const app = createApp()

    const response = await app.inject({ method: 'GET', url: '/api/student/bootstrap' })
    await app.close()

    expect(response.statusCode).toBe(200)
    const data = response.json().data
    expect(Object.keys(data).sort()).toEqual(
      [
        'bankExerciseSets',
        'errors',
        'exerciseSets',
        'greeting',
        'learningSummary',
        'moduleStats',
        'noteFolders',
        'notes',
        'sessions',
        'settings',
        'student',
        'taskAdjustments',
        'tasks',
        'uploadJobs',
      ].sort(),
    )
    expect(Array.isArray(data.exerciseSets)).toBe(false)
    expect(Array.isArray(data.bankExerciseSets)).toBe(false)
    expect(Array.isArray(data.sessions)).toBe(false)
    expect(Object.keys(data.exerciseSets)).toEqual(['set-a', 'set-z'])
    expect(Object.keys(data.bankExerciseSets)).toEqual(['bank-a', 'bank-z'])
    expect(Object.keys(data.sessions)).toEqual(['session-a', 'session-z'])
    expect(data.tasks.map(({ id }: { id: string }) => id)).toEqual(['task-a', 'task-z'])
    expect(data.errors.map(({ id }: { id: string }) => id)).toEqual(['error-a', 'error-z'])
    expect(data.notes.map(({ id }: { id: string }) => id)).toEqual(['note-a', 'note-z'])
    expect(data.noteFolders.map(({ id }: { id: string }) => id)).toEqual([
      'folder-a',
      'folder-z',
    ])
    expect(data.uploadJobs.map(({ id }: { id: string }) => id)).toEqual([
      'upload-a',
      'upload-z',
    ])
  })

  it('returns only the configured student when aggregate ids overlap', async () => {
    await insertStudentFixture(primaryStudentId, 'Primary')
    await insertStudentFixture(otherStudentId, 'Other')
    const app = createApp(primaryStudentId)

    const response = await app.inject({ method: 'GET', url: '/api/student/bootstrap' })
    await app.close()

    expect(response.statusCode).toBe(200)
    const serialized = JSON.stringify(response.json().data)
    expect(serialized).toContain('Primary')
    expect(serialized).not.toContain('Other')
  })

  it('returns every independently valid session when the trusted aggregate exceeds one payload budget', async () => {
    await insertStudentFixture(primaryStudentId, 'Primary')
    await prisma.session.deleteMany({ where: { studentId: primaryStudentId } })
    const sessions = Array.from({ length: 200 }, (_, index) => {
      const id = `bulk-session-${String(index).padStart(3, '0')}`
      return session(id, 'task-a')
    })
    await prisma.session.createMany({
      data: sessions.map((value) => ({
        id: value.sessionId,
        studentId: primaryStudentId,
        taskId: value.taskId,
        submittedAt: new Date(value.completedAt),
        payload: toInputJson(value),
      })),
    })
    const app = createApp()

    const response = await app.inject({ method: 'GET', url: '/api/student/bootstrap' })
    await app.close()

    expect(response.statusCode).toBe(200)
    const data = response.json().data
    expect(Object.keys(data)).toHaveLength(14)
    expect(Object.keys(data.sessions).sort()).toEqual(
      sessions.map(({ sessionId }) => sessionId).sort(),
    )
  })

  it('returns 404 for a missing configured student without creating one', async () => {
    const app = createApp('missing-student')

    const response = await app.inject({ method: 'GET', url: '/api/student/bootstrap' })
    await app.close()

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({
      code: 'NOT_FOUND',
      message: 'Student not found',
      data: null,
    })
    await expect(prisma.student.count()).resolves.toBe(0)
  })

  it('returns a safe 500 contract error instead of filtering invalid stored payloads', async () => {
    await insertStudentFixture(primaryStudentId, 'Primary')
    await prisma.task.update({
      where: { studentId_id: { studentId: primaryStudentId, id: 'task-a' } },
      data: { payload: toInputJson({ id: 'task-a', title: 'incomplete payload' }) },
    })
    const app = createApp()

    const response = await app.inject({ method: 'GET', url: '/api/student/bootstrap' })
    await app.close()

    expect(response.statusCode).toBe(500)
    expect(response.json()).toEqual({
      code: 'STORED_DATA_INVALID',
      message: 'Stored student data is invalid',
      data: null,
    })
    expect(response.body).not.toMatch(/Zod|payload|expected|stack/i)
  })

  it('keeps the per-payload safety budget for a single oversized stored item', async () => {
    await insertStudentFixture(primaryStudentId, 'Primary')
    const oversizedPayload = {
      ...task('task-a', 'Oversized task', 'completed'),
      topicIds: Array.from({ length: 5_001 }, (_, index) => `topic-${index}`),
    } as Prisma.InputJsonValue
    await prisma.task.update({
      where: { studentId_id: { studentId: primaryStudentId, id: 'task-a' } },
      data: { payload: oversizedPayload },
    })
    const app = createApp()

    const response = await app.inject({ method: 'GET', url: '/api/student/bootstrap' })
    await app.close()

    expect(response.statusCode).toBe(500)
    expect(response.json()).toEqual({
      code: 'STORED_DATA_INVALID',
      message: 'Stored student data is invalid',
      data: null,
    })
  })

  it.each([
    [
      'Task.dueAt',
      async () =>
        prisma.task.update({
          where: { studentId_id: { studentId: primaryStudentId, id: 'task-a' } },
          data: { dueAt: new Date('2026-08-22T12:00:00.000Z') },
        }),
    ],
    [
      'Task.dueAt null presence',
      async () =>
        prisma.task.update({
          where: { studentId_id: { studentId: primaryStudentId, id: 'task-a' } },
          data: { dueAt: null },
        }),
    ],
    [
      'TaskAdjustment.createdAt',
      async () =>
        prisma.taskAdjustment.update({
          where: {
            studentId_id: {
              studentId: primaryStudentId,
              id: 'adjustment-a',
            },
          },
          data: { createdAt: new Date('2026-08-12T09:00:00.000Z') },
        }),
    ],
    [
      'Session.submittedAt',
      async () =>
        prisma.session.update({
          where: { studentId_id: { studentId: primaryStudentId, id: 'session-a' } },
          data: { submittedAt: new Date('2026-08-12T12:00:00.000Z') },
        }),
    ],
    [
      'ErrorItem.lastOccurredAt',
      async () =>
        prisma.errorItem.update({
          where: { studentId_id: { studentId: primaryStudentId, id: 'error-a' } },
          data: { lastOccurredAt: new Date('2026-08-12T12:00:00.000Z') },
        }),
    ],
    [
      'Note.updatedAtValue',
      async () =>
        prisma.note.update({
          where: { studentId_id: { studentId: primaryStudentId, id: 'note-a' } },
          data: { updatedAtValue: new Date('2026-08-12T00:00:00.000Z') },
        }),
    ],
    [
      'MaterialUploadJob.createdAtValue',
      async () =>
        prisma.materialUploadJob.update({
          where: { studentId_id: { studentId: primaryStudentId, id: 'upload-a' } },
          data: { createdAtValue: new Date('2026-08-12T10:00:00.000Z') },
        }),
    ],
  ])('rejects %s scalar/payload corruption without filtering', async (_field, corrupt) => {
    await insertStudentFixture(primaryStudentId, 'Primary')
    await corrupt()
    const app = createApp()

    const response = await app.inject({ method: 'GET', url: '/api/student/bootstrap' })
    await app.close()

    expect(response.statusCode).toBe(500)
    expect(response.json()).toEqual({
      code: 'STORED_DATA_INVALID',
      message: 'Stored student data is invalid',
      data: null,
    })
    expect(response.body).not.toMatch(/payload|Prisma|stack|expected/i)
  })

  it('accepts equivalent scalar and payload datetimes expressed with offsets', async () => {
    await insertStudentFixture(primaryStudentId, 'Primary')
    await prisma.task.update({
      where: { studentId_id: { studentId: primaryStudentId, id: 'task-z' } },
      data: {
        payload: toInputJson({
          ...task('task-z', 'Primary Z task', 'pending'),
          dueAt: '2026-08-20T13:00:00.000+01:00',
        }),
      },
    })
    const app = createApp()

    const response = await app.inject({ method: 'GET', url: '/api/student/bootstrap' })
    await app.close()

    expect(response.statusCode).toBe(200)
    expect(response.json().data.tasks.find(({ id }: { id: string }) => id === 'task-z'))
      .toMatchObject({ dueAt: '2026-08-20T13:00:00.000+01:00' })
  })

  it('publishes bootstrap success and error envelopes in OpenAPI', async () => {
    const app = createApp()

    const response = await app.inject({ method: 'GET', url: '/documentation/json' })
    await app.close()

    expect(response.statusCode).toBe(200)
    const operation = response.json().paths['/api/student/bootstrap'].get
    expect(Object.keys(operation.responses).sort()).toEqual(['200', '404', '500'])
    const errorSchemas = ['404', '500'].map(
      (status) => operation.responses[status].content['application/json'].schema,
    )
    expect(errorSchemas[1]).toEqual(errorSchemas[0])
    expect(errorSchemas[0]).toMatchObject({
      type: 'object',
      required: expect.arrayContaining(['code', 'message', 'data']),
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
      },
    })
  })
})
