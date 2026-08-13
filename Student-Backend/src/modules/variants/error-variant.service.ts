import { ZodError } from 'zod'

import { AppError } from '../../common/errors/app-error.js'
import {
  errorItemSchema,
  exerciseSetSchema,
  generatedQuestionSchema,
  questionSchema,
  taskSchema,
  type ErrorItem,
  type ExerciseSet,
  type RedoAttempt,
  type Task,
} from '../../contracts/student-contracts.js'
import type { StudentPrisma } from '../../db/client.js'
import { toInputJson } from '../../db/json.js'
import { Prisma } from '../../generated/prisma/client.js'
import type { StudentAgentClient } from '../../integrations/student-agent/student-agent.client.js'
import { errorVariantRequestSchema } from '../../integrations/student-agent/student-agent.contracts.js'
import {
  AgentDomainError,
  AgentOutputInvalidError,
  AgentUnavailableError,
} from '../../integrations/student-agent/student-agent.errors.js'
import type { StoredErrorAggregate } from '../errors/error-cards.js'
import {
  parseStoredErrorRow,
  storedErrorWrite,
} from '../errors/error.service.js'
import { containsRawCarrier } from '../materials/material-rules.js'
import {
  errorVariantIds,
  errorVariantOperationKey,
} from './variant-ids.js'
import {
  resolveVariantSource,
  sameVariantSource,
  type VariantSourceSnapshot,
} from './question-variant.service.js'

interface SchedulingSnapshot {
  aggregate: StoredErrorAggregate
  latestCorrectRedo: RedoAttempt
  source: VariantSourceSnapshot
  operationKey: string
}

interface ErrorVariantResult {
  exerciseSet: ExerciseSet
  task: Task
  error: ErrorItem
}

type Clock = () => Date

const activeErrorVariants = new Map<string, Promise<ErrorVariantResult>>()
const TRANSACTION_RETRY_DELAYS_MS = [25, 50, 100, 200] as const

function errorNotFound(): never {
  throw new AppError('Error not found', 404, 'NOT_FOUND')
}

function invalidLifecycle(): never {
  throw new AppError(
    'Complete a correct redo before scheduling an independent variant',
    400,
    'INVALID_INPUT',
  )
}

function conflict(): never {
  throw new AppError('Error variant conflicts with stored data', 409, 'VARIANT_CONFLICT')
}

function readClock(clock: Clock): string {
  try {
    const value = clock()
    const milliseconds = Reflect.apply(Date.prototype.getTime, value, []) as number
    if (!Number.isFinite(milliseconds)) throw new TypeError('Invalid clock')
    return new Date(milliseconds).toISOString()
  } catch (cause) {
    throw new AppError('Internal server error', 500, 'INTERNAL_ERROR', null, { cause })
  }
}

function isTransientTransactionContention(cause: unknown): boolean {
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
      if (!isTransientTransactionContention(cause) || retryDelay === undefined) throw cause
      await waitForRetry(retryDelay)
    }
  }
}

function latestCorrectRedo(error: ErrorItem): RedoAttempt | undefined {
  const latest = error.redoHistory.at(-1)
  return latest?.isCorrect === true ? latest : undefined
}

async function loadSchedulingSnapshot(
  prisma: StudentPrisma,
  studentId: string,
  errorId: string,
  rejectInvalidGate: () => never = invalidLifecycle,
): Promise<SchedulingSnapshot> {
  const row = await prisma.errorItem.findUnique({
    where: { studentId_id: { studentId, id: errorId } },
  })
  if (row === null) errorNotFound()
  const aggregate = parseStoredErrorRow(row, studentId)
  const latestRedo = latestCorrectRedo(aggregate.error)
  if (
    aggregate.error.status !== 'verification_due' ||
    latestRedo === undefined ||
    aggregate.error.hasIncompleteOccurrenceHistory === true
  ) {
    rejectInvalidGate()
  }
  const operationKey = errorVariantOperationKey(studentId, errorId, latestRedo.attemptedAt)
  const ids = errorVariantIds(studentId, errorId, latestRedo.attemptedAt)
  if (
    aggregate.error.verificationVariantId !== null &&
    aggregate.error.verificationVariantId !== ids.setId
  ) {
    conflict()
  }
  const source = await resolveVariantSource(prisma, studentId, aggregate.error.questionId)
  return { aggregate, latestCorrectRedo: latestRedo, source, operationKey }
}

