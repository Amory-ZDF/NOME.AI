import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'

import { buildApp } from '../../src/app.js'
import { parseEnv } from '../../src/config/env.js'
import type { MaterialClassificationResult } from '../../src/contracts/student-contracts.js'
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
const studentId = 'material-process-student'
const otherStudentId = 'material-process-other'
const createdAt = '2026-08-13T08:00:00.000Z'
const processedAt = '2026-08-13T09:00:00.000Z'

function operationKey(owner: string, id: string, updatedAt: string): string {
  const digest = createHash('sha256').update(owner).update('\0').update(id).update('\0').update(updatedAt).digest('hex')
  return `material-process-v1:${digest}`
}

function classification(overrides: Record<string, unknown> = {}): MaterialClassificationResult {
  return {
    suggestedTitle: 'Processed calculus notes',
    materialType: 'class_note',
    examBoard: 'Cambridge',
    subject: 'Mathematics',
    chapter: 'Differentiation',
    folderId: 'math',
    folderPath: 'A-Level/Mathematics',
    questionBlocks: [{ id: 'q1', label: 'Question 1', text: 'Differentiate x^2.' }],
    answerBlocks: [{ id: 'a1', questionId: 'q1', text: '2x' }],
    content: [{ t: 'p', v: 'Use the power rule.' }],
    linkedTopics: ['differentiation'],
    linkedErrors: [],
    confidence: 0.9,
    ...overrides,
  } as MaterialClassificationResult
}

function job(overrides: Record<string, unknown> = {}) {
  return {
    id: 'material-process-1',
    fileName: 'calculus.pdf',
    mimeType: 'application/pdf',
    size: 1024,
    materialType: 'class_note',
    examBoard: 'Cambridge',
    subject: 'Mathematics',
    chapter: 'Differentiation',
    createdAt,
    updatedAt: createdAt,
    progress: 0,
    status: 'queued',
    ...overrides,
  }
}

function fakeAgent(classify: StudentAgentClient['classifyMaterial'] = async () => classification()) {
  return {
    classifyMaterial: vi.fn(classify),
    generateQuestionVariant: vi.fn(async () => { throw new Error('unexpected question call') }),
    generateErrorVariant: vi.fn(async () => { throw new Error('unexpected error call') }),
  } satisfies StudentAgentClient
}

