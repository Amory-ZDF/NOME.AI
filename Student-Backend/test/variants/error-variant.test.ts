import { createHash } from 'node:crypto'

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildApp } from '../../src/app.js'
import { parseEnv } from '../../src/config/env.js'
import {
  errorItemSchema,
  exerciseSetSchema,
  taskSchema,
  type ErrorItem,
  type GeneratedQuestion,
} from '../../src/contracts/student-contracts.js'
import { toInputJson } from '../../src/db/json.js'
import type { StudentAgentClient } from '../../src/integrations/student-agent/student-agent.client.js'
import {
  AgentDomainError,
  AgentOutputInvalidError,
  AgentUnavailableError,
} from '../../src/integrations/student-agent/student-agent.errors.js'
import { parseStoredErrorAggregate } from '../../src/modules/errors/error-cards.js'
import {
  createTestPrisma,
  resetDatabase,
  TEST_DATABASE_URL,
  type TestPrisma,
} from '../helpers/database.js'

const prisma = createTestPrisma()
const studentId = 'error-variant-student'
const otherStudentId = 'error-variant-other'
const errorId = 'error-source'
const sourceQuestionId = 'source-question'
const redoAt = '2026-08-13T09:30:00.000Z'
const now = '2026-08-13T10:00:00.000Z'
const hintLevels = [1, 2, 3, 4, 5] as const

function digest(parts: readonly string[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 24)
}

function generatedIds(owner = studentId, id = errorId, latestCorrectRedoAt = redoAt) {
  const suffix = digest(['error-variant-v1', owner, id, latestCorrectRedoAt])
  return {
    setId: `error-variant-${suffix}`,
    taskId: `task-error-variant-${suffix}`,
    questionId: `q-error-variant-${suffix}`,
  }
}

function sourceQuestion(overrides: Record<string, unknown> = {}) {
  return {
    id: sourceQuestionId,
    order: 1,
    type: 'calculation',
    topic: 'Calculus - Extrema',
    difficulty: 3,
    content: 'Find the stationary point of x^2 - 4x.',
    acceptKeywords: ['x=2'],
    correctDisplay: 'x=2',
    errorType: 'method',
    hints: hintLevels.map((level) => ({
      level,
      title: `Hint ${level}`,
      content: `Hint content ${level}`,
    })),
    ...overrides,
  }
}

function generated(overrides: Record<string, unknown> = {}): GeneratedQuestion {
  return {
    type: 'calculation',
    topic: 'Calculus - Extrema',
    difficulty: 4,
    content: 'Find the stationary point of x^2 - 6x.',
    acceptKeywords: ['x=3'],
    correctDisplay: 'x=3',
    errorType: 'method',
    hints: hintLevels.map((level) => ({
      level,
      title: `Variant hint ${level}`,
      content: `Variant content ${level}`,
    })),
    ...overrides,
  } as GeneratedQuestion
}

function makeError(overrides: Partial<ErrorItem> = {}): ErrorItem {
  const occurredAt = '2026-08-13T09:00:00.000Z'
  return errorItemSchema.parse({
    id: errorId,
    questionId: sourceQuestionId,
    sessionId: 'session-error-variant',
    subject: 'A-Level Math',
    errorType: 'method',
    questionSummary: 'Find the stationary point.',
    questionContent: 'Find the stationary point of x^2 - 4x.',
    type: 'calculation',
    difficulty: 3,
    errorDescription: 'The derivative condition was not applied.',
    relatedTopic: 'Calculus - Extrema',
    topicId: 'calculus-extrema',
    whereWrong: 'The method-selection step.',
    whyWrong: 'The response substituted before differentiating.',
    linkedAbility: 'method selection',
    hintDependency: 1,
    firstOccurredAt: occurredAt,
    lastOccurredAt: occurredAt,
    occurrences: [occurredAt],
    occurrenceKeys: [`session:session-error-variant:question:${sourceQuestionId}`],
    occurrenceRecords: [{
      key: `session:session-error-variant:question:${sourceQuestionId}`,
      occurredAt,
    }],
    repeatCount: 1,
    hasIncompleteOccurrenceHistory: false,
    status: 'verification_due',
    studentAnswer: 'x=1',
    correctAnswer: 'x=2',
    analysis: "Differentiate first, then solve f'(x)=0.",
    acceptKeywords: ['x=2', '2'],
    redoHistory: [{ attemptedAt: redoAt, answer: 'x=2', isCorrect: true, timeSpent: 20 }],
    verificationVariantId: null,
    variantVerifiedAt: null,
    variantVerification: null,
    ...overrides,
  })
}

