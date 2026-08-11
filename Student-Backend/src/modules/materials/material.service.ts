import { AppError } from '../../common/errors/app-error.js'
import { ZodError } from 'zod'
import {
  materialClassificationResultSchema,
  materialUploadJobSchema,
  noteSchema,
  type MaterialClassificationResult,
  type MaterialUploadJob,
  type Note,
} from '../../contracts/student-contracts.js'
import type { StudentPrisma } from '../../db/client.js'
import { toInputJson } from '../../db/json.js'
import {
  containsRawCarrier,
  parseMaterialClassificationPatch,
  parseMaterialMetadata,
} from './material-rules.js'
import { materialJobIdSchema } from '../../contracts/student-contracts.js'
import { Prisma } from '../../generated/prisma/client.js'

type Clock = () => Date
type IdFactory = () => string

interface StoredMaterialRow {
  id: string
  studentId: string
  status: string
  createdAtValue: Date
  payload: unknown
}

function duplicate(): never { throw new AppError('Material upload id already exists', 409, 'DUPLICATE_ID') }
function duplicateNote(): never { throw new AppError('Note id already exists', 409, 'DUPLICATE_ID') }
function notFound(): never { throw new AppError('Material upload not found', 404, 'NOT_FOUND') }
function completed(): never { throw new AppError('This upload is already completed', 409, 'UPLOAD_ALREADY_COMPLETED') }
function cancelled(): never { throw new AppError('This upload was cancelled', 409, 'UPLOAD_CANCELLED') }
function invalidState(): never { throw new AppError('Only uploads awaiting confirmation can be confirmed', 409, 'INVALID_JOB_STATE') }
function invalidPatch(): never { throw new AppError('Classification patch contains invalid fields', 400, 'INVALID_CLASSIFICATION_PATCH') }
function invalidStored(cause: unknown): never {
  throw new AppError('Stored student data is invalid', 500, 'STORED_DATA_INVALID', null, { cause })
}

function isPrismaCode(cause: unknown, ...codes: string[]): boolean {
  return typeof cause === 'object' && cause !== null && 'code' in cause && typeof cause.code === 'string' && codes.includes(cause.code)
}

const transactionRetryDelaysMs = [25, 50, 100, 200] as const

function isTransientTransactionContention(cause: unknown): boolean {
  if (cause instanceof AppError || cause instanceof ZodError) return false
  return cause instanceof Prisma.PrismaClientKnownRequestError &&
    (cause.code === 'P1008' || cause.code === 'P2034')
}

