import { ZodError } from 'zod'

import { AppError } from '../../common/errors/app-error.js'
import {
  exerciseSetSchema,
  generatedQuestionSchema,
  questionSchema,
  taskSchema,
  type ExerciseSet,
  type Question,
  type Task,
} from '../../contracts/student-contracts.js'
import type { StudentPrisma } from '../../db/client.js'
import { toInputJson } from '../../db/json.js'
import {
  AgentDomainError,
  AgentOutputInvalidError,
  AgentUnavailableError,
} from '../../integrations/student-agent/student-agent.errors.js'
import type { StudentAgentClient } from '../../integrations/student-agent/student-agent.client.js'
import { questionVariantRequestSchema } from '../../integrations/student-agent/student-agent.contracts.js'
import { questionVariantIds, questionVariantOperationKey } from './variant-ids.js'
import { containsRawCarrier } from '../materials/material-rules.js'

export interface VariantSourceSnapshot {
  setId: string
  set: ExerciseSet
  question: Question
  kind: 'task' | 'bank'
}

interface VariantResult {
  exerciseSet: ExerciseSet
  task: Task
}

type Clock = () => Date

const activeQuestionVariants = new Map<string, Promise<VariantResult>>()

function notFound(): never { throw new AppError('Question not found', 404, 'NOT_FOUND') }
function invalidStored(cause: unknown): never {
  throw new AppError('Stored student data is invalid', 500, 'STORED_DATA_INVALID', null, { cause })
}
function conflict(): never {
  throw new AppError('Question variant conflicts with stored data', 409, 'VARIANT_CONFLICT')
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

function sameNullable(value: string | null, stored: string | null): boolean {
  return value === stored
}

function parseSetRow(row: {
  id: string
  taskId: string | null
  kind: string
  payload: unknown
}): ExerciseSet {
  try {
    const set = exerciseSetSchema.parse(row.payload)
    if ((set.id !== undefined && set.id !== row.id) || !sameNullable(set.taskId, row.taskId)) {
      invalidStored(new Error(`Stored exercise set ${row.id} metadata mismatch`))
    }
    if (row.kind !== 'task' && row.kind !== 'bank') invalidStored(new Error(`Stored exercise set ${row.id} kind is invalid`))
    if ((row.kind === 'task' && row.taskId === null) || (row.kind === 'bank' && row.taskId !== null)) {
      invalidStored(new Error(`Stored exercise set ${row.id} task provenance is invalid`))
    }
    return set
  } catch (cause) {
    if (cause instanceof AppError) throw cause
    return invalidStored(new Error(`Invalid stored exercise set ${row.id}`, { cause }))
  }
}

export async function resolveVariantSource(
  prisma: StudentPrisma,
  studentId: string,
  questionId: string,
): Promise<VariantSourceSnapshot> {
  const rows = await prisma.exerciseSet.findMany({
    where: { studentId, kind: { in: ['task', 'bank'] } },
    orderBy: { id: 'asc' },
  })
  const matches: VariantSourceSnapshot[] = []
  for (const row of rows) {
    const set = parseSetRow(row)
    if (row.kind === 'task') {
      const taskRow = await prisma.task.findUnique({ where: { studentId_id: { studentId, id: row.taskId as string } } })
      if (taskRow === null) invalidStored(new Error(`Stored exercise set ${row.id} task is missing`))
      try {
        const task = taskSchema.parse(taskRow.payload)
        if (task.id !== taskRow.id || task.type !== taskRow.type || task.status !== taskRow.status ||
          (task.dueAt === null ? taskRow.dueAt !== null : Date.parse(task.dueAt) !== taskRow.dueAt?.getTime()) ||
          task.exerciseSetId !== row.id) invalidStored(new Error(`Stored task ${taskRow.id} metadata mismatch`))
      } catch (cause) {
        if (cause instanceof AppError) throw cause
        invalidStored(new Error(`Invalid stored task ${taskRow.id}`, { cause }))
      }
    }
    const questions = set.questions.filter(({ id }) => id === questionId)
    if (questions.length > 1) invalidStored(new Error(`Question ${questionId} is duplicated inside set ${row.id}`))
    const question = questions[0]
    if (question !== undefined) matches.push({ setId: row.id, set, question, kind: row.kind as 'task' | 'bank' })
  }
  if (matches.length === 0) notFound()
  if (matches.length !== 1) invalidStored(new Error(`Question ${questionId} is ambiguous`))
  return matches[0] as VariantSourceSnapshot
}

export function sameVariantSource(left: VariantSourceSnapshot, right: VariantSourceSnapshot): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function parseStoredResult(
  taskRow: { id: string; type: string; status: string; dueAt: Date | null; payload: unknown },
  setRow: { id: string; taskId: string | null; kind: string; payload: unknown },
  expected: VariantResult,
): VariantResult {
  try {
    const task = taskSchema.parse(taskRow.payload)
    const exerciseSet = exerciseSetSchema.parse(setRow.payload)
    if (
      taskRow.id !== expected.task.id || taskRow.type !== task.type || taskRow.status !== task.status ||
      taskRow.dueAt !== null || setRow.id !== expected.exerciseSet.id || setRow.taskId !== expected.task.id ||
      setRow.kind !== 'task' || JSON.stringify({ exerciseSet, task }) !== JSON.stringify(expected)
    ) conflict()
    return { exerciseSet, task }
  } catch (cause) {
    if (cause instanceof AppError) throw cause
    return conflict()
  }
}

export class QuestionVariantService {
  constructor(
    private readonly prisma: StudentPrisma,
    private readonly studentId: string,
    private readonly now: Clock,
    private readonly agent: StudentAgentClient,
    private readonly processScope: string,
  ) {}

  async create(questionId: string): Promise<VariantResult> {
    const key = `${this.processScope}\0${this.studentId}\0${questionId}`
    const active = activeQuestionVariants.get(key)
    if (active !== undefined) return active
    const operation = this.createOnce(questionId)
    activeQuestionVariants.set(key, operation)
    try { return await operation } finally {
      if (activeQuestionVariants.get(key) === operation) activeQuestionVariants.delete(key)
    }
  }

  private async createOnce(questionId: string): Promise<VariantResult> {
    const source = await resolveVariantSource(this.prisma, this.studentId, questionId)
    const existing = await this.readExisting(questionId, source)
    if (existing !== null) return existing

    const request = questionVariantRequestSchema.parse({
      contractVersion: 1,
      operationKey: questionVariantOperationKey(this.studentId, questionId),
      studentId: this.studentId,
      source: { setId: source.setId, kind: source.kind, subject: source.set.subject, question: source.question },
    })

    let generated
    try {
      generated = generatedQuestionSchema.parse(await this.agent.generateQuestionVariant(request))
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

    const ids = questionVariantIds(this.studentId, questionId)
    const createdAt = readClock(this.now)
    const exerciseSet = exerciseSetSchema.parse({
      id: ids.setId,
      taskId: ids.taskId,
      title: `Independent transfer: ${source.question.topic}`,
      subject: source.set.subject,
      questions: [questionSchema.parse({ ...generated, id: ids.questionId, order: 1, variantOf: questionId, sourceQuestionId: questionId })],
      sourceQuestionId: questionId,
      createdAt,
    })
    const task = taskSchema.parse({
      id: ids.taskId, title: exerciseSet.title, type: 'error_review', subject: exerciseSet.subject,
      estimatedMinutes: 15, dueAt: null, assignedBy: null, priority: 'P1', isOverdue: false,
      status: 'pending', exerciseSetId: ids.setId, sourceQuestionId: questionId,
      reason: 'Independent transfer check', createdAt,
    })
    const expected = { exerciseSet, task }

    return this.prisma.$transaction(async (transaction) => {
      const current = await resolveVariantSource(transaction as StudentPrisma, this.studentId, questionId)
      if (!sameVariantSource(source, current)) conflict()
      const [taskRow, setRow] = await Promise.all([
        transaction.task.findUnique({ where: { studentId_id: { studentId: this.studentId, id: ids.taskId } } }),
        transaction.exerciseSet.findUnique({ where: { studentId_id: { studentId: this.studentId, id: ids.setId } } }),
      ])
      if (taskRow !== null || setRow !== null) {
        if (taskRow === null || setRow === null) conflict()
        return parseStoredResult(taskRow, setRow, expected)
      }
      await transaction.task.create({ data: {
        id: task.id, studentId: this.studentId, type: task.type, status: task.status, dueAt: null, payload: toInputJson(task),
      } })
      await transaction.exerciseSet.create({ data: {
        id: exerciseSet.id as string, studentId: this.studentId, taskId: task.id, kind: 'task', payload: toInputJson(exerciseSet),
      } })
      return expected
    })
  }

  private async readExisting(questionId: string, source: VariantSourceSnapshot): Promise<VariantResult | null> {
    const ids = questionVariantIds(this.studentId, questionId)
    const [taskRow, setRow] = await Promise.all([
      this.prisma.task.findUnique({ where: { studentId_id: { studentId: this.studentId, id: ids.taskId } } }),
      this.prisma.exerciseSet.findUnique({ where: { studentId_id: { studentId: this.studentId, id: ids.setId } } }),
    ])
    if (taskRow === null && setRow === null) return null
    if (taskRow === null || setRow === null) conflict()
    try {
      const exerciseSet = exerciseSetSchema.parse(setRow.payload)
      const task = taskSchema.parse(taskRow.payload)
      const question = exerciseSet.questions[0]
      if (
        !sameVariantSource(source, await resolveVariantSource(this.prisma, this.studentId, questionId)) || exerciseSet.questions.length !== 1 ||
        question?.id !== ids.questionId || question.variantOf !== questionId || question.sourceQuestionId !== questionId ||
        task.id !== ids.taskId || task.title !== `Independent transfer: ${source.question.topic}` || task.type !== 'error_review' ||
        task.subject !== source.set.subject || task.estimatedMinutes !== 15 || task.dueAt !== null || task.assignedBy !== null ||
        task.priority !== 'P1' || task.isOverdue || task.status !== 'pending' || task.reason !== 'Independent transfer check' ||
        task.sourceQuestionId !== questionId || task.exerciseSetId !== ids.setId || exerciseSet.id !== ids.setId ||
        exerciseSet.taskId !== ids.taskId || exerciseSet.title !== task.title || exerciseSet.subject !== task.subject ||
        exerciseSet.sourceQuestionId !== questionId || setRow.kind !== 'task' || setRow.taskId !== ids.taskId ||
        taskRow.id !== task.id || taskRow.type !== task.type || taskRow.status !== task.status || taskRow.dueAt !== null
      ) conflict()
      return { exerciseSet, task }
    } catch (cause) {
      if (cause instanceof AppError) throw cause
      return conflict()
    }
  }
}
