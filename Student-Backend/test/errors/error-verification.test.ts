import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../../src/app.js'
import { parseEnv } from '../../src/config/env.js'
import {
  errorItemSchema,
  exerciseSetSchema,
  taskSchema,
  type ErrorItem,
} from '../../src/contracts/student-contracts.js'
import { toInputJson } from '../../src/db/json.js'
import { parseStoredErrorAggregate } from '../../src/modules/errors/error-cards.js'
import {
  createTestPrisma,
  holdStudentWriteLock,
  resetDatabase,
  TEST_DATABASE_URL,
  type TestPrisma,
} from '../helpers/database.js'

const prisma = createTestPrisma()
const studentId = 'verification-student'
const errorId = 'error-verification'
const variantId = 'variant-verification'
const taskId = 'task-verification'
const sourceQuestionId = 'question-source'

function makeError(overrides: Partial<ErrorItem> = {}): ErrorItem {
  const occurredAt = '2026-08-11T10:00:00.000Z'
  return errorItemSchema.parse({
    id: errorId,
    questionId: sourceQuestionId,
    sessionId: 'session-verification',
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
    occurrenceKeys: ['session:verification:question:question-source'],
    occurrenceRecords: [{
      key: 'session:verification:question:question-source',
      occurredAt,
    }],
    repeatCount: 1,
    hasIncompleteOccurrenceHistory: false,
    status: 'verification_due',
    studentAnswer: 'x=1',
    correctAnswer: 'x=2',
    analysis: "Differentiate first, then solve f'(x)=0.",
    acceptKeywords: ['x=2', '2'],
    redoHistory: [{
      attemptedAt: '2026-08-11T10:30:00.000Z',
      answer: 'x=2',
      isCorrect: true,
      timeSpent: 20,
    }],
    verificationVariantId: variantId,
    variantVerifiedAt: null,
    variantVerification: null,
    ...overrides,
  })
}

function makeTask(verificationErrorId = errorId) {
  return taskSchema.parse({
    id: taskId,
    title: 'Independent transfer check',
    type: 'error_review',
    subject: 'A-Level Math',
    estimatedMinutes: 15,
    dueAt: null,
    assignedBy: null,
    priority: 'P1',
    isOverdue: false,
    status: 'pending',
    exerciseSetId: variantId,
    sourceQuestionId,
    verificationForErrorId: verificationErrorId,
    reason: 'Independent transfer check',
    createdAt: '2026-08-11T10:31:00.000Z',
  })
}

function makeVariantSet() {
  return exerciseSetSchema.parse({
    id: variantId,
    taskId,
    title: 'Independent transfer check',
    subject: 'A-Level Math',
    sourceQuestionId,
    createdAt: '2026-08-11T10:31:00.000Z',
    questions: [{
      id: 'question-variant',
      order: 1,
      type: 'calculation',
      topic: 'Calculus - Extrema',
      difficulty: 3,
      content: '<p>Find the stationary point for a new function.</p>',
      acceptKeywords: ['x=3'],
      correctDisplay: 'x=3',
      errorType: 'method',
      variantOf: sourceQuestionId,
      hints: [1, 2, 3, 4, 5].map((level) => ({
        level,
        title: `Hint ${level}`,
        content: `Hint content ${level}`,
      })),
    }],
  })
}

