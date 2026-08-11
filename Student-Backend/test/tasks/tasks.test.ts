import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildApp } from '../../src/app.js'
import { parseEnv } from '../../src/config/env.js'
import { toInputJson } from '../../src/db/json.js'
import {
  createTestPrisma,
  resetDatabase,
  TEST_DATABASE_URL,
} from '../helpers/database.js'

const prisma = createTestPrisma()
const primaryStudentId = 'task-student-primary'
const otherStudentId = 'task-student-other'
const firstClockInstant = new Date('2026-08-11T10:00:00.000Z')
const secondClockInstant = new Date('2026-08-11T11:00:00.000Z')

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-primary',
    title: 'Calculus practice',
    type: 'teacher_assigned',
    subject: 'A-Level Math',
    estimatedMinutes: 30,
    dueAt: '2026-08-12T12:00:00.000Z',
    assignedBy: 'Ms. Wang',
    priority: 'P1',
    isOverdue: false,
    status: 'pending',
    topicIds: ['calculus-extrema'],
    ...overrides,
  }
}

function makeAdjustment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'adjustment-primary',
    taskId: 'task-primary',
    reason: 'difficulty',
    details: 'I need more time to review differentiation.',
    availableMinutes: 30,
    proposedDueAt: '2026-08-13T12:00:00.000Z',
    createdAt: '2026-08-11T09:00:00.000Z',
    status: 'submitted',
    ...overrides,
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

async function insertTask(studentId: string, overrides: Record<string, unknown> = {}) {
  const task = makeTask(overrides)
  await prisma.task.create({
    data: {
      id: String(task.id),
      studentId,
      type: String(task.type),
      status: String(task.status),
      dueAt: task.dueAt === null ? null : new Date(String(task.dueAt)),
      payload: toInputJson(task),
    },
  })
  return task
}

async function insertAdjustment(
  studentId: string,
  overrides: Record<string, unknown> = {},
) {
  const request = makeAdjustment(overrides)
  await prisma.taskAdjustment.create({
    data: {
      id: String(request.id),
      studentId,
      taskId: String(request.taskId),
      status: String(request.status),
      createdAt: new Date(String(request.createdAt)),
      payload: toInputJson(request),
    },
  })
  return request
}

function createApp(
  studentId = primaryStudentId,
  now: () => Date = () => firstClockInstant,
) {
  return buildApp({
    env: parseEnv({
      NODE_ENV: 'test',
      DATABASE_URL: TEST_DATABASE_URL,
      STUDENT_ID: studentId,
      LOG_LEVEL: 'silent',
    }),
    prisma,
    now,
  })
}

async function readTask(studentId = primaryStudentId, id = 'task-primary') {
  return prisma.task.findUnique({ where: { studentId_id: { studentId, id } } })
}

beforeEach(async () => {
  await resetDatabase(prisma)
})

afterAll(async () => {
  await resetDatabase(prisma)
  await prisma.$disconnect()
})

describe('POST /api/tasks', () => {
  it('creates the full validated task and synchronizes its indexed fields', async () => {
    await insertStudent(primaryStudentId)
    const task = makeTask({ isOverdue: true })
    const app = createApp()

    const response = await app.inject({ method: 'POST', url: '/api/tasks', payload: task })
    await app.close()

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      code: 0,
      message: 'ok',
      data: { task },
    })
    const stored = await readTask()
    expect(stored).toMatchObject({
      studentId: primaryStudentId,
      id: task.id,
      type: task.type,
      status: task.status,
    })
    expect(stored?.dueAt?.toISOString()).toBe(task.dueAt)
    expect(stored?.payload).toEqual(task)
  })

  it('returns DUPLICATE_ID without mutating an existing task', async () => {
    await insertStudent(primaryStudentId)
    await insertTask(primaryStudentId)
    const before = await readTask()
    const app = createApp()

    const response = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: makeTask({ title: 'Replacement title' }),
    })
    await app.close()

    expect(response.statusCode).toBe(409)
    expect(response.json()).toEqual({
      code: 'DUPLICATE_ID',
      message: 'Task id already exists',
      data: null,
    })
    expect(await readTask()).toEqual(before)
    await expect(prisma.task.count({ where: { studentId: primaryStudentId } })).resolves.toBe(1)
  })

  it('allows the same client id in another student scope', async () => {
    await insertStudent(primaryStudentId)
    await insertStudent(otherStudentId)
    await insertTask(otherStudentId, { title: 'Other task' })
    const task = makeTask()
    const app = createApp()

    const response = await app.inject({ method: 'POST', url: '/api/tasks', payload: task })
    await app.close()

    expect(response.statusCode).toBe(200)
    await expect(readTask(primaryStudentId)).resolves.toMatchObject({ payload: task })
    await expect(readTask(otherStudentId)).resolves.toMatchObject({
      payload: expect.objectContaining({ title: 'Other task' }),
    })
  })

  it('rejects an incomplete task before writing any row', async () => {
    await insertStudent(primaryStudentId)
    const app = createApp()

    const response = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { id: 'task-incomplete' },
    })
    await app.close()

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      code: 'INVALID_INPUT',
      message: 'Invalid request',
      data: null,
    })
    await expect(prisma.task.count()).resolves.toBe(0)
  })
})

