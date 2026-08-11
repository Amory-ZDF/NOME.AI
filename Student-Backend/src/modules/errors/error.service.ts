import { ZodError } from 'zod'

import { AppError } from '../../common/errors/app-error.js'
import {
  exerciseSetSchema,
  redoAttemptSchema,
  taskSchema,
  type ErrorItem,
  type RedoAttempt,
  type VariantVerification,
  variantVerificationSchema,
} from '../../contracts/student-contracts.js'
import type { StudentPrisma } from '../../db/client.js'
import { toInputJson } from '../../db/json.js'
import { Prisma } from '../../generated/prisma/client.js'
import {
  DuplicateErrorIdError,
  assertBatchIdentities,
  errorBatchBodySchema,
  hasConsistentOccurrenceBounds,
  mergeErrorAggregates,
  OccurrenceConflictError,
  OutOfOrderOccurrenceError,
  parseStoredErrorAggregate,
  redoOccurrenceEvidenceBinding,
  storedErrorPayload,
  type StoredErrorAggregate,
} from './error-cards.js'
import {
  applyRedoAttempt,
  canMarkMastered,
  recordVariantVerification,
  RedoChronologyError,
} from './mastery.js'

interface StoredErrorRow {
  id: string
  studentId: string
  questionId: string
  status: string
  lastOccurredAt: Date
  payload: unknown
}

interface StoredExerciseSetRow {
  id: string
  studentId: string
  taskId: string | null
  kind: string
  payload: unknown
}

interface StoredTaskRow {
  id: string
  studentId: string
  type: string
  status: string
  dueAt: Date | null
  payload: unknown
}

class ErrorItemCreateRaceError extends Error {
  constructor(cause: unknown) {
    super('Concurrent error create conflict', { cause })
    this.name = 'ErrorItemCreateRaceError'
  }
}

const TRANSACTION_RETRY_DELAYS_MS = [25, 50, 100, 200] as const

function studentNotFound(): never {
  throw new AppError('Student not found', 404, 'NOT_FOUND')
}

function errorNotFound(): never {
  throw new AppError('Error not found', 404, 'NOT_FOUND')
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

function duplicateError(): never {
  throw new AppError('Error id already exists', 409, 'DUPLICATE_ID')
}

function occurrenceConflict(): never {
  throw new AppError(
    'Occurrence identity conflicts with persisted evidence',
    409,
    'OCCURRENCE_CONFLICT',
  )
}

function invalidRecurrence(message: string): never {
  throw new AppError(message, 400, 'INVALID_INPUT')
}

function invalidVerification(): never {
  throw new AppError('Verification result is invalid or out of order', 400, 'INVALID_INPUT')
}

function invalidVerificationProvenance(): never {
  throw new AppError('Verification variant provenance is invalid', 400, 'INVALID_INPUT')
}

function masteryGateNotMet(): never {
  throw new AppError(
    'Complete the independent variant before marking this mastered',
    409,
    'MASTERY_GATE_NOT_MET',
  )
}

function isErrorItemCreateUniqueViolation(cause: unknown): boolean {
  if (
    typeof cause !== 'object' ||
    cause === null ||
    !('code' in cause) ||
    cause.code !== 'P2002' ||
    !('meta' in cause) ||
    typeof cause.meta !== 'object' ||
    cause.meta === null
  ) {
    return false
  }

  const meta = cause.meta as { modelName?: unknown; target?: unknown }
  if (meta.modelName !== undefined && meta.modelName !== 'ErrorItem') return false
  if (!Array.isArray(meta.target) || !meta.target.every((field) => typeof field === 'string')) {
    return false
  }
  const target = new Set(meta.target)
  return (
    target.size === 2 &&
    target.has('studentId') &&
    (target.has('id') || target.has('questionId'))
  )
}

function isTransientTransactionContention(cause: unknown): boolean {
  if (cause instanceof AppError || cause instanceof ZodError) return false
  return cause instanceof Prisma.PrismaClientKnownRequestError &&
    (cause.code === 'P1008' || cause.code === 'P2034')
}

function waitForRetry(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function runWithTransactionRetry<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation()
    } catch (cause) {
      const retryDelay = TRANSACTION_RETRY_DELAYS_MS[attempt]
      const retryable = cause instanceof ErrorItemCreateRaceError ||
        isTransientTransactionContention(cause)
      if (!retryable || retryDelay === undefined) {
        if (cause instanceof ErrorItemCreateRaceError) occurrenceConflict()
        throw cause
      }
      await waitForRetry(retryDelay)
    }
  }
}

