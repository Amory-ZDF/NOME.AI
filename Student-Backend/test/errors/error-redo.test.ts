import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../../src/app.js'
import { parseEnv } from '../../src/config/env.js'
import {
  errorItemSchema,
  type ErrorItem,
  type RedoAttempt,
} from '../../src/contracts/student-contracts.js'
import { toInputJson } from '../../src/db/json.js'
import { parseStoredErrorAggregate } from '../../src/modules/errors/error-cards.js'
import {
  createTestPrisma,
  resetDatabase,
  TEST_DATABASE_URL,
} from '../helpers/database.js'

const prisma = createTestPrisma()
const primaryStudentId = 'redo-student-primary'
const otherStudentId = 'redo-student-other'

function makeError(overrides: Partial<ErrorItem> = {}): ErrorItem {
  const occurredAt = '2026-08-11T10:00:00.000Z'
  const occurrenceKey = 'session:session-primary:question:question-primary'
  return errorItemSchema.parse({
    id: 'error-primary',
    questionId: 'question-primary',
    sessionId: 'session-primary',
    subject: 'A-Level Math',
    errorType: 'method',
    questionSummary: 'Find the stationary point.',
    questionContent: '<p>Find the stationary point.</p>',
    type: 'calculation',
    difficulty: 3,
    errorDescription: 'The response used the wrong method.',
    relatedTopic: 'Calculus - Extrema',
    topicId: 'calculus-extrema',
    whereWrong: 'The method-selection step.',
    whyWrong: 'The derivative condition was not used.',
    linkedAbility: 'method selection',
    hintDependency: 1,
    firstOccurredAt: occurredAt,
    lastOccurredAt: occurredAt,
    occurrences: [occurredAt],
    occurrenceKeys: [occurrenceKey],
    occurrenceRecords: [{ key: occurrenceKey, occurredAt }],
    repeatCount: 1,
    hasIncompleteOccurrenceHistory: false,
    status: 'pending_review',
    studentAnswer: 'x=1',
    correctAnswer: 'x=2',
    analysis: "Differentiate first, then solve f'(x)=0.",
    acceptKeywords: ['x=2', '2'],
    redoHistory: [],
    verificationVariantId: null,
    variantVerifiedAt: null,
    variantVerification: null,
    ...overrides,
  })
}

function makeVerifiedError(): ErrorItem {
  const priorRedo: RedoAttempt = {
    attemptedAt: '2026-08-11T10:30:00.000Z',
    answer: 'x=2',
    isCorrect: true,
    timeSpent: 20,
  }
  return makeError({
    status: 'mastered',
    redoHistory: [priorRedo],
    verificationVariantId: 'variant-stale',
    variantVerifiedAt: '2026-08-11T11:00:00.000Z',
    variantVerification: {
      variantId: 'variant-stale',
      isCorrect: true,
      verifiedAt: '2026-08-11T11:00:00.000Z',
    },
  })
}

