import { AppError } from '../../common/errors/app-error.js'
import {
  taskAdjustmentSchema,
  taskSchema,
  type Task,
  type TaskAdjustment,
} from '../../contracts/student-contracts.js'
import type { StudentPrisma } from '../../db/client.js'
import { toInputJson } from '../../db/json.js'

type Clock = () => Date

interface StoredTaskRow {
  id: string
  studentId: string
  type: string
  status: string
  dueAt: Date | null
  payload: unknown
}

function duplicateTask(): never {
  throw new AppError('Task id already exists', 409, 'DUPLICATE_ID')
}

function duplicateAdjustment(): never {
  throw new AppError(
    'Task adjustment request id already exists',
    409,
    'DUPLICATE_ID',
  )
}

function taskNotFound(): never {
  throw new AppError('Task not found', 404, 'NOT_FOUND')
}

function storedTaskInvalid(cause: unknown): never {
  throw new AppError(
    'Stored student data is invalid',
    500,
    'STORED_DATA_INVALID',
    null,
    { cause },
  )
}

function invalidAdjustment(): never {
  throw new AppError(
    'Adjustment requests are only available for a pending teacher-assigned task without a submitted adjustment.',
    400,
    'INVALID_INPUT',
  )
}

function sameNullableInstant(value: string | null, stored: Date | null): boolean {
  if (value === null || stored === null) return value === null && stored === null
  return Date.parse(value) === stored.getTime()
}

function parseStoredTask(row: StoredTaskRow): Task {
  try {
    const task = taskSchema.parse(row.payload)
    if (
      task.id !== row.id ||
      task.type !== row.type ||
      task.status !== row.status ||
      !sameNullableInstant(task.dueAt, row.dueAt)
    ) {
      return storedTaskInvalid(new Error(`Stored task ${row.id} metadata mismatch`))
    }
    return task
  } catch (cause) {
    if (cause instanceof AppError) throw cause
    return storedTaskInvalid(new Error(`Invalid stored task ${row.id}`, { cause }))
  }
}

function isPrismaUniqueViolation(cause: unknown): boolean {
  return (
    typeof cause === 'object' &&
    cause !== null &&
    'code' in cause &&
    cause.code === 'P2002'
  )
}

function readClock(clock: Clock): Date {
  try {
    const value = clock()
    const milliseconds = Reflect.apply(Date.prototype.getTime, value, []) as number
    if (!Number.isFinite(milliseconds)) throw new TypeError('Clock returned an invalid date')
    return new Date(milliseconds)
  } catch (cause) {
    throw new AppError(
      'Internal server error',
      500,
      'INTERNAL_ERROR',
      null,
      { cause: new Error('Task clock failed', { cause }) },
    )
  }
}

function validateAdjustmentTimes(request: TaskAdjustment, clock: Clock): void {
  const now = readClock(clock).getTime()
  const proposedDueAt = Date.parse(request.proposedDueAt)
  const createdAt = Date.parse(request.createdAt)
  if (proposedDueAt <= now || proposedDueAt <= createdAt) {
    throw new AppError(
      'Proposed due time must be in the future',
      400,
      'INVALID_INPUT',
    )
  }
}

export function isTaskAdjustmentEligible(
  task: Task,
  hasSubmittedAdjustment: boolean,
): boolean {
  return (
    task.status === 'pending' &&
    task.type === 'teacher_assigned' &&
    task.adjustmentStatus !== 'submitted' &&
    !hasSubmittedAdjustment
  )
}

export class TaskService {
  constructor(
    private readonly prisma: StudentPrisma,
    private readonly studentId: string,
    private readonly now: Clock,
  ) {}

