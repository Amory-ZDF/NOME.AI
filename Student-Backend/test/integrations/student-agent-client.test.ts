import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createHttpStudentAgentClient } from '../../src/integrations/student-agent/http-student-agent.client.js'
import {
  AgentDomainError,
  AgentOutputInvalidError,
  AgentUnavailableError,
} from '../../src/integrations/student-agent/student-agent.errors.js'

type Reply = {
  body: string
  bodyDelayMs?: number
  bodyGate?: Promise<void>
  contentType?: string
  delayMs?: number
  headers?: Record<string, string>
  status?: number
}

const hintLevels = [1, 2, 3, 4, 5] as const

const materialRequest = {
  contractVersion: 1 as const,
  operationKey: 'material-v1:student-1:job-1:2026-08-13T00:00:00.000Z',
  studentId: 'student-1',
  job: {
    id: 'job-1',
    fileName: 'calculus.pdf',
    mimeType: 'application/pdf' as const,
    size: 1024,
    materialType: 'class_note' as const,
    examBoard: 'Cambridge',
    subject: 'Mathematics',
    chapter: 'Differentiation',
    createdAt: '2026-08-13T00:00:00.000Z',
    updatedAt: '2026-08-13T00:00:00.000Z',
  },
}

const sourceQuestion = {
  id: 'question-source',
  order: 1,
  type: 'calculation' as const,
  topic: 'Differentiation',
  difficulty: 3,
  content: 'Differentiate x^2.',
  acceptKeywords: ['2x'],
  correctDisplay: '2x',
  errorType: 'method' as const,
  hints: hintLevels.map((level) => ({
    level,
    title: `Hint ${level}`,
    content: `Content ${level}`,
  })),
}

const generatedQuestion = {
  type: 'calculation' as const,
  topic: 'Differentiation',
  difficulty: 3,
  content: 'Differentiate 3x^2.',
  acceptKeywords: ['6x'],
  correctDisplay: '6x',
  errorType: 'method' as const,
  hints: hintLevels.map((level) => ({
    level,
    title: `Variant hint ${level}`,
    content: `Variant content ${level}`,
  })),
}

const questionRequest = {
  contractVersion: 1 as const,
  operationKey: 'question-variant-v1:student-1:question-source',
  studentId: 'student-1',
  source: {
    setId: 'set-source',
    kind: 'task' as const,
    subject: 'Mathematics',
    question: sourceQuestion,
  },
}

const errorRequest = {
  contractVersion: 1 as const,
  operationKey: 'error-variant-v1:student-1:error-1:redo-1',
  studentId: 'student-1',
  source: questionRequest.source,
  error: {
    id: 'error-1',
    errorType: 'method' as const,
    questionSummary: 'Differentiate x^2.',
    whereWrong: 'Method selection',
    whyWrong: 'The power rule was not applied.',
    studentAnswer: 'x',
    correctAnswer: '2x',
    latestCorrectRedo: {
      attemptedAt: '2026-08-13T01:00:00.000Z',
      answer: '2x',
      isCorrect: true,
      timeSpent: 20,
    },
  },
}

function classification(overrides: Record<string, unknown> = {}) {
  return {
    suggestedTitle: 'Differentiation notes',
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
  }
}

async function readBody(request: IncomingMessage): Promise<string> {
  let body = ''
  for await (const chunk of request) body += String(chunk)
  return body
}