function appFor(agent: StudentAgentClient, owner = studentId, prismaClient = prisma) {
  return buildApp({
    env: parseEnv({
      NODE_ENV: 'test', DATABASE_URL: TEST_DATABASE_URL, STUDENT_ID: owner, LOG_LEVEL: 'silent',
    }),
    prisma: prismaClient,
    now: () => new Date(processedAt),
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

async function insertJob(owner = studentId, input = job()) {
  await prisma.materialUploadJob.create({ data: {
    id: String(input.id), studentId: owner, status: String(input.status),
    createdAtValue: new Date(String(input.createdAt)), payload: toInputJson(input),
  } })
}

async function readJob(id = 'material-process-1', owner = studentId) {
  return prisma.materialUploadJob.findUnique({ where: { studentId_id: { studentId: owner, id } } })
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

describe('POST /api/material-uploads/:id/process', () => {
  it.each([
    ['queued', job()],
    ['failed', job({ status: 'failed', progress: 1, failure: { code: 'OLD_FAILURE', message: 'Old failure' } })],
  ])('classifies a %s job with the exact stable Agent request and persists needs_confirmation', async (_state, input) => {
    await insertStudent(); await insertJob(studentId, input)
    const agent = fakeAgent()
    const app = appFor(agent)

    const response = await app.inject({ method: 'POST', url: '/api/material-uploads/material-process-1/process' })
    await app.close()

    const expected = {
      ...job(), updatedAt: processedAt, progress: 100, status: 'needs_confirmation', result: classification(),
    }
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ code: 0, message: 'ok', data: { job: expected } })
    expect(agent.classifyMaterial).toHaveBeenCalledOnce()
    expect(agent.classifyMaterial).toHaveBeenCalledWith({
      contractVersion: 1,
      operationKey: operationKey(studentId, 'material-process-1', createdAt),
      studentId,
      job: {
        id: 'material-process-1', fileName: 'calculus.pdf', mimeType: 'application/pdf', size: 1024,
        materialType: 'class_note', examBoard: 'Cambridge', subject: 'Mathematics', chapter: 'Differentiation',
        createdAt, updatedAt: createdAt,
      },
    })
    await expect(readJob()).resolves.toMatchObject({ status: 'needs_confirmation', payload: expected })
  })

  it('keeps missing and cross-student jobs invisible without calling the Agent', async () => {
    await insertStudent(); await insertStudent(otherStudentId); await insertJob(otherStudentId)
    const agent = fakeAgent()
    const app = appFor(agent)
    const before = await durableSnapshot()

    const missing = await app.inject({ method: 'POST', url: '/api/material-uploads/missing/process' })
    const cross = await app.inject({ method: 'POST', url: '/api/material-uploads/material-process-1/process' })
    await app.close()

    expect([missing.statusCode, cross.statusCode]).toEqual([404, 404])
    expect(missing.json()).toEqual({ code: 'NOT_FOUND', message: 'Material upload not found', data: null })
    expect(cross.json()).toEqual(missing.json())
    expect(agent.classifyMaterial).not.toHaveBeenCalled()
    expect(await durableSnapshot()).toBe(before)
  })

  it.each([
    ['cancelled', job({ status: 'cancelled' }), 'UPLOAD_CANCELLED'],
    ['completed', job({ status: 'completed', progress: 100, result: classification() }), 'UPLOAD_ALREADY_COMPLETED'],
    ['needs_confirmation', job({ status: 'needs_confirmation', progress: 100, result: classification() }), 'INVALID_JOB_STATE'],
    ['processing', job({ status: 'processing', progress: 1 }), 'INVALID_JOB_STATE'],
  ])('rejects a %s job before Agent transport and preserves all models', async (_state, input, code) => {
    await insertStudent(); await insertJob(studentId, input)
    const agent = fakeAgent()
    const app = appFor(agent)
    const before = await durableSnapshot()

    const response = await app.inject({ method: 'POST', url: '/api/material-uploads/material-process-1/process' })
    await app.close()

    expect(response.statusCode).toBe(409)
    expect(response.json()).toMatchObject({ code, data: null })
    expect(agent.classifyMaterial).not.toHaveBeenCalled()
    expect(await durableSnapshot()).toBe(before)
  })

  it('fails safely on indexed/payload corruption without calling the Agent', async () => {
    await insertStudent(); await insertJob()
    await prisma.materialUploadJob.update({
      where: { studentId_id: { studentId, id: 'material-process-1' } }, data: { status: 'failed' },
    })
    const agent = fakeAgent()
    const app = appFor(agent)
    const before = await durableSnapshot()

    const response = await app.inject({ method: 'POST', url: '/api/material-uploads/material-process-1/process' })
    await app.close()

    expect(response.statusCode).toBe(500)
    expect(response.json()).toEqual({ code: 'STORED_DATA_INVALID', message: 'Stored student data is invalid', data: null })
    expect(agent.classifyMaterial).not.toHaveBeenCalled()
    expect(await durableSnapshot()).toBe(before)
  })

  it('maps invalid Agent output to a safe 502 and performs no write', async () => {
    await insertStudent(); await insertJob()
    const agent = fakeAgent(async () => classification({ confidence: 2 }))
    const app = appFor(agent)
    const before = await durableSnapshot()

    const response = await app.inject({ method: 'POST', url: '/api/material-uploads/material-process-1/process' })
    await app.close()

    expect(response.statusCode).toBe(502)
    expect(response.json()).toEqual({ code: 'AGENT_OUTPUT_INVALID', message: 'Student Agent returned invalid output', data: null })
    expect(await durableSnapshot()).toBe(before)
  })

  it('rejects a canonical-shaped Agent result containing raw/base64 before persistence', async () => {
    await insertStudent(); await insertJob()
    const agent = fakeAgent(async () => classification({
      content: [{ t: 'p', v: 'data:application/pdf;base64,RAW_RESULT_SENTINEL' }],
    }))
    const app = appFor(agent)
    const before = await durableSnapshot()

    const response = await app.inject({ method: 'POST', url: '/api/material-uploads/material-process-1/process' })
    await app.close()

    expect(response.statusCode).toBe(502)
    expect(response.json()).toEqual({ code: 'AGENT_OUTPUT_INVALID', message: 'Student Agent returned invalid output', data: null })
    expect(response.body).not.toContain('RAW_RESULT_SENTINEL')
    expect(await durableSnapshot()).toBe(before)
  })

  it('maps an unavailable Agent to a generic 503 without leaking or mutating', async () => {
    await insertStudent(); await insertJob()
    const agent = fakeAgent(async () => { throw new AgentUnavailableError() })
    const app = appFor(agent)
    const before = await durableSnapshot()

    const response = await app.inject({ method: 'POST', url: '/api/material-uploads/material-process-1/process' })
    await app.close()

    expect(response.statusCode).toBe(503)
    expect(response.json()).toEqual({ code: 'AGENT_UNAVAILABLE', message: 'Student Agent is unavailable', data: null })
    expect(JSON.stringify(response.json())).not.toMatch(/DATABASE_URL|SECRET|prompt/i)
    expect(await durableSnapshot()).toBe(before)
  })

  it('persists only a bounded failed job for an allowlisted Agent domain failure', async () => {
    await insertStudent(); await insertJob()
    const agent = fakeAgent(async () => { throw new AgentDomainError('UNSUPPORTED_MATERIAL') })
    const app = appFor(agent)

    const response = await app.inject({ method: 'POST', url: '/api/material-uploads/material-process-1/process' })
    await app.close()

    const expected = {
      ...job(), updatedAt: processedAt, progress: 1, status: 'failed',
      failure: { code: 'UNSUPPORTED_MATERIAL', message: 'Material is not supported' },
    }
    expect(response.json()).toEqual({
      code: 'UNSUPPORTED_MATERIAL', message: 'Material is not supported', data: { job: expected },
    })
    expect(response.statusCode).toBe(400)
    await expect(readJob()).resolves.toMatchObject({ status: 'failed', payload: expected })
  })

  it('does not trust a forged Agent domain code or message from an injected client', async () => {
    await insertStudent(); await insertJob()
    const agent = fakeAgent(async () => {
      throw new AgentDomainError('FORGED_INTERNAL_CODE' as never)
    })
    const app = appFor(agent)
    const before = await durableSnapshot()

    const response = await app.inject({ method: 'POST', url: '/api/material-uploads/material-process-1/process' })
    await app.close()

    expect(response.statusCode).toBe(500)
    expect(response.json()).toEqual({ code: 'INTERNAL_ERROR', message: 'Internal server error', data: null })
    expect(response.body).not.toMatch(/FORGED_INTERNAL_CODE|Student answer|internal-agent\.local/)
    expect(await durableSnapshot()).toBe(before)
  })

  it('lets cancellation win while the Agent is pending and never resurrects the job', async () => {
    await insertStudent(); await insertJob()
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    let called!: () => void
    const started = new Promise<void>((resolve) => { called = resolve })
    const agent = fakeAgent(async () => { called(); await gate; return classification() })
    const app = appFor(agent)

    const processing = app.inject({ method: 'POST', url: '/api/material-uploads/material-process-1/process' })
    await started
    const cancellation = await app.inject({ method: 'POST', url: '/api/material-uploads/material-process-1/cancel' })
    release()
    const late = await processing
    await app.close()

    expect(cancellation.statusCode).toBe(200)
    expect(cancellation.json().data.job.status).toBe('cancelled')
    expect(late.statusCode).toBe(409)
    expect(late.json()).toMatchObject({ code: 'UPLOAD_CANCELLED', data: null })
    await expect(readJob()).resolves.toMatchObject({ status: 'cancelled', payload: expect.objectContaining({ status: 'cancelled' }) })
  })

  it('deduplicates identical concurrent requests into one logical Agent classification', async () => {
    await insertStudent(); await insertJob()
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    let called!: () => void
    const started = new Promise<void>((resolve) => { called = resolve })
    const agent = fakeAgent(async () => { called(); await gate; return classification() })
    const app = appFor(agent)

    const first = app.inject({ method: 'POST', url: '/api/material-uploads/material-process-1/process' })
    await started
    const second = app.inject({ method: 'POST', url: '/api/material-uploads/material-process-1/process' })
    release()
    const responses = await Promise.all([first, second])
    await app.close()

    expect(responses.map(({ statusCode }) => statusCode)).toEqual([200, 200])
    expect(responses[0]?.body).toBe(responses[1]?.body)
    expect(agent.classifyMaterial).toHaveBeenCalledOnce()
    await expect(readJob()).resolves.toMatchObject({ status: 'needs_confirmation' })
  })

  it('deduplicates identical requests across two app and Prisma instances in the supported single process', async () => {
    await insertStudent(); await insertJob()
    const secondPrisma = createTestPrisma()
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    let called!: () => void
    const started = new Promise<void>((resolve) => { called = resolve })
    const firstAgent = fakeAgent(async () => { called(); await gate; return classification() })
    const secondAgent = fakeAgent()
    const firstApp = appFor(firstAgent)
    const secondApp = appFor(secondAgent, studentId, secondPrisma)

    try {
      const first = firstApp.inject({ method: 'POST', url: '/api/material-uploads/material-process-1/process' })
      await started
      const second = secondApp.inject({ method: 'POST', url: '/api/material-uploads/material-process-1/process' })
      await new Promise((resolve) => setTimeout(resolve, 25))
      release()
      const responses = await Promise.all([first, second])

      expect(responses.map(({ statusCode }) => statusCode)).toEqual([200, 200])
      expect(responses[0]?.body).toBe(responses[1]?.body)
      expect(firstAgent.classifyMaterial.mock.calls.length + secondAgent.classifyMaterial.mock.calls.length).toBe(1)
      await expect(readJob()).resolves.toMatchObject({ status: 'needs_confirmation' })
    } finally {
      release()
      await Promise.all([firstApp.close(), secondApp.close()])
      await secondPrisma.$disconnect()
    }
  })

  it('fails explicitly without transport when the default app has no ingestion reference integration', async () => {
    await insertStudent(); await insertJob()
    const app = buildApp({
      env: parseEnv({
        NODE_ENV: 'test', DATABASE_URL: TEST_DATABASE_URL, STUDENT_ID: studentId,
        LOG_LEVEL: 'silent', AGENT_BASE_URL: 'http://127.0.0.1:1',
      }),
      prisma,
      now: () => new Date(processedAt),
    })

    const response = await app.inject({ method: 'POST', url: '/api/material-uploads/material-process-1/process' })
    await app.close()

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({
      code: 'CONTENT_UNAVAILABLE',
      message: 'Material content is unavailable',
      data: { job: { status: 'failed', failure: { code: 'CONTENT_UNAVAILABLE' } } },
    })
    await expect(readJob()).resolves.toMatchObject({
      status: 'failed', payload: expect.objectContaining({ status: 'failed', failure: { code: 'CONTENT_UNAVAILABLE', message: 'Material content is unavailable' } }),
    })
  })

  it('keeps transport and route boundaries strict and documents every response', async () => {
    await insertStudent(); await insertJob()
    const agent = fakeAgent()
    const app = appFor(agent)
    const before = await durableSnapshot()

    const withBody = await app.inject({ method: 'POST', url: '/api/material-uploads/material-process-1/process', payload: {} })
    const xml = await app.inject({
      method: 'POST', url: '/api/material-uploads/material-process-1/process',
      headers: { 'content-type': 'application/xml' }, payload: '<secret>RAW</secret>',
    })
    const tooLarge = await app.inject({
      method: 'POST', url: '/api/material-uploads/material-process-1/process', payload: { padding: 'x'.repeat(1_048_577) },
    })
    const overlong = await app.inject({ method: 'POST', url: `/api/material-uploads/${'x'.repeat(96)}/process` })
    const spec = await app.inject({ method: 'GET', url: '/documentation/json' })
    await app.close()

    expect(withBody.statusCode).toBe(400)
    expect(xml.statusCode).toBe(415)
    expect(tooLarge.statusCode).toBe(413)
    expect(overlong.statusCode).toBe(400)
    expect([withBody, xml, tooLarge, overlong].map((response) => response.json().code))
      .toEqual(['INVALID_INPUT', 'UNSUPPORTED_MEDIA_TYPE', 'PAYLOAD_TOO_LARGE', 'INVALID_INPUT'])
    expect(agent.classifyMaterial).not.toHaveBeenCalled()
    expect(await durableSnapshot()).toBe(before)
    const operation = spec.json().paths['/api/material-uploads/{id}/process'].post
    expect(operation.requestBody).toBeUndefined()
    expect(Object.keys(operation.responses).map(Number).sort((a, b) => a - b))
      .toEqual([200, 400, 404, 409, 413, 415, 500, 502, 503])
    expect(operation.parameters[0].schema).toMatchObject({ maxLength: 95 })
  })

  it('processes the reachable 95-character id while keeping its operation key bounded', async () => {
    await insertStudent()
    const id = 'r'.repeat(95)
    await insertJob(studentId, job({ id }))
    const agent = fakeAgent()
    const app = appFor(agent)

    const response = await app.inject({ method: 'POST', url: `/api/material-uploads/${id}/process` })
    await app.close()

    expect(response.statusCode).toBe(200)
    const request = agent.classifyMaterial.mock.calls[0]?.[0]
    expect(request?.operationKey).toBe(operationKey(studentId, id, createdAt))
    expect(request?.operationKey.length).toBeLessThanOrEqual(200)
    await expect(readJob(id)).resolves.toMatchObject({ status: 'needs_confirmation' })
  })

  it('maps the typed invalid-output error without persisting any unsafe value', async () => {
    await insertStudent(); await insertJob()
    const agent = fakeAgent(async () => { throw new AgentOutputInvalidError() })
    const app = appFor(agent)
    const before = await durableSnapshot()
    const response = await app.inject({ method: 'POST', url: '/api/material-uploads/material-process-1/process' })
    await app.close()
    expect(response.statusCode).toBe(502)
    expect(await durableSnapshot()).toBe(before)
  })
})
