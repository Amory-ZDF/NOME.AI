import { createHash } from 'node:crypto'

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildApp } from '../../src/app.js'
import { parseEnv } from '../../src/config/env.js'
import type { GeneratedQuestion } from '../../src/contracts/student-contracts.js'
import { toInputJson } from '../../src/db/json.js'
import {
  AgentDomainError,
  AgentOutputInvalidError,
  AgentUnavailableError,
} from '../../src/integrations/student-agent/student-agent.errors.js'
import type { StudentAgentClient } from '../../src/integrations/student-agent/student-agent.client.js'
import {
  createTestPrisma,
  resetDatabase,
  TEST_DATABASE_URL,
} from '../helpers/database.js'

const prisma = createTestPrisma()
const studentId = 'question-variant-student'
const otherStudentId = 'question-variant-other'
const now = '2026-08-13T10:00:00.000Z'
const hintLevels = [1, 2, 3, 4, 5] as const

function digest(parts: readonly string[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 24)
}

function ids(owner = studentId, questionId = 'source-question') {
  const suffix = digest(['question-variant-v1', owner, questionId])
  return { setId: `variant-${suffix}`, taskId: `task-variant-${suffix}`, questionId: `q-variant-${suffix}` }
}

function sourceQuestion(overrides: Record<string, unknown> = {}) {
  return {
    id: 'source-question', order: 1, type: 'calculation', topic: 'Differentiation', difficulty: 3,
    content: 'Differentiate x^2.', acceptKeywords: ['2x'], correctDisplay: '2x', errorType: 'method',
    hints: hintLevels.map((level) => ({ level, title: `Hint ${level}`, content: `Content ${level}` })),
    ...overrides,
  }
}

function generated(type: 'choice' | 'calculation' | 'reading' = 'calculation', overrides: Record<string, unknown> = {}): GeneratedQuestion {
  const base = {
    type, topic: 'Differentiation', difficulty: 4, content: 'Apply the rule to a new expression.',
    acceptKeywords: ['6x'], correctDisplay: '6x', errorType: 'method',
    hints: hintLevels.map((level) => ({ level, title: `Variant hint ${level}`, content: `Variant content ${level}` })),
    ...(type === 'choice' ? { options: ['3x', '6x', '9x'], correctIndex: 1 } : {}),
    ...(type === 'reading' ? { passageEvidence: 'The passage states the required relationship.' } : {}),
    ...overrides,
  }
  return base as GeneratedQuestion
}

function sourceTask(taskId = 'source-task') {
  return {
    id: taskId, title: 'Source task', type: 'teacher_assigned', subject: 'Mathematics', estimatedMinutes: 20,
    dueAt: null, assignedBy: 'teacher-1', priority: 'P1', isOverdue: false, status: 'pending',
    exerciseSetId: 'source-set', createdAt: '2026-08-13T08:00:00.000Z',
  }
}

function sourceSet(kind: 'task' | 'bank' = 'task', overrides: Record<string, unknown> = {}) {
  return {
    id: kind === 'task' ? 'source-set' : 'bank-set',
    taskId: kind === 'task' ? 'source-task' : null,
    title: kind === 'task' ? 'Task questions' : 'Bank questions',
    subject: 'Mathematics', questions: [sourceQuestion()], createdAt: '2026-08-13T08:00:00.000Z',
    ...overrides,
  }
}

function fakeAgent(generateQuestion: StudentAgentClient['generateQuestionVariant'] = async () => generated()) {
  return {
    classifyMaterial: vi.fn(async () => { throw new Error('unexpected material call') }),
    generateQuestionVariant: vi.fn(generateQuestion),
    generateErrorVariant: vi.fn(async () => { throw new Error('unexpected error call') }),
  } satisfies StudentAgentClient
}

function appFor(agent: StudentAgentClient, owner = studentId, prismaClient = prisma) {
  return buildApp({
    env: parseEnv({ NODE_ENV: 'test', DATABASE_URL: TEST_DATABASE_URL, STUDENT_ID: owner, LOG_LEVEL: 'silent' }),
    prisma: prismaClient,
    now: () => new Date(now),
    studentAgentClient: agent,
  })
}

async function insertStudent(id = studentId) {
  await prisma.student.create({ data: {
    id, name: id, avatar: null, joinedDays: 1, gradeInfo: 'A-Level',
    greeting: toInputJson({ message: 'Hello', fallback: 'Welcome' }),
    moduleStats: toInputJson({ notesCount: 0, weeklyExercises: 0, latestAccuracy: 0, pendingErrorReview: 0 }),
    learningSummary: toInputJson({ overallMastery: 0, weeklyCompleted: 0, weeklyTotal: 0, overdueTasks: 0, weakTopics: [], knowledgeHeatmap: [] }),
  } })
}