function parseStoredError(row: StoredErrorRow, studentId: string): StoredErrorAggregate {
  try {
    const aggregate = parseStoredErrorAggregate(row.payload)
    const { error } = aggregate
    if (
      row.studentId !== studentId ||
      error.id !== row.id ||
      error.questionId !== row.questionId ||
      error.status !== row.status ||
      Date.parse(error.lastOccurredAt) !== row.lastOccurredAt.getTime() ||
      !hasConsistentOccurrenceBounds(error) ||
      error.redoHistory.some((attempt, index) => {
        const previous = error.redoHistory[index - 1]
        return previous !== undefined &&
          Date.parse(attempt.attemptedAt) <= Date.parse(previous.attemptedAt)
      })
    ) {
      return storedDataInvalid(new Error('Stored error metadata mismatch'))
    }
    return aggregate
  } catch (cause) {
    if (cause instanceof AppError) throw cause
    return storedDataInvalid(new Error('Invalid stored error', { cause }))
  }
}

function sameNullableInstant(value: string | null, stored: Date | null): boolean {
  if (value === null || stored === null) return value === null && stored === null
  return Date.parse(value) === stored.getTime()
}

function parseStoredExerciseSet(row: StoredExerciseSetRow, studentId: string) {
  try {
    const set = exerciseSetSchema.parse(row.payload)
    if (
      row.studentId !== studentId ||
      row.kind !== 'task' ||
      set.id !== row.id ||
      set.taskId !== row.taskId
    ) {
      return storedDataInvalid(new Error('Stored exercise set metadata mismatch'))
    }
    return set
  } catch (cause) {
    if (cause instanceof AppError) throw cause
    return storedDataInvalid(new Error('Invalid stored exercise set', { cause }))
  }
}

