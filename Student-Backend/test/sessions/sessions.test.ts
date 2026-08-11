import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../../src/app.js'
import { parseEnv } from '../../src/config/env.js'
import {
  sessionResultSchema,
  type SessionQuestion,
} from '../../src/contracts/student-contracts.js'
import { toInputJson } from '../../src/db/json.js'
import { summarizeSession } from '../../src/modules/sessions/session-summary.js'
import {
  createTestPrisma,
  resetDatabase,
  TEST_DATABASE_URL,
} from '../helpers/database.js'

const prisma = createTestPrisma()
const primaryStudentId = 'session-student-primary'
const otherStudentId = 'session-student-other'

function makeQuestion(
  id = 'question-primary',
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    order: 1,
    type: 'calculation',
    topic: 'Calculus - Extrema',
    difficulty: 3,
    content: '<p>Find the stationary point.</p>',
    acceptKeywords: ['stationary'],
    correctDisplay: "Differentiate and solve f'(x)=0.",
    errorType: 'method',
    hints: [1, 2, 3, 4, 5].map((level) => ({
      level,
      title: `Hint ${level}`,
      content: `Hint content ${level}`,
    })),
    understandingExplanation: 'A stationary point has zero first derivative.',
    scoringExplanation: 'Award one mark for differentiating and one for solving.',
    markSchemePoints: [
      { phrase: 'M1: differentiate correctly' },
      { phrase: 'A1: solve the derivative equation' },
    ],
    ...overrides,
  }
}

function makeIeltsQuestion(
  id = 'question-ielts',
  overrides: Record<string, unknown> = {},
) {
  const {
    understandingExplanation: _understandingExplanation,
    scoringExplanation: _scoringExplanation,
    markSchemePoints: _markSchemePoints,
    ...baseQuestion
  } = makeQuestion(id)
  return {
    ...baseQuestion,
    order: 2,
    type: 'reading',
    topic: 'IELTS Reading - Evidence location',
    difficulty: 2,
    content: '<p>Which statement is directly supported?</p>',
    options: ['A. It is mandatory.', 'B. It uses incentives.'],
    correctIndex: 1,
    acceptKeywords: ['B', 'incentives'],
    correctDisplay: 'B. It uses incentives.',
    errorType: 'reading',
    passageEvidence: 'Paragraph two explicitly mentions incentives.',
    errorPattern: 'Do not replace an explicit statement with an inference.',
    ...overrides,
  }
}

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-primary',
    title: 'Calculus practice',
    type: 'teacher_assigned',
    subject: 'A-Level Math',
    estimatedMinutes: 10,
    dueAt: '2026-08-12T12:00:00.000Z',
    assignedBy: 'Ms. Wang',
    priority: 'P1',
    isOverdue: false,
    status: 'pending',
    exerciseSetId: 'set-primary',
    ...overrides,
  }
}

function makeExerciseSet(overrides: Record<string, unknown> = {}) {
  return {
    id: 'set-primary',
    taskId: 'task-primary',
    title: 'Calculus practice',
    subject: 'A-Level Math',
    questions: [makeQuestion()],
    ...overrides,
  }
}

function makeResult(overrides: Record<string, unknown> = {}) {
  return {
    status: 'correct',
    attempts: [
      {
        answer: 'stationary',
        normalizedAnswer: 'stationary',
        submittedAt: '2026-08-11T10:09:00.000Z',
        isCorrect: true,
      },
    ],
    hintsUsed: 0,
    solvedAtHintLevel: 0,
    handwritingUsed: false,
    ...overrides,
  }
}

function makeSessionQuestion(
  question: Record<string, unknown> = makeQuestion(),
  resultOverrides: Record<string, unknown> = {},
) {
  return {
    ...question,
    result: makeResult(resultOverrides),
  }
}

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: 'session-primary',
    taskId: 'task-primary',
    taskTitle: 'Calculus practice',
    subject: 'A-Level Math',
    completedAt: '2026-08-11T10:10:00.000Z',
    timeSpent: 10,
    timeSpentSeconds: 600,
    questions: [makeSessionQuestion()],
    ...overrides,
  }
}