function sourceTask(setId = 'source-set') {
  return taskSchema.parse({
    id: 'source-task',
    title: 'Source task',
    type: 'teacher_assigned',
    subject: 'A-Level Math',
    estimatedMinutes: 20,
    dueAt: null,
    assignedBy: 'teacher-1',
    priority: 'P1',
    isOverdue: false,
    status: 'pending',
    exerciseSetId: setId,
    createdAt: '2026-08-13T08:00:00.000Z',
  })
}

function sourceSet(kind: 'task' | 'bank' = 'task', overrides: Record<string, unknown> = {}) {
  return exerciseSetSchema.parse({
    id: kind === 'task' ? 'source-set' : 'bank-set',
    taskId: kind === 'task' ? 'source-task' : null,
    title: 'Source questions',
    subject: 'A-Level Math',
    questions: [sourceQuestion()],
    createdAt: '2026-08-13T08:00:00.000Z',
    ...overrides,
  })
}

function fakeAgent(generateErrorVariant: StudentAgentClient['generateErrorVariant'] = async () => generated()) {
  return {
    classifyMaterial: vi.fn(async () => { throw new Error('unexpected material call') }),
    generateQuestionVariant: vi.fn(async () => { throw new Error('unexpected question call') }),
    generateErrorVariant: vi.fn(generateErrorVariant),
  } satisfies StudentAgentClient
}

function appFor(
  agent: StudentAgentClient,
  owner = studentId,
  client: TestPrisma = prisma,
  processScope = TEST_DATABASE_URL,
) {
  return buildApp({
    env: parseEnv({
      NODE_ENV: 'test',
      DATABASE_URL: processScope,
      STUDENT_ID: owner,
      LOG_LEVEL: 'silent',
    }),
    prisma: client,
    now: () => new Date(now),
    studentAgentClient: agent,
  })
}

async function insertStudent(id = studentId) {
  await prisma.student.create({ data: {
    id,
    name: id,
    avatar: null,
    joinedDays: 1,
    gradeInfo: 'A-Level',
    greeting: toInputJson({ message: 'Hello', fallback: 'Welcome' }),
    moduleStats: toInputJson({ notesCount: 0, weeklyExercises: 0, latestAccuracy: 0, pendingErrorReview: 0 }),
    learningSummary: toInputJson({ overallMastery: 0, weeklyCompleted: 0, weeklyTotal: 0, overdueTasks: 0, weakTopics: [], knowledgeHeatmap: [] }),
  } })
}

async function insertSource(owner = studentId, kind: 'task' | 'bank' = 'task', set = sourceSet(kind)) {
  if (kind === 'task') {
    const task = sourceTask(String(set.id))
    await prisma.task.create({ data: {
      id: task.id,
      studentId: owner,
      type: task.type,
      status: task.status,
      dueAt: null,
      payload: toInputJson(task),
    } })
  }
  await prisma.exerciseSet.create({ data: {
    id: String(set.id),
    studentId: owner,
    taskId: set.taskId,
    kind,
    payload: toInputJson(set),
  } })
}

async function insertError(error = makeError(), owner = studentId, payload: unknown = undefined) {
  const effectivePayload = payload ?? {
    storageVersion: 1,
    error,
    occurrenceEvidenceBindings: error.occurrenceRecords.map(({ key, occurredAt }) => ({
      key,
      occurredAt,
      fingerprint: '0'.repeat(64),
    })),
  }
  await prisma.errorItem.create({ data: {
    id: error.id,
    studentId: owner,
    questionId: error.questionId,
    status: error.status,
    lastOccurredAt: new Date(error.lastOccurredAt),
    payload: toInputJson(effectivePayload),
  } })
}