describe('PATCH /api/tasks/{id}', () => {
  it('completes a scoped task using the injected clock', async () => {
    await insertStudent(primaryStudentId)
    const original = await insertTask(primaryStudentId, { isOverdue: true })
    const now = vi.fn(() => firstClockInstant)
    const app = createApp(primaryStudentId, now)

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/tasks/task-primary',
      payload: { status: 'completed' },
    })
    await app.close()

    const expected = {
      ...original,
      status: 'completed',
      completedAt: firstClockInstant.toISOString(),
      isOverdue: false,
    }
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      code: 0,
      message: 'ok',
      data: { task: expected },
    })
    expect(now).toHaveBeenCalledTimes(1)
    await expect(readTask()).resolves.toMatchObject({
      status: 'completed',
      type: original.type,
      dueAt: new Date(String(original.dueAt)),
      payload: expected,
    })
  })

  it('is idempotent and never rewrites an existing completedAt', async () => {
    await insertStudent(primaryStudentId)
    const completedAt = '2026-08-10T08:00:00.000Z'
    const original = await insertTask(primaryStudentId, {
      status: 'completed',
      completedAt,
      isOverdue: false,
    })
    const now = vi.fn(() => secondClockInstant)
    const app = createApp(primaryStudentId, now)

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/tasks/task-primary',
      payload: { status: 'completed' },
    })
    await app.close()

    expect(response.statusCode).toBe(200)
    expect(response.json().data.task).toEqual(original)
    expect(response.json().data.task.completedAt).toBe(completedAt)
    expect(now).not.toHaveBeenCalled()
    await expect(readTask()).resolves.toMatchObject({ payload: original })
  })

  it('repairs completed task overdue state without rewriting its timestamp bytes', async () => {
    await insertStudent(primaryStudentId)
    const completedAt = '2026-08-10T16:00:00.000+08:00'
    const task = makeTask({
      status: 'completed',
      completedAt,
      isOverdue: true,
    })
    const now = vi.fn(() => secondClockInstant)
    const app = createApp(primaryStudentId, now)

    const created = await app.inject({ method: 'POST', url: '/api/tasks', payload: task })
    const completed = await app.inject({
      method: 'PATCH',
      url: '/api/tasks/task-primary',
      payload: { status: 'completed' },
    })
    await app.close()

    expect(created.statusCode).toBe(200)
    expect(completed.statusCode).toBe(200)
    expect(completed.json().data.task).toEqual({
      ...task,
      completedAt,
      isOverdue: false,
    })
    expect(now).not.toHaveBeenCalled()
    await expect(readTask()).resolves.toMatchObject({
      status: 'completed',
      payload: { ...task, completedAt, isOverdue: false },
    })
  })

  it('fills a missing completedAt once and preserves it on later completion calls', async () => {
    await insertStudent(primaryStudentId)
    await insertTask(primaryStudentId, {
      status: 'completed',
      isOverdue: false,
    })
    const now = vi
      .fn<() => Date>()
      .mockReturnValueOnce(firstClockInstant)
      .mockReturnValue(secondClockInstant)
    const app = createApp(primaryStudentId, now)

    const first = await app.inject({
      method: 'PATCH',
      url: '/api/tasks/task-primary',
      payload: { status: 'completed' },
    })
    const second = await app.inject({
      method: 'PATCH',
      url: '/api/tasks/task-primary',
      payload: { status: 'completed' },
    })
    await app.close()

    expect(first.statusCode).toBe(200)
    expect(second.statusCode).toBe(200)
    expect(first.json().data.task).toMatchObject({
      status: 'completed',
      completedAt: firstClockInstant.toISOString(),
      isOverdue: false,
    })
    expect(second.json().data.task).toEqual(first.json().data.task)
    expect(now).toHaveBeenCalledTimes(1)
    await expect(readTask()).resolves.toMatchObject({
      payload: first.json().data.task,
    })
  })

  it('serializes concurrent repairs of a missing completedAt to one clock value', async () => {
    await insertStudent(primaryStudentId)
    await insertTask(primaryStudentId, {
      status: 'completed',
      isOverdue: true,
    })
    const now = vi
      .fn<() => Date>()
      .mockReturnValueOnce(firstClockInstant)
      .mockReturnValue(secondClockInstant)
    const app = createApp(primaryStudentId, now)

    const responses = await Promise.all([
      app.inject({
        method: 'PATCH',
        url: '/api/tasks/task-primary',
        payload: { status: 'completed' },
      }),
      app.inject({
        method: 'PATCH',
        url: '/api/tasks/task-primary',
        payload: { status: 'completed' },
      }),
    ])
    await app.close()

    expect(responses.map(({ statusCode }) => statusCode)).toEqual([200, 200])
    expect(responses.map((response) => response.json().data.task.completedAt)).toEqual([
      firstClockInstant.toISOString(),
      firstClockInstant.toISOString(),
    ])
    expect(responses.every((response) => response.json().data.task.isOverdue === false))
      .toBe(true)
    expect(now).toHaveBeenCalledTimes(1)
    await expect(readTask()).resolves.toMatchObject({
      payload: expect.objectContaining({
        status: 'completed',
        completedAt: firstClockInstant.toISOString(),
        isOverdue: false,
      }),
    })
  })

  it('serializes concurrent completion attempts to one stable completedAt', async () => {
    await insertStudent(primaryStudentId)
    await insertTask(primaryStudentId, { isOverdue: true })
    const now = vi
      .fn<() => Date>()
      .mockReturnValueOnce(firstClockInstant)
      .mockReturnValue(secondClockInstant)
    const app = createApp(primaryStudentId, now)

    const responses = await Promise.all([
      app.inject({
        method: 'PATCH',
        url: '/api/tasks/task-primary',
        payload: { status: 'completed' },
      }),
      app.inject({
        method: 'PATCH',
        url: '/api/tasks/task-primary',
        payload: { status: 'completed' },
      }),
    ])
    await app.close()

    expect(responses.map(({ statusCode }) => statusCode)).toEqual([200, 200])
    expect(responses.map((response) => response.json().data.task.completedAt)).toEqual([
      firstClockInstant.toISOString(),
      firstClockInstant.toISOString(),
    ])
    expect(now).toHaveBeenCalledTimes(1)
    await expect(readTask()).resolves.toMatchObject({
      payload: expect.objectContaining({
        completedAt: firstClockInstant.toISOString(),
      }),
    })
  })

  it.each([
    ['empty body', {}],
    ['wrong status', { status: 'pending' }],
    ['unknown field', { status: 'completed', completedAt: firstClockInstant.toISOString() }],
  ])('rejects %s atomically', async (_case, payload) => {
    await insertStudent(primaryStudentId)
    await insertTask(primaryStudentId, { isOverdue: true })
    const before = await readTask()
    const app = createApp()

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/tasks/task-primary',
      payload,
    })
    await app.close()

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      code: 'INVALID_INPUT',
      message: 'Invalid request',
      data: null,
    })
    expect(await readTask()).toEqual(before)
  })

  it('does not find or mutate another student task', async () => {
    await insertStudent(primaryStudentId)
    await insertStudent(otherStudentId)
    await insertTask(otherStudentId)
    const before = await readTask(otherStudentId)
    const app = createApp(primaryStudentId)

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/tasks/task-primary',
      payload: { status: 'completed' },
    })
    await app.close()

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({
      code: 'NOT_FOUND',
      message: 'Task not found',
      data: null,
    })
    expect(await readTask(otherStudentId)).toEqual(before)
  })
})

