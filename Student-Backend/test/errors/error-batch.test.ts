import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../../src/app.js'
import { parseEnv } from '../../src/config/env.js'
import { errorItemSchema, type ErrorItem } from '../../src/contracts/student-contracts.js'
import { toInputJson } from '../../src/db/json.js'
import { parseStoredErrorAggregate } from '../../src/modules/errors/error-cards.js'
import {
  createTestPrisma,
  resetDatabase,
  TEST_DATABASE_URL,
} from '../helpers/database.js'

const prisma = createTestPrisma()
const primaryStudentId = 'error-student-primary'
const otherStudentId = 'error-student-other'

type ErrorOverrides = Partial<ErrorItem> & {
  occurredAt?: string
  occurrenceKey?: string
}

function makeError(overrides: ErrorOverrides = {}): ErrorItem {
  const id = overrides.id ?? 'error-primary'
  const questionId = overrides.questionId ?? 'question-primary'
  const occurredAt = overrides.occurredAt ?? '2026-08-11T10:00:00.000Z'
  const occurrenceKey =
    overrides.occurrenceKey ?? `session:session-primary:question:${questionId}`
  const {
    occurredAt: _occurredAt,
    occurrenceKey: _occurrenceKey,
    ...contractOverrides
  } = overrides

  return errorItemSchema.parse({
    id,
    questionId,
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
    ...contractOverrides,
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

async function postBatch(items: unknown, studentId = primaryStudentId) {
  const app = createApp(studentId)
  const response = await app.inject({
    method: 'POST',
    url: '/api/errors/batch',
    payload: { items },
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

describe('POST /api/errors/batch', () => {
  it('accepts all seven normalized error types and returns only the configured student errors', async () => {
    await insertStudent()
    await insertStudent(otherStudentId)
    const errorTypes = [
      'knowledge',
      'method',
      'calculation',
      'reading',
      'execution',
      'expression',
      'habit',
    ] as const
    const items = errorTypes.map((errorType, index) => makeError({
      id: `error-${errorType}`,
      questionId: `question-${errorType}`,
      errorType,
      occurredAt: `2026-08-11T10:0${index}:00.000Z`,
      occurrenceKey: `session:session-${index}:question:question-${errorType}`,
    }))
    const other = makeError({ id: 'error-other', questionId: 'question-other' })
    await prisma.errorItem.create({
      data: {
        id: other.id,
        studentId: otherStudentId,
        questionId: other.questionId,
        status: other.status,
        lastOccurredAt: new Date(other.lastOccurredAt),
        payload: toInputJson(other),
      },
    })

    const response = await postBatch(items)

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      code: 0,
      message: 'ok',
      data: { errors: [...items].sort((left, right) => left.id.localeCompare(right.id)) },
    })
    await expect(prisma.errorItem.count({ where: { studentId: primaryStudentId } }))
      .resolves.toBe(7)
    await expect(prisma.errorItem.count({ where: { studentId: otherStudentId } }))
      .resolves.toBe(1)
  })

  it.each([
    ['a privileged status', { status: 'reviewing' }],
    ['redo history', {
      redoHistory: [{
        attemptedAt: '2026-08-11T10:01:00.000Z',
        answer: 'x=2',
        isCorrect: true,
        timeSpent: 10,
      }],
    }],
    ['a verification id', { verificationVariantId: 'variant-forged' }],
    ['an accepted verification time', {
      verificationVariantId: 'variant-forged',
      variantVerifiedAt: '2026-08-11T10:02:00.000Z',
      variantVerification: {
        variantId: 'variant-forged',
        isCorrect: true,
        verifiedAt: '2026-08-11T10:02:00.000Z',
      },
      redoHistory: [{
        attemptedAt: '2026-08-11T10:01:00.000Z',
        answer: 'x=2',
        isCorrect: true,
        timeSpent: 10,
      }],
      status: 'verification_due',
    }],
    ['a legacy aggregate claim', { hasIncompleteOccurrenceHistory: true }],
  ])('rejects fresh evidence containing %s without any mutation', async (_case, patch) => {
    await insertStudent()
    const valid = makeError({ id: 'error-valid', questionId: 'question-valid' })
    const invalid = { ...makeError({ id: 'error-invalid', questionId: 'question-invalid' }), ...patch }
    const before = await durableSnapshot()

    const response = await postBatch([valid, invalid])

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      code: 'INVALID_INPUT',
      message: 'Invalid request',
      data: null,
    })
    expect(await durableSnapshot()).toEqual(before)
  })

  it.each([
    ['missing occurrence keys', (value: ErrorItem) => {
      const { occurrenceKeys: _keys, ...invalid } = value
      return invalid
    }],
    ['duplicate occurrence keys', (value: ErrorItem) => ({
      ...value,
      occurrences: [value.lastOccurredAt, value.lastOccurredAt],
      occurrenceKeys: ['duplicate-key', 'duplicate-key'],
      occurrenceRecords: [
        { key: 'duplicate-key', occurredAt: value.lastOccurredAt },
        { key: 'duplicate-key', occurredAt: value.lastOccurredAt },
      ],
      repeatCount: 2,
    })],
    ['misaligned occurrence records', (value: ErrorItem) => ({
      ...value,
      occurrenceRecords: [{ key: 'different-key', occurredAt: value.lastOccurredAt }],
    })],
    ['a false recurrence count', (value: ErrorItem) => ({ ...value, repeatCount: 2 })],
    ['incorrect occurrence bounds', (value: ErrorItem) => ({
      ...value,
      firstOccurredAt: '2026-08-10T10:00:00.000Z',
    })],
  ])('rejects %s atomically', async (_case, mutate) => {
    await insertStudent()
    const before = await durableSnapshot()
    const response = await postBatch([mutate(makeError())])

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ code: 'INVALID_INPUT', data: null })
    expect(await durableSnapshot()).toEqual(before)
  })

  it('merges recurrence by questionId, preserves the canonical id, and updates supplied diagnosis fields', async () => {
    await insertStudent()
    const first = makeError({
      id: 'error-canonical',
      questionId: 'question-repeat',
      occurredAt: '2026-08-11T09:00:00.000Z',
      occurrenceKey: 'session:first:question:question-repeat',
      errorDescription: 'First diagnosis',
    })
    const second = makeError({
      id: 'error-new-client-id',
      questionId: 'question-repeat',
      occurredAt: '2026-08-11T11:00:00.000Z',
      occurrenceKey: 'session:second:question:question-repeat',
      errorDescription: 'Second diagnosis',
      whereWrong: 'A more precise diagnostic location.',
    })

    expect((await postBatch([first])).statusCode).toBe(200)
    const response = await postBatch([second])

    expect(response.statusCode).toBe(200)
    const merged = response.json().data.errors[0]
    expect(merged).toMatchObject({
      id: first.id,
      questionId: first.questionId,
      errorDescription: 'Second diagnosis',
      whereWrong: 'A more precise diagnostic location.',
      repeatCount: 2,
      firstOccurredAt: first.firstOccurredAt,
      lastOccurredAt: second.lastOccurredAt,
      occurrences: [first.lastOccurredAt, second.lastOccurredAt],
      occurrenceKeys: [first.occurrenceKeys[0], second.occurrenceKeys[0]],
      occurrenceRecords: [first.occurrenceRecords[0], second.occurrenceRecords[0]],
      status: 'pending_review',
      verificationVariantId: null,
      variantVerifiedAt: null,
      variantVerification: null,
    })
    const row = await prisma.errorItem.findUniqueOrThrow({
      where: { studentId_id: { studentId: primaryStudentId, id: first.id } },
    })
    expect(row).toMatchObject({
      id: first.id,
      questionId: first.questionId,
      status: 'pending_review',
      lastOccurredAt: new Date(second.lastOccurredAt),
    })
    expect(parseStoredErrorAggregate(row.payload).error).toEqual(merged)
  })

  it('deduplicates exact request retries and duplicate items inside one batch', async () => {
    await insertStudent()
    const first = makeError({
      id: 'error-deduped',
      questionId: 'question-deduped',
      occurrenceKey: 'session:deduped:question:question-deduped',
    })
    const duplicateClientId = { ...structuredClone(first), id: 'error-duplicate-client-id' }

    const firstResponse = await postBatch([first, duplicateClientId, first])
    const firstSnapshot = await durableSnapshot()
    const retryResponse = await postBatch([first])

    expect(firstResponse.statusCode).toBe(200)
    expect(retryResponse.statusCode).toBe(200)
    expect(retryResponse.json()).toEqual(firstResponse.json())
    expect(await durableSnapshot()).toEqual(firstSnapshot)
    await expect(prisma.errorItem.count()).resolves.toBe(1)
  })

  it('returns the same complete deterministic response for an exact multi-error retry', async () => {
    await insertStudent()
    const items = [
      makeError({ id: 'error-z', questionId: 'question-z' }),
      makeError({ id: 'error-a', questionId: 'question-a' }),
    ]

    const first = await postBatch(items)
    const retry = await postBatch(items)

    expect(first.statusCode).toBe(200)
    expect(retry.statusCode).toBe(200)
    expect(retry.body).toBe(first.body)
    expect(first.json().data.errors.map(({ id }: { id: string }) => id))
      .toEqual(['error-a', 'error-z'])
  })

  it('merges distinct same-question occurrences submitted together in stable input order', async () => {
    await insertStudent()
    const first = makeError({
      id: 'error-batch-canonical',
      questionId: 'question-batch-repeat',
      occurredAt: '2026-08-11T10:00:00.000Z',
      occurrenceKey: 'session:batch-one:question:question-batch-repeat',
    })
    const second = makeError({
      id: 'error-batch-secondary',
      questionId: first.questionId,
      occurredAt: '2026-08-11T10:01:00.000Z',
      occurrenceKey: 'session:batch-two:question:question-batch-repeat',
      errorDescription: 'Latest supplied diagnosis',
    })

    const response = await postBatch([first, second])

    expect(response.statusCode).toBe(200)
    expect(response.json().data.errors).toEqual([
      expect.objectContaining({
        id: first.id,
        questionId: first.questionId,
        errorDescription: 'Latest supplied diagnosis',
        repeatCount: 2,
        occurrenceKeys: [first.occurrenceKeys[0], second.occurrenceKeys[0]],
      }),
    ])
    await expect(prisma.errorItem.count()).resolves.toBe(1)
  })

  it('rejects duplicate ids and conflicting occurrence replays atomically', async () => {
    await insertStudent()
    const existing = makeError({
      id: 'error-existing',
      questionId: 'question-existing',
      occurrenceKey: 'stable-occurrence-key',
    })
    expect((await postBatch([existing])).statusCode).toBe(200)

    const cases = [
      [
        makeError({ id: existing.id, questionId: 'question-other' }),
      ],
      [
        makeError({ id: 'shared-id', questionId: 'question-one' }),
        makeError({ id: 'shared-id', questionId: 'question-two' }),
      ],
      [
        makeError({
          id: 'error-conflicting-replay',
          questionId: existing.questionId,
          occurredAt: '2026-08-11T10:00:01.000Z',
          occurrenceKey: existing.occurrenceKeys[0]!,
        }),
      ],
      [
        makeError({ id: 'error-one', questionId: 'question-one', occurrenceKey: 'shared-key' }),
        makeError({ id: 'error-two', questionId: 'question-two', occurrenceKey: 'shared-key' }),
      ],
    ]

    for (const items of cases) {
      const before = await durableSnapshot()
      const response = await postBatch(items)
      expect(response.statusCode).toBe(409)
      expect(response.json()).toMatchObject({ data: null })
      expect(await durableSnapshot()).toEqual(before)
    }
  })

  it('binds a persisted occurrence to its complete fresh evidence and rejects a mutated replay', async () => {
    await insertStudent()
    const original = makeError({
      id: 'error-evidence-bound',
      questionId: 'question-evidence-bound',
      occurrenceKey: 'session:bound:question:question-evidence-bound',
    })
    expect((await postBatch([original])).statusCode).toBe(200)
    const before = await durableSnapshot()
    const mutated = {
      ...structuredClone(original),
      id: 'error-evidence-bound-retry-id',
      questionContent: '<p>Injected replacement question.</p>',
      errorDescription: 'Injected replacement diagnosis.',
      studentAnswer: 'injected answer',
      analysis: 'Injected replacement analysis.',
    }

    const response = await postBatch([mutated])

    expect(response.statusCode).toBe(409)
    expect(response.json()).toEqual({
      code: 'OCCURRENCE_CONFLICT',
      message: 'Occurrence identity conflicts with persisted evidence',
      data: null,
    })
    expect(await durableSnapshot()).toEqual(before)
  })

  it('rejects two same-occurrence items with conflicting fresh evidence before any batch write', async () => {
    await insertStudent()
    const original = makeError({
      id: 'error-same-batch-bound',
      questionId: 'question-same-batch-bound',
      occurrenceKey: 'session:same-batch:question:question-same-batch-bound',
    })
    const mutated = {
      ...structuredClone(original),
      id: 'error-same-batch-mutated-id',
      whyWrong: 'A conflicting root cause for the same occurrence.',
      correctAnswer: 'a conflicting answer',
    }
    const before = await durableSnapshot()

    const response = await postBatch([original, mutated])

    expect(response.statusCode).toBe(409)
    expect(response.json()).toMatchObject({ code: 'OCCURRENCE_CONFLICT', data: null })
    expect(await durableSnapshot()).toEqual(before)
  })

  it('treats an exact old-occurrence replay as a no-op after a newer recurrence', async () => {
    await insertStudent()
    const first = makeError({
      id: 'error-old-replay',
      questionId: 'question-old-replay',
      occurredAt: '2026-08-11T09:00:00.000Z',
      occurrenceKey: 'session:old:question:question-old-replay',
      errorDescription: 'Original diagnosis',
      studentAnswer: 'original answer',
    })
    const latest = makeError({
      id: 'error-new-recurrence',
      questionId: first.questionId,
      occurredAt: '2026-08-11T10:00:00.000Z',
      occurrenceKey: 'session:new:question:question-old-replay',
      errorDescription: 'Latest diagnosis',
      studentAnswer: 'latest answer',
    })
    expect((await postBatch([first])).statusCode).toBe(200)
    const latestResponse = await postBatch([latest])
    expect(latestResponse.statusCode).toBe(200)
    const beforeReplay = await durableSnapshot()

    const replay = await postBatch([first])

    expect(replay.statusCode).toBe(200)
    expect(replay.body).toBe(latestResponse.body)
    expect(replay.json().data.errors[0]).toMatchObject({
      id: first.id,
      errorDescription: 'Latest diagnosis',
      studentAnswer: 'latest answer',
      repeatCount: 2,
    })
    expect(await durableSnapshot()).toEqual(beforeReplay)
  })

  it('treats reordered nested JSON object keys as the same bound evidence', async () => {
    await insertStudent()
    const original = makeError({
      id: 'error-canonical-json',
      questionId: 'question-canonical-json',
      occurrenceKey: 'session:canonical:question:question-canonical-json',
      markSchemePoints: [{
        rubric: { method: 'M1', accuracy: 'A1' },
        score: 2,
      }],
    })
    const replay = makeError({
      ...structuredClone(original),
      id: 'error-canonical-json-replay',
      markSchemePoints: [{
        score: 2,
        rubric: { accuracy: 'A1', method: 'M1' },
      }],
    })
    const firstResponse = await postBatch([original])
    expect(firstResponse.statusCode).toBe(200)
    const beforeReplay = await durableSnapshot()

    const response = await postBatch([replay])

    expect(response.statusCode).toBe(200)
    expect(response.body).toBe(firstResponse.body)
    expect(response.body).not.toContain('occurrenceEvidenceBindings')
    expect(await durableSnapshot()).toEqual(beforeReplay)
  })

  it('binds a provable single-occurrence legacy row before accepting a replay', async () => {
    await insertStudent()
    const legacy = makeError({
      id: 'error-legacy-single',
      questionId: 'question-legacy-single',
      occurrenceKey: 'session:legacy:question:question-legacy-single',
    })
    await prisma.errorItem.create({
      data: {
        id: legacy.id,
        studentId: primaryStudentId,
        questionId: legacy.questionId,
        status: legacy.status,
        lastOccurredAt: new Date(legacy.lastOccurredAt),
        payload: toInputJson(legacy),
      },
    })
    const before = await durableSnapshot()

    const response = await postBatch([{
      ...structuredClone(legacy),
      id: 'error-legacy-single-replay',
      analysis: 'Mutated legacy evidence.',
    }])

    expect(response.statusCode).toBe(409)
    expect(response.json()).toEqual({
      code: 'OCCURRENCE_CONFLICT',
      message: 'Occurrence identity conflicts with persisted evidence',
      data: null,
    })
    expect(await durableSnapshot()).toEqual(before)
  })

  it('fails closed for a legacy multi-occurrence row whose historical evidence cannot be proven', async () => {
    await insertStudent()
    const firstAt = '2026-08-11T09:00:00.000Z'
    const secondAt = '2026-08-11T10:00:00.000Z'
    const firstKey = 'session:legacy-one:question:question-legacy-multi'
    const secondKey = 'session:legacy-two:question:question-legacy-multi'
    const legacy = makeError({
      id: 'error-legacy-multi',
      questionId: 'question-legacy-multi',
      firstOccurredAt: firstAt,
      lastOccurredAt: secondAt,
      occurrences: [firstAt, secondAt],
      occurrenceKeys: [firstKey, secondKey],
      occurrenceRecords: [
        { key: firstKey, occurredAt: firstAt },
        { key: secondKey, occurredAt: secondAt },
      ],
      repeatCount: 2,
    })
    await prisma.errorItem.create({
      data: {
        id: legacy.id,
        studentId: primaryStudentId,
        questionId: legacy.questionId,
        status: legacy.status,
        lastOccurredAt: new Date(legacy.lastOccurredAt),
        payload: toInputJson(legacy),
      },
    })
    const before = await durableSnapshot()

    const response = await postBatch([legacy])

    expect(response.statusCode).toBe(500)
    expect(response.json()).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      data: null,
    })
    expect(response.body).not.toContain(legacy.id)
    expect(await durableSnapshot()).toEqual(before)
  })

  it('rejects a v1 envelope with a missing occurrence binding as stored corruption', async () => {
    await insertStudent()
    const original = makeError({
      id: 'error-missing-binding',
      questionId: 'question-missing-binding',
      occurrenceKey: 'session:binding:question:question-missing-binding',
    })
    expect((await postBatch([original])).statusCode).toBe(200)
    const row = await prisma.errorItem.findFirstOrThrow()
    const corrupted = structuredClone(row.payload) as {
      occurrenceEvidenceBindings: unknown[]
    }
    corrupted.occurrenceEvidenceBindings = []
    await prisma.errorItem.update({
      where: {
        studentId_id: { studentId: primaryStudentId, id: original.id },
      },
      data: { payload: toInputJson(corrupted) },
    })
    const before = await durableSnapshot()

    const response = await postBatch([original])

    expect(response.statusCode).toBe(500)
    expect(response.json()).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      data: null,
    })
    expect(response.body).not.toContain(original.id)
    expect(await durableSnapshot()).toEqual(before)
  })

  it.each([
    ['all verification fields', ['verificationVariantId', 'variantVerifiedAt', 'variantVerification']],
    ['verificationVariantId', ['verificationVariantId']],
    ['variantVerifiedAt', ['variantVerifiedAt']],
    ['variantVerification', ['variantVerification']],
  ])('accepts fresh evidence omitting %s and normalizes the stored contract to null', async (
    _case,
    omittedFields,
  ) => {
    await insertStudent()
    const item = structuredClone(makeError()) as Record<string, unknown>
    for (const field of omittedFields) Reflect.deleteProperty(item, field)

    const response = await postBatch([item])

    expect(response.statusCode).toBe(200)
    expect(response.json().data.errors[0]).toMatchObject({
      verificationVariantId: null,
      variantVerifiedAt: null,
      variantVerification: null,
    })
    const stored = parseStoredErrorAggregate(
      (await prisma.errorItem.findFirstOrThrow()).payload,
    ).error
    expect(stored).toMatchObject({
      verificationVariantId: null,
      variantVerifiedAt: null,
      variantVerification: null,
    })
  })

  it('rejects out-of-order fresh recurrence without reopening the lifecycle', async () => {
    await insertStudent()
    const existing = makeError({
      id: 'error-current',
      questionId: 'question-current',
      occurredAt: '2026-08-11T12:00:00.000Z',
      occurrenceKey: 'session:current:question:question-current',
    })
    expect((await postBatch([existing])).statusCode).toBe(200)
    const before = await durableSnapshot()

    const response = await postBatch([makeError({
      id: 'error-stale',
      questionId: existing.questionId,
      occurredAt: '2026-08-11T11:59:59.000Z',
      occurrenceKey: 'session:stale:question:question-current',
    })])

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ code: 'INVALID_INPUT', data: null })
    expect(await durableSnapshot()).toEqual(before)
  })

  it('keeps student scopes independent even when ids and question ids match', async () => {
    await insertStudent(primaryStudentId)
    await insertStudent(otherStudentId)
    const item = makeError()

    expect((await postBatch([item], otherStudentId)).statusCode).toBe(200)
    expect((await postBatch([item], primaryStudentId)).statusCode).toBe(200)

    await expect(prisma.errorItem.count({ where: { id: item.id } })).resolves.toBe(2)
  })

  it('serializes concurrent identical batches into one logical occurrence', async () => {
    await insertStudent()
    const app = createApp()
    const item = makeError()

    const responses = await Promise.all([
      app.inject({ method: 'POST', url: '/api/errors/batch', payload: { items: [item] } }),
      app.inject({ method: 'POST', url: '/api/errors/batch', payload: { items: [item] } }),
    ])
    await app.close()

    expect(responses.map(({ statusCode }) => statusCode)).toEqual([200, 200])
    expect(responses[0]?.json()).toEqual(responses[1]?.json())
    await expect(prisma.errorItem.count()).resolves.toBe(1)
    const stored = parseStoredErrorAggregate(
      (await prisma.errorItem.findFirstOrThrow()).payload,
    ).error
    expect(stored.repeatCount).toBe(1)
  })

  it('serializes concurrent conflicting replays without a partial or duplicate aggregate', async () => {
    await insertStudent()
    const app = createApp()
    const first = makeError({
      id: 'error-concurrent',
      questionId: 'question-concurrent',
      occurredAt: '2026-08-11T10:00:00.000Z',
      occurrenceKey: 'shared-concurrent-key',
    })
    const conflict = makeError({
      id: 'error-concurrent-alternate',
      questionId: first.questionId,
      occurredAt: '2026-08-11T10:00:01.000Z',
      occurrenceKey: 'shared-concurrent-key',
    })

    const responses = await Promise.all([
      app.inject({ method: 'POST', url: '/api/errors/batch', payload: { items: [first] } }),
      app.inject({ method: 'POST', url: '/api/errors/batch', payload: { items: [conflict] } }),
    ])
    await app.close()

    expect(responses.map(({ statusCode }) => statusCode).sort()).toEqual([200, 409])
    await expect(prisma.errorItem.count()).resolves.toBe(1)
    const stored = parseStoredErrorAggregate(
      (await prisma.errorItem.findFirstOrThrow()).payload,
    ).error
    expect(stored.repeatCount).toBe(1)
    expect(stored.occurrenceKeys).toEqual(['shared-concurrent-key'])
  })

  it('fails closed on corrupt stored payload or scalar metadata without leaking details', async () => {
    await insertStudent()
    const existing = makeError()
    expect((await postBatch([existing])).statusCode).toBe(200)

    for (const corrupt of [
      async () => prisma.errorItem.update({
        where: { studentId_id: { studentId: primaryStudentId, id: existing.id } },
        data: { payload: toInputJson({ secret: 'do-not-leak' }) },
      }),
      async () => prisma.errorItem.update({
        where: { studentId_id: { studentId: primaryStudentId, id: existing.id } },
        data: { status: 'secret-status' },
      }),
    ]) {
      await prisma.errorItem.update({
        where: { studentId_id: { studentId: primaryStudentId, id: existing.id } },
        data: {
          status: existing.status,
          payload: toInputJson(existing),
        },
      })
      await corrupt()
      const before = await durableSnapshot()
      const response = await postBatch([existing])
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

  it('returns a typed 404 when the configured student does not exist', async () => {
    const response = await postBatch([makeError()])

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({
      code: 'NOT_FOUND',
      message: 'Student not found',
      data: null,
    })
    await expect(prisma.errorItem.count()).resolves.toBe(0)
  })
})

describe('error batch transport contract', () => {
  it('rejects unknown wrappers, unsupported media, oversized bodies, and public ids that cannot be addressed', async () => {
    await insertStudent()
    const app = createApp()
    const unknownWrapper = await app.inject({
      method: 'POST',
      url: '/api/errors/batch',
      payload: { items: [makeError()], extra: true },
    })
    const unsupported = await app.inject({
      method: 'POST',
      url: '/api/errors/batch',
      headers: { 'content-type': 'application/xml' },
      payload: '<errors />',
    })
    const oversized = await app.inject({
      method: 'POST',
      url: '/api/errors/batch',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ items: [{ id: 'x', analysis: 'x'.repeat(1_048_576) }] }),
    })
    const unreachableId = await app.inject({
      method: 'POST',
      url: '/api/errors/batch',
      payload: { items: [{ ...makeError(), id: 'x'.repeat(101) }] },
    })
    const controlId = await app.inject({
      method: 'POST',
      url: '/api/errors/batch',
      payload: { items: [{ ...makeError(), id: 'bad\nid' }] },
    })
    await app.close()

    expect(unknownWrapper.statusCode).toBe(400)
    expect(unsupported.statusCode).toBe(415)
    expect(oversized.statusCode).toBe(413)
    expect(unreachableId.statusCode).toBe(400)
    expect(controlId.statusCode).toBe(400)
    await expect(prisma.errorItem.count()).resolves.toBe(0)
  })

  it('publishes every actual response status and the bounded item id', async () => {
    const app = createApp()
    const response = await app.inject({ method: 'GET', url: '/documentation/json' })
    await app.close()

    expect(response.statusCode).toBe(200)
    const operation = response.json().paths['/api/errors/batch'].post
    expect(Object.keys(operation.responses).sort()).toEqual([
      '200',
      '400',
      '404',
      '409',
      '413',
      '415',
      '500',
    ])
    expect(
      operation.requestBody.content['application/json'].schema.properties.items.items.properties.id
        .maxLength,
    ).toBe(100)
  })
})
