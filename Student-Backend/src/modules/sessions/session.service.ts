import { isDeepStrictEqual } from 'node:util'

import { AppError } from '../../common/errors/app-error.js'
import {
  exerciseSetSchema,
  sessionSchema,
  taskSchema,
  type ExerciseSet,
  type Question,
  type Session,
  type SessionQuestion,
  type Task,
} from '../../contracts/student-contracts.js'
import type { StudentPrisma } from '../../db/client.js'
import { toInputJson } from '../../db/json.js'
import type { Prisma } from '../../generated/prisma/client.js'
import { summarizeSession, type SessionSummary } from './session-summary.js'

interface StoredTaskRow {
  id: string
  studentId: string
  type: string
  status: string
  dueAt: Date | null
  payload: unknown
}

interface StoredExerciseSetRow {
  id: string
  studentId: string
  taskId: string | null
  kind: string
  payload: unknown
}

interface StoredSessionRow {
  id: string
  studentId: string
  taskId: string | null
  submittedAt: Date
  payload: unknown
}

function duplicateSession(): never {
  throw new AppError('Session id already exists', 409, 'DUPLICATE_ID')
}

function sessionNotFound(): never {
  throw new AppError('Session not found', 404, 'NOT_FOUND')
}

function studentNotFound(): never {
  throw new AppError('Student not found', 404, 'NOT_FOUND')
}

function provenanceNotFound(): never {
  throw new AppError('Session provenance not found', 404, 'NOT_FOUND')
}

function invalidSessionProvenance(): never {
  throw new AppError(
    'Session does not match its exercise provenance',
    400,
    'INVALID_INPUT',
  )
}

function storedDataInvalid(cause: unknown): never {
  throw new AppError(
    'Internal server error',
    500,
    'INTERNAL_ERROR',
    null,
    { cause },
  )
}

function sameNullableInstant(value: string | null, stored: Date | null): boolean {
  if (value === null || stored === null) return value === null && stored === null
  return Date.parse(value) === stored.getTime()
}

function parseStoredTask(row: StoredTaskRow, studentId: string): Task {
  try {
    const task = taskSchema.parse(row.payload)
    if (
      row.studentId !== studentId ||
      task.id !== row.id ||
      task.type !== row.type ||
      task.status !== row.status ||
      !sameNullableInstant(task.dueAt, row.dueAt)
    ) {
      return storedDataInvalid(new Error('Stored task metadata mismatch'))
    }
    return task
  } catch (cause) {
    if (cause instanceof AppError) throw cause
    return storedDataInvalid(new Error('Invalid stored task', { cause }))
  }
}

type StoredExerciseSetParseResult =
  | { success: true; exerciseSet: ExerciseSet }
  | { success: false }

function tryParseStoredExerciseSet(
  row: StoredExerciseSetRow,
  studentId: string,
): StoredExerciseSetParseResult {
  const parsed = exerciseSetSchema.safeParse(row.payload)
  if (!parsed.success) return { success: false }

  const exerciseSet = parsed.data
  if (
    row.studentId !== studentId ||
    (exerciseSet.id !== undefined && exerciseSet.id !== row.id) ||
    exerciseSet.taskId !== row.taskId
  ) {
    return { success: false }
  }

  return { success: true, exerciseSet }
}

function parseStoredExerciseSet(
  row: StoredExerciseSetRow,
  studentId: string,
): ExerciseSet {
  const parsed = tryParseStoredExerciseSet(row, studentId)
  if (!parsed.success) {
    return storedDataInvalid(new Error('Invalid stored exercise set'))
  }
  return parsed.exerciseSet
}

function parseStoredSession(row: StoredSessionRow, studentId: string): Session {
  try {
    const session = sessionSchema.parse(row.payload)
    if (
      row.studentId !== studentId ||
      session.sessionId !== row.id ||
      session.taskId !== row.taskId ||
      Date.parse(session.completedAt) !== row.submittedAt.getTime()
    ) {
      return storedDataInvalid(new Error('Stored session metadata mismatch'))
    }
    return session
  } catch (cause) {
    if (cause instanceof AppError) throw cause
    return storedDataInvalid(new Error('Invalid stored session', { cause }))
  }
}

function submittedQuestionEvidence(question: SessionQuestion): Question {
  const { result: _result, ...evidence } = question
  return evidence
}

