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
const studentId = 'settings-student'
const initialSettings = {
  tone: 35,
  dailyGoalHours: 4,
  reminderTask: true,
  reminderErrorReview: true,
  reminderStudyTime: false,
}

function createApp(configuredStudentId = studentId) {
  return buildApp({
    env: parseEnv({
      NODE_ENV: 'test',
      DATABASE_URL: TEST_DATABASE_URL,
      STUDENT_ID: configuredStudentId,
      LOG_LEVEL: 'silent',
    }),
    prisma,
  })
}

async function insertStudent(withSettings = true) {
  await prisma.student.create({
    data: {
      id: studentId,
      name: 'Settings Student',
      avatar: null,
      joinedDays: 10,
      gradeInfo: 'A-Level · Year 12 Science',
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
  if (withSettings) {
    await prisma.studentSettings.create({
      data: { studentId, payload: toInputJson(initialSettings) },
    })
  }
}

async function readSettings() {
  const row = await prisma.studentSettings.findUnique({ where: { studentId } })
  return row?.payload
}

beforeEach(async () => {
  await resetDatabase(prisma)
})

afterAll(async () => {
  await resetDatabase(prisma)
  await prisma.$disconnect()
})

describe('PATCH /api/student/settings', () => {
  it('updates only the three legal partial fields and preserves the rest', async () => {
    await insertStudent()
    const app = createApp()

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/student/settings',
      payload: {
        dailyGoalHours: 6,
        reminderErrorReview: false,
        reminderStudyTime: true,
      },
    })
    await app.close()

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      code: 0,
      message: 'ok',
      data: {
        settings: {
          ...initialSettings,
          dailyGoalHours: 6,
          reminderErrorReview: false,
          reminderStudyTime: true,
        },
      },
    })
    expect(await readSettings()).toEqual(response.json().data.settings)
  })

  it('upserts default settings only when the configured student already exists', async () => {
    await insertStudent(false)
    const app = createApp()

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/student/settings',
      payload: { dailyGoalHours: 7 },
    })
    await app.close()

    expect(response.statusCode).toBe(200)
    expect(response.json().data.settings).toEqual({
      ...initialSettings,
      dailyGoalHours: 7,
    })
    await expect(prisma.student.count()).resolves.toBe(1)
    await expect(prisma.studentSettings.count()).resolves.toBe(1)
  })

  it.each([
    ['unknown field', JSON.stringify({ tone: 60 })],
    ['daily goal below range', JSON.stringify({ dailyGoalHours: 0 })],
    ['daily goal above range', JSON.stringify({ dailyGoalHours: 13 })],
    ['empty patch', JSON.stringify({})],
    ['prototype pollution key', '{"__proto__":{"polluted":true},"dailyGoalHours":5}'],
    ['constructor pollution key', '{"constructor":{"prototype":{"polluted":true}},"dailyGoalHours":5}'],
  ])('rejects %s atomically', async (_case, payload) => {
    await insertStudent()
    const before = await readSettings()
    const app = createApp()

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/student/settings',
      headers: { 'content-type': 'application/json' },
      payload,
    })
    await app.close()

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      code: 'INVALID_INPUT',
      message: 'Invalid request',
      data: null,
    })
    expect(await readSettings()).toEqual(before)
    expect((Object.prototype as { polluted?: unknown }).polluted).toBeUndefined()
  })

  it('returns 404 for a missing student and never creates student or settings rows', async () => {
    const app = createApp('missing-student')

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/student/settings',
      payload: { reminderStudyTime: true },
    })
    await app.close()

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({
      code: 'NOT_FOUND',
      message: 'Student not found',
      data: null,
    })
    await expect(prisma.student.count()).resolves.toBe(0)
    await expect(prisma.studentSettings.count()).resolves.toBe(0)
  })

  it('publishes the settings route in OpenAPI', async () => {
    const app = createApp()

    const response = await app.inject({ method: 'GET', url: '/documentation/json' })
    await app.close()

    expect(response.statusCode).toBe(200)
    expect(response.json().paths).toHaveProperty('/api/student/settings.patch')
  })
})