describe('HTTP Student Agent client', () => {
  let baseUrl = ''
  let redirectTargetUrl = ''
  let responder: (request: IncomingMessage, body: string) => Reply
  let signalBodyPending: () => void = () => undefined
  let signalResponseClosed: () => void = () => undefined
  let redirectedBody: string | undefined
  const requests: Array<{
    body: unknown
    contractVersion: string | undefined
    method: string | undefined
    path: string | undefined
  }> = []

  const redirectTarget = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    redirectedBody = await readBody(request)
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ code: 0, message: 'ok', data: { classification: classification() } }))
  })

  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const rawBody = await readBody(request)
    const contractVersion = request.headers['x-nome-agent-contract-version']
    response.once('close', () => signalResponseClosed())
    requests.push({
      body: rawBody === '' ? undefined : JSON.parse(rawBody),
      contractVersion: Array.isArray(contractVersion) ? contractVersion[0] : contractVersion,
      method: request.method,
      path: request.url,
    })
    const reply = responder(request, rawBody)
    if (reply.delayMs !== undefined) {
      await new Promise((resolve) => setTimeout(resolve, reply.delayMs))
    }
    response.writeHead(reply.status ?? 200, {
      'Content-Type': reply.contentType ?? 'application/json; charset=utf-8',
      ...reply.headers,
    })
    if (reply.bodyDelayMs !== undefined || reply.bodyGate !== undefined) {
      response.flushHeaders()
      signalBodyPending()
      const bodyPending = reply.bodyGate ?? new Promise((resolve) => setTimeout(resolve, reply.bodyDelayMs))
      await Promise.race([
        bodyPending,
        new Promise<void>((resolve) => response.once('close', () => resolve())),
      ])
      if (response.destroyed) return
    }
    response.end(reply.body)
  })

  beforeAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => resolve())
    })
    const address = server.address() as AddressInfo
    baseUrl = `http://127.0.0.1:${address.port}`
    await new Promise<void>((resolve, reject) => {
      redirectTarget.once('error', reject)
      redirectTarget.listen(0, '127.0.0.1', () => resolve())
    })
    const redirectAddress = redirectTarget.address() as AddressInfo
    redirectTargetUrl = `http://127.0.0.1:${redirectAddress.port}`
  })

  beforeEach(() => {
    requests.length = 0
    redirectedBody = undefined
    signalBodyPending = () => undefined
    signalResponseClosed = () => undefined
    responder = () => ({ body: JSON.stringify({ code: 0, message: 'ok', data: {} }) })
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error === undefined ? resolve() : reject(error))
    })
    await new Promise<void>((resolve, reject) => {
      redirectTarget.close((error) => error === undefined ? resolve() : reject(error))
    })
  })

  it('posts each versioned request to its constant internal endpoint and validates the result', async () => {
    responder = (request) => {
      const data = request.url?.endsWith('/material-classifications')
        ? { classification: classification() }
        : { question: generatedQuestion }
      return { body: JSON.stringify({ code: 0, message: 'ok', data }) }
    }
    const client = createHttpStudentAgentClient({ baseUrl, timeoutMs: 1000 })

    await expect(client.classifyMaterial(materialRequest)).resolves.toEqual(classification())
    await expect(client.generateQuestionVariant(questionRequest)).resolves.toEqual(generatedQuestion)
    await expect(client.generateErrorVariant(errorRequest)).resolves.toEqual(generatedQuestion)

    expect(requests).toEqual([
      { contractVersion: '1', method: 'POST', path: '/internal/v1/student-agent/material-classifications', body: materialRequest },
      { contractVersion: '1', method: 'POST', path: '/internal/v1/student-agent/question-variants', body: questionRequest },
      { contractVersion: '1', method: 'POST', path: '/internal/v1/student-agent/error-variants', body: errorRequest },
    ])
  })

  it('rejects a structurally invalid success as safe invalid Agent output', async () => {
    responder = () => ({
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: { classification: classification({ confidence: 2, secret: 'MODEL_SECRET_SENTINEL' }) },
      }),
    })
    const client = createHttpStudentAgentClient({ baseUrl, timeoutMs: 1000 })

    const error = await client.classifyMaterial(materialRequest).catch((caught) => caught)

    expect(error).toBeInstanceOf(AgentOutputInvalidError)
    expect(String(error)).not.toContain('MODEL_SECRET_SENTINEL')
  })

  it.each([
    ['fileName', 'data:application/pdf;base64,RAW_FILE'],
    ['examBoard', 'base64:RAW_BOARD'],
    ['subject', 'raw:RAW_SUBJECT'],
    ['chapter', 'chapter;base64,RAW_CHAPTER'],
  ] as const)('rejects raw/base64 material metadata in %s before transport', async (field, value) => {
    const client = createHttpStudentAgentClient({ baseUrl, timeoutMs: 1000 })

    await expect(client.classifyMaterial({
      ...materialRequest,
      job: { ...materialRequest.job, [field]: value },
    })).rejects.toMatchObject({ name: 'ZodError' })
    expect(requests).toEqual([])
  })

  it.each(['variantOf', 'sourceQuestionId'])('rejects Agent-owned %s provenance', async (field) => {
    responder = () => ({
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: { question: { ...generatedQuestion, [field]: 'FORGED_PROVENANCE_SENTINEL' } },
      }),
    })
    const client = createHttpStudentAgentClient({ baseUrl, timeoutMs: 1000 })

    const error = await client.generateQuestionVariant(questionRequest).catch((caught) => caught)

    expect(error).toBeInstanceOf(AgentOutputInvalidError)
    expect(String(error)).not.toContain('FORGED_PROVENANCE_SENTINEL')
  })

  it.each([
    ['non-JSON', { body: 'PROMPT_SECRET_SENTINEL', contentType: 'application/json' }],
    ['wrong content type', { body: JSON.stringify({ code: 0, data: {} }), contentType: 'text/plain' }],
    ['oversized', { body: JSON.stringify({ code: 0, data: { padding: 'x'.repeat(1_048_577) } }) }],
  ])('rejects a %s success without reflecting the response', async (_case, reply) => {
    responder = () => reply
    const client = createHttpStudentAgentClient({ baseUrl, timeoutMs: 1000 })

    const error = await client.classifyMaterial(materialRequest).catch((caught) => caught)

    expect(error).toBeInstanceOf(AgentOutputInvalidError)
    expect(String(error)).not.toMatch(/PROMPT_SECRET_SENTINEL|x{100}/)
  })

  it('rejects a JSON-like but invalid response media type', async () => {
    responder = () => ({
      contentType: 'application/jsonp',
      body: JSON.stringify({ code: 0, message: 'ok', data: { classification: classification() } }),
    })
    const client = createHttpStudentAgentClient({ baseUrl, timeoutMs: 1000 })

    await expect(client.classifyMaterial(materialRequest)).rejects.toBeInstanceOf(AgentOutputInvalidError)
  })

  it('rejects a 2xx envelope whose code is not zero', async () => {
    responder = () => ({
      body: JSON.stringify({
        code: 1,
        message: 'ok',
        data: { classification: classification() },
      }),
    })
    const client = createHttpStudentAgentClient({ baseUrl, timeoutMs: 1000 })

    await expect(client.classifyMaterial(materialRequest)).rejects.toBeInstanceOf(AgentOutputInvalidError)
  })

  it('maps a network failure to a generic unavailable error', async () => {
    const client = createHttpStudentAgentClient({ baseUrl: 'http://127.0.0.1:1', timeoutMs: 1000 })

    await expect(client.classifyMaterial(materialRequest)).rejects.toBeInstanceOf(AgentUnavailableError)
  })

  it('maps an allowlisted 4xx error to a bounded Agent domain error', async () => {
    responder = () => ({
      status: 422,
      body: JSON.stringify({
        code: 'UNSUPPORTED_MATERIAL',
        message: 'The material cannot be classified',
        data: null,
      }),
    })
    const client = createHttpStudentAgentClient({ baseUrl, timeoutMs: 1000 })

    await expect(client.classifyMaterial(materialRequest)).rejects.toMatchObject({
      constructor: AgentDomainError,
      safeCode: 'UNSUPPORTED_MATERIAL',
      safeMessage: 'Material is not supported',
    })
  })

  it('maps an allowlisted domain code to a backend-owned message', async () => {
    responder = () => ({
      status: 422,
      body: JSON.stringify({
        code: 'GENERATION_REJECTED',
        message: 'Student answered x and the prompt is available at http://internal-agent.local/debug',
        data: null,
      }),
    })
    const client = createHttpStudentAgentClient({ baseUrl, timeoutMs: 1000 })

    const error = await client.generateErrorVariant(errorRequest).catch((caught) => caught)

    expect(error).toMatchObject({
      constructor: AgentDomainError,
      safeCode: 'GENERATION_REJECTED',
      safeMessage: 'Question generation was rejected',
    })
    expect(String(error)).not.toMatch(/Student answered x|internal-agent\.local/)
  })

  it('maps a server failure to a generic unavailable error without leaking its body', async () => {
    responder = () => ({
      status: 503,
      body: JSON.stringify({ code: 'FAILED', message: 'DATABASE_URL=SECRET_DB', data: null }),
    })
    const client = createHttpStudentAgentClient({ baseUrl, timeoutMs: 1000 })

    const error = await client.generateQuestionVariant(questionRequest).catch((caught) => caught)

    expect(error).toBeInstanceOf(AgentUnavailableError)
    expect(String(error)).not.toContain('SECRET_DB')
  })

  it('cancels a stalled 5xx response body before reporting the Agent as unavailable', async () => {
    let resolveBodyPending!: () => void
    const bodyPending = new Promise<void>((resolve) => { resolveBodyPending = resolve })
    signalBodyPending = resolveBodyPending
    let resolveResponseClosed!: () => void
    const responseClosed = new Promise<void>((resolve) => { resolveResponseClosed = resolve })
    signalResponseClosed = resolveResponseClosed
    let releaseBody!: () => void
    const bodyGate = new Promise<void>((resolve) => { releaseBody = resolve })
    responder = () => ({
      status: 503,
      bodyGate,
      body: JSON.stringify({ code: 'FAILED', message: 'STALLED_SECRET_BODY', data: null }),
    })
    const client = createHttpStudentAgentClient({ baseUrl, timeoutMs: 1000 })

    try {
      const operation = client.classifyMaterial(materialRequest)
      await bodyPending
      await expect(operation).rejects.toBeInstanceOf(AgentUnavailableError)
      const closedBeforeRelease = await Promise.race([
        responseClosed.then(() => true),
        new Promise<false>((resolve) => setTimeout(() => resolve(false), 100)),
      ])
      expect(closedBeforeRelease).toBe(true)
    } finally {
      releaseBody()
    }
  })

  it('refuses a cross-origin redirect without forwarding the student request body', async () => {
    responder = () => ({
      status: 307,
      headers: { Location: `${redirectTargetUrl}/collect` },
      body: '',
    })
    const client = createHttpStudentAgentClient({ baseUrl, timeoutMs: 1000 })

    await expect(client.classifyMaterial(materialRequest)).rejects.toBeInstanceOf(AgentUnavailableError)
    expect(redirectedBody).toBeUndefined()
  })

  it('times out a slow Agent operation with a generic unavailable error', async () => {
    responder = () => ({ delayMs: 100, body: JSON.stringify({ code: 0, data: {} }) })
    const client = createHttpStudentAgentClient({ baseUrl, timeoutMs: 10 })

    await expect(client.generateErrorVariant(errorRequest)).rejects.toBeInstanceOf(AgentUnavailableError)
  })

  it('maps a stalled response body timeout to a generic unavailable error', async () => {
    let resolveBodyPending!: () => void
    const bodyPending = new Promise<void>((resolve) => { resolveBodyPending = resolve })
    signalBodyPending = resolveBodyPending
    responder = () => ({ bodyDelayMs: 500, body: JSON.stringify({ code: 0, data: {} }) })
    const client = createHttpStudentAgentClient({ baseUrl, timeoutMs: 100 })

    const operation = client.generateErrorVariant(errorRequest)
    await bodyPending
    await expect(operation).rejects.toBeInstanceOf(AgentUnavailableError)
  })

  it('preserves caller cancellation instead of remapping it', async () => {
    responder = () => ({ delayMs: 100, body: JSON.stringify({ code: 0, data: {} }) })
    const controller = new AbortController()
    controller.abort()
    const client = createHttpStudentAgentClient({ baseUrl, timeoutMs: 1000 })

    await expect(client.classifyMaterial(materialRequest, { signal: controller.signal }))
      .rejects.toMatchObject({ name: 'AbortError' })
  })

  it('preserves caller cancellation while the response body is pending', async () => {
    let resolveBodyPending!: () => void
    const bodyPending = new Promise<void>((resolve) => { resolveBodyPending = resolve })
    signalBodyPending = resolveBodyPending
    responder = () => ({ bodyDelayMs: 500, body: JSON.stringify({ code: 0, data: {} }) })
    const controller = new AbortController()
    const client = createHttpStudentAgentClient({ baseUrl, timeoutMs: 1000 })

    const operation = client.classifyMaterial(materialRequest, { signal: controller.signal })
    await bodyPending
    controller.abort()

    await expect(operation).rejects.toMatchObject({ name: 'AbortError' })
  })
})