describe('POST /api/tasks/{id}/adjustment-request', () => {
  it('persists the full request and keeps an eligible teacher task pending', async () => {
    await insertStudent(primaryStudentId)
    const original = await insertTask(primaryStudentId)
    const request = makeAdjustment()
    const app = createApp()

    const response = await app.inject({
      method: 'POST',
      url: '/api/tasks/task-primary/adjustment-request',
      payload: request,
    })
    await app.close()

    const adjustedTask = { ...original, adjustmentStatus: 'submitted' }
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      code: 0,
      message: 'ok',
      data: { request, task: adjustedTask },
    })
    await expect(prisma.taskAdjustment.findUnique({
      where: { studentId_id: { studentId: primaryStudentId, id: request.id } },
    })).resolves.toMatchObject({
      studentId: primaryStudentId,
      taskId: request.taskId,
      status: request.status,
      createdAt: new Date(request.createdAt),
      payload: request,
    })
    await expect(readTask()).resolves.toMatchObject({
      status: 'pending',
      type: original.type,
      dueAt: new Date(String(original.dueAt)),
      payload: adjustedTask,
    })
  })

  it('accepts createdAt exactly at server now when offsets represent the same instant', async () => {
    await insertStudent(primaryStudentId)
    const original = await insertTask(primaryStudentId)
    const request = makeAdjustment({
      createdAt: '2026-08-11T18:00:00.000+08:00',
      proposedDueAt: '2026-08-13T20:00:00.000+08:00',
    })
    const app = createApp()

    const response = await app.inject({
      method: 'POST',
      url: '/api/tasks/task-primary/adjustment-request',
      payload: request,
    })
    await app.close()

    expect(response.statusCode).toBe(200)
    expect(response.json().data).toEqual({
      request,
      task: { ...original, adjustmentStatus: 'submitted' },
    })
    await expect(prisma.taskAdjustment.findUnique({
      where: { studentId_id: { studentId: primaryStudentId, id: request.id } },
    })).resolves.toMatchObject({
      createdAt: firstClockInstant,
      payload: request,
    })
  })

  it('returns DUPLICATE_ID without changing an otherwise eligible task', async () => {
    await insertStudent(primaryStudentId)
    await insertTask(primaryStudentId)
    await insertTask(primaryStudentId, { id: 'task-secondary', title: 'Secondary task' })
    await insertAdjustment(primaryStudentId, {
      id: 'adjustment-primary',
      taskId: 'task-secondary',
    })
    const beforeTask = await readTask()
    const beforeAdjustments = await prisma.taskAdjustment.findMany({
      where: { studentId: primaryStudentId },
    })
    const app = createApp()

    const response = await app.inject({
      method: 'POST',
      url: '/api/tasks/task-primary/adjustment-request',
      payload: makeAdjustment(),
    })
    await app.close()

    expect(response.statusCode).toBe(409)
    expect(response.json()).toEqual({
      code: 'DUPLICATE_ID',
      message: 'Task adjustment request id already exists',
      data: null,
    })
    expect(await readTask()).toEqual(beforeTask)
    await expect(prisma.taskAdjustment.findMany({
      where: { studentId: primaryStudentId },
    })).resolves.toEqual(beforeAdjustments)
  })

  it.each([
    [
      'a mismatched body task id',
      'task-primary',
      makeTask(),
      makeAdjustment({ taskId: 'task-other' }),
      400,
      'INVALID_INPUT',
    ],
    [
      'an AI-recommended task',
      'task-primary',
      makeTask({ type: 'ai_recommended', assignedBy: null }),
      makeAdjustment(),
      400,
      'INVALID_INPUT',
    ],
    [
      'a completed task',
      'task-primary',
      makeTask({
        status: 'completed',
        completedAt: '2026-08-10T08:00:00.000Z',
      }),
      makeAdjustment(),
      400,
      'INVALID_INPUT',
    ],
    [
      'an invalid proposed timestamp',
      'task-primary',
      makeTask(),
      makeAdjustment({ proposedDueAt: 'not-a-timestamp' }),
      400,
      'INVALID_INPUT',
    ],
    [
      'an invalid created timestamp',
      'task-primary',
      makeTask(),
      makeAdjustment({ createdAt: '2026-08-11T09:00:00' }),
      400,
      'INVALID_INPUT',
    ],
    [
      'a proposed timestamp that is not in the future',
      'task-primary',
      makeTask(),
      makeAdjustment({ proposedDueAt: firstClockInstant.toISOString() }),
      400,
      'INVALID_INPUT',
    ],
    [
      'a proposed timestamp before its creation timestamp',
      'task-primary',
      makeTask(),
      makeAdjustment({
        proposedDueAt: '2026-08-13T12:00:00.000Z',
        createdAt: '2026-08-14T12:00:00.000Z',
      }),
      400,
      'INVALID_INPUT',
    ],
    [
      'a future creation timestamp expressed with an offset',
      'task-primary',
      makeTask(),
      makeAdjustment({
        createdAt: '2026-08-12T18:00:00.000+08:00',
        proposedDueAt: '2026-08-13T20:00:00.000+08:00',
      }),
      400,
      'INVALID_INPUT',
    ],
  ])('rejects %s atomically', async (
    _case,
    pathTaskId,
    task,
    request,
    expectedStatus,
    expectedCode,
  ) => {
    await insertStudent(primaryStudentId)
    await insertTask(primaryStudentId, task as Record<string, unknown>)
    const before = await readTask()
    const app = createApp()

    const response = await app.inject({
      method: 'POST',
      url: `/api/tasks/${pathTaskId}/adjustment-request`,
      payload: request,
    })
    await app.close()

    expect(response.statusCode).toBe(expectedStatus)
    expect(response.json()).toMatchObject({ code: expectedCode, data: null })
    expect(await readTask()).toEqual(before)
    await expect(prisma.taskAdjustment.count()).resolves.toBe(0)
  })

  it.each([
    ['task payload marker', true],
    ['persisted submitted request', false],
  ])('rejects a repeat submission indicated by %s', async (_case, usePayloadMarker) => {
    await insertStudent(primaryStudentId)
    await insertTask(
      primaryStudentId,
      usePayloadMarker ? { adjustmentStatus: 'submitted' } : {},
    )
    if (!usePayloadMarker) await insertAdjustment(primaryStudentId)
    const before = await readTask()
    const beforeCount = await prisma.taskAdjustment.count()
    const app = createApp()

    const response = await app.inject({
      method: 'POST',
      url: '/api/tasks/task-primary/adjustment-request',
      payload: makeAdjustment({ id: 'adjustment-repeat' }),
    })
    await app.close()

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      code: 'INVALID_INPUT',
      message: 'Adjustment requests are only available for a pending teacher-assigned task without a submitted adjustment.',
      data: null,
    })
    expect(await readTask()).toEqual(before)
    await expect(prisma.taskAdjustment.count()).resolves.toBe(beforeCount)
  })

  it('returns NOT_FOUND for a missing scoped task without creating a request', async () => {
    await insertStudent(primaryStudentId)
    await insertStudent(otherStudentId)
    await insertTask(otherStudentId)
    const otherBefore = await readTask(otherStudentId)
    const app = createApp(primaryStudentId)

    const response = await app.inject({
      method: 'POST',
      url: '/api/tasks/task-primary/adjustment-request',
      payload: makeAdjustment(),
    })
    await app.close()

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({
      code: 'NOT_FOUND',
      message: 'Task not found',
      data: null,
    })
    await expect(prisma.taskAdjustment.count()).resolves.toBe(0)
    expect(await readTask(otherStudentId)).toEqual(otherBefore)
  })

  it('allows a request id that exists only in another student scope', async () => {
    await insertStudent(primaryStudentId)
    await insertStudent(otherStudentId)
    await insertTask(primaryStudentId)
    await insertTask(otherStudentId)
    await insertAdjustment(otherStudentId)
    const request = makeAdjustment()
    const app = createApp(primaryStudentId)

    const response = await app.inject({
      method: 'POST',
      url: '/api/tasks/task-primary/adjustment-request',
      payload: request,
    })
    await app.close()

    expect(response.statusCode).toBe(200)
    await expect(prisma.taskAdjustment.count({
      where: { id: request.id },
    })).resolves.toBe(2)
  })

  it('atomically accepts only one of two concurrent adjustment requests', async () => {
    await insertStudent(primaryStudentId)
    await insertTask(primaryStudentId)
    const app = createApp()

    const responses = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/api/tasks/task-primary/adjustment-request',
        payload: makeAdjustment({ id: 'adjustment-concurrent-a' }),
      }),
      app.inject({
        method: 'POST',
        url: '/api/tasks/task-primary/adjustment-request',
        payload: makeAdjustment({ id: 'adjustment-concurrent-b' }),
      }),
    ])
    await app.close()

    expect(responses.map(({ statusCode }) => statusCode).sort()).toEqual([200, 400])
    expect(responses.map((response) => response.json().code).sort()).toEqual([
      0,
      'INVALID_INPUT',
    ])
    await expect(prisma.taskAdjustment.count({
      where: { studentId: primaryStudentId, taskId: 'task-primary' },
    })).resolves.toBe(1)
    await expect(readTask()).resolves.toMatchObject({
      status: 'pending',
      payload: expect.objectContaining({ adjustmentStatus: 'submitted' }),
    })
  })
})

describe('task API documentation', () => {
  it('publishes success and actual error responses for every task route', async () => {
    const app = createApp()

    const response = await app.inject({ method: 'GET', url: '/documentation/json' })
    await app.close()

    expect(response.statusCode).toBe(200)
    const paths = response.json().paths
    expect(Object.keys(paths['/api/tasks'].post.responses).sort()).toEqual([
      '200',
      '400',
      '404',
      '409',
      '500',
    ])
    expect(Object.keys(paths['/api/tasks/{id}'].patch.responses).sort()).toEqual([
      '200',
      '400',
      '404',
      '500',
    ])
    expect(
      Object.keys(paths['/api/tasks/{id}/adjustment-request'].post.responses).sort(),
    ).toEqual(['200', '400', '404', '409', '500'])
  })
})