async function insertStudent(studentId = primaryStudentId): Promise<void> {
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

async function insertError(error: ErrorItem, studentId = primaryStudentId): Promise<void> {
  await prisma.errorItem.create({
    data: {
      id: error.id,
      studentId,
      questionId: error.questionId,
      status: error.status,
      lastOccurredAt: new Date(error.lastOccurredAt),
      payload: toInputJson(error),
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

async function postRedo(
  id: string,
  attempt: Record<string, unknown>,
  studentId = primaryStudentId,
) {
  const app = createApp(studentId)
  const response = await app.inject({
    method: 'POST',
    url: `/api/errors/${encodeURIComponent(id)}/redo`,
    payload: attempt,
  })
  await app.close()
  return response
}

async function durableSnapshot() {
  return {
    students: await prisma.student.findMany({ orderBy: { id: 'asc' } }),
    tasks: await prisma.task.findMany({ orderBy: [{ studentId: 'asc' }, { id: 'asc' }] }),
    adjustments: await prisma.taskAdjustment.findMany({
      orderBy: [{ studentId: 'asc' }, { id: 'asc' }],
    }),
    sets: await prisma.exerciseSet.findMany({
      orderBy: [{ studentId: 'asc' }, { id: 'asc' }],
    }),
    sessions: await prisma.session.findMany({
      orderBy: [{ studentId: 'asc' }, { id: 'asc' }],
    }),
    errors: await prisma.errorItem.findMany({
      orderBy: [{ studentId: 'asc' }, { id: 'asc' }],
    }),
    notes: await prisma.note.findMany({ orderBy: [{ studentId: 'asc' }, { id: 'asc' }] }),
    folders: await prisma.noteFolder.findMany({
      orderBy: [{ studentId: 'asc' }, { id: 'asc' }],
    }),
    jobs: await prisma.materialUploadJob.findMany({
      orderBy: [{ studentId: 'asc' }, { id: 'asc' }],
    }),
    settings: await prisma.studentSettings.findMany({ orderBy: { studentId: 'asc' } }),
  }
}

beforeEach(async () => {
  await resetDatabase(prisma)
})

afterAll(async () => {
  await resetDatabase(prisma)
  await prisma.$disconnect()
})

describe('POST /api/errors/{id}/redo', () => {
  it.each([
    [
      'correct',
      true,
      'verification_due',
      1,
    ],
    [
      'wrong',
      false,
      'pending_review',
      2,
    ],
  ])('appends an exact %s attempt, applies its lifecycle, and clears all stale verification', async (
    _case,
    isCorrect,
    status,
    repeatCount,
  ) => {
    await insertStudent()
    const existing = makeVerifiedError()
    await insertError(existing)
    const attempt: RedoAttempt = {
      attemptedAt: '2026-08-11T12:00:00.123+00:00',
      answer: isCorrect ? 'x=2 exactly' : 'x=3',
      isCorrect,
      timeSpent: 15.5,
    }

    const response = await postRedo(existing.id, attempt)

    expect(response.statusCode).toBe(200)
    const error = response.json().data.error
    expect(error).toMatchObject({
      id: existing.id,
      status,
      repeatCount,
      redoHistory: [...existing.redoHistory, attempt],
      verificationVariantId: null,
      variantVerifiedAt: null,
      variantVerification: null,
      errorDescription: existing.errorDescription,
      analysis: existing.analysis,
    })
    if (isCorrect) {
      expect(error.occurrenceRecords).toEqual(existing.occurrenceRecords)
    } else {
      const redoKey = `redo:error:${existing.id}:${attempt.attemptedAt}`
      expect(error).toMatchObject({
        lastOccurredAt: attempt.attemptedAt,
        occurrences: [...existing.occurrences, attempt.attemptedAt],
        occurrenceKeys: [...existing.occurrenceKeys, redoKey],
        occurrenceRecords: [
          ...existing.occurrenceRecords,
          { key: redoKey, occurredAt: attempt.attemptedAt },
        ],
      })
    }
    const row = await prisma.errorItem.findUniqueOrThrow({
      where: { studentId_id: { studentId: primaryStudentId, id: existing.id } },
    })
    expect(row.status).toBe(status)
    expect(row.lastOccurredAt.getTime()).toBe(Date.parse(error.lastOccurredAt))
    const stored = parseStoredErrorAggregate(row.payload)
    expect(stored.error).toEqual(error)
    expect(stored.occurrenceEvidenceBindings.map(({ key }) => key)).toEqual(
      error.occurrenceRecords.map(({ key }: { key: string }) => key),
    )
    expect(response.body).not.toContain('occurrenceEvidenceBindings')
  })

  it.each([
    ['before the latest occurrence', '2026-08-11T09:59:59.000Z'],
    ['at the latest occurrence', '2026-08-11T10:00:00.000Z'],
    ['before the latest redo', '2026-08-11T10:29:59.000Z'],
    ['at the latest redo', '2026-08-11T10:30:00.000Z'],
    ['before the latest verification', '2026-08-11T10:59:59.000Z'],
    ['at the latest verification', '2026-08-11T11:00:00.000Z'],
  ])('rejects an attempt %s without mutation', async (_case, attemptedAt) => {
    await insertStudent()
    const existing = makeVerifiedError()
    await insertError(existing)
    const before = await durableSnapshot()

    const response = await postRedo(existing.id, {
      attemptedAt,
      answer: 'x=2',
      isCorrect: true,
      timeSpent: 10,
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      code: 'INVALID_INPUT',
      message: 'Redo attempt must be later than all persisted lifecycle evidence',
      data: null,
    })
    expect(await durableSnapshot()).toEqual(before)
  })

  it('orders equivalent RFC3339 offsets by instant and rejects exact replay or same-time conflict', async () => {
    await insertStudent()
    const existing = makeError()
    await insertError(existing)
    const first: RedoAttempt = {
      attemptedAt: '2026-08-11T18:00:01+08:00',
      answer: 'x=2',
      isCorrect: true,
      timeSpent: 10,
    }
    const accepted = await postRedo(existing.id, first)
    expect(accepted.statusCode).toBe(200)
    const beforeReplay = await durableSnapshot()

    const replay = await postRedo(existing.id, first)
    const conflict = await postRedo(existing.id, { ...first, attemptedAt: '2026-08-11T10:00:01Z', answer: 'x=3' })

    for (const response of [replay, conflict]) {
      expect(response.statusCode).toBe(400)
      expect(response.json()).toMatchObject({ code: 'INVALID_INPUT', data: null })
    }
    expect(await durableSnapshot()).toEqual(beforeReplay)
  })

  it.each([
    ['missing attemptedAt', { answer: 'x=2', isCorrect: true, timeSpent: 10 }],
    ['invalid date', { attemptedAt: '2026-02-30', answer: 'x=2', isCorrect: true, timeSpent: 10 }],
    ['missing timezone', { attemptedAt: '2026-08-11T12:00:00', answer: 'x=2', isCorrect: true, timeSpent: 10 }],
    ['negative duration', { attemptedAt: '2026-08-11T12:00:00Z', answer: 'x=2', isCorrect: true, timeSpent: -1 }],
    ['unknown field', { attemptedAt: '2026-08-11T12:00:00Z', answer: 'x=2', isCorrect: true, timeSpent: 10, extra: true }],
  ])('rejects %s at the request boundary without mutation', async (_case, attempt) => {
    await insertStudent()
    const existing = makeError()
    await insertError(existing)
    const before = await durableSnapshot()

    const response = await postRedo(existing.id, attempt)

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      code: 'INVALID_INPUT',
      message: 'Invalid request',
      data: null,
    })
    expect(await durableSnapshot()).toEqual(before)
  })

  it('returns 404 for a missing or other-student id and never mutates either scope', async () => {
    await insertStudent(primaryStudentId)
    await insertStudent(otherStudentId)
    const otherError = makeError()
    await insertError(otherError, otherStudentId)
    const before = await durableSnapshot()
    const attempt = {
      attemptedAt: '2026-08-11T12:00:00Z',
      answer: 'x=2',
      isCorrect: true,
      timeSpent: 10,
    }

    const missing = await postRedo('error-missing', attempt)
    const other = await postRedo(otherError.id, attempt)

    for (const response of [missing, other]) {
      expect(response.statusCode).toBe(404)
      expect(response.json()).toEqual({
        code: 'NOT_FOUND',
        message: 'Error not found',
        data: null,
      })
    }
    expect(await durableSnapshot()).toEqual(before)
  })

  it('fails closed on a corrupt stored payload or scalar without leaking details', async () => {
    await insertStudent()
    const existing = makeError()
    await insertError(existing)
    const attempt = {
      attemptedAt: '2026-08-11T12:00:00Z',
      answer: 'x=2',
      isCorrect: true,
      timeSpent: 10,
    }

    for (const corrupt of [
      async () => prisma.errorItem.update({
        where: { studentId_id: { studentId: primaryStudentId, id: existing.id } },
        data: { payload: toInputJson({ secret: 'do-not-leak' }) },
      }),
      async () => prisma.errorItem.update({
        where: { studentId_id: { studentId: primaryStudentId, id: existing.id } },
        data: { questionId: 'secret-question' },
      }),
    ]) {
      await prisma.errorItem.update({
        where: { studentId_id: { studentId: primaryStudentId, id: existing.id } },
        data: {
          questionId: existing.questionId,
          status: existing.status,
          lastOccurredAt: new Date(existing.lastOccurredAt),
          payload: toInputJson(existing),
        },
      })
      await corrupt()
      const before = await durableSnapshot()
      const response = await postRedo(existing.id, attempt)

      expect(response.statusCode).toBe(500)
      expect(response.json()).toEqual({
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        data: null,
      })
      expect(response.body).not.toContain('secret')
      expect(response.body).not.toContain(existing.id)
      expect(await durableSnapshot()).toEqual(before)
    }
  })

  it('serializes concurrent redos so equal-time attempts produce one mutation and one rejection', async () => {
    await insertStudent()
    const existing = makeError()
    await insertError(existing)
    const app = createApp()
    const attempt = {
      attemptedAt: '2026-08-11T12:00:00Z',
      answer: 'x=2',
      isCorrect: true,
      timeSpent: 10,
    }

    const responses = await Promise.all([
      app.inject({ method: 'POST', url: `/api/errors/${existing.id}/redo`, payload: attempt }),
      app.inject({ method: 'POST', url: `/api/errors/${existing.id}/redo`, payload: attempt }),
    ])
    await app.close()

    expect(responses.map(({ statusCode }) => statusCode).sort()).toEqual([200, 400])
    const stored = parseStoredErrorAggregate(
      (await prisma.errorItem.findFirstOrThrow()).payload,
    ).error
    expect(stored.redoHistory).toEqual([attempt])
  })
})

describe('error redo transport contract', () => {
  it('keeps an exactly 100-character public error id reachable end to end', async () => {
    await insertStudent()
    const id = 'x'.repeat(100)
    await insertError(makeError({ id }))

    const response = await postRedo(id, {
      attemptedAt: '2026-08-11T12:00:00Z',
      answer: 'x=2',
      isCorrect: true,
      timeSpent: 10,
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().data.error).toMatchObject({ id, status: 'verification_due' })
  })

  it('rejects malformed/overlong path ids, unsupported media, and oversized bodies safely', async () => {
    await insertStudent()
    const app = createApp()
    const malformed = await app.inject({
      method: 'POST',
      url: '/api/errors/%E0%A4%A/redo',
      payload: {},
    })
    const overlong = await app.inject({
      method: 'POST',
      url: `/api/errors/${'x'.repeat(101)}/redo`,
      payload: {},
    })
    const control = await app.inject({
      method: 'POST',
      url: '/api/errors/bad%0Aid/redo',
      payload: {},
    })
    const unsupported = await app.inject({
      method: 'POST',
      url: '/api/errors/error-primary/redo',
      headers: { 'content-type': 'application/xml' },
      payload: '<redo />',
    })
    const oversized = await app.inject({
      method: 'POST',
      url: '/api/errors/error-primary/redo',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ answer: 'x'.repeat(1_048_576) }),
    })
    await app.close()

    expect(malformed.statusCode).toBe(400)
    expect(overlong.statusCode).toBe(400)
    expect(control.statusCode).toBe(400)
    expect(unsupported.statusCode).toBe(415)
    expect(oversized.statusCode).toBe(413)
    await expect(prisma.errorItem.count()).resolves.toBe(0)
  })

  it('publishes every actual response status and a bounded path id', async () => {
    const app = createApp()
    const response = await app.inject({ method: 'GET', url: '/documentation/json' })
    await app.close()

    expect(response.statusCode).toBe(200)
    const operation = response.json().paths['/api/errors/{id}/redo'].post
    expect(Object.keys(operation.responses).sort()).toEqual([
      '200',
      '400',
      '404',
      '413',
      '415',
      '500',
    ])
    expect(operation.parameters.find(({ name }: { name?: string }) => name === 'id').schema.maxLength)
      .toBe(100)
  })
})
