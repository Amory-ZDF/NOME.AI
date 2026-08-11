import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../../src/app.js'
import { parseEnv } from '../../src/config/env.js'
import { toInputJson } from '../../src/db/json.js'
import {
  createTestPrisma,
  resetDatabase,
  TEST_DATABASE_URL,
} from '../helpers/database.js'

const prisma = createTestPrisma()
const primaryStudentId = 'exercise-student-primary'
const otherStudentId = 'exercise-student-other'

function makeQuestion(id = 'question-primary') {
  return {
    id,
    order: 1,
    type: 'calculation',
    topic: 'Calculus - Extrema',
    difficulty: 3,
    content: '<p>Find the stationary point.</p>',
    acceptKeywords: ['stationary'],
    correctDisplay: "Differentiate and solve f'(x)=0.",
    errorType: 'method',
    hints: [1, 2, 3, 4, 5].map((level) => ({
      level,
      title: `Hint ${level}`,
      content: `Hint content ${level}`,
    })),
  }
}

function makeExerciseSet(overrides: Record<string, unknown> = {}) {
  return {
    id: 'set-primary',
    taskId: 'task-primary',
    title: 'Calculus practice',
    subject: 'A-Level Math',
    questions: [makeQuestion()],
    ...overrides,
  }
}

function makeTask(id = 'task-primary') {
  return {
    id,
    title: 'Calculus practice',
    type: 'teacher_assigned',
    subject: 'A-Level Math',
    estimatedMinutes: 30,
    dueAt: '2026-08-12T12:00:00.000Z',
    assignedBy: 'Ms. Wang',
    priority: 'P1',
    isOverdue: false,
    status: 'pending',
    exerciseSetId: 'set-primary',
  }
}

async function insertStudent(studentId: string) {
  await prisma.student.create({
    data: {
      id: studentId,
      name: `Student ${studentId}`,
      avatar: null,
      joinedDays: 10,
      gradeInfo: 'A-Level - Year 12 Science',
      greeting: toInputJson({ message: 'Hello', fallback: 'Welcome' }),
      moduleStats: toInputJson({
        notesCount: 0,
        weeklyExercises: 0,
        latestAccuracy: 0,
        pendingErrorReview: 0,
      }),
      learningSummary: toInputJson({
        overallMastery: 0,
        weeklyCompleted: 0,
        weeklyTotal: 0,
        overdueTasks: 0,
        weakTopics: [],
        knowledgeHeatmap: [],
      }),
    },
  })
}

async function insertTask(studentId: string, id = 'task-primary') {
  const task = makeTask(id)
  await prisma.task.create({
    data: {
      id,
      studentId,
      type: task.type,
      status: task.status,
      dueAt: new Date(task.dueAt),
      payload: toInputJson(task),
    },
  })
}

async function insertExerciseSet(
  studentId: string,
  kind: string,
  value = makeExerciseSet(),
  stored: Partial<{ id: string; taskId: string | null }> = {},
) {
  await prisma.exerciseSet.create({
    data: {
      id: stored.id ?? String(value.id),
      studentId,
      taskId:
        stored.taskId !== undefined
          ? stored.taskId
          : value.taskId === null
            ? null
            : String(value.taskId),
      kind,
      payload: toInputJson(value),
    },
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

describe('GET /api/exercise-sets/{taskId}', () => {
  it('returns the one task-kind set for the configured student as bare response data', async () => {
    await insertStudent(primaryStudentId)
    await insertTask(primaryStudentId)
    const exerciseSet = makeExerciseSet()
    await insertExerciseSet(primaryStudentId, 'task', exerciseSet)
    const before = await prisma.exerciseSet.findMany({
      orderBy: [{ studentId: 'asc' }, { id: 'asc' }],
    })
    const app = createApp()

    const response = await app.inject({
      method: 'GET',
      url: '/api/exercise-sets/task-primary',
    })
    await app.close()

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      code: 0,
      message: 'ok',
      data: exerciseSet,
    })
    await expect(
      prisma.exerciseSet.findMany({
        orderBy: [{ studentId: 'asc' }, { id: 'asc' }],
      }),
    ).resolves.toEqual(before)
  })

  it('returns 404 instead of resolving a bank-kind row with the requested taskId', async () => {
    await insertStudent(primaryStudentId)
    await insertTask(primaryStudentId)
    await insertExerciseSet(
      primaryStudentId,
      'bank',
      makeExerciseSet({ id: 'bank-with-task' }),
    )
    const app = createApp()

    const response = await app.inject({
      method: 'GET',
      url: '/api/exercise-sets/task-primary',
    })
    await app.close()

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({
      code: 'NOT_FOUND',
      message: 'Exercise set not found',
      data: null,
    })
  })

  it('returns 404 for a task set owned by another student', async () => {
    await insertStudent(primaryStudentId)
    await insertStudent(otherStudentId)
    await insertTask(otherStudentId)
    await insertExerciseSet(otherStudentId, 'task')
    const app = createApp()

    const response = await app.inject({
      method: 'GET',
      url: '/api/exercise-sets/task-primary',
    })
    await app.close()

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ code: 'NOT_FOUND', data: null })
  })

  it('fails closed when duplicate task-kind sets point at the same task', async () => {
    await insertStudent(primaryStudentId)
    await insertTask(primaryStudentId)
    await insertExerciseSet(primaryStudentId, 'task')
    await insertExerciseSet(
      primaryStudentId,
      'task',
      makeExerciseSet({ id: 'set-duplicate', title: 'Duplicate set' }),
    )
    const app = createApp()

    const response = await app.inject({
      method: 'GET',
      url: '/api/exercise-sets/task-primary',
    })
    await app.close()

    expect(response.statusCode).toBe(500)
    expect(response.json()).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      data: null,
    })
  })

  it.each([
    [
      'payload id differs from its row id',
      { id: 'set-tampered' },
      { id: 'set-primary' },
    ],
    [
      'payload taskId differs from its row taskId',
      { taskId: 'task-tampered' },
      { taskId: 'task-primary' },
    ],
  ])('returns a generic 500 when %s', async (
    _label,
    payloadOverrides,
    storedOverrides,
  ) => {
    await insertStudent(primaryStudentId)
    await insertTask(primaryStudentId)
    await insertExerciseSet(
      primaryStudentId,
      'task',
      makeExerciseSet(payloadOverrides),
      storedOverrides,
    )
    const app = createApp()

    const response = await app.inject({
      method: 'GET',
      url: '/api/exercise-sets/task-primary',
    })
    await app.close()

    expect(response.statusCode).toBe(500)
    expect(response.json()).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      data: null,
    })
  })

  it('accepts a legitimate encoded Unicode task id including a slash', async () => {
    const taskId = '任务/一'
    await insertStudent(primaryStudentId)
    await insertTask(primaryStudentId, taskId)
    const exerciseSet = makeExerciseSet({ taskId })
    await insertExerciseSet(primaryStudentId, 'task', exerciseSet)
    const app = createApp()

    const response = await app.inject({
      method: 'GET',
      url: `/api/exercise-sets/${encodeURIComponent(taskId)}`,
    })
    await app.close()

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ data: exerciseSet })
  })
})