function matchesExerciseSet(session: Session, exerciseSet: ExerciseSet): boolean {
  if (
    session.taskTitle !== exerciseSet.title ||
    session.subject !== exerciseSet.subject ||
    session.questions.length !== exerciseSet.questions.length
  ) {
    return false
  }

  return session.questions.every((question, index) =>
    isDeepStrictEqual(
      submittedQuestionEvidence(question),
      exerciseSet.questions[index],
    ),
  )
}

function isPrismaUniqueViolation(cause: unknown): boolean {
  return (
    typeof cause === 'object' &&
    cause !== null &&
    'code' in cause &&
    cause.code === 'P2002'
  )
}

export class SessionService {
  constructor(
    private readonly prisma: StudentPrisma,
    private readonly studentId: string,
  ) {}

  private async assertTaskProvenance(
    transaction: Prisma.TransactionClient,
    session: Session & { taskId: string },
  ): Promise<void> {
    const taskRow = await transaction.task.findUnique({
      where: {
        studentId_id: {
          studentId: this.studentId,
          id: session.taskId,
        },
      },
    })
    if (taskRow === null) provenanceNotFound()
    const task = parseStoredTask(taskRow, this.studentId)

    const exerciseRows = await transaction.exerciseSet.findMany({
      where: {
        studentId: this.studentId,
        taskId: session.taskId,
      },
      orderBy: { id: 'asc' },
      take: 3,
    })
    if (exerciseRows.length === 0) provenanceNotFound()
    if (exerciseRows.length !== 1 || exerciseRows[0]?.kind !== 'task') {
      return storedDataInvalid(new Error('Ambiguous or invalid task exercise provenance'))
    }

    const row = exerciseRows[0]
    const exerciseSet = parseStoredExerciseSet(row, this.studentId)
    if (
      task.subject !== exerciseSet.subject ||
      (task.exerciseSetId !== undefined && task.exerciseSetId !== row.id)
    ) {
      return storedDataInvalid(new Error('Task and exercise set provenance mismatch'))
    }
    if (!matchesExerciseSet(session, exerciseSet)) invalidSessionProvenance()
  }

  private async assertBankProvenance(
    transaction: Prisma.TransactionClient,
    session: Session & { taskId: null },
  ): Promise<void> {
    const rows = await transaction.exerciseSet.findMany({
      where: {
        studentId: this.studentId,
        taskId: null,
        kind: 'bank',
      },
      orderBy: { id: 'asc' },
    })

    let hasCorruptCandidate = false
    const matches: ExerciseSet[] = []
    for (const row of rows) {
      const parsed = tryParseStoredExerciseSet(row, this.studentId)
      if (!parsed.success) {
        hasCorruptCandidate = true
        continue
      }

      if (matchesExerciseSet(session, parsed.exerciseSet)) {
        matches.push(parsed.exerciseSet)
      }
    }

    if (matches.length === 1) return
    if (matches.length > 1) {
      return storedDataInvalid(new Error('Ambiguous bank exercise provenance'))
    }
    if (hasCorruptCandidate) {
      return storedDataInvalid(new Error('Invalid bank exercise provenance'))
    }
    provenanceNotFound()
  }

  async create(rawSession: Session): Promise<{ sessionId: string }> {
    const session = sessionSchema.parse(rawSession)

    try {
      await this.prisma.$transaction(async (transaction) => {
        const student = await transaction.student.findUnique({
          where: { id: this.studentId },
          select: { id: true },
        })
        if (student === null) studentNotFound()

        const existing = await transaction.session.findUnique({
          where: {
            studentId_id: {
              studentId: this.studentId,
              id: session.sessionId,
            },
          },
          select: { id: true },
        })
        if (existing !== null) duplicateSession()

        if (session.taskId === null) {
          await this.assertBankProvenance(transaction, session as Session & { taskId: null })
        } else {
          await this.assertTaskProvenance(
            transaction,
            session as Session & { taskId: string },
          )
        }

        await transaction.session.create({
          data: {
            id: session.sessionId,
            studentId: this.studentId,
            taskId: session.taskId,
            submittedAt: new Date(session.completedAt),
            payload: toInputJson(session),
          },
        })
      })
    } catch (cause) {
      if (isPrismaUniqueViolation(cause)) duplicateSession()
      throw cause
    }

    return { sessionId: session.sessionId }
  }

  async getSummary(sessionId: string): Promise<SessionSummary> {
    const row = await this.prisma.session.findUnique({
      where: {
        studentId_id: {
          studentId: this.studentId,
          id: sessionId,
        },
      },
    })
    if (row === null) sessionNotFound()
    return summarizeSession(parseStoredSession(row, this.studentId))
  }
}