function sameSchedulingSnapshot(left: SchedulingSnapshot, right: SchedulingSnapshot): boolean {
  return left.operationKey === right.operationKey &&
    JSON.stringify(left.aggregate) === JSON.stringify(right.aggregate) &&
    sameVariantSource(left.source, right.source)
}

function parseExistingResult(
  taskRow: { id: string; type: string; status: string; dueAt: Date | null; payload: unknown },
  setRow: { id: string; taskId: string | null; kind: string; payload: unknown },
  snapshot: SchedulingSnapshot,
  studentId: string,
): ErrorVariantResult {
  const { error } = snapshot.aggregate
  const ids = errorVariantIds(studentId, error.id, snapshot.latestCorrectRedo.attemptedAt)
  try {
    const task = taskSchema.parse(taskRow.payload)
    const exerciseSet = exerciseSetSchema.parse(setRow.payload)
    const question = exerciseSet.questions[0]
    const title = `Independent verification: ${snapshot.source.question.topic}`
    if (
      error.verificationVariantId !== ids.setId ||
      error.variantVerifiedAt !== null || error.variantVerification !== null ||
      taskRow.id !== ids.taskId || taskRow.type !== task.type || taskRow.status !== task.status || taskRow.dueAt !== null ||
      setRow.id !== ids.setId || setRow.taskId !== ids.taskId || setRow.kind !== 'task' ||
      task.id !== ids.taskId || task.title !== title || task.type !== 'error_review' || task.subject !== snapshot.source.set.subject ||
      task.estimatedMinutes !== 15 || task.dueAt !== null || task.assignedBy !== null || task.priority !== 'P1' ||
      task.isOverdue || task.status !== 'pending' || task.exerciseSetId !== ids.setId ||
      task.sourceQuestionId !== error.questionId || task.verificationForErrorId !== error.id ||
      task.reason !== 'Independent verification after correct redo' || task.createdAt === undefined ||
      exerciseSet.id !== ids.setId || exerciseSet.taskId !== ids.taskId || exerciseSet.title !== title ||
      exerciseSet.subject !== snapshot.source.set.subject || exerciseSet.sourceQuestionId !== error.questionId ||
      exerciseSet.createdAt !== task.createdAt || exerciseSet.questions.length !== 1 ||
      question?.id !== ids.questionId || question.order !== 1 || question.variantOf !== error.questionId ||
      question.sourceQuestionId !== error.questionId
    ) {
      conflict()
    }
    return { exerciseSet, task, error }
  } catch (cause) {
    if (cause instanceof AppError) throw cause
    return conflict()
  }
}

async function readExisting(
  prisma: StudentPrisma,
  studentId: string,
  snapshot: SchedulingSnapshot,
): Promise<ErrorVariantResult | null> {
  const { error } = snapshot.aggregate
  const ids = errorVariantIds(studentId, error.id, snapshot.latestCorrectRedo.attemptedAt)
  const [taskRow, setRow] = await Promise.all([
    prisma.task.findUnique({ where: { studentId_id: { studentId, id: ids.taskId } } }),
    prisma.exerciseSet.findUnique({ where: { studentId_id: { studentId, id: ids.setId } } }),
  ])
  if (error.verificationVariantId === null && taskRow === null && setRow === null) return null
  if (
    error.verificationVariantId !== ids.setId ||
    taskRow === null ||
    setRow === null
  ) {
    conflict()
  }
  return parseExistingResult(taskRow, setRow, snapshot, studentId)
}

export class ErrorVariantService {
  constructor(
    private readonly prisma: StudentPrisma,
    private readonly studentId: string,
    private readonly now: Clock,
    private readonly agent: StudentAgentClient,
    private readonly processScope: string,
  ) {}

  async create(errorId: string): Promise<ErrorVariantResult> {
    const snapshot = await loadSchedulingSnapshot(this.prisma, this.studentId, errorId)
    const key = `${this.processScope}\0${this.studentId}\0${errorId}\0${snapshot.operationKey}`
    const active = activeErrorVariants.get(key)
    if (active !== undefined) return active
    const operation = this.createOnce(snapshot)
    activeErrorVariants.set(key, operation)
    try {
      return await operation
    } finally {
      if (activeErrorVariants.get(key) === operation) activeErrorVariants.delete(key)
    }
  }