describe('GET /api/bank/exercise/{setId}', () => {
  it('returns a bank-kind set by id as bare response data', async () => {
    await insertStudent(primaryStudentId)
    const exerciseSet = makeExerciseSet({
      id: 'bank-primary',
      taskId: null,
      title: 'Bank practice',
    })
    await insertExerciseSet(primaryStudentId, 'bank', exerciseSet)
    const app = createApp()

    const response = await app.inject({
      method: 'GET',
      url: '/api/bank/exercise/bank-primary',
    })
    await app.close()

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      code: 0,
      message: 'ok',
      data: exerciseSet,
    })
  })

  it('returns 404 instead of resolving a task-kind row by set id', async () => {
    await insertStudent(primaryStudentId)
    await insertTask(primaryStudentId)
    await insertExerciseSet(primaryStudentId, 'task')
    const app = createApp()

    const response = await app.inject({
      method: 'GET',
      url: '/api/bank/exercise/set-primary',
    })
    await app.close()

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ code: 'NOT_FOUND', data: null })
  })

  it('returns 404 for a bank set owned by another student', async () => {
    await insertStudent(primaryStudentId)
    await insertStudent(otherStudentId)
    await insertExerciseSet(
      otherStudentId,
      'bank',
      makeExerciseSet({ id: 'bank-other', taskId: null }),
    )
    const app = createApp()

    const response = await app.inject({
      method: 'GET',
      url: '/api/bank/exercise/bank-other',
    })
    await app.close()

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ code: 'NOT_FOUND', data: null })
  })

  it('returns INTERNAL_ERROR without leaking malformed stored question or hint JSON', async () => {
    await insertStudent(primaryStudentId)
    const secret = 'SECRET_STORED_HINT_CONTENT'
    const malformed = makeExerciseSet({
      id: 'bank-malformed',
      taskId: null,
      questions: [
        {
          ...makeQuestion('question-malformed'),
          hints: [{ level: 1, title: 'Broken', content: secret }],
        },
      ],
    })
    await insertExerciseSet(primaryStudentId, 'bank', malformed)
    const app = createApp()

    const response = await app.inject({
      method: 'GET',
      url: '/api/bank/exercise/bank-malformed',
    })
    await app.close()

    expect(response.statusCode).toBe(500)
    expect(response.json()).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      data: null,
    })
    expect(response.body).not.toContain(secret)
    expect(response.body).not.toContain('hints')
  })
})

describe('exercise route boundaries and OpenAPI', () => {
  it.each([
    '/api/exercise-sets/%20',
    '/api/bank/exercise/%00',
    '/api/exercise-sets/%E0%A4%A',
  ])('rejects a blank or invalid encoded id with 400: %s', async (url) => {
    const app = createApp()

    const response = await app.inject({ method: 'GET', url })
    await app.close()

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({
      code: 'INVALID_INPUT',
      message: 'Invalid request',
      data: null,
    })
  })

  it('documents the real success and error statuses for both read routes', async () => {
    const app = createApp()
    await app.ready()

    const document = app.swagger()
    await app.close()

    for (const path of [
      '/api/exercise-sets/{taskId}',
      '/api/bank/exercise/{setId}',
    ]) {
      expect(Object.keys(document.paths?.[path]?.get?.responses ?? {}).sort()).toEqual([
        '200',
        '400',
        '404',
        '500',
      ])
    }
  })
})
