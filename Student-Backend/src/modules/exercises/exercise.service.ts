import { AppError } from '../../common/errors/app-error.js'
import {
  exerciseSetSchema,
  type ExerciseSet,
} from '../../contracts/student-contracts.js'
import type { StudentPrisma } from '../../db/client.js'

type ExerciseKind = 'task' | 'bank'

interface StoredExerciseSetRow {
  id: string
  studentId: string
  taskId: string | null
  kind: string
  payload: unknown
}

function exerciseSetNotFound(): never {
  throw new AppError('Exercise set not found', 404, 'NOT_FOUND')
}

function storedExerciseSetInvalid(cause: unknown): never {
  throw new AppError(
    'Internal server error',
    500,
    'INTERNAL_ERROR',
    null,
    { cause },
  )
}

function parseStoredExerciseSet(
  row: StoredExerciseSetRow,
  expectedKind: ExerciseKind,
): ExerciseSet {
  try {
    const value = exerciseSetSchema.parse(row.payload)
    if (
      (value.id !== undefined && value.id !== row.id) ||
      value.taskId !== row.taskId ||
      row.kind !== expectedKind
    ) {
      return storedExerciseSetInvalid(
        new Error(`Stored exercise set ${row.id} metadata mismatch`),
      )
    }
    return value
  } catch (cause) {
    if (cause instanceof AppError) throw cause
    return storedExerciseSetInvalid(
      new Error(`Invalid stored exercise set ${row.id}`, { cause }),
    )
  }
}

export class ExerciseService {
  constructor(
    private readonly prisma: StudentPrisma,
    private readonly studentId: string,
  ) {}

  async getTaskSet(taskId: string): Promise<ExerciseSet> {
    const rows = await this.prisma.exerciseSet.findMany({
      where: {
        studentId: this.studentId,
        taskId,
        kind: 'task',
      },
      orderBy: { id: 'asc' },
      take: 2,
    })
    const row = rows.at(0)
    if (row === undefined) exerciseSetNotFound()
    if (rows.length !== 1) {
      return storedExerciseSetInvalid(
        new Error(`Multiple task exercise sets found for task ${taskId}`),
      )
    }
    return parseStoredExerciseSet(row, 'task')
  }

  async getBankSet(setId: string): Promise<ExerciseSet> {
    const row = await this.prisma.exerciseSet.findFirst({
      where: {
        studentId: this.studentId,
        id: setId,
        kind: 'bank',
      },
    })
    if (row === null) exerciseSetNotFound()
    return parseStoredExerciseSet(row, 'bank')
  }
}