async function insertStudent(): Promise<void> {
  await prisma.student.create({
    data: {
      id: studentId,
      name: 'Verification Student',
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

async function insertVerificationFixture(error = makeError()): Promise<void> {
  const task = makeTask(error.id)
  const set = makeVariantSet()
  await prisma.task.create({
    data: {
      id: task.id,
      studentId,
      type: task.type,
      status: task.status,
      dueAt: null,
      payload: toInputJson(task),
    },
  })
  await prisma.exerciseSet.create({
    data: {
      id: variantId,
      studentId,
      taskId,
      kind: 'task',
      payload: toInputJson(set),
    },
  })
  await prisma.errorItem.create({
    data: {
      id: error.id,
      studentId,
      questionId: error.questionId,
      status: error.status,
      lastOccurredAt: new Date(error.lastOccurredAt),
      payload: toInputJson({
        storageVersion: 1,
        error,
        occurrenceEvidenceBindings: error.occurrenceRecords.map(({ key, occurredAt }) => ({
          key,
          occurredAt,
          fingerprint: '0'.repeat(64),
        })),
      }),
    },
  })
}

function createApp(client: TestPrisma = prisma, configuredStudentId = studentId) {
  return buildApp({
    env: parseEnv({
      NODE_ENV: 'test',
      DATABASE_URL: TEST_DATABASE_URL,
      STUDENT_ID: configuredStudentId,
      LOG_LEVEL: 'silent',
    }),
    prisma: client,
  })
}

async function postVerification(
  body: Record<string, unknown>,
  id = errorId,
  client: TestPrisma = prisma,
  configuredStudentId = studentId,
) {
  const app = createApp(client, configuredStudentId)
  const response = await app.inject({
    method: 'POST',
    url: `/api/errors/${encodeURIComponent(id)}/verification`,
    payload: body,
  })
  await app.close()
  return response
}

async function patchMastery(
  body: Record<string, unknown>,
  id = errorId,
  client: TestPrisma = prisma,
  configuredStudentId = studentId,
) {
  const app = createApp(client, configuredStudentId)
  const response = await app.inject({
    method: 'PATCH',
    url: `/api/errors/${encodeURIComponent(id)}`,
    payload: body,
  })
  await app.close()
  return response
}

async function durableSnapshot() {
  return {
    tasks: await prisma.task.findMany({ orderBy: [{ studentId: 'asc' }, { id: 'asc' }] }),
    sets: await prisma.exerciseSet.findMany({ orderBy: [{ studentId: 'asc' }, { id: 'asc' }] }),
    errors: await prisma.errorItem.findMany({ orderBy: [{ studentId: 'asc' }, { id: 'asc' }] }),
  }
}

beforeEach(async () => {
  await resetDatabase(prisma)
})

afterAll(async () => {
  await resetDatabase(prisma)
  await prisma.$disconnect()
})

describe('error verification and mastery', () => {
  it('accepts the exact persisted variant provenance and then marks the error mastered', async () => {
    await insertStudent()
    await insertVerificationFixture()
    const app = createApp()

    const verification = await app.inject({
      method: 'POST',
      url: `/api/errors/${errorId}/verification`,
      payload: {
        variantId,
        isCorrect: true,
        verifiedAt: '2026-08-11T10:31:00.000Z',
      },
    })
    const mastery = await app.inject({
      method: 'PATCH',
      url: `/api/errors/${errorId}`,
      payload: { status: 'mastered' },
    })
    await app.close()

    expect(verification.statusCode).toBe(200)
    expect(verification.json().data.error).toMatchObject({
      status: 'verification_due',
      verificationVariantId: variantId,
      variantVerifiedAt: '2026-08-11T10:31:00.000Z',
      variantVerification: {
        variantId,
        isCorrect: true,
        verifiedAt: '2026-08-11T10:31:00.000Z',
      },
    })
    expect(mastery.statusCode).toBe(200)
    expect(mastery.json().data.error).toMatchObject({ status: 'mastered' })
    const stored = parseStoredErrorAggregate(
      (await prisma.errorItem.findUniqueOrThrow({
        where: { studentId_id: { studentId, id: errorId } },
      })).payload,
    ).error
    expect(stored.status).toBe('mastered')
  })

  it.each([
    ['a replay', {
      variantId,
      isCorrect: true,
      verifiedAt: '2026-08-11T10:31:00.000Z',
    }],
    ['a conflicting same-instant verification', {
      variantId,
      isCorrect: false,
      verifiedAt: '2026-08-11T10:31:00.000Z',
    }],
  ])('rejects %s without mutation', async (_case, payload) => {
    await insertStudent()
    await insertVerificationFixture()
    expect((await postVerification({
      variantId,
      isCorrect: true,
      verifiedAt: '2026-08-11T10:31:00.000Z',
    })).statusCode).toBe(200)
    const before = await durableSnapshot()

    const response = await postVerification(payload)

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      code: 'INVALID_INPUT',
      message: 'Verification result is invalid or out of order',
      data: null,
    })
    expect(await durableSnapshot()).toEqual(before)
  })

  it('records a wrong linked verification as reviewing and keeps mastery closed', async () => {
    await insertStudent()
    await insertVerificationFixture()

    const verification = await postVerification({
      variantId,
      isCorrect: false,
      verifiedAt: '2026-08-11T10:31:00.000Z',
    })
    const mastery = await patchMastery({ status: 'mastered' })

    expect(verification.statusCode).toBe(200)
    expect(verification.json().data.error).toMatchObject({
      status: 'reviewing',
      variantVerifiedAt: null,
      variantVerification: {
        variantId,
        isCorrect: false,
        verifiedAt: '2026-08-11T10:31:00.000Z',
      },
    })
    expect(mastery.statusCode).toBe(409)
    expect(mastery.json()).toEqual({
      code: 'MASTERY_GATE_NOT_MET',
      message: 'Complete the independent variant before marking this mastered',
      data: null,
    })
  })

  it('accepts persisted sets that contain exactly one matching variant question', async () => {
    await insertStudent()
    await insertVerificationFixture()
    const set = makeVariantSet()
    const { variantOf: _variantOf, ...unrelatedQuestion } = set.questions[0]!
    await prisma.exerciseSet.update({
      where: { studentId_id: { studentId, id: variantId } },
      data: {
        payload: toInputJson({
          ...set,
          questions: [
            set.questions[0],
            { ...unrelatedQuestion, id: 'question-unrelated', order: 2 },
          ],
        }),
      },
    })

    const response = await postVerification({
      variantId,
      isCorrect: true,
      verifiedAt: '2026-08-11T10:31:00.000Z',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().data.error.variantVerification).toEqual({
      variantId,
      isCorrect: true,
      verifiedAt: '2026-08-11T10:31:00.000Z',
    })
  })

  it.each([
    ['wrong set source', async () => prisma.exerciseSet.update({
      where: { studentId_id: { studentId, id: variantId } },
      data: { payload: toInputJson({ ...makeVariantSet(), sourceQuestionId: 'question-other' }) },
    })],
    ['wrong variant question', async () => prisma.exerciseSet.update({
      where: { studentId_id: { studentId, id: variantId } },
      data: { payload: toInputJson({
        ...makeVariantSet(),
        questions: [{ ...makeVariantSet().questions[0], variantOf: 'question-other' }],
      }) },
    })],
    ['wrong task linkage', async () => prisma.task.update({
      where: { studentId_id: { studentId, id: taskId } },
      data: { payload: toInputJson({ ...makeTask(), verificationForErrorId: 'error-other' }) },
    })],
  ])('rejects valid but non-matching %s without mutation', async (_case, corrupt) => {
    await insertStudent()
    await insertVerificationFixture()
    await corrupt()
    const before = await durableSnapshot()

    const response = await postVerification({
      variantId,
      isCorrect: true,
      verifiedAt: '2026-08-11T10:31:00.000Z',
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      code: 'INVALID_INPUT',
      message: 'Verification variant provenance is invalid',
      data: null,
    })
    expect(await durableSnapshot()).toEqual(before)
  })

  it('rejects a missing or another-student error id as not found without mutation', async () => {
    const otherStudentId = 'verification-other-student'
    await insertStudent()
    await insertStudentFor(otherStudentId)
    await insertVerificationFixture()
    const before = await durableSnapshot()
    const payload = { variantId, isCorrect: true, verifiedAt: '2026-08-11T10:31:00.000Z' }

    const missing = await postVerification(payload, 'error-missing')
    const other = await postVerification(payload, errorId, prisma, otherStudentId)

    for (const response of [missing, other]) {
      expect(response.statusCode).toBe(404)
      expect(response.json()).toEqual({ code: 'NOT_FOUND', message: 'Error not found', data: null })
    }
    expect(await durableSnapshot()).toEqual(before)
  })

  it('fails closed for corrupt stored provenance without leaking it', async () => {
    await insertStudent()
    await insertVerificationFixture()
    await prisma.exerciseSet.update({
      where: { studentId_id: { studentId, id: variantId } },
      data: { kind: 'secret-kind' },
    })
    const before = await durableSnapshot()

    const response = await postVerification({
      variantId,
      isCorrect: true,
      verifiedAt: '2026-08-11T10:31:00.000Z',
    })

    expect(response.statusCode).toBe(500)
    expect(response.json()).toEqual({
      code: 'INTERNAL_ERROR', message: 'Internal server error', data: null,
    })
    expect(response.body).not.toContain('secret-kind')
    expect(await durableSnapshot()).toEqual(before)
  })

  it('keeps the mastery gate closed before a correct linked verification', async () => {
    await insertStudent()
    await insertVerificationFixture()
    const before = await durableSnapshot()

    const response = await patchMastery({ status: 'mastered' })

    expect(response.statusCode).toBe(409)
    expect(response.json()).toEqual({
      code: 'MASTERY_GATE_NOT_MET',
      message: 'Complete the independent variant before marking this mastered',
      data: null,
    })
    expect(await durableSnapshot()).toEqual(before)
  })

  it('accepts only the exact mastery body and preserves errors on rejection', async () => {
    await insertStudent()
    await insertVerificationFixture()
    const before = await durableSnapshot()

    for (const body of [{}, { status: 'reviewing' }, { status: 'mastered', extra: true }]) {
      const response = await patchMastery(body)
      expect(response.statusCode).toBe(400)
      expect(response.json()).toEqual({
        code: 'INVALID_INPUT', message: 'Invalid request', data: null,
      })
    }
    expect(await durableSnapshot()).toEqual(before)
  })

  it('serializes two independent-client verifications at the same instant', { timeout: 15_000 }, async () => {
    await insertStudent()
    await insertVerificationFixture()
    const firstClient = createTestPrisma()
    const secondClient = createTestPrisma()
    const blockerClient = createTestPrisma()
    const releaseLock = await holdStudentWriteLock(blockerClient, studentId, 125)
    try {
      const payload = { variantId, isCorrect: true, verifiedAt: '2026-08-11T10:31:00.000Z' }
      const [first, second] = await Promise.all([
        postVerification(payload, errorId, firstClient),
        postVerification(payload, errorId, secondClient),
      ])
      expect([first.statusCode, second.statusCode].sort()).toEqual([200, 400])
      expect(parseStoredErrorAggregate(
        (await prisma.errorItem.findUniqueOrThrow({
          where: { studentId_id: { studentId, id: errorId } },
        })).payload,
      ).error.variantVerifiedAt).toBe('2026-08-11T10:31:00.000Z')
    } finally {
      await releaseLock()
      await Promise.all([firstClient.$disconnect(), secondClient.$disconnect(), blockerClient.$disconnect()])
    }
  })
})

async function insertStudentFor(id: string): Promise<void> {
  await prisma.student.create({
    data: {
      id,
      name: `Student ${id}`,
      avatar: null,
      joinedDays: 10,
      gradeInfo: 'A-Level - Year 12 Science',
      greeting: toInputJson({ message: 'Hello', fallback: 'Welcome' }),
      moduleStats: toInputJson({ notesCount: 0, weeklyExercises: 0, latestAccuracy: 0, pendingErrorReview: 0 }),
      learningSummary: toInputJson({
        overallMastery: 0, weeklyCompleted: 0, weeklyTotal: 0, overdueTasks: 0,
        weakTopics: [], knowledgeHeatmap: [],
      }),
    },
  })
}

describe('error verification transport contract', () => {
  it('keeps 100-character ids reachable and rejects malformed transport safely', async () => {
    await insertStudent()
    const reachableId = 'x'.repeat(100)
    await insertVerificationFixture(makeError({ id: reachableId }))
    const app = createApp()
    const payload = { variantId, isCorrect: true, verifiedAt: '2026-08-11T10:31:00.000Z' }
    const reachable = await app.inject({
      method: 'POST', url: `/api/errors/${reachableId}/verification`, payload,
    })
    const overlong = await app.inject({
      method: 'POST', url: `/api/errors/${'x'.repeat(101)}/verification`, payload,
    })
    const unsupported = await app.inject({
      method: 'POST', url: `/api/errors/${reachableId}/verification`,
      headers: { 'content-type': 'application/xml' }, payload: '<verification />',
    })
    const oversized = await app.inject({
      method: 'POST', url: `/api/errors/${reachableId}/verification`,
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ ...payload, variantId: 'x'.repeat(1_048_576) }),
    })
    await app.close()

    expect(reachable.statusCode).toBe(200)
    expect(overlong.statusCode).toBe(400)
    expect(unsupported.statusCode).toBe(415)
    expect(oversized.statusCode).toBe(413)
  })

  it('publishes all verification and mastery response statuses', async () => {
    const app = createApp()
    const response = await app.inject({ method: 'GET', url: '/documentation/json' })
    await app.close()

    expect(response.statusCode).toBe(200)
    const paths = response.json().paths
    expect(Object.keys(paths['/api/errors/{id}/verification'].post.responses).sort()).toEqual([
      '200', '400', '404', '413', '415', '500',
    ])
    expect(Object.keys(paths['/api/errors/{id}'].patch.responses).sort()).toEqual([
      '200', '400', '404', '409', '413', '415', '500',
    ])
  })
})