async function insertSource(owner = studentId, kind: 'task' | 'bank' = 'task', set = sourceSet(kind)) {
  if (kind === 'task') {
    const task = sourceTask(String(set.taskId))
    await prisma.task.create({ data: {
      id: task.id, studentId: owner, type: task.type, status: task.status, dueAt: null, payload: toInputJson(task),
    } })
  }
  await prisma.exerciseSet.create({ data: {
    id: String(set.id), studentId: owner, taskId: set.taskId === null ? null : String(set.taskId),
    kind, payload: toInputJson(set),
  } })
}

async function durableSnapshot() {
  const [students, tasks, adjustments, exerciseSets, sessions, errors, notes, folders, jobs, settings] = await Promise.all([
    prisma.student.findMany({ orderBy: { id: 'asc' } }), prisma.task.findMany({ orderBy: [{ studentId: 'asc' }, { id: 'asc' }] }),
    prisma.taskAdjustment.findMany({ orderBy: [{ studentId: 'asc' }, { id: 'asc' }] }), prisma.exerciseSet.findMany({ orderBy: [{ studentId: 'asc' }, { id: 'asc' }] }),
    prisma.session.findMany({ orderBy: [{ studentId: 'asc' }, { id: 'asc' }] }), prisma.errorItem.findMany({ orderBy: [{ studentId: 'asc' }, { id: 'asc' }] }),
    prisma.note.findMany({ orderBy: [{ studentId: 'asc' }, { id: 'asc' }] }), prisma.noteFolder.findMany({ orderBy: [{ studentId: 'asc' }, { id: 'asc' }] }),
    prisma.materialUploadJob.findMany({ orderBy: [{ studentId: 'asc' }, { id: 'asc' }] }), prisma.studentSettings.findMany({ orderBy: { studentId: 'asc' } }),
  ])
  return JSON.stringify({ students, tasks, adjustments, exerciseSets, sessions, errors, notes, folders, jobs, settings })
}

beforeEach(async () => resetDatabase(prisma))
afterAll(async () => { await resetDatabase(prisma); await prisma.$disconnect() })