async function insertStudent(studentId = primaryStudentId) {
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

async function insertTask(
  studentId = primaryStudentId,
  task = makeTask(),
  stored: Partial<{ type: string; status: string }> = {},
) {
  await prisma.task.create({
    data: {
      id: String(task.id),
      studentId,
      type: stored.type ?? String(task.type),
      status: stored.status ?? String(task.status),
      dueAt: task.dueAt === null ? null : new Date(String(task.dueAt)),
      payload: toInputJson(task),
    },
  })
}

async function insertExerciseSet(
  studentId = primaryStudentId,
  kind = 'task',
  exerciseSet = makeExerciseSet(),
  stored: Partial<{ id: string; taskId: string | null }> = {},
) {
  await prisma.exerciseSet.create({
    data: {
      id: stored.id ?? String(exerciseSet.id),
      studentId,
      taskId:
        stored.taskId !== undefined
          ? stored.taskId
          : exerciseSet.taskId === null
            ? null
            : String(exerciseSet.taskId),
      kind,
      payload: toInputJson(exerciseSet),
    },
  })
}

async function insertTaskAndSet(studentId = primaryStudentId) {
  await insertTask(studentId)
  await insertExerciseSet(studentId)
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

async function postSession(
  session: Record<string, unknown> = makeSession(),
  studentId = primaryStudentId,
) {
  const app = createApp(studentId)
  const response = await app.inject({
    method: 'POST',
    url: '/api/sessions',
    payload: session,
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

describe('summarizeSession', () => {
  it('returns the exact zero-value aggregate for an empty question list', () => {
    expect(summarizeSession({ questions: [] })).toEqual({
      accuracy: 0,
      correctCount: 0,
      wrongCount: 0,
      unansweredCount: 0,
      hintDependency: {
        totalHints: 0,
        averageHints: 0,
        independentlySolved: 0,
      },
      errorDistribution: {},
      topicOutcomes: [],
      wrongQuestions: [],
    })
  })

  it('aggregates submitted evidence without grading and preserves explanatory fields', () => {
    const correct = makeSessionQuestion(makeQuestion('question-correct'), {
      status: 'correct',
      hintsUsed: 0,
      solvedAtHintLevel: 0,
    })
    const wrong = makeSessionQuestion(
      makeQuestion('question-wrong', { order: 2, errorType: 'calculation' }),
      {
        status: 'wrong',
        attempts: [
          {
            answer: 'x=3',
            normalizedAnswer: 'x=3',
            submittedAt: '2026-08-11T10:08:00.000Z',
            isCorrect: false,
          },
        ],
        hintsUsed: 3,
        solvedAtHintLevel: null,
      },
    )
    const unanswered = makeSessionQuestion(makeIeltsQuestion(), {
      status: 'unanswered',
      attempts: [],
      hintsUsed: 0,
      solvedAtHintLevel: null,
    })

    expect(summarizeSession({
      questions: [correct, wrong, unanswered] as SessionQuestion[],
    })).toEqual({
      accuracy: 33,
      correctCount: 1,
      wrongCount: 1,
      unansweredCount: 1,
      hintDependency: {
        totalHints: 3,
        averageHints: 1,
        independentlySolved: 1,
      },
      errorDistribution: { calculation: 1, execution: 1 },
      topicOutcomes: [
        { topic: 'Calculus - Extrema', correct: 1, wrong: 1 },
        { topic: 'IELTS Reading - Evidence location', correct: 0, wrong: 1 },
      ],
      wrongQuestions: [wrong, unanswered],
    })
  })
})

describe('session result state contract', () => {
  it.each([
    [
      'a correct result whose solve level differs from hints used',
      makeResult({ hintsUsed: 5, solvedAtHintLevel: 0 }),
    ],
    [
      'a wrong result with no unlocked hint',
      makeResult({
        status: 'wrong',
        attempts: [
          {
            answer: 'wrong',
            submittedAt: '2026-08-11T10:09:00.000Z',
            isCorrect: false,
          },
        ],
        hintsUsed: 0,
        solvedAtHintLevel: null,
      }),
    ],
  ])('rejects impossible frontend state: %s', (_case, result) => {
    expect(sessionResultSchema.safeParse(result).success).toBe(false)
  })

  it.each([
    ['first-try correct at 0/0', makeResult()],
    [
      'hint-assisted correct at 5/5 with a later wrong attempt',
      makeResult({
        attempts: [
          {
            answer: 'first wrong',
            submittedAt: '2026-08-11T10:07:00.000Z',
            isCorrect: false,
          },
          {
            answer: 'stationary',
            submittedAt: '2026-08-11T10:08:00.000Z',
            isCorrect: true,
          },
          {
            answer: 'later slip',
            submittedAt: '2026-08-11T10:09:00.000Z',
            isCorrect: false,
          },
        ],
        hintsUsed: 5,
        solvedAtHintLevel: 5,
      }),
    ],
    [
      'first wrong at hint level 1',
      makeResult({
        status: 'wrong',
        attempts: [
          {
            answer: 'wrong',
            submittedAt: '2026-08-11T10:09:00.000Z',
            isCorrect: false,
          },
        ],
        hintsUsed: 1,
        solvedAtHintLevel: null,
      }),
    ],
    [
      'wrong after all five hints',
      makeResult({
        status: 'wrong',
        attempts: [
          {
            answer: 'wrong',
            submittedAt: '2026-08-11T10:09:00.000Z',
            isCorrect: false,
          },
        ],
        hintsUsed: 5,
        solvedAtHintLevel: null,
      }),
    ],
    [
      'unanswered at 0/null',
      makeResult({
        status: 'unanswered',
        attempts: [],
        hintsUsed: 0,
        solvedAtHintLevel: null,
      }),
    ],
  ])('accepts the reachable boundary: %s', (_case, result) => {
    expect(sessionResultSchema.safeParse(result).success).toBe(true)
  })
})

describe('POST /api/sessions', () => {
  it('persists a complete task-linked session and returns its exact client id', async () => {
    await insertStudent()
    await insertTaskAndSet()
    const session = makeSession({ sessionId: 'session / exact' })

    const response = await postSession(session)

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      code: 0,
      message: 'ok',
      data: { sessionId: session.sessionId },
    })
    await expect(prisma.session.findUnique({
      where: {
        studentId_id: {
          studentId: primaryStudentId,
          id: String(session.sessionId),
        },
      },
    })).resolves.toMatchObject({
      id: session.sessionId,
      studentId: primaryStudentId,
      taskId: session.taskId,
      submittedAt: new Date(String(session.completedAt)),
      payload: session,
    })
  })

  it('persists a bank session with a null task id after proving one exact scoped set', async () => {
    await insertStudent()
    const bankSet = makeExerciseSet({
      id: 'bank-primary',
      taskId: null,
      title: 'IELTS bank practice',
      subject: 'IELTS Reading',
      questions: [makeIeltsQuestion('question-bank', { order: 1 })],
    })
    await insertExerciseSet(primaryStudentId, 'bank', bankSet)
    const session = makeSession({
      sessionId: 'session-bank',
      taskId: null,
      taskTitle: bankSet.title,
      subject: bankSet.subject,
      questions: [
        makeSessionQuestion(bankSet.questions[0] as Record<string, unknown>, {
          status: 'wrong',
          attempts: [
            {
              answer: 'A',
              normalizedAnswer: 'a',
              submittedAt: '2026-08-11T10:09:00.000Z',
              isCorrect: false,
            },
          ],
          hintsUsed: 1,
          solvedAtHintLevel: null,
        }),
      ],
    })

    const response = await postSession(session)

    expect(response.statusCode).toBe(200)
    await expect(prisma.session.findUnique({
      where: {
        studentId_id: {
          studentId: primaryStudentId,
          id: 'session-bank',
        },
      },
    })).resolves.toMatchObject({
      taskId: null,
      payload: session,
    })
  })

  it.each([
    ['an incomplete session', { sessionId: 'incomplete' }],
    [
      'an object answer',
      makeSession({
        questions: [
          makeSessionQuestion(makeQuestion(), {
            attempts: [
              {
                answer: { text: 'stationary' },
                submittedAt: '2026-08-11T10:09:00.000Z',
                isCorrect: true,
              },
            ],
          }),
        ],
      }),
    ],
    [
      'an object normalized answer',
      makeSession({
        questions: [
          makeSessionQuestion(makeQuestion(), {
            attempts: [
              {
                answer: 'stationary',
                normalizedAnswer: { value: 'stationary' },
                submittedAt: '2026-08-11T10:09:00.000Z',
                isCorrect: true,
              },
            ],
          }),
        ],
      }),
    ],
    [
      'an undeclared grading field',
      makeSession({
        questions: [
          makeSessionQuestion(makeQuestion(), {
            methodCorrect: true,
          }),
        ],
      }),
    ],
    ['an unknown top-level field', makeSession({ modelScore: 0.98 })],
    [
      'duplicate question ids',
      makeSession({
        questions: [
          makeSessionQuestion(makeQuestion('question-primary', { order: 1 })),
          makeSessionQuestion(makeQuestion('question-primary', { order: 2 })),
        ],
      }),
    ],
  ])('rejects %s without persisting anything', async (_case, session) => {
    await insertStudent()
    await insertTaskAndSet()

    const response = await postSession(session)

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      code: 'INVALID_INPUT',
      message: 'Invalid request',
      data: null,
    })
    await expect(prisma.session.count()).resolves.toBe(0)
  })

  it.each([
    [
      'an attempt after completion',
      makeResult({
        attempts: [
          {
            answer: 'stationary',
            submittedAt: '2026-08-11T10:10:00.001Z',
            isCorrect: true,
          },
        ],
      }),
    ],
    [
      'an attempt before the measured session window',
      makeResult({
        attempts: [
          {
            answer: 'stationary',
            submittedAt: '2026-08-11T09:59:59.999Z',
            isCorrect: true,
          },
        ],
      }),
    ],
    [
      'attempts out of chronological order',
      makeResult({
        status: 'wrong',
        attempts: [
          {
            answer: 'first',
            submittedAt: '2026-08-11T10:09:00.000Z',
            isCorrect: false,
          },
          {
            answer: 'second',
            submittedAt: '2026-08-11T10:08:00.000Z',
            isCorrect: false,
          },
        ],
        solvedAtHintLevel: null,
      }),
    ],
    [
      'a correct status without correct evidence',
      makeResult({
        attempts: [
          {
            answer: 'wrong',
            submittedAt: '2026-08-11T10:09:00.000Z',
            isCorrect: false,
          },
        ],
      }),
    ],
    [
      'a wrong status with correct evidence',
      makeResult({ status: 'wrong', solvedAtHintLevel: null }),
    ],
    [
      'an unanswered status with an attempt',
      makeResult({ status: 'unanswered', solvedAtHintLevel: null }),
    ],
    [
      'a wrong status with solved evidence',
      makeResult({
        status: 'wrong',
        attempts: [
          {
            answer: 'wrong',
            submittedAt: '2026-08-11T10:09:00.000Z',
            isCorrect: false,
          },
        ],
        solvedAtHintLevel: 1,
      }),
    ],
    [
      'a solve level above the hints used',
      makeResult({ hintsUsed: 1, solvedAtHintLevel: 2 }),
    ],
    [
      'a date-only attempt timestamp',
      makeResult({
        attempts: [
          {
            answer: 'stationary',
            submittedAt: '2026-08-11',
            isCorrect: true,
          },
        ],
      }),
    ],
  ])('rejects %s atomically', async (_case, result) => {
    await insertStudent()
    await insertTaskAndSet()
    const session = makeSession({
      questions: [makeSessionQuestion(makeQuestion(), result)],
    })

    const response = await postSession(session)

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ code: 'INVALID_INPUT', data: null })
    await expect(prisma.session.count()).resolves.toBe(0)
  })

  it.each([
    [
      'a correct result whose solve level differs from hints used',
      makeResult({ hintsUsed: 5, solvedAtHintLevel: 0 }),
    ],
    [
      'a wrong result with no unlocked hint',
      makeResult({
        status: 'wrong',
        attempts: [
          {
            answer: 'wrong',
            submittedAt: '2026-08-11T10:09:00.000Z',
            isCorrect: false,
          },
        ],
        hintsUsed: 0,
        solvedAtHintLevel: null,
      }),
    ],
  ])('rejects impossible frontend state atomically: %s', async (_case, result) => {
    await insertStudent()
    await insertTaskAndSet()
    const session = makeSession({
      sessionId: `impossible-${String(result.status)}-${String(result.hintsUsed)}`,
      questions: [makeSessionQuestion(makeQuestion(), result)],
    })

    const response = await postSession(session)

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      code: 'INVALID_INPUT',
      message: 'Invalid request',
      data: null,
    })
    await expect(prisma.session.count()).resolves.toBe(0)
  })

  it('rejects a duration whose derived start instant is not finite', async () => {
    await insertStudent()
    await insertTaskAndSet()
    const timeSpentSeconds = 1e308
    const session = makeSession({
      timeSpentSeconds,
      timeSpent: Math.round(timeSpentSeconds / 60),
    })

    const response = await postSession(session)

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ code: 'INVALID_INPUT', data: null })
    await expect(prisma.session.count()).resolves.toBe(0)
  })

  it('accepts equal attempt instants and a later wrong attempt after a correct one', async () => {
    await insertStudent()
    await insertTaskAndSet()
    const timestamp = '2026-08-11T10:09:00.000Z'
    const session = makeSession({
      questions: [
        makeSessionQuestion(makeQuestion(), {
          status: 'correct',
          attempts: [
            { answer: 'stationary', submittedAt: timestamp, isCorrect: true },
            { answer: 'later slip', submittedAt: timestamp, isCorrect: false },
          ],
          hintsUsed: 0,
          solvedAtHintLevel: 0,
        }),
      ],
    })

    const response = await postSession(session)

    expect(response.statusCode).toBe(200)
    await expect(prisma.session.count()).resolves.toBe(1)
  })

  it('rejects question content that is not the exact scoped exercise evidence', async () => {
    await insertStudent()
    await insertTaskAndSet()
    const session = makeSession({
      questions: [
        makeSessionQuestion(makeQuestion('question-primary', {
          content: '<p>Injected replacement question.</p>',
        })),
      ],
    })

    const response = await postSession(session)

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ code: 'INVALID_INPUT', data: null })
    await expect(prisma.session.count()).resolves.toBe(0)
  })

  it.each([
    ['a mismatched task title', { taskTitle: 'Another task' }],
    ['a mismatched subject', { subject: 'IELTS Reading' }],
  ])('rejects %s without mutation', async (_case, overrides) => {
    await insertStudent()
    await insertTaskAndSet()

    const response = await postSession(makeSession(overrides))

    expect(response.statusCode).toBe(400)
    await expect(prisma.session.count()).resolves.toBe(0)
  })

  it('does not accept a task or exercise provenance owned only by another student', async () => {
    await insertStudent(primaryStudentId)
    await insertStudent(otherStudentId)
    await insertTaskAndSet(otherStudentId)
    const before = await durableSnapshot()

    const response = await postSession()

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({
      code: 'NOT_FOUND',
      message: 'Session provenance not found',
      data: null,
    })
    expect(await durableSnapshot()).toEqual(before)
  })

  it('does not accept a bank provenance owned only by another student', async () => {
    await insertStudent(primaryStudentId)
    await insertStudent(otherStudentId)
    const bankSet = makeExerciseSet({
      id: 'bank-other',
      taskId: null,
      title: 'Bank practice',
      questions: [makeQuestion('question-bank')],
    })
    await insertExerciseSet(otherStudentId, 'bank', bankSet)
    const session = makeSession({
      sessionId: 'session-bank-cross-tenant',
      taskId: null,
      taskTitle: bankSet.title,
      questions: [makeSessionQuestion(bankSet.questions[0] as Record<string, unknown>)],
    })

    const response = await postSession(session)

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ code: 'NOT_FOUND', data: null })
    await expect(prisma.session.count()).resolves.toBe(0)
  })

  it('fails closed when a task points at more than one task-kind exercise set', async () => {
    await insertStudent()
    await insertTask()
    await insertExerciseSet()
    await insertExerciseSet(
      primaryStudentId,
      'task',
      makeExerciseSet({ id: 'set-duplicate' }),
    )

    const response = await postSession()

    expect(response.statusCode).toBe(500)
    expect(response.json()).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      data: null,
    })
    await expect(prisma.session.count()).resolves.toBe(0)
  })

  it('fails closed when task provenance is stored under the bank kind', async () => {
    await insertStudent()
    await insertTask()
    await insertExerciseSet(primaryStudentId, 'bank')

    const response = await postSession()

    expect(response.statusCode).toBe(500)
    expect(response.json()).toMatchObject({ code: 'INTERNAL_ERROR', data: null })
    await expect(prisma.session.count()).resolves.toBe(0)
  })

  it('fails closed when two bank sets are indistinguishable session sources', async () => {
    await insertStudent()
    const question = makeQuestion('question-bank')
    const first = makeExerciseSet({
      id: 'bank-first',
      taskId: null,
      title: 'Bank practice',
      questions: [question],
    })
    const second = makeExerciseSet({
      ...first,
      id: 'bank-second',
    })
    await insertExerciseSet(primaryStudentId, 'bank', first)
    await insertExerciseSet(primaryStudentId, 'bank', second)
    const session = makeSession({
      sessionId: 'session-bank-ambiguous',
      taskId: null,
      taskTitle: first.title,
      questions: [makeSessionQuestion(question)],
    })

    const response = await postSession(session)

    expect(response.statusCode).toBe(500)
    expect(response.json()).toMatchObject({ code: 'INTERNAL_ERROR', data: null })
    await expect(prisma.session.count()).resolves.toBe(0)
  })

  it('returns 404 when the configured student does not exist', async () => {
    const response = await postSession()

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({
      code: 'NOT_FOUND',
      message: 'Student not found',
      data: null,
    })
    await expect(prisma.session.count()).resolves.toBe(0)
  })

  it('rejects a duplicate id without replacing the first session', async () => {
    await insertStudent()
    await insertTaskAndSet()
    const first = makeSession()
    const second = makeSession({ subject: 'Different subject' })
    const firstResponse = await postSession(first)
    const before = await prisma.session.findMany()

    const duplicate = await postSession(second)

    expect(firstResponse.statusCode).toBe(200)
    expect(duplicate.statusCode).toBe(409)
    expect(duplicate.json()).toEqual({
      code: 'DUPLICATE_ID',
      message: 'Session id already exists',
      data: null,
    })
    await expect(prisma.session.findMany()).resolves.toEqual(before)
  })

  it('allows the same client id in two isolated student scopes', async () => {
    await insertStudent(primaryStudentId)
    await insertStudent(otherStudentId)
    await insertTaskAndSet(primaryStudentId)
    await insertTaskAndSet(otherStudentId)

    const other = await postSession(makeSession(), otherStudentId)
    const primary = await postSession(makeSession(), primaryStudentId)

    expect(other.statusCode).toBe(200)
    expect(primary.statusCode).toBe(200)
    await expect(prisma.session.count({
      where: { id: 'session-primary' },
    })).resolves.toBe(2)
  })

  it('serializes concurrent duplicate submissions to one success and one conflict', async () => {
    await insertStudent()
    await insertTaskAndSet()
    const app = createApp()
    const session = makeSession()

    const responses = await Promise.all([
      app.inject({ method: 'POST', url: '/api/sessions', payload: session }),
      app.inject({ method: 'POST', url: '/api/sessions', payload: session }),
    ])
    await app.close()

    expect(responses.map(({ statusCode }) => statusCode).sort()).toEqual([200, 409])
    expect(responses.map((response) => response.json().code).sort()).toEqual([
      0,
      'DUPLICATE_ID',
    ])
    await expect(prisma.session.count()).resolves.toBe(1)
  })
})