  async create(rawTask: Task): Promise<Task> {
    const task = taskSchema.parse(rawTask)

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const student = await transaction.student.findUnique({
          where: { id: this.studentId },
          select: { id: true },
        })
        if (student === null) {
          throw new AppError('Student not found', 404, 'NOT_FOUND')
        }

        const existing = await transaction.task.findUnique({
          where: { studentId_id: { studentId: this.studentId, id: task.id } },
          select: { id: true },
        })
        if (existing !== null) duplicateTask()

        await transaction.task.create({
          data: {
            id: task.id,
            studentId: this.studentId,
            type: task.type,
            status: task.status,
            dueAt: task.dueAt === null ? null : new Date(task.dueAt),
            payload: toInputJson(task),
          },
        })

        return task
      })
    } catch (cause) {
      if (isPrismaUniqueViolation(cause)) duplicateTask()
      throw cause
    }
  }

  async complete(taskId: string): Promise<Task> {
    const initialRow = await this.prisma.task.findUnique({
      where: { studentId_id: { studentId: this.studentId, id: taskId } },
    })
    if (initialRow === null) taskNotFound()
    const initialTask = parseStoredTask(initialRow)
    if (initialTask.status === 'completed') return initialTask

    return this.prisma.$transaction(async (transaction) => {
      const row = await transaction.task.findUnique({
        where: { studentId_id: { studentId: this.studentId, id: taskId } },
      })
      if (row === null) taskNotFound()
      const task = parseStoredTask(row)
      if (task.status === 'completed') return task

      const completedTask = taskSchema.parse({
        ...task,
        status: 'completed',
        completedAt: readClock(this.now).toISOString(),
        isOverdue: false,
      })

      await transaction.task.update({
        where: { studentId_id: { studentId: this.studentId, id: taskId } },
        data: {
          type: completedTask.type,
          status: completedTask.status,
          dueAt:
            completedTask.dueAt === null ? null : new Date(completedTask.dueAt),
          payload: toInputJson(completedTask),
        },
      })

      return completedTask
    })
  }

  async requestAdjustment(
    taskId: string,
    rawRequest: TaskAdjustment,
  ): Promise<{ request: TaskAdjustment; task: Task }> {
    const request = taskAdjustmentSchema.parse(rawRequest)
    if (request.taskId !== taskId) {
      throw new AppError(
        'Task adjustment request taskId must match the target task',
        400,
        'INVALID_INPUT',
      )
    }
    validateAdjustmentTimes(request, this.now)

    const initialRow = await this.prisma.task.findUnique({
      where: { studentId_id: { studentId: this.studentId, id: taskId } },
    })
    if (initialRow === null) taskNotFound()
    const initialTask = parseStoredTask(initialRow)
    const [initialDuplicate, initialSubmitted] = await Promise.all([
      this.prisma.taskAdjustment.findUnique({
        where: {
          studentId_id: { studentId: this.studentId, id: request.id },
        },
        select: { id: true },
      }),
      this.prisma.taskAdjustment.findFirst({
        where: {
          studentId: this.studentId,
          taskId,
          status: 'submitted',
        },
        select: { id: true },
      }),
    ])
    if (initialDuplicate !== null) duplicateAdjustment()
    if (!isTaskAdjustmentEligible(initialTask, initialSubmitted !== null)) {
      invalidAdjustment()
    }

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const row = await transaction.task.findUnique({
          where: { studentId_id: { studentId: this.studentId, id: taskId } },
        })
        if (row === null) taskNotFound()
        const task = parseStoredTask(row)

        const duplicate = await transaction.taskAdjustment.findUnique({
          where: {
            studentId_id: { studentId: this.studentId, id: request.id },
          },
          select: { id: true },
        })
        if (duplicate !== null) duplicateAdjustment()

        const submitted = await transaction.taskAdjustment.findFirst({
          where: {
            studentId: this.studentId,
            taskId,
            status: 'submitted',
          },
          select: { id: true },
        })
        if (!isTaskAdjustmentEligible(task, submitted !== null)) {
          invalidAdjustment()
        }

        const adjustedTask = taskSchema.parse({
          ...task,
          adjustmentStatus: 'submitted',
        })

        await transaction.taskAdjustment.create({
          data: {
            id: request.id,
            studentId: this.studentId,
            taskId,
            status: request.status,
            createdAt: new Date(request.createdAt),
            payload: toInputJson(request),
          },
        })
        await transaction.task.update({
          where: { studentId_id: { studentId: this.studentId, id: taskId } },
          data: {
            type: adjustedTask.type,
            status: adjustedTask.status,
            dueAt:
              adjustedTask.dueAt === null ? null : new Date(adjustedTask.dueAt),
            payload: toInputJson(adjustedTask),
          },
        })

        return { request, task: adjustedTask }
      })
    } catch (cause) {
      if (isPrismaUniqueViolation(cause)) duplicateAdjustment()
      throw cause
    }
  }
}
