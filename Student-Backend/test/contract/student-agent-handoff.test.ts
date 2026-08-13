import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildApp } from '../../src/app.js'
import { parseEnv } from '../../src/config/env.js'
import { toInputJson } from '../../src/db/json.js'
import {
  errorVariantRequestSchema,
  generatedQuestionDataSchema,
  materialClassificationDataSchema,
  materialClassificationRequestSchema,
  questionVariantRequestSchema,
} from '../../src/integrations/student-agent/student-agent.contracts.js'
import type { StudentAgentClient } from '../../src/integrations/student-agent/student-agent.client.js'
import { createTestPrisma, resetDatabase, TEST_DATABASE_URL } from '../helpers/database.js'

const root = fileURLToPath(new URL('../../..', import.meta.url))
const fixtureRoot = fileURLToPath(new URL('../../contracts/student-agent-v1/', import.meta.url))
const prisma = createTestPrisma()
const primaryStudentId = 'handoff-primary'
const otherStudentId = 'handoff-other'
const sourceQuestionId = 'handoff-source-question'
const sourceTaskId = 'handoff-source-task'
const sourceSetId = 'handoff-source-set'
const processAt = '2026-08-13T09:00:00.000Z'

async function text(path: string): Promise<string> {
  return readFile(`${root}/${path}`, 'utf8')
}

async function fixture(name: string): Promise<unknown> {
  return JSON.parse(await readFile(`${fixtureRoot}/${name}`, 'utf8')) as unknown
}

async function sourceTreeText(relativeDirectory: string, extensions: readonly string[]): Promise<string> {
  const directory = join(root, relativeDirectory)
  const entries = await readdir(directory, { withFileTypes: true })
  const values = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      return sourceTreeText(`${relativeDirectory}/${entry.name}`, extensions)
    }
    return entry.isFile() && extensions.some((extension) => entry.name.endsWith(extension))
      ? readFile(path, 'utf8')
      : ''
  }))
  return values.join('\n')
}

