import type { z } from 'zod'

import { AppError } from '../../common/errors/app-error.js'
import {
  defaultSettings,
  errorItemSchema,
  exerciseSetSchema,
  greetingSchema,
  learningSummarySchema,
  materialUploadJobSchema,
  moduleStatsSchema,
  noteFolderSchema,
  noteSchema,
  sessionSchema,
  settingsSchema,
  studentSchema,
  taskAdjustmentSchema,
  taskSchema,
  trustedBootstrapDataSchema,
  type BootstrapData,
} from '../../contracts/student-contracts.js'
import type { StudentPrisma } from '../../db/client.js'

function storedDataInvalid(cause: unknown): never {
  throw new AppError(
    'Stored student data is invalid',
    500,
    'STORED_DATA_INVALID',
    null,
    { cause },
  )
}

function parseStored<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  try {
    return schema.parse(value)
  } catch (cause) {
    return storedDataInvalid(new Error(`Invalid stored ${label}`, { cause }))
  }
}

function assertStored(condition: boolean, label: string): asserts condition {
  if (!condition) storedDataInvalid(new Error(`Stored ${label} metadata mismatch`))
}

function isSameInstant(value: string, stored: Date): boolean {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) && parsed === stored.getTime()
}

function isSameNullableInstant(value: string | null, stored: Date | null): boolean {
  if (value === null || stored === null) return value === null && stored === null
  return isSameInstant(value, stored)
}

function keyedRecord<T>(
  entries: Array<{ rowId: string; value: T }>,
): Record<string, T> {
  return Object.fromEntries(entries.map(({ rowId, value }) => [rowId, value]))
}

export class BootstrapService {
  constructor(
    private readonly prisma: StudentPrisma,
    private readonly studentId: string,
  ) {}

  async getBootstrap(): Promise<BootstrapData> {
    return this.prisma.$transaction(async (transaction) => {
      const studentRow = await transaction.student.findUnique({
        where: { id: this.studentId },
      })
      if (studentRow === null) {
        throw new AppError('Student not found', 404, 'NOT_FOUND')
      }

      const taskRows = await transaction.task.findMany({
        where: { studentId: this.studentId },
        orderBy: { id: 'asc' },
      })
      const adjustmentRows = await transaction.taskAdjustment.findMany({
        where: { studentId: this.studentId },
        orderBy: { id: 'asc' },
      })
      const exerciseRows = await transaction.exerciseSet.findMany({
        where: { studentId: this.studentId },
        orderBy: { id: 'asc' },
      })
      const sessionRows = await transaction.session.findMany({
        where: { studentId: this.studentId },
        orderBy: { id: 'asc' },
      })
      const errorRows = await transaction.errorItem.findMany({
        where: { studentId: this.studentId },
        orderBy: { id: 'asc' },
      })
      const noteRows = await transaction.note.findMany({
        where: { studentId: this.studentId },
        orderBy: { id: 'asc' },
      })
      const folderRows = await transaction.noteFolder.findMany({
        where: { studentId: this.studentId },
        orderBy: { id: 'asc' },
      })
      const uploadRows = await transaction.materialUploadJob.findMany({
        where: { studentId: this.studentId },
        orderBy: { id: 'asc' },
      })
      const settingsRow = await transaction.studentSettings.findUnique({
        where: { studentId: this.studentId },
      })

      const student = parseStored(
        studentSchema,
        {
          id: studentRow.id,
          name: studentRow.name,
          avatar: studentRow.avatar,
          joinedDays: studentRow.joinedDays,
          gradeInfo: studentRow.gradeInfo,
        },
        'student',
      )
      const greeting = parseStored(greetingSchema, studentRow.greeting, 'greeting')
      const moduleStats = parseStored(
        moduleStatsSchema,
        studentRow.moduleStats,
        'module stats',
      )
      const learningSummary = parseStored(
        learningSummarySchema,
        studentRow.learningSummary,
        'learning summary',
      )

      const tasks = taskRows.map((row) => {
        const value = parseStored(taskSchema, row.payload, `task ${row.id}`)
        assertStored(
          value.id === row.id &&
            value.type === row.type &&
            value.status === row.status &&
            isSameNullableInstant(value.dueAt, row.dueAt),
          `task ${row.id}`,
        )
        return value
      })

      const taskAdjustments = adjustmentRows.map((row) => {
        const value = parseStored(
          taskAdjustmentSchema,
          row.payload,
          `task adjustment ${row.id}`,
        )
        assertStored(
          value.id === row.id &&
            value.taskId === row.taskId &&
            value.status === row.status &&
            isSameInstant(value.createdAt, row.createdAt),
          `task adjustment ${row.id}`,
        )
        return value
      })

      const parsedExerciseRows = exerciseRows.map((row) => {
        const value = parseStored(exerciseSetSchema, row.payload, `exercise set ${row.id}`)
        assertStored(
          (value.id === undefined || value.id === row.id) && value.taskId === row.taskId,
          `exercise set ${row.id}`,
        )
        assertStored(row.kind === 'task' || row.kind === 'bank', `exercise set ${row.id}`)
        return { rowId: row.id, kind: row.kind, value }
      })

      const parsedSessions = sessionRows.map((row) => {
        const value = parseStored(sessionSchema, row.payload, `session ${row.id}`)
        assertStored(
          value.sessionId === row.id &&
            value.taskId === row.taskId &&
            isSameInstant(value.completedAt, row.submittedAt),
          `session ${row.id}`,
        )
        return { rowId: row.id, value }
      })

      const errors = errorRows.map((row) => {
        const value = parseStored(errorItemSchema, row.payload, `error item ${row.id}`)
        assertStored(
          value.id === row.id &&
            value.questionId === row.questionId &&
            value.status === row.status &&
            isSameInstant(value.lastOccurredAt, row.lastOccurredAt),
          `error item ${row.id}`,
        )
        return value
      })

      const notes = noteRows.map((row) => {
        const value = parseStored(noteSchema, row.payload, `note ${row.id}`)
        assertStored(
          value.id === row.id &&
            value.version === row.version &&
            isSameInstant(value.updatedAt, row.updatedAtValue),
          `note ${row.id}`,
        )
        return value
      })

      const noteFolders = folderRows.map((row) => {
        const value = parseStored(noteFolderSchema, row.payload, `note folder ${row.id}`)
        assertStored(
          value.id === row.id && (value.parentId ?? null) === row.parentId,
          `note folder ${row.id}`,
        )
        return value
      })

      const uploadJobs = uploadRows.map((row) => {
        const value = parseStored(
          materialUploadJobSchema,
          row.payload,
          `material upload job ${row.id}`,
        )
        assertStored(
          value.id === row.id &&
            value.status === row.status &&
            isSameInstant(value.createdAt, row.createdAtValue),
          `material upload job ${row.id}`,
        )
        return value
      })

      const settings =
        settingsRow === null
          ? defaultSettings
          : parseStored(settingsSchema, settingsRow.payload, 'settings')

      const data = {
        student,
        tasks,
        taskAdjustments,
        exerciseSets: keyedRecord(
          parsedExerciseRows.filter(({ kind }) => kind === 'task'),
        ),
        bankExerciseSets: keyedRecord(
          parsedExerciseRows.filter(({ kind }) => kind === 'bank'),
        ),
        sessions: keyedRecord(parsedSessions),
        errors,
        notes,
        uploadJobs,
        noteFolders,
        settings,
        greeting,
        moduleStats,
        learningSummary,
      }

      return parseStored(trustedBootstrapDataSchema, data, 'bootstrap response')
    })
  }
}
