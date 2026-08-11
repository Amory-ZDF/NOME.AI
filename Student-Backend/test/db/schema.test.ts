import { readFile } from 'node:fs/promises'

import { afterAll, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'

import { buildApp } from '../../src/app.js'
import { toInputJson } from '../../src/db/json.js'
import { createShutdown } from '../../src/server.js'
import { parseEnv } from '../../src/config/env.js'
import {
  createTestPrisma,
  resetDatabase,
  TEST_DATABASE_URL,
  type TestPrisma,
} from '../helpers/database.js'

const prisma = createTestPrisma()
const timestamp = new Date('2026-08-10T09:30:00.000Z')

async function createStudent(prismaClient: TestPrisma, id: string) {
  return prismaClient.student.create({
    data: {
      id,
      name: `Student ${id}`,
      avatar: null,
      joinedDays: 42,
      gradeInfo: 'A-Level · Year 12 Science',
      greeting: toInputJson({ message: `Hello ${id}`, fallback: 'Hello' }),
      moduleStats: toInputJson({
        notesCount: 1,
        weeklyExercises: 2,
        latestAccuracy: 75,
        pendingErrorReview: 1,
      }),
      learningSummary: toInputJson({
        overallMastery: 70,
        weeklyCompleted: 3,
        weeklyTotal: 4,
        overdueTasks: 0,
        weakTopics: ['calculus'],
        knowledgeHeatmap: [],
      }),
    },
  })
}

async function createEveryAggregate(prismaClient: TestPrisma, studentId: string) {
  await prismaClient.task.create({
    data: {
      id: 'task-1',
      studentId,
      type: 'teacher',
      status: 'pending',
      dueAt: timestamp,
      payload: toInputJson({ id: 'task-1', title: 'Mechanics review' }),
    },
  })
  await prismaClient.taskAdjustment.create({
    data: {
      id: 'adjustment-1',
      studentId,
      taskId: 'task-1',
      status: 'submitted',
      createdAt: timestamp,
      payload: toInputJson({ id: 'adjustment-1', taskId: 'task-1' }),
    },
  })
  await prismaClient.exerciseSet.create({
    data: {
      id: 'exercise-1',
      studentId,
      taskId: 'task-1',
      kind: 'task',
      payload: toInputJson({ id: 'exercise-1', questions: [] }),
    },
  })
  await prismaClient.session.create({
    data: {
      id: 'session-1',
      studentId,
      taskId: 'task-1',
      submittedAt: timestamp,
      payload: toInputJson({ id: 'session-1', answers: [] }),
    },
  })
  await prismaClient.errorItem.create({
    data: {
      id: 'error-1',
      studentId,
      questionId: 'question-1',
      status: 'pending',
      lastOccurredAt: timestamp,
      payload: toInputJson({ id: 'error-1', questionId: 'question-1' }),
    },
  })
  await prismaClient.note.create({
    data: {
      id: 'note-1',
      studentId,
      version: 1,
      updatedAtValue: timestamp,
      payload: toInputJson({ id: 'note-1', version: 1, title: 'Forces' }),
    },
  })
  await prismaClient.noteFolder.create({
    data: {
      id: 'folder-1',
      studentId,
      parentId: null,
      payload: toInputJson({ id: 'folder-1', title: 'Physics' }),
    },
  })
  await prismaClient.materialUploadJob.create({
    data: {
      id: 'upload-1',
      studentId,
      status: 'queued',
      createdAtValue: timestamp,
      payload: toInputJson({ id: 'upload-1', filename: 'forces.pdf' }),
    },
  })
  await prismaClient.studentSettings.create({
    data: {
      studentId,
      payload: toInputJson({
        dailyGoalHours: 2,
        reminderErrorReview: true,
        reminderStudyTime: true,
      }),
    },
  })
}

async function aggregateCounts(prismaClient: TestPrisma, studentId?: string) {
  const where = studentId === undefined ? {} : { studentId }
  const [
    tasks,
    adjustments,
    exerciseSets,
    sessions,
    errors,
    notes,
    folders,
    uploads,
    settings,
  ] = await Promise.all([
    prismaClient.task.count({ where }),
    prismaClient.taskAdjustment.count({ where }),
    prismaClient.exerciseSet.count({ where }),
    prismaClient.session.count({ where }),
    prismaClient.errorItem.count({ where }),
    prismaClient.note.count({ where }),
    prismaClient.noteFolder.count({ where }),
    prismaClient.materialUploadJob.count({ where }),
    prismaClient.studentSettings.count({ where }),
  ])

  return {
    tasks,
    adjustments,
    exerciseSets,
    sessions,
    errors,
    notes,
    folders,
    uploads,
    settings,
  }
}

beforeEach(async () => {
  await resetDatabase(prisma)
})

afterAll(async () => {
  await resetDatabase(prisma)
  await prisma.$disconnect()
})

describe('Student persistence schema', () => {
  it('persists every aggregate through its student scope and resets repeatably', async () => {
    await createStudent(prisma, 'student-a')
    await createEveryAggregate(prisma, 'student-a')

    const storedStudent = await prisma.student.findUnique({
      where: { id: 'student-a' },
      include: {
        tasks: true,
        taskAdjustments: true,
        exerciseSets: true,
        sessions: true,
        errors: true,
        notes: true,
        noteFolders: true,
        materialUploadJobs: true,
        settings: true,
      },
    })

    expect(storedStudent).not.toBeNull()
    expect(await aggregateCounts(prisma, 'student-a')).toEqual({
      tasks: 1,
      adjustments: 1,
      exerciseSets: 1,
      sessions: 1,
      errors: 1,
      notes: 1,
      folders: 1,
      uploads: 1,
      settings: 1,
    })
    expect(storedStudent?.tasks[0]?.studentId).toBe('student-a')
    expect(storedStudent?.settings?.studentId).toBe('student-a')

    await resetDatabase(prisma)
    await resetDatabase(prisma)

    expect(await prisma.student.count()).toBe(0)
    expect(await aggregateCounts(prisma)).toEqual({
      tasks: 0,
      adjustments: 0,
      exerciseSets: 0,
      sessions: 0,
      errors: 0,
      notes: 0,
      folders: 0,
      uploads: 0,
      settings: 0,
    })
  })

  it('isolates the same question id between students', async () => {
    await Promise.all([
      createStudent(prisma, 'student-a'),
      createStudent(prisma, 'student-b'),
    ])
    await prisma.errorItem.createMany({
      data: [
        {
          id: 'error-a',
          studentId: 'student-a',
          questionId: 'shared-question',
          status: 'pending',
          lastOccurredAt: timestamp,
          payload: toInputJson({ owner: 'student-a' }),
        },
        {
          id: 'error-b',
          studentId: 'student-b',
          questionId: 'shared-question',
          status: 'mastered',
          lastOccurredAt: timestamp,
          payload: toInputJson({ owner: 'student-b' }),
        },
      ],
    })

    const firstStudentError = await prisma.errorItem.findUnique({
      where: {
        studentId_questionId: {
          studentId: 'student-a',
          questionId: 'shared-question',
        },
      },
    })
    const secondStudentError = await prisma.errorItem.findUnique({
      where: {
        studentId_questionId: {
          studentId: 'student-b',
          questionId: 'shared-question',
        },
      },
    })

    expect(firstStudentError?.id).toBe('error-a')
    expect(firstStudentError?.status).toBe('pending')
    expect(secondStudentError?.id).toBe('error-b')
    expect(secondStudentError?.status).toBe('mastered')
  })

  it('cascades every aggregate when its student is deleted', async () => {
    await createStudent(prisma, 'student-a')
    await createEveryAggregate(prisma, 'student-a')

    await prisma.student.delete({ where: { id: 'student-a' } })

    expect(await aggregateCounts(prisma, 'student-a')).toEqual({
      tasks: 0,
      adjustments: 0,
      exerciseSets: 0,
      sessions: 0,
      errors: 0,
      notes: 0,
      folders: 0,
      uploads: 0,
      settings: 0,
    })
  })

  it('creates composite student/state/lookup indexes in SQLite', async () => {
    const indexes = await prisma.$queryRaw<Array<{ name: string }>>`
      SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'Student_%'
    `

    expect(indexes.map(({ name }) => name).sort()).toEqual(
      expect.arrayContaining([
        'Student_Error_question_key',
        'Student_Error_status_last_idx',
        'Student_Exercise_kind_idx',
        'Student_Exercise_task_idx',
        'Student_Material_status_created_idx',
        'Student_Note_updated_idx',
        'Student_NoteFolder_parent_idx',
        'Student_Session_task_submitted_idx',
        'Student_Task_status_due_idx',
        'Student_Task_type_status_idx',
        'Student_TaskAdjustment_status_created_idx',
        'Student_TaskAdjustment_task_status_idx',
      ]),
    )
  })
})

describe('Database boundaries', () => {
  it('accepts JSON values and rejects non-JSON values before Prisma sees them', () => {
    expect(toInputJson({ nested: [null, true, 3, 'value'] })).toEqual({
      nested: [null, true, 3, 'value'],
    })
    expect(() => toInputJson({ invalid: undefined })).toThrow(/JSON/i)
    expect(() => toInputJson({ invalid: BigInt(1) })).toThrow(/JSON/i)

    const cyclic: { self?: unknown } = {}
    cyclic.self = cyclic
    expect(() => toInputJson(cyclic)).toThrow(/JSON/i)
  })

  it('keeps the Prisma client independent from global environment state', async () => {
    const source = await readFile(new URL('../../src/db/client.ts', import.meta.url), 'utf8')

    expect(source).not.toMatch(/process\.env/)
    expect(TEST_DATABASE_URL).toBe('file:./prisma/test.db')
    await expect(prisma.student.count()).resolves.toBe(0)
  })

  it('injects Prisma into Fastify without making Fastify own its lifecycle', async () => {
    expectTypeOf<Parameters<typeof buildApp>[0]>()
      .toHaveProperty('prisma')
      .toEqualTypeOf<TestPrisma>()

    const app = buildApp({
      env: parseEnv({
        NODE_ENV: 'test',
        DATABASE_URL: TEST_DATABASE_URL,
        LOG_LEVEL: 'silent',
      }),
      prisma,
    })

    app.register(async (studentRoutes) => {
      expectTypeOf(studentRoutes.prisma).toEqualTypeOf<TestPrisma>()

      studentRoutes.get('/test/student-count', async () => ({
        count: await studentRoutes.prisma.student.count(),
      }))
    })

    expect(app.getDecorator('prisma')).toBe(prisma)
    const response = await app.inject({ method: 'GET', url: '/test/student-count' })
    expect(response.json()).toEqual({ count: 0 })
    await app.close()
    await expect(prisma.student.count()).resolves.toBe(0)
  })

  it('closes Fastify and Prisma exactly once across repeated signals', async () => {
    const closeFastify = vi.fn(async () => undefined)
    const disconnectPrisma = vi.fn(async () => undefined)
    const shutdown = createShutdown(
      { close: closeFastify },
      { $disconnect: disconnectPrisma },
    )

    await Promise.all([shutdown(), shutdown(), shutdown()])

    expect(closeFastify).toHaveBeenCalledTimes(1)
    expect(disconnectPrisma).toHaveBeenCalledTimes(1)
  })
})