describe('GET /api/summary/{sessionId}', () => {
  it('returns the exact aggregate from the stored session and changes no durable model', async () => {
    await insertStudent()
    const questions = [
      makeQuestion('question-correct', { order: 1 }),
      makeQuestion('question-wrong', { order: 2, errorType: 'calculation' }),
      makeIeltsQuestion('question-unanswered', { order: 3 }),
    ]
    const task = makeTask({ exerciseSetId: 'set-mixed' })
    const exerciseSet = makeExerciseSet({
      id: 'set-mixed',
      questions,
    })
    await insertTask(primaryStudentId, task)
    await insertExerciseSet(primaryStudentId, 'task', exerciseSet)
    const correct = makeSessionQuestion(questions[0] as Record<string, unknown>)
    const wrong = makeSessionQuestion(
      questions[1] as Record<string, unknown>,
      {
        status: 'wrong',
        attempts: [
          {
            answer: 'x=3',
            normalizedAnswer: 'x=3',
            submittedAt: '2026-08-11T10:08:00.000Z',
            isCorrect: false,
          },
        ],
        hintsUsed: 3,
        solvedAtHintLevel: null,
      },
    )
    const unanswered = makeSessionQuestion(
      questions[2] as Record<string, unknown>,
      {
        status: 'unanswered',
        attempts: [],
        hintsUsed: 0,
        solvedAtHintLevel: null,
      },
    )
    const session = makeSession({
      sessionId: 'summary / exact',
      questions: [correct, wrong, unanswered],
    })
    const submitted = await postSession(session)
    expect(submitted.statusCode).toBe(200)
    const before = await durableSnapshot()
    const app = createApp()

    const response = await app.inject({
      method: 'GET',
      url: `/api/summary/${encodeURIComponent(String(session.sessionId))}`,
    })
    await app.close()

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      code: 0,
      message: 'ok',
      data: {
        accuracy: 33,
        correctCount: 1,
        wrongCount: 1,
        unansweredCount: 1,
        hintDependency: {
          totalHints: 3,
          averageHints: 1,
          independentlySolved: 1,
        },
        errorDistribution: { calculation: 1, execution: 1 },
        topicOutcomes: [
          { topic: 'Calculus - Extrema', correct: 1, wrong: 1 },
          { topic: 'IELTS Reading - Evidence location', correct: 0, wrong: 1 },
        ],
        wrongQuestions: [wrong, unanswered],
      },
    })
    expect(response.json().data.wrongQuestions[0]).toHaveProperty('markSchemePoints')
    expect(response.json().data.wrongQuestions[1]).toMatchObject({
      passageEvidence: 'Paragraph two explicitly mentions incentives.',
      errorPattern: 'Do not replace an explicit statement with an inference.',
    })
    expect(await durableSnapshot()).toEqual(before)
  })

  it('returns 404 for a missing or other-student session without mutation', async () => {
    await insertStudent(primaryStudentId)
    await insertStudent(otherStudentId)
    await insertTaskAndSet(otherStudentId)
    const submitted = await postSession(makeSession(), otherStudentId)
    expect(submitted.statusCode).toBe(200)
    const before = await durableSnapshot()
    const app = createApp(primaryStudentId)

    const other = await app.inject({
      method: 'GET',
      url: '/api/summary/session-primary',
    })
    const missing = await app.inject({
      method: 'GET',
      url: '/api/summary/session-missing',
    })
    await app.close()

    for (const response of [other, missing]) {
      expect(response.statusCode).toBe(404)
      expect(response.json()).toEqual({
        code: 'NOT_FOUND',
        message: 'Session not found',
        data: null,
      })
    }
    expect(await durableSnapshot()).toEqual(before)
  })

  it.each([
    [
      'payload identity',
      async () => prisma.session.update({
        where: {
          studentId_id: {
            studentId: primaryStudentId,
            id: 'session-primary',
          },
        },
        data: { payload: toInputJson({ ...makeSession(), sessionId: 'secret-wrong-id' }) },
      }),
    ],
    [
      'submittedAt scalar',
      async () => prisma.session.update({
        where: {
          studentId_id: {
            studentId: primaryStudentId,
            id: 'session-primary',
          },
        },
        data: { submittedAt: new Date('2026-08-11T11:00:00.000Z') },
      }),
    ],
    [
      'task scalar',
      async () => {
        await insertTask(
          primaryStudentId,
          makeTask({ id: 'task-secondary', exerciseSetId: 'set-secondary' }),
        )
        return prisma.session.update({
          where: {
            studentId_id: {
              studentId: primaryStudentId,
              id: 'session-primary',
            },
          },
          data: { taskId: 'task-secondary' },
        })
      },
    ],
    [
      'invalid nested JSON',
      async () => prisma.session.update({
        where: {
          studentId_id: {
            studentId: primaryStudentId,
            id: 'session-primary',
          },
        },
        data: { payload: toInputJson({ sessionId: 'secret-corrupt-session' }) },
      }),
    ],
  ])('maps corrupted stored %s to one generic safe 500', async (_case, corrupt) => {
    await insertStudent()
    await insertTaskAndSet()
    const submitted = await postSession()
    expect(submitted.statusCode).toBe(200)
    await corrupt()
    const before = await durableSnapshot()
    const app = createApp()

    const response = await app.inject({
      method: 'GET',
      url: '/api/summary/session-primary',
    })
    await app.close()

    expect(response.statusCode).toBe(500)
    expect(response.json()).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      data: null,
    })
    expect(response.body).not.toContain('secret')
    expect(response.body).not.toContain('Zod')
    expect(response.body).not.toContain('session-primary')
    expect(await durableSnapshot()).toEqual(before)
  })
})