describe('POST /api/questions/:questionId/variant', () => {
  it.each(['task', 'bank'] as const)('resolves a %s source and atomically creates exact authoritative records', async (kind) => {
    await insertStudent(); await insertSource(studentId, kind)
    const agent = fakeAgent()
    const app = appFor(agent)
    const response = await app.inject({ method: 'POST', url: '/api/questions/source-question/variant' })
    await app.close()

    const generatedIds = ids()
    const expectedQuestion = { ...generated(), id: generatedIds.questionId, order: 1, variantOf: 'source-question', sourceQuestionId: 'source-question' }
    const expectedSet = {
      id: generatedIds.setId, taskId: generatedIds.taskId, title: 'Independent transfer: Differentiation',
      subject: 'Mathematics', questions: [expectedQuestion], sourceQuestionId: 'source-question', createdAt: now,
    }
    const expectedTask = {
      id: generatedIds.taskId, title: expectedSet.title, type: 'error_review', subject: 'Mathematics',
      estimatedMinutes: 15, dueAt: null, assignedBy: null, priority: 'P1', isOverdue: false, status: 'pending',
      exerciseSetId: generatedIds.setId, sourceQuestionId: 'source-question', reason: 'Independent transfer check', createdAt: now,
    }
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ code: 0, message: 'ok', data: { exerciseSet: expectedSet, task: expectedTask } })
    expect(agent.generateQuestionVariant).toHaveBeenCalledOnce()
    expect(agent.generateQuestionVariant.mock.calls[0]?.[0]).toMatchObject({
      contractVersion: 1, studentId, source: { kind, subject: 'Mathematics', question: sourceQuestion() },
    })
    expect(agent.generateQuestionVariant.mock.calls[0]?.[0].operationKey).toMatch(/^question-variant-v1:[a-f0-9]{64}$/)
    await expect(prisma.task.findUnique({ where: { studentId_id: { studentId, id: generatedIds.taskId } } }))
      .resolves.toMatchObject({ type: 'error_review', status: 'pending', payload: expectedTask })
    await expect(prisma.exerciseSet.findUnique({ where: { studentId_id: { studentId, id: generatedIds.setId } } }))
      .resolves.toMatchObject({ taskId: generatedIds.taskId, kind: 'task', payload: expectedSet })
  })

  it.each(['choice', 'calculation', 'reading'] as const)('accepts a fully canonical generated %s question', async (type) => {
    await insertStudent(); await insertSource()
    const agent = fakeAgent(async () => generated(type))
    const app = appFor(agent)
    const response = await app.inject({ method: 'POST', url: '/api/questions/source-question/variant' })
    await app.close()
    expect(response.statusCode).toBe(200)
    expect(response.json().data.exerciseSet.questions[0]).toMatchObject({ type, id: ids().questionId, order: 1 })
  })

  it('fails closed when the scoped source question is ambiguous before calling Agent', async () => {
    await insertStudent(); await insertSource()
    await insertSource(studentId, 'bank', sourceSet('bank', { id: 'bank-duplicate' }))
    const agent = fakeAgent(); const app = appFor(agent); const before = await durableSnapshot()
    const response = await app.inject({ method: 'POST', url: '/api/questions/source-question/variant' })
    await app.close()
    expect(response.statusCode).toBe(500)
    expect(response.json()).toEqual({ code: 'STORED_DATA_INVALID', message: 'Stored student data is invalid', data: null })
    expect(agent.generateQuestionVariant).not.toHaveBeenCalled()
    expect(await durableSnapshot()).toBe(before)
  })

  it('keeps an other-student-only source invisible', async () => {
    await insertStudent(); await insertStudent(otherStudentId); await insertSource(otherStudentId)
    const agent = fakeAgent(); const app = appFor(agent); const before = await durableSnapshot()
    const response = await app.inject({ method: 'POST', url: '/api/questions/source-question/variant' })
    await app.close()
    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ code: 'NOT_FOUND', message: 'Question not found', data: null })
    expect(agent.generateQuestionVariant).not.toHaveBeenCalled()
    expect(await durableSnapshot()).toBe(before)
  })

  it('fails closed on a corrupt scoped set even when another valid set contains the requested source', async () => {
    await insertStudent(); await insertSource()
    await prisma.exerciseSet.create({ data: {
      id: 'corrupt-unrelated', studentId, taskId: null, kind: 'bank', payload: toInputJson({ broken: true }),
    } })
    const agent = fakeAgent(); const app = appFor(agent); const before = await durableSnapshot()
    const response = await app.inject({ method: 'POST', url: '/api/questions/source-question/variant' })
    await app.close()
    expect(response.statusCode).toBe(500)
    expect(response.json()).toEqual({ code: 'STORED_DATA_INVALID', message: 'Stored student data is invalid', data: null })
    expect(agent.generateQuestionVariant).not.toHaveBeenCalled()
    expect(await durableSnapshot()).toBe(before)
  })

  it.each([
    generated('calculation', { id: 'forged-id' }),
    generated('calculation', { order: 99 }),
    generated('calculation', { variantOf: 'forged-source' }),
    generated('calculation', { hints: [{ level: 1, title: 'Only', content: 'One' }] }),
  ])('rejects invalid or Agent-owned output before all writes %#', async (output) => {
    await insertStudent(); await insertSource()
    const agent = fakeAgent(async () => output as GeneratedQuestion)
    const app = appFor(agent); const before = await durableSnapshot()
    const response = await app.inject({ method: 'POST', url: '/api/questions/source-question/variant' })
    await app.close()
    expect(response.statusCode).toBe(502)
    expect(response.json()).toEqual({ code: 'AGENT_OUTPUT_INVALID', message: 'Student Agent returned invalid output', data: null })
    expect(await durableSnapshot()).toBe(before)
  })

  it('rejects generated raw/base64 content before persistence', async () => {
    await insertStudent(); await insertSource()
    const agent = fakeAgent(async () => generated('calculation', { content: 'data:text/plain;base64,RAW_VARIANT' }))
    const app = appFor(agent); const before = await durableSnapshot()
    const response = await app.inject({ method: 'POST', url: '/api/questions/source-question/variant' })
    await app.close()
    expect(response.statusCode).toBe(502)
    expect(response.body).not.toContain('RAW_VARIANT')
    expect(await durableSnapshot()).toBe(before)
  })

  it('maps the allowlisted Agent generation rejection to a safe 400 with zero writes', async () => {
    await insertStudent(); await insertSource()
    const agent = fakeAgent(async () => { throw new AgentDomainError('GENERATION_REJECTED') })
    const app = appFor(agent); const before = await durableSnapshot()
    const response = await app.inject({ method: 'POST', url: '/api/questions/source-question/variant' })
    await app.close()
    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({ code: 'GENERATION_REJECTED', message: 'Question generation was rejected', data: null })
    expect(await durableSnapshot()).toBe(before)
  })

  it('returns the byte-identical deterministic result on retry without another Agent call', async () => {
    await insertStudent(); await insertSource()
    const agent = fakeAgent(); const app = appFor(agent)
    const first = await app.inject({ method: 'POST', url: '/api/questions/source-question/variant' })
    const second = await app.inject({ method: 'POST', url: '/api/questions/source-question/variant' })
    await app.close()
    expect([first.statusCode, second.statusCode]).toEqual([200, 200])
    expect(second.body).toBe(first.body)
    expect(agent.generateQuestionVariant).toHaveBeenCalledOnce()
  })

  it('rejects two complete deterministic records whose authoritative payload is conflicting', async () => {
    await insertStudent(); await insertSource()
    const firstAgent = fakeAgent(); const firstApp = appFor(firstAgent)
    expect((await firstApp.inject({ method: 'POST', url: '/api/questions/source-question/variant' })).statusCode).toBe(200)
    await firstApp.close()
    const generatedIds = ids()
    const row = await prisma.task.findUniqueOrThrow({ where: { studentId_id: { studentId, id: generatedIds.taskId } } })
    await prisma.task.update({
      where: { studentId_id: { studentId, id: generatedIds.taskId } },
      data: { payload: toInputJson({ ...(row.payload as Record<string, unknown>), title: 'Forged title' }) },
    })
    const agent = fakeAgent(); const app = appFor(agent); const before = await durableSnapshot()
    const response = await app.inject({ method: 'POST', url: '/api/questions/source-question/variant' })
    await app.close()
    expect(response.statusCode).toBe(409)
    expect(response.json()).toMatchObject({ code: 'VARIANT_CONFLICT', data: null })
    expect(agent.generateQuestionVariant).not.toHaveBeenCalled()
    expect(await durableSnapshot()).toBe(before)
  })

  it.each([
    ['task', null],
    ['bank', 'source-task'],
  ] as const)('rejects invalid %s scalar provenance before Agent transport', async (kind, taskId) => {
    await insertStudent()
    if (taskId !== null) {
      const task = sourceTask()
      await prisma.task.create({ data: { id: task.id, studentId, type: task.type, status: task.status, dueAt: null, payload: toInputJson(task) } })
    }
    await prisma.exerciseSet.create({ data: {
      id: 'invalid-source', studentId, taskId, kind, payload: toInputJson({ ...sourceSet(kind), id: 'invalid-source', taskId }),
    } })
    const agent = fakeAgent(); const app = appFor(agent); const before = await durableSnapshot()
    const response = await app.inject({ method: 'POST', url: '/api/questions/source-question/variant' })
    await app.close()
    expect(response.statusCode).toBe(500)
    expect(response.json()).toMatchObject({ code: 'STORED_DATA_INVALID', data: null })
    expect(agent.generateQuestionVariant).not.toHaveBeenCalled()
    expect(await durableSnapshot()).toBe(before)
  })

  it('rejects a partial deterministic-id conflict and rolls back every model', async () => {
    await insertStudent(); await insertSource()
    const generatedIds = ids()
    const { exerciseSetId: _exerciseSetId, ...conflictingTask } = {
      ...sourceTask(generatedIds.taskId), type: 'self_study' as const,
    }
    await prisma.task.create({ data: {
      id: generatedIds.taskId, studentId, type: 'self_study', status: 'pending', dueAt: null,
      payload: toInputJson(conflictingTask),
    } })
    const agent = fakeAgent(); const app = appFor(agent); const before = await durableSnapshot()
    const response = await app.inject({ method: 'POST', url: '/api/questions/source-question/variant' })
    await app.close()
    expect(response.statusCode).toBe(409)
    expect(response.json()).toEqual({ code: 'VARIANT_CONFLICT', message: 'Question variant conflicts with stored data', data: null })
    expect(agent.generateQuestionVariant).not.toHaveBeenCalled()
    expect(await durableSnapshot()).toBe(before)
  })

  it('deduplicates a race across two app and Prisma clients into one logical result', async () => {
    await insertStudent(); await insertSource()
    const secondPrisma = createTestPrisma()
    let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve })
    let called!: () => void; const started = new Promise<void>((resolve) => { called = resolve })
    const firstAgent = fakeAgent(async () => { called(); await gate; return generated() })
    const secondAgent = fakeAgent()
    const firstApp = appFor(firstAgent); const secondApp = appFor(secondAgent, studentId, secondPrisma)
    try {
      const first = firstApp.inject({ method: 'POST', url: '/api/questions/source-question/variant' })
      await started
      const second = secondApp.inject({ method: 'POST', url: '/api/questions/source-question/variant' })
      await new Promise((resolve) => setTimeout(resolve, 25)); release()
      const responses = await Promise.all([first, second])
      expect(responses.map(({ statusCode }) => statusCode)).toEqual([200, 200])
      expect(responses[0]?.body).toBe(responses[1]?.body)
      expect(firstAgent.generateQuestionVariant.mock.calls.length + secondAgent.generateQuestionVariant.mock.calls.length).toBe(1)
      await expect(prisma.exerciseSet.count({ where: { studentId, id: ids().setId } })).resolves.toBe(1)
    } finally {
      release(); await Promise.all([firstApp.close(), secondApp.close()]); await secondPrisma.$disconnect()
    }
  })

  it.each([
    ['invalid', async () => { throw new AgentOutputInvalidError() }, 502, 'AGENT_OUTPUT_INVALID'],
    ['unavailable', async () => { throw new AgentUnavailableError() }, 503, 'AGENT_UNAVAILABLE'],
  ] as const)('maps %s Agent failure safely with zero writes', async (_case, invoke, status, code) => {
    await insertStudent(); await insertSource()
    const agent = fakeAgent(invoke); const app = appFor(agent); const before = await durableSnapshot()
    const response = await app.inject({ method: 'POST', url: '/api/questions/source-question/variant' })
    await app.close()
    expect(response.statusCode).toBe(status)
    expect(response.json()).toMatchObject({ code, data: null })
    expect(await durableSnapshot()).toBe(before)
  })

  it('enforces route, transport, encoded-slash, malformed URL, and OpenAPI boundaries', async () => {
    await insertStudent(); await insertSource(studentId, 'bank', sourceSet('bank', {
      id: 'slash-set', questions: [sourceQuestion({ id: 'source/with/slash' })],
    }))
    const agent = fakeAgent(); const app = appFor(agent); const before = await durableSnapshot()
    const slash = await app.inject({ method: 'POST', url: '/api/questions/source%2Fwith%2Fslash/variant' })
    const body = await app.inject({ method: 'POST', url: '/api/questions/source-question/variant', payload: {} })
    const xml = await app.inject({ method: 'POST', url: '/api/questions/source-question/variant', headers: { 'content-type': 'application/xml' }, payload: '<raw />' })
    const large = await app.inject({ method: 'POST', url: '/api/questions/source-question/variant', payload: { x: 'x'.repeat(1_048_577) } })
    const overlong = await app.inject({ method: 'POST', url: `/api/questions/${'x'.repeat(101)}/variant` })
    const malformed = await app.inject({ method: 'POST', url: '/api/questions/%E0%A4%A/variant' })
    const spec = await app.inject({ method: 'GET', url: '/documentation/json' })
    await app.close()
    expect(slash.statusCode).toBe(200)
    expect([body, xml, large, overlong, malformed].map(({ statusCode }) => statusCode)).toEqual([400, 415, 413, 400, 400])
    expect([body, xml, large, overlong, malformed].map((response) => response.json().code))
      .toEqual(['INVALID_INPUT', 'UNSUPPORTED_MEDIA_TYPE', 'PAYLOAD_TOO_LARGE', 'INVALID_INPUT', 'INVALID_INPUT'])
    expect(await durableSnapshot()).not.toBe(before)
    const operation = spec.json().paths['/api/questions/{questionId}/variant'].post
    expect(operation.requestBody).toBeUndefined()
    expect(Object.keys(operation.responses).map(Number).sort((a, b) => a - b))
      .toEqual([200, 400, 404, 409, 413, 415, 500, 502, 503])
    expect(operation.parameters[0].schema).toMatchObject({ maxLength: 100 })
  })

  it('keeps the exact 100-character question id reachable', async () => {
    await insertStudent()
    const questionId = 'q'.repeat(100)
    await insertSource(studentId, 'bank', sourceSet('bank', { id: 'long-id-set', questions: [sourceQuestion({ id: questionId })] }))
    const agent = fakeAgent(); const app = appFor(agent)
    const response = await app.inject({ method: 'POST', url: `/api/questions/${questionId}/variant` })
    await app.close()
    expect(response.statusCode).toBe(200)
    expect(response.json().data.exerciseSet.questions[0].variantOf).toBe(questionId)
  })
})