function waitForRetry(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
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

function readId(factory: IdFactory): string {
  try {
    const id = factory()
    if (typeof id !== 'string' || !materialJobIdSchema.safeParse(id).success) {
      throw new TypeError('Invalid generated id')
    }
    return id
  } catch (cause) {
    throw new AppError('Internal server error', 500, 'INTERNAL_ERROR', null, { cause })
  }
}

function parseStored(row: StoredMaterialRow): MaterialUploadJob {
  try {
    const job = materialUploadJobSchema.parse(row.payload)
    if (job.id !== row.id || job.status !== row.status || Date.parse(job.createdAt) !== row.createdAtValue.getTime()) {
      return invalidStored(new Error(`Stored material ${row.id} metadata mismatch`))
    }
    if (job.result !== undefined && containsRawCarrier(job.result)) {
      return invalidStored(new Error(`Stored material ${row.id} contains a raw carrier`))
    }
    return job
  } catch (cause) {
    if (cause instanceof AppError) throw cause
    return invalidStored(new Error(`Invalid stored material ${row.id}`, { cause }))
  }
}

function parseConfirmedResult(value: unknown): MaterialClassificationResult {
  try {
    const result = materialClassificationResultSchema.parse(value)
    if (containsRawCarrier(result)) invalidPatch()
    return result
  } catch (cause) {
    if (cause instanceof AppError) throw cause
    return invalidPatch()
  }
}

function deriveNoteSource(materialType: MaterialClassificationResult['materialType']): Note['source'] {
  if (materialType === 'handwritten_draft') return 'handwritten'
  if (materialType === 'error_photo') return 'photo'
  return 'typed'
}

function createConfirmationNote(job: MaterialUploadJob, result: MaterialClassificationResult): Note {
  try {
    return noteSchema.parse({
      id: `note-${job.id}`,
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
      sourceJobId: job.id,
      source: deriveNoteSource(result.materialType),
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      version: 1,
      versions: [],
    })
  } catch (cause) {
    return invalidStored(new Error(`Stored material ${job.id} cannot create a valid note`, { cause }))
  }
}

export class MaterialService {
  constructor(
    private readonly prisma: StudentPrisma,
    private readonly studentId: string,
    private readonly now: Clock,
    private readonly createId: IdFactory,
  ) {}

  private async retry<T>(operation: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      try { return await operation() } catch (cause) {
        const delay = transactionRetryDelaysMs[attempt]
        if (!isTransientTransactionContention(cause) || delay === undefined) throw cause
        await waitForRetry(delay)
      }
    }
  }

  async create(input: unknown): Promise<MaterialUploadJob> {
    const metadata = parseMaterialMetadata(input)
    const id = metadata.id ?? readId(this.createId)
    const createdAt = metadata.createdAt ?? readClock(this.now)
    const job = materialUploadJobSchema.parse({ ...metadata, id, createdAt, updatedAt: createdAt, progress: 0, status: 'queued' })
    try {
      return await this.retry(() => this.prisma.$transaction(async (transaction) => {
        const student = await transaction.student.findUnique({ where: { id: this.studentId }, select: { id: true } })
        if (student === null) throw new AppError('Student not found', 404, 'NOT_FOUND')
        await transaction.materialUploadJob.create({
          data: { id: job.id, studentId: this.studentId, status: job.status, createdAtValue: new Date(job.createdAt), payload: toInputJson(job) },
        })
        return job
      }))
    } catch (cause) {
      if (isPrismaCode(cause, 'P2002')) duplicate()
      throw cause
    }
  }

  async cancel(id: string): Promise<MaterialUploadJob> {
    return this.retry(() => this.prisma.$transaction(async (transaction) => {
      const row = await transaction.materialUploadJob.findUnique({ where: { studentId_id: { studentId: this.studentId, id } } })
      if (row === null) notFound()
      const job = parseStored(row)
      if (job.status === 'completed') completed()
      if (job.status === 'cancelled') return job
      const { failure: _failure, result: _result, ...base } = job
      const cancelled = materialUploadJobSchema.parse({ ...base, status: 'cancelled', updatedAt: readClock(this.now) })
      await transaction.materialUploadJob.update({
        where: { studentId_id: { studentId: this.studentId, id } },
        data: { status: cancelled.status, payload: toInputJson(cancelled) },
      })
      return cancelled
    }))
  }

  async confirm(id: string, rawPatch: unknown): Promise<{ job: MaterialUploadJob; note: Note }> {
    const patch = parseMaterialClassificationPatch(rawPatch)
    try {
      return await this.retry(() => this.prisma.$transaction(async (transaction) => {
        const row = await transaction.materialUploadJob.findUnique({
          where: { studentId_id: { studentId: this.studentId, id } },
        })
        if (row === null) notFound()
        const job = parseStored(row)
        if (job.status === 'cancelled') cancelled()
        if (job.status === 'completed') completed()
        if (job.status !== 'needs_confirmation') invalidState()
        if (job.result === undefined) invalidStored(new Error(`Stored material ${id} is missing result`))

        const result = parseConfirmedResult({ ...job.result, ...patch })
        const note = createConfirmationNote(job, result)
        const confirmed = materialUploadJobSchema.parse({
          ...job,
          materialType: result.materialType,
          examBoard: result.examBoard,
          subject: result.subject,
          chapter: result.chapter,
          folderId: result.folderId,
          folderPath: result.folderPath,
          status: 'completed',
          progress: 100,
          result,
        })
        const existingNote = await transaction.note.findUnique({
          where: { studentId_id: { studentId: this.studentId, id: note.id } }, select: { id: true },
        })
        if (existingNote !== null) duplicateNote()
        await transaction.note.create({
          data: {
            id: note.id, studentId: this.studentId, version: note.version,
            updatedAtValue: new Date(note.updatedAt), payload: toInputJson(note),
          },
        })
        await transaction.materialUploadJob.update({
          where: { studentId_id: { studentId: this.studentId, id } },
          data: { status: confirmed.status, payload: toInputJson(confirmed) },
        })
        return { job: confirmed, note }
      }))
    } catch (cause) {
      if (isPrismaCode(cause, 'P2002')) duplicateNote()
      throw cause
    }
  }
}