describe('session API transport contract', () => {
  it('maps unsupported media and oversized bodies to stable envelopes', async () => {
    const app = createApp()

    const unsupported = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: { 'content-type': 'application/xml' },
      payload: '<session />',
    })
    const oversized = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({
        sessionId: 'oversized',
        taskTitle: 'x'.repeat(1_048_576),
      }),
    })
    await app.close()

    expect(unsupported.statusCode).toBe(415)
    expect(unsupported.json()).toEqual({
      code: 'UNSUPPORTED_MEDIA_TYPE',
      message: 'Unsupported media type',
      data: null,
    })
    expect(oversized.statusCode).toBe(413)
    expect(oversized.json()).toEqual({
      code: 'PAYLOAD_TOO_LARGE',
      message: 'Payload too large',
      data: null,
    })
    await expect(prisma.session.count()).resolves.toBe(0)
  })

  it('publishes the actual success and failure statuses for both routes', async () => {
    const app = createApp()

    const response = await app.inject({ method: 'GET', url: '/documentation/json' })
    await app.close()

    expect(response.statusCode).toBe(200)
    const paths = response.json().paths
    expect(Object.keys(paths['/api/sessions'].post.responses).sort()).toEqual([
      '200',
      '400',
      '404',
      '409',
      '413',
      '415',
      '500',
    ])
    expect(Object.keys(paths['/api/summary/{sessionId}'].get.responses).sort()).toEqual([
      '200',
      '400',
      '404',
      '500',
    ])
  })
})