async function insertStudent(id: string): Promise<void> {
  await prisma.student.create({
    data: {
      id,
      name: id,
      avatar: null,
      joinedDays: 1,
      gradeInfo: 'A-Level',
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

async function seedSourceQuestion(): Promise<void> {
  const sourceQuestion = {
    id: sourceQuestionId,
    order: 1,
    type: 'calculation',
    topic: 'Differentiation',
    difficulty: 3,
    content: 'Differentiate x^2.',
    acceptKeywords: ['2x'],
    correctDisplay: '2x',
    errorType: 'method',
    hints: [1, 2, 3, 4, 5].map((level) => ({
      level,
      title: `Hint ${level}`,
      content: `Content ${level}`,
    })),
  }
  const task = {
    id: sourceTaskId,
    title: 'Source differentiation task',
    type: 'teacher_assigned',
    subject: 'Mathematics',
    estimatedMinutes: 20,
    dueAt: null,
    assignedBy: 'teacher',
    priority: 'P1',
    isOverdue: false,
    status: 'pending',
    exerciseSetId: sourceSetId,
    createdAt: '2026-08-13T08:00:00.000Z',
  }
  const set = {
    id: sourceSetId,
    taskId: sourceTaskId,
    title: task.title,
    subject: task.subject,
    questions: [sourceQuestion],
    createdAt: task.createdAt,
  }
  await prisma.task.create({
    data: {
      id: task.id,
      studentId: primaryStudentId,
      type: task.type,
      status: task.status,
      dueAt: null,
      payload: toInputJson(task),
    },
  })
  await prisma.exerciseSet.create({
    data: {
      id: set.id,
      studentId: primaryStudentId,
      taskId: task.id,
      kind: 'task',
      payload: toInputJson(set),
    },
  })
}

async function allModelsSnapshot(): Promise<string> {
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

function expectOk(response: { statusCode: number; json(): unknown }, expectedData: unknown): void {
  expect(response.statusCode).toBe(200)
  expect(response.json()).toStrictEqual({ code: 0, message: 'ok', data: expectedData })
}

function shortDigest(parts: readonly string[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 24)
}

beforeEach(async () => resetDatabase(prisma))
afterAll(async () => {
  await resetDatabase(prisma)
  await prisma.$disconnect()
})

describe('Student Agent v1 teammate handoff', () => {
  it.each([
    ['material-classification.request.json', materialClassificationRequestSchema],
    ['material-classification.response.json', materialClassificationDataSchema],
    ['question-variant.request.json', questionVariantRequestSchema],
    ['question-variant.response.json', generatedQuestionDataSchema],
    ['error-variant.request.json', errorVariantRequestSchema],
    ['error-variant.response.json', generatedQuestionDataSchema],
  ] as const)('keeps %s parseable by the exact runtime schema', async (name, schema) => {
    expect(schema.parse(await fixture(name))).toEqual(await fixture(name))
  })

  it.each([
    ['material-classification.request.json', materialClassificationRequestSchema, (value: any) => {
      delete value.contractVersion
    }],
    ['material-classification.response.json', materialClassificationDataSchema, (value: any) => {
      value.classification.unexpected = true
    }],
    ['question-variant.request.json', questionVariantRequestSchema, (value: any) => {
      value.source.question.hints = value.source.question.hints.slice(0, 1)
    }],
    ['question-variant.response.json', generatedQuestionDataSchema, (value: any) => {
      value.question.id = 'agent-owned-id'
    }],
    ['error-variant.request.json', errorVariantRequestSchema, (value: any) => {
      value.prompt = 'agent-internal prompt must not cross this boundary'
    }],
    ['error-variant.response.json', generatedQuestionDataSchema, (value: any) => {
      value.question.order = 1
    }],
  ] as const)('rejects an independently weakened %s fixture', async (name, schema, mutate) => {
    const value = structuredClone(await fixture(name))
    mutate(value)
    expect(schema.safeParse(value).success).toBe(false)
  })

  it('rejects weakened or Agent-owned authority fields from versioned fixtures', async () => {
    const material = await fixture('material-classification.request.json') as Record<string, unknown>
    const materialResponse = await fixture('material-classification.response.json') as {
      classification: Record<string, unknown>
    }
    const questionRequest = await fixture('question-variant.request.json') as {
      source: { question: Record<string, unknown> }
    }
    const question = await fixture('question-variant.response.json') as { question: Record<string, unknown> }
    const error = await fixture('error-variant.request.json') as Record<string, unknown>
    expect(materialClassificationRequestSchema.safeParse({ ...material, contractVersion: 2 }).success).toBe(false)
    expect(materialClassificationRequestSchema.safeParse({
      ...material,
      contractVersion: undefined,
    }).success).toBe(false)
    expect(materialClassificationRequestSchema.safeParse({ ...material, operationKey: 'data:text/plain;base64,RAW' }).success).toBe(false)
    expect(materialClassificationRequestSchema.safeParse({ ...material, unexpected: true }).success).toBe(false)
    expect(materialClassificationDataSchema.safeParse({
      classification: {
        ...materialResponse.classification,
        answerBlocks: [{ id: 'a-missing', questionId: 'missing', text: 'invalid reference' }],
      },
    }).success).toBe(false)
    expect(questionVariantRequestSchema.safeParse({
      ...questionRequest,
      source: {
        ...questionRequest.source,
        question: {
          ...questionRequest.source.question,
          hints: [{ level: 1, title: 'Only one', content: 'Incomplete hint ladder' }],
        },
      },
    }).success).toBe(false)
    expect(generatedQuestionDataSchema.safeParse({ question: { ...question.question, id: 'agent-owned-id' } }).success).toBe(false)
    expect(generatedQuestionDataSchema.safeParse({ question: { ...question.question, order: 1 } }).success).toBe(false)
    expect(errorVariantRequestSchema.safeParse({ ...error, unexpectedPrompt: 'secret' }).success).toBe(false)
  })

  it('documents the single public API owner and versioned internal Agent responsibilities', async () => {
    const [handoff, readme, api] = await Promise.all([
      text('Student-Backend/AGENT_HANDOFF.md'),
      text('Student-Backend/README.md'),
      text('Student_Frontend/API_INTERFACE.md'),
    ])
    for (const value of [handoff, readme, api]) {
      expect(value).toContain('Student-Backend')
      expect(value).toContain('POST /api/sessions')
    }
    expect(handoff).toContain('X-NOME-Agent-Contract-Version: 1')
    expect(handoff).toContain('/internal/v1/student-agent/material-classifications')
    expect(handoff).toContain('/internal/v1/student-agent/question-variants')
    expect(handoff).toContain('/internal/v1/student-agent/error-variants')
    expect(handoff).toContain('idempotent')
    expect(handoff).toContain('operationKey')
    expect(handoff).toContain('opaque ingestion reference')
    expect(handoff).toContain('generated content only')
    expect(handoff).toContain('rename or remove')
    expect(readme).not.toContain('intentionally absent')
    expect(api).toContain('one public Student API')
  })

  it('records the teammate Python conflict without modifying teammate-owned code', async () => {
    const [pythonMain, pythonAgent, pythonSources, materialRoutes, questionRoutes, errorRoutes, sessionRoutes] = await Promise.all([
      text('backend/app/main.py'),
      text('backend/app/routers/student/agent.py'),
      sourceTreeText('backend/app', ['.py']),
      text('Student-Backend/src/modules/materials/material.routes.ts'),
      text('Student-Backend/src/modules/variants/question-variant.routes.ts'),
      text('Student-Backend/src/modules/variants/error-variant.routes.ts'),
      text('Student-Backend/src/modules/sessions/session.routes.ts'),
    ])
    expect(pythonMain).toContain('TypeScript Student-Backend')
    expect(pythonAgent).toContain('@router.post("/sessions"')
    expect(pythonAgent).not.toContain('/internal/v1/student-agent/material-classifications')
    expect(pythonAgent).not.toContain('/internal/v1/student-agent/question-variants')
    expect(pythonAgent).not.toContain('/internal/v1/student-agent/error-variants')
    expect(pythonSources).not.toContain('/api/material-uploads')
    expect(pythonSources).not.toContain('/api/questions/')
    expect(pythonSources).not.toContain('/api/errors/')
    expect(materialRoutes).toContain("routes.post('/api/material-uploads/:id/process'")
    expect(questionRoutes).toContain("routes.post('/api/questions/:questionId/variant'")
    expect(errorRoutes).toContain("routes.post('/api/errors/:id/variant'")
    expect(sessionRoutes).toContain("'/api/sessions'")
  })

  it('keeps browser runtime on one base URL with no Agent or model configuration', async () => {
    const [client, apiIndex, example, frontendSources] = await Promise.all([
      text('Student_Frontend/src/api/client.js'),
      text('Student_Frontend/src/api/index.js'),
      text('Student_Frontend/.env.example'),
      sourceTreeText('Student_Frontend/src', ['.js', '.jsx']),
    ])
    expect(client).toContain('VITE_API_BASE_URL')
    expect(example).toContain('VITE_API_BASE_URL')
    for (const value of [client, apiIndex, example, frontendSources]) {
      expect(value).not.toMatch(/AGENT_BASE_URL|localhost:8000|127\.0\.0\.1:8000|OPENAI_API_KEY|MODEL_SECRET/u)
    }
  })

  it('completes all public Agent-backed lifecycles while Student-Backend retains authority and tenant isolation', async () => {
    const materialData = materialClassificationDataSchema.parse(
      await fixture('material-classification.response.json'),
    )
    const questionData = generatedQuestionDataSchema.parse(
      await fixture('question-variant.response.json'),
    )
    const errorData = generatedQuestionDataSchema.parse(
      await fixture('error-variant.response.json'),
    )
    const agent = {
      classifyMaterial: vi.fn(async () => materialData.classification),
      generateQuestionVariant: vi.fn(async () => questionData.question),
      generateErrorVariant: vi.fn(async () => errorData.question),
    } satisfies StudentAgentClient
    const appFor = (studentId: string) => buildApp({
      env: parseEnv({
        NODE_ENV: 'test',
        DATABASE_URL: TEST_DATABASE_URL,
        STUDENT_ID: studentId,
        LOG_LEVEL: 'silent',
      }),
      prisma,
      now: () => new Date(processAt),
      studentAgentClient: agent,
    })

    await insertStudent(primaryStudentId)
    await insertStudent(otherStudentId)
    await seedSourceQuestion()
    const app = appFor(primaryStudentId)
    const otherApp = appFor(otherStudentId)

    try {
      const materialInput = {
        id: 'handoff-material',
        fileName: 'calculus-notes.pdf',
        mimeType: 'application/pdf',
        size: 4096,
        materialType: 'class_note',
        examBoard: 'Cambridge',
        subject: 'Mathematics',
        chapter: 'Differentiation',
        createdAt: '2026-08-13T08:15:00.000Z',
      }
      const queuedJob = { ...materialInput, updatedAt: materialInput.createdAt, progress: 0, status: 'queued' }
      expectOk(
        await app.inject({ method: 'POST', url: '/api/material-uploads', payload: materialInput }),
        { job: queuedJob },
      )
      const processedJob = {
        ...queuedJob,
        updatedAt: processAt,
        progress: 100,
        status: 'needs_confirmation',
        result: materialData.classification,
      }
      expectOk(
        await app.inject({ method: 'POST', url: '/api/material-uploads/handoff-material/process' }),
        { job: processedJob },
      )
      const result = materialData.classification
      const completedJob = {
        ...processedJob,
        materialType: result.materialType,
        examBoard: result.examBoard,
        subject: result.subject,
        chapter: result.chapter,
        folderId: result.folderId,
        folderPath: result.folderPath,
        status: 'completed',
      }
      const linkedNote = {
        id: 'note-handoff-material',
        title: result.suggestedTitle,
        materialType: result.materialType,
        examBoard: result.examBoard,
        subject: result.subject,
        chapter: result.chapter,
        folderId: result.folderId,
        folderPath: result.folderPath,
        tags: [],
        questionBlocks: result.questionBlocks,
        answerBlocks: result.answerBlocks,
        content: result.content,
        linkedTopics: result.linkedTopics,
        linkedErrors: result.linkedErrors,
        aiSuggestions: [],
        sourceJobId: 'handoff-material',
        source: 'typed',
        createdAt: materialInput.createdAt,
        updatedAt: processAt,
        version: 1,
        versions: [],
      }
      expectOk(
        await app.inject({ method: 'POST', url: '/api/material-uploads/handoff-material/confirm', payload: {} }),
        { job: completedJob, note: linkedNote },
      )
      expectOk(await app.inject({ method: 'GET', url: '/api/notes' }), { notes: [linkedNote] })

      const questionVariant = await app.inject({
        method: 'POST',
        url: `/api/questions/${sourceQuestionId}/variant`,
      })
      const questionSuffix = shortDigest(['question-variant-v1', primaryStudentId, sourceQuestionId])
      const questionIds = {
        setId: `variant-${questionSuffix}`,
        taskId: `task-variant-${questionSuffix}`,
        questionId: `q-variant-${questionSuffix}`,
      }
      const variantQuestion = {
        ...questionData.question,
        id: questionIds.questionId,
        order: 1,
        variantOf: sourceQuestionId,
        sourceQuestionId,
      }
      const variantSet = {
        id: questionIds.setId,
        taskId: questionIds.taskId,
        title: 'Independent transfer: Differentiation',
        subject: 'Mathematics',
        questions: [variantQuestion],
        sourceQuestionId,
        createdAt: processAt,
      }
      const variantTask = {
        id: questionIds.taskId,
        title: variantSet.title,
        type: 'error_review',
        subject: 'Mathematics',
        estimatedMinutes: 15,
        dueAt: null,
        assignedBy: null,
        priority: 'P1',
        isOverdue: false,
        status: 'pending',
        exerciseSetId: questionIds.setId,
        sourceQuestionId,
        reason: 'Independent transfer check',
        createdAt: processAt,
      }
      expectOk(questionVariant, { exerciseSet: variantSet, task: variantTask })
      const session = {
        sessionId: 'handoff-variant-session',
        taskId: variantTask.id,
        taskTitle: variantTask.title,
        subject: variantTask.subject,
        completedAt: '2026-08-13T09:10:00.000Z',
        timeSpent: 10,
        timeSpentSeconds: 600,
        questions: [{
          ...variantQuestion,
          result: {
            status: 'correct',
            attempts: [{
              answer: questionData.question.correctDisplay,
              submittedAt: '2026-08-13T09:09:00.000Z',
              isCorrect: true,
            }],
            hintsUsed: 0,
            solvedAtHintLevel: 0,
            handwritingUsed: false,
          },
        }],
      }
      expectOk(
        await app.inject({ method: 'POST', url: '/api/sessions', payload: session }),
        { sessionId: session.sessionId },
      )
      expectOk(await app.inject({ method: 'GET', url: `/api/summary/${session.sessionId}` }), {
        accuracy: 100,
        correctCount: 1,
        wrongCount: 0,
        unansweredCount: 0,
        hintDependency: { totalHints: 0, averageHints: 0, independentlySolved: 1 },
        errorDistribution: {},
        topicOutcomes: [{ topic: questionData.question.topic, correct: 1, wrong: 0 }],
        wrongQuestions: [],
      })

      const occurredAt = '2026-08-13T07:30:00.000Z'
      const error = {
        id: 'handoff-error',
        questionId: sourceQuestionId,
        sessionId: null,
        subject: 'Mathematics',
        errorType: 'method',
        questionSummary: 'Differentiate a polynomial.',
        questionContent: 'Differentiate x^2.',
        type: 'calculation',
        difficulty: 3,
        errorDescription: 'The response used the wrong method.',
        relatedTopic: 'Differentiation',
        topicId: 'differentiation',
        whereWrong: 'The power-rule step.',
        whyWrong: 'The exponent was not used as a multiplier.',
        linkedAbility: 'method selection',
        hintDependency: 1,
        firstOccurredAt: occurredAt,
        lastOccurredAt: occurredAt,
        occurrences: [occurredAt],
        occurrenceKeys: ['handoff-occurrence'],
        occurrenceRecords: [{ key: 'handoff-occurrence', occurredAt }],
        repeatCount: 1,
        hasIncompleteOccurrenceHistory: false,
        status: 'pending_review',
        studentAnswer: 'x',
        correctAnswer: '2x',
        analysis: 'Apply the power rule.',
        acceptKeywords: ['2x'],
        redoHistory: [],
        verificationVariantId: null,
        variantVerifiedAt: null,
        variantVerification: null,
      }
      expectOk(
        await app.inject({ method: 'POST', url: '/api/errors/batch', payload: { items: [error] } }),
        { errors: [error] },
      )
      const redo = {
        attemptedAt: '2026-08-13T08:30:00.000Z',
        answer: '2x',
        isCorrect: true,
        timeSpent: 20,
      }
      const verificationDueError = { ...error, status: 'verification_due', redoHistory: [redo] }
      expectOk(
        await app.inject({ method: 'POST', url: '/api/errors/handoff-error/redo', payload: redo }),
        { error: verificationDueError },
      )
      const errorVariant = await app.inject({ method: 'POST', url: '/api/errors/handoff-error/variant' })
      const errorSuffix = shortDigest([
        'error-variant-v1',
        primaryStudentId,
        error.id,
        redo.attemptedAt,
      ])
      const errorIds = {
        setId: `error-variant-${errorSuffix}`,
        taskId: `task-error-variant-${errorSuffix}`,
        questionId: `q-error-variant-${errorSuffix}`,
      }
      const expectedErrorQuestion = {
        ...errorData.question,
        id: errorIds.questionId,
        order: 1,
        variantOf: sourceQuestionId,
        sourceQuestionId,
      }
      const expectedErrorSet = {
        id: errorIds.setId,
        taskId: errorIds.taskId,
        title: 'Independent verification: Differentiation',
        subject: 'Mathematics',
        questions: [expectedErrorQuestion],
        sourceQuestionId,
        createdAt: processAt,
      }
      const expectedErrorTask = {
        id: errorIds.taskId,
        title: expectedErrorSet.title,
        type: 'error_review',
        subject: 'Mathematics',
        estimatedMinutes: 15,
        dueAt: null,
        assignedBy: null,
        priority: 'P1',
        isOverdue: false,
        status: 'pending',
        exerciseSetId: errorIds.setId,
        sourceQuestionId,
        verificationForErrorId: error.id,
        reason: 'Independent verification after correct redo',
        createdAt: processAt,
      }
      const linkedError = {
        ...verificationDueError,
        verificationVariantId: errorIds.setId,
      }
      expectOk(errorVariant, {
        exerciseSet: expectedErrorSet,
        task: expectedErrorTask,
        error: linkedError,
      })
      const verification = {
        variantId: errorIds.setId,
        isCorrect: true,
        verifiedAt: '2026-08-13T09:30:00.000Z',
      }
      const verifiedError = {
        ...linkedError,
        status: 'verification_due',
        variantVerifiedAt: verification.verifiedAt,
        variantVerification: verification,
      }
      expectOk(
        await app.inject({ method: 'POST', url: '/api/errors/handoff-error/verification', payload: verification }),
        { error: verifiedError },
      )
      expectOk(
        await app.inject({ method: 'PATCH', url: '/api/errors/handoff-error', payload: { status: 'mastered' } }),
        { error: { ...verifiedError, status: 'mastered' } },
      )

      const callsBeforeIsolation = {
        material: agent.classifyMaterial.mock.calls.length,
        question: agent.generateQuestionVariant.mock.calls.length,
        error: agent.generateErrorVariant.mock.calls.length,
      }
      expectOk(await otherApp.inject({ method: 'GET', url: '/api/notes' }), { notes: [] })
      for (const read of [
        () => otherApp.inject({ method: 'GET', url: `/api/summary/${session.sessionId}` }),
        () => otherApp.inject({ method: 'GET', url: `/api/exercise-sets/${variantTask.id}` }),
        () => otherApp.inject({ method: 'GET', url: `/api/exercise-sets/${expectedErrorTask.id}` }),
      ]) {
        const response = await read()
        expect(response.statusCode).toBe(404)
        expect(response.json()).toMatchObject({ code: 'NOT_FOUND', data: null })
      }
      const rejected = [
        () => otherApp.inject({ method: 'POST', url: '/api/material-uploads/handoff-material/process' }),
        () => otherApp.inject({ method: 'POST', url: '/api/material-uploads/handoff-material/confirm', payload: {} }),
        () => otherApp.inject({ method: 'POST', url: `/api/questions/${sourceQuestionId}/variant` }),
        () => otherApp.inject({ method: 'POST', url: '/api/errors/handoff-error/variant' }),
        () => otherApp.inject({
          method: 'PATCH',
          url: `/api/tasks/${variantTask.id}`,
          payload: { status: 'completed' },
        }),
        () => otherApp.inject({
          method: 'POST',
          url: '/api/sessions',
          payload: { ...session, sessionId: 'handoff-other-forged-session' },
        }),
        () => otherApp.inject({
          method: 'PATCH',
          url: '/api/notes/note-handoff-material',
          payload: { title: 'forged', changedAt: '2026-08-13T10:00:00.000Z' },
        }),
        () => otherApp.inject({
          method: 'POST',
          url: '/api/errors/handoff-error/redo',
          payload: {
            attemptedAt: '2026-08-13T10:00:00.000Z',
            answer: '2x',
            isCorrect: true,
            timeSpent: 1,
          },
        }),
        () => otherApp.inject({
          method: 'PATCH',
          url: '/api/errors/handoff-error',
          payload: { status: 'mastered' },
        }),
      ]
      for (const attempt of rejected) {
        const before = await allModelsSnapshot()
        const response = await attempt()
        expect(response.statusCode).toBe(404)
        expect(response.json()).toMatchObject({ code: 'NOT_FOUND', data: null })
        expect(await allModelsSnapshot()).toBe(before)
      }
      expect({
        material: agent.classifyMaterial.mock.calls.length,
        question: agent.generateQuestionVariant.mock.calls.length,
        error: agent.generateErrorVariant.mock.calls.length,
      }).toStrictEqual(callsBeforeIsolation)
    } finally {
      await app.close()
      await otherApp.close()
    }
  })
})