async function seedEligible(owner = studentId, kind: 'task' | 'bank' = 'task') {
  await insertStudent(owner)
  await insertSource(owner, kind)
  await insertError(makeError(), owner)
}

async function snapshotAll() {
  const [students, tasks, adjustments, sets, sessions, errors, notes, folders, jobs, settings] = await Promise.all([
    prisma.student.findMany({ orderBy: { id: 'asc' } }),
    prisma.task.findMany({ orderBy: [{ studentId: 'asc' }, { id: 'asc' }] }),
    prisma.taskAdjustment.findMany({ orderBy: [{ studentId: 'asc' }, { id: 'asc' }] }),
    prisma.exerciseSet.findMany({ orderBy: [{ studentId: 'asc' }, { id: 'asc' }] }),
    prisma.session.findMany({ orderBy: [{ studentId: 'asc' }, { id: 'asc' }] }),
    prisma.errorItem.findMany({ orderBy: [{ studentId: 'asc' }, { id: 'asc' }] }),
    prisma.note.findMany({ orderBy: [{ studentId: 'asc' }, { id: 'asc' }] }),
    prisma.noteFolder.findMany({ orderBy: [{ studentId: 'asc' }, { id: 'asc' }] }),
    prisma.materialUploadJob.findMany({ orderBy: [{ studentId: 'asc' }, { id: 'asc' }] }),
    prisma.studentSettings.findMany({ orderBy: { studentId: 'asc' } }),
  ])
  return JSON.stringify({ students, tasks, adjustments, sets, sessions, errors, notes, folders, jobs, settings })
}

beforeEach(async () => resetDatabase(prisma))
afterAll(async () => { await resetDatabase(prisma); await prisma.$disconnect() })