  private async createOnce(snapshot: SchedulingSnapshot): Promise<ErrorVariantResult> {
    const existing = await readExisting(this.prisma, this.studentId, snapshot)
    if (existing !== null) return existing
    const { error } = snapshot.aggregate
    const request = errorVariantRequestSchema.parse({
      contractVersion: 1,
      operationKey: snapshot.operationKey,
      studentId: this.studentId,
      source: {
        setId: snapshot.source.setId,
        kind: snapshot.source.kind,
        subject: snapshot.source.set.subject,
        question: snapshot.source.question,
      },
      error: {
        id: error.id,
        errorType: error.errorType,
        questionSummary: error.questionSummary,
        whereWrong: error.whereWrong,
        whyWrong: error.whyWrong,
        studentAnswer: error.studentAnswer,
        correctAnswer: error.correctAnswer,
        latestCorrectRedo: snapshot.latestCorrectRedo,
      },
    })

    let generated
    try {
      generated = generatedQuestionSchema.parse(await this.agent.generateErrorVariant(request))
      if (containsRawCarrier(generated)) throw new AgentOutputInvalidError()
    } catch (cause) {
      if (cause instanceof AgentDomainError && cause.safeCode === 'GENERATION_REJECTED') {
        throw new AppError(cause.safeMessage, 400, cause.safeCode)
      }
      if (cause instanceof AgentUnavailableError) {
        throw new AppError('Student Agent is unavailable', 503, 'AGENT_UNAVAILABLE')
      }
      if (cause instanceof AgentOutputInvalidError || cause instanceof ZodError) {
        throw new AppError('Student Agent returned invalid output', 502, 'AGENT_OUTPUT_INVALID')
      }
      throw cause
    }

    const ids = errorVariantIds(this.studentId, error.id, snapshot.latestCorrectRedo.attemptedAt)
    const createdAt = readClock(this.now)
    const title = `Independent verification: ${snapshot.source.question.topic}`
    const exerciseSet = exerciseSetSchema.parse({
      id: ids.setId,
      taskId: ids.taskId,
      title,
      subject: snapshot.source.set.subject,
      questions: [questionSchema.parse({
        ...generated,
        id: ids.questionId,
        order: 1,
        variantOf: error.questionId,
        sourceQuestionId: error.questionId,
      })],
      sourceQuestionId: error.questionId,
      createdAt,
    })
    const task = taskSchema.parse({
      id: ids.taskId,
      title,
      type: 'error_review',
      subject: snapshot.source.set.subject,
      estimatedMinutes: 15,
      dueAt: null,
      assignedBy: null,
      priority: 'P1',
      isOverdue: false,
      status: 'pending',
      exerciseSetId: ids.setId,
      sourceQuestionId: error.questionId,
      verificationForErrorId: error.id,
      reason: 'Independent verification after correct redo',
      createdAt,
    })

    return runWithTransactionRetry(() => this.prisma.$transaction(async (transaction) => {
      const current = await loadSchedulingSnapshot(
        transaction as StudentPrisma,
        this.studentId,
        error.id,
        conflict,
      )
      if (
        current.operationKey !== snapshot.operationKey ||
        !sameVariantSource(snapshot.source, current.source)
      ) {
        conflict()
      }
      const currentExisting = await readExisting(transaction as StudentPrisma, this.studentId, current)
      if (currentExisting !== null) {
        const expectedLinkedError = errorItemSchema.parse({
          ...snapshot.aggregate.error,
          verificationVariantId: ids.setId,
          variantVerifiedAt: null,
          variantVerification: null,
        })
        if (
          JSON.stringify(current.aggregate.error) !== JSON.stringify(expectedLinkedError) ||
          JSON.stringify(current.aggregate.occurrenceEvidenceBindings) !==
            JSON.stringify(snapshot.aggregate.occurrenceEvidenceBindings)
        ) {
          conflict()
        }
        return currentExisting
      }
      if (!sameSchedulingSnapshot(snapshot, current)) conflict()

      const linkedError = errorItemSchema.parse({
        ...current.aggregate.error,
        verificationVariantId: ids.setId,
        variantVerifiedAt: null,
        variantVerification: null,
      })
      await transaction.task.create({ data: {
        id: task.id,
        studentId: this.studentId,
        type: task.type,
        status: task.status,
        dueAt: null,
        payload: toInputJson(task),
      } })
      await transaction.exerciseSet.create({ data: {
        id: exerciseSet.id as string,
        studentId: this.studentId,
        taskId: task.id,
        kind: 'task',
        payload: toInputJson(exerciseSet),
      } })
      await transaction.errorItem.update({
        where: { studentId_id: { studentId: this.studentId, id: error.id } },
        data: storedErrorWrite({ ...current.aggregate, error: linkedError }),
      })
      return { exerciseSet, task, error: linkedError }
    }))
  }
}