function parseStoredTask(row: StoredTaskRow, studentId: string) {
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

async function assertVerificationProvenance(
  transaction: Prisma.TransactionClient,
  studentId: string,
  error: ErrorItem,
  verification: VariantVerification,
): Promise<void> {
  if (error.verificationVariantId === null || verification.variantId !== error.verificationVariantId) {
    invalidVerificationProvenance()
  }

  const setRow = await transaction.exerciseSet.findUnique({
    where: { studentId_id: { studentId, id: verification.variantId } },
  })
  if (setRow === null) invalidVerificationProvenance()
  const set = parseStoredExerciseSet(setRow, studentId)
  const variantQuestions = set.questions.filter(({ variantOf }) => variantOf !== undefined)
  if (
    set.sourceQuestionId !== error.questionId ||
    set.taskId === null ||
    variantQuestions.length !== 1 ||
    variantQuestions[0]?.variantOf !== error.questionId
  ) {
    invalidVerificationProvenance()
  }

  const taskRows = await transaction.task.findMany({
    where: { studentId, id: set.taskId },
    take: 2,
  })
  if (taskRows.length !== 1) invalidVerificationProvenance()
  const task = parseStoredTask(taskRows[0]!, studentId)
  if (
    task.id !== set.taskId ||
    task.exerciseSetId !== set.id ||
    task.sourceQuestionId !== error.questionId ||
    task.verificationForErrorId !== error.id
  ) {
    invalidVerificationProvenance()
  }
}

function mapDomainError(cause: unknown): never {
  if (cause instanceof DuplicateErrorIdError) duplicateError()
  if (cause instanceof OccurrenceConflictError) occurrenceConflict()
  if (cause instanceof OutOfOrderOccurrenceError) invalidRecurrence(cause.message)
  if (cause instanceof RedoChronologyError) invalidRecurrence(cause.message)
  throw cause
}

function errorWrite(aggregate: StoredErrorAggregate) {
  const { error } = aggregate
  return {
    questionId: error.questionId,
    status: error.status,
    lastOccurredAt: new Date(error.lastOccurredAt),
    payload: toInputJson(storedErrorPayload(aggregate)),
  }
}

async function readAllErrors(
  transaction: Prisma.TransactionClient,
  studentId: string,
): Promise<Array<{ row: StoredErrorRow; aggregate: StoredErrorAggregate }>> {
  const rows = await transaction.errorItem.findMany({
    where: { studentId },
    orderBy: { id: 'asc' },
  })
  return rows.map((row) => ({ row, aggregate: parseStoredError(row, studentId) }))
}

export class ErrorService {
  constructor(
    private readonly prisma: StudentPrisma,
    private readonly studentId: string,
  ) {}

  async upsertBatch(rawItems: readonly ErrorItem[]): Promise<{ errors: ErrorItem[] }> {
    const { items } = errorBatchBodySchema.parse({ items: rawItems })
    return runWithTransactionRetry(() => this.upsertBatchTransaction(items))
  }

  private async upsertBatchTransaction(items: readonly ErrorItem[]): Promise<{
    errors: ErrorItem[]
  }> {
    return this.prisma.$transaction(async (transaction) => {
      const student = await transaction.student.findUnique({
        where: { id: this.studentId },
        select: { id: true },
      })
      if (student === null) studentNotFound()

      const stored = await readAllErrors(transaction, this.studentId)
      try {
        assertBatchIdentities(stored.map(({ aggregate }) => aggregate.error), [])
      } catch (cause) {
        return storedDataInvalid(new Error('Invalid stored error identities', { cause }))
      }
      let merged: StoredErrorAggregate[]
      try {
        merged = mergeErrorAggregates(stored.map(({ aggregate }) => aggregate), items)
      } catch (cause) {
        return mapDomainError(cause)
      }

      const currentByQuestion = new Map(
        stored.map(({ aggregate }) => [aggregate.error.questionId, aggregate] as const),
      )
      const incomingQuestions = new Set(items.map(({ questionId }) => questionId))
      for (const aggregate of merged) {
        const { error } = aggregate
        if (!incomingQuestions.has(error.questionId)) continue
        const current = currentByQuestion.get(error.questionId)
        if (current === undefined) {
          try {
            await transaction.errorItem.create({
              data: {
                id: error.id,
                studentId: this.studentId,
                ...errorWrite(aggregate),
              },
            })
          } catch (cause) {
            if (isErrorItemCreateUniqueViolation(cause)) {
              throw new ErrorItemCreateRaceError(cause)
            }
            throw cause
          }
        } else {
          await transaction.errorItem.update({
            where: {
              studentId_id: {
                studentId: this.studentId,
                id: current.error.id,
              },
            },
            data: errorWrite(aggregate),
          })
        }
      }

      const result = await readAllErrors(transaction, this.studentId)
      return { errors: result.map(({ aggregate }) => aggregate.error) }
    })
  }

  async addRedo(errorId: string, rawAttempt: RedoAttempt): Promise<{ error: ErrorItem }> {
    const attempt = redoAttemptSchema.parse(rawAttempt)

    return runWithTransactionRetry(() => this.addRedoTransaction(errorId, attempt))
  }

  private async addRedoTransaction(
    errorId: string,
    attempt: RedoAttempt,
  ): Promise<{ error: ErrorItem }> {
    return this.prisma.$transaction(async (transaction) => {
      const row = await transaction.errorItem.findUnique({
        where: {
          studentId_id: {
            studentId: this.studentId,
            id: errorId,
          },
        },
      })
      if (row === null) errorNotFound()
      const current = parseStoredError(row, this.studentId)

      let error: ErrorItem
      try {
        error = applyRedoAttempt(current.error, attempt)
      } catch (cause) {
        return mapDomainError(cause)
      }

      const currentKeys = new Set(
        current.error.occurrenceRecords.map(({ key }) => key),
      )
      const addedRecords = error.occurrenceRecords.filter(({ key }) => !currentKeys.has(key))
      if (addedRecords.length !== (attempt.isCorrect ? 0 : 1)) {
        return storedDataInvalid(new Error('Redo occurrence transition is inconsistent'))
      }
      const occurrenceEvidenceBindings = [
        ...current.occurrenceEvidenceBindings,
        ...addedRecords.map((record) =>
          redoOccurrenceEvidenceBinding(error.id, attempt, record)),
      ]

      await transaction.errorItem.update({
        where: {
          studentId_id: {
            studentId: this.studentId,
            id: errorId,
          },
        },
        data: errorWrite({
          error,
          occurrenceEvidenceBindings,
        }),
      })

      const updated = await transaction.errorItem.findUniqueOrThrow({
        where: {
          studentId_id: {
            studentId: this.studentId,
            id: errorId,
          },
        },
      })
      return { error: parseStoredError(updated, this.studentId).error }
    })
  }

  async recordVerification(
    errorId: string,
    rawVerification: VariantVerification,
  ): Promise<{ error: ErrorItem }> {
    const verification = variantVerificationSchema.parse(rawVerification)
    return runWithTransactionRetry(() => this.recordVerificationTransaction(errorId, verification))
  }

  private async recordVerificationTransaction(
    errorId: string,
    verification: VariantVerification,
  ): Promise<{ error: ErrorItem }> {
    return this.prisma.$transaction(async (transaction) => {
      const row = await transaction.errorItem.findUnique({
        where: { studentId_id: { studentId: this.studentId, id: errorId } },
      })
      if (row === null) errorNotFound()
      const current = parseStoredError(row, this.studentId)
      await assertVerificationProvenance(transaction, this.studentId, current.error, verification)
      const error = recordVariantVerification(current.error, verification)
      if (error === undefined) invalidVerification()

      await transaction.errorItem.update({
        where: { studentId_id: { studentId: this.studentId, id: errorId } },
        data: errorWrite({ ...current, error }),
      })
      return { error }
    })
  }

  async markMastered(errorId: string): Promise<{ error: ErrorItem }> {
    return runWithTransactionRetry(() => this.markMasteredTransaction(errorId))
  }

  private async markMasteredTransaction(errorId: string): Promise<{ error: ErrorItem }> {
    return this.prisma.$transaction(async (transaction) => {
      const row = await transaction.errorItem.findUnique({
        where: { studentId_id: { studentId: this.studentId, id: errorId } },
      })
      if (row === null) errorNotFound()
      const current = parseStoredError(row, this.studentId)
      if (!canMarkMastered(current.error)) masteryGateNotMet()
      const error = { ...current.error, status: 'mastered' as const }

      await transaction.errorItem.update({
        where: { studentId_id: { studentId: this.studentId, id: errorId } },
        data: errorWrite({ ...current, error }),
      })
      return { error }
    })
  }
}