describe('POST /api/errors/:id/variant', () => {
  it.each(['task', 'bank'] as const)('uses an exact %s source and atomically links authoritative records', async (kind) => {
    await seedEligible(studentId, kind)
    const agent = fakeAgent()
    const app = appFor(agent)
    const response = await app.inject({ method: 'POST', url: `/api/errors/${errorId}/variant` })
    await app.close()

    const ids = generatedIds()
    const title = 'Independent verification: Calculus - Extrema'
    const expectedQuestion = {
      ...generated(),
      id: ids.questionId,
      order: 1,
      variantOf: sourceQuestionId,
      sourceQuestionId,
    }
    const expectedSet = {
      id: ids.setId,
      taskId: ids.taskId,
      title,
      subject: 'A-Level Math',
      questions: [expectedQuestion],
      sourceQuestionId,
      createdAt: now,
    }
    const expectedTask = {
      id: ids.taskId,
      title,
      type: 'error_review',
      subject: 'A-Level Math',
      estimatedMinutes: 15,
      dueAt: null,
      assignedBy: null,
      priority: 'P1',
      isOverdue: false,
      status: 'pending',
      exerciseSetId: ids.setId,
      sourceQuestionId,
      verificationForErrorId: errorId,
      reason: 'Independent verification after correct redo',
      createdAt: now,
    }
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      code: 0,
      message: 'ok',
      data: {
        exerciseSet: expectedSet,
        task: expectedTask,
        error: { ...makeError(), verificationVariantId: ids.setId },
      },
    })
    expect(agent.generateErrorVariant).toHaveBeenCalledOnce()
    const request = vi.mocked(agent.generateErrorVariant).mock.calls[0]?.[0]
    expect(request).toEqual({
      contractVersion: 1,
      operationKey: expect.stringMatching(/^error-variant-v1:[a-f0-9]{64}$/),
      studentId,
      source: { setId: kind === 'task' ? 'source-set' : 'bank-set', kind, subject: 'A-Level Math', question: sourceQuestion() },
      error: {
        id: errorId,
        errorType: 'method',
        questionSummary: 'Find the stationary point.',
        whereWrong: 'The method-selection step.',
        whyWrong: 'The response substituted before differentiating.',
        studentAnswer: 'x=1',
        correctAnswer: 'x=2',
        latestCorrectRedo: { attemptedAt: redoAt, answer: 'x=2', isCorrect: true, timeSpent: 20 },
      },
    })
    expect(JSON.stringify(request)).not.toContain('occurrenceEvidenceBindings')
    await expect(prisma.task.findUnique({ where: { studentId_id: { studentId, id: ids.taskId } } }))
      .resolves.toMatchObject({ type: 'error_review', status: 'pending', payload: expectedTask })
    await expect(prisma.exerciseSet.findUnique({ where: { studentId_id: { studentId, id: ids.setId } } }))
      .resolves.toMatchObject({ taskId: ids.taskId, kind: 'task', payload: expectedSet })
    const row = await prisma.errorItem.findUniqueOrThrow({ where: { studentId_id: { studentId, id: errorId } } })
    expect(parseStoredErrorAggregate(row.payload).error.verificationVariantId).toBe(ids.setId)
  })

  it('returns the exact deterministic records on retry without another Agent call', async () => {
    await seedEligible()
    const agent = fakeAgent()
    const app = appFor(agent)
    const first = await app.inject({ method: 'POST', url: `/api/errors/${errorId}/variant` })
    const second = await app.inject({ method: 'POST', url: `/api/errors/${errorId}/variant` })
    await app.close()
    expect(first.statusCode).toBe(200)
    expect(second.statusCode).toBe(200)
    expect(second.body).toBe(first.body)
    expect(agent.generateErrorVariant).toHaveBeenCalledOnce()
    await expect(prisma.task.count()).resolves.toBe(2)
    await expect(prisma.exerciseSet.count()).resolves.toBe(2)
  })

  it('deduplicates concurrent identical requests into one logical link', async () => {
    await seedEligible()
    let release!: (value: GeneratedQuestion) => void
    const delayed = new Promise<GeneratedQuestion>((resolve) => { release = resolve })
    const agent = fakeAgent(async () => delayed)
    const app = appFor(agent)
    const first = app.inject({ method: 'POST', url: `/api/errors/${errorId}/variant` })
    const second = app.inject({ method: 'POST', url: `/api/errors/${errorId}/variant` })
    await vi.waitFor(() => expect(agent.generateErrorVariant).toHaveBeenCalledOnce())
    release(generated())
    const responses = await Promise.all([first, second])
    await app.close()
    expect(responses.map(({ statusCode }) => statusCode)).toEqual([200, 200])
    expect(responses[0]?.body).toBe(responses[1]?.body)
    await expect(prisma.task.count()).resolves.toBe(2)
    await expect(prisma.exerciseSet.count()).resolves.toBe(2)
  })

  it('returns one idempotent result across independent process scopes racing the same operation', async () => {
    await seedEligible()
    const secondPrisma = createTestPrisma()
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    let startedCount = 0
    let bothStarted!: () => void
    const started = new Promise<void>((resolve) => { bothStarted = resolve })
    const waitingAgent = () => fakeAgent(async () => {
      startedCount += 1
      if (startedCount === 2) bothStarted()
      await gate
      return generated()
    })
    const firstAgent = waitingAgent()
    const secondAgent = waitingAgent()
    const firstApp = appFor(firstAgent, studentId, prisma, 'file:scope-first')
    const secondApp = appFor(secondAgent, studentId, secondPrisma, 'file:scope-second')
    try {
      const first = firstApp.inject({ method: 'POST', url: `/api/errors/${errorId}/variant` })
      const second = secondApp.inject({ method: 'POST', url: `/api/errors/${errorId}/variant` })
      await started
      release()
      const responses = await Promise.all([first, second])
      expect(responses.map(({ statusCode }) => statusCode).sort()).toEqual([200, 200])
      expect(responses[0]?.body).toBe(responses[1]?.body)
      await expect(prisma.task.count({ where: { studentId, id: generatedIds().taskId } })).resolves.toBe(1)
      await expect(prisma.exerciseSet.count({ where: { studentId, id: generatedIds().setId } })).resolves.toBe(1)
    } finally {
      release()
      await Promise.all([firstApp.close(), secondApp.close()])
      await secondPrisma.$disconnect()
    }
  })

  it.each([
    ['missing correct redo', makeError({ status: 'reviewing', redoHistory: [] }), 400],
    ['wrong status', makeError({ status: 'pending_review' }), 400],
    ['mastered error', makeError({
      status: 'mastered',
      verificationVariantId: 'mastered-variant',
      variantVerifiedAt: '2026-08-13T09:45:00.000Z',
      variantVerification: {
        variantId: 'mastered-variant',
        isCorrect: true,
        verifiedAt: '2026-08-13T09:45:00.000Z',
      },
    }), 400],
    ['incomplete occurrence history', makeError({ hasIncompleteOccurrenceHistory: true, repeatCount: 2 }), 400],
    ['conflicting linked variant', makeError({ verificationVariantId: 'another-variant' }), 409],
  ] as const)('rejects %s before Agent and all writes', async (_case, error, status) => {
    await insertStudent(); await insertSource(); await insertError(error)
    const agent = fakeAgent(); const app = appFor(agent); const before = await snapshotAll()
    const response = await app.inject({ method: 'POST', url: `/api/errors/${errorId}/variant` })
    await app.close()
    expect(response.statusCode).toBe(status)
    expect(agent.generateErrorVariant).not.toHaveBeenCalled()
    expect(await snapshotAll()).toBe(before)
  })

  it('keeps missing and other-student errors invisible', async () => {
    await insertStudent(); await insertStudent(otherStudentId); await insertSource(otherStudentId); await insertError(makeError(), otherStudentId)
    const agent = fakeAgent(); const app = appFor(agent); const before = await snapshotAll()
    const response = await app.inject({ method: 'POST', url: `/api/errors/${errorId}/variant` })
    await app.close()
    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ code: 'NOT_FOUND', message: 'Error not found', data: null })
    expect(agent.generateErrorVariant).not.toHaveBeenCalled()
    expect(await snapshotAll()).toBe(before)
  })

  it('rejects a missing or ambiguous exact source before Agent transport', async () => {
    await insertStudent(); await insertError()
    const missingAgent = fakeAgent(); const missingApp = appFor(missingAgent); const missingBefore = await snapshotAll()
    const missing = await missingApp.inject({ method: 'POST', url: `/api/errors/${errorId}/variant` })
    await missingApp.close()
    expect(missing.statusCode).toBe(404)
    expect(missing.json()).toEqual({ code: 'NOT_FOUND', message: 'Question not found', data: null })
    expect(missingAgent.generateErrorVariant).not.toHaveBeenCalled()
    expect(await snapshotAll()).toBe(missingBefore)

    await insertSource(studentId, 'task')
    await insertSource(studentId, 'bank', sourceSet('bank', { id: 'duplicate-source-set' }))
    const ambiguousAgent = fakeAgent(); const ambiguousApp = appFor(ambiguousAgent); const ambiguousBefore = await snapshotAll()
    const ambiguous = await ambiguousApp.inject({ method: 'POST', url: `/api/errors/${errorId}/variant` })
    await ambiguousApp.close()
    expect(ambiguous.statusCode).toBe(500)
    expect(ambiguous.json()).toEqual({ code: 'STORED_DATA_INVALID', message: 'Stored student data is invalid', data: null })
    expect(ambiguousAgent.generateErrorVariant).not.toHaveBeenCalled()
    expect(await snapshotAll()).toBe(ambiguousBefore)
  })

  it('fails closed when the exact source is missing, duplicated, or its occurrence binding is corrupt', async () => {
    await insertStudent(); await insertSource();
    const error = makeError()
    await insertError(error, studentId, {
      storageVersion: 1,
      error,
      occurrenceEvidenceBindings: [],
    })
    const agent = fakeAgent(); const app = appFor(agent); const before = await snapshotAll()
    const response = await app.inject({ method: 'POST', url: `/api/errors/${errorId}/variant` })
    await app.close()
    expect(response.statusCode).toBe(500)
    expect(response.json()).toMatchObject({ data: null })
    expect(agent.generateErrorVariant).not.toHaveBeenCalled()
    expect(await snapshotAll()).toBe(before)
  })

  it.each([
    generated({ id: 'forged' }),
    generated({ order: 9 }),
    generated({ variantOf: 'forged' }),
    generated({ content: 'data:text/plain;base64,RAW_ERROR_VARIANT' }),
  ])('rejects invalid or raw Agent output with a safe 502 and ten-model rollback %#', async (output) => {
    await seedEligible()
    const agent = fakeAgent(async () => output)
    const app = appFor(agent); const before = await snapshotAll()
    const response = await app.inject({ method: 'POST', url: `/api/errors/${errorId}/variant` })
    await app.close()
    expect(response.statusCode).toBe(502)
    expect(response.json()).toEqual({ code: 'AGENT_OUTPUT_INVALID', message: 'Student Agent returned invalid output', data: null })
    expect(response.body).not.toContain('RAW_ERROR_VARIANT')
    expect(await snapshotAll()).toBe(before)
  })

  it('rejects a conflicting deterministic record without calling Agent or mutating any model', async () => {
    await seedEligible()
    const firstAgent = fakeAgent(); const firstApp = appFor(firstAgent)
    expect((await firstApp.inject({ method: 'POST', url: `/api/errors/${errorId}/variant` })).statusCode).toBe(200)
    await firstApp.close()
    const ids = generatedIds()
    const row = await prisma.task.findUniqueOrThrow({ where: { studentId_id: { studentId, id: ids.taskId } } })
    await prisma.task.update({
      where: { studentId_id: { studentId, id: ids.taskId } },
      data: { payload: toInputJson({ ...(row.payload as Record<string, unknown>), reason: 'forged reason' }) },
    })
    const agent = fakeAgent(); const app = appFor(agent); const before = await snapshotAll()
    const response = await app.inject({ method: 'POST', url: `/api/errors/${errorId}/variant` })
    await app.close()
    expect(response.statusCode).toBe(409)
    expect(response.json()).toEqual({ code: 'VARIANT_CONFLICT', message: 'Error variant conflicts with stored data', data: null })
    expect(agent.generateErrorVariant).not.toHaveBeenCalled()
    expect(await snapshotAll()).toBe(before)
  })

  it('lets newer redo evidence win and rejects the late conflicting Agent result without a 500', async () => {
    await seedEligible()
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    let firstStarted!: () => void
    const started = new Promise<void>((resolve) => { firstStarted = resolve })
    let calls = 0
    const agent = fakeAgent(async () => {
      calls += 1
      if (calls === 1) {
        firstStarted()
        await gate
      }
      return generated()
    })
    const app = appFor(agent)
    try {
      const stale = app.inject({ method: 'POST', url: `/api/errors/${errorId}/variant` })
      await started
      const laterRedoAt = '2026-08-13T09:45:00.000Z'
      const redo = await app.inject({
        method: 'POST',
        url: `/api/errors/${errorId}/redo`,
        payload: { attemptedAt: laterRedoAt, answer: 'x=2', isCorrect: true, timeSpent: 10 },
      })
      expect(redo.statusCode).toBe(200)
      const winner = await app.inject({ method: 'POST', url: `/api/errors/${errorId}/variant` })
      release()
      const late = await stale
      expect([winner.statusCode, late.statusCode]).toEqual([200, 409])
      expect(late.json()).toMatchObject({ code: 'VARIANT_CONFLICT', data: null })
      expect(agent.generateErrorVariant).toHaveBeenCalledTimes(2)
      const winnerIds = generatedIds(studentId, errorId, laterRedoAt)
      await expect(prisma.exerciseSet.count({ where: { studentId, id: winnerIds.setId } })).resolves.toBe(1)
      await expect(prisma.exerciseSet.count({ where: { studentId, id: generatedIds().setId } })).resolves.toBe(0)
    } finally {
      release()
      await app.close()
    }
  })

  it('maps a wrong redo that wins during Agent generation to a late 409 conflict', async () => {
    await seedEligible()
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    let started!: () => void
    const agentStarted = new Promise<void>((resolve) => { started = resolve })
    const agent = fakeAgent(async () => { started(); await gate; return generated() })
    const app = appFor(agent)
    try {
      const stale = app.inject({ method: 'POST', url: `/api/errors/${errorId}/variant` })
      await agentStarted
      const redo = await app.inject({
        method: 'POST',
        url: `/api/errors/${errorId}/redo`,
        payload: {
          attemptedAt: '2026-08-13T09:45:00.000Z',
          answer: 'x=5',
          isCorrect: false,
          timeSpent: 10,
        },
      })
      expect(redo.statusCode).toBe(200)
      expect(redo.json().data.error).toMatchObject({ status: 'pending_review' })
      release()
      const late = await stale
      expect(late.statusCode).toBe(409)
      expect(late.json()).toEqual({
        code: 'VARIANT_CONFLICT',
        message: 'Error variant conflicts with stored data',
        data: null,
      })
      await expect(prisma.exerciseSet.count({ where: { studentId, id: generatedIds().setId } })).resolves.toBe(0)
      const stored = await prisma.errorItem.findUniqueOrThrow({
        where: { studentId_id: { studentId, id: errorId } },
      })
      expect(parseStoredErrorAggregate(stored.payload).error).toEqual(redo.json().data.error)
    } finally {
      release()
      await app.close()
    }
  })

  it.each([
    ['rejected', async () => { throw new AgentDomainError('GENERATION_REJECTED') }, 400, 'GENERATION_REJECTED'],
    ['invalid', async () => { throw new AgentOutputInvalidError() }, 502, 'AGENT_OUTPUT_INVALID'],
    ['unavailable', async () => { throw new AgentUnavailableError() }, 503, 'AGENT_UNAVAILABLE'],
  ] as const)('maps %s Agent failure safely with zero writes', async (_case, invoke, status, code) => {
    await seedEligible()
    const agent = fakeAgent(invoke); const app = appFor(agent); const before = await snapshotAll()
    const response = await app.inject({ method: 'POST', url: `/api/errors/${errorId}/variant` })
    await app.close()
    expect(response.statusCode).toBe(status)
    expect(response.json()).toMatchObject({ code, data: null })
    expect(await snapshotAll()).toBe(before)
  })

  it('produces provenance accepted by verification and mastery', async () => {
    await seedEligible()
    const agent = fakeAgent(); const app = appFor(agent)
    const scheduled = await app.inject({ method: 'POST', url: `/api/errors/${errorId}/variant` })
    const setId = scheduled.json().data.exerciseSet.id as string
    const verification = await app.inject({
      method: 'POST',
      url: `/api/errors/${errorId}/verification`,
      payload: { variantId: setId, isCorrect: true, verifiedAt: now },
    })
    const mastered = await app.inject({
      method: 'PATCH',
      url: `/api/errors/${errorId}`,
      payload: { status: 'mastered' },
    })
    await app.close()
    expect([scheduled.statusCode, verification.statusCode, mastered.statusCode]).toEqual([200, 200, 200])
    expect(mastered.json().data.error).toMatchObject({ status: 'mastered', verificationVariantId: setId })
  })

  it.each(['sourceQuestionId', 'id'] as const)(
    'rejects verification when the persisted question %s provenance is tampered',
    async (field) => {
    await seedEligible()
    const agent = fakeAgent(); const app = appFor(agent)
    const scheduled = await app.inject({ method: 'POST', url: `/api/errors/${errorId}/variant` })
    expect(scheduled.statusCode).toBe(200)
    const setId = scheduled.json().data.exerciseSet.id as string
    const row = await prisma.exerciseSet.findUniqueOrThrow({ where: { studentId_id: { studentId, id: setId } } })
    const storedSet = exerciseSetSchema.parse(row.payload)
    await prisma.exerciseSet.update({
      where: { studentId_id: { studentId, id: setId } },
      data: { payload: toInputJson({
        ...storedSet,
        questions: storedSet.questions.map((question) => ({ ...question, [field]: 'tampered-source' })),
      }) },
    })
    const before = await snapshotAll()
    const verification = await app.inject({
      method: 'POST',
      url: `/api/errors/${errorId}/verification`,
      payload: { variantId: setId, isCorrect: true, verifiedAt: now },
    })
    const mastered = await app.inject({
      method: 'PATCH',
      url: `/api/errors/${errorId}`,
      payload: { status: 'mastered' },
    })
    await app.close()
    expect(verification.statusCode).toBe(400)
    expect(verification.json()).toMatchObject({ code: 'INVALID_INPUT', data: null })
    expect(mastered.statusCode).toBe(409)
    expect(mastered.json()).toMatchObject({ code: 'MASTERY_GATE_NOT_MET', data: null })
    expect(await snapshotAll()).toBe(before)
    },
  )

  it('does not turn a schedule call after accepted verification into a stale idempotent replay', async () => {
    await seedEligible()
    const firstAgent = fakeAgent(); const app = appFor(firstAgent)
    const scheduled = await app.inject({ method: 'POST', url: `/api/errors/${errorId}/variant` })
    const setId = scheduled.json().data.exerciseSet.id as string
    const verification = await app.inject({
      method: 'POST',
      url: `/api/errors/${errorId}/verification`,
      payload: { variantId: setId, isCorrect: true, verifiedAt: now },
    })
    expect(verification.statusCode).toBe(200)
    const before = await snapshotAll()
    const replayAgent = fakeAgent()
    await app.close()
    const replayApp = appFor(replayAgent)
    const replay = await replayApp.inject({ method: 'POST', url: `/api/errors/${errorId}/variant` })
    await replayApp.close()
    expect(replay.statusCode).toBe(409)
    expect(replay.json()).toMatchObject({ code: 'VARIANT_CONFLICT', data: null })
    expect(replayAgent.generateErrorVariant).not.toHaveBeenCalled()
    expect(await snapshotAll()).toBe(before)
  })

  it('enforces empty body, path, transport, and exact OpenAPI boundaries', async () => {
    await seedEligible()
    const agent = fakeAgent(); const app = appFor(agent); const before = await snapshotAll()
    const body = await app.inject({ method: 'POST', url: `/api/errors/${errorId}/variant`, payload: {} })
    const xml = await app.inject({ method: 'POST', url: `/api/errors/${errorId}/variant`, headers: { 'content-type': 'application/xml' }, payload: '<raw />' })
    const large = await app.inject({ method: 'POST', url: `/api/errors/${errorId}/variant`, payload: { x: 'x'.repeat(1_048_577) } })
    const overlong = await app.inject({ method: 'POST', url: `/api/errors/${'x'.repeat(101)}/variant` })
    const malformed = await app.inject({ method: 'POST', url: '/api/errors/%E0%A4%A/variant' })
    const spec = await app.inject({ method: 'GET', url: '/documentation/json' })
    await app.close()
    expect([body, xml, large, overlong, malformed].map(({ statusCode }) => statusCode)).toEqual([400, 415, 413, 400, 400])
    expect([body, xml, large, overlong, malformed].map((response) => response.json().code))
      .toEqual(['INVALID_INPUT', 'UNSUPPORTED_MEDIA_TYPE', 'PAYLOAD_TOO_LARGE', 'INVALID_INPUT', 'INVALID_INPUT'])
    expect(await snapshotAll()).toBe(before)
    const operation = spec.json().paths['/api/errors/{id}/variant'].post
    expect(operation.requestBody).toBeUndefined()
    expect(operation.parameters[0].schema).toMatchObject({ maxLength: 100 })
    expect(Object.keys(operation.responses).map(Number).sort((a, b) => a - b))
      .toEqual([200, 400, 404, 409, 413, 415, 500, 502, 503])
  })
})
